// Conversions entre les trois repères du jeu.
//
// Tant que le joueur est à bord, le train est fixe à l'origine et c'est le
// monde qui défile : repère MONDE ≡ repère WAGON, et le quai est un groupe qui
// glisse (runtime.platformSlide) et se retourne selon le côté d'ouverture.
//
// Dès que le joueur descend, on inverse : la gare est épinglée à l'origine
// (platformSlide = 0, runtime.distance gelé, donc tout le décor reste calé sur
// la gare) et c'est la rame qui glisse (runtime.trainZ). Les deux repères
// divergent alors, d'où ce module.
//
// Repère QUAI : celui dans lequel Platform.tsx construit sa géométrie, côté
// +x, avant la rotation de π appliquée quand doorSide === -1.

import { DOOR_SIDE } from '../data/stations';
import { useStore } from '../store';
import { runtime } from './runtime';

export type { PlayerFrame } from './runtime';

/** Sol du quai, 6 cm sous le plancher du wagon. Partagé par le rendu et la marche. */
export const PLATFORM_TOP = -0.06;

// --- Repère wagon <-> monde ---------------------------------------------
// Le wagon ne translate qu'en z (runtime.trainZ).

export function carToWorldZ(z: number): number {
  return z + runtime.trainZ;
}

export function worldToCarZ(z: number): number {
  return z - runtime.trainZ;
}

// --- Repère quai <-> monde ----------------------------------------------
// rotation.y = π quand le quai s'ouvre côté -1 : (x, z) → (-x, -z). La
// translation platformSlide, elle, est posée dans le repère parent (donc en
// monde). Le côté est celui du quai PRÉSENT (platformIndex) — store.doorSide
// bascule vers la gare suivante en début de croisière, alors que ce quai-ci
// défile encore et que sa foule vit toujours dans son repère.

/**
 * Sens du quai présent : 1 s'il s'ouvre côté +x, -1 s'il est retourné. Exporté
 * parce qu'une DIRECTION (le regard, par exemple) se ramène au repère quai par
 * ce seul facteur, sans passer par une conversion de point.
 */
export function platformFlip(): 1 | -1 {
  return DOOR_SIDE[useStore.getState().platformIndex];
}

export function platformToWorld(x: number, z: number, out: { x: number; z: number }): void {
  const flip = platformFlip();
  out.x = x * flip;
  out.z = z * flip + runtime.platformSlide;
}

export function worldToPlatform(x: number, z: number, out: { x: number; z: number }): void {
  const flip = platformFlip();
  out.x = x * flip;
  out.z = (z - runtime.platformSlide) * flip;
}

// --- Publication des positions du joueur --------------------------------

const tmp = { x: 0, z: 0 };

/**
 * Publie la position du joueur dans les trois repères. `playerX/Y/Z` reste le
 * monde (contrat historique) ; les PNJ du wagon lisent `playerCar*`, ceux du
 * quai `playerPlat*`.
 */
export function publishPlayerPose(worldX: number, worldY: number, worldZ: number): void {
  runtime.playerX = worldX;
  runtime.playerY = worldY;
  runtime.playerZ = worldZ;

  runtime.playerCarX = worldX;
  runtime.playerCarY = worldY;
  runtime.playerCarZ = worldToCarZ(worldZ);

  worldToPlatform(worldX, worldZ, tmp);
  runtime.playerPlatX = tmp.x;
  runtime.playerPlatY = worldY;
  runtime.playerPlatZ = tmp.z;
}

/**
 * Publie la position d'APPUI : celle de la marche, avant que le balancement de
 * la caisse ne soit ajouté à la caméra. Tout ce qui relève de la géométrie du
 * volume praticable — au premier chef le seuil de porte (systems/walkable) —
 * se décide là-dessus et non sur l'œil, qui oscille.
 */
export function publishPlayerStance(worldX: number, worldZ: number): void {
  runtime.stanceX = worldX;
  runtime.stanceZ = worldZ;
}

/** Direction du regard (unitaire, repère monde) : qui le joueur a en face. */
export function publishPlayerLook(x: number, y: number, z: number): void {
  runtime.lookX = x;
  runtime.lookY = y;
  runtime.lookZ = z;
}
