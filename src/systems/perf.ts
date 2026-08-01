// Qualité vidéo : sept préréglages nommés choisis par le joueur (écran de
// démarrage et HUD), du plus léger au plus riche. Les six premiers
// correspondent à un palier interne (5 → 0) qui pilote résolution de rendu,
// post-processing, ombres, néons du wagon et densité de PNJ. Le choix est
// mémorisé entre les visites et s'applique immédiatement, y compris en cours
// de trajet.
//
// Le septième - « Extraordinaire », en bêta - n'est PAS un palier de plus sur
// la même échelle : c'est un autre moteur de rendu. Il demande WebGPU, bascule
// la scène sur le système de nœuds de three.js (TSL) et ouvre ce que le rendu
// WebGL ne sait pas faire ici : éclairage indirect en espace écran (SSGI),
// réflexions en espace écran (SSR), profondeur de champ à bokeh, pluie
// intégrée sur le GPU. Il partage le palier 0 avec Ultra - même densité de
// décor, mêmes ombres - et n'y ajoute QUE ce que le nouveau moteur permet.

import { create } from 'zustand';

export type Quality =
  | 'veryLow'
  | 'low'
  | 'medium'
  | 'high'
  | 'veryHigh'
  | 'ultra'
  | 'extraordinary';

/** Ordre d'affichage dans les sélecteurs : du plus léger au plus riche. */
export const QUALITIES: readonly Quality[] = [
  'veryLow',
  'low',
  'medium',
  'high',
  'veryHigh',
  'ultra',
  'extraordinary',
];

export type PerfLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Palier interne consommé par la scène : 0 = ultra (tout activé) …
 * 5 = veryLow (rendu direct, résolution réduite, PNJ clairsemés).
 *
 * « Extraordinaire » retombe volontairement sur 0 : tout ce que le palier
 * décrit (ombres, densité du décor, résolution) y est déjà au maximum, et ce
 * mode ne se distingue que par le MOTEUR (voir `renderPath`).
 */
const QUALITY_LEVEL: Record<Quality, PerfLevel> = {
  extraordinary: 0,
  ultra: 0,
  veryHigh: 1,
  high: 2,
  medium: 3,
  low: 4,
  veryLow: 5,
};

/** Part des passagers conservée à chaque palier (rame et foule du quai). */
const PAX_SCALE: Record<PerfLevel, number> = { 0: 1, 1: 0.85, 2: 0.7, 3: 0.5, 4: 0.35, 5: 0.2 };

/**
 * Surcroît de densité humaine du mode Extraordinaire.
 *
 * Le pipeline WebGPU rend la même scène pour nettement moins d'appels de
 * rendu ; ce qu'on récupère, on le remet dans ce qui se voit le plus : du
 * monde. La rame se remplit vers ses places disponibles (les slots de siège et
 * de station debout bornent d'eux-mêmes le résultat) et le quai se rapproche
 * de son plafond de pool.
 */
const EXTRAORDINARY_PAX = 1.22;

const STORAGE_KEY = 'yamanote.quality';

function isQuality(value: string | null | undefined): value is Quality {
  return (QUALITIES as readonly string[]).includes(value ?? '');
}

/**
 * WebGPU est-il seulement exposé par ce navigateur ?
 *
 * Ce n'est qu'un test de PRÉSENCE : l'adaptateur peut encore être refusé à la
 * demande (pilote sur liste noire, machine sans GPU). L'échec réel est traité
 * au montage du rendu, qui redescend alors sur Ultra en le disant.
 */
export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/** Le moteur qu'un préréglage demande. */
export type RenderPath = 'webgl' | 'webgpu';

export function renderPath(quality: Quality): RenderPath {
  return quality === 'extraordinary' ? 'webgpu' : 'webgl';
}

interface PerfState {
  quality: Quality;
  /**
   * WebGPU a été demandé et a refusé de démarrer sur cette machine. On ne
   * retente pas tant que le joueur ne le redemande pas : un adaptateur qui
   * échoue une fois échoue à chaque fois, et une boucle de reprise laisserait
   * l'écran noir.
   */
  webgpuFailed: boolean;
}

/**
 * Choix mémorisé, sinon qualité haute à la première visite, sur mobile comme
 * sur ordinateur. Une préférence existante prime toujours sur cette valeur -
 * sauf « Extraordinaire » sur une machine sans WebGPU, qui retombe sur Ultra
 * plutôt que d'ouvrir sur un écran noir.
 */
function initialQuality(): Quality {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isQuality(stored)) {
      if (stored === 'extraordinary' && !webgpuAvailable()) return 'ultra';
      return stored;
    }
  } catch {
    /* localStorage indisponible (mode privé, iframe cloisonnée) */
  }
  return 'high';
}

/** Qualité courante - lue par React (Scene, HUD) comme par les systèmes hors React. */
export const usePerf = create<PerfState>(() => ({
  quality: initialQuality(),
  webgpuFailed: false,
}));

export function setQuality(quality: Quality): void {
  try {
    localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    /* le jeu reste jouable, la préférence ne survivra pas au rechargement */
  }
  // Redemander explicitement le mode WebGPU vaut nouvelle tentative : le
  // joueur a pu changer de drapeau de navigateur entre-temps.
  usePerf.setState({ quality, webgpuFailed: false });
}

/**
 * Le moteur WebGPU n'a pas démarré. On redescend sur Ultra - la qualité la
 * plus proche - et on le dit, plutôt que de laisser une toile vide.
 */
export function reportWebgpuFailure(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'ultra');
  } catch {
    /* voir setQuality */
  }
  usePerf.setState({ quality: 'ultra', webgpuFailed: true });
}

export function perfLevel(): PerfLevel {
  return QUALITY_LEVEL[usePerf.getState().quality];
}

export function qualityLevel(quality: Quality): PerfLevel {
  return QUALITY_LEVEL[quality];
}

/** Le mode Extraordinaire est-il celui qui est SÉLECTIONNÉ ? */
export function extraordinary(): boolean {
  return usePerf.getState().quality === 'extraordinary';
}

export function paxScale(): number {
  return PAX_SCALE[perfLevel()] * (extraordinary() ? EXTRAORDINARY_PAX : 1);
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
