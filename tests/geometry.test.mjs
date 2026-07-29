// Triangulation : orientation, trous, dégénérescences.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundsOf,
  newellNormal,
  openRing,
  polygonArea,
  triangulatePolygon,
} from '../scripts/plateau/lib/geometry.mjs';

const SQUARE = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 0, 10],
  [0, 0, 10],
];

test('openRing retire le sommet de fermeture', () => {
  assert.equal(openRing([...SQUARE, SQUARE[0]]).length, 4);
  assert.equal(openRing(SQUARE).length, 4);
});

test('aire et normale de Newell', () => {
  assert.equal(polygonArea(SQUARE), 100);
  const n = newellNormal(SQUARE);
  // Carré parcouru dans le sens horaire vu de +Y : normale vers -Y.
  assert.ok(Math.abs(n[0]) < 1e-9 && Math.abs(n[2]) < 1e-9);
  assert.ok(n[1] < 0);
});

test('triangulation d’un carré : deux triangles, normale respectée', () => {
  const t = triangulatePolygon(SQUARE);
  assert.equal(t.triangles, 2);
  assert.equal(t.positions.length, 18);
  // Chaque triangle produit doit pointer dans le même sens que le polygone.
  for (let i = 0; i < t.positions.length; i += 9) {
    const a = t.positions.slice(i, i + 3);
    const b = t.positions.slice(i + 3, i + 6);
    const c = t.positions.slice(i + 6, i + 9);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const dot = cross[0] * t.normal[0] + cross[1] * t.normal[1] + cross[2] * t.normal[2];
    assert.ok(dot > 0, 'triangle orienté à l’envers');
  }
});

test('le sens de rotation de la source ne change pas le résultat', () => {
  const cw = triangulatePolygon(SQUARE);
  const ccw = triangulatePolygon([...SQUARE].reverse());
  assert.equal(cw.triangles, ccw.triangles);
  // Normales opposées, mais chaque triangle reste cohérent avec la sienne.
  assert.ok(cw.normal[1] * ccw.normal[1] < 0);
});

test('polygone concave en L', () => {
  const l = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 0, 4],
    [4, 0, 4],
    [4, 0, 10],
    [0, 0, 10],
  ];
  const t = triangulatePolygon(l);
  assert.equal(t.triangles, 4);
  assert.equal(Math.round(polygonArea(l)), 64);
});

test('anneau intérieur (patio) : trou réellement percé', () => {
  const hole = [
    [3, 0, 3],
    [3, 0, 7],
    [7, 0, 7],
    [7, 0, 3],
  ];
  const plain = triangulatePolygon(SQUARE);
  const holed = triangulatePolygon(SQUARE, [hole]);
  assert.ok(holed.triangles > plain.triangles, 'le trou n’a produit aucun triangle en plus');
  // Aire totale des triangles = 100 - 16.
  let area = 0;
  for (let i = 0; i < holed.positions.length; i += 9) {
    const p = holed.positions;
    const e1 = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]];
    const e2 = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]];
    area +=
      Math.hypot(
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ) / 2;
  }
  assert.ok(Math.abs(area - 84) < 1e-6, `aire triangulée ${area}, attendu 84`);
});

test('surfaces dégénérées : rien plutôt qu’un triangle faux', () => {
  assert.equal(triangulatePolygon([[0, 0, 0], [1, 0, 0]]), null);
  // Trois points alignés : normale nulle.
  assert.equal(triangulatePolygon([[0, 0, 0], [1, 0, 0], [2, 0, 0]]), null);
});

test('mur vertical : triangulation dans un plan non horizontal', () => {
  const wall = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 8, 0],
    [0, 8, 0],
  ];
  const t = triangulatePolygon(wall);
  assert.equal(t.triangles, 2);
  assert.ok(Math.abs(Math.abs(t.normal[2]) - 1) < 1e-9, 'normale du mur pas selon Z');
});

test('boîte englobante', () => {
  const b = boundsOf([0, 1, 2, -3, 4, 5]);
  assert.deepEqual(b.min, [-3, 1, 2]);
  assert.deepEqual(b.max, [0, 4, 5]);
});
