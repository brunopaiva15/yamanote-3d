// Couverture des clips d'annonce.
//
// Le jeu compte quatre locutrices Kokoro et AUCUNE cinquième : dès qu'un texte
// joué n'a pas son MP3, systems/speech.ts retombe sur speechSynthesis, qui sort
// hors du graphe Web Audio — pas de spatialisation, pas de souffle de ligne, et
// un timbre système qui n'appartient ni à la rame ni au quai. C'est audible
// immédiatement, et ça arrive en silence : il suffit de retoucher un mot d'une
// annonce pour changer sa clé et perdre son clip.
//
// Ce test est donc le filet. Il énumère exactement ce que grave le générateur
// (scripts/announcements-export.ts, mêmes appels que stationCycle et
// departureSequence) et le croise avec le manifeste et le dossier des MP3.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ITEMS } from '../scripts/announcements-export.ts';
import { PA_CLIPS } from '../src/data/pa-manifest.ts';

const CLIP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'announcements');

test('chaque annonce jouée a son clip au manifeste', () => {
  const missing = ITEMS.filter((i) => !(i.key in PA_CLIPS));
  assert.deepEqual(
    missing.map((i) => `${i.voice} : ${i.text}`),
    [],
    'annonces sans clip — elles parleraient avec la voix du navigateur ; ' +
      'regraver avec scripts/announcements-gen.py',
  );
});

test('chaque clip du manifeste a son MP3 sur le disque', () => {
  const absent = Object.keys(PA_CLIPS).filter((key) => !existsSync(join(CLIP_DIR, `${key}.mp3`)));
  assert.deepEqual(absent, [], 'entrées de manifeste sans fichier');
});

test('aucun clip orphelin : le dossier ne garde rien de muet', () => {
  const claimed = new Set(ITEMS.map((i) => i.key));
  const orphans = Object.keys(PA_CLIPS).filter((key) => !claimed.has(key));
  assert.deepEqual(orphans, [], 'clips que plus aucun texte ne réclame');
});

test('une durée plausible pour chaque clip', () => {
  // Un clip de moins d'une seconde est une synthèse qui a échoué en silence ;
  // au-delà de trente, c'est la découpe en segments qui a déraillé.
  const odd = Object.entries(PA_CLIPS).filter(([, d]) => !(d > 0.8 && d < 30));
  assert.deepEqual(odd, []);
});
