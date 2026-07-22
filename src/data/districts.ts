// Profils de quartier par gare : ce qui change dans les alentours d'une station
// à l'autre (densité, hauteur, palette, enseignes, motifs de façade et repères
// 3D). Indexé 0..29, exactement dans l'ordre de STATIONS / DOOR_SIDE / store.index.
//
// Tout reste procédural et stylisé (esprit Shashingo) : aucune donnée
// géographique réelle, aucune marque déposée — juste le CARACTÈRE reconnaissable
// de chaque quartier (Akihabara électrique, Ueno verdoyant, Shibuya écrans,
// Yūrakuchō arches de brique, Hamamatsuchō Tokyo Tower…).
//
// `erasableSyntaxOnly` interdit les enum : on utilise des unions de littéraux.

// Motifs de façade dessinés dans la texture de ville (drawCityInto).
export type Feat =
  | 'glassTowers'
  | 'redBrick'
  | 'brickArch'
  | 'officeTowers'
  | 'skyscraperCluster'
  | 'modernWhite'
  | 'electricNeon'
  | 'animeBillboard'
  | 'giantScreen'
  | 'departmentStore'
  | 'fashionBoutique'
  | 'shotengai'
  | 'lowriseMarket'
  | 'elevatedIzakaya'
  | 'salarymanIzakaya'
  | 'koreatownSigns'
  | 'studentArcade'
  | 'templeLowtown'
  | 'parkGreen'
  | 'torii'
  | 'tram'
  | 'monorail'
  | 'shinkansen'
  | 'upscaleResidential';

// Repères 3D emblématiques (géométrie primitive, cf. three/Landmarks.tsx).
export type Land =
  | 'tokyoTower'
  | 'latticeTower'
  | 'glassTowerCluster'
  | 'boxyTower'
  | 'twinTowers'
  | 'officeBlock'
  | 'giantScreenWall'
  | 'cylinderFashion'
  | 'redBrickStation'
  | 'brickViaduct'
  | 'marketArcade'
  | 'toriiForest'
  | 'forestMass'
  | 'museumFacade'
  | 'templeRoof'
  | 'tramCar'
  | 'monorailBeam'
  | 'shinkansenSet'
  | 'steamLoco'
  | 'gardenPlaceArch'
  | 'kabukichoGate'
  | 'whiteLatticeRoof'
  | 'stackedSignFacade';

export interface LandmarkSpec {
  kind: Land;
  side?: 1 | -1; // côté de la voie (+x / -x). Par défaut : côté droit (1).
  scale?: number; // échelle globale (défaut 1).
  near?: boolean; // repère au niveau de la voie qui défile (sinon silhouette lointaine).
}

export interface District {
  name: string; // repère de debug (correspond au romaji de STATIONS).
  density: number; // 0..1 → inverse de gapChance (plus dense = moins de trouées).
  maxHeight: number; // 0..1 → multiplie la hauteur des blocs.
  facades?: string[]; // palette façade jour (sinon défaut du module procédural).
  nightFacades?: string[]; // palette façade nuit — MÊME longueur/ordre (invariant du fondu).
  neon?: string[]; // palette enseignes/néon (sinon défaut).
  accent: string; // teinte dominante des enseignes / ambiance.
  words: string[]; // enseignes plausibles du quartier (jamais de marque réelle).
  roofWords?: string[]; // enseignes de toit (sinon défaut).
  feats: Feat[];
  landmarks: LandmarkSpec[];
}

// --- Palettes réutilisées (jour / nuit appariées, même longueur/ordre) ---
const OFFICE_DAY = ['#c8d2dc', '#bcc8d4', '#d2dae2', '#c0ccd6', '#cdd6de', '#b6c2ce', '#d6dee6'];
const OFFICE_NIGHT = ['#2c3442', '#28303e', '#303846', '#2a3240', '#2e3644', '#242c3a', '#323a48'];
const WHITE_DAY = ['#e8e6e0', '#e0ded6', '#eceae4', '#e4e2da', '#eae8e2', '#dedcd4', '#f0eee8'];
const WHITE_NIGHT = ['#33383f', '#2e333a', '#363b42', '#31363d', '#383d44', '#2c3138', '#3c414a'];
const OLD_DAY = ['#dcd2c0', '#d8ccb8', '#e0d6c4', '#d4c8b4', '#dccfba', '#cfc2ac', '#e2d8c6'];
const OLD_NIGHT = ['#38352c', '#34302a', '#3c372e', '#332f28', '#39342c', '#302c24', '#3e3930'];
const BRICK_DAY = ['#b06a4e', '#a85f45', '#bd7455', '#9e5840', '#b3684c', '#a35a42', '#c07a5a'];
const BRICK_NIGHT = ['#4a2e24', '#442a20', '#503228', '#3f271e', '#4c2f25', '#3a241c', '#54362a'];
const GREEN_DAY = ['#c6d2b4', '#d0dcc0', '#bccaa8', '#d6e0c8', '#c2d0b0', '#cddbbf', '#b8c8a4'];
const GREEN_NIGHT = ['#2c3628', '#303a2c', '#283224', '#343e30', '#2a3426', '#323c2e', '#263022'];
// Palette chaude proche du défaut du module procédural (marché / shotengai).
const WARM_DAY = ['#e6dcc9', '#e4cfc5', '#e8ddc8', '#e0d7c0', '#e8e1cf', '#e2d2be', '#e7d6c2'];

// --- Palettes de néon / enseignes ---
const NEON_COOL = ['#8fd0ff', '#a9e0ff', '#c9f0ff', '#9fd8ff', '#b8e6ff', '#8fc8ff'];
const NEON_HOT = ['#ff5a7a', '#5ad0ff', '#ffe14a', '#7affb0', '#ff8f4a', '#c97fff'];
const NEON_WARM = ['#ff9a84', '#ffd88a', '#ffb066', '#ffc27a', '#ff8f6a', '#ffe0a0'];
const NEON_PINK = ['#ff6fae', '#ff8fc4', '#ff5a92', '#ffb0d4', '#ff7ab0', '#ff9ec8'];

// Profil de repli : conserve l'aspect générique d'origine si aucun quartier n'est fourni.
export const GENERIC: District = {
  name: 'Generic',
  density: 0.66,
  maxHeight: 0.62,
  accent: '#c9503e',
  words: ['寿司', '居酒屋', 'カラオケ', '薬局', '書店', 'ラーメン', '喫茶', 'ホテル', '不動産', '歯科'],
  feats: [],
  landmarks: [],
};

// --- Les 30 quartiers (JY01 → JY30), dans l'ordre de STATIONS ---
export const DISTRICTS: District[] = [
  // 0 · JY01 Tokyo — Marunouchi : tours de verre + gare de brique rouge.
  {
    name: 'Tokyo',
    density: 0.9,
    maxHeight: 0.95,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    neon: NEON_COOL,
    accent: '#4a6fae',
    words: ['銀行', '商事', '証券', '本社', '保険', '珈琲'],
    feats: ['glassTowers', 'officeTowers', 'redBrick'],
    landmarks: [
      { kind: 'redBrickStation', side: 1 },
      { kind: 'glassTowerCluster', side: -1, scale: 1.15 },
    ],
  },
  // 1 · JY02 Kanda — izakaya sous la voie, arches de brique.
  {
    name: 'Kanda',
    density: 0.72,
    maxHeight: 0.55,
    facades: OLD_DAY,
    nightFacades: OLD_NIGHT,
    neon: NEON_WARM,
    accent: '#c86a3a',
    words: ['居酒屋', '焼鳥', '立呑', '甘味', '古書', '定食'],
    feats: ['elevatedIzakaya', 'salarymanIzakaya', 'brickArch'],
    landmarks: [{ kind: 'brickViaduct', side: 1, near: true }],
  },
  // 2 · JY03 Akihabara — Electric Town : néons, panneaux « anime ».
  {
    name: 'Akihabara',
    density: 0.95,
    maxHeight: 0.7,
    neon: NEON_HOT,
    accent: '#e23a5c',
    words: ['電気', '無線', '免税', 'ゲーム', '家電', '書店'],
    roofWords: ['電気街', '無線堂', '未来電子', '秋葉市場', '光の街'],
    feats: ['electricNeon', 'animeBillboard', 'departmentStore'],
    landmarks: [
      { kind: 'giantScreenWall', side: -1 },
      { kind: 'stackedSignFacade', side: 1 },
    ],
  },
  // 3 · JY04 Okachimachi — Ameyoko : marché bas, échoppes.
  {
    name: 'Okachimachi',
    density: 0.85,
    maxHeight: 0.35,
    facades: WARM_DAY,
    accent: '#c8503a',
    words: ['市場', '鮮魚', '宝石', '激安', '乾物', '衣料'],
    feats: ['lowriseMarket', 'shotengai'],
    landmarks: [{ kind: 'marketArcade', side: 1, near: true }],
  },
  // 4 · JY05 Ueno — parc et musées : verdure généreuse.
  {
    name: 'Ueno',
    density: 0.4,
    maxHeight: 0.4,
    facades: GREEN_DAY,
    nightFacades: GREEN_NIGHT,
    accent: '#4a8a3a',
    words: ['美術館', '博物館', '珈琲', '名店', '甘味', '動物園'],
    feats: ['parkGreen', 'templeLowtown'],
    landmarks: [
      { kind: 'forestMass', side: -1, scale: 1.2 },
      { kind: 'museumFacade', side: 1 },
    ],
  },
  // 5 · JY06 Uguisudani — hôtels/ryokan, temples, arrière discret.
  {
    name: 'Uguisudani',
    density: 0.6,
    maxHeight: 0.35,
    facades: OLD_DAY,
    nightFacades: OLD_NIGHT,
    neon: NEON_WARM,
    accent: '#b06a5a',
    words: ['ホテル', '旅館', '甘味', '銭湯', '花', '喫茶'],
    feats: ['templeLowtown', 'shotengai'],
    landmarks: [
      { kind: 'templeRoof', side: 1 },
      { kind: 'forestMass', side: -1, scale: 0.7 },
    ],
  },
  // 6 · JY07 Nippori — vieux quartier du tissu, temples.
  {
    name: 'Nippori',
    density: 0.55,
    maxHeight: 0.35,
    facades: OLD_DAY,
    nightFacades: OLD_NIGHT,
    accent: '#9a6a4a',
    words: ['生地', '呉服', '手芸', '骨董', '寺', '珈琲'],
    feats: ['templeLowtown', 'shotengai'],
    landmarks: [
      { kind: 'templeRoof', side: 1 },
      { kind: 'latticeTower', side: -1, scale: 1.3 },
    ],
  },
  // 7 · JY08 Nishi-Nippori — résidentiel, temples.
  {
    name: 'Nishi-Nippori',
    density: 0.5,
    maxHeight: 0.3,
    facades: OLD_DAY,
    nightFacades: OLD_NIGHT,
    accent: '#8a6a4a',
    words: ['寺', '米', '豆腐', '酒', '花', '塾'],
    feats: ['templeLowtown', 'upscaleResidential'],
    landmarks: [{ kind: 'templeRoof', side: 1 }],
  },
  // 8 · JY09 Tabata — résidentiel calme.
  {
    name: 'Tabata',
    density: 0.45,
    maxHeight: 0.4,
    facades: OLD_DAY,
    nightFacades: OLD_NIGHT,
    accent: '#7a8a6a',
    words: ['米', 'パン', '花', '珈琲', '塾', '美容'],
    feats: ['upscaleResidential', 'parkGreen'],
    landmarks: [{ kind: 'forestMass', side: -1, scale: 0.7 }],
  },
  // 9 · JY10 Komagome — jardins, torii, cerisiers.
  {
    name: 'Komagome',
    density: 0.4,
    maxHeight: 0.35,
    facades: GREEN_DAY,
    nightFacades: GREEN_NIGHT,
    accent: '#c86a8a',
    words: ['園芸', '花', '和菓子', '珈琲', '塾', '茶'],
    feats: ['parkGreen', 'torii', 'upscaleResidential'],
    landmarks: [
      { kind: 'toriiForest', side: 1 },
      { kind: 'forestMass', side: -1, scale: 0.9 },
    ],
  },
  // 10 · JY11 Sugamo — shotengai des anciens, temple Jizō.
  {
    name: 'Sugamo',
    density: 0.65,
    maxHeight: 0.35,
    facades: WARM_DAY,
    accent: '#c8443a',
    words: ['甘味', '呉服', '大福', '地蔵', '名店', '茶'],
    feats: ['shotengai', 'templeLowtown'],
    landmarks: [
      { kind: 'marketArcade', side: 1, near: true },
      { kind: 'templeRoof', side: -1 },
    ],
  },
  // 11 · JY12 Ōtsuka — tramway Toden, izakaya.
  {
    name: 'Otsuka',
    density: 0.6,
    maxHeight: 0.5,
    facades: WARM_DAY,
    neon: NEON_WARM,
    accent: '#c86a3a',
    words: ['都電', '居酒屋', '甘味', '喫茶', 'ラーメン', '酒場'],
    feats: ['tram', 'shotengai', 'salarymanIzakaya'],
    landmarks: [{ kind: 'tramCar', side: 1, near: true }],
  },
  // 12 · JY13 Ikebukuro — gratte-ciel, grands magasins.
  {
    name: 'Ikebukuro',
    density: 0.9,
    maxHeight: 0.9,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    neon: NEON_HOT,
    accent: '#c8503a',
    words: ['百貨店', '家電', '書店', '劇場', 'ラーメン', '珈琲'],
    feats: ['skyscraperCluster', 'departmentStore', 'electricNeon'],
    landmarks: [
      { kind: 'boxyTower', side: -1, scale: 1.2 },
      { kind: 'giantScreenWall', side: 1 },
    ],
  },
  // 13 · JY14 Mejiro — résidentiel haut de gamme, verdure.
  {
    name: 'Mejiro',
    density: 0.4,
    maxHeight: 0.45,
    facades: GREEN_DAY,
    nightFacades: GREEN_NIGHT,
    accent: '#6a8a5a',
    words: ['珈琲', '花', '学院', 'パン', '美容', '雑貨'],
    feats: ['upscaleResidential', 'parkGreen'],
    landmarks: [{ kind: 'forestMass', side: 1, scale: 1.0 }],
  },
  // 14 · JY15 Takadanobaba — quartier étudiant, arcades.
  {
    name: 'Takadanobaba',
    density: 0.9,
    maxHeight: 0.5,
    neon: NEON_WARM,
    accent: '#d88a3a',
    words: ['ラーメン', '学生', '古本', 'カレー', '定食', '酒場'],
    feats: ['studentArcade', 'shotengai', 'electricNeon'],
    landmarks: [{ kind: 'stackedSignFacade', side: 1 }],
  },
  // 15 · JY16 Shin-Ōkubo — Koreatown, enseignes denses.
  {
    name: 'Shin-Okubo',
    density: 0.98,
    maxHeight: 0.55,
    neon: NEON_PINK,
    accent: '#e2508a',
    words: ['韓国', 'コスメ', '焼肉', 'チーズ', 'カフェ', '雑貨'],
    feats: ['koreatownSigns', 'electricNeon'],
    landmarks: [{ kind: 'stackedSignFacade', side: 1, scale: 1.1 }],
  },
  // 16 · JY17 Shinjuku — gratte-ciels + néons massifs.
  {
    name: 'Shinjuku',
    density: 1.0,
    maxHeight: 1.0,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    neon: NEON_HOT,
    accent: '#e23a5c',
    words: ['歌舞伎', '劇場', '百貨店', '珈琲', '酒場', '家電'],
    feats: ['skyscraperCluster', 'giantScreen', 'electricNeon', 'departmentStore'],
    landmarks: [
      { kind: 'twinTowers', side: -1, scale: 1.25 },
      { kind: 'giantScreenWall', side: 1 },
      { kind: 'kabukichoGate', side: 1, near: true },
    ],
  },
  // 17 · JY18 Yoyogi — bureaux, lisière de parc, flèche fine.
  {
    name: 'Yoyogi',
    density: 0.7,
    maxHeight: 0.85,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    accent: '#5a7aae',
    words: ['学院', '珈琲', '予備校', '書店', '花', '定食'],
    feats: ['officeTowers', 'parkGreen'],
    landmarks: [
      { kind: 'latticeTower', side: 1, scale: 1.1 },
      { kind: 'forestMass', side: -1, scale: 1.0 },
    ],
  },
  // 18 · JY19 Harajuku — mode/Takeshita, forêt de Meiji.
  {
    name: 'Harajuku',
    density: 0.6,
    maxHeight: 0.45,
    neon: NEON_PINK,
    accent: '#e070a8',
    words: ['原宿', 'クレープ', '古着', 'カフェ', '雑貨', '美容'],
    feats: ['fashionBoutique', 'torii', 'parkGreen'],
    landmarks: [
      { kind: 'toriiForest', side: -1, scale: 1.3 },
      { kind: 'forestMass', side: -1, scale: 1.1 },
    ],
  },
  // 19 · JY20 Shibuya — écrans géants, mode, néon.
  {
    name: 'Shibuya',
    density: 0.92,
    maxHeight: 0.8,
    neon: NEON_HOT,
    accent: '#e2506a',
    words: ['渋谷', 'ファッション', 'カフェ', '音楽', '古着', '雑貨'],
    feats: ['giantScreen', 'fashionBoutique', 'electricNeon'],
    landmarks: [
      { kind: 'giantScreenWall', side: 1 },
      { kind: 'giantScreenWall', side: -1, scale: 0.9 },
      { kind: 'cylinderFashion', side: 1 },
    ],
  },
  // 20 · JY21 Ebisu — bureaux, brique, chic (Garden Place).
  {
    name: 'Ebisu',
    density: 0.7,
    maxHeight: 0.7,
    facades: BRICK_DAY,
    nightFacades: BRICK_NIGHT,
    accent: '#b06a4a',
    words: ['恵比寿', '麦酒', '珈琲', '洋食', '硝子', '雑貨'],
    feats: ['officeTowers', 'redBrick', 'upscaleResidential'],
    landmarks: [
      { kind: 'gardenPlaceArch', side: 1 },
      { kind: 'redBrickStation', side: -1, scale: 0.9 },
    ],
  },
  // 21 · JY22 Meguro — résidentiel haut de gamme, coteaux.
  {
    name: 'Meguro',
    density: 0.55,
    maxHeight: 0.6,
    facades: WHITE_DAY,
    nightFacades: WHITE_NIGHT,
    accent: '#7a8a9a',
    words: ['目黒', '珈琲', '美容', '花', '家具', '雑貨'],
    feats: ['upscaleResidential', 'officeTowers', 'templeLowtown'],
    landmarks: [
      { kind: 'officeBlock', side: 1 },
      { kind: 'templeRoof', side: -1 },
    ],
  },
  // 22 · JY23 Gotanda — bureaux, izakaya sous la voie.
  {
    name: 'Gotanda',
    density: 0.7,
    maxHeight: 0.7,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    neon: NEON_WARM,
    accent: '#6a7a9a',
    words: ['五反田', '居酒屋', '会計', '珈琲', '酒場', '定食'],
    feats: ['officeTowers', 'elevatedIzakaya', 'salarymanIzakaya'],
    landmarks: [
      { kind: 'officeBlock', side: 1 },
      { kind: 'brickViaduct', side: -1, near: true },
    ],
  },
  // 23 · JY24 Ōsaki — tours de verre modernes, passerelles.
  {
    name: 'Osaki',
    density: 0.8,
    maxHeight: 0.85,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    neon: NEON_COOL,
    accent: '#4a78c8',
    words: ['大崎', '本社', '珈琲', '医院', '会議', '食堂'],
    feats: ['glassTowers', 'modernWhite', 'officeTowers'],
    landmarks: [{ kind: 'glassTowerCluster', side: 1, scale: 1.1 }],
  },
  // 24 · JY25 Shinagawa — tours de bureaux, shinkansen.
  {
    name: 'Shinagawa',
    density: 0.85,
    maxHeight: 0.85,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    neon: NEON_COOL,
    accent: '#4a6fae',
    words: ['品川', '本社', 'ホテル', '珈琲', '会議', '食堂'],
    feats: ['officeTowers', 'glassTowers', 'shinkansen'],
    landmarks: [
      { kind: 'glassTowerCluster', side: -1, scale: 1.1 },
      { kind: 'shinkansenSet', side: 1, near: true },
    ],
  },
  // 25 · JY26 Takanawa Gateway — architecture blanche moderne.
  {
    name: 'Takanawa Gateway',
    density: 0.6,
    maxHeight: 0.8,
    facades: WHITE_DAY,
    nightFacades: WHITE_NIGHT,
    neon: NEON_COOL,
    accent: '#8aa0b8',
    words: ['高輪', '珈琲', 'ギャラリー', '茶', '花'],
    feats: ['modernWhite', 'glassTowers'],
    landmarks: [
      { kind: 'whiteLatticeRoof', side: 1 },
      { kind: 'glassTowerCluster', side: -1, scale: 0.95 },
    ],
  },
  // 26 · JY27 Tamachi — bureaux, petit shotengai.
  {
    name: 'Tamachi',
    density: 0.65,
    maxHeight: 0.65,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    accent: '#5a7a9a',
    words: ['田町', '会社', '定食', '珈琲', '学', '酒場'],
    feats: ['officeTowers', 'shotengai', 'upscaleResidential'],
    landmarks: [
      { kind: 'officeBlock', side: 1 },
      { kind: 'marketArcade', side: -1, near: true, scale: 0.8 },
    ],
  },
  // 27 · JY28 Hamamatsuchō — bureaux, monorail, Tokyo Tower.
  {
    name: 'Hamamatsucho',
    density: 0.7,
    maxHeight: 0.8,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    accent: '#c86a4a',
    words: ['浜松町', '貿易', '珈琲', '空港', 'ホテル', '会議'],
    feats: ['officeTowers', 'monorail'],
    landmarks: [
      { kind: 'tokyoTower', side: -1, scale: 1.15 },
      { kind: 'monorailBeam', side: 1, near: true },
    ],
  },
  // 28 · JY29 Shimbashi — salaryman izakaya, Shiodome.
  {
    name: 'Shimbashi',
    density: 0.9,
    maxHeight: 0.8,
    facades: OFFICE_DAY,
    nightFacades: OFFICE_NIGHT,
    neon: NEON_WARM,
    accent: '#c8683a',
    words: ['新橋', '居酒屋', '焼鳥', '商事', 'ホテル', '酒場'],
    feats: ['salarymanIzakaya', 'skyscraperCluster', 'brickArch'],
    landmarks: [
      { kind: 'glassTowerCluster', side: -1, scale: 1.15 },
      { kind: 'steamLoco', side: 1, near: true },
      { kind: 'brickViaduct', side: 1, near: true },
    ],
  },
  // 29 · JY30 Yūrakuchō — arches de brique, abords de Ginza.
  {
    name: 'Yurakucho',
    density: 0.75,
    maxHeight: 0.7,
    facades: BRICK_DAY,
    nightFacades: BRICK_NIGHT,
    neon: NEON_WARM,
    accent: '#b06a4a',
    words: ['有楽町', '銀座', '百貨店', '珈琲', '画廊', '洋食'],
    feats: ['brickArch', 'departmentStore', 'elevatedIzakaya', 'upscaleResidential'],
    landmarks: [{ kind: 'brickViaduct', side: 1, near: true }],
  },
];
