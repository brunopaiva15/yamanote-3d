// Lignes en correspondance : couleur officielle et romaji, pour les tableaux
// d'orientation suspendus au-dessus du quai.
//
// Les noms japonais sont exactement ceux de data/stations.ts (TRANSFERS), qui
// sert aux annonces : une seule orthographe, deux usages. Les couleurs sont
// celles des chartes JR East / Tokyo Metro / Toei ; pour quelques compagnies
// privées elles sont approchées - l'important à l'écran est qu'une pastille
// orange ne se retrouve pas là où tout le monde attend du bleu.
//
// Sortie de secours pour une ligne absente de la table : pastille grise et pas
// de romaji, plutôt qu'une couleur inventée au hasard.

export interface TransitLine {
  color: string;
  romaji: string;
}

export const LINES: Record<string, TransitLine> = {
  // --- JR East ---
  山手線: { color: '#9acd32', romaji: 'Yamanote' },
  京浜東北線: { color: '#00b2e5', romaji: 'Keihin-Tōhoku' },
  中央線: { color: '#f15a22', romaji: 'Chūō' },
  '中央・総武線': { color: '#ffd400', romaji: 'Chūō-Sōbu' },
  総武線快速: { color: '#0067c0', romaji: 'Sōbu Rapid' },
  東海道線: { color: '#f68b1e', romaji: 'Tōkaidō' },
  横須賀線: { color: '#0067c0', romaji: 'Yokosuka' },
  京葉線: { color: '#c9252f', romaji: 'Keiyō' },
  埼京線: { color: '#00ac9a', romaji: 'Saikyō' },
  湘南新宿ライン: { color: '#e21f26', romaji: 'Shōnan-Shinjuku' },
  上野東京ライン: { color: '#ee7b1e', romaji: 'Ueno-Tokyo' },
  常磐線: { color: '#00b48d', romaji: 'Jōban' },
  宇都宮線: { color: '#f68b1e', romaji: 'Utsunomiya' },
  高崎線: { color: '#f68b1e', romaji: 'Takasaki' },
  東海道新幹線: { color: '#1c4f9c', romaji: 'Tōkaidō Shinkansen' },
  '東北・上越新幹線': { color: '#29a03c', romaji: 'Tōhoku-Jōetsu Shinkansen' },
  りんかい線: { color: '#0079c2', romaji: 'Rinkai' },

  // --- Tokyo Metro ---
  東京メトロ銀座線: { color: '#ff9500', romaji: 'Ginza' },
  東京メトロ丸ノ内線: { color: '#f62e36', romaji: 'Marunouchi' },
  東京メトロ日比谷線: { color: '#b5b5ac', romaji: 'Hibiya' },
  日比谷線: { color: '#b5b5ac', romaji: 'Hibiya' },
  東京メトロ千代田線: { color: '#00bb85', romaji: 'Chiyoda' },
  東京メトロ南北線: { color: '#00ac9b', romaji: 'Namboku' },
  東京メトロ東西線: { color: '#009bbf', romaji: 'Tōzai' },
  東京メトロ有楽町線: { color: '#c1a470', romaji: 'Yūrakuchō' },
  有楽町線: { color: '#c1a470', romaji: 'Yūrakuchō' },
  副都心線: { color: '#9c5e31', romaji: 'Fukutoshin' },
  半蔵門線: { color: '#8f76d6', romaji: 'Hanzōmon' },

  // --- Toei ---
  都営浅草線: { color: '#e85298', romaji: 'Asakusa' },
  都営三田線: { color: '#0079c2', romaji: 'Mita' },
  都営新宿線: { color: '#6cbb5a', romaji: 'Shinjuku' },
  都営大江戸線: { color: '#b6007a', romaji: 'Ōedo' },
  大江戸線: { color: '#b6007a', romaji: 'Ōedo' },
  都電荒川線: { color: '#f8b500', romaji: 'Toden Arakawa' },

  // --- Compagnies privées et lignes nouvelles ---
  京成線: { color: '#0055a5', romaji: 'Keisei' },
  京急線: { color: '#e9382f', romaji: 'Keikyū' },
  京王線: { color: '#dd0077', romaji: 'Keiō' },
  京王井の頭線: { color: '#1b75bb', romaji: 'Keiō Inokashira' },
  小田急線: { color: '#0075c2', romaji: 'Odakyū' },
  東武東上線: { color: '#005aaa', romaji: 'Tōbu Tōjō' },
  西武池袋線: { color: '#ff6600', romaji: 'Seibu Ikebukuro' },
  西武新宿線: { color: '#00a7db', romaji: 'Seibu Shinjuku' },
  東急東横線: { color: '#da0442', romaji: 'Tōkyū Tōyoko' },
  東急目黒線: { color: '#009cd2', romaji: 'Tōkyū Meguro' },
  東急池上線: { color: '#ec6ea5', romaji: 'Tōkyū Ikegami' },
  田園都市線: { color: '#20a288', romaji: 'Den-en-toshi' },
  つくばエクスプレス: { color: '#00a7db', romaji: 'Tsukuba Express' },
  '日暮里・舎人ライナー': { color: '#de9c2e', romaji: 'Nippori-Toneri' },
  東京モノレール: { color: '#0068b7', romaji: 'Tokyo Monorail' },
  ゆりかもめ: { color: '#0090d2', romaji: 'Yurikamome' },
};

const UNKNOWN: TransitLine = { color: '#8a9096', romaji: '' };

export function lineInfo(name: string): TransitLine {
  return LINES[name] ?? UNKNOWN;
}

/**
 * Sorties nommées, pour les panneaux jaunes. Les grandes gares portent leur
 * vrai nom de sortie ; les autres reçoivent le jeu générique JR (中央口, 東口,
 * 西口…), qui est de toute façon ce qu'on lit dans la plupart des gares de la
 * boucle.
 */
export interface StationExit {
  jp: string;
  en: string;
}

const GENERIC_EXITS: StationExit[] = [
  { jp: '中央口', en: 'Central Exit' },
  { jp: '東口', en: 'East Exit' },
  { jp: '西口', en: 'West Exit' },
  { jp: '北口', en: 'North Exit' },
  { jp: '南口', en: 'South Exit' },
];

const NAMED_EXITS: Record<number, StationExit[]> = {
  0: [
    { jp: '丸の内中央口', en: 'Marunouchi Central Exit' },
    { jp: '八重洲中央口', en: 'Yaesu Central Exit' },
  ],
  4: [
    { jp: '中央改札', en: 'Central Gate' },
    { jp: '不忍口', en: 'Shinobazu Exit' },
  ],
  12: [
    { jp: '中央改札', en: 'Central Gate' },
    { jp: '東口', en: 'East Exit' },
  ],
  16: [
    { jp: '東口', en: 'East Exit' },
    { jp: '南口', en: 'South Exit' },
  ],
  19: [
    { jp: 'ハチ公口', en: 'Hachikō Exit' },
    { jp: '南改札', en: 'South Gate' },
  ],
  24: [
    { jp: '高輪口', en: 'Takanawa Exit' },
    { jp: '港南口', en: 'Kōnan Exit' },
  ],
};

/** Les deux sorties affichées sur les potences d'une gare. */
export function stationExits(index: number): StationExit[] {
  const named = NAMED_EXITS[index];
  if (named) return named;
  const a = GENERIC_EXITS[0];
  const b = GENERIC_EXITS[1 + (index % (GENERIC_EXITS.length - 1))];
  return [a, b];
}
