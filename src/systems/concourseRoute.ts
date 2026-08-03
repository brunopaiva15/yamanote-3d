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
import { ASCENT_LEN, CLEAR_HALL, descentLenTo } from '../data/stationGeometry';
import { runtime } from './runtime';
import {
  bayAt,
  concourseBays,
  shellsOf,
  type ConcourseBay,
  type ConcourseNetwork,
  type ConcourseRoom,
} from '../data/stationConcourseBuild';
import { concourseFloorAt, walkerBlocked } from './stationLevels';
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
  const a = accessServing(p, roomId);
  if (!a) return null;
  // La volée aboutit au sol de SA pièce : cinq gares descendent deux mètres
  // vingt-cinq plus loin que les autres (`data/stationGeometry`).
  const len = a.rise === 'up' ? ASCENT_LEN : descentLenTo(a.floorY);
  return { x: a.stair.x + stairLane() * 0.35, z: stairTopZ(a.stair) + len - 0.5 };
}

/**
 * L'accès qui dessert une pièce — DIRECTEMENT, OU PAR CE QUI LA JOINT.
 *
 * Une trémie ne débouche pas toujours dans la zone payante : à Okachimachi elle
 * arrive sur une MEZZANINE, un demi-niveau ouvert d'où l'on redescend au hall.
 * Chercher un accès attaché à la zone payante n'en trouvait aucun, et la gare
 * n'avait plus ni itinéraire d'entrée ni itinéraire de sortie.
 */
function accessServing(p: StationPlacement, roomId: string) {
  const direct = p.liveAccesses.find((x) => x.toRoomId === roomId);
  if (direct) return direct;
  return p.liveAccesses.find((x) => reachableRooms(p.network, x.toRoomId).has(roomId)) ?? null;
}

/** Les pièces qu'on atteint depuis celle-ci, de volée en volée. */
function reachableRooms(net: ConcourseNetwork, from: string): Set<string> {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const here = queue.shift()!;
    for (const j of net.joins) {
      if (!j.walkable) continue;
      const next = j.from === here ? j.to : j.to === here ? j.from : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Le chemin d'ouvrages entre deux pièces : une étape par volée franchie.
 *
 * L'altitude s'interpole toute seule dans la volée (`systems/stationLevels`,
 * `joinFloorAt`) : il suffit de poser un point au milieu de chacune, plus un
 * juste avant et un juste après pour y entrer droit.
 */
function joinLegs(net: ConcourseNetwork, from: string, to: string): RouteStop[] | null {
  if (from === to) return [];
  const prev = new Map<string, { via: string; join: ConcourseNetwork['joins'][number] }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const here = queue.shift()!;
    if (here === to) break;
    for (const j of net.joins) {
      if (!j.walkable) continue;
      const next = j.from === here ? j.to : j.to === here ? j.from : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { via: here, join: j });
      queue.push(next);
    }
  }
  if (!seen.has(to)) return null;
  const chain: ConcourseNetwork['joins'] = [];
  for (let at = to; at !== from;) {
    const step = prev.get(at);
    if (!step) return null;
    chain.unshift(step.join);
    at = step.via;
  }
  return chain.map((j) => ({
    x: (j.rect.x0 + j.rect.x1) / 2,
    z: (j.rect.z0 + j.rect.z1) / 2,
  }));
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

/**
 * LE DERNIER MOT SUR UN ITINÉRAIRE : qu'il ne traverse rien.
 *
 * Tout ce qui précède choisit des files, anticipe les obstacles et se décale
 * avant eux. Cela suffit dans un couloir ; cela ne suffit pas toujours dans une
 * gare branchée, où une palissade de chantier déplace un couloir de dix mètres
 * d'un coup et où deux vitrines se répondent à travers un hall.
 *
 * Cette passe relit le tracé comme la marche le parcourra : segment par
 * segment, au pas de trente centimètres. Là où un segment traverse, elle
 * essaie les deux CHEMINS EN ÉQUERRE — d'abord en travers puis tout droit, ou
 * l'inverse — et garde le premier qui passe. C'est ce que fait un piéton devant
 * un obstacle qu'il n'avait pas vu : il contourne à angle droit.
 *
 * Elle ne remplace pas le choix de file : une file bien choisie ne produit
 * aucune équerre, et c'est le cas de la quasi-totalité des trajets.
 */
function walkable(p: StationPlacement, a: Pt, b: Pt): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3));
  for (let i = 1; i <= n; i++) {
    const x = a.x + (b.x - a.x) * (i / n);
    const z = a.z + (b.z - a.z) * (i / n);
    // LA MÊME RÈGLE QUE LA MARCHE, et pas une approximation : `clear` ne
    // regarde que le sol, or ce qui arrête un voyageur est le mobilier, les
    // bornes et les palissades — avec leur garde.
    if (walkerBlocked(p, 'concourse', x, z)) return false;
  }
  return true;
}

function weave(p: StationPlacement, stops: RouteStop[]): RouteStop[] {
  const out: RouteStop[] = [stops[0]];
  for (let k = 1; k < stops.length; k++) {
    const a = out[out.length - 1];
    const b = stops[k];
    // Les deux bouts d'un trajet sont hors du hall — le pied d'une volée, le
    // haut d'une bouche — et n'ont pas de sol de hall sous eux par définition.
    const inside = k > 1 && k < stops.length - 1;
    if (!inside || walkable(p, a, b)) {
      out.push(b);
      continue;
    }
    const corners: Pt[] = [{ x: a.x, z: b.z }, { x: b.x, z: a.z }];
    const via = corners.find(
      (c) => (c.x !== a.x || c.z !== a.z) && (c.x !== b.x || c.z !== b.z)
        && walkable(p, a, c) && walkable(p, c, b),
    );
    if (via) {
      out.push({ x: via.x, z: via.z });
      out.push(b);
      continue;
    }
    // Un segment DROIT qui ne passe pas n'a pas d'équerre : les deux coins se
    // confondent avec ses bouts. Il faut alors un vrai crochet — s'écarter,
    // longer, revenir — et c'est encore ce qu'un piéton fait devant une
    // vitrine qui déborde sur son chemin.
    const side = Math.abs(b.x - a.x) < 1e-6 ? 'x' : 'z';
    const around = DETOUR_OFFSETS.flatMap((d) => [d, -d]).map((d) => (side === 'x'
      ? [{ x: a.x + d, z: a.z }, { x: a.x + d, z: b.z }]
      : [{ x: a.x, z: a.z + d }, { x: b.x, z: a.z + d }]));
    const hook = around.find(([c0, c1]) =>
      walkable(p, a, c0) && walkable(p, c0, c1) && walkable(p, c1, b));
    if (hook) out.push(...hook);
    out.push(b);
  }
  return out;
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
      // Se RECOUVRIR, et pas seulement se toucher : la palissade de chantier de
      // Shinagawa est plaquée contre le contrôle central, bord à bord. Prise
      // pour une borne, elle disparaissait du calcul de file — et le couloir la
      // traversait sur trente et un mètres.
      // ET UNE LIGNE QU'ON FRANCHIT. Un contrôle qui n'est pas praticable —
      // celui de Shiodome à Shimbashi, qu'on regarde sans le prendre — est un
      // MUR : ses bornes comptent comme n'importe quel obstacle, sans quoi le
      // couloir se calait entre deux d'entre elles et s'y cognait.
      // ET SEULEMENT TANT QU'ON N'Y EST PAS ENCORE. Sauter la ligne vaut pour
      // qui l'APPROCHE : la fenêtre d'examen la voit trois mètres avant, et s'y
      // caler tout de suite rétrécirait le couloir à la largeur d'une baie.
      // Mais quand le point demandé tombe DANS l'emprise de la ligne — le
      // relevé de Harajuku cote celle de Takeshita entièrement dans la pièce
      // libre, et l'on y passe pour aller vers la bouche — on est entre les
      // bornes, et les bornes redeviennent ce qu'elles sont : des bornes. Les
      // trouées qui restent sont alors exactement les baies.
      const onLine = p.network.gates.some((g) => {
        if (!g.walkable) return false;
        const inside = o.x0 < g.rect.x1 - 1e-6 && o.x1 > g.rect.x0 + 1e-6
          && o.z0 < g.rect.z1 - 1e-6 && o.z1 > g.rect.z0 + 1e-6;
        if (!inside) return false;
        const [g0, g1] = along === 'z' ? [g.rect.z0, g.rect.z1] : [g.rect.x0, g.rect.x1];
        // La garde de marche compte : un point posé cinq centimètres avant la
        // première borne est DEHORS au sens des cotes et bloqué au sens des
        // pieds. C'est la même cote que `walkerBlocked` applique, et pas une
        // marge de confort choisie ici.
        return at < g0 - CLEAR_HALL || at > g1 + CLEAR_HALL;
      });
      return a1 > at - half && a0 < at + half && !onLine;
    })
    .map((o) => {
      const [, , c0, c1] = span(o);
      return [Math.max(c0, lo), Math.min(c1, hi)] as const;
    })
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let gaps: [number, number][] = [];
  let cur = lo;
  for (const [a, b] of taken) {
    if (a > cur) gaps.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < hi) gaps.push([cur, hi]);
  // UNE TROUÉE OÙ L'ON NE TIENT PAS N'EST PAS UNE TROUÉE. Cinq centimètres
  // entre un extincteur et une vitrine font un intervalle dans l'arithmétique
  // et un mur pour un corps : le couloir s'y rangeait, et la marche s'y
  // arrêtait. On garde ce qui laisse passer quelqu'un.
  const wide = gaps.filter((g) => g[1] - g[0] >= LANE_MIN);
  if (wide.length > 0) gaps = wide;
  if (gaps.length === 0) return (lo + hi) / 2;
  // La trouée où l'on est DÉJÀ l'emporte sur la plus large : le couloir ne
  // saute pas d'un côté du hall à l'autre entre deux pas, ce qui traverserait
  // ce qu'il y a entre les deux. À défaut, la plus large.
  const here = gaps.find((g) => near >= g[0] && near <= g[1]);
  if (here) return (here[0] + here[1]) / 2;
  // ON N'EST DANS AUCUNE TROUÉE : c'est qu'on sort d'un meuble, ou qu'on arrive
  // d'un portillon dont la file tombe derrière une vitrine. On prend alors la
  // trouée la PLUS PROCHE, et non la plus large — à Ikebukuro, la plus large
  // était de l'autre côté de la galerie Tōbu, et le couloir la traversait sur
  // dix mètres pour aller s'y ranger. Sortir d'un obstacle se fait par le côté
  // le plus court, comme on contourne un pilier.
  const dist = (g: [number, number]) => (near < g[0] ? g[0] - near : near - g[1]);
  const best = Number.isFinite(near)
    ? gaps.reduce((m, g) => (dist(g) < dist(m) ? g : m))
    : gaps.reduce((m, g) => (g[1] - g[0] > m[1] - m[0] ? g : m));
  return (best[0] + best[1]) / 2;
}

/** Un point sur l'axe, en couple `[x, z]` : pour les appels qui prennent deux cotes. */
function pointOf(along: 'x' | 'z', at: number, across: number): [number, number] {
  const q = pt(along, at, across);
  return [q.x, q.z];
}

/** Une cote en travers, ramenée dans la pièce. */
function clampAcross(room: ConcourseRoom, along: 'x' | 'z', v: number): number {
  const [lo, hi] = along === 'z' ? [room.rect.x0, room.rect.x1] : [room.rect.z0, room.rect.z1];
  return Math.min(Math.max(v, lo + ZONE_EDGE), hi - ZONE_EDGE);
}

/** Les écarts essayés pour contourner un segment droit qui ne passe pas (m). */
const DETOUR_OFFSETS = [1, 1.6, 2.4, 3.2, 4.4, 6, 8, 11];

/** Au-delà, un changement de file se fait par un pas de côté explicite (m). */
const SIDESTEP = 0.75;

/** Un point posé sur l'axe de `room`, au droit de `at`. */
function onAxis(
  p: StationPlacement,
  room: ConcourseRoom,
  along: 'x' | 'z',
  at: number,
  extra?: Partial<RouteStop>,
  /** La file où l'on est DÉJÀ : on n'en change pas sans raison. */
  near?: number,
): RouteStop {
  return { ...pt(along, at, hallAxis(p, room, along, at, near)), ...extra };
}

/** Le chemin qui longe l'axe, de `a0` (exclu) à `a1` (inclus). */
function axisPath(
  p: StationPlacement,
  room: ConcourseRoom,
  along: 'x' | 'z',
  a0: number,
  a1: number,
  near?: number,
): RouteStop[] {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / AXIS_STEP));
  // LA FILE S'ANTICIPE. La fenêtre d'examen vaut deux pas et demi et non un
  // seul : le couloir se décale ainsi trois mètres AVANT ce qui l'oblige à se
  // décaler, et le pas de côté se fait dans du vide plutôt que contre l'angle
  // de la vitrine qui l'a provoqué.
  const look = AXIS_STEP * 2.5;
  let across = hallAxis(p, room, along, a0, near, look);
  let last = a0;
  const out: RouteStop[] = [];
  for (let i = 0; i < n; i++) {
    const at = a0 + (a1 - a0) * ((i + 1) / n);
    const next = hallAxis(p, room, along, at, across, look);
    // ON SE DÉCALE D'ABORD, ON AVANCE ENSUITE. La file change quand un obstacle
    // entre dans la fenêtre — une palissade de chantier peut la déplacer de dix
    // mètres d'un coup — et rejoindre la nouvelle en diagonale coupait le coin
    // de ce qui l'avait fait changer. C'est aussi ce qu'on fait en marchant :
    // on s'écarte avant l'obstacle, pas dedans.
    if (Math.abs(next - across) > SIDESTEP) out.push(pt(along, last, next));
    across = next;
    last = at;
    out.push(pt(along, at, across));
  }
  return out;
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
function pickPassage(p: StationPlacement, busy: readonly number[]): number {
  const net = p.network;
  const bays = concourseBays(net);
  const n = bays.length;
  if (n === 0) return -1;
  const mine = playerLane(net);
  // UNE BAIE QU'AUCUN ACCÈS NE DESSERT N'EST PAS À PRENDRE : on ne peut pas
  // arriver devant. C'est le pendant de G3 côté itinéraire - tant qu'il n'y
  // avait qu'un accès vivant, la question ne se posait pas.
  const served = bays.map((b) => {
    const room = paidRoomOf(net, b);
    if (!room) return false;
    // ET L'ON PEUT S'EN APPROCHER. Une palissade de chantier plantée devant la
    // ligne ferme les baies qu'elle masque : à Shinagawa, le chantier de 2026
    // barre trente et un mètres de la zone payante, et un tiers du contrôle
    // central est derrière. Une baie qu'on ne peut pas atteindre n'est pas une
    // baie ouverte — c'est ce que dit le plan, et c'est ce qu'on montre.
    const [a0, a1] = b.cross === 'z'
      ? [b.rect.z0, b.rect.z1]
      : [b.rect.x0, b.rect.x1];
    const [p0, p1] = b.cross === 'z'
      ? [room.rect.z0, room.rect.z1]
      : [room.rect.x0, room.rect.x1];
    const at = (p0 + p1) / 2 < (a0 + a1) / 2 ? a0 - ZONE_EDGE : a1 + ZONE_EDGE;
    const front = b.cross === 'z' ? { x: b.x, z: at } : { x: at, z: b.z };
    if (!clear(p, front.x, front.z)) return false;
    // Desservie DIRECTEMENT ou PAR CE QUI LA JOINT : une trémie qui débouche
    // sur une mezzanine dessert le hall d'en dessous.
    return net.accesses.some((a) => a.toRoomId === room.id
      || reachableRooms(net, a.toRoomId).has(room.id));
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
/**
 * La bouche par laquelle on sort, une fois le portillon choisi.
 *
 * ELLE DOIT ÊTRE ATTEIGNABLE DEPUIS CE PORTILLON-LÀ, et c'est tout le sujet.
 * Tant qu'une gare n'avait qu'un hall, toutes ses bouches donnaient sur la
 * même zone libre et n'importe laquelle faisait l'affaire. Uguisudani en a
 * deux, à cent mètres l'une de l'autre et sur deux niveaux : tirer au sort
 * dans le tas envoyait un voyageur du hall sud vers une bouche du hall nord,
 * qu'aucun chemin ne relie — l'itinéraire échouait, et personne ne sortait.
 *
 * On ne retient donc que les bouches du VOLUME où le portillon débouche.
 */
function pickExit(net: ConcourseNetwork, freeRoomId: string | null): StreetDoor | null {
  const reach = freeRoomId
    ? new Set(
      (shellsOf(net).find((s) => s.rooms.some((r) => r.id === freeRoomId))?.rooms ?? [])
        .map((r) => r.id),
    )
    : null;
  const usable = net.mouths
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => {
      const room = net.rooms.find((r) => r.id === m.roomId);
      if (!room?.walkable) return false;
      return !reach || reach.has(m.roomId);
    });
  if (usable.length === 0) return null;
  const { m, i: k } = usable[Math.floor(Math.random() * usable.length)];
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

/** La zone libre où débouche un portillon : celle dont on cherchera la bouche. */
function freeRoomOf(net: ConcourseNetwork, bay: ConcourseBay): string | null {
  return net.gates.find((x) => x.id === bay.gateId)?.to ?? null;
}

// --- Les haltes du hall --------------------------------------------------

/**
 * Largeur minimale d'une file : deux gardes de marche et de quoi tenir debout.
 *
 * `CLEAR_HALL` est l'encombrement que la marche impose de chaque côté ; sous
 * cette cote, une « trouée » est un intervalle arithmétique et un mur pour un
 * corps.
 */
const LANE_MIN = 0.8;

/** Jusqu'où l'on s'écarte de sa file pour un crochet (m). */
const BROWSE_REACH = 7;

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
  // LA MÊME RÈGLE QUE LA MARCHE. `clear` ne regarde que le sol : un point posé
  // à deux centimètres du nu d'une galerie a du sol sous lui et reste
  // inatteignable, puisqu'on ne s'y tient pas. À Harajuku, la halte devant les
  // casiers tombait dans ce jeu-là, et le crochet traversait la galerie pour y
  // aller. Une halte qu'on ne peut pas OCCUPER n'est pas une halte.
  if (walkerBlocked(p, 'concourse', x, z)) return null;
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
  /**
   * La pièce qu'on traverse. Sans elle, le crochet se choisissait dans TOUT le
   * mobilier de la gare : à Harajuku, un voyageur du hall d'Omotesandō partait
   * consulter un plan à cent mètres de là, dans le souterrain de Takeshita.
   */
  room: ConcourseRoom,
  along: 'x' | 'z',
  a0: number,
  a1: number,
  chance: number,
  /**
   * La file où l'on marche. Un crochet est un CROCHET : le meuble doit être au
   * bord du chemin, pas à l'autre bout du volume. Sur la passerelle d'Ōsaki,
   * large de quatre-vingt-dix mètres, un voyageur traversait tout le tablier
   * pour aller regarder un guichet, en ligne droite et à travers une galerie.
   */
  lane?: number,
): Detour | null {
  if (Math.random() >= chance) return null;
  const lo = Math.min(a0, a1);
  const hi = Math.max(a0, a1);
  const bounds = (f: Fixture) => (along === 'z'
    ? [f.rect.z0, f.rect.z1]
    : [f.rect.x0, f.rect.x1]);
  const here = p.network.fixtures.filter((f) => {
    const [b0, b1] = bounds(f);
    const mid = along === 'z'
      ? (f.rect.x0 + f.rect.x1) / 2
      : (f.rect.z0 + f.rect.z1) / 2;
    return inRoom(room, f.rect)
      && (lane === undefined || Math.abs(mid - lane) <= BROWSE_REACH)
      && b0 >= lo - 0.01 && b1 <= hi + 0.01 && BROWSE.some((b) => b.kind === f.kind);
  });
  if (here.length === 0) return null;
  const stop = browseStop(p, here[Math.floor(Math.random() * here.length)]);
  if (!stop) return null;
  // ET L'ON N'Y VA PAS EN FRANCHISSANT UN PORTILLON. Le crochet se fait en
  // deux temps : on longe l'axe jusqu'au droit du meuble, puis on s'écarte.
  // À Harajuku, le relevé cote la ligne de Takeshita ENTIÈREMENT dans la pièce
  // libre, et un distributeur rangé contre la même paroi deux mètres au-delà
  // de sa dernière borne se trouvait au droit de la ligne : on y allait en
  // traversant les armoires. Un meuble qu'on ne peut pas aborder depuis sa
  // file n'est pas un meuble qu'on regarde en passant.
  const at = alongOf(along, stop);
  const turn = lane === undefined ? stop : pt(along, at, lane);
  if (walkerBlocked(p, 'concourse', turn.x, turn.z) || !walkable(p, turn, stop)) return null;
  return { at, stops: [stop] };
}

/**
 * Le crochet d'une traversée : la boutique, ou une halte devant un meuble.
 *
 * LE KONBINI N'EST PAS TOUJOURS DEHORS. Il l'était dans le hall générique, qui
 * le rangeait au fond de la zone libre, et la visite ne se tirait donc que là.
 * Les relevés disent autre chose : à Tokyo comme à Ikebukuro, la seule paroi
 * qui porte une boutique de 7,80 m est DANS la zone payante — l'autre est
 * mangée par les bouches et par la galerie — et c'est d'ailleurs ce qu'on voit
 * en vrai, un NewDays derrière les portillons. Refuser d'y entrer laissait la
 * moitié des boutiques de la ligne sans un seul client.
 *
 * UN CROCHET RESTE UN CROCHET. La boutique doit border le trajet : on lui
 * accorde la même tolérance qu'à une halte devant un distributeur
 * (`BROWSE_REACH`), et pas un mètre de plus. Le hall de Tokyo fait
 * soixante-seize mètres de long, et une boutique posée à son autre bout ferait
 * du voyageur qui va la voir un promeneur, pas un voyageur : il y remonterait
 * trente-cinq mètres, en redescendrait autant, et le hall se remplirait de gens
 * qui n'en sortent plus.
 */
function detourIn(
  p: StationPlacement,
  room: ConcourseRoom,
  along: 'x' | 'z',
  /** Le tronçon réellement parcouru : c'est lui que le crochet doit border. */
  leg: [number, number],
  /** La zone où l'on a le droit de flâner : d'un bout à la ligne, pas au-delà. */
  span: [number, number],
  chance: number,
  lane?: number,
): Detour | null {
  const shop = shopOf(p.network, room);
  if (shop && Math.random() < 0.34) {
    const visit = shopVisit(shop, along);
    const lo = Math.min(leg[0], leg[1]) - BROWSE_REACH;
    const hi = Math.max(leg[0], leg[1]) + BROWSE_REACH;
    if (visit.at >= lo && visit.at <= hi) return visit;
  }
  return browseIn(p, room, along, span[0], span[1], chance, lane);
}

/** Longe l'axe de `a0` à `a1`, avec un crochet éventuel en chemin. */
function hallLeg(
  p: StationPlacement,
  room: ConcourseRoom,
  along: 'x' | 'z',
  a0: number,
  a1: number,
  detour: Detour | null,
  near?: number,
): RouteStop[] {
  if (!detour) return axisPath(p, room, along, a0, a1, near);
  // ON REVIENT DANS LA FILE QU'ON A QUITTÉE, pas dans la plus large du hall.
  // Sans cette cote, le retour d'un détour se reposait sur la trouée la plus
  // large — à l'autre bout d'un hall de vingt-huit mètres, ce qui traversait
  // tout ce qu'il y a entre les deux. Et ce n'est pas la position du MEUBLE
  // qu'on vient de regarder : celle-là est dans son emprise, donc dans aucune
  // trouée, ce qui renvoyait au même repli.
  const back = hallAxis(p, room, along, detour.at, near);
  return [
    ...axisPath(p, room, along, a0, detour.at, near),
    ...detour.stops,
    onAxis(p, room, along, detour.at, undefined, back),
    ...axisPath(p, room, along, detour.at, a1, back),
  ];
}

// --- Le konbini ----------------------------------------------------------

/** Une emprise est-elle dans cette pièce ? */
function inRoom(room: ConcourseRoom, r: InteriorRect): boolean {
  return r.x0 >= room.rect.x0 - 0.01 && r.x1 <= room.rect.x1 + 0.01
    && r.z0 >= room.rect.z0 - 0.01 && r.z1 <= room.rect.z1 + 0.01;
}

/** Le konbini de CETTE pièce, s'il y en a un. */
function shopOf(net: ConcourseNetwork, room: ConcourseRoom): Fixture | null {
  return net.fixtures.find((f) => f.kind === 'konbini' && inRoom(room, f.rect)) ?? null;
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
  /**
   * Où l'on ENTRE dans la zone payante, sur l'axe qu'on va remonter.
   *
   * Le bas de la volée n'est plus au bout du hall : un pont-concourse se
   * traverse selon x et sa trémie débouche par le côté. Sans cette cote, la
   * première étape partait du bout de la pièce et le trajet y allait tout
   * droit, à travers le mobilier — que `hallLeg` sait pourtant contourner,
   * mais seulement sur le tronçon qu'on lui donne.
   */
  entryAlong: number | null = null,
  /** La file où l'on arrive : celle du pied de la volée. */
  entryAcross: number | null = null,
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
  const wall = low ? r0 + ZONE_EDGE : r1 - ZONE_EDGE;
  const foot = entryAlong === null
    ? wall
    : Math.min(Math.max(entryAlong, r0 + ZONE_EDGE), r1 - ZONE_EDGE);
  // La file d'arrivée, RAMENÉE DANS LA PIÈCE. Le pied d'une volée est un demi-
  // mètre avant le nu du hall : laissée dehors, cette cote ne tombe dans aucune
  // trouée, et le choix de file se rabattait sur la plus large — à l'autre bout
  // d'un hall de vingt mètres, en traversant la galerie du milieu.
  // DEUX COTES POUR ENTRER, et il en faut deux.
  //
  //   · le DROIT-FIL de la trémie, rabattu dans la pièce : on entre par là, et
  //     l'on n'entre que par là — venir en biais depuis le pied de la volée
  //     passerait par-dessus le bord du hall (Ōsaki) ;
  //   · la FILE, qui est la trouée libre la plus proche : le droit-fil tombe
  //     parfois dans une vitrine (Nippori, dont la galerie borde le débouché),
  //     et l'on s'y décale une fois dedans.
  //
  // Quand le droit-fil lui-même est occupé, il n'y a pas d'entrée droite à
  // poser : on va directement à la file, et la passe de relecture (`weave`)
  // rattrape le trajet si le biais ne passe pas.
  const straight = entryAcross === null ? null : clampAcross(room, axis, entryAcross);
  const entryLane = straight === null ? undefined : hallAxis(p, room, axis, foot, straight);
  const enterStops = straight === null || entryLane === undefined
    ? []
    : [
      ...(!walkerBlocked(p, 'concourse', ...pointOf(axis, foot, straight))
        ? [pt(axis, foot, straight)]
        : []),
      ...(Math.abs(entryLane - straight) > SIDESTEP ? [pt(axis, foot, entryLane)] : []),
    ];
  const zone: [number, number] = low ? [r0, g0] : [g1, r1];
  const tap = { tap: bay.index, hold: 0.55, action: 'ticketGlance' as PaxAction };
  if (inbound) {
    // On arrive de la zone libre : on valide devant la ligne, on la franchit,
    // puis on remonte la zone payante vers l'accès.
    return [
      { ...freeSide, ...tap },
      paidSide,
      onAxis(p, room, axis, paidAt),
      ...hallLeg(
        p, room, axis, paidAt, foot,
        detourIn(p, room, axis, [paidAt, foot], zone, 0.18, entryLane),
      ),
      // On finit DANS la file du pied de la volée, sans quoi le dernier pas
      // traverse ce qui sépare deux files.
      onAxis(p, room, axis, foot, undefined, entryLane),
      ...[...enterStops].reverse(),
    ];
  }
  // ON ENTRE TOUT DROIT. Le couloir se tient au MILIEU de la trouée, et dans un
  // hall de trente-six mètres ce milieu est à vingt mètres du pied de la volée :
  // y aller en biais depuis la volée passait par-dessus le bord de la pièce.
  // On entre donc au droit de la volée, puis on rejoint la file.
  const straightIn = enterStops;
  return [
    ...straightIn,
    onAxis(p, room, axis, foot, undefined, entryLane),
    ...hallLeg(
      p, room, axis, foot, paidAt,
      detourIn(p, room, axis, [foot, paidAt], zone, 0.22, entryLane),
      entryLane,
    ),
    { ...paidSide, ...tap },
    freeSide,
  ];
}

/** La zone libre, des portillons aux bouches de sortie. */
function freeLegs(
  p: StationPlacement,
  door: StreetDoor,
  inbound: boolean,
  /**
   * Le point où l'on DÉBOUCHE du contrôle, côté libre.
   *
   * La zone libre commençait « au bout de la pièce », ce qui supposait que le
   * contrôle soit à l'autre bout. À Harajuku la pièce libre déborde sous la
   * ligne : partir du bout renvoyait le voyageur DANS les bornes, qu'il
   * traversait en diagonale. On part de là où l'on est.
   */
  entry: Pt | null = null,
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
  const a1 = toHigh ? hi - ZONE_EDGE : lo + ZONE_EDGE;
  // LA ZONE LIBRE COMMENCE APRÈS LA LIGNE, et pas au bord de la pièce.
  //
  // Une ligne de portillon n'est pas toujours à cheval sur la limite des deux
  // pièces : le relevé de Harajuku cote celle de Takeshita ENTIÈREMENT dans la
  // pièce libre, contre la paroi de la zone payante. Un point de départ posé au
  // bord de la pièce tombait donc DANS la ligne — et `hallAxis`, qui ignore
  // exprès ce qui est dans une ligne franchissable pour savoir trouver ses
  // passages, y voyait du sol libre et rangeait le voyageur dans une armoire.
  //
  // On repousse donc le départ de l'autre côté de toute ligne qui le contient,
  // du côté de la bouche : c'est là qu'on est vraiment quand on vient de biper.
  const past = (v: number): number => {
    let out = v;
    for (const g of net.gates) {
      // Une ligne QU'ON FRANCHIT SUR CET AXE-LÀ. Celle qu'on franchit en
      // travers barre toute la largeur de la pièce sur cet axe, et la
      // « dépasser » n'aurait aucun sens.
      if ((g.from !== room.id && g.to !== room.id) || g.cross !== axis) continue;
      const [q0, q1] = axis === 'z' ? [g.rect.z0, g.rect.z1] : [g.rect.x0, g.rect.x1];
      if (out < q0 - ZONE_EDGE || out > q1 + ZONE_EDGE) continue;
      out = toHigh ? q1 + ZONE_EDGE : q0 - ZONE_EDGE;
    }
    return Math.min(Math.max(out, lo + ZONE_EDGE), hi - ZONE_EDGE);
  };
  const a0 = past(entry
    ? Math.min(Math.max(alongOf(axis, entry), lo + ZONE_EDGE), hi - ZONE_EDGE)
    : (toHigh ? lo + ZONE_EDGE : hi - ZONE_EDGE));
  const lane = entry ? acrossOf(axis, entry) : undefined;
  const mouth = pt(axis, a1, acrossOf(axis, door));
  const detour = detourIn(p, room, axis, [a0, a1], [lo, hi], 0.4, lane);
  // La file d'ARRIVÉE, pour qui entre : celle de la bouche. Sans elle, le
  // premier point du parcours libre se rangeait dans la trouée la plus large
  // du volume — à Ikebukuro, de l'autre côté de la galerie Tōbu, que le
  // voyageur traversait ensuite sur dix mètres.
  const atMouth = acrossOf(axis, mouth);
  return inbound
    ? [
      mouth,
      onAxis(p, room, axis, a1, undefined, atMouth),
      ...hallLeg(p, room, axis, a1, a0, detour, atMouth),
      onAxis(p, room, axis, a0, undefined, lane),
    ]
    : [onAxis(p, room, axis, a0, undefined, lane), ...hallLeg(p, room, axis, a0, a1, detour, lane), mouth];
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
  const passage = pickPassage(p, busy);
  if (passage < 0) return null;
  const bay = concourseBays(p.network)[passage];
  const door = pickExit(p.network, freeRoomOf(p.network, bay));
  const room = paidRoomOf(p.network, bay);
  const foot = room && accessFoot(p, room.id);
  if (!door) return null;
  const access = room && accessServing(p, room.id);
  const cross = room && access ? joinLegs(p.network, access.toRoomId, room.id) : [];
  const enter = cross && cross.length > 0 ? cross[cross.length - 1] : foot;
  const paid = paidLegs(
    p, bay, false,
    enter ? alongOf(bay.cross, enter) : null,
    enter ? acrossOf(bay.cross, enter) : null,
  );
  const free = freeLegs(p, door, false, paid ? paid[paid.length - 1] : null);
  if (!paid || !free || !foot || !cross) return null;
  return weave(p, [
    // Le bas de l'accès : l'étage bascule tout seul en chemin
    // (systems/stationLevels), personne n'a à le décider ici.
    foot,
    // Les volées intérieures, s'il y en a : une trémie ne débouche pas
    // toujours dans la zone payante (Okachimachi, et sa mezzanine).
    ...cross,
    ...paid,
    ...free,
    { x: door.x, z: door.z },
  ]);
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
  const passage = pickPassage(p, busy);
  if (passage < 0) return null;
  const bay = concourseBays(p.network)[passage];
  const door = pickExit(p.network, freeRoomOf(p.network, bay));
  const room = paidRoomOf(p.network, bay);
  const foot = room && accessFoot(p, room.id);
  if (!door) return null;
  const access = room && accessServing(p, room.id);
  const cross = room && access ? joinLegs(p.network, access.toRoomId, room.id) : [];
  const enter = cross && cross.length > 0 ? cross[cross.length - 1] : foot;
  const paid = paidLegs(
    p, bay, true,
    enter ? alongOf(bay.cross, enter) : null,
    enter ? acrossOf(bay.cross, enter) : null,
  );
  // Le premier point du trajet payant est le côté LIBRE de la ligne : c'est là
  // que la zone libre se termine, et donc là que son parcours doit aboutir.
  const free = freeLegs(p, door, true, paid ? paid[0] : null);
  if (!paid || !free || !foot || !cross) return null;
  return {
    from: door,
    stops: weave(p, [...free, ...paid, ...[...cross].reverse(), foot]),
  };
}
