// Le muret d'une porte palière, et la plaque qu'il porte
// (src/three/station/psdLayout.ts).
//
// Deux choses s'y jouent, et aucune des deux ne se voit dans une capture
// d'écran fixe :
//
//   - le MURET doit avaler le vantail grand ouvert, et le vantail doit tenir
//     dans son épaisseur. Sinon il ressort - soit par le bout du muret, soit
//     par sa face, où il balaierait alors la plaque de baie deux fois par
//     arrêt ;
//   - la PLAQUE 「N号車 M番ドア」 doit compter comme les repères peints au sol
//     (systems/stationPlacement) : voiture 1 au bout -z. Une plaque qui
//     compterait à l'envers enverrait le joueur à l'autre bout du quai.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { gateLabel, psdLayout } = await import('../src/three/station/psdLayout.ts');
const { CONSIST, E235, PLAYER_CAR } = await import('../src/data/e235.ts');
const { CONFIG } = await import('../src/data/config.ts');
const {
  PSD_HALF_GAP,
  PSD_LEAF_T,
  PSD_LEAF_TIP_INSET,
  PSD_LEAF_TRAVEL,
  PSD_LEAF_W,
  PSD_POCKET_LEN,
  PSD_WALL_T,
} = await import('../src/data/stationGeometry.ts');

const LENGTH = 224;

test('le muret avale le vantail grand ouvert', () => {
  // Chant extérieur du vantail à pleine course, compté depuis l'axe de la baie.
  const tip = PSD_LEAF_W + PSD_LEAF_TRAVEL + PSD_LEAF_TIP_INSET;
  assert.ok(
    PSD_POCKET_LEN >= tip - PSD_HALF_GAP,
    `poche ${PSD_POCKET_LEN} trop courte pour un vantail qui va jusqu'à ${tip - PSD_HALF_GAP}`,
  );
  // Et les tronçons courants sont assez longs pour la contenir : les baies sont
  // à cinq mètres, il reste donc 3,20 m de muret pour deux poches.
  const { segs } = psdLayout(LENGTH);
  const courants = segs.filter((s) => s.z1 - s.z0 > 3);
  assert.ok(courants.length > 30);
  for (const s of courants) assert.ok(s.z1 - s.z0 >= 2 * PSD_POCKET_LEN);
});

test("le vantail coulisse dans l'épaisseur du muret", () => {
  // C'est cet écart qui libère la face du quai. Un vantail qui déborde du
  // muret la balaie deux fois par arrêt, et rien ne peut y être collé - la
  // plaque de baie s'y ferait traverser à chaque ouverture.
  assert.ok(
    PSD_LEAF_T + 0.02 <= PSD_WALL_T,
    `vantail ${PSD_LEAF_T} trop épais pour un muret de ${PSD_WALL_T}`,
  );
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
