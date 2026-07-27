// Typologie de chaque gare de la boucle.
//
// Tant qu'on ne voyait le quai que par les vitres, une seule gare générique
// suffisait. Dès qu'on y marche, l'uniformité saute aux yeux : une gare de
// viaduc à Yūrakuchō ne ressemble pas à la tranchée de Mejiro ni à la halle de
// Shinjuku. Ce fichier décrit ce qui change d'une gare à l'autre ; la
// géométrie, elle, reste unique et paramétrée.
//
// Le gabarit est déduit du tronçon (data/segments) et du statut de hub, puis
// corrigé gare par gare par la table d'exceptions en fin de fichier.

import { isMajorHub } from './announcements';
import { ROOF_HUBS, SEGMENTS, segmentAt } from './segments';
import { PLATFORM_DEPTH, PLATFORM_LEN } from './stationGeometry';

export type Typology =
  /** Quai latéral adossé à un mur : le cas le plus courant. */
  | 'sideWall'
  /** Quai en îlot : la deuxième voie est visible de l'autre côté. */
  | 'island'
  /** Quai sur viaduc : garde-corps ajouré, la ville en contrebas. */
  | 'viaduct'
  /** Quai en tranchée : parois de soutènement hautes des deux côtés. */
  | 'trench'
  /** Grande gare : quai large, hauteur libre, charpente. */
  | 'hub';

export type CanopyStyle =
  /** Auvent tôlé sur poutrelles, la norme JR. */
  | 'steel'
  /** Dalle béton basse, gares en tranchée et souterraines. */
  | 'slab'
  /** Charpente claire et verrières, gares récentes. */
  | 'glass'
  /** Charpente de halle, très haute. */
  | 'truss';

export type Backdrop =
  /** Mur plein jusqu'à l'auvent. */
  | 'wall'
  /** Deuxième voie et son quai d'en face. */
  | 'secondTrack'
  /** Garde-corps ajouré : on voit la ville par-dessus. */
  | 'parapet'
  /** Mur de soutènement de tranchée, plus haut que l'auvent. */
  | 'retaining';

export interface StationPalette {
  slab: string;
  wall: string;
  column: string;
  canopy: string;
  accent: string;
  lamp: string;
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

export interface StationLayout {
  typology: Typology;
  /** Longueur du quai (m) : onze voitures de 20 m plus les abouts. */
  length: number;
  /** Profondeur du quai (m), du bord au mur de fond. */
  depth: number;
  canopy: CanopyStyle;
  /** Hauteur de la sous-face de l'auvent (m au-dessus du plancher du wagon). */
  canopyY: number;
  /** Entraxe des piliers (m). */
  columnSpacing: number;
  backdrop: Backdrop;
  palette: StationPalette;
  amenities: StationAmenities;
  /** Densité de foule relative (1 = gare ordinaire). */
  crowdScale: number;
  signature?: 'tokyo' | 'shinjuku' | 'shibuya';
}

/** Longueur réelle d'un quai de la Yamanote : 11 voitures de 20 m. */
export const FULL_PLATFORM_LEN = 224;

const PALETTES: Record<string, StationPalette> = {
  // Béton clair et acier gris : la gare JR ordinaire.
  standard: {
    slab: '#c8c9c4',
    wall: '#b8bab4',
    column: '#8e9296',
    canopy: '#5e646a',
    accent: '#80c241',
    lamp: '#fff2d4',
  },
  // Tranchée : tout est plus sombre, la lumière vient d'en haut.
  trench: {
    slab: '#b9bab5',
    wall: '#9a9c96',
    column: '#7c8085',
    canopy: '#4e545a',
    accent: '#80c241',
    lamp: '#ffeec6',
  },
  // Viaduc : dalle plus claire, structure peinte en gris perle.
  viaduct: {
    slab: '#cdcec8',
    wall: '#c2c4bd',
    column: '#9aa0a4',
    canopy: '#6a7076',
    accent: '#80c241',
    lamp: '#fff5dc',
  },
  // Grande gare : béton lissé pâle, charpente claire.
  hub: {
    slab: '#d2d3ce',
    wall: '#c6c8c2',
    column: '#a6abaf',
    canopy: '#7a8188',
    accent: '#80c241',
    lamp: '#fff8e6',
  },
  // Tokyo : brique et acier riveté sombre de la halle Marunouchi.
  tokyo: {
    slab: '#cfc9c1',
    wall: '#9d5a48',
    column: '#5d4038',
    canopy: '#6b5348',
    accent: '#80c241',
    lamp: '#ffeec0',
  },
  // Shinjuku : forêt de piliers, éclairage jaune, tout est plus bas.
  shinjuku: {
    slab: '#c2c3bd',
    wall: '#adaea8',
    column: '#8b8f92',
    canopy: '#565c62',
    accent: '#80c241',
    lamp: '#ffe9ae',
  },
  // Shibuya : verre et acier blanc de la reconstruction de 2023.
  shibuya: {
    slab: '#d8d9d5',
    wall: '#dcded9',
    column: '#c6cacd',
    canopy: '#aeb5ba',
    accent: '#80c241',
    lamp: '#ffffff',
  },
};

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

/** Gabarit déduit du tronçon traversé, avant exceptions. */
function baseLayout(index: number): StationLayout {
  const hub = isMajorHub(index) || ROOF_HUBS[index] !== undefined;
  const kind = SEGMENTS[segmentAt(index)].kind;

  if (hub) {
    return {
      typology: 'hub',
      length: FULL_PLATFORM_LEN,
      depth: 9.2,
      canopy: 'truss',
      canopyY: 5.6,
      columnSpacing: 14,
      backdrop: 'secondTrack',
      palette: PALETTES.hub,
      amenities: amenities(1.6, true, true),
      crowdScale: 1.9,
    };
  }
  if (kind === 'trench') {
    return {
      typology: 'trench',
      length: FULL_PLATFORM_LEN,
      depth: PLATFORM_DEPTH + 0.8,
      canopy: 'slab',
      canopyY: 3.3,
      columnSpacing: 9,
      backdrop: 'retaining',
      palette: PALETTES.trench,
      amenities: amenities(0.8, false, true),
      crowdScale: 0.8,
    };
  }
  if (kind === 'viaduct') {
    return {
      typology: 'viaduct',
      length: FULL_PLATFORM_LEN,
      depth: PLATFORM_DEPTH + 1.4,
      canopy: 'steel',
      canopyY: 3.9,
      columnSpacing: 11,
      backdrop: 'parapet',
      palette: PALETTES.viaduct,
      amenities: amenities(1, false, true),
      crowdScale: 1,
    };
  }
  if (kind === 'corridor') {
    return {
      typology: 'island',
      length: FULL_PLATFORM_LEN,
      depth: PLATFORM_DEPTH + 2.2,
      canopy: 'steel',
      canopyY: 4.1,
      columnSpacing: 12,
      backdrop: 'secondTrack',
      palette: PALETTES.standard,
      amenities: amenities(1.1, false, true),
      crowdScale: 1.1,
    };
  }
  return {
    typology: 'sideWall',
    length: FULL_PLATFORM_LEN,
    depth: PLATFORM_DEPTH + 1,
    canopy: 'steel',
    canopyY: 3.6,
    columnSpacing: 10.5,
    backdrop: 'wall',
    palette: PALETTES.standard,
    amenities: amenities(0.9, false, false),
    crowdScale: 0.9,
  };
}

/** Retouches gare par gare, par code JY (index 0-based). */
const OVERRIDES: Record<number, Partial<StationLayout>> = {
  // JY01 Tokyo — halle de brique, charpente rivetée, verrière en berceau.
  0: {
    signature: 'tokyo',
    canopy: 'truss',
    // Sous la grande dalle de la halle (6,30 m) : l'auvent de quai reste dessous.
    canopyY: 5.5,
    depth: 10.5,
    columnSpacing: 16,
    backdrop: 'secondTrack',
    palette: PALETTES.tokyo,
    crowdScale: 2,
  },
  // JY05 Ueno — grande gare, mais quai plus resserré qu'à Tokyo.
  4: { depth: 8.6, canopyY: 5.2 },
  // JY07 Uguisudani — la plus discrète de la boucle.
  6: { crowdScale: 0.55, amenities: { ...amenities(0.6, false, false) } },
  // JY13 Ikebukuro — hub très fréquenté.
  12: { crowdScale: 2, depth: 9.8 },
  // JY17 Shinjuku — forêt de piliers, dalle basse, éclairage jaune.
  16: {
    signature: 'shinjuku',
    canopy: 'slab',
    canopyY: 4.2,
    depth: 8.4,
    columnSpacing: 9,
    palette: PALETTES.shinjuku,
    crowdScale: 2.2,
  },
  // JY20 Shibuya — îlot large de 2023, verre et acier blanc.
  19: {
    signature: 'shibuya',
    typology: 'island',
    canopy: 'glass',
    canopyY: 6.2,
    depth: 10,
    columnSpacing: 15,
    backdrop: 'secondTrack',
    palette: PALETTES.shibuya,
    crowdScale: 2,
  },
  // JY26 Takanawa Gateway — verrière blanche, gare neuve et vide.
  25: { canopy: 'glass', canopyY: 6.0, palette: PALETTES.shibuya, crowdScale: 0.7 },
  // JY30 Yurakucho — viaduc étroit sous les voies du Shinkansen.
  29: { depth: PLATFORM_DEPTH + 0.6, canopyY: 3.4 },
};

const CACHE = new Map<number, StationLayout>();

/** Gabarit complet d'une gare, mémoïsé (30 objets au total). */
export function layoutFor(index: number): StationLayout {
  const i = ((index % 30) + 30) % 30;
  const hit = CACHE.get(i);
  if (hit) return hit;
  const layout = { ...baseLayout(i), ...OVERRIDES[i] };
  CACHE.set(i, layout);
  return layout;
}

/** Ancienne longueur de quai, conservée pour les repères de l'occultation. */
export { PLATFORM_LEN };
