import assert from 'node:assert/strict';
import test from 'node:test';
import { STATIONS } from '../src/data/stations.ts';
import {
  YAMANOTE_PLATFORMS, doorSideFor, hasPlatformDoorsFor, platformFor,
  platformProfileFor, stationPlatformSetFor,
} from '../src/data/platforms.ts';
import { atosVoiceForDirection, atosVoiceForPlatform } from '../src/data/stationAnnouncements.ts';
import { approachChimeFor } from '../src/data/approachChimes.ts';

test('les 30 gares et les deux sens possèdent un profil composé compatible', () => {
  assert.equal(STATIONS.length, 30);
  for (const station of STATIONS) {
    const set = stationPlatformSetFor(station.jy);
    for (const direction of ['inner', 'outer'] as const) {
      const legacy = YAMANOTE_PLATFORMS[station.jy][direction];
      assert.equal(set[direction].primary.platform, legacy.platform);
      assert.deepEqual(platformFor(station.jy, direction), legacy);
      assert.ok([1, -1].includes(doorSideFor(station.jy, direction)));
    }
  }
});

test('Ikebukuro et Osaki résolvent leurs huit profils principaux/alternatifs', () => {
  for (const code of ['JY13', 'JY24']) {
    for (const direction of ['inner', 'outer'] as const) {
      const primary = platformProfileFor(code, direction);
      const alternative = platformProfileFor(code, direction, { alternative: true });
      assert.notEqual(primary.platform, alternative.platform);
      assert.ok(alternative.serviceRoles.includes('alternative'));
      assert.equal(hasPlatformDoorsFor(code, direction, primary.platform), primary.platformDoors.installed);
      assert.equal(hasPlatformDoorsFor(code, direction, alternative.platform), alternative.platformDoors.installed);
    }
  }
});

test('voix et carillon par quai gardent leurs fallbacks', () => {
  for (const direction of ['inner', 'outer'] as const) {
    assert.equal(atosVoiceForPlatform('JY01', direction, direction === 'inner' ? 4 : 5), atosVoiceForDirection(direction));
    const chime = approachChimeFor('JY01', direction, 4);
    assert.equal(chime.originalComposition, true);
    assert.ok(chime.duration > 0);
  }
});
