// Ce que partagent les charpentes signature.
//
// Chaque gare-signature reçoit exactement le même contexte : son gabarit, le
// placement de son quai, et les matériaux de sa palette. À elle de puiser ce
// dont elle a besoin — la travée d'en face pour une halle qui l'enjambe, la
// trame de piliers pour une ferme qui prend appui dessus.

import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { StationLayout } from '../../../data/stationLayouts';
import { farSideOf, type StationPlacement } from '../../../systems/stationPlacement';
import type { Mats } from '../materials';

export interface SigProps {
  layout: StationLayout;
  place: StationPlacement;
  m: Mats;
}

/** Positions régulières sur la longueur du quai. */
export function bays(length: number, spacing: number, from = -0.5, to = 0.5): number[] {
  const out: number[] = [];
  const z0 = length * from + spacing * 0.4;
  const z1 = length * to - spacing * 0.4;
  for (let z = z0; z <= z1; z += spacing) out.push(z);
  return out;
}

/**
 * Matériaux propres à une charpente, créés une fois et rendus à la sortie.
 * Une halle en bois clair ou un viaduc de brique ne se peignent pas avec la
 * palette générique du quai.
 */
export function useSigMaterials<T extends Record<string, THREE.Material>>(
  make: () => T,
  deps: React.DependencyList,
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mats = useMemo(make, deps);
  useLayoutEffect(() => {
    const all = Object.values(mats);
    return () => {
      for (const x of all) x.dispose();
    };
  }, [mats]);
  return mats;
}

/**
 * Coupe complète du site, du bord près au fond de la travée d'en face. Sur un
 * quai latéral la travée n'existe pas : `oppBackX` retombe alors sur le mur de
 * fond, pour qu'une charpente puisse s'écrire sans distinguer les deux cas.
 */
export function siteCut(place: StationPlacement) {
  const cut = farSideOf(place);
  return {
    outerX: place.farEdgeX ?? place.backX,
    trackX: cut?.trackX ?? null,
    oppEdgeX: cut?.oppEdgeX ?? place.backX,
    oppBackX: cut?.oppBackX ?? place.backX,
  };
}
