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
import { stationExits } from './lines.ts';
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
  | 'map';

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
  /** Le mobilier du niveau, rangé le long des deux parois. */
  fixtures: Fixture[];
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
  { name: 'JY02 Kanda', gateJp: '西口改札', gate: 'West' },
  { name: 'JY03 Akihabara', gateJp: '電気街口', gate: 'Electric Town' },
  { name: 'JY04 Okachimachi', gateJp: '北口改札', gate: 'North' },
  // Le plan de quai d'Ueno en montre quatre, sur deux niveaux : 不忍 et 中央 en
  // M2F et 1F au sud, 公園 et 入谷 en 3F au nord. Deux groupes d'accès, donc
  // deux halls - c'est une gare à part, et elle attend sa phase.
  { name: 'JY05 Ueno', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY06 Uguisudani', gateJp: '南口改札', gate: 'South' },
  // Deux ponts-concours enjambent tout le faisceau : le hall est dessus.
  { name: 'JY07 Nippori', place: 'over', gateJp: '南改札', gate: 'South' },
  { name: 'JY08 Nishi-Nippori', gateJp: '南改札', gate: 'South' },
  { name: 'JY09 Tabata', place: 'over', gateJp: '北口改札', gate: 'North' },
  { name: 'JY10 Komagome', place: 'over', gateJp: '北口改札', gate: 'North' },
  { name: 'JY11 Sugamo', place: 'over', gateJp: '北口改札', gate: 'North' },
  { name: 'JY12 Ōtsuka', gateJp: '北口改札', gate: 'North' },
  { name: 'JY13 Ikebukuro', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY14 Mejiro', place: 'over', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY15 Takadanobaba', gateJp: '早稲田口', gate: 'Waseda' },
  { name: 'JY16 Shin-Ōkubo', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY17 Shinjuku', gateJp: '東口改札', gate: 'East' },
  { name: 'JY18 Yoyogi', gateJp: '北口改札', gate: 'North' },
  { name: 'JY19 Harajuku', gateJp: '西口改札', gate: 'West' },
  { name: 'JY20 Shibuya', gateJp: 'ハチ公改札', gate: 'Hachikō' },
  { name: 'JY21 Ebisu', gateJp: '西口改札', gate: 'West' },
  { name: 'JY22 Meguro', place: 'over', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY23 Gotanda', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY24 Ōsaki', gateJp: '南改札', gate: 'South' },
  { name: 'JY25 Shinagawa', gateJp: '中央改札', gate: 'Central' },
  { name: 'JY26 Takanawa Gateway', gateJp: '改札口', gate: 'Gate' },
  { name: 'JY27 Tamachi', gateJp: '北口改札', gate: 'North' },
  { name: 'JY28 Hamamatsuchō', gateJp: '北口改札', gate: 'North' },
  { name: 'JY29 Shimbashi', gateJp: '烏森口', gate: 'Karasumori' },
  { name: 'JY30 Yūrakuchō', gateJp: '中央口', gate: 'Central' },
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
  konbini: { len: 6.4, depth: 3.2 },
  vending: { len: 1.2, depth: 0.78 },
  vendingFood: { len: 1.2, depth: 0.78 },
  stamp: { len: 1.1, depth: 0.68 },
  office: { len: 3.6, depth: 1.9 },
  bench: { len: 1.8, depth: 0.56 },
  bin: { len: 1.35, depth: 0.5 },
  map: { len: 1.6, depth: 0.16 },
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
}

/** Zone payante (改札内) : ce qu'on croise entre le bas des marches et la sortie. */
const PAID_NEAR: Want[] = [
  { kind: 'vending' },
  { kind: 'vendingFood', from: 0.9 },
  { kind: 'bin' },
  { kind: 'bench' },
];
const PAID_FAR: Want[] = [
  { kind: 'map' },
  { kind: 'bench' },
  { kind: 'fareAdjust' },
];
/** Zone libre (改札外) : la billetterie, les commerces, les consignes. */
const FREE_NEAR: Want[] = [
  // Le tampon est le premier meuble qu'on trouve en sortant des portillons :
  // c'est là qu'il est dans une vraie gare, à côté de la fenêtre du bureau, et
  // c'est ce que les voyageurs viennent chercher.
  { kind: 'stamp' },
  { kind: 'ticket' },
  { kind: 'office', from: 1.3 },
  { kind: 'map' },
];
const FREE_FAR: Want[] = [
  { kind: 'konbini', from: 1.2 },
  { kind: 'lockers', from: 0.9 },
  { kind: 'vending' },
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
 */
function fitWall(
  wants: readonly Want[],
  wall: -1 | 1,
  zone: InteriorRect,
  crowd: number,
  width: number,
  counter: Map<FixtureKind, number>,
): Fixture[] {
  const out: Fixture[] = [];
  let z = zone.z0 + ZONE_MARGIN;
  const zEnd = zone.z1 - ZONE_MARGIN;
  for (const want of wants) {
    if (crowd < (want.from ?? 0)) continue;
    const size = SIZES[want.kind];
    // Le passage du milieu passe avant le meuble : ce qui l'étranglerait tombe.
    if (width - size.depth < AISLE_MIN) continue;
    for (let k = 0; k < (want.count ?? 1); k++) {
      if (z + size.len > zEnd) break;
      const slot = counter.get(want.kind) ?? 0;
      counter.set(want.kind, slot + 1);
      out.push({
        kind: want.kind,
        rect: wall === -1
          ? { x0: zone.x0 + WALL_CLEAR, x1: zone.x0 + WALL_CLEAR + size.depth, z0: z, z1: z + size.len }
          : { x0: zone.x1 - WALL_CLEAR - size.depth, x1: zone.x1 - WALL_CLEAR, z0: z, z1: z + size.len },
        facing: wall === -1 ? 1 : -1,
        slot,
      });
      z += size.len + FIXTURE_GAP;
    }
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
  // Le hall commence là où le couloir de la trémie finit.
  const z0 = accessZ + STAIR_LOWER_END;
  const gateZ = z0 + PAID_LEN;
  const freeZ0 = gateZ + GATE_DEPTH;
  const freeZ1 = freeZ0 + FREE_LEN;

  const gate = buildGate(spec, layout.crowdScale, x0, x1, gateZ);
  // Autant de bouches que la gare a de sorties fléchées, réparties en travers
  // du fond : une au tiers, l'autre aux deux tiers.
  const slots = stationExits(i);
  const exits: ConcourseExit[] = slots.map((_, k) => ({
    x: x0 + (x1 - x0) * (slots.length === 1 ? 0.5 : (k + 1) / (slots.length + 1)),
    halfWidth: EXIT_HALF_X,
    slot: k,
  }));

  const paid: InteriorRect = { x0, x1, z0, z1: gateZ };
  const free: InteriorRect = { x0, x1, z0: freeZ0, z1: freeZ1 };
  const width = x1 - x0;
  const crowd = layout.crowdScale;
  // Un seul compteur pour toute la gare : le premier distributeur du hall et
  // celui d'en face ne montrent pas la même vitrine.
  const counter = new Map<FixtureKind, number>();
  const fixtures = [
    ...fitWall(PAID_NEAR, -1, paid, crowd, width, counter),
    ...fitWall(PAID_FAR, 1, paid, crowd, width, counter),
    ...fitWall(FREE_NEAR, -1, free, crowd, width, counter),
    ...fitWall(FREE_FAR, 1, free, crowd, width, counter),
  ];

  return {
    // Un hall sous les voies se dessine ; un hall dessus attend sa volée.
    built: place === 'under',
    place,
    floorY: place === 'under' ? STAIR_LOWER_Y : OVER_FLOOR_Y,
    ceilY: place === 'under' ? STAIR_LOWER_CEIL_Y : OVER_FLOOR_Y + 3.2,
    paid,
    gate,
    free,
    exits,
    fixtures,
    // Un plan mural ne se contourne pas : il est DANS la paroi, seize
    // centimètres de saillie. Tout le reste barre.
    obstacles: [
      ...gate.cabinets,
      ...fixtures.filter((f) => f.kind !== 'map').map((f) => f.rect),
    ],
  };
}

/** Le nom de la sortie principale, sans construire tout le niveau. */
export function gateNameFor(index: number): { jp: string; romaji: string } {
  const spec = SPECS[((index % 30) + 30) % 30];
  return { jp: spec.gateJp, romaji: spec.gate };
}
