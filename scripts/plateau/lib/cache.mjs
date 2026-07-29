// Cache d'étapes : chaque étape écrit un marqueur JSON dans .cache/plateau/
// contenant le hash de ses entrées (paramètres de config + empreinte des
// fichiers sources) et la liste des fichiers produits.
//
// Une étape est ignorée si, et seulement si :
//   · son marqueur existe ;
//   · le hash d'entrée est identique ;
//   · tous les fichiers déclarés existent encore.
//
// Changer PLATEAU_CORRIDOR_M ou PLATEAU_CHUNK_M change donc le hash de
// l'étape `process` et de tout ce qui en dépend.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATEAU_CONFIG } from '../config.mjs';

function markerPath(stage) {
  return join(PLATEAU_CONFIG.paths.cache, `${stage}.json`);
}

/** Hash stable d'une valeur JSON (clés triées). */
export function hashValue(value) {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = stable(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 16);
}

/** Empreinte d'un fichier : taille + mtime + 64 Ko de contenu (rapide et sûr). */
export function fingerprintFile(path) {
  if (!existsSync(path)) return null;
  const st = statSync(path);
  const head = readFileSync(path).subarray(0, 65536);
  return createHash('sha256')
    .update(`${st.size}:${Math.round(st.mtimeMs)}:`)
    .update(head)
    .digest('hex')
    .slice(0, 16);
}

export function readMarker(stage) {
  const p = markerPath(stage);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function writeMarker(stage, { inputHash, outputs, extra }) {
  mkdirSync(PLATEAU_CONFIG.paths.cache, { recursive: true });
  const marker = {
    stage,
    inputHash,
    outputs,
    generatedAt: new Date().toISOString(),
    ...(extra ?? {}),
  };
  writeFileSync(markerPath(stage), `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
}

/**
 * L'étape peut-elle être sautée ? Renvoie le marqueur si oui, `null` sinon.
 * `force` court-circuite toujours le cache.
 */
export function reusable(stage, inputHash, { force = false } = {}) {
  if (force) return null;
  const marker = readMarker(stage);
  if (!marker || marker.inputHash !== inputHash) return null;
  for (const out of marker.outputs ?? []) {
    if (!existsSync(out)) return null;
  }
  return marker;
}

export function ensureDirs(...dirs) {
  for (const d of dirs) mkdirSync(d, { recursive: true });
}
