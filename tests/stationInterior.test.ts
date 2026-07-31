// Le niveau de correspondance (src/data/stationInterior).
//
// Ce qui est vérifié ici, c'est ce dont la marche et le rendu ont besoin pour
// ne pas se contredire : que le hall tienne dans l'emprise où la nappe de rue
// s'est dérobée, qu'il se raccorde au couloir de la trémie sans marche, et que
// la ligne de portillons laisse réellement passer. Un hall dessiné là où l'on
// ne peut pas aller, ou franchissable là où il n'est pas dessiné, se verrait au
// premier pas - mais bien plus tard que ce test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { interiorFor } from '../src/data/stationInterior.ts';
import { layoutFor } from '../src/data/stationLayouts.ts';
import {
  PSD_X,
  STAIR_LOWER_END,
  STAIR_LOWER_Y,
  STAIR_WALK_HALF_X,
} from '../src/data/stationGeometry.ts';
import { STATION_COUNT } from '../src/data/loop.ts';
import { STATIONS } from '../src/data/stations.ts';

/** Une trémie plausible : le placement les pose vers le milieu du quai. */
const ACCESS_Z = 11.2;

const ALL = Array.from({ length: STATION_COUNT }, (_, i) => ({
  i,
  name: `${STATIONS[i].jy} ${STATIONS[i].romaji}`,
  interior: interiorFor(i, ACCESS_Z),
}));

test('les trente gares déclarent un niveau de correspondance', () => {
  assert.equal(ALL.length, 30);
  for (const { name, interior } of ALL) {
    assert.ok(interior.gate.nameJp.length > 0, name);
    assert.ok(interior.exits.length >= 1, name);
  }
});

test('le hall se raccorde au couloir de la trémie, sans marche ni décrochement', () => {
  for (const { name, interior } of ALL) {
    if (!interior.built) continue;
    // Le couloir bas finit là, exactement, et à la même altitude.
    assert.equal(interior.paid.z0, ACCESS_Z + STAIR_LOWER_END, name);
    assert.equal(interior.floorY, STAIR_LOWER_Y, name);
  }
});

test('le débouché du couloir tombe dans la largeur du hall', () => {
  for (const { i, name, interior } of ALL) {
    if (!interior.built) continue;
    const layout = layoutFor(i);
    // Axe de la trémie tel que systems/stationPlacement la pose : sur l'épine
    // d'un îlot, un peu au-delà du milieu contre un mur de fond.
    const backX = layout.config === 'side'
      ? PSD_X + layout.depth - 0.15
      : PSD_X + layout.depth / 2;
    const stairX = (layout.config === 'side' ? PSD_X + layout.depth * 0.55 : backX - 0.4) + 0.4;
    assert.ok(stairX - STAIR_WALK_HALF_X >= interior.paid.x0 - 0.01, `${name} rive gauche`);
    assert.ok(stairX + STAIR_WALK_HALF_X <= interior.paid.x1 + 0.01, `${name} rive droite`);
  }
});

test('le hall tient dans l’emprise où la nappe de rue s’est dérobée', () => {
  // three/groundStrip ne la rentre que sur la largeur de la DALLE : au-delà,
  // la rue reprend sa place un mètre sous le quai et couperait le hall.
  for (const { i, name, interior } of ALL) {
    const layout = layoutFor(i);
    for (const rect of [interior.paid, interior.free]) {
      assert.ok(rect.x0 >= PSD_X, `${name} bord voie`);
      assert.ok(rect.x1 <= PSD_X + layout.depth, `${name} fond de quai`);
    }
  }
});

test('la zone payante, les portillons et la zone libre se suivent sans trou', () => {
  for (const { name, interior } of ALL) {
    assert.equal(interior.gate.z0, interior.paid.z1, `${name} entrée des portillons`);
    assert.equal(interior.free.z0, interior.gate.z1, `${name} sortie des portillons`);
    assert.ok(interior.free.z1 > interior.free.z0, name);
  }
});

test('la ligne de portillons barre toute la largeur, sauf ses passages', () => {
  for (const { name, interior } of ALL) {
    const { cabinets, passages } = interior.gate;
    assert.ok(passages.length >= 2, `${name} : au moins deux passages`);
    // Bornes et passages se relaient bord à bord d'une paroi à l'autre : rien
    // ne se contourne, tout se franchit par un passage.
    const spans = [
      ...cabinets.map((c) => ({ x0: c.x0, x1: c.x1 })),
      ...passages.map((p) => ({ x0: p.x - p.width / 2, x1: p.x + p.width / 2 })),
    ].sort((a, b) => a.x0 - b.x0);
    assert.ok(Math.abs(spans[0].x0 - interior.paid.x0) < 1e-9, `${name} rive gauche`);
    for (let k = 1; k < spans.length; k++) {
      assert.ok(Math.abs(spans[k].x0 - spans[k - 1].x1) < 1e-9, `${name} jointure ${k}`);
    }
    assert.ok(Math.abs(spans[spans.length - 1].x1 - interior.paid.x1) < 1e-9, `${name} rive droite`);
    // Un passage large par ligne, et c'est celui du bout.
    assert.equal(passages.filter((p) => p.wide).length, 1, name);
    assert.equal(passages[passages.length - 1].wide, true, name);
  }
});

test('les bouches de sortie sont dans le hall libre', () => {
  for (const { name, interior } of ALL) {
    for (const exit of interior.exits) {
      assert.ok(exit.x - exit.halfWidth >= interior.free.x0 - 1e-9, `${name} ${exit.label}`);
      assert.ok(exit.x + exit.halfWidth <= interior.free.x1 + 1e-9, `${name} ${exit.label}`);
    }
  }
});

test('un hall n’est construit que du côté où l’accès est dessiné', () => {
  // Les gares dont le hall est AU-DESSUS du quai attendent leur volée montante :
  // elles déclarent le niveau, elles ne le construisent pas. Le jour où la
  // volée existera, c'est cette liste qui bougera - et rien d'autre.
  const over = ALL.filter((s) => s.interior.place === 'over').map((s) => s.name);
  assert.deepEqual(over, [
    'JY07 Nippori',
    'JY09 Tabata',
    'JY10 Komagome',
    'JY11 Sugamo',
    'JY14 Mejiro',
    'JY22 Meguro',
  ]);
  for (const { name, interior } of ALL) {
    assert.equal(interior.built, interior.place === 'under', name);
  }
});

test('les cinq gares en tranchée ont toutes leur hall au-dessus', () => {
  // C'est le seul endroit où la forme de la gare COMMANDE le sens du niveau :
  // en tranchée, la rue est au-dessus du quai, et la billetterie avec elle.
  for (const { i, name, interior } of ALL) {
    if (layoutFor(i).elevation !== 'trench') continue;
    assert.equal(interior.place, 'over', name);
  }
});
