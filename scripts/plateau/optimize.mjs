// Étape 4 — optimisation des GLB de chunk et publication dans
// public/world/plateau/.
//
// CHAÎNE APPLIQUÉE (dans cet ordre, chaque étape mesurée)
//   1. dedup()      — accesseurs, matériaux et maillages identiques fusionnés.
//   2. weld()       — indexation réelle : les sommets identiques (position,
//                     normale, couleur) deviennent un seul sommet. C'est ce
//                     qui divise le plus le poids, la géométrie sortant de
//                     process.mjs étant volontairement non indexée.
//   3. simplifyPrimitive() par BANDE de distance — voir « LOD » ci-dessous.
//   4. prune()      — tout ce qui n'est plus référencé.
//   5. textureCompress() — WebP + réduction de résolution, via sharp (déjà une
//                     dépendance du projet). Sans effet tant que la source est
//                     du LOD1 sans apparence : le rapport l'indique alors
//                     honnêtement (0 texture).
//   6. meshopt()    — compression EXT_meshopt_compression, décodée nativement
//                     par drei/useGLTF (même choix que scripts/models-import.mjs).
//   7. relecture du GLB écrit : un fichier qui ne se relit pas est un échec.
//
// LOD — CE QUI MARCHE ET CE QUI NE MARCHE PAS
//   La simplification est tentée par bande (medium et far), primitive par
//   primitive, avec un budget d'erreur. Sur du LOD1 — des prismes droits — il
//   n'y a presque rien à retirer sans détruire la silhouette : meshoptimizer
//   refuse alors de descendre au ratio demandé, et le rapport le montre
//   (`achievedRatio` proche de 1). L'allègement réel du lointain vient de
//   l'élagage fait en amont dans process.mjs (`visibleFromTrack`). Sur du LOD2
//   détaillé, en revanche, la simplification mord vraiment.

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { dedup, prune, weld, simplifyPrimitive, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { PLATEAU_CONFIG, stageInputs } from './config.mjs';
import { ensureDirs, fingerprintFile, hashValue, reusable, writeMarker } from './lib/cache.mjs';
import { PipelineError, createReporter, humanBytes, runMain } from './lib/log.mjs';
import { isEntryPoint, parseArgs } from './lib/args.mjs';
import { BANDS, describe, makeIO } from './lib/glb.mjs';
import { processAll } from './process.mjs';

const FLAGS = ['dryRun', 'force', 'yes'];
const OPTIONS = ['source', 'url', 'zip', 'dir', 'dataset', 'maxMb', 'converter'];

function ratioForBand(band) {
  const lod = PLATEAU_CONFIG.lod;
  if (band === 'near') return lod.nearRatio;
  if (band === 'medium') return lod.mediumRatio;
  return lod.farRatio;
}

/**
 * Simplification par bande. Renvoie le détail par primitive : on veut pouvoir
 * dire ce qui a été réellement obtenu, pas ce qui a été demandé.
 */
async function simplifyByBand(doc) {
  await MeshoptSimplifier.ready;
  const report = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      // La bande est lue dans `extras` : le nom d'un primitive n'existe pas
      // en glTF et ne survit pas à l'écriture du GLB (voir lib/glb.mjs).
      const extras = prim.getExtras() ?? {};
      const band = extras.band ?? 'far';
      const name = `${band}/${extras.surface ?? '?'}`;
      if (!BANDS.includes(band)) {
        throw new PipelineError(
          `Primitive sans bande de distance exploitable (extras=${JSON.stringify(extras)}).`,
          'Le GLB brut ne vient pas de scripts/plateau/process.mjs — relancez avec --force.',
        );
      }
      const ratio = ratioForBand(band);
      const before = Math.round((prim.getIndices()?.getCount() ?? 0) / 3);
      if (ratio >= 1 || before === 0) {
        report.push({ primitive: name, before, after: before, requestedRatio: ratio, achievedRatio: 1 });
        continue;
      }
      simplifyPrimitive(prim, {
        simplifier: MeshoptSimplifier,
        ratio,
        error: PLATEAU_CONFIG.lod.error,
        // Les chunks voisins ne partagent pas de sommets (bâtiments entiers,
        // jamais coupés) : verrouiller les bords n'apporterait rien et
        // empêcherait toute réduction.
        lockBorder: false,
      });
      const after = Math.round((prim.getIndices()?.getCount() ?? 0) / 3);
      report.push({
        primitive: name,
        before,
        after,
        requestedRatio: ratio,
        achievedRatio: before === 0 ? 1 : Math.round((after / before) * 1000) / 1000,
      });
    }
  }
  return report;
}

export async function optimizeAll(args, reporter) {
  const processed = await processAll(args, reporter);

  const inputHash = hashValue({
    ...stageInputs('optimize'),
    processHash: processed.inputHash,
    inputs: (processed.chunks ?? []).map((c) => ({
      id: c.id,
      h: existsSync(c.rawFile) ? fingerprintFile(c.rawFile) : null,
    })),
    version: 3,
  });

  if (args.dryRun || processed.dryRun) {
    reporter.info('[dry-run] optimisation : dedup → weld → simplify(bande) → prune → textures → meshopt');
    reporter.info(`[dry-run] textures : ${PLATEAU_CONFIG.textures.format}, max ${PLATEAU_CONFIG.textures.maxSize} px`);
    reporter.info(`[dry-run] sortie : ${PLATEAU_CONFIG.paths.out}/<chunk>.glb`);
    return { dryRun: true, chunks: [], inputHash };
  }

  const cached = reusable('optimize', inputHash, { force: args.force });
  if (cached) {
    reporter.info(`Étape optimize réutilisée (${cached.outputs.length} fichier(s)).`);
    return {
      ...cached,
      chunks: cached.chunkStats,
      inputHash,
      reused: true,
      processed,
      bytesBefore: cached.bytesBefore,
      bytesAfter: cached.bytesAfter,
    };
  }

  await MeshoptEncoder.ready;
  const io = await makeIO();
  ensureDirs(PLATEAU_CONFIG.paths.optimized, PLATEAU_CONFIG.paths.out);

  const results = [];
  const outputs = [];
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const chunk of processed.chunks) {
    const doc = await io.read(chunk.rawFile);
    const before = describe(doc);
    const sizeBefore = statSync(chunk.rawFile).size;
    bytesBefore += sizeBefore;

    await doc.transform(dedup(), weld());
    const simplification = await simplifyByBand(doc);
    await doc.transform(prune());

    // Textures : sans effet sur du LOD1 nu, mais la chaîne existe et se
    // déclenche dès qu'une source texturée (LOD2) passe par ici.
    const textureCount = doc.getRoot().listTextures().length;
    if (textureCount > 0) {
      await doc.transform(
        textureCompress({
          encoder: sharp,
          targetFormat: PLATEAU_CONFIG.textures.format,
          quality: PLATEAU_CONFIG.textures.quality,
          resize: [PLATEAU_CONFIG.textures.maxSize, PLATEAU_CONFIG.textures.maxSize],
        }),
      );
    }

    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));

    const out = join(PLATEAU_CONFIG.paths.out, `${chunk.id}.glb`);
    await io.write(out, doc);
    const sizeAfter = statSync(out).size;
    bytesAfter += sizeAfter;
    outputs.push(out);

    // Relecture : un GLB qui ne se relit pas n'est pas un livrable.
    let after;
    try {
      const reread = await io.read(out);
      after = describe(reread);
    } catch (err) {
      throw new PipelineError(
        `GLB final invalide : ${out}`,
        `Relecture impossible après compression meshopt — ${err.message}`,
      );
    }

    const maxBytes = PLATEAU_CONFIG.limits.maxChunkKB * 1024;
    if (sizeAfter > maxBytes) {
      throw new PipelineError(
        `Le chunk ${chunk.id} dépasse la taille maximale configurée.`,
        `${humanBytes(sizeAfter)} > ${humanBytes(maxBytes)} — réduisez PLATEAU_CHUNK_M, ` +
          'durcissez les seuils de distance, ou relevez PLATEAU_MAX_CHUNK_KB.',
      );
    }

    results.push({
      ...chunk,
      file: out,
      url: `world/plateau/${basename(out)}`,
      fileSize: sizeAfter,
      before: { ...before, bytes: sizeBefore, triangles: chunk.raw.triangles },
      after: { ...after, bytes: sizeAfter },
      simplification,
    });

    reporter.step(
      `${chunk.id} : ${humanBytes(sizeBefore)} → ${humanBytes(sizeAfter)} ` +
        `(${((1 - sizeAfter / sizeBefore) * 100).toFixed(0)} % en moins) · ` +
        `${before.triangles} → ${after.triangles} triangles · ` +
        `${after.vertices} sommets · ${after.materials} matériau(x) · ${after.textures} texture(s)`,
    );
  }

  writeMarker('optimize', {
    inputHash,
    outputs,
    extra: { chunkStats: results, bytesBefore, bytesAfter },
  });

  reporter.info(
    `Total : ${humanBytes(bytesBefore)} → ${humanBytes(bytesAfter)} ` +
      `(${((1 - bytesAfter / bytesBefore) * 100).toFixed(0)} % en moins) sur ${results.length} chunk(s).`,
  );

  return { chunks: results, outputs, bytesBefore, bytesAfter, inputHash, processed };
}

if (isEntryPoint(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs(process.argv.slice(2), { flags: FLAGS, options: OPTIONS });
    const reporter = createReporter('optimize');
    const result = await optimizeAll(args, reporter);
    if (!result.dryRun) {
      writeFileSync(
        join(PLATEAU_CONFIG.paths.optimized, 'last-run.json'),
        `${JSON.stringify({ chunks: result.chunks.map((c) => ({ id: c.id, fileSize: c.fileSize })) }, null, 2)}\n`,
      );
    }
  });
}

/** Lecture d'un GLB déjà publié (utilisé par validate.mjs). */
export async function readGlbStats(path) {
  const io = await makeIO();
  const doc = await io.read(path);
  return { ...describe(doc), bytes: readFileSync(path).length };
}
