// Le code du salon se dicte au téléphone. Ce fichier le vérifie.
//
// Tout l'intérêt de l'alphabet retenu est qu'aucun de ses glyphes ne se confond
// avec un autre à l'oral ni à l'œil : pas de `0` face à `O`, pas de `1` face à
// `I` ou `L`, pas de `U` face à `V`. C'est une propriété qu'on ne peut pas
// « vérifier en jouant » - un code sur mille pose problème, et on l'attribuera
// à autre chose. Elle se fige donc ici, où elle ne peut plus se perdre au
// détour d'un « tiens, ajoutons quelques caractères pour avoir plus d'entropie ».

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, makeRoomCode, normalizeRoomCode, roomChannel } =
  await import('../src/systems/net/roomCode.ts');

/** Les glyphes qu'on a bannis, et pourquoi ils sont bannis. */
const AMBIGUS = ['0', 'O', '1', 'I', 'L', 'U'];

test('l’alphabet ne contient aucun glyphe ambigu', () => {
  for (const ch of AMBIGUS) {
    assert.equal(
      ROOM_CODE_ALPHABET.includes(ch),
      false,
      `« ${ch} » se confond avec un autre glyphe et n'a rien à faire là`,
    );
  }
});

test('l’alphabet n’a pas de doublon', () => {
  assert.equal(new Set(ROOM_CODE_ALPHABET).size, ROOM_CODE_ALPHABET.length);
});

test('dix mille codes restent dans l’alphabet et à la bonne longueur', () => {
  for (let i = 0; i < 10_000; i++) {
    const code = makeRoomCode();
    assert.equal(code.length, ROOM_CODE_LENGTH);
    for (const ch of code) {
      assert.ok(ROOM_CODE_ALPHABET.includes(ch), `« ${ch} » n'est pas dans l'alphabet`);
    }
  }
});

test('dix mille codes ne se répètent pratiquement jamais', () => {
  // Sept cent vingt-neuf millions de combinaisons : sur dix mille tirages, le
  // paradoxe des anniversaires prévoit moins d'une collision en moyenne. On
  // tolère large - ce test ne mesure pas la cryptographie, il attrape le jour
  // où le tirage se met à rendre toujours la même chose.
  const vus = new Set<string>();
  for (let i = 0; i < 10_000; i++) vus.add(makeRoomCode());
  assert.ok(vus.size > 9_990, `seulement ${vus.size} codes distincts sur 10 000`);
});

test('un code recopié de travers est rattrapé', () => {
  const code = makeRoomCode();
  assert.equal(normalizeRoomCode(code.toLowerCase()), code);
  assert.equal(normalizeRoomCode(`  ${code}  `), code);
  assert.equal(normalizeRoomCode(`${code.slice(0, 3)}-${code.slice(3)}`), code);
  assert.equal(normalizeRoomCode(`${code.slice(0, 3)} ${code.slice(3)}`), code);
});

test('un code contenant un glyphe ambigu est REFUSÉ, jamais deviné', () => {
  // C'est le test qui porte la décision de conception. Corriger « ABC23O » en
  // « ABC230 » ferait entrer le joueur dans un salon qui n'est pas le sien, et
  // rien à l'écran ne le lui dirait : il attendrait ses amis dans une rame
  // vide. Refuser franchement lui fait relire son code, ce qui prend trois
  // secondes et se comprend tout seul.
  assert.equal(normalizeRoomCode('ABC23O'), null);
  assert.equal(normalizeRoomCode('ABC230'), null);
  assert.equal(normalizeRoomCode('ABC23I'), null);
  assert.equal(normalizeRoomCode('ABC23L'), null);
  assert.equal(normalizeRoomCode('ABC23U'), null);
});

test('une longueur qui n’est pas la bonne est refusée', () => {
  assert.equal(normalizeRoomCode('ABC23'), null);
  assert.equal(normalizeRoomCode('ABC2345'), null);
  assert.equal(normalizeRoomCode(''), null);
});

test('ce qui n’est pas une chaîne est refusé sans exploser', () => {
  for (const junk of [null, undefined, 42, {}, []]) {
    assert.equal(normalizeRoomCode(junk as unknown as string), null);
  }
});

test('tout code tiré se renormalise en lui-même', () => {
  // L'invariant qui lie les deux fonctions : ce qu'on produit, on doit
  // pouvoir le relire. Sans lui, on pourrait très bien tirer des codes que
  // personne ne peut saisir.
  for (let i = 0; i < 1_000; i++) {
    const code = makeRoomCode();
    assert.equal(normalizeRoomCode(code), code);
  }
});

test('le nom du canal se compose en un seul endroit', () => {
  assert.equal(roomChannel('ABC234'), 'train:ABC234');
});
