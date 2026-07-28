// Profil de traction / freinage type E235, isolé du cycle station.
//
// Départ : le train reste immobile quelques secondes après la fin du dwell
// (desserrage des freins), puis la traction monte progressivement (jerk
// limité) jusqu'à ~0,84 m/s² (3,0 km/h/s), qui s'essouffle au-delà de
// ~40 km/h (zone à puissance constante). 90 km/h est atteint en ~45 s.
// Freinage : application progressive, ~1,35 m/s² en service, puis desserrage
// graduel sous ~11 km/h pour un arrêt sans à-coup (~21 s depuis 90 km/h).
//
// Les mêmes équations servent à trois usages : la boucle 60 fps du cycle
// station, le repositionnement au spawn (randomizeEntry), et le mouvement de
// la rame vue depuis le quai (platformWait).

import { V_MAX } from '../data/config';
import type { Phase } from '../store';

/** Secondes immobiles en début de phase depart (desserrage des freins). */
export const DEPART_HOLD = 3.0;

const ACCEL_MAX = 0.84; // m/s²
const ACCEL_TAPER_V = 11; // m/s : au-delà, accel = ACCEL_MAX·TAPER_V/v
const BRAKE_MAX = 1.35; // m/s²
const BRAKE_MIN = 0.35; // m/s² résiduel à l'approche de l'arrêt
const BRAKE_EASE_V = 3; // m/s : desserrage progressif sous cette vitesse
const JERK_UP = 0.55; // m/s³ : montée de traction / relâchement du frein
const JERK_DOWN = 1.0; // m/s³ : application du frein / coupure de traction

// Freinage d'urgence (非常ブレーキ) : plus fort que le freinage de service et
// appliqué d'un coup — c'est la secousse qui fait l'événement.
const EMERGENCY_BRAKE = 1.7; // m/s²
const EMERGENCY_JERK = 2.4; // m/s³ : application quasi immédiate

export function accelCap(v: number): number {
  return v <= ACCEL_TAPER_V ? ACCEL_MAX : (ACCEL_MAX * ACCEL_TAPER_V) / v;
}

export function brakeCap(v: number): number {
  return BRAKE_MIN + (BRAKE_MAX - BRAKE_MIN) * Math.min(1, v / BRAKE_EASE_V);
}

// L'urgence garde presque toute sa force jusqu'à l'arrêt : léger desserrage
// sous 2 m/s seulement, pour ne pas diverger numériquement à v≈0.
export function emergencyBrakeCap(v: number): number {
  return Math.max(0.5, EMERGENCY_BRAKE * Math.min(1, v / 2));
}

export interface TrainState {
  v: number;
  a: number;
  d: number;
}

/** Un pas d'intégration du profil. */
export function stepTrain(state: TrainState, target: number, dt: number, emergency = false): void {
  let aTarget = 0;
  if (state.v < target - 0.01) {
    // Approche douce de la vitesse cible : la traction se relâche d'elle-même.
    aTarget = Math.min(accelCap(state.v), (target - state.v) / 1.2);
  } else if (state.v > target + 0.001) {
    aTarget = emergency ? -emergencyBrakeCap(state.v) : -brakeCap(state.v);
  }
  const da = aTarget - state.a;
  const lim = da > 0 ? JERK_UP * dt : -(emergency ? EMERGENCY_JERK : JERK_DOWN) * dt;
  state.a += Math.abs(da) < Math.abs(lim) ? da : lim;
  const before = state.v;
  state.v = Math.max(0, Math.min(V_MAX, state.v + state.a * dt));
  if (state.v === 0 || state.v === V_MAX) state.a = dt > 0 ? (state.v - before) / dt : 0;
  state.d += state.v * dt;
}

/**
 * Intègre le profil sur `span` secondes par sous-pas de 0,1 s max : un dt de
 * rattrapage (onglet lent) reste stable.
 */
export function integrateTrain(
  state: TrainState,
  target: number,
  span: number,
  emergency = false,
): void {
  for (let left = span; left > 1e-6; left -= 0.1) {
    stepTrain(state, target, Math.min(0.1, left), emergency);
  }
}

/** Vitesse cible de la phase courante (0 pendant le hold de départ). */
export function phaseTarget(phase: Phase, t: number): number {
  if (phase === 'cruise') return V_MAX;
  if (phase === 'depart') return t < DEPART_HOLD ? 0 : V_MAX;
  return 0;
}
