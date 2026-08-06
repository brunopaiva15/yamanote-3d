// La boucle Yamanote et les repères de Tokyo, en mètres.
//
// GÉNÉRÉ par `node scripts/geo-loop.mjs` - ne pas éditer à la main. Les
// coordonnées sources, leur provenance et ce qu'elles valent sont dans le
// script ; l'essentiel est rappelé ici.
//
// Repère : +x vers l'EST, −z vers le NORD, en mètres, origine au milieu du quai
// de Tokyo (JY01). C'est la convention de scène du jeu (le train regarde −z),
// si bien qu'une position et un cap se lisent directement.
//
// Projection EPSG:6677 (zone IX, méridien central 139°30'), depuis
// JGD2011. Les coordonnées de gare sont des milieux de quai publiés, à ~10 m ;
// celles des repères, des sommets, à ~50 m.
//
// ⚠️ Ces données ne portent PAS la longueur de la boucle. La corde entre deux
// gares est plus courte que le kilométrage JR - la voie tourne - et c'est
// src/data/segments.ts qui reste la source de `SEGMENT_KM`. Ce fichier-ci ne
// sert qu'à la géométrie : où est le nord, dans quelle direction on roule, sous
// quel relèvement se tient un repère. Somme des cordes de cette table :
// 33.00 km, contre 34,5 km de kilométrage - l'écart est le prix des
// virages, et tests/tokyoGeo.test.ts le borne.

export interface GeoStation {
  /** Index dans src/data/stations.ts (0 = Tokyo). */
  index: number;
  jy: string;
  name: string;
  lon: number;
  lat: number;
  /** Est, en mètres depuis Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis Tokyo (convention de scène). */
  z: number;
}

export interface GeoLandmark {
  id: string;
  name: string;
  lon: number;
  lat: number;
  x: number;
  z: number;
  /** Hauteur de structure (m). */
  height: number;
  /** Famille de silhouette (voir three/city/FarSkyline). */
  shape: 'tower' | 'twin' | 'needle' | 'mountain' | 'bridge';
}

/** Un sommet de la polyligne de la boucle. `station` vaut −1 hors des gares. */
export interface GeoShapePoint {
  station: number;
  x: number;
  z: number;
}

export const GEO_STATIONS: readonly GeoStation[] = [
  { index: 0, jy: 'JY01', name: 'Tokyo', lon: 139.76679, lat: 35.68123, x: 0, z: 0 },
  { index: 1, jy: 'JY02', name: 'Kanda', lon: 139.77088, lat: 35.69169, x: 367, z: -1161.5 },
  { index: 2, jy: 'JY03', name: 'Akihabara', lon: 139.77313, lat: 35.6984, x: 568.6, z: -1906.5 },
  { index: 3, jy: 'JY04', name: 'Okachimachi', lon: 139.77475, lat: 35.70745, x: 712.4, z: -2910.9 },
  { index: 4, jy: 'JY05', name: 'Ueno', lon: 139.7772, lat: 35.7138, x: 932.1, z: -3616 },
  { index: 5, jy: 'JY06', name: 'Uguisudani', lon: 139.7784, lat: 35.72125, x: 1038.3, z: -4442.8 },
  { index: 6, jy: 'JY07', name: 'Nippori', lon: 139.7707, lat: 35.728, x: 339.6, z: -5189.8 },
  { index: 7, jy: 'JY08', name: 'Nishi-Nippori', lon: 139.7667, lat: 35.73215, x: -23.5, z: -5649.2 },
  { index: 8, jy: 'JY09', name: 'Tabata', lon: 139.7608, lat: 35.738, x: -558.9, z: -6296.8 },
  { index: 9, jy: 'JY10', name: 'Komagome', lon: 139.7481, lat: 35.7366, x: -1707.3, z: -6138.5 },
  { index: 10, jy: 'JY11', name: 'Sugamo', lon: 139.7393, lat: 35.73352, x: -2502.4, z: -5794.8 },
  { index: 11, jy: 'JY12', name: 'Otsuka', lon: 139.72855, lat: 35.73147, x: -3474.3, z: -5565 },
  { index: 12, jy: 'JY13', name: 'Ikebukuro', lon: 139.7104, lat: 35.7295, x: -5115.7, z: -5342.8 },
  { index: 13, jy: 'JY14', name: 'Mejiro', lon: 139.7062, lat: 35.7211, x: -5493.7, z: -4410.1 },
  { index: 14, jy: 'JY15', name: 'Takadanobaba', lon: 139.7038, lat: 35.7127, x: -5708.9, z: -3477.7 },
  { index: 15, jy: 'JY16', name: 'Shin-Okubo', lon: 139.7, lat: 35.70135, x: -6050.1, z: -2217.8 },
  { index: 16, jy: 'JY17', name: 'Shinjuku', lon: 139.70055, lat: 35.6899, x: -5997.8, z: -947.6 },
  { index: 17, jy: 'JY18', name: 'Yoyogi', lon: 139.702, lat: 35.6832, x: -5865, z: -204.6 },
  { index: 18, jy: 'JY19', name: 'Harajuku', lon: 139.70275, lat: 35.6702, x: -5794.1, z: 1237.5 },
  { index: 19, jy: 'JY20', name: 'Shibuya', lon: 139.70165, lat: 35.65845, x: -5891, z: 2541.3 },
  { index: 20, jy: 'JY21', name: 'Ebisu', lon: 139.71005, lat: 35.6467, x: -5127.7, z: 3843.3 },
  { index: 21, jy: 'JY22', name: 'Meguro', lon: 139.7157, lat: 35.63395, x: -4613, z: 5256.7 },
  { index: 22, jy: 'JY23', name: 'Gotanda', lon: 139.7235, lat: 35.6259, x: -3904.5, z: 6148.2 },
  { index: 23, jy: 'JY24', name: 'Osaki', lon: 139.7286, lat: 35.6197, x: -3440.9, z: 6835 },
  { index: 24, jy: 'JY25', name: 'Shinagawa', lon: 139.7387, lat: 35.62855, x: -2528.4, z: 5851 },
  { index: 25, jy: 'JY26', name: 'Takanawa Gateway', lon: 139.7407, lat: 35.6357, x: -2349.2, z: 5057.3 },
  { index: 26, jy: 'JY27', name: 'Tamachi', lon: 139.7476, lat: 35.64565, x: -1727.1, z: 3951.9 },
  { index: 27, jy: 'JY28', name: 'Hamamatsucho', lon: 139.757, lat: 35.6553, x: -878.6, z: 2879.1 },
  { index: 28, jy: 'JY29', name: 'Shimbashi', lon: 139.75855, lat: 35.6661, x: -741.4, z: 1680.6 },
  { index: 29, jy: 'JY30', name: 'Yurakucho', lon: 139.7631, lat: 35.6749, x: -332.1, z: 703.2 },
];

export const GEO_LANDMARKS: readonly GeoLandmark[] = [
  { id: 'skytree', name: '東京スカイツリー Skytree', lon: 139.8107, lat: 35.7101, x: 3964.4, z: -3214.6, height: 634, shape: 'needle' },
  { id: 'tokyo-tower', name: '東京タワー Tour de Tokyo', lon: 139.74543, lat: 35.65858, x: -1927.2, z: 2517.9, height: 333, shape: 'needle' },
  { id: 'azabudai', name: '麻布台ヒルズ森JPタワー Mori JP Tower', lon: 139.7403, lat: 35.6603, x: -2392.1, z: 2328.2, height: 325, shape: 'tower' },
  { id: 'toranomon', name: '虎ノ門ヒルズ Toranomon Hills', lon: 139.7495, lat: 35.6669, x: -1561, z: 1593.9, height: 256, shape: 'tower' },
  { id: 'midtown', name: '東京ミッドタウン Midtown Tower', lon: 139.7311, lat: 35.6659, x: -3226.5, z: 1708.9, height: 248, shape: 'tower' },
  { id: 'mori-tower', name: '六本木ヒルズ森タワー Mori Tower', lon: 139.7292, lat: 35.6605, x: -3397.1, z: 2308.4, height: 238, shape: 'tower' },
  { id: 'tocho', name: '東京都庁第一本庁舎 Bureau métropolitain', lon: 139.6917, lat: 35.6896, x: -6798.7, z: -912.7, height: 243, shape: 'twin' },
  { id: 'park-tower', name: '新宿パークタワー Shinjuku Park Tower', lon: 139.6913, lat: 35.6858, x: -6834.1, z: -491.1, height: 235, shape: 'twin' },
  { id: 'sumitomo', name: '新宿住友ビル Sumitomo', lon: 139.6934, lat: 35.6896, x: -6644.8, z: -913, height: 210, shape: 'tower' },
  { id: 'cocoon', name: 'モード学園コクーンタワー Cocoon', lon: 139.697, lat: 35.6903, x: -6319.2, z: -991.3, height: 204, shape: 'tower' },
  { id: 'docomo-yoyogi', name: 'ドコモ代々木ビル NTT Docomo Yoyogi', lon: 139.6994, lat: 35.6849, x: -6100.7, z: -392.7, height: 272, shape: 'needle' },
  { id: 'sunshine60', name: 'サンシャイン60 Sunshine 60', lon: 139.719, lat: 35.729, x: -4337.6, z: -5289, height: 240, shape: 'tower' },
  { id: 'scramble', name: '渋谷スクランブルスクエア Scramble Square', lon: 139.7024, lat: 35.6577, x: -5823, z: 2624.4, height: 230, shape: 'tower' },
  { id: 'rainbow', name: 'レインボーブリッジ Rainbow Bridge', lon: 139.7635, lat: 35.6355, x: -284.2, z: 5074.2, height: 127, shape: 'bridge' },
  { id: 'landmark-tower', name: '横浜ランドマークタワー Yokohama', lon: 139.6317, lat: 35.4549, x: -12194.3, z: 25133.9, height: 296, shape: 'tower' },
  { id: 'fuji', name: '富士山 Mont Fuji', lon: 138.7274, lat: 35.3606, x: -94360.9, z: 35329.2, height: 3776, shape: 'mountain' },
];

/**
 * La boucle comme polyligne fermée : les trente gares, plus les points de forme
 * des tronçons qui ne vont pas droit. Sans ces derniers, une interpolation entre
 * gares coupe les virages et le cap se trompe de vingt degrés au milieu des
 * courbes - donc le relèvement de tous les repères avec lui.
 */
export const GEO_LOOP: readonly GeoShapePoint[] = [
  { station: 0, x: 0, z: 0 },
  { station: 1, x: 367, z: -1161.5 },
  { station: 2, x: 568.6, z: -1906.5 },
  { station: 3, x: 712.4, z: -2910.9 },
  { station: 4, x: 932.1, z: -3616 },
  { station: 5, x: 1038.3, z: -4442.8 },
  { station: 6, x: 339.6, z: -5189.8 },
  { station: 7, x: -23.5, z: -5649.2 },
  { station: 8, x: -558.9, z: -6296.8 },
  { station: -1, x: -993.4, z: -6406.6 },
  { station: -1, x: -1418.2, z: -6272.3 },
  { station: 9, x: -1707.3, z: -6138.5 },
  { station: 10, x: -2502.4, z: -5794.8 },
  { station: 11, x: -3474.3, z: -5565 },
  { station: 12, x: -5115.7, z: -5342.8 },
  { station: 13, x: -5493.7, z: -4410.1 },
  { station: 14, x: -5708.9, z: -3477.7 },
  { station: 15, x: -6050.1, z: -2217.8 },
  { station: 16, x: -5997.8, z: -947.6 },
  { station: 17, x: -5865, z: -204.6 },
  { station: -1, x: -5963.1, z: 505.7 },
  { station: 18, x: -5794.1, z: 1237.5 },
  { station: 19, x: -5891, z: 2541.3 },
  { station: 20, x: -5127.7, z: 3843.3 },
  { station: 21, x: -4613, z: 5256.7 },
  { station: 22, x: -3904.5, z: 6148.2 },
  { station: 23, x: -3440.9, z: 6835 },
  { station: -1, x: -3397.2, z: 6191.4 },
  { station: -1, x: -3289.1, z: 5936 },
  { station: -1, x: -3044.7, z: 5857.7 },
  { station: 24, x: -2528.4, z: 5851 },
  { station: 25, x: -2349.2, z: 5057.3 },
  { station: 26, x: -1727.1, z: 3951.9 },
  { station: 27, x: -878.6, z: 2879.1 },
  { station: 28, x: -741.4, z: 1680.6 },
  { station: 29, x: -332.1, z: 703.2 },
];

/** Longueur de la polyligne ci-dessus (m). Voir l'avertissement en tête. */
export const GEO_LOOP_M = 33002;

/** Longueur de chaque inter-gare telle que la polyligne la donne (m). */
export const GEO_LEG_M: readonly number[] = [
  /* JY01→JY02 */ 1218,
  /* JY02→JY03 */ 772,
  /* JY03→JY04 */ 1015,
  /* JY04→JY05 */ 739,
  /* JY05→JY06 */ 834,
  /* JY06→JY07 */ 1023,
  /* JY07→JY08 */ 586,
  /* JY08→JY09 */ 840,
  /* JY09→JY10 */ 1212,
  /* JY10→JY11 */ 866,
  /* JY11→JY12 */ 999,
  /* JY12→JY13 */ 1657,
  /* JY13→JY14 */ 1007,
  /* JY14→JY15 */ 957,
  /* JY15→JY16 */ 1305,
  /* JY16→JY17 */ 1271,
  /* JY17→JY18 */ 755,
  /* JY18→JY19 */ 1468,
  /* JY19→JY20 */ 1307,
  /* JY20→JY21 */ 1509,
  /* JY21→JY22 */ 1504,
  /* JY22→JY23 */ 1139,
  /* JY23→JY24 */ 829,
  /* JY24→JY25 */ 1695,
  /* JY25→JY26 */ 814,
  /* JY26→JY27 */ 1269,
  /* JY27→JY28 */ 1368,
  /* JY28→JY29 */ 1206,
  /* JY29→JY30 */ 1060,
  /* JY30→JY01 */ 778,
];
