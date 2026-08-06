// Le corridor bâti : les empreintes d'OpenStreetMap posées sur le ruban.
//
// GÉNÉRÉ par `node scripts/geo/build-corridor.mjs` - ne pas éditer à la main.
//
// © les contributeurs OpenStreetMap - https://www.openstreetmap.org/copyright · OpenStreetMap
// Licence ODbL 1.0 · jeu daté du 2026-08-06 · DATA_STATIC
//
// 9275 bâtiments réels bordent la voie entre 12 et 440 m :
// 759 dans la bande du bord de voie (≤ 66 m) et 8516 dans
// l'arrière-pays. 4839 portent une hauteur relevée dans OSM,
// 4436 une hauteur estimée - et `measured` le dit, sujet par sujet.
//
// CE QUI EST RELEVÉ, ET CE QUI NE L'EST PAS. Il faut le lire avant de croire
// que le ruban est devenu Tokyo :
//
//   RELEVÉ    la position (centroïde du contour, au décimètre), la hauteur
//             quand `measured` vaut vrai, le côté de la boîte englobante du
//             contour, et l'orientation - qui est celle des axes de la
//             projection, donc du nord, et non une trame tirée au sort.
//   SIMPLIFIÉ l'emprise. OpenStreetMap donne un polygone ; `data/geo/footprints.json`
//             n'en a retenu que la boîte englobante, et on pose donc un prisme
//             carré de côté `plate`. C'est du LOD1 : le bâtiment est là, il est
//             haut comme il est haut, mais son plan est une boîte. La règle 4 de
//             la bible demande l'empreinte exacte ; on n'y est pas, et le
//             prétendre serait pire que ne pas y être.
//   INVENTÉ   rien de géométrique. La teinte de façade, les enseignes, les
//             fenêtres allumées viennent du tissu de quartier
//             (src/data/districts.ts) : aucune source ne les porte, et le
//             drapeau `real` du ruban permet de ne jamais les confondre.
//
// 19 bâtiments d'OpenStreetMap tombent à moins de 12 m de l'axe -
// l'emprise ferroviaire - et ne sont pas posés : ils traverseraient le train.
//
// Le repère est celui du relief et de l'eau, et non celui de la carte :
// abscisse de BOUCLE, et décalage latéral compté à gauche du sens des index JY
// croissants. systems/terrain fait la conversion depuis l'odomètre.

import pack from './corridor.json' with { type: 'json' };

/** Un bâtiment réel, tel que la source le porte. */
export interface CorridorBuilding {
  /** Abscisse curviligne sur la polyligne relevée (m). */
  s: number;
  /** Décalage latéral signé (m), positif à gauche des index JY croissants. */
  offset: number;
  /** Hauteur (m). */
  h: number;
  /** Côté de la boîte englobante du contour OSM (m). */
  plate: number;
  /** true = étiquette OSM `height` ; false = niveaux déclarés, ou modèle. */
  measured: boolean;
  /** Orientation dans le plan du ruban (rad), repliée au quart de tour. */
  yaw: number;
  /** Identifiant OSM : de quoi ouvrir la carte et regarder. */
  osmWay: number;
}

/** Bande retenue, en mètres à l'axe : le premier et le dernier rang du ruban. */
export const CORRIDOR_NEAR_MIN = 12;
export const CORRIDOR_NEAR_MAX = 66;
export const CORRIDOR_FAR_MAX = 440;

/** Périmètre de la polyligne (m) : pour replier une abscisse. */
export const CORRIDOR_LOOP_M = 34424.6;

/** Combien de bâtiments réels le ruban a de quoi poser. */
export const CORRIDOR_TOTAL = 9275;
export const CORRIDOR_NEAR = 759;
export const CORRIDOR_FAR = 8516;
export const CORRIDOR_MEASURED = 4839;

/** Écartés faute de place : dans l'emprise ferroviaire, ou hors du ruban. */
export const CORRIDOR_SKIPPED_INSIDE = 19;
export const CORRIDOR_SKIPPED_BEYOND = 15497;

const R = pack.rows as readonly (readonly number[])[];

/**
 * Les bâtiments, RANGÉS PAR ABSCISSE DE BOUCLE.
 *
 * L'ordre est ce qui rend la recherche par tranche possible sans parcourir les
 * neuf mille : `systems/corridor` y entre par dichotomie.
 */
export const CORRIDOR: readonly CorridorBuilding[] = R.map((r) => ({
  s: r[0] / 10,
  offset: r[1] / 10,
  h: r[2] / 10,
  plate: r[3] / 10,
  measured: r[4] === 1,
  yaw: r[5] / 1e4,
  osmWay: r[6],
}));
