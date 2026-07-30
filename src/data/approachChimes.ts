import type { LoopDirection } from './platforms.ts';

export interface OriginalApproachChime {
  id: string;
  displayName: string;
  family: 'two-tone' | 'three-tone' | 'ascending' | 'descending' | 'warning-pulse' | 'generic';
  duration: number;
  audioPath: string;
  originalComposition: true;
  seed: number;
}

/** Adaptation fictive Tone.js conservant le carillon générique actuel. */
export const GENERIC_APPROACH_CHIME: OriginalApproachChime = {
  id: 'yamanote-platform-signal-generic', displayName: 'Loop Signal', family: 'generic',
  duration: 1.2, audioPath: 'tone://platformChime', originalComposition: true, seed: 235013,
};

export function approachChimeFor(
  _stationCode: string, _direction: LoopDirection, _platform: number,
): OriginalApproachChime {
  return GENERIC_APPROACH_CHIME;
}
