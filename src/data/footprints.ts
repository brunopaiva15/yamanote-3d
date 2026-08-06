// Empreintes du corridor 0–1 km : contours OSM, hauteurs déclarées.
//
// GÉNÉRÉ par `node scripts/geo/fetch-footprints.mjs` - ne pas éditer à la main.
//
// © les contributeurs OpenStreetMap · OpenStreetMap
// Licence ODbL 1.0 · jeu daté du 2026-08-06 · DATA_STATIC
//
// 24791 bâtiments versionnés (sur 153924 relevés) à moins de 1000 m
// de la voie. Emprise tirée du polygone OSM (`footprintMeasured: true`).
// Hauteur relevée pour 14029 d'entre eux, estimée pour 10762.
//
// CE MODULE NE PORTE QUE DES COMPTEURS, et c'est volontaire. Le détail vit dans
// data/geo/footprints.json, qui n'est pas empaqueté ; ce que le jeu DESSINE
// vient de src/data/corridor.ts, où `scripts/geo/build-corridor.mjs` a projeté
// ces mêmes empreintes sur la boucle. Les chiffres ci-dessous servent à dire
// l'écart entre ce qui a été relevé, ce qui a été versionné et ce qui est posé -
// c'est la sonde `__probeBible()` qui les rapproche.

/** Portée du corridor (m). */
export const FOOTPRINT_REACH = 1000;

/** Nombre total versionné dans footprints.json. */
export const FOOTPRINT_TOTAL = 24791;

/** Taille du relevé complet avant plafonnage budgétaire. */
export const FOOTPRINT_SURVEY = 153924;

/** Hauteurs venues d'une étiquette OSM, et hauteurs estimées. */
export const FOOTPRINT_MEASURED = 14029;
export const FOOTPRINT_ESTIMATED = 10762;
