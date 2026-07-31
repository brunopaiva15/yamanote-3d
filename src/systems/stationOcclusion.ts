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
import { activePlatformFlip } from './playerFrame';
import { layoutFor, type StationLayout } from '../data/stationLayouts';
import { OPP_DEPTH, PLATFORM_DEPTH, PSD_X, TRACK_HALF } from '../data/stationGeometry';
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
  // signature débordent encore - le faisceau de Nippori, l'International Forum
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
   * Bord extérieur de l'emprise BÂTIE : le fond du quai d'en face, faisceau
   * compris. À distinguer de `push`, qui est volontairement large pour ranger
   * des plans de quatre cents mètres - un repère de quartier, lui, doit se
   * poser juste derrière la gare, pas à l'horizon.
   */
  outer: PLATFORM_DEPTH,
  /**
   * L'écartement vaut-il des DEUX côtés ? Sur un îlot, tout est du côté du
   * quai et l'autre rive reste au décor de tronçon. À Harajuku - seul quai
   * latéral de la boucle - il y a une gare de chaque côté de la voie : le quai
   * d'en face et son auvent se plantaient dans la clôture du tronçon.
   */
  bothSides: false,
  /** Bord extérieur de la DALLE du quai : voir groundPush. */
  slabOuter: PSD_X + PLATFORM_DEPTH,
};

/** À appeler après updatePlatformPresence : lit platformFade / platformSlide. */
export function updateStationOcclusion(): void {
  const fade = runtime.platformFade;
  stationOcclusion.active = fade;
  // La gare qui occulte est celle dont le quai est là (platformIndex) : au
  // départ, index et doorSide sont déjà passés à la gare suivante alors que ce
  // quai-ci défile encore le long de la voie.
  const platformIndex = useStore.getState().platformIndex;
  stationOcclusion.side = activePlatformFlip();
  const layout = layoutFor(platformIndex);
  stationOcclusion.push = pushFor(layout);
  stationOcclusion.bothSides = layout.config === 'side';
  stationOcclusion.outer = outerOf(layout);
  stationOcclusion.slabOuter = PSD_X + layout.depth;
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

/** Bord extérieur bâti d'une gare : au-delà, il n'y a plus de gare. */
function outerOf(layout: StationLayout): number {
  if (layout.config === 'side') return PSD_X + layout.depth;
  const opp = PSD_X + layout.depth + 2 * TRACK_HALF + OPP_DEPTH;
  return opp + (layout.openFarSide ? YARD_REACH : 0);
}

/** Portée du faisceau qui remplace le mur de fond, là où il y en a un. */
const YARD_REACH = 4 * 4.6;

/** Écartement à appliquer à un plan long posé du côté `side`. */
export function sidePush(side: 1 | -1): number {
  const applies = stationOcclusion.bothSides || side === stationOcclusion.side;
  return applies ? stationOcclusion.active * stationOcclusion.push : 0;
}

// --- Ce qui court AU RAS DU SOL, un mètre sous la dalle ------------------
//
// Deux nappes horizontales passent sous le quai : le ballast de la voie
// (three/Wayside, de l'axe à ±5 m) et la rue de la ville (three/city, de 5 m
// vers l'extérieur). Le quai les masque toutes deux… sauf au droit d'une
// TRÉMIE D'ESCALIER, dont la volée descend un mètre plus bas qu'elles. Elles
// traversaient alors la cage de part en part : un plancher gris à mi-hauteur
// des marches, qui cachait tout le bas de la volée, le palier et son fléchage.
//
// Les deux se rangent donc, chacune de son côté et du strict nécessaire : le
// ballast rentre jusqu'au bord de quai, la rue ressort au nu extérieur de la
// dalle. Ce qu'on découvre entre les deux était de toute façon sous le quai.
// Les ranger à la hauteur des rangs bâtis (`sidePush`, une trentaine de
// mètres) aurait au contraire ouvert un vide entre le fond de la gare et la
// première rue.

/** Écartement de la NAPPE DE RUE, dont le bord intérieur est posé en `baseX`. */
export function groundPush(side: 1 | -1, baseX: number): number {
  const applies = stationOcclusion.bothSides || side === stationOcclusion.side;
  if (!applies) return 0;
  const want = stationOcclusion.slabOuter + 0.5 - baseX;
  return want > 0 ? stationOcclusion.active * want : 0;
}

/** Rentrée du BALLAST, dont la rive est posée en `edgeX` (positif). */
export function ballastTrim(side: 1 | -1, edgeX: number): number {
  const applies = stationOcclusion.bothSides || side === stationOcclusion.side;
  if (!applies) return 0;
  // Le bord de quai, moins dix centimètres : sur un quai sans portes palières
  // on se penche au-dessus de la voie, et le ballast doit encore filer sous la
  // rive de la dalle plutôt que s'arrêter à découvert.
  const want = edgeX - (PSD_X - 0.1);
  return want > 0 ? stationOcclusion.active * want : 0;
}

/**
 * Écartement d'un repère de quartier (tram, monorail, tours) posé en `baseX`.
 *
 * Ces repères vivaient à x = ±8 pour les proches, ±34 pour les silhouettes,
 * valeurs choisies quand la gare s'arrêtait au fond du quai. Elle se prolonge
 * maintenant par une voie, un quai d'en face et parfois un faisceau : le tram
 * d'Ōtsuka et la poutre de monorail de Hamamatsuchō se retrouvaient plantés
 * dans le ballast de la voie opposée.
 *
 * On les range donc juste DERRIÈRE l'emprise bâtie - pas à l'horizon : un tram
 * qui longe la gare doit rester lisible depuis le quai.
 */
export function landmarkPush(side: 1 | -1, baseX: number): number {
  const applies = stationOcclusion.bothSides || side === stationOcclusion.side;
  if (!applies) return 0;
  const want = stationOcclusion.outer + 3 - baseX;
  return want > 0 ? stationOcclusion.active * want : 0;
}
