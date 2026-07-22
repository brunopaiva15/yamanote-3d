// Rendu des PNJ : pool de groupes réutilisés, synchronisés chaque frame sur
// l'état de systems/passengers. Chaque voyageur est construit une fois à partir
// de son descripteur d'apparence (systems/appearance) : corpulence en géométrie
// (torse en LatheGeometry), habits haut/bas indépendants, coiffures, accessoires
// et visage en CanvasTexture. Le bas du corps est masqué en position assise.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paxList, POOL_SIZE, initPassengers } from '../systems/passengers';
import type { Appearance } from '../systems/appearance';
import { runtime } from '../systems/runtime';
import { makeFaceTexture } from '../textures/procedural';

const SEATED_DROP = 0.3;

// Repères verticaux locaux (pieds à y=0), calés sur l'ancienne silhouette.
const HIP_Y = 0.5;
const SHOULDER_Y = 1.06;
const HEAD_Y = 1.34;

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

interface CharSpec {
  lower: Part[]; // jambes / jupe (masqués assis)
  torso: Part[]; // torse, bras, cou, écharpe
  head: Part[]; // contenu du groupe tête articulé
  accessories: Part[]; // sacs (attachés au groupe principal)
}

interface PaxRefs {
  group: THREE.Group | null;
  lower: THREE.Group | null;
  head: THREE.Group | null;
}

// --- Caches partagés (mutualisés entre tous les PNJ) ---
const headGeo = new THREE.SphereGeometry(0.105, 16, 14);
const faceGeo = new THREE.PlaneGeometry(0.17, 0.17);
const neckGeo = new THREE.CylinderGeometry(0.05, 0.052, 0.16, 8);

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function cloth(color: string, rough = 0.85): THREE.MeshStandardMaterial {
  const key = `${rough}:${color}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    matCache.set(key, m);
  }
  return m;
}

// Torse en LatheGeometry : la corpulence vient du profil (épaules, taille,
// ventre, bassin), pas d'une mise à l'échelle uniforme.
function torsoGeometry(app: Appearance): THREE.LatheGeometry {
  const b = app.build;
  const long = app.top.type === 'coat' || app.bottom.type === 'dress';
  const bottomY = long ? 0.34 : 0.46;
  const flare = app.bottom.type === 'dress' ? 0.07 : app.top.type === 'coat' ? 0.02 : 0;
  const pts = [
    new THREE.Vector2(b.hipR + flare, bottomY),
    new THREE.Vector2(b.waistR, HIP_Y + 0.22),
    new THREE.Vector2(b.chestR, 0.95),
    new THREE.Vector2(b.shoulderR, SHOULDER_Y),
    new THREE.Vector2(b.shoulderR * 0.82, SHOULDER_Y + 0.08),
    new THREE.Vector2(0.052, SHOULDER_Y + 0.16),
  ];
  return new THREE.LatheGeometry(pts, 18);
}

// Manche / bras le long du corps (couleur du haut ; peau si t-shirt).
function armGeometry(): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(0.046, 0.04, 0.5, 8);
}

function buildChar(app: Appearance, id: number): CharSpec {
  const b = app.build;
  const skinMat = new THREE.MeshStandardMaterial({ color: app.skin, roughness: 0.7 });
  const topMat = cloth(app.top.color);
  const bottomMat = cloth(app.bottom.color);
  const shoeMat = cloth(app.shoes, 0.6);

  const lower: Part[] = [];
  const torso: Part[] = [];
  const head: Part[] = [];
  const accessories: Part[] = [];

  // --- Bas du corps ---
  const legX = 0.062;
  const shoeGeo = new THREE.BoxGeometry(0.09, 0.05, 0.16);
  const bare = app.bottom.type === 'skirt' || app.bottom.type === 'dress';
  if (bare) {
    // Jambes nues (peau) sous jupe / robe.
    const legGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.48, 7);
    for (const s of [-1, 1]) {
      lower.push({ geo: legGeo, mat: skinMat, position: [s * legX, 0.27, 0] });
      lower.push({ geo: shoeGeo, mat: shoeMat, position: [s * legX, 0.03, 0.03] });
    }
    if (app.bottom.type === 'skirt') {
      const skirtGeo = new THREE.CylinderGeometry(b.hipR + 0.01, b.hipR + 0.12, 0.34, 16, 1, true);
      lower.push({ geo: skirtGeo, mat: bottomMat, position: [0, 0.55, 0] });
    }
  } else if (app.bottom.type === 'shorts') {
    const thighGeo = new THREE.CylinderGeometry(b.legR, b.legR * 0.92, 0.26, 8);
    const shinGeo = new THREE.CylinderGeometry(0.042, 0.038, 0.26, 7);
    for (const s of [-1, 1]) {
      lower.push({ geo: thighGeo, mat: bottomMat, position: [s * legX, 0.4, 0] });
      lower.push({ geo: shinGeo, mat: skinMat, position: [s * legX, 0.16, 0] });
      lower.push({ geo: shoeGeo, mat: shoeMat, position: [s * legX, 0.03, 0.03] });
    }
  } else {
    // Pantalon : deux jambes pleines.
    const legGeo = new THREE.CylinderGeometry(b.legR, b.legR * 0.85, 0.5, 8);
    for (const s of [-1, 1]) {
      lower.push({ geo: legGeo, mat: bottomMat, position: [s * legX, 0.28, 0] });
      lower.push({ geo: shoeGeo, mat: shoeMat, position: [s * legX, 0.03, 0.03] });
    }
  }

  // --- Torse + cou + bras ---
  torso.push({ geo: torsoGeometry(app), mat: topMat, position: [0, 0, 0] });
  torso.push({ geo: neckGeo, mat: skinMat, position: [0, SHOULDER_Y + 0.14, 0] });

  const shortSleeve = app.top.type === 'tshirt';
  const armMat = shortSleeve ? skinMat : topMat;
  const armGeo = armGeometry();
  const handGeo = new THREE.SphereGeometry(0.04, 8, 7);
  const armX = b.shoulderR + 0.03;
  for (const s of [-1, 1]) {
    torso.push({ geo: armGeo, mat: armMat, position: [s * armX, 0.82, 0], rotation: [0, 0, s * 0.09] });
    torso.push({ geo: handGeo, mat: skinMat, position: [s * (armX + 0.05), 0.58, 0] });
  }

  // Écharpe (tore autour du cou).
  if (app.scarf) {
    const scarfGeo = new THREE.TorusGeometry(0.085, 0.032, 8, 16);
    torso.push({ geo: scarfGeo, mat: cloth(app.scarfColor, 0.9), position: [0, SHOULDER_Y + 0.12, 0], rotation: [Math.PI / 2, 0, 0] });
  }

  // --- Tête (dans le groupe articulé, origine à HEAD_Y) ---
  head.push({ geo: headGeo, mat: skinMat, position: [0, 0, 0] });

  const hairMat = cloth(app.hair.color, 0.88);
  const hasHat = app.hat !== 'none';
  if (!hasHat && app.hair.style !== 'bald') {
    // Calotte de base.
    const capScale: [number, number, number] =
      app.hair.style === 'buzz' ? [1, 0.68, 0.95] : [1, 0.84, 0.98];
    const capGeo = new THREE.SphereGeometry(app.hair.style === 'buzz' ? 0.108 : 0.113, 14, 12);
    head.push({ geo: capGeo, mat: hairMat, position: [0, 0.03, -0.02], scale: capScale });
    // Volumes arrière selon la coiffure.
    if (app.hair.style === 'bun') {
      head.push({ geo: new THREE.SphereGeometry(0.05, 10, 9), mat: hairMat, position: [0, 0.07, -0.11] });
    } else if (app.hair.style === 'ponytail') {
      head.push({ geo: new THREE.CylinderGeometry(0.03, 0.02, 0.2, 8), mat: hairMat, position: [0, -0.06, -0.12], rotation: [0.3, 0, 0] });
    } else if (app.hair.style === 'long') {
      head.push({ geo: new RoundedBoxGeometry(0.2, 0.26, 0.11, 3, 0.05), mat: hairMat, position: [0, -0.11, -0.05] });
    }
  }

  // Couvre-chef.
  if (app.hat === 'beanie') {
    head.push({ geo: new THREE.SphereGeometry(0.12, 14, 12), mat: cloth(app.hair.color === '#17151a' ? '#3a5a8a' : app.scarfColor, 0.9), position: [0, 0.055, 0], scale: [1, 0.86, 1] });
  } else if (app.hat === 'cap') {
    const capMat = cloth(app.scarfColor, 0.7);
    head.push({ geo: new THREE.SphereGeometry(0.118, 14, 12), mat: capMat, position: [0, 0.05, 0], scale: [1, 0.6, 1] });
    head.push({ geo: new THREE.BoxGeometry(0.16, 0.02, 0.09), mat: capMat, position: [0, 0.03, 0.11] });
  }

  head.push({
    geo: faceGeo,
    mat: new THREE.MeshBasicMaterial({ map: makeFaceTexture(app, id), transparent: true, toneMapped: false }),
    position: [0, -0.005, 0.102],
  });

  // --- Sacs (groupe principal) ---
  const bagMat = cloth(app.bagColor, 0.7);
  if (app.bag === 'backpack') {
    accessories.push({ geo: new RoundedBoxGeometry(0.24, 0.3, 0.14, 3, 0.04), mat: bagMat, position: [0, 0.92, -(b.chestR + 0.09)] });
  } else if (app.bag === 'shoulder') {
    accessories.push({ geo: new RoundedBoxGeometry(0.16, 0.2, 0.07, 3, 0.03), mat: bagMat, position: [0.16, 0.72, 0.06] });
    accessories.push({ geo: new THREE.BoxGeometry(0.025, 0.44, 0.02), mat: bagMat, position: [0.02, 0.92, 0.02], rotation: [0, 0, 0.7] });
  } else if (app.bag === 'hand') {
    accessories.push({ geo: new RoundedBoxGeometry(0.14, 0.16, 0.07, 3, 0.02), mat: bagMat, position: [armX + 0.06, 0.5, 0.04] });
    accessories.push({ geo: new THREE.TorusGeometry(0.035, 0.008, 6, 12), mat: bagMat, position: [armX + 0.06, 0.6, 0.04], rotation: [Math.PI / 2, 0, 0] });
  }

  return { lower, torso, head, accessories };
}

function Parts({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <mesh
          key={i}
          geometry={p.geo}
          material={p.mat}
          position={p.position}
          rotation={p.rotation}
          scale={p.scale}
        />
      ))}
    </>
  );
}

export function Passengers() {
  initPassengers();
  const refs = useRef<PaxRefs[]>(
    Array.from({ length: POOL_SIZE }, () => ({ group: null, lower: null, head: null })),
  );

  const perPax = useMemo(() => paxList.map((p) => buildChar(p.appearance, p.id)), []);

  useFrame(() => {
    for (let i = 0; i < paxList.length; i++) {
      const p = paxList[i];
      const r = refs.current[i];
      if (!r.group) continue;
      if (p.state === 'hidden') {
        r.group.visible = false;
        continue;
      }
      r.group.visible = true;
      const seated = p.state === 'seated';
      const standingSway = p.state === 'standing' ? runtime.sway * 0.035 : 0;
      const seatedSway = seated ? runtime.sway * 0.012 : 0;
      r.group.position.set(
        p.pos.x + (p.state === 'standing' ? runtime.sway * 0.02 : 0),
        p.pos.y + p.bob - (seated ? SEATED_DROP : 0),
        p.pos.z,
      );
      r.group.rotation.set(p.bodyLean, p.yaw, standingSway + seatedSway);
      r.group.scale.setScalar(p.height);
      if (r.lower) r.lower.visible = !seated;
      // Tête vivante : regard et hochements pilotés par la couche d'actions.
      if (r.head) r.head.rotation.set(p.headPitch, p.headYaw, 0);
    }
  });

  return (
    <group>
      {paxList.map((p, i) => (
        <group
          key={`pax${p.id}`}
          visible={false}
          ref={(g) => {
            refs.current[i].group = g;
          }}
        >
          {/* Bas du corps (masqué en position assise) */}
          <group
            ref={(g) => {
              refs.current[i].lower = g;
            }}
          >
            <Parts parts={perPax[i].lower} />
          </group>
          {/* Torse, bras, cou, écharpe */}
          <Parts parts={perPax[i].torso} />
          {/* Sacs */}
          <Parts parts={perPax[i].accessories} />
          {/* Tête articulée (regards, hochements, éternuements) */}
          <group
            position={[0, HEAD_Y, 0]}
            ref={(g) => {
              refs.current[i].head = g;
            }}
          >
            <Parts parts={perPax[i].head} />
          </group>
        </group>
      ))}
    </group>
  );
}
