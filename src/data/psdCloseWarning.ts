// L'avertisseur de FERMETURE des portes palières (ホームドア閉扉予告音).
//
// Le pendant du signal d'ouverture (data/psdOpenChime), et son contraire à
// l'oreille : deux notes qui DESCENDENT au lieu de trois qui montent. C'est
// tout ce qui les distingue, et c'est assez - personne ne lit un panneau pour
// savoir dans quel sens partent les vantaux, on l'entend.
//
//   [Mi5–Do5] · pause · [Mi5–Do5] · pause · [Mi5–Do5]
//
// Six notes, ~0,854 s. Ce n'est PAS un bloc répété trois fois : c'est trois
// paires, et rien d'autre. Le signal reste court parce qu'il ne dit qu'une
// chose - « ça se ferme, n'entrez plus » - et qu'il doit tenir dans le
// mouvement des vantaux.
//
// C'est aussi pourquoi la paire est donnée SÉPARÉMENT de la partition
// complète : dans le jeu, l'avertisseur n'est pas un fichier qu'on lance mais
// une BOUCLE qu'on arrête quand les baies sont confirmées fermées (voir
// systems/audioEngine.psdCloseWarning). Sur une fermeture normale - 0,9 s de
// course - la boucle donne exactement les trois paires ci-dessous ; sur une
// baie retenue par un obstacle, elle continue tant que le passage n'est pas
// dégagé, et c'est le comportement d'un vrai quai.

/** Mi5 – Do5, en hertz (MIDI 76 et 72). */
export const PSD_WARN_NOTES = [659.255, 523.251] as const;

/** Durée audible d'une note (s). */
export const PSD_WARN_NOTE_HOLD = 0.088;

/**
 * Intervalle entre les deux attaques d'une paire (s).
 *
 * Huit millisecondes de moins que la tenue : Do5 attaque avant que Mi5 se
 * taise. Sans ce recouvrement, la descente s'entend comme deux bips distincts
 * et le signal perd son sens - c'est le GESTE de descendre qui dit la
 * fermeture, pas les deux hauteurs prises séparément.
 */
export const PSD_WARN_NOTE_STEP = 0.08;

/** Silence entre deux paires (s). */
export const PSD_WARN_GAP = 0.135;

/** Queue sonore laissée au bout de la dernière paire (s). */
export const PSD_WARN_TAIL = 0.08;

/** Paires d'une fermeture normale. */
export const PSD_WARN_PAIRS = 3;

/** Empan d'une paire : de l'attaque de Mi5 à l'extinction de Do5 (0,168 s). */
export const PSD_WARN_PAIR_SPAN =
  (PSD_WARN_NOTES.length - 1) * PSD_WARN_NOTE_STEP + PSD_WARN_NOTE_HOLD;

/** Pas d'une paire à la suivante, silence compris (0,303 s). */
export const PSD_WARN_PAIR_STEP = PSD_WARN_PAIR_SPAN + PSD_WARN_GAP;

/** Durée d'une fermeture normale, queue comprise (0,854 s). */
export const PSD_WARN_DURATION =
  (PSD_WARN_PAIRS - 1) * PSD_WARN_PAIR_STEP + PSD_WARN_PAIR_SPAN + PSD_WARN_TAIL;

/** Notes d'une fermeture normale (6). */
export const PSD_WARN_NOTE_COUNT = PSD_WARN_PAIRS * PSD_WARN_NOTES.length;

export interface PsdWarnNote {
  /** Instant de l'attaque, depuis le début de la paire ou du signal (s). */
  at: number;
  /** Hauteur (Hz). */
  freq: number;
  /** Rang de la paire, et de la note dans la paire. */
  pair: number;
  step: number;
}

/**
 * UNE paire Mi5–Do5, l'unité que le moteur boucle pendant la fermeture.
 *
 * `pair` vaut toujours 0 : la boucle ne compte pas ses tours, elle s'arrête
 * quand les vantaux sont en butée. Trois paires ne sont pas une consigne mais
 * ce que dure une fermeture normale.
 */
export function psdCloseWarningPair(): PsdWarnNote[] {
  return PSD_WARN_NOTES.map((freq, step) => ({
    at: step * PSD_WARN_NOTE_STEP,
    freq,
    pair: 0,
    step,
  }));
}

/**
 * Combien de paires la boucle donne pendant une course de `travel` secondes.
 *
 * La règle du moteur tient en une phrase : aucune paire ne DÉMARRE après la
 * butée (audioEngine.pumpPsdCloseWarning). Le compte s'en déduit, et c'est lui
 * qui fait qu'une fermeture normale - 0,9 s, CONFIG.psdCloseTime - donne
 * exactement les trois paires ci-dessus : la quatrième tomberait à 0,909 s,
 * neuf millisecondes trop tard.
 */
export function psdCloseWarningPairsIn(travel: number): number {
  if (!(travel > 0)) return 0;
  return Math.ceil(travel / PSD_WARN_PAIR_STEP);
}

/**
 * La partition d'une fermeture normale : trois paires, six notes, dans
 * l'ordre. C'est ce que la boucle produit d'elle-même quand rien ne coince.
 */
export function psdCloseWarningScore(): PsdWarnNote[] {
  const notes: PsdWarnNote[] = [];
  for (let pair = 0; pair < PSD_WARN_PAIRS; pair++) {
    const at = pair * PSD_WARN_PAIR_STEP;
    for (const note of psdCloseWarningPair()) {
      notes.push({ ...note, at: at + note.at, pair });
    }
  }
  return notes;
}
