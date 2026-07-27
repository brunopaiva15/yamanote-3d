// Logique des PNJ : pool réutilisé, machine à états par passager
// (hidden / seated / standing / boarding / alighting), embarquement et
// descente par waypoints, et une couche de « vie » : regards, téléphone,
// somnolence, éternuements, discussions à deux, décisions assis / debout.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { targetPaxCounts, type PaxTargets } from '../data/occupancy';
import { paxScale } from './perf';
import { runtime } from './runtime';
import { currentSegmentOccupancy } from './occupancy';
import { makeAppearance, type Appearance } from './appearance';
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
export type PaxAction = 'none' | 'look' | 'phone' | 'doze' | 'stare' | 'chat' | 'sneeze';

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
  appearance: Appearance; // apparence complète (habits, corpulence, accessoires)
  height: number; // échelle globale du groupe (dérivée du build)
  width: number; // conservé pour l'ossature de rendu (=1, corpulence en géométrie)
  bobPhase: number;
  bob: number;
  // Couche de vie.
  action: PaxAction;
  actionT: number;
  actionDur: number;
  partner: number; // id du partenaire de discussion, -1 sinon
  chatRole: 0 | 1; // déphasage des hochements de tête
  headYaw: number;
  headPitch: number;
  lookYawTarget: number; // cible de l'action « look »
  bodyLean: number;
  decideT: number; // minuterie des décisions assis / debout
  holdStrap: boolean; // debout : se tient à une poignée (rôdé à chaque passage debout)
  pockets: boolean; // mains dans les poches (trait stable, pantalon uniquement)
}

// Capacité visuelle max d'une voiture (51 assises + 30 debout) + réserve
// d'échange pour animer montées/descentes sans saturer le pool.
const MAX_SEATED = SEAT_SLOTS.length;
const MAX_STANDING = STAND_SLOTS.length;
const EXCHANGE_RESERVE = 15;
export const POOL_SIZE = MAX_SEATED + MAX_STANDING + EXCHANGE_RESERVE;
export const paxList: Pax[] = [];

// Le bas de l'anneau des tsurikawa est à ~1,71 m (poignées remontées pour le
// confort de marche du joueur) : en dessous de cette échelle, un PNJ ne
// l'atteint qu'en s'étirant bras tendu — pas naturel — et garde les bras
// baissés.
const STRAP_MIN_SCALE = 1.06;

function rollStrap(scale: number): boolean {
  return scale >= STRAP_MIN_SCALE && Math.random() < 0.6;
}

// Grille des anneaux de tsurikawa (three/Handles.tsx) : un porteur ne se
// poste PAS à l'aplomb d'un anneau — il se décale pour en avoir un ~0,28 m
// DEVANT lui et l'attraper bras en diagonale (characters/pose.ts vise ce
// même anneau). Décalage ≤ un demi-pas (0,23 m), invisible dans la foule.
const STRAP_Z0 = -9.35;
const STRAP_PITCH = 0.451;
const STRAP_AHEAD = 0.28;

function alignStrapStand(p: Pax): void {
  if (!p.holdStrap) return;
  const dir = Math.cos(p.targetYaw) >= 0 ? 1 : -1;
  const ringZ = STRAP_Z0 + Math.round((p.pos.z + dir * STRAP_AHEAD - STRAP_Z0) / STRAP_PITCH) * STRAP_PITCH;
  p.pos.z = THREE.MathUtils.clamp(ringZ - dir * STRAP_AHEAD, -9.0, 9.0);
}

function makePax(id: number): Pax {
  const appearance = makeAppearance(id);
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
    appearance,
    height: appearance.build.scale,
    width: 1,
    bobPhase: Math.random() * Math.PI * 2,
    bob: 0,
    action: 'none',
    actionT: 0,
    actionDur: 2 + Math.random() * 4,
    partner: -1,
    chatRole: 0,
    headYaw: 0,
    headPitch: 0,
    lookYawTarget: 0,
    bodyLean: 0,
    decideT: 8 + Math.random() * 20,
    holdStrap: rollStrap(appearance.build.scale),
    pockets: appearance.bottom.type === 'trousers' && Math.random() < 0.4,
  };
}

export function initPassengers(): void {
  if (paxList.length > 0) return;
  for (let i = 0; i < POOL_SIZE; i++) paxList.push(makePax(i));
}

// Cibles du tronçon courant, réduites par la qualité vidéo choisie.
function scaledTargets(): PaxTargets {
  const t = targetPaxCounts(currentSegmentOccupancy().percent);
  const s = paxScale();
  return { seated: Math.round(t.seated * s), standing: Math.round(t.standing * s) };
}

// Peuplement initial calé sur le taux de remplissage du tronçon courant.
export function seedPassengers(): void {
  initPassengers();
  const target = scaledTargets();
  let seatedCount = 0;
  let standingCount = 0;
  for (const p of paxList) {
    if (seatedCount < target.seated) {
      const slot = findFreeSeat();
      if (slot >= 0) {
        sitPax(p, slot);
        seatedCount++;
        continue;
      }
    }
    if (standingCount < target.standing) {
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
  p.holdStrap = rollStrap(p.height);
  p.standSlot = slot;
  standOccupant[slot] = p.id;
  const s = STAND_SLOTS[slot];
  p.pos.set(s.x, 0, s.z);
  p.yaw = Math.random() > 0.5 ? 0 : Math.PI;
  p.targetYaw = p.yaw;
  alignStrapStand(p);
}

function releaseSlots(p: Pax): void {
  if (p.seatSlot >= 0 && seatOccupant[p.seatSlot] === p.id) seatOccupant[p.seatSlot] = null;
  if (p.standSlot >= 0 && standOccupant[p.standSlot] === p.id) standOccupant[p.standSlot] = null;
  p.seatSlot = -1;
  p.standSlot = -1;
}

function endChat(p: Pax): void {
  if (p.partner >= 0) {
    const other = paxList[p.partner];
    if (other && other.partner === p.id) {
      other.partner = -1;
      other.action = 'none';
      other.actionT = 0;
      other.actionDur = 2 + Math.random() * 3;
    }
  }
  p.partner = -1;
}

function startWalk(p: Pax, dest: THREE.Vector3, afterWalk: 'seated' | 'standing' | 'hidden'): void {
  endChat(p);
  p.action = 'none';
  p.state = 'boarding';
  p.afterWalk = afterWalk;
  const aisleX = Math.sign(dest.x) * 0.3 || 0.3;
  p.waypoints = [
    new THREE.Vector3(Math.sign(p.pos.x) * 0.3 || 0.3, 0, p.pos.z),
    new THREE.Vector3(aisleX, 0, dest.z),
    dest.clone(),
  ];
  p.wpi = 0;
}

function countInside(): { seated: number; standing: number; seatedPax: Pax[]; standingPax: Pax[] } {
  const seatedPax: Pax[] = [];
  const standingPax: Pax[] = [];
  for (const p of paxList) {
    if (p.state === 'seated') seatedPax.push(p);
    else if (p.state === 'standing') standingPax.push(p);
  }
  return { seated: seatedPax.length, standing: standingPax.length, seatedPax, standingPax };
}

function beginAlight(p: Pax, side: 1 | -1): void {
  const doorZ = nearestDoorZ(p.pos.z);
  releaseSlots(p);
  endChat(p);
  p.action = 'none';
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

function beginBoard(p: Pax, side: 1 | -1, afterWalk: 'seated' | 'standing', boardIndex: number): boolean {
  const doorZ = CONFIG.doorCenters[Math.floor(Math.random() * CONFIG.doorCenters.length)];
  let dest: THREE.Vector3;
  if (afterWalk === 'seated') {
    const seat = findFreeSeat();
    if (seat < 0) return false;
    p.seatSlot = seat;
    seatOccupant[seat] = p.id;
    p.afterWalk = 'seated';
    const s = SEAT_SLOTS[seat];
    dest = new THREE.Vector3(s.x, 0, s.z);
  } else {
    const stand = findFreeStand();
    if (stand < 0) return false;
    p.standSlot = stand;
    standOccupant[stand] = p.id;
    p.afterWalk = 'standing';
    const s = STAND_SLOTS[stand];
    dest = new THREE.Vector3(s.x, 0, s.z);
  }
  p.state = 'boarding';
  p.action = 'none';
  p.pos.set(side * (3.0 + (boardIndex % 6) * 0.45), 0, doorZ + (Math.random() - 0.5) * 0.8);
  p.waypoints = [
    new THREE.Vector3(side * 0.95, 0, doorZ),
    new THREE.Vector3(Math.sign(dest.x) * 0.3 || 0.3, 0, dest.z),
    dest,
  ];
  p.wpi = 0;
  return true;
}

// Dégradation perf : masque immédiatement les PNJ excédentaires par rapport
// aux cibles réduites, en commençant par les plus éloignés du joueur (c'est
// là que la disparition se remarque le moins). Les échanges suivants restent
// naturellement sous les nouvelles cibles.
export function trimPassengersForPerf(): void {
  const target = scaledTargets();
  const { seatedPax, standingPax } = countInside();
  const dist = (p: Pax) => Math.hypot(p.pos.x - runtime.playerX, p.pos.z - runtime.playerZ);
  const farthestFirst = (arr: Pax[]) => [...arr].sort((a, b) => dist(b) - dist(a));
  const hide = (p: Pax) => {
    releaseSlots(p);
    endChat(p);
    p.action = 'none';
    p.state = 'hidden';
    p.waypoints = [];
    p.wpi = 0;
  };
  const standOver = Math.max(0, standingPax.length - target.standing);
  const seatOver = Math.max(0, seatedPax.length - target.seated);
  for (const p of farthestFirst(standingPax).slice(0, standOver)) hide(p);
  for (const p of farthestFirst(seatedPax).slice(0, seatOver)) hide(p);
}

// Échange à quai : rapproche la densité du taux estimé du prochain tronçon.
export function exchangePassengers(side: 1 | -1): void {
  const target = scaledTargets();
  const { seated, standing, seatedPax, standingPax } = countInside();

  // Variance légère pour que deux arrêts au même taux ne soient pas identiques.
  const jitter = () => Math.floor(Math.random() * 3) - 1;
  const wantSeated = Math.max(0, Math.min(MAX_SEATED, target.seated + jitter()));
  const wantStanding = Math.max(0, Math.min(MAX_STANDING, target.standing + jitter()));

  let needSeatOut = Math.max(0, seated - wantSeated);
  let needStandOut = Math.max(0, standing - wantStanding);
  let needSeatIn = Math.max(0, wantSeated - seated);
  let needStandIn = Math.max(0, wantStanding - standing);

  // Toujours un petit flux même si la cible est stable (vie du quai).
  if (needSeatOut + needStandOut + needSeatIn + needStandIn === 0) {
    needSeatOut = Math.min(seated, 1 + Math.floor(Math.random() * 2));
    needStandOut = Math.min(standing, Math.random() < 0.5 ? 1 : 0);
    needSeatIn = needSeatOut;
    needStandIn = needStandOut;
  }

  const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
  let boardIndex = 0;

  for (const p of shuffle(seatedPax).slice(0, needSeatOut)) beginAlight(p, side);
  for (const p of shuffle(standingPax).slice(0, needStandOut)) beginAlight(p, side);

  const freshHidden = paxList.filter((p) => p.state === 'hidden');
  const queue = shuffle(freshHidden);
  let qi = 0;
  while (qi < queue.length && needSeatIn > 0) {
    if (beginBoard(queue[qi++], side, 'seated', boardIndex++)) needSeatIn--;
    else break;
  }
  while (qi < queue.length && needStandIn > 0) {
    if (beginBoard(queue[qi++], side, 'standing', boardIndex++)) needStandIn--;
    else break;
  }
  // Si plus de places assises, basculer le reste en debout.
  while (qi < queue.length && needSeatIn > 0) {
    if (beginBoard(queue[qi++], side, 'standing', boardIndex++)) needSeatIn--;
    else break;
  }
}

// Angle de tête (relatif au corps) pour regarder un point du monde.
function headYawToward(p: Pax, x: number, z: number): number {
  const world = Math.atan2(x - p.pos.x, z - p.pos.z);
  let d = world - p.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return THREE.MathUtils.clamp(d, -1.15, 1.15);
}

// Choix d'une nouvelle occupation pour un PNJ posé (assis ou debout).
function pickAction(p: Pax): void {
  const roll = Math.random();
  const dxp = runtime.playerX - p.pos.x;
  const dzp = runtime.playerZ - p.pos.z;
  const playerClose = Math.hypot(dxp, dzp) < 3.5;

  if (roll < 0.16) {
    // Discussion : trouver un voisin disponible.
    for (const other of paxList) {
      if (other.id === p.id) continue;
      if (other.state !== 'seated' && other.state !== 'standing') continue;
      if (other.action === 'chat' || other.action === 'sneeze') continue;
      if (p.pos.distanceTo(other.pos) > 1.4) continue;
      const dur = 8 + Math.random() * 10;
      p.action = 'chat';
      p.partner = other.id;
      p.chatRole = 0;
      p.actionDur = dur;
      other.action = 'chat';
      other.partner = p.id;
      other.chatRole = 1;
      other.actionT = 0;
      other.actionDur = dur;
      return;
    }
    p.action = 'look';
    p.actionDur = 3 + Math.random() * 3;
    p.lookYawTarget = (Math.random() - 0.5) * 2;
    return;
  }
  if (roll < 0.28 && playerClose) {
    p.action = 'stare';
    p.actionDur = 1.8 + Math.random() * 3;
    return;
  }
  if (roll < 0.5) {
    p.action = 'phone';
    p.actionDur = 6 + Math.random() * 9;
    return;
  }
  if (roll < 0.62 && p.state === 'seated') {
    p.action = 'doze';
    p.actionDur = 8 + Math.random() * 12;
    return;
  }
  if (roll < 0.68) {
    p.action = 'sneeze';
    p.actionDur = 0.9;
    return;
  }
  if (roll < 0.85) {
    p.action = 'look';
    p.actionDur = 2.5 + Math.random() * 4;
    p.lookYawTarget = (Math.random() - 0.5) * 2;
    return;
  }
  p.action = 'none';
  p.actionDur = 2 + Math.random() * 5;
}

// Décisions occasionnelles : un debout va s'asseoir, un assis se dégourdit.
// Renvoie true si le PNJ est parti marcher.
function maybeRelocate(p: Pax): boolean {
  if (p.state === 'standing' && Math.random() < 0.2) {
    const seat = findFreeSeat();
    if (seat >= 0) {
      const s = SEAT_SLOTS[seat];
      if (Math.abs(s.z - p.pos.z) < 5) {
        releaseSlots(p);
        p.seatSlot = seat;
        seatOccupant[seat] = p.id;
        startWalk(p, new THREE.Vector3(s.x, 0, s.z), 'seated');
        return true;
      }
    }
  }
  if (p.state === 'seated' && Math.random() < 0.05) {
    const stand = findFreeStand();
    if (stand >= 0) {
      const s = STAND_SLOTS[stand];
      if (Math.abs(s.z - p.pos.z) < 4) {
        releaseSlots(p);
        p.standSlot = stand;
        standOccupant[stand] = p.id;
        startWalk(p, new THREE.Vector3(s.x, 0, s.z), 'standing');
        return true;
      }
    }
  }
  return false;
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
          if (p.afterWalk === 'seated' && p.seatSlot >= 0) {
            const s = SEAT_SLOTS[p.seatSlot];
            p.state = 'seated';
            p.pos.set(s.x, 0, s.z);
            p.targetYaw = s.side === 1 ? -Math.PI / 2 : Math.PI / 2;
            p.yaw = p.targetYaw;
          } else if (p.afterWalk === 'standing' && p.standSlot >= 0) {
            p.state = 'standing';
            p.holdStrap = rollStrap(p.height);
            p.targetYaw = Math.random() > 0.5 ? 0 : Math.PI;
            alignStrapStand(p);
          } else {
            p.state = 'hidden';
          }
          p.action = 'none';
          p.actionT = 0;
          p.actionDur = 1 + Math.random() * 3;
        }
      } else {
        tmp.normalize().multiplyScalar(step);
        p.pos.add(tmp);
        p.targetYaw = Math.atan2(tmp.x, tmp.z);
        p.bobPhase += dt * 9;
        p.bob = Math.abs(Math.sin(p.bobPhase)) * 0.03;
      }
      // En marche : tête droite, pas d'action.
      p.headYaw += (0 - p.headYaw) * Math.min(1, dt * 6);
      p.headPitch += (0 - p.headPitch) * Math.min(1, dt * 6);
      p.bodyLean *= Math.max(0, 1 - dt * 8);
      let d = p.targetYaw - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 8);
      continue;
    }

    if (p.state !== 'seated' && p.state !== 'standing') continue;

    // --- Couche de vie des PNJ posés ---
    p.bob = 0;
    p.bobPhase += dt;
    p.actionT += dt;
    p.decideT -= dt;

    if (p.decideT <= 0) {
      p.decideT = 14 + Math.random() * 18;
      if (maybeRelocate(p)) continue;
    }

    if (p.actionT >= p.actionDur) {
      p.actionT = 0;
      if (p.action === 'chat') endChat(p);
      pickAction(p);
    }

    // Cibles de tête selon l'action en cours.
    let yawT = 0;
    let pitchT = 0;
    let lean = 0;
    switch (p.action) {
      case 'look':
        yawT = p.lookYawTarget;
        pitchT = 0.04;
        break;
      case 'phone':
        // Le yaw vers la main qui tient le téléphone est ajouté par la pose
        // (characters/pose.ts), qui seule connaît le côté choisi.
        yawT = 0;
        pitchT = 0.55;
        break;
      case 'doze':
        yawT = 0.25;
        pitchT = 0.4 + Math.sin(p.bobPhase * 0.9) * 0.05;
        lean = 0.05;
        break;
      case 'stare':
        yawT = headYawToward(p, runtime.playerX, runtime.playerZ);
        pitchT = THREE.MathUtils.clamp((1.35 - runtime.playerY) * 0.3, -0.3, 0.25);
        break;
      case 'chat': {
        const other = p.partner >= 0 ? paxList[p.partner] : null;
        if (other && other.partner === p.id) {
          yawT = headYawToward(p, other.pos.x, other.pos.z);
          // Hochements alternés : chacun « parle » à son tour.
          pitchT = Math.max(0, Math.sin(p.actionT * 2.4 + p.chatRole * Math.PI)) * 0.09;
        } else {
          endChat(p);
          p.action = 'none';
        }
        break;
      }
      case 'sneeze': {
        // Inspiration tête en arrière, puis atchoum vers l'avant.
        const t = p.actionT;
        if (t < 0.35) pitchT = -0.3 * (t / 0.35);
        else if (t < 0.55) {
          pitchT = 0.55;
          lean = 0.09;
        } else pitchT = 0.55 * (1 - (t - 0.55) / 0.35);
        break;
      }
      default:
        yawT = 0;
        pitchT = 0;
    }
    const speed = p.action === 'sneeze' ? 14 : 4.5;
    p.headYaw += (yawT - p.headYaw) * Math.min(1, dt * speed);
    p.headPitch += (pitchT - p.headPitch) * Math.min(1, dt * speed);
    p.bodyLean += (lean - p.bodyLean) * Math.min(1, dt * speed);
  }
}
