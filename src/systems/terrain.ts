// Le relief sous la ville.
//
// Jusqu'ici tout le décor reposait sur un plan horizontal : Shibuya au fond de
// sa cuvette et Nishi-Nippori au pied de sa falaise avaient exactement le même
// sol. Or c'est le fait géographique le plus fort de la ligne. La Yamanote court
// à cheval sur deux terrains - le plateau de Musashino à l'ouest, une trentaine
// de mètres au-dessus de la mer, la plaine alluviale du Sumida à l'est, à trois
// ou quatre - et les trente-cinq mètres qui les séparent sont ce que le
// voyageur voit sans savoir le nommer : la ville qui monte devant lui en
// quittant Gotanda, le mur de verdure du parc d'Ueno, la descente vers le
// carrefour de Shibuya.
//
// Les altitudes viennent du modèle numérique de terrain du 国土地理院
// (src/data/terrainField.ts) et sont ORTHOMÉTRIQUES : elles portent le sol nu,
// ni les bâtiments ni le viaduc. C'est src/data/segments.ts qui dit de combien
// la voie court au-dessus ou en dessous.
//
// --- CE QUI EST VISIBLE, ET CE QUI NE L'EST PAS ---
//
// Depuis un siège, l'altitude ABSOLUE ne se voit pas : à Shinjuku comme à
// Yūrakuchō, le sol au droit de la voie est à hauteur de rail. Ce qui se voit
// est le relief RELATIF - de combien monte le terrain à deux cents mètres sur
// la gauche, de combien il descend trois cents mètres plus loin. Toutes les
// fonctions de ce module rendent donc une COTE PAR RAPPORT À LA VOIE, et zéro
// sous le train par construction.
//
// --- DEUX ABSCISSES, ET LA CONVERSION ENTRE ELLES ---
//
// Le jeu compte en `runtime.distance`, un odomètre qui ne fait qu'augmenter.
// Le terrain, lui, est indexé sur l'abscisse de la boucle, qui reboucle tous
// les 34,4 km et court toujours dans le sens des index JY croissants. Le pont
// entre les deux passe par les GARES : on sait à quelle abscisse de boucle se
// trouve chaque gare, et `cityAnchor` sait à quel odomètre on a quitté la
// dernière. Le terrain est donc calé sur les gares, exactement comme les
// quartiers - la cuvette de Shibuya tombe à Shibuya quoi qu'il arrive à
// l'odomètre.

import {
  TERRAIN_COLS,
  TERRAIN_PROFILE,
  TERRAIN_REACH,
  TERRAIN_ROWS,
  TERRAIN_S_STEP,
  TERRAIN_X_STEP,
  terrainField,
} from '../data/terrainField.ts';
import { LOOP_PERIMETER, STATION_S } from './tokyoBearing.ts';
import { wrapStation } from '../data/loop.ts';

/** Colonne de l'axe de la voie dans le champ. */
const AXIS = (TERRAIN_COLS - 1) / 2;

/** Longueur couverte par le champ (m) : un tour de boucle. */
const FIELD_LEN = TERRAIN_ROWS * TERRAIN_S_STEP;

/**
 * Altitude du sol nu (m) à l'abscisse de boucle `s`, à `offset` mètres à GAUCHE
 * du sens des index JY croissants.
 *
 * Bilinéaire entre les quatre mailles voisines. Hors de la portée du champ, on
 * retient la dernière colonne : au-delà de quatre cents mètres, la ville du
 * ruban n'existe plus et le fond est peint.
 */
export function groundAt(s: number, offset: number): number {
  const field = terrainField();
  const r = (((s / TERRAIN_S_STEP) % TERRAIN_ROWS) + TERRAIN_ROWS) % TERRAIN_ROWS;
  const r0 = Math.floor(r);
  const fr = r - r0;
  const r1 = (r0 + 1) % TERRAIN_ROWS;

  const c = AXIS + Math.max(-TERRAIN_REACH, Math.min(TERRAIN_REACH, offset)) / TERRAIN_X_STEP;
  const c0 = Math.max(0, Math.min(TERRAIN_COLS - 1, Math.floor(c)));
  const c1 = Math.min(TERRAIN_COLS - 1, c0 + 1);
  const fc = Math.max(0, Math.min(1, c - c0));

  const a = field[r0 * TERRAIN_COLS + c0] + (field[r0 * TERRAIN_COLS + c1] - field[r0 * TERRAIN_COLS + c0]) * fc;
  const b = field[r1 * TERRAIN_COLS + c0] + (field[r1 * TERRAIN_COLS + c1] - field[r1 * TERRAIN_COLS + c0]) * fc;
  return (a + (b - a) * fr) / 10;
}

/** Altitude de la voie (m) à l'abscisse de boucle `s`. */
export function trackAt(s: number): number {
  const r = (((s / TERRAIN_S_STEP) % TERRAIN_ROWS) + TERRAIN_ROWS) % TERRAIN_ROWS;
  const r0 = Math.floor(r);
  const r1 = (r0 + 1) % TERRAIN_ROWS;
  const fr = r - r0;
  return TERRAIN_PROFILE[r0] + (TERRAIN_PROFILE[r1] - TERRAIN_PROFILE[r0]) * fr;
}

// --- De l'odomètre à la boucle ---------------------------------------------

/**
 * Où l'on est sur la boucle, en fonction de l'odomètre.
 *
 * C'est une COPIE de `cityAnchor` (systems/cityField), recopiée une fois par
 * image plutôt qu'importée : le ruban urbain lit le terrain à chaque bâtiment,
 * et une dépendance croisée entre les deux modules serait fragile pour rien.
 */
const anchor = { s: 0, index: 0, span: 1150, step: 1 as 1 | -1 };

/**
 * Abscisse de boucle correspondant à une abscisse monde du ruban urbain.
 *
 * On lit la position en FRACTION D'INTER-GARE - c'est la coordonnée que
 * `cityAnchor` tient à jour et sur laquelle les quartiers sont déjà calés -
 * puis on la reporte sur la table des abscisses de gare. Le terrain tombe donc
 * toujours à sa gare, même quand l'odomètre du jeu et le kilométrage réel
 * s'écartent de quelques dizaines de mètres sur un inter-gare.
 */
export function loopSOfWorld(worldS: number): number {
  const t = (worldS - anchor.s) / anchor.span;
  const k = Math.floor(t);
  const frac = t - k;
  const from = wrapStation(anchor.index + k * anchor.step);
  const to = wrapStation(from + anchor.step);
  const a = STATION_S[from];
  let d = STATION_S[to] - a;
  // Une fois par tour, l'inter-gare franchit l'origine de la polyligne.
  if (anchor.step > 0 && d < 0) d += LOOP_PERIMETER;
  if (anchor.step < 0 && d > 0) d -= LOOP_PERIMETER;
  const s = a + d * frac;
  return ((s % LOOP_PERIMETER) + LOOP_PERIMETER) % LOOP_PERIMETER;
}

/**
 * Signe du décalage latéral : le côté +x de la scène est à DROITE du train, et
 * le champ compte ses colonnes à gauche du sens des index JY croissants. En
 * 外回り, le train remonte la polyligne : les deux se retournent.
 */
function lateralSign(): number {
  return -anchor.step;
}

/**
 * Décalage latéral dans le repère de la BOUCLE (gauche des index croissants
 * positive), à partir des coordonnées du ruban - `x` toujours positif, `side`
 * le côté de la scène.
 *
 * Tous les champs relevés le long de la voie - relief, eau, littoral - sont
 * rangés dans ce repère-là : c'est celui de la polyligne, qui ne dépend pas du
 * sens de marche. La conversion est ici parce que c'est ici qu'on sait dans
 * quel sens la rame parcourt la boucle.
 */
export function loopOffset(x: number, side: 1 | -1): number {
  return side * x * lateralSign();
}

/** Le côté `side` de la scène est-il à gauche du sens des index croissants ? */
export function loopLeft(side: 1 | -1): boolean {
  return side * lateralSign() > 0;
}

/**
 * Abscisse de boucle du TRAIN, et cote du sol sous lui, tenues à jour une fois
 * par image.
 *
 * Toutes les cotes se mesurent par rapport au sol sous le train : le lire une
 * fois plutôt qu'à chaque bâtiment évite une conversion par instance, et
 * garantit que tout le ruban partage la même référence - sans quoi une cellule
 * réécrite en cours de route se poserait sur une autre.
 */
let here = 0;
let hereY = 0;
let enabled = true;

/**
 * À appeler une fois par image, après `updateCityAnchor` et avant de rebâtir
 * les cellules du ruban.
 */
export function updateTerrain(
  worldS: number,
  from: { s: number; index: number; span: number; step: 1 | -1 },
): void {
  anchor.s = from.s;
  anchor.index = from.index;
  anchor.span = from.span;
  anchor.step = from.step;
  here = loopSOfWorld(worldS);
  hereY = trackAt(here);
}

/**
 * Cote du sol de la ville par rapport à la voie (m), aux coordonnées du ruban.
 *
 * `worldS` est l'abscisse monde d'un bâtiment, `x` sa distance à l'axe (toujours
 * positive), `side` le côté de la scène. Zéro au droit du train : c'est une
 * DIFFÉRENCE, et c'est tout ce que l'œil peut lire depuis un siège.
 *
 * ATTENTION : cette cote est valable POUR CETTE IMAGE. `hereY` bouge avec le
 * train - il monte de vingt mètres entre Gotanda et Meguro - si bien qu'une
 * valeur retenue d'une image sur l'autre décrit un sol qui n'existe plus. Tout
 * ce qui se pose une fois pour être revu longtemps doit garder l'ALTITUDE
 * (`cityGround`) et laisser la soustraction au groupe de scène.
 */
export function cityRelief(worldS: number, x: number, side: 1 | -1): number {
  if (!enabled) return 0;
  return groundAt(loopSOfWorld(worldS), side * x * lateralSign()) - hereY;
}

/**
 * Altitude orthométrique du sol de la ville (m), aux coordonnées du ruban.
 *
 * La même lecture que `cityRelief`, mais dans un repère qui ne bouge pas : le
 * niveau de la mer. C'est celui qu'il faut pour tout ce qui est ÉCRIT UNE FOIS
 * et relu pendant des centaines de mètres - les bâtiments d'une cellule du
 * ruban vivent quatre cent quatre-vingts mètres, l'arrière-pays douze cents.
 * Le train, lui, monte et descend pendant ce temps : une cote prise par rapport
 * à la voie au moment de l'écriture laisse le sujet en l'air, ou l'enterre, dès
 * que la voie a changé d'altitude.
 *
 * La soustraction se fait alors une fois par image, sur le groupe qui porte
 * tout le ruban (`segEnv.cityY - trackElevation()`), et non par sujet.
 */
export function cityGround(worldS: number, x: number, side: 1 | -1): number {
  if (!enabled) return hereY;
  return groundAt(loopSOfWorld(worldS), side * x * lateralSign());
}

/** Altitude orthométrique du sol sous le train (m) : la cote de la voie. */
export function trackElevation(): number {
  return hereY;
}

/** Abscisse de boucle du train (m). */
export function loopHere(): number {
  return here;
}

/**
 * Couper le relief, pour les tests de non-régression du décor plat.
 *
 * Ce n'est pas un réglage de qualité : le terrain ne coûte rien à l'exécution
 * (deux lectures de tableau par bâtiment) et ne s'allège donc pas. C'est une
 * trappe pour isoler une régression.
 */
export function setTerrainEnabled(on: boolean): void {
  enabled = on;
}

export function terrainEnabled(): boolean {
  return enabled;
}

/** Portée latérale du champ (m) : au-delà, la cote est celle du bord. */
export const TERRAIN_LATERAL_REACH = TERRAIN_REACH;

/** Longueur totale couverte par le champ (m). Doit valoir un tour de boucle. */
export const TERRAIN_FIELD_LEN = FIELD_LEN;
