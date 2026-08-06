// Le tracé réel de la Yamanote, depuis OpenStreetMap.
//
//   node scripts/geo/fetch-loop.mjs [--force]
//
// Émet data/geo/yamanote-loop.geojson : la boucle comme UNE polyligne fermée,
// avec sa provenance et sa date.
//
// POURQUOI. Jusqu'ici la géométrie de la boucle était une table de trente-cinq
// sommets saisie à la main : les trente milieux de quai publiés, plus six
// « points de forme » posés à l'œil dans les virages qu'on voyait couper. Elle
// mesurait 33,0 km contre 34,5 km de kilométrage JR - quatre pour cent de moins,
// et l'écart n'était pas réparti : il se concentrait dans les courbes, exactement
// là où le cap compte, puisque c'est le cap qui place tout l'horizon lointain.
//
// La règle 1 de la bible géographique est catégorique : « ne pas générer
// aléatoirement la géométrie des voies de la Yamanote Line, utiliser une
// polyligne géoréférencée réelle ». La voici. Elle mesure 34,96 km, soit 1,3 %
// au-dessus du barème JR - et ce reste d'écart est attendu : le kilométrage JR
// est mesuré sur une voie de référence et arrondi à la centaine de mètres, OSM
// trace l'axe relevé.
//
// COMMENT ON CHOISIT UNE VOIE. La relation d'itinéraire 山手線 porte les DEUX
// voies, sans rôle qui les sépare : 408 tronçons pour 77 km. On les recoud par
// la topologie (scripts/geo/lib/polyline.mjs) et il en sort deux chaînes de
// 34,96 km, une par sens. Le jeu n'a qu'une voie : on retient celle qui tourne
// dans le sens des index JY croissants, c'est-à-dire l'extérieure (外回り), et
// les deux sens de marche s'en déduisent - c'est déjà ce que fait
// src/systems/tokyoBearing.ts.

import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from '../plateau/lib/args.mjs';
import { makeProjector, pickJapanZone } from '../plateau/lib/geo.mjs';
import { overpass } from './lib/net.mjs';
import { pathLength, signedArea, simplify, snapToPolyline, stitch } from './lib/polyline.mjs';
import { provenance } from './lib/source.mjs';
import { PLATFORMS } from './lib/platforms.mjs';

/** La relation d'itinéraire JR 山手線 sur OpenStreetMap. */
const RELATION = 5376382;

/**
 * Tolérance de simplification (m).
 *
 * Un mètre. OSM coupe les tronçons aux ponts et aux changements de couche, ce
 * qui sème des sommets inutiles sur les alignements droits : les retirer fait
 * passer la table de 916 à 327 sommets pour un écart géométrique d'un mètre au
 * pire, et deux mètres sur les trente-quatre kilomètres de longueur totale.
 * C'est dix fois plus dense que la table de trente-cinq sommets qu'elle
 * remplace, pour un fichier qui reste lisible.
 */
const SIMPLIFY_M = 1;

/** Une chaîne plus courte que ça est une voie de garage, pas la boucle. */
const MIN_LOOP_M = 30000;

async function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['force'] });

  process.stdout.write(`Tracé de la Yamanote depuis OpenStreetMap (relation ${RELATION})\n`);

  const meta = await overpass(`[out:json][timeout:120];rel(${RELATION});out meta;`, {
    label: 'relation',
    force: args.force,
  });
  const rel = meta.elements.find((e) => e.type === 'relation');
  if (!rel) throw new Error(`Relation ${RELATION} introuvable.`);
  const datasetDate = rel.timestamp.slice(0, 10);
  process.stdout.write(
    `  ${rel.tags.name} · ${rel.tags.operator} · version ${rel.version} du ${datasetDate}\n`,
  );

  const geom = await overpass(`[out:json][timeout:180];rel(${RELATION});way(r);out geom;`, {
    label: 'tronçons',
    force: args.force,
  });
  const ways = geom.elements.filter(
    (e) => e.type === 'way' && e.geometry?.length > 1 && e.nodes?.length > 1,
  );
  process.stdout.write(`  ${ways.length} tronçons, ${sum(ways, (w) => w.geometry.length)} sommets\n`);

  // Les points d'arrêt, qui sont des NŒUDS DE LA VOIE : c'est là que se place
  // le milieu de la rame à quai, et c'est une donnée bien meilleure qu'un
  // milieu de quai publié projeté sur l'axe - elle est déjà dessus, au
  // centimètre. Il y en a deux par gare, un par voie.
  const stopsRaw = await overpass(
    `[out:json][timeout:120];rel(${RELATION});way(r)->.w;` +
      `node(w.w)["public_transport"="stop_position"];out;`,
    { label: 'points d’arrêt', force: args.force },
  );
  const stops = stopsRaw.elements.filter((e) => e.type === 'node');

  const chains = stitch(ways).filter((c) => c.length > MIN_LOOP_M);
  if (chains.length < 2) {
    throw new Error(
      `Attendu deux voies de plus de ${MIN_LOOP_M} m, trouvé ${chains.length}. ` +
        `La relation a peut-être changé de structure : relancez avec --force.`,
    );
  }
  for (const c of chains) {
    process.stdout.write(
      `  voie recousue : ${(c.length / 1000).toFixed(3)} km, ${c.points.length} sommets, ` +
        `${c.ways.length} tronçons\n`,
    );
  }

  // --- Projection ---------------------------------------------------------
  const epsg = pickJapanZone(PLATFORMS[0].lon, PLATFORMS[0].lat);
  const projector = makeProjector(epsg);
  const origin = projector.forward(PLATFORMS[0].lon, PLATFORMS[0].lat);
  const local = (lon, lat) => {
    const p = projector.forward(lon, lat);
    return { x: p.east - origin.east, z: -(p.north - origin.north) };
  };

  // --- La voie qui tourne dans le sens des index JY croissants ------------
  //
  // Les index JY croissent Tokyo → Kanda → Ueno → Ikebukuro → Shinjuku →
  // Shibuya → Shinagawa → Tokyo : on monte par l'est, on redescend par l'ouest,
  // soit le sens TRIGONOMÉTRIQUE sur une carte au nord en haut. Le repère de
  // scène étant indirect (+x est, −z nord), ce sens-là y donne une aire
  // algébrique NÉGATIVE. Les deux voies de la boucle sont tracées chacune dans
  // son sens de marche : leurs aires sont donc de signes opposés, et le signe
  // suffit à les départager.
  const scored = chains.map((c) => {
    const pts = c.points.map(([lon, lat]) => local(lon, lat));
    return { chain: c, pts, nodes: c.nodes, area: signedArea(pts) };
  });
  let track = scored.find((s) => s.area < 0) ?? scored[0];
  if (!track.pts.length) throw new Error('Voie vide après projection.');
  // Une chaîne peut avoir été recousue à l'envers : on la retourne plutôt que
  // de la rejeter, l'orientation d'une polyligne n'étant qu'une convention.
  if (track.area > 0) {
    track = {
      ...track,
      pts: [...track.pts].reverse(),
      nodes: [...track.nodes].reverse(),
      area: -track.area,
    };
  }
  process.stdout.write(
    `  voie retenue : ${(track.chain.length / 1000).toFixed(3)} km, sens des JY croissants\n`,
  );

  // --- Les gares sur la voie ----------------------------------------------
  //
  // Chaque gare a un point d'arrêt qui est un NŒUD DE LA VOIE : on le retrouve
  // par son identifiant dans la chaîne, et la gare devient un sommet existant
  // de la polyligne plutôt qu'une projection. Le milieu de quai publié ne sert
  // plus qu'à choisir lequel des deux points d'arrêt de la gare - un par voie -
  // appartient à la voie retenue, et l'écart entre les deux sources est
  // conservé : c'est un contrôle croisé, et tests/tokyoGeo.test.ts le lit.
  const nodeIndex = new Map();
  track.nodes.forEach((id, i) => {
    if (!nodeIndex.has(id)) nodeIndex.set(id, i);
  });
  const onTrack = stops.filter((n) => nodeIndex.has(n.id));

  const anchors = PLATFORMS.map((st, index) => {
    const p = local(st.lon, st.lat);
    let best = null;
    for (const n of onTrack) {
      const q = local(n.lon, n.lat);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (!best || d < best.distance) best = { node: n, distance: d, at: nodeIndex.get(n.id), ...q };
    }
    // Un point d'arrêt à plus de trois cents mètres du milieu de quai publié
    // n'est pas celui de cette gare : on retombe alors sur la projection, et on
    // le dit.
    if (best && best.distance < 300) {
      return {
        ...st,
        index,
        at: best.at,
        node: best.node,
        x: best.x,
        z: best.z,
        offset: best.distance,
        snapped: false,
      };
    }
    const snap = snapToPolyline(p.x, p.z, track.pts);
    process.stdout.write(`  ${st.name} : pas de point d’arrêt, projection du quai\n`);
    return { ...st, index, at: null, snap, x: snap.x, z: snap.z, offset: snap.distance, snapped: true };
  });
  const worst = anchors.reduce((a, b) => (a.offset > b.offset ? a : b));
  process.stdout.write(
    `  ${onTrack.length} points d’arrêt sur la voie ; écart au milieu de quai publié : ` +
      `${Math.round(worst.offset)} m au pire (${worst.name})\n`,
  );

  // Marquer les trente gares sur la polyligne, dans l'ordre.
  const inserted = insertAnchors(track.pts, anchors);

  // Faire commencer la boucle à Tokyo (JY01), comme le fait src/data/stations.
  const startAt = inserted.findIndex((p) => p.station === 0);
  const rotated = inserted.slice(startAt).concat(inserted.slice(0, startAt));

  // --- Simplification ------------------------------------------------------
  const keep = new Set();
  rotated.forEach((p, i) => {
    if (p.station >= 0) keep.add(i);
  });
  const kept = simplify(rotated, SIMPLIFY_M, keep);
  const loop = kept.map((i) => rotated[i]);
  process.stdout.write(
    `  polyligne : ${rotated.length} → ${loop.length} sommets (tolérance ${SIMPLIFY_M} m)\n`,
  );

  // --- Mesures -------------------------------------------------------------
  const lonlat = loop.map((p) => {
    const g = projector.inverse(p.x + origin.east, -p.z + origin.north);
    return [round(g.lon, 6), round(g.lat, 6)];
  });
  /** Rang de chaque gare dans la polyligne simplifiée. */
  const vertexOf = new Map();
  loop.forEach((p, i) => {
    if (p.station >= 0) vertexOf.set(p.station, i);
  });
  const total = pathLength([...lonlat, lonlat[0]]);
  const legs = measureLegs(loop);
  process.stdout.write(
    `  longueur : ${(total / 1000).toFixed(3)} km (kilométrage JR : 34,500 km, ` +
      `${(((total / 34500) - 1) * 100).toFixed(1)} %)\n`,
  );

  // --- Écriture ------------------------------------------------------------
  const dir = new URL('../../data/geo/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const geojson = {
    type: 'FeatureCollection',
    name: 'yamanote-loop',
    features: [
      {
        type: 'Feature',
        properties: {
          line: 'JR山手線 / Yamanote Line',
          relation: RELATION,
          relationVersion: rel.version,
          operator: rel.tags.operator,
          direction: 'index JY croissants (外回り)',
          lengthMeters: Math.round(total),
          vertexCount: loop.length,
          simplifyMeters: SIMPLIFY_M,
          projectedEpsg: epsg,
          note:
            'Axe relevé des voies, recousu depuis la relation d’itinéraire OSM. ' +
            'Les trente sommets de gare sont la projection du milieu de quai publié ' +
            'sur cet axe : c’est la position du train à l’arrêt.',
          ...provenance({ source: 'osm', datasetDate, layer: 'DATA_STATIC' }),
          generatedBy: 'scripts/geo/fetch-loop.mjs',
        },
        geometry: { type: 'LineString', coordinates: [...lonlat, lonlat[0]] },
      },
    ],
    stations: anchors.map((a, i) => ({
      index: i,
      jy: a.jy,
      name: a.name,
      /** Milieu de quai publié : la source qui a servi à choisir le point d'arrêt. */
      platformLon: a.lon,
      platformLat: a.lat,
      /** Le point d'arrêt lui-même, tel qu'il est sur la voie. */
      stopLon: lonlat[vertexOf.get(i)][0],
      stopLat: lonlat[vertexOf.get(i)][1],
      /** Rang du sommet dans la géométrie de la ligne. */
      vertex: vertexOf.get(i),
      /** Nœud OSM du point d'arrêt, ou null quand on a dû projeter le quai. */
      stopNode: a.at === null ? null : (a.node?.id ?? null),
      stopFromPlatformMeters: round(a.offset, 1),
      snapped: a.snapped,
    })),
    legs,
  };
  const out = new URL('yamanote-loop.geojson', dir);
  writeFileSync(out, `${JSON.stringify(geojson, null, 1)}\n`, 'utf8');
  process.stdout.write(`\ndata/geo/yamanote-loop.geojson écrit.\n`);
  process.stdout.write(`Relancez « node scripts/geo-loop.mjs » pour régénérer src/data/tokyoGeo.ts.\n`);
}

/**
 * Marque les trente gares sur la polyligne.
 *
 * Le cas courant est un sommet EXISTANT - le point d'arrêt est un nœud de la
 * voie - qu'on se contente d'étiqueter. Le cas de repli est une projection, à
 * insérer entre deux sommets, à sa fraction de segment.
 */
function insertAnchors(pts, anchors) {
  const labelAt = new Map();
  const bySegment = new Map();
  for (const a of anchors) {
    if (a.at !== null) {
      labelAt.set(a.at, a.index);
      continue;
    }
    const list = bySegment.get(a.snap.index) ?? [];
    list.push(a);
    bySegment.set(a.snap.index, list);
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    out.push({ station: labelAt.has(i) ? labelAt.get(i) : -1, x: pts[i].x, z: pts[i].z });
    const here = bySegment.get(i);
    if (!here) continue;
    here.sort((a, b) => a.snap.t - b.snap.t);
    for (const a of here) {
      const last = out[out.length - 1];
      // Un point de gare qui coïncide avec un sommet existant l'étiquette,
      // plutôt que de créer un segment de longueur nulle.
      if (Math.hypot(last.x - a.x, last.z - a.z) < 0.5) {
        last.station = a.index;
        last.x = a.x;
        last.z = a.z;
      } else {
        out.push({ station: a.index, x: a.x, z: a.z });
      }
    }
  }
  return out;
}

/** Longueur de chaque inter-gare le long de la polyligne (m). */
function measureLegs(loop) {
  const idx = [];
  loop.forEach((p, i) => {
    if (p.station >= 0) idx[p.station] = i;
  });
  const legs = [];
  for (let s = 0; s < 30; s++) {
    const a = idx[s];
    const b = idx[(s + 1) % 30];
    let d = 0;
    let i = a;
    while (i !== b) {
      const j = (i + 1) % loop.length;
      d += Math.hypot(loop[j].x - loop[i].x, loop[j].z - loop[i].z);
      i = j;
      // Un inter-gare qui fait le tour de la boucle signe une polyligne
      // parcourue à l'envers : on préfère l'échec au chiffre absurde.
      if (d > 5000) {
        throw new Error(
          `Inter-gare ${s}→${(s + 1) % 30} au-delà de 5 km : la polyligne ne va pas ` +
            `dans le sens des index JY croissants.`,
        );
      }
    }
    legs.push({ from: s, to: (s + 1) % 30, meters: Math.round(d) });
  }
  return legs;
}

const sum = (arr, f) => arr.reduce((s, v) => s + f(v), 0);
const round = (v, d) => Number(v.toFixed(d));

main().catch((err) => {
  process.stderr.write(`\n${err.stack ?? err}\n`);
  process.exit(1);
});
