// Le FORMAT d'un profil de gare : de quoi décrire une topologie, pas un couloir.
//
// `data/stationInterior` sait décrire un hall : une zone payante, une ligne de
// portillons, une zone libre, le tout dans le prolongement d'une trémie. C'est
// juste, c'est partagé par le rendu et par la marche, et cela ne dira jamais
// qu'Uguisudani a DEUX petits halls sans rapport l'un avec l'autre, que Meguro
// monte du quai vers son hall puis redescend vers trois lignes, ni que le hall
// d'Akihabara a un viaduc au-dessus de la tête et un métro sous les pieds.
//
// Ce fichier ne décrit AUCUNE gare et ne dessine rien : il pose le vocabulaire.
// Les trente relevés vivent dans `data/stationConcourseProfiles`, leurs sources
// dans `data/stationConcourseSources`, et la fabrique qui en tire des
// rectangles dans `data/stationConcourseBuild`. Quatre couches, et l'on ne les
// mélange pas - c'est ce qui permet de corriger un relevé sans toucher au
// moteur, et d'améliorer le moteur sans rouvrir trente relevés.
//
// TROIS DÉCISIONS DE FOND, et ce sont elles qui font la différence avec
// `StationInterior` :
//
//   1. LE NIVEAU APPARTIENT AU HALL, pas à la gare. Une gare n'a pas « son »
//      niveau au-dessus ou en dessous : elle a des halls, chacun au sien. Le
//      `place: 'under' | 'over'` global n'était juste que tant qu'il n'y avait
//      qu'un hall par gare.
//   2. UN GROUPE DE PORTILLONS EST UN LIEN, pas un champ. Il relie un nœud
//      payant à un nœud libre. Une gare en a autant qu'elle en a - c'est même
//      la chose qui la rend reconnaissable - et le graphe qui en résulte se
//      vérifie : tout accès mène à un groupe, tout groupe débouche sur une
//      zone libre, toute sortie part d'une zone libre.
//   3. CE QUI N'EST PAS VISITABLE SE DÉCLARE, et se déclare AVEC SA MANIÈRE.
//      Le joueur ne parcourt pas la gare réelle ; il doit pourtant comprendre
//      qu'elle continue. `Depiction` est la liste FERMÉE des façons de le lui
//      dire - un couloir court, un virage aveugle, une tête d'escalier, un
//      panneau - et « mur invisible » n'en fait pas partie.
//
// REPÈRE. Celui du quai, comme tout le reste de l'intérieur (voir
// `data/stationInterior`) : x depuis l'axe de la voie vers le fond, z le long
// de la voie, y relatif au sol du quai. La gare se retourne d'un bloc avec son
// côté d'ouverture, sans une ligne de plus.

import type { DataConfidence } from './evidence.ts';
import { PSD_X, RAIL_Y } from './stationGeometry.ts';

/**
 * Rectangle du repère quai, bornes comprises.
 *
 * Structurellement identique à `InteriorRect` (`data/stationInterior`), et
 * c'est voulu : les deux se passent l'un pour l'autre sans conversion. Il est
 * redéfini ici plutôt qu'importé pour que ce fichier ne dépende pas du moteur
 * qu'il est censé remplacer - la dépendance irait dans le mauvais sens.
 */
export interface ConcourseRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

// --- Ce qui est jouable, et ce qui est seulement montré ------------------

/**
 * COMMENT une chose est présente dans le jeu.
 *
 * Le périmètre visitable est étroit et assumé : un ou plusieurs accès, le
 * cheminement principal, la zone payante, un groupe de portillons, une portion
 * de zone libre, les premières marches des sorties. Tout le reste de la gare
 * réelle - les autres halls, les autres lignes, les autres ailes - doit se
 * VOIR sans se parcourir, et cette liste est le vocabulaire complet pour le
 * dire.
 *
 * Elle est fermée à dessein. Chaque valeur correspond à un archétype de rendu
 * (`three/station/interiors`), et une valeur de plus est une décision de
 * fabrication, pas un champ libre.
 */
export type Depiction =
  /** On y va : c'est du sol, et la marche l'accepte. */
  | 'walkable'
  /** Couloir secondaire court : quelques mètres, puis la cage se ferme. */
  | 'shortBranch'
  /** Virage : on voit qu'il continue, on ne voit pas jusqu'où. */
  | 'blindCorner'
  /** Volée qui disparaît derrière un plafond ou un linteau. */
  | 'stairhead'
  /** Porte ou passage de correspondance : franchi par les PNJ, pas par nous. */
  | 'doorway'
  /** Perspective : un volume éclairé ou sombre, vu de loin, jamais atteint. */
  | 'vista'
  /** Fond simplifié : une paroi qui suggère la profondeur sans la construire. */
  | 'backdrop'
  /** Fermé : travaux, horaire, zone hors service. La barrière est le message. */
  | 'closed'
  /** Rien de bâti : seulement un panneau qui nomme la destination. */
  | 'signOnly';

/** Ce que le joueur peut réellement fouler. */
export function isWalkable(d: Depiction): boolean {
  return d === 'walkable';
}

// --- Les niveaux ---------------------------------------------------------

/**
 * Où se tient un niveau PAR RAPPORT AU QUAI.
 *
 * C'est une relation, pas une altitude : la cote vient de `ConcourseLevel.floorY`
 * et d'elle seule. `multiLevel` ne qualifie jamais un niveau - un niveau est à
 * une hauteur - mais un PROFIL dont les halls ne sont pas tous du même côté.
 */
export type RelativeLevel =
  /** Sous le quai : passage souterrain, ou dessous de viaduc. */
  | 'belowPlatform'
  /** De plain-pied avec le quai : gares au sol dont le hall est en bout. */
  | 'platformLevel'
  /** Au-dessus : bâtiment qui enjambe la tranchée ou le faisceau. */
  | 'abovePlatform'
  /** Réservé au profil entier : ses halls ne sont pas tous du même côté. */
  | 'multiLevel';

export interface ConcourseLevel {
  id: string;
  relative: Exclude<RelativeLevel, 'multiLevel'>;
  /** Sol du niveau, relatif au sol du quai (m). Signé. */
  floorY: number;
  /** Hauteur libre sous plafond (m). C'est elle qui fait un hall ou un boyau. */
  headroom: number;
  /** Nom du niveau tel qu'il est écrit sur les plans (B1F, 3F, M2F…). */
  label?: string;
  nameJp?: string;
  nameEn?: string;
}

// --- Les halls -----------------------------------------------------------

/**
 * La FORME d'un hall, et donc l'archétype qui le dessine.
 *
 * Le choix n'est pas décoratif : c'est lui qui décide de la coupe, du plafond,
 * de la trame de poteaux et de la façon dont la lumière tombe. Une gare se
 * reconnaît d'abord à cela, avant tout nom écrit sur un panneau.
 */
export type ConcourseNodeKind =
  /** Hall longitudinal, dans l'axe du quai : le cas ordinaire. */
  | 'linear'
  /** Hall transversal : on le traverse en travers des voies. */
  | 'cross'
  /** Petit hall sous viaduc : plafond bas, poutres apparentes, rue à côté. */
  | 'underViaduct'
  /** Pont-concourse : le hall enjambe le faisceau, on voit les voies dessous. */
  | 'overbridge'
  /** Hall compact de gare locale : une pièce, et c'est tout. */
  | 'compact'
  /** Mezzanine : un demi-niveau, ouvert sur celui d'en dessous. */
  | 'mezzanine'
  /** Tranche de grande gare : un morceau d'un ensemble qui continue hors champ. */
  | 'hubSlice';

/** De quel côté de la ligne de contrôle se tient un espace. */
export type FareSide = 'paid' | 'free';

export interface ConcourseNode {
  id: string;
  levelId: string;
  kind: ConcourseNodeKind;
  fare: FareSide;
  /**
   * Emprise au sol, repère quai.
   *
   * Elle peut sortir de la largeur du quai - c'est même tout l'intérêt d'un
   * hall transversal - mais elle doit alors être déclarée dans
   * `StationConcourseProfile.footprint`, faute de quoi la nappe de rue
   * reprendrait sa place au milieu du hall (voir `three/groundStrip`).
   */
  rect: ConcourseRect;
  depiction: Depiction;
  /** Nom du hall, quand il en porte un sur les plans. */
  nameJp?: string;
  nameEn?: string;
  /** Hauteur libre propre au nœud, quand elle diffère de celle du niveau. */
  headroom?: number;
  confidence?: DataConfidence;
}

// --- Ce qui relie les halls ----------------------------------------------

export type ConcourseLinkKind =
  | 'stairs'
  | 'escalator'
  | 'elevator'
  /** Rampe : Takanawa Gateway, Ōsaki. */
  | 'ramp'
  /** Couloir de plain-pied. */
  | 'corridor'
  /** Continuité franche entre deux nœuds de même niveau : pas d'ouvrage. */
  | 'open';

/**
 * Un lien entre deux nœuds, ou entre un accès de quai et un nœud.
 *
 * L'ORIENTATION COMPTE : `from` → `to` est le sens dans lequel `rise` se lit.
 * `rise` vaut +1 si l'on monte en allant de `from` vers `to`, -1 si l'on
 * descend, 0 de plain-pied. C'est ce qui permet de vérifier qu'un lien est
 * d'accord avec les altitudes des deux niveaux qu'il joint, plutôt que de le
 * croire sur parole.
 */
export interface ConcourseLink {
  id: string;
  kind: ConcourseLinkKind;
  from: string;
  to: string;
  rise: -1 | 0 | 1;
  /** Emprise de l'ouvrage, repère quai. */
  rect: ConcourseRect;
  /** Largeur libre (m) : c'est elle qu'on vérifie contre le minimum. */
  width: number;
  depiction: Depiction;
  nameJp?: string;
  nameEn?: string;
  confidence?: DataConfidence;
}

/**
 * Un accès depuis le QUAI : la trémie, l'escalier mécanique, l'ascenseur.
 *
 * Il ne porte pas de rectangle : son emprise est déjà posée par
 * `systems/stationPlacement`, qui seul sait où les accès du quai tombent. Le
 * profil dit seulement lequel mène où, et lequel se prend réellement.
 */
export interface PlatformAccess {
  id: string;
  kind: 'stairs' | 'escalator' | 'elevator';
  /** Lettre de balisage JR (A, B, C…), quand elle est relevée. */
  letter?: string;
  /**
   * Rang de l'accès PARMI CEUX DE MÊME NATURE, en z croissant.
   *
   * Les trémies entre elles, les mécaniques entre elles, l'ascenseur seul.
   * C'est la seule lecture qui tienne : une gare a deux trémies, un ou deux
   * escaliers mécaniques et zéro ou un ascenseur, et un rang global changerait
   * de sens dès qu'une gare perd son ascenseur.
   *
   * `systems/stationPlacement` l'apparie avec les accès qu'il a réellement
   * posés : le profil ne pose pas de cote de quai.
   */
  order: number;
  /** Le nœud desservi. */
  toNodeId: string;
  rise: 'up' | 'down';
  depiction: Depiction;
  confidence?: DataConfidence;
}

// --- Les portillons ------------------------------------------------------

/**
 * Un groupe de portillons : 改札口.
 *
 * C'est un LIEN, et c'est ce qui change tout : il relie un nœud payant à un
 * nœud libre, ce qui rend le graphe vérifiable. Une gare en a autant qu'elle en
 * a, et la séparation des groupes est exactement ce qui fait qu'on reconnaît
 * une gare - 北口 et 南口 d'Uguisudani ne sont pas deux moitiés d'une même
 * ligne, ce sont deux gares en miniature.
 *
 * La GÉOMÉTRIE DES BAIES n'est pas ici : le profil dit combien de passages et
 * où passe la ligne, `data/stationConcourseBuild` en tire bornes et baies. Un
 * relevé dit « huit passages », il ne dit pas « borne à x = 3,42 ».
 */
export interface GateGroup {
  id: string;
  nameJp: string;
  nameEn: string;
  /** Nœud payant. */
  from: string;
  /** Nœud libre. */
  to: string;
  /** Emprise de la ligne, repère quai. */
  rect: ConcourseRect;
  /** L'axe le long duquel on FRANCHIT la ligne. */
  cross: 'x' | 'z';
  /** Nombre de baies. Au moins une, sans quoi ce n'est pas un passage. */
  passages: number;
  /** Y a-t-il un 幅広改札 (passage large), et à quel bout de la ligne. */
  wideAt?: 'start' | 'end';
  /** Guichet de contrôle habité (有人改札) accolé à la ligne. */
  staffed?: boolean;
  /**
   * 「ICカード専用」 — le groupe n'accepte QUE la carte sans contact.
   *
   * Les trois champs qui suivent ont été ajoutés après le relevé des trente
   * plans, et pour une seule raison : ce sont des faits qu'AUCUNE GÉNÉRATION
   * NE PRODUIT. Le contrôle central de la halle de brique de Tokyo est marqué
   * « IC card only » sur le plan ; trois des cinq contrôles de Yūrakuchō le
   * sont aussi ; Shin-Ōkubo a un « Exit Only (IC card only) » ; deux des neuf
   * groupes de Shinjuku ferment la nuit et le plan donne leurs horaires. Le
   * jeu tient déjà une carte (`store.pocket`) : ces règles sont directement
   * jouables, et les taire reviendrait à niveler ce que le relevé a trouvé.
   */
  icOnly?: true;
  /** Passage à sens unique : on sort par là, on n'entre pas. */
  exitOnly?: true;
  /**
   * Horaires d'ouverture, RECOPIÉS du plan tels qu'il les écrit.
   *
   * Absent = ouvert au service, ce qui est le cas des vingt-huit autres
   * groupes du relevé. Ce n'est pas une chaîne à parser : c'est une citation.
   */
  hours?: string;
  depiction: Depiction;
  confidence?: DataConfidence;
}

// --- Les sorties ---------------------------------------------------------

/** Orientation en surface, pour le fléchage et rien d'autre. */
export type Bearing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface StationExitProfile {
  id: string;
  /** Le nom RÉEL, tel qu'il est écrit au-dessus de la bouche. */
  nameJp: string;
  nameEn: string;
  /**
   * Numéro de sortie de métro (A3, 7, 出口12…), quand la bouche en porte un.
   *
   * Il n'appartient pas à JR : c'est une numérotation Tokyo Metro / Toei, et
   * une bouche JR n'en a pas. L'écrire là où il n'existe pas serait une faute
   * de signalétique, pas un détail.
   */
  metroCode?: string;
  /** Le nœud de zone libre d'où l'on s'engage. */
  fromNodeId: string;
  depiction: Depiction;
  bearing?: Bearing;
  /** Ce vers quoi elle mène, en toutes lettres : c'est ce que dit le panneau. */
  leadsToJp?: string;
  leadsToEn?: string;
  confidence?: DataConfidence;
}

// --- Les correspondances -------------------------------------------------

/**
 * Une correspondance : elle se VOIT, elle ne se prend pas.
 *
 * Le jeu ne construit pas les autres lignes. Ce qu'il doit rendre, c'est la
 * DIRECTION - qu'on comprenne, depuis le hall, que le Ginza est en l'air et le
 * Chiyoda tout en bas. D'où `goes`, qui est la seule information réellement
 * structurante, et `lines`, qui donne la couleur des pastilles (`data/lines`).
 */
export interface TransferPortal {
  id: string;
  /** Clés de `data/lines` (noms japonais), pour la couleur et le romaji. */
  lines: readonly string[];
  fromNodeId: string;
  /** Où ça part : plus bas, plus haut, ou de plain-pied. */
  goes: 'down' | 'up' | 'across';
  /**
   * La correspondance passe par une LIGNE DE CONTRÔLE entre deux zones payantes.
   *
   * Sept gares du relevé en ont une, et c'est une topologie que `GateGroup` ne
   * peut pas décrire : un groupe de portillons relie du payant à du LIBRE, par
   * construction. Or à Tokyo on franchit un 改札 pour passer au Shinkansen, à
   * Nippori pour passer au Keisei, à Shinagawa au Keikyū, à Hamamatsuchō au
   * monorail de Haneda, à Takadanobaba au Seibu, à Gotanda au Tōkyū Ikegami,
   * à Ueno au Shinkansen — sans jamais repasser en zone libre.
   *
   * Le portail porte donc le fait, plutôt que de le perdre : la correspondance
   * est GARDÉE. Elle n'est toujours pas franchissable par le joueur, mais elle
   * se dessine avec ses bornes et son panneau au lieu d'une simple flèche.
   */
  gated?: true;
  depiction: Depiction;
  nameJp?: string;
  nameEn?: string;
  /** Emprise, quand le portail est bâti (couloir, tête d'escalier). */
  rect?: ConcourseRect;
  confidence?: DataConfidence;
}

// --- Les commerces -------------------------------------------------------

/**
 * CE QU'ON SAIT d'un commerce, et c'est une échelle de vérité, pas de taille.
 *
 * Le dépôt refuse d'inventer une enseigne. Un commerce dont on a vu le nom sur
 * un plan officiel et un commerce qu'on met là parce qu'il y a de la place ne
 * sont pas la même chose, et confondre les deux est exactement la faute que ce
 * chantier doit éviter.
 */
export type CommerceStatus =
  /** Enseigne vue sur un plan officiel ou une photo datée : on peut la nommer. */
  | 'namedVerified'
  /** Catégorie établie, enseigne non confirmée : un konbini, on ne sait lequel. */
  | 'categoryVerified'
  /** Remplissage assumé : plausible, non relevé. Générique, jamais nommé. */
  | 'generic'
  /** Façade seule : on la voit, on n'y entre pas. */
  | 'facade'
  /** Galerie structurante : ecute, atré, Gransta. Elle donne l'échelle du hall. */
  | 'gallery';

export type CommerceCategory =
  | 'konbini'
  | 'kiosk'
  | 'cafe'
  | 'bakery'
  | 'bento'
  | 'restaurant'
  | 'drugstore'
  | 'books'
  | 'fashion'
  | 'souvenir'
  | 'services'
  | 'gallery';

export interface CommercialZone {
  id: string;
  nodeId: string;
  status: CommerceStatus;
  category: CommerceCategory;
  /** L'enseigne, et SEULEMENT si `status` vaut 'namedVerified' ou 'gallery'. */
  brand?: string;
  rect: ConcourseRect;
  /** On y entre, ou l'on passe devant. */
  enterable: boolean;
  confidence?: DataConfidence;
}

// --- Ce qui fait reconnaître le lieu -------------------------------------

/**
 * Un repère intérieur : ce qui n'est ni un mur, ni un meuble, ni un panneau,
 * mais ce dont on se souvient.
 *
 * La grande toiture de Takanawa Gateway, la charpente rivetée d'Ueno, le puits
 * vertical de Meguro, la vue sur les voies depuis un pont-concourse. Ce sont
 * eux qui font qu'une gare se reconnaît sans lire un mot de japonais.
 */
export type LandmarkKind =
  | 'ceiling'
  | 'column'
  | 'skylight'
  | 'atrium'
  /** Trémie ouverte sur le niveau d'en dessous : on voit deux étages à la fois. */
  | 'void'
  /** Vue sur les voies depuis le hall. */
  | 'trackView'
  | 'artwork'
  | 'clock'
  /** Matériau qui fait le lieu : brique, bois, acier riveté, verre. */
  | 'material';

export interface InteriorLandmark {
  id: string;
  kind: LandmarkKind;
  nodeId: string;
  rect?: ConcourseRect;
  note: string;
  confidence?: DataConfidence;
}

// --- Les travaux ---------------------------------------------------------

/**
 * L'état de chantier à la date de référence.
 *
 * Une gare en travaux n'est pas une gare abîmée : c'est une gare AUTRE, avec
 * ses palissades, ses détours fléchés et ses passages provisoires. Shibuya et
 * Shinjuku ne se comprennent pas sans cela.
 */
export interface ConstructionPartition {
  id: string;
  nodeId: string;
  rect: ConcourseRect;
  kind: 'hoarding' | 'scaffold' | 'detour';
  /** Ce que la palissade annonce, quand elle l'annonce. */
  noticeJp?: string;
  noticeEn?: string;
}

export interface ConstructionProfile {
  /** Ce que le chantier fait, en une phrase. */
  summary: string;
  /** Début et fin annoncés, quand ils le sont (AAAA-MM). */
  since?: string;
  until?: string;
  partitions: readonly ConstructionPartition[];
  confidence: DataConfidence;
}

// --- Les sources ---------------------------------------------------------

/**
 * Rang de la source dans l'ordre de priorité du chantier.
 *
 * 1 JR East · 2 Tokyo Metro · 3 Toei · 4 autres opérateurs · 5 centres
 * commerciaux intégrés (atré, ecute, NEWoMan, Gransta) · 6 pages de travaux ·
 * 7 photographies et vidéos récentes · 8 Google Maps / Street View, et
 * uniquement pour vérifier une orientation en surface.
 */
export type SourceTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * CE QU'ON A RÉELLEMENT FAIT DE LA SOURCE.
 *
 * Citer un plan officiel et l'avoir ouvert sont deux choses différentes, et
 * l'écart entre les deux est exactement l'endroit où un relevé se met à
 * inventer. Le champ existe donc pour rendre cet écart visible plutôt que
 * confortable.
 *
 * Il a une raison concrète : l'environnement de développement de ce dépôt
 * n'atteint PAS les sites des opérateurs. La passerelle réseau refuse la
 * connexion (403 sur `CONNECT`) vers jreast.co.jp, tokyometro.jp et le reste ;
 * seule la recherche indexée répond. Un profil qui prétendrait s'appuyer sur
 * un plan lu mentirait sur la façon dont il a été fait.
 */
export type SourceRetrieval =
  /** Document ouvert et lu. C'est la seule valeur qui autorise `verified`. */
  | 'read'
  /** Existence, adresse et titre confirmés par un index de recherche ; contenu non lu. */
  | 'indexed'
  /** Référence connue et à consulter : ni ouverte, ni confirmée par un index. */
  | 'catalogued';

export interface SourceReference {
  tier: SourceTier;
  /** Ce qu'on a fait de la source. Défaut implicite : rien de plus que `catalogued`. */
  retrieval: SourceRetrieval;
  /** Qui publie : JR East, Tokyo Metro, atré… */
  publisher: string;
  title: string;
  url?: string;
  /**
   * Date du DOCUMENT, pas de la consultation (AAAA-MM ou AAAA).
   *
   * Elle est ici parce que mélanger des plans d'années différentes sans le
   * dire est la faute la plus facile à commettre et la plus difficile à voir
   * ensuite. Un plan de 2019 et une photo de 2026 ne décrivent pas la même
   * gare.
   */
  documentDate?: string;
  consultedAt: string;
  note?: string;
}

// --- Le profil -----------------------------------------------------------

/** Ce qu'on sait de la gare, tout compris. */
export type ProfileConfidence = 'verified' | 'mostlyVerified' | 'approximate';

export interface StationConcourseProfile {
  stationIndex: number;
  /** Date de référence du relevé (AAAA-MM). */
  referenceDate: string;
  confidence: ProfileConfidence;
  /** L'accès par lequel on entre dans la gare depuis le quai. */
  primaryAccessId: string;
  /**
   * Où se tiennent les halls PAR RAPPORT AU QUAI, tous ensemble.
   *
   * Déduit des niveaux, mais écrit quand même : c'est le premier chiffre qu'on
   * lit d'un profil, et une gare qui se déclare `multiLevel` prévient qu'elle
   * ne se résume pas.
   */
  place: RelativeLevel;
  /**
   * L'emprise TOTALE que la gare réclame au décor, repère quai.
   *
   * C'est la cote la plus contraignante du format. Sous la dalle du quai, la
   * nappe de rue et le ballast reprennent leur place un mètre plus bas
   * (`three/groundStrip`, `systems/stationOcclusion`) : un hall qui dépasse
   * cette emprise se ferait couper en deux à hauteur d'épaule. Le profil
   * DÉCLARE donc ce qu'il occupe, et l'occultation du décor le lit.
   */
  footprint: ConcourseRect;
  levels: readonly ConcourseLevel[];
  platformAccesses: readonly PlatformAccess[];
  concourses: readonly ConcourseNode[];
  corridors: readonly ConcourseLink[];
  gateGroups: readonly GateGroup[];
  exits: readonly StationExitProfile[];
  transferPortals: readonly TransferPortal[];
  commercialZones: readonly CommercialZone[];
  landmarks: readonly InteriorLandmark[];
  works?: ConstructionProfile;
  sources: readonly SourceReference[];
  /** Ce qui reste à vérifier, en toutes lettres. Vide = rien ne traîne. */
  openQuestions?: readonly string[];
}

// --- Cotes minimales -----------------------------------------------------

/**
 * Largeur minimale d'un cheminement principal (m).
 *
 * Deux mètres : c'est la largeur d'un couloir de correspondance JR, et c'est
 * déjà la cote que `data/stationInterior` refuse de franchir (`AISLE_MIN`).
 * Elle est reprise telle quelle pour que les deux moteurs ne puissent pas
 * diverger sur ce qui fait un couloir et ce qui fait un boyau.
 */
export const MIN_MAIN_WIDTH = 2.0;

/** Largeur minimale d'une branche secondaire, qui a le droit d'être étroite. */
export const MIN_BRANCH_WIDTH = 1.4;

/** Hauteur libre minimale d'un espace où l'on marche (m). */
export const MIN_HEADROOM = 2.1;

// --- Ce que la voie interdit ---------------------------------------------
//
// Deux nappes horizontales courent au ras du sol : le ballast (`three/Wayside`,
// de l'axe à ±5 m) et la rue de la ville (`three/city/CityRibbon`, au-delà).
// Le quai les masque, et `systems/stationOcclusion` les écarte au droit de la
// gare pour qu'elles ne coupent pas les trémies.
//
// LA RUE SE DÉROBE, LE BALLAST NON. C'est toute la différence, et c'est la
// forme réelle de la contrainte G1 : on peut reculer une nappe de rue autant
// qu'on veut — il suffit que la gare couvre ce qu'on découvre — mais on ne
// retire pas le ballast, parce qu'un train roule dessus. Un niveau de gare qui
// vit à l'altitude de ces nappes ne peut donc pas franchir la rive rentrée du
// ballast : il faut qu'il passe DESSOUS, c'est-à-dire plus bas que la voie.

/** Bande d'altitude où courent les nappes de sol, en repère quai. */
export const GROUND_SHEET_Y0 = RAIL_Y - 0.45;
export const GROUND_SHEET_Y1 = RAIL_Y + 0.45;

/**
 * Rive du ballast une fois rentrée au maximum : le bord de quai, moins dix
 * centimètres. C'est exactement la cote de `ballastTrim`
 * (`systems/stationOcclusion`), et les deux ne peuvent pas diverger sans qu'un
 * couloir se retrouve coupé par un plancher gris.
 */
export const BALLAST_KEEP_X = PSD_X - 0.1;

/** Le niveau `l` vit-il à l'altitude des nappes de sol ? */
export function atGroundSheet(l: Pick<ConcourseLevel, 'floorY' | 'headroom'>): boolean {
  return l.floorY < GROUND_SHEET_Y1 && l.floorY + l.headroom > GROUND_SHEET_Y0;
}

// --- Vérification --------------------------------------------------------

/**
 * Un défaut trouvé dans un profil.
 *
 * `where` est l'identifiant de l'objet fautif, pour qu'un message d'échec
 * désigne la ligne à corriger et non « le profil ».
 */
export interface ProfileIssue {
  code: string;
  where: string;
  message: string;
}

function rectValid(r: ConcourseRect): boolean {
  return r.x1 > r.x0 && r.z1 > r.z0;
}

function rectInside(inner: ConcourseRect, outer: ConcourseRect, slack = 1e-6): boolean {
  return (
    inner.x0 >= outer.x0 - slack
    && inner.x1 <= outer.x1 + slack
    && inner.z0 >= outer.z0 - slack
    && inner.z1 <= outer.z1 + slack
  );
}

/**
 * Tout ce qui ne va pas dans un profil, ou un tableau vide.
 *
 * Ce n'est pas un contrôle de saisie : c'est la moitié des tests obligatoires
 * du chantier, écrite une fois et appelée sur les trente gares. Un profil qui
 * passe ici a un graphe cohérent - tout accès mène à un contrôle, tout contrôle
 * débouche sur une zone libre, toute sortie part d'une zone libre - et des
 * rectangles qui tiennent les uns dans les autres.
 *
 * Elle ne dit RIEN de l'exactitude du relevé : un profil parfaitement cohérent
 * peut décrire une gare imaginaire. C'est le rôle des sources, pas du
 * validateur, et il ne faut pas confondre les deux.
 */
export function validateProfile(p: StationConcourseProfile): ProfileIssue[] {
  const out: ProfileIssue[] = [];
  const bad = (code: string, where: string, message: string) => out.push({ code, where, message });

  // --- Identité et provenance ---
  if (p.stationIndex < 0 || p.stationIndex > 29) {
    bad('index', `#${p.stationIndex}`, 'index de gare hors de la boucle');
  }
  if (!/^\d{4}-\d{2}$/.test(p.referenceDate)) {
    bad('date', `#${p.stationIndex}`, `date de référence illisible : ${p.referenceDate}`);
  }
  if (p.sources.length === 0) {
    bad('sources', `#${p.stationIndex}`, 'aucune source');
  }
  for (const s of p.sources) {
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(s.consultedAt)) {
      bad('sourceDate', s.title, `date de consultation illisible : ${s.consultedAt}`);
    }
  }
  // On ne se déclare pas `verified` sur un plan qu'on n'a pas ouvert. C'est la
  // seule règle du validateur qui parle d'exactitude plutôt que de cohérence,
  // et elle ne parle en réalité que de la MÉTHODE : elle n'affirme pas que le
  // relevé est juste, elle refuse qu'il se prétende vérifié sans qu'un
  // document officiel ait été lu.
  if (
    p.confidence === 'verified'
    && !p.sources.some((s) => s.retrieval === 'read' && s.tier <= 3)
  ) {
    bad(
      'overclaimed',
      `#${p.stationIndex}`,
      'déclaré « verified » sans qu’aucun plan officiel (rang 1-3) ait été lu',
    );
  }

  // --- Unicité des identifiants ---
  const seen = new Set<string>();
  const claim = (id: string, kind: string) => {
    if (seen.has(id)) bad('duplicateId', id, `identifiant en double (${kind})`);
    seen.add(id);
  };
  for (const l of p.levels) claim(l.id, 'niveau');
  for (const n of p.concourses) claim(n.id, 'hall');
  for (const a of p.platformAccesses) claim(a.id, 'accès');
  for (const c of p.corridors) claim(c.id, 'couloir');
  for (const g of p.gateGroups) claim(g.id, 'portillons');
  for (const e of p.exits) claim(e.id, 'sortie');
  for (const t of p.transferPortals) claim(t.id, 'correspondance');
  for (const z of p.commercialZones) claim(z.id, 'commerce');
  for (const k of p.landmarks) claim(k.id, 'repère');

  const levels = new Map(p.levels.map((l) => [l.id, l]));
  const nodes = new Map(p.concourses.map((n) => [n.id, n]));

  // --- Niveaux ---
  for (const l of p.levels) {
    if (l.headroom < MIN_HEADROOM) {
      bad('headroom', l.id, `hauteur libre de ${l.headroom} m, minimum ${MIN_HEADROOM}`);
    }
    const under = l.floorY < -0.5;
    const over = l.floorY > 0.5;
    if (l.relative === 'belowPlatform' && !under) {
      bad('levelSign', l.id, `déclaré sous le quai mais posé à ${l.floorY} m`);
    }
    if (l.relative === 'abovePlatform' && !over) {
      bad('levelSign', l.id, `déclaré au-dessus du quai mais posé à ${l.floorY} m`);
    }
    if (l.relative === 'platformLevel' && (under || over)) {
      bad('levelSign', l.id, `déclaré de plain-pied mais posé à ${l.floorY} m`);
    }
  }
  // Le `place` du profil dit la vérité sur l'ensemble.
  const relatives = new Set(p.levels.map((l) => l.relative));
  const expected: RelativeLevel = relatives.size > 1
    ? 'multiLevel'
    : ([...relatives][0] ?? 'platformLevel');
  if (p.place !== expected) {
    bad('place', `#${p.stationIndex}`, `place déclarée ${p.place}, niveaux → ${expected}`);
  }

  // --- Halls ---
  for (const n of p.concourses) {
    if (!levels.has(n.levelId)) bad('danglingLevel', n.id, `niveau inconnu : ${n.levelId}`);
    if (!rectValid(n.rect)) bad('rect', n.id, 'emprise dégénérée');
    if (!rectInside(n.rect, p.footprint)) {
      bad('footprint', n.id, 'hall hors de l’emprise déclarée du profil');
    }
    const h = n.headroom ?? levels.get(n.levelId)?.headroom ?? 0;
    if (isWalkable(n.depiction) && h < MIN_HEADROOM) {
      bad('headroom', n.id, `hall praticable sous ${MIN_HEADROOM} m de hauteur libre`);
    }
    // G1, et sous sa forme exacte : un hall qui vit à l'altitude des nappes de
    // sol ne franchit pas la rive du ballast. Le ballast porte un train, il ne
    // se dérobe pas — un couloir qui traverse la voie passe DESSOUS, sur un
    // niveau plus bas, ou il n'existe pas.
    const nl = levels.get(n.levelId);
    if (nl && atGroundSheet(nl) && n.rect.x0 < BALLAST_KEEP_X) {
      bad(
        'acrossBallast',
        n.id,
        `atteint x = ${n.rect.x0} à l’altitude du ballast : il faut passer sous la voie`,
      );
    }
  }

  // --- Accès de quai ---
  const accesses = new Map(p.platformAccesses.map((a) => [a.id, a]));
  for (const a of p.platformAccesses) {
    const target = nodes.get(a.toNodeId);
    if (!target) {
      bad('danglingNode', a.id, `dessert un hall inconnu : ${a.toNodeId}`);
      continue;
    }
    const level = levels.get(target.levelId);
    if (!level) continue;
    const goesUp = level.floorY > 0;
    if ((a.rise === 'up') !== goesUp && level.floorY !== 0) {
      bad('riseSign', a.id, `déclaré « ${a.rise} » vers un niveau à ${level.floorY} m`);
    }
    if (isWalkable(a.depiction) && !isWalkable(target.depiction)) {
      bad('deadAccess', a.id, 'accès praticable vers un hall qui ne l’est pas');
    }
  }
  if (!accesses.has(p.primaryAccessId)) {
    bad('primaryAccess', `#${p.stationIndex}`, `accès principal inconnu : ${p.primaryAccessId}`);
  } else if (!isWalkable(accesses.get(p.primaryAccessId)!.depiction)) {
    bad('primaryAccess', p.primaryAccessId, 'accès principal non praticable');
  }

  // --- Liens ---
  const endpoint = (id: string) => nodes.has(id) || accesses.has(id);
  for (const c of p.corridors) {
    if (!endpoint(c.from)) bad('danglingNode', c.id, `origine inconnue : ${c.from}`);
    if (!endpoint(c.to)) bad('danglingNode', c.id, `destination inconnue : ${c.to}`);
    if (!rectValid(c.rect)) bad('rect', c.id, 'emprise dégénérée');
    if (!rectInside(c.rect, p.footprint)) {
      bad('footprint', c.id, 'couloir hors de l’emprise déclarée du profil');
    }
    const min = isWalkable(c.depiction) ? MIN_BRANCH_WIDTH : 0;
    if (c.width < min) {
      bad('width', c.id, `largeur de ${c.width} m, minimum ${min}`);
    }
    const a = nodes.get(c.from);
    const b = nodes.get(c.to);
    if (a && b) {
      const ya = levels.get(a.levelId)?.floorY ?? 0;
      const yb = levels.get(b.levelId)?.floorY ?? 0;
      const sign = yb > ya + 0.05 ? 1 : yb < ya - 0.05 ? -1 : 0;
      if (sign !== c.rise) {
        bad('riseSign', c.id, `rise ${c.rise} pour un dénivelé de ${(yb - ya).toFixed(2)} m`);
      }
      if (c.kind === 'open' && sign !== 0) {
        bad('openRise', c.id, 'continuité franche entre deux niveaux différents');
      }
    }
  }

  // --- Portillons ---
  if (p.gateGroups.length === 0) {
    bad('noGate', `#${p.stationIndex}`, 'aucun groupe de portillons');
  }
  for (const g of p.gateGroups) {
    const from = nodes.get(g.from);
    const to = nodes.get(g.to);
    if (!from) bad('danglingNode', g.id, `côté payant inconnu : ${g.from}`);
    if (!to) bad('danglingNode', g.id, `côté libre inconnu : ${g.to}`);
    if (from && from.fare !== 'paid') bad('fareSide', g.id, 'côté « from » non payant');
    if (to && to.fare !== 'free') bad('fareSide', g.id, 'côté « to » non libre');
    if (g.passages < 1) bad('passages', g.id, 'groupe sans aucun passage');
    if (isWalkable(g.depiction) && g.passages < 1) {
      bad('passages', g.id, 'groupe praticable sans passage franchissable');
    }
    if (!rectValid(g.rect)) bad('rect', g.id, 'emprise dégénérée');
    if (!g.nameJp || !g.nameEn) bad('gateName', g.id, 'groupe de portillons sans nom');
  }

  // --- Sorties ---
  for (const e of p.exits) {
    const node = nodes.get(e.fromNodeId);
    if (!node) {
      bad('danglingNode', e.id, `part d’un hall inconnu : ${e.fromNodeId}`);
      continue;
    }
    if (node.fare !== 'free') bad('fareSide', e.id, 'sortie branchée en zone payante');
    if (!e.nameJp || !e.nameEn) bad('exitName', e.id, 'sortie sans nom');
  }

  // --- Correspondances, commerces, repères ---
  for (const t of p.transferPortals) {
    if (!nodes.has(t.fromNodeId)) bad('danglingNode', t.id, `hall inconnu : ${t.fromNodeId}`);
    if (t.lines.length === 0) bad('noLine', t.id, 'correspondance sans ligne');
    // Une ligne de contrôle entre exploitants se VOIT : elle a des bornes, un
    // guichet et un panneau. La réduire à une flèche perdrait précisément ce
    // que `gated` sert à dire.
    if (t.gated && t.depiction === 'signOnly') {
      bad('gatedSign', t.id, 'correspondance gardée réduite à un panneau');
    }
  }
  for (const z of p.commercialZones) {
    const node = nodes.get(z.nodeId);
    if (!node) {
      bad('danglingNode', z.id, `hall inconnu : ${z.nodeId}`);
      continue;
    }
    if (!rectValid(z.rect)) bad('rect', z.id, 'emprise dégénérée');
    if (!rectInside(z.rect, node.rect)) bad('inside', z.id, 'commerce hors de son hall');
    // Nommer un commerce qu'on n'a pas vérifié est la faute que tout ce format
    // sert à empêcher.
    if (z.brand && z.status !== 'namedVerified' && z.status !== 'gallery') {
      bad('unverifiedBrand', z.id, `enseigne « ${z.brand} » sous le statut ${z.status}`);
    }
    if (!z.brand && (z.status === 'namedVerified' || z.status === 'gallery')) {
      bad('missingBrand', z.id, `statut ${z.status} sans enseigne`);
    }
    if (z.enterable && z.status === 'facade') {
      bad('facade', z.id, 'façade déclarée pénétrable');
    }
  }
  for (const k of p.landmarks) {
    if (!nodes.has(k.nodeId)) bad('danglingNode', k.id, `hall inconnu : ${k.nodeId}`);
  }
  for (const part of p.works?.partitions ?? []) {
    const node = nodes.get(part.nodeId);
    if (!node) {
      bad('danglingNode', part.id, `hall inconnu : ${part.nodeId}`);
      continue;
    }
    if (!rectInside(part.rect, node.rect)) bad('inside', part.id, 'palissade hors de son hall');
  }

  // --- Le graphe praticable ---
  //
  // Depuis les accès de quai, en ne franchissant que ce qui est praticable :
  // atteint-on un groupe de portillons, puis une zone libre, puis une sortie ?
  // C'est la question qui distingue une gare d'une collection de rectangles.
  //
  // LES ACCÈS SONT PLUSIEURS, et c'est Harajuku qui l'a montré. Le relevé y
  // donne DEUX ensembles complets - le souterrain de Takeshita au B1F et le
  // bâtiment de 2020 au 2F - si petits que l'un ne suffirait pas à faire une
  // gare, et sans aucun passage de l'un à l'autre hors quai. Ils sont pourtant
  // tous les deux praticables : on remonte sur le quai, on marche, on
  // redescend par l'autre bout. Ne partir que de l'accès principal aurait
  // déclaré le second « coupé du réseau » alors que c'est le QUAI qui les
  // relie - et le quai n'est pas un nœud du profil, il est ce sur quoi le
  // profil se greffe.
  const walkNodes = new Set(p.concourses.filter((n) => isWalkable(n.depiction)).map((n) => n.id));
  const adj = new Map<string, string[]>();
  const join = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  for (const c of p.corridors) {
    if (!isWalkable(c.depiction)) continue;
    join(c.from, c.to);
    join(c.to, c.from);
  }
  for (const g of p.gateGroups) {
    if (!isWalkable(g.depiction)) continue;
    join(g.from, g.to);
    join(g.to, g.from);
  }
  const primary = accesses.get(p.primaryAccessId);
  if (primary && isWalkable(primary.depiction)) {
    const reached = new Set<string>();
    const queue = p.platformAccesses
      .filter((a) => isWalkable(a.depiction))
      .map((a) => a.toNodeId);
    while (queue.length) {
      const at = queue.pop()!;
      if (reached.has(at) || !walkNodes.has(at)) continue;
      reached.add(at);
      for (const next of adj.get(at) ?? []) queue.push(next);
    }
    const gate = p.gateGroups.find(
      (g) => isWalkable(g.depiction) && reached.has(g.from) && reached.has(g.to),
    );
    if (!gate) {
      bad('unreachableGate', p.primaryAccessId, 'aucun groupe de portillons franchissable depuis l’accès principal');
    }
    const exit = p.exits.find((e) => isWalkable(e.depiction) && reached.has(e.fromNodeId));
    if (!exit) {
      bad('unreachableExit', p.primaryAccessId, 'aucune sortie atteignable depuis l’accès principal');
    }
    for (const n of walkNodes) {
      if (!reached.has(n)) bad('orphanNode', n, 'hall praticable coupé du reste du réseau');
    }
  }

  return out;
}
