// Environnement réel de chaque tronçon inter-gares, vu depuis le train : la
// Yamanote circule presque toujours à l'air libre (aucun tunnel sur la boucle
// voyageurs) mais alterne viaducs urbains, larges corridors ferroviaires,
// tranchées ouvertes et sections au niveau du sol.
//
// LE 山手貨物線 LONGE TOUT L'ARC OUEST. De Komagome à Shinagawa via Shinjuku, la
// Yamanote roule en quadruple voie : à côté d'elle courent les deux voies du
// 山手貨物線, où passent le 埼京線 et le 湘南新宿ライン - « la plupart des trains
// de la journée », dit JR East - plus le 成田エクスプレス, les 踊り子 et les
// directs Tōbu. Le jeu ne montrait de circulation parallèle qu'à quatre
// tronçons, tous à l'est ou au sud : entre Ikebukuro et Ōsaki, rien ne doublait
// jamais la rame, sur la moitié de la boucle où c'est le plus fréquent.
//
// Deux réserves, et elles sont dans la source :
//   • Tabata ↔ Komagome fait exception - 「駒込駅 - 田端駅間は電車線と貨物線とで
//     経路が異なる」 : le 貨物線 y file par le tunnel de Nakazato, ailleurs, et
//     rien ne longe la voie ;
//   • `passing` est une consigne de RENDU, pas un fait : elle ne s'affiche que
//     là où il y a du ciel à côté de la voie (corridor ou plein sol). Les
//     tronçons en tranchée et sur viaduc de l'arc ouest - Ikebukuro↔Mejiro,
//     Shibuya↔Ebisu↔Meguro↔Gotanda↔Ōsaki - sont bien longés eux aussi, mais
//     leurs murs et leurs joues de tablier occupent la place où la rame
//     croisée devrait passer. On ne les marque donc pas : une consigne qui ne
//     s'affiche pas est pire qu'une absence, elle se lit comme un fait acquis.
//
// Segment i = trajet STATIONS[i] ↔ STATIONS[(i+1)%30]. Il est NOMMÉ dans le
// sens 内回り (ordre JY croissant), mais il n'appartient à aucun des deux sens :
// c'est le même viaduc, la même tranchée, le même dépôt - parcourus à l'endroit
// ou à l'envers. Seule la façon d'y arriver dépend du sens, d'où le paramètre
// `dir` des fonctions ci-dessous.

import { CONFIG } from './config.ts';
import { nextStation, STATION_COUNT, stationAtHop, wrapStation } from './loop.ts';
import { LOOP_HUB_INDICES } from './stations.ts';
import type { LoopDirection } from './platforms.ts';
import type { Phase } from '../store';

export { stationAtHop };

export type SegmentKind = 'viaduct' | 'corridor' | 'trench' | 'ground';

export interface Segment {
  kind: SegmentKind;
  /** Ponts routiers au-dessus des voies : 1 = épars (~1/400 m), 2 = fréquents (~1/260 m). */
  bridges?: 1 | 2;
  /** Végétation renforcée le long de la voie. */
  greenery?: boolean;
  /** Rames stationnées visibles (dépôts, voies de garage). */
  depot?: boolean;
  /** Train croisé sur les voies parallèles. */
  passing?: 'shinkansen' | 'commuter';
  /** Tranchée : hauteur du mur de soutènement (m, défaut WALL_DEFAULT). */
  wallHeight?: number;
  /** La tranchée s'ouvre sur la fin du tronçon : les murs s'abaissent. */
  opensAtEnd?: boolean;
  /** Corridor : paires de voies parallèles visibles par côté (défaut 2). */
  tracks?: number;
  /** Tronçon largement couvert par des structures de gare (Shinjuku→Yoyogi). */
  covered?: boolean;
}

export const SEGMENTS: Segment[] = [
  /* 00 Tokyo→Kanda             */ { kind: 'viaduct' },
  /* 01 Kanda→Akihabara         */ { kind: 'viaduct' },
  /* 02 Akihabara→Okachimachi   */ { kind: 'viaduct' },
  /* 03 Okachimachi→Ueno        */ { kind: 'viaduct' },
  /* 04 Ueno→Uguisudani         */ { kind: 'corridor', greenery: true },
  /* 05 Uguisudani→Nippori      */ { kind: 'corridor', passing: 'shinkansen' },
  /* 06 Nippori→Nishi-Nippori   */ { kind: 'corridor' },
  /* 07 Nishi-Nippori→Tabata    */ { kind: 'corridor', depot: true },
  /* 08 Tabata→Komagome         */ { kind: 'ground', greenery: true },
  /* 09 Komagome→Sugamo         */ { kind: 'trench', bridges: 2, wallHeight: 7 },
  /* 10 Sugamo→Otsuka           */ { kind: 'trench', bridges: 1, opensAtEnd: true },
  /* 11 Otsuka→Ikebukuro        */ { kind: 'ground', passing: 'commuter' },
  /* 12 Ikebukuro→Mejiro        */ { kind: 'trench', bridges: 1, wallHeight: 4 },
  /* 13 Mejiro→Takadanobaba     */ { kind: 'ground', greenery: true, passing: 'commuter' },
  /* 14 Takadanobaba→Shin-Okubo */ { kind: 'ground', passing: 'commuter' },
  /* 15 Shin-Okubo→Shinjuku     */ { kind: 'corridor', tracks: 3, passing: 'commuter' },
  /* 16 Shinjuku→Yoyogi         */ { kind: 'corridor', covered: true, passing: 'commuter' },
  /* 17 Yoyogi→Harajuku         */ { kind: 'ground', greenery: true, passing: 'commuter' },
  /* 18 Harajuku→Shibuya        */ { kind: 'ground', greenery: true, passing: 'commuter' },
  /* 19 Shibuya→Ebisu           */ { kind: 'viaduct' },
  /* 20 Ebisu→Meguro            */ { kind: 'trench', bridges: 1 },
  /* 21 Meguro→Gotanda          */ { kind: 'trench', bridges: 1, opensAtEnd: true },
  /* 22 Gotanda→Osaki           */ { kind: 'viaduct' },
  /* 23 Osaki→Shinagawa         */ { kind: 'corridor', depot: true, tracks: 3, passing: 'commuter' },
  /* 24 Shinagawa→Takanawa GW   */ { kind: 'corridor', tracks: 4, passing: 'commuter' },
  /* 25 Takanawa GW→Tamachi     */ { kind: 'corridor', tracks: 3, passing: 'commuter' },
  /* 26 Tamachi→Hamamatsucho    */ { kind: 'ground' },
  /* 27 Hamamatsucho→Shimbashi  */ { kind: 'viaduct' },
  /* 28 Shimbashi→Yurakucho     */ { kind: 'viaduct', bridges: 1 },
  /* 29 Yurakucho→Tokyo         */ { kind: 'viaduct' },
];

// Tronçon « ambiant » pour un store.index donné, valable dans TOUTES les
// phases : index désigne la gare d'arrivée en roulant (il avance au début de
// `depart`), donc l'environnement traversé est celui qui relie la gare
// précédente à celle-là - au sens de marche près.
//
// En 内回り on arrive à `i` en venant de `i−1` : c'est le tronçon `i−1`.
// En 外回り on arrive à `i` en venant de `i+1` : c'est le tronçon `i`, parcouru
// à contresens de son nom.
export const segmentAt = (stationIndex: number, dir: LoopDirection): number =>
  dir === 'outer' ? wrapStation(stationIndex) : wrapStation(stationIndex - 1);

/**
 * Distance réelle (km) de chaque tronçon, au barème kilométrique de JR East.
 *
 * C'EST LA DONNÉE, et l'horaire s'en déduit - pas l'inverse. Le jeu réglait
 * jusqu'ici des minutes ENTIÈRES relevées sur un horaire matinal type ; elles ne
 * suivaient pas la géographie, et l'écart se voyait à l'œil nu : Mejiro→
 * Takadanobaba (0,9 km) recevait UNE minute quand le vrai plus court tronçon de
 * la boucle - Nippori→Nishi-Nippori, 0,5 km - en recevait deux. Cette minute
 * unique ne laissait que 8 s de croisière, le plancher de `cruiseDuration`, et
 * c'est elle qui obligeait `approachAnnounceAt` à se protéger d'une annonce
 * d'approche partant avant celle de départ.
 *
 * Somme : 34,5 km, la longueur de la boucle. Moyenne : 1,15 km entre deux
 * gares. Les deux valeurs se vérifient dans le test.
 */
export const SEGMENT_KM: readonly number[] = [
  /* 00 Tokyo→Kanda             */ 1.3,
  /* 01 Kanda→Akihabara         */ 0.7,
  /* 02 Akihabara→Okachimachi   */ 1.0,
  /* 03 Okachimachi→Ueno        */ 0.6,
  /* 04 Ueno→Uguisudani         */ 1.1,
  /* 05 Uguisudani→Nippori      */ 1.1,
  /* 06 Nippori→Nishi-Nippori   */ 0.5,
  /* 07 Nishi-Nippori→Tabata    */ 0.8,
  /* 08 Tabata→Komagome         */ 1.6,
  /* 09 Komagome→Sugamo         */ 0.7,
  /* 10 Sugamo→Otsuka           */ 1.1,
  /* 11 Otsuka→Ikebukuro        */ 1.8,
  /* 12 Ikebukuro→Mejiro        */ 1.2,
  /* 13 Mejiro→Takadanobaba     */ 0.9,
  /* 14 Takadanobaba→Shin-Okubo */ 1.4,
  /* 15 Shin-Okubo→Shinjuku     */ 1.3,
  /* 16 Shinjuku→Yoyogi         */ 0.7,
  /* 17 Yoyogi→Harajuku         */ 1.5,
  /* 18 Harajuku→Shibuya        */ 1.2,
  /* 19 Shibuya→Ebisu           */ 1.6,
  /* 20 Ebisu→Meguro            */ 1.5,
  /* 21 Meguro→Gotanda          */ 1.2,
  /* 22 Gotanda→Osaki           */ 0.9,
  /* 23 Osaki→Shinagawa         */ 2.0,
  /* 24 Shinagawa→Takanawa GW   */ 0.9,
  /* 25 Takanawa Gateway→Tamachi*/ 1.3,
  /* 26 Tamachi→Hamamatsucho    */ 1.5,
  /* 27 Hamamatsucho→Shimbashi  */ 1.2,
  /* 28 Shimbashi→Yurakucho     */ 1.1,
  /* 29 Yurakucho→Tokyo         */ 0.8,
];

/** Longueur de la boucle (km). */
export const LOOP_KM = 34.5;

/**
 * Durée d'un tour standard (min) : 64 en journée, dans les DEUX sens. C'est le
 * chiffre de JR East, hors stationnement aux gares de départ et de terminus.
 * Aux pointes du matin et du soir la boucle approche les 70 min ; le jeu tient
 * l'horaire de journée, celui qui vaut le plus longtemps.
 */
export const LOOP_MINUTES = 64;

/**
 * Forfait d'arrêt : ce qu'un arrêt coûte à l'horaire hors croisière.
 * Départ + freinage + le forfait de stationnement de CONFIG - qui n'est pas la
 * durée d'arrêt réelle, plus longue, mais la part qu'on en retire de
 * l'intervalle (voir la note de config.ts).
 */
const STOP_FIXED_S = CONFIG.departTime + CONFIG.brakeTime + CONFIG.dwellTime;

/**
 * Temps de croisière disponible sur un tour entier (s), une fois les trente
 * arrêts payés. C'est lui qu'on répartit AU PRORATA DES DISTANCES.
 */
const LOOP_CRUISE_S = LOOP_MINUTES * 60 - STATION_COUNT * STOP_FIXED_S;

/**
 * Intervalle arrivée→arrivée (s) par tronçon 内回り.
 *
 * Une seule règle, et elle tient en une ligne : le forfait d'arrêt, plus la
 * part de croisière que vaut la longueur du tronçon. Un tour fait donc 64 min
 * par construction, et le tronçon le plus court de la boucle est celui qui est
 * réellement le plus court.
 */
export const SEGMENT_HEADWAY_SEC: readonly number[] = SEGMENT_KM.map(
  (km) => STOP_FIXED_S + (LOOP_CRUISE_S * km) / LOOP_KM,
);

/**
 * Le même intervalle en minutes entières, pour ce qui s'AFFICHE en minutes :
 * les cercles de l'écran de ligne, l'heure de départ d'Ōsaki d'un numéro de
 * course. Arrondi à l'affichage seulement - l'horaire, lui, reste en secondes.
 */
export const SEGMENT_HEADWAY_MIN: readonly number[] = SEGMENT_HEADWAY_SEC.map((s) =>
  Math.round(s / 60),
);

/** Index du tronçon parcouru pour arriver à `stationIndex` dans le sens `dir`. */
export function segmentForArrival(stationIndex: number, dir: LoopDirection): number {
  return segmentAt(stationIndex, dir);
}

/** Index du tronçon du k-ième saut depuis `fromIndex` dans le sens `dir`. */
export function segmentForHop(fromIndex: number, dir: LoopDirection): number {
  return segmentForArrival(nextStation(fromIndex, dir), dir);
}

/** Somme des intervalles (s) sur `hops` tronçons consécutifs. */
export function headwaySecondsTo(fromIndex: number, hops: number, dir: LoopDirection): number {
  let total = 0;
  let idx = fromIndex;
  for (let k = 0; k < hops; k++) {
    total += SEGMENT_HEADWAY_SEC[segmentForHop(idx, dir)];
    idx = stationAtHop(idx, 1, dir);
  }
  return total;
}

/**
 * La même somme en minutes entières.
 *
 * On somme les SECONDES puis on arrondit une fois, plutôt que d'additionner
 * trente arrondis : sur un tour complet, cumuler les arrondis dériverait de
 * plusieurs minutes et l'écran de ligne annoncerait une gare lointaine à la
 * mauvaise minute.
 */
export function headwayMinutesTo(fromIndex: number, hops: number, dir: LoopDirection): number {
  return Math.round(headwaySecondsTo(fromIndex, hops, dir) / 60);
}

/**
 * Durée de croisière (s) : l'intervalle du tronçon moins le forfait d'arrêt.
 *
 * Depuis que l'intervalle se DÉDUIT de la distance, cette soustraction retombe
 * exactement sur la part de croisière du tronçon - la longueur, et rien
 * d'autre. Elle va de 29 s (Nippori→Nishi-Nippori, 0,5 km) à 117 s
 * (Ōsaki→Shinagawa, 2,0 km).
 *
 * Le plancher de 8 s reste, mais il ne sert plus : il protégeait une minute
 * d'intervalle inscrite à la main sur un tronçon de 0,9 km, et c'est ce plancher
 * qui obligeait `approachAnnounceAt` à borner l'annonce d'approche. On le garde
 * comme garde-fou de toute distance qu'on raccourcirait par erreur.
 *
 * L'arrêt réel étant plus long que le forfait (voir config.ts), le cycle complet
 * dépasse un peu l'intervalle - c'est voulu : la croisière garde de quoi
 * dérouler les deux annonces.
 */
export function cruiseDuration(stationIndex: number, dir: LoopDirection): number {
  const headwaySec = SEGMENT_HEADWAY_SEC[segmentForArrival(stationIndex, dir)];
  const fixed = CONFIG.departTime + CONFIG.brakeTime + CONFIG.dwellTime;
  return Math.max(8, headwaySec - fixed);
}

/**
 * Départ de l'annonce d'approche avant la fin de la croisière (s).
 *
 * Aux gares à grosses correspondances (Ueno, Tokyo, Shinjuku…), まもなく +
 * 乗換案内 ja/en cumulent ~40 s : lancée au freinage (22 s), la séquence
 * déborderait loin après l'ouverture des portes. Comme en vrai, elle démarre en
 * pleine course et se termine autour de l'arrêt.
 */
export const APPROACH_ANNOUNCE_LEAD = 20.0;

/**
 * Instant de l'annonce de départ dans la croisière (s) : 「次は、渋谷」 part dès
 * que la rame est lancée.
 */
export const DEPART_ANNOUNCE_AT = 0.6;

/**
 * Instant de l'annonce d'approche, qui ne passe JAMAIS devant celle de départ.
 *
 * Vit ici, avec `cruiseDuration` dont elle se déduit, et non dans le cycle
 * station : c'est de l'arithmétique d'horaire, et elle se teste comme telle
 * (tests/announceOrder.test.ts).
 *
 * ELLE NE MORD PLUS SUR AUCUN TRONÇON, et c'est le but. Tant que les
 * intervalles étaient des minutes entières posées à la main, Mejiro ↔
 * Takadanobaba n'en comptait qu'une : forfait d'arrêt retiré, il ne restait que
 * 8 s de croisière - le plancher de `cruiseDuration` - contre 59 ou 119 s
 * partout ailleurs. `cruiseSec − 20` y valait −12, donc la condition était vraie
 * dès la PREMIÈRE image de la croisière : la file de la rame recevait
 * 「まもなく高田馬場」 avant 「次は、高田馬場」 pour les jouer dans cet ordre -
 * l'approche annoncée avant le départ, dans les deux sens.
 *
 * Depuis que l'horaire se déduit des distances, la croisière la plus courte de
 * la boucle vaut 29 s et l'avance de 20 s tient partout. La borne reste : c'est
 * elle qui rattraperait un tronçon qu'on raccourcirait, ou une avance qu'on
 * allongerait.
 */
export function approachAnnounceAt(cruiseSec: number): number {
  return Math.max(DEPART_ANNOUNCE_AT + 0.2, cruiseSec - APPROACH_ANNOUNCE_LEAD);
}

/** Trajet inter-gares sans dwell : depart + cruise + brake (s). */
export function journeyDuration(stationIndex: number, dir: LoopDirection): number {
  return CONFIG.departTime + cruiseDuration(stationIndex, dir) + CONFIG.brakeTime;
}

/** Temps écoulé au début de chaque phase pour le tronçon vers `stationIndex`. */
export function phaseBase(phase: Phase, stationIndex: number, dir: LoopDirection): number {
  const cruise = cruiseDuration(stationIndex, dir);
  switch (phase) {
    case 'depart':
      return 0;
    case 'cruise':
      return CONFIG.departTime;
    case 'brake':
      return CONFIG.departTime + cruise;
    default:
      return journeyDuration(stationIndex, dir);
  }
}

/** Progression 0..1 du trajet inter-gares (dwell maintient p = 1). */
export function journeyProgress(
  phase: Phase,
  phaseT: number,
  stationIndex: number,
  dir: LoopDirection,
): number {
  const journey = journeyDuration(stationIndex, dir);
  return Math.min(1, Math.max(0, (phaseBase(phase, stationIndex, dir) + phaseT) / journey));
}

// Gares à grande toiture : la verrière masque progressivement le ciel à
// l'approche et au départ.
//
// Ce sont exactement les six gares repères de la boucle (data/stations,
// `LOOP_HUB_JY`), et cette liste en est dérivée. Elle était écrite en dur, avec
// un commentaire qui la disait « superset des MAJOR_HUBS d'announcements.ts -
// ne pas fusionner les deux » : c'était vrai du temps où Takanawa Gateway en
// faisait partie, et faux depuis son retrait. Trois copies du même ensemble,
// dont une accompagnée d'une consigne de ne pas les réunir.
//
// Takanawa Gateway N'Y EST PLUS, et c'est le seul écart voulu. Cette toiture-là
// est une dalle claire posée à six mètres soixante-dix en travers de la voie ;
// tant que le quai n'avait qu'un auvent plat, elle passait pour la verrière
// blanche de la gare. Depuis que la charpente signature FAIT la couverture
// (data/stationLayouts, `sigCanopy`), elle s'interposait entre l'œil et le toit
// plié - elle masquait exactement ce qu'elle était censée évoquer. Le quai
// apporte désormais sa propre toiture, et elle arrive avec lui pendant le
// freinage. Takanawa Gateway n'étant pas une gare repère, la dérivation
// l'exclut d'elle-même.
export const ROOF_HUBS: Record<number, 'steel'> = Object.fromEntries(
  LOOP_HUB_INDICES.map((i) => [i, 'steel' as const]),
);
