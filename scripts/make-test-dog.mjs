// Génère un CHIEN de test riggé/animé (GLB) + un manifest.json dans
// public/models/animals/, afin de valider le pipeline « chiens promenés »
// (chargement, normalisation à une taille réelle, détection des clips, mesure
// de la vitesse d'auteur sur la racine, laisse accrochée au cou) sans le vrai
// pack animalier. Pendant quadrupède de make-test-rig.mjs.
//
// Conventions identiques aux packs cibles (Quaternius) : Y-up, museau vers +Z,
// unités arbitraires (le jeu normalise), root motion dans Hips.position, clips
// Idle / Walk / Run / Eating / Sit.
//
// Usage : node scripts/make-test-dog.mjs
// NE PAS committer les fichiers générés : outil de développement uniquement.

// GLTFExporter suppose un FileReader navigateur ; polyfill minimal pour Node.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models/animals');

// Gabarit en unités ARBITRAIRES (≈ 2,35 de haut) : c'est justement ce que le
// jeu doit ramener aux 46 cm d'un shiba.
const D = {
  belly: 1.05, // hauteur du ventre
  bodyY: 1.4, // ligne de dos (axe des vertèbres)
  bodyLen: 2.1,
  bodyW: 0.62,
  bodyH: 0.72,
  legUp: 0.55,
  legLow: 0.42,
  pawH: 0.12,
  legX: 0.26,
};

/** Hauteur totale attendue du modèle, pour convertir les vitesses d'auteur. */
const RAW_HEIGHT = 2.35;
/** Taille réelle visée dans le manifeste (shiba : 46 cm oreilles comprises). */
const REAL_HEIGHT = 0.46;
const RAW_PER_METER = RAW_HEIGHT / REAL_HEIGHT;

function bone(name, x, y, z) {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  return b;
}

function buildDog() {
  // Colonne : le museau regarde +Z, la queue est en -Z.
  const hips = bone('Hips', 0, D.bodyY, -0.75);
  const spine = bone('Spine', 0, 0, 0.75);
  const chest = bone('Chest', 0, 0, 0.75);
  const neck = bone('Neck', 0, 0.3, 0.32);
  const head = bone('Head', 0, 0.28, 0.3);
  const tail = bone('Tail', 0, 0.16, -0.3);
  hips.add(spine);
  spine.add(chest);
  chest.add(neck);
  neck.add(head);
  hips.add(tail);

  const legs = [];
  for (const [tag, parent, z] of [
    ['FL', chest, 0.15],
    ['FR', chest, 0.15],
    ['BL', hips, -0.05],
    ['BR', hips, -0.05],
  ]) {
    const s = tag.endsWith('L') ? 1 : -1;
    const upper = bone(`Limb${tag}_Upper`, s * D.legX, D.belly - D.bodyY, z);
    upper.rotation.z = Math.PI; // +Y de l'os vers le bas (comme les jambes du rig humain)
    const lower = bone(`Limb${tag}_Lower`, 0, D.legUp, 0);
    const paw = bone(`Limb${tag}_Paw`, 0, D.legLow, 0);
    upper.add(lower);
    lower.add(paw);
    parent.add(upper);
    legs.push({ tag, upper, lower, paw });
  }

  const allBones = [hips, spine, chest, neck, head, tail, ...legs.flatMap((l) => [l.upper, l.lower, l.paw])];
  const boneIndex = new Map(allBones.map((b, i) => [b.name, i]));

  // [os, largeur, hauteur, profondeur, décalage le long de l'os, décalage Z, matériau]
  const boxes = [
    ['Spine', D.bodyW, D.bodyH, 1.5, 0, 0.05, 'Fur'],
    ['Chest', D.bodyW * 1.05, D.bodyH * 1.02, 0.8, 0, 0.1, 'Fur'],
    ['Neck', 0.34, 0.42, 0.34, 0.1, 0.06, 'Fur'],
    ['Head', 0.36, 0.34, 0.4, 0.12, 0.06, 'Fur'],
    ['Head', 0.2, 0.18, 0.24, 0.06, 0.3, 'Muzzle'], // museau : oriente la tête (+Z)
    ['Head', 0.08, 0.18, 0.06, 0.28, -0.02, 'Fur'], // oreilles : sommet du gabarit
    ['Tail', 0.11, 0.5, 0.11, 0.2, 0, 'Fur'],
    ...legs.flatMap((l) => [
      [`${l.tag && `Limb${l.tag}_Upper`}`, 0.19, D.legUp, 0.2, D.legUp / 2, 0, 'Fur'],
      [`Limb${l.tag}_Lower`, 0.15, D.legLow, 0.16, D.legLow / 2, 0, 'Fur'],
      [`Limb${l.tag}_Paw`, 0.17, D.pawH, 0.26, D.pawH / 2, 0.04, 'Paws'],
    ]),
  ];

  const COLORS = { Fur: '#c8a06a', Muzzle: '#f0e6d8', Paws: '#3a332c' };
  const mats = new Map();
  for (const [role, color] of Object.entries(COLORS)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    m.name = role;
    mats.set(role, m);
  }

  const positions = [];
  const normals = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];
  const groups = [];
  const matList = [];
  const matIdxOf = new Map();

  hips.updateMatrixWorld(true);
  const tmpM = new THREE.Matrix4();
  for (const [boneName, w, h, d, offY, offZ, role] of boxes) {
    const m = mats.get(role);
    if (!matIdxOf.has(m)) {
      matIdxOf.set(m, matList.length);
      matList.push(m);
    }
    const bIdx = boneIndex.get(boneName);
    const b = allBones[bIdx];
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, offY, offZ);
    tmpM.copy(b.matrixWorld);
    geo.applyMatrix4(tmpM);
    const start = indices.length;
    const base = positions.length / 3;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      skinIndices.push(bIdx, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    }
    const idx = geo.getIndex();
    for (let i = 0; i < idx.count; i++) indices.push(base + idx.getX(i));
    groups.push({ start, count: idx.count, matIdx: matIdxOf.get(m) });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  for (const g of groups) geometry.addGroup(g.start, g.count, g.matIdx);

  const mesh = new THREE.SkinnedMesh(geometry, matList);
  mesh.name = 'DogBody';
  mesh.add(hips);
  mesh.bind(new THREE.Skeleton(allBones));

  const root = new THREE.Group();
  root.name = 'DogRoot';
  root.add(mesh);

  // --- Animations ---
  const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const restQ = new Map(allBones.map((b) => [b.name, b.quaternion.clone()]));
  const mul = (name, q) => restQ.get(name).clone().multiply(q);
  const qArr = (q) => [q.x, q.y, q.z, q.w];
  const quatTrack = (name, times, quats) =>
    new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quats.flatMap(qArr));

  /** Piste de racine : bob vertical + déplacement réel (root motion). */
  function rootTrack(duration, metersPerSecond, bob) {
    const dz = metersPerSecond * duration * RAW_PER_METER;
    const p = hips.position;
    return new THREE.VectorKeyframeTrack(
      'Hips.position',
      [0, duration / 2, duration],
      [p.x, p.y, p.z, p.x, p.y + bob, p.z + dz / 2, p.x, p.y, p.z + dz],
    );
  }

  /** Cycle des quatre membres, déphasés en diagonale (trot). */
  function gaitTracks(duration, amp) {
    const t = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration];
    const phase = { FL: 0, BR: 0, FR: 0.5, BL: 0.5 };
    return legs.flatMap((l) => {
      const p = phase[l.tag];
      const swing = (u) => Math.sin((u + p) * Math.PI * 2) * amp;
      return [
        quatTrack(
          `Limb${l.tag}_Upper`,
          t,
          t.map((_, i) => mul(`Limb${l.tag}_Upper`, E(swing(i / 4), 0, 0))),
        ),
        quatTrack(
          `Limb${l.tag}_Lower`,
          t,
          t.map((_, i) => mul(`Limb${l.tag}_Lower`, E(0.25 + Math.max(0, -swing(i / 4)) * 0.9, 0, 0))),
        ),
      ];
    });
  }

  const idle = new THREE.AnimationClip('Idle', 2.4, [
    quatTrack('Spine', [0, 1.2, 2.4], [mul('Spine', E(0.01, 0, 0)), mul('Spine', E(0.03, 0, 0)), mul('Spine', E(0.01, 0, 0))]),
    quatTrack('Head', [0, 1.2, 2.4], [mul('Head', E(0, 0.08, 0)), mul('Head', E(0.04, -0.08, 0)), mul('Head', E(0, 0.08, 0))]),
    quatTrack('Tail', [0, 0.6, 1.2, 1.8, 2.4], [mul('Tail', E(0, 0.3, 0)), mul('Tail', E(0, -0.3, 0)), mul('Tail', E(0, 0.3, 0)), mul('Tail', E(0, -0.3, 0)), mul('Tail', E(0, 0.3, 0))]),
  ]);

  // 1 m/s : l'allure d'un chien qui suit quelqu'un qui marche.
  const walk = new THREE.AnimationClip('Walk', 1, [rootTrack(1, 1, 0.03), ...gaitTracks(1, 0.5)]);
  // 3 m/s : le trot du rattrapage.
  const run = new THREE.AnimationClip('Run', 0.55, [rootTrack(0.55, 3, 0.08), ...gaitTracks(0.55, 0.85)]);

  // Eating : museau au sol — c'est le reniflage de la promenade.
  const sniffHead = [mul('Head', E(0.5, 0, 0)), mul('Head', E(0.62, 0.06, 0)), mul('Head', E(0.5, 0, 0))];
  const eating = new THREE.AnimationClip('Eating', 1.6, [
    quatTrack('Neck', [0, 0.8, 1.6], [mul('Neck', E(0.85, 0, 0)), mul('Neck', E(0.95, 0, 0)), mul('Neck', E(0.85, 0, 0))]),
    quatTrack('Head', [0, 0.8, 1.6], sniffHead),
    quatTrack('Tail', [0, 0.4, 0.8, 1.2, 1.6], [mul('Tail', E(0, 0.35, 0)), mul('Tail', E(0, -0.35, 0)), mul('Tail', E(0, 0.35, 0)), mul('Tail', E(0, -0.35, 0)), mul('Tail', E(0, 0.35, 0))]),
  ]);

  // Sit : arrière-train au sol, avant-train dressé.
  const sitHips = [hips.position.x, hips.position.y - 0.42, hips.position.z - 0.1];
  const sit = new THREE.AnimationClip('Sit', 2, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 2], [...sitHips, ...sitHips]),
    quatTrack('Hips', [0, 2], [mul('Hips', E(-0.42, 0, 0)), mul('Hips', E(-0.42, 0, 0))]),
    quatTrack('Spine', [0, 2], [mul('Spine', E(0.3, 0, 0)), mul('Spine', E(0.3, 0, 0))]),
    quatTrack('LimbBL_Upper', [0, 2], [mul('LimbBL_Upper', E(-1.2, 0, 0)), mul('LimbBL_Upper', E(-1.2, 0, 0))]),
    quatTrack('LimbBR_Upper', [0, 2], [mul('LimbBR_Upper', E(-1.2, 0, 0)), mul('LimbBR_Upper', E(-1.2, 0, 0))]),
    quatTrack('LimbBL_Lower', [0, 2], [mul('LimbBL_Lower', E(1.5, 0, 0)), mul('LimbBL_Lower', E(1.5, 0, 0))]),
    quatTrack('LimbBR_Lower', [0, 2], [mul('LimbBR_Lower', E(1.5, 0, 0)), mul('LimbBR_Lower', E(1.5, 0, 0))]),
    quatTrack('Head', [0, 1, 2], [mul('Head', E(-0.05, 0.1, 0)), mul('Head', E(0, -0.1, 0)), mul('Head', E(-0.05, 0.1, 0))]),
  ]);

  return { root, animations: [idle, walk, run, eating, sit] };
}

mkdirSync(OUT, { recursive: true });
const { root, animations } = buildDog();
const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations });
writeFileSync(resolve(OUT, 'test_dog.glb'), Buffer.from(glb));
console.log('écrit test_dog.glb', `${(glb.byteLength / 1024).toFixed(1)} ko`);

writeFileSync(
  resolve(OUT, 'manifest.json'),
  JSON.stringify(
    {
      version: 1,
      source: 'RIG DE TEST make-test-dog.mjs — NE PAS COMMITTER',
      license: 'dev-only',
      variants: [{ id: 'test_dog', file: 'test_dog.glb', height: REAL_HEIGHT }],
    },
    null,
    2,
  ),
);
console.log('écrit animals/manifest.json — 1 race de test');
