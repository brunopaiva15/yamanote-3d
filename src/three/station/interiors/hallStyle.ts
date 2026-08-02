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
  /**
   * Les longues parois s'arrêtent à hauteur d'APPUI, et l'on voit par-dessus.
   *
   * C'est ce qui fait un pont-concourse, et c'est un fait de relevé avant
   * d'être un parti de rendu : « le pont-concourse enjambe tout le faisceau :
   * on voit les voies dessous ». Un hall qu'on enferme entre deux parois
   * pleines à Nippori, à Ōsaki ou à Takanawa Gateway perd exactement ce pour
   * quoi il existe.
   */
  parapet: boolean;
  /** Hauteur de l'appui, quand il y en a un (m). */
  parapetH: number;
  /**
   * Le volume a-t-il un plafond plein ?
   *
   * Une MEZZANINE n'en a pas : c'est un demi-niveau ouvert sur celui d'en
   * dessous, et son intérêt tient tout entier dans ce qu'on voit du hall avant
   * d'y arriver — « elle donne à cette petite gare une coupe à trois niveaux
   * qu'aucun hall générique ne produirait » (Okachimachi).
   */
  ceiling: boolean;
}

/**
 * Les sept archétypes du vocabulaire.
 *
 * Les trois premiers se distinguent par leur COUVERTURE (phase 14), les quatre
 * suivants par ce qu'ils LAISSENT VOIR (phase 15) — et c'est une différence de
 * nature : un souterrain se décrit par son plafond, un pont-concourse par son
 * absence de murs.
 */
const STYLES: Record<ConcourseNodeKind, HallStyle> = {
  // Le hall d'avant, au centimètre. Ne pas y toucher sans rouvrir le test.
  linear: {
    lampPitch: 4.2, dadoH: 1.15, beamPitch: null, beamDrop: 0,
    parapet: false, parapetH: 0, ceiling: true,
  },
  // Sous le tablier : les poutres sont serrées, elles descendent franchement,
  // et l'on ne carrelle pas jusqu'à hauteur d'épaule un local qui n'est qu'un
  // dessous d'ouvrage.
  underViaduct: {
    lampPitch: 3.5, dadoH: 0.9, beamPitch: 3.4, beamDrop: 0.34,
    parapet: false, parapetH: 0, ceiling: true,
  },
  // Ce qui caractérise un petit hall, c'est ce qu'il n'a pas : moins de
  // lumière, pas de trame, un soubassement de gare de quartier.
  compact: {
    lampPitch: 5.4, dadoH: 1.0, beamPitch: null, beamDrop: 0,
    parapet: false, parapetH: 0, ceiling: true,
  },
  // LE PONT-CONCOURSE : on voit les voies dessous, et c'est tout son sujet.
  // Appui à 1,10 m — la cote d'un garde-corps de quai — et rien au-dessus.
  overbridge: {
    lampPitch: 4.6, dadoH: 0.8, beamPitch: null, beamDrop: 0,
    parapet: true, parapetH: 1.1, ceiling: true,
  },
  // LE HALL TRANSVERSAL : long, haut, et l'on en voit le bout. Sa lumière est
  // plus espacée parce que le volume est plus grand, et son soubassement plus
  // haut parce que c'est une grande gare.
  cross: {
    lampPitch: 6, dadoH: 1.3, beamPitch: null, beamDrop: 0,
    parapet: false, parapetH: 0, ceiling: true,
  },
  // LA MEZZANINE : un demi-niveau OUVERT sur celui d'en dessous. Pas de
  // plafond, un appui bas, et l'on voit le hall avant d'y descendre.
  mezzanine: {
    lampPitch: 4, dadoH: 0.8, beamPitch: null, beamDrop: 0,
    parapet: true, parapetH: 1.05, ceiling: false,
  },
  // LA TRANCHE DE GRANDE GARE : elle continue hors champ, et sa hauteur le dit.
  hubSlice: {
    lampPitch: 5, dadoH: 1.3, beamPitch: null, beamDrop: 0,
    parapet: false, parapetH: 0, ceiling: true,
  },
};

/** Le style d'un volume. */
export function hallStyle(kind: ConcourseNodeKind): HallStyle {
  return STYLES[kind];
}

/** Les sept archétypes. Liste fermée : une entrée de plus est une décision. */
export const HALL_ARCHETYPES = Object.keys(STYLES) as ConcourseNodeKind[];
