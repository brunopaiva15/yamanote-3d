// État global (zustand) : uniquement l'état discret, à faible fréquence de
// changement. Les valeurs continues (vitesse, distance, portes) vivent dans
// systems/runtime.ts et sont mutées chaque frame sans re-render React.

import { create } from 'zustand';
import { CONFIG } from './data/config';
import type { LoopDirection } from './data/platforms';
import { DOOR_SIDE } from './data/stations';
import { applyDocumentLang, initialLang, storeLang, type Lang } from './i18n/strings';

export type Phase = 'cruise' | 'brake' | 'dwell' | 'depart';

interface AppState {
  started: boolean;
  muted: boolean;
  volume: number;
  index: number; // station suivante (en roulant) ou courante (à quai)
  /**
   * Gare dont le quai est physiquement là, autour de la rame. Égal à `index`
   * sauf pendant le départ : `index` avance vers la gare suivante dès l'entrée
   * en `depart`, alors que le quai qu'on longe encore — géométrie, palette,
   * signalétique — reste celui de la gare quittée, jusqu'à être hors de vue.
   */
  platformIndex: number;
  phase: Phase;
  doorSide: 1 | -1;
  /** Sens de circulation : 内回り (inner) par défaut — boucle actuelle du sim. */
  loopDirection: LoopDirection;
  seated: boolean;
  /** Le joueur est descendu sur le quai (état discret, pour le HUD). */
  onPlatform: boolean;
  touch: boolean; // interface tactile active
  /** Langue de l'interface : détectée au premier lancement, puis mémorisée. */
  lang: Lang;

  start: () => void;
  setLang: (l: Lang) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  setPhase: (p: Phase) => void;
  setIndex: (i: number) => void;
  setPlatformIndex: (i: number) => void;
  setDoorSide: (s: 1 | -1) => void;
  setLoopDirection: (d: LoopDirection) => void;
  setSeated: (b: boolean) => void;
  setOnPlatform: (b: boolean) => void;
  setTouch: (b: boolean) => void;
}

const START_LANG = initialLang();
applyDocumentLang(START_LANG);

export const useStore = create<AppState>((set) => ({
  started: false,
  muted: false,
  volume: 0.8,
  index: CONFIG.startIndex,
  platformIndex: CONFIG.startIndex,
  // Valeurs par défaut avant boarding ; randomizeEntry() les remplace.
  phase: 'cruise',
  doorSide: DOOR_SIDE[CONFIG.startIndex],
  loopDirection: 'inner',
  seated: false,
  onPlatform: false,
  touch: false,
  lang: START_LANG,

  start: () => {
    // L'horloge et la date sont posées par StartScreen.board() (heure réelle
    // à Tokyo, ou celle choisie avant de monter). On ne les écrase pas ici.
    set({ started: true });
  },
  setLang: (lang) => {
    storeLang(lang);
    applyDocumentLang(lang);
    set({ lang });
  },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setVolume: (volume) => set({ volume }),
  setPhase: (phase) => set({ phase }),
  setIndex: (index) => set({ index }),
  setPlatformIndex: (platformIndex) => set({ platformIndex }),
  setDoorSide: (doorSide) => set({ doorSide }),
  setLoopDirection: (loopDirection) => set({ loopDirection }),
  setSeated: (seated) => set({ seated }),
  setOnPlatform: (onPlatform) => set({ onPlatform }),
  setTouch: (touch) => set({ touch }),
}));
