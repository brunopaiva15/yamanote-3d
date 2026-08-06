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

// Rien ici n'est câblé sur un tronçon donné : les bornes sont dérivées de la
// configuration. Ces tests doivent survivre à un changement de tronçon - c'est
// justement la propriété qu'on veut protéger.
const PROTO = PLATEAU_CONFIG.prototype;
const GEOJSON = join(PLATEAU_CONFIG.paths.geo, `${PROTO.name}.geojson`);
const ANCHORS = PROTO.anchors;
/** Distance à vol d'oiseau entre les deux gares : la borne basse du tracé. */
const CHORD = geodesicDistance(ANCHORS.from.lon, ANCHORS.from.lat, ANCHORS.to.lon, ANCHORS.to.lat);

test(`le tracé livré est une LineString cohérente entre ${PROTO.from} et ${PROTO.to}`, () => {
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
  // Un tracé courbe est plus long que la corde ; un tronçon quasi droit
  // (Shibuya→Ebisu sur le tracé OSM réel) peut coller à la corde à un mètre
  // près — la géodésique par sommets et la corde directe ne sont pas calculées
  // dans le même ordre.
  assert.ok(total >= CHORD - 1, `tracé ${total} m plus court que la corde ${CHORD} m`);
  assert.ok(total < CHORD * 1.5, `tracé ${total} m invraisemblablement long`);
  // Le tracé doit vraiment relier les deux ancrages configurés.
  const first = line.coordinates[0];
  const last = line.coordinates.at(-1);
  assert.ok(
    geodesicDistance(first.lon, first.lat, ANCHORS.from.lon, ANCHORS.from.lat) < 25,
    'le tracé ne part pas de la gare de départ',
  );
  assert.ok(
    geodesicDistance(last.lon, last.lat, ANCHORS.to.lon, ANCHORS.to.lat) < 25,
    "le tracé n'arrive pas à la gare d'arrivée",
  );
  // Altitudes : cote du rail = niveau de la rue + railAboveGround (signé).
  const railMin = Math.min(PROTO.groundElevation.start, PROTO.groundElevation.end) + PROTO.railAboveGround;
  const railMax = Math.max(PROTO.groundElevation.start, PROTO.groundElevation.end) + PROTO.railAboveGround;
  for (const c of line.coordinates) {
    assert.ok(
      c.alt >= railMin - 0.5 && c.alt <= railMax + 0.5,
      `altitude ${c.alt} hors du profil configuré [${railMin}, ${railMax}]`,
    );
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
  // L'origine étant au milieu, aucun point n'est plus loin que la demi-longueur
  // (avec un peu de marge pour la courbure) : les flottants 32 bits du glTF
  // gardent alors très largement le millimètre.
  const limit = route.totalLength / 2 + 60;
  for (const p of route.samples) {
    const l = route.frame.toLocal(p.east, p.north, p.up);
    assert.ok(
      Math.hypot(l.x, l.z) < limit,
      `point à ${Math.hypot(l.x, l.z).toFixed(0)} m de l'origine (limite ${limit.toFixed(0)})`,
    );
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
  // Sur un tronçon quasi droit (Shibuya→Ebisu réel), le cap peut à peine
  // bouger : on exige seulement qu'il soit un nombre fini aux deux bouts.
  assert.ok(Number.isFinite(start.yaw) && Number.isFinite(end.yaw), 'cap non fini');
  // S'il y a de la courbure, elle doit être cohérente (pas un saut de π).
  const dYaw = Math.abs(end.yaw - start.yaw);
  assert.ok(dYaw < Math.PI * 0.9, `saut de cap absurde : ${dYaw}`);
});

test('corridor : polygone fermé, en coordonnées géographiques', () => {
  const line = readLineString(GEOJSON);
  const route = buildRoute(line.coordinates, { sampleMeters: 8 });
  const half = PROTO.corridorMeters;
  const ring = corridorPolygon(route, half);
  assert.ok(ring.length > 20);
  assert.deepEqual(ring[0], ring.at(-1));
  // Chaque sommet du corridor doit être à `half` mètres de l'axe, à la
  // tolérance des coins près - et donc jamais plus loin que half·1,5.
  for (const [lon, lat] of ring) {
    const p = route.projector.forward(lon, lat);
    const d = locateOnRoute(route, p.east, p.north).distance;
    assert.ok(d < half * 1.5, `sommet du corridor à ${d.toFixed(0)} m de l'axe (demi-largeur ${half})`);
  }
});
