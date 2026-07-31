/** Part des voyageurs debout qui chutent lors d'un freinage d'urgence. */
export const EMERGENCY_FALL_RATE = 0.2;

/**
 * Tire sans remise les voyageurs qui vont tomber.
 *
 * Le nombre est arrondi au voyageur le plus proche : sur la capacité normale
 * de 30 personnes debout, cela donne exactement 6 chutes. Le mélange partiel
 * évite de favoriser les premières places du pool de rendu.
 */
export function selectEmergencyFallers<T>(
  standing: readonly T[],
  random: () => number = Math.random,
): Set<T> {
  const count = Math.round(standing.length * EMERGENCY_FALL_RATE);
  const shuffled = [...standing];
  for (let i = 0; i < count; i++) {
    const remaining = shuffled.length - i;
    const offset = Math.min(remaining - 1, Math.floor(random() * remaining));
    const picked = i + offset;
    [shuffled[i], shuffled[picked]] = [shuffled[picked], shuffled[i]];
  }
  return new Set(shuffled.slice(0, count));
}
