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
import { SKELETON_TOP, makeAppearance, type Appearance } from './appearance';
import { paxScale } from './perf';
import { runtime } from './runtime';
import { useStore } from '../store';
import { psdGates } from '../three/station/psdLayout';
import { placementFor, stairTopZ, stairwellAt, type StationPlacement } from './stationPlacement';
import { layoutFor } from '../data/stationLayouts';
import { PSD_X, STAIR_FULL_LEN, STAIR_FULL_STEPS } from '../data/stationGeometry';
import {
  BUSY_BRIEF,
  isPairAction,
  isFallingAction,
  type PaxAction,
} from '../data/paxActions';
import { pushPaxEvent } from './paxEvents';
import {
  actionDuration,
  nextInterludeDelay,
  nextSocialDelay,
  pickPaxAction,
  temperFor,
  type PickCtx,
  type Temper,
} from './paxBehavior';
import { resolveMotion, platformPlayerCtx } from './paxMotion';
import { PLATFORM_TOP, platformToWorld } from './playerFrame';
import { playPaxActionSfx, paxBump } from './paxSfx';

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
  | 'boarding'
  /**
   * L'agent de quai rejoint une porte, s'y poste et n'en bouge plus : il a
   * quelqu'un à faire reculer (systems/doorObstruction).
   */
  | 'attending';

export interface CrowdPax {
  id: number;
  /**
   * QUI est ce voyageur, par opposition à `id` qui dit seulement quelle place
   * du pool le porte. Apparence, caractère et modèle 3D en découlent tous.
   *
   * Une identité voyage d'un pool à l'autre : celui qui franchit la porte
   * emporte la sienne dans la rame et rend celle du PNJ de rame qui prend sa
   * place ici (voir swapCrowdIdentity et systems/passengers).
   */
  identity: number;
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
  /** Caractère stable (systems/paxBehavior) : bavard, nerveux, dormeur… */
  temper: Temper;
  /** Occupation de fond : ce à quoi ce voyageur revient entre deux gestes. */
  anchor: PaxAction;
  anchorLeft: number;
  interludeT: number;
  /** Délai avant de pouvoir relancer un échange. */
  socialT: number;
  lookYaw: number;
  headPitch: number;
  headRoll: number;
  bodyLean: number;
  bodyRoll: number;
  /** Hauteur du pivot du corps (fraction de la taille) : 0 = les pieds. */
  bodyPivot: number;
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
  /** Poussée cumulée par le joueur (chute / glissade si on abuse). */
  pushAccum: number;
  /**
   * Ce n'est pas un voyageur mais l'AGENT de quai : uniforme, casquette, et
   * un slot réservé pour lui seul. Le rendu « librairie » choisit son modèle
   * une fois pour toutes à partir de l'apparence (voir LibraryPlatformCrowd) —
   * on ne peut donc pas déguiser un civil en agent en cours de route, il faut
   * qu'une place du pool soit la sienne depuis le début.
   */
  staff: boolean;
}

/** Capacité max du pool — assez large pour que Shinjuku/Shibuya débordent
 *  vraiment de voyageurs en attente, sans plafonner tous les hubs au même
 *  effectif (Shinjuku à 2,2× peut monter au-dessus de Tokyo à 2,0×). */
export const CROWD_POOL = 40;
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

/** Identités de départ du quai : une plage à part de celles de la rame. */
const CROWD_IDENTITY_0 = 9000;

function makeCrowd(id: number): CrowdPax {
  const identity = CROWD_IDENTITY_0 + id;
  const appearance = makeAppearance(identity);
  const temper = temperFor(identity);
  return {
    id,
    identity,
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
    actionDur: 4 + Math.random() * 10,
    temper,
    anchor: 'none',
    anchorLeft: 0,
    interludeT: nextInterludeDelay(temper),
    socialT: 0,
    lookYaw: 0,
    headPitch: 0,
    headRoll: 0,
    bodyLean: 0,
    bodyRoll: 0,
    bodyPivot: 0,
    waypoints: [],
    wpi: 0,
    walkDir: Math.random() < 0.5 ? 1 : -1,
    laneX: 3.2,
    ticket: -1,
    delay: 0,
    partner: -1,
    chatRole: 0,
    pushAccum: 0,
    staff: false,
  };
}

/**
 * L'agent de quai : costume bleu nuit, casquette, pas de sac.
 *
 * On ne fabrique pas son apparence de toutes pièces — on cherche dans le
 * générateur la première silhouette de salaryman qui puisse porter
 * l'uniforme, puis on l'habille. Le rendu « librairie » choisit son modèle
 * d'après `archetype` et `feminine` : en partant d'un descripteur cohérent, il
 * hérite du costume du pack au lieu d'une carrure qui ne va pas avec.
 */
function staffAppearance(): Appearance {
  for (let seed = 7000; seed < 7400; seed++) {
    const a = makeAppearance(seed);
    if (a.archetype !== 'salaryman' || a.feminine || a.senior) continue;
    return {
      ...a,
      top: { type: 'suit', color: '#1b2740' },
      bottom: { type: 'trousers', color: '#171c28' },
      shoes: '#14161a',
      hat: 'cap',
      bag: 'none',
      scarf: false,
      mask: false,
      glasses: false,
      facialHair: false,
    };
  }
  return makeAppearance(7000);
}

export function initPlatformCrowd(): void {
  if (crowdList.length > 0) return;
  for (let i = 0; i < CROWD_POOL; i++) crowdList.push(makeCrowd(i));
  // La dernière place du pool est réservée à l'agent, une fois pour toutes.
  const agent = crowdList[CROWD_POOL - 1];
  agent.staff = true;
  agent.appearance = staffAppearance();
  agent.height = agent.appearance.build.scale;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Outil dev : __crowd donne l'état de chaque voyageur du quai (arrivées par
  // l'escalier, montées en rame, départs vers la sortie).
  (window as unknown as Record<string, unknown>).__crowd = crowdList;
}

/**
 * Ce slot du quai devient quelqu'un d'autre. Le rendu s'en aperçoit tout seul
 * (il compare l'identité du slot à celle de son modèle) et rebâtit le
 * personnage : on n'appelle donc ceci que sur un slot invisible.
 */
function applyCrowdIdentity(p: CrowdPax, identity: number): void {
  p.identity = identity;
  p.appearance = makeAppearance(identity);
  p.temper = temperFor(identity);
  p.height = p.appearance.build.scale;
}

/**
 * Échange d'identité au seuil d'une porte : le slot de quai `crowdId` prend
 * `identity` et rend la sienne. C'est le pivot du relais avec la rame — celui
 * qui monte emporte son visage à l'intérieur, celui qui descend emporte le
 * sien sur le quai, et aucun des deux ne se transforme en chemin.
 *
 * @returns l'identité que ce slot portait, ou -1 s'il n'est pas échangeable.
 */
export function swapCrowdIdentity(crowdId: number, identity: number): number {
  const p = crowdList[crowdId];
  // L'agent de quai n'est pas un voyageur : son uniforme ne se troque pas.
  if (!p || p.staff) return -1;
  const previous = p.identity;
  applyCrowdIdentity(p, identity);
  return previous;
}

function crowdCountBase(stationIndex: number): { total: number; walkers: number } {
  // Les hubs partent avec plus d'attenteurs près des portes : c'est ce qui
  // donne l'impression de quai bondé (Shinjuku, Shibuya…), les promeneurs
  // restant une minorité qui anime le fond.
  const base = isMajorHub(stationIndex)
    ? { total: 18, walkers: 5 }
    : stationIndex % 3 === 0
      ? { total: 12, walkers: 5 }
      : { total: 9, walkers: 4 };
  return base;
}

/**
 * Densité réelle : le gabarit de la gare pèse autant que son statut de hub —
 * Uguisudani reste vide quand Shinjuku déborde — et la qualité vidéo réduit
 * l'ensemble comme pour les PNJ de la rame.
 *
 * Quand le total est plafonné par CROWD_POOL, on conserve le ratio
 * waiters/walkers du gabarit : sinon les hubs « débordaient » surtout de
 * promeneurs et peinaient à peupler les files d'attente aux portes.
 */
function crowdCount(stationIndex: number): { total: number; walkers: number } {
  const base = crowdCountBase(stationIndex);
  const s = paxScale() * layoutFor(stationIndex).crowdScale;
  const total = Math.min(CROWD_POOL, Math.round(base.total * s));
  const walkers = Math.min(total, Math.round(total * (base.walkers / base.total)));
  return { total, walkers };
}

function clampPos(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.clamp(x, bounds().x0, bounds().x1),
    0,
    THREE.MathUtils.clamp(z, bounds().z0, bounds().z1),
  );
}

// Emplacements d'attente près des portes. Quatre files quand la file est
// dense, pour que les hubs ne s'empilent pas sur trois lignes seulement.
function waitSlot(i: number, n: number, bias: number): THREE.Vector3 {
  const doors = CONFIG.doorCenters;
  const doorZ = doors[i % doors.length];
  const lanes = n > 14 ? 4 : 3;
  const lane = i % lanes;
  const x = 2.45 + lane * 0.65 + ((i * 17) % 7) * 0.03;
  const z = doorZ + ((i * 13) % 11 - 5) * 0.45 + bias;
  const spread = (i / Math.max(1, n - 1) - 0.5) * 12;
  return clampPos(x, z + spread * 0.25);
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

  // L'agent garde sa place : la foule se peuple autour de lui.
  const civils = crowdList.filter((p) => !p.staff);
  for (let i = 0; i < civils.length; i++) {
    const p = civils[i];
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
  seedCrowdChats();
}

/**
 * Discussions silencieuses entre voyageurs en attente proches. Comme en rame,
 * seule une petite part du quai parle : les autres regardent la voie ou leur
 * téléphone, ce qui est l'essentiel de ce qu'on voit sur un quai japonais.
 */
function seedCrowdChats(): void {
  const waiters = crowdList.filter((p) => p.state === 'waiting');
  const used = new Set<number>();
  let pairs = 0;
  const want = Math.max(1, Math.round(waiters.length * 0.14));
  for (const p of waiters) {
    if (pairs >= want || used.has(p.id)) continue;
    if (p.temper.social < 0.35) continue;
    let best: CrowdPax | null = null;
    let bestD = 1.6;
    for (const other of waiters) {
      if (other.id === p.id || used.has(other.id)) continue;
      const d = p.pos.distanceTo(other.pos);
      if (d > bestD) continue;
      bestD = d;
      best = other;
    }
    if (!best) continue;
    used.add(p.id);
    used.add(best.id);
    const kind: PaxAction = Math.random() < 0.55 ? 'sideChat' : Math.random() < 0.5 ? 'gossip' : 'whisper';
    const dur = 20 + Math.random() * 60;
    p.action = kind;
    p.partner = best.id;
    p.chatRole = 0;
    p.actionT = 0;
    p.actionDur = dur;
    p.anchor = kind;
    p.anchorLeft = dur;
    p.interludeT = dur + 1;
    best.action = kind;
    best.partner = p.id;
    best.chatRole = 1;
    best.actionT = 0;
    best.actionDur = dur;
    best.anchor = kind;
    best.anchorLeft = dur;
    best.interludeT = dur + 1;
    pairs++;
  }
  // Les autres attendent déjà à quelque chose, pas depuis deux secondes.
  for (const p of waiters) {
    if (used.has(p.id)) continue;
    startCrowdAnchor(p);
    p.actionT = Math.random() * p.actionDur * 0.8;
    // Compteurs décalés : le quai entier a été peuplé d'un coup, ses gestes
    // ne doivent pas l'être.
    p.interludeT *= Math.random();
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
  return stairwellAt(p, x, z, STAIR_FULL_LEN, STAIR_FULL_STEPS)?.y ?? 0;
}

function freeSlot(): CrowdPax | null {
  for (const p of crowdList) if (p.state === 'hidden' && !p.staff) return p;
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
 *
 * `identity` est celle du PNJ qui descend : le slot de quai la reprend telle
 * quelle, si bien que la personne qu'on voyait derrière la vitre est
 * exactement celle qui pose le pied sur le quai.
 *
 * @returns l'identité rendue en échange (à donner au PNJ de rame, qui repart
 *          au pool), ou -1 si le quai n'avait plus de place libre.
 */
export function crowdArriveFromTrain(doorLocalZ: number, identity: number): number {
  initPlatformCrowd();
  const p = freeSlot();
  if (!p) return -1;
  const swapped = swapCrowdIdentity(p.id, identity);
  const pl = placement();
  // Même point EXACT que le relais côté rame (systems/passengers) : le
  // voyageur continue précisément là où il s'arrête. Pas de dispersion en z —
  // c'est la même personne des deux côtés du seuil depuis que l'identité
  // traverse avec elle, et un demi-mètre d'écart se lirait comme un saut.
  p.pos.set(2.0, 0, doorLocalZ);
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
  return swapped;
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

// --- L'agent de quai -----------------------------------------------------
//
// Une porte qui ne se ferme pas ne se règle pas au micro depuis un bureau :
// quelqu'un vient. L'agent accourt depuis la trémie la plus proche, se poste
// À CÔTÉ de la porte — jamais devant, il ne bouche pas le passage qu'il essaie
// de dégager —, se tourne vers elle, et attend que ça se débloque.

/** Distance latérale du poste au plan des portes palières (m). */
const AGENT_POST_X = PSD_X + 0.85;
/** Décalage le long du quai : il se tient au bord de la baie, pas en face. */
const AGENT_POST_DZ = 1.15;
/** Il ne marche pas, il presse le pas : une porte bloquée retarde la ligne. */
const AGENT_RUN = WALK_SPEED * 1.6;

/** Axe de la baie devant laquelle l'agent est appelé (repère quai). */
let agentDoorZ = 0;

/** Slot de l'agent (toujours le dernier du pool). */
function agentSlot(): CrowdPax {
  initPlatformCrowd();
  return crowdList[CROWD_POOL - 1];
}

/**
 * Fait venir l'agent devant la porte d'axe `doorLocalZ` (repère quai).
 * Sans effet s'il est déjà en route ou en poste.
 */
export function summonPlatformAgent(doorLocalZ: number): void {
  const p = agentSlot();
  if (p.state === 'attending') return;
  const pl = placement();
  const side = doorLocalZ >= 0 ? -1 : 1; // il se poste du côté du centre du quai
  const post = clampPos(AGENT_POST_X, doorLocalZ + side * AGENT_POST_DZ);
  agentDoorZ = doorLocalZ;
  // Il arrive par la trémie la plus proche ; à défaut, du fond du quai.
  const stair = nearestStair(pl, doorLocalZ);
  const start = stair
    ? clampPos(stair.x, stairTopZ(stair))
    : clampPos(bounds().x1, doorLocalZ + (doorLocalZ >= 0 ? -18 : 18));
  p.pos.copy(start);
  p.y = 0;
  p.home.copy(post);
  p.state = 'attending';
  p.role = 'waiter';
  p.action = 'none';
  p.actionT = 0;
  p.actionDur = 999;
  p.partner = -1;
  p.ticket = -1;
  p.delay = 0;
  p.bob = 0;
  p.headPitch = 0;
  p.lookYaw = 0;
  p.waypoints = [clampPos(post.x + 0.5, (start.z + post.z) / 2), post];
  p.wpi = 0;
  p.yaw = Math.atan2(post.x - start.x, post.z - start.z);
  p.targetYaw = p.yaw;
}

/** L'agent est-il arrivé à son poste ? */
export function platformAgentPosted(): boolean {
  const p = agentSlot();
  return p.state === 'attending' && p.wpi >= p.waypoints.length;
}

/** Position monde de sa tête, pour accrocher ce qu'il dit. */
export function platformAgentHead(out: { x: number; y: number; z: number }): boolean {
  const p = agentSlot();
  if (p.state !== 'attending') return false;
  platformToWorld(p.pos.x, p.pos.z, tmpWorld);
  out.x = tmpWorld.x;
  out.y = PLATFORM_TOP + p.y + SKELETON_TOP * p.height + p.bob;
  out.z = tmpWorld.z;
  return true;
}

/** L'affaire est réglée : l'agent regagne la sortie. */
export function dismissPlatformAgent(): void {
  const p = agentSlot();
  if (p.state !== 'attending') return;
  if (!sendToStairs(p, placement())) p.state = 'hidden';
}

const tmpWorld = { x: 0, z: 0 };

/** Un voyageur du quai vient d'atteindre le seuil : jeton + qui il est. */
export interface ArrivedBoarder {
  ticket: number;
  /** Slot de quai qu'il occupait — celui avec qui la rame échange l'identité. */
  crowdId: number;
}

/** Voyageurs arrivés au seuil depuis le dernier appel. */
const arrivedBoarders: ArrivedBoarder[] = [];

export function takeArrivedBoarders(): ArrivedBoarder[] {
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
  clearCrowdAnchor(p);
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
  clearCrowdAnchor(p);
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
      other.anchor = 'none';
      other.anchorLeft = 0;
      other.socialT = nextSocialDelay(other.temper);
      other.action = 'none';
      other.actionT = 0;
      other.actionDur = 1.5 + Math.random() * 2.5;
    }
    p.socialT = nextSocialDelay(p.temper);
  }
  p.partner = -1;
}

/** Coupe l'occupation de fond (changement d'état : marche, trémie, montée). */
function clearCrowdAnchor(p: CrowdPax): void {
  p.anchor = 'none';
  p.anchorLeft = 0;
  p.interludeT = nextInterludeDelay(p.temper);
}

function findCrowdPartner(p: CrowdPax, maxDist: number): CrowdPax | null {
  let best: CrowdPax | null = null;
  let bestD = maxDist;
  for (const other of crowdList) {
    if (other.id === p.id) continue;
    if (other.state !== 'waiting') continue;
    if (other.action === 'shift') continue;
    if (isPairAction(other.action as PaxAction)) continue;
    // Même règle qu'en rame : pas de recrutement au milieu d'une glissade ou
    // d'un geste bref, sinon l'animation est coupée net.
    if (BUSY_BRIEF.has(other.action as PaxAction)) continue;
    const d = p.pos.distanceTo(other.pos);
    if (d > bestD) continue;
    bestD = d;
    best = other;
  }
  return best;
}

function crowdPickCtx(p: CrowdPax): PickCtx {
  const playerHere = runtime.playerFrame === 'platform';
  return {
    where: 'waiting',
    appearance: p.appearance,
    temper: p.temper,
    scope: 'platform',
    playerDist: playerHere
      ? Math.hypot(p.pos.x - runtime.playerPlatX, p.pos.z - runtime.playerPlatZ)
      : Infinity,
    playerHere,
  };
}

/** Applique une occupation tirée et joue son Foley éventuel. */
function applyCrowdAction(p: CrowdPax, id: PaxAction, dur: number, partner: CrowdPax | null): void {
  p.action = id;
  p.actionT = 0;
  p.actionDur = dur;
  if (id === 'look' || id === 'lookBoard' || id === 'fidget' || id === 'curiousGlance') {
    p.lookYaw = (Math.random() - 0.5) * 1.1;
  }
  if (isFallingAction(id)) p.lookYaw = Math.random() < 0.5 ? 1 : -1;
  if (partner) {
    p.partner = partner.id;
    p.chatRole = 0;
    partner.action = id;
    partner.partner = p.id;
    partner.chatRole = 1;
    partner.actionT = 0;
    partner.actionDur = dur;
  } else {
    p.partner = -1;
  }
  const dist =
    runtime.playerFrame === 'platform'
      ? Math.hypot(p.pos.x - runtime.playerPlatX, p.pos.z - runtime.playerPlatZ)
      : 99;
  playPaxActionSfx(id, dist);
}

/** Occupation de fond d'un voyageur en attente : elle tient des dizaines de secondes. */
function startCrowdAnchor(p: CrowdPax): void {
  const ctx = crowdPickCtx(p);
  const def = pickPaxAction(ctx, true);
  if (!def) {
    p.anchor = 'none';
    p.anchorLeft = 0;
    applyCrowdAction(p, 'none', 6 + Math.random() * 10, null);
    return;
  }
  const dur = actionDuration(def, p.temper);
  if (def.kind === 'pair') {
    const other = p.socialT > 0 ? null : findCrowdPartner(p, def.partnerDist ?? 1.4);
    if (other) {
      p.anchor = def.id;
      p.anchorLeft = dur;
      p.interludeT = dur + 1;
      other.anchor = def.id;
      other.anchorLeft = dur;
      other.interludeT = dur + 1;
      applyCrowdAction(p, def.id, dur, other);
      return;
    }
    p.anchor = 'none';
    p.anchorLeft = 10 + Math.random() * 18;
    p.interludeT = nextInterludeDelay(p.temper);
    applyCrowdAction(p, 'none', p.anchorLeft, null);
    return;
  }
  p.anchor = def.id;
  p.anchorLeft = dur;
  p.interludeT = nextInterludeDelay(p.temper);
  applyCrowdAction(p, def.id, dur, null);
}

/** Geste bref qui interrompt l'attente, sans lui faire perdre son fil. */
function startCrowdInterlude(p: CrowdPax): void {
  const def = pickPaxAction(crowdPickCtx(p), false);
  if (!def) {
    p.interludeT = nextInterludeDelay(p.temper);
    return;
  }
  const dur = actionDuration(def, p.temper);
  if (def.kind === 'pair') {
    const other = p.socialT > 0 ? null : findCrowdPartner(p, def.partnerDist ?? 1.4);
    if (!other) {
      p.interludeT = nextInterludeDelay(p.temper);
      return;
    }
    other.interludeT = dur + 1;
    applyCrowdAction(p, def.id, dur, other);
    return;
  }
  applyCrowdAction(p, def.id, dur, null);
}

/**
 * Fait parler ce voyageur du quai AU joueur (systems/conversation). Un
 * promeneur s'arrête pour ça : on ne s'adresse pas à quelqu'un en continuant
 * de marcher vers le bout du quai.
 */
export function crowdStartTalking(id: number, dur: number): boolean {
  const p = crowdList[id];
  if (!p) return false;
  if (p.state !== 'waiting' && p.state !== 'ambling' && p.state !== 'patrolling') return false;
  endCrowdPair(p);
  clearCrowdAnchor(p);
  p.state = 'waiting';
  p.home.copy(p.pos);
  p.waypoints = [];
  p.wpi = 0;
  p.bob = 0;
  p.action = 'talkPlayer';
  p.actionT = 0;
  p.actionDur = dur;
  return true;
}

/** Réplique suivante du même échange. */
export function crowdKeepTalking(id: number, dur: number): boolean {
  const p = crowdList[id];
  if (!p || p.action !== 'talkPlayer') return false;
  p.actionT = 0;
  p.actionDur = dur;
  return true;
}

/** Fin de l'échange : le voyageur reprend son attente ou sa promenade. */
export function crowdStopTalking(id: number): void {
  const p = crowdList[id];
  if (!p || p.action !== 'talkPlayer') return;
  p.actionT = p.actionDur;
}

/** Reprend l'occupation de fond, ou en choisit une autre si elle est épuisée. */
function resumeCrowdAnchor(p: CrowdPax): void {
  if (p.anchorLeft > 1.5 && !isPairAction(p.anchor)) {
    applyCrowdAction(p, p.anchor, p.anchorLeft, null);
    p.interludeT = nextInterludeDelay(p.temper);
    return;
  }
  startCrowdAnchor(p);
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
 * Évitement + poussée : si le joueur marche dans quelqu'un et insiste,
 * le voyageur glisse / trébuche.
 */
const PLAYER_CLEARANCE = 0.62;
const CROWD_PUSH_FALL = 0.95;
let crowdBumpCd = 0;
let prevPlatX = 0;
let prevPlatZ = 0;
let prevPlatInit = false;

function avoidPlayer(p: CrowdPax, dt: number, pvx: number, pvz: number): void {
  if (runtime.playerFrame !== 'platform') {
    p.pushAccum = Math.max(0, p.pushAccum - dt * 0.8);
    return;
  }
  const px = runtime.playerPlatX;
  const pz = runtime.playerPlatZ;
  const dx = p.pos.x - px;
  const dz = p.pos.z - pz;
  const d = Math.hypot(dx, dz);
  if (d >= PLAYER_CLEARANCE || d < 1e-4) {
    p.pushAccum = Math.max(0, p.pushAccum - dt * 0.75);
    return;
  }
  if (isFallingAction(p.action === 'shift' ? 'none' : (p.action as PaxAction))) {
    p.pushAccum = 0;
    return;
  }
  if (p.state !== 'waiting' && p.state !== 'ambling' && p.state !== 'patrolling') return;

  // L'écart reste SUR LE QUAI : sans borne, insister contre quelqu'un le
  // poussait par-dessus le nez de quai, dans la voie, ou au travers du mur
  // de fond — un voyageur ne recule pas dans le vide pour nous laisser passer.
  const push = (PLAYER_CLEARANCE - d) / d;
  const bounded = clampPos(p.pos.x + dx * push, p.pos.z + dz * push);
  p.pos.x = bounded.x;
  p.pos.z = bounded.z;

  const nx = dx / d;
  const nz = dz / d;
  const approach = Math.max(0, pvx * nx + pvz * nz);
  const overlap = (PLAYER_CLEARANCE - d) / PLAYER_CLEARANCE;
  p.pushAccum += (0.5 + approach * 0.85 + overlap * 1.2) * dt;

  if (crowdBumpCd <= 0 && (approach > 0.35 || overlap > 0.3)) {
    paxBump(d, overlap > 0.5);
    crowdBumpCd = 0.3;
    // Bousculer quelqu'un sur un quai se remarque encore plus qu'en rame.
    if (p.state === 'waiting') pushPaxEvent('platform', p.id, 'bump');
  }

  if (p.pushAccum > 0.2 && p.state === 'waiting' && !isPairAction(p.action as PaxAction)) {
    if (p.action !== 'angry' && p.action !== 'gasp') {
      endCrowdPair(p);
      p.action = 'angry';
      p.actionT = 0;
      p.actionDur = 1.2;
    }
  }

  if (p.pushAccum >= CROWD_PUSH_FALL && p.state === 'waiting') {
    endCrowdPair(p);
    p.pushAccum = 0;
    p.action = 'slip';
    p.actionT = 0;
    p.actionDur = 2.2;
    p.lookYaw = nx >= 0 ? 1 : -1;
    playPaxActionSfx('slip', d);
  }
}

export function updatePlatformCrowd(dt: number): void {
  const presence = runtime.platformFade;
  if (presence < 0.04) {
    if (seededFor >= 0) clearPlatformCrowd();
    prevPlatInit = false;
    return;
  }
  // Une seule résolution du gabarit par frame : les transits la consultent
  // pour savoir à quelle hauteur ils posent le pied dans une trémie.
  const currentPlacement = placement();
  crowdBumpCd = Math.max(0, crowdBumpCd - dt);
  const platX = runtime.playerPlatX;
  const platZ = runtime.playerPlatZ;
  let pvx = 0;
  let pvz = 0;
  if (prevPlatInit && runtime.playerFrame === 'platform') {
    pvx = (platX - prevPlatX) / Math.max(dt, 1e-4);
    pvz = (platZ - prevPlatZ) / Math.max(dt, 1e-4);
  }
  prevPlatX = platX;
  prevPlatZ = platZ;
  prevPlatInit = true;

  for (const p of crowdList) {
    if (p.state === 'hidden') continue;

    p.actionT += dt;
    p.bobPhase += dt;
    // L'agent tient son poste : ce n'est pas à lui de s'écarter.
    if (!p.staff) avoidPlayer(p, dt, pvx, pvz);

    // L'agent de quai : il accourt, puis il ne bouge plus — face à la porte,
    // à celui qui la bloque.
    if (p.state === 'attending') {
      if (p.wpi < p.waypoints.length) {
        advanceWalk(p, dt * (AGENT_RUN / WALK_SPEED), () => {
          // Arrivé : il pivote vers la baie qu'il vient couvrir.
          p.targetYaw = Math.atan2(PSD_X - p.pos.x, agentDoorZ - p.pos.z);
          p.bob = 0;
        });
      } else {
        // En poste : le poids passe d'un pied sur l'autre, rien de plus.
        p.bob = Math.sin(p.bobPhase * 1.3) * 0.006;
      }
      let dy = p.targetYaw - p.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 5);
      p.y = floorYAt(currentPlacement, p.pos.x, p.pos.z);
      continue;
    }

    // Transits : arrivée par la trémie, départ vers la sortie, montée en rame.
    if (p.state === 'arriving' || p.state === 'leaving' || p.state === 'boarding') {
      if (p.delay > 0) {
        p.delay -= dt;
        p.bob = Math.sin(p.bobPhase * 1.1) * 0.004;
      } else {
        advanceWalk(p, dt, () => {
          if (p.state === 'boarding') {
            // Le relais est pris à l'intérieur du wagon (systems/passengers),
            // qui reprendra l'identité de ce slot pour poursuivre la montée.
            if (p.ticket >= 0) arrivedBoarders.push({ ticket: p.ticket, crowdId: p.id });
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
            clearCrowdAnchor(p);
            p.action = 'none';
            p.actionT = 0;
            p.actionDur = 0.6 + Math.random() * 1.4;
            p.bob = 0;
          }
          p.waypoints = [];
          p.wpi = 0;
        });
        // Les marches se descendent vraiment : l'altitude suit le profil de la
        // volée. On ne s'efface PAS à une altitude donnée — le voyageur
        // s'évaporait alors en pleine volée, la tête au niveau du quai, sous
        // les yeux de qui se penche dans la trémie. Il marche jusqu'au bout de
        // son dernier point de passage, un mètre après le linteau : c'est la
        // dalle qui le cache, et l'effacement ne se voit plus.
        p.y = floorYAt(currentPlacement, p.pos.x, p.pos.z);
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
          clearCrowdAnchor(p);
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
        clearCrowdAnchor(p);
        p.action = 'none';
        p.actionT = 0;
        p.actionDur = 0.6 + Math.random() * 1.4;
        p.bob = 0;
      });
    } else {
      // waiting
      if (p.socialT > 0) p.socialT -= dt;
      // Même mécanique qu'en rame : une occupation de fond qui tient, des
      // gestes brefs qui s'y insèrent, et un retour au fil de l'attente.
      const onAnchor = p.action === p.anchor;
      if (onAnchor) {
        p.anchorLeft -= dt;
        p.interludeT -= dt;
      }
      if (p.actionT >= p.actionDur) {
        p.actionT = 0;
        if (isPairAction(p.action as PaxAction)) endCrowdPair(p);
        if (p.role === 'walker') {
          // Les promeneurs repartent vite marcher.
          startPatrol(p);
        } else if (onAnchor && Math.random() < 0.12) {
          // On se déplace de quelques mètres le long du quai de temps à autre,
          // on ne fait pas les cent pas entre chaque coup d'œil au téléphone.
          startShortAmble(p);
        } else if (onAnchor) {
          startCrowdAnchor(p);
        } else {
          resumeCrowdAnchor(p);
        }
      } else if (
        onAnchor &&
        p.interludeT <= 0 &&
        p.anchorLeft > 3 &&
        !isPairAction(p.action as PaxAction)
      ) {
        startCrowdInterlude(p);
      }
      if (p.state === 'waiting') {
        const partner = p.partner >= 0 ? crowdList[p.partner] : null;
        if (isPairAction(p.action as PaxAction) && (!partner || partner.partner !== p.id)) {
          endCrowdPair(p);
          p.action = 'none';
        }
        const player = platformPlayerCtx();
        const act = p.action === 'shift' ? 'none' : (p.action as PaxAction);
        const m = resolveMotion({
          action: act,
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
        p.headRoll += (m.headRoll - p.headRoll) * Math.min(1, dt * m.speed);
        p.bodyLean += (m.lean - p.bodyLean) * Math.min(1, dt * m.speed);
        p.bodyRoll += (m.roll - p.bodyRoll) * Math.min(1, dt * m.speed);
        p.bodyPivot += (m.pivot - p.bodyPivot) * Math.min(1, dt * m.speed);
        if (isFallingAction(act) || Math.abs(m.drop) > 0.001) {
          p.bob += (m.drop - p.bob) * Math.min(1, dt * m.speed);
        } else {
          p.bob = Math.sin(p.bobPhase * 1.1) * 0.004;
          p.bodyLean *= Math.max(0, 1 - dt * 5);
          p.bodyRoll *= Math.max(0, 1 - dt * 5);
          p.bodyPivot *= Math.max(0, 1 - dt * 5);
        }
        p.targetYaw = -Math.PI / 2 + p.lookYaw * 0.35;
      }
    }

    let d = p.targetYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d * Math.min(1, dt * 5);
  }
}
