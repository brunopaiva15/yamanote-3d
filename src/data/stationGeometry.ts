// Cotes du quai, partagées par le rendu (three/Platform), la marche du joueur
// (systems/walkable) et l'occultation du décor de voie (systems/stationOcclusion).
//
// Repère QUAI : côté +x, avant la rotation de π appliquée quand le côté
// d'ouverture est -1. y = 0 est le plancher du wagon.

/** Sol du quai, 6 cm sous le plancher du wagon. */
export const PLATFORM_TOP = -0.06;

/** Ligne des portes palières = bord de quai. */
export const PSD_X = 1.78;

/** Hauteur des portes palières (mi-hauteur, on voit par-dessus). */
export const PSD_H = 1.32;

/** Demi-largeur d'une baie de porte palière. */
export const PSD_HALF_GAP = 0.9;

/** Largeur d'un vantail de porte palière et sa course d'ouverture. */
export const PSD_LEAF_W = 0.98;
export const PSD_LEAF_TRAVEL = 0.92;

/** Longueur du quai (m). */
export const PLATFORM_LEN = 96;

/** Profondeur du quai : la dalle va de PSD_X à PSD_X + PLATFORM_DEPTH. */
export const PLATFORM_DEPTH = 5.4;

/** Abscisse du mur de fond (nu intérieur) et du milieu de quai. */
export const PLATFORM_BACK_X = PSD_X + PLATFORM_DEPTH - 0.15;
export const PLATFORM_MID_X = PSD_X + PLATFORM_DEPTH * 0.55;

/** Sous-face de l'auvent. */
export const CANOPY_Y = 3.49;
