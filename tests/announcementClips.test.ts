// Couverture des clips d'annonce.
//
// Le jeu compte cinq sources gravées avec Kokoro et AUCUNE sixième : dès qu'un texte
// joué n'a pas son MP3, systems/speech.ts ne dit RIEN - il n'existe aucun repli
// speechSynthesis, et une annonce muette passe inaperçue à la relecture d'un
// diff. Il suffit de retoucher un mot d'annonce pour changer sa clé et perdre
// son clip, en silence.
//
// Depuis que le quai a deux automates (une femme sur le 内回り, un homme sur le
// 外回り), la clé porte aussi le RÔLE VOCAL : deux annonces identiques au mot près
// ont deux fichiers. C'est ce que vérifie « chaque annonce de quai a un clip par
// rôle » - sans quoi un quai sur deux parlerait avec la voix de l'autre sens, ce
// que rien dans le code ne signalerait.
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
import { clipKey } from '../src/data/clipKey.ts';
import {
  PLATFORM_AGENT_MESSAGES,
  platformApproachAnnouncement,
  platformArrivalAnnouncement,
  platformPreAnnouncement,
  platformTrainEnteringAnnouncement,
  type StationUtterance,
} from '../src/data/stationAnnouncements.ts';
import {
  platformNoticesForStation,
  STATION_ANNOUNCEMENT_RULES,
  PLATFORM_NOTICE_PHASES,
} from '../src/data/stationAnnouncementRules.ts';
import {
  approachSequence,
  passengerAssistanceInitialAnnouncement,
  passengerAssistanceResumeAnnouncement,
  passengerAssistanceWaitAnnouncement,
} from '../src/data/announcements.ts';
import { STATIONS } from '../src/data/stations.ts';
import { platformFor, type LoopDirection } from '../src/data/platforms.ts';

const CLIP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'announcements');

const DIRECTIONS: LoopDirection[] = ['inner', 'outer'];

test('chaque annonce jouée a son clip au manifeste', () => {
  const missing = ITEMS.filter((i) => !(i.key in PA_CLIPS));
  assert.deepEqual(
    missing.map((i) => `${i.voice} : ${i.text}`),
    [],
    'annonces sans clip - elles ne se diraient pas du tout ; ' +
      'regraver avec scripts/announcements-gen.py',
  );
});

test('les six annonces de prise en charge entrent dans la gravure', () => {
  const assistance = [
    ...passengerAssistanceInitialAnnouncement(),
    ...passengerAssistanceWaitAnnouncement(),
    ...passengerAssistanceResumeAnnouncement(),
  ];
  assert.equal(assistance.length, 6);
  for (const utterance of assistance) {
    const item = ITEMS.find((candidate) =>
      candidate.lang === utterance.lang && candidate.text === utterance.text,
    );
    assert.ok(item, `${utterance.lang} non exporte : ${utterance.text}`);
    assert.equal(item.role, undefined, 'une annonce de rame ne porte pas de role de quai');
    assert.equal(item.voice, utterance.lang === 'ja-JP' ? 'jf_alpha' : 'af_heart');
  }
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

// --- Le rôle vocal fait partie de la clé ---------------------------------

/** Le clip existe-t-il pour ce texte DANS CETTE VOIX ? */
function graved(u: StationUtterance): boolean {
  return clipKey(u.lang, u.text, u.voice) in PA_CLIPS;
}

test('les deux automates du quai ont chacun leurs clips', () => {
  // Toute la vie d'une rame vue du quai, dans les deux sens : l'anticipée, le
  // carillon d'approche, l'entrée en gare, l'arrivée. Une variante manquante
  // laisserait ce quai-là muet à ce moment-là.
  for (const direction of DIRECTIONS) {
    for (let i = 0; i < STATIONS.length; i++) {
      const platform = platformFor(STATIONS[i].jy, direction)?.platform ?? 1;
      const items = [
        ...platformPreAnnouncement(i, platform, direction),
        ...platformApproachAnnouncement(i, platform, direction),
        ...platformArrivalAnnouncement(i, direction),
        ...platformTrainEnteringAnnouncement(direction),
      ];
      for (const u of items) {
        assert.ok(graved(u), `${direction} / ${u.voice} : « ${u.text} » sans clip`);
      }
    }
  }
});

test('un texte partagé par les deux sens a bien deux fichiers distincts', () => {
  // L'annonce d'arrivée est le cas limite : mot pour mot la même dans les deux
  // sens, et pourtant dite par deux bouches.
  for (let i = 0; i < STATIONS.length; i++) {
    const inner = platformArrivalAnnouncement(i, 'inner')[0];
    const outer = platformArrivalAnnouncement(i, 'outer')[0];
    assert.equal(inner.text, outer.text);
    const a = clipKey(inner.lang, inner.text, inner.voice);
    const b = clipKey(outer.lang, outer.text, outer.voice);
    assert.notEqual(a, b, `même clé pour les deux sens à ${STATIONS[i].jy}`);
    assert.ok(a in PA_CLIPS && b in PA_CLIPS, `${STATIONS[i].jy} : une des deux variantes manque`);
  }
});

test('chaque rôle vocal est gravé avec la bonne voix Kokoro, et une seule', () => {
  const byRole = new Map<string, Set<string>>();
  for (const item of ITEMS) {
    if (!item.role) continue;
    if (!byRole.has(item.role)) byRole.set(item.role, new Set());
    byRole.get(item.role)!.add(item.voice);
  }
  assert.deepEqual([...byRole.keys()].sort(), ['agent', 'atos-en', 'atos-inner', 'atos-outer']);
  for (const [role, voices] of byRole) {
    assert.equal(voices.size, 1, `${role} gravé avec ${[...voices].join(', ')}`);
  }
  // Les deux automates ne partagent pas de voix, et aucun ne prend celle de
  // l'agent ni celle de la rame.
  const voiceOf = (role: string) => [...byRole.get(role)!][0];
  const distinct = new Set([voiceOf('atos-inner'), voiceOf('atos-outer'), voiceOf('agent')]);
  assert.equal(distinct.size, 3);
  const cabinVoices = new Set(ITEMS.filter((i) => !i.role).map((i) => i.voice));
  assert.ok(!cabinVoices.has(voiceOf('atos-inner')), 'l’automate 内回り parle comme la rame');
  assert.ok(!cabinVoices.has(voiceOf('agent')), 'l’agent parle comme la rame');
});

// --- Les consignes propres à une gare ------------------------------------

test('chaque consigne de gare a ses clips, quai et rame', () => {
  const jys = Object.keys(STATION_ANNOUNCEMENT_RULES);
  assert.ok(jys.length > 0, 'aucune règle : le test ne vérifierait rien');
  for (const jy of jys) {
    const index = STATIONS.findIndex((s) => s.jy === jy);
    assert.ok(index >= 0, `règle pour une gare inconnue : ${jy}`);
    for (const direction of DIRECTIONS) {
      for (const phase of PLATFORM_NOTICE_PHASES) {
        for (const u of platformNoticesForStation(jy, direction, phase)) {
          assert.ok(graved(u), `${jy} / ${phase} / ${u.voice} : « ${u.text} » sans clip`);
        }
      }
      // Côté rame, la consigne entre dans la séquence d'approche : elle doit y
      // être gravée avec la voix de bord (pas de rôle).
      for (const u of approachSequence(index, 1, direction)) {
        assert.ok(
          clipKey(u.lang, u.text) in PA_CLIPS,
          `${jy} (${direction}) : « ${u.text} » sans clip de bord`,
        );
      }
    }
  }
});

test('la rame et le quai ne partagent aucun clip', () => {
  // Les deux files de systems/speech sont indépendantes, et cela commence par
  // les fichiers : aucun clip ne peut être réclamé par les deux canaux, sinon un
  // texte joué à bord sortirait avec une voix de quai (ou l'inverse) selon
  // l'ordre de gravure. Depuis que le rôle vocal entre dans la clé, c'est
  // structurellement impossible - ce test le fige.
  const cabin = new Set(ITEMS.filter((i) => !i.role).map((i) => i.key));
  const platform = new Set(ITEMS.filter((i) => i.role).map((i) => i.key));
  const shared = [...cabin].filter((k) => platform.has(k));
  assert.deepEqual(shared, []);
  assert.equal(cabin.size + platform.size, ITEMS.length);
  // Et les deux canaux disent bien chacun leur part : aucun n'est vide.
  assert.ok(cabin.size > 0 && platform.size > 0);
});

test('les messages d’agent restructurés sont tous gravés', () => {
  for (const m of PLATFORM_AGENT_MESSAGES) {
    assert.ok(
      clipKey('ja-JP', m.text, 'agent') in PA_CLIPS,
      `« ${m.text} » (${m.category}) sans clip`,
    );
  }
});
