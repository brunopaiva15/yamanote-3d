// Machine à états du cycle station : cruise → brake → dwell → depart, avec
// timing quasi réel (~2 min à 2 min 40 par station, selon la durée d'arrêt
// tirée). Déclenche annonces, carillons, mélodies et échanges de passagers aux
// bons instants — voir « Chronologie de l'arrêt » plus bas.

import { CONFIG, V_MAX } from '../data/config';
import { DOOR_SIDE, STATIONS, TRANSFERS } from '../data/stations';
import { nextStation, randomDirection, wrapStation } from '../data/loop';
import type { LoopDirection } from '../data/platforms';
import { cruiseDuration } from '../data/segments';
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
import { DEPART_HOLD, integrateTrain, phaseTarget, stepTrain } from './trainPhysics';
import {
  randomizeDoorTimings,
  seedDoorMotion,
  setPsdDoors,
  setTrainDoors,
  stationTimings,
} from './doorMotion';
import * as audio from './audioEngine';
import { cancelSpeech, say } from './speech';
import {
  lineDelayed,
  notifyLineDelay,
  paAgentMessage,
  paAlightFirst,
  paArrival,
  paDoorsClosing,
  paPsdBeeps,
  updatePlatformSpeakers,
} from './stationPa';
import { rollPassThrough, startPassThrough } from './passingTrain';
import { exchangePassengers, startlePassengers } from './passengers';
import { pushSceneEvent } from './paxEvents';
import { seedPlatformPresence } from './platformPresence';
import { clearPlatformCrowd, seedPlatformCrowd } from './platformCrowd';
import {
  cancelDepartureMelody,
  clearDepartureBlockers,
  interruptDepartureMelody,
  isDepartureHeldOpen,
  plannedStopMelodySounding,
  resetMelodyDepartureGuard,
} from './departureSequence';
import { melodyRoundsDuration } from '../data/melodies';
import {
  armDoorObstruction,
  doorObstructionActive,
  onDoorsClosing,
  resetDoorObstruction,
} from './doorObstruction';

const fired = new Set<string>();
let lastJointDistance = 0;

// Prochain petit événement sonore de course (temps de phase cruise), -1 = aucun.
let nextRunSoundAt = -1;

function scheduleNextRunSound(from: number): void {
  nextRunSoundAt = from + 14 + Math.random() * 22;
}

// --- Arrêt d'urgence (急停車) -------------------------------------------
// Rare, mais pas invisible : la course qui le portera est fixée plusieurs
// gares à l'avance, et il se déclenche en pleine ligne. Le train freine en
// urgence, reste immobilisé de 45 s à 2 min 30 avec les annonces conducteur,
// puis repart. Le chrono de phase est avancé au prorata
// de la vitesse pendant tout l'événement : gelé à l'arrêt, il ne consomme que
// l'équivalent de la distance réellement parcourue — la gare suivante arrive
// donc au bon moment après la reprise.
//
// Le tirage se faisait auparavant gare par gare, à 1,5 % : une loi géométrique
// laissait passer près de deux trajets d'une demi-heure sur trois sans le
// moindre arrêt d'urgence — la mécanique existait sans jamais se montrer — et
// pouvait à l'inverse en donner deux coup sur coup. Un écart tiré entre deux
// bornes garde la rareté et lui retire la loterie.

/**
 * Écart entre deux arrêts d'urgence, en gares (~2 min 20 l'une) : de 25 min à
 * 1 h de trajet, 40 min en moyenne. Assez espacé pour rester un événement,
 * assez serré pour qu'une longue boucle en croise un.
 */
const EMERGENCY_GAP_MIN = 10;
const EMERGENCY_GAP_MAX = 24;
/** Écart avant le tout premier : un trajet court doit pouvoir le vivre. */
const EMERGENCY_FIRST_MIN = 3;
const EMERGENCY_FIRST_MAX = 8;
/** Au plus tôt dans la croisière : le temps d'atteindre la pleine vitesse (s). */
const EMERGENCY_AT_MIN = 8;
/** Largeur de la fenêtre de déclenchement à partir de ce plus tôt (s). */
const EMERGENCY_AT_SPAN = 20;
/**
 * Marge gardée devant l'annonce d'approche : freiner par-dessus 「まもなく」 la
 * couperait (cancelSpeech) sans qu'elle soit rejouée, et la gare arriverait au
 * milieu de la reprise.
 */
const EMERGENCY_APPROACH_MARGIN = 2;
// Bornes d'immobilisation : le minimum laisse l'annonce d'arrêt (~21 s à
// partir de t=4) se terminer avant l'annonce de reprise (à holdFor − 12 s).
const EMERGENCY_HOLD_MIN = 45; // s
const EMERGENCY_HOLD_MAX = 150; // s

/** Gares restant à parcourir avant le prochain arrêt d'urgence. */
let stationsToEmergency = drawEmergencyGap(true);
// Instant de déclenchement dans la phase cruise courante, -1 = aucun.
let emergencyAt = -1;

function drawEmergencyGap(first = false): number {
  const min = first ? EMERGENCY_FIRST_MIN : EMERGENCY_GAP_MIN;
  const max = first ? EMERGENCY_FIRST_MAX : EMERGENCY_GAP_MAX;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Déclenche l'arrêt d'urgence (aussi exposé en dev : __emergencyStop()).
 * Accepté en course normale comme pendant la remontée en vitesse qui suit un
 * premier arrêt (stage 'resuming') : un nouveau coup de frein est légitime
 * dès que le train se relance. Refusé seulement pendant freinage /
 * immobilisation, où l'événement est déjà en cours.
 */
export function beginEmergencyStop(): void {
  const em = runtime.emergencyStop;
  if (em.stage === 'braking' || em.stage === 'stopped') return;
  if (useStore.getState().phase !== 'cruise') return;
  em.stage = 'braking';
  em.t = 0;
  em.holdFor = EMERGENCY_HOLD_MIN + Math.random() * (EMERGENCY_HOLD_MAX - EMERGENCY_HOLD_MIN);
  em.reason = Math.floor(Math.random() * EMERGENCY_REASONS.length);
  // Ré-arme les annonces de l'événement : un second arrêt dans la même phase
  // cruise (les clés `fired` y survivent) rejoue la séquence complète.
  fired.delete('em-stopped');
  fired.delete('em-wait');
  fired.delete('em-resume');
  fired.delete('em-scared');
  // L'urgence coupe l'annonce en cours, comme en vrai. Seulement celle de la
  // rame : la sono d'une gare qu'on n'a pas atteinte ne s'interrompt pas.
  cancelSpeech('cabin');
  say(emergencyBrakeAnnouncement());
  // La ligne prend du retard, et les quais le diront à la prochaine attente.
  notifyLineDelay(em.reason);
  audio.brakeApply();
  audio.flangeSqueal(0.8);
  // Le wagon sursaute — on se raccroche, on trébuche, on lève le nez — et
  // quelques voisins vont dire leur peur dans les secondes qui suivent.
  startlePassengers();
  pushSceneEvent('emergency');
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
      // Deuxième vague de peur, d'une autre nature : le coup de frein est
      // passé, la rame est immobile en pleine voie et personne ne dit
      // vraiment pourquoi. C'est l'attente qui inquiète, maintenant — le
      // catalogue distingue les deux moments par `moving`.
      once('em-scared', em.t >= 10, () => pushSceneEvent('emergency'));
      // Rappel d'attente à mi-arrêt, seulement si l'arrêt se prolonge.
      once('em-wait', em.holdFor >= 90 && em.t >= em.holdFor * 0.55, () =>
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

// --- Chronologie de l'arrêt ----------------------------------------------
//
// Le début de l'arrêt est calé sur l'immobilisation du train ; la FIN, elle,
// est calée sur la mélodie. La 発車メロディ se joue deux fois, entière, et
// c'est seulement une fois qu'elle s'est tue que l'annonce de fermeture part et
// que les portes se ferment — le quai n'expédie pas le morceau pour tenir un
// horaire. Séquence visée, en secondes après l'immobilisation :
//
//   0 s       arrêt du E235
//   1–3 s     ouverture des portes
//   15–25 s   début de la mélodie (20 s de référence)
//   +13 à 28 s  deux passages entiers, selon le clip du quai, puis silence
//   +13 s     annonce de fermeture (elle prend la place du silence)
//   +9 s      fermeture des portes
//   +4 s      la rame s'ébranle → immobilisation de 45 à 60 s selon la mélodie
//
// Les bornes 15–25 s ne sont pas du bruit : une petite gare ou une ligne en
// retard presse l'échange, une grande gare ou une régulation l'étire. JR East
// ne fixe d'ailleurs pas d'heure de départ à toutes les gares intermédiaires.

/**
 * Secondes déjà écoulées depuis l'arrêt complet quand la phase dwell démarre :
 * le profil de freinage amène v=0 vers t≈23 s d'une phase brake qui en dure 24.
 * Les chronos ci-dessous sont en temps de dwell, ce décalage fait le pont.
 */
const STOP_TO_DWELL_T0 = 1.0;

/** Début de la mélodie après l'arrêt complet : référence et bornes admises. */
const MELODY_AFTER_STOP = 20.0;
const MELODY_AFTER_STOP_MIN = 15.0;
const MELODY_AFTER_STOP_MAX = 25.0;
/** Tirage aléatoire autour de la référence (± s), avant biais gare / retard. */
const MELODY_AFTER_STOP_JITTER = 2.5;
/** Décalage selon la taille de la gare, et selon l'état de la ligne (s). */
const MELODY_STATION_BIAS = 2.5;

/**
 * Fenêtre sonore laissée à la mélodie, par défaut (s).
 *
 * C'était autrefois une constante, et la mélodie était coupée dessus quoi qu'il
 * arrive : dix secondes, alors que les clips vont de 6,4 s à 13,6 s — Sakura
 * Sakura à Komagome n'atteignait donc jamais la fin de son PREMIER passage. La
 * fenêtre est maintenant tirée par arrêt, sur le clip réellement câblé au quai
 * (`randomizeStopTimings` → `melodySounding`), et vaut deux passages entiers.
 * Cette valeur-ci ne sert plus que de repli avant le premier tirage : celle du
 * motif synthétisé, le seul qu'on puisse jouer sans savoir à quel quai on est.
 */
const MELODY_SOUNDING = melodyRoundsDuration(null);

/**
 * Souffle laissé après la dernière note avant que le chef de train ne relâche
 * le bouton (s). Sans lui, la coupure en fondu tomberait exactement sur la fin
 * du second passage et mordrait dessus.
 */
const MELODY_TAIL_S = 0.5;

/** Fenêtre sonore de l'arrêt en cours : deux passages de la mélodie du quai. */
function melodySounding(): number {
  return stopTimings.melodySounding;
}

/**
 * Avance de l'annonce de fermeture sur la fin du dwell. Elle tombe sur la
 * coupure de la mélodie : la voix prend la place du silence, comme sur le quai.
 * Les clips ja + en durent ~6,5 s à eux deux et doivent être finis avant que la
 * rame ne s'ébranle (fin du dwell + DEPART_HOLD) — ils le sont largement.
 */
export const CLOSE_ANNOUNCE_LEAD = 13.0;
/** Avance de la fermeture des portes sur la fin du dwell. */
export const DOORS_CLOSE_LEAD = 4.0;
/**
 * Avance du début de la mélodie sur la fin du dwell (= annonce + fenêtre
 * sonore). Variable d'un quai à l'autre, puisque la fenêtre l'est : c'est par
 * là que la longueur du clip étire le dwell au lieu d'écourter la mélodie.
 */
function melodyLead(): number {
  return CLOSE_ANNOUNCE_LEAD + melodySounding();
}
/**
 * Départ de l'annonce d'approche avant la fin de la croisière. Aux gares à
 * grosses correspondances (Ueno, Tokyo, Shinjuku…), まもなく + 乗換案内 ja/en
 * cumulent ~40 s : lancée au freinage (22 s), la séquence déborderait loin
 * après l'ouverture des portes. Comme en vrai, elle démarre en pleine course
 * et se termine autour de l'arrêt.
 */
const APPROACH_ANNOUNCE_LEAD = 20.0;

/**
 * Instant du tirage d'un passage sur la voie d'en face, en temps de dwell :
 * après le nom de la gare, l'agent et « laissez descendre », avant l'annonce
 * de fermeture. C'est le seul silence de l'arrêt, et il n'est pas long.
 */
const PASS_ROLL_AT = 12.0;

/**
 * Chronologie tirée pour l'arrêt en cours. Tirée UNE fois, à l'entrée en
 * freinage : dwellDuration() est appelée à chaque frame par le cycle, par le
 * quai et par l'affichage — elle doit rendre la même valeur du début à la fin
 * de l'arrêt.
 */
export const stopTimings = {
  melodyAfterStop: MELODY_AFTER_STOP,
  melodySounding: MELODY_SOUNDING,
};

/**
 * Poids de la gare, mesuré au nombre de lignes en correspondance : Mejiro n'en
 * a aucune et expédie l'échange, Shinjuku en aligne neuf et prend son temps.
 */
function stationBias(stationIndex: number): number {
  const jy = STATIONS[stationIndex]?.jy;
  const transfers = jy ? TRANSFERS[jy] : undefined;
  if (!transfers) return -MELODY_STATION_BIAS;
  return transfers.jp.split('、').length >= 5 ? MELODY_STATION_BIAS : 0;
}

/**
 * Écart d'arrêt (m) : la rame ne se pose pas au millimètre sur son 定位置.
 *
 * Bornes tirées de la pratique JR East — la tolérance réglementaire est de
 * ±35 cm, le TASC des lignes équipées de portes palières tient la dizaine de
 * centimètres. On reste dans cette dizaine : de trois à onze centimètres, d'un
 * côté ou de l'autre du repère. C'est assez pour que les portières et les
 * baies palières ne coïncident jamais exactement — le décalage se lit très
 * bien, portes ouvertes, entre les deux montants — et bien trop peu pour gêner
 * le passage : une baie palière fait 1,80 m, une porte de rame 1,32 m.
 */
const BERTH_OFFSET_MIN = 0.03;
const BERTH_OFFSET_MAX = 0.11;

/** Tire l'écart d'arrêt de la rame qui se présente. */
export function randomizeBerthOffset(): void {
  const mag = BERTH_OFFSET_MIN + Math.random() * (BERTH_OFFSET_MAX - BERTH_OFFSET_MIN);
  runtime.berthOffset = Math.random() < 0.5 ? -mag : mag;
}

/**
 * Tire l'instant de la mélodie pour l'arrêt qui commence, et mesure la fenêtre
 * qu'il faudra lui laisser : deux passages entiers du clip câblé sur CE quai,
 * dans CE sens. C'est ce qui fait qu'un arrêt à Komagome (Sakura Sakura, 13,6 s
 * le passage) dure plus longtemps qu'un arrêt à Takadanobaba (Atom, 6,4 s).
 */
export function randomizeStopTimings(stationIndex: number): void {
  // Ligne en retard : on rattrape sur les quais, la mélodie part plus tôt.
  const bias = stationBias(stationIndex) - (lineDelayed() ? MELODY_STATION_BIAS : 0);
  const jitter = (Math.random() * 2 - 1) * MELODY_AFTER_STOP_JITTER;
  stopTimings.melodyAfterStop = Math.min(
    MELODY_AFTER_STOP_MAX,
    Math.max(MELODY_AFTER_STOP_MIN, MELODY_AFTER_STOP + bias + jitter),
  );
  stopTimings.melodySounding = plannedStopMelodySounding(stationIndex) + MELODY_TAIL_S;
}

/**
 * Durée du dwell, déduite de l'instant de la mélodie et de sa longueur : tout
 * le reste de la procédure s'enchaîne derrière elle à intervalles fixes.
 */
export function dwellDuration(_stationIndex: number): number {
  return stopTimings.melodyAfterStop - STOP_TO_DWELL_T0 + melodyLead();
}

export function melodyStartAt(_stationIndex: number, dwell: number): number {
  return Math.max(2, dwell - melodyLead());
}

/**
 * Instant de la coupure : le chef de train relâche le bouton une fois les deux
 * passages faits. Le fondu qui suit ne mord donc sur rien — il referme un
 * silence (voir MELODY_TAIL_S).
 */
export function melodyCutAt(stationIndex: number, dwell: number): number {
  return melodyStartAt(stationIndex, dwell) + melodySounding();
}

const PHASE_ORDER = (stationIndex: number, dir: LoopDirection) => [
  { phase: 'cruise' as const, dur: cruiseDuration(stationIndex, dir) },
  { phase: 'brake' as const, dur: CONFIG.brakeTime },
  { phase: 'dwell' as const, dur: dwellDuration(stationIndex) },
  { phase: 'depart' as const, dur: CONFIG.departTime },
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
  if (phase !== 'dwell') {
    cancelDepartureMelody();
    // La rame quitte le quai : ce que la gare avait encore à dire reste
    // derrière elle. La sono du wagon, en revanche, continue.
    cancelSpeech('platform');
  }
}

// État du train (vitesse, accélération, distance) au temps t d'une phase,
// par intégration du même profil que la boucle : sert au spawn en cours de
// trajet (randomizeEntry).
function simulatePhaseState(
  phase: Phase,
  t: number,
  _stationIndex: number,
): { v: number; a: number; d: number } {
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
function speedFor(phase: Phase, t: number, stationIndex: number): number {
  return simulatePhaseState(phase, t, stationIndex).v;
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
function seedFired(phase: Phase, t: number, stationIndex: number, dir: LoopDirection): void {
  fired.clear();
  if (phase === 'cruise') {
    fired.add('doorside');
    fired.add('crowd-clear');
    fired.add('berth');
    // Pas d'arrêt d'urgence sur la toute première course après l'embarquement.
    fired.add('emergency-roll');
    if (t > 0.6) fired.add('announce-depart');
    if (t >= cruiseDuration(stationIndex, dir) - APPROACH_ANNOUNCE_LEAD) fired.add('announce-soon');
  } else if (phase === 'brake') {
    fired.add('door-timings');
    fired.add('brake-apply');
    fired.add('jingle');
    fired.add('crowd-seed');
    if (speedFor('brake', t, stationIndex) <= 0.01) fired.add('stop-settle');
  } else if (phase === 'dwell') {
    const dwell = dwellDuration(stationIndex);
    if (t > 0.9) fired.add('pa-arrival');
    if (t > 0.4) fired.add('doors-open');
    if (t > 0.4 + stationTimings.psdOpenDelay) fired.add('psd-open');
    if (t > 0.4 + stationTimings.psdOpenDelay + 0.6) fired.add('pa-alight');
    if (t > 1.6) fired.add('exchange');
    if (t > 6) fired.add('pa-agent');
    if (t > PASS_ROLL_AT) fired.add('pass-roll');
    if (t >= melodyStartAt(stationIndex, dwell)) fired.add('melody');
    if (t >= melodyCutAt(stationIndex, dwell)) fired.add('melody-cut');
    if (t >= dwell - CLOSE_ANNOUNCE_LEAD) fired.add('announce-close');
    if (t >= dwell - CLOSE_ANNOUNCE_LEAD + 1.2) fired.add('pa-close');
    if (t >= dwell - DOORS_CLOSE_LEAD) fired.add('doors-close');
    if (t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay) fired.add('psd-close');
  } else if (phase === 'depart') {
    fired.add('advance');
    if (t >= DEPART_HOLD - 1.2) fired.add('brake-release');
  }
}

/**
 * Reprend le cycle station à un instant donné du dwell — utilisé quand le
 * joueur remonte dans une rame après avoir attendu sur le quai. Les portes
 * sont déjà dans le bon état (platformWait a joué la même chorégraphie) ;
 * seul le jeu d'événements déjà déclenchés doit être rétabli, sans quoi la
 * mélodie se rejouerait ou l'annonce de fermeture serait sautée.
 */
export function resumeDwellAt(t: number, stationIndex: number): void {
  const store = useStore.getState();
  store.setIndex(stationIndex);
  store.setPlatformIndex(stationIndex);
  store.setPhase('dwell');
  runtime.phaseT = t;
  runtime.speed = 0;
  runtime.accel = 0;
  seedFired('dwell', t, stationIndex, store.loopDirection);
}

/**
 * Point d'entrée sur la boucle : phase, progression, vitesse, portes.
 * À appeler avant start(), une fois l'audio initialisé.
 *
 * @param stationIndex Gare choisie (0–29). Absent → tirage aléatoire.
 *   La phase reste tirée au hasard autour de cette gare (en route, freinage,
 *   à quai, départ) pour garder la variété du boarding actuel.
 * @param direction Sens de circulation. Absent → tirage à pile ou face : la
 *   Yamanote fait tourner autant de rames dans un sens que dans l'autre, et
 *   monter au hasard sur la boucle, c'est monter au hasard sur l'un des deux.
 */
export function randomizeEntry(stationIndex?: number, direction?: LoopDirection): void {
  const station =
    stationIndex == null ? Math.floor(Math.random() * 30) : wrapStation(stationIndex);
  const dir = direction ?? randomDirection();
  // Le sens AVANT tout le reste : il commande la durée de croisière du tronçon
  // (on n'arrive pas à la même gare par le même côté), donc PHASE_ORDER.
  useStore.getState().setLoopDirection(dir);
  // Pré-positionne l'index pour que dwellDuration() voie la bonne gare, et
  // tire sa chronologie : PHASE_ORDER a besoin de la durée du dwell.
  useStore.getState().setIndex(station);
  randomizeStopTimings(station);
  randomizeBerthOffset();

  const phases = PHASE_ORDER(station, dir);
  const total = phases.reduce((sum, p) => sum + p.dur, 0);
  let r = Math.random() * total;
  let phase: Phase = 'cruise';
  let dur: number = cruiseDuration(station, dir);
  for (const p of phases) {
    if (r < p.dur) {
      phase = p.phase;
      dur = p.dur;
      break;
    }
    r -= p.dur;
  }

  // Évite de spawner pile à la bascule de phase.
  const phaseT = Math.random() * Math.max(0.05, dur - 0.2);
  // En depart, l'index a déjà avancé vers la gare suivante.
  const index = phase === 'depart' ? nextStation(station, dir) : station;
  const doorStation = phase === 'depart' ? station : index;
  const doorSide = DOOR_SIDE[doorStation];
  const sim = simulatePhaseState(phase, phaseT, phase === 'depart' ? index : station);

  const store = useStore.getState();
  store.setPhase(phase);
  store.setIndex(index);
  // En depart, le quai qu'on longe est encore celui de la gare quittée.
  store.setPlatformIndex(doorStation);
  store.setDoorSide(doorSide);
  updatePlatformSpeakers();

  emergencyAt = -1;
  stationsToEmergency = drawEmergencyGap(true);
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
  // On n'entre jamais en jeu au milieu d'un incident de porte : la fermeture
  // qui l'aurait déclenché est passée avant qu'on soit là.
  resetDoorObstruction();

  seedPlatformPresence(phase, phaseT);
  if (phase === 'brake' || phase === 'dwell') seedPlatformCrowd(index);
  else if (phase === 'depart') seedPlatformCrowd(doorStation);
  else clearPlatformCrowd();

  seedFired(phase, phaseT, doorStation, dir);
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
  integrateTrain(state, target, dt, em.stage === 'braking');
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
      const cruiseSec = cruiseDuration(s.index, s.loopDirection);
      once('doorside', true, () => {
        s.setDoorSide(DOOR_SIDE[s.index]);
        // Les haut-parleurs du quai passent du côté qui s'ouvrira.
        updatePlatformSpeakers();
      });
      // La foule ne s'évapore que quand le quai qui la porte est hors de vue :
      // en début de croisière, il défile encore le long des vitres
      // (platformIndex ne rejoint index qu'à ce moment-là).
      once('crowd-clear', s.index === s.platformIndex, () => clearPlatformCrowd());
      // Où la rame se posera à la gare suivante. Tiré une fois le quai
      // précédent évacué : c'est la même valeur qui le portait encore le long
      // des vitres, on ne la change pas sous ses travées.
      once('berth', s.index === s.platformIndex, () => randomizeBerthOffset());
      // Séquence JR départ : 列車案内? → 次駅 → 乗換? → 案内(0–2).
      once('announce-depart', t > 0.6, () =>
        say(departureSequence(s.index, DOOR_SIDE[s.index], s.loopDirection)),
      );
      // Arrêt d'urgence : la course qui le porte est décidée gares à l'avance,
      // ne reste ici qu'à choisir l'instant — en pleine course, assez tôt pour
      // avoir le temps de repartir avant l'annonce d'approche.
      once('emergency-roll', true, () => {
        emergencyAt = -1;
        if (stationsToEmergency > 0) {
          stationsToEmergency -= 1;
          return;
        }
        const latest = Math.min(
          EMERGENCY_AT_MIN + EMERGENCY_AT_SPAN,
          cruiseSec - APPROACH_ANNOUNCE_LEAD - EMERGENCY_APPROACH_MARGIN,
        );
        // Tronçon trop court pour l'accueillir (Mejiro→Takadanobaba tient en
        // 8 s de croisière) : l'événement n'est pas perdu, il attend la gare
        // suivante.
        if (latest <= EMERGENCY_AT_MIN) return;
        emergencyAt = EMERGENCY_AT_MIN + Math.random() * (latest - EMERGENCY_AT_MIN);
        stationsToEmergency = drawEmergencyGap();
      });
      if (emergencyAt >= 0 && t >= emergencyAt) {
        emergencyAt = -1;
        beginEmergencyStop();
        break;
      }
      // Séquence JR approche : まもなく(+portes) → 乗換?, lancée avant le
      // freinage pour que les grandes gares finissent autour de l'arrêt.
      once('announce-soon', t >= cruiseSec - APPROACH_ANNOUNCE_LEAD, () =>
        say(approachSequence(s.index, DOOR_SIDE[s.index])),
      );
      // Petits événements sonores de course, rares et discrets : crissement
      // de boudin dans une courbe, purge d'air sous le plancher.
      if (nextRunSoundAt >= 0 && t >= nextRunSoundAt) {
        if (s01 > 0.5) {
          if (Math.random() < 0.6) audio.flangeSqueal(0.35 + Math.random() * 0.5);
          else audio.airCompressorPurge();
        }
        scheduleNextRunSound(t);
      }
      if (t >= cruiseSec) enterPhase('brake');
      break;
    }
    case 'brake': {
      // Nouveau tirage des retards de portes et de la chronologie de l'arrêt
      // pour cette gare — avant le dwell, dont il fixe la durée.
      once('door-timings', true, () => {
        randomizeDoorTimings();
        randomizeStopTimings(s.index);
        // Et le tirage de l'incident : cet arrêt-ci verra-t-il une porte
        // bloquée ? La réponse dépend surtout du monde qui monte.
        armDoorObstruction();
      });
      // Mise en action des freins : purge d'air au tout début du freinage.
      once('brake-apply', true, () => audio.brakeApply());
      once('jingle', true, () => audio.arrivalJingle());
      // Foule déjà en place dès le début du freinage : on la voit arriver
      // avec le quai, opaque, le long des vitres.
      once('crowd-seed', true, () => seedPlatformCrowd(s.index));
      // (L'annonce d'approche part en fin de cruise, voir APPROACH_ANNOUNCE_LEAD.)
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
      // La sono du QUAI, entendue de l'intérieur : seulement ce qui passe par
      // les portes ouvertes. Le carillon d'approche et l'avertissement
      // d'entrée sont déjà finis quand on s'arrête ; restent le nom de la gare,
      // l'agent qui presse l'échange et la fermeture voie par voie.
      once('pa-arrival', t > 0.9, () => paArrival(s.index));
      once('doors-open', t > 0.4, () => {
        setTrainDoors(1);
        audio.doorOpenChime();
      });
      // Les portes palières s'ouvrent avec un temps de retard sur la rame,
      // variable selon la gare.
      once('psd-open', t > 0.4 + stationTimings.psdOpenDelay, () => setPsdDoors(1));
      once('pa-alight', t > 0.4 + stationTimings.psdOpenDelay + 0.6, () => paAlightFirst());
      once('exchange', t > 1.6, () => exchangePassengers(s.doorSide));
      once('pa-agent', t > 6, () => paAgentMessage());
      // La voie d'en face, quand elle n'est pas la nôtre : un rapide peut la
      // traverser pendant qu'on est à quai. Le créneau va d'ici à l'annonce de
      // fermeture du quai — la seule chose que la gare ait encore à dire — et
      // c'est lui qui décide si l'annonce de passage tient en japonais et en
      // anglais, en japonais seul, ou pas du tout.
      once('pass-roll', t > PASS_ROLL_AT, () => {
        if (!rollPassThrough(s.index, dwell)) return;
        startPassThrough(s.index, dwell - CLOSE_ANNOUNCE_LEAD + 1.2 - PASS_ROLL_AT);
      });

      // Maintien / signal / urgence : stop mélodie, toutes portes rouvertes.
      // (Une porte qui coince, elle, ne rouvre pas la rame — voir plus bas.)
      if (isDepartureHeldOpen()) {
        cancelDepartureMelody();
        if (runtime.doorTarget !== 1) setTrainDoors(1);
        if (runtime.psdTarget !== 1) setPsdDoors(1);
        // On retient l'horloge juste avant la mélodie et on réarme la fin de
        // procédure : au déblocage, la 発車メロディ est relancée pour la
        // nouvelle tentative de départ, puis annonce → fermeture → départ
        // s'enchaînent dans l'ordre au lieu de partir tous dans la même frame.
        runtime.phaseT = Math.min(runtime.phaseT, melodyStartAt(s.index, dwell));
        fired.delete('melody');
        fired.delete('melody-cut');
        fired.delete('announce-close');
        fired.delete('pa-close');
        fired.delete('doors-close');
        fired.delete('psd-close');
        break;
      }

      // Séquence de départ fidèle : la mélodie (発車メロディ) démarre une
      // vingtaine de secondes après l'arrêt, portes ouvertes depuis longtemps,
      // tourne une dizaine de secondes, puis le chef de train la coupe —
      // l'annonce de fermeture prend le relais sur ce silence.
      once('melody', t >= melodyStartAt(s.index, dwell), () =>
        audio.departureMelody(s.index),
      );
      once('melody-cut', t >= melodyCutAt(s.index, dwell), () => interruptDepartureMelody());
      once('announce-close', t >= dwell - CLOSE_ANNOUNCE_LEAD, () =>
        say(doorsClosingAnnouncement()),
      );
      // Le quai dit la même chose une seconde plus tard, mais lui nomme la
      // voie : les deux annonces se répondent par-dessus les portes ouvertes.
      once('pa-close', t >= dwell - CLOSE_ANNOUNCE_LEAD + 1.2, () => paDoorsClosing(s.index));
      once('doors-close', t >= dwell - DOORS_CLOSE_LEAD, () => {
        setTrainDoors(0);
        audio.doorCloseChime();
        // Si une porte doit coincer à cet arrêt, c'est maintenant qu'elle
        // quitte l'ensemble : elle part avec les autres et s'arrêtera en fin
        // de course, sur ce qui est resté dedans.
        onDoorsClosing();
      });
      // Puis le quai referme ses portes, nettement après la rame, avec un
      // décalage lui aussi variable selon la gare.
      once('psd-close', t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay, () => {
        setPsdDoors(0);
        paPsdBeeps();
      });
      // Une porte tenue ouverte par un voyageur ou un objet : le circuit de
      // départ n'est pas établi et l'indication de départ n'apparaît pas en
      // cabine. On retient l'horloge au bord de la bascule — la chronologie de
      // l'arrêt est finie, il ne reste plus qu'à attendre que la porte se
      // ferme. La procédure, elle, vit dans systems/doorObstruction.
      if (doorObstructionActive()) {
        runtime.phaseT = Math.min(runtime.phaseT, dwell - 0.01);
        break;
      }
      if (t >= dwell) enterPhase('depart');
      break;
    }
    case 'depart': {
      once('advance', true, () => s.setIndex(nextStation(s.index, s.loopDirection)));
      // Desserrage des freins juste avant la mise en mouvement.
      once('brake-release', t >= DEPART_HOLD - 1.2, () => audio.brakeRelease());
      if (t >= CONFIG.departTime) enterPhase('cruise');
      break;
    }
  }
}

// Outils dev, dans la console du navigateur : __emergencyStop() déclenche un
// arrêt d'urgence, __runtime donne accès à l'état continu (vitesse, phase…),
// __setTrainZ(z) déplace la rame le long de la voie (le décor ne bouge pas),
// __setDirection('outer') retourne la rame sans quitter la boucle.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.__emergencyStop = beginEmergencyStop;
  w.__runtime = runtime;
  w.__setTrainZ = (z: number) => {
    runtime.trainZ = z;
  };
  w.__setDirection = (dir: LoopDirection) => useStore.getState().setLoopDirection(dir);
  // Saut direct à un instant d'une phase, sans attendre le cycle réel.
  w.__jumpTo = (phase: Phase, t = 0, station?: number) => {
    const store = useStore.getState();
    const index = station ?? store.index;
    store.setIndex(index);
    store.setPlatformIndex(index);
    store.setPhase(phase);
    store.setDoorSide(DOOR_SIDE[index]);
    updatePlatformSpeakers();
    randomizeStopTimings(index);
    randomizeBerthOffset();
    runtime.phaseT = t;
    const sim = simulatePhaseState(phase, t, index);
    runtime.speed = sim.v;
    runtime.accel = sim.a;
    if (phase === 'dwell') seedDoorsForDwell(t, index);
    else seedDoorMotion(0, 999, 0, 999);
    resetDoorObstruction();
    seedPlatformPresence(phase, t);
    if (phase === 'cruise') clearPlatformCrowd();
    else seedPlatformCrowd(index);
    seedFired(phase, t, index, store.loopDirection);
  };
}
