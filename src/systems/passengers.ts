// Logique des PNJ : pool réutilisé, machine à états par passager
// (hidden / seated / standing / boarding / alighting), embarquement et
// descente par waypoints, et une couche de « vie » tirée du catalogue
// data/paxActions : regards, téléphone, somnolence, échanges à deux,
// micro-gestes, décisions assis / debout.
//
// Le TEMPO de cette couche ne vit pas ici mais dans systems/paxBehavior :
// chaque voyageur tient une occupation de fond pendant des minutes, s'en
// détourne de loin en loin pour un geste bref, puis y revient. Ce module ne
// fait qu'appliquer ces décisions au wagon.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { targetPaxCounts, type PaxTargets } from '../data/occupancy';
import { paxScale } from './perf';
import { runtime } from './runtime';
import { currentSegmentOccupancy } from './occupancy';
import { makeAppearance, type Appearance } from './appearance';
import {
  crowdArriveFromTrain,
  crowdSendBoarder,
  swapCrowdIdentity,
  takeArrivedBoarders,
} from './platformCrowd';
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
  isPairAction,
  isFallingAction,
  isDramaAction,
  type PaxAction,
  type ActionWhere,
} from '../data/paxActions';
import {
  actionDuration,
  advanceBehaviorClock,
  nextInterludeDelay,
  nextSocialDelay,
  pickPaxAction,
  temperFor,
  type PickCtx,
  type Temper,
} from './paxBehavior';
import { pushPaxEvent } from './paxEvents';
import { resolveMotion, trainPlayerCtx } from './paxMotion';
import { playPaxActionSfx } from './paxSfx';
import { paxBump } from './audioEngine';

export type PaxState = 'hidden' | 'seated' | 'standing' | 'boarding' | 'alighting';
export type { PaxAction };

export interface Pax {
  id: number;
  /**
   * QUI est ce voyageur, par opposition à `id` qui ne dit que quelle place du
   * pool le porte. Apparence, caractère et modèle 3D en découlent tous.
   *
   * L'identité traverse la porte avec son propriétaire : un montant apporte la
   * sienne depuis le quai, un descendant emporte la sienne dehors (voir
   * « passage de relais » plus bas). Sans ça, franchir le seuil changeait de
   * personne à vue.
   */
  identity: number;
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
  /** Caractère stable (bavard, nerveux, dormeur…) - voir systems/paxBehavior. */
  temper: Temper;
  /** Occupation de fond en cours : ce à quoi le voyageur revient toujours. */
  anchor: PaxAction;
  /** Secondes restantes de cette occupation de fond. */
  anchorLeft: number;
  /** Compte à rebours avant le prochain geste bref qui l'interrompra. */
  interludeT: number;
  /** Délai avant de pouvoir relancer un échange avec un voisin. */
  socialT: number;
  partner: number; // id du partenaire de discussion, -1 sinon
  chatRole: 0 | 1; // déphasage des hochements de tête
  headYaw: number;
  headPitch: number;
  headRoll: number; // inclinaison (écoute / sourire)
  lookYawTarget: number; // cible de l'action « look » ; aussi signe de chute (±1)
  bodyLean: number;
  bodyRoll: number; // roulis (chutes latérales)
  /** Hauteur du pivot du corps (fraction de la taille) : 0 = les pieds. */
  bodyPivot: number;
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

/**
 * Retire proprement un voyageur pris en charge: les reservations de siege ou
 * de station debout sont liberees avant de rendre l'entree au pool.
 */
export function removeAssistedPassenger(id: number): boolean {
  const p = paxList[id];
  if (!p || (p.state !== 'seated' && p.state !== 'standing')) return false;
  endPair(p);
  releaseSlots(p);
  p.state = 'hidden';
  p.waypoints.length = 0;
  p.partner = -1;
  return true;
}

// Le bas de l'anneau des tsurikawa est à ~1,71 m (poignées remontées pour le
// confort de marche du joueur) : en dessous de cette échelle, un PNJ ne
// l'atteint qu'en s'étirant bras tendu - pas naturel - et garde les bras
// baissés.
const STRAP_MIN_SCALE = 1.06;

function rollStrap(scale: number): boolean {
  return scale >= STRAP_MIN_SCALE && Math.random() < 0.6;
}

// Grille des anneaux de tsurikawa (three/Handles.tsx) : un porteur ne se
// poste PAS à l'aplomb d'un anneau - il se décale pour en avoir un ~0,28 m
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
  const temper = temperFor(id);
  return {
    id,
    identity: id,
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
    actionDur: 4 + Math.random() * 10,
    temper,
    anchor: 'none',
    anchorLeft: 0,
    interludeT: nextInterludeDelay(temper),
    socialT: 0,
    partner: -1,
    chatRole: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    lookYawTarget: 0,
    bodyLean: 0,
    bodyRoll: 0,
    bodyPivot: 0,
    pushAccum: 0,
    decideT: 8 + Math.random() * 30,
    holdStrap: rollStrap(appearance.build.scale),
    pockets: appearance.bottom.type === 'trousers' && Math.random() < 0.4,
    exitDoorZ: -1,
  };
}

export function initPassengers(): void {
  if (paxList.length > 0) return;
  for (let i = 0; i < POOL_SIZE; i++) paxList.push(makePax(i));
}

/**
 * Ce slot du wagon devient quelqu'un d'autre. Le rendu s'en aperçoit seul (il
 * compare l'identité du slot à celle de son modèle) et rebâtit le personnage :
 * on n'appelle donc ceci que sur un PNJ hors de vue, ou à l'instant précis où
 * il paraît au seuil - jamais sur quelqu'un que le joueur regarde.
 */
function applyPaxIdentity(p: Pax, identity: number): void {
  p.identity = identity;
  p.appearance = makeAppearance(identity);
  p.temper = temperFor(identity);
  p.height = p.appearance.build.scale;
  p.holdStrap = rollStrap(p.height);
  p.pockets = p.appearance.bottom.type === 'trousers' && Math.random() < 0.4;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Outil dev : __pax donne l'état de chaque voyageur de la rame (posture,
  // occupation en cours, partenaire d'échange) - pendant de __crowd.
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
  // Nouvelle rame : celui qui était coincé dans la porte de la précédente est
  // reparti avec elle.
  doorwayHolder = -1;
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

/**
 * Lance quelques discussions silencieuses dès le peuplement, et donne à tous
 * les autres une occupation de fond déjà entamée.
 *
 * Une rame de la Yamanote n'est pas une salle des fêtes : ceux qui parlent
 * sont venus ensemble. On ne jumelle donc qu'une petite part des voyageurs,
 * et seulement les bavards - le reste ouvre son téléphone.
 */
function seedChats(): void {
  const candidates = paxList.filter((p) => p.state === 'seated' || p.state === 'standing');
  // Mélange léger pour ne pas toujours jumeler les mêmes ids.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const used = new Set<number>();
  let pairs = 0;
  const want = Math.max(1, Math.round(candidates.length * 0.11));
  for (const p of candidates) {
    if (pairs >= want) break;
    if (used.has(p.id)) continue;
    if (p.temper.social < 0.35) continue;
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
    const kind: PaxAction = roll < 0.5 ? 'chat' : roll < 0.75 ? 'gossip' : roll < 0.9 ? 'whisper' : 'coupleLean';
    // Une conversation entamée avant qu'on monte : elle dure encore un moment.
    const dur = 25 + Math.random() * 70;
    p.anchor = kind;
    p.anchorLeft = dur;
    best.anchor = kind;
    best.anchorLeft = dur;
    applyAction(p, kind, dur, best);
    pairs++;
  }
  // Les autres ne partent pas d'un « rien » de deux secondes : ils sont déjà
  // au milieu de quelque chose, à un instant quelconque de leur occupation.
  for (const p of candidates) {
    if (used.has(p.id)) continue;
    startAnchor(p);
    p.actionT = Math.random() * p.actionDur * 0.8;
    // Décaler les compteurs d'interruption : sans ça, tout le wagon a été
    // peuplé à la même seconde, et personne ne bouge de la première minute
    // avant que tout le monde ne bouge en même temps.
    p.interludeT *= Math.random();
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

/**
 * Libère un éventuel partenaire d'échange (chat, chuchotis, rire…).
 *
 * Les deux repartent sur une occupation solo et gardent un délai avant de
 * pouvoir relancer une conversation : sans ce répit, deux voisins bavards
 * enchaînaient les échanges sans jamais se taire.
 */
function endPair(p: Pax): void {
  if (p.partner >= 0) {
    const other = paxList[p.partner];
    if (other && other.partner === p.id) {
      other.partner = -1;
      other.anchor = 'none';
      other.anchorLeft = 0;
      other.socialT = nextSocialDelay(other.temper);
      other.action = 'none';
      other.actionT = 0;
      other.actionDur = 2 + Math.random() * 3;
    }
    p.socialT = nextSocialDelay(p.temper);
  }
  p.partner = -1;
}

/**
 * Coupe l'occupation de fond. Sans ça, un voyageur qui se lève pour descendre
 * garderait en mémoire la sieste qu'il faisait assis et la « reprendrait »
 * debout à l'autre bout du wagon.
 */
function clearAnchor(p: Pax): void {
  p.action = 'none';
  p.anchor = 'none';
  p.anchorLeft = 0;
  p.interludeT = nextInterludeDelay(p.temper);
}

function startWalk(p: Pax, dest: THREE.Vector3, afterWalk: 'seated' | 'standing' | 'hidden'): void {
  endPair(p);
  clearAnchor(p);
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
 *
 * Le relais ne porte pas que la position : les deux pools ÉCHANGENT leurs
 * identités (systems/platformCrowd.swapCrowdIdentity). Le slot qui prend la
 * suite adopte l'apparence, le caractère et le modèle de celui qui s'efface -
 * sans quoi le voyageur devenait quelqu'un d'autre en franchissant la porte,
 * sous les yeux de qui attend sur le quai.
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
  clearAnchor(p);
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

/**
 * Démarre la marche intérieure d'un montant, depuis l'embrasure de la porte.
 *
 * `crowdId` est le slot de quai qui vient d'atteindre le seuil : le montant
 * prend son identité (et lui laisse la sienne) juste avant de devenir visible,
 * pour que ce soit bien la même personne qui entre. -1 quand personne ne l'a
 * précédé - quai vide, ou voyageur effacé en route.
 */
function startBoardWalk(b: PendingBoard, crowdId = -1): void {
  const p = paxList[b.paxId];
  // La place réservée a pu être libérée entre-temps (dégradation perf, reset).
  if (p.seatSlot < 0 && p.standSlot < 0) return;
  if (crowdId >= 0) {
    const swapped = swapCrowdIdentity(crowdId, p.identity);
    if (swapped >= 0) applyPaxIdentity(p, swapped);
  }
  p.state = 'boarding';
  clearAnchor(p);
  p.pos.set(b.side * DOOR_HANDOVER_X, 0, b.doorZ);
  // Déjà tourné vers l'intérieur : il vient de traverser le seuil dans cet axe,
  // et le cap resté de sa dernière apparition le ferait pivoter sur place.
  p.yaw = -b.side * Math.PI * 0.5;
  p.targetYaw = p.yaw;
  p.bob = 0;
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
  clearAnchor(p);
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
  for (const arrived of takeArrivedBoarders()) {
    const paxId = ticketToPax.get(arrived.ticket);
    ticketToPax.delete(arrived.ticket);
    if (paxId === undefined) continue;
    const i = pendingBoards.findIndex((b) => b.paxId === paxId);
    if (i < 0) continue;
    const [b] = pendingBoards.splice(i, 1);
    startBoardWalk(b, arrived.crowdId);
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
    clearAnchor(p);
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

  // Fisher-Yates, et pas `sort(() => Math.random() - 0.5)` : un comparateur
  // aléatoire n'est pas un ordre, et le tri qui s'appuie dessus ne rend pas une
  // permutation uniforme - les premiers éléments restent statistiquement
  // devant. C'est ce tirage qui décide QUI descend à chaque arrêt : biaisé, ce
  // sont toujours à peu près les mêmes places qui se vident.
  const shuffle = <T,>(arr: readonly T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

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

// --- Le voyageur pris dans la porte --------------------------------------
//
// Quand une porte se ferme sur quelqu'un (systems/doorObstruction), il faut
// bien que ce quelqu'un soit là. On prend un voyageur du pool qui n'est pas
// encore entré en scène, on le plante dans l'embrasure, et on l'y laisse : il
// ne marche plus, il ne s'assoit pas, il attend qu'on le dégage. C'est la
// seule position du wagon qui ne soit ni une place assise, ni un slot debout,
// ni un point de passage - d'où son traitement à part dans updatePassengers.

/** Voyageur immobilisé dans l'embrasure, -1 si personne. */
let doorwayHolder = -1;

/** Abscisse du seuil : un pied dans le wagon, l'autre encore dehors. */
const DOORWAY_U = 1.24;

/**
 * Plante un voyageur dans l'embrasure de la porte `doorZ`, côté quai.
 * @returns false si le pool n'a personne de libre - l'obstruction se rabattra
 *          alors sur un objet, qui n'a besoin de personne.
 */
export function holdPaxInDoorway(doorZ: number, side: 1 | -1): boolean {
  if (doorwayHolder >= 0) return true;
  const busy = new Set(pendingBoards.map((b) => b.paxId));
  const p = paxList.find((q) => q.state === 'hidden' && !busy.has(q.id));
  if (!p) return false;
  releaseSlots(p);
  endPair(p);
  clearAnchor(p);
  p.state = 'boarding';
  p.afterWalk = 'hidden';
  p.waypoints = [];
  p.wpi = 0;
  p.exitDoorZ = 0;
  p.pos.set(side * DOORWAY_U, 0, doorZ);
  // De trois quarts, tourné vers l'intérieur : il vient de monter et se
  // retourne vers la porte qui vient de le toucher.
  p.yaw = -side * Math.PI * 0.42;
  p.targetYaw = p.yaw;
  p.bob = 0;
  p.bobPhase = Math.random() * Math.PI * 2;
  doorwayHolder = p.id;
  return true;
}

/** Le passage est dégagé : il finit de monter, ou s'efface faute de place. */
export function releasePaxFromDoorway(): void {
  if (doorwayHolder < 0) return;
  const p = paxList[doorwayHolder];
  doorwayHolder = -1;
  if (!p) return;
  const stand = findFreeStand();
  if (stand < 0) {
    p.state = 'hidden';
    p.waypoints = [];
    p.wpi = 0;
    return;
  }
  p.standSlot = stand;
  standOccupant[stand] = p.id;
  p.afterWalk = 'standing';
  const s = STAND_SLOTS[stand];
  p.state = 'boarding';
  p.waypoints = [
    new THREE.Vector3(Math.sign(p.pos.x) * 0.95, 0, p.pos.z),
    new THREE.Vector3(Math.sign(s.x) * 0.3 || 0.3, 0, s.z),
    new THREE.Vector3(s.x, 0, s.z),
  ];
  p.wpi = 0;
}

/** Y a-t-il quelqu'un dans l'embrasure ? */
export function paxHeldInDoorway(): boolean {
  return doorwayHolder >= 0;
}

/**
 * Le voyageur coincé, image par image : il ne marche pas, mais il n'est pas
 * une statue non plus - il se ramasse sur lui-même, regarde la porte, puis le
 * fond du wagon. Sans ça, la scène la plus tendue de l'arrêt serait jouée par
 * un mannequin.
 */
function updateDoorwayHold(p: Pax, dt: number): void {
  p.bobPhase += dt * 1.6;
  p.bob = Math.abs(Math.sin(p.bobPhase * 0.6)) * 0.012;
  const side = Math.sign(p.pos.x) || 1;
  // Coup d'œil alterné vers la porte (dehors) puis vers l'intérieur.
  const target = Math.sin(p.bobPhase * 0.5) > 0 ? -side * 0.55 : side * 0.35;
  p.headYaw += (target - p.headYaw) * Math.min(1, dt * 2.5);
  p.headPitch += (-0.06 - p.headPitch) * Math.min(1, dt * 2);
  p.headRoll += (0 - p.headRoll) * Math.min(1, dt * 2);
  p.bodyLean += (0.05 - p.bodyLean) * Math.min(1, dt * 2);
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
    // Lâche la poignée - c'est souvent pour ça qu'on tombe.
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
    // un `look` vers le tombé - une chute franche retient le regard plus
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
    // Le premier témoin peut commenter la scène s'il est près du joueur.
    if (n === 0) pushPaxEvent('car', other.id, 'fallNearby');
    if (++n >= 4) break;
  }
}

/**
 * Freinage d'urgence : tout le wagon sursaute d'un coup.
 *
 * C'est le seul événement qui s'adresse à TOUT LE MONDE en même temps - un
 * coup de frein ne choisit pas ses témoins. Les debout qui ne tiennent rien
 * partent en avant, les autres se raccrochent et cherchent des yeux ce qui
 * arrive, les assis lèvent le nez de leur écran. Quelques-uns diront ensuite
 * leur peur (systems/conversation, déclencheur `emergency`).
 *
 * Les occupations de fond ne sont PAS effacées : passée la frayeur, chacun
 * revient à son téléphone ou à sa vitre, comme après n'importe quel geste
 * bref - c'est exactement ce que fait une rame qui vient de s'arrêter.
 */
export function startlePassengers(): void {
  // Le sursaut passe par un chemin à part plutôt que par applyAction : celle-ci
  // ferait réagir les voisins de chaque trébuchement (reactToFall), soit
  // quarante témoins pour quarante frayeurs simultanées. Ici, le wagon entier
  // est déjà le témoin.
  let stumbles = 0;
  let sfxLeft = 5;
  for (const p of paxList) {
    if (p.state !== 'seated' && p.state !== 'standing') continue;
    // On ne coupe pas quelqu'un en train de s'adresser au joueur.
    if (p.action === 'talkPlayer') continue;
    endPair(p);
    p.actionT = 0;

    // Une poignée lâchée, un pas en avant : le geste le plus lisible, mais
    // rationné - un wagon qui s'effondre en entier ferait comique.
    const trips = p.state === 'standing' && !p.holdStrap && stumbles < 3 && Math.random() < 0.5;
    if (trips) {
      stumbles++;
      p.action = 'stumble';
      p.actionDur = 1.6 + Math.random() * 0.8;
      p.lookYawTarget = Math.random() < 0.5 ? 1 : -1;
    } else if (Math.random() < 0.35) {
      p.action = 'gasp';
      p.actionDur = 0.9 + Math.random() * 0.5;
    } else {
      // Chercher des yeux d'où ça vient : la vitre, le voisin, le plafond.
      p.action = 'look';
      p.actionDur = 1.8 + Math.random() * 2.2;
      p.lookYawTarget = (Math.random() - 0.5) * 2;
    }

    // Le Foley ne sert que de près, et seulement quelques fois : cinquante
    // hoquets simultanés ne font pas peur, ils font foule de dessin animé.
    const dist = Math.hypot(p.pos.x - runtime.playerCarX, p.pos.z - runtime.playerCarZ);
    if (sfxLeft > 0 && dist < 5) {
      sfxLeft--;
      playPaxActionSfx(p.action, dist);
    }
  }
}

function pickCtx(p: Pax, where: ActionWhere): PickCtx {
  const playerHere = runtime.playerFrame === 'car';
  return {
    where,
    appearance: p.appearance,
    temper: p.temper,
    scope: 'car',
    playerDist: playerHere
      ? Math.hypot(runtime.playerCarX - p.pos.x, runtime.playerCarZ - p.pos.z)
      : Infinity,
    playerHere,
    jolt: Math.abs(runtime.sway) + Math.abs(runtime.accel) * 1.4,
    holdStrap: p.holdStrap,
  };
}

/**
 * Nouvelle occupation de fond : ce que ce voyageur va faire des prochaines
 * minutes. Les échanges à deux passent par là aussi - une conversation est
 * une occupation, pas un geste.
 */
function startAnchor(p: Pax): void {
  const where = whereOf(p);
  if (!where) return;
  const ctx = pickCtx(p, where);
  const def = pickPaxAction(ctx, true);
  if (!def) {
    p.anchor = 'none';
    p.anchorLeft = 0;
    applyAction(p, 'none', 6 + Math.random() * 10);
    return;
  }
  const dur = actionDuration(def, p.temper);

  if (def.kind === 'pair') {
    // Ni juste après une conversation, ni avec quelqu'un qui vient d'en finir une.
    const other = p.socialT > 0 ? null : findPartner(p, def.partnerDist ?? 1.4);
    if (other) {
      p.anchor = def.id;
      p.anchorLeft = dur;
      other.anchor = def.id;
      other.anchorLeft = dur;
      other.interludeT = dur + 1;
      applyAction(p, def.id, dur, other);
      p.interludeT = dur + 1; // pas de bâillement au milieu d'un échange
      return;
    }
    // Personne à qui parler : on retombe sur une occupation solitaire.
    p.anchor = 'none';
    p.anchorLeft = 12 + Math.random() * 20;
    applyAction(p, 'none', p.anchorLeft);
    p.interludeT = nextInterludeDelay(p.temper);
    return;
  }

  p.anchor = def.id;
  p.anchorLeft = dur;
  p.interludeT = nextInterludeDelay(p.temper);
  applyAction(p, def.id, dur);
}

/**
 * Geste bref qui vient interrompre l'occupation de fond : on lève les yeux,
 * on bâille, on remonte son sac. L'occupation reprend juste après.
 */
function startInterlude(p: Pax): void {
  const where = whereOf(p);
  if (!where) return;
  const def = pickPaxAction(pickCtx(p, where), false);
  if (!def) {
    p.interludeT = nextInterludeDelay(p.temper);
    return;
  }
  const dur = actionDuration(def, p.temper);

  if (def.kind === 'pair') {
    const other = p.socialT > 0 ? null : findPartner(p, def.partnerDist ?? 1.4);
    if (!other) {
      p.interludeT = nextInterludeDelay(p.temper);
      return;
    }
    // Un geste à deux met l'occupation de fond des DEUX en pause.
    other.interludeT = dur + 1;
    applyAction(p, def.id, dur, other);
    return;
  }

  applyAction(p, def.id, dur);
}

/**
 * Fait parler ce voyageur AU joueur (systems/conversation). Il lâche ce qu'il
 * faisait, se tourne vers lui, et lui adresse la parole ; à la fin, il
 * reprendra une occupation ordinaire comme après n'importe quel geste.
 */
export function paxStartTalking(id: number, dur: number): boolean {
  const p = paxList[id];
  if (!p) return false;
  if (p.state !== 'seated' && p.state !== 'standing') return false;
  endPair(p);
  clearAnchor(p);
  p.action = 'talkPlayer';
  p.actionT = 0;
  p.actionDur = dur;
  return true;
}

/** Réplique suivante du même échange : on prolonge sans rien réinitialiser. */
export function paxKeepTalking(id: number, dur: number): boolean {
  const p = paxList[id];
  if (!p || p.action !== 'talkPlayer') return false;
  p.actionT = 0;
  p.actionDur = dur;
  return true;
}

/** Fin de l'échange : le voyageur retourne à sa vie. */
export function paxStopTalking(id: number): void {
  const p = paxList[id];
  if (!p || p.action !== 'talkPlayer') return;
  // La boucle verra l'occupation expirée et lui en choisira une autre.
  p.actionT = p.actionDur;
}

/** Reprend l'occupation de fond après un geste bref, ou en choisit une autre. */
function resumeAnchor(p: Pax): void {
  if (p.anchorLeft > 1.5 && !isPairAction(p.anchor)) {
    applyAction(p, p.anchor, p.anchorLeft);
    p.interludeT = nextInterludeDelay(p.temper);
    return;
  }
  startAnchor(p);
}

// Décisions occasionnelles : un debout va s'asseoir, un assis se dégourdit.
// Renvoie true si le PNJ est parti marcher.
//
// Guetter une place libre est courant ; se lever d'une banquette pour aller
// finir le trajet debout ne l'est pas - d'où le rapport d'un à quinze.
function maybeRelocate(p: Pax): boolean {
  if (p.state === 'standing' && Math.random() < 0.18) {
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
  if (p.state === 'seated' && Math.random() < 0.012) {
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
        // Se faire marcher dessus mérite un mot (systems/conversation en
        // choisit un, et n'en dira pas un à chaque contact).
        pushPaxEvent('car', p.id, 'bump');
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
          pushPaxEvent('car', p.id, 'bump');
        }
      }
      p.pushAccum = Math.max(0, p.pushAccum - dt * 0.4);
    }
  }
}

export function updatePassengers(dt: number): void {
  // Horloge partagée du comportement : elle sert de base au budget des
  // événements rares, côté rame comme côté quai.
  advanceBehaviorClock(dt);
  drainArrivedBoarders(dt);
  resolvePlayerPush(dt);
  for (const p of paxList) {
    if (p.state === 'boarding' || p.state === 'alighting') {
      // Pris dans la porte : il reste où il est jusqu'à ce qu'on le dégage.
      if (p.id === doorwayHolder) {
        updateDoorwayHold(p, dt);
        continue;
      }
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
            // quai, qui l'emmène jusqu'à la sortie - avec son visage, son
            // caractère et son modèle. Sans ce relais il s'évanouissait sur
            // place, en plein milieu du quai.
            if (p.state === 'alighting') {
              const swapped = crowdArriveFromTrain(doorPlatformZ(p.exitDoorZ), p.identity);
              // Ce slot du wagon retourne au pool sous l'identité laissée par
              // le quai : deux exemplaires d'une même personne ne peuvent donc
              // jamais coexister de part et d'autre de la porte.
              if (swapped >= 0) applyPaxIdentity(p, swapped);
            }
            p.exitDoorZ = 0;
            p.state = 'hidden';
          }
          // Arrivé à sa place : il se choisit une occupation dans la seconde.
          clearAnchor(p);
          p.actionT = 0;
          p.actionDur = 0.6 + Math.random() * 1.4;
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
      p.bodyPivot *= Math.max(0, 1 - dt * 8);
      let d = p.targetYaw - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 8);
      continue;
    }

    if (p.state !== 'seated' && p.state !== 'standing') continue;

    // Debout : le voyageur pivote vers le cap de sa place (le long de l'allée)
    // au lieu de garder celui de son dernier pas. Il arrive à son slot par un
    // pas LATÉRAL (l'allée en x = ±0,3 → la place en x = ±0,45) : sans ce
    // rattrapage il restait planté face à la banquette, et surtout son cap
    // rendu ne correspondait plus à celui qui a choisi son anneau
    // (alignStrapStand) - d'où le bras tendu vers la poignée de DERRIÈRE.
    if (p.state === 'standing' && !isFallingAction(p.action)) {
      let d = p.targetYaw - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 6);
    }

    // --- Couche de vie des PNJ posés ---
    if (!isFallingAction(p.action)) p.bob = 0;
    p.bobPhase += dt;
    p.actionT += dt;
    p.decideT -= dt;
    if (p.socialT > 0) p.socialT -= dt;
    // Sur son occupation de fond : le compte à rebours de l'interruption
    // tourne, et le temps passé décompte la durée de l'occupation.
    const onAnchor = p.action === p.anchor;
    if (onAnchor) {
      p.anchorLeft -= dt;
      p.interludeT -= dt;
    }

    if (p.decideT <= 0) {
      p.decideT = 20 + Math.random() * 40;
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
      if (onAnchor) startAnchor(p);
      else resumeAnchor(p);
    } else if (onAnchor && p.interludeT <= 0 && p.anchorLeft > 3 && !isPairAction(p.action)) {
      startInterlude(p);
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
    // Assis : la discussion ne doit bouger que la tête - lean/roll du groupe
    // faisait glisser les pieds / décaler latéralement sur le coussin.
    if (p.state === 'seated') {
      m.roll = 0;
      if (isPairAction(p.action)) {
        m.lean = 0;
        p.bodyLean = 0;
        p.bodyRoll = 0;
      }
      if (p.seatSlot >= 0) {
        const s = SEAT_SLOTS[p.seatSlot];
        p.pos.x = s.x;
        p.pos.z = s.z;
        p.yaw = p.targetYaw;
      }
    }
    p.headYaw += (m.yaw - p.headYaw) * Math.min(1, dt * m.speed * speedMul);
    p.headPitch += (m.pitch - p.headPitch) * Math.min(1, dt * m.speed * speedMul);
    p.headRoll += (m.headRoll - p.headRoll) * Math.min(1, dt * m.speed * speedMul);
    p.bodyLean += (m.lean - p.bodyLean) * Math.min(1, dt * m.speed * speedMul);
    p.bodyRoll += (m.roll - p.bodyRoll) * Math.min(1, dt * m.speed * speedMul);
    p.bodyPivot += (m.pivot - p.bodyPivot) * Math.min(1, dt * m.speed * speedMul);
    // Chute : le bob porte le décalage vertical (au sol).
    if (isFallingAction(p.action) || Math.abs(m.drop) > 0.001 || Math.abs(p.bob) > 0.001) {
      p.bob += (m.drop - p.bob) * Math.min(1, dt * m.speed);
    }
  }
}

// Re-tirage de la population du wagon depuis la console ou un navigateur piloté :
// même arrêt, autres visages et autres places. Développement seulement - sert à
// choisir une composition dégagée pour une capture (l'allée n'est pas toujours
// libre là où l'on pose la caméra).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__reseedPax = () => seedPassengers();
}
