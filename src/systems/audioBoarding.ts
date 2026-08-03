// Descendre et remonter, sans corps à déplacer.
//
// Dans l'expérience complète, on ne « descend » pas : on MARCHE à travers une
// porte ouverte, et `systems/walkable` fait basculer le repère quand le pas
// franchit le seuil. Il n'y a ni bouton ni commande, et c'est très bien ainsi -
// la porte ouverte EST le passage.
//
// La version sonore n'a pas de pas à faire faire. Elle a pourtant besoin du
// même geste, et pas pour la forme : descendre sur le quai change TOUT ce qu'on
// entend. La sono de la gare passe en clair au lieu d'arriver par une porte
// entrouverte, la voix de bord devient un lointain, la 発車メロディ sonne
// au-dessus de la tête, le train part sans nous - et surtout, c'est là et
// seulement là que tourne l'attente du prochain train (`systems/platformWait`),
// avec le tableau des départs, les annonces d'approche, et l'avancement des
// perturbations de la ligne : retard annoncé, estimation révisée, reprise du
// trafic. Rien de tout cela ne s'entend depuis un siège, dans aucune des deux
// versions.
//
// Ce module fait donc à la main ce que le pas ferait : il pose le joueur de
// l'autre côté du seuil ouvert le plus proche, publie sa position dans les
// trois repères - c'est elle qui décide quels diffuseurs du quai sont pannés
// autour de l'oreille (systems/stationPa) - et laisse `systems/boarding`
// s'occuper des conséquences, exactement comme pour un pas.

import { setListenerPose } from './audioEngine';
import { alight, board } from './boarding';
import { publishPlayerPose, publishPlayerStance } from './playerFrame';
import { runtime } from './runtime';
import { STEP_IN_U, STEP_OUT_U, nearestOpenPortal, worldXAt } from './walkable';
import { CONFIG } from '../data/config';

/**
 * La place assise, au milieu de la voiture.
 *
 * C'est la pose par défaut du moteur audio, et celle sur laquelle tout le
 * mixage a été calé : la distance aux diffuseurs de plafond, ce que les portes
 * laissent passer, le niveau de la 発車メロディ entendue de l'intérieur. Elle
 * est posée explicitement au démarrage - sans elle, Tone laisserait l'auditeur
 * à l'origine, tourné vers un axe qui n'est pas celui du wagon, et le
 * panoramique de toute la sonorisation serait faux d'un demi-tour.
 */
const SEAT: Readonly<[x: number, z: number]> = [0, 4.2];

export function seatListener(): void {
  publishPlayerStance(SEAT[0], SEAT[1]);
  publishPlayerPose(SEAT[0], CONFIG.eyeHeight, SEAT[1]);
  setListenerPose(SEAT[0], CONFIG.eyeHeight, SEAT[1], 0, 0, -1, 0, 1, 0);
}

/**
 * Y a-t-il un seuil franchissable en ce moment ?
 *
 * La même condition que pour un pas : une porte suffisamment ouverte, à portée.
 * On l'interroge depuis la position d'appui courante, qui est celle d'un
 * voyageur assis au milieu de la voiture tant qu'il n'a pas bougé.
 */
export function canCrossDoorway(): boolean {
  return nearestOpenPortal(runtime.stanceX, runtime.stanceZ) !== null;
}

/**
 * Franchit le seuil ouvert le plus proche, dans le sens où l'on n'est pas.
 * Renvoie false s'il n'y en a aucun à portée - portes fermées, ou rame partie.
 */
export function crossDoorway(): boolean {
  const portal = nearestOpenPortal(runtime.stanceX, runtime.stanceZ);
  if (!portal) return false;
  const goingOut = runtime.playerFrame === 'car';
  const x = worldXAt(goingOut ? STEP_OUT_U : STEP_IN_U);
  const z = portal.worldZ;
  // La bascule de repère AVANT la publication : `publishPlayerPose` convertit
  // la position monde vers les repères wagon et quai, et la conversion vers le
  // quai n'a de sens qu'une fois le repère basculé. Publiée dans l'ordre
  // inverse, la tête se serait retrouvée à l'autre bout du quai le temps d'une
  // image - et le moteur audio lui aurait assigné les mauvais diffuseurs.
  if (goingOut) alight();
  else board();
  if (!goingOut) {
    seatListener();
    return true;
  }
  publishPlayerStance(x, z);
  publishPlayerPose(x, CONFIG.eyeHeight, z);
  // Et l'OREILLE avec le corps. Sans cela l'auditeur restait assis au milieu de
  // la voiture pendant que le joueur se tenait sur le quai : la sono de la gare
  // - dont les diffuseurs sont pannés en repère monde (systems/stationPa) -
  // aurait continué d'arriver de trois mètres au-dessus d'un siège, et le train
  // qui démarre serait parti dans la mauvaise direction.
  //
  // Debout sur le quai, on regarde la VOIE : c'est de là que vient tout ce
  // qu'on attend, le train comme l'annonce de son approche. La rame est à
  // l'abscisse zéro du repère de marche, le joueur au-delà - le regard va donc
  // vers les u décroissants, quel que soit le côté d'ouverture.
  const inward = -Math.sign(worldXAt(1)) || -1;
  setListenerPose(x, CONFIG.eyeHeight, z, inward, 0, 0, 0, 1, 0);
  return true;
}
