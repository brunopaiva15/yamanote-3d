// Manifeste, licences et rapport de build — les trois fichiers que le jeu et
// le lecteur humain consomment.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASETS, PLATEAU_CONFIG } from '../config.mjs';

export const MANIFEST_VERSION = 1;

export function buildManifest({ chunks, source, route }) {
  const p = PLATEAU_CONFIG.prototype;
  return {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    source,
    prototype: {
      name: p.name,
      from: p.from,
      to: p.to,
      segment: p.segment,
      corridorMeters: p.corridorMeters,
      chunkLengthMeters: p.chunkLengthMeters,
      routeSampleMeters: p.routeSampleMeters,
      distances: { ...PLATEAU_CONFIG.distances },
    },
    coordinateSystem: {
      units: PLATEAU_CONFIG.crs.units,
      east: PLATEAU_CONFIG.crs.east,
      up: PLATEAU_CONFIG.crs.up,
      north: PLATEAU_CONFIG.crs.north,
      projectedEpsg: route?.epsg ?? PLATEAU_CONFIG.crs.projectedEpsg,
      origin: route
        ? { east: route.frame.origin.east, north: route.frame.origin.north, up: route.frame.origin.up }
        : null,
    },
    route: { url: 'world/plateau/route.json', totalLength: route ? route.totalLength : null },
    chunks: chunks.map((c) => ({
      id: c.id,
      segment: c.segment,
      url: c.url,
      startDistance: c.startDistance,
      endDistance: c.endDistance,
      offset: c.offset,
      boundingRadius: c.boundingRadius,
      fileSize: c.fileSize,
      buildings: c.buildings,
      triangles: c.after.triangles,
      vertices: c.after.vertices,
      materials: c.after.materials,
      textures: c.after.textures,
    })),
  };
}

/**
 * Licences. Le fichier distingue explicitement les DONNÉES sources, les
 * transformations, les outils et les attributions dues — parce qu'elles ne
 * relèvent pas de la même licence et qu'un fichier unique « MIT » serait faux.
 */
export function buildLicense({ source, routeProperties }) {
  const dataset = DATASETS['tokyo23ku-2023-citygml'];
  const synthetic = source.kind === 'sample';
  const routeIsOsm = routeProperties?.source?.includes('OpenStreetMap');

  return `# Licences — monde PLATEAU (prototype ${PLATEAU_CONFIG.prototype.from} → ${PLATEAU_CONFIG.prototype.to})

Généré automatiquement par \`npm run world:build:prototype\`.
Ne pas éditer à la main : le fichier est réécrit à chaque build.

## 1. Données sources

### Géométrie des bâtiments

${
  synthetic
    ? `**Ce build n'utilise AUCUNE donnée Project PLATEAU.**

Les GLB de ce dossier proviennent de \`data/plateau-sample/\`, un échantillon
CityGML **synthétique** produit par \`scripts/plateau/make-sample.mjs\`. Aucun
volume ne correspond à un bâtiment réel de Toshima-ku. Le format reproduit le
profil CityGML 2.0 / bldg / LOD1 de PLATEAU, la géométrie est inventée.

- Licence : CC0 1.0 (production de ce dépôt)
- Attribution requise : aucune

Pour produire un monde à partir des données réelles :

    npm run world:build:prototype -- --source dataset --url <URL de la ressource CKAN>

Les licences ci-dessous s'appliqueront alors.`
    : `- Source : ${source.label ?? dataset.label}
- Jeu de données : ${source.dataset ?? dataset.page}
- Licence : ${source.license ?? dataset.license}
- Attribution requise : ${source.attribution ?? dataset.attribution}

Project PLATEAU est un programme du 国土交通省 (MLIT, ministère japonais des
Terres, de l'Infrastructure, des Transports et du Tourisme). Les modèles 3D des
23 arrondissements de Tokyo sont produits avec la 東京都 (préfecture de Tokyo) ;
l'arrondissement concerné par ce tronçon est 豊島区 (Toshima-ku).

⚠️ **Vérifiez la licence du millésime que vous téléchargez.** PLATEAU diffuse
la majorité de ses jeux en CC BY 4.0, mais les conditions et les mentions
d'attribution exactes sont portées par la fiche de chaque ressource sur le
G空間情報センター : ne présumez pas une licence uniforme.`
}

### Tracé de la voie

- Fichier : \`data/geo/${PLATEAU_CONFIG.prototype.name}.geojson\`
- Source déclarée : ${routeProperties?.source ?? 'inconnue'}
- Licence : ${routeProperties?.license ?? 'inconnue'}
${
  routeIsOsm
    ? `- Attribution requise : ${routeProperties.attribution}

  Le tracé est dérivé d'OpenStreetMap, sous **Open Database License (ODbL) 1.0**.
  Toute distribution d'une œuvre dérivée doit citer « © les contributeurs
  OpenStreetMap » et laisser la base dérivée sous ODbL.`
    : `- Attribution requise : aucune (tracé approché produit par ce dépôt)

  Le tracé livré est une **approximation géométrique**, pas un relevé. Pour
  utiliser la géométrie OSM réelle :

      node scripts/plateau/fetch-route.mjs --overpass

  Le résultat est alors sous ODbL 1.0 et l'attribution « © les contributeurs
  OpenStreetMap » devient obligatoire.`
}

## 2. Transformations appliquées

Les fichiers \`.glb\` de ce dossier ne sont pas les données sources : ce sont
des œuvres dérivées obtenues par

1. sélection des bâtiments dans un corridor de ±${PLATEAU_CONFIG.prototype.corridorMeters} m autour de l'axe ;
2. projection en JGD2011 / Japan Plane Rectangular CS IX (EPSG:${PLATEAU_CONFIG.crs.projectedEpsg}) ;
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

${
  synthetic
    ? '- Aucune : ce build ne contient aucune donnée tierce.'
    : `- ${source.attribution ?? dataset.attribution}`
}
${routeIsOsm ? '- © les contributeurs OpenStreetMap (ODbL 1.0)' : ''}
`;
}

export function writeArtifacts({ manifest, license, report }) {
  const dir = PLATEAU_CONFIG.paths.out;
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, 'LICENSE.md'), license);
  writeFileSync(join(dir, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return {
    manifest: join(dir, 'manifest.json'),
    license: join(dir, 'LICENSE.md'),
    report: join(dir, 'build-report.json'),
  };
}

export function readManifest() {
  return JSON.parse(readFileSync(join(PLATEAU_CONFIG.paths.out, 'manifest.json'), 'utf8'));
}
