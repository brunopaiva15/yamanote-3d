// Mélodies de départ (発車メロディ) par quai — Inner Loop principal.
// Diffusées par les haut-parleurs du quai, uniquement pendant la procédure
// de départ (train à l'arrêt, portes ouvertes).

import type { LoopDirection } from './platforms';

/** Chemin logique du clip Inner Loop principal (sous public/). */
export const INNER_MAIN_MELODY_PATH =
  '/audio/melodies/01_jre-ikst-010-01_inner-main.mp3';

/** Quai Inner Loop qui diffuse 01_jre-ikst-010-01_inner-main.mp3. */
export const innerMainMelodyPlatforms: Record<
  string,
  { station: string; platform: number }
> = {
  JY01: { station: 'Tokyo', platform: 4 },
  JY03: { station: 'Akihabara', platform: 2 },
  JY04: { station: 'Okachimachi', platform: 3 },
  JY05: { station: 'Ueno', platform: 2 },
  JY07: { station: 'Nippori', platform: 11 },
  JY08: { station: 'Nishi-Nippori', platform: 3 },
  JY09: { station: 'Tabata', platform: 2 },
  JY16: { station: 'Shin-Okubo', platform: 2 },
  JY17: { station: 'Shinjuku', platform: 14 },
  JY18: { station: 'Yoyogi', platform: 2 },
  JY19: { station: 'Harajuku', platform: 1 },
  JY20: { station: 'Shibuya', platform: 2 },
  JY22: { station: 'Meguro', platform: 1 },
  JY23: { station: 'Gotanda', platform: 1 },
  JY24: { station: 'Osaki', platform: 1 },
  JY25: { station: 'Shinagawa', platform: 1 },
  JY27: { station: 'Tamachi', platform: 2 },
  JY28: { station: 'Hamamatsucho', platform: 2 },
  JY29: { station: 'Shimbashi', platform: 5 },
  JY30: { station: 'Yurakucho', platform: 2 },
};

/** État du train pertinent pour le déclenchement de la 発車メロディ. */
export type TrainState =
  | 'moving'
  | 'approaching'
  | 'stopped_doors_closed'
  | 'stopped_doors_open'
  | 'doors_closing'
  | 'departing';

export type MelodyPlayContext = {
  line: string;
  direction: LoopDirection;
  stationCode: string;
  platform: number;
  trainState: TrainState;
  departureSequenceStarted: boolean;
  /** Terminus / hors service : ne jamais jouer cette mélodie. */
  outOfService?: boolean;
  terminus?: boolean;
};

/**
 * Vrai uniquement pour l'Inner Loop Yamanote, quai listé, train à l'arrêt
 * portes ouvertes, procédure de départ déjà déclenchée.
 * À Ōsaki : quai 1 seulement (le quai 2 utilise une autre mélodie).
 */
export function shouldPlayInnerMainMelody(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.direction !== 'inner') return false;
  if (ctx.trainState !== 'stopped_doors_open') return false;
  if (!ctx.departureSequenceStarted) return false;
  if (ctx.outOfService || ctx.terminus) return false;

  const stationConfig = innerMainMelodyPlatforms[ctx.stationCode];
  if (!stationConfig) return false;
  if (stationConfig.platform !== ctx.platform) return false;

  return true;
}
