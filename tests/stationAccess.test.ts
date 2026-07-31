import assert from 'node:assert/strict';
import test from 'node:test';
import { circulationFor } from '../src/data/stationCirculation.ts';
import { layoutFor } from '../src/data/stationLayouts.ts';
import { platformProfileFor } from '../src/data/platforms.ts';

test('les quatre pilotes couvrent descente, montée, mixte et asymétrie', () => {
  assert.ok(circulationFor(29).accesses.some((a) => a.deltaY < 0));
  assert.ok(circulationFor(13).accesses.some((a) => a.deltaY > 0));
  assert.ok(circulationFor(4).accesses.some((a) => a.deltaY < 0) && circulationFor(4).accesses.some((a) => a.deltaY > 0));
  assert.equal(layoutFor(17).config, 'special');
});

test('les cas de quai non génériques restent explicites', () => {
  assert.equal(layoutFor(16).config, 'special');
  assert.equal(layoutFor(18).config, 'side');
  for (const code of ['JY13', 'JY24']) for (const d of ['inner', 'outer'] as const) assert.notEqual(platformProfileFor(code, d).platform, platformProfileFor(code, d, { alternative: true }).platform);
});
