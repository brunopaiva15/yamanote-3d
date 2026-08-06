// Le palier audio et sa surveillance (src/systems/audioLoad.ts).
//
// Deux décisions vivent là, et elles n'ont pas la même nature.
//
// La première est un PARI, pris avant d'avoir joué une note : quelle taille de
// tampon demander au navigateur ? On ne peut pas la reprendre ensuite - elle se
// fige à la création du contexte -, donc on la prend au vu de ce que la machine
// annonce, et prudemment.
//
// La seconde est une MESURE, prise en cours de route : le fil audio rate-t-il
// ses échéances ? Là, il n'y a plus à parier, il y a à réagir - vite, mais sans
// s'affoler pour un à-coup isolé qu'un chargement de texture explique très bien.
// C'est cet équilibre que ce fichier tient : descendre dès que ça craque
// vraiment, ne pas descendre pour une hoquet unique au démarrage.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUDIO_TIERS,
  contextSettings,
  deviceTier,
  frameLoadSample,
  LoadWatch,
  lowerTier,
  panningModelFor,
  reverbEnabled,
  safestTier,
  sfxPerSecond,
  clipCacheBytes,
} from '../src/systems/audioLoad.ts';

// --- Le pari d'ouverture ---------------------------------------------------

test('la machine modeste ouvre déjà allégée', () => {
  // Le portable de bureau ordinaire : c'est LUI qui grésille, et il ne doit pas
  // avoir à le prouver pour être ménagé.
  assert.equal(deviceTier({ cores: 4, memory: 4, mobile: false }), 'reduced');
  assert.equal(deviceTier({ cores: 2, memory: 4, mobile: false }), 'minimal');
  assert.equal(deviceTier({ cores: 8, memory: 2, mobile: false }), 'minimal');
});

test('la machine confortable garde tout', () => {
  assert.equal(deviceTier({ cores: 8, memory: 16, mobile: false }), 'full');
  assert.equal(deviceTier({ cores: 12, memory: 32, mobile: false }), 'full');
});

test('un navigateur muet ne fait pas descendre : on ne punit pas l’absence d’aveu', () => {
  // Safari ne dit ni ses cœurs ni sa mémoire. Descendre par défaut priverait de
  // spatialisation toutes les machines d'une marque entière.
  assert.equal(deviceTier({ cores: 0, memory: 0, mobile: false }), 'full');
});

test('un téléphone ouvre au palier intermédiaire', () => {
  assert.equal(deviceTier({ cores: 8, memory: 8, mobile: true }), 'reduced');
});

test('l’ordre des paliers est celui d’une descente', () => {
  assert.deepEqual([...AUDIO_TIERS], ['full', 'reduced', 'minimal']);
  assert.equal(lowerTier('full'), 'reduced');
  assert.equal(lowerTier('reduced'), 'minimal');
  assert.equal(lowerTier('minimal'), 'minimal', 'le dernier cran est un plancher');
  assert.equal(safestTier('full', 'minimal'), 'minimal');
  assert.equal(safestTier('reduced', 'full'), 'reduced');
});

// --- Ce que chaque palier change ------------------------------------------

test('descendre ne fait jamais qu’élargir la marge', () => {
  const full = contextSettings('full');
  const reduced = contextSettings('reduced');
  const minimal = contextSettings('minimal');
  // L'anticipation de programmation doit couvrir une image de plus en plus
  // longue : c'est elle qui empêche un son d'arriver en retard quand le fil
  // principal traîne.
  assert.ok(reduced.lookAhead > full.lookAhead);
  assert.ok(minimal.lookAhead > reduced.lookAhead);
  // Et l'horloge interne de Tone se réveille de moins en moins souvent.
  assert.ok(reduced.updateInterval > full.updateInterval);
  assert.ok(minimal.updateInterval > reduced.updateInterval);
  // Le tampon de sortie : petit quand la machine tient, large sinon.
  assert.equal(full.latencyHint, 'interactive');
  assert.equal(reduced.latencyHint, 'playback');
  assert.equal(minimal.latencyHint, 'playback');
});

test('la spatialisation ne tombe qu’au premier cran, la réverbération au dernier', () => {
  // La DIRECTION d'un son est ce qui fait ce jeu : elle survit à tous les
  // paliers. Ce qu'on retire d'abord, c'est la coloration d'oreille ; en
  // dernier seulement, la pièce.
  assert.equal(panningModelFor('full'), 'HRTF');
  assert.equal(panningModelFor('reduced'), 'equalpower');
  assert.equal(panningModelFor('minimal'), 'equalpower');
  assert.equal(reverbEnabled('full'), true);
  assert.equal(reverbEnabled('reduced'), true);
  assert.equal(reverbEnabled('minimal'), false);
});

test('le plafond de bruitages et la mémoire des clips suivent la descente', () => {
  assert.equal(sfxPerSecond('full'), Number.POSITIVE_INFINITY);
  assert.ok(sfxPerSecond('reduced') > sfxPerSecond('minimal'));
  assert.ok(sfxPerSecond('minimal') >= 5, 'un quai bondé doit rester habité');
  assert.ok(clipCacheBytes('full') > clipCacheBytes('reduced'));
  assert.ok(clipCacheBytes('reduced') > clipCacheBytes('minimal'));
});

// --- La mesure -------------------------------------------------------------

const CALM = { underrunRatio: 0, averageLoad: 0.2, peakLoad: 0.35 };

test('une machine tranquille ne descend jamais', () => {
  const watch = new LoadWatch();
  for (let t = 0; t < 600; t++) {
    assert.equal(watch.push(t, CALM), false);
  }
});

test('un hoquet isolé ne suffit pas', () => {
  // Une texture qui monte au GPU, un onglet voisin, la compilation d'un
  // nuanceur : cela rate un tampon une fois et ne se reproduit pas. Descendre
  // pour cela retirerait la spatialisation à des machines qui la tiennent.
  const watch = new LoadWatch();
  assert.equal(watch.push(1, { underrunRatio: 0.03, averageLoad: 0.3, peakLoad: 0.5 }), false);
  for (let t = 2; t < 40; t++) assert.equal(watch.push(t, CALM), false);
});

test('deux tampons ratés dans la même minute font descendre', () => {
  const watch = new LoadWatch();
  assert.equal(watch.push(1, { underrunRatio: 0.03, averageLoad: 0.3, peakLoad: 0.5 }), false);
  assert.equal(watch.push(4, { underrunRatio: 0.03, averageLoad: 0.3, peakLoad: 0.5 }), true);
});

test('un tampon franchement raté ne demande pas de confirmation', () => {
  // À ce niveau-là, ce n'est plus un soupçon : le joueur l'a entendu.
  const watch = new LoadWatch();
  assert.equal(watch.push(1, { underrunRatio: 0.4, averageLoad: 0.5, peakLoad: 0.9 }), true);
});

test('une charge soutenue fait descendre avant que ça ne craque', () => {
  const watch = new LoadWatch();
  const hot = { underrunRatio: 0, averageLoad: 0.75, peakLoad: 0.8 };
  assert.equal(watch.push(1, hot), false);
  assert.equal(watch.push(2, hot), false);
  assert.equal(watch.push(3, hot), true, 'trois relevés chauds d’affilée suffisent');
});

test('une charge chaude entrecoupée de calme ne compte pas', () => {
  const watch = new LoadWatch();
  const hot = { underrunRatio: 0, averageLoad: 0.75, peakLoad: 0.8 };
  for (let t = 0; t < 30; t += 3) {
    assert.equal(watch.push(t, hot), false);
    assert.equal(watch.push(t + 1, CALM), false);
    assert.equal(watch.push(t + 2, hot), false);
  }
});

test('on ne descend pas deux fois de suite sans laisser agir la première', () => {
  const watch = new LoadWatch();
  const bad = { underrunRatio: 0.4, averageLoad: 0.9, peakLoad: 1 };
  assert.equal(watch.push(10, bad), true);
  // Le palier vient de changer ; le graphe met un instant à s'alléger, et les
  // relevés de cet instant-là décrivent encore l'ancien.
  assert.equal(watch.push(11, bad), false);
  assert.equal(watch.push(14, bad), false);
  assert.equal(watch.push(19, bad), true, 'passé le délai, la descente reprend');
});

test('la cadence d’images sert de mesure là où le fil audio ne se mesure pas', () => {
  const watch = new LoadWatch();
  // Une machine à trente images par seconde n'a aucun problème.
  for (let t = 0; t < 20; t++) assert.equal(watch.push(t, frameLoadSample(0)), false);
  // Une machine où la moitié des images dépassent le seuil, elle, en a un.
  assert.equal(watch.push(21, frameLoadSample(0.8)), false);
  assert.equal(watch.push(22, frameLoadSample(0.8)), false);
  assert.equal(watch.push(23, frameLoadSample(0.8)), true);
});
