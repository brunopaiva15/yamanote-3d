// Cycle jour / nuit calé sur l'heure de Tokyo : trois ambiances (jour,
// heure dorée, nuit) fondues par des poids qui somment à 1.
// Aube : nuit → doré 4h30-5h30, doré → jour 6h-7h.
// Soir : jour → doré 16h30-17h30, doré → nuit 18h30-19h30.

export interface DayNightWeights {
  day: number;
  golden: number;
  night: number;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function dayNightWeights(hours: number): DayNightWeights {
  const h = ((hours % 24) + 24) % 24;
  const nightToGold = smooth(4.5, 5.5, h);
  const goldToDay = smooth(6, 7, h);
  const dayToGold = smooth(16.5, 17.5, h);
  const goldToNight = smooth(18.5, 19.5, h);
  const day = goldToDay * (1 - dayToGold);
  const golden = nightToGold * (1 - goldToDay) + dayToGold * (1 - goldToNight);
  const night = 1 - nightToGold + goldToNight;
  return { day, golden, night };
}
