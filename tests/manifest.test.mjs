// Manifeste, licences et validation des livrables publiés.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATEAU_CONFIG } from '../scripts/plateau/config.mjs';
import { MANIFEST_VERSION, buildLicense, buildManifest } from '../scripts/plateau/lib/manifest.mjs';
import {
  resolvePublicUrl,
  validateChunkCoverage,
  validateRoute,
} from '../scripts/plateau/validate.mjs';

const ROUTE = { totalLength: 1000, points: [] };
const FAKE_CHUNKS = [
  {
    id: 'sugamo-otsuka-000',
    segment: 10,
    url: 'world/plateau/sugamo-otsuka-000.glb',
    startDistance: 0,
    endDistance: 400,
    offset: [1, 2, 3],
    boundingRadius: 300,
    fileSize: 1234,
    buildings: 10,
    after: { triangles: 100, vertices: 200, materials: 2, textures: 0 },
  },
];

test('buildManifest produit la structure attendue par le jeu', () => {
  const manifest = buildManifest({
    chunks: FAKE_CHUNKS,
    source: { name: 'test', dataset: 'x', license: 'y' },
    route: { epsg: 6677, totalLength: 1000, frame: { origin: { east: 1, north: 2, up: 3 } } },
  });
  assert.equal(manifest.version, MANIFEST_VERSION);
  assert.equal(manifest.prototype.segment, 10);
  assert.equal(manifest.prototype.from, 'Sugamo');
  assert.equal(manifest.prototype.to, 'Otsuka');
  assert.deepEqual(manifest.coordinateSystem, {
    units: 'meters',
    east: '+X',
    up: '+Y',
    north: '-Z',
    projectedEpsg: 6677,
    origin: { east: 1, north: 2, up: 3 },
  });
  assert.ok(Number.isFinite(Date.parse(manifest.generatedAt)));
  const chunk = manifest.chunks[0];
  for (const key of ['id', 'segment', 'url', 'startDistance', 'endDistance', 'offset']) {
    assert.ok(key in chunk, `champ obligatoire manquant : ${key}`);
  }
  assert.equal(chunk.triangles, 100);
});

test('buildLicense distingue l’échantillon synthétique des vraies données', () => {
  const synthetic = buildLicense({
    source: { kind: 'sample' },
    routeProperties: { source: 'Approximation géométrique', license: 'CC0' },
  });
  assert.match(synthetic, /AUCUNE donnée Project PLATEAU/);
  assert.match(synthetic, /## 1\. Données sources/);
  assert.match(synthetic, /## 2\. Transformations appliquées/);
  assert.match(synthetic, /## 3\. Outils utilisés/);
  assert.match(synthetic, /## 4\. Attributions requises/);

  const real = buildLicense({
    source: {
      kind: 'dataset',
      label: 'Tokyo 23区',
      license: 'CC BY 4.0',
      attribution: '出典：国土交通省',
      dataset: 'https://example.invalid/x.zip',
    },
    routeProperties: {
      source: 'OpenStreetMap (Overpass API)',
      license: 'ODbL 1.0',
      attribution: '© les contributeurs OpenStreetMap',
    },
  });
  assert.match(real, /出典：国土交通省/);
  assert.match(real, /ODbL/);
  assert.doesNotMatch(real, /AUCUNE donnée Project PLATEAU/);
});

test('les URL de chunk ne peuvent pas sortir de public/', () => {
  assert.ok(resolvePublicUrl('world/plateau/a.glb').endsWith('public/world/plateau/a.glb'));
  assert.throws(() => resolvePublicUrl('/etc/passwd'), /URL de chunk invalide/);
  assert.throws(() => resolvePublicUrl('../../secret.glb'), /URL de chunk invalide/);
  assert.throws(() => resolvePublicUrl('https://ailleurs.invalid/a.glb'), /URL de chunk invalide/);
  assert.throws(() => resolvePublicUrl(''), /vide ou absente/);
});

test('validateRoute exige une abscisse strictement croissante et des bornes exactes', () => {
  assert.deepEqual(
    validateRoute({
      totalLength: 10,
      points: [
        { s: 0, x: 0, y: 0, z: 0 },
        { s: 5, x: 1, y: 0, z: 0 },
        { s: 10, x: 2, y: 0, z: 0 },
      ],
    }),
    [],
  );
  assert.match(
    validateRoute({ totalLength: 10, points: [{ s: 1, x: 0, y: 0, z: 0 }, { s: 10, x: 0, y: 0, z: 0 }] })[0],
    /premier point/,
  );
  assert.match(
    validateRoute({ totalLength: 99, points: [{ s: 0, x: 0, y: 0, z: 0 }, { s: 10, x: 0, y: 0, z: 0 }] })[0],
    /totalLength/,
  );
  assert.match(
    validateRoute({
      totalLength: 10,
      points: [
        { s: 0, x: 0, y: 0, z: 0 },
        { s: 4, x: 0, y: 0, z: 0 },
        { s: 4, x: 0, y: 0, z: 0 },
        { s: 10, x: 0, y: 0, z: 0 },
      ],
    })[0],
    /croissante/,
  );
  assert.match(
    validateRoute({
      totalLength: 10,
      points: [
        { s: 0, x: 0, y: 0, z: 0 },
        { s: 10, x: Number.NaN, y: 0, z: 0 },
      ],
    })[0],
    /non finie/,
  );
  assert.deepEqual(validateRoute({ ...ROUTE }), ['route.json : moins de deux points.']);
});

test('validateChunkCoverage détecte trous et débordements', () => {
  const ok = [
    { id: 'a', startDistance: 0, endDistance: 400 },
    { id: 'b', startDistance: 400, endDistance: 800 },
  ];
  assert.deepEqual(validateChunkCoverage(ok, 800), []);
  const gap = [
    { id: 'a', startDistance: 0, endDistance: 400 },
    { id: 'b', startDistance: 450, endDistance: 800 },
  ];
  assert.match(validateChunkCoverage(gap, 800)[0], /Discontinuité/);
  assert.match(validateChunkCoverage(ok, 1200)[0], /dernier chunk finit/);
  assert.deepEqual(validateChunkCoverage([], 100), ['Manifeste : aucun chunk.']);
});

test('les livrables publiés sont cohérents avec le manifeste', (t) => {
  const dir = PLATEAU_CONFIG.paths.out;
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    t.skip('aucun build publié — lancez `npm run world:build:prototype`');
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const route = JSON.parse(readFileSync(join(dir, 'route.json'), 'utf8'));
  assert.equal(manifest.prototype.segment, route.segment);
  assert.deepEqual(validateRoute(route), []);
  assert.deepEqual(validateChunkCoverage(manifest.chunks, route.totalLength), []);
  for (const chunk of manifest.chunks) {
    const file = resolvePublicUrl(chunk.url);
    assert.ok(existsSync(file), `GLB manquant : ${file}`);
    assert.equal(readFileSync(file).length, chunk.fileSize);
  }
  assert.ok(existsSync(join(dir, 'LICENSE.md')));
  assert.ok(existsSync(join(dir, 'build-report.json')));
});
