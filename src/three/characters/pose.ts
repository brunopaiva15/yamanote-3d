// Overrides de pose appliqués APRÈS mixer.update : le mixer réécrit les os à
// chaque frame, on superpose donc ici le regard (headYaw/headPitch calculés
// par systems/passengers), le bras levé vers la poignée (tsurikawa), la pose
// téléphone, et une assise manuelle de secours si le pack n'a pas de clip
// assis. Technique : « aim » en espace monde — on oriente l'axe +Y de l'os
// (convention glTF/Blender : l'os pointe vers son enfant) vers une cible,
// avec un poids lissé pour des transitions douces.

import * as THREE from 'three';
import type { Pax } from '../../systems/passengers';
import type { BoneMap } from './library';

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
// Temporaires PRIVÉS de aimBone.
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

function lerpW(current: number, target: number, k: number): number {
  return current + (target - current) * k;
}

// Applique tous les overrides d'un passager. `manualSit` : pas de clip assis
// dans le pack → pose assise approximative par os (jambes pliées, dos rond).
export function applyPoseOverrides(p: Pax, bones: BoneMap, state: PoseState, k: number, manualSit: boolean): void {
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
    // Tibias : la cheville doit atterrir à HAUTEUR DE SOL, quelle que soit la
    // longueur du tibia du modèle. Visé droit vers le bas (ancienne version),
    // un tibia plus long que la hauteur du genou traversait le plancher — on
    // replie donc le pied vers la banquette de l'excédent exact (Pythagore),
    // comme on s'assoit réellement ; s'il est plus court, il pend à la
    // verticale sans atteindre le sol.
    const ankleY = 0.05 * p.height; // hauteur de la cheville, pied posé à plat
    for (const [legKey, footKey] of [
      ['legL', 'footL'],
      ['legR', 'footR'],
    ] as const) {
      const b = bones[legKey];
      if (!b) continue;
      b.updateWorldMatrix(true, false);
      b.getWorldPosition(vBonePos);
      const foot = bones[footKey];
      let shinLen = 0.35 * p.height;
      if (foot) shinLen = foot.getWorldPosition(vTarget).distanceTo(vBonePos);
      const drop = Math.max(0.05, vBonePos.y - ankleY);
      const tuck = Math.sqrt(Math.max(0, shinLen * shinLen - drop * drop));
      vTarget.set(vBonePos.x - sinY * tuck, ankleY, vBonePos.z - cosY * tuck);
      aimBone(b, vTarget, w);
    }
    // Pieds à plat, quasi horizontaux (sinon ils suivent rigidement le tibia
    // et pointent vers le sol).
    vDir.set(sinY, -0.02, cosY);
    for (const key of ['footL', 'footR'] as const) {
      const b = bones[key];
      if (!b) continue;
      b.updateWorldMatrix(true, false);
      b.getWorldPosition(vBonePos);
      vTarget.copy(vBonePos).add(vDir);
      aimBone(b, vTarget, w);
    }
    // Mains posées sur les cuisses, CHACUNE au-dessus de son propre genou —
    // l'ancien point central unique faisait converger les deux avant-bras
    // vers l'axe du corps, mains enfoncées dans les cuisses. Sauf si la pose
    // téléphone tient déjà les avant-bras. Les doigts sont drapés vers
    // l'avant, presque à plat, pour épouser le dessus de la cuisse.
    const handW = w * (1 - state.phoneW);
    if (handW > 0.001) {
      vDir.set(sinY, 0, cosY);
      for (const [foreKey, legKey, handKey] of [
        ['foreArmL', 'legL', 'handL'],
        ['foreArmR', 'legR', 'handR'],
      ] as const) {
        const fore = bones[foreKey];
        const knee = bones[legKey];
        if (fore && knee) {
          knee.updateWorldMatrix(true, false);
          knee.getWorldPosition(vTarget);
          vTarget.addScaledVector(vDir, -0.12); // en retrait du genou…
          vTarget.y += 0.04; // …et posé SUR la cuisse, pas dedans
          aimBone(fore, vTarget, handW * 0.9);
        }
        const b = bones[handKey];
        if (!b) continue;
        b.updateWorldMatrix(true, false);
        b.getWorldPosition(vBonePos);
        vTarget.copy(vBonePos).addScaledVector(vDir, 0.12);
        vTarget.y -= 0.04;
        aimBone(b, vTarget, handW * 0.9);
      }
    }
    if (bones.spine) bones.spine.rotation.x += 0.12 * w;
  }
}
