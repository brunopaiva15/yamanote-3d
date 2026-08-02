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
