// Overrides de pose appliqués APRÈS mixer.update : le mixer réécrit les os à
// chaque frame, on superpose donc ici le regard (headYaw/headPitch calculés
// par systems/passengers), le bras levé vers la poignée (tsurikawa), la pose
// téléphone, et une assise manuelle de secours si le pack n'a pas de clip
// assis. Technique : « aim » en espace monde - on oriente l'axe +Y de l'os
// (convention glTF/Blender : l'os pointe vers son enfant) vers une cible,
// avec un poids lissé pour des transitions douces.

import * as THREE from 'three';
import type { Pax } from '../../systems/passengers';
import type { CharacterClone } from './library';
import { ACTION_BY_ID, isFallingAction, type MotionId, type PaxAction } from '../../data/paxActions';

// Géométrie des tsurikawa, reprise de three/Handles.tsx : rangées en
// x = ±0,45, anneaux tous les 0,451 m à partir de z = -9,35 ; centre d'anneau
// à 1,77 m (barre à 2,0 m, attache courte - anneaux remontés pour que le
// joueur ne se les prenne plus dans la tête). L'anneau est un TRIANGLE pointe
// en haut : on l'agrippe par sa barre BASSE, à centre - R/2.
const STRAP_RING_Y = 1.77;
const STRAP_BAR_Y = STRAP_RING_Y - 0.058; // barre basse du triangle (R = 0,116)
const STRAP_ROW_X = 0.45;
const STRAP_PITCH = 0.451;
const STRAP_Z0 = -9.35;
// Un humain n'attrape pas la poignée à l'aplomb de son crâne (bras vertical
// collé à la tête) : il saisit celle qui pend DEVANT son visage - l'élection
// de l'anneau (portée du bras à l'appui) se fait dans le bloc poignée.
// Fenêtre d'élection, mesurée DEVANT le porteur : jamais moins que la première
// borne (bras collé à la tête), jamais plus que la seconde (un pas de grille,
// donc toujours un candidat quand un anneau tombe dans la fenêtre).
const STRAP_AHEAD_MIN = 0.03;
const STRAP_AHEAD_MAX = 0.481;
// Marge de portée ajoutée à la longueur épaule → poignet : le solveur hausse
// l'épaule quand le bras est trop court, et ce sont les DOIGTS qui se ferment
// sur la barre, quelques centimètres au-dessus du poignet. Sans elle, les
// gabarits du pack (bras courts, ~0,37 m) sont déclarés hors d'atteinte de
// TOUT anneau et le repli tombait sur celui de derrière.
const STRAP_STRETCH = 0.11;

// Poids lissés par passager (persistent entre frames).
export interface PoseState {
  strapW: number;
  phoneW: number;
  phoneSide: 1 | -1; // main du téléphone : 1 droite (défaut), -1 gauche
  sitW: number;
  /** Geste de bras engagé (motion du catalogue), '' si les bras sont libres. */
  gesture: MotionId | '';
  gestureW: number;
  /** Bras qui porte un geste à une main : 1 droite, -1 gauche. */
  gestureSide: 1 | -1;
}

export function makePoseState(): PoseState {
  return { strapW: 0, phoneW: 0, phoneSide: 1, sitW: 0, gesture: '', gestureW: 0, gestureSide: 1 };
}

// Temporaires des APPELANTS (cibles, directions). aimBone a les siens : il ne
// doit JAMAIS partager ceux-ci, sinon une boucle « viser les deux jambes »
// voit sa direction écrasée entre la première et la seconde.
const vBonePos = new THREE.Vector3();
const vDir = new THREE.Vector3();
const vTarget = new THREE.Vector3();
const vChest = new THREE.Vector3();
const vFoot = new THREE.Vector3();
const mParentInv = new THREE.Matrix4();
const qWrap = new THREE.Quaternion();
const qWrapOnly = new THREE.Quaternion();
const qLTarget = new THREE.Quaternion();
const qMirror = new THREE.Quaternion();
const qRestW = new THREE.Quaternion();
const qRoll = new THREE.Quaternion();
const vFing = new THREE.Vector3();
const vPalmCur = new THREE.Vector3();
const vPalmTgt = new THREE.Vector3();
const vCross = new THREE.Vector3();
const NEG_Z = new THREE.Vector3(0, 0, -1);
// Temporaires PRIVÉS de aimBone / poseBone.
const aPos = new THREE.Vector3();
const aDir = new THREE.Vector3();
const aTo = new THREE.Vector3();
const qWorld = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qDelta = new THREE.Quaternion();
const qNew = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Oriente l'axe +Y de l'os vers targetWorld, avec un poids 0..1.
function aimBone(bone: THREE.Bone, targetWorld: THREE.Vector3, weight: number): void {
  if (weight <= 0.001) return;
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(qWorld);
  bone.getWorldPosition(aPos);
  aDir.copy(Y_AXIS).applyQuaternion(qWorld);
  aTo.subVectors(targetWorld, aPos);
  if (aTo.lengthSq() < 1e-6) return;
  aTo.normalize();
  qDelta.setFromUnitVectors(aDir, aTo);
  qNew.copy(qDelta).multiply(qWorld);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(qParent).invert();
    qNew.premultiply(qParent);
  }
  bone.quaternion.slerp(qNew, weight);
}

// Réaligne l'axe +Y d'une orientation monde sur (dx, dy, dz), en conservant
// son roulis (rotation minimale).
function alignY(q: THREE.Quaternion, dx: number, dy: number, dz: number, out: THREE.Quaternion): THREE.Quaternion {
  aDir.copy(Y_AXIS).applyQuaternion(q);
  aTo.set(dx, dy, dz).normalize();
  qDelta.setFromUnitVectors(aDir, aTo);
  return out.copy(qDelta).multiply(q);
}

// Orientation monde cible : axe +Y de l'os vers (dx, dy, dz), roulis hérité du
// REPOS (relatif à la poitrine) plutôt que de la pose du clip.
function worldTarget(qRest: THREE.Quaternion, qRefWorld: THREE.Quaternion, dx: number, dy: number, dz: number, out: THREE.Quaternion): THREE.Quaternion {
  qRestW.copy(qRefWorld).multiply(qRest);
  return alignY(qRestW, dx, dy, dz, out);
}

// Applique une orientation MONDE à l'os (convertie en local), lissée.
function applyWorld(bone: THREE.Bone, qTargetWorld: THREE.Quaternion, weight: number): void {
  qNew.copy(qTargetWorld);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(qParent).invert();
    qNew.premultiply(qParent);
  }
  bone.quaternion.slerp(qNew, weight);
}

// Fait tourner une orientation MONDE autour de son axe +Y (doigts) pour que
// la PAUME regarde au mieux la direction demandée. Convention des packs
// Quaternius, vérifiée à la probe (main à plat sur le genou, trièdre ?axes=) :
// +Z de l'os de main = DOS de la main, la paume est côté -Z. Le roulis est
// RÉSOLU (angle signé dans le plan ⊥ doigts) : contrairement au roulis «
// minimal » de setFromUnitVectors, il reste défini même quand l'os a été
// retourné de ~180° depuis son repos.
function solvePalmRoll(q: THREE.Quaternion, dx: number, dy: number, dz: number): void {
  vFing.copy(Y_AXIS).applyQuaternion(q);
  vPalmCur.copy(NEG_Z).applyQuaternion(q);
  vPalmCur.addScaledVector(vFing, -vPalmCur.dot(vFing));
  vPalmTgt.set(dx, dy, dz);
  vPalmTgt.addScaledVector(vFing, -vPalmTgt.dot(vFing));
  if (vPalmCur.lengthSq() < 1e-8 || vPalmTgt.lengthSq() < 1e-8) return;
  vPalmCur.normalize();
  vPalmTgt.normalize();
  vCross.crossVectors(vPalmCur, vPalmTgt);
  qRoll.setFromAxisAngle(vFing, Math.atan2(vCross.dot(vFing), vPalmCur.dot(vPalmTgt)));
  q.premultiply(qRoll);
}

// Miroir sagittal d'une orientation monde : exprimée en espace wrap (le
// personnage y fait face à +Z, plan de symétrie x=0), réfléchie (x, -y, -z, w),
// puis ramenée en monde.
function mirrorWorld(q: THREE.Quaternion, qWrapWorld: THREE.Quaternion, out: THREE.Quaternion): THREE.Quaternion {
  out.copy(qWrapWorld).invert().multiply(q);
  out.set(out.x, -out.y, -out.z, out.w);
  return out.premultiply(qWrapWorld);
}

function lerpW(current: number, target: number, k: number): number {
  return current + (target - current) * k;
}

// Sommet du crâne du squelette normalisé (cf. systems/appearance) : convertit
// une hauteur de pivot exprimée en fraction de la taille vers des mètres.
const SKELETON_TOP = 1.445;
const vPivotUp = new THREE.Vector3();

/**
 * Déplace le groupe pour que la rotation se fasse autour d'un point situé à
 * `pivot` × taille du corps, et non autour de l'origine du groupe (les PIEDS).
 *
 * Une inclinaison légère pivote bien aux chevilles - c'est le cas par défaut,
 * pivot = 0. Une chute, non : basculée aux pieds, elle COUCHE le corps en le
 * translatant d'un mètre et demi sur le côté. Le voyageur au sol finissait
 * dans la banquette ou au travers de la caisse, invisible depuis l'allée.
 *
 * `wrap.rotation` doit être posée avant l'appel.
 */
export function applyBodyPivot(wrap: THREE.Object3D, pivot: number, height: number): void {
  if (pivot <= 0.001) return;
  const h = pivot * SKELETON_TOP * height;
  vPivotUp.set(0, 1, 0).applyEuler(wrap.rotation);
  wrap.position.x -= h * vPivotUp.x;
  wrap.position.y += h * (1 - vPivotUp.y);
  wrap.position.z -= h * vPivotUp.z;
}

// --- Gestes des bras ------------------------------------------------------
//
// Un seul geste avait son rig : le téléphone. Les soixante-cinq occupations
// ajoutées depuis ne bougeaient que la tête et le buste - on « se grattait la
// tête » les bras ballants, on « regardait sa montre » sans lever le poignet,
// on se prenait le visage sans main, on se battait sans bras. Chaque motion du
// catalogue reçoit donc ici les directions de ses trois os.
//
// Directions cibles (axe +Y de chaque os) construites pour le bras GAUCHE en
// espace wrap (+X = gauche du PNJ, +Y en haut, +Z devant lui) ; le bras droit
// reçoit le MIROIR SAGITTAL exact du résultat gauche - seule référence fiable
// de ces rigs, dont la bind pose n'est pas symétrique et dont les clips le
// sont encore moins.
interface Dir {
  x: number;
  y: number;
  z: number;
}

/**
 * Clé d'un bras animé dans le temps (chutes) : les directions ci-dessous ne
 * valent qu'à l'instant `t` de l'action, et `w` dit quelle part le geste prend
 * au clip - 0 rend les bras à l'animation du pack.
 */
interface ArmKey {
  /** Secondes depuis le début de l'action. */
  t: number;
  /** Poids du geste à cette clé (0..1). */
  w: number;
  upper: Dir;
  fore: Dir;
  hand: Dir;
  palm?: Dir;
}

interface ArmGesture {
  /** Épaule → coude. */
  upper: Dir;
  /** Coude → poignet. */
  fore: Dir;
  /** Poignet → doigts. */
  hand: Dir;
  /** Direction que doit regarder la PAUME (sinon roulis de bind). */
  palm?: Dir;
  /**
   * Bras ANIMÉS, quand un clip du pack joue déjà la chute (characters/fall.ts).
   * Le clip « Death » dont on tire la chute est une mort par balle : les bras y
   * partent en arrière au lieu de chercher à se rattraper. On les reprend donc
   * le temps de la bascule - moulinet, puis mains tendues vers le sol - et on
   * les rend au clip à l'impact, dont le contrecoup est très bien tel quel.
   * Sans clip de chute (repli rigide), ce sont les directions fixes qui servent.
   */
  keys?: readonly ArmKey[];
  /** Assis, le coude tombe sur la cuisse : variantes facultatives. */
  upperSit?: Dir;
  foreSit?: Dir;
  /** Les deux bras (miroir), sinon un seul. */
  both?: boolean;
  /** Bras imposé (1 droite, -1 gauche) quand le regard vise déjà ce côté. */
  side?: 1 | -1;
  /** Va-et-vient : ± amp ajouté à une composante, avant normalisation. */
  swing?: { on: 'upper' | 'fore' | 'hand'; axis: 'x' | 'y' | 'z'; amp: number; freq: number };
  /** Déphase les deux protagonistes d'un duo (dispute, bagarre, bousculade). */
  roleShift?: boolean;
  /** Le geste tient un objet : pilote l'affichage de la prop (props.ts). */
  prop?: boolean;
}

// Repères récurrents, pour que les gestes d'une même famille se ressemblent.
const ARM_DOWN: Dir = { x: 0.1, y: -0.9, z: 0.18 }; // le long du buste
const ARM_DOWN_SIT: Dir = { x: 0.1, y: -0.78, z: 0.36 }; // assis : coude vers la cuisse
const ARM_OUT: Dir = { x: 0.42, y: -0.78, z: 0.2 }; // coude écarté du corps
const FORE_UP_FACE: Dir = { x: -0.3, y: 0.86, z: 0.32 }; // avant-bras vers le visage
const PALM_TO_FACE: Dir = { x: 0.05, y: -0.1, z: -0.95 }; // paume tournée vers soi
// Assis par terre après une chute : on se tient sur les mains, posées au sol
// EN ARRIÈRE des hanches, bras tendus, paumes à plat.
const PROP_UPPER: Dir = { x: 0.34, y: -0.62, z: -0.7 };
const PROP_FORE: Dir = { x: 0.2, y: -0.88, z: -0.42 };
const PROP_HAND: Dir = { x: 0.16, y: -0.92, z: -0.34 };
const PALM_DOWN: Dir = { x: 0, y: -0.95, z: 0.2 };

/**
 * Rig de chaque occupation. Une motion absente = bras laissés au clip (repos,
 * mains dans les poches, assise) : c'est le cas voulu pour tout ce qui ne se
 * joue pas avec les mains (regards, somnolence, balancement, marche…).
 */
const ARM_GESTURES: Partial<Record<MotionId, ArmGesture>> = {
  // - Objets tenus : la pose historique du téléphone, déclinée par objet -
  phone: {
    upper: ARM_DOWN,
    upperSit: ARM_DOWN_SIT,
    fore: { x: -0.18, y: 0.25, z: 0.8 },
    foreSit: { x: -0.18, y: 0.02, z: 0.85 },
    hand: { x: -0.45, y: 0.1, z: 0.75 },
    palm: { x: 0.05, y: 0.85, z: -0.52 },
    prop: true,
  },
  read: {
    // Livre tenu à deux mains, un peu plus bas et plus près que le téléphone.
    upper: { x: 0.14, y: -0.86, z: 0.28 },
    upperSit: { x: 0.14, y: -0.74, z: 0.42 },
    fore: { x: -0.3, y: 0.3, z: 0.82 },
    foreSit: { x: -0.3, y: 0.08, z: 0.86 },
    hand: { x: -0.5, y: 0.15, z: 0.7 },
    palm: { x: 0.05, y: 0.8, z: -0.58 },
    both: true,
    prop: true,
  },
  map: {
    // Plan déplié : les deux mains écartées devant la poitrine.
    upper: { x: 0.3, y: -0.8, z: 0.3 },
    fore: { x: -0.1, y: 0.35, z: 0.85 },
    hand: { x: -0.25, y: 0.2, z: 0.8 },
    palm: { x: 0.05, y: 0.7, z: -0.65 },
    both: true,
    prop: true,
  },
  ticket: {
    // Billet pincé, remonté à hauteur d'œil, tête déjà tournée vers lui.
    upper: { x: 0.12, y: -0.82, z: 0.32 },
    fore: { x: -0.42, y: 0.62, z: 0.55 },
    hand: { x: -0.6, y: 0.35, z: 0.5 },
    palm: { x: 0.1, y: 0.5, z: -0.8 },
    side: -1,
    prop: true,
  },
  drink: {
    // Bouteille portée à la bouche : coude haut, poignet cassé vers soi.
    upper: { x: 0.2, y: -0.72, z: 0.4 },
    fore: FORE_UP_FACE,
    hand: { x: -0.32, y: 0.72, z: 0.1 },
    palm: { x: -0.15, y: 0.2, z: -0.9 },
    prop: true,
  },
  share: {
    // Téléphone tendu vers le voisin : bras plus ouvert que la pose solo.
    upper: { x: 0.34, y: -0.76, z: 0.3 },
    fore: { x: -0.5, y: 0.3, z: 0.72 },
    hand: { x: -0.7, y: 0.15, z: 0.6 },
    palm: { x: 0.1, y: 0.8, z: -0.5 },
    prop: true,
  },
  photo: {
    // Deux mains montées devant le visage, coudes ouverts.
    upper: { x: 0.4, y: -0.66, z: 0.42 },
    fore: { x: -0.18, y: 0.62, z: 0.7 },
    hand: { x: -0.3, y: 0.4, z: 0.75 },
    palm: { x: 0.05, y: 0.55, z: -0.75 },
    both: true,
    prop: true,
  },

  // - Main au visage -
  sneeze: { upper: ARM_OUT, fore: FORE_UP_FACE, hand: { x: -0.4, y: 0.7, z: -0.05 }, palm: PALM_TO_FACE },
  cough: { upper: ARM_OUT, fore: FORE_UP_FACE, hand: { x: -0.45, y: 0.65, z: 0 }, palm: PALM_TO_FACE },
  yawn: { upper: ARM_OUT, fore: FORE_UP_FACE, hand: { x: -0.5, y: 0.62, z: 0.05 }, palm: PALM_TO_FACE },
  sniffle: { upper: ARM_OUT, fore: FORE_UP_FACE, hand: { x: -0.35, y: 0.75, z: 0.1 }, palm: PALM_TO_FACE },
  gasp: { upper: ARM_OUT, fore: FORE_UP_FACE, hand: { x: -0.45, y: 0.68, z: 0.05 }, palm: PALM_TO_FACE },
  rubEyes: {
    upper: { x: 0.34, y: -0.72, z: 0.34 },
    fore: { x: -0.25, y: 0.9, z: 0.28 },
    hand: { x: -0.3, y: 0.78, z: 0.15 },
    palm: PALM_TO_FACE,
    both: true,
    swing: { on: 'hand', axis: 'x', amp: 0.12, freq: 5.5 },
  },
  facepalm: {
    // Paume plaquée sur le front, coude en avant : le geste se lit de loin.
    upper: { x: 0.24, y: -0.62, z: 0.55 },
    fore: { x: -0.2, y: 0.9, z: 0.2 },
    hand: { x: -0.25, y: 0.85, z: -0.1 },
    palm: PALM_TO_FACE,
  },
  wipe: {
    upper: ARM_OUT,
    fore: { x: -0.25, y: 0.92, z: 0.2 },
    hand: { x: -0.55, y: 0.72, z: 0.05 },
    palm: PALM_TO_FACE,
    swing: { on: 'hand', axis: 'x', amp: 0.4, freq: 4 },
  },
  adjust: {
    // Masque repincé sur le nez.
    upper: ARM_OUT,
    fore: FORE_UP_FACE,
    hand: { x: -0.4, y: 0.72, z: 0.1 },
    palm: PALM_TO_FACE,
    swing: { on: 'hand', axis: 'y', amp: 0.12, freq: 4.5 },
  },
  glasses: {
    // Branche remontée : deux doigts sur l'arête du nez.
    upper: ARM_OUT,
    fore: { x: -0.35, y: 0.85, z: 0.35 },
    hand: { x: -0.5, y: 0.6, z: 0.25 },
    palm: PALM_TO_FACE,
    side: 1,
  },
  scratch: {
    // Main sur le haut du crâne : coude ouvert À HAUTEUR D'ÉPAULE, sans quoi
    // l'avant-bras part d'une épaule basse et la main s'arrête à la joue.
    upper: { x: 0.86, y: 0.1, z: 0.02 },
    fore: { x: -0.42, y: 0.86, z: -0.15 },
    hand: { x: -0.72, y: 0.5, z: -0.3 },
    palm: { x: -0.3, y: -0.4, z: 0.5 },
    side: -1,
    swing: { on: 'hand', axis: 'x', amp: 0.22, freq: 9 },
  },
  earbud: {
    // Doigt sur l'écouteur, tête déjà penchée de ce côté.
    upper: { x: 0.8, y: -0.1, z: 0.1 },
    fore: { x: -0.3, y: 0.9, z: -0.05 },
    hand: { x: -0.6, y: 0.66, z: -0.2 },
    palm: { x: -0.6, y: 0, z: 0.3 },
    side: -1,
  },
  crack: {
    // Nuque saisie du côté OPPOSÉ à la tête qui roule.
    upper: { x: 0.82, y: 0.05, z: 0.05 },
    fore: { x: -0.6, y: 0.74, z: -0.22 },
    hand: { x: -0.82, y: 0.42, z: -0.3 },
    palm: { x: -0.2, y: -0.3, z: 0.6 },
    side: 1,
  },
  chin: {
    // Menton posé dans la paume - assis, le coude s'appuie sur la cuisse.
    upper: { x: 0.2, y: -0.86, z: 0.3 },
    upperSit: { x: 0.2, y: -0.8, z: 0.45 },
    fore: { x: -0.32, y: 0.88, z: 0.28 },
    hand: { x: -0.35, y: 0.75, z: 0.15 },
    palm: PALM_TO_FACE,
    side: -1,
  },
  laugh: {
    // Rire retenu derrière la main : le geste tokyoïte par excellence.
    upper: ARM_OUT,
    fore: FORE_UP_FACE,
    hand: { x: -0.45, y: 0.68, z: 0.1 },
    palm: PALM_TO_FACE,
    swing: { on: 'hand', axis: 'y', amp: 0.1, freq: 8 },
  },
  whisper: {
    // Main en coupe au coin de la bouche, du côté du voisin.
    upper: { x: 0.5, y: -0.62, z: 0.3 },
    fore: { x: -0.15, y: 0.82, z: 0.4 },
    hand: { x: -0.62, y: 0.5, z: 0.3 },
    palm: { x: -0.55, y: 0.2, z: -0.65 },
  },
  flirt: {
    // Mèche remise derrière l'oreille.
    upper: { x: 0.45, y: -0.62, z: 0.15 },
    fore: { x: -0.2, y: 0.9, z: -0.05 },
    hand: { x: -0.5, y: 0.7, z: -0.25 },
    palm: { x: -0.5, y: -0.2, z: 0.4 },
    swing: { on: 'hand', axis: 'z', amp: 0.15, freq: 1.6 },
  },

  // - Bras et buste -
  crossArms: {
    // Bras croisés : avant-bras en travers du VENTRE (à hauteur de poitrine,
    // les deux se rejoignaient en une seule masse sous le menton), chaque main
    // s'arrêtant SOUS le coude opposé - poussées plus loin en travers, elles
    // ressortaient de part et d'autre du corps.
    upper: { x: 0.2, y: -0.95, z: 0.1 },
    fore: { x: -0.6, y: -0.3, z: 0.74 },
    hand: { x: -0.74, y: -0.22, z: 0.62 },
    palm: { x: 0, y: -0.9, z: -0.2 },
    both: true,
  },
  sulk: {
    upper: { x: 0.2, y: -0.95, z: 0.1 },
    fore: { x: -0.58, y: -0.34, z: 0.74 },
    hand: { x: -0.72, y: -0.26, z: 0.62 },
    palm: { x: 0, y: -0.9, z: -0.2 },
    both: true,
  },
  jealous: {
    upper: { x: 0.2, y: -0.95, z: 0.1 },
    fore: { x: -0.6, y: -0.28, z: 0.74 },
    hand: { x: -0.74, y: -0.2, z: 0.62 },
    palm: { x: 0, y: -0.9, z: -0.2 },
    both: true,
  },
  angry: {
    // Poings serrés le long du corps, coudes écartés.
    upper: { x: 0.45, y: -0.85, z: 0.05 },
    fore: { x: -0.15, y: -0.35, z: 0.9 },
    hand: { x: -0.2, y: -0.2, z: 0.94 },
    palm: { x: 0, y: -0.4, z: -0.85 },
    both: true,
  },
  shrug: {
    // Épaules montées, paumes retournées vers le ciel.
    upper: { x: 0.62, y: -0.72, z: 0.15 },
    fore: { x: 0.25, y: 0.05, z: 0.95 },
    hand: { x: 0.35, y: 0.05, z: 0.9 },
    palm: { x: 0, y: 0.95, z: 0.1 },
    both: true,
  },
  shoulders: {
    upper: { x: 0.35, y: -0.88, z: 0.12 },
    fore: { x: -0.1, y: -0.5, z: 0.82 },
    hand: { x: -0.15, y: -0.45, z: 0.85 },
    both: true,
    swing: { on: 'upper', axis: 'y', amp: 0.18, freq: 2.2 },
  },
  stretch: {
    // Les deux bras au-dessus de la tête, dos creusé.
    upper: { x: 0.32, y: 0.9, z: -0.1 },
    fore: { x: 0.1, y: 0.98, z: 0.05 },
    hand: { x: 0.05, y: 0.98, z: 0.05 },
    both: true,
    swing: { on: 'upper', axis: 'x', amp: 0.16, freq: 1.2 },
  },
  fidget: {
    // Doigts qui se triturent devant le ventre.
    upper: { x: 0.16, y: -0.9, z: 0.28 },
    fore: { x: -0.35, y: 0.05, z: 0.9 },
    hand: { x: -0.6, y: 0, z: 0.78 },
    palm: { x: 0, y: 0.4, z: -0.9 },
    both: true,
    swing: { on: 'hand', axis: 'x', amp: 0.18, freq: 3.4 },
  },
  button: {
    // Bouton de manteau repris à deux mains, sous le sternum.
    upper: { x: 0.2, y: -0.88, z: 0.28 },
    fore: { x: -0.5, y: 0.3, z: 0.78 },
    hand: { x: -0.75, y: 0.2, z: 0.6 },
    palm: { x: 0, y: 0.5, z: -0.85 },
    both: true,
    swing: { on: 'hand', axis: 'y', amp: 0.12, freq: 3 },
  },
  bag: {
    // Sangle du sac remontée sur l'épaule.
    upper: { x: 0.4, y: -0.62, z: 0.2 },
    fore: { x: -0.3, y: 0.85, z: 0.2 },
    hand: { x: -0.55, y: 0.6, z: -0.1 },
    palm: { x: -0.4, y: -0.3, z: 0.5 },
    side: -1,
    swing: { on: 'hand', axis: 'y', amp: 0.14, freq: 2.4 },
  },
  rummage: {
    // Bras plongé dans le sac, à hauteur de hanche.
    upper: { x: 0.3, y: -0.85, z: 0.3 },
    fore: { x: -0.45, y: -0.3, z: 0.82 },
    hand: { x: -0.6, y: -0.45, z: 0.6 },
    palm: { x: 0, y: 0.6, z: -0.75 },
    swing: { on: 'hand', axis: 'x', amp: 0.28, freq: 4.5 },
  },
  eat: {
    // Bouchée portée à la bouche, l'autre main en coupe dessous.
    upper: { x: 0.24, y: -0.76, z: 0.36 },
    fore: FORE_UP_FACE,
    hand: { x: -0.4, y: 0.7, z: 0.15 },
    palm: PALM_TO_FACE,
    swing: { on: 'fore', axis: 'y', amp: 0.18, freq: 3.2 },
  },
  fan: {
    // Main qui s'évente devant le visage.
    upper: { x: 0.36, y: -0.72, z: 0.34 },
    fore: { x: -0.2, y: 0.8, z: 0.5 },
    hand: { x: -0.35, y: 0.55, z: 0.6 },
    palm: PALM_TO_FACE,
    swing: { on: 'hand', axis: 'x', amp: 0.45, freq: 6 },
  },
  tie: {
    // Lacet repris : les deux mains descendent vers la chaussure.
    upper: { x: 0.2, y: -0.94, z: 0.2 },
    fore: { x: -0.15, y: -0.75, z: 0.6 },
    hand: { x: -0.2, y: -0.85, z: 0.45 },
    both: true,
    swing: { on: 'hand', axis: 'x', amp: 0.2, freq: 3.5 },
  },
  watch: {
    // Poignet remonté en travers de la POITRINE (au menton, on ne lisait plus
    // une montre mais un objet porté à la bouche), cadran vers le visage.
    upper: { x: 0.22, y: -0.84, z: 0.34 },
    fore: { x: -0.66, y: 0.3, z: 0.62 },
    hand: { x: -0.88, y: 0.12, z: 0.45 },
    palm: { x: 0.15, y: 0.75, z: -0.62 },
    side: -1,
  },
  checkTime: {
    upper: { x: 0.22, y: -0.84, z: 0.34 },
    fore: { x: -0.66, y: 0.3, z: 0.62 },
    hand: { x: -0.88, y: 0.12, z: 0.45 },
    palm: { x: 0.15, y: 0.75, z: -0.62 },
    side: -1,
  },
  bagFeet: {
    // Sac calé entre les pieds : une main descend le retenir.
    upper: { x: 0.16, y: -0.95, z: 0.2 },
    fore: { x: -0.2, y: -0.82, z: 0.52 },
    hand: { x: -0.25, y: -0.9, z: 0.35 },
  },
  offer: {
    // Place cédée : main ouverte tendue vers le siège.
    upper: { x: 0.5, y: -0.72, z: 0.3 },
    fore: { x: 0.35, y: -0.15, z: 0.9 },
    hand: { x: 0.45, y: -0.2, z: 0.85 },
    palm: { x: 0, y: 0.95, z: 0.1 },
  },
  point: {
    // Bras tendu vers la vitre, index en avant.
    upper: { x: 0.75, y: -0.4, z: 0.35 },
    fore: { x: 0.8, y: 0.1, z: 0.55 },
    hand: { x: 0.9, y: 0.1, z: 0.4 },
    palm: { x: 0, y: -0.9, z: 0.2 },
    side: -1,
  },
  talk: {
    // S'adresse au joueur : une main ouverte à hauteur de taille, qui
    // accompagne la phrase. Discret - on parle à un inconnu dans un train,
    // on ne prononce pas un discours.
    upper: { x: 0.45, y: -0.7, z: 0.34 },
    fore: { x: 0.15, y: 0.05, z: 0.9 },
    hand: { x: 0.28, y: 0.05, z: 0.85 },
    palm: { x: 0, y: 0.92, z: 0.15 },
    side: -1,
    swing: { on: 'hand', axis: 'y', amp: 0.18, freq: 3.4 },
  },
  wave: {
    // Bras levé qui salue le train qui arrive.
    upper: { x: 0.6, y: 0.7, z: 0.15 },
    fore: { x: 0.2, y: 0.95, z: 0.1 },
    hand: { x: 0.1, y: 0.98, z: 0.1 },
    palm: { x: 0, y: 0, z: 0.95 },
    swing: { on: 'hand', axis: 'x', amp: 0.4, freq: 5 },
  },
  bow: {
    // Salut : mains jointes devant les cuisses, bras collés au corps.
    upper: { x: 0.06, y: -0.96, z: 0.2 },
    fore: { x: -0.42, y: -0.55, z: 0.72 },
    hand: { x: -0.6, y: -0.5, z: 0.6 },
    palm: { x: 0, y: -0.3, z: -0.9 },
    both: true,
  },

  // - Drame -
  argue: {
    // Index levé qui ponctue, coude haut.
    upper: { x: 0.5, y: -0.55, z: 0.5 },
    fore: { x: -0.1, y: 0.8, z: 0.6 },
    hand: { x: -0.2, y: 0.9, z: 0.35 },
    palm: { x: 0, y: 0.2, z: -0.9 },
    swing: { on: 'hand', axis: 'y', amp: 0.3, freq: 5.5 },
    roleShift: true,
  },
  scold: {
    upper: { x: 0.45, y: -0.55, z: 0.5 },
    fore: { x: -0.15, y: 0.85, z: 0.5 },
    hand: { x: -0.25, y: 0.92, z: 0.25 },
    palm: { x: 0, y: 0.2, z: -0.9 },
    swing: { on: 'hand', axis: 'x', amp: 0.35, freq: 6 },
    roleShift: true,
  },
  fight: {
    // Poings hauts, coups alternés : les deux rôles sont déphasés.
    upper: { x: 0.35, y: -0.55, z: 0.6 },
    fore: { x: -0.1, y: 0.35, z: 0.92 },
    hand: { x: -0.1, y: 0.25, z: 0.95 },
    palm: { x: 0, y: -0.3, z: -0.9 },
    both: true,
    swing: { on: 'fore', axis: 'z', amp: 0.5, freq: 9 },
    roleShift: true,
  },
  shove: {
    // Bras tendus qui poussent (rôle 0) ou encaissent (rôle 1).
    upper: { x: 0.42, y: -0.6, z: 0.6 },
    fore: { x: 0.1, y: 0.15, z: 0.98 },
    hand: { x: 0.15, y: 0.1, z: 0.98 },
    palm: { x: 0, y: -0.2, z: 0.95 },
    both: true,
    swing: { on: 'upper', axis: 'z', amp: 0.35, freq: 3.2 },
    roleShift: true,
  },

  // - Chutes -
  //
  // `upper/fore/hand` : pose d'amorti FIXE, pour un pack sans clip de chute.
  // `keys` : bras animés par-dessus le clip, calés sur les pistes de
  // characters/fall.ts - moulinet pendant que le corps part, mains vers le sol
  // juste avant l'impact, puis lâcher. Au sol, les bras du clip sont meilleurs
  // que tout ce qu'on poserait à l'aveugle, et surtout ils ne traversent pas le
  // plancher : on ne reprend la main que pour l'assise par terre, où le clip
  // remet les poings joints devant le visage.
  stumble: {
    upper: { x: 0.7, y: -0.5, z: 0.5 },
    fore: { x: 0.3, y: 0.15, z: 0.94 },
    hand: { x: 0.35, y: 0.05, z: 0.92 },
    palm: { x: 0, y: -0.9, z: 0.3 },
    both: true,
    keys: [
      { t: 0, w: 0, upper: ARM_DOWN, fore: { x: 0.1, y: -0.9, z: 0.3 }, hand: { x: 0.1, y: -0.9, z: 0.3 } },
      // Les bras s'ouvrent EN CROIX pour retrouver l'équilibre. Tendus devant,
      // on ne lit pas un déséquilibre mais un somnambule : c'est l'écart
      // LATÉRAL qui dit le balancier, et le clip garde le reste.
      {
        t: 0.16,
        w: 0.55,
        upper: { x: 0.95, y: -0.05, z: 0.1 },
        fore: { x: 0.82, y: 0.4, z: 0.2 },
        hand: { x: 0.8, y: 0.36, z: 0.25 },
        palm: { x: 0, y: -0.55, z: 0.75 },
      },
      // Ils redescendent en même temps que le pied rattrape.
      {
        t: 0.45,
        w: 0.4,
        upper: { x: 0.78, y: -0.5, z: 0.15 },
        fore: { x: 0.55, y: -0.28, z: 0.55 },
        hand: { x: 0.55, y: -0.32, z: 0.55 },
        palm: { x: 0, y: -0.85, z: 0.4 },
      },
      { t: 0.8, w: 0, upper: ARM_DOWN, fore: { x: 0.1, y: -0.85, z: 0.4 }, hand: { x: 0.1, y: -0.85, z: 0.4 } },
    ],
  },
  fall: {
    upper: { x: 0.8, y: -0.35, z: 0.5 },
    fore: { x: 0.45, y: 0.05, z: 0.9 },
    hand: { x: 0.5, y: -0.1, z: 0.85 },
    palm: { x: 0, y: -0.95, z: 0.2 },
    both: true,
    keys: [
      { t: 0, w: 0, upper: ARM_DOWN, fore: { x: 0.1, y: -0.9, z: 0.3 }, hand: { x: 0.1, y: -0.9, z: 0.3 } },
      // Moulinet : les bras montent en croix, c'est le réflexe qu'on lit de
      // loin et qui dit « il ne se rattrapera pas ».
      {
        t: 0.13,
        w: 0.85,
        upper: { x: 0.92, y: 0.25, z: -0.1 },
        fore: { x: 0.5, y: 0.75, z: 0.1 },
        hand: { x: 0.45, y: 0.78, z: 0.15 },
        palm: { x: 0, y: 0.1, z: 0.95 },
      },
      // Les mains cherchent le sol derrière, paumes ouvertes vers le bas.
      {
        t: 0.33,
        w: 0.85,
        upper: { x: 0.72, y: -0.3, z: -0.5 },
        fore: { x: 0.4, y: -0.62, z: -0.55 },
        hand: { x: 0.35, y: -0.72, z: -0.45 },
        palm: { x: 0, y: -0.92, z: -0.25 },
      },
      // L'impact arrive : on rend les bras au contrecoup du clip, qui est très
      // bien tel quel - et qui, lui, ne traverse pas le plancher.
      {
        t: 0.5,
        w: 0.35,
        upper: { x: 0.62, y: -0.5, z: -0.45 },
        fore: { x: 0.35, y: -0.8, z: -0.3 },
        hand: { x: 0.3, y: -0.85, z: -0.25 },
        palm: { x: 0, y: -0.95, z: 0 },
      },
      { t: 0.72, w: 0, upper: ARM_DOWN, fore: { x: 0.1, y: -0.9, z: 0.2 }, hand: { x: 0.1, y: -0.9, z: 0.2 } },
      // Assis par terre : le clip d'origine remet les mains jointes devant le
      // visage (c'est une mort par balle, il y tenait une arme). On les repose
      // au sol derrière les hanches - la seule façon de rester assis comme ça.
      { t: 1.75, w: 0, upper: PROP_UPPER, fore: PROP_FORE, hand: PROP_HAND, palm: PALM_DOWN },
      { t: 2.2, w: 0.8, upper: PROP_UPPER, fore: PROP_FORE, hand: PROP_HAND, palm: PALM_DOWN },
      { t: 3.0, w: 0.8, upper: PROP_UPPER, fore: PROP_FORE, hand: PROP_HAND, palm: PALM_DOWN },
      // Il pousse sur ses mains pour se remettre debout.
      {
        t: 3.35,
        w: 0.5,
        upper: { x: 0.42, y: -0.72, z: -0.35 },
        fore: { x: 0.24, y: -0.9, z: -0.15 },
        hand: { x: 0.2, y: -0.92, z: -0.08 },
        palm: PALM_DOWN,
      },
      { t: 3.75, w: 0, upper: ARM_DOWN, fore: { x: 0.1, y: -0.88, z: 0.3 }, hand: { x: 0.1, y: -0.88, z: 0.3 } },
    ],
  },
  slip: {
    upper: { x: 0.75, y: -0.35, z: 0.45 },
    fore: { x: 0.4, y: 0.35, z: 0.85 },
    hand: { x: 0.45, y: 0.25, z: 0.85 },
    palm: { x: 0, y: -0.9, z: 0.3 },
    both: true,
    keys: [
      { t: 0, w: 0, upper: ARM_DOWN, fore: { x: 0.1, y: -0.9, z: 0.3 }, hand: { x: 0.1, y: -0.9, z: 0.3 } },
      // Le grand moulinet de la peau de banane : bras hauts et écartés.
      {
        t: 0.12,
        w: 0.9,
        upper: { x: 0.85, y: 0.45, z: -0.05 },
        fore: { x: 0.42, y: 0.86, z: 0.1 },
        hand: { x: 0.38, y: 0.88, z: 0.15 },
        palm: { x: 0, y: 0.1, z: 0.95 },
      },
      // Il tient : les bras restent ouverts en balancier, plus bas.
      {
        t: 0.38,
        w: 0.75,
        upper: { x: 0.9, y: -0.15, z: 0.1 },
        fore: { x: 0.72, y: 0.35, z: 0.45 },
        hand: { x: 0.7, y: 0.3, z: 0.5 },
        palm: { x: 0, y: -0.8, z: 0.4 },
      },
      { t: 0.75, w: 0, upper: ARM_DOWN, fore: { x: 0.1, y: -0.85, z: 0.4 }, hand: { x: 0.1, y: -0.85, z: 0.4 } },
    ],
  },
};

// Bras à la poignée. SEULE l'épaule est posée en absolu - construction
// gauche + miroir, en DEUX temps (écart latéral puis levée : depuis le
// repos, une seule rotation « minimale » vers le haut est un retournement
// ~180° au roulis indéfini - le bras finissait vrillé vers l'arrière au gré
// de la frame du clip). L'avant-bras et la main PROLONGENT ensuite la
// chaîne par les offsets de bind parent→enfant (clone.armRel) : zéro vrille
// relative au coude et au poignet par construction. Les flexions restantes
// (plier vers l'anneau, refermer les doigts dessus) sont de COURTS aims,
// sans composante de vrille.
const STRAP_UPPER_MID = { x: 0.85, y: 0.15, z: 0.2 };
const STRAP_UPPER_END = { x: 0.38, y: 0.82, z: 0.26 }; // levé DEVANT le plan des épaules

// Directions effectives de la frame (base + va-et-vient), sans allocation.
const dUpper = { x: 0, y: 0, z: 0 };
const dFore = { x: 0, y: 0, z: 0 };
const dHand = { x: 0, y: 0, z: 0 };
const dPalm = { x: 0, y: 0, z: 0 };

function mixDir(a: Dir, b: Dir, u: number, out: Dir): Dir {
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u;
  out.z = a.z + (b.z - a.z) * u;
  return out;
}

// Échantillonne une piste de bras animée (chutes) dans dUpper/dFore/dHand/dPalm ;
// renvoie le poids du geste à cet instant. Hors piste (avant la première clé ou
// après la dernière), le poids est nul : les bras sont au clip.
const NO_PALM: Dir = { x: 0, y: 0, z: 0 };

function sampleArmKeys(keys: readonly ArmKey[], t: number): number {
  const last = keys[keys.length - 1];
  if (t >= last.t) return 0;
  let i = 1;
  while (i < keys.length && keys[i].t <= t) i++;
  const b = keys[Math.min(i, keys.length - 1)];
  const a = keys[i - 1];
  const span = b.t - a.t;
  const u = span > 1e-4 ? (t - a.t) / span : 1;
  mixDir(a.upper, b.upper, u, dUpper);
  mixDir(a.fore, b.fore, u, dFore);
  mixDir(a.hand, b.hand, u, dHand);
  mixDir(a.palm ?? NO_PALM, b.palm ?? NO_PALM, u, dPalm);
  return a.w + (b.w - a.w) * u;
}

function swung(base: Dir, g: ArmGesture, part: 'upper' | 'fore' | 'hand', t: number, role: number, out: Dir): Dir {
  out.x = base.x;
  out.y = base.y;
  out.z = base.z;
  const s = g.swing;
  if (s && s.on === part) {
    out[s.axis] += Math.sin(t * s.freq + (g.roleShift ? role * Math.PI : 0)) * s.amp;
  }
  return out;
}

/**
 * Pose un bras entier : clavicule au neutre puis épaule, avant-bras et main
 * reconstruits depuis la bind pose. Le clip continue d'animer l'autre bras.
 *
 * qWrap (poitrine) et qWrapOnly (wrap) doivent être à jour : l'appelant les
 * pose juste avant, comme le fait l'assise manuelle.
 */
function poseArm(
  clone: CharacterClone,
  side: 1 | -1,
  upper: Dir,
  fore: Dir,
  hand: Dir,
  palm: Dir | undefined,
  w: number,
): void {
  if (w <= 0.001) return;
  const bones = clone.bones;
  const bUpper = side === 1 ? bones.upperArmR : bones.upperArmL;
  const bFore = side === 1 ? bones.foreArmR : bones.foreArmL;
  const bHand = side === 1 ? bones.handR : bones.handL;

  // Clavicule du côté posé au neutre : le clip l'anime et déplacerait
  // l'épaule sous le bras reconstruit.
  for (const [clav, rest] of clone.clavicles) {
    if (bUpper && clav === bUpper.parent) clav.quaternion.slerp(rest, w);
  }

  // dirLocal (espace wrap) → monde via l'orientation du wrap : valable même
  // quand le groupe parent est retourné (foule du quai côté opposé).
  const apply = (bone: THREE.Bone | undefined, rest: THREE.Quaternion | undefined, d: Dir, weight: number, pal?: Dir) => {
    if (!bone || !rest) return;
    vDir.set(d.x, d.y, d.z).applyQuaternion(qWrapOnly);
    worldTarget(rest, qWrap, vDir.x, vDir.y, vDir.z, qLTarget);
    if (pal) {
      vTarget.set(pal.x, pal.y, pal.z).applyQuaternion(qWrapOnly);
      solvePalmRoll(qLTarget, vTarget.x, vTarget.y, vTarget.z);
    }
    applyWorld(bone, side === 1 ? mirrorWorld(qLTarget, qWrapOnly, qMirror) : qLTarget, weight);
  };
  apply(bUpper, clone.armRest.upperArmL, upper, w * 0.95);
  apply(bFore, clone.armRest.foreArmL, fore, w);
  apply(bHand, clone.armRest.handL, hand, w, palm);
}

/** Part du bras prise par le geste courant : l'assise n'y repose pas la main. */
export function armTaken(state: PoseState, side: 1 | -1): number {
  if (!state.gesture || state.gestureW <= 0.001) return 0;
  const g = ARM_GESTURES[state.gesture];
  if (!g) return 0;
  if (g.both) return state.gestureW;
  return state.gestureSide === side ? state.gestureW : 0;
}

/** Contexte minimal d'un geste - commun aux PNJ de rame et à la foule du quai. */
export interface ArmCtx {
  action: PaxAction;
  actionT: number;
  seated: boolean;
  /** Le PNJ est-il en posture de gestes (posé, pas en marche ni caché) ? */
  posed: boolean;
  /** Côté du bras déjà accroché à la poignée (0 = aucun). */
  strapSide: 0 | 1 | -1;
  /** Rôle dans un duo : déphase les deux protagonistes. */
  chatRole: 0 | 1;
  /**
   * Le pack sait jouer cette chute en clip (characters/fall.ts) : les bras
   * suivent alors leur piste de clés et se taisent hors fenêtre, au lieu de
   * tenir la pose d'amorti fixe du repli.
   */
  clipFall?: boolean;
}

/**
 * Superpose au clip le geste de l'occupation courante. Un seul geste à la
 * fois : le changement d'occupation referme l'ancien avant d'ouvrir le
 * nouveau, sinon deux poses de bras se mélangeraient en une troisième qui
 * n'existe pas.
 *
 * Réutilisé par la rame et la foule du quai.
 */
export function applyArmGesture(clone: CharacterClone, state: PoseState, k: number, ctx: ArmCtx): void {
  const motion = ctx.posed ? ACTION_BY_ID.get(ctx.action)?.motion : undefined;
  const wanted: MotionId | '' = motion && ARM_GESTURES[motion] ? motion : '';

  if (state.gesture !== wanted) {
    // Une chute ne se négocie pas : le geste en cours (téléphone, journal…)
    // est lâché en deux images au lieu du demi-seconde habituel - sinon les
    // bras se mettent à amortir bien après que le corps a touché le sol.
    state.gestureW = lerpW(state.gestureW, 0, isFallingAction(ctx.action) ? Math.min(1, k * 6) : k);
    if (state.gestureW < 0.06) {
      state.gesture = wanted;
      state.gestureW = 0;
      // Main libre par défaut ; certains gestes imposent leur côté, le regard
      // du catalogue visant déjà par là (montre, écouteur, nuque…).
      const g = wanted ? ARM_GESTURES[wanted] : undefined;
      state.gestureSide = g?.side ?? (ctx.strapSide === 1 ? -1 : 1);
    }
  } else {
    state.gestureW = lerpW(state.gestureW, wanted ? 1 : 0, k);
  }

  const g = state.gesture ? ARM_GESTURES[state.gesture] : undefined;
  // props.ts n'affiche l'objet que si la main le tient vraiment.
  state.phoneSide = state.gestureSide;
  state.phoneW = g?.prop ? state.gestureW : 0;
  if (!g || state.gestureW <= 0.001) return;

  const t = ctx.actionT;
  const role = ctx.chatRole;
  // Chute jouée par un clip du pack : les bras suivent leur propre piste de
  // clés et se taisent dès l'impact (voir ARM_GESTURES, section « Chutes »).
  const keys = ctx.clipFall ? g.keys : undefined;
  let w = state.gestureW;
  let palm = g.palm;
  let upper: Dir;
  let fore: Dir;
  let hand: Dir;
  if (keys) {
    w *= sampleArmKeys(keys, t);
    if (w <= 0.001) return;
    upper = dUpper;
    fore = dFore;
    hand = dHand;
    palm = dPalm.x === 0 && dPalm.y === 0 && dPalm.z === 0 ? undefined : dPalm;
  } else {
    upper = swung(ctx.seated ? (g.upperSit ?? g.upper) : g.upper, g, 'upper', t, role, dUpper);
    fore = swung(ctx.seated ? (g.foreSit ?? g.fore) : g.fore, g, 'fore', t, role, dFore);
    hand = swung(g.hand, g, 'hand', t, role, dHand);
  }

  const ref = clone.chestRef ?? clone.wrap;
  ref.updateWorldMatrix(true, false);
  ref.getWorldQuaternion(qWrap);
  clone.wrap.getWorldQuaternion(qWrapOnly);

  // Un bras accroché à un tsurikawa ne lâche pas pour faire un geste : de ce
  // côté-là, la poignée garde la main. Un geste à deux bras se joue alors à un.
  const free = (side: 1 | -1) => (ctx.strapSide === side ? 1 - state.strapW : 1);
  if (g.both) {
    poseArm(clone, -1, upper, fore, hand, palm, w * free(-1));
    poseArm(clone, 1, upper, fore, hand, palm, w * free(1));
  } else {
    poseArm(clone, state.gestureSide, upper, fore, hand, palm, w * free(state.gestureSide));
  }

  // Regard légèrement tourné vers l'objet tenu.
  if (g.prop && clone.bones.head) clone.bones.head.rotation.y -= state.gestureSide * 0.1 * state.gestureW;
}

// Applique tous les overrides d'un passager. `manualSit` : pas de clip assis
// dans le pack → pose assise approximative par os (jambes pliées, dos rond).
// Le clone fournit les os et les mesures de bind pose (jambes, bras).
export function applyPoseOverrides(
  p: Pax,
  clone: CharacterClone,
  state: PoseState,
  k: number,
  manualSit: boolean,
  clipFall = false,
): void {
  const bones = clone.bones;
  const legs = clone.legGeom;
  // --- Regard : superposé au clip (mêmes conventions que l'ancien rendu). ---
  if (bones.head) {
    bones.head.rotation.y += p.headYaw;
    bones.head.rotation.x += p.headPitch;
    bones.head.rotation.z += p.headRoll;
  }

  const seated = p.state === 'seated';
  const standing = p.state === 'standing';

  // --- Bras levé vers la poignée. ---
  // Le PNJ debout est en x = ±0,45, pile sous une rangée d'anneaux : la cible
  // est au-dessus de lui. Seuls les grands gabarits s'y accrochent
  // (holdStrap, voir systems/passengers). Bras côté extérieur.
  const strapActive = standing && p.holdStrap && !isFallingAction(p.action);
  const strapSide: 0 | 1 | -1 = strapActive ? (p.pos.x >= 0 ? 1 : -1) : 0;
  state.strapW = lerpW(state.strapW, strapActive ? 1 : 0, k);
  if (state.strapW > 0.001) {
    const sw = state.strapW;
    const side = p.pos.x >= 0 ? 1 : -1;
    const arm = side === 1 ? bones.upperArmR : bones.upperArmL;
    const fore = side === 1 ? bones.foreArmR : bones.foreArmL;
    const hand = side === 1 ? bones.handR : bones.handL;
    const foreRel = side === 1 ? clone.armRel.foreR : clone.armRel.foreL;
    const handRel = side === 1 ? clone.armRel.handR : clone.armRel.handL;
    const facingX = Math.sin(p.yaw);
    const facingZ = Math.cos(p.yaw);
    // Sens « devant » pour choisir l'anneau : le cap de la PLACE (targetYaw),
    // celui-là même qui a posté le voyageur sous sa poignée
    // (systems/passengers, alignStrapStand). Le cap rendu (yaw) le rejoint en
    // une demi-seconde après la marche : s'en servir ici ferait basculer
    // l'anneau élu d'un cran pendant le pivot, et le bras sauterait.
    const dirZ = Math.cos(p.targetYaw) >= 0 ? 1 : -1;
    const ringX = side * STRAP_ROW_X;
    let ringZ = p.pos.z; // anneau élu - toujours DEVANT le porteur, voir IK
    const ref = clone.chestRef ?? clone.wrap;
    ref.updateWorldMatrix(true, false);
    ref.getWorldQuaternion(qWrap);
    clone.wrap.getWorldQuaternion(qWrapOnly);
    // Clavicule au neutre : le clip idle la laisse tomber, ce qui coûte
    // plusieurs centimètres de portée vers l'anneau.
    for (const [clav, rest] of clone.clavicles) {
      if (arm && clav === arm.parent) clav.quaternion.slerp(rest, sw);
    }
    // Épaule : deux temps depuis le repos (roulis de bind conservé), miroir
    // pour le bras droit - fixe le ROULIS de toute la chaîne.
    if (arm && clone.armRest.upperArmL) {
      vDir.set(STRAP_UPPER_MID.x, STRAP_UPPER_MID.y, STRAP_UPPER_MID.z).applyQuaternion(qWrapOnly);
      worldTarget(clone.armRest.upperArmL, qWrap, vDir.x, vDir.y, vDir.z, qLTarget);
      vDir.set(STRAP_UPPER_END.x, STRAP_UPPER_END.y, STRAP_UPPER_END.z).applyQuaternion(qWrapOnly);
      alignY(qLTarget, vDir.x, vDir.y, vDir.z, qRestW);
      qLTarget.copy(qRestW);
      applyWorld(arm, side === 1 ? mirrorWorld(qLTarget, qWrapOnly, qMirror) : qLTarget, sw * 0.95);
    }
    if (arm && fore) {
      // Avant-bras : prolonge le bras (offset de bind → coude sans vrille)…
      if (foreRel) {
        arm.updateWorldMatrix(true, false);
        arm.getWorldQuaternion(qRestW).multiply(foreRel);
        applyWorld(fore, qRestW, sw);
      }
      // …puis IK à DEUX OS : longueurs mesurées sur le squelette (invariantes
      // à la pose), coude posé sur le cercle solution côté extérieur-bas -
      // le POIGNET atterrit sous l'anneau quel que soit le gabarit, là où un
      // aim purement directionnel sur- ou sous-dépassait selon le modèle
      // (doigts au travers de l'anneau, ou main qui flotte dessous).
      arm.updateWorldMatrix(true, false);
      arm.getWorldPosition(vBonePos); // épaule
      fore.updateWorldMatrix(true, false);
      fore.getWorldPosition(vFoot); // coude
      const l1 = vBonePos.distanceTo(vFoot);
      let l2 = l1 * 0.9;
      if (hand) {
        hand.updateWorldMatrix(true, false);
        hand.getWorldPosition(vTarget);
        l2 = vFoot.distanceTo(vTarget); // coude → poignet
      }
      // ÉLECTION de l'anneau : uniquement parmi ceux qui sont DEVANT le
      // porteur - on ne se tient pas à une poignée qu'on a dans le dos, et
      // jamais non plus à celle à l'aplomb du crâne (bras vertical collé à la
      // tête). Dans cette fenêtre, le plus LOIN qui reste à portée du bras ;
      // à défaut le plus PROCHE devant, quitte à ce qu'il soit un peu haut -
      // le haussement d'épaule plus bas rattrape le déficit. Le repli ne
      // regarde JAMAIS derrière : c'était là le bras tendu vers l'arrière.
      const wristY = STRAP_BAR_Y - 0.08;
      const dy = wristY - vBonePos.y;
      const dxRow = ringX - vBonePos.x;
      const reach = l1 + l2 + STRAP_STRETCH;
      const aheadCap = Math.min(
        STRAP_AHEAD_MAX,
        Math.sqrt(Math.max(0, reach * reach - dy * dy - dxRow * dxRow)),
      );
      const k0 = Math.round((p.pos.z - STRAP_Z0) / STRAP_PITCH);
      let farInReach = -1;
      let nearestAhead = Infinity;
      for (let k = k0 - 2; k <= k0 + 2; k++) {
        const z = STRAP_Z0 + k * STRAP_PITCH;
        const ahead = (z - p.pos.z) * dirZ;
        if (ahead < STRAP_AHEAD_MIN || ahead > STRAP_AHEAD_MAX) continue;
        if (ahead <= aheadCap && ahead > farInReach) farInReach = ahead;
        if (ahead < nearestAhead) nearestAhead = ahead;
      }
      const ahead = farInReach >= 0 ? farInReach : nearestAhead;
      if (ahead < Infinity) ringZ = p.pos.z + ahead * dirZ;
      // Cible du poignet : sous la barre basse de l'anneau élu.
      vChest.set(ringX, wristY, ringZ);
      vDir.subVectors(vChest, vBonePos);
      // Portée insuffisante (petits gabarits / bras courts) : HAUSSEMENT
      // d'épaule progressif - la clavicule vise plus haut, comme un humain
      // qui se hisse - puis l'épaule est relue avant l'IK.
      const deficit = vDir.length() - (l1 + l2 - 0.02);
      if (deficit > 0 && arm.parent && (arm.parent as THREE.Bone).isBone) {
        const shrug = Math.min(1, deficit / 0.05) * sw;
        vTarget.copy(vBonePos);
        vTarget.y += 0.3;
        aimBone(arm.parent as THREE.Bone, vTarget, shrug * 0.75);
        arm.updateWorldMatrix(true, false);
        arm.getWorldPosition(vBonePos);
        vDir.subVectors(vChest, vBonePos);
      }
      const d = Math.min(Math.max(vDir.length(), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
      vDir.normalize();
      const along = (l1 * l1 + d * d - l2 * l2) / (2 * d);
      const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
      // Pole du coude : extérieur-bas-avant DU BRAS, dans le repère du
      // PERSONNAGE (+X = sa gauche, bras droit → -X), orthogonalisé à l'axe
      // épaule→cible. Un pole exprimé en espace monde (side de pos.x) tombait
      // du mauvais côté pour la moitié des orientations : le coude passait en
      // travers, PAR-DESSUS la tête - le fameux bras tordu vers l'arrière.
      vTarget.set(-side * 0.9, -0.3, 0.15).applyQuaternion(qWrapOnly);
      vTarget.addScaledVector(vDir, -vTarget.dot(vDir));
      if (vTarget.lengthSq() < 1e-6) vTarget.set(-side, 0, 0).applyQuaternion(qWrapOnly);
      vTarget.normalize();
      vFoot.copy(vBonePos).addScaledVector(vDir, along).addScaledVector(vTarget, out);
      aimBone(arm, vFoot, sw); // épaule vers le coude IK (l'avant-bras suit, rigide)
      aimBone(fore, vChest, sw); // avant-bras vers le poignet cible
    }
    // Main : prolonge l'avant-bras (poignet sans vrille), puis un CASSÉ net
    // du poignet - les doigts montent par-dessus la barre basse de l'anneau,
    // légèrement vers l'avant - et la PAUME est résolue vers le visage :
    // vue de l'extérieur on voit le dos/la tranche de la main qui agrippe,
    // plus une paume ouverte à plat.
    if (fore && hand && handRel) {
      fore.updateWorldMatrix(true, false);
      fore.getWorldQuaternion(qRestW).multiply(handRel);
      applyWorld(hand, qRestW, sw);
      vTarget.set(ringX + facingX * 0.06, STRAP_BAR_Y + 0.03, ringZ + facingZ * 0.06);
      aimBone(hand, vTarget, sw);
      hand.updateWorldMatrix(true, false);
      hand.getWorldQuaternion(qRestW);
      vTarget.set(0, -0.35, -0.9).applyQuaternion(qWrapOnly); // vers le bas-visage
      solvePalmRoll(qRestW, vTarget.x, vTarget.y, vTarget.z);
      applyWorld(hand, qRestW, sw);
    }
  }

  // --- Assise manuelle de secours (pack sans clip assis). ---
  state.sitW = lerpW(state.sitW, manualSit && seated ? 1 : 0, k);
  if (state.sitW > 0.001) {
    const w = state.sitW;
    const sinY = Math.sin(p.yaw);
    const cosY = Math.cos(p.yaw);
    clone.wrap.getWorldQuaternion(qWrapOnly);
    // Buste SYMÉTRISÉ : le clip idle vrille le torse (Y), déplaçant une
    // épaule en avant et l'autre en arrière - bras et mains finissent
    // inégaux. Chaque os de la chaîne (racine d'abord) est ramené à
    // l'orientation symétrique la plus proche : la moyenne entre lui-même et
    // son propre miroir sagittal (la composante symétrique - pitch de
    // respiration - survit, la vrille et l'inclinaison latérale s'annulent).
    for (const b of clone.spineChain) {
      b.updateWorldMatrix(true, false);
      b.getWorldQuaternion(qRestW);
      mirrorWorld(qRestW, qWrapOnly, qMirror);
      qRestW.slerp(qMirror, 0.5);
      applyWorld(b, qRestW, w);
    }
    // Cuisses vers l'avant du PNJ, genoux légèrement SOUS les hanches : les
    // pieds atteignent le sol au lieu de pendre en pointes de ballerine.
    vDir.set(sinY, -0.08, cosY);
    for (const key of ['upLegL', 'upLegR'] as const) {
      const b = bones[key];
      if (!b) continue;
      b.updateWorldMatrix(true, false);
      b.getWorldPosition(vBonePos);
      vTarget.copy(vBonePos).add(vDir);
      aimBone(b, vTarget, w);
    }
    // Tibias et pieds : la cheville doit atterrir à HAUTEUR DE SOL, quelle
    // que soit la longueur du tibia (mesurée sur la bind pose). Si le tibia
    // dépasse la hauteur du genou, l'excédent replie le pied vers la
    // banquette (Pythagore), comme on s'assoit réellement ; sinon il pend à
    // la verticale sans atteindre le sol.
    const shinLen = (legs?.shinLen ?? 0.35) * p.height;
    const ankleY = (legs?.ankleH ?? 0.05) * p.height;
    for (const [legKey, footKey] of [
      ['legL', 'footL'],
      ['legR', 'footR'],
    ] as const) {
      const b = bones[legKey];
      if (!b) continue;
      b.updateWorldMatrix(true, false);
      b.getWorldPosition(vBonePos); // genou
      const drop = Math.min(shinLen, Math.max(0.05, vBonePos.y - ankleY));
      const tuck = Math.sqrt(Math.max(0, shinLen * shinLen - drop * drop));
      vTarget.set(vBonePos.x - sinY * tuck, vBonePos.y - drop, vBonePos.z - cosY * tuck);
      aimBone(b, vTarget, w);
      const foot = bones[footKey];
      if (!foot) continue;
      if (legs?.footDetached && foot.parent) {
        // Rigs Quaternius : le pied est un os DÉTACHÉ (cible IK, animé en
        // position par les clips) - il ne suit pas le tibia. On le POSE à la
        // cheville calculée, sinon la chaussure reste plantée à sa position
        // debout (sous le plancher, mesh étiré) ; le clip garde le pied à
        // plat, aucune rotation à forcer.
        foot.parent.updateWorldMatrix(true, false);
        mParentInv.copy(foot.parent.matrixWorld).invert();
        vFoot.copy(vTarget).applyMatrix4(mParentInv);
        foot.position.lerp(vFoot, w);
      } else {
        // Rig FK classique : le pied suit le tibia - on l'aplatit seulement
        // (sinon il pointe vers le sol dans l'axe du tibia).
        foot.updateWorldMatrix(true, false);
        foot.getWorldPosition(vBonePos);
        vTarget.set(vBonePos.x + sinY, vBonePos.y - 0.02, vBonePos.z + cosY);
        aimBone(foot, vTarget, w);
      }
    }
    // Bras posés sur les cuisses, CHACUN au-dessus de sa propre jambe. Les
    // orientations sont reconstruites depuis la BIND POSE (poseBone) et non
    // depuis la pose du clip : le clip idle est asymétrique (roulis des
    // poignets différent par côté) et un simple « aim » le conservait - les
    // deux mains n'étaient pas égales. Le bras entier descend le long du
    // buste (coude près de la hanche, léger écart pour ne pas rentrer dans le
    // torse), l'avant-bras se couche sur la cuisse vers le genou, les doigts
    // sont drapés vers l'avant-bas. Le bras qui tient le téléphone est seul
    // exempté (posé ensuite par applyArmGesture) : l'AUTRE main reste sur la
    // cuisse.
    const handWL = w * (1 - armTaken(state, -1));
    const handWR = w * (1 - armTaken(state, 1));
    if (handWL > 0.001 || handWR > 0.001) {
      // Clavicules au neutre AVANT de lire la référence : le clip idle les
      // anime différemment à gauche et à droite, ce qui décale les épaules.
      for (const [clav, rest] of clone.clavicles) {
        const wc = bones.upperArmR && clav === bones.upperArmR.parent ? handWR : handWL;
        clav.quaternion.slerp(rest, wc);
      }
      const ref = clone.chestRef ?? clone.wrap;
      ref.updateWorldMatrix(true, false);
      ref.getWorldQuaternion(qWrap);
      clone.wrap.getWorldQuaternion(qWrapOnly);
      // Le bras GAUCHE est construit depuis son repos ; le bras DROIT reçoit
      // le MIROIR SAGITTAL du résultat gauche (roulis rigoureusement égal -
      // le buste animé, vrillé, fausserait toute référence par côté). Les
      // ORIENTATIONS seules ne suffisent pas : la vrille décale aussi les
      // POSITIONS des épaules - chaque avant-bras vise donc SON genou (les
      // jambes assises, elles, sont posées symétriquement), le miroir ne
      // fournissant que le roulis.
      // 1) Bras : le long du buste, coude avancé, léger écart extérieur.
      const armRest = clone.armRest.upperArmL;
      if (bones.upperArmL && armRest) {
        worldTarget(armRest, qWrap, sinY * 0.45 + cosY * 0.1, -1, cosY * 0.45 - sinY * 0.1, qLTarget);
        applyWorld(bones.upperArmL, qLTarget, handWL * 0.95);
        if (bones.upperArmR) applyWorld(bones.upperArmR, mirrorWorld(qLTarget, qWrapOnly, qMirror), handWR * 0.95);
      }
      // 2) Avant-bras : chacun vise le dessus de SON genou.
      const foreRest = clone.armRest.foreArmL;
      if (bones.foreArmL && foreRest) {
        const kneeAim = (fore: THREE.Bone, knee: THREE.Bone | undefined): boolean => {
          if (!knee) return false;
          fore.updateWorldMatrix(true, false);
          fore.getWorldPosition(vBonePos); // coude
          knee.updateWorldMatrix(true, false);
          knee.getWorldPosition(vTarget);
          vTarget.y += 0.1; // dessus du genou (marge : les doigts ne doivent pas le traverser)
          vTarget.addScaledVector(vDir, -0.03);
          vTarget.sub(vBonePos);
          return vTarget.lengthSq() > 1e-6;
        };
        vDir.set(sinY, 0, cosY);
        if (kneeAim(bones.foreArmL, bones.legL)) {
          worldTarget(foreRest, qWrap, vTarget.x, vTarget.y, vTarget.z, qLTarget);
          applyWorld(bones.foreArmL, qLTarget, handWL);
          if (bones.foreArmR) {
            // NB : alignY ne supporte pas out === q (aliasing) - sortie séparée.
            mirrorWorld(qLTarget, qWrapOnly, qMirror);
            if (kneeAim(bones.foreArmR, bones.legR)) alignY(qMirror, vTarget.x, vTarget.y, vTarget.z, qLTarget);
            else qLTarget.copy(qMirror);
            applyWorld(bones.foreArmR, qLTarget, handWR);
          }
        }
      }
      // 3) Mains : presque à plat sur le genou (un drapé trop plongeant fait
      // traverser les doigts), miroir exact.
      const handRest = clone.armRest.handL;
      if (bones.handL && handRest) {
        worldTarget(handRest, qWrap, sinY, -0.12, cosY, qLTarget);
        applyWorld(bones.handL, qLTarget, handWL);
        if (bones.handR) applyWorld(bones.handR, mirrorWorld(qLTarget, qWrapOnly, qMirror), handWR);
      }
    }
    if (bones.spine) bones.spine.rotation.x += 0.12 * w;
  }

  // --- Geste de l'occupation : EN DERNIER - il se superpose au clip debout
  // comme à l'assise manuelle (dont il remplace la ou les mains engagées), et
  // laisse le bras de la poignée accroché à son anneau. ---
  applyArmGesture(clone, state, k, {
    action: p.action,
    actionT: p.actionT,
    seated,
    posed: seated || standing,
    strapSide,
    chatRole: p.chatRole,
    clipFall,
  });
}
