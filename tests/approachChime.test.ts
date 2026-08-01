// Le carillon d'approche est une PARTITION, pas une intention.
//
// Six notes régulières puis une finale tenue : c'est court, c'est dans un coin
// du moteur audio, et c'est exactement le genre de chose qui dérive à la
// première retouche - une note ajoutée, un espacement arrondi, une octave
// perdue en route. Ce fichier fige ce qui doit rester vrai du motif :
//
//   • sept notes, jamais deux en même temps ;
//   • six attaques toutes les 200 ms, sans respiration ajoutée ;
//   • une montée par grands intervalles, PAS une gamme ;
//   • une finale qui retombe d'un demi-ton et se tient six fois plus longtemps.
//
// systems/audioEngine, qui la joue, n'est pas importable ici (il tire tout le
// moteur audio, comme pour tests/melodyTiming) : ce qu'il en fait - un
// instrument court pour les six, un instrument à longue décroissance pour la
// septième - se lit dans platformChime().

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROACH_CHIME_BEAT_S,
  APPROACH_CHIME_BPM,
  APPROACH_CHIME_MUSICAL_S,
  APPROACH_CHIME_SCORE,
  APPROACH_CHIME_TAIL_S,
  APPROACH_CHIME_TOTAL_S,
  GENERIC_APPROACH_CHIME,
} from '../src/data/approachChimes.ts';

/** Fréquence tempérée d'un numéro MIDI, A4 = 440 Hz. */
const hzOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Nom international d'un numéro MIDI, dièses seulement - comme la partition. */
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (midi: number): string => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

test('les sept notes du carillon sont celles-là, dans ces octaves-là', () => {
  assert.deepEqual(
    APPROACH_CHIME_SCORE.map((n) => n.note),
    ['E3', 'A3', 'E4', 'B4', 'E5', 'A5', 'G#5'],
  );
  assert.deepEqual(
    APPROACH_CHIME_SCORE.map((n) => n.midi),
    [52, 57, 64, 71, 76, 81, 80],
  );
  // Nom, numéro MIDI et fréquence disent la MÊME note : trois écritures d'une
  // seule vérité, dont deux servent à attraper la faute de frappe de la
  // troisième. (Tolérance : la table est arrondie au centième de Hz.)
  for (const n of APPROACH_CHIME_SCORE) {
    assert.equal(n.note, nameOf(n.midi), `${n.note} : nom et MIDI divergent`);
    assert.ok(Math.abs(n.hz - hzOf(n.midi)) < 0.02, `${n.note} : ${n.hz} Hz pour ${n.midi}`);
  }
});

test('la montée procède par grands intervalles, jamais par degrés', () => {
  const steps = APPROACH_CHIME_SCORE.slice(1).map((n, i) => n.midi - APPROACH_CHIME_SCORE[i].midi);
  // Quarte, quinte, quinte, quarte, quarte - puis la retombée d'un demi-ton.
  assert.deepEqual(steps, [5, 7, 7, 5, 5, -1]);
  // Une gamme monterait par 1 ou 2 demi-tons : aucun pas de la montée n'y tient.
  for (const s of steps.slice(0, -1)) assert.ok(s >= 5, `pas de ${s} demi-tons dans la montée`);
});

test('les six premières attaques tombent toutes les 200 ms, la septième tient', () => {
  assert.equal(APPROACH_CHIME_BPM, 300);
  assert.equal(APPROACH_CHIME_BEAT_S, 0.2);
  const beat = APPROACH_CHIME_BEAT_S;
  APPROACH_CHIME_SCORE.forEach((n, i) => {
    assert.ok(Math.abs(n.at - i * beat) < 1e-9, `attaque ${i} à ${n.at} s`);
  });
  const held = APPROACH_CHIME_SCORE.slice(0, -1);
  for (const n of held) assert.equal(n.hold, beat);
  // La finale dure six noires : c'est ce qui distingue un signal d'une suite de
  // notes qui s'arrête.
  const finale = APPROACH_CHIME_SCORE[APPROACH_CHIME_SCORE.length - 1];
  assert.ok(Math.abs(finale.hold - 6 * beat) < 1e-9, `finale tenue ${finale.hold} s`);
  assert.equal(finale.at, 1.2);
});

test('la partition reste monophonique : une attaque à la fois', () => {
  assert.equal(APPROACH_CHIME_SCORE.length, 7);
  for (let i = 1; i < APPROACH_CHIME_SCORE.length; i++) {
    assert.ok(
      APPROACH_CHIME_SCORE[i].at > APPROACH_CHIME_SCORE[i - 1].at,
      `deux attaques à ${APPROACH_CHIME_SCORE[i].at} s`,
    );
  }
  // Une seule note prolongée, et c'est la dernière : rien ne doit tenir sous
  // celles qui suivent.
  const overlapping = APPROACH_CHIME_SCORE.filter(
    (n, i) =>
      i < APPROACH_CHIME_SCORE.length - 1 &&
      n.at + n.hold > APPROACH_CHIME_SCORE[i + 1].at + 1e-9,
  ).map((n) => n.note);
  assert.deepEqual(overlapping, []);
});

test('la phrase gagne en présence jusqu’au La5, puis la finale se retient', () => {
  const rising = APPROACH_CHIME_SCORE.slice(0, -1);
  for (let i = 1; i < rising.length; i++) {
    assert.ok(rising[i].velocity > rising[i - 1].velocity, `note ${i} moins présente que la ${i - 1}`);
  }
  assert.ok(rising[0].velocity >= 0.8, 'le carillon commence fort');
  const finale = APPROACH_CHIME_SCORE[APPROACH_CHIME_SCORE.length - 1];
  assert.ok(finale.velocity < rising[rising.length - 1].velocity, 'la finale ne doit pas frapper');
  for (const n of APPROACH_CHIME_SCORE) assert.ok(n.velocity > 0 && n.velocity <= 1);
});

test('le motif dure 2,4 s, et sa queue le laisse sous les 3 s', () => {
  assert.ok(Math.abs(APPROACH_CHIME_MUSICAL_S - 2.4) < 1e-9, `${APPROACH_CHIME_MUSICAL_S} s`);
  assert.ok(APPROACH_CHIME_TAIL_S > 0.2 && APPROACH_CHIME_TAIL_S < 0.7);
  assert.ok(
    APPROACH_CHIME_TOTAL_S >= 2.7 && APPROACH_CHIME_TOTAL_S <= 3.0,
    `durée totale ${APPROACH_CHIME_TOTAL_S} s`,
  );
  // La fiche du carillon annonce la durée RÉELLE : c'est elle que lit tout ce
  // qui planifie autour du signal.
  assert.equal(GENERIC_APPROACH_CHIME.duration, APPROACH_CHIME_TOTAL_S);
});
