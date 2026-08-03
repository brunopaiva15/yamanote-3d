// LE CONTOUR D'UN VOLUME N'EST PAS SA BOÎTE.
//
// `shellsOf` rend l'ENVELOPPE des pièces continues — un rectangle — et le rendu
// s'en servait pour tout. À Shinagawa, l'enveloppe fait 3 547 m² là où les
// pièces en occupent 2 308 : il restait 1 239 m² de plancher dessiné, éclairé,
// entouré de murs, et impossible à fouler. Six mille trois cent quarante-cinq
// sur la ligne, et un seul volume sur trente-deux n'en avait pas.
//
// Ce que ce fichier tient : les bandes couvrent EXACTEMENT ce que les pièces
// occupent, ni plus (sinon le fantôme revient) ni moins (sinon on ferme un
// passage). C'est la seule propriété dont le rendu a besoin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { shellsOf } = await import('../src/data/stationConcourseBuild.ts');
const { footprintOf, without } = await import('../src/data/concourseBands.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');

const GATES = psdGates();
const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;

test('toute pièce est dans une bande, et aucune bande n’est plus large qu’elle', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    for (const s of shellsOf(placementFor(i, GATES).network)) {
      const { alongZ, bands } = footprintOf(s);
      assert.ok(bands.length > 0, `${NAME(i)} : un volume sans bande`);
      const rects = [...s.rooms.map((r) => r.rect), ...s.gates.map((g) => g.rect)];
      for (const r of rects) {
        const [a0, a1] = alongZ ? [r.z0, r.z1] : [r.x0, r.x1];
        const [c0, c1] = alongZ ? [r.x0, r.x1] : [r.z0, r.z1];
        // Une pièce tient dans une bande : sinon le rendu poserait une paroi
        // au milieu d'elle.
        const host = bands.find((b) => b.a0 <= a0 + 0.05 && b.a1 >= a1 - 0.05);
        assert.ok(host, `${NAME(i)} : ${JSON.stringify(r)} à cheval sur deux bandes`);
        assert.ok(
          host.c0 <= c0 + 1e-6 && host.c1 >= c1 - 1e-6,
          `${NAME(i)} : une bande plus étroite que sa pièce`,
        );
      }
      // Et aucune bande n'est plus large que la plus large de ses pièces : une
      // bande trop large, c'est le fantôme qui revient par la fenêtre.
      for (const b of bands) {
        const inside = rects.filter((r) => {
          const [a0, a1] = alongZ ? [r.z0, r.z1] : [r.x0, r.x1];
          return a0 < b.a1 - 0.05 && a1 > b.a0 + 0.05;
        });
        assert.ok(inside.length, `${NAME(i)} : une bande sans pièce`);
        const c0 = Math.min(...inside.map((r) => (alongZ ? r.x0 : r.z0)));
        const c1 = Math.max(...inside.map((r) => (alongZ ? r.x1 : r.z1)));
        assert.equal(b.c0, c0, `${NAME(i)} : bande trop large en deçà`);
        assert.equal(b.c1, c1, `${NAME(i)} : bande trop large au-delà`);
      }
    }
  }
});

test('les bandes se suivent sans trou : on franchit un contrôle', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    for (const s of shellsOf(placementFor(i, GATES).network)) {
      const { bands } = footprintOf(s);
      for (let k = 1; k < bands.length; k++) {
        assert.ok(
          Math.abs(bands[k].a0 - bands[k - 1].a1) < 1e-6,
          `${NAME(i)} : un trou entre deux bandes`,
        );
      }
    }
  }
});

test('une bande colle à ses pièces, la boîte non', () => {
  // La mesure qui a déclenché tout ceci. Ce que la boîte a de plus que les
  // bandes passe désormais DERRIÈRE une paroi : ce n'est plus du hall, c'est
  // du dehors. Ce qui doit rester petit, c'est ce que les BANDES ont de plus
  // que leurs pièces — car cela, on le voit encore.
  let boxOver = 0;
  let bandOver = 0;
  let rooms = 0;
  for (let i = 0; i < STATION_COUNT; i++) {
    for (const s of shellsOf(placementFor(i, GATES).network)) {
      const { bands } = footprintOf(s);
      const rects = [...s.rooms.map((r) => r.rect), ...s.gates.map((g) => g.rect)];
      const box = (s.rect.x1 - s.rect.x0) * (s.rect.z1 - s.rect.z0);
      const band = bands.reduce((n, b) => n + (b.a1 - b.a0) * (b.c1 - b.c0), 0);
      const real = rects.reduce((n, r) => n + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
      assert.ok(band <= box + 1e-6, `${NAME(i)} : des bandes plus grandes que la boîte`);
      boxOver += box - real;
      bandOver += Math.max(0, band - real);
      rooms += real;
    }
  }
  // Les chiffres du jour où on l'a trouvé : 6 345 m² de plancher fantôme dans
  // la boîte, sur 32 000 m² de pièces. Les bandes en gardent moins d'un
  // dixième — le décalage inévitable entre deux pièces voisines de largeurs
  // différentes, qu'aucune bande rectangulaire ne peut éviter.
  assert.ok(boxOver > 5000, `la boîte ne déborde plus que de ${Math.round(boxOver)} m²`);
  assert.ok(
    bandOver < rooms * 0.1,
    `les bandes débordent de ${Math.round(bandOver)} m² pour ${Math.round(rooms)} m² de pièces`,
  );
});

test('ce qui est dans l’un et pas dans l’autre', () => {
  assert.deepEqual(without(0, 10, 3, 7), [[0, 3], [7, 10]]);
  assert.deepEqual(without(0, 10, 0, 10), []);
  assert.deepEqual(without(0, 10, -5, 5), [[5, 10]]);
  assert.deepEqual(without(0, 10, 20, 30), [[0, 10]]);
  // Un éclat de cinq centimètres n'est pas une paroi.
  assert.deepEqual(without(0, 10, 0.02, 30), []);
});
