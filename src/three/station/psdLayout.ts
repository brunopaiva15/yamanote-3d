// Trame des portes palières : une baie en face de chaque porte de chaque
// voiture. Le quai d'une rame de onze voitures compte donc 44 baies.

import { CONFIG } from '../../data/config';
import { E235 } from '../../data/e235';
import { CONSIST } from '../../data/e235';
import { PSD_HALF_GAP } from '../../data/stationGeometry';

export interface PsdLayout {
  /** Murets pleins entre les baies. */
  segs: { z0: number; z1: number }[];
  /** Axe de chaque baie. */
  gaps: number[];
}

/** Axes des baies, calés sur la composition réelle de la rame. */
export function psdGates(): number[] {
  const gates: number[] = [];
  const half = (CONSIST.length - 1) / 2;
  for (let car = 0; car < CONSIST.length; car++) {
    const base = (car - half) * E235.pitch;
    for (const dz of CONFIG.doorCenters) gates.push(base + dz);
  }
  return gates.sort((a, b) => a - b);
}

export function psdLayout(length: number): PsdLayout {
  const half = length / 2;
  const gaps = psdGates().filter((z) => Math.abs(z) < half - PSD_HALF_GAP);
  const segs: { z0: number; z1: number }[] = [];
  let prev = -half;
  for (const gz of gaps) {
    if (gz - PSD_HALF_GAP > prev) segs.push({ z0: prev, z1: gz - PSD_HALF_GAP });
    prev = gz + PSD_HALF_GAP;
  }
  if (prev < half) segs.push({ z0: prev, z1: half });
  return { segs, gaps };
}
