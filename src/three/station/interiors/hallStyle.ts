// CE QUI FAIT LA DIFFÉRENCE ENTRE TROIS HALLS QUI ONT LA MÊME FORME.
//
// Un hall de gare japonaise est presque toujours un parallélépipède : deux
// parois, un sol, un plafond, une ligne de portillons en travers. Ce n'est pas
// la FORME qui les distingue — c'est la COUVERTURE, et la couverture dit
// l'ouvrage qui est au-dessus.
//
//   · un souterrain a une dalle, lisse et basse, et l'on n'y voit rien
//     d'autre : ce qui la porte est dans la terre ;
//   · le dessous d'un VIADUC n'a pas de plafond du tout. Il a des poutres —
//     transversales, rapprochées, avec leurs retombées — et c'est le tablier
//     qui porte les trains qu'on a au-dessus de la tête. Le relevé le dit de
//     Kanda, d'Ōtsuka, de Yūrakuchō et de Shimbashi dans les mêmes mots :
//     « plafond bas, poutres apparentes, la rue à toucher » ;
//   · un petit hall de gare locale est plus bas encore, et surtout plus NU :
//     une pièce, un contrôle, une descente. Ce qui le caractérise, c'est ce
//     qu'il n'a pas.
//
// Ce fichier ne dessine rien : il donne à chaque archétype les quelques cotes
// qui le font. C'est délibérément une TABLE et non trois composants — trois
// composants qui recopieraient chacun un sol, deux parois et un fond auraient
// divergé à la première correction, et l'on aurait passé le reste du chantier
// à réparer le troisième.
//
// `linear` REPRODUIT EXACTEMENT le hall d'avant. Les trente gares y passent
// tant qu'aucune n'est branchée sur son relevé, et un test tient les valeurs :
// un archétype qui déraperait ferait bouger trente halls sans que personne ne
// le demande.

import type { ConcourseNodeKind } from '../../../data/stationConcourseTypes';

export interface HallStyle {
  /** Entraxe des réglettes de plafond (m). */
  lampPitch: number;
  /** Hauteur du soubassement de faïence (m). */
  dadoH: number;
  /**
   * Entraxe des poutres transversales, ou `null` s'il n'y en a pas.
   *
   * C'est LA différence du dessous de viaduc : on ne met pas un plafond sous
   * un tablier, on montre le tablier.
   */
  beamPitch: number | null;
  /** Hauteur des poutres, sous le nu du plafond (m). */
  beamDrop: number;
}

/**
 * Les trois halls de la phase 14. Les quatre autres archétypes — pont-concourse,
 * hall transversal, mezzanine, tranche de grande gare — sont l'affaire de la
 * phase 15 : ils ne se distinguent pas par leur couverture mais par leur
 * HAUTEUR et par ce qu'on voit dessous, ce qui demande autre chose qu'une table.
 */
const STYLES: Partial<Record<ConcourseNodeKind, HallStyle>> = {
  // Le hall d'avant, au centimètre. Ne pas y toucher sans rouvrir le test.
  linear: { lampPitch: 4.2, dadoH: 1.15, beamPitch: null, beamDrop: 0 },
  // Sous le tablier : les poutres sont serrées, elles descendent franchement,
  // et l'on ne carrelle pas jusqu'à hauteur d'épaule un local qui n'est qu'un
  // dessous d'ouvrage.
  underViaduct: { lampPitch: 3.5, dadoH: 0.9, beamPitch: 3.4, beamDrop: 0.34 },
  // Ce qui caractérise un petit hall, c'est ce qu'il n'a pas : moins de
  // lumière, pas de trame, un soubassement de gare de quartier.
  compact: { lampPitch: 5.4, dadoH: 1.0, beamPitch: null, beamDrop: 0 },
};

/** Le style d'un volume. Tout ce qui n'est pas encore un archétype reste linéaire. */
export function hallStyle(kind: ConcourseNodeKind): HallStyle {
  return STYLES[kind] ?? STYLES.linear!;
}

/** Les archétypes réellement distincts aujourd'hui. Liste fermée. */
export const HALL_ARCHETYPES = Object.keys(STYLES) as ConcourseNodeKind[];
