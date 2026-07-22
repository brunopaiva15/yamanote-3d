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
import { makeFaceTexture, makeStripeTexture, makePlaidTexture } from '../textures/procedural';

// Repères verticaux locaux (pieds à y=0), calés sur l'ancienne silhouette.
const HIP_Y = 0.5;
const SHOULDER_Y = 1.06;
const HEAD_Y = 1.34;

// Assise : le groupe entier est mis à l'échelle par la taille du PNJ, mais le
// coussin est à une hauteur ABSOLUE. La pose assise est donc calée en unités
// monde via 1/scale : le pivot du buste (groupe « upper ») descend exactement
// sur le haut du coussin, le buste est légèrement compressé en Y (SEATED_SQUASH),
// et les jambes assises sont construites par gabarit (cuisses sur le coussin,
// semelles au sol) quel que soit le gabarit — ni enfoncé, ni en lévitation.
const PELVIS_Y = 0.46;
const SEAT_TOP_Y = 0.45; // haut utile du coussin (monde) : boîte 0,4+0,055, arrondi déduit
const SEATED_SQUASH = 0.8; // tête assise ≈ 0,45 + 0,70 × scale (~1,15-1,30 m)

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
  seatedUpperY: number; // pivot du buste quand assis (bassin sur le coussin)
  upperArmGeo: THREE.BufferGeometry; // gabarit de bras (M/F)
  foreArmGeo: THREE.BufferGeometry;
  handGeo: THREE.BufferGeometry;
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
// Tête : sphère écrasée en ellipsoïde (mesh scale HEAD_SCALE) → visage plus
// fin et crédible qu'une boule. Les calottes de cheveux suivent le même ratio.
const headGeo = new THREE.SphereGeometry(0.105, 18, 16);
const HEAD_SCALE: [number, number, number] = [0.88, 1.0, 0.94];
const faceGeo = new THREE.PlaneGeometry(0.17, 0.17);
const neckGeo = new THREE.CylinderGeometry(0.043, 0.047, 0.15, 10);
// Membres fins et légèrement fuselés, en deux gabarits (masculin / féminin).
const upperArmGeoM = new THREE.CylinderGeometry(0.041, 0.038, 0.26, 8);
const foreArmGeoM = new THREE.CylinderGeometry(0.037, 0.031, 0.24, 8);
const handGeoM = new THREE.SphereGeometry(0.037, 8, 7);
const upperArmGeoF = new THREE.CylinderGeometry(0.035, 0.032, 0.26, 8);
const foreArmGeoF = new THREE.CylinderGeometry(0.031, 0.026, 0.24, 8);
const handGeoF = new THREE.SphereGeometry(0.033, 8, 7);
const shoeGeoM = new RoundedBoxGeometry(0.085, 0.05, 0.17, 2, 0.02);
const shoeGeoF = new RoundedBoxGeometry(0.075, 0.045, 0.15, 2, 0.018);
// Détails de vêtement (prismes 4 pans → faces plates façon tissu).
const tieGeo = new THREE.CylinderGeometry(0.02, 0.045, 0.26, 4);
const knotGeo = new THREE.CylinderGeometry(0.03, 0.024, 0.05, 4);
const collarGeo = new THREE.BoxGeometry(0.06, 0.09, 0.012);
const buttonGeo = new THREE.SphereGeometry(0.011, 8, 6);
const zipperGeo = new THREE.BoxGeometry(0.014, 0.34, 0.01);
const pocketGeo = new RoundedBoxGeometry(0.15, 0.08, 0.03, 3, 0.02);

const TIE_COLORS = ['#8a2f38', '#2f4a8a', '#3a4a2a', '#5a3a6a', '#2a5a5a', '#7a5a2a', '#333842'];

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
  // Points intermédiaires : la silhouette est courbe, pas anguleuse.
  const pts = [
    new THREE.Vector2(b.hipR + flare, bottomY),
    new THREE.Vector2((b.hipR + b.waistR) / 2 + flare * 0.4, (bottomY + HIP_Y + 0.22) / 2),
    new THREE.Vector2(b.waistR, HIP_Y + 0.22),
    new THREE.Vector2((b.waistR + b.chestR) / 2, 0.84),
    new THREE.Vector2(b.chestR, 0.95),
    new THREE.Vector2(b.shoulderR, SHOULDER_Y),
    new THREE.Vector2(b.shoulderR * 0.86, SHOULDER_Y + 0.07),
    new THREE.Vector2(b.shoulderR * 0.55, SHOULDER_Y + 0.13),
    new THREE.Vector2(0.048, SHOULDER_Y + 0.16),
  ];
  return new THREE.LatheGeometry(pts, 24);
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
  const shoeGeo = app.feminine ? shoeGeoF : shoeGeoM;
  const bare = app.bottom.type === 'skirt' || app.bottom.type === 'dress';

  // --- Bas du corps DEBOUT ---
  if (bare) {
    const legGeo = new THREE.CylinderGeometry(0.041, 0.035, 0.48, 7);
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

  // --- Bas du corps ASSIS : cuisses en avant (+z local, vers l'allée) POSÉES
  // sur le coussin, tibias verticaux, semelles au sol. Le groupe étant mis à
  // l'échelle par la taille, les hauteurs absolues (coussin, sol) sont
  // converties en unités locales via 1/scale : la pose reste juste pour un
  // petit gabarit comme pour un grand. ---
  {
    const inv = 1 / b.scale;
    const cushY = SEAT_TOP_Y * inv; // haut du coussin en unités locales
    const thighY = cushY + b.legR; // cuisse posée dessus
    const shoeY = 0.026 * inv; // semelle au sol
    const kneeZ = 0.34;
    const shinLen = Math.max(0.24, thighY - shoeY);
    const thighMat = bare ? skinMat : bottomMat;
    const shinMat = bare || app.bottom.type === 'shorts' ? skinMat : bottomMat;
    const thighGeo = new THREE.CylinderGeometry(b.legR + 0.005, b.legR, 0.34, 8);
    const shinGeo = app.feminine
      ? new THREE.CylinderGeometry(0.039, 0.034, shinLen, 8)
      : new THREE.CylinderGeometry(0.045, 0.04, shinLen, 8);
    for (const s of [-1, 1]) {
      seated.push({ geo: thighGeo, mat: thighMat, position: [s * legX, thighY, 0.17], rotation: [Math.PI / 2, 0, 0] });
      seated.push({ geo: shinGeo, mat: shinMat, position: [s * legX, shoeY + shinLen / 2, kneeZ] });
      seated.push({ geo: shoeGeo, mat: shoeMat, position: [s * legX, shoeY, kneeZ + 0.03] });
    }
    if (bare) {
      // Jupe / robe qui drape sur les genoux.
      seated.push({ geo: new RoundedBoxGeometry(2 * b.hipR + 0.06, 0.1, 0.4, 3, 0.04), mat: bottomMat, position: [0, thighY + 0.02, 0.16] });
    }
  }

  // --- Torse + cou + écharpe + détail de vêtement ---
  torso.push({ geo: torsoGeometry(app), mat: topMat, position: [0, 0, 0] });
  torso.push({ geo: neckGeo, mat: skinMat, position: [0, SHOULDER_Y + 0.14, 0] });

  if (app.scarf) {
    const scarfGeo = new THREE.TorusGeometry(0.085, 0.032, 8, 16);
    torso.push({ geo: scarfGeo, mat: cloth(app.scarfColor, 0.9), position: [0, SHOULDER_Y + 0.12, 0], rotation: [Math.PI / 2, 0, 0] });
  }

  // Détails de vêtement en VRAIS petits volumes 3D (épousent le torse rond,
  // contrairement à un décalque plat) : cravate, boutons, poche, fermeture.
  const chestZ = b.chestR - 0.03; // centre légèrement enfoncé → moitié visible
  if (app.top.type === 'suit') {
    const tieColor = TIE_COLORS[id % TIE_COLORS.length];
    const tieMat = cloth(tieColor, 0.6);
    // Col de chemise clair en V (deux petits pans).
    const collarMat = cloth('#eef0ec', 0.8);
    for (const s of [-1, 1]) {
      torso.push({ geo: collarGeo, mat: collarMat, position: [s * 0.03, 1.0, chestZ + 0.02], rotation: [0, 0, s * 0.5] });
    }
    torso.push({ geo: knotGeo, mat: tieMat, position: [0, 0.99, chestZ + 0.025], rotation: [0, Math.PI / 4, 0] });
    torso.push({ geo: tieGeo, mat: tieMat, position: [0, 0.83, chestZ + 0.02], rotation: [0, Math.PI / 4, 0] });
  } else if (app.top.type === 'coat') {
    const btnMat = cloth('#1c1a18', 0.5);
    for (const y of [1.0, 0.86, 0.72]) {
      torso.push({ geo: buttonGeo, mat: btnMat, position: [0, y, chestZ + 0.03] });
    }
  } else if (app.top.type === 'jacket') {
    torso.push({ geo: zipperGeo, mat: cloth('#2a2a30', 0.5), position: [0, 0.85, chestZ + 0.025] });
  } else if (app.top.type === 'hoodie') {
    torso.push({ geo: pocketGeo, mat: cloth(shade(app.top.color, 0.16), 0.85), position: [0, 0.72, chestZ + 0.02] });
  } else if (app.top.type === 'blouse') {
    const btnMat = cloth('#ffffff', 0.7);
    for (const y of [0.98, 0.86, 0.74]) {
      torso.push({ geo: buttonGeo, mat: btnMat, position: [0, y, chestZ + 0.03] });
    }
  }

  // --- Tête (dans le groupe articulé, origine à HEAD_Y) ---
  head.push({ geo: headGeo, mat: skinMat, position: [0, 0, 0], scale: HEAD_SCALE });

  const hairMat = cloth(app.hair.color, 0.88);
  const hasHat = app.hat !== 'none';
  if (!hasHat && app.hair.style !== 'bald') {
    // Calotte légèrement plus grande que la tête (ellipsoïde, mêmes ratios) et
    // abaissée vers l'avant : vraie ligne de cheveux sur le haut du front.
    const buzz = app.hair.style === 'buzz';
    const capScale: [number, number, number] = buzz ? [0.88, 0.72, 0.93] : [0.85, 0.96, 0.9];
    const capGeo = new THREE.SphereGeometry(buzz ? 0.11 : 0.116, 16, 14);
    head.push({ geo: capGeo, mat: hairMat, position: [0, buzz ? 0.02 : 0.012, -0.006], scale: capScale });
    if (app.hair.style === 'bun') {
      head.push({ geo: new THREE.SphereGeometry(0.05, 10, 9), mat: hairMat, position: [0, 0.07, -0.1] });
    } else if (app.hair.style === 'ponytail') {
      head.push({ geo: new THREE.CylinderGeometry(0.03, 0.02, 0.2, 8), mat: hairMat, position: [0, -0.06, -0.11], rotation: [0.3, 0, 0] });
    } else if (app.hair.style === 'long') {
      // Masse arrière + deux mèches qui encadrent le visage.
      head.push({ geo: new RoundedBoxGeometry(0.19, 0.26, 0.1, 3, 0.045), mat: hairMat, position: [0, -0.11, -0.045] });
      const lockGeo = new RoundedBoxGeometry(0.045, 0.17, 0.075, 2, 0.02);
      for (const s of [-1, 1]) {
        head.push({ geo: lockGeo, mat: hairMat, position: [s * 0.083, -0.045, 0.015] });
      }
    }
  }

  if (app.hat === 'beanie') {
    head.push({ geo: new THREE.SphereGeometry(0.12, 14, 12), mat: cloth(app.hair.color === '#17151a' ? '#3a5a8a' : app.scarfColor, 0.9), position: [0, 0.055, 0], scale: [0.9, 0.86, 0.95] });
  } else if (app.hat === 'cap') {
    const capMat = cloth(app.scarfColor, 0.7);
    head.push({ geo: new THREE.SphereGeometry(0.118, 14, 12), mat: capMat, position: [0, 0.05, 0], scale: [0.9, 0.6, 0.95] });
    head.push({ geo: new THREE.BoxGeometry(0.15, 0.02, 0.09), mat: capMat, position: [0, 0.03, 0.105] });
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
  return {
    lower,
    seated,
    torso,
    head,
    accessories,
    armMat,
    skinMat,
    armX,
    seatedUpperY: SEAT_TOP_Y / b.scale,
    upperArmGeo: app.feminine ? upperArmGeoF : upperArmGeoM,
    foreArmGeo: app.feminine ? foreArmGeoF : foreArmGeoM,
    handGeo: app.feminine ? handGeoF : handGeoM,
  };
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
      <mesh geometry={spec.upperArmGeo} material={spec.armMat} position={[0, -0.13, 0]} />
      <group
        position={[0, -0.26, 0]}
        ref={(g) => {
          armRef.elbow = g;
        }}
      >
        <mesh geometry={spec.foreArmGeo} material={spec.armMat} position={[0, -0.12, 0]} />
        <mesh geometry={spec.handGeo} material={spec.skinMat} position={[0, -0.25, 0]} />
      </group>
    </group>
  );
}

// Postures : cible (rotX épaule, rotZ épaule, rotX coude) selon état / action.
// PAS d'allongement de bras : les tailles sont réalistes, l'anneau est à sa
// hauteur réelle (~1,64 m) et le coude se plie en fonction de la taille du PNJ
// (les petits gabarits ne s'accrochent pas du tout, voir systems/passengers).
function armTarget(
  p: (typeof paxList)[number],
  s: -1 | 1,
  strapSide: -1 | 1,
): [number, number, number] {
  const seated = p.state === 'seated';
  if (p.action === 'phone' && (seated || p.state === 'standing')) {
    return [-0.75, s * 0.12, -1.5]; // deux mains devant le visage
  }
  if (p.state === 'standing' && p.holdStrap && s === strapSide) {
    // Bras levé vers l'anneau situé pile au-dessus (le PNJ est en x = ±0,45,
    // comme les rangées de poignées). Un grand plie nettement le coude, un
    // petit tend presque le bras : la main finit à hauteur d'anneau.
    const excess = 1.57 * p.height - 1.56; // dépassement de la portée (m)
    const bend = Math.acos(THREE.MathUtils.clamp(1 - Math.max(0, excess) / 0.5, 0.55, 1));
    return [0, Math.PI + s * 0.26, -Math.max(0.1, bend)];
  }
  if (seated) {
    return [-0.5, s * 0.06, -0.9]; // avant-bras sur les cuisses
  }
  if (p.pockets && p.state === 'standing') {
    return [0.12, s * 0.04, -0.5]; // mains dans les poches
  }
  return [0, s * 0.12, -0.15]; // repos le long du corps
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
      // Assise : le pivot du buste descend sur le haut du coussin (compensé
      // par 1/scale) et le buste est compressé — bassin posé, jamais enfoncé.
      if (r.upper) {
        const target = seated ? SEATED_SQUASH : 1;
        r.upper.scale.y += (target - r.upper.scale.y) * k;
        const targetY = seated ? perPax[i].seatedUpperY : PELVIS_Y;
        r.upper.position.y += (targetY - r.upper.position.y) * k;
      }
      if (r.head) r.head.rotation.set(p.headPitch, p.headYaw, 0);

      // Bras : lissage vers la posture cible.
      const strapSide: -1 | 1 = p.pos.x >= 0 ? 1 : -1;
      for (let si = 0; si < 2; si++) {
        const s: -1 | 1 = si === 0 ? -1 : 1;
        const arm = r.arms[si];
        const [tx, tz, te] = armTarget(p, s, strapSide);
        if (arm.shoulder) {
          arm.shoulder.rotation.x += (tx - arm.shoulder.rotation.x) * k;
          arm.shoulder.rotation.z += (tz - arm.shoulder.rotation.z) * k;
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
