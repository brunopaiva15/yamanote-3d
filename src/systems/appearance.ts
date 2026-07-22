// Apparence des PNJ : un descripteur riche par voyageur, généré de façon
// déterministe (rng mulberry32 par id) pour une foule tokyoïte crédible et
// stable — silhouettes, corpulences, habits (haut ET bas indépendants),
// coiffures et accessoires variés. Consommé par three/Passengers (géométrie)
// et textures/procedural (visage).

import { rng } from '../textures/procedural';

export type Archetype = 'salaryman' | 'officeLady' | 'casual' | 'student' | 'senior' | 'tourist';
export type TopType = 'suit' | 'coat' | 'jacket' | 'hoodie' | 'sweater' | 'tshirt' | 'blouse';
export type BottomType = 'trousers' | 'skirt' | 'shorts' | 'dress';
export type HairStyle = 'short' | 'buzz' | 'bun' | 'long' | 'ponytail' | 'bald';
export type Hat = 'none' | 'cap' | 'beanie';
export type Bag = 'none' | 'backpack' | 'shoulder' | 'hand';

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

// --- Palettes ---
export const SKINS = ['#f3d6bb', '#ecc6a0', '#e2b58c', '#d8a878', '#c9925f', '#b87c4c', '#f7ddc6', '#e8bd96'];
export const HAIRS = ['#17151a', '#241f1c', '#332720', '#433124', '#4a3628', '#5b4632', '#6d5a44', '#8a8288', '#b6b0a8', '#cfc9c2'];

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

const ARCHETYPES: Archetype[] = ['salaryman', 'officeLady', 'casual', 'student', 'senior', 'tourist'];
// Répartition indicative d'une rame Yamanote (poids relatifs).
const ARCHETYPE_WEIGHTS = [30, 16, 20, 14, 12, 8];

function pickArchetype(r: () => number): Archetype {
  const total = ARCHETYPE_WEIGHTS.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < ARCHETYPES.length; i++) {
    x -= ARCHETYPE_WEIGHTS[i];
    if (x <= 0) return ARCHETYPES[i];
  }
  return 'casual';
}

// Corpulence : base + variation, avec un peu de « ventre » possible.
function makeBuild(r: () => number, archetype: Archetype): Build {
  const senior = archetype === 'senior';
  const heavy = r() < (senior ? 0.4 : 0.22); // silhouette plus corpulente
  const scale = (senior ? 0.9 : 0.94) + r() * (senior ? 0.1 : 0.18);
  const shoulderR = 0.15 + r() * 0.05 + (heavy ? 0.02 : 0);
  const belly = heavy ? 0.03 + r() * 0.04 : r() * 0.015;
  const hipR = 0.135 + r() * 0.035 + (heavy ? 0.02 : 0);
  return {
    scale,
    shoulderR,
    chestR: shoulderR - 0.01,
    waistR: Math.max(0.11, shoulderR - 0.03) + belly,
    hipR: hipR + belly * 0.5,
    legR: 0.06 + r() * 0.02 + (heavy ? 0.015 : 0),
  };
}

// Choix des habits selon l'archétype (haut/bas plausibles, couleurs indép.).
function makeOutfit(
  r: () => number,
  archetype: Archetype,
): { top: Appearance['top']; bottom: Appearance['bottom']; feminine: boolean } {
  const feminineBase =
    archetype === 'officeLady' ? true : archetype === 'senior' ? r() < 0.5 : r() < 0.42;

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
  return { top, bottom, feminine: feminineBase };
}

function makeHair(r: () => number, archetype: Archetype, feminine: boolean): { style: HairStyle; color: string } {
  const senior = archetype === 'senior';
  const color = senior ? pick(r, ['#8a8288', '#b6b0a8', '#cfc9c2', '#6d5a44']) : pick(r, HAIRS.slice(0, 7));
  let style: HairStyle;
  if (feminine) {
    style = pick(r, ['long', 'ponytail', 'bun', 'short'] as HairStyle[]);
  } else if (senior) {
    style = pick(r, ['short', 'buzz', 'bald', 'bald'] as HairStyle[]);
  } else {
    style = pick(r, ['short', 'short', 'buzz', 'bun'] as HairStyle[]);
  }
  return { style, color };
}

export function makeAppearance(id: number): Appearance {
  const r = rng(1300 + id * 2654435761);
  const archetype = pickArchetype(r);
  const senior = archetype === 'senior';
  const build = makeBuild(r, archetype);
  const { top, bottom, feminine } = makeOutfit(r, archetype);
  const hair = makeHair(r, archetype, feminine);

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
  const facialHair = !feminine && !senior && r() < 0.18;

  return {
    archetype,
    build,
    skin: pick(r, SKINS),
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
