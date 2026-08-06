// Empreintes de bâtiments du corridor 0–1 km, depuis OpenStreetMap.
//
//   node scripts/geo/fetch-footprints.mjs [--force]
//
// Émet :
//   · data/geo/footprints.geojson   centroïdes + emprise + hauteur + provenance
//   · src/data/footprints.ts        ce que le jeu / le pipeline en lit
//
// POURQUOI. La bande 0–1 km de la bible est celle du ruban urbain et de
// PLATEAU. Les GLB complets ne se versionnent pas ; les empreintes, si
// (2–3 Mo). Hauteur PLATEAU quand le build a tourné ; sinon hauteur OSM
// (`height` / `building:levels`) ou modèle statistique, TOUJOURS déclarée
// `measured: false` dès qu'elle n'est pas un relevé d'étiquette.
//
// On part du relevé déjà en cache (bâtiments porteurs d'une hauteur, import
// secteurs) et on ne garde que ceux à moins d'un kilomètre de la voie. Une
// emprise polygonale complète demanderait `out geom` sur cinquante mille
// objets : trop lourd pour Overpass en une passe. On stocke donc le
// centroïde et une emprise carrée déduite de la hauteur (mesurée : false pour
// le plan, true pour la hauteur quand l'étiquette OSM la porte). Le jour où
// un `out geom` tuilé aura tourné, le même fichier portera les vrais contours.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from '../plateau/lib/args.mjs';
import { makeProjector, pickJapanZone } from '../plateau/lib/geo.mjs';
import { overpass } from './lib/net.mjs';
import { provenance } from './lib/source.mjs';
import { PLATFORMS } from './lib/platforms.mjs';

/** Corridor de la bande 0–1 km (m). */
const REACH = 1000;

/**
 * Boîte Overpass : volontairement celle de fetch-sectors (DRAW_MAX + 2000 =
 * 22 km), pour retomber sur le même cache disque et ne pas retaper Overpass.
 * On filtre ensuite à REACH.
 */
const BOX_MARGIN = 22000;

/** Hauteur de plancher pour convertir `building:levels` (m). */
const STOREY = 3.2;

/** Emprise latérale typique déduite de la hauteur (m) - jamais présentée comme relevée. */
function plateFromHeight(h) {
  return Math.max(8, Math.min(42, 6 + h * 0.22));
}

function parseHeight(tags) {
  if (!tags) return { h: null, measured: false };
  if (tags.height) {
    const n = parseFloat(String(tags.height).replace(/,/g, '.'));
    if (Number.isFinite(n) && n > 1 && n < 800) return { h: n, measured: true };
  }
  if (tags['building:levels']) {
    const n = parseFloat(String(tags['building:levels']).replace(/,/g, '.'));
    if (Number.isFinite(n) && n > 0 && n < 200) return { h: n * STOREY, measured: false };
  }
  return { h: null, measured: false };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['force'] });

  const loopDoc = JSON.parse(
    readFileSync(new URL('../../data/geo/yamanote-loop.geojson', import.meta.url), 'utf8'),
  );
  const ring = loopDoc.features[0].geometry.coordinates.slice(0, -1);

  const epsg = pickJapanZone(PLATFORMS[0].lon, PLATFORMS[0].lat);
  const projector = makeProjector(epsg);
  const tokyoStop = loopDoc.stations.find((s) => s.index === 0);
  const origin = projector.forward(tokyoStop.stopLon, tokyoStop.stopLat);
  const local = (lon, lat) => {
    const p = projector.forward(lon, lat);
    return { x: p.east - origin.east, z: -(p.north - origin.north) };
  };

  const poly = ring.map(([lon, lat]) => local(lon, lat));
  const box = boxOf(ring, BOX_MARGIN);

  process.stdout.write('Les empreintes du corridor 0–1 km\n');
  // Même famille de requête que fetch-sectors (hauteurs déclarées) : le cache
  // disque tombe juste, et Overpass n'est pas retapagé pour rien.
  const res = await overpass(
    `[out:json][timeout:900];` +
      `way["building"]["height"](${bbox(box)});` +
      `out center meta;`,
    { label: 'bâtiments à hauteur', force: args.force },
  );

  let datasetDate = '';
  const picked = [];
  let measuredH = 0;
  let estimatedH = 0;
  for (const e of res.elements ?? []) {
    if (e.timestamp && e.timestamp > datasetDate) datasetDate = e.timestamp;
    const c = e.center ?? (e.lat !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!c) continue;
    const p = local(c.lon, c.lat);
    const distance = distanceToLoop(p.x, p.z, poly);
    if (distance > REACH) continue;
    const { h, measured } = parseHeight(e.tags);
    if (h === null) continue;
    if (measured) measuredH++;
    else estimatedH++;
    const plate = plateFromHeight(h);
    const station = nearestStation(p.x, p.z, loopDoc.stations.map((st) => ({ ...st, ...local(st.stopLon, st.stopLat) })));
    picked.push({
      id: `osm-way-${e.id}`,
      osmWay: e.id,
      x: Math.round(p.x * 10) / 10,
      z: Math.round(p.z * 10) / 10,
      lon: c.lon,
      lat: c.lat,
      height: Math.round(h * 10) / 10,
      measured,
      // L'emprise planimétrique est déduite, jamais un contour OSM.
      plate: Math.round(plate * 10) / 10,
      footprintMeasured: false,
      distance: Math.round(distance),
      station: station.index,
    });
  }

  datasetDate = (datasetDate || '2026-08-06').slice(0, 10);
  const prov = provenance({
    source: 'osm',
    datasetDate,
    layer: 'DATA_STATIC',
    measured: false,
    note:
      'Centroïdes OSM des bâtiments porteurs d’une hauteur, à moins de 1000 m de la voie. ' +
      'La hauteur est measured:true quand l’étiquette height est présente ; l’emprise planimétrique ' +
      'est toujours déduite (footprintMeasured:false) tant qu’un out geom tuilé n’a pas tourné.',
  });

  mkdirSync(new URL('../../data/geo/', import.meta.url), { recursive: true });
  writeFileSync(
    new URL('../../data/geo/footprints.geojson', import.meta.url),
    JSON.stringify({
      type: 'FeatureCollection',
      name: 'yamanote-footprints',
      properties: {
        ...prov,
        reach: REACH,
        count: picked.length,
        measuredHeights: measuredH,
        estimatedHeights: estimatedH,
        generatedBy: 'scripts/geo/fetch-footprints.mjs',
      },
      features: picked.map((b) => ({
        type: 'Feature',
        properties: {
          id: b.id,
          osmWay: b.osmWay,
          x: b.x,
          z: b.z,
          height: b.height,
          measured: b.measured,
          plate: b.plate,
          footprintMeasured: false,
          distance: b.distance,
          station: b.station,
        },
        geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
      })),
    }),
    'utf8',
  );

  writeFootprintsTs({ picked, prov, datasetDate, measuredH, estimatedH });
  process.stdout.write(
    `${picked.length} empreintes (≤ ${REACH} m) · hauteur relevée ${measuredH}, estimée ${estimatedH}\n`,
  );
}

function writeFootprintsTs({ picked, prov, datasetDate, measuredH, estimatedH }) {
  // On ne versionne pas les 14k+ points dans le TS du jeu : un échantillon
  // dense suffit aux tests et au runtime ; le GeoJSON porte le relevé complet.
  const TARGET = 4000;
  const STEP = Math.max(1, Math.ceil(picked.length / TARGET));
  const sample = picked.filter((_, i) => i % STEP === 0);
  const src = `// Empreintes du corridor 0–1 km : centroïdes OSM, hauteurs déclarées.
//
// GÉNÉRÉ par \`node scripts/geo/fetch-footprints.mjs\` - ne pas éditer à la main.
//
// ${prov.attribution} · ${prov.source}
// Licence ${prov.license} · jeu daté du ${datasetDate} · ${prov.layer}
//
// ${picked.length} bâtiments à moins de ${REACH} m de la voie
// (${measuredH} hauteurs relevées, ${estimatedH} estimées). L'emprise
// planimétrique est TOUJOURS \`footprintMeasured: false\` tant que le contour
// OSM n'a pas été importé. Le GeoJSON \`data/geo/footprints.geojson\` porte le
// relevé complet ; ce fichier n'en garde qu'un échantillon pour le runtime.

export interface Footprint {
  id: string;
  x: number;
  z: number;
  height: number;
  /** true = étiquette OSM \`height\` ; false = levels ou modèle. */
  measured: boolean;
  /** Côté approximatif de l'empreinte (m) - jamais un contour relevé. */
  plate: number;
  footprintMeasured: false;
  distance: number;
  station: number;
}

/** Portée du corridor (m). */
export const FOOTPRINT_REACH = ${REACH};

export const FOOTPRINTS: readonly Footprint[] = [
${sample
  .map(
    (b) =>
      `  { id: '${b.id}', x: ${b.x}, z: ${b.z}, height: ${b.height}, measured: ${b.measured}, ` +
      `plate: ${b.plate}, footprintMeasured: false, distance: ${b.distance}, station: ${b.station} },`,
  )
  .join('\n')}
];

/** Nombre total dans le GeoJSON (pas seulement l'échantillon runtime). */
export const FOOTPRINT_TOTAL = ${picked.length};
`;
  writeFileSync(new URL('../../src/data/footprints.ts', import.meta.url), src, 'utf8');
}

function nearestStation(x, z, stations) {
  let best = stations[0];
  let bestD = Infinity;
  for (const st of stations) {
    const d = Math.hypot(x - st.x, z - st.z);
    if (d < bestD) {
      bestD = d;
      best = st;
    }
  }
  return best;
}

function boxOf(coords, margin) {
  const b = coords.reduce(
    (acc, [lon, lat]) => ({
      minLon: Math.min(acc.minLon, lon),
      maxLon: Math.max(acc.maxLon, lon),
      minLat: Math.min(acc.minLat, lat),
      maxLat: Math.max(acc.maxLat, lat),
    }),
    { minLon: 180, maxLon: -180, minLat: 90, maxLat: -90 },
  );
  const dLat = margin / 111320;
  const dLon = margin / (111320 * Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180));
  return {
    minLon: b.minLon - dLon,
    maxLon: b.maxLon + dLon,
    minLat: b.minLat - dLat,
    maxLat: b.maxLat + dLat,
  };
}

const bbox = (b) =>
  `${b.minLat.toFixed(5)},${b.minLon.toFixed(5)},${b.maxLat.toFixed(5)},${b.maxLon.toFixed(5)}`;

function distanceToLoop(px, pz, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz;
    let t = l2 === 0 ? 0 : ((px - a.x) * vx + (pz - a.z) * vz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(px - (a.x + t * vx), pz - (a.z + t * vz)));
  }
  return best;
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
