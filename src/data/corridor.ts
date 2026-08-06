// Le corridor bâti : les empreintes d'OpenStreetMap posées sur le ruban.
//
// GÉNÉRÉ par `node scripts/geo/build-corridor.mjs` - ne pas éditer à la main.
//
// © les contributeurs OpenStreetMap - https://www.openstreetmap.org/copyright · OpenStreetMap
// Licence ODbL 1.0 · jeu daté du 2026-08-06 · DATA_STATIC
//
// 9223 bâtiments réels bordent la voie entre 12 et 440 m :
// 751 dans la bande du bord de voie (≤ 66 m) et 8472 dans
// l'arrière-pays. 4799 portent une hauteur relevée dans OSM,
// 4424 une hauteur estimée - et `measured` le dit, sujet par sujet.
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
//   DÉCOUPÉ   ce qui empiétait sur la voie. Le carré est centré sur le
//             centroïde du contour, et il déborde autour : un bâtiment dont le
//             centre est à treize mètres de l'axe avec une emprise de quarante
//             en occupait sept DANS la voie, et le train lui rentrait dedans.
//             On ne le déplace pas, on ne le jette pas : on lui retire ce qui
//             empiète. Le bâtiment réel n'est pas sur les rails, et
//             l'intersection de la boîte avec « pas sur la voie » est une borne
//             strictement meilleure que la boîte. `depth` porte la profondeur
//             restante ; quand elle vaut `plate`, rien n'a été retiré.
//   INVENTÉ   rien de géométrique. La teinte de façade, les enseignes, les
//             fenêtres allumées viennent du tissu de quartier
//             (src/data/districts.ts) : aucune source ne les porte, et le
//             drapeau `real` du ruban permet de ne jamais les confondre.
//
// 40 bâtiments d'OpenStreetMap tiennent ENTIÈREMENT dans l'emprise
// ferroviaire et ne sont pas posés ; 85 la mordaient et ont été découpés.
// 31 autres ont une boîte englobante de plus de 120 m : un carré de ce
// côté-là revendique un volume que la source ne porte pas - une marquise de
// quai de quatre cent neuf mètres n'est pas un cube - et ils restent donc dans
// data/geo/footprints.json, où leur contour attend qu'on sache le lire.
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
  /** Côté de la boîte englobante du contour OSM (m) : la longueur le long de la voie. */
  plate: number;
  /**
   * Profondeur en travers de la voie (m), après découpe au gabarit ferroviaire.
   *
   * Vaut `plate` quand la boîte ne mordait pas la voie, c'est-à-dire pour
   * presque tout le monde.
   */
  depth: number;
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
export const CORRIDOR_TOTAL = 9223;
export const CORRIDOR_NEAR = 751;
export const CORRIDOR_FAR = 8472;
export const CORRIDOR_MEASURED = 4799;

/** Écartés faute de place : dans l'emprise ferroviaire, ou hors du ruban. */
export const CORRIDOR_SKIPPED_INSIDE = 40;
export const CORRIDOR_SKIPPED_BEYOND = 15497;

/** Écartés parce qu'un carré de ce côté-là n'aurait rien représenté. */
export const CORRIDOR_SKIPPED_SHAPE = 31;
export const CORRIDOR_PLATE_MAX = 120;

/** Découpés au gabarit ferroviaire : leur boîte mordait la voie. */
export const CORRIDOR_CLIPPED = 85;

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
  depth: r[4] / 10,
  measured: r[5] === 1,
  yaw: r[6] / 1e4,
  osmWay: r[7],
}));
