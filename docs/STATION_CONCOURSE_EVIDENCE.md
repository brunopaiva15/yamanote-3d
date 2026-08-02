# Relevé des halls de gare — sources et incertitudes

Date de référence architecturale et commerciale : **2026-08** (août 2026).

Ce document est le carnet de relevé du chantier décrit dans
`docs/STATION_CONCOURSE_PLAN.md`. Une fiche par gare, toujours dans le même
ordre : sources, niveaux, groupes de portillons, sorties, correspondances,
commerces structurants, travaux, ce qui reste incertain, et le compromis retenu
pour le jeu.

**Il est généré** (`npm run docs:concourse`) depuis le registre des sources et
la table de relevés de `scripts/concourse-evidence.mjs`. Ne pas l'éditer à la
main : une fiche qui survivrait à la donnée qui la justifie est exactement le
genre de document qui ment.

---

## ⚠ État de la vérification — à lire avant toute fiche

**Plans officiels ouverts et lus : 2 / 30.**

L'environnement de développement de ce dépôt n'atteint pas les sites des
opérateurs : la passerelle réseau refuse la connexion (403 sur `CONNECT`) vers
`jreast.co.jp`, `tokyometro.jp`, `kotsu.metro.tokyo.jp` et le reste. Le seul
canal automatique disponible est la recherche indexée, qui rend des titres et
des adresses — jamais le contenu d'une page.

Ce qui a donc été fait :

- les **trente adresses de plan JR East** ont été identifiées et confirmées une
  par une, par concordance entre l'adresse indexée et le titre de la page, qui
  porte le nom de la gare (「JR東日本：駅構内図・バリアフリー情報（神田駅）」).
  Le numéro interne JR East n'a aucun rapport avec le code JY — Akihabara est
  41, Tokyo 1039, Takanawa Gateway 1750 — et se devine encore moins ;
- les **points d'entrée** de Tokyo Metro, Toei, ecute et atré ont été confirmés
  de la même façon ;
- quelques **indications de niveaux** ont été récoltées dans les résumés
  d'indexation (« B1-1F », « 1F / 2F-M3 / 3F »). Ce sont des indications, pas
  des relevés : elles orientent la vérification, elles ne la remplacent pas ;
- **les plans fournis à la main ont été lus.** C'est la voie qui marche : le
  document déposé dans la conversation se lit comme n'importe quel fichier, et
  la gare quitte l'approximation. Shinjuku est passée par là.

Ce qui tient tout cela en place, et c'est du code :

1. chaque référence porte `retrieval` — `read`, `indexed` ou `catalogued`
   (`data/stationConcourseSources`) ;
2. `validateProfile` **refuse** qu'un profil se déclare `verified` sans qu'une
   source de rang 1-3 ait été lue ;
3. un test lie ce carnet au registre : le compte de plans lus affiché ci-dessus
   est calculé, pas recopié.

### Date de chaque plan lu

Un plan de juin et un plan d'août ne décrivent pas la même gare quand la gare
est un chantier. Les dates sont donc affichées avant les fiches, et jamais
fondues dans le texte.

| Gare | Date du plan | Écart |
|---|---|---|
| JY17 Shinjuku | 2026-08 | ✅ la date de référence |
| JY20 Shibuya | 2026-06 | ⚠️ **décalé** par rapport à la référence |

**Les documents ne sont pas versionnés.** Ils portent
« ©JR East Consultants Company ». On en cite l'adresse, la date et ce qu'on y a
lu ; on ne redistribue pas le fichier. C'est la raison d'être des fiches
ci-dessous : elles se relisent sans le plan, et se contestent ligne à ligne.

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

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（東京駅） | [ja](https://www.jreast.co.jp/estation/stations/1039.html) · [en](https://www.jreast.co.jp/en/estation/stations/1039.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Chūō · Tōkaidō Shinkansen ;
- affluence relative : 2 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY02 Kanda — 神田

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（神田駅） | [ja](https://www.jreast.co.jp/estation/stations/538.html) · [en](https://www.jreast.co.jp/en/estation/stations/538.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chūō · Ginza ;
- affluence relative : 1 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY03 Akihabara — 秋葉原

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（秋葉原駅） | [ja](https://www.jreast.co.jp/estation/stations/41.html) · [en](https://www.jreast.co.jp/en/estation/stations/41.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chūō–Sōbu · Hibiya · Tsukuba Express ;
- affluence relative : 1.4 ;
- niveaux publiés : `1F / 2F-M3 / 3F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY04 Okachimachi — 御徒町

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（御徒町駅） | [ja](https://www.jreast.co.jp/estation/stations/355.html) · [en](https://www.jreast.co.jp/en/estation/stations/355.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Ginza · Hibiya · Ōedo ;
- affluence relative : 0.95 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY05 Ueno — 上野

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（上野駅） | [ja](https://www.jreast.co.jp/estation/stations/204.html) · [en](https://www.jreast.co.jp/en/estation/stations/204.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Utsunomiya · Takasaki · Jōban · Tōhoku Shinkansen ;
- affluence relative : 1.6 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY06 Uguisudani — 鶯谷

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（鶯谷駅） | [ja](https://www.jreast.co.jp/estation/stations/209.html) · [en](https://www.jreast.co.jp/en/estation/stations/209.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōhoku Shinkansen ;
- affluence relative : 0.55 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY07 Nippori — 日暮里

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（日暮里駅） | [ja](https://www.jreast.co.jp/estation/stations/1184.html) · [en](https://www.jreast.co.jp/en/estation/stations/1184.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Jōban · Keisei · Nippori–Toneri Liner ;
- affluence relative : 1.2 ;
- niveaux publiés : `1F-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY08 Nishi-Nippori — 西日暮里

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（西日暮里駅） | [ja](https://www.jreast.co.jp/estation/stations/1167.html) · [en](https://www.jreast.co.jp/en/estation/stations/1167.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chiyoda · Nippori–Toneri Liner ;
- affluence relative : 0.9 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY09 Tabata — 田端

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（田端駅） | [ja](https://www.jreast.co.jp/estation/stations/972.html) · [en](https://www.jreast.co.jp/en/estation/stations/972.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōhoku Shinkansen ;
- affluence relative : 0.8 ;
- niveaux publiés : `B1-1F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY10 Komagome — 駒込

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（駒込駅） | [ja](https://www.jreast.co.jp/estation/stations/712.html) · [en](https://www.jreast.co.jp/en/estation/stations/712.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Namboku ;
- affluence relative : 0.8 ;
- niveaux publiés : `B1-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY11 Sugamo — 巣鴨

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（巣鴨駅） | [ja](https://www.jreast.co.jp/estation/stations/896.html) · [en](https://www.jreast.co.jp/en/estation/stations/896.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Mita ;
- affluence relative : 0.85 ;
- niveaux publiés : `B1-1F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY12 Ōtsuka — 大塚

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（大塚駅） | [ja](https://www.jreast.co.jp/estation/stations/330.html) · [en](https://www.jreast.co.jp/en/estation/stations/330.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Toden Arakawa ;
- affluence relative : 0.9 ;
- niveaux publiés : `1F-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY13 Ikebukuro — 池袋

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（池袋駅） | [ja](https://www.jreast.co.jp/estation/stations/108.html) · [en](https://www.jreast.co.jp/en/estation/stations/108.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, deux îlots Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Seibu Ikebukuro · Tōbu Tōjō ;
- affluence relative : 2 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY14 Mejiro — 目白

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（目白駅） | [ja](https://www.jreast.co.jp/estation/stations/1553.html) · [en](https://www.jreast.co.jp/en/estation/stations/1553.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : — ;
- affluence relative : 0.75 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY15 Takadanobaba — 高田馬場

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（高田馬場駅） | [ja](https://www.jreast.co.jp/estation/stations/938.html) · [en](https://www.jreast.co.jp/en/estation/stations/938.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Seibu Shinjuku · Tōzai ;
- affluence relative : 1.4 ;
- niveaux publiés : `1F-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY16 Shin-Ōkubo — 新大久保

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（新大久保駅） | [ja](https://www.jreast.co.jp/estation/stations/857.html) · [en](https://www.jreast.co.jp/en/estation/stations/857.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : — ;
- affluence relative : 1 ;
- niveaux publiés : `1F-2F, 4F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY17 Shinjuku — 新宿

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified`.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Shinjuku Station (quais, B1F, 2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e866.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（新宿駅） | [ja](https://www.jreast.co.jp/estation/stations/866.html) · [en](https://www.jreast.co.jp/en/estation/stations/866.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Chūō–Sōbu ;
- lignes visibles ou en correspondance : Chūō · Saikyō · Shōnan–Shinjuku · Odakyū · Keiō ;
- affluence relative : 2.2 ; **gare en travaux** ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **B1F** — le couloir central est-ouest (中央通路). Zone payante d’un seul tenant, avec une volée vers chaque quai : voies 1&2, 3&4, 5&6 (au bout d’un long couloir vers l’est), 7&8, 9&10, 11&12, 13&14, 15&16.
- **1F** — les seize voies, sur huit quais.
- **2F** — l’épine sud, nord-sud, qui redescend elle aussi vers les huit quais.
- **3F / 4F** — hors emprise JR : arrêts de taxi (3F), terminal de bus autoroutiers et bus aéroport (4F).

**Groupes de portillons**

- **B1F** : East Gate · West Gate · Central East Gate · **Central West Gate (6:00 – dernier train)**.
- **2F** : **Southeast Gate (7:00 – 24:00)** · South Gate · Kōshū-kaidō Gate · New South Gate · MIRAINA TOWER Gate.
- **Deux groupes sur neuf FERMENT LA NUIT** — Central West (B1F) et Southeast (2F). Le plan donne leurs horaires et ceux-là seulement : les sept autres sont ouverts au service. Une gare dont certains contrôles s’éteignent n’est pas une gare dont tous les contrôles se valent, et c’est le genre de fait qu’aucune génération ne produit.
- **B1F, branche sud** : JR Central West Gate (Keiō Exit), puis Keiō Line Gate — deux lignes de contrôle qui se suivent dans le même couloir.
- Chaque groupe a ses *Tickets* et son *Fare Adjustment* accolés ; les ascenseurs sont balisés de **A à O**.

**Ordre le long du quai** — Du **nord au sud** le long des quais, le plan porte cinq brackets : East & West Gate (B1F) → Central East & Central West (B1F) → Southeast & South (2F) → Central East & Central West (B1F, seconde volée) → Kōshū-kaidō, New South & MIRAINA TOWER (2F). **C’est l’ossature de la gare** : deux niveaux de contrôle qui alternent le long d’un même quai, et non un hall unique.

**Voies Yamanote** — Voie **14** = Yamanote *for Harajuku, Shibuya & Shinagawa* (外回り) ; voie **15** = Yamanote *for Ikebukuro, Tabata & Ueno* (内回り). Les deux quais sont partagés : **13 + 14** (13 = Chūō-Sōbu local pour Chiba) et **15 + 16** (16 = Chūō-Sōbu local pour Mitaka). Ce qui **confirme** le relevé du dépôt : `config: sharedIsland`, `sharedWith: Chūō–Sōbu`.

**Correspondances et leur direction**

- **Keiō** — par *JR Central West Gate (Keiō Exit)*, au bout d’une branche qui part du Central West Gate vers le sud, en B1F. Marqué aussi « for Keiō Line » à deux endroits du couloir central.
- **Odakyū** — « for Odakyū Line », B1F, juste à l’est du Central West Gate.
- **Toei Shinjuku & Ōedo** — au-delà du Keiō Line Gate, même branche sud.
- **Saikyō / Shōnan-Shinjuku** — voies 1 à 4 ; **Narita Express / Tōbu (direct)** — voies 5 et 6. Correspondances internes JR, donc en zone payante.

**Commerces structurants**

- **EATo LUMINE** — *dans la zone payante* du B1F, entre les volées des voies 9&10 et 13&14. C’est le fait le plus remarquable du plan : une galerie de restauration côté 改札内, pas une devanture de couloir.
- **LUMINE EST Shinjuku** — zone libre du B1F, au nord-est du Central East Gate, avec ses propres « for Exit ».
- **NEWoMan** — 2F, de part et d’autre de l’épine sud, en zone libre comme en bordure de zone payante. **LUMINE 0** au nord-ouest du même niveau, **LUMINE 2** contre le Southeast Gate.
- **NewDays** — zone payante B1F, près des volées 15&16. **KIOSK** sur les quais 1&2 et 3&4. Un **SHOP** au B1F.
- **Suica Penguin Park** et la **Statue of Suica Penguin** — zone libre 2F est, contre le terminal de bus.

**Travaux (août 2026)**

Le plan porte une zone **« Under Construction »** sur le flanc sud du couloir B1F, entre les volées des voies 7&8 et 11&12, et l’avertissement « *There may be some changes due to construction work. As of August, 2026* ». C’est la seule gare de la boucle dont le plan officiel se déclare lui-même provisoire.

**Incertain**

- Le cadrage fourni ne montre pas l’implantation exacte des **East Gate** et **West Gate** (B1F) : leurs noms et leur niveau sont établis par les brackets du plan de quais, leur géométrie non.
- Le plan est celui de **JR seul** : ni Tokyo Metro Marunouchi, ni Seibu Shinjuku, ni les numéros de sortie Metro n’y figurent.
- Les **noms japonais** des groupes de portillons ne sont pas sur ce jeu de plans (édition anglaise) : 中央東改札 / 中央西改札 / 甲州街道改札 / 新南改札 restent à confirmer sur l’édition japonaise.
- L’emprise précise de la zone « Under Construction » est indiquée par une accolade, pas par un contour coté.

**Compromis de jeu**

Tranche jouable autour du **Central East Gate (B1F)**, qui est le groupe le plus proche du milieu des quais 13-16 et donc celui qu’on trouve en descendant du train. Représentés sans être visitables : la branche est vers les voies 5&6 (long couloir, virage), la branche sud vers Keiō / Toei (deux lignes de contrôle en enfilade), l’épine 2F et ses trois groupes (par les volées montantes et leur signalétique), le Central West Gate (perspective en bout de couloir). **EATo LUMINE** donne son échelle à la zone payante ; la palissade de chantier ferme le flanc sud.

---

## JY18 Yoyogi — 代々木

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（代々木駅） | [ja](https://www.jreast.co.jp/estation/stations/1654.html) · [en](https://www.jreast.co.jp/en/estation/stations/1654.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Chūō–Sōbu ;
- lignes visibles ou en correspondance : Ōedo ;
- affluence relative : 0.9 ;
- niveaux publiés : `1F-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY19 Harajuku — 原宿

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（原宿駅） | [ja](https://www.jreast.co.jp/estation/stations/1256.html) · [en](https://www.jreast.co.jp/en/estation/stations/1256.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, quais latéraux ;
- lignes visibles ou en correspondance : Chiyoda · Fukutoshin ;
- affluence relative : 1.3 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY20 Shibuya — 渋谷

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — mais sur un plan de **juin** 2026, pas d’août.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Shibuya Station (quais 2F, 1F) | [lien](https://www.jreast.co.jp/fr/e/stations/e808.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（渋谷駅） | [ja](https://www.jreast.co.jp/estation/stations/808.html) · [en](https://www.jreast.co.jp/en/estation/stations/808.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Ginza · Tōkyū Tōyoko ;
- affluence relative : 2 ; **gare en travaux** ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **2F** — les quais. Deux îlots : **voies 1 et 2** (Yamanote) et **voies 3 et 4** (Saikyō / Shōnan-Shinjuku / Narita Express).
- **1F** — le niveau des contrôles South et Hachikō, et des sorties de rue.
- Le plan fourni ne couvre que ces deux niveaux : ni les quais Ginza en hauteur, ni les niveaux Tōkyū / Metro en profondeur n’y figurent — ils ne sont pas JR.

**Groupes de portillons**

- **Central Gate** · **South Gate** · **Hachikō Gate** · **New South Gate** — quatre groupes, et c’est tout ce que JR exploite ici.
- Le Hachikō Gate a son propre bloc au 1F, avec *Tickets*, *Fare Adjustment* et un passage marqué **« Exit Only »** — une bretelle à sens unique, pas un second contrôle.
- Ascenseurs balisés **A à F**.

**Ordre le long du quai** — Du **sud au nord** le long des quais, les brackets se suivent ainsi : New South Gate → Central Gate → South Gate → Central Gate + South Gate → Central Gate → **Hachikō Gate** (le plus long bracket, tout au nord). Le New South Gate est **loin** au sud, séparé du reste — ce n’est pas une variante du South Gate, c’est un autre bout de gare.

**Voies Yamanote** — Voie **1** = Yamanote *for Shinjuku, Ikebukuro & Ueno* (内回り) ; voie **2** = Yamanote *for Shinagawa, Hamamatsuchō & Tōkyō* (外回り). Les deux sens **se font face sur le même îlot**, ce qui **confirme** le relevé du dépôt (`config: island`) — contrairement à Shinjuku, où ils sont sur deux quais partagés. Voies 3 et 4 : Saikyō (vers Ōmiya d’un côté, vers Ebisu・Ōsaki・Rinkai・Sōtetsu de l’autre), Shōnan-Shinjuku, Narita Express.

**Correspondances et leur direction**

- **Keiō Inokashira** — fléché depuis le 1F, au nord-ouest, près du Hachikō Gate.
- **Tokyo Metro Ginza · Hanzōmon · Fukutoshin** et **Tōkyū Tōyoko · Den-en-Toshi** — fléchés depuis les deux blocs du 1F, South comme Hachikō. Le plan donne la **direction**, jamais le cheminement : ces lignes ne sont pas JR et s’arrêtent au bord de la feuille.
- Le Ginza est cité dans la liste des correspondances mais **son quai n’est pas dessiné** : il est au 3F, hors emprise du document.

**Commerces structurants**

- **KIOSK** sur les quais, **NewDays** dans la légende — le plan ne place nommément aucune galerie.
- Ni Hikarie, ni Scramble Square, ni Stream, ni Sakura Stage n’apparaissent : ce sont des bâtiments voisins, pas des commerces de gare JR. Les représenter relèvera de la perspective extérieure, pas du relevé.

**Travaux (août 2026)**

**La gare est un chantier, et le plan le dit partout.** Des zones « Under Construction » couvrent les deux quais (au moins quatre emprises distinctes) et trois blocs du 1F, dont l’essentiel du côté Hachikō. Mention finale : « *There may be some changes due to construction work. As of June, 2026* ». C’est plus de chantier que de gare finie, et c’est l’état à représenter.

**Incertain**

- **La date.** Le plan est de **juin 2026**, la référence du chantier est août 2026. Sur une gare qui bouge tous les trimestres, deux mois peuvent déplacer une palissade ou rouvrir un passage. Aucun fait ci-dessus ne doit être présenté comme « l’état d’août ».
- Les **noms japonais** des groupes ne sont pas sur cette édition anglaise : ハチ公改札 / 中央改札 / 南改札 / 新南改札 restent à confirmer.
- Les sorties nommées relevées sont **East Exit**, **West Exit**, **Hachikō Exit** et **Miyamasuzaka Exit** ; le plan n’en donne pas la liste exhaustive et ne porte aucun numéro de sortie Metro.
- Les niveaux Ginza (au-dessus) et Tōkyū / Metro (en dessous) sont **absents du document** : leur position relative reste à établir ailleurs.

**Compromis de jeu**

Tranche jouable autour du **Hachikō Gate**, conformément au cahier des charges : c’est le groupe le plus reconnaissable et celui qui porte les sorties Hachikō et Miyamasuzaka. Représentés sans être visitables : le South Gate et son East Exit (branche sud, au même niveau), le Central Gate (perspective le long du quai), le New South Gate (très loin au sud — un panneau et une direction, rien de plus), le Keiō Inokashira et les lignes Metro / Tōkyū (portails de correspondance fléchés), le Ginza en hauteur (percée verticale). **Les palissades de chantier sont un élément de décor de premier plan, pas un détail** : elles ferment naturellement le périmètre là où le plan lui-même s’arrête.

---

## JY21 Ebisu — 恵比寿

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（恵比寿駅） | [ja](https://www.jreast.co.jp/estation/stations/290.html) · [en](https://www.jreast.co.jp/en/estation/stations/290.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Hibiya ;
- affluence relative : 1.2 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY22 Meguro — 目黒

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（目黒駅） | [ja](https://www.jreast.co.jp/estation/stations/1552.html) · [en](https://www.jreast.co.jp/en/estation/stations/1552.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Namboku · Mita · Tōkyū Meguro ;
- affluence relative : 1 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY23 Gotanda — 五反田

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（五反田駅） | [ja](https://www.jreast.co.jp/estation/stations/695.html) · [en](https://www.jreast.co.jp/en/estation/stations/695.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Tōkyū Ikegami · Asakusa ;
- affluence relative : 1 ;
- niveaux publiés : `1F-4F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY24 Ōsaki — 大崎

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（大崎駅） | [ja](https://www.jreast.co.jp/estation/stations/319.html) · [en](https://www.jreast.co.jp/en/estation/stations/319.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, deux îlots Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Rinkai ;
- affluence relative : 1.3 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY25 Shinagawa — 品川

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（品川駅） | [ja](https://www.jreast.co.jp/estation/stations/788.html) · [en](https://www.jreast.co.jp/en/estation/stations/788.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Yokosuka · Tōkaidō Shinkansen · Keikyū ;
- affluence relative : 1.7 ; **gare en travaux** ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY26 Takanawa Gateway — 高輪ゲートウェイ

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（高輪ゲートウェイ駅） | [ja](https://www.jreast.co.jp/estation/stations/1750.html) · [en](https://www.jreast.co.jp/en/estation/stations/1750.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot Yamanote ;
- lignes visibles ou en correspondance : Keihin-Tōhoku ;
- affluence relative : 0.7 ;
- niveaux publiés : `1F-3F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY27 Tamachi — 田町

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（田町駅） | [ja](https://www.jreast.co.jp/estation/stations/976.html) · [en](https://www.jreast.co.jp/en/estation/stations/976.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō ;
- affluence relative : 1 ; **gare en travaux** ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY28 Hamamatsuchō — 浜松町

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（浜松町駅） | [ja](https://www.jreast.co.jp/estation/stations/1248.html) · [en](https://www.jreast.co.jp/en/estation/stations/1248.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tokyo Monorail · Asakusa · Ōedo ;
- affluence relative : 1.1 ; **gare en travaux** ;
- niveaux publiés : `1F-3F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY29 Shimbashi — 新橋

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（新橋駅） | [ja](https://www.jreast.co.jp/estation/stations/877.html) · [en](https://www.jreast.co.jp/en/estation/stations/877.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Yokosuka · Ginza · Asakusa · Yurikamome ;
- affluence relative : 1.5 ;
- niveaux publiés : `B1-1F, B5-B4` *(annoncé par l'index, plan non lu)*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---

## JY30 Yūrakuchō — 有楽町

*Date de référence : 2026-08. Confiance du relevé : **à établir**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（有楽町駅） | [ja](https://www.jreast.co.jp/estation/stations/1617.html) · [en](https://www.jreast.co.jp/en/estation/stations/1617.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Yūrakuchō ;
- affluence relative : 1.1 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Groupes de portillons**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Correspondances et leur direction**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Commerces structurants**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Travaux (août 2026)**

*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*

**Incertain**

- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.

**Compromis de jeu**

*décidé en phase 5*

---
