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

// --- La travée d'en face ------------------------------------------------
//
// Vingt-neuf gares sur trente sont des îlots : au-delà du second bord
// d'embarquement il y a une voie, puis un autre quai. Ces trois cotes en
// décrivent la coupe, et servent au rendu du fond de quai comme aux charpentes
// signature qui l'enjambent.

/** De l'axe d'une voie au bord du quai qu'elle dessert. */
export const TRACK_HALF = PSD_X;
/** Demi-écartement des rails (1 435 mm), ramené au repère du jeu. */
export const GAUGE_HALF = 0.7175;
/** Profondeur du quai d'en face : on n'en voit que la tranche. */
export const OPP_DEPTH = 4.2;

/** Profondeur du quai : la dalle va de PSD_X à PSD_X + PLATFORM_DEPTH. */
export const PLATFORM_DEPTH = 5.4;

/** Abscisse du mur de fond (nu intérieur) et du milieu de quai. */
export const PLATFORM_BACK_X = PSD_X + PLATFORM_DEPTH - 0.15;
export const PLATFORM_MID_X = PSD_X + PLATFORM_DEPTH * 0.55;

/** Sous-face de l'auvent. */
export const CANOPY_Y = 3.49;

/** Épaisseur de la dalle du quai (percée au droit des trémies d'escalier). */
export const SLAB_H = 0.44;

// --- Emprises des accès (demi-longueurs le long de la voie) --------------
//
// Partagées entre le placement (systems/stationPlacement), qui pose les
// emprises de collision, et les gabarits (data/stationLayouts), qui écartent
// les charpentes signature de ces mêmes accès. Deux valeurs divergentes, et
// un portique se plante dans un escalier mécanique.

export const STAIR_HALF_Z = 2.6;
export const ESCALATOR_HALF_Z = 2.8;
export const ELEVATOR_HALF_Z = 0.95;

/**
 * Abscisses des trois tronçons de la bande directionnelle verte, suspendue
 * au-dessus de l'épine (voir PlatformSignage). Chacun fait 8,2 m : les
 * charpentes signature qui portent des poteaux sur l'épine doivent l'enjamber.
 */
export function directionBandZs(length: number): number[] {
  const halfZ = length / 2;
  return [-halfZ + 31, -halfZ + 109, -halfZ + 161];
}

// --- Trémies d'escalier -------------------------------------------------
//
// La dalle est réellement percée : on descend la volée sur quelques marches,
// puis une limite de zone barre le passage (three/station/Barrier). Ces cotes
// sont partagées par le rendu (Station), la marche du joueur (walkable) et les
// voyageurs qui quittent le quai (platformCrowd) — trois consommateurs qui
// doivent voir exactement le même escalier.

/** Contremarche et giron d'une marche. */
export const STAIR_RISE = 0.17;
export const STAIR_GOING = 0.34;
/** Marches modélisées, jusqu'au palier intermédiaire hors de vue. */
export const STAIR_STEPS = 12;
/** Marches réellement descendables avant la limite de zone. */
export const STAIR_WALK_STEPS = 5;
/**
 * Longueur praticable de la volée, mesurée depuis le nez du quai : le premier
 * giron est la dalle elle-même, la limite tombe donc au nez de la marche qui
 * suit la dernière descendable — le joueur s'arrête PIEDS SUR une marche.
 */
export const STAIR_WALK_LEN = (STAIR_WALK_STEPS + 1) * STAIR_GOING;
/** Demi-largeur praticable, entre les garde-corps. */
export const STAIR_WALK_HALF_X = 1.12;
/** Retrait de l'ouverture par rapport à l'emprise de collision de la trémie. */
export const STAIR_OPENING_INSET = 0.18;
/** Profondeur de la gaine sous la dalle. */
export const STAIR_SHAFT_DEPTH = 3.4;
