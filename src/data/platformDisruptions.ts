import { nextStation } from './loop.ts';
import type { LoopDirection } from './platforms.ts';

export type DisruptionCause =
  | 'passenger-assistance' | 'door-inspection' | 'vehicle-inspection' | 'safety-check'
  | 'person-on-track' | 'signal-check' | 'power-outage' | 'person-accident';
export type DisruptionSeverity = 'minor' | 'moderate' | 'suspended';
export type AffectedDirections = LoopDirection | 'both';
export type DisruptionSource = 'platform-roll' | 'onboard-emergency' | 'power-outage' | 'development';

export interface DisruptionDefinition {
  cause: DisruptionCause;
  severity: DisruptionSeverity;
  weight: number;
  minimumSeconds: number;
  maximumSeconds: number;
  canAffectBothDirections: boolean;
  canSuspendService: boolean;
  japaneseCause: string;
  englishCause: string;
}

export const DISRUPTION_DEFINITIONS: readonly DisruptionDefinition[] = [
  { cause: 'passenger-assistance', severity: 'minor', weight: 28, minimumSeconds: 45, maximumSeconds: 120, canAffectBothDirections: false, canSuspendService: false, japaneseCause: 'お客さま救護', englishCause: 'passenger assistance' },
  { cause: 'door-inspection', severity: 'minor', weight: 24, minimumSeconds: 30, maximumSeconds: 90, canAffectBothDirections: false, canSuspendService: false, japaneseCause: 'ドア点検', englishCause: 'a door inspection' },
  { cause: 'safety-check', severity: 'moderate', weight: 18, minimumSeconds: 60, maximumSeconds: 180, canAffectBothDirections: true, canSuspendService: false, japaneseCause: '安全確認', englishCause: 'safety checks' },
  { cause: 'vehicle-inspection', severity: 'moderate', weight: 13, minimumSeconds: 90, maximumSeconds: 240, canAffectBothDirections: false, canSuspendService: true, japaneseCause: '車両点検', englishCause: 'a train inspection' },
  { cause: 'signal-check', severity: 'moderate', weight: 9, minimumSeconds: 120, maximumSeconds: 300, canAffectBothDirections: true, canSuspendService: true, japaneseCause: '信号確認', englishCause: 'signal checks' },
  { cause: 'person-on-track', severity: 'suspended', weight: 5, minimumSeconds: 180, maximumSeconds: 420, canAffectBothDirections: true, canSuspendService: true, japaneseCause: '線路に人立入', englishCause: 'a person on the tracks' },
  { cause: 'power-outage', severity: 'suspended', weight: 3, minimumSeconds: 240, maximumSeconds: 600, canAffectBothDirections: true, canSuspendService: true, japaneseCause: '停電', englishCause: 'a power outage' },
  // Jamais inclus dans le tirage ordinaire : uniquement incident explicite/dev.
  { cause: 'person-accident', severity: 'suspended', weight: 0, minimumSeconds: 300, maximumSeconds: 900, canAffectBothDirections: true, canSuspendService: true, japaneseCause: '人身事故', englishCause: 'a passenger accident' },
] as const;

export function definitionFor(cause: DisruptionCause): DisruptionDefinition {
  return DISRUPTION_DEFINITIONS.find((d) => d.cause === cause)!;
}

export function seededDisruptionRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function selectDisruptionCause(random: () => number, severity?: DisruptionSeverity): DisruptionDefinition {
  const choices = DISRUPTION_DEFINITIONS.filter((d) => d.weight > 0 && (!severity || d.severity === severity));
  const total = choices.reduce((n, d) => n + d.weight, 0);
  let pick = random() * total;
  for (const d of choices) if ((pick -= d.weight) <= 0) return d;
  return choices[choices.length - 1];
}

export function selectDisruptionDuration(definition: DisruptionDefinition, random: () => number): number {
  return Math.round(definition.minimumSeconds + random() * (definition.maximumSeconds - definition.minimumSeconds));
}

export function selectAffectedDirections(definition: DisruptionDefinition, current: LoopDirection, random: () => number): AffectedDirections {
  return definition.canAffectBothDirections && random() < 0.28 ? 'both' : current;
}

export function selectDisruptionLocation(stationIndex: number, direction: LoopDirection, random: () => number): { stationIndex: number; nextStationIndex: number | null } {
  const offset = Math.floor(random() * 5) - 2;
  const station = ((stationIndex + offset) % 30 + 30) % 30;
  return random() < 0.72 ? { stationIndex: station, nextStationIndex: null } : { stationIndex: station, nextStationIndex: nextStation(station, direction) };
}

export function estimatedResumeClock(clockMin: number, seconds: number): number {
  return clockMin + Math.max(0, seconds) / 60;
}

export function shouldReviseEstimate(severity: DisruptionSeverity, elapsed: number, initial: number, revisions: number, random: () => number): boolean {
  return severity !== 'minor' && revisions === 0 && elapsed >= initial * 0.65 && random() < 0.35;
}
