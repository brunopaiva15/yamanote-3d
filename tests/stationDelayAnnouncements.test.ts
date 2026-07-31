import test from 'node:test';
import assert from 'node:assert/strict';
import { platformDisruptionAnnouncement, platformDisruptionResumeAnnouncement } from '../src/data/stationAnnouncements.ts';

const base = { cause: 'person-on-track' as const, direction: 'inner' as const, voiceDirection: 'inner' as const, locationStationIndex: 19, locationNextStationIndex: null };

test('retard en gare : cause JR East, direction et lieu sont structurés', () => {
  const text = platformDisruptionAnnouncement(base, false).map((u) => u.text).join(' ');
  assert.match(text, /渋谷駅での線路に人立入/);
  assert.match(text, /内回り電車に遅れ/);
  assert.doesNotMatch(text, /線路内人立入り/);
});

test('incident entre deux gares et deux directions', () => {
  const text = platformDisruptionAnnouncement({ ...base, direction: 'both', locationNextStationIndex: 20 }, true).map((u) => u.text).join(' ');
  assert.match(text, /渋谷・恵比寿駅間/);
  assert.match(text, /内・外回り/);
  assert.match(text, /運転を見合わせ/);
});

test('estimation et reprise effective sont annoncées', () => {
  const estimate = platformDisruptionAnnouncement({ ...base, estimatedResumeClockMin: 12 * 60 + 40 }, true).map((u) => u.text).join(' ');
  assert.match(estimate, /12時40分頃/);
  const resumed = platformDisruptionResumeAnnouncement({ ...base, resumedAtClockMin: 12 * 60 + 45 }).map((u) => u.text).join(' ');
  assert.match(resumed, /12時45分頃に運転を再開/);
});
