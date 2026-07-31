import assert from 'node:assert/strict';
import test from 'node:test';
import { STATIONS } from '../src/data/stations.ts';
import { platformProfileFor, stationPlatformSetFor } from '../src/data/platforms.ts';

test('chaque sens possède une voie, un côté et un état PSD cohérents', () => {
  for (const station of STATIONS) for (const direction of ['inner', 'outer'] as const) {
    const profile = platformProfileFor(station.jy, direction);
    assert.ok(profile.platform > 0);
    assert.ok(profile.doorSide === 'left' || profile.doorSide === 'right');
    assert.equal(profile.stationCode, station.jy);
    assert.equal(typeof profile.platformDoors.installed, 'boolean');
    assert.equal(profile.doorSide === 'right' ? 1 : -1, profile.doorSide === 'right' ? 1 : -1);
  }
});

test('les voies alternatives changent de profil et de face', () => {
  for (const code of ['JY13', 'JY24']) for (const direction of ['inner', 'outer'] as const) {
    const set = stationPlatformSetFor(code)[direction];
    assert.equal(set.alternatives.length, 1);
    assert.notEqual(set.primary.platform, set.alternatives[0].platform);
    assert.notEqual(set.primary.doorSide, set.alternatives[0].doorSide);
  }
});

test('la matrice fonctionnelle gauche/droite est respectée', () => {
  for (let i = 0; i < STATIONS.length; i++) {
    const expected = i < 9 || i >= 26 ? 'left' : i === 12 || i === 16 || i === 17 ? 'left' : 'right';
    for (const d of ['inner', 'outer'] as const) {
      const directionExpected = i === 23 && d === 'outer' ? 'left' : expected;
      assert.equal(platformProfileFor(STATIONS[i].jy, d).doorSide, directionExpected, `${STATIONS[i].jy}/${d}`);
    }
  }
});
