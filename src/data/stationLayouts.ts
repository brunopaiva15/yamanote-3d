// Ce qui change d'une gare de la boucle à l'autre - table explicite, gare par gare.
//
// Tant qu'on ne voyait le quai que par les vitres, une seule gare générique
// suffisait. Dès qu'on y marche, l'uniformité saute aux yeux : une gare de
// viaduc à Yūrakuchō ne ressemble pas à la tranchée de Mejiro ni à la halle de
// Shinjuku. Ce fichier décrit ce qui change ; la géométrie, elle, reste unique
// et paramétrée.
//
// La version précédente DÉDUISAIT la typologie du tronçon traversé
// (data/segments) avant de corriger par exceptions. C'était une erreur de
// principe : un tronçon dit ce qu'on voit ENTRE deux gares, pas comment la gare
// est bâtie. Sept gares en sortaient fausses - Tabata et Komagome sont en
// tranchée alors que leurs tronçons sont au sol, Ōtsuka, Takadanobaba,
// Shin-Ōkubo, Gotanda et Hamamatsuchō sont sur viaduc alors que les leurs sont
// au sol ou en tranchée. Chaque gare porte donc maintenant ses propres cotes,
// et `SPECS` se lit ligne à ligne en face du relevé.
//
// Trois axes indépendants, qu'on aurait tort de confondre :
//   - `elevation`     : le niveau où court la voie (sol, viaduc, tranchée) ;
//   - `config`        : ce qu'il y a de l'autre côté du quai (voie Keihin-Tōhoku
//                       partagée, deuxième voie Yamanote, quai latéral) ;
//   - `signature`     : le caractère architectural, quand il ne se paramètre pas.
//
// Le fond de quai découle désormais de ces deux premiers axes, et de rien
// d'autre : `config` dit ce qu'on a dans le dos - une voie Keihin-Tōhoku, la
// voie Yamanote opposée, un mur - et `elevation` dit ce qu'on voit au-delà.
// Le champ `backdrop`, qui nommait une famille de rendu au lieu d'un fait, a
// disparu : c'était lui qui donnait à vingt-neuf quais le même mur.

import {
  directionBandZs,
  ELEVATOR_HALF_Z,
  ESCALATOR_HALF_Z,
  PLATFORM_DEPTH,
  PSD_X,
  STAIR_HALF_Z,
} from './stationGeometry.ts';
import { CONSIST, E235 } from './e235.ts';

/** Niveau où court la voie dans la gare. */
export type Elevation =
  /** Au niveau du sol : grands faisceaux, longues perspectives. */
  | 'ground'
  /** Sur viaduc : garde-corps ajouré, la ville en contrebas, la rue dessous. */
  | 'elevated'
  /** En tranchée : parois de soutènement des deux côtés, la gare est au-dessus. */
  | 'trench';

/** Ce qu'on a de l'autre côté du quai - la différence à ne surtout pas uniformiser. */
export type PlatformConfig =
  /** Quai partagé avec une autre ligne : la voie d'en face n'est pas la Yamanote. */
  | 'sharedIsland'
  /** Îlot Yamanote : les deux sens se font face sur le même quai. */
  | 'island'
  /** Quai latéral : mur dans le dos, quai opposé au-delà des deux voies. */
  | 'side'
  /** Deux îlots Yamanote : quatre voies, départs et terminus. */
  | 'terminusIsland'
  // Faces Yamanote séparées/asymétriques (Shinjuku et Yoyogi).
  // Le rendu de base reste un îlot ouvert, complété par une signature.
  | 'special';

/** Portes de quai, à la situation documentée en 2026. */
export type PsdState =
  /** Toutes les voies Yamanote équipées. */
  | 'full'
  /** Voie principale équipée, voie secondaire encore nue. */
  | 'partial'
  /** Aucune porte : les grands travaux en cours l'interdisent encore. */
  | 'none';

export type CanopyStyle =
  /** Auvent tôlé sur poutrelles, la norme JR. */
  | 'steel'
  /** Dalle béton basse, gares en tranchée et sous bâtiment. */
  | 'slab'
  /** Charpente claire et verrières, gares récentes. */
  | 'glass'
  /** Charpente de halle, très haute. */
  | 'truss';

/**
 * Gares dont le caractère ne se paramètre pas et reçoivent une charpente à
 * elles (three/station/Signature). Une clé déclarée mais pas encore dessinée ne
 * casse rien : Signature ne rend que ce qu'elle connaît.
 */
export type SignatureKey =
  | 'tokyo'
  | 'akihabara'
  | 'ueno'
  | 'nippori'
  | 'otsuka'
  | 'shinjuku'
  | 'harajuku'
  | 'shibuya'
  | 'ebisu'
  | 'gotanda'
  | 'takanawaGateway'
  | 'hamamatsucho'
  | 'shimbashi'
  | 'yurakucho';

/** Couleur sonore du quai : ce qu'on entend par-dessus la sonorisation. */
export type Ambience =
  | 'hall'
  | 'street'
  | 'office'
  | 'quiet'
  | 'electric'
  | 'market'
  | 'students'
  | 'park'
  | 'birds'
  | 'tram'
  | 'monorail';

export interface StationPalette {
  slab: string;
  wall: string;
  column: string;
  canopy: string;
  accent: string;
  lamp: string;
  /**
   * Faïence du soubassement du mur de fond. Un quai japonais n'est pas gris de
   * haut en bas : le bas de mur est carrelé, en général dans un ton chaud, et
   * c'est ce qui réchauffe tout le reste.
   */
  tile: string;
  /**
   * Bois des bancs, quand il n'est pas le brun sombre ordinaire. Les assises de
   * Takanawa Gateway sont en contreplaqué de cèdre clair, dessiné pour la
   * gare : à hauteur d'œil, c'est la seule chose qui réchauffe un quai blanc.
   */
  bench?: string;
}

export interface StationAmenities {
  /** Nombre de bancs répartis sur la longueur. */
  benches: number;
  /** Distributeurs de boissons. */
  vending: number;
  /** Petit kiosque NEWDAYS. */
  kiosk: boolean;
  /** Positions (z, m) des trémies d'escalier. */
  stairs: readonly number[];
  /** Positions (z, m) des escaliers mécaniques. */
  escalators: readonly number[];
  /** Position (z, m) de l'ascenseur, s'il y en a un. */
  elevator: number | null;
  /** Horloge de quai suspendue. */
  clock: boolean;
}

/**
 * Plan d'implantation d'une charpente signature : ce que le RESTE de la gare
 * doit savoir d'elle.
 *
 * Une charpente est dessinée par son fichier (three/station/signatures), mais
 * ses retombées ne la regardent pas seule : un portique riveté descend en plein
 * gabarit des panneaux suspendus, un poteau de halle se plante sur l'épine où
 * le placement range bancs et distributeurs. Le plan est donc calculé ICI, dans
 * les données - c'est la seule couche que le placement (systems) et le rendu
 * (three) peuvent lire tous les deux - et la charpente le CONSOMME au lieu de
 * recalculer sa trame dans son coin.
 */
export interface SigPlan {
  /**
   * Plans de charpente pleins sous l'auvent : rien de suspendu (panneaux,
   * bannières, tableaux) ne se cale à leur droit. `r` est la demi-emprise du
   * plan, marge comprise ; chaque consommateur y ajoute la sienne.
   */
  keepOut: { z: number; r: number }[];
  /**
   * Poteaux qui descendent jusqu'au sol du quai : le mobilier s'en écarte et
   * la marche les contourne. Déjà écartés des accès, des potences et de la
   * bande directionnelle - c'est le rôle de ce plan.
   */
  posts: { x: number; z: number }[];
  /** Tronçons interdits aux conduites (gouttière, chemin de câbles). */
  runBlocks: { z0: number; z1: number }[];
}

export interface StationLayout {
  elevation: Elevation;
  config: PlatformConfig;
  /** Ligne qui partage le quai, quand `config` vaut 'sharedIsland'. */
  sharedWith?: string;
  /** Autres lignes visibles depuis le quai, du plus proche au plus lointain. */
  parallel: readonly string[];
  psd: PsdState;
  /** Gare en travaux à la situation de 2026 : variante chantier. */
  works: boolean;
  /**
   * La travée d'en face ne se ferme pas par un mur mais par un faisceau : des
   * voies encore, jusqu'au bord du champ. C'est ce qui fait Nippori et Ueno -
   * « perspectives dégagées sur tout le faisceau » - et ce que Shinagawa et
   * Ōsaki donnent à voir de leurs quais parallèles.
   */
  openFarSide: boolean;
  /** Longueur du quai (m) : onze voitures de 20 m plus les abouts. */
  length: number;
  /** Profondeur du quai (m), du bord au mur de fond. */
  depth: number;
  canopy: CanopyStyle;
  /** Hauteur de la sous-face de l'auvent (m au-dessus du plancher du wagon). */
  canopyY: number;
  /**
   * La charpente signature TIENT LIEU de couverture : pas de dalle d'auvent
   * générique au-dessus des quais.
   *
   * Vingt-neuf gares sur trente ont un vrai auvent - une dalle basse et opaque,
   * et ce qu'il y a par-dessus ne regarde personne. Takanawa Gateway est
   * l'exception : le quai n'est couvert que par la grande toiture pliée, douze
   * mètres plus haut, et c'est TOUT ce qui fait la gare. La dalle générique la
   * masquait entièrement - on levait les yeux sur un plafond blanc et plat.
   *
   * Ce qui reste : la trame de poutres et de néons à hauteur d'auvent, à quoi
   * pend la signalétique. Elle ne porte plus rien, elle éclaire - comme les
   * passerelles techniques d'une halle.
   */
  sigCanopy: boolean;
  /** Entraxe des piliers (m). */
  columnSpacing: number;
  palette: StationPalette;
  amenities: StationAmenities;
  /** Densité de foule relative (1 = gare ordinaire). */
  crowdScale: number;
  ambience: Ambience;
  signature?: SignatureKey;
  /** Plan d'implantation de la charpente signature, quand elle en impose un. */
  sigPlan?: SigPlan;
}

/** Longueur réelle d'un quai de la Yamanote : 11 voitures de 20 m. */
export const FULL_PLATFORM_LEN = 224;

/**
 * Positions régulières sur la longueur du quai - la trame de toutes les
 * charpentes signature. Partagée avec leur rendu (signatures/kit la
 * ré-exporte) : la même formule des deux côtés, ou rien ne coïncide.
 */
export function bays(length: number, spacing: number, from = -0.5, to = 0.5): number[] {
  const out: number[] = [];
  const z0 = length * from + spacing * 0.4;
  const z1 = length * to - spacing * 0.4;
  for (let z = z0; z <= z1; z += spacing) out.push(z);
  return out;
}

/**
 * Abscisses des deux mezzanines vitrées de Takanawa Gateway.
 *
 * Elles franchissent tout le site à six mètres et demi : c'est le seul endroit
 * d'où l'on voit à la fois le hall, les escaliers et les quatre voies. Le plan
 * d'implantation les lit pour en écarter poteaux et suspendus, la charpente
 * pour les dessiner - deux valeurs divergentes, et une colonne monte au travers
 * d'un tablier. La seconde se tient au-delà de la troisième bande
 * directionnelle ET de la potence de l'escalier mécanique, qu'elle
 * chevauchait tour à tour.
 */
export function takanawaDeckZs(length: number): number[] {
  return [-length * 0.22, length * 0.275];
}

const PALETTES = {
  // Béton clair et acier gris : la gare JR ordinaire.
  standard: {
    slab: '#c8c9c4',
    wall: '#b8bab4',
    column: '#8e9296',
    canopy: '#5e646a',
    accent: '#80c241',
    lamp: '#fff2d4',
    tile: '#c7b394',
  },
  // Tranchée : tout est plus sombre, la lumière vient d'en haut.
  trench: {
    slab: '#b9bab5',
    wall: '#9a9c96',
    column: '#7c8085',
    canopy: '#4e545a',
    accent: '#80c241',
    lamp: '#ffeec6',
    tile: '#a8977c',
  },
  // Viaduc : dalle plus claire, structure peinte en gris perle.
  viaduct: {
    slab: '#cdcec8',
    wall: '#c2c4bd',
    column: '#9aa0a4',
    canopy: '#6a7076',
    accent: '#80c241',
    lamp: '#fff5dc',
    tile: '#cfbb99',
  },
  // Grande gare : béton lissé pâle, charpente claire.
  hub: {
    slab: '#d2d3ce',
    wall: '#c6c8c2',
    column: '#a6abaf',
    canopy: '#7a8188',
    accent: '#80c241',
    lamp: '#fff8e6',
    tile: '#d3c0a0',
  },
  // Tokyo : brique et acier riveté sombre de la halle Marunouchi.
  tokyo: {
    slab: '#cfc9c1',
    wall: '#9d5a48',
    column: '#5d4038',
    canopy: '#6b5348',
    accent: '#80c241',
    lamp: '#ffeec0',
    tile: '#7d4636',
  },
  // Shinjuku : forêt de piliers, éclairage jaune, tout est plus bas.
  shinjuku: {
    slab: '#c2c3bd',
    wall: '#adaea8',
    column: '#8b8f92',
    canopy: '#565c62',
    accent: '#80c241',
    lamp: '#ffe9ae',
    tile: '#b39a70',
  },
  // Shibuya : verre et acier blanc de la reconstruction de 2023.
  shibuya: {
    slab: '#d8d9d5',
    wall: '#dcded9',
    column: '#c6cacd',
    canopy: '#aeb5ba',
    accent: '#80c241',
    lamp: '#ffffff',
    tile: '#c8ced2',
  },
  // Takanawa Gateway : acier blanc, cèdre clair, verre. La plus lumineuse de la
  // boucle - elle empruntait jusqu'ici la palette de Shibuya, qui est grise.
  //
  // Blanche, mais pas BLANCHE PARTOUT : c'est le piège de cette gare-là. Le
  // fond de travée est un mur-rideau, donc un gris bleuté de verre et non un
  // aplat crème ; le soubassement et les bancs sont en cèdre. Le blanc reste au
  // sol, aux poteaux et à la membrane du toit, où il est juste.
  takanawa: {
    slab: '#dcdcd6',
    wall: '#a9b6bd',
    column: '#e9eae6',
    canopy: '#e9e5d9',
    accent: '#80c241',
    lamp: '#ffffff',
    tile: '#c9a97c',
    bench: '#c2a271',
  },
  // Vieux viaduc de brique et d'acier : Yūrakuchō, Shimbashi. Piliers épais,
  // maçonnerie sombre, arcades commerçantes en dessous.
  brickViaduct: {
    slab: '#c6c2ba',
    wall: '#8f6551',
    column: '#4f4a45',
    canopy: '#5a5450',
    accent: '#80c241',
    lamp: '#ffe9bc',
    tile: '#7a4d3c',
  },
  // Harajuku : le bâtiment blanc de 2020 d'un côté, le Meiji-jingū de l'autre.
  harajuku: {
    slab: '#d4d5cf',
    wall: '#dcdcd4',
    column: '#b9bdb8',
    canopy: '#8f9690',
    accent: '#80c241',
    lamp: '#fff6e0',
    tile: '#b8a582',
  },
} as const satisfies Record<string, StationPalette>;

type PaletteKey = keyof typeof PALETTES;

/**
 * Gabarit par défaut d'un niveau de voie. Une gare n'énonce que ses écarts :
 * la table de 30 lignes reste lisible en face du relevé.
 */
const FAMILY: Record<
  Elevation,
  {
    depth: number;
    canopy: CanopyStyle;
    canopyY: number;
    columnSpacing: number;
    palette: PaletteKey;
  }
> = {
  ground: {
    depth: PLATFORM_DEPTH + 2.2,
    canopy: 'steel',
    canopyY: 4.1,
    columnSpacing: 12,
    palette: 'standard',
  },
  elevated: {
    depth: PLATFORM_DEPTH + 1.4,
    canopy: 'steel',
    canopyY: 3.9,
    columnSpacing: 11,
    palette: 'viaduct',
  },
  trench: {
    depth: PLATFORM_DEPTH + 0.8,
    canopy: 'slab',
    canopyY: 3.3,
    columnSpacing: 9,
    palette: 'trench',
  },
};

interface Spec {
  /** Code JY et nom, pour se relire : l'ordre suit STATIONS. */
  name: string;
  elevation: Elevation;
  config: PlatformConfig;
  sharedWith?: string;
  parallel?: readonly string[];
  /** Défaut : 'full'. */
  psd?: PsdState;
  works?: true;
  openFarSide?: true;
  signature?: SignatureKey;
  ambience: Ambience;
  crowd: number;
  // --- Écarts au gabarit de famille ---
  depth?: number;
  canopy?: CanopyStyle;
  canopyY?: number;
  /** La charpente signature couvre le quai : pas de dalle d'auvent. */
  sigCanopy?: true;
  columnSpacing?: number;
  palette?: PaletteKey;
  /** Force la présence d'un kiosque, sinon déduite de l'affluence. */
  kiosk?: boolean;
  /** Force l'horloge de quai, sinon présente partout. */
  clock?: false;
}

const KT = 'Keihin-Tōhoku';

/**
 * Les trente gares, dans l'ordre JY01 → JY30.
 *
 * Les configurations de quai reprennent le relevé : onze gares où la Yamanote
 * partage son îlot avec la Keihin-Tōhoku, Yoyogi avec la Chūō–Sōbu, Shinagawa
 * de nouveau avec la Keihin-Tōhoku ; quatorze îlots Yamanote purs ; un seul
 * couple de quais latéraux, Harajuku ; deux gares à quatre voies Yamanote qui
 * permettent départs et terminus, Ikebukuro et Ōsaki.
 */
const SPECS: readonly Spec[] = [
  {
    // JY01 - halle monumentale, voies 4 et 5 sur deux quais partagés avec la
    // Keihin-Tōhoku. Depuis le quai, ce n'est pas la façade de brique qu'on
    // voit, c'est un gigantesque environnement ferroviaire couvert.
    name: 'JY01 Tokyo',
    elevation: 'ground',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Tōkaidō', 'Chūō', 'Tōkaidō Shinkansen'],
    signature: 'tokyo',
    ambience: 'hall',
    crowd: 2,
    depth: 10.5,
    canopy: 'truss',
    // Sous la grande dalle de la halle (6,30 m) : l'auvent de quai reste dessous.
    canopyY: 5.5,
    columnSpacing: 16,
    palette: 'tokyo',
  },
  {
    // JY02 - viaduc à trois quais centraux ; les voies 2 et 3 sont réunies sur
    // le même îlot. Quai étroit, charpente sombre, immeubles à toucher.
    name: 'JY02 Kanda',
    elevation: 'elevated',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: [KT, 'Chūō', 'Ginza'],
    ambience: 'street',
    crowd: 1,
    depth: PLATFORM_DEPTH + 0.6,
    canopyY: 3.7,
  },
  {
    // JY03 - viaducs croisés : les voies 5 et 6 de la Chūō–Sōbu passent
    // perpendiculairement au niveau supérieur. Poutres massives, plafonds bas,
    // plusieurs couches de circulation visibles à la fois.
    name: 'JY03 Akihabara',
    elevation: 'elevated',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Chūō–Sōbu', 'Hibiya', 'Tsukuba Express'],
    signature: 'akihabara',
    ambience: 'electric',
    crowd: 1.4,
    depth: PLATFORM_DEPTH + 1,
    canopyY: 3.7,
    columnSpacing: 9.5,
  },
  {
    // JY04 - quatre voies parallèles sur viaduc, quais rectilignes et étroits,
    // couverture métallique presque continue. Ameyoko est juste dessous.
    name: 'JY04 Okachimachi',
    elevation: 'elevated',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Ginza', 'Hibiya', 'Ōedo'],
    ambience: 'market',
    crowd: 0.95,
    depth: PLATFORM_DEPTH + 0.9,
  },
  {
    // JY05 - voies élevées, voies terminales et niveaux souterrains. Le quai
    // Yamanote est plus resserré qu'à Tokyo, mais le faisceau donne au décor
    // une profondeur considérable.
    name: 'JY05 Ueno',
    openFarSide: true,
    elevation: 'ground',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Utsunomiya', 'Takasaki', 'Jōban', 'Tōhoku Shinkansen'],
    signature: 'ueno',
    ambience: 'hall',
    crowd: 1.6,
    depth: 8.6,
    canopy: 'truss',
    canopyY: 5.2,
    columnSpacing: 14,
    palette: 'hub',
  },
  {
    // JY06 - la plus discrète de la boucle : deux quais centraux au sol,
    // toitures anciennes, garde-corps simples, vue sur les temples et les
    // arbres d'Ueno. « Vallée du rossignol » : les oiseaux font partie du lieu.
    name: 'JY06 Uguisudani',
    elevation: 'ground',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Tōhoku Shinkansen'],
    ambience: 'birds',
    crowd: 0.55,
    depth: PLATFORM_DEPTH + 1.4,
    canopyY: 3.8,
    clock: false,
  },
  {
    // JY07 - immense corridor ferroviaire au sol, voies 10 et 11 séparées.
    // Quais longs, ponts-concours au-dessus des rails, faisceau dégagé.
    name: 'JY07 Nippori',
    openFarSide: true,
    elevation: 'ground',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Jōban', 'Keisei', 'Nippori–Toneri Liner'],
    signature: 'nippori',
    ambience: 'street',
    crowd: 1.2,
    depth: PLATFORM_DEPTH + 2.6,
    canopyY: 4.2,
  },
  {
    // JY08 - compacte mais verticalement complexe : quais JR au niveau
    // supérieur, hall en dessous. Quais sobres, étroits, très techniques.
    name: 'JY08 Nishi-Nippori',
    elevation: 'elevated',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Chiyoda', 'Nippori–Toneri Liner'],
    ambience: 'street',
    crowd: 0.9,
    depth: PLATFORM_DEPTH + 0.8,
    canopyY: 3.6,
  },
  {
    // JY09 - quatre voies en TRANCHÉE sous le bâtiment de gare, pas au sol :
    // murs de soutènement, passerelles, grande gare-pont au-dessus.
    name: 'JY09 Tabata',
    elevation: 'trench',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Tōhoku Shinkansen'],
    ambience: 'quiet',
    crowd: 0.8,
  },
  {
    // JY10 - unique quai central en tranchée, étroit et calme, talus
    // végétalisés et azalées le long de la voie. Là encore une tranchée, que
    // le tronçon au sol ne laissait pas deviner.
    name: 'JY10 Komagome',
    elevation: 'trench',
    config: 'island',
    parallel: ['Namboku'],
    ambience: 'quiet',
    crowd: 0.8,
    depth: PLATFORM_DEPTH + 0.5,
  },
  {
    // JY11 - quai central en tranchée, murs latéraux proches, toiture
    // partielle, bâtiment de gare posé au-dessus des voies.
    name: 'JY11 Sugamo',
    elevation: 'trench',
    config: 'island',
    parallel: ['Mita'],
    ambience: 'quiet',
    crowd: 0.85,
  },
  {
    // JY12 - quai aérien ouvert, la rue passe immédiatement en dessous et le
    // tram Arakawa traverse à côté. Le tronçon est en tranchée, la gare non.
    name: 'JY12 Otsuka',
    elevation: 'elevated',
    config: 'island',
    parallel: ['Toden Arakawa'],
    signature: 'otsuka',
    ambience: 'tram',
    crowd: 0.9,
    depth: PLATFORM_DEPTH + 1.6,
    canopyY: 4,
  },
  {
    // JY13 - quatre voies Yamanote (5 à 8) sur deux quais centraux : c'est ce
    // qui permet départs et terminus. Quais très larges, cages d'escalier
    // nombreuses, panneaux suspendus volumineux. Les voies 5 et 8, longtemps
    // nues, ont reçu leurs portes le 18 mars 2026 : la gare est désormais
    // entièrement équipée.
    name: 'JY13 Ikebukuro',
    elevation: 'ground',
    config: 'terminusIsland',
    parallel: ['Saikyō', 'Shōnan–Shinjuku', 'Seibu Ikebukuro', 'Tōbu Tōjō'],
    ambience: 'hall',
    crowd: 2,
    depth: 9.8,
    canopy: 'truss',
    canopyY: 5.6,
    columnSpacing: 14,
    palette: 'hub',
  },
  {
    // JY14 - un seul bâtiment-pont au-dessus du quai, peu de locaux, vue
    // dégagée. L'une des deux seules gares sans correspondance ferroviaire.
    name: 'JY14 Mejiro',
    elevation: 'trench',
    config: 'island',
    parallel: [],
    ambience: 'quiet',
    crowd: 0.75,
    depth: PLATFORM_DEPTH + 0.6,
  },
  {
    // JY15 - quai aérien étroit, toiture métallique continue, colonnes
    // nombreuses, lignes Seibu visibles juste à côté. Forte affluence
    // étudiante et accumulation de panneaux.
    name: 'JY15 Takadanobaba',
    elevation: 'elevated',
    config: 'island',
    parallel: ['Seibu Shinjuku', 'Tōzai'],
    ambience: 'students',
    crowd: 1.4,
    depth: PLATFORM_DEPTH + 0.7,
    canopyY: 3.7,
    columnSpacing: 9.5,
  },
  {
    // JY16 - quai central étroit, toiture simple, ville extrêmement proche.
    // Le bâtiment actuel est plus vertical que l'ancienne petite gare.
    name: 'JY16 Shin-Okubo',
    elevation: 'elevated',
    config: 'island',
    parallel: [],
    ambience: 'street',
    crowd: 1,
    depth: PLATFORM_DEPTH + 0.5,
    canopyY: 3.8,
  },
  {
    // JY17 - quai central des voies 14 et 15, au niveau du sol. Alignement
    // massif de quais, toiture presque continue, forêt de poteaux, visibilité
    // coupée par les autres quais. Pas encore de portes de quai Yamanote : la
    // restructuration en cours l'interdit.
    name: 'JY17 Shinjuku',
    elevation: 'ground',
    config: 'special',
    parallel: ['Chūō', 'Chūō–Sōbu', 'Saikyō', 'Shōnan–Shinjuku', 'Odakyū', 'Keiō'],
    psd: 'none',
    works: true,
    signature: 'shinjuku',
    ambience: 'hall',
    crowd: 2.2,
    depth: 8.4,
    canopy: 'slab',
    canopyY: 4.2,
    columnSpacing: 9,
    palette: 'shinjuku',
  },
  {
    // JY18 - quatre voies imbriquant Yamanote et Chūō–Sōbu : les voies 1 et 2
    // sont sur DEUX quais différents, chacune adossée à une voie Chūō–Sōbu.
    // Quais légèrement courbes, anciennes marquises, organisation asymétrique.
    name: 'JY18 Yoyogi',
    elevation: 'ground',
    config: 'special',
    sharedWith: 'Chūō–Sōbu',
    parallel: ['Ōedo'],
    ambience: 'street',
    crowd: 0.9,
    depth: PLATFORM_DEPTH + 1,
    canopyY: 3.8,
  },
  {
    // JY19 - LE seul couple de quais latéraux de la boucle, depuis la refonte
    // qui a remplacé l'ancien quai central. Takeshita d'un côté, la végétation
    // du Meiji-jingū de l'autre ; bâtiment clair et vitré, quais courbes.
    name: 'JY19 Harajuku',
    elevation: 'ground',
    config: 'side',
    parallel: ['Chiyoda', 'Fukutoshin'],
    signature: 'harajuku',
    ambience: 'park',
    crowd: 1.3,
    depth: PLATFORM_DEPTH + 0.8,
    canopy: 'glass',
    canopyY: 4.6,
    palette: 'harajuku',
  },
  {
    // JY20 - depuis 2023 les deux sens tiennent sur un unique quai central très
    // large, mais fortement courbé. Parois et plafonds provisoires, panneaux de
    // chantier partout, et toujours pas de portes de quai en 2026.
    name: 'JY20 Shibuya',
    elevation: 'elevated',
    config: 'island',
    parallel: ['Saikyō', 'Shōnan–Shinjuku', 'Ginza', 'Tōkyū Tōyoko'],
    psd: 'none',
    works: true,
    signature: 'shibuya',
    ambience: 'hall',
    crowd: 2,
    depth: 10,
    canopy: 'glass',
    canopyY: 6.2,
    columnSpacing: 15,
    palette: 'shibuya',
  },
  {
    // JY21 - quai central couvert sur viaduc, parallèle au quai
    // Saikyō/Shōnan–Shinjuku, très intégré au complexe Atre. L'extrémité est
    // se prolonge vers la longue passerelle d'Ebisu Garden Place.
    name: 'JY21 Ebisu',
    elevation: 'elevated',
    config: 'island',
    parallel: ['Saikyō', 'Shōnan–Shinjuku', 'Hibiya'],
    signature: 'ebisu',
    ambience: 'office',
    crowd: 1.2,
    depth: PLATFORM_DEPTH + 1.8,
    canopyY: 4.2,
  },
  {
    // JY22 - quai central en tranchée, murs latéraux proches, Atre posé
    // au-dessus. Large au centre, effilé aux extrémités.
    name: 'JY22 Meguro',
    elevation: 'trench',
    config: 'island',
    parallel: ['Namboku', 'Mita', 'Tōkyū Meguro'],
    ambience: 'quiet',
    crowd: 1,
    depth: PLATFORM_DEPTH + 1,
  },
  {
    // JY23 - quai central légèrement courbé sur viaduc, ville et façades
    // commerciales à toucher, et la Tōkyū Ikegami spectaculairement perchée au
    // quatrième niveau. Le tronçon est en tranchée, la gare non.
    name: 'JY23 Gotanda',
    elevation: 'elevated',
    config: 'island',
    parallel: ['Tōkyū Ikegami', 'Asakusa'],
    signature: 'gotanda',
    ambience: 'street',
    crowd: 1,
    depth: PLATFORM_DEPTH + 1.2,
    canopyY: 3.9,
  },
  {
    // JY24 - quatre voies Yamanote (1 à 4) sur deux quais centraux : point
    // opérationnel de départ, de terminus et d'accès au dépôt. Portes en place
    // sur les voies principales 1 et 3 ; les secondaires 2 et 4 sont encore
    // en travaux civils (笠石) jusqu'à novembre 2026 au moins.
    name: 'JY24 Osaki',
    openFarSide: true,
    elevation: 'ground',
    config: 'terminusIsland',
    parallel: ['Saikyō', 'Shōnan–Shinjuku', 'Rinkai'],
    psd: 'partial',
    ambience: 'office',
    crowd: 1.3,
    depth: 8.8,
    canopyY: 4.6,
    columnSpacing: 13,
    palette: 'hub',
  },
  {
    // JY25 - très grande gare au sol. Voies 1 et 3 sur deux quais séparés :
    // la numérotation n'est plus continue depuis le remaniement. Immense
    // toiture industrielle, longues perspectives, escaliers massifs, et
    // plusieurs secteurs encore en travaux sur le plan de 2026.
    name: 'JY25 Shinagawa',
    openFarSide: true,
    elevation: 'ground',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Tōkaidō', 'Yokosuka', 'Tōkaidō Shinkansen', 'Keikyū'],
    works: true,
    ambience: 'hall',
    crowd: 1.7,
    depth: 9.4,
    canopy: 'truss',
    canopyY: 5.4,
    columnSpacing: 14,
    palette: 'hub',
  },
  {
    // JY26 - grand quai central, second quai central pour la Keihin-Tōhoku.
    // Toiture blanche inspirée de l'origami, acier et bois clair, façades
    // vitrées, atrium visible depuis le quai : la plus lumineuse de la boucle,
    // et la seule dont l'architecture est entièrement propre.
    name: 'JY26 Takanawa Gateway',
    elevation: 'ground',
    config: 'island',
    parallel: [KT],
    signature: 'takanawaGateway',
    ambience: 'quiet',
    crowd: 0.7,
    depth: 9,
    canopy: 'glass',
    canopyY: 6,
    // Rien ne couvre le quai que la toiture pliée : voir `sigCanopy`.
    sigCanopy: true,
    columnSpacing: 15,
    palette: 'takanawa',
  },
  {
    // JY27 - quatre voies sur deux quais centraux, les extérieures à la
    // Keihin-Tōhoku. Longues marquises, quais rectilignes, vaste
    // bâtiment-pont, et une partie du hall en travaux en 2026.
    name: 'JY27 Tamachi',
    elevation: 'ground',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Tōkaidō'],
    works: true,
    ambience: 'office',
    crowd: 1,
    depth: PLATFORM_DEPTH + 1.8,
  },
  {
    // JY28 - quatre voies au niveau supérieur. Environnement très vertical, le
    // monorail de Haneda immédiatement à côté, éléments anciens mêlés aux
    // structures neuves et plusieurs zones en construction.
    name: 'JY28 Hamamatsucho',
    elevation: 'elevated',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Tokyo Monorail', 'Asakusa', 'Ōedo'],
    works: true,
    signature: 'hamamatsucho',
    ambience: 'monorail',
    crowd: 1.1,
    depth: PLATFORM_DEPTH + 1.2,
    canopyY: 4,
  },
  {
    // JY29 - grande gare élevée, quai central des voies 4 et 5. Vieux viaduc
    // métallique, couverture dense, quais parallèles multiples ; dessous, les
    // arcades et les couloirs bas contrastent avec les tours de Shiodome.
    name: 'JY29 Shimbashi',
    // Huit voies parallèles sous la même couverture : rien ne ferme la travée.
    openFarSide: true,
    elevation: 'elevated',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Tōkaidō', 'Yokosuka', 'Ginza', 'Asakusa', 'Yurikamome'],
    signature: 'shimbashi',
    ambience: 'office',
    crowd: 1.5,
    depth: PLATFORM_DEPTH + 2,
    canopyY: 4.1,
    palette: 'brickViaduct',
  },
  {
    // JY30 - viaduc ancien en acier et maçonnerie, piliers épais, quai couvert
    // et étroit. Restaurants et petites cellules commerciales sous les voies ;
    // à l'ouest, l'International Forum tranche par sa modernité.
    name: 'JY30 Yurakucho',
    elevation: 'elevated',
    config: 'sharedIsland',
    sharedWith: KT,
    parallel: ['Yūrakuchō'],
    signature: 'yurakucho',
    ambience: 'office',
    crowd: 1.1,
    depth: PLATFORM_DEPTH + 0.6,
    canopyY: 3.4,
    palette: 'brickViaduct',
  },
];

/**
 * Mobilier déduit de l'affluence. Un quai plus fréquenté reçoit plus de bancs,
 * plus de distributeurs et un escalier mécanique supplémentaire.
 */
function amenities(scale: number, kiosk: boolean, clock: boolean): StationAmenities {
  const half = FULL_PLATFORM_LEN / 2;
  return {
    benches: Math.round(6 * scale),
    vending: Math.max(1, Math.round(2 * scale)),
    kiosk,
    // Trémies réparties le long du quai, jamais en face d'une porte.
    stairs: [-half * 0.62, half * 0.1],
    escalators: scale > 1 ? [-half * 0.2, half * 0.55] : [half * 0.55],
    elevator: scale > 0.9 ? -half * 0.34 : null,
    clock,
  };
}

/**
 * Écarte chaque plan de charpente des créneaux déjà pris, en cherchant des
 * deux côtés ; un plan qui ne trouve pas de creux est abandonné - mieux vaut
 * une travée plus large qu'un portique dans un escalier mécanique.
 */
function dodgePlanes(zs: number[], solids: { z: number; r: number }[]): number[] {
  return zs.flatMap((base) => {
    for (let d = 0; d <= 4.5; d += 0.9) {
      for (const s of d === 0 ? [0] : [-d, d]) {
        const z = base + s;
        if (!solids.some((o) => Math.abs(z - o.z) < o.r)) return [z];
      }
    }
    return [];
  });
}

/**
 * Plan d'implantation de la charpente signature, quand elle en impose un.
 *
 * Seuls figurent ici les éléments que le RESTE de la gare doit éviter ou
 * contourner : les membrures qui descendent en plein gabarit des panneaux
 * suspendus, et les poteaux plantés sur l'épine. Ce qui reste au-dessus de
 * l'auvent, ou se tient hors de tout passage, n'a rien à déclarer.
 */
function sigPlanFor(
  key: SignatureKey | undefined,
  length: number,
  depth: number,
  spacing: number,
  am: StationAmenities,
): SigPlan | undefined {
  if (!key) return undefined;
  const usable = length / 2 - 3;
  const backX = PSD_X + depth / 2;
  const halfConsist = ((CONSIST.length - 1) / 2) * E235.pitch;

  // Les créneaux déjà pris le long de la voie, chacun avec sa demi-emprise.
  const accesses = [
    ...am.stairs.map((z) => ({ z, r: STAIR_HALF_Z + 0.75 })),
    ...am.escalators.map((z) => ({ z, r: ESCALATOR_HALF_Z + 0.75 })),
    ...(am.elevator !== null ? [{ z: am.elevator, r: ELEVATOR_HALF_Z + 0.75 }] : []),
  ];
  // Potences d'orientation : même formule que systems/stationPlacement.
  const gantries = [
    ...am.stairs.map((z) => ({ z: z - STAIR_HALF_Z - 1.6, r: 1.4 })),
    ...am.escalators.map((z) => ({ z: z - ESCALATOR_HALF_Z - 1.6, r: 1.4 })),
  ];
  // Débouchés des accès : la plaque de balisage y pend, avec sa suspente.
  const entries = [
    ...am.stairs.map((z) => ({ z: z - STAIR_HALF_Z + 0.1, r: 0.6 })),
    ...am.escalators.map((z) => ({ z: z - ESCALATOR_HALF_Z + 0.1, r: 0.6 })),
  ];
  const bands = directionBandZs(length).map((z) => ({ z, r: 4.65 }));
  // Kiosque : même position que systems/stationPlacement (usable × 0,36).
  const kiosk = am.kiosk ? [{ z: usable * 0.36, r: 3.15 }] : [];
  const clock = am.clock ? [{ z: 0, r: 0.8 }] : [];
  // Trame des piliers génériques : tous les `spacing` mètres depuis -usable,
  // comme systems/stationPlacement les pose.
  const columns: { z: number; r: number }[] = [];
  for (let z = -usable; z <= usable; z += spacing) columns.push({ z, r: 0.55 });
  const mirrors = [-1, 1].map((d) => ({ z: d * (halfConsist + 1.2), r: 0.5 }));

  /**
   * Poteaux d'épine : écartés de tout ce qui vit déjà sur l'épine - et de la
   * trame des piliers génériques, dont les poutres transversales montent en
   * travers de leur fût.
   */
  const spinePosts = (zs: number[], extra: { z: number; r: number }[] = []): number[] =>
    dodgePlanes(zs, [...accesses, ...gantries, ...bands, ...kiosk, ...clock, ...columns, ...extra]);

  switch (key) {
    case 'tokyo':
      // Colonnes rivetées au bord de quai : seul le panneau 番線, qui court
      // presque jusqu'au bord, doit connaître la trame des fermes.
      return { keepOut: bays(length, 16).map((z) => ({ z, r: 0.5 })), posts: [], runBlocks: [] };
    case 'yurakucho': {
      // Portiques rivetés pleine largeur : leurs poutres descendent sous
      // l'auvent, leurs montants tiennent au ras des bords. Ils s'écartent des
      // escaliers mécaniques, des débouchés d'accès, des piliers génériques,
      // des miroirs de départ et des suspentes de potence ; tout le suspendu
      // s'écarte d'eux en retour.
      const zs = dodgePlanes(bays(length, 7.2), [
        ...am.escalators.map((z) => ({ z, r: ESCALATOR_HALF_Z + 0.9 })),
        ...entries,
        ...columns,
        ...mirrors,
        ...gantries.map((g) => ({ z: g.z, r: 0.6 })),
      ]);
      return { keepOut: zs.map((z) => ({ z, r: 0.75 })), posts: [], runBlocks: [] };
    }
    case 'shinjuku':
      // La rangée de piliers supplémentaire côté voie, dans le gabarit du 番線.
      return { keepOut: bays(length, 12).map((z) => ({ z, r: 0.55 })), posts: [], runBlocks: [] };
    case 'shimbashi': {
      const zs = spinePosts(bays(length, 11));
      return {
        keepOut: zs.map((z) => ({ z, r: 0.8 })),
        posts: zs.map((z) => ({ x: backX, z })),
        runBlocks: [],
      };
    }
    case 'ebisu': {
      // Descentes de charge du complexe, dans la moitié couverte seulement.
      const built = length * 0.46;
      const zs = spinePosts(bays(built, 12).map((z) => z - length * 0.16));
      return {
        keepOut: zs.map((z) => ({ z, r: 0.8 })),
        posts: zs.map((z) => ({ x: backX, z })),
        runBlocks: [],
      };
    }
    case 'takanawaGateway': {
      // Mezzanines vitrées : elles enjambent maintenant TOUT le site, quais
      // compris - c'est de là qu'on voit les quatre voies d'un coup. Les
      // colonnes-arbres s'en écartent donc à leur tour : plantées au droit
      // d'un tablier, leurs branches le traversaient de part en part.
      const decks = takanawaDeckZs(length).map((z) => ({ z, r: 4.2 }));
      const zs = spinePosts(bays(length, 27), decks);
      return {
        keepOut: [...zs.map((z) => ({ z, r: 0.6 })), ...decks],
        posts: zs.map((z) => ({ x: backX, z })),
        // Les branches des colonnes-arbres s'ouvrent DANS la coupe, à la cote
        // même où courent la gouttière et le chemin de câbles : les conduites
        // s'interrompent au droit de chaque colonne, comme elles le font aux
        // gaines d'escalier mécanique.
        runBlocks: zs.map((z) => ({ z0: z - 1.3, z1: z + 1.3 })),
      };
    }
    case 'hamamatsucho': {
      // Le portique de jonction ancien / neuf : un plan franc et profond.
      const joint = -length * 0.06;
      return {
        keepOut: [{ z: joint, r: 1.55 }],
        posts: [{ x: PSD_X + 0.3, z: joint }],
        runBlocks: [{ z0: joint - 1.8, z1: joint + 1.8 }],
      };
    }
    default:
      return undefined;
  }
}

function build(spec: Spec): StationLayout {
  const f = FAMILY[spec.elevation];
  // Un kiosque de quai ne tient que là où il y a du monde pour le faire vivre.
  const am = amenities(spec.crowd, spec.kiosk ?? spec.crowd >= 1.4, spec.clock ?? true);
  const depth = spec.depth ?? f.depth;
  const columnSpacing = spec.columnSpacing ?? f.columnSpacing;
  return {
    elevation: spec.elevation,
    config: spec.config,
    sharedWith: spec.sharedWith,
    parallel: spec.parallel ?? [],
    psd: spec.psd ?? 'full',
    works: spec.works ?? false,
    openFarSide: spec.openFarSide ?? false,
    length: FULL_PLATFORM_LEN,
    depth,
    canopy: spec.canopy ?? f.canopy,
    canopyY: spec.canopyY ?? f.canopyY,
    sigCanopy: spec.sigCanopy ?? false,
    columnSpacing,
    palette: PALETTES[spec.palette ?? f.palette],
    amenities: am,
    crowdScale: spec.crowd,
    ambience: spec.ambience,
    signature: spec.signature,
    sigPlan: sigPlanFor(spec.signature, FULL_PLATFORM_LEN, depth, columnSpacing, am),
  };
}

/**
 * La voie où l'on se trouve a-t-elle des portes de quai ?
 *
 * `partial` compte pour OUI : à Ōsaki, c'est la voie SECONDAIRE qui n'est pas
 * encore équipée (voies 2 et 4), et le jeu circule sur la principale, qui l'est.
 * La différence se verra sur le quai d'en face, pas sous nos pieds.
 *
 * Restent donc Shinjuku et Shibuya, où les grands travaux interdisent encore
 * toute pose : là, le bord de quai est nu. Ikebukuro, longtemps `partial`, a
 * reçu ses portes secondaires le 18 mars 2026.
 */
export function hasPlatformDoors(index: number): boolean {
  return layoutFor(index).psd !== 'none';
}

/**
 * Réverbération du lieu, 0 (plein air) à 1 (grande halle fermée).
 *
 * Elle ne se décrète pas gare par gare : elle découle de la forme. Un quai de
 * viaduc est à ciel ouvert et n'a pour ainsi dire pas de queue ; une tranchée
 * a ses deux parois à portée de voix ; une halle sous charpente renvoie long et
 * clair. C'est exactement ce qu'on entend en descendant du train.
 */
export function roomTone(index: number): number {
  const l = layoutFor(index);
  const base = l.elevation === 'elevated' ? 0.12 : l.elevation === 'trench' ? 0.58 : 0.34;
  // Une couverture haute et continue ferme le volume ; une dalle basse le rend
  // sourd sans l'allonger, d'où le poids plus faible.
  const roof = l.canopy === 'truss' ? 0.34 : l.canopy === 'glass' ? 0.18 : l.canopy === 'slab' ? 0.12 : 0.06;
  // Un quai latéral a un mur dans le dos ; un îlot ouvre des deux côtés.
  const closed = l.config === 'side' ? 0.08 : 0;
  return Math.min(1, base + roof + closed);
}

const CACHE = new Map<number, StationLayout>();

/** Gabarit complet d'une gare, mémoïsé (30 objets au total). */
export function layoutFor(index: number): StationLayout {
  const i = ((index % 30) + 30) % 30;
  const hit = CACHE.get(i);
  if (hit) return hit;
  const layout = build(SPECS[i]);
  CACHE.set(i, layout);
  return layout;
}
