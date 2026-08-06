// Les repères RÉELS du bord de voie : ce qu'on peut aller vérifier.
//
// GÉNÉRÉ par `node scripts/geo/pick-near.mjs` - ne pas éditer à la main.
// Le relevé dont il sort vient de `scripts/geo/fetch-near.mjs`.
//
// © les contributeurs OpenStreetMap · OpenStreetMap
// Licence ODbL 1.0 · jeu daté du 2026-08-05 · DATA_STATIC
//
// La règle 12 de la bible géographique dit qu'un repère est ce qu'on peut
// retrouver sur une carte. Ce fichier ne contient donc que des objets qui y
// sont : 209 au plus 2 par gare et par famille, tirés des 1245 objets
// réels relevés à moins de 2000 m de la voie, et 197 d'entre eux portent une
// fiche Wikidata. Chacun garde son identifiant OpenStreetMap : on peut ouvrir
// la carte et regarder.
//
// POURQUOI PLUSIEURS PAR FAMILLE. Le plafond valait un, et le critère qui
// départageait - fiche Wikidata, puis proximité de la gare - ne peut pas
// arbitrer ce qu'on lui demandait : à Tokyo, l'objet le plus proche d'une gare
// qui porte une fiche est presque toujours un petit sanctuaire de quartier. On
// gardait le 真性寺 et on écartait le 高岩寺. Plutôt que d'inventer un rang de
// notoriété que la source ne porte pas - ce serait notre jugement, et la règle
// 11 l'interdit -, on en garde plusieurs et le jeu cite dans l'ordre.
//
// `rank` est cette place : 0 est le premier cité. C'est un ORDRE DE BUDGET,
// pas un verdict sur l'importance.
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
  /** Place dans l'ordre de citation de sa gare et de sa famille. 0 = premier. */
  rank: number;
}

export const NEAR_LANDMARKS: readonly NearLandmark[] = [
  { id: 'osm-node-3164340661', name: '東京ステーションギャラリー', nameEn: 'Tokyo Station Gallery', family: 'museum', wikidata: 'Q115265693', x: -6.5, z: -130.3, distance: 46, station: 0, fromStation: 130, rank: 0 },
  { id: 'osm-node-250668618', name: 'アーティゾン美術館', nameEn: 'Artizon Museum', family: 'museum', wikidata: 'Q913808', x: 504.6, z: 276.8, distance: 560, station: 0, fromStation: 576, rank: 1 },
  { id: 'osm-node-3485535297', name: '智泉院', nameEn: 'Chisen-in Temple', family: 'worship', wikidata: 'Q106836711', x: 1154, z: 33.9, distance: 1099, station: 0, fromStation: 1154, rank: 0 },
  { id: 'osm-node-3633758321', name: '純子稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q109162634', x: 1194.1, z: 396.5, distance: 1258, station: 0, fromStation: 1258, rank: 1 },
  { id: 'osm-way-558521992', name: 'OOTEMORI', nameEn: 'Otemori', family: 'park', wikidata: 'Q112255588', x: -124.3, z: -474, distance: 273, station: 0, fromStation: 490, rank: 0 },
  { id: 'osm-relation-5415394', name: '皇居東御苑', nameEn: 'Imperial Palace East Gardens', family: 'park', wikidata: 'Q6631907', x: -850, z: -576.4, distance: 994, station: 0, fromStation: 1027, rank: 1 },
  { id: 'osm-node-13564912583', name: 'ヤン・ヨーステン記念像', nameEn: 'Jan Joosten van Lodensteijn Memorial Statue (B1)', family: 'historic', wikidata: 'Q599058', x: 176.6, z: 146.5, distance: 212, station: 0, fromStation: 229, rank: 0 },
  { id: 'osm-node-5808073053', name: '大奥跡', nameEn: 'Site of Ōoku', family: 'historic', wikidata: 'Q1064983', x: -1012.3, z: -674.8, distance: 1180, station: 0, fromStation: 1217, rank: 1 },
  { id: 'osm-node-6026372096', name: '第一三共くすりミュージアム', nameEn: 'Daiichi Sankyo Kusuri Museum', family: 'museum', wikidata: 'Q17224188', x: 822.1, z: -801.4, distance: 521, station: 1, fromStation: 563, rank: 0 },
  { id: 'osm-node-1420765471', name: '三井記念美術館', nameEn: 'Mitsui Memorial Museum', family: 'museum', wikidata: 'Q864700', x: 587.7, z: -620.6, distance: 356, station: 1, fromStation: 581, rank: 1 },
  { id: 'osm-way-504553390', name: '佐竹稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q113667160', x: 254.9, z: -1100.8, distance: 112, station: 1, fromStation: 156, rank: 0 },
  { id: 'osm-way-546743134', name: '真徳稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q113667013', x: 111.1, z: -1339.8, distance: 325, station: 1, fromStation: 332, rank: 1 },
  { id: 'osm-way-515133705', name: '神田児童公園', nameEn: null, family: 'park', wikidata: 'Q42311502', x: 120.8, z: -1296.7, distance: 302, station: 1, fromStation: 303, rank: 0 },
  { id: 'osm-way-157214547', name: '浜町公園', nameEn: 'Hamacho Park', family: 'park', wikidata: 'Q11558030', x: 2019.7, z: -781.9, distance: 1662, station: 1, fromStation: 1670, rank: 1 },
  { id: 'osm-way-43935790', name: '清水門', nameEn: 'Shimizu Gate', family: 'historic', wikidata: 'Q28685861', x: -1270.5, z: -1270.4, distance: 1612, station: 1, fromStation: 1669, rank: 0 },
  { id: 'osm-way-176046390', name: '田安門', nameEn: 'Tayasu Gate', family: 'historic', wikidata: 'Q28685847', x: -1566.2, z: -1416, distance: 1939, station: 1, fromStation: 1977, rank: 1 },
  { id: 'osm-node-1420781347', name: '明治大学博物館', nameEn: 'Meiji University Museum', family: 'museum', wikidata: 'Q85880847', x: -404.4, z: -1934.1, distance: 981, station: 2, fromStation: 983, rank: 0 },
  { id: 'osm-node-1420785386', name: '東京都水道歴史館', nameEn: 'Tokyo Waterworks Historical Museum', family: 'museum', wikidata: 'Q11525339', x: -555.3, z: -2445.7, distance: 1188, station: 2, fromStation: 1259, rank: 1 },
  { id: 'osm-way-46983897', name: '柳森神社', nameEn: 'Yanagimori Jinja Shrine', family: 'worship', wikidata: 'Q55532885', x: 619.3, z: -1718.8, distance: 58, station: 2, fromStation: 185, rank: 0 },
  { id: 'osm-way-170401331', name: '講武稲荷神社', nameEn: 'Kobu Inari Shrine', family: 'worship', wikidata: 'Q107410075', x: 278.3, z: -1974.7, distance: 306, station: 2, fromStation: 309, rank: 1 },
  { id: 'osm-way-332338650', name: '淡路公園', nameEn: 'Awaji Pocket Park', family: 'park', wikidata: 'Q42311503', x: 36.7, z: -1764.6, distance: 525, station: 2, fromStation: 558, rank: 0 },
  { id: 'osm-way-184577229', name: '錦華公園', nameEn: 'Kinka Park', family: 'park', wikidata: 'Q42311499', x: -550.1, z: -1826.3, distance: 1107, station: 2, fromStation: 1131, rank: 1 },
  { id: 'osm-node-4014267002', name: '玄武館道場跡', nameEn: 'The Site of Genbukandojo Gym', family: 'historic', wikidata: 'Q11572297', x: 702.5, z: -1551.6, distance: 170, station: 2, fromStation: 369, rank: 0 },
  { id: 'osm-way-150624609', name: 'いせ源', nameEn: 'Isegen', family: 'historic', wikidata: 'Q11259411', x: 231, z: -1700.5, distance: 323, station: 2, fromStation: 400, rank: 1 },
  { id: 'osm-way-145344198', name: 'したまちミュージアム', nameEn: 'Shitamachi Museum', family: 'museum', wikidata: 'Q3915464', x: 550.9, z: -3216.9, distance: 174, station: 3, fromStation: 401, rank: 0 },
  { id: 'osm-node-6033643885', name: '国立近現代建築資料館', nameEn: 'National Museum of Modern and Contemporary Architecture', family: 'museum', wikidata: 'Q28312009', x: -1.5, z: -3150.2, distance: 730, station: 3, fromStation: 781, rank: 1 },
  { id: 'osm-way-530688843', name: '徳大寺', nameEn: 'Tokudai-ji', family: 'worship', wikidata: 'Q11489567', x: 710.9, z: -3036.9, distance: 33, station: 3, fromStation: 184, rank: 0 },
  { id: 'osm-node-3093563126', name: '八幡神社', nameEn: null, family: 'worship', wikidata: 'Q111906052', x: 950.3, z: -2804, distance: 234, station: 3, fromStation: 235, rank: 1 },
  { id: 'osm-way-505256902', name: '御徒町公園', nameEn: 'Okachimachi Park', family: 'park', wikidata: 'Q42311721', x: 979.1, z: -2787.3, distance: 265, station: 3, fromStation: 267, rank: 0 },
  { id: 'osm-way-240891310', name: '赤門', nameEn: 'Red Gate', family: 'historic', wikidata: 'Q48807898', x: -570.6, z: -3254.5, distance: 1293, station: 3, fromStation: 1352, rank: 0 },
  { id: 'osm-node-5485934064', name: '十一面観世音菩薩', nameEn: null, family: 'historic', wikidata: 'Q114820239', x: -638.2, z: -2977.8, distance: 1363, station: 3, fromStation: 1364, rank: 1 },
  { id: 'osm-node-441655802', name: '上野の森美術館', nameEn: 'The Ueno Royal Museum', family: 'museum', wikidata: 'Q11360245', x: 732.8, z: -3507.4, distance: 65, station: 4, fromStation: 145, rank: 0 },
  { id: 'osm-way-203960903', name: '国立西洋美術館', nameEn: 'The National Museum of Western Art', family: 'museum', wikidata: 'Q1362629', x: 830.3, z: -3791.5, distance: 124, station: 4, fromStation: 202, rank: 1 },
  { id: 'osm-way-138585452', name: '清水観音堂', nameEn: 'Kiyomizu Kannon-dō', family: 'worship', wikidata: 'Q99541117', x: 621.9, z: -3492.2, distance: 156, station: 4, fromStation: 250, rank: 0 },
  { id: 'osm-way-220491267', name: '五條天神社', nameEn: 'Gojo Tenjinsha Shrine', family: 'worship', wikidata: 'Q2115862', x: 498.6, z: -3600.7, distance: 316, station: 4, fromStation: 353, rank: 1 },
  { id: 'osm-relation-5413419', name: '上野公園', nameEn: 'Ueno Zoological Gardens', family: 'park', wikidata: 'Q746216', x: 596.4, z: -3779.6, distance: 316, station: 4, fromStation: 318, rank: 0 },
  { id: 'osm-node-5906019305', name: '摺鉢山古墳', nameEn: 'Mount Suribachi Kofun', family: 'historic', wikidata: 'Q17220560', x: 657.9, z: -3612.2, distance: 181, station: 4, fromStation: 195, rank: 0 },
  { id: 'osm-node-1587597689', name: '小松宮彰仁親王銅像', nameEn: 'Statue of Prince Komatsunomiya', family: 'historic', wikidata: 'Q712627', x: 615.2, z: -3788.1, distance: 304, station: 4, fromStation: 308, rank: 1 },
  { id: 'osm-way-33439660', name: '東京国立博物館', nameEn: 'Tokyo National Museum', family: 'museum', wikidata: 'Q653433', x: 825.9, z: -4197, distance: 329, station: 5, fromStation: 348, rank: 0 },
  { id: 'osm-node-1420771103', name: '台東区立書道博物館', nameEn: 'Calligraphy Museum', family: 'museum', wikidata: 'Q11411955', x: 881.7, z: -4824, distance: 129, station: 5, fromStation: 360, rank: 1 },
  { id: 'osm-way-243433345', name: '元三島神社', nameEn: 'Moto-Mishima-jinja Shrine', family: 'worship', wikidata: 'Q106852471', x: 1015, z: -4574.2, distance: 60, station: 5, fromStation: 85, rank: 0 },
  { id: 'osm-node-5674849919', name: '法住山 要傳寺', nameEn: 'Yodenji Temple', family: 'worship', wikidata: 'Q43593582', x: 1278.4, z: -4464.5, distance: 191, station: 5, fromStation: 266, rank: 1 },
  { id: 'osm-way-586063797', name: '東盛公園', nameEn: 'Tousei Park', family: 'park', wikidata: 'Q42311697', x: 2363.4, z: -5244.5, distance: 1527, station: 5, fromStation: 1546, rank: 0 },
  { id: 'osm-way-549928178', name: '吉原公園', nameEn: 'Yoshiwara Park', family: 'park', wikidata: 'Q42311717', x: 2588.5, z: -4849.7, distance: 1535, station: 5, fromStation: 1615, rank: 1 },
  { id: 'osm-way-1482037983', name: '厳有院霊廟水盤舎', nameEn: 'Water Basin Pavilion of the Gen’yū‑in Mausoleum', family: 'historic', wikidata: 'Q11410144', x: 1003.6, z: -4365, distance: 86, station: 5, fromStation: 125, rank: 0 },
  { id: 'osm-way-565396260', name: '水盤舎', nameEn: 'Water basin house of the Jokenin Mausoleum', family: 'historic', wikidata: 'Q11481391', x: 864.2, z: -4488.4, distance: 109, station: 5, fromStation: 150, rank: 1 },
  { id: 'osm-way-209190478', name: '台東区立朝倉彫塑館', nameEn: 'Asakura Museum of Sculpture', family: 'museum', wikidata: 'Q11517304', x: 163.4, z: -5054.1, distance: 212, station: 6, fromStation: 214, rank: 0 },
  { id: 'osm-node-1420772944', name: '大名時計博物館', nameEn: 'Daimyo Clock Museum', family: 'museum', wikidata: 'Q10856362', x: -46.4, z: -4441.3, distance: 795, station: 6, fromStation: 834, rank: 1 },
  { id: 'osm-way-162043813', name: '本行寺', nameEn: 'Hongyōji Temple', family: 'worship', wikidata: 'Q11520798', x: 246.7, z: -5217.9, distance: 39, station: 6, fromStation: 93, rank: 0 },
  { id: 'osm-way-162043812', name: '経王寺', nameEn: 'Kyōōji', family: 'worship', wikidata: 'Q97215952', x: 179.2, z: -5198.3, distance: 103, station: 6, fromStation: 155, rank: 1 },
  { id: 'osm-way-45738210', name: '岡倉天心 記念公園', nameEn: 'Okakura Tenshin Memorial Park', family: 'park', wikidata: 'Q42311758', x: -28.1, z: -5000.4, distance: 389, station: 6, fromStation: 405, rank: 0 },
  { id: 'osm-way-243367978', name: '須藤公園', nameEn: 'Sudō Park', family: 'park', wikidata: 'Q42311659', x: -382.9, z: -5010.6, distance: 665, station: 6, fromStation: 737, rank: 1 },
  { id: 'osm-node-4218532821', name: '谷中五重塔跡地', nameEn: 'Site of Five-storied Pagoda', family: 'historic', wikidata: 'Q8048250', x: 371.1, z: -4883.9, distance: 189, station: 6, fromStation: 302, rank: 0 },
  { id: 'osm-way-209190262', name: '小倉屋', nameEn: 'Oguraya', family: 'historic', wikidata: 'Q22119120', x: 200.3, z: -4818.2, distance: 349, station: 6, fromStation: 389, rank: 1 },
  { id: 'osm-node-5898813824', name: '吉村昭記念文学館', nameEn: 'Yoshimura Akira Memorial Museum of Literature', family: 'museum', wikidata: 'Q38277897', x: 1543.5, z: -6449.7, distance: 1738, station: 7, fromStation: 1745, rank: 0 },
  { id: 'osm-node-5966262803', name: 'ファーブル昆虫館 「虫の詩人の館」', nameEn: 'Fabre Insect Museum', family: 'museum', wikidata: null, x: -706.2, z: -5380.9, distance: 740, station: 7, fromStation: 748, rank: 1 },
  { id: 'osm-way-162043809', name: '青雲寺', nameEn: 'Shoun-ji Temple', family: 'worship', wikidata: 'Q97216427', x: -65, z: -5538, distance: 106, station: 7, fromStation: 126, rank: 0 },
  { id: 'osm-way-698623646', name: '諏訪神社', nameEn: null, family: 'worship', wikidata: 'Q97216185', x: 45.5, z: -5472.5, distance: 49, station: 7, fromStation: 186, rank: 1 },
  { id: 'osm-way-162043806', name: '西日暮里公園', nameEn: 'Nishi-Nippori Park', family: 'park', wikidata: 'Q42312353', x: -25, z: -5575.3, distance: 53, station: 7, fromStation: 77, rank: 0 },
  { id: 'osm-way-558166566', name: '日暮里 第二児童遊園', nameEn: null, family: 'park', wikidata: 'Q110265359', x: -297.9, z: -5745.6, distance: 197, station: 7, fromStation: 305, rank: 1 },
  { id: 'osm-node-1420790123', name: '田端文士村記念館', nameEn: 'TABATA Memorial Museum of Writers and Artists', family: 'museum', wikidata: 'Q11577225', x: -677.8, z: -6345.9, distance: 72, station: 8, fromStation: 252, rank: 0 },
  { id: 'osm-node-6193169764', name: '明月寺', nameEn: null, family: 'worship', wikidata: 'Q106646405', x: -448.5, z: -6129.4, distance: 59, station: 8, fromStation: 94, rank: 0 },
  { id: 'osm-way-243504820', name: '田端八幡神社', nameEn: 'Tabata Hachiman Shrine', family: 'worship', wikidata: 'Q95743097', x: -717.7, z: -6078.6, distance: 287, station: 8, fromStation: 298, rank: 1 },
  { id: 'osm-way-176649941', name: '田端台公園', nameEn: 'Tabatadai Park', family: 'park', wikidata: 'Q42312448', x: -258.5, z: -5932.4, distance: 47, station: 8, fromStation: 352, rank: 0 },
  { id: 'osm-way-562839824', name: '都電6000系', nameEn: null, family: 'historic', wikidata: null, x: -1069.4, z: -5745.7, distance: 678, station: 8, fromStation: 776, rank: 0 },
  { id: 'osm-way-562839826', name: '都電乙1形', nameEn: null, family: 'historic', wikidata: null, x: -1068.1, z: -5734.5, distance: 688, station: 8, fromStation: 782, rank: 1 },
  { id: 'osm-way-334122306', name: '渋沢史料館', nameEn: 'Shibusawa Memorial Museum', family: 'museum', wikidata: 'Q11254595', x: -2493.6, z: -7525.8, distance: 1575, station: 9, fromStation: 1575, rank: 0 },
  { id: 'osm-way-334122280', name: '北区飛鳥山博物館', nameEn: 'Kita City Asukayama Museum', family: 'museum', wikidata: 'Q11401205', x: -2515.2, z: -7570.8, distance: 1625, station: 9, fromStation: 1625, rank: 1 },
  { id: 'osm-way-1347108119', name: '大國神社', nameEn: 'Daikoku Shrine', family: 'worship', wikidata: 'Q97478942', x: -1844.9, z: -6119, distance: 27, station: 9, fromStation: 83, rank: 0 },
  { id: 'osm-way-1352871353', name: '日枝神社', nameEn: null, family: 'worship', wikidata: 'Q97478963', x: -1615.1, z: -6131.6, distance: 66, station: 9, fromStation: 148, rank: 1 },
  { id: 'osm-way-162567679', name: '染井吉野桜記念公園', nameEn: 'Somei Yoshino Cherry Memorial Park', family: 'park', wikidata: 'Q111822282', x: -1798.9, z: -6166.4, distance: 48, station: 9, fromStation: 51, rank: 0 },
  { id: 'osm-way-38017808', name: '飛鳥山公園', nameEn: 'Asukayama Park', family: 'park', wikidata: 'Q901172', x: -2536.2, z: -7683.8, distance: 1735, station: 9, fromStation: 1735, rank: 1 },
  { id: 'osm-way-249498496', name: '六義園', nameEn: 'Rikugi Garden', family: 'historic', wikidata: 'Q1889010', x: -1839.4, z: -5762.7, distance: 294, station: 9, fromStation: 376, rank: 0 },
  { id: 'osm-way-237691736', name: '西ヶ原一里塚', nameEn: 'Nishigahara Boundary Stone', family: 'historic', wikidata: 'Q104903676', x: -2327.4, z: -7317.4, distance: 1314, station: 9, fromStation: 1314, rank: 1 },
  { id: 'osm-way-459173214', name: '東京大学総合研究博物館・小石川分館', nameEn: 'Koishikawa Annex, Museum of Architecture, The University Museum, The University of Tokyo', family: 'museum', wikidata: 'Q3815581', x: -2312.4, z: -4447.6, distance: 1248, station: 10, fromStation: 1335, rank: 0 },
  { id: 'osm-node-11993719386', name: '井上円了記念博物館', nameEn: 'Inoue Enryo Memorial Museum', family: 'museum', wikidata: 'Q11527629', x: -1527.8, z: -4698.6, distance: 1384, station: 10, fromStation: 1428, rank: 1 },
  { id: 'osm-way-176206193', name: '真性寺', nameEn: 'Shinshoji Temple', family: 'worship', wikidata: 'Q11583190', x: -2725.8, z: -5876.8, distance: 210, station: 10, fromStation: 278, rank: 0 },
  { id: 'osm-way-177521388', name: 'とげぬき地蔵尊 高岩寺', nameEn: 'Kogan-ji Temple', family: 'worship', wikidata: 'Q6587321', x: -2826.6, z: -6038.7, distance: 401, station: 10, fromStation: 446, rank: 1 },
  { id: 'osm-way-493816207', name: '西ヶ原みんなの公園', nameEn: null, family: 'park', wikidata: 'Q21019288', x: -2750.3, z: -6734.4, distance: 985, station: 10, fromStation: 1001, rank: 0 },
  { id: 'osm-way-971499148', name: '白山公園', nameEn: 'Hakusan Park', family: 'park', wikidata: 'Q42311706', x: -1476, z: -4480.6, distance: 1602, station: 10, fromStation: 1630, rank: 1 },
  { id: 'osm-node-1420771074', name: '古代オリエント博物館', nameEn: 'Ancient Orient Museum', family: 'museum', wikidata: 'Q1048740', x: -4138.8, z: -5256.9, distance: 519, station: 11, fromStation: 761, rank: 0 },
  { id: 'osm-way-264856191', name: '鈴木信太郎記念館', nameEn: 'Shintaro Suzuki Memorial Museum', family: 'museum', wikidata: null, x: -3406.9, z: -4931.9, distance: 608, station: 11, fromStation: 650, rank: 1 },
  { id: 'osm-node-5266637262', name: '天祖神社', nameEn: 'Tenso-jinja Shrine', family: 'worship', wikidata: 'Q97478945', x: -3527.9, z: -5456.9, distance: 141, station: 11, fromStation: 146, rank: 0 },
  { id: 'osm-way-183177137', name: 'マスジド大塚 Masjid Otsuka', nameEn: null, family: 'worship', wikidata: 'Q20425063', x: -3481.3, z: -5290.6, distance: 286, station: 11, fromStation: 292, rank: 1 },
  { id: 'osm-way-776489693', name: 'としまみどりの防災公園', nameEn: 'Toshima Midori Disaster Prevention Park', family: 'park', wikidata: 'Q106707534', x: -4019.4, z: -5123.6, distance: 609, station: 11, fromStation: 730, rank: 0 },
  { id: 'osm-way-170294476', name: '大塚公園', nameEn: 'Otsuka Park', family: 'park', wikidata: 'Q11433966', x: -3160.2, z: -4734.9, distance: 765, station: 11, fromStation: 894, rank: 1 },
  { id: 'osm-node-13603987511', name: '巣鴨プリズン跡', nameEn: 'Remnant of Sugamo Prison', family: 'historic', wikidata: 'Q699579', x: -4026.9, z: -5045.6, distance: 686, station: 11, fromStation: 786, rank: 0 },
  { id: 'osm-node-13064892465', name: 'C58407', nameEn: null, family: 'historic', wikidata: null, x: -3710.2, z: -5410.6, distance: 241, station: 11, fromStation: 310, rank: 1 },
  { id: 'osm-node-1420798090', name: '豊島区立郷土資料館', nameEn: 'Toshima City Local Museum', family: 'museum', wikidata: 'Q104698258', x: -5427.4, z: -5136.8, distance: 264, station: 12, fromStation: 480, rank: 0 },
  { id: 'osm-node-6018196685', name: '池袋防災館', nameEn: 'Ikebukuro Disaster Prevention Center', family: 'museum', wikidata: null, x: -5409.2, z: -5176.8, distance: 262, station: 12, fromStation: 442, rank: 1 },
  { id: 'osm-node-5939950286', name: '妙典寺', nameEn: null, family: 'worship', wikidata: 'Q106300704', x: -4798.1, z: -5060.5, distance: 351, station: 12, fromStation: 437, rank: 0 },
  { id: 'osm-node-5939950385', name: '常在寺', nameEn: null, family: 'worship', wikidata: 'Q11481344', x: -4786.4, z: -5047.1, distance: 366, station: 12, fromStation: 454, rank: 1 },
  { id: 'osm-way-595622641', name: '池袋西口公園', nameEn: 'Ikebukuro Nishiguchi Park', family: 'park', wikidata: 'Q11552247', x: -5227.7, z: -5405.6, distance: 165, station: 12, fromStation: 186, rank: 0 },
  { id: 'osm-way-155289523', name: '南池袋公園', nameEn: null, family: 'park', wikidata: 'Q11408045', x: -4737.2, z: -5124.2, distance: 390, station: 12, fromStation: 427, rank: 1 },
  { id: 'osm-node-13603964428', name: '巣鴨拘置所', nameEn: 'Sugamo Prison memorial', family: 'historic', wikidata: 'Q699579', x: -4362.3, z: -5437.8, distance: 416, station: 12, fromStation: 680, rank: 0 },
  { id: 'osm-way-208656517', name: '霞会館記念学習院ミ', nameEn: 'Gakushin Museum', family: 'museum', wikidata: 'Q11448881', x: -5182.3, z: -4230.7, distance: 303, station: 13, fromStation: 321, rank: 0 },
  { id: 'osm-node-1420767889', name: '切手の博物館', nameEn: 'Stamp Museum', family: 'museum', wikidata: 'Q11396206', x: -5510.4, z: -4092.9, distance: 24, station: 13, fromStation: 330, rank: 1 },
  { id: 'osm-way-243647307', name: '観静院', nameEn: 'Kanjoin', family: 'worship', wikidata: 'Q130100531', x: -4796.2, z: -4667.1, distance: 502, station: 13, fromStation: 695, rank: 0 },
  { id: 'osm-node-5861926613', name: '金乗院', nameEn: null, family: 'worship', wikidata: 'Q11646320', x: -4694.1, z: -3870.8, distance: 869, station: 13, fromStation: 927, rank: 1 },
  { id: 'osm-relation-4671380', name: 'おとめ山公園', nameEn: 'Otomeyama Park', family: 'park', wikidata: 'Q11261964', x: -5855.3, z: -4082.9, distance: 309, station: 13, fromStation: 529, rank: 0 },
  { id: 'osm-way-607412476', name: '目白の森', nameEn: 'Mejiro Woods', family: 'park', wikidata: 'Q28154514', x: -6135.8, z: -4645.7, distance: 729, station: 13, fromStation: 729, rank: 1 },
  { id: 'osm-node-13569363447', name: 'アクティブ・ミュージアム「女たちの戦争と平和資料館」（wam）', nameEn: 'Women\'s Active Museum on War and Peace', family: 'museum', wikidata: 'Q11446206', x: -4560.6, z: -2946.4, distance: 1239, station: 14, fromStation: 1254, rank: 0 },
  { id: 'osm-way-94117009', name: '早稲田大学坪内博士記念演劇博物館', nameEn: 'Tsubouchi Memorial Theatre Museum', family: 'museum', wikidata: 'Q3951945', x: -4263.3, z: -3173, distance: 1463, station: 14, fromStation: 1466, rank: 1 },
  { id: 'osm-way-96217105', name: '諏訪神社', nameEn: 'Suwa Shrine', family: 'worship', wikidata: 'Q11631928', x: -5336.6, z: -3068.9, distance: 459, station: 14, fromStation: 542, rank: 0 },
  { id: 'osm-way-472434151', name: '下落合 氷川神社', nameEn: 'Shimo-Ochiai Hikawa Shrine', family: 'worship', wikidata: 'Q11549608', x: -6107.4, z: -3928.2, distance: 516, station: 14, fromStation: 612, rank: 1 },
  { id: 'osm-way-94518684', name: '都立戸山公園', nameEn: 'Toyama Park', family: 'park', wikidata: 'Q10950260', x: -5480.2, z: -2785.3, distance: 399, station: 14, fromStation: 721, rank: 0 },
  { id: 'osm-way-150773380', name: '落合中央公園', nameEn: 'Ochiai Central Park', family: 'park', wikidata: 'Q11620561', x: -6643.6, z: -3459.2, distance: 905, station: 14, fromStation: 945, rank: 1 },
  { id: 'osm-way-94117018', name: '早稲田大学大隈記念講堂', nameEn: 'Okuma Auditorium', family: 'historic', wikidata: 'Q2870807', x: -4078.4, z: -3061.6, distance: 1671, station: 14, fromStation: 1671, rank: 0 },
  { id: 'osm-node-6589553987', name: 'サムライミュージアム', nameEn: 'Samurai Museum', family: 'museum', wikidata: 'Q116917907', x: -5705.7, z: -1568.6, distance: 379, station: 15, fromStation: 706, rank: 0 },
  { id: 'osm-node-1420783718', name: '東京女子医科大学史料室・吉岡彌生記念室', nameEn: 'Tokyo Women\'s Medical University Archives and Yayoi Yoshioka Memorial Room', family: 'museum', wikidata: 'Q104698247', x: -4192.3, z: -1757.2, distance: 1840, station: 15, fromStation: 1866, rank: 1 },
  { id: 'osm-node-4716326648', name: '皆中稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q11580916', x: -6084.5, z: -2203, distance: 81, station: 15, fromStation: 82, rank: 0 },
  { id: 'osm-node-4716326381', name: '東京媽祖廟', nameEn: 'Tokyo Maso Temple', family: 'worship', wikidata: 'Q101064626', x: -6229.5, z: -1990.3, distance: 209, station: 15, fromStation: 315, rank: 1 },
  { id: 'osm-way-103280980', name: '大久保公園', nameEn: 'Okubo Park', family: 'park', wikidata: 'Q126454791', x: -5907.9, z: -1777.8, distance: 139, station: 15, fromStation: 442, rank: 0 },
  { id: 'osm-way-572498043', name: 'SOMPO美術館', nameEn: 'Sompo Museum of Art', family: 'museum', wikidata: 'Q1614504', x: -6341, z: -1241.7, distance: 308, station: 16, fromStation: 528, rank: 0 },
  { id: 'osm-node-1420779754', name: '平和祈念展示資料館', nameEn: 'Memorial Museum for Soldiers, Detainees in Siberia, and Postwar Repatriates', family: 'museum', wikidata: 'Q56025796', x: -6704.9, z: -1094.4, distance: 680, station: 16, fromStation: 752, rank: 1 },
  { id: 'osm-way-138522541', name: '新宿瑠璃光院白蓮華堂', nameEn: null, family: 'worship', wikidata: 'Q127271380', x: -6145.1, z: -654.5, distance: 189, station: 16, fromStation: 239, rank: 0 },
  { id: 'osm-way-155285250', name: '天龍寺', nameEn: 'Tenryuji Temple', family: 'worship', wikidata: 'Q17219126', x: -5646.4, z: -816.9, distance: 335, station: 16, fromStation: 351, rank: 1 },
  { id: 'osm-relation-13272644', name: '新宿中央公園', nameEn: 'Shinjuku Central Park', family: 'park', wikidata: 'Q5364883', x: -6987.4, z: -857, distance: 976, station: 16, fromStation: 991, rank: 0 },
  { id: 'osm-way-138698485', name: '明治神宮宝物殿', nameEn: 'Meiji Jingu Treasure Museum', family: 'museum', wikidata: 'Q133288913', x: -6204.5, z: 155.2, distance: 474, station: 17, fromStation: 570, rank: 0 },
  { id: 'osm-node-1420766948', name: '佐藤美術館', nameEn: 'Sato Museum of Art', family: 'museum', wikidata: 'Q11384365', x: -4669.5, z: -35.8, distance: 1065, station: 17, fromStation: 1198, rank: 1 },
  { id: 'osm-node-1934920328', name: '正春寺', nameEn: null, family: 'worship', wikidata: 'Q106836591', x: -6786.7, z: -305, distance: 902, station: 17, fromStation: 946, rank: 0 },
  { id: 'osm-way-235639469', name: '鳩森八幡神社', nameEn: 'Hatonomori Hachiman Jinja', family: 'worship', wikidata: 'Q11391084', x: -5158, z: 382.2, distance: 513, station: 17, fromStation: 955, rank: 1 },
  { id: 'osm-way-15772074', name: '新宿御苑', nameEn: 'Shinjuku Gyoen National Garden', family: 'park', wikidata: 'Q776863', x: -5130.4, z: -414.3, distance: 721, station: 17, fromStation: 723, rank: 0 },
  { id: 'osm-way-209695342', name: '代々木ポニー公園', nameEn: 'Yoyogi Pony Park', family: 'park', wikidata: 'Q42311965', x: -6473.6, z: 305.7, distance: 770, station: 17, fromStation: 865, rank: 1 },
  { id: 'osm-node-3935659186', name: 'たんきり子育地蔵尊', nameEn: null, family: 'historic', wikidata: 'Q120973137', x: -4287.6, z: -862.1, distance: 1646, station: 17, fromStation: 1658, rank: 0 },
  { id: 'osm-way-97234607', name: '東宮御所', nameEn: 'Tōgū Palace', family: 'historic', wikidata: 'Q1036008', x: -3752.9, z: 360.7, distance: 1917, station: 17, fromStation: 2186, rank: 1 },
  { id: 'osm-way-1135849071', name: '明治神宮ミュージアム', nameEn: 'Meiji Shrine Museum', family: 'museum', wikidata: 'Q127692420', x: -5828.5, z: 1005.9, distance: 72, station: 18, fromStation: 235, rank: 0 },
  { id: 'osm-way-139043736', name: '太田記念美術館', nameEn: 'Ota Memorial Museum of Art', family: 'museum', wikidata: 'Q3815442', x: -5578.4, z: 1327.3, distance: 229, station: 18, fromStation: 238, rank: 1 },
  { id: 'osm-way-179091082', name: '東郷神社', nameEn: 'Togo-jinja Shrine', family: 'worship', wikidata: 'Q1384780', x: -5458.3, z: 1091.6, distance: 307, station: 18, fromStation: 371, rank: 0 },
  { id: 'osm-way-138917022', name: '長泉寺', nameEn: 'Chōsen-ji', family: 'worship', wikidata: 'Q11653234', x: -5767.9, z: 1693.1, distance: 81, station: 18, fromStation: 456, rank: 1 },
  { id: 'osm-relation-19862716', name: '代々木公園', nameEn: 'Yoyogi Park', family: 'park', wikidata: 'Q1204253', x: -6356.6, z: 1266.6, distance: 551, station: 18, fromStation: 558, rank: 0 },
  { id: 'osm-way-209700263', name: 'はるのおがわコミュニティパーク', nameEn: 'Haruno Ogawa Community Park', family: 'park', wikidata: 'Q42311952', x: -6846, z: 1076.2, distance: 1060, station: 18, fromStation: 1060, rank: 1 },
  { id: 'osm-node-7125341604', name: 'ピエール・ド・クーベルタン', nameEn: 'Pierre de Coubertin', family: 'historic', wikidata: 'Q85847340', x: -4658, z: 682.1, distance: 1004, station: 18, fromStation: 1269, rank: 0 },
  { id: 'osm-node-10289966935', name: '東京アニメセンター', nameEn: 'Tokyo Anime Center', family: 'museum', wikidata: 'Q6128676', x: -5968.8, z: 2217.7, distance: 71, station: 19, fromStation: 383, rank: 0 },
  { id: 'osm-node-1420771752', name: '國學院大學博物館', nameEn: 'Kokugakuin University Museum', family: 'museum', wikidata: 'Q81916990', x: -5005.1, z: 2790, distance: 591, station: 19, fromStation: 880, rank: 1 },
  { id: 'osm-way-141293484', name: '金王八幡宮', nameEn: 'Konnou Hachimangu Shrine', family: 'worship', wikidata: 'Q11647638', x: -5455.1, z: 2640.3, distance: 325, station: 19, fromStation: 410, rank: 0 },
  { id: 'osm-way-511276638', name: '金王八幡宮', nameEn: 'Konno Hachimangu', family: 'worship', wikidata: 'Q11647638', x: -5435.4, z: 2643.1, distance: 340, station: 19, fromStation: 430, rank: 1 },
  { id: 'osm-way-116806278', name: '宮下公園', nameEn: 'Miyashita Park', family: 'park', wikidata: 'Q6884419', x: -5861.6, z: 2156.9, distance: 33, station: 19, fromStation: 429, rank: 0 },
  { id: 'osm-way-740993331', name: '美竹公園', nameEn: 'Mitake Park', family: 'park', wikidata: 'Q42312074', x: -5736.2, z: 2165.5, distance: 158, station: 19, fromStation: 438, rank: 1 },
  { id: 'osm-node-508446313', name: '二・二六事件慰霊像', nameEn: 'Memorial Monument of the 2.26 Incident', family: 'historic', wikidata: 'Q117312077', x: -6296.5, z: 1893.5, distance: 423, station: 19, fromStation: 818, rank: 0 },
  { id: 'osm-way-141296986', name: '常盤松御用邸', nameEn: 'Tokiwa Matsu Imperial Villa', family: 'historic', wikidata: 'Q65266322', x: -4867.7, z: 2638.6, distance: 791, station: 19, fromStation: 995, rank: 1 },
  { id: 'osm-node-250668627', name: '東京都写真美術館', nameEn: 'Tokyo Photographic Art Museum', family: 'museum', wikidata: 'Q862884', x: -4802.8, z: 4417.6, distance: 39, station: 20, fromStation: 616, rank: 0 },
  { id: 'osm-node-2512414734', name: '山種美術館', nameEn: 'Yamatane Museum of Art', family: 'museum', wikidata: 'Q3329572', x: -4783.5, z: 3127.1, distance: 588, station: 20, fromStation: 810, rank: 1 },
  { id: 'osm-node-340381542', name: '恵比寿神社', nameEn: 'Ebisu Shrine', family: 'worship', wikidata: 'Q11492406', x: -5312.3, z: 3788.5, distance: 166, station: 20, fromStation: 235, rank: 0 },
  { id: 'osm-node-3307021780', name: '台雲寺', nameEn: null, family: 'worship', wikidata: 'Q106836709', x: -4768.1, z: 3739.9, distance: 353, station: 20, fromStation: 353, rank: 1 },
  { id: 'osm-way-382975172', name: '恵比寿東公園', nameEn: 'Tako Park', family: 'park', wikidata: 'Q42312019', x: -4952.1, z: 3688.2, distance: 206, station: 20, fromStation: 235, rank: 0 },
  { id: 'osm-way-257726828', name: '恵比寿南二公園', nameEn: null, family: 'park', wikidata: 'Q42312038', x: -5229.5, z: 4202.8, distance: 260, station: 20, fromStation: 354, rank: 1 },
  { id: 'osm-node-1420766554', name: '久米美術館', nameEn: 'Kume Museum of Art', family: 'museum', wikidata: 'Q11369635', x: -4677.7, z: 5193.7, distance: 80, station: 21, fromStation: 108, rank: 0 },
  { id: 'osm-node-3347559020', name: '自転車文化センター', nameEn: 'Bicycle Culture Center', family: 'museum', wikidata: 'Q104698204', x: -4403.4, z: 5271.9, distance: 171, station: 21, fromStation: 182, rank: 1 },
  { id: 'osm-way-695900649', name: '大圓寺', nameEn: 'Daienji', family: 'worship', wikidata: 'Q11432581', x: -4769.5, z: 5387.9, distance: 211, station: 21, fromStation: 234, rank: 0 },
  { id: 'osm-way-243411399', name: '妙円寺', nameEn: 'Myoenji Temple', family: 'worship', wikidata: 'Q30929069', x: -4036, z: 5086.6, distance: 569, station: 21, fromStation: 570, rank: 1 },
  { id: 'osm-way-170295471', name: '林試の森公園', nameEn: 'Rinshi No Mori Park', family: 'park', wikidata: 'Q11533314', x: -5724.9, z: 6208.2, distance: 1372, station: 21, fromStation: 1493, rank: 0 },
  { id: 'osm-node-1420790339', name: '畠山記念館', nameEn: 'Ebara Hatakeyama Museum of Art', family: 'museum', wikidata: 'Q3330210', x: -3574.1, z: 5446.7, distance: 662, station: 22, fromStation: 723, rank: 0 },
  { id: 'osm-way-215976914', name: '箱根マイセンアンティーク美術館東京', nameEn: null, family: 'museum', wikidata: null, x: -3253.7, z: 5845.9, distance: 661, station: 22, fromStation: 666, rank: 1 },
  { id: 'osm-node-4873064221', name: '薬師寺東京別院', nameEn: null, family: 'worship', wikidata: 'Q132040935', x: -3983.9, z: 5868.5, distance: 77, station: 22, fromStation: 266, rank: 0 },
  { id: 'osm-way-1307864371', name: '宝塔寺', nameEn: null, family: 'worship', wikidata: 'Q97164942', x: -3563.6, z: 5862.4, distance: 387, station: 22, fromStation: 390, rank: 1 },
  { id: 'osm-way-570672664', name: 'ねむの木の庭', nameEn: null, family: 'park', wikidata: 'Q11275095', x: -3975.9, z: 5661.8, distance: 255, station: 22, fromStation: 459, rank: 0 },
  { id: 'osm-way-147617674', name: '池田山公園', nameEn: 'Ikedayama Park', family: 'park', wikidata: 'Q11551828', x: -3885.8, z: 5444.7, distance: 489, station: 22, fromStation: 663, rank: 1 },
  { id: 'osm-way-215725979', name: '翡翠原石館', nameEn: 'Jade Ore Museum', family: 'museum', wikidata: 'Q136707259', x: -2811.9, z: 6757.2, distance: 187, station: 23, fromStation: 599, rank: 0 },
  { id: 'osm-node-1420800659', name: 'Ｏ美術館', nameEn: 'O Art Museum', family: 'museum', wikidata: null, x: -3357.2, z: 6722.8, distance: 109, station: 23, fromStation: 141, rank: 1 },
  { id: 'osm-node-843098167', name: '居木神社', nameEn: 'Irugi Jinja', family: 'worship', wikidata: 'Q11465598', x: -3723.1, z: 6821.5, distance: 247, station: 23, fromStation: 322, rank: 0 },
  { id: 'osm-way-586631862', name: '貴船神社', nameEn: null, family: 'worship', wikidata: 'Q11634808', x: -3630.7, z: 7304.4, distance: 433, station: 23, fromStation: 503, rank: 1 },
  { id: 'osm-way-135154427', name: 'しながわ中央公園', nameEn: null, family: 'park', wikidata: 'Q11268912', x: -3453.5, z: 7961.5, distance: 884, station: 23, fromStation: 1107, rank: 0 },
  { id: 'osm-way-169889988', name: '戸越公園', nameEn: null, family: 'park', wikidata: 'Q11496628', x: -4041.2, z: 7868.2, distance: 1119, station: 23, fromStation: 1197, rank: 1 },
  { id: 'osm-node-1420789431', name: '物流博物館', nameEn: 'Logistics Museum', family: 'museum', wikidata: 'Q104698234', x: -3086.2, z: 5794.5, distance: 546, station: 24, fromStation: 549, rank: 0 },
  { id: 'osm-way-120269977', name: '東京海洋大学 マリンサイエンスミュージアム', nameEn: null, family: 'museum', wikidata: 'Q133225949', x: -1647.7, z: 5954.9, distance: 875, station: 24, fromStation: 899, rank: 1 },
  { id: 'osm-way-1337713345', name: '高山稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q107410076', x: -3013.5, z: 5995.5, distance: 482, station: 24, fromStation: 498, rank: 0 },
  { id: 'osm-way-279067986', name: '善福寺', nameEn: null, family: 'worship', wikidata: 'Q97164746', x: -2321.4, z: 6777.9, distance: 297, station: 24, fromStation: 960, rank: 1 },
  { id: 'osm-way-455666012', name: '港南公園', nameEn: null, family: 'park', wikidata: 'Q42311585', x: -1789.1, z: 6193, distance: 718, station: 24, fromStation: 828, rank: 0 },
  { id: 'osm-way-591143042', name: '東品川海上公園', nameEn: null, family: 'park', wikidata: 'Q11526368', x: -1529.7, z: 6974.8, distance: 1112, station: 24, fromStation: 1517, rank: 1 },
  { id: 'osm-way-172281540', name: '開東閣', nameEn: 'Kaitokaku', family: 'historic', wikidata: 'Q11655265', x: -2706.4, z: 6348.6, distance: 172, station: 24, fromStation: 533, rank: 0 },
  { id: 'osm-node-4662967611', name: '品川一里塚', nameEn: null, family: 'historic', wikidata: null, x: -2192.9, z: 6803.2, distance: 428, station: 24, fromStation: 1021, rank: 1 },
  { id: 'osm-way-653744410', name: '高輪神社', nameEn: 'Takanawa Shrine', family: 'worship', wikidata: 'Q3514174', x: -2575.9, z: 5102.3, distance: 215, station: 25, fromStation: 232, rank: 0 },
  { id: 'osm-way-215762071', name: '願生寺', nameEn: null, family: 'worship', wikidata: 'Q119928682', x: -2448.7, z: 4702.7, distance: 231, station: 25, fromStation: 400, rank: 1 },
  { id: 'osm-way-160703991', name: '三田台公園', nameEn: 'Mitadai Park', family: 'park', wikidata: 'Q11356683', x: -2414.1, z: 4316.7, distance: 303, station: 25, fromStation: 775, rank: 0 },
  { id: 'osm-way-1375876141', name: '八芳園', nameEn: 'Happo Gardens', family: 'park', wikidata: 'Q11391730', x: -3334.4, z: 4738.4, distance: 1051, station: 25, fromStation: 1051, rank: 1 },
  { id: 'osm-way-190883265', name: '高輪皇族邸', nameEn: 'Takanawa Imperial Residence', family: 'historic', wikidata: 'Q38255023', x: -2732.3, z: 4500, distance: 563, station: 25, fromStation: 705, rank: 0 },
  { id: 'osm-way-497167393', name: '第一芝浦丸', nameEn: null, family: 'historic', wikidata: null, x: -1405.4, z: 5304.3, distance: 957, station: 25, fromStation: 963, rank: 1 },
  { id: 'osm-node-11262093573', name: 'The History Museum of J-Koreans', nameEn: 'History Museum of J-Koreans', family: 'museum', wikidata: 'Q122929555', x: -2663.7, z: 3310.8, distance: 1068, station: 26, fromStation: 1153, rank: 0 },
  { id: 'osm-node-7231031105', name: '六本木ミュージアム', nameEn: 'Roppongi Museum', family: 'museum', wikidata: 'Q115977950', x: -2940.4, z: 2412.7, distance: 1954, station: 26, fromStation: 1970, rank: 1 },
  { id: 'osm-way-87510469', name: '御穂鹿嶋神社', nameEn: 'Miho Kashima-jinja Shrine', family: 'worship', wikidata: 'Q113386352', x: -1562, z: 3805.6, distance: 47, station: 26, fromStation: 195, rank: 0 },
  { id: 'osm-way-595744259', name: '正念寺', nameEn: null, family: 'worship', wikidata: 'Q131991643', x: -1402.1, z: 3581.5, distance: 158, station: 26, fromStation: 468, rank: 1 },
  { id: 'osm-way-104112028', name: '本芝公園', nameEn: 'Honshiba Park', family: 'park', wikidata: 'Q42311596', x: -1492.5, z: 3796.4, distance: 20, station: 26, fromStation: 254, rank: 0 },
  { id: 'osm-relation-14100096', name: '亀塚公園', nameEn: 'Kamezuka Park', family: 'park', wikidata: 'Q458122', x: -2324.4, z: 4226.6, distance: 243, station: 26, fromStation: 686, rank: 1 },
  { id: 'osm-node-1633971756', name: '江戸開城西郷南洲勝海舟会見之地', nameEn: 'Historic Place Where Saigo Takamori and Katsu Kaishu Met for the Negotiation for the Opening of Edo Castle', family: 'historic', wikidata: 'Q133362241', x: -1608.2, z: 3774.9, distance: 97, station: 26, fromStation: 192, rank: 0 },
  { id: 'osm-node-1754776529', name: '厳流稲荷社 茶之木稲荷神社', nameEn: null, family: 'historic', wikidata: 'Q113385887', x: -1816.6, z: 3721.1, distance: 250, station: 26, fromStation: 251, rank: 1 },
  { id: 'osm-node-10163996662', name: '勝どき・豊海歴史資料展示館', nameEn: 'Kachidoki-Toyoumi Historical Materials Exhibition Hall', family: 'museum', wikidata: null, x: 880.8, z: 2459.2, distance: 1621, station: 27, fromStation: 1791, rank: 0 },
  { id: 'osm-node-12538036885', name: '讃岐小白稲荷神社', nameEn: null, family: 'worship', wikidata: 'Q131924400', x: -935.2, z: 3028.5, distance: 52, station: 27, fromStation: 150, rank: 0 },
  { id: 'osm-node-12538725014', name: '仏願寺', nameEn: null, family: 'worship', wikidata: 'Q131925660', x: -1154, z: 2645.1, distance: 347, station: 27, fromStation: 395, rank: 1 },
  { id: 'osm-way-4848909', name: '旧芝離宮恩賜庭園', nameEn: 'Kyu Shiba Rikyu Garden', family: 'park', wikidata: 'Q3266874', x: -716.1, z: 2917.2, distance: 139, station: 27, fromStation: 139, rank: 0 },
  { id: 'osm-way-431521972', name: '港区立イタリア公園', nameEn: 'Minato-ku Italy Park', family: 'park', wikidata: 'Q76860005', x: -662.3, z: 2425.4, distance: 93, station: 27, fromStation: 515, rank: 1 },
  { id: 'osm-node-12538725018', name: '首尾稲荷大明神', nameEn: null, family: 'historic', wikidata: 'Q131925805', x: -1206.7, z: 2864.6, distance: 352, station: 27, fromStation: 354, rank: 0 },
  { id: 'osm-way-87439175', name: '旧台徳院霊廟惣門', nameEn: 'Somon (Gate of Daitokuin Mausoleum)', family: 'historic', wikidata: 'Q113385105', x: -1520, z: 2788.5, distance: 674, station: 27, fromStation: 675, rank: 1 },
  { id: 'osm-node-820849494', name: '旧新橋停車場鉄道歴史展示室', nameEn: 'Old Shimbashi Station Railway History Exhibition Hall', family: 'museum', wikidata: 'Q104698226', x: -442.8, z: 1699.7, distance: 312, station: 28, fromStation: 321, rank: 0 },
  { id: 'osm-node-1420786016', name: 'パナソニック汐留美術館', nameEn: 'Panasonic Shiodome Museum of Art', family: 'museum', wikidata: 'Q11550512', x: -419.1, z: 1712.8, distance: 333, station: 28, fromStation: 346, rank: 1 },
  { id: 'osm-node-260408025', name: '烏森神社', nameEn: 'Karasumori Shrine', family: 'worship', wikidata: 'Q11567255', x: -877.8, z: 1606.7, distance: 107, station: 28, fromStation: 135, rank: 0 },
  { id: 'osm-node-1025845868', name: '日比谷神社', nameEn: 'Hibiya-jinja Shrine', family: 'worship', wikidata: 'Q11509587', x: -743, z: 1983.1, distance: 20, station: 28, fromStation: 307, rank: 1 },
  { id: 'osm-way-151332916', name: '南桜公園', nameEn: 'Minamisakura Park', family: 'park', wikidata: 'Q62678168', x: -1252.7, z: 1661.8, distance: 486, station: 28, fromStation: 490, rank: 0 },
  { id: 'osm-way-680786005', name: 'はとば', nameEn: 'Hatoba', family: 'park', wikidata: 'Q42311590', x: 779.2, z: 1908.7, distance: 1503, station: 28, fromStation: 1559, rank: 1 },
  { id: 'osm-relation-7826097', name: '旧新橋停車場', nameEn: 'Old Shimbashi Station', family: 'historic', wikidata: 'Q7497865', x: -456.4, z: 1703.5, distance: 298, station: 28, fromStation: 307, rank: 0 },
  { id: 'osm-node-5016411427', name: 'D51機関車の動輪', nameEn: null, family: 'historic', wikidata: null, x: -703.3, z: 1683.3, distance: 58, station: 28, fromStation: 60, rank: 1 },
  { id: 'osm-node-3666894176', name: '相田みつを美術館', nameEn: 'Mitsuo Aida Museum', family: 'museum', wikidata: 'Q11582309', x: -184.1, z: 421.7, distance: 67, station: 29, fromStation: 307, rank: 0 },
  { id: 'osm-way-306116935', name: '三菱一号館', nameEn: 'Mitsubishi Ichigokan Museum', family: 'museum', wikidata: 'Q3815458', x: -306.8, z: 310.3, distance: 218, station: 29, fromStation: 388, rank: 1 },
  { id: 'osm-node-2429693513', name: '銀座教会', nameEn: 'Ginza Church', family: 'worship', wikidata: 'Q11650005', x: -199.3, z: 916.6, distance: 240, station: 29, fromStation: 249, rank: 0 },
  { id: 'osm-node-3409862206', name: '朝日稲荷神社', nameEn: 'Asahi Inari Shrine', family: 'worship', wikidata: 'Q112334821', x: 52.6, z: 1103.3, distance: 549, station: 29, fromStation: 549, rank: 1 },
  { id: 'osm-way-145408909', name: '日比谷公園', nameEn: 'Hibiya Park', family: 'park', wikidata: 'Q1378533', x: -937.8, z: 839.5, distance: 396, station: 29, fromStation: 636, rank: 0 },
  { id: 'osm-relation-3551852', name: '皇居外苑', nameEn: 'Kokyo Gaien National Garden', family: 'park', wikidata: 'Q844963', x: -779.1, z: 145.8, distance: 718, station: 29, fromStation: 720, rank: 1 },
  { id: 'osm-relation-8048114', name: '明治生命館', nameEn: 'Meiji Mutual Life Insurance Building', family: 'historic', wikidata: 'Q3023897', x: -446.5, z: 252.7, distance: 369, station: 29, fromStation: 463, rank: 0 },
  { id: 'osm-node-4235132094', name: '楠正成像', nameEn: 'Statue of Kusunoki Masashige', family: 'historic', wikidata: 'Q99769697', x: -731.1, z: 372.6, distance: 521, station: 29, fromStation: 526, rank: 1 },
];

/** Portée du relevé (m) : au-delà, c'est l'affaire de l'horizon géographique. */
export const NEAR_REACH = 2000;

/** Combien de candidats le relevé garde par gare et par famille. */
export const NEAR_PER_FAMILY = 2;

const BY_ID = new Map(NEAR_LANDMARKS.map((lm) => [lm.id, lm]));

/** Le repère réel d'identifiant `id`, ou `undefined`. */
export function nearLandmark(id: string): NearLandmark | undefined {
  return BY_ID.get(id);
}
