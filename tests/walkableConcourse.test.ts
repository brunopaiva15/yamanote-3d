// Marche quai → hall : plus de cul-de-sac à cinq marches.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  STAIR_TO_CONCOURSE_LEN,
  STAIR_TO_CONCOURSE_Y,
  STAIR_WALK_LEN,
  stairFloorY,
} = await import('../src/data/stationGeometry.ts');
const { circulationFor } = await import('../src/data/stationCirculation.ts');
const { placementFor, stairwellAt, concourseAt, stairTopZ } = await import(
  '../src/systems/stationPlacement.ts'
);

test('le profil d’escalier atteint le plancher du couloir', () => {
  const y = stairFloorY(STAIR_TO_CONCOURSE_LEN, 99);
  assert.ok(Math.abs(y - STAIR_TO_CONCOURSE_Y) < 0.05, `y=${y}`);
});

test('la descente joueur dépasse l’ancienne limite de 5 marches', () => {
  assert.ok(STAIR_TO_CONCOURSE_LEN > STAIR_WALK_LEN);
});

test('placement expose un hall pour chaque gare', () => {
  for (let i = 0; i < 30; i++) {
    const p = placementFor(i, []);
    assert.ok(p.concourse.halfX > 0, `JY hall ${i}`);
    assert.ok(p.stairs.length >= 1, `JY stairs ${i}`);
    const hit = concourseAt(p, p.concourse.x, p.concourse.z);
    assert.ok(hit, `concourseAt ${i}`);
    assert.equal(hit!.y, p.concourse.floorY);
  }
});

test('trémie praticable jusqu’au pied (Mejiro montée / Tokyo descente)', () => {
  const tokyo = placementFor(0, []);
  const s = tokyo.stairs[0];
  const t = STAIR_TO_CONCOURSE_LEN - 0.1;
  const hit = stairwellAt(tokyo, s.x, stairTopZ(s) + t);
  assert.ok(hit);
  assert.ok(hit!.y < -2, `tokyo y=${hit!.y}`);

  const mejiro = placementFor(13, []);
  assert.equal(circulationFor(13).accessDir, 'up');
  const ms = mejiro.stairs[0];
  const up = stairwellAt(mejiro, ms.x, stairTopZ(ms) + 6);
  assert.ok(up);
  assert.ok(up!.y > 2, `mejiro y=${up!.y}`);
});
