// Les sous-titres (src/systems/subtitles.ts).
//
// Ce qu'ils doivent garantir n'est pas le rendu - c'est la SYNCHRONISATION.
// Un sous-titre qui reste après la voix, ou qui affiche l'annonce de la rame
// sous l'étiquette du quai, ment sur ce qu'on entend ; pour qui n'entend pas,
// c'est la seule source d'information et le mensonge est total.
//
// Les deux sonorisations parlent en même temps - c'est même le cas ordinaire,
// assis porte ouverte - et leurs deux lignes doivent donc COEXISTER au lieu de
// se remplacer. C'est la propriété la plus facile à casser en simplifiant, et
// c'est celle qui est vérifiée en premier.

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  useSubtitles,
  showSpeech,
  clearSpeech,
  soundCue,
  setSubtitleClock,
  resetSubtitles,
} = await import('../src/systems/subtitles.ts');

function reset(): void {
  resetSubtitles();
  setSubtitleClock(0);
}

test('la ligne affichée est celle du clip qui joue', () => {
  reset();
  showSpeech('cabin', '次は。渋谷。', 'ja-JP');
  const line = useSubtitles.getState().cabin;
  assert.equal(line?.text, '次は。渋谷。');
  assert.equal(line?.lang, 'ja-JP');
  clearSpeech('cabin');
  assert.equal(useSubtitles.getState().cabin, null);
});

test('les deux sonorisations parlent en même temps sans se chasser', () => {
  reset();
  showSpeech('cabin', 'ドアが閉まります。', 'ja-JP');
  showSpeech('platform', '3番線、電車がまいります。', 'ja-JP');
  const s = useSubtitles.getState();
  assert.equal(s.cabin?.text, 'ドアが閉まります。');
  assert.equal(s.platform?.text, '3番線、電車がまいります。');
  // Et couper l'une n'éteint pas l'autre.
  clearSpeech('platform');
  assert.equal(useSubtitles.getState().cabin?.text, 'ドアが閉まります。');
  assert.equal(useSubtitles.getState().platform, null);
});

test('chaque ligne a son identité, pour que l’apparition reparte', () => {
  reset();
  showSpeech('cabin', 'A', 'en-US');
  const first = useSubtitles.getState().cabin?.id;
  showSpeech('cabin', 'B', 'en-US');
  const second = useSubtitles.getState().cabin?.id;
  assert.notEqual(first, second);
});

test('un son est nommé, pas transcrit', () => {
  reset();
  soundCue('melody', 'Inner Loop Lantern');
  const cue = useSubtitles.getState().cue;
  assert.equal(cue?.cue, 'melody');
  assert.equal(cue?.detail, 'Inner Loop Lantern');
  // Le libellé lisible, lui, est dans le dictionnaire de la langue : le module
  // ne pose que la nature de l'événement.
  assert.equal(typeof cue?.cue, 'string');
});

test('le journal garde l’ordre, la provenance et l’heure', () => {
  reset();
  setSubtitleClock(8 * 60 + 12);
  showSpeech('platform', '1番線、ドアが閉まります。', 'ja-JP');
  soundCue('doorChime');
  setSubtitleClock(8 * 60 + 13);
  showSpeech('cabin', 'The doors are closing.', 'en-US');

  const log = useSubtitles.getState().log;
  assert.equal(log.length, 3);
  // Le plus récent en tête : c'est celui qu'on vient de manquer.
  assert.equal(log[0].text, 'The doors are closing.');
  assert.equal(log[0].channel, 'cabin');
  assert.equal(log[0].clockMin, 8 * 60 + 13);
  // Un son n'a pas de sonorisation d'origine.
  assert.equal(log[1].channel, null);
  assert.equal(log[1].cue, 'doorChime');
  assert.equal(log[2].channel, 'platform');
  assert.equal(log[2].clockMin, 8 * 60 + 12);
});

test('le journal est borné : une heure de trajet ne le fait pas enfler', () => {
  reset();
  for (let i = 0; i < 200; i++) showSpeech('cabin', `annonce ${i}`, 'en-US');
  const log = useSubtitles.getState().log;
  assert.ok(log.length <= 40, `journal non borné : ${log.length} entrées`);
  // Et ce qui reste est bien le plus récent.
  assert.equal(log[0].text, 'annonce 199');
});

test('tout repart à zéro sur demande', () => {
  reset();
  showSpeech('cabin', 'A', 'en-US');
  soundCue('thunder');
  resetSubtitles();
  const s = useSubtitles.getState();
  assert.equal(s.cabin, null);
  assert.equal(s.platform, null);
  assert.equal(s.cue, null);
  assert.equal(s.log.length, 0);
});
