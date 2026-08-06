// Les singularités de la ligne : ce qui n'arrive qu'une fois sur la boucle.
//
// Ce qui est vérifié ici n'est pas un rendu mais des FAITS et leur arithmétique :
// il n'y a qu'un passage à niveau sur la Yamanote, une fraction de tronçon se
// retourne avec le sens de marche, et une rivière laisse un vide dans le tissu
// urbain - littéralement, aucun bâtiment engendré.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEGMENTS, SEGMENT_KM, cruiseDuration, segmentAt } from '../src/data/segments.ts';
import { journeyDistance } from '../src/systems/trainPhysics.ts';
import { CELL_LEN, buildCell, clearing, makeCellBuffer } from '../src/systems/cityField.ts';
import { expressway, singularity, singularityOffset, updateSingularity } from '../src/systems/singularity.ts';

/** Gare d'arrivée qui fait parcourir le tronçon `seg` en 内回り. */
const arrivalFor = (seg: number) => (seg + 1) % 30;

test('un seul passage à niveau, trois rivières, trois tronçons longés', () => {
  const crossings = SEGMENTS.filter((s) => s.crossing !== undefined);
  const rivers = SEGMENTS.filter((s) => s.river !== undefined);
  const roads = SEGMENTS.filter((s) => s.expressway);
  // Le 第二中里踏切 est le seul de toute la boucle, et c'est ce fait-là qui le
  // rend intéressant : une ligne à cent-vingt secondes d'intervalle ne peut pas
  // s'offrir des barrières.
  assert.equal(crossings.length, 1);
  assert.equal(SEGMENTS.indexOf(crossings[0]), 8, 'Tabata→Komagome');
  assert.equal(rivers.length, 3);
  assert.equal(roads.length, 3);
  // Une singularité ponctuelle à la fois : le rendu n'en pose qu'une, et deux
  // drapeaux sur le même tronçon feraient disparaître le second sans un mot.
  for (const s of SEGMENTS) {
    assert.ok(
      !(s.crossing !== undefined && s.river !== undefined),
      'aucun tronçon ne porte deux singularités ponctuelles',
    );
  }
  // Les fractions restent dans le tronçon, et à distance de ses deux gares :
  // une rivière posée sur un quai serait invisible.
  for (const s of SEGMENTS) {
    for (const f of [s.crossing, s.river]) {
      if (f === undefined) continue;
      assert.ok(f > 0.1 && f < 0.9, `fraction plausible : ${f}`);
    }
  }
});

test('la longueur simulée d’un tronçon suit son barème kilométrique', () => {
  // Le monde du jeu est plus grand que Tokyo - la rame tient 90 km/h toute la
  // croisière là où la vraie moyenne 34 km/h - mais il l'est PROPORTIONNELLEMENT :
  // le tronçon le plus long du barème reste le plus long à parcourir.
  const measured = SEGMENTS.map((_, seg) => journeyDistance(cruiseDuration(arrivalFor(seg), 'inner')));
  const order = SEGMENTS.map((_, seg) => seg).sort((a, b) => SEGMENT_KM[a] - SEGMENT_KM[b]);
  for (let i = 1; i < order.length; i++) {
    const [prev, here] = [order[i - 1], order[i]];
    if (SEGMENT_KM[prev] === SEGMENT_KM[here]) continue;
    assert.ok(measured[prev] < measured[here], `${prev} avant ${here}`);
  }
  // Et aucun tronçon ne descend sous les quatre cents mètres, plancher au-dessous
  // duquel l'anneau urbain ne saurait plus mesurer son inter-gare.
  for (const d of measured) assert.ok(d > 400 && d < 4000, `longueur plausible : ${d}`);
});

test('la fraction se retourne avec le sens de marche', () => {
  // Le tronçon 08 est nommé Tabata→Komagome : son passage à niveau tombe aux
  // 68 % depuis Tabata, donc aux 32 % quand on vient de Komagome. Les deux
  // mesures doivent tomber sur le MÊME point du monde, à un mètre près.
  const inner = singularityOffset(arrivalFor(8), 'inner');
  const outer = singularityOffset(8, 'outer');
  assert.ok(inner && outer);
  assert.equal(inner.kind, 'crossing');
  assert.equal(outer.kind, 'crossing');
  assert.equal(segmentAt(8, 'outer'), 8);
  assert.ok(Math.abs(inner.at + outer.at - inner.length) < 1);
  assert.ok(inner.at > outer.at, 'les deux tiers, pas le tiers');
});

test('un tronçon sans singularité n’en invente pas', () => {
  // Tokyo→Kanda ne porte rien : ni rivière, ni barrières, ni tablier.
  assert.equal(singularityOffset(arrivalFor(0), 'inner'), null);
  updateSingularity(arrivalFor(0), 'inner');
  assert.equal(singularity.kind, null);
  assert.equal(clearing.half, 0);
  assert.equal(expressway.on, false);
});

test('aucun bâtiment ne se construit sur la rivière', () => {
  // La Shibuya, au sud de Shibuya (tronçon 19).
  updateSingularity(arrivalFor(19), 'inner');
  assert.equal(singularity.kind, 'river');
  assert.ok(clearing.half >= 12, 'la trouée laisse passer la nappe entière');
  // L'ouvrage est bien allé se poser sur une rue, pas au milieu d'un îlot :
  // l'écart à l'abscisse théorique reste sous une cellule et demie.
  const wanted = singularityOffset(arrivalFor(19), 'inner');
  assert.ok(wanted);
  assert.ok(Math.abs(singularity.s - wanted.at) < CELL_LEN * 1.5);

  const buf = makeCellBuffer();
  const first = Math.floor((clearing.s - clearing.half) / CELL_LEN) - 1;
  const last = Math.floor((clearing.s + clearing.half) / CELL_LEN) + 1;
  let seen = 0;
  for (let cell = first; cell <= last; cell++) {
    for (const side of [1, -1] as const) {
      const n = buildCell(cell, side, buf);
      for (let i = 0; i < n; i++) {
        const b = buf[i];
        seen++;
        // L'emprise vue du sujet : sa longueur tournée dans la trame.
        const half =
          (b.w * Math.abs(Math.cos(b.yaw)) + b.d * Math.abs(Math.sin(b.yaw))) / 2;
        const clear =
          b.s + half <= clearing.s - clearing.half || b.s - half >= clearing.s + clearing.half;
        assert.ok(clear, `bâtiment dans l'eau en ${b.s.toFixed(1)} (cellule ${cell})`);
      }
    }
  }
  // Garde-fou : si le générateur ne rendait plus rien du tout, l'assertion
  // ci-dessus passerait sans avoir rien vérifié.
  assert.ok(seen > 20, `des bâtiments ont bien été engendrés autour (${seen})`);
});

test('le tablier de l’autoroute s’arrête à distance des gares', () => {
  // Okachimachi→Ueno (tronçon 03) : la ligne 1 du 首都高 au-dessus du 昭和通り.
  updateSingularity(arrivalFor(3), 'inner');
  assert.equal(expressway.on, true);
  const length = journeyDistance(cruiseDuration(arrivalFor(3), 'inner'));
  assert.ok(expressway.s1 > expressway.s0, 'le tablier a une longueur');
  assert.ok(expressway.s0 > 0, 'il commence après la gare quittée');
  assert.ok(length - expressway.s1 > 40, 'il finit avant la suivante');
  // Le côté est haché du tronçon : deux passages y trouvent le même côté.
  const side = expressway.side;
  updateSingularity(arrivalFor(3), 'inner');
  assert.equal(expressway.side, side);
});
