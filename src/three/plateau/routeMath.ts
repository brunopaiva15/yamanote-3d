// Mathématiques du tracé PLATEAU — module PUR : aucune dépendance, aucun
// effet de bord, aucune allocation dans les fonctions appelées par frame.
// C'est ce qui le rend testable directement avec `node --test`.
//
// Repère : celui du manifeste — +X est, +Y hauteur, -Z nord, une unité = un
// mètre. L'axe avant du train est -Z, comme le reste du jeu (le décor défile
// vers +z, un train qui part s'en va vers les z négatifs).

export interface RoutePoint {
  /** Abscisse curviligne depuis le début du tronçon (m). */
  s: number;
  x: number;
  y: number;
  z: number;
}

export interface RouteData {
  version: number;
  segment: number;
  totalLength: number;
  points: RoutePoint[];
}

export interface PlateauChunkDefinition {
  id: string;
  segment: number;
  url: string;
  startDistance: number;
  endDistance: number;
  offset: [number, number, number];
  boundingRadius?: number;
  fileSize?: number;
}

export interface RouteSample {
  x: number;
  y: number;
  z: number;
  /** Cap autour de +Y : une rotation de `yaw` envoie (0,0,-1) sur la tangente. */
  yaw: number;
}

/**
 * Position et cap sur le tracé à l'abscisse `s`. Écrit dans `out` pour ne rien
 * allouer : cette fonction est appelée soixante fois par seconde.
 *
 * `s` est borné aux extrémités : avant le début du tronçon on reste au premier
 * point, après la fin au dernier. Le train ne sort donc jamais du tracé.
 */
export function sampleRoute(points: RoutePoint[], s: number, out: RouteSample): RouteSample {
  const last = points.length - 1;
  if (last < 1) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.yaw = 0;
    return out;
  }
  const clamped = s < points[0].s ? points[0].s : s > points[last].s ? points[last].s : s;

  // Recherche dichotomique : le tracé peut compter des milliers de points sur
  // un tronçon complet, une recherche linéaire par frame serait du gaspillage.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].s <= clamped) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const span = b.s - a.s;
  const t = span === 0 ? 0 : (clamped - a.s) / span;
  out.x = a.x + t * (b.x - a.x);
  out.y = a.y + t * (b.y - a.y);
  out.z = a.z + t * (b.z - a.z);

  // Tangente : dérivée du segment courant. Le cap est calculé à plat (pas de
  // tangage) — le wagon reste horizontal, seule la ville tourne autour de lui.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  out.yaw = dx === 0 && dz === 0 ? 0 : Math.atan2(-dx, -dz);
  return out;
}

/** Index du chunk contenant l'abscisse `s` (-1 si la liste est vide). */
export function chunkIndexAt(chunks: PlateauChunkDefinition[], s: number): number {
  if (chunks.length === 0) return -1;
  if (s <= chunks[0].startDistance) return 0;
  for (let i = 0; i < chunks.length; i++) {
    if (s < chunks[i].endDistance) return i;
  }
  return chunks.length - 1;
}

export interface SelectionOptions {
  /** Chunks montés devant le train, en plus de celui où il se trouve. */
  ahead: number;
  /** Chunks montés derrière lui (ils sont encore dans le champ). */
  behind: number;
  /** Plafond dur : jamais plus de tant de chunks montés à la fois. */
  max: number;
}

/**
 * Fenêtre de chunks à monter autour de l'abscisse `s`.
 *
 * On ne monte JAMAIS tout le tronçon : un tronçon complet de la Yamanote fera
 * une trentaine de chunks, et les garder tous en scène coûterait autant en
 * mémoire GPU qu'en appels de rendu. La fenêtre est symétrique et bornée.
 */
export function selectChunks(
  chunks: PlateauChunkDefinition[],
  s: number,
  { ahead, behind, max }: SelectionOptions,
): PlateauChunkDefinition[] {
  if (chunks.length === 0) return [];
  const current = chunkIndexAt(chunks, s);
  const from = Math.max(0, current - behind);
  const to = Math.min(chunks.length - 1, current + ahead);
  const window: PlateauChunkDefinition[] = [];
  for (let i = from; i <= to; i++) window.push(chunks[i]);
  if (window.length <= max) return window;
  // Débordement : on garde les plus proches du train, celui-ci d'abord.
  return window
    .slice()
    .sort((p, q) => distanceToInterval(s, p) - distanceToInterval(s, q))
    .slice(0, max)
    .sort((p, q) => p.startDistance - q.startDistance);
}

function distanceToInterval(s: number, chunk: PlateauChunkDefinition): number {
  if (s < chunk.startDistance) return chunk.startDistance - s;
  if (s > chunk.endDistance) return s - chunk.endDistance;
  return 0;
}

/** Deux fenêtres contiennent-elles exactement les mêmes chunks ? */
export function sameSelection(
  a: PlateauChunkDefinition[],
  b: PlateauChunkDefinition[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false;
  return true;
}

/** Progression 0..1 → abscisse sur le tracé. 0 = début du tronçon, 1 = fin. */
export function progressToDistance(progress: number, totalLength: number): number {
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  return p * totalLength;
}

// --- Profil de marche du train ------------------------------------------

/**
 * Distance parcourue depuis le début du trajet inter-gares, en intégrant un
 * profil de vitesse quelconque.
 *
 * Le profil est INJECTÉ plutôt qu'importé : ce module reste sans dépendance
 * (donc testable tel quel), et le jeu lui passe le vrai profil E235 de
 * systems/trainPhysics — celui-là même qui pilote la rame. Le monde PLATEAU
 * défile ainsi exactement à la vitesse du train, freinages compris, au lieu de
 * suivre une progression linéaire en temps qui glisserait pendant le départ.
 */
export interface SpeedProfile {
  /** Un pas d'intégration : met à jour `state` vers la vitesse cible. */
  step: (state: { v: number; a: number; d: number }, target: number, dt: number) => void;
  /** Vitesse visée à l'instant `t` du trajet (0 = début de la phase depart). */
  targetAt: (elapsed: number) => number;
}

export function integrateJourney(profile: SpeedProfile, elapsed: number, dt = 0.05): number {
  const state = { v: 0, a: 0, d: 0 };
  if (!(elapsed > 0)) return 0;
  for (let t = 0; t < elapsed; t += dt) {
    const step = Math.min(dt, elapsed - t);
    profile.step(state, profile.targetAt(t), step);
  }
  return state.d;
}
