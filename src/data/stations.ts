// Données réelles de la ligne Yamanote : 30 stations (JY01 → JY30),
// côté d'ouverture des portes et correspondances pour les annonces.

export type Station = { jy: string; kanji: string; romaji: string };

export const STATIONS: Station[] = [
  { jy: 'JY01', kanji: '東京', romaji: 'Tokyo' },
  { jy: 'JY02', kanji: '神田', romaji: 'Kanda' },
  { jy: 'JY03', kanji: '秋葉原', romaji: 'Akihabara' },
  { jy: 'JY04', kanji: '御徒町', romaji: 'Okachimachi' },
  { jy: 'JY05', kanji: '上野', romaji: 'Ueno' },
  { jy: 'JY06', kanji: '鶯谷', romaji: 'Uguisudani' },
  { jy: 'JY07', kanji: '日暮里', romaji: 'Nippori' },
  { jy: 'JY08', kanji: '西日暮里', romaji: 'Nishi-Nippori' },
  { jy: 'JY09', kanji: '田端', romaji: 'Tabata' },
  { jy: 'JY10', kanji: '駒込', romaji: 'Komagome' },
  { jy: 'JY11', kanji: '巣鴨', romaji: 'Sugamo' },
  { jy: 'JY12', kanji: '大塚', romaji: 'Ōtsuka' },
  { jy: 'JY13', kanji: '池袋', romaji: 'Ikebukuro' },
  { jy: 'JY14', kanji: '目白', romaji: 'Mejiro' },
  { jy: 'JY15', kanji: '高田馬場', romaji: 'Takadanobaba' },
  { jy: 'JY16', kanji: '新大久保', romaji: 'Shin-Ōkubo' },
  { jy: 'JY17', kanji: '新宿', romaji: 'Shinjuku' },
  { jy: 'JY18', kanji: '代々木', romaji: 'Yoyogi' },
  { jy: 'JY19', kanji: '原宿', romaji: 'Harajuku' },
  { jy: 'JY20', kanji: '渋谷', romaji: 'Shibuya' },
  { jy: 'JY21', kanji: '恵比寿', romaji: 'Ebisu' },
  { jy: 'JY22', kanji: '目黒', romaji: 'Meguro' },
  { jy: 'JY23', kanji: '五反田', romaji: 'Gotanda' },
  { jy: 'JY24', kanji: '大崎', romaji: 'Ōsaki' },
  { jy: 'JY25', kanji: '品川', romaji: 'Shinagawa' },
  { jy: 'JY26', kanji: '高輪ゲートウェイ', romaji: 'Takanawa Gateway' },
  { jy: 'JY27', kanji: '田町', romaji: 'Tamachi' },
  { jy: 'JY28', kanji: '浜松町', romaji: 'Hamamatsuchō' },
  { jy: 'JY29', kanji: '新橋', romaji: 'Shimbashi' },
  { jy: 'JY30', kanji: '有楽町', romaji: 'Yūrakuchō' },
];

// Côté d'ouverture des portes par index de station (1 = droite, -1 = gauche).
export const DOOR_SIDE: (1 | -1)[] =
  [1, -1, 1, 1, -1, 1, -1, 1, 1, -1, 1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, -1, 1, 1, -1, 1, -1, 1, -1];

// Correspondances réelles (pour les annonces). Clé = code JY.
// jp = parlé japonais, en = parlé anglais. Gares sans correspondance notable : omises.
export const TRANSFERS: Record<string, { jp: string; en: string }> = {
  JY01: {
    jp: '中央線、京浜東北線、東海道線、横須賀線、総武線快速、京葉線、上野東京ライン、東海道新幹線、東京メトロ丸ノ内線',
    en: 'the Chuo, Keihin-Tohoku, Tokaido, Yokosuka, Sobu, Keiyo and Ueno-Tokyo Lines, the Tokaido Shinkansen, and the Tokyo Metro Marunouchi Line',
  },
  JY02: { jp: '京浜東北線、中央線、東京メトロ銀座線', en: 'the Keihin-Tohoku and Chuo Lines, and the Tokyo Metro Ginza Line' },
  JY03: {
    jp: '京浜東北線、中央・総武線、東京メトロ日比谷線、つくばエクスプレス',
    en: 'the Keihin-Tohoku and Chuo-Sobu Lines, the Tokyo Metro Hibiya Line, and the Tsukuba Express',
  },
  JY04: {
    jp: '京浜東北線、東京メトロ銀座線、日比谷線、都営大江戸線',
    en: 'the Keihin-Tohoku Line, the Tokyo Metro Ginza and Hibiya Lines, and the Toei Oedo Line',
  },
  JY05: {
    jp: '京浜東北線、宇都宮線、高崎線、常磐線、上野東京ライン、東北・上越新幹線、東京メトロ銀座線、日比谷線、京成線',
    en: 'the Keihin-Tohoku, Utsunomiya, Takasaki, Joban and Ueno-Tokyo Lines, the Tohoku and Joetsu Shinkansen, the Tokyo Metro Ginza and Hibiya Lines, and the Keisei Line',
  },
  JY07: {
    jp: '京浜東北線、常磐線、京成線、日暮里・舎人ライナー',
    en: 'the Keihin-Tohoku and Joban Lines, the Keisei Line, and the Nippori-Toneri Liner',
  },
  JY08: {
    jp: '京浜東北線、東京メトロ千代田線、日暮里・舎人ライナー',
    en: 'the Keihin-Tohoku Line, the Tokyo Metro Chiyoda Line, and the Nippori-Toneri Liner',
  },
  JY09: { jp: '京浜東北線', en: 'the Keihin-Tohoku Line' },
  JY10: { jp: '東京メトロ南北線', en: 'the Tokyo Metro Namboku Line' },
  JY11: { jp: '都営三田線', en: 'the Toei Mita Line' },
  JY12: { jp: '都電荒川線', en: 'the Toden Arakawa Line' },
  JY13: {
    jp: '埼京線、湘南新宿ライン、東京メトロ丸ノ内線、有楽町線、副都心線、東武東上線、西武池袋線',
    en: 'the Saikyo and Shonan-Shinjuku Lines, the Tokyo Metro Marunouchi, Yurakucho and Fukutoshin Lines, the Tobu Tojo Line, and the Seibu Ikebukuro Line',
  },
  JY15: { jp: '西武新宿線、東京メトロ東西線', en: 'the Seibu Shinjuku Line and the Tokyo Metro Tozai Line' },
  JY17: {
    jp: '中央線、中央・総武線、埼京線、湘南新宿ライン、小田急線、京王線、東京メトロ丸ノ内線、都営新宿線、大江戸線',
    en: 'the Chuo, Chuo-Sobu, Saikyo and Shonan-Shinjuku Lines, the Odakyu Line, the Keio Line, the Tokyo Metro Marunouchi Line, and the Toei Shinjuku and Oedo Lines',
  },
  JY18: { jp: '中央・総武線、都営大江戸線', en: 'the Chuo-Sobu Line and the Toei Oedo Line' },
  JY19: { jp: '東京メトロ千代田線、副都心線', en: 'the Tokyo Metro Chiyoda and Fukutoshin Lines' },
  JY20: {
    jp: '埼京線、湘南新宿ライン、東京メトロ銀座線、半蔵門線、副都心線、東急東横線、田園都市線、京王井の頭線',
    en: 'the Saikyo and Shonan-Shinjuku Lines, the Tokyo Metro Ginza, Hanzomon and Fukutoshin Lines, the Tokyu Toyoko and Den-en-toshi Lines, and the Keio Inokashira Line',
  },
  JY21: {
    jp: '埼京線、湘南新宿ライン、東京メトロ日比谷線',
    en: 'the Saikyo and Shonan-Shinjuku Lines, and the Tokyo Metro Hibiya Line',
  },
  JY22: {
    jp: '東京メトロ南北線、都営三田線、東急目黒線',
    en: 'the Tokyo Metro Namboku Line, the Toei Mita Line, and the Tokyu Meguro Line',
  },
  JY23: { jp: '都営浅草線、東急池上線', en: 'the Toei Asakusa Line and the Tokyu Ikegami Line' },
  JY24: {
    jp: '埼京線、湘南新宿ライン、りんかい線',
    en: 'the Saikyo and Shonan-Shinjuku Lines, and the Rinkai Line',
  },
  JY25: {
    jp: '東海道線、横須賀線、京浜東北線、上野東京ライン、東海道新幹線、京急線',
    en: 'the Tokaido, Yokosuka, Keihin-Tohoku and Ueno-Tokyo Lines, the Tokaido Shinkansen, and the Keikyu Line',
  },
  JY28: {
    jp: '京浜東北線、東京モノレール、都営浅草線、大江戸線',
    en: 'the Keihin-Tohoku Line, the Tokyo Monorail, and the Toei Asakusa and Oedo Lines',
  },
  JY29: {
    jp: '東海道線、横須賀線、京浜東北線、上野東京ライン、東京メトロ銀座線、都営浅草線、ゆりかもめ',
    en: 'the Tokaido, Yokosuka, Keihin-Tohoku and Ueno-Tokyo Lines, the Tokyo Metro Ginza Line, the Toei Asakusa Line, and the Yurikamome',
  },
  JY30: { jp: '京浜東北線、東京メトロ有楽町線', en: 'the Keihin-Tohoku Line and the Tokyo Metro Yurakucho Line' },
};
