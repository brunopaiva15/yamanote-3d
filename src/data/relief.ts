// Le tour d'horizon : les sommets réels, du MNT du 国土地理院.
//
// GÉNÉRÉ par `node scripts/geo/fetch-dem.mjs` - ne pas éditer à la main.
//
// 出典：国土地理院ウェブサイト · licence 国土地理院コンテンツ利用規約 (réutilisation libre avec mention de la source)
// Jeu daté du 2024-04-01 · DATA_STATIC
//
// La bible décrit une bande de vingt à cinquante kilomètres, et la première
// chose que le relevé y dit est qu'IL N'Y A PAS DE MONTAGNE. Les collines de
// Tama, de Sayama, de Miura et de Bōsō culminent entre cent et deux cents
// mètres ; la vraie montagne commence à cinquante kilomètres, au mont Ōyama
// (1 171 m) et au-delà. La courbure de la Terre fait le reste du tri : depuis
// une vitre à quarante mètres d'altitude, l'horizon est à vingt-trois
// kilomètres, et une colline de cent cinquante mètres à quarante kilomètres
// est DERRIÈRE lui. C'est trois/city/FarRelief qui applique cette règle, une
// fois par image, à la cote réelle du train.
//
// Chaque sommet porte trois nombres qui suffisent à le dessiner : sa position,
// son altitude et sa DEMI-LARGEUR - le rayon où il a perdu la moitié de sa
// hauteur. Ce dernier ne se déduit pas des deux autres : le Fuji perd la
// moitié de ses trois mille mètres en dix kilomètres, une colline de Bōsō perd
// ses cent mètres en cinq cents.

export interface ReliefSummit {
  /** Nom japonais, ou null si aucun sommet nommé d'OSM n'est à moins de 2 km. */
  name: string | null;
  /** Est, en mètres depuis le point d'arrêt de Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le point d'arrêt de Tokyo. */
  z: number;
  /** Altitude orthométrique du sommet (m). */
  altitude: number;
  /** Dénivelée locale sur un rayon de quatre kilomètres (m). */
  relief: number;
  /** Rayon où le sommet a perdu la moitié de sa dénivelée (m). */
  halfWidth: number;
}

export const RELIEF_SUMMITS: readonly ReliefSummit[] = [
  { name: '富士山', x: -94125, z: 34769, altitude: 3692, relief: 2314, halfWidth: 2670 },
  { name: '和名倉山', x: -80714, z: -24338, altitude: 2002, relief: 1447, halfWidth: 3912 },
  { name: '三宝山', x: -93877, z: -26574, altitude: 2433, relief: 1233, halfWidth: 3958 },
  { name: '大洞山', x: -78976, z: -17633, altitude: 1996, relief: 1223, halfWidth: 4470 },
  { name: '蛭ヶ岳', x: -56872, z: 21607, altitude: 1603, relief: 1180, halfWidth: 3306 },
  { name: '両神山', x: -83446, z: -38246, altitude: 1631, relief: 1175, halfWidth: 2608 },
  { name: '雲取山', x: -74257, z: -19371, altitude: 1943, relief: 1159, halfWidth: 3943 },
  { name: '三ツ峠山', x: -86675, z: 14156, altitude: 1702, relief: 1140, halfWidth: 3011 },
  { name: '大室山', x: -63330, z: 18875, altitude: 1507, relief: 1120, halfWidth: 1878 },
  { name: '小金沢山', x: -82453, z: -3974, altitude: 1954, relief: 1103, halfWidth: 3974 },
  { name: '小楢山', x: -99837, z: -11673, altitude: 1665, relief: 1095, halfWidth: 8925 },
  { name: null, x: -88910, z: -14653, altitude: 1720, relief: 1084, halfWidth: 7357 },
  { name: '金峰山', x: -102817, z: -21607, altitude: 2523, relief: 1078, halfWidth: 3151 },
  { name: '唐松尾山', x: -83198, z: -20862, altitude: 2029, relief: 1076, halfWidth: 3477 },
  { name: '大菩薩嶺', x: -83198, z: -7451, altitude: 1979, relief: 1072, halfWidth: 3663 },
  { name: '北奥千丈岳', x: -99092, z: -21110, altitude: 2543, relief: 1067, halfWidth: 3042 },
  { name: '南小太郎山', x: -86178, z: -51160, altitude: 1479, relief: 1054, halfWidth: 3943 },
  { name: '大山', x: -48429, z: 26574, altitude: 1171, relief: 1050, halfWidth: 2266 },
  { name: '明神ヶ岳', x: -64820, z: 44455, altitude: 1129, relief: 1050, halfWidth: 4191 },
  { name: '赤久縄山', x: -83198, z: -51409, altitude: 1459, relief: 1044, halfWidth: 3679 },
  { name: '檜洞丸', x: -60101, z: 22352, altitude: 1523, relief: 1043, halfWidth: 2592 },
  { name: '神山', x: -67800, z: 49670, altitude: 1380, relief: 1039, halfWidth: 2282 },
  { name: '御前山', x: -62088, z: -9934, altitude: 1356, relief: 1030, halfWidth: 2406 },
  { name: '鬼ヶ岳', x: -98844, z: 17633, altitude: 1669, relief: 1020, halfWidth: 2282 },
  { name: '小川山', x: -104308, z: -25580, altitude: 2349, relief: 996, halfWidth: 3011 },
  { name: '御正体山', x: -75747, z: 21358, altitude: 1603, relief: 989, halfWidth: 1847 },
  { name: '越前岳', x: -88413, z: 48925, altitude: 1436, relief: 979, halfWidth: 2468 },
  { name: '高天原山', x: -97354, z: -34769, altitude: 1896, relief: 966, halfWidth: 5991 },
  { name: '鹿留山', x: -80714, z: 21358, altitude: 1537, relief: 959, halfWidth: 2297 },
  { name: '大持山', x: -60349, z: -27567, altitude: 1191, relief: 958, halfWidth: 2701 },
  { name: '柳平', x: -91393, z: 8196, altitude: 1416, relief: 958, halfWidth: 4160 },
  { name: '三頭山 中央峰', x: -68297, z: -6457, altitude: 1482, relief: 955, halfWidth: 2095 },
  { name: null, x: -91642, z: -38246, altitude: 1595, relief: 946, halfWidth: 5169 },
  { name: '水ヶ森', x: -105053, z: -8941, altitude: 1514, relief: 942, halfWidth: 7171 },
  { name: '黒岳', x: -92138, z: 14156, altitude: 1722, relief: 940, halfWidth: 2577 },
  { name: '今倉山・東峰', x: -72022, z: 17633, altitude: 1403, relief: 940, halfWidth: 2297 },
  { name: '西御荷鉾山', x: -76492, z: -52402, altitude: 1231, relief: 935, halfWidth: 3337 },
  { name: '千畳敷', x: -104308, z: 14404, altitude: 1202, relief: 923, halfWidth: 3322 },
  { name: '権現山', x: -67552, z: 1490, altitude: 1231, relief: 911, halfWidth: 3306 },
  { name: '大岳山', x: -57618, z: -9437, altitude: 1181, relief: 905, halfWidth: 2220 },
  { name: '三方分山', x: -105549, z: 19371, altitude: 1350, relief: 898, halfWidth: 6519 },
  { name: '鶏冠山', x: -83943, z: -11921, altitude: 1654, relief: 892, halfWidth: 4160 },
  { name: '芋堀ドッケン', x: -81211, z: -33527, altitude: 1370, relief: 888, halfWidth: 2484 },
  { name: '方塞山', x: -23345, z: -106046, altitude: 1357, relief: 854, halfWidth: 4408 },
  { name: '大洞山', x: -79472, z: 32286, altitude: 1326, relief: 832, halfWidth: 7264 },
  { name: '畦ヶ丸山', x: -66558, z: 22600, altitude: 1221, relief: 831, halfWidth: 5510 },
  { name: '扇山', x: -68297, z: 4967, altitude: 1061, relief: 808, halfWidth: 2189 },
  { name: '烏帽子岳', x: -95615, z: -49174, altitude: 1179, relief: 803, halfWidth: 6519 },
  { name: '根本山', x: -28560, z: -96360, altitude: 1141, relief: 790, halfWidth: 4501 },
  { name: '菰釣山', x: -71525, z: 24090, altitude: 1305, relief: 787, halfWidth: 4470 },
  { name: null, x: -83943, z: -15149, altitude: 1549, relief: 787, halfWidth: 5479 },
  { name: '大マテイ山', x: -76244, z: -6705, altitude: 1373, relief: 776, halfWidth: 2546 },
  { name: '城峯山', x: -68545, z: -46442, altitude: 968, relief: 775, halfWidth: 3042 },
  { name: '筑波山', x: 30299, z: -60598, altitude: 785, relief: 770, halfWidth: 1614 },
  { name: '茅丸', x: -56376, z: 1242, altitude: 957, relief: 754, halfWidth: 2142 },
  { name: null, x: -33031, z: -93380, altitude: 1039, relief: 746, halfWidth: 3772 },
  { name: '玄岳', x: -67055, z: 66310, altitude: 741, relief: 740, halfWidth: 4362 },
  { name: null, x: -69290, z: 31292, altitude: 894, relief: 725, halfWidth: 4051 },
  { name: '雨降山', x: -71028, z: -51409, altitude: 954, relief: 714, halfWidth: 2949 },
  { name: '三境山', x: -31789, z: -97105, altitude: 1068, relief: 700, halfWidth: 3151 },
  { name: '鹿倉山', x: -73760, z: -9934, altitude: 1227, relief: 699, halfWidth: 1428 },
  { name: '丸岳', x: -71277, z: 45448, altitude: 1096, relief: 698, halfWidth: 2064 },
  { name: '父不見山', x: -76989, z: -45448, altitude: 1008, relief: 692, halfWidth: 3120 },
  { name: '丸山', x: -54637, z: -34024, altitude: 904, relief: 688, halfWidth: 2732 },
  { name: '倉岳山', x: -67552, z: 10679, altitude: 898, relief: 664, halfWidth: 4315 },
  { name: '大萱山', x: -31044, z: -102321, altitude: 1086, relief: 624, halfWidth: 3120 },
  { name: '塚山', x: -73512, z: -46690, altitude: 906, relief: 618, halfWidth: 3213 },
  { name: '石割山', x: -77734, z: 25332, altitude: 1367, relief: 616, halfWidth: 2406 },
  { name: '加波山', x: 33527, z: -69538, altitude: 643, relief: 613, halfWidth: 1506 },
  { name: '松生山', x: -58859, z: -4470, altitude: 869, relief: 584, halfWidth: 2685 },
  { name: '九鬼山', x: -74009, z: 11673, altitude: 884, relief: 583, halfWidth: 1692 },
  { name: '仏果山', x: -45945, z: 17881, altitude: 661, relief: 579, halfWidth: 1645 },
  { name: '大桁山', x: -89406, z: -62833, altitude: 774, relief: 571, halfWidth: 1614 },
  { name: '鉢ヶ窪', x: -64323, z: 78727, altitude: 543, relief: 543, halfWidth: 5029 },
  { name: '高川山', x: -78231, z: 10182, altitude: 887, relief: 541, halfWidth: 1195 },
  { name: '鷹谷山', x: -77237, z: -40978, altitude: 869, relief: 538, halfWidth: 1645 },
  { name: '鎌取山', x: -68297, z: -54637, altitude: 675, relief: 532, halfWidth: 3104 },
  { name: '巣雲山', x: -66310, z: 75002, altitude: 529, relief: 522, halfWidth: 5510 },
  { name: '石老山', x: -52154, z: 10679, altitude: 651, relief: 519, halfWidth: 1335 },
  { name: '皇鈴山', x: -54886, z: -43213, altitude: 620, relief: 514, halfWidth: 3027 },
  { name: null, x: -71277, z: -57866, altitude: 625, relief: 491, halfWidth: 1552 },
  { name: null, x: -11176, z: -105549, altitude: 698, relief: 490, halfWidth: 1211 },
  { name: '仙人ヶ岳', x: -33031, z: -83694, altitude: 601, relief: 482, halfWidth: 2592 },
  { name: null, x: -21855, z: -88165, altitude: 621, relief: 474, halfWidth: 1350 },
  { name: null, x: 40730, z: -69290, altitude: 489, relief: 465, halfWidth: 1319 },
  { name: null, x: -17881, z: -89406, altitude: 609, relief: 463, halfWidth: 1987 },
  { name: null, x: -13411, z: -86675, altitude: 545, relief: 452, halfWidth: 1087 },
  { name: '雨巻山', x: 33527, z: -81708, altitude: 491, relief: 438, halfWidth: 1304 },
  { name: null, x: -11424, z: -89406, altitude: 535, relief: 423, halfWidth: 1537 },
  { name: '宝篋山', x: 32534, z: -54141, altitude: 410, relief: 405, halfWidth: 1381 },
  { name: '簑山', x: -58859, z: -41723, altitude: 533, relief: 397, halfWidth: 1180 },
  { name: '陣見山', x: -56872, z: -51657, altitude: 465, relief: 392, halfWidth: 1381 },
  { name: '葛城山', x: -76989, z: 74257, altitude: 382, relief: 381, halfWidth: 1630 },
  { name: null, x: 0, z: -104308, altitude: 520, relief: 375, halfWidth: 1335 },
  { name: '不動山', x: -60598, z: -50664, altitude: 480, relief: 365, halfWidth: 1273 },
  { name: null, x: -29802, z: -77486, altitude: 388, relief: 354, halfWidth: 1133 },
  { name: null, x: -7947, z: -100086, altitude: 500, relief: 349, halfWidth: 916 },
  { name: null, x: 36756, z: -54637, altitude: 356, relief: 347, halfWidth: 1257 },
  { name: '愛宕山', x: 20116, z: 62833, altitude: 368, relief: 335, halfWidth: 1552 },
  { name: '鹿野山', x: 18130, z: 47187, altitude: 351, relief: 334, halfWidth: 1925 },
  { name: '晃石山', x: -8196, z: -75499, altitude: 340, relief: 317, halfWidth: 1366 },
  { name: '清澄山', x: 35514, z: 57121, altitude: 317, relief: 311, halfWidth: 4300 },
  { name: '鷲頭山', x: -79472, z: 68793, altitude: 305, relief: 305, halfWidth: 698 },
  { name: null, x: -52154, z: 40233, altitude: 306, relief: 304, halfWidth: 1459 },
  { name: '国見山', x: 40978, z: -82701, altitude: 348, relief: 304, halfWidth: 1707 },
  { name: '富山', x: 10679, z: 64820, altitude: 289, relief: 289, halfWidth: 761 },
  { name: null, x: 30051, z: -78727, altitude: 320, relief: 280, halfWidth: 1242 },
  { name: null, x: -11424, z: -80466, altitude: 340, relief: 280, halfWidth: 1506 },
  { name: 'ウエノ山', x: 23593, z: 46193, altitude: 299, relief: 278, halfWidth: 1676 },
  { name: '安房高山', x: 23097, z: 58114, altitude: 294, relief: 278, halfWidth: 3989 },
  { name: '御殿山', x: 16143, z: 66061, altitude: 300, relief: 271, halfWidth: 1490 },
  { name: null, x: -22600, z: -78231, altitude: 305, relief: 266, halfWidth: 1180 },
  { name: '嵯峨山', x: 10679, z: 58114, altitude: 256, relief: 252, halfWidth: 1599 },
  { name: '頭高山', x: -52899, z: 36011, altitude: 283, relief: 252, halfWidth: 4315 },
  { name: '鋸山', x: 6705, z: 57866, altitude: 252, relief: 251, halfWidth: 776 },
  { name: '鶏足山', x: 38743, z: -86178, altitude: 363, relief: 249, halfWidth: 1552 },
  { name: '人骨山', x: 15149, z: 60101, altitude: 283, relief: 242, halfWidth: 1785 },
  { name: '高宕山', x: 21607, z: 53892, altitude: 281, relief: 228, halfWidth: 1832 },
  { name: '大坊山', x: -22600, z: -72270, altitude: 238, relief: 217, halfWidth: 1040 },
  { name: '高取山', x: 45945, z: -91642, altitude: 283, relief: 215, halfWidth: 1925 },
  { name: null, x: 26077, z: -77734, altitude: 253, relief: 215, halfWidth: 931 },
  { name: null, x: 32534, z: 46938, altitude: 234, relief: 194, halfWidth: 3818 },
  { name: null, x: 43213, z: -99341, altitude: 221, relief: 193, halfWidth: 978 },
  { name: '御所塚山', x: 31789, z: 40481, altitude: 222, relief: 192, halfWidth: 1304 },
  { name: null, x: 39488, z: -97850, altitude: 223, relief: 187, halfWidth: 869 },
  { name: null, x: -73512, z: -70532, altitude: 273, relief: 187, halfWidth: 3337 },
  { name: '大楠山', x: -12666, z: 47932, altitude: 185, relief: 185, halfWidth: 1428 },
  { name: null, x: -5464, z: -94622, altitude: 282, relief: 185, halfWidth: 823 },
  { name: '鷹取山', x: -44455, z: 38991, altitude: 177, relief: 177, halfWidth: 1397 },
  { name: '高塚山', x: 15894, z: 82453, altitude: 169, relief: 168, halfWidth: 2127 },
  { name: null, x: 25332, z: 50912, altitude: 209, relief: 168, halfWidth: 2732 },
  { name: null, x: 40978, z: 60846, altitude: 165, relief: 164, halfWidth: 3058 },
  { name: null, x: 33527, z: -100582, altitude: 213, relief: 160, halfWidth: 2608 },
  { name: '茶臼山', x: -39736, z: -77237, altitude: 221, relief: 157, halfWidth: 1273 },
  { name: '武山', x: -10182, z: 51160, altitude: 154, relief: 154, halfWidth: 869 },
  { name: '金山', x: -35266, z: -70532, altitude: 184, relief: 154, halfWidth: 761 },
  { name: null, x: 37998, z: 44703, altitude: 205, relief: 149, halfWidth: 3586 },
  { name: '大山', x: 1242, z: 79721, altitude: 148, relief: 148, halfWidth: 807 },
  { name: null, x: 41971, z: -60101, altitude: 147, relief: 142, halfWidth: 605 },
  { name: '三毳山', x: -12418, z: -70532, altitude: 155, relief: 137, halfWidth: 667 },
  { name: null, x: 39985, z: 25829, altitude: 147, relief: 133, halfWidth: 2561 },
  { name: null, x: 40233, z: 35018, altitude: 157, relief: 132, halfWidth: 1118 },
  { name: '崇台山', x: -77734, z: -67800, altitude: 252, relief: 132, halfWidth: 5340 },
  { name: null, x: 47435, z: 51657, altitude: 162, relief: 130, halfWidth: 1319 },
  { name: '大丸山', x: -15646, z: 35514, altitude: 128, relief: 128, halfWidth: 1490 },
  { name: null, x: 36508, z: 29305, altitude: 138, relief: 127, halfWidth: 1490 },
  { name: '大平山', x: -17136, z: 38246, altitude: 125, relief: 124, halfWidth: 1770 },
  { name: '三舟山', x: 11921, z: 42220, altitude: 120, relief: 119, halfWidth: 714 },
  { name: null, x: 8941, z: 46442, altitude: 111, relief: 111, halfWidth: 590 },
  { name: null, x: -27319, z: 5464, altitude: 143, relief: 109, halfWidth: 2095 },
  { name: null, x: 37501, z: -60349, altitude: 112, relief: 105, halfWidth: 605 },
  { name: '鹿田山', x: -44207, z: -79969, altitude: 200, relief: 104, halfWidth: 5821 },
  { name: null, x: 6209, z: 85185, altitude: 103, relief: 103, halfWidth: 823 },
  { name: '物見山', x: -36508, z: -35266, altitude: 115, relief: 95, halfWidth: 1630 },
  { name: null, x: 55631, z: -93877, altitude: 107, relief: 95, halfWidth: 1940 },
  { name: '六道山', x: -36508, z: -10679, altitude: 180, relief: 85, halfWidth: 4067 },
];
