// Matrice de circulation hors quai (stationCirculation) — 30 gares.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATION_CIRCULATION,
  circulationFor,
  doorSideFromCirculation,
  doorSideNameFromCirculation,
} from '../src/data/stationCirculation.ts';
import { STATIONS } from '../src/data/stations.ts';
import { layoutFor } from '../src/data/stationLayouts.ts';
import { STATION_COUNT } from '../src/data/loop.ts';

test('une entrée de circulation par gare', () => {
  assert.equal(STATION_CIRCULATION.length, STATION_COUNT);
  assert.equal(STATION_CIRCULATION.length, STATIONS.length);
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.equal(circulationFor(i).jy, STATIONS[i].jy);
  }
});

test('chaque gare a des accès et un hall', () => {
  for (const c of STATION_CIRCULATION) {
    assert.ok(c.accesses.length >= 1, c.jy);
    assert.ok(c.concourse.halfX > 0, c.jy);
    assert.ok(c.concourse.halfZ > 0, c.jy);
    assert.ok(c.concourse.gates.length >= 1, c.jy);
    assert.ok(c.concourse.exitDoors.length >= 1, c.jy);
  }
});

test('côtés de porte : G/D par sens, Ōsaki asymétrique', () => {
  // Tokyo intérieur/extérieur : gauche
  assert.equal(doorSideNameFromCirculation(0, 'inner'), 'left');
  assert.equal(doorSideNameFromCirculation(0, 'outer'), 'left');
  // Komagome : droite
  assert.equal(doorSideNameFromCirculation(9, 'inner'), 'right');
  // Ōsaki : intérieur droite, extérieur gauche
  assert.equal(doorSideNameFromCirculation(23, 'inner'), 'right');
  assert.equal(doorSideNameFromCirculation(23, 'outer'), 'left');
  assert.equal(doorSideFromCirculation(23, 'inner'), 1);
  assert.equal(doorSideFromCirculation(23, 'outer'), -1);
});

test('familles d’accès couvrent la boucle', () => {
  const families = new Set(STATION_CIRCULATION.map((c) => c.accessFamily));
  assert.ok(families.has('islandBridge'));
  assert.ok(families.has('underpass'));
  assert.ok(families.has('terminusHall'));
  assert.ok(families.has('special'));
});

test('configs layout alignées sur la circulation (Kanda, Shimbashi)', () => {
  assert.equal(layoutFor(1).config, 'sharedIsland'); // Kanda
  assert.equal(layoutFor(28).config, 'sharedIsland'); // Shimbashi
  assert.equal(circulationFor(1).platformLayout, 'sharedIsland');
  assert.equal(circulationFor(28).platformLayout, 'sharedIsland');
});

test('Ueno mixed : montées et descentes', () => {
  const ueno = circulationFor(4);
  assert.equal(ueno.accessDir, 'mixed');
  assert.ok(ueno.accesses.some((a) => a.dir === 'up'));
  assert.ok(ueno.accesses.some((a) => a.dir === 'down'));
});

test('Mejiro : accès concentrés extrémité +z', () => {
  const mejiro = circulationFor(13);
  assert.equal(mejiro.accessDir, 'up');
  assert.ok(mejiro.accesses.every((a) => a.z > 40));
});

test('PSD : Shinjuku/Shibuya none, Ōsaki partial, Ikebukuro full', () => {
  assert.equal(circulationFor(16).platformDoors, 'none');
  assert.equal(circulationFor(19).platformDoors, 'none');
  assert.equal(circulationFor(23).platformDoors, 'partial');
  assert.equal(circulationFor(12).platformDoors, 'full');
  assert.deepEqual(circulationFor(12).terminalTracks, [5, 8]);
  assert.deepEqual(circulationFor(23).terminalTracks, [2, 4]);
});
