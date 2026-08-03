// Le compilateur de profil (src/data/stationConcourseBuild).
//
// Il fait deux choses, et la seconde est la plus importante : il transforme un
// relevé en réseau de pièces, ET il enveloppe le hall générique dans la même
// structure. Les consommateurs n'auront donc jamais deux chemins à connaître,
// ce qui est la condition pour basculer les trente gares une par une sans
// laisser le jeu à moitié converti.
//
// CE QUE CE FICHIER PROTÈGE :
//
//   · que les trente relevés se compilent, et qu'aucun ne rende un réseau
//     incohérent - portillon vers une pièce inconnue, lien qui monte vers plus
//     bas, bouche qui s'ouvre hors de sa paroi ;
//   · que le REPLI soit fidèle au rectangle près : une gare non branchée doit
//     se comporter exactement comme avant ;
//   · que le compilateur ne rogne jamais EN SILENCE. Le relevé énonce une
//     intention, la place tranche, et l'écart se dit (`networkIssues`) ;
//   · que la liste de ce qu'il a rogné reste FERMÉE — dix-huit lignes de
//     portillons, toutes pour la même raison, et c'est un fait d'architecture.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  compileProfile,
  legacyNetwork,
  networkFor,
  networkIssues,
  roomAt,
} = await import('../src/data/stationConcourseBuild.ts');
const { CONCOURSE_PROFILES } = await import('../src/data/stationConcourseProfiles.ts');
const { deferredIndices, wiredCount, wiredIndices } =
  await import('../src/data/stationConcourseWired.ts');
const { interiorFor } = await import('../src/data/stationInterior.ts');
const { layoutFor } = await import('../src/data/stationLayouts.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');

const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
/** La trémie principale, telle que `systems/stationPlacement` la choisit. */
const MAIN = (i: number) =>
  layoutFor(i).amenities.stairs.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));

test('les trente relevés se compilent en réseaux cohérents', () => {
  for (const p of CONCOURSE_PROFILES) {
    const net = compileProfile(p);
    const name = NAME(p.stationIndex);
    assert.equal(net.source, 'profile', name);
    assert.equal(net.rooms.length, p.concourses.length, name);

    const ids = new Set(net.rooms.map((r) => r.id));
    // Tout lien et tout portillon joint deux pièces qui existent.
    for (const j of net.joins) {
      assert.ok(ids.has(j.from) && ids.has(j.to), `${name} : lien ${j.id} vers une pièce inconnue`);
    }
    for (const g of net.gates) {
      assert.ok(ids.has(g.from) && ids.has(g.to), `${name} : ${g.id} vers une pièce inconnue`);
      assert.ok(g.passages.length >= 1, `${name} : ${g.id} sans baie`);
      // Les bornes ferment la ligne de bout en bout : entre deux bornes il y a
      // une baie, et rien d'autre. Une ligne qui laisse un jeu se contourne.
      const along = g.cross === 'z' ? 'x' : 'z';
      const lo = along === 'x' ? g.rect.x0 : g.rect.z0;
      const hi = along === 'x' ? g.rect.x1 : g.rect.z1;
      const edges = g.cabinets
        .map((c) => (along === 'x' ? [c.x0, c.x1] : [c.z0, c.z1]) as [number, number])
        .sort((a, b) => a[0] - b[0]);
      assert.ok(Math.abs(edges[0][0] - lo) < 1e-6, `${name} : ${g.id} ouvert à un bout`);
      assert.ok(
        Math.abs(edges[edges.length - 1][1] - hi) < 1e-6,
        `${name} : ${g.id} ouvert à l’autre bout`,
      );
      for (const b of g.passages) {
        assert.equal(b.along, along, `${name} : ${g.id} aligne ses baies sur le mauvais axe`);
        assert.ok(b.at > lo && b.at < hi, `${name} : baie hors de la ligne`);
      }
    }
    // Une pièce a une hauteur libre, et son plafond est au-dessus de son sol.
    for (const r of net.rooms) {
      assert.ok(r.ceilY > r.floorY, `${name} : ${r.id} a un plafond sous son sol`);
    }
    // Une bouche s'ouvre DANS sa paroi, et sur une pièce qui existe.
    for (const m of net.mouths) {
      const host = net.rooms.find((r) => r.id === m.roomId);
      assert.ok(host, `${name} : bouche ${m.id} sans pièce`);
      const [lo, hi] = m.side === 'x0' || m.side === 'x1'
        ? [host.rect.z0, host.rect.z1]
        : [host.rect.x0, host.rect.x1];
      assert.ok(
        m.at - m.halfWidth >= lo - 1e-6 && m.at + m.halfWidth <= hi + 1e-6,
        `${name} : la bouche ${m.id} déborde de sa paroi`,
      );
    }
  }
});

test('un lien descend vers ce qui est plus bas, et monte vers ce qui est plus haut', () => {
  // Le relevé déclare un sens (`rise`) ; le compilateur, lui, lit les
  // ALTITUDES des deux pièces. Les deux doivent dire la même chose, sans quoi
  // une volée descendrait vers un plafond.
  for (const p of CONCOURSE_PROFILES) {
    const net = compileProfile(p);
    for (const c of p.corridors) {
      const j = net.joins.find((x) => x.id === c.id);
      assert.ok(j, `${NAME(p.stationIndex)} : lien ${c.id} perdu`);
      const sign = Math.sign(Math.round((j.toY - j.fromY) * 100) / 100);
      assert.equal(sign, c.rise, `${NAME(p.stationIndex)} : ${c.id} annonce ${c.rise}`);
    }
  }
});

test('LE HALL S’OUVRE SUR LE CÔTÉ quand le contrôle vient du côté', () => {
  // C'est ce qui fait sortir la phase 7 de G2. Une bouche ne s'ouvre plus « au
  // fond, vers +z » : elle s'ouvre face au contrôle qui alimente la zone libre.
  // Dans un hall longitudinal cela redonne exactement l'ancien comportement ;
  // dans une passerelle transversale cela met la bouche sur un flanc, ce qui
  // est le seul endroit où elle peut être.
  const sides = new Map<string, Set<string>>();
  for (const p of CONCOURSE_PROFILES) {
    const net = compileProfile(p);
    sides.set(NAME(p.stationIndex), new Set(net.mouths.map((m) => m.side)));
  }
  // Tokyo traverse le faisceau : ses bouches sont sur les deux flancs, jamais
  // au fond.
  assert.deepEqual([...sides.get('JY01 Tokyo')!].sort(), ['x0', 'x1']);
  // Kanda suit l'axe du quai : elle garde le fond.
  assert.deepEqual([...sides.get('JY02 Kanda')!], ['z1']);
  // Et sur les trente, le fond n'est plus la seule réponse.
  const anyX = [...sides.values()].filter((s) => s.has('x0') || s.has('x1')).length;
  assert.ok(anyX >= 10, `seulement ${anyX} gares ouvrent une bouche sur un flanc`);
});

test('le compilateur ne rogne jamais en silence', () => {
  // DIX-NEUF LIGNES DE PORTILLONS ne tiennent pas ce que le relevé leur demande,
  // et dix-huit pour la même raison : elles sont posées EN TRAVERS DE LA BANDE
  // DU QUAI (`cross: 'z'`), qui fait de 5,3 m à 6,7 m. Une baie coûte 0,98 m
  // avec ses bornes : un hall large comme un quai ne tient pas plus de quatre ou
  // cinq baies, et le relevé en demande jusqu'à neuf.
  //
  // C'EST LE DERNIER RESTE DE G1, et il ne se corrige pas ici : les vrais halls
  // de Kanda ou de Shimbashi sont larges comme le VIADUC, pas comme le quai.
  // Les élargir vers le fond appartient au branchement de chaque gare — la
  // phase 6 a établi que le décor sait s'écarter. En attendant, l'écart est
  // nommé.
  //
  // La vingtième est d'une autre nature, et la phase 21 l'a fait apparaître :
  // à Ikebukuro le contrôle nord est coté PLUS LARGE que la zone payante qu'il
  // ferme. Le compilateur le ramène à ce que les deux pièces ont en commun —
  // une baie qui s'ouvre sur du vide n'est pas une baie — et il perd des
  // passages en chemin. Le relevé et la géométrie se contredisent : c'est le
  // relevé qu'il faudra relire, pas le compilateur qu'il faut assouplir.
  const cramped: string[] = [];
  for (const p of CONCOURSE_PROFILES) {
    const net = compileProfile(p);
    for (const issue of networkIssues(p, net)) {
      if (issue.code !== 'crampedGate') continue;
      cramped.push(`${STATIONS[p.stationIndex].jy} ${issue.where}`);
    }
  }
  assert.deepEqual(cramped, [
    'JY02 gate-west',
    'JY02 gate-east',
    'JY03 gate-denkigai',
    'JY03 gate-central',
    'JY03 gate-showa',
    'JY04 gate-north',
    'JY08 gate-hall',
    'JY13 gate-north',
    'JY15 gate-waseda',
    'JY16 gate-hall',
    'JY16 gate-exit-only',
    'JY18 gate-west',
    'JY21 gate-west',
    'JY23 gate-central',
    'JY27 gate-south',
    'JY28 gate-north',
    'JY29 gate-south',
    'JY29 gate-north',
    'JY30 gate-central',
    'JY30 gate-central-west',
  ]);
  // Toutes sauf une sont traversées en z, et c'est ce qui les explique.
  const acrossX = cramped.filter((c) => {
    const [jy, id] = c.split(' ');
    const p = CONCOURSE_PROFILES.find((q) => STATIONS[q.stationIndex].jy === jy)!;
    return p.gateGroups.find((g) => g.id === id)!.cross === 'x';
  });
  assert.deepEqual(acrossX, ['JY13 gate-north']);
});

test('une ligne cotée hors de ses pièces se DIT, elle ne se déplace pas', () => {
  // Deux lignes du relevé ne recouvrent pas les deux pièces qu'elles séparent.
  // Le compilateur ne les bouge pas — décider à la place du relevé serait le
  // pire des services — mais il refuse de laisser croire qu'on les franchit.
  const off: string[] = [];
  const dropped: string[] = [];
  for (const p of CONCOURSE_PROFILES) {
    const net = compileProfile(p);
    for (const issue of networkIssues(p, net)) {
      if (issue.code === 'gateOffRoom') off.push(`${STATIONS[p.stationIndex].jy} ${issue.where}`);
      if (issue.code === 'shopDropped') dropped.push(`${STATIONS[p.stationIndex].jy} ${issue.where}`);
    }
  }
  assert.deepEqual(off, ['JY13 gate-south', 'JY20 gate-hachiko-exit-only']);
  // Et deux devantures ne tiennent pas dans leur hall sans le fermer d'un mur
  // à l'autre : elles disparaissent, et cela aussi se dit.
  assert.deepEqual(dropped, ['JY23 shop-atre-2', 'JY30 shop-lumine-street-b']);
});

test('le relevé se cale sur la trémie réellement posée', () => {
  // Les cotes des profils viennent de `data/stationLayouts`, la même table que
  // `systems/stationPlacement`. Elles coïncident donc — et le compilateur DÉCALE
  // quand même, pour que le jour où le placement bougera ses trémies les halls
  // suivent au lieu de flotter.
  for (const p of CONCOURSE_PROFILES) {
    const i = p.stationIndex;
    const here = compileProfile(p, MAIN(i));
    const shifted = compileProfile(p, MAIN(i) + 7);
    here.rooms.forEach((r, k) => {
      assert.ok(
        Math.abs(r.rect.z0 + 7 - shifted.rooms[k].rect.z0) < 1e-9,
        `${NAME(i)} : ${r.id} n’a pas suivi sa trémie`,
      );
      // Et en x, rien ne bouge : une trémie se déplace le long du quai.
      assert.equal(r.rect.x0, shifted.rooms[k].rect.x0, `${NAME(i)} : ${r.id}`);
    });
  }
});

test('le repli est fidèle au rectangle près', () => {
  // Une gare non branchée doit se comporter EXACTEMENT comme avant : c'est ce
  // qui permet de basculer les trente une par une.
  for (let i = 0; i < STATION_COUNT; i++) {
    const it = interiorFor(i, MAIN(i));
    const net = legacyNetwork(i, it);
    assert.equal(net.source, 'legacy', NAME(i));
    assert.equal(net.built, it.built, NAME(i));
    assert.deepEqual(net.rooms.map((r) => r.rect), [it.paid, it.free], NAME(i));
    assert.equal(net.rooms[0].floorY, it.floorY, NAME(i));
    assert.equal(net.rooms[0].ceilY, it.ceilY, NAME(i));
    assert.equal(net.gates.length, 1, NAME(i));
    assert.equal(net.gates[0].nameJp, it.gate.nameJp, NAME(i));
    assert.deepEqual(net.gates[0].cabinets, it.gate.cabinets, NAME(i));
    assert.deepEqual(
      net.gates[0].passages.map((b) => b.at),
      it.gate.passages.map((b) => b.x),
      NAME(i),
    );
    assert.equal(net.mouths.length, it.exits.length, NAME(i));
    assert.deepEqual(net.fixtures, it.fixtures, NAME(i));
    assert.deepEqual(net.obstacles, it.obstacles, NAME(i));
  }
});

test('les gares branchées sont EXACTEMENT celles qu’on a décidé de brancher', () => {
  // Une bascule silencieuse est le pire des accidents de ce chantier : une gare
  // qui passerait au relevé sans que personne l'ait voulu emporterait avec elle
  // son sol, sa marche, ses itinéraires et ses panneaux. La liste est donc
  // écrite ici, en clair, et le compilateur doit s'y tenir des deux côtés.
  assert.deepEqual(
    [...wiredIndices()],
    [1, 2, 5, 7, 8, 9, 10, 11, 13, 14, 15, 17, 20, 21, 22, 23, 26, 27, 28, 29],
  );
  // Et DEUX gares attendent, pour une raison d'ouvrage et non de relevé : leur
  // trémie ne rejoint pas le sol qu'elle dessert (voir `stationConcourseWired`).
  assert.deepEqual([...deferredIndices()], [3, 18]);
  assert.equal(wiredCount(), wiredIndices().length);
  for (let i = 0; i < STATION_COUNT; i++) {
    assert.equal(
      networkFor(i, MAIN(i)).source,
      wiredIndices().includes(i) ? 'profile' : 'legacy',
      NAME(i),
    );
  }
});

test('Nippori cesse d’être un cas spécial', () => {
  // R4 du plan. `data/stationInterior` déclare Nippori `bespoke: true` et ne
  // construit rien : ses DEUX PONTS-CONCOURS sont déjà sa charpente signature,
  // et y poser en plus le hall générique reviendrait à bâtir deux fois la même
  // chose, l'une dans l'autre. La décision est juste ; c'était l'exception qui
  // ne l'était pas.
  //
  // Le relevé la dit en donnée ordinaire : deux pièces `overbridge` au 2F, et
  // le niveau EXISTE. Il n'y a plus de drapeau à cocher — il y a une gare dont
  // le hall se trouve être un pont, ce qui est le cas de neuf autres.
  const legacy = legacyNetwork(6, interiorFor(6, MAIN(6)));
  assert.equal(legacy.built, false, 'JY07 Nippori : le repli devrait rester nu');

  const net = compileProfile(CONCOURSE_PROFILES[6]);
  assert.equal(net.built, true);
  const bridges = net.rooms.filter((r) => r.kind === 'overbridge');
  assert.ok(bridges.length >= 4, `JY07 Nippori : ${bridges.length} ponts seulement`);
  // Et le pont porte bien le contrôle JR : c'est ce que le plan montre.
  assert.ok(net.gates.some((g) => g.from === 'paid-north' && g.walkable));
});

test('un réseau s’interroge : la pièce sous un point', () => {
  // L'équivalent de `concourseFloorAt`, mais avec N pièces à N altitudes. Le
  // compilateur doit se prouver interrogeable avant qu'on lui confie les pieds
  // du joueur (phase 8).
  const tokyo = compileProfile(CONCOURSE_PROFILES[0]);
  const paid = tokyo.rooms.find((r) => r.id === 'paid-central')!;
  const mid = {
    x: (paid.rect.x0 + paid.rect.x1) / 2,
    z: (paid.rect.z0 + paid.rect.z1) / 2,
  };
  assert.equal(roomAt(tokyo, mid.x, mid.z)?.id, 'paid-central');
  // Loin de tout : rien.
  assert.equal(roomAt(tokyo, 500, 500), null);
  // Sur une borne de portillon : rien non plus, on la contourne.
  const cab = tokyo.gates[0].cabinets[1];
  assert.equal(roomAt(tokyo, (cab.x0 + cab.x1) / 2, (cab.z0 + cab.z1) / 2), null);
  // Et une perspective ne se foule pas.
  const vista = tokyo.rooms.find((r) => !r.walkable)!;
  assert.equal(
    roomAt(tokyo, (vista.rect.x0 + vista.rect.x1) / 2, (vista.rect.z0 + vista.rect.z1) / 2),
    null,
  );
});
