// Le liseré uguisu qui couronne un muret de portes palières - et ce qu'il DIT.
//
// Ce n'est pas une frise décorative : c'est de la signalétique, et elle porte
// une information que le jeu ne portait pas. Sur les ホームドア de la Yamanote,
// 「ウグイス色のライン」 n'a pas le même dessin des deux côtés - 誤乗防止, pour
// qu'on ne monte pas dans le mauvais sens : TRAIT SIMPLE côté 内回り, TRAIT
// DOUBLE côté 外回り.
//
// C'est le seul repère de sens qu'on ait sous les yeux au moment précis où l'on
// franchit la porte, et sur un îlot Yamanote - treize gares de la boucle - les
// deux dessins sont visibles en même temps, à deux mètres l'un de l'autre, de
// part et d'autre du quai. Le jeu posait le même trait simple partout.
//
// Le liseré garde la MÊME ENVELOPPE dans les deux cas - dix centimètres sous
// l'arête haute du muret. Le double n'est pas plus haut ni plus bas que le
// simple : il occupe la même place, en deux traits.

import type { LoopDirection } from '../../data/platforms';

export type PsdBandStyle = 'single' | 'double';

/** 内回り : trait simple. 外回り : trait double. */
export function psdBandStyleFor(direction: LoopDirection): PsdBandStyle {
  return direction === 'outer' ? 'double' : 'single';
}

/** L'autre dessin - celui du bord d'en face, sur un îlot Yamanote. */
export function oppositePsdBandStyle(style: PsdBandStyle): PsdBandStyle {
  return style === 'single' ? 'double' : 'single';
}

/** Décalage vertical du centre de l'enveloppe, sous l'arête haute du muret. */
export const PSD_BAND_DY = -0.07;

/** Hauteur de l'enveloppe : ce que le liseré occupe, simple ou double. */
export const PSD_BAND_H = 0.1;

/** Hauteur d'un trait du liseré double, et l'écart qui les sépare. */
const DOUBLE_ROW_H = 0.035;
const DOUBLE_GAP = PSD_BAND_H - 2 * DOUBLE_ROW_H;

/**
 * Les traits à poser, en (décalage vertical depuis l'arête haute, hauteur).
 *
 * Un seul pour le simple, deux pour le double - et l'appelant n'a rien d'autre
 * à savoir : il pose une instance par trait, aux mêmes x et z qu'avant.
 */
export function psdBandRows(style: PsdBandStyle): readonly { dy: number; h: number }[] {
  if (style === 'single') return [{ dy: PSD_BAND_DY, h: PSD_BAND_H }];
  const half = (DOUBLE_ROW_H + DOUBLE_GAP) / 2;
  return [
    { dy: PSD_BAND_DY + half, h: DOUBLE_ROW_H },
    { dy: PSD_BAND_DY - half, h: DOUBLE_ROW_H },
  ];
}
