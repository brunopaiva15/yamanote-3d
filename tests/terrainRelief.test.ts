// Le relief relatif doit rester calé quand la voie monte sous le train.
//
// Bug reproduit près de Nippori : les cellules de l'anneau figeaient
// `cityRelief` (= sol − cote_voie) au moment de leur écriture, tandis que la
// nappe de rue recalculait la même différence à chaque image. Dès que
// `trackAt` changeait de quelques mètres, les immeubles et les arbres
// flottaient au-dessus du bitume.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cityGround,
  cityRelief,
  setTerrainEnabled,
  trackAt,
  trackElevation,
  updateTerrain,
} from '../src/systems/terrain.ts';
import { LOOP_PERIMETER, STATION_S } from '../src/systems/tokyoBearing.ts';

const NIPPORI = 6;
const NISHI = 7;

function anchorAt(index: number, step: 1 | -1) {
  const to = (index + step + 30) % 30;
  let span = STATION_S[to] - STATION_S[index];
  if (step > 0 && span < 0) span += LOOP_PERIMETER;
  if (step < 0 && span > 0) span -= LOOP_PERIMETER;
  span = Math.abs(span) || 1000;
  return { s: 10_000, index, span, step };
}

test('cityGround est stable quand la voie change sous le train', () => {
  setTerrainEnabled(true);
  const a = anchorAt(NISHI, -1); // 外回り : Nishi-Nippori → Nippori
  const worldBuilding = a.s + 180; // cellule écrite ~180 m devant

  updateTerrain(a.s, a);
  const g0 = cityGround(worldBuilding, 40, 1);
  const y0 = trackElevation();
  const stale = cityRelief(worldBuilding, 40, 1);

  // On avance vers Nippori : la cote de voie change (falaise / plateau).
  updateTerrain(a.s + a.span * 0.85, a);
  const g1 = cityGround(worldBuilding, 40, 1);
  const y1 = trackElevation();
  const live = cityRelief(worldBuilding, 40, 1);

  assert.ok(Math.abs(y1 - y0) > 1.5, `voie trop plate pour le test (${y0} → ${y1})`);
  assert.equal(g0, g1, 'le pied orthométrique ne doit pas bouger');
  // Un pied figé en `cityRelief` divergerait de la rue live de Δvoie.
  assert.ok(Math.abs(stale - live) > 1, `écart trop faible (${stale} vs ${live})`);
  assert.ok(Math.abs(stale - live - (y1 - y0)) < 1e-6);
});

test('cityRelief suit la cote de voie à chaque image', () => {
  setTerrainEnabled(true);
  const a = anchorAt(NIPPORI, 1);
  updateTerrain(a.s, a);
  const r0 = cityRelief(a.s + 50, 80, -1);
  const t0 = trackElevation();
  updateTerrain(a.s + 200, a);
  const r1 = cityRelief(a.s + 50, 80, -1);
  const t1 = trackElevation();
  // sol_abs constant ⇒ relief_live change de −Δvoie
  assert.ok(Math.abs(r1 - r0 + (t1 - t0)) < 0.05);
});

test('trackAt Nippori ≠ Nishi-Nippori (le scénario du flottement)', () => {
  const dn = Math.abs(trackAt(STATION_S[NIPPORI]) - trackAt(STATION_S[NISHI]));
  assert.ok(dn > 2, `dénivelé Nippori/Nishi trop faible (${dn})`);
});
