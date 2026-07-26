// Séquence de départ quai : 発車メロディ Inner Loop, puis fermeture.
// La mélodie est jouée une seule fois ; les étapes portes / départ restent
// pilotées par stationCycle tant que le départ n'est pas bloqué.

import { INNER_MAIN_MELODY_PATH, shouldPlayInnerMainMelody, type MelodyPlayContext, type TrainState } from '../data/melodies';
import { platformFor, type LoopDirection } from '../data/platforms';
import { STATIONS } from '../data/stations';
import { useStore } from '../store';
import { audioManager } from './audioEngine';
import { runtime } from './runtime';
import { doorsClosingAnnouncement } from '../data/announcements';
import { say } from './speech';
import { setPsdDoors, setTrainDoors } from './doorMotion';

/** Raisons pour lesquelles le départ (et la suite après la mélodie) est suspendu. */
export type DepartureBlockers = {
  doorBlocked: boolean;
  heldAtStation: boolean;
  signalStop: boolean;
  emergency: boolean;
};

export function isDepartureBlocked(): boolean {
  const b = runtime.departureBlockers;
  return b.doorBlocked || b.heldAtStation || b.signalStop || b.emergency;
}

export function setDepartureBlockers(partial: Partial<DepartureBlockers>): void {
  Object.assign(runtime.departureBlockers, partial);
  if (isDepartureBlocked()) {
    cancelDepartureMelody();
  }
}

export function clearDepartureBlockers(): void {
  runtime.departureBlockers.doorBlocked = false;
  runtime.departureBlockers.heldAtStation = false;
  runtime.departureBlockers.signalStop = false;
  runtime.departureBlockers.emergency = false;
}

/** Dérive l'état train pour la mélodie à partir de la phase et des portes. */
export function trainStateFromRuntime(phase: string, doorOpen: number, doorTarget: number): TrainState {
  if (phase === 'cruise' || phase === 'depart') return phase === 'depart' ? 'departing' : 'moving';
  if (phase === 'brake') return 'approaching';
  // dwell
  if (doorTarget === 0 && doorOpen < 0.95) return doorOpen > 0.05 ? 'doors_closing' : 'stopped_doors_closed';
  if (doorOpen >= 0.85) return 'stopped_doors_open';
  if (doorTarget === 1) return 'stopped_doors_open';
  return 'stopped_doors_closed';
}

export function buildDepartureContext(opts?: {
  departureSequenceStarted?: boolean;
  platform?: number;
  direction?: LoopDirection;
}): MelodyPlayContext {
  const s = useStore.getState();
  const station = STATIONS[s.index];
  const direction = opts?.direction ?? s.loopDirection;
  const info = platformFor(station.jy, direction);
  const platform = opts?.platform ?? info?.platform ?? 0;

  return {
    line: 'yamanote',
    direction,
    stationCode: station.jy,
    platform,
    trainState: trainStateFromRuntime(s.phase, runtime.doorOpen, runtime.doorTarget),
    departureSequenceStarted: opts?.departureSequenceStarted ?? true,
    outOfService: runtime.outOfService,
    terminus: runtime.terminusStop,
  };
}

/** Arrête la mélodie Inner Main si elle tourne (annulation / interruption). */
export function cancelDepartureMelody(): void {
  audioManager.stop(INNER_MAIN_MELODY_PATH);
}

/**
 * Joue la mélodie Inner Main une fois si le contexte le permet.
 * Ne relance pas si déjà en cours. Retourne true si le clip a été lancé.
 */
export async function playInnerMainMelody(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayInnerMainMelody(context)) return false;
  if (isDepartureBlocked()) return false;
  return audioManager.playOnce(INNER_MAIN_MELODY_PATH);
}

async function playDoorClosingAnnouncement(): Promise<void> {
  say(doorsClosingAnnouncement());
}

async function closePlatformDoors(): Promise<void> {
  setPsdDoors(0);
}

async function closeTrainDoors(): Promise<void> {
  setTrainDoors(0);
}

async function departTrain(): Promise<void> {
  // Le passage en phase « depart » reste géré par stationCycle (timer dwell).
  // Ici : no-op volontaire — la mélodie ne force jamais le départ.
}

/**
 * Procédure de départ : mélodie (si applicable), puis annonce / fermetures
 * si le départ n'est pas bloqué. La mélodie seule ne provoque pas le départ
 * en cas de porte bloquée, maintien en gare, signal d'arrêt ou urgence.
 */
export async function startDepartureSequence(context: MelodyPlayContext): Promise<void> {
  if (!shouldPlayInnerMainMelody(context)) return;
  if (isDepartureBlocked()) return;

  const played = await audioManager.playOnce(INNER_MAIN_MELODY_PATH);
  if (!played) return;

  if (isDepartureBlocked()) {
    cancelDepartureMelody();
    return;
  }

  // Les étapes suivantes ne sont exécutées que si un appelant pilote la
  // séquence en mode autonome (hors timers de stationCycle). En usage normal,
  // stationCycle enchaîne annonce → portes → départ sur son propre calendrier
  // et n'appelle que departureMelody / playInnerMainMelody.
  if (runtime.autonomousDepartureSequence) {
    await playDoorClosingAnnouncement();
    if (isDepartureBlocked()) {
      cancelDepartureMelody();
      return;
    }
    await closePlatformDoors();
    await closeTrainDoors();
    await departTrain();
  }
}
