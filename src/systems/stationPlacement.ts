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
 * dans la rame, et la face pleine du muret est la seule surface disponible.
 */
function offGate(z: number, gates: readonly number[]): number {
  let best = z;
  let bestGap = -Infinity;
  // Le point demandé, puis de part et d'autre : on garde celui qui s'écarte le
  // plus de la baie la plus proche.
  for (const cand of [z, z - PSD_HALF_GAP - 0.6, z + PSD_HALF_GAP + 0.6]) {
    let gap = Infinity;
    for (const g of gates) gap = Math.min(gap, Math.abs(cand - g));
    if (gap > bestGap) {
      bestGap = gap;
      best = cand;
    }
  }
  return best;
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
    extinguishers: columns.filter((_, k) => k % 4 === 2),
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
    phone: columns.length ? nearestColumn(usable * 0.24) : null,
    downpipes: columns.filter((_, k) => k % 2 === 0),
    carMarks: Array.from({ length: CONSIST.length }, (_, k) => ({
      z: (k - (CONSIST.length - 1) / 2) * E235.pitch,
      car: k + 1,
    })),
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
