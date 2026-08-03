// Où le joueur a le droit de poser les pieds.
//
// Il n'y a pas de physique dans ce projet, et il n'en faut pas : le volume
// praticable se décrit très bien en rectangles alignés sur les axes. Ce module
// remplace le clamp d'allée qui enfermait le joueur au milieu du wagon.
//
// Repère de travail : (u, w). `w` est le z du monde. `u` est l'abscisse
// mesurée POSITIVEMENT VERS LE QUAI - c'est-à-dire `platformFlip() * x`, le
// côté du quai qui est physiquement là (voir `walkFlip`). Ce choix
// fait disparaître le retournement du quai : `u` est exactement l'abscisse
// locale dans laquelle Platform construit sa géométrie, et le wagon, symétrique,
// s'y décrit aussi bien d'un côté que de l'autre.
//
// Le seuil de porte est un « portillon » : un rectangle qui n'existe que si la
// porte de la rame ET la porte palière en face sont réellement dégagées - le
// même prédicat que celui qui laisse entrer le son du quai. Train absent, tous
// les portillons se ferment : on ne peut pas tomber sur la voie.

import { Vec3, clamp, lerp } from './vec3';
import { CONFIG } from '../data/config';
import { PLATFORM_TOP, PSD_X } from '../data/stationGeometry';
import { useStore } from '../store';
import { psdGates } from '../three/station/psdLayout';
import { gateBlocks, passageAt } from './fareGate';
import { platformFlip } from './playerFrame';
import { runtime, type PlayerFrame, type PlayerLevel } from './runtime';
import { concourseFloorAt, mainAccessFloor } from './stationLevels';
import { placementFor, stairwellAt, type StationPlacement } from './stationPlacement';

/**
 * Sens du repère de marche : `u` est compté positivement vers le quai.
 *
 * C'est `DOOR_SIDE[platformIndex]` - le côté du quai PRÉSENT - et non
 * `store.doorSide`, qui bascule vers la gare suivante dès la première image de
 * la croisière alors que le quai précédent défile encore. Tout ce qui touche au
 * repère du quai lit déjà celui-là (le rendu de la gare, la foule, les animaux,
 * la rame croisée, `playerFrame`) ; ce module était le seul à lire l'autre, et
 * calculait donc son `u` avec le côté de la gare à venir tout en interrogeant
 * l'emprise de la gare quittée. Sans conséquence tant que le joueur est à bord
 * pendant cette fenêtre - `inCar` est symétrique en `u` -, mais rien ne
 * garantissait qu'il y reste.
 */
const walkFlip = platformFlip;

/** Demi-largeur de l'allée centrale du wagon (les banquettes commencent après). */
export const AISLE_U = 0.72;
/** Fond de l'alcôve de porte : 8 cm devant la paroi intérieure (x = ±1,4). */
const ALCOVE_U = 1.32;
/** Demi-longueur de l'alcôve, un peu plus large que la baie (2 × 0,66). */
const ALCOVE_HALF_Z = 0.62;
/**
 * Demi-longueur du portillon : on passe droit, pas en biais. Exportée parce
 * que la limite de zone d'un bord de quai NU (three/station/Barrier) doit
 * s'ouvrir exactement là où l'on passe, et pas d'un centimètre de plus.
 */
export const PORTAL_HALF_Z = 0.55;
/** Le quai commence juste derrière le liseré blanc (x = 2,02). */
const PLATFORM_U0 = 1.98;
/** Demi-longueur du wagon praticable. */
const CAR_HALF_Z = 9.2;
/** Ouverture minimale (porte rame × porte palière) pour franchir un seuil. */
export const PORTAL_MIN_OPEN = 0.55;

/** Mi-seuil : au-delà, on considère que le joueur a changé de monde. */
const PORTAL_MID_U = (ALCOVE_U + PLATFORM_U0) / 2;

export interface PortalInfo {
  /** Centre du seuil en repère wagon. */
  doorZ: number;
  /** Centre du seuil en repère monde. */
  worldZ: number;
  /** 0..1 : ouverture réelle du passage. */
  open: number;
}

interface Region {
  frame: PlayerFrame;
  y: number;
  /**
   * Étage atteint. Il ne change que dans une trémie - le seul endroit où les
   * deux sols n'en font qu'un - et c'est `resolveMove` qui l'entérine, une fois
   * le pas accepté.
   */
  level: PlayerLevel;
}

const CAR_REGION: Region = { frame: 'car', y: 0, level: 'platform' };
// Le quai n'est plus plat : on descend quelques marches dans les trémies. La
// région est donc reconstruite à chaque test plutôt que constante.
const PLATFORM_REGION: Region = { frame: 'platform', y: PLATFORM_TOP, level: 'platform' };

// --- Prédicats ----------------------------------------------------------

/**
 * Emprise du quai de la gare courante : bornes de marche et mobilier, tirées
 * de la même source que le rendu - un banc dessiné ici et infranchissable là
 * se verrait au premier pas.
 */
function currentPlatform() {
  // platformIndex : la gare dont le quai est physiquement là. index désigne
  // déjà la suivante pendant le départ.
  return placementFor(useStore.getState().platformIndex, psdGates());
}

/**
 * Vitesse en deçà de laquelle la rame est considérée à l'arrêt (m/s). Le profil
 * de freinage éteint la vitesse exactement à zéro (systems/trainPhysics), le
 * seuil n'est là que par prudence numérique.
 */
const STOPPED_V = 0.05;

/** Ouverture réelle d'un seuil, 0 (fermé) à 1 (dégagé). */
export function portalOpen(): number {
  if (!runtime.trainPresent) return 0;
  // Une rame qui roule n'a pas de seuil. La chorégraphie des portes ne les
  // ouvre jamais en marche, mais c'est une conséquence de la chronologie, pas
  // une garantie : on la pose ici, là où le passage se décide. Vu du quai,
  // `runtime.speed` est celle de la rame qui arrive ou qui s'en va - et on ne
  // monte pas non plus dans un train en mouvement.
  if (Math.abs(runtime.speed) > STOPPED_V) return 0;
  // Sans portes de quai (Shinjuku, Shibuya), le seuil ne dépend que de la
  // porte de la rame : psdOpen continue de battre dans son coin, mais il n'y a
  // rien en face qu'il puisse ouvrir ou fermer.
  return runtime.doorOpen * (runtime.psdPresent ? runtime.psdOpen : 1);
}

function inCar(u: number, w: number): boolean {
  const z = w - runtime.trainZ;
  if (Math.abs(z) > CAR_HALF_Z) return false;
  if (Math.abs(u) <= AISLE_U) return true;
  // Alcôves de porte, des deux côtés : on peut se mettre devant une porte même
  // quand elle ne s'ouvre pas de ce côté-là.
  if (Math.abs(u) > ALCOVE_U) return false;
  for (const dz of CONFIG.doorCenters) {
    if (Math.abs(z - dz) <= ALCOVE_HALF_Z) return true;
  }
  return false;
}

/**
 * Porte dont le joueur occupe le SEUIL en ce moment (centre z, repère wagon),
 * ou null s'il est franchement dedans ou franchement dehors.
 *
 * Deux choses en dépendent, et ce sont deux faces du même fait : c'est ce qui
 * fait de lui un obstacle pour la porte qui se ferme
 * (systems/doorObstruction), et c'est ce qui garde ce seuil-là franchissable
 * pour lui - voir `inPortal`.
 *
 * Deux précautions, et ce sont les deux moitiés du même bug. La position lue
 * est celle des PIEDS (`runtime.stanceX/Z`) et non celle de l'œil, qui
 * balance de deux centimètres avec la caisse : lus sur l'œil, ces deux
 * centimètres mettaient dans l'encadrement quelqu'un qui n'y était pas. Et les
 * bornes sont STRICTES : posé pile sur l'une ou l'autre, on est encore dans
 * l'alcôve ou déjà sur le quai, pas dans le seuil. Sans quoi le seuil
 * s'auto-alimentait - la clause de sortie de `inPortal` autorisait le pas
 * suivant, qui la rendait vraie à son tour, et on traversait ainsi une porte
 * fermée, en pleine course.
 */
export function playerDoorwayZ(): number | null {
  if (!runtime.trainPresent) return null;
  const u = walkFlip() * runtime.stanceX;
  if (u <= ALCOVE_U || u >= PLATFORM_U0) return null;
  const z = runtime.stanceZ - runtime.trainZ;
  for (const dz of CONFIG.doorCenters) {
    if (Math.abs(z - dz) <= PORTAL_HALF_Z) return dz;
  }
  return null;
}

function inPortal(u: number, w: number): boolean {
  if (u < ALCOVE_U || u > PLATFORM_U0) return false;
  const z = w - runtime.trainZ;
  for (const dz of CONFIG.doorCenters) {
    if (Math.abs(z - dz) > PORTAL_HALF_Z) continue;
    if (portalOpen() >= PORTAL_MIN_OPEN) return true;
    // Seuil refermé : on n'y ENTRE plus, mais si on y est déjà, on en sort.
    // Une porte qui se referme sur quelqu'un ne l'emmure pas - elle s'arrête
    // sur lui (systems/doorObstruction), et il lui reste les deux côtés.
    //
    // « Y être déjà » se lit sur les pieds, strictement entre l'alcôve et le
    // quai : la seule façon d'y arriver est d'avoir franchi un seuil
    // réellement ouvert. La clause rend donc le seuil qu'on occupe, jamais
    // celui d'à côté ni celui qu'on n'a pas encore atteint.
    return playerDoorwayZ() === dz;
  }
  return false;
}

/** Abscisse z locale du quai (repère de construction) pour un z monde. */
function platformZ(w: number): number {
  return walkFlip() * (w - runtime.platformSlide);
}

/**
 * Altitude du sol sous (u, w) dans la volée d'une trémie, ou null.
 *
 * La trémie PRINCIPALE - celle qui mène au niveau de correspondance - se
 * descend en entier : première volée, palier de mi-étage, seconde volée,
 * couloir. Les autres gardent la limite de zone à cinq marches : leur couloir
 * est borgne, et s'y enfoncer ne mènerait qu'à un mur, deux mètres plus bas.
 */
function stairFloorAt(p: StationPlacement, u: number, localZ: number): Region | null {
  // L'accès principal relie les deux étages, et il est le SEUL à le faire :
  // c'est `systems/stationLevels` qui le décrit, pour le joueur comme pour la
  // foule qui descend derrière lui.
  const access = mainAccessFloor(p, u, localZ);
  if (access) return { frame: 'platform', y: PLATFORM_TOP + access.y, level: access.level };
  const hit = stairwellAt(p, u, localZ);
  return hit ? { frame: 'platform', y: PLATFORM_TOP + hit.y, level: 'platform' } : null;
}

/**
 * Altitude du sol du niveau de correspondance sous (u, localZ), ou null.
 *
 * Le hall est un seul rectangle, du débouché du couloir au fond de la zone
 * libre : la ligne de portillons n'y fait pas de coupure, ce sont ses BORNES
 * qui barrent, et elles sont dans `obstacles`. Une baie franchissable est donc
 * exactement le vide entre deux bornes - celui-là même que le rendu dessine.
 *
 * À une exception près, et c'est toute la différence entre un trou et un
 * portillon : les BATTANTS. Une baie dont les battants sont rabattus barre
 * comme une borne, et se rouvre quand on a validé (systems/fareGate). Sans ce
 * test, les battants dessinés en travers du passage se seraient traversés à
 * pied - ce qui aurait été pire que de ne pas les dessiner du tout.
 */
function concourseFloorY(p: StationPlacement, u: number, localZ: number): number | null {
  const floor = concourseFloorAt(p, u, localZ);
  if (floor === null) return null;
  const passage = passageAt(u, localZ);
  if (passage >= 0 && gateBlocks(passage)) return null;
  return floor;
}

/**
 * Région de la GARE sous (u, w), ou null si l'endroit n'est pas praticable.
 *
 * Trois sols peuvent se présenter, et l'ordre du test n'est pas indifférent :
 *
 *   1. la trémie, d'abord - son emprise reste un obstacle (on ne tombe pas
 *      dans le trou par le côté), mais la volée elle-même se descend ;
 *   2. le hall, si l'on est DÉJÀ descendu - c'est là que l'étage courant
 *      tranche : à l'aplomb du hall, il y a aussi la dalle du quai, et rien
 *      dans les coordonnées ne dit sur laquelle des deux on marche ;
 *   3. le quai, sinon.
 */
function stationRegionAt(u: number, w: number): Region | null {
  const p = currentPlatform();
  const localZ = platformZ(w);
  const stair = stairFloorAt(p, u, localZ);
  if (stair) return stair;
  if (runtime.playerLevel === 'concourse') {
    const y = concourseFloorY(p, u, localZ);
    return y === null ? null : { frame: 'platform', y: PLATFORM_TOP + y, level: 'concourse' };
  }
  if (u < p.walkX0 || u > p.walkX1) return null;
  if (Math.abs(localZ) > p.walkHalfZ) return null;
  for (const o of p.obstacles) {
    if (Math.abs(u - o.x) <= o.halfX && Math.abs(localZ - o.z) <= o.halfZ) return null;
  }
  return PLATFORM_REGION;
}

function regionAt(u: number, w: number): Region | null {
  // Sous le quai, il n'y a ni rame ni seuil de porte : la question ne se pose
  // qu'à l'étage du quai, et la poser quand même ferait remonter d'un étage
  // quiconque passe à l'aplomb d'une porte ouverte.
  if (runtime.playerLevel === 'platform' && inCar(u, w)) return CAR_REGION;
  const station = stationRegionAt(u, w);
  if (station) return station;
  if (runtime.playerLevel === 'platform' && inPortal(u, w)) {
    return u < PORTAL_MID_U ? CAR_REGION : PLATFORM_REGION;
  }
  return null;
}

// --- API ----------------------------------------------------------------

/** Repère auquel appartient une position monde, ou null si elle est hors sol. */
export function frameAt(x: number, z: number): PlayerFrame | null {
  const u = walkFlip() * x;
  return regionAt(u, z)?.frame ?? null;
}

/** Hauteur du sol sous une position monde (0 dans le wagon, -0,06 sur le quai). */
export function groundY(x: number, z: number): number {
  const u = walkFlip() * x;
  if (runtime.playerLevel === 'platform' && u > ALCOVE_U && u < PLATFORM_U0) {
    // Dans le seuil : la marche de 6 cm se descend progressivement.
    const t = (u - ALCOVE_U) / (PLATFORM_U0 - ALCOVE_U);
    return lerp(0, PLATFORM_TOP, t);
  }
  return regionAt(u, z)?.y ?? 0;
}

/**
 * Déplace `pos` (repère MONDE) de (dx, dz) en restant dans le volume
 * praticable, avec glissement le long des obstacles. Mutation en place.
 */
export function resolveMove(pos: Vec3, dx: number, dz: number): void {
  const side = walkFlip();
  const u = side * pos.x;
  const w = pos.z;
  const nu = u + side * dx;
  const nw = w + dz;

  let outU = nu;
  let outW = nw;
  let region = regionAt(nu, nw);
  if (!region) {
    // Glissement le long de l'obstacle : on garde celui des deux axes qui
    // passe encore. Le pas retenu est celui dont on ENTÉRINE l'étage.
    region = regionAt(nu, w);
    if (region) outW = w;
    else {
      region = regionAt(u, nw);
      if (region) outU = u;
      else {
        outU = u;
        outW = w;
        region = regionAt(u, w);
      }
    }
  }
  pos.x = side * outU;
  pos.z = outW;
  // L'étage ne change que dans une trémie, et seulement une fois le pas
  // accepté : un pas refusé ne fait pas changer de gare d'étage.
  if (region) runtime.playerLevel = region.level;
}

/**
 * Ramène une position monde dans le volume praticable - utile après un
 * changement de côté d'ouverture ou de géométrie de gare.
 */
export function snapInside(pos: Vec3): void {
  const side = walkFlip();
  const u = side * pos.x;
  if (regionAt(u, pos.z)) return;
  // On repart de l'allée du wagon : c'est le seul endroit dont on soit sûr, et
  // il est à l'étage du quai. Le rattrapage ramène donc aussi l'étage, sans
  // quoi on se retrouverait à bord en cherchant le sol du hall.
  runtime.playerLevel = 'platform';
  pos.x = side * clamp(u, -AISLE_U, AISLE_U);
  pos.z = clamp(pos.z - runtime.trainZ, -CAR_HALF_Z, CAR_HALF_Z) + runtime.trainZ;
}

/**
 * Seuil ouvert le plus proche d'une position monde, dans un rayon donné.
 * Sert à l'invite contextuelle du HUD et au raccourci clavier.
 */
export function nearestOpenPortal(x: number, z: number, maxDist = 3.2): PortalInfo | null {
  // Depuis le hall, aucun seuil n'est à portée : on est trois mètres et demi
  // sous les roues. La question ne se posait pas tant que le quai était le seul
  // sol ; elle se pose depuis qu'on descend, et rien ne la posait - l'invite
  // « monter à bord » s'affichait au fond d'un couloir souterrain, et le
  // raccourci téléportait sur la dalle.
  if (runtime.playerLevel !== 'platform') return null;
  const open = portalOpen();
  if (open < PORTAL_MIN_OPEN) return null;
  const side = walkFlip();
  const u = side * x;
  // Trop loin latéralement : on ne propose pas de traverser depuis le fond du
  // quai ni depuis l'autre bout du wagon.
  if (u < -AISLE_U || u > currentPlatform().walkX1) return null;
  const carZ = z - runtime.trainZ;
  let best: PortalInfo | null = null;
  let bestDist = maxDist;
  for (const dz of CONFIG.doorCenters) {
    const d = Math.abs(carZ - dz);
    if (d < bestDist) {
      bestDist = d;
      best = { doorZ: dz, worldZ: dz + runtime.trainZ, open };
    }
  }
  return best;
}

/** Abscisse monde d'un point du quai / du wagon, à `u` de l'axe de la voie. */
export function worldXAt(u: number): number {
  return walkFlip() * u;
}

/** Abscisse de marche visée quand on franchit un seuil, dans chaque sens. */
export const STEP_OUT_U = PLATFORM_U0 + 0.55;
export const STEP_IN_U = 0;
export { PSD_X };
