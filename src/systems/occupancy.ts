// Moteur d'estimation du taux de remplissage : combine baselines de tronçon,
// courbe horaire, coefficients jour/mois, matrice pointe du matin et
// overrides calendaires (Nouvel An, Golden Week, Obon, Halloween, fin décembre).

import {
  BAND_LABEL_FR,
  DAY_COEFFS,
  HOLIDAY_DAY_COEFFS,
  HOUR_CURVE,
  MONTH_COEFFS,
  OUTER_BASE_0815,
  dayPeriod,
  isGoldenWeek,
  isHalloweenZone,
  isJapaneseHoliday,
  isLateDecember,
  isNewYearPeriod,
  isObon,
  morningMatrixFactor,
  occupancyBand,
  type OccupancyBand,
  type TokyoDate,
} from '../data/occupancy';
import { segmentAt } from '../data/segments';
import { useStore, type Phase } from '../store';
import { runtime } from './runtime';

export interface OccupancyEstimate {
  percent: number;
  label: string;
  band: OccupancyBand;
  fromIndex: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hourFactor(minutes: number): number {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const curve = HOUR_CURVE;
  for (let i = 1; i < curve.length; i++) {
    const [t0, v0] = curve[i - 1];
    const [t1, v1] = curve[i];
    if (m <= t1) {
      const span = t1 - t0 || 1;
      return lerp(v0, v1, (m - t0) / span);
    }
  }
  return curve[curve.length - 1][1];
}

function dayCoeffsFor(date: TokyoDate, holiday: boolean) {
  if (holiday) return HOLIDAY_DAY_COEFFS;
  return DAY_COEFFS[date.weekday];
}

function isTouristHolidayWindow(date: TokyoDate, holiday: boolean): boolean {
  if (!isGoldenWeek(date)) return false;
  return holiday || date.weekday === 0 || date.weekday === 6 || (date.month === 5 && date.day <= 6);
}

function newYearAbsolute(fromIndex: number, minutes: number): number {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  let lo = 25;
  let hi = 50;
  if (m < 8 * 60) {
    lo = 15;
    hi = 35;
  } else if (m < 11 * 60) {
    lo = 25;
    hi = 50;
  } else if (m < 17 * 60) {
    lo = 45;
    hi = 80;
  } else if (m < 21 * 60) {
    lo = 40;
    hi = 70;
  } else {
    lo = 25;
    hi = 55;
  }
  const boost = fromIndex === 18 || fromIndex === 19 ? 1.25 : 1;
  return ((lo + hi) / 2) * boost;
}

function goldenWeekAbsolute(minutes: number): number {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  if (m < 9 * 60) return 40;
  if (m < 11 * 60) return 77;
  if (m < 17 * 60) return 105;
  if (m < 20 * 60) return 92;
  return 77;
}

function obonAbsolute(minutes: number): number {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  if (m < 7 * 60) return 30;
  if (m < 9.5 * 60) return 72;
  if (m < 16 * 60) return 75;
  if (m < 20 * 60) return 80;
  return 70;
}

function lateDecemberMorningFactor(date: TokyoDate): number {
  const day = date.day;
  if (day <= 27) return 0.9;
  if (day === 28) return 0.77;
  if (day === 29) return 0.55;
  if (day === 30) return 0.4;
  return 0.3;
}

function halloweenBoost(fromIndex: number, minutes: number, date: TokyoDate): number {
  if (date.month !== 10 || date.day !== 31) return 1;
  if (!isHalloweenZone(fromIndex)) return 1;
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  if (m >= 18 * 60 && m < 21 * 60) return 1.35;
  if (m >= 21 * 60 && m < 23 * 60) return 1.45;
  if (m >= 23 * 60) return 1.3;
  if (m >= 16 * 60) return 1.15;
  return 1;
}

function baseEstimate(fromIndex: number, minutes: number, date: TokyoDate, holiday: boolean): number {
  const baseline = OUTER_BASE_0815[fromIndex];
  const hf = hourFactor(minutes);
  const period = dayPeriod(minutes);
  const dc = dayCoeffsFor(date, holiday);
  const mc = MONTH_COEFFS[(date.month - 1 + 12) % 12];
  const weekend = holiday || date.weekday === 0 || date.weekday === 6;

  if (period === 'morningPeak') {
    const matrix = morningMatrixFactor(date.month, date.weekday, holiday);
    return baseline * matrix * hf;
  }

  const day =
    period === 'eveningPeak' ? dc.eveningPeak : period === 'night' ? dc.night : dc.day;
  const month =
    period === 'eveningPeak' || period === 'night'
      ? lerp(mc.weekdayDay, mc.peak, period === 'eveningPeak' ? 0.5 : 0.25)
      : weekend
        ? mc.weekendDay
        : mc.weekdayDay;

  return baseline * hf * day * month;
}

export function estimateOccupancy(args: {
  fromIndex: number;
  minutes: number;
  date: TokyoDate;
}): OccupancyEstimate {
  const fromIndex = ((args.fromIndex % 30) + 30) % 30;
  const { minutes, date } = args;
  const holiday = isJapaneseHoliday(date);

  let percent: number;

  if (isNewYearPeriod(date) === 1) {
    percent = newYearAbsolute(fromIndex, minutes);
  } else if (isTouristHolidayWindow(date, holiday)) {
    percent = goldenWeekAbsolute(minutes);
  } else if (isObon(date)) {
    percent = obonAbsolute(minutes);
  } else {
    percent = baseEstimate(fromIndex, minutes, date, holiday);

    if (isNewYearPeriod(date) === 2) {
      const period = dayPeriod(minutes);
      percent *= period === 'morningPeak' ? 0.8 : period === 'eveningPeak' ? 0.85 : 0.92;
    }

    if (isLateDecember(date) && dayPeriod(minutes) === 'morningPeak') {
      percent *= lateDecemberMorningFactor(date);
    }
  }

  percent *= halloweenBoost(fromIndex, minutes, date);

  if (date.weekday === 5 && !holiday) {
    const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    if (m >= 22 * 60 && isHalloweenZone(fromIndex)) percent *= 1.08;
  }

  percent = Math.round(Math.max(8, Math.min(180, percent)));
  const band = occupancyBand(percent);
  return {
    percent,
    label: BAND_LABEL_FR[band],
    band,
    fromIndex,
  };
}

/** Index du tronçon courant selon la phase (gare de départ). */
export function currentFromIndex(index: number, phase: Phase): number {
  // cruise/brake : on roule vers `index` sur segmentAt(index).
  // dwell : à quai à `index`, peuplement pour le prochain départ = tronçon `index`.
  // depart : index déjà avancé vers la destination → segmentAt(index).
  if (phase === 'dwell') return index;
  return segmentAt(index);
}

export function currentSegmentOccupancy(): OccupancyEstimate {
  const { index, phase } = useStore.getState();
  const fromIndex = currentFromIndex(index, phase);
  return estimateOccupancy({
    fromIndex,
    minutes: runtime.clockMin,
    date: runtime.tokyoDate,
  });
}
