// Ce qu'il y a au-delà du bas des marches : la gare elle-même.
//
// Le jeu s'arrêtait au bord du quai. On descendait du train, on marchait deux
// cent vingt mètres, on descendait cinq marches dans une trémie, et une limite
// invisible arrêtait le pas : tout ce qui était en dessous - le couloir, les
// portillons, le hall - était du décor qu'on regardait sans y aller.
//
// Ce fichier décrit le volume qui commence là où la trémie finit. Il ne dessine
// rien et ne fait marcher personne : il POSE les rectangles, et les deux
// consommateurs - le rendu (three/station/Concourse) et la marche
// (systems/walkable, par systems/stationPlacement) - les lisent tous les deux.
// Un portillon franchissable là où il n'est pas dessiné se verrait au premier
// pas.
//
// GÉOMÉTRIE. Tout est écrit dans le REPÈRE DU QUAI - celui dans lequel
// three/station/Station construit sa géométrie, avant la rotation de π du côté
// d'ouverture. Le hall se retourne donc avec la gare, sans une ligne de plus.
//
//   x : depuis l'axe de la voie vers le quai. Le bord est en PSD_X, le fond en
//       PSD_X + depth. Le hall tient DANS cette bande, et ce n'est pas un choix
//       d'esthète : au-delà, la nappe de rue et le ballast reprennent leur
//       place un mètre sous la dalle (three/groundStrip) et couperaient le hall
//       en deux à hauteur d'épaule.
//   z : le long du quai. C'est l'axe du hall : la trémie descend vers +z, le
//       couloir la prolonge, et le hall continue tout droit. Un hall
//       transversal sortirait de l'emprise en trois mètres.
//   y : relatif au sol du QUAI, comme le reste des cotes de trémie.
//
// LE SENS DU NIVEAU. `place` dit de quel côté du quai il se trouve, et cela ne
// se décrète pas : une gare sur viaduc a sa billetterie dessous, au niveau de
// la rue ; une gare en TRANCHÉE l'a dessus, sur le bâtiment qui enjambe la
// tranchée - c'est exactement ce que montre le plan de Mejiro. Les deux sens
// sont bâtis : la volée descend dans une trémie qui perce la dalle, ou monte
// sur une volée posée dessus qui perce l'auvent. Ce sont deux ouvrages, pas un
// signe qui change (voir data/stationGeometry).

import { konbiniPlan, type KonbiniPlan } from './konbiniPlan.ts';
import { layoutFor } from './stationLayouts.ts';
import { stationExits } from './lines.ts';
import {
  ASCENT_FLOOR_Y,
  ASCENT_LEN,
  DESCENT_LEN,
  PSD_X,
  STAIR_HALF_Z,
  STAIR_LOWER_CEIL_Y,
  STAIR_LOWER_Y,
} from './stationGeometry.ts';

/** De quel côté du quai se tient le niveau de correspondance. */
export type ConcoursePlace =
  /** Sous les voies : viaduc (la rue passe dessous) ou passage souterrain. */
  | 'under'
  /** Au-dessus : le bâtiment enjambe la tranchée ou le faisceau. */
  | 'over';

/** Rectangle du repère quai, bornes comprises. */
export interface InteriorRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Un passage de la ligne de portillons. */
export interface FareGatePassage {
  /** Axe du passage. */
  x: number;
  /** Largeur libre entre les deux bornes. */
  width: number;
  /**
   * Passage large (幅広改札) : fauteuils, bagages, poussettes. Il y en a un par
   * ligne de portillons, et c'est toujours celui du bout.
   */
  wide: boolean;
}

/** La ligne de portillons : 改札口. */
export interface FareGateLine {
  /** Nom réel de la sortie, tel qu'il est écrit au-dessus. */
  nameJp: string;
  nameRomaji: string;
  /** Emprise en z de la ligne : les bornes tiennent dedans. */
  z0: number;
  z1: number;
  /** Bornes : ce qu'on contourne. */
  cabinets: InteriorRect[];
  /** Ce par quoi on passe. */
  passages: FareGatePassage[];
}

/** Une bouche de sortie, au fond de la zone libre. */
export interface ConcourseExit {
  /** Axe de la bouche. */
  x: number;
  halfWidth: number;
  /**
   * Rang de la sortie dans `stationExits`. Les noms ne sont PAS recopiés ici :
   * ce sont ceux des potences du quai (data/lines), et une gare qui fléche
   * 八重洲中央口 en haut des marches ne peut pas fléchier autre chose en bas.
   * Le rendu tire son panneau du même `makeExitSign(slot)` que le quai.
   */
  slot: number;
}

/**
 * Ce qui meuble le hall. Chaque famille se reconnaît à sa SILHOUETTE : c'est ce
 * qui décide de sa profondeur, et donc de la place qu'elle prend.
 */
export type FixtureKind =
  /** 券売機 - la batterie de distributeurs de titres, en zone libre. */
  | 'ticket'
  /** 精算機 - l'ajusteur de fin de course, côté payant, isolé et signalé. */
  | 'fareAdjust'
  /** コインロッカー - la grille de consignes, trois tailles de portes. */
  | 'lockers'
  /** NEWDAYS - le konbini de gare, devanture vitrée pleine hauteur. */
  | 'konbini'
  /** 自販機 - boissons, la caisse creusée de trois niches. */
  | 'vending'
  /** アイス / カップ麺 / 軽食 - la même caisse, un autre contenu. */
  | 'vendingFood'
  /** 駅スタンプ - la table du tampon de gare, avec son cahier. */
  | 'stamp'
  /** みどりの窓口 - le comptoir vitré, sa banque et ses écrans. */
  | 'office'
  /** Banc adossé à la paroi. */
  | 'bench'
  /** Batterie de tri : trois bacs côte à côte. */
  | 'bin'
  /** 周辺案内図 - le plan de quartier, panneau mural. */
  | 'map'
  /** ecute / atré - la galerie commerciale de gare, sous marque réelle. */
  | 'gallery'
  /** Coffret d'extincteur, rouge, à hauteur de main. */
  | 'extinguisher'
  /** Armoire de défibrillateur (AED), verte. */
  | 'aed'
  /** Porte-parapluies, près des bouches de sortie. */
  | 'umbrella'
  /** Bac à plante : le seul vert d'un hall souterrain. */
  | 'plant'
  /** Panneau d'affichage de service : horaires, travaux, objets trouvés. */
  | 'notice';

/** Un meuble posé le long d'une paroi du hall. */
export interface Fixture {
  kind: FixtureKind;
  /** Emprise au sol. C'est aussi, telle quelle, l'obstacle de marche. */
  rect: InteriorRect;
  /**
   * Sens dans lequel la façade regarde, le long de x : -1 vers l'axe de la
   * voie, +1 vers le fond de quai. C'est l'opposé de la paroi qui le porte.
   */
  facing: -1 | 1;
  /** Rang dans sa famille : sert à varier visuels et contenus sans hasard. */
  slot: number;
}

export interface StationInterior {
  /**
   * Le niveau est-il réellement construit ?
   *
   * Il l'a longtemps été pour les seules gares dont le hall est SOUS le quai,
   * faute de volée montante pour les autres. Les deux sens d'accès étant
   * maintenant dessinés, le drapeau vaut partout - il reste parce que la
   * question se reposera : une gare spéciale peut avoir un niveau qu'on
   * déclare avant de savoir le construire, et le rendu comme la marche doivent
   * lire la même réponse.
   */
  built: boolean;
  place: ConcoursePlace;
  /** Sol du niveau, relatif au sol du quai. */
  floorY: number;
  /** Plafond du niveau. */
  ceilY: number;
  /** Zone payante (改札内), du débouché du couloir à la ligne de portillons. */
  paid: InteriorRect;
  gate: FareGateLine;
  /** Zone libre (改札外), de la ligne de portillons aux bouches de sortie. */
  free: InteriorRect;
  exits: ConcourseExit[];
  /** Enseigne de la galerie commerciale de la gare, quand elle en a une. */
  brand?: GalleryBrand;
  /** Le mobilier du niveau, rangé le long des deux parois. */
  fixtures: Fixture[];
  /**
   * Pilastres : la trame porteuse, engagée dans les deux parois.
   *
   * Un souterrain de gare n'est pas une boîte lisse - il est porté, et ses
   * poteaux se voient. Ils sont ENGAGÉS dans la paroi et non plantés au milieu,
   * pour deux raisons : c'est ce que fait un couloir étroit dans la réalité, et
   * une rangée centrale couperait en deux un passage qui fait déjà à peine
   * cinq mètres. Ils sautent les travées occupées - on ne plante pas un poteau
   * au milieu d'une devanture de konbini.
   */
  pilasters: InteriorRect[];
  /**
   * Tout ce qui occupe le sol et se contourne : bornes de portillons, joues
   * latérales de la ligne, mobilier. Le rendu les dessine, la marche les évite,
   * et c'est la même liste.
   */
  obstacles: InteriorRect[];
}

// --- Cotes du niveau ------------------------------------------------------

/** Longueur de la zone payante, du débouché du couloir aux portillons. */
const PAID_LEN = 12;
/** Emprise en z de la ligne de portillons : la longueur d'une borne. */
const GATE_DEPTH = 1.7;
/**
 * Longueur de la zone libre, des portillons aux bouches de sortie.
 *
 * Elle a grandi avec ce qu'elle contient : neuf mètres suffisaient à un hall
 * nu, pas à une billetterie SUIVIE d'un guichet et d'un plan, avec un konbini
 * et des consignes en face. La place est gratuite - le quai fait deux cent
 * vingt-quatre mètres et le hall en occupe une quarantaine.
 */
const FREE_LEN = 15;
/** Retrait des parois latérales par rapport aux rives de la dalle. */
const SIDE_INSET = 0.35;
/**
 * Demi-largeur d'une borne de portillon.
 *
 * Les quatre cotes qui suivent sont PUBLIÉES parce que deux moteurs les posent
 * maintenant : celui-ci, et le compilateur de profil
 * (`data/stationConcourseBuild`). Une ligne de portillons dont les bornes ne
 * font pas la même largeur selon le chemin qui l'a construite serait la
 * meilleure façon de rendre le relevé invérifiable.
 */
export const CABINET_HALF_X = 0.18;
/** Largeur libre d'un passage ordinaire, et d'un passage large. */
export const PASSAGE_W = 0.62;
export const PASSAGE_WIDE_W = 0.92;
/**
 * Marge latérale du fuseau d'un passage : jusqu'où l'on est « dans sa file ».
 *
 * On se présente à un portillon en visant sa baie, pas en s'alignant au
 * centimètre. Trente-cinq centimètres de part et d'autre, et c'est la même
 * cote pour tout le monde : ce qui fait claquer les battants devant quelqu'un
 * (`systems/fareGate`) et ce qui dit quelle baie est déjà prise
 * (`systems/concourseRoute`) doivent se répondre, sans quoi l'on écarte une
 * file qui n'existe pas ou l'on se range dans une baie où l'on n'est pas.
 */
export const PASSAGE_SLACK = 0.35;
/** Marge laissée entre le bout de la ligne de portillons et la paroi. */
export const GATE_MARGIN = 0.4;
/** Demi-largeur d'une bouche de sortie, quand le hall est assez large. */
export const EXIT_HALF_X = 1.15;
/**
 * Trumeau minimal entre deux bouches, et retour minimal contre une paroi.
 *
 * Un hall de gare fait cinq mètres trente au plus étroit (Yūrakuchō) : deux
 * bouches de 2,30 m posées au tiers et aux deux tiers s'y CHEVAUCHAIENT de
 * cinquante centimètres. Le mur qui les sépare disparaissait - les deux volées
 * se touchaient - et les deux panneaux jaunes suspendus au-dessus, superposés
 * dans le même plan, se disputaient le tampon de profondeur.
 *
 * D'où ces deux cotes : une bouche RÉTRÉCIT plutôt que de mordre sur sa voisine
 * ou sur la paroi, et l'entraxe s'ouvre pour garder le trumeau. Là où le hall
 * est large, rien ne change - la bouche reste à sa cote nominale, au tiers et
 * aux deux tiers.
 */
export const EXIT_PIER = 0.7;
export const EXIT_JAMB = 0.5;
/**
 * Longueur au-delà de laquelle un meuble est une DEVANTURE et non un meuble :
 * il enjambe la trame porteuse au lieu de l'esquiver.
 */
const LONG_FRONT = 3;
/** Entraxe des pilastres, et leur saillie devant la paroi. */
const PILASTER_PITCH = 5.2;
const PILASTER_DEPTH = 0.22;
const PILASTER_LEN = 0.62;

/**
 * Épaisseur des parois du hall.
 *
 * Publiée parce que la BOUCHE DE SORTIE se mesure depuis le nu du fond, et que
 * deux consommateurs doivent tomber d'accord dessus au centimètre : le rendu
 * (`three/station/Concourse`) qui l'empile, et les voyageurs qui la montent
 * (`systems/concourseRoute`).
 */
export const HALL_WALL_T = 0.24;

// --- La volée d'une bouche de sortie -------------------------------------
//
// Ce qu'on voit au fond d'une bouche n'est pas un aplat lumineux : c'est une
// VOLÉE, six marches prises à contre-jour, et le jour derrière elles. Elle ne
// se monte pas - `systems/walkable` arrête le joueur au nu du fond, la volée
// vers la rue reste à dessiner (docs/STATION_INTERIOR, phase 4).
//
// Les VOYAGEURS, eux, s'en vont par là, et il fallait bien qu'ils aillent
// quelque part : ils s'y engagent et montent jusqu'à passer derrière le
// linteau. C'est la même règle que dans une trémie de quai - on ne s'efface
// pas à découvert, on s'efface là où le bâti cache -, et elle demande le
// PROFIL de la volée, pas seulement son image. D'où ces cotes ici : le rendu
// les empile, la marche des PNJ les monte.

/** Marches dessinées au fond d'une bouche. */
export const EXIT_MOUTH_STEPS = 6;
/** Giron, hauteur de la première contremarche, puis des suivantes. */
export const EXIT_MOUTH_GOING = 0.31;
export const EXIT_MOUTH_FIRST = 0.18;
export const EXIT_MOUTH_RISE = 0.35;
/** Nez de la première marche, mesuré depuis le NU INTÉRIEUR du fond du hall. */
export const EXIT_MOUTH_Z0 = HALL_WALL_T + 0.025;
/** Fin de la volée : au-delà, la cage se ferme. */
export const EXIT_MOUTH_END = EXIT_MOUTH_Z0 + EXIT_MOUTH_GOING * EXIT_MOUTH_STEPS;

/**
 * Altitude du sol dans une bouche, en `t` compté depuis le nu du fond du hall.
 *
 * Même convention que les volées de quai (`data/stationGeometry`) : la ligne
 * des nez relevée d'une demi-contremarche, qui passe par le milieu de chaque
 * giron. Un profil en marches ferait sauter le marcheur de trente-cinq
 * centimètres tous les trente et un.
 */
export function exitMouthFloorY(t: number): number {
  const u = (t - EXIT_MOUTH_Z0) / EXIT_MOUTH_GOING;
  if (u <= 0) return 0;
  if (u <= 0.5) return EXIT_MOUTH_FIRST * (u / 0.5);
  return EXIT_MOUTH_FIRST + Math.min(EXIT_MOUTH_STEPS - 1, u - 0.5) * EXIT_MOUTH_RISE;
}

/**
 * Hauteur du niveau au-dessus du quai, quand il est dessus.
 *
 * Ce n'est pas la symétrique du niveau bas, et ce n'est pas non plus un chiffre
 * d'ambiance : c'est ce qui fait passer un tablier au-dessus d'une rame. La
 * cote vient de la volée elle-même (`data/stationGeometry`) - vingt-neuf
 * contremarches de 17,5 cm - parce que c'est l'escalier qui décide de la
 * hauteur du plancher, jamais l'inverse.
 */
const OVER_FLOOR_Y = ASCENT_FLOOR_Y;

// --- Ce qui change d'une gare à l'autre ----------------------------------

/**
 * Les deux galeries commerciales de gare de JR East présentes sur la boucle.
 *
 * Ce ne sont pas des konbini : ce sont des ENSEIGNES DE GARE, exploitées par le
 * groupe JR, et une gare qui en porte une l'annonce sur ses plans de quai -
 * c'est d'ailleurs comme cela qu'on les lit sur le relevé d'Ueno, où `ecute` et
 * `atré` figurent chacune de son côté du quai.
 */
export type GalleryBrand = 'ecute' | 'atre';

interface Spec {
  /** Code JY et nom, pour se relire : l'ordre suit STATIONS. */
  name: string;
  /** Défaut : 'under'. */
  place?: ConcoursePlace;
  /** Nom de la sortie principale, tel qu'il est écrit au-dessus des portillons. */
  gateJp: string;
  gate: string;
  /**
   * Galerie commerciale de la gare, quand elle en a une.
   *
   * Liste PRUDENTE et incomplète à dessein : n'y figurent que les gares dont
   * l'enseigne est établie. Une gare absente d'ici n'affirme pas qu'elle n'a
   * rien - elle affirme qu'on ne l'a pas relevé, ce qui n'est pas la même
   * chose et se corrige ligne à ligne.
   */
  brand?: GalleryBrand;
  /**
   * Gare dont le niveau ne se paramètre pas : on le déclare, on ne le construit
   * pas ici.
   */
  bespoke?: true;
}

/**
 * Les trente gares, dans l'ordre JY01 → JY30.
 *
 * LES NOMS DE PORTILLON SONT UN RELEVÉ, pas une génération. Une gare japonaise
 * ne numérote pas ses改札 : elle les NOMME, et le nom dit où l'on sort -
 * 電気街口 à Akihabara, ハチ公改札 à Shibuya, 早稲田口 à Takadanobaba. Les
 * gares dont le nom n'est pas établi ici portent 中央改札, qui est réel,
 * courant, et n'invente rien : c'est la valeur prudente, pas un défaut
 * technique. Une par une, elles se remplaceront par le relevé.
 *
 * Les SORTIES, elles, ne figurent pas ici : elles sont déjà relevées pour les
 * potences du quai (data/lines, `stationExits`), et une gare ne peut pas
 * flécher 八重洲中央口 en haut des marches et autre chose en bas.
 */
const SPECS: readonly Spec[] = [
  { name: 'JY01 Tokyo', gateJp: '丸の内中央口', gate: 'Marunouchi Central' },
  // Le plan ne NOMME pas les deux groupes : il les étiquette « Gate ». C'est
  // 改札口 tout court, et « West » est le nom d'une SORTIE.
  { name: 'JY02 Kanda', gateJp: '改札口', gate: 'Gate' },
  { name: 'JY03 Akihabara', brand: 'atre', gateJp: '電気街口', gate: 'Electric Town' },
  { name: 'JY04 Okachimachi', gateJp: '北口', gate: 'North' },
  // Le plan de quai d'Ueno en montre quatre, sur deux niveaux : 不忍 et 中央 en
  // M2F et 1F au sud, 公園 et 入谷 en 3F au nord. Deux groupes d'accès, donc
  // deux halls - c'est une gare à part, et elle attend sa phase.
  { name: 'JY05 Ueno', brand: 'ecute', gateJp: '公園口改札', gate: 'Park' },
  // Plan japonais : 改札口, et 南口 est la sortie.
  { name: 'JY06 Uguisudani', gateJp: '改札口', gate: 'Gate' },
  // Deux ponts-concours enjambent tout le faisceau : le hall est dessus.
  // Nippori a déjà son niveau de correspondance : ce sont ses DEUX
  // PONTS-CONCOURS, dessinés par sa charpente signature, dont la sous-face est
  // à 5,10 m - exactement la cote d'un hall d'en haut. Y poser en plus le hall
  // générique reviendrait à bâtir deux fois la même chose, l'une dans l'autre.
  // Elle attend son traitement propre (docs/STATION_INTERIOR, phase 6).
  { name: 'JY07 Nippori', brand: 'ecute', place: 'over', bespoke: true, gateJp: '北改札', gate: 'North' },
  { name: 'JY08 Nishi-Nippori', gateJp: '改札口', gate: 'Gate' },
  { name: 'JY09 Tabata', brand: 'atre', place: 'over', gateJp: '北口', gate: 'North' },
  { name: 'JY10 Komagome', place: 'over', gateJp: '改札口', gate: 'Gate' },
  { name: 'JY11 Sugamo', place: 'over', gateJp: '改札口', gate: 'Gate' },
  { name: 'JY12 Ōtsuka', gateJp: '改札口', gate: 'Gate' },
  { name: 'JY13 Ikebukuro', gateJp: '中央改札1', gate: 'Central 1' },
  { name: 'JY14 Mejiro', place: 'over', gateJp: '改札口', gate: 'Gate' },
  { name: 'JY15 Takadanobaba', gateJp: '早稲田口', gate: 'Waseda' },
  { name: 'JY16 Shin-Ōkubo', gateJp: '改札口', gate: 'Gate' },
  { name: 'JY17 Shinjuku', gateJp: '中央東改札', gate: 'Central East' },
  // Le plan montre le bloc West/East comme le principal, pas le North.
  { name: 'JY18 Yoyogi', gateJp: '西口', gate: 'West' },
  // CORRECTION : le contrôle du bâtiment de 2020 s'appelle 表参道改札 ; « West »
  // est le nom d'une sortie, pas du portillon.
  { name: 'JY19 Harajuku', gateJp: '表参道改札', gate: 'Omote-sandō' },
  { name: 'JY20 Shibuya', gateJp: 'ハチ公改札', gate: 'Hachikō' },
  { name: 'JY21 Ebisu', brand: 'atre', gateJp: '西口', gate: 'West' },
  { name: 'JY22 Meguro', brand: 'atre', place: 'over', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY23 Gotanda', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY24 Ōsaki', gateJp: '北改札', gate: 'North' },
  { name: 'JY25 Shinagawa', brand: 'ecute', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY26 Takanawa Gateway', gateJp: '北改札', gate: 'North' },
  { name: 'JY27 Tamachi', gateJp: '北改札', gate: 'North' },
  { name: 'JY28 Hamamatsuchō', gateJp: '北口', gate: 'North' },
  // CORRECTION : 烏森口 est une SORTIE. Le plan nomme les contrôles South Gate
  // et North Gate ; c'est le sud qui dessert Karasumori.
  { name: 'JY29 Shimbashi', gateJp: '南改札', gate: 'South' },
  { name: 'JY30 Yūrakuchō', gateJp: '中央口', gate: 'Central' },
];

/**
 * Ce qui est plaqué sur la paroi et ne se contourne pas.
 *
 * La règle n'est pas « c'est petit » mais « c'est DANS le mur » : moins de
 * vingt-cinq centimètres de saillie, on passe devant sans le toucher, et en
 * faire un obstacle rétrécirait le hall pour rien.
 */
const FLUSH = new Set<FixtureKind>(['map', 'extinguisher', 'aed', 'notice']);

/**
 * Un point du repère de la BOUTIQUE, rabattu dans celui du quai.
 *
 * Deux lignes, et elles sont l'exact inverse du quart de tour que le rendu
 * applique à son groupe (`three/station/Fixtures`, `yaw`) : une façade qui
 * regarde vers +x tourne son x local vers -z, et l'autre vers +z. Se tromper de
 * sens ne se verrait pas au rendu - il est symétrique - mais mettrait la porte
 * du côté du mur.
 *
 * Trois lecteurs en dépendent maintenant, et c'est pour cela qu'elle est
 * publiée : les emprises qui barrent (`interiorSolids`, juste dessous), les
 * clients qui entrent faire leurs courses (`systems/concourseRoute`), et le
 * test qui tient les deux bouts.
 */
export function shopToHall(f: Fixture, lx: number, lz: number): { x: number; z: number } {
  const cx = (f.rect.x0 + f.rect.x1) / 2;
  const cz = (f.rect.z0 + f.rect.z1) / 2;
  return f.facing === 1 ? { x: cx + lz, z: cz - lx } : { x: cx - lz, z: cz + lx };
}

/** L'agencement de CETTE boutique, aux cotes de son emprise. */
export function shopPlan(f: Fixture): KonbiniPlan {
  return konbiniPlan(f.rect.z1 - f.rect.z0, f.rect.x1 - f.rect.x0);
}

/**
 * Ce qu'un meuble oppose RÉELLEMENT à la marche.
 *
 * Pour tout le mobilier, c'est son emprise, et il n'y a rien à ajouter : un
 * distributeur de titres se contourne, une consigne aussi. Le konbini fait
 * exception depuis qu'on y entre : sa devanture est percée d'une baie, et
 * l'intérieur est du sol comme un autre. Ce qui barre chez lui, ce sont ses
 * parois - la devanture EN DEUX MORCEAUX, un de chaque côté de l'entrée - et
 * ses meubles, décrits une seule fois dans `data/konbiniPlan` et lus aussi bien
 * ici que par le rendu.
 */
function interiorSolids(f: Fixture): InteriorRect[] {
  if (f.kind !== 'konbini') return [f.rect];
  return shopPlan(f).solids.map((s) => {
    const a = shopToHall(f, s.x0, s.z0);
    const b = shopToHall(f, s.x1, s.z1);
    return {
      x0: Math.min(a.x, b.x),
      x1: Math.max(a.x, b.x),
      z0: Math.min(a.z, b.z),
      z1: Math.max(a.z, b.z),
    };
  });
}

// --- Construction ---------------------------------------------------------

/**
 * Nombre de passages d'une ligne de portillons.
 *
 * Deux bornes pour l'affluence, et la largeur disponible tranche : une gare
 * fréquentée n'a pas plus de portillons que son hall n'est large. Sans ce
 * plafond, Shinjuku posait sept passages dans cinq mètres et la ligne sortait
 * par les murs.
 */
function passageCount(crowd: number, width: number): number {
  const wanted = Math.round(2 + crowd * 2);
  // largeur = n passages + (n + 1) bornes, plus la marge des deux bouts.
  const fits = Math.floor(
    (width - 2 * GATE_MARGIN - 2 * CABINET_HALF_X) / (PASSAGE_W + 2 * CABINET_HALF_X),
  );
  return Math.max(2, Math.min(wanted, fits));
}

function buildGate(
  spec: Spec,
  crowd: number,
  x0: number,
  x1: number,
  z0: number,
): FareGateLine {
  const width = x1 - x0;
  const n = passageCount(crowd, width);
  const z1 = z0 + GATE_DEPTH;
  // Le passage large est celui du bout, côté fond de quai : c'est celui qu'on
  // trouve sans chercher quand on pousse une valise.
  const widths = Array.from({ length: n }, (_, i) => (i === n - 1 ? PASSAGE_WIDE_W : PASSAGE_W));
  const span = widths.reduce((a, w) => a + w, 0) + (n + 1) * 2 * CABINET_HALF_X;
  let x = x0 + (width - span) / 2;

  const cabinets: InteriorRect[] = [];
  const passages: FareGatePassage[] = [];
  // Joue de gauche : ce qui reste entre la paroi et la première borne se ferme,
  // sinon on contourne toute la ligne par le côté.
  if (x > x0) cabinets.push({ x0, x1: x, z0, z1 });
  for (let i = 0; i < n; i++) {
    cabinets.push({ x0: x, x1: x + 2 * CABINET_HALF_X, z0, z1 });
    x += 2 * CABINET_HALF_X;
    passages.push({ x: x + widths[i] / 2, width: widths[i], wide: i === n - 1 });
    x += widths[i];
  }
  cabinets.push({ x0: x, x1: x + 2 * CABINET_HALF_X, z0, z1 });
  x += 2 * CABINET_HALF_X;
  if (x < x1) cabinets.push({ x0: x, x1, z0, z1 });

  return { nameJp: spec.gateJp, nameRomaji: spec.gate, z0, z1, cabinets, passages };
}

// --- Le mobilier, rangé le long des parois -------------------------------

/**
 * Encombrement d'une famille de meubles : sa longueur le long de la paroi et sa
 * profondeur devant elle.
 *
 * La profondeur n'est pas décorative : c'est ce qui reste de passage au milieu.
 * Un konbini de 3,20 m de fond dans un hall de 5,30 m de large ne laisserait
 * plus qu'un mètre pour passer - c'est pourquoi il ne se pose que dans les
 * halls larges, et le moteur le refuse ailleurs plutôt que de l'y tasser.
 */
const SIZES: Record<FixtureKind, { len: number; depth: number }> = {
  ticket: { len: 3.4, depth: 0.72 },
  fareAdjust: { len: 1.0, depth: 0.72 },
  lockers: { len: 2.6, depth: 0.62 },
  // Le konbini a grandi avec ce qu'il contient : 6,40 m suffisaient à une
  // vitrine plaquée devant une boîte, pas à une boutique où l'on distingue le
  // comptoir, la gondole, le mur de vitrines et le meuble à magazines. Sa
  // PROFONDEUR, elle, ne bouge presque pas - c'est elle qui décide des gares
  // qui l'obtiennent, et 3,40 m est la dernière cote qui laisse encore deux
  // mètres de passage dans le hall le plus étroit de la boucle (Takadanobaba,
  // 5,40 m entre parois). Un centimètre de plus et deux gares le perdaient.
  konbini: { len: 7.8, depth: 3.4 },
  vending: { len: 1.2, depth: 0.78 },
  vendingFood: { len: 1.2, depth: 0.78 },
  stamp: { len: 1.1, depth: 0.68 },
  office: { len: 3.6, depth: 1.9 },
  bench: { len: 1.8, depth: 0.56 },
  bin: { len: 1.35, depth: 0.5 },
  map: { len: 1.6, depth: 0.16 },
  // Une galerie n'est pas un konbini : elle est plus longue, plus profonde, et
  // c'est ELLE qui donne son échelle au hall quand la gare en a une.
  gallery: { len: 9.5, depth: 3.6 },
  extinguisher: { len: 0.5, depth: 0.22 },
  aed: { len: 0.55, depth: 0.24 },
  umbrella: { len: 0.7, depth: 0.34 },
  plant: { len: 0.6, depth: 0.6 },
  notice: { len: 1.4, depth: 0.14 },
};

/**
 * Ce qu'une gare mérite, par zone et par paroi, dans l'ordre où on le range.
 *
 * L'ordre EST le classement par priorité : ce qui vient en premier est posé en
 * premier, au plus près de l'endroit d'où l'on arrive, et ce qui ne rentre plus
 * tombe. Le seuil d'affluence dit à partir de quelle gare la famille apparaît -
 * une gare à 0,7 n'a ni konbini, ni consigne, ni guichet, exactement comme en
 * vrai.
 */
interface Want {
  kind: FixtureKind;
  /** Affluence minimale (`crowdScale`) au-dessous de laquelle on s'en passe. */
  from?: number;
  /** Combien d'exemplaires, quand il en faut plusieurs à la suite. */
  count?: number;
  /** Ne se pose que si la gare déclare une enseigne de galerie. */
  needsBrand?: true;
  /**
   * Se range en partant du FOND de la zone, et avant tout le reste.
   *
   * Certains meubles ne sont pas rangés où il reste de la place : ils sont là
   * où on en a besoin. L'ajusteur de fin de course est de ceux-là - on le
   * cherche juste avant les portillons, une fois qu'on a compris qu'on est
   * descendu trop loin - et rangé dans l'ordre d'arrivée il tombait le dernier,
   * donc jamais, dans les gares bien garnies.
   */
  atEnd?: true;
}

/** Zone payante (改札内) : ce qu'on croise entre le bas des marches et la sortie. */
const PAID_NEAR: Want[] = [
  { kind: 'extinguisher' },
  { kind: 'vending' },
  { kind: 'vendingFood', from: 0.9 },
  { kind: 'bin' },
  { kind: 'bench' },
];
const PAID_FAR: Want[] = [
  { kind: 'map' },
  { kind: 'plant', from: 0.9 },
  { kind: 'bench' },
  { kind: 'fareAdjust', atEnd: true },
];
/** Zone libre (改札外) : la billetterie, les commerces, les consignes. */
const FREE_NEAR: Want[] = [
  // Le tampon est le premier meuble qu'on trouve en sortant des portillons :
  // c'est là qu'il est dans une vraie gare, à côté de la fenêtre du bureau, et
  // c'est ce que les voyageurs viennent chercher.
  { kind: 'stamp' },
  { kind: 'ticket' },
  { kind: 'notice' },
  { kind: 'aed' },
  { kind: 'umbrella' },
  // Le guichet se range par le FOND, et ce n'est pas un détail d'implantation :
  // c'est le seul meuble profond de cette paroi, donc le seul qui puisse
  // interdire une devanture en face de lui. Rangé dans l'ordre d'arrivée, il
  // tombait juste devant la boutique et le hall perdait l'une ou l'autre ;
  // rangé au fond, il laisse à la devanture la longueur qui suit les
  // portillons - et c'est là qu'il est en vrai, au bout des 券売機.
  { kind: 'office', from: 1.3, atEnd: true },
];
const FREE_FAR: Want[] = [
  // La galerie passe avant le konbini : une gare qui a l'une n'a pas besoin de
  // l'autre au même endroit, et c'est la galerie qu'on voit d'abord.
  { kind: 'gallery', needsBrand: true },
  { kind: 'konbini', from: 1.2 },
  { kind: 'lockers', from: 0.9 },
  { kind: 'vending' },
  { kind: 'map' },
  { kind: 'bin' },
];

/** Jeu laissé entre deux meubles voisins d'une même paroi. */
const FIXTURE_GAP = 0.55;
/**
 * Retrait d'un meuble devant sa paroi.
 *
 * Un meuble n'est pas dans le mur : il est devant le SOUBASSEMENT DE FAÏENCE,
 * qui déborde de cinq centimètres. Sans ce retrait, chaque caisse mordait dans
 * la faïence - invisible à l'œil, mais la sonde de volumes le voyait, et elle a
 * raison : deux surfaces qui se traversent finissent toujours par se voir.
 */
const WALL_CLEAR = 0.06;
/** Retrait des meubles par rapport aux deux bouts d'une zone. */
const ZONE_MARGIN = 1.1;
/**
 * Passage libre à garder au milieu, quoi qu'il arrive.
 *
 * C'est la seule contrainte qui refuse un meuble sans discuter : un hall où
 * l'on ne peut plus passer n'est pas meublé, il est bouché. Deux mètres, la
 * largeur d'un couloir de correspondance JR.
 */
const AISLE_MIN = 2.0;

/**
 * Range une liste de souhaits le long d'une paroi d'une zone.
 *
 * `wall` vaut -1 pour la paroi côté voie, +1 pour celle du fond de quai ; la
 * façade du meuble regarde toujours vers le milieu. On avance depuis le bord
 * `z0` de la zone, et l'on s'arrête quand il n'y a plus de place - jamais on ne
 * tasse, jamais on ne superpose.
 *
 * `facing` porte ce qui est DÉJÀ posé sur la paroi d'en face, et il n'est pas
 * décoratif : le passage du milieu n'est pas creusé par un meuble mais par
 * DEUX, et la seconde paroi ne peut pas décider comme si la première était nue.
 * Sans lui, une devanture de 3,60 m passait le contrôle sur un hall de 5,70 m -
 * il restait 2,10 m, donc « assez » - alors qu'un distributeur lui faisait déjà
 * face et que le passage réel tombait sous le mètre et demi.
 */
function fitWall(
  wants: readonly Want[],
  wall: -1 | 1,
  zone: InteriorRect,
  crowd: number,
  width: number,
  counter: Map<FixtureKind, number>,
  brand: GalleryBrand | undefined,
  pilasters: readonly InteriorRect[],
  facing: readonly Fixture[],
): Fixture[] {
  const out: Fixture[] = [];
  let z = zone.z0 + ZONE_MARGIN;
  let zEnd = zone.z1 - ZONE_MARGIN;
  /**
   * Ce qui resterait de passage si l'on posait ce meuble-là, à cet endroit-là :
   * la largeur de la zone, moins les deux retraits de faïence, moins le meuble,
   * moins le plus profond de ceux d'en face qui le regardent.
   */
  const aisleLeft = (z0: number, len: number, depth: number): number => {
    let opposite = 0;
    for (const f of facing) {
      if (f.rect.z0 < z0 + len && f.rect.z1 > z0) {
        opposite = Math.max(opposite, f.rect.x1 - f.rect.x0);
      }
    }
    return width - 2 * WALL_CLEAR - depth - opposite;
  };
  /**
   * Repousse `z` au-delà du premier pilastre qu'un meuble chevauche.
   *
   * Sauf s'il est LONG : une devanture de plusieurs mètres n'esquive pas un
   * poteau, elle est bâtie autour - un konbini de gare enjambe la trame, et
   * c'est le poteau qui disparaît derrière sa vitrine, pas la vitrine qui se
   * décale. Au-delà de trois mètres, on laisse donc passer, et le pilastre
   * consommé sera retiré de la trame.
   */
  const clearPilaster = (start: number, len: number): number => {
    if (len >= LONG_FRONT) return start;
    let at = start;
    for (const p of pilasters) {
      if (at < p.z1 + 0.12 && at + len > p.z0 - 0.12) at = p.z1 + 0.12;
    }
    return at;
  };
  /**
   * Repousse `z` au-delà de ce qui, EN FACE, étranglerait le passage.
   *
   * Un meuble profond qui en trouve un autre profond en face ne disparaît pas :
   * il se range plus loin, là où la paroi d'en face est nue. C'est ce que fait
   * une gare - le guichet n'est pas en face de la boutique, il est après - et
   * c'est ce qui permet à un hall de 6,70 m d'avoir les deux. Seul disparaît ce
   * qui ne passe nulle part, parce que le hall est trop étroit pour lui.
   */
  const clearFacing = (start: number, len: number, depth: number): number => {
    let at = start;
    for (let pass = 0; pass < facing.length + 1; pass++) {
      const blocker = facing.find(
        (f) => f.rect.z0 < at + len && f.rect.z1 > at
          && width - 2 * WALL_CLEAR - depth - (f.rect.x1 - f.rect.x0) < AISLE_MIN,
      );
      if (!blocker) break;
      at = blocker.rect.z1 + FIXTURE_GAP;
    }
    return at;
  };
  const place = (kind: FixtureKind, z0: number, len: number, depth: number) => {
    const slot = counter.get(kind) ?? 0;
    counter.set(kind, slot + 1);
    out.push({
      kind,
      rect: wall === -1
        ? { x0: zone.x0 + WALL_CLEAR, x1: zone.x0 + WALL_CLEAR + depth, z0, z1: z0 + len }
        : { x0: zone.x1 - WALL_CLEAR - depth, x1: zone.x1 - WALL_CLEAR, z0, z1: z0 + len },
      facing: wall === -1 ? 1 : -1,
      slot,
    });
  };

  // Ce qui se range par la fin, d'abord : sa place est réservée avant que le
  // reste ne la prenne.
  for (const want of wants) {
    if (!want.atEnd || crowd < (want.from ?? 0)) continue;
    const size = SIZES[want.kind];
    let start = zEnd - size.len;
    for (const p of pilasters) {
      if (start < p.z1 + 0.12 && start + size.len > p.z0 - 0.12) start = p.z0 - 0.12 - size.len;
    }
    if (start < z) continue;
    if (aisleLeft(start, size.len, size.depth) < AISLE_MIN) continue;
    place(want.kind, start, size.len, size.depth);
    zEnd = start - FIXTURE_GAP;
  }

  for (const want of wants) {
    if (want.atEnd) continue;
    if (crowd < (want.from ?? 0)) continue;
    if (want.needsBrand && !brand) continue;
    const size = SIZES[want.kind];
    // Le passage du milieu passe avant le meuble. Contre une paroi NUE d'en
    // face, il ne reste déjà pas deux mètres : le hall est trop étroit pour
    // cette famille-là, et aucun décalage n'y changera rien.
    if (width - 2 * WALL_CLEAR - size.depth < AISLE_MIN) continue;
    for (let k = 0; k < (want.count ?? 1); k++) {
      z = clearPilaster(z, size.len);
      z = clearFacing(z, size.len, size.depth);
      z = clearPilaster(z, size.len);
      if (z + size.len > zEnd) break;
      if (aisleLeft(z, size.len, size.depth) < AISLE_MIN) break;
      place(want.kind, z, size.len, size.depth);
      z += size.len + FIXTURE_GAP;
    }
  }
  return out;
}

/**
 * La trame de pilastres d'une paroi, sur toute la longueur du niveau.
 *
 * ELLE PASSE AVANT LE MOBILIER, et c'est l'ordre qui compte : une trame
 * porteuse ne se déplace pas parce qu'un distributeur voudrait sa place. C'est
 * déjà la règle du quai - « piliers et trémies sont posés par le gabarit et
 * font autorité, tout le mobilier vient ensuite se ranger autour » - et il n'y
 * avait aucune raison d'en changer sous terre. Le rangement du mobilier lit
 * donc cette liste et saute par-dessus.
 */
function pilastersFor(
  wall: -1 | 1,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  gate: FareGateLine,
): InteriorRect[] {
  const near = wall === -1;
  const out: InteriorRect[] = [];
  for (let z = z0 + PILASTER_PITCH / 2; z < z1 - 0.4; z += PILASTER_PITCH) {
    // La travée des portillons n'appartient pas à la trame : elle est tenue par
    // ses propres joues, qui montent au plafond d'une paroi à l'autre. Un
    // pilastre qui y tombait sortait au travers d'une borne.
    if (z > gate.z0 - PILASTER_LEN && z < gate.z1 + PILASTER_LEN) continue;
    out.push({
      x0: near ? x0 : x1 - PILASTER_DEPTH,
      x1: near ? x0 + PILASTER_DEPTH : x1,
      z0: z - PILASTER_LEN / 2,
      z1: z + PILASTER_LEN / 2,
    });
  }
  return out;
}

/**
 * Le niveau de correspondance d'une gare, ancré sur l'accès qui y mène.
 *
 * `accessZ` est le CENTRE de la trémie principale, en repère quai : le couloir
 * bas en sort vers +z et le hall le prolonge. C'est systems/stationPlacement
 * qui la choisit et qui appelle - lui seul sait où les trémies sont réellement
 * posées, et il n'y a pas deux façons de le savoir.
 */
export function interiorFor(index: number, accessZ: number): StationInterior {
  const i = ((index % 30) + 30) % 30;
  const spec = SPECS[i];
  const layout = layoutFor(i);
  const place = spec.place ?? 'under';

  const x0 = PSD_X + SIDE_INSET;
  const x1 = PSD_X + layout.depth - SIDE_INSET;
  // Le hall commence là où l'accès finit - au fond du couloir bas quand on
  // descend, au sommet de la volée quand on monte. Les deux se mesurent depuis
  // le même point, le NEZ de l'accès, à 2,60 m en amont de son centre : c'est
  // la seule façon d'être sûr que le sol ne se coupe pas au raccord.
  const under = place === 'under';
  const z0 = accessZ - STAIR_HALF_Z + (under ? DESCENT_LEN : ASCENT_LEN);
  const gateZ = z0 + PAID_LEN;
  const freeZ0 = gateZ + GATE_DEPTH;
  const freeZ1 = freeZ0 + FREE_LEN;

  const gate = buildGate(spec, layout.crowdScale, x0, x1, gateZ);
  // Autant de bouches que la gare a de sorties fléchées, réparties en travers
  // du fond : une au tiers, l'autre aux deux tiers. Sur un hall étroit elles se
  // resserrent et rétrécissent, mais elles gardent leur trumeau - deux bouches
  // qui se recouvrent ne sont plus deux sorties, c'est un trou.
  const slots = stationExits(i);
  const hallW = x1 - x0;
  const room = (hallW - 2 * EXIT_JAMB - (slots.length - 1) * EXIT_PIER) / (2 * slots.length);
  const exitHalf = Math.min(EXIT_HALF_X, room);
  const pitch = Math.max(hallW / (slots.length + 1), 2 * exitHalf + EXIT_PIER);
  const exitMid = (x0 + x1) / 2;
  const exits: ConcourseExit[] = slots.map((_, k) => ({
    x: exitMid + (k - (slots.length - 1) / 2) * pitch,
    halfWidth: exitHalf,
    slot: k,
  }));

  const paid: InteriorRect = { x0, x1, z0, z1: gateZ };
  const free: InteriorRect = { x0, x1, z0: freeZ0, z1: freeZ1 };
  const width = x1 - x0;
  const crowd = layout.crowdScale;
  // Un seul compteur pour toute la gare : le premier distributeur du hall et
  // celui d'en face ne montrent pas la même vitrine.
  const counter = new Map<FixtureKind, number>();
  // La trame porteuse d'abord, sur toute la longueur du niveau et par paroi ;
  // le mobilier se range ensuite dans ce qu'elle laisse.
  const nearPosts = pilastersFor(-1, x0, x1, z0, freeZ1, gate);
  const farPosts = pilastersFor(1, x0, x1, z0, freeZ1, gate);
  // L'ORDRE DES DEUX PAROIS EST UNE DÉCISION, pas une commodité d'écriture :
  // la seconde rangée voit ce que la première a posé en face d'elle, donc c'est
  // elle qui cède. On garnit d'abord le côté voie, celui des INDISPENSABLES -
  // une gare sans 券売機 n'est pas une gare, alors qu'une gare sans boutique
  // court la ligne -, et le fond ensuite, avec ses devantures. Ce qui ne trouve
  // pas deux mètres de passage y renonce, ou se range plus loin.
  const paidNear = fitWall(PAID_NEAR, -1, paid, crowd, width, counter, spec.brand, nearPosts, []);
  const paidFar = fitWall(PAID_FAR, 1, paid, crowd, width, counter, spec.brand, farPosts, paidNear);
  const freeNear = fitWall(FREE_NEAR, -1, free, crowd, width, counter, spec.brand, nearPosts, []);
  const freeFar = fitWall(FREE_FAR, 1, free, crowd, width, counter, spec.brand, farPosts, freeNear);
  const fixtures = [...paidNear, ...paidFar, ...freeNear, ...freeFar];

  // Les pilastres qu'une devanture enjambe sont retirés de la trame : ils sont
  // dans le mur de la boutique, pas dans le hall, et les laisser les ferait
  // ressortir au travers d'une vitrine.
  const swallowed = (p: InteriorRect, wall: -1 | 1) =>
    fixtures.some(
      (f) => f.facing === -wall
        && f.rect.z1 - f.rect.z0 >= LONG_FRONT
        && f.rect.z0 - 0.12 < p.z1
        && f.rect.z1 + 0.12 > p.z0,
    );
  const pilasters = [
    ...nearPosts.filter((p) => !swallowed(p, -1)),
    ...farPosts.filter((p) => !swallowed(p, 1)),
  ];

  return {
    // Les deux sens d'accès sont dessinés : le hall existe partout, sauf là où
    // la gare en a déjà un qui lui est propre.
    built: spec.bespoke !== true,
    place,
    floorY: under ? STAIR_LOWER_Y : OVER_FLOOR_Y,
    // Sous les voies, le plafond est la sous-face de la dalle du quai et rien
    // d'autre ne décide. Au-dessus, c'est un bâtiment : on lui donne la hauteur
    // libre d'un hall de gare, deux mètres quatre-vingt-dix plus la retombée.
    ceilY: under ? STAIR_LOWER_CEIL_Y : OVER_FLOOR_Y + 3.1,
    paid,
    gate,
    free,
    exits,
    brand: spec.brand,
    fixtures,
    pilasters,
    // Ce qui est DANS la paroi ne se contourne pas : un plan mural, un coffret
    // d'extincteur, une armoire de défibrillateur, un panneau d'affichage font
    // moins de vingt-cinq centimètres de saillie et l'on passe devant sans les
    // toucher. Tout le reste barre - pilastres compris.
    //
    // Sauf le konbini, qui n'est plus un bloc mais un LIEU : on y entre. Son
    // emprise cesse donc de barrer d'un seul tenant, et ce sont ses parois et
    // ses meubles qui prennent le relais - voir `interiorSolids`.
    obstacles: [
      ...gate.cabinets,
      ...fixtures.filter((f) => !FLUSH.has(f.kind)).flatMap(interiorSolids),
      ...pilasters,
    ],
  };
}

/** Le nom de la sortie principale, sans construire tout le niveau. */
export function gateNameFor(index: number): { jp: string; romaji: string } {
  const spec = SPECS[((index % 30) + 30) % 30];
  return { jp: spec.gateJp, romaji: spec.gate };
}
