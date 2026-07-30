// L'ordre des deux annonces de bord (src/data/segments.ts).
//
// La rame en dit deux par tronçon, sur la MÊME file (systems/speech, canal
// « cabin ») : 「次は、高田馬場」 quand elle s'ébranle, puis 「まもなく高田馬場」
// quand elle approche. La file étant sérielle, l'ordre des mises en file EST
// l'ordre d'écoute - et une annonce d'approche mise en file la première annonce
// l'arrivée avant le départ.
//
// C'est exactement ce qui se passait entre Mejiro et Takadanobaba : une minute
// d'intervalle, 8 s de croisière après retrait du forfait d'arrêt, et
// `cruiseSec − 20` qui vaut −12. La condition de l'approche était vraie dès la
// première image. Ce test parcourt les soixante couples (gare × sens) pour que
// le cas ne puisse revenir par aucun autre tronçon.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROACH_ANNOUNCE_LEAD,
  DEPART_ANNOUNCE_AT,
  approachAnnounceAt,
  cruiseDuration,
} from '../src/data/segments.ts';
import { STATIONS } from '../src/data/stations.ts';
import type { LoopDirection } from '../src/data/platforms.ts';

const DIRECTIONS: LoopDirection[] = ['inner', 'outer'];

test('l’annonce d’approche ne passe jamais devant celle de départ', () => {
  const inverted: string[] = [];
  for (let i = 0; i < STATIONS.length; i++) {
    for (const dir of DIRECTIONS) {
      const at = approachAnnounceAt(cruiseDuration(i, dir));
      if (at <= DEPART_ANNOUNCE_AT) inverted.push(`${STATIONS[i].romaji} (${dir}) : ${at} s`);
    }
  }
  assert.deepEqual(inverted, []);
});

test('sur les tronçons ordinaires, l’avance reste celle qui est réglée', () => {
  // La borne ne doit pas s'appliquer là où il n'y en a pas besoin : partout où
  // la croisière est assez longue, l'annonce part bien 20 s avant la fin.
  const cruise = cruiseDuration(0, 'inner');
  assert.ok(cruise > APPROACH_ANNOUNCE_LEAD + 1, 'Tokyo→Kanda est un tronçon long');
  assert.equal(approachAnnounceAt(cruise), cruise - APPROACH_ANNOUNCE_LEAD);
});

test('le tronçon le plus court de la boucle est bien celui qui posait problème', () => {
  // Mejiro ↔ Takadanobaba : 8 s de croisière, le plancher de cruiseDuration.
  // Sans la borne, l'approche partait à −12 s, donc immédiatement.
  const mejiro = STATIONS.findIndex((s) => s.romaji === 'Mejiro');
  const baba = STATIONS.findIndex((s) => s.romaji === 'Takadanobaba');
  const shortest = Math.min(cruiseDuration(mejiro, 'outer'), cruiseDuration(baba, 'inner'));
  assert.equal(shortest, 8);
  assert.ok(shortest - APPROACH_ANNOUNCE_LEAD < 0, 'l’avance dépasse la croisière');
  assert.ok(approachAnnounceAt(shortest) > DEPART_ANNOUNCE_AT);
});

test('la borne est monotone : un tronçon plus long n’annonce jamais plus tôt', () => {
  let prev = -Infinity;
  for (let cruise = 0; cruise <= 200; cruise += 0.5) {
    const at = approachAnnounceAt(cruise);
    assert.ok(at >= prev - 1e-9, `recul à ${cruise} s`);
    prev = at;
  }
});
