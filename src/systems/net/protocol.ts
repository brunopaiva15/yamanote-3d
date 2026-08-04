// Ce qui passe sur le fil entre deux voyageurs du même salon.
//
// Un seul fichier pour toutes les formes de messages, et il ne dépend de RIEN :
// ni du store, ni du runtime, ni de Supabase. C'est voulu. Un protocole qui
// importe l'état qu'il décrit finit toujours par le décrire de travers - et
// surtout, celui-ci doit pouvoir se tester sous `node --test`, sans navigateur
// et sans moteur de rendu. Les deux seuls imports sont des imports de TYPE, que
// TypeScript efface à la compilation : ils ne créent aucune arête réelle dans
// le graphe de dépendances (voir tests/netSourceGuards).
//
// --- Pourquoi des entiers ---------------------------------------------------
//
// Les poses voyagent quantifiées : les mètres en centimètres, les radians en
// centièmes. Ce n'est PAS pour la bande passante - le canal transporte du JSON
// et une pose pèse cent vingt octets de toute façon. C'est pour que deux
// clients qui reçoivent le même message calculent la même position au bit près,
// et pour qu'un journal de mise au point reste lisible : « 412 » se lit,
// « 4.1200000000000001 » ne se lit pas.
//
// --- Pourquoi une version ---------------------------------------------------
//
// Le jeu est déployé en continu sur GitHub Pages et personne ne recharge son
// onglet. Deux versions du protocole cohabiteront donc forcément un jour dans
// le même salon. Tout message dont la version ne correspond pas est ignoré EN
// SILENCE : un onglet resté ouvert sur la version d'hier ne doit pas empoisonner
// une rame, et il ne doit pas non plus remplir la console de ceux qui roulent.

import type { LoopDirection } from '../../data/platforms';
import type { Phase } from '../../store';

/**
 * Version du protocole. À incrémenter dès qu'un champ change de sens, de nom ou
 * d'unité - jamais « au cas où ». Un incrément coupe la parole entre un onglet
 * ancien et un onglet neuf, ce qui est exactement le but, mais ce n'est pas
 * gratuit : le joueur voit ses camarades disparaître sans comprendre.
 *
 * Version 2 : `yw` a changé de SENS. Il portait un cap de caméra - donc nié -
 * là où le rendu attend un cap de corps, si bien que chaque avatar distant
 * était dessiné d'un demi-tour de travers : on marchait droit et les autres
 * vous voyaient reculer. Un onglet resté sur la version 1 et un onglet neuf se
 * verraient mutuellement à l'envers, ce qui est exactement le cas que la
 * version est là pour trancher. `hd` arrive dans la même vague.
 */
export const PROTOCOL_VERSION = 2;

/** Nombre de voyageurs qu'un salon accepte (voir room.ts : plafond consultatif). */
export const ROOM_CAPACITY = 8;

/** Longueur maximale d'un message de tchat, après nettoyage. */
export const CHAT_MAX_LENGTH = 140;

// --- Repères ---------------------------------------------------------------
//
// Deux entiers plutôt que deux chaînes, et ils ne disent pas la même chose.
// `PoseFrame` est un repère de COORDONNÉES (le wagon glisse, le quai est
// épinglé, ou l'inverse) ; `PoseLevel` est un ÉTAGE dans la gare. On peut être
// dans le repère du quai et se tenir trois mètres cinquante plus bas, dans le
// hall de correspondance - c'est même le cas courant. Voir systems/runtime.

/** 0 = repère du wagon, 1 = repère du quai. */
export type PoseFrame = 0 | 1;
/** 0 = dalle du quai, 1 = hall de correspondance. */
export type PoseLevel = 0 | 1;

// --- Présence : qui est là, et à quoi il ressemble --------------------------

/**
 * Ce qu'un onglet annonce de lui-même dans le canal. Publié une fois à
 * l'arrivée, puis seulement quand il change - la présence n'est pas un flux.
 */
export interface PresencePayload {
  v: number;
  /** Identifiant d'onglet ; aussi la clé de présence Supabase. */
  id: string;
  /**
   * Instant d'arrivée. C'est LUI qui élit l'hôte (voir hostElection), et c'est
   * pour ça qu'il est publié plutôt que déduit : l'ordre dans lequel Supabase
   * rend son `presenceState()` n'est pas garanti stable, et une élection qui
   * changerait d'avis au gré d'un tri de clés ferait clignoter l'autorité.
   */
  joinedAt: number;
  /** Prénom affiché, déjà nettoyé et borné par l'émetteur. */
  name: string;
  /**
   * Graine d'apparence, passée telle quelle à `makeAppearance()`.
   *
   * Publiée par l'émetteur et JAMAIS recalculée par le récepteur, même si on
   * pourrait la dériver de l'identifiant : un joueur doit pouvoir savoir de
   * quoi il a l'air, et deux voyageurs qui ne se voient pas pareil ne sont pas
   * dans le même monde.
   */
  avatar: number;
  /** Version du jeu : l'expérience complète, ou la version sonore. */
  mode: 'full' | 'audio';
  /**
   * Ce voyageur est-il encore dans LA rame du salon ?
   *
   * Faux dès qu'il a laissé la rame partir sans lui : il continue de jouer et
   * de discuter, mais son monde n'est plus celui des autres, et il ne peut plus
   * être élu hôte (voir systems/net/hostElection).
   */
  attached: boolean;
}

// --- Pose : où chacun se tient ---------------------------------------------

/**
 * Une pose sur le fil. Tout est entier (voir en-tête du fichier).
 *
 * Les coordonnées sont dans le repère LOCAL de l'émetteur, jamais en monde :
 * le monde vaut « repère wagon + runtime.trainZ », et `trainZ` ne vaut pas la
 * même chose selon qu'on est à bord ou sur le quai. Envoyer du monde
 * reviendrait à envoyer une position déjà fausse pour la moitié des
 * destinataires.
 */
export interface PosePayload {
  v: number;
  from: string;
  /** Horloge de l'émetteur (ms). Sert au tampon d'interpolation, pas à l'ordre. */
  t: number;
  f: PoseFrame;
  lv: PoseLevel;
  /** Gare dont le quai est sous ses pieds (0..29). Ignoré si `f` vaut 0. */
  st: number;
  /** Position, en centimètres entiers, dans le repère `f`. */
  x: number;
  y: number;
  z: number;
  /** Lacet et tangage, en centièmes de radian. */
  yw: number;
  pt: number;
  /** Assis. */
  s: 0 | 1;
  /** En marche : de quoi balancer les jambes sans transmettre une vitesse. */
  mv: 0 | 1;
  /**
   * L'objet tenu en main : l'identifiant du produit acheté, ou la chaîne vide.
   *
   * L'identifiant plutôt qu'une forme et une couleur, parce que le catalogue
   * (data/products) est le même des deux côtés du fil : un mot de six lettres
   * suffit à retrouver la silhouette ET l'étiquette, et le jour où le rayon
   * s'enrichit il n'y a rien à renuméroter. Il voyage dans la pose et non dans
   * la présence parce qu'il se REGARDE : il doit apparaître et disparaître avec
   * le corps qui le tient, sur le même canal et avec le même retard.
   */
  hd: string;
}

/** La même pose, en unités du jeu : ce que le rendu consomme. */
export interface Pose {
  t: number;
  frame: PoseFrame;
  level: PoseLevel;
  station: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  seated: boolean;
  moving: boolean;
  /** Identifiant du produit tenu en main, ou chaîne vide. */
  held: string;
}

const CM = 100;
const CRAD = 100;

/**
 * Longueur maximale d'un identifiant de produit accepté.
 *
 * Les identifiants du catalogue tiennent en une dizaine de caractères ; on
 * borne largement au-dessus, et l'on REJETTE au-delà plutôt que de tronquer -
 * un identifiant tronqué ne désigne rien, et le chercher au catalogue coûterait
 * une comparaison de chaîne par image pour un objet qui n'existe pas.
 */
const HELD_ID_MAX = 24;

/** Pose du jeu → pose du fil. */
export function encodePose(from: string, p: Pose): PosePayload {
  return {
    v: PROTOCOL_VERSION,
    from,
    t: Math.round(p.t),
    f: p.frame,
    lv: p.level,
    st: p.station | 0,
    x: Math.round(p.x * CM),
    y: Math.round(p.y * CM),
    z: Math.round(p.z * CM),
    yw: Math.round(p.yaw * CRAD),
    pt: Math.round(p.pitch * CRAD),
    s: p.seated ? 1 : 0,
    mv: p.moving ? 1 : 0,
    hd: p.held,
  };
}

/** Pose du fil → pose du jeu. */
export function decodePose(m: PosePayload): Pose {
  return {
    t: m.t,
    frame: m.f,
    level: m.lv,
    station: m.st,
    x: m.x / CM,
    y: m.y / CM,
    z: m.z / CM,
    yaw: m.yw / CRAD,
    pitch: m.pt / CRAD,
    seated: m.s === 1,
    moving: m.mv === 1,
    held: m.hd,
  };
}

// --- Battement de l'hôte ----------------------------------------------------

/**
 * L'état de la ligne, deux fois par seconde. Ce n'est PAS ce qui fait tourner
 * le monde chez les suiveurs - eux déroulent la même chronologie que l'hôte,
 * localement, à partir des tirages reçus. Ce battement ne sert qu'à rattraper
 * la dérive (voir reconcile) et à faire entrer les retardataires.
 */
export interface TickPayload {
  v: number;
  from: string;
  /** Compteur monotone : on jette tout battement plus vieux que le dernier vu. */
  seq: number;
  ph: Phase;
  /** `runtime.phaseT`, en millisecondes entières. */
  pt: number;
  /** `index` et `platformIndex` : la gare visée, et le quai qu'on longe. */
  ix: number;
  pix: number;
  ds: 1 | -1;
  dir: LoopDirection;
  /** Vitesse (mm/s), accélération (mm/s²), distances (cm) : entiers. */
  sp: number;
  ac: number;
  di: number;
  dsd: number;
  /** Horloge du monde, en centièmes de minute. */
  ck: number;
  /** Date civile à Tokyo : année, mois, jour, jour de semaine. */
  dt: [number, number, number, number];
  ss: number;
  /** Blocages de départ, en champ de bits (voir BLOCKER_BITS). */
  bl: number;
}

/**
 * Les cinq blocages de départ, un bit chacun.
 *
 * Un champ de bits plutôt que cinq booléens : ils voyagent deux fois par
 * seconde et par joueur, et surtout ils se lisent ensemble ou pas du tout -
 * `departureSequence` ne demande jamais « la porte est-elle bloquée ? » mais
 * « quelque chose retient-il la rame ? ».
 */
export const BLOCKER_BITS = {
  doorBlocked: 1,
  heldAtStation: 2,
  signalStop: 4,
  emergency: 8,
  passengerAssistance: 16,
} as const;

// --- Les tirages d'un arrêt -------------------------------------------------

/**
 * Ce que l'hôte a tiré au sort pour l'arrêt qui commence.
 *
 * Émis à l'entrée en freinage, soit une vingtaine de secondes avant que le
 * premier de ces nombres ne serve à quoi que ce soit. C'est cette marge qui
 * permet de se passer d'accusé de réception : un paquet perdu a le temps d'être
 * redemandé (`hello`) avant que son absence ne s'entende.
 *
 * Ce paquet porte les TIRAGES, jamais leurs conséquences. C'est la cohérence de
 * tout l'édifice : le suiveur déroule la même chronologie que l'hôte à partir
 * du même code, il n'a donc besoin que de ce que ce code aurait tiré au sort.
 * Lui envoyer une durée de dwell déjà calculée reviendrait à dire deux fois la
 * même chose, et à ouvrir la porte au jour où les deux ne diraient plus pareil.
 *
 * `seed` porte les trente-huit retards de vantaux à lui tout seul : au-delà de
 * trois tirages liés, on transmet la graine et non les valeurs.
 *
 * Une réserve connue, et assumée pour l'instant : `randomizeStopTimings` lit
 * aussi `lineDelayed()`, qui n'est pas encore répliqué. Une perturbation de
 * ligne qui frapperait un seul client décalerait sa mélodie de deux secondes.
 * C'est rare, ça se rattrape au battement suivant, et le corriger demande de
 * répliquer tout `systems/lineDisruption` - un chantier à lui seul.
 */
export interface StopPayload {
  v: number;
  from: string;
  /** Arrêt auquel ces tirages s'appliquent : on ne les applique pas à un autre. */
  ss: number;
  ix: number;
  /** Graine des retards de vantaux (rame et portes palières). */
  seed: number;
  /** Écart d'arrêt, en millimètres signés. */
  berth: number;
  /** Décalage de l'instant de la mélodie, en millionièmes (donc [-1e6, 1e6]). */
  jitter: number;
  /** La rame se range-t-elle sur la voie secondaire ? */
  alt: 0 | 1;
  /** Un rapide traversera-t-il pendant cet arrêt ? */
  pass: 0 | 1;
}

// --- Événements rares -------------------------------------------------------

/**
 * Ce qui n'arrive pas assez souvent pour mériter une place dans le battement.
 *
 * `hello` est le seul qui remonte d'un suiveur vers l'hôte : « je viens
 * d'arriver, redites-moi tout ». L'hôte y répond par un battement hors cadence
 * et le paquet de tirages courant.
 */
export type EventPayload =
  | { v: number; from: string; k: 'emergency'; hold: number; reason: number }
  | { v: number; from: string; k: 'outage'; hold: number; coast: number }
  | { v: number; from: string; k: 'blockers'; bits: number }
  | { v: number; from: string; k: 'disruption'; seed: string; force: boolean }
  | { v: number; from: string; k: 'hello' }
  | { v: number; from: string; k: 'detach' }
  | { v: number; from: string; k: 'attach' };

// --- La population : qui est à bord, et qui attend sur le quai --------------

/**
 * Les gens, par opposition au monde.
 *
 * C'est le seul message du protocole qui porte un ÉTAT plutôt que des tirages,
 * et la raison mérite d'être dite ici : les voyageurs sont une simulation à
 * état, pas une chronologie. Deux clients partis de deux rames différemment
 * peuplées ne convergeraient jamais, quand bien même ils tireraient les mêmes
 * nombres. Il faut donc bien, une fois par arrêt, se mettre d'accord sur qui
 * est là - et l'effectif lui-même dépend de la qualité vidéo choisie, ce
 * qu'aucune graine commune ne rattrape.
 *
 * Il ne porte QUE l'identité et la place. Ce que chacun fait - téléphone,
 * regard, discussion - reste tiré localement : personne ne remarquera jamais
 * que son camarade a vu le même voyageur bâiller une seconde plus tard, et le
 * répliquer coûterait plus que tout le reste du protocole réuni.
 */
export interface PopPayload {
  v: number;
  from: string;
  /** Gare dont le quai porte cette foule : on n'applique pas celle d'à côté. */
  st: number;
  /** Rame : identité et place, deux entiers par voyageur du pool. */
  px: number[];
  /** Quai : effectif, promeneurs, puis une identité par place du pool. */
  cr: number[];
}

/**
 * Bornes de taille des deux listes.
 *
 * Le pool de la rame fait quatre-vingt-seize places et celui du quai quarante ;
 * on double avant de crier au loup, et l'on REJETTE au-delà plutôt que de
 * tronquer - une liste tronquée décrirait une rame à moitié vide, ce qui est
 * pire que pas de liste du tout.
 */
const POP_PAX_MAX = 400;
const POP_CROWD_MAX = 200;

// --- Tchat ------------------------------------------------------------------

export interface ChatPayload {
  v: number;
  from: string;
  /** Compteur local de l'émetteur : dédoublonne une retransmission. */
  id: number;
  text: string;
  t: number;
}

// --- Réception : ne jamais faire confiance au fil ---------------------------
//
// Un salon est privé et sur invitation, mais « privé » ne veut pas dire
// « correct ». Un onglet d'une autre version, un message tronqué par une
// coupure, un pair modifié pour rire : tout cela arrive, et le rendu ne doit
// jamais recevoir un NaN. Les validateurs ci-dessous rejettent au lieu de
// corriger - un message douteux est un message qu'on n'a pas reçu.

function isFiniteInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n);
}

/**
 * Version reconnue ? Commun à tous les messages, présence comprise.
 *
 * Séparé du contrôle d'émetteur ci-dessous parce que la présence, elle, ne
 * porte pas de champ `from` : son émetteur EST sa clé de présence (`id`), et
 * Supabase la garantit. Les avoir confondus a coûté un test rouge, ce qui est
 * exactement le prix qu'on veut payer pour ce genre de confusion.
 */
function sameVersion(m: unknown): m is { v: number } {
  if (typeof m !== 'object' || m === null) return false;
  return (m as Record<string, unknown>).v === PROTOCOL_VERSION;
}

/** Version reconnue ET émetteur nommé : le cas des messages de diffusion. */
function fromKnownPeer(m: unknown): m is { v: number; from: string } {
  if (!sameVersion(m)) return false;
  const from = (m as Record<string, unknown>).from;
  return typeof from === 'string' && from.length > 0;
}

/** Bornes physiques de la pose : au-delà, ce n'est plus une position du jeu. */
const POS_MAX_CM = 40_000; // 400 m : le quai fait 224 m, la marge est large
const ANGLE_MAX = 1_000; // ±10 rad en centièmes : plus large que ±π, on ne juge pas

/** Une pose reçue est-elle exploitable ? */
export function validPose(m: unknown): m is PosePayload {
  if (!fromKnownPeer(m)) return false;
  const r = m as Record<string, unknown>;
  if (!isFiniteInt(r.t)) return false;
  if (r.f !== 0 && r.f !== 1) return false;
  if (r.lv !== 0 && r.lv !== 1) return false;
  if (r.s !== 0 && r.s !== 1) return false;
  if (r.mv !== 0 && r.mv !== 1) return false;
  if (typeof r.hd !== 'string' || r.hd.length > HELD_ID_MAX) return false;
  if (!isFiniteInt(r.st) || (r.st as number) < 0 || (r.st as number) > 29) return false;
  for (const k of ['x', 'y', 'z'] as const) {
    const v = r[k];
    if (!isFiniteInt(v) || Math.abs(v as number) > POS_MAX_CM) return false;
  }
  for (const k of ['yw', 'pt'] as const) {
    const v = r[k];
    if (!isFiniteInt(v) || Math.abs(v as number) > ANGLE_MAX) return false;
  }
  return true;
}

const PHASES: readonly string[] = ['cruise', 'brake', 'dwell', 'depart'];

/** Un battement reçu est-il exploitable ? */
export function validTick(m: unknown): m is TickPayload {
  if (!fromKnownPeer(m)) return false;
  const r = m as Record<string, unknown>;
  if (!isFiniteInt(r.seq) || (r.seq as number) < 0) return false;
  if (typeof r.ph !== 'string' || !PHASES.includes(r.ph)) return false;
  if (r.dir !== 'inner' && r.dir !== 'outer') return false;
  if (r.ds !== 1 && r.ds !== -1) return false;
  for (const k of ['ix', 'pix'] as const) {
    const v = r[k];
    if (!isFiniteInt(v) || (v as number) < 0 || (v as number) > 29) return false;
  }
  for (const k of ['pt', 'sp', 'ac', 'di', 'dsd', 'ck', 'ss', 'bl'] as const) {
    if (!isFiniteInt(r[k])) return false;
  }
  if (!Array.isArray(r.dt) || r.dt.length !== 4 || !r.dt.every(isFiniteInt)) return false;
  return true;
}

/** Un paquet de tirages reçu est-il exploitable ? */
export function validStop(m: unknown): m is StopPayload {
  if (!fromKnownPeer(m)) return false;
  const r = m as Record<string, unknown>;
  if (!isFiniteInt(r.ix) || (r.ix as number) < 0 || (r.ix as number) > 29) return false;
  if (r.alt !== 0 && r.alt !== 1) return false;
  if (r.pass !== 0 && r.pass !== 1) return false;
  for (const k of ['ss', 'seed', 'berth', 'jitter'] as const) {
    if (!isFiniteInt(r[k])) return false;
  }
  // Le décalage de mélodie est un tirage dans [-1, 1] : hors de ces bornes, il
  // décalerait l'instant de la 発車メロディ de plusieurs secondes, ce qui
  // allongerait ou raccourcirait l'arrêt d'autant. Mieux vaut ignorer le paquet
  // et rester sur la valeur nominale.
  if (Math.abs(r.jitter as number) > 1_000_000) return false;
  // Onze centimètres est le maximum physique (voir stationCycle) ; on laisse
  // une marge de dix avant de crier au loup.
  if (Math.abs(r.berth as number) > 1_000) return false;
  return true;
}

const EVENT_KINDS: readonly string[] = [
  'emergency',
  'outage',
  'blockers',
  'disruption',
  'hello',
  'detach',
  'attach',
];

/** Un événement reçu est-il exploitable ? */
export function validEvent(m: unknown): m is EventPayload {
  if (!fromKnownPeer(m)) return false;
  const r = m as Record<string, unknown>;
  if (typeof r.k !== 'string' || !EVENT_KINDS.includes(r.k)) return false;
  if (r.k === 'emergency') return isFiniteInt(r.hold) && isFiniteInt(r.reason);
  if (r.k === 'outage') return isFiniteInt(r.hold) && isFiniteInt(r.coast);
  if (r.k === 'blockers') return isFiniteInt(r.bits);
  if (r.k === 'disruption') return typeof r.seed === 'string' && typeof r.force === 'boolean';
  return true;
}

/**
 * Un message de tchat reçu est-il exploitable ?
 *
 * On ne vérifie PAS la longueur ici : le nettoyage (chatLimiter.sanitize) tronque
 * de toute façon, et rejeter un message trop long ferait taire quelqu'un qui a
 * simplement trop écrit. On rejette ce qui n'est pas un message.
 */
export function validChat(m: unknown): m is ChatPayload {
  if (!fromKnownPeer(m)) return false;
  const r = m as Record<string, unknown>;
  return isFiniteInt(r.id) && typeof r.text === 'string' && isFiniteInt(r.t);
}

/** Une population reçue est-elle exploitable ? */
export function validPop(m: unknown): m is PopPayload {
  if (!fromKnownPeer(m)) return false;
  const r = m as Record<string, unknown>;
  if (!isFiniteInt(r.st) || (r.st as number) < 0 || (r.st as number) > 29) return false;
  for (const [k, max] of [
    ['px', POP_PAX_MAX],
    ['cr', POP_CROWD_MAX],
  ] as const) {
    const v = r[k];
    if (!Array.isArray(v) || v.length > max) return false;
    // Un seul NaN dans la liste et c'est un voyageur posé nulle part, ou une
    // apparence que `makeAppearance` ne saura pas dériver.
    if (!v.every(isFiniteInt)) return false;
  }
  return true;
}

/** Une présence reçue est-elle exploitable ? */
export function validPresence(m: unknown): m is PresencePayload {
  if (!sameVersion(m)) return false;
  const r = m as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return false;
  if (typeof r.name !== 'string') return false;
  if (r.mode !== 'full' && r.mode !== 'audio') return false;
  if (typeof r.attached !== 'boolean') return false;
  return isFiniteInt(r.joinedAt) && isFiniteInt(r.avatar);
}
