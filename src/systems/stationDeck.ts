// CE QUI PASSE AU-DESSUS DU QUAI, ET CE QUI DOIT LUI CÉDER LA PLACE.
//
// Treize gares portent un plateau praticable à +5,08 m — c'est
// `ASCENT_FLOOR_Y`, quinze contremarches au-dessus du quai, la cote qui règle
// toutes les volées montantes de la ligne. Or le quai a déjà des ouvrages à
// cette hauteur-là, posés bien avant que l'on puisse marcher au-dessus de lui :
//
//   · la DALLE D'AUVENT, dont sept gares placent la sous-face entre 5,20 et
//     5,60 m (`stationLayouts.canopyY`) ;
//   · la GRANDE TOITURE des hubs, dalle à 6,30 et fermes à 5,95
//     (`systems/hubRoof`).
//
// Les deux traversaient le plateau : l'auvent à dix centimètres du plancher,
// la toiture à hauteur de poitrine. Le joueur l'a rapporté d'un mot juste — « de
// très gros blocs gris foncé de partout » — à Shinagawa d'abord, à Ueno
// ensuite, et ce sont exactement les deux hubs à plateau haut.
//
// LA RÈGLE D'ARBITRAGE EST CELLE DE LA PHASE 29. `canopyY` et les cotes de la
// halle sont COMPOSÉES : aucun plan de gare japonais ne cote une altitude.
// `ASCENT_FLOOR_Y` vient de la contremarche, qui est un ouvrage. Quand une cote
// composée se dispute avec un ouvrage, ce n'est pas l'ouvrage qui a tort.
//
// MAIS RIEN NE DISPARAÎT EN BLOC. L'auvent couvre deux cent vingt mètres de
// quai, la toiture cent quatre-vingts ; le plateau n'en occupe que trente. Ils
// S'INTERROMPENT au droit du plateau, comme une verrière s'interrompt sous le
// pont-concourse qui la traverse, et ce qui pendait à eux se raccroche à la
// sous-face du plateau. C'est ce que l'on voit dans toutes les gares de la
// ligne réelle où un ouvrage transversal franchit les voies.
//
// LA BANDE N'EST PAS ÉCRITE : elle est LUE sur le réseau de la gare. Une gare
// qui gagnerait un plateau demain percerait ses toitures sans qu'on ait rien à
// ajouter ici ; une gare qui perdrait le sien les refermerait.

import { shellsOf, type ConcourseNetwork } from '../data/stationConcourseBuild.ts';

/** L'épaisseur du plancher d'un volume : sa cote est celle du DESSUS. */
export const DECK_SLAB = 0.1;
/** L'épaisseur de la dalle d'auvent, dont la SOUS-FACE est à `canopyY`. */
export const CANOPY_T = 0.14;

export interface Deck {
  /** Bornes de la percée, en repère QUAI, dans le sens des z croissants. */
  z0: number;
  z1: number;
  /** Cote de MARCHE du plateau : ce qui pendait plus haut se raccroche dessous. */
  floorY: number;
}

/**
 * Le plateau praticable qui traverse la tranche `[y0, y1]` d'un ouvrage de
 * quai, s'il y en a un.
 *
 * `x0`/`x1` bornent l'ouvrage : un hall qui passe à côté de lui — derrière le
 * mur de fond, sous le quai d'en face — ne le perce pas, si haut soit-il. On
 * prend le volume ENTIER (sol à plafond) et non le seul plancher, parce qu'un
 * ouvrage qui déboucherait au milieu d'un hall serait tout aussi faux qu'un
 * ouvrage à ras du plancher.
 */
export function deckOver(
  net: ConcourseNetwork,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
): Deck | null {
  let z0 = Infinity;
  let z1 = -Infinity;
  let floorY = Infinity;
  for (const s of shellsOf(net)) {
    if (!s.rooms.some((r) => r.walkable)) continue;
    if (s.ceilY <= y0 || s.floorY - DECK_SLAB >= y1) continue;
    if (s.rect.x1 <= x0 || s.rect.x0 >= x1) continue;
    z0 = Math.min(z0, s.rect.z0);
    z1 = Math.max(z1, s.rect.z1);
    floorY = Math.min(floorY, s.floorY);
  }
  return z0 < z1 ? { z0, z1, floorY } : null;
}

/** Une cote z du quai tombe-t-elle sous le plateau ? */
export function underDeck(deck: Deck | null, z: number, half = 0): boolean {
  return !!deck && z + half > deck.z0 && z - half < deck.z1;
}

/**
 * LA COTE OÙ S'ARRÊTE UN OUVRAGE DE QUAI, en z.
 *
 * C'est l'auvent partout, et la sous-face du plateau là où il passe. Poteaux,
 * poutres et tubes de néon la lisent tous les trois : c'est la seule décision
 * du dossier, et elle est prise ici pour que le rendu et le contrôle en aient
 * exactement la même.
 */
export function soffitAt(deck: Deck | null, canopyY: number, z: number, half = 0): number {
  return underDeck(deck, z, half) ? (deck as Deck).floorY - DECK_SLAB : canopyY;
}

/**
 * La percée à faire dans la dalle d'auvent, bornée au contour du quai.
 *
 * Un trou qui affleure une arête ne se triangule pas : on garde un centimètre
 * de matière, et l'on renonce si le plateau déborde du quai — aucun de la ligne
 * ne le fait, mais un relevé futur pourrait.
 */
export function deckHole(deck: Deck | null, half: number): { z0: number; z1: number } | null {
  if (!deck) return null;
  const z0 = Math.max(-half + 0.01, deck.z0);
  const z1 = Math.min(half - 0.01, deck.z1);
  return z1 - z0 > 0.02 ? { z0, z1 } : null;
}
