// Le carillon des PORTES DE LA RAME (ピンポーン), celui qu'on entend de
// l'intérieur.
//
// Deux sons, un aigu puis un grave, répétés trois fois : le « pin-pōn » des
// petits haut-parleurs vissés au-dessus de chaque baie. Il part au premier
// millimètre de course, à l'ouverture COMME à la fermeture, et c'est
// rigoureusement le même signal dans les deux cas - ce qui distingue les deux
// moments à l'oreille, c'est la mécanique autour (vantaux, purge d'air,
// avertisseur des portes palières), jamais le carillon.
//
//   [aigu → grave] · pause · [aigu → grave] · pause · [aigu → grave]
//
// Soit six sons, ~2,2 s. La partition et la recette du timbre sont ici plutôt
// que dans le moteur audio pour la même raison que pour l'avertisseur de quai
// (data/psdOpenChime) : elles se vérifient sans contexte Web Audio (voir
// tests/doorChime.test.ts), et le moteur ne fait que les jouer.

/**
 * Les deux hauteurs, en hertz.
 *
 * 824 et 616 Hz, et NON les Sol♯5 / Ré♯5 tempérés (830,61 et 622,25 Hz) dont
 * elles s'approchent. Un générateur de carillon embarqué ne s'accorde pas sur
 * le la 440 : il sort la fréquence de son quartz, un rien basse, et c'est
 * précisément ce demi-pour-cent de désaccord qui l'empêche de sonner comme un
 * instrument. Arrondir aux notes tempérées reviendrait à corriger ce qui fait
 * le son.
 */
export const DOOR_CHIME_HIGH_HZ = 824;
export const DOOR_CHIME_LOW_HZ = 616;

/** Paires du signal, et pas d'une attaque aiguë à la suivante (s). */
export const DOOR_CHIME_PAIRS = 3;
export const DOOR_CHIME_PAIR_STEP = 0.82;

/**
 * Retard du grave sur l'aigu à l'intérieur d'une paire (s).
 *
 * 170 ms quand l'aigu en dure 155 : le grave entre quinze millisecondes après
 * la fin de la partie tenue de l'aigu, dans sa queue de relâchement. C'est ce
 * chevauchement qui fait entendre « pin-pōn » d'un seul tenant plutôt que deux
 * bips à la file.
 */
export const DOOR_CHIME_LOW_OFFSET = 0.17;

/** Attaque, arrondie mais franche : la même pour les deux sons (s). */
export const DOOR_CHIME_ATTACK = 0.006;

/**
 * Stabilisation de hauteur du générateur.
 *
 * Chaque son démarre 0,8 % trop haut et rejoint sa fréquence en 18 ms. C'est
 * le temps que met l'oscillateur à se caler, pas un effet : au-delà de ces
 * quelques millisecondes on entendrait un glissando, et le carillon
 * deviendrait musical.
 */
export const DOOR_CHIME_SETTLE_RATIO = 0.008;
export const DOOR_CHIME_SETTLE_S = 0.018;

/**
 * L'amorce électronique, au tout début de chaque son.
 *
 * Une impulsion de quelques millisecondes vers 3150 Hz, sous le seuil de
 * l'attention : on ne l'entend pas, on entend seulement que le son DÉMARRE au
 * lieu d'apparaître. C'est la membrane du haut-parleur qui se met en route.
 */
export const DOOR_CHIME_CLICK_HZ = 3150;
export const DOOR_CHIME_CLICK_S = 0.005;

export interface DoorChimePartial {
  /** Multiple de la fondamentale. */
  ratio: number;
  /** Part dans le mélange (1 = fondamentale pleine). */
  amp: number;
  /** Décroissance vers le plateau (s) et niveau du plateau (0-1). */
  decay: number;
  sustain: number;
}

export interface DoorChimeTone {
  /** Fondamentale (Hz). */
  freq: number;
  /** Durée tenue, avant le relâchement (s). */
  hold: number;
  /** Relâchement, après la durée tenue (s). */
  release: number;
  /** Niveau du son entier : le grave est un rien plus fort que l'aigu. */
  gain: number;
  /** Fondamentale et partiels, dans cet ordre. */
  partials: readonly DoorChimePartial[];
}

/**
 * Les deux sons du carillon.
 *
 * Presque des sinusoïdes : un partiel de rang deux, un autre vers le rang
 * quatre, et rien d'autre. Les deux sont LÉGÈREMENT DÉSACCORDÉS (2,01 et 3,97
 * fois la fondamentale pour l'aigu, 3,98 pour le grave) - accordés juste, ils
 * fusionneraient avec la fondamentale en un timbre d'orgue ; désaccordés d'un
 * centième, ils battent lentement et donnent ce grain électronique un peu
 * métallique, sans jamais aller jusqu'à la cloche.
 *
 * Les partiels retombent tous vers un plateau bas et le font plus vite que la
 * fondamentale : le mordant est dans les premières dizaines de millisecondes,
 * la tenue est presque pure. C'est ce qui sépare un carillon de porte d'un
 * vibraphone, dont les partiels vivent aussi longtemps que la note.
 */
export const DOOR_CHIME_TONES: readonly [DoorChimeTone, DoorChimeTone] = [
  {
    // L'aigu : court, clair, incisif. C'est le « pin ».
    freq: DOOR_CHIME_HIGH_HZ,
    hold: 0.155,
    release: 0.075,
    gain: 0.88,
    partials: [
      { ratio: 1, amp: 0.78, decay: 0.05, sustain: 0.9 },
      { ratio: 2.01, amp: 0.18, decay: 0.09, sustain: 0.28 },
      { ratio: 3.97, amp: 0.065, decay: 0.06, sustain: 0.12 },
    ],
  },
  {
    // Le grave : plus long, plus rond, plus stable. C'est le « pōn ».
    freq: DOOR_CHIME_LOW_HZ,
    hold: 0.285,
    release: 0.105,
    gain: 1,
    partials: [
      { ratio: 1, amp: 0.84, decay: 0.06, sustain: 0.93 },
      { ratio: 2, amp: 0.14, decay: 0.11, sustain: 0.32 },
      { ratio: 3.98, amp: 0.04, decay: 0.07, sustain: 0.14 },
    ],
  },
];

/** Empan audible d'un son : tenue + relâchement (s). */
export const doorChimeToneSpan = (tone: DoorChimeTone): number => tone.hold + tone.release;

/** Empan audible d'une paire, du « pin » à l'extinction du « pōn » (≈ 0,56 s). */
export const DOOR_CHIME_PAIR_SPAN =
  DOOR_CHIME_LOW_OFFSET + doorChimeToneSpan(DOOR_CHIME_TONES[1]);

/**
 * Silence entre l'extinction d'une paire et l'attaque de la suivante (≈ 0,26 s).
 *
 * Il compte autant que les sons : enchaînées, les trois paires s'entendraient
 * comme une alarme ; c'est cette respiration qui les tient en signal
 * d'information.
 */
export const DOOR_CHIME_GAP = DOOR_CHIME_PAIR_STEP - DOOR_CHIME_PAIR_SPAN;

/**
 * Durée du signal entier (≈ 2,2 s), dernier relâchement compris.
 *
 * Il n'y a pas de quatrième paire, et rien ne traîne derrière : le carillon
 * s'arrête net, les portes finissent leur course en silence.
 */
export const DOOR_CHIME_DURATION = (DOOR_CHIME_PAIRS - 1) * DOOR_CHIME_PAIR_STEP + DOOR_CHIME_PAIR_SPAN;

export interface DoorChimeEvent {
  /** Instant de l'attaque, depuis le début du signal (s). */
  at: number;
  /** Rang dans DOOR_CHIME_TONES : 0 = aigu, 1 = grave. */
  tone: number;
  /** Rang de la paire (0..2). */
  pair: number;
}

/**
 * La partition, son par son, dans l'ordre.
 *
 * Les trois paires sont RIGOUREUSEMENT identiques - mêmes hauteurs, mêmes
 * durées, même niveau. Ni crescendo ni diminuendo : une porte qui s'ouvre ne
 * raconte rien, elle prévient.
 */
export function doorChimeScore(): DoorChimeEvent[] {
  const events: DoorChimeEvent[] = [];
  for (let pair = 0; pair < DOOR_CHIME_PAIRS; pair++) {
    const at = pair * DOOR_CHIME_PAIR_STEP;
    events.push({ at, tone: 0, pair });
    events.push({ at: at + DOOR_CHIME_LOW_OFFSET, tone: 1, pair });
  }
  return events;
}
