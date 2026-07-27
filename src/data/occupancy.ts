// Modèle d'estimation du taux de remplissage Yamanote (tronçon × heure ×
// jour × mois). Calibré sur les taux officiels MLIT / JR East 2024 et les
// profils temporels décrits dans la doc produit — pas une mesure temps réel.

export type DayPeriod = 'morningPeak' | 'day' | 'eveningPeak' | 'night';

export type OccupancyBand =
  | 'empty'
  | 'light'
  | 'moderate'
  | 'busy'
  | 'crowded'
  | 'packed'
  | 'crushed';

/** Date civile Tokyo (weekday : 0 = dimanche … 6 = samedi, comme Date#getDay). */
export interface TokyoDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  weekday: number; // 0–6
}

// ---------------------------------------------------------------------------
// Baselines ~08:15, jour ouvrable normal (mardi/mercredi).
// Index i = tronçon STATIONS[i] → STATIONS[(i+1)%30].
// ---------------------------------------------------------------------------

/** Sens simulé (外回り, ordre JY croissant) — pic Shin-Ōkubo→Shinjuku 139 %. */
export const OUTER_BASE_0815: readonly number[] = [
  /* 00 Tokyo→Kanda                 */ 96,
  /* 01 Kanda→Akihabara             */ 99,
  /* 02 Akihabara→Okachimachi       */ 104,
  /* 03 Okachimachi→Ueno            */ 106,
  /* 04 Ueno→Uguisudani             */ 96,
  /* 05 Uguisudani→Nippori          */ 101,
  /* 06 Nippori→Nishi-Nippori       */ 107,
  /* 07 Nishi-Nippori→Tabata        */ 111,
  /* 08 Tabata→Komagome             */ 113,
  /* 09 Komagome→Sugamo             */ 116,
  /* 10 Sugamo→Ōtsuka               */ 119,
  /* 11 Ōtsuka→Ikebukuro            */ 124,
  /* 12 Ikebukuro→Mejiro            */ 116,
  /* 13 Mejiro→Takadanobaba         */ 123,
  /* 14 Takadanobaba→Shin-Ōkubo     */ 133,
  /* 15 Shin-Ōkubo→Shinjuku         */ 139,
  /* 16 Shinjuku→Yoyogi             */ 104,
  /* 17 Yoyogi→Harajuku             */ 101,
  /* 18 Harajuku→Shibuya            */ 108,
  /* 19 Shibuya→Ebisu               */ 93,
  /* 20 Ebisu→Meguro                */ 91,
  /* 21 Meguro→Gotanda              */ 88,
  /* 22 Gotanda→Ōsaki               */ 82,
  /* 23 Ōsaki→Shinagawa             */ 92,
  /* 24 Shinagawa→Takanawa Gateway  */ 105,
  /* 25 Takanawa Gateway→Tamachi    */ 108,
  /* 26 Tamachi→Hamamatsuchō        */ 113,
  /* 27 Hamamatsuchō→Shimbashi      */ 119,
  /* 28 Shimbashi→Yūrakuchō         */ 114,
  /* 29 Yūrakuchō→Tokyo             */ 109,
];

/**
 * Sens inverse (内回り) — réserve. Index = gare de départ dans ce sens
 * (JY décroissant) : INNER_BASE_0815[i] = taux i → (i-1+30)%30.
 * Pic officiel Ueno→Okachimachi = index 4.
 */
export const INNER_BASE_0815: readonly number[] = [
  /* 00 Tokyo→Yūrakuchō             */ 111,
  /* 01 Kanda→Tokyo                 */ 125,
  /* 02 Akihabara→Kanda             */ 120,
  /* 03 Okachimachi→Akihabara       */ 128,
  /* 04 Ueno→Okachimachi            */ 134,
  /* 05 Uguisudani→Ueno             */ 133,
  /* 06 Nippori→Uguisudani          */ 131,
  /* 07 Nishi-Nippori→Nippori       */ 128,
  /* 08 Tabata→Nishi-Nippori        */ 124,
  /* 09 Komagome→Tabata             */ 121,
  /* 10 Sugamo→Komagome             */ 117,
  /* 11 Ōtsuka→Sugamo               */ 112,
  /* 12 Ikebukuro→Ōtsuka            */ 107,
  /* 13 Mejiro→Ikebukuro            */ 118,
  /* 14 Takadanobaba→Mejiro         */ 109,
  /* 15 Shin-Ōkubo→Takadanobaba     */ 99,
  /* 16 Shinjuku→Shin-Ōkubo         */ 92,
  /* 17 Yoyogi→Shinjuku             */ 106,
  /* 18 Harajuku→Yoyogi             */ 98,
  /* 19 Shibuya→Harajuku            */ 102,
  /* 20 Ebisu→Shibuya               */ 108,
  /* 21 Meguro→Ebisu                */ 97,
  /* 22 Gotanda→Meguro              */ 90,
  /* 23 Ōsaki→Gotanda               */ 82,
  /* 24 Shinagawa→Ōsaki             */ 79,
  /* 25 Takanawa Gateway→Shinagawa  */ 91,
  /* 26 Tamachi→Takanawa Gateway    */ 86,
  /* 27 Hamamatsuchō→Tamachi        */ 91,
  /* 28 Shimbashi→Hamamatsuchō      */ 98,
  /* 29 Yūrakuchō→Shimbashi         */ 106,
];

// ---------------------------------------------------------------------------
// Courbe horaire : multiplicateur relatif à la base 08:15 (cœur de pointe = 1).
// Points = milieu des plages de la section 5, normalisés sur ~125 %.
// ---------------------------------------------------------------------------

/** [minutes depuis minuit, facteur] — boucle sur 24 h. */
export const HOUR_CURVE: readonly (readonly [number, number])[] = [
  [0, 0.5],
  [30, 0.4],
  [150, 0.14], // 2:30 — hors service typique / très faible
  [270, 0.14], // 4:30
  [330, 0.28], // 5:30
  [390, 0.44], // 6:30
  [420, 0.56], // 7:00
  [450, 0.68], // 7:30
  [480, 0.88], // 8:00
  [495, 1.0], // 8:15
  [510, 1.0], // 8:30
  [540, 0.92], // 9:00
  [570, 0.76], // 9:30
  [630, 0.58], // 10:30
  [720, 0.46], // 12:00
  [780, 0.5], // 13:00
  [840, 0.5], // 14:00
  [960, 0.5], // 16:00
  [990, 0.58], // 16:30
  [1020, 0.72], // 17:00
  [1080, 0.86], // 18:00
  [1110, 0.9], // 18:30
  [1170, 0.72], // 19:30
  [1260, 0.64], // 21:00
  [1350, 0.7], // 22:30
  [1410, 0.58], // 23:30
  [1440, 0.5], // minuit
];

// ---------------------------------------------------------------------------
// Coefficients jour (réf. mardi/mercredi ouvrable) — section 8.
// Index weekday 0=dim … 6=sam ; 7 = jour férié.
// ---------------------------------------------------------------------------

export interface DayCoeffs {
  morningPeak: number;
  day: number;
  eveningPeak: number;
  night: number;
}

export const DAY_COEFFS: readonly DayCoeffs[] = [
  /* dimanche */ { morningPeak: 0.36, day: 0.91, eveningPeak: 0.85, night: 0.74 },
  /* lundi    */ { morningPeak: 0.94, day: 0.94, eveningPeak: 0.93, night: 0.88 },
  /* mardi    */ { morningPeak: 1.0, day: 0.96, eveningPeak: 0.97, night: 0.92 },
  /* mercredi */ { morningPeak: 0.99, day: 0.97, eveningPeak: 0.98, night: 0.94 },
  /* jeudi    */ { morningPeak: 1.01, day: 0.99, eveningPeak: 1.0, night: 0.99 },
  /* vendredi */ { morningPeak: 0.98, day: 1.01, eveningPeak: 1.07, night: 1.12 },
  /* samedi   */ { morningPeak: 0.44, day: 1.05, eveningPeak: 0.99, night: 1.08 },
];

export const HOLIDAY_DAY_COEFFS: DayCoeffs = {
  morningPeak: 0.33,
  day: 0.9,
  eveningPeak: 0.83,
  night: 0.72,
};

// ---------------------------------------------------------------------------
// Coefficients mois — section 11. Index 0 = janvier.
// ---------------------------------------------------------------------------

export interface MonthCoeffs {
  peak: number;
  weekdayDay: number;
  weekendDay: number;
}

export const MONTH_COEFFS: readonly MonthCoeffs[] = [
  /* jan */ { peak: 0.91, weekdayDay: 0.94, weekendDay: 0.96 },
  /* fév */ { peak: 0.98, weekdayDay: 0.94, weekendDay: 0.93 },
  /* mar */ { peak: 0.97, weekdayDay: 1.04, weekendDay: 1.08 },
  /* avr */ { peak: 1.03, weekdayDay: 1.06, weekendDay: 1.1 },
  /* mai */ { peak: 0.96, weekdayDay: 1.02, weekendDay: 1.08 },
  /* jun */ { peak: 1.0, weekdayDay: 0.96, weekendDay: 0.94 },
  /* jul */ { peak: 0.98, weekdayDay: 1.02, weekendDay: 1.07 },
  /* aoû */ { peak: 0.87, weekdayDay: 0.98, weekendDay: 1.08 },
  /* sep */ { peak: 1.01, weekdayDay: 0.99, weekendDay: 1.01 },
  /* oct */ { peak: 1.03, weekdayDay: 1.05, weekendDay: 1.09 },
  /* nov */ { peak: 1.0, weekdayDay: 1.03, weekendDay: 1.07 },
  /* déc */ { peak: 0.97, weekdayDay: 1.06, weekendDay: 1.11 },
];

// ---------------------------------------------------------------------------
// Matrice mois × jour pour la pointe du matin — section 14.
// [month 0–11][weekday 0–6], dimanche partagé avec férié.
// ---------------------------------------------------------------------------

export const MORNING_MATRIX: readonly (readonly number[])[] = [
  /* jan */ [0.33, 0.86, 0.91, 0.9, 0.92, 0.89, 0.4],
  /* fév */ [0.35, 0.92, 0.98, 0.97, 0.99, 0.96, 0.43],
  /* mar */ [0.35, 0.91, 0.97, 0.96, 0.98, 0.95, 0.43],
  /* avr */ [0.37, 0.97, 1.03, 1.02, 1.04, 1.01, 0.45],
  /* mai */ [0.35, 0.9, 0.96, 0.95, 0.97, 0.94, 0.42],
  /* jun */ [0.36, 0.94, 1.0, 0.99, 1.01, 0.98, 0.44],
  /* jul */ [0.35, 0.92, 0.98, 0.97, 0.99, 0.96, 0.43],
  /* aoû */ [0.31, 0.82, 0.87, 0.86, 0.88, 0.85, 0.38],
  /* sep */ [0.36, 0.95, 1.01, 1.0, 1.02, 0.99, 0.44],
  /* oct */ [0.37, 0.97, 1.03, 1.02, 1.04, 1.01, 0.45],
  /* nov */ [0.36, 0.94, 1.0, 0.99, 1.01, 0.98, 0.44],
  /* déc */ [0.35, 0.91, 0.97, 0.96, 0.98, 0.95, 0.43],
];

/** Férié en pointe du matin : colonne « dimanche ou férié » de la matrice. */
export function morningMatrixFactor(month: number, weekday: number, holiday: boolean): number {
  const row = MORNING_MATRIX[((month - 1) % 12 + 12) % 12];
  if (holiday || weekday === 0) return row[0];
  return row[weekday];
}

// ---------------------------------------------------------------------------
// Jours fériés japonais 2025–2027 (dates observées, y compris reports).
// ---------------------------------------------------------------------------

const HOLIDAYS = new Set<string>([
  // 2025
  '2025-01-01',
  '2025-01-13',
  '2025-02-11',
  '2025-02-23',
  '2025-02-24',
  '2025-03-20',
  '2025-04-29',
  '2025-05-03',
  '2025-05-04',
  '2025-05-05',
  '2025-05-06',
  '2025-07-21',
  '2025-08-11',
  '2025-09-15',
  '2025-09-23',
  '2025-10-13',
  '2025-11-03',
  '2025-11-24',
  // 2026
  '2026-01-01',
  '2026-01-12',
  '2026-02-11',
  '2026-02-23',
  '2026-03-20',
  '2026-04-29',
  '2026-05-03',
  '2026-05-04',
  '2026-05-05',
  '2026-05-06',
  '2026-07-20',
  '2026-08-11',
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-10-12',
  '2026-11-03',
  '2026-11-23',
  // 2027
  '2027-01-01',
  '2027-01-11',
  '2027-02-11',
  '2027-02-23',
  '2027-03-22',
  '2027-04-29',
  '2027-05-03',
  '2027-05-04',
  '2027-05-05',
  '2027-07-19',
  '2027-08-11',
  '2027-09-20',
  '2027-09-23',
  '2027-10-11',
  '2027-11-03',
  '2027-11-23',
]);

export function isJapaneseHoliday(date: TokyoDate): boolean {
  const key = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  return HOLIDAYS.has(key);
}

export function isGoldenWeek(date: TokyoDate): boolean {
  // Fenêtre typique fin avril – 5/6 mai.
  if (date.month === 4 && date.day >= 29) return true;
  if (date.month === 5 && date.day <= 6) return true;
  return false;
}

export function isObon(date: TokyoDate): boolean {
  return date.month === 8 && date.day >= 13 && date.day <= 16;
}

export function isNewYearPeriod(date: TokyoDate): 0 | 1 | 2 {
  if (date.month === 1 && date.day >= 1 && date.day <= 3) return 1; // très calme
  if (date.month === 1 && date.day >= 4 && date.day <= 7) return 2; // reprise
  return 0;
}

export function isLateDecember(date: TokyoDate): boolean {
  return date.month === 12 && date.day >= 26;
}

/** Zone Shibuya–Harajuku–Shinjuku (indices de gare de départ du tronçon). */
export function isHalloweenZone(fromIndex: number): boolean {
  // Shinjuku→Yoyogi(16), Yoyogi→Harajuku(17), Harajuku→Shibuya(18),
  // Shibuya→Ebisu(19), et sens amont proche : Mejiro… déjà couvert par 16–19.
  return fromIndex >= 16 && fromIndex <= 19;
}

export function dayPeriod(minutes: number): DayPeriod {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  if (m >= 6 * 60 && m < 9.5 * 60) return 'morningPeak';
  if (m >= 16.5 * 60 && m < 19.5 * 60) return 'eveningPeak';
  if (m >= 21 * 60 || m < 5 * 60) return 'night';
  return 'day';
}

export function occupancyBand(percent: number): OccupancyBand {
  if (percent < 40) return 'empty';
  if (percent < 55) return 'light';
  if (percent < 80) return 'moderate';
  if (percent < 105) return 'busy';
  if (percent < 125) return 'crowded';
  if (percent < 150) return 'packed';
  return 'crushed';
}

// Les libellés de palier sont traduits côté interface (src/i18n/strings.ts) ;
// ce module ne produit que la bande et sa couleur.
export const BAND_COLOR: Record<OccupancyBand, string> = {
  empty: '#5a9e6f',
  light: '#7bb05a',
  moderate: '#c4a035',
  busy: '#d4893a',
  crowded: '#c45a3a',
  packed: '#b03333',
  crushed: '#8a1f2a',
};

/** Cibles PNJ (voiture unique) selon le % — représentation, pas 1:1 physique. */
export interface PaxTargets {
  seated: number;
  standing: number;
}

const PAX_CURVE: readonly { pct: number; seated: number; standing: number }[] = [
  { pct: 25, seated: 8, standing: 0 },
  { pct: 50, seated: 18, standing: 2 },
  { pct: 80, seated: 32, standing: 6 },
  { pct: 100, seated: 42, standing: 12 },
  { pct: 120, seated: 48, standing: 18 },
  { pct: 140, seated: 51, standing: 28 },
];

export function targetPaxCounts(percent: number): PaxTargets {
  const p = Math.max(8, Math.min(180, percent));
  if (p <= PAX_CURVE[0].pct) {
    const t = p / PAX_CURVE[0].pct;
    return {
      seated: Math.round(PAX_CURVE[0].seated * t),
      standing: Math.round(PAX_CURVE[0].standing * t),
    };
  }
  for (let i = 1; i < PAX_CURVE.length; i++) {
    const a = PAX_CURVE[i - 1];
    const b = PAX_CURVE[i];
    if (p <= b.pct) {
      const t = (p - a.pct) / (b.pct - a.pct);
      return {
        seated: Math.round(a.seated + (b.seated - a.seated) * t),
        standing: Math.round(a.standing + (b.standing - a.standing) * t),
      };
    }
  }
  const last = PAX_CURVE[PAX_CURVE.length - 1];
  return { seated: last.seated, standing: Math.min(30, last.standing + Math.round((p - 140) / 10)) };
}
