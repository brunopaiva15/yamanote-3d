// Environnement réel de chaque tronçon inter-gares, vu depuis le train : la
// Yamanote circule presque toujours à l'air libre (aucun tunnel sur la boucle
// voyageurs) mais alterne viaducs urbains, larges corridors ferroviaires,
// tranchées ouvertes et sections au niveau du sol.
//
// Segment i = trajet STATIONS[i] → STATIONS[(i+1)%30], dans le sens simulé
// (内回り, ordre JY croissant).

export type SegmentKind = 'viaduct' | 'corridor' | 'trench' | 'ground';

export interface Segment {
  kind: SegmentKind;
  /** Ponts routiers au-dessus des voies : 1 = épars (~1/400 m), 2 = fréquents (~1/260 m). */
  bridges?: 1 | 2;
  /** Végétation renforcée le long de la voie. */
  greenery?: boolean;
  /** Rames stationnées visibles (dépôts, voies de garage). */
  depot?: boolean;
  /** Train croisé sur les voies parallèles. */
  passing?: 'shinkansen' | 'commuter';
  /** Tranchée : hauteur du mur de soutènement (m, défaut WALL_DEFAULT). */
  wallHeight?: number;
  /** La tranchée s'ouvre sur la fin du tronçon : les murs s'abaissent. */
  opensAtEnd?: boolean;
  /** Corridor : paires de voies parallèles visibles par côté (défaut 2). */
  tracks?: number;
  /** Tronçon largement couvert par des structures de gare (Shinjuku→Yoyogi). */
  covered?: boolean;
}

export const SEGMENTS: Segment[] = [
  /* 00 Tokyo→Kanda             */ { kind: 'viaduct' },
  /* 01 Kanda→Akihabara         */ { kind: 'viaduct' },
  /* 02 Akihabara→Okachimachi   */ { kind: 'viaduct' },
  /* 03 Okachimachi→Ueno        */ { kind: 'viaduct' },
  /* 04 Ueno→Uguisudani         */ { kind: 'corridor', greenery: true },
  /* 05 Uguisudani→Nippori      */ { kind: 'corridor', passing: 'shinkansen' },
  /* 06 Nippori→Nishi-Nippori   */ { kind: 'corridor' },
  /* 07 Nishi-Nippori→Tabata    */ { kind: 'corridor', depot: true },
  /* 08 Tabata→Komagome         */ { kind: 'ground', greenery: true },
  /* 09 Komagome→Sugamo         */ { kind: 'trench', bridges: 2, wallHeight: 7 },
  /* 10 Sugamo→Otsuka           */ { kind: 'trench', bridges: 1, opensAtEnd: true },
  /* 11 Otsuka→Ikebukuro        */ { kind: 'ground' },
  /* 12 Ikebukuro→Mejiro        */ { kind: 'trench', bridges: 1, wallHeight: 4 },
  /* 13 Mejiro→Takadanobaba     */ { kind: 'ground', greenery: true },
  /* 14 Takadanobaba→Shin-Okubo */ { kind: 'ground' },
  /* 15 Shin-Okubo→Shinjuku     */ { kind: 'corridor', tracks: 3, passing: 'commuter' },
  /* 16 Shinjuku→Yoyogi         */ { kind: 'corridor', covered: true },
  /* 17 Yoyogi→Harajuku         */ { kind: 'ground', greenery: true },
  /* 18 Harajuku→Shibuya        */ { kind: 'ground', greenery: true },
  /* 19 Shibuya→Ebisu           */ { kind: 'viaduct' },
  /* 20 Ebisu→Meguro            */ { kind: 'trench', bridges: 1 },
  /* 21 Meguro→Gotanda          */ { kind: 'trench', bridges: 1, opensAtEnd: true },
  /* 22 Gotanda→Osaki           */ { kind: 'viaduct' },
  /* 23 Osaki→Shinagawa         */ { kind: 'corridor', depot: true, tracks: 3, passing: 'commuter' },
  /* 24 Shinagawa→Takanawa GW   */ { kind: 'corridor', tracks: 4, passing: 'commuter' },
  /* 25 Takanawa GW→Tamachi     */ { kind: 'corridor', tracks: 3, passing: 'commuter' },
  /* 26 Tamachi→Hamamatsucho    */ { kind: 'ground' },
  /* 27 Hamamatsucho→Shimbashi  */ { kind: 'viaduct' },
  /* 28 Shimbashi→Yurakucho     */ { kind: 'viaduct', bridges: 1 },
  /* 29 Yurakucho→Tokyo         */ { kind: 'viaduct' },
];

// Tronçon « ambiant » pour un store.index donné, valable dans TOUTES les
// phases : index désigne la gare d'arrivée en roulant (il avance au début de
// `depart`), donc l'environnement traversé est toujours celui du segment
// index-1 → index.
export const segmentAt = (stationIndex: number): number => (stationIndex + 29) % 30;

// Gares à grande toiture : la verrière masque progressivement le ciel à
// l'approche et au départ. Superset des MAJOR_HUBS d'announcements.ts
// (+ Takanawa Gateway et sa verrière blanche) — ne pas fusionner les deux.
export const ROOF_HUBS: Record<number, 'steel' | 'lattice'> = {
  0: 'steel', // Tokyo
  4: 'steel', // Ueno
  12: 'steel', // Ikebukuro
  16: 'steel', // Shinjuku
  19: 'steel', // Shibuya
  24: 'steel', // Shinagawa
  25: 'lattice', // Takanawa Gateway
};
