// Profil de traction / freinage type E235, isolé du cycle station.
//
// Départ : le train reste immobile quelques secondes après la fin du dwell
// (desserrage des freins), puis la traction monte progressivement (jerk
// limité) jusqu'à ~0,84 m/s² (3,0 km/h/s), qui s'essouffle au-delà de
// ~40 km/h (zone à puissance constante). 90 km/h est atteint en ~45 s.
// Freinage : application progressive, ~1,35 m/s² en service, puis desserrage
// graduel sous ~11 km/h et LÂCHER FINAL sous ~4 km/h - la rame se pose au lieu
// de s'arrêter (~23 s depuis 90 km/h, dont près de quatre secondes rien que
// pour le dernier mètre).
//
// Les mêmes équations servent à trois usages : la boucle 60 fps du cycle
// station, le repositionnement au spawn (randomizeEntry), et le mouvement de
// la rame vue depuis le quai (platformWait).

// Extension explicite : `data/config` n'a aucune dépendance et ce module non
// plus, donc Node exécute les deux tels quels - c'est ce qui rend le profil de
// freinage testable sans harnais (tests/trainPhysics.test.ts).
import { V_MAX } from '../data/config.ts';
import type { Phase } from '../store';

/** Secondes immobiles en début de phase depart (desserrage des freins). */
export const DEPART_HOLD = 3.0;

const ACCEL_MAX = 0.84; // m/s²
const ACCEL_TAPER_V = 11; // m/s : au-delà, accel = ACCEL_MAX·TAPER_V/v
const BRAKE_MAX = 1.35; // m/s²
const BRAKE_MIN = 0.45; // m/s² : palier de fin de freinage, avant le lâcher
const BRAKE_EASE_V = 3; // m/s : desserrage progressif sous cette vitesse
/**
 * Lâcher final (停止直前の緩め).
 *
 * Un train ne s'arrête pas : il se pose. Sous ~4 km/h, le conducteur (ou le
 * TASC) relâche franchement pour que la vitesse s'éteigne au lieu d'être
 * coupée - le dernier mètre se parcourt en près de quatre secondes, les dix
 * derniers centimètres à moins de 0,2 m/s. Sans ce lâcher, le profil gardait
 * 0,35 m/s² jusqu'au bout : la rame arrivait devant les portières encore à
 * 0,3 m/s et l'immobilisation se lisait comme un à-coup, exactement ce qu'un
 * arrêt réussi ne fait pas sentir.
 */
const CREEP_V = 1.2; // m/s : sous cette vitesse, le frein se relâche pour de bon
const CREEP_FLOOR = 0.18; // fraction de frein conservée à v → 0
const JERK_UP = 0.55; // m/s³ : montée de traction / relâchement du frein
const JERK_DOWN = 1.0; // m/s³ : application du frein / coupure de traction

// Freinage d'urgence (非常ブレーキ) : plus fort que le freinage de service et
// appliqué d'un coup - c'est la secousse qui fait l'événement.
const EMERGENCY_BRAKE = 1.7; // m/s²
const EMERGENCY_JERK = 2.4; // m/s³ : application quasi immédiate

// Marche sur l'élan (惰行), quand plus rien ne pousse ni ne retient : c'est
// l'état d'une rame dont la caténaire vient d'être coupée. Il ne reste que la
// résistance à l'avancement - un terme de roulement quasi constant et un terme
// aérodynamique en v². À 90 km/h la rame perd environ 0,23 m/s², soit un
// dixième d'un freinage de service : on ne la sent pas ralentir, on entend
// seulement que le moteur s'est tu.
const COAST_ROLL = 0.055; // m/s² : roulement + frottements mécaniques
const COAST_DRAG = 0.00028; // m/s² par (m/s)² : traînée aérodynamique
/**
 * Coupure de traction : brutale. Le disjoncteur s'ouvre, les moteurs cessent
 * de pousser dans l'instant - pas de relâchement progressif comme lorsqu'un
 * conducteur lève la manette.
 */
const COAST_JERK = 2.0; // m/s³

/** Décélération de la marche sur l'élan à la vitesse v. */
export function coastCap(v: number): number {
  return COAST_ROLL + COAST_DRAG * v * v;
}

/**
 * Ce qui retient (ou non) la rame pendant un pas d'intégration.
 *
 * `service` : profil normal, traction et freinage ordinaires ;
 * `emergency` : freinage d'urgence (非常ブレーキ) ;
 * `coast` : plus de traction du tout, la rame roule sur son élan.
 */
export type BrakeMode = 'service' | 'emergency' | 'coast';

export function accelCap(v: number): number {
  return v <= ACCEL_TAPER_V ? ACCEL_MAX : (ACCEL_MAX * ACCEL_TAPER_V) / v;
}

export function brakeCap(v: number): number {
  const service = BRAKE_MIN + (BRAKE_MAX - BRAKE_MIN) * Math.min(1, v / BRAKE_EASE_V);
  const creep = CREEP_FLOOR + (1 - CREEP_FLOOR) * Math.min(1, v / CREEP_V);
  return service * creep;
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
export function stepTrain(
  state: TrainState,
  target: number,
  dt: number,
  mode: BrakeMode = 'service',
): void {
  let aTarget = 0;
  if (mode === 'coast') {
    // Ni traction ni frein : la cible de vitesse ne veut plus rien dire, seule
    // la résistance à l'avancement décide. Elle garde un plancher jusqu'à
    // l'arrêt complet - une rame qui roule ne s'immobilise pas asymptotiquement,
    // elle finit par ne plus rouler.
    aTarget = state.v > 0 ? -coastCap(state.v) : 0;
  } else if (state.v < target - 0.01) {
    // Approche douce de la vitesse cible : la traction se relâche d'elle-même.
    aTarget = Math.min(accelCap(state.v), (target - state.v) / 1.2);
  } else if (state.v > target + 0.001) {
    aTarget = mode === 'emergency' ? -emergencyBrakeCap(state.v) : -brakeCap(state.v);
  }
  const da = aTarget - state.a;
  const fall = mode === 'emergency' ? EMERGENCY_JERK : mode === 'coast' ? COAST_JERK : JERK_DOWN;
  const lim = da > 0 ? JERK_UP * dt : -fall * dt;
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
  mode: BrakeMode = 'service',
): void {
  for (let left = span; left > 1e-6; left -= 0.1) {
    stepTrain(state, target, Math.min(0.1, left), mode);
  }
}

/**
 * Distance restant à parcourir avant l'immobilisation, depuis l'état (v, a).
 *
 * C'est la mesure qui place le quai à l'approche : elle décroît exactement à la
 * vitesse du train (dR/dt = −v, le profil étant déterministe à partir de l'état
 * courant) et vaut zéro pile quand la rame s'arrête. Poser le quai à −R plutôt
 * que sur une courbe de temps, c'est se donner la garantie qu'il n'y a ni
 * rattrapage ni raccord à la fin : la gare se cale d'elle-même.
 */
export function stopDistance(v: number, a: number): number {
  const state: TrainState = { v, a, d: 0 };
  for (let i = 0; i < 3000 && state.v > 1e-3; i++) stepTrain(state, 0, 0.05);
  return state.d;
}

/** Vitesse cible de la phase courante (0 pendant le hold de départ). */
export function phaseTarget(phase: Phase, t: number): number {
  if (phase === 'cruise') return V_MAX;
  if (phase === 'depart') return t < DEPART_HOLD ? 0 : V_MAX;
  return 0;
}
