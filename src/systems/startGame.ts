// Initialisation coûteuse chargée à la demande avec le chunk du jeu, jamais
// pendant que le visiteur consulte simplement le menu.

import type { LoopDirection } from '../data/platforms';
import { segmentAt } from '../data/segments';
import { useStore } from '../store';
import { startAudio, setVolume } from './audioEngine';
import { seedPassengers } from './passengers';
import { seedWeather } from './weather';
import { randomizeEntry } from './stationCycle';
import { updatePlatformSpeakers } from './stationPa';
import { PLATEAU_SEGMENT, plateauEntryStation } from './plateau';

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

  const entryStation = plateauEntryStation(direction ?? 'inner');
  if (entryStation !== undefined) {
    const dir = direction ?? 'inner';
    for (let attempt = 0; attempt < 32; attempt++) {
      randomizeEntry(entryStation, dir);
      if (segmentAt(useStore.getState().index, dir) === PLATEAU_SEGMENT) break;
    }
  } else {
    randomizeEntry(stationIndex, direction);
  }
  updatePlatformSpeakers();
  seedPassengers();
}
