// L'eau au bord de la voie : les canaux du corridor, et la baie.
//
// Le décor n'en avait aucune, sauf trois traversées de rivière écrites à la
// main. Or l'eau est le second fait géographique de la ligne après le relief :
// la Yamanote longe la baie de Tokyo sur près de quatre kilomètres entre
// Shinagawa et Shimbashi - le trait de côte s'y approche à quatre cent
// vingt-cinq mètres de la voie -, et elle traverse un chapelet de canaux de
// remblai, ceux de Kōnan et de Shibaura, que la bible cite aux KM 31 à 34.
//
// Les données viennent d'OpenStreetMap (src/data/water.ts, engendré par
// scripts/geo/fetch-water.mjs) et se lisent en deux champs :
//
//   · LE CHAMP DU CORRIDOR, quatre cents mètres de part et d'autre de l'axe,
//     à la maille de quarante mètres. Chaque maille porte la FRACTION de sa
//     surface qui est mouillée, ce qui vaut mieux qu'un oui-non : un canal de
//     vingt mètres n'inonde pas quarante mètres de rive.
//   · LA DISTANCE AU TRAIT DE CÔTE, une valeur par rangée et par côté. Zéro
//     veut dire « pas de mer à trois kilomètres », et c'est le cas partout sauf
//     sur l'arc sud-est.
//
// Comme le relief, tout se lit en abscisse de BOUCLE et en décalage latéral
// compté à gauche du sens des index JY croissants ; systems/terrain fait la
// conversion depuis l'odomètre et les coordonnées du ruban.

import {
  SHORE_REACH,
  WATER_COLS,
  WATER_REACH,
  WATER_ROWS,
  WATER_S_STEP,
  WATER_X_STEP,
  shoreField,
  waterField,
} from '../data/water.ts';
import { loopLeft, loopOffset, loopSOfWorld } from './terrain.ts';

/** Colonne de l'axe de la voie dans le champ. */
const AXIS = (WATER_COLS - 1) / 2;

/**
 * Couverture en eau (0..1) à l'abscisse de boucle `s`, à `offset` mètres à
 * gauche du sens des index croissants.
 *
 * Bilinéaire, comme le relief : une rive nette au sous-échantillonnage donne
 * une rive nette à l'écran, et l'interpolation ne fait qu'adoucir la maille.
 * Hors de la portée du champ, c'est sec - au-delà de quatre cents mètres, le
 * corridor n'est plus relevé et c'est la baie qui prend le relais.
 */
export function waterAt(s: number, offset: number): number {
  if (Math.abs(offset) > WATER_REACH) return 0;
  const field = waterField();
  const r = (((s / WATER_S_STEP) % WATER_ROWS) + WATER_ROWS) % WATER_ROWS;
  const r0 = Math.floor(r);
  const fr = r - r0;
  const r1 = (r0 + 1) % WATER_ROWS;

  const c = AXIS + offset / WATER_X_STEP;
  const c0 = Math.max(0, Math.min(WATER_COLS - 1, Math.floor(c)));
  const c1 = Math.min(WATER_COLS - 1, c0 + 1);
  const fc = Math.max(0, Math.min(1, c - c0));

  const a = field[r0 * WATER_COLS + c0] + (field[r0 * WATER_COLS + c1] - field[r0 * WATER_COLS + c0]) * fc;
  const b = field[r1 * WATER_COLS + c0] + (field[r1 * WATER_COLS + c1] - field[r1 * WATER_COLS + c0]) * fc;
  return (a + (b - a) * fr) / 255;
}

/**
 * Distance au trait de côte (m) à l'abscisse de boucle `s`, du côté `left` de
 * la polyligne. Zéro = pas de mer en vue.
 *
 * PAS d'interpolation ici, et c'est délibéré : deux rangées voisines peuvent
 * porter l'une une côte à six cents mètres et l'autre rien du tout, quand la
 * baie sort de la portée du relevé. Interpoler entre les deux ferait glisser
 * le rivage vers la voie sur quarante mètres, au lieu de le faire finir.
 */
export function shoreAt(s: number, left: boolean): number {
  const field = shoreField();
  const r = Math.round(((s / WATER_S_STEP) % WATER_ROWS) + WATER_ROWS) % WATER_ROWS;
  return field[r * 2 + (left ? 0 : 1)];
}

/**
 * Couverture en eau aux coordonnées du ruban urbain : `worldS` l'abscisse
 * monde, `x` la distance à l'axe (positive), `side` le côté de la scène.
 */
export function waterOn(worldS: number, x: number, side: 1 | -1): number {
  if (!enabled) return 0;
  return waterAt(loopSOfWorld(worldS), loopOffset(x, side));
}

/**
 * Distance au trait de côte (m) depuis le ruban, du côté `side` de la scène.
 * Zéro quand la mer est hors de portée du relevé.
 */
export function shoreOn(worldS: number, side: 1 | -1): number {
  if (!enabled) return 0;
  return shoreAt(loopSOfWorld(worldS), loopLeft(side));
}

/**
 * Au-delà de quelle couverture une maille est-elle « de l'eau » ?
 *
 * Un tiers, et pas la moitié : la maille fait quarante mètres et les canaux de
 * Shibaura en font vingt-cinq. À un demi, ils disparaissaient tous - le décor
 * reconstruisait des immeubles sur le 高浜運河.
 */
export const WET = 0.34;

/** Portée du relevé de littoral (m) : au-delà, on ne sait pas, donc rien. */
export const WATER_SHORE_REACH = SHORE_REACH;

/** Demi-largeur du champ du corridor (m). */
export const WATER_LATERAL_REACH = WATER_REACH;

let enabled = true;

/** Couper l'eau, pour isoler une régression - même trappe que le relief. */
export function setWaterEnabled(on: boolean): void {
  enabled = on;
}

export function waterEnabled(): boolean {
  return enabled;
}
