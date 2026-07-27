// Présence spatiale du quai : plus de fondu d'opacité. Le quai est opaque et
// glisse le long de la voie — il arrive de l'avant pendant le freinage, reste
// calé à l'arrêt, puis part derrière au départ. Piloté par la progression du
// trajet (segEnv.p) et la phase, écrit dans runtime chaque frame.

import { CONFIG } from '../data/config';
import { useStore, type Phase } from '../store';
import { runtime } from './runtime';
import { segEnv } from './segmentEnv';

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function presenceFrom(phase: Phase, p: number): { presence: number; slide: number } {
  if (phase === 'brake') {
    // Freinage : p ≈ 0.878 → 1. Le quai entre assez tôt pour qu'on le voie
    // glisser le long des vitres, opaque, comme une vraie approche.
    const presence = smoothstep(0.87, 0.96, p);
    return { presence, slide: (1 - presence) * -52 };
  }
  if (phase === 'dwell') return { presence: 1, slide: 0 };
  if (phase === 'depart') {
    // Piloté par la distance RÉELLEMENT parcourue depuis l'arrêt : le quai
    // défile exactement à la vitesse du train (immobile pendant le desserrage
    // des freins, puis accélération progressive). departTime est dimensionné
    // pour qu'il soit entièrement parti avant la croisière, sinon le mur de
    // gare disparaîtrait d'un coup au bascule.
    const d = Math.max(0, runtime.distance - runtime.departStartDist);
    const presence = 1 - smoothstep(4, 64, d);
    return { presence, slide: Math.min(d, 90) };
  }
  return { presence: 0, slide: 0 };
}

// À appeler APRÈS updateSegmentEnv pour lire un p à jour.
export function updatePlatformPresence(): void {
  // Le joueur est descendu : c'est la gare qui devient le repère fixe. Elle ne
  // glisse plus et ne disparaît plus — c'est la rame qui s'en va (runtime.trainZ).
  if (runtime.playerFrame === 'platform') {
    runtime.platformFade = 1;
    runtime.platformSlide = 0;
    return;
  }
  const { phase } = useStore.getState();
  const { presence, slide } = presenceFrom(phase, segEnv.p);
  runtime.platformFade = presence;
  runtime.platformSlide = slide;
}

// Presence immédiate pour randomizeEntry (segEnv peut ne pas être à jour).
export function seedPlatformPresence(phase: Phase, phaseT: number): void {
  const journey = CONFIG.departTime + CONFIG.cruiseTime + CONFIG.brakeTime;
  let p = 0;
  if (phase === 'depart') p = Math.min(1, phaseT / journey);
  else if (phase === 'cruise') p = Math.min(1, (CONFIG.departTime + phaseT) / journey);
  else if (phase === 'brake') p = Math.min(1, (CONFIG.departTime + CONFIG.cruiseTime + phaseT) / journey);
  else p = 1;
  const { presence, slide } = presenceFrom(phase, p);
  runtime.platformFade = presence;
  runtime.platformSlide = slide;
}
