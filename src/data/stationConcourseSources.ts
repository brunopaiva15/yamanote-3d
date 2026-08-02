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
// Les références JR East ci-dessous sont donc `indexed` par défaut : leur
// existence, leur adresse et leur titre sont confirmés, leur CONTENU ne l'est
// pas. Un profil ne peut se déclarer `verified` que sur une source de rang 1-3
// réellement LUE, et `validateProfile` le refuse - c'est toute la raison d'être
// de `SourceRetrieval` : rendre l'écart visible plutôt que confortable.
//
// LA SORTIE DE SECOURS, ET ELLE MARCHE : un plan FOURNI À LA MAIN. Le
// propriétaire du dépôt dépose le document dans la conversation, où il se lit
// comme n'importe quel fichier. La référence passe alors en `read` et la gare
// cesse d'être une approximation. C'est ainsi que Shinjuku a été relevée -
// trois niveaux, neuf groupes de portillons, sur un plan daté d'août 2026,
// c'est-à-dire la date de référence exacte du chantier (voir `EXTRA_SOURCES`).
//
// Les documents eux-mêmes ne sont PAS versionnés : ils portent
// « ©JR East Consultants Company ». On en cite l'adresse, la date et ce qu'on y
// a lu ; on ne redistribue pas le fichier.
//
// Pour les gares encore fermées, les profils s'appuieront sur ce que le dépôt
// sait déjà (`data/stations`, `data/stationLayouts`, `data/platforms`, relevés
// antérieurs) et sur ce que la recherche indexée confirme, avec la confiance
// qui correspond - `approximate` par défaut, `mostlyVerified` là où plusieurs
// sources indépendantes concordent. Les `openQuestions` de chaque profil
// diront ce qu'il reste à ouvrir.
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

/**
 * Gares dont la page estation ELLE-MÊME a été lue, avec la date du plan.
 *
 * Le cas ordinaire est autre : la série « Guide Maps for Major Stations » vit à
 * une adresse distincte (`/fr/e/stations/eNNNN.html`), et c'est elle qui est
 * fournie. Mais elle ne couvre pas toutes les gares - Uguisudani en est
 * exclue - et il faut alors se rabattre sur le 構内図 ordinaire, qui est
 * exactement cette page-ci. On ne duplique pas la référence : on la fait
 * passer en `read`.
 */
const READ_ESTATION: Readonly<Record<number, { date: string; note: string }>> = {
  // JY06 Uguisudani : seule gare de la boucle absente de la série « Guide
  // Maps », et son 構内図 date de juin 2022 — quatre ans avant la référence.
  5: {
    date: '2022-06',
    note: 'Capture fournie à la main (réseau bloqué). Porte « 2022年6月現在 » — '
      + 'QUATRE ANS avant la date de référence, le plus grand écart du relevé. '
      + 'Édition japonaise : les noms y sont en japonais (改札口, 南口, 北口). '
      + 'Seule gare que la série « Guide Maps for Major Stations » ne couvre pas. '
      + 'Non versionné : ©JR East Consultants Company.',
  },
};

function jrEastPlan(index: number): SourceReference {
  const i = ((index % 30) + 30) % 30;
  const read = READ_ESTATION[i];
  return {
    tier: 1,
    retrieval: read ? 'read' : 'indexed',
    publisher: 'JR East',
    title: `駅構内図・バリアフリー情報（${JR_EAST_NAME[i]}駅）`,
    url: jrEastPlanUrl(i),
    documentDate: read?.date,
    consultedAt: read ? '2026-08-02' : REGISTRY_CHECKED_AT,
    note: read
      ? read.note
      : 'adresse et titre confirmés par l’index ; contenu du plan non lu (réseau bloqué)',
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

// --- Les plans RÉELLEMENT LUS --------------------------------------------
//
// Une gare quitte l'approximation le jour où l'on ouvre son plan. Ces
// références-là portent `retrieval: 'read'`, et elles seules autorisent une
// confiance `verified`.
//
// Le document n'est pas versionné - il est sous copyright - mais tout ce qu'on
// en a tiré est écrit noir sur blanc dans `docs/STATION_CONCOURSE_EVIDENCE.md`,
// gare par gare et rubrique par rubrique. C'est la trace qui compte : elle se
// relit sans le fichier, et elle se conteste ligne à ligne.

const EXTRA_SOURCES: Readonly<Record<number, readonly SourceReference[]>> = {
  // JY17 Shinjuku. Le jeu de plans « Guide Maps for Major Stations » couvre
  // les trois niveaux qui font la gare : les quais (seize voies), le couloir
  // central du B1F et l'épine sud du 2F. Il porte sa date en clair -
  // « As of August, 2026 » - qui est exactement la date de référence du
  // chantier, travaux compris.
  16: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Shinjuku Station (quais, B1F, 2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e866.html',
      documentDate: '2026-08',
      consultedAt: '2026-08-02',
      note: 'PDF fournis à la main (réseau bloqué), en deux envois : trois vues '
        + 'de cadrage large, puis trois vues rapprochées qui donnent les horaires '
        + 'du Southeast Gate. Porte « As of August, 2026 » et l’avertissement '
        + '« There may be some changes due to construction work ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY01 Tokyo. Six onglets - 1F, M2F, 2F, B1F, Keiyo Line, Sobu Line - dont
  // CINQ fournis : la feuille Sobu Line manque. Datée de mai 2026.
  0: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Tokyo Station (1F, M2F, 2F, B1F, Keiyō)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1039.html',
      documentDate: '2026-05',
      consultedAt: '2026-08-02',
      note: 'PDF puis captures fournis à la main (réseau bloqué) : les SIX onglets, '
        + 'et les deux côtés. Le premier envoi cadrait Yaesu, le second Marunouchi '
        + 'à une résolution suffisante. Porte « As of May, 2026 » et '
        + 'l’avertissement de chantier. '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY03 Akihabara. Trois feuilles : 1F, 2F-M3, 3F. Janvier 2026.
  2: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Akihabara Station (1F, 2F-M3, 3F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e41.html',
      documentDate: '2026-01',
      consultedAt: '2026-08-02',
      note: 'PDF fournis à la main (réseau bloqué). Porte « As of January, 2026 ». '
        + 'Seul plan du relevé à écrire « Inner Loop » / « Outer Loop » en toutes '
        + 'lettres. Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY05 Ueno. Quatre feuilles, une par onglet de niveau : 1F-M2, 2F, 3F,
  // B4-B1. Même réserve de date que Shibuya : « As of June, 2026 ».
  4: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Ueno Station (1F-M2, 2F, 3F, B4-B1)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e204.html',
      documentDate: '2026-06',
      consultedAt: '2026-08-02',
      note: 'PDF fournis à la main (réseau bloqué), un par onglet de niveau. '
        + 'Porte « As of June, 2026 ». La feuille B4-B1 (Shinkansen et Tokyo '
        + 'Metro) n’a pas été dépouillée : hors périmètre Yamanote. '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY07 Nippori. Une feuille, onglet 1F-2F. AVRIL 2025 : le plan le plus
  // ancien de tout le relevé, seize mois avant la date de référence.
  6: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Nippori Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1184.html',
      documentDate: '2025-04',
      consultedAt: '2026-08-02',
      note: 'PDF fourni à la main (réseau bloqué). Porte « As of April, 2025 » — '
        + 'SEIZE MOIS avant la date de référence, le plus grand écart du relevé. '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY13 Ikebukuro. Deux feuilles : 1F-2F (les quais) et B1 (le hall). Datée
  // de février 2026.
  12: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Ikebukuro Station (1F-2F, B1)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e108.html',
      documentDate: '2026-02',
      consultedAt: '2026-08-02',
      note: 'PDF fournis à la main (réseau bloqué). Porte « As of February, 2026 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY19 Harajuku. Une seule feuille, onglet 1F-2F, mais elle couvre aussi le
  // B1F du côté Takeshita. LA PLUS ANCIENNE DU LOT : septembre 2025.
  18: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Harajuku Station (1F-2F, + B1F Takeshita)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1256.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'PDF fourni à la main (réseau bloqué). Porte « As of September, 2025 » — '
        + 'ONZE MOIS avant la date de référence, le plus grand écart du lot. '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY22 Meguro. Deux feuilles : B1-1F (JR) et B3-B2 (Tōkyū, Namboku, Mita).
  // Septembre 2025.
  21: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Meguro Station (B1-1F, B3-B2)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1552.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'PDF fournis à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'La feuille B3-B2 (Tōkyū Meguro, Namboku, Mita) n’a pas été dépouillée : '
        + 'hors périmètre JR. Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY25 Shinagawa. Deux feuilles, 1F (les quais) et 2F (le hall-passerelle).
  // Juillet 2026, la deuxième date la plus proche de la référence. Mais le
  // CADRAGE est panoramé vers le sud : les voies 1 à 3 et le Central Gate en
  // sortent.
  24: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Shinagawa Station (1F, 2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e788.html',
      documentDate: '2026-07',
      consultedAt: '2026-08-02',
      note: 'PDF fournis à la main (réseau bloqué), puis RECADRÉS en captures PNG '
        + 'sur demande : le premier envoi coupait les voies Yamanote, le Central '
        + 'Gate et le côté Takanawa. Le second les couvre. '
        + 'Porte « As of July, 2026 ». Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY29 Shimbashi. Trois onglets : 2F, B1-1F, B5-B4. Septembre 2025.
  28: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Shimbashi Station (2F, B1-1F, B5-B4)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e877.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Captures fournies à la main (réseau bloqué), les trois onglets. '
        + 'Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY26 Takanawa Gateway. Onglet unique 1F-3F. Septembre 2025 : antérieur à
  // une bonne partie de l'ouverture de Takanawa Gateway City, ce qui compte
  // précisément pour cette gare-là.
  25: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Takanawa Gateway Station (1F-3F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1750.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'PDF fourni à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Sur une gare dont le quartier s’ouvre par tranches, l’écart de onze mois '
        + 'porte surtout sur les commerces et les liaisons de dalle. '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY20 Shibuya. ATTENTION À LA DATE : ce jeu-ci porte « As of June, 2026 »,
  // deux mois AVANT la date de référence du chantier. Sur une gare en
  // reconstruction permanente, deux mois ne sont pas rien - c'est la seule
  // gare de la boucle dont le relevé et la date de référence ne coïncident
  // pas, et cela se dit à chaque fait qui en vient.
  19: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Shibuya Station (quais 2F, 1F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e808.html',
      documentDate: '2026-06',
      consultedAt: '2026-08-02',
      note: 'PDF fourni à la main (réseau bloqué). Porte « As of June, 2026 » — '
        + 'DEUX MOIS avant la date de référence du chantier, sur une gare en '
        + 'travaux. Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY21 Ebisu. Onglet unique 1F-3F. Septembre 2025.
  20: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Ebisu Station (1F-3F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e290.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY24 Ōsaki. Onglet unique 1F-2F. Avril 2026.
  23: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Ōsaki Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e319.html',
      documentDate: '2026-04',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of April, 2026 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY28 Hamamatsuchō. Onglet unique 1F-3F. Juin 2026.
  27: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Hamamatsuchō Station (1F-3F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1248.html',
      documentDate: '2026-06',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of June, 2026 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY30 Yūrakuchō. Onglet unique 1F-2F. Septembre 2025.
  29: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Yūrakuchō Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1617.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY02 Kanda. Onglet unique 1F-2F. Juillet 2025.
  1: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Kanda Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e538.html',
      documentDate: '2025-07',
      consultedAt: '2026-08-02',
      note: 'Captures fournies à la main (réseau bloqué). Porte « As of July, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY04 Okachimachi. Onglet unique 1F-2F. JANVIER 2024 : le plan le plus
  // ancien de tout le relevé, plus de deux ans avant la date de référence.
  3: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Okachimachi Station (1F-2F, M2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e355.html',
      documentDate: '2024-01',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of January, 2024 » — '
        + 'DEUX ANS ET DEMI avant la date de référence, le plus grand écart du relevé. '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY15 Takadanobaba. Onglet unique 1F-2F. Juin 2026.
  14: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Takadanobaba Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e938.html',
      documentDate: '2026-06',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of June, 2026 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY23 Gotanda. Onglet unique 1F-4F. Septembre 2025.
  22: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Gotanda Station (1F-4F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e695.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY08 Nishi-Nippori. Onglet unique 1F-2F. Février 2024.
  7: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Nishi-Nippori Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1167.html',
      documentDate: '2024-02',
      consultedAt: '2026-08-02',
      note: 'Captures fournies à la main (réseau bloqué). Porte « As of February, 2024 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY09 Tabata. Onglet unique B1-1F. Février 2024.
  8: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Tabata Station (B1-1F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e972.html',
      documentDate: '2024-02',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of February, 2024 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY27 Tamachi. Onglet unique 1F-2F. Avril 2026.
  26: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Tamachi Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e976.html',
      documentDate: '2026-04',
      consultedAt: '2026-08-02',
      note: 'Captures fournies à la main (réseau bloqué). Porte « As of April, 2026 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  9: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Komagome Station (B1-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e712.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  10: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Sugamo Station (B1-1F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e896.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  11: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Ōtsuka Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e330.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  13: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Mejiro Station (B1-1F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1553.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  15: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Shin-Ōkubo Station (1F-2F, 4F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e857.html',
      documentDate: '2025-09',
      consultedAt: '2026-08-02',
      note: 'Capture fournie à la main (réseau bloqué). Porte « As of September, 2025 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
  // JY18 Yoyogi. Onglet unique 1F-2F. Janvier 2026.
  17: [
    {
      tier: 1,
      retrieval: 'read',
      publisher: 'JR East / JR East Consultants Company',
      title: 'Guide Maps for Major Stations — Yoyogi Station (1F-2F)',
      url: 'https://www.jreast.co.jp/fr/e/stations/e1654.html',
      documentDate: '2026-01',
      consultedAt: '2026-08-02',
      note: 'Captures fournies à la main (réseau bloqué). Porte « As of January, 2026 ». '
        + 'Non versionné : ©JR East Consultants Company.',
    },
  ],
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
 * Chaque gare part avec sa page de plan JR East, et s'enrichit de ce qui a
 * réellement été ouvert. Les opérateurs en correspondance et les galeries
 * commerciales viendront gare par gare, quand on saura lesquels comptent pour
 * le périmètre jouable : une gare n'a pas besoin de la page du Keikyū tant
 * qu'on n'a pas décidé si son portail de correspondance est bâti ou fléché.
 */
export const CONCOURSE_SOURCES: readonly StationSources[] = Array.from(
  { length: 30 },
  (_, i): StationSources => ({
    stationIndex: i,
    // Les plans lus passent DEVANT la page indexée : c'est l'ordre de la
    // preuve, pas celui de la découverte.
    sources: [...(EXTRA_SOURCES[i] ?? []), jrEastPlan(i)],
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
