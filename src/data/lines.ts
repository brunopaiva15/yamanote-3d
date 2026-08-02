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
 * LES SORTIES, RELEVÉES SUR LES TRENTE PLANS OFFICIELS.
 *
 * Elles étaient génériques pour vingt-quatre gares sur trente : un 中央口 suivi
 * d'un 東口/西口/北口/南口 tiré par `index % 4`. Kanda recevait ainsi « West
 * Exit » et Harajuku « North Exit », qui ne sont pas leurs sorties.
 *
 * Les trente plans JR East ayant été lus un par un (voir
 * `data/stationConcourseSources` et `docs/STATION_CONCOURSE_EVIDENCE.md`), la
 * table ci-dessous porte ce que les plans IMPRIMENT, gare par gare.
 *
 * TROIS RÈGLES DE LECTURE, et elles comptent :
 *
 *   1. UNE SORTIE N'EST PAS UN PORTILLON. Le relevé a montré que le dépôt
 *      confondait les deux à quatre reprises - Harajuku, Shimbashi, Kanda,
 *      Uguisudani - en prenant un nom de sortie pour un nom de 改札. Ce qui est
 *      ici est ce qui est écrit AU-DESSUS DE LA BOUCHE, pas au-dessus de la
 *      ligne de contrôle. Quand le plan ne nomme qu'un contrôle (Akihabara,
 *      Ueno), c'est ce nom-là qui sert de destination, parce que c'est
 *      littéralement ce que la potence du quai fléche.
 *   2. LES GRAPHIES JAPONAISES SUIVENT LA CORRESPONDANCE JR EAST. Les plans
 *      fournis sont pour l'essentiel l'édition anglaise : ils donnent « North
 *      Exit », pas 北口. Les couples standards (North=北口, South=南口,
 *      East=東口, West=西口, Central=中央口) sont ceux que JR East imprime
 *      lui-même sur ses panneaux bilingues, et ne sont donc pas une traduction
 *      mais un relevé. Les noms propres - 烏森口, ハチ公口, 表参道口, 早稲田口… -
 *      sont dans le même cas.
 *   3. CE QUI N'EST PAS SUR LE PLAN EST MARQUÉ. Six gares ne nomment aucune
 *      sortie sur le document lu : leur entrée porte `unsourced`, et le test
 *      les tient en liste fermée pour qu'aucune autre ne s'y glisse en silence.
 */
export interface StationExit {
  jp: string;
  en: string;
  /**
   * Nom plausible et courant, mais ABSENT du plan lu.
   *
   * Six gares seulement. Ce n'est pas une invention - ce sont les noms usuels
   * de ces sorties - mais ce n'est pas non plus un relevé, et la différence
   * doit rester visible : c'est toute la discipline de ce chantier.
   */
  unsourced?: true;
}

/**
 * Le relevé complet, gare par gare, dans l'ordre où le plan les présente.
 *
 * Une gare peut en porter deux comme neuf. Ce que la POTENCE DU QUAI affiche
 * n'est que les deux premières (`stationExits`) : deux caissons, c'est ce qui
 * tient sur une potence, et c'est ce que le rendu sait poser.
 */
const STATION_EXITS: readonly (readonly StationExit[])[] = [
  // JY01 Tokyo — plan de mai 2026. Les deux côtés lus.
  [
    { jp: '丸の内中央口', en: 'Marunouchi Central Exit' },
    { jp: '八重洲中央口', en: 'Yaesu Central Exit' },
    { jp: '丸の内北口', en: 'Marunouchi North Exit' },
    { jp: '丸の内南口', en: 'Marunouchi South Exit' },
    { jp: '八重洲北口', en: 'Yaesu North Exit' },
    { jp: '八重洲南口', en: 'Yaesu South Exit' },
    { jp: '日本橋口', en: 'Nihonbashi Exit' },
  ],
  // JY02 Kanda — deux blocs sans lien au sol : West+South, East+North.
  [
    { jp: '西口', en: 'West Exit' },
    { jp: '東口', en: 'East Exit' },
    { jp: '南口', en: 'South Exit' },
    { jp: '北口', en: 'North Exit' },
  ],
  // JY03 Akihabara — le plan nomme les CONTRÔLES ; ce sont eux que la potence
  // fléche, et ils portent des noms de lieu, pas de points cardinaux.
  [
    { jp: '電気街口', en: 'Electric Town Exit' },
    { jp: '昭和通り口', en: 'Shōwa-dōri Exit' },
    { jp: '中央改札口', en: 'Central Exit' },
  ],
  // JY04 Okachimachi — plan de janvier 2024.
  [
    { jp: '北口', en: 'North Exit' },
    { jp: '南口', en: 'South Exit' },
  ],
  // JY05 Ueno — le bracket du quai Yamanote (3F) ne fléche QUE ces deux-là.
  // Le 中央改札 et le 不忍口, que le dépôt portait, sont hors cadrage : ils
  // existent, mais ils ne sont pas ce qu'on lit depuis ce quai.
  [
    { jp: '公園口', en: 'Park Exit' },
    { jp: '入谷口', en: 'Iriya Exit' },
    { jp: '正面口', en: 'Main Exit' },
    { jp: '浅草口', en: 'Asakusa Exit' },
  ],
  // JY06 Uguisudani — plan japonais de juin 2022 : 南口 et 北口, écrits ainsi.
  [
    { jp: '南口', en: 'South Exit' },
    { jp: '北口', en: 'North Exit' },
  ],
  // JY07 Nippori — le plan nomme East Exit et les deux contrôles South/North.
  [
    { jp: '東口', en: 'East Exit' },
    { jp: '南口', en: 'South Exit' },
    { jp: '北口', en: 'North Exit' },
  ],
  // JY08 Nishi-Nippori — le plan ne nomme AUCUNE sortie : un « Gate » et des
  // renvois vers le Chiyoda et le Toneri Liner. Noms usuels, non relevés.
  [
    { jp: '西口', en: 'West Exit', unsourced: true },
    { jp: '東口', en: 'East Exit', unsourced: true },
  ],
  // JY09 Tabata — North (grand, avec atre vie) et South (petit).
  [
    { jp: '北口', en: 'North Exit' },
    { jp: '南口', en: 'South Exit' },
  ],
  // JY10 Komagome — North et South au 2F, East au B1, de l'autre côté du quai.
  [
    { jp: '北口', en: 'North Exit' },
    { jp: '南口', en: 'South Exit' },
    { jp: '東口', en: 'East Exit' },
  ],
  // JY11 Sugamo — le plan écrit « Main Exit », pas « Front ».
  [
    { jp: '正面口', en: 'Main Exit' },
    { jp: '北口', en: 'North Exit' },
    { jp: '南口', en: 'South Exit' },
  ],
  // JY12 Ōtsuka — le renvoi vers le Toden Arakawa part du NORD.
  [
    { jp: '北口', en: 'North Exit' },
    { jp: '南口', en: 'South Exit' },
  ],
  // JY13 Ikebukuro — quatre groupes JR au B1 ; les sorties se lisent par côté.
  [
    { jp: '東口', en: 'East Exit' },
    { jp: '西口', en: 'West Exit' },
  ],
  // JY14 Mejiro — le plan ne nomme aucune sortie : un « Gate » et un renvoi
  // « for Shops (2F) ». La gare n'a qu'un débouché ; le second est un usage.
  [
    { jp: '正面口', en: 'Main Exit', unsourced: true },
    { jp: '西口', en: 'West Exit', unsourced: true },
  ],
  // JY15 Takadanobaba — Waseda (grand) et Toyama (minuscule).
  [
    { jp: '早稲田口', en: 'Waseda Exit' },
    { jp: '戸山口', en: 'Toyama Exit' },
  ],
  // JY16 Shin-Ōkubo — le plan ne nomme qu'un « Exit Only (IC card only) ».
  [
    { jp: '出口', en: 'Exit', unsourced: true },
    { jp: '東口', en: 'East Exit', unsourced: true },
  ],
  // JY17 Shinjuku — neuf groupes ; la potence du quai 14-15 fléche l'est.
  [
    { jp: '東口', en: 'East Exit' },
    { jp: '南口', en: 'South Exit' },
    { jp: '西口', en: 'West Exit' },
    { jp: '中央東口', en: 'Central East Exit' },
    { jp: '中央西口', en: 'Central West Exit' },
    { jp: '南東口', en: 'Southeast Exit' },
    { jp: '新南口', en: 'New South Exit' },
    { jp: '甲州街道口', en: 'Kōshū-kaidō Exit' },
    { jp: 'ミライナタワー口', en: 'MIRAINA TOWER Exit' },
  ],
  // JY18 Yoyogi — le bloc West/East est le principal, contrairement au North.
  [
    { jp: '西口', en: 'West Exit' },
    { jp: '東口', en: 'East Exit' },
    { jp: '北口', en: 'North Exit' },
  ],
  // JY19 Harajuku — CORRECTION : le dépôt donnait « West » comme nom de
  // portillon. Le plan nomme le contrôle Omote-sandō, et West est une sortie.
  [
    { jp: '西口', en: 'West Exit' },
    { jp: '竹下口', en: 'Takeshita Exit' },
    { jp: '東口', en: 'East Exit' },
  ],
  // JY20 Shibuya — plan de juin 2026.
  [
    { jp: 'ハチ公口', en: 'Hachikō Exit' },
    { jp: '宮益坂口', en: 'Miyamasuzaka Exit' },
    { jp: '東口', en: 'East Exit' },
    { jp: '西口', en: 'West Exit' },
  ],
  // JY21 Ebisu — West au 1F, East au 3F : deux niveaux opposés.
  [
    { jp: '西口', en: 'West Exit' },
    { jp: '東口', en: 'East Exit' },
  ],
  // JY22 Meguro — le plan ne nomme que l'East Exit ; le West est usuel.
  [
    { jp: '東口', en: 'East Exit' },
    { jp: '西口', en: 'West Exit', unsourced: true },
  ],
  // JY23 Gotanda — West et East au 1F, de part et d'autre du Central Gate.
  [
    { jp: '西口', en: 'West Exit' },
    { jp: '東口', en: 'East Exit' },
  ],
  // JY24 Ōsaki — quatre débouchés, tous sur la passerelle du 2F.
  [
    { jp: '東口', en: 'East Exit' },
    { jp: '西口', en: 'West Exit' },
    { jp: '新東口', en: 'New East Exit' },
    { jp: '新西口', en: 'New West Exit' },
  ],
  // JY25 Shinagawa — les deux bouts du passage libre, opposés.
  [
    { jp: '高輪口', en: 'Takanawa Exit' },
    { jp: '港南口', en: 'Kōnan Exit' },
  ],
  // JY26 Takanawa Gateway — le plan ne nomme que les deux CONTRÔLES.
  [
    { jp: '北改札', en: 'North Gate' },
    { jp: '南改札', en: 'South Gate' },
  ],
  // JY27 Tamachi — le plan les nomme deux fois : Mita/West, Shibaura/East.
  [
    { jp: '三田口', en: 'Mita Exit' },
    { jp: '芝浦口', en: 'Shibaura Exit' },
  ],
  // JY28 Hamamatsuchō — North au 1F, South au 3F avec le monorail.
  [
    { jp: '北口', en: 'North Exit' },
    { jp: '南口', en: 'South Exit' },
  ],
  // JY29 Shimbashi — CORRECTION : le dépôt donnait 烏森口 comme nom de
  // portillon. Le plan nomme les contrôles South/North Gate, et Karasumori
  // est une sortie.
  [
    { jp: '烏森口', en: 'Karasumori Exit' },
    { jp: '日比谷口', en: 'Hibiya Exit' },
    { jp: '銀座口', en: 'Ginza Exit' },
    { jp: '汐留口', en: 'Shiodome Exit' },
  ],
  // JY30 Yūrakuchō — cinq contrôles, trois ensembles perceptiblement distincts.
  [
    { jp: '中央口', en: 'Central Exit' },
    { jp: '京橋口', en: 'Kyōbashi Exit' },
    { jp: '中央西口', en: 'Central West Exit' },
    { jp: '日比谷口', en: 'Hibiya Exit' },
    { jp: '国際フォーラム口', en: 'International Forum Exit' },
  ],
];

/** Toutes les sorties relevées d'une gare, dans l'ordre du plan. */
export function stationExitPlan(index: number): readonly StationExit[] {
  return STATION_EXITS[((index % 30) + 30) % 30];
}

/**
 * Les deux sorties affichées sur les potences d'une gare.
 *
 * Deux, et pas plus : c'est ce qui tient sur une potence, et c'est l'emprise
 * que le rendu sait poser (`three/station/OverheadSigns`, et les bouches de
 * `data/stationInterior`). Le relevé complet reste disponible par
 * `stationExitPlan` pour les phases qui sauront en faire quelque chose.
 */
export function stationExits(index: number): StationExit[] {
  return stationExitPlan(index).slice(0, 2);
}
