// L'élection de l'hôte : une fonction, et surtout pas une négociation.
//
// Ce qu'on vérifie ici n'est pas « la bonne personne gagne » - c'est trivial -
// mais que la règle est TOTALE et STABLE. Tout le monde reçoit le même roster
// de Supabase et l'applique séparément, sans échanger un seul message à ce
// sujet ; si deux clients pouvaient en tirer deux réponses, ils diffuseraient
// deux mondes concurrents dans la même rame, et rien dans le code ne le
// signalerait.
//
// D'où l'insistance sur trois propriétés : le résultat ne dépend pas de l'ordre
// de la liste, il ne change pas quand on le recalcule, et les cas dégénérés
// (personne, tout le monde descendu, arrivées simultanées) ont une réponse
// définie.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { HOST_SILENCE_MS, electHost, electHostWithLiveness } = await import(
  '../src/systems/net/hostElection.ts'
);

type Member = Parameters<typeof electHost>[0][number];

function m(id: string, joinedAt: number, attached = true): Member {
  return { id, joinedAt, attached };
}

test('le plus ancien arrivé mène la rame', () => {
  const salon = [m('c', 300), m('a', 100), m('b', 200)];
  assert.equal(electHost(salon), 'a');
});

test('l’ordre de la liste ne change rien', () => {
  // Supabase ne garantit pas l'ordre de `presenceState()`, et deux clients
  // peuvent parfaitement recevoir les mêmes pairs dans deux ordres différents.
  const salon = [m('a', 100), m('b', 200), m('c', 300)];
  const attendu = electHost(salon);
  for (const permutation of [
    [salon[2], salon[0], salon[1]],
    [salon[1], salon[2], salon[0]],
    [...salon].reverse(),
  ]) {
    assert.equal(electHost(permutation), attendu);
  }
});

test('deux arrivées dans la même milliseconde sont départagées, et toujours pareil', () => {
  const salon = [m('zoe', 100), m('ada', 100)];
  assert.equal(electHost(salon), 'ada');
  assert.equal(electHost([...salon].reverse()), 'ada');
});

test('recalculer ne change jamais d’avis', () => {
  // La stabilité est ce qui remplace le protocole : si la fonction hésitait,
  // l'autorité clignoterait à chaque `sync` de présence, c'est-à-dire deux fois
  // par seconde, et chaque bascule coûte un battement hors cadence.
  const salon = [m('a', 100), m('b', 200), m('c', 100)];
  const premier = electHost(salon);
  for (let i = 0; i < 20; i++) assert.equal(electHost(salon), premier);
});

test('le départ de l’hôte élit le suivant, et rien d’autre ne bouge', () => {
  const salon = [m('a', 100), m('b', 200), m('c', 300)];
  assert.equal(electHost(salon), 'a');
  const sansA = salon.filter((x) => x.id !== 'a');
  assert.equal(electHost(sansA), 'b');
  // Et le retour de `a` lui rend la main : la fonction ne garde pas rancune.
  assert.equal(electHost(salon), 'a');
});

test('un arrivant tardif ne prend jamais la main', () => {
  const salon = [m('a', 100), m('b', 200)];
  for (let t = 300; t < 5_000; t += 137) {
    assert.equal(electHost([...salon, m('tard', t)]), 'a');
  }
});

test('un voyageur descendu sur le quai est écarté', () => {
  // Il continue de jouer, mais son monde a divergé : sa gare n'est plus celle
  // des autres. En faire l'hôte téléporterait tout le salon sur son quai.
  const salon = [m('a', 100, false), m('b', 200)];
  assert.equal(electHost(salon), 'b');
});

test('si tout le monde est descendu, personne ne mène', () => {
  const salon = [m('a', 100, false), m('b', 200, false)];
  assert.equal(electHost(salon), null);
});

test('un salon vide n’a pas d’hôte', () => {
  assert.equal(electHost([]), null);
});

test('un hôte muet depuis six secondes est remplacé', () => {
  const salon = [m('a', 100), m('b', 200)];
  const vus = new Map([
    ['a', 1_000],
    ['b', 9_000],
  ]);
  const maintenant = 1_000 + HOST_SILENCE_MS + 1;
  assert.equal(electHostWithLiveness(salon, vus, maintenant), 'b');
});

test('un hôte qui vient de parler garde la main', () => {
  const salon = [m('a', 100), m('b', 200)];
  const vus = new Map([['a', 9_000]]);
  assert.equal(electHostWithLiveness(salon, vus, 9_100), 'a');
});

test('un pair jamais entendu compte comme frais : il vient peut-être d’arriver', () => {
  const salon = [m('a', 100), m('b', 200)];
  assert.equal(electHostWithLiveness(salon, new Map(), 999_999), 'a');
});

test('si tout le monde se tait, on garde un hôte plutôt qu’aucun', () => {
  // Mieux vaut une autorité douteuse qu'un salon figé : s'il est vraiment
  // parti, sa présence finira par se retirer et l'élection suivante sera nette.
  const salon = [m('a', 100), m('b', 200)];
  const vus = new Map([
    ['a', 0],
    ['b', 0],
  ]);
  assert.equal(electHostWithLiveness(salon, vus, 999_999), 'a');
});
