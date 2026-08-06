// Les silhouettes de l'horizon tiennent-elles la CONVENTION ?
//
// Tout le placement de three/city/FarSkyline repose sur une seule promesse :
// une silhouette est écrite en unités de hauteur de structure, pied à y = 0 et
// sommet à y = 1. Si une famille dépasse, le repère est trop grand dans le ciel
// et sa taille angulaire est fausse - une erreur qu'aucune capture ne permet de
// trancher, puisqu'on ne mesure pas des degrés à l'œil.
//
// Le reste vérifie ce que chaque famille promet de particulier : l'élancement
// d'une tour treillis, l'étalement d'un stratovolcan, la ligne de neige haute,
// le feu d'obstacle au sommet.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeSilhouette } from '../src/three/city/skylineKit.ts';

type Shape = 'tower' | 'twin' | 'needle' | 'mountain' | 'bridge';
const SHAPES: Shape[] = ['tower', 'twin', 'needle', 'mountain', 'bridge'];

interface Bounds {
  minY: number;
  maxY: number;
  maxAbsX: number;
  verts: number;
  tris: number;
}

function bounds(geo: THREE.BufferGeometry): Bounds {
  const pos = geo.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxAbsX = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), 'sommet fini');
    assert.equal(pos.getZ(i), 0, 'une découpe est plate');
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    maxAbsX = Math.max(maxAbsX, Math.abs(x));
  }
  const idx = geo.getIndex();
  assert.ok(idx, 'géométrie indexée');
  for (let i = 0; i < idx.count; i++) {
    assert.ok(idx.getX(i) < pos.count, 'indice dans les bornes');
  }
  return { minY, maxY, maxAbsX, verts: pos.count, tris: idx.count / 3 };
}

test('chaque famille tient la convention des unités de hauteur', () => {
  for (const shape of SHAPES) {
    const s = makeSilhouette(shape);
    const b = bounds(s.body);
    assert.ok(b.minY >= -0.01, `${shape} : le pied est à y = 0 (${b.minY})`);
    // Le mât d'antenne et le local des machines dépassent légèrement le sommet
    // de structure : c'est admis, mais de quelques pour cent seulement.
    assert.ok(b.maxY > 0.9 && b.maxY <= 1.06, `${shape} : le sommet est à y = 1 (${b.maxY})`);
    assert.ok(b.tris >= 2, `${shape} : au moins deux triangles`);
    // Le budget de la couche : cinq familles, quelques dizaines de triangles.
    assert.ok(b.tris < 80, `${shape} : ${b.tris} triangles, c'est trop pour un contour`);
  }
});

test('une tour treillis est élancée, un volcan est étalé', () => {
  const needle = bounds(makeSilhouette('needle').body);
  const tower = bounds(makeSilhouette('tower').body);
  const twin = bounds(makeSilhouette('twin').body);
  const mountain = bounds(makeSilhouette('mountain').body);
  const bridge = bounds(makeSilhouette('bridge').body);

  // Le Skytree fait 634 m pour une base de moins de 100 : la découpe doit être
  // au moins dix fois plus haute que large.
  assert.ok(needle.maxAbsX < 0.1, `treillis trop épais (${needle.maxAbsX})`);
  assert.ok(tower.maxAbsX > needle.maxAbsX, 'un immeuble est plus large qu\u2019un mât');
  assert.ok(tower.maxAbsX < 0.26, `immeuble trop large (${tower.maxAbsX})`);
  assert.ok(twin.maxAbsX > tower.maxAbsX, 'deux fûts occupent plus qu\u2019un');

  // Fuji : 3 776 m pour une base de plus de trente kilomètres. En unités de
  // hauteur, le demi-étalement est de l'ordre de trois.
  assert.ok(mountain.maxAbsX > 2.5 && mountain.maxAbsX < 3.5, `cône mal étalé (${mountain.maxAbsX})`);
  // Rainbow Bridge : 127 m de pylône pour 798 m de travée, plus les accès.
  assert.ok(bridge.maxAbsX > 4 && bridge.maxAbsX < 6, `pont mal proportionné (${bridge.maxAbsX})`);
});

test('la neige se pose haut, le feu d\u2019obstacle au sommet', () => {
  const fuji = makeSilhouette('mountain');
  assert.equal(fuji.trimKind, 'snow');
  const snow = bounds(fuji.trim as THREE.BufferGeometry);
  // Ligne de neige : au-dessus de 60 % de la hauteur, soit ~2 300 m. En
  // dessous, la calotte descendrait dans les contreforts et la montagne
  // deviendrait un cône blanc - ce qu'elle n'est jamais depuis Tokyo.
  assert.ok(snow.minY >= 0.58, `ligne de neige trop basse (${snow.minY})`);
  assert.ok(snow.maxY > 0.98, 'la calotte va jusqu\u2019au cratère');
  // Elle est aussi plus étroite que le cône : sinon elle le déborde.
  assert.ok(snow.maxAbsX < bounds(fuji.body).maxAbsX * 0.7, 'calotte plus étroite que le cône');

  for (const shape of ['needle', 'tower', 'twin'] as Shape[]) {
    const s = makeSilhouette(shape);
    assert.equal(s.trimKind, 'beacon', `${shape} porte un feu d\u2019obstacle`);
    const beacon = bounds(s.trim as THREE.BufferGeometry);
    assert.ok(beacon.minY > 0.95, `${shape} : feu au sommet (${beacon.minY})`);
    assert.ok(beacon.tris <= 4, `${shape} : un feu, pas une lanterne`);
  }

  const bridge = makeSilhouette('bridge');
  assert.equal(bridge.trimKind, 'lights');
});

test('les découpes sont neuves à chaque appel', () => {
  // FarSkyline en possède les géométries et les libère au démontage : deux
  // repères de la même famille ne doivent pas partager un tampon, sinon le
  // premier démontage emporte le second.
  const a = makeSilhouette('tower');
  const b = makeSilhouette('tower');
  assert.notEqual(a.body.uuid, b.body.uuid);
  assert.notEqual((a.trim as THREE.BufferGeometry).uuid, (b.trim as THREE.BufferGeometry).uuid);
});
