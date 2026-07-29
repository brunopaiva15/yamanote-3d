// La sonorisation du QUAI : ce que dit la gare, par opposition à ce que dit la
// rame (systems/speech.ts, canal « cabin »).
//
// Deux points d'écoute, deux séquences :
//
//   • Sur le quai, on entend tout, dans l'ordre — pré-annonce, carillon ATOS,
//     annonce d'approche, avertissement d'entrée, arrivée, l'agent pendant
//     l'échange, la mélodie, la fermeture, les bips des portes palières.
//   • Dans la rame arrêtée, on n'entend que ce qui passe par les portes
//     ouvertes : l'arrivée, l'agent, la fermeture. Tout le reste est couvert
//     par la sono du wagon, ou arrive avant qu'on soit là.
//
// Le niveau, lui, n'est pas décidé ici : audioEngine tient le robinet
// (platVoiceGain) et fait de la voix du quai un lointain dès qu'on est à bord.

import { platformFor } from '../data/platforms';
import {
  platformAgentMessage,
  platformAlightFirstAnnouncement,
  platformApproachAnnouncement,
  platformArrivalAnnouncement,
  platformDelayAnnouncement,
  platformDoorsClosingAnnouncement,
  platformGreeting,
  platformPassAnnouncement,
  platformPassWarning,
  platformPreAnnouncement,
  platformTrainEnteringAnnouncement,
  type StationUtterance,
} from '../data/stationAnnouncements';
import { STATIONS } from '../data/stations';
import { useStore } from '../store';
import * as audio from './audioEngine';
import { runtime } from './runtime';
import { say } from './speech';

/** Numéro de voie desservie, tel qu'il est annoncé (「3番線」). */
export function currentPlatformNumber(index: number): number {
  const station = STATIONS[index];
  const info = platformFor(station.jy, useStore.getState().loopDirection);
  if (!info) return 1;
  if (runtime.useAlternativePlatform && info.alternativePlatform != null) {
    return info.alternativePlatform;
  }
  return info.platform;
}

// --- Retard de la ligne ---------------------------------------------------
//
// Un arrêt d'urgence met la ligne en retard, et la gare le dit. Le joueur qui
// descend après avoir subi l'incident entend donc, en attendant la rame
// suivante, l'excuse qui va avec — la seule annonce du quai qui parle d'autre
// chose que du train en approche.

/** Motif ATOS en attente d'annonce, -1 = rien à annoncer. */
let pendingDelay = -1;
/** Arrêt auquel l'incident a eu lieu : passé quelques gares, il ne se dit plus. */
let delayStop = Number.NEGATIVE_INFINITY;

/** Nombre d'arrêts pendant lesquels la gare s'excuse encore de l'incident. */
const DELAY_LIFETIME_STOPS = 6;

/** Correspondance motif d'arrêt d'urgence → motif annoncé sur le quai. */
const DELAY_FOR_EMERGENCY = [4, 3, 2];

export function notifyLineDelay(emergencyReason: number): void {
  const i = ((emergencyReason % DELAY_FOR_EMERGENCY.length) + DELAY_FOR_EMERGENCY.length) %
    DELAY_FOR_EMERGENCY.length;
  pendingDelay = DELAY_FOR_EMERGENCY[i];
  delayStop = runtime.stopSequence;
}

/**
 * La ligne traîne-t-elle encore le retard d'un incident récent ? Vrai même une
 * fois l'excuse diffusée : ce qui compte ici n'est pas l'annonce mais le
 * rattrapage, qui presse les échanges pendant quelques gares.
 */
export function lineDelayed(): boolean {
  return runtime.stopSequence - delayStop <= DELAY_LIFETIME_STOPS;
}

/** Diffuse l'excuse de retard s'il y en a une à faire, et pas trop vieille. */
export function paDelay(): void {
  if (pendingDelay < 0) return;
  const cause = pendingDelay;
  pendingDelay = -1;
  if (runtime.stopSequence - delayStop > DELAY_LIFETIME_STOPS) return;
  say(platformDelayAnnouncement(cause), 'platform');
}

// --- Séquence d'approche --------------------------------------------------

/** Annonce anticipée du prochain train, précédée du remerciement d'usage. */
export function paPreAnnouncement(index: number, withGreeting = false): void {
  const platform = currentPlatformNumber(index);
  say(
    [...(withGreeting ? platformGreeting() : []), ...platformPreAnnouncement(index, platform)],
    'platform',
  );
}

/**
 * Silence entre la fin d'un signal de la sono et le premier mot : sur un quai,
 * la voix ne s'enchaîne pas dans la queue du carillon, elle la laisse tomber.
 */
const SIGNAL_TO_VOICE_MS = 300;

/** Signal de la sono, puis la voix — jamais les deux en même temps. */
function sayAfterSignal(items: StationUtterance[], signalS: number): void {
  say(items, 'platform', Math.round(signalS * 1000) + SIGNAL_TO_VOICE_MS);
}

/** Carillon ATOS puis annonce d'approche, japonais et anglais. */
export function paApproach(index: number): void {
  const chime = audio.platformChime();
  sayAfterSignal(platformApproachAnnouncement(index, currentPlatformNumber(index)), chime);
}

/** La rame est en vue : signal électronique, puis l'avertissement court, répété. */
export function paTrainEntering(): void {
  const signal = audio.platformWarningSignal();
  sayAfterSignal(platformTrainEnteringAnnouncement(), signal);
  say(platformTrainEnteringAnnouncement(), 'platform');
}

// --- Train qui traverse ---------------------------------------------------

/**
 * Annonce de passage sans arrêt sur la voie d'EN FACE. Même signal que pour
 * une entrée en gare — c'est un avertissement, pas une invitation — mais le
 * numéro de voie n'est pas le nôtre (voir data/passingTrains).
 *
 * `withEnglish` tombe quand le créneau de silence est trop court : mieux vaut
 * la seule version japonaise en entier que deux annonces qui débordent sur ce
 * que la gare a d'autre à dire.
 */
export function paPass(track: number, withEnglish: boolean): void {
  const signal = audio.platformWarningSignal();
  const items = platformPassAnnouncement(track);
  sayAfterSignal(withEnglish ? items : items.filter((u) => u.lang === 'ja-JP'), signal);
}

/** L'avertissement court, quand la rame débouche au bout du quai. */
export function paPassWarning(): void {
  const signal = audio.platformWarningSignal();
  sayAfterSignal(platformPassWarning(), signal);
}

// --- À quai ---------------------------------------------------------------

export function paArrival(index: number): void {
  say(platformArrivalAnnouncement(index), 'platform');
}

/** « Laissez descendre les voyageurs », à l'ouverture des portes. */
export function paAlightFirst(): void {
  say(platformAlightFirstAnnouncement(), 'platform');
}

/**
 * Un message d'agent pendant l'échange. La rotation suit le numéro d'arrêt :
 * deux arrêts d'affilée ne donnent pas la même phrase, mais la même gare au
 * même moment de la boucle, si.
 */
export function paAgentMessage(offset = 0): void {
  say(platformAgentMessage(runtime.stopSequence + offset), 'platform');
}

/** « Voie N, les portes se ferment », suivie des bips des portes palières. */
export function paDoorsClosing(index: number): void {
  say(platformDoorsClosingAnnouncement(currentPlatformNumber(index)), 'platform');
}

export function paPsdBeeps(): void {
  audio.psdDoorBeeps();
}
