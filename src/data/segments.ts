// Environnement réel de chaque tronçon inter-gares, vu depuis le train : la
// Yamanote circule presque toujours à l'air libre (aucun tunnel sur la boucle
// voyageurs) mais alterne viaducs urbains, larges corridors ferroviaires,
// tranchées ouvertes et sections au niveau du sol.
//
// Segment i = trajet STATIONS[i] ↔ STATIONS[(i+1)%30]. Il est NOMMÉ dans le
// sens 内回り (ordre JY croissant), mais il n'appartient à aucun des deux sens :
// c'est le même viaduc, la même tranchée, le même dépôt — parcourus à l'endroit
// ou à l'envers. Seule la façon d'y arriver dépend du sens, d'où le paramètre
// `dir` des fonctions ci-dessous.

import { CONFIG } from './config.ts';
import { nextStation, stationAtHop, wrapStation } from './loop.ts';
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
  /* 11 Otsuka→Ikebukuro        */ { kind: 'ground' },
  /* 12 Ikebukuro→Mejiro        */ { kind: 'trench', bridges: 1, wallHeight: 4 },
  /* 13 Mejiro→Takadanobaba     */ { kind: 'ground', greenery: true },
  /* 14 Takadanobaba→Shin-Okubo */ { kind: 'ground' },
  /* 15 Shin-Okubo→Shinjuku     */ { kind: 'corridor', tracks: 3, passing: 'commuter' },
  /* 16 Shinjuku→Yoyogi         */ { kind: 'corridor', covered: true },
  /* 17 Yoyogi→Harajuku         */ { kind: 'ground', greenery: true },
  /* 18 Harajuku→Shibuya        */ { kind: 'ground', greenery: true },
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
// précédente à celle-là — au sens de marche près.
//
// En 内回り on arrive à `i` en venant de `i−1` : c'est le tronçon `i−1`.
// En 外回り on arrive à `i` en venant de `i+1` : c'est le tronçon `i`, parcouru
// à contresens de son nom.
export const segmentAt = (stationIndex: number, dir: LoopDirection): number =>
  dir === 'outer' ? wrapStation(stationIndex) : wrapStation(stationIndex - 1);

/**
 * Intervalle arrivée→arrivée (min) par tronçon 内回り, dérivé d'un horaire
 * matinal type (Osaki 07:42 → … → Tokyo 08:33). Akihabara corrigé à 08:28.
 * Boucle ≈ 67 min (8×3 + 1×1 + 21×2).
 */
export const SEGMENT_HEADWAY_MIN: readonly number[] = [
  /* 00 Tokyo→Kanda             */ 3,
  /* 01 Kanda→Akihabara         */ 2,
  /* 02 Akihabara→Okachimachi   */ 2,
  /* 03 Okachimachi→Ueno        */ 2,
  /* 04 Ueno→Uguisudani         */ 2,
  /* 05 Uguisudani→Nippori      */ 2,
  /* 06 Nippori→Nishi-Nippori   */ 2,
  /* 07 Nishi-Nippori→Tabata    */ 2,
  /* 08 Tabata→Komagome         */ 2,
  /* 09 Komagome→Sugamo         */ 2,
  /* 10 Sugamo→Otsuka           */ 2,
  /* 11 Otsuka→Ikebukuro        */ 3,
  /* 12 Ikebukuro→Mejiro        */ 3,
  /* 13 Mejiro→Takadanobaba     */ 1,
  /* 14 Takadanobaba→Shin-Okubo */ 3,
  /* 15 Shin-Okubo→Shinjuku     */ 2,
  /* 16 Shinjuku→Yoyogi         */ 2,
  /* 17 Yoyogi→Harajuku         */ 3,
  /* 18 Harajuku→Shibuya        */ 2,
  /* 19 Shibuya→Ebisu           */ 3,
  /* 20 Ebisu→Meguro            */ 2,
  /* 21 Meguro→Gotanda          */ 2,
  /* 22 Gotanda→Osaki           */ 2,
  /* 23 Osaki→Shinagawa         */ 3,
  /* 24 Shinagawa→Takanawa GW   */ 2,
  /* 25 Takanawa Gateway→Tamachi*/ 2,
  /* 26 Tamachi→Hamamatsucho    */ 3,
  /* 27 Hamamatsucho→Shimbashi  */ 2,
  /* 28 Shimbashi→Yurakucho     */ 2,
  /* 29 Yurakucho→Tokyo         */ 2,
];

/** Index du tronçon parcouru pour arriver à `stationIndex` dans le sens `dir`. */
export function segmentForArrival(stationIndex: number, dir: LoopDirection): number {
  return segmentAt(stationIndex, dir);
}

/** Index du tronçon du k-ième saut depuis `fromIndex` dans le sens `dir`. */
export function segmentForHop(fromIndex: number, dir: LoopDirection): number {
  return segmentForArrival(nextStation(fromIndex, dir), dir);
}

/** Somme des intervalles (min) sur `hops` tronçons consécutifs. */
export function headwayMinutesTo(fromIndex: number, hops: number, dir: LoopDirection): number {
  let total = 0;
  let idx = fromIndex;
  for (let k = 0; k < hops; k++) {
    total += SEGMENT_HEADWAY_MIN[segmentForHop(idx, dir)];
    idx = stationAtHop(idx, 1, dir);
  }
  return total;
}

/**
 * Durée de croisière (s) : l'intervalle du tronçon moins depart/brake et le
 * forfait d'arrêt CONFIG.dwellTime. L'arrêt réel étant plus long que ce
 * forfait (voir config.ts), le cycle complet dépasse un peu l'intervalle —
 * c'est voulu : la croisière garde de quoi dérouler les deux annonces.
 */
export function cruiseDuration(stationIndex: number, dir: LoopDirection): number {
  const headwaySec = SEGMENT_HEADWAY_MIN[segmentForArrival(stationIndex, dir)] * 60;
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
 * Le tronçon Mejiro ↔ Takadanobaba ne compte qu'une minute d'intervalle : une
 * fois le forfait d'arrêt retiré il ne reste que 8 s de croisière — le plancher
 * de `cruiseDuration` —, contre 59 ou 119 s partout ailleurs. `cruiseSec − 20`
 * y valait −12 : la condition était donc déjà vraie à la PREMIÈRE image de la
 * croisière, et la file de la rame recevait 「まもなく高田馬場」 avant
 * 「次は、高田馬場」 pour les jouer dans cet ordre — l'approche annoncée avant le
 * départ, dans les deux sens. La borne remet la séquence d'aplomb sans toucher à
 * l'horaire, et protège d'avance tout tronçon qu'on raccourcirait.
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
// un commentaire qui la disait « superset des MAJOR_HUBS d'announcements.ts —
// ne pas fusionner les deux » : c'était vrai du temps où Takanawa Gateway en
// faisait partie, et faux depuis son retrait. Trois copies du même ensemble,
// dont une accompagnée d'une consigne de ne pas les réunir.
//
// Takanawa Gateway N'Y EST PLUS, et c'est le seul écart voulu. Cette toiture-là
// est une dalle claire posée à six mètres soixante-dix en travers de la voie ;
// tant que le quai n'avait qu'un auvent plat, elle passait pour la verrière
// blanche de la gare. Depuis que la charpente signature FAIT la couverture
// (data/stationLayouts, `sigCanopy`), elle s'interposait entre l'œil et le toit
// plié — elle masquait exactement ce qu'elle était censée évoquer. Le quai
// apporte désormais sa propre toiture, et elle arrive avec lui pendant le
// freinage. Takanawa Gateway n'étant pas une gare repère, la dérivation
// l'exclut d'elle-même.
export const ROOF_HUBS: Record<number, 'steel'> = Object.fromEntries(
  LOOP_HUB_INDICES.map((i) => [i, 'steel' as const]),
);
