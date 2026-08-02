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
| 5 | Profils, données seules | `stationConcourseProfiles.ts` : 30 profils, aucun consommateur | D1→D8 |
| 6 | Emprise déclarée | le profil publie son emprise ; `groundStrip` / `stationOcclusion` la lisent | **G1** |
| 7 | Compilateur de profil | `stationConcourseBuild.ts` : profil → réseau de rectangles ; fallback vers `interiorFor` | G2 R4 |
| 8 | Réseau dans les niveaux | `stationLevels` : N nœuds, M liens verticaux | S1 |
| 9 | Réseau dans la marche | `walkable` lit le réseau ; le joueur change de niveau par n'importe quel lien | S1 |
| 10 | Portillons multiples | `fareGate` : un état par groupe et par passage | S2 |
| 11 | Itinéraires PNJ | `concourseRoute` : axe par nœud, choix de groupe, choix de sortie | S3 |
| 12 | Accès secondaires vivants | plusieurs trémies mènent quelque part | G3 |
| 13 | Rendu : `ConcourseNetwork` | remplace l'appel unique ; dessine nœud par nœud | R1 |
| 14 | Archétypes 1 — halls | `LinearConcourse`, `CompactLocalHall`, `UnderViaductHall` | R1 |
| 15 | Archétypes 2 — hauteur | `OverbridgeHall`, `CrossConcourse`, mezzanines | R1 |
| 16 | Archétypes 3 — limites | `ExitBranch`, `TransferPortal`, `ConstructionPartition` | G4 D7 |
| 17 | Occlusion interne | portails de visibilité aux virages, escaliers, branches | R2 |
| 18 | Signalétique unifiée | une seule source pour quai / hall / portillons / couloirs / bouches | D4 D5 |
| 19 | Commerces | `CommercialFrontage`, quatre statuts de commerce, galeries `ecute`/`atre` | D8 |
| 20 | Petites gares | JY06 JY08 JY10 JY11 JY14 JY16 JY18 JY02 branchées sur profil | — |
| 21 | Gares moyennes | JY04 JY09 JY12 JY15 JY19 JY21 JY22 JY23 JY24 JY27 JY28 JY29 JY30 JY03 | — |
| 22 | Signatures 1 | Takanawa Gateway, Nippori, Shinagawa | R3 |
| 23 | Signatures 2 | Tokyo, Ueno, Ikebukuro | R3 |
| 24 | Signatures 3 | Shinjuku, Shibuya (+ travaux août 2026) | R3 D7 |
| 25 | Paliers de qualité | haute / moyenne / basse, sans jamais retirer une collision | — |
| 26 | Tests | les 18 exigences du cahier des charges | — |
| 27 | Captures de contrôle | probe : 5 vues × 30 gares | — |
| 28 | Perf et bilan | mesures avant/après, `STATION_CONCOURSE_SCOPE.md`, approximations restantes | — |

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

### Ordre et raison

- **1→5 ne touchent aucun consommateur.** Le jeu tourne à l'identique pendant
  cinq phases, ce qui laisse le relevé s'installer sans risque.
- **6 est la phase critique.** Si l'emprise ne peut pas s'élargir proprement,
  tous les halls transversaux tombent, et le chantier se replie sur des halls
  longitudinaux mieux nommés. On le saura tôt.
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
