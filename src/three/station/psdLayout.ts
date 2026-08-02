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

/** Un tronçon de muret, entre deux baies ou entre une baie et le bout du quai. */
export interface PsdSpan {
  z0: number;
  z1: number;
}

// --- Ce que dit la plaque d'une baie -------------------------------------

export interface GateLabel {
  /** Numéro de voiture porté par la plaque (1 à 11). */
  car: number;
  /** Rang de la porte dans la voiture (1 à 4). */
  door: number;
}

/**
 * La plaque 「N号車 M番ドア」 d'une baie, déduite de sa position sur le quai.
 *
 * Le quai est bâti sur la trame de la rame : une baie tombe forcément en face
 * d'une porte, et il suffit donc de dire LAQUELLE. La numérotation est celle
 * des repères peints au sol (systems/stationPlacement) - voiture 1 au bout
 * -z, voiture 11 au bout +z, et les quatre portes numérotées dans le même
 * sens. Une plaque qui compterait à l'envers de la peinture qu'on a sous les
 * pieds se verrait tout de suite.
 */
export function gateLabel(z: number): GateLabel {
  const half = (CONSIST.length - 1) / 2;
  const k = Math.min(CONSIST.length - 1, Math.max(0, Math.round(z / E235.pitch) + half));
  const dz = z - (k - half) * E235.pitch;
  let door = 0;
  for (let i = 1; i < CONFIG.doorCenters.length; i++) {
    if (Math.abs(dz - CONFIG.doorCenters[i]) < Math.abs(dz - CONFIG.doorCenters[door])) door = i;
  }
  return { car: CONSIST[k].no, door: door + 1 };
}
