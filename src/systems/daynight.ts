// Cycle jour / nuit calé sur l'heure de Tokyo : trois ambiances (jour,
// heure dorée, nuit) fondues par des poids qui somment à 1.
//
// Les bornes ne sont plus des constantes : elles suivent le LEVER et le
// COUCHER RÉELS du jour de l'année (systems/season). C'était le mensonge le
// plus voyant du décor une fois la saison introduite — un 21 décembre où la
// nuit tombe à 19 h 30, alors qu'à Tokyo il fait nuit noire à 17 h 30, et un
// 21 juin où le jour se lève à 7 h quand le soleil est dehors depuis 4 h 25.
// Deux heures et demie d'écart sur le coucher entre les deux solstices : c'est
// le fait saisonnier le plus fort de tous.
//
// Les décalages ci-dessous se lisent maintenant en crépuscule et non en heures
// d'horloge. Celui de la tombée de nuit a été resserré au passage : à 35° de
// latitude le crépuscule civil dure une petite demi-heure, et l'ancien réglage
// laissait le 21 décembre en pleine heure dorée à 17 h 15 — trois quarts
// d'heure après le coucher du soleil, alors que Tokyo est déjà allumée.

import { seasonNow } from './season';

export interface DayNightWeights {
  day: number;
  golden: number;
  night: number;
}

/** Décalages, en heures, des quatre fondus par rapport au lever / au coucher. */
const NIGHT_TO_GOLD = [-1.1, -0.1];
const GOLD_TO_DAY = [0.4, 1.4];
const DAY_TO_GOLD = [-1.27, -0.27];
const GOLD_TO_NIGHT = [0.35, 1.25];

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function dayNightWeights(hours: number, sunrise?: number, sunset?: number): DayNightWeights {
  const h = ((hours % 24) + 24) % 24;
  const s = sunrise === undefined || sunset === undefined ? seasonNow() : null;
  const rise = sunrise ?? s!.sunriseH;
  const set = sunset ?? s!.sunsetH;
  const nightToGold = smooth(rise + NIGHT_TO_GOLD[0], rise + NIGHT_TO_GOLD[1], h);
  const goldToDay = smooth(rise + GOLD_TO_DAY[0], rise + GOLD_TO_DAY[1], h);
  const dayToGold = smooth(set + DAY_TO_GOLD[0], set + DAY_TO_GOLD[1], h);
  const goldToNight = smooth(set + GOLD_TO_NIGHT[0], set + GOLD_TO_NIGHT[1], h);
  const day = goldToDay * (1 - dayToGold);
  const golden = nightToGold * (1 - goldToDay) + dayToGold * (1 - goldToNight);
  const night = 1 - nightToGold + goldToNight;
  return { day, golden, night };
}
