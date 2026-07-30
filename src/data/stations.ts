// Données réelles de la ligne Yamanote : 30 stations (JY01 → JY30),
// côté d'ouverture des portes et correspondances pour les annonces.
// `code` = trigramme affiché sur les panneaux de quai ; `kana` = lecture hiragana ;
// `zh` / `ko` = graphies officielles JR East (chinois simplifié / hangul) du
// cycle quadrilingue des afficheurs E235.
// Numéros de quai (内回り / 外回り) : voir `platforms.ts`.

import { nextStation, stationAtHop } from './loop.ts';
import type { LoopDirection } from './platforms.ts';

export type Station = {
  jy: string;
  kanji: string;
  kana: string;
  romaji: string;
  code: string;
  zh: string;
  ko: string;
};

export const STATIONS: Station[] = [
  { jy: 'JY01', kanji: '東京', kana: 'とうきょう', romaji: 'Tokyo', code: 'TYO', zh: '东京', ko: '도쿄' },
  { jy: 'JY02', kanji: '神田', kana: 'かんだ', romaji: 'Kanda', code: 'KND', zh: '神田', ko: '간다' },
  { jy: 'JY03', kanji: '秋葉原', kana: 'あきはばら', romaji: 'Akihabara', code: 'AKB', zh: '秋叶原', ko: '아키하바라' },
  { jy: 'JY04', kanji: '御徒町', kana: 'おかちまち', romaji: 'Okachimachi', code: 'OKC', zh: '御徒町', ko: '오카치마치' },
  { jy: 'JY05', kanji: '上野', kana: 'うえの', romaji: 'Ueno', code: 'UEN', zh: '上野', ko: '우에노' },
  { jy: 'JY06', kanji: '鶯谷', kana: 'うぐいすだに', romaji: 'Uguisudani', code: 'UGD', zh: '莺谷', ko: '우구이스다니' },
  { jy: 'JY07', kanji: '日暮里', kana: 'にっぽり', romaji: 'Nippori', code: 'NPR', zh: '日暮里', ko: '닛포리' },
  { jy: 'JY08', kanji: '西日暮里', kana: 'にしにっぽり', romaji: 'Nishi-Nippori', code: 'NNP', zh: '西日暮里', ko: '니시닛포리' },
  { jy: 'JY09', kanji: '田端', kana: 'たばた', romaji: 'Tabata', code: 'TBT', zh: '田端', ko: '다바타' },
  { jy: 'JY10', kanji: '駒込', kana: 'こまごめ', romaji: 'Komagome', code: 'KMG', zh: '驹込', ko: '고마고메' },
  { jy: 'JY11', kanji: '巣鴨', kana: 'すがも', romaji: 'Sugamo', code: 'SGM', zh: '巢鸭', ko: '스가모' },
  { jy: 'JY12', kanji: '大塚', kana: 'おおつか', romaji: 'Ōtsuka', code: 'OTS', zh: '大塚', ko: '오쓰카' },
  { jy: 'JY13', kanji: '池袋', kana: 'いけぶくろ', romaji: 'Ikebukuro', code: 'IKB', zh: '池袋', ko: '이케부쿠로' },
  { jy: 'JY14', kanji: '目白', kana: 'めじろ', romaji: 'Mejiro', code: 'MJR', zh: '目白', ko: '메지로' },
  { jy: 'JY15', kanji: '高田馬場', kana: 'たかだのばば', romaji: 'Takadanobaba', code: 'TKB', zh: '高田马场', ko: '다카다노바바' },
  { jy: 'JY16', kanji: '新大久保', kana: 'しんおおくぼ', romaji: 'Shin-Ōkubo', code: 'SOK', zh: '新大久保', ko: '신오쿠보' },
  { jy: 'JY17', kanji: '新宿', kana: 'しんじゅく', romaji: 'Shinjuku', code: 'SJK', zh: '新宿', ko: '신주쿠' },
  { jy: 'JY18', kanji: '代々木', kana: 'よよぎ', romaji: 'Yoyogi', code: 'YOY', zh: '代代木', ko: '요요기' },
  { jy: 'JY19', kanji: '原宿', kana: 'はらじゅく', romaji: 'Harajuku', code: 'JYH', zh: '原宿', ko: '하라주쿠' },
  { jy: 'JY20', kanji: '渋谷', kana: 'しぶや', romaji: 'Shibuya', code: 'SBY', zh: '涩谷', ko: '시부야' },
  { jy: 'JY21', kanji: '恵比寿', kana: 'えびす', romaji: 'Ebisu', code: 'EBS', zh: '惠比寿', ko: '에비스' },
  { jy: 'JY22', kanji: '目黒', kana: 'めぐろ', romaji: 'Meguro', code: 'MGR', zh: '目黑', ko: '메구로' },
  { jy: 'JY23', kanji: '五反田', kana: 'ごたんだ', romaji: 'Gotanda', code: 'GTN', zh: '五反田', ko: '고탄다' },
  { jy: 'JY24', kanji: '大崎', kana: 'おおさき', romaji: 'Ōsaki', code: 'OSK', zh: '大崎', ko: '오사키' },
  { jy: 'JY25', kanji: '品川', kana: 'しながわ', romaji: 'Shinagawa', code: 'SGW', zh: '品川', ko: '시나가와' },
  { jy: 'JY26', kanji: '高輪ゲートウェイ', kana: 'たかなわげーとうぇい', romaji: 'Takanawa Gateway', code: 'TGW', zh: '高轮Gateway', ko: '다카나와 게이트웨이' },
  { jy: 'JY27', kanji: '田町', kana: 'たまち', romaji: 'Tamachi', code: 'TMC', zh: '田町', ko: '다마치' },
  { jy: 'JY28', kanji: '浜松町', kana: 'はままつちょう', romaji: 'Hamamatsuchō', code: 'HMC', zh: '滨松町', ko: '하마마쓰초' },
  { jy: 'JY29', kanji: '新橋', kana: 'しんばし', romaji: 'Shimbashi', code: 'SMB', zh: '新桥', ko: '신바시' },
  { jy: 'JY30', kanji: '有楽町', kana: 'ゆうらくちょう', romaji: 'Yūrakuchō', code: 'YUR', zh: '有乐町', ko: '유라쿠초' },
];

// Côté d'ouverture des portes par index de station (1 = droite, -1 = gauche).
//
// CE QUI EST GARANTI : le côté est LE MÊME DANS LES DEUX SENS, et ce n'est pas
// une simplification. Un plan de voies à deux tracks est symétrique par rotation
// d'un demi-tour autour de l'axe de la ligne : la rame qui roule à l'endroit et
// celle qui roule à l'envers ont le quai du même bord. Le côté appartient donc à
// la GARE, pas au sens de circulation - et c'est pour cela que cette table est
// indexée par gare seule, sans colonne de sens.
//
// CE QUI NE L'EST PAS : le côté ne se DÉDUIT PAS du plan de voies déclaré dans
// `data/stationLayouts` (`config`). Ce commentaire portait une règle
// - « sur un îlot central les deux sens ouvrent à droite, sur deux quais
// latéraux les deux ouvrent à gauche » - qui se lisait comme une dérivation.
// Elle n'en est pas une : recoupée avec `config`, aucune de ses lectures
// possibles n'explique plus de dix-sept gares sur trente, et les treize gares
// dites `island` se partagent le côté sept-sept. La table ci-dessous est un
// RELEVÉ, gare par gare, et c'est ainsi qu'il faut la corriger - en regardant
// la gare, pas en calculant.
//
// (`config` reste juste dans son registre : il dit ce qu'on a en face du quai -
// une voie Keihin-Tōhoku, la voie Yamanote opposée, un mur - et le rendu s'en
// sert pour le fond de travée. Les deux tables décrivent deux choses
// différentes ; le tort était de les présenter comme liées.)
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

/**
 * Gares listées sur le panneau de direction suspendu au-dessus du quai
 * (「原宿・代々木・新宿・池袋・上野方面」).
 *
 * Un vrai panneau ne liste pas les gares suivantes une à une : il donne la
 * prochaine, puis les repères - celles où l'on change de ligne. TRANSFERS est
 * exactement cette liste, et sert déjà aux annonces de correspondance.
 */
/**
 * Les gares repères de la boucle : 東京, 上野, 池袋, 新宿, 渋谷, 品川.
 *
 * Ce sont elles, et elles seules, que JR nomme dans un 方面 court. Un tableau
 * des départs de Tamachi annonce 「東京・上野方面」 et non 「浜松町・新橋方面」,
 * bien que Hamamatsuchō soit l'arrêt suivant : on ne prend pas la Yamanote pour
 * la gare d'après, on la prend pour un de ces six points.
 *
 * SOURCE UNIQUE. Le même ensemble était écrit trois fois - ici en codes JY, en
 * indices dans `data/announcements` (`MAJOR_HUBS`) et encore dans
 * `data/segments` (`ROOF_HUBS`, dont le commentaire prétendait à tort en être un
 * superset). Les deux autres le dérivent maintenant d'ici : ces six gares sont
 * les mêmes pour la signalétique, pour les annonces et pour les verrières,
 * parce que c'est le même fait - ce sont les grandes gares de la boucle.
 */
export const LOOP_HUB_JY: readonly string[] = ['JY01', 'JY05', 'JY13', 'JY17', 'JY20', 'JY25'];

/** Les mêmes, en indices de `STATIONS`. */
export const LOOP_HUB_INDICES: readonly number[] = STATIONS.reduce<number[]>((out, st, i) => {
  if (LOOP_HUB_JY.includes(st.jy)) out.push(i);
  return out;
}, []);

const LOOP_HUBS = LOOP_HUB_JY;

/**
 * Les deux repères que le 発車標 met dans sa colonne de droite.
 *
 * Le résultat retombe exactement sur les couples réels : 東京・上野 depuis
 * Tamachi, 渋谷・品川 depuis Shinjuku, 新宿・渋谷 depuis Ikebukuro,
 * 池袋・新宿 depuis Ueno.
 */
export function boardDestinations(index: number, dir: LoopDirection, max = 2): Station[] {
  const out: Station[] = [];
  for (let step = 1; step < 30 && out.length < max; step++) {
    const st = STATIONS[stationAtHop(index, step, dir)];
    if (LOOP_HUBS.includes(st.jy)) out.push(st);
  }
  return out;
}

export function directionBoardStations(index: number, dir: LoopDirection, max = 5): Station[] {
  const out: Station[] = [STATIONS[nextStation(index, dir)]];
  for (let step = 2; step < 30 && out.length < max; step++) {
    const st = STATIONS[stationAtHop(index, step, dir)];
    if (TRANSFERS[st.jy]) out.push(st);
  }
  return out;
}
