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

**Plans officiels ouverts et lus : 30 / 30.**

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

### Comment se lit un plan JR East — le code couleur

Il est le même sur les trente gares, et il **se lit dans la légende**, pas dans
l'intuition. Il est transcrit ici une fois pour que les fiches ci-dessous soient
vérifiables sans le document :

| Aplat | Ce que c'est |
|---|---|
| rose clair | **Concourse Area (Local line)** — zone **payante** des lignes classiques |
| crème | **Concourse Area (outside the ticket gates)** — zone **libre** |
| beige / tan | **Large store (inside the ticket gates)** — grand commerce **derrière** les portillons |
| rose soutenu | Concourse Area (Shinkansen) |
| bleu clair | Local line Track — le quai lui-même |
| bleu vif | Shinkansen Track |
| hachures magenta | **Gate** — la ligne de portillons elle-même |
| gris | emprise bâtie hors concourse : ni zone payante, ni zone libre, ni commerce cartographié |

Deux conséquences directes pour le chantier :

1. **le beige distingue un commerce EN ZONE PAYANTE** d'un commerce en zone
   libre. C'est un fait de plan, pas une interprétation — et c'est ce qui fait
   qu'EATo LUMINE compte comme galerie derrière les portillons à Shinjuku ;
2. **Kiosk, Shop et Newdays sont trois entrées distinctes de la légende.** Un
   « KIOSK » sur le plan est un kiosque nommé, un « SHOP » est un commerce dont
   la catégorie seule est établie. La distinction alimente directement
   `CommerceStatus` (`namedVerified` / `categoryVerified`) au lieu d'être
   devinée.

> **Piège d'outillage.** Ces plans sont des impressions PDF du visualiseur JR
> East : les libellés de la carte sont dans une image, mais la légende, les
> onglets de niveau et les en-têtes sont du **texte vectoriel japonais**. Sans
> `poppler-data` (tables CID Adobe-Japan1), poppler les rend **silencieusement
> blancs** — la page s'affiche, il manque seulement ce qui l'explique. Installer
> `poppler-utils` **et** `poppler-data` avant de lire un plan.

### Date de chaque plan lu

Un plan de juin et un plan d'août ne décrivent pas la même gare quand la gare
est un chantier. Les dates sont donc affichées avant les fiches, et jamais
fondues dans le texte.

| Gare | Date du plan | Écart |
|---|---|---|
| JY01 Tokyo | 2026-05 | ⚠️ **décalé** par rapport à la référence |
| JY02 Kanda | 2025-07 | ⚠️ **décalé** par rapport à la référence |
| JY03 Akihabara | 2026-01 | ⚠️ **décalé** par rapport à la référence |
| JY04 Okachimachi | 2024-01 | ⚠️ **décalé** par rapport à la référence |
| JY05 Ueno | 2026-06 | ⚠️ **décalé** par rapport à la référence |
| JY06 Uguisudani | 2022-06 | ⚠️ **décalé** par rapport à la référence |
| JY07 Nippori | 2025-04 | ⚠️ **décalé** par rapport à la référence |
| JY08 Nishi-Nippori | 2024-02 | ⚠️ **décalé** par rapport à la référence |
| JY09 Tabata | 2024-02 | ⚠️ **décalé** par rapport à la référence |
| JY10 Komagome | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY11 Sugamo | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY12 Ōtsuka | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY13 Ikebukuro | 2026-02 | ⚠️ **décalé** par rapport à la référence |
| JY14 Mejiro | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY15 Takadanobaba | 2026-06 | ⚠️ **décalé** par rapport à la référence |
| JY16 Shin-Ōkubo | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY17 Shinjuku | 2026-08 | ✅ la date de référence |
| JY18 Yoyogi | 2026-01 | ⚠️ **décalé** par rapport à la référence |
| JY19 Harajuku | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY20 Shibuya | 2026-06 | ⚠️ **décalé** par rapport à la référence |
| JY21 Ebisu | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY22 Meguro | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY23 Gotanda | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY24 Ōsaki | 2026-04 | ⚠️ **décalé** par rapport à la référence |
| JY25 Shinagawa | 2026-07 | ⚠️ **décalé** par rapport à la référence |
| JY26 Takanawa Gateway | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY27 Tamachi | 2026-04 | ⚠️ **décalé** par rapport à la référence |
| JY28 Hamamatsuchō | 2026-06 | ⚠️ **décalé** par rapport à la référence |
| JY29 Shimbashi | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY30 Yūrakuchō | 2025-09 | ⚠️ **décalé** par rapport à la référence |

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

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **mai** 2026, les deux côtés lus.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Tokyo Station (1F, M2F, 2F, B1F, Keiyō) | [lien](https://www.jreast.co.jp/fr/e/stations/e1039.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（東京駅） | [ja](https://www.jreast.co.jp/estation/stations/1039.html) · [en](https://www.jreast.co.jp/en/estation/stations/1039.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Chūō · Tōkaidō Shinkansen ;
- affluence relative : 2 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- Six onglets : **1F · M2F · 2F · B1F · Keiyō Line · Sobu Line**. Aucune autre gare de la boucle n’en a autant, et deux d’entre eux sont des LIGNES et non des étages — c’est ce qui dit le mieux ce qu’est Tokyo.
- **2F — les quais des lignes classiques et du Shinkansen**, tous ensemble : voies 1 à 10 puis 14 à 23.
- **1F — le niveau des contrôles et des passages**, celui qu’on parcourt.
- **B1F — Gransta**, et une seconde nappe de circulation : plusieurs volées de quai sont fléchées « for Tracks No.X (2F) **& Concourse Area (B1F)** », donc desservent les deux niveaux à la fois.
- **Keiyō Line** — feuille propre, et elle est éloquente : la ligne est au **B3F** (zone payante) et au **B4F** (quais), atteinte par un **couloir en L de plusieurs centaines de mètres** qui part du sud de la gare. Le « long accès Keiyō » du cahier des charges n’est pas une impression : c’est la forme même du plan.
- **Sobu Line** — feuille propre également : zone payante au **B4F**, quais au **B5F**, deux îlots, avec « for Narita Airport Terminal » à un bout et « for Yokohama, Ōfuna, Kamakura, Zushi, Yokosuka & Kurihama » à l’autre. Aussi profonde que la Keiyō, et aussi lointaine.

**Groupes de portillons**

- **Côté Marunouchi** : *Marunouchi North Exit*, **_Marunouchi Central Exit_ — « IC card only »**, et *Marunouchi South Exit*. Le contrôle central de la halle de brique **n’accepte que la carte sans contact** : c’est écrit sur le plan, et c’est le genre de fait qu’aucune génération ne produit. Le jeu tient déjà une carte (`store.pocket`) — la règle est donc directement jouable.
- **Côté Yaesu** : *Yaesu North Exit*, *Yaesu Central Exit*, *Yaesu South Exit*.
- **Côté Nihonbashi** : trois *Nihonbashi Exit* — un ordinaire, un vers le Tōhoku・Yamagata・Akita・Hokkaidō・Jōetsu・Hokuriku Shinkansen, un vers le Tōkaidō・Sanyō.
- **Contrôles de Shinkansen, qui sont des lignes à part entière** : *Tōkaidō and Sanyō Shinkansen (Yaesu Central North Exit)*, *(Yaesu Central South Exit)*, *(Yaesu North Exit)*. À Tokyo, on ne « passe pas au Shinkansen » : on franchit un second 改札.
- **Transferts internes nommés** : *Tōhoku…Shinkansen North / Central / South Transfer*, *Tōkaidō・Sanyō Shinkansen Central / South Transfer*. Ce sont des lignes de contrôle **entre deux zones payantes**.
- **Main Entrance** — l’entrée centrale de la halle de brique, nommée sur le plan, dans l’axe du Marunouchi Central Exit.
- Ascenseurs **A à P** sur la seule feuille 1F ; deux *Wheelchair Passenger Lounge*, un *Prayer Room*, un *Police Box*.

**Ordre le long du quai** — Trois passages transversaux nommés relient Marunouchi à Yaesu : **Northern Passage**, **Central Passage**, **Southern Passage**, plus un **Northern Free Passage** hors contrôle et un **Central Passage Stairway**. C’est l’ossature de Tokyo : la gare se traverse d’ouest en est par trois couloirs **en zone payante**, et les volées de quai y tombent perpendiculairement — chacune desservie **des deux côtés**, Marunouchi et Yaesu, par deux escaliers distincts.

**Voies Yamanote** — Voie **4** = Yamanote *for Ueno & Ikebukuro* (内回り) ; voie **5** = Yamanote *for Shinagawa & Shibuya* (外回り). Voie **3** = Keihin-Tōhoku vers Ueno, voie **6** = Keihin-Tōhoku vers Kamata. Chaque voie Yamanote partage donc son îlot avec une voie Keihin-Tōhoku — îlot (3,4) et îlot (5,6) — ce qui **confirme** au mot près le relevé du dépôt : `sharedIsland`, `sharedWith: Keihin-Tōhoku`, « voies 4 et 5 sur deux quais partagés ». Au-delà : Chūō (1,2), Jōban・Utsunomiya・Takasaki・Ueno-Tōkyō (7,8), Tōkaidō (9,10), Tōkaidō Shinkansen (14-19), Tōhoku・Yamagata・Akita・Hokkaidō・Jōetsu・Hokuriku Shinkansen (20-23).

**Correspondances et leur direction**

- **Shinkansen** — par contrôle dédié, côté Yaesu comme côté Nihonbashi. Six lignes de contrôle en tout entre classique et Shinkansen.
- **Keiyō Line** et **Sōbu Line** — chacune son onglet, donc sa propre gare souterraine. Le long cheminement vers la Keiyō, que le cahier des charges cite, est ainsi confirmé par la structure même du document.
- Le plan est **JR seul** : le Marunouchi de Tokyo Metro n’y figure pas.

**Commerces structurants**

- **GRANSTA TOKYO** et **GRANSTA YAESU** — les deux galeries, nommément. La première apparaît **des deux côtés** du Central Passage.
- **THE TOKYO STATION HOTEL (1F)** et son *Tōkyō Station Hotel B1F Entrance*, côté Marunouchi — l’hôtel est dans la gare.
- **TOKYO GIFT PALETTE**, **First Avenue Tōkyō Station**, **KITAMACHI SAKABA** (trois blocs) et **八重北食堂** côté Yaesu nord.
- **Gran Tōkyō North Tower (1F) DAIMARU**, **Sapia Tower (1F)**, **Marunouchi central Building** — emprises bâties qui bordent la gare.
- **JAPAN RAIL CAFE**, **VIEW GOLD LOUNGE**, **JR-East Lost & Found**, **Baggage Storage**, **Wheelchair Passenger Lounge**, deux **Waiting Room**, un **Police Box**, **JR Highway Bus**, **JR TOKAI TOURS Tōkyō Branch** et des **JR-Central Tickets** distincts des guichets JR East.
- **Aji no Sanpomichi** (味の散歩道), au nord-est.

**Travaux (août 2026)**

Le plan porte « *There may be some changes due to construction work. As of May, 2026* », sans délimiter de zone. Tokyo est donc déclarée mouvante sans que le document dise où.

**Incertain**

- Le **niveau des Marunouchi Exits** n’est pas explicité : ils sont sur la feuille 1F, mais le plan porte aussi « for Marunouchi (Underground) » — il existe donc un débouché souterrain distinct, non cartographié ici.
- Le plan date de **mai 2026**, trois mois avant la référence, et se déclare lui-même sujet à changement sans localiser le chantier.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 丸の内中央口, 八重洲中央口, 日本橋口 restent à confirmer.
- Ni Tokyo Metro Marunouchi, ni les correspondances hors JR ne sont cartographiés.

**Compromis de jeu**

Tranche jouable autour du **Marunouchi Central Exit**, comme le cahier des charges le demande : c’est le contrôle de la halle de brique, dans l’axe de la **Main Entrance**, et sa règle **« IC card only »** est un fait de jeu autant que de plan. Le **Central Passage** est l’épine — on le suit d’ouest en est, et chaque volée de quai y tombe des deux côtés. Représentés sans être visitables : les **Marunouchi North et South** aux deux bouts, le **Yaesu Central** au bout du passage (perspective très longue), **GRANSTA** en contrebas, les **six lignes de contrôle Shinkansen** — la vraie singularité de Tokyo, où l’on franchit un 改札 pour passer d’un train à un autre —, les trois **Nihonbashi Exit** au nord, et les directions **Keiyō** et **Sōbu** : deux couloirs qui s’enfoncent et se perdent, l’un en L sur des centaines de mètres.

---

## JY02 Kanda — 神田

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **juillet 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Kanda Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e538.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（神田駅） | [ja](https://www.jreast.co.jp/estation/stations/538.html) · [en](https://www.jreast.co.jp/en/estation/stations/538.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chūō · Ginza ;
- affluence relative : 1 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — les contrôles, **sous le viaduc**, en **deux blocs sans lien entre eux** : un à l’ouest, un à l’est.
- **2F** — les quais : trois îlots, six voies.

**Groupes de portillons**

- **Deux groupes, et le plan ne leur donne aucun nom** : il les étiquette simplement « **Gate** ». Ce sont les SORTIES qui portent les noms — *West Exit*, *South Exit* d’un côté, *North Exit*, *East Exit* de l’autre.
- Chaque bloc a ses propres *Tickets* et *Fare Adjustment*.

**Ordre le long du quai** — Deux brackets sur les quais : **West Exit & South Exit** d’un côté, **East Exit & North Exit** de l’autre. Les deux blocs du 1F desservent donc chacun deux sorties, et il n’existe **aucun passage entre eux** au niveau du sol : pour aller de l’ouest à l’est, il faut reprendre le quai.

**Voies Yamanote** — Voie **3** = Yamanote *for Ueno, Tabata & Ikebukuro* ; voie **2** = Yamanote *for Tōkyō, Shinagawa & Shibuya*. Voies **4** et **1** = Keihin-Tōhoku, voies **5** et **6** = Chūō. Les deux voies Yamanote sont donc la **paire centrale**, chacune adossée à une Keihin-Tōhoku sur son îlot — ce qui **confirme mot pour mot** le commentaire du dépôt.

**Correspondances et leur direction**

- **Tokyo Metro Ginza** — fléché depuis le bloc **est** du 1F, et de là seulement.
- **Chūō** — voies 5 et 6, correspondance interne JR.

**Commerces structurants**

- Quelques **SHOP** génériques dans les deux blocs. Le plan ne nomme aucune enseigne : le commerce de Kanda est **sous les arches, hors emprise JR**, et n’a donc pas à figurer.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **juillet 2025**.
- ⚠️ **Le dépôt nomme le contrôle de Kanda 西口改札 / « West ».** Le plan officiel n’attribue **aucun nom** aux deux groupes — juste « Gate » — et réserve *West* à une SORTIE. C’est le troisième cas du même piège, après Harajuku et Shimbashi : un nom de sortie pris pour un nom de portillon. À corriger en phase 3.
- Les **noms japonais** ne sont pas sur cette édition anglaise.

**Compromis de jeu**

Tranche jouable dans le **bloc ouest**, sous le viaduc, avec ses sorties *West* et *South* — plafond bas, poutres, la rue à toucher. Représenté sans être visitable : le **bloc est** et ses sorties *North* et *East*, **atteint uniquement par le quai** — c’est une branche courte et fermée, pas un prolongement —, et le renvoi **Ginza** qui n’existe que de ce côté-là. Les restaurants sous les arches restent hors emprise, en façades.

---

## JY03 Akihabara — 秋葉原

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **janvier** 2026.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Akihabara Station (1F, 2F-M3, 3F) | [lien](https://www.jreast.co.jp/fr/e/stations/e41.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（秋葉原駅） | [ja](https://www.jreast.co.jp/estation/stations/41.html) · [en](https://www.jreast.co.jp/en/estation/stations/41.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chūō–Sōbu · Hibiya · Tsukuba Express ;
- affluence relative : 1.4 ;
- niveaux publiés : `1F / 2F-M3 / 3F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — les trois groupes de portillons, alignés du nord au sud le long d’une bande étroite. C’est le niveau de la rue, sous le viaduc.
- **2F-M3** — les quais Yamanote et Keihin-Tōhoku, plus une mezzanine.
- **3F** — les quais de la **Chūō-Sōbu**, perpendiculaires.
- **La superposition est le sujet**, et le découpage même du document la donne : trois niveaux, trois orientations — la rue, le viaduc JR, et la Chūō-Sōbu en travers au-dessus.

**Groupes de portillons**

- **Electric Town Gate** (電気街口) — au nord, avec *Tickets*, *Fare Adjustment*, un SHOP et un comptoir de service.
- **Central Gate** (中央改札) — au milieu, avec ses *Tickets*, son *Fare Adjustment*, un **Event Space** attenant, et le renvoi « for Tsukuba Express ».
- **Shōwa-dōri Gate** (昭和通り改札) — au sud, dans un **bloc entièrement séparé** : sa propre zone payante, ses propres guichets, trois SHOP, et le renvoi « for Hibiya Line ».
- Ascenseurs **A à F** : A et B pour les quais JR, C à F pour la Chūō-Sōbu.

**Ordre le long du quai** — Les trois groupes se suivent du **nord au sud** sur une bande très étroite : Electric Town → Central → Shōwa-dōri. Le troisième est détaché des deux autres. Ce n’est pas un hall unique à trois portes : c’est une enfilade, et le Shōwa-dōri en est presque une gare à part.

**Voies Yamanote** — Voie **2** = *Yamanote Line (**Inner Loop**) (for Ueno & Ikebukuro)* ; voie **3** = *Yamanote Line (**Outer Loop**) (for Tōkyō & Shinagawa)*. **C’est le seul plan du relevé à écrire « Inner Loop » et « Outer Loop » en toutes lettres** — la terminologie exacte que le jeu emploie pour 内回り / 外回り. Voies **1** et **4** = Keihin-Tōhoku : chaque voie Yamanote partage son îlot avec une Keihin-Tōhoku, ce qui **confirme** `sharedIsland` / `sharedWith: Keihin-Tōhoku`. Voies **5** et **6** = Chūō-Sōbu Local, au 3F, en travers.

**Correspondances et leur direction**

- **Tsukuba Express** — fléché depuis le *Central Gate*.
- **Tokyo Metro Hibiya** — fléché depuis le *Shōwa-dōri Gate*, à l’autre bout de la gare. Les deux correspondances sortent donc par des portillons **différents**, ce qui est exactement ce qui rend Akihabara illisible pour qui ne connaît pas.
- **Chūō-Sōbu** — correspondance interne JR, par les ascenseurs C à F et leurs volées, depuis les deux extrémités.

**Commerces structurants**

- **ecute Akihabara** — *dans la zone payante* du 1F, entre les volées vers les voies 1&2 et 3&4, en aplat « large store inside the ticket gates ».
- **atre Akihabara 1** au nord et **atre Akihabara 2** au sud, contre le Shōwa-dōri Gate — deux bâtiments distincts, en emprise bâtie.
- **Event Space** — un espace nommé contre le Central Gate.
- Le dépôt déclarait `atre` pour Akihabara : confirmé, et il y en a **deux**.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **janvier 2026**, sept mois avant la référence.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 電気街口, 中央改札, 昭和通り改札 restent à confirmer — ils sont toutefois déjà dans le dépôt pour le premier.
- Les feuilles **2F-M3** et **3F** n’ont pas été dépouillées en détail : le 1F suffit à établir la topologie des contrôles.

**Compromis de jeu**

Tranche jouable autour de l’**Electric Town Gate**, comme le cahier des charges le demande, avec **ecute Akihabara** derrière les portillons pour donner l’échelle. Représentés sans être visitables : le *Central Gate* et son Event Space en enfilade au sud, le *Shōwa-dōri Gate* plus loin encore (bloc séparé, panneau et perspective), les renvois **Tsukuba Express** et **Hibiya** par deux portillons différents, et surtout la **Chūō-Sōbu au 3F** — visible en levant les yeux, atteinte par des volées qui montent et se perdent. **La verticalité prime sur la surface** : c’est une gare qu’on lit en coupe.

---

## JY04 Okachimachi — 御徒町

*Date de référence : 2026-08. Confiance du relevé : `approximate` — plan de **janvier 2024**, le plus ancien du relevé.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Okachimachi Station (1F-2F, M2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e355.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（御徒町駅） | [ja](https://www.jreast.co.jp/estation/stations/355.html) · [en](https://www.jreast.co.jp/en/estation/stations/355.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Ginza · Hibiya · Ōedo ;
- affluence relative : 0.95 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — les contrôles, en **deux blocs séparés** : *South Exit* et *North Exit*, chacun avec ses guichets.
- **M2F** — une **mezzanine**, et c’est la trouvaille de cette gare : deux petits paliers intermédiaires, fléchés « for Tracks No.1 & 2 », « for Tracks No.3 & 4 » et « for 1F ». On ne descend pas du quai au hall d’un trait : on passe par un demi-niveau.
- **2F** — les quais : deux îlots.

**Groupes de portillons**

- **South Exit** et **North Exit** — les deux groupes du 1F, chacun avec ses *Tickets* et son *Fare Adjustment*.

**Ordre le long du quai** — Deux brackets, **South Exit** et **North Exit**, aux deux bouts des quais. Entre eux, la mezzanine M2F relaie — mais en **deux morceaux distincts**, un par groupe.

**Voies Yamanote** — Voie **3** = Yamanote *for Ueno, Tabata & Ikebukuro* ; voie **2** = Yamanote *for Akihabara, Tōkyō, Shinagawa & Meguro*. Voies **4** et **1** = Keihin-Tōhoku : `sharedIsland` / `sharedWith: Keihin-Tōhoku` **confirmé**.

**Correspondances et leur direction**

- Le plan ne fléche **aucune correspondance** : ni Ginza, ni Hibiya, ni Ōedo. Elles existent au voisinage (Ueno-hirokōji, Naka-okachimachi) mais ne sont pas des correspondances JR cartographiées.

**Commerces structurants**

- Le plan ne nomme aucune enseigne. **Ameyoko n’y figure pas** — c’est un marché de rue sous et le long du viaduc, hors emprise JR, et le cahier des charges avait raison de demander qu’on ne le mette pas dans le hall.

**Travaux (août 2026)**

Aucune zone de chantier signalée — mais le plan a **deux ans et demi**.

**Incertain**

- ⚠️ **Le plan date de janvier 2024**, plus de deux ans avant la date de référence. C’est le plus grand écart de tout le relevé, et il justifie à lui seul la confiance `approximate`.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 北口, 南口 restent à confirmer.
- Le nombre de baies par groupe n’est pas lisible.

**Compromis de jeu**

Tranche jouable au **North Exit**, comme le cahier des charges le demande. **La mezzanine M2F est le sujet** : elle donne à cette petite gare une coupe à trois niveaux qu’aucun hall générique ne produirait, et elle se traverse en descendant. Représenté sans être visitable : le **South Exit** et sa propre moitié de mezzanine, atteints par le quai — branche courte et indépendante. **Ameyoko reste dehors**, en fond de perspective sous le viaduc.

---

## JY05 Ueno — 上野

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **juin** 2026, pas d’août.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Ueno Station (1F-M2, 2F, 3F, B4-B1) | [lien](https://www.jreast.co.jp/fr/e/stations/e204.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（上野駅） | [ja](https://www.jreast.co.jp/estation/stations/204.html) · [en](https://www.jreast.co.jp/en/estation/stations/204.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Utsunomiya · Takasaki · Jōban · Tōhoku Shinkansen ;
- affluence relative : 1.6 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **2F — les quais traversants.** Les douze voies 1 à 12 y sont, toutes. Six îlots, un ascenseur par îlot (**A à F**).
- **3F — la grande zone payante.** Un vaste plateau d’où l’on redescend vers chaque quai : voies 1&2, 3&4, 5&6, 7&8, 9&10, puis 11&12 *(2F)* et 13-17 *(1F)*. Il porte **Park Gate** et **Iriya Gate**, et **ecute Ueno** derrière les portillons. Une mezzanine **M3F** s’y intercale.
- **1F-M2 — la rue et les voies en cul-de-sac.** Voies terminales 13, 14&15, 16&17, la salle d’attente, et les débouchés : **Main Exit**, **Asakusa Exit**, **Iriya Exit**, **Higashi-Ueno Exit**, **Panda Bridge Exit (3F)**.
- **B4-B1 — Shinkansen et Tokyo Metro.** Feuille non dépouillée : hors périmètre Yamanote. Le 1F la fléche par « for Shinkansen Concourse Area (B3F) » et « for Concourse Area (B1F) ».
- **Quatre zones de concourse coexistent** — B1F, 2F, 3F et B3F (Shinkansen) — et le plan les nomme comme des destinations, pas comme des étages. C’est ce qui fait Ueno : on n’y va pas « en bas », on va « à la concourse 3F ».

**Groupes de portillons**

- **Park Gate** (公園口) et **Iriya Gate** (入谷口) — tous deux au **3F**, sur le grand plateau payant, avec Fare Adjustment et Tickets accolés.
- **Transfer to Shinkansen** — une ligne de contrôle interne au 1F, entre la zone payante des lignes classiques et celle du Shinkansen.
- Les captures fournies **ne montrent pas** le Central Gate ni le Shinobazu Gate : le cadrage s’arrête avant. Voir « Incertain ».

**Ordre le long du quai** — Sur le plan de quais du 2F, un seul bracket couvre le nord de toutes les voies 1 à 12 : **Iriya Gate & Park Gate (3F)**. Autrement dit, depuis le quai Yamanote, l’accès documenté monte au 3F — la gare se quitte **par le haut**, ce qui est l’inverse de la plupart des gares de la boucle.

**Voies Yamanote** — Voie **2** = Yamanote *for Tabata, Ikebukuro & Shinjuku* (内回り) ; voie **3** = Yamanote *for Akihabara, Tōkyō, Hamamatsuchō & Shinagawa* (外回り). Les voies **1** et **4** sont la Keihin-Tōhoku : le Yamanote partage donc chacun de ses deux îlots avec elle, ce qui **confirme** le relevé du dépôt (`config: sharedIsland`, `sharedWith: Keihin-Tōhoku`). Au-delà, voies 5 à 12 : Utsunomiya, Takasaki, Jōban, Ueno-Tōkyō.

**Correspondances et leur direction**

- **Tokyo Metro Ginza & Hibiya** — fléché deux fois depuis le 1F, côté ouest, près de l’atre et du Main Exit, et depuis le Higashi-Ueno Exit.
- **Shinkansen** — par une ligne de contrôle propre au 1F, puis descente vers la concourse B3F.
- **Ueno-Tōkyō Line, Jōban, Utsunomiya, Takasaki, Narita** — voies 5 à 17, donc correspondances internes JR, en zone payante.

**Commerces structurants**

- **ecute Ueno** — au **3F**, dans l’aplat « Large store (inside the ticket gates) ». Comme EATo LUMINE à Shinjuku, c’est une galerie **derrière** les portillons, et c’est elle qui donne son échelle au plateau.
- **atre Ueno** — au **1F**, côté **libre**, en deux blocs de part et d’autre du Main Exit, avec un renvoi « for atre (2F) ». La gare a donc les deux enseignes du groupe JR East, à deux niveaux et de deux côtés des portillons — ce que le dépôt pressentait en déclarant `ecute` sans pouvoir le situer.
- **NewDays** (au moins quatre), **KIOSK**, et six **SHOP** génériques répartis entre le 1F et le 3F.
- **Statue of Sanso** *(orthographe du plan)* — le repère du hall 1F. Il s’agit de la statue de Saigō Takamori ; le plan l’écrit ainsi et c’est ce qui est relevé.

**Travaux (août 2026)**

Une zone **« Under Construction »** au sud du plateau 3F, près des descentes vers le Shinkansen et les voies 13-17. Mention finale : « *As of June, 2026* ». Beaucoup moins de chantier qu’à Shibuya.

**Incertain**

- **Le Central Gate et le Shinobazu Gate ne sont pas dans le cadrage.** Le dépôt les déclare déjà (中央改札 / 不忍口, `data/lines`) et ces plans ne les contredisent pas — ils ne les montrent simplement pas. Leur niveau et leur position restent à établir.
- ⚠️ **Un désaccord possible avec le dépôt.** `data/stationLayouts` donne Ueno en `elevation: ground`. Or le plan place les voies 1 à 12 au **2F**, soit un niveau au-dessus de la rue — les quais traversants d’Ueno sont sur ouvrage, et ce sont les voies terminales 13-17 qui sont au sol. **Rien n’a été modifié** : `elevation` commande le rendu du quai, l’auvent et la profondeur, et cela déborde de ce chantier. À trancher séparément.
- Les **noms japonais** des portillons ne sont pas sur cette édition anglaise : 公園口 / 入谷口 restent à confirmer.
- La feuille **B4-B1** n’a pas été dépouillée (Shinkansen et Tokyo Metro, hors périmètre Yamanote).
- Aucun numéro de sortie Metro sur le document.

**Compromis de jeu**

Tranche jouable **verticale**, et c’est le contraire de Shinjuku : depuis le quai Yamanote (2F), on **monte** au grand plateau payant du 3F, où se tiennent ecute Ueno et les deux groupes de portillons documentés. Représentés sans être visitables : le Park Gate et l’Iriya Gate en perspective de part et d’autre du plateau (un seul est franchissable), les descentes vers les voies 5 à 12 puis 13-17 (volées qui plongent, linteaux qui coupent la vue), la trémie Shinkansen vers le B3F, et le 1F avec son atre et ses sorties — vu **par en dessous**, depuis les ouvertures du plateau. La grande hauteur et les quatre niveaux simultanément lisibles sont le sujet ; la surface au sol ne l’est pas.

---

## JY06 Uguisudani — 鶯谷

*Date de référence : 2026-08. Confiance du relevé : `approximate` — plan de **juin 2022**, quatre ans avant la référence.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | 駅構内図・バリアフリー情報（鶯谷駅） | [ja](https://www.jreast.co.jp/estation/stations/209.html) · [en](https://www.jreast.co.jp/en/estation/stations/209.html) | **`read`** — ouvert et lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōhoku Shinkansen ;
- affluence relative : 0.55 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — tout tient sur une feuille : les quais et les deux petits halls.

**Groupes de portillons**

- **Deux groupes, tous deux nommés simplement 改札口** — « ticket gate », sans qualificatif. Chacun avec sa **きっぷうりば** (billetterie).
- Celui du **南口** (South Exit), à l’ouest, a en plus un **ATM** et un **精算機**.
- Celui du **北口** (North Exit) a son **精算所**, et il est atteint depuis le quai par un **地下通路** — un passage souterrain, dessiné en rose sur le plan.

**Ordre le long du quai** — **Les deux halls sont à des bouts opposés ET de part et d’autre des voies** : le 南口 à l’ouest, de plain-pied ; le 北口 au sud-est, sous les voies. Rien ne les relie hors quai. Le cahier des charges annonçait « deux petits halls réellement séparés » : c’est exact, et la séparation est verticale autant qu’horizontale.

**Voies Yamanote** — Voie **2** = 山手線 *池袋・新宿・渋谷方面* (内回り) ; voie **3** = 山手線 *東京・品川・目黒方面* (外回り). Voies **1** et **4** = 京浜東北線 : `sharedIsland` / `sharedWith: Keihin-Tōhoku` **confirmé**.

**Correspondances et leur direction**

- **Aucune.** Le plan n’en fléche pas une seule.

**Commerces structurants**

- Aucune enseigne, aucune galerie, pas même un KIOSK cartographié. Le cahier des charges annonçait « très peu de commerces » : le plan dit **aucun**.

**Travaux (août 2026)**

Aucune zone de chantier signalée — mais le plan a **quatre ans**.

**Incertain**

- ⚠️ **Le plan date de juin 2022**, quatre ans avant la date de référence. C’est de très loin le plus ancien du relevé, et il justifie seul la confiance `approximate`.
- C’est aussi la **seule gare** que la série « Guide Maps for Major Stations » ne couvre pas — signe, en soi, de son rang.
- Le dépôt tient 南口改札 pour le nom du contrôle. Le plan écrit **改札口** tout court, et réserve **南口** à la sortie. Quatrième occurrence du même piège, après Harajuku, Shimbashi et Kanda.

**Compromis de jeu**

Tranche jouable au **南口**, le hall ouest, de plain-pied — c’est la zone principale. Représenté sans être visitable : le **北口**, atteint par un **地下通路** qui plonge sous les voies et ressort de l’autre côté — une volée descendante, un couloir qui tourne, et rien au bout qu’on puisse voir. **Aucun commerce** : c’est la gare la plus nue de la boucle, et il faut que cela se sente.

---

## JY07 Nippori — 日暮里

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan d’**avril 2025**, le plus ancien du relevé.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Nippori Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e1184.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（日暮里駅） | [ja](https://www.jreast.co.jp/estation/stations/1184.html) · [en](https://www.jreast.co.jp/en/estation/stations/1184.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Jōban · Keisei · Nippori–Toneri Liner ;
- affluence relative : 1.2 ;
- niveaux publiés : `1F-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — les quais, et la *East Exit Square*.
- **2F** — le niveau des contrôles : celui de JR **et** celui du Keisei, côte à côte, avec ecute Nippori entre les deux. C’est un pont au-dessus du faisceau.
- **3F** — le **Nippori-Toneri Liner**, fléché mais non cartographié.
- Un **Free Passage (Over Tracks)** relie les deux côtés hors contrôle.

**Groupes de portillons**

- **South Gate** et **North Gate** — les deux groupes JR.
- **Transfer to Keisei Line** — une ligne de contrôle *entre deux zones payantes*, avec son propre *Fare Adjustment (JR Line Transfer)* et ses *Tickets (Keisei Line Transfer)*. Ce n’est pas une sortie : c’est un passage d’un exploitant à l’autre.
- **Keisei Line North Gate** — le contrôle propre du Keisei, plus loin, avec ses *Tickets (Keisei Line)* et sa *Concourse Area (Keisei Line)*.
- Ascenseurs **A à F**.

**Ordre le long du quai** — Deux brackets le long des quais : **South Gate** au sud, **North Gate & Transfer to Keisei Line** au nord — le second couvrant à lui seul plus de la moitié de la longueur. La gare est donc franchement polarisée au nord, là où JR, Keisei et le Toneri Liner se superposent.

**Voies Yamanote** — Voie **10** = Yamanote *for Ueno, Tōkyō, Shinagawa & Meguro* (外回り) ; voie **11** = Yamanote *for Ikebukuro, Shinjuku & Shibuya* (内回り). Voie **9** = Keihin-Tōhoku vers Ueno, voie **12** = vers Tabata. Chaque voie Yamanote partage donc son îlot avec une Keihin-Tōhoku — îlots (9,10) et (11,12) — ce qui **confirme** `sharedIsland` / `sharedWith: Keihin-Tōhoku`. Plus au sud, un troisième îlot : voies **3** et **4**, Jōban Rapid, Narita et Ueno-Tōkyō.

**Correspondances et leur direction**

- **Keisei** — deux lignes de contrôle en enfilade (Transfer, puis Keisei North Gate) et une *Concourse Area (Keisei Line)* cartographiée en gris.
- **Nippori-Toneri Liner** — au **3F**, fléché depuis le 2F et depuis la *East Exit Square (1F)*. Trois niveaux d’exploitants empilés.

**Commerces structurants**

- **ecute Nippori** — au 2F, entre le contrôle JR et le passage vers le Keisei. Le dépôt déclarait `ecute` pour Nippori sans pouvoir le situer ; c’est fait.
- Le plan ne nomme aucun autre commerce.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- ⚠️ **Le plan date d’avril 2025**, seize mois avant la date de référence. C’est le plus grand écart de tout le relevé.
- Le **West Exit** que le cahier des charges attend n’apparaît pas sous ce nom ; le document nomme *East Exit*, *East Exit Square* et le *Free Passage*. À confirmer.
- Les **noms japonais** ne sont pas sur cette édition anglaise.
- Le niveau **3F** (Toneri Liner) est fléché mais pas cartographié.

**Compromis de jeu**

**Le dépôt avait raison de traiter Nippori à part** : ses ponts-concours SONT son niveau de correspondance, et le plan le confirme — le 2F porte à la fois le contrôle JR, le passage Keisei et ecute, au-dessus du faisceau. Tranche jouable autour du **North Gate**, qui est le groupe long et celui qui donne sur tout le reste. Représentés sans être visitables : le *Transfer to Keisei* puis le *Keisei North Gate* en enfilade (deux exploitants qui se suivent), le **Toneri Liner au 3F** (volée qui monte et se perd), le *Free Passage* hors contrôle, le *South Gate* en perspective, et la *East Exit Square* aperçue en contrebas. **Aucun second pont-concours générique** ne doit être ajouté : la charpente signature existante EST ce niveau.

---

## JY08 Nishi-Nippori — 西日暮里

*Date de référence : 2026-08. Confiance du relevé : `approximate` — plan de **février 2024**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Nishi-Nippori Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e1167.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（西日暮里駅） | [ja](https://www.jreast.co.jp/estation/stations/1167.html) · [en](https://www.jreast.co.jp/en/estation/stations/1167.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Chiyoda · Nippori–Toneri Liner ;
- affluence relative : 0.9 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — un **hall unique et compact**, sous le viaduc.
- **2F** — les quais : deux îlots.
- Le Chiyoda (sous) et le Nippori-Toneri Liner (au-dessus) ne sont **pas cartographiés** : l’onglet s’arrête à 1F-2F. Ils sont fléchés, pas dessinés.

**Groupes de portillons**

- **Un seul groupe, et le plan ne lui donne aucun nom** : « **Gate** », comme à Kanda. Avec ses *Tickets* et son *Fare Adjustment*.
- ⚠️ **Mais deux passages « for Tokyo Metro Chiyoda Line » partent de la ZONE PAYANTE**, en plus d’un troisième depuis la zone libre. Autrement dit, JR et le Chiyoda partagent ici une zone payante : on change de compagnie **sans franchir de contrôle**. C’est un fait de topologie majeur, et il est propre à cette gare dans tout le relevé.

**Ordre le long du quai** — Le plan ne porte pas de bracket : la gare est trop petite pour en avoir besoin. Un hall, un contrôle, et les volées vers les deux îlots.

**Voies Yamanote** — Voie **3** = Yamanote *for Ikebukuro, Shinjuku & Shibuya* ; voie **2** = Yamanote *for Ueno, Tōkyō & Shinagawa*. Voies **4** et **1** = Keihin-Tōhoku : `sharedIsland` / `sharedWith: Keihin-Tōhoku` **confirmé**.

**Correspondances et leur direction**

- **Tokyo Metro Chiyoda** — trois renvois, dont **deux depuis la zone payante**. La correspondance est directe.
- **Nippori-Toneri Liner** — un renvoi depuis la zone libre, vers le sud.

**Commerces structurants**

- **NewDays**, un **KIOSK** et trois **SHOP** génériques. Aucune enseigne nommée au-delà.

**Travaux (août 2026)**

Aucune zone de chantier signalée — mais le plan a plus de deux ans.

**Incertain**

- Le plan date de **février 2024**.
- Les niveaux **Chiyoda** et **Toneri Liner** ne sont pas cartographiés : leur position relative au JR reste à établir ailleurs.
- Les **noms japonais** ne sont pas sur cette édition anglaise ; le dépôt tient 南改札, que ce plan ne confirme pas.

**Compromis de jeu**

Tranche jouable : **le hall entier**, il est minuscule. Le sujet est la **superposition** que le cahier des charges demande — Chiyoda dessous, JR, Toneri Liner dessus — et la façon dont elle se lit depuis un hall d’une seule pièce : deux passages qui plongent **depuis la zone payante** vers le Chiyoda (portail vertical crédible, sans contrôle), un troisième depuis la zone libre, et une volée qui monte vers le Toneri Liner. Rien d’autre à construire.

---

## JY09 Tabata — 田端

*Date de référence : 2026-08. Confiance du relevé : `approximate` — plan de **février 2024**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Tabata Station (B1-1F) | [lien](https://www.jreast.co.jp/fr/e/stations/e972.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（田端駅） | [ja](https://www.jreast.co.jp/estation/stations/972.html) · [en](https://www.jreast.co.jp/en/estation/stations/972.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōhoku Shinkansen ;
- affluence relative : 0.8 ;
- niveaux publiés : `B1-1F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **B1** — les quais, **dans la tranchée** : deux îlots.
- **1F** — les contrôles, **au-dessus**, en **deux blocs séparés** de tailles inégales.

**Groupes de portillons**

- **North Exit** — le grand bloc, à l’est, avec *Fare Adjustment*, *Tickets* et **atre vie** attenant.
- **South Exit** — un petit bloc à l’ouest, avec ses seuls *Tickets* et *Fare Adjustment*.

**Ordre le long du quai** — Deux brackets, **South Exit** et **North Exit**, aux deux bouts des quais, et rien entre eux. Le rapport de taille est net sur le plan : le nord est la gare, le sud est un accès.

**Voies Yamanote** — Voie **2** = Yamanote *for Ikebukuro, Shinjuku & Shibuya* ; voie **3** = Yamanote *for Ueno, Tōkyō & Shinagawa*. Voies **1** et **4** = Keihin-Tōhoku : `sharedIsland` / `sharedWith: Keihin-Tōhoku` **confirmé**. Le quai est **en contrebas** du hall, ce qui **confirme** `elevation: trench` et `place: over`.

**Correspondances et leur direction**

- Le plan ne fléche **aucune correspondance** : Tabata n’en a pas.

**Commerces structurants**

- **atre vie** — accolé au North Exit. Le dépôt déclarait `atre` pour Tabata : confirmé, et c’est l’enseigne **atre vie**, pas atre.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **février 2024**.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 北口, 南口 restent à confirmer.
- Le plan ne montre pas de galerie commerciale au-delà d’**atre vie** — le cahier des charges avait raison de prévenir qu’il ne fallait pas en forcer une.

**Compromis de jeu**

Tranche jouable au **North Exit**, avec **atre vie** pour donner l’échelle, et la **montée depuis la tranchée** comme geste principal. Représenté sans être visitable : le **South Exit** à l’autre bout, petit et seul, atteint par le quai. Aucune galerie forcée : le plan n’en montre pas, on n’en met pas.

---

## JY10 Komagome — 駒込

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Komagome Station (B1-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e712.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（駒込駅） | [ja](https://www.jreast.co.jp/estation/stations/712.html) · [en](https://www.jreast.co.jp/en/estation/stations/712.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Namboku ;
- affluence relative : 0.8 ;
- niveaux publiés : `B1-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **2F** — le hall principal : un contrôle, les sorties *North* et *South*, le renvoi Namboku, et l’**Hotel Mets Komagome**.
- **1F** — le quai, un îlot unique.
- **B1** — un **second contrôle**, petit, avec la sortie *East*.
- ⚠️ **Les deux groupes sont de part et d’autre du quai, l’un au-dessus, l’autre en dessous.** Le cahier des charges prévenait qu’il ne fallait pas en faire « un seul corridor reliant artificiellement les deux extrémités » : la géométrie l’interdit d’elle-même.

**Groupes de portillons**

- Deux groupes, **aucun nommé** sur le plan : « Gate » au 2F et « Gate » au B1. Chacun a ses *Tickets* et son *Fare Adjustment*.

**Ordre le long du quai** — Deux brackets : **North Exit & South Exit** (le groupe du 2F) et **East Exit** (celui du B1), à des points différents du quai.

**Voies Yamanote** — Voie **1** = Yamanote *for Tabata, Ueno & Tōkyō* ; voie **2** = Yamanote *for Ikebukuro, Shinjuku & Shibuya*. Îlot unique : `config: island` **confirmé**.

**Correspondances et leur direction**

- **Tokyo Metro Namboku** — fléché depuis le **2F**, donc bien « près du groupe principal » comme annoncé.

**Commerces structurants**

- **Hotel Mets Komagome** au 2F. Un **KIOSK** au B1. Aucune galerie.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- Aucun des deux contrôles n’est nommé ; le dépôt tient 北口改札, non confirmé.
- Les **noms japonais** ne sont pas sur cette édition anglaise.

**Compromis de jeu**

Tranche jouable au **2F**, le groupe principal, avec le renvoi Namboku. Représenté sans être visitable : le **groupe du B1** et sa sortie *East* — **sous** le quai, donc atteint par une volée descendante depuis un autre point, jamais par le hall. C’est la gare qui interdit d’elle-même le corridor unique.

---

## JY11 Sugamo — 巣鴨

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Sugamo Station (B1-1F) | [lien](https://www.jreast.co.jp/fr/e/stations/e896.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（巣鴨駅） | [ja](https://www.jreast.co.jp/estation/stations/896.html) · [en](https://www.jreast.co.jp/en/estation/stations/896.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Mita ;
- affluence relative : 0.85 ;
- niveaux publiés : `B1-1F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — le hall, **au-dessus de la tranchée** : un contrôle unique et trois débouchés.
- **B1F** — le quai, un îlot unique, en tranchée.

**Groupes de portillons**

- Un seul groupe, **non nommé** sur le plan : « Gate », avec ses *Tickets* et son *Fare Adjustment*.

**Ordre le long du quai** — Pas de bracket : la gare est trop petite. Un hall, un contrôle, une descente.

**Voies Yamanote** — Voie **1** = Yamanote *for Tabata, Ueno & Tōkyō* ; voie **2** = Yamanote *for Ikebukuro, Shinjuku & Shibuya*. Îlot unique en tranchée : `config: island` et `place: over` **confirmés**.

**Correspondances et leur direction**

- **Toei Mita** — fléché depuis le 1F, côté ouest.

**Commerces structurants**

- **atre vie** — deux blocs encadrant la zone libre. **Le dépôt ne déclare PAS `atre` pour Sugamo** : c’est un manque à combler.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- ⚠️ Le cahier des charges parle des directions « **Front**, North et South ». Le plan nomme **Main Exit**, *North Exit* et *South Exit* : c’est « Main », pas « Front ».
- Le contrôle n’est pas nommé ; le dépôt tient 北口改札, non confirmé.

**Compromis de jeu**

Tranche jouable : **le hall entier du 1F**, il est petit. Le geste principal est la **descente dans la tranchée**. Représentés sans être visitables : les trois débouchés *Main*, *North* et *South*, le renvoi **Toei Mita**, et les deux blocs d’**atre vie** en façades.

---

## JY12 Ōtsuka — 大塚

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Ōtsuka Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e330.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（大塚駅） | [ja](https://www.jreast.co.jp/estation/stations/330.html) · [en](https://www.jreast.co.jp/en/estation/stations/330.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Toden Arakawa ;
- affluence relative : 0.9 ;
- niveaux publiés : `1F-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — le hall, **sous le viaduc** : un contrôle, deux débouchés.
- **2F** — le quai, un îlot unique.

**Groupes de portillons**

- Un seul groupe, **non nommé** : « Gate », avec *Tickets* et *Fare Adjustment*.

**Ordre le long du quai** — Pas de bracket. Un hall central sous le viaduc qui distribue les deux sorties — exactement ce que le cahier des charges annonçait.

**Voies Yamanote** — Voie **2** = Yamanote *for Tabata, Ueno & Tōkyō* ; voie **1** = Yamanote *for Ikebukuro, Shinjuku & Shibuya*. Îlot unique : `config: island` **confirmé**.

**Correspondances et leur direction**

- **Toden Arakawa** (tramway) — fléché depuis le **North Exit**. Le cahier des charges demandait que sa proximité soit lisible « depuis la sortie South ou la signalétique » : c’est en réalité **au nord**.

**Commerces structurants**

- Quelques **SHOP** génériques. Le plan ne nomme aucune enseigne — **pas d’atre vie cartographié ici**, contrairement à ce que le cahier des charges suggérait d’intégrer « avec modération ».

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- Le contrôle n’est pas nommé ; le dépôt tient 北口改札, non confirmé.
- L’absence d’atre vie sur le plan n’est pas une preuve d’absence : la galerie peut être hors emprise cartographiée.

**Compromis de jeu**

Tranche jouable : **le hall entier**, sous viaduc, plafond bas. Représentés sans être visitables : les sorties *North* et *South*, et le renvoi **Toden Arakawa** au nord — un tramway qu’on doit sentir tout près sans le construire.

---

## JY13 Ikebukuro — 池袋

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **février** 2026.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Ikebukuro Station (1F-2F, B1) | [lien](https://www.jreast.co.jp/fr/e/stations/e108.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（池袋駅） | [ja](https://www.jreast.co.jp/estation/stations/108.html) · [en](https://www.jreast.co.jp/en/estation/stations/108.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, deux îlots Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Seibu Ikebukuro · Tōbu Tōjō ;
- affluence relative : 2 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F-2F** — les huit voies, sur quatre îlots.
- **B1** — le hall, et c’est là que la gare se joue : deux blocs payants SÉPARÉS, un à l’ouest et un à l’est, chacun avec ses propres volées vers les quatre îlots.

**Groupes de portillons**

- **JR : South Gate · Central Gate 1 · Central Gate 2 · North Gate**, tous au B1. Central Gate 1 apparaît DEUX fois, aux deux bouts du bloc ouest.
- **Autres exploitants, au même niveau et jointifs** : *Tōbu Tōjō Line Gate* (trois lignes de contrôle) et *Tokyo Metro Marunouchi Line Gate* (deux). Chacun a ses propres *Tickets*, distincts de ceux de JR.
- Ascenseurs **A à D** dans le bloc ouest.

**Ordre le long du quai** — Sur le plan de quais, trois brackets seulement : **South Gate & Central Gate 1** (la moitié sud), **Central Gate 2**, **North Gate**. Les quatre groupes JR desservent donc les mêmes quais par des points différents — ce n’est pas une gare à deux bouts, c’est une gare à quatre entrées le long d’un même faisceau.

**Voies Yamanote** — Quatre voies Yamanote sur **deux îlots 方向別** : **7 et 8** ensemble *for Nippori, Ueno & Tōkyō* (内回り), **5 et 6** ensemble *for Shinjuku, Shibuya & Shinagawa* (外回り). Chaque îlot porte donc les DEUX voies d’un même sens, ce qui **confirme** `config: terminusIsland`. Au-delà : Saikyō (1 et 4) et Shōnan-Shinjuku (2 et 3).

**Correspondances et leur direction**

- **Tōbu Tōjō** — trois lignes de contrôle propres au nord-ouest du B1, contre le *Tobu Department Store*.
- **Tokyo Metro Marunouchi** — deux lignes de contrôle, au centre et au sud du B1. Le plan ne distingue pas les autres lignes Metro (Yūrakuchō, Fukutoshin) : elles ne sont pas cartographiées ici.
- **Seibu Ikebukuro** — *absent du plan*, alors que ses grands magasins y sont. La correspondance existe, sa géométrie n’est pas dans ce document.

**Commerces structurants**

- **LES PASSAGES SONT NOMMÉS, et c’est le fait le plus exploitable du relevé** : *Orange Road*, *Apple Road*, *Azeria Road*, *Cherry Road* pour les axes est-ouest, *Southern Passage*, *Central Passage*, *Northern Passage* pour les traversées. Le cahier des charges espérait pouvoir s’appuyer sur ces noms « lorsque cela est vérifié » : ce l’est.
- **Statue of Ikefukuro (Owl)** — いけふくろう, le point de rendez-vous, nommément sur le plan, à l’est près de PARCO.
- **Tobu Department Store** (nord-ouest), **Seibu Department Store** (trois blocs au sud et à l’est), **PARCO** (deux blocs à l’est, plus un renvoi « for B2F PARCO »). Tous en **gris** : emprise bâtie, hors concourse — ils bordent le hall, ils n’en font pas partie.
- Aucun aplat « large store inside the ticket gates » : **rien derrière les portillons**. Les commerces d’Ikebukuro sont tous en zone libre ou hors gare, et un **KIOSK** ou un **SHOP** ponctue le hall.

**Travaux (août 2026)**

Aucune zone de chantier signalée sur les deux feuilles.

**Incertain**

- Le plan est de **février 2026**, six mois avant la date de référence.
- Ni le **Seibu Ikebukuro**, ni les lignes **Yūrakuchō / Fukutoshin** ne sont cartographiés — le document est JR + Tōbu + Marunouchi.
- Les **noms japonais** des groupes et des passages ne sont pas sur cette édition anglaise : 中央改札1・2 / 南改札 / 北改札 et オレンジロード, アップルロード… restent à confirmer.
- Le plan ne montre pas les niveaux inférieurs (B2, B3) ni le *Metropolitan* côté ouest.

**Compromis de jeu**

Tranche jouable dans le **bloc payant ouest du B1**, autour du *Central Gate 1*, avec ses volées vers les quatre îlots. Représentés sans être visitables : le *Central Gate 2* et le *North Gate* au bout du hall (perspective longue), le *South Gate* et la *Southern Passage* en virage, les lignes de contrôle **Tōbu** et **Marunouchi** comme portails de correspondance jointifs — c’est la signature d’Ikebukuro, trois exploitants dont les 改札 se touchent —, et les grands magasins en façades grises qui bordent le hall sans s’ouvrir. **Les noms de passages vont à la signalétique** : c’est par eux qu’on s’oriente ici, pas par les points cardinaux.

---

## JY14 Mejiro — 目白

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Mejiro Station (B1-1F) | [lien](https://www.jreast.co.jp/fr/e/stations/e1553.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（目白駅） | [ja](https://www.jreast.co.jp/estation/stations/1553.html) · [en](https://www.jreast.co.jp/en/estation/stations/1553.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : — ;
- affluence relative : 0.75 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — le hall, **au-dessus de la tranchée**, intégré au pont routier. Un contrôle, et rien d’autre.
- **B1F** — le quai, un îlot unique.

**Groupes de portillons**

- Un seul groupe, **non nommé** : « Gate ». *Tickets*, *Fare Adjustment*, et un renvoi « **for Shops (2F)** ».

**Ordre le long du quai** — Pas de bracket. C’est la plus simple des gares lues : un hall, un contrôle, une descente.

**Voies Yamanote** — Voie **2** = Yamanote *for Ikebukuro, Ueno & Tōkyō* ; voie **1** = Yamanote *for Shinjuku, Shibuya & Shinagawa*. Îlot unique en tranchée : `config: island` et `place: over` **confirmés**. Aucune autre ligne.

**Correspondances et leur direction**

- **Aucune.** Le plan n’en fléche pas une seule — Mejiro est bien l’une des deux gares de la boucle sans correspondance ferroviaire.

**Commerces structurants**

- Un seul renvoi « **for Shops (2F)** », sans nom. **Aucune galerie nommée** : le cahier des charges avait raison d’interdire toute galerie disproportionnée.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- Le contrôle n’est pas nommé ; le dépôt tient 中央改札, non confirmé.
- Aucune sortie nommée n’apparaît dans le cadrage.

**Compromis de jeu**

Tranche jouable : **le hall entier**, et il tient en une pièce. Le sujet est le **calme** et le petit volume au-dessus de la tranchée, pas la surface. Représenté sans être visitable : le renvoi « for Shops (2F) », un demi-niveau commercial qu’on aperçoit sans y monter.

---

## JY15 Takadanobaba — 高田馬場

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **juin 2026**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Takadanobaba Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e938.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（高田馬場駅） | [ja](https://www.jreast.co.jp/estation/stations/938.html) · [en](https://www.jreast.co.jp/en/estation/stations/938.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Seibu Shinjuku · Tōzai ;
- affluence relative : 1.4 ;
- niveaux publiés : `1F-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — les contrôles, en **deux blocs de tailles très inégales**.
- **2F** — le quai : un seul îlot.

**Groupes de portillons**

- **Waseda Exit** — le grand bloc, à l’est : *Fare Adjustment*, *Tickets*, et c’est de lui que partent les deux correspondances.
- **Toyama Exit** — un bloc **minuscule** à l’ouest, avec ses seuls *Tickets* et *Fare Adjustment*. Rien d’autre.
- **Transfer to Seibu-Shinjuku Line** — un troisième point de contrôle, entre exploitants, avec son propre bracket de quai.

**Ordre le long du quai** — Trois brackets le long du quai : **Toyama Exit** à l’ouest, **Transfer to Seibu-Shinjuku Line** au milieu, **Waseda Exit** à l’est. Le rapport de taille entre les deux sorties est frappant sur le plan — c’est exactement ce que le cahier des charges annonçait : « Waseda constitue le hall principal, Toyama un petit accès secondaire clairement distinct ».

**Voies Yamanote** — Voie **1** = Yamanote *for Ikebukuro, Tabata & Ueno* ; voie **2** = Yamanote *for Shinjuku, Shibuya & Shinagawa*. Les deux sens se font face sur **un îlot unique** : `config: island` **confirmé**, et aucune autre ligne ne partage ce quai.

**Correspondances et leur direction**

- **Seibu-Shinjuku** — par un contrôle dédié au milieu du quai, puis « for Seibu-Shinjuku Line » depuis le Waseda Exit.
- **Tokyo Metro Tōzai** — « for Tokyo Metro Tōzai Line », depuis le Waseda Exit également.
- **Les deux correspondances sortent du même côté**, à l’est. Le Toyama Exit n’en dessert aucune.

**Commerces structurants**

- Le plan ne nomme aucune enseigne ni galerie.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **juin 2026**, deux mois avant la référence.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 早稲田口, 戸山口 restent à confirmer — le dépôt tient déjà 早稲田口, et le plan le corrobore comme nom de SORTIE.

**Compromis de jeu**

Tranche jouable au **Waseda Exit**, le grand bloc, d’où partent les deux correspondances. Représentés sans être visitables : le **Toyama Exit** à l’autre bout du quai — un bloc si petit qu’il se lit d’un coup d’œil, et c’est le contraste qui compte —, le **contrôle Seibu-Shinjuku** au milieu du quai comme portail entre exploitants, et le renvoi **Tōzai**. Ni Seibu ni Tōzai ne sont construits : direction et panneau.

---

## JY16 Shin-Ōkubo — 新大久保

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Shin-Ōkubo Station (1F-2F, 4F) | [lien](https://www.jreast.co.jp/fr/e/stations/e857.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（新大久保駅） | [ja](https://www.jreast.co.jp/estation/stations/857.html) · [en](https://www.jreast.co.jp/en/estation/stations/857.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : — ;
- affluence relative : 1 ;
- niveaux publiés : `1F-2F, 4F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — le hall, compact : un contrôle, un « Exit Only », et c’est tout.
- **2F** — le quai, un îlot unique.
- **4F** — et voilà l’explication du « 4F » que l’index annonçait sans qu’on sache quoi en faire : ce n’est **pas un niveau de gare**, c’est un **pont d’ascenseurs** — deux appareils, A et B, fléchés « for Concourse Area (1F) » et « for Platform (2F) ». Un itinéraire accessible qui enjambe la voie par le haut, et rien d’autre.

**Groupes de portillons**

- Un seul groupe, **non nommé** : « Gate », avec *Tickets* et *Fare Adjustment*.
- **Exit Only (IC card only)** — un passage à sens unique, réservé à la carte sans contact. Troisième occurrence de la règle IC dans le relevé, après Tokyo et Yūrakuchō.

**Ordre le long du quai** — Pas de bracket. Un hall, un contrôle, un débouché — exactement ce que le cahier des charges annonçait.

**Voies Yamanote** — Voie **1** = Yamanote *for Ikebukuro, Tabata & Ueno* ; voie **2** = Yamanote *for Shinjuku, Shibuya & Shinagawa*. Îlot unique : `config: island` **confirmé**.

**Correspondances et leur direction**

- **Aucune.** Le plan n’en fléche pas une seule.

**Commerces structurants**

- Un renvoi « **for Station Building (2F)** », sans nom. **Aucune enseigne cartographiée** — et surtout, aucune boutique de quartier : le cahier des charges avait raison de dire que les commerces K-pop du quartier ne sont pas dans la gare.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- Le contrôle n’est pas nommé ; le dépôt tient 中央改札, non confirmé.

**Compromis de jeu**

Tranche jouable : **le hall entier**, minuscule. Deux choses le distinguent et méritent d’être rendues : le **passage « Exit Only (IC card only) »**, à sens unique, et le **pont d’ascenseurs du 4F** — une passerelle qui monte au-dessus de la voie pour redescendre de l’autre côté, visible depuis le quai et jamais empruntée par le joueur.

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

- **EATo LUMINE** — *dans la zone payante* du B1F, entre les volées des voies 9&10 et 13&14, dessiné dans l’aplat « **Large store (inside the ticket gates)** ». Ce n’est donc pas une lecture de couleur au juger : le plan le classe lui-même derrière les portillons. C’est le fait le plus remarquable du document — une galerie de restauration côté 改札内, pas une devanture de couloir.
- **LUMINE EST Shinjuku** — zone libre du B1F, au nord-est du Central East Gate, avec ses propres « for Exit ».
- **NEWoMan** — 2F, de part et d’autre de l’épine sud. Le nom revient sur DEUX aplats différents, et la distinction compte : les blocs beiges qui flanquent l’épine sont des « large stores **inside the ticket gates** », les blocs gris ne sont qu’une emprise bâtie, hors concourse cartographié. **LUMINE 0** (nord-ouest) et **LUMINE 2** (contre le Southeast Gate) sont de ce second type.
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

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **janvier 2026**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Yoyogi Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e1654.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（代々木駅） | [ja](https://www.jreast.co.jp/estation/stations/1654.html) · [en](https://www.jreast.co.jp/en/estation/stations/1654.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Chūō–Sōbu ;
- lignes visibles ou en correspondance : Ōedo ;
- affluence relative : 0.9 ;
- niveaux publiés : `1F-2F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — les contrôles, en **deux blocs séparés**.
- **2F** — les quais : quatre voies.

**Groupes de portillons**

- **North Exit** — un bloc à l’ouest, avec ses *Tickets*, son *Fare Adjustment* et un renvoi « for Ōedo Line ».
- **West Exit** — le bloc principal à l’est, plus grand, avec **deux jeux** de *Tickets* et de *Fare Adjustment*, la sortie **East Exit**, et son propre renvoi « for Ōedo Line ».
- **Les deux blocs ont chacun leur accès à l’Ōedo** : la correspondance se prend des deux côtés, ce qui est rare.

**Ordre le long du quai** — Deux brackets : **North Exit** d’un côté, **West Exit & East Exit** de l’autre. ⚠️ Le cahier des charges présentait North comme « accès principal » et East/West comme secondaires ; **le plan montre l’inverse** — c’est le bloc West/East qui est le plus grand et qui porte deux sorties.

**Voies Yamanote** — Voie **1** = Yamanote *for Shinjuku, Ikebukuro & Ueno* (内回り) ; voie **2** = Yamanote *for Harajuku, Shibuya & Shinagawa* (外回り). Voies **3** et **4** = Chūō-Sōbu Local. **L’appariement des voies en îlots n’est pas lisible** à la résolution fournie : le relevé du dépôt (`sharedIsland` avec la Chūō-Sōbu) n’est donc **ni confirmé ni contredit** par ce document.

**Correspondances et leur direction**

- **Toei Ōedo** — fléché depuis **les deux** blocs de contrôle.

**Commerces structurants**

- Le plan ne nomme aucune enseigne ni galerie.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **janvier 2026**.
- ⚠️ **L’appariement voies ↔ îlots n’est pas résolu** par cette capture. C’est la seule question de plan de voies que le relevé laisse ouverte, et elle mériterait un cadrage plus serré du 2F.
- Le dépôt tient 北口改札 pour le nom du contrôle ; le plan nomme les SORTIES (*North*, *West*, *East*) et non les contrôles.

**Compromis de jeu**

Tranche jouable au bloc **West / East**, qui est le plus grand et porte deux sorties — **et non au North**, contrairement à ce que le cahier des charges supposait. Représentés sans être visitables : le bloc **North** à l’autre bout (petit, séparé, atteint par le quai) et les deux renvois **Ōedo**, un par bloc. L’échelle reste étroite et locale, comme annoncé.

---

## JY19 Harajuku — 原宿

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**, le plus ancien du lot.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Harajuku Station (1F-2F, + B1F Takeshita) | [lien](https://www.jreast.co.jp/fr/e/stations/e1256.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（原宿駅） | [ja](https://www.jreast.co.jp/estation/stations/1256.html) · [en](https://www.jreast.co.jp/en/estation/stations/1256.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, quais latéraux ;
- lignes visibles ou en correspondance : Chiyoda · Fukutoshin ;
- affluence relative : 1.3 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **2F** — le bâtiment de 2020 : le *Omote-sandō Gate*, sa zone libre, et une zone payante en **passerelle étroite** qui file vers l’est au-dessus des voies.
- **1F** — les deux quais.
- **B1F** — un **souterrain minuscule** en T, côté Takeshita : trois volées depuis les quais, un couloir, une petite ligne de portillons, et la sortie. Rien d’autre.

**Groupes de portillons**

- **Omote-sandō Gate** (表参道改札) — au **2F**, dans le bâtiment moderne, avec *Tickets*, *Fare Adjustment*, NewDays et consignes en zone libre.
- **La ligne de portillons du Takeshita Exit** — au **B1F**, six baies environ, avec ses propres *Tickets* et *Fare Adjustment*. Le plan ne lui donne pas de nom propre : il nomme la SORTIE, pas le contrôle.
- **Deux ensembles sans aucun lien hors quai.** On ne passe pas de l’un à l’autre en zone libre : il faut reprendre le quai. C’est exactement le contraste que le cahier des charges demandait de rendre.

**Ordre le long du quai** — Le long des quais, deux brackets seulement et à deux bouts opposés : **Omote-sandō Gate** au **sud**, **Takeshita Exit** au **nord**.

**Voies Yamanote** — Deux **quais latéraux séparés**, un par sens, chacun avec une seule voie : *for Shinjuku, Ikebukuro & Ueno* (内回り) et *for Shibuya, Shinagawa, Hamamatsuchō & Tōkyō* (外回り). Ce qui **confirme** le relevé du dépôt : Harajuku est la seule gare de la boucle en `config: side`. Un seul ascenseur, **A**, côté extérieur.

**Correspondances et leur direction**

- **Tokyo Metro** — fléché depuis la zone libre du 2F, au sud-ouest, sous le Omote-sandō Gate. Le plan ne nomme pas la ligne (Chiyoda / Fukutoshin à Meiji-jingūmae) et n’en montre pas le cheminement.

**Commerces structurants**

- **NewDays** en zone libre du 2F. Consignes de part et d’autre.
- **Aucun aplat de grand commerce**, ni dedans ni dehors. Harajuku est une gare de passage : les boutiques du quartier ne sont pas dans la gare, et le plan le confirme.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- ⚠️ **CORRECTION AU DÉPÔT.** `data/stationInterior` donne à Harajuku `gateJp: 西口改札 / gate: West`, et `data/lines` lui attribue les sorties génériques 中央口 / 北口. Le plan officiel dit autre chose : le contrôle du bâtiment moderne s’appelle **Omote-sandō Gate**, et les sorties relevées sont **West Exit**, **East Exit** (2F, au-delà de ce contrôle) et **Takeshita Exit** (B1F). « West » est donc le nom d’une SORTIE, pas du portillon. La correction est documentée ici ; elle sera appliquée aux données en phase 3.
- Le plan date de **septembre 2025** : onze mois avant la date de référence, le plus grand écart de tout le relevé.
- Les **noms japonais** ne sont pas sur cette édition : 表参道改札, 竹下口, 西口, 東口 restent à confirmer.
- La ligne Metro en correspondance n’est pas nommée sur le document.

**Compromis de jeu**

Les **deux ensembles se construisent tous les deux**, et c’est l’exception : ils sont si petits que l’un ne suffirait pas à faire une gare. Tranche principale au **B1F Takeshita** — un souterrain en T, une petite ligne, une sortie — parce que c’est celui qu’on trouve en descendant au milieu du quai ; et le **2F Omote-sandō** en second ensemble, atteint par l’autre bout du quai, avec sa passerelle claire et son volume de bâtiment neuf. Le **contraste de matière** entre le béton bas du souterrain et le bois clair de 2020 est le sujet ; la surface ne l’est pas. Représentés seulement : le West Exit, le East Exit et le renvoi Tokyo Metro, en fond de zone libre du 2F.

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

- **KIOSK** sur les quais. Aucun aplat « large store » nulle part : à la différence de Shinjuku, **le plan de Shibuya ne place aucune galerie commerciale de gare**, ni derrière ni devant les portillons. Le hall est nu, et c’est un fait de relevé, pas un oubli.
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

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Ebisu Station (1F-3F) | [lien](https://www.jreast.co.jp/fr/e/stations/e290.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（恵比寿駅） | [ja](https://www.jreast.co.jp/estation/stations/290.html) · [en](https://www.jreast.co.jp/en/estation/stations/290.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Hibiya ;
- affluence relative : 1.2 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — le **West Exit** : un contrôle bas, au niveau de la place de l’entrée ouest, avec le renvoi vers le Hibiya.
- **2F** — les quais : deux îlots.
- **3F** — le **East Exit** : un contrôle **haut**, entouré d’atre, d’où partent « for Garden Place » et « for Ebisu Neonort ».
- **Les deux contrôles sont à deux niveaux opposés du quai**, l’un dessous, l’autre dessus. Le cahier des charges l’annonçait — « West : hall bas et urbain ; East : niveau supérieur plus commercial » — et le plan le confirme au niveau près.

**Groupes de portillons**

- **West Exit** — 1F, avec *Tickets* et *Fare Adjustment*. Le plan note « Ticket gate floor ⇔ West entrance station square » : le contrôle est de plain-pied avec la place.
- **East Exit** — 3F, avec son propre *Fare Adjustment*.

**Ordre le long du quai** — Deux brackets sur les quais, **East Exit** et **West Exit**, aux deux bouts et à deux niveaux. Il n’y a pas de hall unique à Ebisu : il y a deux gares superposées à la même verticale.

**Voies Yamanote** — Voie **1** = Yamanote *for Shibuya, Shinjuku & Ikebukuro* ; voie **2** = Yamanote *for Meguro, Shinagawa & Tōkyō*. Les deux sens se font face sur le même îlot (`config: island` **confirmé**). Voies **3** et **4** : Saikyō, Shōnan-Shinjuku et service direct Sōtetsu, sur un second îlot.

**Correspondances et leur direction**

- **Tokyo Metro Hibiya** — fléché depuis le **1F**, côté West Exit.
- **Yebisu Garden Place** — « for Garden Place » depuis le **3F**, côté East Exit. C’est le départ du Yebisu Skywalk.
- **Ebisu Neonort** — autre renvoi du 3F.

**Commerces structurants**

- **atre** — présent aux **trois niveaux**, et c’est ce qui fait Ebisu : la gare est enveloppée par la galerie plutôt que bordée. Le dépôt déclarait `atre` : confirmé, et à trois étages.
- **East Exit Traffic square** — la place devant le contrôle est, nommée.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 東口, 西口 restent à confirmer.
- Le Yebisu Skywalk est fléché, pas cartographié — sa longueur reste inconnue.

**Compromis de jeu**

Tranche jouable au **West Exit (1F)**, bas et urbain, avec sa place de plain-pied. Représentés sans être visitables : le **East Exit au 3F** (volée montante, atmosphère commerciale, atre de part et d’autre), le départ du **Yebisu Skywalk** vers Garden Place — un couloir qui part et ne revient pas —, et le renvoi **Hibiya** au 1F. **Le contraste haut/bas est le sujet** ; ni l’un ni l’autre hall n’est grand.

---

## JY22 Meguro — 目黒

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Meguro Station (B1-1F, B3-B2) | [lien](https://www.jreast.co.jp/fr/e/stations/e1552.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（目黒駅） | [ja](https://www.jreast.co.jp/estation/stations/1552.html) · [en](https://www.jreast.co.jp/en/estation/stations/1552.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie en tranchée, îlot Yamanote ;
- lignes visibles ou en correspondance : Namboku · Mita · Tōkyū Meguro ;
- affluence relative : 1 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **B1** — le quai Yamanote, **dans la tranchée** : un îlot unique.
- **1F** — le hall, **au-dessus** du quai : le *Central Gate*, sa zone libre et l’*East Exit*, encadrés par les deux blocs d’**atre 1**.
- **B3-B2** — Tōkyū Meguro, Namboku et Mita, sur une feuille distincte non dépouillée (hors périmètre JR). Leur existence à ce niveau **confirme** la coupe que le cahier des charges décrit : on monte du quai au hall, puis on **redescend** vers les trois autres lignes.

**Groupes de portillons**

- **Central Gate** — au **1F**, avec *Tickets*, *Fare Adjustment* et l’ascenseur B qui plonge vers le quai.
- Le cadrage ne montre qu’un seul groupe ; un éventuel contrôle ouest n’est pas dans le champ.

**Ordre le long du quai** — Le quai est en tranchée, le hall est dessus, et **une seule volée** les relie dans le cadrage fourni. La gare est donc un **puits** : peu de surface, beaucoup de hauteur — ce que le cahier des charges annonçait.

**Voies Yamanote** — Un **îlot unique** : *Yamanote Line (for Shibuya, Shinjuku & Ikebukuro)* d’un côté, *Yamanote Line (for Shinagawa, Tōkyō & Ueno)* de l’autre. Les deux sens se font face, ce qui **confirme** `config: island`. Aucune autre ligne ne partage ce quai.

**Correspondances et leur direction**

- **Tōkyū Meguro, Tokyo Metro Namboku, Toei Mita** — au **B3-B2**, donc *sous* le quai JR. La correspondance descend.

**Commerces structurants**

- **atre 1** — deux blocs encadrant la zone libre du 1F. Le dépôt déclarait `atre` pour Meguro : confirmé.
- **NewDays** et un **SHOP** sur le quai lui-même.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- Le cadrage ne montre **qu’un seul groupe de portillons** (Central Gate) et une seule sortie nommée (*East Exit*) ; un côté ouest éventuel n’est pas dans le champ.
- La feuille **B3-B2** n’a pas été dépouillée.
- Les **noms japonais** ne sont pas sur cette édition anglaise.

**Compromis de jeu**

Tranche jouable **verticale** : du quai en tranchée (B1) on monte au *Central Gate* (1F), on ressort côté *East Exit*, et l’on voit repartir vers le bas les volées des trois autres lignes. **Le puits et l’enchaînement montée-puis-descente sont le sujet** ; la surface au sol ne l’est pas. Représentés sans être visitables : la descente vers Tōkyū / Namboku / Mita (volées qui plongent, signalétique à trois couleurs), les deux blocs d’**atre 1** en façades, et la tranchée elle-même vue depuis le hall.

---

## JY23 Gotanda — 五反田

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Gotanda Station (1F-4F) | [lien](https://www.jreast.co.jp/fr/e/stations/e695.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（五反田駅） | [ja](https://www.jreast.co.jp/estation/stations/695.html) · [en](https://www.jreast.co.jp/en/estation/stations/695.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot Yamanote ;
- lignes visibles ou en correspondance : Tōkyū Ikegami · Asakusa ;
- affluence relative : 1 ;
- niveaux publiés : `1F-4F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — le **Central Gate**, ses sorties *West* et *East*, et deux blocs d’**atre Gotanda**.
- **2F** — le quai : un îlot unique.
- **4F** — le contrôle vers le **Tōkyū Ikegami**, avec ses propres guichets « Tickets (JR & Tōkyū) ». **Deux niveaux au-dessus du quai JR.**

**Groupes de portillons**

- **Central Gate** — 1F, le contrôle JR, avec *Tickets* et *Fare Adjustment*.
- **to Tōkyū Ikegami Line** — 4F, un contrôle **entre exploitants**, avec son propre *Fare Adjustment*.

**Ordre le long du quai** — Deux brackets sur le quai : **Transfer to Tōkyū Ikegami Line** à l’ouest et **Central Gate** au centre. La gare se lit donc en **coupe verticale** : on descend au 1F pour sortir, on monte au 4F pour changer de compagnie.

**Voies Yamanote** — Voie **1** = Yamanote *for Shinagawa, Tōkyō & Ueno* ; voie **2** = Yamanote *for Shibuya, Shinjuku & Ikebukuro*. Îlot unique, les deux sens face à face : `config: island` **confirmé**.

**Correspondances et leur direction**

- **Tōkyū Ikegami** — au **4F**, donc **au-dessus** des quais JR. Le cahier des charges demandait « la correspondance verticale vers la ligne Tōkyū Ikegami située plus haut » : confirmé, et l’écart est de deux niveaux.
- **Toei Asakusa** — fléché depuis le **1F**, côté est. La gare a donc une correspondance en haut et une en bas.

**Commerces structurants**

- **atre Gotanda 1** et **atre Gotanda 2** — deux blocs distincts au 1F, de part et d’autre du Central Gate.
- **JR-EAST Hotel Mets Gotanda** — l’hôtel du groupe, contre la gare.
- Le dépôt ne déclarait pas `atre` pour Gotanda : à ajouter.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- Les **noms japonais** ne sont pas sur cette édition anglaise.
- Le **3F** n’apparaît pas : l’onglet couvre 1F-4F mais le plan ne montre que 1F, 2F et 4F. Ce qui occupe le 3F reste inconnu.

**Compromis de jeu**

Tranche jouable au **Central Gate (1F)**, entre les deux blocs d’atre. **La verticalité est le sujet** : depuis le quai on doit voir partir vers le haut la volée du **Tōkyū Ikegami** — deux niveaux, un contrôle au bout — et vers le bas celle du **Toei Asakusa**. Représentés sans être visitables : ces deux directions, les sorties *West* et *East*, et les deux atre en façades. La gare n’a presque pas de surface : elle a une hauteur.

---

## JY24 Ōsaki — 大崎

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan d’**avril 2026**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Ōsaki Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e319.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（大崎駅） | [ja](https://www.jreast.co.jp/estation/stations/319.html) · [en](https://www.jreast.co.jp/en/estation/stations/319.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, deux îlots Yamanote ;
- lignes visibles ou en correspondance : Saikyō · Shōnan–Shinjuku · Rinkai ;
- affluence relative : 1.3 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — les quais : quatre îlots, huit voies.
- **2F** — les contrôles et, surtout, **une passerelle**. Le plan l’écrit en toutes lettres : « *Concourse outside the ticket gate = Pedestrian overpass* ». La zone libre d’Ōsaki **est** un pont piéton.

**Groupes de portillons**

- **South Gate** et **North Gate** — les deux groupes, tous deux au 2F, avec leurs *Tickets* et *Fare Adjustment*.

**Ordre le long du quai** — Deux brackets seulement, **South Gate** et **North Gate**, aux deux bouts de la passerelle.

**Voies Yamanote** — **Quatre voies Yamanote sur deux îlots 方向別** : **1** et **2** *for Shinagawa, Tōkyō & Ueno*, **3** et **4** *for Shibuya, Shinjuku & Ikebukuro*. Chaque îlot porte donc les deux voies d’un même sens — exactement comme Ikebukuro, et cela **confirme** `terminusIsland`. Au-delà : Saikyō et Rinkai (6, 7, 8), Shōnan-Shinjuku et service direct Sōtetsu (5).

**Correspondances et leur direction**

- **Rinkai** — voies 6 à 8, correspondance de quai à quai.
- **Sōtetsu** — par service direct, voie 5.

**Commerces structurants**

- **Dila Osaki** — la galerie de la gare, en deux blocs au 2F. Le dépôt ne la déclarait pas.
- **GATE CITY OHSAKI** et **Think Park** — fléchés depuis la passerelle, donc atteints **sans redescendre**. C’est ce que le cahier des charges demandait : les sorties mènent à des decks, pas à un trottoir.
- **Ikoi-no Square** — une place nommée sur la passerelle.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date d’**avril 2026**.
- Les quatre débouchés que le cahier des charges nomme — East, West, New East, New West — apparaissent bien (*New West Exit*, *West Exit*, *East Exit*, *New East Exit*) mais ce sont des **sorties**, pas des contrôles : les seuls contrôles sont South Gate et North Gate.
- Les **noms japonais** ne sont pas sur cette édition anglaise.

**Compromis de jeu**

Tranche jouable autour du **North Gate**, sur la **passerelle** — et c’est elle le sujet : une zone libre entièrement suspendue, d’où l’on atteint les tours sans jamais toucher le sol. Représentés sans être visitables : le **South Gate** à l’autre bout, les quatre débouchés (*New West*, *West*, *East*, *New East*) menant chacun à un **deck** et non à une rue, **GATE CITY OHSAKI** et **Think Park** en perspectives extérieures simplifiées, et **Dila Osaki** en façades.

---

## JY25 Shinagawa — 品川

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — plan de **juillet 2026**, recadré sur demande.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Shinagawa Station (1F, 2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e788.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（品川駅） | [ja](https://www.jreast.co.jp/estation/stations/788.html) · [en](https://www.jreast.co.jp/en/estation/stations/788.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Yokosuka · Tōkaidō Shinkansen · Keikyū ;
- affluence relative : 1.7 ; **gare en travaux** ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — les quais : voies 1 à 15 pour les lignes classiques, 21 à 24 pour le Shinkansen.
- **2F** — le **hall-passerelle**. Une bande **libre** court d’ouest en est et les zones payantes la bordent **des deux côtés** : on traverse Shinagawa de part en part sans jamais entrer en gare. C’est l’inverse d’un couloir payant, et cela change tout le dessin.

**Groupes de portillons**

- **Central Gate** — au 2F, avec le **Triangle Clock** (三角時計) juste à côté : un repère nommé sur le plan, et le point de rendez-vous de la gare.
- **North Gate** — plus à l’est, avec ses propres *Tickets* et *Fare Adjustment*.
- **Transfer to Keikyū Line** — une ligne de contrôle *entre deux exploitants*, au nord-ouest, avec ses *Tickets (Keikyū)*.
- **Contrôles Shinkansen, au nombre de quatre** : *Tōkaidō Shinkansen Transfer (South)* et *(North)* côté payant, *for Tōkaidō Shinkansen (South)* et *(North)* côté libre. Comme à Tokyo, passer au Shinkansen demande de franchir un second 改札.
- Ascenseurs **A à K**.

**Ordre le long du quai** — Le passage **libre** du 2F est l’ossature : il porte le **Takanawa Exit (West Exit)** à un bout et le **Kōnan Exit (East Exit)** à l’autre, avec les zones payantes en bordure. Les deux directions que le cahier des charges veut « opposées et immédiatement compréhensibles » le sont : ce sont littéralement les deux extrémités d’un même couloir.

**Voies Yamanote** — Voie **1** = *Yamanote Line (**Inner Loop**) (for Tōkyō, Ueno & Komagome)* ; voie **3** = *Yamanote Line (**Outer Loop**) (for Shibuya, Shinjuku & Ikebukuro)*. Comme à Akihabara, le plan écrit les deux sens en toutes lettres. Puis Keihin-Tōhoku (4, 5), Ueno-Tōkyō (6, 7, 9, 10, 11), **8 = « Extra Platform »**, Tōkaidō (12), Sōbu Rapid (13, 14), Yokosuka (15), Tōkaidō・Sanyō Shinkansen (21-24).

**Correspondances et leur direction**

- **Keikyū** — au 2F, au nord-ouest, par une ligne de contrôle dédiée et ses guichets propres. Il débouche du côté **Takanawa**.
- **Shinkansen** — quatre lignes de contrôle relevées, deux au nord, deux au sud.

**Commerces structurants**

- **ecute Shinagawa** — vaste, dans l’aplat des grands commerces, sur le flanc **ouest** du passage, avec deux renvois « for ecute (2F) ».
- **Mizunone Plaza** (水の音広場) — une place nommée, dans la même zone.
- **atre** — deux blocs au sud, en emprise bâtie.
- **Triangle Clock** au Central Gate et **Safety monument** (安全の碑) sur les quais : deux repères nommés.
- KIOSK et SHOP répartis le long des deux zones payantes ; **Waiting Room**.

**Travaux (août 2026)**

Beaucoup de chantier : au moins **sept zones « Under Construction »** sur la feuille des quais et deux sur celle du hall, dont une contre le Takanawa Exit. Plan daté « *As of July, 2026* ».

**Incertain**

- ⚠️ **Il n’y a pas de voie 2.** Le plan numérote 1, puis 3, 4, 5… et les volées sont fléchées « for Track No.**1** » (seule) mais « for Tracks No.**3 & 4** » (ensemble). Autrement dit, la voie Yamanote *Inner Loop* a une face de quai **pour elle seule**, tandis que l’*Outer Loop* partage son îlot avec la Keihin-Tōhoku. Le dépôt décrit Shinagawa par un unique `config: sharedIsland` : **cette asymétrie ne s’y exprime pas**. Rien n’a été modifié — c’est la même famille de question que l’`elevation` d’Ueno, et elle se tranche hors de ce chantier.
- Le plan date de **juillet 2026**, un mois avant la référence.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 中央改札, 北改札, 高輪口, 港南口 restent à confirmer.

**Compromis de jeu**

Tranche jouable autour du **Central Gate**, comme le cahier des charges le demande, avec le **Triangle Clock** comme repère immédiat et **ecute Shinagawa** pour l’échelle. Le passage **libre** ouest-est est l’objet principal : long, traversant, bordé de contrôles — on doit comprendre qu’on peut le suivre sans entrer. Représentés sans être visitables : le **North Gate** en enfilade, le **Takanawa Exit** et le **Kōnan Exit** aux deux bouts (perspectives opposées, pas des trottoirs), le **Transfer to Keikyū** côté Takanawa, les **quatre contrôles Shinkansen**, et les palissades de chantier qui ferment naturellement le périmètre.

---

## JY26 Takanawa Gateway — 高輪ゲートウェイ

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Takanawa Gateway Station (1F-3F) | [lien](https://www.jreast.co.jp/fr/e/stations/e1750.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（高輪ゲートウェイ駅） | [ja](https://www.jreast.co.jp/estation/stations/1750.html) · [en](https://www.jreast.co.jp/en/estation/stations/1750.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot Yamanote ;
- lignes visibles ou en correspondance : Keihin-Tōhoku ;
- affluence relative : 0.7 ;
- niveaux publiés : `1F-3F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **2F** — le hall unique, transversal, au-dessus des voies : *South Gate* et *North Gate* aux deux bouts d’une même zone libre.
- **1F** — les deux îlots.
- **3F** — un **deck**, fléché « for 3F Deck » depuis la zone libre. C’est la liaison vers Takanawa Gateway City.

**Groupes de portillons**

- **South Gate** et **North Gate** — deux groupes, tous deux au **2F**, aux deux extrémités du même hall transversal, chacun avec ses *Tickets* et son *Fare Adjustment*.
- Ascenseurs **A à D**, un par volée de quai.

**Ordre le long du quai** — Le hall est **unique et transversal** : les deux groupes en occupent les deux bouts, et les volées vers les voies 1&2 et 3&4 partent d’entre les deux. C’est la topologie la plus simple des cinq gares lues, et elle contraste avec tout le reste — une seule pièce, deux portes.

**Voies Yamanote** — Voie **1** = Yamanote *for Tōkyō, Ueno & Sugamo* (内回り) ; voie **2** = Yamanote *for Shibuya, Shinjuku & Ikebukuro* (外回り), **sur le même îlot**. Voies **3** et **4** = Keihin-Tōhoku, sur un second îlot. Ce qui **confirme** `config: island` : chaque ligne a son îlot, les deux sens se faisant face.

**Correspondances et leur direction**

- **Toei Asakusa & Keikyū** — fléché « for Toei Asakusa Line & Keikyū Line » depuis la zone libre du 2F, côté nord. C’est la liaison piétonne vers Sengakuji ; le plan en donne la direction, pas le cheminement.

**Commerces structurants**

- Le plan ne place **aucune enseigne nommée** ni aucun aplat de grand commerce. À la date du document, la gare est un volume, pas une galerie.

**Travaux (août 2026)**

Aucune zone de chantier signalée sur le document.

**Incertain**

- ⚠️ **La date est le vrai problème ici.** Septembre 2025, alors que Takanawa Gateway City s’ouvre par tranches : les commerces de la gare et les liaisons de dalle d’**août 2026** ne peuvent pas être lus sur ce plan. Le cahier des charges demande « les commerces majeurs réellement présents » — ce document ne permet pas de les établir.
- Les **noms japonais** des deux groupes ne sont pas sur cette édition.
- Le **3F Deck** est fléché mais pas cartographié.

**Compromis de jeu**

Tranche jouable : **le hall transversal du 2F en entier**, ce qui est possible parce qu’il est petit — c’est la seule des cinq gares lues où le périmètre jouable peut coïncider avec la gare. Les deux groupes sont franchissables. Représentés seulement : le **3F Deck** (volée qui monte et disparaît), la direction **Toei / Keikyū** (couloir court et panneau), et Takanawa Gateway City en fond extérieur. Le sujet reste ce que le dépôt a déjà : **le volume, la lumière naturelle, le bois, le verre et les vues sur les voies**. Les commerces, eux, sont laissés en attente d’un plan plus récent.

---

## JY27 Tamachi — 田町

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan d’**avril 2026**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Tamachi Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e976.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（田町駅） | [ja](https://www.jreast.co.jp/estation/stations/976.html) · [en](https://www.jreast.co.jp/en/estation/stations/976.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie au sol, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō ;
- affluence relative : 1 ; **gare en travaux** ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — les quais : deux îlots.
- **2F** — le **hall-passerelle**, au-dessus des voies, d’un seul tenant.
- Un renvoi « **for 3F** » part de la zone libre : un niveau de plus existe, non cartographié.

**Groupes de portillons**

- **South Gate** et **North Gate** — les deux groupes, tous deux au 2F, accolés au centre de la passerelle et se partageant *Tickets* et *Fare Adjustment*.

**Ordre le long du quai** — Deux brackets sur les quais, **South Gate** et **North Gate**. Mais au 2F les deux groupes sont **côte à côte au milieu** de la passerelle, pas à ses extrémités : ce sont les SORTIES qui partent aux quatre coins.

**Voies Yamanote** — Voie **2** = Yamanote *for Tōkyō, Ueno & Sugamo* ; voie **3** = Yamanote *for Shibuya, Shinjuku & Ikebukuro*. Voies **1** et **4** = Keihin-Tōhoku : `sharedIsland` / `sharedWith: Keihin-Tōhoku` **confirmé**.

**Correspondances et leur direction**

- **Toei Asakusa & Mita** (Mita station) — fléché depuis le **Mita Exit (West Exit)**, côté ouest.

**Commerces structurants**

- Un **KIOSK** dans la zone payante. Le plan ne nomme aucune enseigne ni galerie.

**Travaux (août 2026)**

**Trois zones « Under Construction »** — deux au 2F, de part et d’autre du hall, une au niveau des quais côté sud. Plan daté « *As of April, 2026* ».

**Incertain**

- Le plan date d’**avril 2026**, quatre mois avant la référence, sur une gare en travaux.
- Le **3F** est fléché mais pas cartographié : c’est probablement le deck côté Shibaura que le cahier des charges évoque, sans confirmation.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 三田口, 芝浦口 restent à confirmer.

**Compromis de jeu**

Tranche jouable sur la **passerelle du 2F**, autour des deux groupes accolés — et c’est la disposition qui compte : les contrôles sont au **milieu**, les sorties aux **quatre coins**. Les deux directions que le cahier des charges demande sont nommées sur le plan : **Mita Exit (West Exit)** avec son renvoi Toei, et **Shibaura Exit (East Exit)**. Représentés sans être visitables : ces quatre débouchés, le renvoi « for 3F » vers les decks de Shibaura (volée qui monte et se perd), et les palissades de chantier qui ferment le périmètre.

---

## JY28 Hamamatsuchō — 浜松町

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **juin 2026**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Hamamatsuchō Station (1F-3F) | [lien](https://www.jreast.co.jp/fr/e/stations/e1248.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（浜松町駅） | [ja](https://www.jreast.co.jp/estation/stations/1248.html) · [en](https://www.jreast.co.jp/en/estation/stations/1248.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tokyo Monorail · Asakusa · Ōedo ;
- affluence relative : 1.1 ; **gare en travaux** ;
- niveaux publiés : `1F-3F` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **1F** — le **North Exit** : contrôle bas, avec le renvoi vers le Toei Asakusa et l’Ōedo (Daimon).
- **2F** — les quais : deux îlots.
- **3F** — le **South Exit**, et avec lui le **Monorail Transfer**.
- **Les deux contrôles sont à deux niveaux différents**, exactement comme le cahier des charges l’annonçait.

**Groupes de portillons**

- **North Exit** — 1F, *Tickets* et *Fare Adjustment*.
- **South Exit** — 3F, *Tickets*, et un **Lost & Found**.
- **Monorail Transfer** — une ligne de contrôle *entre exploitants*, au 3F, avec son propre *Fare Adjustment (Monorail)*. On ne « passe » pas au monorail de Haneda : on franchit un second 改札.

**Ordre le long du quai** — Deux brackets : **South Exit & Transfer to Monorail** d’un côté, **North Exit** de l’autre. Le sud concentre donc le contrôle JR *et* le passage vers Haneda ; le nord est seul.

**Voies Yamanote** — Voie **2** = Yamanote *for Tōkyō, Ueno & Ikebukuro* ; voie **3** = Yamanote *for Shinagawa, Shibuya & Shinjuku*. Voies **1** et **4** = Keihin-Tōhoku : chaque voie Yamanote partage son îlot avec une Keihin-Tōhoku, ce qui **confirme** `sharedIsland` / `sharedWith: Keihin-Tōhoku`.

**Correspondances et leur direction**

- **Tokyo Monorail (Haneda)** — au 3F, par contrôle dédié.
- **Toei Asakusa & Ōedo** (Daimon) — fléché depuis le **1F**, côté North.
- **Hinode Pier** — fléché depuis le 3F, avec la mention « **Stairway Only** » : c’est la direction de Takeshiba, et elle n’est pas accessible.
- **Kanasugi-bashi** — autre renvoi du 3F.

**Commerces structurants**

- Le plan ne nomme aucune enseigne ni galerie.

**Travaux (août 2026)**

**Deux zones « Under Construction » au 3F**, de part et d’autre du South Exit — ce sont les travaux du débouché sud que le cahier des charges demande de représenter. Plan daté « *As of June, 2026* ».

**Incertain**

- Le plan date de **juin 2026**, deux mois avant la référence, sur une gare en travaux au sud.
- Les **noms japonais** ne sont pas sur cette édition anglaise.
- Le **World Trade Center** que le cahier des charges cite n’apparaît pas nommément sur le plan.

**Compromis de jeu**

Tranche jouable au **South Exit (3F)**, parce que c’est là que tout se joue : le contrôle JR, le **Monorail Transfer** vers Haneda, les palissades de chantier, et les renvois vers **Hinode Pier** (escalier seul) et **Kanasugi-bashi**. Représentés sans être visitables : le **North Exit au 1F** (volée descendante et perspective), le renvoi **Daimon / Toei**, et les passages surélevés vers Takeshiba — un couloir qui part en hauteur et se perd.

---

## JY29 Shimbashi — 新橋

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Shimbashi Station (2F, B1-1F, B5-B4) | [lien](https://www.jreast.co.jp/fr/e/stations/e877.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（新橋駅） | [ja](https://www.jreast.co.jp/estation/stations/877.html) · [en](https://www.jreast.co.jp/en/estation/stations/877.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Tōkaidō · Yokosuka · Ginza · Asakusa · Yurikamome ;
- affluence relative : 1.5 ;
- niveaux publiés : `B1-1F, B5-B4` *(annoncé par l'index, plan non lu)*.

**Niveaux**

- **2F** — les quais des lignes classiques : voies 1 à 6, sur trois îlots.
- **1F** — le niveau des contrôles et des débouchés, **sous le viaduc**.
- **B1F** — un second niveau de contrôle et le carrefour des lignes souterraines : Ginza, Toei Asakusa, Yurikamome.
- **B4F** — une zone payante longue et étroite, propre à la Yokosuka.
- **B5F** — les quais Yokosuka / Sōbu Rapid, un îlot unique.
- **Entre le B1 et le B4, le document ne montre RIEN.** Trois niveaux de vide séparent le hall de la Yokosuka. Le cahier des charges demandait que « la ligne Yokosuka ne semble pas immédiatement sous le hall » : c’est chiffré.

**Groupes de portillons**

- **South Gate** et **North Gate** — au **1F**, aux deux bouts du viaduc, chacun avec ses *Tickets* et son *Fare Adjustment*.
- **Shiodome Underground Gate** — au **B1F**, un troisième groupe, avec ses propres guichets. C’est lui qui donne sur les lignes souterraines.
- Ascenseurs **A à E** ; le **D** est celui qui plonge vers la Yokosuka.

**Ordre le long du quai** — Un seul bracket au 1F pour deux groupes — **South Gate & Shiodome Underground Gate** — et un second pour le **North Gate**. Le South et le Shiodome sont donc desservis par les mêmes volées de quai, bien qu’ils soient à deux niveaux différents : on descend, et l’on choisit ensuite.

**Voies Yamanote** — Voie **5** = Yamanote *for Tōkyō, Ueno & Ikebukuro* (内回り) ; voie **4** = Yamanote *for Shinagawa, Shibuya & Shinjuku* (外回り). Voies **6** et **3** = Keihin-Tōhoku : chaque voie Yamanote partage son îlot avec une Keihin-Tōhoku — îlots (6,5) et (4,3) — ce qui **confirme** `sharedIsland` / `sharedWith: Keihin-Tōhoku`. Voies **2** et **1** = Tōkaidō et Ueno-Tōkyō, sur un troisième îlot. Au B5F : voie **1** = Yokosuka vers Yokohama, voie **2** = Yokosuka・Sōbu Rapid vers Chiba.

**Correspondances et leur direction**

- **Tokyo Metro Ginza** — fléché deux fois, depuis le 1F (côté est) et depuis le B1F.
- **Toei Asakusa** — depuis le B1F.
- **Yurikamome** — depuis le 1F, côté **Shiodome**.
- **Yokosuka / Sōbu Rapid** — correspondance interne JR, mais **quatre niveaux plus bas**.

**Commerces structurants**

- Une quinzaine de **SHOP** génériques au B1F, alignés le long des couloirs souterrains — c’est le seul niveau réellement commerçant du document.
- Le plan ne nomme **aucune enseigne** et ne porte aucun aplat de grand commerce.

**Travaux (août 2026)**

Deux zones **« Under Construction »** au 1F, côté ouest. Plan daté « *As of September, 2025* ».

**Incertain**

- Le plan date de **septembre 2025**, onze mois avant la référence.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 烏森口, 日比谷口, 銀座口, 汐留口 restent à confirmer — le dépôt tient déjà 烏森口 pour le nom du contrôle principal, que ce plan nomme *South Gate* et *North Gate*. **Karasumori est ici une SORTIE, pas un portillon**, ce qui est le même piège qu’à Harajuku.
- Le nombre exact de baies par groupe n’est pas lisible.

**Compromis de jeu**

Tranche jouable **sous le viaduc**, au 1F, autour du **South Gate** et de sa sortie **Karasumori** — plafond bas, poutres, la rue juste dehors. Représentés sans être visitables : le **North Gate** et la sortie **Hibiya (SL Square)** à l’autre bout, la sortie **Ginza**, la sortie **Shiodome** et le renvoi **Yurikamome**, la descente vers le **Shiodome Underground Gate** au B1F (volée qui s’enfonce), et surtout la **Yokosuka** — une trémie qui doit se lire comme un puits, pas comme un escalier : quatre niveaux, dont trois vides.

---

## JY30 Yūrakuchō — 有楽町

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **septembre 2025**.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
| 1 | Guide Maps for Major Stations — Yūrakuchō Station (1F-2F) | [lien](https://www.jreast.co.jp/fr/e/stations/e1617.html) | **`read`** — ouvert et lu |
| 1 | 駅構内図・バリアフリー情報（有楽町駅） | [ja](https://www.jreast.co.jp/estation/stations/1617.html) · [en](https://www.jreast.co.jp/en/estation/stations/1617.html) | `indexed` — non lu |

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie sur viaduc, îlot partagé avec la Keihin-Tōhoku ;
- lignes visibles ou en correspondance : Yūrakuchō ;
- affluence relative : 1.1 ;
- niveaux publiés : *non annoncé par l’index*.

**Niveaux**

- **1F** — tous les contrôles, sous le viaduc.
- **2F** — les quais : deux îlots.

**Groupes de portillons**

- **Hibiya Exit — « IC card only »**
- **Central West Exit — « IC card only »**
- **Central Exit** — le seul du groupe central à accepter autre chose.
- **International Forum Exit — « IC card only »**
- **Kyōbashi Exit**
- **Trois contrôles sur cinq n’acceptent que la carte sans contact.** C’est le même fait qu’au Marunouchi Central de Tokyo, mais en série — et c’est ce qui distingue un petit contrôle automatique d’un vrai 改札.

**Ordre le long du quai** — Trois brackets, et ils donnent les trois ensembles que le cahier des charges veut « perceptiblement distincts » : **Ginza Exit & Hibiya Exit** — **Central Exit & Central West Exit** — **International Forum Exit & Kyōbashi Exit**. Trois groupes le long d’un viaduc, et rien entre eux.

**Voies Yamanote** — Voie **2** = Yamanote *for Tōkyō, Ueno & Ikebukuro* ; voie **3** = Yamanote *for Shinagawa, Meguro & Shibuya*. Voies **1** et **4** = Keihin-Tōhoku : `sharedIsland` / `sharedWith: Keihin-Tōhoku` **confirmé**.

**Correspondances et leur direction**

- **Tokyo Metro Yūrakuchō** — fléché depuis le 1F, côté Kyōbashi.
- Le **Ginza Exit** figure dans les brackets de quai mais pas sur le plan du 1F fourni : il est vers le sud-ouest, hors cadrage.

**Commerces structurants**

- **LUMINE STREET** — nommé **deux fois** au 1F, de part et d’autre du Central Exit. C’est le commerce sous les arches que le cahier des charges attend, et il porte un nom.

**Travaux (août 2026)**

Aucune zone de chantier signalée.

**Incertain**

- Le plan date de **septembre 2025**.
- Le **Ginza Exit** n’est pas dans le cadrage du 1F ; seul son bracket de quai l’atteste.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 中央口, 中央西口, 日比谷口, 京橋口, 国際フォーラム口 restent à confirmer.

**Compromis de jeu**

Tranche jouable autour du **Central Exit** et du **Central West Exit**, comme le cahier des charges le demande — et la règle **« IC card only »** du second est un fait de jeu. Représentés sans être visitables : le groupe **Ginza / Hibiya** au sud-ouest et le groupe **International Forum / Kyōbashi** au nord-est, tous deux par des perspectives le long du viaduc — **les trois ensembles ne doivent jamais se toucher**. **LUMINE STREET** garnit les arches ; les plafonds bas et la structure de viaduc sont le sujet.

---
