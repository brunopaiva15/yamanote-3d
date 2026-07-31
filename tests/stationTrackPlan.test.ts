// Le plan de voies de la boucle, gare par gare - relevé JR East de janvier 2026.
//
// Trois tables décrivent la même gare sous trois angles, et rien ne les reliait :
// le numéro de voie par sens (data/platforms), le côté d'ouverture
// (data/stations, DOOR_SIDE) et la famille de quai (data/stationLayouts,
// `config`). Tant qu'elles vivaient chacune de leur côté, une correction
// apportée à l'une laissait les deux autres en arrière - c'est exactement ce
// qui s'était produit : un côté d'ouverture hérité, faux pour quinze gares, et
// trois gares rangées en îlot Yamanote alors qu'elles partagent leurs îlots.
//
// Ce fichier est le relevé lui-même, écrit une fois, et les trois tables sont
// vérifiées EN FACE de lui. Ce n'est pas une quatrième source : rien du jeu ne
// l'importe, et une ligne qui bouge ici doit bouger dans les données, pas
// l'inverse.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DOOR_SIDE, STATIONS } from '../src/data/stations.ts';
import { layoutFor } from '../src/data/stationLayouts.ts';
import { doorSideNameFor, platformFor, stationPlatformSetFor } from '../src/data/platforms.ts';
import { STATION_COUNT } from '../src/data/loop.ts';

type Side = 'left' | 'right';
type Family = 'island' | 'sharedIsland' | 'side' | 'terminusIsland';

interface Row {
  jy: string;
  name: string;
  /** Voie et côté d'ouverture en 内回り. */
  inner: [track: number, side: Side];
  /** Voie et côté d'ouverture en 外回り. */
  outer: [track: number, side: Side];
  /** Voies de départ / terminus, quand la gare en a. */
  terminal?: { track: number; side: Side }[];
  family: Family;
}

/**
 * Le relevé. L'ordre est celui des codes JY, c'est-à-dire celui de STATIONS.
 *
 * Le côté est donné EN REGARDANT DANS LE SENS DE MARCHE. Il se retrouve dans
 * la géométrie : quai entre les deux voies -> à droite (circulation à gauche) ;
 * deux voies Yamanote au centre d'un faisceau, un quai à l'extérieur de
 * chacune -> à gauche. Ōsaki et Shinagawa n'entrent dans aucune des deux
 * lectures, chacune pour une raison de site : ce sont des relevés, pas des
 * déductions.
 */
const PLAN: readonly Row[] = [
  { jy: 'JY01', name: 'Tokyo', inner: [4, 'left'], outer: [5, 'left'], family: 'sharedIsland' },
  { jy: 'JY02', name: 'Kanda', inner: [3, 'left'], outer: [2, 'left'], family: 'sharedIsland' },
  { jy: 'JY03', name: 'Akihabara', inner: [2, 'left'], outer: [3, 'left'], family: 'sharedIsland' },
  { jy: 'JY04', name: 'Okachimachi', inner: [3, 'left'], outer: [2, 'left'], family: 'sharedIsland' },
  { jy: 'JY05', name: 'Ueno', inner: [2, 'left'], outer: [3, 'left'], family: 'sharedIsland' },
  { jy: 'JY06', name: 'Uguisudani', inner: [2, 'left'], outer: [3, 'left'], family: 'sharedIsland' },
  { jy: 'JY07', name: 'Nippori', inner: [11, 'left'], outer: [10, 'left'], family: 'sharedIsland' },
  { jy: 'JY08', name: 'Nishi-Nippori', inner: [3, 'left'], outer: [2, 'left'], family: 'sharedIsland' },
  { jy: 'JY09', name: 'Tabata', inner: [2, 'left'], outer: [3, 'left'], family: 'sharedIsland' },
  { jy: 'JY10', name: 'Komagome', inner: [2, 'right'], outer: [1, 'right'], family: 'island' },
  { jy: 'JY11', name: 'Sugamo', inner: [2, 'right'], outer: [1, 'right'], family: 'island' },
  { jy: 'JY12', name: 'Ōtsuka', inner: [1, 'right'], outer: [2, 'right'], family: 'island' },
  {
    jy: 'JY13',
    name: 'Ikebukuro',
    inner: [6, 'left'],
    outer: [7, 'left'],
    // Les deux voies terminales bordent la face extérieure de leur îlot.
    terminal: [{ track: 5, side: 'right' }, { track: 8, side: 'right' }],
    family: 'terminusIsland',
  },
  { jy: 'JY14', name: 'Mejiro', inner: [1, 'right'], outer: [2, 'right'], family: 'island' },
  { jy: 'JY15', name: 'Takadanobaba', inner: [2, 'right'], outer: [1, 'right'], family: 'island' },
  { jy: 'JY16', name: 'Shin-Ōkubo', inner: [2, 'right'], outer: [1, 'right'], family: 'island' },
  { jy: 'JY17', name: 'Shinjuku', inner: [14, 'left'], outer: [15, 'left'], family: 'sharedIsland' },
  { jy: 'JY18', name: 'Yoyogi', inner: [2, 'left'], outer: [1, 'left'], family: 'sharedIsland' },
  { jy: 'JY19', name: 'Harajuku', inner: [1, 'right'], outer: [2, 'right'], family: 'side' },
  { jy: 'JY20', name: 'Shibuya', inner: [2, 'right'], outer: [1, 'right'], family: 'island' },
  { jy: 'JY21', name: 'Ebisu', inner: [2, 'right'], outer: [1, 'right'], family: 'island' },
  { jy: 'JY22', name: 'Meguro', inner: [1, 'right'], outer: [2, 'right'], family: 'island' },
  { jy: 'JY23', name: 'Gotanda', inner: [1, 'right'], outer: [2, 'right'], family: 'island' },
  {
    jy: 'JY24',
    name: 'Ōsaki',
    inner: [1, 'right'],
    // La seule voie RÉGULIÈRE de la boucle qui n'ouvre pas du côté de sa gare.
    outer: [3, 'left'],
    terminal: [{ track: 2, side: 'left' }, { track: 4, side: 'right' }],
    family: 'terminusIsland',
  },
  { jy: 'JY25', name: 'Shinagawa', inner: [1, 'right'], outer: [3, 'right'], family: 'sharedIsland' },
  { jy: 'JY26', name: 'Takanawa Gateway', inner: [1, 'right'], outer: [2, 'right'], family: 'island' },
  { jy: 'JY27', name: 'Tamachi', inner: [2, 'left'], outer: [3, 'left'], family: 'sharedIsland' },
  { jy: 'JY28', name: 'Hamamatsuchō', inner: [2, 'left'], outer: [3, 'left'], family: 'sharedIsland' },
  { jy: 'JY29', name: 'Shimbashi', inner: [5, 'left'], outer: [4, 'left'], family: 'sharedIsland' },
  { jy: 'JY30', name: 'Yūrakuchō', inner: [2, 'left'], outer: [3, 'left'], family: 'sharedIsland' },
];

test('le relevé couvre les trente gares, dans l’ordre des codes JY', () => {
  assert.equal(PLAN.length, STATION_COUNT);
  assert.deepEqual(PLAN.map((r) => r.jy), STATIONS.map((s) => s.jy));
});

test('les numéros de voie sont ceux de data/platforms', () => {
  for (const row of PLAN) {
    assert.equal(platformFor(row.jy, 'inner')?.platform, row.inner[0], `${row.jy} intérieure`);
    assert.equal(platformFor(row.jy, 'outer')?.platform, row.outer[0], `${row.jy} extérieure`);
  }
});

test('le côté d’ouverture de chaque voie régulière est celui du relevé', () => {
  for (const row of PLAN) {
    assert.equal(doorSideNameFor(row.jy, 'inner'), row.inner[1], `${row.jy} intérieure`);
    assert.equal(doorSideNameFor(row.jy, 'outer'), row.outer[1], `${row.jy} extérieure`);
  }
});

test('les voies terminales d’Ikebukuro et d’Ōsaki ouvrent de leur propre côté', () => {
  const withTerminal = PLAN.filter((r) => r.terminal);
  assert.deepEqual(withTerminal.map((r) => r.jy), ['JY13', 'JY24']);
  for (const row of withTerminal) {
    const set = stationPlatformSetFor(row.jy);
    const found = [...set.inner.alternatives, ...set.outer.alternatives]
      .map((p) => ({ track: p.platform, side: p.doorSide }))
      .sort((a, b) => a.track - b.track);
    assert.deepEqual(found, row.terminal, row.jy);
  }
});

test('DOOR_SIDE porte le côté de la GARE, jamais celui d’une voie particulière', () => {
  // Le côté de la gare est celui de ses voies régulières. Les deux directions
  // s'accordent partout sauf à Ōsaki, où elles n'empruntent pas le même îlot :
  // c'est data/platforms qui porte cette voie-là, et DOOR_SIDE garde le côté du
  // quai que le jeu construit - celui de la voie intérieure.
  const split = PLAN.filter((r) => r.inner[1] !== r.outer[1]);
  assert.deepEqual(split.map((r) => r.jy), ['JY24']);
  for (let i = 0; i < STATION_COUNT; i++) {
    const expected = PLAN[i].inner[1] === 'right' ? 1 : -1;
    assert.equal(DOOR_SIDE[i], expected, `${PLAN[i].jy} ${PLAN[i].name}`);
  }
});

test('la famille de quai est celle de data/stationLayouts', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.equal(layoutFor(i).config, PLAN[i].family, `${PLAN[i].jy} ${PLAN[i].name}`);
  }
});

test('la géométrie explique le côté partout où elle le peut', () => {
  // Ce test ne DÉDUIT rien : il constate que le relevé est cohérent avec la
  // circulation à gauche, et nomme les deux gares qui y échappent. Si une
  // troisième s'y ajoute un jour, c'est ici qu'il faudra la justifier.
  const exceptions = new Set(['JY24 Ōsaki', 'JY25 Shinagawa', 'JY19 Harajuku']);
  for (const row of PLAN) {
    const key = `${row.jy} ${row.name}`;
    if (exceptions.has(key)) continue;
    // Îlot entre les deux voies -> à droite. Paire centrale encadrée -> à gauche.
    const expected = row.family === 'island' ? 'right' : 'left';
    assert.equal(row.inner[1], expected, key);
    assert.equal(row.outer[1], expected, key);
  }
});

test('les deux tableaux de docs/ suivent les données', () => {
  // Ils se lisent entièrement dans stationPlatformSetFor : tenus à la main, ils
  // sortaient d'un relevé de retard. `--check` les recompose et compare.
  execFileSync('node', ['scripts/platform-docs.mjs', '--check'], { stdio: 'pipe' });
});
