// Circulation hors quai : sous-voies, mezzanines, halls et accès verticaux.
//
// Source de vérité pour ce que les trémies rejoignent. Les numéros de voie, côtés
// d'ouverture (G/D) et familles reprennent le relevé JR East janvier 2026.

import type { DoorSide, LoopDirection } from './platforms.ts';
import type { Elevation, PlatformConfig, PsdState } from './stationLayouts.ts';

/** Longueur quai Yamanote (m) — alignée sur stationLayouts.FULL_PLATFORM_LEN. */
const PLATFORM_LEN = 224;
const CAR_LEN = 20;

/** Centre de la voiture `car` (1…11) le long du quai. */
export function carCenterZ(car: number): number {
  return -PLATFORM_LEN / 2 + (car - 0.5) * CAR_LEN;
}

/** Joint entre deux voitures. */
export function betweenCarsZ(a: number, b: number): number {
  return (carCenterZ(a) + carCenterZ(b)) / 2;
}

export type AccessKind = 'stairs' | 'escalator' | 'elevator';
export type AccessDir = 'down' | 'up';
export type StationAccessDir = 'down' | 'up' | 'mixed';
export type AccessFamily = 'islandBridge' | 'underpass' | 'terminusHall' | 'special';

export interface AccessSpec {
  kind: AccessKind;
  /** Direction verticale depuis le quai. */
  dir: AccessDir;
  /** Abscisse z (m) le long du quai. */
  z: number;
  /** Libellé de destination (panneaux). */
  dest: string;
}

export interface GateSpec {
  /** Position relative dans le hall (−1…1 le long de l’axe principal). */
  u: number;
  label: string;
}

export interface ConcourseSpec {
  /** Demi-longueur du hall le long de la voie (m). */
  halfZ: number;
  /** Demi-largeur transversale (m). */
  halfX: number;
  /** Portillons / rangées de tickets. */
  gates: readonly GateSpec[];
  /** Toilettes présentes. */
  toilets: boolean;
  /** Sorties rue (limites soft du monde). */
  exitDoors: readonly string[];
  /** Commerces / labels décoratifs. */
  retail: readonly string[];
  /** Notes d’ambiance (spéciales). */
  notes?: string;
}

export interface StationCirculation {
  jy: string;
  innerTrack: number;
  outerTrack: number;
  innerDoorSide: DoorSide;
  outerDoorSide: DoorSide;
  /** Alias de `config` layout. */
  platformLayout: PlatformConfig;
  elevation: Elevation;
  sharedLines: readonly string[];
  terminalTracks: readonly number[];
  platformDoors: PsdState;
  accessDir: StationAccessDir;
  accessFamily: AccessFamily;
  accesses: readonly AccessSpec[];
  concourse: ConcourseSpec;
}

const KT = 'Keihin-Tōhoku';

function side(letter: 'G' | 'D'): DoorSide {
  return letter === 'D' ? 'right' : 'left';
}

function hall(
  halfZ: number,
  halfX: number,
  gates: GateSpec[],
  exits: string[],
  retail: string[] = [],
  toilets = true,
  notes?: string,
): ConcourseSpec {
  return { halfZ, halfX, gates, toilets, exitDoors: exits, retail, notes };
}

function underpassAccesses(spread = 1): AccessSpec[] {
  const a = betweenCarsZ(2, 3);
  const b = betweenCarsZ(6, 7);
  const c = carCenterZ(9);
  return [
    { kind: 'stairs', dir: 'down', z: a * spread, dest: '改札' },
    { kind: 'escalator', dir: 'down', z: b * spread, dest: '改札' },
    { kind: 'stairs', dir: 'down', z: c * spread, dest: '改札' },
  ];
}

function bridgeAccesses(end: 'plus' | 'minus' | 'center' = 'plus'): AccessSpec[] {
  const base = end === 'plus' ? 78 : end === 'minus' ? -78 : 12;
  return [
    { kind: 'escalator', dir: 'up', z: base - 6, dest: '改札' },
    { kind: 'stairs', dir: 'up', z: base, dest: '改札' },
    { kind: 'elevator', dir: 'up', z: base + 10, dest: '改札' },
  ];
}

/** Matrice des 30 gares — ordre STATIONS (JY01…JY30). */
export const STATION_CIRCULATION: readonly StationCirculation[] = [
  {
    jy: 'JY01',
    innerTrack: 4,
    outerTrack: 5,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'ground',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: [
      { kind: 'stairs', dir: 'down', z: betweenCarsZ(1, 2), dest: '丸の内' },
      { kind: 'escalator', dir: 'down', z: carCenterZ(4), dest: '八重洲' },
      { kind: 'stairs', dir: 'down', z: betweenCarsZ(7, 8), dest: '日本橋' },
      { kind: 'elevator', dir: 'down', z: carCenterZ(9), dest: '改札' },
    ],
    concourse: hall(28, 9, [
      { u: -0.45, label: '丸の内改札' },
      { u: 0.35, label: '八重洲改札' },
    ], ['丸の内口', '八重洲口'], ['グランスタ'], true, 'Halle monumentale sous viaduc dense'),
  },
  {
    jy: 'JY02',
    innerTrack: 3,
    outerTrack: 2,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'elevated',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(),
    concourse: hall(16, 5.5, [{ u: 0, label: '改札' }], ['北口', '南口'], ['商店街']),
  },
  {
    jy: 'JY03',
    innerTrack: 2,
    outerTrack: 3,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'elevated',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'special',
    accesses: [
      { kind: 'stairs', dir: 'down', z: betweenCarsZ(2, 3), dest: '電気街口' },
      { kind: 'escalator', dir: 'down', z: carCenterZ(5), dest: '昭和通り口' },
      { kind: 'stairs', dir: 'down', z: carCenterZ(8), dest: '中央改札' },
    ],
    concourse: hall(22, 7, [
      { u: -0.3, label: '中央改札' },
      { u: 0.4, label: '昭和通り改札' },
    ], ['電気街口', '昭和通り口'], ['ヨドバシ連絡'], true, 'Chūō–Sōbu perpendiculaire au-dessus'),
  },
  {
    jy: 'JY04',
    innerTrack: 3,
    outerTrack: 2,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'elevated',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(0.9),
    concourse: hall(14, 5, [{ u: 0, label: '改札' }], ['北口', '南口'], ['アメ横']),
  },
  {
    jy: 'JY05',
    innerTrack: 2,
    outerTrack: 3,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'ground',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'mixed',
    accessFamily: 'special',
    accesses: [
      { kind: 'stairs', dir: 'down', z: betweenCarsZ(1, 2), dest: '不忍改札' },
      { kind: 'escalator', dir: 'down', z: carCenterZ(3), dest: '中央改札' },
      { kind: 'stairs', dir: 'down', z: betweenCarsZ(5, 6), dest: '中央改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(8), dest: '公園改札' },
      { kind: 'elevator', dir: 'up', z: carCenterZ(8) + 4, dest: '公園改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(9), dest: '入谷改札' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(9) + 5, dest: '入谷改札' },
      { kind: 'stairs', dir: 'up', z: betweenCarsZ(10, 11), dest: '公園改札' },
    ],
    concourse: hall(32, 8, [
      { u: -0.55, label: '不忍改札' },
      { u: -0.15, label: '中央改札' },
      { u: 0.35, label: '公園改札' },
      { u: 0.65, label: '入谷改札' },
    ], ['不忍口', '中央口', '公園口', '入谷口'], ['ecute', 'atré'], true,
      'M2F/1F côté voitures 1–6 ; 3F côté 8–11'),
  },
  {
    jy: 'JY06',
    innerTrack: 2,
    outerTrack: 3,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'ground',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'islandBridge',
    accesses: bridgeAccesses('center'),
    concourse: hall(12, 4.5, [{ u: 0, label: '改札' }], ['北口', '南口']),
  },
  {
    jy: 'JY07',
    innerTrack: 11,
    outerTrack: 10,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'ground',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'special',
    accesses: [
      { kind: 'stairs', dir: 'up', z: carCenterZ(3), dest: '南改札' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(6), dest: '中央改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(9), dest: '北改札' },
      { kind: 'elevator', dir: 'up', z: carCenterZ(10), dest: '北改札' },
    ],
    concourse: hall(26, 7, [
      { u: -0.4, label: '南改札' },
      { u: 0.2, label: '中央改札' },
      { u: 0.55, label: '北改札' },
    ], ['南口', '北口', '京成連絡'], [], true, 'Faisceau JR/Keisei très large'),
  },
  {
    jy: 'JY08',
    innerTrack: 3,
    outerTrack: 2,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'elevated',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(),
    concourse: hall(14, 5, [{ u: 0, label: '改札' }], ['南口', '北口']),
  },
  {
    jy: 'JY09',
    innerTrack: 2,
    outerTrack: 3,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'trench',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'islandBridge',
    accesses: bridgeAccesses('center'),
    concourse: hall(14, 5.5, [{ u: 0, label: '改札' }], ['北口', '南口']),
  },
  {
    jy: 'JY10',
    innerTrack: 2,
    outerTrack: 1,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'trench',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'islandBridge',
    accesses: bridgeAccesses('plus'),
    concourse: hall(11, 4.2, [{ u: 0, label: '改札' }], ['北口', '南口']),
  },
  {
    jy: 'JY11',
    innerTrack: 2,
    outerTrack: 1,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'trench',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'islandBridge',
    accesses: bridgeAccesses('plus'),
    concourse: hall(12, 4.2, [{ u: 0, label: '改札' }], ['北口', '南口']),
  },
  {
    jy: 'JY12',
    innerTrack: 1,
    outerTrack: 2,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'elevated',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(),
    concourse: hall(13, 4.5, [{ u: 0, label: '改札' }], ['北口', '南口'], ['都電荒川線']),
  },
  {
    jy: 'JY13',
    innerTrack: 6,
    outerTrack: 7,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'terminusIsland',
    elevation: 'ground',
    sharedLines: [],
    terminalTracks: [5, 8],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'terminusHall',
    accesses: [
      { kind: 'stairs', dir: 'up', z: carCenterZ(2), dest: '南改札' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(4), dest: '中央改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(7), dest: '北改札' },
      { kind: 'elevator', dir: 'up', z: carCenterZ(9), dest: '北改札' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(10), dest: '東改札' },
    ],
    concourse: hall(30, 9, [
      { u: -0.4, label: '南改札' },
      { u: 0, label: '中央改札' },
      { u: 0.45, label: '北改札' },
    ], ['東口', '西口', 'メトロ連絡'], ['パルコ', 'ルミネ'], true,
      'Voies terminales 5/8 : PSD intelligentes mars 2026'),
  },
  {
    jy: 'JY14',
    innerTrack: 1,
    outerTrack: 2,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'trench',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'islandBridge',
    // Extrémity Ikebukuro / Ueno (côté +z), comme sur le plan de gare.
    accesses: [
      { kind: 'escalator', dir: 'up', z: carCenterZ(9), dest: '改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(10), dest: '改札' },
      { kind: 'elevator', dir: 'up', z: carCenterZ(11) - 4, dest: '改札' },
    ],
    concourse: hall(10, 4, [{ u: 0.2, label: '改札' }], ['正面口'], ['ホテルメッツ'], true,
      'Concourse compact au-dessus des voies, côté Ikebukuro'),
  },
  {
    jy: 'JY15',
    innerTrack: 2,
    outerTrack: 1,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'elevated',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(),
    concourse: hall(16, 5, [
      { u: -0.25, label: '早稲田口' },
      { u: 0.3, label: '戸山口' },
    ], ['早稲田口', '戸山口'], ['西武新宿線']),
  },
  {
    jy: 'JY16',
    innerTrack: 2,
    outerTrack: 1,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'elevated',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: [
      { kind: 'stairs', dir: 'down', z: carCenterZ(3), dest: '改札' },
      { kind: 'stairs', dir: 'down', z: carCenterZ(8), dest: '改札' },
    ],
    concourse: hall(11, 3.8, [{ u: 0, label: '改札' }], ['北口', '南口']),
  },
  {
    jy: 'JY17',
    innerTrack: 14,
    outerTrack: 15,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'island',
    elevation: 'ground',
    sharedLines: ['Chūō–Sōbu'],
    terminalTracks: [],
    platformDoors: 'none',
    accessDir: 'up',
    accessFamily: 'special',
    accesses: [
      { kind: 'stairs', dir: 'up', z: carCenterZ(2), dest: '南改札' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(5), dest: '中央改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(8), dest: '東改札' },
      { kind: 'elevator', dir: 'up', z: carCenterZ(10), dest: '新南改札' },
    ],
    concourse: hall(34, 10, [
      { u: -0.5, label: '南改札' },
      { u: 0, label: '中央改札' },
      { u: 0.4, label: '東改札' },
      { u: 0.7, label: '新南改札' },
    ], ['南口', '東口', '西口', '新南口'], ['ルミネ', 'ミロード'], true,
      'Deux faces Yamanote séparées ; pas de PSD en 2026'),
  },
  {
    jy: 'JY18',
    innerTrack: 2,
    outerTrack: 1,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    // Outer : quai latéral ; inner : îlot partagé Chūō–Sōbu (rendu = îlot).
    platformLayout: 'sharedIsland',
    elevation: 'ground',
    sharedLines: ['Chūō–Sōbu'],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'special',
    accesses: [
      { kind: 'stairs', dir: 'up', z: carCenterZ(4), dest: '北改札' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(7), dest: '南改札' },
    ],
    concourse: hall(14, 5, [
      { u: -0.2, label: '北改札' },
      { u: 0.35, label: '南改札' },
    ], ['北口', '南口'], [], true, 'Asymétrique : outer latéral, inner îlot Chūō–Sōbu'),
  },
  {
    jy: 'JY19',
    innerTrack: 1,
    outerTrack: 2,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'side',
    elevation: 'ground',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'special',
    accesses: [
      { kind: 'stairs', dir: 'up', z: carCenterZ(3), dest: '竹下口' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(6), dest: '表参道口' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(9), dest: '明治神宮口' },
    ],
    concourse: hall(18, 5.5, [
      { u: -0.35, label: '竹下改札' },
      { u: 0.35, label: '表参道改札' },
    ], ['竹下口', '表参道口', '明治神宮口'], [], true, 'Deux quais latéraux permanents depuis 2020'),
  },
  {
    jy: 'JY20',
    innerTrack: 2,
    outerTrack: 1,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'elevated',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'none',
    accessDir: 'down',
    accessFamily: 'special',
    accesses: [
      { kind: 'escalator', dir: 'down', z: carCenterZ(3), dest: 'ハチ公改札' },
      { kind: 'stairs', dir: 'down', z: carCenterZ(6), dest: '中央改札' },
      { kind: 'elevator', dir: 'down', z: carCenterZ(8), dest: '中央改札' },
      { kind: 'stairs', dir: 'down', z: carCenterZ(10), dest: '新南改札' },
    ],
    concourse: hall(28, 9, [
      { u: -0.4, label: 'ハチ公改札' },
      { u: 0.1, label: '中央改札' },
      { u: 0.55, label: '新南改札' },
    ], ['ハチ公口', '東口', '西口'], ['渋谷スクランブル'], true,
      'Îlot unique post-2023 ; pas de PSD'),
  },
  {
    jy: 'JY21',
    innerTrack: 2,
    outerTrack: 1,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'elevated',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(),
    concourse: hall(16, 5.5, [{ u: 0, label: '改札' }], ['東口', '西口'], ['アトレ']),
  },
  {
    jy: 'JY22',
    innerTrack: 1,
    outerTrack: 2,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'trench',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'islandBridge',
    accesses: bridgeAccesses('center'),
    concourse: hall(13, 4.5, [{ u: 0, label: '改札' }], ['東口', '西口'], ['アトレ']),
  },
  {
    jy: 'JY23',
    innerTrack: 1,
    outerTrack: 2,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'elevated',
    sharedLines: [],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(),
    concourse: hall(14, 4.8, [{ u: 0, label: '改札' }], ['東口', '西口'], ['東急池上線']),
  },
  {
    jy: 'JY24',
    innerTrack: 1,
    outerTrack: 3,
    innerDoorSide: side('D'),
    outerDoorSide: side('G'),
    platformLayout: 'terminusIsland',
    elevation: 'ground',
    sharedLines: [],
    terminalTracks: [2, 4],
    platformDoors: 'partial',
    accessDir: 'up',
    accessFamily: 'terminusHall',
    accesses: [
      { kind: 'stairs', dir: 'up', z: carCenterZ(3), dest: '北改札' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(6), dest: '中央改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(9), dest: '南改札' },
      { kind: 'elevator', dir: 'up', z: carCenterZ(10), dest: '南改札' },
    ],
    concourse: hall(24, 7.5, [
      { u: -0.35, label: '北改札' },
      { u: 0.35, label: '南改札' },
    ], ['北口', '南口'], ['ThinkPark'], true,
      'Voies 2/4 terminales : PSD annoncées FY2026'),
  },
  {
    jy: 'JY25',
    innerTrack: 1,
    outerTrack: 3,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'sharedIsland',
    elevation: 'ground',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'special',
    accesses: [
      { kind: 'stairs', dir: 'up', z: carCenterZ(2), dest: '高輪口' },
      { kind: 'escalator', dir: 'up', z: carCenterZ(5), dest: '中央改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(8), dest: '港南口' },
      { kind: 'elevator', dir: 'up', z: carCenterZ(10), dest: '港南口' },
    ],
    concourse: hall(28, 8, [
      { u: -0.4, label: '高輪改札' },
      { u: 0.4, label: '港南改札' },
    ], ['高輪口', '港南口'], [], true, 'Outer voie 3 depuis déc. 2021, îlot partagé KT'),
  },
  {
    jy: 'JY26',
    innerTrack: 1,
    outerTrack: 2,
    innerDoorSide: side('D'),
    outerDoorSide: side('D'),
    platformLayout: 'island',
    elevation: 'ground',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'special',
    accesses: [
      { kind: 'escalator', dir: 'up', z: carCenterZ(4), dest: '改札' },
      { kind: 'stairs', dir: 'up', z: carCenterZ(7), dest: '改札' },
      { kind: 'elevator', dir: 'up', z: carCenterZ(9), dest: '改札' },
    ],
    concourse: hall(20, 7, [{ u: 0, label: '改札' }], ['高輪口', '港南口'], [], true,
      'Halle origami ; second îlot Keihin-Tōhoku'),
  },
  {
    jy: 'JY27',
    innerTrack: 2,
    outerTrack: 3,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'ground',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'up',
    accessFamily: 'underpass',
    accesses: bridgeAccesses('center').map((a) => ({ ...a, dir: 'up' as const })),
    concourse: hall(18, 6, [
      { u: -0.3, label: '芝浦改札' },
      { u: 0.3, label: '三田改札' },
    ], ['芝浦口', '三田口']),
  },
  {
    jy: 'JY28',
    innerTrack: 2,
    outerTrack: 3,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'elevated',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(),
    concourse: hall(16, 5.5, [{ u: 0, label: '改札' }], ['北口', '南口'], ['モノレール']),
  },
  {
    jy: 'JY29',
    innerTrack: 5,
    outerTrack: 4,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'elevated',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(),
    concourse: hall(18, 6, [
      { u: -0.25, label: '汐留改札' },
      { u: 0.3, label: '烏森改札' },
    ], ['汐留口', '烏森口', 'SL広場'], ['高架下商店']),
  },
  {
    jy: 'JY30',
    innerTrack: 2,
    outerTrack: 3,
    innerDoorSide: side('G'),
    outerDoorSide: side('G'),
    platformLayout: 'sharedIsland',
    elevation: 'elevated',
    sharedLines: [KT],
    terminalTracks: [],
    platformDoors: 'full',
    accessDir: 'down',
    accessFamily: 'underpass',
    accesses: underpassAccesses(0.85),
    concourse: hall(14, 5, [{ u: 0, label: '改札' }], ['国際フォーラム口', '銀座口'], ['高架下']),
  },
];

if (STATION_CIRCULATION.length !== 30) {
  throw new Error(`STATION_CIRCULATION doit contenir 30 gares (got ${STATION_CIRCULATION.length})`);
}

export function circulationFor(index: number): StationCirculation {
  const i = ((index % 30) + 30) % 30;
  return STATION_CIRCULATION[i];
}

export function circulationByJy(jy: string): StationCirculation | undefined {
  return STATION_CIRCULATION.find((c) => c.jy === jy);
}

export function doorSideNameFromCirculation(
  index: number,
  direction: LoopDirection,
): DoorSide {
  const c = circulationFor(index);
  return direction === 'inner' ? c.innerDoorSide : c.outerDoorSide;
}

export function doorSideFromCirculation(
  index: number,
  direction: LoopDirection,
): 1 | -1 {
  return doorSideNameFromCirculation(index, direction) === 'right' ? 1 : -1;
}

/** Table indexée gare → côté (sens intérieur). Compat rendu historique. */
export function doorSideTableFromCirculation(): (1 | -1)[] {
  return STATION_CIRCULATION.map((c) => (c.innerDoorSide === 'right' ? 1 : -1));
}

/** Positions z des trémies d’escalier praticables (kind stairs). */
export function stairZsFor(index: number): number[] {
  return circulationFor(index).accesses.filter((a) => a.kind === 'stairs').map((a) => a.z);
}

export function escalatorZsFor(index: number): number[] {
  return circulationFor(index).accesses.filter((a) => a.kind === 'escalator').map((a) => a.z);
}

export function elevatorZFor(index: number): number | null {
  const elev = circulationFor(index).accesses.find((a) => a.kind === 'elevator');
  return elev?.z ?? null;
}

/** Direction verticale d’un accès au z donné (escalier, mécanique ou ascenseur). */
export function accessDirAt(index: number, z: number, kind?: AccessKind): AccessDir {
  const c = circulationFor(index);
  let best: AccessSpec | null = null;
  let bestD = Infinity;
  for (const a of c.accesses) {
    if (kind && a.kind !== kind) continue;
    const d = Math.abs(a.z - z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  if (best) return best.dir;
  return c.accessDir === 'up' ? 'up' : 'down';
}

/** true si cet accès vertical monte vers la mezzanine. */
export function isUpAccess(index: number, z: number, kind?: AccessKind): boolean {
  return accessDirAt(index, z, kind) === 'up';
}
