// Présence spatiale du quai : plus de fondu d'opacité. Le quai est opaque et
// glisse le long de la voie — il arrive de l'avant pendant le freinage, reste
// calé à l'arrêt, puis part derrière au départ. Piloté par la progression du
// trajet (segEnv.p) et la phase, écrit dans runtime chaque frame.

import { journeyProgress } from '../data/segments';
import { useStore, type Phase } from '../store';
import { runtime } from './runtime';
import { segEnv } from './segmentEnv';
import { hasPlatformDoors, layoutFor } from '../data/stationLayouts';

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function presenceFrom(
  phase: Phase,
  p: number,
  halfLen: number,
): { presence: number; slide: number } {
  // Le quai fait maintenant 224 m et non plus 96 : il ne peut plus apparaître
  // ni s'effacer aux mêmes distances, sinon il se volatiliserait alors qu'il
  // entoure encore la rame.
  const entry = halfLen + 34;
  if (phase === 'brake') {
    // Freinage : p ≈ 0.878 → 1. Le quai entre assez tôt pour qu'on le voie
    // glisser le long des vitres, opaque, comme une vraie approche.
    const presence = smoothstep(0.87, 0.96, p);
    return { presence, slide: (1 - presence) * -entry };
  }
  if (phase === 'dwell') return { presence: 1, slide: 0 };
  if (phase === 'depart') {
    // Piloté par la distance RÉELLEMENT parcourue depuis l'arrêt : le quai
    // défile exactement à la vitesse du train (immobile pendant le desserrage
    // des freins, puis accélération progressive) et ne s'efface qu'une fois
    // sa dernière travée dépassée.
    const d = Math.max(0, runtime.distance - runtime.departStartDist);
    const presence = 1 - smoothstep(halfLen * 0.7, entry, d);
    return { presence, slide: Math.min(d, entry + 10) };
  }
  return { presence: 0, slide: 0 };
}

// À appeler APRÈS updateSegmentEnv pour lire un p à jour.
export function updatePlatformPresence(): void {
  const { phase, index } = useStore.getState();
  // Publié ici plutôt que lu en trois endroits : le seuil de porte
  // (systems/walkable), le son du quai (three/Engine) et la mécanique des
  // vantaux (systems/doorMotion) doivent tous savoir si cette gare-ci a des
  // portes de quai. C'est la même gare que celle dont on lit le gabarit
  // ci-dessous — la cohérence est acquise, pas à retrouver.
  runtime.psdPresent = hasPlatformDoors(index);

  // Le joueur est descendu : c'est la gare qui devient le repère fixe. Elle ne
  // glisse plus et ne disparaît plus — c'est la rame qui s'en va (runtime.trainZ).
  if (runtime.playerFrame === 'platform') {
    runtime.platformFade = 1;
    runtime.platformSlide = 0;
    return;
  }
  const { presence, slide } = presenceFrom(phase, segEnv.p, layoutFor(index).length / 2);
  runtime.platformFade = presence;
  runtime.platformSlide = slide;
}

// Presence immédiate pour randomizeEntry (segEnv peut ne pas être à jour).
export function seedPlatformPresence(phase: Phase, phaseT: number): void {
  const index = useStore.getState().index;
  const p = journeyProgress(phase, phaseT, index);
  runtime.psdPresent = hasPlatformDoors(index);
  const half = layoutFor(index).length / 2;
  const { presence, slide } = presenceFrom(phase, p, half);
  runtime.platformFade = presence;
  runtime.platformSlide = slide;
}
