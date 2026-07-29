// Manifeste, licences et validation des livrables publiés.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASETS, PLATEAU_CONFIG, PLATEAU_PORTAL, PROTOTYPE_SEGMENTS } from '../scripts/plateau/config.mjs';
import { MANIFEST_VERSION, buildLicense, buildManifest } from '../scripts/plateau/lib/manifest.mjs';
import {
  readGameSegment,
  resolvePublicUrl,
  validateChunkCoverage,
  validateRoute,
} from '../scripts/plateau/validate.mjs';

const PROTO = PLATEAU_CONFIG.prototype;
const ROUTE = { totalLength: 1000, points: [] };
const FAKE_CHUNKS = [
  {
    id: `${PROTO.name}-000`,
    segment: PROTO.segment,
    url: `world/plateau/${PROTO.name}-000.glb`,
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
  // Le tronçon vient de la configuration : ces assertions doivent survivre à
  // un changement de tronçon, c'est justement ce qu'on veut vérifier.
  assert.equal(manifest.prototype.segment, PROTO.segment);
  assert.equal(manifest.prototype.from, PROTO.from);
  assert.equal(manifest.prototype.to, PROTO.to);
  assert.equal(manifest.prototype.name, PROTO.name);
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

test('le jeu et le pipeline visent le même tronçon', () => {
  const source = readFileSync(join(PLATEAU_CONFIG.paths.root, 'src/systems/plateau.ts'), 'utf8');
  assert.equal(
    readGameSegment(source),
    PROTO.segment,
    'PLATEAU_SEGMENT (src/systems/plateau.ts) ne correspond pas au tronçon configuré ' +
      'dans scripts/plateau/config.mjs — le décor ne s’afficherait jamais.',
  );
  assert.throws(() => readGameSegment('rien du tout'), /PLATEAU_SEGMENT introuvable/);
});

test('aucune URL de jeu de données n’est codée en dur', () => {
  // Régression : une première version portait une URL de fiche CKAN
  // extrapolée (« plateau-tokyo23ku-2023 ») qui renvoyait un 404. Le slug d'un
  // jeu PLATEAU n'est pas déductible — la convention a changé entre millésimes
  // — donc le pipeline ne doit en deviner aucun : il pointe le catalogue et
  // attend une --url de l'utilisateur.
  for (const [id, entry] of Object.entries(DATASETS)) {
    assert.equal(entry.url, '', `${id} : une URL est codée en dur (${entry.url})`);
    assert.equal(entry.approxSizeMB, null, `${id} : taille devinée au lieu d'un HEAD`);
  }
  // Les seules URL de fiche admises sont celles qu'une source primaire donne.
  const ATTESTED = new Set([
    // Jeu Tokyo 23区 courant, sans millésime : c'est l'URL que les anciens
    // jeux (…-citygml-2020, …-obj-2020, etc.) désignent eux-mêmes depuis le
    // 1er avril 2022 par l'avis « 最新のデータは次のURLから取得することができます ».
    'https://www.geospatial.jp/ckan/dataset/plateau-tokyo23ku',
  ]);
  // Et surtout : plus jamais de slug à millésime extrapolé.
  for (const [id, entry] of Object.entries(DATASETS)) {
    assert.doesNotMatch(
      entry.page ?? '',
      /plateau-tokyo23ku-\d{4}/,
      `${id} : la convention « tokyo23ku-<année> » a été abandonnée en 2022.`,
    );
  }
  for (const [id, entry] of Object.entries(DATASETS)) {
    if (!entry.page) continue;
    assert.ok(
      ATTESTED.has(entry.page),
      `${id} : « ${entry.page} » n'est attestée par aucune source primaire.`,
    );
  }
  assert.equal(PLATEAU_PORTAL.catalog, 'https://www.geospatial.jp/ckan/dataset');
});

test('la table des tronçons est cohérente', () => {
  for (const [id, seg] of Object.entries(PROTOTYPE_SEGMENTS)) {
    assert.equal(seg.name, id, `${id} : le nom ne correspond pas à sa clé`);
    assert.equal(
      (seg.arrivalStation + 29) % 30,
      seg.segment,
      `${id} : arrivalStation ${seg.arrivalStation} ne mène pas au segment ${seg.segment}`,
    );
    for (const end of ['from', 'to']) {
      const a = seg.anchors[end];
      assert.ok(a.lon > 139.6 && a.lon < 139.85, `${id}.${end} : longitude ${a.lon} hors de Tokyo`);
      assert.ok(a.lat > 35.5 && a.lat < 35.85, `${id}.${end} : latitude ${a.lat} hors de Tokyo`);
    }
    // Viaduc ⇒ rail au-dessus de la rue ; tranchée ⇒ en dessous.
    assert.notEqual(seg.railAboveGround, 0, `${id} : railAboveGround doit être signé`);
  }
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
