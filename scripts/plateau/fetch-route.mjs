// Tracé Sugamo → Ōtsuka : data/geo/sugamo-otsuka.geojson
//
// DEUX SOURCES POSSIBLES, jamais mélangées :
//
//   --overpass  interroge l'API Overpass d'OpenStreetMap et extrait la
//               géométrie réelle de la 山手線 entre les deux gares.
//               Résultat sous licence ODbL 1.0 (© les contributeurs
//               OpenStreetMap) — l'attribution est écrite dans le GeoJSON et
//               reprise dans public/world/plateau/LICENSE.md.
//
//   (défaut)    régénère le tracé APPROCHÉ livré avec le dépôt : un arc de
//               cercle calé sur les coordonnées publiées des deux gares. Ce
//               n'est PAS une donnée OSM, ce n'est pas un relevé : c'est une
//               approximation géométrique, explicitement marquée comme telle
//               dans les propriétés du GeoJSON, qui existe pour que le
//               pipeline soit reproductible sans accès réseau.
//
// Usage :
//   node scripts/plateau/fetch-route.mjs                 # arc approché
//   node scripts/plateau/fetch-route.mjs --overpass      # OSM (réseau requis)
//   node scripts/plateau/fetch-route.mjs --out <chemin>

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PLATEAU_CONFIG } from './config.mjs';
import { makeProjector, geodesicDistance } from './lib/geo.mjs';
import { PipelineError, createReporter, runMain } from './lib/log.mjs';

const DEFAULT_OUT = join(PLATEAU_CONFIG.paths.geo, `${PLATEAU_CONFIG.prototype.name}.geojson`);

/**
 * Repères des deux gares (WGS 84 / JGD2011, degrés décimaux).
 * Coordonnées approchées du milieu des quais Yamanote, arrondies à ~10 m.
 */
export const STATION_ANCHORS = {
  sugamo: { lon: 139.7393, lat: 35.73352, name: '巣鴨 Sugamo (JY11)' },
  otsuka: { lon: 139.72855, lat: 35.73147, name: '大塚 Ōtsuka (JY12)' },
};

/**
 * Profil altimétrique approché du tronçon, en hauteur ELLIPSOÏDALE (m), pour
 * rester homogène avec les coordonnées PLATEAU (EPSG:6697).
 *
 * Toshima-ku culmine autour de 30 m d'altitude orthométrique et l'ondulation
 * du géoïde y vaut ~37 m, d'où ~67 m ellipsoïdaux au niveau de la rue. Sugamo
 * est en tranchée (~6 m sous la rue), Ōtsuka au niveau du sol — ce qui est
 * exactement ce que décrit SEGMENTS[10] (`trench`, `opensAtEnd`).
 */
const RAIL_ELEVATION = { start: 61.0, end: 66.5 };

/** Arc de cercle entre deux points, avec un cap de départ et d'arrivée donnés. */
function buildApproximateAlignment() {
  const A = STATION_ANCHORS.sugamo;
  const B = STATION_ANCHORS.otsuka;
  const projector = makeProjector(6677);
  const a = projector.forward(A.lon, A.lat);
  const b = projector.forward(B.lon, B.lat);

  const chordE = b.east - a.east;
  const chordN = b.north - a.north;
  const chord = Math.hypot(chordE, chordN);

  // Le tracé s'écarte de la corde vers le NORD : depuis Sugamo la ligne part
  // franchement à l'ouest, puis s'infléchit vers le sud-ouest à l'approche
  // d'Ōtsuka. Flèche de 60 m sur ~1 km, soit un rayon de courbure ~2 000 m,
  // ordre de grandeur usuel sur la Yamanote.
  const sagitta = 60;
  // Normale à gauche de la corde (sens Sugamo → Ōtsuka, cap ~257°) : elle
  // pointe vers le nord-ouest, côté vers lequel le tracé s'écarte.
  const nx = -chordN / chord;
  const ny = chordE / chord;

  const count = 41;
  const coordinates = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // Parabole : offset nul aux extrémités, maximal au milieu.
    const off = sagitta * 4 * t * (1 - t);
    const east = a.east + chordE * t + nx * off;
    const north = a.north + chordN * t + ny * off;
    const g = projector.inverse(east, north);
    const alt = RAIL_ELEVATION.start + (RAIL_ELEVATION.end - RAIL_ELEVATION.start) * t;
    coordinates.push([
      Math.round(g.lon * 1e7) / 1e7,
      Math.round(g.lat * 1e7) / 1e7,
      Math.round(alt * 100) / 100,
    ]);
  }
  return coordinates;
}

const OVERPASS_ENDPOINT = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

/**
 * Requête Overpass : les voies ferrées de la relation « 山手線 » dans une
 * boîte englobant les deux gares. On récupère la géométrie brute (`out geom`)
 * et on la recoud côté client.
 */
export function overpassQuery() {
  const A = STATION_ANCHORS.sugamo;
  const B = STATION_ANCHORS.otsuka;
  const pad = 0.004;
  const s = Math.min(A.lat, B.lat) - pad;
  const w = Math.min(A.lon, B.lon) - pad;
  const n = Math.max(A.lat, B.lat) + pad;
  const e = Math.max(A.lon, B.lon) + pad;
  return `[out:json][timeout:90];
(
  way["railway"="rail"]["name"~"山手線"](${s},${w},${n},${e});
  way["railway"="rail"]["ref"="JY"](${s},${w},${n},${e});
);
out geom;`;
}

async function fetchFromOverpass(reporter) {
  const query = overpassQuery();
  reporter.step(`Overpass : ${OVERPASS_ENDPOINT}`);
  let res;
  try {
    res = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: query,
      signal: AbortSignal.timeout(PLATEAU_CONFIG.download.timeoutMs),
    });
  } catch (err) {
    throw new PipelineError(
      `Overpass injoignable : ${err.message}`,
      'Relancez sans --overpass pour régénérer le tracé approché livré avec le dépôt, ' +
        'ou définissez OVERPASS_URL vers une instance accessible.',
    );
  }
  if (!res.ok) {
    throw new PipelineError(
      `Overpass a répondu ${res.status} ${res.statusText}.`,
      'Instance saturée ? Réessayez plus tard ou changez OVERPASS_URL.',
    );
  }
  const data = await res.json();
  const ways = (data.elements ?? []).filter((el) => el.type === 'way' && el.geometry?.length > 1);
  if (ways.length === 0) {
    throw new PipelineError(
      'Overpass n\'a renvoyé aucune voie ferrée pour la boîte Sugamo/Ōtsuka.',
      'Les étiquettes OSM ont peut-être changé : vérifiez overpassQuery().',
    );
  }
  reporter.step(`${ways.length} way(s) reçue(s), recouture…`);
  return stitchWays(ways);
}

/**
 * Recoud des `way` OSM en une polyligne continue, puis la restreint au
 * segment Sugamo → Ōtsuka (points les plus proches des deux gares).
 */
export function stitchWays(ways) {
  const segments = ways.map((w) => w.geometry.map((p) => [p.lon, p.lat]));
  const path = segments.shift();
  let progress = true;
  while (segments.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const head = path[0];
      const tail = path[path.length - 1];
      const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
      if (near(tail, seg[0])) path.push(...seg.slice(1));
      else if (near(tail, seg[seg.length - 1])) path.push(...seg.slice(0, -1).reverse());
      else if (near(head, seg[seg.length - 1])) path.unshift(...seg.slice(0, -1));
      else if (near(head, seg[0])) path.unshift(...seg.slice(1).reverse());
      else continue;
      segments.splice(i, 1);
      progress = true;
      break;
    }
  }

  const nearestIndex = (target) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = geodesicDistance(path[i][0], path[i][1], target.lon, target.lat);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  let i0 = nearestIndex(STATION_ANCHORS.sugamo);
  let i1 = nearestIndex(STATION_ANCHORS.otsuka);
  const reversed = i0 > i1;
  if (reversed) [i0, i1] = [i1, i0];
  const slice = path.slice(i0, i1 + 1);
  if (slice.length < 2) {
    throw new PipelineError('Recouture OSM : segment Sugamo→Ōtsuka vide après découpe.');
  }
  const ordered = reversed ? slice.reverse() : slice;
  // OSM ne porte pas d'altitude : on réapplique le profil du tronçon.
  return ordered.map(([lon, lat], i) => {
    const t = i / (ordered.length - 1);
    const alt = RAIL_ELEVATION.start + (RAIL_ELEVATION.end - RAIL_ELEVATION.start) * t;
    return [lon, lat, Math.round(alt * 100) / 100];
  });
}

function lengthOf(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    total += geodesicDistance(
      coordinates[i - 1][0],
      coordinates[i - 1][1],
      coordinates[i][0],
      coordinates[i][1],
    );
  }
  return total;
}

export function makeFeatureCollection(coordinates, source) {
  return {
    type: 'FeatureCollection',
    name: 'yamanote-sugamo-otsuka',
    features: [
      {
        type: 'Feature',
        properties: {
          line: 'JR山手線 / Yamanote Line',
          from: 'Sugamo (JY11)',
          to: 'Ōtsuka (JY12)',
          segment: PLATEAU_CONFIG.prototype.segment,
          direction: 'inner (内回り)',
          altitude: 'ellipsoidal metres (JGD2011 / GRS80), approximate rail head',
          ...source,
          lengthMeters: Math.round(lengthOf(coordinates) * 10) / 10,
          generatedBy: 'scripts/plateau/fetch-route.mjs',
        },
        geometry: { type: 'LineString', coordinates },
      },
    ],
  };
}

const OSM_SOURCE = {
  source: 'OpenStreetMap (Overpass API)',
  license: 'ODbL 1.0',
  attribution: '© les contributeurs OpenStreetMap — https://www.openstreetmap.org/copyright',
  approximate: false,
};

const APPROX_SOURCE = {
  source: 'Approximation géométrique (arc de cercle entre les deux gares)',
  license: 'CC0 — produit par ce dépôt, ne contient aucune donnée tierce',
  attribution: null,
  approximate: true,
  note:
    "Tracé APPROCHÉ, pas un relevé : arc calé sur les coordonnées publiées des quais " +
    "Sugamo et Ōtsuka, flèche de 60 m vers le nord. Régénérer avec --overpass pour " +
    "obtenir la géométrie OSM réelle (ODbL).",
};

await runMain(async () => {
  const args = process.argv.slice(2);
  const useOverpass = args.includes('--overpass');
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : DEFAULT_OUT;
  const reporter = createReporter('fetch-route');

  const coordinates = useOverpass ? await fetchFromOverpass(reporter) : buildApproximateAlignment();
  const fc = makeFeatureCollection(coordinates, useOverpass ? OSM_SOURCE : APPROX_SOURCE);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(fc, null, 2)}\n`);
  reporter.info(
    `${coordinates.length} points, ${fc.features[0].properties.lengthMeters} m → ${out}` +
      (useOverpass ? ' (OSM / ODbL)' : ' (approché)'),
  );
});
