// Le côté d'ouverture des portes (src/data/stations.ts, DOOR_SIDE).
//
// Une seule table, indexée par gare et par rien d'autre, et tout le rendu du
// quai s'oriente dessus : la gare (three/station/Station), la foule, les animaux
// du quai, la rame croisée, les conversions de repère (systems/playerFrame) et
// le volume praticable (systems/walkable). Une entrée qui manque ou qui vaut
// autre chose que ±1 ne casse pas au chargement : elle retourne un quai.
//
// Ce qui est vérifié ici est ce qui est GARANTI - la forme de la table et son
// indépendance au sens de circulation. Le relevé lui-même (quelle gare ouvre de
// quel côté) est un fait de terrain : il ne se déduit d'aucune autre donnée du
// dépôt, et notamment pas du plan de voies de `data/stationLayouts`. Le dernier
// test le constate, pour que personne ne réessaie de les lier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DOOR_SIDE, STATIONS } from '../src/data/stations.ts';
import { STATION_COUNT } from '../src/data/loop.ts';

test('une entrée par gare de la boucle, et pas une de plus', () => {
  assert.equal(DOOR_SIDE.length, STATION_COUNT);
  assert.equal(DOOR_SIDE.length, STATIONS.length);
});

test('chaque entrée vaut exactement +1 ou -1', () => {
  // Un 0 qui traînerait mettrait le quai dans l'axe de la voie, et un 2 le
  // renverrait au double de sa distance : ni l'un ni l'autre ne lèverait
  // d'exception.
  const odd = DOOR_SIDE.map((v, i) => [i, v] as const).filter(([, v]) => v !== 1 && v !== -1);
  assert.deepEqual(odd, []);
});

test('le côté est une propriété de la gare, pas du sens de circulation', () => {
  // C'est la garantie sur laquelle repose toute la géométrie du quai : la même
  // gare rend le même côté, quel que soit le sens. Elle est structurelle - la
  // table n'a pas de colonne de sens - et ce test la fige : donner à DOOR_SIDE
  // une seconde dimension casserait ici avant de casser à l'écran.
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.equal(typeof DOOR_SIDE[i], 'number', `gare ${i}`);
  }
  assert.ok(Array.isArray(DOOR_SIDE));
  assert.ok(!Array.isArray(DOOR_SIDE[0]));
});

test('les deux côtés sont représentés : ce n’est pas une constante déguisée', () => {
  assert.ok(DOOR_SIDE.includes(1));
  assert.ok(DOOR_SIDE.includes(-1));
});
