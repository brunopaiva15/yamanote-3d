// Ce que le tchat laisse passer, et à quel rythme.
//
// Un salon se rejoint par un code qu'on donne à qui l'on veut : il n'y a pas
// d'inconnus dedans, et il n'y a donc pas de modération à faire. Ce qu'il faut,
// c'est que le tchat ne puisse rien CASSER - une bulle défoncée par un retour à
// la ligne, un message d'un mégaoctet qui fait ramer la scène, un onglet parti
// en boucle qui noie le canal.
//
// Le nettoyage tourne AUX DEUX BOUTS, à l'envoi et à la réception, et les tests
// ci-dessous portent surtout sur le second : à l'envoi, le champ de saisie
// borne déjà ; à la réception, on ne contrôle rien de ce qui arrive.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { CHAT_BURST, CHAT_REFILL_MS, bucketFor, makeBucket, sanitize, takeToken } = await import(
  '../src/systems/net/chatLimiter.ts'
);
const { CHAT_MAX_LENGTH } = await import('../src/systems/net/protocol.ts');

// --- Nettoyage ------------------------------------------------------------

test('un message ordinaire traverse sans une égratignure', () => {
  assert.equal(sanitize('Bonjour, on descend à Ueno ?'), 'Bonjour, on descend à Ueno ?');
  assert.equal(sanitize('次は、上野。'), '次は、上野。');
});

test('un message est UNE ligne', () => {
  // La bulle au-dessus des têtes est dimensionnée pour deux lignes de rendu,
  // pas pour un poème : un retour à la ligne la ferait déborder sur la scène.
  assert.equal(sanitize('un\ndeux\r\ntrois'), 'un deux trois');
  assert.equal(sanitize('un\t\tdeux'), 'un deux');
});

test('les blancs répétés s’effondrent et les bords se retaillent', () => {
  assert.equal(sanitize('   trop    d espaces   '), 'trop d espaces');
});

test('un message vide, ou vide une fois nettoyé, rend la chaîne vide', () => {
  assert.equal(sanitize(''), '');
  assert.equal(sanitize('    '), '');
  assert.equal(sanitize('\n\n\t'), '');
});

/**
 * Un point de code, écrit par son numéro.
 *
 * Tous les caractères éprouvés ci-dessous sont invisibles par construction :
 * les coller littéralement dans ce fichier donnerait des lignes qu'on ne peut
 * ni relire, ni comparer dans un diff, ni recopier sans les perdre - et le
 * fichier lui-même cesserait d'être du texte pour les outils qui le lisent.
 * On les nomme donc, un par un.
 */
const cp = (n: number) => String.fromCodePoint(n);

test('les caractères de commande disparaissent', () => {
  assert.equal(sanitize(`a${cp(0x00)}b${cp(0x07)}c`), 'abc');
  assert.equal(sanitize(`a${cp(0x1b)}b`), 'ab');
  assert.equal(sanitize(`a${cp(0x7f)}b`), 'ab');
});

test('les espaces de largeur nulle disparaissent', () => {
  assert.equal(sanitize(`a${cp(0x200b)}b${cp(0x200c)}c`), 'abc');
  assert.equal(sanitize(`${cp(0xfeff)}coucou`), 'coucou');
});

test('la surcharge de sens d’écriture est retirée', () => {
  // U+202E (RLO) retourne l'ordre d'affichage de tout ce qui le suit. C'est le
  // seul vrai tour pendable qu'on puisse jouer avec du texte brut, et il
  // défigure une bulle sans qu'aucune longueur ni aucun caractère ne paraisse
  // anormal - donc sans qu'aucune autre garde ne le voie passer.
  assert.equal(sanitize(`salut${cp(0x202e)}monde`), 'salutmonde');
  assert.equal(sanitize(`a${cp(0x200e)}b${cp(0x200f)}c`), 'abc');
  assert.equal(sanitize(`a${cp(0x2066)}b${cp(0x2069)}c`), 'abc');
});

test('un message trop long est coupé, pas refusé', () => {
  // Rejeter ferait taire quelqu'un qui a simplement trop écrit ; couper le
  // laisse parler, ce qui est plus aimable et tout aussi sûr.
  const out = sanitize('a'.repeat(5_000));
  assert.equal(out.length, CHAT_MAX_LENGTH);
});

test('un émoji n’est jamais coupé en deux', () => {
  // Un émoji fait deux unités UTF-16 : couper au milieu produirait un carré
  // de remplacement au lieu du sourire qu'on voulait.
  const out = sanitize('🚃'.repeat(200));
  assert.equal([...out].length, CHAT_MAX_LENGTH);
  assert.equal(out.includes('�'), false, 'un émoji a été coupé en deux');
});

test('ce qui n’est pas une chaîne rend la chaîne vide sans exploser', () => {
  for (const junk of [null, undefined, 42, {}, []]) {
    assert.equal(sanitize(junk), '');
  }
});

test('nettoyer deux fois ne change rien', () => {
  // Le nettoyage tourne aux deux bouts du fil : s'il n'était pas idempotent,
  // l'émetteur et le récepteur n'afficheraient pas le même message.
  for (const brut of ['  a  b  ', `x${cp(0x202e)}y`, 'a'.repeat(300), '🚃🚃 coucou']) {
    const une = sanitize(brut);
    assert.equal(sanitize(une), une, `« ${brut} »`);
  }
});

// --- Débit ----------------------------------------------------------------

test('une rafale de trois passe, la quatrième non', () => {
  // Trois répliques coup sur coup, c'est une conversation ; la quatrième dans
  // la même seconde, c'est une machine.
  const seau = makeBucket(0);
  for (let i = 0; i < CHAT_BURST; i++) {
    assert.equal(takeToken(seau, 0), true, `message ${i + 1}`);
  }
  assert.equal(takeToken(seau, 0), false);
});

test('le seau se remplit avec le temps', () => {
  const seau = makeBucket(0);
  for (let i = 0; i < CHAT_BURST; i++) takeToken(seau, 0);
  assert.equal(takeToken(seau, CHAT_REFILL_MS - 1), false);
  assert.equal(takeToken(seau, CHAT_REFILL_MS), true);
});

test('le seau ne déborde pas : se taire longtemps ne donne pas droit à cent messages', () => {
  const seau = makeBucket(0);
  const tard = CHAT_REFILL_MS * 1_000;
  for (let i = 0; i < CHAT_BURST; i++) {
    assert.equal(takeToken(seau, tard), true, `message ${i + 1}`);
  }
  assert.equal(takeToken(seau, tard), false);
});

test('une horloge qui recule ne rend pas de jetons', () => {
  const seau = makeBucket(10_000);
  for (let i = 0; i < CHAT_BURST; i++) takeToken(seau, 10_000);
  assert.equal(takeToken(seau, 0), false);
});

test('chaque pair a son propre droit de parole', () => {
  // Un seau commun laisserait un onglet emballé consommer la parole de tout le
  // monde : la victime du bogue serait le salon, pas son auteur.
  const seaux = new Map<string, ReturnType<typeof makeBucket>>();
  for (let i = 0; i < CHAT_BURST + 2; i++) takeToken(bucketFor(seaux, 'bavard', 0), 0);
  assert.equal(takeToken(bucketFor(seaux, 'bavard', 0), 0), false);
  assert.equal(takeToken(bucketFor(seaux, 'discret', 0), 0), true);
});

test('un pair inconnu reçoit un seau plein à sa première parole', () => {
  const seaux = new Map<string, ReturnType<typeof makeBucket>>();
  const seau = bucketFor(seaux, 'nouveau', 5_000);
  assert.equal(seau.tokens, CHAT_BURST);
  assert.equal(seaux.size, 1);
  // Et le même pair retrouve SON seau, pas un neuf.
  takeToken(seau, 5_000);
  assert.equal(bucketFor(seaux, 'nouveau', 5_000).tokens, CHAT_BURST - 1);
});
