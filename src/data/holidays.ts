// Les jours fériés japonais, CALCULÉS et non tabulés.
//
// Pourquoi : la version précédente était une liste littérale de dates, 2025 à
// 2027. Or le menu propose par défaut la date réelle à Tokyo et l'horloge du
// monde avance les jours d'elle-même : au 1er janvier 2028, les seize fériés de
// l'année auraient disparu sans un mot. `morningMatrixFactor` aurait pris la
// colonne du jour ouvrable au lieu de celle du dimanche, et le remplissage
// annoncé aurait sauté d'environ 0,35 à 1,0 — un 元日 rendu comme un mardi de
// pointe. Un tableau qui périme est une bombe à retardement silencieuse ; la loi,
// elle, ne périme pas.
//
// Ce qui est implémenté, c'est le 祝日法 dans sa rédaction en vigueur (depuis la
// réforme de 2020 qui a déplacé 天皇誕生日 au 23 février et renommé 体育の日 en
// スポーツの日) :
//
//   • les fériés à date fixe ;
//   • les « Happy Monday » — 成人の日, 海の日, 敬老の日, スポーツの日 — posés sur
//     le n-ième lundi de leur mois ;
//   • les deux équinoxes, qui ne sont pas des dates mais des instants
//     astronomiques : le gouvernement les publie chaque février pour l'année
//     suivante, et la formule ci-dessous les retrouve sur 1980–2099 ;
//   • le 振替休日 : un férié tombant un dimanche reporte au premier jour suivant
//     qui n'est pas déjà férié ;
//   • le 国民の休日 : un jour ordinaire pris en sandwich entre deux fériés en
//     devient un. C'est lui qui donne le 22 septembre certaines années, quand
//     敬老の日 et 秋分の日 encadrent un mardi.
//
// Les décalages exceptionnels votés au coup par coup (les jeux de Tokyo 2020,
// l'intronisation de 2019) ne sont PAS ici : ce sont des lois d'espèce, pas une
// règle, et la boucle ne se joue pas en 2019.

/** Clé AAAA-MM-JJ. */
function key(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Jour de la semaine (0 = dimanche) en UTC, pour ne pas dépendre du fuseau. */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Quantième du n-ième lundi du mois. */
function nthMonday(year: number, month: number, n: number): number {
  const firstDow = weekdayOf(year, month, 1);
  // Décalage du 1er du mois au premier lundi (lundi = 1).
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (n - 1) * 7;
}

/**
 * Quantième de l'équinoxe de printemps (春分の日).
 *
 * Formule usuelle, valable de 1980 à 2099 : l'équinoxe dérive d'un quart de jour
 * par an et l'année bissextile le ramène en arrière.
 */
function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** Quantième de l'équinoxe d'automne (秋分の日). Même domaine de validité. */
function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** Bornes de validité de la formule des équinoxes. */
export const HOLIDAY_YEAR_MIN = 1980;
export const HOLIDAY_YEAR_MAX = 2099;

/** Les fériés « nommés » d'une année : dates de loi, avant reports et sandwich. */
function statutoryHolidays(year: number): { month: number; day: number }[] {
  return [
    { month: 1, day: 1 }, // 元日
    { month: 1, day: nthMonday(year, 1, 2) }, // 成人の日
    { month: 2, day: 11 }, // 建国記念の日
    { month: 2, day: 23 }, // 天皇誕生日
    { month: 3, day: vernalEquinoxDay(year) }, // 春分の日
    { month: 4, day: 29 }, // 昭和の日
    { month: 5, day: 3 }, // 憲法記念日
    { month: 5, day: 4 }, // みどりの日
    { month: 5, day: 5 }, // こどもの日
    { month: 7, day: nthMonday(year, 7, 3) }, // 海の日
    { month: 8, day: 11 }, // 山の日
    { month: 9, day: nthMonday(year, 9, 3) }, // 敬老の日
    { month: 9, day: autumnalEquinoxDay(year) }, // 秋分の日
    { month: 10, day: nthMonday(year, 10, 2) }, // スポーツの日
    { month: 11, day: 3 }, // 文化の日
    { month: 11, day: 23 }, // 勤労感謝の日
  ];
}

/** Quantième absolu (jours depuis l'époque UTC) — pour les voisinages de dates. */
function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

function fromDayNumber(n: number): { year: number; month: number; day: number } {
  const d = new Date(n * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Tous les fériés observés d'une année, reports et 国民の休日 compris.
 *
 * L'année voisine est balayée avec elle : un 31 décembre férié pourrait reporter
 * au 1er janvier suivant, et le sandwich de septembre a besoin de connaître ses
 * deux bords même quand l'un tombe hors de l'année.
 */
function computeYear(year: number): Set<string> {
  const named = new Set<number>();
  for (const y of [year - 1, year, year + 1]) {
    for (const h of statutoryHolidays(y)) named.add(dayNumber(y, h.month, h.day));
  }

  const observed = new Set<number>(named);

  // 振替休日 : un férié tombant un dimanche reporte au premier jour suivant qui
  // n'est pas lui-même férié. (Golden Week en enchaîne parfois deux.)
  for (const n of [...named].sort((a, b) => a - b)) {
    const d = fromDayNumber(n);
    if (weekdayOf(d.year, d.month, d.day) !== 0) continue;
    let next = n + 1;
    while (observed.has(next)) next++;
    observed.add(next);
  }

  // 国民の休日 : un jour ordinaire encadré par deux fériés en devient un. La
  // règle porte sur les fériés NOMMÉS, pas sur les reports — d'où `named`.
  for (const n of [...named]) {
    if (named.has(n + 2) && !observed.has(n + 1)) {
      const d = fromDayNumber(n + 1);
      // Un dimanche n'a pas besoin qu'on le lui dise, et la loi l'exclut.
      if (weekdayOf(d.year, d.month, d.day) !== 0) observed.add(n + 1);
    }
  }

  const out = new Set<string>();
  for (const n of observed) {
    const d = fromDayNumber(n);
    if (d.year === year) out.add(key(d.year, d.month, d.day));
  }
  return out;
}

const cache = new Map<number, Set<string>>();

/** Les fériés observés d'une année, en clés AAAA-MM-JJ. */
export function japaneseHolidaysFor(year: number): Set<string> {
  let set = cache.get(year);
  if (!set) {
    set = computeYear(year);
    cache.set(year, set);
  }
  return set;
}

/**
 * Ce jour-là est-il férié au Japon ?
 *
 * Hors du domaine de la formule des équinoxes, on répond non plutôt que de
 * rendre une date fausse — mais la boucle ne se joue pas en 1850.
 */
export function isHoliday(date: { year: number; month: number; day: number }): boolean {
  if (date.year < HOLIDAY_YEAR_MIN || date.year > HOLIDAY_YEAR_MAX) return false;
  return japaneseHolidaysFor(date.year).has(key(date.year, date.month, date.day));
}
