// Séquence de départ quai : 発車メロディ Inner / Outer / Ōsaki secondaire.
// La mélodie est lancée une seule fois par arrêt (departureId) et fait DEUX
// passages entiers - l'arrêt lui a réservé exactement ce temps-là
// (plannedStopMelodySounding, plus bas, et systems/stationCycle). Le chef de
// train relâche le bouton après (interruptDepartureMelody) : le fondu referme
// un silence. Seul un incident la coupe en vol (cancelDepartureMelody). Les
// étapes portes / départ restent pilotées par stationCycle tant que le départ
// n'est pas bloqué.

import {
  EBISU_INNER_THIRD_MAN_F_PATH,
  ENABLE_DEPARTURE_MELODY_CLIPS,
  IKEBUKURO_INNER_BIC_CAMERA_A_PATH,
  IKEBUKURO_INNER_BIC_CAMERA_B_PATH,
  KANDA_INNER_MONDAMIN_B_PATH,
  KANDA_OUTER_MONDAMIN_A_PATH,
  KOMAGOME_INNER_SAKURA_V2_PATH,
  KOMAGOME_OUTER_SAKURA_A_PATH,
  MELODY_PATHS,
  MELODY_REPEATS,
  MELODY_REPEAT_GAP_S,
  OSAKI_INNER_SECONDARY_MELODY_PATH,
  OSAKI_OUTER_SECONDARY_MELODY_PATH,
  SESERAGI_MELODY_PATH,
  TAKADANOBABA_INNER_ATOM_B_PATH,
  TAKADANOBABA_OUTER_ATOM_A_PATH,
  TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH,
  TAKANAWA_GATEWAY_OUTER_GLORIOUS_B_PATH,
  UGUISUDANI_INNER_HARU_TREMOLO_PATH,
  innerMainMelodyPathFor,
  makeDepartureId,
  outerMainMelodyPathFor,
  plannedMelodySounding,
  shouldPlayEbisuInnerThirdManF,
  shouldPlayIkebukuroInnerBicCameraA,
  shouldPlayIkebukuroInnerBicCameraB,
  shouldPlayInnerMainMelody,
  shouldPlayKandaInnerMondaminB,
  shouldPlayKandaOuterMondaminA,
  shouldPlayKomagomeInnerSakuraV2,
  shouldPlayKomagomeOuterSakuraA,
  shouldPlayOsakiInnerSecondaryMelody,
  shouldPlayOsakiOuterSecondaryMelody,
  shouldPlayOuterMainMelody,
  shouldPlaySeseragi,
  shouldPlayTakadanobabaInnerAtomB,
  shouldPlayTakadanobabaOuterAtomA,
  shouldPlayTakanawaGatewayInnerGloriousA,
  shouldPlayTakanawaGatewayOuterGloriousB,
  shouldPlayUguisudaniInnerHaruTremolo,
  type MelodyPlayContext,
  type ServiceType,
  type TrainState,
} from '../data/melodies';
import { nextStation } from '../data/loop';
import { platformFor, type LoopDirection } from '../data/platforms';
import { STATIONS } from '../data/stations';
import { useStore } from '../store';
import {
  audioManager,
  resetFallbackMelodyGuard,
  stopFallbackMelody,
} from './audioEngine';
import { runtime } from './runtime';

/** Raisons pour lesquelles le départ (et la suite après la mélodie) est suspendu. */
export type DepartureBlockers = {
  doorBlocked: boolean;
  heldAtStation: boolean;
  signalStop: boolean;
  emergency: boolean;
  /** Voyageur pris en charge a quai; les portes sont saines mais maintenues ouvertes. */
  passengerAssistance: boolean;
};

/** Fondu de la coupure par le chef de train (s) : bref, mais pas un couperet. */
const MELODY_FADE_S = 0.6;

let outerMainMelodyPlaying = false;
let seseragiPlaying = false;
let takadanobabaAtomAPlaying = false;
let takadanobabaAtomBPlaying = false;
let ebisuThirdManFPlaying = false;
let gloriousGatewayAPlaying = false;
let gloriousGatewayBPlaying = false;
let kandaMondaminAPlaying = false;
let kandaMondaminBPlaying = false;
let bicCameraAPlaying = false;
let bicCameraBPlaying = false;

export function isDepartureBlocked(): boolean {
  const b = runtime.departureBlockers;
  return b.doorBlocked || b.heldAtStation || b.signalStop || b.emergency || b.passengerAssistance;
}

/**
 * Blocages qui exigent la réouverture de TOUTES les portes - un ordre de
 * maintien à quai, un signal fermé, une urgence.
 *
 * `doorBlocked` n'en fait pas partie, et c'est tout l'intérêt : une porte qui
 * coince ne rouvre QUE cette porte-là (voir systems/doorObstruction, qui mène
 * sa propre procédure), et le reste de la rame ne bouge pas.
 */
export function isDepartureHeldOpen(): boolean {
  const b = runtime.departureBlockers;
  return b.heldAtStation || b.signalStop || b.emergency || b.passengerAssistance;
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
  runtime.departureBlockers.passengerAssistance = false;
}

/** Remet à zéro l'anti-double-lecture (après départ ou reset). */
export function resetMelodyDepartureGuard(): void {
  runtime.lastMelodyDepartureId = null;
  clearPlayingFlags();
  resetFallbackMelodyGuard();
}

/** Dérive l'état train pour la mélodie à partir de la phase et des portes. */
function trainStateFromRuntime(phase: string, doorOpen: number, doorTarget: number): TrainState {
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
  return STATIONS[nextStation(index, direction)].jy;
}

/**
 * Fenêtre sonore à réserver à la mélodie de cette gare : deux passages entiers
 * du clip câblé sur le quai où la rame va se ranger.
 *
 * Appelé par stationCycle à l'entrée en freinage, AVANT que le contexte de
 * départ n'existe : d'où la résolution du quai ici, sur le même chemin que
 * `buildDepartureContext` (`resolvePlatform`), pour que la fenêtre mesurée soit
 * bien celle du clip qui sortira des haut-parleurs.
 */
export function plannedStopMelodySounding(index: number, direction?: LoopDirection): number {
  const station = STATIONS[index];
  const dir = direction ?? useStore.getState().loopDirection;
  return plannedMelodySounding(station.jy, dir, resolvePlatform(station.jy, dir));
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

// Génération d'annulation : un cancel pendant un passage (ou la respiration
// entre les deux) invalide les passages restants de playMelodyRounds.
let melodyCancelGen = 0;

/**
 * Joue le clip en MELODY_REPEATS passages, séparés d'une courte respiration.
 * S'arrête si la mélodie est annulée entre-temps (blocage, urgence, reset).
 * @returns false si le fichier est introuvable.
 */
async function playMelodyRounds(path: string): Promise<boolean> {
  const gen = melodyCancelGen;
  for (let round = 0; round < MELODY_REPEATS; round++) {
    if (round > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, MELODY_REPEAT_GAP_S * 1000));
      if (gen !== melodyCancelGen || isDepartureBlocked()) return true;
    }
    // Bus « melody » et non « platform » : même sono de quai, mais son propre
    // niveau - les clips sont normalisés en crête et sonnaient trop fort.
    const ok = await audioManager.playOnce(path, 'melody');
    if (!ok) return false;
    if (gen !== melodyCancelGen) return true;
  }
  return true;
}

/** Remet à zéro les verrous « ce clip-là tourne déjà ». */
function clearPlayingFlags(): void {
  outerMainMelodyPlaying = false;
  seseragiPlaying = false;
  takadanobabaAtomAPlaying = false;
  takadanobabaAtomBPlaying = false;
  ebisuThirdManFPlaying = false;
  gloriousGatewayAPlaying = false;
  gloriousGatewayBPlaying = false;
  kandaMondaminAPlaying = false;
  kandaMondaminBPlaying = false;
  bicCameraAPlaying = false;
  bicCameraBPlaying = false;
}

/**
 * Arrête net toute 発車メロディ en cours : blocage de départ, urgence, sortie
 * de gare. Brutal par nature - ce n'est pas une coupure de chef de train mais
 * un incident (voir interruptDepartureMelody pour la coupure normale).
 */
export function cancelDepartureMelody(): void {
  melodyCancelGen++;
  for (const path of MELODY_PATHS) audioManager.stop(path);
  stopFallbackMelody(0);
  clearPlayingFlags();
  // Le départ reprendra peut-être depuis ce même quai : la garde par
  // departureId doit laisser une nouvelle tentative passer.
  runtime.lastMelodyDepartureId = null;
  resetFallbackMelodyGuard();
}

/**
 * Coupure normale, celle du chef de train qui relâche le bouton : elle tombe à
 * la fin de la fenêtre sonore, donc APRÈS les deux passages - le fondu ne mord
 * plus sur la musique, il referme le silence qui la suit. La suite de la
 * procédure (annonce, fermeture, départ) continue.
 */
export function interruptDepartureMelody(): void {
  melodyCancelGen++;
  for (const path of MELODY_PATHS) audioManager.fadeOut(path, MELODY_FADE_S);
  stopFallbackMelody(MELODY_FADE_S);
  clearPlayingFlags();
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
  const ok = await playMelodyRounds(innerMainMelodyPathFor(context.stationCode));
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
    const ok = await playMelodyRounds(outerMainMelodyPathFor(context.stationCode));
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    outerMainMelodyPlaying = false;
  }
}

/**
 * JRE-IKST-010-03 : Ōsaki Inner voie 2 → Shinagawa, une fois par départ.
 */
export async function playOsakiInnerSecondaryMelody(context: MelodyPlayContext): Promise<boolean> {
  if (!shouldPlayOsakiInnerSecondaryMelody(context)) return false;
  if (isDepartureBlocked()) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  const ok = await playMelodyRounds(OSAKI_INNER_SECONDARY_MELODY_PATH);
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
  const ok = await playMelodyRounds(OSAKI_OUTER_SECONDARY_MELODY_PATH);
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
  const ok = await playMelodyRounds(KOMAGOME_OUTER_SAKURA_A_PATH);
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
  const ok = await playMelodyRounds(KOMAGOME_INNER_SAKURA_V2_PATH);
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
  const ok = await playMelodyRounds(UGUISUDANI_INNER_HARU_TREMOLO_PATH);
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
    const ok = await playMelodyRounds(SESERAGI_MELODY_PATH);
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
    const ok = await playMelodyRounds(TAKADANOBABA_OUTER_ATOM_A_PATH);
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
    const ok = await playMelodyRounds(TAKADANOBABA_INNER_ATOM_B_PATH);
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
    const ok = await playMelodyRounds(EBISU_INNER_THIRD_MAN_F_PATH);
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
    const ok = await playMelodyRounds(TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    gloriousGatewayAPlaying = false;
  }
}

/**
 * Glorious Gateway B : Takanawa Gateway Outer voie 2 → Shinagawa, une fois par départ.
 */
export async function playTakanawaGatewayOuterGloriousB(
  context: MelodyPlayContext,
): Promise<boolean> {
  if (!shouldPlayTakanawaGatewayOuterGloriousB(context)) return false;
  if (isDepartureBlocked()) return false;
  if (gloriousGatewayBPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  gloriousGatewayBPlaying = true;
  try {
    const ok = await playMelodyRounds(TAKANAWA_GATEWAY_OUTER_GLORIOUS_B_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    gloriousGatewayBPlaying = false;
  }
}

/**
 * Mondamin CM Song ver.A : Kanda Outer voie 2 → Tokyo, une fois par départ.
 */
export async function playKandaOuterMondaminA(
  context: MelodyPlayContext,
): Promise<boolean> {
  if (!shouldPlayKandaOuterMondaminA(context)) return false;
  if (isDepartureBlocked()) return false;
  if (kandaMondaminAPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  kandaMondaminAPlaying = true;
  try {
    const ok = await playMelodyRounds(KANDA_OUTER_MONDAMIN_A_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    kandaMondaminAPlaying = false;
  }
}

/**
 * Mondamin CM Song ver.B : Kanda Inner voie 3 → Akihabara, une fois par départ.
 */
export async function playKandaInnerMondaminB(
  context: MelodyPlayContext,
): Promise<boolean> {
  if (!shouldPlayKandaInnerMondaminB(context)) return false;
  if (isDepartureBlocked()) return false;
  if (kandaMondaminBPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  kandaMondaminBPlaying = true;
  try {
    const ok = await playMelodyRounds(KANDA_INNER_MONDAMIN_B_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    kandaMondaminBPlaying = false;
  }
}

/**
 * Bic Camera Theme Song ver.A : Ikebukuro Inner voie 5 → Mejiro, une fois par départ.
 * Ne nécessite pas departureAuthorized (préparation du départ).
 */
export async function playIkebukuroInnerBicCameraA(
  context: MelodyPlayContext,
): Promise<boolean> {
  if (!shouldPlayIkebukuroInnerBicCameraA(context)) return false;
  if (context.emergencyActive) return false;
  if (runtime.departureBlockers.heldAtStation) return false;
  if (bicCameraAPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  bicCameraAPlaying = true;
  try {
    const ok = await playMelodyRounds(IKEBUKURO_INNER_BIC_CAMERA_A_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    bicCameraAPlaying = false;
  }
}

/**
 * Bic Camera Theme Song ver.B : Ikebukuro Inner voie 6 → Mejiro, une fois par départ.
 * Ne nécessite pas departureAuthorized (préparation du départ).
 */
export async function playIkebukuroInnerBicCameraB(
  context: MelodyPlayContext,
): Promise<boolean> {
  if (!shouldPlayIkebukuroInnerBicCameraB(context)) return false;
  if (context.emergencyActive) return false;
  if (runtime.departureBlockers.heldAtStation) return false;
  if (bicCameraBPlaying) return false;
  if (!claimDepartureId(context)) return false;

  markDepartureId(context);
  bicCameraBPlaying = true;
  try {
    const ok = await playMelodyRounds(IKEBUKURO_INNER_BIC_CAMERA_B_PATH);
    if (!ok && context.departureId && runtime.lastMelodyDepartureId === context.departureId) {
      runtime.lastMelodyDepartureId = null;
    }
    return ok;
  } finally {
    bicCameraBPlaying = false;
  }
}

/**
 * Sélectionne et joue la 発車メロディ adaptée.
 * Ordre : cas Ōsaki secondaires → Inner Main → Outer Main.
 * Désactivé tant que ENABLE_DEPARTURE_MELODY_CLIPS est false (copyright).
 */
export async function playDepartureMelodyForContext(context: MelodyPlayContext): Promise<boolean> {
  if (!ENABLE_DEPARTURE_MELODY_CLIPS) return false;
  if (context.trainState !== 'stopped_doors_open') return false;
  if (context.emergencyActive) return false;

  // Bic Camera A/B (voies 5/6) : peuvent démarrer sans departureAuthorized.
  if (await playIkebukuroInnerBicCameraA(context)) return true;
  if (await playIkebukuroInnerBicCameraB(context)) return true;

  if (context.departureAuthorized === false) return false;
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
  if (await playTakanawaGatewayOuterGloriousB(context)) return true;
  if (await playKandaOuterMondaminA(context)) return true;
  if (await playKandaInnerMondaminB(context)) return true;
  if (await playInnerMainMelody(context)) return true;
  if (await playOuterMainMelody(context)) return true;
  return false;
}

// La procédure complète - mélodie, puis annonce, fermetures et départ - vivait
// aussi ici, sous `startDepartureSequence`, derrière un drapeau
// `runtime.autonomousDepartureSequence` que personne ne posait jamais. C'était
// un second ordonnanceur de départ, en sommeil, en face de celui de
// `systems/stationCycle` qui, lui, mène l'arrêt. Deux chronologies pour un même
// départ, dont une morte : elle est partie, et le drapeau avec elle.
//
// `melodyDepartureGuardState()` l'accompagne : une sonde exposée « pour les
// tests » que ni test ni outil n'appelait.
