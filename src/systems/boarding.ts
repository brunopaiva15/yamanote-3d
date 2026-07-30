// Descendre et remonter : la bascule du joueur entre le repère du wagon et
// celui du quai.
//
// Le franchissement lui-même n'est pas scripté - on marche à travers la porte
// ouverte et `walkable` fait basculer le repère. Ce module ne s'occupe que des
// conséquences : état discret pour le HUD, retenue du train, siège libéré,
// téléportation au seuil pour le raccourci clavier et le bouton tactile.

import * as THREE from 'three';
import { useStore } from '../store';
import { runtime } from './runtime';
import { beginPlatformWait, boardableElapsed, endPlatformWait } from './platformWait';
import { resumeDwellAt } from './stationCycle';
import { nearestOpenPortal, STEP_OUT_U, worldXAt } from './walkable';

export function isOnPlatform(): boolean {
  return runtime.playerFrame === 'platform';
}

/**
 * Le joueur vient de poser le pied sur le quai. Le cycle station passe la main
 * à platformWait : le train finira son arrêt et partira sans lui, comme en vrai.
 */
export function alight(): void {
  if (runtime.playerFrame === 'platform') return;
  runtime.playerFrame = 'platform';
  useStore.getState().setOnPlatform(true);
  beginPlatformWait();
}

/**
 * Le joueur vient de remonter dans la rame. Le cycle station reprend le dwell
 * exactement là où l'attente en était : ni mélodie rejouée, ni annonce sautée.
 */
export function board(): void {
  if (runtime.playerFrame === 'car') return;
  const elapsed = boardableElapsed();
  runtime.playerFrame = 'car';
  useStore.getState().setOnPlatform(false);
  endPlatformWait();
  resumeDwellAt(elapsed, useStore.getState().index);
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

// Descendre / remonter depuis la console ou un navigateur piloté, sans avoir à
// marcher jusqu'à une porte : __alight() bascule le référentiel sur le quai et
// démarre l'attente, __board() rend la main au cycle station. Développement
// seulement - c'est la seule façon d'atteindre l'état « debout sur le quai » de
// façon reproductible pour une capture.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.__alight = () => alight();
  w.__board = () => board();
}
