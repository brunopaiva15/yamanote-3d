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

/** Au-delà : onglet repris après pause — on n'avance pas le cycle (évite de sauter des gares). */
const TAB_RESUME_GAP = 1.5;
/** Plafond du dt cycle : à ≥1 FPS on reste en temps réel pour les phases gare. */
const CYCLE_DT_CAP = 1;
/** Plafond du dt physique : pas stables pour portes / PNJ / audio. */
const PHYS_DT_CAP = 0.05;

export function Engine(): null {
  useFrame((_, rawDt) => {
    const raw = Math.max(0, rawDt);
    // Cycle & déplacement : horloge murale. Un FPS bas ne doit plus ralentir
    // le passage d'une gare à l'autre (l'ancien min(dt, 0.05) divisait le
    // temps réel par 5–10 sous charge).
    const cycleDt = raw > TAB_RESUME_GAP ? 0 : Math.min(raw, CYCLE_DT_CAP);
    const physDt = raw > TAB_RESUME_GAP ? 0 : Math.min(raw, PHYS_DT_CAP);
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
