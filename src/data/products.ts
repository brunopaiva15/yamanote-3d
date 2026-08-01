// Ce qu'on achète vraiment dans une gare.
//
// Jusqu'ici, les distributeurs étaient des MEUBLES : une caisse peinte, une
// vitrine imprimée, et rien derrière. On passait devant comme devant un mur.
// Un 自販機 n'est pourtant pas du décor - c'est le seul objet d'un quai qu'un
// voyageur touche vraiment, et le geste tient en quatre temps qu'on connaît
// tous : on met la monnaie, on appuie, ça tombe, on se baisse.
//
// Ce fichier est le CATALOGUE : ce qui est en rayon, à quel prix, et de quelle
// forme. La forme n'est pas un détail de rendu - c'est elle qui décide de ce
// qu'on tient dans la main (une bouteille se rebouche, une canette non), de ce
// qu'on entend tomber (le fracas d'une canette n'est pas le choc mat d'un pot)
// et du nombre de gorgées qu'on en tire.
//
// Les marques restent inventées, comme celles de textures/vending et les
// affiches de data/ads : ce sont les CODES qu'on reconnaît - le thé vert en
// bouteille, le café en petite boîte tiède, la soupe en gobelet - pas des
// produits déposés.

import type { VendingBrand } from '../textures/vending';

/**
 * Silhouette de l'objet, et donc ce qu'on en fait.
 *
 * `can` et `canSlim` se distinguent parce qu'un café en boîte de 190 ml ne se
 * tient pas comme un soda de 350 : c'est la seule différence de rendu, mais
 * c'est elle qu'on voit au bout de son bras.
 */
export type ProductShape = 'bottle' | 'can' | 'canSlim' | 'cup' | 'noodle' | 'ice';

export interface Product {
  id: string;
  /** Nom tel qu'il est écrit sur l'étiquette. */
  jp: string;
  /** Le même, translittéré : c'est ce que lit le HUD non japonophone. */
  romaji: string;
  /** Prix affiché, en yens. Les prix ronds des distributeurs JR. */
  price: number;
  /** Teinte de l'étiquette ou du sachet : ce qui le fait reconnaître en rayon. */
  tone: string;
  /** Encre de l'étiquette, quand le fond est clair. */
  ink: string;
  /** Contenu vu par transparence - bouteilles PET seulement. */
  liquid?: string;
  shape: ProductShape;
  /**
   * Servi chaud (あたたか～い).
   *
   * Ce n'est pas décoratif : le bandeau du bouton passe au rouge, la boîte est
   * tiède dans la main, et l'offre chaude n'existe qu'en saison froide sur une
   * vraie machine - `productsFor` s'en sert pour composer le rayon.
   */
  hot: boolean;
  /** Contenance, comptée en gorgées : c'est ce qui vide l'objet. */
  sips: number;
}

/** Les boissons froides du rayon ordinaire. */
const COLD: readonly Product[] = [
  { id: 'ocha', jp: 'お～いお茶', romaji: 'Green tea 525ml', price: 150, tone: '#2f7a44', ink: '#ffffff', liquid: '#c9b45e', shape: 'bottle', hot: false, sips: 7 },
  { id: 'mizu', jp: '天然水', romaji: 'Mineral water 550ml', price: 110, tone: '#7fc4e8', ink: '#12384f', liquid: '#e9edf0', shape: 'bottle', hot: false, sips: 7 },
  { id: 'mugicha', jp: '麦茶', romaji: 'Barley tea 600ml', price: 140, tone: '#8a5a24', ink: '#ffeccf', liquid: '#a9752f', shape: 'bottle', hot: false, sips: 8 },
  { id: 'soda', jp: '山手サイダー', romaji: 'Yamate cider 500ml', price: 160, tone: '#c8332b', ink: '#ffffff', liquid: '#e7edf2', shape: 'bottle', hot: false, sips: 6 },
  { id: 'sports', jp: 'スポーツ飲料', romaji: 'Sports drink 500ml', price: 160, tone: '#1f5fbf', ink: '#ffffff', liquid: '#eef4f7', shape: 'bottle', hot: false, sips: 6 },
  { id: 'cola', jp: 'コーラ', romaji: 'Cola 350ml', price: 160, tone: '#b2211c', ink: '#ffffff', shape: 'can', hot: false, sips: 5 },
  { id: 'orange', jp: 'オレンジ', romaji: 'Orange 350ml', price: 150, tone: '#e08a1e', ink: '#3a2000', shape: 'can', hot: false, sips: 5 },
  { id: 'ringo', jp: 'りんごジュース', romaji: 'Apple juice 350ml', price: 150, tone: '#c7d64a', ink: '#33400b', shape: 'can', hot: false, sips: 5 },
];

/** Le rayon chaud, en petites boîtes : il n'ouvre que par temps froid. */
const HOT: readonly Product[] = [
  { id: 'kohi-b', jp: '微糖コーヒー', romaji: 'Coffee, lightly sweet', price: 140, tone: '#5a3418', ink: '#f0d9a8', shape: 'canSlim', hot: true, sips: 4 },
  { id: 'kohi-m', jp: 'カフェオレ', romaji: 'Café au lait', price: 140, tone: '#a8763c', ink: '#3a2408', shape: 'canSlim', hot: true, sips: 4 },
  { id: 'shoga', jp: '生姜湯', romaji: 'Ginger tea', price: 150, tone: '#d08a24', ink: '#3a2408', shape: 'canSlim', hot: true, sips: 4 },
  { id: 'corn', jp: 'コーンポタージュ', romaji: 'Corn potage', price: 160, tone: '#e5c04a', ink: '#3a2c00', shape: 'canSlim', hot: true, sips: 4 },
];

/** Machine à café : le même rayon, mais c'est ce qu'elle sait faire. */
const COFFEE: readonly Product[] = [
  { id: 'espresso', jp: 'ブラック無糖', romaji: 'Black, unsweetened', price: 130, tone: '#3a2109', ink: '#e8d5a8', shape: 'canSlim', hot: true, sips: 4 },
  { id: 'latte', jp: 'ラテ', romaji: 'Latte', price: 150, tone: '#c8a271', ink: '#3a2408', shape: 'canSlim', hot: true, sips: 4 },
  { id: 'ice-kohi', jp: 'アイスコーヒー', romaji: 'Iced coffee 500ml', price: 160, tone: '#2b1a0c', ink: '#e8d5a8', liquid: '#3a2109', shape: 'bottle', hot: false, sips: 7 },
  { id: 'kocha', jp: 'ミルクティー', romaji: 'Milk tea 500ml', price: 150, tone: '#d2a86a', ink: '#3a2408', liquid: '#c99a5c', shape: 'bottle', hot: false, sips: 7 },
];

/** 駅前スナック : la machine à sachets des quais bien garnis. */
const SNACK: readonly Product[] = [
  { id: 'senbei', jp: 'おせんべい', romaji: 'Rice crackers', price: 150, tone: '#c86a18', ink: '#ffffff', shape: 'noodle', hot: false, sips: 3 },
  { id: 'choco', jp: 'チョコレート', romaji: 'Chocolate', price: 180, tone: '#5a2f14', ink: '#f0d9a8', shape: 'noodle', hot: false, sips: 3 },
  { id: 'gumi', jp: 'グミ', romaji: 'Gummies', price: 150, tone: '#8a3f9c', ink: '#ffffff', shape: 'noodle', hot: false, sips: 3 },
  { id: 'nuts', jp: 'ミックスナッツ', romaji: 'Mixed nuts', price: 230, tone: '#a8763c', ink: '#ffffff', shape: 'noodle', hot: false, sips: 4 },
];

/** 氷屋アイス : le bac à glaces des couloirs de correspondance. */
const ICE: readonly Product[] = [
  { id: 'monaka', jp: '最中アイス', romaji: 'Monaka ice', price: 180, tone: '#e6d6b0', ink: '#5a3418', shape: 'ice', hot: false, sips: 4 },
  { id: 'soda-ice', jp: 'ソーダアイス', romaji: 'Soda bar', price: 130, tone: '#5fc7e0', ink: '#0d3a48', shape: 'ice', hot: false, sips: 4 },
  { id: 'matcha-ice', jp: '抹茶アイス', romaji: 'Matcha cup', price: 260, tone: '#4f7a2a', ink: '#f2f6e8', shape: 'cup', hot: false, sips: 5 },
  { id: 'vanilla', jp: 'バニラカップ', romaji: 'Vanilla cup', price: 240, tone: '#f0e2c0', ink: '#5a3418', shape: 'cup', hot: false, sips: 5 },
];

/** 駅麺屋 : la machine à nouilles, et l'eau chaude à côté. */
const NOODLE: readonly Product[] = [
  { id: 'shoyu', jp: '醤油ラーメン', romaji: 'Shōyu ramen', price: 260, tone: '#9c2b22', ink: '#f7e6c8', shape: 'noodle', hot: true, sips: 6 },
  { id: 'miso', jp: '味噌ラーメン', romaji: 'Miso ramen', price: 280, tone: '#b56a1c', ink: '#3a2408', shape: 'noodle', hot: true, sips: 6 },
  { id: 'udon', jp: 'きつねうどん', romaji: 'Kitsune udon', price: 260, tone: '#d8b45e', ink: '#3a2408', shape: 'noodle', hot: true, sips: 6 },
  { id: 'soup', jp: 'たまごスープ', romaji: 'Egg soup', price: 200, tone: '#e5c04a', ink: '#3a2c00', shape: 'cup', hot: true, sips: 4 },
];

/**
 * Le rayon d'une machine, tel qu'il est CE JOUR-LÀ.
 *
 * Deux choses le composent, et la seconde est la plus visible dans une gare
 * japonaise : l'enseigne dit la famille, et la SAISON dit si la moitié chaude
 * du rayon est ouverte. Une machine à boissons de plein été n'a pas une seule
 * boîte あたたか～い ; en janvier elle en aligne quatre, bandeau rouge sous
 * chacune. C'est le seul endroit du jeu où l'on lise la saison sans regarder
 * le ciel, et il aurait été dommage de s'en priver.
 *
 * `month` est le mois civil de Tokyo (1..12) - celui de `runtime.tokyoDate`.
 */
export function productsFor(brand: VendingBrand, month: number): Product[] {
  // Le chaud s'installe fin octobre et se retire fin avril : c'est le calendrier
  // réel des exploitants, à quinze jours près.
  const cold = month >= 11 || month <= 4;
  switch (brand.kind) {
    case 'coffee':
      // Une machine à café garde ses chaudes toute l'année - c'est ce qu'elle
      // vend - mais l'été elle pousse les froides devant.
      return cold ? [...COFFEE] : [...COFFEE].sort((a, b) => Number(a.hot) - Number(b.hot));
    case 'snack':
      return [...SNACK];
    case 'ice':
      return [...ICE];
    case 'noodle':
      return [...NOODLE];
    case 'drink':
    default:
      return cold ? [...COLD, ...HOT] : [...COLD];
  }
}

/**
 * Le RAYON RÉEL d'une machine : ce qu'il y a dans chaque couloir de la vitrine.
 *
 * C'est la pièce qui fait tenir tout le reste. Tant que la vitrine était une
 * image tirée au hasard et le catalogue une liste séparée, on ne pouvait
 * qu'acheter « dans un menu » : la case qu'on regardait et l'article qu'on
 * obtenait n'avaient aucun rapport. Ici la vitrine EST le catalogue - la case
 * qu'on vise, son prix affiché, son bouton et ce qui tombe sont le même objet.
 *
 * Une case vide est un 売切 : sur une vraie machine il y en a toujours une ou
 * deux, et c'est ce qui fait qu'on lit la vitrine au lieu d'appuyer au hasard.
 * Un même article occupe plusieurs couloirs quand le catalogue est plus court
 * que la trame - c'est aussi ce que fait une vraie machine, qui aligne trois
 * colonnes du même thé.
 */
export function machineSlots(
  brand: VendingBrand,
  month: number,
  seed: number,
  cols: number,
  rows: number,
): (Product | null)[] {
  const menu = productsFor(brand, month);
  if (!menu.length) return Array.from({ length: cols * rows }, () => null);
  // Générateur déterministe : la même machine montre le même rayon d'un bout à
  // l'autre d'une partie. Un rayon qui se retire entre deux regards serait pire
  // que pas de rayon du tout.
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // Le chaud descend, le froid monte : sur une machine mixte, les canettes
  // tièdes sont toujours sur la tablette du bas, sous les tubes.
  const cold = menu.filter((p) => !p.hot);
  const hot = menu.filter((p) => p.hot);
  const out: (Product | null)[] = [];
  for (let row = 0; row < rows; row++) {
    const bag = hot.length && row === rows - 1 ? hot : cold.length ? cold : menu;
    for (let col = 0; col < cols; col++) {
      out.push(rnd() < 0.09 ? null : bag[(row * cols + col + Math.floor(rnd() * 2)) % bag.length]);
    }
  }
  return out;
}

/** Ce qui se boit : tout ce qui n'est ni un sachet ni une glace en bâton. */
export function isDrinkable(shape: ProductShape): boolean {
  return shape === 'bottle' || shape === 'can' || shape === 'canSlim' || shape === 'cup';
}

/** Retrouve un article par son identifiant, toutes familles confondues. */
export function productById(id: string): Product | null {
  for (const list of [COLD, HOT, COFFEE, SNACK, ICE, NOODLE]) {
    const hit = list.find((p) => p.id === id);
    if (hit) return hit;
  }
  return null;
}

/** Toutes les familles servies, pour les tests et les sondes de développement. */
export const ALL_PRODUCTS: readonly Product[] = [...COLD, ...HOT, ...COFFEE, ...SNACK, ...ICE, ...NOODLE];

/** Les coupures qu'on glisse dans un monnayeur, dans l'ordre de la platine. */
export const COINS: readonly number[] = [10, 50, 100, 500, 1000];

/**
 * Tarifs de la boucle, en yens.
 *
 * La grille JR East ordinaire : 150 pour un ou deux arrêts, puis par paliers.
 * Le jeu n'a pas de zone tarifaire - la boucle se paie au nombre d'arrêts, et
 * `fareFor` traduit ça en une des marches ci-dessous, exactement comme le fait
 * l'écran d'un 券売機 quand on lit la carte des prix au-dessus.
 */
export const FARES: readonly number[] = [150, 160, 170, 200, 210, 230, 260];

/**
 * Ce que coûte un trajet de `stops` arrêts sur la boucle.
 *
 * On ne peut pas dépasser la moitié de la boucle : au-delà de quinze arrêts,
 * on est allé dans l'autre sens et c'est le complément qu'on paie. C'est aussi
 * ce que fait la tarification réelle, qui compte la distance la plus courte.
 */
export function fareFor(stops: number): number {
  const n = Math.min(Math.abs(stops) % 30, 30 - (Math.abs(stops) % 30));
  if (n <= 2) return FARES[0];
  if (n <= 4) return FARES[1];
  if (n <= 6) return FARES[2];
  if (n <= 9) return FARES[3];
  if (n <= 12) return FARES[4];
  if (n <= 15) return FARES[5];
  return FARES[6];
}

/** Recharges proposées par un 券売機, en yens. */
export const CHARGE_AMOUNTS: readonly number[] = [1000, 2000, 3000, 5000, 10000];

/** Prix d'une carte IC neuve, dont 500 yens de caution (デポジット). */
export const IC_CARD_PRICE = 2000;
export const IC_CARD_DEPOSIT = 500;
