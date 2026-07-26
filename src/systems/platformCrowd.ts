// Foule du quai : pool de voyageurs en attente et en promenade (distincts
// des PNJ de la rame). Une part reste près des portes, l'autre se balade
// le long du quai en continu — comme dans une vraie gare tokyoïte.

import * as THREE from 'three';
import { isMajorHub } from '../data/announcements';
import { CONFIG } from '../data/config';
import { makeAppearance, type Appearance } from './appearance';
import { runtime } from './runtime';

export type CrowdState = 'hidden' | 'waiting' | 'ambling' | 'patrolling';

export interface CrowdPax {
  id: number;
  state: CrowdState;
  role: 'waiter' | 'walker'; // walker = se balade en boucle
  // Position locale du quai (côté +x, avant rotation doorSide).
  pos: THREE.Vector3;
  home: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  appearance: Appearance;
  height: number;
  bobPhase: number;
  bob: number;
  action: 'none' | 'phone' | 'look' | 'shift';
  actionT: number;
  actionDur: number;
  lookYaw: number;
  headPitch: number;
  waypoints: THREE.Vector3[];
  wpi: number;
  walkDir: 1 | -1; // sens de promenade le long du quai
  laneX: number;
}

export const CROWD_POOL = 18;
export const crowdList: CrowdPax[] = [];

const Z_MIN = -34;
const Z_MAX = 34;
const X_MIN = 2.5;
const X_MAX = 5.15;
const WALK_SPEED = CONFIG.walkSpeed * 0.92;

function makeCrowd(id: number): CrowdPax {
  const appearance = makeAppearance(9000 + id);
  return {
    id,
    state: 'hidden',
    role: 'waiter',
    pos: new THREE.Vector3(),
    home: new THREE.Vector3(),
    yaw: 0,
    targetYaw: 0,
    appearance,
    height: appearance.build.scale,
    bobPhase: Math.random() * Math.PI * 2,
    bob: 0,
    action: 'none',
    actionT: 0,
    actionDur: 2 + Math.random() * 4,
    lookYaw: 0,
    headPitch: 0,
    waypoints: [],
    wpi: 0,
    walkDir: Math.random() < 0.5 ? 1 : -1,
    laneX: 3.2,
  };
}

export function initPlatformCrowd(): void {
  if (crowdList.length > 0) return;
  for (let i = 0; i < CROWD_POOL; i++) crowdList.push(makeCrowd(i));
}

function crowdCount(stationIndex: number): { total: number; walkers: number } {
  if (isMajorHub(stationIndex)) return { total: 16, walkers: 7 };
  if (stationIndex % 3 === 0) return { total: 12, walkers: 5 };
  return { total: 9, walkers: 4 };
}

function clampPos(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.clamp(x, X_MIN, X_MAX),
    0,
    THREE.MathUtils.clamp(z, Z_MIN, Z_MAX),
  );
}

// Emplacements d'attente près des portes.
function waitSlot(i: number, n: number, bias: number): THREE.Vector3 {
  const doors = CONFIG.doorCenters;
  const doorZ = doors[i % doors.length];
  const lane = i % 3;
  const x = 2.6 + lane * 0.75 + ((i * 17) % 7) * 0.03;
  const z = doorZ + ((i * 13) % 11 - 5) * 0.5 + bias;
  const spread = (i / Math.max(1, n - 1) - 0.5) * 10;
  return clampPos(x, z + spread * 0.2);
}

function patrolWaypoints(laneX: number, fromZ: number, dir: 1 | -1): THREE.Vector3[] {
  // Trajet long le long du quai, avec un léger écart de voie au demi-tour.
  const endZ = dir > 0 ? Z_MAX - 1 - Math.random() * 4 : Z_MIN + 1 + Math.random() * 4;
  const midZ = (fromZ + endZ) * 0.5;
  const sway = (Math.random() - 0.5) * 0.45;
  return [
    clampPos(laneX + sway * 0.3, midZ),
    clampPos(laneX + sway, endZ),
  ];
}

let seededFor = -1;

export function seedPlatformCrowd(stationIndex: number): void {
  initPlatformCrowd();
  if (seededFor === stationIndex) return;
  seededFor = stationIndex;
  const { total, walkers } = crowdCount(stationIndex);

  for (let i = 0; i < CROWD_POOL; i++) {
    const p = crowdList[i];
    if (i >= total) {
      p.state = 'hidden';
      p.role = 'waiter';
      continue;
    }

    const isWalker = i < walkers;
    p.role = isWalker ? 'walker' : 'waiter';
    p.walkDir = i % 2 === 0 ? 1 : -1;
    p.laneX = isWalker ? 3.0 + (i % 3) * 0.7 : 2.7 + (i % 3) * 0.7;
    p.bobPhase = Math.random() * Math.PI * 2;
    p.waypoints = [];
    p.wpi = 0;

    if (isWalker) {
      const z0 = THREE.MathUtils.lerp(Z_MIN + 4, Z_MAX - 4, (i + 0.5) / walkers);
      p.pos.copy(clampPos(p.laneX, z0));
      p.home.copy(p.pos);
      p.state = 'patrolling';
      p.waypoints = patrolWaypoints(p.laneX, z0, p.walkDir);
      p.wpi = 0;
      p.action = 'shift';
      p.actionT = 0;
      p.actionDur = 20;
      p.yaw = p.walkDir > 0 ? 0 : Math.PI;
      p.targetYaw = p.yaw;
      p.lookYaw = 0;
      p.headPitch = 0;
    } else {
      const home = waitSlot(i - walkers, total - walkers, (stationIndex % 5) * 0.1);
      p.home.copy(home);
      p.pos.copy(home);
      p.state = 'waiting';
      p.yaw = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
      p.targetYaw = p.yaw;
      p.action = Math.random() < 0.4 ? 'phone' : Math.random() < 0.55 ? 'look' : 'none';
      p.actionT = Math.random() * 2;
      p.actionDur = 2 + Math.random() * 4;
      p.lookYaw = (Math.random() - 0.5) * 0.9;
      p.headPitch = p.action === 'phone' ? 0.45 : 0.05;
    }
  }
}

export function clearPlatformCrowd(): void {
  seededFor = -1;
  for (const p of crowdList) {
    p.state = 'hidden';
    p.waypoints = [];
    p.wpi = 0;
  }
}

const tmp = new THREE.Vector3();

function startPatrol(p: CrowdPax): void {
  p.state = 'patrolling';
  p.action = 'shift';
  p.actionT = 0;
  p.actionDur = 30;
  p.waypoints = patrolWaypoints(p.laneX, p.pos.z, p.walkDir);
  p.wpi = 0;
  p.headPitch = 0;
  p.lookYaw = 0;
}

function startShortAmble(p: CrowdPax): void {
  const dist = 4 + Math.random() * 10;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const dest = clampPos(
    p.home.x + (Math.random() - 0.5) * 0.7,
    p.pos.z + dir * dist,
  );
  // Point intermédiaire pour un trajet moins rectiligne.
  const mid = clampPos((p.pos.x + dest.x) * 0.5 + (Math.random() - 0.5) * 0.3, (p.pos.z + dest.z) * 0.5);
  p.state = 'ambling';
  p.action = 'shift';
  p.actionDur = 12;
  p.actionT = 0;
  p.waypoints = [mid, dest];
  p.wpi = 0;
}

function advanceWalk(p: CrowdPax, dt: number, onDone: () => void): void {
  const wp = p.waypoints[p.wpi];
  if (!wp) {
    onDone();
    return;
  }
  tmp.subVectors(wp, p.pos);
  const dist = tmp.length();
  const step = WALK_SPEED * dt;
  if (dist <= step) {
    p.pos.copy(wp);
    p.wpi++;
    if (p.wpi >= p.waypoints.length) onDone();
  } else {
    tmp.normalize().multiplyScalar(step);
    p.pos.add(tmp);
    p.targetYaw = Math.atan2(tmp.x, tmp.z);
    p.bob = Math.abs(Math.sin(p.bobPhase * 9.5)) * 0.028;
  }
  p.lookYaw *= Math.max(0, 1 - dt * 4);
  p.headPitch += (0 - p.headPitch) * Math.min(1, dt * 5);
}

export function updatePlatformCrowd(dt: number): void {
  const presence = runtime.platformFade;
  if (presence < 0.04) {
    if (seededFor >= 0) clearPlatformCrowd();
    return;
  }

  for (const p of crowdList) {
    if (p.state === 'hidden') continue;

    p.actionT += dt;
    p.bobPhase += dt;

    if (p.state === 'patrolling') {
      advanceWalk(p, dt, () => {
        // Bout du quai : demi-tour et nouveau trajet.
        p.walkDir = p.walkDir > 0 ? -1 : 1;
        p.laneX = THREE.MathUtils.clamp(p.laneX + (Math.random() - 0.5) * 0.35, X_MIN + 0.15, X_MAX - 0.15);
        // Petite pause occasionnelle avant de repartir.
        if (Math.random() < 0.22) {
          p.state = 'waiting';
          p.home.copy(p.pos);
          p.action = Math.random() < 0.5 ? 'phone' : 'look';
          p.actionT = 0;
          p.actionDur = 1.2 + Math.random() * 2.5;
          p.headPitch = p.action === 'phone' ? 0.45 : 0.05;
          p.lookYaw = (Math.random() - 0.5) * 0.8;
          p.bob = 0;
        } else {
          startPatrol(p);
        }
      });
    } else if (p.state === 'ambling') {
      advanceWalk(p, dt, () => {
        p.state = 'waiting';
        p.home.copy(p.pos);
        p.action = 'none';
        p.actionT = 0;
        p.actionDur = 1.5 + Math.random() * 3;
        p.bob = 0;
      });
    } else {
      // waiting
      p.bob = Math.sin(p.bobPhase * 1.1) * 0.004;
      if (p.actionT >= p.actionDur) {
        p.actionT = 0;
        if (p.role === 'walker') {
          // Les promeneurs repartent vite marcher.
          startPatrol(p);
        } else {
          const roll = Math.random();
          if (roll < 0.42) {
            // Les gens qui attendent se déplacent souvent le long du quai.
            startShortAmble(p);
          } else if (roll < 0.7) {
            p.action = 'phone';
            p.actionDur = 4 + Math.random() * 6;
            p.headPitch = 0.5;
          } else if (roll < 0.9) {
            p.action = 'look';
            p.actionDur = 2 + Math.random() * 3.5;
            p.lookYaw = (Math.random() - 0.5) * 1.1;
            p.headPitch = 0.04;
          } else {
            p.action = 'none';
            p.actionDur = 1.5 + Math.random() * 2.5;
            p.lookYaw = 0;
            p.headPitch = 0;
          }
        }
      }
      if (p.state === 'waiting') {
        const pitchT = p.action === 'phone' ? 0.5 : p.action === 'look' ? 0.05 : 0;
        const yawT = p.action === 'look' ? p.lookYaw : p.action === 'phone' ? 0.1 : 0;
        p.headPitch += (pitchT - p.headPitch) * Math.min(1, dt * 4);
        p.lookYaw += (yawT - p.lookYaw) * Math.min(1, dt * 3);
        p.targetYaw = -Math.PI / 2 + p.lookYaw * 0.35;
      }
    }

    let d = p.targetYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d * Math.min(1, dt * 5);
  }
}
