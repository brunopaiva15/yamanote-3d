# Pipeline PLATEAU → GLB (prototype Shibuya → Ebisu)

Chaîne automatisée qui va des données ouvertes japonaises [Project PLATEAU]
(CityGML 3D des villes du Japon, 国土交通省) à des GLB optimisés affichés dans
Yamanote 3D, sur **un seul tronçon** à la fois — par défaut Shibuya → Ebisu,
`SEGMENTS[19]`, en viaduc.

Le tronçon est un **paramètre**, pas du code : voir
[§ Changer de tronçon](#changer-de-tronçon).

```
CityGML PLATEAU ─► conversion ─► sélection corridor ─► classement par distance
   ─► découpage en chunks ─► recentrage ─► triangulation ─► optimisation
   ─► GLB + manifeste + tracé ─► React Three Fiber
```

> **À lire avant tout : ce dépôt ne contient AUCUNE donnée Project PLATEAU.**
> Le build par défaut tourne sur un échantillon CityGML **synthétique**
> (`data/plateau-sample/`), généré par `scripts/plateau/make-sample.mjs`, dont
> le *format* reproduit fidèlement le profil PLATEAU mais dont la *géométrie*
> est inventée. Le pipeline sait consommer les vraies données — voir
> [§ Travailler sur les données réelles](#travailler-sur-les-données-réelles) —
> mais cette conversion-là n'a pas été exécutée dans l'environnement où le
> prototype a été écrit (pas d'accès réseau vers geospatial.jp).

---

## 1. Prérequis

| Élément | Version | Obligatoire | Rôle |
| --- | --- | --- | --- |
| Node.js | ≥ 22 | oui | tout le pipeline, et `node --test` pour les tests |
| npm install | — | oui | `@gltf-transform/*`, `meshoptimizer`, `earcut`, `sharp`, `fflate` |
| PLATEAU GIS Converter (`nusamai`) | ≥ 1.0 | **non** | conversion CityGML « officielle », y compris les textures LOD2 |
| GDAL (`ogr2ogr`) | — | non | convertisseur alternatif via `--converter custom` |
| Blender | — | **non utilisé** | voir [§ Pourquoi pas Blender](#pourquoi-pas-blender) |

Aucun outil externe n'est nécessaire pour faire tourner le prototype : le
lecteur CityGML intégré prend le relais, avec les limites décrites plus bas.

## 2. Installation des outils externes

### PLATEAU GIS Converter — le convertisseur officiel

C'est le convertisseur CityGML publié par le MLIT (développé par MIERUNE,
licence MIT). Contrairement à ce qu'on lit souvent, **il a bien une CLI** : le
binaire s'appelle `nusamai` et son interface est
`nusamai <fichiers.gml…> --sink <format> --output <chemin> [--epsg N]`
(vérifié dans `nusamai/src/main.rs` du dépôt officiel et dans le §7 de son
README, « CLI のインストール手順 »).

```bash
# Linux x86_64 — depuis https://github.com/MIERUNE/plateau-gis-converter/releases
tar -xzf nusamai-<version>-x86_64-unknown-linux-gnu.tar.gz
sudo install -m 755 nusamai /usr/local/bin/nusamai

# macOS Apple Silicon
tar -xzf nusamai-<version>-aarch64-apple-darwin.tar.gz
xattr -d com.apple.quarantine nusamai
sudo install -m 755 nusamai /usr/local/bin/nusamai
```

Le pipeline le détecte dans le `PATH`, ou via `PLATEAU_CONVERTER_PATH`. S'il
manque et qu'on l'a demandé explicitement, il échoue avec :

```
✖ PLATEAU GIS Converter introuvable.
  Installez-le ou définissez PLATEAU_CONVERTER_PATH.
  …
```

### N'importe quel autre convertisseur

`PLATEAU_CONVERTER_CMD` décrit un gabarit de commande avec les jetons
`{input}`, `{output}` et `{epsg}`. Le pipeline attend en retour du GeoJSON
(`Polygon` / `MultiPolygon` 3D) :

```bash
PLATEAU_CONVERTER_CMD="ogr2ogr -f GeoJSON {output} {input}" \
  npm run world:build:prototype -- --converter custom
```

L'ordre des axes de la sortie (lon/lat ou lat/lon) est **détecté**, pas
supposé : le pipeline regarde dans quelle plage tombent les valeurs, ce qui est
sans ambiguïté au Japon.

## 3. Variables d'environnement

| Variable | Défaut | Effet |
| --- | --- | --- |
| `PLATEAU_PROTOTYPE` | `shibuya-ebisu` | tronçon traité (clé de `PROTOTYPE_SEGMENTS`) |
| `PLATEAU_SAMPLE_DENSITY` | `900` | bâtiments par km pour l'échantillon synthétique |
| `PLATEAU_DATASET_URL` | — | URL de l'archive CityGML à télécharger |
| `PLATEAU_DATASET` | `tokyo23ku-citygml` | identifiant dans `DATASETS` |
| `PLATEAU_SOURCE` | auto | `sample` ou `dataset` |
| `PLATEAU_CONVERTER` | `auto` | `auto`, `builtin`, `nusamai`, `custom` |
| `PLATEAU_CONVERTER_PATH` | — | chemin du binaire `nusamai` |
| `PLATEAU_CONVERTER_CMD` | — | gabarit de commande (`custom`) |
| `PLATEAU_CORRIDOR_M` | `300` | demi-largeur du corridor (m) |
| `PLATEAU_CHUNK_M` | `400` | longueur d'un chunk (m) |
| `PLATEAU_ROUTE_SAMPLE_M` | `8` | pas d'échantillonnage du tracé (m) |
| `PLATEAU_NEAR_M` / `_MEDIUM_M` / `_FAR_M` | `80` / `160` / `300` | bandes de distance |
| `PLATEAU_LOD_NEAR` / `_MEDIUM` / `_FAR` | `1` / `0.6` / `0.35` | ratio de simplification par bande |
| `PLATEAU_LOD_ERROR` | `0.02` | erreur max tolérée (fraction du rayon) |
| `PLATEAU_TEX_MAX` / `_FORMAT` / `_QUALITY` | `2048` / `webp` / `82` | textures |
| `PLATEAU_MAX_AUTO_MB` | `256` | au-delà, `--yes` requis |
| `PLATEAU_HARD_LIMIT_MB` | `8192` | au-delà, `--max-mb` requis |
| `PLATEAU_MAX_CHUNK_KB` | `4096` | un chunk plus lourd fait échouer le build |
| `OVERPASS_URL` | API publique | instance Overpass pour `fetch-route --overpass` |

Toute surcharge entre dans le hash de cache : changer le corridor ou la taille
des chunks **invalide automatiquement** les étapes concernées.

## 4. Commandes disponibles

```bash
npm run world:build:prototype              # tout le pipeline
npm run world:build:prototype -- --dry-run # vérifie, n'exécute rien de coûteux
npm run world:build:prototype -- --force   # ignore le cache
npm run world:build:prototype -- --skip-download --skip-convert

npm run world:route:prototype              # (re)génère data/geo/<tronçon>.geojson
npm run world:route:prototype -- --overpass   # …depuis OpenStreetMap (ODbL)
npm run world:sample:prototype             # (re)génère l'échantillon synthétique
npm run world:download:prototype -- --url <URL>
npm run world:convert:prototype
npm run world:process:prototype
npm run world:optimize:prototype
npm run world:validate:prototype           # relit et valide les livrables
npm run world:check:prototype              # contrôle visuel Playwright + captures

npm test                                   # 60 tests (node --test)
npm run dev                                # puis /?plateau=1
```

`--dry-run` vérifie les outils, imprime la configuration effective, annonce ce
qui serait téléchargé (avec la taille annoncée par le serveur) et la liste des
fichiers qui seraient produits, sans écrire quoi que ce soit.

## 5. Fonctionnement du pipeline

### 5.1 Tracé (`fetch-route.mjs`)

Produit `data/geo/<tronçon>.geojson`, une `LineString` avec altitude.
Deux sources, jamais mélangées :

* `--overpass` : géométrie réelle de la 山手線 extraite d'OpenStreetMap
  (recouture des `way`, découpe entre les deux gares). **ODbL 1.0**, attribution
  obligatoire.
* défaut : un arc de cercle calé sur les coordonnées publiées des deux quais,
  bombé de `sagittaMeters`. Pour Shibuya → Ebisu : 1 515 m, quand JR East
  publie 1,6 km de distance d'exploitation. C'est une **approximation
  assumée**, marquée `"approximate": true` dans les propriétés du GeoJSON.

L'altitude n'est pas saisie à la main : on décrit le niveau de la **rue** aux
deux extrémités (`groundElevation`, en hauteur ellipsoïdale) et la position de
la voie par rapport à elle (`railAboveGround`, positif en viaduc, négatif en
tranchée). Shibuya est un fond de vallée et Ebisu sur le plateau : 59 m → 68 m
de rue, +7,4 m de viaduc, soit 66,4 m → 75,4 m de rail. C'est **le même
paramètre** qui pose le sol de l'échantillon synthétique, ce qui interdit aux
deux de diverger.

### 5.2 Obtention des données (`download.mjs`)

* `--source sample` (défaut) : utilise / régénère l'échantillon synthétique.
* `--source dataset` : télécharge l'archive PLATEAU, avec cache par URL,
  **reprise par `Range`**, `HEAD` préalable pour annoncer la taille, et deux
  garde-fous (`--yes` au-delà de 256 Mo, `--max-mb` au-delà de 8 Go).
* `--zip <fichier>` : réutilise une archive déjà téléchargée.

L'extraction est **sélective et en flux** (`fflate.Unzip`) : seuls les
`udx/bldg/*.gml` sortent de l'archive. Une livraison PLATEAU contient aussi le
MNT, la végétation, le mobilier, les codelists — inutiles ici et volumineux.

### 5.3 Conversion (`convert.mjs`)

Trois moteurs :

| Moteur | Ce qu'il sait faire | Ce qu'il ne sait pas faire |
| --- | --- | --- |
| `nusamai` | tout le profil PLATEAU, textures comprises | — |
| `custom` | ce que fait la commande fournie | — |
| `builtin` | LOD1/LOD2 géométrique, anneaux intérieurs, `BuildingPart` | **apparences et textures**, résolution de `xlink` inter-fichiers, attributs i-UR |

Le lecteur intégré (`lib/citygml.mjs`) n'est pas un bouche-trou symbolique : il
résout les préfixes d'espaces de noms depuis les déclarations `xmlns`, lit
`srsName` (URN ou URL), respecte l'ordre d'axes `lat,lon` d'EPSG:6697, gère
`gml:posList` comme les suites de `gml:pos`, distingue `Building` de
`BuildingPart` et retire les sous-arbres de parties avant de chercher le LOD du
porteur. Il traite ~47 Mo/s. Ses limites sont **explicites** et documentées en
tête de fichier : sur du LOD2 texturé, il rendra la géométrie sans les textures.

La sélection au corridor a lieu **pendant** la conversion : c'est ce qui rend
le traitement d'un jeu de plusieurs gigaoctets tenable, l'intermédiaire ne contenant que les
bâtiments à ±300 m de l'axe. Un bâtiment est retenu si **son point le plus
proche** de l'axe est dans le corridor — pas son centre : une barre de 60 m à
cheval sur la limite reste visible depuis le train.

### 5.4 Découpage, recentrage et export (`process.mjs`)

* **Projection** : EPSG:6697 (géographique) → EPSG:6677 (JGD2011 / Japan Plane
  Rectangular CS IX, la zone officielle de Tokyo). Transverse Mercator par
  série de Krüger, implémentée dans `lib/geo.mjs` — testée par aller-retour au
  millimètre et par comparaison à la distance géodésique de Vincenty.
* **Repère local** : origine au milieu du tracé, arrondie à 10 m. Convention
  three.js du projet : `+X` est, `+Y` hauteur, `-Z` nord, 1 unité = 1 m.
* **Bandes de distance** : `near` ≤ 80 m, `medium` ≤ 160 m, `far` ≤ 300 m,
  au-delà supprimé.
* **Élagage** (`visibleFromTrack`) : on n'écarte que ce qui est à la fois loin
  **et** minuscule (< 60 m² et < 12 m de haut au-delà de 160 m). Aucun calcul
  d'occlusion réel n'est tenté : sans MNT ni géométrie de la tranchée, un test
  de visibilité donnerait une fausse assurance.
* **Affectation à un chunk** : celui qui contient l'abscisse curviligne du
  point du bâtiment le plus proche de la voie. **Aucun bâtiment n'est coupé.**
* **Recentrage** : chaque chunk a sa propre origine (le point du tracé au
  milieu de son intervalle), enregistrée dans `manifest.chunks[].offset`. Les
  sommets restent à ±350 m de zéro.
* **Triangulation** : normale de Newell, rabattement sur l'axe dominant,
  `earcut` avec trous, puis recollement du sens de chaque triangle sur la
  normale du polygone — le pipeline est donc indifférent au sens de rotation
  choisi par le producteur des données.
* **Faces inférieures jetées** : la dalle du bas d'un solide LOD1 est
  invisible depuis la rue et vaut un sixième des triangles d'une boîte.
* **Deux matériaux par chunk** (façade / toiture) ; la variété passe par
  `COLOR_0`, pas par mille matériaux distincts.

### 5.5 Optimisation (`optimize.mjs`)

`dedup()` → `weld()` → `simplifyPrimitive()` par bande → `prune()` →
`textureCompress()` (WebP, sharp) → `meshopt()` → **relecture du GLB écrit**.

Un GLB qui ne se relit pas, ou qui dépasse `PLATEAU_MAX_CHUNK_KB`, fait échouer
le build.

### 5.6 Manifeste et rapport

`public/world/plateau/` reçoit `manifest.json`, `route.json`, `LICENSE.md`,
`build-report.json` et les GLB. Le rapport contient les versions d'outils, les
comptages (fichiers analysés, bâtiments détectés / retenus / écartés), les
tailles avant/après, le détail de simplification par primitive et la durée de
chaque phase.

### 5.7 Affichage (`src/three/PlateauWorld.tsx`)

Le wagon reste à l'origine ; c'est le monde qui bouge :

```ts
trainMatrix.compose(position, rotation, unitScale);
worldMatrix.copy(trainMatrix).invert();
```

La position sur le tracé ne vient **pas** d'une interpolation linéaire en
temps : elle suit la distance réellement parcourue, intégrée avec le profil de
traction/freinage de `systems/trainPhysics` — celui-là même qui pilote la rame.
Sans cela, la ville défilerait à vitesse constante pendant que le train
accélère encore. La distance est rapportée à la distance totale du trajet
simulé, ce qui garantit : **progression 0 = début du tronçon, progression 1 =
fin**, quelle que soit la durée réelle du parcours. Un test le vérifie.

Le composant ne monte qu'une fenêtre glissante de chunks (courant ± 1,
plafonnée à 3), précharge le premier au chargement du manifeste, met
`castShadow`/`receiveShadow` à `false`, garde `frustumCulled` à `true` et
n'alloue rien dans `useFrame` (vecteurs, quaternion et matrices réservés une
fois). Le décor procédural (`CityRibbon`, `Landmarks`) s'efface sur ce tronçon
et **uniquement** sur celui-ci, via `plateauRuntime.coverage`.

## 6. Architecture des dossiers

```
scripts/plateau/
  config.mjs            paramètres centralisés + registre des jeux de données
  fetch-route.mjs       tracé (OSM ou approximation)
  make-sample.mjs       échantillon CityGML synthétique
  download.mjs  convert.mjs  process.mjs  optimize.mjs  validate.mjs  build.mjs
  visual-check.mjs      contrôle Playwright + captures
  lib/
    args.mjs  cache.mjs  log.mjs  run.mjs
    geo.mjs               projection Transverse Mercator, géodésie
    route.mjs             tracé, corridor, chunks
    citygml.mjs           lecteur CityGML intégré
    geometry.mjs          triangulation
    glb.mjs               construction des GLB
    manifest.mjs          manifeste, licences, rapport

data/geo/                 tracé (versionné)
data/plateau-sample/      échantillon synthétique (versionné, ~3 Mo)
.cache/plateau/           téléchargements + marqueurs de cache   ← .gitignore
work/plateau/             extraits, convertis, découpés, optimisés ← .gitignore
public/world/plateau/     livrables (GLB, manifest, route, licences, rapport)

src/systems/plateau.ts        interrupteur + état partagé
src/three/PlateauWorld.tsx    composant R3F
src/three/plateau/routeMath.ts  maths du tracé (module PUR, testé)
src/dev/plateau-probe-main.ts   probe /plateau-probe.html
tests/                        60 tests node:test
```

## 7. Gestion du cache

`.cache/plateau/<étape>.json` porte, par étape, le hash de ses entrées
(paramètres de config concernés + empreinte des fichiers sources) et la liste
des fichiers produits. Une étape est sautée si — et seulement si — le marqueur
existe, le hash correspond et **tous** les fichiers déclarés sont encore là.

```
.cache/plateau/download.json   .cache/plateau/convert.json
.cache/plateau/process.json    .cache/plateau/optimize.json
.cache/plateau/downloads/      archives téléchargées (reprise par Range)
```

`--force` court-circuite tout. `npm run world:build:prototype -- --dry-run`
affiche l'état du cache sans y toucher.

`data/plateau-sample/` n'est pas versionné : il est régénéré à la demande par
`make-sample.mjs`, dont le tirage est déterministe (graine fixe). Partant d'un
dépôt frais, `rm -rf data/plateau-sample .cache work && npm run
world:build:prototype` reproduit les trois GLB **octet pour octet**.

## 8. Licences

Voir `public/world/plateau/LICENSE.md`, **régénéré à chaque build** et qui
distingue quatre choses : les données sources, les transformations appliquées,
les outils utilisés et les attributions obligatoires. Il change de contenu
selon que le build a tourné sur l'échantillon synthétique ou sur des données
PLATEAU réelles, et selon que le tracé vient d'OSM ou de l'approximation.

Points d'attention :

* **PLATEAU** diffuse la plupart de ses jeux en CC BY 4.0, mais les conditions
  et la formule d'attribution exactes sont portées par la fiche de chaque
  ressource sur le G空間情報センター. Ne présumez pas une licence uniforme :
  lisez la fiche du millésime que vous téléchargez.
* **OpenStreetMap** est sous ODbL 1.0 : toute œuvre dérivée doit citer
  « © les contributeurs OpenStreetMap » et la base dérivée reste sous ODbL.
* Les GLB produits sont des **œuvres dérivées** des données sources, pas des
  copies : la licence source continue de s'appliquer.

## 9. Limites connues

### Sur les données

1. **Aucune donnée PLATEAU réelle n'a été convertie.** L'environnement de
   développement n'a pas d'accès réseau vers `geospatial.jp` ni vers
   `overpass-api.de` (le proxy répond 403). Le pipeline de téléchargement et le
   téléchargeur Overpass sont écrits, testés dans leurs branches d'erreur, mais
   la conversion du jeu réel n'a **pas** été exécutée.
2. **Le tracé livré est approché** (arc de cercle entre les deux gares), pas
   relevé. `--overpass` le remplace par la géométrie OSM réelle.
2 bis. **Les URL du portail n'ont pas pu être testées.** Faute de réseau, les
   liens vers `geospatial.jp` de ce dépôt sont ceux qui sont *cités par des
   dépôts officiels de Project PLATEAU*, pas des liens vérifiés en les
   ouvrant. Une première version du pipeline contenait une URL extrapolée
   (`plateau-tokyo23ku-2023`) qui renvoyait un 404 ; elle a été retirée, et
   plus aucune URL de jeu de données n'est codée en dur.
3. **Les hauteurs sont ellipsoïdales**, pas orthométriques. L'ondulation du
   géoïde vaut ~37 m à Tokyo ; elle est constante à l'échelle du kilomètre,
   donc invisible ici puisque tout est recentré sur l'altitude de la voie. Il
   faudrait la traiter (`japan-geoid`) pour mêler ces données à un MNT.
4. **Pas de terrain.** PLATEAU publie un MNT séparé (thème `dem`) que ce
   prototype n'exploite pas : le sol reste celui du décor procédural.

### Sur le rendu

5. **Le type de tronçon décide de ce qu'on voit.** Le prototype a d'abord
   tourné sur Sugamo → Ōtsuka (`SEGMENTS[10]`, en tranchée) : le mur de
   soutènement procédural, haut de cinq mètres, masquait le bas de la ville
   depuis une baie latérale pendant les deux tiers du parcours. C'était fidèle
   à la réalité — on ne voit effectivement rien depuis un train en tranchée —
   mais parfaitement contre-productif pour juger un pipeline. D'où le passage
   à Shibuya → Ebisu (`SEGMENTS[19]`, en viaduc), où le train court sept
   mètres au-dessus de la rue et où le regard passe par-dessus les toits bas.
   Les deux tronçons restent décrits dans `PROTOTYPE_SEGMENTS` : basculer de
   l'un à l'autre est une variable d'environnement. `/plateau-probe.html`
   permet de toute façon de juger la géométrie sans le wagon ni le décor.
6. **Pas de textures.** Le lecteur intégré ignore les apparences CityGML ; et
   de toute façon PLATEAU ne texture que le LOD2, absent du LOD1. Avec
   `nusamai` et un jeu LOD2, la chaîne WebP/redimensionnement est prête et
   s'activera d'elle-même.
7. **La simplification ne mord pas sur du LOD1.** Mesuré, pas supposé : sur les
   façades (prismes droits) meshoptimizer refuse de descendre au ratio demandé
   et rend la géométrie inchangée (`achievedRatio: 1` dans le rapport) ; sur
   les toitures (coplanaires) il atteint exactement la cible. L'allègement réel
   du lointain vient de l'élagage fait en amont. Sur du LOD2 détaillé, la
   simplification aurait de quoi travailler.
8. **Le cache de `useGLTF` ne libère rien.** Voir § suivant.

### Ce que ça coûte, mesuré

Mesures prises dans Chromium (SwiftShader, qualité « high », 960×540), au
milieu du tronçon, regard par la baie latérale, moyennées sur 12 images :

| | prototype actif | prototype coupé | écart |
| --- | --- | --- | --- |
| appels de rendu / image | 864 | 954 | **−9 %** |
| triangles / image | 347 306 | 413 955 | **−16 %** |
| géométries en mémoire | 521 | 825 | −37 % |

Le monde PLATEAU coûte donc **moins** que le ruban urbain procédural qu'il
remplace : ses 13 900 triangles tiennent en 6 primitives et 2 matériaux par
chunk, là où la ville procédurale multiplie les `InstancedMesh`, les acrotères,
les croupes, les bosquets et les enseignes. Le budget de la scène reste dominé
par l'intérieur du wagon, les PNJ et la gare. Ces chiffres viennent d'un rendu
logiciel : les valeurs absolues de temps par image n'ont pas de sens, seul
l'écart entre les colonnes en a.

Poids et contenu par chunk (voir `build-report.json` pour le détail complet) :

| chunk | intervalle | bâtiments | triangles | poids | textures |
| --- | --- | --- | --- | --- | --- |
| `shibuya-ebisu-000` | 0 → 400 m | 361 | 3 685 | 58,4 Ko | 0 |
| `shibuya-ebisu-001` | 400 → 800 m | 354 | 3 681 | 58,5 Ko | 0 |
| `shibuya-ebisu-002` | 800 → 1 200 m | 357 | 3 628 | 57,9 Ko | 0 |
| `shibuya-ebisu-003` | 1 200 → 1 515 m | 284 | 2 906 | 48,3 Ko | 0 |

Total 223 Ko pour 1 515 m de corridor (1 363 bâtiments : 402 proches,
388 intermédiaires, 566 éloignés, 7 élagués), contre 1,7 Mo avant
optimisation — **−87 %**. Mémoire de textures : nulle, faute de textures dans
le LOD1.

### Sur la mémoire

`useGLTF` (drei) mémorise chaque URL dans un cache global qui ne se vide
jamais tout seul : démonter un chunk le retire de la scène, mais géométries,
matériaux et textures restent en mémoire GPU. À l'échelle du prototype
(4 chunks, 223 Ko, ~13 900 triangles) c'est sans conséquence. À l'échelle des
30 tronçons (~120 chunks) il faudra :

1. suivre les chunks montés dans un compteur de références ;
2. à la sortie d'un tronçon, pour chaque chunk dont le compteur retombe à 0 :
   `useGLTF.clear(url)` **puis** parcourir la scène mise en cache pour appeler
   `geometry.dispose()`, `material.dispose()` et `texture.dispose()` — `clear`
   seul ne libère que l'entrée de cache, pas les ressources WebGL ;
3. ou remplacer `useGLTF` par un `GLTFLoader` piloté à la main, avec un cache
   LRU borné (par exemple 8 chunks) et un `dispose()` explicite à l'éviction.

Le prototype garde délibérément la solution simple, et le dit.

## 10. Étendre le pipeline aux 30 tronçons

Le code est déjà paramétré par tronçon ; ce qui manque est la boucle et le
budget. Marche à suivre :

1. **Tracé.** Généraliser `fetch-route.mjs` : une requête Overpass sur la
   relation `山手線` entière, puis découpe aux 30 gares (les nœuds de station
   sont dans OSM). Sortie : `data/geo/<from>-<to>.geojson` × 30.
2. **Configuration.** Remplacer `PLATEAU_CONFIG.prototype` par une **liste** de
   tronçons `{ name, segment, from, to }`. Tous les autres paramètres
   (corridor, chunks, bandes, textures) restent globaux.
3. **Sélection spatiale.** Aujourd'hui `convert.mjs` charge un tracé et filtre
   dessus. Charger les 30 tracés et tester chaque bâtiment contre l'union des
   corridors — avec un index spatial (grille de 200 m) pour ne pas faire
   30 × N projections. C'est le seul endroit qui demande un vrai changement
   d'algorithme.
4. **Données.** Le jeu Tokyo 23 区 couvre toute la boucle et pèse plusieurs
   gigaoctets (taille exacte : voir la fiche du millésime, le pipeline la lit
   par un HEAD avant de télécharger). Il
   est découpé en mailles ; ne convertir que les mailles qui intersectent la
   boîte englobante de la boucle (une trentaine sur plusieurs centaines).
   `download.mjs` extrait déjà sélectivement.
5. **Budget d'assets.** En extrapolant le prototype (147 Ko / km de corridor
   à ±300 m, en LOD1 non texturé), la boucle entière (34,5 km) pèse ~5 Mo.
   C'est tenable. Avec du LOD2 texturé, compter deux ordres de grandeur de
   plus : il faudra alors du chargement à la demande par tronçon, et le
   déchargement décrit au § 9.
6. **Manifeste.** `chunks[]` porte déjà `segment` : un seul manifeste suffit,
   `PlateauWorld` filtrant sur le segment courant. Ajouter un `routes[]`
   indexé par segment au lieu d'un `route.json` unique.
7. **Rendu.** Adapter `plateauCoversSegment()` pour interroger la liste des
   segments couverts. Le reste du composant est déjà générique.
8. **Élévation.** Chaque tronçon a son type (`viaduct`, `trench`, `ground`,
   `corridor`) : le profil altimétrique du tracé doit en tenir compte, sinon
   les viaducs mettront la ville sept mètres trop haut. C'est le point le plus
   délicat, et celui qui gagnerait le plus à utiliser le MNT PLATEAU.

## Changer de tronçon

Le tronçon traité est une entrée de `PROTOTYPE_SEGMENTS`
(`scripts/plateau/config.mjs`). Deux sont livrés :

| clé | segment | type | longueur | pourquoi |
| --- | --- | --- | --- | --- |
| `shibuya-ebisu` *(défaut)* | 19 | viaduc, rail +7,4 m | 1 515 m | on voit la ville par-dessus les toits |
| `sugamo-otsuka` | 10 | tranchée, rail −6 m | 1 008 m | le mur de soutènement masque presque tout |

```bash
PLATEAU_PROTOTYPE=sugamo-otsuka npm run world:route:prototype
PLATEAU_PROTOTYPE=sugamo-otsuka npm run world:build:prototype
# puis aligner le jeu : PLATEAU_SEGMENT = 10 dans src/systems/plateau.ts
```

Le jeu porte le numéro de tronçon dans une constante (`PLATEAU_SEGMENT`,
`src/systems/plateau.ts`) que rien ne relie au pipeline à la compilation. La
**validation compare les deux** et refuse de valider un monde que le jeu
chercherait ailleurs sur la boucle :

```
✖ Le jeu vise le tronçon 10 (PLATEAU_SEGMENT dans src/systems/plateau.ts)
  alors que le monde publié est celui du tronçon 19 (Shibuya → Ebisu).
  Le décor ne s'afficherait jamais : alignez les deux.
```

### Ajouter un tronçon

Une entrée de plus dans `PROTOTYPE_SEGMENTS` suffit :

```js
'yoyogi-harajuku': {
  name: 'yoyogi-harajuku',
  segment: 17,                    // index dans src/data/segments.ts
  from: 'Yoyogi', to: 'Harajuku',
  arrivalStation: 18,             // (arrivalStation + 29) % 30 === segment
  anchors: {
    from: { lon: …, lat: …, name: '代々木 Yoyogi (JY18)' },
    to:   { lon: …, lat: …, name: '原宿 Harajuku (JY19)' },
  },
  sagittaMeters: 40,              // signé : + = bombé vers la gauche
  railAboveGround: 0.5,           // + viaduc, − tranchée (voir SEGMENTS[i].kind)
  groundElevation: { start: 74, end: 76 },  // niveau de la RUE, ellipsoïdal
},
```

Un test (`tests/manifest.test.mjs`) vérifie la cohérence de chaque entrée :
`arrivalStation` doit bien mener au segment déclaré, les ancrages tomber dans
Tokyo, et `railAboveGround` être non nul (un tronçon est en viaduc ou en
tranchée, jamais « au niveau de la voie »).

## Pourquoi pas Blender

Blender aurait été un détour : tout ce dont le pipeline a besoin — dedup,
weld, simplification, compression meshopt, recompression de textures — est
fourni par `@gltf-transform/*`, `meshoptimizer` et `sharp`, **déjà dépendances
du projet**, sans processus externe ni format intermédiaire. Ajouter Blender
aurait coûté une dépendance de plusieurs centaines de mégaoctets, un script
Python et deux conversions de format pour un résultat identique. Il
redeviendrait pertinent pour ce que glTF-Transform ne sait pas faire :
dépliage UV automatique, remaillage, cuisson d'occlusion ambiante.

## Travailler sur les données réelles

> ⚠️ **Le nom court (slug) d'un jeu PLATEAU n'est pas déductible.** La
> convention a changé entre millésimes — `plateau-tokyo23ku-2022` d'un côté,
> `plateau-22203-numazu-shi-2021` de l'autre (deux formes citées par des dépôts
> officiels). Extrapoler la première en `…-2023` donne un 404. Ce dépôt ne
> code donc **aucune** URL de jeu de données en dur : il vous envoie au
> catalogue et attend votre `--url`.

```bash
# 1. Repérer la ressource CityGML sur le G空間情報センター
#    https://www.geospatial.jp/ckan/dataset  (chercher « 3D都市モデル 東京都23区 »)
#    Point de départ attesté (millésime 2022, pas le plus récent) :
#    https://www.geospatial.jp/ckan/dataset/plateau-tokyo23ku-2022
# 2. Vérifier ce qui serait fait, sans rien télécharger
npm run world:build:prototype -- --source dataset --url <URL> --dry-run
# 3. Lancer pour de bon (--yes au-delà de 256 Mo)
npm run world:build:prototype -- --source dataset --url <URL> --yes --converter nusamai
# Ou avec une archive déjà téléchargée :
npm run world:build:prototype -- --zip ~/Téléchargements/13100_tokyo23-ku_2023_citygml.zip
```

Le tracé mérite alors d'être régénéré depuis OSM :

```bash
npm run world:route:prototype -- --overpass
npm run world:build:prototype -- --force …
```

## Vérifier

```bash
npm test                        # 60 tests
npm run world:validate:prototype
npm run world:check:prototype   # Playwright : captures + contrôles en scène
npm run dev                     # /?plateau=1  (démarrage direct sur le tronçon)
                                # /?plateau=0  (prototype coupé)
                                # /plateau-probe.html     (le monde produit, seul)
                                # /plateau-probe.html?s=700&eye=3
```

Dans la console du jeu, en développement : `__plateauProbe()` donne l'état du
monde (chunks montés, abscisse, sommets, distance du bâtiment le plus proche de
l'emprise du wagon) et `__plateauSeek(0.6)` se pose à 60 % du tronçon.

Pour couper complètement le prototype de façon permanente :
`ENABLE_PLATEAU_PROTOTYPE = false` dans `src/systems/plateau.ts`.

[Project PLATEAU]: https://www.mlit.go.jp/plateau/
