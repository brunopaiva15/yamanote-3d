// Géométries de l'extérieur d'une voiture E235-0.
//
// Tout est construit une fois, hors React, et fusionné par matériau : la rame
// entière tient en une poignée d'InstancedMesh. Les cotes viennent de
// data/e235 et se raccordent à l'intérieur déjà modélisé (Car.tsx).
//
// Repère local d'une voiture : z = 0 au centre de caisse, y = 0 au plancher.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { E235 } from '../../data/e235';
import { roundedRect } from '../shapes';

const HALF = E235.bodyHalfLen;
const HW = E235.halfWidth;
const SKIN = 0.07; // épaisseur de la peau de caisse

/** Panneaux de caisse entre les ouvertures de porte. */
export const WALL_SEGMENTS: { z0: number; z1: number }[] = (() => {
  const out: { z0: number; z1: number }[] = [];
  let prev = -HALF;
  for (const dz of E235.doorCenters) {
    out.push({ z0: prev, z1: dz - E235.doorHalfW });
    prev = dz + E235.doorHalfW;
  }
  out.push({ z0: prev, z1: HALF });
  return out;
})();

/** Baies d'un panneau : une seule si le panneau est court, deux sinon. */
export function windowsOf(seg: { z0: number; z1: number }): { z0: number; z1: number }[] {
  const p = E235.pillar;
  const z0 = seg.z0 + p;
  const z1 = seg.z1 - p;
  const len = z1 - z0;
  if (len <= 0.4) return [];
  if (len < 2.4) return [{ z0, z1 }];
  const mid = (z0 + z1) / 2;
  return [
    { z0, z1: mid - p / 2 },
    { z0: mid + p / 2, z1 },
  ];
}

/** Toutes les baies de la voiture, dans l'ordre. */
export const WINDOWS = WALL_SEGMENTS.flatMap(windowsOf);

// --- Peau de caisse -----------------------------------------------------

/**
 * Un flanc entier d'un seul tenant : un rectangle percé de toutes les baies et
 * de toutes les ouvertures de porte. Construit à plat dans (X = z, Y = y) puis
 * redressé — même tour de main que les parois intérieures.
 */
function sideShape(): THREE.Shape {
  const outer = new THREE.Shape();
  const yBottom = E235.underframeY;
  const yTop = E235.roofY - 0.12;
  outer.moveTo(-HALF, yBottom);
  outer.lineTo(HALF, yBottom);
  outer.lineTo(HALF, yTop);
  outer.lineTo(-HALF, yTop);
  outer.closePath();

  for (const w of WINDOWS) {
    outer.holes.push(
      roundedRect(
        w.z1 - w.z0,
        E235.windowTop - E235.windowBottom,
        E235.windowRadius,
        (w.z0 + w.z1) / 2,
        (E235.windowBottom + E235.windowTop) / 2,
      ),
    );
  }
  for (const dz of E235.doorCenters) {
    const hole = new THREE.Path();
    const a = dz - E235.doorHalfW;
    const b = dz + E235.doorHalfW;
    hole.moveTo(a, 0);
    hole.lineTo(a, E235.doorH);
    hole.lineTo(b, E235.doorH);
    hole.lineTo(b, 0);
    hole.closePath();
    outer.holes.push(hole);
  }
  return outer;
}

/** Profil de toit : arc surbaissé d'un bord de pavillon à l'autre. */
function roofShape(): THREE.Shape {
  const s = new THREE.Shape();
  const y0 = E235.roofY - 0.16;
  s.moveTo(-HW, y0);
  s.quadraticCurveTo(-HW * 0.55, E235.roofCrownY, 0, E235.roofCrownY);
  s.quadraticCurveTo(HW * 0.55, E235.roofCrownY, HW, y0);
  s.lineTo(HW, y0 - 0.1);
  s.lineTo(-HW, y0 - 0.1);
  s.closePath();
  return s;
}

/** Fusion avec message clair : un merge raté rend une géométrie nulle, et
 * three échoue alors très loin de la cause. */
function merge(parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry {
  // Les extrusions sont non indexées, les primitives le sont : on ramène tout
  // au même format avant de fusionner.
  const g = mergeGeometries(
    parts.map((p) => (p.index ? p.toNonIndexed() : p)),
    false,
  );
  if (!g) throw new Error(`Fusion impossible (${what}) : attributs hétérogènes`);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// --- Fusions par matériau ------------------------------------------------

export interface CarGeometries {
  body: THREE.BufferGeometry;
  band: THREE.BufferGeometry;
  roof: THREE.BufferGeometry;
  underframe: THREE.BufferGeometry;
  bogies: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  liner: THREE.BufferGeometry;
  doorLeaf: THREE.BufferGeometry;
  doorGlass: THREE.BufferGeometry;
  bellows: THREE.BufferGeometry;
}

/** Peau inox : les deux flancs percés, plus les faces d'about. */
function buildBody(): THREE.BufferGeometry {
  const shape = sideShape();
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1] as const) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: SKIN, bevelEnabled: false });
    // Après le quart de tour, l'épaisseur d'extrusion part vers l'extérieur :
    // on translate de HW − SKIN pour que le NU EXTÉRIEUR tombe pile sur HW.
    geo.rotateY((s * Math.PI) / 2);
    geo.translate(s * (HW - SKIN), 0, 0);
    parts.push(geo);
  }
  // Faces d'about, pour ne pas voir au travers de la rame.
  for (const e of [1, -1] as const) {
    parts.push(box(HW * 2 - SKIN, E235.roofY - E235.underframeY, 0.06, 0, (E235.roofY + E235.underframeY) / 2, e * (HALF - 0.03)));
  }
  // Congé entre le haut de caisse et le pavillon.
  for (const s of [1, -1] as const) {
    parts.push(box(0.1, 0.14, HALF * 2, s * (HW - 0.05), E235.roofY - 0.06, 0));
  }
  return merge(parts, 'caisse');
}

/**
 * Habillage uguisu au-dessus des portes.
 *
 * Il y avait ici un bandeau continu d'un about à l'autre — c'est faux pour le
 * E235-0 : le vert n'est QU'AUX PORTES et il monte du bas de caisse jusqu'au
 * pavillon, formant un montant d'un seul tenant par baie ; entre deux portes,
 * le haut de caisse reste inox. Les vantaux couvrent la partie basse (ce sont
 * eux qui coulissent) ; cette pièce-ci couvre ce qui les surmonte.
 */
function buildBand(): THREE.BufferGeometry {
  const t = 0.03; // l'habillage affleure la caisse, sans s'y enfouir
  const y0 = E235.doorH;
  const y1 = E235.doorGreenTop;
  // Un peu plus large que la baie : le vert déborde sur l'encadrement, comme
  // sur la série.
  const w = E235.doorHalfW * 2 + 0.12;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1] as const) {
    for (const dz of E235.doorCenters) {
      parts.push(box(t, y1 - y0, w, s * (HW + t / 2 - 0.004), (y0 + y1) / 2, dz));
    }
  }
  return merge(parts, 'habillage de porte');
}

/** Pavillon + carénages de climatisation + antennes. */
function buildRoof(): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(roofShape(), { depth: HALF * 2, bevelEnabled: false });
  geo.translate(0, 0, -HALF);
  const parts: THREE.BufferGeometry[] = [geo];
  // Carénage de clim : un gros bloc central, comme sur le E235.
  parts.push(box(1.9, E235.acTopY - E235.roofCrownY + 0.06, 5.4, 0, (E235.acTopY + E235.roofCrownY) / 2, 0));
  parts.push(box(2.05, 0.06, 5.0, 0, E235.acTopY, 0));
  // Deux coffrets techniques et une antenne.
  for (const z of [-7.2, 7.2]) parts.push(box(1.1, 0.18, 1.6, 0, E235.roofCrownY + 0.09, z));
  parts.push(box(0.12, 0.3, 0.9, 0.5, E235.roofCrownY + 0.15, -8.6));
  return merge(parts, 'toit');
}

/** Châssis, jupes et coffres d'équipement sous caisse. */
function buildUnderframe(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = E235.underframeY - E235.skirtY;
  const yMid = (E235.underframeY + E235.skirtY) / 2;
  // Longeron central sur toute la longueur.
  parts.push(box(HW * 2 - 0.2, 0.16, HALF * 2, 0, E235.underframeY - 0.08, 0));
  // Coffres d'appareillage entre les bogies, de part et d'autre.
  const boxes: { z: number; len: number }[] = [
    { z: -3.6, len: 3.0 },
    { z: 0.2, len: 2.4 },
    { z: 3.9, len: 2.6 },
  ];
  for (const s of [1, -1] as const) {
    for (const b of boxes) {
      parts.push(box(0.9, h * 0.86, b.len, s * 0.82, yMid + 0.03, b.z));
    }
  }
  // Jupes d'extrémité, au droit des bogies.
  for (const e of [1, -1] as const) {
    parts.push(box(HW * 2 - 0.35, h * 0.7, 2.0, 0, yMid + 0.06, e * 8.4));
  }
  return merge(parts, 'châssis');
}

/** Deux bogies complets : longerons, boîtes d'essieu, roues. */
function buildBogies(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const yAxle = E235.railY + E235.wheelR;
  for (const e of [1, -1] as const) {
    const cz = e * E235.bogieDz;
    // Traverse et longerons.
    parts.push(box(2.2, 0.28, 0.5, 0, yAxle + 0.16, cz));
    for (const s of [1, -1] as const) {
      parts.push(box(0.16, 0.36, 2.9, s * 1.02, yAxle + 0.2, cz));
      // Boîtes d'essieu.
      for (const a of [1, -1] as const) {
        parts.push(box(0.3, 0.3, 0.34, s * 1.02, yAxle, cz + a * E235.axleDz));
      }
    }
    // Roues et essieux.
    for (const a of [1, -1] as const) {
      const az = cz + a * E235.axleDz;
      for (const s of [1, -1] as const) {
        const wheel = new THREE.CylinderGeometry(E235.wheelR, E235.wheelR, 0.12, 18);
        wheel.rotateZ(Math.PI / 2);
        wheel.translate(s * 0.75, yAxle, az);
        parts.push(wheel);
      }
      const axle = new THREE.CylinderGeometry(0.075, 0.075, 1.5, 10);
      axle.rotateZ(Math.PI / 2);
      axle.translate(0, yAxle, az);
      parts.push(axle);
    }
  }
  return merge(parts, 'bogies');
}

/**
 * Vitrage teinté des baies, POSÉ DANS L'ÉPAISSEUR de la peau de caisse.
 *
 * Il était auparavant à HW − SKIN − 0,005, soit exactement 1,400 — c'est-à-dire
 * pile sur le nu extérieur du vitrage INTÉRIEUR de la voiture du joueur
 * (Car.tsx : boîte de 2 cm centrée à 1,39). Deux surfaces transparentes
 * coplanaires : depuis le quai, les vitres scintillaient en z-fighting dès que
 * la caméra bougeait. Reculé de 1,5 cm sous le nu extérieur, le vitrage tombe
 * dans l'ouverture (la peau court de 1,405 à 1,475) sans toucher ni la peau, ni
 * la paroi intérieure (nu extérieur à 1,44), ni la vitre intérieure.
 */
const GLASS_X = HW - 0.015;

function buildGlass(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1] as const) {
    for (const w of WINDOWS) {
      const g = new THREE.PlaneGeometry(w.z1 - w.z0, E235.windowTop - E235.windowBottom);
      g.rotateY((s * Math.PI) / 2);
      g.translate(s * GLASS_X, (E235.windowBottom + E235.windowTop) / 2, (w.z0 + w.z1) / 2);
      parts.push(g);
    }
  }
  return merge(parts, 'vitrage');
}

/**
 * Doublure d'intérieur pour les voitures que le joueur n'occupe pas : une
 * boîte vue de l'intérieur, qui donne du fond aux vitres et aux portes
 * ouvertes au lieu de laisser voir à travers la rame.
 */
function buildLiner(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(HW * 2 - 0.24, E235.roofY - 0.2, HALF * 2 - 0.3);
  g.translate(0, (E235.roofY - 0.2) / 2 - 0.05, 0);
  return g;
}

/** Un vantail extérieur : panneau plein et hublot, à transformer par instance. */
function buildDoorLeaf(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.05, E235.doorH, E235.doorHalfW);
  g.translate(0, E235.doorH / 2, 0);
  return g;
}

/**
 * Hublot d'un vantail, décalé vers +x par rapport au vantail. L'instance du
 * côté −x le reçoit retourné d'un demi-tour (voir layoutLeaves) : sans cela il
 * se retrouvait DERRIÈRE le vantail, face tournée vers l'intérieur et à 3 mm de
 * son panneau — le hublot y clignotait au lieu de s'afficher.
 */
function buildDoorGlass(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.44, 0.8);
  g.rotateY(Math.PI / 2);
  g.translate(0.028, 1.3, 0);
  return g;
}

/** Soufflet d'intercirculation, posé dans l'intervalle entre deux caisses. */
function buildBellows(): THREE.BufferGeometry {
  const gap = E235.pitch - HALF * 2;
  // Assez haut et assez large pour masquer la paroi d'about de l'intérieur,
  // qui dépasse dans l'intervalle (elle est modélisée à z = ±10, la caisse
  // extérieure s'arrête à ±9,8).
  const g = new THREE.BoxGeometry(2.72, 2.62, gap + 0.5);
  g.translate(0, 1.24, 0);
  return g;
}

export function buildCarGeometries(): CarGeometries {
  return {
    body: buildBody(),
    band: buildBand(),
    roof: buildRoof(),
    underframe: buildUnderframe(),
    bogies: buildBogies(),
    glass: buildGlass(),
    liner: buildLiner(),
    doorLeaf: buildDoorLeaf(),
    doorGlass: buildDoorGlass(),
    bellows: buildBellows(),
  };
}

// --- Pantographe --------------------------------------------------------

/** Pantographe monobras en position levée, avec ses isolateurs. */
export function buildPantograph(mats: {
  metal: THREE.Material;
  insulator: THREE.Material;
}): THREE.Group {
  const g = new THREE.Group();
  const base = E235.roofCrownY + 0.06;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    return m;
  };
  // Quatre isolateurs et le socle.
  for (const sx of [1, -1] as const) {
    for (const sz of [1, -1] as const) {
      const ins = new THREE.CylinderGeometry(0.07, 0.08, 0.24, 10);
      ins.translate(sx * 0.55, base + 0.12, sz * 0.5);
      add(ins, mats.insulator);
    }
  }
  const frame = new THREE.BoxGeometry(1.4, 0.08, 1.3);
  frame.translate(0, base + 0.28, 0);
  add(frame, mats.metal);

  // Bras inférieur incliné, bras supérieur, archet.
  const lower = new THREE.BoxGeometry(0.1, 0.1, 1.5);
  lower.translate(0, 0, 0.75);
  lower.rotateX(-0.62);
  lower.translate(0, base + 0.32, -0.45);
  add(lower, mats.metal);

  const upper = new THREE.BoxGeometry(0.08, 0.08, 1.35);
  upper.translate(0, 0, 0.68);
  upper.rotateX(0.72);
  upper.translate(0, base + 1.18, 0.42);
  add(upper, mats.metal);

  // Archet : deux frotteurs et leurs cornes.
  for (const dz of [-0.13, 0.13]) {
    const bar = new THREE.BoxGeometry(1.9, 0.05, 0.07);
    bar.translate(0, base + 1.62, dz);
    add(bar, mats.metal);
  }
  for (const sx of [1, -1] as const) {
    const horn = new THREE.BoxGeometry(0.28, 0.05, 0.34);
    horn.rotateY(sx * 0.5);
    horn.translate(sx * 1.0, base + 1.58, 0);
    add(horn, mats.metal);
  }
  return g;
}
