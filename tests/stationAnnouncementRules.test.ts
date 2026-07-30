// Les consignes propres à une gare (data/stationAnnouncementRules).
//
// Ce qui doit rester vrai de ces règles : elles sont RARES (une gare sans entrée
// ne dit rien de plus), elles respectent le sens, elles sortent en japonais puis
// en anglais, elles s'insèrent à l'endroit que leurs données demandent — et
// jamais deux fois dans la même séquence.
//
// Le filtrage se teste sur une table injectée : le jeu n'a pour l'instant qu'une
// règle vérifiée (Shibuya, dans les deux sens), et fabriquer une gare de plus
// pour le seul confort d'un test reviendrait à inventer une annonce.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  STATION_ANNOUNCEMENT_RULES,
  cabinNoticesForStation,
  platformNoticesForStation,
} = await import('../src/data/stationAnnouncementRules.ts');
const { approachSequence, departureSequence } = await import('../src/data/announcements.ts');
const { STATIONS } = await import('../src/data/stations.ts');

/** Shibuya = JY20, index 19. */
const SHIBUYA = 19;
const SHIBUYA_JY = 'JY20';
const GAP_FRAGMENT = '足元にご注意ください';
const GAP_EN = 'Please watch your step when you leave the train.';

test('Shibuya porte bien son avertissement de prudence', () => {
  const cabin = cabinNoticesForStation(SHIBUYA_JY, 'inner', 'during-approach');
  assert.equal(cabin.length, 2);
  assert.ok(cabin[0].text.includes(GAP_FRAGMENT), cabin[0].text);
  assert.equal(cabin[1].text, GAP_EN);

  const platform = platformNoticesForStation(SHIBUYA_JY, 'inner', 'arrival');
  assert.equal(platform.length, 2);
  assert.ok(platform[0].text.includes(GAP_FRAGMENT), platform[0].text);
  assert.equal(platform[1].text, GAP_EN);
});

test('la consigne du quai parle avec l’automate du sens desservi', () => {
  assert.deepEqual(
    platformNoticesForStation(SHIBUYA_JY, 'inner', 'arrival').map((u) => u.voice),
    ['atos-inner', 'atos-en'],
  );
  assert.deepEqual(
    platformNoticesForStation(SHIBUYA_JY, 'outer', 'arrival').map((u) => u.voice),
    ['atos-outer', 'atos-en'],
  );
});

test('la version de la rame suit la ponctuation de bord, celle du quai la sienne', () => {
  // La sono de la rame ne respire qu'aux points (voir data/announcements) ; le
  // quai garde ses 、. Les deux disent la même phrase, pas de la même façon.
  const cabin = cabinNoticesForStation(SHIBUYA_JY, 'inner', 'during-approach')[0].text;
  const platform = platformNoticesForStation(SHIBUYA_JY, 'inner', 'arrival')[0].text;
  assert.ok(!cabin.includes('、'), cabin);
  assert.ok(platform.includes('、'), platform);
  assert.equal(cabin.replace(/。/g, ''), platform.replace(/[、。]/g, ''));
});

test('une gare sans règle ne dit rien de plus', () => {
  for (const st of STATIONS) {
    if (STATION_ANNOUNCEMENT_RULES[st.jy]) continue;
    for (const dir of ['inner', 'outer'] as const) {
      assert.deepEqual(cabinNoticesForStation(st.jy, dir, 'during-approach'), []);
      assert.deepEqual(cabinNoticesForStation(st.jy, dir, 'after-next-station'), []);
      assert.deepEqual(cabinNoticesForStation(st.jy, dir, 'after-transfers'), []);
      assert.deepEqual(platformNoticesForStation(st.jy, dir, 'approach'), []);
      assert.deepEqual(platformNoticesForStation(st.jy, dir, 'arrival'), []);
      assert.deepEqual(platformNoticesForStation(st.jy, dir, 'pre-approach'), []);
    }
  }
  // Et une gare qui n'existe pas non plus, sans lever d'erreur.
  assert.deepEqual(cabinNoticesForStation('JY99', 'inner', 'during-approach'), []);
  assert.deepEqual(platformNoticesForStation('JY99', 'inner', 'arrival'), []);
});

test('une consigne demandée à un seul moment ne sort pas aux autres', () => {
  assert.deepEqual(cabinNoticesForStation(SHIBUYA_JY, 'inner', 'after-next-station'), []);
  assert.deepEqual(cabinNoticesForStation(SHIBUYA_JY, 'inner', 'after-transfers'), []);
  assert.deepEqual(platformNoticesForStation(SHIBUYA_JY, 'inner', 'pre-approach'), []);
  assert.deepEqual(platformNoticesForStation(SHIBUYA_JY, 'inner', 'approach'), []);
});

test('une règle limitée à un sens ne se dit pas dans l’autre', () => {
  const rules = {
    JY01: {
      cabin: [{ jp: '内回りだけの案内です。', position: 'during-approach' as const, directions: ['inner' as const] }],
      platform: [
        { jp: '外回りだけの案内です。', phase: 'arrival' as const, directions: ['outer' as const] },
      ],
    },
  };
  assert.equal(cabinNoticesForStation('JY01', 'inner', 'during-approach', rules).length, 1);
  assert.deepEqual(cabinNoticesForStation('JY01', 'outer', 'during-approach', rules), []);
  assert.equal(platformNoticesForStation('JY01', 'outer', 'arrival', rules).length, 1);
  assert.deepEqual(platformNoticesForStation('JY01', 'inner', 'arrival', rules), []);
});

test('l’ordre des données est conservé, et le japonais passe avant l’anglais', () => {
  const rules = {
    JY01: {
      cabin: [
        { jp: '一つ目。', en: 'First.', position: 'after-transfers' as const },
        { jp: '二つ目。', en: 'Second.', position: 'after-transfers' as const },
      ],
    },
  };
  assert.deepEqual(
    cabinNoticesForStation('JY01', 'inner', 'after-transfers', rules).map((u) => [u.lang, u.text]),
    [
      ['ja-JP', '一つ目。'],
      ['en-US', 'First.'],
      ['ja-JP', '二つ目。'],
      ['en-US', 'Second.'],
    ],
  );
});

test('la consigne de la rame s’insère à la fin de la séquence d’approche', () => {
  const seq = approachSequence(SHIBUYA, 1, 'inner');
  const notice = cabinNoticesForStation(SHIBUYA_JY, 'inner', 'during-approach');
  assert.deepEqual(
    seq.slice(-2).map((u) => u.text),
    notice.map((u) => u.text),
  );
  // Derrière l'annonce d'approche ET derrière les correspondances : elle parle
  // du pas qu'on va faire, pas de la gare qu'on approche.
  const jp = seq.findIndex((u) => u.text.startsWith('まもなく'));
  const transfers = seq.findIndex((u) => u.text.includes('お乗換'));
  assert.ok(jp >= 0);
  assert.ok(transfers >= 0 && transfers < seq.length - 2);
});

test('aucune consigne n’est jouée deux fois dans la même approche', () => {
  for (const dir of ['inner', 'outer'] as const) {
    const seq = approachSequence(SHIBUYA, 1, dir);
    const gap = seq.filter((u) => u.text.includes(GAP_FRAGMENT) || u.text === GAP_EN);
    assert.equal(gap.length, 2, `japonais + anglais, une seule fois (${dir})`);
    // Et la séquence de départ vers Shibuya ne la reprend pas : la règle ne
    // demande que l'approche.
    const dep = departureSequence(SHIBUYA, 1, dir);
    assert.equal(dep.filter((u) => u.text.includes(GAP_FRAGMENT)).length, 0);
  }
});

test('aucune séquence de gare ne contient deux fois le même texte', () => {
  for (let i = 0; i < STATIONS.length; i++) {
    for (const dir of ['inner', 'outer'] as const) {
      for (const seq of [approachSequence(i, 1, dir), departureSequence(i, 1, dir)]) {
        const texts = seq.map((u) => u.text);
        assert.equal(new Set(texts).size, texts.length, `doublon à ${STATIONS[i].jy} (${dir})`);
      }
    }
  }
});
