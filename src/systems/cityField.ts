// Génération du ruban urbain qui borde la voie : un tissu de bâtiments POSÉS
// DANS LE MONDE, à une abscisse fixe, que le train dépasse. Rien ne glisse,
// rien ne défile : c'est le train qui avance.
//
// C'était le défaut de fond du décor précédent. La ville y était peinte sur
// trois plans fixes et c'est la TEXTURE qui coulait (`offset.x = distance /
// metersPerRepeat`), à une vitesse sans rapport avec celle du train - 1,67×
// sur la couche proche. L'œil lit ça immédiatement comme un décor tiré au fil.
//
// --- Découpage ---
// Le ruban est découpé en cellules de CELL_LEN mètres le long de la voie. Une
// cellule est engendrée à partir de son seul index monde : deux passages sur la
// même cellule donnent le même quartier. Le rendu n'en garde qu'un anneau
// glissant (voir three/city/CityRibbon), rebâti une cellule à la fois.
//
// --- Cinq rangs, en deux mailles ---
// Un bord de voie bas et serré, un rang d'îlot, un fond haut. C'est cette
// stratification qui produit l'occultation mutuelle et donc la profondeur ; un
// plan unique, aussi bien dessiné soit-il, reste du carton.
//
// Ces trois-là tiennent dans les soixante-six premiers mètres, à la maille de
// CELL_LEN. Au-delà commence l'ARRIÈRE-PAYS (FAR_RANKS), deux rangs de plus
// jusqu'à deux cent soixante mètres, à sa propre maille de FAR_CELL_LEN : à
// cette distance on ne lit plus un îlot mais une masse et une ligne de faîte,
// et une maille grossière la tient pour quelques dizaines d'instances.
//
// --- Les rues ---
// Une cellule sur deux environ est traversée par une rue perpendiculaire, qui
// perce les TROIS rangs au même endroit. C'est le seul moment où le regard
// s'enfonce dans la ville, et c'est le meilleur révélateur de vitesse qui soit
// en train.
//
// --- La trame ---
// Rien n'oblige un plan de ville à s'aligner sur une voie ferrée, et à Tokyo
// il ne s'y aligne à peu près jamais : la Yamanote a été tracée dans les
// creux, entre des quartiers dont les trames sont antérieures et
// indépendantes. Tant que tous les bâtiments avaient leurs faces parallèles
// aux rails, une rangée se relisait comme une pile de boîtes à chaussures -
// c'est le défaut que `gridAngleAt` corrige, pour un coût nul (la matrice
// d'instance porte déjà une rotation qu'on laissait à l'identité).

// Les imports portent leur extension : ce module est chargé tel quel par node
// pour les tests (tests/trafficLane.test.ts), qui n'a pas la résolution d'un
// empaqueteur.
import { DISTRICTS, GENERIC, type District, type Feat } from '../data/districts.ts';
import { directionStep, prevStation, wrapStation } from '../data/loop.ts';
import type { LoopDirection } from '../data/platforms';
import {
  corridorDropped,
  corridorSlice,
  makeCorridorBuffer,
  type CorridorBand,
  type CorridorHit,
} from './corridor.ts';
import { runtime } from './runtime.ts';
import { cityGround } from './terrain.ts';
import { segmentLength } from './trainPhysics.ts';
import { WET, waterOn } from './water.ts';

/** Longueur d'une cellule du ruban, le long de la voie (m). */
export const CELL_LEN = 40;

export interface CityBuilding {
  /** Abscisse monde du centre, le long de la voie (m). */
  s: number;
  /** Distance latérale du centre à l'axe de la voie (m), toujours positive. */
  x: number;
  /**
   * ALTITUDE orthométrique du pied du bâtiment (m) : le relief du 国土地理院,
   * lu à l'emplacement exact du sujet.
   *
   * C'est ce qui fait monter la ville en quittant Gotanda, se creuser la
   * cuvette de Shibuya, et se dresser la falaise du plateau de Yanaka au-dessus
   * de Nishi-Nippori.
   *
   * Une altitude, et non une cote par rapport à la voie : une cellule s'écrit
   * une fois et reste posée quatre cent quatre-vingts mètres, pendant lesquels
   * le train change d'altitude - de vingt mètres entre Gotanda et Meguro. Une
   * différence prise à l'écriture ferait décoller toute la cellule du sol au
   * fur et à mesure de la montée. Le rendu retranche l'altitude de la voie une
   * fois par image, sur le groupe qui porte le ruban.
   */
  y: number;
  /** Longueur le long de la voie (m). */
  w: number;
  /** Profondeur latérale (m). */
  d: number;
  /** Hauteur (m). */
  h: number;
  /** Teinte de façade (hex), palette du quartier. */
  facade: string;
  /** Multiplicateur de clarté appliqué à la façade (respiration de la palette). */
  shade: number;
  /** Teinte des bandeaux d'enseigne et des néons du rez-de-chaussée. */
  accent: string;
  /** 0..1 : vigueur des enseignes la nuit. */
  glow: number;
  /** 1 = rez-de-chaussée commerçant, 0 = façade nue jusqu'au sol. */
  socle: number;
  /** Couronnement : acrotère plat, ou toiture en croupe (bas quartiers). */
  crown: 'flat' | 'hip';
  /** Enseigne portée par la face qui regarde la voie. */
  sign: 'none' | 'screen' | 'vertical';
  /** Masse d'arbres à la place du bâtiment (parc, sanctuaire). */
  grove: boolean;
  /** 0 = fenêtres au blanc froid (bureau), 1 = au blanc chaud (logement). */
  warm: number;
  /** Décalage de la trame de façade (m), pour que deux voisins ne s'alignent pas. */
  jx: number;
  jy: number;
  /**
   * Le sujet porte-t-il la façade de logement collectif, à coursive extérieure ?
   *
   * C'est le trait le plus visible d'une rue d'habitation japonaise, et il vaut
   * pour le bâti moyen : ni une échoppe de deux niveaux, ni une tour.
   */
  balcony: boolean;
  /**
   * Écart d'orientation entre le bâtiment et la voie (rad), mesuré dans le plan
   * (s, x). Il vaut l'angle de trame du quartier, plus un petit jeu propre au
   * sujet. Le rendu en tire une rotation autour de Y de `-yaw`, la même des
   * deux côtés de la voie : une rue qui franchit le remblai continue du même
   * angle de l'autre côté, elle ne s'y réfléchit pas.
   */
  yaw: number;
  /**
   * Le sujet est-il un bâtiment RELEVÉ, ou du tissu engendré ?
   *
   * `true` : sa position, sa hauteur, son emprise et son orientation viennent
   * d'OpenStreetMap (src/data/corridor) ; seule son apparence - teinte,
   * enseignes, fenêtres - est celle du quartier, faute de source qui la porte.
   * `false` : tout est engendré, et rien ne prétend le contraire.
   *
   * La règle 11 de la bible interdit de faire passer l'inventé pour du relevé.
   * Ce drapeau est ce qui permet de tenir la promesse : la sonde compte les
   * deux, et personne n'a besoin de croire sur parole.
   */
  real: boolean;
}

interface Rank {
  /** Bord intérieur / extérieur de la bande où le rang se pose (m). */
  x0: number;
  x1: number;
  /** Nombre maximal de bâtiments par cellule. */
  n: number;
  wMin: number;
  wMax: number;
  dMin: number;
  dMax: number;
  /** h = hMin + maxHeight × hSpan × tirage. */
  hMin: number;
  hSpan: number;
}

// Le premier rang commence à 12 m de l'axe : au-delà des poteaux caténaires
// (±5,2), des murs de tranchée (±6,6) et du faisceau de tronçon (qui court de
// 4 à 14 m). C'est aussi la distance qui rend la ville REGARDABLE depuis une
// baie : posée à 8 m, la façade la plus proche remplissait toute la vitre de
// son seul rez-de-chaussée, et on ne voyait plus ni le ciel ni le fond.
//
// Le premier rang reste BAS - deux à quatre niveaux, comme un bord de voie
// réel. C'est ce qui laisse passer le regard vers les rangs suivants ; un
// premier rang haut, c'est un mur, et un mur ne fait pas une ville.
const RANKS: Rank[] = [
  { x0: 12, x1: 21, n: 5, wMin: 7, wMax: 17, dMin: 5, dMax: 9, hMin: 3.2, hSpan: 9.5 },
  { x0: 22, x1: 38, n: 4, wMin: 11, wMax: 25, dMin: 9, dMax: 16, hMin: 6, hSpan: 28 },
  { x0: 40, x1: 66, n: 3, wMin: 16, wMax: 34, dMin: 15, dMax: 26, hMin: 9, hSpan: 52 },
];

/**
 * Milieu de chaque rang (m à l'axe) : le point où l'on demande s'il y a de
 * l'eau.
 *
 * Le champ du relevé a une maille de quarante mètres, plus grosse que la bande
 * d'un rang proche : le sonder au milieu ou à l'emplacement exact du sujet
 * revient au même, et le milieu ne consomme pas de tirage.
 */
const RANK_MID = RANKS.map((r) => (r.x0 + r.x1) / 2);

/** Trouées supplémentaires du premier rang : le ciel et le fond doivent passer. */
const NEAR_EXTRA_GAP = 0.14;

/** Plafond de hauteur du bâti proche (m). */
const H_MAX = 52;

/** Nombre maximal de bâtiments qu'une cellule peut rendre, tous rangs confondus. */
export const CELL_CAPACITY = RANKS.reduce((a, r) => a + r.n, 0);

// --- L'arrière-pays -------------------------------------------------------
//
// Les trois rangs s'arrêtaient à soixante-six mètres, et la brume à deux cent
// vingt. Entre les deux, rien : la ville tombait d'un coup dans un aplat, puis
// la silhouette peinte reprenait neuf cents mètres plus loin. C'est le défaut
// qu'on voit le mieux d'un viaduc, là où le regard passe par-dessus les toits
// bas et devrait rencontrer des couches de bâti sur des centaines de mètres.
//
// L'arrière-pays est donc un SECOND anneau, à sa propre maille : une cellule de
// cent vingt mètres pour trois cent vingt mètres de profondeur. Compter les
// bâtiments d'un îlot à deux cents mètres n'a aucun sens - ce qu'on lit là,
// c'est une masse et une ligne de faîte -, et une maille grossière tient
// l'arrière-pays entier pour le prix de quelques dizaines d'instances.
export const FAR_CELL_LEN = 120;

const FAR_RANKS: Rank[] = [
  { x0: 70, x1: 132, n: 6, wMin: 24, wMax: 52, dMin: 20, dMax: 44, hMin: 7, hSpan: 52 },
  { x0: 140, x1: 268, n: 5, wMin: 32, wMax: 76, dMin: 28, dMax: 68, hMin: 10, hSpan: 130 },
  // Le dernier rang n'est presque plus un objet : à trois cents mètres, avec
  // une brume qui porte à cinq cents, il ne reste qu'un dégradé de masses. Mais
  // c'est LUI qui donne la profondeur - un fond qui s'arrête net à deux cent
  // soixante-dix mètres se lit comme une toile de fond, aussi loin soit-elle.
  { x0: 278, x1: 440, n: 4, wMin: 44, wMax: 110, dMin: 40, dMax: 96, hMin: 12, hSpan: 170 },
];

/** Plafond de hauteur de l'arrière-pays (m) : la plus haute tour de Shinjuku. */
const FAR_H_MAX = 190;

/** Milieu de chaque rang lointain (m à l'axe), pour le sondage d'eau. */
const FAR_RANK_MID = FAR_RANKS.map((r) => (r.x0 + r.x1) / 2);

/**
 * Emplacements réservés AU RELEVÉ, en plus de ceux du tissu.
 *
 * L'arrière-pays relevé est dense - jusqu'à deux cent trente-six bâtiments pour
 * une cellule de cent vingt mètres - et les quinze places des rangs de tissu en
 * laissaient deux mille cinq cents de côté sur un tour de boucle. Neuf places
 * de plus en récupèrent huit cents pour sept mille triangles, mesurés par
 * `node scripts/scenery-cost.mjs` : le budget d'ultra en pleine voie passe de
 * 333 à 340 k triangles, pour une cible de 360 k. Les appels de rendu, eux, ne
 * bougent pas - tout l'arrière-pays tient dans un seul maillage instancié.
 *
 * Elles ne servent qu'au relevé : les rangs de tissu gardent leurs propres
 * compteurs, si bien qu'une cellule sans données ne se densifie pas.
 */
const FAR_REAL_EXTRA = 9;

export const FAR_CELL_CAPACITY = FAR_RANKS.reduce((a, r) => a + r.n, 0) + FAR_REAL_EXTRA;

// --- Aléa déterministe -------------------------------------------------------

/**
 * Haché entier stable. Exporté pour que la circulation (three/city/Traffic)
 * tire ses véhicules du MÊME haché que la ville : deux passages sur la même
 * rue y trouvent la même camionnette garée au même endroit.
 */
export function hashInt(a: number): number {
  let h = a | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Suite pseudo-aléatoire stable, semée par (cellule, côté, rang). */
function stream(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return hashInt(s);
  };
}

// --- Ancrage des quartiers ---------------------------------------------------

/**
 * Le quartier n'appartient plus à un instant du trajet mais à un ENDROIT.
 *
 * Le décor précédent fondait deux plans peints selon la progression p du
 * trajet : le quartier changeait avec le temps, où qu'on regarde, y compris
 * derrière soi. On mesure ici la distance réelle entre deux arrêts, et le
 * territoire d'une gare s'étend d'un demi-inter-gare de part et d'autre. On
 * ENTRE donc dans un quartier, on le traverse, on en sort.
 */
export const cityAnchor = {
  /** Abscisse monde de la gare `index` (m). */
  s: 0,
  /** Indice de station (0..29) posée en `s`. */
  index: 0,
  /**
   * Longueur du tronçon EN COURS (m), telle que l'odomètre la parcourt.
   *
   * Elle vient de `segmentLength` - le profil de traction intégré - et non
   * d'une mesure faite après coup. La différence n'est pas théorique : le
   * décor se repère en FRACTION de tronçon, et mesurer le tronçon qu'on vient
   * de finir pour s'en servir sur le suivant, c'est lire la fraction avec le
   * mauvais mètre-étalon. Les tronçons de la boucle vont du simple au
   * quadruple ; l'erreur atteignait quinze cents mètres d'abscisse à l'arrivée
   * en gare, et dix mètres d'altitude - toute la ville montait au-dessus du
   * sol en sortant de Shin-Ōkubo.
   */
  span: 1150,
  /**
   * Pas d'index par inter-gare parcouru vers l'avant : +1 en 内回り, −1 en
   * 外回り. Le territoire des quartiers se déroule dans le sens de marche -
   * en 外回り, Shibuya vient AVANT Harajuku et non après.
   */
  step: 1 as 1 | -1,
};

let anchorLastIndex = -1;

/**
 * À appeler une fois par frame. `index` est la gare d'ARRIVÉE (il avance au
 * début de `depart`), `p` la progression 0..1 du trajet en cours.
 */
export function updateCityAnchor(index: number, p: number, dir: LoopDirection): void {
  cityAnchor.step = directionStep(dir);
  // Ré-amorçage : premier tick, ou saut de position (rentrée aléatoire sur la
  // boucle) qui laisserait l'ancre à des kilomètres du train.
  if (anchorLastIndex >= 0 && Math.abs(runtime.distance - cityAnchor.s) > 6 * cityAnchor.span) {
    anchorLastIndex = -1;
  }
  if (anchorLastIndex < 0) {
    // Premier tick, ou rentrée n'importe où sur la boucle : on connaît la
    // longueur du tronçon en cours, on peut donc reculer jusqu'à la gare
    // quittée au lieu de l'estimer.
    anchorLastIndex = index;
    cityAnchor.span = segmentLength(index, dir);
    cityAnchor.index = prevStation(index, dir);
    cityAnchor.s = runtime.distance - cityAnchor.span * p;
    return;
  }
  if (index === anchorLastIndex) return;
  anchorLastIndex = index;
  // L'index vient d'avancer : le train est physiquement à la gare qu'il quitte,
  // et le tronçon qui commence a SA longueur - pas celle de celui qui finit.
  cityAnchor.index = prevStation(index, dir);
  cityAnchor.s = runtime.distance;
  cityAnchor.span = segmentLength(index, dir);
}

/**
 * Quartier d'une abscisse monde. `mix` (0..1) est un tirage propre au bâtiment :
 * au voisinage de la frontière entre deux quartiers, les deux tissus
 * s'entremêlent au lieu de se succéder d'un bloc - une ville ne change pas de
 * caractère sur une ligne.
 */
export function districtAt(s: number, mix: number): District {
  const t = (s - cityAnchor.s) / cityAnchor.span;
  const k = Math.max(-2, Math.min(2, Math.round(t)));
  const frac = t - k;
  const edge = 0.5 - Math.abs(frac); // 0 à la frontière, 0,5 au cœur du quartier
  const BLEND = 0.09;
  let kk = k;
  if (edge < BLEND && mix > edge / BLEND) kk = k + (frac > 0 ? 1 : -1);
  const i = wrapStation(cityAnchor.index + kk * cityAnchor.step);
  return DISTRICTS[i] ?? GENERIC;
}

// --- Trame des rues ------------------------------------------------------

/** Écart maximal entre la trame d'un quartier et la voie (rad, ~26°). */
const GRID_MAX = 0.46;
/** Jeu propre à chaque sujet dans sa trame (rad, ~4°). */
const GRID_JITTER = 0.07;

/** Angle de trame d'une gare : haché de son index, donc stable pour toujours. */
function districtGrid(index: number): number {
  return (hashInt(Math.imul(wrapStation(index), 2654435761) + 917) * 2 - 1) * GRID_MAX;
}

/**
 * Angle de la trame de rues à une abscisse monde (rad).
 *
 * Un quartier a UNE trame - c'est ce qui en fait un quartier - mais elle ne
 * peut pas pivoter de cinquante degrés sur une ligne : entre deux territoires,
 * l'angle glisse vers celui du voisin et les deux se rejoignent exactement à
 * mi-chemin, vu de l'un comme de l'autre. La fonction est donc continue tout le
 * long de la boucle, et la ville tourne lentement autour du train au lieu de
 * sauter d'une cellule à l'autre.
 */
export function gridAngleAt(s: number): number {
  const t = (s - cityAnchor.s) / cityAnchor.span;
  const k = Math.max(-3, Math.min(3, Math.round(t)));
  const frac = t - k;
  const a0 = districtGrid(cityAnchor.index + k * cityAnchor.step);
  const a1 = districtGrid(cityAnchor.index + (k + (frac >= 0 ? 1 : -1)) * cityAnchor.step);
  const w = Math.min(1, Math.abs(frac) * 2);
  return a0 + (a1 - a0) * 0.5 * w * w * (3 - 2 * w);
}

// --- Tissu de quartier ------------------------------------------------------

/**
 * Ce que les `feats` d'un quartier changent DANS LE VOLUME.
 *
 * Ils ne vivaient jusqu'ici que dans la silhouette peinte de l'horizon
 * (`drawCityInto`), c'est-à-dire à neuf cents mètres, dans la brume : Ueno et
 * Akihabara y étaient déjà deux villes, mais le long de la voie - là où on
 * regarde - le tissu était partout le même, aux palettes près.
 *
 * Chaque champ est une PROPORTION de bâtiments concernés, pas un interrupteur :
 * un quartier de temples garde des immeubles, un quartier électrique garde des
 * murs aveugles. C'est le mélange qui fait le caractère, pas l'uniformité.
 */
export interface Tissue {
  /** Masses d'arbres à la place d'un bâtiment (parcs, sanctuaires). */
  green: number;
  /** Toitures en croupe sur le bâti bas (bas quartiers, résidentiel). */
  hip: number;
  /** Écrans géants sur la face qui regarde la voie. */
  screen: number;
  /** Enseignes verticales lumineuses. */
  sign: number;
  /** Rez-de-chaussée commerçants. */
  trade: number;
  /** Plafond de hauteur du premier rang (marchés, échoppes). */
  lowCap: number;
  /**
   * Part de fenêtres éclairées au BLANC FROID plutôt qu'au blanc chaud.
   *
   * Un bureau est au néon, un logement à la lampe. Une ville dont toutes les
   * fenêtres ont la même température se lit comme une texture ; c'est le
   * mélange des deux qui donne à Shinjuku sa dureté et à Nishi-Nippori sa
   * douceur, à la même heure.
   */
  cool: number;
  /**
   * Part de bâtiments portant la façade de logement collectif - la マンション,
   * avec sa COURSIVE extérieure.
   *
   * C'est le trait le plus visible d'une rue d'habitation japonaise, et il
   * manquait : tout le ruban portait la même façade de bureau à meneaux, du
   * bâti de rapport de Nishi-Nippori aux tours de Shinjuku. Forte sur le
   * résidentiel et les bas quartiers, nulle sur les quartiers de tours - une
   * tour de bureaux n'a pas de balcons, et une tour d'habitation les a
   * intérieurs.
   */
  balcony: number;
}

const TISSUE_CACHE = new Map<string, Tissue>();

export function tissueOf(district: District): Tissue {
  const cached = TISSUE_CACHE.get(district.name);
  if (cached) return cached;
  const has = (f: Feat) => district.feats.includes(f);
  const t: Tissue = {
    green: 0,
    hip: 0,
    screen: 0,
    sign: 0,
    trade: 0.18 + district.density * 0.42,
    lowCap: 1,
    cool: 0.2,
    // Le fond de la ville est du logement de rapport : c'est le cas COURANT le
    // long de la Yamanote, pas l'exception.
    balcony: 0.3,
  };
  if (has('parkGreen')) t.green += 0.3;
  if (has('torii')) t.green += 0.14;
  if (has('templeLowtown')) {
    t.hip += 0.5;
    t.green += 0.06;
    t.balcony += 0.22;
  }
  if (has('upscaleResidential')) {
    t.hip += 0.26;
    t.balcony += 0.3;
  }
  if (has('giantScreen')) t.screen += 0.3;
  if (has('animeBillboard')) t.screen += 0.22;
  if (has('departmentStore')) t.screen += 0.12;
  if (has('electricNeon')) t.sign += 0.4;
  if (has('koreatownSigns')) t.sign += 0.34;
  if (has('studentArcade')) t.sign += 0.28;
  if (has('salarymanIzakaya') || has('elevatedIzakaya')) {
    t.sign += 0.18;
    t.trade += 0.16;
  }
  if (has('shotengai')) {
    t.trade += 0.24;
    t.lowCap = 0.72;
  }
  if (has('lowriseMarket')) {
    t.trade += 0.3;
    t.lowCap = 0.55;
  }
  if (has('fashionBoutique')) t.trade += 0.18;
  // Les quartiers de tours n'ont pas d'échoppes en pied d'immeuble, et
  // s'éclairent au néon plutôt qu'à la lampe.
  if (has('glassTowers') || has('officeTowers') || has('skyscraperCluster') || has('modernWhite')) {
    t.trade -= 0.16;
    t.cool += 0.5;
    // Une tour de bureaux n'a pas de balcons, et une tour d'habitation les a
    // intérieurs : la coursive extérieure est une affaire de bâti moyen.
    t.balcony -= 0.28;
  }
  // Un quartier de commerce est en devantures et en enseignes, pas en logements.
  if (has('shotengai') || has('lowriseMarket') || has('electricNeon')) t.balcony -= 0.14;
  if (has('upscaleResidential') || has('templeLowtown')) t.cool -= 0.12;
  t.cool = Math.max(0.05, Math.min(0.85, t.cool));
  t.trade = Math.max(0.04, Math.min(0.86, t.trade));
  t.green = Math.min(0.45, t.green);
  t.hip = Math.min(0.62, t.hip);
  t.balcony = Math.max(0, Math.min(0.72, t.balcony));
  TISSUE_CACHE.set(district.name, t);
  return t;
}

// --- Engendrement d'une cellule ---------------------------------------------

const FALLBACK_FACADE = ['#e6dcc9', '#e4cfc5', '#dde4d2', '#e0d7e4', '#e8e1cf', '#d6dfe3', '#e7d6c2'];

/**
 * Rue perpendiculaire d'une cellule : [début, fin] en abscisse monde, ou null.
 *
 * Exportée parce que la circulation (three/city/Traffic) doit tomber d'accord
 * au centimètre avec la chaussée que `buildCellProps` pose : une voiture qui
 * roule à côté de sa rue est pire que pas de voiture du tout.
 */
export function streetOf(cell: number): [number, number] | null {
  const a = hashInt(cell * 2654435761);
  if (a > 0.52) return null;
  const b = hashInt(cell * 40503 + 7919);
  const width = 9 + b * 7;
  const at = cell * CELL_LEN + 5 + hashInt(cell * 97 + 13) * (CELL_LEN - width - 10);
  return [at, at + width];
}

/** Rives de la chaussée d'une rue perpendiculaire (m à l'axe de la voie). */
export const STREET_INNER = RANKS[0].x0 - 1.5;
export const STREET_OUTER = RANKS[RANKS.length - 1].x1;

/** La chaussée d'une rue perpendiculaire, telle qu'elle est POSÉE. */
export interface Roadway {
  /** Abscisse monde du centre, le long de la voie (m). */
  s: number;
  /** Distance du centre à l'axe de la voie (m) : à mi-profondeur du bâti. */
  x: number;
  /** Largeur, le long de la voie (m). */
  w: number;
  /** Longueur, à travers les rangs (m). */
  d: number;
  /** Trame du quartier (rad) : la rotation appliquée autour de son centre. */
  yaw: number;
}

/**
 * Cotes de la chaussée de la cellule, ou `false` s'il n'y a pas de rue.
 *
 * Un seul endroit décide où passe une rue et comment elle est tournée : la
 * dalle de `buildCellProps` et la circulation de three/city/Traffic la lisent
 * ici toutes les deux. La rotation se fait autour du CENTRE de la dalle, à
 * mi-profondeur du bâti - prise depuis l'axe des rails, elle décalerait la rue
 * d'une vingtaine de mètres le long de la voie.
 */
export function roadwayOf(cell: number, out: Roadway): boolean {
  const street = streetOf(cell);
  if (!street) return false;
  out.s = (street[0] + street[1]) / 2;
  out.w = street[1] - street[0] - 1.2;
  out.x = (STREET_INNER + STREET_OUTER) / 2;
  out.yaw = gridAngleAt(out.s);
  // La dalle s'allonge de ce que la rotation lui fait perdre en profondeur,
  // sinon la trouée n'atteint plus le dernier rang.
  out.d = (STREET_OUTER - STREET_INNER) / Math.max(0.6, Math.cos(out.yaw));
  return true;
}

/** Cotes de travail : le générateur ne doit rien allouer par cellule. */
const ROADWAY: Roadway = { s: 0, x: 0, w: 0, d: 0, yaw: 0 };

/**
 * La rue la plus proche d'une abscisse monde, ou `null`.
 *
 * C'est par là que passent les singularités de la ligne (systems/segmentEnv) :
 * une rivière, un passage à niveau et une autoroute urbaine ont tous besoin
 * d'une TROUÉE dans le tissu, et il y en a déjà une - la rue perpendiculaire,
 * qui perce les trois rangs au même endroit et dont la chaussée est déjà posée.
 * Les accrocher à une rue existante au lieu d'en creuser une nouvelle évite
 * qu'une pile de viaduc ne se plante dans un immeuble, et ne coûte rien.
 *
 * Une cellule sur deux porte une rue : chercher à deux cellules près suffit
 * toujours, et l'écart au point demandé reste sous quatre-vingts mètres.
 */
export function streetNear(s: number, reach = 3): Roadway | null {
  const home = Math.floor(s / CELL_LEN);
  for (let k = 0; k <= reach; k++) {
    // On s'écarte alternativement d'un côté puis de l'autre : la rue retenue
    // est bien la plus proche, et non la première trouvée vers l'avant.
    for (const cell of k === 0 ? [home] : [home - k, home + k]) {
      if (roadwayOf(cell, ROADWAY)) return ROADWAY;
    }
  }
  return null;
}

/**
 * Trouée imposée au tissu, en abscisse monde : une rivière ne se contourne pas.
 *
 * Le générateur sait déjà laisser passer une rue ; il ne savait pas laisser
 * passer VINGT-CINQ MÈTRES. C'est le seul cas où le décor commande à la ville
 * plutôt que l'inverse, et il est bordé : `half` vaut zéro partout ailleurs, et
 * le rendu la pose sur une rue existante, si bien que la moitié de la trouée est
 * déjà vide.
 *
 * L'arrière-pays (`buildFarCell`) n'en tient pas compte à dessein : la nappe
 * d'eau s'arrête au dernier rang proche, et ce qui est derrière est l'autre
 * rive, bâtie.
 */
export const clearing = { s: 0, half: 0 };

/** Retrait du premier sujet reconstruit après la trouée (m). */
const CLEAR_MARGIN = 7;

/** Le segment [s0, s1] tombe-t-il dans la trouée ? */
function inClearing(s0: number, s1: number): boolean {
  return clearing.half > 0 && s1 > clearing.s - clearing.half && s0 < clearing.s + clearing.half;
}

// --- Ce qui est vraiment là -------------------------------------------------
//
// Le ruban engendrait tout. Il pose maintenant D'ABORD les bâtiments relevés
// d'OpenStreetMap (src/data/corridor, via systems/corridor), et n'engendre que
// dans ce qu'ils laissent.
//
// L'ORDRE N'EST PAS UN DÉTAIL. Le relevé passe en premier parce qu'il ne se
// négocie pas : un bâtiment est là où il est, et c'est au tissu de s'écarter.
// L'inverse - engendrer puis caser le réel dans les trous - donnerait une ville
// inventée avec quelques vrais immeubles coincés dedans, ce qui est exactement
// ce que la bible refuse.
//
// CE QUE LE RELEVÉ DONNE, ET CE QU'IL NE DONNE PAS. Il donne la position, la
// hauteur, le côté de l'emprise et l'orientation. Il ne donne ni teinte, ni
// enseigne, ni température de fenêtre : rien dans OpenStreetMap ne les porte.
// Ces trois-là restent donc au tissu du quartier, et `CityBuilding.real` dit
// lesquels des deux on regarde - on ne fait pas passer une palette pour un
// relevé.
//
// LA DENSITÉ N'EST PAS LA MÊME AUX DEUX DISTANCES, et il faut le savoir pour
// lire ce qu'on voit. Le corridor versionné porte 759 bâtiments dans la bande
// du bord de voie et 8 516 dans l'arrière-pays : l'arrière-pays est donc
// presque entièrement RELEVÉ, tandis que le bord de voie reste
// majoritairement du tissu, avec des ancres réelles dedans. Ce n'est pas un
// choix de rendu, c'est ce que la source contient - le plafond budgétaire de
// `scripts/geo/fetch-footprints.mjs` a longtemps gardé les bâtiments qui
// DÉCLARENT leur hauteur, et une échoppe de bord de voie n'en déclare pas.

/** Marge de recherche autour d'une cellule (m) : l'emprise d'un voisin déborde. */
const REAL_MARGIN = 40;

/** Tampons de travail : le générateur n'alloue rien par cellule. */
const NEAR_HITS = makeCorridorBuffer(24);
const FAR_HITS = makeCorridorBuffer(48);

/**
 * Emprise VUE d'un sujet relevé (m), le long de la voie (`along`) ou en travers.
 *
 * Les deux cotes ne sont plus égales depuis que les boîtes qui mordaient la
 * voie sont découpées au gabarit : `plate` court le long des rails, `depth`
 * s'en écarte.
 */
function realSpan(hit: CorridorHit, along: boolean): number {
  const c = Math.abs(Math.cos(hit.yaw));
  const s = Math.abs(Math.sin(hit.yaw));
  return along ? hit.plate * c + hit.depth * s : hit.depth * c + hit.plate * s;
}

/**
 * Le rectangle [s0, s1] × [x0, x1] recouvre-t-il un bâtiment relevé ?
 *
 * Le test se fait sur la BANDE du rang et non sur l'emplacement latéral exact :
 * celui-ci se tire après, et le déplacer changerait la suite pseudo-aléatoire
 * de toute la ville. Un rang est profond de neuf à vingt-six mètres, un sujet
 * relevé d'une douzaine : la différence est un peu de tissu en moins autour du
 * réel, ce qui est le bon sens du compromis.
 *
 * La bande doit être celle que le sujet peut ATTEINDRE, et non celle où son
 * centre peut tomber : tourné dans sa trame, un bâtiment déborde de son rang de
 * la moitié de ce que la rotation lui ajoute en travers. C'est par là que le
 * tissu passait au travers du relevé, et ça se voyait - deux volumes qui se
 * traversent à quarante mètres de la vitre.
 */
function blockedByReal(
  hits: CorridorHit[],
  n: number,
  s0: number,
  s1: number,
  x0: number,
  x1: number,
): boolean {
  for (let i = 0; i < n; i++) {
    const h = hits[i];
    const alongHalf = realSpan(h, true) / 2;
    if (h.s + alongHalf <= s0 || h.s - alongHalf >= s1) continue;
    const acrossHalf = realSpan(h, false) / 2;
    if (h.x + acrossHalf <= x0 || h.x - acrossHalf >= x1) continue;
    return true;
  }
  return false;
}

/**
 * Habille un bâtiment relevé : la géométrie vient de la source, le reste du
 * quartier.
 *
 * `r` est la suite pseudo-aléatoire de la cellule - le même robinet que le
 * tissu, pour que deux voisins d'une même rue se ressemblent, et pour qu'un
 * sujet relevé reste identique d'un passage à l'autre.
 */
function dressReal(
  b: CityBuilding,
  hit: CorridorHit,
  side: 1 | -1,
  far: boolean,
  r: () => number,
): void {
  const district = districtAt(hit.s, r());
  const tissue = tissueOf(district);
  const facades = district.facades ?? FALLBACK_FACADE;

  b.s = hit.s;
  b.x = hit.x;
  b.y = cityGround(b.s, b.x, side);
  // Le prisme est carré : `plate` est le côté de la boîte englobante du
  // contour, et la source n'en dit pas plus. Inventer un rapport de forme
  // serait inventer un bâtiment.
  //
  // Sauf quand la boîte mordait la voie. Elle a alors été DÉCOUPÉE au gabarit
  // ferroviaire à l'import, et `depth` porte ce qu'il en reste en travers : on
  // ne pose pas un bâtiment sur les rails sous prétexte que sa boîte
  // englobante y allait.
  b.w = hit.plate;
  b.d = hit.depth;
  b.h = hit.h;
  b.yaw = hit.yaw;
  b.real = true;

  b.facade = facades[Math.floor(r() * facades.length) % facades.length];
  b.shade = 0.86 + r() * 0.3;
  const neon = district.neon;
  b.accent = neon ? neon[Math.floor(r() * neon.length) % neon.length] : district.accent;
  // Un sujet relevé se juge sur SA distance, et non sur un rang : c'est tout
  // l'intérêt d'avoir sa position. En deçà de quarante mètres il borde la rue
  // et porte donc devantures et enseignes ; au-delà, on ne lit plus un
  // rez-de-chaussée.
  const kerb = !far && hit.x < 40;
  b.glow = kerb ? 0.5 + r() * 0.4 : far ? 0 : 0.12;
  b.socle = kerb && r() < tissue.trade ? 1 : 0;
  b.grove = false;
  b.crown = !far && b.h < 11 && r() < tissue.hip ? 'hip' : 'flat';
  const sr = r();
  b.sign =
    kerb && sr < tissue.screen
      ? 'screen'
      : kerb && sr < tissue.screen + tissue.sign
        ? 'vertical'
        : 'none';
  b.warm = r() < tissue.cool ? 0.05 + r() * 0.2 : 0.75 + r() * 0.25;
  b.jx = r() * 12;
  b.jy = r() * 3;
  b.balcony = b.h >= 6 && b.h <= 46 && r() < tissue.balcony;
}

/**
 * Pose les bâtiments relevés d'une cellule, et renvoie combien de sujets sont
 * connus - ceux de la cellule ET ceux de la marge, qui ne se dessinent pas ici
 * mais dont le tissu doit s'écarter.
 *
 * Les sujets écrits dans `out` sont ceux de la cellule ; `hits[0..known)` sert
 * ensuite à `blockedByReal`.
 */
function placeReal(
  start: number,
  end: number,
  side: 1 | -1,
  xMin: number,
  xMax: number,
  hits: CorridorHit[],
  out: CityBuilding[],
  seed: number,
  band: CorridorBand,
): { count: number; known: number } {
  const known = corridorSlice(start, end, side, xMin, xMax, hits, REAL_MARGIN, band);
  const far = band === 'far';
  const r = stream(seed);
  let count = 0;
  for (let i = 0; i < known; i++) {
    if (!hits[i].inCell) continue;
    // Plus de place dans la cellule : on le dit, on ne l'efface pas. C'est la
    // même règle que pour les secteurs non résolus - un plafond budgétaire ne
    // doit jamais se lire comme une absence de données.
    if (count >= out.length) {
      corridorDropped[band]++;
      continue;
    }
    dressReal(out[count], hits[i], side, far, r);
    count++;
  }
  return { count, known };
}

/**
 * Remplit `out` avec les bâtiments de la cellule `cell` du côté `side`.
 * Renvoie le nombre écrit (≤ out.length). Les objets de `out` sont réutilisés :
 * aucune allocation par recyclage de cellule.
 *
 * `rankScale` allège les rangs aux paliers de qualité bas (voir systems/perf).
 */
export function buildCell(
  cell: number,
  side: 1 | -1,
  out: CityBuilding[],
  rankScale = 1,
): number {
  const start = cell * CELL_LEN;
  const end = start + CELL_LEN;
  const street = streetOf(cell);

  // D'abord ce qui est vraiment là.
  const real = placeReal(
    start,
    end,
    side,
    RANKS[0].x0,
    RANKS[RANKS.length - 1].x1,
    NEAR_HITS,
    out,
    cell * 8191 + (side === 1 ? 0 : 4099) + 7717,
    'near',
  );
  let count = real.count;

  for (let rank = 0; rank < RANKS.length; rank++) {
    const R = RANKS[rank];
    const n = Math.max(1, Math.round(R.n * rankScale));
    const r = stream(cell * 8191 + (side === 1 ? 0 : 4099) + rank * 131);
    let placed = 0;
    let cursor = start + r() * 4;

    while (cursor < end && placed < n && count < out.length) {
      // Le quartier se décide bâtiment par bâtiment : c'est ce qui entremêle
      // les deux tissus de part et d'autre d'une frontière de quartier.
      const district = districtAt(cursor, r());
      const tissue = tissueOf(district);
      const gapChance = 0.42 - district.density * 0.36 + (rank === 0 ? NEAR_EXTRA_GAP : 0);

      let w = R.wMin + r() * (R.wMax - R.wMin);
      if (w > end + 3 - cursor) w = Math.max(R.wMin * 0.6, end + 3 - cursor);
      const d = R.dMin + r() * (R.dMax - R.dMin);
      // La trame du quartier, plus le jeu du sujet dans sa propre parcelle : à
      // Tokyo deux voisins se touchent sans être tout à fait parallèles.
      const yaw = gridAngleAt(cursor) + (r() * 2 - 1) * GRID_JITTER;
      // Tourné dans sa trame, un sujet occupe le long de la voie plus que sa
      // seule longueur : c'est cette emprise-là qu'il faut réserver, sinon les
      // voisins s'enfoncent l'un dans l'autre à mesure que la trame s'incline.
      const spanS = w * Math.abs(Math.cos(yaw)) + d * Math.abs(Math.sin(yaw));

      // Rue perpendiculaire : elle perce les trois rangs au même endroit.
      if (street && cursor + spanS > street[0] && cursor < street[1]) {
        cursor = street[1] + r() * 2;
        continue;
      }
      // Trouée imposée : la rivière. Elle se traite comme une rue, en plus
      // large - et sans tirage, parce qu'elle ne se négocie pas. On la teste sur
      // l'emprise VUE, celle qui est centrée sur le sujet, et non sur la
      // réservation du curseur : c'est la première qui se retrouverait dans
      // l'eau. Le saut garde une marge, et il avance toujours - une trouée qui
      // ferait reculer le curseur bouclerait sans fin.
      const mid = cursor + w / 2;
      if (inClearing(mid - spanS / 2, mid + spanS / 2)) {
        cursor = Math.max(cursor + 1, clearing.s + clearing.half + CLEAR_MARGIN + r() * 3);
        continue;
      }
      // Et rien ne se bâtit sur l'eau. Le champ d'OpenStreetMap porte ce que la
      // trouée de rivière ne dit pas : les canaux de remblai de Kōnan et de
      // Shibaura, que la voie longe au lieu de les couper, les douves du palais
      // à Yūrakuchō, les bassins de la Sumida. Le rang est sondé en son MILIEU
      // et non à l'emplacement tiré, pour que le tirage reste le même qu'avant
      // l'eau - la maille du relevé fait quarante mètres, elle ne distingue pas
      // les deux.
      if (waterOn(mid, RANK_MID[rank], side) > WET) {
        cursor += spanS;
        continue;
      }
      // Ni sur un bâtiment qui EXISTE. Le tissu est ce qu'on met là où l'on ne
      // sait pas ; là où l'on sait, il s'écarte.
      const spanX = d * Math.abs(Math.cos(yaw)) + w * Math.abs(Math.sin(yaw));
      // La bande que le sujet peut ATTEINDRE, exactement celle où son placement
      // le laissera tomber : il s'appuie sur le bord intérieur du rang, et
      // déborde au-delà du bord extérieur quand son emprise vue est plus large
      // que le rang lui-même - ce qui arrive dès qu'il est franchement tourné.
      const reachIn = R.x0;
      const reachOut = Math.max(R.x1, R.x0 + spanX);
      if (blockedByReal(NEAR_HITS, real.known, mid - spanS / 2, mid + spanS / 2, reachIn, reachOut)) {
        cursor += spanS;
        continue;
      }
      if (r() < gapChance) {
        cursor += spanS * (0.35 + r() * 0.5);
        continue;
      }

      // Une masse d'arbres prend la place d'un bâtiment. C'est ce qui fait la
      // lisière du parc d'Ueno ou le bois du Meiji-jingū : non pas des arbres
      // AJOUTÉS au tissu, mais du tissu qui manque.
      const grove = rank < 2 && r() < tissue.green;
      const cap = rank === 0 ? tissue.lowCap : 1;
      const h = Math.min(
        H_MAX,
        (R.hMin + district.maxHeight * R.hSpan * (0.32 + r() * 0.68)) * cap,
      );
      const facades = district.facades ?? FALLBACK_FACADE;
      const neon = district.neon;

      const b = out[count];
      b.s = cursor + w / 2;
      // L'emprise EN TRAVERS, et non la seule profondeur : tourné dans sa trame,
      // un sujet occupe latéralement plus que sa profondeur, et le rang de bord
      // de voie débordait donc sous ses douze mètres - jusqu'à huit mètres
      // trente de l'axe, à portée des poteaux caténaires. C'est le même défaut
      // que celui qui faisait entrer les empreintes relevées dans la voie, et
      // il se corrige de la même façon : on réserve l'emprise VUE.
      b.x = R.x0 + spanX / 2 + r() * Math.max(0, R.x1 - R.x0 - spanX);
      b.y = cityGround(b.s, b.x, side);
      b.w = w;
      b.d = d;
      b.h = h;
      b.facade = facades[Math.floor(r() * facades.length) % facades.length];
      // Les palettes de quartier sont resserrées à dessein (elles font la
      // teinte d'ensemble) : sans cette respiration, deux voisins sont
      // indiscernables et la rangée se relit comme une seule surface.
      b.shade = 0.86 + r() * 0.3;
      b.accent = neon ? neon[Math.floor(r() * neon.length) % neon.length] : district.accent;
      // Les enseignes ne valent que pour ce qui borde la rue : au troisième
      // rang, on ne lit plus un rez-de-chaussée.
      b.glow = rank === 0 ? 0.65 + r() * 0.35 : rank === 1 ? 0.35 + r() * 0.3 : 0.1;
      // Tout n'est pas commerçant : entrepôts, pignons aveugles, immeubles
      // d'habitation. Un bandeau d'enseigne sur CHAQUE bâtiment redevenait la
      // frise continue qu'on cherchait à quitter.
      b.socle = rank < 2 && r() < tissue.trade ? 1 : 0;
      b.grove = grove;
      // Toiture en croupe : seulement sur le bâti bas, sinon on couronne une
      // tour d'un chapeau de maison.
      b.crown = rank === 0 && h < 11 && r() < tissue.hip ? 'hip' : 'flat';
      // Écran d'abord, enseigne verticale ensuite : un immeuble qui porte un
      // écran géant n'aligne pas en plus des enseignes.
      const sr = r();
      b.sign =
        rank < 2 && !grove && sr < tissue.screen
          ? 'screen'
          : rank < 2 && !grove && sr < tissue.screen + tissue.sign
            ? 'vertical'
            : 'none';
      // Les tours du fond sont plus souvent des bureaux que le bâti bas.
      const coolChance = tissue.cool * (rank === 2 ? 1.25 : rank === 1 ? 1 : 0.7);
      b.warm = r() < coolChance ? 0.05 + r() * 0.2 : 0.75 + r() * 0.25;
      b.jx = r() * 12;
      b.jy = r() * 3;
      b.yaw = yaw;
      // Coursive : le bâti moyen, celui du logement de rapport. Une échoppe de
      // deux niveaux n'en a pas, une tour non plus.
      b.balcony = b.h >= 6 && b.h <= 46 && r() < tissue.balcony;
      b.real = false;

      count++;
      placed++;
      // L'entraxe se resserre de ce que la rotation a pris : une trame inclinée
      // ne doit pas dépeupler le rang qu'elle traverse.
      cursor += spanS + 0.3 + r() * 1.9;
    }
  }
  return count;
}

/**
 * Loi de hauteur de l'arrière-pays.
 *
 * Une ville n'a pas des hauteurs tirées à plat : elle en a beaucoup de basses,
 * quelques moyennes, et de loin en loin une tour. C'est cette queue-là qui fait
 * une LIGNE DE FAÎTE plutôt qu'une haie - et c'est justement ce qu'un tirage
 * uniforme ne peut pas donner : à trois cents mètres, il aligne tout à
 * mi-hauteur et l'arrière-pays redevient un mur, en plus loin.
 */
function farHeight(roll: number): number {
  return 0.18 + 0.82 * Math.pow(roll, 2.2);
}

/**
 * Remplit `out` avec les masses de l'arrière-pays de la cellule lointaine
 * `cell`. Même contrat que `buildCell` : objets réutilisés, aucune allocation.
 *
 * Ce qui distingue une masse d'un bâtiment : elle n'a ni devanture, ni
 * enseigne, ni toiture particulière. À cette distance on ne lit qu'un volume,
 * une teinte et - la nuit - des fenêtres allumées. Tout le reste serait payé
 * pour rien.
 */
export function buildFarCell(
  cell: number,
  side: 1 | -1,
  out: CityBuilding[],
  rankScale = 1,
): number {
  const start = cell * FAR_CELL_LEN;
  const end = start + FAR_CELL_LEN;

  // L'arrière-pays est la bande la mieux servie par le relevé : huit mille cinq
  // cents bâtiments contre sept cent cinquante-neuf au bord de voie. C'est donc
  // lui qui devient VRAIMENT Tokyo, et le tissu n'y comble plus que les vides.
  const real = placeReal(
    start,
    end,
    side,
    FAR_RANKS[0].x0,
    FAR_RANKS[FAR_RANKS.length - 1].x1,
    FAR_HITS,
    out,
    cell * 15485863 + (side === 1 ? 0 : 7919) + 3557,
    'far',
  );
  let count = real.count;

  for (let rank = 0; rank < FAR_RANKS.length; rank++) {
    const R = FAR_RANKS[rank];
    const n = Math.max(1, Math.round(R.n * rankScale));
    const r = stream(cell * 15485863 + (side === 1 ? 0 : 7919) + rank * 6151);
    let placed = 0;
    let cursor = start + r() * 12;

    while (cursor < end && placed < n && count < out.length) {
      const district = districtAt(cursor, r());
      const tissue = tissueOf(district);
      // Un parc ne se remplit pas. Là où le tissu proche s'ouvre en bosquets,
      // l'arrière-pays s'éclaircit d'autant : c'est ce qui creuse le bois du
      // Meiji-jingū ou le parc d'Ueno au-delà du premier plan, sans y planter
      // un seul arbre de plus - à deux cents mètres, une masse verte et un
      // vide se lisent pareil dans la brume.
      const gapChance = 0.18 - district.density * 0.14 + tissue.green * 0.9;

      let w = R.wMin + r() * (R.wMax - R.wMin);
      if (w > end + 10 - cursor) w = Math.max(R.wMin * 0.6, end + 10 - cursor);
      const d = R.dMin + r() * (R.dMax - R.dMin);
      const yaw = gridAngleAt(cursor) + (r() * 2 - 1) * GRID_JITTER;
      const spanS = w * Math.abs(Math.cos(yaw)) + d * Math.abs(Math.sin(yaw));

      // L'arrière-pays a plus besoin de cette règle que le bord de voie : c'est
      // à cent et deux cents mètres que tombent les canaux de remblai de Kōnan
      // et de Shibaura, et la baie elle-même quatre cents mètres plus loin.
      if (waterOn(cursor + w / 2, FAR_RANK_MID[rank], side) > WET) {
        cursor += spanS;
        continue;
      }
      const mid = cursor + w / 2;
      const spanX = d * Math.abs(Math.cos(yaw)) + w * Math.abs(Math.sin(yaw));
      // La bande que le sujet peut ATTEINDRE, exactement celle où son placement
      // le laissera tomber : il s'appuie sur le bord intérieur du rang, et
      // déborde au-delà du bord extérieur quand son emprise vue est plus large
      // que le rang lui-même - ce qui arrive dès qu'il est franchement tourné.
      const reachIn = R.x0;
      const reachOut = Math.max(R.x1, R.x0 + spanX);
      if (blockedByReal(FAR_HITS, real.known, mid - spanS / 2, mid + spanS / 2, reachIn, reachOut)) {
        cursor += spanS;
        continue;
      }
      if (r() < gapChance) {
        cursor += spanS * (0.4 + r() * 0.7);
        continue;
      }

      const facades = district.facades ?? FALLBACK_FACADE;
      const b = out[count];
      b.s = cursor + w / 2;
      b.x = R.x0 + spanX / 2 + r() * Math.max(0, R.x1 - R.x0 - spanX);
      b.y = cityGround(b.s, b.x, side);
      b.w = w;
      b.d = d;
      b.h = Math.min(FAR_H_MAX, R.hMin + district.maxHeight * R.hSpan * farHeight(r()));
      b.facade = facades[Math.floor(r() * facades.length) % facades.length];
      b.shade = 0.9 + r() * 0.22;
      b.accent = district.accent;
      b.glow = 0;
      b.socle = 0;
      b.grove = false;
      b.crown = 'flat';
      b.sign = 'none';
      // L'arrière-pays est plus tertiaire que le bord de voie : c'est là que
      // sont les tours, et une tour s'éclaire au néon.
      b.warm = r() < tissue.cool * 1.3 ? 0.05 + r() * 0.2 : 0.75 + r() * 0.25;
      b.jx = r() * 12;
      b.jy = r() * 3;
      b.yaw = yaw;
      // À cette distance, la coursive ne se lit plus comme un balcon mais comme
      // un rythme horizontal - et c'est précisément ce qui distingue un
      // arrière-pays de logements d'un arrière-pays de bureaux.
      b.balcony = b.h <= 46 && r() < tissue.balcony;
      b.real = false;

      count++;
      placed++;
      // Serré : au-delà de soixante-dix mètres, Tokyo est une masse continue.
      // Un arrière-pays clairsemé découvre la nappe de rue, et deux cents
      // mètres de bitume gris valent moins que pas d'arrière-pays du tout.
      cursor += spanS * 0.82 + r() * 4;
    }
  }
  return count;
}

// --- Superstructures, toitures, bosquets et enseignes -----------------------

/**
 * Ce qu'un bâtiment porte, ou ce qui le remplace. Une famille par
 * InstancedMesh :
 *
 *   · `box`  - acrotère, édicule de toiture, chaussée : volumes nus, matériau
 *              de la ville avec le drapeau « nu » ;
 *   · `hip`  - toiture en croupe des bas quartiers et du résidentiel ;
 *   · `tank` - réservoir d'eau sur pieds (高置水槽) ;
 *   · `ac`   - batterie de condenseurs de climatisation ;
 *   · `mast` - mât d'antenne, et `beacon` son feu rouge d'obstacle ;
 *   · `rail` - garde-corps de toiture ;
 *   · `tree` - masse d'arbres à la place d'un bâtiment ;
 *   · `sign` - panneau lumineux plaqué sur la face qui regarde la voie.
 */
export type PropKind =
  | 'box'
  | 'hip'
  | 'tank'
  | 'ac'
  | 'mast'
  | 'beacon'
  | 'rail'
  | 'tree'
  | 'sign';

export interface CityProp {
  kind: PropKind;
  s: number;
  x: number;
  w: number;
  d: number;
  h: number;
  /** Altitude de la BASE, relative au pied de son bâtiment (m). */
  y: number;
  /** Altitude du pied du bâtiment porteur (m) : le relief, comme `CityBuilding.y`. */
  base: number;
  tone: string;
  /**
   * Variante de feuillage (0..3), pour les bosquets seulement.
   *
   * La TEINTE n'est plus tirée ici : elle appartient à la saison, qui change
   * pendant qu'une cellule reste posée. Le générateur ne fixe donc que le
   * numéro de la variante ; le rendu va chercher la couleur du jour dans la
   * palette de `systems/season`.
   */
  variant: number;
  /** Tirage stable 0..1 : décide si le sujet est en fleurs à la saison des sakura. */
  roll: number;
  /** Orientation dans le plan (s, x), héritée du bâtiment porteur. */
  yaw: number;
}

/**
 * Pose un accessoire dans le repère LOCAL de son bâtiment.
 *
 * `u` court le long de la façade, `v` s'en écarte perpendiculairement - négatif
 * vers la voie, positif vers l'arrière. Sans ce passage par le repère local, un
 * bandeau d'enseigne calculé en `x - d/2` se décollait de sa façade dès que le
 * bâtiment tournait dans sa trame, et flottait à côté de lui.
 */
function place(p: CityProp, b: CityBuilding, side: 1 | -1, u: number, v: number): void {
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  p.s = b.s + u * c - v * side * sn;
  p.x = b.x + u * side * sn + v * c;
  p.yaw = b.yaw;
  // Tout accessoire est porté par un bâtiment : il monte et descend avec lui
  // sur le relief. Le poser ici plutôt qu'aux dix endroits qui écrivent `y`
  // garantit qu'aucun ne reste en l'air.
  p.base = b.y;
}

/**
 * Capacité par famille et par cellule.
 *
 * Ce ne sont PAS les maxima théoriques. Une instance dégénérée - mise à
 * l'échelle zéro faute d'objet à poser - coûte son traitement de sommets comme
 * les autres, et réserver douze emplacements de bosquet par cellule pour en
 * remplir un ou deux passait cent mille triangles par image au pilote pour
 * rien. Les valeurs ci-dessous couvrent le cas courant ; au-delà, le
 * générateur laisse simplement tomber, et personne ne compte les arbres d'un
 * bosquet depuis un train.
 */
export const PROP_CAPS: Record<PropKind, number> = {
  box: 18,
  hip: 5,
  // Les accessoires de toiture sont serrés à trois ou quatre par cellule. La
  // leçon des emplacements réservés qui se paient reste la règle : quatre
  // réservoirs par cellule couvrent le cas courant, et personne ne compte les
  // châteaux d'eau d'un quartier depuis un train.
  tank: 4,
  ac: 4,
  mast: 3,
  beacon: 2,
  rail: 3,
  tree: 5,
  sign: 6,
};
const PROP_TOTAL = Object.values(PROP_CAPS).reduce((a, b) => a + b, 0);

const PARAPET_TONE = '#c6c3ba';
const ROOFTOP_TONE = '#b4b1a8';
/** Le galvanisé d'un réservoir et d'un mât : plus clair que le béton du toit. */
const METAL_TONE = '#a9aeb2';
/** Tôle laquée d'un condenseur, toujours plus claire que ce qui l'entoure. */
const PLANT_TONE = '#c3c6c4';
/** Feu d'obstacle : le rouge réglementaire, qui ne se négocie pas. */
const BEACON_TONE = '#ff2f1c';
const ROAD_TONE = '#5f5e5a';
/** Tuile sombre : c'est elle qui signe un bas quartier, vue d'un viaduc. */
const TILE_TONES = ['#4a5058', '#434a52', '#525a62', '#3e444c'];

/**
 * Dérive de la cellule bâtie tout ce qui s'y pose ou s'y substitue.
 *
 * L'acrotère est le détail qui manque le plus dès qu'on regarde du haut d'un
 * viaduc : une boîte nue ne se lit pas comme un immeuble, un immeuble a un
 * BORD de toiture. Il déborde légèrement, comme une corniche - sauf sous une
 * toiture en croupe, qui a son propre débord.
 */
export function buildCellProps(
  cell: number,
  side: 1 | -1,
  buildings: CityBuilding[],
  n: number,
  out: CityProp[],
): number {
  const r = stream(cell * 7717 + (side === 1 ? 101 : 6089));
  let count = 0;
  const push = (kind: PropKind): CityProp | null => {
    if (count >= out.length) return null;
    const p = out[count++];
    p.kind = kind;
    return p;
  };

  for (let i = 0; i < n; i++) {
    const b = buildings[i];

    if (b.grove) {
      // La masse d'arbres remplace le bâtiment : ni acrotère, ni édicule.
      const t = push('tree');
      if (t) {
        place(t, b, side, 0, 0);
        t.w = b.w;
        t.d = b.d;
        t.h = 6 + r() * 6;
        t.y = 0;
        // Variante et tirage de floraison sont HACHÉS, pas tirés du flux : ils
        // ne doivent pas décaler la suite de la cellule, dont dépend tout le
        // bâti. Ils restent stables d'un passage à l'autre pour autant.
        t.variant = Math.floor(hashInt(cell * 131 + i * 17 + 3) * 4) & 3;
        t.roll = hashInt(cell * 7919 + i * 37 + 11);
      }
      // Consommer les tirages du bâti pour que la suite ne dépende pas du cas.
      // Six, et non plus cinq : la teinte du feuillage n'est plus tirée ici,
      // et le flux doit rester calé sur ce qu'il était.
      r();
      r();
      r();
      r();
      r();
      r();
      continue;
    }

    if (b.crown === 'hip') {
      const t = push('hip');
      if (t) {
        place(t, b, side, 0, 0);
        t.w = b.w + 1.1; // débord de toiture, franc dans une rue basse
        t.d = b.d + 1.1;
        t.h = Math.min(3.4, 0.36 * Math.min(b.w, b.d) + 0.6);
        t.y = b.h;
        t.tone = TILE_TONES[Math.floor(r() * TILE_TONES.length) % TILE_TONES.length];
      }
    } else {
      const p = push('box');
      if (p) {
        place(p, b, side, 0, 0);
        p.w = b.w + 0.45;
        p.d = b.d + 0.45;
        p.h = 0.55;
        p.y = b.h;
        p.tone = PARAPET_TONE;
      }
    }

    // Édicule : cage d'escalier, machinerie, château d'eau. Seulement sur ce
    // qui a des étages à desservir. Les tirages sont consommés d'abord et la
    // décision prise ensuite : la suite avance du même nombre de pas quelle que
    // soit la branche, et la cellule reste lisible.
    const want = r();
    const ew = b.w * (0.2 + r() * 0.18);
    const ed = b.d * (0.25 + r() * 0.24);
    const eh = 2.1 + r() * 1.3;
    const es = (r() - 0.5) * 0.7;
    const ex = (r() - 0.5) * 0.7;
    if (b.h > 7 && b.crown === 'flat' && want < 0.55) {
      const q = push('box');
      if (q) {
        q.w = ew;
        q.d = ed;
        q.h = eh;
        place(q, b, side, es * (b.w - ew), ex * (b.d - ed));
        q.y = b.h;
        q.tone = ROOFTOP_TONE;
      }
    }

    // Enseigne : plaquée sur la face qui regarde la voie, donc du côté de
    // l'axe. Un écran s'étale, une enseigne verticale monte le long de l'angle.
    if (b.sign !== 'none') {
      const g = push('sign');
      if (g) {
        const v = -b.d / 2 - 0.09;
        g.tone = b.accent;
        g.d = 0;
        if (b.sign === 'screen') {
          g.w = Math.min(b.w * 0.84, 11);
          g.h = Math.min(b.h * 0.46, 7);
          place(g, b, side, 0, v);
          // Assez bas pour tomber dans le cône que la baie laisse passer : un
          // écran perché au sommet d'un immeuble proche ne se voit jamais.
          g.y = Math.max(2.6, Math.min(b.h * 0.38, b.h - g.h - 0.4));
        } else {
          g.w = 1.15;
          g.h = Math.min(b.h * 0.62, 8.5);
          // Contre un angle : c'est là qu'elles se posent, pour se lire de biais.
          place(g, b, side, (b.w / 2 - 0.8) * (r() < 0.5 ? 1 : -1), v);
          g.y = Math.max(2.9, b.h - g.h - 0.5);
        }
      }
    }

    // --- Ce qu'il y a sur un toit ---
    //
    // La Yamanote court sur viaduc la moitié de la boucle : sept mètres
    // au-dessus de la rue, la surface qu'on voit le plus n'est ni une façade ni
    // une chaussée, c'est une TOITURE. Elle n'avait qu'un acrotère et, de loin
    // en loin, un édicule en boîte - et une boîte sur une boîte ne se lit pas
    // comme un toit habité.
    //
    // Tirages consommés d'abord, décisions ensuite, comme pour l'édicule : la
    // cellule avance du même nombre de pas quelle que soit la branche.
    const wTank = r();
    const wAc = r();
    const wMast = r();
    const wRail = r();
    const kitSize = r();
    const tankU = (r() - 0.5) * 0.68;
    const tankV = (r() - 0.5) * 0.68;
    const acU = (r() - 0.5) * 0.66;
    const acFace = r() < 0.5 ? 1 : -1;
    const mastU = (r() - 0.5) * 0.72;
    const mastRise = r();

    const flat = b.crown === 'flat';
    const small = Math.min(b.w, b.d);

    // Réservoir sur pieds : la silhouette la plus reconnaissable d'un immeuble
    // japonais. On le trouve sur le bâti moyen - une tour a ses réserves à
    // l'intérieur, une échoppe n'en a pas besoin.
    if (flat && b.h >= 6 && b.h <= 46 && small >= 5.5 && wTank < 0.46) {
      const t = push('tank');
      if (t) {
        const tw = Math.min(3.3, Math.max(1.9, small * 0.32));
        t.w = tw;
        t.d = tw * 0.94;
        t.h = 2.3 + kitSize * 1.1;
        place(t, b, side, tankU * (b.w - tw), tankV * (b.d - tw));
        t.y = b.h;
        t.tone = METAL_TONE;
      }
    }

    // Batterie de condenseurs, alignée le long d'un BORD de toiture : c'est là
    // qu'elle est, pour la reprise d'air, jamais au milieu.
    if (flat && b.h >= 8 && small >= 6 && wAc < 0.52) {
      const p = push('ac');
      if (p) {
        const aw = Math.min(5, Math.max(2.4, small * 0.44));
        p.w = aw;
        p.d = aw * 0.66;
        p.h = 1.35 + kitSize * 0.4;
        place(p, b, side, acU * (b.w - aw), acFace * Math.max(0, b.d / 2 - p.d / 2 - 0.45));
        p.y = b.h;
        p.tone = PLANT_TONE;
      }
    }

    // Mât d'antenne, et son feu rouge d'obstacle. La réglementation impose le
    // feu au-dessus de soixante mètres et l'usage bien plus bas ; on le pose
    // dès quarante, sur la pointe, parce que c'est ce qu'on voit d'un train la
    // nuit - le seul point rouge fixe d'un ciel de Tokyo.
    if (flat && b.h >= 11 && wMast < 0.34) {
      const mh = 3.4 + mastRise * 5.6;
      const m = push('mast');
      if (m) {
        m.w = 1.1;
        m.d = 1.1;
        m.h = mh;
        place(m, b, side, mastU * (b.w - 1.6), 0);
        m.y = b.h;
        m.tone = METAL_TONE;
        if (b.h + mh >= 40) {
          const f = push('beacon');
          if (f) {
            f.w = 0.42;
            f.d = 0.42;
            f.h = 0.42;
            f.s = m.s;
            f.x = m.x;
            f.yaw = m.yaw;
            // Le feu est porté par SON mât, donc par le même sol : sans cette
            // reprise, il héritait du `base` laissé dans l'emplacement par la
            // cellule précédente - un autre point de la ligne, à une autre
            // altitude.
            f.base = m.base;
            f.y = b.h + mh + 0.2;
            f.tone = BEACON_TONE;
          }
        }
      }
    }

    // Garde-corps : il se pose SUR l'acrotère. Vu d'un viaduc, c'est lui qui
    // dit qu'un toit est accessible, donc habité.
    if (flat && b.h >= 8 && b.h <= 50 && small >= 5 && wRail < 0.4) {
      const p = push('rail');
      if (p) {
        place(p, b, side, 0, 0);
        p.w = b.w - 0.3;
        p.d = b.d - 0.3;
        p.h = 1.05;
        p.y = b.h + 0.55;
        p.tone = METAL_TONE;
      }
    }
  }

  // Chaussée : la trouée devient une perspective au lieu d'un trou. Elle prend
  // la trame du quartier, comme le bâti qui la borde - une rue droite au milieu
  // d'un tissu de biais se verrait tout de suite.
  if (roadwayOf(cell, ROADWAY)) {
    const p = push('box');
    if (p) {
      p.s = ROADWAY.s;
      p.w = ROADWAY.w;
      p.x = ROADWAY.x;
      p.d = ROADWAY.d;
      p.h = 0.14;
      p.y = 0;
      // La chaussée est le seul accessoire qui n'appartienne à aucun bâtiment :
      // elle lit donc son sol elle-même, là où elle est posée. À défaut elle
      // gardait le `base` d'un sujet d'une autre cellule, et la dalle flottait
      // dans sa propre trouée.
      p.base = cityGround(ROADWAY.s, ROADWAY.x, side);
      p.tone = ROAD_TONE;
      p.yaw = ROADWAY.yaw;
    }
  }
  return count;
}

/** Tableau de travail réutilisable, à la capacité d'une cellule. */
export function makePropBuffer(): CityProp[] {
  return Array.from({ length: PROP_TOTAL }, () => ({
    kind: 'box' as PropKind,
    s: 0,
    x: 0,
    w: 0,
    d: 0,
    h: 0,
    y: 0,
    base: 0,
    tone: '#ffffff',
    variant: 0,
    roll: 0,
    yaw: 0,
  }));
}

/** Tableau de travail réutilisable, à la capacité d'une cellule. */
export function makeCellBuffer(length = CELL_CAPACITY): CityBuilding[] {
  return Array.from({ length }, () => ({
    s: 0,
    x: 0,
    y: 0,
    w: 0,
    d: 0,
    h: 0,
    facade: '#ffffff',
    shade: 1,
    accent: '#ffffff',
    glow: 0,
    socle: 0,
    crown: 'flat' as const,
    sign: 'none' as const,
    grove: false,
    warm: 1,
    jx: 0,
    jy: 0,
    balcony: false,
    yaw: 0,
    real: false,
  }));
}
