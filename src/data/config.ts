// Tous les réglages ajustables de l'expérience, au même endroit.

export const CONFIG = {
  // Cycle station (secondes), calé sur la réalité : ~2 min par station, boucle ~1 h.
  cruiseTime: 78,
  brakeTime: 12,
  dwellTime: 22,
  departTime: 8,
  doorTime: 2.6,

  // Vitesses et hauteurs (mètres, m/s, km/h).
  maxSpeedKmh: 90,
  walkSpeed: 1.4,
  eyeHeight: 1.55,
  sitHeight: 1.16,

  // Départ de la boucle : station tirée au hasard parmi les 30 à chaque
  // lancement (l'horloge, elle, se cale sur l'heure réelle de Tokyo au start).
  startIndex: Math.floor(Math.random() * 30),
  clockStart: 16 * 60 + 51,

  // Rendu.
  exposure: 0.85,
  bloom: 0.25,

  // Géométrie intérieure du wagon (demi-dimensions).
  carHalfLength: 10,
  carHalfWidth: 1.4,
  carHeight: 2.3,
  doorCenters: [-7.5, -2.5, 2.5, 7.5],
  doorHalfWidth: 0.66,

  // Intervalle entre joints de rail (mètres).
  railJointGap: 23,
} as const;

// Vitesse maximale en m/s, dérivée une fois pour toutes.
export const V_MAX = CONFIG.maxSpeedKmh / 3.6;
