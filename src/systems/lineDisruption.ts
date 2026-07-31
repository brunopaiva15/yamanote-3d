import type { LoopDirection } from '../data/platforms.ts';
import {
  definitionFor, estimatedResumeClock, seededDisruptionRandom, selectAffectedDirections,
  selectDisruptionCause, selectDisruptionDuration, selectDisruptionLocation, shouldReviseEstimate,
  type AffectedDirections, type DisruptionCause, type DisruptionSeverity, type DisruptionSource,
} from '../data/platformDisruptions.ts';

export type DisruptionPhase = 'inactive' | 'delayed' | 'suspended' | 'resuming' | 'recovering';
export interface LineDisruptionState {
  id: number; phase: DisruptionPhase; cause: DisruptionCause | null; severity: DisruptionSeverity | null;
  source: DisruptionSource | null; locationStationIndex: number | null; locationNextStationIndex: number | null;
  affectedDirections: AffectedDirections | null; elapsedSeconds: number; holdRemainingSeconds: number;
  initialHoldSeconds: number; estimatedResumeClockMin: number | null; estimateRevisionCount: number;
  startedAtStopSequence: number; recoveringTrainsRemaining: number; initialAnnouncementPlayed: boolean;
  updateAnnouncementPlayed: boolean; resumeAnnouncementPlayed: boolean; releaseBufferSeconds: number;
}

export const lineDisruption: LineDisruptionState = {
  id: 0, phase: 'inactive', cause: null, severity: null, source: null, locationStationIndex: null,
  locationNextStationIndex: null, affectedDirections: null, elapsedSeconds: 0, holdRemainingSeconds: 0,
  initialHoldSeconds: 0, estimatedResumeClockMin: null, estimateRevisionCount: 0,
  startedAtStopSequence: 0, recoveringTrainsRemaining: 0, initialAnnouncementPlayed: false,
  updateAnnouncementPlayed: false, resumeAnnouncementPlayed: false, releaseBufferSeconds: 0,
};

export interface BeginDisruptionOptions { cause?: DisruptionCause; severity?: DisruptionSeverity; seconds?: number; source?: DisruptionSource; direction: LoopDirection; stationIndex: number; seed?: string; force?: boolean; clockMin?: number; stopSequence?: number; }

export function beginPlatformDisruption(o: BeginDisruptionOptions): boolean {
  if (lineDisruption.phase !== 'inactive' && lineDisruption.phase !== 'recovering' && !o.force) return false;
  const random = seededDisruptionRandom(o.seed ?? `${o.stopSequence ?? 0}:${o.stationIndex}:${o.direction}`);
  if (!o.force && random() >= 0.05) return false;
  let severity = o.severity;
  if (!severity) { const r = random(); severity = r < 0.8 ? 'minor' : r < 0.98 ? 'moderate' : 'suspended'; }
  const definition = o.cause ? definitionFor(o.cause) : selectDisruptionCause(random, severity);
  if (o.cause && !o.severity) severity = definition.severity;
  const seconds = Math.max(0, o.seconds ?? selectDisruptionDuration(definition, random));
  const location = selectDisruptionLocation(o.stationIndex, o.direction, random);
  Object.assign(lineDisruption, {
    id: lineDisruption.id + 1, phase: severity === 'suspended' ? 'suspended' : 'delayed',
    cause: definition.cause, severity, source: o.source ?? 'platform-roll',
    locationStationIndex: location.stationIndex, locationNextStationIndex: location.nextStationIndex,
    affectedDirections: selectAffectedDirections(definition, o.direction, random), elapsedSeconds: 0,
    holdRemainingSeconds: seconds, initialHoldSeconds: seconds,
    estimatedResumeClockMin: severity === 'suspended' && random() < 0.25 ? null : estimatedResumeClock(o.clockMin ?? 0, seconds),
    estimateRevisionCount: 0, startedAtStopSequence: o.stopSequence ?? 0,
    recoveringTrainsRemaining: 0, initialAnnouncementPlayed: false, updateAnnouncementPlayed: false,
    resumeAnnouncementPlayed: false, releaseBufferSeconds: 0,
  });
  return true;
}

export function notifyOnboardEmergency(reason = 0, direction: LoopDirection = 'inner', stationIndex = 0, clockMin = 0, stopSequence = 0): void {
  beginPlatformDisruption({ cause: (['safety-check', 'signal-check', 'person-on-track'] as const)[Math.abs(reason) % 3], severity: 'moderate', seconds: 45 + Math.abs(reason % 3) * 20, source: 'onboard-emergency', direction, stationIndex, clockMin, stopSequence, force: true });
}
export function notifyPowerOutage(direction: LoopDirection = 'inner', stationIndex = 0, clockMin = 0, stopSequence = 0): void { beginPlatformDisruption({ cause: 'power-outage', severity: 'suspended', seconds: 240, source: 'power-outage', direction, stationIndex, clockMin, stopSequence, force: true }); }

export function updateLineDisruption(dt: number): void {
  const d = Math.max(0, dt);
  if (lineDisruption.phase === 'delayed' || lineDisruption.phase === 'suspended') {
    lineDisruption.elapsedSeconds += d;
    lineDisruption.holdRemainingSeconds = Math.max(0, lineDisruption.holdRemainingSeconds - d);
    const random = seededDisruptionRandom(`rev:${lineDisruption.id}`);
    if (lineDisruption.severity && shouldReviseEstimate(lineDisruption.severity, lineDisruption.elapsedSeconds, lineDisruption.initialHoldSeconds, lineDisruption.estimateRevisionCount, random)) {
      const extension = Math.round(45 + random() * 90);
      lineDisruption.holdRemainingSeconds += extension;
      const previous = lineDisruption.estimatedResumeClockMin ?? 0;
      lineDisruption.estimatedResumeClockMin = Math.max(previous, previous + extension / 60);
      lineDisruption.estimateRevisionCount += 1;
      lineDisruption.updateAnnouncementPlayed = false;
    }
    if (lineDisruption.holdRemainingSeconds <= 0) resolveLineDisruption();
  } else if (lineDisruption.phase === 'resuming') {
    lineDisruption.releaseBufferSeconds = Math.max(0, lineDisruption.releaseBufferSeconds - d);
    if (lineDisruption.releaseBufferSeconds <= 0) lineDisruption.phase = 'recovering';
  }
}

export function resolveLineDisruption(): void {
  if (lineDisruption.phase !== 'delayed' && lineDisruption.phase !== 'suspended') return;
  lineDisruption.phase = 'resuming'; lineDisruption.holdRemainingSeconds = 0;
  lineDisruption.releaseBufferSeconds = 10 + (lineDisruption.id % 16);
  lineDisruption.recoveringTrainsRemaining = 2 + (lineDisruption.id % 3);
}
export function clearLineDisruption(): void { const id = lineDisruption.id; Object.assign(lineDisruption, { id, phase: 'inactive', cause: null, severity: null, source: null, locationStationIndex: null, locationNextStationIndex: null, affectedDirections: null, elapsedSeconds: 0, holdRemainingSeconds: 0, initialHoldSeconds: 0, estimatedResumeClockMin: null, estimateRevisionCount: 0, startedAtStopSequence: 0, recoveringTrainsRemaining: 0, initialAnnouncementPlayed: false, updateAnnouncementPlayed: false, resumeAnnouncementPlayed: false, releaseBufferSeconds: 0 }); }
export function disruptionAffects(direction: LoopDirection): boolean { return lineDisruption.affectedDirections === 'both' || lineDisruption.affectedDirections === direction; }
export function nextTrainBlocked(direction: LoopDirection): boolean { return disruptionAffects(direction) && (lineDisruption.phase === 'delayed' || lineDisruption.phase === 'suspended' || lineDisruption.phase === 'resuming'); }
export function disruptionExtraSeconds(direction: LoopDirection): number { if (!disruptionAffects(direction)) return 0; if (lineDisruption.phase === 'recovering') return 12 + lineDisruption.recoveringTrainsRemaining * 3; return Math.max(0, lineDisruption.holdRemainingSeconds + lineDisruption.releaseBufferSeconds); }
export function disruptionHasKnownEta(direction: LoopDirection): boolean { return !disruptionAffects(direction) || lineDisruption.phase !== 'suspended' || lineDisruption.estimatedResumeClockMin !== null; }
export function lineIsRecovering(): boolean { return lineDisruption.phase === 'recovering'; }
export function lineDelayed(): boolean { return lineDisruption.phase !== 'inactive'; }
export function consumeRecoveryTrain(): void { if (lineDisruption.phase !== 'recovering') return; lineDisruption.recoveringTrainsRemaining = Math.max(0, lineDisruption.recoveringTrainsRemaining - 1); if (!lineDisruption.recoveringTrainsRemaining) clearLineDisruption(); }
