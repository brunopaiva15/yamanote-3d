// Étape 5 - validation des livrables publiés dans public/world/plateau/.
//
// Ne suppose rien de l'étape précédente : lit le manifeste sur le disque, tel
// que le navigateur le lira, et vérifie tout ce qui pourrait faire échouer le
// chargement ou fausser le placement. Sortie non nulle au premier problème.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLATEAU_CONFIG } from './config.mjs';
import { PipelineError, createReporter, humanBytes, runMain } from './lib/log.mjs';
import { isEntryPoint, parseArgs } from './lib/args.mjs';
import { MANIFEST_VERSION } from './lib/manifest.mjs';
import { makeIO, describe } from './lib/glb.mjs';

const PUBLIC_DIR = join(PLATEAU_CONFIG.paths.root, 'public');

/** Un `url` de manifeste doit rester sous public/ - jamais d'échappée. */
export function resolvePublicUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new PipelineError(`URL de chunk vide ou absente dans le manifeste.`);
  }
  if (url.startsWith('/') || url.includes('..') || /^[a-z]+:/i.test(url)) {
    throw new PipelineError(
      `URL de chunk invalide : « ${url} ».`,
      'Attendu : un chemin relatif sous public/, par exemple « world/plateau/xxx.glb ».',
    );
  }
  return join(PUBLIC_DIR, url);
}

export function validateRoute(route) {
  const problems = [];
  if (!Array.isArray(route.points) || route.points.length < 2) {
    problems.push('route.json : moins de deux points.');
    return problems;
  }
  if (route.points[0].s !== 0) problems.push(`route.json : le premier point est à s=${route.points[0].s}, attendu 0.`);
  const last = route.points[route.points.length - 1];
  if (Math.abs(last.s - route.totalLength) > 0.01) {
    problems.push(`route.json : dernier s=${last.s} ≠ totalLength=${route.totalLength}.`);
  }
  for (let i = 1; i < route.points.length; i++) {
    if (!(route.points[i].s > route.points[i - 1].s)) {
      problems.push(`route.json : abscisse non strictement croissante en ${i}.`);
      break;
    }
    for (const k of ['x', 'y', 'z']) {
      if (!Number.isFinite(route.points[i][k])) {
        problems.push(`route.json : coordonnée ${k} non finie en ${i}.`);
        return problems;
      }
    }
  }
  return problems;
}

/**
 * Le jeu et le pipeline doivent viser le MÊME tronçon.
 *
 * `src/systems/plateau.ts` porte une constante, le manifeste porte une valeur
 * produite : rien ne les relie à la compilation, et un monde publié pour un
 * tronçon que le jeu cherche ailleurs sur la boucle ne se verrait jamais - sans
 * la moindre erreur. On lit donc la constante et on compare.
 */
export function readGameSegment(source) {
  const m = source.match(/export const PLATEAU_SEGMENT\s*=\s*(\d+)/);
  if (!m) {
    throw new PipelineError(
      'PLATEAU_SEGMENT introuvable dans src/systems/plateau.ts.',
      'La constante a-t-elle été renommée ? Adaptez readGameSegment() dans validate.mjs.',
    );
  }
  return Number(m[1]);
}

export function validateChunkCoverage(chunks, totalLength) {
  const problems = [];
  const sorted = [...chunks].sort((a, b) => a.startDistance - b.startDistance);
  if (sorted.length === 0) return ['Manifeste : aucun chunk.'];
  if (sorted[0].startDistance > 0.01) {
    problems.push(`Le premier chunk commence à ${sorted[0].startDistance} m, pas à 0.`);
  }
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].startDistance - sorted[i - 1].endDistance;
    if (Math.abs(gap) > 0.01) {
      problems.push(
        `Discontinuité entre ${sorted[i - 1].id} (fin ${sorted[i - 1].endDistance} m) ` +
          `et ${sorted[i].id} (début ${sorted[i].startDistance} m).`,
      );
    }
  }
  const end = sorted[sorted.length - 1].endDistance;
  if (Math.abs(end - totalLength) > 0.5) {
    problems.push(`Le dernier chunk finit à ${end} m alors que le tracé fait ${totalLength} m.`);
  }
  return problems;
}

export async function validate(reporter) {
  const dir = PLATEAU_CONFIG.paths.out;
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new PipelineError(
      `Manifeste absent : ${manifestPath}`,
      'Lancez `npm run world:build:prototype`.',
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new PipelineError(`Manifeste illisible : ${manifestPath}`, err.message);
  }

  const problems = [];
  if (manifest.version !== MANIFEST_VERSION) {
    problems.push(`Version de manifeste ${manifest.version}, attendu ${MANIFEST_VERSION}.`);
  }
  for (const key of ['generatedAt', 'source', 'prototype', 'coordinateSystem', 'chunks']) {
    if (!(key in manifest)) problems.push(`Champ manquant dans le manifeste : ${key}.`);
  }
  const cs = manifest.coordinateSystem ?? {};
  if (cs.east !== '+X' || cs.up !== '+Y' || cs.north !== '-Z' || cs.units !== 'meters') {
    problems.push(
      `Convention de coordonnées inattendue : ${JSON.stringify(cs)} ` +
        '(attendu units=meters, east=+X, up=+Y, north=-Z).',
    );
  }

  const gamePath = join(PLATEAU_CONFIG.paths.root, 'src/systems/plateau.ts');
  const gameSegment = readGameSegment(readFileSync(gamePath, 'utf8'));
  if (gameSegment !== manifest.prototype?.segment) {
    problems.push(
      `Le jeu vise le tronçon ${gameSegment} (PLATEAU_SEGMENT dans src/systems/plateau.ts) ` +
        `alors que le monde publié est celui du tronçon ${manifest.prototype?.segment} ` +
        `(${manifest.prototype?.from} → ${manifest.prototype?.to}). ` +
        `Le décor ne s'afficherait jamais : alignez les deux.`,
    );
  }

  const routePath = join(dir, 'route.json');
  if (!existsSync(routePath)) {
    problems.push('route.json absent.');
  } else {
    const route = JSON.parse(readFileSync(routePath, 'utf8'));
    problems.push(...validateRoute(route));
    problems.push(...validateChunkCoverage(manifest.chunks ?? [], route.totalLength));
    if (route.segment !== manifest.prototype?.segment) {
      problems.push(`route.json déclare le segment ${route.segment}, le manifeste ${manifest.prototype?.segment}.`);
    }
  }

  const io = await makeIO();
  const maxBytes = PLATEAU_CONFIG.limits.maxChunkKB * 1024;
  let totalBytes = 0;
  let totalTriangles = 0;

  for (const chunk of manifest.chunks ?? []) {
    const file = resolvePublicUrl(chunk.url);
    if (!existsSync(file)) {
      problems.push(`GLB introuvable pour ${chunk.id} : ${file}`);
      continue;
    }
    const size = statSync(file).size;
    totalBytes += size;
    if (chunk.fileSize !== size) {
      problems.push(`${chunk.id} : fileSize=${chunk.fileSize} dans le manifeste, ${size} sur le disque.`);
    }
    if (size > maxBytes) {
      problems.push(`${chunk.id} : ${humanBytes(size)} au-dessus du plafond ${humanBytes(maxBytes)}.`);
    }
    let stats;
    try {
      stats = describe(await io.read(file));
    } catch (err) {
      problems.push(`${chunk.id} : GLB final invalide - ${err.message}`);
      continue;
    }
    totalTriangles += stats.triangles;
    if (stats.triangles === 0) problems.push(`${chunk.id} : aucun triangle.`);
    if (!Array.isArray(chunk.offset) || chunk.offset.length !== 3 || chunk.offset.some((v) => !Number.isFinite(v))) {
      problems.push(`${chunk.id} : offset invalide (${JSON.stringify(chunk.offset)}).`);
    }
    if (!(chunk.endDistance > chunk.startDistance)) {
      problems.push(`${chunk.id} : intervalle vide [${chunk.startDistance}, ${chunk.endDistance}].`);
    }
    reporter.step(
      `${chunk.id} : ${humanBytes(size)}, ${stats.triangles} triangles, ` +
        `${stats.materials} matériau(x), rayon ${chunk.boundingRadius} m - OK`,
    );
  }

  if (!existsSync(join(dir, 'LICENSE.md'))) problems.push('LICENSE.md absent.');
  if (!existsSync(join(dir, 'build-report.json'))) problems.push('build-report.json absent.');

  if (problems.length > 0) {
    throw new PipelineError(
      `Validation échouée (${problems.length} problème(s)) :\n  - ${problems.join('\n  - ')}`,
    );
  }
  reporter.info(
    `Manifeste valide : ${manifest.chunks.length} chunk(s), ${humanBytes(totalBytes)}, ` +
      `${totalTriangles} triangles.`,
  );
  return { manifest, totalBytes, totalTriangles };
}

if (isEntryPoint(import.meta.url)) {
  await runMain(async () => {
    parseArgs(process.argv.slice(2), { flags: ['dryRun'], options: [] });
    await validate(createReporter('validate'));
  });
}
