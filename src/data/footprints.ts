// Empreintes du corridor 0–1 km : contours OSM, hauteurs déclarées.
//
// GÉNÉRÉ par `node scripts/geo/fetch-footprints.mjs` - ne pas éditer à la main.
//
// © les contributeurs OpenStreetMap · OpenStreetMap
// Licence ODbL 1.0 · jeu daté du 2026-08-06 · DATA_STATIC
//
// 24791 bâtiments versionnés (sur 153924 relevés) à moins de 1000 m
// de la voie. Emprise tirée du polygone OSM (`footprintMeasured: true`).
// Détail compact : data/geo/footprints.json ; échantillon runtime ci-dessous.

import sample from './footprints-sample.json' with { type: 'json' };

export interface Footprint {
  id: string;
  x: number;
  z: number;
  height: number;
  /** true = étiquette OSM `height` ; false = levels ou modèle. */
  measured: boolean;
  /** Côté de l'emprise (m), déduit du contour OSM. */
  plate: number;
  footprintMeasured: true;
  distance: number;
  station: number;
}

/** Portée du corridor (m). */
export const FOOTPRINT_REACH = 1000;

export const FOOTPRINTS: readonly Footprint[] = sample as Footprint[];

/** Nombre total versionné dans footprints.json. */
export const FOOTPRINT_TOTAL = 24791;

/** Taille du relevé complet avant plafonnage budgétaire. */
export const FOOTPRINT_SURVEY = 153924;
