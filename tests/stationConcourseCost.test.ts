// LE BUDGET DU RELEVÉ (phase 28).
//
// La phase 28 mesure ce que le relevé coûte : `scripts/concourse-cost` rend un
// tableau avant/après, et le bilan est écrit dans `STATION_CONCOURSE_SCOPE`.
// Un tableau écrit n'empêche rien, et un temps mesuré n'empêche rien non plus —
// il dépend de la machine, de la charge, de l'humeur du ramasse-miettes, et un
// test bâti dessus tombe un jour sur deux pour de mauvaises raisons.
//
// CE QU'ON TIENT ICI EST DONC LA STRUCTURE, qui est exacte, reproductible et
// qui est ce que le temps SUIT : la marche parcourt la liste des obstacles à
// chaque pas, le rendu monte un maillage par pièce et par meuble, la
// compilation fait un tour de chaque tableau du profil. Un jour où l'un de ces
// comptes double, le temps double avec lui — et c'est ce jour-là qu'il faut le
// savoir, pas six mois plus tard sur une capture d'écran.
//
// Les plafonds sont larges à dessein : ce ne sont pas des cotes de projet mais
// des GARDE-FOUS. Ils ne doivent jamais gêner un relevé qui grandit d'une
// pièce ; ils doivent arrêter net une gare qui en gagnerait cinquante.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { concourseBays, legacyNetwork, shellsOf } =
  await import('../src/data/stationConcourseBuild.ts');
const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');

const GATES = psdGates();
const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
const ALL = Array.from({ length: STATION_COUNT }, (_, i) => placementFor(i, GATES));

test('AUCUNE GARE N’EXPLOSE TOUTE SEULE', () => {
  // Par gare, et non en cumul : une moyenne cache exactement le cas qu'on
  // cherche, celui d'une gare qui part toute seule pendant que les autres
  // restent sages. Les plafonds sont pris au double du pire relevé
  // d'aujourd'hui — Shinjuku pour les pièces et les baies, Tokyo pour les
  // bouches — de sorte qu'une gare puisse doubler sans rien casser.
  for (let i = 0; i < STATION_COUNT; i++) {
    const net = ALL[i].network;
    const say = (what: string, n: number, max: number) =>
      assert.ok(n <= max, `${NAME(i)} : ${n} ${what} (plafond ${max})`);
    say('pièces', net.rooms.length, 16);
    say('volumes', shellsOf(net).length, 8);
    say('lignes de portillons', net.gates.length, 10);
    say('baies', concourseBays(net).length, 30);
    say('bouches', net.mouths.length, 16);
    say('obstacles', net.obstacles.length, 140);
    say('meubles', net.fixtures.length, 30);
  }
});

test('LE RELEVÉ N’A PAS ALOURDI LA MARCHE', () => {
  // LE COÛT QUI COMPTE. `walkerBlocked` parcourt la liste des obstacles à
  // chaque pas de chaque voyageur : c'est le seul des trois coûts du chantier
  // qui se paie à chaque image, et donc le seul qui puisse se voir.
  //
  // Le relevé pose des devantures, des palissades et des poteaux que le hall
  // générique n'avait pas — mais il pose aussi MOINS de mobilier, faute de
  // place. Les deux se compensent presque exactement, et c'est ce fait-là qui
  // doit rester vrai : le jour où le relevé coûtera deux fois plus d'obstacles
  // que le hall qu'il remplace, la foule ralentira avec lui.
  let before = 0;
  let after = 0;
  for (let i = 0; i < STATION_COUNT; i++) {
    before += legacyNetwork(i, ALL[i].interior).obstacles.length;
    after += ALL[i].network.obstacles.length;
  }
  assert.ok(before > 0 && after > 0);
  assert.ok(
    after <= before * 1.5,
    `${after} obstacles au relevé contre ${before} au hall générique`,
  );
});

test('UN VOLUME NE MONTE PAS PLUS DE MAILLAGES QU’IL N’A DE MATIÈRE', () => {
  // Le coût de RENDU suit le nombre d'objets d'un volume : `Concourse` monte un
  // maillage par pièce, par devanture, par palissade, par fût et par meuble.
  // On borne donc ce qu'un seul volume peut contenir — c'est ce que la carte
  // graphique paie d'un coup quand on entre dedans.
  let worst = { name: '', n: 0 };
  for (let i = 0; i < STATION_COUNT; i++) {
    const net = ALL[i].network;
    for (const shell of shellsOf(net)) {
      const ids = new Set(shell.rooms.map((r) => r.id));
      const n = shell.rooms.length
        + net.frontages.filter((f) => ids.has(f.roomId)).length
        + net.hoardings.filter((h) => ids.has(h.roomId)).length
        + net.landmarks.filter((l) => ids.has(l.roomId))
          .reduce((s, l) => s + 1 + l.posts.length, 0)
        + net.fixtures.filter((f) => shell.rooms.some((r) =>
          (f.rect.x0 + f.rect.x1) / 2 >= r.rect.x0 && (f.rect.x0 + f.rect.x1) / 2 <= r.rect.x1
          && (f.rect.z0 + f.rect.z1) / 2 >= r.rect.z0
          && (f.rect.z0 + f.rect.z1) / 2 <= r.rect.z1)).length;
      if (n > worst.n) worst = { name: NAME(i), n };
    }
  }
  // Le pire volume d'aujourd'hui en porte une trentaine ; le plafond est au
  // double, et le message dit lequel c'est pour qu'on n'ait pas à le chercher.
  assert.ok(worst.n <= 70, `${worst.name} : ${worst.n} objets dans un seul volume`);
  assert.ok(worst.n > 10, `le plus gros volume n’en porte que ${worst.n} : le test ne prouve rien`);
});
