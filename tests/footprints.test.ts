// Empreintes du corridor 0–1 km : contours OSM, hauteurs déclarées.
//
// La règle 11 exige qu'une grandeur estimée ne se présente jamais comme un
// relevé. L'emprise planimétrique, elle, est tirée du polygone OSM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FOOTPRINT_ESTIMATED,
  FOOTPRINT_MEASURED,
  FOOTPRINT_REACH,
  FOOTPRINT_TOTAL,
  FOOTPRINT_SURVEY,
} from '../src/data/footprints.ts';

const pack = JSON.parse(readFileSync(new URL('../data/geo/footprints.json', import.meta.url), 'utf8'));

test('le corridor fait un kilomètre, et le relevé le remplit', () => {
  assert.equal(FOOTPRINT_REACH, 1000);
  assert.ok(FOOTPRINT_SURVEY > 50000, `relevé trop maigre (${FOOTPRINT_SURVEY})`);
  assert.ok(FOOTPRINT_TOTAL > 10000, `versionné trop maigre (${FOOTPRINT_TOTAL})`);
  assert.equal(pack.count, FOOTPRINT_TOTAL);
  assert.equal(pack.survey, FOOTPRINT_SURVEY);
  assert.equal(pack.footprintMeasured, true);
  assert.equal(FOOTPRINT_MEASURED + FOOTPRINT_ESTIMATED, FOOTPRINT_TOTAL);
  assert.equal(pack.measuredHeights, FOOTPRINT_MEASURED);
  assert.equal(pack.estimatedHeights, FOOTPRINT_ESTIMATED);
  // Budget versionnable : le pack compact doit tenir sous ~3 Mo.
  const bytes = Buffer.byteLength(JSON.stringify(pack));
  assert.ok(bytes < 3_200_000, `pack trop gros (${bytes} octets)`);
});

test('les emprises viennent du polygone OSM, pas d’un carré inventé', () => {
  assert.equal(pack.footprintMeasured, true);
  const col = Object.fromEntries(pack.columns.map((c, i) => [c, i]));
  for (const row of pack.rows) {
    assert.equal(row.length, pack.columns.length);
    assert.ok(row[col.plate10] >= 10, 'plate10 trop petit pour un vrai contour'); // > 2 m
    assert.ok(row[col.distance] <= FOOTPRINT_REACH, 'hors corridor');
    assert.ok(row[col.h10] > 10 && row[col.h10] < 8000, 'hauteur absurde');
    assert.ok(row[col.measured] === 0 || row[col.measured] === 1);
    assert.ok(Number.isInteger(row[col.osmWay]) && row[col.osmWay] > 0);
  }
});
