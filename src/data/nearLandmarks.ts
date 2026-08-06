// Les repères RÉELS du bord de voie : ce qu'on peut aller vérifier.
//
// GÉNÉRÉ par `node scripts/geo/fetch-near.mjs` - ne pas éditer à la main.
//
// © les contributeurs OpenStreetMap · OpenStreetMap
// Licence ODbL 1.0 · jeu daté du 2026-08-05 · DATA_STATIC
//
// La règle 12 de la bible géographique dit qu'un repère est ce qu'on peut
// retrouver sur une carte. Ce fichier ne contient donc que des objets qui y
// sont : 110 au plus un par gare et par famille, tirés des 1245 objets réels
// relevés à moins de deux kilomètres de la voie, et 108 d'entre eux portent une
// fiche Wikidata. Chacun garde son identifiant OpenStreetMap : on peut ouvrir
// la carte et regarder.
//
// CE QUE CE FICHIER A REMPLACÉ. src/data/districts.ts posait des « repères » à
// une abscisse arbitraire de trente-quatre mètres et d'un côté choisi à la
// main. Ici, le côté et la distance sont ceux du terrain : le Musée national
// est au nord-ouest d'Ueno, il passe donc à gauche en 内回り et à droite en
// 外回り, tout seul, parce que c'est là qu'il est.
//
// Ce qui reste dans districts.ts est du TISSU, marqué comme tel : des
// silhouettes de bureaux, d'écrans et d'enseignes qui donnent le caractère d'un
// quartier sans prétendre nommer quoi que ce soit.

/** La famille d'un repère réel, qui décide de la silhouette qui le porte. */
export type NearFamily = 'museum' | 'worship' | 'park' | 'historic';

export interface NearLandmark {
  /** Identifiant stable : le type et le numéro de l'objet OpenStreetMap. */
  id: string;
  /** Nom japonais tel qu'OSM le porte, et sa transcription quand elle existe. */
  name: string;
  nameEn: string | null;
  family: NearFamily;
  /** Fiche Wikidata, quand l'objet en a une. C'est notre critère de notoriété. */
  wikidata: string | null;
  /** Est, en mètres depuis le point d'arrêt de Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le point d'arrêt de Tokyo. */
  z: number;
  /** Distance à l'axe relevé des voies (m). */
  distance: number;
  /** Gare de rattachement (index 0..29), et distance à son point d'arrêt (m). */
  station: number;
  fromStation: number;
}

export const NEAR_LANDMARKS: readonly NearLandmark[] = [
  { id: 'osm-node-13564912583', name: 'ヤン・ヨーステン記念像', nameEn: 'Jan Joosten van Lodensteijn Memorial Statue (B1)', family: 'historic', wikidata: 'Q599058', x: 176.6, z: 146.5, distance: 212, station: 0, fromStation: 229 },
  { id: 'osm-node-3164340661', name: '東京ステーションギャラリー', nameEn: 'Tokyo Station Gallery', family: 'museum', wikidata: 'Q115265693', x: -6.5, z: -130.3, distance: 46, station: 0, fromStation: 130 },
  { id: 'osm-way-558521992', name: 'OOTEMORI', nameEn: 'Otemori', family: 'park', wikidata: 'Q112255588', x: -124.3, z: -474, distance: 273, station: 0, fromStation: 490 },
  { id: 'osm-node-3485535297', name: '智泉院', nameEn: 'Chisen-in Temple', family: 'worship', wikidata: 'Q106836711', x: 1154, z: 33.9, distance: 1099, station: 0, fromStation: 1154 },
  { id: 'osm-way-43935790', name: '清水門', nameEn: 'Shimizu Gate', family: 'historic', wikidata: 'Q28685861', x: -1270.5, z: -1270.4, distance: 1612, station: 1, fromStation: 1669 },
  { id: 'osm-node-6026372096', name: '第一三共くすりミュージアム', nameEn: 'Daiichi Sankyo Kusuri Museum', family: 'museum', wikidata: 'Q17224188', x: 822.1, z: -801.4, distance: 521, station: 1, fromStation: 563 },
  { id: 'osm-way-515133705', name: '神田児童公園', nameEn: null, family: 'park', wikidata: 'Q42311502', x: 120.8, z: -1296.7, distance: 302, station: 1, fromStation: 303 },
  { id: 'osm-way-504553390', name: '佐竹稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q113667160', x: 254.9, z: -1100.8, distance: 112, station: 1, fromStation: 156 },
  { id: 'osm-node-4014267002', name: '玄武館道場跡', nameEn: 'The Site of Genbukandojo Gym', family: 'historic', wikidata: 'Q11572297', x: 702.5, z: -1551.6, distance: 170, station: 2, fromStation: 369 },
  { id: 'osm-node-1420781347', name: '明治大学博物館', nameEn: 'Meiji University Museum', family: 'museum', wikidata: 'Q85880847', x: -404.4, z: -1934.1, distance: 981, station: 2, fromStation: 983 },
  { id: 'osm-way-332338650', name: '淡路公園', nameEn: 'Awaji Pocket Park', family: 'park', wikidata: 'Q42311503', x: 36.7, z: -1764.6, distance: 525, station: 2, fromStation: 558 },
  { id: 'osm-way-46983897', name: '柳森神社', nameEn: 'Yanagimori Jinja Shrine', family: 'worship', wikidata: 'Q55532885', x: 619.3, z: -1718.8, distance: 58, station: 2, fromStation: 185 },
  { id: 'osm-way-240891310', name: '赤門', nameEn: 'Red Gate', family: 'historic', wikidata: 'Q48807898', x: -570.6, z: -3254.5, distance: 1293, station: 3, fromStation: 1352 },
  { id: 'osm-way-145344198', name: 'したまちミュージアム', nameEn: 'Shitamachi Museum', family: 'museum', wikidata: 'Q3915464', x: 550.9, z: -3216.9, distance: 174, station: 3, fromStation: 401 },
  { id: 'osm-way-505256902', name: '御徒町公園', nameEn: 'Okachimachi Park', family: 'park', wikidata: 'Q42311721', x: 979.1, z: -2787.3, distance: 265, station: 3, fromStation: 267 },
  { id: 'osm-way-530688843', name: '徳大寺', nameEn: 'Tokudai-ji', family: 'worship', wikidata: 'Q11489567', x: 710.9, z: -3036.9, distance: 33, station: 3, fromStation: 184 },
  { id: 'osm-node-5906019305', name: '摺鉢山古墳', nameEn: 'Mount Suribachi Kofun', family: 'historic', wikidata: 'Q17220560', x: 657.9, z: -3612.2, distance: 181, station: 4, fromStation: 195 },
  { id: 'osm-node-441655802', name: '上野の森美術館', nameEn: 'The Ueno Royal Museum', family: 'museum', wikidata: 'Q11360245', x: 732.8, z: -3507.4, distance: 65, station: 4, fromStation: 145 },
  { id: 'osm-relation-5413419', name: '上野公園', nameEn: 'Ueno Zoological Gardens', family: 'park', wikidata: 'Q746216', x: 596.4, z: -3779.6, distance: 316, station: 4, fromStation: 318 },
  { id: 'osm-way-138585452', name: '清水観音堂', nameEn: 'Kiyomizu Kannon-dō', family: 'worship', wikidata: 'Q99541117', x: 621.9, z: -3492.2, distance: 156, station: 4, fromStation: 250 },
  { id: 'osm-way-1482037983', name: '厳有院霊廟水盤舎', nameEn: 'Water Basin Pavilion of the Gen’yū‑in Mausoleum', family: 'historic', wikidata: 'Q11410144', x: 1003.6, z: -4365, distance: 86, station: 5, fromStation: 125 },
  { id: 'osm-way-33439660', name: '東京国立博物館', nameEn: 'Tokyo National Museum', family: 'museum', wikidata: 'Q653433', x: 825.9, z: -4197, distance: 329, station: 5, fromStation: 348 },
  { id: 'osm-way-586063797', name: '東盛公園', nameEn: 'Tousei Park', family: 'park', wikidata: 'Q42311697', x: 2363.4, z: -5244.5, distance: 1527, station: 5, fromStation: 1546 },
  { id: 'osm-way-243433345', name: '元三島神社', nameEn: 'Moto-Mishima-jinja Shrine', family: 'worship', wikidata: 'Q106852471', x: 1015, z: -4574.2, distance: 60, station: 5, fromStation: 85 },
  { id: 'osm-node-4218532821', name: '谷中五重塔跡地', nameEn: 'Site of Five-storied Pagoda', family: 'historic', wikidata: 'Q8048250', x: 371.1, z: -4883.9, distance: 189, station: 6, fromStation: 302 },
  { id: 'osm-way-209190478', name: '台東区立朝倉彫塑館', nameEn: 'Asakura Museum of Sculpture', family: 'museum', wikidata: 'Q11517304', x: 163.4, z: -5054.1, distance: 212, station: 6, fromStation: 214 },
  { id: 'osm-way-45738210', name: '岡倉天心 記念公園', nameEn: 'Okakura Tenshin Memorial Park', family: 'park', wikidata: 'Q42311758', x: -28.1, z: -5000.4, distance: 389, station: 6, fromStation: 405 },
  { id: 'osm-way-162043813', name: '本行寺', nameEn: 'Hongyōji Temple', family: 'worship', wikidata: 'Q11520798', x: 246.7, z: -5217.9, distance: 39, station: 6, fromStation: 93 },
  { id: 'osm-node-5898813824', name: '吉村昭記念文学館', nameEn: 'Yoshimura Akira Memorial Museum of Literature', family: 'museum', wikidata: 'Q38277897', x: 1543.5, z: -6449.7, distance: 1738, station: 7, fromStation: 1745 },
  { id: 'osm-way-162043806', name: '西日暮里公園', nameEn: 'Nishi-Nippori Park', family: 'park', wikidata: 'Q42312353', x: -25, z: -5575.3, distance: 53, station: 7, fromStation: 77 },
  { id: 'osm-way-162043809', name: '青雲寺', nameEn: 'Shoun-ji Temple', family: 'worship', wikidata: 'Q97216427', x: -65, z: -5538, distance: 106, station: 7, fromStation: 126 },
  { id: 'osm-way-562839824', name: '都電6000系', nameEn: null, family: 'historic', wikidata: null, x: -1069.4, z: -5745.7, distance: 678, station: 8, fromStation: 776 },
  { id: 'osm-node-1420790123', name: '田端文士村記念館', nameEn: 'TABATA Memorial Museum of Writers and Artists', family: 'museum', wikidata: 'Q11577225', x: -677.8, z: -6345.9, distance: 72, station: 8, fromStation: 252 },
  { id: 'osm-way-176649941', name: '田端台公園', nameEn: 'Tabatadai Park', family: 'park', wikidata: 'Q42312448', x: -258.5, z: -5932.4, distance: 47, station: 8, fromStation: 352 },
  { id: 'osm-node-6193169764', name: '明月寺', nameEn: null, family: 'worship', wikidata: 'Q106646405', x: -448.5, z: -6129.4, distance: 59, station: 8, fromStation: 94 },
  { id: 'osm-way-249498496', name: '六義園', nameEn: 'Rikugi Garden', family: 'historic', wikidata: 'Q1889010', x: -1839.4, z: -5762.7, distance: 294, station: 9, fromStation: 376 },
  { id: 'osm-way-334122306', name: '渋沢史料館', nameEn: 'Shibusawa Memorial Museum', family: 'museum', wikidata: 'Q11254595', x: -2493.6, z: -7525.8, distance: 1575, station: 9, fromStation: 1575 },
  { id: 'osm-way-162567679', name: '染井吉野桜記念公園', nameEn: 'Somei Yoshino Cherry Memorial Park', family: 'park', wikidata: 'Q111822282', x: -1798.9, z: -6166.4, distance: 48, station: 9, fromStation: 51 },
  { id: 'osm-way-1347108119', name: '大國神社', nameEn: 'Daikoku Shrine', family: 'worship', wikidata: 'Q97478942', x: -1844.9, z: -6119, distance: 27, station: 9, fromStation: 83 },
  { id: 'osm-way-459173214', name: '東京大学総合研究博物館・小石川分館', nameEn: 'Koishikawa Annex, Museum of Architecture, The University Museum, The University of Tokyo', family: 'museum', wikidata: 'Q3815581', x: -2312.4, z: -4447.6, distance: 1248, station: 10, fromStation: 1335 },
  { id: 'osm-way-493816207', name: '西ヶ原みんなの公園', nameEn: null, family: 'park', wikidata: 'Q21019288', x: -2750.3, z: -6734.4, distance: 985, station: 10, fromStation: 1001 },
  { id: 'osm-way-176206193', name: '真性寺', nameEn: 'Shinshoji Temple', family: 'worship', wikidata: 'Q11583190', x: -2725.8, z: -5876.8, distance: 210, station: 10, fromStation: 278 },
  { id: 'osm-node-13603987511', name: '巣鴨プリズン跡', nameEn: 'Remnant of Sugamo Prison', family: 'historic', wikidata: 'Q699579', x: -4026.9, z: -5045.6, distance: 686, station: 11, fromStation: 786 },
  { id: 'osm-node-1420771074', name: '古代オリエント博物館', nameEn: 'Ancient Orient Museum', family: 'museum', wikidata: 'Q1048740', x: -4138.8, z: -5256.9, distance: 519, station: 11, fromStation: 761 },
  { id: 'osm-way-776489693', name: 'としまみどりの防災公園', nameEn: 'Toshima Midori Disaster Prevention Park', family: 'park', wikidata: 'Q106707534', x: -4019.4, z: -5123.6, distance: 609, station: 11, fromStation: 730 },
  { id: 'osm-node-5266637262', name: '天祖神社', nameEn: 'Tenso-jinja Shrine', family: 'worship', wikidata: 'Q97478945', x: -3527.9, z: -5456.9, distance: 141, station: 11, fromStation: 146 },
  { id: 'osm-node-13603964428', name: '巣鴨拘置所', nameEn: 'Sugamo Prison memorial', family: 'historic', wikidata: 'Q699579', x: -4362.3, z: -5437.8, distance: 416, station: 12, fromStation: 680 },
  { id: 'osm-node-1420798090', name: '豊島区立郷土資料館', nameEn: 'Toshima City Local Museum', family: 'museum', wikidata: 'Q104698258', x: -5427.4, z: -5136.8, distance: 264, station: 12, fromStation: 480 },
  { id: 'osm-way-595622641', name: '池袋西口公園', nameEn: 'Ikebukuro Nishiguchi Park', family: 'park', wikidata: 'Q11552247', x: -5227.7, z: -5405.6, distance: 165, station: 12, fromStation: 186 },
  { id: 'osm-node-5939950286', name: '妙典寺', nameEn: null, family: 'worship', wikidata: 'Q106300704', x: -4798.1, z: -5060.5, distance: 351, station: 12, fromStation: 437 },
  { id: 'osm-way-208656517', name: '霞会館記念学習院ミ', nameEn: 'Gakushin Museum', family: 'museum', wikidata: 'Q11448881', x: -5182.3, z: -4230.7, distance: 303, station: 13, fromStation: 321 },
  { id: 'osm-relation-4671380', name: 'おとめ山公園', nameEn: 'Otomeyama Park', family: 'park', wikidata: 'Q11261964', x: -5855.3, z: -4082.9, distance: 309, station: 13, fromStation: 529 },
  { id: 'osm-way-243647307', name: '観静院', nameEn: 'Kanjoin', family: 'worship', wikidata: 'Q130100531', x: -4796.2, z: -4667.1, distance: 502, station: 13, fromStation: 695 },
  { id: 'osm-way-94117018', name: '早稲田大学大隈記念講堂', nameEn: 'Okuma Auditorium', family: 'historic', wikidata: 'Q2870807', x: -4078.4, z: -3061.6, distance: 1671, station: 14, fromStation: 1671 },
  { id: 'osm-node-13569363447', name: 'アクティブ・ミュージアム「女たちの戦争と平和資料館」（wam）', nameEn: 'Women\'s Active Museum on War and Peace', family: 'museum', wikidata: 'Q11446206', x: -4560.6, z: -2946.4, distance: 1239, station: 14, fromStation: 1254 },
  { id: 'osm-way-94518684', name: '都立戸山公園', nameEn: 'Toyama Park', family: 'park', wikidata: 'Q10950260', x: -5480.2, z: -2785.3, distance: 399, station: 14, fromStation: 721 },
  { id: 'osm-way-96217105', name: '諏訪神社', nameEn: 'Suwa Shrine', family: 'worship', wikidata: 'Q11631928', x: -5336.6, z: -3068.9, distance: 459, station: 14, fromStation: 542 },
  { id: 'osm-node-6589553987', name: 'サムライミュージアム', nameEn: 'Samurai Museum', family: 'museum', wikidata: 'Q116917907', x: -5705.7, z: -1568.6, distance: 379, station: 15, fromStation: 706 },
  { id: 'osm-way-103280980', name: '大久保公園', nameEn: 'Okubo Park', family: 'park', wikidata: 'Q126454791', x: -5907.9, z: -1777.8, distance: 139, station: 15, fromStation: 442 },
  { id: 'osm-node-4716326648', name: '皆中稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q11580916', x: -6084.5, z: -2203, distance: 81, station: 15, fromStation: 82 },
  { id: 'osm-way-572498043', name: 'SOMPO美術館', nameEn: 'Sompo Museum of Art', family: 'museum', wikidata: 'Q1614504', x: -6341, z: -1241.7, distance: 308, station: 16, fromStation: 528 },
  { id: 'osm-relation-13272644', name: '新宿中央公園', nameEn: 'Shinjuku Central Park', family: 'park', wikidata: 'Q5364883', x: -6987.4, z: -857, distance: 976, station: 16, fromStation: 991 },
  { id: 'osm-way-138522541', name: '新宿瑠璃光院白蓮華堂', nameEn: null, family: 'worship', wikidata: 'Q127271380', x: -6145.1, z: -654.5, distance: 189, station: 16, fromStation: 239 },
  { id: 'osm-node-3935659186', name: 'たんきり子育地蔵尊', nameEn: null, family: 'historic', wikidata: 'Q120973137', x: -4287.6, z: -862.1, distance: 1646, station: 17, fromStation: 1658 },
  { id: 'osm-way-138698485', name: '明治神宮宝物殿', nameEn: 'Meiji Jingu Treasure Museum', family: 'museum', wikidata: 'Q133288913', x: -6204.5, z: 155.2, distance: 474, station: 17, fromStation: 570 },
  { id: 'osm-way-15772074', name: '新宿御苑', nameEn: 'Shinjuku Gyoen National Garden', family: 'park', wikidata: 'Q776863', x: -5130.4, z: -414.3, distance: 721, station: 17, fromStation: 723 },
  { id: 'osm-node-1934920328', name: '正春寺', nameEn: null, family: 'worship', wikidata: 'Q106836591', x: -6786.7, z: -305, distance: 902, station: 17, fromStation: 946 },
  { id: 'osm-node-7125341604', name: 'ピエール・ド・クーベルタン', nameEn: 'Pierre de Coubertin', family: 'historic', wikidata: 'Q85847340', x: -4658, z: 682.1, distance: 1004, station: 18, fromStation: 1269 },
  { id: 'osm-way-1135849071', name: '明治神宮ミュージアム', nameEn: 'Meiji Shrine Museum', family: 'museum', wikidata: 'Q127692420', x: -5828.5, z: 1005.9, distance: 72, station: 18, fromStation: 235 },
  { id: 'osm-relation-19862716', name: '代々木公園', nameEn: 'Yoyogi Park', family: 'park', wikidata: 'Q1204253', x: -6356.6, z: 1266.6, distance: 551, station: 18, fromStation: 558 },
  { id: 'osm-way-179091082', name: '東郷神社', nameEn: 'Togo-jinja Shrine', family: 'worship', wikidata: 'Q1384780', x: -5458.3, z: 1091.6, distance: 307, station: 18, fromStation: 371 },
  { id: 'osm-node-508446313', name: '二・二六事件慰霊像', nameEn: 'Memorial Monument of the 2.26 Incident', family: 'historic', wikidata: 'Q117312077', x: -6296.5, z: 1893.5, distance: 423, station: 19, fromStation: 818 },
  { id: 'osm-node-10289966935', name: '東京アニメセンター', nameEn: 'Tokyo Anime Center', family: 'museum', wikidata: 'Q6128676', x: -5968.8, z: 2217.7, distance: 71, station: 19, fromStation: 383 },
  { id: 'osm-way-116806278', name: '宮下公園', nameEn: 'Miyashita Park', family: 'park', wikidata: 'Q6884419', x: -5861.6, z: 2156.9, distance: 33, station: 19, fromStation: 429 },
  { id: 'osm-way-141293484', name: '金王八幡宮', nameEn: 'Konnou Hachimangu Shrine', family: 'worship', wikidata: 'Q11647638', x: -5455.1, z: 2640.3, distance: 325, station: 19, fromStation: 410 },
  { id: 'osm-node-250668627', name: '東京都写真美術館', nameEn: 'Tokyo Photographic Art Museum', family: 'museum', wikidata: 'Q862884', x: -4802.8, z: 4417.6, distance: 39, station: 20, fromStation: 616 },
  { id: 'osm-way-382975172', name: '恵比寿東公園', nameEn: 'Tako Park', family: 'park', wikidata: 'Q42312019', x: -4952.1, z: 3688.2, distance: 206, station: 20, fromStation: 235 },
  { id: 'osm-node-340381542', name: '恵比寿神社', nameEn: 'Ebisu Shrine', family: 'worship', wikidata: 'Q11492406', x: -5312.3, z: 3788.5, distance: 166, station: 20, fromStation: 235 },
  { id: 'osm-node-1420766554', name: '久米美術館', nameEn: 'Kume Museum of Art', family: 'museum', wikidata: 'Q11369635', x: -4677.7, z: 5193.7, distance: 80, station: 21, fromStation: 108 },
  { id: 'osm-way-170295471', name: '林試の森公園', nameEn: 'Rinshi No Mori Park', family: 'park', wikidata: 'Q11533314', x: -5724.9, z: 6208.2, distance: 1372, station: 21, fromStation: 1493 },
  { id: 'osm-way-695900649', name: '大圓寺', nameEn: 'Daienji', family: 'worship', wikidata: 'Q11432581', x: -4769.5, z: 5387.9, distance: 211, station: 21, fromStation: 234 },
  { id: 'osm-node-1420790339', name: '畠山記念館', nameEn: 'Ebara Hatakeyama Museum of Art', family: 'museum', wikidata: 'Q3330210', x: -3574.1, z: 5446.7, distance: 662, station: 22, fromStation: 723 },
  { id: 'osm-way-570672664', name: 'ねむの木の庭', nameEn: null, family: 'park', wikidata: 'Q11275095', x: -3975.9, z: 5661.8, distance: 255, station: 22, fromStation: 459 },
  { id: 'osm-node-4873064221', name: '薬師寺東京別院', nameEn: null, family: 'worship', wikidata: 'Q132040935', x: -3983.9, z: 5868.5, distance: 77, station: 22, fromStation: 266 },
  { id: 'osm-way-215725979', name: '翡翠原石館', nameEn: 'Jade Ore Museum', family: 'museum', wikidata: 'Q136707259', x: -2811.9, z: 6757.2, distance: 187, station: 23, fromStation: 599 },
  { id: 'osm-way-135154427', name: 'しながわ中央公園', nameEn: null, family: 'park', wikidata: 'Q11268912', x: -3453.5, z: 7961.5, distance: 884, station: 23, fromStation: 1107 },
  { id: 'osm-node-843098167', name: '居木神社', nameEn: 'Irugi Jinja', family: 'worship', wikidata: 'Q11465598', x: -3723.1, z: 6821.5, distance: 247, station: 23, fromStation: 322 },
  { id: 'osm-way-172281540', name: '開東閣', nameEn: 'Kaitokaku', family: 'historic', wikidata: 'Q11655265', x: -2706.4, z: 6348.6, distance: 172, station: 24, fromStation: 533 },
  { id: 'osm-node-1420789431', name: '物流博物館', nameEn: 'Logistics Museum', family: 'museum', wikidata: 'Q104698234', x: -3086.2, z: 5794.5, distance: 546, station: 24, fromStation: 549 },
  { id: 'osm-way-455666012', name: '港南公園', nameEn: null, family: 'park', wikidata: 'Q42311585', x: -1789.1, z: 6193, distance: 718, station: 24, fromStation: 828 },
  { id: 'osm-way-1337713345', name: '高山稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q107410076', x: -3013.5, z: 5995.5, distance: 482, station: 24, fromStation: 498 },
  { id: 'osm-way-190883265', name: '高輪皇族邸', nameEn: 'Takanawa Imperial Residence', family: 'historic', wikidata: 'Q38255023', x: -2732.3, z: 4500, distance: 563, station: 25, fromStation: 705 },
  { id: 'osm-way-160703991', name: '三田台公園', nameEn: 'Mitadai Park', family: 'park', wikidata: 'Q11356683', x: -2414.1, z: 4316.7, distance: 303, station: 25, fromStation: 775 },
  { id: 'osm-way-653744410', name: '高輪神社', nameEn: 'Takanawa Shrine', family: 'worship', wikidata: 'Q3514174', x: -2575.9, z: 5102.3, distance: 215, station: 25, fromStation: 232 },
  { id: 'osm-node-1633971756', name: '江戸開城西郷南洲勝海舟会見之地', nameEn: 'Historic Place Where Saigo Takamori and Katsu Kaishu Met for the Negotiation for the Opening of Edo Castle', family: 'historic', wikidata: 'Q133362241', x: -1608.2, z: 3774.9, distance: 97, station: 26, fromStation: 192 },
  { id: 'osm-node-11262093573', name: 'The History Museum of J-Koreans', nameEn: 'History Museum of J-Koreans', family: 'museum', wikidata: 'Q122929555', x: -2663.7, z: 3310.8, distance: 1068, station: 26, fromStation: 1153 },
  { id: 'osm-way-104112028', name: '本芝公園', nameEn: 'Honshiba Park', family: 'park', wikidata: 'Q42311596', x: -1492.5, z: 3796.4, distance: 20, station: 26, fromStation: 254 },
  { id: 'osm-way-87510469', name: '御穂鹿嶋神社', nameEn: 'Miho Kashima-jinja Shrine', family: 'worship', wikidata: 'Q113386352', x: -1562, z: 3805.6, distance: 47, station: 26, fromStation: 195 },
  { id: 'osm-node-12538725018', name: '首尾稲荷大明神', nameEn: null, family: 'historic', wikidata: 'Q131925805', x: -1206.7, z: 2864.6, distance: 352, station: 27, fromStation: 354 },
  { id: 'osm-node-10163996662', name: '勝どき・豊海歴史資料展示館', nameEn: 'Kachidoki-Toyoumi Historical Materials Exhibition Hall', family: 'museum', wikidata: null, x: 880.8, z: 2459.2, distance: 1621, station: 27, fromStation: 1791 },
  { id: 'osm-way-4848909', name: '旧芝離宮恩賜庭園', nameEn: 'Kyu Shiba Rikyu Garden', family: 'park', wikidata: 'Q3266874', x: -716.1, z: 2917.2, distance: 139, station: 27, fromStation: 139 },
  { id: 'osm-node-12538036885', name: '讃岐小白稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q131924400', x: -935.2, z: 3028.5, distance: 52, station: 27, fromStation: 150 },
  { id: 'osm-relation-7826097', name: '旧新橋停車場', nameEn: 'Old Shimbashi Station', family: 'historic', wikidata: 'Q7497865', x: -456.4, z: 1703.5, distance: 298, station: 28, fromStation: 307 },
  { id: 'osm-node-820849494', name: '旧新橋停車場鉄道歴史展示室', nameEn: 'Old Shimbashi Station Railway History Exhibition Hall', family: 'museum', wikidata: 'Q104698226', x: -442.8, z: 1699.7, distance: 312, station: 28, fromStation: 321 },
  { id: 'osm-way-151332916', name: '南桜公園', nameEn: 'Minamisakura Park', family: 'park', wikidata: 'Q62678168', x: -1252.7, z: 1661.8, distance: 486, station: 28, fromStation: 490 },
  { id: 'osm-node-260408025', name: '烏森神社', nameEn: 'Karasumori Shrine', family: 'worship', wikidata: 'Q11567255', x: -877.8, z: 1606.7, distance: 107, station: 28, fromStation: 135 },
  { id: 'osm-relation-8048114', name: '明治生命館', nameEn: 'Meiji Mutual Life Insurance Building', family: 'historic', wikidata: 'Q3023897', x: -446.5, z: 252.7, distance: 369, station: 29, fromStation: 463 },
  { id: 'osm-node-3666894176', name: '相田みつを美術館', nameEn: 'Mitsuo Aida Museum', family: 'museum', wikidata: 'Q11582309', x: -184.1, z: 421.7, distance: 67, station: 29, fromStation: 307 },
  { id: 'osm-way-145408909', name: '日比谷公園', nameEn: 'Hibiya Park', family: 'park', wikidata: 'Q1378533', x: -937.8, z: 839.5, distance: 396, station: 29, fromStation: 636 },
  { id: 'osm-node-2429693513', name: '銀座教会', nameEn: 'Ginza Church', family: 'worship', wikidata: 'Q11650005', x: -199.3, z: 916.6, distance: 240, station: 29, fromStation: 249 },
];

/** Portée du relevé (m) : au-delà, c'est l'affaire de l'horizon géographique. */
export const NEAR_REACH = 2000;

const BY_ID = new Map(NEAR_LANDMARKS.map((lm) => [lm.id, lm]));

/** Le repère réel d'identifiant `id`, ou `undefined`. */
export function nearLandmark(id: string): NearLandmark | undefined {
  return BY_ID.get(id);
}
