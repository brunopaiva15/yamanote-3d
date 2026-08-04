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
import { psdGates } from '../three/station/psdLayout';
import { placementFor } from './stationPlacement';
import { builtBandBeyond } from './stationDeck';
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
  //
  // ET IL FAUT LES DEUX PORTÉES, non la seule lointaine. Un écartement est un
  // nombre unique que chaque côté applique au sien : la gare qui s'avance de
  // quarante-deux mètres d'un côté et de cinquante-six de l'autre - c'est
  // Tokyo - doit dégager sur cinquante-six, sinon le côté long garde le décor
  // du côté court. C'est ce qui laissait le mur de soutènement du tronçon et
  // un pâté d'immeubles au milieu de la zone payante de Tokyo, sept mètres
  // sous la chaussée : `bothSides` était bien passé à vrai (phase 31), mais on
  // poussait des deux côtés de la SEULE mesure lointaine.
  const built = Math.max(reach.built, -reach.builtNear);
  return Math.max(generic, built + PLANE_CLEAR - PLANE_BASE);
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
   * LA TRANCHE D'ALTITUDE de ce que la gare bâtit au-delà du quai, ou `null`
   * quand elle ne bâtit rien là-bas.
   *
   * C'est le pendant de `built` pour qui ne peut pas se ranger derrière lui.
   * Un repère de quartier se REGARDE depuis la gare : le reculer jusqu'au
   * fond du hall le met hors de vue, et `tests/stationConcourseReach` le
   * refuse. Mais un immeuble de vingt mètres traverse un plancher à cinq, et
   * celui-là n'a plus rien d'un repère qu'on regarde — c'est un mur au milieu
   * de la pièce. La bande dit à quelle hauteur la question se pose.
   */
  builtBand: null as { y0: number; y1: number; x1: number } | null,
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
  stationOcclusion.builtBand = bandFor(platformIndex, stationOcclusion.outer);
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

/**
 * La tranche d'altitude bâtie au-delà du quai, par gare.
 *
 * Mémoïsée comme la percée de toiture (`systems/hubRoof`) : elle ne dépend que
 * de l'index, et le réseau est déjà monté par `placementFor`.
 */
const BANDS = new Map<number, { y0: number; y1: number; x1: number } | null>();

function bandFor(index: number, outer: number): { y0: number; y1: number; x1: number } | null {
  const i = ((index % 30) + 30) % 30;
  const hit = BANDS.get(i);
  if (hit !== undefined) return hit;
  const out = builtBandBeyond(placementFor(i, psdGates()).network, outer);
  BANDS.set(i, out);
  return out;
}

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
 *
 * SAUF LA SILHOUETTE QUI TRAVERSE UN PLANCHER, et c'est tout l'objet de la
 * phase 31. Treize gares portent un plateau praticable qui s'avance de
 * quarante mètres au-dessus de la ville ; s'y tenaient un immeuble de onze
 * mètres à Ueno, un de dix-neuf à Shinagawa, des façades de vingt-quatre à
 * Meguro. Un repère n'est plus REGARDÉ quand on l'a dans la pièce : il en est
 * le mur du fond, et il doit reculer derrière ce que la gare bâtit.
 *
 * DEUX CONDITIONS, ET IL LES FAUT TOUTES LES DEUX.
 *
 *   · `span` n'est donné que pour les SILHOUETTES de quartier — les tours, les
 *     façades, les pylônes posés à trente-quatre mètres. Les repères PROCHES
 *     (le tram d'Ōtsuka, la poutre de monorail de Hamamatsuchō) sont des
 *     ouvrages au ras de la voie, à la place où la voie les met : c'est
 *     exactement ce que `tests/stationConcourseReach` protège, et les ranger
 *     derrière un pont-concourse de trente-quatre mètres serait le contraire
 *     de leur raison d'être. La poutre du monorail monte à six mètres et
 *     frôlerait la cote d'un plateau : c'est bien pourquoi la hauteur seule ne
 *     peut pas trancher ;
 *   · et il faut que la hauteur RENCONTRE la tranche bâtie. Un immeuble qui
 *     reste sous le plateau reste près, si haut que soit le plateau.
 *
 * `span.inset` dit de combien le repère s'avance vers la voie depuis son
 * origine : on range son NEZ derrière la gare, et non son milieu — sans quoi
 * un immeuble de six mètres de fond en garde trois dans la pièce.
 */
export interface LandmarkSpan {
  /** Hauteur du repère, en repère monde. */
  y0: number;
  y1: number;
  /** Avancée vers la voie depuis l'origine du repère. */
  inset: number;
}

/** Jeu laissé entre la gare et le repère rangé derrière elle. */
const LANDMARK_CLEAR = 3;

export function landmarkPush(side: 1 | -1, baseX: number, span?: LandmarkSpan): number {
  const applies = stationOcclusion.bothSides || side === stationOcclusion.side;
  if (!applies) return 0;
  const band = stationOcclusion.builtBand;
  const crosses = band !== null && span !== undefined
    && span.y1 > band.y0 && span.y0 < band.y1;
  const want = crosses
    ? (band as { x1: number }).x1 + LANDMARK_CLEAR + (span as LandmarkSpan).inset - baseX
    : stationOcclusion.outer + LANDMARK_CLEAR - baseX;
  return want > 0 ? stationOcclusion.active * want : 0;
}
