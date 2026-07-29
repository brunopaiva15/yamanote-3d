// Les nombres de la porte bloquée (src/data/doorObstruction.ts).
//
// Le module n'a aucune dépendance — ni React, ni three, ni runtime — et prend
// son générateur aléatoire en argument : Node l'exécute tel quel, et un tirage
// scripté suffit à vérifier que la procédure ne dérive pas vers une porte
// d'ascenseur (réouverture immédiate, systématique, et en grand).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATTEMPTS,
  clearsOnAttempt,
  drawObstacle,
  drawObstruction,
  escalationHold,
  obstructionChance,
  playerObstacle,
  reactionDelay,
  reopenHold,
} from '../src/data/doorObstruction.ts';

/** Générateur scripté : rend les valeurs données, puis boucle sur la dernière. */
function scripted(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test('la fréquence des obstructions suit le remplissage, sans jamais saturer', () => {
  const empty = obstructionChance(0);
  const rush = obstructionChance(140);
  assert.ok(empty > 0, 'un train vide reste possible');
  assert.ok(empty < rush, 'la pointe bloque plus de portes que le creux');
  assert.ok(rush <= 0.18, 'un arrêt sur six au maximum : ça reste un incident');
  // Bornée des deux côtés, y compris pour des taux hors échelle.
  assert.equal(obstructionChance(-50), obstructionChance(0));
  assert.ok(obstructionChance(400) <= 0.18);
});

test('drawObstruction ne rend une obstruction que sous le seuil tiré', () => {
  const percent = 100;
  const chance = obstructionChance(percent);
  assert.equal(drawObstruction(percent, scripted([chance + 0.01])), null);
  assert.notEqual(drawObstruction(percent, scripted([0])), null);
});

test('un corps entrebâille la porte, un objet fin la referme presque', () => {
  // rand() #1 : type (< 0,28 → objet). #2 : jeu dans la fourchette.
  const person = drawObstacle(scripted([0.9, 0.5]));
  const object = drawObstacle(scripted([0.1, 0.5]));
  assert.equal(person.kind, 'person');
  assert.equal(object.kind, 'object');
  assert.ok(person.gap > 0.15, 'un corps laisse un vrai passage ouvert');
  assert.ok(object.gap < 0.05, 'une sangle ne se voit pas depuis la cabine');
  assert.ok(object.gap > 0, 'mais elle empêche bien le verrouillage');
});

test("l'obstacle « c'est vous » est un corps, et rien ne le dégage au hasard", () => {
  const gap = playerObstacle(scripted([0.5])).gap;
  const body = drawObstacle(scripted([0.9, 0.5])).gap;
  assert.equal(playerObstacle(scripted([0.5])).kind, 'person');
  assert.equal(gap, body, 'le jeu résiduel est celui d\'un corps, pas un cas à part');
  // Aucune fonction de tirage ne prend le joueur en charge : c'est
  // systems/doorObstruction qui regarde s'il a bougé (voir syncPlayerObstacle).
  assert.ok(playerObstacle(scripted([0])).gap > 0.15);
  assert.ok(playerObstacle(scripted([1])).gap <= 0.26);
});

test("l'objet fin se détecte plus tard que la personne", () => {
  const r = scripted([0.5]);
  assert.ok(reactionDelay('object', 1, r) > reactionDelay('person', 1, r));
  // Première réaction : jamais instantanée. C'est un humain qui décide.
  assert.ok(reactionDelay('person', 1, scripted([0])) >= 0.5);
});

test('la deuxième tentative part plus vite : le conducteur ne quitte plus la porte des yeux', () => {
  const mid = scripted([0.5]);
  assert.ok(reactionDelay('person', 2, mid) < reactionDelay('person', 1, mid));
  assert.ok(reactionDelay('object', 2, mid) < reactionDelay('object', 1, mid));
});

test('la durée de réouverture dit ce que le conducteur a vu', () => {
  const mid = scripted([0.5]);
  // Impulsion pour une sangle, ouverture franche pour quelqu'un en travers.
  assert.ok(reopenHold('object', 1, mid) < reopenHold('person', 1, mid));
  // Et jamais une porte qui reste ouverte : la commande est maintenue à la main.
  assert.ok(reopenHold('person', 1, scripted([1])) <= 3.1);
  // Une tentative qui a échoué appelle la suivante plus généreuse.
  assert.ok(reopenHold('person', 2, mid) > reopenHold('person', 1, mid));
});

test('une tentative peut échouer, et la procédure ne boucle pas indéfiniment', () => {
  assert.equal(clearsOnAttempt('person', 1, scripted([0.99])), false);
  assert.equal(clearsOnAttempt('person', 1, scripted([0])), true);
  // Les chances montent d'un essai à l'autre : un tirage qui échoue au premier
  // essai peut réussir au troisième.
  assert.equal(clearsOnAttempt('object', 1, scripted([0.6])), false);
  assert.equal(clearsOnAttempt('object', 3, scripted([0.6])), true);
  // Au-delà du dernier essai référencé, on ne tombe pas dans le vide.
  assert.equal(clearsOnAttempt('person', MAX_ATTEMPTS + 5, scripted([0])), true);
  assert.ok(MAX_ATTEMPTS >= 2, 'il faut pouvoir réessayer avant de tout rouvrir');
});

test("la réouverture générale laisse le temps à un agent d'arriver", () => {
  const short = escalationHold(scripted([0]));
  const long = escalationHold(scripted([1]));
  assert.ok(short >= 4, 'moins de quatre secondes, personne n\'a le temps de venir');
  assert.ok(long <= 7, 'plus de sept, le quai entier attendrait');
});
