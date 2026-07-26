// Valeurs continues mutées chaque frame (jamais dans React) : la boucle 60 fps
// lit et écrit ici, les composants three lisent dans leur useFrame.

import { CONFIG } from '../data/config';
import type { TokyoDate } from '../data/occupancy';

export interface TokyoNow {
  minutes: number;
  year: number;
  month: number;
  day: number;
  weekday: number;
}

// Instant civil + horloge à Tokyo (UTC+9).
export function tokyoNow(): TokyoNow {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    const second = Number(get('second'));
    return {
      minutes: hour * 60 + minute + second / 60,
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      weekday: weekdayMap[get('weekday')] ?? new Date().getUTCDay(),
    };
  } catch {
    const fallback = new Date();
    return {
      minutes: CONFIG.clockStart,
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
      weekday: fallback.getDay(),
    };
  }
}

// Heure réelle à Tokyo (UTC+9), en minutes depuis minuit.
export function tokyoMinutesNow(): number {
  return tokyoNow().minutes;
}

function defaultTokyoDate(): TokyoDate {
  const n = tokyoNow();
  return { year: n.year, month: n.month, day: n.day, weekday: n.weekday };
}

export const runtime = {
  speed: 0, // m/s
  accel: 0, // m/s²
  distance: 0, // m parcourus depuis le début
  phaseT: 0, // temps écoulé dans la phase courante (s)
  doorOpen: 0, // 0 fermé → 1 ouvert (porte de référence de la rame)
  doorTarget: 0,
  doorT: 999, // temps écoulé depuis le changement de cible (s)
  psdOpen: 0, // portes palières du quai, décalées sur la rame
  psdTarget: 0,
  psdT: 999,
  clockMin: CONFIG.clockStart, // horloge du monde, en minutes (flottant)
  tokyoDate: defaultTokyoDate() as TokyoDate,
  swayTime: 0,
  sway: 0, // balancement latéral normalisé (-1..1)
  platformFade: 0, // présence du quai 0..1 (visibilité / approche, plus d'opacité)
  platformSlide: 0, // décalage Z du quai (m) : négatif à l'approche, positif au départ
  playerX: 0, // position du joueur (pour les regards des PNJ)
  playerY: 1.55,
  playerZ: 4.2,
  // Blocages de départ : la mélodie s'arrête, le train reste à quai portes ouvertes.
  departureBlockers: {
    doorBlocked: false,
    heldAtStation: false,
    signalStop: false,
    emergency: false,
  },
  /** Train hors service (ne joue pas la 発車メロディ Inner Main). */
  outOfService: false,
  /** Arrêt terminus / quai alternatif (ex. Ōsaki 2) — autre mélodie ou silence. */
  terminusStop: false,
  /**
   * Utiliser le quai alternatif de la gare (ex. Ōsaki Inner voie 2, Outer voie 4).
   * Indépendant de terminusStop : un départ voyageurs peut partir de la voie secondaire.
   */
  useAlternativePlatform: false,
  /**
   * Si true, startDepartureSequence enchaîne aussi annonce + fermetures.
   * En usage normal (stationCycle), reste false : les timers gèrent la suite.
   */
  autonomousDepartureSequence: false,
  /** Identifiant stable de la rame (pour departureId anti double-lecture). */
  trainId: 'yamanote-e235-1',
  /** Compteur d'arrêts depuis le début de la session (incrémenté à chaque dwell). */
  stopSequence: 0,
  /** Dernier departureId pour lequel une 発車メロディ a été lancée. */
  lastMelodyDepartureId: null as string | null,
};

/** Avance l'horloge ; si on passe minuit, incrémente la date Tokyo d'un jour. */
export function advanceClock(dtSeconds: number): void {
  runtime.clockMin += dtSeconds / 60;
  while (runtime.clockMin >= 24 * 60) {
    runtime.clockMin -= 24 * 60;
    const d = runtime.tokyoDate;
    const utc = Date.UTC(d.year, d.month - 1, d.day + 1);
    const next = new Date(utc);
    runtime.tokyoDate = {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      weekday: next.getUTCDay(),
    };
  }
}

export function resetRuntime(): void {
  runtime.speed = 0;
  runtime.accel = 0;
  runtime.distance = 0;
  runtime.phaseT = 0;
  runtime.doorOpen = 0;
  runtime.doorTarget = 0;
  runtime.doorT = 999;
  runtime.psdOpen = 0;
  runtime.psdTarget = 0;
  runtime.psdT = 999;
  runtime.clockMin = CONFIG.clockStart;
  runtime.tokyoDate = defaultTokyoDate();
  runtime.swayTime = 0;
  runtime.sway = 0;
  runtime.platformFade = 0;
  runtime.platformSlide = 0;
  runtime.departureBlockers.doorBlocked = false;
  runtime.departureBlockers.heldAtStation = false;
  runtime.departureBlockers.signalStop = false;
  runtime.departureBlockers.emergency = false;
  runtime.outOfService = false;
  runtime.terminusStop = false;
  runtime.useAlternativePlatform = false;
  runtime.autonomousDepartureSequence = false;
  runtime.trainId = 'yamanote-e235-1';
  runtime.stopSequence = 0;
  runtime.lastMelodyDepartureId = null;
}
