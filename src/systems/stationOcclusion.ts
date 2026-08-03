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
import { DOOR_SIDE } from '../data/stations';
import { layoutFor, type StationLayout } from '../data/stationLayouts';
import { reachFor, type ConcourseReach } from '../data/stationConcourseReach';
import { OPP_DEPTH, PLATFORM_DEPTH, PSD_X, TRACK_HALF } from '../data/stationGeometry';
import { BALLAST_KEEP_X } from '../data/stationConcourseTypes';
import { runtime } from './runtime';

/**
 * Écartement latéral appliqué aux plans longs quand le quai est là.
 *
 * Ce n'est plus une constante : la gare ne s'arrête plus au fond du quai. Sur
 * un îlot elle se prolonge par la voie d'en face et le quai qui la borde, soit
 * une quinzaine de mètres de plus à Shibuya. Un mur de soutènement écarté de
 * l'ancienne valeur ressortait en plein milieu de cette travée.
 */
function pushFor(layout: StationLayout, reach: ConcourseReach): number {
  // Bord près → bord d'en face, puis la voie (2 × 1,78 m) et le quai d'en face.
  // La marge est large à dessein : au-delà de la travée, les charpentes
  // signature débordent encore - le faisceau de Nippori, l'International Forum
  // de Yūrakuchō, le bois du Meiji-jingū derrière Harajuku. Un mur de
  // soutènement écarté au plus juste ressortait en plein milieu.
  const island = layout.config !== 'side';
  const generic = layout.depth + (island ? 24 : 18) + (layout.openFarSide ? 22 : 0);
  // ET CE QUE LA GARE BÂTIT PASSE AVANT. Vingt-trois gares sur trente ont un
  // ouvrage transversal - passerelle, pont-concourse, plateau - qui sort de la
  // bande du quai (`data/stationConcourseReach`). La valeur générique en couvre
  // déjà la plupart : ce n'est que sur les plus grandes qu'elle est trop juste,
  // et le maximum ne fait que rattraper ces cas-là. Elle ne RÉTRÉCIT jamais.
  return Math.max(generic, reach.built + PLANE_CLEAR - PLANE_BASE);
}

/**
 * Abscisse au repos du plan long le plus PROCHE de la voie, et jeu à laisser
 * entre lui et le fond de la gare.
 *
 * On se cale sur le plus proche - les mâts de caténaire - parce que tous les
 * autres reçoivent le même écartement : ce qui dégage celui-ci dégage le reste.
 */
const PLANE_BASE = 5.2;
const PLANE_CLEAR = 1.5;

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
   * Bord extérieur de ce que la gare BÂTIT, hall compris.
   *
   * `outer` s'arrête au fond du quai d'en face ; un plateau praticable va
   * quarante mètres plus loin à Ueno. Publié pour qui doit se ranger derrière
   * le HALL et non derrière le quai — mais pas pour les repères de quartier :
   * les y ranger mettrait le monorail de Hamamatsuchō hors de vue, et
   * `tests/stationConcourseReach` le refuse à juste titre. Le repère qui gêne
   * à Ueno est un immeuble de vingt mètres qui traverse le plancher : c'est
   * son ALTITUDE qui le condamne, pas sa distance, et c'est par là qu'il
   * faudra le prendre.
   */
  built: PLATFORM_DEPTH,
  /**
   * L'écartement vaut-il des DEUX côtés ? Voir `bothSidesFor` : ce n'est plus
   * une question de forme de quai depuis que six halls passent sous la voie.
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
  stationOcclusion.side = DOOR_SIDE[platformIndex];
  const layout = layoutFor(platformIndex);
  const reach = reachFor(platformIndex);
  stationOcclusion.push = pushFor(layout, reach);
  stationOcclusion.bothSides = bothSidesFor(layout, reach);
  stationOcclusion.outer = outerOf(layout);
  stationOcclusion.built = Math.max(stationOcclusion.outer, reach.built);
  // La nappe de rue se range derrière ce que la gare occupe AU RAS DU SOL, et
  // pas derrière son quai. Aujourd'hui les deux coïncident pour les trente -
  // `validateProfile` refuse qu'un niveau à cette altitude franchisse le
  // ballast, et les six gares dont un hall traverse le faisceau passent sous la
  // voie - mais la cote vient désormais du relevé, pas d'un raccourci.
  stationOcclusion.slabOuter = Math.max(PSD_X + layout.depth, reach.groundFar);
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

/**
 * L'ÉCARTEMENT VAUT-IL DES DEUX CÔTÉS ?
 *
 * Sur un îlot, tout ce que la gare occupait était du côté du quai, et l'autre
 * rive restait au décor de tronçon. À Harajuku — seul quai latéral de la boucle
 * — il y a une gare de chaque côté de la voie : le quai d'en face et son auvent
 * se plantaient dans la clôture du tronçon.
 *
 * CE N'EST PLUS LA SEULE RAISON. La moitié des gares bâtit AU-DELÀ de la voie
 * (`builtNear` négatif) : des halls qui passent dessous et ressortent, des
 * plateaux qui l'enjambent. De ce côté-là, le décor ne s'écartait pas — et
 * l'on trouvait sa joue de tablier au milieu de la zone payante de Tokyo, sept
 * mètres sous la chaussée, et un pâté d'immeubles au milieu du passage libre
 * de Shinagawa, huit mètres au-dessus des voies.
 *
 * Le seuil est le plan de décor le plus PROCHE de la voie (`PLANE_BASE`) : dès
 * que la gare bâtit au-delà, elle est chez elle et le décor recule.
 */
function bothSidesFor(layout: StationLayout, reach: ConcourseReach): boolean {
  return layout.config === 'side' || reach.builtNear < -PLANE_BASE;
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

/**
 * Rentrée du BALLAST, dont la rive est posée en `edgeX` (positif).
 *
 * ELLE NE SUIT PAS L'EMPRISE DU PROFIL, et c'est la seule des trois qui ne la
 * suit pas. La nappe de rue peut reculer autant qu'il faut, puisque la gare
 * couvre ce qu'on découvre ; la plate-forme de la voie, elle, porte un train.
 * Sa rive rentre jusqu'au bord de quai et s'arrête là, définitivement. C'est
 * pourquoi `BALLAST_KEEP_X` est publié côté données
 * (`data/stationConcourseTypes`) et vérifié par `validateProfile` : un couloir
 * qui traverse la voie passe DESSOUS, ou il n'existe pas.
 */
export function ballastTrim(side: 1 | -1, edgeX: number): number {
  const applies = stationOcclusion.bothSides || side === stationOcclusion.side;
  if (!applies) return 0;
  // Le bord de quai, moins dix centimètres : sur un quai sans portes palières
  // on se penche au-dessus de la voie, et le ballast doit encore filer sous la
  // rive de la dalle plutôt que s'arrêter à découvert.
  const want = edgeX - BALLAST_KEEP_X;
  return want > 0 ? stationOcclusion.active * want : 0;
}

/**
 * Écartement d'un repère de quartier (tram, monorail, tours) posé en `baseX`.
 *
 * IL NE SUIT PAS L'EMPRISE NON PLUS, et pour une raison qui n'a rien à voir
 * avec le ballast : un repère de quartier n'est pas occulté par la gare, il est
 * REGARDÉ depuis elle. Le ranger derrière une passerelle de trente mètres
 * mettrait le tram d'Ōtsuka et la poutre de monorail de Hamamatsuchō hors de
 * portée du regard, ce qui est exactement le contraire de leur raison d'être.
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
