// Valeurs continues mutées chaque frame (jamais dans React) : la boucle 60 fps
// lit et écrit ici, les composants three lisent dans leur useFrame.

import { CONFIG } from '../data/config';

export const runtime = {
  speed: 0, // m/s
  accel: 0, // m/s²
  distance: 0, // m parcourus depuis le début
  phaseT: 0, // temps écoulé dans la phase courante (s)
  doorOpen: 0, // 0 fermé → 1 ouvert
  doorTarget: 0,
  clockMin: CONFIG.clockStart, // horloge du monde, en minutes (flottant)
  swayTime: 0,
  sway: 0, // balancement latéral normalisé (-1..1)
  platformFade: 0, // opacité du quai (0..1)
};

export function resetRuntime(): void {
  runtime.speed = 0;
  runtime.accel = 0;
  runtime.distance = 0;
  runtime.phaseT = 0;
  runtime.doorOpen = 0;
  runtime.doorTarget = 0;
  runtime.clockMin = CONFIG.clockStart;
  runtime.swayTime = 0;
  runtime.sway = 0;
  runtime.platformFade = 0;
}
