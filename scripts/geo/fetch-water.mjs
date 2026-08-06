// L'eau, depuis OpenStreetMap.
//
//   node scripts/geo/fetch-water.mjs [--force]
//
// Émet deux choses :
//   · data/geo/water.geojson   les traversées, le littoral et l'eau du corridor
//   · src/data/water.ts        ce que le jeu en lit
//
// POURQUOI. Le décor avait trois rivières, écrites dans src/data/segments.ts
// sous la forme d'une FRACTION de tronçon - « river: 0.24 », c'est-à-dire au
// quart du chemin entre Kanda et Akihabara. Deux d'entre elles tombaient à peu
// près juste ; la troisième n'existe pas. La Yamanote ne franchit pas la
// 渋谷川 entre Shibuya et Ebisu : la rivière longe la voie sans la couper, puis
// s'en va vers l'est à Tengenji. C'est exactement ce que la règle 11 de la
// bible interdit - un objet posé parce qu'il ferait bien, et non parce qu'il
// est là.
//
// Ce que dit le relevé, lui : NEUF cours d'eau coupent l'axe des voies, dont
// quatre en souterrain (le 妙正寺川 à Takadanobaba, le 宇田川 à Shibuya, deux
// ruisseaux sans nom) - ceux-là ne se voient pas d'un train et ne sont pas
// posés. Restent SIX traversées à ciel ouvert, dont quatre que le jeu ignorait.
//
// LA BAIE. Elle manquait tout entière. Le littoral s'approche à quatre cent
// vingt-six mètres de la voie à Hamamatsuchō, à un kilomètre à Tamachi et à
// Takanawa Gateway : c'est la seule portion de la boucle d'où l'on voit la mer,
// et c'est un fait de géographie qui se lit sur n'importe quelle carte. Le
// script mesure la distance au trait de côte de chaque côté, tous les quarante
// mètres, et le jeu pose sa nappe d'eau là où elle est vraiment.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from '../plateau/lib/args.mjs';
import { makeProjector, pickJapanZone } from '../plateau/lib/geo.mjs';
import { overpass } from './lib/net.mjs';
import { provenance } from './lib/source.mjs';
import { PLATFORMS } from './lib/platforms.mjs';

/** Marge autour de la boîte de la boucle (m) : de quoi attraper la baie. */
const MARGIN = 4000;

/** Pas d'échantillonnage le long de la voie (m) : la maille du ruban urbain. */
const S_STEP = 40;

/** Demi-largeur du champ d'eau du corridor (m) et son pas. Ceux du relief. */
const LATERAL_REACH = 400;
const LATERAL_STEP = 40;

/** Sous-échantillons par maille, dans chaque sens : une maille est large. */
const SUB = 3;

/** Au-delà, le littoral ne se voit plus d'un train : on ne l'enregistre pas. */
const SHORE_REACH = 3000;

/**
 * Demi-largeur par défaut d'un cours d'eau non cartographié en surface (m).
 *
 * OSM décrit les grandes rivières deux fois - un axe `waterway` et un polygone
 * `natural=water` - mais les petites n'ont que leur axe. La largeur est alors
 * DÉCLARÉE ESTIMÉE (`measured: false`), jamais présentée comme relevée.
 */
const DEFAULT_HALF = { river: 10, canal: 8, stream: 2.5 };

/** Pas du sondage de largeur au droit d'une traversée (m). */
const WIDTH_PROBE = 0.5;

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
  const global = (x, z) => projector.inverse(x + origin.east, -z + origin.north);

  const poly = ring.map(([lon, lat]) => local(lon, lat));
  const cum = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const perimeter = cum[poly.length];
  const rows = Math.round(perimeter / S_STEP);
  const step = perimeter / rows;
  const stations = loopDoc.stations.map((st) => ({ ...st, s: cum[st.vertex] }));

  const at = (s) => {
    const t = ((s % perimeter) + perimeter) % perimeter;
    let lo = 0;
    let hi = poly.length;
    while (lo + 1 < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= t) lo = m;
      else hi = m;
    }
    const a = poly[lo];
    const b = poly[(lo + 1) % poly.length];
    const seg = cum[lo + 1] - cum[lo];
    const k = seg > 1e-6 ? (t - cum[lo]) / seg : 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Tangente, et normale à GAUCHE du sens des index JY croissants.
    return {
      x: a.x + dx * k,
      z: a.z + dz * k,
      tx: dx / len,
      tz: dz / len,
      nx: dz / len,
      nz: -dx / len,
    };
  };

  // --- La requête ------------------------------------------------------------
  const box = ring.reduce(
    (b, [lon, lat]) => ({
      minLon: Math.min(b.minLon, lon),
      maxLon: Math.max(b.maxLon, lon),
      minLat: Math.min(b.minLat, lat),
      maxLat: Math.max(b.maxLat, lat),
    }),
    { minLon: 180, maxLon: -180, minLat: 90, maxLat: -90 },
  );
  const dLat = MARGIN / 111320;
  const dLon = MARGIN / (111320 * Math.cos((((box.minLat + box.maxLat) / 2) * Math.PI) / 180));
  const bbox =
    `${(box.minLat - dLat).toFixed(5)},${(box.minLon - dLon).toFixed(5)},` +
    `${(box.maxLat + dLat).toFixed(5)},${(box.maxLon + dLon).toFixed(5)}`;

  process.stdout.write('L’eau autour de la Yamanote, depuis OpenStreetMap\n');
  const res = await overpass(
    `[out:json][timeout:300];(` +
      `way["waterway"~"^(river|canal|stream)$"](${bbox});` +
      `way["natural"="coastline"](${bbox});` +
      `way["natural"="water"](${bbox});` +
      `way["waterway"="riverbank"](${bbox});` +
      `relation["natural"="water"](${bbox});` +
      // `meta` porte la version et l'horodatage de chaque objet : c'est la date
      // du JEU DE DONNÉES que la règle 10 réclame, et non celle du build.
      `);out geom meta;`,
    { label: 'eau', force: args.force },
  );

  // --- Ce qu'on en tire ------------------------------------------------------
  const areas = [];
  const lines = [];
  const coast = [];
  let datasetDate = '';
  for (const e of res.elements) {
    if (e.timestamp && e.timestamp > datasetDate) datasetDate = e.timestamp;
    const tags = e.tags ?? {};
    if (e.type === 'way' && (tags.natural === 'water' || tags.waterway === 'riverbank')) {
      // Un plan d'eau est un contour FERMÉ. Une ligne ouverte étiquetée `water`
      // est un morceau de multipolygone qui nous revient par ailleurs, ou une
      // erreur de saisie : la refermer à la corde inventerait de l'eau.
      const g = e.geometry;
      if (g?.length > 3 && g[0].lon === g[g.length - 1].lon && g[0].lat === g[g.length - 1].lat) {
        pushArea(areas, g, tags, local);
      }
    } else if (e.type === 'relation' && tags.natural === 'water') {
      // Un multipolygone, et c'est un piège. Ses membres extérieurs ne sont PAS
      // des contours fermés : ce sont des morceaux de contour, à recoudre. La
      // 神田川 est ainsi une seule relation dont l'unique membre extérieur est
      // une polyligne de deux kilomètres et demi ; la refermer telle quelle
      // donne un polygone qui couvre tout Akihabara, et l'on y mesure alors
      // une rivière de cent trente-huit mètres de large.
      for (const ring of stitchRings(e.members ?? [])) pushArea(areas, ring, tags, local);
    } else if (e.type === 'way' && tags.natural === 'coastline') {
      if (e.geometry?.length > 1) coast.push(e.geometry.map((g) => local(g.lon, g.lat)));
    } else if (e.type === 'way' && tags.waterway) {
      if (e.geometry?.length > 1) {
        lines.push({
          id: e.id,
          tags,
          pts: e.geometry.map((g) => local(g.lon, g.lat)),
          // Un cours d'eau en souterrain ne se voit pas d'un train, et la moitié
          // des ruisseaux de Tokyo le sont : le 渋谷川 en amont, le 宇田川 en
          // entier, le 妙正寺川 sous Takadanobaba. Ils restent dans le GeoJSON,
          // marqués, mais ne posent rien à l'écran.
          hidden: Boolean(tags.tunnel || tags.covered === 'yes'),
        });
      }
    }
  }
  datasetDate = datasetDate.slice(0, 10) || new Date().toISOString().slice(0, 10);
  process.stdout.write(
    `  ${lines.length} axes de cours d’eau, ${areas.length} plans d’eau, ` +
      `${coast.length} lignes de littoral · jeu daté du ${datasetDate}\n`,
  );

  const areaIndex = makeIndex(areas, 250);

  // --- Les traversées --------------------------------------------------------
  const crossings = [];
  for (const w of lines) {
    for (let j = 0; j + 1 < w.pts.length; j++) {
      for (let i = 0; i < poly.length; i++) {
        const hit = intersect(poly[i], poly[(i + 1) % poly.length], w.pts[j], w.pts[j + 1]);
        if (!hit) continue;
        const s = cum[i] + hit.t * (cum[i + 1] - cum[i]);
        crossings.push({ s, way: w, x: hit.x, z: hit.z });
      }
    }
  }
  crossings.sort((a, b) => a.s - b.s);

  // Deux tronçons d'un même cours d'eau peuvent se croiser au même endroit -
  // OSM coupe un axe à chaque pont. Une traversée est un LIEU, pas un objet.
  const merged = [];
  for (const c of crossings) {
    const last = merged[merged.length - 1];
    if (last && c.s - last.s < 60 && last.way.tags.name === c.way.tags.name) continue;
    merged.push(c);
  }

  const found = merged.map((c) => {
    const p = at(c.s);
    const probe = measureWidth(c.x, c.z, p, areaIndex);
    const tagged = Number(c.way.tags.width);
    const half = DEFAULT_HALF[c.way.tags.waterway] ?? 5;
    const width = probe ?? (Number.isFinite(tagged) ? tagged : 2 * half);
    const near = nearestStation(c.s, stations, perimeter);
    const leg = legOf(c.s, stations, perimeter);
    const g = global(c.x, c.z);
    return {
      s: round(c.s, 1),
      segment: leg.segment,
      fraction: round(leg.fraction, 4),
      name: c.way.tags.name ?? null,
      nameEn: c.way.tags['name:en'] ?? null,
      waterway: c.way.tags.waterway,
      hidden: c.way.hidden,
      /** Largeur mesurée dans l'axe de la VOIE : c'est la trouée à ouvrir. */
      width: round(width, 1),
      measured: probe !== null,
      lon: round(g.lon, 6),
      lat: round(g.lat, 6),
      x: round(c.x, 1),
      z: round(c.z, 1),
      nearStation: near.name,
      nearStationIndex: near.index,
      metersFromStation: round(near.delta, 0),
      osmWay: c.way.id,
    };
  });
  process.stdout.write(`  ${found.length} traversées, dont ${found.filter((c) => c.hidden).length} en souterrain\n`);
  for (const c of found) {
    process.stdout.write(
      `    ${(c.s / 1000).toFixed(3).padStart(7)} km  ${(c.name ?? '(sans nom)').padEnd(12)} ` +
        `${String(c.width).padStart(5)} m${c.measured ? ' relevés' : ' estimés'}` +
        `${c.hidden ? '  SOUTERRAIN' : ''}  ${c.nearStation}${c.metersFromStation >= 0 ? '+' : ''}${c.metersFromStation}\n`,
    );
  }

  // --- Le champ d'eau du corridor -------------------------------------------
  const cols = 2 * Math.round(LATERAL_REACH / LATERAL_STEP) + 1;
  const half = (cols - 1) / 2;
  const lineIndex = makeLineIndex(
    lines.filter((w) => !w.hidden),
    250,
  );
  const field = new Uint8Array(rows * cols);
  let wet = 0;
  for (let r = 0; r < rows; r++) {
    const p = at(r * step);
    for (let c = 0; c < cols; c++) {
      const d = (c - half) * LATERAL_STEP;
      let hits = 0;
      for (let a = 0; a < SUB; a++) {
        for (let b = 0; b < SUB; b++) {
          const ds = ((a + 0.5) / SUB - 0.5) * step;
          const dl = d + ((b + 0.5) / SUB - 0.5) * LATERAL_STEP;
          const x = p.x + p.tx * ds + p.nx * dl;
          const z = p.z + p.tz * ds + p.nz * dl;
          if (isWater(x, z, areaIndex, lineIndex)) hits++;
        }
      }
      field[r * cols + c] = Math.round((255 * hits) / (SUB * SUB));
      if (hits) wet++;
    }
  }
  process.stdout.write(
    `  champ ${rows} × ${cols} : ${wet} mailles mouillées sur ${rows * cols} ` +
      `(${((100 * wet) / (rows * cols)).toFixed(1)} %)\n`,
  );

  // --- Le littoral, vu de la voie -------------------------------------------
  const coastIndex = makeLineIndex(
    coast.map((pts) => ({ pts, tags: {} })),
    500,
  );
  const shoreLeft = new Int16Array(rows);
  const shoreRight = new Int16Array(rows);
  for (let r = 0; r < rows; r++) {
    const p = at(r * step);
    const near = nearestByside(p, coastIndex, SHORE_REACH);
    shoreLeft[r] = near.left === null ? 0 : Math.round(near.left);
    shoreRight[r] = near.right === null ? 0 : Math.round(near.right);
  }
  const openRows = [...shoreLeft, ...shoreRight].filter((v) => v > 0).length;
  const closest = Math.min(
    ...[...shoreLeft, ...shoreRight].filter((v) => v > 0),
  );
  process.stdout.write(
    `  littoral : visible sur ${openRows} rangées-côtés, au plus près à ${closest} m\n`,
  );

  // --- Écriture --------------------------------------------------------------
  const prov = provenance({ source: 'osm', datasetDate, layer: 'DATA_STATIC' });
  const dir = new URL('../../data/geo/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    new URL('water.geojson', dir),
    `${JSON.stringify(
      {
        type: 'FeatureCollection',
        name: 'yamanote-water',
        properties: {
          ...prov,
          note:
            'Traversées de cours d’eau de l’axe relevé des voies, et distance au ' +
            'trait de côte. Les largeurs marquées measured:true sont mesurées dans ' +
            'l’axe de la voie sur le polygone du plan d’eau ; les autres sont ' +
            'estimées d’après le type de cours d’eau (règle 11).',
          generatedBy: 'scripts/geo/fetch-water.mjs',
          shoreReach: SHORE_REACH,
          fieldRows: rows,
          fieldCols: cols,
        },
        features: found.map((c) => ({
          type: 'Feature',
          properties: c,
          geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        })),
        shore: {
          step: round(step, 3),
          rows,
          left: [...shoreLeft],
          right: [...shoreRight],
        },
      },
      null,
      1,
    )}\n`,
    'utf8',
  );

  writeWater({ found, field, rows, cols, step, shoreLeft, shoreRight, stations, prov, perimeter });
  process.stdout.write('\ndata/geo/water.geojson et src/data/water.ts écrits.\n');
}

// --- Géométrie ---------------------------------------------------------------

/**
 * Recoud les membres extérieurs d'un multipolygone en anneaux fermés.
 *
 * `out geom` ne donne pas les identifiants de nœuds des membres d'une
 * relation : on recoud donc sur la COÏNCIDENCE DES EXTRÉMITÉS, ce qui est sûr
 * ici puisque deux morceaux de contour partagent un nœud, donc exactement la
 * même paire (lon, lat). Un anneau qui ne se referme pas est écarté : c'est un
 * contour incomplet - il déborde de la boîte demandée -, et le refermer à la
 * corde inventerait de l'eau là où il n'y en a pas.
 */
function stitchRings(members) {
  const parts = members
    .filter((m) => m.role === 'outer' && m.geometry?.length > 1)
    .map((m) => m.geometry.filter((g) => g));
  const key = (g) => `${g.lon.toFixed(7)},${g.lat.toFixed(7)}`;
  const rings = [];
  const used = new Set();
  for (let i = 0; i < parts.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let ring = [...parts[i]];
    for (;;) {
      const tail = key(ring[ring.length - 1]);
      let joined = false;
      for (let j = 0; j < parts.length; j++) {
        if (used.has(j)) continue;
        const p = parts[j];
        if (key(p[0]) === tail) {
          ring = ring.concat(p.slice(1));
        } else if (key(p[p.length - 1]) === tail) {
          ring = ring.concat([...p].reverse().slice(1));
        } else {
          continue;
        }
        used.add(j);
        joined = true;
        break;
      }
      if (!joined) break;
    }
    if (ring.length > 3 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function pushArea(out, geom, tags, local) {
  if (!geom || geom.length < 4) return;
  const pts = geom.map((g) => local(g.lon, g.lat));
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  out.push({ pts, minX, maxX, minZ, maxZ, tags });
}

/** Intersection de deux segments `{x, z}`, ou null. */
function intersect(a, b, c, d) {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den;
  const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: a.x + t * rx, z: a.z + t * rz };
}

function inside(poly, x, z) {
  if (x < poly.minX || x > poly.maxX || z < poly.minZ || z > poly.maxZ) return false;
  const pts = poly.pts;
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const zi = pts[i].z;
    const zj = pts[j].z;
    if (zi > z !== zj > z) {
      const t = (z - zi) / (zj - zi);
      if (x < pts[i].x + t * (pts[j].x - pts[i].x)) hit = !hit;
    }
  }
  return hit;
}

/** Grille uniforme sur les boîtes des polygones : le corridor est long. */
function makeIndex(areas, cell) {
  const map = new Map();
  areas.forEach((a, k) => {
    for (let i = Math.floor(a.minX / cell); i <= Math.floor(a.maxX / cell); i++) {
      for (let j = Math.floor(a.minZ / cell); j <= Math.floor(a.maxZ / cell); j++) {
        const key = `${i},${j}`;
        const list = map.get(key);
        if (list) list.push(k);
        else map.set(key, [k]);
      }
    }
  });
  return { areas, cell, map };
}

function areasAt(index, x, z) {
  const key = `${Math.floor(x / index.cell)},${Math.floor(z / index.cell)}`;
  return index.map.get(key) ?? [];
}

/** Le même index, mais sur les segments d'une suite de polylignes. */
function makeLineIndex(ways, cell) {
  const segs = [];
  for (const w of ways) {
    const halfWidth = Number(w.tags?.width)
      ? Number(w.tags.width) / 2
      : (DEFAULT_HALF[w.tags?.waterway] ?? 0);
    for (let i = 0; i + 1 < w.pts.length; i++) {
      segs.push({ a: w.pts[i], b: w.pts[i + 1], halfWidth });
    }
  }
  const map = new Map();
  segs.forEach((s, k) => {
    const minX = Math.min(s.a.x, s.b.x) - s.halfWidth;
    const maxX = Math.max(s.a.x, s.b.x) + s.halfWidth;
    const minZ = Math.min(s.a.z, s.b.z) - s.halfWidth;
    const maxZ = Math.max(s.a.z, s.b.z) + s.halfWidth;
    for (let i = Math.floor(minX / cell); i <= Math.floor(maxX / cell); i++) {
      for (let j = Math.floor(minZ / cell); j <= Math.floor(maxZ / cell); j++) {
        const key = `${i},${j}`;
        const list = map.get(key);
        if (list) list.push(k);
        else map.set(key, [k]);
      }
    }
  });
  return { segs, cell, map };
}

function segmentsAround(index, x, z, reach) {
  const out = new Set();
  const r = Math.ceil(reach / index.cell);
  const i0 = Math.floor(x / index.cell);
  const j0 = Math.floor(z / index.cell);
  for (let i = i0 - r; i <= i0 + r; i++) {
    for (let j = j0 - r; j <= j0 + r; j++) {
      for (const k of index.map.get(`${i},${j}`) ?? []) out.add(k);
    }
  }
  return out;
}

function distanceToSegment(p, a, b) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = a.x + t * vx;
  const qz = a.z + t * vz;
  return { d: Math.hypot(p.x - qx, p.z - qz), qx, qz };
}

/** Y a-t-il de l'eau en (x, z) ? Plan d'eau cartographié, ou axe élargi. */
function isWater(x, z, areaIndex, lineIndex) {
  for (const k of areasAt(areaIndex, x, z)) {
    if (inside(areaIndex.areas[k], x, z)) return true;
  }
  const p = { x, z };
  for (const k of segmentsAround(lineIndex, x, z, 12)) {
    const s = lineIndex.segs[k];
    if (s.halfWidth <= 0) continue;
    if (distanceToSegment(p, s.a, s.b).d <= s.halfWidth) return true;
  }
  return false;
}

/**
 * Largeur d'une traversée, mesurée DANS L'AXE DE LA VOIE.
 *
 * C'est la trouée que le tissu urbain doit ouvrir, et ce n'est pas la largeur
 * de la rivière : une rivière coupée de biais est plus large à traverser. On
 * avance donc pas à pas le long de la tangente, tant qu'on est dans l'eau, des
 * deux côtés du point de croisement. Rend `null` si le point n'est dans aucun
 * plan d'eau - le cours d'eau n'est alors connu que par son axe, et la largeur
 * sera estimée puis déclarée telle.
 */
function measureWidth(x, z, tangent, areaIndex) {
  if (!isInAnyArea(x, z, areaIndex)) return null;
  let back = 0;
  let forth = 0;
  const limit = 400;
  while (
    forth < limit &&
    isInAnyArea(x + tangent.tx * (forth + WIDTH_PROBE), z + tangent.tz * (forth + WIDTH_PROBE), areaIndex)
  ) {
    forth += WIDTH_PROBE;
  }
  while (
    back < limit &&
    isInAnyArea(x - tangent.tx * (back + WIDTH_PROBE), z - tangent.tz * (back + WIDTH_PROBE), areaIndex)
  ) {
    back += WIDTH_PROBE;
  }
  return back + forth + WIDTH_PROBE;
}

function isInAnyArea(x, z, areaIndex) {
  for (const k of areasAt(areaIndex, x, z)) {
    if (inside(areaIndex.areas[k], x, z)) return true;
  }
  return false;
}

/** Distance au littoral, de chaque côté de la voie. */
function nearestByside(p, index, reach) {
  let left = null;
  let right = null;
  for (const k of segmentsAround(index, p.x, p.z, reach)) {
    const s = index.segs[k];
    const { d, qx, qz } = distanceToSegment(p, s.a, s.b);
    if (d > reach) continue;
    const side = (qx - p.x) * p.nx + (qz - p.z) * p.nz;
    if (side >= 0) left = left === null ? d : Math.min(left, d);
    else right = right === null ? d : Math.min(right, d);
  }
  return { left, right };
}

/**
 * L'inter-gare qui porte l'abscisse `s`, et où l'on y est.
 *
 * Le jeu ne connaît pas les abscisses réelles : ses inter-gares sont plus
 * longs que les vrais - la rame y tient quatre-vingt-dix à l'heure -, mais ils
 * gardent leurs proportions. Une traversée s'y reporte donc par sa FRACTION de
 * tronçon, pas par ses mètres, ce qui la laisse exactement entre les mêmes
 * bâtiments. Le tronçon porte le numéro de la gare quittée dans le sens des
 * index croissants, comme src/data/segments.ts.
 */
function legOf(s, stations, perimeter) {
  const sorted = [...stations].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i].s;
    const b = i + 1 < sorted.length ? sorted[i + 1].s : perimeter;
    if (s >= a && s < b) return { segment: sorted[i].index, fraction: (s - a) / (b - a) };
  }
  return { segment: sorted.length - 1, fraction: 0.5 };
}

function nearestStation(s, stations, perimeter) {
  let best = null;
  for (const st of stations) {
    let d = s - st.s;
    if (d > perimeter / 2) d -= perimeter;
    if (d < -perimeter / 2) d += perimeter;
    if (!best || Math.abs(d) < Math.abs(best.delta)) {
      best = { name: st.name, index: st.index, delta: d };
    }
  }
  return best;
}

// --- Le fichier TypeScript ---------------------------------------------------

function writeWater({ found, field, rows, cols, step, shoreLeft, shoreRight, stations, prov, perimeter }) {
  const open = found.filter((c) => !c.hidden);
  const packedField = Buffer.from(field.buffer, field.byteOffset, field.byteLength).toString('base64');
  const shore = new Int16Array(rows * 2);
  for (let r = 0; r < rows; r++) {
    shore[r * 2] = shoreLeft[r];
    shore[r * 2 + 1] = shoreRight[r];
  }
  const packedShore = Buffer.from(shore.buffer, shore.byteOffset, shore.byteLength).toString('base64');
  const nearest = (c) => {
    const st = stations.find((s) => s.index === c.nearStationIndex);
    return `${st.name}${c.metersFromStation >= 0 ? ' +' : ' '}${c.metersFromStation} m`;
  };

  const src = `// L'eau de la Yamanote : ce qu'elle franchit, et où la mer commence.
//
// GÉNÉRÉ par \`node scripts/geo/fetch-water.mjs\` - ne pas éditer à la main.
//
// ${prov.attribution} · ${prov.source}
// Licence ${prov.license} · jeu daté du ${prov.datasetDate} · ${prov.layer}
//
// LES TRAVERSÉES. Le décor en avait trois, écrites en fractions de tronçon dans
// src/data/segments.ts. Deux tombaient à peu près juste ; la troisième
// n'existe pas - la Yamanote ne franchit pas la 渋谷川 entre Shibuya et Ebisu,
// la rivière longe la voie puis s'en va vers l'est à Tengenji. Le relevé en
// donne ${found.length}, dont ${found.length - open.length} en souterrain qu'on ne pose pas : on ne voit pas d'un
// train une rivière qui passe sous la ville.
//
${open
  .map(
    (c) =>
      `//   ${(c.name ?? '(sans nom)').padEnd(6)}  ${nearest(c).padStart(22)}  ` +
      `${String(c.width).padStart(5)} m ${c.measured ? '(relevés)' : '(estimés)'}`,
  )
  .join('\n')}
//
// LA MER. Le trait de côte s'approche à ${Math.min(...[...shoreLeft, ...shoreRight].filter((v) => v > 0))} m de la voie à Hamamatsuchō, et
// reste à portée de vue de Shinagawa à Shimbashi : c'est la seule portion de la
// boucle d'où l'on voit la baie, et c'est là qu'elle est vraiment. Partout
// ailleurs, la valeur est zéro - pas de mer, pas de nappe d'eau.

/** Une traversée de cours d'eau par l'axe relevé des voies. */
export interface WaterCrossing {
  /** Nom japonais, tel qu'OpenStreetMap le porte. */
  name: string | null;
  nameEn: string | null;
  /** Abscisse curviligne sur la boucle (m), sens des index JY croissants. */
  s: number;
  /** Tronçon de src/data/segments.ts : le numéro de la gare quittée en 内回り. */
  segment: number;
  /**
   * Où sur ce tronçon, de 0 (gare quittée) à 1 (gare suivante).
   *
   * C'est la fraction et non les mètres qui passe dans le jeu : les inter-gares
   * du jeu sont plus longs que les vrais, mais proportionnels.
   */
  fraction: number;
  /** \`river\`, \`canal\` ou \`stream\`. */
  waterway: 'river' | 'canal' | 'stream';
  /** Largeur de la trouée DANS L'AXE DE LA VOIE (m) : ce qu'il faut ouvrir. */
  width: number;
  /** false = largeur estimée d'après le type, jamais présentée comme relevée. */
  measured: boolean;
  /** Est, en mètres depuis le point d'arrêt de Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le point d'arrêt de Tokyo. */
  z: number;
  /** Gare la plus proche, et distance signée dans le sens des index croissants. */
  station: number;
  fromStation: number;
  /** Identifiant OSM de l'axe : de quoi retrouver la source. */
  osmWay: number;
}

/**
 * Les traversées À CIEL OUVERT, dans l'ordre de la boucle.
 *
 * Les souterrains sont écartés à l'import : ils sont dans
 * data/geo/water.geojson avec leur marquage, mais rien ne les dessine.
 */
export const WATER_CROSSINGS: readonly WaterCrossing[] = [
${open
  .map(
    (c) =>
      `  { name: ${c.name ? `'${c.name}'` : 'null'}, nameEn: ${c.nameEn ? `'${c.nameEn}'` : 'null'}, ` +
      `s: ${c.s}, segment: ${c.segment}, fraction: ${c.fraction}, ` +
      `waterway: '${c.waterway}', width: ${c.width}, measured: ${c.measured}, ` +
      `x: ${c.x}, z: ${c.z}, station: ${c.nearStationIndex}, fromStation: ${c.metersFromStation}, ` +
      `osmWay: ${c.osmWay} },`,
  )
  .join('\n')}
];

/** Périmètre de la boucle (m) : celui de la polyligne, pour replier une abscisse. */
export const WATER_LOOP_M = ${Math.round(perimeter)};

/** Nombre de rangées : une tous les \`WATER_S_STEP\` mètres le long de la voie. */
export const WATER_ROWS = ${rows};

/** Nombre de colonnes du champ, impair : la colonne ${(cols - 1) / 2} est l'axe de la voie. */
export const WATER_COLS = ${cols};

/** Pas longitudinal (m) : celui du relief et du ruban urbain. */
export const WATER_S_STEP = ${round(step, 4)};

/** Pas latéral (m). */
export const WATER_X_STEP = ${LATERAL_STEP};

/** Demi-largeur couverte de part et d'autre de l'axe (m). */
export const WATER_REACH = ${LATERAL_REACH};

/** Portée du relevé de littoral (m) : au-delà, la valeur est zéro. */
export const SHORE_REACH = ${SHORE_REACH};

const PACKED_FIELD =
  '${wrap(packedField)}';

const PACKED_SHORE =
  '${wrap(packedShore)}';

function decode(packed: string): Uint8Array {
  const bin = atob(packed);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let field: Uint8Array | null = null;

/**
 * Couverture en eau du corridor, de 0 (sec) à 255 (entièrement mouillé).
 *
 * Rangée majeure, ${rows} × ${cols}. Une maille fait ${Math.round(step)} m sur ${LATERAL_STEP} m et vaut la
 * fraction de ses ${SUB * SUB} sous-échantillons qui tombent dans l'eau : une rivière de
 * vingt mètres ne mouille donc pas toute sa maille, et c'est exact.
 */
export function waterField(): Uint8Array {
  if (!field) field = decode(PACKED_FIELD);
  return field;
}

let shore: Int16Array | null = null;

/**
 * Distance au trait de côte (m), deux valeurs par rangée : à gauche puis à
 * droite du sens des index JY croissants. Zéro = pas de mer en vue.
 */
export function shoreField(): Int16Array {
  if (!shore) {
    const bytes = decode(PACKED_SHORE);
    shore = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  }
  return shore;
}
`;
  writeFileSync(new URL('../../src/data/water.ts', import.meta.url), src, 'utf8');
}

const wrap = (b64) => b64.match(/.{1,96}/g).join("' +\n  '");
const round = (v, d) => Number(v.toFixed(d));

main().catch((err) => {
  process.stderr.write(`\n${err.stack ?? err}\n`);
  process.exit(1);
});
