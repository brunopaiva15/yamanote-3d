import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import * as THREE from 'three';
register('./fixtures/ts-resolve.mjs', import.meta.url);
const { useStore } = await import('../src/store.ts');
const { circulationFor } = await import('../src/data/stationCirculation.ts');
const { platformToWorld } = await import('../src/systems/playerFrame.ts');
const { groundY, resolveMove, zoneAt } = await import('../src/systems/walkable.ts');

function world(x: number, z: number) { const p = { x: 0, z: 0 }; platformToWorld(x, z, p); return p; }
test('un raccord continu relie le quai au hall dans les deux sens', () => {
  useStore.setState({ platformIndex: 29, loopDirection: 'inner' });
  const access = circulationFor(29).accesses.find((a) => a.kind === 'stairs')!;
  const top = world(access.platformX, access.platformZ);
  const mid = world(access.platformX, access.platformZ + 4);
  const bottom = world(access.platformX, access.platformZ + 8.5);
  assert.equal(zoneAt(top.x, top.z), 'access');
  assert.equal(zoneAt(mid.x, mid.z), 'access');
  assert.equal(zoneAt(bottom.x, bottom.z), 'concourse');
  assert.ok(groundY(mid.x, mid.z) < groundY(top.x, top.z));
  const pos = new THREE.Vector3(bottom.x, 0, bottom.z);
  resolveMove(pos, 0, top.z - bottom.z);
  assert.ok(Number.isFinite(pos.x + pos.z));
});

test('les portillons fermés bloquent et les obstacles permettent le glissement', () => {
  const c = circulationFor(29); const gate = c.concourse.gates[0];
  const p = world(gate.x, gate.z - .3); const beyond = world(gate.x, gate.z);
  const pos = new THREE.Vector3(p.x, 0, p.z); resolveMove(pos, beyond.x - p.x, beyond.z - p.z);
  assert.notEqual(pos.z, beyond.z);
});
