// Machine à états du cycle station : cruise → brake → dwell → depart, avec
// timing quasi réel (~2 min par station). Déclenche annonces, carillons,
// mélodies et échanges de passagers aux bons instants.

import { CONFIG, V_MAX } from '../data/config';
import {
  ENABLE_DEPARTURE_MELODY_CLIPS,
  innerMainMelodyPlatforms,
  outerMainMelodyPlatforms,
  SESERAGI_PLATFORMS,
} from '../data/melodies';
import { DOOR_SIDE, STATIONS } from '../data/stations';
import {
  EMERGENCY_REASONS,
  approachSequence,
  departureSequence,
  doorsClosingAnnouncement,
  emergencyBrakeAnnouncement,
  emergencyResumeAnnouncement,
  emergencyStopAnnouncement,
  emergencyWaitAnnouncement,
} from '../data/announcements';
import { useStore, type Phase } from '../store';
import { advanceClock, runtime } from './runtime';
import {
  randomizeDoorTimings,
  seedDoorMotion,
  setPsdDoors,
  setTrainDoors,
  stationTimings,
} from './doorMotion';
import * as audio from './audioEngine';
import { cancelSpeech, say } from './speech';
import { exchangePassengers } from './passengers';
import { seedPlatformPresence } from './platformPresence';
import { clearPlatformCrowd, seedPlatformCrowd } from './platformCrowd';
import {
  cancelDepartureMelody,
  clearDepartureBlockers,
  isDepartureBlocked,
  resetMelodyDepartureGuard,
} from './departureSequence';

const fired = new Set<string>();
let lastJointDistance = 0;

// Prochain petit événement sonore de course (temps de phase cruise), -1 = aucun.
let nextRunSoundAt = -1;

function scheduleNextRunSound(from: number): void {
  nextRunSoundAt = from + 14 + Math.random() * 22;
}

// --- Arrêt d'urgence (急停車) -------------------------------------------
// Très rare : tiré au sort à chaque entrée en cruise, déclenché en pleine
// course. Le train freine en urgence, reste immobilisé 1 à 5 min avec les
// annonces conducteur, puis repart. Le chrono de phase est avancé au prorata
// de la vitesse pendant tout l'événement : gelé à l'arrêt, il ne consomme que
// l'équivalent de la distance réellement parcourue — la gare suivante arrive
// donc au bon moment après la reprise.
const EMERGENCY_PROBABILITY = 0.015; // ~1 station sur 67, soit ~1 fois / 2 h
const EMERGENCY_HOLD_MIN = 60; // s
const EMERGENCY_HOLD_MAX = 300; // s

// Instant de déclenchement dans la phase cruise courante, -1 = aucun.
let emergencyAt = -1;

/** Déclenche l'arrêt d'urgence (aussi exposé en dev : __emergencyStop()). */
export function beginEmergencyStop(): void {
  const em = runtime.emergencyStop;
  if (em.stage !== 'none') return;
  if (useStore.getState().phase !== 'cruise') return;
  em.stage = 'braking';
  em.t = 0;
  em.holdFor = EMERGENCY_HOLD_MIN + Math.random() * (EMERGENCY_HOLD_MAX - EMERGENCY_HOLD_MIN);
  em.reason = Math.floor(Math.random() * EMERGENCY_REASONS.length);
  // L'urgence coupe l'annonce en cours, comme en vrai.
  cancelSpeech();
  say(emergencyBrakeAnnouncement());
  audio.brakeApply();
  audio.flangeSqueal(0.8);
}

// Étapes de l'arrêt d'urgence, appelées chaque frame tant qu'il est actif.
// Les événements one-shot passent par `fired` : la phase cruise n'étant pas
// quittée, les clés survivent à tout l'événement.
function updateEmergencyStop(dt: number): void {
  const em = runtime.emergencyStop;
  em.t += dt;
  switch (em.stage) {
    case 'braking':
      if (runtime.speed <= 0.01) {
        runtime.speed = 0;
        runtime.accel = 0;
        em.stage = 'stopped';
        em.t = 0;
        audio.stopSettle();
      }
      break;
    case 'stopped':
      // Annonce conducteur ~4 s après l'immobilisation.
      once('em-stopped', em.t >= 4, () => say(emergencyStopAnnouncement(em.reason)));
      // Rappel d'attente à mi-arrêt, seulement si l'arrêt se prolonge.
      once('em-wait', em.holdFor >= 160 && em.t >= em.holdFor * 0.55, () =>
        say(emergencyWaitAnnouncement()),
      );
      // Annonce de reprise, puis desserrage et redémarrage.
      once('em-resume', em.t >= em.holdFor - 12, () => say(emergencyResumeAnnouncement()));
      if (em.t >= em.holdFor) {
        em.stage = 'resuming';
        em.t = 0;
        audio.brakeRelease();
      }
      break;
    case 'resuming':
      if (runtime.speed >= V_MAX * 0.98) {
        em.stage = 'none';
        em.t = 0;
        scheduleNextRunSound(runtime.phaseT + 8);
      }
      break;
  }
}

// --- Profil de traction / freinage type E235 ---------------------------
// Départ : le train reste immobile quelques secondes après la fin du dwell
// (desserrage des freins), puis la traction monte progressivement (jerk
// limité) jusqu'à ~0,84 m/s² (3,0 km/h/s), qui s'essouffle au-delà de
// ~40 km/h (zone à puissance constante). 90 km/h est atteint en ~45 s.
// Freinage : application progressive, ~1,35 m/s² en service, puis desserrage
// graduel sous ~11 km/h pour un arrêt sans à-coup (~21 s depuis 90 km/h).
const DEPART_HOLD = 3.0; // s immobile en début de phase depart
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

function accelCap(v: number): number {
  return v <= ACCEL_TAPER_V ? ACCEL_MAX : (ACCEL_MAX * ACCEL_TAPER_V) / v;
}

function brakeCap(v: number): number {
  return BRAKE_MIN + (BRAKE_MAX - BRAKE_MIN) * Math.min(1, v / BRAKE_EASE_V);
}

// L'urgence garde presque toute sa force jusqu'à l'arrêt : léger desserrage
// sous 2 m/s seulement, pour ne pas diverger numériquement à v≈0.
function emergencyBrakeCap(v: number): number {
  return Math.max(0.5, EMERGENCY_BRAKE * Math.min(1, v / 2));
}

// Un pas d'intégration du profil : mêmes équations pour la boucle 60 fps
// (updateCycle) et le repositionnement au spawn (speedFor).
function stepTrain(
  state: { v: number; a: number; d: number },
  target: number,
  dt: number,
  emergency = false,
): void {
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

/** Vitesse cible de la phase courante (0 pendant le hold de départ). */
function phaseTarget(phase: Phase, t: number): number {
  if (phase === 'cruise') return V_MAX;
  if (phase === 'depart') return t < DEPART_HOLD ? 0 : V_MAX;
  return 0;
}

/** Durée des clips originaux (s), imprimée par scripts/melodies-gen.py. */
const INNER_MAIN_MELODY_SECS = 8.6;
const OUTER_MAIN_MELODY_SECS = 9.1;
const OSAKI_INNER_SECONDARY_MELODY_SECS = 8.8;
const OSAKI_OUTER_SECONDARY_MELODY_SECS = 8.3;
const KOMAGOME_OUTER_SAKURA_A_SECS = 13.6;
const KOMAGOME_INNER_SAKURA_V2_SECS = 13.4;
const UGUISUDANI_INNER_HARU_TREMOLO_SECS = 9.4;
const SESERAGI_MELODY_SECS = 8.1;
const TAKADANOBABA_OUTER_ATOM_A_SECS = 6.8;
const TAKADANOBABA_INNER_ATOM_B_SECS = 6.4;
const EBISU_INNER_THIRD_MAN_F_SECS = 11.2;
const TAKANAWA_GATEWAY_INNER_GLORIOUS_A_SECS = 10.7;
const TAKANAWA_GATEWAY_OUTER_GLORIOUS_B_SECS = 10.2;
const KANDA_OUTER_MONDAMIN_A_SECS = 8.0;
const KANDA_INNER_MONDAMIN_B_SECS = 7.6;
const IKEBUKURO_INNER_BIC_CAMERA_A_SECS = 8.0;
const IKEBUKURO_INNER_BIC_CAMERA_B_SECS = 7.3;
/** Marge entre fin de mélodie et annonce de fermeture. */
const MELODY_TO_ANNOUNCE_GAP = 1.5;
/**
 * Avance de l'annonce de fermeture sur la fin du dwell : les clips ja + en
 * durent ~6,4 s à eux deux — l'anglais doit être terminé avant que la rame ne
 * s'ébranle (fin du dwell + DEPART_HOLD).
 */
const CLOSE_ANNOUNCE_LEAD = 7.0;
/** Avance de la fermeture des portes sur la fin du dwell. */
const DOORS_CLOSE_LEAD = 4.0;

function melodyBudgetSeconds(stationIndex: number): number {
  // Sans clips (flag coupé) : budget de la synthèse Tone.js uniquement.
  if (!ENABLE_DEPARTURE_MELODY_CLIPS) return 6.5;
  const jy = STATIONS[stationIndex]?.jy;
  if (!jy) return 6.5;
  const dir = useStore.getState().loopDirection;
  if (jy === 'JY24' && runtime.useAlternativePlatform) {
    if (dir === 'inner') return OSAKI_INNER_SECONDARY_MELODY_SECS;
    if (dir === 'outer') return OSAKI_OUTER_SECONDARY_MELODY_SECS;
  }
  if (jy === 'JY13' && dir === 'inner') {
    if (runtime.useAlternativePlatform) return IKEBUKURO_INNER_BIC_CAMERA_A_SECS;
    return IKEBUKURO_INNER_BIC_CAMERA_B_SECS;
  }
  if (jy === 'JY10') {
    if (dir === 'outer') return KOMAGOME_OUTER_SAKURA_A_SECS;
    if (dir === 'inner') return KOMAGOME_INNER_SAKURA_V2_SECS;
  }
  if (jy === 'JY06' && dir === 'inner') return UGUISUDANI_INNER_HARU_TREMOLO_SECS;
  if (jy === 'JY15') {
    if (dir === 'outer') return TAKADANOBABA_OUTER_ATOM_A_SECS;
    if (dir === 'inner') return TAKADANOBABA_INNER_ATOM_B_SECS;
  }
  if (jy === 'JY21' && dir === 'inner') return EBISU_INNER_THIRD_MAN_F_SECS;
  if (jy === 'JY26' && dir === 'inner') return TAKANAWA_GATEWAY_INNER_GLORIOUS_A_SECS;
  if (jy === 'JY26' && dir === 'outer') return TAKANAWA_GATEWAY_OUTER_GLORIOUS_B_SECS;
  if (jy === 'JY02' && dir === 'outer') return KANDA_OUTER_MONDAMIN_A_SECS;
  if (jy === 'JY02' && dir === 'inner') return KANDA_INNER_MONDAMIN_B_SECS;
  if (dir === 'outer' && SESERAGI_PLATFORMS[jy]) return SESERAGI_MELODY_SECS;
  if (dir === 'outer' && outerMainMelodyPlatforms[jy]) return OUTER_MAIN_MELODY_SECS;
  if (dir === 'inner' && innerMainMelodyPlatforms[jy]) return INNER_MAIN_MELODY_SECS;
  return 6.5;
}

/** Dwell assez long pour laisser finir la 発車メロディ avant l'annonce. */
function dwellDuration(stationIndex: number): number {
  const budget = melodyBudgetSeconds(stationIndex);
  // ~2 s après ouverture pour l'échange + mélodie + marge + annonce complète.
  return Math.max(CONFIG.dwellTime, 2 + budget + MELODY_TO_ANNOUNCE_GAP + CLOSE_ANNOUNCE_LEAD);
}

function melodyStartAt(stationIndex: number, dwell: number): number {
  const budget = melodyBudgetSeconds(stationIndex);
  return Math.max(2, dwell - CLOSE_ANNOUNCE_LEAD - MELODY_TO_ANNOUNCE_GAP - budget);
}

const PHASE_ORDER = [
  { phase: 'cruise' as const, dur: () => CONFIG.cruiseTime },
  { phase: 'brake' as const, dur: () => CONFIG.brakeTime },
  { phase: 'dwell' as const, dur: () => dwellDuration(useStore.getState().index) },
  { phase: 'depart' as const, dur: () => CONFIG.departTime },
];

function once(key: string, condition: boolean, fn: () => void): void {
  if (condition && !fired.has(key)) {
    fired.add(key);
    fn();
  }
}

function enterPhase(phase: Phase): void {
  useStore.getState().setPhase(phase);
  runtime.phaseT = 0;
  fired.clear();
  if (phase === 'dwell') {
    runtime.stopSequence += 1;
    clearDepartureBlockers();
  }
  if (phase === 'depart') {
    resetMelodyDepartureGuard();
    // Le quai glisse désormais avec la distance réellement parcourue.
    runtime.departStartDist = runtime.distance;
  }
  if (phase === 'cruise') scheduleNextRunSound(6);
  if (phase !== 'dwell') cancelDepartureMelody();
}

// État du train (vitesse, accélération, distance) au temps t d'une phase,
// par intégration du même profil que la boucle : sert au spawn en cours de
// trajet (randomizeEntry).
function simulatePhaseState(phase: Phase, t: number): { v: number; a: number; d: number } {
  const state = { v: 0, a: 0, d: 0 };
  if (phase === 'dwell') return state;
  const dt = 0.05;
  if (phase === 'brake') {
    state.v = V_MAX;
    for (let x = 0; x < t; x += dt) stepTrain(state, 0, Math.min(dt, t - x));
    return state;
  }
  const departSpan = phase === 'depart' ? t : CONFIG.departTime;
  for (let x = 0; x < departSpan; x += dt) {
    stepTrain(state, phaseTarget('depart', x), Math.min(dt, departSpan - x));
  }
  if (phase === 'cruise') {
    for (let x = 0; x < t; x += dt) stepTrain(state, V_MAX, Math.min(dt, t - x));
  }
  return state;
}

// Vitesse cohérente avec le profil accélération / freinage du cycle.
function speedFor(phase: Phase, t: number): number {
  return simulatePhaseState(phase, t).v;
}

function seedDoorsForDwell(t: number, stationIndex: number): void {
  randomizeDoorTimings();
  const dwell = dwellDuration(stationIndex);
  const openAt = 0.4;
  const closeAt = dwell - DOORS_CLOSE_LEAD;
  const psdOpenAt = openAt + stationTimings.psdOpenDelay;
  const psdCloseAt = closeAt + stationTimings.psdCloseDelay;

  let trainTarget: 0 | 1 = 0;
  let trainT = 999;
  let psdTarget: 0 | 1 = 0;
  let psdT = 999;

  if (t > openAt && t < closeAt) {
    trainTarget = 1;
    trainT = t - openAt;
  } else if (t >= closeAt) {
    trainTarget = 0;
    trainT = t - closeAt;
  }

  if (t > psdOpenAt && t < psdCloseAt) {
    psdTarget = 1;
    psdT = t - psdOpenAt;
  } else if (t >= psdCloseAt) {
    psdTarget = 0;
    psdT = t - psdCloseAt;
  }

  seedDoorMotion(trainTarget, trainT, psdTarget, psdT);
}

// Marque comme déjà joués les événements dont l'instant est passé, pour ne
// pas les redéclencher la première frame après un spawn au milieu d'une phase.
function seedFired(phase: Phase, t: number, stationIndex: number): void {
  fired.clear();
  if (phase === 'cruise') {
    fired.add('doorside');
    fired.add('crowd-clear');
    // Pas d'arrêt d'urgence sur la toute première course après l'embarquement.
    fired.add('emergency-roll');
    if (t > 0.6) fired.add('announce-depart');
  } else if (phase === 'brake') {
    fired.add('door-timings');
    fired.add('brake-apply');
    fired.add('jingle');
    fired.add('crowd-seed');
    if (t > 0.8) fired.add('announce-soon');
    if (speedFor('brake', t) <= 0.01) fired.add('stop-settle');
  } else if (phase === 'dwell') {
    const dwell = dwellDuration(stationIndex);
    if (t > 0.4) fired.add('doors-open');
    if (t > 0.4 + stationTimings.psdOpenDelay) fired.add('psd-open');
    if (t > 1.6) fired.add('exchange');
    if (t >= melodyStartAt(stationIndex, dwell)) fired.add('melody');
    if (t >= dwell - CLOSE_ANNOUNCE_LEAD) fired.add('announce-close');
    if (t >= dwell - DOORS_CLOSE_LEAD) fired.add('doors-close');
    if (t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay) fired.add('psd-close');
  } else if (phase === 'depart') {
    fired.add('advance');
    if (t >= DEPART_HOLD - 1.2) fired.add('brake-release');
  }
}

// Point d'entrée aléatoire sur la boucle : phase, progression, vitesse, portes.
// À appeler avant start(), une fois l'audio initialisé.
export function randomizeEntry(): void {
  const station = Math.floor(Math.random() * 30);
  // Pré-positionne l'index pour que dwellDuration() voie la bonne gare.
  useStore.getState().setIndex(station);

  const total = PHASE_ORDER.reduce((sum, p) => sum + p.dur(), 0);
  let r = Math.random() * total;
  let phase: Phase = 'cruise';
  let dur: number = CONFIG.cruiseTime;
  for (const p of PHASE_ORDER) {
    const d = p.dur();
    if (r < d) {
      phase = p.phase;
      dur = d;
      break;
    }
    r -= d;
  }

  // Évite de spawner pile à la bascule de phase.
  const phaseT = Math.random() * Math.max(0.05, dur - 0.2);
  // En depart, l'index a déjà avancé vers la gare suivante.
  const index = phase === 'depart' ? (station + 1) % 30 : station;
  const doorStation = phase === 'depart' ? station : index;
  const doorSide = DOOR_SIDE[doorStation];
  const sim = simulatePhaseState(phase, phaseT);

  const store = useStore.getState();
  store.setPhase(phase);
  store.setIndex(index);
  store.setDoorSide(doorSide);
  audio.setPlatformSide(doorSide);

  emergencyAt = -1;
  runtime.phaseT = phaseT;
  runtime.speed = sim.v;
  runtime.accel = sim.a;
  runtime.distance = Math.random() * 8000;
  // En depart, le quai est déjà parti de la distance simulée depuis l'arrêt.
  runtime.departStartDist = runtime.distance - (phase === 'depart' ? sim.d : 0);
  runtime.swayTime = Math.random() * 40;
  runtime.sway = 0;
  if (phase === 'dwell') runtime.stopSequence += 1;
  if (phase === 'cruise') scheduleNextRunSound(phaseT + 4);
  lastJointDistance = runtime.distance;

  if (phase === 'brake') randomizeDoorTimings();
  if (phase === 'dwell') seedDoorsForDwell(phaseT, index);
  else seedDoorMotion(0, 999, 0, 999);

  seedPlatformPresence(phase, phaseT);
  if (phase === 'brake' || phase === 'dwell') seedPlatformCrowd(index);
  else if (phase === 'depart') seedPlatformCrowd(doorStation);
  else clearPlatformCrowd();

  seedFired(phase, phaseT, doorStation);
}


export function updateCycle(dt: number): void {
  const s = useStore.getState();
  if (!s.started) return;

  // Pendant un arrêt d'urgence, le chrono de phase avance au prorata de la
  // vitesse : gelé à l'arrêt, cohérent avec la distance pendant freinage et
  // reprise. L'horloge murale, elle, continue — c'est le retard qui se crée.
  const em = runtime.emergencyStop;
  runtime.phaseT += em.stage === 'none' ? dt : dt * (runtime.speed / V_MAX);
  advanceClock(dt);

  // --- Physique du train : profil jerk-limité type E235 ---
  // Sous-pas de 0,1 s max : un dt de rattrapage (onglet lent) resterait stable.
  const emergencyBraking = em.stage === 'braking' || em.stage === 'stopped';
  const target = emergencyBraking ? 0 : phaseTarget(s.phase, runtime.phaseT);
  const state = { v: runtime.speed, a: runtime.accel, d: runtime.distance };
  for (let left = dt; left > 1e-6; left -= 0.1)
    stepTrain(state, target, Math.min(0.1, left), em.stage === 'braking');
  runtime.speed = state.v;
  runtime.accel = state.a;
  runtime.distance = state.d;

  // --- Balancement du wagon, proportionnel à la vitesse ---
  runtime.swayTime += dt;
  const s01 = runtime.speed / V_MAX;
  runtime.sway =
    (Math.sin(runtime.swayTime * 0.8) + 0.5 * Math.sin(runtime.swayTime * 1.73)) * 0.55 * s01;

  // --- Joints de rail : clac-clac tous les ~23 m ---
  // (L'animation des portes est pilotée par Engine avec le dt physique.)
  if (runtime.distance - lastJointDistance > CONFIG.railJointGap && runtime.speed > 1.5) {
    lastJointDistance = runtime.distance;
    audio.railClack(s01);
  }

  // --- Arrêt d'urgence actif : la machine à phases attend la fin. ---
  if (em.stage !== 'none') {
    updateEmergencyStop(dt);
    return;
  }

  // --- Phases ---
  // (La présence spatiale du quai est pilotée après updateSegmentEnv, dans
  // Engine — plus de fondu d'opacité à basse vitesse.)
  const t = runtime.phaseT;
  switch (s.phase) {
    case 'cruise': {
      once('doorside', true, () => {
        s.setDoorSide(DOOR_SIDE[s.index]);
        // Les haut-parleurs du quai passent du côté qui s'ouvrira.
        audio.setPlatformSide(DOOR_SIDE[s.index]);
      });
      once('crowd-clear', true, () => clearPlatformCrowd());
      // Séquence JR départ : 列車案内? → 次駅 → 乗換? → 案内(0–2).
      once('announce-depart', t > 0.6, () =>
        say(departureSequence(s.index, DOOR_SIDE[s.index])),
      );
      // Arrêt d'urgence : tirage rare à l'entrée en cruise, déclenchement en
      // pleine course — assez tôt pour avoir le temps de repartir avant la gare.
      once('emergency-roll', true, () => {
        emergencyAt = Math.random() < EMERGENCY_PROBABILITY ? 8 + Math.random() * 20 : -1;
      });
      if (emergencyAt >= 0 && t >= emergencyAt) {
        emergencyAt = -1;
        beginEmergencyStop();
        break;
      }
      // Petits événements sonores de course, rares et discrets : crissement
      // de boudin dans une courbe, purge d'air sous le plancher.
      if (nextRunSoundAt >= 0 && t >= nextRunSoundAt) {
        if (s01 > 0.5) {
          if (Math.random() < 0.6) audio.flangeSqueal(0.35 + Math.random() * 0.5);
          else audio.airCompressorPurge();
        }
        scheduleNextRunSound(t);
      }
      if (t >= CONFIG.cruiseTime) enterPhase('brake');
      break;
    }
    case 'brake': {
      // Nouveau tirage des retards de portes pour cette gare.
      once('door-timings', true, () => randomizeDoorTimings());
      // Mise en action des freins : purge d'air au tout début du freinage.
      once('brake-apply', true, () => audio.brakeApply());
      once('jingle', true, () => audio.arrivalJingle());
      // Foule déjà en place dès le début du freinage : on la voit arriver
      // avec le quai, opaque, le long des vitres.
      once('crowd-seed', true, () => seedPlatformCrowd(s.index));
      // Séquence JR approche : まもなく(+portes) → 乗換?
      once('announce-soon', t > 0.8, () =>
        say(approachSequence(s.index, DOOR_SIDE[s.index])),
      );
      // Immobilisation : léger tassement de caisse + serrage à l'arrêt.
      once('stop-settle', t > 1 && runtime.speed <= 0.01, () => audio.stopSettle());
      if (t >= CONFIG.brakeTime) {
        runtime.speed = 0;
        runtime.accel = 0;
        enterPhase('dwell');
      }
      break;
    }
    case 'dwell': {
      const dwell = dwellDuration(s.index);
      once('doors-open', t > 0.4, () => {
        setTrainDoors(1);
        audio.doorOpenChime();
      });
      // Les portes palières s'ouvrent avec un temps de retard sur la rame,
      // variable selon la gare.
      once('psd-open', t > 0.4 + stationTimings.psdOpenDelay, () => setPsdDoors(1));
      once('exchange', t > 1.6, () => exchangePassengers(s.doorSide));
      // Séquence de départ fidèle : la mélodie (発車メロディ) démarre portes ouvertes
      // et se termine AVANT l'annonce de fermeture ; puis carillon, puis fermeture.
      once('melody', t >= melodyStartAt(s.index, dwell), () => audio.departureMelody(s.index));

      // Porte bloquée / maintien / signal / urgence : stop mélodie, reste à quai.
      if (isDepartureBlocked()) {
        cancelDepartureMelody();
        if (runtime.doorTarget !== 1) setTrainDoors(1);
        if (runtime.psdTarget !== 1) setPsdDoors(1);
        // On retient l'horloge avant la séquence de fermeture et on réarme
        // ses événements : au déblocage, annonce → fermeture → départ se
        // rejouent dans l'ordre au lieu de partir tous dans la même frame.
        runtime.phaseT = Math.min(runtime.phaseT, dwell - CLOSE_ANNOUNCE_LEAD - 1);
        fired.delete('announce-close');
        fired.delete('doors-close');
        fired.delete('psd-close');
        break;
      }

      once('announce-close', t >= dwell - CLOSE_ANNOUNCE_LEAD, () =>
        say(doorsClosingAnnouncement()),
      );
      once('doors-close', t >= dwell - DOORS_CLOSE_LEAD, () => {
        setTrainDoors(0);
        audio.doorCloseChime();
      });
      // Puis le quai referme ses portes, nettement après la rame, avec un
      // décalage lui aussi variable selon la gare.
      once('psd-close', t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay, () =>
        setPsdDoors(0),
      );
      if (t >= dwell) enterPhase('depart');
      break;
    }
    case 'depart': {
      once('advance', true, () => {
        const dir = useStore.getState().loopDirection;
        const next =
          dir === 'outer' ? (s.index - 1 + 30) % 30 : (s.index + 1) % 30;
        s.setIndex(next);
      });
      // Desserrage des freins juste avant la mise en mouvement.
      once('brake-release', t >= DEPART_HOLD - 1.2, () => audio.brakeRelease());
      if (t >= CONFIG.departTime) enterPhase('cruise');
      break;
    }
  }
}

// Outils dev, dans la console du navigateur : __emergencyStop() déclenche un
// arrêt d'urgence, __runtime donne accès à l'état continu (vitesse, phase…).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__emergencyStop = beginEmergencyStop;
  (window as unknown as Record<string, unknown>).__runtime = runtime;
}
