// Le temps que met un moteur à ouvrir les yeux.
//
// Passer en « Extraordinaire » n'est pas un réglage qui s'applique : c'est un
// démontage de la toile et un remontage sur un autre moteur. Entre les deux, il
// se passe trois choses, et aucune n'est instantanée :
//
//   1. on interroge l'adaptateur WebGPU et on télécharge le paquet du mode
//      (deux cents kilo-octets compressés) ;
//   2. react-three-fiber attend `renderer.init()`, qui négocie le périphérique ;
//   3. la scène se reconstruit et le renderer COMPILE ses nuanceurs - c'est le
//      poste le plus long, et le seul qui n'existe pas en WebGL, où les
//      programmes sont compilés au fil de l'eau.
//
// Pendant tout ça, il n'y a rien à l'écran : la toile est démontée, et le fond
// de page apparaît. Ce module ne fait que porter la question « est-ce que le
// moteur a fini par dessiner quelque chose ? », pour que l'interface puisse
// mettre un mot dessus au lieu d'un rectangle gris.

import { create } from 'zustand';

interface RenderBootState {
  /** Faux uniquement pendant qu'un moteur démarre. Vrai le reste du temps. */
  ready: boolean;
}

/**
 * Faux AU DÉPART, et c'est tout le sujet.
 *
 * On a d'abord essayé de lever le voile au montage du jeu, dans un effet. Il ne
 * s'affichait jamais : l'essentiel du travail - trente gabarits de gare, le
 * ruban urbain, les textures peintes au canevas - a lieu pendant le RENDU
 * React, c'est-à-dire avant que le moindre effet ne s'exécute. Le voile
 * arrivait après la course.
 *
 * Il est donc là dès le premier instant, et le seul événement qui le lève est
 * une image réellement dessinée. Il n'y a plus d'ordre à respecter : rien ne
 * peut se glisser avant lui.
 */
export const useRenderBoot = create<RenderBootState>(() => ({ ready: false }));

/** Un moteur commence à démarrer : l'écran va rester vide un moment. */
export function beginRenderBoot(): void {
  if (!useRenderBoot.getState().ready) return;
  useRenderBoot.setState({ ready: false });
}

/**
 * Le moteur a dessiné - ou a renoncé. Dans les deux cas il n'y a plus rien à
 * attendre, et l'attente ne doit pas survivre à ce qu'elle annonçait.
 */
export function endRenderBoot(): void {
  if (useRenderBoot.getState().ready) return;
  useRenderBoot.setState({ ready: true });
}
