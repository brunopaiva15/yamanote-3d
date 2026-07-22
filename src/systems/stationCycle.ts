// Machine à états du cycle station : cruise → brake → dwell → depart, avec
// timing quasi réel (~2 min par station). Déclenche annonces, carillons,
// mélodies et échanges de passagers aux bons instants.

import { CONFIG, V_MAX } from '../data/config';
import { DOOR_SIDE } from '../data/stations';
import {
  approachAnnouncement,
  directionAnnouncement,
  doorsClosingAnnouncement,
  generalMessage,
  isMajorHub,
  nextStationAnnouncement,
} from '../data/announcements';
import { useStore, type Phase } from '../store';
import { runtime } from './runtime';
import * as audio from './audioEngine';
import { say } from './speech';
import { exchangePassengers } from './passengers';

const fired = new Set<string>();
let lastJointDistance = 0;

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

export function fastForward(): void {
  const { phase } = useStore.getState();
  if (phase === 'cruise') {
    enterPhase('brake');
  } else if (phase === 'dwell') {
    // Sauter directement à la séquence de départ (mélodie, annonce, fermeture).
    runtime.phaseT = Math.max(runtime.phaseT, CONFIG.dwellTime - 13.05);
  } else if (phase === 'depart') {
    enterPhase('cruise');
  }
}

export function updateCycle(dt: number): void {
  const s = useStore.getState();
  if (!s.started) return;

  runtime.phaseT += dt;
  runtime.clockMin += dt / 60;

  // --- Physique du train : approche douce de la vitesse cible ---
  const target = s.phase === 'cruise' || s.phase === 'depart' ? V_MAX : 0;
  const accelRate = 1.15; // m/s²
  const brakeRate = (V_MAX / CONFIG.brakeTime) * 1.18;
  const before = runtime.speed;
  if (runtime.speed < target) runtime.speed = Math.min(target, runtime.speed + accelRate * dt);
  else if (runtime.speed > target) runtime.speed = Math.max(target, runtime.speed - brakeRate * dt);
  runtime.accel = (runtime.speed - before) / dt;
  runtime.distance += runtime.speed * dt;

  // --- Balancement du wagon, proportionnel à la vitesse ---
  runtime.swayTime += dt;
  const s01 = runtime.speed / V_MAX;
  runtime.sway =
    (Math.sin(runtime.swayTime * 0.8) + 0.5 * Math.sin(runtime.swayTime * 1.73)) * 0.55 * s01;

  // --- Animation des portes ---
  const rate = runtime.doorTarget === 1 ? dt / CONFIG.doorTime : dt / 1.2;
  if (runtime.doorOpen < runtime.doorTarget) runtime.doorOpen = Math.min(runtime.doorTarget, runtime.doorOpen + rate);
  else if (runtime.doorOpen > runtime.doorTarget) runtime.doorOpen = Math.max(runtime.doorTarget, runtime.doorOpen - rate);

  // --- Joints de rail : clac-clac tous les ~23 m ---
  if (runtime.distance - lastJointDistance > CONFIG.railJointGap && runtime.speed > 1.5) {
    lastJointDistance = runtime.distance;
    audio.railClack(s01);
  }

  // --- Fondu du quai : visible à basse vitesse hors croisière ---
  const platformTarget = s.phase !== 'cruise' && s01 < 0.3 ? 1 : 0;
  runtime.platformFade += (platformTarget - runtime.platformFade) * Math.min(1, dt * 1.6);

  // --- Phases ---
  const t = runtime.phaseT;
  switch (s.phase) {
    case 'cruise': {
      once('doorside', true, () => s.setDoorSide(DOOR_SIDE[s.index]));
      // Annonce du sens de la boucle, juste après le départ des grandes gares.
      once('announce-dir', t > 0.6 && isMajorHub((s.index - 1 + 30) % 30), () =>
        say(directionAnnouncement(s.index)),
      );
      once('announce-next', t > 1.2, () => say(nextStationAnnouncement(s.index, DOOR_SIDE[s.index])));
      // Message général de courtoisie (en rotation) toutes les 5 gares.
      once('general', t > 16 && s.index % 5 === 0, () => say(generalMessage(Math.floor(s.index / 5))));
      if (t >= CONFIG.cruiseTime) enterPhase('brake');
      break;
    }
    case 'brake': {
      once('jingle', true, () => audio.arrivalJingle());
      once('announce-soon', t > 0.8, () => say(approachAnnouncement(s.index)));
      if (t >= CONFIG.brakeTime) {
        runtime.speed = 0;
        enterPhase('dwell');
      }
      break;
    }
    case 'dwell': {
      once('doors-open', t > 0.4, () => {
        runtime.doorTarget = 1;
        audio.doorOpenChime();
      });
      once('exchange', t > 1.6, () => exchangePassengers(s.doorSide));
      // Séquence de départ fidèle : la mélodie (発車メロディ) démarre portes ouvertes
      // et se termine AVANT l'annonce de fermeture ; puis carillon, puis fermeture.
      once('melody', t >= CONFIG.dwellTime - 13, () => audio.departureMelody(s.index));
      once('announce-close', t >= CONFIG.dwellTime - 3.5, () => say(doorsClosingAnnouncement()));
      once('doors-close', t >= CONFIG.dwellTime - 1.5, () => {
        runtime.doorTarget = 0;
        audio.doorCloseChime();
      });
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
