// Du relevé au réseau de rectangles : le compilateur de profil.
//
// `data/stationConcourseProfiles` dit ce qu'est une gare ; `data/stationInterior`
// sait bâtir UN hall. Entre les deux il manque la machine qui transforme un
// relevé en volumes praticables, et c'est ici.
//
// ─────────────────────────────────────────────────────────────────────────
// CE QUI CHANGE PAR RAPPORT À `interiorFor`, ET POURQUOI CELA COMPTE
//
// `interiorFor` produit une chaîne : une zone payante, une ligne, une zone
// libre, des bouches, le tout dans le prolongement de la trémie et vers +z. Ce
// vocabulaire ne sait dire ni « deux halls sans rapport », ni « le hall est en
// travers », ni « on sort par le côté ». C'est le constat G2 du plan.
//
// Le réseau, lui, est une LISTE DE PIÈCES et une liste de liens :
//
//   · une pièce a son rectangle, son sol, son plafond, son côté payant ou
//     libre, et le fait qu'on y marche ou qu'on la regarde seulement ;
//   · un lien joint deux pièces, avec l'altitude de ses deux bouts - c'est lui
//     qui porte les escaliers, les mécaniques, les rampes, les couloirs ;
//   · une ligne de portillons est un lien aussi, du payant vers le libre, et le
//     compilateur en tire les BORNES et les BAIES : le relevé dit « huit
//     passages », il ne dit pas « borne à x = 3,42 » ;
//   · une bouche de sortie s'ouvre dans la PAROI d'une pièce, et pas forcément
//     celle du fond. Le compilateur la pose face au contrôle qui alimente la
//     zone libre - ce qui, dans une gare transversale, la met sur un côté.
//
// LE REPLI EST DE PREMIÈRE CLASSE. Une gare qui n'est pas encore branchée sur
// son profil passe par `interiorFor` et son hall est enveloppé dans la même
// structure (`source: 'legacy'`). Les consommateurs n'auront donc jamais deux
// chemins à connaître : ils lisent un réseau, et c'est tout. C'est ce qui
// permettra de basculer les trente gares UNE PAR UNE (phases 20 à 24) sans
// jamais laisser le jeu à moitié converti.
//
// AUCUN CONSOMMATEUR AUJOURD'HUI, et c'est voulu : la phase 8 branchera les
// niveaux, la 9 la marche, la 10 les portillons. Le compilateur se vérifie
// entre-temps sur les trente profils, ce qui est le seul moyen de savoir qu'il
// tient avant de lui confier le jeu.
// ─────────────────────────────────────────────────────────────────────────
//
// REPÈRE. Celui du quai, comme tout le reste : x depuis l'axe de la voie vers
// le fond, z le long de la voie, y relatif au sol du quai.

import {
  CABINET_HALF_X,
  EXIT_HALF_X,
  EXIT_JAMB,
  EXIT_PIER,
  GATE_MARGIN,
  PASSAGE_W,
  PASSAGE_WIDE_W,
  GALLERY_DEPTH,
  SHOP_DEPTH,
  interiorFor,
  interiorSolids,
  type Fixture,
  type InteriorRect,
  type StationInterior,
} from './stationInterior.ts';
import {
  MIN_MAIN_WIDTH,
  isWalkable,
  type CommerceCategory,
  type CommerceStatus,
  type ConcourseLinkKind,
  type ConcourseNodeKind,
  type Depiction,
  type FareSide,
  type StationConcourseProfile,
} from './stationConcourseTypes.ts';
import { wiredProfile } from './stationConcourseWired.ts';
import { layoutFor } from './stationLayouts.ts';

// --- Ce qu'un réseau contient --------------------------------------------

/** Une pièce : un volume où l'on se tient, ou qu'on regarde. */
export interface ConcourseRoom {
  id: string;
  levelId: string;
  kind: ConcourseNodeKind;
  fare: FareSide;
  depiction: Depiction;
  rect: InteriorRect;
  /** Sol et plafond, relatifs au sol du quai. */
  floorY: number;
  ceilY: number;
  /** On y pose les pieds. Faux pour tout ce qui n'est que montré. */
  walkable: boolean;
  nameJp?: string;
  nameEn?: string;
}

/** Un ouvrage qui joint deux pièces : volée, mécanique, rampe, couloir. */
export interface ConcourseJoin {
  id: string;
  kind: ConcourseLinkKind;
  from: string;
  to: string;
  rect: InteriorRect;
  /** Altitudes des deux bouts : la marche interpole entre elles. */
  fromY: number;
  toY: number;
  width: number;
  walkable: boolean;
  depiction: Depiction;
}

/**
 * Une baie de portillon.
 *
 * `along` est l'axe le long duquel les baies se succèdent, et c'est l'INVERSE
 * de l'axe qu'on franchit : une ligne qu'on traverse en z aligne ses baies en
 * x, et réciproquement. `data/stationInterior` n'avait pas besoin de le dire -
 * il ne connaissait qu'un sens.
 */
export interface ConcoursePassage {
  along: 'x' | 'z';
  /** Milieu de la baie sur cet axe. */
  at: number;
  width: number;
  wide: boolean;
}

/** Une ligne de portillons posée : bornes, baies, et ce qui la régit. */
export interface ConcourseGateLine {
  id: string;
  nameJp: string;
  nameEn: string;
  from: string;
  to: string;
  /** L'axe le long duquel on FRANCHIT la ligne. */
  cross: 'x' | 'z';
  rect: InteriorRect;
  /** Ce qu'on contourne. */
  cabinets: InteriorRect[];
  /** Ce par quoi on passe. */
  passages: ConcoursePassage[];
  walkable: boolean;
  depiction: Depiction;
  staffed: boolean;
  icOnly?: true;
  exitOnly?: true;
  hours?: string;
}

/**
 * Un accès de quai QUI MÈNE QUELQUE PART.
 *
 * Le hall générique n'en avait qu'un - la trémie la plus proche du milieu du
 * quai - et toutes les autres restaient des couloirs borgnes de cinq marches
 * (constat G3). C'est juste pour vingt-huit gares ; cela ne l'est pas pour
 * Harajuku, dont les deux ensembles sont si petits que l'un ne suffirait pas à
 * faire une gare, ni pour Uguisudani, dont les deux halls sont à des bouts
 * opposés ET de part et d'autre des voies.
 *
 * Le profil ne pose pas de cote de quai : `systems/stationPlacement` seul sait
 * où les trémies tombent. L'accès porte donc un RANG, et c'est lui qui les
 * apparie.
 */
export interface ConcourseAccess {
  id: string;
  kind: 'stairs' | 'escalator' | 'elevator';
  /**
   * Rang parmi les accès de MÊME NATURE, en z croissant. `null` désigne
   * l'accès principal du hall générique, que le placement connaît déjà.
   */
  order: number | null;
  /** La pièce où l'on débouche. */
  toRoomId: string;
  rise: 'down' | 'up';
}

/** La paroi d'une pièce où s'ouvre une bouche. */
export type RoomSide = 'x0' | 'x1' | 'z0' | 'z1';

/** Une bouche de sortie, percée dans une paroi. */
export interface ConcourseMouth {
  id: string;
  roomId: string;
  side: RoomSide;
  /** Milieu de la baie, sur l'axe de la paroi. */
  at: number;
  halfWidth: number;
  /** Rang de la sortie dans le relevé (`data/lines`). */
  slot: number;
  nameJp: string;
  nameEn: string;
  depiction: Depiction;
}

/** Une correspondance telle que le rendu la voit : une direction, et un seuil. */
export interface ConcourseTransfer {
  id: string;
  lines: readonly string[];
  fromRoomId: string;
  goes: 'down' | 'up' | 'across';
  gated: boolean;
  depiction: Depiction;
  rect: InteriorRect | null;
  nameEn?: string;
}

/** Une cloison de chantier : ce qui ferme, et ce qui est écrit dessus. */
export interface ConcourseHoarding {
  id: string;
  roomId: string;
  rect: InteriorRect;
  kind: 'hoarding' | 'detour' | 'scaffold';
  noticeEn?: string;
}

/**
 * UNE DEVANTURE, et ce qu'on a le droit d'écrire dessus.
 *
 * Le hall générique déduit ses commerces de l'AFFLUENCE : un konbini dès que la
 * gare dépasse 1,2, une galerie dès qu'une enseigne est déclarée (constat D8).
 * C'est un moteur de remplissage, et il ne sait pas ce qu'il ne sait pas — sept
 * gares déclarent `ecute`/`atre` dont trois n'ont pas la place, et rien ne
 * distingue une enseigne LUE d'une enseigne PLAUSIBLE.
 *
 * Le relevé, lui, sait : `CommerceStatus` est une échelle de VÉRITÉ et non de
 * taille, et c'est elle qui décide ce que la devanture porte. Un commerce dont
 * personne n'a lu le nom ne le porte pas — il reste une devanture éclairée,
 * ce qu'il est réellement pour qui passe devant sans lever les yeux.
 */
export interface ConcourseFrontage {
  id: string;
  roomId: string;
  /** La paroi contre laquelle la devanture se range. */
  side: RoomSide;
  /** L'axe de sa VITRINE : celui le long duquel elle se développe. */
  along: 'x' | 'z';
  rect: InteriorRect;
  status: CommerceStatus;
  category: CommerceCategory;
  /** L'enseigne — et seulement quand le relevé l'a lue. */
  brand?: string;
  /** On y entre, ou l'on passe devant. */
  enterable: boolean;
}

export interface ConcourseNetwork {
  stationIndex: number;
  /** D'où vient ce réseau : du relevé, ou du hall générique. */
  source: 'profile' | 'legacy';
  /** Le niveau est-il réellement bâti ? Faux garde le sens qu'il avait. */
  built: boolean;
  rooms: ConcourseRoom[];
  joins: ConcourseJoin[];
  gates: ConcourseGateLine[];
  mouths: ConcourseMouth[];
  /** Les accès de quai qui mènent quelque part. Jamais vide sur un hall bâti. */
  accesses: ConcourseAccess[];
  /** Les correspondances : elles se VOIENT, elles ne se prennent pas. */
  transfers: ConcourseTransfer[];
  /** Les cloisons de chantier. L'état d'août 2026, là où le plan le délimite. */
  hoardings: ConcourseHoarding[];
  /** Les devantures relevées. Vides sur le chemin `legacy` : voir plus bas. */
  frontages: ConcourseFrontage[];
  /** Mobilier générique : billetterie, consignes, distributeurs. */
  fixtures: Fixture[];
  /** Tout ce qui barre : bornes, cloisons de chantier, mobilier. */
  obstacles: InteriorRect[];
}

// --- Poser une ligne de portillons ---------------------------------------

/**
 * Répartit `n` baies sur la longueur `len` d'une ligne, centrées.
 *
 * Même arithmétique que `data/stationInterior` - et les cotes viennent de là,
 * publiées exprès : n baies, n+1 bornes, la large au bout. Ce qui change est
 * qu'on ne sait plus d'avance sur quel AXE on travaille.
 */
function layBays(n: number, from: number, len: number, wideAtEnd: boolean): {
  bays: { at: number; width: number; wide: boolean }[];
  edges: [number, number][];
} {
  const cabinets = (n + 1) * 2 * CABINET_HALF_X;
  // LE PASSAGE LARGE EST UN LUXE, et une ligne trop courte n'y a pas droit :
  // le 幅広改札 de Shin-Ōkubo ne tient pas dans une bretelle de 1,60 m, où il
  // débordait de quatre centimètres et faisait sortir la première borne hors
  // de la ligne. Là où il ne rentre pas, toutes les baies sont ordinaires -
  // ce qui est exactement ce qu'on voit sur un passage à sens unique.
  const roomy = cabinets + PASSAGE_WIDE_W + (n - 1) * PASSAGE_W <= len;
  const widths = Array.from({ length: n }, (_, i) =>
    roomy && (wideAtEnd ? i === n - 1 : i === 0) ? PASSAGE_WIDE_W : PASSAGE_W);
  const span = widths.reduce((a, w) => a + w, 0) + cabinets;
  let at = from + Math.max(0, len - span) / 2;

  const bays: { at: number; width: number; wide: boolean }[] = [];
  const edges: [number, number][] = [];
  // Joue de bout : ce qui reste entre la paroi et la première borne se ferme,
  // sinon on contourne toute la ligne par le côté.
  if (at > from) edges.push([from, at]);
  for (let i = 0; i < n; i++) {
    edges.push([at, at + 2 * CABINET_HALF_X]);
    at += 2 * CABINET_HALF_X;
    bays.push({ at: at + widths[i] / 2, width: widths[i], wide: widths[i] === PASSAGE_WIDE_W });
    at += widths[i];
  }
  edges.push([at, at + 2 * CABINET_HALF_X]);
  at += 2 * CABINET_HALF_X;
  if (at < from + len) edges.push([at, from + len]);
  return { bays, edges };
}

/** Combien de baies tiennent réellement dans `len` mètres de ligne. */
function baysThatFit(wanted: number, len: number): number {
  const fits = Math.floor(
    (len - 2 * GATE_MARGIN - 2 * CABINET_HALF_X) / (PASSAGE_W + 2 * CABINET_HALF_X),
  );
  return Math.max(1, Math.min(wanted, fits));
}

// --- Où s'ouvre une bouche -----------------------------------------------

/**
 * La paroi d'une pièce OPPOSÉE au contrôle qui l'alimente.
 *
 * C'est la règle qui fait sortir la phase 7 de G2 : une bouche ne s'ouvre plus
 * « au fond, vers +z », elle s'ouvre là où l'on va en continuant tout droit
 * depuis les portillons. Dans un hall longitudinal cela redonne exactement le
 * comportement d'avant ; dans une passerelle transversale cela met la bouche
 * sur le côté, ce qui est le seul endroit où elle peut être.
 */
function facingSide(room: InteriorRect, gate: InteriorRect | undefined, cross: 'x' | 'z' | undefined): RoomSide {
  if (!gate || !cross) return 'z1';
  if (cross === 'x') {
    const gateMid = (gate.x0 + gate.x1) / 2;
    return gateMid < (room.x0 + room.x1) / 2 ? 'x1' : 'x0';
  }
  const gateMid = (gate.z0 + gate.z1) / 2;
  return gateMid < (room.z0 + room.z1) / 2 ? 'z1' : 'z0';
}

/**
 * La paroi contre laquelle une emprise s'adosse : la plus proche des quatre.
 *
 * Un commerce de gare borde toujours un côté du hall — jamais son milieu, qui
 * est ce qu'on traverse. Quand le relevé cote une emprise, il ne dit pas contre
 * quel mur elle s'appuie ; c'est la géométrie qui le sait, et une devanture
 * orientée vers le mauvais côté tournerait le dos aux voyageurs.
 */
function nearestSide(room: InteriorRect, r: InteriorRect): RoomSide {
  const d: [RoomSide, number][] = [
    ['x0', r.x0 - room.x0],
    ['x1', room.x1 - r.x1],
    ['z0', r.z0 - room.z0],
    ['z1', room.z1 - r.z1],
  ];
  return d.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

/**
 * Répartit `n` bouches sur une paroi DÉJÀ OCCUPÉE par endroits.
 *
 * Les `busy` sont les devantures relevées. On découpe la paroi en tronçons
 * libres, on les sert du plus long au plus court — une bouche par tronçon tant
 * qu'il en reste, puis on double — et chaque tronçon pose ses bouches comme si
 * c'était toute la paroi. Quand rien n'est occupé, cela redonne exactement
 * `layMouths` sur la paroi entière : les gares non branchées ne bougent pas.
 */
function layMouthsClear(
  n: number,
  from: number,
  len: number,
  busy: readonly [number, number][],
): { at: number; halfWidth: number }[] {
  if (busy.length === 0) return layMouths(n, from, len);
  let runs: [number, number][] = [[from, from + len]];
  for (const [b0, b1] of busy) {
    runs = runs.flatMap(([s0, s1]) => {
      if (b1 <= s0 || b0 >= s1) return [[s0, s1] as [number, number]];
      const out: [number, number][] = [];
      if (b0 > s0) out.push([s0, Math.min(b0, s1)]);
      if (b1 < s1) out.push([Math.max(b1, s0), s1]);
      return out;
    });
  }
  runs = runs.filter(([a, b]) => b - a >= 2 * EXIT_JAMB + 0.7);
  // Plus rien de libre : la paroi est entièrement commerciale, et une sortie
  // passe avant un magasin. On reprend la paroi entière.
  if (runs.length === 0) return layMouths(n, from, len);
  runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
  const share = new Array<number>(runs.length).fill(0);
  for (let k = 0; k < n; k++) share[k % runs.length]++;
  return runs
    .flatMap((r, k) => (share[k] > 0 ? layMouths(share[k], r[0], r[1] - r[0]) : []))
    .sort((a, b) => a.at - b.at);
}

/**
 * Étire une ligne de portillons jusqu'à toucher ses deux pièces.
 *
 * Uniquement dans le sens du franchissement, et uniquement vers l'extérieur :
 * une ligne ne rétrécit jamais, sans quoi ses bornes changeraient de cote.
 */
function spanRooms(
  rect: InteriorRect,
  cross: 'x' | 'z',
  from: ConcourseRoom | undefined,
  to: ConcourseRoom | undefined,
): InteriorRect {
  const rooms = [from, to].filter((r): r is ConcourseRoom => !!r);
  if (rooms.length < 2) return rect;
  const mid = cross === 'z' ? (rect.z0 + rect.z1) / 2 : (rect.x0 + rect.x1) / 2;
  let lo = cross === 'z' ? rect.z0 : rect.x0;
  let hi = cross === 'z' ? rect.z1 : rect.x1;
  for (const r of rooms) {
    const [a0, a1] = cross === 'z' ? [r.rect.z0, r.rect.z1] : [r.rect.x0, r.rect.x1];
    // Le bord de la pièce QUI REGARDE la ligne.
    const edge = (a0 + a1) / 2 < mid ? a1 : a0;
    lo = Math.min(lo, edge);
    hi = Math.max(hi, edge);
  }
  const spanned = cross === 'z' ? { ...rect, z0: lo, z1: hi } : { ...rect, x0: lo, x1: hi };
  // ET ELLE NE DÉBORDE PAS SES DEUX PIÈCES. Une ligne ne peut exister que là
  // où les deux côtés existent : à Tamachi le contrôle sud était coté dix
  // mètres de long pour une zone payante qui s'arrête six mètres plus tôt, et
  // ses dernières baies s'ouvraient sur du vide.
  const along: 'x' | 'z' = cross === 'z' ? 'x' : 'z';
  const bounds = rooms.map((r) => (along === 'x'
    ? [r.rect.x0, r.rect.x1]
    : [r.rect.z0, r.rect.z1]));
  const a0 = Math.max(...bounds.map((b) => b[0]));
  const a1 = Math.min(...bounds.map((b) => b[1]));
  const [s0, s1] = along === 'x' ? [spanned.x0, spanned.x1] : [spanned.z0, spanned.z1];
  const lo2 = Math.max(s0, a0);
  const hi2 = Math.min(s1, a1);
  // Rien de commun : la ligne est cotée à CÔTÉ des pièces qu'elle sépare
  // (Ikebukuro, contrôle sud). On ne la déplace pas — ce serait décider à la
  // place du relevé — on la laisse telle quelle, et `networkIssues` le dit.
  if (hi2 - lo2 < 1) return spanned;
  return along === 'x'
    ? { ...spanned, x0: lo2, x1: hi2 }
    : { ...spanned, z0: lo2, z1: hi2 };
}

/** Une emprise touche-t-elle cette paroi de la pièce ? */
function touchesWall(room: InteriorRect, r: InteriorRect, side: RoomSide): boolean {
  const EPS = 0.1;
  if (side === 'x0') return r.x0 <= room.x0 + EPS;
  if (side === 'x1') return r.x1 >= room.x1 - EPS;
  if (side === 'z0') return r.z0 <= room.z0 + EPS;
  return r.z1 >= room.z1 - EPS;
}

/** En deçà, une devanture n'en est plus une : on ne la pose pas (m). */
const SHOP_MIN_DEPTH = 1.2;

/** Deux emprises se recouvrent-elles sur l'axe long d'une paroi ? */
function overlapsAlong(a: InteriorRect, b: InteriorRect, along: 'x' | 'z'): boolean {
  return along === 'z'
    ? a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6
    : a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6;
}

/** Dégagement laissé libre de part et d'autre d'une ligne de portillons (m). */
const GATE_CLEAR = 1.2;
/**
 * Les décalages essayés pour recaser un meuble : sur place d'abord, puis de
 * proche en proche des deux côtés, jusqu'à douze mètres.
 */
const SLIDES = [0, ...Array.from({ length: 24 }, (_, k) => (k + 1) * 0.5).flatMap(
  (d) => [d, -d],
)];

/** Dégagement laissé libre devant une bouche de sortie (m). */
const MOUTH_CLEAR = 2.5;

/** Largeur d'un seuil de correspondance, et sa profondeur dans le mur. */
const PORTAL_W = 2.6;
const PORTAL_D = 0.5;
/** Retrait depuis le nu de la paroi : celle-ci mord sur la pièce. */
const PORTAL_INSET = 0.2;

/**
 * Cherche à un seuil la plus longue portion de mur encore libre.
 *
 * Les quatre parois sont examinées, moins ce qui les occupe déjà — bouches,
 * devantures, seuils précédents. Rien d'assez long : le seuil reste sans
 * emprise, et le rendu se rabat sur son ancien placement plutôt que d'aller
 * poser une porte dans une vitrine.
 */
function parkOnWall(
  room: InteriorRect,
  taken: ReadonlyMap<string, [number, number][]>,
  roomId: string,
): { side: RoomSide; span: [number, number]; rect: InteriorRect } | null {
  let best: { side: RoomSide; at: number; len: number } | null = null;
  for (const side of ['x0', 'x1', 'z0', 'z1'] as RoomSide[]) {
    const [from, len] = wallSpan(room, side);
    let runs: [number, number][] = [[from, from + len]];
    for (const [b0, b1] of taken.get(`${roomId}/${side}`) ?? []) {
      runs = runs.flatMap(([s0, s1]) => {
        if (b1 <= s0 || b0 >= s1) return [[s0, s1] as [number, number]];
        const out: [number, number][] = [];
        if (b0 > s0) out.push([s0, Math.min(b0, s1)]);
        if (b1 < s1) out.push([Math.max(b1, s0), s1]);
        return out;
      });
    }
    for (const [a0, a1] of runs) {
      if (!best || a1 - a0 > best.len) best = { side, at: (a0 + a1) / 2, len: a1 - a0 };
    }
  }
  if (!best || best.len < PORTAL_W + 0.4) return null;
  const half = PORTAL_W / 2;
  const span: [number, number] = [best.at - half, best.at + half];
  // Le seuil se pose DEVANT la paroi, pas dedans : celle-ci mord de dix-sept
  // centimètres sur la pièce (`three/station/Concourse`, WALL_T), et un portail
  // à fleur du nu se retrouvait à moitié dans le mur.
  const rect: InteriorRect = best.side === 'x0'
    ? { x0: room.x0 + PORTAL_INSET, x1: room.x0 + PORTAL_INSET + PORTAL_D, z0: span[0], z1: span[1] }
    : best.side === 'x1'
      ? { x0: room.x1 - PORTAL_INSET - PORTAL_D, x1: room.x1 - PORTAL_INSET, z0: span[0], z1: span[1] }
      : best.side === 'z0'
        ? { x0: span[0], x1: span[1], z0: room.z0 + PORTAL_INSET, z1: room.z0 + PORTAL_INSET + PORTAL_D }
        : { x0: span[0], x1: span[1], z0: room.z1 - PORTAL_INSET - PORTAL_D, z1: room.z1 - PORTAL_INSET };
  return { side: best.side, span, rect };
}

/** Ne garde d'une emprise que sa devanture : `depth` mètres depuis sa paroi. */
function trimToFront(r: InteriorRect, side: RoomSide, depth: number): InteriorRect {
  if (side === 'x0') return { ...r, x1: Math.min(r.x1, r.x0 + depth) };
  if (side === 'x1') return { ...r, x0: Math.max(r.x0, r.x1 - depth) };
  if (side === 'z0') return { ...r, z1: Math.min(r.z1, r.z0 + depth) };
  return { ...r, z0: Math.max(r.z0, r.z1 - depth) };
}

/** Longueur de la paroi `side` d'une pièce, et son origine sur son axe. */
function wallSpan(r: InteriorRect, side: RoomSide): [number, number] {
  return side === 'x0' || side === 'x1' ? [r.z0, r.z1 - r.z0] : [r.x0, r.x1 - r.x0];
}

/**
 * Répartit `n` bouches sur une paroi, au tiers et aux deux tiers quand la place
 * le permet, resserrées et rétrécies quand elle manque.
 *
 * Reprise fidèle de `data/stationInterior` : une bouche RÉTRÉCIT plutôt que de
 * mordre sur sa voisine ou sur la paroi, et l'entraxe s'ouvre pour garder le
 * trumeau. Deux bouches qui se recouvrent ne sont plus deux sorties, c'est un
 * trou.
 */
function layMouths(n: number, from: number, len: number): { at: number; halfWidth: number }[] {
  const room = (len - 2 * EXIT_JAMB - (n - 1) * EXIT_PIER) / (2 * n);
  const half = Math.max(0.35, Math.min(EXIT_HALF_X, room));
  const pitch = Math.max(len / (n + 1), 2 * half + EXIT_PIER);
  const mid = from + len / 2;
  return Array.from({ length: n }, (_, k) => ({
    at: mid + (k - (n - 1) / 2) * pitch,
    halfWidth: half,
  }));
}

// --- Le chemin du relevé -------------------------------------------------

/**
 * L'abscisse en z de la trémie PRINCIPALE, telle que `systems/stationPlacement`
 * la choisit : la plus proche du milieu du quai.
 *
 * Elle est recalculée ici plutôt que reçue, pour une raison précise : les cotes
 * des profils ont été écrites depuis cette même table (`data/stationLayouts`),
 * et le compilateur DÉCALE le relevé de l'écart s'il y en a un. Le jour où le
 * placement bougera ses trémies, les halls suivront au lieu de flotter.
 */
function assumedAccessZ(index: number): number {
  const stairs = layoutFor(index).amenities.stairs;
  return stairs.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
}

function shifted(r: { x0: number; x1: number; z0: number; z1: number }, dz: number): InteriorRect {
  return { x0: r.x0, x1: r.x1, z0: r.z0 + dz, z1: r.z1 + dz };
}

/** Compile un relevé en réseau, calé sur la trémie réellement posée. */
export function compileProfile(
  p: StationConcourseProfile,
  accessZ: number = assumedAccessZ(p.stationIndex),
): ConcourseNetwork {
  const dz = accessZ - assumedAccessZ(p.stationIndex);
  const levels = new Map(p.levels.map((l) => [l.id, l]));

  const rooms: ConcourseRoom[] = p.concourses.map((n) => {
    const l = levels.get(n.levelId);
    const floorY = l?.floorY ?? 0;
    return {
      id: n.id,
      levelId: n.levelId,
      kind: n.kind,
      fare: n.fare,
      depiction: n.depiction,
      rect: shifted(n.rect, dz),
      floorY,
      ceilY: floorY + (n.headroom ?? l?.headroom ?? 0),
      walkable: isWalkable(n.depiction),
      nameJp: n.nameJp,
      nameEn: n.nameEn,
    };
  });
  const byId = new Map(rooms.map((r) => [r.id, r]));

  const joins: ConcourseJoin[] = p.corridors.map((c) => ({
    id: c.id,
    kind: c.kind,
    from: c.from,
    to: c.to,
    rect: shifted(c.rect, dz),
    fromY: byId.get(c.from)?.floorY ?? 0,
    toY: byId.get(c.to)?.floorY ?? 0,
    width: c.width,
    // Un lien n'est praticable que s'il l'est LUI et que les deux pièces le
    // sont : une volée franchissable vers une perspective ne mène nulle part.
    walkable: isWalkable(c.depiction)
      && (byId.get(c.from)?.walkable ?? false)
      && (byId.get(c.to)?.walkable ?? false),
    depiction: c.depiction,
  }));

  const obstacles: InteriorRect[] = [];
  const gates: ConcourseGateLine[] = p.gateGroups.map((g) => {
    // LA LIGNE JOINT SES DEUX PIÈCES, sans un centimètre de vide. Le relevé
    // cote l'emprise du contrôle et les pièces de part et d'autre séparément :
    // à Tamachi il restait trente centimètres entre la ligne et la zone libre,
    // trente centimètres qui n'appartenaient à rien et sur lesquels la marche
    // butait comme sur un mur. Le franchissement, lui, est continu par
    // définition — on ne saute pas un fossé au milieu d'un 改札.
    const rect = spanRooms(shifted(g.rect, dz), g.cross, byId.get(g.from), byId.get(g.to));
    // Les baies s'alignent sur l'axe PERPENDICULAIRE à celui qu'on franchit.
    const along: 'x' | 'z' = g.cross === 'z' ? 'x' : 'z';
    const from = along === 'x' ? rect.x0 : rect.z0;
    const len = along === 'x' ? rect.x1 - rect.x0 : rect.z1 - rect.z0;
    const { bays, edges } = layBays(
      baysThatFit(g.passages, len),
      from,
      len,
      g.wideAt !== 'start',
    );
    const cabinets = edges.map(([a, b]) =>
      along === 'x'
        ? { x0: a, x1: b, z0: rect.z0, z1: rect.z1 }
        : { x0: rect.x0, x1: rect.x1, z0: a, z1: b });
    obstacles.push(...cabinets);
    return {
      id: g.id,
      nameJp: g.nameJp,
      nameEn: g.nameEn,
      from: g.from,
      to: g.to,
      cross: g.cross,
      rect,
      cabinets,
      passages: bays.map((b) => ({ along, at: b.at, width: b.width, wide: b.wide })),
      walkable: isWalkable(g.depiction),
      depiction: g.depiction,
      staffed: g.staffed ?? false,
      icOnly: g.icOnly,
      exitOnly: g.exitOnly,
      hours: g.hours,
    };
  });

  // LES DEVANTURES. Elles se rangent contre la paroi la plus proche : un
  // commerce de gare n'est jamais au milieu d'un hall — il en borde un côté, et
  // c'est ce qui laisse le passage libre. Le relevé cote son emprise, le
  // compilateur en déduit contre QUOI elle s'adosse et dans quel sens sa
  // vitrine se développe.
  const frontages: ConcourseFrontage[] = [];
  for (const zone of p.commercialZones) {
    const room = byId.get(zone.nodeId);
    if (!room) continue;
    const declared = shifted(zone.rect, dz);
    const side = nearestSide(room.rect, declared);
    // Le relevé cote l'EMPRISE du commerce, pas sa vitrine. GRANSTA fait
    // quarante-six mètres de long sur huit de fond : le poser tel quel
    // remplirait le niveau d'un bloc plein qu'on ne pourrait pas contourner.
    // Ce qu'on voit d'un hall, c'est la DEVANTURE — le reste est derrière, et
    // le joueur n'y entre pas.
    const rect = trimToFront(
      declared,
      side,
      zone.category === 'gallery' ? GALLERY_DEPTH : SHOP_DEPTH,
    );
    const along: 'x' | 'z' = side === 'x0' || side === 'x1' ? 'z' : 'x';
    // DEUX VITRINES QUI SE FONT FACE NE SE PARTAGENT PAS UN HALL DE SIX MÈTRES.
    // Gotanda en a deux de trois mètres de fond, une par paroi : posées telles
    // quelles, elles fermaient la zone libre d'un mur à l'autre et l'on ne
    // pouvait plus atteindre les sorties. Chaque devanture est donc rognée sur
    // ce qui reste réellement, et l'on garde deux mètres de passage.
    const across: 'x' | 'z' = along === 'z' ? 'x' : 'z';
    const roomW = across === 'x'
      ? room.rect.x1 - room.rect.x0
      : room.rect.z1 - room.rect.z0;
    const facing = frontages
      .filter((o) => o.roomId === zone.nodeId && overlapsAlong(o.rect, rect, along))
      .reduce((sum, o) => sum + (across === 'x'
        ? o.rect.x1 - o.rect.x0
        : o.rect.z1 - o.rect.z0), 0);
    const room4 = roomW - facing - MIN_MAIN_WIDTH;
    const clear = trimToFront(rect, side, Math.max(0, room4));
    const kept = across === 'x' ? clear.x1 - clear.x0 : clear.z1 - clear.z0;
    // Moins d'un mètre vingt : ce n'est plus une devanture, c'est une plinthe.
    if (kept < SHOP_MIN_DEPTH) continue;
    frontages.push({
      id: zone.id,
      roomId: zone.nodeId,
      side,
      along,
      rect: clear,
      status: zone.status,
      category: zone.category,
      brand: zone.brand,
      enterable: zone.enterable,
    });
    // Une devanture est un OBSTACLE : on ne traverse pas une vitrine. Celles
    // où l'on entre le sont aussi — la porte n'est pas encore un ouvrage, et
    // ouvrir un trou dans la marche sans rien derrière serait pire.
    obstacles.push(clear);
  }

  // Les bouches, groupées par zone libre : elles se partagent une paroi, donc
  // elles ne peuvent pas être posées une par une.
  const mouths: ConcourseMouth[] = [];
  const byRoom = new Map<string, typeof p.exits[number][]>();
  for (const e of p.exits) {
    const list = byRoom.get(e.fromNodeId);
    if (list) list.push(e);
    else byRoom.set(e.fromNodeId, [e]);
  }
  for (const [roomId, list] of byRoom) {
    const room = byId.get(roomId);
    if (!room) continue;
    const feeder = gates.find((g) => g.to === roomId);
    const side = facingSide(room.rect, feeder?.rect, feeder?.cross);
    const [from, len] = wallSpan(room.rect, side);
    // CE QUI EST RELEVÉ PASSE AVANT CE QUI EST COMPOSÉ. Les devantures ont des
    // cotes lues sur un plan ; la position des bouches, elle, est composée —
    // le relevé donne leur nom et leur paroi, pas leur abscisse. Quand les deux
    // se disputent une paroi (Komagome : le magasin tombait pile sur les deux
    // sorties), ce sont donc les bouches qui se rangent ailleurs.
    // Ce qui occupe cette paroi : toute devanture qui la TOUCHE, et pas
    // seulement celle qui s'y adosse. Une vitrine rangée le long du mur d'à
    // côté arrive souvent jusqu'à l'angle — à Gotanda, elle couvrait la sortie
    // est sans être « du côté » de cette paroi-là.
    const busy: [number, number][] = [
      ...frontages
        .filter((f) => f.roomId === roomId && touchesWall(room.rect, f.rect, side))
        .map((f) => wallSpan(f.rect, side)),
      // Et les LIGNES DE PORTILLONS qui aboutissent à cette paroi : à Ōsaki, le
      // contrôle sud arrive sur le mur nord de la passerelle, et une bouche
      // posée là s'ouvrait dans une rangée de bornes.
      ...gates
        .filter((g) => (g.from === roomId || g.to === roomId)
          && touchesWall(room.rect, g.rect, side))
        .map((g) => wallSpan(g.rect, side)),
    ].map(([a, l]) => [a - 0.3, a + l + 0.3] as [number, number]);
    const laid = layMouthsClear(list.length, from, len, busy);
    list.forEach((e, k) => {
      mouths.push({
        id: e.id,
        roomId,
        side,
        at: laid[k].at,
        halfWidth: laid[k].halfWidth,
        slot: p.exits.indexOf(e),
        nameJp: e.nameJp,
        nameEn: e.nameEn,
        depiction: e.depiction,
      });
    });
  }

  // Les cloisons de chantier barrent : c'est leur seul rôle, et c'est celui
  // qu'elles ont en vrai.
  const hoardings = (p.works?.partitions ?? []).map((part) => ({
    id: part.id,
    roomId: part.nodeId,
    rect: shifted(part.rect, dz),
    kind: part.kind,
    noticeEn: part.noticeEn,
  }));
  for (const h of hoardings) obstacles.push(h.rect);

  // LES CORRESPONDANCES SE RANGENT CONTRE UN MUR LIBRE. Le relevé donne la
  // DIRECTION d'une correspondance — le Ginza est en l'air, le Chiyoda tout en
  // bas — et rarement son emprise : ce sont des seuils qu'on voit depuis le
  // hall, pas des salles cotées. Faute de cote, le rendu les rangeait au fond
  // de la pièce, toutes au même endroit, par-dessus le mobilier et les
  // vitrines. On leur cherche donc une place, comme on le fait des bouches.
  const taken = new Map<string, [number, number][]>();
  const claim = (roomId: string, side: RoomSide, span: [number, number]) => {
    const key = `${roomId}/${side}`;
    const list = taken.get(key);
    if (list) list.push(span);
    else taken.set(key, [span]);
  };
  for (const m of mouths) {
    claim(m.roomId, m.side, [m.at - m.halfWidth - 0.4, m.at + m.halfWidth + 0.4]);
  }
  for (const f of frontages) {
    const room = byId.get(f.roomId);
    if (!room) continue;
    for (const side of ['x0', 'x1', 'z0', 'z1'] as RoomSide[]) {
      if (!touchesWall(room.rect, f.rect, side)) continue;
      const [a, l] = wallSpan(f.rect, side);
      claim(f.roomId, side, [a - 0.3, a + l + 0.3]);
    }
  }
  // Une ligne de portillons touche deux parois par ses joues de rive : y poser
  // un seuil de correspondance mettrait une porte dans une borne.
  for (const g of gates) {
    for (const roomId of [g.from, g.to]) {
      const room = byId.get(roomId);
      if (!room) continue;
      for (const side of ['x0', 'x1', 'z0', 'z1'] as RoomSide[]) {
        const [a, l] = wallSpan(g.rect, side);
        claim(roomId, side, [a - 0.3, a + l + 0.3]);
      }
    }
  }
  const transfers: ConcourseTransfer[] = p.transferPortals
    .filter((t) => byId.has(t.fromNodeId))
    .map((t) => {
      const room = byId.get(t.fromNodeId)!;
      let rect = t.rect ? shifted(t.rect, dz) : null;
      if (!rect) {
        const parked = parkOnWall(room.rect, taken, t.fromNodeId);
        if (parked) {
          rect = parked.rect;
          claim(t.fromNodeId, parked.side, parked.span);
        }
      }
      return {
        id: t.id,
        lines: t.lines,
        fromRoomId: t.fromNodeId,
        goes: t.goes,
        gated: t.gated === true,
        depiction: t.depiction,
        rect,
        nameEn: t.nameEn,
      };
    });

  // Seuls les accès PRATICABLES mènent quelque part : une tête d'escalier qu'on
  // regarde reste le couloir borgne qu'elle était.
  const accesses = p.platformAccesses
    .filter((a) => isWalkable(a.depiction) && byId.get(a.toNodeId)?.walkable)
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      order: a.order,
      toRoomId: a.toNodeId,
      rise: a.rise,
    }));

  return {
    stationIndex: p.stationIndex,
    source: 'profile',
    built: true,
    rooms,
    joins,
    gates,
    mouths,
    accesses,
    transfers,
    hoardings,
    frontages,
    // Le mobilier n'est pas du ressort du relevé : un plan officiel ne cote pas
    // une batterie de distributeurs, et il ne se déduit pas d'un plan.
    fixtures: [],
    obstacles,
  };
}

// --- Le repli : le hall générique, enveloppé -----------------------------

/**
 * Enveloppe un hall de `data/stationInterior` dans la même structure.
 *
 * Rien n'est recalculé : les rectangles, les bornes, les baies et le mobilier
 * sont ceux du moteur existant, et c'est tout l'intérêt. Une gare qui n'est pas
 * encore branchée sur son profil se comporte AU RECTANGLE PRÈS comme avant, et
 * les consommateurs n'ont qu'un seul format à connaître.
 */
export function legacyNetwork(index: number, it: StationInterior): ConcourseNetwork {
  const room = (id: string, rect: InteriorRect, fare: FareSide): ConcourseRoom => ({
    id,
    levelId: it.place,
    kind: 'linear',
    fare,
    depiction: it.built ? 'walkable' : 'backdrop',
    rect,
    floorY: it.floorY,
    ceilY: it.ceilY,
    walkable: it.built,
  });
  return {
    stationIndex: index,
    source: 'legacy',
    built: it.built,
    rooms: [room('paid', it.paid, 'paid'), room('free', it.free, 'free')],
    joins: [],
    gates: [{
      id: 'gate',
      nameJp: it.gate.nameJp,
      nameEn: it.gate.nameRomaji,
      from: 'paid',
      to: 'free',
      cross: 'z',
      rect: { x0: it.paid.x0, x1: it.paid.x1, z0: it.gate.z0, z1: it.gate.z1 },
      cabinets: it.gate.cabinets,
      passages: it.gate.passages.map((g) => ({
        along: 'x' as const,
        at: g.x,
        width: g.width,
        wide: g.wide,
      })),
      walkable: it.built,
      depiction: it.built ? 'walkable' : 'backdrop',
      staffed: true,
    }],
    // Le hall générique n'a qu'un accès, et le placement sait déjà lequel :
    // c'est la trémie la plus proche du milieu du quai. D'où le rang `null`.
    // Le hall générique ne connaît ni correspondance ni chantier : `data/lines`
    // sait qu'il y a un Ginza à Kanda, le hall non (constat D7).
    transfers: [],
    hoardings: [],
    accesses: it.built
      ? [{
        id: 'main',
        kind: 'stairs' as const,
        order: null,
        toRoomId: 'paid',
        rise: it.place === 'over' ? ('up' as const) : ('down' as const),
      }]
      : [],
    mouths: it.exits.map((e, k) => ({
      id: `exit-${k}`,
      roomId: 'free',
      side: 'z1' as const,
      at: e.x,
      halfWidth: e.halfWidth,
      slot: e.slot,
      // Le hall générique ne nomme pas ses bouches : ce sont les potences du
      // quai qui le font (`data/lines`), et le rendu tire son panneau de là.
      nameJp: '',
      nameEn: '',
      depiction: it.built ? 'walkable' : 'backdrop',
    })),
    // Le hall générique DÉDUIT ses commerces de l'affluence, et son mobilier
    // les porte déjà (`data/stationInterior`). Les redéclarer ici en ferait des
    // devantures relevées, ce qu'elles ne sont pas : le chemin `legacy` n'en a
    // aucune, et c'est le constat D8 dit dans le code.
    frontages: [],
    fixtures: it.fixtures,
    obstacles: it.obstacles,
  };
}

// --- Le point d'entrée ---------------------------------------------------

/**
 * LE MOBILIER D'UNE GARE BRANCHÉE : celui du moteur, mais SEULEMENT CE QUI TIENT.
 *
 * Un plan officiel ne cote pas une batterie de distributeurs : le relevé n'a
 * donc pas de mobilier, et un hall vide serait un recul par rapport au hall
 * générique qui, lui, en range le long de ses deux parois. On reprend donc le
 * mobilier générique — et l'on ne garde que les meubles qui tiennent RÉELLEMENT
 * dans les pièces du relevé, à l'écart de ce qui est déjà posé.
 *
 * Un konbini de 3,40 m de fond calé sur un hall de 5,30 m ne rentre pas dans un
 * pont-concourse qui en fait 4,20 : il disparaît, et c'est le bon comportement.
 * Le faire entrer de force le ferait ressortir par la paroi — ce que la sonde a
 * vu à Nishi-Nippori, une devanture dans une vitrine.
 */
function fittedFixtures(net: ConcourseNetwork, it: StationInterior): Fixture[] {
  const rooms = net.rooms.filter((r) => r.walkable);
  // Devant un contrôle, on ne pose RIEN. La ligne a besoin de ses deux mètres
  // d'abord et de son dégagement derrière : c'est là que la file se forme, et
  // un extincteur logé dans les trente-cinq centimètres qui restent entre la
  // ligne et la paroi barrait le passage de tout le monde.
  const gateClear = (g: ConcourseGateLine): InteriorRect => (g.cross === 'z'
    ? { ...g.rect, z0: g.rect.z0 - GATE_CLEAR, z1: g.rect.z1 + GATE_CLEAR }
    : { ...g.rect, x0: g.rect.x0 - GATE_CLEAR, x1: g.rect.x1 + GATE_CLEAR });
  // Et devant une BOUCHE non plus : c'est par là qu'on s'en va, et un banc
  // planté en travers de la sortie est le meuble le plus mal posé qui soit.
  const mouthClear = (m: ConcourseMouth): InteriorRect | null => {
    const room = net.rooms.find((r) => r.id === m.roomId);
    if (!room) return null;
    const a0 = m.at - m.halfWidth - 0.3;
    const a1 = m.at + m.halfWidth + 0.3;
    const r = room.rect;
    return m.side === 'x0' ? { x0: r.x0, x1: r.x0 + MOUTH_CLEAR, z0: a0, z1: a1 }
      : m.side === 'x1' ? { x0: r.x1 - MOUTH_CLEAR, x1: r.x1, z0: a0, z1: a1 }
        : m.side === 'z0' ? { x0: a0, x1: a1, z0: r.z0, z1: r.z0 + MOUTH_CLEAR }
          : { x0: a0, x1: a1, z0: r.z1 - MOUTH_CLEAR, z1: r.z1 };
  };
  const busy: InteriorRect[] = [
    ...net.obstacles,
    ...net.gates.map(gateClear),
    ...net.mouths.map(mouthClear).filter((r): r is InteriorRect => r !== null),
    ...net.transfers.map((t) => t.rect).filter((r): r is InteriorRect => r !== null),
  ];
  const overlaps = (a: InteriorRect, b: InteriorRect) =>
    a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;
  const out: Fixture[] = [];
  for (const f of it.fixtures) {
    // La pièce du relevé qui reprend cette tranche de hall : celle qui la
    // RECOUVRE LE PLUS. Exiger qu'elle la contienne entièrement vidait les
    // gares dont les pièces sont plus courtes que le hall générique — à
    // Harajuku, quatorze meubles sur seize disparaissaient parce que le
    // souterrain de Takeshita fait sept mètres et le hall générique vingt-sept.
    let host: ConcourseRoom | null = null;
    let best = 0;
    for (const r of rooms) {
      const cover = Math.min(f.rect.z1, r.rect.z1) - Math.max(f.rect.z0, r.rect.z0);
      if (cover > best) { best = cover; host = r; }
    }
    if (!host || best <= 0) continue;
    // Et l'on ramène le meuble DANS cette pièce : il glissera ensuite le long
    // de la paroi jusqu'à trouver sa place.
    const len = f.rect.z1 - f.rect.z0;
    if (host.rect.z1 - host.rect.z0 < len) continue;
    const dz0 = Math.min(Math.max(f.rect.z0, host.rect.z0), host.rect.z1 - len) - f.rect.z0;
    // UN MEUBLE DE GARE EST CONTRE UN MUR. Le hall générique range le sien
    // contre ses deux parois, à 2,13 m et 7,63 m de l'axe de la voie ; un
    // pont-concourse relevé fait vingt-huit mètres de large, et le même meuble
    // laissé à sa cote se retrouvait planté au MILIEU du volume, coupant le
    // passage en deux. On le ramène donc contre la paroi vers laquelle il
    // regarde — c'est là qu'il est en vrai.
    const dx = f.facing === 1 ? host.rect.x0 - f.rect.x0 : host.rect.x1 - f.rect.x1;
    const moved: Fixture = {
      ...f,
      rect: {
        x0: f.rect.x0 + dx,
        x1: f.rect.x1 + dx,
        z0: f.rect.z0 + dz0,
        z1: f.rect.z1 + dz0,
      },
    };
    if (moved.rect.x0 < host.rect.x0 - 1e-6 || moved.rect.x1 > host.rect.x1 + 1e-6) continue;
    // ET IL GLISSE LE LONG DE SA PAROI plutôt que de disparaître. Le konbini du
    // hall générique est au fond de la zone libre, c'est-à-dire précisément là
    // où le relevé perce ses bouches : refusé sur place, il emportait avec lui
    // la boutique de la moitié des gares. On l'essaie donc de proche en proche,
    // de part et d'autre, avant d'y renoncer.
    const fits = (r: InteriorRect) =>
      r.z0 >= host.rect.z0 - 1e-6 && r.z1 <= host.rect.z1 + 1e-6
      && !busy.some((b) => overlaps(r, b))
      && !out.some((o) => overlaps(r, o.rect));
    let placed: InteriorRect | null = null;
    for (const dz of SLIDES) {
      const tried = { ...moved.rect, z0: moved.rect.z0 + dz, z1: moved.rect.z1 + dz };
      if (fits(tried)) { placed = tried; break; }
    }
    if (!placed) continue;
    out.push({ ...moved, rect: placed });
  }
  return out;
}

/**
 * Le réseau d'une gare : son relevé s'il est branché, son hall sinon.
 *
 * La liste des gares branchées vit dans `data/stationConcourseWired`. Une gare
 * qui n'y est pas se comporte AU RECTANGLE PRÈS comme avant ; une gare qui y
 * est prend sa géométrie du relevé et son mobilier du moteur, dans la mesure
 * où celui-ci tient dans celle-là.
 */
export function networkFor(index: number, accessZ: number): ConcourseNetwork {
  const i = ((index % 30) + 30) % 30;
  const wired = wiredProfile(i);
  if (!wired) return legacyNetwork(i, interiorFor(i, accessZ));
  const net = compileProfile(wired, accessZ);
  const fixtures = fittedFixtures(net, interiorFor(i, accessZ));
  return { ...net, fixtures, obstacles: [...net.obstacles, ...fixtures.flatMap(interiorSolids)] };
}

// --- Ce que le compilateur a dû rogner -----------------------------------

export interface NetworkIssue {
  code: string;
  where: string;
  message: string;
}

/**
 * Ce que la géométrie a refusé au relevé.
 *
 * Un compilateur qui rogne en silence est un compilateur qui ment. Le relevé
 * énonce une INTENTION - « huit baies » - et la place disponible tranche ; quand
 * les deux ne s'accordent pas, cela se dit ici plutôt que de disparaître dans
 * un `Math.min`.
 */
export function networkIssues(
  p: StationConcourseProfile,
  net: ConcourseNetwork,
): NetworkIssue[] {
  const out: NetworkIssue[] = [];
  for (const g of p.gateGroups) {
    const laid = net.gates.find((x) => x.id === g.id);
    if (laid && laid.passages.length < g.passages) {
      const along = g.cross === 'z' ? 'x' : 'z';
      const len = along === 'x' ? g.rect.x1 - g.rect.x0 : g.rect.z1 - g.rect.z0;
      out.push({
        code: 'crampedGate',
        where: g.id,
        message: `${laid.passages.length} baies posées sur ${g.passages} demandées : `
          + `la ligne fait ${len.toFixed(2)} m sur ${along}`,
      });
    }
  }
  for (const zone of p.commercialZones) {
    if (!net.rooms.some((r) => r.id === zone.nodeId)) continue;
    const f = net.frontages.find((x) => x.id === zone.id);
    if (!f) {
      out.push({
        code: 'shopDropped',
        where: zone.id,
        message: 'devanture supprimée : le hall n’a pas la profondeur de la poser '
          + 'sans fermer le passage',
      });
      continue;
    }
    const max = zone.category === 'gallery' ? GALLERY_DEPTH : SHOP_DEPTH;
    const depth = f.along === 'z' ? f.rect.x1 - f.rect.x0 : f.rect.z1 - f.rect.z0;
    const want = Math.min(
      max,
      f.along === 'z' ? zone.rect.x1 - zone.rect.x0 : zone.rect.z1 - zone.rect.z0,
    );
    if (depth < want - 1e-6) {
      out.push({
        code: 'shopShallow',
        where: zone.id,
        message: `devanture ramenée de ${want.toFixed(2)} à ${depth.toFixed(2)} m de fond `
          + 'pour garder deux mètres de passage',
      });
    }
  }
  // Une ligne de portillons cotée à CÔTÉ de ses pièces : elle ne sépare alors
  // rien du tout, et l'on ne peut pas la franchir. Le compilateur la laisse où
  // le relevé la met plutôt que d'inventer, mais il refuse de se taire.
  for (const g of net.gates) {
    const from = net.rooms.find((r) => r.id === g.from);
    const to = net.rooms.find((r) => r.id === g.to);
    if (!from || !to) continue;
    const along: 'x' | 'z' = g.cross === 'z' ? 'x' : 'z';
    const seg = (r: InteriorRect) => (along === 'x' ? [r.x0, r.x1] : [r.z0, r.z1]);
    const [g0, g1] = seg(g.rect);
    const common = Math.min(...[from, to].map((r) => seg(r.rect)[1]))
      - Math.max(...[from, to].map((r) => seg(r.rect)[0]));
    const onBoth = [from, to].every((r) => {
      const [r0, r1] = seg(r.rect);
      return Math.min(g1, r1) - Math.max(g0, r0) > 0.5;
    });
    if (common <= 0 || !onBoth) {
      out.push({
        code: 'gateOffRoom',
        where: g.id,
        message: 'ligne cotée hors du recouvrement de ses deux pièces : '
          + 'elle ne se franchit pas',
      });
    }
  }
  // Une bouche posée SUR une devanture : cela n'arrive que si la paroi est
  // entièrement commerciale, où une sortie passe avant un magasin. Le cas se
  // dit, plutôt que de laisser croire qu'on entre dans la rue par la vitrine.
  for (const m of net.mouths) {
    for (const f of net.frontages) {
      if (f.roomId !== m.roomId || f.side !== m.side) continue;
      const [a, l] = wallSpan(f.rect, f.side);
      if (m.at + m.halfWidth <= a || m.at - m.halfWidth >= a + l) continue;
      out.push({
        code: 'mouthOverShop',
        where: m.id,
        message: `bouche posée sur la devanture ${f.id} : la paroi n'a plus de vide`,
      });
    }
  }
  for (const f of net.frontages) {
    const room = net.rooms.find((r) => r.id === f.roomId);
    if (!room) continue;
    // Ce qui reste à passer DEVANT la devanture, sur l'axe qu'elle mange.
    const left =
      f.along === 'z'
        ? Math.max(f.rect.x0 - room.rect.x0, room.rect.x1 - f.rect.x1)
        : Math.max(f.rect.z0 - room.rect.z0, room.rect.z1 - f.rect.z1);
    if (left < MIN_MAIN_WIDTH - 1e-6) {
      out.push({
        code: 'shopEatsAisle',
        where: f.id,
        message: `devanture de ${(f.rect.x1 - f.rect.x0).toFixed(2)} × `
          + `${(f.rect.z1 - f.rect.z0).toFixed(2)} m : il reste ${left.toFixed(2)} m `
          + `de passage, minimum ${MIN_MAIN_WIDTH} m`,
      });
    }
  }
  for (const m of net.mouths) {
    if (m.halfWidth < EXIT_HALF_X - 1e-6) {
      out.push({
        code: 'narrowMouth',
        where: m.id,
        message: `bouche rétrécie à ${(m.halfWidth * 2).toFixed(2)} m de large`,
      });
    }
  }
  return out;
}

// --- Les volumes continus ------------------------------------------------

/**
 * Un VOLUME CONTINU du réseau : ce que le rendu enveloppe d'un seul tenant.
 *
 * Une pièce n'est pas une salle fermée. La zone payante et la zone libre d'un
 * hall sont deux pièces - elles n'ont pas le même côté de la ligne - mais elles
 * partagent un sol, un plafond et deux parois : les dessiner séparément
 * poserait deux murs au droit du contrôle, là où il n'y a qu'un passage.
 *
 * Un volume est donc un GROUPE DE PIÈCES qui se touchent, directement ou par
 * une ligne de portillons franchissable. Le hall générique en donne exactement
 * un, aux mêmes cotes qu'avant ; Harajuku en donne deux, qui ne se touchent
 * pas et ne doivent surtout pas être enveloppés ensemble.
 */
export interface ConcourseShell {
  id: string;
  levelId: string;
  /** L'archétype de rendu : celui de la plus grande pièce du volume. */
  kind: ConcourseNodeKind;
  floorY: number;
  ceilY: number;
  /** Enveloppe du volume, lignes de portillons comprises. */
  rect: InteriorRect;
  rooms: ConcourseRoom[];
  gates: ConcourseGateLine[];
  mouths: ConcourseMouth[];
}

/** Deux rectangles se touchent-ils, à un jeu près ? */
function touches(a: InteriorRect, b: InteriorRect, eps = 0.02): boolean {
  return a.x0 <= b.x1 + eps && a.x1 >= b.x0 - eps
    && a.z0 <= b.z1 + eps && a.z1 >= b.z0 - eps;
}

function grow(a: InteriorRect, b: InteriorRect): InteriorRect {
  return {
    x0: Math.min(a.x0, b.x0),
    x1: Math.max(a.x1, b.x1),
    z0: Math.min(a.z0, b.z0),
    z1: Math.max(a.z1, b.z1),
  };
}

const SHELLS = new WeakMap<ConcourseNetwork, readonly ConcourseShell[]>();

/** Les volumes continus d'une gare, dans l'ordre des pièces. */
export function shellsOf(net: ConcourseNetwork): readonly ConcourseShell[] {
  const hit = SHELLS.get(net);
  if (hit) return hit;
  const walk = net.rooms.filter((r) => r.walkable);
  // Réunion par proche-en-proche : même niveau, et pièces qui se touchent ou
  // que franchit un portillon.
  const owner = new Map<string, number>();
  const groups: ConcourseRoom[][] = [];
  for (const r of walk) {
    const near = groups.findIndex((g) => g.some((o) => o.levelId === r.levelId
      && (touches(o.rect, r.rect)
        || net.gates.some((x) => x.walkable
          && ((x.from === o.id && x.to === r.id) || (x.from === r.id && x.to === o.id))))));
    if (near >= 0) groups[near].push(r);
    else groups.push([r]);
  }
  // Une seule passe ne suffit pas : A et C peuvent n'être joints que par B,
  // rencontré après. On refond tant que deux groupes se rejoignent.
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const join = groups[i].some((a) => groups[j].some((b) => a.levelId === b.levelId
          && (touches(a.rect, b.rect)
            || net.gates.some((x) => x.walkable
              && ((x.from === a.id && x.to === b.id) || (x.from === b.id && x.to === a.id))))));
        if (!join) continue;
        groups[i].push(...groups[j]);
        groups.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  const out = groups.map((rooms): ConcourseShell => {
    const ids = new Set(rooms.map((r) => r.id));
    for (const r of rooms) owner.set(r.id, 0);
    const gates = net.gates.filter((g) => ids.has(g.from) && ids.has(g.to));
    let rect = rooms[0].rect;
    for (const r of rooms) rect = grow(rect, r.rect);
    for (const g of gates) rect = grow(rect, g.rect);
    const area = (r: ConcourseRoom) => (r.rect.x1 - r.rect.x0) * (r.rect.z1 - r.rect.z0);
    const biggest = rooms.reduce((m, r) => (area(r) > area(m) ? r : m));
    return {
      id: rooms[0].id,
      levelId: rooms[0].levelId,
      kind: biggest.kind,
      floorY: rooms[0].floorY,
      ceilY: rooms[0].ceilY,
      rect,
      rooms,
      gates,
      mouths: net.mouths.filter((m) => ids.has(m.roomId)),
    };
  });
  SHELLS.set(net, out);
  return out;
}

/**
 * Portée du regard à l'intérieur d'un niveau de correspondance (m).
 *
 * Un hall de gare n'est pas transparent : au-delà d'une quarantaine de mètres
 * il n'y a plus de hall, il y a un virage, une palissade ou une autre gare. La
 * cote est celle du plus long volume qu'on parcourt d'un regard - le passage
 * libre de Shinagawa, le couloir central de Shinjuku - et pas un mètre de plus.
 */
const SIGHT = 40;

/**
 * Les volumes que le joueur peut VOIR d'où il est.
 *
 * Le hall était rendu d'un bloc dès qu'il existait (constat R2). Avec une gare
 * par volume la question ne se posait pas ; avec deux — Harajuku, Okachimachi —
 * elle se pose immédiatement : depuis le souterrain de Takeshita on ne voit pas
 * le bâtiment de 2020, qui est à quatre-vingt-dix mètres et douze mètres plus
 * haut, et le dessiner reviendrait à payer une gare qu'on ne regarde pas.
 *
 * DEUX SITUATIONS, et elles n'ont pas la même réponse :
 *
 *   · DEPUIS LE QUAI, on voit ce que la trémie laisse voir. Les volumes que
 *     dessert un accès vivant sont donc dessinés — c'est la vue qu'on a en
 *     descendant les marches, et la retirer creuserait un trou noir au fond de
 *     la cage ;
 *   · DANS LE HALL, on voit son volume, et ce qui est assez près sur le même
 *     niveau pour être dans le même regard. Le reste est derrière un virage,
 *     une palissade, ou tout simplement ailleurs.
 */
export function visibleShells(
  net: ConcourseNetwork,
  inConcourse: boolean,
  x: number,
  z: number,
): readonly ConcourseShell[] {
  const all = shellsOf(net);
  if (all.length <= 1) return all;
  if (!inConcourse) {
    const served = new Set(net.accesses.map((a) => a.toRoomId));
    return all.filter((s) => s.rooms.some((r) => served.has(r.id)));
  }
  const here = all.find((s) => x >= s.rect.x0 && x <= s.rect.x1
    && z >= s.rect.z0 && z <= s.rect.z1);
  /** Un ouvrage praticable joint-il ces deux volumes ? */
  const joined = (a: ConcourseShell, b: ConcourseShell) => net.joins.some((j) => {
    if (!j.walkable) return false;
    const inA = (id: string) => a.rooms.some((r) => r.id === id);
    const inB = (id: string) => b.rooms.some((r) => r.id === id);
    return (inA(j.from) && inB(j.to)) || (inB(j.from) && inA(j.to));
  });
  return all.filter((s) => {
    if (s === here) return true;
    // CE QU'UNE VOLÉE JOINT SE VOIT, quel que soit le niveau. La mezzanine
    // d'Okachimachi n'a pas de plafond : elle EST ce qu'on voit en levant les
    // yeux depuis le hall, et la masquer retirerait la coupe à trois niveaux
    // qui fait cette gare. La règle est topologique, pas géométrique - un
    // demi-étage d'écart ne cache rien quand un escalier les relie.
    if (here && joined(here, s)) return true;
    if (here && s.levelId !== here.levelId) return false;
    const dx = Math.max(s.rect.x0 - x, 0, x - s.rect.x1);
    const dz = Math.max(s.rect.z0 - z, 0, z - s.rect.z1);
    return Math.hypot(dx, dz) <= SIGHT;
  });
}

// --- Les baies, toutes lignes confondues ---------------------------------

/**
 * Une baie de portillon, rangée dans la suite PLATE de toute la gare.
 *
 * Le hall générique n'avait qu'une ligne : un rang de baie suffisait à
 * l'identifier, et `systems/fareGate` tenait un tableau d'états indexé dessus.
 * Une gare en a jusqu'à quatre - c'est même ce qui la rend reconnaissable - et
 * il faut donc un rang qui traverse les groupes. C'est celui-ci, et il ne
 * change rien pour une gare à une seule ligne : les rangs y sont les mêmes
 * qu'avant, dans le même ordre.
 *
 * Elle porte aussi ce qu'il faut pour répondre « où suis-je » sans avoir à
 * relire la géométrie : le milieu de la baie en repère quai, l'axe qu'on
 * franchit, et l'emprise de la ligne.
 */
export interface ConcourseBay {
  /** Rang plat, tous groupes confondus. C'est l'index d'état. */
  index: number;
  gateId: string;
  /** Milieu de la baie, repère quai. */
  x: number;
  z: number;
  width: number;
  wide: boolean;
  /** L'axe le long duquel on FRANCHIT la ligne. */
  cross: 'x' | 'z';
  /** Emprise de la ligne à laquelle cette baie appartient. */
  rect: InteriorRect;
  icOnly?: true;
  exitOnly?: true;
}

const BAYS = new WeakMap<ConcourseNetwork, readonly ConcourseBay[]>();

/** Toutes les baies franchissables d'une gare, dans l'ordre des groupes. */
export function concourseBays(net: ConcourseNetwork): readonly ConcourseBay[] {
  const hit = BAYS.get(net);
  if (hit) return hit;
  const out: ConcourseBay[] = [];
  if (net.built) {
    for (const g of net.gates) {
      if (!g.walkable) continue;
      for (const b of g.passages) {
        out.push({
          index: out.length,
          gateId: g.id,
          x: b.along === 'x' ? b.at : (g.rect.x0 + g.rect.x1) / 2,
          z: b.along === 'z' ? b.at : (g.rect.z0 + g.rect.z1) / 2,
          width: b.width,
          wide: b.wide,
          cross: g.cross,
          rect: g.rect,
          icOnly: g.icOnly,
          exitOnly: g.exitOnly,
        });
      }
    }
  }
  BAYS.set(net, out);
  return out;
}

/**
 * La baie sous un point, et sa distance à la LIGNE.
 *
 * Quatre endroits posaient la même question de quatre façons - la marche du
 * joueur, la foule, le son du mécanisme, la boucle des battants - et chacun
 * relisait la géométrie de la ligne à sa manière. Elle est posée une fois ici.
 *
 * `gap` vaut zéro ENTRE LES BORNES, et c'est ce qui fait qu'on ne pince
 * personne : un portillon réel attend d'être libre. `slack` élargit le fuseau
 * latéral - on se présente à une baie en la visant, pas en s'y alignant au
 * centimètre.
 */
export function bayAt(
  net: ConcourseNetwork,
  x: number,
  z: number,
  slack = 0,
): { bay: ConcourseBay; gap: number } | null {
  for (const bay of concourseBays(net)) {
    const r = bay.rect;
    // L'axe qu'on franchit porte l'écart à la ligne ; l'autre porte le fuseau.
    const across = bay.cross === 'x' ? x : z;
    const along = bay.cross === 'x' ? z : x;
    const lo = bay.cross === 'x' ? r.x0 : r.z0;
    const hi = bay.cross === 'x' ? r.x1 : r.z1;
    const gap = across < lo ? lo - across : across > hi ? across - hi : 0;
    const mid = bay.cross === 'x' ? bay.z : bay.x;
    if (Math.abs(along - mid) > bay.width / 2 + slack) continue;
    return { bay, gap };
  }
  return null;
}

// --- Interroger un réseau ------------------------------------------------

/**
 * La pièce praticable sous un point, ou null.
 *
 * C'est l'équivalent exact de `concourseFloorAt` (`systems/stationLevels`), à
 * ceci près qu'il y a maintenant N pièces à N altitudes au lieu d'une boîte.
 * La phase 8 en fera le sol du hall ; il vit ici pour que le compilateur se
 * prouve interrogeable avant qu'on lui confie les pieds du joueur.
 */
export function roomAt(net: ConcourseNetwork, x: number, z: number): ConcourseRoom | null {
  if (!net.built) return null;
  const inside = (r: InteriorRect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  for (const o of net.obstacles) if (inside(o)) return null;
  for (const r of net.rooms) {
    if (r.walkable && inside(r.rect)) return r;
  }
  // LA TRAVÉE DES PORTILLONS EST DU SOL, et ce n'est pas un détail : ce sont
  // ses BORNES qui barrent, pas la ligne. Une baie franchissable est exactement
  // le vide entre deux bornes - celui-là même que le rendu dessine. Le hall
  // générique n'avait pas à le dire, sa zone payante et sa zone libre se
  // touchant à travers elle ; deux pièces séparées, si.
  for (const g of net.gates) {
    if (!g.walkable || !inside(g.rect)) continue;
    const host = net.rooms.find((r) => r.id === g.from) ?? null;
    if (host?.walkable) return host;
  }
  return null;
}
