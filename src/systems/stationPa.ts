// La sonorisation du QUAI : ce que dit la gare, par opposition à ce que dit la
// rame (systems/speech.ts, canal « cabin »).
//
// Deux points d'écoute, deux séquences :
//
//   • Sur le quai, on entend tout, dans l'ordre - pré-annonce, carillon ATOS,
//     annonce d'approche, avertissement d'entrée, arrivée, l'agent pendant
//     l'échange, la mélodie, la fermeture, les bips des portes palières.
//   • Dans la rame arrêtée, on n'entend que ce qui passe par les portes
//     ouvertes : l'arrivée, l'agent, la fermeture. Tout le reste est couvert
//     par la sono du wagon, ou arrive avant qu'on soit là.
//
// Le niveau, lui, n'est pas décidé ici : audioEngine tient le robinet
// (platVoiceGain) et fait de la voix du quai un lointain dès qu'on est à bord.

import { platformFor, type LoopDirection } from '../data/platforms';
import {
  nearestSpeakers,
  PSD_BUZZER_X,
  PSD_BUZZER_Y,
  SPEAKER_GRILLE_DROP,
  speakerX,
} from '../data/stationGeometry';
import { layoutFor } from '../data/stationLayouts';
import {
  platformAgentMessage,
  platformAlightFirstAnnouncement,
  platformApproachAnnouncement,
  platformArrivalAnnouncement,
  platformDisruptionAnnouncement,
  platformDisruptionResumeAnnouncement,
  platformDoorCheckAnnouncement,
  platformDoorReleaseAnnouncement,
  platformDoorsClosingAnnouncement,
  platformGreeting,
  platformPassAnnouncement,
  platformPassWarning,
  platformPreAnnouncement,
  platformTrainEnteringAnnouncement,
  type StationUtterance,
} from '../data/stationAnnouncements';
import { platformNoticesForStation } from '../data/stationAnnouncementRules';
import { STATIONS } from '../data/stations';
import { estimateOccupancy } from './occupancy';
import { useStore } from '../store';
import { psdGates, psdLayout } from '../three/station/psdLayout';
import * as audio from './audioEngine';
import {
  createPlatformAnnouncementPlan,
  fitsBeforeCutoff,
  optionalMessagePlays,
  platformPlanSeed,
  seededRandom,
  trainEnteringPasses,
  type PlatformAnnouncementContext,
  type PlatformAnnouncementPlan,
} from './platformAnnouncementPlan';
import { platformToWorld } from './playerFrame';
import { runtime } from './runtime';
import { say, speechQueueRemaining, utteranceDuration } from './speech';
import { placementFor } from './stationPlacement';
import { lineDisruption, lineDelayed } from './lineDisruption';

/**
 * Sens desservi par le quai où l'on se trouve. Toutes les annonces automatiques
 * japonaises en dépendent - pas seulement pour ce qu'elles disent (le nom de la
 * boucle, les gares repères, le numéro de voie) mais pour la BOUCHE qui le dit :
 * l'automate du 内回り est une femme, celui du 外回り un homme (voir
 * data/stationAnnouncements.atosVoiceForDirection).
 *
 * Le sens est lu ici, une fois, et passé en argument aux fonctions de données -
 * elles n'ont pas à connaître le store.
 */
function dir(): LoopDirection {
  return useStore.getState().loopDirection;
}

/** Numéro de voie desservie, tel qu'il est annoncé (「3番線」). */
export function currentPlatformNumber(index: number): number {
  const station = STATIONS[index];
  const info = platformFor(station.jy, dir());
  if (!info) return 1;
  if (runtime.useAlternativePlatform && info.alternativePlatform != null) {
    return info.alternativePlatform;
  }
  return info.platform;
}

// --- Où sonne la gare -----------------------------------------------------
//
// La sono du quai avait quatre points de diffusion, plantés une fois pour
// toutes autour des portes du milieu. Cela va tant qu'on reste devant la
// voiture 5 ; dix pas plus loin, ils sont tous derrière, et l'annonce se réduit
// à une voix lointaine qui vient d'un seul endroit. Un vrai quai est couvert
// d'un bout à l'autre : c'est même toute la raison d'aligner des diffuseurs
// tous les dix-neuf mètres au lieu d'en poser un gros.
//
// Ces diffuseurs-là existent déjà - on les voit sous l'auvent, systems/
// stationPlacement les répartit et three/station/PlatformKit les dessine. Il
// suffit donc de les DONNER au moteur audio, qui garde un petit jeu de prises
// spatialisées (audioEngine, PLATFORM_TAPS) et n'a pas à savoir d'où elles
// sortent.
//
// On envoie les plus proches de la tête (nearestSpeakers) : le tri est là-bas,
// avec la cote des diffuseurs, parce que c'est de la géométrie de quai.

/** Abscisses retenues, puis positions poussées : réécrites sur place. */
const speakerZs: number[] = [];
const speakerBuf: [number, number, number][] = Array.from(
  { length: audio.platformSpeakerTaps },
  () => [0, 0, 0] as [number, number, number],
);
const speakerWorld = { x: 0, z: 0 };

/**
 * Assigne les prises de la sono du quai aux diffuseurs les plus proches de
 * l'oreille. À appeler une fois par image (three/Engine), APRÈS la présence du
 * quai : c'est elle qui pose le glissement dont dépend le repère.
 */
export function updatePlatformSpeakers(): void {
  const index = useStore.getState().platformIndex;
  const layout = layoutFor(index);
  const x = speakerX(layout.depth);
  const y = layout.canopyY - SPEAKER_GRILLE_DROP;
  // La tête, ramenée au repère du quai : une ligne de diffuseurs ne se trie que
  // sur z, et le joueur y a déjà sa position.
  const n = nearestSpeakers(
    placementFor(index, psdGates()).kit.speakers,
    runtime.playerPlatZ,
    speakerBuf.length,
    speakerZs,
  );
  for (let i = 0; i < n; i++) {
    platformToWorld(x, speakerZs[i], speakerWorld);
    const s = speakerBuf[i];
    s[0] = speakerWorld.x;
    s[1] = y;
    s[2] = speakerWorld.z;
  }
  audio.setPlatformSpeakers(n === speakerBuf.length ? speakerBuf : speakerBuf.slice(0, n));
  updatePsdBuzzers(layout.length);
}

// --- Où sonnent les baies palières ---------------------------------------
//
// L'avertisseur d'ouverture (data/psdOpenChime) ne sort pas de l'auvent : il
// sort du linteau de chaque baie, à hauteur d'épaule et à un pas devant soi.
// Sa ligne se pousse donc exactement comme celle des diffuseurs, mais elle est
// bien plus serrée - une baie tous les cinq mètres - et le moteur n'en panne
// que les quatre plus proches (audioEngine, PSD_TAPS).

/** Axes des baies, par longueur de quai : la trame ne dépend que d'elle. */
let psdGateCache: { length: number; gates: number[] } | null = null;

function psdGateZs(length: number): number[] {
  if (!psdGateCache || psdGateCache.length !== length) {
    psdGateCache = { length, gates: psdLayout(length).gaps };
  }
  return psdGateCache.gates;
}

const psdZs: number[] = [];
const psdBuf: [number, number, number][] = Array.from(
  { length: audio.psdChimeTaps },
  () => [0, 0, 0] as [number, number, number],
);
const psdWorld = { x: 0, z: 0 };

function updatePsdBuzzers(length: number): void {
  // Deux gares de la boucle n'ont pas de portes palières du tout : là, la
  // ligne se tait entièrement plutôt que de sonner depuis un bord de quai nu.
  if (!runtime.psdPresent) {
    audio.setPsdBuzzers([]);
    return;
  }
  const n = nearestSpeakers(psdGateZs(length), runtime.playerPlatZ, psdBuf.length, psdZs);
  for (let i = 0; i < n; i++) {
    platformToWorld(PSD_BUZZER_X, psdZs[i], psdWorld);
    const b = psdBuf[i];
    b[0] = psdWorld.x;
    b[1] = PSD_BUZZER_Y;
    b[2] = psdWorld.z;
  }
  audio.setPsdBuzzers(n === psdBuf.length ? psdBuf : psdBuf.slice(0, n));
}

// --- Retard de la ligne ---------------------------------------------------
// L'état et sa durée vivent exclusivement dans systems/lineDisruption. Ce
// module transforme son instantané en paroles et ne mémorise aucun incident.

function disruptionContext() {
  if (!lineDisruption.cause || lineDisruption.locationStationIndex == null || !lineDisruption.affectedDirections) return null;
  return {
    cause: lineDisruption.cause, direction: lineDisruption.affectedDirections, voiceDirection: dir(),
    locationStationIndex: lineDisruption.locationStationIndex,
    locationNextStationIndex: lineDisruption.locationNextStationIndex,
    estimatedResumeClockMin: lineDisruption.estimatedResumeClockMin,
  };
}

/** Met en file une information de perturbation si le prochain message prioritaire le permet. */
export function paLineDisruption(cutoffIn = Number.POSITIVE_INFINITY): boolean {
  const context = disruptionContext(); if (!context) return false;
  const items = platformDisruptionAnnouncement(context, lineDisruption.phase === 'suspended');
  if (!fitsBeforeCutoff(utteranceDuration(items), speechQueueRemaining('platform'), cutoffIn)) return false;
  say(items, 'platform'); return true;
}

export function paLineDisruptionResume(cutoffIn = Number.POSITIVE_INFINITY): boolean {
  const context = disruptionContext(); if (!context) return false;
  const items = platformDisruptionResumeAnnouncement({ ...context, resumedAtClockMin: runtime.clockMin });
  if (!fitsBeforeCutoff(utteranceDuration(items), speechQueueRemaining('platform'), cutoffIn)) return false;
  say(items, 'platform'); return true;
}

// --- Le plan d'annonces de l'attente en cours ----------------------------
//
// Une seule décision par rame attendue : ce qui va passer, et ce qui ne passera
// pas. Le calcul lui-même est pur (systems/platformAnnouncementPlan) ; ce qui
// vit ici, c'est la lecture du monde - l'heure de Tokyo, l'affluence estimée du
// tronçon, le retard - et la mémoire du plan jusqu'au départ de la rame.

/** Affluence normalisée (0–1) à partir du taux de remplissage estimé. */
const CROWD_FROM_PERCENT = 30;
const CROWD_TO_PERCENT = 150;

/**
 * Affluence du tronçon qui part de cette gare, ramenée entre 0 et 1.
 *
 * On lit le modèle de remplissage (systems/occupancy) plutôt que le nombre de
 * PNJ présents sur le quai : celui-là dépend du réglage de qualité vidéo, et la
 * sonorisation d'une gare ne doit pas changer parce qu'on a baissé les détails.
 */
function crowdLevelFor(index: number, direction: LoopDirection): number {
  const { percent } = estimateOccupancy({
    fromIndex: index,
    minutes: runtime.clockMin,
    date: runtime.tokyoDate,
    direction,
  });
  const t = (percent - CROWD_FROM_PERCENT) / (CROWD_TO_PERCENT - CROWD_FROM_PERCENT);
  return Math.max(0, Math.min(1, t));
}

/** Plan en cours, et la rame à laquelle il appartient. */
let plan: PlatformAnnouncementPlan | null = null;
let planStop = -1;

/**
 * Contexte du plan, tel que la gare le voit à cet instant. Exporté pour la mise
 * au point : c'est la seule entrée du tirage.
 */
export function platformAnnouncementContext(
  index: number,
  headwaySeconds: number,
  stopSequence = runtime.stopSequence,
): PlatformAnnouncementContext {
  const direction = dir();
  return {
    stationIndex: index,
    direction,
    headwaySeconds,
    hour: runtime.clockMin / 60,
    crowdLevel: crowdLevelFor(index, direction),
    delayed: lineDelayed(),
    stopSequence,
  };
}

/**
 * Établit le plan de la rame attendue. Appelé UNE fois par attente - à l'entrée
 * du creux entre deux rames, ou à l'arrivée d'une rame pour ce qu'elle dira à
 * quai. Rappelé pour le même arrêt, il ne retire rien : la graine ne dépend que
 * de l'arrêt, donc le plan est le même.
 */
export function planPlatformAnnouncements(
  index: number,
  headwaySeconds: number,
  stopSequence = runtime.stopSequence,
): PlatformAnnouncementPlan {
  const context = platformAnnouncementContext(index, headwaySeconds, stopSequence);
  plan = createPlatformAnnouncementPlan(context, seededRandom(platformPlanSeed(context)));
  planStop = stopSequence;
  return plan;
}

/**
 * Le plan en cours. Jamais null pour l'appelant : sans plan établi (entrée en
 * jeu au milieu d'un arrêt), on en fabrique un pour l'arrêt courant plutôt que
 * de laisser la gare muette.
 */
export function currentPlatformPlan(
  index: number,
  headwaySeconds: number,
  stopSequence = runtime.stopSequence,
): PlatformAnnouncementPlan {
  if (!plan || planStop !== stopSequence) {
    return planPlatformAnnouncements(index, headwaySeconds, stopSequence);
  }
  return plan;
}

// --- Séquence d'approche --------------------------------------------------

/**
 * Annonce anticipée du prochain train, éventuellement précédée du remerciement.
 *
 * `cutoffIn` est le temps qui reste avant l'annonce d'approche, qui elle n'est
 * pas facultative : si l'anticipée n'y tient pas (une excuse de retard vient de
 * passer, le creux est court), on l'abandonne. Elle ne se repousse pas - une
 * anticipée qui sortirait par-dessus le carillon d'approche annoncerait un train
 * déjà en train d'arriver.
 *
 * @returns vrai si l'annonce a bien été mise en file.
 */
export function paPreAnnouncement(
  index: number,
  withGreeting = false,
  cutoffIn = Number.POSITIVE_INFINITY,
): boolean {
  const platform = currentPlatformNumber(index);
  const direction = dir();
  const items = [
    ...(withGreeting ? platformGreeting(direction) : []),
    ...platformPreAnnouncement(index, platform, direction),
    ...platformNoticesForStation(STATIONS[index].jy, direction, 'pre-approach'),
  ];
  if (
    cutoffIn !== Number.POSITIVE_INFINITY &&
    !fitsBeforeCutoff(utteranceDuration(items), speechQueueRemaining('platform'), cutoffIn)
  ) {
    return false;
  }
  say(items, 'platform');
  return true;
}

/**
 * Silence entre la fin d'un signal de la sono et le premier mot : sur un quai,
 * la voix ne s'enchaîne pas dans la queue du carillon, elle la laisse tomber.
 */
const SIGNAL_TO_VOICE_MS = 300;

/** Signal de la sono, puis la voix - jamais les deux en même temps. */
function sayAfterSignal(items: StationUtterance[], signalS: number): void {
  say(items, 'platform', Math.round(signalS * 1000) + SIGNAL_TO_VOICE_MS);
}

/**
 * Carillon ATOS puis annonce d'approche, japonais et anglais, suivie de la
 * consigne locale de la gare s'il y en a une pour ce moment-là.
 *
 * Celle-ci n'est jamais facultative et ne se plie à aucun plan : une rame qui
 * entre en gare s'annonce.
 */
export function paApproach(index: number): void {
  const chime = audio.platformChime();
  const direction = dir();
  sayAfterSignal(
    [
      ...platformApproachAnnouncement(index, currentPlatformNumber(index), direction),
      ...platformNoticesForStation(STATIONS[index].jy, direction, 'approach'),
    ],
    chime,
  );
}

/**
 * La rame est en vue : signal électronique, puis l'avertissement court, répété.
 *
 * `cutoffIn` est le temps qui reste avant l'immobilisation de la rame. Les deux
 * passages ne sont pas dus : l'avertissement n'a de sens que pendant l'entrée,
 * et la gare a souvent encore l'anglais de l'annonce d'approche à finir. Ce qui
 * ne tient pas est ABANDONNÉ - 「電車がまいります」 sorti pendant que les portes
 * s'ouvrent avertit d'une rame qui est déjà là.
 *
 * Rien ne sonne avant la décision, signal compris : c'est pour cela que sa
 * durée se lit sur une constante (audioEngine.PLATFORM_WARNING_SIGNAL_S) au
 * lieu d'être le retour de l'appel qui le joue.
 *
 * @returns le nombre de passages diffusés (0, 1 ou 2).
 */
export function paTrainEntering(cutoffIn = Number.POSITIVE_INFINITY): number {
  const items = platformTrainEnteringAnnouncement(dir());
  const passes = trainEnteringPasses(
    utteranceDuration(items),
    audio.PLATFORM_WARNING_SIGNAL_S + SIGNAL_TO_VOICE_MS / 1000,
    speechQueueRemaining('platform'),
    cutoffIn,
  );
  if (passes === 0) return 0;
  sayAfterSignal(items, audio.platformWarningSignal());
  if (passes === 2) say(items, 'platform');
  return passes;
}

// --- Train qui traverse ---------------------------------------------------

/**
 * Annonce de passage sans arrêt sur la voie d'EN FACE. Même signal que pour
 * une entrée en gare - c'est un avertissement, pas une invitation - mais le
 * numéro de voie n'est pas le nôtre (voir data/passingTrains).
 *
 * `withEnglish` tombe quand le créneau de silence est trop court : mieux vaut
 * la seule version japonaise en entier que deux annonces qui débordent sur ce
 * que la gare a d'autre à dire.
 */
export function paPass(track: number, withEnglish: boolean): void {
  const signal = audio.platformWarningSignal();
  const items = platformPassAnnouncement(track, dir());
  sayAfterSignal(withEnglish ? items : items.filter((u) => u.lang === 'ja-JP'), signal);
}

/** L'avertissement court, quand la rame débouche au bout du quai. */
export function paPassWarning(): void {
  const signal = audio.platformWarningSignal();
  sayAfterSignal(platformPassWarning(dir()), signal);
}

// --- À quai ---------------------------------------------------------------

/** Le nom de la gare, deux fois, puis sa consigne locale d'arrivée s'il y en a. */
export function paArrival(index: number): void {
  const direction = dir();
  say(
    [
      ...platformArrivalAnnouncement(index, direction),
      ...platformNoticesForStation(STATIONS[index].jy, direction, 'arrival'),
    ],
    'platform',
  );
}

/**
 * « Laissez descendre les voyageurs », à l'ouverture des portes - quand le plan
 * de cet arrêt l'a retenu. Sur un quai désert, l'agent ne dit rien.
 *
 * `cutoffIn` est le temps qui reste avant la mélodie, et il est vérifié comme
 * pour n'importe quelle consigne facultative. Le message a l'air d'être en tête
 * de l'arrêt, mais il ne l'est pas : la gare vient de dire son nom, et à Shibuya
 * elle enchaîne sur la consigne d'écart en japonais PUIS en anglais - une
 * quinzaine de secondes de file devant un message qui n'a de sens que pendant que
 * les voyageurs descendent. Passé ce moment, il ne se rattrape pas : « laissez
 * descendre » lancé sur la mélodie ne fait plus descendre personne.
 *
 * @returns vrai si le message a été diffusé.
 */
export function paAlightFirst(
  index: number,
  headwaySeconds: number,
  cutoffIn: number,
): boolean {
  const plan = currentPlatformPlan(index, headwaySeconds);
  const items = platformAlightFirstAnnouncement();
  if (
    !optionalMessagePlays(
      plan.playAlightFirstMessage,
      utteranceDuration(items),
      speechQueueRemaining('platform'),
      cutoffIn,
    )
  ) {
    return false;
  }
  say(items, 'platform');
  return true;
}

/**
 * Le message d'agent du créneau `slot` (0 = pendant l'échange, 1 = juste avant
 * la mélodie), si le plan en a retenu un pour ce créneau ET s'il tient dans le
 * temps qui reste.
 *
 * `cutoffIn` est le temps avant l'annonce prioritaire suivante - la mélodie, la
 * fermeture. Un message qui déborderait est ABANDONNÉ : le repousser le ferait
 * sortir par-dessus la mélodie, ou après la fermeture des portes qu'il
 * demandait de dégager.
 *
 * @returns vrai si le message a été diffusé.
 */
export function paAgentMessage(
  index: number,
  headwaySeconds: number,
  slot = 0,
  cutoffIn = Number.POSITIVE_INFINITY,
): boolean {
  const messages = currentPlatformPlan(index, headwaySeconds).agentMessages;
  const items = slot < messages.length ? platformAgentMessage(messages[slot]) : [];
  if (
    !optionalMessagePlays(
      slot < messages.length,
      utteranceDuration(items),
      speechQueueRemaining('platform'),
      cutoffIn,
    )
  ) {
    return false;
  }
  say(items, 'platform');
  return true;
}

/** « Voie N, les portes se ferment », suivie des bips des portes palières. */
export function paDoorsClosing(index: number): void {
  say(platformDoorsClosingAnnouncement(currentPlatformNumber(index), dir()), 'platform');
}

export function paPsdBeeps(): void {
  audio.psdDoorBeeps();
}

/** « Éloignez-vous des portes » : l'agent, pendant qu'une porte reste bloquée. */
export function paDoorRelease(attempt: number): void {
  say(platformDoorReleaseAnnouncement(attempt), 'platform');
}

/** Toutes les portes rouvertes : la gare explique l'attente. */
export function paDoorCheck(): void {
  say(platformDoorCheckAnnouncement(), 'platform');
}
