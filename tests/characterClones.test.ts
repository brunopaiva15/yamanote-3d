// Un corps cloné arrive ÉTEINT, et il faut l'allumer.
//
// `cloneVariant` (three/characters/library) rend son wrap `visible = false`. Ce
// n'est pas un oubli : il mesure la pose de repos hors scène avant toute
// animation, et un personnage en pose de repos - torse vrillé, bras écartés -
// ne doit pas paraître une seule image. La charge d'allumer le corps revient
// donc à celui qui l'affiche, sur son chemin d'affichage, par image.
//
// Trois des quatre appelants le faisaient. Le quatrième - les joueurs distants
// du salon - allumait le SUPPORT, qui n'a jamais contenu que le corps éteint :
// un camarade n'était jamais dessiné, dans toute installation ayant un pack de
// modèles, c'est-à-dire celle de tout le monde puisque le pack est versionné.
//
// Et le défaut se présentait sous son plus mauvais jour. L'étiquette de nom est
// du HTML accroché au support, pas au corps : elle, on la voyait. « Je ne vois
// pas mon ami, je vois son prénom au-dessus de lui » - un symptôme qui envoie
// chercher du côté du réseau, où tout allait bien.
//
// Ni TypeScript ni oxlint ne voient ce genre d'omission : un `visible` oublié
// est du code parfaitement valide. C'est donc le source qu'on lit, comme
// `tests/netSourceGuards` et `tests/audioVersion` le font déjà.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_DIR = resolvePath(ROOT, 'src/three');

/** La fabrique elle-même : elle produit le corps éteint, elle ne l'affiche pas. */
const FABRIQUE = 'src/three/characters/library.ts';

function fichiers(dir: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin));
    else if (/\.tsx?$/.test(entree)) out.push(chemin);
  }
  return out;
}

/** Les composants qui clonent un personnage, donc qui doivent l'allumer. */
function appelants(): { rel: string; source: string }[] {
  const out: { rel: string; source: string }[] = [];
  for (const chemin of fichiers(THREE_DIR)) {
    const rel = relative(ROOT, chemin).replace(/\\/g, '/');
    if (rel === FABRIQUE) continue;
    const source = readFileSync(chemin, 'utf8');
    if (!source.includes('cloneVariant')) continue;
    out.push({ rel, source });
  }
  return out;
}

/**
 * Ce fichier allume-t-il le corps qu'il vient de cloner ?
 *
 * Deux écritures ont cours dans le dépôt, et les deux comptent : l'accès direct
 * (`c.wrap.visible = true`) et le nom tiré de la déstructuration
 * (`const { wrap: body } = s.clone` puis `body.visible = true`).
 */
function allume(source: string): boolean {
  if (/\.wrap\.visible\s*=\s*true/.test(source)) return true;
  const noms = new Set<string>();
  for (const m of source.matchAll(/\{\s*wrap\s*:\s*([A-Za-z_$][\w$]*)/g)) noms.add(m[1]);
  if (/\{\s*wrap\s*[,}]/.test(source)) noms.add('wrap');
  for (const nom of noms) {
    if (new RegExp(`\\b${nom}\\.visible\\s*=\\s*true`).test(source)) return true;
  }
  return false;
}

test('la fabrique livre bien un corps éteint', () => {
  // L'autre moitié du contrat. Si ce défaut-là disparaissait - si `cloneVariant`
  // se mettait à rendre un corps allumé - le test ci-dessous n'aurait plus de
  // raison d'être, et il vaut mieux qu'il le dise ici que de continuer à
  // réclamer une ligne devenue inutile.
  const source = readFileSync(resolvePath(ROOT, FABRIQUE), 'utf8');
  assert.match(source, /wrap\.visible\s*=\s*false/, 'cloneVariant n’éteint plus le corps');
});

test('tout composant qui clone un personnage l’allume', () => {
  const liste = appelants();
  // Sans cette borne, un renommage de `cloneVariant` ferait passer le test avec
  // zéro fichier examiné - le pire des verts.
  assert.ok(liste.length >= 4, `seulement ${liste.length} appelant(s) trouvé(s)`);
  const muets = liste.filter((f) => !allume(f.source)).map((f) => f.rel);
  assert.deepEqual(
    muets,
    [],
    `corps cloné jamais allumé : il ne sera pas dessiné, mais son étiquette de nom si`,
  );
});
