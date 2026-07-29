// Ce que dit le 発車標 (src/data/departureBoard.ts).
//
// Le module est pur — des secondes et une heure d'horloge en entrée, du texte
// à afficher en sortie — et n'importe rien : Node 22 l'exécute tel quel, sans
// compilateur ni harnais, comme routeMath et trainPhysics.
//
// Ce qui se joue ici n'est pas de l'arithmétique mais une CONVENTION de lecture,
// celle des quais de la Yamanote depuis 2020 : deux rames annoncées, un 約 qui
// dit bien que c'est une estimation, jamais de « 0 分後 », 「まもなく」 quand la
// rame est en vue, et l'heure de départ aux seules premières et dernières
// circulations — les moments où l'on regarde le tableau pour savoir si l'on a
// raté la dernière.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOON_UNDER,
  boardEta,
  boardRows,
  hhmm,
  sameBoardView,
  showsSchedule,
  type BoardEta,
} from '../src/data/departureBoard.ts';

/** Midi : en plein régime de décompte. */
const NOON = 12 * 60;

test('le régime normal est le décompte, arrondi à la minute', () => {
  assert.deepEqual(boardEta(120, NOON), { kind: 'minutes', minutes: 2 });
  assert.deepEqual(boardEta(300, NOON), { kind: 'minutes', minutes: 5 });
  // 約 : on arrondit, on ne tronque pas — 2 min 40 s se lit « environ 3 ».
  assert.deepEqual(boardEta(160, NOON), { kind: 'minutes', minutes: 3 });
});

test('jamais « 約0分後 » : sous la minute, le tableau dit まもなく', () => {
  assert.equal(boardEta(SOON_UNDER, NOON).kind, 'soon');
  assert.equal(boardEta(10, NOON).kind, 'soon');
  assert.equal(boardEta(0, NOON).kind, 'soon');
  // Juste au-dessus du seuil, le décompte reprend — et jamais à zéro.
  const eta = boardEta(SOON_UNDER + 1, NOON);
  assert.equal(eta.kind, 'minutes');
  assert.ok(eta.kind === 'minutes' && eta.minutes >= 1);
});

test('premières et dernières circulations : l’heure remplace le délai', () => {
  // 04 h 58, une rame dans quatorze minutes : 05:12.
  assert.deepEqual(boardEta(14 * 60, 4 * 60 + 58), { kind: 'time', hhmm: '05:12' });
  // 23 h 52, une rame dans six minutes : 23:58.
  assert.deepEqual(boardEta(6 * 60, 23 * 60 + 52), { kind: 'time', hhmm: '23:58' });
  // En pleine journée, la même attente reste un décompte.
  assert.equal(boardEta(14 * 60, NOON).kind, 'minutes');
});

test('la fenêtre horaire enjambe minuit sans se couper', () => {
  assert.equal(showsSchedule(23 * 60 + 50), true);
  assert.equal(showsSchedule(0), true);
  assert.equal(showsSchedule(60), true);
  assert.equal(showsSchedule(5 * 60 + 14), true);
  assert.equal(showsSchedule(5 * 60 + 16), false);
  assert.equal(showsSchedule(23 * 60), false);
});

test('l’horaire se replie sur le lendemain, jamais « 25:04 »', () => {
  // 23 h 58, rame dans six minutes : le tableau écrit 00:04.
  assert.deepEqual(boardEta(6 * 60, 23 * 60 + 58), { kind: 'time', hhmm: '00:04' });
  assert.equal(hhmm(24 * 60 + 64), '01:04');
  assert.equal(hhmm(-1), '23:59');
});

test('まもなく l’emporte sur l’horaire : une rame en vue n’a pas de minute', () => {
  assert.equal(boardEta(20, 4 * 60 + 58).kind, 'soon');
});

test('le tableau annonce deux rames, la seconde toujours derrière la première', () => {
  const rows = boardRows({ first: 120, second: 300, leaving: false }, NOON);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { kind: 'minutes', minutes: 2 });
  assert.deepEqual(rows[1], { kind: 'minutes', minutes: 5 });
});

test('deux lignes identiques se lisent comme une panne : la seconde recule', () => {
  // Une prévision qui collerait les deux rames est écartée d'une minute.
  const rows = boardRows({ first: 180, second: 185, leaving: false }, NOON);
  assert.deepEqual(rows[0], { kind: 'minutes', minutes: 3 });
  assert.deepEqual(rows[1], { kind: 'minutes', minutes: 4 });
});

test('rame à quai : まもなく, puis まもなく発車 quand elle s’ébranle', () => {
  const waiting = boardRows({ first: null, second: 210, leaving: false }, NOON);
  assert.equal(waiting[0].kind, 'soon');
  assert.deepEqual(waiting[1], { kind: 'minutes', minutes: 4 });

  const leaving = boardRows({ first: null, second: 150, leaving: true }, NOON);
  assert.equal(leaving[0].kind, 'departing');
  assert.deepEqual(leaving[1], { kind: 'minutes', minutes: 3 });
});

test('le canvas ne se redessine que lorsque le tableau a vraiment changé', () => {
  const rows: BoardEta[] = [{ kind: 'minutes', minutes: 2 }, { kind: 'minutes', minutes: 5 }];
  const view = { rows, english: false, blink: false };
  assert.equal(sameBoardView(view, { rows: [...rows], english: false, blink: false }), true);
  // La minute qui tombe, la langue qui alterne, le clignotement : tout compte.
  assert.equal(
    sameBoardView(view, {
      rows: [{ kind: 'minutes', minutes: 1 }, { kind: 'minutes', minutes: 5 }],
      english: false,
      blink: false,
    }),
    false,
  );
  assert.equal(sameBoardView(view, { rows, english: true, blink: false }), false);
  assert.equal(sameBoardView(view, { rows, english: false, blink: true }), false);
  // Même minute, mais l'un donne l'heure et l'autre un délai.
  assert.equal(
    sameBoardView(view, {
      rows: [{ kind: 'time', hhmm: '05:12' }, { kind: 'minutes', minutes: 5 }],
      english: false,
      blink: false,
    }),
    false,
  );
});
