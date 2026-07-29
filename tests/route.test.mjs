// Tracé : rééchantillonnage, abscisse curviligne, corridor, découpage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  buildRoute,
  chunkIndexAt,
  corridorPolygon,
  locateOnRoute,
  makeChunks,
  readLineString,
  sampleRoute,
} from '../scripts/plateau/lib/route.mjs';
import { PLATEAU_CONFIG } from '../scripts/plateau/config.mjs';
import { geodesicDistance } from '../scripts/plateau/lib/geo.mjs';

const GEOJSON = join(PLATEAU_CONFIG.paths.geo, `${PLATEAU_CONFIG.prototype.name}.geojson`);

test('le tracé livré est une LineString cohérente entre Sugamo et Ōtsuka', () => {
  const line = readLineString(GEOJSON);
  assert.ok(line.coordinates.length >= 10);
  const total = line.coordinates.reduce(
    (sum, c, i) =>
      i === 0
        ? 0
        : sum +
          geodesicDistance(
            line.coordinates[i - 1].lon,
            line.coordinates[i - 1].lat,
            c.lon,
            c.lat,
          ),
    0,
  );
  // Distance d'exploitation publiée par JR East : 1,1 km. On accepte
  // ±20 % — le tracé livré est explicitement approché.
  assert.ok(total > 880 && total < 1320, `longueur ${total} m hors plage plausible`);
  // Altitudes : hauteurs ellipsoïdales de l'ordre de 60-70 m à Toshima.
  for (const c of line.coordinates) {
    assert.ok(c.alt > 40 && c.alt < 90, `altitude improbable : ${c.alt}`);
  }
});

test('rééchantillonnage : pas régulier, extrémités exactes, s croissant', () => {
  const line = readLineString(GEOJSON);
  const route = buildRoute(line.coordinates, { sampleMeters: 8 });
  assert.equal(route.samples[0].s, 0);
  assert.ok(Math.abs(route.samples.at(-1).s - route.totalLength) < 1e-6);
  for (let i = 1; i < route.samples.length; i++) {
    assert.ok(route.samples[i].s > route.samples[i - 1].s);
  }
  const step = route.totalLength / (route.samples.length - 1);
  assert.ok(Math.abs(step - 8) < 0.5, `pas ${step} m trop éloigné de 8 m`);
});

test('le repère local place l’origine près du milieu du tracé', () => {
  const line = readLineString(GEOJSON);
  const route = buildRoute(line.coordinates, { sampleMeters: 8 });
  for (const p of route.samples) {
    const l = route.frame.toLocal(p.east, p.north, p.up);
    // Sur un tronçon d'un kilomètre, aucun point du tracé n'est à plus de
    // 600 m de l'origine locale : les flottants 32 bits gardent le millimètre.
    assert.ok(Math.hypot(l.x, l.z) < 600, `point à ${Math.hypot(l.x, l.z)} m de l'origine`);
  }
  // Aller-retour du repère local.
  const p = route.samples[10];
  const l = route.frame.toLocal(p.east, p.north, p.up);
  const back = route.frame.toProjected(l.x, l.y, l.z);
  assert.ok(Math.abs(back.east - p.east) < 1e-9);
  assert.ok(Math.abs(back.north - p.north) < 1e-9);
  assert.ok(Math.abs(back.up - p.up) < 1e-9);
});

test('locateOnRoute : un point sur le tracé est à distance nulle', () => {
  const line = readLineString(GEOJSON);
  const route = buildRoute(line.coordinates, { sampleMeters: 8 });
  const mid = route.raw[Math.floor(route.raw.length / 2)];
  const found = locateOnRoute(route, mid.east, mid.north);
  assert.ok(found.distance < 1e-6, `distance ${found.distance}`);
  // Un point décalé de 120 m sur la normale est retrouvé à 120 m.
  const a = route.raw[10];
  const b = route.raw[11];
  const len = Math.hypot(b.east - a.east, b.north - a.north);
  const nx = -(b.north - a.north) / len;
  const ny = (b.east - a.east) / len;
  const off = locateOnRoute(route, a.east + nx * 120, a.north + ny * 120);
  assert.ok(Math.abs(off.distance - 120) < 0.5, `distance ${off.distance}`);
});

test('découpage en chunks : couverture continue, sans trou ni recouvrement', () => {
  const chunks = makeChunks(1008.2, 400);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].startDistance, 0);
  assert.equal(chunks.at(-1).endDistance, 1008.2);
  for (let i = 1; i < chunks.length; i++) {
    assert.equal(chunks[i].startDistance, chunks[i - 1].endDistance);
  }
  // Longueur non multiple : le dernier chunk est raccourci, pas débordant.
  const odd = makeChunks(950, 400);
  assert.equal(odd.length, 3);
  assert.equal(odd.at(-1).endDistance, 950);
  assert.throws(() => makeChunks(100, 0), /chunkLengthMeters/);
});

test('chunkIndexAt : bornes incluses aux extrémités', () => {
  const chunks = makeChunks(1008.2, 400);
  assert.equal(chunkIndexAt(chunks, -50), 0);
  assert.equal(chunkIndexAt(chunks, 0), 0);
  assert.equal(chunkIndexAt(chunks, 399.9), 0);
  assert.equal(chunkIndexAt(chunks, 400), 1);
  assert.equal(chunkIndexAt(chunks, 900), 2);
  assert.equal(chunkIndexAt(chunks, 99999), 2);
});

test('sampleRoute (côté pipeline) : extrémités et cap', () => {
  const line = readLineString(GEOJSON);
  const route = buildRoute(line.coordinates, { sampleMeters: 8 });
  const start = sampleRoute(route.samples, route.frame, 0);
  const end = sampleRoute(route.samples, route.frame, route.totalLength);
  const first = route.frame.toLocal(route.samples[0].east, route.samples[0].north, route.samples[0].up);
  assert.ok(Math.abs(start.x - first.x) < 1e-6);
  assert.ok(Math.abs(start.z - first.z) < 1e-6);
  // Le tronçon part vers l'ouest-sud-ouest : le cap doit être franchement
  // différent du début à la fin (le tracé est courbe).
  assert.ok(Math.abs(end.yaw - start.yaw) > 0.05, 'le cap ne varie pas le long du tracé');
  // Un cap de 0 signifierait « vers le nord » : ici on va vers l'ouest.
  assert.ok(Math.abs(start.yaw) > 1.0, `cap initial ${start.yaw} rad inattendu`);
});

test('corridor : polygone fermé, en coordonnées géographiques', () => {
  const line = readLineString(GEOJSON);
  const route = buildRoute(line.coordinates, { sampleMeters: 8 });
  const ring = corridorPolygon(route, 300);
  assert.ok(ring.length > 20);
  assert.deepEqual(ring[0], ring.at(-1));
  for (const [lon, lat] of ring) {
    assert.ok(lon > 139.7 && lon < 139.76, `longitude ${lon} hors zone`);
    assert.ok(lat > 35.72 && lat < 35.75, `latitude ${lat} hors zone`);
  }
});
