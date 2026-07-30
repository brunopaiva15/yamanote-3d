import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approachAnnouncement,
  nextStationAnnouncement,
} from '../src/data/announcements.ts';
import { STATIONS } from '../src/data/stations.ts';

const EXAMPLES = ['JY01', 'JY17', 'JY20', 'JY26'] as const;

function englishText(items: ReturnType<typeof nextStationAnnouncement>): string {
  return items.find((item) => item.lang === 'en-US')?.text ?? '';
}

test("le code JY n'est dit que dans l'identification principale après le départ", () => {
  for (const code of EXAMPLES) {
    const index = STATIONS.findIndex((station) => station.jy === code);
    assert.ok(index >= 0, `gare absente : ${code}`);

    const departure = englishText(nextStationAnnouncement(index, 1));
    const approach = englishText(approachAnnouncement(index, 1));
    const spokenCode = `${code.slice(0, 2)}. ${code.slice(2)}`;

    assert.match(departure, new RegExp(`\\b${spokenCode.replace('.', '\\.')}\\b`));
    assert.doesNotMatch(approach, /\bJY\b/);
    assert.match(approach, new RegExp(`\\b${STATIONS[index].romaji}\\b`));
  }
});
