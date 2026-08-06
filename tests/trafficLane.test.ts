// La circulation roule-t-elle DANS sa rue ?
//
// La question n'est pas rhétorique. La dalle de chaussée tourne avec la trame du
// quartier autour de son propre centre, à mi-profondeur du bâti ; la même
// rotation prise depuis l'axe des rails place le véhicule une vingtaine de
// mètres plus loin le long de la voie, parfaitement parallèle à sa rue et à côté
// d'elle. À l'œil, dans une trouée vue deux secondes, c'est presque
// indiscernable d'un décor correct - d'où ce test, qui repasse le véhicule dans
// le repère de la dalle par la matrice même que le rendu emploie.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CELL_LEN, roadwayOf, type Roadway } from '../src/systems/cityField.ts';
import { RUN_MAX, RUN_MIN, laneSlot, makeLane } from '../src/systems/trafficLane.ts';

const PER_STREET = 3;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Cellules de l'échantillon qui portent une rue. */
function streetCells(n = 400): number[] {
  const road: Roadway = { s: 0, x: 0, w: 0, d: 0, yaw: 0 };
  const out: number[] = [];
  for (let cell = -n; cell < n; cell++) if (roadwayOf(cell, road)) out.push(cell);
  return out;
}

/**
 * La dalle de chaussée, posée EXACTEMENT comme three/city/CityRibbon la pose :
 * centre en (côté × x, z = −s), rotation de −yaw autour de Y, échelle
 * (profondeur, hauteur, largeur).
 */
function roadMatrix(road: Roadway, side: 1 | -1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(side * road.x, 0, -road.s),
    new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -road.yaw),
    new THREE.Vector3(road.d, 1, road.w),
  );
}

test('la boucle offre des rues, et pas partout', () => {
  const cells = streetCells();
  const share = cells.length / 800;
  // Une cellule sur deux environ : c'est ce que promet le générateur.
  assert.ok(share > 0.4 && share < 0.6, `part de cellules avec rue : ${share}`);
  // Deux rues voisines ne se touchent pas : une cellule fait CELL_LEN.
  const road: Roadway = { s: 0, x: 0, w: 0, d: 0, yaw: 0 };
  for (const cell of cells) {
    roadwayOf(cell, road);
    assert.ok(road.s > cell * CELL_LEN && road.s < (cell + 1) * CELL_LEN);
    assert.ok(road.w > 6 && road.w < 16, `largeur ${road.w}`);
  }
});

test('chaque véhicule se tient dans la largeur de sa chaussée', () => {
  const road: Roadway = { s: 0, x: 0, w: 0, d: 0, yaw: 0 };
  const lane = makeLane();
  const p = new THREE.Vector3();
  let seen = 0;
  for (const cell of streetCells(120)) {
    roadwayOf(cell, road);
    for (const side of [1, -1] as const) {
      const inv = roadMatrix(road, side).invert();
      for (let i = 0; i < PER_STREET; i++) {
        for (const t of [0, 0.7, 2.3, 5.1, 11.9, 30.4]) {
          if (!laneSlot(cell, side, i, PER_STREET, t, lane)) continue;
          seen++;
          p.set(side * lane.x, 0, -lane.s).applyMatrix4(inv);
          // z local : la position en travers de la rue, en fraction de largeur.
          // Une voiture qui roule à côté de sa rue sort tout de suite de ±0,5.
          assert.ok(
            Math.abs(p.z) <= 0.5,
            `cellule ${cell} côté ${side} place ${i} : hors chaussée (${p.z.toFixed(2)})`,
          );
          // x local : la position le long de la rue. La course déborde
          // volontairement de la dalle, mais jamais de plus que RUN_*.
          const along = p.x * road.d;
          const reach = (RUN_MAX - RUN_MIN) / 2 + 1;
          assert.ok(Math.abs(along) < reach + road.d / 2, `cellule ${cell} : course ${along}`);
        }
      }
    }
  }
  assert.ok(seen > 400, `échantillon trop maigre : ${seen}`);
});

test('la distance à la voie suit la course, des deux côtés', () => {
  const road: Roadway = { s: 0, x: 0, w: 0, d: 0, yaw: 0 };
  const lane = makeLane();
  for (const cell of streetCells(120)) {
    roadwayOf(cell, road);
    for (const side of [1, -1] as const) {
      for (let i = 0; i < PER_STREET; i++) {
        for (const t of [0, 3.3, 9.6, 25.2]) {
          if (!laneSlot(cell, side, i, PER_STREET, t, lane)) continue;
          // Un véhicule ne monte jamais sur la voie, et ne dépasse jamais
          // l'arrière-pays : c'est ce qui garantit que ses apparitions et ses
          // disparitions se font derrière du bâti.
          assert.ok(
            lane.x > RUN_MIN - 8 && lane.x < RUN_MAX + 8,
            `cellule ${cell} côté ${side} : x = ${lane.x}`,
          );
        }
      }
    }
  }
});

test('on roule à gauche, et les deux sens se croisent', () => {
  const road: Roadway = { s: 0, x: 0, w: 0, d: 0, yaw: 0 };
  const lane = makeLane();
  const p = new THREE.Vector3();
  const head = new THREE.Vector3();
  let seen = 0;
  for (const cell of streetCells(120)) {
    roadwayOf(cell, road);
    for (const side of [1, -1] as const) {
      const inv = roadMatrix(road, side).invert();
      for (let i = 0; i < PER_STREET; i++) {
        for (const t of [0, 4.4, 13.7]) {
          if (!laneSlot(cell, side, i, PER_STREET, t, lane)) continue;
          p.set(side * lane.x, 0, -lane.s).applyMatrix4(inv);
          // Cap de la caisse dans le repère de la dalle : sa longueur est
          // écrite sur son +x, qu'un demi-tour retourne.
          head.set(lane.flip ? -1 : 1, 0, 0);
          // La gauche d'une caisse tournée vers son +x est son −z. Rouler à
          // gauche, c'est donc se tenir du côté −z de l'axe de la rue quand on
          // regarde +x, et l'inverse après demi-tour.
          seen++;
          assert.ok(
            Math.sign(p.z) === -Math.sign(head.x),
            `cellule ${cell} côté ${side} place ${i} : mauvais côté de la rue`,
          );
        }
      }
    }
  }
  assert.ok(seen > 200, `échantillon trop maigre : ${seen}`);
});
