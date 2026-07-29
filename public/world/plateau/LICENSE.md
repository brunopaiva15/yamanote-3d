# Licences — monde PLATEAU (prototype Shibuya → Ebisu)

Généré automatiquement par `npm run world:build:prototype`.
Ne pas éditer à la main : le fichier est réécrit à chaque build.

## 1. Données sources

### Géométrie des bâtiments

**Ce build n'utilise AUCUNE donnée Project PLATEAU.**

Les GLB de ce dossier proviennent de `data/plateau-sample/`, un échantillon
CityGML **synthétique** produit par `scripts/plateau/make-sample.mjs`. Aucun
volume ne correspond à un bâtiment réel de Toshima-ku. Le format reproduit le
profil CityGML 2.0 / bldg / LOD1 de PLATEAU, la géométrie est inventée.

- Licence : CC0 1.0 (production de ce dépôt)
- Attribution requise : aucune

Pour produire un monde à partir des données réelles :

    npm run world:build:prototype -- --source dataset --url <URL de la ressource CKAN>

Les licences ci-dessous s'appliqueront alors.

### Tracé de la voie

- Fichier : `data/geo/shibuya-ebisu.geojson`
- Source déclarée : Approximation géométrique (arc de cercle entre les deux gares)
- Licence : CC0 — produit par ce dépôt, ne contient aucune donnée tierce
- Attribution requise : aucune (tracé approché produit par ce dépôt)

  Le tracé livré est une **approximation géométrique**, pas un relevé. Pour
  utiliser la géométrie OSM réelle :

      node scripts/plateau/fetch-route.mjs --overpass

  Le résultat est alors sous ODbL 1.0 et l'attribution « © les contributeurs
  OpenStreetMap » devient obligatoire.

## 2. Transformations appliquées

Les fichiers `.glb` de ce dossier ne sont pas les données sources : ce sont
des œuvres dérivées obtenues par

1. sélection des bâtiments dans un corridor de ±300 m autour de l'axe ;
2. projection en JGD2011 / Japan Plane Rectangular CS IX (EPSG:6677) ;
3. recentrage sur une origine locale, puis sur l'origine de chaque chunk ;
4. triangulation des surfaces, suppression des faces inférieures ;
5. élagage des volumes lointains et minuscules ;
6. indexation, simplification par bande de distance, compression meshopt.

## 3. Outils utilisés

| Outil | Rôle | Licence |
| --- | --- | --- |
| [PLATEAU GIS Converter (nusamai)](https://github.com/Project-PLATEAU/PLATEAU-GIS-Converter) | conversion CityGML (moteur externe, optionnel) | MIT |
| [@gltf-transform/core, /functions, /extensions](https://gltf-transform.dev/) | construction et optimisation des GLB | MIT |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) | simplification et compression | MIT |
| [earcut](https://github.com/mapbox/earcut) | triangulation des polygones | ISC |
| [sharp](https://sharp.pixelplumbing.com/) | recompression des textures | Apache-2.0 |

## 4. Attributions requises dans une publication

- Aucune : ce build ne contient aucune donnée tierce.

