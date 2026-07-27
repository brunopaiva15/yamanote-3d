// Qualité vidéo : six préréglages nommés choisis par le joueur (écran de
// démarrage et HUD), du plus léger au plus riche. Chaque préréglage correspond
// à un palier interne (5 → 0) qui pilote résolution de rendu, post-processing,
// ombres, néons du wagon et densité de PNJ. Le choix est mémorisé entre les
// visites et s'applique immédiatement, y compris en cours de trajet.

import { create } from 'zustand';

export type Quality = 'veryLow' | 'low' | 'medium' | 'high' | 'veryHigh' | 'ultra';

/** Ordre d'affichage dans les sélecteurs : du plus léger au plus riche. */
export const QUALITIES: readonly Quality[] = [
  'veryLow',
  'low',
  'medium',
  'high',
  'veryHigh',
  'ultra',
];

export type PerfLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Palier interne consommé par la scène : 0 = ultra (tout activé) …
 * 5 = veryLow (rendu direct, résolution réduite, PNJ clairsemés).
 */
const QUALITY_LEVEL: Record<Quality, PerfLevel> = {
  ultra: 0,
  veryHigh: 1,
  high: 2,
  medium: 3,
  low: 4,
  veryLow: 5,
};

/** Part des passagers conservée à chaque palier (rame et foule du quai). */
const PAX_SCALE: Record<PerfLevel, number> = { 0: 1, 1: 0.85, 2: 0.7, 3: 0.5, 4: 0.35, 5: 0.2 };

const STORAGE_KEY = 'yamanote.quality';

function isQuality(value: string | null | undefined): value is Quality {
  return (QUALITIES as readonly string[]).includes(value ?? '');
}

/** Choix mémorisé, sinon pleine qualité (le joueur ajuste depuis le menu). */
function initialQuality(): Quality {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isQuality(stored)) return stored;
  } catch {
    /* localStorage indisponible (mode privé, iframe cloisonnée) */
  }
  return 'ultra';
}

interface PerfState {
  quality: Quality;
}

/** Qualité courante — lue par React (Scene, HUD) comme par les systèmes hors React. */
export const usePerf = create<PerfState>(() => ({ quality: initialQuality() }));

export function setQuality(quality: Quality): void {
  try {
    localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    /* le jeu reste jouable, la préférence ne survivra pas au rechargement */
  }
  usePerf.setState({ quality });
}

export function perfLevel(): PerfLevel {
  return QUALITY_LEVEL[usePerf.getState().quality];
}

export function qualityLevel(quality: Quality): PerfLevel {
  return QUALITY_LEVEL[quality];
}

export function paxScale(): number {
  return PAX_SCALE[perfLevel()];
}

/**
 * Niveau de détail de la gare : 0 = tout, 1 = sans la charpente de signature,
 * 2 = mobilier réduit, 3 = quai nu. Le quai n'est visible que par intervalles,
 * mais il est long de 224 m : c'est le plus gros poste quand on marche dessus.
 */
export function platformDetail(): 0 | 1 | 2 | 3 {
  const l = perfLevel();
  if (l <= 1) return 0;
  if (l === 2) return 1;
  if (l === 3) return 2;
  return 3;
}

/**
 * Niveau de détail de la rame vue de l'extérieur : 0 = tout, 1 = sans les
 * ornements, 2 = bogies simplifiés, 3 = vantaux figés. L'extérieur n'est
 * visible que depuis le quai, où la scène du wagon ne coûte plus rien.
 */
export function consistDetail(): 0 | 1 | 2 | 3 {
  const l = perfLevel();
  if (l <= 1) return 0;
  if (l === 2) return 1;
  if (l === 3) return 2;
  return 3;
}
