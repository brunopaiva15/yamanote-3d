// À quel ÉTAGE de la gare, et sur quel sol, se pose un pied.
//
// Le joueur n'est plus seul à descendre : la foule du quai franchit maintenant
// les portillons et se promène dans le hall (systems/platformCrowd). Les deux
// doivent lire la même chose, sinon l'un marche là où l'autre flotte - c'est le
// principe « une seule source » du dépôt appliqué à la verticale.
//
// LE POINT DÉLICAT, et il n'y en a qu'un : à une même abscisse il y a DEUX
// sols, la dalle du quai et le plancher du hall trois mètres et demi dessous.
// Rien dans les coordonnées ne dit lequel est sous les pieds. Seul l'ACCÈS
// PRINCIPAL - la volée qui relie les deux - lève l'ambiguïté, parce qu'il n'y a
// là qu'un seul sol : c'est donc là, et nulle part ailleurs, que l'étage change.
//
// Repère : celui du QUAI (x depuis l'axe de la voie vers le fond, z le long de
// la voie), et les altitudes sont relatives au sol du quai - c'est déjà la
// convention des cotes de trémie (data/stationGeometry).

import {
  ASCENT_LANDING_Y,
  ASCENT_LEN,
  ascentFloorY,
  DESCENT_LEN,
  DESCENT_LOWER_T,
  descentFloorY,
  STAIR_FULL_LEN,
  STAIR_FULL_STEPS,
  STAIR_WALK_HALF_X,
} from '../data/stationGeometry';
import { EXIT_MOUTH_END, exitMouthFloorY } from '../data/stationInterior';
import { stairTopZ, stairwellAt, type StationPlacement } from './stationPlacement';

/** Étage où l'on pose les pieds, dans le repère de la gare. */
export type StationLevel = 'platform' | 'concourse';

export interface AccessFloor {
  /** Altitude du sol, relative au sol du quai. */
  y: number;
  /** Étage atteint : la volée les relie, et bascule à mi-parcours. */
  level: StationLevel;
}

/**
 * L'accès principal sous un point, ou null si le point n'y est pas.
 *
 * C'est la seule fonction du jeu qui ait le droit de faire changer d'étage, et
 * c'est voulu : la volée est le seul endroit où les deux sols n'en font qu'un.
 * Le point de bascule est le même dans les deux sens - le linteau sous lequel
 * on passe en descendant, le palier de mi-étage qu'on franchit en montant.
 *
 * Rend null tant que le niveau n'est pas construit : la trémie redevient alors
 * le couloir borgne qu'elle était, et c'est `stairwellAt` qui la décrit.
 */
export function mainAccessFloor(
  p: StationPlacement,
  x: number,
  z: number,
): AccessFloor | null {
  if (!p.interior.built) return null;
  const main = p.mainStair;
  if (Math.abs(x - main.x) > STAIR_WALK_HALF_X) return null;
  const t = z - stairTopZ(main);
  const up = p.mainRise === 'up';
  if (t < 0 || t > (up ? ASCENT_LEN : DESCENT_LEN)) return null;
  const y = up ? ascentFloorY(t) : descentFloorY(t);
  const crossed = up ? y > ASCENT_LANDING_Y : t > DESCENT_LOWER_T;
  return { y, level: crossed ? 'concourse' : 'platform' };
}

/**
 * Le sol du niveau de correspondance sous un point, ou null.
 *
 * Le hall est un seul rectangle, du débouché du couloir au fond de la zone
 * libre : la ligne de portillons n'y fait pas de coupure, ce sont ses BORNES
 * qui barrent, et elles sont dans `obstacles`. Une baie franchissable est donc
 * exactement le vide entre deux bornes - celui-là même que le rendu dessine.
 *
 * Ce que cette fonction ne dit PAS : l'état des battants. Ils se lèvent et se
 * rabattent (systems/fareGate), et c'est à qui se présente devant de s'en
 * soucier - le joueur y bute, un voyageur valide avant d'arriver.
 */
export function concourseFloorAt(
  p: StationPlacement,
  x: number,
  z: number,
): number | null {
  const it = p.interior;
  if (!it.built) return null;
  if (x < it.paid.x0 || x > it.paid.x1) return null;
  if (z < it.paid.z0 || z > it.free.z1) return null;
  for (const o of it.obstacles) {
    if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1) return null;
  }
  return it.floorY;
}

/**
 * Le sol dans une BOUCHE DE SORTIE, ou null si le point n'y est pas.
 *
 * La volée qui monte à la rue n'est pas praticable par le joueur - une limite
 * de zone se dresse dans la baie, et le fléchage dit où elle mène. Elle l'est
 * pour les VOYAGEURS, qui doivent bien s'en aller quelque part : ils s'y
 * engagent et montent jusqu'à passer derrière le linteau, exactement comme ils
 * s'enfoncent dans une trémie de quai. C'est pour cela que cette fonction est à
 * part de `concourseFloorAt` : ce n'est pas du sol de hall, c'est une sortie.
 */
export function exitMouthFloorAt(
  p: StationPlacement,
  x: number,
  z: number,
): number | null {
  const it = p.interior;
  if (!it.built) return null;
  const t = z - it.free.z1;
  if (t < 0 || t > EXIT_MOUTH_END) return null;
  for (const e of it.exits) {
    if (Math.abs(x - e.x) <= e.halfWidth) return it.floorY + exitMouthFloorY(t);
  }
  return null;
}

/**
 * Encombrement d'un VOYAGEUR, et il n'est pas le même aux deux étages.
 *
 * SUR LE QUAI, vingt-deux centimètres : c'est ce qu'il faut pour qu'une épaule
 * ne traverse pas un poteau, et il y a deux cent vingt-quatre mètres de quai
 * pour contourner de loin.
 *
 * DANS LE HALL, cinq. Les couloirs du konbini font trente centimètres au plus
 * serré, et le joueur lui-même y passe en POINT, sans épaisseur
 * (`systems/walkable`) : un voyageur plus large que le joueur ne pourrait plus
 * entrer là où le joueur entre, et la boutique se refermerait sur elle-même.
 */
export const CLEAR_DECK = 0.22;
export const CLEAR_HALL = 0.05;

/**
 * Le JOUR qu'on garde entre soi et une chose, quand on a la place.
 *
 * `CLEAR_DECK` est un gabarit : c'est la largeur d'une épaule, et un voyageur
 * posé pile dessus ne traverse rien - il FRÔLE. Vingt-deux centimètres du
 * caisson d'une borne d'arrêt d'urgence, c'est la largeur du buste : le bras
 * qui balance et le sac à dos passent dedans, et l'on voit quelqu'un rentrer
 * dans le mobilier alors qu'aucune règle n'est violée.
 *
 * D'où deux mesures et non une : ce qu'on ne TRAVERSE pas (`CLEAR_DECK`, dur,
 * il décide de ce qui est du sol), et ce qu'on se GARDE (celle-ci, molle, elle
 * décide de ce qu'on préfère). Un couloir trop étroit pour la seconde se
 * franchit quand même - toutes les places qui la lisent retombent sur la
 * première quand rien de mieux ne se présente.
 */
export const CLEAR_ROOM = 0.2;

/**
 * Ce point est-il interdit à un voyageur, à l'étage où il se trouve ?
 *
 * C'est la règle de marche des PNJ, et elle vit ici plutôt que dans
 * `systems/platformCrowd` pour une seule raison : elle doit être la MÊME que
 * celle qui construit leurs itinéraires et que celle que le test vérifie. Un
 * chemin tracé dans un référentiel et parcouru dans un autre finit toujours
 * dans une gondole.
 *
 * Le joueur, lui, a la sienne (`systems/walkable`) : il n'a pas d'épaisseur,
 * il peut tomber dans les seuils de porte de rame, et un portillon rabattu
 * l'arrête. Les deux se ressemblent sans se confondre.
 *
 * `berth` élargit le MOBILIER, et lui seul : les bornes du quai ne bougent pas
 * (on a le droit de marcher au ras du liseré) et le nez des volées s'ouvre
 * d'autant (sans quoi la garde ferait un mur invisible devant la première
 * contremarche - le défaut que ce fichier a déjà eu deux fois).
 */
export function walkerBlocked(
  p: StationPlacement,
  level: StationLevel,
  x: number,
  z: number,
  berth = 0,
): boolean {
  // La volée principale, d'abord et quel que soit l'étage : c'est le seul
  // endroit qui appartient aux deux, et c'est du sol des deux côtés. Sans ce
  // test en tête, un voyageur qui vient de basculer au niveau du hall butait
  // sur un mur invisible dans le couloir bas - le hall ne commence qu'au bout.
  //
  // Le NEZ de la volée est regardé avec la garde en avant (une volée s'ouvre
  // côté -z, c'est par là qu'on y entre) : sans cela, les vingt-deux
  // centimètres d'encombrement font un mur invisible juste devant la première
  // contremarche, et l'on butait sans jamais pouvoir y poser le pied. Le dépôt
  // s'est déjà fait prendre par ce défaut-là en posant la volée montante.
  const guard = CLEAR_DECK + berth;
  if (mainAccessFloor(p, x, z) || mainAccessFloor(p, x, z + guard)) return false;
  if (level === 'concourse') {
    // Une bouche de sortie n'est pas du sol de hall : c'est par là qu'on s'en
    // va, et elle monte.
    if (exitMouthFloorAt(p, x, z) !== null) return false;
    if (concourseFloorAt(p, x, z) === null) return true;
    for (const o of p.interior.obstacles) {
      if (x > o.x0 - CLEAR_HALL && x < o.x1 + CLEAR_HALL
        && z > o.z0 - CLEAR_HALL && z < o.z1 + CLEAR_HALL) return true;
    }
    return false;
  }
  // Une trémie borgne est du SOL elle aussi : son emprise barre pour qui la
  // prend en travers, jamais pour qui l'emprunte par son nez - et le nez se
  // regarde avec la même garde en avant que celui de l'accès principal.
  if (stairwellAt(p, x, z, STAIR_FULL_LEN, STAIR_FULL_STEPS)) return false;
  if (stairwellAt(p, x, z + guard, STAIR_FULL_LEN, STAIR_FULL_STEPS)) return false;
  if (x < p.walkX0 || x > p.walkX1) return true;
  if (Math.abs(z) > p.walkHalfZ) return true;
  for (const o of p.obstacles) {
    if (Math.abs(x - o.x) < o.halfX + guard && Math.abs(z - o.z) < o.halfZ + guard) {
      return true;
    }
  }
  return false;
}

/**
 * Ce point est-il TROP JUSTE pour un voyageur ?
 *
 * Le mobilier du quai y est élargi du jour qu'on se garde (`CLEAR_ROOM`) : ce
 * n'est pas une interdiction, c'est une préférence. Le hall, lui, répond comme
 * `walkerBlocked` - ses couloirs font trente centimètres au plus serré, une
 * garde de plus les fermerait tous, et le konbini avec.
 */
export function walkerCramped(
  p: StationPlacement,
  level: StationLevel,
  x: number,
  z: number,
): boolean {
  return walkerBlocked(p, level, x, z, level === 'platform' ? CLEAR_ROOM : 0);
}
