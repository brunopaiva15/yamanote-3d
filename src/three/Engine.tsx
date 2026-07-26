// Boucle 60 fps unique : toute la logique par frame passe par ici, aucune
// mise à jour d'état React par frame ailleurs.

import { useFrame } from '@react-three/fiber';
import { V_MAX } from '../data/config';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { updateCycle } from '../systems/stationCycle';
import { updateDoorMotion } from '../systems/doorMotion';
import { updateSegmentEnv } from '../systems/segmentEnv';
import { updatePlatformPresence } from '../systems/platformPresence';
import { updatePlatformCrowd } from '../systems/platformCrowd';
import { setPlatformDoors, updateAudio } from '../systems/audioEngine';
import { updatePassengers } from '../systems/passengers';

/**
 * Plafond du dt cycle : borne les trous que l'API Visibility ne signale pas
 * (mise en veille machine, page restée « visible »). Une frame lente mais
 * visible avance le cycle de tout son temps écoulé — le seuil ne sert qu'à
 * éviter de téléporter le train de plusieurs gares d'un coup.
 */
const CYCLE_DT_CAP = 5;
/** Plafond du dt physique : pas stables pour portes / PNJ / audio. */
const PHYS_DT_CAP = 0.05;

// Onglet repris après masquage : rAF était en pause, la première frame porte
// tout le temps caché. On saute l'avance du cycle sur cette frame-là (évite
// de sauter des gares) — mais UNIQUEMENT elle : une frame lente sur un onglet
// visible (shaders, GC, GPU saturé) doit compter en entier, sinon le cycle
// gèle sous charge et le prochain arrêt n'arrive jamais.
let tabJustResumed = false;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tabJustResumed = true;
  });
}

export function Engine(): null {
  useFrame((_, rawDt) => {
    const raw = Math.max(0, rawDt);
    const skipCycle = tabJustResumed;
    tabJustResumed = false;
    // Cycle & déplacement : horloge murale. Un FPS bas ne doit ni ralentir ni
    // geler le passage d'une gare à l'autre.
    const cycleDt = skipCycle ? 0 : Math.min(raw, CYCLE_DT_CAP);
    const physDt = Math.min(raw, PHYS_DT_CAP);
    if (cycleDt <= 0 && physDt <= 0) return;

    const { phase, started } = useStore.getState();
    if (!started) return;

    if (cycleDt > 0) {
      updateCycle(cycleDt);
      updateSegmentEnv(cycleDt);
      updatePlatformPresence();
    }
    if (physDt > 0) {
      updateDoorMotion(physDt);
      updateAudio(physDt, runtime.speed / V_MAX, phase === 'brake');
      // Le quai n'est audible que par les ouvertures réellement dégagées :
      // il faut la porte de la rame ET la porte palière en face.
      setPlatformDoors(runtime.doorOpen * runtime.psdOpen);
      updatePassengers(physDt);
      updatePlatformCrowd(physDt);
    }
  });
  return null;
}
