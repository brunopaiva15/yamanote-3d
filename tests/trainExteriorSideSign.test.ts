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

test('un seul petit afficheur par flanc précède les quatre portes', () => {
  assert.match(consistSource, /RoundedBoxGeometry\(1, 0\.28, 0\.055, 3, 0\.075\)/);
  assert.match(consistSource, /PlaneGeometry\(0\.9, 0\.2\)/);
  assert.match(consistSource, /sideSignCount = CARS \* 2/);
  assert.match(consistSource, /signOffset = E235\.doorCenters\[0\] - END_SIGN_INSET/);
  assert.doesNotMatch(consistSource, /doorCenters\[E235\.doorCenters\.length - 1\]/);
});

test('le boîtier est ancré dans la caisse et seule la dalle évite le z-fighting', () => {
  assert.match(consistSource, /halfWidth - 0\.025/);
  assert.match(consistSource, /halfWidth \+ 0\.003/);
  assert.doesNotMatch(consistSource, /halfWidth \+ 0\.06/);
});

test('le dessin reprend la nappe verte dégradée, le blanc froid et le 方面 ambre des E235', () => {
  assert.match(textureSource, /createLinearGradient\(0, top, 0, top \+ height\)/);
  assert.match(textureSource, /addColorStop\(0, '#06391f'\)/);
  assert.match(textureSource, /addColorStop\(1, '#b5ec58'\)/);
  assert.match(textureSource, /fillStyle = '#f5f7f2'/);
  assert.match(textureSource, /fillStyle = '#ffd33d'/);
  assert.match(textureSource, /fillText\('方面'/);
  assert.match(textureSource, /fillText\('Bound for'/);
});
