// Machine à états du cycle station : cruise → brake → dwell → depart, avec
// timing quasi réel (~2 min à 2 min 40 par station, selon la durée d'arrêt
// tirée). Déclenche annonces, carillons, mélodies et échanges de passagers aux
// bons instants - voir « Chronologie de l'arrêt » plus bas.

import { CONFIG, V_MAX } from '../data/config';
import { DOOR_SIDE, STATIONS, TRANSFERS } from '../data/stations';
import { nextStation, randomDirection, wrapStation } from '../data/loop';
import { platformFor, type LoopDirection } from '../data/platforms';
import {
  APPROACH_ANNOUNCE_LEAD,
  DEPART_ANNOUNCE_AT,
  approachAnnounceAt,
  cruiseDuration,
} from '../data/segments';
import {
  EMERGENCY_REASONS,
  approachSequence,
  departureSequence,
  doorsClosingAnnouncement,
  emergencyBrakeAnnouncement,
  emergencyResumeAnnouncement,
  emergencyStopAnnouncement,
  emergencyWaitAnnouncement,
  outageRestoredAnnouncement,
  outageStopAnnouncement,
  outageWaitAnnouncement,
} from '../data/announcements';
import { useStore, type Phase } from '../store';
import { advanceClock, runtime } from './runtime';
import {
  createCarPower,
  cutPower,
  resetCarPower,
  restorePower,
  stepCarPower,
  type PowerSoundKind,
} from './carPower';
import {
  DEPART_HOLD,
  integrateTrain,
  phaseTarget,
  stepTrain,
  type BrakeMode,
} from './trainPhysics';
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
  paAgentMessage,
  paAlightFirst,
  paArrival,
  paDoorsClosing,
  updatePlatformSpeakers,
} from './stationPa';
import { lineDelayed, notifyOnboardEmergency, notifyPowerOutage } from './lineDisruption';
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
import { PLATFORM_SCHEDULE } from './platformAnnouncementPlan';
import {
  armDoorObstruction,
  doorObstructionActive,
  onDoorsClosing,
  resetDoorObstruction,
} from './doorObstruction';
import {
  finishReleasedPassengerAssistance,
  resetPassengerAssistance,
  rollPassengerAssistance,
  updatePassengerAssistance,
} from './passengerAssistance';

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
// l'équivalent de la distance réellement parcourue - la gare suivante arrive
// donc au bon moment après la reprise.
//
// Le tirage se faisait auparavant gare par gare, à 1,5 % : une loi géométrique
// laissait passer près de deux trajets d'une demi-heure sur trois sans le
// moindre arrêt d'urgence - la mécanique existait sans jamais se montrer - et
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

// --- Coupure de caténaire (停電) -----------------------------------------
//
// L'autre arrêt subi, et le seul dont la rame ne se relève pas toute seule.
//
// Ce qui se passe, dans l'ordre : la traction disparaît d'un coup et la rame
// roule sur son élan (`coasting`) ; le conducteur la pose au frein pneumatique,
// puisque le freinage par récupération n'a plus de caténaire où renvoyer son
// courant (`braking`) ; elle reste immobile jusqu'au retour de la tension
// (`stopped`), portes closes, sur ses batteries de bord ; puis elle repart.
//
// Le point qui fait tout : une E235-0 de la Yamanote n'a PAS de batterie de
// traction. La fonction est arrivée plus tard, sur les E235-1000 des lignes
// Yokosuka et Sōbu rapide - JR East l'a présentée comme une première. La rame
// verte, elle, attend, et c'est pour ça que l'immobilisation se compte en
// minutes là où un 急停車 se compte en secondes.
//
// Rareté : bien plus rare que le coup de frein - de l'ordre d'une fois par
// heure et demie à trois heures de trajet. Assez pour qu'une session ordinaire
// ne la voie jamais, ce qui est exactement la fréquence d'une vraie panne
// d'alimentation ; le premier tirage est rapproché pour qu'une longue boucle
// puisse la vivre. En développement, `__powerOutage()` la déclenche.

/** Écart entre deux coupures, en gares (~2 min 20 l'une). */
const OUTAGE_GAP_MIN = 34;
const OUTAGE_GAP_MAX = 70;
/** Écart avant la toute première. */
const OUTAGE_FIRST_MIN = 14;
const OUTAGE_FIRST_MAX = 38;
/**
 * Marche sur l'élan avant que le conducteur ne serre les freins (s). Le temps
 * de comprendre que ce n'est pas un simple manque de tension passager.
 */
const OUTAGE_COAST_MIN = 2.2;
const OUTAGE_COAST_MAX = 3.8;
/**
 * Immobilisation : de 2 min 50 à 5 min 40. Une vraie panne de caténaire tient
 * les rames bien plus longtemps - près d'une heure lors de la panne de Tamachi
 * du 16 janvier 2026, avant l'évacuation à pied de quelque 4 000 voyageurs -
 * mais le jeu n'a ni évacuation ni marche le long des voies : au-delà de
 * quelques minutes, il ne resterait plus rien à vivre qu'un écran fixe.
 */
const OUTAGE_HOLD_MIN = 170; // s
const OUTAGE_HOLD_MAX = 340; // s
/** Avance du retour de la tension sur le redémarrage (s). */
const OUTAGE_RESTORE_LEAD = 24;
/** Délai entre le retour de la tension et l'annonce de reprise (s). */
const OUTAGE_RESTORE_TO_ANNOUNCE = 9;
/** Annonce du conducteur après l'immobilisation (s) : le temps d'appeler le PC. */
const OUTAGE_ANNOUNCE_AT = 14;

/** Gares restant à parcourir avant la prochaine coupure. */
let stationsToOutage = drawOutageGap(true);
// Instant de déclenchement dans la phase cruise courante, -1 = aucun.
let outageAt = -1;
/** Durée de la marche sur l'élan tirée pour la coupure en cours (s). */
let outageCoastFor = 0;

function drawOutageGap(first = false): number {
  const min = first ? OUTAGE_FIRST_MIN : OUTAGE_GAP_MIN;
  const max = first ? OUTAGE_FIRST_MAX : OUTAGE_GAP_MAX;
  return min + Math.floor(Math.random() * (max - min + 1));
}

// --- Alimentation de bord -------------------------------------------------
//
// La forme de l'affaissement et celle du retour vivent dans systems/carPower,
// qui n'a aucune dépendance et se teste tel quel. Ici, on ne fait que la faire
// avancer et la publier dans runtime, où le rendu et le moteur audio la lisent.

const carPower = createCarPower();

/**
 * Ce qui reste éclairé, sonore et affiché suit `runtime.carPower` et
 * `runtime.emergencyLight` ; le reste du jeu n'a pas à savoir qu'une coupure
 * existe.
 */
/**
 * Niveau imposé à la main, en développement seulement (`__holdPower`).
 *
 * Le clignotement dure moins de deux secondes et n'existe qu'en mouvement :
 * sur un rendu logiciel, où une image prend un quart de seconde, il est
 * consommé en quelques frames et il n'y a rien à regarder. Ce point d'arrêt
 * fige l'alimentation à un niveau choisi pour qu'on puisse voir de quoi le
 * wagon a l'air À MI-DÉCROCHAGE, et régler les seuils en connaissance de cause.
 */
let heldPower: number | null = null;

/** Bruits électriques que le pas courant vient de traverser (réutilisé). */
const powerHeard: PowerSoundKind[] = [];

/**
 * Prochain déclic isolé dans le noir, en temps d'immobilisation (s) ;
 * -1 = plus aucun.
 *
 * Une rame sur batteries n'est pas muette, et cinq minutes de silence total
 * s'entendent comme un bug audio plutôt que comme une panne. De loin en loin,
 * un relais travaille - assez espacé pour qu'on ne l'attende pas, assez présent
 * pour qu'on sache que quelque chose vit encore là-dedans.
 */
const BATTERY_TICK_MIN = 9; // s
const BATTERY_TICK_MAX = 26; // s
let nextBatteryTickAt = -1;

function scheduleBatteryTick(from: number): void {
  nextBatteryTickAt = from + BATTERY_TICK_MIN + Math.random() * (BATTERY_TICK_MAX - BATTERY_TICK_MIN);
}

function updateCarPower(dt: number): void {
  powerHeard.length = 0;
  stepCarPower(carPower, dt, powerHeard);
  // Les instants sont dans la séquence, les timbres dans le moteur audio : ce
  // qu'on voit clignoter et ce qu'on entend claquer ne peuvent pas se décaler.
  for (const kind of powerHeard) audio.powerSound(kind);
  runtime.carPower = heldPower ?? carPower.power;
  runtime.emergencyLight = carPower.emergency;
}

/**
 * Déclenche la coupure de caténaire (aussi exposé en dev : __powerOutage()).
 *
 * Aucune annonce ici, et c'est le fond de l'affaire : la sonorisation
 * automatique est morte avec le convertisseur. Ce qu'on entend au moment de la
 * coupure, ce sont des sons qui S'ARRÊTENT - l'onduleur, la climatisation -,
 * pas un message. Le conducteur ne parlera qu'une fois la rame posée, au
 * combiné, sur les batteries.
 */
export function beginPowerOutage(): void {
  const em = runtime.emergencyStop;
  if (em.stage === 'coasting' || em.stage === 'braking' || em.stage === 'stopped') return;
  if (useStore.getState().phase !== 'cruise') return;
  em.kind = 'outage';
  em.stage = 'coasting';
  em.t = 0;
  em.holdFor = OUTAGE_HOLD_MIN + Math.random() * (OUTAGE_HOLD_MAX - OUTAGE_HOLD_MIN);
  em.reason = 0;
  outageCoastFor = OUTAGE_COAST_MIN + Math.random() * (OUTAGE_COAST_MAX - OUTAGE_COAST_MIN);
  for (const key of OUTAGE_KEYS) fired.delete(key);
  cutPower(carPower);
  // Une annonce en cours ne se termine pas : l'amplificateur s'éteint au
  // milieu du mot. Seulement celle de la rame - la gare, elle, a son propre
  // réseau.
  cancelSpeech('cabin');
  // La ligne prend du retard, et le quai en nommera la cause : c'est le seul
  // incident dont l'annonce de retard dit exactement ce que le joueur a vécu.
  notifyPowerOutage(useStore.getState().loopDirection, useStore.getState().index, runtime.clockMin, runtime.stopSequence);
  // Personne ne sursaute : rien n'a secoué. Ce sont les têtes qui se lèvent -
  // vers le plafond, vers les écrans noirs, vers le voisin.
  pushSceneEvent('outage');
}

/** Clés `fired` de la séquence de coupure, ré-armées à chaque déclenchement. */
const OUTAGE_KEYS = ['po-stopped', 'po-wait', 'po-restored', 'po-announce', 'po-waiting-scared'];

// Étapes de la coupure, appelées chaque frame tant qu'elle est active.
function updatePowerOutage(dt: number): void {
  const em = runtime.emergencyStop;
  em.t += dt;
  switch (em.stage) {
    case 'coasting':
      // La rame roule sur son élan. Le conducteur la freine ensuite : freinage
      // de service au pneumatique, pas de coup de frein d'urgence - rien ne
      // s'est mis en travers de la voie, l'alimentation a disparu.
      if (em.t >= outageCoastFor || runtime.speed <= 0.01) {
        em.stage = 'braking';
        em.t = 0;
        audio.brakeApply();
        audio.flangeSqueal(0.4);
      }
      break;
    case 'braking':
      if (runtime.speed <= 0.01) {
        runtime.speed = 0;
        runtime.accel = 0;
        em.stage = 'stopped';
        em.t = 0;
        audio.stopSettle();
        // Le chrono des déclics part de l'immobilisation : c'est de là que se
        // compte l'attente, et c'est `em.t` qu'ils lisent.
        scheduleBatteryTick(0);
      }
      break;
    case 'stopped':
      // Le conducteur, au combiné, une fois le PC joint.
      once('po-stopped', em.t >= OUTAGE_ANNOUNCE_AT, () => say(outageStopAnnouncement()));
      // Puis l'attente s'installe, et elle ne ressemble pas à celle d'un coup
      // de frein : il n'y a rien eu à voir, juste une rame qui s'est tue.
      once('po-waiting-scared', em.t >= OUTAGE_ANNOUNCE_AT + 22, () => pushSceneEvent('outage'));
      once('po-wait', em.t >= em.holdFor * 0.55, () => say(outageWaitAnnouncement()));
      // Le retour de la tension : d'abord la lumière, l'annonce ensuite. Dans
      // cet ordre - c'est la lumière qui prévient tout le wagon, pas la voix.
      once('po-restored', em.t >= em.holdFor - OUTAGE_RESTORE_LEAD, () => {
        restorePower(carPower);
        // Plus de déclics isolés : il y a mieux à écouter.
        nextBatteryTickAt = -1;
        pushSceneEvent('powerBack');
      });
      // Et pendant tout ce temps, la rame n'est pas muette : un relais
      // travaille quelque part sous le plancher, de loin en loin.
      if (nextBatteryTickAt >= 0 && em.t >= nextBatteryTickAt) {
        audio.batteryTick();
        scheduleBatteryTick(em.t);
      }
      once(
        'po-announce',
        em.t >= em.holdFor - OUTAGE_RESTORE_LEAD + OUTAGE_RESTORE_TO_ANNOUNCE,
        () => say(outageRestoredAnnouncement()),
      );
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

/**
 * Déclenche l'arrêt d'urgence (aussi exposé en dev : __emergencyStop()).
 * Accepté en course normale comme pendant la remontée en vitesse qui suit un
 * premier arrêt (stage 'resuming') : un nouveau coup de frein est légitime
 * dès que le train se relance. Refusé seulement pendant freinage /
 * immobilisation, où l'événement est déjà en cours.
 */
export function beginEmergencyStop(): void {
  const em = runtime.emergencyStop;
  if (em.stage === 'coasting' || em.stage === 'braking' || em.stage === 'stopped') return;
  if (useStore.getState().phase !== 'cruise') return;
  em.kind = 'brake';
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
  notifyOnboardEmergency(em.reason, useStore.getState().loopDirection, useStore.getState().index, runtime.clockMin, runtime.stopSequence);
  audio.brakeApply();
  audio.flangeSqueal(0.8);
  // Le wagon sursaute - on se raccroche, on trébuche, on lève le nez - et
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
      // vraiment pourquoi. C'est l'attente qui inquiète, maintenant - le
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
// que les portes se ferment - le quai n'expédie pas le morceau pour tenir un
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
 * arrive : dix secondes, alors que les clips vont de 6,4 s à 13,6 s - Sakura
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
 * rame ne s'ébranle (fin du dwell + DEPART_HOLD) - ils le sont largement.
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
 * Creux annoncé au plan d'annonces du quai quand on est DANS la rame (s).
 *
 * De l'intérieur, on n'entend jamais l'annonce anticipée du prochain train - la
 * seule décision du plan qui dépende du creux. La valeur ne sert donc qu'à
 * remplir le contexte, et c'est l'intervalle ordinaire de la Yamanote.
 */
const PLATFORM_PLAN_HEADWAY = 120;

/**
 * Créneaux des messages d'agent, en temps de dwell : les MÊMES que sur le quai.
 *
 * La chronologie est partagée (systems/platformAnnouncementPlan) et ne se
 * redéclare nulle part : ce qu'on entend par les portes ouvertes et ce qu'on
 * entend debout sur le quai sont la même sonorisation, et un écart de quelques
 * secondes entre les deux points d'écoute ferait dire deux choses différentes au
 * même haut-parleur selon l'endroit où l'on se tient.
 */
const AGENT_EXCHANGE_AT = PLATFORM_SCHEDULE.agentExchangeAt;
const AGENT_PRE_MELODY_LEAD = PLATFORM_SCHEDULE.agentPreMelodyLead;

/**
 * Instant du tirage d'un passage sur la voie d'en face, en temps de dwell :
 * après le nom de la gare, l'agent et « laissez descendre », avant l'annonce
 * de fermeture. C'est le seul silence de l'arrêt, et il n'est pas long.
 */
const PASS_ROLL_AT = 12.0;

/**
 * Instant du second message d'agent (temps de dwell).
 *
 * Il vise la mélodie - assez tôt pour finir dessus -, mais il laisse d'abord
 * passer le tirage du train qui traverse : celui-là exige le silence de la sono
 * du quai (`rollPassThrough` renonce si elle parle), et une consigne de plus
 * vaut moins qu'un rapide à trois mètres du bord. Si le passage est tiré, c'est
 * lui qui occupe la file et le message tombe de lui-même (créneau vérifié à la
 * diffusion).
 */
function agentSecondAt(stationIndex: number, dwell: number): number {
  return Math.max(
    PASS_ROLL_AT + 1.5,
    melodyStartAt(stationIndex, dwell) - AGENT_PRE_MELODY_LEAD,
  );
}

/**
 * Chronologie tirée pour l'arrêt en cours. Tirée UNE fois, à l'entrée en
 * freinage : dwellDuration() est appelée à chaque frame par le cycle, par le
 * quai et par l'affichage - elle doit rendre la même valeur du début à la fin
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
 * Bornes tirées de la pratique JR East - la tolérance réglementaire est de
 * ±35 cm, le TASC des lignes équipées de portes palières tient la dizaine de
 * centimètres. On reste dans cette dizaine : de trois à onze centimètres, d'un
 * côté ou de l'autre du repère. C'est assez pour que les portières et les
 * baies palières ne coïncident jamais exactement - le décalage se lit très
 * bien, portes ouvertes, entre les deux montants - et bien trop peu pour gêner
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
 * Part des rames qui se rangent sur la voie SECONDAIRE, là où la gare en a une.
 *
 * Deux gares de la boucle en ont, et `data/platforms` les relève depuis
 * longtemps : Ikebukuro (内 voie 5 au lieu de 6, 外 voie 8 au lieu de 7) et
 * Ōsaki (内 voie 2 au lieu de 1, 外 voie 4 au lieu de 3). Ōsaki est
 * l'aiguillage du dépôt de Tōkaidō et voit passer beaucoup de départs et de
 * terminus : sa voie secondaire sert souvent. Celle d'Ikebukuro est plus rare.
 *
 * Le drapeau `runtime.useAlternativePlatform` existait, était lu quatre fois -
 * et n'était écrit nulle part. Trois clips de 発車メロディ sur dix-neuf étaient
 * donc injouables, avec les prédicats et les fonctions qui allaient avec :
 * JRE-IKST-010-03 (Ōsaki 内 voie 2), JRE-IKST-010-05 (Ōsaki 外 voie 4) et Bic
 * Camera ver.A (Ikebukuro 内 voie 5). Ce tirage les rend au quai.
 */
const ALTERNATIVE_PLATFORM_CHANCE: Record<string, number> = {
  JY24: 0.28, // Ōsaki
  JY13: 0.12, // Ikebukuro
};

/**
 * Où la rame va se ranger : voie principale, ou secondaire quand la gare en a
 * une. Tiré AVANT la chronologie de l'arrêt, parce que c'est le quai qui décide
 * quelle mélodie sonnera, donc quelle fenêtre il faut lui laisser.
 */
function randomizeStopPlatform(stationIndex: number): void {
  const station = STATIONS[stationIndex];
  const info = platformFor(station.jy, useStore.getState().loopDirection);
  const chance =
    info?.alternativePlatform != null ? (ALTERNATIVE_PLATFORM_CHANCE[station.jy] ?? 0) : 0;
  runtime.useAlternativePlatform = Math.random() < chance;
}

/**
 * Tire l'instant de la mélodie pour l'arrêt qui commence, et mesure la fenêtre
 * qu'il faudra lui laisser : deux passages entiers du clip câblé sur CE quai,
 * dans CE sens. C'est ce qui fait qu'un arrêt à Komagome (Sakura Sakura, 13,6 s
 * le passage) dure plus longtemps qu'un arrêt à Takadanobaba (Atom, 6,4 s).
 *
 * La voie est tirée ici, en premier : la fenêtre sonore se mesure sur le clip
 * du quai où la rame se rangera, pas sur celui du quai principal. Un seul point
 * d'entrée pour les deux, et l'ordre ne peut pas se perdre.
 */
export function randomizeStopTimings(stationIndex: number): void {
  randomizeStopPlatform(stationIndex);
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
 * passages faits. Le fondu qui suit ne mord donc sur rien - il referme un
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
  if (phase === 'cruise') {
    scheduleNextRunSound(6);
    rollPassengerAssistance();
  }
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
    // Ni arrêt d'urgence ni coupure sur la toute première course après
    // l'embarquement.
    fired.add('emergency-roll');
    fired.add('outage-roll');
    if (t > DEPART_ANNOUNCE_AT) fired.add('announce-depart');
    if (t >= approachAnnounceAt(cruiseDuration(stationIndex, dir))) fired.add('announce-soon');
  } else if (phase === 'brake') {
    fired.add('door-timings');
    fired.add('brake-apply');
    fired.add('crowd-seed');
    if (speedFor('brake', t, stationIndex) <= 0.01) fired.add('stop-settle');
  } else if (phase === 'dwell') {
    const dwell = dwellDuration(stationIndex);
    if (t > 0.9) fired.add('pa-arrival');
    if (t > 0.4) fired.add('doors-open');
    if (t > 0.4 + stationTimings.psdOpenDelay) fired.add('psd-open');
    if (t > 0.4 + stationTimings.psdOpenDelay + 0.6) fired.add('pa-alight');
    if (t > 1.6) fired.add('exchange');
    if (t > AGENT_EXCHANGE_AT) fired.add('pa-agent');
    if (t > agentSecondAt(stationIndex, dwell)) fired.add('pa-agent-2');
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
 * Reprend le cycle station à un instant donné du dwell - utilisé quand le
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
  // On n'entre jamais en jeu dans le noir : la coupure se tire comme le reste,
  // depuis une rame alimentée.
  outageAt = -1;
  stationsToOutage = drawOutageGap(true);
  resetCarPower(carPower);
  nextBatteryTickAt = -1;
  runtime.carPower = 1;
  runtime.emergencyLight = 0;
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
  resetPassengerAssistance();

  seedPlatformPresence(phase, phaseT);
  if (phase === 'brake' || phase === 'dwell') seedPlatformCrowd(index);
  else if (phase === 'depart') seedPlatformCrowd(doorStation);
  else clearPlatformCrowd();

  seedFired(phase, phaseT, doorStation, dir);
}


export function updateCycle(dt: number): void {
  const s = useStore.getState();
  if (!s.started) return;

  // Pendant un arrêt subi, le chrono de phase avance au prorata de la
  // vitesse : gelé à l'arrêt, cohérent avec la distance pendant freinage et
  // reprise. L'horloge murale, elle, continue - c'est le retard qui se crée.
  const em = runtime.emergencyStop;
  runtime.phaseT += em.stage === 'none' ? dt : dt * (runtime.speed / V_MAX);
  advanceClock(dt);
  // L'alimentation de bord : elle n'existe que pour la coupure, mais elle se
  // remet en place toute seule dans tous les autres cas (reset, entrée en jeu
  // au milieu de rien).
  updateCarPower(dt);

  // --- Physique du train : profil jerk-limité type E235 ---
  // Sous-pas de 0,1 s max : un dt de rattrapage (onglet lent) resterait stable.
  const stopping = em.stage === 'coasting' || em.stage === 'braking' || em.stage === 'stopped';
  const target = stopping ? 0 : phaseTarget(s.phase, runtime.phaseT);
  // Sur l'élan, rien ne retient la rame ; sous coup de frein d'urgence, tout
  // la retient d'un coup ; une coupure de caténaire, elle, se termine au frein
  // pneumatique ordinaire - la récupération n'a plus de ligne où renvoyer son
  // courant, mais la décélération de service, elle, ne change pas.
  const brakeMode: BrakeMode =
    em.stage === 'coasting' ? 'coast' : em.stage === 'braking' && em.kind === 'brake' ? 'emergency' : 'service';
  const state = { v: runtime.speed, a: runtime.accel, d: runtime.distance };
  integrateTrain(state, target, dt, brakeMode);
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

  // --- Arrêt subi en cours : la machine à phases attend la fin. ---
  if (em.stage !== 'none') {
    if (em.kind === 'outage') updatePowerOutage(dt);
    else updateEmergencyStop(dt);
    return;
  }

  // --- Phases ---
  // (La présence spatiale du quai est pilotée après updateSegmentEnv, dans
  // Engine - plus de fondu d'opacité à basse vitesse.)
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
      once('announce-depart', t > DEPART_ANNOUNCE_AT, () =>
        say(departureSequence(s.index, DOOR_SIDE[s.index], s.loopDirection)),
      );
      // Coupure de caténaire : même tirage que l'arrêt d'urgence, mais bien
      // plus espacé - et elle passe devant, parce qu'elle immobilise la rame
      // plusieurs minutes là où l'autre la retient une poignée de secondes.
      once('outage-roll', true, () => {
        outageAt = -1;
        if (stationsToOutage > 0) {
          stationsToOutage -= 1;
          return;
        }
        const latest = Math.min(
          EMERGENCY_AT_MIN + EMERGENCY_AT_SPAN,
          cruiseSec - APPROACH_ANNOUNCE_LEAD - EMERGENCY_APPROACH_MARGIN,
        );
        if (latest <= EMERGENCY_AT_MIN) return;
        outageAt = EMERGENCY_AT_MIN + Math.random() * (latest - EMERGENCY_AT_MIN);
        stationsToOutage = drawOutageGap();
      });
      // Arrêt d'urgence : la course qui le porte est décidée gares à l'avance,
      // ne reste ici qu'à choisir l'instant - en pleine course, assez tôt pour
      // avoir le temps de repartir avant l'annonce d'approche.
      once('emergency-roll', true, () => {
        emergencyAt = -1;
        // Une coupure est armée pour cette course : on ne lui superpose pas un
        // coup de frein. Le compte à rebours de l'urgence n'est pas consommé,
        // elle tombera à la gare suivante.
        if (outageAt >= 0) return;
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
      if (outageAt >= 0 && t >= outageAt) {
        outageAt = -1;
        beginPowerOutage();
        break;
      }
      if (emergencyAt >= 0 && t >= emergencyAt) {
        emergencyAt = -1;
        beginEmergencyStop();
        break;
      }
      // Séquence JR approche : まもなく(+portes) → 乗換?, lancée avant le
      // freinage pour que les grandes gares finissent autour de l'arrêt.
      once('announce-soon', t >= approachAnnounceAt(cruiseSec), () =>
        say(approachSequence(s.index, DOOR_SIDE[s.index], s.loopDirection)),
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
      // pour cette gare - avant le dwell, dont il fixe la durée.
      once('door-timings', true, () => {
        randomizeDoorTimings();
        randomizeStopTimings(s.index);
        // Et le tirage de l'incident : cet arrêt-ci verra-t-il une porte
        // bloquée ? La réponse dépend surtout du monde qui monte.
        armDoorObstruction();
      });
      // Mise en action des freins : purge d'air au tout début du freinage.
      once('brake-apply', true, () => audio.brakeApply());
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
      // Machine dediee: elle attend l'ouverture effective puis tient le meme
      // bloqueur de depart que les autres incidents. Son chrono reste reel
      // tandis que phaseT est retenu avant la melodie ci-dessous.
      updatePassengerAssistance(dt);
      finishReleasedPassengerAssistance();
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
      // Ce que l'agent de quai dit par les portes ouvertes suit le même plan que
      // sur le quai (systems/platformAnnouncementPlan) : zéro, un ou deux
      // messages selon l'affluence, l'heure, la gare et le retard - et plus
      // « laissez descendre » à chaque ouverture de portes.
      once('pa-alight', t > 0.4 + stationTimings.psdOpenDelay + 0.6, () =>
        paAlightFirst(s.index, PLATFORM_PLAN_HEADWAY, melodyStartAt(s.index, dwell) - t),
      );
      once('exchange', t > 1.6, () => exchangePassengers(s.doorSide));
      once('pa-agent', t > AGENT_EXCHANGE_AT, () =>
        paAgentMessage(s.index, PLATFORM_PLAN_HEADWAY, 0, melodyStartAt(s.index, dwell) - t),
      );
      // Et le second, s'il y en a un, avant la mélodie et après le tirage du
      // passage : abandonné s'il n'a plus la place de finir sur la première note.
      once('pa-agent-2', t > agentSecondAt(s.index, dwell), () =>
        paAgentMessage(s.index, PLATFORM_PLAN_HEADWAY, 1, melodyStartAt(s.index, dwell) - t),
      );
      // La voie d'en face, quand elle n'est pas la nôtre : un rapide peut la
      // traverser pendant qu'on est à quai. Le créneau va d'ici à l'annonce de
      // fermeture du quai - la seule chose que la gare ait encore à dire - et
      // c'est lui qui décide si l'annonce de passage tient en japonais et en
      // anglais, en japonais seul, ou pas du tout.
      once('pass-roll', t > PASS_ROLL_AT, () => {
        if (!rollPassThrough(s.index, dwell)) return;
        startPassThrough(s.index, dwell - CLOSE_ANNOUNCE_LEAD + 1.2 - PASS_ROLL_AT);
      });

      // Maintien / signal / urgence : stop mélodie, toutes portes rouvertes.
      // (Une porte qui coince, elle, ne rouvre pas la rame - voir plus bas.)
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
      // tourne une dizaine de secondes, puis le chef de train la coupe -
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
      // (L'avertisseur de fermeture part avec les vantaux, depuis les baies
      // elles-mêmes : setPsdDoors s'en charge.)
      once('psd-close', t >= dwell - DOORS_CLOSE_LEAD + stationTimings.psdCloseDelay, () =>
        setPsdDoors(0),
      );
      // Une porte tenue ouverte par un voyageur ou un objet : le circuit de
      // départ n'est pas établi et l'indication de départ n'apparaît pas en
      // cabine. On retient l'horloge au bord de la bascule - la chronologie de
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
// arrêt d'urgence, __powerOutage() une coupure de caténaire, __runtime donne
// accès à l'état continu (vitesse, phase…), __setTrainZ(z) déplace la rame le
// long de la voie (le décor ne bouge pas), __setDirection('outer') retourne la
// rame sans quitter la boucle.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.__emergencyStop = beginEmergencyStop;
  w.__powerOutage = beginPowerOutage;
  // Avance dans la chronologie d'une coupure en cours : `secondsLeft` est le
  // temps qu'on veut laisser avant le redémarrage (négatif = avant, 0 = tout
  // de suite). Sert à regarder le retour de la tension sans attendre cinq
  // minutes - voir scripts/outage-shots.mjs.
  // Fige l'alimentation de bord à un niveau (0..1), `null` pour la rendre à la
  // simulation. Sert à regarder le clignotement image par image - voir
  // scripts/outage-shots.mjs.
  w.__holdPower = (level: number | null) => {
    heldPower = level;
  };
  w.__outageSkip = (secondsLeft = 0) => {
    const em = runtime.emergencyStop;
    if (em.kind !== 'outage' || em.stage !== 'stopped') return;
    em.t = Math.max(em.t, em.holdFor + Math.min(0, secondsLeft));
  };
  w.__runtime = runtime;
  w.__setTrainZ = (z: number) => {
    runtime.trainZ = z;
  };
  w.__setDirection = (dir: LoopDirection) => useStore.getState().setLoopDirection(dir);
  // Saut direct à un instant d'une phase, sans attendre le cycle réel.
  w.__jumpTo = (phase: Phase, t = 0, station?: number) => {
    const store = useStore.getState();
    const index = station ?? store.index;
    // Un arrêt subi ne survit pas à un saut de phase : sans cette remise à
    // zéro, le badge du HUD restait figé sur « arrêt d'urgence » et
    // `beginPowerOutage()` refusait de partir, l'étape précédente étant encore
    // déclarée en cours.
    runtime.emergencyStop.stage = 'none';
    runtime.emergencyStop.kind = 'brake';
    runtime.emergencyStop.t = 0;
    resetCarPower(carPower);
    runtime.carPower = 1;
    runtime.emergencyLight = 0;
    nextBatteryTickAt = -1;
    emergencyAt = -1;
    outageAt = -1;
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
