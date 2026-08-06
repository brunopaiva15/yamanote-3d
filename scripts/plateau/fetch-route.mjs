// Tracé du tronçon du prototype : data/geo/<nom-du-tronçon>.geojson
//
// Le tronçon est choisi dans scripts/plateau/config.mjs (PROTOTYPE_SEGMENTS,
// sélection par PLATEAU_PROTOTYPE) : ce script n'en connaît que les ancrages.
//
// DEUX SOURCES POSSIBLES, jamais mélangées :
//
//   --overpass  interroge l'API Overpass d'OpenStreetMap et extrait la
//               géométrie réelle de la 山手線 entre les deux gares.
//               Résultat sous licence ODbL 1.0 (© les contributeurs
//               OpenStreetMap) - l'attribution est écrite dans le GeoJSON et
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

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PLATEAU_CONFIG } from './config.mjs';
import { makeProjector, geodesicDistance } from './lib/geo.mjs';
import { PipelineError, createReporter, runMain } from './lib/log.mjs';

const PROTO = PLATEAU_CONFIG.prototype;
const DEFAULT_OUT = join(PLATEAU_CONFIG.paths.geo, `${PROTO.name}.geojson`);
const LOOP_FILE = join(PLATEAU_CONFIG.paths.geo, 'yamanote-loop.geojson');

/** Repères des deux gares (JGD2011, degrés décimaux) - voir config.mjs. */
export const STATION_ANCHORS = PROTO.anchors;

/**
 * Profil altimétrique approché du tronçon, en hauteur ELLIPSOÏDALE (m), pour
 * rester homogène avec les coordonnées PLATEAU (EPSG:6697).
 *
 * On décrit le niveau de la RUE aux deux extrémités, puis on en déduit la cote
 * de la voie : `railAboveGround` est positif sur un viaduc, négatif dans une
 * tranchée. C'est le même paramètre qui sert à poser le sol de l'échantillon
 * synthétique, ce qui garantit que les deux ne peuvent pas diverger.
 */
export function railElevation() {
  const g = PROTO.groundElevation;
  return {
    start: g.start + PROTO.railAboveGround,
    end: g.end + PROTO.railAboveGround,
  };
}

const RAIL_ELEVATION = railElevation();

/** Arc de cercle entre les deux gares, bombé de `sagittaMeters`. */
function buildApproximateAlignment() {
  const A = STATION_ANCHORS.from;
  const B = STATION_ANCHORS.to;
  const projector = makeProjector(6677);
  const a = projector.forward(A.lon, A.lat);
  const b = projector.forward(B.lon, B.lat);

  const chordE = b.east - a.east;
  const chordN = b.north - a.north;
  const chord = Math.hypot(chordE, chordN);

  // La Yamanote ne fait pas de ligne droite entre deux gares : on bombe la
  // corde d'une flèche configurée, ce qui donne un rayon de courbure de
  // l'ordre de 2 000 à 5 000 m - l'ordre de grandeur usuel sur la boucle.
  // Le signe choisit le côté ; la normale ci-dessous est celle de GAUCHE dans
  // le sens de marche.
  const sagitta = PROTO.sagittaMeters;
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
  const A = STATION_ANCHORS.from;
  const B = STATION_ANCHORS.to;
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
      `Overpass n'a renvoyé aucune voie ferrée pour la boîte ${PROTO.from}/${PROTO.to}.`,
      'Les étiquettes OSM ont peut-être changé : vérifiez overpassQuery().',
    );
  }
  reporter.step(`${ways.length} way(s) reçue(s), recouture…`);
  return stitchWays(ways);
}

/**
 * Recoud des `way` OSM en une polyligne continue, puis la restreint au
 * tronçon demandé (points les plus proches des deux gares).
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
  let i0 = nearestIndex(STATION_ANCHORS.from);
  let i1 = nearestIndex(STATION_ANCHORS.to);
  const reversed = i0 > i1;
  if (reversed) [i0, i1] = [i1, i0];
  const slice = path.slice(i0, i1 + 1);
  if (slice.length < 2) {
    throw new PipelineError(
      `Recouture OSM : tronçon ${PROTO.from} → ${PROTO.to} vide après découpe.`,
    );
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
    name: `yamanote-${PROTO.name}`,
    features: [
      {
        type: 'Feature',
        properties: {
          line: 'JR山手線 / Yamanote Line',
          from: STATION_ANCHORS.from.name,
          to: STATION_ANCHORS.to.name,
          segment: PROTO.segment,
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
  attribution: '© les contributeurs OpenStreetMap - https://www.openstreetmap.org/copyright',
  approximate: false,
};

const LOOP_SOURCE = {
  source: 'OpenStreetMap (data/geo/yamanote-loop.geojson, relation 5376382)',
  license: 'ODbL 1.0',
  attribution: '© les contributeurs OpenStreetMap - https://www.openstreetmap.org/copyright',
  approximate: false,
  note: 'Tracé découpé depuis la polyligne réelle de la boucle (chantier 1).',
};

const APPROX_SOURCE = {
  source: 'Approximation géométrique (arc de cercle entre les deux gares)',
  license: 'CC0 - produit par ce dépôt, ne contient aucune donnée tierce',
  attribution: null,
  approximate: true,
  note:
    `Tracé APPROCHÉ, pas un relevé : arc calé sur les coordonnées publiées des quais ` +
    `${PROTO.from} et ${PROTO.to}, flèche de ${Math.abs(PROTO.sagittaMeters)} m. ` +
    `Par défaut on découpe yamanote-loop.geojson ; --approx force cet arc ; ` +
    `--overpass interroge Overpass.`,
};

/**
 * Découpe la polyligne réelle de la boucle (chantier 1) entre les deux gares.
 *
 * C'est le défaut : plus besoin d'Overpass pour avoir le vrai tracé, et les
 * trente tronçons de PROTOTYPE_SEGMENTS héritent du même axe.
 */
export function buildFromLoop() {
  if (!existsSync(LOOP_FILE)) {
    throw new PipelineError(
      `data/geo/yamanote-loop.geojson introuvable.`,
      'Lancez « npm run geo:loop » ou passez --approx / --overpass.',
    );
  }
  const doc = JSON.parse(readFileSync(LOOP_FILE, 'utf8'));
  const ring = doc.features[0].geometry.coordinates; // fermé : dernier = premier
  const open = ring.slice(0, -1);
  const fromSt = doc.stations.find((s) => s.index === PROTO.segment);
  const toSt = doc.stations.find((s) => s.index === PROTO.arrivalStation);
  if (!fromSt || !toSt) {
    throw new PipelineError(
      `Gares ${PROTO.segment}→${PROTO.arrivalStation} absentes de yamanote-loop.geojson.`,
    );
  }
  let i0 = fromSt.vertex;
  let i1 = toSt.vertex;
  const slice = [];
  // Sens 内回り : index JY croissant le long de la polyligne.
  let i = i0;
  for (;;) {
    const [lon, lat] = open[i];
    slice.push([lon, lat]);
    if (i === i1) break;
    i = (i + 1) % open.length;
    if (slice.length > open.length + 2) {
      throw new PipelineError(`Découpe de boucle infinie sur ${PROTO.name}.`);
    }
  }
  if (slice.length < 2) {
    throw new PipelineError(`Tronçon ${PROTO.name} vide après découpe de la boucle.`);
  }
  return slice.map(([lon, lat], idx) => {
    const t = idx / (slice.length - 1);
    const alt = RAIL_ELEVATION.start + (RAIL_ELEVATION.end - RAIL_ELEVATION.start) * t;
    return [lon, lat, Math.round(alt * 100) / 100];
  });
}

await runMain(async () => {
  const args = process.argv.slice(2);
  const useOverpass = args.includes('--overpass');
  const useApprox = args.includes('--approx');
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : DEFAULT_OUT;
  const reporter = createReporter('fetch-route');

  let coordinates;
  let source;
  if (useOverpass) {
    coordinates = await fetchFromOverpass(reporter);
    source = OSM_SOURCE;
  } else if (useApprox) {
    coordinates = buildApproximateAlignment();
    source = APPROX_SOURCE;
  } else {
    coordinates = buildFromLoop();
    source = LOOP_SOURCE;
  }
  const fc = makeFeatureCollection(coordinates, source);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(fc, null, 2)}\n`);
  reporter.info(
    `${coordinates.length} points, ${fc.features[0].properties.lengthMeters} m → ${out}` +
      (useOverpass ? ' (OSM / Overpass)' : useApprox ? ' (approché)' : ' (yamanote-loop)'),
  );
});
