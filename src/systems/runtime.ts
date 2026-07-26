// Valeurs continues mutées chaque frame (jamais dans React) : la boucle 60 fps
// lit et écrit ici, les composants three lisent dans leur useFrame.

import { CONFIG } from '../data/config';

// Heure réelle à Tokyo (UTC+9), en minutes depuis minuit.
export function tokyoMinutesNow(): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return (get('hour') % 24) * 60 + get('minute') + get('second') / 60;
  } catch {
    return CONFIG.clockStart;
  }
}

export const runtime = {
  speed: 0, // m/s
  accel: 0, // m/s²
  distance: 0, // m parcourus depuis le début
  phaseT: 0, // temps écoulé dans la phase courante (s)
  doorOpen: 0, // 0 fermé → 1 ouvert (porte de référence de la rame)
  doorTarget: 0,
  doorT: 999, // temps écoulé depuis le changement de cible (s)
  psdOpen: 0, // portes palières du quai, décalées sur la rame
  psdTarget: 0,
  psdT: 999,
  clockMin: CONFIG.clockStart, // horloge du monde, en minutes (flottant)
  swayTime: 0,
  sway: 0, // balancement latéral normalisé (-1..1)
  platformFade: 0, // présence du quai 0..1 (visibilité / approche, plus d'opacité)
  platformSlide: 0, // décalage Z du quai (m) : négatif à l'approche, positif au départ
  playerX: 0, // position du joueur (pour les regards des PNJ)
  playerY: 1.55,
  playerZ: 4.2,
};

export function resetRuntime(): void {
  runtime.speed = 0;
  runtime.accel = 0;
  runtime.distance = 0;
  runtime.phaseT = 0;
  runtime.doorOpen = 0;
  runtime.doorTarget = 0;
  runtime.doorT = 999;
  runtime.psdOpen = 0;
  runtime.psdTarget = 0;
  runtime.psdT = 999;
  runtime.clockMin = CONFIG.clockStart;
  runtime.swayTime = 0;
  runtime.sway = 0;
  runtime.platformFade = 0;
  runtime.platformSlide = 0;
}
