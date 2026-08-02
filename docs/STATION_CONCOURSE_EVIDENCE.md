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

**Plans officiels ouverts et lus : 9 / 30.**

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
| JY05 Ueno | 2026-06 | ⚠️ **décalé** par rapport à la référence |
| JY07 Nippori | 2025-04 | ⚠️ **décalé** par rapport à la référence |
| JY13 Ikebukuro | 2026-02 | ⚠️ **décalé** par rapport à la référence |
| JY17 Shinjuku | 2026-08 | ✅ la date de référence |
| JY19 Harajuku | 2025-09 | ⚠️ **décalé** par rapport à la référence |
| JY20 Shibuya | 2026-06 | ⚠️ **décalé** par rapport à la référence |
| JY25 Shinagawa | 2026-07 | ⚠️ **décalé** par rapport à la référence |
| JY26 Takanawa Gateway | 2025-09 | ⚠️ **décalé** par rapport à la référence |

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

*Date de référence : 2026-08. Confiance du relevé : `mostlyVerified` — sur un plan de **mai** 2026, et cadré côté Yaesu.*

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
- **Keiyō Line** et **Sobu Line** ont leurs propres feuilles : ce sont des gares dans la gare, à plusieurs centaines de mètres et cinq niveaux de là. La feuille Sobu n’a pas été fournie.

**Groupes de portillons**

- **Côté Yaesu, relevé** : *Yaesu North Exit*, *Yaesu Central Exit*, *Yaesu South Exit*, et **Nihonbashi Exit** (deux contrôles distincts, l’un vers le Tōhoku Shinkansen, l’autre vers le Tōkaidō・Sanyō).
- **Contrôles de Shinkansen, qui sont des lignes à part entière** : *Tōkaidō and Sanyō Shinkansen (Yaesu Central North Exit)*, *(Yaesu Central South Exit)*, *(Yaesu North Exit)*. À Tokyo, on ne « passe pas au Shinkansen » : on franchit un second 改札.
- **Transferts internes nommés** : *Tōhoku…Shinkansen North / Central / South Transfer*, *Tōkaidō・Sanyō Shinkansen Central / South Transfer*. Ce sont des lignes de contrôle **entre deux zones payantes**.
- ⚠️ **Le côté Marunouchi n’est pas dans le cadrage fourni.** Le Marunouchi Central Gate — celui que le cahier des charges désigne comme tranche principale — n’a donc pas été lu.
- Ascenseurs **A à P** sur la seule feuille 1F.

**Ordre le long du quai** — Trois passages transversaux nommés relient Marunouchi à Yaesu : **Northern Passage**, **Central Passage**, **Southern Passage**, plus un **Northern Free Passage** hors contrôle. C’est l’ossature de Tokyo : la gare se traverse d’ouest en est par trois couloirs, et les volées de quai y tombent perpendiculairement.

**Voies Yamanote** — Voie **4** = Yamanote *for Ueno & Ikebukuro* (内回り) ; voie **5** = Yamanote *for Shinagawa & Shibuya* (外回り). Voie **3** = Keihin-Tōhoku vers Ueno, voie **6** = Keihin-Tōhoku vers Kamata. Chaque voie Yamanote partage donc son îlot avec une voie Keihin-Tōhoku — îlot (3,4) et îlot (5,6) — ce qui **confirme** au mot près le relevé du dépôt : `sharedIsland`, `sharedWith: Keihin-Tōhoku`, « voies 4 et 5 sur deux quais partagés ». Au-delà : Chūō (1,2), Jōban・Utsunomiya・Takasaki・Ueno-Tōkyō (7,8), Tōkaidō (9,10), Tōkaidō Shinkansen (14-19), Tōhoku・Yamagata・Akita・Hokkaidō・Jōetsu・Hokuriku Shinkansen (20-23).

**Correspondances et leur direction**

- **Shinkansen** — par contrôle dédié, côté Yaesu comme côté Nihonbashi. Six lignes de contrôle en tout entre classique et Shinkansen.
- **Keiyō Line** et **Sōbu Line** — chacune son onglet, donc sa propre gare souterraine. Le long cheminement vers la Keiyō, que le cahier des charges cite, est ainsi confirmé par la structure même du document.
- Le plan est **JR seul** : le Marunouchi de Tokyo Metro n’y figure pas.

**Commerces structurants**

- **GRANSTA TOKYO** et **GRANSTA YAESU** — les deux galeries, nommément.
- **TOKYO GIFT PALETTE**, **First Avenue Tōkyō Station**, **KITAMACHI SAKABA** (trois blocs) et **八重北食堂** côté Yaesu nord.
- **Gran Tōkyō North Tower (1F) DAIMARU**, **Sapia Tower (1F)**, **Marunouchi central Building** — emprises bâties qui bordent la gare.
- **JAPAN RAIL CAFE**, **VIEW GOLD LOUNGE**, **JR-East Lost & Found**, **Baggage Storage**, **Wheelchair Passenger Lounge**, deux **Waiting Room**, un **Police Box**, **JR Highway Bus**, **JR TOKAI TOURS Tōkyō Branch** et des **JR-Central Tickets** distincts des guichets JR East.
- **Aji no Sanpomichi** (味の散歩道), au nord-est.

**Travaux (août 2026)**

Le plan porte « *There may be some changes due to construction work. As of May, 2026* », sans délimiter de zone. Tokyo est donc déclarée mouvante sans que le document dise où.

**Incertain**

- ⚠️ **Le côté Marunouchi manque.** Les feuilles fournies sont cadrées sur Yaesu : ni *Marunouchi Central Exit*, ni *Marunouchi North / South*, ni la halle de brique ne sont dans le champ. C’est précisément la tranche que le cahier des charges veut construire — elle reste à relever.
- La feuille **Sobu Line** n’a pas été fournie (cinq onglets sur six).
- Le plan date de **mai 2026**, trois mois avant la référence, et se déclare lui-même sujet à changement sans localiser le chantier.
- Les **noms japonais** ne sont pas sur cette édition anglaise : 丸の内中央口, 八重洲中央口, 日本橋口 restent à confirmer.
- Ni Tokyo Metro Marunouchi, ni les correspondances hors JR ne sont cartographiés.

**Compromis de jeu**

La tranche visée reste le **Marunouchi Central**, mais elle n’est pas encore relevée : en l’état, le seul contrôle documenté et proche des voies 4-5 est côté **Yaesu**. Ce qui EST acquis et structurant : les trois passages transversaux nommés (Northern, Central, Southern), qui donnent la coupe de la gare ; les volées qui desservent **2F et B1F à la fois**, donc la double nappe ; et les **six lignes de contrôle vers le Shinkansen**, qui sont la vraie singularité de Tokyo — une gare où l’on franchit un 改札 pour passer d’un train à un autre. Représentés sans être visitables : Gransta en contrebas, les portails Shinkansen, les directions Keiyō et Sōbu (couloirs longs, en descente, qui se perdent), et le côté Marunouchi en perspective au bout du Central Passage.

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

*Date de référence : 2026-08. Confiance du relevé : `approximate` — plan de **juillet 2026**, mais **cadré hors des voies Yamanote**.*

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

- **1F** — les quais : voies 4 à 15 pour les lignes classiques, 21 à 24 pour le Shinkansen. Les voies **1 à 3 sont hors du cadrage**.
- **2F** — le **hall-passerelle**, et c’est bien une passerelle : une bande libre (le passage public) court du nord au sud, et les zones payantes la bordent **des deux côtés**. On traverse la gare sans jamais entrer.

**Groupes de portillons**

- **North Gate** — relevé, au 2F, sur le flanc est du passage.
- **Kōnan Exit (East Exit)** — le débouché est, au bout du passage libre.
- **Contrôles Shinkansen** : *for Tōkaidō Shinkansen (South)*, *for Tōkaidō Shinkansen (North)* et *Tōkaidō Shinkansen Transfer (North)*. Comme à Tokyo, passer au Shinkansen demande de franchir un second 改札.
- ⚠️ Le **Central Gate** — la tranche que le cahier des charges vise — **n’est pas dans le cadrage fourni**.

**Ordre le long du quai** — Le passage libre du 2F est l’ossature : orienté nord-sud, il porte le *Kōnan Exit* à un bout et se prolonge vers Takanawa à l’autre, avec les zones payantes en bordure. La « immense longueur du hall » que le cahier des charges décrit est bien là, et elle est **libre**, pas payante.

**Voies Yamanote** — Les voies **1 et 2** (Yamanote) sont **hors cadrage**. Le document commence à la voie 4 : Keihin-Tōhoku vers Tōkyō (4) et vers Yokohama (5), Ueno-Tōkyō (6, 7, 9, 10, 11), **8 = « Extra Platform »**, Tōkaidō (12), Sōbu Rapid (13, 14), Yokosuka (15), Tōkaidō・Sanyō Shinkansen (21-24). Ce document **n’établit donc pas** l’affectation des voies Yamanote.

**Correspondances et leur direction**

- **Shinkansen** — trois lignes de contrôle relevées.
- **Keikyū** — *absent du cadrage fourni*. Le cahier des charges l’attend ; ce document ne l’établit pas.

**Commerces structurants**

- **ecute Shinagawa**, avec deux renvois « for ecute (2F) » — la galerie est dessinée dans l’aplat des grands commerces, sur le flanc ouest du passage.
- **Mizunone Plaza** (水の音広場) — une place nommée, dans la zone payante ouest.
- **atre** — trois blocs, en emprise bâtie, au sud et à l’est.
- **Safety monument** (安全の碑), au niveau des quais : un repère nommé.
- KIOSK et SHOP répartis le long des deux zones payantes.

**Travaux (août 2026)**

Beaucoup de chantier : au moins **sept zones « Under Construction »** sur la feuille des quais et une sur celle du hall. Plan daté « *As of July, 2026* ».

**Incertain**

- ⚠️ **Le cadrage manque l’essentiel pour ce jeu.** Voies 1-2 (Yamanote), **Central Gate**, côté **Takanawa** : tout cela est hors champ sur les deux feuilles. La confiance reste donc `approximate` malgré une date excellente.
- Le **Keikyū** n’apparaît pas.
- Les **noms japonais** ne sont pas sur cette édition anglaise.

**Compromis de jeu**

Ce qui est **acquis** et utilisable dès maintenant : la forme du hall — un passage **libre** nord-sud bordé de zones payantes des deux côtés, ce qui est l’inverse d’un couloir payant et change tout le dessin ; l’opposition *Kōnan* (est) / *Takanawa* (ouest) portée par ce passage ; **ecute Shinagawa** et **Mizunone Plaza** côté ouest ; les trois contrôles Shinkansen ; le chantier omniprésent. Ce qui **attend un nouveau cadrage** : le Central Gate, donc la tranche principale, et l’affectation des voies Yamanote.

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
