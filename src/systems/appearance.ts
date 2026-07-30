// Apparence des PNJ : un descripteur riche par voyageur, généré de façon
// déterministe (rng mulberry32 par id) pour une foule tokyoïte crédible et
// stable - silhouettes, corpulences, habits (haut ET bas indépendants),
// coiffures et accessoires variés. Consommé par three/Passengers (géométrie)
// et textures/procedural (visage).
//
// La diversité chromatique couvre toutes les cultures présentes dans une
// rame Yamanote : majorité est-asiatique chez les locaux, palette mondiale
// chez les touristes (peaux claires à très foncées, cheveux noirs à blonds).

import { rng } from '../textures/procedural';

export type Archetype = 'salaryman' | 'officeLady' | 'casual' | 'student' | 'senior' | 'tourist';
export type TopType = 'suit' | 'coat' | 'jacket' | 'hoodie' | 'sweater' | 'tshirt' | 'blouse';
export type BottomType = 'trousers' | 'skirt' | 'shorts' | 'dress';
export type HairStyle = 'short' | 'buzz' | 'bun' | 'long' | 'ponytail' | 'bald';
export type Hat = 'none' | 'cap' | 'beanie';
export type Bag = 'none' | 'backpack' | 'shoulder' | 'hand';

/** Ascendance / phénotype pour peaux et cheveux cohérents. */
export type Heritage =
  | 'eastAsian'
  | 'southeastAsian'
  | 'southAsian'
  | 'middleEastern'
  | 'european'
  | 'african'
  | 'latin'
  | 'pacific';

// Proportions réelles (unités locales, pieds à y=0) : la corpulence vient de
// la géométrie, pas d'une simple mise à l'échelle.
export interface Build {
  scale: number; // taille globale 0.88..1.12 (appliquée au groupe)
  shoulderR: number; // rayon épaules
  chestR: number; // rayon poitrine
  waistR: number; // rayon taille (ventre inclus)
  hipR: number; // rayon bassin
  legR: number; // rayon d'une jambe
}

export interface Appearance {
  archetype: Archetype;
  heritage: Heritage;
  feminine: boolean; // silhouette / visage féminins (build, traits, cils)
  build: Build;
  skin: string;
  hair: { style: HairStyle; color: string };
  top: { type: TopType; color: string };
  bottom: { type: BottomType; color: string };
  shoes: string;
  glasses: boolean;
  mask: boolean; // masque chirurgical (fréquent à Tokyo)
  facialHair: boolean;
  hat: Hat;
  scarf: boolean;
  scarfColor: string;
  bag: Bag;
  bagColor: string;
  senior: boolean; // indices d'âge (rides, cheveux gris) côté visage
}

// --- Palettes peaux (Fitzpatrick I–VI + nuances régionales) ---
const SKINS_EAST_ASIAN = ['#f6e3cf', '#f1d7ba', '#ebcaa8', '#e0bb94', '#d3a97e', '#c39468', '#f8e9d8', '#edd0b0'];
const SKINS_SOUTHEAST_ASIAN = ['#e8c9a0', '#d4b08a', '#c49a72', '#b0845c', '#9a6f48', '#8a5f3c', '#c9a078'];
const SKINS_SOUTH_ASIAN = ['#e0b890', '#c99a6e', '#b07d52', '#966640', '#7a5234', '#5c3e28', '#a8744a', '#4a3220'];
const SKINS_MIDDLE_EASTERN = ['#f0d4b0', '#e2c094', '#d0a878', '#b89060', '#9a7548', '#c4a070', '#8a6840'];
const SKINS_EUROPEAN = ['#faf0e4', '#f5e2cc', '#edd2b4', '#e0b894', '#d4a07a', '#c48a62', '#f8e6d4', '#b87a58'];
const SKINS_AFRICAN = ['#8b5a3c', '#6f452c', '#5a3420', '#4a2a18', '#3a2014', '#2a160e', '#7a4a30', '#9a6848', '#5c3824'];
const SKINS_LATIN = ['#f0d4b4', '#e2bc94', '#d0a070', '#b88858', '#9a6e44', '#7a5234', '#c49468', '#5c3e28'];
const SKINS_PACIFIC = ['#d4a878', '#c09060', '#a87848', '#8a6038', '#6e4a2c', '#b88454', '#5a3a22'];

/** Union de toutes les teintes (utile pour tests / debug). */
export const SKINS = [
  ...SKINS_EAST_ASIAN,
  ...SKINS_SOUTHEAST_ASIAN,
  ...SKINS_SOUTH_ASIAN,
  ...SKINS_MIDDLE_EASTERN,
  ...SKINS_EUROPEAN,
  ...SKINS_AFRICAN,
  ...SKINS_LATIN,
  ...SKINS_PACIFIC,
];

const HAIRS_DARK = ['#0e0c10', '#17151a', '#1c1410', '#241f1c', '#2a1e18', '#332720'];
const HAIRS_BROWN = ['#433124', '#4a3628', '#5b4632', '#6d5a44', '#7a5a38'];
const HAIRS_LIGHT = ['#8a6a44', '#a88858', '#c4a868', '#d4bc88', '#e8d4a8', '#f0e0c0'];
const HAIRS_RED = ['#6a3424', '#8a3a28', '#a84830', '#b85a3a'];
const HAIRS_GREY = ['#8a8288', '#b6b0a8', '#cfc9c2'];

/** Palette historique (séniors + fallbacks). */
export const HAIRS = [...HAIRS_DARK, ...HAIRS_BROWN, ...HAIRS_GREY];

interface HeritageProfile {
  skins: readonly string[];
  /** Cheveux non-séniors (hors gris). */
  hairs: readonly string[];
  /** Décalage de taille moyenne vs Japon (mètres). */
  heightBias: number;
}

const HERITAGE_PROFILES: Record<Heritage, HeritageProfile> = {
  eastAsian: { skins: SKINS_EAST_ASIAN, hairs: [...HAIRS_DARK, ...HAIRS_BROWN.slice(0, 2)], heightBias: 0 },
  southeastAsian: { skins: SKINS_SOUTHEAST_ASIAN, hairs: [...HAIRS_DARK, ...HAIRS_BROWN.slice(0, 3)], heightBias: -0.02 },
  southAsian: { skins: SKINS_SOUTH_ASIAN, hairs: [...HAIRS_DARK, ...HAIRS_BROWN], heightBias: 0.01 },
  middleEastern: { skins: SKINS_MIDDLE_EASTERN, hairs: [...HAIRS_DARK, ...HAIRS_BROWN], heightBias: 0.03 },
  european: {
    skins: SKINS_EUROPEAN,
    hairs: [...HAIRS_DARK.slice(2), ...HAIRS_BROWN, ...HAIRS_LIGHT, ...HAIRS_RED],
    heightBias: 0.08,
  },
  african: { skins: SKINS_AFRICAN, hairs: [...HAIRS_DARK, '#1a100c', '#0a0806'], heightBias: 0.06 },
  latin: { skins: SKINS_LATIN, hairs: [...HAIRS_DARK, ...HAIRS_BROWN, ...HAIRS_LIGHT.slice(0, 2)], heightBias: 0.03 },
  pacific: { skins: SKINS_PACIFIC, hairs: [...HAIRS_DARK, ...HAIRS_BROWN.slice(0, 2)], heightBias: 0.05 },
};

const HERITAGES: Heritage[] = [
  'eastAsian',
  'southeastAsian',
  'southAsian',
  'middleEastern',
  'european',
  'african',
  'latin',
  'pacific',
];

// Locaux : majorité est-asiatique, mais toutes les cultures de Tokyo présentes.
const LOCAL_HERITAGE_WEIGHTS = [62, 8, 6, 4, 6, 6, 5, 3];
// Touristes : répartition mondiale plus équilibrée (toutes cultures).
const TOURIST_HERITAGE_WEIGHTS = [14, 10, 12, 10, 18, 16, 12, 8];

const SUIT_COLORS = ['#272b36', '#2e3444', '#353a48', '#22303c', '#3b3b45', '#41423f', '#2c333e', '#464a54'];
const COAT_COLORS = ['#6b5d4c', '#7a6a58', '#8a7f72', '#5d5348', '#4d4a55', '#7d6a54', '#928576', '#5a5f6b', '#3f4652', '#a89a86'];
const JACKET_COLORS = ['#3a4656', '#5a4636', '#43524a', '#6a4a4a', '#4a4a52', '#2f5a5a', '#5a5560', '#7a5c48'];
const CASUAL_TOPS = ['#c94f42', '#4a7fc0', '#e0a83c', '#54a86a', '#c07fb0', '#e07a4c', '#3aa0a0', '#d6d2c8', '#6a6f7a', '#e8e2d4', '#7a5ca8', '#d8607a', '#2f7a4a', '#e5c65a'];
const BLOUSE_COLORS = ['#f2ece0', '#e8d8e0', '#dce8ec', '#f0e0d0', '#e0e6d8', '#f4e4ec', '#d8dce8', '#efe6d6'];
const TROUSER_COLORS = ['#2f3540', '#3a4150', '#4a4a52', '#26303c', '#6b6155', '#3a3a42', '#5a5560', '#7a6a54', '#2a2e38'];
const JEANS_COLORS = ['#3a4a60', '#43536a', '#2f3a4a', '#54637a', '#3a3f48'];
const SKIRT_COLORS = ['#3a3f52', '#6b4a5a', '#4a5548', '#7a5c48', '#40404a', '#8a6a7a', '#5a4636', '#2e3540'];
const DRESS_COLORS = ['#b8546a', '#4a7fa0', '#d0a040', '#5a8a5a', '#8a5ca0', '#c86a54', '#3a7a7a', '#d8d0c4'];
const SHOE_COLORS = ['#2a2622', '#1a1a1e', '#3a3128', '#45454c', '#d6d2ca', '#5a4636', '#8a4a3a'];
const SCARF_COLORS = ['#b8443a', '#3a5a8a', '#c8a83a', '#4a7a5a', '#8a4a6a', '#d0d0c8', '#5a4a3a'];
const BAG_COLORS = ['#2a2622', '#3a3128', '#4a3a4a', '#5a4636', '#3a4656', '#7a2f2f', '#45454c'];

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function pickWeighted<T>(r: () => number, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

const ARCHETYPES: Archetype[] = ['salaryman', 'officeLady', 'casual', 'student', 'senior', 'tourist'];
// Répartition indicative d'une rame Yamanote (poids relatifs).
const ARCHETYPE_WEIGHTS = [30, 16, 20, 14, 12, 8];

function pickArchetype(r: () => number): Archetype {
  return pickWeighted(r, ARCHETYPES, ARCHETYPE_WEIGHTS);
}

function pickHeritage(r: () => number, archetype: Archetype): Heritage {
  const weights = archetype === 'tourist' ? TOURIST_HERITAGE_WEIGHTS : LOCAL_HERITAGE_WEIGHTS;
  return pickWeighted(r, HERITAGES, weights);
}

/** Luminance relative 0..1 pour adapter blush / ombres du visage. */
export function skinDarkness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return 0.35;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Rec. 709, inversée : 0 = très clair, 1 = très foncé.
  return 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Sommet du crâne du squelette local (tête centrée à 1,34 + rayon) : sert à
// convertir une taille cible en mètres vers l'échelle du groupe. Les modèles
// « librairie » sont normalisés à cette même hauteur (three/characters).
export const SKELETON_TOP = 1.445;

// Corpulence : base + variation, avec un peu de « ventre » possible.
// Les tailles suivent les moyennes japonaises réelles pour l'ascendance
// est-asiatique ; les autres heritages reçoivent un biais de stature.
function makeBuild(r: () => number, archetype: Archetype, feminine: boolean, heritage: Heritage): Build {
  const senior = archetype === 'senior';
  const heavy = r() < (senior ? 0.3 : 0.16); // silhouette plus corpulente
  const bias = HERITAGE_PROFILES[heritage].heightBias;
  let height = (feminine ? 1.48 + r() * 0.14 : 1.6 + r() * 0.15) + bias;
  if (senior) height -= 0.05;
  else if (archetype === 'student') height -= 0.02;
  const scale = height / SKELETON_TOP;
  const shoulderR = (feminine ? 0.122 + r() * 0.026 : 0.142 + r() * 0.038) + (heavy ? 0.018 : 0);
  const belly = heavy ? 0.026 + r() * 0.03 : r() * 0.012;
  const hipR = (feminine ? 0.128 + r() * 0.03 : 0.13 + r() * 0.032) + (heavy ? 0.018 : 0);
  return {
    scale,
    shoulderR,
    chestR: shoulderR - (feminine ? 0.006 : 0.01),
    waistR: Math.max(feminine ? 0.095 : 0.105, shoulderR - (feminine ? 0.035 : 0.028)) + belly,
    hipR: hipR + belly * 0.5,
    legR: (feminine ? 0.05 : 0.056) + r() * 0.016 + (heavy ? 0.012 : 0),
  };
}

// Choix des habits selon l'archétype (haut/bas plausibles, couleurs indép.).
function makeOutfit(
  r: () => number,
  archetype: Archetype,
  feminineBase: boolean,
): { top: Appearance['top']; bottom: Appearance['bottom'] } {
  let top: Appearance['top'];
  let bottom: Appearance['bottom'];

  switch (archetype) {
    case 'salaryman': {
      top = { type: r() < 0.25 ? 'coat' : 'suit', color: r() < 0.7 ? pick(r, SUIT_COLORS) : pick(r, COAT_COLORS) };
      bottom = { type: 'trousers', color: pick(r, TROUSER_COLORS) };
      break;
    }
    case 'officeLady': {
      const dress = r() < 0.35;
      if (dress) {
        top = { type: 'blouse', color: pick(r, DRESS_COLORS) };
        bottom = { type: 'dress', color: pick(r, DRESS_COLORS) };
      } else {
        top = { type: r() < 0.5 ? 'blouse' : 'sweater', color: r() < 0.5 ? pick(r, BLOUSE_COLORS) : pick(r, CASUAL_TOPS) };
        bottom = r() < 0.6 ? { type: 'skirt', color: pick(r, SKIRT_COLORS) } : { type: 'trousers', color: pick(r, TROUSER_COLORS) };
      }
      break;
    }
    case 'student': {
      top = { type: r() < 0.55 ? 'hoodie' : 'tshirt', color: pick(r, CASUAL_TOPS) };
      bottom = feminineBase && r() < 0.5 ? { type: 'skirt', color: pick(r, SKIRT_COLORS) } : { type: r() < 0.7 ? 'trousers' : 'shorts', color: pick(r, JEANS_COLORS) };
      break;
    }
    case 'senior': {
      top = { type: r() < 0.6 ? 'coat' : 'jacket', color: r() < 0.6 ? pick(r, COAT_COLORS) : pick(r, JACKET_COLORS) };
      bottom = feminineBase && r() < 0.4 ? { type: 'skirt', color: pick(r, SKIRT_COLORS) } : { type: 'trousers', color: pick(r, TROUSER_COLORS) };
      break;
    }
    case 'tourist': {
      top = { type: r() < 0.4 ? 'jacket' : 'tshirt', color: pick(r, CASUAL_TOPS) };
      bottom = { type: r() < 0.6 ? 'trousers' : 'shorts', color: pick(r, JEANS_COLORS) };
      break;
    }
    default: {
      // casual
      const dress = feminineBase && r() < 0.25;
      if (dress) {
        top = { type: 'blouse', color: pick(r, DRESS_COLORS) };
        bottom = { type: 'dress', color: pick(r, DRESS_COLORS) };
      } else {
        top = { type: pick(r, ['tshirt', 'sweater', 'hoodie', 'jacket'] as TopType[]), color: pick(r, CASUAL_TOPS) };
        bottom = feminineBase && r() < 0.4 ? { type: 'skirt', color: pick(r, SKIRT_COLORS) } : { type: r() < 0.75 ? 'trousers' : 'shorts', color: pick(r, JEANS_COLORS) };
      }
    }
  }
  return { top, bottom };
}

function makeHair(
  r: () => number,
  archetype: Archetype,
  feminine: boolean,
  heritage: Heritage,
): { style: HairStyle; color: string } {
  const senior = archetype === 'senior';
  const profile = HERITAGE_PROFILES[heritage];
  const color = senior ? pick(r, [...HAIRS_GREY, ...profile.hairs.slice(0, 3)]) : pick(r, profile.hairs);
  let style: HairStyle;
  if (feminine) {
    style = pick(r, ['long', 'ponytail', 'bun', 'short'] as HairStyle[]);
  } else if (senior) {
    style = pick(r, ['short', 'buzz', 'bald', 'bald'] as HairStyle[]);
  } else if (heritage === 'african') {
    // Coupes courtes / buzz fréquentes ; bun et short aussi.
    style = pick(r, ['short', 'buzz', 'buzz', 'bun', 'short'] as HairStyle[]);
  } else {
    style = pick(r, ['short', 'short', 'buzz', 'bun'] as HairStyle[]);
  }
  return { style, color };
}

export function makeAppearance(id: number): Appearance {
  const r = rng(1300 + id * 2654435761);
  const archetype = pickArchetype(r);
  const heritage = pickHeritage(r, archetype);
  const senior = archetype === 'senior';
  // Le genre est décidé d'abord : il conditionne la taille et la silhouette.
  const feminine = archetype === 'officeLady' ? true : senior ? r() < 0.5 : r() < 0.42;
  const build = makeBuild(r, archetype, feminine, heritage);
  const { top, bottom } = makeOutfit(r, archetype, feminine);
  const hair = makeHair(r, archetype, feminine, heritage);

  // Accessoires conditionnés par l'archétype.
  let bag: Bag = 'none';
  const bagRoll = r();
  if (archetype === 'salaryman') bag = bagRoll < 0.7 ? 'hand' : bagRoll < 0.85 ? 'shoulder' : 'none';
  else if (archetype === 'student' || archetype === 'tourist') bag = bagRoll < 0.75 ? 'backpack' : bagRoll < 0.9 ? 'shoulder' : 'none';
  else if (archetype === 'officeLady') bag = bagRoll < 0.6 ? 'shoulder' : bagRoll < 0.8 ? 'hand' : 'none';
  else bag = bagRoll < 0.4 ? 'shoulder' : bagRoll < 0.55 ? 'backpack' : 'none';

  let hat: Hat = 'none';
  const hatRoll = r();
  if (archetype === 'tourist' && hatRoll < 0.4) hat = 'cap';
  else if (archetype === 'student' && hatRoll < 0.2) hat = 'cap';
  else if (hatRoll < 0.1) hat = hair.style === 'bald' && r() < 0.6 ? 'cap' : 'beanie';

  const scarf = r() < 0.18;
  const glasses = r() < (senior ? 0.5 : 0.26);
  const mask = r() < 0.34;
  const facialHair = !feminine && !senior && r() < (heritage === 'middleEastern' || heritage === 'southAsian' ? 0.32 : 0.18);

  return {
    archetype,
    heritage,
    feminine,
    build,
    skin: pick(r, HERITAGE_PROFILES[heritage].skins),
    hair,
    top,
    bottom,
    shoes: pick(r, SHOE_COLORS),
    glasses,
    mask,
    facialHair,
    hat,
    scarf,
    scarfColor: pick(r, SCARF_COLORS),
    bag,
    bagColor: pick(r, BAG_COLORS),
    senior,
  };
}
