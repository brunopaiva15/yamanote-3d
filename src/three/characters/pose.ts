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

// Poids lissés par passager (persistent entre frames).
export interface PoseState {
  strapW: number;
  phoneW: number;
  phoneSide: 1 | -1; // main du téléphone : 1 droite (défaut), -1 gauche
  sitW: number;
}

export function makePoseState(): PoseState {
  return { strapW: 0, phoneW: 0, phoneSide: 1, sitW: 0 };
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

// Pose « téléphone » : UN SEUL bras est piloté — clavicule au neutre, épaule,
// avant-bras et main entièrement reconstruits depuis la bind pose (comme
// l'assise), l'autre bras restant au clip (debout : il pend le long du corps)
// ou à l'assise manuelle (main sur la cuisse). L'ancienne version visait les
// deux avant-bras vers un même point sans toucher ni épaules ni mains : bras
// repliés l'un dans l'autre au gré du clip, téléphone perdu entre les mains.
//
// Directions cibles (axe +Y de chaque os) construites pour le bras GAUCHE en
// espace wrap (+X = gauche du PNJ, +Z devant lui) ; si le téléphone est en
// main droite, le résultat gauche reçoit le miroir sagittal exact — même
// technique que l'assise, seule référence fiable de ces rigs (bind non
// symétrique, clips asymétriques).
const PHONE_UPPER_STAND = { x: 0.1, y: -0.9, z: 0.18 }; // bras le long du buste, coude à peine avancé
const PHONE_UPPER_SIT = { x: 0.1, y: -0.78, z: 0.36 }; // assis : coude posé vers la cuisse
const PHONE_FORE_STAND = { x: -0.18, y: 0.25, z: 0.8 }; // avant-bras devant le sternum, main à mi-poitrine
const PHONE_FORE_SIT = { x: -0.18, y: 0.02, z: 0.85 }; // assis : main plus basse, au-dessus des genoux
const PHONE_HAND = { x: -0.45, y: 0.1, z: 0.75 }; // doigts presque à plat en travers du regard
// Direction (espace wrap) que la PAUME doit regarder : vers le haut-arrière,
// le menton — le téléphone couché dans la paume présente ainsi son écran au
// visage. Roulis résolu par solvePalmRoll (le roulis de bind laissait la
// paume vers le bas : téléphone posé sur le DOS de la main).
const PHONE_PALM = { x: 0.05, y: 0.85, z: -0.52 };

// Bras à la poignée — construction gauche + miroir (comme le téléphone), en
// DEUX temps : écart latéral puis levée. Depuis le repos (bras pendant), une
// seule rotation « minimale » vers le haut est un retournement ~180° au
// roulis indéfini — le bras finissait vrillé vers l'arrière au gré de la
// frame du clip. Le chemin par le côté est celui d'une vraie épaule ;
// l'aplomb exact sur l'ANNEAU est ensuite raffiné par aimBone (corrections
// courtes, stables). La main agrippe : doigts par-dessus l'anneau, paume
// résolue vers le bas-intérieur.
const STRAP_UPPER_MID = { x: 0.85, y: 0.15, z: 0.15 };
const STRAP_UPPER_END = { x: 0.4, y: 0.85, z: 0.12 };
const STRAP_FORE_MID = { x: 0.75, y: 0.45, z: 0.12 };
const STRAP_FORE_END = { x: 0.06, y: 0.95, z: 0.08 };
const STRAP_HAND_MID = { x: 0.65, y: 0.55, z: 0.12 };
const STRAP_HAND_END = { x: 0, y: 0.75, z: 0.5 }; // doigts fléchis par-dessus l'anneau
const STRAP_PALM = { x: -0.3, y: -0.85, z: 0.15 };

// Réutilisé par la rame et la foule du quai. `strapSide` : côté du bras déjà
// accroché à la poignée (±1, 0 si aucun) — le téléphone passe alors dans
// l'autre main au lieu d'arracher le bras à l'anneau.
export function applyPhoneArms(
  clone: CharacterClone,
  state: PoseState,
  k: number,
  active: boolean,
  strapSide: 0 | 1 | -1 = 0,
  seated = false,
): void {
  // Choix de main figé tant que la pose est engagée (pas de saut en cours).
  if (state.phoneW < 0.05) state.phoneSide = strapSide === 1 ? -1 : 1;
  state.phoneW = lerpW(state.phoneW, active ? 1 : 0, k);
  const w = state.phoneW;
  if (w <= 0.001) return;
  const bones = clone.bones;
  const side = state.phoneSide;
  const upper = side === 1 ? bones.upperArmR : bones.upperArmL;
  const fore = side === 1 ? bones.foreArmR : bones.foreArmL;
  const hand = side === 1 ? bones.handR : bones.handL;

  const ref = clone.chestRef ?? clone.wrap;
  ref.updateWorldMatrix(true, false);
  ref.getWorldQuaternion(qWrap);
  clone.wrap.getWorldQuaternion(qWrapOnly);

  // Clavicule du côté téléphone au neutre : le clip l'anime et déplacerait
  // l'épaule sous le bras reconstruit.
  for (const [clav, rest] of clone.clavicles) {
    if (upper && clav === upper.parent) clav.quaternion.slerp(rest, w);
  }

  // dirLocal (espace wrap) → monde via l'orientation du wrap : valable même
  // quand le groupe parent est retourné (foule du quai côté opposé).
  const apply = (
    bone: THREE.Bone | undefined,
    rest: THREE.Quaternion | undefined,
    d: { x: number; y: number; z: number },
    weight: number,
    palm?: { x: number; y: number; z: number },
  ) => {
    if (!bone || !rest) return;
    vDir.set(d.x, d.y, d.z).applyQuaternion(qWrapOnly);
    worldTarget(rest, qWrap, vDir.x, vDir.y, vDir.z, qLTarget);
    if (palm) {
      vTarget.set(palm.x, palm.y, palm.z).applyQuaternion(qWrapOnly);
      solvePalmRoll(qLTarget, vTarget.x, vTarget.y, vTarget.z);
    }
    applyWorld(bone, side === 1 ? mirrorWorld(qLTarget, qWrapOnly, qMirror) : qLTarget, weight);
  };
  apply(upper, clone.armRest.upperArmL, seated ? PHONE_UPPER_SIT : PHONE_UPPER_STAND, w * 0.95);
  apply(fore, clone.armRest.foreArmL, seated ? PHONE_FORE_SIT : PHONE_FORE_STAND, w);
  apply(hand, clone.armRest.handL, PHONE_HAND, w, PHONE_PALM);

  // Regard légèrement tourné vers la main qui tient le téléphone.
  if (bones.head) bones.head.rotation.y -= side * 0.1 * w;
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
  const strapSide: 0 | 1 | -1 = strapActive ? (p.pos.x >= 0 ? 1 : -1) : 0;
  state.strapW = lerpW(state.strapW, strapActive ? 1 : 0, k);
  if (state.strapW > 0.001) {
    const sw = state.strapW;
    const side = p.pos.x >= 0 ? 1 : -1;
    const arm = side === 1 ? bones.upperArmR : bones.upperArmL;
    const fore = side === 1 ? bones.foreArmR : bones.foreArmL;
    const hand = side === 1 ? bones.handR : bones.handL;
    const ref = clone.chestRef ?? clone.wrap;
    ref.updateWorldMatrix(true, false);
    ref.getWorldQuaternion(qWrap);
    clone.wrap.getWorldQuaternion(qWrapOnly);
    const strapAim = (
      bone: THREE.Bone | undefined,
      rest: THREE.Quaternion | undefined,
      mid: { x: number; y: number; z: number },
      end: { x: number; y: number; z: number },
      weight: number,
      palm?: { x: number; y: number; z: number },
    ) => {
      if (!bone || !rest) return;
      vDir.set(mid.x, mid.y, mid.z).applyQuaternion(qWrapOnly);
      worldTarget(rest, qWrap, vDir.x, vDir.y, vDir.z, qLTarget);
      vDir.set(end.x, end.y, end.z).applyQuaternion(qWrapOnly);
      alignY(qLTarget, vDir.x, vDir.y, vDir.z, qRestW);
      qLTarget.copy(qRestW);
      if (palm) {
        vTarget.set(palm.x, palm.y, palm.z).applyQuaternion(qWrapOnly);
        solvePalmRoll(qLTarget, vTarget.x, vTarget.y, vTarget.z);
      }
      applyWorld(bone, side === 1 ? mirrorWorld(qLTarget, qWrapOnly, qMirror) : qLTarget, weight);
    };
    strapAim(arm, clone.armRest.upperArmL, STRAP_UPPER_MID, STRAP_UPPER_END, sw * 0.95);
    if (arm) {
      // Portée adaptée au gabarit : petite correction du coude vers un guide
      // hors/sous l'anneau (le deux-temps fixe le roulis, l'aim la portée).
      vChest.set(p.pos.x + side * 0.15, STRAP_RING_Y - 0.35, p.pos.z);
      aimBone(arm, vChest, sw * 0.85);
    }
    strapAim(fore, clone.armRest.foreArmL, STRAP_FORE_MID, STRAP_FORE_END, sw);
    if (fore) {
      vChest.set(p.pos.x, STRAP_RING_Y - 0.1, p.pos.z);
      aimBone(fore, vChest, sw); // poignet SOUS l'anneau, les doigts l'enveloppent
    }
    strapAim(hand, clone.armRest.handL, STRAP_HAND_MID, STRAP_HAND_END, sw, STRAP_PALM);
  }

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
    // sont drapés vers l'avant-bas. Le bras qui tient le téléphone est seul
    // exempté (posé ensuite par applyPhoneArms) : l'AUTRE main reste sur la
    // cuisse.
    const handWL = w * (state.phoneSide === -1 ? 1 - state.phoneW : 1);
    const handWR = w * (state.phoneSide === 1 ? 1 - state.phoneW : 1);
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
            // NB : alignY ne supporte pas out === q (aliasing) — sortie séparée.
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

  // --- Téléphone : bras dédié, EN DERNIER — il se superpose au clip debout
  // comme à l'assise manuelle (dont il remplace la main côté téléphone), et
  // laisse le bras de la poignée accroché à son anneau. ---
  applyPhoneArms(clone, state, k, p.action === 'phone' && (seated || standing), strapSide, seated);
}
