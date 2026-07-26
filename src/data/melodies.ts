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

/** Chemin logique du clip Inner secondaire Ōsaki voie 2 (JRE-IKST-010-03). */
export const OSAKI_INNER_SECONDARY_MELODY_PATH =
  '/audio/melodies/03_jre-ikst-010-03_inner-secondary-osaki.mp3';

/** Config exclusive : Ōsaki Inner Loop plateforme 2 → Shinagawa. */
export const OSAKI_INNER_SECONDARY_MELODY = {
  id: 'jre-ikst-010-03',
  file: OSAKI_INNER_SECONDARY_MELODY_PATH,
  line: 'yamanote',
  stationCode: 'JY24',
  stationName: 'Osaki',
  direction: 'inner' as const,
  platform: 2,
  nextStationCode: 'JY25',
  nextStationName: 'Shinagawa',
  type: 'departure_melody' as const,
};

/** Chemin logique du clip Outer secondaire Ōsaki voie 4 (JRE-IKST-010-05). */
export const OSAKI_OUTER_SECONDARY_MELODY_PATH =
  '/audio/melodies/04_jre-ikst-010-05_outer-secondary-osaki.mp3';

/** Config exclusive : Ōsaki Outer Loop plateforme 4 → Gotanda. */
export const OSAKI_OUTER_SECONDARY_MELODY = {
  id: 'jre-ikst-010-05',
  file: OSAKI_OUTER_SECONDARY_MELODY_PATH,
  line: 'yamanote',
  stationCode: 'JY24',
  stationName: 'Osaki',
  direction: 'outer' as const,
  platform: 4,
  nextStationCode: 'JY23',
  nextStationName: 'Gotanda',
  type: 'departure_melody' as const,
};

/** Chemin : Sakura Sakura A — Komagome Outer voie 1. */
export const KOMAGOME_OUTER_SAKURA_A_PATH = '/audio/melodies/05_sakura-sakura-a.mp3';

/** Config exclusive : Komagome Outer Loop plateforme 1 → Tabata. */
export const KOMAGOME_OUTER_SAKURA_A = {
  id: 'sakura-sakura-a',
  name: 'Sakura Sakura A',
  japaneseName: 'さくらさくらA',
  file: KOMAGOME_OUTER_SAKURA_A_PATH,
  type: 'departure_melody' as const,
  source: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY10',
  stationName: 'Komagome',
  direction: 'outer' as const,
  platform: 1,
  nextStationCode: 'JY09',
  nextStationName: 'Tabata',
};

/** Chemin : Sakura Sakura B / V2 — Komagome Inner voie 2. */
export const KOMAGOME_INNER_SAKURA_V2_PATH = '/audio/melodies/06_sakura-sakura-b.mp3';

/** Config exclusive : Komagome Inner Loop plateforme 2 → Sugamo. */
export const KOMAGOME_INNER_SAKURA_V2 = {
  id: 'sakura-sakura-v2',
  file: KOMAGOME_INNER_SAKURA_V2_PATH,
  name: 'Sakura Sakura V2',
  japaneseName: 'さくらさくら V2',
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY10',
  stationName: 'Komagome',
  direction: 'inner' as const,
  platform: 2,
  nextStationCode: 'JY11',
  nextStationName: 'Sugamo',
};

/** Chemin : Haru Tremolo — Uguisudani Inner voie 2. */
export const UGUISUDANI_INNER_HARU_TREMOLO_PATH = '/audio/melodies/08_haru-tremolo.mp3';

/** Config exclusive : Uguisudani Inner Loop plateforme 2 → Nippori. */
export const UGUISUDANI_INNER_HARU_TREMOLO = {
  id: 'haru-tremolo',
  name: 'Haru Tremolo',
  japaneseName: '春（トレモロ）',
  file: UGUISUDANI_INNER_HARU_TREMOLO_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY06',
  stationName: 'Uguisudani',
  direction: 'inner' as const,
  platform: 2,
  nextStationCode: 'JY07',
  nextStationName: 'Nippori',
};

/** Chemin : Seseragi — six quais Outer Yamanote. */
export const SESERAGI_MELODY_PATH = '/audio/melodies/09_seseragi.mp3';

export const SESERAGI_MELODY = {
  id: 'seseragi',
  name: 'Seseragi',
  japaneseName: 'せせらぎ',
  file: SESERAGI_MELODY_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
};

/** Quais Outer qui diffusent Seseragi. */
export const SESERAGI_PLATFORMS: Record<
  string,
  {
    station: string;
    platform: number;
    direction: 'outer';
    nextStationCode: string;
    nextStation: string;
  }
> = {
  JY06: {
    station: 'Uguisudani',
    platform: 3,
    direction: 'outer',
    nextStationCode: 'JY05',
    nextStation: 'Ueno',
  },
  JY07: {
    station: 'Nippori',
    platform: 10,
    direction: 'outer',
    nextStationCode: 'JY06',
    nextStation: 'Uguisudani',
  },
  JY09: {
    station: 'Tabata',
    platform: 3,
    direction: 'outer',
    nextStationCode: 'JY08',
    nextStation: 'Nishi-Nippori',
  },
  JY11: {
    station: 'Sugamo',
    platform: 2,
    direction: 'outer',
    nextStationCode: 'JY10',
    nextStation: 'Komagome',
  },
  JY12: {
    station: 'Otsuka',
    platform: 2,
    direction: 'outer',
    nextStationCode: 'JY11',
    nextStation: 'Sugamo',
  },
  JY14: {
    station: 'Mejiro',
    platform: 2,
    direction: 'outer',
    nextStationCode: 'JY13',
    nextStation: 'Ikebukuro',
  },
};

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
  /** Prochaine gare (code JY), ex. JY25 depuis Ōsaki Inner. */
  nextStationCode?: string;
  serviceType?: ServiceType;
  /** Alias runtime : out_of_service | terminated | in_service. */
  serviceState?: 'in_service' | 'out_of_service' | 'terminated';
  emergencyActive?: boolean;
  departureAuthorized?: boolean;
  /** @deprecated préférer serviceType */
  outOfService?: boolean;
  /** @deprecated préférer serviceType */
  terminus?: boolean;
};

export function resolveServiceType(ctx: MelodyPlayContext): ServiceType {
  if (ctx.serviceState === 'out_of_service') return 'out_of_service';
  if (ctx.serviceState === 'terminated') return 'terminal';
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

/**
 * JRE-IKST-010-03 : exclusivement Ōsaki (JY24) Inner Loop plateforme 2 → Shinagawa.
 * Ne jamais jouer sur la voie 1 (mélodie principale) ni en terminus / hors service.
 */
export function shouldPlayOsakiInnerSecondaryMelody(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== OSAKI_INNER_SECONDARY_MELODY.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== OSAKI_INNER_SECONDARY_MELODY.platform) return false;

  if (ctx.nextStationCode && ctx.nextStationCode !== OSAKI_INNER_SECONDARY_MELODY.nextStationCode) {
    return false;
  }

  if (ctx.trainState !== 'stopped_doors_open') return false;
  if (!ctx.departureSequenceStarted) return false;
  if (ctx.departureAuthorized === false) return false;
  if (ctx.emergencyActive) return false;

  if (ctx.serviceState === 'out_of_service' || ctx.serviceState === 'terminated') return false;
  const service = resolveServiceType(ctx);
  if (service === 'out_of_service' || service === 'terminal') return false;

  return true;
}

/**
 * JRE-IKST-010-05 : exclusivement Ōsaki (JY24) Outer Loop plateforme 4 → Gotanda.
 * Ne jamais jouer sur la voie 3 (mélodie principale) ni en terminus / hors service.
 */
export function shouldPlayOsakiOuterSecondaryMelody(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== OSAKI_OUTER_SECONDARY_MELODY.stationCode) return false;
  if (ctx.direction !== 'outer') return false;
  if (Number(ctx.platform) !== OSAKI_OUTER_SECONDARY_MELODY.platform) return false;

  if (ctx.nextStationCode && ctx.nextStationCode !== OSAKI_OUTER_SECONDARY_MELODY.nextStationCode) {
    return false;
  }

  if (ctx.trainState !== 'stopped_doors_open') return false;
  if (!ctx.departureSequenceStarted) return false;
  if (ctx.departureAuthorized === false) return false;
  if (ctx.emergencyActive) return false;

  if (ctx.serviceState === 'out_of_service' || ctx.serviceState === 'terminated') return false;
  const service = resolveServiceType(ctx);
  if (service === 'out_of_service' || service === 'terminal') return false;

  return true;
}

/**
 * Sakura Sakura A : exclusivement Komagome (JY10) Outer Loop plateforme 1 → Tabata.
 * La voie 2 Inner utilise Sakura Sakura B (autre fichier).
 */
export function shouldPlayKomagomeOuterSakuraA(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== KOMAGOME_OUTER_SAKURA_A.stationCode) return false;
  if (ctx.direction !== 'outer') return false;
  if (Number(ctx.platform) !== KOMAGOME_OUTER_SAKURA_A.platform) return false;

  if (ctx.nextStationCode && ctx.nextStationCode !== KOMAGOME_OUTER_SAKURA_A.nextStationCode) {
    return false;
  }

  if (ctx.trainState !== 'stopped_doors_open') return false;
  if (!ctx.departureSequenceStarted) return false;
  if (ctx.departureAuthorized === false) return false;
  if (ctx.emergencyActive) return false;

  if (ctx.serviceState === 'out_of_service' || ctx.serviceState === 'terminated') return false;
  const service = resolveServiceType(ctx);
  if (service === 'out_of_service' || service === 'terminal') return false;

  return true;
}

/**
 * Sakura Sakura V2 : exclusivement Komagome (JY10) Inner Loop plateforme 2 → Sugamo.
 * La voie 1 Outer utilise Sakura Sakura A / V1.
 */
export function shouldPlayKomagomeInnerSakuraV2(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== KOMAGOME_INNER_SAKURA_V2.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== KOMAGOME_INNER_SAKURA_V2.platform) return false;

  if (ctx.nextStationCode && ctx.nextStationCode !== KOMAGOME_INNER_SAKURA_V2.nextStationCode) {
    return false;
  }

  if (ctx.trainState !== 'stopped_doors_open') return false;
  if (!ctx.departureSequenceStarted) return false;
  if (ctx.emergencyActive) return false;

  if (ctx.serviceState === 'out_of_service' || ctx.serviceState === 'terminated') return false;
  const service = resolveServiceType(ctx);
  if (service === 'out_of_service' || service === 'terminal') return false;

  return true;
}

/**
 * Haru Tremolo : exclusivement Uguisudani (JY06) Inner Loop plateforme 2 → Nippori.
 * La voie 3 Outer utilise Seseragi.
 */
export function shouldPlayUguisudaniInnerHaruTremolo(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== UGUISUDANI_INNER_HARU_TREMOLO.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== UGUISUDANI_INNER_HARU_TREMOLO.platform) return false;

  if (ctx.nextStationCode && ctx.nextStationCode !== UGUISUDANI_INNER_HARU_TREMOLO.nextStationCode) {
    return false;
  }

  if (ctx.trainState !== 'stopped_doors_open') return false;
  if (!ctx.departureSequenceStarted) return false;
  if (ctx.emergencyActive) return false;

  if (ctx.serviceState === 'out_of_service' || ctx.serviceState === 'terminated') return false;
  const service = resolveServiceType(ctx);
  if (service === 'out_of_service' || service === 'terminal') return false;

  return true;
}

/**
 * Seseragi : Outer Loop uniquement, sur les six quais listés dans SESERAGI_PLATFORMS.
 */
export function shouldPlaySeseragi(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.direction !== 'outer') return false;
  if (ctx.trainState !== 'stopped_doors_open') return false;
  if (!ctx.departureSequenceStarted) return false;
  if (ctx.emergencyActive) return false;

  if (ctx.serviceState === 'out_of_service' || ctx.serviceState === 'terminated') return false;
  const service = resolveServiceType(ctx);
  if (service === 'out_of_service' || service === 'terminal') return false;

  const stationConfig = SESERAGI_PLATFORMS[ctx.stationCode];
  if (!stationConfig) return false;
  if (Number(ctx.platform) !== Number(stationConfig.platform)) return false;
  if (ctx.nextStationCode && ctx.nextStationCode !== stationConfig.nextStationCode) return false;

  return true;
}
