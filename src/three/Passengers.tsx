// Rendu des PNJ : pool de groupes réutilisés, synchronisés chaque frame sur
// l'état de systems/passengers. Chaque voyageur est construit une fois à partir
// de son descripteur d'apparence (systems/appearance) : corpulence en géométrie
// (torse en LatheGeometry), habits haut/bas indépendants (avec détail de face et
// motifs), coiffures, accessoires et visage en CanvasTexture. Les bras sont
// articulés (postures : poignée, téléphone, poches, mains sur les genoux) et le
// bas du corps bascule entre debout et assis.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paxList, POOL_SIZE, initPassengers } from '../systems/passengers';
import type { Appearance } from '../systems/appearance';
import { runtime } from '../systems/runtime';
import { makeFaceTexture, makeGarmentDecal, makeStripeTexture, makePlaidTexture } from '../textures/procedural';

// Repères verticaux locaux (pieds à y=0), calés sur l'ancienne silhouette.
const HIP_Y = 0.5;
const SHOULDER_Y = 1.06;
const HEAD_Y = 1.34;

// Assise : au lieu d'enfoncer tout le corps (le bassin passait SOUS le coussin
// à ~0,45 m), on garde le bassin posé sur le coussin et on abaisse le buste par
// compression verticale, pivot au bassin (PELVIS_Y). Le haut du corps (torse,
// bras, sacs, tête) vit dans un groupe « upper » qu'on écrase en Y quand assis.
const PELVIS_Y = 0.46;
const SEATED_SQUASH = 0.8; // tête ~1,16 assis (≈ hauteur d'assise réelle)

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

interface CharSpec {
  lower: Part[]; // jambes / jupe debout (masqués assis)
  seated: Part[]; // jambes repliées assis (masquées debout)
  torso: Part[]; // torse, cou, écharpe, détail de vêtement
  head: Part[]; // contenu du groupe tête articulé
  accessories: Part[]; // sacs (attachés au groupe principal)
  armMat: THREE.Material; // manche (ou peau si t-shirt)
  skinMat: THREE.Material;
  armX: number; // demi-écart des épaules
}

interface ArmRef {
  shoulder: THREE.Group | null;
  elbow: THREE.Group | null;
}
interface PaxRefs {
  group: THREE.Group | null;
  upper: THREE.Group | null; // buste (compressé en Y quand assis)
  lower: THREE.Group | null;
  seated: THREE.Group | null;
  head: THREE.Group | null;
  arms: [ArmRef, ArmRef]; // [gauche s=-1, droite s=+1]
}

// --- Caches partagés (mutualisés entre tous les PNJ) ---
const headGeo = new THREE.SphereGeometry(0.105, 16, 14);
const faceGeo = new THREE.PlaneGeometry(0.17, 0.17);
const neckGeo = new THREE.CylinderGeometry(0.05, 0.052, 0.16, 8);
const upperArmGeo = new THREE.CylinderGeometry(0.045, 0.043, 0.26, 8);
const foreArmGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.24, 8);
const handGeo = new THREE.SphereGeometry(0.042, 8, 7);
const decalGeo = new THREE.PlaneGeometry(0.22, 0.44);

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

// Assombrit une couleur hex (mélange vers le noir) pour les motifs.
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - k));
  const g = Math.round(((n >> 8) & 255) * (1 - k));
  const b = Math.round((n & 255) * (1 - k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
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

function buildChar(app: Appearance, id: number): CharSpec {
  const b = app.build;
  const skinMat = new THREE.MeshStandardMaterial({ color: app.skin, roughness: 0.7 });
  const bottomMat = cloth(app.bottom.color);
  const shoeMat = cloth(app.shoes, 0.6);

  // Haut : couleur unie, ou motif (rayures / carreaux) pour certains casual.
  let topMat: THREE.Material = cloth(app.top.color);
  const patternable = app.top.type === 'tshirt' || app.top.type === 'sweater' || app.top.type === 'hoodie' || app.top.type === 'blouse';
  const pr = ((id * 2246822519) >>> 0) / 4294967296;
  if (patternable && pr < 0.3) {
    const accent = shade(app.top.color, 0.35);
    const tex = pr < 0.18 ? makeStripeTexture(app.top.color, accent) : makePlaidTexture(app.top.color, accent);
    topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  }

  const lower: Part[] = [];
  const seated: Part[] = [];
  const torso: Part[] = [];
  const head: Part[] = [];
  const accessories: Part[] = [];

  const legX = 0.062;
  const shoeGeo = new THREE.BoxGeometry(0.09, 0.05, 0.16);
  const bare = app.bottom.type === 'skirt' || app.bottom.type === 'dress';

  // --- Bas du corps DEBOUT ---
  if (bare) {
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
    const legGeo = new THREE.CylinderGeometry(b.legR, b.legR * 0.85, 0.5, 8);
    for (const s of [-1, 1]) {
      lower.push({ geo: legGeo, mat: bottomMat, position: [s * legX, 0.28, 0] });
      lower.push({ geo: shoeGeo, mat: shoeMat, position: [s * legX, 0.03, 0.03] });
    }
  }

  // --- Bas du corps ASSIS : cuisses en avant (+z local, vers l'allée) sur le
  // coussin (~0,47) puis tibias verticaux jusqu'au sol (y=0). Pas d'enfoncement :
  // le bassin repose sur le coussin. ---
  {
    const thighMat = bare ? skinMat : bottomMat;
    const shinMat = bare || app.bottom.type === 'shorts' ? skinMat : bottomMat;
    const thighGeo = new THREE.CylinderGeometry(b.legR + 0.005, b.legR, 0.34, 8);
    const shinGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.44, 8);
    for (const s of [-1, 1]) {
      seated.push({ geo: thighGeo, mat: thighMat, position: [s * legX, 0.47, 0.17], rotation: [Math.PI / 2, 0, 0] });
      seated.push({ geo: shinGeo, mat: shinMat, position: [s * legX, 0.26, 0.34] });
      seated.push({ geo: shoeGeo, mat: shoeMat, position: [s * legX, 0.04, 0.37] });
    }
    if (bare) {
      // Jupe / robe qui drape sur les genoux.
      seated.push({ geo: new RoundedBoxGeometry(2 * b.hipR + 0.06, 0.1, 0.4, 3, 0.04), mat: bottomMat, position: [0, 0.49, 0.16] });
    }
  }

  // --- Torse + cou + écharpe + détail de vêtement ---
  torso.push({ geo: torsoGeometry(app), mat: topMat, position: [0, 0, 0] });
  torso.push({ geo: neckGeo, mat: skinMat, position: [0, SHOULDER_Y + 0.14, 0] });

  if (app.scarf) {
    const scarfGeo = new THREE.TorusGeometry(0.085, 0.032, 8, 16);
    torso.push({ geo: scarfGeo, mat: cloth(app.scarfColor, 0.9), position: [0, SHOULDER_Y + 0.12, 0], rotation: [Math.PI / 2, 0, 0] });
  }

  const decal = makeGarmentDecal(app, id);
  if (decal) {
    torso.push({
      geo: decalGeo,
      mat: new THREE.MeshStandardMaterial({ map: decal, transparent: true, alphaTest: 0.5, roughness: 0.85 }),
      position: [0, 0.9, b.chestR - 0.002],
    });
  }

  // --- Tête (dans le groupe articulé, origine à HEAD_Y) ---
  head.push({ geo: headGeo, mat: skinMat, position: [0, 0, 0] });

  const hairMat = cloth(app.hair.color, 0.88);
  const hasHat = app.hat !== 'none';
  if (!hasHat && app.hair.style !== 'bald') {
    const capScale: [number, number, number] =
      app.hair.style === 'buzz' ? [1, 0.68, 0.95] : [1, 0.84, 0.98];
    const capGeo = new THREE.SphereGeometry(app.hair.style === 'buzz' ? 0.108 : 0.113, 14, 12);
    head.push({ geo: capGeo, mat: hairMat, position: [0, 0.03, -0.02], scale: capScale });
    if (app.hair.style === 'bun') {
      head.push({ geo: new THREE.SphereGeometry(0.05, 10, 9), mat: hairMat, position: [0, 0.07, -0.11] });
    } else if (app.hair.style === 'ponytail') {
      head.push({ geo: new THREE.CylinderGeometry(0.03, 0.02, 0.2, 8), mat: hairMat, position: [0, -0.06, -0.12], rotation: [0.3, 0, 0] });
    } else if (app.hair.style === 'long') {
      head.push({ geo: new RoundedBoxGeometry(0.2, 0.26, 0.11, 3, 0.05), mat: hairMat, position: [0, -0.11, -0.05] });
    }
  }

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
  const armX = b.shoulderR + 0.02;
  const bagMat = cloth(app.bagColor, 0.7);
  if (app.bag === 'backpack') {
    accessories.push({ geo: new RoundedBoxGeometry(0.24, 0.3, 0.14, 3, 0.04), mat: bagMat, position: [0, 0.92, -(b.chestR + 0.09)] });
  } else if (app.bag === 'shoulder') {
    accessories.push({ geo: new RoundedBoxGeometry(0.16, 0.2, 0.07, 3, 0.03), mat: bagMat, position: [0.16, 0.72, 0.06] });
    accessories.push({ geo: new THREE.BoxGeometry(0.025, 0.44, 0.02), mat: bagMat, position: [0.02, 0.92, 0.02], rotation: [0, 0, 0.7] });
  } else if (app.bag === 'hand') {
    accessories.push({ geo: new RoundedBoxGeometry(0.14, 0.16, 0.07, 3, 0.02), mat: bagMat, position: [armX + 0.08, 0.5, 0.05] });
  }

  const armMat = app.top.type === 'tshirt' ? skinMat : topMat;
  return { lower, seated, torso, head, accessories, armMat, skinMat, armX };
}

function Parts({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={p.mat} position={p.position} rotation={p.rotation} scale={p.scale} />
      ))}
    </>
  );
}

// Un bras articulé : épaule pivot → coude pivot → avant-bras + main.
function Arm({ spec, s, armRef }: { spec: CharSpec; s: -1 | 1; armRef: ArmRef }) {
  return (
    <group
      position={[s * spec.armX, SHOULDER_Y, 0]}
      ref={(g) => {
        armRef.shoulder = g;
      }}
    >
      <mesh geometry={upperArmGeo} material={spec.armMat} position={[0, -0.13, 0]} />
      <group
        position={[0, -0.26, 0]}
        ref={(g) => {
          armRef.elbow = g;
        }}
      >
        <mesh geometry={foreArmGeo} material={spec.armMat} position={[0, -0.12, 0]} />
        <mesh geometry={handGeo} material={spec.skinMat} position={[0, -0.25, 0]} />
      </group>
    </group>
  );
}

// Hauteur (monde) de l'anneau des tsurikawa, cf. three/Handles.tsx :
// RAIL_Y (2.06) + RING_Y (-STRAP_LEN 0.16 - 0.075) → ~1.825, on vise juste en
// dessous pour que la main saisisse la boucle.
const RING_WORLD_Y = 1.79;
const REACH_UP = 0.957; // composante verticale du bras levé (vers l'intérieur)

// Postures : cible (rotX épaule, rotZ épaule, rotX coude, allongement du bras)
// selon état / action.
function armTarget(
  p: (typeof paxList)[number],
  s: -1 | 1,
  strapSide: -1 | 1,
): [number, number, number, number] {
  const seated = p.state === 'seated';
  if (p.action === 'phone' && (seated || p.state === 'standing')) {
    return [-0.75, s * 0.12, -1.5, 1]; // deux mains devant le visage
  }
  if (p.state === 'standing' && p.holdStrap && s === strapSide) {
    // Bras tendu vers le haut ET vers l'intérieur, jusqu'à l'anneau situé pile
    // au-dessus (le PNJ est en x = ±0,45, comme les rangées de poignées).
    // On allonge le bras selon la taille pour que la main atteigne l'anneau.
    const arm = (RING_WORLD_Y / p.height - SHOULDER_Y) / REACH_UP; // longueur bras tendu
    const len = THREE.MathUtils.clamp(arm / 0.5, 1, 1.6);
    return [0, Math.PI + s * 0.29, -0.05, len];
  }
  if (seated) {
    return [-0.5, s * 0.06, -0.9, 1]; // avant-bras sur les cuisses
  }
  if (p.pockets && p.state === 'standing') {
    return [0.12, s * 0.04, -0.5, 1]; // mains dans les poches
  }
  return [0, s * 0.12, -0.15, 1]; // repos le long du corps
}

export function Passengers() {
  initPassengers();
  const refs = useRef<PaxRefs[]>(
    Array.from({ length: POOL_SIZE }, () => ({
      group: null,
      upper: null,
      lower: null,
      seated: null,
      head: null,
      arms: [
        { shoulder: null, elbow: null },
        { shoulder: null, elbow: null },
      ],
    })),
  );

  const perPax = useMemo(() => paxList.map((p) => buildChar(p.appearance, p.id)), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = Math.min(1, dt * 6);
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
        p.pos.y + p.bob,
        p.pos.z,
      );
      r.group.rotation.set(p.bodyLean, p.yaw, standingSway + seatedSway);
      r.group.scale.setScalar(p.height);
      if (r.lower) r.lower.visible = !seated;
      if (r.seated) r.seated.visible = seated;
      // Assise : buste compressé (pivot bassin) pour abaisser la tête sans
      // enfoncer le bassin dans le coussin.
      if (r.upper) {
        const target = seated ? SEATED_SQUASH : 1;
        r.upper.scale.y += (target - r.upper.scale.y) * k;
      }
      if (r.head) r.head.rotation.set(p.headPitch, p.headYaw, 0);

      // Bras : lissage vers la posture cible.
      const strapSide: -1 | 1 = p.pos.x >= 0 ? 1 : -1;
      for (let si = 0; si < 2; si++) {
        const s: -1 | 1 = si === 0 ? -1 : 1;
        const arm = r.arms[si];
        const [tx, tz, te, tlen] = armTarget(p, s, strapSide);
        if (arm.shoulder) {
          arm.shoulder.rotation.x += (tx - arm.shoulder.rotation.x) * k;
          arm.shoulder.rotation.z += (tz - arm.shoulder.rotation.z) * k;
          arm.shoulder.scale.y += (tlen - arm.shoulder.scale.y) * k;
        }
        if (arm.elbow) arm.elbow.rotation.x += (te - arm.elbow.rotation.x) * k;
      }
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
          {/* Bas du corps debout (masqué assis) */}
          <group
            ref={(g) => {
              refs.current[i].lower = g;
            }}
          >
            <Parts parts={perPax[i].lower} />
          </group>
          {/* Bas du corps assis (masqué debout) */}
          <group
            visible={false}
            ref={(g) => {
              refs.current[i].seated = g;
            }}
          >
            <Parts parts={perPax[i].seated} />
          </group>
          {/* Buste : compressé en Y quand assis (pivot au bassin). Le groupe
              interne annule le décalage pour garder les coordonnées absolues. */}
          <group
            position={[0, PELVIS_Y, 0]}
            ref={(g) => {
              refs.current[i].upper = g;
            }}
          >
            <group position={[0, -PELVIS_Y, 0]}>
              {/* Torse, cou, écharpe, détail de vêtement */}
              <Parts parts={perPax[i].torso} />
              {/* Bras articulés */}
              <Arm spec={perPax[i]} s={-1} armRef={refs.current[i].arms[0]} />
              <Arm spec={perPax[i]} s={1} armRef={refs.current[i].arms[1]} />
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
          </group>
        </group>
      ))}
    </group>
  );
}
