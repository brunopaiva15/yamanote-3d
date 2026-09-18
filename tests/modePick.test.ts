// Le choix de version (3D ou sonore) n'appartient plus au menu : il s'ouvre
// après « Monter à bord », sur deux cartes d'exemple.
//
// Trois promesses, lues dans les sources plutôt que dans un navigateur :
//
//  1. le menu n'a plus de sélecteur « Version ». On clique d'abord, on choisit
//     ensuite - c'est tout l'objet du changement.
//  2. les deux voyages sont montrés, avec un exemple chacun. Un libellé sans
//     image reviendrait au sélecteur d'avant.
//  3. three.js ne part au téléchargement qu'une fois la carte 3D choisie. Si
//     loadGameFor était appelé avec le mode du magasin AVANT le clic, on
//     retéléchargerait le moteur de rendu pour qui vient de demander de s'en
//     passer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

function read(file: string): string {
  return readFileSync(resolvePath(ROOT, file), 'utf8');
}

test('le menu n’oblige plus à choisir la version avant d’embarquer', () => {
  const start = read('src/ui/StartScreen.tsx');
  assert.ok(!start.includes('id="start-mode"'), 'le sélecteur Version est encore dans le menu');
  assert.ok(start.includes("setStep('pick')"), '« Monter à bord » n’ouvre pas le choix de version');
  assert.ok(start.includes('<ModePick'), 'le choix illustré n’est pas monté après le clic');
  assert.match(start, /loadGameFor\(chosen\)/, 'le morceau du jeu n’attend plus le choix de carte');
});

test('les deux versions ont un exemple, pas seulement un libellé', () => {
  const pick = read('src/ui/ModePick.tsx');
  assert.ok(pick.includes('modeFullExample'), 'la carte 3D n’a pas d’exemple écrit');
  assert.ok(pick.includes('modeAudioExample'), 'la carte sonore n’a pas d’exemple écrit');
  assert.ok(pick.includes('<FullPreview'), 'la carte 3D n’a pas d’illustration');
  assert.ok(pick.includes('<AudioPreview'), 'la carte sonore n’a pas d’illustration');
  assert.ok(pick.includes('modePickExample'), 'l’étiquette « Exemple » a disparu');
});

test('la carte sonore n’importe pas three.js', () => {
  const pick = read('src/ui/ModePick.tsx');
  assert.ok(!pick.includes("from 'three'"), 'ModePick tire three');
  assert.ok(!pick.includes('@react-three'), 'ModePick tire le rendu React Three');
});
