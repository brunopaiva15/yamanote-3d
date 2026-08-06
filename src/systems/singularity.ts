// Les singularités de la ligne : le passage à niveau, les traversées de
// rivière, l'autoroute urbaine qui longe la voie.
//
// Ce ne sont pas des ornements tirés au sort mais des FAITS, écrits avec les
// tronçons (data/segments) : un seul passage à niveau sur toute la boucle, trois
// rivières, trois tronçons longés par le 首都高. Ce module dit OÙ ils tombent en
// abscisse monde, et le rendu (three/Singularities) les y pose.
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

import { SEGMENTS, cruiseDuration, segmentAt } from '../data/segments.ts';
import type { LoopDirection } from '../data/platforms.ts';
import { cityAnchor, clearing, hashInt, streetNear } from './cityField.ts';
import { journeyDistance } from './trainPhysics.ts';

/** Les deux singularités ponctuelles de la boucle. */
export type SingularKind = 'crossing' | 'river';

const KINDS: readonly SingularKind[] = ['crossing', 'river'];

/**
 * Largeur de la trouée le long de la voie (m), par nature.
 *
 * La rivière est la plus large de tout le parcours - rien ne se construit sur
 * une rivière - et le passage à niveau la plus étroite : le 第二中里踏切 est une
 * ruelle à voie unique, et c'est précisément ce qui explique qu'il ait survécu
 * là où tous les autres ont été supprimés.
 */
export const WIDTH: Record<SingularKind, number> = {
  crossing: 7,
  river: 24,
};

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
): { kind: SingularKind; at: number; length: number } | null {
  const spec = SEGMENTS[segmentAt(index, dir)];
  if (!spec) return null;
  const length = segmentLength(index, dir);
  for (const kind of KINDS) {
    const f = spec[kind];
    if (f === undefined) continue;
    return { kind, at: (dir === 'inner' ? f : 1 - f) * length, length };
  }
  return null;
}

/** Dernière abscisse théorique ancrée : au mètre près, l'ancrage ne rejoue pas. */
let anchoredWant = Number.NaN;

/**
 * Longueurs de tronçon, mémorisées par durée de croisière.
 *
 * `journeyDistance` intègre six cents pas de profil de traction : c'est
 * dérisoire une fois, et déraisonnable soixante fois par seconde. Les trente
 * tronçons de la boucle n'ont que dix-huit durées de croisière distinctes.
 */
const LENGTHS = new Map<number, number>();

function segmentLength(index: number, dir: LoopDirection): number {
  const cruise = cruiseDuration(index, dir);
  const known = LENGTHS.get(cruise);
  if (known !== undefined) return known;
  const length = journeyDistance(cruise);
  LENGTHS.set(cruise, length);
  return length;
}

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
      anchor(found.kind, want);
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

function anchor(kind: SingularKind, want: number): void {
  const street = streetNear(want);
  singularity.kind = kind;
  singularity.w = WIDTH[kind];
  singularity.s = street ? street.s : want;
  singularity.yaw = street ? Math.max(-YAW_MAX, Math.min(YAW_MAX, street.yaw)) : 0;
  singularity.epoch++;
  // Seule la rivière commande à la ville : une rue de dix mètres ne suffit pas à
  // laisser passer une nappe d'eau de vingt-quatre, et le tissu doit s'ouvrir
  // pour de bon. Le passage à niveau, lui, se contente de la rue qu'il trouve -
  // un passage à niveau EST une rue.
  if (kind === 'river') {
    clearing.s = singularity.s;
    clearing.half = singularity.w / 2 + NEAR_DEPTH * Math.abs(Math.sin(singularity.yaw));
  } else {
    clearing.half = 0;
  }
}
