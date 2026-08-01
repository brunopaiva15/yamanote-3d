// Les cotes d'un distributeur automatique japonais.
//
// Une caisse peinte de 1,14 m de large pour 1,83 m de haut et 0,72 m de fond,
// CREUSÉE de trois niches - et ce sont ces creux qui la font reconnaître de
// loin. Ces cotes sont partagées par le quai (three/station/VendingMachines,
// qui instancie) et par le hall (VendingBox, qui monte en boîtes) : c'est le
// même matériel, il ne peut pas avoir deux jeux de cotes.

/** Cotes de la caisse standard (m). */
export const VEND_H = 1.83;
export const VEND_W = 1.14;
export const VEND_PLINTH = 0.1;

/** Une niche de la façade : sa tranche de hauteur, sa largeur, sa saillie. */
export interface Band {
  y0: number;
  y1: number;
  w: number;
  /** Saillie de l'encadrement devant le nu de la caisse (m). 0 = à plat. */
  reveal: number;
}

/** Le volet de retrait, au ras du sol, dans sa niche de 4,5 cm. */
export const PORT: Band = { y0: 0.16, y1: 0.56, w: 0.86, reveal: 0.045 };
/** La platine des monnayeurs, à hauteur de main. */
export const MONEY: Band = { y0: 0.7, y1: 1.0, w: 0.96, reveal: 0 };
/** La rangée de boutons, sous la vitrine. */
export const BUTTONS: Band = { y0: 1.0, y1: 1.08, w: 0.96, reveal: 0.012 };
/** La vitrine, encadrement saillant de 7 cm, verre en avant, échantillons au fond. */
export const WINDOW: Band = { y0: 1.1, y1: 1.66, w: 0.94, reveal: 0.07 };
/** Le bandeau d'enseigne allumé, en tête. */
export const HEADER: Band = { y0: 1.7, y1: 1.83, w: 1.0, reveal: 0 };

/** Décollement des plans du nu de la tôle : quatre millimètres. */
export const SKIN = 0.004;
