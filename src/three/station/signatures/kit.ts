// Ce que partagent les charpentes signature.
//
// Chaque gare-signature reçoit exactement le même contexte : son gabarit, le
// placement de son quai, et les matériaux de sa palette. À elle de puiser ce
// dont elle a besoin - la travée d'en face pour une halle qui l'enjambe, la
// trame de piliers pour une ferme qui prend appui dessus.

import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { directionBandZs } from '../../../data/stationGeometry';
import type { StationLayout } from '../../../data/stationLayouts';
import { farSideOf, type StationPlacement } from '../../../systems/stationPlacement';
import { matOriented, tiltZ } from '../instancing';
import type { Mats } from '../materials';

export interface SigProps {
  layout: StationLayout;
  place: StationPlacement;
  m: Mats;
}

// La trame des travées vit dans les DONNÉES (data/stationLayouts) : le plan
// d'implantation (SigPlan) y est calculé avec la même formule, et le placement
// comme la signalétique le consultent. Ré-exportée ici pour les charpentes.
export { bays } from '../../../data/stationLayouts';

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
 * Tronçons libres pour un longeron qui court sur l'épine, sous l'auvent.
 *
 * Il s'interrompt au droit de la bande directionnelle, des débouchés d'accès
 * (où pend une plaque et sa suspente) et des gaines d'escalier mécanique qui
 * montent jusqu'à l'auvent : continu, il les transperçait tous. La borne de
 * fin est STRICTE - un intervalle bloqué au-delà d'elle produisait un tronçon
 * inversé, c'est-à-dire une boîte fantôme au milieu du quai.
 */
export function clearSpineSpans(
  z0: number,
  z1: number,
  length: number,
  place: StationPlacement,
): { z0: number; z1: number }[] {
  const blocked = [
    ...directionBandZs(length).map((z) => ({ z0: z - 4.65, z1: z + 4.65 })),
    ...place.accesses.map((a) => ({ z0: a.z - a.halfZ - 2.9, z1: a.z - a.halfZ + 0.7 })),
    ...place.escalators.map((e) => ({ z0: e.z - e.halfZ - 0.4, z1: e.z + e.halfZ + 0.4 })),
  ].sort((a, b) => a.z0 - b.z0);
  const out: { z0: number; z1: number }[] = [];
  let cur = z0;
  for (const b of blocked) {
    if (cur >= z1 || b.z0 >= z1) break;
    if (b.z0 > cur + 2) out.push({ z0: cur, z1: Math.min(b.z0, z1) });
    cur = Math.max(cur, b.z1);
  }
  if (z1 > cur + 2) out.push({ z0: cur, z1 });
  return out;
}

/**
 * Barre tendue entre deux points de la COUPE, à l'abscisse z donnée.
 *
 * Une ferme ne se décrit pas en positions et en angles : elle se décrit par ses
 * nœuds. Diagonales de treillis, montants, branches de colonne - tout ce qui
 * joint deux points d'un même plan de coupe se pose ici, et l'inclinaison s'en
 * déduit au lieu de se recalculer à la main à chaque membrure.
 */
export function member(
  a: [number, number],
  b: [number, number],
  z: number,
  thick: number,
  depth = thick,
): THREE.Matrix4 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return matOriented(
    tiltZ(Math.atan2(dy, dx)),
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    z,
    len,
    thick,
    depth,
  );
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
