// Recoller au monde de l'hôte sans que ça s'entende.
//
// C'est le module le plus délicat du multijoueur, et il tient en une règle.
//
// Chez ce jeu, la machine à états du train PILOTE LE SON. L'annonce d'approche,
// le carillon des portes, la 発車メロディ, l'annonce de fermeture : tout est
// déclenché par `once(clé, condition, fn)` dans systems/stationCycle, c'est-à-dire
// par le franchissement d'un seuil de `runtime.phaseT`. Reculer `phaseT`, ne
// serait-ce que d'une demi-seconde, remet un de ces seuils DEVANT nous - et le
// carillon se rejoue. Deux fois. Dans une rame où l'on n'a rien d'autre à faire
// qu'écouter, c'est la chose la plus visible qu'on puisse casser.
//
// D'où la règle : **on ne rembobine jamais sous un événement déjà tiré.**
// Quand on est en avance sur l'hôte, on ne recule pas - on RALENTIT, et on
// laisse l'hôte nous rattraper. Quand on est en retard, on accélère. Dans les
// deux cas la correction passe par le `dt`, jamais par une affectation.
//
// L'affectation brutale existe quand même (`hard`), parce qu'il faut bien
// entrer dans un salon en marche, mais elle est traitée pour ce qu'elle est :
// une coupure. On y coupe la parole et la mélodie franchement plutôt que de les
// laisser se dédoubler.
//
// Module pur : aucun import de valeur, il se teste sous `node --test`.

import type { Phase } from '../../store';

/** Ce que le client sait de son propre monde. */
export interface CycleState {
  phase: Phase;
  /** Temps écoulé dans la phase (s). */
  phaseT: number;
  index: number;
  stopSequence: number;
}

export type Correction =
  /** Rien à faire : on est d'accord à moins d'un cheveu. */
  | { kind: 'none' }
  /**
   * On module l'horloge locale : `phaseT += dt * rate`. `rate` reste dans
   * [WARP_MIN, WARP_MAX], donc l'écart se résorbe en quelques secondes sans
   * qu'aucune animation ne change de vitesse de façon perceptible.
   */
  | { kind: 'warp'; rate: number }
  /** On repose l'état d'un coup, en réamorçant les événements déjà joués. */
  | { kind: 'hard' };

/**
 * Écart au-delà duquel on renonce à rattraper en douceur (s).
 *
 * Une seconde et demie de retard se rattrape en une quinzaine de secondes à
 * +10 % ; au-delà, il faudrait tenir la correction si longtemps qu'un autre
 * écart serait arrivé entre-temps. Mieux vaut une coupure franche.
 */
export const SOFT_MAX_S = 1.5;

/** En deçà, on ne fait rien : corriger un centième de seconde n'a aucun sens. */
export const DEAD_ZONE_S = 0.03;

/**
 * Bornes de la modulation d'horloge.
 *
 * ±10 % sur le temps du cycle, c'est le train qui roule un cheveu plus vite ou
 * un cheveu moins vite. On ne le voit pas : la vitesse affichée au HUD est
 * arrondie au km/h, le défilement du décor est continu, et les portes sont
 * pilotées par leur propre chronologie. Au-delà, le balancement de caisse
 * commencerait à trahir la manœuvre.
 */
export const WARP_MIN = 0.9;
export const WARP_MAX = 1.1;

/**
 * Constante de temps du rattrapage (s).
 *
 * La correction est proportionnelle à l'écart, donc la convergence est
 * exponentielle : l'écart est divisé par `e` toutes les `CATCH_UP_S` secondes.
 * Avec six secondes, ramener une seconde d'écart sous la zone morte de trente
 * millisecondes demandait `6 × ln(1/0,03)`, soit vingt et une secondes - pendant
 * lesquelles un autre écart serait arrivé, et la correction ne se serait jamais
 * refermée. Trois secondes ramènent ça à une quinzaine, cap de ±10 % compris.
 *
 * Ce n'est pas un réglage de confort : une correction qui ne converge pas
 * s'accumule, et finit par franchir `SOFT_MAX_S` - donc par déclencher la
 * resynchronisation dure, qui elle s'entend. Le rattrapage doux doit gagner sa
 * course, sans quoi il ne sert à rien.
 */
const CATCH_UP_S = 3;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Que faire de l'écart entre notre monde et celui de l'hôte ?
 *
 * @param local ce que nous croyons
 * @param remote ce que l'hôte dit
 * @param lastFiredAt le plus grand `phaseT` auquel un événement a DÉJÀ été tiré
 *   dans la phase courante (systems/stationCycle, `maxFiredT`). C'est le
 *   plancher sous lequel on ne redescend jamais.
 *
 * Le paramètre `lastFiredAt` est la raison d'être de ce module. Sans lui, la
 * règle « ralentir plutôt que reculer » se réduirait à « ne jamais reculer »,
 * ce qui est plus fort que nécessaire : on a parfaitement le droit de reculer
 * dans un intervalle où rien n'a encore sonné.
 */
export function reconcile(
  local: CycleState,
  remote: CycleState,
  lastFiredAt: number,
): Correction {
  // Un changement de gare, de phase ou d'arrêt n'est pas un écart de temps :
  // c'est un autre monde. Aucune modulation d'horloge ne rattrape ça.
  if (local.phase !== remote.phase) return { kind: 'hard' };
  if (local.index !== remote.index) return { kind: 'hard' };
  if (local.stopSequence !== remote.stopSequence) return { kind: 'hard' };

  const delta = remote.phaseT - local.phaseT;
  if (Math.abs(delta) > SOFT_MAX_S) return { kind: 'hard' };
  if (Math.abs(delta) < DEAD_ZONE_S) return { kind: 'none' };

  // On est EN AVANCE : l'hôte est derrière nous, il faut lever le pied.
  //
  // Le ralentissement ne peut pas nous faire redescendre sous un seuil déjà
  // franchi - il ne le peut d'ailleurs jamais, puisque `phaseT` continue
  // d'augmenter, même à 90 %. La garde ci-dessous couvre le cas où l'on serait
  // DÉJÀ sous le dernier seuil tiré, ce qui ne devrait pas arriver mais
  // arriverait à la première resynchronisation mal ordonnée : dans ce cas on ne
  // ralentit pas davantage, on laisse le temps avancer normalement le temps de
  // repasser au-dessus.
  if (delta < 0 && local.phaseT < lastFiredAt) return { kind: 'none' };

  const rate = clamp(1 + delta / CATCH_UP_S, WARP_MIN, WARP_MAX);
  return { kind: 'warp', rate };
}

/**
 * Applique une correction à un pas de temps.
 *
 * Sorti en fonction plutôt que laissé à l'appelant pour une seule raison : il y
 * a deux appelants (three/Engine et systems/audioLoop), et une règle appliquée
 * à deux endroits finit toujours par être appliquée de deux façons.
 */
export function warpDt(dt: number, correction: Correction): number {
  return correction.kind === 'warp' ? dt * correction.rate : dt;
}
