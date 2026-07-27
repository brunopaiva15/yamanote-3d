// Où le joueur a le droit de poser les pieds.
//
// Il n'y a pas de physique dans ce projet, et il n'en faut pas : le volume
// praticable se décrit très bien en rectangles alignés sur les axes. Ce module
// remplace le clamp d'allée qui enfermait le joueur au milieu du wagon.
//
// Repère de travail : (u, w). `w` est le z du monde. `u` est l'abscisse
// mesurée POSITIVEMENT VERS LE QUAI — c'est-à-dire `doorSide * x`. Ce choix
// fait disparaître le retournement du quai : `u` est exactement l'abscisse
// locale dans laquelle Platform construit sa géométrie, et le wagon, symétrique,
// s'y décrit aussi bien d'un côté que de l'autre.
//
// Le seuil de porte est un « portillon » : un rectangle qui n'existe que si la
// porte de la rame ET la porte palière en face sont réellement dégagées — le
// même prédicat que celui qui laisse entrer le son du quai. Train absent, tous
// les portillons se ferment : on ne peut pas tomber sur la voie.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import {
  PLATFORM_BACK_X,
  PLATFORM_LEN,
  PLATFORM_TOP,
  PSD_X,
} from '../data/stationGeometry';
import { useStore } from '../store';
import { runtime, type PlayerFrame } from './runtime';

/** Demi-largeur de l'allée centrale du wagon (les banquettes commencent après). */
export const AISLE_U = 0.72;
/** Fond de l'alcôve de porte : 8 cm devant la paroi intérieure (x = ±1,4). */
const ALCOVE_U = 1.32;
/** Demi-longueur de l'alcôve, un peu plus large que la baie (2 × 0,66). */
const ALCOVE_HALF_Z = 0.62;
/** Demi-longueur du portillon : on passe droit, pas en biais. */
const PORTAL_HALF_Z = 0.55;
/** Le quai commence juste derrière le liseré blanc (x = 2,02). */
const PLATFORM_U0 = 1.98;
/** Et s'arrête à 15 cm du mur de fond. */
const PLATFORM_U1 = PLATFORM_BACK_X - 0.15;
/** Marge aux deux bouts du quai. */
const PLATFORM_END_MARGIN = 2;
/** Demi-longueur du wagon praticable. */
const CAR_HALF_Z = 9.2;
/** Ouverture minimale (porte rame × porte palière) pour franchir un seuil. */
const PORTAL_MIN_OPEN = 0.55;

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
}

const CAR_REGION: Region = { frame: 'car', y: 0 };
const PLATFORM_REGION: Region = { frame: 'platform', y: PLATFORM_TOP };

// --- Obstacles du quai --------------------------------------------------
// Décrits en repère QUAI (celui de Platform), convertis en `w` à la volée.
// Seul ce qui barre vraiment le passage est listé : les panneaux suspendus et
// l'auvent sont hors d'atteinte.

interface Obstacle {
  u0: number;
  u1: number;
  /** Centre et demi-longueur en z LOCAL quai. */
  z: number;
  halfZ: number;
}

const PLATFORM_OBSTACLES: Obstacle[] = [];

{
  const backX = PLATFORM_BACK_X;
  // Piliers de l'auvent, tous les 10,5 m.
  for (let z = -42; z <= 42; z += 10.5) {
    PLATFORM_OBSTACLES.push({ u0: backX - 0.78, u1: backX - 0.32, z, halfZ: 0.23 });
  }
  // Bancs (avec leur poubelle) adossés au mur de fond.
  for (const z of [-33, -18, -3, 12, 27]) {
    PLATFORM_OBSTACLES.push({ u0: backX - 1.2, u1: backX - 0.4, z, halfZ: 1.35 });
  }
  // Totems d'information.
  for (const z of [-24, 24]) {
    PLATFORM_OBSTACLES.push({ u0: 3.9, u1: 4.4, z, halfZ: 0.25 });
  }
}

// --- Prédicats ----------------------------------------------------------

function portalOpen(): number {
  if (!runtime.trainPresent) return 0;
  return runtime.doorOpen * runtime.psdOpen;
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

function inPortal(u: number, w: number): boolean {
  if (u < ALCOVE_U || u > PLATFORM_U0) return false;
  if (portalOpen() < PORTAL_MIN_OPEN) return false;
  const z = w - runtime.trainZ;
  for (const dz of CONFIG.doorCenters) {
    if (Math.abs(z - dz) <= PORTAL_HALF_Z) return true;
  }
  return false;
}

function inPlatform(u: number, w: number): boolean {
  if (u < PLATFORM_U0 || u > PLATFORM_U1) return false;
  const half = PLATFORM_LEN / 2 - PLATFORM_END_MARGIN;
  const localZ = useStore.getState().doorSide * (w - runtime.platformSlide);
  if (Math.abs(localZ) > half) return false;
  for (const o of PLATFORM_OBSTACLES) {
    if (u >= o.u0 && u <= o.u1 && Math.abs(localZ - o.z) <= o.halfZ) return false;
  }
  return true;
}

function regionAt(u: number, w: number): Region | null {
  if (inCar(u, w)) return CAR_REGION;
  if (inPlatform(u, w)) return PLATFORM_REGION;
  if (inPortal(u, w)) return u < PORTAL_MID_U ? CAR_REGION : PLATFORM_REGION;
  return null;
}

// --- API ----------------------------------------------------------------

/** Repère auquel appartient une position monde, ou null si elle est hors sol. */
export function frameAt(x: number, z: number): PlayerFrame | null {
  const u = useStore.getState().doorSide * x;
  return regionAt(u, z)?.frame ?? null;
}

/** Hauteur du sol sous une position monde (0 dans le wagon, -0,06 sur le quai). */
export function groundY(x: number, z: number): number {
  const u = useStore.getState().doorSide * x;
  if (u > ALCOVE_U && u < PLATFORM_U0) {
    // Dans le seuil : la marche de 6 cm se descend progressivement.
    const t = (u - ALCOVE_U) / (PLATFORM_U0 - ALCOVE_U);
    return THREE.MathUtils.lerp(0, PLATFORM_TOP, t);
  }
  return regionAt(u, z)?.y ?? 0;
}

/**
 * Déplace `pos` (repère MONDE) de (dx, dz) en restant dans le volume
 * praticable, avec glissement le long des obstacles. Mutation en place.
 */
export function resolveMove(pos: THREE.Vector3, dx: number, dz: number): void {
  const side = useStore.getState().doorSide;
  const u = side * pos.x;
  const w = pos.z;
  const nu = u + side * dx;
  const nw = w + dz;

  let outU = nu;
  let outW = nw;
  if (!regionAt(nu, nw)) {
    if (regionAt(nu, w)) outW = w;
    else if (regionAt(u, nw)) outU = u;
    else {
      outU = u;
      outW = w;
    }
  }
  pos.x = side * outU;
  pos.z = outW;
}

/**
 * Ramène une position monde dans le volume praticable — utile après un
 * changement de côté d'ouverture ou de géométrie de gare.
 */
export function snapInside(pos: THREE.Vector3): void {
  const side = useStore.getState().doorSide;
  const u = side * pos.x;
  if (regionAt(u, pos.z)) return;
  pos.x = side * THREE.MathUtils.clamp(u, -AISLE_U, AISLE_U);
  pos.z = THREE.MathUtils.clamp(pos.z - runtime.trainZ, -CAR_HALF_Z, CAR_HALF_Z) + runtime.trainZ;
}

/**
 * Seuil ouvert le plus proche d'une position monde, dans un rayon donné.
 * Sert à l'invite contextuelle du HUD et au raccourci clavier.
 */
export function nearestOpenPortal(x: number, z: number, maxDist = 3.2): PortalInfo | null {
  const open = portalOpen();
  if (open < PORTAL_MIN_OPEN) return null;
  const side = useStore.getState().doorSide;
  const u = side * x;
  // Trop loin latéralement : on ne propose pas de traverser depuis le fond du
  // quai ni depuis l'autre bout du wagon.
  if (u < -AISLE_U || u > PLATFORM_U1) return null;
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
  return useStore.getState().doorSide * u;
}

/** Abscisse de marche visée quand on franchit un seuil, dans chaque sens. */
export const STEP_OUT_U = PLATFORM_U0 + 0.55;
export const STEP_IN_U = 0;
export { PSD_X };
