// Le numéro de course d'une rame Yamanote : 「大崎駅発時」+「運用番号」+「G」.
//
// C'est une règle d'HORAIRE, pas de peinture, et c'est pour cela qu'elle vit
// ici et non dans textures/trainExterior où elle a longtemps logé : elle se lit
// en face de data/segments (l'horaire du tronçon) et de data/loop
// (l'arithmétique du sens), et elle se teste sans monter un canvas.
//
// Ce que dit JR East, et que la version précédente ne disait pas :
//
//   • LA PARITÉ EST CELLE DU SENS - 外回り IMPAIR, 内回り PAIR. Le code
//     d'origine appliquait exactement l'inverse, commentaire à l'appui. Deux
//     rames qui se croisaient à quai affichaient donc bien deux parités
//     distinctes, mais chacune celle de l'autre.
//
//   • LE NUMÉRO APPARTIENT À LA RAME, PAS À LA GARE. Il se compose de l'heure à
//     laquelle la rame a quitté Ōsaki - la gare qui divise l'horaire de la
//     boucle - et de son roulement du jour, et il vaut pour TOUT le tour : seule
//     la partie « heure » est réécrite au passage suivant à Ōsaki. L'ancien
//     calcul mêlait l'index de gare aux unités, si bien que la girouette
//     changeait de numéro à chaque arrêt - une rame différente par gare
//     traversée, sous les yeux du joueur resté dans la même.

import { hopsBetween, wrapStation, type LoopDirection } from './loop.ts';
import { headwayMinutesTo } from './segments.ts';

/** Index d'Ōsaki (JY24) dans STATIONS : la gare de référence des horaires. */
export const OSAKI_INDEX = 23;

/** Nombre de roulements du jour. La Yamanote en tient une cinquantaine. */
export const DUTY_COUNT = 52;

/**
 * Roulement de LA rame, tiré une fois par session.
 *
 * Un 運用番号 appartient à un ENGIN pour la journée, pas à un passage : il ne
 * bouge ni d'une gare à l'autre, ni d'un tour au suivant. Il est donc tiré une
 * seule fois, au chargement, comme l'est déjà CONFIG.startIndex - et
 * `serviceNumberFor` accepte qu'on lui en impose un autre, ce dont les tests
 * vivent.
 */
export const SESSION_DUTY = 1 + Math.floor(Math.random() * DUTY_COUNT);

/**
 * Le 運用番号 tel qu'il sort en tenant compte du sens : 外回り impair, 内回り
 * pair. Le décalage d'un cran garde le résultat dans 1…52.
 */
export function dutyForDirection(duty: number, dir: LoopDirection): number {
  const wanted = dir === 'outer' ? 1 : 0;
  if (duty % 2 === wanted) return duty;
  return dir === 'outer' ? duty - 1 : duty + 1;
}

/**
 * Heure (0…23) à laquelle la rame a quitté Ōsaki, remontée sur l'horaire réel
 * des tronçons déjà parcourus.
 *
 * `stationIndex` désigne la gare vers laquelle on roule - zéro saut à Ōsaki
 * même, donc l'heure courante y est la bonne.
 */
export function osakiDepartureHour(
  stationIndex: number,
  clockMin: number,
  dir: LoopDirection,
): number {
  const hops = hopsBetween(OSAKI_INDEX, wrapStation(stationIndex), dir);
  const sinceOsaki = headwayMinutesTo(OSAKI_INDEX, hops, dir);
  const osakiMin = (((clockMin - sinceOsaki) % 1440) + 1440) % 1440;
  return Math.floor(osakiMin / 60);
}

/** Le numéro affiché sur la girouette de face avant, « G » compris. */
export function serviceNumberFor(
  stationIndex: number,
  clockMin: number,
  dir: LoopDirection,
  duty: number = SESSION_DUTY,
): string {
  const n = 100 * osakiDepartureHour(stationIndex, clockMin, dir) + dutyForDirection(duty, dir);
  return `${String(n).padStart(4, '0')}G`;
}
