// Logique des PNJ : pool réutilisé, machine à états par passager
// (hidden / seated / standing / boarding / alighting), embarquement et
// descente par waypoints à chaque arrêt.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import {
  SEAT_SLOTS,
  STAND_SLOTS,
  findFreeSeat,
  findFreeStand,
  nearestDoorZ,
  seatOccupant,
  standOccupant,
} from './seats';

export type PaxState = 'hidden' | 'seated' | 'standing' | 'boarding' | 'alighting';

export interface Pax {
  id: number;
  state: PaxState;
  pos: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  waypoints: THREE.Vector3[];
  wpi: number;
  seatSlot: number;
  standSlot: number;
  afterWalk: 'seated' | 'standing' | 'hidden';
  coat: string;
  face: number;
  height: number; // facteur d'échelle 0.95..1.06
  bobPhase: number;
  bob: number;
}

export const POOL_SIZE = 18;
export const paxList: Pax[] = [];

const COATS = ['#5d6470', '#7a6a58', '#42566b', '#6e5a6e', '#556455', '#7d7468', '#4d4a55', '#8a7f72', '#5f6d7d', '#6b5648'];

function makePax(id: number): Pax {
  return {
    id,
    state: 'hidden',
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    targetYaw: 0,
    waypoints: [],
    wpi: 0,
    seatSlot: -1,
    standSlot: -1,
    afterWalk: 'hidden',
    coat: COATS[id % COATS.length],
    face: id % 8,
    height: 0.95 + ((id * 37) % 12) / 100,
    bobPhase: Math.random() * Math.PI * 2,
    bob: 0,
  };
}

export function initPassengers(): void {
  if (paxList.length > 0) return;
  for (let i = 0; i < POOL_SIZE; i++) paxList.push(makePax(i));
}

// Peuplement initial : environ 9 assis + 4 debout, reste en réserve.
export function seedPassengers(): void {
  initPassengers();
  let seatedCount = 0;
  let standingCount = 0;
  for (const p of paxList) {
    if (seatedCount < 9) {
      const slot = findFreeSeat();
      if (slot >= 0) {
        sitPax(p, slot);
        seatedCount++;
        continue;
      }
    }
    if (standingCount < 4) {
      const slot = findFreeStand();
      if (slot >= 0) {
        standPax(p, slot);
        standingCount++;
        continue;
      }
    }
    p.state = 'hidden';
  }
}

function sitPax(p: Pax, slot: number): void {
  p.state = 'seated';
  p.seatSlot = slot;
  seatOccupant[slot] = p.id;
  const s = SEAT_SLOTS[slot];
  p.pos.set(s.x, 0, s.z);
  p.yaw = s.side === 1 ? -Math.PI / 2 : Math.PI / 2;
  p.targetYaw = p.yaw;
}

function standPax(p: Pax, slot: number): void {
  p.state = 'standing';
  p.standSlot = slot;
  standOccupant[slot] = p.id;
  const s = STAND_SLOTS[slot];
  p.pos.set(s.x, 0, s.z);
  p.yaw = Math.random() > 0.5 ? 0 : Math.PI;
  p.targetYaw = p.yaw;
}

function releaseSlots(p: Pax): void {
  if (p.seatSlot >= 0 && seatOccupant[p.seatSlot] === p.id) seatOccupant[p.seatSlot] = null;
  if (p.standSlot >= 0 && standOccupant[p.standSlot] === p.id) standOccupant[p.standSlot] = null;
  p.seatSlot = -1;
  p.standSlot = -1;
}

// Échange à quai : quelques descentes, quelques montées, côté doorSide.
export function exchangePassengers(side: 1 | -1): void {
  const inside = paxList.filter((p) => p.state === 'seated' || p.state === 'standing');
  const hidden = paxList.filter((p) => p.state === 'hidden');
  const nOut = Math.min(inside.length, 1 + Math.floor(Math.random() * 3));
  const nIn = Math.min(hidden.length, 1 + Math.floor(Math.random() * 3));

  // Descentes.
  const shuffledIn = [...inside].sort(() => Math.random() - 0.5);
  for (let i = 0; i < nOut; i++) {
    const p = shuffledIn[i];
    const doorZ = nearestDoorZ(p.pos.z);
    releaseSlots(p);
    p.state = 'alighting';
    p.afterWalk = 'hidden';
    p.waypoints = [
      new THREE.Vector3(side * 0.3, 0, p.pos.z),
      new THREE.Vector3(side * 0.95, 0, doorZ),
      new THREE.Vector3(side * 2.4, 0, doorZ),
      new THREE.Vector3(side * 3.4, 0, doorZ + (Math.random() - 0.5) * 2.5),
    ];
    p.wpi = 0;
  }

  // Montées, avec un léger décalage spatial par la même porte.
  const shuffledOut = [...hidden].sort(() => Math.random() - 0.5);
  for (let i = 0; i < nIn; i++) {
    const p = shuffledOut[i];
    const doorZ = CONFIG.doorCenters[Math.floor(Math.random() * CONFIG.doorCenters.length)];
    const seat = findFreeSeat();
    let dest: THREE.Vector3;
    if (seat >= 0) {
      p.seatSlot = seat;
      seatOccupant[seat] = p.id;
      p.afterWalk = 'seated';
      const s = SEAT_SLOTS[seat];
      dest = new THREE.Vector3(s.x, 0, s.z);
    } else {
      const stand = findFreeStand();
      if (stand < 0) continue;
      p.standSlot = stand;
      standOccupant[stand] = p.id;
      p.afterWalk = 'standing';
      const s = STAND_SLOTS[stand];
      dest = new THREE.Vector3(s.x, 0, s.z);
    }
    p.state = 'boarding';
    p.pos.set(side * (3.0 + i * 0.5), 0, doorZ + (Math.random() - 0.5) * 0.8);
    p.waypoints = [
      new THREE.Vector3(side * 0.95, 0, doorZ),
      new THREE.Vector3(Math.sign(dest.x) * 0.3 || 0.3, 0, dest.z),
      dest,
    ];
    p.wpi = 0;
  }
}

const tmp = new THREE.Vector3();

export function updatePassengers(dt: number): void {
  for (const p of paxList) {
    if (p.state === 'boarding' || p.state === 'alighting') {
      const wp = p.waypoints[p.wpi];
      if (!wp) continue;
      tmp.subVectors(wp, p.pos);
      const dist = tmp.length();
      const step = CONFIG.walkSpeed * dt;
      if (dist <= step) {
        p.pos.copy(wp);
        p.wpi++;
        if (p.wpi >= p.waypoints.length) {
          // Arrivée au bout du chemin.
          if (p.afterWalk === 'seated' && p.seatSlot >= 0) {
            const s = SEAT_SLOTS[p.seatSlot];
            p.state = 'seated';
            p.pos.set(s.x, 0, s.z);
            p.targetYaw = s.side === 1 ? -Math.PI / 2 : Math.PI / 2;
            p.yaw = p.targetYaw;
          } else if (p.afterWalk === 'standing' && p.standSlot >= 0) {
            p.state = 'standing';
            p.targetYaw = Math.random() > 0.5 ? 0 : Math.PI;
          } else {
            p.state = 'hidden';
          }
        }
      } else {
        tmp.normalize().multiplyScalar(step);
        p.pos.add(tmp);
        p.targetYaw = Math.atan2(tmp.x, tmp.z);
        p.bobPhase += dt * 9;
        p.bob = Math.abs(Math.sin(p.bobPhase)) * 0.03;
      }
      // Lissage de l'orientation.
      let d = p.targetYaw - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 8);
    } else if (p.state === 'standing') {
      p.bob = 0;
      p.bobPhase += dt;
    } else if (p.state === 'seated') {
      p.bob = 0;
    }
  }
}
