import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { ORIGINAL_MELODY_DEFINITIONS } from '../src/data/melodyDefinitions.ts';
import { createMelodyOperationPlan } from '../src/data/melodyOperation.ts';

// Le grep est fait en Node plutôt qu'en déléguant à `rg` : ripgrep est présent
// sur nos machines mais pas sur les runners GitHub, où le test cassait avec
// « spawnSync rg ENOENT ». On saute les entrées cachées, comme le ferait rg.
function grepFiles(root: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) found.push(...grepFiles(path, pattern));
    else if (entry.isFile() && pattern.test(readFileSync(path, 'utf8'))) found.push(path);
  }
  return found;
}

test('les 19 mélodies historiques ont des métadonnées originales', () => {
  assert.equal(ORIGINAL_MELODY_DEFINITIONS.length, 19);
  assert.equal(new Set(ORIGINAL_MELODY_DEFINITIONS.map((item) => item.audioPath)).size, 19);
  for (const item of ORIGINAL_MELODY_DEFINITIONS) {
    assert.equal(item.originalComposition, true);
    assert.equal(item.copyrightPolicy, 'original-no-motif-copy');
    assert.ok(item.displayName.length > 0);
    assert.ok(item.targetDuration > 0);
  }
});

test('le plan mélodique couvre saut, passage et second passage sans hasard caché', () => {
  const base = {
    stationCode: 'JY01', direction: 'inner' as const, platform: 4, dwellSeconds: 20,
    delayed: false, crowdLevel: 0.5, alternativePlatform: false, originating: false,
    terminating: false, outOfService: false, departureBlocked: false,
  };
  assert.equal(createMelodyOperationPlan(base, () => 0).preferredRounds, 2);
  assert.equal(createMelodyOperationPlan({ ...base, dwellSeconds: 10 }, () => 0).preferredRounds, 1);
  assert.equal(createMelodyOperationPlan({ ...base, outOfService: true }, () => 0).preferredRounds, 0);
  assert.equal(createMelodyOperationPlan({ ...base, departureBlocked: true }, () => 0).stopMode, 'incident-cut');
});

test('la liste gelée des accès directs à DOOR_SIDE ne peut pas grandir', () => {
  const files = [
    ...grepFiles('src', /\bDOOR_SIDE\b/),
    ...grepFiles('scripts', /\bDOOR_SIDE\b/),
  ].sort();
  assert.deepEqual(files, [
    'scripts/announcements-export.ts', 'scripts/pet-shots.mjs', 'src/data/districts.ts',
    'src/data/loop.ts', 'src/data/platforms.ts', 'src/data/stations.ts', 'src/dev/stationProbe.ts',
    'src/store.ts', 'src/systems/passingTrain.ts', 'src/systems/platformWait.ts',
    'src/systems/playerFrame.ts', 'src/systems/stationCycle.ts', 'src/systems/stationOcclusion.ts',
    'src/systems/walkable.ts', 'src/three/LibraryPlatformCrowd.tsx', 'src/three/PlatformPets.tsx',
    'src/three/ProceduralPlatformCrowd.tsx', 'src/three/exterior/PassingTrain.tsx',
    'src/three/station/Station.tsx',
  ]);
});
