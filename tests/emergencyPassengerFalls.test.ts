import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMERGENCY_FALL_RATE,
  selectEmergencyFallers,
} from '../src/systems/emergencyPassengerFalls.ts';

test("un arrêt d'urgence fait tomber 20 % des voyageurs debout", () => {
  const standing = Array.from({ length: 30 }, (_, id) => id);
  const fallers = selectEmergencyFallers(standing, () => 0.5);

  assert.equal(EMERGENCY_FALL_RATE, 0.2);
  assert.equal(fallers.size, 6);
  assert.ok([...fallers].every((id) => standing.includes(id)));
});

test('le tirage est sans remise et varie avec le hasard', () => {
  const standing = Array.from({ length: 10 }, (_, id) => id);
  const fromStart = selectEmergencyFallers(standing, () => 0);
  const fromEnd = selectEmergencyFallers(standing, () => 0.999999);

  assert.equal(fromStart.size, 2);
  assert.equal(fromEnd.size, 2);
  assert.notDeepEqual([...fromStart], [...fromEnd]);
});
