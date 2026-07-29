// La chorégraphie des vantaux (src/systems/doorMotion.ts).
//
// `runtime.doorOpen` est la porte de RÉFÉRENCE : celle qui part la première, et
// donc celle qui arrive la première. Les trois autres traînent derrière elle,
// jusqu'à 0,3 s — c'est le tirage de `randomizeDoorTimings`, et c'est ce qui
// fait qu'aucun arrêt ne ressemble au précédent.
//
// Tout ce qui SUIT la chorégraphie doit donc distinguer « la référence est
// arrivée » de « tout le monde est arrivé ». Le rendu de la rame vue du quai
// (three/exterior/TrainConsist) confondait les deux : il cessait de reposer les
// vantaux dès que la référence ne bougeait plus, et laissait les autres
// dessinés à mi-course pour tout l'arrêt — une rame qui semblait close depuis
// le quai alors qu'on pouvait y monter.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { randomizeDoorTimings, trainDoorLag, trainDoorPos, trainDoorsSettled } = await import(
  '../src/systems/doorMotion.ts'
);
const { runtime } = await import('../src/systems/runtime.ts');
const { CONFIG } = await import('../src/data/config.ts');

/** Pose la commande sans passer par les sons : le test n'a pas d'audio. */
function command(target: 0 | 1, t: number): void {
  runtime.doorTarget = target;
  runtime.doorT = t;
}

/** Course de chaque vantail de la voiture à l'instant courant. */
function leaves(): number[] {
  return CONFIG.doorCenters.map((dz) => trainDoorPos(trainDoorLag(dz)));
}

test('la référence arrive avant les autres : elle ne dit pas la fin de la course', () => {
  // Vingt tirages : les retards changent à chaque gare, la propriété non.
  let sawLaggard = false;
  for (let k = 0; k < 20; k++) {
    randomizeDoorTimings();
    const spread = Math.max(...CONFIG.doorCenters.map(trainDoorLag));
    if (spread < 0.02) continue; // tirage dégénéré : les quatre partent ensemble
    sawLaggard = true;
    // Premier instant où la référence est en butée.
    let t = 0;
    command(1, 0);
    while (trainDoorPos(0) < 1 && t < 10) {
      t += 1 / 60;
      command(1, t);
    }
    assert.ok(t < 10, 'la porte de référence devrait finir sa course');
    assert.equal(trainDoorPos(0), 1);
    // À cet instant, au moins un vantail est encore en chemin — et
    // trainDoorsSettled() doit le dire.
    assert.ok(Math.min(...leaves()) < 1, 'un vantail au moins traîne encore');
    assert.equal(trainDoorsSettled(), false);
  }
  assert.ok(sawLaggard, 'aucun tirage n’a produit de retard : test sans objet');
});

test('trainDoorsSettled : quand c’est vrai, les quatre sont en butée', () => {
  for (const target of [1, 0] as const) {
    for (let k = 0; k < 20; k++) {
      randomizeDoorTimings();
      let t = 0;
      command(target, 0);
      while (!trainDoorsSettled() && t < 10) {
        t += 1 / 60;
        command(target, t);
      }
      assert.ok(t < 10, 'la course devrait finir');
      for (const pos of leaves()) {
        assert.equal(pos, target, `vantail à ${pos}, attendu ${target}`);
      }
    }
  }
});

test('la pose d’arrivée ne bouge plus une fois la course finie', () => {
  randomizeDoorTimings();
  command(1, 30);
  assert.equal(trainDoorsSettled(), true);
  assert.deepEqual(leaves(), CONFIG.doorCenters.map(() => 1));
  command(0, 30);
  assert.equal(trainDoorsSettled(), true);
  assert.deepEqual(leaves(), CONFIG.doorCenters.map(() => 0));
});
