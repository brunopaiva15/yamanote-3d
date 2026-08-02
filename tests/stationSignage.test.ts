// LA SOURCE UNIQUE DES NOMS (data/stationSignage).
//
// Ce que ce test doit protéger tient en deux phrases, et elles tirent en sens
// contraire :
//
//   · QUE RIEN NE CHANGE. Aucune gare n'est branchée sur son relevé. Les
//     potences, les totems, les fonds de trémie et les bouches doivent
//     afficher exactement les mêmes mots qu'avant que la source existe —
//     `stationExits(index)`, mot pour mot, sur les trente gares ;
//   · QUE PLUS RIEN NE SE CONTREDISE. Une bouche, un panneau, un totem qui
//     nomment la même sortie doivent la nommer PAREIL, y compris sur une gare
//     branchée dont le hall ne perce pas les sorties dans l'ordre du relevé.
//
// Et le fléchage suspendu par-dessus : quatre panneaux à des cotes écrites en
// dur ne se voient pas déraper. Les trente gares les redonnent au centimètre.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { compileProfile, shellsOf } = await import('../src/data/stationConcourseBuild.ts');
const { CONCOURSE_PROFILES } = await import('../src/data/stationConcourseProfiles.ts');
const { guidePosts, mouthExit, signageFor } = await import('../src/data/stationSignage.ts');
const { stationExitPlan, stationExits } = await import('../src/data/lines.ts');
const { STATIONS, TRANSFERS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');

const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
const PLACE = (i: number) => placementFor(i, psdGates());
const NET = (i: number) => PLACE(i).network;

// --- Ce qui ne doit pas bouger -------------------------------------------

test('les trente potences annoncent exactement ce qu’elles annonçaient', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const sign = signageFor(NET(i), i);
    const before = stationExits(i);
    assert.equal(sign.gantry.length, before.length, NAME(i));
    sign.gantry.forEach((e, k) => {
      assert.equal(e.jp, before[k].jp, `${NAME(i)} potence ${k} (jp)`);
      assert.equal(e.en, before[k].en, `${NAME(i)} potence ${k} (en)`);
    });
  }
});

test('une potence ne porte jamais plus de deux caissons', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.ok(signageFor(NET(i), i).gantry.length <= 2, NAME(i));
  }
});

test('chaque bouche du réseau est nommée, et par la même source', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const net = NET(i);
    const sign = signageFor(net, i);
    assert.ok(net.mouths.length > 0, NAME(i));
    for (const m of net.mouths) {
      const named = mouthExit(sign, m.id);
      assert.ok(named.jp.length > 0, `${NAME(i)} ${m.id}`);
      // Le hall générique ne nomme pas ses bouches : le nom vient du rang de
      // la sortie dans le relevé, ce que faisait le rendu tout seul.
      const plan = stationExitPlan(i);
      assert.equal(named.jp, plan[m.slot % plan.length].jp, `${NAME(i)} ${m.id}`);
    }
  }
});

test('on n’annonce que ce qu’on perce, et jamais deux fois le même nom', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const net = NET(i);
    const sign = signageFor(net, i);
    const fromMouths = new Set(net.mouths.map((m) => mouthExit(sign, m.id).jp));
    for (const e of sign.exits) {
      assert.ok(fromMouths.has(e.jp), `${NAME(i)} annonce ${e.jp} sans le percer`);
    }
    assert.equal(new Set(sign.exits.map((e) => e.jp)).size, sign.exits.length, NAME(i));
  }
});

test('les correspondances du quai restent celles des annonces', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const tr = TRANSFERS[STATIONS[i].jy];
    const lines = signageFor(NET(i), i).lines;
    if (!tr) {
      // 鶯谷, 目白 : rien à annoncer, et la source le dit au lieu d'inventer.
      assert.equal(lines.length, 0, NAME(i));
      continue;
    }
    const want = tr.jp.split('、').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    assert.deepEqual([...lines], want, NAME(i));
  }
});

// --- Ce que la source sait faire de plus ----------------------------------

test('un relevé branché nomme ses bouches lui-même', () => {
  let checked = 0;
  for (const p of CONCOURSE_PROFILES) {
    const named = p.exits.filter((e) => e.nameJp);
    if (named.length === 0) continue;
    const sign = signageFor(compileProfile(p), p.stationIndex);
    for (const e of named) {
      assert.equal(
        mouthExit(sign, e.id).jp,
        e.nameJp,
        `${NAME(p.stationIndex)} ${e.id}`,
      );
      checked++;
    }
  }
  // Le relevé nomme quatre-vingt-onze bouches sur les trente gares. Le seuil
  // n'est pas la valeur exacte — une gare relevée de plus la ferait monter —
  // mais un plancher : s'il tombe, c'est le relevé qui a été vidé, pas la
  // signalétique qui s'est simplifiée.
  assert.ok(checked >= 91, `${checked} bouches nommées`);
});

test('une gare branchée n’annonce pas une sortie que son hall ne perce pas', () => {
  for (const p of CONCOURSE_PROFILES) {
    const sign = signageFor(compileProfile(p), p.stationIndex);
    const pierced = new Set(p.exits.map((e) => e.nameJp).filter(Boolean));
    if (pierced.size === 0) continue;
    for (const e of sign.exits) {
      assert.ok(pierced.has(e.jp), `${NAME(p.stationIndex)} annonce ${e.jp}`);
    }
  }
});

test('un contrôle dit ce qui change ce qu’on peut y faire', () => {
  let ic = 0;
  let exitOnly = 0;
  let hours = 0;
  for (const p of CONCOURSE_PROFILES) {
    const net = compileProfile(p);
    const sign = signageFor(net, p.stationIndex);
    for (const g of net.gates) {
      const s = sign.gates.find((x) => x.id === g.id);
      assert.ok(s, `${NAME(p.stationIndex)} ${g.id}`);
      assert.equal(s.jp, g.nameJp);
      if (g.icOnly) {
        assert.ok(s.notes.includes('ICカード専用'), `${NAME(p.stationIndex)} ${g.id}`);
        ic++;
      }
      if (g.exitOnly) {
        assert.ok(s.notes.includes('出口専用'), `${NAME(p.stationIndex)} ${g.id}`);
        exitOnly++;
      }
      if (g.hours) {
        assert.ok(s.notes.includes(g.hours), `${NAME(p.stationIndex)} ${g.id}`);
        hours++;
      }
      if (!g.icOnly && !g.exitOnly && !g.hours) assert.deepEqual([...s.notes], []);
    }
  }
  // Le relevé en porte : si les trois comptes tombent à zéro, la mention n'est
  // plus testée par rien.
  assert.ok(ic + exitOnly + hours > 0, 'aucune mention dans le relevé');
});

test('le hall générique ne porte aucune mention de contrôle', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    for (const g of signageFor(NET(i), i).gates) {
      assert.deepEqual([...g.notes], [], `${NAME(i)} ${g.id}`);
    }
  }
});

// --- Le fléchage suspendu -------------------------------------------------

test('les trente gares retrouvent leurs quatre panneaux, aux mêmes cotes', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const place = PLACE(i);
    const shells = shellsOf(place.network);
    if (shells.length === 0) continue;
    assert.equal(shells.length, 1, NAME(i));
    const shell = shells[0];
    const paid = shell.rooms.find((r) => r.fare === 'paid');
    const free = shell.rooms.find((r) => r.fare === 'free');
    assert.ok(paid && free, NAME(i));
    const posts = guidePosts(shell);
    // Les quatre cotes d'avant, écrites en dur dans `three/station/Concourse`.
    assert.deepEqual(
      posts.map((p) => [p.along, +p.at.toFixed(4), p.kind, p.forward]),
      [
        ['z', +(paid.rect.z0 + 2.6).toFixed(4), 'exit', true],
        ['z', +(paid.rect.z1 - 4.2).toFixed(4), 'facility', true],
        ['z', +(free.rect.z0 + 2.2).toFixed(4), 'platform', false],
        ['z', +(free.rect.z1 - 4.5).toFixed(4), 'exit', true],
      ],
      NAME(i),
    );
  }
});

test('un volume qu’on traverse selon x reçoit son fléchage selon x', () => {
  // Un pont-concourse ou un hall transversal se franchit dans l'autre sens :
  // quatre panneaux plantés selon z y barreraient la circulation.
  let seen = 0;
  for (const p of CONCOURSE_PROFILES) {
    for (const shell of shellsOf(compileProfile(p))) {
      const cross = shell.gates[0]?.cross;
      if (cross !== 'x') continue;
      seen++;
      for (const post of guidePosts(shell)) {
        assert.equal(post.along, 'x', `${NAME(p.stationIndex)} ${shell.id}`);
        assert.ok(
          post.at >= shell.rect.x0 && post.at <= shell.rect.x1,
          `${NAME(p.stationIndex)} ${shell.id} hors du volume`,
        );
      }
    }
  }
  assert.ok(seen > 0, 'aucun volume transversal dans le relevé');
});

test('un panneau suspendu tombe toujours dans sa pièce', () => {
  for (const p of CONCOURSE_PROFILES) {
    for (const shell of shellsOf(compileProfile(p))) {
      for (const post of guidePosts(shell)) {
        const [a0, a1] =
          post.along === 'z'
            ? [shell.rect.z0, shell.rect.z1]
            : [shell.rect.x0, shell.rect.x1];
        assert.ok(
          post.at >= a0 - 1e-6 && post.at <= a1 + 1e-6,
          `${NAME(p.stationIndex)} ${shell.id} : ${post.kind} à ${post.at}`,
        );
      }
    }
  }
});

test('une pièce trop courte ne reçoit pas deux panneaux qui se touchent', () => {
  const MIN_GAP = 1;
  for (const p of CONCOURSE_PROFILES) {
    for (const shell of shellsOf(compileProfile(p))) {
      const posts = [...guidePosts(shell)].sort((a, b) => a.at - b.at);
      for (let k = 1; k < posts.length; k++) {
        if (posts[k].along !== posts[k - 1].along) continue;
        assert.ok(
          posts[k].at - posts[k - 1].at >= MIN_GAP,
          `${NAME(p.stationIndex)} ${shell.id} : deux panneaux à ${posts[k].at}`,
        );
      }
    }
  }
});

test('le panneau des quais est le seul qui se lise à contre-sens', () => {
  for (const p of CONCOURSE_PROFILES) {
    for (const shell of shellsOf(compileProfile(p))) {
      for (const post of guidePosts(shell)) {
        assert.equal(
          post.forward,
          post.kind !== 'platform',
          `${NAME(p.stationIndex)} ${shell.id} ${post.kind}`,
        );
      }
    }
  }
});
