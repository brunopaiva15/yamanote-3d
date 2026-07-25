// Boucle 60 fps unique : toute la logique par frame passe par ici, aucune
// mise à jour d'état React par frame ailleurs.

import { useFrame } from '@react-three/fiber';
import { V_MAX } from '../data/config';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { updateCycle } from '../systems/stationCycle';
import { updateSegmentEnv } from '../systems/segmentEnv';
import { setPlatformDoors, updateAudio } from '../systems/audioEngine';
import { updatePassengers } from '../systems/passengers';

export function Engine(): null {
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (dt <= 0) return;
    const { phase, started } = useStore.getState();
    if (!started) return;
    updateCycle(dt);
    updateSegmentEnv(dt);
    updateAudio(dt, runtime.speed / V_MAX, phase === 'brake');
    // Le quai n'est audible que par les ouvertures réellement dégagées :
    // il faut la porte de la rame ET la porte palière en face.
    setPlatformDoors(runtime.doorOpen * runtime.psdOpen);
    updatePassengers(dt);
  });
  return null;
}
