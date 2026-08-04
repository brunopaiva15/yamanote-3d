// Foule du quai : pool de voyageurs en attente et en promenade (distincts
// des PNJ de la rame). Une part reste près des portes, l'autre se balade
// le long du quai en continu - comme dans une vraie gare tokyoïte.
//
// Le quai n'est plus une population qui apparaît et disparaît d'un bloc : les
// voyageurs ARRIVENT par les trémies d'escalier, montent dans la rame par les
// portes, et ceux qui en descendent traversent le quai puis s'en vont par ces
// mêmes trémies. Vu du quai, un train qui part ne fait plus s'évaporer tout le
// monde d'un coup.
//
// ET ILS VONT JUSQU'AU BOUT. Un voyageur qui s'engageait dans la trémie
// principale s'effaçait au fond du couloir bas : invisible depuis le quai - la
// dalle cache -, mais en plein champ depuis le HALL, où l'on descend
// maintenant. Il descend donc pour de bon : il traverse la zone payante,
// VALIDE au portillon, ressort côté libre, entre parfois au konbini, et ne
// s'efface qu'en haut de la volée d'une bouche de sortie. Et symétriquement,
// une part des arrivants monte de la rue par ces mêmes bouches au lieu de
// naître au pied des marches. L'itinéraire est décrit dans
// `systems/concourseRoute` ; ce fichier tient les pieds.
//
// DEUX ÉTAGES, DONC. `CrowdPax.level` dit lequel des deux sols est sous les
// pieds - même question, même réponse et même bascule que pour le joueur
// (`systems/stationLevels`) : elle n'a lieu que dans la volée, seul endroit où
// les deux n'en font qu'un.
//
// ET ON CONTOURNE. Bancs, poteaux, distributeurs, batteries de tri, cages
// d'escalier : le quai est meublé, et la foule le traversait de part en part.
// Les emprises sont publiées depuis toujours (`systems/stationPlacement`,
// `obstacles`) - c'est celles que la marche du joueur respecte - il ne
// manquait qu'un pas qui les lise.

import { Vec3, clamp, lerp } from './vec3';
import { isMajorHub } from '../data/announcements';
import { CONFIG } from '../data/config';
import { SKELETON_TOP, makeAppearance, type Appearance } from './appearance';
import { paxScale } from './perf';
import { onPlatformDeck, runtime } from './runtime';
import { useStore } from '../store';
import { psdGates } from '../three/station/psdLayout';
import {
  placementFor,
  stairTopZ,
  stairwellAt,
  type Placed,
  type StationPlacement,
} from './stationPlacement';
import { layoutFor } from '../data/stationLayouts';
import {
  ASCENT_LEN,
  ascentFloorY,
  PSD_X,
  STAIR_FULL_LEN,
  STAIR_FULL_STEPS,
  STAIR_WALK_HALF_X,
} from '../data/stationGeometry';
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
import {
  routeFromStreet,
  routeToStreet,
  stationInteriorOpen,
  type RouteStop,
} from './concourseRoute';
import {
  CLEAR_DECK,
  CLEAR_ROOM,
  concourseFloorAt,
  exitMouthFloorAt,
  mainAccessFloor,
  walkerBlocked,
  walkerCramped,
  type StationLevel,
} from './stationLevels';
import { gateShutFor, paxNearGate, paxTapGate } from './fareGate';

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
  pos: Vec3;
  /** Altitude relative au sol du quai : négative dans une trémie. */
  y: number;
  /**
   * Étage sous les pieds. Il ne change que dans la volée principale, exactement
   * comme celui du joueur - et pour la même raison : partout ailleurs, il y a
   * deux sols à la même abscisse et rien dans les coordonnées ne dit lequel.
   */
  level: StationLevel;
  /**
   * Ce voyageur suit-il un itinéraire de GARE (hall, portillons, sortie) ?
   *
   * Sert à plafonner le monde qu'on envoie sous la dalle : le pool est
   * commun avec le quai, et trente personnes en promenade dans le hall, c'est
   * autant qui manquent devant les portes.
   */
  inStation: boolean;
  /** Secondes passées à buter sur un obstacle : au-delà, on renonce. */
  stuck: number;
  home: Vec3;
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
  /**
   * L'itinéraire en cours : où l'on va, et ce qu'on y fait en arrivant.
   *
   * Une promenade sur le quai n'y met que des points ; une descente en gare y
   * met aussi des haltes et un coup de carte au portillon
   * (`systems/concourseRoute`).
   */
  route: RouteStop[];
  routeI: number;
  /**
   * Secondes de validation encore valables au portillon, pour LUI.
   *
   * Elle est portée par le voyageur et non par le portillon, et c'est tout ce
   * qui empêche une file de s'engouffrer sur le ピッ du premier : la baie ne
   * reste ouverte que le temps que celui qui a bipé la franchisse, et le
   * suivant retrouve devant lui des battants rabattus.
   */
  gateOkT: number;
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
   * une fois pour toutes à partir de l'apparence (voir LibraryPlatformCrowd) -
   * on ne peut donc pas déguiser un civil en agent en cours de route, il faut
   * qu'une place du pool soit la sienne depuis le début.
   */
  staff: boolean;
}

/** Capacité max du pool - assez large pour que Shinjuku/Shibuya débordent
 *  vraiment de voyageurs en attente, sans plafonner tous les hubs au même
 *  effectif (Shinjuku à 2,2× peut monter au-dessus de Tokyo à 2,0×). */
export const CROWD_POOL = 40;
export const crowdList: CrowdPax[] = [];

// --- Ce qui barre le passage --------------------------------------------
//
// Le quai est MEUBLÉ, et la foule le traversait de part en part : bancs,
// poteaux, distributeurs, batteries de tri, cages d'escalier. Les emprises
// sont publiées depuis toujours (`systems/stationPlacement`, `obstacles`) -
// ce sont exactement celles que la marche du joueur contourne, il n'y a pas
// deux mobiliers - et il ne manquait qu'un pas qui les lise.

/** Un point du repère quai, sans altitude : l'étage la donne. */
interface Spot {
  x: number;
  z: number;
}

/**
 * Largeur minimale de la bande de circulation, depuis le liseré.
 *
 * Ce qui la rétrécit en deçà n'est plus l'épine, c'est un obstacle isolé - et
 * un obstacle isolé se contourne. Le chiffre se lit sur les trente quais : la
 * rangée de bancs la plus proche du bord en laisse 1,03 m (Komagome,
 * Shin-Ōkubo), une borne d'arrêt d'urgence 0,54. Quatre-vingt-dix centimètres
 * passent entre les deux, et il n'y a rien d'autre à trancher.
 */
const MIN_BAND = 0.9;

/**
 * Jusqu'où l'on peut s'écarter du bord avant de rentrer dans l'épine.
 *
 * Vue en coupe, la circulation d'un quai de la Yamanote tient en une bande :
 * du liseré blanc à la première chose plantée au sol. Sur un îlot, ce qui la
 * ferme est l'ossature centrale - poteaux, bancs, distributeurs, cage
 * d'escalier - qui prend trois mètres des cinq et demi. `reach` la mesure à
 * une abscisse DONNÉE quand on la connaît : une file d'attente peut s'étaler
 * là où le quai est nu, et se resserre au droit d'un banc.
 *
 * La travée d'en face d'un îlot n'est pas de cette bande, et c'est voulu : on
 * n'y attend pas notre train, on y attend celui de l'autre sens - que le jeu
 * ne fait pas passer.
 *
 * La bande s'arrête au JOUR qu'on se garde, et non au gabarit : longer une
 * rangée de bancs à l'épaisseur d'une épaule, c'est la longer en frottant.
 */
function reach(p: StationPlacement, z: number | null = null, window = 0.6): number {
  let near = Math.min(p.walkX1 - 0.4, p.walkX0 + 4.2);
  for (const o of p.obstacles) {
    if (z !== null && Math.abs(z - o.z) > o.halfZ + window) continue;
    near = Math.min(near, o.x - o.halfX - CLEAR_DECK - CLEAR_ROOM);
  }
  // ET ELLE A UNE LARGEUR MINIMALE, c'est elle qui manquait. Une borne d'arrêt
  // d'urgence est plantée À UN MÈTRE DU LISERÉ, en pleine circulation
  // (Shinjuku et Shibuya, les deux quais sans portes palières). Prise pour
  // l'épine, elle rabattait tout le monde entre elle et le vide, dans un
  // couloir de vingt-quatre centimètres : chacun passait donc à l'épaisseur
  // d'un buste du caisson jaune, et l'on voyait les gens le traverser au lieu
  // d'en faire le tour. Sous ce plancher, la chose est un OBJET DANS la bande :
  // elle se contourne (`skirtDecor`, `freeSpot`), elle ne la ferme pas.
  return Math.max(p.walkX0 + MIN_BAND, near);
}

/** Directions d'esquive, le bord de quai d'abord : c'est là qu'il y a la place. */
const AWAY: readonly [number, number][] = [
  [-1, 0], [0, 1], [0, -1], [-0.7, 0.7], [-0.7, -0.7], [1, 0], [0.7, 0.7], [0.7, -0.7],
];

/**
 * Le point libre le plus proche d'un point voulu, sur le quai.
 *
 * Les emplacements d'attente, les voies de promenade et les points de rebond
 * sont calculés à la trigonométrie, pas relevés un par un : il en tombe
 * fatalement dans un banc. Plutôt que de renoncer à la place - un quai à qui
 * il manque des files d'attente se voit -, on la décale d'un pas de côté.
 */
function freeSpot(p: StationPlacement, x: number, z: number): Spot {
  // Deux passes, et c'est toute la différence entre debout À CÔTÉ d'une borne
  // et debout CONTRE : la première cherche une place où l'on a ses aises, la
  // seconde se contente de ce qui est du sol. Sans la première, le décalage
  // s'arrêtait à la première case libre venue - c'est-à-dire pile sur la
  // frontière de l'emprise, l'épaule dans le caisson, et pour tout l'arrêt.
  for (const tight of [false, true]) {
    const taken = tight ? walkerBlocked : walkerCramped;
    if (!taken(p, 'platform', x, z)) return { x, z };
    for (let r = 0.3; r <= 3.6; r += 0.3) {
      for (const [dx, dz] of AWAY) {
        const cx = x + dx * r;
        const cz = z + dz * r;
        if (!taken(p, 'platform', cx, cz)) return { x: cx, z: cz };
      }
    }
  }
  return { x, z };
}

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
    // La borne haute reste celle du gabarit, et non la bande libre la plus
    // étroite de tout le quai : deux cages d'escalier prennent dix mètres sur
    // deux cent vingt-quatre, et les y faire obéir sur toute la longueur
    // rangerait la foule entière en file indienne le long du liseré. Ce qui
    // fait la circulation, c'est `reach` mesuré À L'ENDROIT où l'on est.
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
    pos: new Vec3(),
    y: 0,
    level: 'platform',
    inStation: false,
    stuck: 0,
    home: new Vec3(),
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
    route: [],
    routeI: 0,
    gateOkT: 0,
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
 * On ne fabrique pas son apparence de toutes pièces - on cherche dans le
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

// `import.meta.env` n'existe que sous Vite. L'interrogation est là pour le
// TEST, qui charge ce fichier avec Node et fait marcher la foule pour de vrai
// (`tests/platformCrowdWalk`) : une foule qui traverse un banc ne se voit qu'en
// avançant, donc en la faisant avancer.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
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
 * `identity` et rend la sienne. C'est le pivot du relais avec la rame - celui
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

/** Combien de monde sur le quai, et combien qui le parcourent. */
export interface Effectif {
  total: number;
  walkers: number;
}

// --- La foule, telle qu'elle se partage entre joueurs ----------------------
//
// Bonne nouvelle, et elle a décidé de la forme de ce partage : le PLACEMENT de
// la foule est déjà déterministe. Les files d'attente, les voies de promenade,
// les caps : tout se déduit du rang dans le pool et de la gare
// (`waitSlot(i - walkers, …)`, `i % 2`, `i % 3`). Deux clients qui peuplent le
// même quai avec le même effectif obtiennent la même disposition, sans qu'un
// seul nombre n'ait à traverser le réseau.
//
// Il ne manquait donc que deux choses, et ce sont exactement celles qui
// voyagent ici : l'EFFECTIF - qui dépend de la qualité vidéo choisie
// (`paxScale`), et qu'aucune graine commune ne rattraperait - et les IDENTITÉS,
// qui dérivent d'un client à l'autre à force d'échanges au seuil des portes
// (`swapCrowdIdentity`).
//
// Le reste - qui regarde son téléphone, qui bavarde avec son voisin - demeure
// local, comme en rame.

/** `[total, walkers, identité par place du pool…]`. */
export function sampleCrowdPopulation(): number[] {
  const { total, walkers } = crowdCount(useStore.getState().platformIndex);
  const out = [total, walkers];
  for (const p of crowdList) out.push(p.identity);
  return out;
}

/**
 * Pose la foule de l'hôte sur le quai.
 *
 * L'effectif est plafonné par le NÔTRE quand il est plus bas : une petite
 * machine dans un salon mené depuis un ordinateur de bureau voit les mêmes
 * gens, aux mêmes places, simplement moins loin dans la file - plutôt qu'une
 * foule qu'elle ne saurait pas dessiner. C'est le seul endroit où l'on s'écarte
 * sciemment du « tout le monde voit la même chose », et c'est pour que tout le
 * monde puisse jouer.
 */
export function applyCrowdPopulation(stationIndex: number, flat: readonly number[]): void {
  if (flat.length < 2) return;
  initPlatformCrowd();
  const mien = crowdCount(stationIndex);
  const total = Math.min(flat[0], mien.total);
  const walkers = Math.min(flat[1], total);
  // Les identités D'ABORD : le peuplement lit `temper` et `height`, qui en
  // découlent, pour choisir qui bavarde et à quelle hauteur il se tient.
  for (let i = 0; i < crowdList.length && i + 2 < flat.length; i++) {
    const p = crowdList[i];
    // L'agent de quai n'est pas un voyageur : son uniforme ne se troque pas.
    if (p.staff || p.identity === flat[i + 2]) continue;
    applyCrowdIdentity(p, flat[i + 2]);
  }
  seedPlatformCrowd(stationIndex, { total, walkers });
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
 * Densité réelle : le gabarit de la gare pèse autant que son statut de hub -
 * Uguisudani reste vide quand Shinjuku déborde - et la qualité vidéo réduit
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

/** Un point ramené dans les bornes du quai, ET hors du mobilier. */
function clampPos(x: number, z: number): Spot {
  const b = bounds();
  const p = placementFor(useStore.getState().platformIndex, psdGates());
  return freeSpot(
    p,
    clamp(x, b.x0, b.x1),
    clamp(z, b.z0, b.z1),
  );
}

// Emplacements d'attente près des portes. Quatre files quand la file est
// dense, pour que les hubs ne s'empilent pas sur trois lignes seulement.
//
// La profondeur des files n'est plus une cote fixe : c'est ce que l'épine
// laisse À CET ENDROIT-LÀ du quai. Quatre rangées de 0,65 m menaient la
// dernière à 4,40 m du bord, c'est-à-dire dans les bancs et les poteaux -
// quatre rangées dont une traverse un banc ne sont pas quatre rangées.
function waitSlot(i: number, n: number, bias: number): Spot {
  const doors = CONFIG.doorCenters;
  const doorZ = doors[i % doors.length];
  const b = bounds();
  const spread = (i / Math.max(1, n - 1) - 0.5) * 12;
  const z = clamp(
    doorZ + ((i * 13) % 11 - 5) * 0.45 + bias + spread * 0.25,
    b.z0,
    b.z1,
  );
  const p = placementFor(useStore.getState().platformIndex, psdGates());
  const lanes = n > 14 ? 4 : 3;
  const lane = i % lanes;
  const step = Math.min(0.65, Math.max(0, (reach(p, z) - b.x0) / (lanes - 1)));
  const x = b.x0 + lane * step + ((i * 17) % 7) * 0.03;
  return freeSpot(p, x, z);
}

/**
 * Pas de la promenade, qui est aussi la fenêtre sur laquelle on mesure la
 * bande libre : c'est ce qui rend le trajet sûr sans avoir à le vérifier après
 * coup. Un segment est encadré par deux mesures qui le couvrent toutes deux,
 * donc l'abscisse ne sort de la bande à aucun moment.
 */
const STROLL_STEP = 4;

/**
 * Le trajet d'un promeneur, du bout du quai à l'autre.
 *
 * Ce n'était qu'une droite, et c'est ce qui la rendait fausse : une droite
 * tirée entre deux bouts de quai traverse tout ce qu'il y a entre eux. Le
 * promeneur SE RANGE - il tient sa voie là où le quai est nu, et se rapproche
 * du bord au droit d'un banc, d'un poteau ou d'une cage d'escalier. C'est ce
 * que fait n'importe qui marchant sur un quai, et cela se voit d'autant mieux
 * qu'ils sont plusieurs à ne pas se ranger au même endroit.
 */
function patrolWaypoints(laneX: number, fromZ: number, dir: 1 | -1): RouteStop[] {
  const b = bounds();
  const p = placementFor(useStore.getState().platformIndex, psdGates());
  const endZ = dir > 0 ? b.z1 - 1 - Math.random() * 4 : b.z0 + 1 + Math.random() * 4;
  const sway = (Math.random() - 0.5) * 0.45;
  const n = Math.max(1, Math.ceil(Math.abs(endZ - fromZ) / STROLL_STEP));
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n;
    const z = fromZ + (endZ - fromZ) * t;
    const x = Math.min(laneX + sway * t, reach(p, z, STROLL_STEP));
    return freeSpot(p, Math.max(b.x0, x), z);
  });
}

let seededFor = -1;

export function seedPlatformCrowd(stationIndex: number, forced?: Effectif): void {
  initPlatformCrowd();
  // `forced` vient de l'hôte : on repeuple même si l'on croyait cette gare déjà
  // faite, puisque c'est justement pour changer d'effectif qu'on nous le
  // demande.
  if (seededFor === stationIndex && !forced) return;
  seededFor = stationIndex;
  const { total, walkers } = forced ?? crowdCount(stationIndex);

  // L'agent garde sa place : la foule se peuple autour de lui.
  const civils = crowdList.filter((p) => !p.staff);
  for (let i = 0; i < civils.length; i++) {
    const p = civils[i];
    if (i >= total) {
      p.state = 'hidden';
      p.role = 'waiter';
      p.inStation = false;
      p.level = 'platform';
      continue;
    }

    const isWalker = i < walkers;
    const wb = bounds();
    p.y = 0;
    p.level = 'platform';
    p.inStation = false;
    p.stuck = 0;
    p.ticket = -1;
    p.role = isWalker ? 'walker' : 'waiter';
    p.walkDir = i % 2 === 0 ? 1 : -1;
    // La voie de promenade se prend DANS les bornes du quai, et non à une
    // abscisse écrite d'avance : à 3,00 m du bord, un promeneur longeait les
    // bancs par l'intérieur et traversait un poteau sur deux. Ce n'est qu'une
    // PRÉFÉRENCE - le trajet la rabat au droit de ce qui encombre.
    p.laneX = lerp(wb.x0, wb.x1, isWalker ? 0.1 + (i % 3) * 0.22 : 0.05 + (i % 3) * 0.18);
    p.bobPhase = Math.random() * Math.PI * 2;
    p.route = [];
    p.routeI = 0;

    if (isWalker) {
      const z0 = lerp(wb.z0 + 4, wb.z1 - 4, (i + 0.5) / walkers);
      const at = clampPos(p.laneX, z0);
      p.pos.set(at.x, 0, at.z);
      p.home.copy(p.pos);
      p.state = 'patrolling';
      p.route = patrolWaypoints(p.laneX, z0, p.walkDir);
      p.routeI = 0;
      p.action = 'shift';
      p.actionT = 0;
      p.actionDur = 20;
      p.yaw = p.walkDir > 0 ? 0 : Math.PI;
      p.targetYaw = p.yaw;
      p.lookYaw = 0;
      p.headPitch = 0;
    } else {
      const home = waitSlot(i - walkers, total - walkers, (stationIndex % 5) * 0.1);
      p.home.set(home.x, 0, home.z);
      p.pos.copy(p.home);
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
    p.route = [];
    p.routeI = 0;
    p.y = 0;
    p.level = 'platform';
    p.inStation = false;
    p.stuck = 0;
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

/**
 * Altitude du sol sous un voyageur, ET l'étage où il se trouve.
 *
 * C'est la seule chose qui, chez un voyageur, ne se déduit pas de sa position
 * seule : à l'aplomb du hall il y a aussi la dalle du quai. Comme pour le
 * joueur, c'est la VOLÉE qui tranche - elle n'a qu'un sol - et l'étage ne
 * change nulle part ailleurs (`systems/stationLevels`).
 *
 * Les trémies secondaires, elles, restent ce qu'elles étaient : un couloir
 * borgne où l'on s'enfonce et où la dalle finit par cacher.
 */
function floorYAt(p: StationPlacement, pax: CrowdPax): number {
  const access = mainAccessFloor(p, pax.pos.x, pax.pos.z);
  if (access) {
    pax.level = access.level;
    return access.y;
  }
  if (pax.level === 'concourse') {
    const mouth = exitMouthFloorAt(p, pax.pos.x, pax.pos.z);
    if (mouth !== null) return mouth;
    return concourseFloorAt(p, pax.pos.x, pax.pos.z) ?? p.interior.floorY;
  }
  // Une volée MONTANTE ne perce pas la dalle : `stairwellAt` ne connaît que la
  // descente, et sans ce cas le voyageur restait planté jusqu'à la taille dans
  // les marches des cinq gares en tranchée.
  if (p.mainRise === 'up') {
    const main = p.mainStair;
    if (Math.abs(pax.pos.x - main.x) <= STAIR_WALK_HALF_X) {
      const t = pax.pos.z - stairTopZ(main);
      if (t >= 0 && t <= ASCENT_LEN) return ascentFloorY(t);
    }
  }
  return stairwellAt(p, pax.pos.x, pax.pos.z, STAIR_FULL_LEN, STAIR_FULL_STEPS)?.y ?? 0;
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

/**
 * Combien de voyageurs peuvent être DANS la gare en même temps.
 *
 * Le pool est commun avec le quai : dix personnes en promenade dans le hall,
 * c'est dix de moins devant les portes, et le hall n'a pas besoin de plus pour
 * paraître vivant - il fait quarante mètres de long. Au-delà, les partants
 * prennent la trémie borgne de l'autre bout du quai, où la dalle les cache
 * comme elle l'a toujours fait.
 */
const INTERIOR_CAP = 10;

function interiorCount(): number {
  let n = 0;
  for (const p of crowdList) if (p.inStation) n++;
  return n;
}

/**
 * Combien de voyageurs se dirigent DÉJÀ vers chacun des passages du portillon.
 *
 * C'est ce qui permet à celui qui part de choisir une baie libre plutôt que de
 * se ranger derrière tout le monde (`systems/concourseRoute`, `pickPassage`).
 * La charge se LIT dans les itinéraires en cours au lieu de se tenir à part :
 * un compteur qu'il faudrait décrémenter se serait désynchronisé au premier
 * voyageur effacé en route - un changement de gare, un pool remis à zéro - et
 * la ligne se serait retrouvée pleine de files fantômes.
 *
 * Seule compte la validation ENCORE À VENIR : passé son ピッ, on ne pèse plus
 * sur la baie qu'on vient de franchir.
 */
function passageLoad(n: number): number[] {
  const load = new Array<number>(n).fill(0);
  if (n <= 0) return load;
  for (const p of crowdList) {
    if (p.state === 'hidden' || !p.inStation) continue;
    for (let i = p.routeI; i < p.route.length; i++) {
      const t = p.route[i].tap;
      if (t === undefined) continue;
      if (t >= 0 && t < n) load[t]++;
      break;
    }
  }
  return load;
}

/** La charge de la ligne de portillons de la gare courante. */
function gateLoad(pl: StationPlacement): number[] {
  return passageLoad(pl.interior.built ? pl.interior.gate.passages.length : 0);
}

/** Une trémie qui n'est PAS l'accès au hall : le couloir borgne d'à côté. */
function blindStair(pl: StationPlacement, z: number): Placed | null {
  let best: Placed | null = null;
  let bestD = Infinity;
  for (const s of pl.stairs) {
    if (s === pl.mainStair && stationInteriorOpen(pl)) continue;
    const d = Math.abs(s.z - z);
    if (d >= bestD) continue;
    bestD = d;
    best = s;
  }
  return best;
}

/**
 * Le raccord entre la circulation du quai et le nez d'une volée.
 *
 * ON NE TRAVERSE PAS L'ÉPINE EN DIAGONALE. Le quai circule le long du bord ;
 * les escaliers sont au milieu, DERRIÈRE les bancs, les poteaux et les
 * distributeurs. Un voyageur qui visait le nez de la volée depuis l'autre bout
 * du quai coupait droit dans le mobilier et finissait coincé entre un banc et
 * une cage - c'est exactement ce qu'on lui reprochait.
 *
 * Il longe donc le bord jusqu'à la hauteur de la volée, puis coupe en travers
 * DANS LA RÉSERVE D'APPROCHE : les deux mètres devant chaque nez où le
 * placement s'interdit de poser quoi que ce soit (`ACCESS_APPROACH`,
 * systems/stationPlacement). C'est le seul endroit de l'épine qui soit dégagé
 * d'un bord à l'autre, et c'est pour cela qu'il existe.
 */
function stairApron(s: Placed, lane: number, laneX: number): RouteStop[] {
  const nose = stairTopZ(s);
  const edge = clampPos(laneX, nose - 1.9);
  return [edge, { x: s.x + lane, z: nose - 0.9 }];
}

/**
 * Ce voyageur s'en va. Il descend DANS la gare quand il y a une gare où
 * descendre, et s'enfonce dans un couloir borgne sinon.
 *
 * C'est ici que se joue tout le défaut d'origine : un partant s'arrêtait au
 * fond du couloir bas et s'y effaçait. Invisible depuis le quai - c'est la
 * dalle qui cache - mais en plein champ depuis le hall, à trois mètres de qui
 * s'y promène. Il va maintenant jusqu'à la rue, portillon compris.
 */
function sendToStairs(p: CrowdPax, pl: StationPlacement, delay = 0): boolean {
  endCrowdPair(p);
  const full = stationInteriorOpen(pl)
    && interiorCount() < INTERIOR_CAP
    // On ne traverse pas deux cents mètres de quai pour prendre l'accès qui
    // mène au hall : c'est celui qu'on a devant soi, ou rien.
    && nearestStair(pl, p.pos.z) === pl.mainStair
    ? routeToStreet(pl, gateLoad(pl))
    : null;
  const s = full ? pl.mainStair : blindStair(pl, p.pos.z) ?? nearestStair(pl, p.pos.z);
  if (!s) return false;
  p.state = 'leaving';
  p.action = 'none';
  p.headPitch = 0;
  p.lookYaw = 0;
  p.delay = delay;
  p.stuck = 0;
  p.gateOkT = 0;
  p.inStation = full !== null;
  const lane = (Math.random() - 0.5) * 1.4;
  const apron = stairApron(s, lane, p.pos.x);
  if (full) {
    // L'itinéraire de gare part du nez de la volée : le raccord avec le bord
    // du quai est l'affaire de celui qui l'emprunte, pas celle de la gare.
    p.route = [...apron, ...full];
    p.routeI = 0;
    return true;
  }
  // Une volée qui MONTE est plus longue qu'une trémie : s'arrêter à la longueur
  // d'une descente laissait le voyageur s'évanouir au milieu des marches, en
  // plein champ. Il monte donc jusqu'en haut, où le tablier le cache.
  const rising = pl.mainRise === 'up' && s === pl.mainStair;
  p.route = [
    ...apron,
    {
      x: s.x + lane * 0.35,
      z: stairTopZ(s) + (rising ? ASCENT_LEN - 0.4 : STAIR_FULL_LEN),
    },
  ];
  p.routeI = 0;
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
  // voyageur continue précisément là où il s'arrête. Pas de dispersion en z -
  // c'est la même personne des deux côtés du seuil depuis que l'identité
  // traverse avec elle, et un demi-mètre d'écart se lirait comme un saut.
  p.pos.set(2.0, 0, doorLocalZ);
  p.y = 0;
  p.level = 'platform';
  p.inStation = false;
  p.stuck = 0;
  p.home.copy(p.pos);
  p.bob = 0;
  p.yaw = Math.PI / 2;
  p.targetYaw = p.yaw;
  p.ticket = -1;
  if (!sendToStairs(p, pl)) {
    // Gare sans trémie : le voyageur rejoint simplement le fond du quai.
    p.state = 'ambling';
    p.action = 'none';
    p.route = [clampPos(bounds().x1, p.pos.z + (Math.random() - 0.5) * 12)];
    p.routeI = 0;
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
  best.stuck = 0;
  best.route = [
    clampPos(PSD_X + 1.2, doorLocalZ + (Math.random() - 0.5) * 0.6),
    { x: 2.0, z: doorLocalZ },
  ];
  best.routeI = 0;
  return true;
}

// --- L'agent de quai -----------------------------------------------------
//
// Une porte qui ne se ferme pas ne se règle pas au micro depuis un bureau :
// quelqu'un vient. L'agent accourt depuis la trémie la plus proche, se poste
// À CÔTÉ de la porte - jamais devant, il ne bouche pas le passage qu'il essaie
// de dégager -, se tourne vers elle, et attend que ça se débloque.

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
  // Il arrive par la trémie la plus proche ; à défaut, du fond du quai. Le nez
  // de la volée ne se ramène PAS dans la bande de circulation : c'est
  // justement le seul endroit du quai où l'on a le droit d'être au droit de
  // l'épine, et l'agent en sort.
  const stair = nearestStair(pl, doorLocalZ);
  const start: Spot = stair
    ? { x: stair.x, z: stairTopZ(stair) }
    : clampPos(bounds().x1, doorLocalZ + (doorLocalZ >= 0 ? -18 : 18));
  p.pos.set(start.x, 0, start.z);
  p.y = 0;
  p.level = 'platform';
  p.inStation = false;
  p.stuck = 0;
  p.home.set(post.x, 0, post.z);
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
  p.route = [clampPos(post.x + 0.5, (start.z + post.z) / 2), post];
  p.routeI = 0;
  p.yaw = Math.atan2(post.x - start.x, post.z - start.z);
  p.targetYaw = p.yaw;
}

/** L'agent est-il arrivé à son poste ? */
export function platformAgentPosted(): boolean {
  const p = agentSlot();
  return p.state === 'attending' && p.routeI >= p.route.length;
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
  /** Slot de quai qu'il occupait - celui avec qui la rame échange l'identité. */
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
 * - vu du quai, c'était un claquement de doigts.
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

/**
 * Fait monter un voyageur vers le quai, pour la rame suivante.
 *
 * Une part vient de la RUE : elle descend une bouche de sortie, traverse la
 * zone libre, valide au portillon et remonte par la volée principale. C'est le
 * mouvement inverse du départ, et c'est ce qui fait qu'un hall n'est pas un
 * couloir mort - on y croise du monde dans les deux sens. Le reste monte d'une
 * trémie borgne comme avant : trente-cinq mètres de marche avant d'atteindre
 * le quai, cela ne remplit pas un quai en quarante secondes.
 */
export function crowdArrive(stationIndex: number): boolean {
  initPlatformCrowd();
  const p = freeSlot();
  if (!p) return false;
  const pl = placement();
  const total = crowdCount(stationIndex).total;
  const home = waitSlot(Math.floor(Math.random() * Math.max(1, total)), total, 0);
  // Une part des arrivants ne prend pas ce train : ils arpentent le quai.
  p.role = Math.random() < 0.35 ? 'walker' : 'waiter';
  p.ticket = -1;
  p.delay = 0;
  p.bob = 0;
  p.action = 'none';
  p.headPitch = 0;
  p.lookYaw = 0;
  p.stuck = 0;
  p.gateOkT = 0;
  p.home.set(home.x, 0, home.z);
  p.state = 'arriving';
  p.routeI = 0;
  p.inStation = false;
  p.level = 'platform';

  // ON NE FAIT NAÎTRE PERSONNE SOUS LES YEUX DU JOUEUR. Tant qu'il est
  // là-haut, la dalle cache tout ce qui se passe dessous et un arrivant peut
  // paraître au milieu de la volée - c'est ce que la foule a toujours fait,
  // et c'est aussi ce qui remplit un quai en quarante secondes, ce qu'un
  // trajet depuis la rue ne saurait faire. Dès qu'il est DESCENDU, la même
  // apparition se produirait en plein champ : tout le monde vient alors de la
  // rue, et ceux qui ne le peuvent pas montent du couloir borgne de l'autre
  // bout du quai, que le hall ne voit pas.
  const inHall = runtime.playerLevel === 'concourse';
  const fromStreet = interiorCount() < INTERIOR_CAP && (inHall || Math.random() < 0.45)
    ? routeFromStreet(pl, gateLoad(pl))
    : null;
  if (fromStreet) {
    p.inStation = true;
    p.level = 'concourse';
    p.pos.set(fromStreet.from.x, 0, fromStreet.from.z);
    p.y = floorYAt(pl, p);
    // Le raccord du nez de la volée au bord du quai, à l'envers : on débouche
    // dans la réserve d'approche, puis on gagne la circulation.
    const out = stairApron(pl.mainStair, (Math.random() - 0.5) * 1.2, home.x);
    p.route = [...fromStreet.stops, out[1], out[0], home];
    p.yaw = Math.PI;
    p.targetYaw = p.yaw;
    return true;
  }

  const zPick = (Math.random() - 0.5) * pl.walkHalfZ * 1.6;
  const s = inHall ? blindStair(pl, zPick) ?? nearestStair(pl, zPick) : nearestStair(pl, zPick);
  if (s) {
    const lane = (Math.random() - 0.5) * 1.2;
    p.pos.set(s.x + lane * 0.35, 0, stairTopZ(s) + STAIR_FULL_LEN);
    p.y = floorYAt(pl, p);
    const out = stairApron(s, lane, home.x);
    p.route = [out[1], out[0], home];
    p.yaw = Math.PI;
  } else {
    // Sans trémie, le voyageur entre par un bout du quai.
    const from = Math.random() < 0.5 ? -pl.walkHalfZ + 1 : pl.walkHalfZ - 1;
    p.pos.set(bounds().x1, 0, from);
    p.y = 0;
    p.route = [home];
    p.yaw = p.pos.z > 0 ? Math.PI : 0;
  }
  p.targetYaw = p.yaw;
  return true;
}

/** Cible de foule d'une gare, pour piloter le remplissage progressif. */
export function crowdTarget(stationIndex: number): number {
  return crowdCount(stationIndex).total;
}

function startPatrol(p: CrowdPax): void {
  endCrowdPair(p);
  clearCrowdAnchor(p);
  p.state = 'patrolling';
  p.action = 'shift';
  p.actionT = 0;
  p.actionDur = 30;
  p.route = patrolWaypoints(p.laneX, p.pos.z, p.walkDir);
  p.routeI = 0;
  p.stuck = 0;
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
  p.route = [mid, dest];
  p.routeI = 0;
  p.stuck = 0;
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
  // Sur la DALLE, pas seulement dans le repère du quai : descendu dans le hall,
  // le joueur n'est plus quelqu'un qu'on regarde, c'est quelqu'un qui est parti.
  const playerHere = onPlatformDeck();
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
  const dist = onPlatformDeck()
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
  const transit = p.state === 'arriving' || p.state === 'leaving';
  if (!transit && p.state !== 'waiting' && p.state !== 'ambling' && p.state !== 'patrolling') {
    return false;
  }
  endCrowdPair(p);
  clearCrowdAnchor(p);
  if (transit) {
    // On ne renonce pas à son train pour bavarder : le voyageur en route
    // s'arrête où il est, répond, et repart. `delay` est déjà ce qui
    // l'immobilise à une halte - il n'en fallait pas d'autre.
    p.delay = Math.max(p.delay, dur + 0.4);
  } else {
    p.state = 'waiting';
    p.home.copy(p.pos);
    p.route = [];
    p.routeI = 0;
  }
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
  if (p.state === 'arriving' || p.state === 'leaving') p.delay = Math.max(p.delay, dur + 0.4);
  return true;
}

/** Fin de l'échange : le voyageur reprend son attente, sa promenade, sa route. */
export function crowdStopTalking(id: number): void {
  const p = crowdList[id];
  if (!p || p.action !== 'talkPlayer') return;
  p.actionT = p.actionDur;
  if (p.state === 'arriving' || p.state === 'leaving') p.delay = 0;
}

/**
 * Peut-on adresser la parole à ce voyageur ?
 *
 * Une seule question, posée deux fois ailleurs (`systems/paxTargeting`, pour
 * viser et pour tenir l'échange) : est-il DE CE CÔTÉ-CI ? On ne parle pas à
 * travers la caisse d'une rame, pas à travers une dalle de béton, et pas à
 * quelqu'un dont on ne voit que les épaules au fond d'une trémie.
 *
 * Depuis que la foule descend dans le hall, la réponse ne se lit plus sur le
 * seul repère : il faut le MÊME ÉTAGE. Et l'inverse est vrai aussi - descendu
 * au niveau des portillons, on peut demander sa route à qui fait la queue au
 * konbini, ce qui n'était possible nulle part.
 */
export function crowdAddressable(p: CrowdPax): boolean {
  if (p.staff || p.state === 'hidden' || p.state === 'boarding' || p.state === 'attending') {
    return false;
  }
  if (runtime.playerFrame !== 'platform' || p.level !== runtime.playerLevel) return false;
  if (p.level === 'concourse') {
    // Engagé dans une bouche de sortie, il est déjà à moitié dans la rue.
    return p.y <= placement().interior.floorY + 0.05;
  }
  // Un voyageur dans une trémie est à moitié sous la dalle : hors de portée.
  if (p.y < -0.2) return false;
  return p.state === 'waiting' || p.state === 'ambling' || p.state === 'patrolling';
}

/**
 * Le corps qui vit sur place : tête, regard, buste, respiration.
 *
 * Sorti du bloc « attente » parce qu'une HALTE en vaut une autre : celui qui
 * s'arrête devant le rayon frais du konbini ou devant un distributeur de
 * titres n'est pas moins vivant que celui qui attend son train. Sans cela, le
 * hall se peuplait de mannequins arrêtés en pleine marche.
 */
function applyMotion(p: CrowdPax, dt: number, partner: CrowdPax | null = null): void {
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

/**
 * Un pas, en contournant ce qui barre.
 *
 * Pas de physique - le dépôt s'en passe partout ailleurs et n'en a pas besoin
 * ici : quand le pas complet ne passe pas, on longe.
 *
 * LE PAS DE CÔTÉ SE FAIT AU PAS ENTIER, et c'est tout ce qui le distingue du
 * glissement du joueur (`systems/walkable`, `resolveMove`). Le joueur TIENT UNE
 * DIRECTION : lui rendre la composante qui passe est exactement ce qu'il
 * demande. Un voyageur, lui, VISE UN POINT, et sa composante latérale est
 * presque nulle - il marche droit vers son but. Réduit à cette composante-là,
 * il longeait l'obstacle à deux millimètres par seconde sans jamais en sortir :
 * c'est ce qu'on voyait quand le joueur s'arrêtait au milieu du couloir du
 * hall, une file entière massée contre lui sans le contourner. Le pas de côté
 * vaut donc un pas, et l'on essaie les deux côtés.
 *
 * @returns false si rien ne passe : l'appelant décide alors quoi faire.
 */
function stepAround(p: CrowdPax, pl: StationPlacement, dx: number, dz: number): boolean {
  const { x, z } = p.pos;
  // Les battants ARRÊTENT, et pas seulement le joueur (`systems/walkable`) :
  // un voyageur qui n'a pas encore posé sa carte se heurte au vantail rabattu
  // devant lui, exactement comme nous. Celui qui vient de valider passe - sans
  // quoi la baie se refermerait sur celui-là même qu'elle laisse entrer.
  const free = (cx: number, cz: number) =>
    !walkerBlocked(pl, p.level, cx, cz)
    && !(p.level === 'concourse' && gateShutFor(cx, cz, p.gateOkT > 0));
  if (free(x + dx, z + dz)) {
    p.pos.x = x + dx;
    p.pos.z = z + dz;
    return true;
  }
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  // L'axe du pas d'abord - c'est là qu'on veut aller -, l'autre ensuite, dans
  // le sens qui rapproche du but puis dans celui qui en éloigne : contourner
  // par la mauvaise main vaut mieux que ne pas contourner.
  const alongZ = Math.abs(dz) >= Math.abs(dx);
  const sx = dx >= 0 ? 1 : -1;
  const sz = dz >= 0 ? 1 : -1;
  const tries: readonly [number, number][] = alongZ
    ? [[0, sz * len], [sx * len, 0], [-sx * len, 0]]
    : [[sx * len, 0], [0, sz * len], [0, -sz * len]];
  // Le pas de côté cherche D'ABORD celui qui dégage vraiment : longer une
  // emprise au ras de sa frontière, c'est la frôler pendant tout le temps qu'on
  // met à en sortir. Ce qui est trop juste reste permis - un couloir de hall ne
  // se traverse pas autrement - mais en second choix.
  for (const tight of [false, true]) {
    for (const [ax, az] of tries) {
      if (tight ? !free(x + ax, z + az) : walkerCramped(pl, p.level, x + ax, z + az)) continue;
      p.pos.x = x + ax;
      p.pos.z = z + az;
      return true;
    }
  }
  return false;
}

/**
 * Distance à laquelle on voit venir ce qui barre : un peu plus d'un pas.
 *
 * C'est la moitié du défaut, et la plus visible : un voyageur marchait DROIT
 * sur le poteau jusqu'à le toucher, et ne s'en écartait qu'une fois collé
 * dessus, deux centimètres par image, l'épaule dedans pendant tout le
 * décalage. Personne ne marche comme cela. On voit la chose venir, et l'on
 * infléchit son cap AVANT.
 */
const DECOR_LOOK = 0.8;

/** Écarts de cap essayés, du plus doux au plus franc (radians). */
const DECOR_TURNS = [0.3, 0.6, 0.9, 1.2, 1.55];

/**
 * Infléchir son cap pour passer À CÔTÉ de ce qu'on a devant soi.
 *
 * On regarde un point en avant du pas : s'il est trop juste, on cherche le cap
 * le plus proche du sien qui dégage, en essayant les deux mains. À écart égal
 * c'est celle du BORD DE QUAI qui l'emporte, parce que c'est de ce côté qu'il y
 * a la place - c'est déjà l'ordre de `AWAY`, et celui d'un quai réel, dont
 * l'épine est au fond.
 *
 * La portée est bornée par ce qu'il reste à parcourir : une halte se prend
 * souvent au ras d'une chose - le rayon d'un konbini, un distributeur de titres
 * -, et se détourner du but à un demi-mètre de lui reviendrait à ne jamais y
 * arriver.
 */
function skirtDecor(
  p: CrowdPax,
  pl: StationPlacement,
  ux: number,
  uz: number,
  dist: number,
): [number, number] {
  const look = Math.min(DECOR_LOOK, dist);
  if (look < 0.05) return [ux, uz];
  const clear = (kx: number, kz: number) =>
    !walkerCramped(pl, p.level, p.pos.x + kx * look, p.pos.z + kz * look);
  if (clear(ux, uz)) return [ux, uz];
  for (const a of DECOR_TURNS) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const hands: [number, number][] = [
      [ux * c - uz * s, ux * s + uz * c],
      [ux * c + uz * s, -ux * s + uz * c],
    ];
    // Le bord de quai d'abord : la main dont le cap tire vers les x faibles.
    if (hands[1][0] < hands[0][0]) hands.reverse();
    for (const [rx, rz] of hands) if (clear(rx, rz)) return [rx, rz];
  }
  return [ux, uz];
}

/**
 * Distance à laquelle on commence à s'écarter de quelqu'un qu'on a devant soi.
 * Un pas et demi : de quoi infléchir sa marche sans avoir l'air de l'éviter.
 */
const SKIRT_R = 1.45;

/**
 * Validité d'un coup de carte, du côté du voyageur.
 *
 * Large : ce n'est pas un compte à rebours qu'on regarde passer, c'est de quoi
 * franchir les trois mètres qui séparent le lecteur de l'autre bord de la
 * ligne même en se faisant contourner en chemin. Ce qui referme réellement la
 * baie, c'est de N'ÊTRE PLUS DEVANT - au-delà de `CLOSE_AT`, le portillon ne
 * voit plus personne et se rouvre tout seul.
 */
const GATE_CROSS = 6;

/**
 * Contourner le joueur, plutôt que buter dedans.
 *
 * LE JOUEUR N'EST PAS UNE EMPRISE DU DÉCOR : `systems/stationLevels` ne le
 * connaît pas, et l'écart qu'il impose (`avoidPlayer`) est un RECUL - le
 * voyageur est repoussé à soixante centimètres, à chaque image, sans jamais
 * changer de cap. Les deux ensemble faisaient un équilibre parfait : le
 * voyageur avançait de deux centimètres vers son but, se faisait repousser
 * d'autant, et recommençait. Debout au milieu du couloir du hall, on voyait
 * une file entière s'immobiliser dans son dos jusqu'à ce qu'on bouge.
 *
 * Le cap s'infléchit donc TANGENTIELLEMENT, d'autant plus qu'on est près, et
 * du côté où l'on penche déjà. C'est ce que fait n'importe qui dans un couloir,
 * et cela ne coûte qu'une rotation.
 */
function skirtPlayer(p: CrowdPax, ux: number, uz: number): [number, number] {
  if (runtime.playerFrame !== 'platform' || runtime.playerLevel !== p.level) return [ux, uz];
  const dx = runtime.playerPlatX - p.pos.x;
  const dz = runtime.playerPlatZ - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > SKIRT_R || d < 1e-4) return [ux, uz];
  const nx = dx / d;
  const nz = dz / d;
  const ahead = ux * nx + uz * nz;
  // Il est franchement derrière : rien à contourner.
  if (ahead <= -0.1) return [ux, uz];
  // La TANGENTE, c'est-à-dire ce qui reste du cap une fois retirée la part
  // qui pointe vers lui. Prise ainsi, elle va toujours de l'avant : de face
  // elle s'annule (et l'on prend alors une perpendiculaire franche), de côté
  // elle vaut le cap lui-même - on ne fait donc pas demi-tour autour de
  // quelqu'un qu'on est en train de doubler, ce qui remettait la file en
  // boucle devant lui.
  let tx = ux - ahead * nx;
  let tz = uz - ahead * nz;
  let t = Math.hypot(tx, tz);
  if (t < 0.2) {
    // Pile en face : on choisit une main, et c'est celle du côté où le
    // couloir est le plus large qui se trouve être aussi celle de la marche.
    tx = -nz;
    tz = nx;
    t = 1;
  }
  const k = Math.min(1, (SKIRT_R - d) / Math.max(0.1, SKIRT_R - PLAYER_CLEARANCE));
  const mx = ux * (1 - k) + (tx / t) * k;
  const mz = uz * (1 - k) + (tz / t) * k;
  const m = Math.hypot(mx, mz);
  return m < 1e-6 ? [ux, uz] : [mx / m, mz / m];
}

/**
 * Ce qu'on fait en arrivant à une étape : s'arrêter, regarder, valider.
 *
 * Le coup de carte au portillon est le seul de ces gestes qui sorte du
 * personnage : il fait le ピッ, allume le feu de la borne et rouvre la baie
 * qui vient de se rabattre devant lui (`systems/fareGate`). C'est le son d'un
 * hall de gare japonaise, et il ne s'entend que de près.
 *
 * L'étape de validation est DEVANT la ligne, du côté d'où l'on vient
 * (`systems/concourseRoute`) : on bipe avant de s'engager, jamais après.
 */
function applyStop(p: CrowdPax, s: RouteStop): void {
  if (s.tap !== undefined) {
    const d = runtime.playerLevel === 'concourse'
      ? Math.hypot(p.pos.x - runtime.playerPlatX, p.pos.z - runtime.playerPlatZ)
      : 99;
    paxTapGate(s.tap, d);
    // De quoi traverser : au-delà, la validation retombe et la baie se referme
    // derrière soi, comme elle le fait pour le joueur.
    p.gateOkT = GATE_CROSS;
  }
  if (!s.hold) return;
  p.delay = s.hold;
  p.bob = 0;
  p.action = s.action ?? 'none';
  p.actionT = 0;
  p.actionDur = s.hold;
  if (s.yaw !== undefined) p.targetYaw = s.yaw;
}

/** Le joueur est-il assez près pour écarter ce voyageur de son chemin ? */
function pushedByPlayer(p: CrowdPax): boolean {
  if (runtime.playerFrame !== 'platform' || runtime.playerLevel !== p.level) return false;
  const d = Math.hypot(p.pos.x - runtime.playerPlatX, p.pos.z - runtime.playerPlatZ);
  return d < PLAYER_CLEARANCE + 0.4;
}

/**
 * A-t-on DÉPASSÉ le point qu'on visait ?
 *
 * Cela n'arrive pas en marchant : on s'arrête dessus. Cela arrive quand on
 * s'est fait écarter juste après l'avoir visé - le joueur qui se tient dans le
 * couloir repousse à soixante centimètres (`avoidPlayer`), et si le point
 * était plus près que cela, on se retrouve DERRIÈRE lui. Sans cette clause, on
 * revenait le chercher, on se faisait repousser, et l'on recommençait pour
 * toujours : une file entière figée dans le dos du joueur, à un mètre d'un
 * point de passage déjà franchi.
 *
 * Une HALTE ne se dépasse pas, elle : on va vraiment poser sa carte sur le
 * lecteur du portillon, et vraiment devant le rayon qu'on voulait voir.
 */
function passedStop(p: CrowdPax): boolean {
  const wp = p.route[p.routeI];
  const next = p.route[p.routeI + 1];
  if (!wp || !next || wp.hold || wp.tap !== undefined) return false;
  // ET SEULEMENT SOUS LA POUSSÉE DU JOUEUR. Ailleurs, un voyageur ne dépasse
  // pas son point de passage - il s'arrête dessus -, et laisser la règle jouer
  // partout reviendrait à autoriser les raccourcis : celui qui longe la
  // vitrine du konbini viserait le rayon suivant à travers le verre.
  if (!pushedByPlayer(p)) return false;
  const leg = Math.hypot(next.x - wp.x, next.z - wp.z);
  const left = Math.hypot(next.x - p.pos.x, next.z - p.pos.z);
  return left + 0.15 < leg;
}

/**
 * Ce point est-il OCCUPÉ par le joueur ?
 *
 * Alors on ne l'atteindra jamais : l'écart qu'il impose est plus large que ce
 * qui reste à parcourir, et l'on resterait à quinze centimètres de son but
 * pour l'éternité - debout dans l'axe du couloir, on bloquait ainsi tout un
 * flux sans le savoir. Le voyageur fait donc ce que fait n'importe qui : il
 * considère qu'il y est, et passe à la suite. La carte se pose de là où il
 * est, et le portillon ne s'en offusque pas.
 */
function stopTakenByPlayer(p: CrowdPax, wp: RouteStop): boolean {
  if (runtime.playerFrame !== 'platform' || runtime.playerLevel !== p.level) return false;
  const d = Math.hypot(wp.x - runtime.playerPlatX, wp.z - runtime.playerPlatZ);
  return d < PLAYER_CLEARANCE + 0.05;
}

function advanceWalk(p: CrowdPax, dt: number, pl: StationPlacement, onDone: () => void): void {
  while (passedStop(p)) p.routeI++;
  const wp = p.route[p.routeI];
  if (!wp) {
    onDone();
    return;
  }
  const dx = wp.x - p.pos.x;
  const dz = wp.z - p.pos.z;
  const dist = Math.hypot(dx, dz);
  const step = WALK_SPEED * dt;
  const reached = dist <= step
    || (dist < PLAYER_CLEARANCE + 0.35 && stopTakenByPlayer(p, wp));
  if (reached) {
    // On ne se POSE sur le point que si on l'a vraiment rejoint : s'y
    // téléporter parce que le joueur s'y tient reviendrait à lui rentrer
    // dedans.
    if (dist <= step) p.pos.set(wp.x, 0, wp.z);
    p.routeI++;
    p.stuck = 0;
    applyStop(p, wp);
    if (p.routeI >= p.route.length) onDone();
  } else {
    // Le joueur d'abord - il bouge, et c'est lui qu'on a dans les jambes -,
    // puis le décor, qui ne bouge pas mais qu'on doit voir venir.
    const [px, pz] = skirtPlayer(p, dx / dist, dz / dist);
    const [sx, sz] = skirtDecor(p, pl, px, pz, dist);
    const ux = sx * step;
    const uz = sz * step;
    if (stepAround(p, pl, ux, uz)) {
      p.stuck = 0;
      // Le cap suit le pas RÉELLEMENT fait, pas celui qu'on voulait faire :
      // quelqu'un qui longe un banc regarde là où il va.
      p.targetYaw = Math.atan2(ux, uz);
      p.bob = Math.abs(Math.sin(p.bobPhase * 9.5)) * 0.028;
    } else {
      // Coincé : on renonce à cette étape-là plutôt que de piétiner. Le cas est
      // rare - les points d'itinéraire sont posés sur du sol libre - mais un
      // voyageur qui bourdonne contre un poteau pour l'éternité se verrait.
      p.stuck += dt;
      if (p.stuck > 1.2) {
        p.stuck = 0;
        p.routeI++;
        if (p.routeI >= p.route.length) onDone();
      }
    }
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

function avoidPlayer(p: CrowdPax, dt: number, pvx: number, pvz: number, pl: StationPlacement): void {
  // Même repère ET même étage : de l'autre côté d'une dalle de béton, il n'y a
  // personne à esquiver.
  if (runtime.playerFrame !== 'platform' || runtime.playerLevel !== p.level) {
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
  if (p.state === 'boarding' || p.state === 'attending') return;

  // L'écart reste SUR DU SOL : sans borne, insister contre quelqu'un le
  // poussait par-dessus le nez de quai, dans la voie, au travers du mur de
  // fond ou d'une vitrine de konbini - un voyageur ne recule pas dans le vide
  // pour nous laisser passer. `stepAround` s'en charge exactement comme pour
  // un pas ordinaire : ce qui ne passe pas, ne passe pas.
  const push = (PLAYER_CLEARANCE - d) / d;
  stepAround(p, pl, dx * push, dz * push);

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
  // La vitesse du joueur ne sert qu'à l'esquive : sous la dalle, il n'y a
  // personne à esquiver.
  if (prevPlatInit && onPlatformDeck()) {
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
    if (!p.staff) avoidPlayer(p, dt, pvx, pvz, currentPlacement);

    // L'agent de quai : il accourt, puis il ne bouge plus - face à la porte,
    // à celui qui la bloque.
    if (p.state === 'attending') {
      if (p.routeI < p.route.length) {
        advanceWalk(p, dt * (AGENT_RUN / WALK_SPEED), currentPlacement, () => {
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
      p.y = floorYAt(currentPlacement, p);
      continue;
    }

    // Transits : arrivée par la trémie ou par la rue, départ vers la sortie,
    // montée en rame.
    if (p.state === 'arriving' || p.state === 'leaving' || p.state === 'boarding') {
      if (p.gateOkT > 0) p.gateOkT -= dt;
      // SE DÉCLARER À LA LIGNE, à chaque sous-pas et même à l'arrêt : c'est ce
      // qui fait claquer les battants devant celui qui s'approche sans avoir
      // bipé, et c'est ce qui les tient écartés le temps qu'il traverse une
      // fois qu'il l'a fait (`systems/fareGate`). La halte compte autant que la
      // marche - on reste devant le lecteur une demi-seconde, la baie fermée.
      if (p.inStation && p.level === 'concourse') {
        paxNearGate(p.pos.x, p.pos.z, p.gateOkT > 0);
      }
      if (p.delay > 0) {
        // Une halte : devant un rayon du konbini, au distributeur de titres,
        // le temps de passer sa carte. Le corps y vit comme celui d'un
        // voyageur en attente - sinon la gare est pleine de mannequins.
        p.delay -= dt;
        applyMotion(p, dt);
        if (p.delay <= 0 && p.action !== 'none') {
          p.action = 'none';
          p.actionT = 0;
          p.actionDur = 1;
        }
      } else {
        advanceWalk(p, dt, currentPlacement, () => {
          // Le trajet est fini : la place qu'il occupait dans la gare se
          // libère, qu'il ait rejoint le quai, la rame ou la rue.
          p.inStation = false;
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
          p.route = [];
          p.routeI = 0;
        });
        // Les marches se descendent vraiment : l'altitude suit le profil de la
        // volée, et l'étage bascule à mi-parcours. On ne s'efface PAS à une
        // altitude donnée - le voyageur s'évaporait alors en pleine volée, la
        // tête au niveau du quai, sous les yeux de qui se penche dans la
        // trémie. Il marche jusqu'au bout de son dernier point de passage : le
        // fond d'un couloir borgne, ou le haut de la volée d'une bouche de
        // sortie. C'est le bâti qui le cache, et l'effacement ne se voit plus.
        p.y = floorYAt(currentPlacement, p);
      }
      let dy = p.targetYaw - p.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 5);
      continue;
    }

    if (p.state === 'patrolling') {
      advanceWalk(p, dt, currentPlacement, () => {
        // Bout du quai : demi-tour et nouveau trajet.
        p.walkDir = p.walkDir > 0 ? -1 : 1;
        p.laneX = clamp(p.laneX + (Math.random() - 0.5) * 0.35, bounds().x0 + 0.15, bounds().x1 - 0.15);
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
      advanceWalk(p, dt, currentPlacement, () => {
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
        applyMotion(p, dt, partner);
        p.targetYaw = -Math.PI / 2 + p.lookYaw * 0.35;
      }
    }

    let d = p.targetYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d * Math.min(1, dt * 5);
  }
}
