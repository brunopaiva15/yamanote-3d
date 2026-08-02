// Les sorties nommées (src/data/lines) et les portillons (src/data/stationInterior).
//
// Elles étaient génériques pour vingt-quatre gares sur trente : un 中央口 suivi
// d'un point cardinal tiré par `index % 4`. Les trente plans officiels ayant
// été lus (docs/STATION_CONCOURSE_EVIDENCE.md), elles sont désormais relevées.
//
// CE QUE CE TEST PROTÈGE, et ce n'est pas l'exactitude - un test ne sait pas
// lire un plan - mais la DISCIPLINE qui la rend vérifiable :
//
//   · qu'aucune gare ne retombe en silence sur la rotation générique ;
//   · que la liste des noms NON RELEVÉS reste fermée, et qu'elle ne grossisse
//     pas d'une gare sans que quelqu'un l'écrive ;
//   · qu'une sortie ne soit pas confondue avec un portillon - la faute que le
//     relevé a trouvée quatre fois dans le dépôt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { stationExitPlan, stationExits } from '../src/data/lines.ts';
import { gateNameFor } from '../src/data/stationInterior.ts';
import { STATION_COUNT } from '../src/data/loop.ts';
import { STATIONS } from '../src/data/stations.ts';

const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;

test('les trente gares ont un relevé de sorties, complet et sans doublon', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const plan = stationExitPlan(i);
    assert.ok(plan.length >= 2, `${NAME(i)} : moins de deux sorties`);
    const seen = new Set<string>();
    for (const e of plan) {
      assert.ok(e.jp.length > 0, `${NAME(i)} : sortie sans nom japonais`);
      assert.ok(e.en.length > 0, `${NAME(i)} : sortie sans nom anglais`);
      assert.ok(!seen.has(e.jp), `${NAME(i)} : ${e.jp} en double`);
      seen.add(e.jp);
    }
  }
  // La boucle se replie, comme partout ailleurs.
  assert.deepEqual(stationExitPlan(30), stationExitPlan(0));
  assert.deepEqual(stationExitPlan(-1), stationExitPlan(29));
});

test('la potence du quai n’en affiche que deux, les deux premières du relevé', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const two = stationExits(i);
    assert.equal(two.length, 2, NAME(i));
    assert.deepEqual(two, stationExitPlan(i).slice(0, 2), NAME(i));
  }
});

test('aucune gare ne retombe sur l’ancienne rotation générique', () => {
  // L'ancienne table produisait 中央口 en tête pour VINGT-QUATRE gares, et le
  // second nom par `index % 4`. Si ce motif réapparaît en masse, c'est que
  // quelqu'un a remis un fallback.
  const leadCentral = Array.from({ length: STATION_COUNT }, (_, i) => stationExits(i)[0].jp)
    .filter((jp) => jp === '中央口').length;
  assert.ok(
    leadCentral <= 2,
    `${leadCentral} gares mènent par 中央口 : la rotation générique est revenue`,
  );
  // Et les quatre corrections du relevé tiennent.
  assert.equal(stationExits(1)[0].jp, '西口', 'JY02 Kanda');
  assert.ok(
    stationExitPlan(18).some((e) => e.jp === '竹下口'),
    'JY19 Harajuku : 竹下口 absent',
  );
  assert.equal(stationExits(28)[0].jp, '烏森口', 'JY29 Shimbashi');
  assert.equal(stationExits(5)[0].jp, '南口', 'JY06 Uguisudani');
});

test('la liste des noms non relevés est fermée, et nommée', () => {
  // Six gares dont le plan lu ne nomme aucune sortie. Elles portent des noms
  // usuels, et c'est légitime - mais cela doit rester VISIBLE et BORNÉ.
  const expected = ['JY08 Nishi-Nippori', 'JY14 Mejiro', 'JY16 Shin-Ōkubo', 'JY22 Meguro'];
  const actual: string[] = [];
  for (let i = 0; i < STATION_COUNT; i++) {
    if (stationExitPlan(i).some((e) => e.unsourced)) actual.push(NAME(i));
  }
  assert.deepEqual(
    actual,
    expected,
    'la liste des gares aux sorties non relevées a changé sans être redocumentée',
  );
});

test('un portillon n’est pas une sortie', () => {
  // LA FAUTE QUE LE RELEVÉ A TROUVÉE QUATRE FOIS. Le dépôt donnait « West »
  // comme nom de portillon à Harajuku, 烏森口 à Shimbashi, 西口改札 à Kanda et
  // 南口改札 à Uguisudani - alors que les plans réservent ces noms aux SORTIES,
  // ou ne nomment tout simplement pas le contrôle.
  //
  // Il n'y a PAS de règle morphologique à tester : un 改札 japonais s'appelle
  // aussi bien 中央改札 que 丸の内中央口 ou 電気街口, et Tokyo nomme réellement
  // ses contrôles en 〜口. Ce qui se teste, c'est le RELEVÉ.
  assert.equal(gateNameFor(18).jp, '表参道改札', 'JY19 Harajuku');
  assert.equal(gateNameFor(28).jp, '南改札', 'JY29 Shimbashi');

  // Les huit gares dont le plan n'attribue AUCUN nom au contrôle portent
  // 改札口 - ce que JR East imprime réellement sur un 改札 sans qualificatif -
  // et pas un point cardinal inventé. Liste fermée : une gare de plus ici est
  // une décision, pas un glissement.
  const anonymous = [1, 5, 7, 9, 10, 11, 13, 15];
  for (const i of anonymous) {
    assert.equal(gateNameFor(i).jp, '改札口', `${NAME(i)} : contrôle anonyme mal nommé`);
    assert.equal(gateNameFor(i).romaji, 'Gate', NAME(i));
  }
  for (let i = 0; i < STATION_COUNT; i++) {
    if (anonymous.includes(i)) continue;
    assert.notEqual(
      gateNameFor(i).jp,
      '改札口',
      `${NAME(i)} : contrôle devenu anonyme sans être ajouté à la liste`,
    );
  }
});
