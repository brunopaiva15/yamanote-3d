// Catalogue des occupations ambiantes des PNJ (rame + quai).
// Les 7 actions historiques (none / look / phone / doze / stare / chat / sneeze)
// restent ; le reste est une couche de vie silencieuse — gestes, regards,
// échanges à deux — sans dialogue ni UI.

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
  /** Poids relatif dans le tirage (les historiques gardent leur densité). */
  weight: number;
  kind: ActionKind;
  /** Postures autorisées. */
  where: readonly ActionWhere[];
  /** Durée [min, max] en secondes. */
  dur: readonly [number, number];
  motion: MotionId;
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

/** Catalogue complet : historiques d'abord, puis les nouvelles couches. */
export const PAX_ACTIONS: readonly PaxActionDef[] = [
  // ——— Historiques (poids calés pour un wagon vivant, pas une salle d'attente) ———
  {
    id: 'chat',
    weight: 22,
    kind: 'pair',
    where: ['seated', 'standing'],
    dur: [4, 9],
    motion: 'chat',
    partnerDist: 1.6,
  },
  {
    id: 'stare',
    weight: 10,
    kind: 'player',
    where: ['seated', 'standing'],
    dur: [1.2, 3.2],
    motion: 'stare',
    playerDist: 4.2,
  },
  {
    id: 'phone',
    weight: 10,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 7],
    motion: 'phone',
    handProp: 'phone',
  },
  {
    id: 'doze',
    weight: 5,
    kind: 'solo',
    where: ['seated'],
    dur: [5, 10],
    motion: 'doze',
    archetypes: ['senior', 'salaryman'],
    archetypeBoost: 1.3,
  },
  {
    id: 'sneeze',
    weight: 5,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [0.9, 0.9],
    motion: 'sneeze',
  },
  {
    id: 'look',
    weight: 12,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 3.5],
    motion: 'look',
  },
  {
    id: 'none',
    weight: 4,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1, 2.5],
    motion: 'idle',
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
    weight: 3.2,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2.2, 3.8],
    motion: 'stretch',
  },
  {
    id: 'cough',
    weight: 3.5,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [0.7, 1.1],
    motion: 'cough',
  },
  {
    id: 'scratchHead',
    weight: 3.8,
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
    weight: 3.4,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2.0, 4.5],
    motion: 'adjust',
    needsBag: true,
  },
  {
    id: 'checkWatch',
    weight: 4.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 3.0],
    motion: 'watch',
    archetypes: ['salaryman', 'officeLady'],
    archetypeBoost: 1.5,
  },
  {
    id: 'windowGaze',
    weight: 5.5,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [4, 12],
    motion: 'window',
  },
  {
    id: 'nodMusic',
    weight: 4.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [5, 14],
    motion: 'music',
    archetypes: ['student', 'casual'],
    archetypeBoost: 1.6,
  },
  {
    id: 'fidget',
    weight: 4.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 7],
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
    weight: 3.5,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.8, 3.2],
    motion: 'sigh',
  },
  {
    id: 'neckRoll',
    weight: 3.2,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2.5, 4.5],
    motion: 'neckRoll',
  },
  {
    id: 'leanPillar',
    weight: 4.5,
    kind: 'solo',
    where: ['standing'],
    dur: [6, 16],
    motion: 'lean',
  },
  {
    id: 'shiftWeight',
    weight: 4.0,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [2, 5],
    motion: 'shift',
  },
  {
    id: 'tapFoot',
    weight: 3.6,
    kind: 'solo',
    where: ['standing', 'waiting', 'seated'],
    dur: [3, 8],
    motion: 'tap',
  },
  {
    id: 'read',
    weight: 4.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [8, 20],
    motion: 'read',
    handProp: 'book',
    archetypes: ['salaryman', 'officeLady', 'senior'],
    archetypeBoost: 1.5,
  },
  {
    id: 'eat',
    weight: 2.2,
    kind: 'solo',
    where: ['seated', 'waiting'],
    dur: [4, 10],
    motion: 'eat',
  },
  {
    id: 'drink',
    weight: 3.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2.5, 5],
    motion: 'drink',
    handProp: 'bottle',
  },
  {
    id: 'fanSelf',
    weight: 2.5,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 7],
    motion: 'fan',
  },
  {
    id: 'wipeFace',
    weight: 2.4,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 3],
    motion: 'wipe',
  },
  {
    id: 'earbudAdjust',
    weight: 3.8,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 3.5],
    motion: 'earbud',
    archetypes: ['student', 'casual'],
    archetypeBoost: 1.7,
  },
  {
    id: 'mapCheck',
    weight: 3.5,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [4, 10],
    motion: 'map',
    handProp: 'map',
    archetypes: ['tourist'],
    archetypeBoost: 3.0,
  },
  {
    id: 'ticketGlance',
    weight: 3.0,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [1.5, 3.5],
    motion: 'ticket',
    handProp: 'ticket',
  },
  {
    id: 'rummageBag',
    weight: 3.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 7],
    motion: 'rummage',
    needsBag: true,
  },
  {
    id: 'photoSnap',
    weight: 2.0,
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
    weight: 3.0,
    kind: 'solo',
    where: ['seated'],
    dur: [3, 6],
    motion: 'legs',
  },
  {
    id: 'crossArms',
    weight: 3.5,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [5, 14],
    motion: 'crossArms',
  },
  {
    id: 'bounceKnee',
    weight: 3.2,
    kind: 'solo',
    where: ['seated'],
    dur: [4, 10],
    motion: 'bounce',
    archetypes: ['student'],
    archetypeBoost: 1.5,
  },
  {
    id: 'crackNeck',
    weight: 2.5,
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
    weight: 2.6,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [0.8, 1.4],
    motion: 'sniffle',
  },
  {
    id: 'hum',
    weight: 2.8,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [4, 9],
    motion: 'hum',
  },
  {
    id: 'restChin',
    weight: 3.5,
    kind: 'solo',
    where: ['seated'],
    dur: [5, 12],
    motion: 'chin',
  },
  {
    id: 'tieLace',
    weight: 1.5,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [3, 5],
    motion: 'tie',
  },
  {
    id: 'buttonCoat',
    weight: 2.0,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [2, 4],
    motion: 'button',
  },
  {
    id: 'shrug',
    weight: 2.2,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.0, 1.8],
    motion: 'shrug',
  },
  {
    id: 'rollShoulders',
    weight: 2.8,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2, 4],
    motion: 'shoulders',
  },
  {
    id: 'lookCeiling',
    weight: 2.5,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2, 5],
    motion: 'ceiling',
  },
  {
    id: 'lookFloor',
    weight: 3.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2, 6],
    motion: 'floor',
  },
  {
    id: 'sway',
    weight: 3.5,
    kind: 'solo',
    where: ['standing'],
    dur: [4, 10],
    motion: 'sway',
  },
  {
    id: 'stumble',
    weight: 2.2,
    kind: 'solo',
    where: ['standing'],
    dur: [1.6, 2.4],
    motion: 'stumble',
  },
  {
    id: 'fall',
    weight: 1.0,
    kind: 'solo',
    where: ['standing'],
    dur: [4.2, 5.8],
    motion: 'fall',
  },
  {
    id: 'slip',
    weight: 1.2,
    kind: 'solo',
    where: ['waiting'],
    dur: [1.8, 2.8],
    motion: 'slip',
  },

  // ——— Drama (gestes amples, bien visibles) ———
  {
    id: 'argue',
    weight: 7.5,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [4, 8],
    motion: 'argue',
    partnerDist: 1.55,
  },
  {
    id: 'fight',
    weight: 4.5,
    kind: 'pair',
    where: ['standing'],
    dur: [3.5, 6],
    motion: 'fight',
    partnerDist: 1.15,
  },
  {
    id: 'jealous',
    weight: 5.5,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [3.5, 7],
    motion: 'jealous',
    partnerDist: 1.7,
  },
  {
    id: 'angry',
    weight: 6.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2.5, 5],
    motion: 'angry',
  },
  {
    id: 'scold',
    weight: 5.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 6],
    motion: 'scold',
    partnerDist: 1.4,
  },
  {
    id: 'shove',
    weight: 3.5,
    kind: 'pair',
    where: ['standing', 'waiting'],
    dur: [1.4, 2.2],
    motion: 'shove',
    partnerDist: 1.1,
  },
  {
    id: 'flirt',
    weight: 5.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [4, 9],
    motion: 'flirt',
    partnerDist: 1.25,
  },
  {
    id: 'sulk',
    weight: 4.5,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 6],
    motion: 'sulk',
  },
  {
    id: 'gasp',
    weight: 3.5,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [0.8, 1.4],
    motion: 'gasp',
  },
  {
    id: 'facepalm',
    weight: 4.0,
    kind: 'solo',
    where: ['seated', 'standing', 'waiting'],
    dur: [2, 4],
    motion: 'facepalm',
  },

  // ——— Sociales ———
  {
    id: 'whisper',
    weight: 8.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [4, 9],
    motion: 'whisper',
    partnerDist: 1.25,
  },
  {
    id: 'laugh',
    weight: 7.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [2.5, 5],
    motion: 'laugh',
    partnerDist: 1.5,
  },
  {
    id: 'pointWindow',
    weight: 2.8,
    kind: 'pair',
    where: ['seated', 'standing'],
    dur: [4, 9],
    motion: 'point',
    partnerDist: 1.5,
  },
  {
    id: 'sharePhone',
    weight: 3.2,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [5, 12],
    motion: 'share',
    handProp: 'phone',
    partnerDist: 1.2,
  },
  {
    id: 'coupleLean',
    weight: 2.5,
    kind: 'pair',
    where: ['seated', 'standing'],
    dur: [8, 18],
    motion: 'couple',
    partnerDist: 0.95,
  },
  {
    id: 'gossip',
    weight: 4.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [7, 16],
    motion: 'gossip',
    partnerDist: 1.35,
  },
  {
    id: 'greetBow',
    weight: 2.0,
    kind: 'solo',
    where: ['standing', 'waiting'],
    dur: [1.2, 2.0],
    motion: 'bow',
  },
  {
    id: 'offerSeat',
    weight: 1.8,
    kind: 'solo',
    where: ['seated'],
    dur: [2.5, 4.5],
    motion: 'offer',
    archetypes: ['senior', 'salaryman', 'officeLady'],
    archetypeBoost: 1.3,
  },
  {
    id: 'sideChat',
    weight: 4.5,
    kind: 'pair',
    where: ['standing', 'waiting'],
    dur: [6, 14],
    motion: 'sideChat',
    partnerDist: 1.25,
  },
  {
    id: 'nodAgree',
    weight: 3.0,
    kind: 'pair',
    where: ['seated', 'standing', 'waiting'],
    dur: [3, 6],
    motion: 'agree',
    partnerDist: 1.4,
  },

  // ——— Joueur ———
  {
    id: 'curiousGlance',
    weight: 5.0,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.2, 2.8],
    motion: 'curious',
    playerDist: 4.0,
  },
  {
    id: 'avoidGaze',
    weight: 4.0,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [2, 4],
    motion: 'avoid',
    playerDist: 2.2,
  },
  {
    id: 'politeNod',
    weight: 3.0,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.0, 1.8],
    motion: 'polite',
    playerDist: 2.8,
  },
  {
    id: 'doubleTake',
    weight: 2.5,
    kind: 'player',
    where: ['seated', 'standing', 'waiting'],
    dur: [1.5, 2.5],
    motion: 'doubleTake',
    playerDist: 3.2,
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
    weight: 3.5,
    kind: 'solo',
    where: ['seated', 'standing'],
    dur: [2, 5],
    motion: 'boarding',
  },

  // ——— Quai ———
  {
    id: 'lookBoard',
    weight: 5.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [2.5, 6],
    motion: 'board',
  },
  {
    id: 'lookTracks',
    weight: 5.5,
    kind: 'solo',
    where: ['waiting'],
    dur: [3, 8],
    motion: 'tracks',
  },
  {
    id: 'queueShuffle',
    weight: 4.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [1.5, 3.5],
    motion: 'queue',
  },
  {
    id: 'waveTrain',
    weight: 1.5,
    kind: 'solo',
    where: ['waiting'],
    dur: [1.5, 3],
    motion: 'wave',
  },
  {
    id: 'stepBack',
    weight: 2.5,
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
    weight: 3.0,
    kind: 'solo',
    where: ['waiting'],
    dur: [4, 10],
    motion: 'bagFeet',
    needsBag: true,
  },
  {
    id: 'paceInPlace',
    weight: 3.5,
    kind: 'solo',
    where: ['waiting'],
    dur: [3, 7],
    motion: 'pace',
  },
];

export const ACTION_BY_ID: ReadonlyMap<PaxAction, PaxActionDef> = new Map(
  PAX_ACTIONS.map((d) => [d.id, d]),
);

/** Nombre d'actions au-delà des 7 historiques. */
export const NEW_ACTION_COUNT = PAX_ACTIONS.length - 7;
