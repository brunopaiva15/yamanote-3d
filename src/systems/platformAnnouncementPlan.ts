// Ce que la gare VA dire pendant cette attente — décidé une fois, au début.
//
// Le quai parlait jusqu'ici comme une horloge : quatorze secondes après le
// départ d'une rame, l'annonce anticipée du prochain train, précédée du
// remerciement, à chaque tour, à chaque gare, quelle que soit l'heure et quel
// que soit le monde sur le quai. Deux messages d'agent suivaient, aux mêmes
// secondes, tirés dans l'ordre du numéro d'arrêt. À la troisième gare on
// connaissait la bande-son par cœur, et c'est exactement ce qu'un vrai quai
// n'est pas : ATOS saute l'anticipée quand les rames se succèdent, et l'agent
// de quai ne prend le micro que quand il a quelque chose à dire.
//
// Ce module décide donc, une seule fois par rame attendue : anticipée ou non,
// remerciement ou non, « laissez descendre » ou non, zéro, un ou deux messages
// d'agent et lesquels. Il est PUR — pas de store, pas d'audio, pas de
// Math.random() : le tirage entre par un argument, ce qui le rend testable et,
// surtout, reproductible (voir seededRandom). Le plan est ensuite gardé tel quel
// jusqu'au départ de la rame : rien ne se retire à la frame suivante parce que
// le hasard a changé d'avis.

import { isMajorHub } from '../data/announcements';
import type { LoopDirection } from '../data/platforms';
import {
  PLATFORM_AGENT_MESSAGES,
  type AgentMessageCategory,
} from '../data/stationAnnouncements';

/** Ce que la gare sait de la situation au moment de faire son plan. */
export interface PlatformAnnouncementContext {
  stationIndex: number;
  direction: LoopDirection;
  /** Creux jusqu'à la rame attendue (s) : c'est lui qui laisse ou non le temps. */
  headwaySeconds: number;
  /** Heure de Tokyo simulée, en heures décimales (8.5 = 8 h 30). */
  hour: number;
  /** Affluence normalisée, 0 = quai désert, 1 = quai bondé. */
  crowdLevel: number;
  /** La ligne accuse-t-elle du retard ? */
  delayed: boolean;
  /** Numéro d'arrêt : n'entre que dans la graine, pour que chaque rame diffère. */
  stopSequence: number;
}

export interface PlatformAnnouncementPlan {
  playGreeting: boolean;
  playPreAnnouncement: boolean;
  playAlightFirstMessage: boolean;
  /** Indices dans PLATFORM_AGENT_MESSAGES, dans l'ordre des créneaux. */
  agentMessages: number[];
}

// --- Heures de pointe -----------------------------------------------------
//
// Bornes propres à la sonorisation, volontairement plus serrées que celles du
// modèle de remplissage (data/occupancy.dayPeriod, qui ouvre la pointe du matin
// dès 6 h) : ce qui nous intéresse ici est le moment où le quai est réellement
// tenu par des agents et où les rames se succèdent, pas la montée du flux.

export const MORNING_PEAK_FROM = 7;
export const MORNING_PEAK_TO = 9.5;
export const EVENING_PEAK_FROM = 17;
export const EVENING_PEAK_TO = 19.5;

export function isPeakHour(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return (
    (h >= MORNING_PEAK_FROM && h < MORNING_PEAK_TO) ||
    (h >= EVENING_PEAK_FROM && h < EVENING_PEAK_TO)
  );
}

// --- Tirage déterministe --------------------------------------------------

/**
 * Générateur pseudo-aléatoire reproductible (mulberry32).
 *
 * Le plan doit survivre à tout ce qui peut relancer un calcul sans que la
 * situation ait changé : un rerender, une chute de FPS, un aller-retour entre le
 * quai et la rame. Avec une graine tirée de l'arrêt lui-même, le même arrêt
 * rend le même plan, et le suivant en rend un autre.
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s ^ (s >>> 15);
    t = Math.imul(t, t | 1);
    t = (t + (Math.imul(t ^ (t >>> 7), t | 61) ^ t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine d'un arrêt : la gare, la rame, le sens, la minute simulée. */
export function platformPlanSeed(context: PlatformAnnouncementContext): number {
  const parts = [
    context.stationIndex,
    context.stopSequence,
    context.direction === 'inner' ? 1 : 2,
    Math.floor(context.hour * 60),
  ];
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p & 0xffff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((p >>> 16) & 0xffff), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Annonce anticipée du prochain train ---------------------------------

/**
 * Probabilité de l'annonce anticipée, à peu près proportionnelle au temps
 * disponible : sous 90 s de creux, ATOS n'a pas de place pour elle et ne la dit
 * qu'un quart du temps ; passé deux minutes et demie, elle passe presque
 * toujours. La progression est continue, sans marche d'escalier entre les
 * paliers de référence (25 % / 55 % / 80 %).
 */
export function preAnnouncementChance(context: PlatformAnnouncementContext): number {
  const h = context.headwaySeconds;
  let p: number;
  if (h <= 90) p = 0.25;
  else if (h <= 150) p = 0.25 + ((h - 90) / 60) * 0.3;
  else if (h <= 210) p = 0.55 + ((h - 150) / 60) * 0.25;
  else p = 0.8;
  // Aux heures de pointe, les rames se suivent : l'anticipée est la première
  // chose que la gare laisse tomber quand la précédente vient à peine de partir.
  if (isPeakHour(context.hour) && h < 110) p *= 0.6;
  // Une grande gare annonce plus volontiers : il y a plus de monde à orienter,
  // et deux quais à distinguer.
  if (isMajorHub(context.stationIndex)) p += 0.05;
  // La gare a déjà une excuse de retard à faire dans ce creux : elle enchaîne
  // moins souvent sur l'anticipée (et le créneau, lui, est vérifié à la
  // diffusion — voir fitsBeforeCutoff).
  if (context.delayed) p *= 0.85;
  return clamp(p, 0.05, 0.9);
}

/**
 * Probabilité du remerciement devant l'anticipée. Il ne la précède plus
 * systématiquement : c'est une politesse de quai calme, celle d'un creux où la
 * gare a du temps. En pleine pointe, personne ne remercie qui que ce soit.
 */
export function greetingChance(context: PlatformAnnouncementContext): number {
  let p = 0.35;
  if (context.headwaySeconds > 150) p += 0.15;
  if (context.crowdLevel < 0.3) p += 0.1;
  if (isPeakHour(context.hour)) p *= 0.4;
  return clamp(p, 0.05, 0.6);
}

// --- « Laissez descendre » -----------------------------------------------

/**
 * Probabilité du 降りるお客さまを先に à l'ouverture des portes. Presque certain
 * sur un quai chargé, dans un hub ou en pointe ; rare dans une petite gare
 * déserte, où il n'y a personne à faire patienter — et où l'entendre quand
 * trois personnes attendent sonne faux.
 */
export function alightFirstChance(context: PlatformAnnouncementContext): number {
  let p = 0.1 + 0.6 * clamp(context.crowdLevel, 0, 1);
  if (isMajorHub(context.stationIndex)) p += 0.15;
  if (isPeakHour(context.hour)) p += 0.15;
  return clamp(p, 0.03, 0.97);
}

// --- Combien de messages d'agent ----------------------------------------

/** Poids des trois issues : aucun message, un, deux. */
export interface AgentCountWeights {
  none: number;
  one: number;
  two: number;
}

/**
 * Répartition du nombre de messages, par affluence puis par contexte.
 *
 * Les trois paliers de référence : quai calme, majoritairement silencieux ;
 * quai moyen, un message ; quai chargé, un ou deux. La pointe retire de la masse
 * au silence — un agent tenu de faire circuler ne se tait pas —, un hub en
 * pointe déplace un peu de « un » vers « deux », et le retard divise encore le
 * silence : c'est le moment où l'on parle le plus.
 */
export function agentCountWeights(context: PlatformAnnouncementContext): AgentCountWeights {
  const crowd = clamp(context.crowdLevel, 0, 1);
  const w: AgentCountWeights =
    crowd < 0.3
      ? { none: 0.55, one: 0.4, two: 0.05 }
      : crowd < 0.65
        ? { none: 0.2, one: 0.65, two: 0.15 }
        : { none: 0.05, one: 0.55, two: 0.4 };
  const peak = isPeakHour(context.hour);
  if (peak) {
    const freed = w.none * 0.4;
    w.none -= freed;
    w.one += freed;
  }
  if (peak && isMajorHub(context.stationIndex)) {
    const shift = Math.min(0.1, w.one);
    w.one -= shift;
    w.two += shift;
  }
  if (context.delayed) {
    const freed = w.none * 0.5;
    w.none -= freed;
    w.one += freed * 0.6;
    w.two += freed * 0.4;
  }
  return w;
}

/**
 * Nombre de messages pour ce tirage. Le seuil est cumulatif et les poids ne
 * font que retirer de la masse au silence : à valeur tirée égale, un quai plus
 * chargé n'a jamais MOINS de messages qu'un quai plus calme.
 */
export function agentMessageCount(
  context: PlatformAnnouncementContext,
  roll: number,
): 0 | 1 | 2 {
  const w = agentCountWeights(context);
  const total = w.none + w.one + w.two;
  const r = clamp(roll, 0, 0.999999) * total;
  let n: 0 | 1 | 2 = r < w.none ? 0 : r < w.none + w.one ? 1 : 2;
  // Ligne en retard et quai qui commence à se remplir : l'agent parle, ne
  // serait-ce qu'une fois. C'est la situation où le silence coûte des secondes
  // d'échange.
  if (n === 0 && context.delayed && context.crowdLevel >= 0.3) n = 1;
  return n;
}

// --- Quel message -------------------------------------------------------

/**
 * Créneau visé : pendant l'échange des voyageurs, ou juste avant la mélodie.
 * Ce n'est pas le même propos — on fait avancer dans la rame pendant qu'on
 * monte, on décourage le saut dans les portes quand elles vont se fermer.
 */
export type AgentMessageSlot = 'exchange' | 'pre-melody';

const SLOT_CATEGORIES: Record<AgentMessageSlot, AgentMessageCategory[]> = {
  exchange: ['alighting', 'move-inside', 'move-along-platform'],
  'pre-melody': ['no-rushing', 'clear-doors', 'wait-next-train'],
};

/** Faveur donnée à un message dont la catégorie tombe dans son créneau. */
const SLOT_AFFINITY = 2.5;

/**
 * Poids de chaque message pour ce contexte et ce créneau ; 0 = à écarter.
 *
 * Trois filtres, dans cet ordre : l'affluence minimale (demander d'avancer vers
 * le milieu de la voiture à trois personnes n'a aucun sens), la réserve aux
 * heures de pointe, et l'exclusion des catégories déjà retenues ailleurs dans le
 * plan — c'est ce qui empêche « laissez descendre » de passer deux fois au même
 * arrêt.
 */
export function agentMessageWeights(
  context: PlatformAnnouncementContext,
  slot: AgentMessageSlot,
  exclude: readonly AgentMessageCategory[] = [],
): number[] {
  const crowd = clamp(context.crowdLevel, 0, 1);
  const peak = isPeakHour(context.hour);
  return PLATFORM_AGENT_MESSAGES.map((m) => {
    if (exclude.includes(m.category)) return 0;
    if (m.minCrowd != null && crowd < m.minCrowd) return 0;
    if (m.peakOnly && !peak) return 0;
    let w = m.weight;
    if (SLOT_CATEGORIES[slot].includes(m.category)) w *= SLOT_AFFINITY;
    if (context.delayed) w *= m.delayedWeightMultiplier ?? 1;
    return w;
  });
}

/** Tirage pondéré : l'indice choisi, ou -1 si tous les poids sont nuls. */
function pickWeighted(weights: readonly number[], roll: number): number {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return -1;
  let r = clamp(roll, 0, 0.999999) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Les `count` messages retenus, un par créneau, sans répétition. Un créneau qui
 * n'a plus rien de pertinent à dire reste vide plutôt que de reprendre le
 * message précédent.
 */
export function pickAgentMessages(
  context: PlatformAnnouncementContext,
  count: number,
  random: () => number,
  exclude: readonly AgentMessageCategory[] = [],
): number[] {
  const out: number[] = [];
  const taken: AgentMessageCategory[] = [...exclude];
  const slots: AgentMessageSlot[] = ['exchange', 'pre-melody'];
  for (let i = 0; i < count; i++) {
    const slot = slots[Math.min(i, slots.length - 1)];
    const pick = pickWeighted(agentMessageWeights(context, slot, taken), random());
    if (pick < 0) continue;
    out.push(pick);
    taken.push(PLATFORM_AGENT_MESSAGES[pick].category);
  }
  return out;
}

// --- Le plan ------------------------------------------------------------

/**
 * Le plan de cette attente. Quatre tirages fixes (anticipée, remerciement,
 * « laissez descendre », nombre de messages) puis un par message : le nombre de
 * valeurs consommées ne dépend que du nombre de messages, ce qui rend la suite
 * comparable d'un contexte à l'autre à générateur identique.
 *
 * L'annonce d'approche n'est PAS dans ce plan, et c'est volontaire : elle est
 * obligatoire. Une rame qui entre en gare s'annonce toujours.
 */
export function createPlatformAnnouncementPlan(
  context: PlatformAnnouncementContext,
  random: () => number,
): PlatformAnnouncementPlan {
  const preRoll = random();
  const greetRoll = random();
  const alightRoll = random();
  const countRoll = random();

  const playPreAnnouncement = preRoll < preAnnouncementChance(context);
  const playGreeting = playPreAnnouncement && greetRoll < greetingChance(context);
  const playAlightFirstMessage = alightRoll < alightFirstChance(context);
  const count = agentMessageCount(context, countRoll);
  const exclude: AgentMessageCategory[] = playAlightFirstMessage ? ['alighting'] : [];

  return {
    playGreeting,
    playPreAnnouncement,
    playAlightFirstMessage,
    agentMessages: pickAgentMessages(context, count, random, exclude),
  };
}

// --- Créneaux sonores ---------------------------------------------------

/**
 * Quand la gare REGARDE si elle a quelque chose à dire. Ce ne sont plus des
 * rendez-vous : à chacun de ces instants, le plan est consulté et le créneau
 * vérifié — il ne sort quelque chose que si le plan l'a retenu et si ça tient.
 *
 * Les instants du creux (`delayAt`, `preAnnounceAt`…) sont en secondes depuis le
 * départ de la rame précédente ; ceux de l'arrêt (`agentExchangeAt`,
 * `agentPreMelodyLead`) en temps de dwell. Ils vivent ici, dans le module pur,
 * pour que la chronologie soit vérifiable sans démarrer le moteur audio
 * (tests/platformAnnouncementTiming) : systems/platformWait et
 * systems/stationCycle les lisent, ils ne les redéfinissent pas.
 */
export const PLATFORM_SCHEDULE = {
  /** Excuse de retard, une fois le quai dégagé. */
  delayAt: 6,
  /** Annonce anticipée du prochain train. */
  preAnnounceAt: 14,
  /** La même, décalée derrière l'excuse de retard quand il y en a eu une. */
  preAnnounceAfterDelayAt: 26,
  /** Avance de l'annonce d'approche sur l'arrivée de la rame. */
  approachBefore: 24,
  /** Premier message d'agent : pendant l'échange, la foule en mouvement. */
  agentExchangeAt: 5,
  /** Avance du second message d'agent sur la mélodie. */
  agentPreMelodyLead: 9,
} as const;

/**
 * Silence gardé entre la fin d'un message et ce qui vient après (s). Une
 * consigne qui se termine sur la première note de la mélodie est pire que pas
 * de consigne du tout.
 */
export const ANNOUNCEMENT_MARGIN = 1.5;

/**
 * Ce message tient-il avant l'échéance ?
 *
 * `queueSeconds` est ce que la sono a encore à dire (systems/speech.
 * speechQueueRemaining), `clipSeconds` la durée du message, `secondsUntilCutoff`
 * le temps qui reste avant l'annonce prioritaire — la mélodie, l'annonce de
 * fermeture, l'annonce d'approche. Faux → on ABANDONNE le message : le repousser
 * le ferait sortir après le moment où il voulait dire quelque chose.
 */
export function fitsBeforeCutoff(
  clipSeconds: number,
  queueSeconds: number,
  secondsUntilCutoff: number,
  margin = ANNOUNCEMENT_MARGIN,
): boolean {
  if (clipSeconds <= 0) return false;
  return queueSeconds + clipSeconds + margin <= secondsUntilCutoff;
}

/**
 * La décision complète d'un message facultatif : le plan l'a-t-il retenu, ET
 * tient-il encore dans ce qu'il reste de créneau ?
 *
 * Les deux conditions ne se séparent pas, et c'est le seul endroit où elles sont
 * écrites : « laissez descendre » comme les consignes d'agent passent par ici
 * (systems/stationPa). Un message retenu par le plan mais joué trop tard est
 * exactement aussi faux qu'un message que le plan n'avait pas retenu — 「降りる
 * お客さまを先にお通しください」 lancé sur la mélodie ne fait plus descendre
 * personne.
 */
export function optionalMessagePlays(
  planned: boolean,
  clipSeconds: number,
  queueSeconds: number,
  secondsUntilCutoff: number,
  margin = ANNOUNCEMENT_MARGIN,
): boolean {
  if (!planned) return false;
  return fitsBeforeCutoff(clipSeconds, queueSeconds, secondsUntilCutoff, margin);
}
