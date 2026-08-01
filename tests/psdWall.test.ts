// La coupe d'une porte palière (src/three/station/psdLayout.ts).
//
// Deux choses s'y jouent, et aucune des deux ne se voit dans une capture
// d'écran fixe :
//
//   - la POCHE doit avaler le vantail grand ouvert. Trop courte d'un
//     centimètre, et le bout du vantail ressort DANS le panneau vitré à
//     chaque arrêt - une lame blanche qui traverse le verre pendant les
//     trente secondes d'échange ;
//   - la PLAQUE 「N号車 M番ドア」 doit compter comme les repères peints au sol
//     (systems/stationPlacement) : voiture 1 au bout -z. Une plaque qui
//     compterait à l'envers enverrait le joueur à l'autre bout du quai.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { gateLabel, psdLayout, psdWall } = await import('../src/three/station/psdLayout.ts');
const { CONSIST, E235, PLAYER_CAR } = await import('../src/data/e235.ts');
const { CONFIG } = await import('../src/data/config.ts');
const {
  PSD_HALF_GAP,
  PSD_LEAF_TIP_INSET,
  PSD_LEAF_TRAVEL,
  PSD_LEAF_W,
  PSD_POCKET_LEN,
} = await import('../src/data/stationGeometry.ts');

const LENGTH = 224;

test('la poche avale le vantail grand ouvert', () => {
  // Chant extérieur du vantail à pleine course, compté depuis l'axe de la baie.
  const tip = PSD_LEAF_W + PSD_LEAF_TRAVEL + PSD_LEAF_TIP_INSET;
  assert.ok(
    PSD_POCKET_LEN >= tip - PSD_HALF_GAP,
    `poche ${PSD_POCKET_LEN} trop courte pour un vantail qui va jusqu'à ${tip - PSD_HALF_GAP}`,
  );
});

test('chaque tronçon courant est vitré entre ses deux poches', () => {
  const { segs, gaps } = psdLayout(LENGTH);
  const wall = psdWall(segs);
  // Les baies sont à 5 m : un tronçon courant fait 5 - 1,8 = 3,2 m, il reste
  // donc du panneau fixe entre les deux poches.
  assert.ok(wall.panes.length >= gaps.length - 2);
  for (const p of wall.panes) assert.ok(p.z1 > p.z0);
  // Plein et vitré se partagent exactement la longueur des murets, sans jour.
  const total = (spans: { z0: number; z1: number }[]) =>
    spans.reduce((s, x) => s + (x.z1 - x.z0), 0);
  assert.ok(Math.abs(total(wall.solids) + total(wall.panes) - total(segs)) < 1e-9);
  assert.equal(wall.aprons.length, wall.panes.length);
});

test('aucun panneau vitré ne mord sur une baie', () => {
  const { segs, gaps } = psdLayout(LENGTH);
  for (const p of psdWall(segs).panes) {
    for (const g of gaps) {
      assert.ok(
        p.z1 <= g - PSD_HALF_GAP + 1e-9 || p.z0 >= g + PSD_HALF_GAP - 1e-9,
        `panneau [${p.z0}, ${p.z1}] à cheval sur la baie ${g}`,
      );
    }
  }
});

test('la plaque de baie porte le numéro de la voiture qui s\'y arrête', () => {
  // La voiture du joueur est centrée sur le quai : ses quatre baies portent
  // toutes son numéro, et elles seules.
  for (const dz of CONFIG.doorCenters) {
    assert.equal(gateLabel(dz).car, CONSIST[PLAYER_CAR].no);
  }
  // Voiture 1 au bout -z, voiture 11 au bout +z, comme les repères au sol.
  const half = (CONSIST.length - 1) / 2;
  assert.equal(gateLabel(-half * E235.pitch + CONFIG.doorCenters[0]).car, 1);
  assert.equal(gateLabel(half * E235.pitch + CONFIG.doorCenters[3]).car, CONSIST.length);
});

test('les quatre portes d\'une voiture sont numérotées dans le sens des voitures', () => {
  const seen = CONFIG.doorCenters.map((dz) => gateLabel(dz).door);
  assert.deepEqual(seen, [1, 2, 3, 4]);
  // Et le quai entier n'a que des rangs valides, une fois par voiture.
  const { gaps } = psdLayout(LENGTH);
  const tally = new Map<string, number>();
  for (const g of gaps) {
    const { car, door } = gateLabel(g);
    assert.ok(door >= 1 && door <= CONFIG.doorCenters.length);
    const key = `${car}-${door}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  for (const [key, n] of tally) assert.equal(n, 1, `plaque ${key} en double`);
});
