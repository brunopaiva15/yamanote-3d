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
// tranchée - c'est exactement ce que montre le plan de Mejiro. Les gares
// `over` déclarent donc leur hall et ne le construisent pas encore : la volée
// MONTANTE reste à dessiner (voir docs/STATION_INTERIOR, phase 5), et `built`
// le dit sans mentir.

import { layoutFor } from './stationLayouts.ts';
import {
  PSD_X,
  STAIR_LOWER_CEIL_Y,
  STAIR_LOWER_END,
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
  /** Numéro ou nom de la sortie, tel qu'il est fléché. */
  label: string;
}

export interface StationInterior {
  /**
   * Le niveau est-il réellement construit ?
   *
   * Faux tant que l'accès qui y mène n'est pas dessiné - les gares dont le hall
   * est AU-DESSUS du quai attendent leur volée montante. Le rendu et la marche
   * lisent le même drapeau : on ne marche pas dans un hall qui n'est pas là, et
   * on ne dessine pas un hall où l'on ne peut pas aller.
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
  /**
   * Tout ce qui occupe le sol et se contourne : bornes de portillons, joues
   * latérales de la ligne, mobilier. Le rendu les dessine, la marche les évite,
   * et c'est la même liste.
   */
  obstacles: InteriorRect[];
}

// --- Cotes du niveau ------------------------------------------------------

/** Longueur de la zone payante, du débouché du couloir aux portillons. */
const PAID_LEN = 11;
/** Emprise en z de la ligne de portillons : la longueur d'une borne. */
const GATE_DEPTH = 1.7;
/** Longueur de la zone libre, des portillons aux bouches de sortie. */
const FREE_LEN = 9;
/** Retrait des parois latérales par rapport aux rives de la dalle. */
const SIDE_INSET = 0.35;
/** Demi-largeur d'une borne de portillon. */
const CABINET_HALF_X = 0.18;
/** Largeur libre d'un passage ordinaire, et d'un passage large. */
const PASSAGE_W = 0.62;
const PASSAGE_WIDE_W = 0.92;
/** Marge laissée entre le bout de la ligne de portillons et la paroi. */
const GATE_MARGIN = 0.4;
/** Demi-largeur d'une bouche de sortie. */
const EXIT_HALF_X = 1.15;

/**
 * Hauteur du niveau au-dessus du quai, quand il est dessus.
 *
 * Ce n'est pas la symétrique du niveau bas : une passerelle passe au-dessus du
 * gabarit de la caténaire, pas seulement au-dessus des têtes. La valeur est
 * posée ici pour que la donnée soit complète ; la volée qui y monte reste à
 * dessiner.
 */
const OVER_FLOOR_Y = 6.4;

// --- Ce qui change d'une gare à l'autre ----------------------------------

interface Spec {
  /** Code JY et nom, pour se relire : l'ordre suit STATIONS. */
  name: string;
  /** Défaut : 'under'. */
  place?: ConcoursePlace;
  /** Nom de la sortie principale, tel qu'il est écrit au-dessus des portillons. */
  gateJp: string;
  gate: string;
  /** Bouches de sortie fléchées depuis la zone libre. */
  exits: [string] | [string, string];
}

/**
 * Les trente gares, dans l'ordre JY01 → JY30.
 *
 * LES NOMS DE SORTIE SONT UN RELEVÉ, pas une génération. Une gare japonaise ne
 * numérote pas ses portillons : elle les NOMME, et le nom dit où l'on sort -
 * 電気街口 à Akihabara, ハチ公改札 à Shibuya, 早稲田口 à Takadanobaba. Les
 * gares dont le nom de sortie n'est pas établi ici portent 中央改札, qui est
 * réel, courant, et n'invente rien : c'est la valeur prudente, pas un défaut
 * technique. Une par une, elles se remplaceront par le relevé.
 */
const SPECS: readonly Spec[] = [
  { name: 'JY01 Tokyo', gateJp: '丸の内中央口', gate: 'Marunouchi Central', exits: ['丸の内', '八重洲'] },
  { name: 'JY02 Kanda', gateJp: '西口改札', gate: 'West', exits: ['西口', '東口'] },
  { name: 'JY03 Akihabara', gateJp: '電気街口', gate: 'Electric Town', exits: ['電気街口', '昭和通り口'] },
  { name: 'JY04 Okachimachi', gateJp: '北口改札', gate: 'North', exits: ['北口', '南口'] },
  // Le plan de quai d'Ueno en montre quatre, sur deux niveaux : 不忍 et 中央 en
  // M2F et 1F au sud, 公園 et 入谷 en 3F au nord. Deux groupes d'accès, donc
  // deux halls - c'est une gare à part, et elle attend sa phase.
  { name: 'JY05 Ueno', gateJp: '中央改札', gate: 'Central', exits: ['不忍口', '公園口'] },
  { name: 'JY06 Uguisudani', gateJp: '南口改札', gate: 'South', exits: ['南口', '北口'] },
  // Deux ponts-concours enjambent tout le faisceau : le hall est dessus.
  { name: 'JY07 Nippori', place: 'over', gateJp: '南改札', gate: 'South', exits: ['東口', '西口'] },
  { name: 'JY08 Nishi-Nippori', gateJp: '南改札', gate: 'South', exits: ['東口', '西口'] },
  { name: 'JY09 Tabata', place: 'over', gateJp: '北口改札', gate: 'North', exits: ['北口', '南口'] },
  { name: 'JY10 Komagome', place: 'over', gateJp: '北口改札', gate: 'North', exits: ['北口', '南口'] },
  { name: 'JY11 Sugamo', place: 'over', gateJp: '北口改札', gate: 'North', exits: ['北口', '南口'] },
  { name: 'JY12 Ōtsuka', gateJp: '北口改札', gate: 'North', exits: ['北口', '南口'] },
  { name: 'JY13 Ikebukuro', gateJp: '中央改札', gate: 'Central', exits: ['東口', '西口'] },
  { name: 'JY14 Mejiro', place: 'over', gateJp: '中央改札', gate: 'Central', exits: ['駅前'] },
  { name: 'JY15 Takadanobaba', gateJp: '早稲田口', gate: 'Waseda', exits: ['早稲田口', '戸山口'] },
  { name: 'JY16 Shin-Ōkubo', gateJp: '中央改札', gate: 'Central', exits: ['駅前'] },
  { name: 'JY17 Shinjuku', gateJp: '東口改札', gate: 'East', exits: ['東口', '西口'] },
  { name: 'JY18 Yoyogi', gateJp: '北口改札', gate: 'North', exits: ['北口', '西口'] },
  { name: 'JY19 Harajuku', gateJp: '西口改札', gate: 'West', exits: ['表参道口', '竹下口'] },
  { name: 'JY20 Shibuya', gateJp: 'ハチ公改札', gate: 'Hachikō', exits: ['ハチ公口', '南口'] },
  { name: 'JY21 Ebisu', gateJp: '西口改札', gate: 'West', exits: ['西口', '東口'] },
  { name: 'JY22 Meguro', place: 'over', gateJp: '中央改札', gate: 'Central', exits: ['西口', '東口'] },
  { name: 'JY23 Gotanda', gateJp: '中央改札', gate: 'Central', exits: ['西口', '東口'] },
  { name: 'JY24 Ōsaki', gateJp: '南改札', gate: 'South', exits: ['東口', '西口'] },
  { name: 'JY25 Shinagawa', gateJp: '中央改札', gate: 'Central', exits: ['高輪口', '港南口'] },
  { name: 'JY26 Takanawa Gateway', gateJp: '改札口', gate: 'Gate', exits: ['西口', '東口'] },
  { name: 'JY27 Tamachi', gateJp: '北口改札', gate: 'North', exits: ['三田口', '芝浦口'] },
  { name: 'JY28 Hamamatsuchō', gateJp: '北口改札', gate: 'North', exits: ['北口', '南口'] },
  { name: 'JY29 Shimbashi', gateJp: '烏森口', gate: 'Karasumori', exits: ['烏森口', '日比谷口'] },
  { name: 'JY30 Yūrakuchō', gateJp: '中央口', gate: 'Central', exits: ['中央口', '国際フォーラム口'] },
];

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
  // Le hall commence là où le couloir de la trémie finit.
  const z0 = accessZ + STAIR_LOWER_END;
  const gateZ = z0 + PAID_LEN;
  const freeZ0 = gateZ + GATE_DEPTH;
  const freeZ1 = freeZ0 + FREE_LEN;

  const gate = buildGate(spec, layout.crowdScale, x0, x1, gateZ);
  const exits: ConcourseExit[] = spec.exits.map((label, k) => ({
    // Une bouche au tiers, l'autre aux deux tiers ; une seule, au milieu.
    x: x0 + (x1 - x0) * (spec.exits.length === 1 ? 0.5 : (k + 1) / (spec.exits.length + 1)),
    halfWidth: EXIT_HALF_X,
    label,
  }));

  return {
    // Un hall sous les voies se dessine ; un hall dessus attend sa volée.
    built: place === 'under',
    place,
    floorY: place === 'under' ? STAIR_LOWER_Y : OVER_FLOOR_Y,
    ceilY: place === 'under' ? STAIR_LOWER_CEIL_Y : OVER_FLOOR_Y + 3.2,
    paid: { x0, x1, z0, z1: gateZ },
    gate,
    free: { x0, x1, z0: freeZ0, z1: freeZ1 },
    exits,
    obstacles: gate.cabinets,
  };
}

/** Le nom de la sortie principale, sans construire tout le niveau. */
export function gateNameFor(index: number): { jp: string; romaji: string } {
  const spec = SPECS[((index % 30) + 30) % 30];
  return { jp: spec.gateJp, romaji: spec.gate };
}
