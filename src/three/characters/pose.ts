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

// Hauteur de l'anneau des tsurikawa (voir three/Handles.tsx).
const STRAP_RING_Y = 1.64;

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

// Orientation monde cible : axe +Y de l'os vers (dx, dy, dz), roulis hérité du
// REPOS (relatif à la poitrine) plutôt que de la pose du clip.
function worldTarget(qRest: THREE.Quaternion, qRefWorld: THREE.Quaternion, dx: number, dy: number, dz: number, out: THREE.Quaternion): THREE.Quaternion {
  qRestW.copy(qRefWorld).multiply(qRest);
  aDir.copy(Y_AXIS).applyQuaternion(qRestW);
  aTo.set(dx, dy, dz).normalize();
  qDelta.setFromUnitVectors(aDir, aTo);
  return out.copy(qDelta).multiply(qRestW);
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
  if (state.strapW > 0.001) {
    const side = p.pos.x >= 0 ? 1 : -1;
    const arm = side === 1 ? bones.upperArmR : bones.upperArmL;
    const fore = side === 1 ? bones.foreArmR : bones.foreArmL;
    // L'épaule vise un point décalé vers l'extérieur et sous l'anneau : le
    // coude s'écarte et se plie, l'avant-bras converge sur l'anneau — bras
    // naturel plutôt que tendu à la verticale.
    vChest.set(p.pos.x + side * 0.2, STRAP_RING_Y - 0.3, p.pos.z);
    if (arm) aimBone(arm, vChest, state.strapW * 0.9);
    if (fore) {
      vChest.set(p.pos.x, STRAP_RING_Y, p.pos.z);
      aimBone(fore, vChest, state.strapW); // avant-bras jusqu'à l'anneau
    }
  }

  // --- Téléphone : les deux avant-bras remontent devant la poitrine. ---
  const phoneActive = p.action === 'phone' && (seated || standing);
  state.phoneW = lerpW(state.phoneW, phoneActive ? 1 : 0, k);
  if (state.phoneW > 0.001 && bones.head) {
    bones.head.updateWorldMatrix(true, false);
    bones.head.getWorldPosition(vChest);
    // Point devant le buste, sous le menton, dans la direction du regard.
    vDir.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    vChest.addScaledVector(vDir, 0.28);
    vChest.y -= 0.28;
    if (bones.foreArmL) aimBone(bones.foreArmL, vChest, state.phoneW);
    if (bones.foreArmR) aimBone(bones.foreArmR, vChest, state.phoneW);
  }

  // --- Assise manuelle de secours (pack sans clip assis). ---
  state.sitW = lerpW(state.sitW, manualSit && seated ? 1 : 0, k);
  if (state.sitW > 0.001) {
    const w = state.sitW;
    const sinY = Math.sin(p.yaw);
    const cosY = Math.cos(p.yaw);
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
      // Le bras GAUCHE est construit depuis son repos (bras le long du buste,
      // avant-bras couché sur la cuisse, doigts drapés vers l'avant-bas) ;
      // le bras DROIT reçoit le MIROIR SAGITTAL EXACT du résultat gauche —
      // seule construction qui garantisse deux bras et deux mains égaux, le
      // buste animé (vrillé) faussant toute référence par côté.
      for (const [lKey, rKey, dx, dy, dz, wgt] of [
        // Directions du côté GAUCHE (latéral +X wrap : cosY, -sinY) — léger
        // écart vers l'extérieur pour que les mains tombent SUR les cuisses,
        // pas dedans (gabarits étroits).
        ['upperArmL', 'upperArmR', sinY * 0.15 + cosY * 0.1, -1, cosY * 0.15 - sinY * 0.1, handW * 0.95],
        ['foreArmL', 'foreArmR', sinY + cosY * 0.16, -0.55, cosY - sinY * 0.16, handW],
        ['handL', 'handR', sinY, -0.15, cosY, handW],
      ] as const) {
        const lb = bones[lKey];
        const rest = clone.armRest[lKey];
        if (!lb || !rest) continue;
        worldTarget(rest, qWrap, dx, dy, dz, qLTarget);
        applyWorld(lb, qLTarget, wgt);
        const rb = bones[rKey];
        if (rb) applyWorld(rb, mirrorWorld(qLTarget, qWrapOnly, qMirror), wgt);
      }
    }
    if (bones.spine) bones.spine.rotation.x += 0.12 * w;
  }
}
