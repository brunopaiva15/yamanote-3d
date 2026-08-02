# Relevé des halls de gare — sources et incertitudes

Date de référence architecturale et commerciale : **2026-08** (août 2026).

Ce document est le carnet de relevé du chantier décrit dans
`docs/STATION_CONCOURSE_PLAN.md`. Une fiche par gare, toujours dans le même
ordre : sources, niveaux, groupes de portillons, sorties, correspondances,
commerces structurants, travaux, ce qui reste incertain, et le compromis retenu
pour le jeu.

---

## ⚠ État de la vérification — à lire avant toute fiche

**Aucun plan officiel n'a été ouvert.** L'environnement de développement de ce
dépôt n'atteint pas les sites des opérateurs : la passerelle réseau refuse la
connexion (403 sur `CONNECT`) vers `jreast.co.jp`, `tokyometro.jp`,
`kotsu.metro.tokyo.jp` et le reste. Le seul canal disponible est la recherche
indexée, qui rend des titres et des adresses — jamais le contenu d'une page.

Ce qui a donc été fait, et c'est tout ce qui a été fait :

- les **trente adresses de plan JR East** ont été identifiées et confirmées une
  par une, par concordance entre l'adresse indexée et le titre de la page, qui
  porte le nom de la gare (「JR東日本：駅構内図・バリアフリー情報（神田駅）」).
  Le numéro interne JR East n'a aucun rapport avec le code JY — Akihabara est
  41, Tokyo 1039, Takanawa Gateway 1750 — et se devine encore moins ;
- les **points d'entrée** de Tokyo Metro, Toei, ecute et atré ont été confirmés
  de la même façon ;
- quelques **indications de niveaux** ont été récoltées dans les résumés
  d'indexation (« B1-1F », « 1F / 2F-M3 / 3F »). Ce sont des indications, pas
  des relevés : elles orientent la vérification, elles ne la remplacent pas.

Conséquences, tenues par le code et non par la bonne volonté :

1. chaque référence JR East porte `retrieval: 'indexed'` et non `'read'`
   (`data/stationConcourseSources`) ;
2. `validateProfile` **refuse** qu'un profil se déclare `verified` sans qu'une
   source de rang 1-3 ait été lue. Aucune gare ne pourra donc être marquée
   vérifiée tant que les plans n'auront pas été ouverts ;
3. les profils de la phase 5 s'appuieront sur ce que le dépôt a déjà relevé
   (`data/stations`, `data/stationLayouts`, `data/platforms`,
   `docs/PLATFORM_EVIDENCE.md`) et sur ce que l'index confirme, avec la
   confiance qui correspond.

**Ce qu'il faudra faire quand le réseau s'ouvrira** : ouvrir les trente plans,
passer les références en `read`, et remonter les fiches ci-dessous. Le champ
`openQuestions` de chaque profil dit ce qu'il faut y chercher.

---

## Comment lire une fiche

| Rubrique | Ce qu'elle contient |
|---|---|
| **Sources** | l'adresse de chaque document, et ce qu'on en a fait |
| **Niveaux** | les étages que la gare publie, et où se tient chaque hall |
| **Groupes de portillons** | les 改札口 nommés, et ce qui les sépare |
| **Sorties** | les noms réels, japonais et anglais, plus le numéro Metro s'il existe |
| **Correspondances** | les lignes, et surtout leur DIRECTION depuis le hall |
| **Commerces structurants** | ce qui donne son échelle au hall, pas la liste des boutiques |
| **Travaux** | l'état d'août 2026 |
| **Incertain** | ce qui n'est pas établi, nommément |
| **Compromis de jeu** | ce qui est construit, ce qui est seulement représenté |

Le rang d'une source suit l'ordre de priorité du chantier : **1** JR East ·
**2** Tokyo Metro · **3** Toei · **4** autres opérateurs · **5** galeries
intégrées (atré, ecute, NEWoMan, Gransta) · **6** pages de travaux ·
**7** photographies et vidéos récentes · **8** Google Maps / Street View, et
seulement pour vérifier une orientation en surface.

---

## JY01 Tokyo — 東京

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（東京駅） | [ja](https://www.jreast.co.jp/estation/stations/1039.html) · [en](https://www.jreast.co.jp/en/estation/stations/1039.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Chūō · Tōkaidō Shinkansen ;
- affluence relative : 2.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY02 Kanda — 神田

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（神田駅） | [ja](https://www.jreast.co.jp/estation/stations/538.html) · [en](https://www.jreast.co.jp/en/estation/stations/538.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chūō · Ginza ;
- affluence relative : 1.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY03 Akihabara — 秋葉原

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（秋葉原駅） | [ja](https://www.jreast.co.jp/estation/stations/41.html) · [en](https://www.jreast.co.jp/en/estation/stations/41.html) | `indexed` — non lu |

**Niveaux publiés** — `1F / 2F-M3 / 3F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chūō–Sōbu · Hibiya · Tsukuba Express ;
- affluence relative : 1.4.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY04 Okachimachi — 御徒町

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（御徒町駅） | [ja](https://www.jreast.co.jp/estation/stations/355.html) · [en](https://www.jreast.co.jp/en/estation/stations/355.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Ginza · Hibiya · Ōedo ;
- affluence relative : 0.95.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY05 Ueno — 上野

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（上野駅） | [ja](https://www.jreast.co.jp/estation/stations/204.html) · [en](https://www.jreast.co.jp/en/estation/stations/204.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Utsunomiya · Takasaki · Jōban · Tōhoku Shinkansen ;
- affluence relative : 1.6.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY06 Uguisudani — 鶯谷

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（鶯谷駅） | [ja](https://www.jreast.co.jp/estation/stations/209.html) · [en](https://www.jreast.co.jp/en/estation/stations/209.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōhoku Shinkansen ;
- affluence relative : 0.55.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY07 Nippori — 日暮里

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（日暮里駅） | [ja](https://www.jreast.co.jp/estation/stations/1184.html) · [en](https://www.jreast.co.jp/en/estation/stations/1184.html) | `indexed` — non lu |

**Niveaux publiés** — `1F-2F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Jōban · Keisei · Nippori–Toneri Liner ;
- affluence relative : 1.2.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY08 Nishi-Nippori — 西日暮里

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（西日暮里駅） | [ja](https://www.jreast.co.jp/estation/stations/1167.html) · [en](https://www.jreast.co.jp/en/estation/stations/1167.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chiyoda · Nippori–Toneri Liner ;
- affluence relative : 0.9.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY09 Tabata — 田端

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（田端駅） | [ja](https://www.jreast.co.jp/estation/stations/972.html) · [en](https://www.jreast.co.jp/en/estation/stations/972.html) | `indexed` — non lu |

**Niveaux publiés** — `B1-1F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōhoku Shinkansen ;
- affluence relative : 0.8.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY10 Komagome — 駒込

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（駒込駅） | [ja](https://www.jreast.co.jp/estation/stations/712.html) · [en](https://www.jreast.co.jp/en/estation/stations/712.html) | `indexed` — non lu |

**Niveaux publiés** — `B1-2F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Namboku ;
- affluence relative : 0.8.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY11 Sugamo — 巣鴨

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（巣鴨駅） | [ja](https://www.jreast.co.jp/estation/stations/896.html) · [en](https://www.jreast.co.jp/en/estation/stations/896.html) | `indexed` — non lu |

**Niveaux publiés** — `B1-1F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Mita ;
- affluence relative : 0.85.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY12 Ōtsuka — 大塚

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（大塚駅） | [ja](https://www.jreast.co.jp/estation/stations/330.html) · [en](https://www.jreast.co.jp/en/estation/stations/330.html) | `indexed` — non lu |

**Niveaux publiés** — `1F-2F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Toden Arakawa ;
- affluence relative : 0.9.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY13 Ikebukuro — 池袋

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（池袋駅） | [ja](https://www.jreast.co.jp/estation/stations/108.html) · [en](https://www.jreast.co.jp/en/estation/stations/108.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, deux îlots Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Seibu Ikebukuro · Tōbu Tōjō ;
- affluence relative : 2.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY14 Mejiro — 目白

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（目白駅） | [ja](https://www.jreast.co.jp/estation/stations/1553.html) · [en](https://www.jreast.co.jp/en/estation/stations/1553.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : — ;
- affluence relative : 0.75.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY15 Takadanobaba — 高田馬場

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（高田馬場駅） | [ja](https://www.jreast.co.jp/estation/stations/938.html) · [en](https://www.jreast.co.jp/en/estation/stations/938.html) | `indexed` — non lu |

**Niveaux publiés** — `1F-2F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Seibu Shinjuku · Tōzai ;
- affluence relative : 1.4.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY16 Shin-Ōkubo — 新大久保

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（新大久保駅） | [ja](https://www.jreast.co.jp/estation/stations/857.html) · [en](https://www.jreast.co.jp/en/estation/stations/857.html) | `indexed` — non lu |

**Niveaux publiés** — `1F-2F, 4F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : — ;
- affluence relative : 1.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY17 Shinjuku — 新宿

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（新宿駅） | [ja](https://www.jreast.co.jp/estation/stations/866.html) · [en](https://www.jreast.co.jp/en/estation/stations/866.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Chūō–Sōbu ;
- lignes visibles ou en correspondance : Chūō · Saikyō · Shōnan–Shinjuku · Odakyū · Keiō ;
- affluence relative : 2.2 ; **gare en travaux**.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY18 Yoyogi — 代々木

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（代々木駅） | [ja](https://www.jreast.co.jp/estation/stations/1654.html) · [en](https://www.jreast.co.jp/en/estation/stations/1654.html) | `indexed` — non lu |

**Niveaux publiés** — `1F-2F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Chūō–Sōbu ;
- lignes visibles ou en correspondance : Ōedo ;
- affluence relative : 0.9.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY19 Harajuku — 原宿

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（原宿駅） | [ja](https://www.jreast.co.jp/estation/stations/1256.html) · [en](https://www.jreast.co.jp/en/estation/stations/1256.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, quais latéraux ;
- lignes visibles ou en correspondance : Chiyoda · Fukutoshin ;
- affluence relative : 1.3.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY20 Shibuya — 渋谷

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（渋谷駅） | [ja](https://www.jreast.co.jp/estation/stations/808.html) · [en](https://www.jreast.co.jp/en/estation/stations/808.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Ginza · Tōkyū Tōyoko ;
- affluence relative : 2 ; **gare en travaux**.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY21 Ebisu — 恵比寿

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（恵比寿駅） | [ja](https://www.jreast.co.jp/estation/stations/290.html) · [en](https://www.jreast.co.jp/en/estation/stations/290.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Hibiya ;
- affluence relative : 1.2.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY22 Meguro — 目黒

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（目黒駅） | [ja](https://www.jreast.co.jp/estation/stations/1552.html) · [en](https://www.jreast.co.jp/en/estation/stations/1552.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Namboku · Mita · Tōkyū Meguro ;
- affluence relative : 1.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY23 Gotanda — 五反田

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（五反田駅） | [ja](https://www.jreast.co.jp/estation/stations/695.html) · [en](https://www.jreast.co.jp/en/estation/stations/695.html) | `indexed` — non lu |

**Niveaux publiés** — `1F-4F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Tōkyū Ikegami · Asakusa ;
- affluence relative : 1.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY24 Ōsaki — 大崎

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（大崎駅） | [ja](https://www.jreast.co.jp/estation/stations/319.html) · [en](https://www.jreast.co.jp/en/estation/stations/319.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, deux îlots Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Rinkai ;
- affluence relative : 1.3.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY25 Shinagawa — 品川

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（品川駅） | [ja](https://www.jreast.co.jp/estation/stations/788.html) · [en](https://www.jreast.co.jp/en/estation/stations/788.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Yokosuka · Tōkaidō Shinkansen · Keikyū ;
- affluence relative : 1.7 ; **gare en travaux**.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY26 Takanawa Gateway — 高輪ゲートウェイ

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（高輪ゲートウェイ駅） | [ja](https://www.jreast.co.jp/estation/stations/1750.html) · [en](https://www.jreast.co.jp/en/estation/stations/1750.html) | `indexed` — non lu |

**Niveaux publiés** — `1F-3F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot Yamanote ;
- lignes visibles ou en correspondance : Keihin-Tōhoku ;
- affluence relative : 0.7.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY27 Tamachi — 田町

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（田町駅） | [ja](https://www.jreast.co.jp/estation/stations/976.html) · [en](https://www.jreast.co.jp/en/estation/stations/976.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō ;
- affluence relative : 1 ; **gare en travaux**.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY28 Hamamatsuchō — 浜松町

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（浜松町駅） | [ja](https://www.jreast.co.jp/estation/stations/1248.html) · [en](https://www.jreast.co.jp/en/estation/stations/1248.html) | `indexed` — non lu |

**Niveaux publiés** — `1F-3F` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tokyo Monorail · Asakusa · Ōedo ;
- affluence relative : 1.1 ; **gare en travaux**.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY29 Shimbashi — 新橋

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（新橋駅） | [ja](https://www.jreast.co.jp/estation/stations/877.html) · [en](https://www.jreast.co.jp/en/estation/stations/877.html) | `indexed` — non lu |

**Niveaux publiés** — `B1-1F, B5-B4` *(annoncé par l'index, plan non lu)*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Yokosuka · Ginza · Asakusa · Yurikamome ;
- affluence relative : 1.5.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---

## JY30 Yūrakuchō — 有楽町

*Date de référence : 2026-08. Confiance du relevé : **à établir** (phase 4).*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（有楽町駅） | [ja](https://www.jreast.co.jp/estation/stations/1617.html) · [en](https://www.jreast.co.jp/en/estation/stations/1617.html) | `indexed` — non lu |

**Niveaux publiés** — *non annoncé par l’index — à relever*

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Yūrakuchō ;
- affluence relative : 1.1.

**Groupes de portillons** — *à relever*

**Sorties** — *à relever*

**Correspondances et leur direction** — *à relever*

**Commerces structurants** — *à relever*

**Travaux (août 2026)** — *à relever*

**Incertain** — tout ce qui précède est marqué « à relever » : le plan officiel
n'a pas pu être ouvert depuis cet environnement.

**Compromis de jeu** — *décidé en phase 5*

---
