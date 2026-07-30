// Tracé du tronçon : lecture GeoJSON, projection métrique, rééchantillonnage,
// abscisse curviligne, corridor et découpage en chunks.
//
// Toutes les distances sont en mètres dans la projection plane japonaise
// choisie (voir lib/geo.mjs). Aucun calcul métrique n'est fait sur des degrés.

import { readFileSync } from 'node:fs';
import { makeProjector, pickJapanZone, projectOnPolyline } from './geo.mjs';

/**
 * Repère local du prototype : trois.js avec +X est, +Y hauteur, -Z nord.
 * L'origine est un point projeté fixe, stocké dans le manifeste, ce qui permet
 * de reconstruire les coordonnées géographiques d'un sommet.
 */
export function makeLocalFrame(projector, origin) {
  return {
    epsg: projector.epsg,
    origin, // { east, north, up }
    /** (est, nord, haut) projeté → (x, y, z) three.js. */
    toLocal(east, north, up) {
      return { x: east - origin.east, y: up - origin.up, z: -(north - origin.north) };
    },
    /** (x, y, z) three.js → (est, nord, haut) projeté. */
    toProjected(x, y, z) {
      return { east: x + origin.east, north: -z + origin.north, up: y + origin.up };
    },
    /** (lon, lat, alt) → (x, y, z) three.js. */
    fromGeographic(lon, lat, alt) {
      const p = projector.forward(lon, lat);
      return this.toLocal(p.east, p.north, alt);
    },
  };
}

/** Lit une FeatureCollection ou une Feature contenant UNE LineString. */
export function readLineString(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Tracé illisible : ${path}\n  ${err.message}`);
  }
  const features = raw.type === 'FeatureCollection' ? raw.features : [raw];
  const line = features.find(
    (f) => f?.geometry?.type === 'LineString' || f?.type === 'LineString',
  );
  const geometry = line?.geometry ?? line;
  if (!geometry || geometry.type !== 'LineString') {
    throw new Error(`Aucune LineString trouvée dans ${path}.`);
  }
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error(`LineString dégénérée dans ${path} (${coords?.length ?? 0} point(s)).`);
  }
  return {
    coordinates: coords.map(([lon, lat, alt]) => ({ lon, lat, alt: alt ?? 0 })),
    properties: line?.properties ?? {},
  };
}

/**
 * Projette une LineString géographique, rééchantillonne à pas constant et
 * calcule l'abscisse curviligne. L'altitude est interpolée linéairement.
 */
export function buildRoute(coordinates, { sampleMeters }) {
  const epsg = pickJapanZone(coordinates[0].lon, coordinates[0].lat);
  const projector = makeProjector(epsg);

  const raw = coordinates.map((c) => {
    const p = projector.forward(c.lon, c.lat);
    return { east: p.east, north: p.north, up: c.alt };
  });

  // Abscisse curviligne sur la polyligne d'origine (plan horizontal : la pente
  // d'un chemin de fer urbain est sous 3,5 %, son effet sur la longueur est
  // sous 0,06 % - retenir la projection horizontale garde `s` comparable à la
  // distance parcourue par le train dans le jeu).
  const rawCum = [0];
  for (let i = 1; i < raw.length; i++) {
    rawCum.push(rawCum[i - 1] + Math.hypot(raw[i].east - raw[i - 1].east, raw[i].north - raw[i - 1].north));
  }
  const totalLength = rawCum[rawCum.length - 1];
  if (!(totalLength > 0)) throw new Error('Tracé de longueur nulle après projection.');

  // Rééchantillonnage : pas régulier, dernier point exactement sur la fin.
  const count = Math.max(2, Math.round(totalLength / sampleMeters) + 1);
  const step = totalLength / (count - 1);
  const samples = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const s = Math.min(totalLength, i * step);
    while (seg < rawCum.length - 2 && rawCum[seg + 1] < s) seg++;
    const span = rawCum[seg + 1] - rawCum[seg];
    const t = span === 0 ? 0 : (s - rawCum[seg]) / span;
    samples.push({
      s,
      east: raw[seg].east + t * (raw[seg + 1].east - raw[seg].east),
      north: raw[seg].north + t * (raw[seg + 1].north - raw[seg].north),
      up: raw[seg].up + t * (raw[seg + 1].up - raw[seg].up),
    });
  }

  // Origine locale : le point médian du tracé, arrondi à 10 m pour rester
  // stable si le tracé est légèrement retouché.
  const mid = samples[Math.floor(samples.length / 2)];
  const origin = {
    east: Math.round(mid.east / 10) * 10,
    north: Math.round(mid.north / 10) * 10,
    up: Math.round(mid.up * 10) / 10,
  };
  const frame = makeLocalFrame(projector, origin);

  return {
    projector,
    frame,
    epsg,
    totalLength,
    /** Polyligne d'origine projetée (sert à la sélection spatiale exacte). */
    raw,
    rawCum,
    /** Polyligne rééchantillonnée (sert au route.json du jeu). */
    samples,
  };
}

/** Distance latérale d'un point projeté au tracé, et son abscisse curviligne. */
export function locateOnRoute(route, east, north) {
  return projectOnPolyline(east, north, route.raw, route.rawCum);
}

/**
 * Polygone de corridor (buffer d'épaisseur constante autour du tracé), pour
 * inspection dans un SIG. Ce n'est PAS ce qui sert à la sélection : celle-ci
 * utilise la distance exacte point/polyligne, sans approximation de buffer.
 */
export function corridorPolygon(route, halfWidth) {
  const pts = route.samples;
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.east - a.east;
    const dy = b.north - a.north;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push([pts[i].east + nx * halfWidth, pts[i].north + ny * halfWidth]);
    right.push([pts[i].east - nx * halfWidth, pts[i].north - ny * halfWidth]);
  }
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]);
  return ring.map(([east, north]) => {
    const g = route.projector.inverse(east, north);
    return [g.lon, g.lat];
  });
}

/** Découpe [0, totalLength] en chunks de `chunkLength` mètres (dernier ajusté). */
export function makeChunks(totalLength, chunkLength) {
  if (!(chunkLength > 0)) throw new Error('chunkLengthMeters doit être > 0.');
  const n = Math.max(1, Math.ceil(totalLength / chunkLength));
  const chunks = [];
  for (let i = 0; i < n; i++) {
    chunks.push({
      index: i,
      startDistance: i * chunkLength,
      endDistance: Math.min(totalLength, (i + 1) * chunkLength),
    });
  }
  return chunks;
}

/** Index du chunk contenant l'abscisse `s` (bornes incluses aux extrémités). */
export function chunkIndexAt(chunks, s) {
  if (chunks.length === 0) return -1;
  if (s <= chunks[0].startDistance) return 0;
  for (const c of chunks) if (s < c.endDistance) return c.index;
  return chunks[chunks.length - 1].index;
}

/**
 * Position et cap sur le tracé rééchantillonné, à l'abscisse `s`.
 * Renvoie des coordonnées LOCALES (repère three.js) et un cap en radians
 * autour de +Y, tel que le train regarde -Z quand yaw = 0.
 */
export function sampleRoute(samples, frame, s) {
  const last = samples.length - 1;
  const clamped = Math.min(Math.max(s, samples[0].s), samples[last].s);
  let i = 0;
  while (i < last - 1 && samples[i + 1].s < clamped) i++;
  const a = samples[i];
  const b = samples[i + 1];
  const span = b.s - a.s;
  const t = span === 0 ? 0 : (clamped - a.s) / span;
  const east = a.east + t * (b.east - a.east);
  const north = a.north + t * (b.north - a.north);
  const up = a.up + t * (b.up - a.up);
  const local = frame.toLocal(east, north, up);
  // Tangente dans le repère local : dx = Δest, dz = -Δnord. Une rotation de
  // `yaw` autour de +Y envoie l'axe avant du train (0, 0, -1) sur
  // (-sin yaw, 0, -cos yaw) : identifier à (dx, 0, dz) donne l'arc-tangente
  // ci-dessous.
  const dx = b.east - a.east;
  const dz = -(b.north - a.north);
  return { ...local, yaw: Math.atan2(-dx, -dz) };
}
