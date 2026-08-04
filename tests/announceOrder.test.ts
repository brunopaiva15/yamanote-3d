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

test('plus aucun tronçon n’a besoin de la borne', () => {
  // Le tronçon qui posait problème était Mejiro ↔ Takadanobaba : une minute
  // d'intervalle posée à la main sur 0,9 km, donc 8 s de croisière - le plancher
  // de cruiseDuration - et une approche qui partait à −12 s, c'est-à-dire tout
  // de suite. Depuis que l'horaire se déduit des distances réelles, la croisière
  // la plus courte de la boucle est celle du plus court tronçon, Nippori ↔
  // Nishi-Nippori (0,5 km), et elle laisse largement les 20 s d'avance.
  let shortest = Infinity;
  for (let i = 0; i < STATIONS.length; i++) {
    for (const dir of DIRECTIONS) shortest = Math.min(shortest, cruiseDuration(i, dir));
  }
  assert.ok(shortest > APPROACH_ANNOUNCE_LEAD + 1, `croisière la plus courte : ${shortest} s`);

  // La borne reste vraie sur une croisière trop courte - elle n'est plus
  // atteinte, elle n'a pas disparu.
  assert.ok(approachAnnounceAt(8) > DEPART_ANNOUNCE_AT);
});

test('la croisière la plus courte est celle du plus court tronçon', () => {
  const nippori = STATIONS.findIndex((s) => s.romaji === 'Nippori');
  const nishi = STATIONS.findIndex((s) => s.romaji === 'Nishi-Nippori');
  const here = Math.min(cruiseDuration(nishi, 'inner'), cruiseDuration(nippori, 'outer'));
  for (let i = 0; i < STATIONS.length; i++) {
    for (const dir of DIRECTIONS) {
      assert.ok(cruiseDuration(i, dir) >= here - 1e-9, `${STATIONS[i].romaji} ${dir}`);
    }
  }
});

test('la borne est monotone : un tronçon plus long n’annonce jamais plus tôt', () => {
  let prev = -Infinity;
  for (let cruise = 0; cruise <= 200; cruise += 0.5) {
    const at = approachAnnounceAt(cruise);
    assert.ok(at >= prev - 1e-9, `recul à ${cruise} s`);
    prev = at;
  }
});
