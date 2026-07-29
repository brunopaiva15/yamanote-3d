// Le temps qu'il fait, dérivé de la saison et de la date.
//
// --- Pourquoi ce n'est pas un tirage par image ---
//
// Une météo tirée au hasard à chaque instant n'est pas de la météo : c'est du
// bruit. Le temps a une DURÉE — une averse tient vingt minutes, un ciel couvert
// tient l'après-midi, le tsuyu tient six semaines. Le modèle engendre donc la
// journée ENTIÈRE d'un coup, sous forme d'une suite d'épisodes datés, à partir
// d'une graine tirée de la date civile. Deux conséquences, et les deux comptent :
//
//   · le temps est le même pour tout le monde un jour donné. Le 21 juin il
//     pleuvait ; on peut y revenir, et il y pleuvra encore ;
//   · monter à bord à 8 h ou à 18 h ne rejoue pas le même dé : on tombe à
//     l'endroit qu'on occupe dans la journée, avec ce qui l'a précédé (le sol
//     est encore mouillé de l'averse de midi).
//
// --- La climatologie de Tokyo, et non « la pluie en général » ---
//
// Ce que le modèle cherche à rendre, dans l'ordre d'importance :
//
//   · le 梅雨, du 7 juin au 20 juillet : six semaines de gris et de bruine,
//     c'est LE fait météorologique de l'année à Tokyo ;
//   · le 夕立, l'averse d'orage de fin d'après-midi en plein été, qui tombe
//     d'un ciel qui était bleu une heure plus tôt ;
//   · l'hiver sec et lumineux — contre-intuitif pour qui imagine le Japon
//     pluvieux : janvier est le mois le plus ensoleillé de l'année ;
//   · la neige, RARE. Tokyo compte quelques jours de neige par an. Elle est
//     donc décidée au niveau de la JOURNÉE, pas de l'épisode : la plupart des
//     hivers n'en verront pas, et celui qui en voit s'en souviendra.

import { runtime } from './runtime';
import { seasonNow, type SeasonState } from './season';

export type WeatherKind =
  | 'clear' // ciel bleu
  | 'fair' // beau, quelques nuages
  | 'overcast' // couvert
  | 'drizzle' // bruine — le fond de sauce du tsuyu
  | 'rain' // pluie franche
  | 'downpour' // averse
  | 'thunder' // 夕立 : orage d'été
  | 'sleet' // neige fondue
  | 'snow'; // neige

/**
 * État courant, muté chaque image (idiome runtime.ts). Aucun état React : la
 * météo change trop lentement pour qu'on la re-rende, et trop souvent pour
 * qu'on la fige.
 */
export const weather = {
  kind: 'fair' as WeatherKind,
  /** Couverture nuageuse 0..1 : assombrit et adoucit toute la scène. */
  cloud: 0,
  /** Intensité de la pluie 0..1. */
  rain: 0,
  /** Intensité de la neige 0..1. */
  snow: 0,
  /** Surfaces mouillées 0..1 : monte vite sous l'averse, sèche lentement. */
  wet: 0,
  /** Neige au sol 0..1 : s'accumule sous zéro, fond au-dessus. */
  snowCover: 0,
  /** Vent 0..1 : incline la précipitation et fait bouger les frondaisons. */
  wind: 0.25,
  /** Éclair 0..1, décroissance très rapide. */
  flash: 0,
  /**
   * Portée du regard, en multiplicateur de la brume de scène. Une averse
   * ramène l'horizon à cent mètres ; c'est le premier effet de la pluie, bien
   * avant les gouttes elles-mêmes.
   */
  visibility: 1,
  /** Température à Tokyo (°C) : c'est elle qui arbitre pluie ou neige. */
  tempC: 15,
  /** Temps écoulé depuis le dernier coup de tonnerre déclenché (s). */
  thunderT: 999,
  /**
   * Distance du dernier éclair (0 = sur nous, 1 = à l'horizon). Elle règle le
   * retard du tonnerre et son timbre : un coup lointain roule, un coup proche
   * claque.
   */
  thunderFar: 0.5,
};

// --- Aléa semé par la date ---------------------------------------------------

function hashInt(a: number): number {
  let h = a | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function stream(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return hashInt(s);
  };
}

// --- Ce que vaut chaque temps -------------------------------------------------

interface Traits {
  cloud: number;
  rain: number;
  snow: number;
  /** Durée typique d'un épisode (minutes) : une averse ne dure pas un après-midi. */
  minutes: [number, number];
}

const TRAITS: Record<WeatherKind, Traits> = {
  clear: { cloud: 0.05, rain: 0, snow: 0, minutes: [70, 240] },
  fair: { cloud: 0.3, rain: 0, snow: 0, minutes: [60, 200] },
  overcast: { cloud: 0.85, rain: 0, snow: 0, minutes: [70, 260] },
  drizzle: { cloud: 0.9, rain: 0.22, snow: 0, minutes: [40, 150] },
  rain: { cloud: 0.95, rain: 0.6, snow: 0, minutes: [40, 130] },
  downpour: { cloud: 1, rain: 1, snow: 0, minutes: [12, 40] },
  thunder: { cloud: 1, rain: 0.9, snow: 0, minutes: [15, 45] },
  sleet: { cloud: 0.95, rain: 0.45, snow: 0.4, minutes: [30, 90] },
  snow: { cloud: 0.95, rain: 0, snow: 0.75, minutes: [40, 160] },
};

// --- Engendrement d'une journée ------------------------------------------------

interface Episode {
  /** Minute de début dans la journée. */
  start: number;
  kind: WeatherKind;
  /** Vent de l'épisode (0..1). */
  wind: number;
}

interface WeatherDay {
  episodes: Episode[];
  /** Jour de neige : tiré au niveau de la journée, parce que c'est rare. */
  snowy: boolean;
}

/** Température moyenne à Tokyo, par quantième, et sa marche diurne. */
const TEMP_MEAN = 15.9;
const TEMP_AMP = 10.8;
const TEMP_PEAK_DOY = 217; // début août
const TEMP_DIURNAL = 4.6;

function dailyMeanTemp(doy: number): number {
  return TEMP_MEAN + TEMP_AMP * Math.cos((2 * Math.PI * (doy - TEMP_PEAK_DOY)) / 365);
}

/**
 * Marche diurne, -1 au petit matin à +1 en milieu d'après-midi.
 *
 * Ce n'est pas un cosinus : la journée ne se refroidit pas aussi vite qu'elle
 * se réchauffe. Le minimum tombe à 4 h, le maximum à 14 h, et la retombée
 * s'étale sur les quatorze heures qui restent.
 */
function diurnal(hour: number): number {
  const x = (((hour - 4) % 24) + 24) % 24;
  const u = x <= 10 ? x / 20 : 0.5 + (x - 10) / 28;
  return -Math.cos(2 * Math.PI * u);
}

/**
 * Tirage d'un temps, à une heure donnée d'une saison donnée.
 *
 * Chaque poids est une propension, jamais un interrupteur : il pleut en
 * janvier et il fait beau pendant le tsuyu — simplement pas souvent.
 */
function drawKind(r: () => number, se: SeasonState, minute: number, snowy: boolean): WeatherKind {
  const hour = minute / 60;
  // 夕立 : l'orage d'été est un phénomène de FIN D'APRÈS-MIDI. Le sol chauffe
  // toute la journée, la convection déclenche vers 15 h et s'éteint à la nuit.
  const afternoon = Math.max(0, Math.min(1, (hour - 13.5) / 2)) * Math.max(0, Math.min(1, (20.5 - hour) / 2));
  const w: [WeatherKind, number][] = [
    ['clear', 4.5 + 5.5 * se.cold + 2.5 * se.w.autumn - 3.4 * se.tsuyu],
    ['fair', 4 + 1.5 * se.w.spring - 1.6 * se.tsuyu],
    ['overcast', 1.8 + 5.5 * se.tsuyu + 1.2 * se.heat],
    ['drizzle', 0.5 + 4 * se.tsuyu + 0.6 * se.w.spring],
    ['rain', 0.7 + 3.2 * se.tsuyu + 0.9 * se.w.autumn + 0.6 * se.w.spring],
    ['downpour', 0.2 + 1 * se.tsuyu + 1.6 * se.heat * afternoon],
    ['thunder', 2.6 * se.heat * afternoon + 0.5 * se.tsuyu * afternoon],
    // La neige n'est pas ouverte tous les jours : la journée l'a décidé.
    ['sleet', snowy ? 1.4 : 0],
    ['snow', snowy ? 3.2 : 0],
  ];
  let total = 0;
  for (const [, weight] of w) total += Math.max(0, weight);
  let x = r() * total;
  for (const [kind, weight] of w) {
    x -= Math.max(0, weight);
    if (x <= 0) return kind;
  }
  return 'fair';
}

function buildDay(year: number, month: number, day: number, se: SeasonState): WeatherDay {
  const r = stream(year * 10000 + month * 100 + day + 0x5eed);
  // Jour de neige : Tokyo en compte quelques-uns par an. La porte ne s'ouvre
  // que si la journée est vraiment froide — sa moyenne, pas sa nuit.
  const mean = dailyMeanTemp(se.doy);
  const snowChance = Math.max(0, Math.min(0.34, (6.5 - mean) * 0.055)) * se.cold;
  const snowy = r() < snowChance;

  const episodes: Episode[] = [];
  let m = 0;
  while (m < 1440) {
    const kind = drawKind(r, se, m, snowy);
    const [lo, hi] = TRAITS[kind].minutes;
    // Le vent appartient à l'épisode : une averse arrive avec sa rafale, un
    // ciel bleu de janvier arrive avec sa bise sèche.
    const gusty = TRAITS[kind].rain > 0.5 ? 0.45 : 0;
    episodes.push({ start: m, kind, wind: 0.12 + 0.5 * r() + gusty + 0.2 * se.cold });
    m += lo + r() * (hi - lo);
  }
  return { episodes, snowy };
}

let dayKey = -1;
let today: WeatherDay | null = null;

function dayFor(se: SeasonState): WeatherDay {
  const d = runtime.tokyoDate;
  const key = d.year * 10000 + d.month * 100 + d.day;
  if (key !== dayKey || !today) {
    dayKey = key;
    today = buildDay(d.year, d.month, d.day, se);
  }
  return today;
}

/** Épisode en cours à une minute donnée, et son successeur. */
function episodeAt(day: WeatherDay, minute: number): { cur: Episode; next: Episode } {
  const eps = day.episodes;
  let i = 0;
  while (i + 1 < eps.length && eps[i + 1].start <= minute) i++;
  return { cur: eps[i], next: eps[Math.min(i + 1, eps.length - 1)] };
}

// --- Boucle -------------------------------------------------------------------

/** Constante de temps du fondu d'un temps à l'autre (s). */
const KIND_TAU = 45;
/** Séchage des surfaces (s) : une chaussée met un bon quart d'heure à blanchir. */
const DRY_TAU = 900;
/** Fonte de la neige au sol (s). */
const MELT_TAU = 2400;

/**
 * Fondu d'un épisode au suivant : la pluie n'arrive pas d'un coup, elle
 * s'installe. Vingt minutes de recouvrement autour de la bascule.
 */
const BLEND_MIN = 20;

function approach(value: number, target: number, dt: number, tau: number): number {
  return value + (target - value) * Math.min(1, dt / tau);
}

/**
 * Repose la météo sur la journée courante et la ramène à son état d'équilibre.
 *
 * Appelé au moment de monter à bord : sans cette pose, on démarre toujours par
 * un ciel bleu qui vire, alors qu'on arrive au milieu d'une journée qui a déjà
 * eu son temps. Le sol est mouillé si l'épisode en cours est pluvieux.
 */
export function seedWeather(): void {
  dayKey = -1;
  today = null;
  const se = seasonNow();
  const day = dayFor(se);
  const { cur } = episodeAt(day, runtime.clockMin);
  const t = TRAITS[cur.kind];
  weather.kind = cur.kind;
  weather.cloud = t.cloud;
  weather.rain = t.rain;
  weather.snow = t.snow;
  weather.wind = cur.wind;
  weather.wet = Math.min(1, t.rain * 1.4);
  weather.snowCover = day.snowy ? Math.min(1, t.snow * 1.2) : 0;
  weather.flash = 0;
  weather.thunderT = 999;
  updateWeather(0);
}

/**
 * Gel du modèle, pour les sondes de capture uniquement : les valeurs posées à
 * la main tiennent, au lieu d'être reprises à l'image suivante.
 */
let frozen = false;

export function freezeWeather(on: boolean): void {
  frozen = on;
}

export function updateWeather(dt: number): void {
  if (frozen) return;
  const se = seasonNow();
  const day = dayFor(se);
  const minute = runtime.clockMin;
  const { cur, next } = episodeAt(day, minute);

  // Fondu vers l'épisode suivant sur les vingt dernières minutes.
  const toNext = next.start - minute;
  const blend = toNext > 0 && toNext < BLEND_MIN ? 1 - toNext / BLEND_MIN : 0;
  const a = TRAITS[cur.kind];
  const b = TRAITS[next.kind];
  weather.kind = blend > 0.5 ? next.kind : cur.kind;

  const cloudT = a.cloud + (b.cloud - a.cloud) * blend;
  const rainT = a.rain + (b.rain - a.rain) * blend;
  const snowT = a.snow + (b.snow - a.snow) * blend;
  const windT = cur.wind + (next.wind - cur.wind) * blend;

  weather.cloud = approach(weather.cloud, cloudT, dt, KIND_TAU);
  weather.rain = approach(weather.rain, rainT, dt, KIND_TAU * 0.55);
  weather.snow = approach(weather.snow, snowT, dt, KIND_TAU * 0.7);
  weather.wind = approach(weather.wind, windT, dt, KIND_TAU);

  // Température : moyenne du jour, marche diurne, et la correction du temps
  // qu'il fait — un ciel couvert coupe le réchauffement de l'après-midi, une
  // averse rafraîchit franchement.
  const mean = dailyMeanTemp(se.doy);
  const swing = diurnal(minute / 60) * TEMP_DIURNAL;
  weather.tempC = mean + swing * (1 - 0.55 * weather.cloud) - 2.6 * weather.rain - 1.2 * weather.cloud;

  // Mouillé : la pluie mouille vite, le soleil sèche lentement — et une averse
  // d'août sèche en dix minutes quand une bruine de février tient l'après-midi.
  if (weather.rain > 0.02 || weather.snow > 0.02) {
    weather.wet = approach(weather.wet, Math.min(1, weather.rain * 1.5 + weather.snow * 0.6), dt, 25);
  } else {
    const warmth = Math.max(0.25, Math.min(2.2, (weather.tempC + 4) / 14)) * (1.4 - weather.cloud);
    weather.wet = approach(weather.wet, 0, dt, DRY_TAU / Math.max(0.2, warmth));
  }

  // Neige au sol : elle ne tient que si le sol est assez froid, et elle fond
  // dès qu'il repasse au-dessus de deux degrés. À Tokyo, une neige de midi ne
  // tient pas ; celle de 4 h du matin, oui.
  if (weather.snow > 0.02 && weather.tempC < 1.5) {
    weather.snowCover = approach(weather.snowCover, Math.min(1, weather.snow * 1.25), dt, 600);
  } else if (weather.tempC > 1.5) {
    weather.snowCover = approach(weather.snowCover, 0, dt, MELT_TAU / Math.max(0.3, weather.tempC));
  }

  // Éclairs : ils appartiennent à l'épisode d'orage, pas à la pluie. Un coup
  // toutes les dix à quarante secondes, jamais deux au même endroit.
  weather.thunderT += dt;
  weather.flash = Math.max(0, weather.flash - dt * 6);
  const storm = weather.kind === 'thunder' ? weather.rain : 0;
  if (storm > 0.25 && weather.thunderT > 9 + 34 * hashInt(Math.floor(minute * 60))) {
    weather.thunderT = 0;
    weather.thunderFar = hashInt(Math.floor(minute * 997) + 17);
    weather.flash = 0.55 + 0.45 * (1 - weather.thunderFar);
  }

  // Portée du regard. C'est le premier effet de la pluie, bien avant les
  // gouttes : sous une averse, la ville s'arrête à cent mètres.
  weather.visibility =
    (1 - 0.16 * weather.cloud) * (1 - 0.5 * weather.rain) * (1 - 0.42 * weather.snow);
}

/** Remet la météo à zéro (nouvelle session). */
export function resetWeather(): void {
  dayKey = -1;
  today = null;
  weather.kind = 'fair';
  weather.cloud = 0;
  weather.rain = 0;
  weather.snow = 0;
  weather.wet = 0;
  weather.snowCover = 0;
  weather.wind = 0.25;
  weather.flash = 0;
  weather.visibility = 1;
  weather.tempC = 15;
  weather.thunderT = 999;
  weather.thunderFar = 0.5;
}
