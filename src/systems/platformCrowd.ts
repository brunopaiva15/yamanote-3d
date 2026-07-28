// Foule du quai : pool de voyageurs en attente et en promenade (distincts
// des PNJ de la rame). Une part reste près des portes, l'autre se balade
// le long du quai en continu — comme dans une vraie gare tokyoïte.
//
// Le quai n'est plus une population qui apparaît et disparaît d'un bloc : les
// voyageurs ARRIVENT par les trémies d'escalier, montent dans la rame par les
// portes, et ceux qui en descendent traversent le quai puis s'en vont par ces
// mêmes trémies. Vu du quai, un train qui part ne fait plus s'évaporer tout le
// monde d'un coup.

import * as THREE from 'three';
import { isMajorHub } from '../data/announcements';
import { CONFIG } from '../data/config';
import { makeAppearance, type Appearance } from './appearance';
import { paxScale } from './perf';
import { runtime } from './runtime';
import { useStore } from '../store';
import { psdGates } from '../three/station/psdLayout';
import { placementFor, stairTopZ, stairwellAt, type StationPlacement } from './stationPlacement';
import { layoutFor } from '../data/stationLayouts';
import {
  PSD_X,
  STAIR_GOING,
  STAIR_RISE,
  STAIR_STEPS,
} from '../data/stationGeometry';
import {
  PAX_ACTIONS,
  isPairAction,
  type PaxAction,
} from '../data/paxActions';
import { resolveMotion, platformPlayerCtx } from './paxMotion';

export type CrowdState =
  | 'hidden'
  | 'waiting'
  | 'ambling'
  | 'patrolling'
  /** Monte de la trémie et gagne le quai. */
  | 'arriving'
  /** Gagne une trémie et s'enfonce jusqu'à disparaître. */
  | 'leaving'
  /** Gagne une porte de la rame et y disparaît (relais avec systems/passengers). */
  | 'boarding';

/** Longueur totale de la volée modélisée, du nez au bas des marches. */
const STAIR_FULL_LEN = (STAIR_STEPS + 1) * STAIR_GOING;
/** Altitude à laquelle un voyageur qui descend n'est plus visible du quai. */
const STAIR_VANISH_Y = -STAIR_STEPS * STAIR_RISE + 0.35;

export interface CrowdPax {
  id: number;
  state: CrowdState;
  role: 'waiter' | 'walker'; // walker = se balade en boucle
  // Position locale du quai (côté +x, avant rotation doorSide).
  pos: THREE.Vector3;
  /** Altitude relative au sol du quai : négative dans une trémie. */
  y: number;
  home: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  appearance: Appearance;
  height: number;
  bobPhase: number;
  bob: number;
  action: PaxAction | 'shift';
  actionT: number;
  actionDur: number;
  lookYaw: number;
  headPitch: number;
  waypoints: THREE.Vector3[];
  wpi: number;
  walkDir: 1 | -1; // sens de promenade le long du quai
  laneX: number;
  /** Jeton rendu à systems/passengers quand ce voyageur atteint la porte. */
  ticket: number;
  /** Secondes d'immobilité avant de se mettre en marche (départs échelonnés). */
  delay: number;
  partner: number;
  chatRole: 0 | 1;
}

export const CROWD_POOL = 18;
export const crowdList: CrowdPax[] = [];

// Bornes de la foule, tirées du gabarit de la gare courante : le quai fait
// désormais 224 m et sa profondeur varie d'une typologie à l'autre.
function bounds(): { z0: number; z1: number; x0: number; x1: number } {
  // platformIndex, pas index : au départ la foule reste sur le quai qu'on
  // quitte, dont le gabarit n'est pas celui de la gare suivante.
  const p = placementFor(useStore.getState().platformIndex, psdGates());
  return {
    z0: -p.walkHalfZ + 2,
    z1: p.walkHalfZ - 2,
    x0: p.walkX0 + 0.5,
    x1: Math.min(p.walkX1 - 0.6, p.walkX0 + 4.2),
  };
}
const WALK_SPEED = CONFIG.walkSpeed * 0.92;

function makeCrowd(id: number): CrowdPax {
  const appearance = makeAppearance(9000 + id);
  return {
    id,
    state: 'hidden',
    role: 'waiter',
    pos: new THREE.Vector3(),
    y: 0,
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
    ticket: -1,
    delay: 0,
    partner: -1,
    chatRole: 0,
  };
}

export function initPlatformCrowd(): void {
  if (crowdList.length > 0) return;
  for (let i = 0; i < CROWD_POOL; i++) crowdList.push(makeCrowd(i));
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Outil dev : __crowd donne l'état de chaque voyageur du quai (arrivées par
  // l'escalier, montées en rame, départs vers la sortie).
  (window as unknown as Record<string, unknown>).__crowd = crowdList;
}

function crowdCountBase(stationIndex: number): { total: number; walkers: number } {
  const base = isMajorHub(stationIndex)
    ? { total: 16, walkers: 7 }
    : stationIndex % 3 === 0
      ? { total: 12, walkers: 5 }
      : { total: 9, walkers: 4 };
  return base;
}

/**
 * Densité réelle : le gabarit de la gare pèse autant que son statut de hub —
 * Uguisudani reste vide quand Shinjuku déborde — et la qualité vidéo réduit
 * l'ensemble comme pour les PNJ de la rame.
 */
function crowdCount(stationIndex: number): { total: number; walkers: number } {
  const base = crowdCountBase(stationIndex);
  const s = paxScale() * layoutFor(stationIndex).crowdScale;
  return {
    total: Math.min(CROWD_POOL, Math.round(base.total * s)),
    walkers: Math.round(base.walkers * s),
  };
}

function clampPos(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.clamp(x, bounds().x0, bounds().x1),
    0,
    THREE.MathUtils.clamp(z, bounds().z0, bounds().z1),
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
  const b = bounds();
  const endZ = dir > 0 ? b.z1 - 1 - Math.random() * 4 : b.z0 + 1 + Math.random() * 4;
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
    p.y = 0;
    p.ticket = -1;
    p.role = isWalker ? 'walker' : 'waiter';
    p.walkDir = i % 2 === 0 ? 1 : -1;
    p.laneX = isWalker ? 3.0 + (i % 3) * 0.7 : 2.7 + (i % 3) * 0.7;
    p.bobPhase = Math.random() * Math.PI * 2;
    p.waypoints = [];
    p.wpi = 0;

    if (isWalker) {
      const wb = bounds();
      const z0 = THREE.MathUtils.lerp(wb.z0 + 4, wb.z1 - 4, (i + 0.5) / walkers);
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
      p.partner = -1;
      p.chatRole = 0;
    }
  }
}

export function clearPlatformCrowd(): void {
  seededFor = -1;
  arrivedBoarders.length = 0;
  for (const p of crowdList) {
    p.state = 'hidden';
    p.waypoints = [];
    p.wpi = 0;
    p.y = 0;
    p.ticket = -1;
    p.partner = -1;
    p.action = 'none';
  }
}

// --- Flux de voyageurs : trémies et portes -------------------------------

function placement(): StationPlacement {
  return placementFor(useStore.getState().platformIndex, psdGates());
}

/** Trémie la plus proche d'une abscisse z locale, ou null si la gare n'en a pas. */
function nearestStair(p: StationPlacement, z: number) {
  let best = null;
  let bestD = Infinity;
  for (const s of p.stairs) {
    const d = Math.abs(s.z - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Altitude du sol sous un voyageur : nulle sur le quai, négative dans une volée. */
function floorYAt(p: StationPlacement, x: number, z: number): number {
  return stairwellAt(p, x, z, STAIR_FULL_LEN, STAIR_STEPS)?.y ?? 0;
}

function freeSlot(): CrowdPax | null {
  for (const p of crowdList) if (p.state === 'hidden') return p;
  return null;
}

/**
 * Voyageurs présents ou en train d'arriver. Ceux qui s'en vont ne comptent
 * plus : c'est ce qui permet de remplir le quai progressivement sans le
 * surpeupler pendant que les précédents descendent encore l'escalier.
 */
export function crowdPresentCount(): number {
  let n = 0;
  for (const p of crowdList) {
    if (p.state === 'waiting' || p.state === 'ambling' || p.state === 'patrolling' || p.state === 'arriving') n++;
  }
  return n;
}

function sendToStairs(p: CrowdPax, pl: StationPlacement, delay = 0): boolean {
  const s = nearestStair(pl, p.pos.z);
  if (!s) return false;
  const lane = (Math.random() - 0.5) * 1.4;
  endCrowdPair(p);
  p.state = 'leaving';
  p.action = 'none';
  p.headPitch = 0;
  p.lookYaw = 0;
  p.delay = delay;
  p.waypoints = [
    clampPos(s.x + lane, stairTopZ(s) - 1.5),
    new THREE.Vector3(s.x + lane * 0.35, 0, stairTopZ(s) + STAIR_FULL_LEN),
  ];
  p.wpi = 0;
  return true;
}

/**
 * Un voyageur vient de descendre de la rame : il apparaît au seuil de la porte
 * et traverse le quai vers la sortie. C'est le relais de systems/passengers,
 * dont les PNJ vivent, eux, dans le repère du wagon.
 */
export function crowdArriveFromTrain(doorLocalZ: number): boolean {
  initPlatformCrowd();
  const p = freeSlot();
  if (!p) return false;
  const pl = placement();
  // Même abscisse que le relais côté rame (systems/passengers) : le voyageur
  // continue exactement là où il s'arrête.
  p.pos.set(2.0, 0, doorLocalZ + (Math.random() - 0.5) * 0.5);
  p.y = 0;
  p.home.copy(p.pos);
  p.bob = 0;
  p.yaw = Math.PI / 2;
  p.targetYaw = p.yaw;
  p.ticket = -1;
  if (!sendToStairs(p, pl)) {
    // Gare sans trémie : le voyageur rejoint simplement le fond du quai.
    p.state = 'ambling';
    p.action = 'none';
    p.waypoints = [clampPos(bounds().x1, p.pos.z + (Math.random() - 0.5) * 12)];
    p.wpi = 0;
  }
  return true;
}

/**
 * Envoie un voyageur en attente vers une porte. Il disparaît au seuil et son
 * jeton est rendu par takeArrivedBoarders() : c'est là que systems/passengers
 * prend le relais à l'intérieur du wagon.
 */
export function crowdSendBoarder(doorLocalZ: number, ticket: number): boolean {
  let best: CrowdPax | null = null;
  let bestD = Infinity;
  for (const p of crowdList) {
    if (p.state !== 'waiting' && p.state !== 'ambling' && p.state !== 'patrolling') continue;
    const d = Math.hypot(p.pos.x - (PSD_X + 1.4), p.pos.z - doorLocalZ);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best || bestD > 26) return false;
  endCrowdPair(best);
  best.state = 'boarding';
  best.action = 'none';
  best.headPitch = 0;
  best.lookYaw = 0;
  best.ticket = ticket;
  best.waypoints = [
    clampPos(PSD_X + 1.2, doorLocalZ + (Math.random() - 0.5) * 0.6),
    new THREE.Vector3(2.0, 0, doorLocalZ),
  ];
  best.wpi = 0;
  return true;
}

/** Jetons des voyageurs arrivés au seuil depuis le dernier appel. */
const arrivedBoarders: number[] = [];

export function takeArrivedBoarders(): number[] {
  if (arrivedBoarders.length === 0) return [];
  const out = arrivedBoarders.slice();
  arrivedBoarders.length = 0;
  return out;
}

/**
 * Le train est parti : ceux qui restent sur le quai gagnent la sortie, chacun
 * à son rythme. C'est ce qui remplace l'effacement d'un bloc de toute la foule
 * — vu du quai, c'était un claquement de doigts.
 */
export function crowdDisperse(): void {
  seededFor = -1;
  const pl = placement();
  let k = 0;
  for (const p of crowdList) {
    // Un voyageur encore en route vers une porte a raté la rame : il repart
    // comme les autres plutôt que de marcher vers un quai vide.
    if (p.state === 'boarding') {
      p.ticket = -1;
      p.state = 'waiting';
    }
    if (p.state !== 'waiting' && p.state !== 'ambling' && p.state !== 'patrolling') continue;
    // Les promeneurs restent : ils ne prenaient pas ce train.
    if (p.role === 'walker' && Math.random() < 0.55) continue;
    // Départ échelonné : la file s'étire d'elle-même vers l'escalier.
    if (!sendToStairs(p, pl, k * 1.1 + Math.random() * 2.5)) p.state = 'hidden';
    k++;
  }
}

/** Fait monter un voyageur par une trémie, pour la rame suivante. */
export function crowdArrive(stationIndex: number): boolean {
  initPlatformCrowd();
  const p = freeSlot();
  if (!p) return false;
  const pl = placement();
  const total = crowdCount(stationIndex).total;
  const home = waitSlot(Math.floor(Math.random() * Math.max(1, total)), total, 0);
  const s = nearestStair(pl, (Math.random() - 0.5) * pl.walkHalfZ * 1.6);
  // Une part des arrivants ne prend pas ce train : ils arpentent le quai.
  p.role = Math.random() < 0.35 ? 'walker' : 'waiter';
  p.ticket = -1;
  p.delay = 0;
  p.bob = 0;
  p.action = 'none';
  p.headPitch = 0;
  p.lookYaw = 0;
  p.home.copy(home);
  p.state = 'arriving';
  p.wpi = 0;
  if (s) {
    const lane = (Math.random() - 0.5) * 1.2;
    p.pos.set(s.x + lane * 0.35, 0, stairTopZ(s) + STAIR_FULL_LEN);
    p.y = floorYAt(pl, p.pos.x, p.pos.z);
    p.waypoints = [clampPos(s.x + lane, stairTopZ(s) - 1.4), home];
    p.yaw = Math.PI;
  } else {
    // Sans trémie, le voyageur entre par un bout du quai.
    const from = Math.random() < 0.5 ? -pl.walkHalfZ + 1 : pl.walkHalfZ - 1;
    p.pos.set(bounds().x1, 0, from);
    p.y = 0;
    p.waypoints = [home];
    p.yaw = p.pos.z > 0 ? Math.PI : 0;
  }
  p.targetYaw = p.yaw;
  return true;
}

/** Cible de foule d'une gare, pour piloter le remplissage progressif. */
export function crowdTarget(stationIndex: number): number {
  return crowdCount(stationIndex).total;
}

const tmp = new THREE.Vector3();

function startPatrol(p: CrowdPax): void {
  endCrowdPair(p);
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
  endCrowdPair(p);
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

function endCrowdPair(p: CrowdPax): void {
  if (p.partner >= 0) {
    const other = crowdList[p.partner];
    if (other && other.partner === p.id) {
      other.partner = -1;
      other.action = 'none';
      other.actionT = 0;
      other.actionDur = 1.5 + Math.random() * 2.5;
    }
  }
  p.partner = -1;
}

function findCrowdPartner(p: CrowdPax, maxDist: number): CrowdPax | null {
  let best: CrowdPax | null = null;
  let bestD = maxDist;
  for (const other of crowdList) {
    if (other.id === p.id) continue;
    if (other.state !== 'waiting') continue;
    if (other.action === 'shift') continue;
    if (isPairAction(other.action as PaxAction)) continue;
    const d = p.pos.distanceTo(other.pos);
    if (d > bestD) continue;
    bestD = d;
    best = other;
  }
  return best;
}

/** Tirage d'occupation pour un voyageur en attente (catalogue waiting). */
function pickCrowdAction(p: CrowdPax): void {
  const player = platformPlayerCtx();
  const playerDist = Math.hypot(p.pos.x - player.playerX, p.pos.z - player.playerZ);
  const arch = p.appearance.archetype;

  let total = 0;
  const weights: number[] = [];
  for (let i = 0; i < PAX_ACTIONS.length; i++) {
    const def = PAX_ACTIONS[i];
    let w = 0;
    if (def.where.includes('waiting')) {
      w = def.weight;
      if (def.kind === 'player') {
        if (runtime.playerFrame !== 'platform' || playerDist >= (def.playerDist ?? 3.5)) w = 0;
      }
      if (def.needsMask && !p.appearance.mask) w = 0;
      if (def.needsGlasses && !p.appearance.glasses) w = 0;
      if (def.needsBag && p.appearance.bag === 'none') w = 0;
      if (def.archetypes && def.archetypes.includes(arch)) w *= def.archetypeBoost ?? 1.4;
    }
    weights[i] = w;
    total += w;
  }

  if (total <= 0) {
    p.action = 'none';
    p.actionDur = 1.5 + Math.random() * 2.5;
    p.lookYaw = 0;
    return;
  }

  let pick = Math.random() * total;
  let chosen = PAX_ACTIONS[PAX_ACTIONS.length - 1];
  for (let i = 0; i < PAX_ACTIONS.length; i++) {
    pick -= weights[i];
    if (pick <= 0) {
      chosen = PAX_ACTIONS[i];
      break;
    }
  }

  const dur = chosen.dur[0] + Math.random() * (chosen.dur[1] - chosen.dur[0]);
  p.actionDur = dur;
  if (
    chosen.id === 'look' ||
    chosen.id === 'lookBoard' ||
    chosen.id === 'fidget' ||
    chosen.id === 'curiousGlance'
  ) {
    p.lookYaw = (Math.random() - 0.5) * 1.1;
  }

  if (chosen.kind === 'pair') {
    const other = findCrowdPartner(p, chosen.partnerDist ?? 1.4);
    if (other) {
      p.action = chosen.id;
      p.partner = other.id;
      p.chatRole = 0;
      other.action = chosen.id;
      other.partner = p.id;
      other.chatRole = 1;
      other.actionT = 0;
      other.actionDur = dur;
      return;
    }
    p.action = 'look';
    p.actionDur = 2 + Math.random() * 3;
    return;
  }

  p.action = chosen.id;
  p.partner = -1;
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

/**
 * Rayon d'évitement autour du joueur quand il est sur le quai. Personne ne
 * traverse personne : sans cela, un promeneur passerait au travers de la tête
 * du joueur, ce qui n'arrive jamais dans un vrai couloir.
 */
const PLAYER_CLEARANCE = 0.62;

function avoidPlayer(p: CrowdPax): void {
  if (runtime.playerFrame !== 'platform') return;
  const dx = p.pos.x - runtime.playerPlatX;
  const dz = p.pos.z - runtime.playerPlatZ;
  const d = Math.hypot(dx, dz);
  if (d >= PLAYER_CLEARANCE || d < 1e-4) return;
  const push = (PLAYER_CLEARANCE - d) / d;
  p.pos.x += dx * push;
  p.pos.z += dz * push;
}

export function updatePlatformCrowd(dt: number): void {
  const presence = runtime.platformFade;
  if (presence < 0.04) {
    if (seededFor >= 0) clearPlatformCrowd();
    return;
  }
  // Une seule résolution du gabarit par frame : les transits la consultent
  // pour savoir à quelle hauteur ils posent le pied dans une trémie.
  const currentPlacement = placement();

  for (const p of crowdList) {
    if (p.state === 'hidden') continue;

    p.actionT += dt;
    p.bobPhase += dt;
    avoidPlayer(p);

    // Transits : arrivée par la trémie, départ vers la sortie, montée en rame.
    if (p.state === 'arriving' || p.state === 'leaving' || p.state === 'boarding') {
      if (p.delay > 0) {
        p.delay -= dt;
        p.bob = Math.sin(p.bobPhase * 1.1) * 0.004;
      } else {
        advanceWalk(p, dt, () => {
          if (p.state === 'boarding') {
            // Le relais est pris à l'intérieur du wagon (systems/passengers).
            if (p.ticket >= 0) arrivedBoarders.push(p.ticket);
            p.ticket = -1;
            p.state = 'hidden';
          } else if (p.state === 'leaving') {
            p.state = 'hidden';
          } else if (p.role === 'walker') {
            startPatrol(p);
            return;
          } else {
            p.state = 'waiting';
            p.home.copy(p.pos);
            p.action = 'none';
            p.actionT = 0;
            p.actionDur = 1.5 + Math.random() * 3;
            p.bob = 0;
          }
          p.waypoints = [];
          p.wpi = 0;
        });
        // Les marches se descendent vraiment : l'altitude suit le profil de la
        // volée, et on disparaît une fois passé sous la dalle.
        p.y = floorYAt(currentPlacement, p.pos.x, p.pos.z);
        if (p.state === 'leaving' && p.y <= STAIR_VANISH_Y) {
          p.state = 'hidden';
          p.waypoints = [];
          p.wpi = 0;
        }
      }
      let dy = p.targetYaw - p.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 5);
      continue;
    }

    if (p.state === 'patrolling') {
      advanceWalk(p, dt, () => {
        // Bout du quai : demi-tour et nouveau trajet.
        p.walkDir = p.walkDir > 0 ? -1 : 1;
        p.laneX = THREE.MathUtils.clamp(p.laneX + (Math.random() - 0.5) * 0.35, bounds().x0 + 0.15, bounds().x1 - 0.15);
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
        if (isPairAction(p.action as PaxAction)) endCrowdPair(p);
        if (p.role === 'walker') {
          // Les promeneurs repartent vite marcher.
          startPatrol(p);
        } else if (Math.random() < 0.38) {
          // Les gens qui attendent se déplacent souvent le long du quai.
          startShortAmble(p);
        } else {
          pickCrowdAction(p);
        }
      }
      if (p.state === 'waiting') {
        const partner = p.partner >= 0 ? crowdList[p.partner] : null;
        if (isPairAction(p.action as PaxAction) && (!partner || partner.partner !== p.id)) {
          endCrowdPair(p);
          p.action = 'none';
        }
        const player = platformPlayerCtx();
        const m = resolveMotion({
          action: p.action === 'shift' ? 'none' : (p.action as PaxAction),
          actionT: p.actionT,
          bobPhase: p.bobPhase,
          chatRole: p.chatRole,
          lookYawTarget: p.lookYaw,
          posX: p.pos.x,
          posZ: p.pos.z,
          yaw: p.yaw,
          partnerX: partner?.pos.x,
          partnerZ: partner?.pos.z,
          playerX: player.playerX,
          playerY: player.playerY,
          playerZ: player.playerZ,
        });
        p.headPitch += (m.pitch - p.headPitch) * Math.min(1, dt * m.speed);
        p.lookYaw += (m.yaw - p.lookYaw) * Math.min(1, dt * Math.min(m.speed, 4));
        p.targetYaw = -Math.PI / 2 + p.lookYaw * 0.35;
      }
    }

    let d = p.targetYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d * Math.min(1, dt * 5);
  }
}
