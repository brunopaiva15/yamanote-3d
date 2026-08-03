// LES PALIERS DE QUALITÉ, ET LA RÈGLE QUI LES GOUVERNE (phase 25).
//
// Un palier bas allège le rendu. Il a le droit de retirer ce qui se REGARDE —
// une bande jaune, une enseigne, un vitrage, un cadran. Il n'a jamais le droit
// de retirer ce qui BARRE.
//
// La raison n'est pas esthétique : un obstacle du réseau est une COLLISION,
// et la marche ne connaît pas le palier de qualité. Retirer le dessin d'une
// vitrine sans retirer sa collision donne un mur invisible ; retirer les deux
// donne une gare qui change de plan quand la machine chauffe. Les deux sont
// pires que le bandeau qu'on aurait économisé.
//
// Ce fichier tient donc l'inventaire de ce qui BARRE, et vérifie qu'il ne
// dépend d'aucun palier — parce que la géométrie qui barre vit dans le RÉSEAU,
// qui est calculé une fois pour toutes, et non dans le rendu.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { walkerBlocked } = await import('../src/systems/stationLevels.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const { fixtureBlocks, interiorSolids } = await import('../src/data/stationInterior.ts');

const GATES = psdGates();
const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;

test('tout ce qui barre vit dans le réseau, pas dans le rendu', () => {
  // `walkerBlocked` ne prend pas de palier de qualité, et c'est la preuve la
  // plus simple : il n'y a aucun chemin par lequel un palier pourrait changer
  // ce qui arrête un marcheur.
  // Quatre paramètres — placement, étage, x, z — et le cinquième (`berth`) a
  // une valeur par défaut. Aucun n'est un palier de qualité, et c'est tout ce
  // que ce contrôle demande.
  assert.equal(walkerBlocked.length, 4, 'walkerBlocked a changé de signature');
  for (let i = 0; i < STATION_COUNT; i++) {
    const net = placementFor(i, GATES).network;
    for (const o of net.obstacles) {
      assert.ok(
        o.x1 > o.x0 && o.z1 > o.z0,
        `${NAME(i)} : obstacle dégénéré ${JSON.stringify(o)}`,
      );
    }
  }
});

test('UN POTEAU N’EST PAS DE LA FUMÉE', () => {
  // Les fûts d'une file de poteaux se dessinaient dans le rendu et ne barraient
  // rien : le joueur les traversait. Ils sont posés par le compilateur, avec
  // leur emprise, et le rendu les LIT — une implantation, plusieurs lecteurs.
  let posts = 0;
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = placementFor(i, GATES);
    for (const l of p.network.landmarks) {
      if (l.kind !== 'column') {
        assert.deepEqual(l.posts, [], `${NAME(i)} : ${l.id} porte des fûts sans être une file`);
        continue;
      }
      assert.ok(l.posts.length > 0, `${NAME(i)} : ${l.id} est une file sans fût`);
      for (const post of l.posts) {
        posts++;
        // Chaque fût est un obstacle du réseau, donc la marche s'y arrête.
        assert.ok(
          p.network.obstacles.some((o) => o.x0 === post.x0 && o.z0 === post.z0),
          `${NAME(i)} : un fût de ${l.id} ne barre rien`,
        );
        const x = (post.x0 + post.x1) / 2;
        const z = (post.z0 + post.z1) / 2;
        assert.ok(walkerBlocked(p, 'concourse', x, z), `${NAME(i)} : fût traversable`);
      }
    }
  }
  assert.ok(posts > 0, 'aucun poteau relevé : le test ne prouve plus rien');
});

test('les décors intérieurs LISENT le palier', () => {
  // Ils ne le lisaient pas : `Limits`, `Frontages` et `Landmarks` se
  // dessinaient en entier au palier le plus bas, ce qui était précisément le
  // manque que la phase 25 devait combler.
  //
  // Le contrôle est structurel et non comportemental, faute de pouvoir monter
  // une scène three.js dans `node --test` : ce qu'il tient, c'est que chacun
  // reçoive le palier et s'en serve. Ce que le palier a le DROIT de retirer,
  // lui, se vérifie sur les données — c'est le test suivant, et c'est lui qui
  // compte.
  const dir = new URL('../src/three/station/interiors/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
  assert.deepEqual(files.sort(), ['Frontages.tsx', 'Landmarks.tsx', 'Limits.tsx']);
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(src.includes('detail: number;'), `${f} ne prend pas de palier`);
    assert.ok(src.includes('detail <='), `${f} ne s'en sert pas`);
  }
  // ET LE MOBILIER AUSSI, depuis la phase 26 : il disparaissait ENTIÈREMENT au
  // palier 2 — `{detail <= 1 && <Fixtures …>}` — alors que ses emprises
  // continuaient de barrer. Il garde maintenant son volume à tous les paliers
  // et n'abandonne que ce qui se regarde.
  const fixtures = readFileSync(
    new URL('../src/three/station/Fixtures.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(fixtures.includes('detail: number;'), 'Fixtures ne prend pas de palier');
  assert.ok(fixtures.includes('interiorSolids'), 'Fixtures ne lit pas les emprises du réseau');
  const concourse = readFileSync(
    new URL('../src/three/station/Concourse.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(
    !/\{detail <= \d && <Fixtures/.test(concourse),
    'le mobilier redevient facultatif au palier bas',
  );
  // ET LE HALL LUI-MÊME. Il sautait entièrement au palier « très basse » —
  // `{place.network.built && detail <= 2 && <ConcourseNetwork …>}` — et le
  // joueur qui descendait s'y retrouvait debout dans le vide, la ville tout
  // autour : la marche ne connaît pas le palier, donc le sol était là et rien
  // ne le dessinait. C'est l'exigence #17 prise à l'envers, et en pire : pas un
  // obstacle invisible, un PLANCHER invisible.
  const station = readFileSync(
    new URL('../src/three/station/Station.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(
    !/detail <= \d && \(?\s*<ConcourseNetwork/.test(station),
    'le hall redevient facultatif au palier bas',
  );
  // ON A D'ABORD GARDÉ L'ÉCONOMIE DEPUIS LE QUAI, en se disant qu'un hall vu
  // par une trémie restait du fond de champ. Il ne l'est pas : treize gares
  // portent le leur AU-DESSUS des voies, la volée montante y débouche en plein
  // ciel, et à « basse » comme à « très basse » on voyait la ville par le
  // plafond du hall qu'on s'apprête à parcourir. Le hall ne dépend donc plus
  // d'aucun palier ni d'aucun endroit — l'économie se fait sur ce qu'il y a
  // DEDANS, et elle reste entière.
  const net = readFileSync(
    new URL('../src/three/station/ConcourseNetwork.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(
    !/if \(detail[^)]*\) return null/.test(net),
    'le hall redevient facultatif à un palier',
  );
  assert.ok(net.includes('detail={detail}'), 'le hall ne transmet plus le palier');
  // ET LES OUVRAGES DU QUAI. Un escalier mécanique, un ascenseur et un kiosque
  // occupent le sol (`place.obstacles`) : les retirer au palier bas en faisait
  // trois obstacles invisibles. C'est la même faute que ci-dessus, du côté du
  // quai, là où le test de la phase 25 ne regardait pas.
  assert.ok(
    !/detail <= \d && <Amenities/.test(station),
    'les ouvrages du quai redeviennent facultatifs au palier bas',
  );
  // Le percement de la dalle sous un escalier mécanique suit la volée qui le
  // remplit : conditionner l'un sans l'autre laisse un trou ou un bouchon.
  assert.ok(
    !/if \(detail <= \d\) \{\s*for \(const e of place\.escalators\)/.test(station),
    'le percement de la dalle dépend encore du palier',
  );
});

test('CE QUI BARRE EST LE MÊME À TOUS LES PALIERS', () => {
  // La preuve qui compte, et elle est sur les DONNÉES : la géométrie qui barre
  // est produite par des fonctions qui ne prennent aucun palier, et deux appels
  // identiques rendent la même chose. Il n'existe donc aucun chemin par lequel
  // un palier de qualité pourrait retirer un obstacle — ni en ajouter un.
  for (let i = 0; i < STATION_COUNT; i++) {
    const a = placementFor(i, GATES).network;
    const b = placementFor(i, psdGates()).network;
    assert.equal(
      JSON.stringify(a.obstacles),
      JSON.stringify(b.obstacles),
      `${NAME(i)} : les obstacles varient`,
    );
    // Et chaque emprise de mobilier est bien dans les obstacles : c'est elle
    // que `Fixtures` dessine au palier bas, la même et pas une autre.
    for (const f of a.fixtures) {
      if (!fixtureBlocks(f)) continue;
      for (const r of interiorSolids(f)) {
        assert.ok(
          a.obstacles.some((o) => Math.abs(o.x0 - r.x0) < 1e-6 && Math.abs(o.z0 - r.z0) < 1e-6
            && Math.abs(o.x1 - r.x1) < 1e-6 && Math.abs(o.z1 - r.z1) < 1e-6),
          `${NAME(i)} : une emprise de ${f.kind} ne barre rien`,
        );
      }
    }
  }
});
