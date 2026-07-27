// Qualité adaptative : surveille le rythme réel des frames et, quand le
// navigateur ne suit pas, dégrade la scène par paliers successifs :
//   palier 1 — moins de passagers (rame et quai) ;
//   palier 2 — détails de lumière en moins (occlusion ambiante coupée,
//              ombres du soleil réduites, néons du wagon espacés) ;
//   palier 3 — encore moins de passagers, ombres du soleil coupées et
//              résolution de rendu plafonnée.
// On ne remonte jamais de palier : réaugmenter la charge referait laguer et
// l'aller-retour serait plus visible qu'une qualité stable un cran en dessous.

import { create } from 'zustand';

export type PerfLevel = 0 | 1 | 2 | 3;

export const MAX_PERF_LEVEL: PerfLevel = 3;

/** Part des passagers conservée à chaque palier (rame et foule du quai). */
const PAX_SCALE: Record<PerfLevel, number> = { 0: 1, 1: 0.7, 2: 0.7, 3: 0.5 };

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
    __perfDebug: () => ({ fpsEma, lagT, graceT, level: perfLevel() }),
  });
}

export function updatePerfMonitor(rawDt: number): void {
  if (rawDt <= 0) return;
  // Au-delà de 2 s : veille machine ou onglet gelé, pas du lag de rendu.
  // (La frame de reprise d'onglet est déjà écartée en amont par Engine.)
  // En dessous, même énorme, c'est une vraie frame lente : elle doit compter,
  // c'est précisément le cas où l'allègement est le plus nécessaire.
  if (rawDt > 2) return;
  fpsEma += (1 / rawDt - fpsEma) * Math.min(1, rawDt / 0.5);

  if (graceT > 0) {
    graceT -= rawDt;
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
