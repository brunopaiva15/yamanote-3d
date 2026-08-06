// Le sol bouge, la ville ne doit pas.
//
// Le relief du 国土地理院 se lit de deux façons, et les confondre donne
// exactement l'image que le joueur a signalée : des immeubles et des arbres en
// l'air, et du vide sous la rue.
//
// `cityRelief` rend une cote PAR RAPPORT À LA VOIE. Elle ne vaut que pour
// l'image où elle a été lue, parce que la voie monte et descend : trente-six
// mètres entre la plaine alluviale de Tokyo et le plateau de Musashino, dont
// une vingtaine sur les cinq cents mètres qui précèdent Meguro. Une cellule du
// ruban, elle, s'écrit UNE FOIS et reste posée quatre cent quatre-vingts
// mètres - douze cents pour l'arrière-pays. Retenir une différence à
// l'écriture, c'est décrire un sol qui n'existera plus dix secondes après.
//
// `cityGround` rend l'ALTITUDE, qui ne dépend que du lieu. C'est elle que doit
// porter tout ce qui s'écrit une fois, et c'est le groupe de scène qui retranche
// l'altitude de la voie, une fois par image, pour tout le ruban à la fois.
//
// Ces tests tiennent les deux bouts : l'altitude ne bouge pas quand le train
// bouge, et la conversion vers le repère de la scène redonne bien la cote
// relative de l'image en cours.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCell,
  buildFarCell,
  cityAnchor,
  makeCellBuffer,
  FAR_CELL_CAPACITY,
} from '../src/systems/cityField.ts';
import {
  cityGround,
  cityRelief,
  setTerrainEnabled,
  trackElevation,
  updateTerrain,
} from '../src/systems/terrain.ts';

/**
 * Pose le train à `distance` sur la boucle, exactement comme
 * three/city/CityRibbon le fait à chaque image : l'ancre des quartiers d'abord,
 * le relief ensuite.
 *
 * L'ancre est écrite à la main plutôt que par `updateCityAnchor`, qui a besoin
 * d'un `runtime` et d'un historique d'index : ce qui compte ici est que le
 * ruban et le relief lisent le MÊME repère, pas comment il a été obtenu.
 */
function placeTrain(distance: number, index = 0): void {
  cityAnchor.s = 0;
  cityAnchor.index = index;
  cityAnchor.span = 1150;
  cityAnchor.step = 1;
  updateTerrain(distance, cityAnchor);
}

/** Cellules d'échantillon : un tour complet, une sur sept. */
const CELLS = Array.from({ length: 123 }, (_, i) => i * 7);

test('l’altitude d’un bâtiment ne dépend pas d’où est le train', () => {
  setTerrainEnabled(true);
  const buf = makeCellBuffer();
  const ref = makeCellBuffer();

  // Le train à l'entrée du corridor de Meguro, puis cinq cents mètres plus
  // loin : c'est le plus fort dénivelé de la ligne, et donc le pire cas.
  for (const cell of CELLS) {
    for (const side of [1, -1] as const) {
      placeTrain(0);
      const n = buildCell(cell, side, ref);
      placeTrain(24000);
      const m = buildCell(cell, side, buf);
      assert.equal(n, m, `cellule ${cell} : même nombre de sujets`);
      for (let i = 0; i < n; i++) {
        assert.equal(
          buf[i].y,
          ref[i].y,
          `cellule ${cell}, sujet ${i} : l'altitude a bougé avec le train`,
        );
      }
    }
  }
});

test('l’altitude de l’arrière-pays non plus', () => {
  setTerrainEnabled(true);
  const buf = makeCellBuffer(FAR_CELL_CAPACITY);
  const ref = makeCellBuffer(FAR_CELL_CAPACITY);
  for (const cell of CELLS) {
    placeTrain(0);
    const n = buildFarCell(cell, 1, ref);
    placeTrain(24000);
    const m = buildFarCell(cell, 1, buf);
    assert.equal(n, m);
    for (let i = 0; i < n; i++) assert.equal(buf[i].y, ref[i].y, `arrière-pays ${cell}/${i}`);
  }
});

test('le relief lu est bien une altitude, et pas déjà une différence', () => {
  setTerrainEnabled(true);
  // Le sol de Tokyo tient tout entier entre le niveau de la mer et le plateau :
  // une altitude est positive et petite. Une DIFFÉRENCE, elle, serait négative
  // la moitié du temps - c'est le signe qui trahit la confusion.
  placeTrain(24000);
  let low = Infinity;
  let high = -Infinity;
  for (const cell of CELLS) {
    for (let x = 10; x <= 260; x += 50) {
      const y = cityGround(cell * 40, x, 1);
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  }
  assert.ok(low > 0, `le sol le plus bas est à ${low.toFixed(1)} m`);
  assert.ok(high > 20, `le sol le plus haut est à ${high.toFixed(1)} m`);
  assert.ok(high < 80, `le sol le plus haut est à ${high.toFixed(1)} m`);
});

test('le groupe de scène redonne exactement la cote de l’image', () => {
  setTerrainEnabled(true);
  // C'est la conversion que fait `CityRibbon` : le groupe porte
  // −trackElevation(), chaque sujet porte son altitude, et la somme doit valoir
  // ce que `cityRelief` rendrait pour cette image-là. Sans quoi la rue et les
  // immeubles - qui passent l'un par `cityGround`, l'autre par `cityRelief` -
  // ne tomberaient pas d'accord.
  for (const distance of [0, 4300, 12800, 23900, 24400, 33000]) {
    placeTrain(distance);
    for (const x of [12, 60, 180, 320]) {
      for (const side of [1, -1] as const) {
        const s = distance + 260;
        const scene = cityGround(s, x, side) - trackElevation();
        assert.ok(
          Math.abs(scene - cityRelief(s, x, side)) < 1e-9,
          `à ${distance} m, x=${x} : ${scene} ≠ ${cityRelief(s, x, side)}`,
        );
      }
    }
  }
});

test('le relief coupé rend un décor parfaitement plat', () => {
  // La trappe de `setTerrainEnabled` sert à isoler une régression : elle doit
  // rendre le sol d'AVANT le relief, pas un sol au niveau de la mer.
  setTerrainEnabled(false);
  placeTrain(24000);
  for (const x of [12, 180, 400]) {
    assert.equal(cityGround(24260, x, 1) - trackElevation(), 0);
    assert.equal(cityRelief(24260, x, 1), 0);
  }
  const buf = makeCellBuffer();
  const n = buildCell(600, 1, buf);
  for (let i = 0; i < n; i++) assert.equal(buf[i].y - trackElevation(), 0);
  setTerrainEnabled(true);
});
