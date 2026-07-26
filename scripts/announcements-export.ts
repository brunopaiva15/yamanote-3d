// Énumère tous les textes d'annonces réellement joués (mêmes appels que
// systems/stationCycle.ts et systems/departureSequence.ts) et les écrit en
// JSON pour le générateur Kokoro (scripts/announcements-gen.py).
//
// Usage :
//   npx esbuild scripts/announcements-export.ts --bundle --format=esm \
//     --platform=node --outfile=<tmp>/announcements-export.mjs
//   node <tmp>/announcements-export.mjs <sortie.json>
//
// Chaque entrée : { key, lang, text, tts, speed }
// - key   : clipKey(lang, text), nom de fichier du MP3 et clé du manifeste ;
// - text  : texte affiché / haché, identique au runtime ;
// - tts   : texte adapté à la synthèse (macrons ASCII et « JY-xx » épelé en
//           anglais — le japonais part tel quel, le dictionnaire open_jtalk
//           connaît les gares) ;
// - speed : vitesse Kokoro (ja-JP : jf_alpha 0.90, en-US : af_heart 0.93).

import { writeFileSync } from 'node:fs';
import {
  approachSequence,
  departureSequence,
  doorsClosingAnnouncement,
  welcomeAnnouncement,
  type Utterance,
} from '../src/data/announcements';
import { DOOR_SIDE, STATIONS } from '../src/data/stations';
import { clipKey } from '../src/data/clipKey';

const SPEED: Record<Utterance['lang'], number> = {
  'ja-JP': 0.9,
  'en-US': 0.93,
};

// « Ōsaki » → « Osaki » : les macrons perturbent le G2P anglais.
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '');
}

// « JY-05 » → « J Y 5 » : épelé lettre à lettre, sans zéro de tête.
function spellStationCode(s: string): string {
  return s.replace(/\bJY-0*(\d+)/g, 'J Y $1');
}

function ttsText(u: Utterance): string {
  if (u.lang === 'en-US') return spellStationCode(stripDiacritics(u.text));
  return u.text;
}

const utterances: Utterance[] = [];
for (let i = 0; i < STATIONS.length; i++) {
  utterances.push(...departureSequence(i, DOOR_SIDE[i]));
  utterances.push(...approachSequence(i, DOOR_SIDE[i]));
}
utterances.push(...doorsClosingAnnouncement());
utterances.push(...welcomeAnnouncement());

const byKey = new Map<string, { key: string; lang: string; text: string; tts: string; speed: number }>();
for (const u of utterances) {
  const key = clipKey(u.lang, u.text);
  const existing = byKey.get(key);
  if (existing && existing.text !== u.text) {
    throw new Error(`Collision de clé ${key} : « ${existing.text} » / « ${u.text} »`);
  }
  byKey.set(key, { key, lang: u.lang, text: u.text, tts: ttsText(u), speed: SPEED[u.lang] });
}

const out = {
  items: [...byKey.values()],
  // Lectures de référence : le générateur vérifie que open_jtalk lit chaque
  // gare comme sa transcription kana et bascule sur le kana en cas d'écart.
  stations: STATIONS.map((s) => ({ kanji: s.kanji, kana: s.kana })),
};

const dest = process.argv[2] ?? 'announcements-texts.json';
writeFileSync(dest, JSON.stringify(out, null, 1));
console.log(`${out.items.length} annonces → ${dest}`);
