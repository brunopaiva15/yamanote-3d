import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISRUPTION_DEFINITIONS, seededDisruptionRandom, selectDisruptionCause, selectDisruptionDuration,
} from '../src/data/platformDisruptions.ts';
import {
  beginPlatformDisruption, clearLineDisruption, consumeRecoveryTrain, disruptionExtraSeconds,
  lineDisruption, nextTrainBlocked, resolveLineDisruption, updateLineDisruption,
} from '../src/systems/lineDisruption.ts';

function begin(severity: 'minor' | 'suspended', seconds: number) {
  clearLineDisruption();
  assert.equal(beginPlatformDisruption({ cause: severity === 'minor' ? 'door-inspection' : 'person-on-track', severity, seconds, source: 'development', direction: 'inner', stationIndex: 19, seed: 'test', force: true }), true);
}

test('une même graine tire exactement la même perturbation', () => {
  const a = selectDisruptionCause(seededDisruptionRandom('stable'));
  const b = selectDisruptionCause(seededDisruptionRandom('stable'));
  assert.equal(a.cause, b.cause);
});

test('chaque durée tirée respecte les bornes centralisées', () => {
  for (const d of DISRUPTION_DEFINITIONS) for (const r of [0, 0.5, 0.999]) {
    const seconds = selectDisruptionDuration(d, () => r);
    assert.ok(seconds >= d.minimumSeconds && seconds <= d.maximumSeconds, d.cause);
  }
});

test('un retard mineur finit automatiquement sans durée négative', () => {
  begin('minor', 10); updateLineDisruption(12);
  assert.equal(lineDisruption.phase, 'resuming');
  assert.equal(lineDisruption.holdRemainingSeconds, 0);
  assert.ok(disruptionExtraSeconds('inner') >= 0);
});

test('une suspension bloque la rame puis sa résolution autorise la reprise', () => {
  begin('suspended', 300);
  assert.equal(nextTrainBlocked('inner'), true);
  resolveLineDisruption();
  assert.equal(nextTrainBlocked('inner'), true, 'le tampon opérationnel reste bloquant');
  updateLineDisruption(30);
  assert.equal(nextTrainBlocked('inner'), false);
});

test('une révision ne rapproche jamais l’heure annoncée', () => {
  begin('suspended', 300); const before = lineDisruption.estimatedResumeClockMin;
  updateLineDisruption(210);
  if (before != null && lineDisruption.estimatedResumeClockMin != null)
    assert.ok(lineDisruption.estimatedResumeClockMin >= before);
});

test('l’autre sens n’est pas bloqué et toutes les durées y sont nulles', () => {
  begin('minor', 60); lineDisruption.affectedDirections = 'outer';
  assert.equal(nextTrainBlocked('inner'), false);
  assert.equal(disruptionExtraSeconds('inner'), 0);
});

test('la récupération consomme exactement ses trains', () => {
  begin('minor', 1); updateLineDisruption(2); updateLineDisruption(30);
  const count = lineDisruption.recoveringTrainsRemaining;
  for (let i = 0; i < count; i++) consumeRecoveryTrain();
  assert.equal(lineDisruption.phase, 'inactive');
});

test('un incident actif ne peut pas être retiré à chaque frame', () => {
  begin('minor', 60); const id = lineDisruption.id;
  assert.equal(beginPlatformDisruption({ direction: 'inner', stationIndex: 1, seed: 'other' }), false);
  assert.equal(lineDisruption.id, id);
});
