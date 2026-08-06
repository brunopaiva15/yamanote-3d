// Initialisation coûteuse chargée à la demande avec le chunk du jeu, jamais
// pendant que le visiteur consulte simplement le menu.

import type { LoopDirection } from '../data/platforms';
import { useStore } from '../store';
import { startAudio, setVolume } from './audioEngine';
import { seedPassengers } from './passengers';
import { seedWeather } from './weather';
import { randomizeEntry } from './stationCycle';
import { updatePlatformSpeakers } from './stationPa';

export async function prepareGame(
  stationIndex: number | undefined,
  direction: LoopDirection | undefined,
): Promise<void> {
  seedWeather();
  try {
    await startAudio();
    setVolume(useStore.getState().volume);
  } catch {
    // L'expérience reste jouable sans audio.
  }

  randomizeEntry(stationIndex, direction);
  updatePlatformSpeakers();
  seedPassengers();
}
