// Empreintes de bâtiments du corridor 0–1 km, depuis OpenStreetMap.
//
//   node scripts/geo/fetch-footprints.mjs [--force]
//
// Émet :
//   · data/geo/footprints.geojson   centroïde + emprise RÉELLE + hauteur
//   · src/data/footprints.ts        échantillon runtime
//
// Ce ne sont PAS des carrés inventés : chaque emprise vient du contour OSM
// (`out geom`). `footprintMeasured: true` dès qu'on a le polygone.
// Hauteur : étiquette `height` → measured:true ; sinon `building:levels` ou
// modèle statistique par distance à la voie → measured:false.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { parseArgs } from './lib/args.mjs';
import { makeProjector, pickJapanZone } from './lib/geo.mjs';
import { overpass } from './lib/net.mjs';
import { provenance } from './lib/source.mjs';
import { PLATFORMS } from './lib/platforms.mjs';

const REACH = 1000;
/** Demi-portée des tuiles Overpass (m) : un peu plus que REACH pour couvrir. */
const TILE = 1100;
/** Pas le long de la boucle entre deux tuiles (m). */
const TILE_STEP = 1500;
const STOREY = 3.2;

function parseHeight(tags, distance) {
  if (tags?.height) {
    const n = parseFloat(String(tags.height).replace(/,/g, '.'));
    if (Number.isFinite(n) && n > 1 && n < 800) return { h: n, measured: true };
  }
  if (tags?.['building:levels']) {
    const n = parseFloat(String(tags['building:levels']).replace(/,/g, '.'));
    if (Number.isFinite(n) && n > 0 && n < 200) return { h: n * STOREY, measured: false };
  }
  // Modèle statistique : plus bas près de la voie, un peu plus haut au loin.
  const base = distance < 80 ? 9 : distance < 250 ? 14 : 22;
  return { h: base, measured: false };
}

/** Emprise au sol (m) depuis le polygone OSM projeté : max(larg., prof.). */
function plateOf(geom, local) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const g of geom) {
    const p = local(g.lon, g.lat);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const w = maxX - minX;
  const d = maxZ - minZ;
  if (!(w > 0) || !(d > 0)) return null;
  return {
    plate: Math.round(Math.max(w, d) * 10) / 10,
    x: Math.round(((minX + maxX) / 2) * 10) / 10,
    z: Math.round(((minZ + maxZ) / 2) * 10) / 10,
    lon: (geom.reduce((s, g) => s + g.lon, 0) / geom.length),
    lat: (geom.reduce((s, g) => s + g.lat, 0) / geom.length),
  };
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
  const cum = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const perimeter = cum[poly.length];

  // Tuiles le long de la voie : un point tous les TILE_STEP mètres.
  const tiles = [];
  for (let s = 0; s < perimeter; s += TILE_STEP) {
    let lo = 0;
    let hi = poly.length;
    while (lo + 1 < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= s) lo = m;
      else hi = m;
    }
    const [lon, lat] = ring[lo];
    tiles.push({ lon, lat, s });
  }

  process.stdout.write(`Les empreintes du corridor 0–1 km (${tiles.length} tuiles)\n`);
  const byId = new Map();
  let datasetDate = '';
  for (let t = 0; t < tiles.length; t++) {
    const tile = tiles[t];
    const res = await overpass(
      `[out:json][timeout:180];` +
        `way["building"](around:${TILE},${tile.lat.toFixed(5)},${tile.lon.toFixed(5)});` +
        `out geom;`,
      { label: `tuile ${t + 1}/${tiles.length}`, force: args.force },
    );
    for (const e of res.elements ?? []) {
      if (e.timestamp && e.timestamp > datasetDate) datasetDate = e.timestamp;
      if (e.type !== 'way' || !e.geometry || e.geometry.length < 3) continue;
      if (byId.has(e.id)) continue;
      byId.set(e.id, e);
    }
  }

  const stations = loopDoc.stations.map((st) => ({ ...st, ...local(st.stopLon, st.stopLat) }));
  const picked = [];
  let measuredH = 0;
  let estimatedH = 0;
  for (const e of byId.values()) {
    const plate = plateOf(e.geometry, local);
    if (!plate) continue;
    const distance = distanceToLoop(plate.x, plate.z, poly);
    if (distance > REACH) continue;
    const { h, measured } = parseHeight(e.tags, distance);
    if (measured) measuredH++;
    else estimatedH++;
    const station = nearestStation(plate.x, plate.z, stations);
    picked.push({
      id: `osm-way-${e.id}`,
      osmWay: e.id,
      x: plate.x,
      z: plate.z,
      lon: +plate.lon.toFixed(6),
      lat: +plate.lat.toFixed(6),
      height: Math.round(h * 10) / 10,
      measured,
      plate: plate.plate,
      footprintMeasured: true,
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
      'Contours OSM (out geom) des bâtiments à moins de 1000 m de la voie. ' +
      'footprintMeasured:true = emprise tirée du polygone. ' +
      'Hauteur measured:true seulement si étiquette height ; sinon levels ou modèle statistique.',
  });

  mkdirSync(new URL('../../data/geo/', import.meta.url), { recursive: true });

  // Plafond budgétaire 2–3 Mo : toutes les hauteurs OSM, puis LES PLUS PROCHES.
  //
  // Le tri par distance a remplacé un échantillonnage uniforme, et la
  // différence n'est pas cosmétique. L'étiquette `height` d'OpenStreetMap est
  // portée par les grands immeubles ; une échoppe de bord de voie n'en a pas.
  // Garder « toutes les hauteurs relevées + un bâtiment estimé sur quatorze,
  // pris au hasard » revenait donc à vider précisément la bande où la bible est
  // la plus exigeante - le premier kilomètre, et surtout les premières
  // centaines de mètres, celles que le ruban urbain dessine. Le relevé versionné
  // n'avait plus que 759 bâtiments à moins de 66 m de l'axe, sur les 153 924
  // relevés du corridor.
  //
  // On remplit donc ce qui reste du budget par distance croissante à la voie.
  // Aucune hypothèse sur la densité : on prend les plus proches jusqu'à ce que
  // le budget soit plein, et ce qui n'entre pas est ce qu'on voit le moins.
  const measuredList = picked.filter((b) => b.measured);
  const estimatedList = picked
    .filter((b) => !b.measured)
    .sort((a, b) => a.distance - b.distance);
  const BUDGET = 25000;
  const keepEst = Math.max(0, BUDGET - measuredList.length);
  const versioned = [...measuredList, ...estimatedList.slice(0, keepEst)];

  const pack = {
    layer: 'DATA_STATIC',
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    attribution: prov.attribution,
    datasetDate,
    reach: REACH,
    footprintMeasured: true,
    columns: ['osmWay', 'x10', 'z10', 'h10', 'plate10', 'measured', 'distance', 'station', 'lonE6', 'latE6'],
    count: versioned.length,
    survey: picked.length,
    measuredHeights: measuredList.length,
    estimatedHeights: versioned.length - measuredList.length,
    note: prov.note,
    generatedBy: 'scripts/geo/fetch-footprints.mjs',
    rows: versioned.map((b) => [
      b.osmWay,
      Math.round(b.x * 10),
      Math.round(b.z * 10),
      Math.round(b.height * 10),
      Math.round(b.plate * 10),
      b.measured ? 1 : 0,
      b.distance,
      b.station,
      Math.round(b.lon * 1e6),
      Math.round(b.lat * 1e6),
    ]),
  };
  writeFileSync(new URL('../../data/geo/footprints.json', import.meta.url), JSON.stringify(pack), 'utf8');
  writeFileSync(
    new URL('../../data/geo/footprints.geojson', import.meta.url),
    JSON.stringify({
      type: 'FeatureCollection',
      name: 'yamanote-footprints',
      properties: { ...pack, rows: undefined, packedAs: 'data/geo/footprints.json' },
      features: [],
    }),
    'utf8',
  );

  writeFootprintsTs({
    picked: versioned,
    survey: picked.length,
    prov,
    datasetDate,
    measuredH: measuredList.length,
    estimatedH: versioned.length - measuredList.length,
  });
  process.stdout.write(
    `${picked.length} relevés → ${versioned.length} versionnés (≤ ${REACH} m) · polygones OSM · ` +
      `hauteur relevée ${measuredList.length}, estimée ${versioned.length - measuredList.length}\n`,
  );
}

function writeFootprintsTs({ picked, survey, prov, datasetDate, measuredH, estimatedH }) {
  // Pas d'échantillon runtime ici : c'est `scripts/geo/build-corridor.mjs` qui
  // porte au jeu les bâtiments à dessiner, projetés sur la boucle. Ce module-ci
  // ne garde que les COMPTEURS du relevé - ce qui a été vu, ce qui a été
  // versionné - pour que la sonde puisse dire l'écart entre les deux.
  const src = `// Empreintes du corridor 0–1 km : contours OSM, hauteurs déclarées.
//
// GÉNÉRÉ par \`node scripts/geo/fetch-footprints.mjs\` - ne pas éditer à la main.
//
// ${prov.attribution} · ${prov.source}
// Licence ${prov.license} · jeu daté du ${datasetDate} · ${prov.layer}
//
// ${picked.length} bâtiments versionnés (sur ${survey} relevés) à moins de ${REACH} m
// de la voie. Emprise tirée du polygone OSM (\`footprintMeasured: true\`).
// Hauteur relevée pour ${measuredH} d'entre eux, estimée pour ${estimatedH}.
//
// CE MODULE NE PORTE QUE DES COMPTEURS, et c'est volontaire. Le détail vit dans
// data/geo/footprints.json, qui n'est pas empaqueté ; ce que le jeu DESSINE
// vient de src/data/corridor.ts, où \`scripts/geo/build-corridor.mjs\` a projeté
// ces mêmes empreintes sur la boucle. Les chiffres ci-dessous servent à dire
// l'écart entre ce qui a été relevé, ce qui a été versionné et ce qui est posé -
// c'est la sonde \`__probeBible()\` qui les rapproche.

/** Portée du corridor (m). */
export const FOOTPRINT_REACH = ${REACH};

/** Nombre total versionné dans footprints.json. */
export const FOOTPRINT_TOTAL = ${picked.length};

/** Taille du relevé complet avant plafonnage budgétaire. */
export const FOOTPRINT_SURVEY = ${survey};

/** Hauteurs venues d'une étiquette OSM, et hauteurs estimées. */
export const FOOTPRINT_MEASURED = ${measuredH};
export const FOOTPRINT_ESTIMATED = ${estimatedH};
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
