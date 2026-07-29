// Projection métrique : c'est la brique sur laquelle repose tout le placement.
// Une erreur de quelques mètres ici décale une ville entière.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  geodesicDistance,
  makeProjector,
  pickJapanZone,
  pointSegmentDistance,
  projectOnPolyline,
} from '../scripts/plateau/lib/geo.mjs';

const SUGAMO = { lon: 139.7393, lat: 35.73352 };
const OTSUKA = { lon: 139.72855, lat: 35.73147 };

test('EPSG:6677 — l’origine de la zone IX tombe exactement sur (0, 0)', () => {
  const p = makeProjector(6677);
  const o = p.forward(139.5, 36.0);
  assert.ok(Math.abs(o.east) < 1e-6, `east=${o.east}`);
  assert.ok(Math.abs(o.north) < 1e-6, `north=${o.north}`);
});

test('EPSG:6677 — aller-retour au millimètre près sur toute la zone', () => {
  const p = makeProjector(6677);
  const points = [
    SUGAMO,
    OTSUKA,
    { lon: 139.5, lat: 36.0 },
    { lon: 138.6, lat: 34.8 },
    { lon: 140.4, lat: 37.2 },
  ];
  for (const pt of points) {
    const xy = p.forward(pt.lon, pt.lat);
    const back = p.inverse(xy.east, xy.north);
    // 1e-8 degré ≈ 1 mm.
    assert.ok(Math.abs(back.lon - pt.lon) < 1e-8, `lon ${back.lon} ≠ ${pt.lon}`);
    assert.ok(Math.abs(back.lat - pt.lat) < 1e-8, `lat ${back.lat} ≠ ${pt.lat}`);
  }
});

test('EPSG:6677 — la distance projetée suit la distance géodésique', () => {
  const p = makeProjector(6677);
  const a = p.forward(SUGAMO.lon, SUGAMO.lat);
  const b = p.forward(OTSUKA.lon, OTSUKA.lat);
  const projected = Math.hypot(a.east - b.east, a.north - b.north);
  const geodesic = geodesicDistance(SUGAMO.lon, SUGAMO.lat, OTSUKA.lon, OTSUKA.lat);

  // Facteur d'échelle attendu : k0 = 0,9999 au méridien central, croissant en
  // E²/(2R²). À ~21,6 km à l'est, cela vaut 0,999906 — jamais plus de 2·10⁻⁴
  // d'écart relatif dans la zone utile du prototype.
  const ratio = projected / geodesic;
  assert.ok(ratio > 0.99985 && ratio < 1.00005, `ratio d'échelle inattendu : ${ratio}`);
  // Et en valeur absolue : moins de 20 cm d'écart sur un kilomètre.
  assert.ok(Math.abs(projected - geodesic) < 0.2, `écart ${projected - geodesic} m`);
});

test('EPSG:6677 — un déplacement de 100 m en projection fait bien 100 m au sol', () => {
  const p = makeProjector(6677);
  const a = p.forward(SUGAMO.lon, SUGAMO.lat);
  const b = p.inverse(a.east + 100, a.north);
  const measured = geodesicDistance(SUGAMO.lon, SUGAMO.lat, b.lon, b.lat);
  assert.ok(Math.abs(measured - 100) < 0.02, `100 m projetés = ${measured} m au sol`);
});

test('zone inconnue — échec explicite plutôt qu’une projection au hasard', () => {
  assert.throws(() => makeProjector(3857), /Zone de projection inconnue/);
  assert.throws(() => pickJapanZone(2.35, 48.85), /Aucune zone de projection métrique/);
  assert.equal(pickJapanZone(SUGAMO.lon, SUGAMO.lat), 6677);
});

test('distance point/segment', () => {
  assert.equal(pointSegmentDistance(0, 5, -10, 0, 10, 0), 5);
  // Au-delà de l'extrémité, c'est la distance au sommet qui compte.
  assert.equal(pointSegmentDistance(20, 0, -10, 0, 10, 0), 10);
  // Segment dégénéré : pas de division par zéro.
  assert.equal(pointSegmentDistance(3, 4, 0, 0, 0, 0), 5);
});

test('projection sur une polyligne : distance latérale et abscisse curviligne', () => {
  const points = [
    { east: 0, north: 0 },
    { east: 100, north: 0 },
    { east: 100, north: 100 },
  ];
  const cumulative = [0, 100, 200];
  const a = projectOnPolyline(50, 20, points, cumulative);
  assert.equal(a.distance, 20);
  assert.equal(a.s, 50);
  const b = projectOnPolyline(130, 60, points, cumulative);
  assert.equal(b.distance, 30);
  assert.equal(b.s, 160);
});
