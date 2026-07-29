// Comportement des commandes du pipeline : --dry-run, détection des outils
// manquants, garde-fous de configuration. Ces tests lancent réellement les
// scripts en sous-processus — c'est le seul moyen de vérifier les codes de
// sortie et les messages que verra l'utilisateur.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PLATEAU_CONFIG } from '../scripts/plateau/config.mjs';
import { parseArgs } from '../scripts/plateau/lib/args.mjs';
import { detectAxisOrder, readConvertedGeoJson } from '../scripts/plateau/convert.mjs';
import { expandCommandTemplate, whichTool } from '../scripts/plateau/lib/run.mjs';

const run = promisify(execFile);
const ROOT = PLATEAU_CONFIG.paths.root;
const script = (name) => join(ROOT, 'scripts/plateau', name);

async function exec(args, env = {}) {
  try {
    const { stdout, stderr } = await run(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('--dry-run réussit et ne produit aucune étape coûteuse', async () => {
  const before = existsSync(PLATEAU_CONFIG.paths.converted)
    ? statSync(PLATEAU_CONFIG.paths.converted).mtimeMs
    : null;
  const res = await exec([script('build.mjs'), '--dry-run']);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Aucune étape coûteuse exécutée/);
  assert.match(res.stdout, /Prototype : Sugamo → Otsuka \(segment 10\)/);
  assert.match(res.stdout, /Corridor ±300 m · chunks 400 m/);
  assert.match(res.stdout, /EPSG:6697 → EPSG:6677/);
  assert.match(res.stdout, /sugamo-otsuka-000\.glb/);
  assert.match(res.stdout, /manifest\.json/);
  const after = existsSync(PLATEAU_CONFIG.paths.converted)
    ? statSync(PLATEAU_CONFIG.paths.converted).mtimeMs
    : null;
  assert.equal(after, before, '--dry-run a touché le répertoire de conversion');
});

test('--dry-run signale un corridor modifié par l’environnement', async () => {
  const res = await exec([script('build.mjs'), '--dry-run'], {
    PLATEAU_CORRIDOR_M: '120',
    PLATEAU_CHUNK_M: '250',
  });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Corridor ±120 m · chunks 250 m/);
});

test('convertisseur externe absent : erreur claire et code de sortie 1', async () => {
  if (whichTool('nusamai')) {
    // Un vrai nusamai est installé : le test de l'ABSENCE n'a plus de sens.
    return;
  }
  const res = await exec([script('convert.mjs'), '--converter', 'nusamai']);
  assert.equal(res.code, 1);
  assert.match(res.stderr, /PLATEAU GIS Converter introuvable/);
  assert.match(res.stderr, /PLATEAU_CONVERTER_PATH/);
  assert.match(res.stderr, /--converter builtin/);
});

test('PLATEAU_CONVERTER_PATH qui ne pointe sur rien : erreur nommant le chemin', async () => {
  const res = await exec([script('convert.mjs'), '--converter', 'nusamai'], {
    PLATEAU_CONVERTER_PATH: '/chemin/qui/nexiste/pas/nusamai',
  });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /\/chemin\/qui\/nexiste\/pas\/nusamai/);
});

test('--converter custom sans gabarit : erreur explicite', async () => {
  const res = await exec([script('convert.mjs'), '--converter', 'custom'], {
    PLATEAU_CONVERTER_CMD: '',
  });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /PLATEAU_CONVERTER_CMD non défini/);
});

test('--source dataset sans URL : le pipeline explique où la trouver', async () => {
  const res = await exec([script('download.mjs'), '--source', 'dataset'], {
    PLATEAU_DATASET_URL: '',
  });
  assert.equal(res.code, 1);
  assert.match(res.stderr, /Aucune URL configurée/);
  assert.match(res.stderr, /geospatial\.jp/);
  assert.match(res.stderr, /--zip/);
});

test('option inconnue : le script refuse au lieu de l’ignorer', async () => {
  const res = await exec([script('build.mjs'), '--turbo']);
  assert.equal(res.code, 1);
  assert.match(res.stderr, /Option inconnue : --turbo/);
});

test('validate.mjs valide les livrables publiés', async (t) => {
  if (!existsSync(join(PLATEAU_CONFIG.paths.out, 'manifest.json'))) {
    t.skip('aucun build publié');
    return;
  }
  const res = await exec([script('validate.mjs')]);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Manifeste valide/);
});

test('parseArgs : drapeaux, options, kebab-case et valeurs collées', () => {
  const args = parseArgs(['--dry-run', '--max-mb=512', '--url', 'http://x', 'reste'], {
    flags: ['dryRun', 'force'],
    options: ['maxMb', 'url'],
  });
  assert.equal(args.dryRun, true);
  assert.equal(args.force, false);
  assert.equal(args.maxMb, '512');
  assert.equal(args.url, 'http://x');
  assert.deepEqual(args._, ['reste']);
  assert.throws(() => parseArgs(['--inconnu'], { flags: [], options: [] }), /Option inconnue/);
});

test('gabarit de commande : substitution et jetons inconnus', () => {
  const { command, args } = expandCommandTemplate('ogr2ogr -f GeoJSON {output} {input}', {
    input: '/a/b.gml',
    output: '/tmp/c.geojson',
    epsg: 6697,
  });
  assert.equal(command, 'ogr2ogr');
  assert.deepEqual(args, ['-f', 'GeoJSON', '/tmp/c.geojson', '/a/b.gml']);
  assert.throws(
    () => expandCommandTemplate('outil {inconnu}', { input: 'x', output: 'y', epsg: 1 }),
    /Jeton inconnu/,
  );
});

test('l’ordre des axes de la sortie du convertisseur est détecté, pas supposé', () => {
  assert.equal(detectAxisOrder([139.73, 35.73, 60]), 'lon,lat');
  assert.equal(detectAxisOrder([35.73, 139.73, 60]), 'lat,lon');
  assert.throws(() => detectAxisOrder([2.35, 48.85, 0]), /Coordonnées hors du Japon/);
});

test('lecture d’une sortie GeoJSON de convertisseur externe', () => {
  const geojson = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { gml_id: 'bldg-1', measuredHeight: 9.5 },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [139.7381, 35.7331, 65],
                [139.7383, 35.7331, 65],
                [139.7383, 35.7332, 65],
                [139.7381, 35.7331, 65],
              ],
            ],
          ],
        },
      },
    ],
  });
  const { buildings, axis } = readConvertedGeoJson(geojson, 'test');
  assert.equal(axis, 'lon,lat');
  assert.equal(buildings.length, 1);
  assert.equal(buildings[0].id, 'bldg-1');
  assert.equal(buildings[0].measuredHeight, 9.5);
  assert.equal(buildings[0].polygons[0].exterior.length, 4);
  assert.throws(
    () => readConvertedGeoJson('{"type":"FeatureCollection","features":[]}', 'vide'),
    /aucune entité/,
  );
});

test('le manifeste publié annonce honnêtement la nature de sa source', (t) => {
  const path = join(PLATEAU_CONFIG.paths.out, 'manifest.json');
  if (!existsSync(path)) {
    t.skip('aucun build publié');
    return;
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(typeof manifest.source.synthetic, 'boolean');
  const license = readFileSync(join(PLATEAU_CONFIG.paths.out, 'LICENSE.md'), 'utf8');
  if (manifest.source.synthetic) {
    assert.match(license, /AUCUNE donnée Project PLATEAU/);
  } else {
    assert.match(license, /Project PLATEAU/);
  }
});
