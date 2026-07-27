// Qualité adaptative : surveille le rythme réel des frames et, quand le
// navigateur ne suit pas, dégrade la scène par paliers successifs :
//   palier 1 — moins de passagers (rame et quai) ;
//   palier 2 — détails de lumière en moins (occlusion ambiante coupée,
//              ombres du soleil réduites, néons du wagon espacés) ;
//   palier 3 — encore moins de passagers, ombres du soleil coupées et
//              résolution de rendu plafonnée ;
//   palier 4 — minimal : plus aucun post-processing (le coût par pixel le
//              plus lourd sur petit GPU), résolution à dpr 1, passagers à 30 %.
// On ne remonte jamais de palier : réaugmenter la charge referait laguer et
// l'aller-retour serait plus visible qu'une qualité stable un cran en dessous.

import { create } from 'zustand';

export type PerfLevel = 0 | 1 | 2 | 3 | 4;

export const MAX_PERF_LEVEL: PerfLevel = 4;

/** Part des passagers conservée à chaque palier (rame et foule du quai). */
const PAX_SCALE: Record<PerfLevel, number> = { 0: 1, 1: 0.7, 2: 0.7, 3: 0.5, 4: 0.3 };

interface PerfState {
  level: PerfLevel;
}

/** Palier courant — lu par React (Scene) comme par les systèmes hors React. */
export const usePerf = create<PerfState>(() => ({ level: 0 }));

export function perfLevel(): PerfLevel {
  return usePerf.getState().level;
}

export function paxScale(): number {
  return PAX_SCALE[perfLevel()];
}

// --- Détection ---
// FPS lissés (EMA ~0,5 s). Sous LAG_FPS le temps de lag s'accumule ; au-dessus
// de RECOVER_FPS il se résorbe (un simple à-coup GC ne déclenche rien). Après
// LAG_HOLD secondes de lag net, on descend d'un palier puis on observe pendant
// CHANGE_GRACE secondes avant de juger si ça suffit.
const LAG_FPS = 42;
const RECOVER_FPS = 50;
const LAG_HOLD = 4;
const STARTUP_GRACE = 8; // compilation des shaders, premiers chargements
const CHANGE_GRACE = 12;

let fpsEma = 60;
let lagT = 0;
let graceT = STARTUP_GRACE;

// Sonde de diagnostic (console navigateur) : __perfDebug() → état du moniteur.
if (typeof window !== 'undefined') {
  Object.assign(window, {
    __perfDebug: () => ({ fpsEma, lagT, graceT, calibDone, level: perfLevel() }),
  });
}

// --- Calibrage avant embarquement ---
// La scène 3D tourne déjà derrière l'écran de démarrage : on mesure le rythme
// réel pendant que le joueur lit, et on applique directement le palier adapté
// avant le premier tour de roue. Sans ça, une petite machine démarrerait à
// pleine qualité et subirait les marches de dégradation une à une en jouant.
const CALIB_SETTLE = 2; // s ignorées : compilation des shaders, chargements
const CALIB_WINDOW = 2; // s de mesure effective
// Seuils volontairement plus exigeants que LAG_FPS : la scène d'attente est
// plus légère que le jeu en marche (pas d'échange de PNJ, pas de défilement).
const CALIB_LEVELS: readonly { minFps: number; level: PerfLevel }[] = [
  { minFps: 54, level: 0 },
  { minFps: 42, level: 1 },
  { minFps: 30, level: 2 },
  { minFps: 22, level: 3 },
  { minFps: 0, level: 4 },
];

let calibT = 0;
let calibDone = false;

/**
 * À appeler chaque frame tant que le jeu n'est pas lancé. Une fois le palier
 * initial appliqué, délègue au moniteur normal : une dégradation qui
 * s'aggrave sur l'écran de démarrage est traitée sans attendre l'embarquement.
 */
export function updatePerfCalibration(rawDt: number): void {
  if (calibDone) {
    updatePerfMonitor(rawDt);
    return;
  }
  if (rawDt <= 0 || rawDt > 2) return;
  calibT += rawDt;
  if (calibT <= CALIB_SETTLE) return;
  fpsEma += (1 / rawDt - fpsEma) * Math.min(1, rawDt / 0.5);
  if (calibT < CALIB_SETTLE + CALIB_WINDOW) return;
  calibDone = true;
  const target = CALIB_LEVELS.find((c) => fpsEma >= c.minFps)?.level ?? MAX_PERF_LEVEL;
  if (target > perfLevel()) {
    graceT = CHANGE_GRACE; // laisser le nouveau palier faire effet avant de rejuger
    usePerf.setState({ level: target });
    console.info(`[perf] Calibrage avant départ (~${Math.round(fpsEma)} fps) → palier de qualité ${target}/${MAX_PERF_LEVEL}`);
  }
}

export function updatePerfMonitor(rawDt: number): void {
  if (rawDt <= 0) return;
  // Au-delà de 2 s : veille machine ou onglet gelé, pas du lag de rendu.
  // (La frame de reprise d'onglet est déjà écartée en amont par Engine.)
  // En dessous, même énorme, c'est une vraie frame lente : elle doit compter,
  // c'est précisément le cas où l'allègement est le plus nécessaire.
  if (rawDt > 2) return;
  // Poids plafonné à 0,6 : un unique à-coup (recompilation de shaders après
  // un changement de palier, GC) ne doit pas écraser l'EMA d'un seul coup.
  fpsEma += (1 / rawDt - fpsEma) * Math.min(0.6, rawDt / 0.5);

  if (graceT > 0) {
    graceT = Math.max(0, graceT - rawDt);
    return;
  }
  const level = perfLevel();
  if (level >= MAX_PERF_LEVEL) return;

  if (fpsEma < LAG_FPS) lagT += rawDt;
  else if (fpsEma > RECOVER_FPS) lagT = Math.max(0, lagT - rawDt * 2);

  if (lagT >= LAG_HOLD) {
    lagT = 0;
    graceT = CHANGE_GRACE;
    const next = (level + 1) as PerfLevel;
    usePerf.setState({ level: next });
    console.info(`[perf] Lag détecté (~${Math.round(fpsEma)} fps) → palier de qualité ${next}/${MAX_PERF_LEVEL}`);
  }
}
