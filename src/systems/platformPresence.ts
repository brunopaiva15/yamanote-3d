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
  clearing: boolean,
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
  if (phase === 'depart' || (phase === 'cruise' && clearing)) {
    // Piloté par la distance RÉELLEMENT parcourue depuis l'arrêt : le quai
    // défile exactement à la vitesse du train (immobile pendant le desserrage
    // des freins, puis accélération progressive) et ne s'efface qu'une fois
    // sa dernière travée dépassée. En 17 s de phase depart la rame ne parcourt
    // que ~74 m — moins que la demi-longueur du quai : la fin du défilement
    // déborde forcément sur le début de la croisière, d'où `clearing`.
    const d = Math.max(0, runtime.distance - runtime.departStartDist);
    const presence = 1 - smoothstep(halfLen * 0.7, entry, d);
    return { presence, slide: Math.min(d, entry + 10) };
  }
  return { presence: 0, slide: 0 };
}

// À appeler APRÈS updateSegmentEnv pour lire un p à jour.
export function updatePlatformPresence(): void {
  const state = useStore.getState();
  const { phase, index } = state;
  let platformIndex = state.platformIndex;
  // `index` avance vers la gare suivante dès l'entrée en depart ; le quai
  // visible, lui, reste celui de la gare quittée (`platformIndex`) tant qu'il
  // défile encore. Hors de ce défilement, les deux doivent coïncider — toute
  // bascule de phase inattendue (spawn, saut dev) se résout ici.
  if (platformIndex !== index && phase !== 'depart' && phase !== 'cruise') {
    state.setPlatformIndex(index);
    platformIndex = index;
  }
  // Publié ici plutôt que lu en trois endroits : le seuil de porte
  // (systems/walkable), le son du quai (three/Engine) et la mécanique des
  // vantaux (systems/doorMotion) doivent tous savoir si cette gare-ci a des
  // portes de quai. C'est la même gare que celle dont on lit le gabarit
  // ci-dessous — la cohérence est acquise, pas à retrouver.
  runtime.psdPresent = hasPlatformDoors(platformIndex);

  // Le joueur est descendu : c'est la gare qui devient le repère fixe. Elle ne
  // glisse plus et ne disparaît plus — c'est la rame qui s'en va (runtime.trainZ).
  if (runtime.playerFrame === 'platform') {
    runtime.platformFade = 1;
    runtime.platformSlide = 0;
    return;
  }
  const clearing = platformIndex !== index;
  const { presence, slide } = presenceFrom(
    phase,
    segEnv.p,
    layoutFor(platformIndex).length / 2,
    clearing,
  );
  runtime.platformFade = presence;
  runtime.platformSlide = slide;
  // Dernière travée dépassée : le quai suivant peut prendre l'identité de la
  // scène. C'est la SEULE bascule en roulant — jamais au coup de sifflet.
  if (clearing && presence <= 0) state.setPlatformIndex(index);
}

// Presence immédiate pour randomizeEntry (segEnv peut ne pas être à jour).
export function seedPlatformPresence(phase: Phase, phaseT: number): void {
  const { index, platformIndex } = useStore.getState();
  // p suit la convention du trajet (index, durées variables par tronçon) ; le
  // gabarit du quai, lui, est celui de la gare présente (platformIndex).
  const p = journeyProgress(phase, phaseT, index);
  runtime.psdPresent = hasPlatformDoors(platformIndex);
  const half = layoutFor(platformIndex).length / 2;
  const { presence, slide } = presenceFrom(phase, p, half, platformIndex !== index);
  runtime.platformFade = presence;
  runtime.platformSlide = slide;
}
