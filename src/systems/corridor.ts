// Les bâtiments réels sous le ruban : d'une abscisse d'odomètre à ce qui est
// vraiment là.
//
// src/data/corridor range neuf mille empreintes d'OpenStreetMap par abscisse de
// BOUCLE, avec un décalage latéral compté à gauche du sens des index JY
// croissants - le repère du relief et de l'eau. Le ruban urbain, lui, travaille
// en abscisse d'ODOMÈTRE et en côté de scène. Ce module fait le passage, et
// c'est tout ce qu'il fait.
//
// LES DEUX REPÈRES NE SE SUPERPOSENT PAS EXACTEMENT, et c'est voulu : les
// inter-gares du jeu suivent le barème JR (src/data/segments), la polyligne a
// ses propres longueurs, et les deux s'écartent de quelques dizaines de mètres
// sur un inter-gare. `loopSOfWorld` réconcilie les deux en lisant la position
// en FRACTION d'inter-gare ; on l'appelle aux deux bouts de la tranche demandée
// et on interpole entre les deux. Un bâtiment se retrouve donc à sa place
// RELATIVE dans son inter-gare, ce qui est la seule chose qui ait un sens quand
// les deux mètres-étalons diffèrent.
//
// LE SENS DE MARCHE RETOURNE LA BASE DU RUBAN - l'abscisse de boucle décroît en
// 外回り, et le côté droit devient le gauche. Les deux retournements sont dans
// `loopSOfWorld` et `loopLeft` ; rien ici n'a besoin de savoir dans quel sens
// roule la rame.

import {
  CORRIDOR,
  CORRIDOR_FAR_MAX,
  CORRIDOR_LOOP_M,
  CORRIDOR_NEAR_MIN,
} from '../data/corridor.ts';
import { loopLeft, loopSOfWorld } from './terrain.ts';

/** Un bâtiment réel, ramené aux coordonnées du ruban. */
export interface CorridorHit {
  /** Abscisse ODOMÈTRE du centre (m), celle du ruban. */
  s: number;
  /** Distance à l'axe (m), toujours positive. */
  x: number;
  /** Hauteur (m). */
  h: number;
  /** Côté de la boîte englobante du contour OSM (m) : longueur le long de la voie. */
  plate: number;
  /** Profondeur en travers (m), après découpe au gabarit ferroviaire. */
  depth: number;
  /** false = hauteur estimée, jamais présentée comme relevée. */
  measured: boolean;
  /** Orientation dans le plan (s, x) (rad). */
  yaw: number;
  /** Identifiant OSM de l'empreinte. */
  osmWay: number;
  /** Le centre tombe-t-il DANS la cellule demandée, ou dans sa marge ? */
  inCell: boolean;
}

/** Table des abscisses, pour entrer par dichotomie sans toucher aux objets. */
const S = Float64Array.from(CORRIDOR, (b) => b.s);

/**
 * Combien de bâtiments réels le ruban a laissés de côté faute de place.
 *
 * La bible ne demande pas qu'on dessine tout ; elle demande qu'on ne fasse pas
 * passer un plafond budgétaire pour une absence de données. Le compteur est lu
 * par la sonde `__probeBible()`.
 */
export const corridorDropped = { near: 0, far: 0 };

/** Les deux bandes du ruban, pour imputer un abandon à la bonne. */
export type CorridorBand = 'near' | 'far';

/** Premier indice dont l'abscisse est ≥ `s`. */
function lowerBound(s: number): number {
  let lo = 0;
  let hi = S.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (S[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Différence d'abscisses de boucle, repliée dans (−P/2, P/2]. */
function delta(a: number, b: number): number {
  const P = CORRIDOR_LOOP_M;
  let d = (((a - b) % P) + P) % P;
  if (d > P / 2) d -= P;
  return d;
}

/**
 * Remplace le plus BAS des sujets déjà retenus, si le nouveau le dépasse.
 *
 * Quand une cellule porte plus de bâtiments réels que le budget n'a
 * d'emplacements - c'est le cas courant de l'arrière-pays, où l'on relève
 * jusqu'à deux cent trente-six bâtiments pour une quinzaine de places -, il
 * faut choisir. On garde LES PLUS HAUTS : à deux cents mètres dans la brume, ce
 * qui se lit d'un train est une ligne de faîte, et c'est elle que les plus
 * hauts portent. Les autres disparaîtraient derrière eux de toute façon.
 */
function keepTallest(out: CorridorHit[], n: number): number {
  let worst = 0;
  for (let i = 1; i < n; i++) if (out[i].h < out[worst].h) worst = i;
  return worst;
}

function write(hit: CorridorHit, i: number, worldS: number, x: number, inCell: boolean): void {
  const b = CORRIDOR[i];
  hit.s = worldS;
  hit.x = x;
  hit.h = b.h;
  hit.plate = b.plate;
  hit.depth = b.depth;
  hit.measured = b.measured;
  hit.yaw = b.yaw;
  hit.osmWay = b.osmWay;
  hit.inCell = inCell;
}

/**
 * Les bâtiments réels d'une tranche du ruban.
 *
 * `worldS0`..`worldS1` est la cellule, `side` son côté de scène, `xMin`..`xMax`
 * la bande latérale du rang. `margin` élargit la RECHERCHE sans élargir la
 * cellule : un bâtiment voisin dont l'emprise déborde doit être connu du
 * générateur de tissu, qui ne doit pas bâtir dessus - mais il sera posé par SA
 * cellule, pas par celle-ci. D'où `inCell`.
 *
 * Renvoie le nombre écrit dans `out` (≤ out.length). Rien n'est alloué.
 */
export function corridorSlice(
  worldS0: number,
  worldS1: number,
  side: 1 | -1,
  xMin: number,
  xMax: number,
  out: CorridorHit[],
  margin: number,
  band: CorridorBand,
): number {
  if (out.length === 0) return 0;
  const span = worldS1 - worldS0;
  if (!(span > 0)) return 0;

  const l0 = loopSOfWorld(worldS0);
  const l1 = loopSOfWorld(worldS1);
  // Le sens de parcours de la polyligne, et de combien elle avance pour la
  // longueur d'odomètre demandée. En 外回り il est négatif : la boucle se
  // remonte.
  const dl = delta(l1, l0);
  if (dl === 0) return 0;
  // La marge se compte en mètres de boucle, dans le même sens que la tranche.
  const grow = Math.abs(margin * (dl / span));
  const lo = Math.min(l0, l0 + dl) - grow;
  const hi = Math.max(l0, l0 + dl) + grow;
  const left = loopLeft(side);

  // La tranche, ramenée dans [0, P[ - et coupée en deux quand elle enjambe
  // l'origine de la polyligne. Jamais plus de deux morceaux : une cellule fait
  // quarante mètres, la boucle trente-quatre kilomètres.
  const P = CORRIDOR_LOOP_M;
  const a0 = (((lo % P) + P) % P);
  const b0 = a0 + (hi - lo);
  const parts = b0 <= P ? [a0, b0, 0, 0] : [a0, P, 0, b0 - P];

  let n = 0;
  for (let part = 0; part < 4; part += 2) {
    const a = parts[part];
    const b = parts[part + 1];
    if (!(b > a)) continue;
    for (let i = lowerBound(a); i < S.length && S[i] <= b; i++) {
      const c = CORRIDOR[i];
      if (c.offset > 0 !== left) continue;
      const x = Math.abs(c.offset);
      if (x < xMin || x > xMax) continue;
      // Retour à l'odomètre : la position RELATIVE dans la tranche, reportée
      // sur sa longueur d'odomètre.
      const worldS = worldS0 + (delta(c.s, l0) / dl) * span;
      const inCell = worldS >= worldS0 && worldS < worldS1;
      if (n < out.length) {
        write(out[n], i, worldS, x, inCell);
        n++;
        continue;
      }
      // Plus de place : le plus bas des retenus s'efface devant le nouveau, et
      // celui des deux qui perd est compté s'il devait être DESSINÉ ici. Un
      // sujet de la marge qui perd n'est pas une perte : sa propre cellule le
      // posera.
      const worst = keepTallest(out, n);
      if (out[worst].h >= c.h) {
        if (inCell) corridorDropped[band]++;
        continue;
      }
      if (out[worst].inCell) corridorDropped[band]++;
      write(out[worst], i, worldS, x, inCell);
    }
  }
  return n;
}

/** Tableau de travail réutilisable. */
export function makeCorridorBuffer(length: number): CorridorHit[] {
  return Array.from({ length }, () => ({
    s: 0,
    x: 0,
    h: 0,
    plate: 0,
    depth: 0,
    measured: false,
    yaw: 0,
    osmWay: 0,
    inCell: false,
  }));
}

/** La bande couverte par le relevé, pour que le ruban ne cherche pas dehors. */
export const CORRIDOR_MIN = CORRIDOR_NEAR_MIN;
export const CORRIDOR_MAX = CORRIDOR_FAR_MAX;
