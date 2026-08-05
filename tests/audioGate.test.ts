// Les robinets de rendu (src/systems/audioGate.ts).
//
// Ce sont eux qui débranchent la sono du quai entre deux gares, les
// avertisseurs des baies entre deux arrêts et la réverbération du lieu quand il
// n'y a plus de lieu. Le gain est réel - c'est l'essentiel de ce qui faisait
// grésiller les petites machines - mais le risque l'est aussi : un robinet qui
// se ferme au mauvais moment ne fait pas un craquement, il fait une ANNONCE
// MUETTE, et c'est pire.
//
// Ce fichier tient donc les quatre propriétés dont dépend cette sûreté :
//
//   • on n'ouvre jamais en retard : le réveil est immédiat, sans attendre la
//     prochaine image ;
//   • on ne ferme jamais tant qu'une lecture est en cours, quelle que soit sa
//     durée - c'est ce qui évite d'avoir à deviner la longueur d'un clip ;
//   • on ne ferme jamais avant la queue : le temps que la dernière rampe
//     retombe et que la réverbération finisse ;
//   • ouvrir et fermer ne se font qu'aux TRANSITIONS : rebrancher une arête
//     déjà branchée lèverait, et le débranchement ne doit pas se répéter.

import assert from 'node:assert/strict';
import test from 'node:test';

import { Gate } from '../src/systems/audioGate.ts';

/** Un robinet et son journal de câblage. */
function gate(tail = 1) {
  const log: string[] = [];
  const g = new Gate(tail, {
    open: () => log.push('open'),
    close: () => log.push('close'),
  });
  return { g, log };
}

test('le graphe naît branché, et la première image débranche ce qui dort', () => {
  const { g, log } = gate();
  assert.equal(g.open, true, 'un robinet neuf est ouvert : le graphe se monte branché');
  g.settle(0);
  assert.equal(g.open, false);
  assert.deepEqual(log, ['close']);
});

test('le réveil est immédiat : jamais une image de retard', () => {
  const { g, log } = gate();
  g.settle(0);
  g.wake(10, 0.5);
  assert.equal(g.open, true, 'la ligne est branchée AVANT que le son ne soit programmé');
  assert.deepEqual(log, ['close', 'open']);
});

test('la queue est respectée : rien ne se ferme sur un signal encore vivant', () => {
  const { g } = gate(1.5);
  g.settle(0);
  g.wake(10, 2); // deux secondes de son, puis 1,5 s de queue
  g.settle(11);
  assert.equal(g.open, true, 'le son joue encore');
  g.settle(12.5);
  assert.equal(g.open, true, 'la queue court');
  g.settle(13.4);
  assert.equal(g.open, true, 'toujours dans la queue');
  g.settle(13.6);
  assert.equal(g.open, false, 'son + queue écoulés');
});

test('une lecture en cours interdit la fermeture, quelle que soit sa durée', () => {
  const { g } = gate(1);
  g.settle(0);
  g.acquire(10);
  // Une annonce de vingt-cinq secondes : personne n'a eu à le prévoir.
  for (let t = 10; t < 35; t += 1) g.settle(t);
  assert.equal(g.open, true);
  g.release(35);
  g.settle(35.5);
  assert.equal(g.open, true, 'la queue court après la lecture');
  g.settle(36.1);
  assert.equal(g.open, false);
});

test('deux lectures qui se recouvrent ne se ferment pas l’une l’autre', () => {
  const { g } = gate(1);
  g.settle(0);
  g.acquire(10); // l'annonce de bord
  g.acquire(11); // le carillon de porte par-dessus
  g.release(12); // le carillon se termine
  g.settle(13.5);
  assert.equal(g.open, true, "l'annonce tient encore la ligne");
  assert.equal(g.holds, 1);
  g.release(20);
  g.settle(21.1);
  assert.equal(g.open, false);
});

test('un état tenu ne se ferme qu’à la relâche', () => {
  const { g } = gate(1);
  g.settle(0);
  g.hold(5, true); // le quai est là
  for (let t = 5; t < 90; t += 1) g.settle(t);
  assert.equal(g.open, true, 'une gare dure ce qu’elle dure');
  g.hold(90, false);
  g.settle(90.5);
  assert.equal(g.open, true);
  g.settle(91.1);
  assert.equal(g.open, false);
});

test('câblage : une seule ouverture et une seule fermeture par transition', () => {
  const { g, log } = gate(1);
  g.settle(0);
  // Cinquante images de gare, avec un état tenu reposé à chaque image.
  for (let i = 0; i < 50; i++) g.hold(10 + i * 0.016, true);
  for (let i = 0; i < 50; i++) g.settle(10 + i * 0.016);
  assert.deepEqual(log, ['close', 'open'], 'aucun rebranchement répété');
  g.hold(11, false);
  for (let i = 0; i < 200; i++) g.settle(11 + i * 0.016);
  assert.deepEqual(log, ['close', 'open', 'close'], 'une seule fermeture');
});

test('un relâchement de trop ne fait pas passer le compte sous zéro', () => {
  const { g } = gate(1);
  g.settle(0);
  g.acquire(1);
  g.release(2);
  g.release(2); // appel en double (reprise d'une lecture déjà finie)
  assert.equal(g.holds, 0);
  g.acquire(3);
  g.settle(10);
  assert.equal(g.open, true, 'le compte est reparti de zéro, pas de -1');
});

test('le palier peut interdire une ligne, sans trancher sa queue', () => {
  // Descendre d'un palier retire les réverbérations. Les couper NET en pleine
  // décroissance ferait un clic - au moment précis où l'on descend pour que ça
  // cesse de craquer, ce serait une plaisanterie de mauvais goût.
  const { g, log } = gate(4.5);
  g.wake(10, 0); // la salle vient de recevoir du signal
  g.disable(10);
  g.settle(12);
  assert.equal(g.open, true, 'la queue de la réverbération court encore');
  g.settle(14.6);
  assert.equal(g.open, false);
  // Et elle ne rouvre plus, quoi qu'on lui demande.
  g.wake(20, 1);
  g.hold(20, true);
  g.acquire(20);
  assert.equal(g.open, false, 'interdite veut dire interdite');
  assert.deepEqual(log, ['close']);
});

test('le palier qui remonte rend la ligne à ses déclencheurs', () => {
  const { g } = gate(1);
  g.settle(0);
  g.disable(0);
  g.wake(5, 0);
  assert.equal(g.open, false);
  g.enable();
  assert.equal(g.open, false, 'permettre n’est pas ouvrir : c’est le son qui ouvre');
  g.wake(6, 0);
  assert.equal(g.open, true);
});
