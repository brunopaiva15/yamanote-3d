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
import { layoutFor, type StationLayout } from '../data/stationLayouts';
import { PLATFORM_DEPTH } from '../data/stationGeometry';
import { runtime } from './runtime';

/**
 * Écartement latéral appliqué aux plans longs quand le quai est là.
 *
 * Ce n'est plus une constante : la gare ne s'arrête plus au fond du quai. Sur
 * un îlot elle se prolonge par la voie d'en face et le quai qui la borde, soit
 * une quinzaine de mètres de plus à Shibuya. Un mur de soutènement écarté de
 * l'ancienne valeur ressortait en plein milieu de cette travée.
 */
function pushFor(layout: StationLayout): number {
  // Bord près → bord d'en face, puis la voie (2 × 1,78 m) et le quai d'en face.
  // La marge est large à dessein : au-delà de la travée, les charpentes
  // signature débordent encore — le faisceau de Nippori, l'International Forum
  // de Yūrakuchō, le bois du Meiji-jingū derrière Harajuku. Un mur de
  // soutènement écarté au plus juste ressortait en plein milieu.
  const island = layout.config !== 'side';
  return layout.depth + (island ? 24 : 18) + (layout.openFarSide ? 22 : 0);
}

/** Valeur de repli, pour qui a besoin d'un ordre de grandeur hors frame. */
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
  /** Écartement à appliquer, propre à la gare courante. */
  push: PLATFORM_DEPTH + 6,
  /**
   * L'écartement vaut-il des DEUX côtés ? Sur un îlot, tout est du côté du
   * quai et l'autre rive reste au décor de tronçon. À Harajuku — seul quai
   * latéral de la boucle — il y a une gare de chaque côté de la voie : le quai
   * d'en face et son auvent se plantaient dans la clôture du tronçon.
   */
  bothSides: false,
};

/** À appeler après updatePlatformPresence : lit platformFade / platformSlide. */
export function updateStationOcclusion(): void {
  const fade = runtime.platformFade;
  stationOcclusion.active = fade;
  stationOcclusion.side = useStore.getState().doorSide;
  const layout = layoutFor(useStore.getState().index);
  stationOcclusion.push = pushFor(layout);
  stationOcclusion.bothSides = layout.config === 'side';
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
  const applies = stationOcclusion.bothSides || side === stationOcclusion.side;
  return applies ? stationOcclusion.active * stationOcclusion.push : 0;
}
