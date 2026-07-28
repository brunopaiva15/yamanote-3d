// Attendre le prochain train, debout sur le quai.
//
// Dès que le joueur descend, le rapport s'inverse : la gare devient le repère
// fixe (runtime.distance gelé, donc tout le décor reste calé sur elle) et c'est
// la rame qui glisse le long de la voie (runtime.trainZ). Le cycle station
// habituel est court-circuité et remplacé par cette machine à états, qui tient
// son propre chrono et ne touche jamais à runtime.phaseT.
//
// La phase du store reste 'dwell' du début à la fin : le HUD dit « à quai », la
// signalétique du quai affiche la bonne gare, la toiture de hub reste en place.
// Rien de tout cela n'a besoin de savoir que le joueur est dehors.
//
// Le décor défilant vers +z, un train qui part s'en va vers les z négatifs et
// le suivant arrive depuis les z positifs.

import { CONFIG, V_MAX } from '../data/config';
import { DOOR_SIDE } from '../data/stations';
import { useStore } from '../store';
import { advanceClock, runtime } from './runtime';
import { DEPART_HOLD, integrateTrain, type TrainState } from './trainPhysics';
import { randomizeDoorTimings, setPsdDoors, setTrainDoors, stationTimings } from './doorMotion';
import * as audio from './audioEngine';
import { cancelSpeech } from './speech';
import {
  paAgentMessage,
  paAlightFirst,
  paApproach,
  paArrival,
  paDelay,
  paDoorsClosing,
  paPreAnnouncement,
  paPsdBeeps,
  paTrainEntering,
} from './stationPa';
import { exchangePassengers, seedPassengers } from './passengers';
import { crowdArrive, crowdDisperse, crowdPresentCount, crowdTarget } from './platformCrowd';
import {
  cancelDepartureMelody,
  interruptDepartureMelody,
  resetMelodyDepartureGuard,
} from './departureSequence';
import {
  CLOSE_ANNOUNCE_LEAD,
  DOORS_CLOSE_LEAD,
  MELODY_SOUNDING,
  dwellDuration,
  melodyCutAt,
  melodyStartAt,
  randomizeStopTimings,
} from './stationCycle';

/**
 * Creux entre deux rames, quai vide (s). L'intervalle complet d'un départ au
 * suivant tourne autour de deux minutes, la cadence réelle de la Yamanote aux
 * heures creuses.
 */
const HEADWAY_GAP = 60;

/** Distance au-delà de laquelle la rame qui part est hors de vue. */
const OUT_OF_SIGHT = 320;

/** Immobilisation avant ouverture des portes. */
const BERTH_SETTLE = 1.6;

export type WaitStage = 'boardable' | 'departing' | 'clear' | 'approaching' | 'berthing';

export const platformWait = {
  stage: 'boardable' as WaitStage,
  /** Chrono de l'étape courante (s). */
  t: 0,
  /** Vitesse d'attente accélérée, pour la mise au point (__platformWaitSpeed). */
  rate: 1,
  /** Distance de freinage de la rame qui arrive, calculée une fois. */
  approachDist: 0,
};

const fired = new Set<string>();
const train: TrainState = { v: 0, a: 0, d: 0 };
let lastClackDist = 0;

function once(key: string, condition: boolean, fn: () => void): void {
  if (condition && !fired.has(key)) {
    fired.add(key);
    fn();
  }
}

function enter(stage: WaitStage): void {
  platformWait.stage = stage;
  platformWait.t = 0;
  fired.clear();
}

/** Distance parcourue par une rame qui freine de la vitesse de ligne à l'arrêt. */
function brakingDistance(): number {
  const s: TrainState = { v: V_MAX, a: 0, d: 0 };
  for (let i = 0; i < 4000 && s.v > 0.01; i++) integrateTrain(s, 0, 0.05);
  return s.d;
}

/**
 * Le joueur vient de descendre : on reprend le dwell en cours là où il en est.
 * Les événements déjà joués (ouverture, échange de passagers, mélodie…) sont
 * marqués pour ne pas se rejouer.
 */
export function beginPlatformWait(): void {
  const { index } = useStore.getState();
  const t = runtime.phaseT;
  const dwell = dwellDuration(index);
  enter('boardable');
  platformWait.t = Math.min(t, dwell);
  train.v = 0;
  train.a = 0;
  train.d = 0;
  runtime.trainZ = 0;
  runtime.trainPresent = true;
  runtime.speed = 0;
  runtime.accel = 0;
  runtime.sway = 0;
  audio.setListenerOutside(true);
  // Le joueur n'est plus dans la rame : ce qu'elle avait encore à dire ne lui
  // parvient plus. Inutile de laisser la file se vider dans le vide.
  cancelSpeech('cabin');

  // Ce qui est déjà passé dans ce dwell ne doit pas se rejouer.
  if (t > 0.4) fired.add('doors-open');
  if (t > 0.4 + stationTimings.psdOpenDelay) fired.add('psd-open');
  if (t > 1.6) fired.add('exchange');
  if (t > 5) fired.add('agent-1');
  if (t > melodyStartAt(index, dwell) - 3) fired.add('agent-2');
  if (t >= melodyStartAt(index, dwell)) fired.add('melody');
  if (t >= melodyCutAt(index, dwell)) fired.add('melody-cut');
  if (t >= dwell - CLOSE_ANNOUNCE_LEAD) fired.add('announce-close');
  if (t >= dwell - DOORS_CLOSE_LEAD) fired.add('doors-close');
  if (t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay) fired.add('psd-close');
}

/** Le joueur remonte : temps de dwell déjà écoulé, pour rendre la main au cycle. */
export function boardableElapsed(): number {
  const { index } = useStore.getState();
  if (platformWait.stage !== 'boardable') return 0;
  return Math.min(platformWait.t, dwellDuration(index) - DOORS_CLOSE_LEAD - 0.5);
}

export function endPlatformWait(): void {
  audio.setListenerOutside(false);
  audio.setRollingDistance(0);
  runtime.trainZ = 0;
  runtime.trainPresent = true;
}

// --- Étapes -------------------------------------------------------------

function updateBoardable(dt: number, index: number, doorSide: 1 | -1): void {
  const dwell = dwellDuration(index);
  const t = platformWait.t;
  once('doors-open', t > 0.4, () => {
    setTrainDoors(1);
    audio.doorOpenChime();
    // L'agent de quai, dès que les vantaux s'écartent.
    paAlightFirst();
  });
  once('psd-open', t > 0.4 + stationTimings.psdOpenDelay, () => setPsdDoors(1));
  once('exchange', t > 1.6, () => exchangePassengers(doorSide));
  // Pendant que la foule monte : une consigne de plus, puis une autre juste
  // avant que la mélodie ne parte.
  once('agent-1', t > 5, () => paAgentMessage());
  once('agent-2', t > melodyStartAt(index, dwell) - 3, () => paAgentMessage(1));
  once('melody', t >= melodyStartAt(index, dwell), () =>
    audio.departureMelody(index, MELODY_SOUNDING),
  );
  // De près, la coupure du chef de train s'entend pour ce qu'elle est : la
  // mélodie se referme en pleine phrase.
  once('melody-cut', t >= melodyCutAt(index, dwell), () => interruptDepartureMelody());
  // Sur le quai, l'annonce de fermeture est celle de la GARE : elle nomme la
  // voie. Celle de la rame, on ne l'entend pas d'ici.
  once('announce-close', t >= dwell - CLOSE_ANNOUNCE_LEAD, () => paDoorsClosing(index));
  once('doors-close', t >= dwell - DOORS_CLOSE_LEAD, () => {
    setTrainDoors(0);
    audio.doorCloseChime();
  });
  once('psd-close', t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay, () => {
    setPsdDoors(0);
    paPsdBeeps();
  });
  if (t >= dwell) {
    cancelDepartureMelody();
    resetMelodyDepartureGuard();
    train.v = 0;
    train.a = 0;
    train.d = 0;
    lastClackDist = 0;
    enter('departing');
  }
  void dt;
}

function updateDeparting(dt: number): void {
  const t = platformWait.t;
  once('brake-release', t >= DEPART_HOLD - 1.2, () => audio.brakeRelease());
  const target = t < DEPART_HOLD ? 0 : V_MAX;
  integrateTrain(train, target, dt);
  runtime.trainZ = -train.d;
  runtime.speed = train.v;
  runtime.accel = train.a;
  audio.setRollingDistance(train.d);
  // Dès que la rame s'ébranle, plus aucun seuil n'est franchissable.
  if (train.d > 0.5) runtime.trainPresent = false;
  // La rame a dégagé le quai : ceux qui restent gagnent la sortie, l'un après
  // l'autre. Le quai se vidait jusqu'ici d'un seul coup, sans transition.
  once('disperse', train.d > 30, () => crowdDisperse());
  if (train.d - lastClackDist > CONFIG.railJointGap && train.v > 1.5) {
    lastClackDist = train.d;
    audio.railClack(train.v / V_MAX);
  }
  if (train.d >= OUT_OF_SIGHT) {
    runtime.speed = 0;
    runtime.accel = 0;
    audio.setRollingDistance(OUT_OF_SIGHT);
    enter('clear');
  }
}

/** Fenêtre de remplissage du quai entre deux rames (s après le départ). */
const REFILL_FROM = 6;
const REFILL_TO = HEADWAY_GAP - 8;

function updateClear(index: number): void {
  const t = platformWait.t;
  // Le quai se repeuple par les escaliers, au compte-gouttes : les voyageurs
  // montent de la trémie au lieu d'apparaître d'un bloc.
  const filled = Math.max(0, Math.min(1, (t - REFILL_FROM) / (REFILL_TO - REFILL_FROM)));
  const want = Math.round(filled * crowdTarget(index));
  for (let guard = 0; crowdPresentCount() < want && guard < 4; guard++) {
    if (!crowdArrive(index)) break;
  }
  // La gare reprend la parole une fois le quai dégagé : l'excuse de retard
  // s'il y en a une à faire, l'annonce anticipée du prochain train, puis le
  // carillon ATOS et l'annonce d'approche.
  once('delay', t >= 6, () => paDelay());
  once('pre-announce', t >= 14, () => paPreAnnouncement(index, true));
  once('announce', t >= HEADWAY_GAP - 24, () => paApproach(index));
  if (t >= HEADWAY_GAP) {
    platformWait.approachDist = brakingDistance();
    train.v = V_MAX;
    train.a = 0;
    train.d = 0;
    lastClackDist = 0;
    runtime.trainZ = platformWait.approachDist;
    randomizeDoorTimings();
    enter('approaching');
  }
}

function updateApproaching(dt: number): void {
  once('brake-apply', platformWait.t >= 0.4, () => audio.brakeApply());
  once('jingle', platformWait.t >= 1.5, () => audio.arrivalJingle());
  integrateTrain(train, 0, dt);
  const left = Math.max(0, platformWait.approachDist - train.d);
  // La rame est en vue au bout du quai : l'avertissement court prend le relais
  // de l'annonce d'approche, plus fort et répété.
  once('entering', left <= 150, () => paTrainEntering());
  runtime.trainZ = left;
  runtime.speed = train.v;
  runtime.accel = train.a;
  audio.setRollingDistance(left);
  if (train.d - lastClackDist > CONFIG.railJointGap && train.v > 1.5) {
    lastClackDist = train.d;
    audio.railClack(train.v / V_MAX);
  }
  once('squeal', train.v < V_MAX * 0.25 && train.v > 1, () => audio.flangeSqueal(0.45));
  if (train.v <= 0.02 || left <= 0.01) {
    runtime.trainZ = 0;
    runtime.speed = 0;
    runtime.accel = 0;
    audio.setRollingDistance(0);
    enter('berthing');
  }
}

function updateBerthing(index: number): void {
  once('settle', true, () => {
    audio.stopSettle();
    runtime.trainPresent = true;
    runtime.stopSequence += 1;
    runtime.trainId = `yamanote-e235-${runtime.stopSequence}`;
    runtime.lastMelodyDepartureId = null;
    // Nouvelle rame, nouvelle chronologie d'arrêt : deux trains d'affilée à la
    // même gare ne repartent pas à la même seconde.
    randomizeStopTimings(index);
    // Nouvelle rame : de nouveaux visages derrière les vitres.
    seedPassengers();
    // La gare annonce son propre nom, deux fois, comme sur les quais ATOS.
    paArrival(index);
  });
  if (platformWait.t >= BERTH_SETTLE) enter('boardable');
}

// --- Boucle -------------------------------------------------------------

/** Appelée à la place d'updateCycle tant que le joueur est sur le quai. */
export function updatePlatformWait(rawDt: number): void {
  const dt = rawDt * platformWait.rate;
  // L'horloge de Tokyo ne s'arrête pas parce qu'on est descendu : sans cela le
  // cycle jour/nuit gèlerait le temps de l'attente.
  advanceClock(rawDt);
  runtime.swayTime += dt;
  runtime.sway = 0;

  const { index } = useStore.getState();
  const doorSide = DOOR_SIDE[index];
  platformWait.t += dt;

  switch (platformWait.stage) {
    case 'boardable':
      updateBoardable(dt, index, doorSide);
      break;
    case 'departing':
      updateDeparting(dt);
      break;
    case 'clear':
      updateClear(index);
      break;
    case 'approaching':
      updateApproaching(dt);
      break;
    case 'berthing':
      updateBerthing(index);
      break;
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.__platformWait = platformWait;
  w.__platformWaitSpeed = (k: number) => {
    platformWait.rate = Math.max(0.1, k);
  };
}
