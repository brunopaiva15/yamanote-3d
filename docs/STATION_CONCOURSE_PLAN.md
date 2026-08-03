# Reconnaître la gare — audit et découpage en phases

Le hall existe (`docs/STATION_INTERIOR.md`), il est meublé (`docs/STATION_DETAIL.md`),
il est peuplé et l'on y valide son titre. Ce qui manque n'est plus une brique :
c'est la **topologie**. Les trente gares partagent aujourd'hui le même schéma —
un accès, un couloir, un hall longitudinal, une ligne de portillons, deux
bouches — et ce schéma décrit très bien *un* hall japonais générique, jamais
*cette* gare-là.

Ce document est le livrable de la **phase 0** : l'audit de ce qui existe, la
liste de ce qui bloque, et le découpage du chantier en phases livrables une à
une sans jamais casser le build.

Date de référence architecturale et commerciale du chantier : **août 2026**.

---

## 1. Ce qui existe, et qui ne se rejoue pas

### 1.1 La chaîne actuelle, du quai à la rue

```
data/stationLayouts   ── gabarit de quai (élévation, config, profondeur,
   (layoutFor)            affluence, palette, accès, signature)
        │
        ▼
systems/stationPlacement ── pose le mobilier de quai, choisit la trémie
   (placementFor)             PRINCIPALE (la plus proche du milieu du quai)
        │  mainStair.z
        ▼
data/stationInterior  ── interiorFor(index, accessZ) : construit LE hall
   (interiorFor)          · zone payante   (PAID_LEN = 12 m)
                          · 1 ligne de portillons (GATE_DEPTH = 1,7 m)
                          · zone libre     (FREE_LEN = 15 m)
                          · N bouches = N sorties fléchées (data/lines)
                          · mobilier rangé le long des 2 parois
                          · pilastres, obstacles
        │
        ├──► three/station/Concourse   (rendu)
        ├──► systems/stationLevels     (quel sol sous les pieds)
        ├──► systems/walkable          (marche du joueur)
        ├──► systems/fareGate          (battants, validation, tarif)
        ├──► systems/concourseRoute    (itinéraires PNJ)
        └──► systems/platformCrowd     (pieds des PNJ)
```

Vingt et un fichiers touchent `interior` / `Concourse` directement ou
indirectement. Le principe **« une implantation, plusieurs lecteurs »** est
déjà tenu, et c'est l'acquis le plus précieux du dépôt : `interiorFor` est la
seule source, le rendu et la marche la lisent tous les deux.

### 1.2 Les invariants à ne pas casser

Ils sont écrits en toutes lettres dans les fichiers, et ils survivent au
chantier :

1. **Une seule source.** Un portillon franchissable là où il n'est pas dessiné
   se voit au premier pas.
2. **Pas de physique.** Le volume praticable est une liste de rectangles
   alignés sur les axes, plus une altitude de sol par nœud.
3. **Repère du QUAI.** Tout l'intérieur est écrit avant la rotation de π du
   côté d'ouverture : la gare se retourne d'un bloc, sans une ligne de plus.
4. **Le relevé fait autorité.** Ce qui est incertain se déclare incertain
   (`data/evidence`, `DataConfidence`), il ne se devine pas.
5. **Ce qui se répète s'instancie** (`three/station/instancing`, `adPool`,
   `shopKit`).
6. `DOOR_SIDE` reste indexé **par gare** ; les exceptions par voie vivent dans
   `data/platforms`.

### 1.3 État de référence (mesuré le 2 août 2026, `main` + branche vierge)

| Contrôle | Résultat |
|---|---|
| `npm test` | **386 tests, 0 échec** (10,4 s) |
| `npm run build` | **✓** (tsc + vite, 2,9 s) |
| `npm run lint` | **✓ exit 0** (avertissements uniquement dans `.tmp/`, généré) |

> Piège de démarrage : `node_modules` était vide sur cette image. Sans
> `npm install`, neuf tests échouent sur `ERR_MODULE_NOT_FOUND` (`three`,
> `@gltf-transform/core`) — ce n'est pas une régression du dépôt.

---

## 2. Ce qui bloque

Quinze constats, tirés de la lecture du code. Chacun désigne une phase.

### D — Données

**D1. Une gare = un hall, et un seul.** `StationInterior` porte un `paid`, un
`gate`, un `free`, un tableau d'`exits`. Il n'y a aucune façon d'exprimer deux
halls indépendants (Uguisudani North/South, Harajuku Omotesandō/Takeshita,
Ōsaki North/South), ni un hall principal avec une branche
(Okachimachi, Tabata, Komagome, Takadanobaba).

**D2. `place: 'under' | 'over'` est global à la gare.** Or Meguro monte du quai
vers son hall *puis* redescend vers Tōkyū/Namboku/Mita ; Akihabara superpose
Hibiya (sous), JR (viaduc) et Chūō-Sōbu (au-dessus) ; Nishi-Nippori empile
Chiyoda / JR / Nippori-Toneri. Le niveau appartient au **hall**, pas à la gare.

**D3. Une seule ligne de portillons.** `FareGateLine` est un champ, pas une
liste. Aucune gare de la boucle n'a un seul 改札口, et la séparation des
groupes est précisément ce qui rend une gare reconnaissable.

**D4. Les sorties sont génériques pour 24 gares sur 30.** `NAMED_EXITS`
(`data/lines`) ne couvre que les index 0, 4, 12, 16, 19, 24 — Tokyo, Ueno,
Ikebukuro, Shinjuku, Shibuya, Shinagawa. Les 24 autres reçoivent
`中央口 / 東口 / 西口…` par `index % 4`. Kanda reçoit ainsi « West Exit », et
Harajuku « North Exit », qui ne sont pas ses sorties.

**D5. Les noms de portillon sont un relevé partiel.** `SPECS`
(`data/stationInterior`) porte le vrai nom quand il est établi (電気街口,
ハチ公改札, 早稲田口, 烏森口) et `中央改札` par prudence ailleurs — valeur
honnête, mais qui uniformise onze gares.

**D6. Aucune trace de source, ni de date, ni de confiance.** `data/evidence`
fournit `DataConfidence` et `SourcedValue<T>` : ils ne sont pas utilisés par
l'intérieur. Rien ne dit d'où vient un nom de portillon ni de quand il date.

**D7. Aucune notion de correspondance ni de travaux.** Le hall ne sait pas
qu'il y a une ligne Ginza à Kanda, un Keikyū à Shinagawa, un chantier à
Shibuya. Les lignes voisines existent (`layout.parallel`) mais seulement comme
décor de quai.

**D8. Les commerces sont déduits de l'affluence, pas du relevé.** `FREE_FAR`
pose un konbini dès `crowd ≥ 1,2` et une galerie dès qu'une enseigne est
déclarée. Sept gares déclarent `ecute`/`atre`, dont trois n'ont pas la place —
et rien ne distingue « enseigne vérifiée », « catégorie vérifiée », « remplissage ».

### G — Géométrie

**G1. Le hall est enfermé dans la bande du quai.** `x0 = PSD_X + 0,35`,
`x1 = PSD_X + depth − 0,35` : le hall fait la largeur du quai (5,3 m à
Yūrakuchō, 10,5 m à Tokyo) et pas un centimètre de plus, parce qu'au-delà la
nappe de rue reprend sa place. C'est **la** contrainte structurante : un hall
transversal, un pont-concourse en travers du faisceau ou une tranche de
Shinjuku n'y tiennent pas. La lever demande de reculer la nappe de rue
(`three/groundStrip`, `systems/stationOcclusion`) sur l'emprise déclarée par le
profil — pas de la supprimer.

**G2. Le hall est toujours dans le prolongement de l'accès, vers +z.**
`z0 = accessZ − STAIR_HALF_Z + (under ? DESCENT_LEN : ASCENT_LEN)`. Un hall
perpendiculaire, un virage, un embranchement sont hors du vocabulaire.

**G3. Une seule trémie mène quelque part.** `mainStair` = la plus proche du
milieu du quai ; les autres restent des couloirs borgnes de cinq marches.
Une gare à deux halls réels demande **deux** accès vivants.

**G4. Les bouches de sortie ne se montent pas.** Le joueur est arrêté au nu du
fond par une `Barrier` ; seuls les PNJ montent six marches et s'effacent. C'est
l'état voulu de la phase 3 de `STATION_INTERIOR.md`, et il devient la
**limite du monde jouable** de ce chantier — mais il lui faut un vocabulaire
plus riche que six marches (couloir court, virage, palier, panneau).

### R — Rendu

**R1. `Concourse.tsx` est un composant unique et monolithique** (559 lignes) :
une boîte, deux parois, un plafond, un fond percé, une ligne de portillons,
quatre panneaux de fléchage à des `z` codés en dur
(`paid.z0 + 2,6`, `paid.z1 − 4,2`, `free.z0 + 2,2`, `free.z1 − 4,5`). Il ne sait
dessiner qu'un couloir droit.

**R2. Aucune occlusion interne.** Tout le hall est rendu d'un bloc dès qu'il est
construit (`Station.tsx` : `place.interior.built && detail <= 2`). Il n'y a ni
portail, ni coupure de visibilité aux virages.

**R3. Les signatures sont des charpentes de QUAI.** Les quatorze modules de
`three/station/signatures/` dessinent ce qu'on voit *depuis le quai*. Il n'y a
rien pour l'intérieur — d'où le dossier `interiors/signatures/` à créer.

**R4. Nippori déclare son niveau sans le construire** (`bespoke: true`) pour ne
pas empiler un second pont-concourse dans le premier. C'est la bonne décision,
et le futur système doit la rendre exprimable au lieu d'être un cas spécial.

### S — Systèmes

**S1. `walkable` / `stationLevels` ne connaissent que deux étages** :
`'platform' | 'concourse'`, et **un** accès qui bascule de l'un à l'autre
(`mainAccessFloor`). Il faut N nœuds à N altitudes et M liens verticaux.

**S2. `fareGate` ne pilote qu'une ligne.** `passageAt(u, z)` interroge
`interior.gate.passages` — un seul tableau, un seul état par index.

**S3. `concourseRoute` suppose l'axe unique.** `hallAxis` balaie en `z` entre
`paid.x0` et `paid.x1` ; `paidLegs`/`freeLegs` sont écrits pour un couloir
droit avec une ligne au milieu.

---

## 3. Ce que le chantier construit

### 3.1 Séparation des couches

Quatre couches, quatre fichiers, et l'on ne les mélange jamais :

| Couche | Fichier | Contenu |
|---|---|---|
| 1. Les **faits** relevés | `src/data/stationConcourseSources.ts` | sources, dates, confiance, notes de vérification |
| 2. Le **format** | `src/data/stationConcourseTypes.ts` | types du profil, niveaux relatifs, nœuds, liens |
| 3. Le **profil** de chaque gare | `src/data/stationConcourseProfiles.ts` | l'approximation géométrique jouable, gare par gare |
| 4. Le **moteur** | `src/data/stationConcourseBuild.ts` | profil → réseau de rectangles ; fallback procédural |

`data/stationInterior.ts` reste, et **reste le fallback** : une gare sans profil
complet retombe dessus, exactement comme aujourd'hui.

### 3.2 Le vocabulaire de profil visé

```ts
type RelativeLevel = 'belowPlatform' | 'platformLevel' | 'abovePlatform' | 'multiLevel';

interface StationConcourseProfile {
  stationIndex: number;
  referenceDate: string;                 // '2026-08'
  confidence: 'verified' | 'mostlyVerified' | 'approximate';
  primaryAccessId: string;
  levels: ConcourseLevel[];              // altitude, hauteur libre, nom
  platformAccesses: PlatformAccess[];    // trémie/escalator/ascenseur → niveau
  concourses: ConcourseNode[];           // halls, mezzanines, ponts
  corridors: ConcourseLink[];            // couloirs, volées, rampes
  gateGroups: GateGroup[];               // 改札口 nommés, N passages
  exits: StationExitProfile[];           // sorties nommées, jp/en, numéro Metro
  transferPortals: TransferPortal[];     // vers les autres lignes, non visitables
  commercialZones: CommercialZone[];     // enseigne / catégorie / façade
  landmarks: InteriorLandmark[];         // ce qui fait reconnaître le lieu
  works?: ConstructionProfile;           // état d'août 2026
  sources: SourceReference[];
}
```

Le point dur reste **G1** : tout profil doit tenir dans une emprise déclarée
(`profile.footprint`), et cette emprise doit être communiquée à l'occultation du
décor de voie. C'est l'objet de la phase 6, et c'est elle qui décide si le
chantier va au bout.

### 3.3 Trois décisions arrêtées en phase 1

Elles sont écrites dans `stationConcourseTypes.ts` et ne se rejouent pas :

1. **Le niveau appartient au hall**, pas à la gare. `place` reste au profil,
   mais comme un résumé vérifié (`multiLevel` dès que les niveaux divergent),
   jamais comme la source.
2. **Un groupe de portillons est un LIEN**, `from` payant → `to` libre. C'est ce
   qui rend le graphe vérifiable : tout accès mène à un contrôle, tout contrôle
   débouche sur une zone libre, toute sortie part d'une zone libre. Le profil
   dit *combien* de baies ; c'est le moteur (phase 7) qui pose les bornes.
3. **`Depiction` est la liste fermée des façons de montrer sans laisser aller** :
   `walkable`, `shortBranch`, `blindCorner`, `stairhead`, `doorway`, `vista`,
   `backdrop`, `closed`, `signOnly`. « Mur invisible » n'en fait pas partie, et
   un nœud non praticable ne compte pas comme orphelin dans le graphe — c'est
   une perspective, pas une impasse.

`validateProfile()` implémente déjà, une fois pour les trente gares, les
contrôles obligatoires n° 3, 4, 5, 6, 7, 9 (partiel), 12 et 13 du cahier des
charges. Il ne dit **rien** de l'exactitude du relevé : un profil parfaitement
cohérent peut décrire une gare imaginaire. C'est le rôle des sources.

---

## 4. Découpage en phases

Chaque phase est livrable seule, laisse `npm test`, `npm run build` et
`npm run lint` verts, et se voit soit à l'écran, soit dans un test.

| # | Phase | Livrable | Sort de |
|---|---|---|---|
| **0** | **Audit et plan** ✅ | ce document | — |
| **1** | **Format des profils** ✅ | `stationConcourseTypes.ts` + `validateProfile` + 14 tests | D1 D2 D3 |
| **2** | **Registre des sources** ✅ | `stationConcourseSources.ts` : 30 plans JR East localisés ; `STATION_CONCOURSE_EVIDENCE.md` | D6 |
| **3** | **Sorties et portillons réels** ✅ | `data/lines` : relevé complet des 30 gares ; `stationInterior` : 4 corrections de nommage + 8 contrôles anonymes | D4 D5 |
| **4** | **Relevé documentaire** ✅ | `STATION_CONCOURSE_EVIDENCE.md` : **30 plans officiels lus** | D5 D6 D7 D8 |
| **5** | **Profils, données seules** ✅ | `stationConcourseProfiles.ts` : 30 profils validés, aucun consommateur ; 13 tests | D1→D8 |
| **6** | **Emprise déclarée** ✅ | `stationConcourseReach.ts` + table générée ; `stationOcclusion` la lit ; `validateProfile` refuse ce que le ballast interdit | **G1** |
| **7** | **Compilateur de profil** ✅ | `stationConcourseBuild.ts` : profil → réseau de pièces ; repli fidèle vers `interiorFor` ; `networkIssues` | G2 R4 |
| **8** | **Réseau dans les niveaux** ✅ | `stationLevels` lit le réseau : N pièces à N altitudes, `joinFloorAt` pour les liens | S1 |
| **9** | **Réseau dans la marche** ✅ | `walkable` et `walkerBlocked` acceptent les ouvrages de liaison comme du sol | S1 |
| **10** | **Portillons multiples** ✅ | `concourseBays` / `bayAt` : un rang plat qui traverse les groupes ; `fareGate` s'y branche | S2 |
| **11** | **Itinéraires PNJ** ✅ | `concourseRoute` : axe lu sur la destination, choix de groupe, bouche sur n'importe quelle paroi | S3 |
| **12** | **Accès secondaires vivants** ✅ | `placement.liveAccesses` ; la marche, le rendu et les itinéraires les lisent tous | G3 |
| **13** | **Rendu : `ConcourseNetwork`** ✅ | `shellsOf` : volumes continus ; `Concourse` devient un archétype parmi d'autres | R1 |
| **14** | **Archétypes 1 — halls** ✅ | `hallStyle` : `linear`, `underViaduct`, `compact` — ce qui les distingue est la COUVERTURE | R1 |
| **15** | **Archétypes 2 — hauteur** ✅ | `overbridge`, `cross`, `mezzanine`, `hubSlice` : ce qu'ils LAISSENT VOIR | R1 |
| **16** | **Archétypes 3 — limites** ✅ | `interiors/Limits` : correspondances (gardées ou non) et palissades de chantier | G4 D7 |
| **17** | **Occlusion interne** ✅ | `visibleShells` : ce qu'on voit d'un volume depuis un autre — jonction, niveau, portée | R2 |
| **18** | **Signalétique unifiée** ✅ | `stationSignage` : une seule source pour quai / hall / portillons / couloirs / bouches | D4 D5 |
| **19** | **Commerces** ✅ | `ConcourseFrontage` : l'échelle de vérité de `CommerceStatus` dessinée ; `interiors/Frontages` | D8 |
| **20** | **Petites gares** ✅ | huit gares passent par leur relevé ; `FareGates`, `Fixtures` et les itinéraires suivent le réseau | — |
| **21** | **Gares moyennes** ✅ | vingt gares branchées ; deux DIFFÉRÉES faute d'une volée réglable | — |
| **22** | **Signatures 1** ✅ | Nippori, Shinagawa, Takanawa Gateway ; `interiors/Landmarks` : les repères du lieu | R3 R4 |
| 23 | Signatures 2 | Tokyo, Ueno, Ikebukuro | R3 |
| 24 | Signatures 3 | Shinjuku, Shibuya (+ travaux août 2026) | R3 D7 |
| 25 | Paliers de qualité | haute / moyenne / basse, sans jamais retirer une collision | — |
| 26 | Tests | les 18 exigences du cahier des charges | — |
| 27 | Captures de contrôle | probe : 5 vues × 30 gares | — |
| 28 | Perf et bilan | mesures avant/après ; `STATION_CONCOURSE_SCOPE.md` **écrit** et tenu par un test | — |

### 4.1 Ce que la phase 2 a découvert, et qui change les phases 3 à 5

**L'environnement de développement n'atteint pas les sites des opérateurs.** La
passerelle réseau refuse la connexion (403 sur `CONNECT`) vers `jreast.co.jp`,
`tokyometro.jp`, `kotsu.metro.tokyo.jp` — et vers à peu près tout le reste,
Wikipédia compris. Seule la recherche indexée répond, et elle rend des titres et
des adresses, jamais le contenu d'une page.

Ce que la phase 2 a donc pu faire, et qui reste utile :

- **localiser les trente plans officiels JR East.** Leur adresse dépend d'un
  numéro interne sans rapport avec le code JY — Akihabara est 41, Tokyo 1039,
  Takanawa Gateway 1750 — et ne se devine pas. Les trente ont été confirmés un
  par un par concordance entre l'adresse indexée et le titre de la page ;
- localiser les points d'entrée Tokyo Metro, Toei, ecute, atré ;
- récolter treize indications de niveaux (`B1-1F`, `1F / 2F-M3 / 3F`) dans les
  résumés d'indexation, gardées à part comme **indications** et non comme faits.

Ce que cela impose au reste du chantier :

1. `SourceRetrieval` (`read` / `indexed` / `catalogued`) rend l'écart visible.
   Les trente références JR East sont `indexed` : leur adresse est sûre, leur
   contenu n'a pas été lu ;
2. `validateProfile` **refuse** qu'un profil se déclare `verified` sans qu'une
   source de rang 1-3 ait été lue. Aucune gare ne pourra donc porter cette
   mention tant que les plans resteront fermés — la règle est dans le code, pas
   dans une bonne intention ;
3. la phase 4 produira un relevé fondé sur ce que le dépôt sait déjà
   (`data/stations`, `data/stationLayouts`, `data/platforms`,
   `docs/PLATFORM_EVIDENCE.md`) et sur ce que l'index confirme, avec la
   confiance qui correspond — `approximate` par défaut, `mostlyVerified` là où
   plusieurs sources indépendantes concordent ;
4. un test lie le carnet de relevé au code : le jour où une source passe en
   `read`, l'avertissement du carnet devient faux et la suite tombe.

C'est une limite d'environnement, pas une limite de méthode : les adresses sont
en place, et l'ouverture des trente plans est un travail mécanique dès que le
réseau le permet.

### 4.2 La voie qui marche : le plan fourni à la main

Le propriétaire du dépôt dépose le document dans la conversation ; il s'y lit
comme n'importe quel fichier. La référence passe en `read`, et la gare quitte
l'approximation.

**Shinjuku est passée par là**, et le résultat justifie le détour : le jeu
« Guide Maps for Major Stations » couvre les trois niveaux (quais, B1F, 2F) et
porte sa date en clair — *As of August, 2026*, la date de référence du chantier
au mois près, avertissement de chantier compris. Il a livré les neuf groupes de
portillons avec leur niveau, l'ordre dans lequel ils se succèdent le long du
quai, l'affectation des voies 14 et 15, les trois branches de correspondance, la
position d'EATo LUMINE **dans** la zone payante, et la zone « Under
Construction ». Il a de plus **confirmé** un relevé antérieur du dépôt
(`sharedIsland` / `Chūō–Sōbu`), ce qu'aucune recherche indexée n'aurait fait.

Les documents ne sont **pas versionnés** : ils portent « ©JR East Consultants
Company ». Ce qui est versionné, c'est ce qu'on y a lu — `STATION_CONCOURSE_EVIDENCE.md`,
généré par `npm run docs:concourse`, rubrique par rubrique, contestable ligne à
ligne, et lisible sans le plan.

Les quatre autres gares demandées — Shibuya, Ueno, Harajuku, Takanawa Gateway —
suivront le même chemin si les plans arrivent. Les vingt-cinq restantes ne
bloquent rien : elles avancent en `approximate`.

### 4.3 Ce que la phase 5 a chiffré, et qui commande la phase 6

Les trente profils sont écrits et validés. Trois résultats en sortent, et deux
d'entre eux ont demandé de rouvrir le format de la phase 1 — ce qui est le
signe qu'un relevé sert à quelque chose.

**1. Vingt-trois gares sur trente sortent de la bande du quai.** Sept seulement
tiennent entre `PSD_X` et le fond de quai : Kanda, Okachimachi, Ōtsuka,
Takadanobaba, Yoyogi, Shimbashi, Yūrakuchō — les seules dont le hall suit
vraiment l'axe des voies. Les vingt-trois autres ont un ouvrage TRANSVERSAL :
passerelle (Tamachi, Ōsaki, Shinagawa, Takanawa Gateway), pont-concourse
(Nippori, Tabata, Komagome, Sugamo, Mejiro), plateau (Ueno), couloir traversant
en zone payante (Tokyo, Shinjuku), ou souterrain qui passe sous les voies
(Uguisudani). Le chiffre est tenu par un test : **G1 n'est pas une hypothèse,
c'est les trois quarts de la boucle**, et la phase 6 décide donc du sort de
vingt-trois gares, pas de trois.

**2. Quatre faits n'entraient pas dans le format.** Ils sont tous écrits sur un
plan, et aucun moteur ne les aurait devinés :

| Fait | Où | Champ ajouté |
|---|---|---|
| « IC card only » | Tokyo (Marunouchi Central), Yūrakuchō (3 contrôles sur 5), Shin-Ōkubo | `GateGroup.icOnly` |
| « Exit Only » — passage à sens unique | Shin-Ōkubo, Shibuya (Hachikō) | `GateGroup.exitOnly` |
| Contrôles qui **ferment la nuit**, horaires imprimés | Shinjuku (Central West, Southeast) | `GateGroup.hours` |
| Ligne de contrôle **entre deux zones payantes** | Tokyo, Ueno, Nippori, Ikebukuro, Takadanobaba, Shinjuku, Gotanda, Shinagawa, Hamamatsuchō | `TransferPortal.gated` |

Le dernier est structurel : `GateGroup` relie du payant à du LIBRE par
construction, et ne peut donc pas décrire un 改札 franchi entre deux
exploitants sans repasser en zone libre. Neuf gares sur trente en ont un.

**3. `validateProfile` partait d'un seul accès, et Harajuku l'a corrigé.** Le
relevé y donne deux ensembles complets — le souterrain de Takeshita au B1F, le
bâtiment de 2020 au 2F — si petits que l'un ne suffirait pas à faire une gare,
et sans aucun passage de l'un à l'autre hors quai. Ils sont pourtant tous les
deux praticables : on remonte sur le quai, on marche, on redescend par l'autre
bout. Le graphe se sème maintenant depuis **tous** les accès praticables, parce
que c'est le quai qui les relie — et le quai n'est pas un nœud du profil, il est
ce sur quoi le profil se greffe.

**Ce que les profils ne prétendent pas être.** Les plans JR East n'ont ni
échelle ni cotation : aucun rectangle n'est mesuré. Ce qui est relevé, c'est la
topologie — niveaux, groupes, ordre, correspondances, enseignes nommées ; ce qui
est composé, c'est la géométrie, et le fichier le dit en tête. D'où le plafond
de confiance : aucun des trente ne dépasse `mostlyVerified`, quatre restent
`approximate` parce que leur plan a deux à quatre ans, et **94 questions
ouvertes** sont écrites nommément.

### 4.4 Ce que la phase 6 a tranché : G1 se coupe en deux

La question était : **une gare a-t-elle le droit d'être plus large que son
quai ?** La réponse n'est pas oui ou non — elle dépend de la nappe qu'on
regarde, et personne ne l'avait remarqué.

**Côté fond de quai : oui, et c'était déjà presque vrai.** La nappe de rue se
dérobe déjà au droit du quai (`groundPush`), et le décor long s'écarte déjà de
`depth + 24 m` (`sidePush`). Il ne manquait qu'une vérification. Sur les trente
gares, **vingt-six passent sans rien changer** ; quatre seulement demandaient
plus, et de deux à six mètres :

| Gare | Écartement générique | Ce que la gare bâtit | Nouveau |
|---|---|---|---|
| JY01 Tokyo | 34,5 m | 42,3 m | 38,6 m |
| JY17 Shinjuku | 32,4 m | 43,3 m | 38,1 m |
| JY26 Takanawa Gateway | 33,0 m | 40,4 m | 36,7 m |
| JY27 Tamachi | 31,2 m | 36,6 m | 32,9 m |

**Côté voie : non, et jamais.** Le ballast porte un train ; il ne se dérobe pas.
`ballastTrim` rentre sa rive jusqu'au bord de quai et s'arrête là. Or le hall
souterrain ordinaire plafonne à −0,48 m, soit **soixante-sept centimètres
au-dessus du rail** (−1,15 m) : un couloir qui traverserait le faisceau à cette
cote ressortirait au travers de la plate-forme. Les six gares dont un hall
traverse réellement — Tokyo, Uguisudani, Ikebukuro, Shinjuku, Harajuku,
Shibuya — passent donc **sous la voie**, sur un niveau à −6,4 m. Elles le disent
chacune dans leurs questions ouvertes : la volée dessinée aujourd'hui
(`DESCENT_LEN`) n'y descend pas, et c'est à la phase 7 de l'allonger.

**Et la règle est désormais vérifiée, pas seulement écrite.**
`validateProfile` refuse un hall qui vit à l'altitude des nappes et franchit la
rive du ballast (`acrossBallast`). C'est G1 sous sa forme exacte, et la
conséquence est ce que la phase 6 avait besoin d'établir : **à l'altitude des
nappes de sol, les trente gares tiennent dans la bande du quai.** Le décor au
ras du sol n'a donc rien de nouveau à faire ; ce qui déborde déborde plus haut
ou plus bas, là où rien ne court.

**Ce qui ne suit PAS l'emprise, et pourquoi.** Deux exceptions, écrites dans le
code :

- le **ballast**, pour la raison ci-dessus ;
- les **repères de quartier** (`landmarkPush`). Un tram, une poutre de monorail,
  une tour ne sont pas occultés par la gare : ils sont REGARDÉS depuis elle. Les
  ranger derrière une passerelle de trente mètres mettrait le tram d'Ōtsuka et
  le monorail de Hamamatsuchō hors de portée du regard, ce qui est le contraire
  de leur raison d'être.

**Le dossier ne part pas dans le paquet.** Brancher `stationOcclusion` sur les
profils faisait entrer cent trente kio de relevé dans le bundle du jeu
(+102 kio bruts sur le morceau `Game`) pour en tirer cent vingt nombres. La
portée est donc **matérialisée en table générée** (`npm run data:reach`), avec
un test qui la recalcule depuis les profils et tombe si elle a dérivé — la même
discipline que le carnet de relevé. Coût réel : **+1,8 kio**.

### 4.5 Ce que la phase 7 a livré, et ce qu'elle a trouvé

**Le compilateur existe, et les trente relevés passent dedans.** Un profil
devient un RÉSEAU : des pièces (rectangle, sol, plafond, payant ou libre,
foulée ou seulement regardée), des liens qui les joignent avec l'altitude de
leurs deux bouts, des lignes de portillons dont il tire les bornes et les baies,
et des bouches percées dans une paroi.

**G2 est sorti.** Une bouche ne s'ouvre plus « au fond, vers +z » : elle s'ouvre
face au contrôle qui alimente la zone libre. Dans un hall longitudinal cela
redonne exactement l'ancien comportement — Kanda garde son fond ; dans une
passerelle transversale cela la met sur un flanc, ce qui est le seul endroit où
elle peut être. Tokyo ouvre sur ses deux flancs et jamais au fond.

**R4 aussi.** Nippori n'est plus un cas spécial : `bespoke: true` disait « ne
construis rien, la charpente EST le niveau ». Le relevé le dit en donnée
ordinaire — quatre pièces `overbridge` au 2F — et neuf autres gares ont la même
forme sans avoir jamais eu besoin d'un drapeau.

**Le repli est de première classe.** Une gare non branchée passe par
`interiorFor` et son hall est enveloppé dans la même structure : mêmes
rectangles, mêmes bornes, mêmes baies, même mobilier, au rectangle près. Les
consommateurs n'auront donc jamais deux chemins à connaître — c'est la condition
pour basculer les trente gares une par une (phases 20 à 24).

**`PROFILE_STATIONS` est VIDE, et ce n'est pas un oubli.** Un profil compilé n'a
encore ni mobilier, ni archétype de rendu, ni signalétique : l'échanger contre
le hall meublé serait un recul. La phase 7 livre le moteur, pas la bascule.

**Ce que le compilateur a trouvé, et il ne le tait pas.** `networkIssues` dit ce
que la géométrie a refusé au relevé, plutôt que de le noyer dans un `Math.min` :

> **Dix-huit lignes de portillons ne tiennent pas ce qu'on leur demande, et
> toutes pour la même raison.** Elles sont posées EN TRAVERS DE LA BANDE DU QUAI
> (`cross: 'z'`), qui fait de 5,3 m à 6,7 m. Une baie coûte 0,98 m avec ses
> bornes : un hall large comme un quai ne tient pas plus de quatre ou cinq
> baies, et le relevé en demande jusqu'à neuf (Shimbashi 南改札).

C'est **le dernier reste de G1**, et il ne se corrige pas au compilateur : les
vrais halls de Kanda ou de Shimbashi sont larges comme le VIADUC, pas comme le
quai. Les élargir vers le fond est le travail de la **phase 14** — la phase 6 a
établi que le décor sait s'écarter. En attendant, l'écart est nommé, et la liste
des dix-huit est fermée par un test.

Onze gares sont concernées : Kanda (2), Akihabara (3), Okachimachi,
Nishi-Nippori, Takadanobaba, Shin-Ōkubo (2), Yoyogi, Ebisu, Gotanda,
Hamamatsuchō, Shimbashi (2), Yūrakuchō (2).

### 4.6 La phase 8 : le relevé touche le jeu pour la première fois

Quatre phases sans consommateur — format, sources, profils, portée — puis le
compilateur. La phase 8 branche le premier lecteur : **`concourseFloorAt`
interroge le réseau**, et c'est elle qui décide où le joueur pose le pied, où la
foule marche, et où `systems/concourseRoute` accepte de tracer un itinéraire.

`StationPlacement` porte donc `network` à côté d'`interior`, et le partage est
net : ce qui lit le **sol** passe par le réseau, ce qui lit le **mobilier** et le
**dessin** continue de lire `interior` jusqu'aux archétypes de rendu
(phases 13 à 19).

**Rien n'a changé, et c'est vérifié point par point.** Aucune gare n'étant
branchée sur son relevé, le réseau est l'enveloppe du hall générique. Un test
rejoue l'ancienne implémentation mot pour mot et compare les deux sur plus de
trente mille points répartis sur les trente halls : même sol, même `null`, au
centimètre.

**Ce que le réseau sait faire en plus**, et qui ne se voit encore sur aucune
gare :

- **N pièces à N altitudes.** Deux relevés ont déjà deux sols praticables
  différents — le demi-niveau M2F d'Okachimachi, et les deux ensembles de
  Harajuku, séparés de près de douze mètres verticaux ;
- **M liens verticaux** (`joinFloorAt`). Un ouvrage praticable est du sol comme
  un autre, et son altitude s'interpole entre ses deux bouts. Le hall générique
  n'en a aucun : c'est exactement le constat S1 ;
- **des bouches sur n'importe quelle paroi**, et non plus au fond vers +z.

Deux pièges trouvés en chemin, tous deux dans la même famille — *croire que la
forme dit le sens* :

1. **la travée des portillons est du SOL.** L'ancien hall allait d'un trait de
   la zone payante à la zone libre, la ligne au milieu ; deux pièces séparées
   laissaient un vide de 1,70 m au droit du contrôle, et l'on ne pouvait plus le
   franchir. Ce sont les BORNES qui barrent, pas la ligne ;
2. **la pente d'un lien suit l'axe qui SÉPARE les deux pièces**, pas la longueur
   de son rectangle. La volée de la mezzanine d'Okachimachi fait 5,60 m de large
   pour 1 m de long, et descend dans le sens du mètre.

**L'étage reste binaire** (`'platform' | 'concourse'`), et ce n'est pas un
oubli : ce couple ne compte pas les niveaux, il tranche la seule ambiguïté qu'il
y ait — suis-je sur la dalle, ou dessous ? Une fois dessous, c'est la PIÈCE qui
dit à quelle hauteur.

**Le paquet n'a pas grossi** (676,8 kio). La liste des gares branchées vit dans
un fichier à part (`data/stationConcourseWired`) qui, tant qu'il est vide,
n'importe pas le dossier — l'élagage fait le reste. Le jour où la première gare
est branchée, les cent trente kio arrivent, et ils arrivent parce qu'ils
SERVENT.

### 4.7 La phase 9 : un ouvrage de liaison est du sol

La phase 8 avait donné au réseau le droit de dire « telle pièce, telle
altitude » ; la marche, elle, ne connaissait encore que les pièces. La phase 9
lui apprend les **ouvrages** : une volée intérieure, une mécanique, une rampe
sont du sol comme un autre, et leur altitude s'interpole entre leurs deux bouts.

Trois lecteurs y passent, et c'est voulu qu'ils y passent ensemble : le joueur
(`systems/walkable`, `concourseFloorY`), la foule (`walkerBlocked`) et le
placement des voyageurs. Un ouvrage praticable pour l'un et bloquant pour
l'autre aurait fait marcher la foule dans le vide à côté du joueur.

**Le geste que cela rend possible**, et qu'aucun hall générique ne produirait :
à Okachimachi, on arrive du quai sur le demi-niveau M2F, on le traverse, on
descend au hall. Sans lui, la mezzanine serait un plancher qu'on ne peut pas
quitter — et la foule buterait sur un mur invisible d'un mètre.

**Ce qui barre continue de barrer.** Une borne de portillon plantée au pied
d'une volée ne devient pas franchissable parce qu'on descend : les obstacles
sont testés avant les ouvrages.

**Et la marche des trente gares n'a pas changé** — vérifié, pas supposé.
`walkerBlocked` est ce qui tient la foule dans le hall, et une régression y
serait invisible jusqu'à ce qu'un voyageur traverse un mur : un test le
reconstruit à la main, sans le réseau, sur toute la surface des trente halls.

Reste ouvert, et c'est la **phase 12** : on entre encore dans la gare par UNE
seule trémie. Les ouvrages font changer d'altitude *à l'intérieur* du niveau de
correspondance ; passer du quai au hall reste le privilège de l'accès principal.

### 4.8 La phase 10 : un rang de baie qui traverse les groupes

`systems/fareGate` tient un état par baie — battants, voyant, verdict, minuterie
— dans un tableau indexé par un rang. Ce rang ne connaissait qu'une ligne
(constat S2). Une gare en a jusqu'à quatre, et c'est même **ce qui la rend
reconnaissable** : le 北口 et le 南口 d'Uguisudani ne sont pas deux moitiés d'une
même ligne, ce sont deux gares en miniature.

`concourseBays(net)` enfile donc toutes les baies franchissables de la gare,
groupe après groupe, en un seul rang. Pour une gare à une seule ligne, ce sont
**exactement** les mêmes rangs qu'avant, dans le même ordre — vérifié sur les
trente.

**Quatre endroits posaient la même question de quatre façons** — la marche du
joueur, la foule, le son du mécanisme, la boucle des battants — et chacun
relisait la géométrie de la ligne à sa manière, avec `it.gate.z0`, `p.x`,
`width / 2`. Elle est posée une fois, dans `bayAt(net, x, z, slack)` :

- l'axe qu'on **franchit** porte l'écart à la ligne (`gap`) ;
- l'autre porte le **fuseau** latéral — on se présente à une baie en la visant,
  pas en s'y alignant au centimètre ;
- `gap` vaut zéro **entre les bornes**, et c'est ce qui fait qu'un portillon ne
  pince personne : il attend d'être libre.

**La généralisation qui compte** : une ligne qu'on franchit en `x` égrène ses
baies en `z`. Le hall générique ne connaissait que l'inverse, et n'avait donc
jamais eu à le dire. Takanawa Gateway — seule gare du relevé dont les **deux**
contrôles sont franchissables — s'en sert déjà.

Et deux faits du relevé arrivent maintenant jusqu'au portillon lui-même :
`icOnly` et `exitOnly`. La bretelle à sens unique de Shin-Ōkubo est réservée à
la carte sans contact ; le Marunouchi central de Tokyo aussi. `fareGate` ne les
lit pas encore — c'est un fait de jeu, pas de géométrie, et il ira avec la
signalétique (phase 18) — mais ils ne se perdent plus en chemin.

### 4.9 La phase 11 : l'axe ne se devine pas, il se lit sur la destination

`systems/concourseRoute` supposait l'axe. `hallAxis` balayait en x entre
`paid.x0` et `paid.x1` au droit d'un z ; `paidLegs` et `freeLegs` marchaient en
z, d'un bout à l'autre d'un couloir droit avec la ligne au milieu (constat S3).
Trois choses en sortent :

- **l'axe.** Un trajet de zone payante va vers une ligne de portillons : il suit
  donc l'axe qu'on la **franchit** (`GateGroup.cross`). Un trajet de zone libre
  va vers une bouche : il suit l'axe de la **paroi** qu'elle perce
  (`ConcourseMouth.side`). C'est la même leçon qu'à la phase 8, où la pente
  d'une volée ne se déduisait pas de la forme de son rectangle — *la géométrie
  ne dit pas où l'on va, la destination si* ;
- **le choix de groupe.** `pickPassage` tire dans le rang plat des baies
  (phase 10), qui traverse les lignes : choisir une baie, c'est du même coup
  choisir un contrôle. Une bretelle à sens unique pèse moitié moins, sans
  s'exclure ;
- **le choix de sortie.** `pickExit` tire dans les bouches du réseau et pose son
  point au-dessus de la volée, du bon côté de la paroi percée.

`hallAxis` mesure désormais la bande libre **à l'intérieur d'une pièce**, en
travers de l'axe qu'on longe — c'était `paid.x0 / paid.x1` tant qu'il n'y avait
qu'un hall — et saute **toutes** les lignes de portillons, plus seulement la
première.

**Ce qui se voit** : à Takanawa Gateway — hall d'une pièce qu'on franchit en x,
deux contrôles à ses deux bouts, bouches sur un flanc — les itinéraires
traversent la gare **en travers**, et les deux groupes se remplissent tous les
deux. Un test tire trois cents trajets pour le vérifier, et cent autres pour
s'assurer qu'aucun pas ne sort du sol.

**Et les trente gares n'ont pas bougé** : les neuf tests d'itinéraire de
`stationInside` — dont « du quai à la rue, on ne traverse rien », qui vérifie
chaque pas contre `walkerBlocked` — passent inchangés.

Au passage, le routeur ne lit plus `interior` du tout : mobilier, obstacles et
boutiques viennent du réseau. C'est ce qui rendra le branchement d'une gare
inoffensif — sans cela, une gare branchée aurait cherché ses distributeurs aux
cotes de son ancien hall.

### 4.10 La phase 12 : plusieurs trémies mènent quelque part

`mainStair` — la trémie la plus proche du milieu du quai — était la seule à
conduire au niveau de correspondance ; toutes les autres restaient des couloirs
borgnes de cinq marches (constat G3). C'est juste pour vingt-huit gares. Ce ne
l'est pas pour **Harajuku**, dont les deux ensembles sont si petits que l'un ne
suffirait pas à faire une gare, ni pour **Uguisudani**, dont les deux halls sont
à des bouts opposés *et* de part et d'autre des voies.

Le réseau porte donc ses **accès** (`ConcourseAccess`), et `StationPlacement`
les apparie avec les trémies réellement posées : le profil ne pose pas de cote
de quai, il pose un **rang**. Ce rang se compte **par nature** — les trémies
entre elles, les mécaniques entre elles, l'ascenseur seul — parce qu'un rang
global changerait de sens dès qu'une gare perd son ascenseur.

Quatre lecteurs y passent, et il fallait qu'ils y passent ensemble :

| Lecteur | Ce qui change |
|---|---|
| `stationLevels.mainAccessFloor` | parcourt **tous** les accès vivants, chacun avec son sens |
| `three/station/Stairwell` | ouvre en grand **toute** trémie qui mène quelque part |
| `concourseRoute` | entre et sort par la volée qui donne sur **sa** zone payante |
| `pickPassage` | une baie qu'aucun accès ne dessert n'est pas à prendre |

**Ce qui se voit à Harajuku** : deux accès, l'un qui descend sous la voie vers
le souterrain de Takeshita, l'autre qui monte au bâtiment de 2020 — douze mètres
entre les deux sols, et aucun couloir entre eux. Un test tire deux cents trajets
et vérifie que chacun entre par la bonne volée, et que les deux ensembles
servent : sans cela, la moitié de la gare serait morte.

**Et les vingt-huit autres n'ont pas bougé** : un accès vivant, et c'est le
principal.

**Ce qui reste, et qui est du rendu** : une seconde volée MONTANTE n'a pas
encore son ouvrage. La première l'a (`risingMain`, le tablier qui perce
l'auvent) ; la seconde attend les archétypes de hauteur (phase 15). Rien n'est
visible aujourd'hui — aucune gare n'est branchée — mais c'est la première chose
à faire avant de brancher Harajuku.

### 4.11 La phase 13 : le rendu part du réseau

`Station` appelait `Concourse` **une fois**, avec l'intérieur de la gare, et
`Concourse` enveloppait une boîte : sol, plafond, deux parois, un fond percé,
une ligne de portillons. C'était le constat R1 — un composant unique qui ne sait
dessiner qu'un couloir droit.

`ConcourseNetwork` prend sa place. Il ne dessine rien lui-même : il lit le
réseau, en tire les **volumes continus**, et confie chacun à son archétype.

**Pourquoi des volumes, et non des pièces.** Une pièce n'est pas une salle
fermée : la zone payante et la zone libre partagent un sol, un plafond et deux
parois. Les envelopper séparément poserait deux murs au droit du contrôle, là où
il n'y a qu'un passage. `shellsOf` regroupe donc les pièces qui se touchent,
directement ou par une ligne de portillons franchissable :

| Gare | Volumes |
|---|---|
| les trente halls génériques | **1**, aux cotes d'avant au centimètre |
| JY19 Harajuku | **2** — le souterrain de Takeshita, le bâtiment de 2020 |
| JY04 Okachimachi | **2** — le hall, et sa mezzanine M2F |

**Un seul archétype aujourd'hui**, et c'est voulu : `Concourse`, le hall
longitudinal, celui qui existe. Il ne lit plus `interior` que pour son
**mobilier** — le meuble viendra au réseau en phase 19 ; toute sa géométrie vient
du volume. Les phases 14 à 16 ajouteront les autres, et c'est dans
`ConcourseNetwork`, et nulle part ailleurs, qu'on choisira lequel.

**Comment on sait que rien n'a bougé.** Un test compare l'enveloppe du volume
aux cotes de l'ancien hall sur les trente gares — même rectangle, même sol, même
plafond, mêmes bouches, dans le même ordre. Et surtout, la **sonde de volumes**
du dépôt (`__stationProbe`, qui lit le graphe de scène tel qu'il est rendu et
rapporte les paires qui s'interpénètrent) a été passée sur les trente gares
**avant et après** : les deux sorties sont **identiques octet pour octet**,
502 paires de part et d'autre, aucune erreur de page. Un refactor de rendu qu'on
ne peut pas regarder méritait mieux qu'un test numérique.

### 4.12 La phase 14 : ce qui distingue trois halls, c'est la couverture

Un hall de gare japonaise est presque toujours un parallélépipède : deux
parois, un sol, un plafond, une ligne de portillons en travers. Ce n'est pas la
FORME qui les distingue — c'est ce qu'il y a au-dessus de la tête.

| Archétype | Couverture | Gares du relevé |
|---|---|---|
| `linear` | dalle lisse et basse : ce qui la porte est dans la terre | le hall d'avant, et les trente aujourd'hui |
| `underViaduct` | **pas de plafond** : les poutres du tablier, serrées, avec leurs retombées | Kanda, Akihabara, Okachimachi, Ōtsuka, Takadanobaba, Ebisu, Gotanda, Shimbashi, Yūrakuchō |
| `compact` | plus basse et surtout plus NUE : ce qui le caractérise est ce qu'il n'a pas | Uguisudani, Nishi-Nippori, Mejiro, Shin-Ōkubo, Yoyogi, Meguro, Harajuku |

C'est délibérément une **table**, et non trois composants : trois composants qui
recopieraient chacun un sol, deux parois et un fond auraient divergé à la
première correction, et l'on aurait passé le reste du chantier à réparer le
troisième.

`linear` **reproduit exactement** le hall d'avant — les trois cotes qui étaient
des constantes de `Concourse` sont dans la table, aux mêmes valeurs, et un test
les tient. Une cote qui dériverait ferait bouger trente halls sans erreur, sans
test rouge, sans que rien ne le dise.

Les quatre autres formes du vocabulaire — pont-concourse, hall transversal,
mezzanine, tranche de grande gare — retombent sur `linear` et attendent la
**phase 15** : elles ne se distinguent pas par leur couverture mais par leur
HAUTEUR et par ce qu'on voit dessous, ce qui ne tient pas dans une table.

**Une note de la phase 7 est corrigée ici.** J'y écrivais que l'élargissement
des halls longitudinaux — les dix-huit lignes de portillons trop serrées pour
leurs baies — était le travail de la phase 14. C'est faux, et pour une raison
que la phase 6 rend visible : `stationOcclusion` lit la portée du RELEVÉ, pas de
ce qui est bâti. Élargir un hall que personne ne construit ferait reculer la
nappe de rue de onze gares au-dessus d'un vide. L'élargissement va donc **avec
le branchement** (phases 20 à 24), gare par gare, quand il y aura un hall pour
occuper la place.

### 4.13 La phase 15 : ce que le volume laisse voir

Les trois halls de la phase 14 se distinguaient par leur **couverture**. Les
quatre qui restaient se distinguent par autre chose, et c'est une différence de
nature : **ce qu'ils laissent voir**.

- **`overbridge`** — les longues parois s'arrêtent à hauteur d'appui (1,10 m,
  la cote d'un garde-corps de quai), avec sa main courante, et rien au-dessus.
  Ce n'est pas un parti de rendu : c'est un fait de relevé, écrit dans les mêmes
  mots à Nippori, Tabata, Komagome, Sugamo, Meguro, Ōsaki, Shinagawa, Tamachi et
  Takanawa Gateway — « le pont-concourse enjambe tout le faisceau : on voit les
  voies dessous ». L'enfermer entre deux parois pleines lui retirerait
  exactement ce pour quoi il existe ;
- **`mezzanine`** — un demi-niveau **sans plafond**, ouvert sur celui d'en
  dessous. Tout son intérêt tient dans ce qu'on voit du hall avant d'y
  descendre : « elle donne à cette petite gare une coupe à trois niveaux
  qu'aucun hall générique ne produirait » (Okachimachi) ;
- **`cross`** et **`hubSlice`** — un volume plus grand n'est pas un couloir
  garni plus serré : la lumière s'espace, le soubassement monte.

Le soubassement de faïence disparaît là où il y a un appui : il est déjà à
cette hauteur, et le doubler ferait un bourrelet.

### 4.14 La phase 16 : ce qui ferme le monde jouable doit le DIRE

Le périmètre visitable est étroit et assumé. Tout le reste de la gare continue,
et le joueur doit le comprendre sans y aller. `Depiction` est le vocabulaire
fermé de cette limite ; la phase 16 en dessine deux formes que rien ne montrait
(constat D7) :

- **la correspondance.** Ce qui compte est sa DIRECTION — qu'on comprenne, depuis
  le hall, que le Ginza est en l'air et le Chiyoda tout en bas — et la couleur
  de ses lignes, seule chose qu'un voyageur qui ne lit pas le japonais ait
  besoin de voir. Neuf gares ont en plus une **ligne de contrôle entre
  exploitants** : elle porte ses bornes, parce qu'on y franchit un 改札 sans
  repasser en zone libre ;
- **le chantier.** Sept gares en ont un que le plan délimite. Une gare en travaux
  n'est pas une gare abîmée, c'est une gare AUTRE : la palissade est pleine
  hauteur et opaque, avec sa bande jaune à hauteur d'œil. Ce qu'il y a derrière
  n'est pas « pas encore fait », c'est fermé.

Le réseau porte donc `transfers` et `hoardings`. **Rien ne s'affiche sur les
trente gares** : le hall générique n'en connaît aucune, et son réseau les rend
vides — c'est exactement ce que D7 constatait.

### 4.15 La phase 17 : on ne dessine pas ce qu'aucun mur ne laisse voir

Tant qu'une gare tenait dans un seul volume, il n'y avait rien à cacher : le
hall était la gare. Depuis la phase 13 une gare est un RÉSEAU de volumes — le
relevé en donne jusqu'à cinq — et les dessiner tous en permanence est à la fois
faux et coûteux. Faux, parce qu'un souterrain de Harajuku ne voit pas le hall du
bâtiment de 2020 qui est à trente mètres et derrière un mur ; coûteux, parce que
R2 constatait déjà que le hall se dessine même quand on est sur le quai.

`visibleShells(net, inConcourse, x, z)` tranche, et sa règle tient en quatre
lignes :

- **une gare à un seul volume ne cache jamais rien.** C'est le cas des trente
  gares aujourd'hui, et le test le tient : la phase 17 ne doit rien changer à
  l'écran tant qu'aucun relevé n'est branché ;
- **depuis le quai**, on montre les volumes qu'un accès vivant DESSERT. Sans
  cela le bas d'une trémie serait un trou noir — on descend vers rien ;
- **ce qu'une volée joint se voit.** Une mezzanine sans plafond est un
  demi-niveau OUVERT sur le hall d'en dessous (Okachimachi) : la masquer parce
  qu'elle est à une autre altitude détruirait la seule chose qui la rend
  intéressante ;
- **sinon, même niveau et 40 m.** Au-delà, un volume qui n'est ni joint ni
  proche est derrière quelque chose.

C'est de l'occlusion par la TOPOLOGIE, pas par un test de visibilité : le
réseau sait déjà ce qui touche quoi, et un portail géométrique aurait demandé
une donnée que le relevé ne contient pas.

### 4.16 La phase 18 : une gare ne doit dire qu'une seule chose

Une potence de quai annonce 東口 ; on descend, on traverse le hall, et la bouche
du fond porte 中央口. Ce n'est pas une laideur, c'est un MENSONGE — le panneau
qu'on a suivi ne menait pas là — et il ne venait d'aucune négligence de dessin
mais d'une négligence de SOURCE. Six endroits nommaient la même gare, chacun en
allant chercher sa donnée tout seul : la potence et le fond de trémie relisaient
`stationExits`, le bandeau de contrôle lisait `SPECS`, la bouche repassait par un
`slot`, le totem de quai refaisait le même calcul une quatrième fois, et le
fléchage suspendu ne lisait rien du tout — quatre panneaux à des cotes écrites
en dur.

Tant qu'une gare était un couloir droit avec deux bouches, les six tombaient
d'accord par accident. Le réseau supprime l'accident : une gare peut avoir cinq
bouches, trois lignes de portillons, deux volumes.

`data/stationSignage` est la source unique. Elle lit le RÉSEAU — donc la gare
telle qu'elle est construite, et non telle qu'un tableau la décrit — et rend les
chaînes que les textures affichent ; le rendu ne va plus chercher un nom, on le
lui donne. Deux règles tiennent tout :

1. **on ne nomme que ce qu'on peut atteindre.** Une sortie du relevé que le hall
   ne perce pas n'apparaît sur aucun panneau. C'est la seule façon qu'une flèche
   ne mente pas ;
2. **le nom vient de la bouche.** Le réseau le porte dès qu'un relevé est
   branché ; sinon on retombe sur le rang de la sortie dans `data/lines`, ce que
   faisait déjà le hall générique.

Trois choses en sortent au passage :

- **le bandeau de contrôle dit ce qui CHANGE CE QU'ON PEUT Y FAIRE** — carte sans
  contact seule, sortie seule, horaires. C'est écrit en rouge sur les vraies
  façades de JR East, et pour cette raison exactement : un voyageur avec un
  billet papier doit le savoir avant d'être devant la borne. Le relevé porte ces
  mentions depuis la phase 5 et rien ne les affichait ;
- **le fléchage suspendu se pose sur l'axe qu'on TRAVERSE**, lu du volume et de
  sa ligne de portillons. Un pont-concourse, qu'on franchit selon x, recevait
  quatre panneaux plantés en travers de sa propre circulation ;
- **les panneaux d'une même paroi ne s'intervertissent plus** : les textures
  étaient construites dans l'ordre du réseau et posées dans l'ordre des
  percements.

**Les trente gares affichent exactement les mêmes mots qu'avant**, et retrouvent
leurs quatre panneaux aux mêmes cotes : quatorze tests le tiennent, dont la
comparaison mot pour mot avec `stationExits(index)`.

### 4.17 La phase 19 : ce que le hall vend, et ce qu'on a le droit d'en dire

Le hall générique déduit ses commerces de l'AFFLUENCE : un konbini dès 1,2, une
galerie dès qu'une enseigne est déclarée. Le défaut n'est pas qu'il se trompe —
il place plutôt bien — c'est qu'il ne distingue pas ce qu'il SAIT de ce qu'il
SUPPOSE (constat D8). Sept gares déclarent `ecute`/`atre`, dont trois n'ont pas
la place, et rien dans le dessin ne dit laquelle est laquelle.

`ConcourseFrontage` porte la lecture du relevé jusqu'au rendu, et c'est
`CommerceStatus` — une échelle de VÉRITÉ, pas de taille — qui décide de ce que
la devanture écrit :

- `namedVerified` : l'enseigne est sur le plan officiel, on l'écrit ;
- `gallery` : une galerie structurante — `atre vie Sugamo`, `GRANSTA TOKYO`,
  `Dila Osaki`. Elle donne son échelle au hall, et son bandeau est long ;
- `categoryVerified` : on sait que c'est un konbini, pas lequel. Le bandeau
  porte la catégorie, et pas un mot de plus ;
- `generic` et `facade` : bandeau **éclairé et muet**. Un nom plausible serait
  un mensonge et un mur nu serait un oubli ; une devanture anonyme est ce qu'on
  voit vraiment quand on passe devant sans lever les yeux.

Un test tient la règle qui fait toute la valeur du dispositif : **une enseigne
ne s'invente pas** — un statut qui ne dit pas qu'on l'a lue n'a pas le droit
d'en porter une.

Deux décisions de géométrie, et elles ont la même raison : un commerce de gare
BORDE le hall, il ne le bouche pas.

- **le relevé cote une emprise, on montre une devanture.** GRANSTA fait
  quarante-six mètres de long sur huit de fond ; posée telle quelle, elle
  remplissait le niveau d'un bloc plein qu'on ne pouvait pas contourner. La
  devanture est rognée à 3,40 m (3,60 m pour une galerie), cotes publiées depuis
  `data/stationInterior` pour que les deux moteurs ne divergent pas ;
- **elle s'adosse à la paroi la plus proche** et sa vitrine se développe le long
  de celle-ci. Le relevé ne dit pas contre quel mur ; c'est la géométrie qui le
  sait, et une devanture retournée tournerait le dos aux voyageurs.

`networkIssues` gagne `shopEatsAisle` : une devanture qui laisserait moins de
deux mètres de passage se dit au lieu de disparaître dans un `Math.min`. Aucune
des trente et une ne le déclenche.

**Deux constats restent ouverts, et sont épinglés par des tests plutôt que
corrigés en silence :**

- **six devantures sur trente et une ne se dessineront pas encore.** Ce sont les
  galeries que le relevé pose dans une pièce qu'on REGARDE sans y aller —
  GRANSTA depuis le hall de Tokyo, le Seibu depuis Ikebukuro, NEWoMan depuis
  Shinjuku. `Concourse` n'enveloppe que les volumes praticables ; dessiner une
  *vue* est le sujet des phases 22 à 24 ;
- **les trois enseignes non déclarées** (atre vie à Sugamo, deux atre à Gotanda,
  Dila à Ōsaki) restent absentes de `SPECS`. Les y ajouter changerait le hall
  GÉNÉRIQUE de trois gares — un travail que leur branchement (phases 20 à 24)
  jette aussitôt, puisqu'il remplace ce hall. Le relevé les porte déjà.

### 4.18 La phase 20 : huit gares cessent d'être génériques

Dix-neuf phases sans que rien ne change à l'écran — chacune se branchait sur un
hall générique qui restait le même. Huit gares passent maintenant par leur
PROFIL, et c'est la première fois que le relevé décide de ce qu'on voit.

| gare | ce qu'elle gagne |
|---|---|
| JY02 Kanda | le dessous du viaduc, deux contrôles, le Ginza qu'on voit sans le prendre |
| JY06 Uguisudani | **deux halls** à cent mètres l'un de l'autre, dont un sous les voies à −6,40 m |
| JY08 Nishi-Nippori | un pont-concourse, quatre lignes en correspondance, une devanture |
| JY10 Komagome | pont-concourse et hall bas, deux contrôles |
| JY11 Sugamo | la tranchée enjambée, et les **deux blocs d'atre vie** que le dépôt ne déclarait pas |
| JY14 Mejiro | une **mezzanine** : un demi-niveau ouvert, une coupe à trois niveaux |
| JY16 Shin-Ōkubo | pont-concourse et hall bas, deux contrôles |
| JY18 Yoyogi | deux contrôles, trois correspondances |

**Brancher a montré ce qu'aucun test ne voyait**, et c'était le but de commencer
par les petites. Cinq défauts, tous du même genre : du code qui savait
« le » hall et pas « un » hall.

1. **la bouche tirée au sort pouvait être inatteignable.** `pickExit` piochait
   dans toutes les bouches de la gare ; à Uguisudani, un voyageur du hall sud
   partait vers une bouche du hall nord, qu'aucun chemin ne relie. Plus personne
   ne sortait. On ne retient plus que les bouches du VOLUME où le portillon
   débouche ;
2. **le premier pas coupait le coin de la pièce.** L'itinéraire partait du bout
   du hall, en supposant que la trémie y débouche. Un hall qu'on traverse selon
   x a sa trémie sur le côté : la diagonale passait par du vide. La première
   étape part maintenant de l'accès lui-même, et `hallLeg` contourne le mobilier
   sur tout le trajet au lieu d'un tronçon ;
3. **`FareGates` ne dessinait qu'une ligne**, celle du hall générique, à sa
   place à elle. Chaque ligne du réseau est maintenant dessinée dans SON repère
   — longueur en x local, profondeur en z local — et le groupe tourne d'un quart
   de tour quand on la franchit selon x. Même discipline que le repère du quai :
   on écrit une fois, on retourne le bloc. Le lecteur se présente du côté payant,
   quel que soit ce côté ;
4. **le mobilier générique flottait dans un volume qui n'est pas le sien.** Une
   gare branchée reprend le mobilier du moteur — un plan officiel ne cote pas une
   batterie de distributeurs — mais `networkFor` ne garde que ce qui TIENT dans
   ses pièces, à l'écart de ses lignes, de ses vitrines et de ses seuils. Un
   konbini de 3,40 m de fond ne rentre pas dans un pont-concourse : il disparaît
   au lieu de ressortir par la paroi ;
5. **les correspondances sans emprise se rangeaient toutes au même endroit.** Le
   relevé donne leur DIRECTION, rarement leur cote. Elles cherchent maintenant
   la plus longue portion de mur encore libre — bouches, devantures et joues de
   portillon déduites — et le rendu les oriente sur leur mur au lieu d'en
   travers.

**Un arbitrage a été tranché dans le compilateur, et il vaut pour les vingt-deux
gares suivantes : CE QUI EST RELEVÉ PASSE AVANT CE QUI EST COMPOSÉ.** Les
devantures ont des cotes lues sur un plan ; la position des bouches, elle, est
composée — le relevé donne leur nom et leur paroi, pas leur abscisse. Quand les
deux se disputaient une paroi (à Komagome le magasin tombait pile sur les deux
sorties, et le hall n'avait plus d'issue), la première version rognait le
magasin. C'était le mauvais sens : ce sont les bouches qui se rangent ailleurs.

**Ce qui reste, et qui est mesuré.** Sonde sur les trente gares, **aucune erreur
de page**, et le relevé complet des interpénétrations :

| écart | ×  | gares | entre |
|---|---|---|---|
| 0,24 m | 36 | 3 | hall ✕ volée montante |
| 0,24 m | 9 | 3 | hall ✕ travée de quai opposée |
| 0,24 m | 2 | 1 | hall ✕ devanture (Sugamo) |
| 0,12 m | 48 | 22 | hall ✕ portillons — **le fond de référence**, présent avant la phase |
| 0,09 m | 1 | 1 | fléchage ✕ seuil de correspondance (Nishi-Nippori) |

Les deux premières lignes sont les trois ponts-concours branchés — Komagome,
Sugamo, Mejiro. C'est le JOINT entre deux ouvrages qui se touchent réellement,
et non un hall posé dans le vide : le hall enjambe le faisceau, donc il passe
au-dessus de la travée d'en face, et sa paroi rencontre la volée qui y monte. Le
traiter proprement demande de PERCER la paroi du hall au droit de l'accès — ce
qui appartient aux phases de signature (22 à 24) et aux paliers de qualité (25).
Les trois autres lignes sont des frôlements de moins d'un quart de mètre entre
ouvrages voisins.

**Coût :** le dossier de relevé entre dans le paquet, comme prévu — c'est la
première fois qu'il SERT. Le morceau `plateau` passe de 344,0 à 448,0 kio
(115,5 → 136,2 kio compressés) ; le morceau `Game` ne bouge pas.

### 4.19 La phase 21 : douze gares de plus, et ce qu'elles ont cassé

Vingt gares sur trente passent maintenant par leur relevé. Les douze de cette
phase ne demandaient aucun vocabulaire nouveau — c'est ce qui les distingue des
six signatures — mais elles demandaient que TOUT ce qui précède tienne à la
fois, et six choses n'y ont pas résisté.

**Cinq défauts d'itinéraire**, tous de la même famille : le routeur savait
marcher dans un couloir, pas dans une pièce.

1. **la trémie ne débouche pas toujours dans la zone payante.** À Okachimachi
   elle arrive sur une mezzanine, un demi-niveau au-dessus du hall. Chercher un
   accès *attaché* à la zone payante n'en trouvait aucun, et la gare n'avait plus
   d'itinéraire du tout. On suit désormais les volées intérieures — `joinLegs`
   pose une étape par volée franchie, l'altitude s'interpolant toute seule ;
2. **le couloir se tient au MILIEU de la trouée**, et dans une passerelle de
   trente-six mètres ce milieu est à vingt mètres du pied de la volée. On entre
   donc tout droit, puis on rejoint la file ;
3. **le retour d'un détour se reposait sur la trouée la plus large**, à l'autre
   bout du volume — en traversant tout ce qu'il y a entre les deux. On revient
   dans la file qu'on a quittée ;
4. **un crochet allait chercher un meuble à l'autre bout de la gare.** Sur la
   passerelle d'Ōsaki, quatre-vingt-dix mètres de large, un voyageur traversait
   tout le tablier pour regarder un guichet — et à Harajuku, il partait
   consulter un plan dans l'autre hall, à cent mètres et douze mètres plus bas.
   Un crochet est un CROCHET : sept mètres, dans la pièce où l'on est ;
5. **la zone libre commençait « au bout de la pièce »**, ce qui supposait le
   contrôle à l'autre bout. À Harajuku la pièce libre déborde sous la ligne :
   partir du bout renvoyait le voyageur DANS les bornes. On part d'où l'on est.

**Trois défauts de géométrie**, où le relevé et le moteur se contredisaient.

- **la ligne ne touchait pas ses deux pièces.** À Tamachi il restait trente
  centimètres entre le contrôle et la zone libre — trente centimètres qui
  n'appartenaient à rien et sur lesquels la marche butait comme sur un mur. Une
  ligne s'étire maintenant jusqu'à ses deux pièces : un franchissement est
  continu par définition ;
- **et elle ne doit pas les déborder.** Toujours à Tamachi, le contrôle sud est
  coté dix mètres pour une zone payante qui s'arrête six mètres plus tôt : ses
  dernières baies s'ouvraient sur du vide. Elle est ramenée à ce que les deux
  pièces ont en commun. Là où il n'y a RIEN de commun — Ikebukuro sud, Shibuya
  Hachikō — le compilateur ne la déplace pas (ce serait décider à la place du
  relevé) et signale `gateOffRoom` ;
- **deux vitrines qui se font face ne partagent pas un hall de six mètres.**
  Gotanda a deux atre de trois mètres de fond, une par paroi : posées telles
  quelles, elles fermaient la zone libre d'un mur à l'autre et les sorties
  devenaient inatteignables. Chaque devanture est rognée sur ce qui reste, et
  celle qui ne tient plus disparaît en le disant (`shopDropped` : Gotanda,
  Yūrakuchō).

**Le mobilier générique a dû apprendre à vivre chez les autres.** Il est rangé
contre les parois du hall générique, à 2,13 m et 7,63 m de l'axe de la voie ; un
pont-concourse relevé fait vingt-huit mètres de large, et le même meuble laissé
à sa cote se retrouvait planté au milieu. Il est donc ramené contre la paroi
qu'il regarde, glissé le long d'elle jusqu'à trouver sa place, et tenu à l'écart
des lignes de portillons (1,20 m) et des bouches (2,50 m). Ce qui ne rentre pas
disparaît : une gare branchée porte moins de meubles qu'un hall générique, et
deux konbini sur les trente n'ont plus la place — le hall du relevé est plus
court que celui du moteur.

**DEUX GARES SONT DIFFÉRÉES, et c'est une décision.** Une volée de quai a une
hauteur fixe : 3,675 m vers le bas, 5,075 m vers le haut. Or Okachimachi fait
déboucher sa trémie sur une mezzanine à mi-hauteur (−1,84 m) et Harajuku sur le
souterrain de Takeshita, qui passe sous les voies (−6,40 m). Dans les deux cas
la volée ne rejoint pas le sol qu'elle dessert : il y aurait une marche d'un
mètre quatre-vingt au pied de l'escalier. Rendre la volée réglable touche
l'ouvrage lui-même — géométrie, rendu, marche — et c'est le sujet des phases de
signature, où Shinjuku et Shibuya le demanderont de toute façon. **Brancher
avant serait poser une gare juste sur un escalier faux.**

**Contrôle.** Sonde sur les trente gares, **aucune erreur de page**. Les
interpénétrations restantes sont des joints entre ouvrages voisins, de 8 à
44 cm : hall contre volée montante ou travée opposée sur les ponts-concours
(le percement de la paroi au droit de l'accès appartient aux phases 22 à 25),
hall contre devanture, fléchage contre seuil. Le fond de 0,12 m entre le hall
et ses portillons est antérieur au chantier.

La sonde a aussi signalé, sur dix-neuf gares, un « carré d'un mètre dans le
wagon » qui n'existait pas : c'est la géométrie de BASE d'une nuée instanciée —
pluie, neige — dont la boîte englobante est à l'origine du monde et ne dit rien
de l'endroit où les instances tombent. La sonde les ignore désormais, et le dit.

### 4.20 La phase 22 : trois gares dont le hall EST le sujet

Vingt-trois gares sur trente passent par leur relevé, et **Nippori cesse d'être
un cas spécial**. Le hall générique refusait de se bâtir chez elle
(`bespoke: true`) pour ne pas empiler un second pont-concourse dans le premier :
la bonne décision, prise faute de pouvoir dire mieux. Son relevé le dit en
donnée ordinaire — deux ponts au 2F, et le niveau EXISTE. C'était le constat R4,
et **les trente gares ont maintenant un intérieur où descendre**.

**`interiors/Landmarks` répond à R3.** Les quatorze signatures existantes
dessinent ce qu'on voit DEPUIS LE QUAI ; il n'y avait rien pour l'intérieur. Le
relevé note quarante repères en sept catégories, et ils ont une particularité
qui commande tout : **aucun n'a d'emprise cotée**. Un plan officiel ne cote pas
une horloge — il l'écrit. Trois catégories se posent donc sans rien inventer :

- **`clock`** — le 三角時計 de Shinagawa, seule horloge nommée du relevé, à côté
  du Central Gate parce que c'est LE point de rendez-vous de la gare. Suspendue,
  deux cadrans, lisible des deux côtés du hall ;
- **`artwork`** — le panneau, contre la paroi la plus longue ;
- **`column`** — la file de poteaux qui fait le lieu.

Et **quatre se taisent, exprès** : `ceiling` et `material` ne sont pas des
objets mais des qualités du volume — « la grande toiture pliée, douze mètres
plus haut », « acier blanc, cèdre clair, verre » — qui appartiennent à la
hauteur libre du relevé et à la palette ; `trackView` est déjà dessiné par
l'archétype `overbridge` et son appui à 1,10 m ; `void` demande une trémie dans
le plancher, donc une emprise, et c'est précisément ce que le relevé ne donne
pas. **Un repère qu'on ne sait pas dessiner ne se dessine pas
approximativement.**

**Ce que Shinagawa a appris au compilateur.** Le chantier d'août 2026 barre
trente et un mètres de sa zone payante, juste devant le contrôle central : les
baies, centrées sur la ligne, se retrouvaient toutes derrière la palissade et la
gare n'avait plus un seul passage atteignable. Trois règles en sont sorties, et
elles valent pour les sept gares restantes :

1. **une palissade ferme les baies qu'elle masque.** Le relevé cote la
   palissade, la position des baies est composée : c'est elle qui se déplace, et
   ce qui reste de la ligne devient une joue pleine ;
2. **une baie qu'on ne peut pas atteindre n'est pas une baie ouverte.** Les
   itinéraires vérifient le dégagement devant chaque passage avant de le
   choisir ;
3. **une ligne qu'on ne franchit pas est un MUR.** Le contrôle de Shiodome à
   Shimbashi, qu'on regarde sans le prendre, était traité comme n'importe quel
   contrôle par le choix de file : le couloir se calait entre deux de ses bornes
   et s'y cognait.

**Et une passe de relecture, `weave`.** Tout ce qui précède choisit des files et
anticipe les obstacles ; cela suffit dans un couloir, pas toujours dans une gare
branchée. La passe relit le tracé comme la marche le parcourra — segment par
segment, au pas de trente centimètres — et là où un segment traverse, elle
essaie les deux chemins en équerre, puis un vrai crochet : s'écarter, longer,
revenir. C'est ce que fait un piéton devant un obstacle qu'il n'avait pas vu.
Elle ne remplace pas le choix de file : une file bien choisie ne produit aucune
équerre, et c'est le cas de la quasi-totalité des trajets.

**Contrôle.** Sonde sur les trente gares, **aucune erreur de page**. Ce qui
reste est de l'ordre du joint entre ouvrages voisins — de 6 à 24 cm — et le
fond de 0,12 m entre le hall et ses portillons est antérieur au chantier. Les
deux repères nouvellement dessinés (poteaux, horloge) ont été rognés jusqu'à ne
plus toucher leur dalle : un fût qui pénètre son plafond se lit comme un défaut,
et la sonde le compte comme tel.

### Ordre et raison

- **1→5 ne touchent aucun consommateur.** Le jeu tourne à l'identique pendant
  cinq phases, ce qui laisse le relevé s'installer sans risque.
- **6 était la phase critique**, et elle est passée : l'emprise s'élargit
  proprement côté fond de quai, jamais côté voie. Aucun hall transversal ne
  tombe ; six d'entre eux descendent d'un niveau. Voir §4.4.
- **7→12 branchent les systèmes** en gardant le fallback : une gare sans profil
  se comporte exactement comme aujourd'hui.
- **13→19 sont le rendu**, et chacune se voit à l'écran.
- **20→24 sont les trente gares**, petites d'abord — c'est là qu'on valide le
  système avec le moins à perdre.
- **25→28 ferment** : coût, contrôle, documentation.

---

## 5. Limite du monde jouable — principe retenu

Le joueur ne parcourt jamais la gare réelle. Pour chaque station, on construit :
le quai existant, un ou plusieurs accès verticaux réellement visibles, le
cheminement principal, la zone payante principale, au moins un groupe réel de
portillons, une portion représentative de la zone libre, les premières marches
des sorties, les commerces immédiatement visibles, et les embranchements
nécessaires à comprendre la topologie.

Tout le reste est **représenté, pas visitable**, par un vocabulaire fini :
couloir secondaire court, virage aveugle, escalier disparaissant derrière un
plafond, porte de correspondance, perspective éclairée ou sombre, fond
simplifié, portail d'occlusion, panneau nommant la destination, barrière liée à
des travaux.

**La limite ne doit jamais être un mur invisible incompréhensible.** C'est déjà
la règle du dépôt pour les bouches de sortie (`Barrier`, maille rouge) et pour
les abouts de quai ; elle s'étend telle quelle.

---

## 6. Ce que le chantier ne touche pas

Physique du train, horaires, cycle des stations, annonces, mélodies, système de
portes, rame E235, données d'occupation, tronçons de ville, météo, logique des
deux sens. Sauf nécessité technique directement liée au réseau de halls, et
alors elle est dite.
