// Tous les réglages ajustables de l'expérience, au même endroit.

export const CONFIG = {
  // Cycle station (secondes). depart et brake sont dimensionnés pour le profil
  // physique E235 de systems/trainPhysics (~0,84 m/s² au démarrage, arrêt
  // complet en ~23 s depuis 90 km/h - les dernières secondes ne servant qu'à
  // poser la rame, voir le lâcher final du freinage).
  //
  // La durée de croisière n'est PAS ici : elle se déduit de l'intervalle réel
  // du tronçon (data/segments, SEGMENT_HEADWAY_SEC → cruiseDuration), et varie
  // donc d'un tronçon à l'autre et d'un sens à l'autre. Un `cruiseTime: 59`
  // traînait à cette place, que plus personne ne lisait depuis le passage aux
  // intervalles réels : le supprimer évite qu'on le règle en croyant agir.
  //
  // dwellTime n'est PAS la durée d'arrêt non plus : celle-ci est tirée par arrêt
  // (stationCycle.dwellDuration, 40 à 65 s selon la gare, l'état de la ligne
  // et - surtout - la longueur de la 発車メロディ du quai, qu'on laisse aller
  // au bout de ses deux passages). C'est le forfait d'arrêt retiré de
  // l'intervalle réel du tronçon
  // pour dimensionner la croisière (segments.cruiseDuration) - le laisser bas
  // garde à la croisière de quoi placer l'annonce de départ ET celle
  // d'approche, qui cumulent jusqu'à 71 s de parole sur une même file.
  //
  // Le lâcher final allonge le freinage de deux secondes ; elles sont reprises
  // sur le forfait d'arrêt pour que la croisière - et donc l'horaire de la
  // boucle - ne bouge pas d'une seconde.
  brakeTime: 24,
  dwellTime: 20,
  departTime: 17,
  doorTime: 2.6,

  /**
   * Course de fermeture d'une porte palière (s).
   *
   * Elle est ici, et non parmi les profils de systems/doorMotion, parce qu'un
   * autre module en dépend : c'est cette durée qui décide combien de paires
   * Mi5–Do5 l'avertisseur de fermeture a le temps de donner (voir
   * data/psdCloseWarning et tests/psdCloseWarning.test.ts). Trois, en l'état -
   * et raccourcir la course sans y penser en retirerait une.
   */
  psdCloseTime: 0.9,

  // Vitesses et hauteurs (mètres, m/s, km/h).
  maxSpeedKmh: 90,
  walkSpeed: 1.4,
  // Le quai est bien plus long que le wagon : sans presser le pas on n'en
  // verrait jamais le bout pendant un arrêt.
  runSpeed: 3.0,
  eyeHeight: 1.55,
  sitHeight: 1.16,

  // Station initiale (scène avant le clic). Au boarding, randomizeEntry()
  // re-tire gare + phase ; l'horloge se cale sur Tokyo au start.
  startIndex: Math.floor(Math.random() * 30),
  clockStart: 16 * 60 + 51,

  // Rendu. (Un `exposure: 0.85` a vécu ici sans jamais être appliqué à
  // `gl.toneMappingExposure` : l'exposition vient du ton mapping de la scène.)
  bloom: 0.25,

  // Géométrie intérieure du wagon (demi-dimensions).
  carHalfLength: 10,
  carHalfWidth: 1.4,
  carHeight: 2.38,
  doorCenters: [-7.5, -2.5, 2.5, 7.5],
  doorHalfWidth: 0.66,

  // Intervalle entre joints de rail (mètres).
  railJointGap: 23,

  // Sonorisation : diffuseurs de plafond du wagon (de part et d'autre du
  // caisson central, au droit de chaque porte). Ceux du QUAI ne sont pas ici :
  // ils appartiennent à la gare, qui les répartit sur toute sa longueur
  // (systems/stationPlacement, data/stationGeometry).
  speakerX: 1.02,
  speakerY: 2.364, // encastré dans le plafond (sous-face à 2,38 m)
} as const;

// Vitesse maximale en m/s, dérivée une fois pour toutes.
export const V_MAX = CONFIG.maxSpeedKmh / 3.6;

/**
 * Dépassement de course d'un vantail en butée d'ouverture.
 *
 * Sans lui, la porte grande ouverte s'arrête PILE dans le plan du montant de
 * baie : le chant du vantail et le tableau de la porte deviennent deux faces
 * exactement confondues, et elles se disputent le tampon de profondeur tant que
 * la rame reste à quai - le bout de la porte clignote. Ces quinze millimètres
 * de plus glissent le chant DERRIÈRE le montant, comme dans une vraie poche de
 * porte : plus rien n'est coplanaire, et l'ouverture visible ne change pas
 * puisque c'est le montant qui la borde.
 */
export const DOOR_POCKET_TUCK = 0.015;

// Positions des diffuseurs, partagées par le rendu (grilles au plafond) et le
// moteur audio (un Panner3D par diffuseur). Repère du wagon.
export type SpeakerPos = readonly [number, number, number];

export const CABIN_SPEAKERS: readonly SpeakerPos[] = CONFIG.doorCenters.flatMap((z) =>
  [1, -1].map((s) => [s * CONFIG.speakerX, CONFIG.speakerY, z] as SpeakerPos),
);
