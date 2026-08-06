// Provenance obligatoire, et faits datés branchés sur le menu.
//
// Un enregistrement géographique incomplet ne passe pas. Un fait semi-statique
// disparaît hors de sa fenêtre : choisir 2018 dans le menu et voir Takanawa
// Gateway s'effacer, c'est exactement ce que la règle 10 promet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DATED_FACTS,
  GEO_REGISTRY,
  HORIZON_DATED,
  STATION_DATED,
  factVisible,
  geoRecordIssue,
  visibleAt,
  type GeoRecord,
} from '../src/data/geo/provenance.ts';

test('tout enregistrement du registre est complet', () => {
  assert.ok(GEO_REGISTRY.length >= 10, `registre trop maigre (${GEO_REGISTRY.length})`);
  for (const r of GEO_REGISTRY) {
    const issue = geoRecordIssue(r);
    assert.equal(issue, null, issue ?? r.id);
  }
});

test('un enregistrement incomplet est refusé', () => {
  assert.ok(geoRecordIssue(null));
  assert.ok(geoRecordIssue({}));
  assert.ok(
    geoRecordIssue({
      id: 'x',
      layer: 'DATA_STATIC',
      source: 'OSM',
      license: 'ODbL 1.0',
      datasetDate: 'pas-une-date',
      lon: 0,
      lat: 0,
      lod: 0,
      minDistance: 0,
      maxDistance: 1,
      verifiedAt: '2026-08-06',
      measured: true,
    }),
  );
  const good: GeoRecord = {
    id: 'ok',
    layer: 'DATA_STATIC',
    source: 'OSM',
    license: 'ODbL 1.0',
    datasetDate: '2026-01-01',
    lon: 139.7,
    lat: 35.6,
    lod: 1,
    minDistance: 0,
    maxDistance: 1000,
    verifiedAt: '2026-08-06',
    measured: false,
  };
  assert.equal(geoRecordIssue(good), null);
});

test('Takanawa Gateway disparaît avant mars 2020', () => {
  const before = { year: 2018, month: 6, day: 1 };
  const after = { year: 2021, month: 6, day: 1 };
  assert.equal(factVisible('takanawa-gateway-station', before), false);
  assert.equal(factVisible('takanawa-gateway-station', after), true);
  assert.equal(factVisible(STATION_DATED['25:whiteLatticeRoof'], before), false);
  assert.equal(factVisible(STATION_DATED['25:whiteLatticeRoof'], after), true);
});

test('Scramble Square n’existe pas avant novembre 2019', () => {
  assert.equal(factVisible(HORIZON_DATED.scramble, { year: 2018, month: 1, day: 1 }), false);
  assert.equal(factVisible(HORIZON_DATED.scramble, { year: 2020, month: 1, day: 1 }), true);
});

test('la gare de bois de Harajuku disparaît après sa démolition', () => {
  const fact = DATED_FACTS.find((f) => f.id === 'harajuku-wooden-station')!;
  assert.equal(visibleAt(fact, { year: 2019, month: 1, day: 1 }), true);
  assert.equal(visibleAt(fact, { year: 2021, month: 1, day: 1 }), false);
});

test('public/world/LICENSE.md cite les trois sources', () => {
  const text = readFileSync(new URL('../public/world/LICENSE.md', import.meta.url), 'utf8');
  assert.match(text, /ODbL/);
  assert.match(text, /国土地理院|出典：国土地理院/);
  assert.match(text, /CC BY 4\.0|PLATEAU/);
});
