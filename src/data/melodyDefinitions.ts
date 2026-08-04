import { MELODY_DURATIONS } from './melodyManifest.ts';

export interface OriginalMelodyDefinition {
  id: string; displayName: string; audioPath: string;
  legacyTechnicalId?: string; historicalReference?: string;
  originalComposition: true; copyrightPolicy: 'original-no-motif-copy';
  seed?: number; tempo?: number; meter?: [number, number]; tonalCenter?: string; mode?: string;
  instrumentation: string[]; mood: string[]; targetDuration: number; legacyGeneratedAsset: boolean;
}

const NAMES = [
  'Inner Loop Ring of Light', 'Outer Loop Ring of Wind', 'Osaki Morning Link', 'Osaki Evening Link',
  'Spring Haze', 'Petal Current', 'Morning Birdsong', 'Quiet Stream', 'Future March A',
  'Future March B', 'Ebisu Evening Promenade F', 'Gateway Light A', 'Gateway Light B',
  'Kanda City Pulse A', 'Kanda City Pulse B', 'Ikebukuro Electric Crossing A',
  'Ikebukuro Electric Crossing B', 'Inner Loop Lantern B', 'Outer Loop Breeze B',
] as const;

/**
 * Les deux branchements principaux ont été regravés par
 * scripts/piano-melody-gen.py : un piano acoustique brillant aux deux mains,
 * avec un éclat de verre posé sur l'attaque de la droite. Deux interprétations
 * d'une SEULE partition (mêmes hauteurs, mêmes durées,
 * mêmes positions rythmiques ; seuls le toucher, la pédale et la couleur
 * changent). Ces deux-là ont donc la traçabilité complète que les dix-sept
 * autres n'ont pas - graine, tempo, mesure, centre tonal - et ne sont plus
 * marqués `legacyGeneratedAsset`.
 */
const REGRAVED: Record<string, Partial<OriginalMelodyDefinition>> = {
  '/audio/melodies/01_jre-ikst-010-01_inner-main.mp3': {
    seed: 1001,
    instrumentation: ['bright acoustic piano', 'glass attack sparkle'],
    mood: ['platform', 'original', 'luminous', 'reassuring'],
  },
  '/audio/melodies/02_jre-ikst-010-02_outer-main.mp3': {
    seed: 2002,
    instrumentation: ['bright acoustic piano', 'glass attack sparkle'],
    mood: ['platform', 'original', 'airy', 'contemplative'],
  },
};

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
  // Le piano est daté, mesuré et reproductible : la partition et les nuances
  // vivent dans le script, pas dans un fichier qu'on ne saurait plus refaire.
  ...(REGRAVED[audioPath]
    ? { tempo: 110, meter: [4, 4] as [number, number], tonalCenter: 'C', mode: 'major',
        legacyGeneratedAsset: false, ...REGRAVED[audioPath] }
    : {}),
}));

export function melodyDefinitionForPath(path: string): OriginalMelodyDefinition | undefined {
  return ORIGINAL_MELODY_DEFINITIONS.find((definition) => definition.audioPath === path);
}
