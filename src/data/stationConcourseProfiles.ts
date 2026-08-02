// Les trente gares, telles que les plans officiels les décrivent.
//
// `data/stationConcourseTypes` dit COMMENT décrire une gare, et ne décrit rien ;
// `data/stationConcourseSources` dit SUR QUOI l'on s'appuie, et n'affirme rien ;
// `docs/STATION_CONCOURSE_EVIDENCE.md` porte le relevé en toutes lettres, gare
// par gare. Ce fichier est ce qui reste quand on met les trois ensemble : le
// relevé devenu donnée.
//
// IL N'A AUCUN CONSOMMATEUR, et c'est voulu. Le jeu tourne exactement comme
// avant - `data/stationInterior` reste seul maître du hall qu'on parcourt. Ce
// qui est écrit ici sera lu à partir de la phase 6, une couche à la fois. Un
// profil faux ne casse donc rien aujourd'hui, et un profil juste ne se perd
// pas : il attend, vérifié par `validateProfile`.
//
// ─────────────────────────────────────────────────────────────────────────
// CE QUI EST RELEVÉ, ET CE QUI EST COMPOSÉ. À lire avant de contester un
// chiffre, parce que les deux ne se contestent pas de la même façon.
//
// RELEVÉ - lu sur un plan officiel, et défendable ligne à ligne :
//   · le nombre de NIVEAUX et lequel porte quoi ;
//   · le nombre de GROUPES DE PORTILLONS, leurs noms, ce qui les sépare ;
//   · l'ORDRE des choses le long du quai, quand le plan porte des accolades ;
//   · les SORTIES, reprises telles quelles de `data/lines` - elles sont déjà
//     le relevé des trente plans (phase 3), et les recopier ici les ferait
//     diverger au premier correctif ;
//   · les CORRESPONDANCES et leur direction - plus haut, plus bas, de plain-pied ;
//   · les COMMERCES dont le plan écrit le nom, et eux seuls ;
//   · les TRAVAUX, là où le plan délimite une zone.
//
// COMPOSÉ - une mise en place, pas un relevé, et cela se dit :
//   · les COTES. Les plans JR East ne sont pas des documents d'exécution : ils
//     n'ont ni échelle ni cotation. Aucun rectangle ci-dessous n'est mesuré.
//     Ils portent la PROPORTION et la TOPOLOGIE - un hall long et étroit reste
//     long et étroit, un petit hall reste petit - et rien de plus ;
//   · le SENS du quai. Le repère a un +z et un -z ; le plan a un nord et un
//     sud. Le dépôt ne sait pas les apparier, et l'invention serait invisible.
//     Convention tenue partout : le hall PRINCIPAL est du côté +z, le second
//     du côté -z. Ce qui est relevé, c'est qu'ils sont aux deux bouts ;
//   · l'ALTITUDE des niveaux lointains (B3F, 4F…), extrapolée d'une hauteur
//     d'étage ordinaire. Ceux qu'on parcourt, eux, reprennent les cotes des
//     volées réellement dessinées (`data/stationGeometry`), sans quoi le sol
//     se couperait au raccord.
//
// Chaque nœud porte donc sa `confidence` : `high` pour ce que le plan montre
// et situe, `estimated` pour ce qu'il montre sans le situer, `unverified` pour
// ce qui est hors cadrage. Le PROFIL, lui, ne dépasse jamais `mostlyVerified` -
// `validateProfile` refuse `verified` sans plan officiel lu, et un plan lu ne
// suffit pas à cautionner des cotes qu'il ne porte pas.
// ─────────────────────────────────────────────────────────────────────────
//
// LES NOMS JAPONAIS DES PORTILLONS. Vingt-six des trente plans lus sont des
// éditions anglaises : elles écrivent « South Gate », pas 南改札. La règle
// appliquée est celle de la phase 3, et c'est une CONCORDANCE DE PANNEAU, pas
// une traduction - JR East signe les mêmes lieux dans les deux langues, et le
// dépôt en a déjà fait un relevé pour les sorties. « X Gate » donne X改札,
// « X Exit » donne X口, « Gate » seul donne 改札口, qui est ce que JR East
// imprime réellement sur un contrôle sans qualificatif. Là où le plan japonais
// existe (Uguisudani), c'est lui qui fait foi.
//
// REPÈRE. Celui du quai, comme partout dans l'intérieur : x depuis l'axe de la
// voie vers le fond de quai, z le long de la voie, y relatif au sol du quai.
// La gare se retourne d'un bloc avec son côté d'ouverture.
//
// LES HALLS TRANSVERSAUX DÉBORDENT, et c'est le fait le plus lourd de
// conséquences de tout ce fichier. Une passerelle qui enjambe le faisceau -
// Tamachi, Ōsaki, Takanawa Gateway, Shinagawa, Nippori, le Central Passage de
// Tokyo - sort de la bande du quai par les deux bouts, et sa cote en x est
// franchement négative d'un côté. `footprint` le DÉCLARE ; la phase 6 apprendra
// au décor à le lire. Tant qu'elle n'est pas faite, ces emprises sont exactes
// et inexploitables : la nappe de rue couperait le hall à hauteur d'épaule.

import type {
  Bearing,
  ConcourseLevel,
  ConcourseRect,
  Depiction,
  StationConcourseProfile,
  StationExitProfile,
} from './stationConcourseTypes.ts';
import { stationExitPlan } from './lines.ts';
import { layoutFor } from './stationLayouts.ts';
import { REFERENCE_DATE, sourcesFor } from './stationConcourseSources.ts';
import {
  ASCENT_FLOOR_Y,
  ASCENT_LEN,
  DESCENT_LEN,
  PSD_X,
  STAIR_HALF_Z,
  STAIR_LOWER_CEIL_Y,
  STAIR_LOWER_Y,
} from './stationGeometry.ts';

// --- Cotes communes ------------------------------------------------------

/** Retrait des parois latérales par rapport aux rives de la dalle. */
const WALL_INSET = 0.35;

/**
 * Le niveau bas et le niveau haut, aux cotes des volées RÉELLEMENT dessinées.
 *
 * Elles ne sont pas choisies ici : elles sortent de `data/stationGeometry`, et
 * c'est la seule façon d'être sûr que le sol du hall se raccorde au pied de la
 * volée qui y descend. Un profil qui poserait « moins quatre mètres » parce que
 * c'est un chiffre rond ferait sauter le marcheur au raccord.
 */
const UNDER_Y = STAIR_LOWER_Y;
const UNDER_H = STAIR_LOWER_CEIL_Y - STAIR_LOWER_Y;
const OVER_Y = ASCENT_FLOOR_Y;
const OVER_H = 3.1;

/** Hauteur d'étage ordinaire, pour les niveaux qu'on ne fait que regarder. */
const STOREY = 4.6;

// --- Fabrique de rectangles ----------------------------------------------

/**
 * Les outils de tracé d'une gare, aux cotes de SON quai.
 *
 * Trois formes seulement, et le choix entre elles est une décision de relevé :
 * `band` pour un hall qui suit le quai, `back` pour ce qui se range contre le
 * fond, `across` pour un ouvrage qui traverse le faisceau. La troisième est la
 * seule qui sorte de l'emprise du quai, et c'est exactement à cela qu'on la
 * reconnaît.
 */
function frame(index: number) {
  const depth = layoutFor(index).depth;
  const x0 = PSD_X + WALL_INSET;
  const x1 = PSD_X + depth - WALL_INSET;
  return {
    x0,
    x1,
    /** Toute la largeur du quai, de z0 à z1. */
    band: (z0: number, z1: number): ConcourseRect => ({ x0, x1, z0, z1 }),
    /** Une bande de `w` mètres calée contre le fond de quai. */
    back: (w: number, z0: number, z1: number): ConcourseRect =>
      ({ x0: x1 - w, x1, z0, z1 }),
    /** Une bande de `w` mètres calée côté voie. */
    front: (w: number, z0: number, z1: number): ConcourseRect =>
      ({ x0, x1: x0 + w, z0, z1 }),
    /**
     * Un ouvrage TRANSVERSAL : `near` mètres au-delà de notre propre voie,
     * `far` mètres au-delà du fond de quai. Il déborde des deux côtés, et
     * c'est le sujet.
     */
    across: (near: number, far: number, z0: number, z1: number): ConcourseRect =>
      ({ x0: -near, x1: PSD_X + depth + far, z0, z1 }),
  };
}

/**
 * Où finit l'accès de quai, donc où commence le hall.
 *
 * Même calcul que `data/stationInterior` : depuis le NEZ de la trémie, à
 * `STAIR_HALF_Z` en amont de son centre, plus la longueur de la volée. Les
 * deux moteurs doivent tomber d'accord au centimètre, sans quoi le hall du
 * profil et celui du dépôt ne se superposeraient pas.
 */
function hallStart(accessZ: number, rise: 'down' | 'up'): number {
  return accessZ - STAIR_HALF_Z + (rise === 'down' ? DESCENT_LEN : ASCENT_LEN);
}

/** Les deux trémies de quai, telles que `data/stationLayouts` les pose. */
function accessZs(index: number): { main: number; far: number; lift: number } {
  const am = layoutFor(index).amenities;
  return {
    main: am.stairs[1],
    far: am.stairs[0],
    lift: am.elevator ?? am.escalators[0],
  };
}

// --- Les sorties, reprises du relevé -------------------------------------

/** Identifiant ASCII stable tiré d'un nom anglais. */
function slug(en: string): string {
  return en
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Les sorties de la gare, dans l'ordre du relevé, avec ce que le profil en dit.
 *
 * LES NOMS NE SONT PAS RECOPIÉS : ils viennent de `data/lines`, où les trente
 * plans ont déjà été dépouillés (phase 3). Le profil n'ajoute que ce qui le
 * regarde - de quelle zone libre part chaque bouche, et comment elle est
 * présente dans le jeu. Une gare qui ne place que ses trois premières sorties
 * ne renie pas les autres : elle dit qu'elle ne les situe pas.
 */
function exitsOf(
  index: number,
  where: readonly (readonly [string, Depiction, Bearing?])[],
): StationExitProfile[] {
  const plan = stationExitPlan(index);
  return where.map(([fromNodeId, depiction, bearing], k) => {
    const e = plan[k];
    return {
      id: `exit-${slug(e.en)}`,
      nameJp: e.jp,
      nameEn: e.en,
      fromNodeId,
      depiction,
      bearing,
      // Une sortie que le plan ne nomme pas porte un nom usuel : `data/lines`
      // le marque `unsourced`, et cela se propage jusqu'ici.
      confidence: e.unsourced ? 'unverified' : 'high',
    };
  });
}

// --- Assemblage ----------------------------------------------------------

/**
 * Ce qu'une gare écrit d'elle-même.
 *
 * Trois champs du profil n'y sont PAS, parce qu'aucune gare n'a le droit de
 * les décider : son index, sa date de référence et ses sources sont posés par
 * `finish`, et son EMPRISE est calculée. Une emprise écrite à la main finirait
 * par mentir sur ce qu'elle contient au premier hall déplacé.
 */
type Draft = Omit<
  StationConcourseProfile,
  'stationIndex' | 'referenceDate' | 'sources' | 'footprint'
>;

function union(rects: readonly ConcourseRect[]): ConcourseRect {
  return rects.reduce((a, r) => ({
    x0: Math.min(a.x0, r.x0),
    x1: Math.max(a.x1, r.x1),
    z0: Math.min(a.z0, r.z0),
    z1: Math.max(a.z1, r.z1),
  }));
}

function finish(index: number, d: Draft): StationConcourseProfile {
  return {
    ...d,
    stationIndex: index,
    referenceDate: REFERENCE_DATE,
    sources: sourcesFor(index).sources,
    // L'emprise est la réunion de ce que la gare occupe RÉELLEMENT : ses halls,
    // ses ouvrages de liaison, ses lignes de portillons. Elle se recalcule à
    // chaque relecture du fichier, donc elle ne peut pas dériver.
    footprint: union([
      ...d.concourses.map((n) => n.rect),
      ...d.corridors.map((c) => c.rect),
      ...d.gateGroups.map((g) => g.rect),
    ]),
  };
}

// --- Raccourcis d'écriture -----------------------------------------------

/** Un niveau bas ordinaire : celui où descend une trémie de quai. */
function under(id: string, label: string, extra?: Partial<ConcourseLevel>): ConcourseLevel {
  return { id, relative: 'belowPlatform', floorY: UNDER_Y, headroom: UNDER_H, label, ...extra };
}

/** Un niveau haut ordinaire : celui où monte une volée posée sur la dalle. */
function over(id: string, label: string, extra?: Partial<ConcourseLevel>): ConcourseLevel {
  return { id, relative: 'abovePlatform', floorY: OVER_Y, headroom: OVER_H, label, ...extra };
}

/**
 * Un niveau qui passe SOUS LA VOIE, et non sous le quai.
 *
 * Six gares du relevé en ont un, et ce sont les six dont un hall traverse
 * réellement le faisceau : le couloir central de Tokyo, le B1 d'Ikebukuro, le
 * 中央通路 de Shinjuku, le 1F de Shibuya sous son viaduc, le souterrain de
 * Takeshita à Harajuku et le 地下通路 d'Uguisudani.
 *
 * Elles ne peuvent PAS tenir à la cote du hall ordinaire (`UNDER_Y`), et la
 * raison n'est pas esthétique : ce plafond-là est à −0,48 m, soit soixante-sept
 * centimètres AU-DESSUS du ballast (`RAIL_Y = −1,15`). Un hall posé là
 * ressortirait au travers de la plate-forme de la voie — et le ballast, lui, ne
 * se dérobe pas, parce qu'un train roule dessus. `validateProfile` refuse
 * désormais cette géométrie (`acrossBallast`), et c'est la forme exacte de la
 * contrainte G1.
 *
 * CE QUE CELA COÛTE, et il faut le dire : la volée dessinée aujourd'hui
 * (`DESCENT_LEN`, qui atteint `UNDER_Y`) n'y descend pas. Ces six gares
 * demandent une volée plus longue — c'est à la phase 7 de la construire, et
 * chacune le porte dans ses questions ouvertes.
 */
export const SUBTRACK_Y = -6.4;
const SUBTRACK_H = 3.2;

function subTrack(id: string, label: string): ConcourseLevel {
  return { id, relative: 'belowPlatform', floorY: SUBTRACK_Y, headroom: SUBTRACK_H, label };
}

/** Un niveau qu'on ne fait que regarder : sa cote est extrapolée. */
function distant(
  id: string,
  label: string,
  floorY: number,
  headroom = 3,
): ConcourseLevel {
  return {
    id,
    relative: floorY < -0.5 ? 'belowPlatform' : floorY > 0.5 ? 'abovePlatform' : 'platformLevel',
    floorY,
    headroom,
    label,
  };
}

// --- JY01 Tokyo ----------------------------------------------------------
//
// Six onglets, dont deux qui sont des LIGNES et non des étages. Ce qui fait
// Tokyo tient en une phrase du plan : trois passages transversaux nommés
// relient Marunouchi à Yaesu EN ZONE PAYANTE, et les volées de quai y tombent
// perpendiculairement, chacune desservie des deux côtés. Le hall n'est donc pas
// dans l'axe du quai : il est EN TRAVERS, et c'est la première emprise de ce
// fichier qui sort franchement de la bande du quai.

function tokyo(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const central = hallStart(z.main, 'down');
  const northern = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-central',
    levels: [subTrack('1f', '1F'), distant('b1f', 'B1F', SUBTRACK_Y - STOREY)],
    platformAccesses: [
      { id: 'a-central', kind: 'stairs', order: 1, toNodeId: 'paid-central', rise: 'down', depiction: 'walkable' },
      { id: 'a-northern', kind: 'stairs', order: 0, toNodeId: 'paid-northern', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      {
        id: 'paid-central',
        levelId: '1f',
        kind: 'cross',
        fare: 'paid',
        rect: f.across(34, 30, central, central + 14),
        depiction: 'walkable',
        nameJp: '中央通路',
        nameEn: 'Central Passage',
        confidence: 'high',
      },
      {
        id: 'free-marunouchi',
        levelId: '1f',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: -56, x1: -36, z0: central - 6, z1: central + 20 },
        depiction: 'walkable',
        confidence: 'estimated',
      },
      {
        id: 'paid-yaesu',
        levelId: '1f',
        kind: 'hubSlice',
        fare: 'paid',
        rect: { x0: f.x1 + 30, x1: f.x1 + 52, z0: central - 4, z1: central + 18 },
        depiction: 'vista',
        confidence: 'estimated',
      },
      {
        id: 'free-yaesu',
        levelId: '1f',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: f.x1 + 52, x1: f.x1 + 66, z0: central - 2, z1: central + 16 },
        depiction: 'backdrop',
        confidence: 'unverified',
      },
      {
        id: 'paid-northern',
        levelId: '1f',
        kind: 'cross',
        fare: 'paid',
        rect: f.across(30, 26, northern, northern + 12),
        depiction: 'vista',
        nameJp: '北通路',
        nameEn: 'Northern Passage',
        confidence: 'high',
      },
      {
        id: 'gransta',
        levelId: 'b1f',
        kind: 'mezzanine',
        fare: 'paid',
        rect: f.across(20, 18, central + 2, central + 12),
        depiction: 'vista',
        nameEn: 'GRANSTA TOKYO',
        confidence: 'high',
      },
    ],
    corridors: [
      {
        id: 'c-gransta',
        kind: 'stairs',
        from: 'paid-central',
        to: 'gransta',
        rise: -1,
        rect: { x0: 4, x1: 10, z0: central + 9, z1: central + 13 },
        width: 4,
        depiction: 'stairhead',
        confidence: 'estimated',
      },
      {
        id: 'c-to-yaesu',
        kind: 'open',
        from: 'paid-central',
        to: 'paid-yaesu',
        rise: 0,
        rect: { x0: f.x1 + 28, x1: f.x1 + 32, z0: central, z1: central + 14 },
        width: 14,
        depiction: 'vista',
        confidence: 'estimated',
      },
    ],
    gateGroups: [
      {
        id: 'gate-marunouchi-central',
        nameJp: '丸の内中央口',
        nameEn: 'Marunouchi Central Gate',
        from: 'paid-central',
        to: 'free-marunouchi',
        rect: { x0: -36, x1: -34.3, z0: central, z1: central + 14 },
        cross: 'x',
        passages: 12,
        wideAt: 'end',
        staffed: true,
        // Écrit sur le plan, en toutes lettres, et c'est un fait de JEU : le
        // joueur tient déjà une carte (`store.pocket`).
        icOnly: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-yaesu-central',
        nameJp: '八重洲中央口',
        nameEn: 'Yaesu Central Gate',
        from: 'paid-yaesu',
        to: 'free-yaesu',
        rect: { x0: f.x1 + 52, x1: f.x1 + 53.7, z0: central - 2, z1: central + 16 },
        cross: 'x',
        passages: 10,
        staffed: true,
        depiction: 'vista',
        confidence: 'estimated',
      },
    ],
    exits: exitsOf(i, [
      ['free-marunouchi', 'walkable', 'W'],
      ['free-yaesu', 'backdrop', 'E'],
      ['free-marunouchi', 'shortBranch', 'NW'],
      ['free-marunouchi', 'shortBranch', 'SW'],
      ['free-yaesu', 'signOnly', 'NE'],
      ['free-yaesu', 'signOnly', 'SE'],
      ['free-yaesu', 'signOnly', 'N'],
    ]),
    transferPortals: [
      {
        id: 't-shinkansen',
        // Six lignes de contrôle entre classique et Shinkansen : à Tokyo, on ne
        // « passe pas au Shinkansen », on franchit un second 改札.
        lines: ['東海道新幹線', '東北・上越新幹線'],
        fromNodeId: 'paid-central',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: { x0: f.x1 + 18, x1: f.x1 + 24, z0: central + 2, z1: central + 12 },
        confidence: 'high',
      },
      {
        id: 't-keiyo',
        // Un couloir en L de plusieurs centaines de mètres : la feuille Keiyō
        // est à elle seule la démonstration de sa longueur.
        lines: ['京葉線'],
        fromNodeId: 'paid-central',
        goes: 'down',
        depiction: 'blindCorner',
        rect: { x0: 12, x1: 18, z0: central, z1: central + 5 },
        confidence: 'high',
      },
      {
        id: 't-sobu',
        lines: ['総武線快速', '横須賀線'],
        fromNodeId: 'paid-central',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
      {
        id: 't-chuo',
        lines: ['中央線', '東海道線', '常磐線'],
        fromNodeId: 'paid-central',
        goes: 'up',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-gransta',
        nodeId: 'gransta',
        status: 'gallery',
        category: 'gallery',
        brand: 'GRANSTA TOKYO',
        rect: f.across(18, 16, central + 3, central + 11),
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-hotel',
        nodeId: 'free-marunouchi',
        status: 'namedVerified',
        category: 'services',
        brand: 'THE TOKYO STATION HOTEL',
        rect: { x0: -56, x1: -50, z0: central + 8, z1: central + 20 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-brick',
        kind: 'material',
        nodeId: 'free-marunouchi',
        note: 'La halle de brique : c’est elle qu’on voit par la Main Entrance, dans l’axe du contrôle central.',
        confidence: 'high',
      },
      {
        id: 'lm-perspective',
        kind: 'trackView',
        nodeId: 'paid-central',
        note: 'Le passage traverse tout le faisceau : perspective de plusieurs dizaines de mètres, volées de quai des deux côtés.',
        confidence: 'high',
      },
    ],
    works: {
      summary: 'Le plan se déclare lui-même sujet à changement sans délimiter de zone.',
      partitions: [],
      confidence: 'estimated',
    },
    openQuestions: [
      'Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.',
      'Le niveau des Marunouchi Exits n’est pas explicité : le plan porte aussi « for Marunouchi (Underground) », donc un débouché souterrain distinct, non cartographié.',
      'De quel côté du repère quai se tient Marunouchi ? Le plan a un ouest, le dépôt a un −x : l’appariement n’est pas établi. Convention retenue ici, et à corriger si elle se démontre fausse.',
      'Ni Tokyo Metro Marunouchi ni les correspondances hors JR ne sont cartographiés.',
    ],
  };
}

// --- JY02 Kanda ----------------------------------------------------------
//
// Deux blocs sous le viaduc, sans AUCUN passage entre eux au niveau du sol :
// pour aller de l'ouest à l'est, il faut reprendre le quai. Le plan ne nomme
// ni l'un ni l'autre contrôle - il les étiquette « Gate », et réserve les noms
// aux sorties.

function kanda(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const west = hallStart(z.main, 'down');
  const east = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-west',
    levels: [under('1f', '1F')],
    platformAccesses: [
      { id: 'a-west', kind: 'stairs', order: 1, toNodeId: 'paid-west', rise: 'down', depiction: 'walkable' },
      { id: 'a-east', kind: 'stairs', order: 0, toNodeId: 'paid-east', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-west', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(west, west + 13), depiction: 'walkable', confidence: 'high' },
      { id: 'free-west', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(west + 14.7, west + 31), depiction: 'walkable', confidence: 'high' },
      { id: 'paid-east', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(east, east + 11), depiction: 'blindCorner', confidence: 'high' },
      { id: 'free-east', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(east + 12.7, east + 25), depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-west',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-west',
        to: 'free-west',
        rect: f.band(west + 13, west + 14.7),
        cross: 'z',
        passages: 6,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-east',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-east',
        to: 'free-east',
        rect: f.band(east + 11, east + 12.7),
        cross: 'z',
        passages: 5,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-west', 'walkable', 'W'],
      ['free-east', 'backdrop', 'E'],
      ['free-west', 'shortBranch', 'S'],
      ['free-east', 'signOnly', 'N'],
    ]),
    transferPortals: [
      {
        id: 't-ginza',
        // Fléché depuis le bloc EST, et de là seulement : la correspondance
        // n'existe pas du côté où l'on se tient.
        lines: ['東京メトロ銀座線'],
        fromNodeId: 'free-east',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-chuo',
        lines: ['中央線'],
        fromNodeId: 'paid-west',
        goes: 'up',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-girders',
        kind: 'material',
        nodeId: 'paid-west',
        note: 'Le dessous du viaduc : poutres rivetées apparentes, plafond bas, la rue à toucher derrière les bouches.',
        confidence: 'estimated',
      },
    ],
    openQuestions: [
      'Le plan n’attribue aucun nom aux deux groupes ; 改札口 est la valeur prudente, pas un relevé de panneau.',
      'Le nombre de baies par groupe n’est pas lisible sur le document.',
      'Les commerces sous les arches sont hors emprise JR : ils ne figurent pas au profil, et c’est volontaire.',
    ],
  };
}

// --- JY03 Akihabara ------------------------------------------------------
//
// La verticalité prime sur la surface : la rue, le viaduc JR, et la Chūō-Sōbu
// en travers au-dessus. Trois groupes de portillons en enfilade sur une bande
// étroite, dont le dernier - Shōwa-dōri - est un bloc entièrement séparé.

function akihabara(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const denki = hallStart(z.main, 'down');
  const showa = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-denkigai',
    levels: [under('1f', '1F'), distant('3f', '3F', OVER_Y + 1.4)],
    platformAccesses: [
      { id: 'a-denkigai', kind: 'stairs', order: 1, toNodeId: 'paid-denkigai', rise: 'down', depiction: 'walkable' },
      { id: 'a-showa', kind: 'stairs', order: 0, toNodeId: 'paid-showa', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-denkigai', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(denki, denki + 16), depiction: 'walkable', confidence: 'high' },
      { id: 'free-denkigai', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(denki + 17.7, denki + 32), depiction: 'walkable', confidence: 'high' },
      { id: 'paid-central', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(denki - 26, denki - 12), depiction: 'vista', confidence: 'high' },
      { id: 'free-central', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(denki - 42, denki - 27.7), depiction: 'backdrop', confidence: 'estimated' },
      { id: 'paid-showa', levelId: '1f', kind: 'compact', fare: 'paid', rect: f.band(showa, showa + 12), depiction: 'blindCorner', confidence: 'high' },
      { id: 'free-showa', levelId: '1f', kind: 'compact', fare: 'free', rect: f.band(showa + 13.7, showa + 26), depiction: 'backdrop', confidence: 'estimated' },
      {
        id: 'paid-chuo-sobu',
        levelId: '3f',
        kind: 'overbridge',
        fare: 'paid',
        // En TRAVERS, et deux niveaux plus haut : c'est ce qu'on voit en levant
        // les yeux, et c'est ce qui fait Akihabara.
        rect: f.across(8, 8, denki - 4, denki + 12),
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    corridors: [
      {
        id: 'c-chuo-sobu',
        kind: 'stairs',
        from: 'paid-denkigai',
        to: 'paid-chuo-sobu',
        rise: 1,
        rect: f.back(3.4, denki + 4, denki + 12),
        width: 3.4,
        depiction: 'stairhead',
        confidence: 'estimated',
      },
    ],
    gateGroups: [
      {
        id: 'gate-denkigai',
        nameJp: '電気街口',
        nameEn: 'Electric Town Gate',
        from: 'paid-denkigai',
        to: 'free-denkigai',
        rect: f.band(denki + 16, denki + 17.7),
        cross: 'z',
        passages: 8,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-central',
        nameJp: '中央改札',
        nameEn: 'Central Gate',
        from: 'paid-central',
        to: 'free-central',
        rect: f.band(denki - 27.7, denki - 26),
        cross: 'z',
        passages: 7,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'gate-showa',
        nameJp: '昭和通り改札',
        nameEn: 'Shōwa-dōri Gate',
        from: 'paid-showa',
        to: 'free-showa',
        rect: f.band(showa + 12, showa + 13.7),
        cross: 'z',
        passages: 6,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-denkigai', 'walkable', 'W'],
      ['free-showa', 'backdrop', 'E'],
      ['free-central', 'backdrop'],
    ]),
    transferPortals: [
      {
        id: 't-tsukuba',
        lines: ['つくばエクスプレス'],
        fromNodeId: 'free-central',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-hibiya',
        // À l'autre bout de la gare, et par un AUTRE portillon : c'est cela qui
        // rend Akihabara illisible pour qui ne connaît pas.
        lines: ['東京メトロ日比谷線'],
        fromNodeId: 'free-showa',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-chuo-sobu',
        lines: ['中央・総武線'],
        fromNodeId: 'paid-denkigai',
        goes: 'up',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-ecute',
        nodeId: 'paid-denkigai',
        status: 'gallery',
        category: 'gallery',
        brand: 'ecute Akihabara',
        // DERRIÈRE les portillons : l'aplat « large store inside the ticket
        // gates » du plan, pas une lecture de couleur au juger.
        rect: f.back(3.6, denki + 3, denki + 14),
        enterable: true,
        confidence: 'high',
      },
      {
        id: 'shop-atre1',
        nodeId: 'free-denkigai',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre Akihabara 1',
        rect: f.back(3, denki + 20, denki + 30),
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-atre2',
        nodeId: 'free-showa',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre Akihabara 2',
        rect: f.back(3, showa + 15, showa + 24),
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-section',
        kind: 'trackView',
        nodeId: 'paid-denkigai',
        note: 'Trois couches de circulation lisibles d’un seul regard : la rue dessous, le viaduc JR, la Chūō-Sōbu en travers au-dessus.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Les noms japonais viennent de l’édition anglaise du plan par concordance de panneau ; seul 電気街口 est déjà relevé au dépôt.',
      'Les feuilles 2F-M3 et 3F n’ont pas été dépouillées en détail : la géométrie de la Chūō-Sōbu est une mise en place, pas un relevé.',
      'Le plan date de janvier 2026, sept mois avant la référence.',
    ],
  };
}

// --- JY04 Okachimachi ----------------------------------------------------
//
// La trouvaille de cette petite gare est sa MEZZANINE : on ne descend pas du
// quai au hall d'un trait, on passe par un demi-niveau - et il est en deux
// morceaux distincts, un par groupe de portillons.

function okachimachi(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const north = hallStart(z.main, 'down');
  const south = hallStart(z.far, 'down');
  return {
    confidence: 'approximate',
    place: 'belowPlatform',
    primaryAccessId: 'a-north',
    levels: [
      under('1f', '1F'),
      // Le demi-niveau, à mi-hauteur de la volée : c'est ce que le plan appelle
      // M2F, et c'est par lui que passe toute la gare.
      distant('m2f', 'M2F', UNDER_Y / 2, 2.4),
    ],
    platformAccesses: [
      { id: 'a-north', kind: 'stairs', order: 1, toNodeId: 'mezz-north', rise: 'down', depiction: 'walkable' },
      { id: 'a-south', kind: 'stairs', order: 0, toNodeId: 'mezz-south', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'mezz-north', levelId: 'm2f', kind: 'mezzanine', fare: 'paid', rect: f.band(north - 8, north - 1), depiction: 'walkable', nameEn: 'M2F landing', confidence: 'high' },
      { id: 'paid-north', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(north, north + 11), depiction: 'walkable', confidence: 'high' },
      { id: 'free-north', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(north + 12.7, north + 27), depiction: 'walkable', confidence: 'high' },
      { id: 'mezz-south', levelId: 'm2f', kind: 'mezzanine', fare: 'paid', rect: f.band(south - 8, south - 1), depiction: 'stairhead', confidence: 'high' },
      { id: 'paid-south', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(south, south + 10), depiction: 'vista', confidence: 'high' },
      { id: 'free-south', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(south + 11.7, south + 23), depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [
      {
        id: 'c-mezz-north',
        kind: 'stairs',
        from: 'mezz-north',
        to: 'paid-north',
        rise: -1,
        rect: f.band(north - 1, north),
        width: 4.2,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'c-mezz-south',
        kind: 'stairs',
        from: 'mezz-south',
        to: 'paid-south',
        rise: -1,
        rect: f.band(south - 1, south),
        width: 3.6,
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    gateGroups: [
      {
        id: 'gate-north',
        nameJp: '北口',
        nameEn: 'North Exit Gate',
        from: 'paid-north',
        to: 'free-north',
        rect: f.band(north + 11, north + 12.7),
        cross: 'z',
        passages: 5,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-south',
        nameJp: '南口',
        nameEn: 'South Exit Gate',
        from: 'paid-south',
        to: 'free-south',
        rect: f.band(south + 10, south + 11.7),
        cross: 'z',
        passages: 4,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-north', 'walkable', 'N'],
      ['free-south', 'backdrop', 'S'],
    ]),
    transferPortals: [],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-mezzanine',
        kind: 'void',
        nodeId: 'mezz-north',
        note: 'Le demi-niveau ouvre sur le hall : on voit le contrôle d’en haut avant d’y arriver. C’est ce que le hall générique ne produit jamais.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de janvier 2024 : plus de deux ans avant la référence, le plus grand écart du relevé, et la seule raison de la confiance `approximate`.',
      'Le nombre de baies par groupe n’est pas lisible.',
      'Ameyoko est un marché de rue hors emprise JR : il ne figure pas au profil, et ne doit pas y entrer.',
    ],
  };
}

// --- JY05 Ueno -----------------------------------------------------------
//
// L'inverse de toutes les autres : depuis le quai, on MONTE. Le plateau payant
// du 3F porte les deux groupes documentés et ecute ; le 1F, avec son atre et
// ses sorties, se voit par en dessous.

function ueno(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const plateau = hallStart(z.main, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-plateau',
    levels: [over('3f', '3F'), distant('1f', '1F', -STOREY - 1.4, 3.6)],
    platformAccesses: [
      { id: 'a-plateau', kind: 'stairs', order: 1, toNodeId: 'paid-plateau', rise: 'up', depiction: 'walkable' },
      { id: 'a-plateau-north', kind: 'escalator', order: 0, toNodeId: 'paid-plateau', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      {
        id: 'paid-plateau',
        levelId: '3f',
        kind: 'hubSlice',
        fare: 'paid',
        // Un vaste plateau au-dessus des douze voies, d'où l'on redescend vers
        // chaque quai : ce n'est pas un couloir, c'est une dalle.
        rect: f.across(20, 30, plateau - 6, plateau + 24),
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'free-park',
        levelId: '3f',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: -42, x1: -20, z0: plateau - 2, z1: plateau + 20 },
        depiction: 'walkable',
        confidence: 'estimated',
      },
      {
        id: 'free-iriya',
        levelId: '3f',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: f.x1 + 30, x1: f.x1 + 48, z0: plateau - 2, z1: plateau + 20 },
        depiction: 'vista',
        confidence: 'estimated',
      },
      {
        id: 'street-1f',
        levelId: '1f',
        kind: 'hubSlice',
        fare: 'free',
        rect: f.across(14, 22, plateau - 4, plateau + 24),
        depiction: 'vista',
        nameEn: '1F concourse',
        confidence: 'high',
      },
    ],
    corridors: [
      {
        id: 'c-plateau-1f',
        kind: 'escalator',
        from: 'paid-plateau',
        to: 'street-1f',
        rise: -1,
        rect: { x0: -14, x1: -8, z0: plateau + 14, z1: plateau + 22 },
        width: 3.2,
        depiction: 'vista',
        confidence: 'estimated',
      },
    ],
    gateGroups: [
      {
        id: 'gate-park',
        nameJp: '公園口改札',
        nameEn: 'Park Gate',
        from: 'paid-plateau',
        to: 'free-park',
        rect: { x0: -22, x1: -20.3, z0: plateau - 2, z1: plateau + 20 },
        cross: 'x',
        passages: 10,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-iriya',
        nameJp: '入谷口改札',
        nameEn: 'Iriya Gate',
        from: 'paid-plateau',
        to: 'free-iriya',
        rect: { x0: f.x1 + 28.3, x1: f.x1 + 30, z0: plateau - 2, z1: plateau + 20 },
        cross: 'x',
        passages: 7,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-park', 'walkable', 'W'],
      ['free-iriya', 'vista', 'E'],
      ['street-1f', 'vista'],
      ['street-1f', 'signOnly'],
    ]),
    transferPortals: [
      {
        id: 't-shinkansen',
        lines: ['東北・上越新幹線'],
        fromNodeId: 'paid-plateau',
        goes: 'down',
        gated: true,
        depiction: 'doorway',
        rect: { x0: 8, x1: 14, z0: plateau - 4, z1: plateau + 2 },
        confidence: 'high',
      },
      {
        id: 't-metro',
        lines: ['東京メトロ銀座線', '東京メトロ日比谷線'],
        fromNodeId: 'street-1f',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-jr-lines',
        lines: ['常磐線', '宇都宮線', '高崎線', '上野東京ライン'],
        fromNodeId: 'paid-plateau',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-ecute',
        nodeId: 'paid-plateau',
        status: 'gallery',
        category: 'gallery',
        brand: 'ecute Ueno',
        rect: { x0: 2, x1: 12, z0: plateau + 6, z1: plateau + 22 },
        enterable: true,
        confidence: 'high',
      },
      {
        id: 'shop-atre',
        nodeId: 'street-1f',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre Ueno',
        rect: { x0: -12, x1: -2, z0: plateau + 2, z1: plateau + 20 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-void',
        kind: 'void',
        nodeId: 'paid-plateau',
        note: 'Le plateau est percé : on voit le 1F, son atre et la statue de Saigō Takamori (« Statue of Sanso » sur le plan) par en dessous.',
        confidence: 'high',
      },
      {
        id: 'lm-truss',
        kind: 'ceiling',
        nodeId: 'paid-plateau',
        note: 'Charpente de halle très haute : quatre niveaux de gare lisibles à la fois, ce qui est le sujet d’Ueno.',
        confidence: 'estimated',
      },
    ],
    works: {
      summary: 'Une zone « Under Construction » au sud du plateau 3F, près des descentes vers le Shinkansen et les voies 13-17.',
      partitions: [
        {
          id: 'hoard-south',
          nodeId: 'paid-plateau',
          rect: { x0: 4, x1: 16, z0: plateau - 6, z1: plateau - 1 },
          kind: 'hoarding',
        },
      ],
      confidence: 'high',
    },
    openQuestions: [
      'Le Central Gate (中央改札) et le Shinobazu Gate (不忍口) sont hors cadrage : le dépôt les déclare, le plan ne les contredit pas, leur niveau reste à établir.',
      '⚠ Le plan place les voies 1 à 12 au 2F, alors que `data/stationLayouts` donne Ueno en `elevation: ground`. Rien n’a été modifié : `elevation` commande le rendu du quai, et cela déborde de ce chantier.',
      'La feuille B4-B1 (Shinkansen, Tokyo Metro) n’a pas été dépouillée.',
    ],
  };
}

// --- JY06 Uguisudani ----------------------------------------------------
//
// La gare la plus nue de la boucle, et le plan le dit sans détour : AUCUN
// commerce, aucune correspondance. Deux petits halls à des bouts opposés ET de
// part et d'autre des voies - le 南口 de plain-pied, le 北口 sous les voies au
// bout d'un 地下通路. Rien ne les relie hors quai.

function uguisudani(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const south = hallStart(z.main, 'down');
  const north = hallStart(z.far, 'down');
  return {
    confidence: 'approximate',
    place: 'belowPlatform',
    primaryAccessId: 'a-south',
    levels: [under('1f', '1F'), subTrack('sub', '1F 地下通路')],
    platformAccesses: [
      { id: 'a-south', kind: 'stairs', order: 1, toNodeId: 'paid-south', rise: 'down', depiction: 'walkable' },
      { id: 'a-north', kind: 'stairs', order: 0, toNodeId: 'passage-north', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-south', levelId: '1f', kind: 'compact', fare: 'paid', rect: f.band(south, south + 9), depiction: 'walkable', confidence: 'high' },
      { id: 'free-south', levelId: '1f', kind: 'compact', fare: 'free', rect: f.band(south + 10.7, south + 22), depiction: 'walkable', confidence: 'high' },
      {
        id: 'passage-north',
        levelId: 'sub',
        kind: 'linear',
        fare: 'paid',
        // Le 地下通路 : il plonge sous les voies et ressort de l'autre côté. Le
        // plan le dessine en rose, donc en zone payante sur toute sa longueur.
        rect: f.across(10, 0, north, north + 6),
        depiction: 'blindCorner',
        nameJp: '地下通路',
        confidence: 'high',
      },
      { id: 'free-north', levelId: 'sub', kind: 'compact', fare: 'free', rect: { x0: -18, x1: -6, z0: north - 1, z1: north + 12 }, depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-south',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-south',
        to: 'free-south',
        rect: f.band(south + 9, south + 10.7),
        cross: 'z',
        passages: 3,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-north',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'passage-north',
        to: 'free-north',
        rect: { x0: -8, x1: -6.3, z0: north, z1: north + 6 },
        cross: 'x',
        passages: 3,
        staffed: true,
        depiction: 'backdrop',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-south', 'walkable', 'S'],
      ['free-north', 'backdrop', 'N'],
    ]),
    transferPortals: [],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-bare',
        kind: 'material',
        nodeId: 'free-south',
        note: 'Aucun commerce, aucune correspondance : le hall est nu, et il faut que cela se sente. C’est la gare la plus dépouillée de la boucle.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.',
      '⚠ Le plan date de juin 2022, quatre ans avant la date de référence — de très loin le plus ancien du relevé, et la seule raison de la confiance `approximate`.',
      'Uguisudani est la seule gare que la série « Guide Maps for Major Stations » ne couvre pas.',
      'La longueur réelle du 地下通路 n’est pas cotée : l’emprise ci-dessus est une mise en place.',
    ],
  };
}

// --- JY07 Nippori --------------------------------------------------------
//
// Le dépôt avait raison de traiter Nippori à part : ses ponts-concours SONT son
// niveau de correspondance, et le plan le confirme - le 2F porte à la fois le
// contrôle JR, le passage vers le Keisei et ecute, au-dessus du faisceau.
// Aucun second pont générique ne doit être ajouté.

function nippori(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const north = hallStart(z.main, 'up');
  const south = hallStart(z.far, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'abovePlatform',
    primaryAccessId: 'a-north',
    levels: [over('2f', '2F'), distant('3f', '3F', OVER_Y + STOREY)],
    platformAccesses: [
      { id: 'a-north', kind: 'stairs', order: 1, toNodeId: 'paid-north', rise: 'up', depiction: 'walkable' },
      { id: 'a-south', kind: 'stairs', order: 0, toNodeId: 'paid-south', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      {
        id: 'paid-north',
        levelId: '2f',
        kind: 'overbridge',
        fare: 'paid',
        rect: f.across(16, 12, north, north + 16),
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'free-north',
        levelId: '2f',
        kind: 'overbridge',
        fare: 'free',
        rect: { x0: f.x1 + 12, x1: f.x1 + 30, z0: north - 2, z1: north + 18 },
        depiction: 'walkable',
        confidence: 'estimated',
      },
      {
        id: 'paid-keisei',
        levelId: '2f',
        kind: 'overbridge',
        fare: 'paid',
        rect: { x0: -34, x1: -16, z0: north, z1: north + 16 },
        depiction: 'vista',
        nameEn: 'Concourse Area (Keisei Line)',
        confidence: 'high',
      },
      {
        id: 'paid-south',
        levelId: '2f',
        kind: 'overbridge',
        fare: 'paid',
        rect: f.across(14, 10, south, south + 12),
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'free-south',
        levelId: '2f',
        kind: 'overbridge',
        fare: 'free',
        rect: { x0: f.x1 + 10, x1: f.x1 + 24, z0: south - 1, z1: south + 13 },
        depiction: 'backdrop',
        confidence: 'estimated',
      },
      {
        id: 'toneri',
        levelId: '3f',
        kind: 'overbridge',
        fare: 'free',
        rect: f.across(10, 8, north + 4, north + 14),
        depiction: 'vista',
        nameEn: 'Nippori-Toneri Liner (3F)',
        confidence: 'estimated',
      },
    ],
    corridors: [
      {
        id: 'c-toneri',
        kind: 'escalator',
        from: 'free-north',
        to: 'toneri',
        rise: 1,
        rect: { x0: f.x1 + 12, x1: f.x1 + 17, z0: north + 6, z1: north + 14 },
        width: 3,
        depiction: 'stairhead',
        confidence: 'estimated',
      },
    ],
    gateGroups: [
      {
        id: 'gate-north',
        nameJp: '北改札',
        nameEn: 'North Gate',
        from: 'paid-north',
        to: 'free-north',
        rect: { x0: f.x1 + 10.3, x1: f.x1 + 12, z0: north, z1: north + 16 },
        cross: 'x',
        passages: 8,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-south',
        nameJp: '南改札',
        nameEn: 'South Gate',
        from: 'paid-south',
        to: 'free-south',
        rect: { x0: f.x1 + 8.3, x1: f.x1 + 10, z0: south, z1: south + 12 },
        cross: 'x',
        passages: 5,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-north', 'walkable', 'E'],
      ['free-south', 'backdrop', 'S'],
      ['free-north', 'shortBranch', 'N'],
    ]),
    transferPortals: [
      {
        id: 't-keisei',
        // Une ligne de contrôle ENTRE DEUX ZONES PAYANTES, avec son propre
        // ajusteur et ses guichets « Keisei Line Transfer ». Puis, plus loin,
        // le contrôle propre du Keisei : deux exploitants en enfilade.
        lines: ['京成線'],
        fromNodeId: 'paid-north',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: { x0: -18, x1: -14, z0: north + 2, z1: north + 14 },
        confidence: 'high',
      },
      {
        id: 't-toneri',
        lines: ['日暮里・舎人ライナー'],
        fromNodeId: 'free-north',
        goes: 'up',
        depiction: 'stairhead',
        confidence: 'high',
      },
      {
        id: 't-joban',
        lines: ['常磐線'],
        fromNodeId: 'paid-north',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-ecute',
        nodeId: 'paid-north',
        status: 'gallery',
        category: 'gallery',
        brand: 'ecute Nippori',
        rect: f.back(3.4, north + 3, north + 13),
        enterable: true,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-bridge',
        kind: 'trackView',
        nodeId: 'paid-north',
        note: 'Le pont-concourse enjambe tout le faisceau : on voit les voies dessous, et trois exploitants empilés sur trois niveaux.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      '⚠ Le plan date d’avril 2025, seize mois avant la référence : le plus grand écart du relevé après Uguisudani et Okachimachi.',
      'Le West Exit que le dépôt attendait n’apparaît pas sous ce nom ; le document nomme East Exit, East Exit Square et le Free Passage (Over Tracks).',
      'Le niveau 3F (Toneri Liner) est fléché mais pas cartographié : sa cote est extrapolée.',
    ],
  };
}

// --- JY08 Nishi-Nippori --------------------------------------------------
//
// Un hall d'une seule pièce, et un fait de topologie qui n'appartient qu'à
// elle : DEUX passages vers le Chiyoda partent de la ZONE PAYANTE. On change
// de compagnie sans franchir de contrôle.

function nishiNippori(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'down');
  return {
    confidence: 'approximate',
    place: 'multiLevel',
    primaryAccessId: 'a-hall',
    levels: [under('1f', '1F'), distant('3f', '3F', OVER_Y + STOREY)],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'down', depiction: 'walkable' },
      { id: 'a-hall-north', kind: 'escalator', order: 0, toNodeId: 'paid-hall', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-hall', levelId: '1f', kind: 'compact', fare: 'paid', rect: f.band(hall, hall + 12), depiction: 'walkable', confidence: 'high' },
      { id: 'free-hall', levelId: '1f', kind: 'compact', fare: 'free', rect: f.band(hall + 13.7, hall + 28), depiction: 'walkable', confidence: 'high' },
      {
        id: 'toneri',
        levelId: '3f',
        kind: 'overbridge',
        fare: 'free',
        rect: f.across(6, 6, hall + 18, hall + 26),
        depiction: 'vista',
        nameEn: 'Nippori-Toneri Liner (3F)',
        confidence: 'estimated',
      },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-hall',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: f.band(hall + 12, hall + 13.7),
        cross: 'z',
        passages: 5,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable', 'W'],
      ['free-hall', 'shortBranch', 'E'],
    ]),
    transferPortals: [
      {
        id: 't-chiyoda-paid-a',
        // DEPUIS LA ZONE PAYANTE, et le plan en montre deux comme celui-ci.
        // Aucune autre gare du relevé ne partage sa zone payante avec un autre
        // exploitant : c'est la singularité de Nishi-Nippori.
        lines: ['東京メトロ千代田線'],
        fromNodeId: 'paid-hall',
        goes: 'down',
        depiction: 'stairhead',
        rect: f.back(3, hall + 2, hall + 6),
        confidence: 'high',
      },
      {
        id: 't-chiyoda-paid-b',
        lines: ['東京メトロ千代田線'],
        fromNodeId: 'paid-hall',
        goes: 'down',
        depiction: 'stairhead',
        rect: f.front(3, hall + 6, hall + 10),
        confidence: 'high',
      },
      {
        id: 't-chiyoda-free',
        lines: ['東京メトロ千代田線'],
        fromNodeId: 'free-hall',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
      {
        id: 't-toneri',
        lines: ['日暮里・舎人ライナー'],
        fromNodeId: 'free-hall',
        goes: 'up',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-newdays',
        nodeId: 'free-hall',
        status: 'namedVerified',
        category: 'konbini',
        brand: 'NewDays',
        rect: f.back(3, hall + 16, hall + 23),
        enterable: true,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-stack',
        kind: 'void',
        nodeId: 'paid-hall',
        note: 'La superposition entière tient dans une pièce : le Chiyoda plonge depuis la zone payante, le Toneri Liner monte depuis la zone libre.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de février 2024.',
      'Les niveaux Chiyoda et Toneri Liner ne sont pas cartographiés : leur position relative au JR est extrapolée.',
      'Le plan ne nomme aucune sortie ; les noms viennent de `data/lines`, où ils sont marqués comme non relevés.',
    ],
  };
}

// --- JY09 Tabata ---------------------------------------------------------
//
// On MONTE de la tranchée vers le hall. Deux blocs aux deux bouts, et le
// rapport de taille est net sur le plan : le nord est la gare, le sud est un
// accès.

function tabata(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const north = hallStart(z.main, 'up');
  const south = hallStart(z.far, 'up');
  return {
    confidence: 'approximate',
    place: 'abovePlatform',
    primaryAccessId: 'a-north',
    levels: [over('1f', '1F')],
    platformAccesses: [
      { id: 'a-north', kind: 'stairs', order: 1, toNodeId: 'paid-north', rise: 'up', depiction: 'walkable' },
      { id: 'a-south', kind: 'stairs', order: 0, toNodeId: 'paid-south', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-north', levelId: '1f', kind: 'overbridge', fare: 'paid', rect: f.across(12, 8, north, north + 14), depiction: 'walkable', confidence: 'high' },
      { id: 'free-north', levelId: '1f', kind: 'overbridge', fare: 'free', rect: { x0: f.x1 + 8, x1: f.x1 + 26, z0: north - 2, z1: north + 16 }, depiction: 'walkable', confidence: 'estimated' },
      { id: 'paid-south', levelId: '1f', kind: 'compact', fare: 'paid', rect: f.across(6, 4, south, south + 8), depiction: 'vista', confidence: 'high' },
      { id: 'free-south', levelId: '1f', kind: 'compact', fare: 'free', rect: { x0: f.x1 + 4, x1: f.x1 + 14, z0: south, z1: south + 9 }, depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-north',
        nameJp: '北口',
        nameEn: 'North Exit Gate',
        from: 'paid-north',
        to: 'free-north',
        rect: { x0: f.x1 + 6.3, x1: f.x1 + 8, z0: north, z1: north + 14 },
        cross: 'x',
        passages: 6,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-south',
        nameJp: '南口',
        nameEn: 'South Exit Gate',
        from: 'paid-south',
        to: 'free-south',
        rect: { x0: f.x1 + 2.3, x1: f.x1 + 4, z0: south, z1: south + 8 },
        cross: 'x',
        passages: 3,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-north', 'walkable', 'N'],
      ['free-south', 'backdrop', 'S'],
    ]),
    transferPortals: [],
    commercialZones: [
      {
        id: 'shop-atre-vie',
        nodeId: 'free-north',
        status: 'namedVerified',
        category: 'gallery',
        // L'enseigne est atre VIE, pas atre : le dépôt déclarait `atre` sans
        // pouvoir la nommer.
        brand: 'atre vie Tabata',
        rect: { x0: f.x1 + 14, x1: f.x1 + 26, z0: north - 2, z1: north + 12 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-trench',
        kind: 'trackView',
        nodeId: 'paid-north',
        note: 'Le hall est posé sur la tranchée : on voit les quatre voies en contrebas depuis la zone payante.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de février 2024.',
      'Le plan ne montre aucune galerie au-delà d’atre vie : aucune ne doit être forcée.',
      'Le nombre de baies par groupe n’est pas lisible.',
    ],
  };
}

// --- JY10 Komagome -------------------------------------------------------
//
// Les deux groupes sont de part et d'autre du quai, l'un AU-DESSUS et l'autre
// EN DESSOUS. La géométrie interdit d'elle-même le corridor unique qui relierait
// artificiellement les deux extrémités.

function komagome(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const main = hallStart(z.main, 'up');
  const low = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-main',
    levels: [over('2f', '2F'), under('b1', 'B1')],
    platformAccesses: [
      { id: 'a-main', kind: 'stairs', order: 1, toNodeId: 'paid-main', rise: 'up', depiction: 'walkable' },
      { id: 'a-east', kind: 'stairs', order: 0, toNodeId: 'paid-east', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-main', levelId: '2f', kind: 'overbridge', fare: 'paid', rect: f.across(8, 6, main, main + 12), depiction: 'walkable', confidence: 'high' },
      { id: 'free-main', levelId: '2f', kind: 'overbridge', fare: 'free', rect: { x0: f.x1 + 6, x1: f.x1 + 22, z0: main - 2, z1: main + 14 }, depiction: 'walkable', confidence: 'estimated' },
      { id: 'paid-east', levelId: 'b1', kind: 'compact', fare: 'paid', rect: f.band(low, low + 8), depiction: 'blindCorner', confidence: 'high' },
      { id: 'free-east', levelId: 'b1', kind: 'compact', fare: 'free', rect: f.band(low + 9.7, low + 19), depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-main',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-main',
        to: 'free-main',
        rect: { x0: f.x1 + 4.3, x1: f.x1 + 6, z0: main, z1: main + 12 },
        cross: 'x',
        passages: 4,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-east',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-east',
        to: 'free-east',
        rect: f.band(low + 8, low + 9.7),
        cross: 'z',
        passages: 3,
        staffed: true,
        depiction: 'backdrop',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-main', 'walkable', 'N'],
      ['free-main', 'shortBranch', 'S'],
      ['free-east', 'backdrop', 'E'],
    ]),
    transferPortals: [
      {
        id: 't-namboku',
        lines: ['東京メトロ南北線'],
        fromNodeId: 'free-main',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-mets',
        nodeId: 'free-main',
        status: 'namedVerified',
        category: 'services',
        brand: 'JR-EAST Hotel Mets Komagome',
        rect: { x0: f.x1 + 14, x1: f.x1 + 22, z0: main + 2, z1: main + 14 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-split',
        kind: 'trackView',
        nodeId: 'paid-main',
        note: 'Un groupe au-dessus du quai, l’autre en dessous : la gare se lit en coupe, et rien ne les relie hors quai.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Aucun des deux contrôles n’est nommé ; le dépôt tenait 北口改札, que le plan ne confirme pas.',
    ],
  };
}

// --- JY11 Sugamo ---------------------------------------------------------
//
// Un hall, un contrôle, une descente. Le geste principal est la DESCENTE DANS
// LA TRANCHÉE, et le plan écrit « Main Exit » - pas « Front ».

function sugamo(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'abovePlatform',
    primaryAccessId: 'a-hall',
    levels: [over('1f', '1F')],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'up', depiction: 'walkable' },
      { id: 'a-hall-lift', kind: 'elevator', order: 0, toNodeId: 'paid-hall', rise: 'up', depiction: 'doorway' },
    ],
    concourses: [
      { id: 'paid-hall', levelId: '1f', kind: 'overbridge', fare: 'paid', rect: f.across(8, 6, hall, hall + 11), depiction: 'walkable', confidence: 'high' },
      { id: 'free-hall', levelId: '1f', kind: 'overbridge', fare: 'free', rect: { x0: f.x1 + 6, x1: f.x1 + 24, z0: hall - 3, z1: hall + 14 }, depiction: 'walkable', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-hall',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: { x0: f.x1 + 4.3, x1: f.x1 + 6, z0: hall, z1: hall + 11 },
        cross: 'x',
        passages: 4,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable'],
      ['free-hall', 'shortBranch', 'N'],
      ['free-hall', 'shortBranch', 'S'],
    ]),
    transferPortals: [
      {
        id: 't-mita',
        lines: ['都営三田線'],
        fromNodeId: 'free-hall',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-atre-vie-a',
        nodeId: 'free-hall',
        status: 'namedVerified',
        category: 'gallery',
        // LE DÉPÔT NE DÉCLARE PAS `atre` POUR SUGAMO : c'est un manque que le
        // relevé comble, et le plan en montre deux blocs, pas un.
        brand: 'atre vie Sugamo',
        rect: { x0: f.x1 + 16, x1: f.x1 + 24, z0: hall - 3, z1: hall + 3 },
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-atre-vie-b',
        nodeId: 'free-hall',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre vie Sugamo',
        rect: { x0: f.x1 + 16, x1: f.x1 + 24, z0: hall + 8, z1: hall + 14 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-trench',
        kind: 'trackView',
        nodeId: 'paid-hall',
        note: 'Le hall enjambe la tranchée : la descente vers le quai est le geste principal de la gare.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Le contrôle n’est pas nommé ; le dépôt tenait 北口改札, non confirmé.',
    ],
  };
}

// --- JY12 Ōtsuka ---------------------------------------------------------
//
// Un hall central sous le viaduc qui distribue deux sorties, et le tramway
// Arakawa qu'on doit sentir tout près sans le construire - au NORD, pas au sud.

function otsuka(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-hall',
    levels: [under('1f', '1F')],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'down', depiction: 'walkable' },
      { id: 'a-hall-south', kind: 'stairs', order: 0, toNodeId: 'paid-hall', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-hall', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(hall, hall + 11), depiction: 'walkable', confidence: 'high' },
      { id: 'free-hall', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(hall + 12.7, hall + 27), depiction: 'walkable', confidence: 'high' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-hall',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: f.band(hall + 11, hall + 12.7),
        cross: 'z',
        passages: 4,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable', 'N'],
      ['free-hall', 'shortBranch', 'S'],
    ]),
    transferPortals: [
      {
        id: 't-arakawa',
        lines: ['都電荒川線'],
        fromNodeId: 'free-hall',
        goes: 'across',
        depiction: 'signOnly',
        confidence: 'high',
      },
    ],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-viaduct',
        kind: 'material',
        nodeId: 'paid-hall',
        note: 'Plafond bas sous le viaduc, la rue immédiatement dehors, et le tram qui traverse à côté du débouché nord.',
        confidence: 'estimated',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Le contrôle n’est pas nommé ; le dépôt tenait 北口改札, non confirmé.',
      'Aucun atre vie n’est cartographié — ce qui n’est pas une preuve d’absence, mais interdit d’en poser un.',
    ],
  };
}

// --- JY13 Ikebukuro ------------------------------------------------------
//
// Ce n'est pas une gare à deux bouts : c'est une gare à QUATRE ENTRÉES le long
// d'un même faisceau, avec deux blocs payants séparés au B1. Et c'est la seule
// du relevé dont les PASSAGES SONT NOMMÉS - Orange Road, Apple Road… - ce qui
// va directement à la signalétique : on s'oriente ici par eux, pas par les
// points cardinaux.

function ikebukuro(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const west = hallStart(z.main, 'down');
  const east = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-west',
    levels: [subTrack('b1', 'B1')],
    platformAccesses: [
      { id: 'a-west', kind: 'stairs', order: 1, toNodeId: 'paid-west', rise: 'down', depiction: 'walkable' },
      { id: 'a-east', kind: 'stairs', order: 0, toNodeId: 'paid-east', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      {
        id: 'paid-west',
        levelId: 'b1',
        kind: 'hubSlice',
        fare: 'paid',
        rect: f.across(18, 14, west, west + 20),
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'free-west',
        levelId: 'b1',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: -44, x1: -18, z0: west - 4, z1: west + 24 },
        depiction: 'walkable',
        nameJp: 'オレンジロード',
        nameEn: 'Orange Road',
        confidence: 'high',
      },
      {
        id: 'paid-east',
        levelId: 'b1',
        kind: 'hubSlice',
        fare: 'paid',
        rect: f.across(16, 12, east, east + 16),
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'free-east',
        levelId: 'b1',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: f.x1 + 12, x1: f.x1 + 36, z0: east - 4, z1: east + 20 },
        depiction: 'backdrop',
        nameJp: 'アップルロード',
        nameEn: 'Apple Road',
        confidence: 'high',
      },
    ],
    // Les traversées nommées du plan - Southern, Central et Northern Passage -
    // relient les deux blocs du B1 sans passer par le quai. Elles ne sont PAS
    // écrites en couloirs ici : le relevé donne leurs noms et leur existence,
    // pas leur tracé, et un couloir inventé entre deux points connus est
    // exactement le genre de trait qui se met ensuite à faire autorité.
    corridors: [],
    gateGroups: [
      {
        id: 'gate-central-1',
        nameJp: '中央改札1',
        nameEn: 'Central Gate 1',
        from: 'paid-west',
        to: 'free-west',
        rect: { x0: -20, x1: -18.3, z0: west, z1: west + 20 },
        cross: 'x',
        passages: 12,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-central-2',
        nameJp: '中央改札2',
        nameEn: 'Central Gate 2',
        from: 'paid-east',
        to: 'free-east',
        rect: { x0: f.x1 + 10.3, x1: f.x1 + 12, z0: east, z1: east + 16 },
        cross: 'x',
        passages: 10,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'gate-north',
        nameJp: '北改札',
        nameEn: 'North Gate',
        from: 'paid-east',
        to: 'free-east',
        rect: { x0: f.x1 + 10.3, x1: f.x1 + 12, z0: east + 17, z1: east + 20 },
        cross: 'x',
        passages: 6,
        staffed: true,
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 'gate-south',
        nameJp: '南改札',
        nameEn: 'South Gate',
        from: 'paid-west',
        to: 'free-west',
        rect: { x0: -20, x1: -18.3, z0: west - 4, z1: west - 1 },
        cross: 'x',
        passages: 8,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-east', 'backdrop', 'E'],
      ['free-west', 'walkable', 'W'],
    ]),
    transferPortals: [
      {
        id: 't-tobu',
        // Trois exploitants dont les 改札 SE TOUCHENT : c'est la signature
        // d'Ikebukuro, et rien d'autre sur la boucle n'y ressemble.
        lines: ['東武東上線'],
        fromNodeId: 'free-west',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: { x0: -44, x1: -38, z0: west + 14, z1: west + 24 },
        confidence: 'high',
      },
      {
        id: 't-marunouchi',
        lines: ['東京メトロ丸ノ内線'],
        fromNodeId: 'free-west',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: { x0: -44, x1: -38, z0: west - 4, z1: west + 4 },
        confidence: 'high',
      },
      {
        id: 't-seibu',
        // Absent du plan alors que ses grands magasins y sont : la
        // correspondance existe, sa géométrie n'est pas dans ce document.
        lines: ['西武池袋線'],
        fromNodeId: 'free-east',
        goes: 'across',
        depiction: 'signOnly',
        confidence: 'unverified',
      },
      {
        id: 't-saikyo',
        lines: ['埼京線', '湘南新宿ライン'],
        fromNodeId: 'paid-west',
        goes: 'up',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-tobu',
        nodeId: 'free-west',
        status: 'namedVerified',
        category: 'fashion',
        brand: 'Tobu Department Store',
        rect: { x0: -44, x1: -34, z0: west + 4, z1: west + 14 },
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-seibu',
        nodeId: 'free-east',
        status: 'namedVerified',
        category: 'fashion',
        brand: 'Seibu Department Store',
        rect: { x0: f.x1 + 26, x1: f.x1 + 36, z0: east - 2, z1: east + 12 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-owl',
        kind: 'artwork',
        nodeId: 'free-east',
        note: 'いけふくろう — la chouette d’Ikebukuro, nommée sur le plan (« Statue of Ikefukuro »). C’est LE point de rendez-vous de la gare.',
        confidence: 'high',
      },
      {
        id: 'lm-roads',
        kind: 'column',
        nodeId: 'free-west',
        note: 'Les passages portent des noms — Orange Road, Apple Road, Azeria Road, Cherry Road — et c’est par eux qu’on s’oriente, pas par les points cardinaux.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.',
      'Le plan est de février 2026, six mois avant la référence.',
      'Ni le Seibu Ikebukuro, ni les lignes Yūrakuchō / Fukutoshin ne sont cartographiés : le document est JR + Tōbu + Marunouchi.',
      'Aucun aplat « large store inside the ticket gates » : rien derrière les portillons, et c’est un fait de relevé.',
      'Les noms japonais des passages (オレンジロード, アップルロード…) viennent de l’édition anglaise par concordance, et restent à confirmer.',
    ],
  };
}

// --- JY14 Mejiro ---------------------------------------------------------
//
// La plus simple des trente : un hall, un contrôle, une descente. Le sujet est
// le CALME et le petit volume au-dessus de la tranchée, pas la surface.

function mejiro(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'abovePlatform',
    primaryAccessId: 'a-hall',
    levels: [over('1f', '1F'), distant('2f', '2F', OVER_Y + STOREY)],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'up', depiction: 'walkable' },
      { id: 'a-hall-lift', kind: 'elevator', order: 0, toNodeId: 'paid-hall', rise: 'up', depiction: 'doorway' },
    ],
    concourses: [
      { id: 'paid-hall', levelId: '1f', kind: 'overbridge', fare: 'paid', rect: f.across(6, 4, hall, hall + 9), depiction: 'walkable', confidence: 'high' },
      { id: 'free-hall', levelId: '1f', kind: 'compact', fare: 'free', rect: { x0: f.x1 + 4, x1: f.x1 + 18, z0: hall - 2, z1: hall + 12 }, depiction: 'walkable', confidence: 'estimated' },
      {
        id: 'shops-2f',
        levelId: '2f',
        kind: 'mezzanine',
        fare: 'free',
        rect: { x0: f.x1 + 4, x1: f.x1 + 16, z0: hall + 2, z1: hall + 12 },
        depiction: 'vista',
        nameEn: 'Shops (2F)',
        confidence: 'estimated',
      },
    ],
    corridors: [
      {
        id: 'c-shops',
        kind: 'escalator',
        from: 'free-hall',
        to: 'shops-2f',
        rise: 1,
        rect: { x0: f.x1 + 6, x1: f.x1 + 10, z0: hall + 6, z1: hall + 12 },
        width: 2.4,
        depiction: 'stairhead',
        confidence: 'estimated',
      },
    ],
    gateGroups: [
      {
        id: 'gate-hall',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: { x0: f.x1 + 2.3, x1: f.x1 + 4, z0: hall, z1: hall + 9 },
        cross: 'x',
        passages: 3,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable'],
      ['free-hall', 'shortBranch', 'W'],
    ]),
    // L'une des deux seules gares de la boucle sans aucune correspondance
    // ferroviaire, et le plan n'en fléche effectivement pas une.
    transferPortals: [],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-bridge',
        kind: 'trackView',
        nodeId: 'paid-hall',
        note: 'Le bâtiment-pont posé sur la tranchée : peu de locaux, vue dégagée, et la voie qui file dessous.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Le contrôle n’est pas nommé ; le dépôt tenait 中央改札, non confirmé.',
      'Aucune sortie nommée n’apparaît dans le cadrage : les deux noms viennent de `data/lines`, marqués non relevés.',
      'Le renvoi « for Shops (2F) » ne porte aucune enseigne : le niveau est déclaré, son contenu non.',
    ],
  };
}

// --- JY15 Takadanobaba ---------------------------------------------------
//
// Deux blocs de tailles très inégales, et le contraste EST le sujet : Waseda
// est la gare, Toyama se lit d'un coup d'œil. Les deux correspondances sortent
// du même côté ; Toyama n'en dessert aucune.

function takadanobaba(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const waseda = hallStart(z.main, 'down');
  const toyama = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-waseda',
    levels: [under('1f', '1F')],
    platformAccesses: [
      { id: 'a-waseda', kind: 'stairs', order: 1, toNodeId: 'paid-waseda', rise: 'down', depiction: 'walkable' },
      { id: 'a-toyama', kind: 'stairs', order: 0, toNodeId: 'paid-toyama', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-waseda', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(waseda, waseda + 13), depiction: 'walkable', confidence: 'high' },
      { id: 'free-waseda', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(waseda + 14.7, waseda + 30), depiction: 'walkable', confidence: 'high' },
      { id: 'paid-toyama', levelId: '1f', kind: 'compact', fare: 'paid', rect: f.band(toyama, toyama + 6), depiction: 'vista', confidence: 'high' },
      { id: 'free-toyama', levelId: '1f', kind: 'compact', fare: 'free', rect: f.band(toyama + 7.7, toyama + 14), depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-waseda',
        nameJp: '早稲田口',
        nameEn: 'Waseda Exit Gate',
        from: 'paid-waseda',
        to: 'free-waseda',
        rect: f.band(waseda + 13, waseda + 14.7),
        cross: 'z',
        passages: 8,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-toyama',
        nameJp: '戸山口',
        nameEn: 'Toyama Exit Gate',
        from: 'paid-toyama',
        to: 'free-toyama',
        rect: f.band(toyama + 6, toyama + 7.7),
        cross: 'z',
        passages: 3,
        staffed: false,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-waseda', 'walkable', 'E'],
      ['free-toyama', 'backdrop', 'W'],
    ]),
    transferPortals: [
      {
        id: 't-seibu',
        // Un contrôle entre exploitants AU MILIEU DU QUAI, avec son propre
        // bracket : ce n'est ni une sortie, ni une correspondance de plain-pied.
        lines: ['西武新宿線'],
        fromNodeId: 'paid-waseda',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: f.back(4, waseda + 2, waseda + 8),
        confidence: 'high',
      },
      {
        id: 't-tozai',
        lines: ['東京メトロ東西線'],
        fromNodeId: 'free-waseda',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
    ],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-contrast',
        kind: 'column',
        nodeId: 'paid-waseda',
        note: 'Le rapport de taille entre les deux blocs est ce que le plan montre le plus clairement : le second doit se lire d’un coup d’œil depuis le quai.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de juin 2026, deux mois avant la référence.',
      'Les noms japonais viennent de l’édition anglaise par concordance ; 早稲田口 est déjà au dépôt et le plan le corrobore comme nom de SORTIE.',
    ],
  };
}

// --- JY16 Shin-Ōkubo -----------------------------------------------------
//
// Un hall minuscule, et deux choses qui ne se produisent nulle part ailleurs :
// un passage « Exit Only (IC card only) », à sens unique, et un PONT
// D'ASCENSEURS au 4F - deux appareils qui enjambent la voie par le haut, sans
// qu'aucun niveau de gare n'existe là-haut.

function shinOkubo(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-hall',
    levels: [under('1f', '1F'), distant('4f', '4F', OVER_Y + STOREY, 2.6)],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'down', depiction: 'walkable' },
      { id: 'a-lift', kind: 'elevator', order: 0, toNodeId: 'lift-bridge', rise: 'up', depiction: 'doorway' },
    ],
    concourses: [
      { id: 'paid-hall', levelId: '1f', kind: 'compact', fare: 'paid', rect: f.band(hall, hall + 10), depiction: 'walkable', confidence: 'high' },
      { id: 'free-hall', levelId: '1f', kind: 'compact', fare: 'free', rect: f.band(hall + 11.7, hall + 24), depiction: 'walkable', confidence: 'high' },
      {
        id: 'lift-bridge',
        levelId: '4f',
        kind: 'overbridge',
        fare: 'paid',
        rect: f.across(5, 4, hall - 12, hall - 6),
        depiction: 'vista',
        nameEn: 'Elevator bridge (4F)',
        confidence: 'high',
      },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-hall',
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: f.back(4.2, hall + 10, hall + 11.7),
        cross: 'z',
        passages: 5,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-exit-only',
        nameJp: '出口専用',
        nameEn: 'Exit Only',
        from: 'paid-hall',
        to: 'free-hall',
        rect: f.front(1.6, hall + 10, hall + 11.7),
        cross: 'z',
        passages: 2,
        exitOnly: true,
        icOnly: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable'],
      ['free-hall', 'shortBranch', 'E'],
    ]),
    transferPortals: [],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-lift-bridge',
        kind: 'trackView',
        nodeId: 'paid-hall',
        note: 'Le pont d’ascenseurs du 4F enjambe la voie et redescend de l’autre côté : visible depuis le quai, jamais emprunté.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Le contrôle n’est pas nommé ; le dépôt tenait 中央改札, non confirmé.',
      'Aucune sortie nommée : les deux noms de `data/lines` sont marqués non relevés.',
      'Le renvoi « for Station Building (2F) » ne porte aucune enseigne.',
    ],
  };
}

// --- JY17 Shinjuku -------------------------------------------------------
//
// Deux niveaux de contrôle qui ALTERNENT le long d'un même quai, et non un hall
// unique : c'est l'ossature de la gare, et c'est le seul plan de la boucle daté
// d'août 2026 — la date de référence du chantier, au mois près.

function shinjuku(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const b1 = hallStart(z.main, 'down');
  const spine = hallStart(z.far, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-central-east',
    levels: [subTrack('b1f', 'B1F'), over('2f', '2F')],
    platformAccesses: [
      { id: 'a-central-east', kind: 'stairs', order: 1, toNodeId: 'paid-b1f', rise: 'down', depiction: 'walkable' },
      { id: 'a-south', kind: 'stairs', order: 0, toNodeId: 'paid-2f', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      {
        id: 'paid-b1f',
        levelId: 'b1f',
        kind: 'cross',
        fare: 'paid',
        // 中央通路 : le couloir central est-ouest, d'un seul tenant, avec une
        // volée vers chacun des huit quais.
        rect: f.across(30, 26, b1, b1 + 16),
        depiction: 'walkable',
        nameJp: '中央通路',
        nameEn: 'Central Passage (B1F)',
        confidence: 'high',
      },
      {
        id: 'free-central-east',
        levelId: 'b1f',
        kind: 'hubSlice',
        fare: 'free',
        // Seize mètres, et pas quarante-huit : la zone libre est de Shinjuku ;
        // la TRANCHE JOUABLE ne l'est pas. Ce qu'on parcourt reste étroit et
        // assumé, et le reste se voit sans se traverser.
        rect: { x0: f.x1 + 16, x1: f.x1 + 32, z0: b1 - 4, z1: b1 + 20 },
        depiction: 'walkable',
        confidence: 'estimated',
      },
      {
        id: 'free-central-west',
        levelId: 'b1f',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: -52, x1: -30, z0: b1 - 4, z1: b1 + 20 },
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'paid-2f',
        levelId: '2f',
        kind: 'hubSlice',
        fare: 'paid',
        // L'épine sud, nord-sud, qui redescend elle aussi vers les huit quais.
        rect: f.across(12, 16, spine - 10, spine + 22),
        depiction: 'vista',
        nameEn: 'South spine (2F)',
        confidence: 'high',
      },
      {
        id: 'free-2f',
        levelId: '2f',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: f.x1 + 16, x1: f.x1 + 34, z0: spine - 8, z1: spine + 20 },
        depiction: 'backdrop',
        confidence: 'estimated',
      },
      {
        id: 'paid-east-branch',
        levelId: 'b1f',
        kind: 'linear',
        fare: 'paid',
        rect: { x0: f.x1 + 12, x1: f.x1 + 16, z0: b1 + 26, z1: b1 + 40 },
        depiction: 'blindCorner',
        confidence: 'high',
      },
      {
        id: 'paid-keio-branch',
        levelId: 'b1f',
        kind: 'linear',
        fare: 'paid',
        rect: { x0: -30, x1: -24, z0: b1 - 24, z1: b1 - 10 },
        depiction: 'blindCorner',
        confidence: 'high',
      },
    ],
    corridors: [
      {
        id: 'c-east-branch',
        // La branche est vers les voies 5&6 : un long couloir, puis un virage.
        kind: 'corridor',
        from: 'paid-b1f',
        to: 'paid-east-branch',
        rise: 0,
        rect: { x0: f.x1 + 12, x1: f.x1 + 16, z0: b1 + 16, z1: b1 + 26 },
        width: 4,
        depiction: 'blindCorner',
        confidence: 'high',
      },
      {
        id: 'c-keio-branch',
        // La branche sud : JR Central West Gate (Keiō Exit), puis Keiō Line
        // Gate. Deux lignes de contrôle qui se suivent dans le même couloir.
        kind: 'corridor',
        from: 'paid-b1f',
        to: 'paid-keio-branch',
        rise: 0,
        rect: { x0: -30, x1: -24, z0: b1 - 10, z1: b1 },
        width: 5,
        depiction: 'blindCorner',
        confidence: 'high',
      },
    ],
    gateGroups: [
      {
        id: 'gate-central-east',
        nameJp: '中央東改札',
        nameEn: 'Central East Gate',
        from: 'paid-b1f',
        to: 'free-central-east',
        rect: { x0: f.x1 + 14.3, x1: f.x1 + 16, z0: b1, z1: b1 + 16 },
        cross: 'x',
        passages: 14,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-central-west',
        nameJp: '中央西改札',
        nameEn: 'Central West Gate',
        from: 'paid-b1f',
        to: 'free-central-west',
        rect: { x0: -30, x1: -28.3, z0: b1, z1: b1 + 16 },
        cross: 'x',
        passages: 12,
        staffed: true,
        // DEUX GROUPES SUR NEUF FERMENT LA NUIT, et le plan donne leurs
        // horaires. Une gare dont certains contrôles s'éteignent n'est pas une
        // gare dont tous les contrôles se valent.
        hours: '6:00 – dernier train',
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'gate-southeast',
        nameJp: '南東改札',
        nameEn: 'Southeast Gate',
        from: 'paid-2f',
        to: 'free-2f',
        rect: { x0: f.x1 + 14.3, x1: f.x1 + 16, z0: spine - 8, z1: spine + 4 },
        cross: 'x',
        passages: 8,
        staffed: true,
        hours: '7:00 – 24:00',
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'gate-new-south',
        nameJp: '新南改札',
        nameEn: 'New South Gate',
        from: 'paid-2f',
        to: 'free-2f',
        rect: { x0: f.x1 + 14.3, x1: f.x1 + 16, z0: spine + 8, z1: spine + 20 },
        cross: 'x',
        passages: 10,
        staffed: true,
        depiction: 'signOnly',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-central-east', 'walkable', 'E'],
      ['free-2f', 'signOnly', 'S'],
      ['free-central-west', 'vista', 'W'],
      ['free-central-east', 'walkable'],
      ['free-central-west', 'vista'],
      ['free-2f', 'signOnly', 'SE'],
      ['free-2f', 'signOnly', 'S'],
      ['free-2f', 'signOnly', 'S'],
      ['free-2f', 'signOnly', 'S'],
    ]),
    transferPortals: [
      {
        id: 't-keio',
        lines: ['京王線'],
        fromNodeId: 'paid-keio-branch',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: { x0: -30, x1: -24, z0: b1 - 24, z1: b1 - 16 },
        confidence: 'high',
      },
      {
        id: 't-odakyu',
        lines: ['小田急線'],
        fromNodeId: 'paid-b1f',
        goes: 'across',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-toei',
        lines: ['都営新宿線', '都営大江戸線'],
        fromNodeId: 'free-central-west',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-saikyo',
        lines: ['埼京線', '湘南新宿ライン'],
        fromNodeId: 'paid-b1f',
        goes: 'up',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-eato-lumine',
        nodeId: 'paid-b1f',
        status: 'gallery',
        category: 'gallery',
        brand: 'EATo LUMINE',
        // DANS LA ZONE PAYANTE, et ce n'est pas une lecture de couleur : le
        // plan la classe lui-même dans l'aplat « Large store (inside the
        // ticket gates) ». C'est le fait le plus remarquable du document.
        rect: f.across(10, 8, b1 + 2, b1 + 14),
        enterable: true,
        confidence: 'high',
      },
      {
        id: 'shop-lumine-est',
        nodeId: 'free-central-east',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'LUMINE EST Shinjuku',
        rect: { x0: f.x1 + 22, x1: f.x1 + 32, z0: b1 + 6, z1: b1 + 20 },
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-newoman',
        nodeId: 'paid-2f',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'NEWoMan',
        rect: { x0: f.x1 + 6, x1: f.x1 + 14, z0: spine, z1: spine + 18 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-two-levels',
        kind: 'void',
        nodeId: 'paid-b1f',
        note: 'Deux niveaux de contrôle alternent le long du même quai : les volées montantes vers l’épine 2F se voient depuis le couloir B1F.',
        confidence: 'high',
      },
      {
        id: 'lm-penguin',
        kind: 'artwork',
        nodeId: 'free-2f',
        note: 'Suica Penguin Park et sa statue, zone libre 2F est, contre le terminal de bus — nommés sur le plan.',
        confidence: 'high',
      },
    ],
    works: {
      summary: 'Zone « Under Construction » sur le flanc sud du couloir B1F, entre les volées des voies 7&8 et 11&12. Le plan se déclare lui-même provisoire.',
      since: '2026-08',
      partitions: [
        {
          id: 'hoard-b1f-south',
          nodeId: 'paid-b1f',
          rect: f.across(6, 4, b1, b1 + 3),
          kind: 'hoarding',
          noticeEn: 'There may be some changes due to construction work.',
        },
      ],
      confidence: 'high',
    },
    openQuestions: [
      'Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.',
      'Le cadrage ne montre pas l’implantation exacte des East Gate et West Gate (B1F) : leurs noms et leur niveau sont établis par les brackets du plan de quais, leur géométrie non.',
      'Le plan est celui de JR seul : ni Tokyo Metro Marunouchi, ni Seibu Shinjuku, ni les numéros de sortie Metro n’y figurent.',
      'Les noms japonais des neuf groupes ne sont pas sur cette édition anglaise.',
      'Cinq des neuf groupes ne sont pas modélisés ici : East, West, South, Kōshū-kaidō et MIRAINA TOWER sont attestés par les brackets, mais non situés.',
    ],
  };
}

// --- JY18 Yoyogi ---------------------------------------------------------
//
// ⚠ Le bloc principal est West/East, PAS North - le contraire de ce que le
// cahier des charges supposait. Les deux blocs ont chacun leur accès à l'Ōedo,
// ce qui est rare.

function yoyogi(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const west = hallStart(z.main, 'down');
  const north = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-west',
    levels: [under('1f', '1F')],
    platformAccesses: [
      { id: 'a-west', kind: 'stairs', order: 1, toNodeId: 'paid-west', rise: 'down', depiction: 'walkable' },
      { id: 'a-north', kind: 'stairs', order: 0, toNodeId: 'paid-north', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-west', levelId: '1f', kind: 'compact', fare: 'paid', rect: f.band(west, west + 12), depiction: 'walkable', confidence: 'high' },
      { id: 'free-west', levelId: '1f', kind: 'compact', fare: 'free', rect: f.band(west + 13.7, west + 28), depiction: 'walkable', confidence: 'high' },
      { id: 'paid-north', levelId: '1f', kind: 'compact', fare: 'paid', rect: f.band(north, north + 8), depiction: 'vista', confidence: 'high' },
      { id: 'free-north', levelId: '1f', kind: 'compact', fare: 'free', rect: f.band(north + 9.7, north + 18), depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-west',
        nameJp: '西口',
        nameEn: 'West Exit Gate',
        from: 'paid-west',
        to: 'free-west',
        rect: f.band(west + 12, west + 13.7),
        cross: 'z',
        passages: 6,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-north',
        nameJp: '北口',
        nameEn: 'North Exit Gate',
        from: 'paid-north',
        to: 'free-north',
        rect: f.band(north + 8, north + 9.7),
        cross: 'z',
        passages: 4,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-west', 'walkable', 'W'],
      ['free-west', 'shortBranch', 'E'],
      ['free-north', 'backdrop', 'N'],
    ]),
    transferPortals: [
      {
        id: 't-oedo-west',
        lines: ['都営大江戸線'],
        fromNodeId: 'free-west',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
      {
        id: 't-oedo-north',
        // Le renvoi existe DES DEUX CÔTÉS : la correspondance se prend depuis
        // l'un ou l'autre bloc, ce qui est rare sur la boucle.
        lines: ['都営大江戸線'],
        fromNodeId: 'free-north',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-chuo-sobu',
        lines: ['中央・総武線'],
        fromNodeId: 'paid-west',
        goes: 'across',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-local',
        kind: 'column',
        nodeId: 'free-west',
        note: 'Échelle étroite et locale : deux blocs modestes, aucune galerie, des marquises anciennes au-dessus.',
        confidence: 'estimated',
      },
    ],
    openQuestions: [
      'Le plan date de janvier 2026.',
      '⚠ L’appariement voies ↔ îlots n’est pas résolu à la résolution fournie : le relevé du dépôt (`sharedIsland` avec la Chūō-Sōbu) n’est ni confirmé ni contredit.',
      'Le plan nomme les SORTIES (North, West, East), pas les contrôles : les noms de groupes ci-dessus suivent la concordance de panneau.',
    ],
  };
}

// --- JY19 Harajuku -------------------------------------------------------
//
// L'EXCEPTION DU RELEVÉ : les deux ensembles se construisent tous les deux,
// parce qu'ils sont si petits que l'un ne suffirait pas à faire une gare. Le
// contraste de matière entre le béton bas du souterrain de 1924 et le bois
// clair du bâtiment de 2020 est le sujet ; la surface ne l'est pas.

function harajuku(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const take = hallStart(z.main, 'down');
  const omote = hallStart(z.far, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-takeshita',
    levels: [subTrack('b1f', 'B1F'), over('2f', '2F')],
    platformAccesses: [
      { id: 'a-takeshita', kind: 'stairs', order: 1, toNodeId: 'paid-takeshita', rise: 'down', depiction: 'walkable' },
      { id: 'a-omote', kind: 'stairs', order: 0, toNodeId: 'paid-omote', rise: 'up', depiction: 'walkable' },
    ],
    concourses: [
      {
        id: 'paid-takeshita',
        levelId: 'b1f',
        kind: 'compact',
        fare: 'paid',
        // Un souterrain en T : trois volées depuis les quais, un couloir, une
        // petite ligne de portillons, et la sortie. Rien d'autre.
        rect: f.across(9, 0, take, take + 7),
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'free-takeshita',
        levelId: 'b1f',
        kind: 'compact',
        fare: 'free',
        rect: { x0: -20, x1: -9, z0: take - 1, z1: take + 9 },
        depiction: 'walkable',
        confidence: 'estimated',
      },
      {
        id: 'paid-omote',
        levelId: '2f',
        kind: 'overbridge',
        fare: 'paid',
        // Une passerelle ÉTROITE qui file au-dessus des voies vers l'est.
        rect: f.across(7, 5, omote, omote + 6),
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'free-omote',
        levelId: '2f',
        kind: 'compact',
        fare: 'free',
        rect: { x0: f.x1 + 5, x1: f.x1 + 20, z0: omote - 3, z1: omote + 10 },
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-takeshita',
        // Le plan ne nomme PAS ce contrôle : il nomme la sortie. C'est donc
        // 改札口, la valeur prudente.
        nameJp: '改札口',
        nameEn: 'Gate',
        from: 'paid-takeshita',
        to: 'free-takeshita',
        rect: { x0: -11, x1: -9.3, z0: take, z1: take + 7 },
        cross: 'x',
        passages: 6,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-omote-sando',
        // CORRECTION AU DÉPÔT, appliquée en phase 3 : le contrôle du bâtiment
        // de 2020 s'appelle 表参道改札 ; « West » est le nom d'une SORTIE.
        nameJp: '表参道改札',
        nameEn: 'Omote-sandō Gate',
        from: 'paid-omote',
        to: 'free-omote',
        rect: { x0: f.x1 + 3.3, x1: f.x1 + 5, z0: omote, z1: omote + 6 },
        cross: 'x',
        passages: 7,
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-omote', 'walkable', 'W'],
      ['free-takeshita', 'walkable', 'N'],
      ['free-omote', 'shortBranch', 'E'],
    ]),
    transferPortals: [
      {
        id: 't-metro',
        // Le plan ne NOMME pas la ligne (Chiyoda / Fukutoshin à
        // Meiji-jingūmae) et n'en montre pas le cheminement : on garde la
        // direction, pas la ligne.
        lines: ['東京メトロ千代田線', '副都心線'],
        fromNodeId: 'free-omote',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'estimated',
      },
    ],
    commercialZones: [
      {
        id: 'shop-newdays',
        nodeId: 'free-omote',
        status: 'namedVerified',
        category: 'konbini',
        brand: 'NewDays',
        rect: { x0: f.x1 + 12, x1: f.x1 + 19, z0: omote + 2, z1: omote + 8 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-materials',
        kind: 'material',
        nodeId: 'paid-takeshita',
        note: 'Béton bas et carrelé du souterrain contre bois clair et verre du bâtiment de 2020 : deux gares dans la même, sans passage de l’une à l’autre hors quai.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.',
      'Le plan date de septembre 2025 : onze mois avant la référence.',
      'La ligne Metro en correspondance n’est pas nommée sur le document ; les deux clés ci-dessus sont une lecture de voisinage, pas un relevé.',
      'Aucun aplat de grand commerce : les boutiques du quartier ne sont pas dans la gare, et le plan le confirme.',
    ],
  };
}

// --- JY20 Shibuya --------------------------------------------------------
//
// ⚠ Plan de JUIN 2026, deux mois avant la référence, sur la gare la plus
// mouvante de la boucle : aucun fait ci-dessous ne doit être présenté comme
// « l'état d'août ». Les palissades de chantier sont un élément de décor de
// premier plan, pas un détail - elles ferment le périmètre là où le plan
// lui-même s'arrête.

function shibuya(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hachiko = hallStart(z.main, 'down');
  const south = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-hachiko',
    levels: [subTrack('1f', '1F')],
    platformAccesses: [
      { id: 'a-hachiko', kind: 'stairs', order: 1, toNodeId: 'paid-hachiko', rise: 'down', depiction: 'walkable' },
      { id: 'a-south', kind: 'stairs', order: 0, toNodeId: 'paid-south', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-hachiko', levelId: '1f', kind: 'hubSlice', fare: 'paid', rect: f.across(12, 10, hachiko, hachiko + 18), depiction: 'walkable', confidence: 'high' },
      { id: 'free-hachiko', levelId: '1f', kind: 'hubSlice', fare: 'free', rect: { x0: -34, x1: -12, z0: hachiko - 4, z1: hachiko + 22 }, depiction: 'walkable', confidence: 'estimated' },
      { id: 'paid-south', levelId: '1f', kind: 'hubSlice', fare: 'paid', rect: f.across(10, 8, south, south + 14), depiction: 'vista', confidence: 'high' },
      { id: 'free-south', levelId: '1f', kind: 'hubSlice', fare: 'free', rect: { x0: f.x1 + 8, x1: f.x1 + 26, z0: south - 2, z1: south + 16 }, depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-hachiko',
        nameJp: 'ハチ公改札',
        nameEn: 'Hachikō Gate',
        from: 'paid-hachiko',
        to: 'free-hachiko',
        rect: { x0: -13.7, x1: -12, z0: hachiko, z1: hachiko + 18 },
        cross: 'x',
        passages: 12,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-hachiko-exit-only',
        nameJp: '出口専用',
        nameEn: 'Exit Only',
        from: 'paid-hachiko',
        to: 'free-hachiko',
        rect: { x0: -13.7, x1: -12, z0: hachiko + 19, z1: hachiko + 22 },
        cross: 'x',
        passages: 3,
        exitOnly: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-south',
        nameJp: '南改札',
        nameEn: 'South Gate',
        from: 'paid-south',
        to: 'free-south',
        rect: { x0: f.x1 + 6.3, x1: f.x1 + 8, z0: south, z1: south + 14 },
        cross: 'x',
        passages: 9,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'gate-central',
        nameJp: '中央改札',
        nameEn: 'Central Gate',
        from: 'paid-hachiko',
        to: 'free-hachiko',
        rect: { x0: -13.7, x1: -12, z0: hachiko - 4, z1: hachiko - 1 },
        cross: 'x',
        passages: 8,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hachiko', 'walkable', 'NW'],
      ['free-hachiko', 'shortBranch', 'NE'],
      ['free-south', 'backdrop', 'E'],
      ['free-hachiko', 'signOnly', 'W'],
    ]),
    transferPortals: [
      {
        id: 't-inokashira',
        lines: ['京王井の頭線'],
        fromNodeId: 'free-hachiko',
        goes: 'across',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-metro',
        lines: ['東京メトロ銀座線', '半蔵門線', '副都心線'],
        fromNodeId: 'free-hachiko',
        goes: 'up',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-tokyu',
        lines: ['東急東横線', '田園都市線'],
        fromNodeId: 'free-south',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-saikyo',
        lines: ['埼京線', '湘南新宿ライン'],
        fromNodeId: 'paid-hachiko',
        goes: 'across',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    // Le plan de Shibuya ne place AUCUNE galerie commerciale de gare, ni
    // derrière ni devant les portillons. Le hall est nu, et c'est un fait de
    // relevé, pas un oubli. Hikarie, Scramble Square, Stream et Sakura Stage
    // sont des bâtiments voisins, pas des commerces de gare.
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-hoardings',
        kind: 'material',
        nodeId: 'paid-hachiko',
        note: 'Plus de chantier que de gare finie : parois provisoires, plafonds bas rapportés, panneaux de détour. C’est l’état à représenter.',
        confidence: 'high',
      },
    ],
    works: {
      summary: 'Zones « Under Construction » sur les deux quais (au moins quatre emprises) et trois blocs du 1F, dont l’essentiel du côté Hachikō.',
      partitions: [
        {
          id: 'hoard-hachiko-a',
          nodeId: 'paid-hachiko',
          rect: f.across(12, 4, hachiko + 14, hachiko + 18),
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
        {
          id: 'hoard-hachiko-b',
          nodeId: 'free-hachiko',
          rect: { x0: -34, x1: -26, z0: hachiko + 14, z1: hachiko + 22 },
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
        {
          id: 'detour-south',
          nodeId: 'paid-south',
          rect: f.across(10, 2, south, south + 4),
          kind: 'detour',
        },
      ],
      confidence: 'high',
    },
    openQuestions: [
      'Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.',
      '⚠ Le plan est de juin 2026, la référence est août 2026. Sur une gare qui bouge tous les trimestres, deux mois déplacent une palissade ou rouvrent un passage.',
      'Le New South Gate est très loin au sud, séparé du reste : il n’est pas modélisé ici, faute de pouvoir le situer.',
      'Les niveaux Ginza (au-dessus) et Tōkyū / Metro (en dessous) sont absents du document : leur position relative reste à établir.',
      'Les noms japonais des groupes ne sont pas sur cette édition anglaise.',
    ],
  };
}

// --- JY21 Ebisu ----------------------------------------------------------
//
// Il n'y a pas de hall unique à Ebisu : il y a DEUX GARES SUPERPOSÉES à la même
// verticale. Le West Exit est au 1F, de plain-pied avec la place ; l'East Exit
// est au 3F, enveloppé d'atre. Le contraste haut / bas est le sujet.

function ebisu(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const west = hallStart(z.main, 'down');
  const east = hallStart(z.far, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-west',
    levels: [under('1f', '1F'), over('3f', '3F')],
    platformAccesses: [
      { id: 'a-west', kind: 'stairs', order: 1, toNodeId: 'paid-west', rise: 'down', depiction: 'walkable' },
      { id: 'a-east', kind: 'escalator', order: 0, toNodeId: 'paid-east', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-west', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(west, west + 11), depiction: 'walkable', confidence: 'high' },
      { id: 'free-west', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(west + 12.7, west + 27), depiction: 'walkable', confidence: 'high' },
      { id: 'paid-east', levelId: '3f', kind: 'overbridge', fare: 'paid', rect: f.across(8, 6, east, east + 12), depiction: 'vista', confidence: 'high' },
      { id: 'free-east', levelId: '3f', kind: 'hubSlice', fare: 'free', rect: { x0: f.x1 + 6, x1: f.x1 + 24, z0: east - 2, z1: east + 14 }, depiction: 'vista', confidence: 'high' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-west',
        nameJp: '西口',
        nameEn: 'West Exit Gate',
        from: 'paid-west',
        to: 'free-west',
        rect: f.band(west + 11, west + 12.7),
        cross: 'z',
        passages: 7,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-east',
        nameJp: '東口',
        nameEn: 'East Exit Gate',
        from: 'paid-east',
        to: 'free-east',
        rect: { x0: f.x1 + 4.3, x1: f.x1 + 6, z0: east, z1: east + 12 },
        cross: 'x',
        passages: 6,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-west', 'walkable', 'W'],
      ['free-east', 'vista', 'E'],
    ]),
    transferPortals: [
      {
        id: 't-hibiya',
        lines: ['東京メトロ日比谷線'],
        fromNodeId: 'free-west',
        goes: 'across',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-saikyo',
        lines: ['埼京線', '湘南新宿ライン'],
        fromNodeId: 'paid-west',
        goes: 'across',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-atre-east',
        nodeId: 'free-east',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre Ebisu',
        // Présent aux TROIS niveaux : la gare est enveloppée par la galerie
        // plutôt que bordée, et c'est ce qui fait Ebisu.
        rect: { x0: f.x1 + 14, x1: f.x1 + 24, z0: east - 2, z1: east + 14 },
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-atre-west',
        nodeId: 'free-west',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre Ebisu',
        rect: f.back(3, west + 16, west + 26),
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-skywalk',
        kind: 'material',
        nodeId: 'free-east',
        note: 'Le départ du Yebisu Skywalk vers Garden Place : un couloir qui part et ne revient pas. Ce n’est pas une correspondance ferroviaire — le plan le fléche sans en donner la longueur.',
        confidence: 'estimated',
      },
      {
        id: 'lm-updown',
        kind: 'void',
        nodeId: 'paid-west',
        note: 'Deux contrôles à deux niveaux opposés du même quai : depuis le hall bas, on voit partir la volée vers le 3F et son atmosphère commerciale.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Le Yebisu Skywalk est fléché, pas cartographié : sa longueur reste inconnue. Ce n’est pas une ligne, donc pas un portail de correspondance — il est porté par un repère.',
      'Les noms japonais 東口 / 西口 viennent de l’édition anglaise par concordance.',
    ],
  };
}

// --- JY22 Meguro ---------------------------------------------------------
//
// Un PUITS : peu de surface, beaucoup de hauteur. On monte du quai en tranchée
// au hall, puis l'on voit REPARTIR VERS LE BAS les volées des trois autres
// lignes. L'enchaînement montée-puis-descente est le sujet.

function meguro(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-hall',
    levels: [over('1f', '1F'), distant('b2', 'B2-B3', UNDER_Y - STOREY * 2)],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'up', depiction: 'walkable' },
      { id: 'a-hall-lift', kind: 'elevator', order: 0, toNodeId: 'paid-hall', rise: 'up', depiction: 'doorway' },
    ],
    concourses: [
      { id: 'paid-hall', levelId: '1f', kind: 'overbridge', fare: 'paid', rect: f.across(8, 6, hall, hall + 12), depiction: 'walkable', confidence: 'high' },
      { id: 'free-hall', levelId: '1f', kind: 'compact', fare: 'free', rect: { x0: f.x1 + 6, x1: f.x1 + 24, z0: hall - 3, z1: hall + 15 }, depiction: 'walkable', confidence: 'high' },
      {
        id: 'other-lines',
        levelId: 'b2',
        kind: 'hubSlice',
        fare: 'free',
        rect: { x0: f.x1 + 8, x1: f.x1 + 22, z0: hall + 2, z1: hall + 14 },
        depiction: 'vista',
        nameEn: 'Tōkyū / Namboku / Mita (B2-B3)',
        confidence: 'high',
      },
    ],
    corridors: [
      {
        id: 'c-down',
        kind: 'escalator',
        from: 'free-hall',
        to: 'other-lines',
        rise: -1,
        rect: { x0: f.x1 + 8, x1: f.x1 + 13, z0: hall + 6, z1: hall + 14 },
        width: 3.2,
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    gateGroups: [
      {
        id: 'gate-central',
        nameJp: '中央改札',
        nameEn: 'Central Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: { x0: f.x1 + 4.3, x1: f.x1 + 6, z0: hall, z1: hall + 12 },
        cross: 'x',
        passages: 6,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable', 'E'],
      ['free-hall', 'shortBranch', 'W'],
    ]),
    transferPortals: [
      {
        id: 't-three-lines',
        // Le trio descend : Tōkyū Meguro, Namboku, Mita, tous SOUS le quai JR.
        // La signalétique y est à trois couleurs, et c'est ce qu'on doit voir.
        lines: ['東急目黒線', '東京メトロ南北線', '都営三田線'],
        fromNodeId: 'free-hall',
        goes: 'down',
        depiction: 'stairhead',
        rect: { x0: f.x1 + 8, x1: f.x1 + 13, z0: hall + 6, z1: hall + 14 },
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-atre-a',
        nodeId: 'free-hall',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre Meguro 1',
        rect: { x0: f.x1 + 16, x1: f.x1 + 24, z0: hall - 3, z1: hall + 3 },
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-atre-b',
        nodeId: 'free-hall',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre Meguro 1',
        rect: { x0: f.x1 + 16, x1: f.x1 + 24, z0: hall + 9, z1: hall + 15 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-shaft',
        kind: 'void',
        nodeId: 'paid-hall',
        note: 'La tranchée vue depuis le hall, et juste après, les volées qui replongent vers le B2-B3 : monter puis redescendre est le geste de Meguro.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Le cadrage ne montre qu’un seul groupe de portillons ; un côté ouest éventuel n’est pas dans le champ.',
      'La feuille B3-B2 n’a pas été dépouillée : la cote de -12,9 m est extrapolée d’une hauteur d’étage ordinaire.',
    ],
  };
}

// --- JY23 Gotanda --------------------------------------------------------
//
// La gare n'a presque pas de surface : elle a une HAUTEUR. Depuis le quai, on
// doit voir partir vers le haut la volée du Tōkyū Ikegami - deux niveaux, un
// contrôle au bout - et vers le bas celle du Toei Asakusa.

function gotanda(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'down');
  const tokyu = hallStart(z.far, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-hall',
    levels: [under('1f', '1F'), distant('4f', '4F', OVER_Y + STOREY)],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'down', depiction: 'walkable' },
      { id: 'a-tokyu', kind: 'stairs', order: 0, toNodeId: 'paid-tokyu', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-hall', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(hall, hall + 11), depiction: 'walkable', confidence: 'high' },
      { id: 'free-hall', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(hall + 12.7, hall + 27), depiction: 'walkable', confidence: 'high' },
      {
        id: 'paid-tokyu',
        levelId: '4f',
        kind: 'overbridge',
        fare: 'paid',
        // DEUX NIVEAUX AU-DESSUS du quai JR : c'est le plus grand écart
        // vertical de correspondance de toute la boucle.
        rect: f.across(6, 5, tokyu, tokyu + 10),
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-central',
        nameJp: '中央改札',
        nameEn: 'Central Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: f.band(hall + 11, hall + 12.7),
        cross: 'z',
        passages: 6,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable', 'W'],
      ['free-hall', 'shortBranch', 'E'],
    ]),
    transferPortals: [
      {
        id: 't-ikegami',
        lines: ['東急池上線'],
        fromNodeId: 'paid-hall',
        goes: 'up',
        gated: true,
        depiction: 'stairhead',
        rect: f.back(4, hall + 2, hall + 9),
        confidence: 'high',
      },
      {
        id: 't-asakusa',
        lines: ['都営浅草線'],
        fromNodeId: 'free-hall',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-atre-1',
        nodeId: 'free-hall',
        status: 'namedVerified',
        category: 'gallery',
        // LE DÉPÔT NE DÉCLARAIT PAS `atre` POUR GOTANDA : deuxième manque
        // comblé par le relevé, après Sugamo.
        brand: 'atre Gotanda 1',
        rect: f.back(3, hall + 14, hall + 20),
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-atre-2',
        nodeId: 'free-hall',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'atre Gotanda 2',
        rect: f.front(3, hall + 14, hall + 20),
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-mets',
        nodeId: 'free-hall',
        status: 'namedVerified',
        category: 'services',
        brand: 'JR-EAST Hotel Mets Gotanda',
        rect: f.back(3, hall + 22, hall + 27),
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-section',
        kind: 'trackView',
        nodeId: 'paid-hall',
        note: 'Une correspondance en haut, une en bas : la Tōkyū Ikegami perchée au 4F et le Toei Asakusa sous la rue, lisibles depuis le même point.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Le 3F n’apparaît pas : l’onglet couvre 1F-4F mais le plan ne montre que 1F, 2F et 4F. Ce qui occupe le 3F reste inconnu.',
      'Les noms japonais ne sont pas sur cette édition anglaise.',
    ],
  };
}

// --- JY24 Ōsaki ----------------------------------------------------------
//
// La zone libre d'Ōsaki EST un pont piéton : le plan l'écrit en toutes lettres,
// « Concourse outside the ticket gate = Pedestrian overpass ». Les quatre
// débouchés mènent chacun à un DECK, pas à une rue - on atteint les tours sans
// jamais toucher le sol.

function osaki(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const north = hallStart(z.main, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'abovePlatform',
    primaryAccessId: 'a-north',
    levels: [over('2f', '2F')],
    platformAccesses: [
      { id: 'a-north', kind: 'stairs', order: 1, toNodeId: 'paid-north', rise: 'up', depiction: 'walkable' },
      { id: 'a-south', kind: 'stairs', order: 0, toNodeId: 'paid-south', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-north', levelId: '2f', kind: 'overbridge', fare: 'paid', rect: f.across(16, 10, north, north + 14), depiction: 'walkable', confidence: 'high' },
      {
        id: 'free-deck',
        levelId: '2f',
        kind: 'cross',
        fare: 'free',
        // La passerelle : elle traverse tout le site, porte les quatre
        // débouchés, et les DEUX contrôles sont à ses deux bouts. C'est un
        // seul objet, et c'est pour cela que le second groupe est écrit de
        // l'autre côté d'elle plutôt qu'à l'autre bout du quai : l'accès qui
        // le dessert, lui, porte son rang et n'a pas de cote.
        rect: { x0: -46, x1: f.x1 + 34, z0: north + 15.7, z1: north + 32 },
        depiction: 'walkable',
        nameEn: 'Pedestrian overpass',
        confidence: 'high',
      },
      { id: 'paid-south', levelId: '2f', kind: 'overbridge', fare: 'paid', rect: f.across(14, 8, north + 33.7, north + 46), depiction: 'vista', confidence: 'high' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-north',
        nameJp: '北改札',
        nameEn: 'North Gate',
        from: 'paid-north',
        to: 'free-deck',
        rect: f.across(16, 10, north + 14, north + 15.7),
        cross: 'z',
        passages: 8,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-south',
        nameJp: '南改札',
        nameEn: 'South Gate',
        from: 'paid-south',
        to: 'free-deck',
        rect: f.across(14, 8, north + 32, north + 33.7),
        cross: 'z',
        passages: 6,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-deck', 'walkable', 'E'],
      ['free-deck', 'walkable', 'W'],
      ['free-deck', 'shortBranch', 'NE'],
      ['free-deck', 'shortBranch', 'NW'],
    ]),
    transferPortals: [
      {
        id: 't-rinkai',
        lines: ['りんかい線'],
        fromNodeId: 'paid-north',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
      {
        id: 't-shonan',
        lines: ['湘南新宿ライン', '埼京線'],
        fromNodeId: 'paid-north',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-dila-a',
        nodeId: 'free-deck',
        status: 'gallery',
        category: 'gallery',
        // TROISIÈME MANQUE COMBLÉ : le dépôt ne déclarait aucune galerie pour
        // Ōsaki. Le plan en nomme une, en deux blocs.
        brand: 'Dila Osaki',
        rect: { x0: -24, x1: -8, z0: north + 17, z1: north + 23 },
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-dila-b',
        nodeId: 'free-deck',
        status: 'gallery',
        category: 'gallery',
        brand: 'Dila Osaki',
        rect: { x0: f.x1 + 14, x1: f.x1 + 30, z0: north + 17, z1: north + 23 },
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-deck',
        kind: 'trackView',
        nodeId: 'free-deck',
        note: 'Une zone libre entièrement suspendue : les huit voies dessous, GATE CITY OHSAKI et Think Park au bout, et l’Ikoi-no Square nommée sur le plan.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date d’avril 2026.',
      'Les quatre débouchés (New West, West, East, New East) sont des SORTIES, pas des contrôles : les seuls contrôles sont South Gate et North Gate.',
      'Les noms japonais ne sont pas sur cette édition anglaise.',
    ],
  };
}

// --- JY25 Shinagawa ------------------------------------------------------
//
// Le passage LIBRE du 2F est l'ossature : une bande hors contrôle court d'ouest
// en est, et les zones payantes la bordent DES DEUX CÔTÉS. On traverse
// Shinagawa de part en part sans jamais entrer en gare - c'est l'inverse d'un
// couloir payant, et cela change tout le dessin.

function shinagawa(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const central = hallStart(z.main, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'abovePlatform',
    primaryAccessId: 'a-central',
    levels: [over('2f', '2F')],
    platformAccesses: [
      { id: 'a-central', kind: 'stairs', order: 1, toNodeId: 'paid-central', rise: 'up', depiction: 'walkable' },
      { id: 'a-north', kind: 'stairs', order: 0, toNodeId: 'paid-north', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-central', levelId: '2f', kind: 'overbridge', fare: 'paid', rect: f.across(20, 14, central, central + 16), depiction: 'walkable', confidence: 'high' },
      {
        id: 'free-passage',
        levelId: '2f',
        kind: 'cross',
        fare: 'free',
        // Une bande LIBRE bordée de zones payantes des deux côtés : c'est
        // l'ossature de Shinagawa, et les deux contrôles la longent de part
        // et d'autre plutôt que de se suivre.
        rect: { x0: -60, x1: f.x1 + 40, z0: central + 17.7, z1: central + 32 },
        depiction: 'walkable',
        nameEn: 'Free passage (2F)',
        confidence: 'high',
      },
      { id: 'paid-north', levelId: '2f', kind: 'overbridge', fare: 'paid', rect: f.across(18, 12, central + 33.7, central + 48), depiction: 'vista', confidence: 'high' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-central',
        nameJp: '中央改札',
        nameEn: 'Central Gate',
        from: 'paid-central',
        to: 'free-passage',
        rect: f.across(20, 14, central + 16, central + 17.7),
        cross: 'z',
        passages: 14,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-north',
        nameJp: '北改札',
        nameEn: 'North Gate',
        from: 'paid-north',
        to: 'free-passage',
        rect: f.across(18, 12, central + 32, central + 33.7),
        cross: 'z',
        passages: 9,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-passage', 'walkable', 'W'],
      ['free-passage', 'walkable', 'E'],
    ]),
    transferPortals: [
      {
        id: 't-keikyu',
        lines: ['京急線'],
        fromNodeId: 'free-passage',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: { x0: -60, x1: -50, z0: central + 18, z1: central + 30 },
        confidence: 'high',
      },
      {
        id: 't-shinkansen',
        // Quatre lignes de contrôle relevées, deux au nord, deux au sud : comme
        // à Tokyo, passer au Shinkansen demande de franchir un second 改札.
        lines: ['東海道新幹線'],
        fromNodeId: 'paid-central',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: f.across(20, 2, central + 2, central + 10),
        confidence: 'high',
      },
      {
        id: 't-jr-lines',
        lines: ['東海道線', '横須賀線', '上野東京ライン'],
        fromNodeId: 'paid-central',
        goes: 'down',
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-ecute',
        nodeId: 'free-passage',
        status: 'gallery',
        category: 'gallery',
        brand: 'ecute Shinagawa',
        rect: { x0: -46, x1: -20, z0: central + 18, z1: central + 26 },
        enterable: true,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-triangle-clock',
        kind: 'clock',
        nodeId: 'free-passage',
        note: '三角時計, le Triangle Clock, nommé sur le plan juste à côté du Central Gate : c’est LE point de rendez-vous de Shinagawa.',
        confidence: 'high',
      },
      {
        id: 'lm-through',
        kind: 'trackView',
        nodeId: 'free-passage',
        note: 'Le passage se suit d’un bout à l’autre sans entrer en gare : il faut que le joueur comprenne qu’il peut le traverser, contrôles de part et d’autre.',
        confidence: 'high',
      },
    ],
    works: {
      summary: 'Au moins sept zones « Under Construction » sur la feuille des quais et deux sur celle du hall, dont une contre le Takanawa Exit.',
      partitions: [
        {
          id: 'hoard-takanawa',
          nodeId: 'free-passage',
          rect: { x0: -60, x1: -48, z0: central + 26, z1: central + 32 },
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
        {
          id: 'hoard-central',
          nodeId: 'paid-central',
          rect: f.across(20, 0, central + 12, central + 16),
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
      ],
      confidence: 'high',
    },
    openQuestions: [
      '⚠ Il n’y a pas de voie 2 : la voie Yamanote intérieure a une face de quai POUR ELLE SEULE, tandis que l’extérieure partage son îlot avec la Keihin-Tōhoku. Le dépôt décrit Shinagawa par un unique `config: sharedIsland` : cette asymétrie ne s’y exprime pas, et elle se tranche hors de ce chantier.',
      'Le plan date de juillet 2026, un mois avant la référence.',
      'Les noms japonais ne sont pas sur cette édition anglaise.',
    ],
  };
}

// --- JY26 Takanawa Gateway -----------------------------------------------
//
// La topologie la plus simple des trente : UNE SEULE PIÈCE, DEUX PORTES. Le
// hall transversal du 2F peut donc être jouable en entier - c'est la seule gare
// de la boucle où le périmètre jouable coïncide avec la gare.

function takanawaGateway(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'abovePlatform',
    primaryAccessId: 'a-hall',
    levels: [over('2f', '2F'), distant('3f', '3F Deck', OVER_Y + STOREY)],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'up', depiction: 'walkable' },
      { id: 'a-hall-lift', kind: 'elevator', order: 0, toNodeId: 'paid-hall', rise: 'up', depiction: 'doorway' },
    ],
    concourses: [
      {
        id: 'paid-hall',
        levelId: '2f',
        kind: 'cross',
        fare: 'paid',
        rect: f.across(14, 10, hall, hall + 14),
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'free-hall',
        levelId: '2f',
        kind: 'cross',
        fare: 'free',
        // Les deux groupes occupent les DEUX BOUTS du même hall : la zone libre
        // n'est pas derrière la zone payante, elle l'encadre.
        rect: { x0: f.x1 + 10, x1: f.x1 + 30, z0: hall - 4, z1: hall + 18 },
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'deck-3f',
        levelId: '3f',
        kind: 'overbridge',
        fare: 'free',
        rect: { x0: f.x1 + 14, x1: f.x1 + 28, z0: hall + 4, z1: hall + 16 },
        depiction: 'vista',
        nameEn: '3F Deck',
        confidence: 'estimated',
      },
    ],
    corridors: [
      {
        id: 'c-deck',
        kind: 'escalator',
        from: 'free-hall',
        to: 'deck-3f',
        rise: 1,
        rect: { x0: f.x1 + 14, x1: f.x1 + 19, z0: hall + 8, z1: hall + 16 },
        width: 3,
        depiction: 'stairhead',
        confidence: 'estimated',
      },
    ],
    gateGroups: [
      {
        id: 'gate-north',
        nameJp: '北改札',
        nameEn: 'North Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: { x0: f.x1 + 8.3, x1: f.x1 + 10, z0: hall + 8, z1: hall + 14 },
        cross: 'x',
        passages: 5,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-south',
        nameJp: '南改札',
        nameEn: 'South Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: { x0: f.x1 + 8.3, x1: f.x1 + 10, z0: hall, z1: hall + 6 },
        cross: 'x',
        passages: 5,
        staffed: true,
        // Les DEUX groupes sont franchissables : c'est la seule gare du relevé
        // où le jeu ne renonce à rien.
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable', 'N'],
      ['free-hall', 'walkable', 'S'],
    ]),
    transferPortals: [
      {
        id: 't-sengakuji',
        lines: ['都営浅草線', '京急線'],
        fromNodeId: 'free-hall',
        goes: 'across',
        depiction: 'shortBranch',
        confidence: 'high',
      },
    ],
    // À la date du document, la gare est un VOLUME, pas une galerie : le plan
    // ne place aucune enseigne nommée. Les commerces attendent un plan récent.
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-roof',
        kind: 'ceiling',
        nodeId: 'paid-hall',
        note: 'La grande toiture pliée, douze mètres plus haut, et la lumière naturelle qui tombe dessus : c’est TOUT ce qui fait cette gare.',
        confidence: 'high',
      },
      {
        id: 'lm-timber',
        kind: 'material',
        nodeId: 'free-hall',
        note: 'Acier blanc, cèdre clair, verre : la plus lumineuse de la boucle, et la seule dont l’architecture est entièrement propre.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      '⚠ Le plan date de septembre 2025, alors que Takanawa Gateway City s’ouvre par tranches : les commerces et les liaisons de dalle d’août 2026 ne peuvent pas y être lus.',
      'Le 3F Deck est fléché mais pas cartographié : sa cote est extrapolée.',
      'Les noms japonais des deux groupes ne sont pas sur cette édition.',
    ],
  };
}

// --- JY27 Tamachi --------------------------------------------------------
//
// La disposition est le sujet : les contrôles sont AU MILIEU de la passerelle,
// les sorties aux QUATRE COINS. C'est l'inverse d'une gare à deux bouts.

function tamachi(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const hall = hallStart(z.main, 'up');
  return {
    confidence: 'mostlyVerified',
    place: 'abovePlatform',
    primaryAccessId: 'a-hall',
    levels: [over('2f', '2F'), distant('3f', '3F', OVER_Y + STOREY)],
    platformAccesses: [
      { id: 'a-hall', kind: 'stairs', order: 1, toNodeId: 'paid-hall', rise: 'up', depiction: 'walkable' },
      { id: 'a-hall-south', kind: 'stairs', order: 0, toNodeId: 'paid-hall', rise: 'up', depiction: 'stairhead' },
    ],
    concourses: [
      {
        id: 'paid-hall',
        levelId: '2f',
        kind: 'overbridge',
        fare: 'paid',
        rect: f.across(14, 10, hall, hall + 14),
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'free-hall',
        levelId: '2f',
        kind: 'cross',
        fare: 'free',
        rect: { x0: -32, x1: f.x1 + 28, z0: hall + 16, z1: hall + 28 },
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'deck-3f',
        levelId: '3f',
        kind: 'overbridge',
        fare: 'free',
        rect: { x0: f.x1 + 12, x1: f.x1 + 28, z0: hall + 18, z1: hall + 28 },
        depiction: 'vista',
        nameEn: 'Shibaura decks (3F)',
        confidence: 'estimated',
      },
    ],
    corridors: [
      {
        id: 'c-deck',
        kind: 'escalator',
        from: 'free-hall',
        to: 'deck-3f',
        rise: 1,
        rect: { x0: f.x1 + 12, x1: f.x1 + 17, z0: hall + 20, z1: hall + 28 },
        width: 3,
        depiction: 'stairhead',
        confidence: 'estimated',
      },
    ],
    gateGroups: [
      {
        id: 'gate-north',
        nameJp: '北改札',
        nameEn: 'North Gate',
        from: 'paid-hall',
        to: 'free-hall',
        rect: f.across(6, 4, hall + 14, hall + 15.7),
        cross: 'z',
        passages: 7,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-south',
        nameJp: '南改札',
        nameEn: 'South Gate',
        from: 'paid-hall',
        to: 'free-hall',
        // Accolés au CENTRE de la passerelle, et se partageant guichets et
        // ajusteurs : ce n'est pas deux gares, c'est deux moitiés d'une porte.
        rect: { x0: PSD_X + layoutFor(i).depth + 4, x1: PSD_X + layoutFor(i).depth + 14, z0: hall + 14, z1: hall + 15.7 },
        cross: 'z',
        passages: 6,
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-hall', 'walkable', 'W'],
      ['free-hall', 'walkable', 'E'],
    ]),
    transferPortals: [
      {
        id: 't-toei',
        // Fléché depuis le Mita Exit (West Exit) : c'est la gare de Mita, à
        // l'autre bout d'un cheminement que le plan ne dessine pas.
        lines: ['都営浅草線', '都営三田線'],
        fromNodeId: 'free-hall',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
    ],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-middle',
        kind: 'column',
        nodeId: 'free-hall',
        note: 'Les deux contrôles accolés au milieu, les quatre débouchés aux angles : la passerelle se lit d’un seul regard, et c’est sa forme qui la nomme.',
        confidence: 'high',
      },
    ],
    works: {
      summary: 'Trois zones « Under Construction » : deux au 2F de part et d’autre du hall, une au niveau des quais côté sud.',
      partitions: [
        {
          id: 'hoard-west',
          nodeId: 'free-hall',
          rect: { x0: -32, x1: -22, z0: hall + 16, z1: hall + 28 },
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
        {
          id: 'hoard-east',
          nodeId: 'free-hall',
          rect: { x0: f.x1 + 18, x1: f.x1 + 28, z0: hall + 16, z1: hall + 20 },
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
      ],
      confidence: 'high',
    },
    openQuestions: [
      'Le plan date d’avril 2026, quatre mois avant la référence, sur une gare en travaux.',
      'Le 3F est fléché mais pas cartographié : c’est probablement le deck côté Shibaura, sans confirmation.',
      'Les noms japonais 三田口 / 芝浦口 restent à confirmer.',
    ],
  };
}

// --- JY28 Hamamatsuchō ---------------------------------------------------
//
// Deux contrôles à deux niveaux différents, et c'est le SUD qui concentre tout :
// le contrôle JR, le passage vers Haneda, et les palissades de chantier.

function hamamatsucho(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const south = hallStart(z.main, 'up');
  const north = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'multiLevel',
    primaryAccessId: 'a-south',
    levels: [over('3f', '3F'), under('1f', '1F')],
    platformAccesses: [
      { id: 'a-south', kind: 'stairs', order: 1, toNodeId: 'paid-south', rise: 'up', depiction: 'walkable' },
      { id: 'a-north', kind: 'stairs', order: 0, toNodeId: 'paid-north', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-south', levelId: '3f', kind: 'overbridge', fare: 'paid', rect: f.across(10, 8, south, south + 13), depiction: 'walkable', confidence: 'high' },
      { id: 'free-south', levelId: '3f', kind: 'hubSlice', fare: 'free', rect: { x0: f.x1 + 8, x1: f.x1 + 26, z0: south - 3, z1: south + 16 }, depiction: 'walkable', confidence: 'high' },
      { id: 'paid-north', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(north, north + 10), depiction: 'vista', confidence: 'high' },
      { id: 'free-north', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(north + 11.7, north + 24), depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-south',
        nameJp: '南口',
        nameEn: 'South Exit Gate',
        from: 'paid-south',
        to: 'free-south',
        rect: { x0: f.x1 + 6.3, x1: f.x1 + 8, z0: south, z1: south + 13 },
        cross: 'x',
        passages: 7,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-north',
        nameJp: '北口',
        nameEn: 'North Exit Gate',
        from: 'paid-north',
        to: 'free-north',
        rect: f.band(north + 10, north + 11.7),
        cross: 'z',
        passages: 5,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-north', 'vista', 'N'],
      ['free-south', 'walkable', 'S'],
    ]),
    transferPortals: [
      {
        id: 't-monorail',
        // On ne « passe » pas au monorail de Haneda : on franchit un second
        // 改札, avec son propre ajusteur « Fare Adjustment (Monorail) ».
        lines: ['東京モノレール'],
        fromNodeId: 'paid-south',
        goes: 'across',
        gated: true,
        depiction: 'doorway',
        rect: f.across(10, 2, south + 2, south + 11),
        confidence: 'high',
      },
      {
        id: 't-daimon',
        lines: ['都営浅草線', '都営大江戸線'],
        fromNodeId: 'free-north',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
    ],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-hinode',
        kind: 'material',
        nodeId: 'free-south',
        note: 'Le renvoi « for Hinode Pier » porte la mention « Stairway Only » : la direction de Takeshiba existe et n’est PAS accessible. Ce n’est pas une correspondance ferroviaire, et elle n’est donc pas écrite comme telle.',
        confidence: 'high',
      },
      {
        id: 'lm-monorail',
        kind: 'trackView',
        nodeId: 'paid-south',
        note: 'Le monorail arrive à hauteur du hall sud : son quai et son 改札 se voient depuis la zone payante JR, derrière les palissades.',
        confidence: 'high',
      },
    ],
    works: {
      summary: 'Deux zones « Under Construction » au 3F, de part et d’autre du South Exit.',
      partitions: [
        {
          id: 'hoard-south-a',
          nodeId: 'paid-south',
          rect: f.across(10, 0, south + 10, south + 13),
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
        {
          id: 'hoard-south-b',
          nodeId: 'free-south',
          rect: { x0: f.x1 + 16, x1: f.x1 + 26, z0: south - 3, z1: south + 2 },
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
      ],
      confidence: 'high',
    },
    openQuestions: [
      'Le plan date de juin 2026, deux mois avant la référence, sur une gare en travaux au sud.',
      'Le World Trade Center n’apparaît pas nommément sur le plan.',
      'Les noms japonais ne sont pas sur cette édition anglaise.',
    ],
  };
}

// --- JY29 Shimbashi ------------------------------------------------------
//
// Le découpage du document donne la réponse la plus précieuse du relevé : entre
// le hall (B1F) et la Yokosuka (B4F), le plan ne montre RIEN. Trois niveaux de
// vide. La trémie vers la Yokosuka doit donc se lire comme un PUITS, pas comme
// un escalier.

function shimbashi(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const south = hallStart(z.main, 'down');
  const north = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-south',
    levels: [
      under('1f', '1F'),
      distant('b1f', 'B1F', UNDER_Y - STOREY),
      distant('b4f', 'B4F', UNDER_Y - STOREY * 4),
    ],
    platformAccesses: [
      { id: 'a-south', kind: 'stairs', order: 1, toNodeId: 'paid-south', rise: 'down', depiction: 'walkable' },
      { id: 'a-north', kind: 'stairs', order: 0, toNodeId: 'paid-north', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-south', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(south, south + 12), depiction: 'walkable', confidence: 'high' },
      { id: 'free-south', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(south + 13.7, south + 29), depiction: 'walkable', confidence: 'high' },
      { id: 'paid-north', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(north, north + 10), depiction: 'vista', confidence: 'high' },
      { id: 'free-north', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(north + 11.7, north + 24), depiction: 'backdrop', confidence: 'estimated' },
      {
        id: 'paid-shiodome',
        levelId: 'b1f',
        kind: 'linear',
        fare: 'paid',
        rect: f.band(south + 4, south + 16),
        depiction: 'vista',
        nameEn: 'Shiodome Underground Gate (B1F)',
        confidence: 'high',
      },
      {
        id: 'free-shiodome',
        levelId: 'b1f',
        kind: 'linear',
        fare: 'free',
        rect: f.band(south + 17.7, south + 34),
        depiction: 'backdrop',
        confidence: 'estimated',
      },
      {
        id: 'paid-yokosuka',
        levelId: 'b4f',
        kind: 'linear',
        fare: 'paid',
        // Longue et étroite, quatre niveaux plus bas, et le plan ne montre rien
        // entre les deux : c'est le vide qui est l'information.
        rect: f.front(4, south, south + 30),
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    corridors: [
      {
        id: 'c-shiodome',
        kind: 'stairs',
        from: 'paid-south',
        to: 'paid-shiodome',
        rise: -1,
        rect: f.back(3.4, south + 6, south + 12),
        width: 3.4,
        depiction: 'stairhead',
        confidence: 'high',
      },
      {
        id: 'c-yokosuka',
        kind: 'elevator',
        from: 'paid-south',
        to: 'paid-yokosuka',
        rise: -1,
        rect: f.front(3, south + 2, south + 6),
        width: 3,
        depiction: 'stairhead',
        confidence: 'high',
      },
    ],
    gateGroups: [
      {
        id: 'gate-south',
        nameJp: '南改札',
        nameEn: 'South Gate',
        from: 'paid-south',
        to: 'free-south',
        rect: f.band(south + 12, south + 13.7),
        cross: 'z',
        passages: 9,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-north',
        nameJp: '北改札',
        nameEn: 'North Gate',
        from: 'paid-north',
        to: 'free-north',
        rect: f.band(north + 10, north + 11.7),
        cross: 'z',
        passages: 6,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'gate-shiodome',
        nameJp: '汐留地下改札',
        nameEn: 'Shiodome Underground Gate',
        from: 'paid-shiodome',
        to: 'free-shiodome',
        rect: f.band(south + 16, south + 17.7),
        cross: 'z',
        passages: 5,
        staffed: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-south', 'walkable', 'W'],
      ['free-north', 'backdrop', 'N'],
      ['free-north', 'signOnly', 'E'],
      ['free-shiodome', 'backdrop', 'SE'],
    ]),
    transferPortals: [
      {
        id: 't-ginza',
        lines: ['東京メトロ銀座線'],
        fromNodeId: 'free-north',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-asakusa',
        lines: ['都営浅草線'],
        fromNodeId: 'free-shiodome',
        goes: 'across',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-yurikamome',
        lines: ['ゆりかもめ'],
        fromNodeId: 'free-south',
        goes: 'up',
        depiction: 'signOnly',
        confidence: 'high',
      },
      {
        id: 't-yokosuka',
        lines: ['横須賀線', '総武線快速'],
        fromNodeId: 'paid-south',
        goes: 'down',
        depiction: 'stairhead',
        rect: f.front(3, south + 2, south + 6),
        confidence: 'high',
      },
    ],
    commercialZones: [],
    landmarks: [
      {
        id: 'lm-shaft',
        kind: 'void',
        nodeId: 'paid-south',
        note: 'La descente vers la Yokosuka : quatre niveaux, dont trois que le plan laisse vides. Un puits, et non un escalier.',
        confidence: 'high',
      },
      {
        id: 'lm-girders',
        kind: 'material',
        nodeId: 'paid-south',
        note: 'Vieux viaduc métallique : plafond bas, poutres, la rue juste dehors derrière la bouche de Karasumori.',
        confidence: 'estimated',
      },
    ],
    works: {
      summary: 'Deux zones « Under Construction » au 1F, côté ouest.',
      partitions: [
        {
          id: 'hoard-west',
          nodeId: 'free-south',
          rect: f.back(2.6, south + 24, south + 29),
          kind: 'hoarding',
          noticeEn: 'Under Construction',
        },
      ],
      confidence: 'high',
    },
    openQuestions: [
      'Le plan date de septembre 2025, onze mois avant la référence.',
      'Le nombre exact de baies par groupe n’est pas lisible.',
      'Les niveaux B2F et B3F ne sont pas cartographiés : le vide entre le B1F et le B4F est un fait de document, pas une mesure.',
      'Karasumori est ici une SORTIE, pas un portillon — même piège qu’à Harajuku, corrigé au dépôt en phase 3.',
    ],
  };
}

// --- JY30 Yūrakuchō ------------------------------------------------------
//
// Trois ensembles le long d'un viaduc, et RIEN ENTRE EUX : ils ne doivent
// jamais se toucher. Trois contrôles sur cinq n'acceptent que la carte sans
// contact - le même fait qu'au Marunouchi Central de Tokyo, mais en série.

function yurakucho(i: number): Draft {
  const f = frame(i);
  const z = accessZs(i);
  const central = hallStart(z.main, 'down');
  const forum = hallStart(z.far, 'down');
  return {
    confidence: 'mostlyVerified',
    place: 'belowPlatform',
    primaryAccessId: 'a-central',
    levels: [under('1f', '1F')],
    platformAccesses: [
      { id: 'a-central', kind: 'stairs', order: 1, toNodeId: 'paid-central', rise: 'down', depiction: 'walkable' },
      { id: 'a-forum', kind: 'stairs', order: 0, toNodeId: 'paid-forum', rise: 'down', depiction: 'stairhead' },
    ],
    concourses: [
      { id: 'paid-central', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(central, central + 11), depiction: 'walkable', confidence: 'high' },
      { id: 'free-central', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(central + 12.7, central + 27), depiction: 'walkable', confidence: 'high' },
      { id: 'paid-forum', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(forum, forum + 9), depiction: 'vista', confidence: 'high' },
      { id: 'free-forum', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(forum + 10.7, forum + 21), depiction: 'backdrop', confidence: 'estimated' },
      { id: 'paid-hibiya', levelId: '1f', kind: 'underViaduct', fare: 'paid', rect: f.band(central - 34, central - 25), depiction: 'vista', confidence: 'high' },
      { id: 'free-hibiya', levelId: '1f', kind: 'underViaduct', fare: 'free', rect: f.band(central - 47, central - 36), depiction: 'backdrop', confidence: 'estimated' },
    ],
    corridors: [],
    gateGroups: [
      {
        id: 'gate-central',
        nameJp: '中央口',
        nameEn: 'Central Exit Gate',
        from: 'paid-central',
        to: 'free-central',
        rect: f.back(3.4, central + 11, central + 12.7),
        cross: 'z',
        passages: 6,
        wideAt: 'end',
        staffed: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-central-west',
        nameJp: '中央西口',
        nameEn: 'Central West Exit Gate',
        from: 'paid-central',
        to: 'free-central',
        rect: f.front(2.4, central + 11, central + 12.7),
        cross: 'z',
        passages: 3,
        // Trois contrôles sur cinq n'acceptent que la carte : c'est ce qui
        // distingue un petit contrôle automatique d'un vrai 改札 habité.
        icOnly: true,
        depiction: 'walkable',
        confidence: 'high',
      },
      {
        id: 'gate-forum',
        nameJp: '国際フォーラム口',
        nameEn: 'International Forum Exit Gate',
        from: 'paid-forum',
        to: 'free-forum',
        rect: f.band(forum + 9, forum + 10.7),
        cross: 'z',
        passages: 4,
        icOnly: true,
        depiction: 'vista',
        confidence: 'high',
      },
      {
        id: 'gate-hibiya',
        nameJp: '日比谷口',
        nameEn: 'Hibiya Exit Gate',
        from: 'paid-hibiya',
        to: 'free-hibiya',
        rect: f.band(central - 36, central - 34.3),
        cross: 'z',
        passages: 4,
        icOnly: true,
        depiction: 'vista',
        confidence: 'high',
      },
    ],
    exits: exitsOf(i, [
      ['free-central', 'walkable'],
      ['free-forum', 'backdrop', 'NE'],
      ['free-central', 'shortBranch', 'W'],
      ['free-hibiya', 'backdrop', 'SW'],
      ['free-forum', 'signOnly', 'E'],
    ]),
    transferPortals: [
      {
        id: 't-yurakucho-line',
        lines: ['東京メトロ有楽町線'],
        fromNodeId: 'free-forum',
        goes: 'down',
        depiction: 'signOnly',
        confidence: 'high',
      },
    ],
    commercialZones: [
      {
        id: 'shop-lumine-street-a',
        nodeId: 'free-central',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'LUMINE STREET',
        rect: f.back(2.6, central + 15, central + 24),
        enterable: false,
        confidence: 'high',
      },
      {
        id: 'shop-lumine-street-b',
        nodeId: 'free-central',
        status: 'namedVerified',
        category: 'gallery',
        brand: 'LUMINE STREET',
        rect: f.front(2.6, central + 15, central + 24),
        enterable: false,
        confidence: 'high',
      },
    ],
    landmarks: [
      {
        id: 'lm-arches',
        kind: 'material',
        nodeId: 'free-central',
        note: 'Les arches du vieux viaduc, garnies par LUMINE STREET des deux côtés : plafonds bas et maçonnerie sombre sont le sujet.',
        confidence: 'high',
      },
      {
        id: 'lm-three-groups',
        kind: 'column',
        nodeId: 'paid-central',
        note: 'Trois ensembles perceptiblement distincts le long du viaduc, et rien entre eux : ils ne doivent jamais se toucher.',
        confidence: 'high',
      },
    ],
    openQuestions: [
      'Le plan date de septembre 2025.',
      'Le Ginza Exit n’est pas dans le cadrage du 1F ; seul son bracket de quai l’atteste, et il n’est donc pas modélisé.',
      'Les noms japonais ne sont pas sur cette édition anglaise.',
      'Le Kyōbashi Exit est attesté mais non situé : il appartient au même ensemble que l’International Forum.',
    ],
  };
}

// --- La boucle -----------------------------------------------------------

/**
 * Les trente gares, dans l'ordre JY01 → JY30.
 *
 * Une fonction par gare, et jamais de table générique : c'est le seul moyen
 * qu'une gare ne ressemble à une autre que là où elles se ressemblent
 * réellement. Deux d'entre elles n'ont d'ailleurs aucun équivalent - Harajuku,
 * dont les deux ensembles se construisent tous les deux parce qu'ils sont trop
 * petits pour se suffire, et Takanawa Gateway, dont le périmètre jouable
 * coïncide avec la gare entière.
 */
const BUILDERS: readonly ((index: number) => Draft)[] = [
  tokyo,
  kanda,
  akihabara,
  okachimachi,
  ueno,
  uguisudani,
  nippori,
  nishiNippori,
  tabata,
  komagome,
  sugamo,
  otsuka,
  ikebukuro,
  mejiro,
  takadanobaba,
  shinOkubo,
  shinjuku,
  yoyogi,
  harajuku,
  shibuya,
  ebisu,
  meguro,
  gotanda,
  osaki,
  shinagawa,
  takanawaGateway,
  tamachi,
  hamamatsucho,
  shimbashi,
  yurakucho,
];

const CACHE = new Map<number, StationConcourseProfile>();

/** Le profil d'une gare, mémoïsé. L'index se replie, comme partout ailleurs. */
export function profileFor(index: number): StationConcourseProfile {
  const i = ((index % 30) + 30) % 30;
  const hit = CACHE.get(i);
  if (hit) return hit;
  const built = finish(i, BUILDERS[i](i));
  CACHE.set(i, built);
  return built;
}

/** Les trente profils, dans l'ordre de la boucle. */
export const CONCOURSE_PROFILES: readonly StationConcourseProfile[] = Array.from(
  { length: 30 },
  (_, i) => profileFor(i),
);
