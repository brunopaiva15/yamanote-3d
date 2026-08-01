// Les deux commerces de gare : le kiosque du quai, le konbini du hall.
//
// Ils ont grandi tous les deux - le kiosque de 2,50 × 4,80 à 3,00 × 6,40, le
// konbini de 6,40 × 3,20 à 7,80 × 3,40 - et une boutique qui grandit prend sa
// place sur le PASSAGE. C'est ce que ce fichier surveille, et rien d'autre :
// pas la garniture, pas les enseignes, pas ce qu'on voit à travers la vitre,
// mais le fait qu'on puisse encore marcher autour.
//
// Deux règles, une par commerce :
//
//   · LE KIOSQUE EST UN ÎLOT. Il s'ouvre des deux longueurs, donc il doit
//     laisser passer des DEUX côtés - et pas seulement d'un. Décalé de 1,35 m
//     vers la voie comme il l'était, il ne laissait que vingt-cinq centimètres
//     entre lui et le bord d'embarquement du quai le plus étroit qui en porte
//     un : on ne passait plus, et le comptoir de ce côté-là donnait sur un mur
//     d'air. La faute ne se voyait dans aucune capture - elle se voyait en
//     marchant, et personne ne marche par là dans une capture.
//
//   · LE KONBINI NE DOIT PERDRE AUCUNE GARE. Sa profondeur décide de qui
//     l'obtient (`data/stationInterior`, règle du passage libre) : à 3,40 m
//     toutes celles qui l'avaient à 3,20 m l'ont encore, et un centimètre de
//     plus en aurait coûté deux.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { layoutFor } = await import('../src/data/stationLayouts.ts');
const { KIOSK_HALF_X, KIOSK_HALF_Z, PSD_X } = await import('../src/data/stationGeometry.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const { STATIONS } = await import('../src/data/stations.ts');

const GATES = psdGates();
const ALL = Array.from({ length: STATION_COUNT }, (_, i) => ({
  i,
  name: `${STATIONS[i].jy} ${STATIONS[i].romaji}`,
  layout: layoutFor(i),
  place: placementFor(i, GATES),
}));

/**
 * Passage libre exigé de chaque côté du kiosque.
 *
 * Un mètre vingt : de quoi croiser quelqu'un sans se ranger. C'est moins que
 * le couloir de correspondance (2 m, la règle du hall) parce qu'un quai offre
 * toujours l'AUTRE côté de l'îlot en secours, ce qu'un couloir n'offre pas.
 */
const KIOSK_CLEAR = 1.2;

test('le kiosque laisse passer des deux côtés, sur toutes les gares qui en ont un', () => {
  let seen = 0;
  for (const { name, place } of ALL) {
    const k = place.kiosk;
    if (!k) continue;
    seen += 1;
    const near = k.x - k.halfX - place.walkX0;
    const far = place.walkX1 - (k.x + k.halfX);
    assert.ok(near >= KIOSK_CLEAR, `${name} : ${near.toFixed(2)} m côté voie`);
    assert.ok(far >= KIOSK_CLEAR, `${name} : ${far.toFixed(2)} m côté opposé`);
  }
  assert.ok(seen >= 8, `trop peu de gares à kiosque : ${seen}`);
});

test('le kiosque est centré sur l’épine, et non poussé vers un bord', () => {
  // C'est ce centrage qui fait qu'il SERT des deux côtés. Un kiosque décentré
  // n'est pas un kiosque de moins bonne facture : c'est une boutique.
  for (const { name, layout, place } of ALL) {
    const k = place.kiosk;
    if (!k || layout.config === 'side') continue;
    assert.ok(Math.abs(k.x - place.backX) < 1e-9, `${name} : kiosque hors de l’épine`);
    assert.equal(k.halfX, KIOSK_HALF_X, name);
    assert.equal(k.halfZ, KIOSK_HALF_Z, name);
  }
});

test('le kiosque tient sous l’auvent, quelle que soit la gare', () => {
  // Auvent + bandeau : 2,48 + 0,38 + 0,08 de rive, soit 2,94 m hors tout
  // (three/station/Kiosk). Sous un auvent de quai bas, cela doit encore passer.
  const KIOSK_TOP = 2.94;
  for (const { name, layout, place } of ALL) {
    if (!place.kiosk) continue;
    assert.ok(layout.canopyY - KIOSK_TOP >= 0.5, `${name} : auvent à ${layout.canopyY} m`);
  }
});

test('le kiosque ne mord sur aucun accès vertical', () => {
  // Trémies, escaliers mécaniques et ascenseur sont posés par le gabarit, comme
  // lui : personne ne s'écarte, donc il faut que ça tombe juste.
  for (const { name, place } of ALL) {
    const k = place.kiosk;
    if (!k) continue;
    const others = [...place.stairs, ...place.escalators, ...(place.elevator ? [place.elevator] : [])];
    for (const o of others) {
      const dz = Math.abs(o.z - k.z) - (o.halfZ + k.halfZ);
      const dx = Math.abs(o.x - k.x) - (o.halfX + k.halfX);
      assert.ok(dz > 0 || dx > 0, `${name} : kiosque et accès en z=${o.z.toFixed(1)}`);
    }
  }
});

test('le konbini n’a coûté sa boutique à aucune gare en grandissant', () => {
  // La liste est celle des gares assez fréquentées (crowdScale ≥ 1,2) ET assez
  // larges pour garder deux mètres de passage. Elle ne doit pas rétrécir : un
  // konbini perdu à Takadanobaba serait passé inaperçu au rendu et se serait vu
  // dans le hall, un jour, sous la forme d'un mur nu.
  const withKonbini = ALL.filter(({ place }) =>
    place.interior.fixtures.some((f) => f.kind === 'konbini'),
  );
  const eligible = ALL.filter(({ layout, place }) => {
    const width = place.interior.free.x1 - place.interior.free.x0;
    // Une gare qui déclare une galerie l'obtient à la place du konbini : la
    // galerie passe avant, et une gare qui a l'une n'a pas besoin de l'autre.
    const gallery = place.interior.fixtures.some((f) => f.kind === 'gallery');
    return layout.crowdScale >= 1.2 && width >= 3.4 + 2 && !gallery;
  });
  for (const e of eligible) {
    assert.ok(
      withKonbini.some((k) => k.i === e.i),
      `${e.name} : konbini perdu`,
    );
  }
  assert.ok(withKonbini.length >= 6, `trop peu de konbini : ${withKonbini.length}`);
});

test('le konbini laisse deux mètres de passage dans le hall', () => {
  // La règle du hall, celle qui refuse un meuble plutôt que de l'y tasser.
  for (const { name, place } of ALL) {
    const it = place.interior;
    for (const f of it.fixtures) {
      if (f.kind !== 'konbini') continue;
      const depth = f.rect.x1 - f.rect.x0;
      const width = it.free.x1 - it.free.x0;
      assert.ok(width - depth >= 2 - 1e-9, `${name} : passage à ${(width - depth).toFixed(2)} m`);
    }
  }
});

test('le konbini reste en zone libre, jamais derrière les portillons', () => {
  // On n'achète pas son onigiri après avoir composté : la boutique est devant
  // la ligne, comme les distributeurs de titres et les consignes.
  for (const { name, place } of ALL) {
    for (const f of place.interior.fixtures) {
      if (f.kind !== 'konbini') continue;
      assert.ok(f.rect.z0 >= place.interior.free.z0 - 1e-9, `${name} : konbini en zone payante`);
    }
  }
});

test('le gabarit de charpente écarte ses poteaux du kiosque', () => {
  // Les poteaux d'épine des charpentes signature sont posés par data (avant le
  // placement) : ils lisent la même emprise de kiosque, ou ils s'y plantent.
  for (const { name, layout, place } of ALL) {
    const k = place.kiosk;
    if (!k || !layout.sigPlan) continue;
    for (const post of layout.sigPlan.posts) {
      const dz = Math.abs(post.z - k.z) - (k.halfZ + 0.35);
      const dx = Math.abs(post.x - k.x) - (k.halfX + 0.35);
      assert.ok(dz > 0 || dx > 0, `${name} : poteau de charpente dans le kiosque`);
    }
  }
});

test('les emprises déclarées sont bien celles que le rendu emploie', () => {
  // Le kiosque est le seul meuble de quai dont les cotes soient PARTAGÉES entre
  // trois fichiers - la géométrie les déclare, le placement les pose, le
  // gabarit de charpente les évite. Deux valeurs divergentes, et un poteau
  // d'auvent tombe dans la boutique sans que rien ne le dise.
  assert.equal(KIOSK_HALF_X * 2, 3);
  assert.equal(KIOSK_HALF_Z * 2, 6.4);
  // Et le kiosque tient sur la dalle : son nu ne déborde jamais du quai.
  for (const { name, layout, place } of ALL) {
    const k = place.kiosk;
    if (!k) continue;
    assert.ok(k.x - k.halfX >= PSD_X, `${name} : kiosque au-dessus de la voie`);
    assert.ok(k.x + k.halfX <= PSD_X + layout.depth, `${name} : kiosque hors dalle`);
  }
});
