// Prononciation des noms japonais dans les annonces ANGLAISES.
//
// Ce que ce test protège : rien, dans la gravure, ne signale un nom propre lu à
// l'anglaise. Le G2P ne renvoie pas d'erreur pour « Ikebukuro » - il renvoie
// « ick-uh-BYOO-kuh-roh », un MP3 parfaitement valide qu'il faut écouter pour
// voir passer. Ajouter une gare, une ligne en correspondance ou une sortie
// nommée sans sa lecture (scripts/en-readings.ts) est donc une régression
// silencieuse, et c'est exactement celle-là qu'on attrape ici.
//
// La règle est simple : dans un texte anglais gravé, tout mot capitalisé est
// soit un mot anglais de la liste ci-dessous, soit un nom propre japonais - et
// alors il porte sa prononciation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../scripts/announcements-export.ts';
import { hasReading, markJapanesePronunciation, moraPhonemes } from '../scripts/en-readings.ts';
import { LINES } from '../src/data/lines.ts';
import { STATIONS } from '../src/data/stations.ts';

/**
 * Les seuls mots capitalisés des annonces anglaises qui ne sont PAS japonais.
 * Les phrases sont découpées au point (c'est la pause des annonces), d'où les
 * « And », « For », « Your » en tête de segment.
 */
const ENGLISH_WORDS = new Set([
  'A', 'After', 'And', 'Assistance', 'Attention', 'Do', 'Due', 'Express',
  'For', 'Gateway', 'In', 'It', 'J', 'Line', 'Liner', 'Lines', 'Metro', 'Monorail',
  'Please', 'Power', 'Rapid', 'Safety', 'So', 'Thank', 'The', 'There', 'This',
  'We', 'Work', 'Y', 'Your',
]);

/** Le texte de synthèse débarrassé de ses annotations de prononciation. */
function unmarked(tts: string): string[] {
  const plain = tts.replace(/\[[^\]]*\]\(\/[^/]*\/\)/g, ' ');
  return (plain.match(/[A-Za-z]+/g) ?? []).filter((w) => /^[A-Z]/.test(w));
}

function asciiWords(name: string): string[] {
  return name.normalize('NFD').replace(/\p{M}+/gu, '').split(/\s+/).filter(Boolean);
}

test('aucun nom japonais ne part en anglais dans les annonces gravées', () => {
  const strays = new Set<string>();
  for (const item of ITEMS) {
    if (item.lang !== 'en-US') continue;
    for (const word of unmarked(item.tts)) {
      if (!ENGLISH_WORDS.has(word)) strays.add(word);
    }
  }
  assert.deepEqual(
    [...strays].sort(),
    [],
    'mots sans prononciation : soit un nom japonais à ajouter à scripts/en-readings.ts, ' +
      'soit un mot anglais à déclarer ici',
  );
});

test('chaque gare et chaque ligne annoncée a sa lecture', () => {
  const names = [
    ...STATIONS.map((s) => s.romaji),
    ...Object.values(LINES).map((l) => l.romaji),
  ];
  const missing = names
    .flatMap(asciiWords)
    .filter((w) => !ENGLISH_WORDS.has(w) && !hasReading(w));
  assert.deepEqual([...new Set(missing)].sort(), []);
});

test('les mores gardent leur timbre, et l’accent tombe où on l’a mis', () => {
  // Les deux noms que l'anglais déformait le plus : le « u » initial de 上野
  // devenu /juː/, et les voyelles de 池袋 réduites en schwa.
  assert.equal(moraPhonemes('u-E-no'), 'ˌuˈɛnO');
  assert.equal(moraPhonemes('i-ke-BU-ku-ro'), 'ˌikɛbˈukuɾO');
  // 山手 : « YAM-uh-note » avant, quatre mores pleines maintenant.
  assert.equal(moraPhonemes('ya-ma-NO-te'), 'jɑmɑnˈOtɛ');
  // 「っ」 tient la consonne, ん se ferme sur la more, きょ reste une more.
  assert.equal(moraPhonemes('nip-PO-ri'), 'nippˈOɾi');
  assert.equal(moraPhonemes('shim-BA-shi'), 'ʃimbˈɑʃi');
  assert.equal(moraPhonemes('TO-kyo'), 'tˈOkjO');
  // 「かい」 et 「けい」 : les deux suites que l'anglais dit d'un seul souffle.
  assert.equal(moraPhonemes('to-KAI-do'), 'tOkˈIdO');
  assert.equal(moraPhonemes('KEI-hin'), 'kˈAhin');
});

test('une more inconnue casse la gravure au lieu de se taire', () => {
  assert.throws(() => moraPhonemes('ta-XX-ta'), /More illisible/);
});

test('une voyelle initiale ne se fait pas avaler', () => {
  // Le cas d'école : 上野, dont le う disparaissait derrière le え accentué.
  // L'accent secondaire lui rend son attaque, la more accentuée reste la même.
  assert.equal(moraPhonemes('u-E-no'), 'ˌuˈɛnO');
  // Une more initiale à consonne n'en a pas besoin : rien ne s'ajoute.
  assert.equal(moraPhonemes('shi-BU-ya'), 'ʃibˈujɑ');
  // Ni une more initiale qui porte déjà l'accent.
  assert.equal(moraPhonemes('O-ku-bo'), 'ˈOkubO');
});

test('un nom composé reste deux mots, un mot anglais n’est pas touché', () => {
  assert.equal(markJapanesePronunciation('Shin-Okubo'), '[Shin-Okubo](/ʃin ˈOkubO/)');
  assert.equal(markJapanesePronunciation('The doors'), 'The doors');
  // Le texte hors nom propre traverse intact : c'est le G2P anglais qui doit
  // continuer de le lire, ponctuation et pauses comprises.
  assert.equal(
    markJapanesePronunciation('The next station is. Ueno.'),
    'The next station is. [Ueno](/ˌuˈɛnO/).',
  );
});
