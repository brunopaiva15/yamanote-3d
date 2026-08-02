// D'OÙ VIENT CE QU'ON AFFIRME : le registre des sources, gare par gare.
//
// `data/stationConcourseTypes` dit comment décrire une gare ;
// `data/stationConcourseProfiles` dira à quoi ressemble chacune des trente.
// Entre les deux il manque la question qui décide de tout : sur quoi
// s'appuie-t-on ? Un nom de portillon, une direction d'escalier, une enseigne
// de commerce sont des FAITS - ils se relèvent, ils ne se déduisent pas de
// l'affluence ni du bon sens. Ce fichier tient la trace de l'endroit où
// chacun se vérifie.
//
// ─────────────────────────────────────────────────────────────────────────
// UNE LIMITE À DIRE D'ABORD, PARCE QU'ELLE COMMANDE TOUT LE RESTE
//
// L'environnement de développement de ce dépôt n'atteint PAS les sites des
// opérateurs. La passerelle réseau refuse la connexion (403 sur `CONNECT`)
// vers jreast.co.jp, tokyometro.jp, kotsu.metro.tokyo.jp - et vers à peu près
// tout le reste. Le seul canal qui réponde est la recherche indexée, qui rend
// des titres et des adresses, jamais le contenu d'une page.
//
// Conséquence, et elle n'est pas cosmétique : AUCUN plan de gare n'a été lu.
// Les trente références JR East ci-dessous sont `indexed` - leur existence,
// leur adresse et leur titre sont confirmés par l'index, leur CONTENU ne l'est
// pas. Aucun profil ne peut donc légitimement se déclarer `verified` tant que
// ces plans n'auront pas été ouverts (`validateProfile` le refuse), et c'est
// la raison pour laquelle `SourceRetrieval` existe : rendre l'écart visible
// plutôt que confortable.
//
// Ce que cela change pour la suite : les profils de la phase 5 s'appuieront
// sur ce que le dépôt sait déjà (`data/stations`, `data/stationLayouts`,
// `data/platforms`, relevés antérieurs) et sur ce que la recherche indexée
// confirme, avec la confiance qui correspond - `approximate` par défaut,
// `mostlyVerified` là où plusieurs sources indépendantes concordent. Les
// `openQuestions` de chaque profil diront ce qu'il reste à ouvrir.
// ─────────────────────────────────────────────────────────────────────────

import type { SourceReference } from './stationConcourseTypes.ts';

/** Date à laquelle ce registre a été constitué. */
export const REGISTRY_CHECKED_AT = '2026-08';

/** Date de référence architecturale et commerciale du chantier. */
export const REFERENCE_DATE = '2026-08';

// --- JR East, les trente pages de plan -----------------------------------
//
// JR East publie un plan par gare sous une adresse stable, indexée par un
// NUMÉRO INTERNE qui n'a rien à voir avec le code JY : Akihabara est 41,
// Tokyo 1039, Takanawa Gateway 1750. Les trente numéros ci-dessous ont été
// confirmés un par un - la recherche rend le titre de la page, qui porte le
// nom de la gare (「JR東日本：駅構内図・バリアフリー情報（神田駅）」), et
// c'est cette concordance titre ↔ adresse qui vaut confirmation.
//
// Le même document existe en japonais et en anglais, à deux adresses qui ne
// diffèrent que par le segment `/en/`. C'est la version japonaise qui fait
// foi : les noms de portillon et de sortie y sont écrits tels qu'ils sont
// peints sur les panneaux.

/** Numéro interne JR East de chaque gare de la boucle, dans l'ordre JY. */
const JR_EAST_ID: readonly number[] = [
  1039, //  0 · JY01 東京
  538, //   1 · JY02 神田
  41, //    2 · JY03 秋葉原
  355, //   3 · JY04 御徒町
  204, //   4 · JY05 上野
  209, //   5 · JY06 鶯谷
  1184, //  6 · JY07 日暮里
  1167, //  7 · JY08 西日暮里
  972, //   8 · JY09 田端
  712, //   9 · JY10 駒込
  896, //  10 · JY11 巣鴨
  330, //  11 · JY12 大塚
  108, //  12 · JY13 池袋
  1553, // 13 · JY14 目白
  938, //  14 · JY15 高田馬場
  857, //  15 · JY16 新大久保
  866, //  16 · JY17 新宿
  1654, // 17 · JY18 代々木
  1256, // 18 · JY19 原宿
  808, //  19 · JY20 渋谷
  290, //  20 · JY21 恵比寿
  1552, // 21 · JY22 目黒
  695, //  22 · JY23 五反田
  319, //  23 · JY24 大崎
  788, //  24 · JY25 品川
  1750, // 25 · JY26 高輪ゲートウェイ
  976, //  26 · JY27 田町
  1248, // 27 · JY28 浜松町
  877, //  28 · JY29 新橋
  1617, // 29 · JY30 有楽町
];

/** Nom japonais de la gare, tel qu'il apparaît dans le titre de sa page. */
const JR_EAST_NAME: readonly string[] = [
  '東京', '神田', '秋葉原', '御徒町', '上野', '鶯谷', '日暮里', '西日暮里',
  '田端', '駒込', '巣鴨', '大塚', '池袋', '目白', '高田馬場', '新大久保',
  '新宿', '代々木', '原宿', '渋谷', '恵比寿', '目黒', '五反田', '大崎',
  '品川', '高輪ゲートウェイ', '田町', '浜松町', '新橋', '有楽町',
];

/** L'adresse du plan officiel d'une gare de la boucle. */
export function jrEastPlanUrl(index: number): string {
  const i = ((index % 30) + 30) % 30;
  return `https://www.jreast.co.jp/estation/stations/${JR_EAST_ID[i]}.html`;
}

/** Le même document, version anglaise : c'est elle que l'index rend. */
export function jrEastPlanUrlEn(index: number): string {
  const i = ((index % 30) + 30) % 30;
  return `https://www.jreast.co.jp/en/estation/stations/${JR_EAST_ID[i]}.html`;
}

function jrEastPlan(index: number): SourceReference {
  const i = ((index % 30) + 30) % 30;
  return {
    tier: 1,
    retrieval: 'indexed',
    publisher: 'JR East',
    title: `駅構内図・バリアフリー情報（${JR_EAST_NAME[i]}駅）`,
    url: jrEastPlanUrl(i),
    consultedAt: REGISTRY_CHECKED_AT,
    note: 'adresse et titre confirmés par l’index ; contenu du plan non lu (réseau bloqué)',
  };
}

// --- Points d'entrée des autres opérateurs et des galeries ---------------
//
// Ils ne sont pas par gare : ce sont les racines à partir desquelles la page
// d'une gare donnée se trouve. Les pages par gare, elles, se relèveront une à
// une en phase 4, quand la question se posera pour de bon.

export const OPERATOR_ENTRY: Readonly<Record<string, SourceReference>> = {
  tokyoMetro: {
    tier: 2,
    retrieval: 'indexed',
    publisher: 'Tokyo Metro',
    title: '路線・駅の情報（構内図・出口案内）',
    url: 'https://www.tokyometro.jp/station/index.html',
    consultedAt: REGISTRY_CHECKED_AT,
    note: 'plan par gare sous /station/<nom>/yardmap/ ; numéros de sortie Metro à y prendre',
  },
  toei: {
    tier: 3,
    retrieval: 'indexed',
    publisher: '東京都交通局 (Toei)',
    title: '都営地下鉄 各駅情報',
    url: 'https://www.kotsu.metro.tokyo.jp/subway/stations/',
    consultedAt: REGISTRY_CHECKED_AT,
  },
  ecute: {
    tier: 5,
    retrieval: 'indexed',
    publisher: 'JR East Cross Station',
    title: 'ecute - ショップ一覧／フロアマップ',
    url: 'https://www.ecute.jp/',
    consultedAt: REGISTRY_CHECKED_AT,
    note: 'une galerie par gare : /tokyo/, /shinagawa/, /akihabara/… ; enseignes nommées',
  },
  atre: {
    tier: 5,
    retrieval: 'indexed',
    publisher: '株式会社アトレ',
    title: 'アトレ - ショップ検索／フロアガイド',
    url: 'https://www.atre.co.jp/',
    consultedAt: REGISTRY_CHECKED_AT,
    note: 'atré Ebisu, Meguro, Ōtsuka, Akihabara, Shinagawa… ; enseignes nommées',
  },
};

/**
 * Ce que l'index ANNONCE des niveaux d'une gare, sans que le plan soit lu.
 *
 * Le résumé d'indexation d'une page de plan mentionne souvent l'étendue des
 * niveaux couverts (« B1-1F », « 1F / 2F-M3 / 3F »). C'est une INDICATION, pas
 * un relevé : elle dit combien d'étages la gare publie, ce qui est déjà
 * beaucoup quand on cherche à savoir si un hall est dessus ou dessous, mais
 * elle ne dit ni où ni quoi. Elle est écrite ici parce qu'elle oriente la
 * vérification de la phase 4, et nulle part ailleurs parce qu'elle ne doit
 * jamais devenir un fait.
 *
 * Les gares absentes de cette table n'ont rien annoncé - ce qui n'affirme rien
 * sur elles.
 */
export const INDEXED_FLOORS_HINT: Readonly<Record<number, string>> = {
  2: '1F / 2F-M3 / 3F', //   JY03 Akihabara — trois niveaux publiés, superposition confirmée
  6: '1F-2F', //             JY07 Nippori
  8: 'B1-1F', //             JY09 Tabata
  9: 'B1-2F', //             JY10 Komagome
  10: 'B1-1F', //            JY11 Sugamo
  11: '1F-2F', //            JY12 Ōtsuka
  14: '1F-2F', //            JY15 Takadanobaba
  15: '1F-2F, 4F', //        JY16 Shin-Ōkubo — le 4F surprend, à confirmer
  17: '1F-2F', //            JY18 Yoyogi
  22: '1F-4F', //            JY23 Gotanda — cohérent avec le Tōkyū Ikegami en hauteur
  25: '1F-3F', //            JY26 Takanawa Gateway
  27: '1F-3F', //            JY28 Hamamatsuchō
  28: 'B1-1F, B5-B4', //     JY29 Shimbashi — le second groupe est la Yokosuka, très bas
};

// --- Le registre ---------------------------------------------------------

export interface StationSources {
  stationIndex: number;
  /** Toutes les sources connues pour cette gare, la plus officielle d'abord. */
  sources: readonly SourceReference[];
  /** Indication de niveaux tirée de l'index, quand il y en a une. */
  floorsHint?: string;
}

/**
 * Les trente jeux de sources.
 *
 * Chaque gare part avec sa page de plan JR East, et rien d'autre : les
 * opérateurs en correspondance et les galeries commerciales viendront gare par
 * gare en phase 4, quand on saura lesquels comptent réellement pour le
 * périmètre jouable. Une gare n'a pas besoin de la page du Keikyū tant qu'on
 * n'a pas décidé si son portail de correspondance est bâti ou seulement fléché.
 */
export const CONCOURSE_SOURCES: readonly StationSources[] = Array.from(
  { length: 30 },
  (_, i): StationSources => ({
    stationIndex: i,
    sources: [jrEastPlan(i)],
    floorsHint: INDEXED_FLOORS_HINT[i],
  }),
);

/** Les sources d'une gare de la boucle. */
export function sourcesFor(index: number): StationSources {
  return CONCOURSE_SOURCES[((index % 30) + 30) % 30];
}

/**
 * Combien de sources ont réellement été LUES, tous rangs confondus.
 *
 * Publié pour que la documentation et les tests puissent citer le chiffre
 * plutôt que de le réaffirmer à la main : le jour où le réseau s'ouvre et où
 * les plans se lisent, il monte tout seul et le récit cesse d'être faux.
 */
export function readSourceCount(): number {
  return CONCOURSE_SOURCES.reduce(
    (n, s) => n + s.sources.filter((r) => r.retrieval === 'read').length,
    0,
  );
}
