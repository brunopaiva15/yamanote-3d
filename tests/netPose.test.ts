// La conversion de repère : le seul vrai risque des avatars distants.
//
// Le rendu, lui, est éprouvé depuis longtemps par la foule du quai - c'est le
// même `buildPerson`. Ce qui est neuf, c'est qu'une position arrive du réseau
// DANS LE REPÈRE DE SON ÉMETTEUR, et que ce repère n'est pas forcément le nôtre.
//
// Tant que tout le monde est à bord, cela ne se voit pas : le repère du wagon
// est celui du monde. Tout se joue quand quelqu'un descend. Alors la gare
// s'épingle, la rame se met à glisser, et les deux repères divergent - et une
// erreur ici se manifeste par un camarade qui reste planté sur le ballast
// pendant que le train part, ou qui traverse le quai à contresens.
//
// J'ai d'abord voulu vérifier ça dans un vrai navigateur. Les deux propriétés
// centrales y sont bien passées, mais le rendu logiciel du harnais tourne à une
// image par seconde et demie : les fondus d'apparition, qui n'avancent qu'à
// l'image, rendaient la sonde ingouvernable. Le test unitaire dit la même chose,
// en trente millisecondes, et il ne ment pas.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { peerWorldPose } = await import('../src/systems/net/pose.ts');
const { clearPeers, receivePose, syncRoster, updatePeers } = await import(
  '../src/systems/net/peers.ts'
);
const { runtime } = await import('../src/systems/runtime.ts');
const { useStore } = await import('../src/store.ts');
const { DOOR_SIDE } = await import('../src/data/stations.ts');

type Pose = Parameters<typeof receivePose>[1];

function pose(over: Partial<Pose> = {}): Pose {
  return {
    t: 0,
    frame: 0,
    level: 0,
    station: 0,
    x: 0,
    y: 1.55,
    z: 0,
    yaw: 0,
    pitch: 0,
    seated: false,
    moving: false,
    ...over,
  };
}

/**
 * Un pair présent, visible, et alimenté par deux poses identiques.
 *
 * Deux et non une : le tampon interpole, et l'on veut lire entre deux
 * échantillons réels plutôt que sur le repli « avant le premier ».
 */
function voisin(p: Partial<Pose>, station = 0): void {
  clearPeers();
  useStore.setState({ platformIndex: station, index: station, doorSide: DOOR_SIDE[station] });
  syncRoster(
    [{ id: 'toi', name: 'Toi', avatar: 1, mode: 'full', attached: true, joinedAt: 1 }],
    'moi',
    0,
  );
  // La gare du pair suit celle qu'on longe, sauf si l'appelant en décide
  // autrement : c'est le cas courant - on se voit parce qu'on est au même quai.
  receivePose('toi', pose({ station, ...p, t: 0 }), 0);
  receivePose('toi', pose({ station, ...p, t: 200 }), 200);
  // Une image suffit à faire monter le fondu à un : sans elle, `peerWorldPose`
  // répond `null` à juste titre - le pair n'est pas encore apparu.
  updatePeers(1, 200);
}

/** L'instant de lecture : le tampon affiche 130 ms dans le passé. */
const LIRE_A = 330;

// --- Repère du wagon --------------------------------------------------------

test('à bord, une position passe telle quelle', () => {
  runtime.trainZ = 0;
  voisin({ frame: 0, x: 0.4, z: -2 });
  const p = peerWorldPose('toi', LIRE_A);
  assert.ok(p);
  assert.ok(Math.abs(p.x - 0.4) < 1e-6, `x = ${p.x}`);
  assert.ok(Math.abs(p.z + 2) < 1e-6, `z = ${p.z}`);
});

test('un pair resté dans la rame DÉFILE avec elle', () => {
  // Vu du quai : la gare est épinglée, la rame glisse. Quelqu'un assis à sa
  // place doit s'éloigner avec la voiture, à travers les vitres.
  voisin({ frame: 0, x: 0.4, z: -2 });
  runtime.trainZ = 0;
  const arret = peerWorldPose('toi', LIRE_A);
  runtime.trainZ = -8;
  const parti = peerWorldPose('toi', LIRE_A);
  assert.ok(arret && parti);
  assert.ok(
    Math.abs(parti.z - (arret.z - 8)) < 1e-6,
    `${arret.z} → ${parti.z} : il ne suit pas la rame`,
  );
  runtime.trainZ = 0;
});

// --- Repère du quai ---------------------------------------------------------

test('un pair sur le quai NE SUIT PAS la rame', () => {
  // L'exact opposé du test précédent, et c'est bien pour ça qu'il y a deux
  // repères : le béton ne bouge pas quand le train part.
  runtime.platformSlide = 0;
  voisin({ frame: 1, x: 3, z: 5 }, 0);
  const avant = peerWorldPose('toi', LIRE_A);
  runtime.trainZ = -12;
  const apres = peerWorldPose('toi', LIRE_A);
  assert.ok(avant && apres);
  assert.ok(Math.abs(apres.z - avant.z) < 1e-6, `${avant.z} → ${apres.z}`);
  runtime.trainZ = 0;
});

test('le glissement du quai est appliqué, lui', () => {
  // Pendant le départ, c'est le QUAI qui glisse dans le repère monde (vu du
  // wagon). Un pair resté dessus doit s'éloigner d'autant.
  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  voisin({ frame: 1, x: 3, z: 5 }, 0);
  const colle = peerWorldPose('toi', LIRE_A);
  runtime.platformSlide = 14;
  const loin = peerWorldPose('toi', LIRE_A);
  assert.ok(colle && loin);
  assert.ok(Math.abs(loin.z - (colle.z + 14)) < 1e-6, `${colle.z} → ${loin.z}`);
  runtime.platformSlide = 0;
});

test('un quai retourné retourne aussi les positions', () => {
  // Une gare sur deux s'ouvre de l'autre côté, et son repère est alors tourné
  // d'un demi-tour. Oublier ce facteur mettrait le camarade de l'autre côté des
  // voies - dans une gare sur deux, et seulement dans une gare sur deux.
  const plus = DOOR_SIDE.findIndex((d) => d === 1);
  const moins = DOOR_SIDE.findIndex((d) => d === -1);
  assert.ok(plus >= 0 && moins >= 0, 'la boucle doit avoir les deux côtés');

  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  voisin({ frame: 1, x: 3, z: 5 }, plus);
  const droit = peerWorldPose('toi', LIRE_A);
  voisin({ frame: 1, x: 3, z: 5 }, moins);
  const retourne = peerWorldPose('toi', LIRE_A);
  assert.ok(droit && retourne);
  assert.ok(Math.abs(retourne.x + droit.x) < 1e-6, `x : ${droit.x} contre ${retourne.x}`);
  assert.ok(Math.abs(retourne.z + droit.z) < 1e-6, `z : ${droit.z} contre ${retourne.z}`);
});

test('un quai retourné retourne aussi le REGARD', () => {
  // Le piège jumeau du précédent, et le plus facile à manquer : la position est
  // convertie, mais si le lacet ne l'est pas, le camarade regarde exactement à
  // l'opposé de ce qu'il regarde chez lui.
  const plus = DOOR_SIDE.findIndex((d) => d === 1);
  const moins = DOOR_SIDE.findIndex((d) => d === -1);

  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  voisin({ frame: 1, x: 0, z: 0, yaw: 0.5 }, plus);
  const droit = peerWorldPose('toi', LIRE_A);
  voisin({ frame: 1, x: 0, z: 0, yaw: 0.5 }, moins);
  const retourne = peerWorldPose('toi', LIRE_A);
  assert.ok(droit && retourne);
  const ecart = Math.abs(Math.atan2(Math.sin(retourne.yaw - droit.yaw), Math.cos(retourne.yaw - droit.yaw)));
  assert.ok(Math.abs(ecart - Math.PI) < 1e-6, `écart de lacet : ${ecart} au lieu de π`);
});

// --- Les cas où l'on ne dessine rien ----------------------------------------

test('sur un autre quai, on ne le dessine pas', () => {
  runtime.trainZ = 0;
  voisin({ frame: 1, x: 3, z: 5, station: 5 }, 5);
  assert.ok(peerWorldPose('toi', LIRE_A), 'il devrait être là sur SON quai');
  // La rame est passée à la gare suivante : lui est resté derrière.
  useStore.setState({ platformIndex: 6 });
  assert.equal(peerWorldPose('toi', LIRE_A), null);
});

test('un pair DÉTACHÉ dans un wagon n’est pas dans le nôtre', () => {
  // Rapporté depuis un vrai salon : « je vois mon ami qui n'est même pas à la
  // même station que moi ». La cause première était l'élection d'hôte, mais le
  // même symptôme s'obtient sans le moindre défaut de synchronisation : celui
  // qui a laissé la rame partir sans lui reprend la suivante, et sa pose
  // redevient alors du repère wagon. Sans ce garde, il se rassoit dans notre
  // rame alors qu'il roule vingt-cinq gares plus loin.
  runtime.trainZ = 0;
  voisin({ frame: 0, x: 0.4, z: -2 });
  assert.ok(peerWorldPose('toi', LIRE_A), 'attaché, il est bien avec nous');
  syncRoster(
    [{ id: 'toi', name: 'Toi', avatar: 1, mode: 'full', attached: false, joinedAt: 1 }],
    'moi',
    200,
  );
  assert.equal(peerWorldPose('toi', LIRE_A), null);
});

test('le détachement ne fait pas disparaître qui est sur NOTRE quai', () => {
  // Le garde ne porte que sur le repère wagon : quelqu'un de détaché mais
  // planté sur le quai qu'on longe est bel et bien là, et doit se voir. C'est
  // même le cas le plus courant du détachement - il vient de rater la rame.
  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  voisin({ frame: 1, x: 3, z: 5 }, 0);
  syncRoster(
    [{ id: 'toi', name: 'Toi', avatar: 1, mode: 'full', attached: false, joinedAt: 1 }],
    'moi',
    200,
  );
  assert.ok(peerWorldPose('toi', LIRE_A), 'sur notre quai, détaché ou non, il est là');
});

test('un pair inconnu ne se dessine pas', () => {
  clearPeers();
  assert.equal(peerWorldPose('fantome', LIRE_A), null);
});

test('un pair effacé ne se dessine plus', () => {
  voisin({ frame: 0, x: 1, z: 1 });
  assert.ok(peerWorldPose('toi', LIRE_A));
  // Deux secondes de silence : périmé, puis fondu à zéro.
  for (let i = 0; i < 5; i++) updatePeers(0.2, 5_000);
  assert.equal(peerWorldPose('toi', LIRE_A), null);
});

// --- Ce qui traverse sans être touché ---------------------------------------

test('l’assise, la marche et la hauteur traversent intactes', () => {
  runtime.trainZ = 0;
  voisin({ frame: 0, x: 0, z: 0, y: 1.16, seated: true, moving: false });
  const p = peerWorldPose('toi', LIRE_A);
  assert.ok(p);
  assert.equal(p.seated, true);
  assert.equal(p.moving, false);
  assert.ok(Math.abs(p.y - 1.16) < 1e-6, `y = ${p.y}`);
});

test('le hall de correspondance est un ÉTAGE, pas un repère', () => {
  // Trois mètres cinquante plus bas, dans les mêmes coordonnées de quai : la
  // hauteur reçue le porte déjà, il n'y a rien à corriger de ce côté-là.
  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  voisin({ frame: 1, x: 3, z: 5, y: -1.95, level: 1 }, 0);
  const p = peerWorldPose('toi', LIRE_A);
  assert.ok(p);
  assert.ok(p.y < 0, `le hall devrait être sous la dalle (y = ${p.y})`);
});
