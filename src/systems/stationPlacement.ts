// Où se posent les objets du quai.
//
// Une seule source pour deux consommateurs qui doivent absolument être
// d'accord : le rendu (three/station) et la marche du joueur (walkable). Un
// banc dessiné à un endroit et infranchissable à un autre, cela se voit tout
// de suite.
//
// Repère QUAI : x mesuré depuis l'axe de la voie vers le fond du quai, z le
// long de la voie, origine au milieu du quai.

import { layoutFor, type StationLayout } from '../data/stationLayouts';
import {
  PSD_X,
  STAIR_GOING,
  STAIR_RISE,
  STAIR_STEPS,
  STAIR_WALK_HALF_X,
  STAIR_WALK_LEN,
  STAIR_WALK_STEPS,
} from '../data/stationGeometry';

export interface Placed {
  x: number;
  z: number;
  /** Demi-emprise, pour la collision. */
  halfX: number;
  halfZ: number;
}

export interface StationPlacement {
  layout: StationLayout;
  /** Abscisse du nu intérieur du mur de fond. */
  backX: number;
  /** Bornes de marche du joueur et de la foule. */
  walkX0: number;
  walkX1: number;
  walkHalfZ: number;
  columns: number[];
  benches: Placed[];
  bins: Placed[];
  vending: Placed[];
  kiosk: Placed | null;
  stairs: Placed[];
  escalators: Placed[];
  elevator: Placed | null;
  /** Repères d'attente peints au sol, deux par baie de porte palière. */
  queueMarks: { x: number; z: number }[];
  /** Toutes les emprises qui barrent le passage. */
  obstacles: Placed[];
}

const CACHE = new Map<number, StationPlacement>();

/**
 * Répartit `n` positions sur la longueur utile du quai, en évitant les abouts.
 * Le décalage impair casse la régularité : rien n'est jamais parfaitement
 * aligné sur un vrai quai.
 */
function spread(n: number, halfZ: number, phase = 0): number[] {
  if (n <= 0) return [];
  const span = halfZ * 2 * 0.86;
  const step = span / n;
  return Array.from({ length: n }, (_, i) => -span / 2 + step * (i + 0.5) + phase);
}

export function placementFor(index: number, gates: readonly number[]): StationPlacement {
  const i = ((index % 30) + 30) % 30;
  const hit = CACHE.get(i);
  if (hit) return hit;

  const layout = layoutFor(i);
  const backX = PSD_X + layout.depth - 0.15;
  const halfZ = layout.length / 2;
  const usable = halfZ - 3;

  // Le mobilier s'adosse au fond du quai, la circulation reste devant.
  const wallX = backX - 0.85;
  const midX = PSD_X + layout.depth * 0.55;

  const columns: number[] = [];
  for (let z = -usable; z <= usable; z += layout.columnSpacing) columns.push(z);

  const a = layout.amenities;
  const benches: Placed[] = spread(a.benches, usable, 1.7).map((z) => ({
    x: wallX,
    z,
    halfX: 0.45,
    halfZ: 1.35,
  }));
  const bins: Placed[] = benches
    .filter((_, k) => k % 2 === 0)
    .map((b) => ({ x: b.x - 0.1, z: b.z + 1.7, halfX: 0.25, halfZ: 0.25 }));
  const vending: Placed[] = spread(a.vending, usable, -4.3).map((z) => ({
    x: backX - 0.55,
    z,
    halfX: 0.42,
    halfZ: 0.75,
  }));
  const kiosk: Placed | null = a.kiosk
    ? { x: backX - 1.35, z: usable * 0.36, halfX: 1.25, halfZ: 2.4 }
    : null;
  const stairs: Placed[] = a.stairs.map((z) => ({ x: midX + 0.4, z, halfX: 1.5, halfZ: 2.6 }));
  const escalators: Placed[] = a.escalators.map((z) => ({
    x: midX + 0.55,
    z,
    halfX: 0.7,
    halfZ: 2.8,
  }));
  const elevator: Placed | null =
    a.elevator === null ? null : { x: backX - 1.05, z: a.elevator, halfX: 0.95, halfZ: 0.95 };

  // Deux files d'attente peintes de part et d'autre de chaque baie.
  const queueMarks: { x: number; z: number }[] = [];
  for (const g of gates) {
    for (const dz of [-1.25, 1.25]) queueMarks.push({ x: PSD_X + 1.15, z: g + dz });
  }

  const obstacles = [
    ...columns.map((z) => ({ x: backX - 0.55, z, halfX: 0.26, halfZ: 0.26 })),
    ...benches,
    ...bins,
    ...vending,
    ...(kiosk ? [kiosk] : []),
    ...stairs,
    ...escalators,
    ...(elevator ? [elevator] : []),
  ];

  const placement: StationPlacement = {
    layout,
    backX,
    // Le joueur marche du liseré blanc jusqu'à 35 cm du mur de fond.
    walkX0: PSD_X + 0.2,
    walkX1: backX - 0.35,
    walkHalfZ: halfZ - 2,
    columns,
    benches,
    bins,
    vending,
    kiosk,
    stairs,
    escalators,
    elevator,
    queueMarks,
    obstacles,
  };
  CACHE.set(i, placement);
  return placement;
}

// --- Trémies d'escalier -------------------------------------------------
//
// La volée descend du nez du quai (côté -z de l'emprise) vers +z. Une seule
// fonction dit l'altitude du sol dans la trémie ; le rendu, la marche du
// joueur et les voyageurs qui s'en vont la partagent, donc personne ne
// marche à dix centimètres au-dessus des marches.

/** Nez de la volée : abscisse z locale du bord haut, côté quai. */
export function stairTopZ(s: Placed): number {
  return s.z - s.halfZ;
}

/** Altitude (relative au sol du quai) à `t` mètres du nez de la volée. */
export function stairDropAt(t: number, maxSteps = STAIR_STEPS): number {
  if (t <= 0) return 0;
  const step = Math.min(maxSteps, Math.floor(t / STAIR_GOING));
  return -step * STAIR_RISE;
}

export interface StairwellHit {
  stair: Placed;
  /** Distance parcourue depuis le nez de la volée (m). */
  t: number;
  /** Altitude du sol sous les pieds, relative au sol du quai. */
  y: number;
}

/**
 * Position dans une volée d'escalier, ou null si le point n'y est pas.
 * `maxLen` borne la descente : le joueur s'arrête à la limite de zone
 * (STAIR_WALK_LEN), les PNJ descendent jusqu'au fond et disparaissent.
 */
export function stairwellAt(
  p: StationPlacement,
  x: number,
  z: number,
  maxLen = STAIR_WALK_LEN,
  maxSteps = STAIR_WALK_STEPS,
): StairwellHit | null {
  for (const s of p.stairs) {
    if (Math.abs(x - s.x) > STAIR_WALK_HALF_X) continue;
    const t = z - stairTopZ(s);
    if (t < 0 || t > maxLen) continue;
    return { stair: s, t, y: stairDropAt(t, maxSteps) };
  }
  return null;
}
