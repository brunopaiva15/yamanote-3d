import type { LoopDirection } from './platforms.ts';

// --- Le motif du carillon d'approche --------------------------------------
//
// Le signal d'attention diffusé sur le quai juste avant 「まもなく、1番線に…」.
// Il n'appartient à personne : c'est une composition originale, écrite ici, qui
// ne cite aucun carillon ATOS existant (voir docs/AUDIO_ORIGINALITY).
//
// Trois choses le définissent, et elles sont ÉCRITES, pas laissées au synthé :
//
// 1. la partition est STRICTEMENT MONOPHONIQUE - une note à la fois, sept en
//    tout. Les résonances se recouvrent, les attaques jamais ;
// 2. les six premières attaques tombent toutes les 200 ms, sans respiration :
//    à 300 BPM une noire vaut 0,20 s pile, et le motif se lit comme une montée
//    par grands intervalles (quarte, quinte, quinte, quarte, quarte), surtout
//    pas comme une gamme ;
// 3. la septième, elle, RETOMBE d'un demi-ton et se tient 1,20 s. C'est elle qui
//    fait qu'on entend un signal, et non six notes qui s'arrêtent.
//
// La réalisation sonore - timbre, enveloppes, bus - vit dans
// systems/audioEngine (platformChime) ; ce fichier ne dit que le QUOI.

/** Tempo du motif (noires par minute) : à 300, la noire dure 0,20 s. */
export const APPROACH_CHIME_BPM = 300;

/** Durée d'une noire (s) au tempo du motif. */
export const APPROACH_CHIME_BEAT_S = 60 / APPROACH_CHIME_BPM;

export interface ApproachChimeNote {
  /** Nom en notation internationale - celui que lit Tone.js. */
  note: string;
  /** Numéro MIDI : l'octave ne se déduit pas d'un nom, elle se dit. */
  midi: number;
  /** Fréquence tempérée (Hz), A4 = 440. */
  hz: number;
  /** Instant de l'attaque (s), depuis le début du motif. */
  at: number;
  /** Durée MUSICALE tenue (s). Le release naturel vient en plus. */
  hold: number;
  /** Vélocité 0-1 : la phrase gagne en présence, la finale se retient. */
  velocity: number;
}

/**
 * Mi3 - La3 - Mi4 - Si4 - Mi5 - La5, puis Sol♯5 tenu.
 *
 * La montée part fort et gagne un rien de présence à chaque note ; la finale,
 * elle, attaque plus doucement que le La5 qui la précède et dure six fois plus
 * longtemps. Un signal de service se termine en s'éteignant, pas en frappant.
 */
export const APPROACH_CHIME_SCORE: readonly ApproachChimeNote[] = [
  { note: 'E3', midi: 52, hz: 164.81, at: 0.0, hold: 0.2, velocity: 0.8 },
  { note: 'A3', midi: 57, hz: 220.0, at: 0.2, hold: 0.2, velocity: 0.83 },
  { note: 'E4', midi: 64, hz: 329.63, at: 0.4, hold: 0.2, velocity: 0.86 },
  { note: 'B4', midi: 71, hz: 493.88, at: 0.6, hold: 0.2, velocity: 0.9 },
  { note: 'E5', midi: 76, hz: 659.25, at: 0.8, hold: 0.2, velocity: 0.94 },
  { note: 'A5', midi: 81, hz: 880.0, at: 1.0, hold: 0.2, velocity: 0.99 },
  { note: 'G#5', midi: 80, hz: 830.61, at: 1.2, hold: 1.2, velocity: 0.82 },
];

/**
 * Fin de la dernière résonance principale (s) : 1,20 + 1,20 = 2,40. C'est la
 * durée MUSICALE du motif - au-delà, il ne reste qu'une queue.
 */
export const APPROACH_CHIME_MUSICAL_S = APPROACH_CHIME_SCORE.reduce(
  (end, n) => Math.max(end, n.at + n.hold),
  0,
);

/** Release de la finale et réverbération du quai, après la durée musicale (s). */
export const APPROACH_CHIME_TAIL_S = 0.45;

/** Durée totale audible (s), queue comprise : ce que la voix doit laisser tomber. */
export const APPROACH_CHIME_TOTAL_S = APPROACH_CHIME_MUSICAL_S + APPROACH_CHIME_TAIL_S;

export interface OriginalApproachChime {
  id: string;
  displayName: string;
  family: 'two-tone' | 'three-tone' | 'ascending' | 'descending' | 'warning-pulse' | 'generic';
  duration: number;
  audioPath: string;
  originalComposition: true;
  seed: number;
}

/** Adaptation fictive Tone.js conservant le carillon générique actuel. */
export const GENERIC_APPROACH_CHIME: OriginalApproachChime = {
  id: 'yamanote-platform-signal-generic', displayName: 'Loop Signal', family: 'ascending',
  duration: APPROACH_CHIME_TOTAL_S, audioPath: 'tone://platformChime', originalComposition: true,
  seed: 235013,
};

export function approachChimeFor(
  _stationCode: string, _direction: LoopDirection, _platform: number,
): OriginalApproachChime {
  return GENERIC_APPROACH_CHIME;
}
