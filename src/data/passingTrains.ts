// Les trains qui NE S'ARRÊTENT PAS.
//
// Sur douze gares de la boucle, la Yamanote partage son îlot avec une autre
// ligne (`sharedWith` dans data/stationLayouts) : la voie qu'on a dans le dos
// n'est pas la nôtre, et ce qui y roule ne nous doit rien. C'est là — et
// nulle part ailleurs — qu'une rame peut traverser la gare à pleine vitesse
// sans même ralentir, l'événement le plus spectaculaire d'un quai japonais.
//
// Sur un îlot Yamanote pur, la voie d'en face est la Yamanote en sens
// inverse : tout ce qui y passe s'y arrête, et rien ne traverse jamais.
//
// Deux régimes, et ils n'ont pas la même heure :
//
//   • 快速 — le rapide de la Keihin-Tōhoku, de 10 h 30 à 15 h 30 entre Tabata
//     et Shinagawa. Il saute cinq des gares que la Yamanote dessert quai à
//     quai : 御徒町 (en semaine seulement — le samedi, le dimanche et les
//     jours fériés il s'y arrête), 鶯谷, 日暮里, 西日暮里 et 有楽町. C'est le
//     passage qu'on voit vraiment, plusieurs fois par heure, à quelques
//     mètres du bord de quai.
//   • 回送 — une rame vide qui rejoint son dépôt ou en sort. Ça n'a pas
//     d'horaire, ça ne s'annonce pas autrement, et ça peut traverser onze de
//     ces gares à n'importe quelle heure. Rare.
//
// Le numéro de voie annoncé n'est PAS le nôtre : c'est celui d'en face, relevé
// gare par gare (voir FACING_TRACK).

import { type LoopDirection } from './platforms.ts';
import { layoutFor } from './stationLayouts.ts';
import { STATIONS } from './stations.ts';

/** Ce qui traverse, et à quel titre. */
export type PassKind = 'rapid' | 'deadhead';

/**
 * Gares que le 快速 de la Keihin-Tōhoku traverse sans s'arrêter, ET dont la
 * voie rapide borde le quai Yamanote.
 *
 * Le rapide s'arrête, entre Tabata et Shinagawa, à 田端, 上野, 秋葉原, 神田,
 * 東京, 浜松町, 田町, 高輪ゲートウェイ et 品川 — plus 御徒町 le samedi, le
 * dimanche et les jours fériés. Tout le reste, il le traverse.
 *
 * Deux de ces gares traversées n'apparaissent pas ici :
 *   • 新橋, que le rapide saute pourtant (la ligne Tōkaidō y dessert déjà le
 *     même flux) : le gabarit du jeu en fait un îlot Yamanote pur, sans voie
 *     Keihin-Tōhoku au bord du quai — voir data/stationLayouts ;
 *   • 神田, où la Keihin-Tōhoku occupe un autre îlot : de notre quai, on ne la
 *     voit même pas.
 */
const RAPID_PASS: Record<string, true> = {
  JY04: true, // 御徒町 — en semaine seulement
  JY06: true, // 鶯谷
  JY07: true, // 日暮里 — le rapide le saute, les Jōban y sont déjà
  JY08: true, // 西日暮里
  JY30: true, // 有楽町
};

/** 御徒町 : le rapide s'y arrête le samedi, le dimanche et les jours fériés. */
const WEEKDAYS_ONLY: Record<string, true> = { JY04: true };

/** Plage de circulation du 快速 (minutes depuis minuit) : 10 h 30 → 15 h 30. */
const RAPID_FROM = 10 * 60 + 30;
const RAPID_TO = 15 * 60 + 30;

/**
 * Chance qu'une rame traverse, PAR TRANCHE DE DEUX MINUTES passées en gare —
 * l'appelant met sa propre durée à l'échelle.
 *
 * Le rapide n'est pas un train sur deux : dans la plage où il circule, TOUS les
 * trains de la Keihin-Tōhoku sont des 快速 entre Tabata et Tamachi. À une gare
 * qu'ils sautent, il en passe donc un toutes les quatre à cinq minutes dans le
 * sens qui borde notre quai.
 *
 * Le 回送, lui, a ses heures : les mouvements de dépôt se font avant le premier
 * train et après le dernier. En pleine journée, c'est l'exception qu'on raconte
 * le soir ; à 23 h, c'est presque une habitude.
 */
const RAPID_CHANCE = 0.5;
const DEADHEAD_CHANCE = 0.03;
const DEADHEAD_NIGHT_CHANCE = 0.12;

/** Bornes de la nuit ferroviaire : après le dernier train, avant le premier. */
const NIGHT_FROM = 22 * 60;
const NIGHT_TO = 7 * 60;

/**
 * Ce qui peut traverser la voie d'en face à cette gare, à cette heure-là.
 * `null` quand la voie d'en face est la Yamanote elle-même : il n'y passe que
 * des trains qui s'arrêtent.
 */
export function passKindAt(index: number, clockMin: number, weekday: number): PassKind | null {
  if (!layoutFor(index).sharedWith) return null;
  const jy = STATIONS[index]?.jy;
  // Sans numéro de voie relevé, la gare ne saurait pas quoi annoncer.
  if (!jy || !FACING_TRACK[jy]) return null;
  const weekend = weekday === 0 || weekday === 6;
  const rapidHour = clockMin >= RAPID_FROM && clockMin < RAPID_TO;
  if (RAPID_PASS[jy] && rapidHour && !(weekend && WEEKDAYS_ONLY[jy])) return 'rapid';
  return 'deadhead';
}

/** Probabilité qu'un créneau de deux minutes soit effectivement traversé. */
export function passChance(kind: PassKind, clockMin: number): number {
  if (kind === 'rapid') return RAPID_CHANCE;
  const night = clockMin >= NIGHT_FROM || clockMin < NIGHT_TO;
  return night ? DEADHEAD_NIGHT_CHANCE : DEADHEAD_CHANCE;
}

/**
 * Numéro de la voie d'EN FACE, gare par gare et par sens — celui que la gare
 * annonce, et qui n'est jamais le nôtre.
 *
 * Relevé, pas déduit. Sur un îlot japonais les deux voies vont dans le même
 * sens, et la voie d'en face porte le numéro voisin du nôtre — mais tantôt
 * au-dessus, tantôt en dessous : à Ueno 内回り est la voie 2 et la
 * Keihin-Tōhoku 北行 la 1, à Okachimachi la numérotation est inversée
 * (内回り 3, Keihin-Tōhoku 北行 4). Le déduire du numéro Yamanote
 * (data/platforms) marchait pour onze gares et inventait une « voie 0 » aux
 * deux autres : il vaut mieux une table qu'on peut relire en face du plan.
 *
 * Les gares absentes de cette table ne voient rien traverser, quand bien même
 * elles partagent leur îlot : Yoyogi, où la Chūō–Sōbu s'arrête de toute façon,
 * et Shinagawa, dont le plan de voies (quinze quais) ne se résume pas à
 * l'îlot 1-2-3-4 des autres.
 */
const FACING_TRACK: Record<string, { inner: number; outer: number }> = {
  JY01: { inner: 3, outer: 6 }, // 東京 — îlots 3・4 et 5・6
  JY03: { inner: 1, outer: 4 }, // 秋葉原
  JY04: { inner: 4, outer: 1 }, // 御徒町 — numérotation inversée
  JY05: { inner: 1, outer: 4 }, // 上野
  JY06: { inner: 1, outer: 4 }, // 鶯谷
  JY07: { inner: 12, outer: 9 }, // 日暮里 — voies 9 à 12
  JY08: { inner: 4, outer: 1 }, // 西日暮里 — comme 御徒町
  JY09: { inner: 1, outer: 4 }, // 田端
  JY27: { inner: 1, outer: 4 }, // 田町
  JY28: { inner: 1, outer: 4 }, // 浜松町
  JY30: { inner: 1, outer: 4 }, // 有楽町
};

export function facingTrackNumber(index: number, direction: LoopDirection): number | null {
  const jy = STATIONS[index]?.jy;
  const facing = jy ? FACING_TRACK[jy] : undefined;
  if (!facing) return null;
  return facing[direction];
}

/** Gares où un train peut traverser, tous régimes confondus (export, tests). */
export function passThroughStations(): number[] {
  const out: number[] = [];
  for (let i = 0; i < STATIONS.length; i++) {
    if (layoutFor(i).sharedWith && FACING_TRACK[STATIONS[i].jy]) out.push(i);
  }
  return out;
}
