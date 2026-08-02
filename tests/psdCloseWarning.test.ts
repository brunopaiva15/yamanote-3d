// L'avertisseur de fermeture des portes palières (data/psdCloseWarning).
//
// Ce que ce fichier tient, c'est ce qui distingue un avertisseur d'une
// mélodie - et ce qui distingue la FERMETURE de l'ouverture :
//
//   • deux notes, pas trois, et elles DESCENDENT. Le sens du motif est la
//     seule chose qui dise au voyageur ce que font les vantaux ;
//   • trois paires en tout, six notes. Pas un bloc répété trois fois - c'est
//     la structure du signal d'ouverture, pas de celui-ci ;
//   • les deux notes d'une paire se recouvrent : aucun silence entre Mi5 et
//     Do5, sinon la descente s'entend comme deux bips ;
//   • la paire est l'unité de BOUCLE. Ce que le moteur répète pendant la
//     course des vantaux doit être exactement le premier motif de la
//     partition, sans quoi une fermeture bloquée ne sonnerait pas comme une
//     fermeture normale prolongée.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  PSD_WARN_DURATION,
  PSD_WARN_GAP,
  PSD_WARN_NOTES,
  PSD_WARN_NOTE_COUNT,
  PSD_WARN_NOTE_HOLD,
  PSD_WARN_NOTE_STEP,
  PSD_WARN_PAIRS,
  PSD_WARN_PAIR_SPAN,
  PSD_WARN_PAIR_STEP,
  PSD_WARN_TAIL,
  psdCloseWarningPair,
  psdCloseWarningPairsIn,
  psdCloseWarningScore,
} = await import('../src/data/psdCloseWarning.ts');

const { PSD_CHIME_NOTES } = await import('../src/data/psdOpenChime.ts');
const { CONFIG } = await import('../src/data/config.ts');

/** Tolérance : une milliseconde, le grain sous lequel rien ne s'entend. */
const MS = 0.001;

const near = (got: number, want: number, what: string): void => {
  assert.ok(
    Math.abs(got - want) < MS,
    `${what} : ${got.toFixed(4)} s au lieu de ${want.toFixed(4)} s`,
  );
};

test('les deux hauteurs sont Mi5 et Do5, et elles descendent', () => {
  assert.deepEqual([...PSD_WARN_NOTES], [659.255, 523.251]);
  assert.ok(PSD_WARN_NOTES[1] < PSD_WARN_NOTES[0], 'le motif doit être descendant');
  // Les octaves sont celles-là et pas d'autres : Mi5/Do5 (MIDI 76 et 72), donc
  // sous la 発車メロディ des baies, qui monte de Fa5 à Do6.
  const midi = (f: number) => Math.round(69 + 12 * Math.log2(f / 440));
  assert.deepEqual(PSD_WARN_NOTES.map(midi), [76, 72]);
  assert.ok(
    PSD_WARN_NOTES[0] < PSD_CHIME_NOTES[0],
    'la fermeture doit rester sous le signal d’ouverture',
  );
});

test('trois paires, six notes - pas un bloc répété', () => {
  assert.equal(PSD_WARN_PAIRS, 3);
  assert.equal(PSD_WARN_NOTE_COUNT, 6);
  const score = psdCloseWarningScore();
  assert.equal(score.length, 6);
  assert.deepEqual(
    score.map((n) => n.freq),
    [659.255, 523.251, 659.255, 523.251, 659.255, 523.251],
  );
  assert.equal(new Set(score.map((n) => n.pair)).size, 3);
});

test('les deux notes d’une paire se recouvrent de 8 ms', () => {
  assert.ok(
    PSD_WARN_NOTE_STEP < PSD_WARN_NOTE_HOLD,
    'Do5 doit attaquer avant l’extinction de Mi5',
  );
  near(PSD_WARN_NOTE_HOLD - PSD_WARN_NOTE_STEP, 0.008, 'recouvrement');
  const pair = psdCloseWarningPair();
  near(pair[0].at, 0, 'attaque de Mi5');
  near(pair[1].at, 0.08, 'attaque de Do5');
  near(PSD_WARN_PAIR_SPAN, 0.168, 'empan d’une paire');
});

test('les paires partent à 0, 303 et 606 ms', () => {
  near(PSD_WARN_PAIR_STEP, 0.303, 'pas d’une paire à la suivante');
  const starts = psdCloseWarningScore()
    .filter((n) => n.step === 0)
    .map((n) => n.at);
  assert.equal(starts.length, 3);
  near(starts[0], 0, 'paire 1');
  near(starts[1], 0.303, 'paire 2');
  near(starts[2], 0.606, 'paire 3');
  for (let i = 1; i < starts.length; i++) {
    near(starts[i] - starts[i - 1] - PSD_WARN_PAIR_SPAN, PSD_WARN_GAP, 'pause entre paires');
  }
});

test('la chronologie complète est 0 / 80 / 303 / 383 / 606 / 686 ms', () => {
  const ats = psdCloseWarningScore().map((n) => n.at);
  const want = [0, 0.08, 0.303, 0.383, 0.606, 0.686];
  for (let i = 0; i < want.length; i++) near(ats[i], want[i], `note ${i}`);
});

test('la fermeture normale dure entre 0,84 et 0,90 s', () => {
  near(PSD_WARN_DURATION, 0.854, 'durée totale');
  assert.ok(PSD_WARN_DURATION >= 0.84 && PSD_WARN_DURATION <= 0.9);
  const last = psdCloseWarningScore().at(-1)!;
  near(PSD_WARN_DURATION - (last.at + PSD_WARN_NOTE_HOLD), PSD_WARN_TAIL, 'queue finale');
});

test('les trois paires sont strictement identiques', () => {
  const score = psdCloseWarningScore();
  const shape = (pair: number) =>
    score
      .filter((n) => n.pair === pair)
      .map((n) => `${n.freq}@${(n.at - pair * PSD_WARN_PAIR_STEP).toFixed(6)}`);
  assert.deepEqual(shape(1), shape(0));
  assert.deepEqual(shape(2), shape(0));
});

test('la paire bouclée est exactement le premier motif de la partition', () => {
  // C'est la garantie qu'une fermeture retenue par un obstacle sonne comme une
  // fermeture normale qui dure, et non comme un autre signal.
  const pair = psdCloseWarningPair();
  const first = psdCloseWarningScore().filter((n) => n.pair === 0);
  assert.deepEqual(
    pair.map((n) => [n.freq, +n.at.toFixed(6), n.step]),
    first.map((n) => [n.freq, +n.at.toFixed(6), n.step]),
  );
});

test('une fermeture normale donne exactement trois paires', () => {
  // Le lien entre la course des vantaux (CONFIG.psdCloseTime) et le signal :
  // c'est de là que sortent « trois paires », et non d'un compte écrit en dur.
  // La quatrième tomberait à 0,909 s, après la butée - le moteur ne la lance
  // pas (audioEngine.pumpPsdCloseWarning).
  assert.equal(psdCloseWarningPairsIn(CONFIG.psdCloseTime), PSD_WARN_PAIRS);
  assert.ok(
    3 * PSD_WARN_PAIR_STEP > CONFIG.psdCloseTime,
    'une quatrième paire tiendrait dans la course : le signal déborderait',
  );
  // Et les trois tiennent bien DANS le mouvement, queue comprise.
  assert.ok(
    PSD_WARN_DURATION <= CONFIG.psdCloseTime + MS,
    'le signal doit se terminer au plus tard sur la butée',
  );
});

test('la boucle s’allonge avec la course, sans jamais déborder', () => {
  // Une baie retenue par un obstacle ferme plus tard : la boucle continue, et
  // aucune paire ne démarre après la butée, quelle qu'elle soit.
  assert.equal(psdCloseWarningPairsIn(0), 0);
  assert.equal(psdCloseWarningPairsIn(-1), 0);
  for (let travel = 0.05; travel < 8; travel += 0.05) {
    const n = psdCloseWarningPairsIn(travel);
    assert.ok((n - 1) * PSD_WARN_PAIR_STEP < travel + MS, `paire de trop à ${travel.toFixed(2)} s`);
    assert.ok(n * PSD_WARN_PAIR_STEP >= travel - MS, `paire manquante à ${travel.toFixed(2)} s`);
  }
});

test('la partition est strictement croissante dans le temps', () => {
  const score = psdCloseWarningScore();
  for (let i = 1; i < score.length; i++) {
    assert.ok(score[i].at > score[i - 1].at, `note ${i} n’avance pas`);
  }
});
