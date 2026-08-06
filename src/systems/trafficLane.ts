// Où se tient un véhicule dans une rue perpendiculaire, et dans quel sens.
//
// Séparé du rendu (three/city/Traffic) pour deux raisons. La première est qu'un
// véhicule mal posé est une erreur de REPÈRE, pas de dessin : la dalle de rue
// tourne autour de son propre centre, à mi-profondeur du bâti, et la même
// rotation prise depuis l'axe des rails décale la voiture d'une vingtaine de
// mètres le long de la voie - elle roule alors à côté de sa rue, parfaitement
// parallèle. C'est le genre de faute qu'un test attrape et qu'un œil discute.
// La seconde est que la circulation doit tomber d'accord au centimètre avec la
// chaussée de `buildCellProps` : elles lisent donc toutes deux `roadwayOf`.

import { STREET_INNER, STREET_OUTER, hashInt, roadwayOf, type Roadway } from './cityField.ts';

/**
 * Course d'un véhicule en mouvement, mesurée à l'axe de la voie (m).
 *
 * Elle ne commence pas à la rive de la chaussée et ne finit pas au dernier
 * rang : elle DÉBORDE des deux côtés. Un véhicule doit apparaître et
 * disparaître là où le bâti le masque - entre les maisons du premier rang d'un
 * côté, dans l'arrière-pays de l'autre - et non en pleine trouée. C'est le seul
 * point délicat du poste : la voie ferrée n'étant pas franchissable (un seul
 * passage à niveau sur toute la Yamanote), une rue s'arrête au remblai, et il
 * n'existe aucun hors-champ où renvoyer une voiture qui a fini sa course.
 */
export const RUN_MIN = 14;
export const RUN_MAX = 76;
const RUN_LEN = RUN_MAX - RUN_MIN;

/** Longueur sur laquelle un véhicule prend sa taille en entrant (m). */
const RAMP = 5;

/** Un véhicule posé dans le repère de la ville, côté non compris. */
export interface Lane {
  /** Abscisse monde le long de la voie (m). */
  s: number;
  /** Distance à l'axe de la voie (m), toujours positive. */
  x: number;
  /** Trame du quartier (rad) : le rendu en tire une rotation de `-yaw`. */
  yaw: number;
  /**
   * La caisse fait-elle demi-tour ?
   *
   * Sa longueur est écrite sur son +x, qui suit `côté × profondeur` : de l'autre
   * côté de la voie, la même course demande donc un demi-tour.
   */
  flip: boolean;
  /** Véhicule à l'arrêt sur le bas-côté. */
  parked: boolean;
  /** Petit utilitaire plutôt que voiture. */
  van: boolean;
  /** Échelle 0..1 : le véhicule prend sa taille en entrant en course. */
  grow: number;
  /** Tirage de teinte, stable pour cet emplacement. */
  paint: number;
}

export function makeLane(): Lane {
  return { s: 0, x: 0, yaw: 0, flip: false, parked: false, van: false, grow: 1, paint: 0 };
}

const ROADWAY: Roadway = { s: 0, x: 0, w: 0, d: 0, yaw: 0 };

/**
 * Pose l'emplacement `i` de la rue de la cellule `cell`, du côté `side`, à
 * l'instant `t` (s). Renvoie faux s'il n'y a pas de rue là, ou si le véhicule
 * est hors de sa course.
 *
 * Le dernier emplacement d'une rue est une voiture À L'ARRÊT sur le bas-côté :
 * elle ne coûte rien de plus et elle vaut cher - c'est elle qui dit que la rue
 * est habitée, et pas seulement traversée.
 */
export function laneSlot(
  cell: number,
  side: 1 | -1,
  i: number,
  perStreet: number,
  t: number,
  out: Lane,
): boolean {
  if (!roadwayOf(cell, ROADWAY)) return false;
  const cs = Math.cos(ROADWAY.yaw);
  const sn = Math.sin(ROADWAY.yaw);
  const halfW = ROADWAY.w / 2;

  const seed = cell * 8663 + (side === 1 ? 0 : 4231) + i * 79;
  const h0 = hashInt(seed);
  const h1 = hashInt(seed + 1);
  const h2 = hashInt(seed + 2);

  out.parked = i === perStreet - 1;
  out.yaw = ROADWAY.yaw;
  out.paint = h2;
  // Un utilitaire un emplacement sur trois, et jamais celui qui stationne : une
  // camionnette garée au ras du premier rang masquerait la trouée.
  out.van = !out.parked && h2 > 0.66;
  // Sens de marche dans la rue : vers la ville, ou vers la voie.
  const dir = i === 0 ? 1 : -1;
  out.flip = side * dir < 0;
  // ON ROULE À GAUCHE. Le détail se voit : deux véhicules qui se croisent dans
  // une trouée le font du bon côté, et une voiture garée l'est contre le
  // trottoir de gauche de son sens. La gauche d'une caisse tournée vers son +x
  // est son -z, donc le côté des abscisses croissantes de la rue.
  const lane = out.flip ? -1 : 1;

  let r: number;
  out.grow = 1;
  if (out.parked) {
    r = STREET_INNER + 5 + h0 * (STREET_OUTER - STREET_INNER - 10);
  } else {
    const speed = 8 + h1 * 6;
    const p = (h0 + (t * speed) / RUN_LEN) % 1;
    r = dir === 1 ? RUN_MIN + p * RUN_LEN : RUN_MAX - p * RUN_LEN;
    // Entrée et sortie de course : le véhicule prend et rend sa taille sur cinq
    // mètres. Ce n'est pas une élégance, c'est ce qui remplace le fondu qu'un
    // matériau opaque ne sait pas faire.
    out.grow = Math.max(0, Math.min(1, Math.min(r - RUN_MIN, RUN_MAX - r) / RAMP));
    if (out.grow <= 0.02) return false;
  }

  const u = lane * (out.parked ? halfW - 0.9 : halfW * 0.46);
  const along = (r - ROADWAY.x) / Math.max(0.6, cs);
  out.s = ROADWAY.s + u * cs - along * side * sn;
  out.x = ROADWAY.x + u * side * sn + along * cs;
  return true;
}
