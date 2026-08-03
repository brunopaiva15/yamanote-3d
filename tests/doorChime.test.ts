// Le carillon des portes de la rame : six sons, et pas un de plus.
//
// C'est le son le plus souvent entendu du jeu - deux fois par arrêt, trente
// arrêts par boucle - et c'est aussi celui qu'une retouche déforme le plus
// facilement : une paire de trop, un silence rogné, une fréquence « corrigée »
// vers la note tempérée la plus proche. Ce fichier tient les quatre choses qui
// font que ça reste un ピンポーン de porte et pas une sonnerie :
//
//   • deux hauteurs, 824 et 616 Hz, volontairement à côté du tempérament ;
//   • le grave entre 170 ms après l'aigu, dans sa queue - jamais après un
//     silence ;
//   • trois paires, espacées de 820 ms, séparées par ~260 ms de silence ;
//   • les trois paires sont identiques : ni crescendo, ni diminuendo.
//
// systems/audioEngine, qui les joue, n'est pas importable ici (il tire tout le
// moteur audio, comme pour tests/melodyTiming) : le timbre - partiels
// désaccordés, amorce, stabilisation de hauteur - se lit dans
// data/doorChime.ts et se vérifie au rendu hors ligne.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOOR_CHIME_ATTACK,
  DOOR_CHIME_CLICK_HZ,
  DOOR_CHIME_CLICK_S,
  DOOR_CHIME_DURATION,
  DOOR_CHIME_GAP,
  DOOR_CHIME_HIGH_HZ,
  DOOR_CHIME_LOW_HZ,
  DOOR_CHIME_LOW_OFFSET,
  DOOR_CHIME_PAIRS,
  DOOR_CHIME_PAIR_SPAN,
  DOOR_CHIME_PAIR_STEP,
  DOOR_CHIME_SETTLE_RATIO,
  DOOR_CHIME_SETTLE_S,
  DOOR_CHIME_TONES,
  doorChimeScore,
} from '../src/data/doorChime.ts';

const [HIGH, LOW] = DOOR_CHIME_TONES;
const close = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

test('deux hauteurs, et elles ne sont pas tempérées', () => {
  assert.equal(DOOR_CHIME_HIGH_HZ, 824);
  assert.equal(DOOR_CHIME_LOW_HZ, 616);
  // Sol♯5 et Ré♯5 tempérés, que le carillon frôle sans les toucher : les
  // arrondir lui ferait perdre exactement ce qui le fait sonner électronique.
  const tempered = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
  for (const [hz, midi] of [[DOOR_CHIME_HIGH_HZ, 80], [DOOR_CHIME_LOW_HZ, 75]]) {
    const cents = 1200 * Math.log2(hz / tempered(midi));
    assert.ok(cents < -8 && cents > -20, `${hz} Hz : ${cents.toFixed(1)} cents`);
  }
  assert.equal(HIGH.freq, DOOR_CHIME_HIGH_HZ);
  assert.equal(LOW.freq, DOOR_CHIME_LOW_HZ);
});

test('six sons : trois paires aigu-grave, pas une de plus', () => {
  const score = doorChimeScore();
  assert.equal(DOOR_CHIME_PAIRS, 3);
  assert.equal(score.length, 6);
  assert.deepEqual(score.map((e) => e.tone), [0, 1, 0, 1, 0, 1]);
  assert.deepEqual(score.map((e) => e.pair), [0, 0, 1, 1, 2, 2]);
  // La chronologie exacte, en millisecondes, telle qu'elle doit sortir.
  assert.deepEqual(
    score.map((e) => Math.round(e.at * 1000)),
    [0, 170, 820, 990, 1640, 1810],
  );
  for (let i = 1; i < score.length; i++) {
    assert.ok(score[i].at > score[i - 1].at, `deux attaques à ${score[i].at} s`);
  }
});

test('le grave entre dans la queue de l’aigu, jamais après un silence', () => {
  assert.equal(DOOR_CHIME_LOW_OFFSET, 0.17);
  // L'aigu tient 155 ms : le grave entre 15 ms après la fin de sa partie
  // tenue, pendant son relâchement. Un écart supérieur à l'empan de l'aigu
  // couperait le « pin-pōn » en deux bips.
  assert.ok(DOOR_CHIME_LOW_OFFSET > HIGH.hold, 'le grave ne doit pas couvrir la tenue de l’aigu');
  assert.ok(
    DOOR_CHIME_LOW_OFFSET < HIGH.hold + HIGH.release,
    'le grave doit entrer avant l’extinction de l’aigu',
  );
});

test('l’aigu est court et clair, le grave long et un rien plus fort', () => {
  assert.equal(HIGH.hold, 0.155);
  assert.equal(HIGH.release, 0.075);
  assert.equal(LOW.hold, 0.285);
  assert.equal(LOW.release, 0.105);
  assert.ok(LOW.hold > HIGH.hold * 1.5, 'le grave doit durer sensiblement plus');
  assert.ok(LOW.gain > HIGH.gain, 'le grave porte le « pōn », il est le plus présent');
  assert.ok(LOW.gain / HIGH.gain < 1.3, 'très légèrement, pas un accent');
});

test('presque des sinusoïdes, avec deux partiels désaccordés qui meurent vite', () => {
  for (const tone of DOOR_CHIME_TONES) {
    assert.equal(tone.partials.length, 3);
    const [fund, ...upper] = tone.partials;
    assert.equal(fund.ratio, 1);
    assert.ok(fund.amp >= 0.75, 'la fondamentale porte le son');
    // Les partiels ne pèsent qu'un quart du mélange : c'est ce qui sépare un
    // carillon électronique d'un vibraphone.
    const rest = upper.reduce((s, p) => s + p.amp, 0);
    assert.ok(rest < fund.amp * 0.35, `partiels trop présents (${rest})`);
    for (const p of upper) {
      assert.ok(p.amp < fund.amp, 'aucun partiel ne doit dominer');
      // Plus vite que la fondamentale : mordant dans l'attaque, tenue pure.
      assert.ok(p.sustain < fund.sustain, 'les partiels doivent retomber plus bas');
    }
    // Le partiel aigu est proche du rang quatre sans y être - accordé juste, il
    // fusionnerait avec la fondamentale.
    const top = upper[upper.length - 1];
    assert.ok(top.ratio > 3.9 && top.ratio < 4, `rang ${top.ratio}`);
    assert.notEqual(top.ratio, 4);
  }
  // L'aigu est le plus brillant des deux : partiels plus présents.
  const brightness = (t: typeof HIGH): number =>
    t.partials.slice(1).reduce((s, p) => s + p.amp, 0) / t.partials[0].amp;
  assert.ok(brightness(HIGH) > brightness(LOW), 'l’aigu doit être plus incisif que le grave');
});

test('les paires respirent : ~260 ms de silence, et pas de quatrième', () => {
  assert.equal(DOOR_CHIME_PAIR_STEP, 0.82);
  assert.ok(close(DOOR_CHIME_PAIR_SPAN, 0.56, 1e-9), `empan ${DOOR_CHIME_PAIR_SPAN}`);
  assert.ok(Math.abs(DOOR_CHIME_GAP - 0.26) < 0.005, `silence ${DOOR_CHIME_GAP}`);
  assert.ok(DOOR_CHIME_GAP > 0.2, 'enchaînées, les paires sonneraient comme une alarme');
  assert.ok(close(DOOR_CHIME_DURATION, 2.2, 1e-9), `durée ${DOOR_CHIME_DURATION}`);
  // Rien après la dernière extinction : le signal s'arrête net.
  const score = doorChimeScore();
  const last = score[score.length - 1];
  assert.ok(close(last.at + LOW.hold + LOW.release, DOOR_CHIME_DURATION, 1e-9));
});

test('les trois paires sont identiques : ni crescendo ni diminuendo', () => {
  const score = doorChimeScore();
  for (const tone of [0, 1]) {
    const hits = score.filter((e) => e.tone === tone);
    assert.equal(hits.length, DOOR_CHIME_PAIRS);
    // Même écart d'une paire à l'autre, pour les deux sons.
    const steps = hits.slice(1).map((e, i) => e.at - hits[i].at);
    for (const s of steps) assert.ok(close(s, DOOR_CHIME_PAIR_STEP, 1e-9), `pas de ${s} s`);
  }
  // Le niveau et le timbre ne dépendent QUE du son joué, jamais du rang de la
  // paire : la partition ne porte aucun champ qui pourrait les faire varier.
  assert.deepEqual(Object.keys(score[0]).sort(), ['at', 'pair', 'tone']);
});

test('l’attaque, le calage et l’amorce restent sous le seuil du perceptible', () => {
  assert.equal(DOOR_CHIME_ATTACK, 0.006);
  // 0,8 % de trop, rejoint en 18 ms : le générateur qui se cale. Plus long, ce
  // serait un glissando ; plus haut, une fausse note.
  assert.ok(DOOR_CHIME_SETTLE_RATIO > 0 && DOOR_CHIME_SETTLE_RATIO <= 0.01);
  assert.ok(DOOR_CHIME_SETTLE_S <= 0.02);
  assert.ok(
    1200 * Math.log2(1 + DOOR_CHIME_SETTLE_RATIO) < 15,
    'le calage doit rester sous le seuil du demi-ton perçu',
  );
  assert.equal(DOOR_CHIME_CLICK_HZ, 3150);
  assert.ok(DOOR_CHIME_CLICK_S < 0.006, 'l’amorce doit rester une impulsion');
});
