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

/**
 * Montant de rive d'un vantail : le joint sombre de son bord de fermeture.
 * Sans lui, les deux vantaux fermés d'un même portique — même blanc, même
 * plan — se lisent comme un seul panneau de deux mètres.
 */
export const PSD_LEAF_JOINT_W = 0.04;

/**
 * Retrait du vantail derrière son montant de rive.
 *
 * Le montant était calé PILE sur le chant du vantail : les deux boîtes se
 * terminaient dans le même plan, et ces deux faces confondues se disputaient le
 * tampon de profondeur. Portique ouvert, le bout du vantail — la seule partie
 * qui dépasse encore du muret — clignotait entre blanc et gris sombre. Le
 * vantail rentre donc de quatre millimètres et c'est le montant qui coiffe la
 * rive, comme le joint caoutchouc d'une vraie ホームドア.
 */
export const PSD_LEAF_TIP_INSET = 0.004;

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

/**
 * Poteaux de charpente qui portent une plaque de nom de gare (柱型駅名標), un
 * sur deux.
 *
 * La face d'un poteau tournée vers la voie ne porte QU'UNE chose : la plaque de
 * nom, ou le bandeau publicitaire vertical. Les deux la revendiquaient — les
 * bandeaux étaient posés sur tous les poteaux — et la plaque se plaquait sur
 * l'affiche. PlatformSignage lit cette liste pour poser ses plaques,
 * PlatformAds pour s'en écarter : c'est le même arbitrage, lu au même endroit.
 */
export function nameplateColumns(columns: readonly number[]): number[] {
  return columns.filter((_, i) => i % 2 === 1);
}

// --- Trémies d'escalier -------------------------------------------------
//
// La dalle est réellement percée : la volée s'enfonce sous le quai vers la
// salle des billets. On s'y engage sur quelques marches, puis une limite de
// zone (three/station/Barrier) barre le passage.
//
// Ces cotes ont QUATRE consommateurs — le rendu (three/station/Stairwell), le
// percement de la dalle (three/station/Station), la marche du joueur
// (systems/walkable) et les voyageurs qui quittent le quai
// (systems/platformCrowd) — et il n'existe pas de vue d'ensemble où l'on
// verrait qu'ils ont divergé : le joueur descend une volée qu'il ne voit pas,
// et regarde une volée sur laquelle il ne marche pas. Tout est donc ici, y
// compris le profil, écrit une fois en fonctions.
//
// REPÈRE LOCAL d'une trémie : origine au centre de son emprise, y = 0 au sol
// du quai (PLATFORM_TOP). La volée descend vers +z ; l'entrée est donc côté
// −z, dégagée. `t` est la distance parcourue depuis le NEZ de l'emprise
// (z = −STAIR_HALF_Z) et c'est la seule abscisse dont tout le monde se sert.
//
// PROFIL. Le premier giron est la dalle elle-même : on marche encore sur le
// quai jusqu'à t = STAIR_GOING, et c'est là que tombe la première
// contremarche. La marche k (k ≥ 1) a donc son nez en t = k·STAIR_GOING, son
// giron court jusqu'en t = (k+1)·STAIR_GOING, et sa cote est −k·STAIR_RISE.
//
// La pente et le nombre de marches ne sont pas choisis pour eux-mêmes : ils
// sont ce qu'il faut pour DÉGAGER LA HAUTEUR SOUS LINTEAU. La volée passe sous
// la dalle du quai, dont la sous-face est à quarante-quatre centimètres ; pour
// qu'un homme passe dessous, il faut être descendu de deux mètres soixante
// avant d'y arriver, et il n'y a pour cela que cinq mètres d'emprise. À 17/34
// on n'y descendait que de deux mètres quatre : un mètre cinquante-quatre de
// hauteur libre, un boyau. Quinze marches de 17,5 sur 31 tiennent dans la même
// emprise et donnent 2,15 m — la cote réglementaire d'un passage de gare.

/** Contremarche et giron : 29,4°, la pente d'une volée de quai JR. */
export const STAIR_RISE = 0.175;
export const STAIR_GOING = 0.31;

/** Emprise de la trémie en travers du quai ; sa demi-longueur est ci-dessus. */
export const STAIR_HALF_X = 1.5;

/** Marches modélisées, de la première contremarche au linteau. */
export const STAIR_STEPS = 15;

/**
 * GABARIT INTÉRIEUR : nu des joues et du voile de tête.
 *
 * Les voiles ne s'arrêtent pas au chant du percement, ils le COIFFENT de
 * STAIR_LAP. À nu commun, le chant de la dalle et le nu de la joue étaient
 * deux faces exactement coplanaires sur les quarante-quatre centimètres
 * d'épaisseur de la dalle : elles se disputaient le tampon de profondeur, et
 * la trémie était bordée d'un liseré clignotant sur tout son pourtour.
 */
export const STAIR_CLEAR_HALF_X = 1.32;
export const STAIR_CLEAR_Z1 = 2.42;
export const STAIR_LAP = 0.02;

/** Percement de la dalle, en repère local de la trémie. */
export const STAIR_OPENING_HALF_X = STAIR_CLEAR_HALF_X + STAIR_LAP;
export const STAIR_OPENING_Z0 = -STAIR_HALF_Z + STAIR_GOING;
export const STAIR_OPENING_Z1 = STAIR_CLEAR_Z1 + STAIR_LAP;

/** Pied de la volée haute, et sous-face du bloc plein qui la porte. */
export const STAIR_LANDING_Y = -STAIR_STEPS * STAIR_RISE;
export const STAIR_SOFFIT_Y = STAIR_LANDING_Y - 0.3;

/** Garde-corps au-dessus de la dalle, et main courante au-dessus des nez. */
export const STAIR_PARAPET_H = 1.05;
export const STAIR_HANDRAIL_H = 0.88;

// --- Le niveau inférieur -------------------------------------------------
//
// La volée ne s'arrête pas sur un mur : elle atteint un palier de mi-étage,
// repart SOUS LA DALLE et débouche dans un couloir de correspondance. Rien de
// tout cela n'est praticable — le joueur est arrêté cinq marches plus haut —
// mais c'est ce qu'on aperçoit au fond de la trémie qui dit qu'il y a une gare
// en dessous, et pas un puits de deux mètres fermé par une cloison.
//
// Le volume est disponible depuis que les nappes du niveau du sol se dérobent
// sous le quai (systems/stationOcclusion, three/groundStrip) : entre la
// sous-face de la dalle et le vide, il n'y a plus rien à traverser.
//
// Ce qu'on en voit est étroitement borné : depuis le haut de la volée, le
// rayon rasant passe par la sous-face du linteau, et tout ce qui est au-dessus
// de lui est coupé par la dalle. À neuf mètres, il ne reste qu'un demi-mètre
// au-dessus du sol. Tout ce qui doit se lire — la seconde volée, la ligne de
// portillons — se tient donc BAS et PRÈS.

/**
 * Sous-face du linteau : au-delà, on passe sous la dalle du quai. Quatre
 * centimètres de retombée sous la dalle, pas plus — chacun est pris sur la
 * hauteur libre du passage, et il n'y en a que juste assez.
 */
export const STAIR_LINTEL_Y = -0.48;
/** Hauteur libre sous le linteau : ce que tout le profil sert à dégager. */
export const STAIR_HEADROOM = STAIR_LINTEL_Y - STAIR_LANDING_Y;
/** Marches de la seconde volée, sous la dalle. */
export const STAIR_LOWER_STEPS = 6;
/** Sol du couloir inférieur. */
export const STAIR_LOWER_Y = STAIR_LANDING_Y - STAIR_LOWER_STEPS * STAIR_RISE;
/** Premier nez de la seconde volée : au nu du linteau, sans palier dessous. */
export const STAIR_LOWER_Z0 = STAIR_CLEAR_Z1;
/** Pied de la seconde volée. */
export const STAIR_LOWER_Z1 = STAIR_LOWER_Z0 + (STAIR_LOWER_STEPS + 1) * STAIR_GOING;
/** Fond du couloir. Au-delà, la dalle coupe la vue : inutile de modéliser. */
export const STAIR_LOWER_END = 8.8;
/** Demi-largeur libre du couloir : celle de la volée, prolongée telle quelle. */
export const STAIR_LOWER_HALF_X = STAIR_CLEAR_HALF_X;
/** Plafond du couloir, six centimètres sous la sous-face de la dalle. */
export const STAIR_LOWER_CEIL_Y = STAIR_LINTEL_Y;

// --- Ce que le joueur et la foule en font --------------------------------

/** Marches réellement descendables avant la limite de zone. */
export const STAIR_WALK_STEPS = 5;
/** Altitude à laquelle la descente du joueur s'arrête. */
export const STAIR_WALK_Y = -STAIR_WALK_STEPS * STAIR_RISE;
/**
 * Longueur praticable, mesurée depuis le nez de l'emprise. On s'arrête DEBOUT
 * SUR la cinquième marche, deux centimètres avant le nez de la sixième : pile
 * sur cette arête, la borne tombait dans l'intervalle ouvert de la marche
 * suivante et le sol praticable sautait d'une contremarche entière.
 */
export const STAIR_WALK_LEN = (STAIR_WALK_STEPS + 1) * STAIR_GOING - 0.02;
/** Demi-largeur praticable, entre les joues. */
export const STAIR_WALK_HALF_X = 1.12;
/**
 * Ce que descendent les voyageurs qui s'en vont : la volée entière, PUIS un
 * mètre de plus sous le linteau. C'est seulement là qu'ils cessent d'être vus
 * du quai — au pied des marches, la tête dépasse encore du rayon rasant.
 */
export const STAIR_FULL_LEN = (STAIR_STEPS + 1) * STAIR_GOING + 1.05;
/** Et jusqu'où ils s'enfoncent : trois marches de la seconde volée. */
export const STAIR_FULL_STEPS = STAIR_STEPS + 3;

// --- Le profil, écrit une fois -------------------------------------------

/**
 * Ligne des NEZ de marche : altitude de l'arête de giron en `t`. C'est la
 * droite sur laquelle se cale tout ce qui suit la pente — main courante,
 * bandeau lumineux, affiches de joue.
 */
export function stairPitchY(t: number): number {
  return -t * (STAIR_RISE / STAIR_GOING);
}

/**
 * Altitude du sol sous les pieds de qui descend, en `t` du nez de l'emprise.
 *
 * Ce n'est délibérément PAS un profil en marches d'escalier : c'est la ligne
 * des nez relevée d'une demi-contremarche, qui passe donc exactement par le
 * MILIEU de chaque giron. Un sol en escalier faisait tomber le marcheur de
 * dix-sept centimètres tous les trente-quatre — quatre chutes par seconde au
 * pas de promenade, pour le joueur comme pour les voyageurs, dont l'altitude
 * n'est lissée nulle part. L'écart au giron réel ne dépasse jamais la
 * demi-contremarche, soit huit centimètres et demi, et il ne se voit pas.
 *
 * `maxSteps` borne la descente : le joueur s'arrête à la limite de zone
 * (STAIR_WALK_STEPS), les voyageurs vont jusqu'au palier (STAIR_STEPS).
 */
export function stairFloorY(t: number, maxSteps = STAIR_STEPS): number {
  const steps = Math.min(maxSteps, Math.max(0, t / STAIR_GOING - 0.5));
  return -steps * STAIR_RISE;
}
