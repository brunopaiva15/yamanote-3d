// Séquence de départ quai : 発車メロディ Inner / Outer / Ōsaki secondaire.
// La mélodie est jouée une seule fois par arrêt (departureId) ; les étapes
// portes / départ restent pilotées par stationCycle tant que le départ
// n'est pas bloqué.

import {
  EBISU_INNER_THIRD_MAN_F_PATH,
  INNER_MAIN_MELODY_PATH,
  KOMAGOME_INNER_SAKURA_V2_PATH,
  KOMAGOME_OUTER_SAKURA_A_PATH,
  OSAKI_INNER_SECONDARY_MELODY_PATH,
  OSAKI_OUTER_SECONDARY_MELODY_PATH,
  OUTER_MAIN_MELODY_PATH,
  SESERAGI_MELODY_PATH,
  TAKADANOBABA_INNER_ATOM_B_PATH,
  TAKADANOBABA_OUTER_ATOM_A_PATH,
  TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH,
  UGUISUDANI_INNER_HARU_TREMOLO_PATH,
  makeDepartureId,
  shouldPlayEbisuInnerThirdManF,
  shouldPlayInnerMainMelody,
  shouldPlayKomagomeInnerSakuraV2,
  shouldPlayKomagomeOuterSakuraA,
  shouldPlayOsakiInnerSecondaryMelody,
  shouldPlayOsakiOuterSecondaryMelody,
  shouldPlayOuterMainMelody,
  shouldPlaySeseragi,
  shouldPlayTakadanobabaInnerAtomB,
  shouldPlayTakadanobabaOuterAtomA,
  shouldPlayTakanawaGatewayInnerGloriousA,
  shouldPlayUguisudaniInnerHaruTremolo,
  type MelodyPlayContext,
  type ServiceType,
  type TrainState,
} from '../data/melodies';
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

let outerMainMelodyPlaying = false;
let seseragiPlaying = false;
let takadanobabaAtomAPlaying = false;
let takadanobabaAtomBPlaying = false;
let ebisuThirdManFPlaying = false;
let gloriousGatewayAPlaying = false;

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

/** Remet à zéro l'anti-double-lecture (après départ ou reset). */
export function resetMelodyDepartureGuard(): void {
  runtime.lastMelodyDepartureId = null;
  outerMainMelodyPlaying = false;
  seseragiPlaying = false;
  takadanobabaAtomAPlaying = false;
  takadanobabaAtomBPlaying = false;
  ebisuThirdManFPlaying = false;
  gloriousGatewayAPlaying = false;
}

/** Dérive l'état train pour la mélodie à partir de la phase et des portes. */
export function trainStateFromRuntime(phase: string, doorOpen: number, doorTarget: number): TrainState {
  if (phase === 'cruise' || phase === 'depart') return phase === 'depart' ? 'departing' : 'moving';
  if (phase === 'brake') return 'approaching';
  if (doorTarget === 0 && doorOpen < 0.95) return doorOpen > 0.05 ? 'doors_closing' : 'stopped_doors_closed';
  if (doorOpen >= 0.85) return 'stopped_doors_open';
  if (doorTarget === 1) return 'stopped_doors_open';
  return 'stopped_doors_closed';
}

function serviceTypeFromRuntime(): ServiceType {
  if (runtime.outOfService) return 'out_of_service';
  if (runtime.terminusStop) return 'terminal';
  return 'normal';
}

function serviceStateFromRuntime(): MelodyPlayContext['serviceState'] {
  if (runtime.outOfService) return 'out_of_service';
  if (runtime.terminusStop) return 'terminated';
  return 'in_service';
}

function resolvePlatform(
  stationJy: string,
  direction: LoopDirection,
  override?: number,
): number {
  if (override !== undefined) return override;
  const info = platformFor(stationJy, direction);
  if (!info) return 0;
  if (runtime.useAlternativePlatform && info.alternativePlatform != null) {
    return info.alternativePlatform;
  }
  return info.platform;
}

function nextStationCodeFor(index: number, direction: LoopDirection): string {
  const nextIndex = direction === 'outer' ? (index - 1 + 30) % 30 : (index + 1) % 30;
  return STATIONS[nextIndex].jy;
}

export function buildDepartureContext(opts?: {
  departureSequenceStarted?: boolean;
  platform?: number;
  direction?: LoopDirection;
  stationIndex?: number;
}): MelodyPlayContext {
  const s = useStore.getState();
  const index = opts?.stationIndex ?? s.index;
  const station = STATIONS[index];
  const direction = opts?.direction ?? s.loopDirection;
  const platform = resolvePlatform(station.jy, direction, opts?.platform);
  const stopSequence = runtime.stopSequence;
  const trainId = runtime.trainId;
  const departureId = makeDepartureId({
    trainId,
    stationCode: station.jy,
    platform,
    stopSequence,
  });

  const blocked = isDepartureBlocked();

  return {
    line: 'yamanote',
    direction,
    stationCode: station.jy,
    platform,
    nextStationCode: nextStationCodeFor(index, direction),
    trainState: trainStateFromRuntime(s.phase, runtime.doorOpen, runtime.doorTarget),
    departureSequenceStarted: opts?.departureSequenceStarted ?? true,
    departureId,
    trainId,
    stopSequence,
    serviceType: serviceTypeFromRuntime(),
    serviceState: serviceStateFromRuntime(),
    emergencyActive: runtime.departureBlockers.emergency,
    departureAuthorized: !blocked,
    outOfService: runtime.outOfService,
    terminus: runtime.terminusStop,
  };
}

export function stopOuterMainMelody(): void {
  audioManager.stop(OUTER_MAIN_MELODY_PATH);
  outerMainMelodyPlaying = false;
}

export function stopOsakiInnerSecondaryMelody(): void {
  audioManager.stop(OSAKI_INNER_SECONDARY_MELODY_PATH);
}

export function stopOsakiOuterSecondaryMelody(): void {
  audioManager.stop(OSAKI_OUTER_SECONDARY_MELODY_PATH);
  // Permet une nouvelle tentative sur le même arrêt si la procédure reprend.
  runtime.lastMelodyDepartureId = null;
}

export function stopKomagomeOuterSakuraA(): void {
  audioManager.stop(KOMAGOME_OUTER_SAKURA_A_PATH);
}

export function stopKomagomeInnerSakuraV2(): void {
  audioManager.stop(KOMAGOME_INNER_SAKURA_V2_PATH);
}

export function stopUguisudaniInnerHaruTremolo(): void {
  audioManager.stop(UGUISUDANI_INNER_HARU_TREMOLO_PATH);
}

export function stopSeseragi(): void {
  audioManager.stop(SESERAGI_MELODY_PATH);
  seseragiPlaying = false;
}

export function stopTakadanobabaOuterAtomA(): void {
  audioManager.stop(TAKADANOBABA_OUTER_ATOM_A_PATH);
  takadanobabaAtomAPlaying = false;
}

export function stopTakadanobabaInnerAtomB(): void {
  audioManager.stop(TAKADANOBABA_INNER_ATOM_B_PATH);
  takadanobabaAtomBPlaying = false;
}

export function stopEbisuInnerThirdManF(): void {
  audioManager.stop(EBISU_INNER_THIRD_MAN_F_PATH);
  ebisuThirdManFPlaying = false;
}

export function stopTakanawaGatewayInnerGloriousA(): void {
  audioManager.stop(TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH);
  gloriousGatewayAPlaying = false;
}

/** Arrête toute 発車メロディ en cours (annulation / interruption / changement de phase). */
export function cancelDepartureMelody(): void {
  audioManager.stop(INNER_MAIN_MELODY_PATH);
  stopOuterMainMelody();
  stopOsakiInnerSecondaryMelody();
  audioManager.stop(OSAKI_OUTER_SECONDARY_MELODY_PATH);
  stopKomagomeOuterSakuraA();
  stopKomagomeInnerSakuraV2();
  stopUguisudaniInnerHaruTremolo();
  stopSeseragi();
  stopTakadanobabaOuterAtomA();
  stopTakadanobabaInnerAtomB();
  stopEbisuInnerThirdManF();
  stopTakanawaGatewayInnerGloriousA();
}

function claimDepartureId(context: MelodyPlayContext): boolean {
  if (context.departureId && runtime.lastMelodyDepartureId === context.departureId) return false;
  return true;
}

function markDepartureId(context: MelodyPlayContext): void {
  if (context.departureId) runtime.lastMelodyDepartureId = context.departureId;
}

/**
 * Joue la mélodie Inner Main une fois si le contexte le permet.
 * Ne relance pas pour le même departureId.
 */
export async function playInnerMainMelody(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayInnerMainMelody(context)) return false;
  if (isDepartureBlocked()) return false;
  if (!claimDepartureId(context)) return false;
  markDepartureId(context);
  const ok = await audioManager.playOnce(INNER_MAIN_MELODY_PATH);
  if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
    runtime.lastMelodyDepartureId = null;
  }
  return ok;
}

/**
 * Joue JRE-IKST-010-02 (Outer Main) une fois. Pas de boucle, pas de superposition.
 */
export async function playOuterMainMelody(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayOuterMainMelody(context)) return false;
  if (isDepartureBlocked()) return false;
  if (outerMainMelodyPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  outerMainMelodyPlaying = true;
  try {
    const ok = await audioManager.playOnce(OUTER_MAIN_MELODY_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    outerMainMelodyPlaying = false;
  }
}

/** Variante explicite « une fois par arrêt » (même garde departureId). */
export async function playOuterMainMelodyOncePerStop(context: MelodyPlayContext): Promise<boolean> {
  return playOuterMainMelody(context);
}

/**
 * JRE-IKST-010-03 : Ōsaki Inner voie 2 → Shinagawa, une fois par départ.
 */
export async function playOsakiInnerSecondaryMelody(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayOsakiInnerSecondaryMelody(context)) return false;
  if (isDepartureBlocked()) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  const ok = await audioManager.playOnce(OSAKI_INNER_SECONDARY_MELODY_PATH);
  if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
    runtime.lastMelodyDepartureId = null;
  }
  return ok;
}

/**
 * JRE-IKST-010-05 : Ōsaki Outer voie 4 → Gotanda, une fois par départ.
 */
export async function playOsakiOuterSecondaryMelody(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayOsakiOuterSecondaryMelody(context)) return false;
  if (isDepartureBlocked()) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  const ok = await audioManager.playOnce(OSAKI_OUTER_SECONDARY_MELODY_PATH);
  if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
    runtime.lastMelodyDepartureId = null;
  }
  return ok;
}

/**
 * Sakura Sakura A : Komagome Outer voie 1 → Tabata, une fois par départ.
 */
export async function playKomagomeOuterSakuraA(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayKomagomeOuterSakuraA(context)) return false;
  if (isDepartureBlocked()) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  const ok = await audioManager.playOnce(KOMAGOME_OUTER_SAKURA_A_PATH);
  if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
    runtime.lastMelodyDepartureId = null;
  }
  return ok;
}

/**
 * Sakura Sakura V2 : Komagome Inner voie 2 → Sugamo, une fois par départ.
 */
export async function playKomagomeInnerSakuraV2(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayKomagomeInnerSakuraV2(context)) return false;
  if (isDepartureBlocked()) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  const ok = await audioManager.playOnce(KOMAGOME_INNER_SAKURA_V2_PATH);
  if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
    runtime.lastMelodyDepartureId = null;
  }
  return ok;
}

/**
 * Haru Tremolo : Uguisudani Inner voie 2 → Nippori, une fois par départ.
 */
export async function playUguisudaniInnerHaruTremolo(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayUguisudaniInnerHaruTremolo(context)) return false;
  if (isDepartureBlocked()) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  const ok = await audioManager.playOnce(UGUISUDANI_INNER_HARU_TREMOLO_PATH);
  if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
    runtime.lastMelodyDepartureId = null;
  }
  return ok;
}

/**
 * Seseragi : Outer Loop sur les six quais listés, une fois par départ.
 */
export async function playSeseragi(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlaySeseragi(context)) return false;
  if (isDepartureBlocked()) return false;
  if (seseragiPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  seseragiPlaying = true;
  try {
    const ok = await audioManager.playOnce(SESERAGI_MELODY_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    seseragiPlaying = false;
  }
}

/**
 * Tetsuwan Atom ver.A : Takadanobaba Outer voie 1 → Mejiro, une fois par départ.
 */
export async function playTakadanobabaOuterAtomA(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayTakadanobabaOuterAtomA(context)) return false;
  if (isDepartureBlocked()) return false;
  if (takadanobabaAtomAPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  takadanobabaAtomAPlaying = true;
  try {
    const ok = await audioManager.playOnce(TAKADANOBABA_OUTER_ATOM_A_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    takadanobabaAtomAPlaying = false;
  }
}

/**
 * Tetsuwan Atom ver.B : Takadanobaba Inner voie 2 → Shin-Okubo, une fois par départ.
 */
export async function playTakadanobabaInnerAtomB(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayTakadanobabaInnerAtomB(context)) return false;
  if (isDepartureBlocked()) return false;
  if (takadanobabaAtomBPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  takadanobabaAtomBPlaying = true;
  try {
    const ok = await audioManager.playOnce(TAKADANOBABA_INNER_ATOM_B_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    takadanobabaAtomBPlaying = false;
  }
}

/**
 * The Third Man ver.F : Ebisu Inner voie 2 → Meguro, une fois par départ.
 */
export async function playEbisuInnerThirdManF(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayEbisuInnerThirdManF(context)) return false;
  if (isDepartureBlocked()) return false;
  if (ebisuThirdManFPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  ebisuThirdManFPlaying = true;
  try {
    const ok = await audioManager.playOnce(EBISU_INNER_THIRD_MAN_F_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    ebisuThirdManFPlaying = false;
  }
}

/**
 * Glorious Gateway A : Takanawa Gateway Inner voie 1 → Tamachi, une fois par départ.
 */
export async function playTakanawaGatewayInnerGloriousA(
  context: MelodyPlayContext,
): Promise<boolean> {
  if (!shouldPlayTakanawaGatewayInnerGloriousA(context)) return false;
  if (isDepartureBlocked()) return false;
  if (gloriousGatewayAPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  gloriousGatewayAPlaying = true;
  try {
    const ok = await audioManager.playOnce(TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    gloriousGatewayAPlaying = false;
  }
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
}

/**
 * Sélectionne et joue la 発車メロディ adaptée.
 * Ordre : cas Ōsaki secondaires → Inner Main → Outer Main.
 */
export async function playDepartureMelodyForContext(context: MelodyPlayContext): Promise<boolean> {
  if (context.trainState !== 'stopped_doors_open') return false;
  if (context.departureAuthorized === false) return false;
  if (context.emergencyActive) return false;
  if (isDepartureBlocked()) return false;

  if (await playOsakiInnerSecondaryMelody(context)) return true;
  if (await playOsakiOuterSecondaryMelody(context)) return true;
  if (await playKomagomeOuterSakuraA(context)) return true;
  if (await playKomagomeInnerSakuraV2(context)) return true;
  if (await playUguisudaniInnerHaruTremolo(context)) return true;
  if (await playSeseragi(context)) return true;
  if (await playTakadanobabaOuterAtomA(context)) return true;
  if (await playTakadanobabaInnerAtomB(context)) return true;
  if (await playEbisuInnerThirdManF(context)) return true;
  if (await playTakanawaGatewayInnerGloriousA(context)) return true;
  if (await playInnerMainMelody(context)) return true;
  if (await playOuterMainMelody(context)) return true;
  return false;
}

/**
 * Procédure de départ : mélodie (si applicable), puis annonce / fermetures
 * si le départ n'est pas bloqué. La mélodie seule ne provoque pas le départ.
 */
export async function startDepartureSequence(context: MelodyPlayContext): Promise<void> {
  if (context.trainState !== 'stopped_doors_open') return;
  if (context.departureAuthorized === false) return;
  if (context.emergencyActive) return;
  if (isDepartureBlocked()) return;

  await playDepartureMelodyForContext(context);

  if (context.emergencyActive || isDepartureBlocked()) {
    cancelDepartureMelody();
    return;
  }

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

/** Exposé pour les tests / debug. */
export function melodyDepartureGuardState(): { lastId: string | null; outerPlaying: boolean } {
  return { lastId: runtime.lastMelodyDepartureId, outerPlaying: outerMainMelodyPlaying };
}
