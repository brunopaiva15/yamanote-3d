// LA GRANDE TOITURE DES HUBS, ET LA PERCÉE QUE LE HALL Y FAIT.
//
// `three/HubStationRoof` dessinait ses cotes chez lui, et personne d'autre ne
// les connaissait. Tant que la gare s'arrêtait au quai, cela suffisait : une
// dalle d'acier à 6,30 m au-dessus d'un quai à −0,06 n'avait rien à heurter.
//
// Ce n'est plus vrai deux fois. La première l'était déjà en phase 19 — les
// PIEDS des colonnes ressortaient au plafond du hall souterrain, et le
// commentaire de `COL_FOOT_Y` raconte comment on les a remontés. La seconde
// est arrivée par le haut : treize gares portent maintenant un plateau
// praticable à +5,08 m, plafond à +8,18, et **deux d'entre elles sont des
// hubs** — Ueno et Shinagawa. La dalle de toiture passe donc à 1,2 m au-dessus
// de leur plancher, les fermes à 0,9 m : à hauteur de poitrine, en travers de
// tout le hall, sur trente mètres. C'est là ce que le joueur a rapporté comme
// « de très gros blocs gris foncé de partout ».
//
// CE QUI CÈDE, ET POURQUOI CE N'EST PAS LA GARE. Les cotes de la toiture sont
// COMPOSÉES : aucun relevé ne dit qu'une halle d'Ueno fait 6,30 m de haut, et
// le commentaire de la dalle avoue lui-même l'avoir éclaircie « depuis qu'on
// peut se tenir dessous ». Le plancher du hall, lui, vient de
// `data/stationGeometry.ASCENT_FLOOR_Y`, qui règle les quinze contremarches de
// toutes les volées de la ligne. Quand une cote composée se dispute avec un
// ouvrage, ce n'est pas l'ouvrage qui a tort.
//
// MAIS LA TOITURE NE DISPARAÎT PAS POUR AUTANT. Elle couvre cent quatre-vingts
// mètres de quai ; le hall n'en occupe que trente. L'effacer entièrement
// rendrait cent cinquante mètres de quai au ciel pour régler un conflit local —
// ce serait remplacer ce qui marche. Elle S'INTERROMPT donc au droit du hall,
// exactement comme une verrière s'interrompt là où un pont-concourse la
// traverse. La percée n'est pas écrite ici : elle est LUE sur le réseau de la
// gare, et elle vaut ce que le hall vaut.

import { ASCENT_LEN, PLATFORM_TOP } from '../data/stationGeometry.ts';
import { psdGates } from '../three/station/psdLayout.ts';
import { placementFor } from './stationPlacement.ts';
import { platformToWorld } from './playerFrame.ts';
import { deckOver, type Deck } from './stationDeck.ts';

/** Longueur et largeur de la halle. Composées, et de toujours. */
export const ROOF_LEN = 180;
export const ROOF_W = 26;

/** La dalle : son axe et son épaisseur. */
export const SLAB_Y = 6.3;
export const SLAB_T = 0.5;
/** Les fermes transversales, qui descendent plus bas que la dalle. */
export const TRUSS_Y = 5.95;
export const TRUSS_T = 0.6;
export const TRUSS_ZS: readonly number[] = Array.from(
  { length: 10 },
  (_, k) => -81 + k * 18,
);
/** Les bandeaux lumineux, sous la dalle. */
export const LAMP_Y = 6.0;
export const LAMP_T = 0.08;
export const LAMP_X = 4.5;
export const LAMP_LEN = ROOF_LEN - 4;

/** Les colonnes : pied au nu du quai (voir `COL_FOOT_Y`), tête dans la dalle. */
export const COL_FOOT_Y = PLATFORM_TOP - 0.02;
export const COL_HEAD_Y = 6.3;
export const COL_X = 10;
export const COL_ZS: readonly number[] = Array.from(
  { length: 6 },
  (_, k) => -75 + k * 30,
);

/** Sous-face de l'ouvrage entier : la ferme, et non la dalle. */
export const ROOF_UNDER = TRUSS_Y - TRUSS_T / 2;
/** Extrados de l'ouvrage entier. */
export const ROOF_OVER = SLAB_Y + SLAB_T / 2;

const GAPS = new Map<number, Deck | null>();

/**
 * La percée que le plateau d'une gare fait dans sa toiture, en repère QUAI.
 *
 * On ne cherche pas « les gares à hall haut » dans une liste : on demande au
 * RÉSEAU quels volumes praticables traversent la tranche d'altitude de
 * l'ouvrage (`systems/stationDeck`). Deux hubs répondent — Ueno et Shinagawa.
 */
export function roofGap(index: number): Deck | null {
  const i = ((index % 30) + 30) % 30;
  const hit = GAPS.get(i);
  if (hit !== undefined) return hit;
  const place = placementFor(i, psdGates());
  let out = deckOver(place.network, ROOF_UNDER, ROOF_OVER, -ROOF_W / 2, ROOF_W / 2);
  // ET LA VOLÉE QUI Y MÈNE. La percée s'arrêtait au bord du plateau — c'est ce
  // que le relevé donne — mais on n'arrive pas sur un plateau par téléportation :
  // la volée montante démarre AVANT lui, et le voyageur qui la gravit a l'œil à
  // 6,58 m dès la cote du plancher. La dalle de toiture, elle, tient de 6,00 à
  // 6,50. On la traversait donc de la tête sur les dernières marches, ce que le
  // joueur a rapporté comme « au-dessus de la cage d'escalier, un plafond gris
  // foncé qu'on traverse ».
  if (out && place.mainRise === 'up') {
    const s = place.mainStair;
    out = {
      ...out,
      z0: Math.min(out.z0, s.z - s.halfZ - ASCENT_MARGIN),
      z1: Math.max(out.z1, s.z + s.halfZ + ASCENT_MARGIN),
    };
  }
  GAPS.set(i, out);
  return out;
}

/**
 * Ce que la volée réclame au-delà de son emprise au sol.
 *
 * Une volée montante occupe la longueur de sa cage PLUS celle de la rampe qui
 * en sort (`ASCENT_LEN`), et l'on veut de l'air au-dessus de la tête sur toute
 * cette course, pas seulement au droit du percement.
 */
const ASCENT_MARGIN = ASCENT_LEN + 1;

/**
 * La même percée, remise en repère MONDE.
 *
 * Deux transformations séparent les deux repères — la rotation d'un demi-tour
 * quand les portes ouvrent de l'autre côté, et le coulissement du quai à
 * l'approche — et l'on ne les refait pas ici : `systems/playerFrame` est le
 * seul endroit de ce moteur qui les connaisse, et il vaut mieux qu'il le
 * reste. La borne z0 et la borne z1 peuvent s'échanger au passage, d'où le
 * tri : un rectangle se lit toujours dans le sens des coordonnées croissantes.
 */
const OUT = { x: 0, z: 0 };

export function roofGapWorld(index: number): Deck | null {
  const g = roofGap(index);
  if (!g) return null;
  platformToWorld(0, g.z0, OUT);
  const a = OUT.z;
  platformToWorld(0, g.z1, OUT);
  const b = OUT.z;
  return { ...g, z0: Math.min(a, b), z1: Math.max(a, b) };
}
