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
import type { NextTrains } from '../data/departureBoard';
import type { DisruptionCause, DisruptionSeverity } from '../data/platformDisruptions';
import { DOOR_SIDE } from '../data/stations';
import { useStore } from '../store';
import { advanceClock, runtime } from './runtime';
import { DEPART_HOLD, integrateTrain, stopDistance, type TrainState } from './trainPhysics';
import { randomizeDoorTimings, setPsdDoors, setTrainDoors, stationTimings } from './doorMotion';
import * as audio from './audioEngine';
import { PLATFORM_SCHEDULE } from './platformAnnouncementPlan';
import { cancelSpeech, speechQueueRemaining } from './speech';
import {
  currentPlatformPlan,
  paAgentMessage,
  paAlightFirst,
  paApproach,
  paArrival,
  paLineDisruption,
  paLineDisruptionResume,
  paDoorsClosing,
  paPreAnnouncement,
  paTrainEntering,
  planPlatformAnnouncements,
} from './stationPa';
import {
  beginPlatformDisruption, clearLineDisruption, consumeRecoveryTrain, disruptionAffects,
  disruptionExtraSeconds, disruptionHasKnownEta, lineDisruption, nextTrainBlocked,
  resolveLineDisruption, updateLineDisruption,
} from './lineDisruption';
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
 * Ce n'est pas l'express qui retarde la Yamanote - ce sont deux lignes
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

/**
 * Distance restant à parcourir (m) à laquelle la rame qui arrive est assez
 * proche pour que l'avertissement d'entrée prenne le relais de l'annonce
 * d'approche : elle est alors au bout du quai, et il reste une vingtaine de
 * secondes de freinage.
 */
const ENTERING_AT_LEFT = 150;

// --- Instants des annonces facultatives ----------------------------------
//
// Ce ne sont plus des rendez-vous : chacun de ces instants n'est que le moment
// où la gare REGARDE si elle a quelque chose à dire. Ce qu'elle dit - ou pas -
// vient du plan tiré à l'entrée du creux (systems/platformAnnouncementPlan), et
// ce qui ne tient pas dans le créneau restant est abandonné plutôt que repoussé.

const {
  delayAt: DELAY_AT,
  preAnnounceAt: PRE_ANNOUNCE_AT,
  preAnnounceAfterDelayAt: PRE_ANNOUNCE_AFTER_DELAY_AT,
  approachBefore: APPROACH_AT_BEFORE,
  agentExchangeAt: AGENT_EXCHANGE_AT,
  agentPreMelodyLead: AGENT_PRE_MELODY_LEAD,
} = PLATFORM_SCHEDULE;

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

  // La rame est déjà là, et elle a son plan d'annonces. On le REPREND, on ne le
  // retire pas : c'est le même arrêt, et c'est celui que la sono du wagon suivait
  // une seconde plus tôt. En tirer un nouveau ferait dire au quai autre chose que
  // ce qu'on venait d'entendre par les portes ouvertes.
  currentPlatformPlan(index, HEADWAY_GAP);

  // Ce qui est déjà passé dans ce dwell ne doit pas se rejouer.
  if (t > 0.4) fired.add('doors-open');
  if (t > 0.4 + stationTimings.psdOpenDelay) fired.add('psd-open');
  if (t > 0.4 + stationTimings.psdOpenDelay + 0.6) fired.add('pa-alight');
  if (t > 1.6) fired.add('exchange');
  if (t > AGENT_EXCHANGE_AT) fired.add('agent-1');
  if (t > melodyStartAt(index, dwell) - AGENT_PRE_MELODY_LEAD) fired.add('agent-2');
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

function updateBoardable(index: number, doorSide: 1 | -1): void {
  const dwell = dwellDuration(index);
  const t = platformWait.t;
  const melodyAt = melodyStartAt(index, dwell);
  once('doors-open', t > 0.4, () => {
    setTrainDoors(1);
    audio.doorOpenChime();
  });
  once('psd-open', t > 0.4 + stationTimings.psdOpenDelay, () => setPsdDoors(1));
  // L'agent de quai, une fois les baies palières ouvertes elles aussi - et
  // seulement si le plan de cet arrêt l'a retenu : sur un quai désert, personne
  // n'a besoin qu'on lui demande de laisser descendre trois personnes.
  once('pa-alight', t > 0.4 + stationTimings.psdOpenDelay + 0.6, () =>
    paAlightFirst(index, baseHeadway, melodyAt - t),
  );
  once('exchange', t > 1.6, () => exchangePassengers(doorSide));
  // Pendant que la foule monte, puis une seconde fois avant la mélodie - zéro,
  // une ou deux consignes selon le plan, et la seconde n'est diffusée que s'il
  // reste la place de la finir avant la première note.
  once('agent-1', t > AGENT_EXCHANGE_AT, () =>
    paAgentMessage(index, baseHeadway, 0, melodyAt - t),
  );
  once('agent-2', t > melodyAt - AGENT_PRE_MELODY_LEAD, () =>
    paAgentMessage(index, baseHeadway, 1, melodyAt - t),
  );
  once('melody', t >= melodyAt, () => audio.departureMelody(index));
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
  once('psd-close', t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay, () =>
    setPsdDoors(0),
  );
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
 * partout ensuite - l'annonce d'approche et l'arrivée en dépendent.
 */
let baseHeadway = HEADWAY_GAP;
let effectiveReleaseAt = HEADWAY_GAP;
/** Un passage a été tiré pour ce creux : reste à le lancer à PASS_AT. */
let passPending = false;
/** Une excuse de retard a été diffusée dans ce creux : elle décale l'anticipée. */
let delayAnnounced = false;
/**
 * Instant où l'annonce d'approche est partie (s dans le creux), −1 tant qu'elle
 * n'a pas été dite. Il RETIENT la rame : elle ne paraît qu'une fois l'annonce
 * lancée, et pas avant qu'elle ait eu son avance.
 */
let approachAnnouncedAt = -1;

/** Tire le creux qui commence, et le passage qui l'allonge peut-être. */
function beginClear(index: number): void {
  const direction = useStore.getState().loopDirection;
  const date = runtime.tokyoDate;
  const seed = `${runtime.stopSequence}:${index}:${direction}:${date.year}-${date.month}-${date.day}`;
  beginPlatformDisruption({ direction, stationIndex: index, seed, clockMin: runtime.clockMin, stopSequence: runtime.stopSequence });
  passPending = lineDisruption.phase === 'inactive' && rollPassThrough(index, HEADWAY_GAP + PASS_HEADWAY_EXTRA);
  baseHeadway = HEADWAY_GAP + (passPending ? PASS_HEADWAY_EXTRA : 0);
  effectiveReleaseAt = baseHeadway + disruptionExtraSeconds(direction);
  delayAnnounced = false;
  approachAnnouncedAt = -1;
  // Le plan de la rame ATTENDUE, tiré maintenant que le creux est connu : c'est
  // lui qui décide de l'annonce anticipée et du remerciement, et c'est le même
  // qui portera « laissez descendre » et les consignes d'agent quand elle sera
  // à quai (d'où le numéro d'arrêt de la rame à venir, et non celui qui part).
  planPlatformAnnouncements(index, effectiveReleaseAt, runtime.stopSequence + 1);
  // La rame suivante est peuplée MAINTENANT, quai vide et voie déserte : elle
  // arrivera donc avec ses voyageurs déjà en place derrière les vitres.
  //
  // Ce tirage se faisait à l'immobilisation, et il se voyait : la rame entrait
  // en gare pleine des voyageurs de la précédente, puis tout le monde changeait
  // de visage et de place à l'instant de l'arrêt, sous les yeux du quai.
  seedPassengers();
}

function updateClear(index: number): void {
  const t = platformWait.t;
  const direction = useStore.getState().loopDirection;
  // Premier tour du creux : sa durée se décide ici, et rien avant ne la lit.
  once('roll', true, () => beginClear(index));
  // Le quai se repeuple par les escaliers, au compte-gouttes : les voyageurs
  // montent de la trémie au lieu d'apparaître d'un bloc.
  if (disruptionAffects(direction)) {
    if (lineDisruption.phase === 'delayed' || lineDisruption.phase === 'suspended') {
      effectiveReleaseAt = Math.max(effectiveReleaseAt, baseHeadway + lineDisruption.elapsedSeconds + lineDisruption.holdRemainingSeconds);
    } else if (lineDisruption.phase === 'resuming') {
      effectiveReleaseAt = Math.max(effectiveReleaseAt, t + lineDisruption.releaseBufferSeconds);
    }
  }
  const refillTo = Math.max(baseHeadway, effectiveReleaseAt) - REFILL_BEFORE;
  const filled = Math.max(0, Math.min(1, (t - REFILL_FROM) / (refillTo - REFILL_FROM)));
  const delayedFor = disruptionAffects(direction) ? lineDisruption.elapsedSeconds : 0;
  const delayCrowdMultiplier = 1 + Math.min(delayedFor / 300, 0.35);
  const want = Math.round(filled * crowdTarget(index) * delayCrowdMultiplier);
  for (let guard = 0; crowdPresentCount() < want && guard < 4; guard++) {
    if (!crowdArrive(index)) break;
  }
  // La gare reprend la parole une fois le quai dégagé : l'excuse de retard
  // s'il y en a une à faire, l'annonce anticipée du prochain train quand le
  // plan l'a retenue, puis le carillon ATOS et l'annonce d'approche.
  //
  // L'anticipée n'est plus un rendez-vous : elle dépend du creux, de l'heure, de
  // la gare et du retard, et le remerciement qui la précède est lui aussi tiré.
  // Elle passe derrière l'excuse de retard quand il y en a eu une, et tombe si
  // elle ne tient plus avant l'annonce d'approche - qui, elle, est obligatoire.
  if (lineDisruption.phase !== 'inactive' && !lineDisruption.initialAnnouncementPlayed && t >= Math.max(8, DELAY_AT)) {
    delayAnnounced = paLineDisruption();
    if (delayAnnounced) lineDisruption.initialAnnouncementPlayed = true;
  }
  if (lineDisruption.estimateRevisionCount > 0 && !lineDisruption.updateAnnouncementPlayed) {
    if (paLineDisruption()) lineDisruption.updateAnnouncementPlayed = true;
  }
  if ((lineDisruption.phase === 'resuming' || lineDisruption.phase === 'recovering') && !lineDisruption.resumeAnnouncementPlayed) {
    if (paLineDisruptionResume()) lineDisruption.resumeAnnouncementPlayed = true;
  }
  const preAt = delayAnnounced ? PRE_ANNOUNCE_AFTER_DELAY_AT : PRE_ANNOUNCE_AT;
  once('pre-announce', t >= preAt, () => {
    // Le plan de la rame à venir, celui tiré à l'entrée du creux.
    const plan = currentPlatformPlan(index, effectiveReleaseAt, runtime.stopSequence + 1);
    if (!plan.playPreAnnouncement) return;
    paPreAnnouncement(index, plan.playGreeting, effectiveReleaseAt - APPROACH_AT_BEFORE - t);
  });
  // Le passage, s'il y en a un : entre l'annonce anticipée et celle
  // d'approche, avec tout le creux devant lui.
  once('pass', passPending && t >= PASS_AT, () => {
    passPending = false;
    startPassThrough(index, effectiveReleaseAt - APPROACH_AT_BEFORE - PASS_AT);
  });
  const disruptionReady = !disruptionAffects(direction) ||
    (lineDisruption.resumeAnnouncementPlayed && speechQueueRemaining('platform') <= 0.05);
  // L'annonce d'approche part AVANT la rame - c'est tout ce qu'elle dit :
  // 「まもなく…がまいります」, « will soon arrive ». Elle ne peut donc pas
  // attendre le lâcher de la rame : lancée avec lui, elle annonce une rame déjà
  // en train d'entrer, et ses trente secondes de parole repoussent
  // l'avertissement d'entrée jusqu'après l'ouverture des portes. Ce qu'elle
  // attend, c'est de savoir que la rame VA venir - pas qu'elle soit là.
  once('announce', disruptionReady && t >= effectiveReleaseAt - APPROACH_AT_BEFORE, () => {
    approachAnnouncedAt = t;
    paApproach(index);
  });
  // Et la rame ne paraît pas avant que l'annonce ait eu son avance. Dans le
  // creux ordinaire, cela ne change rien - l'annonce part pile à
  // effectiveReleaseAt − APPROACH_AT_BEFORE. Sur une reprise après incident,
  // où la gare finissait d'expliquer le retard quand le créneau est arrivé, le
  // lâcher recule d'autant : le tableau des départs lit le même instant
  // (nextTrainsFromPlatform), il reste donc honnête.
  if (approachAnnouncedAt >= 0) {
    effectiveReleaseAt = Math.max(effectiveReleaseAt, approachAnnouncedAt + APPROACH_AT_BEFORE);
  }
  const released = !nextTrainBlocked(direction) && disruptionReady && t >= effectiveReleaseAt;
  if (released) {
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
    consumeRecoveryTrain();
    enter('approaching');
  }
}

function updateApproaching(dt: number): void {
  once('brake-apply', platformWait.t >= 0.4, () => audio.brakeApply());
  integrateTrain(train, 0, dt);
  // Ce qu'il reste à parcourir se lit sur l'état de la rame, et non sur une
  // distance de freinage estimée d'avance : elle se pose ainsi exactement sur
  // son repère - à l'écart d'arrêt près - sans le recalage final que laissait
  // la soustraction.
  const left = stopDistance(train.v, train.a);
  // La rame est en vue au bout du quai : l'avertissement court prend le relais
  // de l'annonce d'approche, plus fort et répété. Il ne vaut que TANT QUE la
  // rame entre - d'où le temps qu'il reste avant l'immobilisation : ce qui n'y
  // tiendrait pas est abandonné plutôt que dit à une rame déjà posée.
  once('entering', left <= ENTERING_AT_LEFT, () =>
    paTrainEntering(approachRunTime() - platformWait.t),
  );
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
    // Ses voyageurs, eux, sont en place depuis le creux (beginClear) : les
    // peupler ici les ferait tous changer de visage à l'arrêt.
    // La gare annonce son propre nom, deux fois, comme sur les quais ATOS.
    paArrival(index);
  });
  if (platformWait.t >= BERTH_SETTLE) enter('boardable');
}

// --- Ce que le 発車標 a le droit d'annoncer ------------------------------

/**
 * Durées mesurées une fois sur le profil E235 lui-même, et non estimées : le
 * tableau des départs annonce des minutes, et une minute d'écart se voit. Ce
 * sont exactement les deux courses que les étapes ci-dessus font tourner -
 * dégager les 320 m du quai, et freiner depuis la vitesse de ligne.
 */
function runTime(from: number, to: number, until: (s: TrainState) => boolean): number {
  const s: TrainState = { v: from, a: 0, d: 0 };
  const dt = 1 / 30;
  let t = 0;
  while (!until(s) && t < 180) {
    integrateTrain(s, from === 0 && t < DEPART_HOLD ? 0 : to, dt);
    t += dt;
  }
  return t;
}

let clearRun = 0;
/** Temps que met la rame qui part à disparaître au bout du quai (s). */
function clearRunTime(): number {
  if (!clearRun) clearRun = runTime(0, V_MAX, (s) => s.d >= OUT_OF_SIGHT);
  return clearRun;
}

let approachRun = 0;
/** Temps de freinage, du moment où la rame paraît à l'arrêt complet (s). */
function approachRunTime(): number {
  if (!approachRun) approachRun = runTime(V_MAX, 0, (s) => s.v <= 0.02);
  return approachRun;
}

/**
 * Dans combien de temps la prochaine rame sera à quai, portes ouvertes, et
 * celle d'après - les deux lignes du 発車標.
 *
 * `first` vaut null tant qu'une rame est là : le tableau écrit alors 「まもなく」
 * ou 「まもなく発車」 selon qu'elle embarque ou qu'elle s'ébranle, et sa seconde
 * ligne annonce la suivante.
 *
 * Le creux retenu est celui du tour en cours (`headway`), rallonge de passage
 * comprise : c'est la seule prévision honnête dont le quai dispose, et le 約
 * du tableau ne promet pas mieux.
 */
export function nextTrainsFromPlatform(index: number): NextTrains {
  const t = platformWait.t;
  const dwell = dwellDuration(index);
  /** Du bout du quai aux portes ouvertes. */
  const arrive = approachRunTime() + BERTH_SETTLE;
  /** D'un départ de rame à l'arrivée de la suivante. */
  const direction = useStore.getState().loopDirection;
  const extra = disruptionExtraSeconds(direction);
  const releaseAt = platformWait.stage === 'clear'
    ? Math.max(baseHeadway, effectiveReleaseAt, nextTrainBlocked(direction) ? t + extra : baseHeadway)
    : baseHeadway + extra;
  const gap = clearRunTime() + releaseAt + arrive;
  /** D'une rame à quai à la suivante à quai. */
  const cycle = dwell + gap;
  switch (platformWait.stage) {
    case 'boardable':
      // La 発車メロディ est le signal de départ : c'est à elle, et non à la
      // fermeture des portes, que le tableau passe en 「まもなく発車」.
      return {
        first: null,
        second: Math.max(0, dwell - t) + gap,
        leaving: t >= melodyStartAt(index, dwell),
      };
    case 'departing':
      return {
        first: null,
        second: Math.max(0, clearRunTime() - t) + baseHeadway + extra + arrive,
        leaving: true,
      };
    case 'clear': {
      if (!disruptionHasKnownEta(direction) && nextTrainBlocked(direction)) return { first: 'unknown', second: 'unknown', leaving: false };
      const first = Math.max(0, releaseAt - t) + arrive;
      return { first, second: first + cycle, leaving: false };
    }
    case 'approaching': {
      const first = Math.max(0, approachRunTime() - t) + BERTH_SETTLE;
      return { first, second: first + cycle, leaving: false };
    }
    default: {
      const first = Math.max(0, BERTH_SETTLE - t);
      return { first, second: first + cycle, leaving: false };
    }
  }
}

// --- Boucle -------------------------------------------------------------

/** Appelée à la place d'updateCycle tant que le joueur est sur le quai. */
export function updatePlatformWait(rawDt: number): void {
  const dt = rawDt * platformWait.rate;
  updateLineDisruption(dt);
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
      updateBoardable(index, doorSide);
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
  const force = (severity: DisruptionSeverity, cause?: DisruptionCause, seconds?: number) => {
    const { index, loopDirection } = useStore.getState();
    beginPlatformDisruption({ cause, severity, seconds, source: 'development', direction: loopDirection, stationIndex: index, clockMin: runtime.clockMin, stopSequence: runtime.stopSequence, force: true });
  };
  w.__platformDelay = (cause?: DisruptionCause, seconds?: number) => force('minor', cause, seconds);
  w.__platformSuspension = (cause?: DisruptionCause, seconds?: number) => force('suspended', cause, seconds);
  w.__resolvePlatformDelay = resolveLineDisruption;
  w.__clearPlatformDelay = clearLineDisruption;
  w.__platformDelayState = () => ({ ...lineDisruption });
}
