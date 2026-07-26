// Foule du quai : pool de voyageurs en attente (distincts des PNJ de la rame).
// Ils peuplent le quai dès l'approche, bougent un peu (regards, téléphone,
// petits déplacements), et se dispersent au départ. Densité selon la gare.

import * as THREE from 'three';
import { isMajorHub } from '../data/announcements';
import { CONFIG } from '../data/config';
import { makeAppearance, type Appearance } from './appearance';
import { runtime } from './runtime';

export type CrowdState = 'hidden' | 'waiting' | 'ambling';

export interface CrowdPax {
  id: number;
  state: CrowdState;
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
}

export const CROWD_POOL = 14;
export const crowdList: CrowdPax[] = [];

function makeCrowd(id: number): CrowdPax {
  const appearance = makeAppearance(9000 + id);
  return {
    id,
    state: 'hidden',
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
  };
}

export function initPlatformCrowd(): void {
  if (crowdList.length > 0) return;
  for (let i = 0; i < CROWD_POOL; i++) crowdList.push(makeCrowd(i));
}

function crowdCount(stationIndex: number): number {
  if (isMajorHub(stationIndex)) return 12;
  // Gares moyennes un peu plus animées que les petites.
  if (stationIndex % 3 === 0) return 9;
  return 6;
}

// Emplacements d'attente le long du quai (x local 2.6..5.2, z dans ±36).
function slotFor(i: number, n: number, doorSideBias: number): THREE.Vector3 {
  // Regrouper près des portes (centres ±2.5 / ±7.5) avec un peu de dispersion.
  const doors = CONFIG.doorCenters;
  const doorZ = doors[i % doors.length];
  const lane = i % 3; // 0 près du bord, 1 milieu, 2 fond
  const x = 2.55 + lane * 0.85 + ((i * 17) % 7) * 0.04;
  const z = doorZ + ((i * 13) % 11 - 5) * 0.55 + doorSideBias;
  // Écarter un peu les indices hauts vers les extrémités pour remplir le quai.
  const spread = (i / Math.max(1, n - 1) - 0.5) * 18;
  return new THREE.Vector3(x, 0, THREE.MathUtils.clamp(z + spread * 0.15, -36, 36));
}

let seededFor = -1;

export function seedPlatformCrowd(stationIndex: number): void {
  initPlatformCrowd();
  if (seededFor === stationIndex) return;
  seededFor = stationIndex;
  const n = crowdCount(stationIndex);
  for (let i = 0; i < CROWD_POOL; i++) {
    const p = crowdList[i];
    if (i >= n) {
      p.state = 'hidden';
      continue;
    }
    const home = slotFor(i, n, (stationIndex % 5) * 0.1);
    p.home.copy(home);
    p.pos.copy(home);
    p.state = 'waiting';
    // Face au train (vers -x local) avec une légère variation.
    p.yaw = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
    p.targetYaw = p.yaw;
    p.action = Math.random() < 0.45 ? 'phone' : Math.random() < 0.5 ? 'look' : 'none';
    p.actionT = Math.random() * 2;
    p.actionDur = 3 + Math.random() * 6;
    p.lookYaw = (Math.random() - 0.5) * 0.9;
    p.headPitch = p.action === 'phone' ? 0.45 : 0.05;
    p.waypoints = [];
    p.wpi = 0;
    p.bobPhase = Math.random() * Math.PI * 2;
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

    if (p.state === 'ambling') {
      const wp = p.waypoints[p.wpi];
      if (!wp) {
        p.state = 'waiting';
        continue;
      }
      tmp.subVectors(wp, p.pos);
      const dist = tmp.length();
      const step = CONFIG.walkSpeed * 0.55 * dt;
      if (dist <= step) {
        p.pos.copy(wp);
        p.wpi++;
        if (p.wpi >= p.waypoints.length) {
          p.state = 'waiting';
          p.home.copy(p.pos);
          p.action = 'none';
          p.actionT = 0;
          p.actionDur = 2 + Math.random() * 4;
          p.bob = 0;
        }
      } else {
        tmp.normalize().multiplyScalar(step);
        p.pos.add(tmp);
        p.targetYaw = Math.atan2(tmp.x, tmp.z);
        p.bob = Math.abs(Math.sin(p.bobPhase * 9)) * 0.025;
      }
      p.lookYaw *= Math.max(0, 1 - dt * 4);
      p.headPitch += (0 - p.headPitch) * Math.min(1, dt * 5);
    } else {
      // waiting
      p.bob = Math.sin(p.bobPhase * 1.1) * 0.004;
      if (p.actionT >= p.actionDur) {
        p.actionT = 0;
        const roll = Math.random();
        if (roll < 0.18) {
          // Petit déplacement le long du quai.
          const dest = p.home.clone();
          dest.z += (Math.random() - 0.5) * 3.2;
          dest.x = THREE.MathUtils.clamp(p.home.x + (Math.random() - 0.5) * 0.5, 2.45, 5.1);
          dest.z = THREE.MathUtils.clamp(dest.z, -36, 36);
          p.state = 'ambling';
          p.waypoints = [dest];
          p.wpi = 0;
          p.action = 'shift';
          p.actionDur = 4;
        } else if (roll < 0.55) {
          p.action = 'phone';
          p.actionDur = 5 + Math.random() * 8;
          p.headPitch = 0.5;
        } else if (roll < 0.85) {
          p.action = 'look';
          p.actionDur = 2.5 + Math.random() * 4;
          p.lookYaw = (Math.random() - 0.5) * 1.1;
          p.headPitch = 0.04;
        } else {
          p.action = 'none';
          p.actionDur = 2 + Math.random() * 3;
          p.lookYaw = 0;
          p.headPitch = 0;
        }
      }
      const pitchT = p.action === 'phone' ? 0.5 : p.action === 'look' ? 0.05 : 0;
      const yawT = p.action === 'look' ? p.lookYaw : p.action === 'phone' ? 0.1 : 0;
      p.headPitch += (pitchT - p.headPitch) * Math.min(1, dt * 4);
      p.lookYaw += (yawT - p.lookYaw) * Math.min(1, dt * 3);
      // Orientation corps : plutôt face au train.
      p.targetYaw = -Math.PI / 2 + p.lookYaw * 0.35;
    }

    let d = p.targetYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d * Math.min(1, dt * 5);
  }
}
