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
import { DEPART_HOLD, integrateTrain, stopDistance, type TrainState } from './trainPhysics';
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
import { rollPassThrough, startPassThrough } from './passingTrain';
import { exchangePassengers, seedPassengers } from './passengers';
import { crowdArrive, crowdDisperse, crowdPresentCount, crowdTarget } from './platformCrowd';
import {
  cancelDepartureMelody,
  interruptDepartureMelody,
  resetMelodyDepartureGuard,
} from './departureSequence';
import {
  armDoorObstruction,
  doorObstructionActive,
  onDoorsClosing,
  resetDoorObstruction,
} from './doorObstruction';
import {
  CLOSE_ANNOUNCE_LEAD,
  DOORS_CLOSE_LEAD,
  MELODY_SOUNDING,
  dwellDuration,
  melodyCutAt,
  melodyStartAt,
  randomizeBerthOffset,
  randomizeStopTimings,
} from './stationCycle';

/**
 * Creux entre deux rames, quai vide (s). L'intervalle complet d'un départ au
 * suivant tourne autour de deux minutes, la cadence réelle de la Yamanote aux
 * heures creuses.
 */
const HEADWAY_GAP = 60;

/**
 * Rallonge du creux quand une rame doit traverser la voie d'en face.
 *
 * Ce n'est pas l'express qui retarde la Yamanote — ce sont deux lignes
 * différentes, elles ne se croisent nulle part. C'est l'inverse : la cadence
 * de la Yamanote respire entre deux et quatre minutes, et c'est dans les
 * creux un peu plus longs qu'on a le temps de voir passer autre chose. Sans
 * cette rallonge, l'annonce de passage (japonais puis anglais, une trentaine
 * de secondes) n'aurait nulle part où tenir sans marcher sur celle du train
 * que l'on attend.
 */
const PASS_HEADWAY_EXTRA = 50;

/**
 * Instant du lancement de la séquence de passage, une fois l'annonce anticipée
 * du prochain train terminée : la gare ne parle jamais par-dessus elle-même.
 */
const PASS_AT = 28;

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
  // Le repère bascule : le quai s'épingle à l'origine, la rame reprend à son
  // compte l'écart d'arrêt qu'elle portait jusque-là sous la forme d'un
  // glissement du quai. Sans ce report, la rame se recalerait au centimètre
  // près sous les pieds du joueur au moment où il pose le pied dehors.
  runtime.trainZ = -runtime.platformSlide;
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
  // Retour au repère du wagon : la rame revient à l'origine et c'est le quai
  // qui reprend l'écart d'arrêt (systems/platformPresence le repose aussitôt
  // à `berthOffset`). Exactement l'inverse de beginPlatformWait.
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
    onDoorsClosing();
  });
  once('psd-close', t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay, () => {
    setPsdDoors(0);
    paPsdBeeps();
  });
  // Une porte coincée retient la rame, qu'on soit dedans ou sur le quai : d'ici
  // on voit les vantaux d'une caisse rester entrebâillés, et le train ne part
  // pas tant qu'ils ne sont pas rentrés.
  if (doorObstructionActive()) {
    platformWait.t = Math.min(platformWait.t, dwell - 0.01);
    return;
  }
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
  // La rame part d'où elle s'était posée, pas du repère théorique.
  runtime.trainZ = -runtime.berthOffset - train.d;
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

/** Fenêtre de remplissage du quai entre deux rames (début, puis fin avant l'arrivée). */
const REFILL_FROM = 6;
const REFILL_BEFORE = 8;

/**
 * Creux tiré pour l'attente en cours : HEADWAY_GAP, ou davantage quand une
 * rame doit traverser la voie d'en face. Fixé à l'entrée en 'clear' et lu
 * partout ensuite — l'annonce d'approche et l'arrivée en dépendent.
 */
let headway = HEADWAY_GAP;
/** Un passage a été tiré pour ce creux : reste à le lancer à PASS_AT. */
let passPending = false;

/** Tire le creux qui commence, et le passage qui l'allonge peut-être. */
function beginClear(index: number): void {
  passPending = rollPassThrough(index, HEADWAY_GAP + PASS_HEADWAY_EXTRA);
  headway = HEADWAY_GAP + (passPending ? PASS_HEADWAY_EXTRA : 0);
}

function updateClear(index: number): void {
  const t = platformWait.t;
  // Premier tour du creux : sa durée se décide ici, et rien avant ne la lit.
  once('roll', true, () => beginClear(index));
  // Le quai se repeuple par les escaliers, au compte-gouttes : les voyageurs
  // montent de la trémie au lieu d'apparaître d'un bloc.
  const refillTo = headway - REFILL_BEFORE;
  const filled = Math.max(0, Math.min(1, (t - REFILL_FROM) / (refillTo - REFILL_FROM)));
  const want = Math.round(filled * crowdTarget(index));
  for (let guard = 0; crowdPresentCount() < want && guard < 4; guard++) {
    if (!crowdArrive(index)) break;
  }
  // La gare reprend la parole une fois le quai dégagé : l'excuse de retard
  // s'il y en a une à faire, l'annonce anticipée du prochain train, puis le
  // carillon ATOS et l'annonce d'approche.
  once('delay', t >= 6, () => paDelay());
  once('pre-announce', t >= 14, () => paPreAnnouncement(index, true));
  // Le passage, s'il y en a un : entre l'annonce anticipée et celle
  // d'approche, avec tout le creux devant lui.
  once('pass', passPending && t >= PASS_AT, () => {
    passPending = false;
    startPassThrough(index, headway - 24 - PASS_AT);
  });
  once('announce', t >= headway - 24, () => paApproach(index));
  if (t >= headway) {
    platformWait.approachDist = stopDistance(V_MAX, 0);
    train.v = V_MAX;
    train.a = 0;
    train.d = 0;
    lastClackDist = 0;
    // Nouvelle rame, nouveau conducteur : son écart d'arrêt est tiré ici,
    // avant même qu'elle ne se montre au bout du quai.
    randomizeBerthOffset();
    runtime.trainZ = platformWait.approachDist - runtime.berthOffset;
    randomizeDoorTimings();
    enter('approaching');
  }
}

function updateApproaching(dt: number): void {
  once('brake-apply', platformWait.t >= 0.4, () => audio.brakeApply());
  once('jingle', platformWait.t >= 1.5, () => audio.arrivalJingle());
  integrateTrain(train, 0, dt);
  // Ce qu'il reste à parcourir se lit sur l'état de la rame, et non sur une
  // distance de freinage estimée d'avance : elle se pose ainsi exactement sur
  // son repère — à l'écart d'arrêt près — sans le recalage final que laissait
  // la soustraction.
  const left = stopDistance(train.v, train.a);
  // La rame est en vue au bout du quai : l'avertissement court prend le relais
  // de l'annonce d'approche, plus fort et répété.
  once('entering', left <= 150, () => paTrainEntering());
  runtime.trainZ = left - runtime.berthOffset;
  runtime.speed = train.v;
  runtime.accel = train.a;
  audio.setRollingDistance(left);
  if (train.d - lastClackDist > CONFIG.railJointGap && train.v > 1.5) {
    lastClackDist = train.d;
    audio.railClack(train.v / V_MAX);
  }
  once('squeal', train.v < V_MAX * 0.25 && train.v > 1, () => audio.flangeSqueal(0.45));
  if (train.v <= 0.02 || left <= 0.01) {
    runtime.trainZ = -runtime.berthOffset;
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
    // Nouvelle rame, nouveau tirage de l'incident de porte.
    resetDoorObstruction();
    armDoorObstruction();
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
