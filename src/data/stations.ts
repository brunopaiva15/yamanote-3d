// Données réelles de la ligne Yamanote : 30 stations (JY01 → JY30),
// côté d'ouverture des portes et correspondances pour les annonces.
// `code` = trigramme, mais SEULES LES QUATORZE GARES DE `CODED_JY` en portent un
// officiellement - passer par `stationCode()` pour l'afficher ; `kana` = lecture hiragana ;
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

// Le trigramme N'EST PAS UNE PROPRIÉTÉ DE TOUTE GARE. JR East ne l'a attribué
// qu'aux gares majeures - celles qui servent de repère à un voyageur qui ne lit
// ni kanji ni kana : les grandes correspondances et les têtes de réseau. Les
// seize autres n'ont que leur numéro de ligne, et leur signalétique porte le
// carré JY seul, sans lettres au-dessus.
//
// Ces quatorze-là sont donc les seules que l'afficheur doit coiffer d'un
// trigramme. Le reste des `code` de la table ci-dessus n'est pas officiel : il
// sert de repère interne (fichiers audio, plaques de quai héritées), et il ne
// doit pas remonter sur une dalle.
const CODED_JY = new Set([
  'JY01', // 東京 TYO
  'JY02', // 神田 KND
  'JY03', // 秋葉原 AKB
  'JY05', // 上野 UEN
  'JY07', // 日暮里 NPR
  'JY13', // 池袋 IKB
  'JY17', // 新宿 SJK
  'JY20', // 渋谷 SBY
  'JY21', // 恵比寿 EBS
  'JY24', // 大崎 OSK
  'JY25', // 品川 SGW
  'JY26', // 高輪ゲートウェイ TGW - attribué à l'ouverture, en 2020
  'JY28', // 浜松町 HMC
  'JY29', // 新橋 SMB
]);

/**
 * Trigramme officiel de la gare, ou chaîne vide si elle n'en porte pas.
 *
 * À utiliser partout où le trigramme est AFFICHÉ ; `station.code` reste la
 * valeur brute de la table, y compris pour les gares sans trigramme officiel.
 */
export function stationCode(st: Station): string {
  return CODED_JY.has(st.jy) ? st.code : '';
}

// Côté d'ouverture des portes par index de station (1 = droite, -1 = gauche),
// au relevé JR East de janvier 2026.
//
// CE QUI EST GARANTI : le côté est LE MÊME DANS LES DEUX SENS, et ce n'est pas
// une simplification. Un plan de voies à deux tracks est symétrique par rotation
// d'un demi-tour autour de l'axe de la ligne : la rame qui roule à l'endroit et
// celle qui roule à l'envers ont le quai du même bord. Le côté appartient donc à
// la GARE, pas au sens de circulation - et c'est pour cela que cette table est
// indexée par gare seule, sans colonne de sens.
//
// Les rares voies qui font exception - la voie extérieure d'Ōsaki, les voies
// terminales d'Ikebukuro et d'Ōsaki, qui bordent la face EXTÉRIEURE de leur
// îlot - ne sont pas des gares qui ouvriraient des deux côtés : ce sont
// d'AUTRES VOIES, et c'est `data/platforms` qui les porte, par voie.
//
// CE QUI CHANGE AVEC CE RELEVÉ : la table précédente était héritée et déclarée
// `unverified` de bout en bout ; recoupée avec le plan de voies, elle ne
// s'expliquait par rien, et les gares en îlot s'y partageaient le côté
// sept-sept. Le relevé de janvier 2026 en corrige quinze, et le résultat, lui,
// s'explique - non pas parce qu'on l'a calculé, mais parce que la géométrie et
// la circulation à gauche se rejoignent :
//
//   • ÎLOT CENTRAL (`island`) : le quai est ENTRE les deux voies. À gauche,
//     chaque rame a le milieu du faisceau à sa droite -> portes à DROITE.
//     Komagome, Sugamo, Ōtsuka, Mejiro, Takadanobaba, Shin-Ōkubo, Shibuya,
//     Ebisu, Meguro, Gotanda, Takanawa Gateway, Shinagawa, Harajuku.
//   • ÎLOT PARTAGÉ (`sharedIsland`) : les deux voies Yamanote sont la paire
//     CENTRALE, encadrée par la Keihin-Tōhoku ; chaque quai est donc à
//     l'extérieur de la paire -> portes à GAUCHE. Tout le côté est de la
//     boucle, de Tokyo à Yūrakuchō, plus Yoyogi et Shinjuku.
//   • TERMINUS À QUATRE VOIES : voies régulières au centre, portes à gauche
//     (Ikebukuro 6 et 7) ; voies terminales à l'extérieur, portes à droite.
//
// Ce n'est pas une dérivation et il ne faut pas la coder comme telle - Ōsaki et
// Shinagawa n'y entrent pas, chacune pour une raison de site. C'est une
// LECTURE : elle dit à quoi ressemble une ligne fausse, et c'est tout ce qu'on
// lui demande. `tests/stationTrackPlan` gèle le relevé ligne à ligne.
//
// TOUCHER À CETTE TABLE, C'EST REGRAVER DES ANNONCES. Le côté est DIT :
// 「お出口は。右側です。」 entre dans le texte de 次は… et de まもなく…, donc dans
// la clé de leur clip (data/clipKey). Un 1 changé en -1 laisse la rame MUETTE à
// cette gare - pas d'erreur, pas de repli, plus de nom d'arrêt ni de côté
// d'ouverture -, et c'est exactement ce qui est arrivé au relevé de janvier
// 2026. Après toute correction ici : réexporter les textes puis regraver
// (scripts/announcements-export.ts → scripts/announcements-gen.py --reuse) et
// vérifier avec `tests/announcementClips`, qui refuse une annonce sans MP3.
export const DOOR_SIDE: (1 | -1)[] = [
  // JY01 Tokyo     JY02 Kanda     JY03 Akihabara  JY04 Okachimachi JY05 Ueno
  -1, -1, -1, -1, -1,
  // JY06 Uguisudani JY07 Nippori  JY08 N.-Nippori JY09 Tabata      JY10 Komagome
  -1, -1, -1, -1, 1,
  // JY11 Sugamo    JY12 Ōtsuka    JY13 Ikebukuro  JY14 Mejiro      JY15 Takadanobaba
  1, 1, -1, 1, 1,
  // JY16 Shin-Ōkubo JY17 Shinjuku JY18 Yoyogi     JY19 Harajuku    JY20 Shibuya
  1, -1, -1, 1, 1,
  // JY21 Ebisu     JY22 Meguro    JY23 Gotanda    JY24 Ōsaki       JY25 Shinagawa
  1, 1, 1, 1, 1,
  // JY26 Takanawa G. JY27 Tamachi JY28 Hamamatsu. JY29 Shimbashi   JY30 Yūrakuchō
  1, -1, -1, -1, -1,
];

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

export type TransferText = { jp: string; en: string };
export interface StationTransferProfile {
  default: TransferText; inner?: TransferText; outer?: TransferText;
  originating?: TransferText; terminating?: TransferText;
}
export interface ServiceContext { originating?: boolean; terminating?: boolean }

/** Résolution parlée; les écrans gardent la liste complète et aucune exception n'est inventée. */
export function transferAnnouncementFor(
  stationCode: string, direction: LoopDirection, context: ServiceContext = {},
): TransferText | undefined {
  const fallback = TRANSFERS[stationCode];
  if (!fallback) return undefined;
  const profile: StationTransferProfile = { default: fallback };
  if (context.terminating && profile.terminating) return profile.terminating;
  if (context.originating && profile.originating) return profile.originating;
  return profile[direction] ?? profile.default;
}

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
