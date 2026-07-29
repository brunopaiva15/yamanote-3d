// Orchestrateur du pipeline PLATEAU → GLB.
//
//   npm run world:build:prototype
//   npm run world:build:prototype -- --dry-run
//   npm run world:build:prototype -- --source dataset --url <URL> --yes
//   npm run world:build:prototype -- --zip ~/Téléchargements/13100_tokyo23-ku.zip
//   npm run world:build:prototype -- --converter nusamai
//   npm run world:build:prototype -- --force
//   npm run world:build:prototype -- --skip-download --skip-convert
//
// --dry-run vérifie les outils, la configuration et les chemins, affiche ce
// qui serait téléchargé et produit, et ne lance AUCUNE étape coûteuse.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASETS, PLATEAU_CONFIG, PLATEAU_PORTAL } from './config.mjs';
import { createReporter, humanBytes, PipelineError, runMain } from './lib/log.mjs';
import { isEntryPoint, parseArgs } from './lib/args.mjs';
import { readMarker } from './lib/cache.mjs';
import { whichTool } from './lib/run.mjs';
import { readLineString } from './lib/route.mjs';
import { detectConverter, converterVersion } from './convert.mjs';
import { optimizeAll } from './optimize.mjs';
import { resolveSource } from './download.mjs';
import { buildLicense, buildManifest, writeArtifacts } from './lib/manifest.mjs';
import { validate } from './validate.mjs';

const FLAGS = ['dryRun', 'force', 'yes', 'skipDownload', 'skipConvert', 'skipValidate'];
const OPTIONS = ['source', 'url', 'zip', 'dataset', 'maxMb', 'converter'];

/** Inventaire des outils : ce qui est là, ce qui manque, ce que ça implique. */
export async function checkTools(args, reporter) {
  const report = { node: process.version, sharp: null, converter: null, converterVersion: null };

  try {
    const sharp = (await import('sharp')).default;
    report.sharp = sharp.versions?.vips ? `libvips ${sharp.versions.vips}` : 'présent';
  } catch (err) {
    reporter.warn(`sharp indisponible (${err.message}) : les textures ne seront pas recompressées.`);
  }

  const kind = args.converter ?? process.env.PLATEAU_CONVERTER ?? 'auto';
  if (kind === 'builtin') {
    report.converter = 'builtin';
    reporter.info('Convertisseur : lecteur CityGML intégré (demandé explicitement).');
  } else {
    let converter = null;
    try {
      converter = detectConverter(kind);
    } catch (err) {
      if (kind === 'auto') throw err;
      // --converter nusamai|custom manquant : on remonte l'erreur telle quelle.
      throw err;
    }
    if (converter) {
      report.converter = converter.kind;
      report.converterVersion = await converterVersion(converter);
      reporter.info(
        `Convertisseur : ${converter.kind}${report.converterVersion ? ` (${report.converterVersion})` : ''}` +
          `${converter.path ? ` — ${converter.path}` : ''}`,
      );
    } else {
      report.converter = 'builtin';
      reporter.warn(
        'PLATEAU GIS Converter introuvable dans le PATH et PLATEAU_CONVERTER_PATH non défini : ' +
          'le pipeline utilisera le lecteur CityGML intégré (LOD1/LOD2 sans textures).',
      );
    }
  }

  // Outils facultatifs, signalés pour information.
  for (const [name, why] of [
    ['ogr2ogr', 'GDAL — utilisable via --converter custom'],
    ['blender', 'non utilisé par ce pipeline'],
  ]) {
    const found = whichTool(name);
    reporter.step(`${name} : ${found ? found : 'absent'} (${why})`);
  }

  return report;
}

async function dryRun(args, reporter) {
  reporter.beginPhase('Vérification des outils');
  const tools = await checkTools(args, reporter);
  reporter.endPhase();

  reporter.beginPhase('Configuration');
  const p = PLATEAU_CONFIG.prototype;
  reporter.info(`Prototype : ${p.from} → ${p.to} (segment ${p.segment})`);
  reporter.info(`Corridor ±${p.corridorMeters} m · chunks ${p.chunkLengthMeters} m · pas ${p.routeSampleMeters} m`);
  reporter.info(
    `Bandes : proche ≤ ${PLATEAU_CONFIG.distances.near} m, intermédiaire ≤ ${PLATEAU_CONFIG.distances.medium} m, ` +
      `éloigné ≤ ${PLATEAU_CONFIG.distances.far} m (au-delà : supprimé)`,
  );
  reporter.info(
    `Projection : EPSG:${PLATEAU_CONFIG.crs.sourceEpsg} → EPSG:${PLATEAU_CONFIG.crs.projectedEpsg}, ` +
      `${PLATEAU_CONFIG.crs.east} est / ${PLATEAU_CONFIG.crs.up} haut / ${PLATEAU_CONFIG.crs.north} nord`,
  );
  reporter.info(`Textures : ${PLATEAU_CONFIG.textures.format}, max ${PLATEAU_CONFIG.textures.maxSize} px`);

  const geojson = join(PLATEAU_CONFIG.paths.geo, `${p.name}.geojson`);
  if (!existsSync(geojson)) {
    throw new PipelineError(
      `Tracé absent : ${geojson}`,
      'Lancez `node scripts/plateau/fetch-route.mjs` (ou --overpass pour la géométrie OSM).',
    );
  }
  const line = readLineString(geojson);
  reporter.info(
    `Tracé : ${geojson} — ${line.coordinates.length} points, source « ${line.properties.source} »`,
  );
  reporter.endPhase();

  reporter.beginPhase('Sources de données');
  const source = resolveSource(args);
  if (source.kind === 'sample') {
    reporter.info('Source : ÉCHANTILLON SYNTHÉTIQUE (data/plateau-sample) — aucun téléchargement.');
    const dir = join(PLATEAU_CONFIG.paths.sample, 'udx', 'bldg');
    reporter.info(`  ${existsSync(dir) ? 'présent' : 'sera généré'} : ${dir}`);
  } else if (source.kind === 'zip') {
    reporter.info(`Source : archive locale ${source.path} (aucun téléchargement).`);
  } else {
    const id = args.dataset ?? 'tokyo23ku-citygml';
    const entry = DATASETS[id];
    const url = args.url ?? entry?.url;
    reporter.info(`Source : ${entry?.label ?? id}`);
    reporter.info(`  Catalogue : ${PLATEAU_PORTAL.catalog}`);
    reporter.info(`  Fiche attestée (millésime 2022) : ${entry?.page ?? '(inconnue)'}`);
    reporter.info(`  URL : ${url || '(non configurée — --url requis)'}`);
    // Aucune taille annoncée « de mémoire » : seule celle du serveur compte.
    reporter.info('  Taille : établie par une requête HEAD avant tout téléchargement');
    reporter.info(
      `  Seuil sans confirmation : ${PLATEAU_CONFIG.download.maxAutoDownloadMB} Mo ` +
        `(--yes au-delà, plafond absolu ${PLATEAU_CONFIG.download.hardLimitMB} Mo)`,
    );
    reporter.info(`  Cache : ${PLATEAU_CONFIG.paths.downloads}`);
  }
  reporter.endPhase();

  reporter.beginPhase('Fichiers qui seraient produits');
  const { processAll } = await import('./process.mjs');
  await processAll({ ...args, dryRun: true }, reporter);
  reporter.info(`${join(PLATEAU_CONFIG.paths.out, 'manifest.json')}`);
  reporter.info(`${join(PLATEAU_CONFIG.paths.out, 'LICENSE.md')}`);
  reporter.info(`${join(PLATEAU_CONFIG.paths.out, 'build-report.json')}`);
  reporter.endPhase();

  reporter.beginPhase('État du cache');
  for (const stage of ['download', 'convert', 'process', 'optimize']) {
    const marker = readMarker(stage);
    reporter.info(
      `${stage.padEnd(9)} : ${marker ? `${marker.outputs?.length ?? 0} sortie(s), ${marker.generatedAt}` : 'jamais exécuté'}`,
    );
  }
  reporter.endPhase();

  reporter.info('\n[dry-run] Aucune étape coûteuse exécutée.');
  return { tools };
}

export async function build(args, reporter) {
  if (args.dryRun) return dryRun(args, reporter);

  const tools = await reporter.phase('Vérification des outils', () => checkTools(args, reporter));

  if (args.skipDownload) reporter.info('--skip-download : le cache de téléchargement est réutilisé tel quel.');
  if (args.skipConvert) reporter.info('--skip-convert : la conversion est réutilisée depuis le cache.');

  const stageArgs = {
    ...args,
    // --skip-* n'ont de sens que si le cache existe : sinon l'étape se relance.
    force: args.force,
  };
  if (args.skipConvert && !readMarker('convert')) {
    throw new PipelineError(
      '--skip-convert demandé mais aucune conversion en cache.',
      'Lancez une fois `npm run world:convert:prototype`.',
    );
  }
  if (args.skipDownload && !readMarker('download') && resolveSource(args).kind === 'dataset') {
    throw new PipelineError(
      '--skip-download demandé mais aucun téléchargement en cache.',
      'Lancez une fois `npm run world:download:prototype -- --url <URL>`.',
    );
  }

  const optimized = await reporter.phase('Conversion, découpage et optimisation', () =>
    optimizeAll(stageArgs, reporter),
  );

  const artifacts = await reporter.phase('Manifeste, licences et rapport', async () => {
    const source = describeSource(args);
    const geojson = join(PLATEAU_CONFIG.paths.geo, `${PLATEAU_CONFIG.prototype.name}.geojson`);
    const line = readLineString(geojson);
    const route = optimized.processed.route;

    const manifest = buildManifest({ chunks: optimized.chunks, source: source.manifest, route });
    const license = buildLicense({ source, routeProperties: line.properties });
    const convertMarker = readMarker('convert');

    const report = {
      generatedAt: manifest.generatedAt,
      tools: {
        node: tools.node,
        sharp: tools.sharp,
        converter: tools.converter,
        converterVersion: tools.converterVersion,
        gltfTransform: packageVersion('@gltf-transform/core'),
        meshoptimizer: packageVersion('meshoptimizer'),
        earcut: packageVersion('earcut'),
      },
      source: source.manifest,
      route: {
        file: geojson,
        source: line.properties.source,
        license: line.properties.license,
        points: line.coordinates.length,
        totalLength: route.totalLength,
      },
      counts: {
        filesAnalyzed: convertMarker?.totals?.analyzed ?? null,
        buildingsDetected: convertMarker?.totals?.detected ?? null,
        buildingsInCorridor: convertMarker?.totals?.kept ?? null,
        buildingsDroppedOutsideCorridor: convertMarker?.totals?.droppedFar ?? null,
        buildingsCulledInvisible: optimized.processed.counts?.culled ?? null,
        byBand: {
          near: optimized.processed.counts?.near ?? null,
          medium: optimized.processed.counts?.medium ?? null,
          far: optimized.processed.counts?.far ?? null,
        },
        chunks: optimized.chunks.length,
      },
      sizes: {
        beforeOptimization: optimized.bytesBefore,
        afterOptimization: optimized.bytesAfter,
        reductionPercent: Math.round((1 - optimized.bytesAfter / optimized.bytesBefore) * 1000) / 10,
      },
      chunks: optimized.chunks.map((c) => ({
        id: c.id,
        url: c.url,
        startDistance: c.startDistance,
        endDistance: c.endDistance,
        offset: c.offset,
        boundingRadius: c.boundingRadius,
        buildings: c.buildings,
        before: c.before,
        after: c.after,
        estimatedTextureBytes: c.after.textureBytes,
        simplification: c.simplification,
      })),
      timings: [], // complété juste avant l'écriture finale
      warnings: [],
      errors: [],
    };
    return { manifest, license, report };
  });

  // Le manifeste doit exister sur le disque avant d'être validé : la
  // validation lit ce que le navigateur lira, pas un objet en mémoire.
  writeArtifacts(artifacts);

  if (!args.skipValidate) {
    await reporter.phase('Validation', () => validate(reporter));
  } else {
    reporter.warn('--skip-validate : les livrables ne sont pas vérifiés.');
  }

  // Réécriture finale : le rapport porte alors aussi la durée de validation
  // et les avertissements émis pendant tout le build.
  const summary = reporter.summary();
  artifacts.report.timings = summary.phases;
  artifacts.report.warnings = summary.warnings;
  artifacts.report.errors = summary.errors;
  artifacts.report.totalSeconds = summary.totalSeconds;
  const paths = writeArtifacts(artifacts);

  reporter.info(
    `\n✔ ${optimized.chunks.length} chunk(s), ${humanBytes(optimized.bytesAfter)} publiés dans ${PLATEAU_CONFIG.paths.out}`,
  );
  reporter.info(`  ${paths.manifest}`);
  reporter.info(`  ${paths.license}`);
  reporter.info(`  ${paths.report}`);
  reporter.info(
    `\nTestez avec : npm run dev  (puis ?plateau=1 pour démarrer sur le tronçon ` +
      `${PLATEAU_CONFIG.prototype.from} → ${PLATEAU_CONFIG.prototype.to}, segment ` +
      `${PLATEAU_CONFIG.prototype.segment})`,
  );
  return { optimized, artifacts };
}

function describeSource(args) {
  const source = resolveSource(args);
  if (source.kind === 'sample') {
    return {
      kind: 'sample',
      manifest: {
        name: 'Échantillon synthétique (PAS de données Project PLATEAU)',
        dataset: 'data/plateau-sample — généré par scripts/plateau/make-sample.mjs',
        license: 'CC0 1.0 (production de ce dépôt)',
        synthetic: true,
      },
    };
  }
  const id = args.dataset ?? process.env.PLATEAU_DATASET ?? 'tokyo23ku-citygml';
  const entry = DATASETS[id] ?? {};
  const marker = readMarker('download');
  return {
    kind: 'dataset',
    label: entry.label,
    license: entry.license,
    attribution: entry.attribution,
    dataset: marker?.source?.url ?? args.url ?? args.zip ?? entry.page,
    manifest: {
      name: 'Project PLATEAU',
      dataset: marker?.source?.url ?? args.url ?? args.zip ?? entry.page,
      license: entry.license,
      attribution: entry.attribution,
      synthetic: false,
    },
  };
}

function packageVersion(name) {
  try {
    const path = join(PLATEAU_CONFIG.paths.root, 'node_modules', name, 'package.json');
    return JSON.parse(readFileSync(path, 'utf8')).version;
  } catch {
    return null;
  }
}

if (isEntryPoint(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs(process.argv.slice(2), { flags: FLAGS, options: OPTIONS });
    await build(args, createReporter('build'));
  });
}
