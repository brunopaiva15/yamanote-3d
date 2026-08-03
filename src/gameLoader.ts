// Une fonction partagée par version garantit que le clic du bouton et React
// réutilisent exactement la même promesse (et donc le même téléchargement).
//
// Les deux versions ont leur propre point d'entrée, et c'est tout l'intérêt :
// la version sonore ne doit jamais toucher au morceau de la 3D. Un seul
// `import()` paramétré les aurait réunies dans le même morceau - Vite ne sait
// pas découper ce qu'il ne sait pas lire - et une machine sans WebGL aurait
// téléchargé three.js pour ne rien en faire.

import type { GameMode } from './systems/gameMode';

let fullPromise: ReturnType<typeof importFullGame> | undefined;
let audioPromise: ReturnType<typeof importAudioGame> | undefined;

function importFullGame() {
  return import('./Game');
}

function importAudioGame() {
  return import('./AudioGame');
}

export function loadGame(): ReturnType<typeof importFullGame> {
  fullPromise ??= importFullGame();
  return fullPromise;
}

export function loadAudioGame(): ReturnType<typeof importAudioGame> {
  audioPromise ??= importAudioGame();
  return audioPromise;
}

/** Le morceau de la version demandée, sans que l'appelant ait à les connaître. */
export function loadGameFor(mode: GameMode): Promise<unknown> {
  return mode === 'audio' ? loadAudioGame() : loadGame();
}
