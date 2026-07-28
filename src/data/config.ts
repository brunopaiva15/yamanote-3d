// Tous les réglages ajustables de l'expérience, au même endroit.

export const CONFIG = {
  // Cycle station (secondes), calé sur la réalité : ~2 min par station, boucle ~1 h.
  // depart et brake sont dimensionnés pour le profil physique E235 de
  // stationCycle (~0,84 m/s² au démarrage, arrêt complet en ~21 s depuis 90 km/h).
  cruiseTime: 59,
  brakeTime: 22,
  dwellTime: 22,
  departTime: 17,
  doorTime: 2.6,

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

  // Rendu.
  exposure: 0.85,
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
  // caisson central, au droit de chaque porte) et haut-parleurs du quai.
  speakerX: 1.02,
  speakerY: 2.364, // encastré dans le plafond (sous-face à 2,38 m)
  platformSpeakerX: 4.4,
  platformSpeakerY: 3.3,
  platformSpeakerZ: [-9, -3, 3, 9],
} as const;

// Vitesse maximale en m/s, dérivée une fois pour toutes.
export const V_MAX = CONFIG.maxSpeedKmh / 3.6;

// Positions des diffuseurs, partagées par le rendu (grilles au plafond) et le
// moteur audio (un Panner3D par diffuseur). Repère du wagon.
export type SpeakerPos = readonly [number, number, number];

export const CABIN_SPEAKERS: readonly SpeakerPos[] = CONFIG.doorCenters.flatMap((z) =>
  [1, -1].map((s) => [s * CONFIG.speakerX, CONFIG.speakerY, z] as SpeakerPos),
);

// Quai : construit côté +x, l'abscisse est retournée selon le côté d'ouverture.
export const PLATFORM_SPEAKERS: readonly SpeakerPos[] = CONFIG.platformSpeakerZ.map(
  (z) => [CONFIG.platformSpeakerX, CONFIG.platformSpeakerY, z] as SpeakerPos,
);
