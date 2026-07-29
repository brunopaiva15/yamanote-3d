// Les jours fériés japonais (src/data/holidays.ts).
//
// Ce qui est en jeu n'est pas une curiosité de calendrier : le férié commande la
// colonne de `MORNING_MATRIX` que prend le modèle de remplissage. Se tromper,
// c'est rendre un 元日 comme un mardi de pointe — d'environ 0,35 à 1,0 sur le
// taux annoncé, le HUD, la densité de PNJ et la foule du quai.
//
// Le module était une liste littérale 2025–2027 qui aurait péri en silence au
// 1er janvier 2028. Il calcule maintenant, et ces tests tiennent les deux bouts :
// la conformité à ce qui est publié pour les années qu'on connaît, et le fait
// qu'aucune année du domaine ne rende quelque chose d'absurde.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLIDAY_YEAR_MAX,
  HOLIDAY_YEAR_MIN,
  isHoliday,
  japaneseHolidaysFor,
} from '../src/data/holidays.ts';

const mmdd = (year: number) => [...japaneseHolidaysFor(year)].map((d) => d.slice(5)).sort();

/**
 * Calendriers officiels du Cabinet Office (内閣府), reports et 国民の休日
 * compris. C'est le relevé de référence : si le calcul s'en écarte, c'est le
 * calcul qui a tort.
 */
const PUBLISHED: Record<number, string[]> = {
  2025: [
    '01-01', '01-13', '02-11', '02-23', '02-24', '03-20', '04-29', '05-03',
    '05-04', '05-05', '05-06', '07-21', '08-11', '09-15', '09-23', '10-13',
    '11-03', '11-23', '11-24',
  ],
  2026: [
    '01-01', '01-12', '02-11', '02-23', '03-20', '04-29', '05-03', '05-04',
    '05-05', '05-06', '07-20', '08-11', '09-21', '09-22', '09-23', '10-12',
    '11-03', '11-23',
  ],
  2027: [
    '01-01', '01-11', '02-11', '02-23', '03-21', '03-22', '04-29', '05-03',
    '05-04', '05-05', '07-19', '08-11', '09-20', '09-23', '10-11', '11-03',
    '11-23',
  ],
};

test('les années publiées sont reproduites à la date près', () => {
  for (const [year, want] of Object.entries(PUBLISHED)) {
    assert.deepEqual(mmdd(Number(year)), [...want].sort(), `année ${year}`);
  }
});

test('la table littérale qu’on remplace oubliait les fériés tombant un dimanche', () => {
  // 勤労感謝の日 2025 et 春分の日 2027 tombent un dimanche : ils SONT fériés, et
  // leur report l'est aussi. L'ancienne liste ne gardait que le report.
  assert.ok(isHoliday({ year: 2025, month: 11, day: 23 }));
  assert.ok(isHoliday({ year: 2025, month: 11, day: 24 }));
  assert.ok(isHoliday({ year: 2027, month: 3, day: 21 }));
  assert.ok(isHoliday({ year: 2027, month: 3, day: 22 }));
});

test('les Happy Monday tombent bien un lundi, toutes les années du domaine', () => {
  // 成人の日, 海の日, 敬老の日, スポーツの日 : quatre fériés qui n'existent que
  // pour faire un week-end de trois jours. S'ils tombent un mardi, le calcul du
  // n-ième lundi est faux.
  const months = [1, 7, 9, 10];
  for (let year = HOLIDAY_YEAR_MIN; year <= HOLIDAY_YEAR_MAX; year++) {
    const days = japaneseHolidaysFor(year);
    for (const month of months) {
      const mondays = [...days]
        .filter((d) => Number(d.slice(5, 7)) === month)
        .filter((d) => {
          const day = Number(d.slice(8, 10));
          return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 1;
        });
      assert.ok(mondays.length >= 1, `${year}-${month} sans lundi férié`);
    }
  }
});

test('aucun 1er janvier manqué, jamais, sur tout le domaine', () => {
  for (let year = HOLIDAY_YEAR_MIN; year <= HOLIDAY_YEAR_MAX; year++) {
    assert.ok(isHoliday({ year, month: 1, day: 1 }), `${year}-01-01`);
  }
});

test('le compte reste plausible d’un bout à l’autre du domaine', () => {
  // Seize fériés nommés, plus les reports et les 国民の休日 : de seize à vingt.
  // En dessous, un férié a été perdu ; au-dessus, un report s'est dédoublé.
  for (let year = HOLIDAY_YEAR_MIN; year <= HOLIDAY_YEAR_MAX; year++) {
    const n = japaneseHolidaysFor(year).size;
    assert.ok(n >= 16 && n <= 21, `${year} : ${n} fériés`);
  }
});

test('un report ne tombe jamais un dimanche, et jamais sur un autre férié', () => {
  // La règle est « le premier jour suivant qui n'est pas déjà férié » : deux
  // fériés ne peuvent pas se reporter sur le même jour, et Golden Week est le
  // cas qui le met à l'épreuve.
  for (let year = HOLIDAY_YEAR_MIN; year <= HOLIDAY_YEAR_MAX; year++) {
    for (const d of japaneseHolidaysFor(year)) {
      const [, m, day] = d.split('-').map(Number);
      const dow = new Date(Date.UTC(year, m - 1, day)).getUTCDay();
      // Un dimanche férié est parfaitement normal (le férié nommé lui-même) ;
      // ce qu'on vérifie, c'est qu'il y a bien un report derrière lui.
      if (dow !== 0) continue;
      let next = new Date(Date.UTC(year, m - 1, day + 1));
      let guard = 0;
      while (guard++ < 5) {
        const k = {
          year: next.getUTCFullYear(),
          month: next.getUTCMonth() + 1,
          day: next.getUTCDate(),
        };
        if (isHoliday(k)) {
          next = new Date(next.getTime() + 86400000);
          continue;
        }
        break;
      }
      assert.ok(guard >= 2, `${d} : dimanche férié sans report`);
    }
  }
});

test('hors du domaine de la formule, on répond non plutôt que faux', () => {
  assert.equal(isHoliday({ year: 1850, month: 1, day: 1 }), false);
  assert.equal(isHoliday({ year: 2200, month: 1, day: 1 }), false);
});

test('le 22 septembre est férié quand敬老の日 et秋分の日 l’encadrent', () => {
  // 国民の休日 : 2026 est l'année type — lundi 21 et mercredi 23 fériés, le
  // mardi 22 le devient. En 2025 (15 et 23 septembre) il ne l'est pas.
  assert.ok(isHoliday({ year: 2026, month: 9, day: 22 }));
  assert.equal(isHoliday({ year: 2025, month: 9, day: 22 }), false);
});
