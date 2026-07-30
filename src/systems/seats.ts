// Slots d'assise et de station debout, partagés entre le rendu (Seats.tsx),
// les PNJ (passengers.ts) et le joueur (Player.tsx).

import { CONFIG } from '../data/config';

export interface BenchSegment {
  z0: number;
  z1: number;
  n: number; // nombre de places
  priority: boolean; // banquette prioritaire (extrémités)
  freeSpaceSide?: 1 | -1; // côté où la banquette cède la place à la フリースペース
}

// Segments de banquette entre les portes (z), identiques des deux côtés - sauf
// là où la zone libre remplace une banquette.
//
// L'E235 a une フリースペース (fauteuils roulants et poussettes) dans CHAQUE
// voiture, à une extrémité : c'est précisément la nouveauté par rapport à
// l'E231-500, qui n'en avait que dans les deux voitures de tête. Elle prend la
// place d'une banquette prioritaire de trois, d'un seul côté du wagon.
export const BENCHES: BenchSegment[] = [
  { z0: -9.55, z1: -8.16, n: 3, priority: true },
  { z0: -6.84, z1: -3.16, n: 7, priority: false },
  { z0: -1.84, z1: 1.84, n: 7, priority: false },
  { z0: 3.16, z1: 6.84, n: 7, priority: false },
  { z0: 8.16, z1: 9.55, n: 3, priority: true, freeSpaceSide: -1 },
];

// La zone libre, dérivée de la banquette qu'elle remplace : un seul endroit à
// modifier si elle change de place.
const freeBench = BENCHES.find((b) => b.freeSpaceSide !== undefined);
export const FREE_SPACE = freeBench
  ? { z0: freeBench.z0, z1: freeBench.z1, side: freeBench.freeSpaceSide as 1 | -1 }
  : null;

export interface SeatSlot {
  x: number;
  z: number;
  side: 1 | -1;
  priority: boolean;
}

export type Occupant = number | 'player' | null;

function buildSeatSlots(): SeatSlot[] {
  const slots: SeatSlot[] = [];
  const sides: (1 | -1)[] = [1, -1];
  for (const side of sides) {
    for (const b of BENCHES) {
      if (b.freeSpaceSide === side) continue; // pas de place assise dans la zone libre
      const len = b.z1 - b.z0;
      const pitch = len / b.n;
      for (let i = 0; i < b.n; i++) {
        slots.push({
          x: side * (CONFIG.carHalfWidth - 0.28),
          z: b.z0 + pitch * (i + 0.5),
          side,
          priority: b.priority,
        });
      }
    }
  }
  return slots;
}

export const SEAT_SLOTS: SeatSlot[] = buildSeatSlots();
export const seatOccupant: Occupant[] = SEAT_SLOTS.map(() => null);

// Slots debout le long de l'allée, près des barres et tsurikawa.
export interface StandSlot {
  x: number;
  z: number;
}

function buildStandSlots(): StandSlot[] {
  const slots: StandSlot[] = [];
  for (let z = -8.4; z <= 8.4; z += 1.2) {
    slots.push({ x: 0.45, z });
    slots.push({ x: -0.45, z });
  }
  return slots;
}

export const STAND_SLOTS: StandSlot[] = buildStandSlots();
export const standOccupant: Occupant[] = STAND_SLOTS.map(() => null);

export function findFreeSeat(random = Math.random): number {
  const free: number[] = [];
  for (let i = 0; i < SEAT_SLOTS.length; i++) if (seatOccupant[i] === null) free.push(i);
  if (free.length === 0) return -1;
  return free[Math.floor(random() * free.length)];
}

export function findFreeStand(random = Math.random): number {
  const free: number[] = [];
  for (let i = 0; i < STAND_SLOTS.length; i++) if (standOccupant[i] === null) free.push(i);
  if (free.length === 0) return -1;
  return free[Math.floor(random() * free.length)];
}

// Porte la plus proche d'une position z donnée.
export function nearestDoorZ(z: number): number {
  let best: number = CONFIG.doorCenters[0];
  for (const dz of CONFIG.doorCenters) {
    if (Math.abs(dz - z) < Math.abs(best - z)) best = dz;
  }
  return best;
}
