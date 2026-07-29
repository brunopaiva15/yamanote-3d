// La porte qui n'est pas la vôtre.
//
// Le quai compte quarante-quatre baies — onze voitures, quatre portes chacune —
// et la rame les dessert toutes : quand elle est à quai, les quarante-quatre
// vantaux s'écartent ensemble. Mais une seule voiture est modélisée, et c'est
// la seule où l'on puisse monter : `walkable` n'ouvre de portillon qu'au droit
// de CONFIG.doorCenters. Devant les quarante autres baies, la marche s'arrêtait
// au ras du liseré sans que rien ne le dise — porte grande ouverte, mur
// invisible.
//
// Ce module tient le prédicat commun aux deux façons de le dire : la limite
// rouge qui se dresse dans la baie (three/station/Barrier → GateBarrier) et le
// message du HUD (ui/BoardingPrompt). Même géométrie, même seuil — sinon le
// panneau s'allumerait sans phrase, ou l'inverse.
//
// Tout s'y lit en repère QUAI (celui de Platform.tsx, côté +x avant la rotation
// de π), comme runtime.playerPlat*.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { PSD_HALF_GAP, PSD_X } from '../data/stationGeometry';
import { layoutFor } from '../data/stationLayouts';
import { useStore } from '../store';
import { psdLayout } from '../three/station/psdLayout';
import { platformFlip } from './playerFrame';
import { runtime } from './runtime';
import { PORTAL_MIN_OPEN, portalOpen } from './walkable';

/** Écart maximal au droit de la baie, mesuré depuis son jambage (m). */
const REACH_Z = 1.5;
/** Distance maximale au plan des portes palières (m). */
const REACH_U = 1.7;
/**
 * Les vingt centimètres qu'on ne peut pas franchir : la marche du joueur
 * s'arrête à `walkX0 = PSD_X + 0.2`. Sans ce retrait, la limite n'atteindrait
 * jamais sa pleine intensité, même le nez dessus.
 */
const EDGE_GAP = 0.2;
/** Distance à laquelle la limite commence à apparaître (m). */
const FADE_FAR = 1.5;
/** Distance à laquelle elle est à pleine intensité (m). */
const FADE_NEAR = 0.25;
/**
 * Le regard décide. Le joueur longe le bord du quai à vingt centimètres du
 * plan des portes : sans cette condition, une baie sur deux se serait allumée
 * en marchant, tous les cinq mètres sur deux cent vingt. Il faut se TOURNER
 * vers la voie — vers la porte qu'on croit prendre — pour que la limite monte.
 */
const FACING_MIN = 0.3;
const FACING_FULL = 0.72;

/**
 * Les quatre seuls seuils franchissables du quai, en repère quai : les portes
 * de la voiture du joueur.
 *
 * La rame est calée sur la trame du quai (voiture 6 au centre,
 * `carZ(PLAYER_CAR) === 0`, et `trainZ` vaut 0 tant qu'elle est à l'arrêt) et
 * `CONFIG.doorCenters` est symétrique : la rotation de π du quai laisse cet
 * ensemble inchangé. Il ne dépend donc ni du côté d'ouverture ni de la gare.
 */
export const BOARDABLE_GATES: readonly number[] = CONFIG.doorCenters;

/** Cette baie est-elle celle d'un seuil franchissable ? */
export function isBoardableGate(z: number): boolean {
  for (const dz of BOARDABLE_GATES) {
    if (Math.abs(z - dz) < 0.5) return true;
  }
  return false;
}

// La trame ne dépend que de la longueur du quai, et il n'y a qu'un quai à la
// fois : un seul jeu suffit, plutôt qu'un tableau de quarante entrées reconstruit
// soixante fois par seconde.
let cache: { length: number; gates: readonly number[] } | null = null;

/** Axes des baies par lesquelles on ne peut PAS monter, sur un quai de cette longueur. */
export function blockedGates(length: number): readonly number[] {
  if (!cache || cache.length !== length) {
    cache = { length, gates: psdLayout(length).gaps.filter((z) => !isBoardableGate(z)) };
  }
  return cache.gates;
}

export interface WrongDoor {
  /** Axe de la baie visée, repère quai. */
  z: number;
  /** 0 (rien) à 1 (nez contre la limite). */
  strength: number;
}

/**
 * Le joueur cherche-t-il à monter par une porte qui n'est pas la sienne ?
 * Renvoie la baie visée et l'intensité de la limite, ou null s'il n'y a rien à
 * refuser — à bord, portes fermées, loin du bord, ou simplement de passage.
 *
 * La trame est celle du quai PRÉSENT (platformIndex), comme tout ce qui touche
 * au repère quai : au départ, `index` désigne déjà la gare suivante.
 */
export function wrongDoor(): WrongDoor | null {
  // Depuis la rame, il n'y a pas de quai. Portes fermées, la baie est un muret
  // comme un autre et n'a besoin de rien : ce qu'on refuse ici, c'est une porte
  // OUVERTE par laquelle on ne peut pourtant pas passer.
  if (runtime.playerFrame !== 'platform' || runtime.platformFade < 0.5) return null;
  if (portalOpen() < PORTAL_MIN_OPEN) return null;

  const du = runtime.playerPlatX - PSD_X;
  if (du < 0 || du > REACH_U) return null;

  // Regard tourné vers la voie : `u` décroît vers la rame, donc un regard qui
  // va vers elle a une composante locale négative.
  const facing = -platformFlip() * runtime.lookX;
  const f = THREE.MathUtils.clamp(
    (facing - FACING_MIN) / (FACING_FULL - FACING_MIN),
    0,
    1,
  );
  if (f <= 0) return null;

  const pz = runtime.playerPlatZ;
  const length = layoutFor(useStore.getState().platformIndex).length;
  let gate = 0;
  let dz = REACH_Z;
  for (const g of blockedGates(length)) {
    const d = Math.max(0, Math.abs(pz - g) - PSD_HALF_GAP);
    if (d < dz) {
      dz = d;
      gate = g;
    }
  }
  // Les baies sont espacées de cinq mètres et la portée en couvre 2,4 : quand
  // aucune baie refusée n'est à portée, c'est qu'on est devant la sienne.
  if (dz >= REACH_Z) return null;

  const dist = Math.hypot(Math.max(0, du - EDGE_GAP), dz);
  const s = THREE.MathUtils.clamp((FADE_FAR - dist) / (FADE_FAR - FADE_NEAR), 0, 1);
  if (s <= 0) return null;
  return { z: gate, strength: s * s * f };
}
