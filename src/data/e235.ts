// Cotes et composition d'une rame E235-0 (série Yamanote), ramenées au repère
// du jeu : y = 0 est le plancher du wagon, le champignon du rail est à -1,13.
//
// Les cotes réelles (mm) sont rappelées en commentaire ; ce qui compte pour le
// rendu, c'est qu'elles se raccordent à l'intérieur déjà modélisé
// (CONFIG.carHalfWidth 1,40 + 8 cm de paroi = 1,475 de demi-caisse) et à la
// trame du quai (portes palières tous les 20 m).

import { CONFIG } from './config';

export const E235 = {
  /** Entraxe des caisses : c'est la trame sur laquelle le quai est bâti. */
  pitch: 20,
  /** Longueur de caisse hors soufflet (20 000 mm bogie à bogie, caisse un peu plus courte). */
  bodyHalfLen: 9.8,
  /** Demi-largeur de caisse (2 950 mm). */
  halfWidth: 1.475,

  /** Ligne de toit (3 620 mm au-dessus du rail). */
  roofY: 2.49,
  /** Sommet du toit bombé. */
  roofCrownY: 2.6,
  /** Sommet des carénages de climatisation (≈ 4 070 mm rail). */
  acTopY: 2.92,

  /** Sous-face du châssis et bas de jupe. */
  underframeY: -0.1,
  skirtY: -0.74,
  /** Champignon du rail (1 130 mm sous le plancher). */
  railY: -1.13,

  /** Bogies : entraxe 13 800 mm, empattement 2 100 mm, roues Ø 810 mm. */
  bogieDz: 6.9,
  axleDz: 1.05,
  wheelR: 0.405,

  /** Portes : mêmes cotes que l'intérieur, sinon rien ne s'aligne. */
  doorCenters: CONFIG.doorCenters,
  doorHalfW: CONFIG.doorHalfWidth,
  doorH: 1.85,
  /** Face extérieure des vantaux, juste devant la peau de caisse. */
  doorFaceX: 1.5,

  /** Bandeau vitré, aligné sur les baies de l'intérieur. */
  windowBottom: 0.85,
  windowTop: 1.75,
  windowRadius: 0.11,
  /** Montant entre deux baies d'un même panneau. */
  pillar: 0.16,

  /**
   * Habillage uguisu (黄緑6号). Le E235-0 n'a PAS de bandeau continu en haut de
   * caisse : le vert est AUX PORTES, et il monte du bas de caisse jusqu'au
   * pavillon. Les vantaux, verts eux aussi, n'en sont que la partie basse
   * mobile ; au-dessus, c'est la caisse qui est verte. Entre deux portes, le
   * haut de caisse reste inox.
   */
  doorGreenTop: 2.38,

  /** Nez de cabine : longueur du masque vert et hauteur de son pare-brise. */
  cabLen: 2.1,
  windshieldBottom: 1.02,
  windshieldTop: 2.16,
} as const;

/** Voiture dans laquelle voyage le joueur (la 6e sur 11 : la rame reste centrée). */
export const PLAYER_CAR = 5;

export type CarKind = 'cab' | 'motor' | 'trailer';

export interface CarSpec {
  /** Numéro de voiture (1 à 11, comme sur les plaques). */
  no: number;
  kind: CarKind;
  /** Désignation portée sur la caisse. */
  label: string;
  /** Cette voiture porte un pantographe. */
  panto: boolean;
}

/**
 * Composition réelle d'une rame E235-0 : クハ en tête et en queue, six モハ
 * moteurs, trois サハ remorques, pantographes sur les モハE234 des voitures
 * 3, 6 et 9.
 */
export const CONSIST: readonly CarSpec[] = [
  { no: 1, kind: 'cab', label: 'クハE235-0', panto: false },
  { no: 2, kind: 'motor', label: 'モハE235-0', panto: false },
  { no: 3, kind: 'motor', label: 'モハE234-0', panto: true },
  { no: 4, kind: 'trailer', label: 'サハE235-0', panto: false },
  { no: 5, kind: 'motor', label: 'モハE235-0', panto: false },
  { no: 6, kind: 'motor', label: 'モハE234-0', panto: true },
  { no: 7, kind: 'trailer', label: 'サハE235-500', panto: false },
  { no: 8, kind: 'motor', label: 'モハE235-0', panto: false },
  { no: 9, kind: 'motor', label: 'モハE234-0', panto: true },
  { no: 10, kind: 'trailer', label: 'サハE235-4600', panto: false },
  { no: 11, kind: 'cab', label: 'クハE234-0', panto: false },
];

/** Position longitudinale du centre d'une voiture, dans le repère de la rame. */
export function carZ(index: number): number {
  return (index - PLAYER_CAR) * E235.pitch;
}

/** Teintes de la livrée. */
export const LIVERY = {
  /**
   * 黄緑6号, le vert Yamanote. Plus clair et plus jaune que la frise du quai :
   * sur photo, les portes du E235 tirent nettement vers le jaune-vert, là où un
   * vert soutenu donne une rame trop sombre.
   */
  uguisu: '#9bc93f',
  /** Inox brossé de la caisse. */
  stainless: '#c9ccd0',
  /** Toit : peinture grise mate, plus sombre que la caisse. */
  roof: '#8e9296',
  /** Châssis, jupes, coffres sous caisse. */
  underframe: '#3a3d42',
  /** Bogies. */
  bogie: '#2e3136',
  /**
   * Vitrage des baies. Teinté, mais CLAIR : sur photo on voit franchement
   * l'intérieur et les voyageurs derrière. Le vert bouteille précédent rendait
   * une rame aux vitres opaques, ce qu'aucune photo ne montre.
   */
  glass: '#93a89b',
  /** Pare-brise et bandeau noir de face avant. */
  black: '#16181b',
} as const;
