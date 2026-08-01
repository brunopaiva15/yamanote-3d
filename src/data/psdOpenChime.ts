// Le signal d'ouverture des portes palières (ホームドア開扉予告音).
//
// Ce n'est pas de la musique et ce n'est pas la 発車メロディ : c'est un
// AVERTISSEMENT, celui que le portique lance sur le quai au moment où ses
// vantaux partent. Trois notes qui montent, répétées, sur le petit
// haut-parleur vissé au linteau de chaque baie - un timbre volontairement sec
// et institutionnel, qu'on entend d'un bout du quai à l'autre sans jamais le
// prendre pour une mélodie.
//
// La STRUCTURE est ce qui fait le signal, et elle est écrite ici plutôt que
// dans le moteur audio pour deux raisons : elle est vérifiable sans contexte
// Web Audio (voir tests/psdOpenChime.test.ts), et elle ne dépend d'aucun
// réglage de synthèse. Le moteur, lui, ne fait que jouer la partition.
//
//   [Fa5–La5–Do6 | Fa5–La5–Do6 | Fa5–La5–Do6]   ← un BLOC de trois motifs
//   pause
//   [Fa5–La5–Do6 | Fa5–La5–Do6 | Fa5–La5–Do6]
//   pause
//   [Fa5–La5–Do6 | Fa5–La5–Do6 | Fa5–La5–Do6]
//
// Soit neuf motifs, vingt-sept notes, ~3,489 s en tout.

/**
 * Fa5 – La5 – Do6, en hertz.
 *
 * Les hauteurs sont données en FRÉQUENCES et non en noms de notes : le signal
 * n'est pas transposable, et un accordage par nom passerait par le La 440 de
 * Tone, une indirection de plus pour trois valeurs figées.
 */
export const PSD_CHIME_NOTES = [698.456, 880.0, 1046.502] as const;

/** Durée audible d'une note (s). */
export const PSD_CHIME_NOTE_HOLD = 0.085;

/**
 * Intervalle entre deux attaques successives d'un motif (s).
 *
 * Plus COURT que la durée audible : les notes se recouvrent de sept
 * millisecondes, et c'est ce recouvrement qui empêche le motif de s'entendre
 * comme trois bips séparés. Un silence, même d'un centième, et la montée se
 * casse en trois événements.
 */
export const PSD_CHIME_NOTE_STEP = 0.078;

/** Silence entre deux motifs - et entre deux blocs, c'est le même (s). */
export const PSD_CHIME_GAP = 0.135;

/** Queue sonore laissée au bout d'un bloc, avant le silence (s). */
export const PSD_CHIME_BLOCK_TAIL = 0.08;

/** Motifs par bloc, et blocs par signal. */
export const PSD_CHIME_MOTIFS_PER_BLOCK = 3;
export const PSD_CHIME_BLOCKS = 3;

/** Empan d'un motif : de la première attaque à l'extinction de la dernière note. */
export const PSD_CHIME_MOTIF_SPAN =
  (PSD_CHIME_NOTES.length - 1) * PSD_CHIME_NOTE_STEP + PSD_CHIME_NOTE_HOLD;

/** Pas d'un motif au suivant, à l'intérieur d'un bloc (≈ 0,376 s). */
export const PSD_CHIME_MOTIF_STEP = PSD_CHIME_MOTIF_SPAN + PSD_CHIME_GAP;

/** Durée d'un bloc complet, queue comprise (≈ 1,073 s). */
export const PSD_CHIME_BLOCK_DURATION =
  (PSD_CHIME_MOTIFS_PER_BLOCK - 1) * PSD_CHIME_MOTIF_STEP +
  PSD_CHIME_MOTIF_SPAN +
  PSD_CHIME_BLOCK_TAIL;

/** Pas d'un bloc au suivant (≈ 1,208 s). */
export const PSD_CHIME_BLOCK_STEP = PSD_CHIME_BLOCK_DURATION + PSD_CHIME_GAP;

/** Durée totale du signal (≈ 3,489 s). */
export const PSD_CHIME_DURATION =
  (PSD_CHIME_BLOCKS - 1) * PSD_CHIME_BLOCK_STEP + PSD_CHIME_BLOCK_DURATION;

/** Nombre de notes du signal entier (27). */
export const PSD_CHIME_NOTE_COUNT =
  PSD_CHIME_BLOCKS * PSD_CHIME_MOTIFS_PER_BLOCK * PSD_CHIME_NOTES.length;

export interface PsdChimeNote {
  /** Instant de l'attaque, compté depuis le début du signal (s). */
  at: number;
  /** Hauteur (Hz). */
  freq: number;
  /** Rang du bloc (0..2), du motif dans le bloc (0..2), de la note dans le motif (0..2). */
  block: number;
  motif: number;
  step: number;
}

/**
 * La partition, note à note, dans l'ordre.
 *
 * Les trois blocs sont RIGOUREUSEMENT identiques - mêmes hauteurs, mêmes
 * écarts, et le moteur les joue au même niveau : un signal d'avertissement qui
 * enflerait ou faiblirait d'une répétition à l'autre cesserait d'être lu comme
 * une machine et commencerait à être lu comme de la musique.
 */
export function psdOpenChimeScore(): PsdChimeNote[] {
  const notes: PsdChimeNote[] = [];
  for (let block = 0; block < PSD_CHIME_BLOCKS; block++) {
    const blockAt = block * PSD_CHIME_BLOCK_STEP;
    for (let motif = 0; motif < PSD_CHIME_MOTIFS_PER_BLOCK; motif++) {
      const motifAt = blockAt + motif * PSD_CHIME_MOTIF_STEP;
      for (let step = 0; step < PSD_CHIME_NOTES.length; step++) {
        notes.push({
          at: motifAt + step * PSD_CHIME_NOTE_STEP,
          freq: PSD_CHIME_NOTES[step],
          block,
          motif,
          step,
        });
      }
    }
  }
  return notes;
}
