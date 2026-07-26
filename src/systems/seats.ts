// Slots d'assise et de station debout, partagés entre le rendu (Seats.tsx),
// les PNJ (passengers.ts) et le joueur (Player.tsx).

import { CONFIG, carNumbers, carOffsetZ } from '../data/config';

export interface BenchSegment {
  z0: number;
  z1: number;
  n: number; // nombre de places
  priority: boolean; // banquette prioritaire (extrémités)
  freeSpaceSide?: 1 | -1; // côté où la banquette cède la place à la フリースペース
}

// Segments de banquette entre les portes (z), identiques des deux côtés — sauf
// là où la zone libre remplace une banquette. Coordonnées LOCALES à une voiture.
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
// modifier si elle change de place. Repère local d'une voiture.
const freeBench = BENCHES.find((b) => b.freeSpaceSide !== undefined);
export const FREE_SPACE = freeBench
  ? { z0: freeBench.z0, z1: freeBench.z1, side: freeBench.freeSpaceSide as 1 | -1 }
  : null;

export interface SeatSlot {
  x: number;
  z: number; // monde (toutes voitures)
  side: 1 | -1;
  priority: boolean;
  car: number;
}

export type Occupant = number | 'player' | null;

// Places d'une seule voiture, en coordonnées locales (pour le rendu Seats).
export function localSeatSlots(): Omit<SeatSlot, 'car'>[] {
  const slots: Omit<SeatSlot, 'car'>[] = [];
  const sides: (1 | -1)[] = [1, -1];
  for (const side of sides) {
    for (const b of BENCHES) {
      if (b.freeSpaceSide === side) continue;
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

function buildSeatSlots(): SeatSlot[] {
  const slots: SeatSlot[] = [];
  for (const car of carNumbers()) {
    const oz = carOffsetZ(car);
    for (const s of localSeatSlots()) {
      slots.push({ ...s, z: s.z + oz, car });
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
  car: number;
}

function buildStandSlots(): StandSlot[] {
  const slots: StandSlot[] = [];
  for (const car of carNumbers()) {
    const oz = carOffsetZ(car);
    for (let z = -8.4; z <= 8.4; z += 1.2) {
      slots.push({ x: 0.45, z: z + oz, car });
      slots.push({ x: -0.45, z: z + oz, car });
    }
  }
  return slots;
}

export const STAND_SLOTS: StandSlot[] = buildStandSlots();
export const standOccupant: Occupant[] = STAND_SLOTS.map(() => null);

// Les PNJ peuplent surtout la voiture du voyageur (pool limité).
function inPlayerCar(z: number): boolean {
  return Math.abs(z) <= CONFIG.carHalfLength;
}

export function findFreeSeat(random = Math.random): number {
  const free: number[] = [];
  for (let i = 0; i < SEAT_SLOTS.length; i++) {
    if (seatOccupant[i] !== null) continue;
    if (!inPlayerCar(SEAT_SLOTS[i].z)) continue;
    free.push(i);
  }
  if (free.length === 0) return -1;
  return free[Math.floor(random() * free.length)];
}

export function findFreeStand(random = Math.random): number {
  const free: number[] = [];
  for (let i = 0; i < STAND_SLOTS.length; i++) {
    if (standOccupant[i] !== null) continue;
    if (!inPlayerCar(STAND_SLOTS[i].z)) continue;
    free.push(i);
  }
  if (free.length === 0) return -1;
  return free[Math.floor(random() * free.length)];
}

// Porte la plus proche d'une position z monde.
export function nearestDoorZ(z: number): number {
  let best = carOffsetZ(1) + CONFIG.doorCenters[0];
  for (const car of carNumbers()) {
    const oz = carOffsetZ(car);
    for (const dz of CONFIG.doorCenters) {
      const d = oz + dz;
      if (Math.abs(d - z) < Math.abs(best - z)) best = d;
    }
  }
  return best;
}
