// Accessoires « Tokyo » superposés aux personnages librairie : lunettes,
// masque chirurgical, sacs. Les modèles des packs n'en ont pas — on attache de
// petits volumes à des groupes « suiveurs » recalés chaque frame sur la
// transformation monde des os (tête, buste), en unités normalisées (le
// personnage fait SKELETON_TOP=1.445 unités, comme l'ancien squelette).

import * as THREE from 'three';
import type { Appearance } from '../../systems/appearance';
import type { BoneMap } from './library';

export interface PropRig {
  headFollow: THREE.Group | null;
  spineFollow: THREE.Group | null;
}

const glassesMat = new THREE.MeshStandardMaterial({ color: '#22201e', roughness: 0.4 });
const maskMat = new THREE.MeshStandardMaterial({ color: '#eef2f0', roughness: 0.9 });
const lensGeo = new THREE.BoxGeometry(0.055, 0.04, 0.012);
const bridgeGeo = new THREE.BoxGeometry(0.03, 0.008, 0.012);
const templeGeo = new THREE.BoxGeometry(0.008, 0.008, 0.1);
const maskGeo = new THREE.BoxGeometry(0.13, 0.075, 0.05);
const backpackGeo = new THREE.BoxGeometry(0.24, 0.3, 0.12);
const shoulderBagGeo = new THREE.BoxGeometry(0.16, 0.2, 0.07);

// Position des yeux / du bas du visage par rapport à l'origine de l'os de
// tête (base du crâne), en unités normalisées — vaut pour des proportions
// humaines standard après normalisation.
const EYE_Y = 0.09;
const FACE_Z = 0.1;

function makeGlasses(): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(lensGeo, glassesMat);
    lens.position.set(s * 0.045, 0, 0);
    g.add(lens);
    const temple = new THREE.Mesh(templeGeo, glassesMat);
    temple.position.set(s * 0.075, 0.005, -0.05);
    g.add(temple);
  }
  const bridge = new THREE.Mesh(bridgeGeo, glassesMat);
  g.add(bridge);
  g.position.set(0, EYE_Y, FACE_Z);
  return g;
}

function makeMask(): THREE.Mesh {
  const m = new THREE.Mesh(maskGeo, maskMat);
  m.position.set(0, EYE_Y - 0.08, FACE_Z - 0.01);
  return m;
}

// Attache les accessoires du descripteur d'apparence ; renvoie les groupes
// suiveurs à recaler chaque frame via updatePropRig. `allowBag` : false quand
// le modèle a déjà son propre sac (évite le doublon).
export function attachProps(wrap: THREE.Group, app: Appearance, allowBag = true): PropRig {
  const rig: PropRig = { headFollow: null, spineFollow: null };

  if (app.glasses || app.mask) {
    const head = new THREE.Group();
    head.matrixAutoUpdate = false;
    if (app.glasses) head.add(makeGlasses());
    if (app.mask) head.add(makeMask());
    wrap.add(head);
    rig.headFollow = head;
  }

  if (allowBag && (app.bag === 'backpack' || app.bag === 'shoulder' || app.bag === 'hand')) {
    const spine = new THREE.Group();
    spine.matrixAutoUpdate = false;
    const mat = new THREE.MeshStandardMaterial({ color: app.bagColor, roughness: 0.7 });
    if (app.bag === 'backpack') {
      const bp = new THREE.Mesh(backpackGeo, mat);
      bp.position.set(0, 0.16, -0.2); // dans le dos (face +Z)
      spine.add(bp);
    } else {
      const bag = new THREE.Mesh(shoulderBagGeo, mat);
      bag.position.set(0.2, 0.02, 0.04); // sur la hanche
      spine.add(bag);
    }
    wrap.add(spine);
    rig.spineFollow = spine;
  }

  return rig;
}

const mInv = new THREE.Matrix4();
const mRel = new THREE.Matrix4();
const vPos = new THREE.Vector3();
const qRot = new THREE.Quaternion();
const vScl = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

function followBone(follow: THREE.Group | null, bone: THREE.Bone | undefined, wrap: THREE.Group): void {
  if (!follow || !bone) return;
  bone.updateWorldMatrix(true, false);
  mInv.copy(wrap.matrixWorld).invert();
  mRel.multiplyMatrices(mInv, bone.matrixWorld);
  // L'échelle de normalisation du modèle est neutralisée : les accessoires
  // sont dessinés en unités normalisées, quelle que soit la taille brute du GLB.
  mRel.decompose(vPos, qRot, vScl);
  follow.matrix.compose(vPos, qRot, ONE);
  follow.matrixWorldNeedsUpdate = true;
}

// Recale les groupes suiveurs sur les os (à appeler après les overrides).
export function updatePropRig(rig: PropRig, bones: BoneMap, wrap: THREE.Group): void {
  followBone(rig.headFollow, bones.head, wrap);
  followBone(rig.spineFollow, bones.spine, wrap);
}
