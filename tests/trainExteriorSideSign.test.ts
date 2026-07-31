import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardDestinations, STATIONS } from '../src/data/stations.ts';
import { nextStation } from '../src/data/loop.ts';

const textureSource = readFileSync(
  new URL('../src/textures/trainExterior.ts', import.meta.url),
  'utf8',
);
const consistSource = readFileSync(
  new URL('../src/three/exterior/TrainConsist.tsx', import.meta.url),
  'utf8',
);

test('les deux sens et Tokyo bouclent vers la bonne prochaine gare', () => {
  assert.equal(STATIONS[nextStation(0, 'inner')].romaji, 'Kanda');
  assert.equal(STATIONS[nextStation(0, 'outer')].romaji, 'Yūrakuchō');
  assert.equal(STATIONS[nextStation(29, 'inner')].romaji, 'Tokyo');
  assert.equal(STATIONS[nextStation(1, 'outer')].romaji, 'Tokyo');
});

test('les afficheurs reçoivent exactement deux grandes destinations', () => {
  for (const direction of ['inner', 'outer'] as const) {
    const destinations = boardDestinations(0, direction, 2);
    assert.equal(destinations.length, 2);
    assert.match(textureSource, /boardDestinations\(index, direction, 2\)/);
  }
});

test('les trois vues japonaise, anglaise et ligne sont alternées', () => {
  assert.match(textureSource, /'line' \| 'japanese' \| 'english'/);
  assert.match(textureSource, /Yamanote Line/);
  assert.match(textureSource, /次は/);
  assert.match(textureSource, /Bound for/);
  assert.match(textureSource, /join\(' & '\)/);
  assert.match(consistSource, /\['line', 'japanese', 'english'\]/);
});

test('un départ actualise la prochaine gare depuis store.index', () => {
  const beforeDeparture = 0;
  const afterDeparture = nextStation(beforeDeparture, 'inner');
  assert.equal(STATIONS[nextStation(beforeDeparture, 'inner')].romaji, 'Kanda');
  assert.equal(STATIONS[nextStation(afterDeparture, 'inner')].romaji, 'Akihabara');
  assert.match(consistSource, /const \{ doorSide, index, loopDirection \} = useStore\.getState\(\)/);
  assert.match(consistSource, /built\.sideSign\.redraw\(index, loopDirection, sideView\)/);
});
