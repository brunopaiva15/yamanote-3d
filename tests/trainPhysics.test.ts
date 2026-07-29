// Le profil de traction / freinage du E235 (src/systems/trainPhysics.ts).
//
// Le module n'a qu'une dépendance, `data/config`, qui n'en a aucune : Node 22
// exécute les deux tels quels (effacement de types natif), sans compilateur ni
// harnais — même régime que routeMath.
//
// Ce qui se joue ici n'est pas une constante mais une SENSATION : un train ne
// s'arrête pas, il se pose. Les seuils ci-dessous décrivent la fin d'un arrêt
// réussi vue du quai — le dernier mètre au pas, les dix derniers centimètres
// qu'on voit passer — et le budget de temps que le cycle station lui réserve
// (CONFIG.brakeTime). Les trois tiennent ensemble : desserrer le freinage sans
// rallonger la phase ferait basculer en dwell une rame encore en mouvement.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, V_MAX } from '../src/data/config.ts';
import { integrateTrain, stopDistance, type TrainState } from '../src/systems/trainPhysics.ts';

/** Freinage complet depuis la vitesse de ligne, au pas de la boucle 60 fps. */
function brakeRun(): { t: number; total: number; log: TrainState[]; times: number[] } {
  const state: TrainState = { v: V_MAX, a: 0, d: 0 };
  const dt = 1 / 60;
  const log: TrainState[] = [];
  const times: number[] = [];
  let t = 0;
  while (state.v > 0 && t < 60) {
    integrateTrain(state, 0, dt);
    t += dt;
    log.push({ ...state });
    times.push(t);
  }
  return { t, total: state.d, log, times };
}

/** Instant (s avant l'arrêt) et vitesse au passage à `metres` du point d'arrêt. */
function atRemaining(run: ReturnType<typeof brakeRun>, metres: number) {
  const i = run.log.findIndex((s) => run.total - s.d <= metres);
  return { before: run.t - run.times[i], v: run.log[i].v };
}

test('la rame se pose : le dernier mètre au pas, les derniers centimètres au ralenti', () => {
  const run = brakeRun();
  const lastMetre = atRemaining(run, 1);
  const last10cm = atRemaining(run, 0.1);
  // Un mètre avant l'arrêt on est déjà sous 1 m/s, et il reste plusieurs
  // secondes à parcourir : c'est là que se joue le « pas brusque ».
  assert.ok(lastMetre.v < 1, `1 m avant l'arrêt : ${lastMetre.v.toFixed(2)} m/s`);
  assert.ok(lastMetre.before > 2.5, `dernier mètre en ${lastMetre.before.toFixed(2)} s`);
  // Dix centimètres : moins de 1 km/h, plus d'une seconde. À ce régime, le
  // décalage entre portes palières et portières se lit à l'œil nu.
  assert.ok(last10cm.v < 0.25, `10 cm avant l'arrêt : ${last10cm.v.toFixed(3)} m/s`);
  assert.ok(last10cm.before > 1, `derniers 10 cm en ${last10cm.before.toFixed(2)} s`);
});

test('le freinage tient dans la phase brake du cycle station', () => {
  const run = brakeRun();
  assert.ok(run.t < CONFIG.brakeTime, `arrêt à ${run.t.toFixed(2)} s pour ${CONFIG.brakeTime} s`);
  // …sans la laisser à moitié vide non plus : le dwell suit l'immobilisation
  // d'environ une seconde (STOP_TO_DWELL_T0).
  assert.ok(run.t > CONFIG.brakeTime - 2.5, `arrêt à ${run.t.toFixed(2)} s, phase trop longue`);
});

test('la distance restante décroît à la vitesse du train et s’annule à l’arrêt', () => {
  const run = brakeRun();
  let previous = Infinity;
  let worst = 0;
  for (const s of run.log) {
    const left = stopDistance(s.v, s.a);
    // Monotone : le quai posé à −left ne recule jamais.
    assert.ok(left <= previous + 1e-9, 'la distance restante est repartie à la hausse');
    previous = left;
    // Et elle colle à ce qui reste vraiment à parcourir. L'écart — les deux
    // intégrations ne tournent pas au même pas de temps — se résorbe à mesure
    // qu'on approche : deux centimètres au plus sur le dernier mètre, rien du
    // tout à l'arrivée. C'est ce qui fait qu'il n'y a aucun raccord final : la
    // gare se cale d'elle-même.
    if (run.total - s.d < 1) worst = Math.max(worst, Math.abs(left - (run.total - s.d)));
  }
  assert.ok(worst < 0.03, `écart prévision/réel sur le dernier mètre : ${worst.toFixed(3)} m`);
  assert.ok(stopDistance(0, 0) === 0);
});
