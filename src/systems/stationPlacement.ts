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
import {
  OPP_DEPTH,
  PSD_HALF_GAP,
  PSD_X,
  TRACK_HALF,
  STAIR_GOING,
  STAIR_RISE,
  STAIR_STEPS,
  STAIR_WALK_HALF_X,
  STAIR_WALK_LEN,
  STAIR_WALK_STEPS,
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
   * il n'y en a pas — à Shinjuku et Shibuya, il n'y a aucun muret pour les
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
   * Tronçons libres pour les conduites qui courent le long du quai —
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
 * en B ». La lettre suit l'ordre le long de la voie, tous types confondus —
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
   * du mur de fond. Sur les vingt-neuf autres — des îlots — il n'y a AUCUN mur :
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
 * Abscisses des potences d'orientation le long de la voie.
 *
 * Une par escalier et par escalier mécanique, un peu avant l'entrée — c'est le
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
 * Abscisses des panneaux 番線 le long de la voie.
 *
 * Un tous les trente-six mètres, décalé jusqu'à trouver son creux : la trame
 * des bannières publicitaires, le kiosque et l'horloge occupent la même
 * hauteur sous l'auvent, et le caisson les traversait. Partagée entre le rendu
 * (OverheadSigns) et les totems (PlatformSignage), qui s'en écartent au sol.
 */
export function trackSignZs(p: StationPlacement): number[] {
  const halfZ = p.walkHalfZ;
  const half = p.layout.length / 2;
  // Ce qui monte jusqu'au gabarit du panneau, au milieu du quai qu'il couvre.
  const solids = [
    ...(p.kiosk ? [{ z: p.kiosk.z, r: p.kiosk.halfZ + 0.3 }] : []),
    ...(p.layout.amenities.clock ? [{ z: 0, r: 0.65 }] : []),
  ];
  const out: number[] = [];
  for (let k = -3; k <= 3; k++) {
    let z = k * 36;
    if (Math.abs(z) > halfZ - 8) continue;
    // Les bannières courent tous les 26 m à partir de -half + 18, à la même
    // hauteur : au croisement, les deux caissons se traversaient.
    for (let guard = 0; guard < 10; guard++) {
      const d = Math.abs((((z - (-half + 18)) % 26) + 26) % 26);
      const nearBanner = Math.min(d, 26 - d) <= 2.2;
      if (!nearBanner && !solids.some((s) => Math.abs(z - s.z) < s.r)) break;
      z += 2.4;
    }
    // Chassé jusqu'au bout du quai sans trouver de creux : tant pis pour lui.
    if (Math.abs(z) > halfZ - 8) continue;
    out.push(z);
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
 * trouve pas — mieux vaut un banc de moins qu'un banc dans un poteau.
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
 * dans la rame — ni dans la POCHE DE REFOULEMENT du vantail, qui glisse
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
  // largeur du quai dans les deux cas — de bord à mur, ou de bord à bord.
  const hasBackWall = layout.config === 'side';
  const farEdgeX = hasBackWall ? null : PSD_X + layout.depth;
  const backX = hasBackWall ? PSD_X + layout.depth - 0.15 : PSD_X + layout.depth / 2;

  // Le mobilier s'adosse à l'ossature, la circulation reste devant.
  const wallX = backX - 0.85;
  // Trémies et escaliers mécaniques : au tiers du quai contre un mur de fond,
  // mais PILE SUR L'ÉPINE sur un îlot — c'est la seule position qui laisse
  // passer des deux côtés. Décentrés, ils étranglaient le bord près à moins de
  // cinquante centimètres sur les quais étroits.
  const midX = hasBackWall ? PSD_X + layout.depth * 0.55 : backX - 0.4;

  const a = layout.amenities;

  // --- Ce qui ne bouge pas : structure et circulations verticales -----
  // Piliers, trémies, escaliers mécaniques, ascenseur et kiosque sont posés par
  // le gabarit et font autorité. Tout le mobilier vient ensuite se ranger
  // autour, jamais l'inverse.
  const stairs: Placed[] = a.stairs.map((z) => ({ x: midX + 0.4, z, halfX: 1.5, halfZ: 2.6 }));
  const escalators: Placed[] = a.escalators.map((z) => ({
    x: midX + 0.55,
    z,
    halfX: 0.7,
    halfZ: 2.8,
  }));
  const elevator: Placed | null =
    a.elevator === null ? null : { x: backX - 1.05, z: a.elevator, halfX: 0.95, halfZ: 0.95 };
  const kiosk: Placed | null = a.kiosk
    ? { x: backX - 1.35, z: usable * 0.36, halfX: 1.25, halfZ: 2.4 }
    : null;

  const structure: Placed[] = [
    ...stairs,
    ...escalators,
    ...(elevator ? [elevator] : []),
    ...(kiosk ? [kiosk] : []),
  ];

  // La trame de piliers saute la travée occupée par une trémie, une gaine
  // d'ascenseur ou un kiosque — comme sur un vrai quai, où le poteau est
  // reporté plutôt que planté au milieu de la cage.
  const columns: number[] = [];
  for (let z = -usable; z <= usable; z += layout.columnSpacing) {
    // L'emprise est un peu plus large que le poteau : il porte des coffrets,
    // des caissons publicitaires et une descente d'eau, et rien de tout cela ne
    // doit dépasser de ce qu'on contourne.
    const post = { x: backX - 0.55, z, halfX: 0.34, halfZ: 0.34 };
    if (structure.some((s) => hits(post, s))) continue;
    columns.push(z);
  }

  const taken: Placed[] = [
    ...columns.map((z) => ({ x: backX - 0.55, z, halfX: 0.34, halfZ: 0.34 })),
    ...structure,
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
  // Un bac n'est jamais seul sur un quai japonais : ils vont par trois —
  // bouteilles, canettes, papiers — sous une même armature. L'emprise s'élargit
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
  // Les boutons d'arrêt d'urgence se posent là où ils servent — au droit de
  // chaque accès, d'où l'on débouche sur le quai — et aux deux abouts, mais sur
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
  // disparaîtrait dans la poutre transversale — exactement le défaut que les
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
    speakers: every(19, usable, 4.1).map(offPost),
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
    ]),
  };

  // `taken` a exactement recueilli tout ce qui a été retenu, structure comprise.
  const obstacles = taken;

  // Une borne plantée au sol se contourne ; plaquée sur un muret de portes
  // palières, elle ne gêne personne et n'a rien à faire ici. `offGate` a déjà
  // garanti qu'aucune ne barre une baie de porte.
  if (barePlatform) {
    for (const z of kit.emergencyStops) {
      obstacles.push({ x: emergencyStopX, z, halfX: 0.16, halfZ: 0.16 });
    }
  }

  const placement: StationPlacement = {
    layout,
    backX,
    hasBackWall,
    farEdgeX,
    // Le joueur marche du liseré blanc jusqu'à 35 cm du mur de fond — ou, sur
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

/** Altitude (relative au sol du quai) à `t` mètres du nez de la volée. */
export function stairDropAt(t: number, maxSteps = STAIR_STEPS): number {
  if (t <= 0) return 0;
  const step = Math.min(maxSteps, Math.floor(t / STAIR_GOING));
  return -step * STAIR_RISE;
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
    return { stair: s, t, y: stairDropAt(t, maxSteps) };
  }
  return null;
}
