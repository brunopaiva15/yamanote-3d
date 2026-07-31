import assert from 'node:assert/strict';
import test from 'node:test';
import { STATION_CIRCULATION } from '../src/data/stationCirculation.ts';

test('les 30 graphes de circulation sont complets et sans identifiants dupliqués', () => {
  assert.equal(STATION_CIRCULATION.length, 30);
  assert.equal(new Set(STATION_CIRCULATION.map((c) => c.stationCode)).size, 30);
  for (const c of STATION_CIRCULATION) {
    assert.ok(c.accesses.length > 0);
    const levels = new Set(c.concourse.levels);
    const ids = [...c.accesses.map((a) => a.id), ...c.concourse.surfaces.map((s) => s.id), ...c.concourse.gates.map((g) => g.id), ...c.concourse.exits.map((e) => e.id)];
    assert.equal(new Set(ids).size, ids.length, c.stationCode);
    for (const a of c.accesses) {
      assert.ok(levels.has(a.fromLevel) && levels.has(a.toLevel));
      assert.ok(a.width > 0 && a.deltaY !== 0);
      assert.ok(c.concourse.surfaces.some((s) => s.level === a.fromLevel));
      assert.ok(c.concourse.surfaces.some((s) => s.level === a.toLevel));
    }
    for (const e of c.concourse.exits) assert.ok(levels.has(e.level));
  }
});
