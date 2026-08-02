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
 * Épaisseur d'un vantail - et le fait qu'il coulisse DANS le muret.
 *
 * Il glissait à `PSD_X + 0,08`, six centimètres en avant de la face du quai :
 * une poche n'avalait donc pas son vantail, elle le laissait raser le mur, et
 * tout ce qui se visse sur cette face - plaque de baie, affiche, arrêt
 * d'urgence - devait fuir au milieu du tronçon pour ne pas être traversé deux
 * fois par arrêt. Le vitrage, lui, n'avait plus que le haut du panneau, et le
 * muret se retrouvait avec une lucarne au lieu d'une vitre.
 *
 * Le vantail est donc à mi-épaisseur du muret, un centimètre et demi de jeu de
 * chaque côté : une fois rentré, il est enfermé dans sa poche, et la face du
 * quai est libre sur toute sa longueur.
 */
export const PSD_LEAF_T = 0.07;

/**
 * Montant de rive d'un vantail : le joint sombre de son bord de fermeture.
 * Sans lui, les deux vantaux fermés d'un même portique - même blanc, même
 * plan - se lisent comme un seul panneau de deux mètres.
 */
export const PSD_LEAF_JOINT_W = 0.04;

/**
 * Retrait du vantail derrière son montant de rive.
 *
 * Le montant était calé PILE sur le chant du vantail : les deux boîtes se
 * terminaient dans le même plan, et ces deux faces confondues se disputaient le
 * tampon de profondeur. Portique ouvert, le bout du vantail - la seule partie
 * qui dépasse encore du muret - clignotait entre blanc et gris sombre. Le
 * vantail rentre donc de quatre millimètres et c'est le montant qui coiffe la
 * rive, comme le joint caoutchouc d'une vraie ホームドア.
 */
export const PSD_LEAF_TIP_INSET = 0.004;

// --- Le muret, et ce que le vantail fait dedans -----------------------
//
// Le muret entre deux baies est PLEIN, de la dalle au bandeau : c'est un
// caisson blanc, pas une menuiserie. Ce qui est vitré, ce sont les VANTAUX -
// et c'est par eux qu'on voit la rame, sa livrée verte et les gens debout
// derrière une porte fermée.
//
// Le vantail, lui, coulisse dans l'épaisseur de ce caisson. Ce n'est pas un
// détail de rendu : c'est ce qui rend la face du quai disponible sur toute sa
// longueur, et donc ce qui permet d'y coller la plaque de baie sans qu'une
// porte la traverse deux fois par arrêt.

/**
 * Longueur de muret qu'il faut pour avaler un vantail grand ouvert, mesurée
 * depuis le chant de la baie : sa largeur, sa course, son retrait, moins la
 * demi-baie déjà comptée - plus cinq centimètres de garde.
 */
export const PSD_POCKET_LEN = PSD_LEAF_W + PSD_LEAF_TRAVEL + PSD_LEAF_TIP_INSET - PSD_HALF_GAP + 0.05;

/** Épaisseur du muret. Le vantail passe dedans, à mi-bois. */
export const PSD_WALL_T = 0.1;

/**
 * Les trois épaisseurs du portique, et pourquoi elles sont ÉTAGÉES.
 *
 * Le joint de rive doit dépasser du muret pour se lire au jambage quand la
 * porte est rentrée, et le bandeau doit coiffer les deux - c'est un profil de
 * couronnement, il déborde de ce qu'il couronne. Mais il y a plus contraignant
 * que le dessin : porte ouverte, le joint remonte SOUS le bandeau, et leurs
 * deux nus se retrouvent au même endroit. À égalité d'épaisseur, ces deux
 * faces se disputent le tampon de profondeur - une plaque noire et une plaque
 * verte qui clignotent l'une dans l'autre, aux quarante baies du quai, à
 * chaque arrêt. D'où cinq millimètres d'écart franc à chaque cran.
 *
 * Cinq millimètres tiennent jusqu'à une trentaine de mètres avec la profondeur
 * de ce rendu (proche à 5 cm) ; au-delà, le joint ne fait plus un pixel.
 */
export const PSD_JOINT_T = PSD_WALL_T + 0.01;
export const PSD_BAND_T = PSD_JOINT_T + 0.02;

/** Face du muret côté quai : c'est là que se colle ce qu'on lit dessus. */
export const PSD_FACE_X = PSD_X + PSD_WALL_T / 2;

/**
 * Où sonnent les avertisseurs d'une baie palière : sur le BANDEAU du portique,
 * à son arête haute, côté quai.
 *
 * Les deux signaux des baies - l'ouverture (data/psdOpenChime) et la fermeture
 * (data/psdCloseWarning) - ne sortent PAS de la sono suspendue à l'auvent :
 * celle-là est à quatre mètres au-dessus de la tête et couvre le quai entier.
 * Ils sortent d'un haut-parleur gros comme la main, vissé sur la baie
 * elle-même, et c'est ce qui fait qu'on sait quelle porte bouge : on l'entend
 * DEVANT, pas au-dessus.
 *
 * Les deux cotes se déduisent du bandeau plutôt que d'être posées à la main :
 * c'est le profil qui couronne le muret (three/station/Station.tsx le pose à
 * `PSD_H - 0,07` sur dix centimètres de haut), donc la dernière pièce du
 * portique avant l'air libre, et la seule sur laquelle on visse quelque chose
 * qui doit s'entendre. Un avertisseur calé sur une cote à lui aurait fini par
 * flotter au-dessus du muret le jour où celui-ci change d'épaisseur - ce qui
 * venait précisément d'arriver quand le vantail est rentré dans sa poche.
 *
 * Elles sont ici, avec le reste de la géométrie du portique, parce qu'elles
 * décrivent un point du quai ; c'est systems/stationPa qui les donne au moteur
 * audio, comme il le fait déjà des diffuseurs de l'auvent.
 */
export const PSD_BUZZER_X = PSD_X + PSD_BAND_T / 2;
export const PSD_BUZZER_Y = PLATFORM_TOP + PSD_H - 0.02;

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

// --- Diffuseurs de la sonorisation --------------------------------------
//
// Leurs abscisses le long de la voie sont posées par systems/stationPlacement
// (un tous les dix-neuf mètres, écarté des poutres) ; ces deux cotes-ci disent
// où le diffuseur pend au-dessus du quai. Elles sont PARTAGÉES parce que le son
// doit sortir de la grille qu'on voit : le rendu les lit pour poser la platine
// et la grille (three/station/PlatformKit), le moteur audio pour y panner
// l'annonce (systems/stationPa).

/** Abscisse d'un diffuseur : en avant de l'épine, au-dessus du flux d'embarquement. */
export function speakerX(depth: number): number {
  return PSD_X + depth * 0.28;
}

/** Retrait de la grille sous l'auvent : c'est de là que le son part. */
export const SPEAKER_GRILLE_DROP = 0.079;

/**
 * Les `count` diffuseurs les plus proches de `ear`, écrits dans `out` (du plus
 * proche au plus lointain) ; renvoie combien ont été écrits.
 *
 * `zs` est la ligne de diffuseurs, croissante. On part du point d'écoute et on
 * s'écarte des deux côtés à la fois, en prenant chaque fois le plus proche des
 * deux voisins encore disponibles.
 *
 * Prendre les PLUS PROCHES, et rien d'autre, est ce qui rend le relais
 * inaudible quand on marche : à l'instant où un diffuseur entre dans la
 * sélection, celui qui en sort est à la même distance que lui, donc au même
 * niveau. Une fenêtre glissante quelconque ferait, elle, un saut de niveau à
 * chaque changement.
 */
export function nearestSpeakers(
  zs: readonly number[],
  ear: number,
  count: number,
  out: number[],
): number {
  let hi = 0;
  while (hi < zs.length && zs[hi] < ear) hi++;
  let lo = hi - 1;
  let n = 0;
  while (n < count && (lo >= 0 || hi < zs.length)) {
    const takeLo = hi >= zs.length || (lo >= 0 && ear - zs[lo] <= zs[hi] - ear);
    out[n++] = takeLo ? zs[lo--] : zs[hi++];
  }
  return n;
}

// --- Emprises des accès (demi-longueurs le long de la voie) --------------
//
// Partagées entre le placement (systems/stationPlacement), qui pose les
// emprises de collision, et les gabarits (data/stationLayouts), qui écartent
// les charpentes signature de ces mêmes accès. Deux valeurs divergentes, et
// un portique se plante dans un escalier mécanique.

export const STAIR_HALF_Z = 2.6;
/**
 * Emprise d'un escalier mécanique.
 *
 * Elle n'est pas choisie : elle est ce qu'il faut pour DESCENDRE AU COULOIR
 * BAS. À 30° - la pente d'un escalier mécanique, partout - il faut 6,37 m
 * d'emprise horizontale pour perdre les 3,675 m qui séparent le quai du sol du
 * couloir, plus un palier de peigne à chaque bout. À 2,80 m de demi-emprise, la
 * volée s'arrêtait 90 cm trop haut, et faute de percement elle montait au lieu
 * de descendre : elle finissait dans la sous-face de l'auvent, un escalier qui
 * ne menait nulle part.
 */
export const ESCALATOR_HALF_Z = 3.6;
export const ELEVATOR_HALF_Z = 0.95;

/**
 * Emprise du kiosque de quai : 3,00 m en travers, 6,40 m le long de la voie.
 *
 * C'est la taille d'un vrai NEWDAYS KIOSK, et elle se déduit de ce qu'il y a
 * dedans : deux comptoirs de service qui se tournent le dos (0,80 m chacun) et
 * le passage du vendeur entre les deux (1,30 m) font les trois mètres ; la
 * longueur est celle qu'il faut pour aligner l'étalage de journaux, le râtelier
 * à magazines, la caisse et l'armoire réfrigérée sans que rien ne se chevauche.
 *
 * Elle est ici, et non dans le placement, parce que les gabarits de charpente
 * (data/stationLayouts) doivent écarter leurs poteaux du kiosque : deux
 * valeurs divergentes, et un poteau d'auvent tombe dans la boutique.
 */
export const KIOSK_HALF_X = 1.5;
export const KIOSK_HALF_Z = 3.2;

/**
 * Hauteur libre sous les caissons suspendus, quelle que soit la rangée.
 *
 * C'est le bas de tout ce qui pend sous l'auvent - panneau de sortie, caisson
 * 番線, 発車標 - et donc la cote à laquelle un quai se lit : on passe dessous
 * sans se baisser, et les caissons s'alignent sur cette ligne-là plutôt que
 * sur leurs milieux, qui ne sont pas à la même hauteur d'un modèle à l'autre.
 */
export const SIGN_BOTTOM = 2.35;

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
 * nom, ou le bandeau publicitaire vertical. Les deux la revendiquaient - les
 * bandeaux étaient posés sur tous les poteaux - et la plaque se plaquait sur
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
// Ces cotes ont QUATRE consommateurs - le rendu (three/station/Stairwell), le
// percement de la dalle (three/station/Station), la marche du joueur
// (systems/walkable) et les voyageurs qui quittent le quai
// (systems/platformCrowd) - et il n'existe pas de vue d'ensemble où l'on
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
// emprise et donnent 2,15 m - la cote réglementaire d'un passage de gare.

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
// tout cela n'est praticable - le joueur est arrêté cinq marches plus haut -
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
// au-dessus du sol. Tout ce qui doit se lire - la seconde volée, la ligne de
// portillons - se tient donc BAS et PRÈS.

/**
 * Sous-face du linteau : au-delà, on passe sous la dalle du quai. Quatre
 * centimètres de retombée sous la dalle, pas plus - chacun est pris sur la
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
 * du quai - au pied des marches, la tête dépasse encore du rayon rasant.
 */
export const STAIR_FULL_LEN = (STAIR_STEPS + 1) * STAIR_GOING + 1.05;
/** Et jusqu'où ils s'enfoncent : trois marches de la seconde volée. */
export const STAIR_FULL_STEPS = STAIR_STEPS + 3;

// --- Le profil, écrit une fois -------------------------------------------

/**
 * Ligne des NEZ de marche : altitude de l'arête de giron en `t`. C'est la
 * droite sur laquelle se cale tout ce qui suit la pente - main courante,
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
 * dix-sept centimètres tous les trente-quatre - quatre chutes par seconde au
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

/**
 * `t` du nez de l'emprise auquel commence la SECONDE volée.
 *
 * La première s'arrête sur un palier de mi-étage - c'est ce palier qui donne la
 * hauteur libre sous le linteau -, et la seconde repart de son nez, qui est au
 * nu du linteau (STAIR_LOWER_Z0). Les deux volées se mesurent dans le même `t`,
 * compté depuis le nez du percement, à 2,60 m en amont du centre de la trémie.
 */
export const DESCENT_LOWER_T = STAIR_LOWER_Z0 + STAIR_HALF_Z;

/**
 * Le profil COMPLET de la descente : première volée, palier de mi-étage,
 * seconde volée, puis le couloir de plain-pied.
 *
 * `stairFloorY` s'arrête au palier, parce que c'était tout ce qui se descendait :
 * le joueur était bloqué cinq marches plus haut et les voyageurs s'effaçaient
 * sous le linteau. Dès qu'on va jusqu'au bout, il faut la suite - et elle
 * s'écrit ici, une fois, avec la même convention que la première volée (la
 * ligne des nez relevée d'une demi-contremarche, qui passe par le milieu de
 * chaque giron) plutôt qu'en marches, qui ferait tomber le marcheur de dix-sept
 * centimètres tous les trente et un.
 */
export function descentFloorY(t: number): number {
  if (t <= DESCENT_LOWER_T) return stairFloorY(t, STAIR_STEPS);
  const steps = Math.min(
    STAIR_LOWER_STEPS,
    Math.max(0, (t - DESCENT_LOWER_T) / STAIR_GOING - 0.5),
  );
  return STAIR_LANDING_Y - steps * STAIR_RISE;
}

/**
 * Longueur de la descente, du nez du percement au fond du couloir bas. Au-delà,
 * on n'est plus dans la trémie : on est dans la gare (data/stationInterior).
 */
export const DESCENT_LEN = STAIR_LOWER_END + STAIR_HALF_Z;

// --- L'escalier mécanique -------------------------------------------------
//
// Il va OÙ VA LA TRÉMIE : en bas. Vingt-cinq gares sur trente ont leur
// billetterie sous les voies, les cinq autres l'ont au-dessus mais gardent des
// trémies borgnes qui descendent - dans les trente, l'accès mécanisé d'un quai
// dessert le même niveau que l'accès à pied d'à côté.
//
// Il montait, et il ne montait nulle part : une volée de 2,77 m coiffée d'une
// gaine borgne plaquée sous l'auvent, sans percement au-dessus ni palier au
// bout. Sur les quais sans auvent, elle s'arrêtait carrément en plein ciel.
//
// Le profil se pose donc comme celui de la trémie : par sa DESTINATION. Le
// pied de la volée est le sol du couloir bas, la pente est celle d'un escalier
// mécanique, et l'emprise s'en déduit - jamais l'inverse.
//
// REPÈRE LOCAL : origine au centre de l'emprise, y = 0 au sol du quai. On
// s'engage côté −z, la volée descend vers +z. C'est le sens de la trémie, et
// c'est ce que supposent le débouché dégagé (systems/stationPlacement) et la
// plaque de balisage suspendue à l'entrée (three/station/OverheadSigns).

/** Pente normalisée d'un escalier mécanique : 30°. */
export const ESCALATOR_SLOPE = Math.PI / 6;
/** Dénivelé de la volée : du sol du quai à celui du couloir bas. */
export const ESCALATOR_DROP = -STAIR_LOWER_Y;
/** Emprise horizontale de la partie inclinée. */
export const ESCALATOR_RUN = ESCALATOR_DROP / Math.tan(ESCALATOR_SLOPE);
/** Palier de peigne à chaque bout : ce que l'emprise laisse au-delà de la volée. */
export const ESCALATOR_LANDING = ESCALATOR_HALF_Z - ESCALATOR_RUN / 2;

/** Demi-largeur libre de la gaine, entre les deux joues. */
export const ESCALATOR_CLEAR_HALF_X = 0.72;
/**
 * Percement de la dalle, en repère local - même convention que la trémie : les
 * joues et le voile de tête COIFFENT ses chants de STAIR_LAP, aucune face de la
 * gaine n'est coplanaire avec une face de la dalle.
 *
 * Il commence au nez de la volée, pas au bout de l'emprise : le palier haut est
 * de plain-pied avec le quai, on marche encore sur la dalle.
 */
export const ESCALATOR_OPENING_HALF_X = ESCALATOR_CLEAR_HALF_X + STAIR_LAP;
export const ESCALATOR_OPENING_Z0 = -ESCALATOR_RUN / 2;
/**
 * Le percement s'arrête 24 cm EN DEÇÀ du bout de l'emprise, et pas dessus : le
 * voile de tête qui coiffe ce chant-là doit tenir dans l'emprise, sinon il
 * déborde de vingt centimètres dans le passage du quai - un obstacle qu'aucune
 * collision ne déclare.
 */
export const ESCALATOR_OPENING_Z1 = ESCALATOR_HALF_Z - 0.24;

// --- Et la volée qui MONTE ------------------------------------------------
//
// Cinq gares en tranchée et Nippori ont leur billetterie AU-DESSUS des voies,
// sur le bâtiment qui les enjambe : la rue y est plus haute que le quai, et la
// gare avec elle. C'est l'inverse exact d'une gare de viaduc, et cela ne se
// paramètre pas en changeant un signe - une volée montante est un ouvrage
// différent :
//
//   · elle ne perce PAS la dalle du quai, elle se pose dessus. Pas de trémie,
//     pas de joues qui coiffent un percement, pas de linteau ;
//   · elle perce en revanche l'AUVENT, qu'elle traverse aux deux tiers de sa
//     hauteur, et c'est ce percement-là qu'il faut ménager ;
//   · elle est plus longue, parce qu'elle monte plus haut : cinq mètres au lieu
//     de trois et demi, pour passer au-dessus du gabarit de la rame.

/** Marches de la première volée, jusqu'au palier de mi-étage. */
export const ASCENT_STEPS_A = 15;
/** Longueur du palier : quatre girons, de quoi souffler et tourner la tête. */
export const ASCENT_LANDING_LEN = 4 * STAIR_GOING;
/** Marches de la seconde volée, du palier au plancher du hall. */
export const ASCENT_STEPS_B = 14;

/**
 * Plancher du niveau de correspondance quand il est AU-DESSUS du quai.
 *
 * Ce n'est pas une valeur d'ambiance : c'est ce qui fait passer un tablier
 * au-dessus d'une rame. Vingt-neuf contremarches de 17,5 cm - la même marche
 * que partout ailleurs dans cette gare, parce qu'un escalier public n'a qu'un
 * seul profil.
 */
export const ASCENT_FLOOR_Y = (ASCENT_STEPS_A + ASCENT_STEPS_B) * STAIR_RISE;

/** `t` auquel finit la première volée, et auquel commence la seconde. */
const ASCENT_A_END = (ASCENT_STEPS_A + 0.5) * STAIR_GOING;
const ASCENT_B_START = ASCENT_A_END + ASCENT_LANDING_LEN;

/** Altitude du palier de mi-étage. */
export const ASCENT_LANDING_Y = ASCENT_STEPS_A * STAIR_RISE;

/**
 * Altitude du sol sous les pieds de qui MONTE, en `t` du pied de la volée.
 *
 * Même convention que la descente - la ligne des nez relevée d'une
 * demi-contremarche, qui passe par le milieu de chaque giron - pour la même
 * raison : un profil en marches ferait sauter le marcheur de dix-sept
 * centimètres tous les trente et un.
 */
export function ascentFloorY(t: number): number {
  if (t <= ASCENT_A_END) {
    return Math.min(ASCENT_STEPS_A, Math.max(0, t / STAIR_GOING - 0.5)) * STAIR_RISE;
  }
  const up = Math.min(
    ASCENT_STEPS_B,
    Math.max(0, (t - ASCENT_B_START) / STAIR_GOING - 0.5),
  );
  return ASCENT_LANDING_Y + up * STAIR_RISE;
}

/** Longueur de la volée montante, du pied au plancher du hall. */
export const ASCENT_LEN = ASCENT_B_START + (ASCENT_STEPS_B + 0.5) * STAIR_GOING + 0.6;

/** Demi-largeur praticable de la volée montante : celle de la descente. */
export const ASCENT_WALK_HALF_X = STAIR_WALK_HALF_X;
