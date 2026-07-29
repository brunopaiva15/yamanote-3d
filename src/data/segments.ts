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

import { CONFIG } from './config';
import { nextStation, stationAtHop, wrapStation } from './loop';
import type { LoopDirection } from './platforms';
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
// l'approche et au départ. Superset des MAJOR_HUBS d'announcements.ts — ne pas
// fusionner les deux.
//
// Takanawa Gateway N'Y EST PLUS. Cette toiture-là est une dalle claire posée à
// six mètres soixante-dix en travers de la voie ; tant que le quai n'avait
// qu'un auvent plat, elle passait pour la verrière blanche de la gare. Depuis
// que la charpente signature FAIT la couverture (data/stationLayouts,
// `sigCanopy`), elle s'interposait entre l'œil et le toit plié — elle masquait
// exactement ce qu'elle était censée évoquer. Le quai apporte désormais sa
// propre toiture, et elle arrive avec lui pendant le freinage.
export const ROOF_HUBS: Record<number, 'steel'> = {
  0: 'steel', // Tokyo
  4: 'steel', // Ueno
  12: 'steel', // Ikebukuro
  16: 'steel', // Shinjuku
  19: 'steel', // Shibuya
  24: 'steel', // Shinagawa
};
