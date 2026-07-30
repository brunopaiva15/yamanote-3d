// Numéros de quai (platform) réels de la Yamanote, par gare et par sens.
// Utilisés au runtime pour la 発車メロディ (voir data/melodies.ts) et
// disponibles pour affichage / annonces / orientation.
//
// 内回り (inner) = sens STATIONS[i] → STATIONS[(i+1)%30] (Tokyo → Kanda → …).
// 外回り (outer) = sens inverse (Tokyo → Yūrakuchō → …).
//
// À Ikebukuro (JY13) et Ōsaki (JY24), un quai alternatif sert aux
// départs / terminus / arrangements spéciaux.

export type LoopDirection = 'inner' | 'outer';

import { DOOR_SIDE, STATIONS } from './stations.ts';
import { hasPlatformDoors, layoutFor } from './stationLayouts.ts';
import type { SourcedValue } from './evidence.ts';

export type DoorSide = 'left' | 'right';
export type PlatformServiceRole =
  | 'through'
  | 'originating'
  | 'terminating'
  | 'depot-access'
  | 'alternative';

export interface PlatformEvidence {
  doorSide?: SourcedValue<DoorSide>;
  platformDoors?: SourcedValue<boolean>;
  approachChime?: SourcedValue<string>;
  automaticVoice?: SourcedValue<'atos-inner' | 'atos-outer'>;
}

export interface YamanotePlatformProfile {
  stationCode: string;
  direction: LoopDirection;
  platform: number;
  nextStationCode: string;
  doorSide: DoorSide;
  serviceRoles: PlatformServiceRole[];
  platformDoors: {
    installed: boolean;
    type?: 'half-height' | 'full-height';
    openDelay?: number;
    closeDelay?: number;
  };
  approachChime?: { profileId: string };
  departureMelody: { compositionId: string };
  automaticVoice?: { japaneseRole?: 'atos-inner' | 'atos-outer'; englishRole?: 'atos-en' };
  evidence?: PlatformEvidence;
}

export interface DirectionPlatformSet {
  primary: YamanotePlatformProfile;
  alternatives: YamanotePlatformProfile[];
}

export interface YamanoteStationPlatformSet {
  stationCode: string;
  inner: DirectionPlatformSet;
  outer: DirectionPlatformSet;
}

export type PlatformInfo = {
  /** Quai principal pour ce sens. */
  platform: number;
  /** Quai alternatif (départ / terminus), si distinct. */
  alternativePlatform?: number;
  /** Prochaine gare dans ce sens (romaji, aligné sur STATIONS). */
  nextStation: string;
};

export type StationPlatforms = {
  station: string;
  inner: PlatformInfo;
  outer: PlatformInfo;
};

/** Ordre des gares en 内回り (inner loop), à partir d'Ōsaki. */
export const INNER_LOOP_ORDER = [
  'Osaki',
  'Shinagawa',
  'Takanawa Gateway',
  'Tamachi',
  'Hamamatsucho',
  'Shimbashi',
  'Yurakucho',
  'Tokyo',
  'Kanda',
  'Akihabara',
  'Okachimachi',
  'Ueno',
  'Uguisudani',
  'Nippori',
  'Nishi-Nippori',
  'Tabata',
  'Komagome',
  'Sugamo',
  'Otsuka',
  'Ikebukuro',
  'Mejiro',
  'Takadanobaba',
  'Shin-Okubo',
  'Shinjuku',
  'Yoyogi',
  'Harajuku',
  'Shibuya',
  'Ebisu',
  'Meguro',
  'Gotanda',
] as const;

/** Ordre des gares en 外回り (outer loop), à partir d'Ōsaki. */
export const OUTER_LOOP_ORDER = [
  'Osaki',
  'Gotanda',
  'Meguro',
  'Ebisu',
  'Shibuya',
  'Harajuku',
  'Yoyogi',
  'Shinjuku',
  'Shin-Okubo',
  'Takadanobaba',
  'Mejiro',
  'Ikebukuro',
  'Otsuka',
  'Sugamo',
  'Komagome',
  'Tabata',
  'Nishi-Nippori',
  'Nippori',
  'Uguisudani',
  'Ueno',
  'Okachimachi',
  'Akihabara',
  'Kanda',
  'Tokyo',
  'Yurakucho',
  'Shimbashi',
  'Hamamatsucho',
  'Tamachi',
  'Takanawa Gateway',
  'Shinagawa',
] as const;

/** Quai par code JY (JY01…JY30). */
export const YAMANOTE_PLATFORMS: Record<string, StationPlatforms> = {
  JY01: {
    station: 'Tokyo',
    inner: { platform: 4, nextStation: 'Kanda' },
    outer: { platform: 5, nextStation: 'Yurakucho' },
  },
  JY02: {
    station: 'Kanda',
    inner: { platform: 3, nextStation: 'Akihabara' },
    outer: { platform: 2, nextStation: 'Tokyo' },
  },
  JY03: {
    station: 'Akihabara',
    inner: { platform: 2, nextStation: 'Okachimachi' },
    outer: { platform: 3, nextStation: 'Kanda' },
  },
  JY04: {
    station: 'Okachimachi',
    inner: { platform: 3, nextStation: 'Ueno' },
    outer: { platform: 2, nextStation: 'Akihabara' },
  },
  JY05: {
    station: 'Ueno',
    inner: { platform: 2, nextStation: 'Uguisudani' },
    outer: { platform: 3, nextStation: 'Okachimachi' },
  },
  JY06: {
    station: 'Uguisudani',
    inner: { platform: 2, nextStation: 'Nippori' },
    outer: { platform: 3, nextStation: 'Ueno' },
  },
  JY07: {
    station: 'Nippori',
    inner: { platform: 11, nextStation: 'Nishi-Nippori' },
    outer: { platform: 10, nextStation: 'Uguisudani' },
  },
  JY08: {
    station: 'Nishi-Nippori',
    inner: { platform: 3, nextStation: 'Tabata' },
    outer: { platform: 2, nextStation: 'Nippori' },
  },
  JY09: {
    station: 'Tabata',
    inner: { platform: 2, nextStation: 'Komagome' },
    outer: { platform: 3, nextStation: 'Nishi-Nippori' },
  },
  JY10: {
    station: 'Komagome',
    inner: { platform: 2, nextStation: 'Sugamo' },
    outer: { platform: 1, nextStation: 'Tabata' },
  },
  JY11: {
    station: 'Sugamo',
    inner: { platform: 2, nextStation: 'Otsuka' },
    outer: { platform: 1, nextStation: 'Komagome' },
  },
  JY12: {
    station: 'Otsuka',
    inner: { platform: 1, nextStation: 'Ikebukuro' },
    outer: { platform: 2, nextStation: 'Sugamo' },
  },
  JY13: {
    station: 'Ikebukuro',
    inner: { platform: 6, alternativePlatform: 5, nextStation: 'Mejiro' },
    outer: { platform: 7, alternativePlatform: 8, nextStation: 'Otsuka' },
  },
  JY14: {
    station: 'Mejiro',
    inner: { platform: 1, nextStation: 'Takadanobaba' },
    outer: { platform: 2, nextStation: 'Ikebukuro' },
  },
  JY15: {
    station: 'Takadanobaba',
    inner: { platform: 2, nextStation: 'Shin-Okubo' },
    outer: { platform: 1, nextStation: 'Mejiro' },
  },
  JY16: {
    station: 'Shin-Okubo',
    inner: { platform: 2, nextStation: 'Shinjuku' },
    outer: { platform: 1, nextStation: 'Takadanobaba' },
  },
  JY17: {
    station: 'Shinjuku',
    inner: { platform: 14, nextStation: 'Yoyogi' },
    outer: { platform: 15, nextStation: 'Shin-Okubo' },
  },
  JY18: {
    station: 'Yoyogi',
    inner: { platform: 2, nextStation: 'Harajuku' },
    outer: { platform: 1, nextStation: 'Shinjuku' },
  },
  JY19: {
    station: 'Harajuku',
    inner: { platform: 1, nextStation: 'Shibuya' },
    outer: { platform: 2, nextStation: 'Yoyogi' },
  },
  JY20: {
    station: 'Shibuya',
    inner: { platform: 2, nextStation: 'Ebisu' },
    outer: { platform: 1, nextStation: 'Harajuku' },
  },
  JY21: {
    station: 'Ebisu',
    inner: { platform: 2, nextStation: 'Meguro' },
    outer: { platform: 1, nextStation: 'Shibuya' },
  },
  JY22: {
    station: 'Meguro',
    inner: { platform: 1, nextStation: 'Gotanda' },
    outer: { platform: 2, nextStation: 'Ebisu' },
  },
  JY23: {
    station: 'Gotanda',
    inner: { platform: 1, nextStation: 'Osaki' },
    outer: { platform: 2, nextStation: 'Meguro' },
  },
  JY24: {
    station: 'Osaki',
    inner: { platform: 1, alternativePlatform: 2, nextStation: 'Shinagawa' },
    outer: { platform: 3, alternativePlatform: 4, nextStation: 'Gotanda' },
  },
  JY25: {
    station: 'Shinagawa',
    inner: { platform: 1, nextStation: 'Takanawa Gateway' },
    outer: { platform: 3, nextStation: 'Osaki' },
  },
  JY26: {
    station: 'Takanawa Gateway',
    inner: { platform: 1, nextStation: 'Tamachi' },
    outer: { platform: 2, nextStation: 'Shinagawa' },
  },
  JY27: {
    station: 'Tamachi',
    inner: { platform: 2, nextStation: 'Hamamatsucho' },
    outer: { platform: 3, nextStation: 'Takanawa Gateway' },
  },
  JY28: {
    station: 'Hamamatsucho',
    inner: { platform: 2, nextStation: 'Shimbashi' },
    outer: { platform: 3, nextStation: 'Tamachi' },
  },
  JY29: {
    station: 'Shimbashi',
    inner: { platform: 5, nextStation: 'Yurakucho' },
    outer: { platform: 4, nextStation: 'Hamamatsucho' },
  },
  JY30: {
    station: 'Yurakucho',
    inner: { platform: 2, nextStation: 'Tokyo' },
    outer: { platform: 3, nextStation: 'Shimbashi' },
  },
};

/** Quai pour un code JY et un sens (undefined si code inconnu). */
export function platformFor(jy: string, direction: LoopDirection): PlatformInfo | undefined {
  const legacy = YAMANOTE_PLATFORMS[jy]?.[direction];
  if (!legacy) return undefined;
  const profile = platformProfileFor(jy, direction);
  return {
    platform: profile.platform,
    nextStation: legacy.nextStation,
    ...(legacy.alternativePlatform === undefined
      ? {}
      : { alternativePlatform: legacy.alternativePlatform }),
  };
}

function profileFromLegacy(
  stationCode: string,
  direction: LoopDirection,
  platform: number,
  alternative: boolean,
): YamanotePlatformProfile {
  const legacy = YAMANOTE_PLATFORMS[stationCode]?.[direction];
  if (!legacy) throw new Error(`Unknown Yamanote platform: ${stationCode}/${direction}`);
  const stationIndex = STATIONS.findIndex((station) => station.jy === stationCode);
  if (stationIndex < 0) throw new Error(`Unknown Yamanote station: ${stationCode}`);
  const nextIndex = (stationIndex + (direction === 'inner' ? 1 : -1) + STATIONS.length)
    % STATIONS.length;
  const nextStationCode = STATIONS[nextIndex].jy;
  const installed = layoutFor(stationIndex).psd === 'partial'
    ? platform === legacy.platform
    : hasPlatformDoors(stationIndex);
  return {
    stationCode,
    direction,
    platform,
    nextStationCode,
    doorSide: DOOR_SIDE[stationIndex] === 1 ? 'right' : 'left',
    serviceRoles: alternative
      ? ['alternative', 'originating', 'terminating', 'depot-access']
      : ['through'],
    platformDoors: { installed, ...(installed ? { type: 'half-height' as const } : {}) },
    departureMelody: { compositionId: `${stationCode.toLowerCase()}-${direction}-${platform}` },
    automaticVoice: {
      japaneseRole: direction === 'inner' ? 'atos-inner' : 'atos-outer',
      englishRole: 'atos-en',
    },
    evidence: {
      doorSide: {
        value: DOOR_SIDE[stationIndex] === 1 ? 'right' : 'left',
        confidence: 'unverified',
        sourceNote: 'Valeur héritée du relevé station-only; aucune correction factuelle appliquée.',
      },
      platformDoors: {
        value: installed,
        confidence: 'estimated',
        checkedAt: '2026-07-30',
        sourceNote: 'Fallback conservateur de stationLayouts.psd pendant la migration par quai.',
      },
    },
  };
}

/** Source centrale composée à partir de la matrice historique, sans seconde liste divergente. */
export function platformProfileFor(
  stationCode: string,
  direction: LoopDirection,
  options: { alternative?: boolean; platform?: number } = {},
): YamanotePlatformProfile {
  const legacy = YAMANOTE_PLATFORMS[stationCode]?.[direction];
  if (!legacy) throw new Error(`Unknown Yamanote platform: ${stationCode}/${direction}`);
  const requestedAlternative = options.alternative === true;
  const platform = options.platform
    ?? (requestedAlternative ? legacy.alternativePlatform : undefined)
    ?? legacy.platform;
  const alternative = platform !== legacy.platform;
  if (alternative && platform !== legacy.alternativePlatform) {
    throw new Error(`Unknown platform ${platform} for ${stationCode}/${direction}`);
  }
  return profileFromLegacy(stationCode, direction, platform, alternative);
}

export function stationPlatformSetFor(stationCode: string): YamanoteStationPlatformSet {
  const setFor = (direction: LoopDirection): DirectionPlatformSet => {
    const legacy = YAMANOTE_PLATFORMS[stationCode]?.[direction];
    if (!legacy) throw new Error(`Unknown Yamanote station: ${stationCode}`);
    return {
      primary: platformProfileFor(stationCode, direction),
      alternatives: legacy.alternativePlatform === undefined
        ? []
        : [platformProfileFor(stationCode, direction, { alternative: true })],
    };
  };
  return { stationCode, inner: setFor('inner'), outer: setFor('outer') };
}

export function doorSideNameFor(
  stationCode: string,
  direction: LoopDirection,
  platform?: number,
): DoorSide {
  return platformProfileFor(stationCode, direction, { platform }).doorSide;
}

/** Adaptateur numérique temporaire pour la physique et les annonces existantes. */
export function doorSideFor(
  stationCode: string,
  direction: LoopDirection,
  platform?: number,
): 1 | -1 {
  return doorSideNameFor(stationCode, direction, platform) === 'right' ? 1 : -1;
}

export function hasPlatformDoorsFor(
  stationCode: string,
  direction: LoopDirection,
  platform: number,
): boolean {
  return platformProfileFor(stationCode, direction, { platform }).platformDoors.installed;
}

/**
 * Version simplifiée : numéro de quai principal par gare (inner / outer).
 * Utile pour un affichage rapide ; ignore les quais alternatifs.
 */
export const PLATFORM_NUMBERS: Record<string, { inner: number; outer: number }> = Object.fromEntries(
  Object.entries(YAMANOTE_PLATFORMS).map(([jy, info]) => [
    jy,
    { inner: info.inner.platform, outer: info.outer.platform },
  ]),
);
