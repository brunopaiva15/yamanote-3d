// Présence spatiale du quai : plus de fondu d'opacité. Le quai est opaque et
// glisse le long de la voie — il arrive de l'avant pendant le freinage, reste
// calé à l'arrêt, puis part derrière au départ. Écrit dans runtime chaque frame.
//
// L'approche est pilotée par la DISTANCE QUI RESTE À PARCOURIR avant l'arrêt
// (systems/trainPhysics, stopDistance) et non plus par une courbe de temps
// calée sur la progression du trajet. La différence n'est pas cosmétique :
// une courbe de temps ignore le profil de freinage, elle finissait sa course
// plusieurs secondes avant que la rame ne s'arrête vraiment et compressait
// tout le glissement dans les dernières secondes — sur un tronçon court
// (Mejiro→Takadanobaba, 8 s de croisière), le quai arrivait d'un bloc alors
// que la rame était déjà presque à l'arrêt. En posant le quai à −R, il défile
// exactement à la vitesse du train, comme le reste du décor, et se pose de
// lui-même : le dernier mètre dure ses quatre secondes et les dix derniers
// centimètres se voient passer.

import { V_MAX } from '../data/config';
import { cruiseDuration } from '../data/segments';
import { useStore, type Phase } from '../store';
import { runtime } from './runtime';
import { stopDistance } from './trainPhysics';
import { hasPlatformDoors, layoutFor } from '../data/stationLayouts';

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Le quai apparaît quand son about arrive à cette distance devant la rame (m). */
const ENTRY_AHEAD = 34;
/** Course du fondu d'entrée en scène, comptée sur la distance restante (m). */
const ENTRY_FADE = 26;

/**
 * Distance restant à parcourir jusqu'au point d'arrêt (m).
 *
 * En freinage, c'est exactement le profil physique. En croisière, on y ajoute
 * ce qui reste de course avant le coup de frein : la mesure est continue au
 * changement de phase (le terme de croisière s'annule pile quand le freinage
 * commence), et le quai peut donc entrer en scène AVANT le freinage — sur les
 * tronçons courts, où la rame freine de 50 km/h, la distance d'arrêt seule ne
 * suffirait pas à le faire apparaître en douceur.
 *
 * La vitesse d'extrapolation garde un plancher : pendant un arrêt d'urgence,
 * la vitesse réelle tombe à zéro et l'estimation s'effondrerait, plaquant le
 * quai sur la rame en pleine voie.
 */
function distanceToStop(phase: Phase, phaseT: number, index: number): number {
  const braking = stopDistance(runtime.speed, runtime.accel);
  if (phase === 'brake') return braking;
  if (phase === 'cruise') {
    const left = Math.max(0, cruiseDuration(index) - phaseT);
    return left * Math.max(runtime.speed, V_MAX * 0.5) + braking;
  }
  return 0;
}

function presenceFrom(
  phase: Phase,
  phaseT: number,
  index: number,
  halfLen: number,
  clearing: boolean,
): { presence: number; slide: number } {
  // Le quai fait 224 m : il ne peut apparaître ni s'effacer qu'une fois son
  // about passé, sinon il se volatiliserait alors qu'il entoure encore la rame.
  const entry = halfLen + ENTRY_AHEAD;
  if (phase === 'depart' || (phase === 'cruise' && clearing)) {
    // Piloté par la distance RÉELLEMENT parcourue depuis l'arrêt : le quai
    // défile exactement à la vitesse du train (immobile pendant le desserrage
    // des freins, puis accélération progressive) et ne s'efface qu'une fois
    // sa dernière travée dépassée. En 17 s de phase depart la rame ne parcourt
    // que ~74 m — moins que la demi-longueur du quai : la fin du défilement
    // déborde forcément sur le début de la croisière, d'où `clearing`.
    const d = Math.max(0, runtime.distance - runtime.departStartDist);
    const presence = 1 - smoothstep(halfLen * 0.7, entry, d);
    return { presence, slide: runtime.berthOffset + Math.min(d, entry + 10) };
  }
  if (phase === 'dwell') return { presence: 1, slide: runtime.berthOffset };
  if (phase === 'brake' || phase === 'cruise') {
    // Approche : le quai est posé à la distance qui reste à parcourir, l'écart
    // d'arrêt de la rame en plus. Tant qu'il est trop loin pour être vu, on le
    // gare à `entry` — sa position exacte n'a alors aucun sens.
    const left = distanceToStop(phase, phaseT, index);
    const presence = 1 - smoothstep(entry - ENTRY_FADE, entry, left);
    return { presence, slide: runtime.berthOffset - Math.min(left, entry) };
  }
  return { presence: 0, slide: 0 };
}

// À appeler APRÈS updateSegmentEnv (l'ordre historique de la boucle).
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
    runtime.phaseT,
    index,
    layoutFor(platformIndex).length / 2,
    clearing,
  );
  runtime.platformFade = presence;
  runtime.platformSlide = slide;
  // Dernière travée dépassée : le quai suivant peut prendre l'identité de la
  // scène. C'est la SEULE bascule en roulant — jamais au coup de sifflet.
  if (clearing && presence <= 0) state.setPlatformIndex(index);
}

// Presence immédiate pour randomizeEntry, qui a déjà posé phase, vitesse et
// distance dans runtime mais pas encore fait tourner la boucle.
export function seedPlatformPresence(phase: Phase, phaseT: number): void {
  const { index, platformIndex } = useStore.getState();
  runtime.psdPresent = hasPlatformDoors(platformIndex);
  const half = layoutFor(platformIndex).length / 2;
  const { presence, slide } = presenceFrom(
    phase,
    phaseT,
    index,
    half,
    platformIndex !== index,
  );
  runtime.platformFade = presence;
  runtime.platformSlide = slide;
}
