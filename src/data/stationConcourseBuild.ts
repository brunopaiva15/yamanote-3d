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
  fixtureBlocks,
  interiorSolids,
  type Fixture,
  type InteriorRect,
  type StationInterior,
} from './stationInterior.ts';
import {
  MIN_BRANCH_WIDTH,
  MIN_MAIN_WIDTH,
  isWalkable,
  type CommerceCategory,
  type CommerceStatus,
  type ConcourseLinkKind,
  type ConcourseNodeKind,
  type Depiction,
  type LandmarkKind,
  type FareSide,
  type StationConcourseProfile,
} from './stationConcourseTypes.ts';
import { CLEAR_HALL, STAIR_RISE } from './stationGeometry.ts';
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

/**
 * CE DONT ON SE SOUVIENT D'UNE GARE, et qui n'est ni un mur ni un meuble.
 *
 * Le 三角時計 de Shinagawa, la charpente rivetée d'Ueno, la trémie ouverte
 * d'Okachimachi. Le relevé les note depuis la phase 1 et rien ne les lisait :
 * ce sont des repères QUALITATIFS — aucun n'a d'emprise cotée, parce qu'un
 * plan officiel ne cote pas une horloge. Le compilateur les transmet tels
 * quels, avec la pièce où ils se tiennent ; c'est au rendu de savoir ce qu'un
 * `clock` ou un `artwork` veut dire, et de se taire sur ce qu'il ne sait pas
 * dessiner.
 */
export interface ConcourseLandmark {
  id: string;
  roomId: string;
  kind: LandmarkKind;
  rect: InteriorRect | null;
  note?: string;
  /**
   * Les fûts, pour un repère `column` — et vides pour tous les autres.
   *
   * Ils sont posés ici et NON dans le rendu : un poteau barre le passage, donc
   * la marche doit le connaître. Un fût qu'on traverse est exactement le
   * défaut que « une implantation, plusieurs lecteurs » existe pour empêcher.
   */
  posts: InteriorRect[];
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
  /** Les repères du lieu : ce dont on se souvient d'une gare. */
  landmarks: ConcourseLandmark[];
  /** Mobilier générique : billetterie, consignes, distributeurs. */
  fixtures: Fixture[];
  /** Tout ce qui barre : bornes, cloisons de chantier, mobilier. */
  obstacles: InteriorRect[];
  /**
   * La trémie principale, telle que le placement l'a posée.
   *
   * Le compilateur s'en sert déjà pour caler le relevé ; le RENDU en a besoin
   * aussi, et il n'y avait aucun moyen de la lui donner. Il centrait donc le
   * percement d'entrée sur le milieu du volume — juste dans un hall générique
   * où l'on descend au milieu, faux dans un pont-concourse de quarante-quatre
   * mètres dont l'accès arrive à sept mètres du bord.
   */
  accessX?: number;
  accessZ?: number;
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
  let lo = cross === 'z' ? rect.z0 : rect.x0;
  let hi = cross === 'z' ? rect.z1 : rect.x1;
  for (const r of rooms) {
    const [a0, a1] = cross === 'z' ? [r.rect.z0, r.rect.z1] : [r.rect.x0, r.rect.x1];
    // ON COMBLE UN JEU, ON NE TRAVERSE PAS UNE PIÈCE. Le cas à traiter est
    // celui de Tamachi : trente centimètres de vide entre la ligne et la zone
    // libre, sur lesquels la marche butait. Une pièce qui recouvre DÉJÀ la
    // ligne — à Shinjuku la zone payante fait soixante-six mètres et la ligne
    // est dedans — n'a aucun jeu à combler, et étirer la ligne jusqu'à son
    // bord opposé la remplirait de bornes sur dix mètres.
    if (a1 > lo + 1e-6 && a0 < hi - 1e-6) continue;
    if (a1 <= lo && lo - a1 <= GATE_BRIDGE) lo = a1;
    else if (a0 >= hi && a0 - hi <= GATE_BRIDGE) hi = a0;
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

/** Entraxe d'une file de poteaux et demi-section d'un fût (m). */
const COLUMN_PITCH = 7.2;
const COLUMN_HALF = 0.31;

/** Demi-largeur et profondeur du dégagement au pied d'une volée (m). */
const LANDING_HALF_X = 2.2;
const LANDING_CLEAR = 3.2;
/** Faute de mieux : l'abscisse ordinaire d'une trémie de quai. */
const STAIR_X_DEFAULT = 5.2;

/** Deux emprises se recouvrent-elles ? */
function overlapsRect(a: InteriorRect, b: InteriorRect): boolean {
  return a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6
    && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;
}

/**
 * Rogne `r` pour qu'il ne recouvre plus `keep`, sur son axe long.
 *
 * On garde le plus grand morceau restant, et rien si ce morceau n'est plus une
 * devanture — deux mètres vingt, la largeur en deçà de laquelle une vitrine
 * n'en est plus une.
 */
function clearOf(r: InteriorRect, keep: InteriorRect, along: 'x' | 'z'): InteriorRect | null {
  const [a0, a1] = along === 'z' ? [r.z0, r.z1] : [r.x0, r.x1];
  const [k0, k1] = along === 'z' ? [keep.z0, keep.z1] : [keep.x0, keep.x1];
  const runs: [number, number][] = [];
  if (k0 > a0) runs.push([a0, Math.min(k0, a1)]);
  if (k1 < a1) runs.push([Math.max(k1, a0), a1]);
  const best = runs.sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];
  if (!best || best[1] - best[0] < SHOP_MIN_LEN) return null;
  return along === 'z'
    ? { ...r, z0: best[0], z1: best[1] }
    : { ...r, x0: best[0], x1: best[1] };
}

/** Jeu maximal qu'une ligne de portillons comble jusqu'à sa pièce (m). */
const GATE_BRIDGE = 1;

/**
 * Longueur au-dessous de laquelle une ligne n'a plus une seule baie : une
 * baie étroite et ses deux joues de rive.
 */
const GATE_MIN_RUN = PASSAGE_W + 4 * CABINET_HALF_X;

/**
 * L'AXE D'UN OUVRAGE DE LIAISON, et le sens dans lequel il descend.
 *
 * Il vient des DEUX PIÈCES et non de la forme du rectangle. Le premier réflexe
 * — « l'ouvrage est plus long qu'il n'est large, donc la pente suit sa
 * longueur » — se trompe dès la première volée réelle : celle de la mezzanine
 * d'Okachimachi fait cinq mètres soixante de large pour trois de long. Ce qui
 * décide, c'est l'axe qui SÉPARE les deux pièces ; la forme ne tranche que si
 * elles sont l'une au-dessus de l'autre.
 *
 * Publié parce que DEUX lecteurs en dépendent : la marche, qui donne l'altitude
 * sous les pieds (`systems/stationLevels`), et le rendu, qui pose les marches
 * (`three/station/Ouvrage`). Une volée dessinée ailleurs que là où l'on marche
 * est le défaut que ce chantier s'interdit depuis la phase 1.
 */
export interface JoinAxis {
  /** La pente suit-elle z ? Sinon elle suit x. */
  alongZ: boolean;
  /** `from` est-il du côté des petites valeurs de l'axe ? */
  forward: boolean;
  /** Longueur de l'ouvrage sur son axe de pente. */
  span: number;
}

export function joinAxis(net: ConcourseNetwork, j: ConcourseJoin): JoinAxis | null {
  const a = net.rooms.find((n) => n.id === j.from);
  const b = net.rooms.find((n) => n.id === j.to);
  if (!a || !b) return null;
  const r = j.rect;
  const midA = { x: (a.rect.x0 + a.rect.x1) / 2, z: (a.rect.z0 + a.rect.z1) / 2 };
  const midB = { x: (b.rect.x0 + b.rect.x1) / 2, z: (b.rect.z0 + b.rect.z1) / 2 };
  const gapX = Math.abs(midB.x - midA.x);
  const gapZ = Math.abs(midB.z - midA.z);
  const alongZ = Math.abs(gapZ - gapX) > 1e-6 ? gapZ > gapX : r.z1 - r.z0 >= r.x1 - r.x0;
  const span = alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
  if (span <= 0) return null;
  return { alongZ, forward: alongZ ? midA.z <= midB.z : midA.x <= midB.x, span };
}

/**
 * L'altitude d'un ouvrage à l'avancement `t`, compté de `from` vers `to`.
 *
 * Une volée descend PAR MARCHES, une rampe et un couloir descendent tout
 * droit : c'est ce que le relevé déclare, et c'est ce que la marche doit
 * rendre — sans quoi on flotte au-dessus des nez ou l'on s'enfonce dedans.
 */
export function joinFloorProfile(j: ConcourseJoin, t: number): number {
  const drop = j.toY - j.fromY;
  if (j.kind !== 'stairs') return j.fromY + drop * t;
  const steps = Math.max(1, Math.round(Math.abs(drop) / STAIR_RISE));
  // Le palier de départ compte pour une part : on marche à plat avant la
  // première contremarche, comme sur toute volée publique.
  const k = Math.min(steps, Math.floor(t * (steps + 1)));
  return j.fromY + (drop * k) / steps;
}

/** Deux emprises se touchent-elles, à `slack` près ? */
function touchesRect(a: InteriorRect, b: InteriorRect, slack: number): boolean {
  return a.x0 <= b.x1 + slack && a.x1 >= b.x0 - slack
    && a.z0 <= b.z1 + slack && a.z1 >= b.z0 - slack;
}

/** La plus longue portion de `[from, from+len]` qu'aucun `busy` ne couvre. */
function longestFreeRun(
  from: number,
  len: number,
  busy: readonly [number, number][],
): [number, number] {
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
  const best = runs.sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];
  // Tout est fermé : on rend la ligne entière plutôt qu'une gare sans contrôle.
  if (!best || best[1] - best[0] < 1.2) return [from, len];
  return [best[0], best[1] - best[0]];
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
/** Et en deçà de cette longueur non plus. */
const SHOP_MIN_LEN = 2.2;

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
  /**
   * L'abscisse de la trémie sur le quai.
   *
   * Elle ne sert qu'à une chose, et elle est indispensable : DÉGAGER LE PIED DE
   * LA VOLÉE. Le relevé pose ses vitrines le long des parois, et rien ne lui dit
   * que l'escalier débouche là — à Shinjuku, une galerie de vingt mètres tombait
   * pile devant la dernière marche.
   */
  accessX: number = STAIR_X_DEFAULT,
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
  // LE PIED DES VOLÉES : ce qu'on ne meuble pas, et ce qu'on ne vitre pas.
  const landings: InteriorRect[] = [];
  for (const a of p.platformAccesses) {
    if (!isWalkable(a.depiction)) continue;
    const room = byId.get(a.toNodeId);
    if (!room) continue;
    // On arrive par le bord le plus proche de la trémie, sur l'axe z.
    const near = Math.abs(room.rect.z0 - accessZ) <= Math.abs(room.rect.z1 - accessZ)
      ? room.rect.z0
      : room.rect.z1;
    const into = near === room.rect.z0
      ? { z0: near, z1: near + LANDING_CLEAR }
      : { z0: near - LANDING_CLEAR, z1: near };
    landings.push({
      x0: accessX - LANDING_HALF_X,
      x1: accessX + LANDING_HALF_X,
      ...into,
    });
  }

  // Les cloisons de chantier barrent : c'est leur seul rôle, et c'est celui
  // qu'elles ont en vrai.
  const hoardings = (p.works?.partitions ?? []).flatMap((part) => {
    const rect = shifted(part.rect, dz);
    // UNE PALISSADE NE MURE PAS UN ESCALIER. Le chantier de Shinjuku ferme
    // vingt mètres du B1F, et le pied de la volée tombe dedans : la gare
    // n'aurait plus d'entrée du tout. Le plan ne dit pas cela — il dit que le
    // sud est fermé, pas que la gare l'est. La palissade se retire donc du
    // débouché, et le compilateur le DIT (`hoardingAtLanding`).
    const hit = landings.find((l) => overlapsRect(l, rect));
    if (!hit) return [{ id: part.id, roomId: part.nodeId, rect, kind: part.kind, noticeEn: part.noticeEn }];
    const along: 'x' | 'z' = rect.x1 - rect.x0 >= rect.z1 - rect.z0 ? 'x' : 'z';
    const cut = clearOf(rect, hit, along);
    if (!cut) return [];
    return [{ id: part.id, roomId: part.nodeId, rect: cut, kind: part.kind, noticeEn: part.noticeEn }];
  });
  for (const h of hoardings) obstacles.push(h.rect);
  // LES REPÈRES DU LIEU, et les POTEAUX qui en sont.
  //
  // Une file de poteaux se dessinait dans le rendu, et elle ne barrait rien :
  // le joueur traversait des fûts de soixante centimètres comme de la fumée.
  // C'est la faute que ce chantier s'interdit depuis la phase 1 — une seule
  // implantation, plusieurs lecteurs. Les poteaux sont donc POSÉS ICI, avec
  // leur emprise, et le rendu les lit au lieu de les recalculer.
  const landmarks: ConcourseLandmark[] = [];
  for (const l of p.landmarks) {
    const room = byId.get(l.nodeId);
    if (!room) continue;
    const rect = l.rect ? shifted(l.rect, dz) : null;
    const posts: InteriorRect[] = [];
    if (l.kind === 'column') {
      const r = rect ?? room.rect;
      const long: 'x' | 'z' = r.x1 - r.x0 >= r.z1 - r.z0 ? 'x' : 'z';
      const len = long === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
      const n = Math.max(1, Math.floor(len / COLUMN_PITCH));
      const across = long === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
      for (let k = 0; k < n; k++) {
        const at = (long === 'x' ? r.x0 : r.z0) + ((k + 0.5) * len) / n;
        const post = long === 'x'
          ? { x0: at - COLUMN_HALF, x1: at + COLUMN_HALF, z0: across - COLUMN_HALF, z1: across + COLUMN_HALF }
          : { x0: across - COLUMN_HALF, x1: across + COLUMN_HALF, z0: at - COLUMN_HALF, z1: at + COLUMN_HALF };
        // UN FÛT DERRIÈRE UNE PALISSADE N'EST PAS UN REPÈRE DU HALL. La file
        // traverse la pièce entière ; le chantier de Tamachi en ferme une part,
        // et le poteau qui y tombe est de l'autre côté de la cloison — on ne le
        // voit pas, on ne s'y cogne pas. Le relevé cote la palissade, l'entraxe
        // des fûts est composé : c'est donc le fût qui cède.
        if (hoardings.some((h) => h.roomId === l.nodeId && overlapsRect(h.rect, post))) continue;
        posts.push(post);
      }
      obstacles.push(...posts);
    }
    landmarks.push({ id: l.id, roomId: l.nodeId, kind: l.kind, rect, note: l.note, posts });
  }


  /** Ce que les lignes déjà posées occupent : deux 改札 ne se superposent pas. */
  const laid: InteriorRect[] = [];
  const gates: ConcourseGateLine[] = p.gateGroups.map((g) => {
    // LA LIGNE JOINT SES DEUX PIÈCES, sans un centimètre de vide. Le relevé
    // cote l'emprise du contrôle et les pièces de part et d'autre séparément :
    // à Tamachi il restait trente centimètres entre la ligne et la zone libre,
    // trente centimètres qui n'appartenaient à rien et sur lesquels la marche
    // butait comme sur un mur. Le franchissement, lui, est continu par
    // définition — on ne saute pas un fossé au milieu d'un 改札.
    const spanned = spanRooms(shifted(g.rect, dz), g.cross, byId.get(g.from), byId.get(g.to));
    // Les baies s'alignent sur l'axe PERPENDICULAIRE à celui qu'on franchit.
    const along: 'x' | 'z' = g.cross === 'z' ? 'x' : 'z';
    // ET DEUX LIGNES NE PARTAGENT PAS LE MÊME SOL. Un plan de gare japonais n'a
    // pas d'échelle : ce que le relevé dit d'un 出口専用, c'est de quel côté il
    // est et combien il a de baies — sa LARGEUR, elle, est composée. À
    // Shin-Ōkubo et à Yūrakuchō, deux lignes voisines se recouvraient de
    // soixante centimètres, et leurs armoires s'interpénétraient. La première
    // posée garde sa cote ; celles qui suivent se rangent dans ce qui reste.
    const taken = laid
      .filter((o) => o.x0 < spanned.x1 - 1e-6 && o.x1 > spanned.x0 + 1e-6
        && o.z0 < spanned.z1 - 1e-6 && o.z1 > spanned.z0 + 1e-6)
      .map((o) => (along === 'x' ? [o.x0, o.x1] : [o.z0, o.z1]) as [number, number]);
    // On garde la plus longue portion LIBRE, quelle qu'elle soit — et non « la
    // ligne entière si tout est pris », qui est le repli d'une palissade
    // (`longestFreeRun`). Une ligne qui n'a plus la place d'une seule baie
    // rétrécit et le dit (`crampedGate`) ; deux lignes qui se superposent, elles,
    // ne se voient pas et se traversent.
    let runs: [number, number][] = [[
      along === 'x' ? spanned.x0 : spanned.z0,
      along === 'x' ? spanned.x1 : spanned.z1,
    ]];
    for (const [b0, b1] of taken) {
      runs = runs.flatMap(([s0, s1]) => {
        if (b1 <= s0 || b0 >= s1) return [[s0, s1] as [number, number]];
        const keep: [number, number][] = [];
        if (b0 > s0) keep.push([s0, Math.min(b0, s1)]);
        if (b1 < s1) keep.push([Math.max(b1, s0), s1]);
        return keep;
      });
    }
    const whole: [number, number] = [
      along === 'x' ? spanned.x0 : spanned.z0,
      along === 'x' ? spanned.x1 : spanned.z1,
    ];
    const widest = runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0] ?? whole;
    // SAUF S'IL NE RESTE PAS DE QUOI FRANCHIR. Un contrôle rogné au point de
    // n'avoir plus une seule baie ne serait plus un contrôle : on garde alors la
    // cote du relevé telle quelle, et `networkIssues` DIT la superposition
    // plutôt que de la maquiller. C'est le cas de Shin-Ōkubo, dont les deux
    // lignes demandent 5,80 m dans un hall qui en fait 5,20.
    const kept = widest[1] - widest[0] >= GATE_MIN_RUN ? widest : whole;
    const [free0, freeLen] = [kept[0], kept[1] - kept[0]];
    const rect: InteriorRect = along === 'x'
      ? { ...spanned, x0: free0, x1: free0 + freeLen }
      : { ...spanned, z0: free0, z1: free0 + freeLen };
    laid.push(rect);
    const from = along === 'x' ? rect.x0 : rect.z0;
    const len = along === 'x' ? rect.x1 - rect.x0 : rect.z1 - rect.z0;
    // UNE PALISSADE FERME LES BAIES QU'ELLE MASQUE. Le chantier de Shinagawa
    // barre trente et un mètres de la zone payante, juste devant le contrôle
    // central : les baies, centrées sur la ligne, se retrouvaient toutes
    // derrière, et la gare n'avait plus un seul passage atteignable. Le relevé
    // cote la palissade ; la position des baies, elle, est composée — c'est donc
    // elle qui se déplace, et ce qui reste de la ligne devient une joue pleine.
    const shut = hoardings
      .filter((h) => (h.roomId === g.from || h.roomId === g.to)
        && touchesRect(h.rect, rect, 0.5))
      .map((h) => (along === 'x'
        ? [h.rect.x0 - 0.3, h.rect.x1 + 0.3]
        : [h.rect.z0 - 0.3, h.rect.z1 + 0.3]) as [number, number]);
    const [runFrom, runLen] = longestFreeRun(from, len, shut);
    const { bays, edges } = layBays(
      baysThatFit(g.passages, runLen),
      runFrom,
      runLen,
      g.wideAt !== 'start',
    );
    // Les joues de rive vont jusqu'aux bouts de la LIGNE, pas jusqu'aux bouts de
    // la trouée : ce qui est fermé doit être plein.
    if (edges.length > 0) {
      edges[0] = [Math.min(edges[0][0], from), edges[0][1]];
      const last = edges.length - 1;
      edges[last] = [edges[last][0], Math.max(edges[last][1], from + len)];
    }
    const cabinets = edges.map(([a, b]) =>
      along === 'x'
        ? { x0: a, x1: b, z0: rect.z0, z1: rect.z1 }
        : { x0: rect.x0, x1: rect.x1, z0: a, z1: b });
    // ON NE SE COGNE PAS À CE QUI EST DE L'AUTRE CÔTÉ D'UN SOL. Les bornes
    // d'une ligne qu'on REGARDE sans la prendre — le contrôle du Shiodome, deux
    // niveaux sous le hall de Shimbashi — barraient le hall d'au-dessus : la
    // marche ne connaît qu'un étage de correspondance, et une emprise posée
    // dans une pièce où l'on ne met pas les pieds y devenait un mur invisible.
    // Une ligne dont les deux pièces sont seulement montrées ne barre donc
    // rien ; celle qu'on longe sans la franchir, elle, en est bien un.
    const seen = byId.get(g.from)?.walkable || byId.get(g.to)?.walkable;
    if (seen) obstacles.push(...cabinets);
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
    let clear = trimToFront(rect, side, Math.max(0, room4));
    // Et l'on ne pose rien devant le pied d'une volée.
    const hit = landings.find((l) => overlapsRect(l, clear));
    if (hit) {
      const cut = clearOf(clear, hit, along);
      if (!cut) continue;
      clear = cut;
    }
    // ET RIEN DERRIÈRE UNE PALISSADE. Le chantier d'août 2026 ferme le sud du
    // B1F de Shinjuku, et une devanture du relevé y tombe : une vitrine qu'on
    // ne peut ni voir ni longer n'est pas une vitrine, c'est un mur peint. La
    // palissade est relevée, la profondeur de la devanture est composée — c'est
    // donc la devanture qui se retire, et `shopDropped` le dit si rien ne reste.
    for (const h of hoardings) {
      if (h.roomId !== zone.nodeId || !overlapsRect(h.rect, clear)) continue;
      const cut = clearOf(clear, h.rect, along);
      if (!cut) { clear = { ...clear, x1: clear.x0, z1: clear.z0 }; break; }
      clear = cut;
    }
    const kept = across === 'x' ? clear.x1 - clear.x0 : clear.z1 - clear.z0;
    const run = along === 'x' ? clear.x1 - clear.x0 : clear.z1 - clear.z0;
    // Moins d'un mètre vingt : ce n'est plus une devanture, c'est une plinthe.
    if (kept < SHOP_MIN_DEPTH || run < SHOP_MIN_LEN) continue;
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
      // Et les PALISSADES DE CHANTIER : à Shibuya, les travaux d'août 2026
      // couvrent huit mètres de la paroi ouest, et la sortie du même nom s'y
      // ouvrait. Une sortie qui donne dans un chantier n'est pas une sortie —
      // et c'est le relevé qui cote la palissade, pas la bouche.
      ...hoardings
        .filter((h) => h.roomId === roomId && touchesWall(room.rect, h.rect, side))
        .map((h) => wallSpan(h.rect, side)),
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
    landmarks,
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
    // Le hall générique n'a pas de repère : il n'est celui d'aucune gare.
    landmarks: [],
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
interface Busy { rect: InteriorRect | null; floorY: number }

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
  /**
   * UNE COTE APPARTIENT À SON ÉTAGE. Le dégagement d'une ligne de portillons
   * barre toute la largeur de SA pièce ; comparé à plat, il barrait aussi celle
   * de la pièce posée quatre mètres plus bas. Shimbashi a trois niveaux qui se
   * superposent, et la boutique du B1F disparaissait à cause du contrôle du
   * Shiodome, qui est au B2F.
   */
  const floorOfRoom = (id: string): number =>
    net.rooms.find((r) => r.id === id)?.floorY ?? NaN;
  /**
   * L'étage de chaque emprise de `net.obstacles`, retrouvé par sa SOURCE.
   *
   * La liste des obstacles est plate — c'est ce qui la rend lisible par la
   * marche — mais chacun vient d'un objet qui sait à quelle pièce il
   * appartient. On refait donc le chemin inverse, une fois, plutôt que de
   * deviner par géométrie : les bornes d'une ligne de portillons ne sont dans
   * AUCUNE de ses deux pièces (elles sont entre les deux), et une recherche par
   * contenance les aurait laissées barrer tous les étages.
   */
  const key = (r: InteriorRect) => `${r.x0}|${r.x1}|${r.z0}|${r.z1}`;
  const owner = new Map<string, number>();
  for (const g of net.gates) {
    for (const c of g.cabinets) owner.set(key(c), floorOfRoom(g.from));
  }
  for (const f of net.frontages) owner.set(key(f.rect), floorOfRoom(f.roomId));
  for (const h of net.hoardings) owner.set(key(h.rect), floorOfRoom(h.roomId));
  for (const l of net.landmarks) {
    for (const q of l.posts) owner.set(key(q), floorOfRoom(l.roomId));
  }
  // Faute de source connue, l'emprise barre tous les étages : mieux vaut un
  // meuble de moins qu'un meuble dans un mur.
  const floorUnder = (r: InteriorRect): number => owner.get(key(r)) ?? NaN;
  const busy: Busy[] = [
    ...net.obstacles.map((rect) => ({ rect, floorY: floorUnder(rect) })),
    ...net.gates.map((g) => ({ rect: gateClear(g), floorY: floorOfRoom(g.from) })),
    ...net.mouths
      .map((m) => ({ rect: mouthClear(m), floorY: floorOfRoom(m.roomId) }))
      .filter((b): b is Busy => b.rect !== null),
    ...net.transfers
      .map((t) => ({ rect: t.rect, floorY: floorOfRoom(t.fromRoomId) }))
      .filter((b): b is Busy => b.rect !== null),
  ];
  const overlaps = (a: InteriorRect, b: InteriorRect) =>
    a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;
  const out: Fixture[] = [];
  // LE GROS D'ABORD, LE PETIT DANS CE QUI RESTE. Un konbini de 7,80 m sur
  // 3,40 m n'a qu'une poignée de places dans un hall relevé ; une poubelle en a
  // cent. Servir la liste dans son ordre d'écriture laissait une corbeille de
  // cinquante centimètres occuper la seule tranche de paroi où la boutique
  // tenait, et la gare perdait son commerce pour une poubelle. L'ordre de
  // SORTIE, lui, reste celui du relevé : c'est celui que le rendu attend.
  const order = it.fixtures
    .map((f, k) => ({ f, k }))
    .sort((a, b) =>
      (b.f.rect.x1 - b.f.rect.x0) * (b.f.rect.z1 - b.f.rect.z0)
      - (a.f.rect.x1 - a.f.rect.x0) * (a.f.rect.z1 - a.f.rect.z0)
      || a.k - b.k);
  /** Le rang d'écriture de chaque meuble posé, dans l'ordre où on l'a posé. */
  const ranks: number[] = [];
  for (const { f, k: rank } of order) {
    // La pièce du relevé qui reprend cette tranche de hall : celle qui la
    // RECOUVRE LE PLUS. Exiger qu'elle la contienne entièrement vidait les
    // gares dont les pièces sont plus courtes que le hall générique — à
    // Harajuku, quatorze meubles sur seize disparaissaient parce que le
    // souterrain de Takeshita fait sept mètres et le hall générique vingt-sept.
    // Les pièces candidates, de la mieux recouvrante à la moins : on essaie la
    // tranche de hall qui correspond, PUIS les autres. Un konbini de 7,80 m sur
    // 3,40 m ne rentre pas partout, et le refuser dès la première pièce vidait
    // les gares dont le relevé découpe le hall autrement — il n'en restait plus
    // qu'un sur les trente.
    // ET LE CÔTÉ DU CONTRÔLE PASSE AVANT LE RECOUVREMENT. Le hall générique
    // sait une chose de son mobilier qu'aucune cote ne dit : de quel côté des
    // portillons il est. Un konbini rangé au fond de la zone libre qui se
    // retrouverait dans la zone payante d'un relevé parce que la pièce payante
    // le recouvre mieux ne serait plus le même commerce — et personne n'irait :
    // la visite ne se tire qu'en zone libre (`systems/concourseRoute`).
    const side: FareSide = f.rect.z0 >= (it.paid.z1 + it.free.z0) / 2 ? 'free' : 'paid';
    const len = f.rect.z1 - f.rect.z0;
    const candidates = rooms
      .map((r) => ({
        r,
        cover: Math.min(f.rect.z1, r.rect.z1) - Math.max(f.rect.z0, r.rect.z0),
      }))
      .filter((c) => c.r.rect.z1 - c.r.rect.z0 >= len)
      .sort((a, b) => (a.r.fare === side ? 0 : 1) - (b.r.fare === side ? 0 : 1)
        || b.cover - a.cover)
      .map((c) => c.r);
    if (candidates.length === 0) continue;
    let placed: InteriorRect | null = null;
    let facing: Fixture['facing'] = f.facing;
    for (const room of candidates) {
      /** Cette emprise gêne-t-elle CE sol-là ? Une cote sans étage gêne partout. */
      const here = (b: Busy): b is Busy & { rect: InteriorRect } =>
        b.rect !== null && (Number.isNaN(b.floorY) || Math.abs(b.floorY - room.floorY) < 1e-6);
      const dz0 = Math.min(Math.max(f.rect.z0, room.rect.z0), room.rect.z1 - len) - f.rect.z0;
      /**
       * Ce qui reste À TRAVERS la pièce une fois ce meuble posé.
       *
       * Ne pas se chevaucher ne suffit pas : un distributeur de 78 cm posé
       * contre la paroi d'en face d'une galerie de 3,60 m laisse 1,32 m dans un
       * couloir de 5,70, soit 1,20 m une fois la garde de marche comptée. Ce
       * n'est plus un couloir, c'est un goulet — et c'est le constat #9 du
       * cahier des charges. On mesure donc la trouée qui reste, à l'endroit
       * précis où le meuble se pose.
       */
      const aisle = (r: InteriorRect): number => {
        const cuts = [...busy.filter(here).map((b) => b.rect), ...out.map((o) => o.rect), r]
          .filter((b) => b.z0 < r.z1 - 1e-6 && b.z1 > r.z0 + 1e-6)
          .map((b) => [b.x0, b.x1] as [number, number])
          .sort((a, b) => a[0] - b[0]);
        let best = 0;
        let at = room.rect.x0;
        for (const [b0, b1] of cuts) {
          if (b0 > at) best = Math.max(best, b0 - at);
          at = Math.max(at, b1);
        }
        return Math.max(best, room.rect.x1 - at);
      };
      const fits = (r: InteriorRect) =>
        r.z0 >= room.rect.z0 - 1e-6 && r.z1 <= room.rect.z1 + 1e-6
        && !busy.some((b) => here(b) && overlaps(r, b.rect))
        && !out.some((o) => overlaps(r, o.rect))
        && aisle(r) >= MIN_BRANCH_WIDTH + 2 * CLEAR_HALL - 1e-6;
      // UN MEUBLE DE GARE EST CONTRE UN MUR. Le hall générique range le sien
      // contre ses deux parois, à 2,13 m et 7,63 m de l'axe de la voie ; un
      // pont-concourse relevé fait vingt-huit mètres de large, et le même meuble
      // laissé à sa cote se retrouvait planté au MILIEU du volume, coupant le
      // passage en deux. On le ramène donc contre la paroi vers laquelle il
      // regarde — c'est là qu'il est en vrai.
      //
      // ET SI CETTE PAROI-LÀ EST PRISE, ON ESSAIE L'AUTRE. Contre QUELLE des
      // deux parois un meuble s'adosse est une décision du moteur et non une
      // cote du relevé : à Ikebukuro, la paroi que le konbini regarde est celle
      // des portillons, et s'y tenir le renvoyait dans la zone payante — où
      // personne ne fait ses courses, la visite ne se tirant qu'en zone libre.
      const ways: Fixture['facing'][] = f.facing === 1 ? [1, -1] : [-1, 1];
      for (const way of ways) {
        const dx = way === 1 ? room.rect.x0 - f.rect.x0 : room.rect.x1 - f.rect.x1;
        const tried0: InteriorRect = {
          x0: f.rect.x0 + dx,
          x1: f.rect.x1 + dx,
          z0: f.rect.z0 + dz0,
          z1: f.rect.z1 + dz0,
        };
        if (tried0.x0 < room.rect.x0 - 1e-6 || tried0.x1 > room.rect.x1 + 1e-6) continue;
        // ET IL GLISSE LE LONG DE SA PAROI plutôt que de disparaître. Le konbini
        // du hall générique est au fond de la zone libre, c'est-à-dire là où le
        // relevé perce ses bouches : refusé sur place, il emportait avec lui la
        // boutique de la moitié des gares. On l'essaie de proche en proche, de
        // part et d'autre, avant de passer à la pièce suivante.
        for (const dz of SLIDES) {
          const tried = { ...tried0, z0: tried0.z0 + dz, z1: tried0.z1 + dz };
          if (fits(tried)) { placed = tried; facing = way; break; }
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (!placed) continue;
    ranks.push(rank);
    out.push({ ...f, facing, rect: placed });
  }
  return out
    .map((f, k) => ({ f, rank: ranks[k] }))
    .sort((a, b) => a.rank - b.rank)
    .map((e) => e.f);
}

/**
 * Le réseau d'une gare : son relevé s'il est branché, son hall sinon.
 *
 * La liste des gares branchées vit dans `data/stationConcourseWired`. Une gare
 * qui n'y est pas se comporte AU RECTANGLE PRÈS comme avant ; une gare qui y
 * est prend sa géométrie du relevé et son mobilier du moteur, dans la mesure
 * où celui-ci tient dans celle-là.
 */
export function networkFor(index: number, accessZ: number, accessX?: number): ConcourseNetwork {
  const i = ((index % 30) + 30) % 30;
  const wired = wiredProfile(i);
  if (!wired) return { ...legacyNetwork(i, interiorFor(i, accessZ)), accessX, accessZ };
  const net = compileProfile(wired, accessZ, accessX);
  const fixtures = fittedFixtures(net, interiorFor(i, accessZ));
  // `fixtureBlocks` et non « tout le mobilier » : un panneau encastré dans la
  // paroi ne se contourne pas, et le hall générique l'écarte déjà de ses
  // obstacles. Les deux chemins répondent la même chose à la même question.
  return {
    ...net,
    fixtures,
    obstacles: [...net.obstacles, ...fixtures.filter(fixtureBlocks).flatMap(interiorSolids)],
    accessX,
    accessZ,
  };
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
  // DEUX LIGNES QUI SE PARTAGENT DU SOL. Le compilateur range la seconde dans ce
  // que la première laisse ; quand ce qui reste n'a plus la place d'une seule
  // baie, il garde la cote du relevé plutôt que de rendre un contrôle qu'on ne
  // franchit pas — et il le DIT ici. Le cas vient d'une largeur composée : un
  // plan japonais n'a pas d'échelle, et les deux lignes de Shin-Ōkubo demandent
  // 5,80 m dans un hall qui en fait 5,20.
  for (let a = 0; a < net.gates.length; a++) {
    for (let b = a + 1; b < net.gates.length; b++) {
      const u = net.gates[a].rect;
      const v = net.gates[b].rect;
      if (!(u.x0 < v.x1 - 1e-6 && u.x1 > v.x0 + 1e-6
        && u.z0 < v.z1 - 1e-6 && u.z1 > v.z0 + 1e-6)) continue;
      out.push({
        code: 'gateOverlap',
        where: `${net.gates[a].id}+${net.gates[b].id}`,
        message: 'deux lignes de portillons se partagent du sol : leurs largeurs '
          + 'relevées ne tiennent pas dans la pièce',
      });
    }
  }
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
    // DEPUIS LE QUAI, on voit ce qu'une trémie dessert — ET CE QUI SUIT. Une
    // trémie ne débouche pas toujours dans le hall : à Okachimachi elle arrive
    // sur le demi-niveau, d'où l'on redescend. S'arrêter à la pièce desservie
    // masquait le hall lui-même, dont les portillons et le mobilier
    // continuaient pourtant de se dessiner : une ligne de contrôle suspendue
    // au-dessus de la rue, et rien autour.
    const served = new Set(net.accesses.map((a) => a.toRoomId));
    for (let more = true; more;) {
      more = false;
      for (const j of net.joins) {
        if (!j.walkable) continue;
        if (served.has(j.from) && !served.has(j.to)) { served.add(j.to); more = true; }
        if (served.has(j.to) && !served.has(j.from)) { served.add(j.from); more = true; }
      }
    }
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
