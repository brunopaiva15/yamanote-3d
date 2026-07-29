// Étape 1 — obtention des données sources.
//
// DEUX SOURCES POSSIBLES :
//
//   --source sample   (défaut)  utilise l'échantillon CityGML SYNTHÉTIQUE de
//                     data/plateau-sample/, régénéré si absent. Aucun réseau,
//                     aucune donnée tierce. C'est ce qui permet de dérouler le
//                     pipeline entier sans les 24 Go du jeu réel.
//
//   --source dataset  télécharge une archive PLATEAU réelle (--url, ou
//                     PLATEAU_DATASET_URL) ou réutilise une archive locale
//                     (--zip). L'archive est mise en cache, reprise si
//                     interrompue, et seuls les CityGML de bâtiments
//                     (udx/bldg/*.gml) sont extraits.
//
// GARDE-FOUS : la taille annoncée par le serveur est affichée AVANT le
// téléchargement ; au-delà de PLATEAU_CONFIG.download.maxAutoDownloadMB il
// faut --yes, et au-delà de hardLimitMB il faut --max-mb explicitement.

import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Unzip, UnzipInflate } from 'fflate';
import { DATASETS, PLATEAU_CONFIG, PLATEAU_PORTAL } from './config.mjs';
import { ensureDirs, hashValue, reusable, writeMarker } from './lib/cache.mjs';
import { PipelineError, createReporter, humanBytes, runMain } from './lib/log.mjs';
import { isEntryPoint, parseArgs } from './lib/args.mjs';
import { runTool, whichTool } from './lib/run.mjs';

const FLAGS = ['dryRun', 'force', 'yes'];
const OPTIONS = ['source', 'url', 'zip', 'dir', 'dataset', 'maxMb'];

/** Fichiers d'une livraison PLATEAU que le prototype sait exploiter. */
const WANTED = /(^|\/)udx\/bldg\/.*\.gml$/i;

export function resolveSource(args) {
  // Livraison DÉJÀ EXTRAITE : la sortie de secours quand l'archive n'est pas un
  // zip (PLATEAU propose aussi du 7z, que fflate ne sait pas ouvrir).
  if (args.dir) return { kind: 'dir', path: args.dir };
  if (args.zip) return { kind: 'zip', path: args.zip };
  const explicit = args.source ?? process.env.PLATEAU_SOURCE ?? null;
  if (explicit === 'dataset') return { kind: 'dataset' };
  if (explicit === 'sample') return { kind: 'sample' };
  const url = args.url ?? DATASETS[args.dataset ?? 'tokyo23ku-citygml']?.url;
  return url ? { kind: 'dataset' } : { kind: 'sample' };
}

function datasetUrl(args) {
  const id = args.dataset ?? process.env.PLATEAU_DATASET ?? 'tokyo23ku-citygml';
  const entry = DATASETS[id];
  if (!entry) {
    throw new PipelineError(
      `Jeu de données inconnu : « ${id} ».`,
      `Connus : ${Object.keys(DATASETS).join(', ')}. Ou passez directement --url.`,
    );
  }
  const url = args.url ?? entry.url;
  if (!url) {
    throw new PipelineError(
      `Aucune URL configurée pour le jeu de données « ${id} ».`,
      `PLATEAU diffuse ses données via le G空間情報センター.\n` +
        `  Fiche du jeu Tokyo 23区 — unique et SANS millésime depuis avril 2022 :\n` +
        `    ${PLATEAU_PORTAL.tokyo23ku}\n` +
        `  Prenez-y la ressource CityGML : ni OBJ, ni FBX, ni 3D Tiles, ni MVT,\n` +
        `  ni GeoTIFF — ce sont des dérivés dont ce pipeline ne peut rien faire.\n` +
        `  Puis relancez avec\n` +
        `    --url <URL>   (ou PLATEAU_DATASET_URL=<URL>)\n` +
        `  Autres entrées possibles :\n` +
        `    --zip <fichier.zip>       archive déjà téléchargée\n` +
        `    --dir <dossier>           livraison déjà extraite (ressource en 7z)`,
    );
  }
  return { id, entry, url };
}

async function headSize(url, reporter) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(PLATEAU_CONFIG.download.timeoutMs),
    });
    if (!res.ok) {
      reporter.warn(`HEAD ${url} → ${res.status} ${res.statusText} (taille inconnue)`);
      return null;
    }
    const len = res.headers.get('content-length');
    return len ? Number(len) : null;
  } catch (err) {
    reporter.warn(`HEAD impossible (${err.message}) : taille inconnue avant téléchargement.`);
    return null;
  }
}

function guardSize(bytes, args, reporter) {
  const cfg = PLATEAU_CONFIG.download;
  const limitMB = args.maxMb ? Number(args.maxMb) : cfg.maxAutoDownloadMB;
  if (bytes === null) {
    if (!args.yes) {
      throw new PipelineError(
        "Le serveur n'annonce pas la taille du fichier.",
        'Relancez avec --yes pour accepter un téléchargement de taille inconnue.',
      );
    }
    reporter.warn('Taille inconnue acceptée (--yes).');
    return;
  }
  const mb = bytes / (1024 * 1024);
  reporter.info(`Taille annoncée : ${humanBytes(bytes)}`);
  if (mb > cfg.hardLimitMB && !args.maxMb) {
    throw new PipelineError(
      `Téléchargement de ${humanBytes(bytes)} au-dessus du plafond absolu (${cfg.hardLimitMB} Mo).`,
      `Relancez avec --max-mb ${Math.ceil(mb)} si c'est bien ce que vous voulez.`,
    );
  }
  if (mb > limitMB && !args.yes) {
    throw new PipelineError(
      `Téléchargement de ${humanBytes(bytes)} au-dessus du seuil automatique (${limitMB} Mo).`,
      'Relancez avec --yes, ou --max-mb <Mo> pour relever le seuil, ' +
        'ou --zip <fichier> pour réutiliser une archive déjà présente.',
    );
  }
}

/** Téléchargement avec reprise (Range) et cache par URL. */
async function download(url, reporter, args) {
  ensureDirs(PLATEAU_CONFIG.paths.downloads);
  const key = createHash('sha256').update(url).digest('hex').slice(0, 12);
  const name = basename(new URL(url).pathname) || 'dataset.zip';
  const target = join(PLATEAU_CONFIG.paths.downloads, `${key}-${name}`);
  const partial = `${target}.part`;

  const total = await headSize(url, reporter);
  if (existsSync(target)) {
    const size = statSync(target).size;
    if (total === null || size === total) {
      reporter.info(`Déjà en cache : ${target} (${humanBytes(size)})`);
      return target;
    }
    reporter.warn(`Cache incomplet (${humanBytes(size)} / ${humanBytes(total)}), reprise.`);
    rmSync(target);
  }
  guardSize(total, args, reporter);

  let from = existsSync(partial) ? statSync(partial).size : 0;
  if (from > 0) reporter.info(`Reprise à ${humanBytes(from)}.`);

  const res = await fetch(url, {
    redirect: 'follow',
    headers: from > 0 ? { Range: `bytes=${from}-` } : {},
    signal: AbortSignal.timeout(PLATEAU_CONFIG.download.timeoutMs),
  });
  if (!res.ok && res.status !== 206) {
    throw new PipelineError(
      `Téléchargement refusé : ${res.status} ${res.statusText}`,
      `URL : ${url}`,
    );
  }
  if (from > 0 && res.status !== 206) {
    reporter.warn("Le serveur ignore Range : téléchargement repris depuis zéro.");
    from = 0;
  }
  await pipeline(
    Readable.fromWeb(res.body),
    createWriteStream(partial, { flags: from > 0 ? 'a' : 'w' }),
  );
  // Renommage atomique : un .part ne devient un fichier de cache qu'entier.
  const { renameSync } = await import('node:fs');
  renameSync(partial, target);
  reporter.info(`Téléchargé : ${target} (${humanBytes(statSync(target).size)})`);
  return target;
}

/**
 * Extraction sélective en flux : seuls les udx/bldg/*.gml sortent de
 * l'archive. Une livraison PLATEAU contient aussi les codelists, les
 * métadonnées, le DEM, la végétation… inutiles ici et volumineux.
 */
/**
 * Nature d'une archive, lue dans ses premiers octets. PLATEAU publie certaines
 * ressources en 7z ; les ouvrir avec un lecteur zip ne donne pas une erreur
 * franche, juste zéro fichier — et un message trompeur en bout de chaîne.
 */
export function detectArchive(path) {
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(8);
  try {
    readSync(fd, head, 0, 8, 0);
  } finally {
    closeSync(fd);
  }
  if (head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'zip';
  if (head.subarray(0, 2).equals(Buffer.from([0x50, 0x4b]))) return 'zip'; // vide / spanned
  if (head.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) return '7z';
  if (head.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))) return 'gzip';
  return 'inconnu';
}

export function extractBuildings(zipPath, outDir, reporter) {
  const kind = detectArchive(zipPath);
  if (kind !== 'zip') {
    return Promise.reject(
      new PipelineError(
        `${zipPath} n'est pas une archive ZIP (format détecté : ${kind}).`,
        kind === '7z'
          ? "PLATEAU publie certaines ressources en 7z, que ce pipeline ne sait pas ouvrir.\n" +
            '  Extrayez-la vous-même puis pointez le dossier obtenu :\n' +
            '    7z x <archive.7z> -o/chemin/livraison\n' +
            '    npm run world:build:prototype -- --dir /chemin/livraison\n' +
            '  (ou choisissez la ressource ZIP sur la fiche du jeu de données)'
          : 'Vérifiez que le lien copié est bien celui de la ressource CityGML.',
      ),
    );
  }
  return new Promise((resolve, reject) => {
    ensureDirs(outDir);
    const written = [];
    const buffers = new Map();
    let pending = 0;
    let ended = false;

    const finish = () => {
      if (ended && pending === 0) resolve(written);
    };

    const unzip = new Unzip((file) => {
      if (!WANTED.test(file.name)) return; // non démarré ⇒ ignoré
      const out = join(outDir, basename(file.name));
      pending++;
      const parts = [];
      buffers.set(file.name, parts);
      file.ondata = (err, chunk, final) => {
        if (err) {
          reject(new PipelineError(`Décompression de ${file.name} : ${err.message}`));
          return;
        }
        if (chunk?.length) parts.push(Buffer.from(chunk));
        if (final) {
          mkdirSync(dirname(out), { recursive: true });
          writeFileSync(out, Buffer.concat(parts));
          buffers.delete(file.name);
          written.push(out);
          reporter.step(`extrait ${basename(out)} (${humanBytes(statSync(out).size)})`);
          pending--;
          finish();
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);

    const stream = createReadStream(zipPath);
    stream.on('data', (chunk) => unzip.push(new Uint8Array(chunk), false));
    stream.on('error', (err) => reject(new PipelineError(`Lecture de ${zipPath} : ${err.message}`)));
    stream.on('end', () => {
      unzip.push(new Uint8Array(0), true);
      ended = true;
      finish();
    });
  });
}

function listGml(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.gml$/i.test(entry.name)) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

export async function ensureSources(args, reporter) {
  const source = resolveSource(args);
  const inputHash = hashValue({
    source,
    url: args.url ?? null,
    dataset: args.dataset ?? null,
    version: 2,
  });

  if (source.kind === 'sample') {
    const dir = PLATEAU_CONFIG.paths.sample;
    let files = listGml(dir);
    if (files.length === 0) {
      if (args.dryRun) {
        reporter.info(`[dry-run] générerait l'échantillon synthétique dans ${dir}`);
        return { kind: 'sample', files: [], inputHash, dryRun: true };
      }
      reporter.info("Échantillon absent : génération…");
      const node = whichTool(process.execPath) ?? process.execPath;
      await runTool(node, [join(PLATEAU_CONFIG.paths.root, 'scripts/plateau/make-sample.mjs')], {
        cwd: PLATEAU_CONFIG.paths.root,
        label: 'make-sample.mjs',
      });
      files = listGml(dir);
    }
    reporter.warn(
      'Source = ÉCHANTILLON SYNTHÉTIQUE (data/plateau-sample). ' +
        'Ce ne sont PAS des données Project PLATEAU.',
    );
    reporter.info(`${files.length} fichier(s) CityGML : ${files.map((f) => basename(f)).join(', ')}`);
    return { kind: 'sample', files, inputHash };
  }

  if (source.kind === 'dir') {
    // Livraison déjà extraite sur le disque : on ne télécharge ni ne
    // décompresse rien, on se contente d'y trouver les CityGML de bâtiments.
    if (!existsSync(source.path)) {
      throw new PipelineError(`Dossier introuvable : ${source.path}`);
    }
    const all = listGml(source.path);
    // Une livraison PLATEAU range ses bâtiments dans udx/bldg/. On préfère ce
    // sous-ensemble s'il existe : sinon on prendrait aussi le relief, la
    // végétation et le mobilier urbain, que ce pipeline ne sait pas traiter.
    const bldg = all.filter((f) => /(^|[/\\])udx[/\\]bldg[/\\]/i.test(f));
    const files = bldg.length > 0 ? bldg : all;
    if (files.length === 0) {
      throw new PipelineError(
        `Aucune donnée PLATEAU trouvée : ${source.path} ne contient aucun .gml.`,
        "Attendu l'arborescence d'une livraison CityGML (<code>/udx/bldg/*.gml).",
      );
    }
    if (bldg.length === 0) {
      reporter.warn(
        `Aucun sous-dossier udx/bldg : les ${files.length} fichier(s) .gml trouvés ` +
          'seront tous analysés, y compris les thèmes non bâtis (ignorés à la lecture).',
      );
    }
    reporter.info(`Livraison locale : ${source.path} — ${files.length} fichier(s) CityGML.`);
    if (!args.dryRun) writeMarker('download', { inputHash, outputs: files, extra: { dir: source.path } });
    return { kind: 'dir', files, inputHash };
  }

  // --- Données réelles ---
  const cached = reusable('download', inputHash, { force: args.force });
  if (cached && !args.dryRun) {
    reporter.info(`Étape download réutilisée (${cached.outputs.length} fichier(s)).`);
    return { kind: 'dataset', files: cached.outputs, inputHash, reused: true };
  }

  let zipPath = source.kind === 'zip' ? source.path : null;
  let meta = null;
  if (zipPath) {
    if (!existsSync(zipPath)) throw new PipelineError(`Archive introuvable : ${zipPath}`);
    reporter.info(`Archive locale : ${zipPath} (${humanBytes(statSync(zipPath).size)})`);
  } else {
    meta = datasetUrl(args);
    reporter.info(`Jeu de données : ${meta.entry.label}`);
    reporter.info(`Licence : ${meta.entry.license}`);
    if (args.dryRun) {
      const size = await headSize(meta.url, reporter);
      reporter.info(`[dry-run] téléchargerait ${meta.url}`);
      reporter.info(`[dry-run] taille annoncée : ${size === null ? 'inconnue' : humanBytes(size)}`);
      reporter.info(`[dry-run] cache : ${PLATEAU_CONFIG.paths.downloads}`);
      return { kind: 'dataset', files: [], inputHash, dryRun: true };
    }
    zipPath = await download(meta.url, reporter, args);
  }

  if (args.dryRun) {
    reporter.info(`[dry-run] extrairait udx/bldg/*.gml de ${zipPath} vers ${PLATEAU_CONFIG.paths.extracted}`);
    return { kind: 'dataset', files: [], inputHash, dryRun: true };
  }

  const files = await extractBuildings(zipPath, PLATEAU_CONFIG.paths.extracted, reporter);
  if (files.length === 0) {
    throw new PipelineError(
      `Aucune donnée PLATEAU trouvée : ${zipPath} ne contient aucun udx/bldg/*.gml.`,
      "Vérifiez que l'archive est bien une livraison CityGML (et non un jeu 3D Tiles, FBX ou OBJ).",
    );
  }
  writeMarker('download', {
    inputHash,
    outputs: files,
    extra: {
      source: meta ? { url: meta.url, dataset: meta.id, license: meta.entry.license } : { zip: zipPath },
    },
  });
  return { kind: 'dataset', files, inputHash };
}

// --- Exécution directe ---
if (isEntryPoint(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs(process.argv.slice(2), { flags: FLAGS, options: OPTIONS });
    const reporter = createReporter('download');
    const result = await ensureSources(args, reporter);
    reporter.info(`Source « ${result.kind} » : ${result.files.length} fichier(s) CityGML prêt(s).`);
  });
}
