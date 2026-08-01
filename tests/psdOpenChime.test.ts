// Le signal d'ouverture des portes palières (data/psdOpenChime).
//
// Un avertisseur n'est pas une mélodie : il n'a ni variante, ni raccourci, ni
// fin anticipée. Ce que ce fichier tient, c'est sa STRUCTURE - celle qu'on ne
// peut pas entendre de travers sans que le signal cesse d'en être un :
//
//   • neuf motifs Fa5–La5–Do6, en trois blocs de trois, soit vingt-sept notes.
//     Trois motifs en tout, ou trois notes jouées une fois, ne suffisent pas ;
//   • les notes d'un motif se RECOUVRENT : pas un centième de silence entre
//     Fa5, La5 et Do6, sans quoi la montée s'entend comme trois bips ;
//   • les trois blocs sont rigoureusement identiques, à la translation près.
//
// Les durées sont vérifiées à la milliseconde : elles sont écrites en secondes
// décimales, donc sommées en flottant, et un écart d'un millième ne s'entend
// pas - mais un écart d'un centième, si.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  PSD_CHIME_BLOCKS,
  PSD_CHIME_BLOCK_DURATION,
  PSD_CHIME_BLOCK_STEP,
  PSD_CHIME_DURATION,
  PSD_CHIME_GAP,
  PSD_CHIME_MOTIFS_PER_BLOCK,
  PSD_CHIME_MOTIF_SPAN,
  PSD_CHIME_MOTIF_STEP,
  PSD_CHIME_NOTES,
  PSD_CHIME_NOTE_COUNT,
  PSD_CHIME_NOTE_HOLD,
  PSD_CHIME_NOTE_STEP,
  psdOpenChimeScore,
} = await import('../src/data/psdOpenChime.ts');

/** Tolérance : une milliseconde, le grain sous lequel rien ne s'entend. */
const MS = 0.001;

const near = (got: number, want: number, what: string): void => {
  assert.ok(
    Math.abs(got - want) < MS,
    `${what} : ${got.toFixed(4)} s au lieu de ${want.toFixed(4)} s`,
  );
};

test('les trois hauteurs sont Fa5, La5, Do6 et elles montent', () => {
  assert.deepEqual([...PSD_CHIME_NOTES], [698.456, 880.0, 1046.502]);
  for (let i = 1; i < PSD_CHIME_NOTES.length; i++) {
    assert.ok(PSD_CHIME_NOTES[i] > PSD_CHIME_NOTES[i - 1], 'le motif doit être ascendant');
  }
});

test('neuf motifs, vingt-sept notes - pas trois', () => {
  const score = psdOpenChimeScore();
  assert.equal(PSD_CHIME_BLOCKS, 3);
  assert.equal(PSD_CHIME_MOTIFS_PER_BLOCK, 3);
  assert.equal(PSD_CHIME_NOTE_COUNT, 27);
  assert.equal(score.length, 27);
  const motifs = new Set(score.map((n) => `${n.block}/${n.motif}`));
  assert.equal(motifs.size, 9);
});

test('chaque motif est bien Fa5–La5–Do6, dans cet ordre', () => {
  const score = psdOpenChimeScore();
  for (let i = 0; i < score.length; i += 3) {
    const motif = score.slice(i, i + 3);
    assert.deepEqual(
      motif.map((n) => n.freq),
      [...PSD_CHIME_NOTES],
      `motif ${i / 3}`,
    );
    assert.deepEqual(
      motif.map((n) => n.step),
      [0, 1, 2],
    );
    // 0 ms, 78 ms, 156 ms depuis le début du motif.
    near(motif[1].at - motif[0].at, PSD_CHIME_NOTE_STEP, 'attaque de La5');
    near(motif[2].at - motif[0].at, 2 * PSD_CHIME_NOTE_STEP, 'attaque de Do6');
  }
});

test('les notes d’un motif se recouvrent : aucun silence entre elles', () => {
  assert.ok(
    PSD_CHIME_NOTE_STEP < PSD_CHIME_NOTE_HOLD,
    'la note suivante doit attaquer avant l’extinction de la précédente',
  );
  const score = psdOpenChimeScore();
  for (let i = 0; i < score.length; i += 3) {
    for (let k = 1; k < 3; k++) {
      const overlap = score[i + k - 1].at + PSD_CHIME_NOTE_HOLD - score[i + k].at;
      near(overlap, PSD_CHIME_NOTE_HOLD - PSD_CHIME_NOTE_STEP, 'recouvrement');
      assert.ok(overlap > 0, 'silence entre deux notes du motif');
    }
  }
});

test('la pause entre motifs vaut 135 ms, à l’intérieur d’un bloc', () => {
  near(PSD_CHIME_MOTIF_SPAN, 0.241, 'empan d’un motif');
  near(PSD_CHIME_MOTIF_STEP, 0.376, 'pas d’un motif au suivant');
  const score = psdOpenChimeScore();
  for (let block = 0; block < PSD_CHIME_BLOCKS; block++) {
    const starts = score
      .filter((n) => n.block === block && n.step === 0)
      .map((n) => n.at - block * PSD_CHIME_BLOCK_STEP);
    assert.equal(starts.length, 3);
    // 0 ms, 376 ms, 752 ms depuis le début du bloc.
    near(starts[0], 0, `bloc ${block}, motif 0`);
    near(starts[1], 0.376, `bloc ${block}, motif 1`);
    near(starts[2], 0.752, `bloc ${block}, motif 2`);
    for (let i = 1; i < starts.length; i++) {
      near(starts[i] - starts[i - 1] - PSD_CHIME_MOTIF_SPAN, PSD_CHIME_GAP, 'pause entre motifs');
    }
  }
});

test('un bloc dure 1,073 s et les blocs partent à 0 / 1,208 / 2,416 s', () => {
  near(PSD_CHIME_BLOCK_DURATION, 1.073, 'durée d’un bloc');
  near(PSD_CHIME_BLOCK_STEP, 1.208, 'pas d’un bloc au suivant');
  const score = psdOpenChimeScore();
  const blockStarts = [0, 1, 2].map((b) => score.find((n) => n.block === b)!.at);
  near(blockStarts[0], 0, 'bloc 1');
  near(blockStarts[1], 1.208, 'bloc 2');
  near(blockStarts[2], 2.416, 'bloc 3');
  // Le silence entre deux blocs est exactement celui d'entre deux motifs.
  for (let i = 1; i < blockStarts.length; i++) {
    near(
      blockStarts[i] - blockStarts[i - 1] - PSD_CHIME_BLOCK_DURATION,
      PSD_CHIME_GAP,
      'pause entre blocs',
    );
  }
});

test('le signal entier dure 3,489 s', () => {
  near(PSD_CHIME_DURATION, 3.489, 'durée totale');
  const score = psdOpenChimeScore();
  const last = score[score.length - 1];
  // La dernière note s'éteint avant la fin : le reste est la queue du bloc.
  assert.ok(last.at + PSD_CHIME_NOTE_HOLD <= PSD_CHIME_DURATION + MS);
  near(PSD_CHIME_DURATION - (last.at + PSD_CHIME_NOTE_HOLD), 0.08, 'queue du dernier bloc');
});

test('les trois blocs sont rigoureusement identiques', () => {
  const score = psdOpenChimeScore();
  const shape = (block: number) =>
    score
      .filter((n) => n.block === block)
      .map((n) => `${n.freq}@${(n.at - block * PSD_CHIME_BLOCK_STEP).toFixed(6)}`);
  assert.deepEqual(shape(1), shape(0));
  assert.deepEqual(shape(2), shape(0));
});

test('la partition est strictement croissante dans le temps', () => {
  const score = psdOpenChimeScore();
  for (let i = 1; i < score.length; i++) {
    assert.ok(score[i].at > score[i - 1].at, `note ${i} n’avance pas`);
  }
});
