// L'eau relevée sur OpenStreetMap : ce qu'elle affirme, et ce qu'elle refuse.
//
// Le sujet de ce fichier n'est pas un rendu mais l'HONNÊTETÉ du relevé. Une
// rivière de plus ou de moins ne se voit pas à l'œil sur une capture ; une
// rivière qui n'existe pas se voit sur une carte, et c'est exactement ce que
// le décor portait avant cette passe - une traversée de la 渋谷川 entre Shibuya
// et Ebisu, là où la rivière longe la voie sans jamais la couper.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SHORE_REACH,
  WATER_COLS,
  WATER_CROSSINGS,
  WATER_LOOP_M,
  WATER_REACH,
  WATER_ROWS,
  WATER_S_STEP,
  WATER_X_STEP,
  shoreField,
  waterField,
} from '../src/data/water.ts';
import { SEGMENTS } from '../src/data/segments.ts';
import { LOOP_PERIMETER, STATION_S } from '../src/systems/tokyoBearing.ts';
import { shoreAt, waterAt, WET } from '../src/systems/water.ts';

test('les champs ont la taille que leur entête annonce', () => {
  assert.equal(waterField().length, WATER_ROWS * WATER_COLS);
  assert.equal(shoreField().length, WATER_ROWS * 2);
  // Le champ fait le tour de la boucle, à la rangée près : c'est ce qui permet
  // de replier une abscisse sans discontinuité au passage de l'origine.
  assert.ok(Math.abs(WATER_ROWS * WATER_S_STEP - WATER_LOOP_M) < WATER_S_STEP);
  assert.ok(Math.abs(WATER_LOOP_M - LOOP_PERIMETER) < 2, 'même polyligne que le relèvement');
  // Colonnes impaires : il y a une colonne d'axe, et le champ est symétrique.
  assert.equal(WATER_COLS % 2, 1);
  assert.equal((WATER_COLS - 1) / 2, WATER_REACH / WATER_X_STEP);
});

test('les traversées tombent où la carte les met', () => {
  // Six à ciel ouvert, et le relevé les nomme : rien ici ne vient de la bible,
  // tout vient d'un identifiant OSM qu'on peut aller relire.
  assert.equal(WATER_CROSSINGS.length, 6);
  for (const c of WATER_CROSSINGS) {
    assert.ok(c.osmWay > 0, 'chaque traversée porte sa source');
    assert.ok(c.s >= 0 && c.s < WATER_LOOP_M);
    assert.ok(c.fraction > 0 && c.fraction < 1);
    assert.ok(c.width > 2 && c.width < 120, `largeur plausible : ${c.width}`);
    assert.ok(c.segment >= 0 && c.segment < SEGMENTS.length);
    // L'abscisse curviligne et le couple (tronçon, fraction) doivent dire la
    // même chose : ce sont deux écritures du même point, et le jeu lit la
    // seconde. Un désaccord poserait la rivière dans la gare d'à côté.
    const a = STATION_S[c.segment];
    const b = STATION_S[(c.segment + 1) % 30];
    const span = (b - a + WATER_LOOP_M) % WATER_LOOP_M;
    const s = (a + span * c.fraction) % WATER_LOOP_M;
    assert.ok(Math.abs(s - c.s) < 1, `${c.name} : ${s.toFixed(1)} contre ${c.s}`);
  }
  // Le 日本橋川 avant Kanda est la plus large, la 神田川 de Takadanobaba la plus
  // étroite. Les deux sont MESURÉES dans l'axe de la voie sur le plan d'eau.
  const byWidth = [...WATER_CROSSINGS].sort((x, y) => y.width - x.width);
  assert.equal(byWidth[0].name, '日本橋川');
  assert.ok(byWidth[0].measured);
  assert.ok(byWidth[0].width > 30);
  assert.ok(byWidth[byWidth.length - 1].width < 15);
});

test('la Yamanote ne franchit pas la 渋谷川', () => {
  // Le tronçon 19, Shibuya→Ebisu, portait « river: 0.18 » depuis la première
  // passe. Il n'y a rien là : la rivière suit la voie puis s'en va vers l'est.
  // Ce test est le garde-fou de la règle 11 - ne rien poser qui ne soit relevé.
  assert.ok(!WATER_CROSSINGS.some((c) => c.segment === 19));
  for (const c of WATER_CROSSINGS) {
    assert.notEqual(c.name, '渋谷川');
  }
});

test('une traversée mouille le champ à son abscisse', () => {
  // Le champ et la liste des traversées sortent du même relevé : là où la
  // liste annonce une rivière, le champ doit être mouillé sur l'axe. Sans quoi
  // les deux couches se contrediraient, et le tissu urbain rebâtirait à
  // l'endroit même que la trouée vient d'ouvrir.
  //
  // Le seuil est BAS, et c'est ce que la maille impose : quarante mètres de
  // côté pour une 神田川 qui en fait onze et demi à Takadanobaba, soit un peu
  // moins du tiers de la maille au mieux. Exiger davantage reviendrait à
  // demander au relevé une finesse qu'il n'a pas.
  for (const c of WATER_CROSSINGS) {
    assert.ok(waterAt(c.s, 0) > 0.15, `${c.name} à ${(c.s / 1000).toFixed(2)} km`);
  }
  // Les larges, elles, franchissent le seuil de construction : le tissu ne
  // bâtit pas au droit du 日本橋川.
  for (const c of WATER_CROSSINGS.filter((x) => x.width > 25)) {
    assert.ok(waterAt(c.s, 0) > WET, `${c.name}, ${c.width} m`);
  }
});

test('le corridor est sec presque partout', () => {
  // Deux pour cent : Tokyo n'est pas Venise. Si ce nombre s'envolait, c'est
  // qu'un multipolygone se serait refermé de travers - la panne exacte qui, à
  // l'import, donnait une 神田川 de cent trente-huit mètres de large.
  const f = waterField();
  let n = 0;
  for (let i = 0; i < f.length; i++) if (f[i] / 255 > WET) n++;
  assert.ok(n > 100, `le relevé porte de l’eau (${n})`);
  assert.ok(n / f.length < 0.05, `et pas trop (${((100 * n) / f.length).toFixed(1)} %)`);
});

test('la baie ne s’ouvre que du côté de la baie', () => {
  // Le trait de côte s'approche à quatre cent vingt-cinq mètres, et pas ailleurs
  // qu'entre Shinagawa et Shimbashi. C'est un fait de géographie, et c'est le
  // seul endroit de la boucle où le jeu a le droit de peindre la mer.
  let closest = Infinity;
  let closestS = -1;
  let rows = 0;
  for (let r = 0; r < WATER_ROWS; r++) {
    for (const left of [true, false]) {
      const d = shoreAt(r * WATER_S_STEP, left);
      if (d <= 0) continue;
      rows++;
      assert.ok(d <= SHORE_REACH, 'le relevé ne dépasse pas sa portée');
      if (d < closest) {
        closest = d;
        closestS = r * WATER_S_STEP;
      }
    }
  }
  assert.ok(rows > 0, 'la mer existe');
  assert.ok(closest > 380 && closest < 480, `au plus près : ${closest} m`);
  // Hamamatsuchō est la gare 27 dans l'ordre des index croissants (Tokyo = 0).
  assert.ok(
    Math.abs(closestS - STATION_S[27]) < 900,
    `le point le plus proche est à Hamamatsuchō (${(closestS / 1000).toFixed(2)} km)`,
  );
  // Et rien du tout sur l'arc ouest : Shinjuku est à trente kilomètres de la
  // mer, et la moindre nappe d'eau posée là se verrait d'un quai.
  for (const st of [14, 15, 16, 17, 18]) {
    assert.equal(shoreAt(STATION_S[st], true), 0);
    assert.equal(shoreAt(STATION_S[st], false), 0);
  }
});
