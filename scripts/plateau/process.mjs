// Étape 3 - sélection, classement, découpage, recentrage, export GLB.
//
// ENTRÉE : work/plateau/converted/*.buildings.json (coordonnées projetées).
// SORTIE : work/plateau/processed/<name>-NNN.glb + le tracé local route.json
//          + le squelette du manifeste (complété par l'étape d'optimisation).
//
// CE QUI SE JOUE ICI
//   · Classement par distance à l'axe : near / medium / far, seuils
//     configurables (PLATEAU_CONFIG.distances). Au-delà de `far` un bâtiment
//     n'existe plus - le filtrage a déjà eu lieu à la conversion.
//   · Élagage des volumes invisibles depuis le train (voir `visibleFromTrack`).
//   · Affectation à un chunk : celui qui contient l'abscisse curviligne du
//     point du bâtiment LE PLUS PROCHE de la voie. Un bâtiment à cheval sur
//     deux chunks n'est donc jamais coupé - il appartient entièrement au chunk
//     où le voyageur le voit passer.
//   · Recentrage : chaque chunk a sa propre origine locale (le point du tracé
//     au milieu du chunk). Les sommets restent à quelques centaines de mètres
//     de zéro, ce qui met les flottants 32 bits du glTF très loin de leur
//     seuil de perte de précision.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PLATEAU_CONFIG, stageInputs } from './config.mjs';
import { ensureDirs, fingerprintFile, hashValue, reusable, writeMarker } from './lib/cache.mjs';
import { PipelineError, createReporter, humanBytes, runMain } from './lib/log.mjs';
import { isEntryPoint, parseArgs } from './lib/args.mjs';
import { buildRoute, chunkIndexAt, corridorPolygon, makeChunks, readLineString } from './lib/route.mjs';
import { boundsOf, polygonArea, triangulatePolygon } from './lib/geometry.mjs';
import { BANDS, buildChunkDocument, describe, makeIO } from './lib/glb.mjs';
import { convertAll } from './convert.mjs';

const FLAGS = ['dryRun', 'force', 'yes'];
const OPTIONS = ['source', 'url', 'zip', 'dir', 'dataset', 'maxMb', 'converter'];

/** Bande de distance d'un bâtiment. */
export function bandOf(distance, distances) {
  if (distance <= distances.near) return 'near';
  if (distance <= distances.medium) return 'medium';
  return 'far';
}

/**
 * Un volume est-il susceptible d'être vu depuis le train ?
 *
 * Le critère est volontairement grossier et prudent : on n'écarte que ce qui
 * est à la fois LOIN et MINUSCULE - un abri de jardin à 250 m ne se distingue
 * pas, mais il coûte autant de triangles qu'une façade de front de voie. On ne
 * tente aucun calcul d'occlusion réel : sans MNT ni géométrie de la tranchée,
 * un test de visibilité géométrique donnerait une fausse assurance.
 */
export function visibleFromTrack(building, band) {
  const height = building.maxUp - building.minUp;
  if (band === 'far') return building.footprintArea >= 60 || height >= 12;
  if (band === 'medium') return building.footprintArea >= 25 || height >= 8;
  return true;
}

/**
 * Palette de façades, alignée sur celles du décor procédural
 * (data/districts.ts, WARM_DAY / OLD_DAY) : béton peint, carrelage
 * beige, crépi. Aucune saturation forte - un quartier de Toshima n'est pas
 * coloré, il est nuancé.
 */
const FACADE_PALETTE = [
  [0.902, 0.863, 0.788],
  [0.894, 0.812, 0.773],
  [0.863, 0.824, 0.753],
  [0.831, 0.784, 0.706],
  [0.878, 0.855, 0.812],
  [0.812, 0.808, 0.784],
  [0.906, 0.875, 0.827],
];

/** Couleur de façade déterministe, dérivée de l'identifiant du bâtiment. */
function facadeTint(id, index) {
  let h = 2166136261;
  const key = id ?? `b${index}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hash = h >>> 0;
  const base = FACADE_PALETTE[hash % FACADE_PALETTE.length];
  // Variation d'exposition d'un bâtiment à l'autre : sans elle, un pâté de
  // maisons devient une seule masse claire quand le soleil est haut.
  const shade = 0.74 + ((hash >>> 8) % 1000) / 1000 * 0.26;
  return [base[0] * shade, base[1] * shade, base[2] * shade];
}

/** Toitures : bitume, tôle et bacs techniques - nettement plus sombres. */
const ROOF_TINT = [0.4, 0.41, 0.43];

export async function processAll(args, reporter) {
  const converted = await convertAll(args, reporter);

  const geojsonPath = join(PLATEAU_CONFIG.paths.geo, `${PLATEAU_CONFIG.prototype.name}.geojson`);
  const line = readLineString(geojsonPath);
  const route = buildRoute(line.coordinates, {
    sampleMeters: PLATEAU_CONFIG.prototype.routeSampleMeters,
  });
  const chunks = makeChunks(route.totalLength, PLATEAU_CONFIG.prototype.chunkLengthMeters);

  const inputHash = hashValue({
    ...stageInputs('process'),
    engine: converted.engine,
    convertHash: converted.inputHash,
    inputs: (converted.outputs ?? []).map((f) => ({ f: basename(f), h: fingerprintFile(f) })),
    routeHash: hashValue(line.coordinates),
    version: 3,
  });

  if (args.dryRun || converted.dryRun) {
    reporter.info(`[dry-run] tracé : ${route.totalLength.toFixed(1)} m, EPSG:${route.epsg}`);
    reporter.info(
      `[dry-run] ${chunks.length} chunk(s) de ${PLATEAU_CONFIG.prototype.chunkLengthMeters} m :`,
    );
    for (const c of chunks) {
      reporter.info(
        `[dry-run]   ${chunkId(c.index)}.glb  [${c.startDistance.toFixed(0)} → ${c.endDistance.toFixed(0)} m]`,
      );
    }
    reporter.info(`[dry-run] tracé local : ${join(PLATEAU_CONFIG.paths.out, 'route.json')}`);
    return { dryRun: true, chunks: [], route, inputHash };
  }

  const cached = reusable('process', inputHash, { force: args.force });
  if (cached) {
    reporter.info(`Étape process réutilisée (${cached.outputs.length} fichier(s)).`);
    return { ...cached, route, chunks: cached.chunkStats, inputHash, reused: true };
  }

  // --- Lecture des bâtiments convertis ---
  const buildings = [];
  for (const file of converted.outputs) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    for (const b of data.buildings) buildings.push(b);
  }
  if (buildings.length === 0) {
    throw new PipelineError('Aucun bâtiment converti : rien à découper.');
  }

  // --- Classement, élagage, affectation à un chunk ---
  const distances = PLATEAU_CONFIG.distances;
  const perChunk = new Map(chunks.map((c) => [c.index, []]));
  const counts = { near: 0, medium: 0, far: 0, culled: 0 };

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.distance > distances.far) {
      counts.culled++;
      continue;
    }
    // Aire au sol : la plus grande face horizontale du volume.
    let footprintArea = 0;
    for (const poly of b.polygons) {
      const a = polygonArea(poly.exterior);
      if (a > footprintArea) footprintArea = a;
    }
    const enriched = { ...b, footprintArea, index: i };
    const band = bandOf(b.distance, distances);
    if (!visibleFromTrack(enriched, band)) {
      counts.culled++;
      continue;
    }
    counts[band]++;
    enriched.band = band;
    perChunk.get(chunkIndexAt(chunks, b.s))?.push(enriched);
  }

  if (counts.near + counts.medium + counts.far === 0) {
    throw new PipelineError(
      `Aucun bâtiment n'intersecte le corridor après classement (${buildings.length} candidats).`,
    );
  }

  // --- Construction des GLB ---
  ensureDirs(PLATEAU_CONFIG.paths.processed, PLATEAU_CONFIG.paths.out);
  const io = await makeIO();
  const outputs = [];
  const chunkStats = [];

  for (const chunk of chunks) {
    const list = perChunk.get(chunk.index) ?? [];
    // Origine du chunk : le point du tracé au milieu de son intervalle. Les
    // sommets se répartissent alors autour de zéro plutôt que de dériver.
    const mid = sampleAt(route, (chunk.startDistance + chunk.endDistance) / 2);
    const origin = route.frame.toLocal(mid.east, mid.north, mid.up);

    const groups = new Map();
    const keyOf = (band, surface) => `${band}/${surface}`;
    for (const band of BANDS) {
      for (const surface of ['facade', 'roof']) {
        groups.set(keyOf(band, surface), { positions: [], normals: [], colors: [] });
      }
    }

    let buildingCount = 0;
    let degenerate = 0;
    for (const b of list) {
      const tint = facadeTint(b.id, b.index);
      let emitted = false;
      for (const poly of b.polygons) {
        const toLocal = (ring) =>
          ring.map(([east, north, up]) => {
            const l = route.frame.toLocal(east, north, up);
            return [l.x - origin.x, l.y - origin.y, l.z - origin.z];
          });
        const tri = triangulatePolygon(toLocal(poly.exterior), (poly.interiors ?? []).map(toLocal));
        if (!tri) {
          degenerate++;
          continue;
        }
        // Une face tournée vers le haut est un toit ; le reste est façade.
        // Les faces tournées vers le BAS (dalle inférieure d'un solide LOD1)
        // sont jetées : invisibles depuis la rue, et c'est un sixième des
        // triangles d'une boîte.
        if (tri.normal[1] < -0.7) continue;
        const surface = tri.normal[1] > 0.7 ? 'roof' : 'facade';
        const target = groups.get(keyOf(b.band, surface));
        const color = surface === 'roof' ? ROOF_TINT : tint;
        for (let k = 0; k < tri.positions.length; k += 3) {
          target.positions.push(tri.positions[k], tri.positions[k + 1], tri.positions[k + 2]);
          target.normals.push(tri.normal[0], tri.normal[1], tri.normal[2]);
          target.colors.push(color[0], color[1], color[2]);
        }
        emitted = true;
      }
      if (emitted) buildingCount++;
    }

    const allPositions = [];
    for (const g of groups.values()) allPositions.push(...g.positions);
    if (allPositions.length === 0) {
      reporter.warn(
        `${chunkId(chunk.index)} : aucun bâtiment (chunk vide, il ne sera pas publié).`,
      );
      continue;
    }
    const bounds = boundsOf(allPositions);
    const boundingRadius = Math.max(
      ...bounds.max.map((v, k) => Math.max(Math.abs(v), Math.abs(bounds.min[k]))),
    );

    const id = chunkId(chunk.index);
    const { doc, triangles } = buildChunkDocument({
      id,
      groups,
      metadata: {
        plateauChunk: {
          startDistance: chunk.startDistance,
          endDistance: chunk.endDistance,
          origin: [origin.x, origin.y, origin.z],
        },
      },
    });
    const out = join(PLATEAU_CONFIG.paths.processed, `${id}.glb`);
    await io.write(out, doc);
    const size = readFileSync(out).length;
    outputs.push(out);

    const stats = describe(doc);
    chunkStats.push({
      id,
      index: chunk.index,
      segment: PLATEAU_CONFIG.prototype.segment,
      startDistance: Math.round(chunk.startDistance * 100) / 100,
      endDistance: Math.round(chunk.endDistance * 100) / 100,
      offset: [
        Math.round(origin.x * 1000) / 1000,
        Math.round(origin.y * 1000) / 1000,
        Math.round(origin.z * 1000) / 1000,
      ],
      boundingRadius: Math.round(boundingRadius * 100) / 100,
      buildings: buildingCount,
      degenerateSurfaces: degenerate,
      rawFile: out,
      rawBytes: size,
      raw: { ...stats, triangles },
    });
    reporter.step(
      `${id} : ${buildingCount} bâtiment(s), ${triangles} triangles, ` +
        `${stats.primitives} primitive(s), ${stats.materials} matériau(x) → ${humanBytes(size)}`,
    );
  }

  if (outputs.length === 0) {
    throw new PipelineError('Aucun chunk produit : tous les chunks sont vides.');
  }

  // --- Tracé local pour le jeu ---
  const routeJson = {
    version: 1,
    segment: PLATEAU_CONFIG.prototype.segment,
    from: PLATEAU_CONFIG.prototype.from,
    to: PLATEAU_CONFIG.prototype.to,
    totalLength: Math.round(route.totalLength * 1000) / 1000,
    sampleMeters: PLATEAU_CONFIG.prototype.routeSampleMeters,
    coordinateSystem: { units: 'meters', east: '+X', up: '+Y', north: '-Z' },
    origin: {
      epsg: route.epsg,
      east: route.frame.origin.east,
      north: route.frame.origin.north,
      up: route.frame.origin.up,
    },
    points: route.samples.map((p) => {
      const l = route.frame.toLocal(p.east, p.north, p.up);
      return {
        s: Math.round(p.s * 1000) / 1000,
        x: Math.round(l.x * 1000) / 1000,
        y: Math.round(l.y * 1000) / 1000,
        z: Math.round(l.z * 1000) / 1000,
      };
    }),
  };
  const routePath = join(PLATEAU_CONFIG.paths.out, 'route.json');
  writeFileSync(routePath, `${JSON.stringify(routeJson, null, 2)}\n`);

  // Corridor exporté en GeoJSON : utile pour recaler la sélection dans un SIG.
  const corridorPath = join(PLATEAU_CONFIG.paths.processed, 'corridor.geojson');
  writeFileSync(
    corridorPath,
    `${JSON.stringify(
      {
        type: 'Feature',
        properties: {
          halfWidthMeters: PLATEAU_CONFIG.prototype.corridorMeters,
          note: 'Emprise indicative. La sélection réelle utilise la distance exacte point/polyligne.',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [corridorPolygon(route, PLATEAU_CONFIG.prototype.corridorMeters)],
        },
      },
      null,
      2,
    )}\n`,
  );

  writeMarker('process', {
    inputHash,
    outputs: [...outputs, routePath],
    extra: { chunkStats, counts, totalLength: route.totalLength },
  });

  reporter.info(
    `${chunkStats.length} chunk(s) - proche ${counts.near}, intermédiaire ${counts.medium}, ` +
      `éloigné ${counts.far}, élagué ${counts.culled}.`,
  );
  reporter.info(`Tracé local : ${routePath} (${routeJson.points.length} points)`);

  return { outputs, chunks: chunkStats, counts, route, routeJson, inputHash, corridorPath };
}

/** Identifiant de chunk : `<nom-du-tronçon>-000`. */
export function chunkId(index) {
  return `${PLATEAU_CONFIG.prototype.name}-${String(index).padStart(3, '0')}`;
}

/** Point du tracé (coordonnées projetées) à l'abscisse `s`. */
function sampleAt(route, s) {
  const pts = route.samples;
  const last = pts.length - 1;
  const clamped = Math.min(Math.max(s, pts[0].s), pts[last].s);
  let i = 0;
  while (i < last - 1 && pts[i + 1].s < clamped) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const span = b.s - a.s;
  const t = span === 0 ? 0 : (clamped - a.s) / span;
  return {
    east: a.east + t * (b.east - a.east),
    north: a.north + t * (b.north - a.north),
    up: a.up + t * (b.up - a.up),
  };
}

if (isEntryPoint(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs(process.argv.slice(2), { flags: FLAGS, options: OPTIONS });
    await processAll(args, createReporter('process'));
  });
}
