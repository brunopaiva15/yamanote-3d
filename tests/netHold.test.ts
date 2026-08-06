// La rame attend tout le monde, et ne part jamais sans personne.
//
// C'est la règle qui empêche un salon de se scinder en deux. Le jeu a deux
// machines à états - le cycle de la boucle, et l'attente de quai - qui ne
// s'accordent pas : dès que l'un descend et que l'autre reste à bord, leurs
// mondes divergent pour de bon. Plutôt que de répliquer la seconde, on empêche
// la divergence d'arriver : tant qu'un membre a les pieds sur le quai, la rame
// attend.
//
// ELLE ATTENDAIT QUATRE-VINGT-DIX SECONDES, puis partait, et le retardataire se
// « détachait ». Ça ne tenait pas debout, et le symptôme le disait : resté à
// quai pendant que les autres embarquaient, on voyait les bâtiments avancer
// tout seuls - la resynchronisation dure écrit `runtime.distance`, si bien que
// le décor d'un suiveur roulait avec la rame du salon, quai sous les pieds.
// Deux mondes qui divergent ne se rejoignent pas à moitié.
//
// Trois propriétés à tenir :
//
//  · la rame attend VRAIMENT, et sans limite de temps ;
//  · elle n'attend pas une place VIDE - un onglet fermé ou muet ne compte pas,
//    et c'est ce qui remplace l'ancien plafond ;
//  · seul l'HÔTE pose le blocage (sinon deux clients se retiennent l'un l'autre
//    sans jamais s'accorder sur la fin de l'attente), mais TOUT LE MONDE compte
//    les gens à quai, pour pouvoir l'afficher.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { holdingAshore, holdingSelf, resetHold, updateHold } = await import(
  '../src/systems/net/hold.ts'
);
const { clearPeers, receivePose, syncRoster } = await import('../src/systems/net/peers.ts');
const { POSE_STALE_MS } = await import('../src/systems/net/poseBuffer.ts');
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

/** Un pair présent, dans le repère demandé. */
function pair(id: string, frame: 0 | 1, attached = true): void {
  syncRoster(
    [{ id, name: id, avatar: 1, mode: 'full', attached, joinedAt: 1 }],
    'moi',
    0,
  );
  receivePose(id, pose(frame), horloge);
}

/** Une image, à l'instant de la dernière pose reçue. */
function image(): void {
  updateHold(horloge);
}

// --- La rame attend ---------------------------------------------------------

test('personne à quai : la rame ne retient rien', () => {
  neuf();
  pair('toi', 0);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, false);
  assert.equal(holdingAshore(), 0);
});

test('un pair sur le quai retient la rame', () => {
  neuf();
  pair('toi', 1);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, true);
  assert.equal(holdingAshore(), 1);
  assert.equal(holdingSelf(), false, 'ce n’est pas nous qu’on attend');
});

test('descendre soi-même retient la rame aussi', () => {
  // Évident, et pourtant facile à manquer : on ne se met pas dans son propre
  // roster (voir peers), donc la boucle sur les pairs ne nous voit pas.
  neuf();
  runtime.playerFrame = 'platform';
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, true);
  assert.equal(holdingSelf(), true);
});

test('on compte tout le monde, pas seulement le premier', () => {
  neuf();
  runtime.playerFrame = 'platform';
  syncRoster(
    [
      { id: 'a', name: 'a', avatar: 1, mode: 'full', attached: true, joinedAt: 1 },
      { id: 'b', name: 'b', avatar: 2, mode: 'full', attached: true, joinedAt: 1 },
    ],
    'moi',
    0,
  );
  receivePose('a', pose(1), horloge);
  receivePose('b', pose(1), horloge);
  image();
  assert.equal(holdingAshore(), 3, 'eux deux, et nous');
});

test('remonter à bord libère la rame', () => {
  neuf();
  pair('toi', 1);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, true);
  receivePose('toi', pose(0), horloge);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

test('la rame n’est libérée que quand le DERNIER est monté', () => {
  neuf();
  runtime.playerFrame = 'platform';
  pair('toi', 1);
  image();
  assert.equal(holdingAshore(), 2);
  // Le pair monte : on est encore à quai, la rame reste tenue.
  receivePose('toi', pose(0), horloge);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, true);
  assert.equal(holdingAshore(), 1);
  // On monte à notre tour : elle peut partir.
  runtime.playerFrame = 'car';
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

test('un pair qui n’est pas dans le monde du salon ne retient rien', () => {
  neuf();
  pair('ailleurs', 1, false);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

// --- Elle n'attend pas une place vide ---------------------------------------

test('la rame attend aussi longtemps qu’il le faut', () => {
  // C'est le changement : l'ancienne règle la faisait partir au bout de
  // quatre-vingt-dix secondes, et laissait le retardataire dans un autre monde.
  neuf();
  pair('toi', 1);
  for (let i = 0; i < 3000; i++) {
    // Le pair continue de donner signe de vie, comme un joueur qui marche sur
    // le quai : c'est bien lui qu'on attend, et non un onglet oublié.
    receivePose('toi', pose(1), horloge);
    image();
  }
  assert.equal(
    runtime.departureBlockers.heldAtStation,
    true,
    'la rame ne doit plus partir sans lui, quel que soit le temps passé',
  );
});

test('un pair muet cesse d’être attendu', () => {
  // Ce qui remplace le plafond, et c'est mieux : on n'attend pas un onglet
  // fermé dont la dernière pose le montre debout sur le quai pour toujours.
  neuf();
  pair('toi', 1);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, true);
  updateHold(horloge + POSE_STALE_MS + 1);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

test('un pair qui reprend la parole est de nouveau attendu', () => {
  neuf();
  pair('toi', 1);
  updateHold(horloge + POSE_STALE_MS + 1);
  assert.equal(runtime.departureBlockers.heldAtStation, false);
  receivePose('toi', pose(1), horloge);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, true);
});

test('notre propre silence ne nous efface pas', () => {
  // On ne publie pas de pose pour soi-même : notre présence à quai se lit dans
  // le runtime, pas dans un tampon. Un test de fraîcheur qui nous oublierait
  // ferait partir la rame sans nous - exactement ce qu'on vient d'interdire.
  neuf();
  runtime.playerFrame = 'platform';
  updateHold(horloge + 10 * POSE_STALE_MS);
  assert.equal(runtime.departureBlockers.heldAtStation, true);
});

// --- Seul l'hôte décide, mais tout le monde compte --------------------------

test('un suiveur ne pose jamais le blocage lui-même', () => {
  // Il le REÇOIT dans le battement. Deux clients qui poseraient chacun le leur
  // se retiendraient l'un l'autre sans jamais s'accorder sur la fin.
  neuf('follower');
  pair('toi', 1);
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, false);
});

test('un suiveur sait tout de même qui il attend', () => {
  // Le blocage lui arrive dans le battement ; le COMPTE, lui, se fait chez lui,
  // sans quoi il ne pourrait pas dire pourquoi les portes restent ouvertes.
  neuf('follower');
  pair('toi', 1);
  image();
  runtime.departureBlockers.heldAtStation = true;
  assert.equal(holdingAshore(), 1);
});

test('hors salon, ce blocage n’a toujours aucun producteur', () => {
  // C'est la non-régression du jeu solo : `heldAtStation` est câblé depuis
  // longtemps et n'était écrit nulle part. Il ne doit pas se mettre à l'être
  // parce que le multijoueur existe.
  neuf('solo');
  runtime.playerFrame = 'platform';
  image();
  assert.equal(runtime.departureBlockers.heldAtStation, false);
  assert.equal(holdingAshore(), 0);
});

test('quitter le salon remet tout à plat', () => {
  neuf();
  runtime.playerFrame = 'platform';
  image();
  resetHold();
  assert.equal(holdingAshore(), 0);
  assert.equal(holdingSelf(), false);
});
