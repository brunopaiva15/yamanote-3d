// Mathématiques du tracé côté jeu (src/three/plateau/routeMath.ts).
//
// Le module est écrit sans aucune dépendance : Node 22 peut l'exécuter
// directement (effacement de types natif), sans compilateur ni harnais.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkIndexAt,
  integrateJourney,
  progressToDistance,
  sameSelection,
  sampleRoute,
  selectChunks,
  type PlateauChunkDefinition,
  type RoutePoint,
  type RouteSample,
} from '../src/three/plateau/routeMath.ts';

/** Tracé en L : 100 m vers -Z (nord), puis 100 m vers +X (est). */
const POINTS: RoutePoint[] = [
  { s: 0, x: 0, y: 0, z: 0 },
  { s: 50, x: 0, y: 1, z: -50 },
  { s: 100, x: 0, y: 2, z: -100 },
  { s: 150, x: 50, y: 2, z: -100 },
  { s: 200, x: 100, y: 2, z: -100 },
];

const CHUNKS: PlateauChunkDefinition[] = [
  { id: 'c0', segment: 10, url: 'a', startDistance: 0, endDistance: 400, offset: [0, 0, 0] },
  { id: 'c1', segment: 10, url: 'b', startDistance: 400, endDistance: 800, offset: [0, 0, 0] },
  { id: 'c2', segment: 10, url: 'c', startDistance: 800, endDistance: 1200, offset: [0, 0, 0] },
  { id: 'c3', segment: 10, url: 'd', startDistance: 1200, endDistance: 1500, offset: [0, 0, 0] },
];

const out: RouteSample = { x: 0, y: 0, z: 0, yaw: 0 };

test('progression 0 = début du tronçon, progression 1 = fin', () => {
  const total = 1008.2;
  assert.equal(progressToDistance(0, total), 0);
  assert.equal(progressToDistance(1, total), total);
  assert.equal(progressToDistance(0.5, total), total / 2);
  // Bornage : une progression hors [0,1] ne sort jamais du tronçon.
  assert.equal(progressToDistance(-3, total), 0);
  assert.equal(progressToDistance(9, total), total);

  sampleRoute(POINTS, progressToDistance(0, 200), out);
  assert.deepEqual([out.x, out.y, out.z], [0, 0, 0]);
  sampleRoute(POINTS, progressToDistance(1, 200), out);
  assert.deepEqual([out.x, out.y, out.z], [100, 2, -100]);
});

test('sampleRoute interpole position et altitude', () => {
  sampleRoute(POINTS, 25, out);
  assert.equal(out.x, 0);
  assert.equal(out.y, 0.5);
  assert.equal(out.z, -25);
  sampleRoute(POINTS, 125, out);
  assert.equal(out.x, 25);
  assert.equal(out.y, 2);
  assert.equal(out.z, -100);
});

test('sampleRoute borne aux extrémités au lieu d’extrapoler', () => {
  sampleRoute(POINTS, -500, out);
  assert.deepEqual([out.x, out.z], [0, 0]);
  sampleRoute(POINTS, 5000, out);
  assert.deepEqual([out.x, out.z], [100, -100]);
});

test('le cap envoie bien l’axe avant du train (0,0,-1) sur la tangente', () => {
  // Convention : une rotation de `yaw` autour de +Y envoie (0,0,-1) sur
  // (-sin yaw, 0, -cos yaw).
  const forward = (yaw: number) => [-Math.sin(yaw), -Math.cos(yaw)];

  // Portion vers le nord (-Z) : cap 0.
  sampleRoute(POINTS, 25, out);
  assert.ok(Math.abs(out.yaw) < 1e-12, `yaw=${out.yaw}`);
  let [fx, fz] = forward(out.yaw);
  assert.ok(Math.abs(fx) < 1e-12 && Math.abs(fz + 1) < 1e-12);

  // Portion vers l'est (+X) : cap -π/2.
  sampleRoute(POINTS, 125, out);
  [fx, fz] = forward(out.yaw);
  assert.ok(Math.abs(fx - 1) < 1e-12, `avant.x=${fx}`);
  assert.ok(Math.abs(fz) < 1e-12, `avant.z=${fz}`);
});

test('sampleRoute survit à un tracé dégénéré', () => {
  sampleRoute([], 10, out);
  assert.deepEqual([out.x, out.y, out.z, out.yaw], [0, 0, 0, 0]);
  sampleRoute([{ s: 0, x: 3, y: 4, z: 5 }], 10, out);
  assert.deepEqual([out.x, out.y, out.z], [0, 0, 0]);
});

test('chunkIndexAt : le chunk qui contient l’abscisse', () => {
  assert.equal(chunkIndexAt(CHUNKS, -10), 0);
  assert.equal(chunkIndexAt(CHUNKS, 0), 0);
  assert.equal(chunkIndexAt(CHUNKS, 399.99), 0);
  assert.equal(chunkIndexAt(CHUNKS, 400), 1);
  assert.equal(chunkIndexAt(CHUNKS, 1499), 3);
  assert.equal(chunkIndexAt(CHUNKS, 99999), 3);
  assert.equal(chunkIndexAt([], 5), -1);
});

test('selectChunks : fenêtre glissante bornée, jamais tout le tronçon', () => {
  const opts = { ahead: 1, behind: 1, max: 3 };
  assert.deepEqual(
    selectChunks(CHUNKS, 100, opts).map((c) => c.id),
    ['c0', 'c1'],
  );
  assert.deepEqual(
    selectChunks(CHUNKS, 500, opts).map((c) => c.id),
    ['c0', 'c1', 'c2'],
  );
  assert.deepEqual(
    selectChunks(CHUNKS, 1400, opts).map((c) => c.id),
    ['c2', 'c3'],
  );
  // Le plafond l'emporte sur la fenêtre : on garde les plus proches du train.
  // À s=500 on vient d'entrer dans c1 (100 m après la limite) : le chunk
  // encore le plus proche est celui qu'on quitte, pas celui d'après.
  const justEntered = selectChunks(CHUNKS, 500, { ahead: 3, behind: 3, max: 2 });
  assert.deepEqual(justEntered.map((c) => c.id), ['c0', 'c1']);
  // À s=700, à cent mètres de la limite suivante, la bascule a eu lieu.
  const wide = selectChunks(CHUNKS, 700, { ahead: 3, behind: 3, max: 2 });
  assert.equal(wide.length, 2);
  assert.deepEqual(wide.map((c) => c.id), ['c1', 'c2']);
  // Toujours rendus dans l'ordre du tracé.
  for (let i = 1; i < wide.length; i++) {
    assert.ok(wide[i].startDistance > wide[i - 1].startDistance);
  }
  assert.deepEqual(selectChunks([], 0, opts), []);
});

test('sameSelection évite les re-rendus inutiles', () => {
  const a = selectChunks(CHUNKS, 500, { ahead: 1, behind: 1, max: 3 });
  const b = selectChunks(CHUNKS, 520, { ahead: 1, behind: 1, max: 3 });
  assert.ok(sameSelection(a, b));
  const c = selectChunks(CHUNKS, 900, { ahead: 1, behind: 1, max: 3 });
  assert.ok(!sameSelection(a, c));
  assert.ok(!sameSelection(a, a.slice(1)));
});

test('integrateJourney : profil injecté, distance monotone', () => {
  // Profil trivial : vitesse égale à la cible, sans inertie.
  const profile = {
    step: (state: { v: number; a: number; d: number }, target: number, dt: number) => {
      state.v = target;
      state.d += state.v * dt;
    },
    targetAt: (t: number) => (t < 10 ? 0 : 20),
  };
  assert.equal(integrateJourney(profile, 0), 0);
  assert.equal(integrateJourney(profile, -5), 0);
  // 10 s à l'arrêt puis 10 s à 20 m/s ⇒ 200 m.
  assert.ok(Math.abs(integrateJourney(profile, 20, 0.01) - 200) < 1);
  // Monotone.
  let previous = 0;
  for (let t = 0; t <= 30; t += 5) {
    const d = integrateJourney(profile, t, 0.01);
    assert.ok(d >= previous, `distance non monotone en t=${t}`);
    previous = d;
  }
});
