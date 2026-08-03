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
// SOUS LE QUAI, EN REVANCHE, IL N'Y A PLUS UN SEUL SOL. Le hall était une boîte
// et rendait la même altitude partout ; il est maintenant un RÉSEAU DE PIÈCES
// (`data/stationConcourseBuild`), chacune à la sienne, joint par des ouvrages
// dont l'altitude s'interpole entre les deux bouts. C'est ce que demandait le
// constat S1 du plan - « il faut N nœuds à N altitudes et M liens verticaux » -
// et c'est ce que lisent maintenant `concourseFloorAt` et `joinFloorAt`.
//
// L'étage, lui, reste binaire : `'platform' | 'concourse'`. Ce n'est pas un
// oubli. Ce couple ne compte pas les niveaux, il tranche la seule ambiguïté
// qu'il y ait - suis-je sur la dalle, ou dessous ? Une fois qu'on est dessous,
// c'est la PIÈCE qui dit à quelle hauteur, et elle le dit sans ambiguïté.
//
// Repère : celui du QUAI (x depuis l'axe de la voie vers le fond, z le long de
// la voie), et les altitudes sont relatives au sol du quai - c'est déjà la
// convention des cotes de trémie (data/stationGeometry).

import {
  ASCENT_LANDING_Y,
  ASCENT_LEN,
  ascentFloorY,
  DESCENT_LOWER_T,
  descentFloorYTo,
  descentLenTo,
  STAIR_FULL_LEN,
  STAIR_FULL_STEPS,
  STAIR_WALK_HALF_X,
} from '../data/stationGeometry';
import { EXIT_MOUTH_END, exitMouthFloorY } from '../data/stationInterior';
import { roomAt } from '../data/stationConcourseBuild';
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
 * Un accès VIVANT sous un point, ou null si le point n'y est pas.
 *
 * C'est la seule fonction du jeu qui ait le droit de faire changer d'étage, et
 * c'est voulu : la volée est le seul endroit où les deux sols n'en font qu'un.
 * Le point de bascule est le même dans les deux sens - le linteau sous lequel
 * on passe en descendant, le palier de mi-étage qu'on franchit en montant.
 *
 * ELLE LES PARCOURT TOUS depuis la phase 12. Le nom garde « main » parce que
 * vingt-huit gares sur trente n'en ont qu'un, et que c'est bien de l'accès
 * PRINCIPAL qu'il s'agit chez elles ; ce qui a changé, c'est qu'il n'est plus
 * seul par construction.
 *
 * Rend null tant que le niveau n'est pas construit : la trémie redevient alors
 * le couloir borgne qu'elle était, et c'est `stairwellAt` qui la décrit.
 */
export function mainAccessFloor(
  p: StationPlacement,
  x: number,
  z: number,
): AccessFloor | null {
  if (!p.network.built) return null;
  // TOUS LES ACCÈS VIVANTS, et non plus le seul principal. Vingt-huit gares
  // n'en ont qu'un et rien ne change pour elles ; Harajuku en a deux, et ses
  // deux ensembles ne se rejoignent QUE par le quai — c'est donc par les deux
  // volées qu'on passe de l'un à l'autre.
  for (const a of p.liveAccesses) {
    if (Math.abs(x - a.stair.x) > STAIR_WALK_HALF_X) continue;
    const t = z - stairTopZ(a.stair);
    const up = a.rise === 'up';
    // LA VOLÉE VA OÙ VA SA PIÈCE. Cinq gares descendent sous les voies, à
    // −6,40 m : leur volée est plus longue de deux mètres vingt-cinq et compte
    // vingt-deux marches. Lire ici la profondeur ordinaire ferait tomber le
    // marcheur dans le vide à l'endroit précis où l'escalier continue.
    const len = up ? ASCENT_LEN : descentLenTo(a.floorY);
    if (t < 0 || t > len) continue;
    const y = up ? ascentFloorY(t) : descentFloorYTo(t, a.floorY);
    const crossed = up ? y > ASCENT_LANDING_Y : t > DESCENT_LOWER_T;
    return { y, level: crossed ? 'concourse' : 'platform' };
  }
  return null;
}

/**
 * Le sol du niveau de correspondance sous un point, ou null.
 *
 * ELLE INTERROGE LE RÉSEAU, et c'est le changement de la phase 8. Le hall
 * n'était qu'un rectangle - du débouché du couloir au fond de la zone libre -
 * et cette fonction rendait une altitude unique, la même partout. Elle rend
 * maintenant celle de LA PIÈCE sous les pieds : N pièces, N altitudes. Tant
 * qu'aucune gare n'est branchée sur son relevé, le réseau est l'enveloppe du
 * hall générique et la réponse est identique au centimètre - c'est ce que
 * vérifie `tests/stationConcourseNetwork`.
 *
 * Ce qui n'a pas changé : la ligne de portillons ne fait pas de coupure, ce
 * sont ses BORNES qui barrent (elles sont dans `obstacles`), et une baie
 * franchissable est exactement le vide entre deux bornes - celui-là même que
 * le rendu dessine.
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
  return roomAt(p.network, x, z)?.floorY ?? null;
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
  const net = p.network;
  if (!net.built) return null;
  for (const m of net.mouths) {
    const host = net.rooms.find((r) => r.id === m.roomId);
    if (!host?.walkable) continue;
    // `t` compte depuis le NU de la paroi vers l'extérieur, `across` court le
    // long d'elle. C'est la seule généralisation nécessaire : la bouche
    // s'ouvre dans une paroi quelconque, et non plus au fond vers +z.
    const r = host.rect;
    const t = m.side === 'z1' ? z - r.z1
      : m.side === 'z0' ? r.z0 - z
        : m.side === 'x1' ? x - r.x1
          : r.x0 - x;
    if (t < 0 || t > EXIT_MOUTH_END) continue;
    const across = m.side === 'z0' || m.side === 'z1' ? x : z;
    if (Math.abs(across - m.at) <= m.halfWidth) return host.floorY + exitMouthFloorY(t);
  }
  return null;
}

/**
 * Le sol dans un OUVRAGE DE LIAISON - volée, mécanique, rampe, couloir - ou
 * null si le point n'y est pas.
 *
 * C'est le « M liens verticaux » du plan (constat S1), et c'est ce qui manquait
 * pour qu'une gare ait plus de deux étages : jusqu'ici, un seul accès faisait
 * changer d'altitude, et il n'y en avait qu'un par gare. Un lien praticable est
 * maintenant du sol comme un autre, et son altitude s'interpole entre ses deux
 * bouts - exactement comme une volée de trémie.
 *
 * Aucun réseau n'en porte encore : le hall générique n'a pas de liaison
 * interne. Les trente relevés, eux, en ont quatorze, et c'est là que cette
 * fonction se vérifie.
 */
export function joinFloorAt(
  p: StationPlacement,
  x: number,
  z: number,
): number | null {
  const net = p.network;
  if (!net.built) return null;
  // Ce qui barre dans une pièce barre aussi dans l'ouvrage qui y mène : une
  // borne de portillon plantée au pied d'une volée ne devient pas franchissable
  // parce qu'on descend.
  for (const o of net.obstacles) {
    if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1) return null;
  }
  for (const j of net.joins) {
    if (!j.walkable) continue;
    const r = j.rect;
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const rooms = net.rooms;
    const a = rooms.find((n) => n.id === j.from);
    const b = rooms.find((n) => n.id === j.to);
    if (!a || !b) continue;
    // L'AXE DE LA PENTE VIENT DES DEUX PIÈCES, pas de la forme du rectangle.
    // Le premier réflexe - « l'ouvrage est plus long qu'il n'est large, donc la
    // pente suit sa longueur » - se trompe dès la première volée réelle : celle
    // de la mezzanine d'Okachimachi fait cinq mètres soixante de large pour un
    // mètre de long, et descend pourtant dans le sens du mètre. Ce qui décide,
    // c'est l'axe qui SÉPARE les deux pièces ; la forme ne tranche que si elles
    // sont l'une au-dessus de l'autre.
    const midA = { x: (a.rect.x0 + a.rect.x1) / 2, z: (a.rect.z0 + a.rect.z1) / 2 };
    const midB = { x: (b.rect.x0 + b.rect.x1) / 2, z: (b.rect.z0 + b.rect.z1) / 2 };
    const gapX = Math.abs(midB.x - midA.x);
    const gapZ = Math.abs(midB.z - midA.z);
    const alongZ = Math.abs(gapZ - gapX) > 1e-6 ? gapZ > gapX : r.z1 - r.z0 >= r.x1 - r.x0;
    const span = alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
    if (span <= 0) continue;
    const raw = alongZ ? (z - r.z0) / span : (x - r.x0) / span;
    const t = (alongZ ? midA.z <= midB.z : midA.x <= midB.x) ? raw : 1 - raw;
    return j.fromY + (j.toY - j.fromY) * t;
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
    // Un OUVRAGE DE LIAISON non plus : c'est du sol, il change seulement
    // d'altitude en chemin. Sans ce test, une volée intérieure serait un mur
    // pour la foule alors que le joueur la descend.
    if (joinFloorAt(p, x, z) !== null) return false;
    if (concourseFloorAt(p, x, z) === null) return true;
    for (const o of p.network.obstacles) {
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
