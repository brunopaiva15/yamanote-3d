// État global (zustand) : uniquement l'état discret, à faible fréquence de
// changement. Les valeurs continues (vitesse, distance, portes) vivent dans
// systems/runtime.ts et sont mutées chaque frame sans re-render React.

import { create } from 'zustand';
import { CONFIG } from './data/config';
import { DOOR_SIDE } from './data/stations';
import { runtime, tokyoMinutesNow } from './systems/runtime';

export type Phase = 'cruise' | 'brake' | 'dwell' | 'depart';

interface AppState {
  started: boolean;
  muted: boolean;
  volume: number;
  index: number; // station suivante (en roulant) ou courante (à quai)
  phase: Phase;
  doorSide: 1 | -1;
  seated: boolean;
  touch: boolean; // interface tactile active
  vocab: string | null; // mot de vocabulaire regardé (fiche Shashingo)

  start: () => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  setPhase: (p: Phase) => void;
  setIndex: (i: number) => void;
  setDoorSide: (s: 1 | -1) => void;
  setSeated: (b: boolean) => void;
  setTouch: (b: boolean) => void;
  setVocab: (v: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  started: false,
  muted: false,
  volume: 0.8,
  index: CONFIG.startIndex,
  phase: 'cruise',
  doorSide: DOOR_SIDE[CONFIG.startIndex],
  seated: false,
  touch: false,
  vocab: null,

  start: () => {
    // L'horloge du monde se cale sur l'heure réelle de Tokyo.
    runtime.clockMin = tokyoMinutesNow();
    set({ started: true });
  },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setVolume: (volume) => set({ volume }),
  setPhase: (phase) => set({ phase }),
  setIndex: (index) => set({ index }),
  setDoorSide: (doorSide) => set({ doorSide }),
  setSeated: (seated) => set({ seated }),
  setTouch: (touch) => set({ touch }),
  setVocab: (vocab) => set({ vocab }),
}));
