// Le choix de version (src/systems/gameMode.ts).
//
// Trois sources possibles, et leur ORDRE est ce qui compte : l'URL, puis le
// choix mémorisé, puis le défaut. Une URL `?mode=audio` doit ouvrir la version
// sonore même sur une machine où le joueur avait choisi l'autre la veille -
// c'est ce qui rend le lien partageable, et c'est aussi ce dont un moteur
// d'indexation a besoin pour ne pas ranger les deux versions sous la même page.
//
// Le module ne dépend d'aucun magasin d'état : il se teste en posant
// `localStorage` et `location` à la main.

import test from 'node:test';
import assert from 'node:assert/strict';

/** Un `localStorage` de poche, suffisant pour ce que le module en fait. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

function setLocation(href: string): void {
  (globalThis as { location?: unknown }).location = { href } as Location;
}

const g = globalThis as { localStorage?: Storage; location?: unknown };
g.localStorage = fakeStorage();
setLocation('https://exemple.test/');

const { initialMode, modeFromUrl, storeMode, GAME_MODES, MODE_PARAM } = await import(
  '../src/systems/gameMode.ts'
);

test('les deux versions, et rien d’autre', () => {
  assert.deepEqual([...GAME_MODES], ['full', 'audio']);
  assert.equal(MODE_PARAM, 'mode');
});

test('sans rien, on ouvre l’expérience complète', () => {
  localStorage.clear();
  setLocation('https://exemple.test/');
  assert.equal(initialMode(), 'full');
});

test('l’URL passe avant le choix mémorisé', () => {
  localStorage.clear();
  storeMode('full');
  setLocation('https://exemple.test/?mode=audio');
  assert.equal(modeFromUrl(), 'audio');
  assert.equal(initialMode(), 'audio');
});

test('le choix mémorisé sert quand l’URL ne dit rien', () => {
  localStorage.clear();
  storeMode('audio');
  setLocation('https://exemple.test/');
  assert.equal(modeFromUrl(), null);
  assert.equal(initialMode(), 'audio');
});

test('une valeur inconnue est ignorée, pas devinée', () => {
  localStorage.clear();
  setLocation('https://exemple.test/?mode=radio');
  assert.equal(modeFromUrl(), null);
  assert.equal(initialMode(), 'full');
  // Et une préférence corrompue ne fait pas ouvrir une version qui n'existe pas.
  localStorage.setItem('yamanote.mode', 'holodeck');
  assert.equal(initialMode(), 'full');
});

test('un localStorage refusé ne casse rien', () => {
  const denied = {
    getItem() {
      throw new Error('mode privé');
    },
    setItem() {
      throw new Error('mode privé');
    },
  } as unknown as Storage;
  g.localStorage = denied;
  setLocation('https://exemple.test/');
  assert.equal(initialMode(), 'full');
  assert.doesNotThrow(() => storeMode('audio'));
  g.localStorage = fakeStorage();
});
