// Le bouton « Menu » du HUD ramène à l'écran d'accueil, dans les deux versions.
//
// Trois gardes, lues dans les sources :
//
//  1. le bouton est dans le HUD, donc dans la 3D ET dans la version sonore.
//  2. le retour coupe le graphe audio : sans ça le roulement continuerait
//     sur le menu, et le prochain embarquement trouverait `nodes` encore là.
//  3. rien de three.js n'entre dans cette sortie - le HUD est aussi celui
//     de la version sonore.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

function read(file: string): string {
  return readFileSync(resolvePath(ROOT, file), 'utf8');
}

test('le HUD offre un retour au menu', () => {
  const hud = read('src/ui/Hud.tsx');
  assert.ok(hud.includes('returnToMenu'), 'le HUD n’appelle pas returnToMenu');
  assert.ok(hud.includes('t.hud.menu'), 'le bouton n’a pas son libellé');
});

test('revenir au menu coupe le son et démonte le trajet', () => {
  const stop = read('src/systems/stopGame.ts');
  assert.ok(stop.includes('stopAudio('), 'le graphe audio n’est pas coupé');
  assert.ok(stop.includes('stopAudioLoop('), 'la boucle sonore n’est pas arrêtée');
  assert.ok(stop.includes('.stop()'), 'le store ne repose pas started');
  assert.ok(stop.includes('leaveRoom('), 'on reste dans le salon');
  assert.ok(!/\bfrom ['"]three/.test(stop), 'stopGame tire three');
  assert.ok(!stop.includes('@react-three'), 'stopGame tire le rendu React Three');
});
