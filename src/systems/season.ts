// La saison, dérivée de la date civile à Tokyo (runtime.tokyoDate).
//
// Le cycle jour / nuit était jusqu'ici la seule horloge du décor : le monde
// changeait d'heure en heure, jamais de mois en mois. Or sur la Yamanote, ce
// qu'on voit par la vitre en février et ce qu'on voit en août n'ont pas la même
// couleur, pas la même lumière, et pas la même durée de jour — c'est ce que ce
// module modélise, pour que la saison soit VISIBLE DEPUIS DEHORS.
//
// Deux familles de valeurs, et il faut les distinguer :
//
//   · les POIDS DE SAISON (`w`), quatre nombres qui somment à 1, fondus sur
//     ~26 jours de part et d'autre de quatre bornes. Ils servent aux réglages
//     continus — teinte du ciel, dureté de la lumière, portée de la brume ;
//   · les PHÉNOMÈNES DATÉS (`sakura`, `koyo`, `tsuyu`, `heat`, `bare`…), des
//     cloches indépendantes posées sur le quantième. Ils ne se déduisent PAS
//     des poids : la floraison des cerisiers dure douze jours au milieu d'un
//     printemps qui en dure quatre-vingt-sept, et le tsuyu chevauche la
//     frontière printemps / été au lieu de la suivre.
//
// La lumière du jour, elle, ne se fond pas : elle se calcule. Tokyo (35,7° N)
// voit le soleil se lever à 4 h 25 au solstice d'été et à 6 h 47 à celui
// d'hiver, se coucher à 19 h 00 puis à 16 h 32 — deux heures et demie d'écart
// sur le coucher, c'est le fait saisonnier le plus fort de tous, et le plus
// facile à rater. `daynight` s'y recale.
//
// Les valeurs sont mises en cache par date : ce module est interrogé plusieurs
// fois par image (lumière, ciel, ville, bord de voie) et ne recalcule qu'au
// passage de minuit.

import { runtime } from './runtime';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

export interface SeasonState {
  /** Quantième 1..365 (années bissextiles ignorées : un jour de dérive). */
  doy: number;
  /** Poids fondus des quatre saisons. Somme = 1, deux au plus sont non nuls. */
  w: Record<Season, number>;
  /** Saison dominante — pour l'affichage, jamais pour un réglage continu. */
  dominant: Season;

  // --- Phénomènes datés (0..1) ---------------------------------------------
  /** 桜 : floraison des cerisiers, ~24 mars → 10 avril à Tokyo. */
  sakura: number;
  /** 若葉 : le vert cru et clair des feuilles neuves, d'avril à fin mai. */
  newGreen: number;
  /** 紅葉 : rougeoiement, tardif à Tokyo — pic fin novembre / début décembre. */
  koyo: number;
  /** Ramure nue : décembre à mi-mars. */
  bare: number;
  /** 梅雨 : saison des pluies, ~7 juin → 20 juillet. */
  tsuyu: number;
  /** Canicule et moiteur : mi-juillet à mi-septembre. Brume de chaleur. */
  heat: number;
  /** Froid : autorise la neige, durcit et blanchit la lumière. */
  cold: number;

  // --- Lumière --------------------------------------------------------------
  /** Lever du soleil à Tokyo (heure décimale). */
  sunriseH: number;
  /** Coucher du soleil à Tokyo (heure décimale). */
  sunsetH: number;
  /** Hauteur du soleil à midi (degrés au-dessus de l'horizon). */
  noonAltitude: number;

  // --- Végétation -----------------------------------------------------------
  /**
   * Palette de feuillage de la saison (hex, sRGB). Quatre variantes : les
   * bosquets y piochent par un index stable, si bien qu'une lisière n'est
   * jamais d'un seul vert.
   */
  foliage: readonly string[];
  /** Part de sujets en fleurs plutôt qu'en feuilles (sakura). */
  blossom: number;
  /** Teinte de la floraison. */
  blossomTone: string;
  /**
   * Ampleur des frondaisons : 1 en pleine feuille, ~0,55 sur une ramure nue.
   * C'est le volume qui dit l'hiver de loin, bien avant la couleur.
   */
  canopy: number;

  // --- Air ------------------------------------------------------------------
  /**
   * Teinte de l'air de la saison (hex, sRGB), mêlée au ciel, à la brume et à
   * la lumière du soleil.
   *
   * Ce n'est pas un étalonnage d'humeur : c'est de l'air. Un janvier de Tokyo
   * est sec et sans particules — la lumière y bleuit et le lointain reste net
   * à perte de vue, c'est en hiver qu'on voit le Fuji depuis les tours. Un août
   * est chargé de vapeur d'eau : le blanc jaunit, le contraste tombe et les
   * tours d'Ikebukuro se noient à six cents mètres.
   */
  airTone: string;
  /**
   * Netteté du lointain : > 1 l'hiver (la brume recule), < 1 l'été. Multiplie
   * directement le `near` et le `far` de la brume de scène.
   */
  clarity: number;
}

// --- Outils ------------------------------------------------------------------

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Quantième du premier jour de chaque mois (année commune). */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function dayOfYear(month: number, day: number): number {
  const m = (((Math.floor(month) - 1) % 12) + 12) % 12;
  return MONTH_START[m] + Math.max(1, Math.min(31, Math.floor(day)));
}

/** Écart de quantièmes ramené dans [-182,5 ; 182,5] : l'année est un cercle. */
function cyc(d: number): number {
  let x = d % 365;
  if (x > 182.5) x -= 365;
  if (x < -182.5) x += 365;
  return x;
}

/**
 * Cloche datée : monte de `a` à `b`, tient, redescend de `c` à `d`. Les bornes
 * sont des quantièmes, éventuellement supérieurs à 365 pour enjamber le nouvel
 * an (la ramure nue commence en décembre et finit en mars).
 */
function bump(doy: number, a: number, b: number, c: number, d: number): number {
  const t = cyc(doy - a);
  return smooth(0, b - a, t) * (1 - smooth(c - a, d - a, t));
}

// --- Poids de saison ---------------------------------------------------------

/**
 * Quatre bornes, quatre fondus de vingt-six jours. Elles ne tombent pas sur les
 * équinoxes : au Japon le calendrier ressenti est décalé, l'été s'étire jusqu'à
 * fin septembre et l'automne ne mord vraiment qu'en octobre. La borne de juin
 * est celle de l'entrée du tsuyu, qui est bien ce qui fait basculer le
 * printemps dans l'été à Tokyo.
 */
const BOUNDARIES: readonly { doy: number; to: Season }[] = [
  { doy: 69, to: 'spring' }, // ~10 mars
  { doy: 156, to: 'summer' }, // ~5 juin, entrée du tsuyu
  { doy: 278, to: 'autumn' }, // ~5 octobre
  { doy: 339, to: 'winter' }, // ~5 décembre
];
const FADE = 26;

function seasonWeights(doy: number): Record<Season, number> {
  const w: Record<Season, number> = { winter: 0, spring: 0, summer: 0, autumn: 0 };
  for (let i = 0; i < BOUNDARIES.length; i++) {
    const start = BOUNDARIES[i].doy;
    const end = BOUNDARIES[(i + 1) % BOUNDARIES.length].doy;
    // Montée à sa borne, descente à la suivante. Les deux fondus étant le même
    // smoothstep sur le même intervalle, la somme vaut exactement 1 partout.
    const up = smooth(-FADE / 2, FADE / 2, cyc(doy - start));
    const down = 1 - smooth(-FADE / 2, FADE / 2, cyc(doy - end));
    w[BOUNDARIES[i].to] = up * down;
  }
  return w;
}

// --- Lumière du jour ---------------------------------------------------------

/**
 * Lever et coucher à Tokyo, par cosinus calé sur les extrêmes réels : 4 h 25 /
 * 19 h 00 au solstice d'été, 6 h 47 / 16 h 32 à celui d'hiver.
 *
 * Les deux cosinus n'ont pas la même phase, et c'est volontaire : le lever le
 * plus précoce tombe vers le 13 juin, le coucher le plus tardif vers le 1er
 * juillet. C'est l'asymétrie qui fait qu'en décembre la nuit tombe déjà à
 * 16 h 30 alors que le soleil ne se lève pas plus tard qu'en janvier.
 */
const SUNRISE_MID = 5.6;
const SUNRISE_AMP = 1.183;
const SUNRISE_PHASE = 164; // ~13 juin
const SUNSET_MID = 17.77;
const SUNSET_AMP = 1.233;
const SUNSET_PHASE = 182; // ~1er juillet

/** Latitude de Tokyo, pour la hauteur du soleil à midi. */
const TOKYO_LAT = 35.7;
/** Obliquité de l'écliptique. */
const OBLIQUITY = 23.44;

function sunTimes(doy: number): { sunriseH: number; sunsetH: number; noonAltitude: number } {
  const tau = 2 * Math.PI / 365;
  const decl = OBLIQUITY * Math.cos(tau * cyc(doy - 172));
  return {
    sunriseH: SUNRISE_MID - SUNRISE_AMP * Math.cos(tau * cyc(doy - SUNRISE_PHASE)),
    sunsetH: SUNSET_MID + SUNSET_AMP * Math.cos(tau * cyc(doy - SUNSET_PHASE)),
    noonAltitude: 90 - TOKYO_LAT + decl,
  };
}

// --- Feuillage ---------------------------------------------------------------

/**
 * Quatre palettes de feuillage, et un mélange.
 *
 * Les teintes sont portées par la COULEUR D'INSTANCE du bosquet, dont la
 * géométrie ne garde plus qu'un ombrage neutre (voir three/city/cityProps) :
 * un feuillage vert dans les sommets ne peut pas devenir rouge par
 * multiplication, et l'automne resterait donc un été terne.
 */
const SUMMER_LEAF = ['#4b8a3a', '#569a44', '#3f7c33', '#61a54c'];
/** Le vert cru et clair des feuilles neuves — il ne ressemble à rien d'autre. */
const SPRING_LEAF = ['#77b955', '#8ac762', '#6aa94b', '#95cf6d'];
/** 紅葉 : à Tokyo c'est autant le jaune des ginkgos que le rouge des érables. */
const AUTUMN_LEAF = ['#c8722c', '#d8a33a', '#b4472c', '#c98f34'];
/** Ramure nue : ce qui reste est du bois et de la brindille, pas du feuillage. */
const WINTER_LEAF = ['#6d6152', '#7a6d5c', '#635849', '#82735f'];
/** Sakura : rose lavé, presque blanc — le rose vif est une faute d'écolier. */
const SAKURA_TONE = '#f0cdd8';

/** Teinte de l'air, par saison. */
const AIR_TONE: Record<Season, string> = {
  winter: '#dae8fb',
  spring: '#f0eede',
  summer: '#f7edd6',
  autumn: '#f4e6cf',
};

function parseHex(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function toHex(rgb: [number, number, number]): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  return `#${((1 << 24) | (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2])).toString(16).slice(1)}`;
}

/** Mélange pondéré de teintes hex (sRGB). Les poids n'ont pas à sommer à 1. */
function mixHex(entries: readonly (readonly [string, number])[]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let sum = 0;
  for (const [hex, weight] of entries) {
    if (weight <= 0) continue;
    const c = parseHex(hex);
    r += c[0] * weight;
    g += c[1] * weight;
    b += c[2] * weight;
    sum += weight;
  }
  if (sum <= 0) return '#ffffff';
  return toHex([r / sum, g / sum, b / sum]);
}

// --- État ---------------------------------------------------------------------

export function seasonAt(month: number, day: number): SeasonState {
  const doy = dayOfYear(month, day);
  const w = seasonWeights(doy);
  const { sunriseH, sunsetH, noonAltitude } = sunTimes(doy);

  const sakura = bump(doy, 81, 88, 94, 101); // 22 mars → 11 avril
  const newGreen = bump(doy, 100, 112, 140, 152); // 10 avril → 1er juin
  const koyo = bump(doy, 310, 328, 340, 352); // 6 novembre → 18 décembre
  const bare = bump(doy, 339, 359, 439, 460); // 5 décembre → 5 avril
  const tsuyu = bump(doy, 155, 163, 196, 205); // 4 juin → 24 juillet
  const heat = bump(doy, 190, 205, 250, 270); // 9 juillet → 27 septembre
  const cold = bump(doy, 330, 350, 415, 444); // 26 novembre → 20 mars

  // Le feuillage n'est pas la saison : il est la somme de trois phénomènes
  // datés posés sur un fond d'été. Une frondaison ne devient pas rouge parce
  // qu'on est « en automne » — elle le devient dix jours fin novembre.
  const summer = Math.max(0, 1 - koyo - bare * 0.9 - newGreen * 0.8);
  const foliage = SUMMER_LEAF.map((_, i) =>
    mixHex([
      [SUMMER_LEAF[i], summer],
      [SPRING_LEAF[i], newGreen],
      [AUTUMN_LEAF[i], koyo],
      [WINTER_LEAF[i], bare],
    ]),
  );

  let dominant: Season = 'winter';
  for (const s of SEASONS) if (w[s] > w[dominant]) dominant = s;

  return {
    doy,
    w,
    dominant,
    sakura,
    newGreen,
    koyo,
    bare,
    tsuyu,
    heat,
    cold,
    sunriseH,
    sunsetH,
    noonAltitude,
    foliage,
    // Tous les arbres de Tokyo ne sont pas des cerisiers : au plus fort de la
    // floraison, un sujet sur trois. Au-delà, la ville devient un décor de
    // carte postale et la floraison cesse d'être un événement.
    blossom: sakura * 0.34,
    blossomTone: SAKURA_TONE,
    airTone: mixHex(SEASONS.map((s) => [AIR_TONE[s], w[s]] as const)),
    clarity: 1 + 0.32 * cold - 0.3 * heat,
    // La ramure nue garde du volume — des branches, ce n'est pas rien — mais
    // beaucoup moins qu'une frondaison en juillet.
    canopy: 1 - 0.45 * bare,
  };
}

let cacheKey = -1;
let cached: SeasonState = seasonAt(runtime.tokyoDate.month, runtime.tokyoDate.day);

/**
 * Saison du jour courant du monde. Mise en cache par date : appelée plusieurs
 * fois par image, elle ne recalcule qu'au passage de minuit.
 */
export function seasonNow(): SeasonState {
  const d = runtime.tokyoDate;
  const key = d.month * 100 + d.day;
  if (key !== cacheKey) {
    cacheKey = key;
    cached = seasonAt(d.month, d.day);
  }
  return cached;
}
