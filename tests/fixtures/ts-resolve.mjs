// Résolveur d'imports pour les modules du jeu écrits sans extension.
//
// `systems/trainPhysics` peut se charger tel quel parce qu'il écrit
// `'../data/config.ts'` : il n'a qu'une dépendance et elle est explicite. Les
// modules du volume praticable, eux, en ont une demi-douzaine chacune écrite à
// la mode Vite (`'./runtime'`, `'../store'`), et les réécrire toutes pour un
// test serait faire porter au jeu le poids du harnais. Ce hook fait l'inverse :
// vingt lignes côté test, rien à changer côté jeu.
//
// Il ne touche qu'aux chemins RELATIFS sans extension — les paquets de
// node_modules et les imports déjà explicites passent leur chemin.

import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXTENSIONS = ['.ts', '.tsx'];

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const base = dirname(fileURLToPath(context.parentURL));
    for (const ext of EXTENSIONS) {
      const candidate = resolvePath(base, specifier + ext);
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
