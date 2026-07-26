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

/** Chemin : Tetsuwan Atom ver.A — Takadanobaba Outer voie 1. */
export const TAKADANOBABA_OUTER_ATOM_A_PATH = '/audio/melodies/10_tetsuwan-atom-a.mp3';

/** Config exclusive : Takadanobaba Outer Loop plateforme 1 → Mejiro. */
export const TAKADANOBABA_OUTER_ATOM_A = {
  id: 'tetsuwan-atom-ver-a',
  name: 'Tetsuwan Atom ver.A',
  japaneseName: '鉄腕アトム ver.A',
  file: TAKADANOBABA_OUTER_ATOM_A_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY15',
  stationName: 'Takadanobaba',
  direction: 'outer' as const,
  platform: 1,
  nextStationCode: 'JY14',
  nextStationName: 'Mejiro',
};

/** Chemin : Tetsuwan Atom ver.B — Takadanobaba Inner voie 2. */
export const TAKADANOBABA_INNER_ATOM_B_PATH = '/audio/melodies/11_tetsuwan-atom-b.mp3';

/** Config exclusive : Takadanobaba Inner Loop plateforme 2 → Shin-Okubo. */
export const TAKADANOBABA_INNER_ATOM_B = {
  id: 'tetsuwan-atom-ver-b',
  name: 'Tetsuwan Atom ver.B',
  japaneseName: '鉄腕アトム ver.B',
  file: TAKADANOBABA_INNER_ATOM_B_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY15',
  stationName: 'Takadanobaba',
  direction: 'inner' as const,
  platform: 2,
  nextStationCode: 'JY16',
  nextStationName: 'Shin-Okubo',
};

/** Chemin : The Third Man ver.F — Ebisu Inner voie 2. */
export const EBISU_INNER_THIRD_MAN_F_PATH = '/audio/melodies/13_the-third-man-f.mp3';

/** Config exclusive : Ebisu Inner Loop plateforme 2 → Meguro. */
export const EBISU_INNER_THIRD_MAN_F = {
  id: 'the-third-man-ver-f',
  name: 'The Third Man ver.F',
  japaneseName: '第三の男 ver.F',
  file: EBISU_INNER_THIRD_MAN_F_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY21',
  stationName: 'Ebisu',
  direction: 'inner' as const,
  platform: 2,
  nextStationCode: 'JY22',
  nextStationName: 'Meguro',
};

/** Chemin : Glorious Gateway A — Takanawa Gateway Inner voie 1. */
export const TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH =
  '/audio/melodies/14_glorious-gateway-a.mp3';

/** Config exclusive : Takanawa Gateway Inner Loop plateforme 1 → Tamachi. */
export const TAKANAWA_GATEWAY_INNER_GLORIOUS_A = {
  id: 'glorious-gateway-a',
  name: 'Glorious Gateway A',
  file: TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY26',
  stationName: 'Takanawa Gateway',
  direction: 'inner' as const,
  platform: 1,
  nextStationCode: 'JY27',
  nextStationName: 'Tamachi',
};

/** Chemin : Glorious Gateway B — Takanawa Gateway Outer voie 2. */
export const TAKANAWA_GATEWAY_OUTER_GLORIOUS_B_PATH =
  '/audio/melodies/15_glorious-gateway-b.mp3';

/** Config exclusive : Takanawa Gateway Outer Loop plateforme 2 → Shinagawa. */
export const TAKANAWA_GATEWAY_OUTER_GLORIOUS_B = {
  id: 'glorious-gateway-b',
  name: 'Glorious Gateway B',
  file: TAKANAWA_GATEWAY_OUTER_GLORIOUS_B_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY26',
  stationName: 'Takanawa Gateway',
  direction: 'outer' as const,
  platform: 2,
  nextStationCode: 'JY25',
  nextStationName: 'Shinagawa',
};

/** Chemin : Mondamin CM Song ver.A — Kanda Outer voie 2. */
export const KANDA_OUTER_MONDAMIN_A_PATH =
  '/audio/melodies/16_mondamin-cm-song-a.mp3';

/** Config exclusive : Kanda Outer Loop plateforme 2 → Tokyo. */
export const KANDA_OUTER_MONDAMIN_A = {
  id: 'mondamin-cm-song-ver-a',
  name: 'Mondamin CM Song ver.A',
  japaneseName: 'モンダミンCMソング ver.A',
  file: KANDA_OUTER_MONDAMIN_A_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY02',
  stationName: 'Kanda',
  direction: 'outer' as const,
  platform: 2,
  nextStationCode: 'JY01',
  nextStationName: 'Tokyo',
};

/** Chemin : Mondamin CM Song ver.B — Kanda Inner voie 3. */
export const KANDA_INNER_MONDAMIN_B_PATH =
  '/audio/melodies/17_mondamin-cm-song-b.mp3';

/** Config exclusive : Kanda Inner Loop plateforme 3 → Akihabara. */
export const KANDA_INNER_MONDAMIN_B = {
  id: 'mondamin-cm-song-ver-b',
  name: 'Mondamin CM Song ver.B',
  japaneseName: 'モンダミンCMソング ver.B',
  file: KANDA_INNER_MONDAMIN_B_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY02',
  stationName: 'Kanda',
  direction: 'inner' as const,
  platform: 3,
  nextStationCode: 'JY03',
  nextStationName: 'Akihabara',
};

/** Chemin : Bic Camera Theme Song ver.A — Ikebukuro Inner voie 5 (secondaire). */
export const IKEBUKURO_INNER_BIC_CAMERA_A_PATH =
  '/audio/melodies/18_bic-camera-theme-a.mp3';

/** Config exclusive : Ikebukuro Inner Loop plateforme 5 → Mejiro. */
export const IKEBUKURO_INNER_BIC_CAMERA_A = {
  id: 'bic-camera-theme-ver-a',
  name: 'Bic Camera Theme Song ver.A',
  japaneseName: 'ビックカメラテーマソング ver.A',
  file: IKEBUKURO_INNER_BIC_CAMERA_A_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY13',
  stationName: 'Ikebukuro',
  direction: 'inner' as const,
  platform: 5,
  nextStationCode: 'JY14',
  nextStationName: 'Mejiro',
};

/** Chemin : Bic Camera Theme Song ver.B — Ikebukuro Inner voie 6 (principale). */
export const IKEBUKURO_INNER_BIC_CAMERA_B_PATH =
  '/audio/melodies/19_bic-camera-theme-b.mp3';

/** Config exclusive : Ikebukuro Inner Loop plateforme 6 → Mejiro. */
export const IKEBUKURO_INNER_BIC_CAMERA_B = {
  id: 'bic-camera-theme-ver-b',
  name: 'Bic Camera Theme Song ver.B',
  japaneseName: 'ビックカメラテーマソング ver.B',
  file: IKEBUKURO_INNER_BIC_CAMERA_B_PATH,
  type: 'departure_melody' as const,
  audioSource: 'platform_speakers' as const,
  line: 'yamanote',
  stationCode: 'JY13',
  stationName: 'Ikebukuro',
  direction: 'inner' as const,
  platform: 6,
  nextStationCode: 'JY14',
  nextStationName: 'Mejiro',
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

/**
 * Tetsuwan Atom ver.A : exclusivement Takadanobaba (JY15) Outer Loop plateforme 1 → Mejiro.
 * La voie 2 Inner utilise Atom ver.B.
 */
export function shouldPlayTakadanobabaOuterAtomA(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== TAKADANOBABA_OUTER_ATOM_A.stationCode) return false;
  if (ctx.direction !== 'outer') return false;
  if (Number(ctx.platform) !== TAKADANOBABA_OUTER_ATOM_A.platform) return false;

  if (ctx.nextStationCode && ctx.nextStationCode !== TAKADANOBABA_OUTER_ATOM_A.nextStationCode) {
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
 * Tetsuwan Atom ver.B : exclusivement Takadanobaba (JY15) Inner Loop plateforme 2 → Shin-Okubo.
 * La voie 1 Outer utilise Atom ver.A.
 */
export function shouldPlayTakadanobabaInnerAtomB(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== TAKADANOBABA_INNER_ATOM_B.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== TAKADANOBABA_INNER_ATOM_B.platform) return false;

  if (ctx.nextStationCode && ctx.nextStationCode !== TAKADANOBABA_INNER_ATOM_B.nextStationCode) {
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
 * The Third Man ver.F : exclusivement Ebisu (JY21) Inner Loop plateforme 2 → Meguro.
 * La voie 1 Outer (ver.E) n’est pas encore fournie.
 */
export function shouldPlayEbisuInnerThirdManF(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== EBISU_INNER_THIRD_MAN_F.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== EBISU_INNER_THIRD_MAN_F.platform) return false;

  if (ctx.nextStationCode && ctx.nextStationCode !== EBISU_INNER_THIRD_MAN_F.nextStationCode) {
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
 * Glorious Gateway A : exclusivement Takanawa Gateway (JY26) Inner Loop plateforme 1 → Tamachi.
 * La voie 2 Outer utilise Glorious Gateway B.
 */
export function shouldPlayTakanawaGatewayInnerGloriousA(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== TAKANAWA_GATEWAY_INNER_GLORIOUS_A.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== TAKANAWA_GATEWAY_INNER_GLORIOUS_A.platform) return false;

  if (
    ctx.nextStationCode &&
    ctx.nextStationCode !== TAKANAWA_GATEWAY_INNER_GLORIOUS_A.nextStationCode
  ) {
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
 * Glorious Gateway B : exclusivement Takanawa Gateway (JY26) Outer Loop plateforme 2 → Shinagawa.
 * Les voies 3/4 (Keihin-Tōhoku) ne sont pas concernées.
 */
export function shouldPlayTakanawaGatewayOuterGloriousB(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== TAKANAWA_GATEWAY_OUTER_GLORIOUS_B.stationCode) return false;
  if (ctx.direction !== 'outer') return false;
  if (Number(ctx.platform) !== TAKANAWA_GATEWAY_OUTER_GLORIOUS_B.platform) return false;

  if (
    ctx.nextStationCode &&
    ctx.nextStationCode !== TAKANAWA_GATEWAY_OUTER_GLORIOUS_B.nextStationCode
  ) {
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
 * Mondamin CM Song ver.A : exclusivement Kanda (JY02) Outer Loop plateforme 2 → Tokyo.
 * La voie 3 Inner utilise Mondamin CM Song ver.B.
 */
export function shouldPlayKandaOuterMondaminA(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== KANDA_OUTER_MONDAMIN_A.stationCode) return false;
  if (ctx.direction !== 'outer') return false;
  if (Number(ctx.platform) !== KANDA_OUTER_MONDAMIN_A.platform) return false;

  if (
    ctx.nextStationCode &&
    ctx.nextStationCode !== KANDA_OUTER_MONDAMIN_A.nextStationCode
  ) {
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
 * Mondamin CM Song ver.B : exclusivement Kanda (JY02) Inner Loop plateforme 3 → Akihabara.
 */
export function shouldPlayKandaInnerMondaminB(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== KANDA_INNER_MONDAMIN_B.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== KANDA_INNER_MONDAMIN_B.platform) return false;

  if (
    ctx.nextStationCode &&
    ctx.nextStationCode !== KANDA_INNER_MONDAMIN_B.nextStationCode
  ) {
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
 * Bic Camera Theme Song ver.A : exclusivement Ikebukuro (JY13) Inner Loop plateforme 5 → Mejiro.
 * La voie 6 (principale) utilise ver.B. Ne pas exiger departureAuthorized.
 */
export function shouldPlayIkebukuroInnerBicCameraA(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== IKEBUKURO_INNER_BIC_CAMERA_A.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== IKEBUKURO_INNER_BIC_CAMERA_A.platform) return false;

  if (
    ctx.nextStationCode &&
    ctx.nextStationCode !== IKEBUKURO_INNER_BIC_CAMERA_A.nextStationCode
  ) {
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
 * Bic Camera Theme Song ver.B : exclusivement Ikebukuro (JY13) Inner Loop plateforme 6 → Mejiro.
 * Voie principale Inner. Ne pas exiger departureAuthorized.
 */
export function shouldPlayIkebukuroInnerBicCameraB(ctx: MelodyPlayContext): boolean {
  if (ctx.line !== 'yamanote') return false;
  if (ctx.stationCode !== IKEBUKURO_INNER_BIC_CAMERA_B.stationCode) return false;
  if (ctx.direction !== 'inner') return false;
  if (Number(ctx.platform) !== IKEBUKURO_INNER_BIC_CAMERA_B.platform) return false;

  if (
    ctx.nextStationCode &&
    ctx.nextStationCode !== IKEBUKURO_INNER_BIC_CAMERA_B.nextStationCode
  ) {
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
