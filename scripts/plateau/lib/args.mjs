// Analyse d'arguments commune aux scripts du pipeline. Volontairement
// minimale : les drapeaux booléens et les options `--clé valeur`.

import { pathToFileURL } from 'node:url';

export function parseArgs(argv, { flags = [], options = [] } = {}) {
  const out = { _: [] };
  for (const f of flags) out[f] = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = (eq >= 0 ? a.slice(2, eq) : a.slice(2)).replace(/-([a-z])/g, (_, c) =>
      c.toUpperCase(),
    );
    if (flags.includes(key)) {
      out[key] = true;
      continue;
    }
    if (options.includes(key)) {
      out[key] = eq >= 0 ? a.slice(eq + 1) : argv[++i];
      continue;
    }
    throw new Error(
      `Option inconnue : ${a}\n  Drapeaux : ${flags.map((f) => `--${kebab(f)}`).join(', ') || '(aucun)'}` +
        `\n  Options : ${options.map((o) => `--${kebab(o)} <valeur>`).join(', ') || '(aucune)'}`,
    );
  }
  return out;
}

function kebab(s) {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Drapeaux partagés par tous les scripts d'étape. */
export const COMMON_FLAGS = ['dryRun', 'force', 'yes'];

/**
 * Le module est-il le point d'entrée du processus ? Chaque étape est à la fois
 * un script (`node scripts/plateau/convert.mjs`) et une fonction importée par
 * l'orchestrateur : seul le premier cas doit lire process.argv.
 */
export function isEntryPoint(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return moduleUrl === pathToFileURL(entry).href;
}
