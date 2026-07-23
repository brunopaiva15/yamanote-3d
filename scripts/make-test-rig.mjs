// Génère des personnages de TEST riggés/animés (GLB) + un manifest.json dans
// public/models/, afin de valider le pipeline « personnages librairie »
// (chargement, clonage, mixer, overrides d'os) sans les vrais packs.
// Conventions identiques aux packs cibles (Quaternius/KayKit) : Y-up, face +Z,
// os Y le long du segment, clips Idle / Walk / Sit_Chair_Idle.
// Usage : node scripts/make-test-rig.mjs
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

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models');

// Squelette : longueurs (m) d'un humanoïde ~1,72 m, pieds à y=0.
const L = {
  hipsY: 0.94,
  spine: 0.14,
  chest: 0.28,
  neck: 0.1,
  head: 0.26, // jusqu'au sommet du crâne
  upperArm: 0.28,
  foreArm: 0.26,
  hand: 0.09,
  upLeg: 0.44,
  leg: 0.42,
  footH: 0.08, // hauteur de cheville
  footL: 0.24,
  shoulderX: 0.19,
  hipX: 0.095,
};

function bone(name, x, y, z) {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  return b;
}

// Construit squelette + géométrie skinnée (boîtes rigides par os) et 3 clips.
function buildCharacter({ suit, skin, hair, top, bottom, shoes }) {
  const hips = bone('Hips', 0, L.hipsY, 0);
  const spine = bone('Spine', 0, L.spine, 0);
  const chest = bone('Chest', 0, L.chest, 0);
  const neck = bone('Neck', 0, 0.22, 0);
  const head = bone('Head', 0, L.neck, 0);
  spine.add(chest);
  hips.add(spine);
  chest.add(neck);
  neck.add(head);

  const sides = { L: 1, R: -1 };
  const arms = {};
  const legs = {};
  for (const [suffix, s] of Object.entries(sides)) {
    const upperArm = bone(`UpperArm_${suffix}`, s * L.shoulderX, 0.18, 0);
    upperArm.rotation.z = s * Math.PI; // Y de l'os pointe vers le coude (bras le long du corps)
    const foreArm = bone(`ForeArm_${suffix}`, 0, L.upperArm, 0);
    const hand = bone(`Hand_${suffix}`, 0, L.foreArm, 0);
    upperArm.add(foreArm);
    foreArm.add(hand);
    chest.add(upperArm);
    arms[suffix] = { upperArm, foreArm, hand };

    const upLeg = bone(`UpLeg_${suffix}`, s * L.hipX, 0, 0);
    upLeg.rotation.z = Math.PI; // Y de l'os vers le genou (vers le bas)
    const leg = bone(`Leg_${suffix}`, 0, L.upLeg, 0);
    const foot = bone(`Foot_${suffix}`, 0, L.leg - L.footH, 0);
    upLeg.add(leg);
    leg.add(foot);
    hips.add(upLeg);
    legs[suffix] = { upLeg, leg, foot };
  }

  const allBones = [
    hips, spine, chest, neck, head,
    arms.L.upperArm, arms.L.foreArm, arms.L.hand,
    arms.R.upperArm, arms.R.foreArm, arms.R.hand,
    legs.L.upLeg, legs.L.leg, legs.L.foot,
    legs.R.upLeg, legs.R.leg, legs.R.foot,
  ];
  const boneIndex = new Map(allBones.map((b, i) => [b.name, i]));

  // Géométrie : un pavé (légèrement biseauté par segments) par os, pondération
  // rigide → silhouette lisible et suffisante pour valider le pipeline.
  const boxes = [
    // [bone, w, h, d, offsetY(le long de l'os), offsetZ, matériau]
    ['Hips', 0.3, 0.22, 0.19, 0.03, 0, bottom],
    ['Spine', 0.28, 0.18, 0.18, 0.08, 0, top],
    ['Chest', 0.32, 0.3, 0.2, 0.12, 0, top],
    ['Neck', 0.09, 0.12, 0.09, 0.04, 0, skin],
    ['Head', 0.2, 0.24, 0.22, 0.12, 0.01, skin],
    ['Head', 0.21, 0.1, 0.23, 0.22, -0.01, hair], // calotte cheveux
    ['Head', 0.045, 0.05, 0.05, 0.1, 0.12, hair], // nez marqué : oriente le visage (+Z)
    ['UpperArm_L', 0.09, L.upperArm, 0.09, L.upperArm / 2, 0, top],
    ['ForeArm_L', 0.08, L.foreArm, 0.08, L.foreArm / 2, 0, suit ? top : skin],
    ['Hand_L', 0.08, L.hand, 0.09, L.hand / 2, 0, skin],
    ['UpperArm_R', 0.09, L.upperArm, 0.09, L.upperArm / 2, 0, top],
    ['ForeArm_R', 0.08, L.foreArm, 0.08, L.foreArm / 2, 0, suit ? top : skin],
    ['Hand_R', 0.08, L.hand, 0.09, L.hand / 2, 0, skin],
    ['UpLeg_L', 0.12, L.upLeg, 0.13, L.upLeg / 2, 0, bottom],
    ['Leg_L', 0.1, L.leg - L.footH, 0.11, (L.leg - L.footH) / 2, 0, bottom],
    ['Foot_L', 0.1, L.footH, L.footL, L.footH / 2, -0.07, shoes],
    ['UpLeg_R', 0.12, L.upLeg, 0.13, L.upLeg / 2, 0, bottom],
    ['Leg_R', 0.1, L.leg - L.footH, 0.11, (L.leg - L.footH) / 2, 0, bottom],
    ['Foot_R', 0.1, L.footH, L.footL, L.footH / 2, -0.07, shoes],
  ];

  // Matériaux nommés par rôle → la teinte runtime peut cibler par nom.
  const mats = new Map();
  function mat(role, color) {
    const key = role;
    if (!mats.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      m.name = role;
      mats.set(key, m);
    }
    return mats.get(key);
  }
  const matFor = { [skin]: mat('Skin', skin), [hair]: mat('Hair', hair), [top]: mat('Top', top), [bottom]: mat('Bottom', bottom), [shoes]: mat('Shoes', shoes) };

  // Fusion en UNE géométrie skinnée, groupes par matériau.
  const positions = [];
  const normals = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];
  const groups = []; // {start, count, matIdx}
  const matList = [];
  const matIdxOf = new Map();

  hips.updateMatrixWorld(true);
  const tmpM = new THREE.Matrix4();
  const tmpN = new THREE.Matrix3();
  for (const [boneName, w, h, d, offY, offZ, colorKey] of boxes) {
    const m = matFor[colorKey];
    if (!matIdxOf.has(m)) {
      matIdxOf.set(m, matList.length);
      matList.push(m);
    }
    const matIdx = matIdxOf.get(m);
    const bIdx = boneIndex.get(boneName);
    const b = allBones[bIdx];
    const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    geo.translate(0, offY, offZ);
    // Vers l'espace monde du squelette au repos (bind pose).
    tmpM.copy(b.matrixWorld);
    geo.applyMatrix4(tmpM);
    tmpN.getNormalMatrix(tmpM);
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
    groups.push({ start, count: idx.count, matIdx });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  for (const g of groups) geometry.addGroup(g.start, g.count, g.matIdx);

  const mesh = new THREE.SkinnedMesh(geometry, matList);
  mesh.name = 'Body';
  const skeleton = new THREE.Skeleton(allBones);
  mesh.add(hips);
  mesh.bind(skeleton);

  const root = new THREE.Group();
  root.name = 'CharacterRoot';
  root.add(mesh);

  // --- Animations (quaternions par os, boucles 1 s / 2 s) ---
  const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const restQ = new Map(allBones.map((b) => [b.name, b.quaternion.clone()]));
  const mul = (name, q) => restQ.get(name).clone().multiply(q);
  const qArr = (q) => [q.x, q.y, q.z, q.w];

  function quatTrack(boneName, times, quats) {
    return new THREE.QuaternionKeyframeTrack(
      `${boneName}.quaternion`,
      times,
      quats.flatMap((q) => qArr(q)),
    );
  }

  // Idle : léger balancement du buste + respiration.
  const idle = new THREE.AnimationClip('Idle', 2, [
    quatTrack('Spine', [0, 1, 2], [mul('Spine', E(0.02, 0, 0)), mul('Spine', E(0.045, 0, 0.012)), mul('Spine', E(0.02, 0, 0))]),
    quatTrack('Head', [0, 1, 2], [mul('Head', E(0, 0, 0)), mul('Head', E(0.03, 0.04, 0)), mul('Head', E(0, 0, 0))]),
    quatTrack('UpperArm_L', [0, 1, 2], [mul('UpperArm_L', E(0, 0, -0.06)), mul('UpperArm_L', E(0.02, 0, -0.08)), mul('UpperArm_L', E(0, 0, -0.06))]),
    quatTrack('UpperArm_R', [0, 1, 2], [mul('UpperArm_R', E(0, 0, 0.06)), mul('UpperArm_R', E(0.02, 0, 0.08)), mul('UpperArm_R', E(0, 0, 0.06))]),
  ]);

  // Walk : cycle jambes/bras opposés, 1 s (≈ 1,4 m/s pour ce gabarit).
  const A = 0.55; // amplitude cuisses
  const walk = new THREE.AnimationClip('Walk', 1, [
    quatTrack('UpLeg_L', [0, 0.25, 0.5, 0.75, 1], [mul('UpLeg_L', E(-A, 0, 0)), mul('UpLeg_L', E(0, 0, 0)), mul('UpLeg_L', E(A, 0, 0)), mul('UpLeg_L', E(0, 0, 0)), mul('UpLeg_L', E(-A, 0, 0))]),
    quatTrack('UpLeg_R', [0, 0.25, 0.5, 0.75, 1], [mul('UpLeg_R', E(A, 0, 0)), mul('UpLeg_R', E(0, 0, 0)), mul('UpLeg_R', E(-A, 0, 0)), mul('UpLeg_R', E(0, 0, 0)), mul('UpLeg_R', E(A, 0, 0))]),
    quatTrack('Leg_L', [0, 0.25, 0.5, 0.75, 1], [mul('Leg_L', E(0.35, 0, 0)), mul('Leg_L', E(0.7, 0, 0)), mul('Leg_L', E(0.08, 0, 0)), mul('Leg_L', E(0.15, 0, 0)), mul('Leg_L', E(0.35, 0, 0))]),
    quatTrack('Leg_R', [0, 0.25, 0.5, 0.75, 1], [mul('Leg_R', E(0.08, 0, 0)), mul('Leg_R', E(0.15, 0, 0)), mul('Leg_R', E(0.35, 0, 0)), mul('Leg_R', E(0.7, 0, 0)), mul('Leg_R', E(0.08, 0, 0))]),
    quatTrack('UpperArm_L', [0, 0.5, 1], [mul('UpperArm_L', E(0.4, 0, -0.06)), mul('UpperArm_L', E(-0.4, 0, -0.06)), mul('UpperArm_L', E(0.4, 0, -0.06))]),
    quatTrack('UpperArm_R', [0, 0.5, 1], [mul('UpperArm_R', E(-0.4, 0, 0.06)), mul('UpperArm_R', E(0.4, 0, 0.06)), mul('UpperArm_R', E(-0.4, 0, 0.06))]),
    quatTrack('Spine', [0, 0.5, 1], [mul('Spine', E(0.06, 0.05, 0)), mul('Spine', E(0.06, -0.05, 0)), mul('Spine', E(0.06, 0.05, 0))]),
  ]);

  // Sit_Chair_Idle : cuisses à l'horizontale vers +Z, tibias verticaux, dos
  // léger arrondi, mains sur les cuisses. Hanches descendues (translation).
  const sitHipDrop = L.upLeg * 0.86; // hanches ≈ hauteur d'assise
  const sitHipsPos = [0, L.hipsY - sitHipDrop, -0.06];
  const sit = new THREE.AnimationClip('Sit_Chair_Idle', 2, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, 2], [...sitHipsPos, ...sitHipsPos]),
    quatTrack('Hips', [0, 2], [mul('Hips', E(-0.06, 0, 0)), mul('Hips', E(-0.06, 0, 0))]),
    quatTrack('UpLeg_L', [0, 2], [mul('UpLeg_L', E(-1.5, 0, -0.06)), mul('UpLeg_L', E(-1.5, 0, -0.06))]),
    quatTrack('UpLeg_R', [0, 2], [mul('UpLeg_R', E(-1.5, 0, 0.06)), mul('UpLeg_R', E(-1.5, 0, 0.06))]),
    quatTrack('Leg_L', [0, 2], [mul('Leg_L', E(1.44, 0, 0)), mul('Leg_L', E(1.44, 0, 0))]),
    quatTrack('Leg_R', [0, 2], [mul('Leg_R', E(1.44, 0, 0)), mul('Leg_R', E(1.44, 0, 0))]),
    quatTrack('Foot_L', [0, 2], [mul('Foot_L', E(-0.06, 0, 0)), mul('Foot_L', E(-0.06, 0, 0))]),
    quatTrack('Foot_R', [0, 2], [mul('Foot_R', E(-0.06, 0, 0)), mul('Foot_R', E(-0.06, 0, 0))]),
    quatTrack('Spine', [0, 1, 2], [mul('Spine', E(0.12, 0, 0)), mul('Spine', E(0.14, 0, 0)), mul('Spine', E(0.12, 0, 0))]),
    quatTrack('UpperArm_L', [0, 2], [mul('UpperArm_L', E(0.55, 0, -0.1)), mul('UpperArm_L', E(0.55, 0, -0.1))]),
    quatTrack('UpperArm_R', [0, 2], [mul('UpperArm_R', E(0.55, 0, 0.1)), mul('UpperArm_R', E(0.55, 0, 0.1))]),
    quatTrack('ForeArm_L', [0, 2], [mul('ForeArm_L', E(-0.5, 0, 0)), mul('ForeArm_L', E(-0.5, 0, 0))]),
    quatTrack('ForeArm_R', [0, 2], [mul('ForeArm_R', E(-0.5, 0, 0)), mul('ForeArm_R', E(-0.5, 0, 0))]),
  ]);

  return { root, animations: [idle, walk, sit] };
}

const VARIANTS = [
  { file: 'test_salaryman.glb', suit: true, skin: '#e8cfae', hair: '#241f1c', top: '#2e3444', bottom: '#2f3540', shoes: '#1a1a1e', archetypes: ['salaryman', 'senior'], feminine: false },
  { file: 'test_casual_m.glb', suit: false, skin: '#d3a97e', hair: '#433124', top: '#4a7fc0', bottom: '#3a4a60', shoes: '#3a3128', archetypes: ['casual', 'student', 'tourist'], feminine: false },
  { file: 'test_casual_f.glb', suit: false, skin: '#f1d7ba', hair: '#17151a', top: '#c07fb0', bottom: '#43536a', shoes: '#45454c', archetypes: ['officeLady', 'casual', 'student', 'tourist', 'senior'], feminine: true },
];

mkdirSync(OUT, { recursive: true });
const exporter = new GLTFExporter();
const manifestVariants = [];
for (const v of VARIANTS) {
  const { root, animations } = buildCharacter(v);
  const glb = await exporter.parseAsync(root, { binary: true, animations });
  writeFileSync(resolve(OUT, v.file), Buffer.from(glb));
  manifestVariants.push({ id: v.file.replace(/\.glb$/, ''), file: v.file, archetypes: v.archetypes, feminine: v.feminine });
  console.log('écrit', v.file, `${(glb.byteLength / 1024).toFixed(1)} ko`);
}

const manifest = {
  version: 1,
  source: 'RIG DE TEST make-test-rig.mjs — NE PAS COMMITTER',
  license: 'dev-only',
  walkClipSpeed: 1.4,
  variants: manifestVariants,
};
writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('écrit manifest.json —', manifestVariants.length, 'variantes');
