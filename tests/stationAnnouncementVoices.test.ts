// Qui parle sur le quai, et dans quel sens.
//
// Deux automates se répondent sur un îlot central : le 内回り est une femme, le
// 外回り un homme. C'est la seule chose qui dise, sans lever les yeux, lequel des
// deux quais vient d'annoncer - donc de quel côté se tourner. Une annonce qui
// retomberait sur la voix de l'autre sens ne se verrait nulle part dans le code
// et s'entendrait immédiatement en jeu, d'où ce test.
//
// Deux voix ne bougent pas avec le sens, et c'est aussi vérifié ici : l'agent de
// quai est une PERSONNE (une seule bouche, quel que soit le quai), et la version
// anglaise ne double pas les repères sonores du japonais.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  atosVoiceForDirection,
  platformAgentMessage,
  platformAlightFirstAnnouncement,
  platformApproachAnnouncement,
  platformArrivalAnnouncement,
  platformDelayAnnouncement,
  platformDoorCheckAnnouncement,
  platformDoorReleaseAnnouncement,
  platformDoorsClosingAnnouncement,
  platformGreeting,
  platformPassAnnouncement,
  platformPassWarning,
  platformPreAnnouncement,
  platformTrainEnteringAnnouncement,
  PLATFORM_AGENT_MESSAGES,
  PLATFORM_DELAY_CAUSES,
  PLATFORM_DOOR_RELEASE,
} = await import('../src/data/stationAnnouncements.ts');

const SHIBUYA = 19;

const ja = (items) => items.filter((u) => u.lang === 'ja-JP');
const en = (items) => items.filter((u) => u.lang === 'en-US');

test('la fonction centrale associe un automate à chaque sens', () => {
  assert.equal(atosVoiceForDirection('inner'), 'atos-inner');
  assert.equal(atosVoiceForDirection('outer'), 'atos-outer');
});

test('la préannonce prend la voix du sens annoncé', () => {
  assert.deepEqual(
    ja(platformPreAnnouncement(SHIBUYA, 1, 'inner')).map((u) => u.voice),
    ['atos-inner'],
  );
  assert.deepEqual(
    ja(platformPreAnnouncement(SHIBUYA, 2, 'outer')).map((u) => u.voice),
    ['atos-outer'],
  );
});

test('l’annonce d’approche prend la voix du sens annoncé', () => {
  assert.deepEqual(
    ja(platformApproachAnnouncement(SHIBUYA, 1, 'inner')).map((u) => u.voice),
    ['atos-inner'],
  );
  assert.deepEqual(
    ja(platformApproachAnnouncement(SHIBUYA, 2, 'outer')).map((u) => u.voice),
    ['atos-outer'],
  );
});

test('toutes les annonces automatiques liées à une rame suivent le sens', () => {
  // Chaque étape de la vie d'une rame vue du quai : ce qu'on annonce avant
  // qu'elle arrive, quand elle entre, quand elle est là, quand elle repart.
  for (const [dir, want] of [
    ['inner', 'atos-inner'],
    ['outer', 'atos-outer'],
  ]) {
    const automatic = [
      ...platformGreeting(dir),
      ...platformPreAnnouncement(SHIBUYA, 1, dir),
      ...platformApproachAnnouncement(SHIBUYA, 1, dir),
      ...platformTrainEnteringAnnouncement(dir),
      ...platformArrivalAnnouncement(SHIBUYA, dir),
      ...platformDoorsClosingAnnouncement(1, dir),
      ...platformPassAnnouncement(4, dir),
      ...platformPassWarning(dir),
      ...platformDelayAnnouncement(0, dir),
    ];
    for (const u of ja(automatic)) {
      assert.equal(u.voice, want, `« ${u.text} » en ${dir}`);
    }
  }
});

test('le même texte dans les deux sens ne partage pas sa voix', () => {
  // L'arrivée est le cas critique : 「渋谷、渋谷。ご乗車、ありがとうございます。」
  // est identique au mot près dans les deux sens. Sans rôle distinct, un des
  // deux quais parlerait avec la voix de l'autre.
  const inner = platformArrivalAnnouncement(SHIBUYA, 'inner')[0];
  const outer = platformArrivalAnnouncement(SHIBUYA, 'outer')[0];
  assert.equal(inner.text, outer.text);
  assert.notEqual(inner.voice, outer.voice);
});

test('l’agent de quai garde sa voix humaine, quel que soit le sens', () => {
  const agentItems = [
    ...platformAlightFirstAnnouncement(),
    ...platformDoorCheckAnnouncement(),
    ...PLATFORM_AGENT_MESSAGES.flatMap((_m, i) => platformAgentMessage(i)),
    ...PLATFORM_DOOR_RELEASE.flatMap((_m, i) => platformDoorReleaseAnnouncement(i)),
  ];
  for (const u of agentItems) assert.equal(u.voice, 'agent', u.text);
  assert.ok(agentItems.length > 0);
});

test('les annonces anglaises du quai gardent la même voix', () => {
  const english = [
    ...en(platformApproachAnnouncement(SHIBUYA, 1, 'inner')),
    ...en(platformApproachAnnouncement(SHIBUYA, 2, 'outer')),
    ...en(platformPassAnnouncement(4, 'inner')),
    ...en(platformPassAnnouncement(4, 'outer')),
  ];
  for (const u of english) assert.equal(u.voice, 'atos-en', u.text);
  assert.ok(english.length >= 4);
});

test('aucune annonce de quai ne sort sans rôle vocal', () => {
  const all = [
    ...platformGreeting('inner'),
    ...platformPreAnnouncement(0, 1, 'inner'),
    ...platformApproachAnnouncement(0, 1, 'inner'),
    ...platformTrainEnteringAnnouncement('inner'),
    ...platformArrivalAnnouncement(0, 'inner'),
    ...platformDoorsClosingAnnouncement(1, 'inner'),
    ...platformPassAnnouncement(4, 'inner'),
    ...platformPassWarning('inner'),
    ...PLATFORM_DELAY_CAUSES.flatMap((_c, i) => platformDelayAnnouncement(i, 'inner')),
    ...platformAlightFirstAnnouncement(),
    ...platformDoorCheckAnnouncement(),
  ];
  const roles = new Set(['atos-inner', 'atos-outer', 'agent', 'atos-en']);
  for (const u of all) assert.ok(roles.has(u.voice), `${u.voice} pour « ${u.text} »`);
});
