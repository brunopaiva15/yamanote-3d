// Où se posent les objets du quai.
//
// Une seule source pour deux consommateurs qui doivent absolument être
// d'accord : le rendu (three/station) et la marche du joueur (walkable). Un
// banc dessiné à un endroit et infranchissable à un autre, cela se voit tout
// de suite.
//
// Repère QUAI : x mesuré depuis l'axe de la voie vers le fond du quai, z le
// long de la voie, origine au milieu du quai.

import { CONSIST, E235 } from '../data/e235';
import { layoutFor, type StationLayout } from '../data/stationLayouts';
import { interiorFor, type StationInterior } from '../data/stationInterior';
import {
  ELEVATOR_HALF_Z,
  ESCALATOR_HALF_Z,
  OPP_DEPTH,
  PSD_HALF_GAP,
  PSD_X,
  TRACK_HALF,
  STAIR_HALF_X,
  STAIR_HALF_Z,
  STAIR_WALK_HALF_X,
  STAIR_WALK_LEN,
  STAIR_WALK_STEPS,
  ASCENT_LEN,
  stairFloorY,
} from '../data/stationGeometry';

export interface Placed {
  x: number;
  z: number;
  /** Demi-emprise, pour la collision. */
  halfX: number;
  halfZ: number;
}

/**
 * La trousse réglementaire du quai : les petits équipements qu'on ne remarque
 * qu'en leur absence. Chacun n'est qu'une abscisse le long de la voie ; leur
 * hauteur et leur support sont l'affaire du rendu (three/station/PlatformKit).
 */
export interface StationKit {
  /** Diffuseurs de la sonorisation, suspendus à l'auvent. */
  speakers: number[];
  /** Caméras de surveillance, sur un pilier sur trois. */
  cameras: number[];
  /** Coffrets d'extincteur, vissés sur un pilier sur quatre. */
  extinguishers: number[];
  /** Boutons d'arrêt d'urgence, écartés des baies de portes. */
  emergencyStops: number[];
  /**
   * Abscisse de ces boutons : plaqués sur la face pleine du muret là où il y a
   * des portes de quai, sur une borne en retrait de la bande podotactile là où
   * il n'y en a pas - à Shinjuku et Shibuya, il n'y a aucun muret pour les
   * porter.
   */
  emergencyStopX: number;
  /** Miroirs de départ suspendus, au droit des cabines de conduite. */
  mirrors: number[];
  /** Téléphone ferroviaire, sur un pilier lui aussi. */
  phone: number | null;
  /** Descentes d'eau pluviale, un pilier sur deux. */
  downpipes: number[];
  /** Repères de voiture peints au sol : 「N号車 乗車位置」. */
  carMarks: { z: number; car: number }[];
  /**
   * Tronçons libres pour les conduites qui courent le long du quai -
   * gouttière, chemin de câbles.
   *
   * D'un seul tenant sur deux cent vingt mètres, une conduite traverse tout ce
   * qui monte à l'auvent : la gaine d'un escalier mécanique, la cage d'un
   * ascenseur, le toit d'un kiosque. Une vraie installation s'interrompt et
   * repart de l'autre côté ; celle-ci fait pareil.
   */
  runSpans: { z0: number; z1: number }[];
}

/**
 * Un accès au quai, avec sa lettre.
 *
 * Les plans officiels JR balisent chaque escalier, escalier mécanique et
 * ascenseur par une lettre, et c'est par elle qu'on se repère : « rendez-vous
 * en B ». La lettre suit l'ordre le long de la voie, tous types confondus -
 * c'est ainsi qu'un plan se lit, pas par famille.
 */
export interface Access {
  kind: 'stairs' | 'escalator' | 'elevator';
  /** A, B, C… dans l'ordre où on les rencontre en marchant. */
  letter: string;
  x: number;
  z: number;
  halfZ: number;
}

export interface StationPlacement {
  layout: StationLayout;
  /**
   * Abscisse de l'ossature du quai : ce à quoi tout s'adosse.
   *
   * Sur un quai latéral (Harajuku, seul cas de la boucle) c'est le nu intérieur
   * du mur de fond. Sur les vingt-neuf autres - des îlots - il n'y a AUCUN mur :
   * c'est l'épine centrale, entre les deux bords d'embarquement, celle où
   * s'alignent piliers, bancs, distributeurs et caissons publicitaires.
   *
   * Les deux cas se nomment pareil à dessein : tout ce qui se pose « au fond »
   * se pose sur l'épine, sans avoir à savoir lequel des deux il a devant lui.
   */
  backX: number;
  /** Y a-t-il vraiment un mur derrière ? Harajuku seulement. */
  hasBackWall: boolean;
  /** Bord de quai opposé, sur un îlot ; null sur un quai latéral. */
  farEdgeX: number | null;
  /** Bornes de marche du joueur et de la foule. */
  walkX0: number;
  walkX1: number;
  walkHalfZ: number;
  columns: number[];
  benches: Placed[];
  /** Batteries de tri : chaque emprise porte trois bacs côte à côte. */
  bins: Placed[];
  vending: Placed[];
  /** Armoires électriques et coffrets techniques, adossés au fond. */
  cabinets: Placed[];
  kiosk: Placed | null;
  stairs: Placed[];
  escalators: Placed[];
  elevator: Placed | null;
  /** Repères d'attente peints au sol, deux par baie de porte palière. */
  queueMarks: { x: number; z: number }[];
  /** Trémies, escaliers mécaniques et ascenseur, balisés par lettre. */
  accesses: Access[];
  kit: StationKit;
  /** Toutes les emprises qui barrent le passage. */
  obstacles: Placed[];
  /**
   * La trémie par laquelle on descend DANS la gare, et le niveau qu'elle
   * dessert.
   *
   * Une seule des trémies mène au hall : les autres gardent le couloir borgne
   * qu'elles avaient - c'est aussi ce que fait une vraie gare, où toutes les
   * volées d'un quai ne débouchent pas sur le même endroit, ni toutes sur un
   * endroit. Celle-ci est la plus proche du milieu du quai, parce que c'est
   * celle qu'on trouve en descendant du train.
   */
  mainStair: Placed;
  /**
   * Cet accès DESCEND-il, ou monte-t-il ?
   *
   * Publié ici parce que trois consommateurs doivent en tomber d'accord au
   * centimètre : le percement de la dalle (une volée montante n'en fait pas),
   * le rendu de l'accès, et la marche. C'est `interior.place` qui décide - le
   * hall est sous les voies ou dessus - et cette ligne évite que chacun aille
   * le relire à sa façon.
   */
  mainRise: 'down' | 'up';
  interior: StationInterior;
}

const CACHE = new Map<number, StationPlacement>();

/**
 * Répartit `n` positions sur la longueur utile du quai, en évitant les abouts.
 * Le décalage impair casse la régularité : rien n'est jamais parfaitement
 * aligné sur un vrai quai.
 */
function spread(n: number, halfZ: number, phase = 0): number[] {
  if (n <= 0) return [];
  const span = halfZ * 2 * 0.86;
  const step = span / n;
  return Array.from({ length: n }, (_, i) => -span / 2 + step * (i + 0.5) + phase);
}

/**
 * Positions tous les `step` mètres sur la longueur utile. À l'inverse de
 * `spread`, l'entraxe est imposé et c'est le nombre qui s'ajuste : un diffuseur
 * de sonorisation se pose tous les vingt mètres, pas « douze par quai ».
 */
function every(step: number, halfZ: number, phase = 0): number[] {
  const out: number[] = [];
  for (let z = -halfZ + phase; z <= halfZ; z += step) out.push(z);
  return out;
}

/**
 * Découpe [z0, z1] en tronçons libres, en retirant les intervalles occupés.
 * Les morceaux trop courts pour valoir un objet sont abandonnés.
 */
function clearSpans(
  z0: number,
  z1: number,
  blocked: { z0: number; z1: number }[],
  minLen = 3,
): { z0: number; z1: number }[] {
  const out: { z0: number; z1: number }[] = [];
  let cur = z0;
  for (const b of [...blocked].sort((a, c) => a.z0 - c.z0)) {
    if (b.z0 > cur + minLen) out.push({ z0: cur, z1: Math.min(b.z0, z1) });
    cur = Math.max(cur, b.z1);
  }
  if (z1 > cur + minLen) out.push({ z0: cur, z1 });
  return out.filter((sp) => sp.z1 - sp.z0 >= minLen);
}

/** Recul de la potence d'orientation devant l'entrée de son accès (m). */
export const GANTRY_PULL = 1.6;

/**
 * Dégagement devant le nez d'une trémie ou d'un escalier mécanique (m).
 *
 * La volée s'ouvre côté -z : c'est par là qu'on y entre, que la foule s'y
 * dirige, et que la potence d'orientation se tient. L'emprise de la cage
 * elle-même ne couvre pas ce débouché - sans cette réserve, un banc ou un
 * pilier s'y calait juste devant l'entrée.
 */
const ACCESS_APPROACH = 2.0;

/**
 * Abscisses des potences d'orientation le long de la voie.
 *
 * Une par escalier et par escalier mécanique, un peu avant l'entrée - c'est le
 * rendu (OverheadSigns) qui les dessine, mais leur position est une affaire de
 * placement : les caissons publicitaires de l'épine et les totems doivent la
 * connaître pour s'en écarter, sinon les panneaux se traversent.
 */
export function gantryZs(p: StationPlacement): number[] {
  return p.accesses
    .filter((a) => a.kind !== 'elevator')
    .map((a) => a.z - a.halfZ - GANTRY_PULL);
}

/**
 * Emprise en travers d'un caisson de la rangée du bord de voie.
 *
 * Cette rangée-là est celle qu'on lit en marchant le long du quai : les
 * caissons y sont suspendus près du bord, en travers, et se présentent donc de
 * face. Le 番線 y était seul ; le 発車標 l'y a rejoint, et les deux doivent
 * s'aligner au millimètre - d'où cette cote unique.
 *
 * Pleine largeur tant que le quai le permet, raccourcie sur les quais étroits.
 * À 3,24 m elle traversait l'épine centrale - bande directionnelle, horloge,
 * chemin de câbles, gouttière - sur tous les îlots de moins de neuf mètres :
 * elle s'arrête donc avant le couloir de l'épine (le chemin de câbles, son
 * occupant le plus avancé, part à backX − 1,16).
 */
export function trackSignBox(p: StationPlacement): { x: number; w: number; hx: number } {
  // Le caisson part DERRIÈRE la ligne des portes palières, et non douze
  // centimètres devant elle : il débordait au-dessus de la voie, à vingt-six
  // centimètres du flanc de la caisse (qui monte à 1,475 m de l'axe), et de
  // trois quarts du quai on le voyait passer par-dessus la rame. Six
  // centimètres de retrait, dix-huit de moins en tout - le caisson garde sa
  // stature, il ne surplombe simplement plus le train.
  const inner = PSD_X + 0.06;
  const w = Math.min(3.06, p.backX - 1.3 - inner);
  return {
    w,
    x: inner + w / 2,
    /** Aplomb des suspentes, depuis le centre du caisson. */
    hx: Math.max(0.35, w / 2 - 0.57),
  };
}

/**
 * Ce qui, à hauteur de la rangée du bord de voie, interdit une abscisse.
 *
 * La trame des bannières publicitaires, le kiosque, l'horloge et les plans de
 * charpente signature occupent la même tranche sous l'auvent : un caisson posé
 * là les traverse.
 */
function rowBlocked(p: StationPlacement, z: number): boolean {
  const half = p.layout.length / 2;
  const solids = [
    ...(p.kiosk ? [{ z: p.kiosk.z, r: p.kiosk.halfZ + 0.3 }] : []),
    ...(p.layout.amenities.clock ? [{ z: 0, r: 0.65 }] : []),
    ...(p.layout.sigPlan?.keepOut ?? []).map((k) => ({ z: k.z, r: k.r + 0.15 })),
  ];
  // Les bannières courent tous les 26 m à partir de -half + 18, à la même
  // hauteur : au croisement, les deux caissons se traversaient.
  const d = Math.abs((((z - (-half + 18)) % 26) + 26) % 26);
  return Math.min(d, 26 - d) <= 2.2 || solids.some((s) => Math.abs(z - s.z) < s.r);
}

/**
 * Abscisses des panneaux 番線 le long de la voie.
 *
 * Un tous les trente-six mètres, décalé jusqu'à trouver son creux. Partagée
 * entre le rendu (OverheadSigns), les totems (PlatformSignage) qui s'en
 * écartent au sol, et les 発車標 qui partagent leur rangée.
 */
export function trackSignZs(p: StationPlacement): number[] {
  const halfZ = p.walkHalfZ;
  const out: number[] = [];
  for (let k = -3; k <= 3; k++) {
    let z = k * 36;
    if (Math.abs(z) > halfZ - 8) continue;
    for (let guard = 0; guard < 10 && rowBlocked(p, z); guard++) z += 2.4;
    // Chassé jusqu'au bout du quai sans trouver de creux : tant pis pour lui.
    if (Math.abs(z) > halfZ - 8) continue;
    out.push(z);
  }
  return out;
}

/**
 * Abscisses des 発車標, sur cette même rangée du bord de voie.
 *
 * Un dans CHAQUE intervalle de la rangée, à mi-distance de deux caissons
 * 番線 : les deux modèles alternent donc sur toute la longueur du quai, un
 * panneau tous les dix-huit mètres. C'est la densité réelle - sur deux cent
 * vingt mètres, un quai de la Yamanote en porte quatre ou cinq, un par accès,
 * et on n'attend jamais son train hors de vue d'un tableau. Deux, au tiers du
 * quai, laissaient quatre-vingt-dix mètres sans rien : on descendait d'une
 * rame en bout de quai sans savoir quand passerait la suivante.
 *
 * Le point de départ est le MILIEU d'un intervalle réel, et non une abscisse
 * théorique : les caissons 番線 se décalent eux-mêmes pour trouver leur creux,
 * et l'alternance suit ce qu'ils sont devenus.
 *
 * Un tableau se décale ensuite s'il tombe sur une bannière, le kiosque,
 * l'horloge, un plan de charpente - ou sous la traverse d'une potence, qui
 * passe six centimètres au-dessus de lui et le toucherait. Pas de creux à
 * portée sur un quai encombré : ce tableau-là saute. Mieux vaut un tableau de
 * moins qu'un tableau dans une traverse.
 */
export function departureBoardZs(p: StationPlacement): number[] {
  const halfZ = p.walkHalfZ;
  const signs = trackSignZs(p);
  const taken = [
    ...signs.map((z) => ({ z, r: 5.0 })),
    ...gantryZs(p).map((z) => ({ z, r: 3.6 })),
  ];
  // Les milieux d'intervalle ; à défaut de rangée (quai trop court pour deux
  // caissons), le milieu du quai, où il servira toujours à quelqu'un.
  const bases =
    signs.length >= 2 ? signs.slice(1).map((z, i) => (signs[i] + z) / 2) : [0];
  const out: number[] = [];
  for (const base of bases) {
    for (let d = 0; d <= 9; d += 1.2) {
      const cands = d === 0 ? [base] : [base - d, base + d];
      const z = cands.find(
        (c) =>
          Math.abs(c) <= halfZ - 8 &&
          !rowBlocked(p, c) &&
          !taken.some((t) => Math.abs(c - t.z) < t.r) &&
          !out.some((o) => Math.abs(c - o) < 12),
      );
      if (z !== undefined) {
        out.push(z);
        break;
      }
    }
  }
  return out;
}

/** Jeu minimal entre deux emprises voisines (m). */
const CLEARANCE = 0.12;

/** Deux emprises se marchent-elles dessus ? */
function hits(a: Placed, b: Placed): boolean {
  return (
    Math.abs(a.x - b.x) < a.halfX + b.halfX + CLEARANCE &&
    Math.abs(a.z - b.z) < a.halfZ + b.halfZ + CLEARANCE
  );
}

/**
 * Range une famille de mobilier en évitant ce qui est déjà posé.
 *
 * Le quai empilait jusqu'ici ses familles sans jamais se demander si la place
 * était libre : sur les trente gares, soixante-cinq bancs traversaient un
 * pilier, et des distributeurs sortaient d'une trémie. Chaque candidat glisse
 * donc le long de la voie jusqu'à trouver son creux, et renonce s'il n'en
 * trouve pas - mieux vaut un banc de moins qu'un banc dans un poteau.
 *
 * `taken` est enrichi au fur et à mesure : l'ordre d'appel EST l'ordre de
 * priorité, la structure d'abord, le mobilier ensuite.
 */
function fit(candidates: Placed[], taken: Placed[], reach = 3.2): Placed[] {
  const kept: Placed[] = [];
  for (const c of candidates) {
    let placed: Placed | null = null;
    for (let d = 0; d <= reach && !placed; d += 0.4) {
      for (const s of d === 0 ? [0] : [-d, d]) {
        const cand = { ...c, z: c.z + s };
        if (taken.some((t) => hits(cand, t))) continue;
        placed = cand;
        break;
      }
    }
    if (!placed) continue;
    kept.push(placed);
    taken.push(placed);
  }
  return kept;
}

/**
 * Décale `z` hors de toute baie de porte palière, pour y plaquer un
 * équipement. Rien ne se pose au droit d'une baie : c'est par là qu'on entre
 * dans la rame - ni dans la POCHE DE REFOULEMENT du vantail, qui glisse
 * ouvert jusqu'à 1,90 m de l'axe de la baie et passait au travers du caisson.
 * Trop près d'une baie, le point se cale au milieu du muret plein voisin :
 * à mi-chemin de deux baies au pas de cinq mètres, tout y est hors d'atteinte.
 */
function offGate(z: number, gates: readonly number[]): number {
  if (!gates.length) return z;
  let g = gates[0];
  for (const cand of gates) if (Math.abs(z - cand) < Math.abs(z - g)) g = cand;
  if (Math.abs(z - g) >= 2.15) return z;
  return g + (z >= g ? 1 : -1) * (PSD_HALF_GAP + 1.6);
}

export function placementFor(index: number, gates: readonly number[]): StationPlacement {
  const i = ((index % 30) + 30) % 30;
  const hit = CACHE.get(i);
  if (hit) return hit;

  const layout = layoutFor(i);
  const halfZ = layout.length / 2;
  const usable = halfZ - 3;

  // Quai latéral : un mur de fond, et la circulation devant. Îlot : deux bords
  // d'embarquement, et toute l'ossature ramenée au milieu. `depth` est la
  // largeur du quai dans les deux cas - de bord à mur, ou de bord à bord.
  const hasBackWall = layout.config === 'side';
  const farEdgeX = hasBackWall ? null : PSD_X + layout.depth;
  const backX = hasBackWall ? PSD_X + layout.depth - 0.15 : PSD_X + layout.depth / 2;

  // Le mobilier s'adosse à l'ossature, la circulation reste devant.
  const wallX = backX - 0.85;
  // Trémies et escaliers mécaniques : au tiers du quai contre un mur de fond,
  // mais PILE SUR L'ÉPINE sur un îlot - c'est la seule position qui laisse
  // passer des deux côtés. Décentrés, ils étranglaient le bord près à moins de
  // cinquante centimètres sur les quais étroits.
  const midX = hasBackWall ? PSD_X + layout.depth * 0.55 : backX - 0.4;

  const a = layout.amenities;

  // --- Ce qui ne bouge pas : structure et circulations verticales -----
  // Piliers, trémies, escaliers mécaniques, ascenseur et kiosque sont posés par
  // le gabarit et font autorité. Tout le mobilier vient ensuite se ranger
  // autour, jamais l'inverse.
  const stairs: Placed[] = a.stairs.map((z) => ({
    x: midX + 0.4,
    z,
    halfX: STAIR_HALF_X,
    halfZ: STAIR_HALF_Z,
  }));
  const escalators: Placed[] = a.escalators.map((z) => ({
    x: midX + 0.55,
    z,
    halfX: 0.7,
    halfZ: ESCALATOR_HALF_Z,
  }));
  const elevator: Placed | null =
    a.elevator === null
      ? null
      : { x: backX - 1.05, z: a.elevator, halfX: 0.95, halfZ: ELEVATOR_HALF_Z };
  const kiosk: Placed | null = a.kiosk
    ? { x: backX - 1.35, z: usable * 0.36, halfX: 1.25, halfZ: 2.4 }
    : null;

  // L'accès qui mène dans la gare : la trémie la plus proche du milieu du quai.
  const mainStair = stairs.reduce((a, b) => (Math.abs(b.z) < Math.abs(a.z) ? b : a));
  const interior = interiorFor(i, mainStair.z);
  // Une volée montante n'a de sens que si elle mène quelque part : là où le
  // niveau est déclaré sans être construit, l'accès reste la trémie borgne
  // qu'il était.
  const mainRise = interior.built && interior.place === 'over' ? ('up' as const) : ('down' as const);

  // Une volée MONTANTE n'a pas l'emprise d'une trémie : elle court onze mètres
  // le long du quai et traverse l'auvent. Tout ce qui se pose en hauteur -
  // poteaux, poutres, néons, tous dérivés de la trame de piliers - doit la
  // sauter, sinon une poutre transversale passe en travers des marches à
  // mi-hauteur. Et elle barre le passage latéral : c'est un ouvrage posé sur la
  // dalle, pas un trou dedans.
  //
  // L'emprise commence PILE au nez de la volée et pas un centimètre avant : la
  // marche n'accepte les marches qu'à partir de là, et quarante centimètres de
  // marge en amont faisaient un mur invisible devant l'escalier - on butait sur
  // la première contremarche sans jamais y poser le pied.
  const risingMain: Placed | null = mainRise === 'up'
    ? {
      x: mainStair.x,
      z: mainStair.z - STAIR_HALF_Z + (ASCENT_LEN + 0.4) / 2,
      halfX: STAIR_HALF_X + 0.3,
      halfZ: (ASCENT_LEN + 0.4) / 2,
    }
    : null;

  const structure: Placed[] = [
    ...stairs,
    ...escalators,
    ...(elevator ? [elevator] : []),
    ...(kiosk ? [kiosk] : []),
    ...(risingMain ? [risingMain] : []),
  ];

  // Réserve devant le nez des accès verticaux : mobilier seulement. Ce n'est
  // pas un obstacle de marche - le joueur et la foule doivent pouvoir s'y
  // présenter - mais bancs et piliers n'ont rien à y faire.
  const approachClear: Placed[] = [
    ...stairs.map((s) => ({
      x: s.x,
      z: stairTopZ(s) - ACCESS_APPROACH / 2,
      halfX: s.halfX,
      halfZ: ACCESS_APPROACH / 2,
    })),
    ...escalators.map((e) => ({
      x: e.x,
      z: e.z - e.halfZ - ACCESS_APPROACH / 2,
      halfX: Math.max(e.halfX, 1.2),
      halfZ: ACCESS_APPROACH / 2,
    })),
  ];

  // La trame de piliers saute la travée occupée par une trémie, une gaine
  // d'ascenseur ou un kiosque - et le débouché devant leur entrée - comme sur
  // un vrai quai, où le poteau est reporté plutôt que planté au milieu de la
  // cage ou juste devant.
  const columns: number[] = [];
  for (let z = -usable; z <= usable; z += layout.columnSpacing) {
    // L'emprise est un peu plus large que le poteau : il porte des coffrets,
    // des caissons publicitaires et une descente d'eau, et rien de tout cela ne
    // doit dépasser de ce qu'on contourne.
    const post = { x: backX - 0.55, z, halfX: 0.34, halfZ: 0.34 };
    if (structure.some((s) => hits(post, s)) || approachClear.some((s) => hits(post, s))) continue;
    columns.push(z);
  }

  const taken: Placed[] = [
    ...columns.map((z) => ({ x: backX - 0.55, z, halfX: 0.34, halfZ: 0.34 })),
    ...structure,
    // Poteaux de la charpente signature : plantés jusqu'au sol, ils sont déjà
    // écartés des accès et de la bande directionnelle par le plan (data) - le
    // mobilier, lui, s'écarte d'eux ici, et la marche les contournera puisque
    // `taken` devient la liste des obstacles.
    ...(layout.sigPlan?.posts ?? []).map((s) => ({ x: s.x, z: s.z, halfX: 0.35, halfZ: 0.35 })),
    ...approachClear,
  ];

  // --- Le mobilier, rangé dans ce qui reste --------------------------
  const benches = fit(
    spread(a.benches, usable, 1.7).map((z) => ({ x: wallX, z, halfX: 0.45, halfZ: 1.35 })),
    taken,
  );
  const vending = fit(
    spread(a.vending, usable, -4.3).map((z) => ({ x: backX - 0.55, z, halfX: 0.42, halfZ: 0.75 })),
    taken,
  );
  const cabinets = fit(
    spread(3, usable, 8.9).map((z) => ({ x: backX - 0.36, z, halfX: 0.3, halfZ: 0.55 })),
    taken,
  );
  // Un bac n'est jamais seul sur un quai japonais : ils vont par trois -
  // bouteilles, canettes, papiers - sous une même armature. L'emprise s'élargit
  // d'autant, et la batterie se pose au bout d'un banc sur deux.
  const bins = fit(
    benches
      .filter((_, k) => k % 2 === 0)
      .map((b) => ({ x: b.x - 0.06, z: b.z + 2.2, halfX: 0.28, halfZ: 0.66 })),
    taken,
  );

  // Deux files d'attente peintes de part et d'autre de chaque baie.
  const queueMarks: { x: number; z: number }[] = [];
  for (const g of gates) {
    for (const dz of [-1.25, 1.25]) queueMarks.push({ x: PSD_X + 1.15, z: g + dz });
  }

  // Balisage des accès, dans l'ordre où on les rencontre le long du quai.
  const accesses: Access[] = [
    ...stairs.map((a) => ({ kind: 'stairs' as const, x: a.x, z: a.z, halfZ: a.halfZ })),
    ...escalators.map((a) => ({ kind: 'escalator' as const, x: a.x, z: a.z, halfZ: a.halfZ })),
    ...(elevator
      ? [{ kind: 'elevator' as const, x: elevator.x, z: elevator.z, halfZ: elevator.halfZ }]
      : []),
  ]
    .sort((a, b) => a.z - b.z)
    .map((a, k) => ({ ...a, letter: String.fromCharCode(65 + k) }));

  // La trousse réglementaire.
  //
  // Les boutons d'arrêt d'urgence se posent là où ils servent - au droit de
  // chaque accès, d'où l'on débouche sur le quai - et aux deux abouts, mais sur
  // la face pleine des portes palières : sur une borne plantée près du bord ils
  // se seraient trouvés en plein dans une file d'attente, devant une porte.
  // Les miroirs de départ, eux, se suspendent à l'auvent au droit des cabines
  // de conduite, pour la même raison.
  //
  // À Shinjuku et Shibuya, aucun muret ne peut les porter : il leur faut une
  // borne, plantée derrière la bande podotactile élargie.
  const halfConsist = ((CONSIST.length - 1) / 2) * E235.pitch;
  const barePlatform = layout.psd === 'none';
  const emergencyStopX = barePlatform ? PSD_X + 1.32 : PSD_X + 0.05;
  // Un diffuseur affleure la sous-face de l'auvent : au droit d'un pilier, il
  // disparaîtrait dans la poutre transversale - exactement le défaut que les
  // néons ont déjà eu. Il s'écarte donc du poteau le plus proche.
  const nearestColumn = (z: number): number =>
    columns.reduce((best, c) => (Math.abs(z - c) < Math.abs(z - best) ? c : best), columns[0]);
  // Extincteur et téléphone se vissent tous deux sur un poteau : sur le même,
  // ils se rentraient dedans. Le téléphone choisit, l'extincteur s'écarte.
  const phoneZ = columns.length ? nearestColumn(usable * 0.24) : null;

  const offPost = (z: number): number => {
    let near = Infinity;
    for (const c of columns) if (Math.abs(z - c) < Math.abs(z - near)) near = c;
    const d = z - near;
    return Math.abs(d) >= 0.6 ? z : near + (d >= 0 ? 0.6 : -0.6);
  };

  const kit: StationKit = {
    // Un diffuseur pend à l'auvent ; une volée montante monte au-dessus de lui.
    // Ceux qui tombent dans son emprise sont retirés plutôt que décalés : la
    // ligne a dix-neuf mètres de pas, un trou ne s'entend pas (le relais prend
    // les DEUX plus proches, systems/stationPa).
    speakers: every(19, usable, 4.1)
      .map(offPost)
      .filter((z) => !risingMain || Math.abs(z - risingMain.z) > risingMain.halfZ + 0.6),
    cameras: columns.filter((_, k) => k % 3 === 1),
    // Extincteur et téléphone se vissent sur un poteau. Le mur de fond ne
    // portait qu'à Harajuku : partout ailleurs, l'îlot n'en a pas et ils
    // seraient restés suspendus au milieu du quai, le dos à l'air.
    extinguishers: columns.filter((_, k) => k % 4 === 2 && columns[k] !== phoneZ),
    emergencyStops: [
      -usable + 1.5,
      usable - 1.5,
      ...stairs.map((s) => s.z - s.halfZ - 0.8),
      ...escalators.map((e) => e.z - e.halfZ - 0.8),
    ]
      .map((z) => offGate(z, gates))
      .sort((p, q) => p - q),
    emergencyStopX,
    mirrors: [-halfConsist - 1.2, halfConsist + 1.2],
    phone: phoneZ,
    downpipes: columns.filter((_, k) => k % 2 === 0),
    carMarks: Array.from({ length: CONSIST.length }, (_, k) => ({
      z: (k - (CONSIST.length - 1) / 2) * E235.pitch,
      car: k + 1,
    })),
    runSpans: clearSpans(-usable, usable, [
      ...[...escalators, ...(elevator ? [elevator] : []), ...(kiosk ? [kiosk] : [])].map((o) => ({
        z0: o.z - o.halfZ - 0.5,
        z1: o.z + o.halfZ + 0.5,
      })),
      // Sous un auvent bas, la traverse des potences d'orientation monte
      // jusqu'à la cote où courent la gouttière et le chemin de câbles : les
      // conduites s'interrompent à son droit, comme elles le font aux gaines.
      ...(layout.canopyY < 3.65
        ? [...stairs, ...escalators].map((s) => {
            const g = s.z - s.halfZ - GANTRY_PULL;
            return { z0: g - 1.2, z1: g + 1.2 };
          })
        : []),
      // Et au droit des plans profonds de la charpente signature - le portique
      // de jonction d'Hamamatsuchō descend en travers de leur cote.
      ...(layout.sigPlan?.runBlocks ?? []),
      // Une volée MONTANTE traverse la cote des conduites de part en part :
      // elle monte à cinq mètres, elles courent à trois et demi. Elles
      // s'interrompent donc sur toute sa longueur, comme à une gaine.
      ...(risingMain
        ? [{ z0: risingMain.z - risingMain.halfZ - 0.5, z1: risingMain.z + risingMain.halfZ + 0.5 }]
        : []),
    ]),
  };

  // `taken` a recueilli structure et mobilier ; la réserve d'approche n'est
  // qu'un garde-fou de pose, pas une emprise à contourner en marchant.
  const obstacles = taken.filter((t) => !approachClear.includes(t));

  // Une borne plantée au sol se contourne ; plaquée sur un muret de portes
  // palières, elle ne gêne personne et n'a rien à faire ici. `offGate` a déjà
  // garanti qu'aucune ne barre une baie de porte.
  if (barePlatform) {
    for (const z of kit.emergencyStops) {
      obstacles.push({ x: emergencyStopX, z, halfX: 0.16, halfZ: 0.16 });
    }
  }

  // Une volée montante n'est pas un trou dans la dalle : c'est un OUVRAGE posé
  // dessus, et l'on ne le traverse pas par le côté. Son emprise entre donc dans
  // les obstacles, alors qu'une trémie s'y trouvait déjà par sa seule cage.
  if (risingMain) obstacles.push(risingMain);

  const placement: StationPlacement = {
    layout,
    backX,
    hasBackWall,
    farEdgeX,
    // Le joueur marche du liseré blanc jusqu'à 35 cm du mur de fond - ou, sur
    // un îlot, jusqu'au liseré d'en face, exactement comme de ce côté-ci. Ce
    // qui l'arrête au milieu, ce sont les obstacles de l'épine, pas une borne.
    walkX0: PSD_X + 0.2,
    walkX1: farEdgeX === null ? backX - 0.35 : farEdgeX - 0.2,
    walkHalfZ: halfZ - 2,
    columns,
    benches,
    bins,
    vending,
    cabinets,
    kiosk,
    stairs,
    escalators,
    elevator,
    queueMarks,
    accesses,
    kit,
    obstacles,
    mainStair,
    mainRise,
    interior,
  };
  CACHE.set(i, placement);
  return placement;
}

/**
 * Coupe de la travée d'en face, pour qui doit l'enjamber : une charpente de
 * halle, un viaduc qui traverse, une passerelle au-dessus du faisceau.
 * Toutes les abscisses sont nulles sur un quai latéral, où il n'y a rien
 * au-delà du mur.
 */
export interface FarSideCut {
  /** Second bord d'embarquement de NOTRE quai. */
  farX: number;
  /** Axe de la voie d'en face. */
  trackX: number;
  /** Bord du quai d'en face. */
  oppEdgeX: number;
  /** Fond du quai d'en face : là où la travée se ferme. */
  oppBackX: number;
}

export function farSideOf(p: StationPlacement): FarSideCut | null {
  if (p.farEdgeX === null) return null;
  const farX = p.farEdgeX;
  return {
    farX,
    trackX: farX + TRACK_HALF,
    oppEdgeX: farX + 2 * TRACK_HALF,
    oppBackX: farX + 2 * TRACK_HALF + OPP_DEPTH,
  };
}

// --- Trémies d'escalier -------------------------------------------------
//
// La volée descend du nez du quai (côté -z de l'emprise) vers +z. Une seule
// fonction dit l'altitude du sol dans la trémie ; le rendu, la marche du
// joueur et les voyageurs qui s'en vont la partagent, donc personne ne
// marche à dix centimètres au-dessus des marches.

/** Nez de la volée : abscisse z locale du bord haut, côté quai. */
export function stairTopZ(s: Placed): number {
  return s.z - s.halfZ;
}

export interface StairwellHit {
  stair: Placed;
  /** Distance parcourue depuis le nez de la volée (m). */
  t: number;
  /** Altitude du sol sous les pieds, relative au sol du quai. */
  y: number;
}

/**
 * Position dans une volée d'escalier, ou null si le point n'y est pas.
 * `maxLen` borne la descente : le joueur s'arrête à la limite de zone
 * (STAIR_WALK_LEN), les PNJ descendent jusqu'au fond et disparaissent.
 */
export function stairwellAt(
  p: StationPlacement,
  x: number,
  z: number,
  maxLen = STAIR_WALK_LEN,
  maxSteps = STAIR_WALK_STEPS,
): StairwellHit | null {
  for (const s of p.stairs) {
    if (Math.abs(x - s.x) > STAIR_WALK_HALF_X) continue;
    const t = z - stairTopZ(s);
    if (t < 0 || t > maxLen) continue;
    return { stair: s, t, y: stairFloorY(t, maxSteps) };
  }
  return null;
}
