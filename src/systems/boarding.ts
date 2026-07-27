// Descendre et remonter : la bascule du joueur entre le repère du wagon et
// celui du quai.
//
// Le franchissement lui-même n'est pas scripté — on marche à travers la porte
// ouverte et `walkable` fait basculer le repère. Ce module ne s'occupe que des
// conséquences : état discret pour le HUD, retenue du train, siège libéré,
// téléportation au seuil pour le raccourci clavier et le bouton tactile.

import * as THREE from 'three';
import { useStore } from '../store';
import { runtime } from './runtime';
import { setDepartureBlockers } from './departureSequence';
import { nearestOpenPortal, STEP_OUT_U, worldXAt } from './walkable';

/**
 * Tant que la machine à états de l'attente n'existe pas, le train ne part pas
 * sans le joueur : on le retient à quai. `holdTrainForPlayer` sera basculé à
 * false par platformWait, qui prendra le relais.
 */
export const boarding = {
  holdTrainForPlayer: true,
};

export function isOnPlatform(): boolean {
  return runtime.playerFrame === 'platform';
}

/** Le joueur vient de poser le pied sur le quai. */
export function alight(): void {
  if (runtime.playerFrame === 'platform') return;
  runtime.playerFrame = 'platform';
  useStore.getState().setOnPlatform(true);
  if (boarding.holdTrainForPlayer) setDepartureBlockers({ heldAtStation: true });
}

/** Le joueur vient de remonter dans la rame. */
export function board(): void {
  if (runtime.playerFrame === 'car') return;
  runtime.playerFrame = 'car';
  useStore.getState().setOnPlatform(false);
  if (boarding.holdTrainForPlayer) setDepartureBlockers({ heldAtStation: false });
}

/**
 * Raccourci « descendre / monter » : place le joueur de l'autre côté du seuil
 * ouvert le plus proche. Renvoie false s'il n'y en a pas à portée.
 */
export function crossNearestPortal(pos: THREE.Vector3): boolean {
  const portal = nearestOpenPortal(pos.x, pos.z);
  if (!portal) return false;
  const goingOut = runtime.playerFrame === 'car';
  pos.x = worldXAt(goingOut ? STEP_OUT_U : 0);
  pos.z = portal.worldZ;
  if (goingOut) alight();
  else board();
  return true;
}
