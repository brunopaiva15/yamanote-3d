// Slots d'assise et de station debout, partagés entre le rendu (Seats.tsx),
// les PNJ (passengers.ts) et le joueur (Player.tsx).

import { CONFIG } from '../data/config';

export interface BenchSegment {
  z0: number;
  z1: number;
  n: number; // nombre de places
  priority: boolean; // banquette prioritaire (extrémités)
}

// Segments de banquette entre les portes (z), identiques des deux côtés.
export const BENCHES: BenchSegment[] = [
  { z0: -9.55, z1: -8.16, n: 3, priority: true },
  { z0: -6.84, z1: -3.16, n: 7, priority: false },
  { z0: -1.84, z1: 1.84, n: 7, priority: false },
  { z0: 3.16, z1: 6.84, n: 7, priority: false },
  { z0: 8.16, z1: 9.55, n: 3, priority: true },
];

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
