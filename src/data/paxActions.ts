// Catalogue des occupations ambiantes des PNJ (rame + quai).
// Les 7 actions historiques (none / look / phone / doze / stare / chat / sneeze)
// restent ; le reste est une couche de vie silencieuse — gestes, regards,
// échanges à deux — sans dialogue ni UI.
//
// Trois familles, et c'est ce découpage qui donne le RYTHME (voir
// systems/paxBehavior) :
//
// - Les OCCUPATIONS DE FOND (`anchor`) : ce qu'on fait vraiment dans un train.
//   Un voyageur qui sort son téléphone y reste deux ou trois minutes, pas sept
//   secondes ; celui qui dort dort jusqu'à sa gare. Elles durent des minutes et
//   sont REPRISES après chaque interruption.
// - Les GESTES BREFS : bâillement, lunettes remontées, coup d'œil à la montre.
//   Ils s'insèrent dans une occupation de fond et la rendent à son propriétaire.
// - Les ÉVÉNEMENTS RARES (`rare`) : disputes, bagarres, chutes, séduction. Ils
//   passent par un budget global (au plus un toutes les quelques minutes, une
//   bagarre à peine une fois par tour de boucle) — sans quoi le wagon devient
//   un ring, ce qui n'arrive pas sur la Yamanote.

import type { Archetype } from '../systems/appearance';

/** Occupations d'un voyageur de rame (et, pour une partie, du quai). */
export type PaxAction =
  // Historiques (conservées).
  | 'none'
  | 'look'
  | 'phone'
  | 'doze'
  | 'stare'
  | 'chat'
  | 'sneeze'
  // Solo — micro-gestes.
  | 'yawn'
  | 'stretch'
  | 'cough'
  | 'scratchHead'
  | 'adjustMask'
  | 'fixBag'
  | 'checkWatch'
  | 'windowGaze'
  | 'nodMusic'
  | 'fidget'
  | 'rubEyes'
  | 'sigh'
  | 'neckRoll'
  | 'leanPillar'
  | 'shiftWeight'
  | 'tapFoot'
  | 'read'
  | 'eat'
  | 'drink'
  | 'fanSelf'
  | 'wipeFace'
  | 'earbudAdjust'
  | 'mapCheck'
  | 'ticketGlance'
  | 'rummageBag'
  | 'photoSnap'
  | 'stretchLegs'
  | 'crossArms'
  | 'bounceKnee'
  | 'crackNeck'
  | 'adjustGlasses'
  | 'sniffle'
  | 'hum'
  | 'restChin'
  | 'tieLace'
  | 'buttonCoat'
  | 'shrug'
  | 'rollShoulders'
  | 'lookCeiling'
  | 'lookFloor'
  | 'sway'
  /** Faux pas : perd l'équilibre puis se rattrape. */
  | 'stumble'
  /** Tombe vraiment au sol, reste un instant, se relève (rare, comique). */
  | 'fall'
  /** Glissade sur le quai. */
  | 'slip'
  // Drama / émotions visibles.
  | 'argue'
  | 'fight'
  | 'jealous'
  | 'angry'
  | 'scold'
  | 'shove'
  | 'flirt'
  | 'sulk'
  | 'gasp'
  | 'facepalm'
  // Sociales / à deux.
  | 'whisper'
  | 'laugh'
  | 'pointWindow'
  | 'sharePhone'
  | 'coupleLean'
  | 'gossip'
  | 'greetBow'
  | 'offerSeat'
  | 'sideChat'
  | 'nodAgree'
  // Avec / autour du joueur.
  | 'curiousGlance'
  | 'avoidGaze'
  | 'politeNod'
  | 'doubleTake'
  | 'watchDoor'
  | 'glanceBoarding'
  /** Parle AU joueur (systems/conversation) : se tourne vers lui et s'adresse à lui. */
  | 'talkPlayer'
  // Quai (réutilisées aussi en rame quand pertinent).
  | 'lookBoard'
  | 'lookTracks'
  | 'queueShuffle'
  | 'waveTrain'
  | 'stepBack'
  | 'checkTime'
  | 'bagAtFeet'
  | 'paceInPlace';

export type ActionWhere = 'seated' | 'standing' | 'waiting';
export type ActionKind = 'solo' | 'pair' | 'player';

/**
 * Familles d'événements rares, chacune avec son propre budget de temps
 * (systems/paxBehavior). Une dispute n'épuise pas le quota des chutes.
 */
export type RareKind = 'drama' | 'fight' | 'fall' | 'balance' | 'flirt' | 'comic' | 'mood';

export type MotionId =
  | 'idle'
  | 'look'
  | 'phone'
  | 'doze'
  | 'stare'
  | 'chat'
  | 'sneeze'
  | 'yawn'
  | 'stretch'
  | 'cough'
  | 'scratch'
  | 'adjust'
  /** Sangle de sac remontée sur l'épaule (distinct du masque : autre bras). */
  | 'bag'
  | 'watch'
  | 'window'
  | 'music'
  | 'fidget'
  | 'rubEyes'
  | 'sigh'
  | 'neckRoll'
  | 'lean'
  | 'shift'
  | 'tap'
  | 'read'
  | 'eat'
  | 'drink'
  | 'fan'
  | 'wipe'
  | 'earbud'
  | 'map'
  | 'ticket'
  | 'rummage'
  | 'photo'
  | 'legs'
  | 'crossArms'
  | 'bounce'
  | 'crack'
  | 'glasses'
  | 'sniffle'
  | 'hum'
  | 'chin'
  | 'tie'
  | 'button'
  | 'shrug'
  | 'shoulders'
  | 'ceiling'
  | 'floor'
  | 'sway'
  | 'stumble'
  | 'fall'
  | 'slip'
  | 'argue'
  | 'fight'
  | 'jealous'
  | 'angry'
  | 'scold'
  | 'shove'
  | 'flirt'
  | 'sulk'
  | 'gasp'
  | 'facepalm'
  | 'whisper'
  | 'laugh'
  | 'point'
  | 'share'
  | 'couple'
  | 'gossip'
  | 'bow'
  | 'offer'
  | 'sideChat'
  | 'agree'
  | 'curious'
  | 'avoid'
  | 'polite'
  | 'doubleTake'
  | 'door'
  | 'boarding'
  | 'talk'
  | 'board'
  | 'tracks'
  | 'queue'
  | 'wave'
  | 'stepBack'
  | 'checkTime'
  | 'bagFeet'
  | 'pace';

export interface PaxActionDef {
  id: PaxAction;
  /** Poids relatif dans le tirage. */
  weight: number;
  kind: ActionKind;
  /** Postures autorisées. */
  where: readonly ActionWhere[];
  /** Durée [min, max] en secondes. */
  dur: readonly [number, number];
  motion: MotionId;
  /**
   * Occupation de fond : tirée dans son propre lot, tient des minutes, et
   * reprend là où elle en était après un geste bref.
   */
  anchor?: boolean;
  /** Événement rare, soumis à un budget global partagé. */
  rare?: RareKind;
  /** Geste ample : impossible dans une rame bondée (bras au corps). */
  needsRoom?: boolean;
  /** Afficher le téléphone (ou un objet tenu similaire). */
  handProp?: 'phone' | 'book' | 'bottle' | 'map' | 'ticket';
  /** Archetypes favorisés (poids × boost si match). */
  archetypes?: readonly Archetype[];
  archetypeBoost?: number;
  /** Distance max au joueur pour kind === 'player'. */
  playerDist?: number;
  /** Distance max partenaire pour kind === 'pair'. */
  partnerDist?: number;
  /** Exige un masque / lunettes / sac pour démarrer. */
  needsMask?: boolean;
  needsGlasses?: boolean;
  needsBag?: boolean;
}

/** Actions qui occupent un partenaire (à libérer ensemble). */
export const PAIR_ACTIONS: ReadonlySet<PaxAction> = new Set([
  'chat',
  'whisper',
  'laugh',
  'pointWindow',
  'sharePhone',
  'coupleLean',
  'gossip',
  'sideChat',
  'nodAgree',
  'argue',
  'fight',
  'jealous',
  'scold',
  'shove',
  'flirt',
]);

/** Gestes brefs : un voisin en train de les faire n'est pas un bon partenaire. */
export const BUSY_BRIEF: ReadonlySet<PaxAction> = new Set([
  'sneeze',
  'cough',
  'yawn',
  'stretch',
  'greetBow',
  'offerSeat',
  'doubleTake',
  'waveTrain',
  'stumble',
  'fall',
  'slip',
  'shove',
  'gasp',
  'facepalm',
  'talkPlayer',
]);

/** Occupations qui font perdre la poignée / le contrôle du corps. */
export function isFallingAction(a: PaxAction): boolean {
  return a === 'fall' || a === 'stumble' || a === 'slip';
}

/** Scènes dramatiques (bagarre, dispute…) — motions plus amples. */
export function isDramaAction(a: PaxAction): boolean {
  return (
    a === 'argue' ||
    a === 'fight' ||
    a === 'jealous' ||
    a === 'angry' ||
    a === 'scold' ||
    a === 'shove' ||
    a === 'sulk' ||
    a === 'gasp' ||
    a === 'facepalm' ||
    a === 'flirt'
  );
}

export function isPairAction(a: PaxAction): boolean {
  return PAIR_ACTIONS.has(a);
}

export function actionShowsPhone(a: PaxAction): boolean {
  const d = ACTION_BY_ID.get(a);
  return d?.handProp === 'phone' || d?.handProp === 'map' || a === 'sharePhone';
}

export function actionShowsBook(a: PaxAction): boolean {
  return ACTION_BY_ID.get(a)?.handProp === 'book';
}

export function actionShowsBottle(a: PaxAction): boolean {
  return ACTION_BY_ID.get(a)?.handProp === 'bottle';
}

/**
 * Catalogue complet.
 *
 * Les poids se lisent PAR FAMILLE, pas les uns contre les autres : les
 * occupations de fond (`anchor`) sont tirées entre elles quand un voyageur
 * choisit ce qu'il va faire des prochaines minutes, les gestes brefs entre eux
 * quand il s'interrompt. Un téléphone à 105 face à un livre à 16 dit donc « sur
 * dix personnes occupées, une lit » — et non « un geste sur dix est une page
 * tournée ».
 */
export const PAX_ACTIONS: readonly PaxActionDef[] = [
  // ——— Historiques ———
  {
    id: 'chat',
    weight: 26,
    kind: 'pair',
    where: ['seated', 'standing'],
    dur: [30, 120],
    motion: 'chat',
    anchor: true,
    partnerDist: 1.85,
  },
  {
    id: 'stare',
    weight: 2.5,
    kind: 'player',
    where: ['seated', 'standing'],
    dur: [1.2, 3.2],
    motion: 'stare',
    playerDist: 3.6,
  },
  {
    id: 'phone',
    weight: 105,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [50, 210],
    motion: 'phone',
    anchor: true,
    handProp: 'phone',
  },
  {
    id: 'doze',
    weight: 30,
    kind: 'solo',
    where: ['seated'],
    dur: [60, 300],
    motion: 'doze',
    anchor: true,
    archetypes: ['senior', 'salaryman'],
    archetypeBoost: 1.3,
  },
  {
    id: 'sneeze',
    weight: 1.6,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [0.9, 0.9],
    motion: 'sneeze',
  },
  {
    id: 'look',
    weight: 22,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 3.5],
    motion: 'look',
  },
  {
    // Regarder dans le vide : de loin l'occupation la plus honnête d'un wagon.
    id: 'none',
    weight: 34,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [10, 45],
    motion: 'idle',
    anchor: true,
  },

  // ——— Solo micro-gestes ———
  {
    id: 'yawn',
    weight: 4.5,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.6, 2.4],
    motion: 'yawn',
  },
  {
    id: 'stretch',
    weight: 1.6,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2.2, 3.8],
    motion: 'stretch',
    needsRoom: true,
  },
  {
    id: 'cough',
    weight: 3.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [0.7, 1.1],
    motion: 'cough',
  },
  {
    id: 'scratchHead',
    weight: 3.4,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.2, 2.5],
    motion: 'scratch',
  },
  {
    id: 'adjustMask',
    weight: 3.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.4, 2.8],
    motion: 'adjust',
    needsMask: true,
  },
  {
    id: 'fixBag',
    weight: 3.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2.0, 4.5],
    motion: 'bag',
    needsBag: true,
  },
  {
    id: 'checkWatch',
    weight: 4.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 3.0],
    motion: 'watch',
    archetypes: ['salaryman', 'officeLady'],
    archetypeBoost: 1.5,
  },
  {
    id: 'windowGaze',
    weight: 34,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [25, 110],
    motion: 'window',
    anchor: true,
  },
  {
    id: 'nodMusic',
    weight: 24,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [40, 180],
    motion: 'music',
    anchor: true,
    archetypes: ['student', 'casual'],
    archetypeBoost: 1.6,
  },
  {
    id: 'fidget',
    weight: 5.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 9],
    motion: 'fidget',
  },
  {
    id: 'rubEyes',
    weight: 3.0,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [1.5, 3.0],
    motion: 'rubEyes',
  },
  {
    id: 'sigh',
    weight: 3.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.8, 3.2],
    motion: 'sigh',
  },
  {
    id: 'neckRoll',
    weight: 2.6,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2.5, 4.5],
    motion: 'neckRoll',
  },
  {
    id: 'leanPillar',
    weight: 12,
    kind: 'solo',
    where: ['standing'],
    dur: [15, 60],
    motion: 'lean',
    anchor: true,
  },
  {
    id: 'shiftWeight',
    weight: 6.0,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [2, 5],
    motion: 'shift',
  },
  {
    id: 'tapFoot',
    weight: 3.4,
    kind: 'solo',
    where: ['standing', 'waiting', 'seated'],
    dur: [3, 8],
    motion: 'tap',
  },
  {
    id: 'read',
    weight: 16,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [60, 240],
    motion: 'read',
    anchor: true,
    handProp: 'book',
    archetypes: ['salaryman', 'officeLady', 'senior'],
    archetypeBoost: 1.5,
  },
  {
    // Manger dans la rame ne se fait pas vraiment : un onigiri à quai, à la
    // rigueur, et surtout le soir.
    id: 'eat',
    weight: 1.2,
    kind: 'solo',
    where: ['seated', 'waiting'],
    dur: [10, 30],
    motion: 'eat',
    anchor: true,
  },
  {
    id: 'drink',
    weight: 2.6,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2.5, 5],
    motion: 'drink',
    handProp: 'bottle',
  },
  {
    id: 'fanSelf',
    weight: 2.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 7],
    motion: 'fan',
    needsRoom: true,
  },
  {
    id: 'wipeFace',
    weight: 2.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 3],
    motion: 'wipe',
  },
  {
    id: 'earbudAdjust',
    weight: 3.6,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 3.5],
    motion: 'earbud',
    archetypes: ['student', 'casual'],
    archetypeBoost: 1.7,
  },
  {
    id: 'mapCheck',
    weight: 4.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [15, 45],
    motion: 'map',
    anchor: true,
    handProp: 'map',
    archetypes: ['tourist'],
    archetypeBoost: 3.0,
  },
  {
    id: 'ticketGlance',
    weight: 2.6,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [1.5, 3.5],
    motion: 'ticket',
    handProp: 'ticket',
  },
  {
    id: 'rummageBag',
    weight: 3.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 7],
    motion: 'rummage',
    needsBag: true,
  },
  {
    id: 'photoSnap',
    weight: 1.6,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [2, 4],
    motion: 'photo',
    handProp: 'phone',
    archetypes: ['tourist'],
    archetypeBoost: 2.8,
  },
  {
    id: 'stretchLegs',
    weight: 2.4,
    kind: 'solo',
    where: ['seated'],
    dur: [3, 6],
    motion: 'legs',
    needsRoom: true,
  },
  {
    id: 'crossArms',
    weight: 14,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [20, 70],
    motion: 'crossArms',
    anchor: true,
  },
  {
    id: 'bounceKnee',
    weight: 8.0,
    kind: 'solo',
    where: ['seated'],
    dur: [10, 40],
    motion: 'bounce',
    anchor: true,
    archetypes: ['student'],
    archetypeBoost: 1.5,
  },
  {
    id: 'crackNeck',
    weight: 1.8,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [1.2, 2.2],
    motion: 'crack',
  },
  {
    id: 'adjustGlasses',
    weight: 2.8,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.2, 2.5],
    motion: 'glasses',
    needsGlasses: true,
  },
  {
    id: 'sniffle',
    weight: 2.4,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [0.8, 1.4],
    motion: 'sniffle',
  },
  {
    id: 'hum',
    weight: 2.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [4, 9],
    motion: 'hum',
  },
  {
    id: 'restChin',
    weight: 10,
    kind: 'solo',
    where: ['seated'],
    dur: [20, 80],
    motion: 'chin',
    anchor: true,
  },
  {
    id: 'tieLace',
    weight: 0.9,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [3, 5],
    motion: 'tie',
    needsRoom: true,
  },
  {
    id: 'buttonCoat',
    weight: 1.4,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [2, 4],
    motion: 'button',
  },
  {
    id: 'shrug',
    weight: 1.6,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.0, 1.8],
    motion: 'shrug',
  },
  {
    id: 'rollShoulders',
    weight: 2.4,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2, 4],
    motion: 'shoulders',
  },
  {
    id: 'lookCeiling',
    weight: 2.0,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2, 5],
    motion: 'ceiling',
  },
  {
    id: 'lookFloor',
    weight: 12,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [8, 30],
    motion: 'floor',
    anchor: true,
  },
  {
    id: 'sway',
    weight: 8.0,
    kind: 'solo',
    where: ['standing'],
    dur: [10, 40],
    motion: 'sway',
    anchor: true,
  },
  {
    id: 'stumble',
    weight: 0.9,
    kind: 'solo',
    where: ['standing'],
    dur: [1.6, 2.4],
    motion: 'stumble',
    rare: 'balance',
  },
  {
    id: 'fall',
    weight: 0.35,
    kind: 'solo',
    where: ['standing'],
    dur: [4.2, 5.8],
    motion: 'fall',
    rare: 'fall',
  },
  {
    id: 'slip',
    weight: 0.4,
    kind: 'solo',
    where: ['waiting'],
    dur: [1.8, 2.8],
    motion: 'slip',
    rare: 'fall',
  },

  // ——— Drama : spectaculaire, donc rationné (voir systems/paxBehavior) ———
  {
    id: 'argue',
    weight: 0.9,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [6, 14],
    motion: 'argue',
    rare: 'drama',
    partnerDist: 1.55,
  },
  {
    id: 'fight',
    weight: 0.25,
    kind: 'pair',
    where: ['standing'],
    dur: [4, 7],
    motion: 'fight',
    rare: 'fight',
    partnerDist: 1.15,
  },
  {
    id: 'jealous',
    weight: 0.5,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [4, 9],
    motion: 'jealous',
    rare: 'drama',
    partnerDist: 1.7,
  },
  {
    id: 'angry',
    weight: 0.8,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2.5, 5],
    motion: 'angry',
    rare: 'drama',
  },
  {
    id: 'scold',
    weight: 0.6,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 7],
    motion: 'scold',
    rare: 'drama',
    partnerDist: 1.4,
  },
  {
    id: 'shove',
    weight: 0.4,
    kind: 'pair',
    where: ['standing', 'waiting'],
    dur: [1.4, 2.2],
    motion: 'shove',
    rare: 'drama',
    partnerDist: 1.1,
  },
  {
    id: 'flirt',
    weight: 0.9,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [8, 20],
    motion: 'flirt',
    rare: 'flirt',
    partnerDist: 1.45,
  },
  {
    id: 'sulk',
    weight: 1.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [6, 18],
    motion: 'sulk',
    rare: 'mood',
  },
  {
    id: 'gasp',
    weight: 1.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [0.8, 1.4],
    motion: 'gasp',
    rare: 'comic',
  },
  {
    id: 'facepalm',
    weight: 1.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2, 4],
    motion: 'facepalm',
    rare: 'comic',
  },

  // ——— Sociales ———
  {
    id: 'whisper',
    weight: 5.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [20, 70],
    motion: 'whisper',
    anchor: true,
    partnerDist: 1.35,
  },
  {
    id: 'laugh',
    weight: 3.5,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 6],
    motion: 'laugh',
    partnerDist: 1.65,
  },
  {
    id: 'pointWindow',
    weight: 2.0,
    kind: 'pair',
    where: ['seated', 'standing'],
    dur: [4, 9],
    motion: 'point',
    partnerDist: 1.5,
  },
  {
    id: 'sharePhone',
    weight: 3.5,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [20, 80],
    motion: 'share',
    anchor: true,
    handProp: 'phone',
    partnerDist: 1.2,
  },
  {
    id: 'coupleLean',
    weight: 4.0,
    kind: 'pair',
    where: ['seated', 'standing'],
    dur: [30, 150],
    motion: 'couple',
    anchor: true,
    partnerDist: 1.05,
  },
  {
    id: 'gossip',
    weight: 7.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [30, 120],
    motion: 'gossip',
    anchor: true,
    partnerDist: 1.55,
  },
  {
    id: 'greetBow',
    weight: 1.2,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [1.2, 2.0],
    motion: 'bow',
  },
  {
    id: 'offerSeat',
    weight: 0.8,
    kind: 'solo',
    where: ['seated'],
    dur: [2.5, 4.5],
    motion: 'offer',
    archetypes: ['senior', 'salaryman', 'officeLady'],
    archetypeBoost: 1.3,
  },
  {
    id: 'sideChat',
    weight: 8.0,
    kind: 'pair',
    where: ['standing', 'waiting'],
    dur: [25, 110],
    motion: 'sideChat',
    anchor: true,
    partnerDist: 1.45,
  },
  {
    id: 'nodAgree',
    weight: 3.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 7],
    motion: 'agree',
    partnerDist: 1.6,
  },

  // ——— Joueur ———
  {
    id: 'curiousGlance',
    weight: 3.0,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.2, 2.8],
    motion: 'curious',
    playerDist: 3.4,
  },
  {
    id: 'avoidGaze',
    weight: 2.2,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [2, 4],
    motion: 'avoid',
    playerDist: 2.0,
  },
  {
    id: 'politeNod',
    weight: 1.2,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.0, 1.8],
    motion: 'polite',
    playerDist: 2.4,
  },
  {
    id: 'doubleTake',
    weight: 0.8,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 2.5],
    motion: 'doubleTake',
    playerDist: 2.8,
  },
  {
    id: 'watchDoor',
    weight: 4.0,
    kind: 'solo',
    where: ['standing', 'seated', 'waiting'],
    dur: [3, 8],
    motion: 'door',
  },
  {
    id: 'glanceBoarding',
    weight: 3.0,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2, 5],
    motion: 'boarding',
  },
  {
    // Jamais tirée au sort : posée par systems/conversation quand un PNJ
    // s'adresse au joueur. Poids nul pour rester hors du hasard.
    id: 'talkPlayer',
    weight: 0,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 6],
    motion: 'talk',
    playerDist: 3.0,
  },

  // ——— Quai ———
  {
    id: 'lookBoard',
    weight: 6.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [2.5, 6],
    motion: 'board',
  },
  {
    id: 'lookTracks',
    weight: 9.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [6, 20],
    motion: 'tracks',
    anchor: true,
  },
  {
    id: 'queueShuffle',
    weight: 3.5,
    kind: 'solo',
    where: ['waiting'],
    dur: [1.5, 3.5],
    motion: 'queue',
  },
  {
    id: 'waveTrain',
    weight: 0.6,
    kind: 'solo',
    where: ['waiting'],
    dur: [1.5, 3],
    motion: 'wave',
  },
  {
    id: 'stepBack',
    weight: 2.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [1.2, 2.5],
    motion: 'stepBack',
  },
  {
    id: 'checkTime',
    weight: 4.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [1.5, 3],
    motion: 'checkTime',
  },
  {
    id: 'bagAtFeet',
    weight: 4.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [10, 40],
    motion: 'bagFeet',
    anchor: true,
    needsBag: true,
  },
  {
    id: 'paceInPlace',
    weight: 4.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [6, 20],
    motion: 'pace',
    anchor: true,
  },
];

export const ACTION_BY_ID: ReadonlyMap<PaxAction, PaxActionDef> = new Map(
  PAX_ACTIONS.map((d) => [d.id, d]),
);

/** Occupation de fond : dure des minutes et se reprend après un geste bref. */
export function isAnchorAction(a: PaxAction): boolean {
  return ACTION_BY_ID.get(a)?.anchor === true;
}
