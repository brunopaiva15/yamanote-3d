// Overrides de pose appliqués APRÈS mixer.update : le mixer réécrit les os à
// chaque frame, on superpose donc ici le regard (headYaw/headPitch calculés
// par systems/passengers), le bras levé vers la poignée (tsurikawa), la pose
// téléphone, et une assise manuelle de secours si le pack n'a pas de clip
// assis. Technique : « aim » en espace monde — on oriente l'axe +Y de l'os
// (convention glTF/Blender : l'os pointe vers son enfant) vers une cible,
// avec un poids lissé pour des transitions douces.

import * as THREE from 'three';
import type { Pax } from '../../systems/passengers';
import type { CharacterClone } from './library';

// Hauteur du centre de l'anneau des tsurikawa (voir three/Handles.tsx :
// barre à 2,0 m, attache courte — l'anneau est remonté pour que le joueur ne
// se le prenne plus dans la tête).
const STRAP_RING_Y = 1.77;
// Rangées d'anneaux : z discrets (mêmes constantes que three/Handles.tsx) —
// le bras vise l'anneau RÉEL le plus proche, pas un anneau imaginaire à p.z.
const RING_PITCH = 0.451;
const RING_Z_MIN = -9.35;
const RING_Z_MAX = 9.35;

// Poids lissés par passager (persistent entre frames).
export interface PoseState {
  strapW: number;
  phoneW: number;
  sitW: number;
}

export function makePoseState(): PoseState {
  return { strapW: 0, phoneW: 0, sitW: 0 };
}

// Temporaires des APPELANTS (cibles, directions). aimBone a les siens : il ne
// doit JAMAIS partager ceux-ci, sinon une boucle « viser les deux jambes »
// voit sa direction écrasée entre la première et la seconde.
const vBonePos = new THREE.Vector3();
const vDir = new THREE.Vector3();
const vTarget = new THREE.Vector3();
const vChest = new THREE.Vector3();
const vFoot = new THREE.Vector3();
const vShoulder = new THREE.Vector3();
const vElbow = new THREE.Vector3();
const vAxis = new THREE.Vector3();
const vPole = new THREE.Vector3();
const vSide = new THREE.Vector3();
const mParentInv = new THREE.Matrix4();
const qWrap = new THREE.Quaternion();
const qWrapOnly = new THREE.Quaternion();
const qLTarget = new THREE.Quaternion();
const qMirror = new THREE.Quaternion();
const qRestW = new THREE.Quaternion();
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

// Avant-bras en pose « téléphone » : les mains convergent devant le buste.
// Réutilisé par la rame et la foule du quai (mêmes os / même poids).
// `skipSide` : main déjà occupée (poignée) — le téléphone se tient à UNE main,
// sinon le même avant-bras recevrait deux cibles contradictoires (bras tordu).
export function applyPhoneArms(
  p: { action: string; yaw: number; pos: THREE.Vector3 },
  bones: CharacterClone['bones'],
  state: PoseState,
  k: number,
  active: boolean,
  skipSide: 'L' | 'R' | null = null,
): void {
  state.phoneW = lerpW(state.phoneW, active ? 1 : 0, k);
  if (state.phoneW > 0.001 && bones.head) {
    bones.head.updateWorldMatrix(true, false);
    bones.head.getWorldPosition(vChest);
    // Point devant le buste, sous le menton, dans la direction du regard.
    vDir.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    vChest.addScaledVector(vDir, 0.28);
    vChest.y -= 0.28;
    // Chaque main vise un point légèrement décalé de SON côté : les deux
    // avant-bras ne convergent plus vers le même point (mains emmêlées).
    vSide.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); // gauche du personnage
    if (bones.foreArmL && skipSide !== 'L') {
      vTarget.copy(vChest).addScaledVector(vSide, 0.045);
      aimBone(bones.foreArmL, vTarget, state.phoneW);
    }
    if (bones.foreArmR && skipSide !== 'R') {
      vTarget.copy(vChest).addScaledVector(vSide, -0.045);
      aimBone(bones.foreArmR, vTarget, state.phoneW);
    }
  }
}

// Applique tous les overrides d'un passager. `manualSit` : pas de clip assis
// dans le pack → pose assise approximative par os (jambes pliées, dos rond).
// Le clone fournit les os et les mesures de bind pose (jambes, bras).
export function applyPoseOverrides(p: Pax, clone: CharacterClone, state: PoseState, k: number, manualSit: boolean): void {
  const bones = clone.bones;
  const legs = clone.legGeom;
  // --- Regard : superposé au clip (mêmes conventions que l'ancien rendu). ---
  if (bones.head) {
    bones.head.rotation.y += p.headYaw;
    bones.head.rotation.x += p.headPitch;
  }

  const seated = p.state === 'seated';
  const standing = p.state === 'standing';

  // --- Bras levé vers la poignée. ---
  // Le PNJ debout est en x = ±0,45, pile sous une rangée d'anneaux : la cible
  // est au-dessus de lui. Seuls les grands gabarits s'y accrochent
  // (holdStrap, voir systems/passengers). Bras côté extérieur.
  const strapActive = standing && p.holdStrap;
  state.strapW = lerpW(state.strapW, strapActive ? 1 : 0, k);
  const strapSide: 'L' | 'R' | null = strapActive ? (p.pos.x >= 0 ? 'R' : 'L') : null;
  if (state.strapW > 0.001) {
    const side = p.pos.x >= 0 ? 1 : -1;
    const arm = side === 1 ? bones.upperArmR : bones.upperArmL;
    const fore = side === 1 ? bones.foreArmR : bones.foreArmL;
    const hand = side === 1 ? bones.handR : bones.handL;
    if (arm && fore) {
      // Le PNJ est PILE sous la rangée d'anneaux (x = ±0,45 des deux côtés) :
      // un simple « aim » tendait le bras à la verticale et la main dépassait
      // l'anneau, doigts en l'air. IK 2 os à la place : longueurs mesurées sur
      // la pose courante, coude calculé (plié vers l'extérieur), poignet posé
      // SOUS l'anneau réel le plus proche — la main l'enserre au lieu de le
      // traverser.
      const ringZ = Math.min(
        RING_Z_MAX,
        Math.max(RING_Z_MIN, RING_Z_MIN + Math.round((p.pos.z - RING_Z_MIN) / RING_PITCH) * RING_PITCH),
      );
      arm.updateWorldMatrix(true, false);
      arm.getWorldPosition(vShoulder);
      fore.updateWorldMatrix(true, false);
      fore.getWorldPosition(vElbow);
      const upperLen = Math.max(0.05, vShoulder.distanceTo(vElbow));
      let foreLen = upperLen * 0.9;
      if (hand) {
        hand.updateWorldMatrix(true, false);
        hand.getWorldPosition(vBonePos);
        foreLen = Math.max(0.05, vElbow.distanceTo(vBonePos));
      }
      // Cible du POIGNET : bas de l'anneau (la main continue au-delà et le tient).
      vTarget.set(p.pos.x, STRAP_RING_Y - 0.1, ringZ);
      vAxis.subVectors(vTarget, vShoulder);
      const dist = Math.max(1e-3, vAxis.length());
      const d = Math.min(dist, (upperLen + foreLen) * 0.999); // trop court : bras tendu, sans dépasser
      vAxis.multiplyScalar(1 / dist);
      // Angle épaule→coude (loi du cosinus), coude poussé vers l'extérieur.
      const cosA = Math.min(1, Math.max(-1, (upperLen * upperLen + d * d - foreLen * foreLen) / (2 * upperLen * d)));
      const sinA = Math.sqrt(1 - cosA * cosA);
      vPole.set(side, -0.25, 0);
      vPole.addScaledVector(vAxis, -vPole.dot(vAxis));
      if (vPole.lengthSq() < 1e-4) vPole.set(side, 0, 0);
      vPole.normalize();
      vElbow.copy(vShoulder).addScaledVector(vAxis, upperLen * cosA).addScaledVector(vPole, upperLen * sinA);
      aimBone(arm, vElbow, state.strapW * 0.95);
      aimBone(fore, vTarget, state.strapW);
      if (hand) {
        // Doigts vers le centre de l'anneau : prise « tenue », pas de doigts
        // écartés qui pointent au plafond.
        vElbow.set(p.pos.x, STRAP_RING_Y + 0.04, ringZ);
        aimBone(hand, vElbow, state.strapW * 0.85);
      }
    }
  }

  // --- Téléphone : avant-bras devant la poitrine. Une seule main si l'autre
  // tient la poignée (sinon deux cibles contradictoires sur le même bras). ---
  applyPhoneArms(p, bones, state, k, p.action === 'phone' && (seated || standing), strapSide);

  // --- Assise manuelle de secours (pack sans clip assis). ---
  state.sitW = lerpW(state.sitW, manualSit && seated ? 1 : 0, k);
  if (state.sitW > 0.001) {
    const w = state.sitW;
    const sinY = Math.sin(p.yaw);
    const cosY = Math.cos(p.yaw);
    clone.wrap.getWorldQuaternion(qWrapOnly);
    // Buste SYMÉTRISÉ : le clip idle vrille le torse (Y), déplaçant une
    // épaule en avant et l'autre en arrière — bras et mains finissent
    // inégaux. Chaque os de la chaîne (racine d'abord) est ramené à
    // l'orientation symétrique la plus proche : la moyenne entre lui-même et
    // son propre miroir sagittal (la composante symétrique — pitch de
    // respiration — survit, la vrille et l'inclinaison latérale s'annulent).
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
        // position par les clips) — il ne suit pas le tibia. On le POSE à la
        // cheville calculée, sinon la chaussure reste plantée à sa position
        // debout (sous le plancher, mesh étiré) ; le clip garde le pied à
        // plat, aucune rotation à forcer.
        foot.parent.updateWorldMatrix(true, false);
        mParentInv.copy(foot.parent.matrixWorld).invert();
        vFoot.copy(vTarget).applyMatrix4(mParentInv);
        foot.position.lerp(vFoot, w);
      } else {
        // Rig FK classique : le pied suit le tibia — on l'aplatit seulement
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
    // poignets différent par côté) et un simple « aim » le conservait — les
    // deux mains n'étaient pas égales. Le bras entier descend le long du
    // buste (coude près de la hanche, léger écart pour ne pas rentrer dans le
    // torse), l'avant-bras se couche sur la cuisse vers le genou, les doigts
    // sont drapés vers l'avant-bas. Sauf si la pose téléphone tient déjà les
    // avant-bras.
    const handW = w * (1 - state.phoneW);
    if (handW > 0.001) {
      // Clavicules au neutre AVANT de lire la référence : le clip idle les
      // anime différemment à gauche et à droite, ce qui décale les épaules.
      for (const [clav, rest] of clone.clavicles) {
        clav.quaternion.slerp(rest, handW);
      }
      const ref = clone.chestRef ?? clone.wrap;
      ref.updateWorldMatrix(true, false);
      ref.getWorldQuaternion(qWrap);
      clone.wrap.getWorldQuaternion(qWrapOnly);
      // Le bras GAUCHE est construit depuis son repos ; le bras DROIT reçoit
      // le MIROIR SAGITTAL du résultat gauche (roulis rigoureusement égal —
      // le buste animé, vrillé, fausserait toute référence par côté). Les
      // ORIENTATIONS seules ne suffisent pas : la vrille décale aussi les
      // POSITIONS des épaules — chaque avant-bras vise donc SON genou (les
      // jambes assises, elles, sont posées symétriquement), le miroir ne
      // fournissant que le roulis.
      // 1) Bras : le long du buste, coude avancé, léger écart extérieur.
      const armRest = clone.armRest.upperArmL;
      if (bones.upperArmL && armRest) {
        worldTarget(armRest, qWrap, sinY * 0.45 + cosY * 0.1, -1, cosY * 0.45 - sinY * 0.1, qLTarget);
        applyWorld(bones.upperArmL, qLTarget, handW * 0.95);
        if (bones.upperArmR) applyWorld(bones.upperArmR, mirrorWorld(qLTarget, qWrapOnly, qMirror), handW * 0.95);
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
          applyWorld(bones.foreArmL, qLTarget, handW);
          if (bones.foreArmR) {
            // NB : alignY ne supporte pas out === q (aliasing) — sortie séparée.
            mirrorWorld(qLTarget, qWrapOnly, qMirror);
            if (kneeAim(bones.foreArmR, bones.legR)) alignY(qMirror, vTarget.x, vTarget.y, vTarget.z, qLTarget);
            else qLTarget.copy(qMirror);
            applyWorld(bones.foreArmR, qLTarget, handW);
          }
        }
      }
      // 3) Mains : presque à plat sur le genou (un drapé trop plongeant fait
      // traverser les doigts), miroir exact.
      const handRest = clone.armRest.handL;
      if (bones.handL && handRest) {
        worldTarget(handRest, qWrap, sinY, -0.12, cosY, qLTarget);
        applyWorld(bones.handL, qLTarget, handW);
        if (bones.handR) applyWorld(bones.handR, mirrorWorld(qLTarget, qWrapOnly, qMirror), handW);
      }
    }
    if (bones.spine) bones.spine.rotation.x += 0.12 * w;
  }
}
