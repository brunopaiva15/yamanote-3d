// 「ホームドアにあるウグイス色のラインは、誤乗防止のため内回りと外回りで表記が異なり、
// 内回り側は単線、外回り側は二重線である」.
//
// Le liseré n'est pas une frise : c'est le seul repère de sens qu'on ait sous
// les yeux au moment de franchir la porte. Ce test tient les trois choses qui
// le rendent lisible - le bon dessin pour le bon sens, la même enveloppe des
// deux côtés, et deux traits bien séparés.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PSD_BAND_DY,
  PSD_BAND_H,
  oppositePsdBandStyle,
  psdBandRows,
  psdBandStyleFor,
} from '../src/three/station/psdBand.ts';
import type { LoopDirection } from '../src/data/platforms.ts';

const DIRECTIONS: LoopDirection[] = ['inner', 'outer'];

test('内回り porte le trait simple, 外回り le trait double', () => {
  assert.equal(psdBandStyleFor('inner'), 'single');
  assert.equal(psdBandStyleFor('outer'), 'double');
  assert.equal(psdBandRows('single').length, 1);
  assert.equal(psdBandRows('double').length, 2);
});

test('les deux bords d’un îlot ne portent jamais le même dessin', () => {
  // C'est tout l'intérêt de la règle : sur un îlot Yamanote, les deux sens se
  // font face à deux mètres, et c'est le liseré qui les distingue.
  for (const dir of DIRECTIONS) {
    const here = psdBandStyleFor(dir);
    assert.notEqual(oppositePsdBandStyle(here), here);
    assert.equal(oppositePsdBandStyle(oppositePsdBandStyle(here)), here);
  }
});

test('simple et double occupent exactement la même enveloppe', () => {
  // Le double n'est ni plus haut ni plus bas que le simple : sinon le liseré
  // sauterait d'un quai à l'autre au lieu de changer de dessin.
  const envelope = (style: 'single' | 'double') => {
    const rows = psdBandRows(style);
    return {
      top: Math.max(...rows.map((r) => r.dy + r.h / 2)),
      bottom: Math.min(...rows.map((r) => r.dy - r.h / 2)),
    };
  };
  const single = envelope('single');
  const double = envelope('double');
  assert.ok(Math.abs(single.top - double.top) < 1e-9, 'arête haute');
  assert.ok(Math.abs(single.bottom - double.bottom) < 1e-9, 'arête basse');
  assert.ok(Math.abs(single.top - (PSD_BAND_DY + PSD_BAND_H / 2)) < 1e-9);
});

test('les deux traits du double sont séparés d’au moins deux centimètres', () => {
  // Sous l'auvent, à deux mètres, deux traits collés se lisent comme un seul.
  const [top, bottom] = psdBandRows('double');
  const gap = top.dy - top.h / 2 - (bottom.dy + bottom.h / 2);
  assert.ok(gap >= 0.02, `écart de ${gap} m`);
  assert.ok(top.h > 0 && bottom.h > 0);
});
