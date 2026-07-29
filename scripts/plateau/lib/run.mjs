// Exécution d'un outil externe : code de sortie vérifié, stdout/stderr
// capturés, message d'erreur explicite citant la commande exacte.
//
// Aucune commande externe du pipeline n'est lancée autrement que par ici, et
// aucune erreur n'est avalée : `runTool` lève systématiquement si le code de
// sortie n'est pas 0.

import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { PipelineError } from './log.mjs';

/** Cherche un exécutable dans le PATH (ou vérifie un chemin absolu). */
export function whichTool(name) {
  if (isAbsolute(name) || name.includes('/')) {
    try {
      accessSync(name, constants.X_OK);
      return name;
    } catch {
      return null;
    }
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* pas exécutable : on continue */
    }
  }
  return null;
}

export function quote(args) {
  return args.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ');
}

/**
 * Lance une commande et renvoie `{ code, stdout, stderr }`.
 * Lève une PipelineError si le code de sortie n'est pas 0 (sauf `allowFail`).
 */
export function runTool(command, args, { cwd, env, allowFail = false, timeoutMs = 0, label } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timer = null;
    let timedOut = false;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
    }
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(
        new PipelineError(
          `Impossible de lancer « ${command} » : ${err.message}`,
          `Commande complète : ${command} ${quote(args)}`,
        ),
      );
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const result = { code, stdout, stderr, command, args };
      if (timedOut) {
        reject(
          new PipelineError(
            `${label ?? command} : délai dépassé (${timeoutMs} ms).`,
            `Commande : ${command} ${quote(args)}`,
          ),
        );
        return;
      }
      if (code !== 0 && !allowFail) {
        const tail = (s) => s.trim().split('\n').slice(-15).join('\n');
        reject(
          new PipelineError(
            `${label ?? command} a échoué (code ${code}).\n` +
              `  Commande : ${command} ${quote(args)}\n` +
              (stderr.trim() ? `  stderr :\n${tail(stderr)}\n` : '') +
              (stdout.trim() ? `  stdout :\n${tail(stdout)}` : ''),
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Substitue les jetons {input}, {output}, {epsg}… dans un gabarit de commande
 * fourni par l'utilisateur (PLATEAU_CONVERTER_CMD). Permet de brancher un
 * convertisseur dont on ne veut pas coder en dur les options.
 */
export function expandCommandTemplate(template, vars) {
  const parts = template.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const unknown = new Set();
  const expanded = parts.map((part) => {
    const bare = part.replace(/^["']|["']$/g, '');
    return bare.replace(/\{(\w+)\}/g, (_, key) => {
      if (!(key in vars)) {
        unknown.add(key);
        return '';
      }
      return String(vars[key]);
    });
  });
  if (unknown.size > 0) {
    throw new PipelineError(
      `Jeton inconnu dans le gabarit de commande : {${[...unknown].join('}, {')}}`,
      `Jetons disponibles : {${Object.keys(vars).join('}, {')}}`,
    );
  }
  return { command: expanded[0], args: expanded.slice(1) };
}
