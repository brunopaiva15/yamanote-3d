// L'arithmétique de la boucle, orientée.
//
// La Yamanote n'a pas de terminus : elle a DEUX SENS, et c'est tout ce qui les
// distingue. 内回り (inner) parcourt STATIONS dans l'ordre des codes JY
// (東京 → 神田 → 上野 → 池袋 → 新宿 → 渋谷 → 品川 → 東京) ; 外回り (outer) fait
// exactement le même tour à l'envers (東京 → 有楽町 → 新橋 → 品川 → 渋谷 → …).
//
// Le simulateur ne roulait qu'en 内回り, et l'hypothèse était partout : « la
// gare suivante, c'est index + 1 ». Ce module la remplace par une seule
// question — dans quel sens roule-t-on ? — pour que les trente autres modules
// n'aient plus à la reposer chacun à leur façon.
//
// Ce qui NE dépend PAS du sens, et qu'on ne trouvera donc pas ici :
//
//   • le côté d'ouverture des portes (data/stations, DOOR_SIDE). Un plan de
//     voies à deux tracks est symétrique par rotation d'un demi-tour autour de
//     l'axe de la ligne : sur un îlot central les deux sens ouvrent à droite,
//     sur deux quais latéraux les deux sens ouvrent à gauche, et sur les
//     doubles îlots 方向別 (上野, 東京, 田町…) chaque sens a le sien, du même
//     côté. Le côté est donc une propriété de la GARE, pas du sens ;
//   • le tronçon lui-même (data/segments) : on parcourt le même viaduc, la même
//     tranchée, seulement à l'envers. Seule change la façon d'y arriver.

import type { LoopDirection } from './platforms.ts';

/** Nombre de gares de la boucle. */
export const STATION_COUNT = 30;

/** Ramène un index quelconque dans 0…29 (modulo positif). */
export function wrapStation(index: number): number {
  return ((index % STATION_COUNT) + STATION_COUNT) % STATION_COUNT;
}

/** +1 en 内回り, −1 en 外回り : le pas d'index qui définit le sens. */
export function directionStep(dir: LoopDirection): 1 | -1 {
  return dir === 'outer' ? -1 : 1;
}

/** L'autre sens. */
export function oppositeDirection(dir: LoopDirection): LoopDirection {
  return dir === 'outer' ? 'inner' : 'outer';
}

/** Gare suivante dans ce sens. */
export function nextStation(index: number, dir: LoopDirection): number {
  return wrapStation(index + directionStep(dir));
}

/** Gare précédente dans ce sens (celle qu'on vient de quitter). */
export function prevStation(index: number, dir: LoopDirection): number {
  return wrapStation(index - directionStep(dir));
}

/** Gare atteinte après `hops` arrêts depuis `from`, dans ce sens. */
export function stationAtHop(from: number, hops: number, dir: LoopDirection): number {
  return wrapStation(from + hops * directionStep(dir));
}

/**
 * Nombre d'arrêts pour aller de `from` à `to` dans ce sens (0…29).
 * Jamais négatif : sur une boucle, on finit toujours par arriver.
 */
export function hopsBetween(from: number, to: number, dir: LoopDirection): number {
  const raw = (to - from) * directionStep(dir);
  return wrapStation(raw);
}

/**
 * Nom du sens tel qu'il est ÉCRIT et DIT — sur les bandeaux de quai, dans les
 * annonces, sur le 発車標. C'est de la signalétique : elle reste en japonais,
 * comme les 内回り／外回り du menu (voir src/i18n).
 */
export const LOOP_LABEL_JP: Record<LoopDirection, string> = {
  inner: '内回り',
  outer: '外回り',
};

/** Le même, en romaji, pour les libellés d'interface latine. */
export const LOOP_LABEL_ROMAJI: Record<LoopDirection, string> = {
  inner: 'Uchi-mawari',
  outer: 'Soto-mawari',
};

/** 「山手線内回り」 / 「山手線外回り」 : la ligne ET son sens, d'un bloc. */
export function loopNameJp(dir: LoopDirection): string {
  return `山手線${LOOP_LABEL_JP[dir]}`;
}

/** Sens tiré au sort, pour les entrées « au hasard ». */
export function randomDirection(): LoopDirection {
  return Math.random() < 0.5 ? 'inner' : 'outer';
}

export type { LoopDirection };
