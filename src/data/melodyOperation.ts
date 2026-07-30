import type { LoopDirection } from './platforms.ts';

export interface MelodyOperationPlan {
  startAt: number;
  minimumPlaySeconds: number;
  preferredPlaySeconds: number;
  maximumPlaySeconds: number;
  preferredRounds: number;
  maySkip: boolean;
  stopMode: 'phrase-boundary' | 'operator-release' | 'incident-cut';
}

export interface MelodyOperationContext {
  stationCode: string; direction: LoopDirection; platform: number; dwellSeconds: number;
  delayed: boolean; crowdLevel: number; alternativePlatform: boolean; originating: boolean;
  terminating: boolean; outOfService: boolean; departureBlocked: boolean;
}

/** Plan déterministe injectable. departureSequence conserve son fallback à deux passages. */
export function createMelodyOperationPlan(
  context: MelodyOperationContext,
  random: () => number,
): MelodyOperationPlan {
  const unavailable = context.terminating || context.outOfService;
  const maximum = Math.max(0, context.dwellSeconds - 4);
  if (unavailable || maximum < 2) {
    return {
      startAt: 0, minimumPlaySeconds: 0, preferredPlaySeconds: 0,
      maximumPlaySeconds: 0, preferredRounds: 0, maySkip: true,
      stopMode: context.departureBlocked ? 'incident-cut' : 'operator-release',
    };
  }
  const crowded = context.crowdLevel >= 0.7;
  const preferredRounds = maximum >= 14 && (!context.delayed || random() >= 0.55) ? 2 : 1;
  const preferred = Math.min(maximum, preferredRounds === 2 ? 14 : 7);
  return {
    startAt: context.originating ? 1 : 0,
    minimumPlaySeconds: Math.min(maximum, crowded ? 5 : 3),
    preferredPlaySeconds: preferred,
    maximumPlaySeconds: maximum,
    preferredRounds,
    maySkip: context.delayed && !crowded,
    stopMode: context.departureBlocked ? 'incident-cut' : 'phrase-boundary',
  };
}
