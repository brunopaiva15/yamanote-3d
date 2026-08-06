// Le kilométrage de la bible tombe-t-il là où la bible dit ?
//
// Le document titre chacun de ses trente-six points kilométriques par un lieu :
// « KM 00.0 — SHINAGAWA », « KM 07.0 — SHIBUYA », « KM 24.0 — UENO ». Ce sont
// des affirmations vérifiables, et c'est la meilleure façon de contrôler qu'on
// a bien lu ses trois conventions - origine à Shinagawa, sens des index JY
// décroissants, kilométrage suivi le long de la voie.
//
// Une erreur de sens ferait tomber le KM 7 à Uguisudani au lieu de Shibuya ; une
// origine à Tokyo, à Takadanobaba. Aucune ne passerait ce fichier.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bandOf,
  BANDS,
  bibleKmOf,
  BIBLE_KM_POSTS,
  bibleKmPoint,
  nearestStation,
  sOfBibleKm,
} from '../src/systems/kmPost.ts';
import { LOOP_PERIMETER } from '../src/systems/tokyoBearing.ts';
import { GEO_STATIONS } from '../src/data/tokyoGeo.ts';

test('trente-six points kilométriques, de 0 à 34,5', () => {
  assert.equal(BIBLE_KM_POSTS.length, 36);
  assert.equal(BIBLE_KM_POSTS[0], 0);
  assert.equal(BIBLE_KM_POSTS[34], 34);
  assert.equal(BIBLE_KM_POSTS[35], 34.5);
});

test('le KM 0 est Shinagawa, et le KM 34,5 y revient', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 0 };
  bibleKmPoint(0, a);
  bibleKmPoint(34.5, b);
  const shinagawa = GEO_STATIONS[24];
  assert.equal(shinagawa.name, 'Shinagawa');
  assert.ok(Math.hypot(a.x - shinagawa.x, a.z - shinagawa.z) < 1, 'KM 0 hors du quai de Shinagawa');
  // Le KM 34,5 de la bible est le barème JR ; la polyligne relevée est un peu
  // plus courte. L'écart de bouclage est donc de l'ordre de la centaine de
  // mètres, et c'est exactement ce qu'il doit être.
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(gap < 200, `bouclage à ${Math.round(gap)} m`);
});

test('chaque titre de la bible tombe sur le lieu qu’il nomme', () => {
  // Point kilométrique, gare attendue, distance maximale (m). Les titres qui
  // nomment un quartier plutôt qu'une gare - « GOTENYAMA », « JINGŪMAE » - sont
  // rattachés à la gare dont ils relèvent, avec une tolérance à la mesure du
  // lieu ; ceux qui nomment une gare sont serrés.
  const cases: [number, string, number][] = [
    [0, 'Shinagawa', 60],
    [2, 'Osaki', 260],
    [3, 'Gotanda', 260],
    [4, 'Meguro', 260],
    [6, 'Ebisu', 400],
    [7, 'Shibuya', 300],
    [9, 'Harajuku', 700],
    [11, 'Shinjuku', 500],
    [12, 'Shin-Okubo', 500],
    [13, 'Takadanobaba', 400],
    [14, 'Mejiro', 400],
    [16, 'Ikebukuro', 700],
    [17, 'Otsuka', 400],
    [18, 'Sugamo', 400],
    [19, 'Komagome', 400],
    [21, 'Nishi-Nippori', 500],
    [22, 'Nippori', 400],
    [23, 'Uguisudani', 500],
    [24, 'Ueno', 400],
    [25, 'Okachimachi', 400],
    [26, 'Akihabara', 600],
    [28, 'Tokyo', 500],
    [30, 'Shimbashi', 500],
    [31, 'Hamamatsucho', 500],
    [32, 'Tamachi', 500],
    [34, 'Shinagawa', 800],
  ];
  const p = { x: 0, z: 0 };
  for (const [km, name, tol] of cases) {
    bibleKmPoint(km, p);
    const st = GEO_STATIONS.find((s) => s.name === name)!;
    const d = Math.hypot(p.x - st.x, p.z - st.z);
    assert.ok(d < tol, `KM ${km} devrait être ${name} : ${Math.round(d)} m (toléré ${tol})`);
  }
});

test('le sens de la bible est bien l’inverse des index JY', () => {
  // Shinagawa (24) → Ōsaki (23) → Shibuya (19) : les index décroissent.
  const seen = [0, 2, 7, 11, 16, 24, 28].map((km) => nearestStation(km).index);
  assert.deepEqual(seen, [24, 23, 19, 16, 12, 4, 0]);
});

test('kilomètre et abscisse sont réciproques', () => {
  for (let km = 0; km < 34.5; km += 0.37) {
    const back = bibleKmOf(sOfBibleKm(km));
    assert.ok(Math.abs(back - km) < 1e-6, `${km} → ${back}`);
  }
  // Un tour de polyligne fait bien un tour de bible.
  assert.ok(Math.abs(bibleKmOf(sOfBibleKm(0) - LOOP_PERIMETER) - 0) < 1e-6);
});

test('les cinq bandes de rayon classent une distance', () => {
  assert.deepEqual([...BANDS], [1000, 5000, 10000, 20000, 50000]);
  assert.equal(bandOf(0), 0);
  assert.equal(bandOf(999), 0);
  assert.equal(bandOf(1000), 0);
  assert.equal(bandOf(1001), 1);
  assert.equal(bandOf(9000), 2);
  assert.equal(bandOf(19000), 3);
  assert.equal(bandOf(49000), 4);
  // La bible exclut explicitement le Fuji et Narita du rayon de cinquante
  // kilomètres : au-delà, il n'y a plus de consigne de détail.
  assert.equal(bandOf(94000), -1);
});
