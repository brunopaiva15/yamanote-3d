// L'arithmétique de la boucle, dans les deux sens.
//
// Ce sont les invariants dont tout le reste dépend : le cycle station avance
// l'index avec `nextStation`, l'environnement traversé sort de `segmentAt`, les
// annonces et la signalétique de `stationAtHop`. Une erreur de signe ici ne se
// verrait pas en TypeScript et se lirait, en jeu, comme une gare sautée ou un
// viaduc à la place d'une tranchée.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATION_COUNT,
  hopsBetween,
  loopNameJp,
  nextStation,
  oppositeDirection,
  prevStation,
  stationAtHop,
  wrapStation,
} from '../src/data/loop.ts';
import {
  LOOP_KM,
  LOOP_MINUTES,
  SEGMENTS,
  SEGMENT_HEADWAY_SEC,
  SEGMENT_KM,
  segmentAt,
  segmentForHop,
} from '../src/data/segments.ts';
import type { LoopDirection } from '../src/data/platforms.ts';

const DIRECTIONS: LoopDirection[] = ['inner', 'outer'];

test('les trente gares se referment sur elles-mêmes, dans les deux sens', () => {
  for (const dir of DIRECTIONS) {
    for (let start = 0; start < STATION_COUNT; start++) {
      const seen = new Set<number>();
      let i = start;
      for (let k = 0; k < STATION_COUNT; k++) {
        assert.ok(!seen.has(i), `gare ${i} visitée deux fois en ${dir}`);
        seen.add(i);
        i = nextStation(i, dir);
      }
      assert.equal(i, start, `la boucle ${dir} ne revient pas à son départ`);
      assert.equal(seen.size, STATION_COUNT);
    }
  }
});

test('les deux sens sont exactement l’inverse l’un de l’autre', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.equal(nextStation(i, 'inner'), prevStation(i, 'outer'));
    assert.equal(nextStation(i, 'outer'), prevStation(i, 'inner'));
    assert.equal(oppositeDirection(oppositeDirection('inner')), 'inner');
  }
});

test('内回り suit l’ordre des codes JY, 外回り le remonte', () => {
  assert.equal(nextStation(0, 'inner'), 1); // 東京 → 神田
  assert.equal(nextStation(0, 'outer'), 29); // 東京 → 有楽町
  assert.equal(stationAtHop(0, 4, 'inner'), 4); // 東京 → 上野
  assert.equal(stationAtHop(0, 5, 'outer'), 25); // 東京 → 品川
});

test('stationAtHop et hopsBetween sont réciproques', () => {
  for (const dir of DIRECTIONS) {
    for (let from = 0; from < STATION_COUNT; from++) {
      for (let hops = 0; hops < STATION_COUNT; hops++) {
        assert.equal(hopsBetween(from, stationAtHop(from, hops, dir), dir), hops);
      }
    }
  }
});

test('wrapStation replie les index négatifs comme les débordements', () => {
  assert.equal(wrapStation(-1), 29);
  assert.equal(wrapStation(-31), 29);
  assert.equal(wrapStation(30), 0);
  assert.equal(wrapStation(61), 1);
});

// --- Tronçons ------------------------------------------------------------

test('le tronçon d’arrivée relie bien la gare quittée à celle qu’on atteint', () => {
  // Un tronçon `s` est nommé STATIONS[s] ↔ STATIONS[s+1] : arriver à `i` doit
  // donner le tronçon dont les deux extrémités sont `prev(i)` et `i`.
  for (const dir of DIRECTIONS) {
    for (let i = 0; i < STATION_COUNT; i++) {
      const seg = segmentAt(i, dir);
      const ends = [seg, wrapStation(seg + 1)];
      assert.ok(ends.includes(i), `le tronçon ${seg} ne touche pas la gare ${i} (${dir})`);
      assert.ok(
        ends.includes(prevStation(i, dir)),
        `le tronçon ${seg} ne touche pas la gare quittée (${dir})`,
      );
    }
  }
});

test('内回り et 外回り empruntent les MÊMES trente tronçons', () => {
  // Le décor n'est pas dupliqué : le viaduc de Shibuya→Ebisu est le même dans
  // les deux sens, seul le sens de parcours change.
  for (const dir of DIRECTIONS) {
    const segs = new Set<number>();
    for (let i = 0; i < STATION_COUNT; i++) segs.add(segmentAt(i, dir));
    assert.equal(segs.size, SEGMENTS.length);
  }
});

test('segmentForHop enchaîne les tronçons dans l’ordre de marche', () => {
  for (const dir of DIRECTIONS) {
    for (let from = 0; from < STATION_COUNT; from++) {
      assert.equal(segmentForHop(from, dir), segmentAt(nextStation(from, dir), dir));
    }
  }
});

test('un croisement n’est marqué que là où il peut s’afficher', () => {
  // `passing` est une consigne de rendu : three/SegmentEnvironment place la
  // rame croisée à 6 m de l'axe, ce qui tient en corridor et en plein sol
  // (clôture à 6,2 m) mais pas en tranchée (murs à 6,6 m) ni sur viaduc (joues
  // à 5,1 m). Un croisement marqué ailleurs ne s'afficherait jamais, et la
  // table se lirait comme un fait acquis.
  const misplaced = SEGMENTS.map((s, i) => ({ s, i })).filter(
    ({ s }) => s.passing && s.kind !== 'corridor' && s.kind !== 'ground',
  );
  assert.deepEqual(misplaced.map(({ i }) => i), []);
});

test('le 山手貨物線 double la rame partout où on peut le voir', () => {
  // Il longe la Yamanote de Komagome à Shinagawa via Shinjuku. Tabata ↔
  // Komagome fait exception : le 貨物線 y passe par le tunnel de Nakazato, donc
  // par un autre chemin. Partout ailleurs sur cet arc, un tronçon à ciel ouvert
  // doit montrer une circulation parallèle.
  const bare: number[] = [];
  for (let i = 9; i <= 23; i++) {
    const s = SEGMENTS[i];
    if ((s.kind === 'corridor' || s.kind === 'ground') && !s.passing) bare.push(i);
  }
  assert.deepEqual(bare, []);
});

test('le barème kilométrique est celui de la ligne', () => {
  // 34,5 km pour trente tronçons, soit 1,15 km de moyenne entre deux gares :
  // les deux chiffres que publie JR East. Si l'un des trente bouge, la somme le
  // dit tout de suite - c'est le seul garde-fou possible sur une table relevée.
  const total = SEGMENT_KM.reduce((a, b) => a + b, 0);
  assert.equal(SEGMENT_KM.length, STATION_COUNT);
  assert.ok(Math.abs(total - LOOP_KM) < 1e-9, `${total} km`);
  assert.ok(Math.abs(total / STATION_COUNT - 1.15) < 1e-9, 'distance moyenne');

  // Le plus court tronçon de la boucle est Nippori→Nishi-Nippori, et le plus
  // long Ōsaki→Shinagawa. C'était l'inverse du relevé précédent, qui donnait sa
  // minute unique - la plus courte de la table - à Mejiro→Takadanobaba.
  const shortest = SEGMENT_KM.indexOf(Math.min(...SEGMENT_KM));
  const longest = SEGMENT_KM.indexOf(Math.max(...SEGMENT_KM));
  assert.equal(shortest, 6, 'Nippori→Nishi-Nippori');
  assert.equal(longest, 23, 'Ōsaki→Shinagawa');
});

test('la boucle dure le même temps dans les deux sens, et c’est 64 min', () => {
  // Les intervalles sont donnés par tronçon, pas par sens : trente tronçons
  // parcourus une fois font le même tour à l'endroit qu'à l'envers. C'est ce
  // qui garantit qu'aucun sens ne « saute » un tronçon.
  const total = (dir: LoopDirection) => {
    let sum = 0;
    let i = 0;
    for (let k = 0; k < STATION_COUNT; k++) {
      sum += SEGMENT_HEADWAY_SEC[segmentForHop(i, dir)];
      i = nextStation(i, dir);
    }
    return sum;
  };
  assert.ok(Math.abs(total('inner') - total('outer')) < 1e-9);
  // Le tour standard de JR East, dans les deux sens. Il valait 67 min tant que
  // les intervalles étaient des minutes entières relevées à la main.
  assert.ok(Math.abs(total('inner') / 60 - LOOP_MINUTES) < 1e-9, `${total('inner') / 60} min`);
});

test('le nom parlé de la ligne porte le sens', () => {
  assert.equal(loopNameJp('inner'), '山手線内回り');
  assert.equal(loopNameJp('outer'), '山手線外回り');
});
