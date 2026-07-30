import test from 'node:test';
import assert from 'node:assert/strict';
import { speechPlaybackRate } from '../src/systems/speechTuning.ts';

test('la voix féminine ATOS du quai est abaissée', () => {
  assert.equal(speechPlaybackRate('atos-inner'), 0.94);
});

test('les autres voix gardent leur hauteur originale', () => {
  assert.equal(speechPlaybackRate('atos-outer'), 1);
  assert.equal(speechPlaybackRate('agent'), 1);
  assert.equal(speechPlaybackRate('atos-en'), 1);
  assert.equal(speechPlaybackRate(), 1);
});
