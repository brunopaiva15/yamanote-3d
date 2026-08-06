// Les masses urbaines de Tokyo, entre le ruban et l'horizon.
//
// GÉNÉRÉ par `node scripts/geo/fetch-sectors.mjs` - ne pas éditer à la main.
//
// © les contributeurs OpenStreetMap · OpenStreetMap
// Licence ODbL 1.0 · jeu daté du 2026-08-06 · DATA_STATIC
// Altitudes : 出典：国土地理院 (2024-04-01)
//
// Ce qu'il y a ici : 51 amas de tours entre 500 m et 20 km de la voie
// (12 sous le kilomètre, 30 entre 1 et 5 km, 4 entre 5 et 10, 5 entre 10 et 20).
// Chacun porte le nom du secteur d'OpenStreetMap dans lequel il tombe, mais sa
// GÉOMÉTRIE ne vient pas de ce nom : elle vient des bâtiments eux-mêmes.
//
//   position   barycentre des bâtiments de plus de 55 m étiquetés `height`
//   largeur    leur dispersion quadratique moyenne, au moins 200 m
//   faîte      leur percentile 0.85
//   sol        MNT du 国土地理院 au barycentre
//
// Les plus hautes :
//   麻布台          1.4 km  faîte    301 m  plus haut  332.6 m
//   高島          19.7 km  faîte    153 m  plus haut  295.8 m
//   西新橋          0.7 km  faîte  221.6 m  plus haut  265.8 m
//   赤坂           2.2 km  faîte  248.1 m  plus haut  248.1 m
//   六本木          2.3 km  faîte    238 m  plus haut    238 m
//   西新宿          0.5 km  faîte    174 m  plus haut    234 m
//   湊            1.7 km  faîte    187 m  plus haut    220 m
//   虎ノ門          1.4 km  faîte  188.7 m  plus haut  205.1 m
//
// CE QUI N'EST PAS ICI, ET POURQUOI. Deux raisons, et il faut les distinguer.
//
// La première est un FAIT : sur 1226 secteurs nommés à moins de vingt
// kilomètres, la plupart sont du tissu bas. Ils disparaissent derrière le
// premier immeuble venu et ne se voient donc pas d'un train. Leur marquage est
// dans data/geo/sectors.json, résolus mais sans amas.
//
// La seconde est un MANQUE dans la source, et il ne se comble pas en inventant.
// Sunshine 60 à Ikebukuro et le Scramble Square à Shibuya ne portent pas
// d'étiquette `height` dans OpenStreetMap : leurs amas n'existent pas ici, et
// les secteurs correspondants sont marqués `unresolved` plutôt que dotés d'une
// hauteur plausible. C'est la règle 11 de la bible, et elle coûte ce qu'elle
// coûte - le jour où la source les portera, l'import les posera tout seul.

/** Un amas de tours, vu de la boucle. */
export interface Sector {
  /**
   * Identifiant stable, tiré du LIEU et non du rang dans la liste : deux
   * imports successifs rendent le même, et deux versions sont comparables.
   */
  id: string;
  /**
   * Nom japonais du secteur qui porte l'amas, et sa transcription quand elle
   * existe. `null` quand aucun secteur nommé ne tombe dessus : l'amas est
   * relevé et se voit, il n'a simplement pas de nom dans OpenStreetMap.
   */
  name: string | null;
  nameEn: string | null;
  /** `city`, `borough`, `town`, `suburb`, `quarter` ou null. */
  rank: string | null;
  /** Est, en mètres depuis le point d'arrêt de Tokyo. Barycentre des tours. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le point d'arrêt de Tokyo. */
  z: number;
  /** Distance de l'amas à la voie la plus proche (m). */
  distance: number;
  /** Bande de la bible : 0 = moins d'un km, 1 = 1-5, 2 = 5-10, 3 = 10-20. */
  band: 0 | 1 | 2 | 3;
  /** Demi-largeur de l'amas (m) : la dispersion de ses tours. */
  radius: number;
  /** Ligne de faîte (m au-dessus du sol). */
  height: number;
  /** La plus haute tour relevée de l'amas (m). */
  tallest: number;
  /** Combien de tours de plus de 55 m ont servi à la mesurer. */
  tall: number;
  /** Altitude du sol au MNT (m), ou null hors couverture. */
  elevation: number | null;
}

/** Les amas, du plus proche au plus lointain. */
export const SECTORS: readonly Sector[] = [
  { id: 'mass--6530--989', name: '西新宿', nameEn: 'Nishi-Shinjuku', rank: 'quarter', x: -6530, z: -988.8, distance: 508, band: 0, radius: 758, height: 174, tallest: 234, tall: 70, elevation: 39.4 },
  { id: 'mass--1239-2151', name: '新橋', nameEn: 'Shinbashi', rank: 'quarter', x: -1239.2, z: 2150.7, distance: 520, band: 0, radius: 304, height: 128.1, tallest: 128.1, tall: 5, elevation: 4.2 },
  { id: 'mass--2009-6700', name: '港南', nameEn: 'Kōnan', rank: 'quarter', x: -2009.5, z: 6700.3, distance: 584, band: 0, radius: 304, height: 59.8, tallest: 59.8, tall: 4, elevation: 2.3 },
  { id: 'mass--4364-4031', name: '恵比寿', nameEn: 'Ebisu', rank: 'quarter', x: -4364.2, z: 4031, distance: 597, band: 0, radius: 512, height: 113, tallest: 113, tall: 5, elevation: 20.9 },
  { id: 'mass--1435-1374', name: '西新橋', nameEn: 'Nishi-Shinbashi', rank: 'quarter', x: -1435.4, z: 1373.8, distance: 673, band: 0, radius: 342, height: 221.6, tallest: 265.8, tall: 20, elevation: 4.9 },
  { id: 'mass--1480-4636', name: '海岸', nameEn: 'Kaigan', rank: 'quarter', x: -1480.3, z: 4636.1, distance: 676, band: 0, radius: 200, height: 169, tallest: 169, tall: 5, elevation: 3.3 },
  { id: 'mass--145--1963', name: '神田駿河台', nameEn: 'Kanda-Surugadai', rank: 'quarter', x: -145.2, z: -1963.1, distance: 726, band: 0, radius: 505, height: 97, tallest: 99.7, tall: 8, elevation: 12.5 },
  { id: 'mass--404--1367', name: '一ツ橋', nameEn: 'Hitotsubashi', rank: 'quarter', x: -404.4, z: -1367.3, distance: 821, band: 0, radius: 347, height: 111.9, tallest: 120.8, tall: 10, elevation: 6.1 },
  { id: 'mass--4861-872', name: '北青山', nameEn: 'Kita-Aoyama', rank: 'quarter', x: -4861, z: 871.7, distance: 826, band: 0, radius: 377, height: 115.3, tallest: 115.3, tall: 4, elevation: 29.3 },
  { id: 'mass--2944-4119', name: '白金', nameEn: 'Shirokane', rank: 'quarter', x: -2944.4, z: 4119.4, distance: 866, band: 0, radius: 200, height: 156.1, tallest: 156.1, tall: 5, elevation: 9.7 },
  { id: 'mass--3163-4789', name: '高輪', nameEn: 'Takanawa', rank: 'quarter', x: -3163.5, z: 4788.9, distance: 872, band: 0, radius: 201, height: 149, tallest: 149, tall: 3, elevation: 19.9 },
  { id: 'mass--2114-3146', name: '東麻布', nameEn: 'Higashi-Azabu', rank: 'quarter', x: -2113.6, z: 3146.3, distance: 896, band: 0, radius: 200, height: 78.8, tallest: 78.8, tall: 3, elevation: 9.5 },
  { id: 'mass--1490-6619', name: '港南', nameEn: 'Kōnan', rank: 'quarter', x: -1490.1, z: 6618.7, distance: 1073, band: 1, radius: 200, height: 121, tallest: 123, tall: 10, elevation: 0.8 },
  { id: 'mass--1410-5857', name: '港南', nameEn: 'Kōnan', rank: 'quarter', x: -1410.2, z: 5857.4, distance: 1121, band: 1, radius: 229, height: 140, tallest: 140, tall: 4, elevation: 1.3 },
  { id: 'mass--4685-1478', name: '北青山', nameEn: 'Kita-Aoyama', rank: 'quarter', x: -4685.3, z: 1477.6, distance: 1133, band: 1, radius: 200, height: 101.5, tallest: 101.5, tall: 5, elevation: 33.4 },
  { id: 'mass--3205-8329', name: '東大井', nameEn: 'Higashi-Ōi', rank: 'quarter', x: -3205.2, z: 8328.6, distance: 1187, band: 1, radius: 200, height: 104, tallest: 104, tall: 4, elevation: 13.7 },
  { id: 'mass--4305-2488', name: '西麻布', nameEn: 'Nishi-Azabu', rank: 'quarter', x: -4305.1, z: 2487.6, distance: 1336, band: 1, radius: 200, height: 108, tallest: 108, tall: 3, elevation: 30.1 },
  { id: 'mass--2118-2299', name: '麻布台', nameEn: 'Azabudai', rank: 'quarter', x: -2117.7, z: 2299, distance: 1360, band: 1, radius: 378, height: 301, tallest: 332.6, tall: 23, elevation: 18.6 },
  { id: 'mass--3857--7186', name: '滝野川', nameEn: 'Takinogawa', rank: 'quarter', x: -3856.9, z: -7185.8, distance: 1403, band: 1, radius: 268, height: 103, tallest: 103, tall: 3, elevation: 25.3 },
  { id: 'mass--2218-1460', name: '虎ノ門', nameEn: 'Toranomon', rank: 'quarter', x: -2218.4, z: 1460.1, distance: 1447, band: 1, radius: 469, height: 188.7, tallest: 205.1, tall: 18, elevation: 22.1 },
  { id: 'mass--1557-7934', name: '東大井', nameEn: 'Higashi-Ōi', rank: 'quarter', x: -1556.9, z: 7933.7, distance: 1488, band: 1, radius: 200, height: 102, tallest: 102, tall: 3, elevation: 4.4 },
  { id: 'mass-661-3278', name: '晴海', nameEn: 'Harumi', rank: 'quarter', x: 661.2, z: 3278, distance: 1561, band: 1, radius: 362, height: 178.8, tallest: 194.5, tall: 7, elevation: 0.4 },
  { id: 'mass-2261--2221', name: '蔵前', nameEn: 'Kuramae', rank: 'quarter', x: 2261.1, z: -2220.7, distance: 1611, band: 1, radius: 523, height: 108, tallest: 108, tall: 6, elevation: 2.2 },
  { id: 'mass-1415-1258', name: '湊', nameEn: 'Minato', rank: 'quarter', x: 1415.4, z: 1258.4, distance: 1733, band: 1, radius: 597, height: 187, tallest: 220, tall: 7, elevation: 1.9 },
  { id: 'mass--1395--1843', name: '飯田橋', nameEn: 'Iidabashi', rank: 'quarter', x: -1395.4, z: -1843.1, distance: 1913, band: 1, radius: 438, height: 100, tallest: 155, tall: 7, elevation: 9.3 },
  { id: 'mass--3767-1140', name: '南青山', nameEn: 'Minami-Aoyama', rank: 'quarter', x: -3767.1, z: 1139.9, distance: 1952, band: 1, radius: 246, height: 173, tallest: 173, tall: 6, elevation: 29.9 },
  { id: 'mass--2494-365', name: '平河町', nameEn: 'Hirakawachō', rank: 'quarter', x: -2494.4, z: 364.7, distance: 2009, band: 1, radius: 303, height: 177.7, tallest: 177.7, tall: 3, elevation: 20.8 },
  { id: 'mass--1280--3079', name: '春日', nameEn: 'Kasuga', rank: 'quarter', x: -1280.1, z: -3079.4, distance: 2010, band: 1, radius: 200, height: 148.4, tallest: 148.4, tall: 4, elevation: 9.3 },
  { id: 'mass-1214-3273', name: '晴海', nameEn: 'Harumi', rank: 'quarter', x: 1213.9, z: 3273.4, distance: 2100, band: 1, radius: 512, height: 167.6, tallest: 177.3, tall: 14, elevation: 0.6 },
  { id: 'mass-3119--3206', name: '花川戸', nameEn: 'Hanakawado', rank: 'quarter', x: 3119, z: -3206.3, distance: 2138, band: 1, radius: 200, height: 95.1, tallest: 95.1, tall: 3, elevation: 2.1 },
  { id: 'mass--3006-1482', name: '赤坂', nameEn: 'Akasaka', rank: 'quarter', x: -3005.7, z: 1481.5, distance: 2233, band: 1, radius: 352, height: 248.1, tallest: 248.1, tall: 5, elevation: 17.8 },
  { id: 'mass--3131-2110', name: '六本木', nameEn: 'Roppongi', rank: 'quarter', x: -3130.6, z: 2110.2, distance: 2311, band: 1, radius: 237, height: 238, tallest: 238, tall: 5, elevation: 28.7 },
  { id: 'mass--2447--528', name: '麹町', nameEn: 'Kōjimachi', rank: 'quarter', x: -2446.8, z: -528.2, distance: 2402, band: 1, radius: 344, height: 89.9, tallest: 89.9, tall: 5, elevation: 25.2 },
  { id: 'mass--2926-339', name: '元赤坂', nameEn: 'Moto-Akasaka', rank: 'quarter', x: -2926, z: 338.7, distance: 2412, band: 1, radius: 276, height: 158, tallest: 158, tall: 6, elevation: 17.7 },
  { id: 'mass--2971--551', name: '麹町', nameEn: 'Kōjimachi', rank: 'quarter', x: -2970.6, z: -551.5, distance: 2836, band: 1, radius: 437, height: 130, tallest: 144.7, tall: 8, elevation: 18.6 },
  { id: 'mass--2974-10272', name: '東大井', nameEn: 'Minami-Ōi', rank: 'quarter', x: -2974.3, z: 10271.8, distance: 3121, band: 1, radius: 254, height: 79.6, tallest: 79.6, tall: 3, elevation: 2.3 },
  { id: 'mass-1413-5412', name: '有明', nameEn: 'Ariake', rank: 'quarter', x: 1412.6, z: 5412.2, distance: 3125, band: 1, radius: 728, height: 119.4, tallest: 130, tall: 14, elevation: null },
  { id: 'mass-2432-2449', name: '豊洲', nameEn: 'Toyosu', rank: 'quarter', x: 2432.3, z: 2449.2, distance: 3163, band: 1, radius: 241, height: 140, tallest: 180, tall: 11, elevation: 2.2 },
  { id: 'mass--9338--2733', name: '中野', nameEn: 'Nakano', rank: 'quarter', x: -9337.9, z: -2733.2, distance: 3367, band: 1, radius: 298, height: 115.8, tallest: 146.8, tall: 10, elevation: 39.5 },
  { id: 'mass-2555-3104', name: '豊洲', nameEn: 'Toyosu', rank: 'quarter', x: 2555.2, z: 3103.8, distance: 3380, band: 1, radius: 290, height: 180.5, tallest: 180.5, tall: 6, elevation: 2.5 },
  { id: 'mass-2898-2570', name: '枝川', nameEn: 'Edagawa', rank: 'quarter', x: 2898.2, z: 2570, distance: 3638, band: 1, radius: 200, height: 180, tallest: 180, tall: 3, elevation: 4.5 },
  { id: 'mass-2985-2902', name: '豊洲', nameEn: 'Toyosu', rank: 'quarter', x: 2984.7, z: 2901.9, distance: 3766, band: 1, radius: 254, height: 150, tallest: 150, tall: 6, elevation: 4.3 },
  { id: 'mass--9604-11820', name: '中原区', nameEn: 'Nakahara Ward', rank: 'suburb', x: -9603.8, z: 11819.7, distance: 7920, band: 2, radius: 308, height: 178.9, tallest: 203.5, tall: 21, elevation: 5.3 },
  { id: 'mass--12319-7921', name: '玉川', nameEn: 'Tamagawa', rank: 'quarter', x: -12319.3, z: 7921.3, distance: 8153, band: 2, radius: 200, height: 137, tallest: 137, tall: 5, elevation: 11.7 },
  { id: 'mass--4758-16155', name: '中島', nameEn: 'Nakajima', rank: 'quarter', x: -4757.7, z: 16154.5, distance: 9161, band: 2, radius: 200, height: 96.2, tallest: 96.2, tall: 3, elevation: 3.4 },
  { id: 'mass--6046-16594', name: '川崎区', nameEn: 'Kawasaki Ward', rank: 'suburb', x: -6046.3, z: 16593.9, distance: 9896, band: 2, radius: 419, height: 111.6, tallest: 135, tall: 10, elevation: 2.6 },
  { id: 'mass--11001-15074', name: '日吉', nameEn: 'Hiyoshi', rank: 'quarter', x: -11000.8, z: 15074, distance: 11137, band: 3, radius: 200, height: 60, tallest: 60, tall: 3, elevation: 4.6 },
  { id: 'mass--12325-23873', name: '高島', nameEn: 'Takashima', rank: 'quarter', x: -12325.1, z: 23872.9, distance: 19087, band: 3, radius: 303, height: 140, tallest: 150, tall: 15, elevation: 4.1 },
  { id: 'mass--12152--23628', name: '大字上落合', nameEn: 'Kami-Ochiai', rank: 'quarter', x: -12151.7, z: -23627.6, distance: 19251, band: 3, radius: 328, height: 168.3, tallest: 168.3, tall: 6, elevation: 10.4 },
  { id: 'mass--12999-23917', name: '南幸', nameEn: 'Minami-Saiwai', rank: 'quarter', x: -12998.7, z: 23916.5, distance: 19455, band: 3, radius: 330, height: 152.6, tallest: 178, tall: 13, elevation: 7.5 },
  { id: 'mass--12218-24666', name: '高島', nameEn: 'Takashima', rank: 'quarter', x: -12217.7, z: 24665.8, distance: 19738, band: 3, radius: 332, height: 153, tallest: 295.8, tall: 37, elevation: 2.8 },
];

/** Les cinq rayons de la bible (m), tels que le document les pose. */
export const SECTOR_BANDS = [1000, 5000, 10000, 20000, 50000] as const;

/** Au-delà, aucun amas n'est dessiné : c'est le domaine du relief régional. */
export const SECTOR_DRAW_MAX = 20000;

/** Hauteur au-dessous de laquelle un bâtiment ne compte pas dans un amas (m). */
export const SECTOR_TALL_MIN = 55;
