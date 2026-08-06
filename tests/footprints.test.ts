// Empreintes du corridor 0–1 km : hauteurs déclarées, plans estimés.
//
// La règle 11 exige qu'une grandeur estimée ne se présente jamais comme un
// relevé. Ce fichier verrouille `measured` / `footprintMeasured` et la portée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FOOTPRINTS,
  FOOTPRINT_REACH,
  FOOTPRINT_TOTAL,
} from '../src/data/footprints.ts';

const geo = JSON.parse(readFileSync(new URL('../data/geo/footprints.geojson', import.meta.url), 'utf8'));

test('le corridor fait un kilomètre, et le relevé le remplit', () => {
  assert.equal(FOOTPRINT_REACH, 1000);
  assert.ok(FOOTPRINT_TOTAL > 5000, `trop peu d’empreintes (${FOOTPRINT_TOTAL})`);
  assert.equal(geo.properties.count, FOOTPRINT_TOTAL);
  assert.equal(geo.features.length, FOOTPRINT_TOTAL);
  assert.ok(FOOTPRINTS.length > 1000 && FOOTPRINTS.length <= FOOTPRINT_TOTAL);
});

test('aucune emprise planimétrique ne se prétend relevée', () => {
  for (const f of FOOTPRINTS) {
    assert.equal(f.footprintMeasured, false, f.id);
    assert.ok(f.distance <= FOOTPRINT_REACH, `${f.id} hors corridor`);
    assert.ok(f.height > 1 && f.height < 800, `${f.id} hauteur absurde`);
    assert.equal(typeof f.measured, 'boolean');
  }
  for (const feat of geo.features) {
    assert.equal(feat.properties.footprintMeasured, false);
  }
});

test('les trente tronçons du pipeline existent', async () => {
  const { PROTOTYPE_SEGMENTS } = await import('../scripts/plateau/config.mjs');
  assert.equal(Object.keys(PROTOTYPE_SEGMENTS).length, 30);
  assert.ok(PROTOTYPE_SEGMENTS['shibuya-ebisu']);
  assert.ok(PROTOTYPE_SEGMENTS['sugamo-otsuka']);
  assert.ok(PROTOTYPE_SEGMENTS['tokyo-kanda']);
  const segs = new Set(Object.values(PROTOTYPE_SEGMENTS).map((s) => s.segment));
  assert.equal(segs.size, 30);
});
