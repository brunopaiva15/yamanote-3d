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
import { stationExits } from '../src/data/lines.ts';

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

test('les bouches de sortie sont dans le hall libre, et fléchées par le relevé', () => {
  for (const { i, name, interior } of ALL) {
    // Une bouche par sortie fléchée du quai : mêmes noms, même source.
    assert.equal(interior.exits.length, stationExits(i).length, name);
    for (const exit of interior.exits) {
      assert.ok(exit.x - exit.halfWidth >= interior.free.x0 - 1e-9, `${name} sortie ${exit.slot}`);
      assert.ok(exit.x + exit.halfWidth <= interior.free.x1 + 1e-9, `${name} sortie ${exit.slot}`);
    }
  }
});

test('deux bouches de sortie gardent leur trumeau, et leur retour de paroi', () => {
  // Posées bêtement au tiers et aux deux tiers, deux bouches de 2,30 m se
  // chevauchaient sur les halls étroits : le mur qui les sépare disparaissait,
  // les deux volées se touchaient, et les deux panneaux jaunes se superposaient
  // dans le même plan - le z-fighting qu'on voit à l'écran. Une bouche rétrécit
  // plutôt que de mordre sur sa voisine.
  for (const { name, interior } of ALL) {
    const cuts = [...interior.exits].sort((a, b) => a.x - b.x);
    assert.ok(
      cuts[0].x - cuts[0].halfWidth - interior.free.x0 >= 0.4,
      `${name} retour de paroi à gauche`,
    );
    assert.ok(
      interior.free.x1 - (cuts[cuts.length - 1].x + cuts[cuts.length - 1].halfWidth) >= 0.4,
      `${name} retour de paroi à droite`,
    );
    for (let k = 1; k < cuts.length; k += 1) {
      const pier = (cuts[k].x - cuts[k].halfWidth) - (cuts[k - 1].x + cuts[k - 1].halfWidth);
      assert.ok(pier >= 0.6, `${name} trumeau entre les bouches ${k - 1} et ${k} : ${pier}`);
    }
    // Et une bouche reste une bouche : jamais une meurtrière.
    for (const exit of cuts) {
      assert.ok(exit.halfWidth >= 0.75, `${name} sortie ${exit.slot} trop étroite`);
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

test('le mobilier tient contre ses parois, sans se chevaucher', () => {
  for (const { name, interior } of ALL) {
    for (const f of interior.fixtures) {
      // Adossé : le meuble se tient contre la paroi de son côté, à un retrait
      // près - il est devant le soubassement de faïence, pas dedans.
      const onNear = Math.abs(f.rect.x0 - interior.paid.x0) < 0.1;
      const onFar = Math.abs(f.rect.x1 - interior.paid.x1) < 0.1;
      assert.ok(onNear || onFar, `${name} ${f.kind} : pas adossé`);
      assert.equal(f.facing, onNear ? 1 : -1, `${name} ${f.kind} : façade à l'envers`);
    }
    // Deux meubles d'une même paroi ne se recouvrent jamais en z.
    for (const wall of [interior.paid.x0, interior.paid.x1]) {
      const line = interior.fixtures
        .filter((f) => Math.abs(f.rect.x0 - wall) < 0.1 || Math.abs(f.rect.x1 - wall) < 0.1)
        .sort((a, b) => a.rect.z0 - b.rect.z0);
      for (let k = 1; k < line.length; k++) {
        assert.ok(
          line[k].rect.z0 >= line[k - 1].rect.z1 - 1e-9,
          `${name} : ${line[k - 1].kind} et ${line[k].kind} se chevauchent`,
        );
      }
    }
  }
});

test('le passage du milieu ne se referme jamais', () => {
  // C'est la contrainte qui refuse un meuble sans discuter : un hall où l'on ne
  // passe plus n'est pas meublé, il est bouché.
  for (const { name, interior } of ALL) {
    for (const zone of [interior.paid, interior.free]) {
      const inZone = (f: (typeof interior.fixtures)[number]) =>
        f.rect.z0 >= zone.z0 - 1e-9 && f.rect.z1 <= zone.z1 + 1e-9;
      const near = interior.fixtures.filter((f) => inZone(f) && f.facing === 1);
      const far = interior.fixtures.filter((f) => inZone(f) && f.facing === -1);
      const deepNear = Math.max(0, ...near.map((f) => f.rect.x1 - f.rect.x0));
      const deepFar = Math.max(0, ...far.map((f) => f.rect.x1 - f.rect.x0));
      const width = zone.x1 - zone.x0;
      // Les deux parois ne s'additionnent que là où deux meubles se font
      // réellement face ; la borne large tient dans tous les cas.
      assert.ok(width - Math.max(deepNear, deepFar) >= 2 - 1e-9, `${name} : passage étranglé`);
    }
  }
});

test('la zone payante et la zone libre ne se prêtent pas leur mobilier', () => {
  // Un distributeur de titres derrière les portillons ne servirait à personne,
  // et un ajusteur de fin de course devant eux non plus.
  const PAID_ONLY = new Set(['fareAdjust']);
  const FREE_ONLY = new Set(['ticket', 'lockers', 'konbini', 'office', 'stamp']);
  for (const { name, interior } of ALL) {
    for (const f of interior.fixtures) {
      const paid = f.rect.z1 <= interior.paid.z1 + 1e-9;
      if (PAID_ONLY.has(f.kind)) assert.ok(paid, `${name} ${f.kind} hors zone payante`);
      if (FREE_ONLY.has(f.kind)) assert.ok(!paid, `${name} ${f.kind} en zone payante`);
    }
  }
});

test('chaque gare a son tampon, et il est unique', () => {
  // Trente gares, trente empreintes : c'est ce qui se collectionne. Le motif se
  // partage, le cartouche jamais.
  const seen = new Set<string>();
  for (const { i } of ALL) {
    const key = `${STATIONS[i].kanji}/${STATIONS[i].jy}`;
    assert.ok(!seen.has(key), `tampon en double : ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, STATION_COUNT);
});

test('la trame porteuse passe avant le mobilier, et les devantures l’enjambent', () => {
  for (const { name, interior } of ALL) {
    assert.ok(interior.pilasters.length >= 4, `${name} : hall sans trame`);
    for (const p of interior.pilasters) {
      const near = Math.abs(p.x0 - interior.paid.x0) < 1e-9;
      for (const f of interior.fixtures) {
        // Un meuble de la MÊME paroi ne recouvre jamais un pilastre : soit il
        // l'a esquivé, soit c'est une devanture et le pilastre a été retiré.
        if ((f.facing === 1) !== near) continue;
        const overlap = f.rect.z0 < p.z1 && f.rect.z1 > p.z0;
        assert.ok(!overlap, `${name} : ${f.kind} recouvre un pilastre`);
      }
    }
  }
});

test('l’ajusteur de fin de course est toujours là, et juste avant les portillons', () => {
  // Il ne se range pas où il reste de la place : on le cherche une fois qu'on a
  // compris qu'on est descendu trop loin, donc au bout de la zone payante.
  for (const { name, interior } of ALL) {
    const fare = interior.fixtures.find((f) => f.kind === 'fareAdjust');
    assert.ok(fare, `${name} : pas d'ajusteur`);
    assert.ok(
      interior.paid.z1 - fare!.rect.z1 < 3,
      `${name} : ajusteur à ${(interior.paid.z1 - fare!.rect.z1).toFixed(1)} m des portillons`,
    );
  }
});

test('une galerie ne se pose que là où la gare en déclare une', () => {
  const declared = ALL.filter((s) => s.interior.brand);
  assert.deepEqual(declared.map((s) => s.name), [
    'JY03 Akihabara',
    'JY05 Ueno',
    'JY07 Nippori',
    'JY09 Tabata',
    'JY21 Ebisu',
    'JY22 Meguro',
    'JY25 Shinagawa',
  ]);
  // Une galerie n'apparaît que là où l'enseigne est déclarée - jamais ailleurs.
  for (const { name, interior } of ALL) {
    const has = interior.fixtures.some((f) => f.kind === 'gallery');
    if (!interior.brand) assert.ok(!has, `${name} : galerie sans enseigne`);
  }
  // Et là où elle est déclarée, elle se pose - sauf si le hall est trop étroit
  // pour ses 3,60 m de fond. Tabata est la seule dans ce cas, et c'est la règle
  // du passage libre qui tranche, pas un oubli.
  const missing = declared.filter((s) => !s.interior.fixtures.some((f) => f.kind === 'gallery'));
  assert.deepEqual(missing.map((s) => s.name), ['JY09 Tabata']);
  for (const s of missing) {
    assert.ok(s.interior.paid.x1 - s.interior.paid.x0 - 3.6 < 2, `${s.name} : place de reste`);
  }
});
