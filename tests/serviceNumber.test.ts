// 「大崎駅発時」+「運用番号」+「G」 : les trois choses que le numéro de course doit
// tenir, et que l'ancien calcul ne tenait pas.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DUTY_COUNT,
  OSAKI_INDEX,
  dutyForDirection,
  osakiDepartureHour,
  serviceNumberFor,
} from '../src/data/serviceNumber.ts';
import { STATIONS } from '../src/data/stations.ts';
import { stationAtHop } from '../src/data/loop.ts';
import { headwayMinutesTo } from '../src/data/segments.ts';
import type { LoopDirection } from '../src/data/platforms.ts';

const DIRECTIONS: LoopDirection[] = ['inner', 'outer'];

test('OSAKI_INDEX désigne bien Ōsaki', () => {
  assert.equal(STATIONS[OSAKI_INDEX].jy, 'JY24');
  assert.equal(STATIONS[OSAKI_INDEX].romaji, 'Ōsaki');
});

test('外回り est impair, 内回り est pair - dans les deux sens du terme', () => {
  for (let duty = 1; duty <= DUTY_COUNT; duty++) {
    assert.equal(dutyForDirection(duty, 'outer') % 2, 1, `roulement ${duty} 外回り`);
    assert.equal(dutyForDirection(duty, 'inner') % 2, 0, `roulement ${duty} 内回り`);
    // Le décalage ne sort jamais de la plage des roulements réels.
    for (const dir of DIRECTIONS) {
      const d = dutyForDirection(duty, dir);
      assert.ok(d >= 1 && d <= DUTY_COUNT, `roulement ${duty} ${dir} -> ${d}`);
    }
  }

  // Et sur le numéro complet, tel qu'il est peint sur la girouette.
  assert.equal(Number(serviceNumberFor(0, 8 * 60, 'outer', 13).replace('G', '')) % 2, 1);
  assert.equal(Number(serviceNumberFor(0, 8 * 60, 'inner', 13).replace('G', '')) % 2, 0);
});

test('le numéro ne bouge pas d’une gare à l’autre : il suit la rame', () => {
  // On fait un tour complet en avançant à l'horaire réel. Tant qu'on ne
  // repasse pas par Ōsaki, la girouette doit afficher le MÊME numéro - c'est
  // ce que l'ancien calcul, indexé sur la gare, ne pouvait pas faire.
  for (const dir of DIRECTIONS) {
    const start = 6 * 60 + 5;
    const first = serviceNumberFor(OSAKI_INDEX, start, dir, 21);
    for (let hop = 1; hop < 30; hop++) {
      const index = stationAtHop(OSAKI_INDEX, hop, dir);
      const clock = start + headwayMinutesTo(OSAKI_INDEX, hop, dir);
      assert.equal(serviceNumberFor(index, clock, dir, 21), first, `${dir} +${hop} arrêts`);
    }
  }
});

test('seule la partie « heure » est réécrite, et c’est à Ōsaki', () => {
  for (const dir of DIRECTIONS) {
    // Une rame partie d'Ōsaki à 06:05 boucle en un peu plus d'une heure : au
    // tour suivant, l'heure de départ a changé, le roulement non.
    const first = serviceNumberFor(OSAKI_INDEX, 6 * 60 + 5, dir, 21);
    const second = serviceNumberFor(OSAKI_INDEX, 7 * 60 + 12, dir, 21);
    assert.notEqual(first, second);
    assert.equal(first.slice(2), second.slice(2), 'le roulement reste celui de la journée');
    assert.equal(first.slice(0, 2), '06');
    assert.equal(second.slice(0, 2), '07');
  }
});

test('l’heure de départ d’Ōsaki se remonte sur l’horaire réel', () => {
  for (const dir of DIRECTIONS) {
    assert.equal(osakiDepartureHour(OSAKI_INDEX, 9 * 60 + 30, dir), 9, 'zéro saut à Ōsaki même');
    // Une gare atteinte juste après minuit garde l'heure de départ de la veille.
    const hop = 6;
    const elapsed = headwayMinutesTo(OSAKI_INDEX, hop, dir);
    const index = stationAtHop(OSAKI_INDEX, hop, dir);
    assert.equal(osakiDepartureHour(index, 5, dir), elapsed > 5 ? 23 : 0, `${dir} passage minuit`);
  }
});

test('le numéro a toujours quatre chiffres et le G final', () => {
  for (const dir of DIRECTIONS) {
    for (const clock of [0, 5 * 60, 13 * 60 + 40, 23 * 60 + 59]) {
      for (const duty of [1, 9, 10, 52]) {
        assert.match(serviceNumberFor(7, clock, dir, duty), /^\d{4}G$/);
      }
    }
  }
});
