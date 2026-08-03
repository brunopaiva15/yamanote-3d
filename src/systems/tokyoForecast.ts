// La VRAIE météo de Tokyo, pour le bulletin de la chaîne de bord.
//
// L'écran gauche passe, entre deux réclames, le 「3時間ごとの天気」. Quand la
// journée jouée est une journée qui a EU LIEU - aujourd'hui, ou n'importe
// quelle date passée - ce bulletin dit le temps qu'il a vraiment fait à Tokyo.
// On peut le comparer à une fenêtre, ou à ses souvenirs, et c'est bien le but :
// la ligne existe, elle a roulé ce jour-là, et il y pleuvait ou non.
//
// Deux sources, une par régime :
//
//   · la date du jour  → prévision courante (modèle JMA). Elle couvre aussi
//     les heures DÉJÀ PASSÉES de la journée, donc reculer l'horloge au petit
//     matin ne fait pas perdre le réel ;
//   · une date passée  → archive de prévision, jour par jour.
//
// Une date FUTURE n'a pas de réponse : personne ne sait le temps qu'il fera le
// 3 février prochain. Le bulletin retombe alors sur le modèle climatique du jeu
// (`systems/weather`), qui sait produire une journée plausible pour n'importe
// quelle date - et qui est en plus le modèle du ciel qu'on a au-dessus de la
// tête, donc les deux ne se contredisent pas.
//
// Le réseau n'est jamais sur le chemin critique : tant que la réponse n'est pas
// là, `tokyoForecastSlots` renvoie `null` et l'appelant se rabat. Un échec
// (hors ligne, quota, panne) ne se retente pas en boucle.

import { runtime, tokyoNow } from './runtime';
import type { ForecastSlot, WeatherKind } from './weather';

const LIVE_ENDPOINT = 'https://api.open-meteo.com/v1/jma';
const ARCHIVE_ENDPOINT = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
/** Tokyo, à peu près à la verticale de la boucle. */
const LAT = 35.6762;
const LON = 139.6503;

/** Le modèle JMA ne sort pas plus vite qu'à la demi-heure. */
const REFRESH_MS = 30 * 60 * 1000;

interface HourlyBlock {
  time: string[];
  temperature_2m: number[];
  weather_code: number[];
}

/** Ce qu'on a en mémoire, et pour quelle journée on l'a demandé. */
let hourly: HourlyBlock | null = null;
let loadedKey = '';
let attemptedKey = '';
let lastAttempt = 0;
let inFlight = false;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function nextDay(y: number, m: number, d: number): [number, number, number] {
  const last = m === 2 && isLeap(y) ? 29 : MONTH_DAYS[m - 1];
  if (d < last) return [y, m, d + 1];
  if (m < 12) return [y, m + 1, 1];
  return [y + 1, 1, 1];
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Codes WMO → les neuf temps du jeu.
 *
 * La correspondance perd un peu : le brouillard (45/48) n'a pas de pictogramme
 * et rejoint le ciel couvert, et la neige en averses (85/86) tombe avec la
 * neige tout court. Aucune des deux ne vaut un dixième pictogramme qui ne
 * servirait qu'à Tokyo trois jours par an.
 */
function kindFromWmo(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'fair';
  if (code === 3 || code === 45 || code === 48) return 'overcast';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'downpour';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'fair';
}

function looksUsable(block: unknown): block is HourlyBlock {
  const b = block as HourlyBlock | undefined;
  return (
    Array.isArray(b?.time) &&
    Array.isArray(b?.temperature_2m) &&
    Array.isArray(b?.weather_code) &&
    b.time.length >= 24
  );
}

/** Régime de la journée jouée : réelle et connue, ou hors de portée. */
function sourceFor(): { url: string; key: string } | null {
  const d = runtime.tokyoDate;
  const n = tokyoNow();
  const played = d.year * 10000 + d.month * 100 + d.day;
  const today = n.year * 10000 + n.month * 100 + n.day;
  if (played > today) return null;

  const common = { latitude: String(LAT), longitude: String(LON), hourly: 'temperature_2m,weather_code', timezone: 'Asia/Tokyo' };
  if (played === today) {
    // Deux jours : les créneaux de fin de bulletin débordent sur demain.
    const url = new URL(LIVE_ENDPOINT);
    url.search = new URLSearchParams({ ...common, forecast_days: '2' }).toString();
    return { url: url.toString(), key: `live:${today}` };
  }
  const [ny, nm, nd] = nextDay(d.year, d.month, d.day);
  const url = new URL(ARCHIVE_ENDPOINT);
  url.search = new URLSearchParams({
    ...common,
    start_date: iso(d.year, d.month, d.day),
    end_date: iso(ny, nm, nd),
  }).toString();
  return { url: url.toString(), key: `past:${played}` };
}

async function refresh(url: string, key: string): Promise<void> {
  inFlight = true;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`météo : ${res.status}`);
    const data = (await res.json()) as { hourly?: unknown };
    if (looksUsable(data.hourly)) {
      hourly = data.hourly;
      loadedKey = key;
    }
  } catch {
    // Silencieux, et volontairement : un bulletin publicitaire qui n'arrive
    // pas n'est pas un incident. Le repli s'en occupe.
  } finally {
    inFlight = false;
  }
}

/**
 * Prévision réelle par tranches de trois heures, ou `null`.
 *
 * Renvoie `null` - et lance éventuellement une récupération - quand la journée
 * jouée est à venir, quand la réponse n'est pas encore là, ou quand elle n'a
 * pas pu être obtenue. L'appelant doit TOUJOURS avoir un repli.
 */
export function tokyoForecastSlots(count = 6): ForecastSlot[] | null {
  const src = sourceFor();
  if (!src) return null;

  const now = Date.now();
  const stale = src.key !== loadedKey && src.key !== attemptedKey;
  if (!inFlight && (stale || now - lastAttempt > REFRESH_MS)) {
    lastAttempt = now;
    attemptedKey = src.key;
    void refresh(src.url, src.key);
  }
  if (!hourly || loadedKey !== src.key) return null;

  // Les heures sont demandées en heure de Tokyo et le tableau commence à
  // minuit du jour joué : l'index d'un créneau est donc directement son heure,
  // décalée d'un jour si besoin. Pas d'arithmétique de calendrier, donc pas
  // d'occasion de se tromper d'un jour à la bascule de minuit.
  const base = Math.floor((((runtime.clockMin % 1440) + 1440) % 1440) / 180) * 180;
  const out: ForecastSlot[] = [];
  for (let i = 0; i < count; i++) {
    const abs = base + i * 180;
    const dayOffset = Math.floor(abs / 1440);
    const minute = abs % 1440;
    const idx = dayOffset * 24 + Math.floor(minute / 60);
    const temp = hourly.temperature_2m[idx];
    const code = hourly.weather_code[idx];
    if (typeof temp !== 'number' || typeof code !== 'number') return null;
    out.push({ minute, dayOffset, kind: kindFromWmo(code), tempC: Math.round(temp) });
  }
  return out;
}
