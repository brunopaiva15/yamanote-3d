import { MELODY_DURATIONS } from './melodyManifest.ts';

export interface OriginalMelodyDefinition {
  id: string; displayName: string; audioPath: string;
  legacyTechnicalId?: string; historicalReference?: string;
  originalComposition: true; copyrightPolicy: 'original-no-motif-copy';
  seed?: number; tempo?: number; meter?: [number, number]; tonalCenter?: string; mode?: string;
  instrumentation: string[]; mood: string[]; targetDuration: number; legacyGeneratedAsset: boolean;
}

const NAMES = [
  'Inner Loop Lantern', 'Outer Loop Breeze', 'Osaki Morning Link', 'Osaki Evening Link',
  'Spring Haze', 'Petal Current', 'Morning Birdsong', 'Quiet Stream', 'Future March A',
  'Future March B', 'Ebisu Evening Promenade F', 'Gateway Light A', 'Gateway Light B',
  'Kanda City Pulse A', 'Kanda City Pulse B', 'Ikebukuro Electric Crossing A',
  'Ikebukuro Electric Crossing B', 'Inner Loop Lantern B', 'Outer Loop Breeze B',
] as const;

/** Métadonnées non destructives des 19 actifs; les chemins restent les identifiants runtime. */
export const ORIGINAL_MELODY_DEFINITIONS: readonly OriginalMelodyDefinition[] = Object.entries(
  MELODY_DURATIONS,
).map(([audioPath, targetDuration], index) => ({
  id: `legacy-original-${String(index + 1).padStart(2, '0')}`,
  displayName: NAMES[index] ?? audioPath.split('/').pop()?.replace(/\.mp3$/, '') ?? audioPath,
  audioPath,
  legacyTechnicalId: audioPath.split('/').pop()?.replace(/\.mp3$/, ''),
  originalComposition: true,
  copyrightPolicy: 'original-no-motif-copy',
  instrumentation: ['additive synthesis'], mood: ['platform', 'original'], targetDuration,
  legacyGeneratedAsset: true,
}));

export function melodyDefinitionForPath(path: string): OriginalMelodyDefinition | undefined {
  return ORIGINAL_MELODY_DEFINITIONS.find((definition) => definition.audioPath === path);
}
