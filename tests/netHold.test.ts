// La rame qui attend, et celle qui part sans vous.
//
// C'est la règle qui empêche un salon de se scinder en deux. Le jeu a deux
// machines à états - le cycle de la boucle, et l'attente de quai - qui ne
// s'accordent pas : dès que l'un descend et que l'autre reste à bord, leurs
// mondes divergent pour de bon. Plutôt que de répliquer la seconde, on empêche
// la divergence d'arriver : tant qu'un membre a les pieds sur le quai, la rame
// attend.
//
// Trois propriétés à tenir, et elles se contredisent presque :
//
//  · la rame attend VRAIMENT (sinon la règle ne sert à rien) ;
//  · elle n'attend pas INDÉFINIMENT (sinon quelqu'un qui va déjeuner immobilise
//    tout le salon) ;
//  · seul l'HÔTE pose le blocage (sinon deux clients se retiennent l'un l'autre
//    sans jamais s'accorder sur la fin de l'attente).

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { HOLD_MAX_S, detachSelf, holdRemaining, isDetached, resetHold, updateHold } = await import(
  '../src/systems/net/hold.ts'
);
const { clearPeers, receivePose, syncRoster } = await import('../src/systems/net/peers.ts');
const { runtime } = await import('../src/systems/runtime.ts');
const { resetDecisions, setNetRole } = await import('../src/systems/net/worldDecisions.ts');

type Pose = Parameters<typeof receivePose>[1];

// Le `t` doit être distinct d'un appel à l'autre : le tampon de poses
// dédoublonne sur l'horodatage, et deux poses au même instant ne feraient
// qu'une - ce qui rendait ce fichier vert pour la mauvaise raison.
let horloge = 0;

function pose(frame: 0 | 1): Pose {
  horloge += 100;
  return {
    t: horloge,
    frame,
    level: 0,
    station: 0,
    x: 0,
    y: 1.55,
    z: 0,
    yaw: 0,
    pitch: 0,
    seated: false,
    moving: false,
  };
}

function neuf(role: 'solo' | 'host' | 'follower' = 'host'): void {
  resetHold();
  resetDecisions();
  clearPeers();
  setNetRole(role);
  runtime.playerFrame = 'car';
  runtime.stopSequence = 1;
  runtime.departureBlockers.heldAtStation = false;
}

/** Fait passer le temps, par pas d'un dixième de seconde. */
function avancer(secondes: number): void {
  for (let i = 0; i < Math.ceil(secondes * 10); i++) updateHold(0.1);
}

/** Un pair présent, dans le repère demandé. */
function pair(id: string, frame: 0 | 1, attached = true): void {
  syncRoster(
    [{ id, name: id, avatar: 1, mode: 'full', attached, joinedAt: 1 }],
    'moi',
    0,
  );
  receivePose(id, pose(frame), horloge);
}

// --- La rame attend ---------------------------------------------------------

test('personne à quai : la rame ne retient rien', () => {
  neuf();
  pair('toi', 0);
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

test('un pair sur le quai retient la rame', () => {
  neuf();
  pair('toi', 1);
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, true);
});

test('descendre soi-même retient la rame aussi', () => {
  // Évident, et pourtant facile à manquer : on ne se met pas dans son propre
  // roster (voir peers), donc la boucle sur les pairs ne nous voit pas.
  neuf();
  runtime.playerFrame = 'platform';
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, true);
});

test('remonter à bord libère la rame', () => {
  neuf();
  pair('toi', 1);
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, true);
  receivePose('toi', pose(0), horloge);
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

test('un pair déjà détaché ne retient plus rien', () => {
  // Il a laissé la rame partir : il a son propre monde, sa propre gare, sa
  // propre rame. L'attendre reviendrait à retenir le salon pour quelqu'un qui
  // n'y est plus.
  neuf();
  pair('parti', 1, false);
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

// --- Mais pas indéfiniment --------------------------------------------------

test('au bout de quatre-vingt-dix secondes, la rame part', () => {
  neuf();
  pair('toi', 1);
  // On boucle franchement au-delà du plafond, et non pile dessus : neuf cents
  // additions de 0,1 s font 89,999… en virgule flottante, et le seuil n'est
  // jamais franchi. Un test qui tient à la dernière décimale d'un cumul de
  // flottants ne mesure pas ce qu'il croit.
  avancer(HOLD_MAX_S + 2);
  assert.equal(
    runtime.departureBlockers.heldAtStation,
    false,
    'quelqu’un qui va déjeuner immobiliserait tout le salon',
  );
});

test('le compte à rebours décroît, et s’arrête à zéro', () => {
  neuf();
  pair('toi', 1);
  updateHold(0.1);
  const debut = holdRemaining();
  assert.ok(debut > 0 && debut <= HOLD_MAX_S, `${debut}`);
  for (let i = 0; i < 100; i++) updateHold(0.1);
  const apres = holdRemaining();
  assert.ok(apres < debut, `${debut} → ${apres}`);
  avancer(HOLD_MAX_S + 2);
  assert.equal(holdRemaining(), 0);
});

test('un nouvel arrêt rend son crédit d’attente', () => {
  // Sans ça, un salon où quelqu'un descend souvent finirait par ne plus jamais
  // attendre personne : le compteur ne se remettrait jamais à zéro.
  neuf();
  pair('toi', 1);
  avancer(HOLD_MAX_S + 2);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
  runtime.stopSequence = 2;
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, true);
});

// --- Seul l'hôte décide -----------------------------------------------------

test('un suiveur ne pose jamais le blocage lui-même', () => {
  // Il le REÇOIT dans le battement. Deux clients qui poseraient chacun le leur
  // se retiendraient l'un l'autre sans jamais s'accorder sur la fin.
  neuf('follower');
  pair('toi', 1);
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

test('hors salon, ce blocage n’a toujours aucun producteur', () => {
  // C'est la non-régression du jeu solo : `heldAtStation` est câblé depuis
  // longtemps et n'était écrit nulle part. Il ne doit pas se mettre à l'être
  // parce que le multijoueur existe.
  neuf('solo');
  runtime.playerFrame = 'platform';
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
  assert.equal(holdRemaining(), 0);
});

// --- Le détachement ---------------------------------------------------------

test('la rame partie sans nous, on se détache', () => {
  neuf();
  assert.equal(isDetached(), false);
  detachSelf();
  assert.equal(isDetached(), true);
});

test('un détaché ne retient plus la rame, même les pieds sur le quai', () => {
  // Il a déjà son propre monde : le salon n'a plus rien à attendre de lui.
  neuf();
  runtime.playerFrame = 'platform';
  detachSelf();
  updateHold(0.1);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

test('remonter dans une rame annule le détachement', () => {
  neuf();
  runtime.playerFrame = 'platform';
  detachSelf();
  assert.equal(isDetached(), true);
  runtime.playerFrame = 'car';
  updateHold(0.1);
  assert.equal(isDetached(), false);
});

test('hors salon, on ne se détache de rien', () => {
  neuf('solo');
  detachSelf();
  assert.equal(isDetached(), false);
});

test('quitter le salon remet tout à plat', () => {
  neuf();
  runtime.playerFrame = 'platform';
  detachSelf();
  updateHold(0.1);
  resetHold();
  assert.equal(isDetached(), false);
  assert.equal(holdRemaining(), 0);
});
