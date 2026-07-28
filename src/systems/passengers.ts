// Logique des PNJ : pool réutilisé, machine à états par passager
// (hidden / seated / standing / boarding / alighting), embarquement et
// descente par waypoints, et une couche de « vie » tirée du catalogue
// data/paxActions : regards, téléphone, somnolence, échanges à deux,
// micro-gestes, décisions assis / debout.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { targetPaxCounts, type PaxTargets } from '../data/occupancy';
import { paxScale } from './perf';
import { runtime } from './runtime';
import { currentSegmentOccupancy } from './occupancy';
import { makeAppearance, type Appearance } from './appearance';
import { crowdArriveFromTrain, crowdSendBoarder, takeArrivedBoarders } from './platformCrowd';
import { worldToPlatform } from './playerFrame';
import {
  SEAT_SLOTS,
  STAND_SLOTS,
  findFreeSeat,
  findFreeStand,
  nearestDoorZ,
  seatOccupant,
  standOccupant,
} from './seats';
import {
  BUSY_BRIEF,
  PAX_ACTIONS,
  isPairAction,
  isFallingAction,
  isDramaAction,
  type PaxAction,
  type ActionWhere,
} from '../data/paxActions';
import { resolveMotion, trainPlayerCtx } from './paxMotion';
import { playPaxActionSfx } from './paxSfx';
import { paxBump } from './audioEngine';

export type PaxState = 'hidden' | 'seated' | 'standing' | 'boarding' | 'alighting';
export type { PaxAction };

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
  headRoll: number; // inclinaison (écoute / sourire)
  lookYawTarget: number; // cible de l'action « look » ; aussi signe de chute (±1)
  bodyLean: number;
  bodyRoll: number; // roulis (chutes latérales)
  /** Accumulation de poussée par le joueur (0..~1.5) ; chute au-delà du seuil. */
  pushAccum: number;
  decideT: number; // minuterie des décisions assis / debout
  holdStrap: boolean; // debout : se tient à une poignée (rôdé à chaque passage debout)
  pockets: boolean; // mains dans les poches (trait stable, pantalon uniquement)
  /** Porte par laquelle ce PNJ descend ; -1 s'il ne descend pas. */
  exitDoorZ: number;
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
    actionDur: 0.6 + Math.random() * 1.8,
    partner: -1,
    chatRole: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    lookYawTarget: 0,
    bodyLean: 0,
    bodyRoll: 0,
    pushAccum: 0,
    decideT: 3 + Math.random() * 8,
    holdStrap: rollStrap(appearance.build.scale),
    pockets: appearance.bottom.type === 'trousers' && Math.random() < 0.4,
    exitDoorZ: -1,
  };
}

export function initPassengers(): void {
  if (paxList.length > 0) return;
  for (let i = 0; i < POOL_SIZE; i++) paxList.push(makePax(i));
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Outil dev : __pax donne l'état de chaque voyageur de la rame (posture,
  // occupation en cours, partenaire d'échange) — pendant de __crowd.
  (window as unknown as Record<string, unknown>).__pax = paxList;
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
  releasePending();
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
  seedChats();
}

/** Lance des discussions silencieuses entre voisins dès le peuplement. */
function seedChats(): void {
  const candidates = paxList.filter((p) => p.state === 'seated' || p.state === 'standing');
  // Mélange léger pour ne pas toujours jumeler les mêmes ids.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const used = new Set<number>();
  let pairs = 0;
  const want = Math.max(3, Math.floor(candidates.length * 0.28));
  for (const p of candidates) {
    if (pairs >= want) break;
    if (used.has(p.id)) continue;
    let best: Pax | null = null;
    let bestD = 1.75;
    for (const other of candidates) {
      if (other.id === p.id || used.has(other.id)) continue;
      if (other.state !== p.state) continue; // voisins de même posture
      const d = p.pos.distanceTo(other.pos);
      if (d > bestD) continue;
      bestD = d;
      best = other;
    }
    if (!best) continue;
    used.add(p.id);
    used.add(best.id);
    const roll = Math.random();
    const kind: PaxAction =
      roll < 0.55 ? 'chat' : roll < 0.72 ? 'gossip' : roll < 0.85 ? 'laugh' : roll < 0.93 ? 'whisper' : 'nodAgree';
    const dur = 6 + Math.random() * 10;
    applyAction(p, kind, dur, best);
    pairs++;
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

/** Libère un éventuel partenaire d'échange (chat, chuchotis, rire…). */
function endPair(p: Pax): void {
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
  endPair(p);
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

/**
 * Passage de relais entre les deux populations.
 *
 * Les PNJ de la rame vivent dans le repère du WAGON ; ceux du quai dans celui
 * de la GARE. Un voyageur qui descend ne peut donc pas rester un PNJ de rame :
 * il glisserait avec le train au démarrage. La bascule se fait DANS LA BAIE de
 * la porte palière, juste derrière le nez de quai : c'est le point le plus
 * masqué, encadré par la caisse d'un côté et les portes palières de l'autre.
 *
 * Avant, un descendant marchait jusqu'à 3,40 m sur le quai puis s'évaporait, et
 * un montant se matérialisait au même endroit : les voyageurs apparaissaient et
 * disparaissaient en plein milieu du quai.
 */
const DOOR_HANDOVER_X = 2.0;

/** z du quai (repère local) correspondant à une porte du wagon. */
function doorPlatformZ(doorZ: number): number {
  const out = { x: 0, z: 0 };
  worldToPlatform(0, doorZ + runtime.trainZ, out);
  return out.z;
}

function beginAlight(p: Pax, side: 1 | -1): void {
  const doorZ = nearestDoorZ(p.pos.z);
  releaseSlots(p);
  endPair(p);
  p.action = 'none';
  p.state = 'alighting';
  p.afterWalk = 'hidden';
  p.exitDoorZ = doorZ;
  p.waypoints = [
    new THREE.Vector3(side * 0.3, 0, p.pos.z),
    new THREE.Vector3(side * 0.95, 0, doorZ),
    new THREE.Vector3(side * DOOR_HANDOVER_X, 0, doorZ),
  ];
  p.wpi = 0;
}

/**
 * Montées en attente : la place est réservée dès l'échange, mais le PNJ ne
 * démarre que lorsque le voyageur du quai a atteint le seuil (ou après un
 * délai de garde, si le quai est vide).
 */
interface PendingBoard {
  paxId: number;
  side: 1 | -1;
  doorZ: number;
  dest: THREE.Vector3;
  /** Secondes restantes avant démarrage forcé. */
  fuse: number;
}
const pendingBoards: PendingBoard[] = [];
let nextTicket = 1;

function releasePending(): void {
  for (const b of pendingBoards) releaseSlots(paxList[b.paxId]);
  pendingBoards.length = 0;
  // Les jetons dont le voyageur du quai a été effacé en route ne reviendront
  // jamais : on ne les garde pas d'une rame à l'autre.
  ticketToPax.clear();
}

/** Démarre la marche intérieure d'un montant, depuis l'embrasure de la porte. */
function startBoardWalk(b: PendingBoard): void {
  const p = paxList[b.paxId];
  // La place réservée a pu être libérée entre-temps (dégradation perf, reset).
  if (p.seatSlot < 0 && p.standSlot < 0) return;
  p.state = 'boarding';
  p.action = 'none';
  p.pos.set(b.side * DOOR_HANDOVER_X, 0, b.doorZ);
  p.waypoints = [
    new THREE.Vector3(b.side * 0.95, 0, b.doorZ),
    new THREE.Vector3(Math.sign(b.dest.x) * 0.3 || 0.3, 0, b.dest.z),
    b.dest.clone(),
  ];
  p.wpi = 0;
}

function beginBoard(p: Pax, side: 1 | -1, afterWalk: 'seated' | 'standing'): boolean {
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
  // Le PNJ reste invisible tant qu'il n'est pas au seuil : sa place est
  // seulement réservée.
  p.state = 'hidden';
  p.action = 'none';
  p.waypoints = [];
  p.wpi = 0;
  const board: PendingBoard = { paxId: p.id, side, doorZ, dest, fuse: 9 };
  const ticket = nextTicket++;
  if (crowdSendBoarder(doorPlatformZ(doorZ), ticket)) {
    pendingBoards.push(board);
    ticketToPax.set(ticket, p.id);
  } else {
    // Quai vide (ou aucun candidat à portée) : on démarre tout de suite, mais
    // depuis l'embrasure et non du milieu du quai.
    startBoardWalk(board);
  }
  return true;
}

/** Jeton du quai → PNJ de rame qui l'attend. */
const ticketToPax = new Map<number, number>();

/** Bascule les montants dont le voyageur du quai a atteint la porte. */
function drainArrivedBoarders(dt: number): void {
  for (const ticket of takeArrivedBoarders()) {
    const paxId = ticketToPax.get(ticket);
    ticketToPax.delete(ticket);
    if (paxId === undefined) continue;
    const i = pendingBoards.findIndex((b) => b.paxId === paxId);
    if (i < 0) continue;
    const [b] = pendingBoards.splice(i, 1);
    startBoardWalk(b);
  }
  // Garde-fou : un voyageur du quai peut être effacé en route (changement de
  // gare, purge de qualité). Le montant part quand même plutôt que de garder
  // sa place réservée pour rien.
  for (let i = pendingBoards.length - 1; i >= 0; i--) {
    const b = pendingBoards[i];
    b.fuse -= dt;
    if (b.fuse > 0) continue;
    pendingBoards.splice(i, 1);
    startBoardWalk(b);
  }
}

// Dégradation perf : masque immédiatement les PNJ excédentaires par rapport
// aux cibles réduites, en commençant par les plus éloignés du joueur (c'est
// là que la disparition se remarque le moins). Les échanges suivants restent
// naturellement sous les nouvelles cibles.
export function trimPassengersForPerf(): void {
  const target = scaledTargets();
  const { seatedPax, standingPax } = countInside();
  const dist = (p: Pax) => Math.hypot(p.pos.x - runtime.playerCarX, p.pos.z - runtime.playerCarZ);
  const farthestFirst = (arr: Pax[]) => [...arr].sort((a, b) => dist(b) - dist(a));
  const hide = (p: Pax) => {
    releaseSlots(p);
    endPair(p);
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

  for (const p of shuffle(seatedPax).slice(0, needSeatOut)) beginAlight(p, side);
  for (const p of shuffle(standingPax).slice(0, needStandOut)) beginAlight(p, side);

  // Un PNJ qui attend déjà son tour au seuil n'est pas disponible.
  const busy = new Set(pendingBoards.map((b) => b.paxId));
  const freshHidden = paxList.filter((p) => p.state === 'hidden' && !busy.has(p.id));
  const queue = shuffle(freshHidden);
  let qi = 0;
  while (qi < queue.length && needSeatIn > 0) {
    if (beginBoard(queue[qi++], side, 'seated')) needSeatIn--;
    else break;
  }
  while (qi < queue.length && needStandIn > 0) {
    if (beginBoard(queue[qi++], side, 'standing')) needStandIn--;
    else break;
  }
  // Si plus de places assises, basculer le reste en debout.
  while (qi < queue.length && needSeatIn > 0) {
    if (beginBoard(queue[qi++], side, 'standing')) needSeatIn--;
    else break;
  }
}

function whereOf(p: Pax): ActionWhere | null {
  if (p.state === 'seated') return 'seated';
  if (p.state === 'standing') return 'standing';
  return null;
}

function findPartner(p: Pax, maxDist: number): Pax | null {
  let best: Pax | null = null;
  let bestD = maxDist;
  let bestSame: Pax | null = null;
  let bestSameD = maxDist;
  for (const other of paxList) {
    if (other.id === p.id) continue;
    if (other.state !== 'seated' && other.state !== 'standing') continue;
    if (isPairAction(other.action)) continue;
    // On n'attrape pas quelqu'un au milieu d'un geste bref (éternuement, salut,
    // chute…) : l'échange trancherait son animation en deux.
    if (BUSY_BRIEF.has(other.action) || other.action === 'doze') continue;
    const d = p.pos.distanceTo(other.pos);
    if (d > maxDist) continue;
    if (d < bestD) {
      bestD = d;
      best = other;
    }
    if (other.state === p.state && d < bestSameD) {
      bestSameD = d;
      bestSame = other;
    }
  }
  // Préférer un voisin dans la même posture (deux assis / deux debout).
  return bestSame ?? best;
}

function applyAction(p: Pax, id: PaxAction, dur: number, partner: Pax | null = null): void {
  p.action = id;
  p.actionDur = dur;
  p.actionT = 0;
  if (id === 'look' || id === 'curiousGlance' || id === 'lookBoard' || id === 'fidget') {
    p.lookYawTarget = (Math.random() - 0.5) * 2;
  }
  if (isFallingAction(id)) {
    // Signe de la chute (côté), figé pour toute la durée.
    p.lookYawTarget = Math.random() < 0.5 ? 1 : -1;
    // Lâche la poignée — c'est souvent pour ça qu'on tombe.
    if (id === 'fall') p.holdStrap = false;
  }
  if (partner) {
    p.partner = partner.id;
    p.chatRole = 0;
    partner.action = id;
    partner.partner = p.id;
    partner.chatRole = 1;
    partner.actionT = 0;
    partner.actionDur = dur;
    if (id === 'look' || id === 'curiousGlance') {
      partner.lookYawTarget = (Math.random() - 0.5) * 2;
    }
  } else {
    p.partner = -1;
  }
  const dist = Math.hypot(p.pos.x - runtime.playerCarX, p.pos.z - runtime.playerCarZ);
  playPaxActionSfx(id, dist);
  if (id === 'fall' || id === 'stumble') reactToFall(p, id === 'fall');
}

/** Voisins qui regardent quand le JOUEUR trébuche dans l'allée. */
export function reactToPlayerFall(hard: boolean): void {
  const px = runtime.playerCarX;
  const pz = runtime.playerCarZ;
  const radius = hard ? 3.2 : 2.2;
  let n = 0;
  for (const other of paxList) {
    if (other.state !== 'seated' && other.state !== 'standing') continue;
    if (isPairAction(other.action) || isFallingAction(other.action)) continue;
    if (other.action === 'doze' || other.action === 'sneeze') continue;
    if (Math.hypot(other.pos.x - px, other.pos.z - pz) > radius) continue;
    endPair(other);
    other.partner = -1;
    other.action = 'look';
    other.actionT = 0;
    other.actionDur = hard ? 2.5 + Math.random() * 1.5 : 1.6 + Math.random();
    const world = Math.atan2(px - other.pos.x, pz - other.pos.z);
    let d = world - other.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    other.lookYawTarget = THREE.MathUtils.clamp(d, -1.15, 1.15);
    if (hard && Math.random() < 0.35) {
      other.action = 'gasp';
      other.actionDur = 1.2;
    }
    if (++n >= 5) break;
  }
}

/** Voisins qui regardent / étouffent un rire quand quelqu'un trébuche. */
function reactToFall(fallen: Pax, hard: boolean): void {
  const radius = hard ? 2.8 : 1.8;
  let n = 0;
  for (const other of paxList) {
    if (other.id === fallen.id) continue;
    if (other.state !== 'seated' && other.state !== 'standing') continue;
    if (isPairAction(other.action) || isFallingAction(other.action)) continue;
    if (other.action === 'doze' || other.action === 'sneeze') continue;
    if (fallen.pos.distanceTo(other.pos) > radius) continue;
    // Regard vers le malheureux. `stare` suit le JOUEUR et `laugh` exige un
    // partenaire : ni l'un ni l'autre ne sait viser un tiers. On oriente donc
    // un `look` vers le tombé — une chute franche retient le regard plus
    // longtemps, ce qui suffit à lire la gêne du wagon.
    endPair(other);
    other.action = 'look';
    other.actionT = 0;
    other.actionDur = hard ? 2.2 + Math.random() * 1.8 : 1.4 + Math.random() * 1.2;
    const world = Math.atan2(fallen.pos.x - other.pos.x, fallen.pos.z - other.pos.z);
    let d = world - other.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    other.lookYawTarget = THREE.MathUtils.clamp(d, -1.15, 1.15);
    if (++n >= 4) break;
  }
}

// Choix d'une nouvelle occupation via le catalogue (data/paxActions).
function pickAction(p: Pax): void {
  const where = whereOf(p);
  if (!where) return;

  const dxp = runtime.playerCarX - p.pos.x;
  const dzp = runtime.playerCarZ - p.pos.z;
  const playerDist = Math.hypot(dxp, dzp);
  const arch = p.appearance.archetype;
  const jolt = Math.abs(runtime.sway) + Math.abs(runtime.accel) * 1.4;

  let total = 0;
  const weights: number[] = [];
  for (let i = 0; i < PAX_ACTIONS.length; i++) {
    const def = PAX_ACTIONS[i];
    let w = 0;
    if (def.where.includes(where)) {
      w = def.weight;
      if (def.kind === 'player') {
        const lim = def.playerDist ?? 3.5;
        if (playerDist >= lim) w = 0;
      }
      if (def.needsMask && !p.appearance.mask) w = 0;
      if (def.needsGlasses && !p.appearance.glasses) w = 0;
      if (def.needsBag && p.appearance.bag === 'none') w = 0;
      if (def.archetypes && def.archetypes.includes(arch)) {
        w *= def.archetypeBoost ?? 1.4;
      }
      // Chutes : rares, amplifiées par le tangage, freinées par la poignée.
      if (def.id === 'stumble' || def.id === 'fall') {
        if (p.holdStrap) w *= def.id === 'fall' ? 0.2 : 0.45;
        else w *= 1.35;
        if (jolt > 0.35) w *= 1 + jolt * 2.5;
        if (arch === 'senior') w *= 1.25;
        if (arch === 'student') w *= 1.15;
      }
    }
    weights[i] = w;
    total += w;
  }

  if (total <= 0) {
    applyAction(p, 'none', 2 + Math.random() * 4);
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

  if (chosen.kind === 'pair') {
    const other = findPartner(p, chosen.partnerDist ?? 1.4);
    if (other) {
      applyAction(p, chosen.id, dur, other);
      return;
    }
    // Pas de voisin : repli sur un regard.
    applyAction(p, 'look', 3 + Math.random() * 3);
    return;
  }

  applyAction(p, chosen.id, dur);
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

/** Seuil de poussée : au-delà, le voyageur debout bascule. */
const PUSH_FALL = 0.9;
const PUSH_STAND_R = 0.5;
const PUSH_SEAT_R = 0.36;

let prevPlayerX = 0;
let prevPlayerZ = 0;
let prevPlayerInit = false;
let bumpCooldown = 0;

/**
 * Le joueur n'a pas de collision dure avec les PNJ, mais s'il marche dans
 * quelqu'un, on pousse le voyageur et on accumule. Abuser → chute.
 */
function resolvePlayerPush(dt: number): void {
  if (runtime.playerFrame !== 'car') {
    prevPlayerInit = false;
    return;
  }
  const px = runtime.playerCarX;
  const pz = runtime.playerCarZ;
  if (!prevPlayerInit) {
    prevPlayerX = px;
    prevPlayerZ = pz;
    prevPlayerInit = true;
    return;
  }
  const pvx = (px - prevPlayerX) / Math.max(dt, 1e-4);
  const pvz = (pz - prevPlayerZ) / Math.max(dt, 1e-4);
  prevPlayerX = px;
  prevPlayerZ = pz;
  bumpCooldown = Math.max(0, bumpCooldown - dt);
  const speed = Math.hypot(pvx, pvz);

  for (const p of paxList) {
    if (p.state !== 'standing' && p.state !== 'seated') continue;
    if (isFallingAction(p.action)) {
      p.pushAccum = 0;
      continue;
    }
    const dx = p.pos.x - px;
    const dz = p.pos.z - pz;
    const dist = Math.hypot(dx, dz);
    const radius = p.state === 'standing' ? PUSH_STAND_R : PUSH_SEAT_R;
    if (dist >= radius || dist < 1e-4) {
      p.pushAccum = Math.max(0, p.pushAccum - dt * 0.7);
      continue;
    }

    // Approche : composante de vitesse du joueur vers le PNJ.
    const nx = dx / dist;
    const nz = dz / dist;
    const approach = Math.max(0, pvx * nx + pvz * nz);
    const overlap = (radius - dist) / radius;

    if (p.state === 'standing') {
      // Écarte doucement le voyageur (reste près de son slot).
      const push = overlap * 0.55;
      p.pos.x += nx * push;
      p.pos.z += nz * push;
      if (p.standSlot >= 0) {
        const s = STAND_SLOTS[p.standSlot];
        p.pos.x = THREE.MathUtils.clamp(p.pos.x, s.x - 0.35, s.x + 0.35);
        p.pos.z = THREE.MathUtils.clamp(p.pos.z, s.z - 0.45, s.z + 0.45);
        alignStrapStand(p);
      }
      // Accumulation : plus on insiste en marchant dedans, plus ça monte.
      const rate = 0.55 + approach * 0.9 + overlap * 1.4 + (speed > 1.6 ? 0.5 : 0);
      p.pushAccum += rate * dt;
      // Première bousculade : regard fâché vers le joueur.
      if (p.pushAccum > 0.15 && p.action !== 'angry' && p.action !== 'gasp' && !isPairAction(p.action)) {
        if (p.pushAccum < 0.45) {
          endPair(p);
          p.action = 'angry';
          p.actionT = 0;
          p.actionDur = 1.2;
          p.partner = -1;
        }
      }
      if (bumpCooldown <= 0 && (approach > 0.4 || overlap > 0.35)) {
        paxBump(dist, overlap > 0.55);
        bumpCooldown = 0.28;
      }
      if (p.pushAccum >= PUSH_FALL) {
        endPair(p);
        p.holdStrap = false;
        p.pushAccum = 0;
        applyAction(p, 'fall', 4.5 + Math.random() * 1.2);
        // Direction de la chute = sens de la poussée (applyAction tire au hasard).
        p.lookYawTarget = nx >= 0 ? 1 : -1;
      }
    } else {
      // Assis : on ne le fait pas tomber, mais il s'énerve si on le frôle.
      p.pushAccum += (0.3 + approach * 0.5) * dt;
      if (p.pushAccum > 0.35 && !isPairAction(p.action) && p.action !== 'angry') {
        endPair(p);
        p.action = Math.random() < 0.5 ? 'angry' : 'gasp';
        p.actionT = 0;
        p.actionDur = 1.5 + Math.random();
        p.partner = -1;
        p.pushAccum = 0;
        if (bumpCooldown <= 0) {
          paxBump(dist, false);
          bumpCooldown = 0.35;
        }
      }
      p.pushAccum = Math.max(0, p.pushAccum - dt * 0.4);
    }
  }
}

export function updatePassengers(dt: number): void {
  drainArrivedBoarders(dt);
  resolvePlayerPush(dt);
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
            // Descente terminée : le voyageur passe la main à la foule du
            // quai, qui l'emmène jusqu'à la sortie. Sans ce relais il
            // s'évanouissait sur place, en plein milieu du quai.
            if (p.state === 'alighting') crowdArriveFromTrain(doorPlatformZ(p.exitDoorZ));
            p.exitDoorZ = 0;
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
      p.headRoll += (0 - p.headRoll) * Math.min(1, dt * 6);
      p.bodyLean *= Math.max(0, 1 - dt * 8);
      p.bodyRoll *= Math.max(0, 1 - dt * 8);
      let d = p.targetYaw - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 8);
      continue;
    }

    if (p.state !== 'seated' && p.state !== 'standing') continue;

    // --- Couche de vie des PNJ posés ---
    if (!isFallingAction(p.action)) p.bob = 0;
    p.bobPhase += dt;
    p.actionT += dt;
    p.decideT -= dt;

    if (p.decideT <= 0) {
      p.decideT = 5 + Math.random() * 9;
      if (maybeRelocate(p)) continue;
    }

    if (p.actionT >= p.actionDur) {
      // Fin de chute : on reprend souvent la poignée.
      if (p.action === 'fall' && p.height >= 1.06 && Math.random() < 0.75) {
        p.holdStrap = true;
        alignStrapStand(p);
      }
      p.actionT = 0;
      if (isPairAction(p.action)) endPair(p);
      pickAction(p);
    }

    // Cibles de tête selon l'action en cours (catalogue → paxMotion).
    const partner = p.partner >= 0 ? paxList[p.partner] : null;
    if (isPairAction(p.action) && (!partner || partner.partner !== p.id)) {
      endPair(p);
      p.action = 'none';
    }
    const seatSide =
      p.state === 'seated' && p.seatSlot >= 0 ? SEAT_SLOTS[p.seatSlot].side : undefined;
    const player = trainPlayerCtx();
    const m = resolveMotion({
      action: p.action,
      actionT: p.actionT,
      bobPhase: p.bobPhase,
      chatRole: p.chatRole,
      lookYawTarget: p.lookYawTarget,
      posX: p.pos.x,
      posZ: p.pos.z,
      yaw: p.yaw,
      partnerX: partner?.pos.x,
      partnerZ: partner?.pos.z,
      playerX: player.playerX,
      playerY: player.playerY,
      playerZ: player.playerZ,
      seatSide,
    });
    const speedMul = isDramaAction(p.action) || isFallingAction(p.action) ? 1.25 : 1;
    p.headYaw += (m.yaw - p.headYaw) * Math.min(1, dt * m.speed * speedMul);
    p.headPitch += (m.pitch - p.headPitch) * Math.min(1, dt * m.speed * speedMul);
    p.headRoll += (m.headRoll - p.headRoll) * Math.min(1, dt * m.speed * speedMul);
    p.bodyLean += (m.lean - p.bodyLean) * Math.min(1, dt * m.speed * speedMul);
    p.bodyRoll += (m.roll - p.bodyRoll) * Math.min(1, dt * m.speed * speedMul);
    // Chute : le bob porte le décalage vertical (au sol).
    if (isFallingAction(p.action) || Math.abs(m.drop) > 0.001 || Math.abs(p.bob) > 0.001) {
      p.bob += (m.drop - p.bob) * Math.min(1, dt * m.speed);
    }
  }
}
