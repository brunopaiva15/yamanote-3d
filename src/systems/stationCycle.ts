// Machine à états du cycle station : cruise → brake → dwell → depart, avec
// timing quasi réel (~2 min par station). Déclenche annonces, carillons,
// mélodies et échanges de passagers aux bons instants.

import { CONFIG, V_MAX } from '../data/config';
import { DOOR_SIDE } from '../data/stations';
import {
  approachSequence,
  departureSequence,
  doorsClosingAnnouncement,
} from '../data/announcements';
import { useStore, type Phase } from '../store';
import { advanceClock, runtime } from './runtime';
import {
  randomizeDoorTimings,
  seedDoorMotion,
  setPsdDoors,
  setTrainDoors,
  stationTimings,
  updateDoorMotion,
} from './doorMotion';
import * as audio from './audioEngine';
import { say } from './speech';
import { exchangePassengers } from './passengers';
import { seedPlatformPresence } from './platformPresence';
import { clearPlatformCrowd, seedPlatformCrowd } from './platformCrowd';

const fired = new Set<string>();
let lastJointDistance = 0;

const ACCEL_RATE = 1.15; // m/s² — doit rester aligné avec updateCycle
const PHASE_ORDER = [
  { phase: 'cruise' as const, dur: () => CONFIG.cruiseTime },
  { phase: 'brake' as const, dur: () => CONFIG.brakeTime },
  { phase: 'dwell' as const, dur: () => CONFIG.dwellTime },
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
}

function brakeRate(): number {
  return (V_MAX / CONFIG.brakeTime) * 1.18;
}

// Vitesse cohérente avec le profil accélération / freinage du cycle.
function speedFor(phase: Phase, t: number): number {
  if (phase === 'dwell') return 0;
  if (phase === 'brake') return Math.max(0, V_MAX - brakeRate() * t);
  if (phase === 'depart') return Math.min(V_MAX, ACCEL_RATE * t);
  // Cruise : on arrive déjà lancé après la phase depart.
  const afterDepart = Math.min(V_MAX, ACCEL_RATE * CONFIG.departTime);
  return Math.min(V_MAX, afterDepart + ACCEL_RATE * t);
}

function seedDoorsForDwell(t: number): void {
  randomizeDoorTimings();
  const openAt = 0.4;
  const closeAt = CONFIG.dwellTime - 1.8;
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
function seedFired(phase: Phase, t: number): void {
  fired.clear();
  if (phase === 'cruise') {
    fired.add('doorside');
    fired.add('crowd-clear');
    if (t > 0.6) fired.add('announce-depart');
  } else if (phase === 'brake') {
    fired.add('door-timings');
    fired.add('jingle');
    fired.add('crowd-seed');
    if (t > 0.8) fired.add('announce-soon');
  } else if (phase === 'dwell') {
    if (t > 0.4) fired.add('doors-open');
    if (t > 0.4 + stationTimings.psdOpenDelay) fired.add('psd-open');
    if (t > 1.6) fired.add('exchange');
    if (t >= CONFIG.dwellTime - 13) fired.add('melody');
    if (t >= CONFIG.dwellTime - 3.5) fired.add('announce-close');
    if (t >= CONFIG.dwellTime - 1.8) fired.add('doors-close');
    if (t >= CONFIG.dwellTime - 1.8 + stationTimings.psdCloseDelay) fired.add('psd-close');
  } else if (phase === 'depart') {
    fired.add('advance');
  }
}

// Point d'entrée aléatoire sur la boucle : phase, progression, vitesse, portes.
// À appeler avant start(), une fois l'audio initialisé.
export function randomizeEntry(): void {
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
  const station = Math.floor(Math.random() * 30);
  // En depart, l'index a déjà avancé vers la gare suivante.
  const index = phase === 'depart' ? (station + 1) % 30 : station;
  const doorStation = phase === 'depart' ? station : index;
  const doorSide = DOOR_SIDE[doorStation];
  const speed = speedFor(phase, phaseT);

  const store = useStore.getState();
  store.setPhase(phase);
  store.setIndex(index);
  store.setDoorSide(doorSide);
  audio.setPlatformSide(doorSide);

  runtime.phaseT = phaseT;
  runtime.speed = speed;
  runtime.accel = 0;
  runtime.distance = Math.random() * 8000;
  runtime.swayTime = Math.random() * 40;
  runtime.sway = 0;
  lastJointDistance = runtime.distance;

  if (phase === 'brake') randomizeDoorTimings();
  if (phase === 'dwell') seedDoorsForDwell(phaseT);
  else seedDoorMotion(0, 999, 0, 999);

  seedPlatformPresence(phase, phaseT);
  if (phase === 'brake' || phase === 'dwell') seedPlatformCrowd(index);
  else if (phase === 'depart') seedPlatformCrowd(doorStation);
  else clearPlatformCrowd();

  seedFired(phase, phaseT);
}


export function updateCycle(dt: number): void {
  const s = useStore.getState();
  if (!s.started) return;

  runtime.phaseT += dt;
  advanceClock(dt);

  // --- Physique du train : approche douce de la vitesse cible ---
  const target = s.phase === 'cruise' || s.phase === 'depart' ? V_MAX : 0;
  const before = runtime.speed;
  if (runtime.speed < target) runtime.speed = Math.min(target, runtime.speed + ACCEL_RATE * dt);
  else if (runtime.speed > target) runtime.speed = Math.max(target, runtime.speed - brakeRate() * dt);
  runtime.accel = (runtime.speed - before) / dt;
  runtime.distance += runtime.speed * dt;

  // --- Balancement du wagon, proportionnel à la vitesse ---
  runtime.swayTime += dt;
  const s01 = runtime.speed / V_MAX;
  runtime.sway =
    (Math.sin(runtime.swayTime * 0.8) + 0.5 * Math.sin(runtime.swayTime * 1.73)) * 0.55 * s01;

  // --- Animation des portes (profil mécanique, rame et quai décalés) ---
  updateDoorMotion(dt);

  // --- Joints de rail : clac-clac tous les ~23 m ---
  if (runtime.distance - lastJointDistance > CONFIG.railJointGap && runtime.speed > 1.5) {
    lastJointDistance = runtime.distance;
    audio.railClack(s01);
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
      if (t >= CONFIG.cruiseTime) enterPhase('brake');
      break;
    }
    case 'brake': {
      // Nouveau tirage des retards de portes pour cette gare.
      once('door-timings', true, () => randomizeDoorTimings());
      once('jingle', true, () => audio.arrivalJingle());
      // Foule déjà en place dès le début du freinage : on la voit arriver
      // avec le quai, opaque, le long des vitres.
      once('crowd-seed', true, () => seedPlatformCrowd(s.index));
      // Séquence JR approche : まもなく(+portes) → 乗換?
      once('announce-soon', t > 0.8, () =>
        say(approachSequence(s.index, DOOR_SIDE[s.index])),
      );
      if (t >= CONFIG.brakeTime) {
        runtime.speed = 0;
        enterPhase('dwell');
      }
      break;
    }
    case 'dwell': {
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
      once('melody', t >= CONFIG.dwellTime - 13, () => audio.departureMelody(s.index));
      once('announce-close', t >= CONFIG.dwellTime - 3.5, () => say(doorsClosingAnnouncement()));
      once('doors-close', t >= CONFIG.dwellTime - 1.8, () => {
        setTrainDoors(0);
        audio.doorCloseChime();
      });
      // Puis le quai referme ses portes, nettement après la rame, avec un
      // décalage lui aussi variable selon la gare.
      once('psd-close', t >= CONFIG.dwellTime - 1.8 + stationTimings.psdCloseDelay, () => setPsdDoors(0));
      if (t >= CONFIG.dwellTime) enterPhase('depart');
      break;
    }
    case 'depart': {
      once('advance', true, () => s.setIndex((s.index + 1) % 30));
      if (t >= CONFIG.departTime) enterPhase('cruise');
      break;
    }
  }
}
