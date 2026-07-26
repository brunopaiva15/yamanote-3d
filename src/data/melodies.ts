// Mélodies de départ (発車メロディ) par quai — Inner / Outer Loop principaux.
// Diffusées par les haut-parleurs du quai, uniquement pendant la procédure
// de départ (train à l'arrêt, portes ouvertes).

import type { LoopDirection } from './platforms';

/** Chemin logique du clip Inner Loop principal (sous public/). */
export const INNER_MAIN_MELODY_PATH =
  '/audio/melodies/01_jre-ikst-010-01_inner-main.mp3';

/** Chemin logique du clip Outer Loop principal (sous public/). */
export const OUTER_MAIN_MELODY_PATH =
  '/audio/melodies/02_jre-ikst-010-02_outer-main.mp3';

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

/** Quai Outer Loop qui diffuse 02_jre-ikst-010-02_outer-main.mp3. */
export const outerMainMelodyPlatforms: Record<
  string,
  { station: string; platform: number; nextStation: string }
> = {
  JY01: { station: 'Tokyo', platform: 5, nextStation: 'Yurakucho' },
  JY03: { station: 'Akihabara', platform: 3, nextStation: 'Kanda' },
  JY04: { station: 'Okachimachi', platform: 2, nextStation: 'Akihabara' },
  JY05: { station: 'Ueno', platform: 3, nextStation: 'Okachimachi' },
  JY08: { station: 'Nishi-Nippori', platform: 2, nextStation: 'Nippori' },
  JY16: { station: 'Shin-Okubo', platform: 1, nextStation: 'Takadanobaba' },
  JY17: { station: 'Shinjuku', platform: 15, nextStation: 'Shin-Okubo' },
  JY18: { station: 'Yoyogi', platform: 1, nextStation: 'Shinjuku' },
  JY19: { station: 'Harajuku', platform: 2, nextStation: 'Yoyogi' },
  JY20: { station: 'Shibuya', platform: 1, nextStation: 'Harajuku' },
  JY22: { station: 'Meguro', platform: 2, nextStation: 'Ebisu' },
  JY23: { station: 'Gotanda', platform: 2, nextStation: 'Meguro' },
  JY24: { station: 'Osaki', platform: 3, nextStation: 'Gotanda' },
  JY25: { station: 'Shinagawa', platform: 3, nextStation: 'Osaki' },
  JY27: { station: 'Tamachi', platform: 3, nextStation: 'Takanawa Gateway' },
  JY28: { station: 'Hamamatsucho', platform: 3, nextStation: 'Tamachi' },
  JY29: { station: 'Shimbashi', platform: 4, nextStation: 'Hamamatsucho' },
  JY30: { station: 'Yurakucho', platform: 3, nextStation: 'Shimbashi' },
};

/** État du train pertinent pour le déclenchement de la 発車メロディ. */
export type TrainState =
  | 'moving'
  | 'approaching'
  | 'stopped_doors_closed'
  | 'stopped_doors_open'
  | 'doors_closing'
  | 'departing';

export type ServiceType = 'normal' | 'out_of_service' | 'terminal';

export type MelodyPlayContext = {
  line: string;
  direction: LoopDirection;
  stationCode: string;
  platform: number;
  trainState: TrainState;
  departureSequenceStarted: boolean;
  /** Identifiant unique d'un arrêt (anti double-lecture). */
  departureId?: string;
  trainId?: string;
  stopSequence?: number;
  serviceType?: ServiceType;
  emergencyActive?: boolean;
  departureAuthorized?: boolean;
  /** @deprecated préférer serviceType */
  outOfService?: boolean;
  /** @deprecated préférer serviceType */
  terminus?: boolean;
};

export function resolveServiceType(ctx: MelodyPlayContext): ServiceType {
  if (ctx.serviceType) return ctx.serviceType;
  if (ctx.outOfService) return 'out_of_service';
  if (ctx.terminus) return 'terminal';
  return 'normal';
}

export function makeDepartureId(parts: {
  trainId: string;
  stationCode: string;
  platform: number;
  stopSequence: number;
}): string {
  return [parts.trainId, parts.stationCode, parts.platform, parts.stopSequence].join('-');
}

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
  if (ctx.emergencyActive) return false;
  if (ctx.departureAuthorized === false) return false;

  const service = resolveServiceType(ctx);
  if (service === 'out_of_service' || service === 'terminal') return false;

  const stationConfig = innerMainMelodyPlatforms[ctx.stationCode];
  if (!stationConfig) return false;
  if (Number(stationConfig.platform) !== Number(ctx.platform)) return false;

  return true;
}

/**
 * Vrai uniquement pour l'Outer Loop Yamanote, quai listé (JRE-IKST-010-02),
 * train à l'arrêt portes ouvertes, procédure de départ déclenchée.
 * À Ōsaki : quai 3 seulement (le quai 4 utilise une autre mélodie).
 */
export function shouldPlayOuterMainMelody(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.direction !== 'outer') return false;
  if (ctx.trainState !== 'stopped_doors_open') return false;
  if (!ctx.departureSequenceStarted) return false;
  if (ctx.emergencyActive) return false;
  if (ctx.departureAuthorized === false) return false;

  const service = resolveServiceType(ctx);
  if (service === 'out_of_service' || service === 'terminal') return false;

  const stationConfig = outerMainMelodyPlatforms[ctx.stationCode];
  if (!stationConfig) return false;
  if (Number(stationConfig.platform) !== Number(ctx.platform)) return false;

  return true;
}
