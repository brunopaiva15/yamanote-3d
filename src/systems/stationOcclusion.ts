// Le décor de voie traverse l'emprise du quai.
//
// Les poteaux caténaires (x = ±5.2), les murs de soutènement (±6.6), les
// clôtures (±6.2), les arbres et le faisceau de voies (±9) sont tous posés
// dans les 5,4 m que le quai occupe. Personne ne l'avait jamais vu : depuis le
// wagon, le quai opaque masque tout ce qui est derrière lui. Dès qu'on marche
// dessus, les poteaux poussent à travers la dalle et l'auvent.
//
// Deux traitements, selon la forme de l'objet :
//   - ce qui est ponctuel et recyclé le long de la voie (portiques, arbres)
//     disparaît quand il tombe dans l'emprise longitudinale du quai ;
//   - ce qui est un plan de 400 m (murs, clôtures, faisceau) est écarté
//     latéralement, pour continuer à occulter la ville derrière la gare.

import { useStore } from '../store';
import { layoutFor } from '../data/stationLayouts';
import { PLATFORM_DEPTH } from '../data/stationGeometry';
import { runtime } from './runtime';

/** Écartement latéral appliqué aux plans longs quand le quai est là. */
export const OCCLUSION_PUSH = PLATFORM_DEPTH + 6;

/** Marge longitudinale au-delà des bouts de quai (auvent, escaliers…). */
const SPAN_MARGIN = 6;

export const stationOcclusion = {
  /** 0..1, suit la présence du quai. */
  active: 0,
  /** Côté d'ouverture : le quai est de ce côté-là de la voie. */
  side: 1 as 1 | -1,
  /** Emprise longitudinale du quai, en repère MONDE. */
  z0: 0,
  z1: 0,
};

/** À appeler après updatePlatformPresence : lit platformFade / platformSlide. */
export function updateStationOcclusion(): void {
  const fade = runtime.platformFade;
  stationOcclusion.active = fade;
  stationOcclusion.side = useStore.getState().doorSide;
  const layout = layoutFor(useStore.getState().index);
  const half = layout.length / 2 + SPAN_MARGIN;
  stationOcclusion.z0 = runtime.platformSlide - half;
  stationOcclusion.z1 = runtime.platformSlide + half;
  runtime.platformOcclusion = fade;
}

/**
 * Un objet ponctuel posé en (x, z) monde est-il avalé par la gare ? Le test de
 * côté est volontairement large : un portique enjambe les deux voies, il suffit
 * qu'un de ses mâts tombe dans le quai pour qu'il faille l'escamoter.
 */
export function hiddenByStation(z: number, bothSides = true, x = 0): boolean {
  if (stationOcclusion.active < 0.5) return false;
  if (z < stationOcclusion.z0 || z > stationOcclusion.z1) return false;
  if (bothSides) return true;
  return Math.sign(x) === stationOcclusion.side;
}

/** Écartement à appliquer à un plan long posé du côté `side`. */
export function sidePush(side: 1 | -1): number {
  return side === stationOcclusion.side ? stationOcclusion.active * OCCLUSION_PUSH : 0;
}
