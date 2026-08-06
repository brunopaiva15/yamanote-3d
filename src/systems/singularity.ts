// Les singularités de la ligne : le passage à niveau, les traversées de
// rivière, l'autoroute urbaine qui longe la voie.
//
// Ce ne sont pas des ornements tirés au sort mais des FAITS : un seul passage à
// niveau sur toute la boucle, six traversées d'eau à ciel ouvert, trois tronçons
// longés par le 首都高. Ce module dit OÙ ils tombent en abscisse monde, et le
// rendu (three/Singularities) les y pose.
//
// Le passage à niveau et l'autoroute sont écrits avec les tronçons
// (data/segments) : ils tiennent en un fait chacun. Les rivières, elles,
// viennent d'OpenStreetMap (data/water, engendré par scripts/geo/fetch-water) —
// position sur la boucle ET largeur relevée dans l'axe de la voie. Elles étaient
// jusqu'ici trois fractions saisies à la main, dont une qui n'existe pas.
//
// --- Deux natures, deux géométries ---
// Le passage à niveau et la rivière sont PONCTUELS : ils arrivent, on les
// franchit, ils s'en vont. L'autoroute urbaine, elle, accompagne - elle longe le
// tronçon d'un bout à l'autre, et c'est ce qui la rend reconnaissable : un
// tablier de quinze mètres de large posé sur ses piles au-dessus du premier rang,
// qui suit la rame pendant une minute entière.
//
// --- Pourquoi une abscisse monde, et pas une fraction de trajet ---
// Le décor de la Yamanote est posé dans le monde et c'est le train qui avance
// (voir systems/cityField). Une singularité qui vivrait en fraction de trajet
// glisserait avec le temps : elle avancerait pendant le freinage et resterait
// immobile pendant le hold de départ. Elle est donc ANCRÉE une fois par trajet,
// à l'abscisse de la gare quittée plus sa part de la longueur du tronçon - et
// elle ne bouge plus jusqu'à la gare suivante.
//
// --- Pourquoi une rue existante ---
// Une rivière et un passage à niveau ont besoin d'une TROUÉE dans le tissu
// urbain, et il y en a déjà une : la rue perpendiculaire, qui perce les trois
// rangs au même endroit. On accroche donc la singularité à la rue la plus proche
// de son abscisse théorique - à quelques dizaines de mètres près, ce qui ne se
// vérifie sur aucune carte - plutôt que d'ouvrir une brèche au milieu d'un îlot.
// Seule la rivière, plus large qu'une rue, demande en plus une trouée imposée
// (`clearing` de cityField).

import { SEGMENTS, segmentAt } from '../data/segments.ts';
import type { LoopDirection } from '../data/platforms.ts';
import { WATER_CROSSINGS, type WaterCrossing } from '../data/water.ts';
import { cityAnchor, clearing, hashInt, streetNear } from './cityField.ts';
import { segmentLength } from './trainPhysics.ts';

/** Les deux singularités ponctuelles de la boucle. */
export type SingularKind = 'crossing' | 'river';

/**
 * Largeur de la trouée du passage à niveau, le long de la voie (m).
 *
 * La plus étroite du parcours : le 第二中里踏切 est une ruelle à voie unique, et
 * c'est précisément ce qui explique qu'il ait survécu là où tous les autres ont
 * été supprimés. Les rivières, elles, ont chacune la LEUR - mesurée dans l'axe
 * de la voie sur le plan d'eau d'OpenStreetMap (src/data/water.ts) : la 神田川
 * fait vingt-huit mètres et demi à Akihabara, onze et demi à Takadanobaba.
 */
export const CROSSING_WIDTH = 7;

/**
 * Les traversées à ciel ouvert, rangées par tronçon.
 *
 * Une par tronçon au plus : c'est ce que dit le relevé, et tests/water le
 * vérifie. Le rendu n'en pose qu'une à la fois, et deux au même endroit
 * feraient disparaître la seconde sans un mot.
 */
const RIVER_OF = new Map<number, WaterCrossing>();
for (const c of WATER_CROSSINGS) if (!RIVER_OF.has(c.segment)) RIVER_OF.set(c.segment, c);

/**
 * Profondeur du bâti proche (m) : la marge que la rotation coûte à la trouée.
 *
 * Une singularité tournée dans la trame du quartier n'occupe pas seulement sa
 * largeur : ses extrémités s'écartent le long de la voie de ce que la rotation
 * leur donne. Le tissu doit s'ouvrir d'autant, sinon un immeuble du troisième
 * rang se plante dans le mur de berge.
 */
const NEAR_DEPTH = 66;

/**
 * Inclinaison maximale d'une singularité par rapport à la perpendiculaire (rad).
 *
 * La trame d'un quartier va jusqu'à vingt-six degrés (`gridAngleAt`) : suivie
 * telle quelle, un mur de berge de cent trente mètres balaierait plus de
 * cinquante mètres de voie et il faudrait vider trois cellules pour lui faire de
 * la place. On garde donc le SENS de la trame, borné.
 */
const YAW_MAX = 0.22;

export const singularity = {
  /** Nature de la singularité ponctuelle du tronçon courant, ou `null`. */
  kind: null as SingularKind | null,
  /** Abscisse monde du centre (m) - même repère que cityField. */
  s: 0,
  /** Orientation dans le plan (rad) : la trame de la rue qui la porte, bornée. */
  yaw: 0,
  /** Largeur le long de la voie (m). */
  w: 0,
  /**
   * Compteur d'ancrage, incrémenté chaque fois que le centre se déplace.
   *
   * C'est le signal que le ruban urbain attend : les cellules qui recouvrent la
   * trouée ont pu être engendrées AVANT qu'on sache qu'une rivière allait passer
   * là (l'anneau porte deux cent vingt mètres d'avance, et la Kanda tombe à cent
   * soixante-dix mètres de Kanda). Il faut alors les rebâtir sur place.
   */
  epoch: 0,
};

/**
 * L'autoroute urbaine qui longe le tronçon, quand il y en a une.
 *
 * Elle vit en abscisses monde comme tout le reste du décor, et son tablier
 * s'arrête à soixante mètres de chaque gare : le début et la fin de l'ouvrage
 * tombent ainsi derrière les structures de quai, qui les masquent. Un tablier
 * qui apparaîtrait en fondu au milieu du ciel ne tromperait personne.
 */
export const expressway = {
  /** Le tronçon courant est-il longé ? */
  on: false,
  /** Côté de la voie (+1 / −1), haché du tronçon : stable pour toujours. */
  side: 1 as 1 | -1,
  /** Abscisses monde du début et de la fin du tablier (m). */
  s0: 0,
  s1: 0,
};

/** Retrait du tablier par rapport aux gares (m) : de quoi se cacher derrière. */
const EXPRESSWAY_MARGIN = 60;

/**
 * Une chose posée le long de la voie à l'abscisse `s` est-elle DANS l'ouvrage ?
 *
 * Le passage à niveau et la rivière sont des trouées : le décor de bord de voie
 * les traverserait sans y penser - un arbre planté au milieu de la chaussée, une
 * voiture qui roule sur l'eau, un poteau dans le chenal. Chacun de ces
 * pourvoyeurs (three/Wayside, city/Traffic, city/Utilities) connaît l'abscisse
 * monde de ce qu'il pose : il suffit de la lui faire vérifier ici.
 *
 * La marge est celle de l'objet, pas de l'ouvrage : un arbre de six mètres de
 * couronne doit s'écarter davantage qu'une borne.
 */
/**
 * Faut-il OUVRIR la clôture de la ligne, et de combien (0..1) ?
 *
 * Un passage à niveau est par définition une rupture de la clôture, et une
 * rivière en est une autre. Mais la clôture n'est pas faite d'objets qu'on
 * escamote un à un : c'est un plan de quatre cents mètres à texture répétée
 * (three/SegmentEnvironment), et y percer un trou demanderait un nuanceur - qu'il
 * faudrait alors écrire deux fois, le mode Extraordinaire ne lisant pas le GLSL.
 *
 * On l'efface donc en entier, mais SEULEMENT quand l'ouvrage est sous les yeux.
 * L'arbitrage se voit à l'œil nu : une haie qui traverse une chaussée se
 * remarque immédiatement, une haie absente pendant trois secondes ne se remarque
 * pas - elle est basse, répétitive, et l'œil est occupé ailleurs.
 */
export function fenceBreak(distance: number): number {
  if (singularity.kind === null) return 0;
  const d = Math.abs(distance - singularity.s);
  const t = (d - FENCE_HIDE) / (FENCE_KEEP - FENCE_HIDE);
  return 1 - Math.max(0, Math.min(1, t));
}

/**
 * Distances (m) entre lesquelles la clôture revient de rien à tout.
 *
 * La fenêtre est COURTE, et elle l'est devenue à la lecture des captures : la
 * clôture est déjà semi-transparente d'elle-même (le fondu croisé haie/grillage
 * de three/SegmentEnvironment), et l'ouvrir en plus la changeait en panneaux de
 * verre vert sur cent mètres de voie. Vingt-cinq mètres de fondu ne se voient
 * pas ; cent mètres de haie fantôme se voient tout de suite.
 */
const FENCE_HIDE = 42;
const FENCE_KEEP = 78;

export function inSingularity(s: number, margin = 0): boolean {
  if (singularity.kind === null) return false;
  // L'ouvrage est tourné dans la trame : ses bords balaient un peu de voie de
  // part et d'autre. Douze mètres d'emprise ferroviaire suffisent à décrire ce
  // que la rotation coûte à ce qui est posé au bord.
  const skew = 12 * Math.abs(Math.sin(singularity.yaw));
  return Math.abs(s - singularity.s) < singularity.w / 2 + skew + margin;
}

/**
 * Nature et position de la singularité ponctuelle d'un trajet, en mètres depuis
 * la gare quittée - ou `null` si le tronçon n'en porte aucune.
 *
 * Les fractions de data/segments sont comptées dans le sens 内回り, c'est-à-dire
 * depuis la première gare du NOM du tronçon. En 外回り on le parcourt à
 * l'envers : la fraction se retourne, et une rivière au quart du tronçon depuis
 * Kanda est aux trois quarts quand on vient d'Akihabara.
 *
 * Fonction pure, et c'est ce qui la rend vérifiable (tests/singularity).
 */
export function singularityOffset(
  index: number,
  dir: LoopDirection,
): { kind: SingularKind; at: number; length: number; width: number } | null {
  const seg = segmentAt(index, dir);
  const spec = SEGMENTS[seg];
  if (!spec) return null;
  const found = singularOn(seg);
  if (!found) return null;
  const length = segmentLength(index, dir);
  const f = dir === 'inner' ? found.f : 1 - found.f;
  return { kind: found.kind, at: f * length, length, width: found.width };
}

/**
 * La singularité ponctuelle d'un tronçon, en fraction 内回り et en largeur.
 *
 * Le passage à niveau passe avant la rivière, et l'ordre ne se voit jamais :
 * aucun tronçon ne porte les deux (tests/water).
 */
function singularOn(seg: number): { kind: SingularKind; f: number; width: number } | null {
  const f = SEGMENTS[seg]?.crossing;
  if (f !== undefined) return { kind: 'crossing', f, width: CROSSING_WIDTH };
  const river = RIVER_OF.get(seg);
  if (river) return { kind: 'river', f: river.fraction, width: river.width };
  return null;
}

/** Dernière abscisse théorique ancrée : au mètre près, l'ancrage ne rejoue pas. */
let anchoredWant = Number.NaN;

/**
 * À appeler une fois par frame, depuis `updateSegmentEnv`.
 *
 * `index` est la gare d'ARRIVÉE (elle avance au début de `depart`, en même temps
 * que `cityAnchor` se recale sur la gare quittée) : les deux sont donc lus dans
 * le même repère, et la singularité s'ancre dès qu'on s'ébranle.
 */
export function updateSingularity(index: number, dir: LoopDirection): void {
  const seg = segmentAt(index, dir);
  const found = singularityOffset(index, dir);
  if (found) {
    const want = cityAnchor.s + found.at;
    if (found.kind !== singularity.kind || Math.abs(want - anchoredWant) > 1) {
      anchoredWant = want;
      anchor(found.kind, want, found.width);
    }
  } else {
    retire();
  }

  // L'autoroute urbaine : pas d'ancrage à négocier, elle prend le tronçon
  // entier. Le côté est haché du numéro de tronçon, donc le 首都高 est toujours
  // du même côté au même endroit de la boucle.
  expressway.on = SEGMENTS[seg]?.expressway === true;
  if (expressway.on) {
    const length = found?.length ?? segmentLength(index, dir);
    expressway.side = hashInt(seg * 2654435761 + 331) < 0.5 ? 1 : -1;
    expressway.s0 = cityAnchor.s + EXPRESSWAY_MARGIN;
    expressway.s1 = cityAnchor.s + length - EXPRESSWAY_MARGIN;
  }
}

function retire(): void {
  if (singularity.kind === null) return;
  singularity.kind = null;
  anchoredWant = Number.NaN;
  // La trouée se referme, mais les cellules déjà posées gardent la leur : elles
  // sont derrière, et on ne rebâtit pas ce qu'on ne regarde plus.
  clearing.half = 0;
}

function anchor(kind: SingularKind, want: number, width: number): void {
  const street = streetNear(want);
  singularity.kind = kind;
  singularity.w = width;
  singularity.s = street ? street.s : want;
  singularity.yaw = street ? Math.max(-YAW_MAX, Math.min(YAW_MAX, street.yaw)) : 0;
  singularity.epoch++;
  // Seule la rivière commande à la ville : une rue de dix mètres ne suffit pas à
  // laisser passer les trente-neuf mètres du 日本橋川, et le tissu doit s'ouvrir
  // pour de bon. Le passage à niveau, lui, se contente de la rue qu'il trouve -
  // un passage à niveau EST une rue.
  if (kind === 'river') {
    clearing.s = singularity.s;
    clearing.half = singularity.w / 2 + NEAR_DEPTH * Math.abs(Math.sin(singularity.yaw));
  } else {
    clearing.half = 0;
  }
}
