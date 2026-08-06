// Où l'on est sur la boucle, et dans quelle direction on roule VRAIMENT.
//
// Le jeu savait déjà tout du trajet - quelle gare, quelle progression, quel sens
// - mais rien de la géographie : aucune fonction ne pouvait répondre « le
// Skytree est à quarante degrés sur la droite ». C'est ce que ce module ajoute,
// et c'est tout ce qu'il ajoute : il ne bouge rien, il ne dessine rien, il
// répond à des questions.
//
// La boucle vient de src/data/tokyoGeo.ts, engendré depuis des coordonnées
// réelles. On l'échantillonne PAR ABSCISSE CURVILIGNE plutôt que par corde entre
// gares : la Yamanote a des courbes de six cents mètres de rayon, et le cap au
// milieu d'un virage n'a rien à voir avec celui de la corde.
//
// LE CAP EST LISSÉ, et ce n'est pas une coquetterie. La polyligne est faite de
// segments droits : sa tangente saute d'un sommet à l'autre. Un saut de cap
// déplace d'un bloc tout l'horizon lointain - ce serait la seule chose qu'on
// verrait. La tangente est donc prise entre deux points distants de ±TANGENT_ARM
// de part et d'autre : elle devient continue, et le cap tourne comme un train
// tourne, sur une centaine de mètres.

import { GEO_LOOP, GEO_STATIONS } from '../data/tokyoGeo.ts';
import { directionStep, wrapStation } from '../data/loop.ts';
import type { LoopDirection } from '../data/platforms';

/**
 * Demi-base de la tangente lissée (m).
 *
 * Quatre cent vingt mètres, et non cent : c'est la pointe sud-ouest de la boucle
 * qui commande. À Ōsaki la ligne arrive du nord-ouest et repart au nord-est -
 * près de cent quarante degrés, l'endroit le plus tordu de la Yamanote, que la
 * polyligne réduit à deux sommets. Une base courte y ferait pivoter l'horizon
 * d'un demi-degré par mètre parcouru ; celle-ci étale le virage sur huit cents
 * mètres, soit un rayon de l'ordre de trois cents mètres - ce que la voie fait
 * vraiment là-bas, et pourquoi les rames y ralentissent.
 *
 * Il reste que l'horizon tourne franchement en passant Ōsaki, et c'est juste :
 * dans le vrai train, le paysage y balaie la vitre. Ce qui manque n'est pas dans
 * ce module - c'est que la voie du jeu, elle, reste droite.
 */
const TANGENT_ARM = 420;

// --- Abscisse curviligne de la polyligne ----------------------------------

const N = GEO_LOOP.length;
/** Abscisse cumulée de chaque sommet (m), et longueur totale. */
const CUM = new Float64Array(N + 1);
for (let i = 0; i < N; i++) {
  const a = GEO_LOOP[i];
  const b = GEO_LOOP[(i + 1) % N];
  CUM[i + 1] = CUM[i] + Math.hypot(b.x - a.x, b.z - a.z);
}
/** Périmètre de la polyligne (m). */
export const LOOP_PERIMETER = CUM[N];

/** Abscisse curviligne du milieu du quai de chaque gare (m). */
const STATION_S = GEO_STATIONS.map((st) => {
  const i = GEO_LOOP.findIndex((p) => p.station === st.index);
  return CUM[i];
});

function wrapS(s: number): number {
  return ((s % LOOP_PERIMETER) + LOOP_PERIMETER) % LOOP_PERIMETER;
}

/** Position sur la polyligne à l'abscisse `s` (m), écrite dans `out`. */
function at(s: number, out: { x: number; z: number }): void {
  const t = wrapS(s);
  // Recherche dichotomique : trente-cinq sommets, appelée trois fois par image.
  let lo = 0;
  let hi = N;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (CUM[mid] <= t) lo = mid;
    else hi = mid;
  }
  const a = GEO_LOOP[lo];
  const b = GEO_LOOP[(lo + 1) % N];
  const seg = CUM[lo + 1] - CUM[lo];
  const k = seg > 1e-6 ? (t - CUM[lo]) / seg : 0;
  out.x = a.x + (b.x - a.x) * k;
  out.z = a.z + (b.z - a.z) * k;
}

// --- Où l'on est ----------------------------------------------------------

/** Une position sur la boucle, avec son cap vrai. */
export interface LoopPose {
  /** Est, en mètres depuis le quai de Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le quai de Tokyo. */
  z: number;
  /** Abscisse curviligne sur la polyligne (m), toujours dans le sens 内回り. */
  s: number;
  /**
   * Cap vrai (rad) : 0 = plein nord, +π/2 = plein est. C'est la direction dans
   * laquelle le train AVANCE, sens de marche compris - deux rames qui se croisent
   * ont des caps opposés au même endroit.
   */
  bearing: number;
}

export function makePose(): LoopPose {
  return { x: 0, z: 0, s: 0, bearing: 0 };
}

const AHEAD = { x: 0, z: 0 };
const BEHIND = { x: 0, z: 0 };

/**
 * Abscisse curviligne du train (m, sens 内回り), pour la gare d'ARRIVÉE `index`
 * et la progression `p` du trajet en cours (0 au départ, 1 à l'arrêt).
 *
 * En 内回り on vient de `index−1` et l'abscisse croît ; en 外回り on vient de
 * `index+1` et elle décroît. La polyligne, elle, ne connaît qu'un sens : c'est
 * le pas d'index qui porte l'autre.
 */
export function loopS(index: number, p: number, dir: LoopDirection): number {
  const step = directionStep(dir);
  const from = STATION_S[wrapStation(index - step)];
  const to = STATION_S[wrapStation(index)];
  // Un inter-gare franchit l'origine de la polyligne une fois par tour : on
  // prend le trajet le plus court dans le sens de marche, jamais le tour complet.
  let d = to - from;
  if (step > 0 && d < 0) d += LOOP_PERIMETER;
  if (step < 0 && d > 0) d -= LOOP_PERIMETER;
  return wrapS(from + d * Math.min(1, Math.max(0, p)));
}

/** Pose du train pour (gare d'arrivée, progression, sens). */
export function loopPose(index: number, p: number, dir: LoopDirection, out: LoopPose): void {
  const s = loopS(index, p, dir);
  out.s = s;
  at(s, out);
  at(s + TANGENT_ARM, AHEAD);
  at(s - TANGENT_ARM, BEHIND);
  const step = directionStep(dir);
  const dx = (AHEAD.x - BEHIND.x) * step;
  const dz = (AHEAD.z - BEHIND.z) * step;
  // Cap depuis le nord, sens horaire. Le nord est −z : d'où l'argument −dz.
  out.bearing = Math.atan2(dx, -dz);
}

// --- Ce qu'on voit d'ici --------------------------------------------------

/** Un repère vu du train. */
export interface Sight {
  /**
   * Écart angulaire au sens de marche (rad) : 0 droit devant, +π/2 à DROITE de
   * la marche, −π/2 à gauche. Ramené dans ]−π, π].
   */
  azimuth: number;
  /** Distance horizontale (m). */
  distance: number;
}

/** Où se tient le point (x, z) vu de `pose`. */
export function sightTo(pose: LoopPose, x: number, z: number, out: Sight): void {
  const dx = x - pose.x;
  const dz = z - pose.z;
  out.distance = Math.hypot(dx, dz);
  let a = Math.atan2(dx, -dz) - pose.bearing;
  // Un écart angulaire vit dans ]−π, π] : sans ce repli, un repère droit
  // derrière saute d'un bord de l'image à l'autre.
  a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  out.azimuth = a;
}
