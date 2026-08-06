// Empreintes du corridor 0–1 km : contours OSM, hauteurs déclarées.
//
// La règle 11 exige qu'une grandeur estimée ne se présente jamais comme un
// relevé. L'emprise planimétrique, elle, est tirée du polygone OSM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FOOTPRINTS,
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
  assert.ok(FOOTPRINTS.length > 1000 && FOOTPRINTS.length <= FOOTPRINT_TOTAL);
  // Budget versionnable : le pack compact doit tenir sous ~3 Mo.
  const bytes = Buffer.byteLength(JSON.stringify(pack));
  assert.ok(bytes < 3_200_000, `pack trop gros (${bytes} octets)`);
});

test('les emprises viennent du polygone OSM, pas d’un carré inventé', () => {
  assert.equal(pack.footprintMeasured, true);
  for (const f of FOOTPRINTS) {
    assert.equal(f.footprintMeasured, true, f.id);
    assert.ok(f.distance <= FOOTPRINT_REACH, `${f.id} hors corridor`);
    assert.ok(f.height > 1 && f.height < 800, `${f.id} hauteur absurde`);
    assert.ok(f.plate >= 1 && f.plate < 500, `${f.id} emprise absurde (${f.plate})`);
    assert.equal(typeof f.measured, 'boolean');
  }
  for (const row of pack.rows) {
    assert.equal(row.length, pack.columns.length);
    assert.ok(row[4] >= 10, "plate10 trop petit pour un vrai contour"); // > 2 m
  }
});

test('les trente tronçons du pipeline existent et le tracé vient de la boucle', async () => {
  const { PROTOTYPE_SEGMENTS } = await import('../scripts/plateau/config.mjs');
  const slugs = Object.keys(PROTOTYPE_SEGMENTS);
  assert.equal(slugs.length, 30);
  assert.ok(PROTOTYPE_SEGMENTS['shibuya-ebisu']);
  assert.ok(PROTOTYPE_SEGMENTS['tokyo-kanda']);
  const segs = new Set(Object.values(PROTOTYPE_SEGMENTS).map((s) => s.segment));
  assert.equal(segs.size, 30);

  for (const slug of slugs) {
    const route = JSON.parse(
      readFileSync(new URL(`../data/geo/${slug}.geojson`, import.meta.url), 'utf8'),
    );
    assert.equal(route.features[0].properties.approximate, false, slug);
    assert.match(route.features[0].properties.source, /yamanote-loop|OpenStreetMap/, slug);
    assert.ok(route.features[0].geometry.coordinates.length >= 2, slug);
  }
});
