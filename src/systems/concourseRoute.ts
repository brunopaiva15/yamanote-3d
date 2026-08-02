// Les itinéraires DANS la gare : de la dalle du quai à la rue, et retour.
//
// CE QUI MANQUAIT. La foule du quai savait faire deux choses avec une trémie :
// en sortir, et s'y enfoncer jusqu'à disparaître. Vu du quai, cela passait -
// c'est la dalle qui cache. Vu du HALL, où l'on descend maintenant, c'était le
// défaut le plus voyant du niveau : les gens apparaissaient et s'effaçaient au
// milieu du couloir, à trois mètres de nous, sans jamais franchir un portillon
// ni entrer nulle part. Une gare où personne ne passe le 改札 n'est pas une
// gare, c'est une maquette.
//
// CE QU'ON POSE ICI. Un itinéraire, c'est-à-dire une suite de points et de ce
// qu'on y fait : descendre, traverser la zone payante, VALIDER au portillon,
// ressortir côté libre, s'arrêter au konbini ou devant les distributeurs de
// titres, puis s'engager dans une bouche de sortie et monter jusqu'à passer
// derrière le linteau. Ce fichier ne fait marcher personne - c'est
// `systems/platformCrowd` qui tient les pieds - il dit seulement PAR OÙ.
//
// Repère : celui du quai, comme tout ce qui touche à la gare.
//
// UNE SEULE SOURCE, encore : les points se déduisent des mêmes rectangles que
// le rendu dessine et que la marche du joueur respecte (`data/stationInterior`,
// `data/konbiniPlan`). Rien n'est écrit en dur qui puisse s'en écarter, et le
// test vérifie que chaque point d'itinéraire est bien du sol.

import type { PaxAction } from '../data/paxActions';
import {
  EXIT_MOUTH_GOING,
  EXIT_MOUTH_STEPS,
  EXIT_MOUTH_Z0,
  PASSAGE_SLACK,
  shopPlan,
  shopToHall,
  type Fixture,
  type InteriorRect,
} from '../data/stationInterior';
import { ASCENT_LEN, DESCENT_LEN } from '../data/stationGeometry';
import { runtime } from './runtime';
import {
  bayAt,
  concourseBays,
  type ConcourseBay,
  type ConcourseNetwork,
  type ConcourseRoom,
} from '../data/stationConcourseBuild';
import { concourseFloorAt } from './stationLevels';
import { stairTopZ, type StationPlacement } from './stationPlacement';

/**
 * Une étape d'itinéraire : où l'on va, et ce qu'on y fait en arrivant.
 *
 * Un voyageur qui traverse un hall sans jamais s'arrêter n'est pas un
 * voyageur, c'est un convoyeur. Les arrêts sont donc de l'itinéraire, au même
 * titre que les points de passage.
 */
export interface RouteStop {
  x: number;
  z: number;
  /** Secondes d'immobilité en arrivant. */
  hold?: number;
  /** Occupation tenue pendant l'arrêt. */
  action?: PaxAction;
  /** Cap tenu pendant l'arrêt (repère quai) ; sinon, celui de la marche. */
  yaw?: number;
  /** Passage de portillon à valider en arrivant : c'est le ピッ. */
  tap?: number;
}

/** Où commence un arrivant : en haut de la volée d'une bouche de sortie. */
export interface StreetDoor {
  x: number;
  z: number;
  /** Bouche empruntée, pour que le retour prenne la même. */
  exit: number;
}

/**
 * Cette gare a-t-elle un intérieur où l'on puisse aller ?
 *
 * Un niveau déclaré mais non bâti (Nippori) n'en a pas : ses voyageurs
 * continuent de s'effacer dans la trémie, ce qui reste juste tant qu'il n'y a
 * rien dessous à leur montrer.
 */
export function stationInteriorOpen(p: StationPlacement): boolean {
  return p.network.built && p.network.mouths.length > 0;
}

// --- LE REPÈRE D'UNE PIÈCE ------------------------------------------------
//
// Un hall se parcourt d'un bout à l'autre, et « d'un bout à l'autre » n'a plus
// de sens fixe : un hall longitudinal se longe en z, une passerelle
// transversale se traverse en x. Le routeur ne peut donc plus supposer l'axe -
// c'était le constat S3 du plan.
//
// ET L'AXE NE SE DEVINE PAS : il se LIT sur ce vers quoi l'on marche. Un trajet
// de zone payante va vers une ligne de portillons, donc il suit l'axe qu'on la
// franchit (`GateGroup.cross`) ; un trajet de zone libre va vers une bouche,
// donc il suit l'axe de la paroi qu'elle perce (`ConcourseMouth.side`). C'est
// la même leçon qu'à la phase 8, où la pente d'une volée ne se déduisait pas de
// la forme de son rectangle : la géométrie ne dit pas où l'on va, la
// destination si.

/** Un point du repère quai, sans le reste d'une étape. */
interface Pt { x: number; z: number }

/** Compose un point depuis une coordonnée le long de l'axe et une en travers. */
function pt(along: 'x' | 'z', at: number, across: number): Pt {
  return along === 'z' ? { x: across, z: at } : { x: at, z: across };
}

const alongOf = (along: 'x' | 'z', q: Pt) => (along === 'z' ? q.z : q.x);
const acrossOf = (along: 'x' | 'z', q: Pt) => (along === 'z' ? q.x : q.z);

/** Longueur de l'accès principal, dans le sens où il va. */
/**
 * Le pied de l'accès qui dessert cette pièce payante.
 *
 * L'itinéraire commençait toujours à la trémie principale, seule à mener
 * quelque part (constat G3). Une gare peut en avoir deux — à Harajuku, les
 * deux ensembles ne se rejoignent QUE par le quai — et le voyageur prend alors
 * celle qui donne sur SA zone payante, pas celle du milieu du quai.
 */
function accessFoot(p: StationPlacement, roomId: string): RouteStop | null {
  const a = p.liveAccesses.find((x) => x.toRoomId === roomId);
  if (!a) return null;
  const len = a.rise === 'up' ? ASCENT_LEN : DESCENT_LEN;
  return { x: a.stair.x + stairLane() * 0.35, z: stairTopZ(a.stair) + len - 0.5 };
}

/** La zone payante que dessert une baie. */
function paidRoomOf(net: ConcourseNetwork, bay: ConcourseBay): ConcourseRoom | null {
  const g = net.gates.find((x) => x.id === bay.gateId);
  return net.rooms.find((r) => r.id === g?.from && r.walkable) ?? null;
}

/** L'écart au nu de la paroi, `steps` girons plus haut dans la volée. */
function mouthZ(steps: number): number {
  return EXIT_MOUTH_Z0 + EXIT_MOUTH_GOING * steps;
}

/**
 * Le haut de la volée d'une bouche : là où le linteau a fini de couper.
 *
 * On ne s'efface pas à découvert - c'est la règle des trémies de quai, et elle
 * vaut ici : le voyageur monte jusqu'au dernier giron, où l'on ne voit plus de
 * lui que ce que le percement laisse voir, c'est-à-dire rien.
 */
function mouthTop(): number {
  return mouthZ(EXIT_MOUTH_STEPS - 0.5);
}

/** Le sol du hall existe-t-il sous ce point ? (même règle que la marche) */
function clear(p: StationPlacement, x: number, z: number): boolean {
  return concourseFloorAt(p, x, z) !== null;
}

// --- L'AXE DU HALL -------------------------------------------------------
//
// Un hall de gare se traverse par le MILIEU, et ce milieu n'est pas celui des
// murs : c'est celui de ce que le mobilier laisse. Le konbini fait 3,40 m de
// fond dans un couloir qui en fait cinq et demi - l'axe géométrique du hall
// tombe DANS la boutique. Un itinéraire qui s'y accrocherait entrerait par la
// vitrine.
//
// D'où cette famille de fonctions : on longe la bande libre, mesurée à chaque
// pas, et l'on ne s'en écarte que face à ce qu'on va voir. C'est aussi ce qui
// donne aux trajets leur allure - on ne traverse pas un hall en ligne droite,
// on louvoie entre les distributeurs.

/**
 * Pas de la polyligne d'axe, et demi-fenêtre de mesure. Les deux sont liés :
 * en mesurant sur ±`AXIS_STEP` autour de chaque point, la bande d'un segment
 * contient les deux abscisses qui le bornent, donc le segment entier. C'est ce
 * qui rend le chemin sûr sans avoir à le vérifier après coup.
 */
const AXIS_STEP = 1.2;

/**
 * Ce qui borne le couloir, du point de vue de QUELQU'UN QUI PASSE.
 *
 * Ce n'est pas tout à fait la liste des obstacles. Une BOUTIQUE y compte pour
 * son emprise entière et non pour ses meubles : sa devanture est percée d'une
 * baie, et un couloir calculé sur ses seuls solides se faufilait dans
 * l'entrée du konbini - la bande libre s'ouvrait jusqu'à la gondole, trois
 * mètres plus loin, et l'axe du hall partait faire les courses. On entre dans
 * une boutique parce qu'on y va, jamais parce qu'on passe devant.
 */
const HALL_EDGES = new WeakMap<ConcourseNetwork, InteriorRect[]>();

function hallEdges(net: ConcourseNetwork): InteriorRect[] {
  const hit = HALL_EDGES.get(net);
  if (hit) return hit;
  const shops = net.fixtures.filter((f) => f.kind === 'konbini' || f.kind === 'gallery');
  const inShop = (o: InteriorRect) =>
    shops.some((s) => o.x0 >= s.rect.x0 - 1e-6 && o.x1 <= s.rect.x1 + 1e-6
      && o.z0 >= s.rect.z0 - 1e-6 && o.z1 <= s.rect.z1 + 1e-6);
  const out = [...net.obstacles.filter((o) => !inShop(o)), ...shops.map((s) => s.rect)];
  HALL_EDGES.set(net, out);
  return out;
}

/**
 * Milieu de la bande libre du hall, au droit de `z` (± une demi-fenêtre).
 *
 * La ligne de portillons est SAUTÉE : elle barre d'un mur à l'autre, et l'on
 * ne la franchit pas par le milieu mais par un passage - c'est l'affaire de
 * `paidLegs`, qui pose le point de validation lui-même.
 */
function hallAxis(
  p: StationPlacement,
  room: ConcourseRoom,
  along: 'x' | 'z',
  at: number,
  near = Infinity,
  half = AXIS_STEP,
): number {
  const r = room.rect;
  // Les bornes du couloir sont celles de la PIÈCE, en travers de l'axe qu'on
  // longe. C'était `paid.x0 / paid.x1` tant qu'il n'y avait qu'un hall et
  // qu'on le longeait en z.
  const [lo, hi] = along === 'z' ? [r.x0, r.x1] : [r.z0, r.z1];
  const span = (o: InteriorRect) => (along === 'z'
    ? [o.z0, o.z1, o.x0, o.x1]
    : [o.x0, o.x1, o.z0, o.z1]) as [number, number, number, number];
  // Ce que le mobilier laisse LIBRE à cette hauteur-là : une suite de
  // trouées, et non une bande unique. Le calcul en « une borne à gauche, une
  // borne à droite » se retournait contre lui-même dès que deux meubles
  // débordaient l'axe géométrique chacun de son côté : les deux bornes se
  // croisaient, et leur milieu tombait dans l'un des deux.
  const taken = hallEdges(p.network)
    .filter((o) => {
      const [a0, a1] = span(o);
      // Les lignes de portillons sont SAUTÉES, toutes : elles barrent d'un mur
      // à l'autre, et l'on ne les franchit pas par le milieu mais par une baie.
      const onLine = p.network.gates.some((g) => o.x0 <= g.rect.x1 && o.x1 >= g.rect.x0
        && o.z0 <= g.rect.z1 && o.z1 >= g.rect.z0);
      return a1 > at - half && a0 < at + half && !onLine;
    })
    .map((o) => {
      const [, , c0, c1] = span(o);
      return [Math.max(c0, lo), Math.min(c1, hi)] as const;
    })
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cur = lo;
  for (const [a, b] of taken) {
    if (a > cur) gaps.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < hi) gaps.push([cur, hi]);
  if (gaps.length === 0) return (lo + hi) / 2;
  // La trouée où l'on est DÉJÀ l'emporte sur la plus large : le couloir ne
  // saute pas d'un côté du hall à l'autre entre deux pas, ce qui traverserait
  // ce qu'il y a entre les deux. À défaut, la plus large.
  const here = gaps.find((g) => near >= g[0] && near <= g[1]);
  const best = here ?? gaps.reduce((m, g) => (g[1] - g[0] > m[1] - m[0] ? g : m));
  return (best[0] + best[1]) / 2;
}

/** Un point posé sur l'axe de `room`, au droit de `at`. */
function onAxis(
  p: StationPlacement,
  room: ConcourseRoom,
  along: 'x' | 'z',
  at: number,
  extra?: Partial<RouteStop>,
): RouteStop {
  return { ...pt(along, at, hallAxis(p, room, along, at)), ...extra };
}

/** Le chemin qui longe l'axe, de `a0` (exclu) à `a1` (inclus). */
function axisPath(
  p: StationPlacement,
  room: ConcourseRoom,
  along: 'x' | 'z',
  a0: number,
  a1: number,
): RouteStop[] {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / AXIS_STEP));
  let across = hallAxis(p, room, along, a0);
  return Array.from({ length: n }, (_, i) => {
    const at = a0 + (a1 - a0) * ((i + 1) / n);
    across = hallAxis(p, room, along, at, across);
    return pt(along, at, across);
  });
}

/**
 * Longueur de file qu'un passage porte : au-delà, on n'y est pas encore.
 *
 * Six mètres devant la ligne, c'est ce qu'une baie tient sans que sa file
 * déborde dans la voisine. Le fuseau LATÉRAL, lui, est celui du portillon
 * lui-même (`PASSAGE_SLACK`) : on regarde la ligne comme elle nous regarde.
 */
const LANE_QUEUE = 6;

/**
 * Ce que le joueur occupe de la ligne : le passage devant lequel il se tient.
 *
 * -1 s'il est ailleurs, ou entre deux baies. Les battants se ferment devant
 * qui n'a pas validé, et le joueur qui hésite devant sa borne n'a pas à voir
 * quelqu'un traverser des vantaux rabattus : sa baie n'est pas à prendre.
 */
function playerLane(net: ConcourseNetwork): number {
  if (runtime.playerLevel !== 'concourse') return -1;
  const hit = bayAt(net, runtime.playerPlatX, runtime.playerPlatZ, PASSAGE_SLACK);
  if (!hit || hit.gap > LANE_QUEUE) return -1;
  return hit.bay.index;
}

/**
 * Le passage de portillon qu'un voyageur emprunte : celui qui est LIBRE.
 *
 * On ne choisit pas sa baie en la calculant, on la choisit en regardant : on
 * vise celle devant laquelle il n'y a personne, et l'on prend la voisine si
 * quelqu'un s'y engage déjà. Toute la ligne se remplit ainsi, alors qu'une
 * règle fixe - « la plus loin du joueur » - envoyait la gare entière dans le
 * même vantail, l'un derrière l'autre, la ligne d'à côté déserte.
 *
 * `busy` dit combien de voyageurs se dirigent déjà vers chaque passage
 * (`systems/platformCrowd`, `passageLoad`). Il PÈSE sans interdire : deux
 * files se forment très bien dans un hall chargé, et une gare où l'on ne
 * verrait jamais personne attendre son tour serait fausse dans l'autre sens.
 *
 * Le passage LARGE est celui qu'on laisse à qui pousse une valise : il se tire
 * moins souvent, sans jamais s'exclure.
 */
function pickPassage(net: ConcourseNetwork, busy: readonly number[]): number {
  const bays = concourseBays(net);
  const n = bays.length;
  if (n === 0) return -1;
  const mine = playerLane(net);
  // UNE BAIE QU'AUCUN ACCÈS NE DESSERT N'EST PAS À PRENDRE : on ne peut pas
  // arriver devant. C'est le pendant de G3 côté itinéraire - tant qu'il n'y
  // avait qu'un accès vivant, la question ne se posait pas.
  const served = bays.map((b) => {
    const room = paidRoomOf(net, b);
    return !!room && net.accesses.some((a) => a.toRoomId === room.id);
  });
  if (!served.some(Boolean)) return -1;
  const weights = bays.map((b, i) => {
    if (i === mine || !served[i]) return 0;
    // Une bretelle À SENS UNIQUE ne se prend qu'en sortant, et l'on ne sait pas
    // encore ici dans quel sens on va : elle pèse moins, sans s'exclure.
    return (b.wide ? 0.55 : 1) * (b.exitOnly ? 0.5 : 1) / (1 + 3 * (busy[i] ?? 0));
  });
  let total = weights.reduce((a, w) => a + w, 0);
  // Tout est pris - ou le joueur bouche la seule baie de la gare. On tire alors
  // au hasard plein parmi celles qu'on peut atteindre : mieux vaut faire la
  // queue derrière quelqu'un que de ne plus jamais franchir de portillon.
  if (total <= 1e-6) {
    served.forEach((ok, i) => { weights[i] = ok ? 1 : 0; });
    total = weights.reduce((a, w) => a + w, 0);
  }
  let r = Math.random() * total;
  for (let i = 0; i < n; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return n - 1;
}

/**
 * Bouche de sortie tirée au sort, avec un écart latéral dans sa largeur.
 *
 * Elle s'ouvre dans une PAROI, et plus forcément celle du fond : le sens vers
 * lequel on monte se lit de `side`, et le décalage latéral court le long de la
 * paroi. Dans un hall longitudinal cela redonne exactement l'ancien point.
 */
function pickExit(net: ConcourseNetwork): StreetDoor {
  const k = Math.floor(Math.random() * net.mouths.length);
  const m = net.mouths[k];
  const room = net.rooms.find((r) => r.id === m.roomId)!;
  const lane = m.at + (Math.random() - 0.5) * Math.max(0, m.halfWidth * 2 - 0.9);
  const top = mouthTop();
  const r = room.rect;
  const q = m.side === 'z1' ? { x: lane, z: r.z1 + top }
    : m.side === 'z0' ? { x: lane, z: r.z0 - top }
      : m.side === 'x1' ? { x: r.x1 + top, z: lane }
        : { x: r.x0 - top, z: lane };
  return { ...q, exit: k };
}

// --- Les haltes du hall --------------------------------------------------

/** Ce qu'on regarde en passant, et combien de temps on s'y attarde. */
const BROWSE: { kind: Fixture['kind']; action: PaxAction; dur: [number, number] }[] = [
  { kind: 'ticket', action: 'ticketGlance', dur: [6, 12] },
  { kind: 'fareAdjust', action: 'ticketGlance', dur: [7, 13] },
  { kind: 'lockers', action: 'rummageBag', dur: [6, 11] },
  { kind: 'map', action: 'mapCheck', dur: [5, 10] },
  { kind: 'stamp', action: 'read', dur: [8, 15] },
  { kind: 'office', action: 'none', dur: [8, 16] },
  { kind: 'vending', action: 'drink', dur: [6, 11] },
  { kind: 'vendingFood', action: 'eat', dur: [6, 11] },
  { kind: 'notice', action: 'read', dur: [5, 11] },
];

/**
 * Une halte devant un meuble du hall, ou null s'il n'y a pas la place.
 *
 * On se poste devant sa FAÇADE, à un demi-pas, tourné vers elle : c'est la
 * seule position qui se lise pour ce qu'elle est. Le point est vérifié comme
 * tout le reste - un distributeur adossé à un pilastre peut n'avoir personne
 * devant lui, et mieux vaut une halte de moins qu'une halte dans un poteau.
 */
function browseStop(p: StationPlacement, f: Fixture): RouteStop | null {
  const spec = BROWSE.find((b) => b.kind === f.kind);
  if (!spec) return null;
  const x = f.facing === 1 ? f.rect.x1 + 0.52 : f.rect.x0 - 0.52;
  const z = (f.rect.z0 + f.rect.z1) / 2 + (Math.random() - 0.5) * Math.min(1.2, f.rect.z1 - f.rect.z0);
  if (!clear(p, x, z)) return null;
  return {
    x,
    z,
    hold: spec.dur[0] + Math.random() * (spec.dur[1] - spec.dur[0]),
    action: spec.action,
    // Face au meuble : `yaw` se compte comme un cap de marche, atan2(dx, dz).
    yaw: f.facing === 1 ? -Math.PI / 2 : Math.PI / 2,
  };
}

/**
 * Un CROCHET : on quitte l'axe au droit de quelque chose, et on y revient.
 *
 * `z` est l'abscisse où l'on s'écarte, et c'est tout ce que le chemin a besoin
 * de savoir : le déplacement en travers du hall se fait là, perpendiculaire à
 * l'axe, jamais en diagonale devant une rangée de meubles.
 */
interface Detour {
  /** Où l'on quitte l'axe, en coordonnée LE LONG de l'axe du trajet. */
  at: number;
  stops: RouteStop[];
}

/** Une halte tirée parmi les meubles d'une zone, ou rien. */
function browseIn(
  p: StationPlacement,
  along: 'x' | 'z',
  a0: number,
  a1: number,
  chance: number,
): Detour | null {
  if (Math.random() >= chance) return null;
  const lo = Math.min(a0, a1);
  const hi = Math.max(a0, a1);
  const bounds = (f: Fixture) => (along === 'z'
    ? [f.rect.z0, f.rect.z1]
    : [f.rect.x0, f.rect.x1]);
  const here = p.network.fixtures.filter((f) => {
    const [b0, b1] = bounds(f);
    return b0 >= lo - 0.01 && b1 <= hi + 0.01 && BROWSE.some((b) => b.kind === f.kind);
  });
  if (here.length === 0) return null;
  const stop = browseStop(p, here[Math.floor(Math.random() * here.length)]);
  return stop ? { at: alongOf(along, stop), stops: [stop] } : null;
}

/** Longe l'axe de `a0` à `a1`, avec un crochet éventuel en chemin. */
function hallLeg(
  p: StationPlacement,
  room: ConcourseRoom,
  along: 'x' | 'z',
  a0: number,
  a1: number,
  detour: Detour | null,
): RouteStop[] {
  if (!detour) return axisPath(p, room, along, a0, a1);
  return [
    ...axisPath(p, room, along, a0, detour.at),
    ...detour.stops,
    onAxis(p, room, along, detour.at),
    ...axisPath(p, room, along, detour.at, a1),
  ];
}

// --- Le konbini ----------------------------------------------------------

/** Le konbini du hall, s'il y en a un. */
function shopOf(net: ConcourseNetwork): Fixture | null {
  return net.fixtures.find((f) => f.kind === 'konbini') ?? null;
}

/**
 * La visite du konbini : on entre, on regarde, on paie, on ressort.
 *
 * L'ORDRE N'EST PAS DÉCORATIF. La boutique est étroite - trente centimètres de
 * passage au plus serré, entre le bac à glaces et la vitrine - et ses trois
 * couloirs ne se rejoignent qu'en deux endroits. Cet enchaînement-là est celui
 * qui les emprunte tous sans jamais traverser un meuble ; un client qui
 * couperait au plus court sortirait par la gondole.
 *
 * Les points viennent de `data/konbiniPlan`, comme les meubles qu'ils évitent.
 */
function shopVisit(f: Fixture, along: 'x' | 'z'): Detour {
  const s = shopPlan(f).stops;
  const at = (l: { x: number; z: number }, extra?: Partial<RouteStop>): RouteStop => {
    const q = shopToHall(f, l.x, l.z);
    return { x: q.x, z: q.z, ...extra };
  };
  const door = at(s.door);
  // Vers le FOND de la boutique : c'est de ce côté que sont les vitrines
  // réfrigérées, la gondole et le comptoir, donc de ce côté qu'on regarde à
  // chaque halte. Un client arrêté devant un rayon en lui tournant le dos ne
  // se lit pas comme un client. (Le repère de la boutique tourne d'un quart de
  // tour dans le hall - voir `shopToHall` - donc un « vers -z » local devient
  // un cap à l'équerre, dans un sens ou dans l'autre selon la paroi.)
  const inward = f.facing === 1 ? -Math.PI / 2 : Math.PI / 2;
  // Le rayon qu'on vient voir. Le devant de la gondole se traverse de toute
  // façon - c'est le seul chemin vers la caisse, le goulet des magazines ne
  // débouche que là - mais on ne s'y ARRÊTE pas toujours.
  const cold = Math.random() < 0.7;
  const browse = Math.random() < 0.75 || !cold;
  const out: RouteStop[] = [door, at(s.entry)];
  if (cold) {
    out.push(at(s.cold, { hold: 4 + Math.random() * 7, action: 'look', yaw: inward }));
    out.push(at(s.entry));
  }
  out.push(at(s.gap));
  out.push(browse
    ? at(s.aisle, { hold: 5 + Math.random() * 8, action: 'read', yaw: inward })
    : at(s.aisle));
  // La caisse, toujours : on ne ressort pas d'un konbini les mains vides.
  out.push(at(s.till, { hold: 5 + Math.random() * 5, action: 'none', yaw: inward }));
  out.push(at(s.aisle));
  out.push(at(s.gap));
  out.push(at(s.entry));
  out.push(door);
  return { at: alongOf(along, door), stops: out };
}

// --- Les deux itinéraires ------------------------------------------------

/** Écart latéral dans la volée : on ne descend pas tous dans le même axe. */
function stairLane(): number {
  return (Math.random() - 0.5) * 1.3;
}

/**
 * Bandes libres de tout meuble, aux deux bouts de chaque zone.
 *
 * Le moteur de rangement du hall laisse une marge de 1,10 m à chaque bout
 * (`ZONE_MARGIN`, data/stationInterior) : rien ne s'y pose, jamais. C'est là,
 * et seulement là, qu'on se décale de l'axe vers un passage de portillon ou
 * vers une bouche de sortie - partout ailleurs, un déplacement en travers du
 * hall passerait devant une rangée de meubles.
 */
const ZONE_EDGE = 0.75;

/**
 * La zone payante, du bas des marches à la ligne de portillons.
 *
 * ON VALIDE DU CÔTÉ D'OÙ L'ON VIENT, et c'est tout le sujet : le lecteur d'un
 * portillon est sur le dessus de la borne, à l'entrée du passage, et la carte
 * s'y pose AVANT de s'engager - jamais après. Celui qui entre en gare arrive
 * de la zone libre, donc il bipe côté libre (`freeSide`) ; celui qui sort
 * arrive de la zone payante, donc il bipe côté payant (`paidSide`). Les deux
 * points sont posés dans la marge où le mobilier ne descend pas, à un pas de
 * la ligne : de quoi voir le geste, et de quoi laisser aux battants le temps
 * de s'écarter avant qu'on les atteigne.
 */
function paidLegs(
  p: StationPlacement,
  bay: ConcourseBay,
  inbound: boolean,
): RouteStop[] | null {
  const net = p.network;
  const room = net.rooms.find((r) => r.id === net.gates.find((g) => g.id === bay.gateId)?.from);
  if (!room?.walkable) return null;
  // ON MARCHE VERS LA LIGNE, donc sur l'axe qu'on la franchit. Dans un hall
  // longitudinal c'est z, comme avant ; dans une passerelle transversale c'est
  // x, et rien d'autre ne change.
  const axis = bay.cross;
  const lane = acrossOf(axis, bay);
  const r = room.rect;
  const [g0, g1] = axis === 'z' ? [bay.rect.z0, bay.rect.z1] : [bay.rect.x0, bay.rect.x1];
  const [r0, r1] = axis === 'z' ? [r.z0, r.z1] : [r.x0, r.x1];
  // De quel côté de la ligne se tient la zone payante ? C'est elle qui décide
  // où l'on bipe en sortant, et où l'on ressort en entrant.
  const low = (r0 + r1) / 2 < (g0 + g1) / 2;
  const paidAt = low ? g0 - ZONE_EDGE : g1 + ZONE_EDGE;
  const freeAt = low ? g1 + ZONE_EDGE : g0 - ZONE_EDGE;
  const paidSide = pt(axis, paidAt, lane);
  const freeSide = pt(axis, freeAt, lane);
  const foot = low ? r0 + ZONE_EDGE : r1 - ZONE_EDGE;
  const zone: [number, number] = low ? [r0, g0] : [g1, r1];
  const tap = { tap: bay.index, hold: 0.55, action: 'ticketGlance' as PaxAction };
  if (inbound) {
    // On arrive de la zone libre : on valide devant la ligne, on la franchit,
    // puis on remonte la zone payante vers l'accès.
    return [
      { ...freeSide, ...tap },
      paidSide,
      onAxis(p, room, axis, paidAt),
      ...hallLeg(p, room, axis, paidAt, foot, browseIn(p, axis, zone[0], zone[1], 0.18)),
    ];
  }
  return [
    onAxis(p, room, axis, foot),
    ...hallLeg(p, room, axis, foot, paidAt, browseIn(p, axis, zone[0], zone[1], 0.22)),
    { ...paidSide, ...tap },
    freeSide,
  ];
}

/** La zone libre, des portillons aux bouches de sortie. */
function freeLegs(
  p: StationPlacement,
  door: StreetDoor,
  inbound: boolean,
): RouteStop[] | null {
  const net = p.network;
  const m = net.mouths[door.exit];
  const room = net.rooms.find((r) => r.id === m?.roomId);
  if (!m || !room?.walkable) return null;
  // ON MARCHE VERS LA BOUCHE, donc sur l'axe de la paroi qu'elle perce.
  const axis: 'x' | 'z' = m.side === 'z0' || m.side === 'z1' ? 'z' : 'x';
  const r = room.rect;
  const [lo, hi] = axis === 'z' ? [r.z0, r.z1] : [r.x0, r.x1];
  const toHigh = m.side === 'z1' || m.side === 'x1';
  const a0 = toHigh ? lo + ZONE_EDGE : hi - ZONE_EDGE;
  const a1 = toHigh ? hi - ZONE_EDGE : lo + ZONE_EDGE;
  const mouth = pt(axis, a1, acrossOf(axis, door));
  const shop = shopOf(net);
  const detour = shop && Math.random() < 0.34
    ? shopVisit(shop, axis)
    : browseIn(p, axis, lo, hi, 0.4);
  return inbound
    ? [mouth, onAxis(p, room, axis, a1), ...hallLeg(p, room, axis, a1, a0, detour)]
    : [onAxis(p, room, axis, a0), ...hallLeg(p, room, axis, a0, a1, detour), mouth];
}

/**
 * Du quai à la rue : la trémie, le hall, un portillon, une bouche de sortie.
 *
 * L'itinéraire commence DANS la volée : le raccord entre le bord du quai et
 * son nez appartient à celui qui l'emprunte, qui seul sait d'où il vient
 * (`systems/platformCrowd`, `stairApron`). Le dernier point est en haut de la
 * volée d'une bouche - au-delà, il n'y a plus rien à montrer, et c'est là que
 * le voyageur s'efface.
 *
 * `busy` est la charge de chaque passage de portillon (voir `pickPassage`) :
 * on prend une baie libre plutôt que de se ranger derrière quelqu'un.
 */
export function routeToStreet(p: StationPlacement, busy: readonly number[] = []): RouteStop[] | null {
  if (!stationInteriorOpen(p)) return null;
  const passage = pickPassage(p.network, busy);
  if (passage < 0) return null;
  const bay = concourseBays(p.network)[passage];
  const door = pickExit(p.network);
  const room = paidRoomOf(p.network, bay);
  const foot = room && accessFoot(p, room.id);
  const paid = paidLegs(p, bay, false);
  const free = freeLegs(p, door, false);
  if (!paid || !free || !foot) return null;
  return [
    // Le bas de l'accès : l'étage bascule tout seul en chemin
    // (systems/stationLevels), personne n'a à le décider ici.
    foot,
    ...paid,
    ...free,
    { x: door.x, z: door.z },
  ];
}

/**
 * De la rue au quai : l'inverse, jusqu'au pied des marches.
 *
 * L'itinéraire s'arrête DANS la volée, symétriquement de `routeToStreet` : ce
 * qui suit - déboucher sur la dalle et gagner sa place d'attente devant une
 * porte - est l'affaire de la foule du quai, qui sait déjà le faire.
 */
export function routeFromStreet(
  p: StationPlacement,
  busy: readonly number[] = [],
): { from: StreetDoor; stops: RouteStop[] } | null {
  if (!stationInteriorOpen(p)) return null;
  const passage = pickPassage(p.network, busy);
  if (passage < 0) return null;
  const bay = concourseBays(p.network)[passage];
  const door = pickExit(p.network);
  const room = paidRoomOf(p.network, bay);
  const foot = room && accessFoot(p, room.id);
  const free = freeLegs(p, door, true);
  const paid = paidLegs(p, bay, true);
  if (!paid || !free || !foot) return null;
  return {
    from: door,
    stops: [...free, ...paid, foot],
  };
}
