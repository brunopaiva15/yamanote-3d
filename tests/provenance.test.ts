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
  NEAR_DATED,
  STATION_DATED,
  factVisible,
  geoRecordIssue,
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

test('Miyashita Park, Sakura Stage et Harajuku bois sont branchés sur le rendu', () => {
  assert.equal(NEAR_DATED['osm-way-116806278'], 'miyashita-park');
  assert.equal(STATION_DATED['19:glassTowerCluster'], 'sakura-stage');
  assert.equal(STATION_DATED['18:officeBlock'], 'harajuku-wooden-station');
  // 2018 : Takanawa et Scramble absents ; Harajuku bois encore là ; Miyashita ancien.
  const y2018 = { year: 2018, month: 6, day: 1 };
  assert.equal(factVisible('takanawa-gateway-station', y2018), false);
  assert.equal(factVisible('scramble-square', y2018), false);
  assert.equal(factVisible('sakura-stage', y2018), false);
  assert.equal(factVisible('miyashita-park', y2018), false);
  assert.equal(factVisible('harajuku-wooden-station', y2018), true);
  // 2024 : bois parti, Sakura Stage présent, Miyashita reconstruit présent.
  const y2024 = { year: 2024, month: 6, day: 1 };
  assert.equal(factVisible('harajuku-wooden-station', y2024), false);
  assert.equal(factVisible('sakura-stage', y2024), true);
  assert.equal(factVisible('miyashita-park', y2024), true);
});

test('public/world/LICENSE.md cite les deux sources', () => {
  const text = readFileSync(new URL('../public/world/LICENSE.md', import.meta.url), 'utf8');
  assert.match(text, /ODbL/);
  assert.match(text, /国土地理院|出典：国土地理院/);
});
