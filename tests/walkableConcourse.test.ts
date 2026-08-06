// Marche quai → hall : plus de cul-de-sac à cinq marches.
//
// Ce fichier visait au départ une API qui n'a jamais existé - STAIR_TO_CONCOURSE_*,
// `placement.concourse`, `concourseAt` - et échouait donc à l'import, sur des
// `undefined` transformés en NaN. L'INTENTION, elle, était juste, et le jeu la
// remplit : la volée principale descend (ou monte) jusqu'au hall, et le hall
// existe. Seuls les noms ont changé en cours de route.
//
// Ce qui porte réellement la fonction :
//   - data/stationGeometry : DESCENT_LEN / ASCENT_LEN et leurs profils ;
//   - systems/stationLevels : mainAccessFloor, la SEULE fonction du jeu qui
//     fasse changer d'étage, et concourseFloorAt pour le plancher du hall ;
//   - placement.interior : le hall lui-même, zones payante et libre.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  ASCENT_LEN,
  ascentFloorY,
  DESCENT_LEN,
  descentFloorY,
  STAIR_WALK_LEN,
} = await import('../src/data/stationGeometry.ts');
const { circulationFor } = await import('../src/data/stationCirculation.ts');
const { placementFor, stairTopZ } = await import('../src/systems/stationPlacement.ts');
const { concourseFloorAt, mainAccessFloor } = await import('../src/systems/stationLevels.ts');

/** Nippori a ses deux ponts-concours propres, et pas de hall générique. */
const SANS_HALL_GENERIQUE = 6;

test('le profil d’escalier atteint le plancher du hall', () => {
  const p = placementFor(0, []);
  const y = descentFloorY(DESCENT_LEN);
  assert.ok(
    Math.abs(y - p.interior.floorY) < 0.05,
    `pied de volée ${y.toFixed(2)}, plancher ${p.interior.floorY.toFixed(2)}`,
  );
});

test('la descente joueur dépasse l’ancienne limite de 5 marches', () => {
  assert.ok(DESCENT_LEN > STAIR_WALK_LEN, `${DESCENT_LEN} <= ${STAIR_WALK_LEN}`);
  assert.ok(ASCENT_LEN > STAIR_WALK_LEN, `${ASCENT_LEN} <= ${STAIR_WALK_LEN}`);
});

test('placement expose un hall pour chaque gare', () => {
  for (let i = 0; i < 30; i++) {
    const p = placementFor(i, []);
    assert.ok(p.stairs.length >= 1, `JY escaliers ${i}`);
    assert.ok(p.mainStair, `JY volée principale ${i}`);
    if (i === SANS_HALL_GENERIQUE) {
      assert.equal(p.interior.built, false, 'Nippori garde ses ponts-concours');
      continue;
    }
    const it = p.interior;
    assert.ok(it.built, `JY hall ${i}`);
    assert.ok(it.paid.x1 > it.paid.x0, `JY largeur de hall ${i}`);
    assert.ok(it.free.z1 > it.paid.z0, `JY profondeur de hall ${i}`);
    // Le hall est troué par les bornes de portillons : on cherche un point de
    // sol plutôt que d'en supposer un, sinon le test dépend de leur position.
    let touche = 0;
    for (let k = 1; k < 10; k++) {
      const x = it.paid.x0 + ((it.paid.x1 - it.paid.x0) * k) / 10;
      for (let m = 1; m < 10; m++) {
        const z = it.paid.z0 + ((it.free.z1 - it.paid.z0) * m) / 10;
        const y = concourseFloorAt(p, x, z);
        if (y !== null) {
          assert.equal(y, it.floorY, `JY plancher ${i}`);
          touche++;
        }
      }
    }
    assert.ok(touche > 0, `JY sol de hall introuvable ${i}`);
  }
});

test('trémie praticable jusqu’au pied (Mejiro montée / Tokyo descente)', () => {
  const tokyo = placementFor(0, []);
  assert.equal(tokyo.mainRise, 'down');
  assert.equal(circulationFor(0).accessDir, 'down');
  const bas = mainAccessFloor(
    tokyo,
    tokyo.mainStair.x,
    stairTopZ(tokyo.mainStair) + DESCENT_LEN - 0.1,
  );
  assert.ok(bas, 'pied de la volée de Tokyo');
  assert.ok(bas!.y < -2, `tokyo y=${bas!.y}`);
  assert.equal(bas!.level, 'concourse');

  const mejiro = placementFor(13, []);
  assert.equal(mejiro.mainRise, 'up');
  assert.equal(circulationFor(13).accessDir, 'up');
  const haut = mainAccessFloor(
    mejiro,
    mejiro.mainStair.x,
    stairTopZ(mejiro.mainStair) + ASCENT_LEN - 0.1,
  );
  assert.ok(haut, 'haut de la volée de Mejiro');
  assert.ok(haut!.y > 2, `mejiro y=${haut!.y}`);
  assert.equal(haut!.level, 'concourse');
  assert.ok(
    Math.abs(ascentFloorY(ASCENT_LEN) - mejiro.interior.floorY) < 0.05,
    `haut de volée ${ascentFloorY(ASCENT_LEN)}, plancher ${mejiro.interior.floorY}`,
  );
});
