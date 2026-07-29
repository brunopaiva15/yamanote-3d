// Les voyageurs nous parlent.
//
// Deux entrées possibles, et un seul moteur derrière :
//
// - SOLLICITÉE : on regarde quelqu'un d'assez près, une invite s'affiche, et
//   la touche « parler » lui délie la langue.
// - SPONTANÉE : personne n'a rien demandé. On l'a bousculé, on vient de
//   s'asseoir à côté, quelqu'un est tombé devant lui — il réagit tout seul
//   (voir systems/paxEvents pour l'aiguillage des déclencheurs).
//
// Le catalogue (data/dialogue) décide de CE QUI se dit selon le contexte :
// l'heure de Tokyo, la gare suivante, le remplissage, l'archétype et le genre
// du PNJ. Ce module décide de QUAND et de COMBIEN DE TEMPS, garde la mémoire
// de ce qui a déjà été dit, et publie l'état courant pour le rendu.
//
// L'état vit ici, muté à 60 fps, jamais dans React : le HUD le sonde comme il
// sonde runtime (voir ui/PaxSpeech).

import {
  pickDialogue,
  renderLine,
  type DialogueCtx,
  type DialogueEntry,
  type DialogueTrigger,
} from '../data/dialogue';
import { useStore, type Phase } from '../store';
import { currentSegmentOccupancy } from './occupancy';
import { input } from './input';
import { drainPaxEvents, pushPaxEvent, pushSceneEvent, type PaxEvent } from './paxEvents';
import {
  paxKeepTalking,
  paxList,
  paxStartTalking,
  paxStopTalking,
} from './passengers';
import {
  crowdKeepTalking,
  crowdList,
  crowdStartTalking,
  crowdStopTalking,
} from './platformCrowd';
import {
  findNearbyPax,
  findTargetedPax,
  paxAnchor,
  TALK_BREAK_RANGE,
  type PaxScope,
  type PaxTarget,
} from './paxTargeting';
import { runtime } from './runtime';
import { paxVoice } from './audioEngine';

export interface ConversationState {
  active: boolean;
  scope: PaxScope;
  id: number;
  /** Réplique affichée (déjà traduite et accordée), vide si silence. */
  text: string;
  /** Ancre monde de la bulle : la tête de celui qui parle. */
  x: number;
  y: number;
  z: number;
  /** Avancement de la réplique courante. */
  t: number;
  dur: number;
  /** Incrémenté à chaque nouvelle réplique : sert de clé au rendu. */
  revision: number;
  feminine: boolean;
  senior: boolean;
  /** Vrai quand personne n'a rien demandé : la bulle est alors plus discrète. */
  unsolicited: boolean;
}

export const conversation: ConversationState = {
  active: false,
  scope: 'car',
  id: -1,
  text: '',
  x: 0,
  y: 0,
  z: 0,
  t: 0,
  dur: 0,
  revision: 0,
  feminine: false,
  senior: false,
  unsolicited: false,
};

/** Voyageur actuellement en joue, pour l'invite du HUD. */
export const talkTarget: { target: PaxTarget | null } = { target: null };

// --- Mémoire ------------------------------------------------------------

/** Ce que le catalogue a servi récemment, tous PNJ confondus. */
const recentGlobal: string[] = [];
const RECENT_MAX = 45;
/** Ce que CE voyageur-là a déjà dit : personne ne se répète en face de vous. */
const saidBy = new Map<string, Set<string>>();
/** Instant du dernier mot de chaque voyageur (horloge du module). */
const lastSpokeAt = new Map<string, number>();

let clock = 0;
/** Prochain instant où une réplique spontanée est permise (toutes populations). */
let spontaneousReadyAt = 20;

function key(scope: PaxScope, id: number): string {
  return `${scope}:${id}`;
}

function noteSaid(scope: PaxScope, id: number, dialogueId: string): void {
  recentGlobal.push(dialogueId);
  if (recentGlobal.length > RECENT_MAX) recentGlobal.shift();
  const k = key(scope, id);
  let set = saidBy.get(k);
  if (!set) {
    set = new Set();
    saidBy.set(k, set);
  }
  set.add(dialogueId);
  lastSpokeAt.set(k, clock);
}

/**
 * Oubli des voyageurs partis.
 *
 * Les deux pools sont RÉUTILISÉS : le siège 12 est occupé par quelqu'un
 * d'autre trois gares plus loin. Sans cet oubli, ce nouveau voyageur hériterait
 * de tout ce que son prédécesseur a déjà dit et refuserait de le redire — la
 * mémoire suivrait la place, pas la personne.
 */
let sweepT = 0;

function forgetDeparted(dt: number): void {
  sweepT -= dt;
  if (sweepT > 0) return;
  sweepT = 2;
  for (const k of [...saidBy.keys()]) {
    const [scope, rawId] = k.split(':');
    const id = Number(rawId);
    if (scope === 'car') {
      const p = paxList[id];
      if (p && (p.state === 'seated' || p.state === 'standing')) continue;
    } else {
      const p = crowdList[id];
      if (p && p.state !== 'hidden') continue;
    }
    saidBy.delete(k);
    lastSpokeAt.delete(k);
  }
}

// --- Contexte ------------------------------------------------------------

function buildCtx(scope: PaxScope, id: number, trigger: DialogueTrigger): DialogueCtx | null {
  const store = useStore.getState();
  const occ = currentSegmentOccupancy();
  const common = {
    hour: (runtime.clockMin / 60) % 24,
    month: runtime.tokyoDate.month,
    weekend: runtime.tokyoDate.weekday === 0 || runtime.tokyoDate.weekday === 6,
    crowd: Math.min(1, occ.percent / 100),
    phase: store.phase,
    moving: runtime.speed > 0.6,
    playerSeated: store.seated,
    nextIndex: store.index,
    hereIndex: store.platformIndex,
    trigger,
  };
  if (scope === 'car') {
    const p = paxList[id];
    if (!p || (p.state !== 'seated' && p.state !== 'standing')) return null;
    const a = p.appearance;
    return {
      ...common,
      place: 'car',
      posture: p.state,
      archetype: a.archetype,
      feminine: a.feminine,
      senior: a.senior,
      mask: a.mask,
      glasses: a.glasses,
      bag: a.bag !== 'none',
      hat: a.hat !== 'none',
      scarf: a.scarf,
    };
  }
  const p = crowdList[id];
  if (!p) return null;
  const a = p.appearance;
  return {
    ...common,
    place: 'platform',
    posture: 'waiting',
    archetype: a.archetype,
    feminine: a.feminine,
    senior: a.senior,
    mask: a.mask,
    glasses: a.glasses,
    bag: a.bag !== 'none',
    hat: a.hat !== 'none',
    scarf: a.scarf,
  };
}

// --- Déroulé d'un échange ------------------------------------------------

interface ActiveTalk {
  entry: DialogueEntry;
  ctx: DialogueCtx;
  line: number;
  /** Silence restant avant la réplique suivante. */
  gap: number;
}

let talk: ActiveTalk | null = null;

/**
 * Durée d'affichage d'une réplique : le temps de la lire, avec un plancher
 * pour les répliques d'un mot et un plafond pour ne pas figer la bulle.
 * Le japonais dit en moins de signes ce que le français étale : à texte
 * égal, il lui faut donc plus de temps par caractère.
 */
function readingTime(text: string): number {
  const perChar = useStore.getState().lang === 'ja' ? 0.115 : 0.052;
  return Math.max(2.2, Math.min(7.5, 1.5 + text.length * perChar));
}

function speakerScale(scope: PaxScope, id: number): number {
  const p = scope === 'car' ? paxList[id] : crowdList[id];
  return p?.height ?? 1;
}

/** Pose la réplique courante : texte, durée, animation du PNJ, murmure. */
function speakLine(): void {
  if (!talk) return;
  const { entry, ctx } = talk;
  const line = entry.lines[talk.line];
  const lang = useStore.getState().lang;
  const text = renderLine(line, lang, ctx.feminine, ctx);
  const dur = readingTime(text);
  conversation.text = text;
  conversation.t = 0;
  conversation.dur = dur;
  conversation.revision++;
  const ok =
    conversation.scope === 'car'
      ? talk.line === 0
        ? paxStartTalking(conversation.id, dur + 0.6)
        : paxKeepTalking(conversation.id, dur + 0.6)
      : talk.line === 0
        ? crowdStartTalking(conversation.id, dur + 0.6)
        : crowdKeepTalking(conversation.id, dur + 0.6);
  if (!ok) {
    endConversation();
    return;
  }
  // Un murmure, pas des mots : le timbre suit la stature et le genre.
  paxVoice({
    dist: Math.hypot(
      conversation.x - runtime.playerX,
      conversation.y - runtime.playerY,
      conversation.z - runtime.playerZ,
    ),
    feminine: ctx.feminine,
    senior: ctx.senior,
    scale: speakerScale(conversation.scope, conversation.id),
    syllables: Math.max(2, Math.min(9, Math.round(text.length / (lang === 'ja' ? 3.2 : 6.5)))),
  });
}

export function endConversation(): void {
  if (!conversation.active) return;
  if (conversation.scope === 'car') paxStopTalking(conversation.id);
  else crowdStopTalking(conversation.id);
  conversation.active = false;
  conversation.text = '';
  conversation.revision++;
  talk = null;
}

/**
 * Démarre un échange. `trigger` distingue la sollicitation du joueur d'une
 * réaction spontanée : le catalogue n'ouvre pas les mêmes répliques.
 */
export function startConversation(
  scope: PaxScope,
  id: number,
  trigger: DialogueTrigger = 'ask',
): boolean {
  const ctx = buildCtx(scope, id, trigger);
  if (!ctx) return false;
  const anchor = paxAnchor(scope, id);
  if (!anchor) return false;
  const already = saidBy.get(key(scope, id));
  const entry = pickDialogue(ctx, (dialogueId) => {
    if (already?.has(dialogueId)) return true;
    return recentGlobal.includes(dialogueId);
  });
  if (!entry) return false;

  if (conversation.active) endConversation();
  conversation.active = true;
  conversation.scope = scope;
  conversation.id = id;
  conversation.x = anchor.x;
  conversation.y = anchor.y;
  conversation.z = anchor.z;
  conversation.feminine = ctx.feminine;
  conversation.senior = ctx.senior;
  conversation.unsolicited = trigger !== 'ask';
  talk = { entry, ctx, line: 0, gap: 0 };
  noteSaid(scope, id, entry.id);
  speakLine();
  return conversation.active;
}

// --- Boucle --------------------------------------------------------------

let targetPollT = 0;

/** Une réplique spontanée n'est permise que de loin en loin. */
function spontaneousInterval(): number {
  return 40 + Math.random() * 80;
}

function handleEvent(e: PaxEvent): void {
  if (conversation.active) return;
  if (clock < spontaneousReadyAt) return;
  let scope = e.scope;
  let id = e.id;
  if (id < 0) {
    // Événement sans destinataire : c'est au voisin le plus proche de relever.
    const near = findNearbyPax(2.6);
    if (!near) return;
    scope = near.scope;
    id = near.id;
  }
  // Personne ne se remet à parler deux fois de suite.
  const last = lastSpokeAt.get(key(scope, id)) ?? -999;
  if (clock - last < 25) return;
  if (startConversation(scope, id, e.trigger)) {
    spontaneousReadyAt = clock + spontaneousInterval();
  }
}

// --- Ce qui arrive AU JOUEUR ---------------------------------------------
//
// S'asseoir, monter, descendre, entrer en gare : autant de choses que le
// joueur provoque et qu'un voisin peut relever. Plutôt que d'aller planter
// des appels dans le contrôleur du joueur et la machine à états des gares, on
// guette ici les transitions de l'état global — c'est le même travail, au
// même endroit que le reste du dialogue.

let prevSeated = false;
let prevOnPlatform = false;
let prevPhase: Phase = 'cruise';
let prevIndex = -1;
let watchInit = false;
let passbyT = 0;

function watchPlayerEvents(dt: number): void {
  const { seated, onPlatform, phase, platformIndex } = useStore.getState();
  if (!watchInit) {
    watchInit = true;
    prevSeated = seated;
    prevOnPlatform = onPlatform;
    prevPhase = phase;
    prevIndex = platformIndex;
    return;
  }
  if (seated && !prevSeated) pushSceneEvent('satDown');
  if (onPlatform !== prevOnPlatform) pushSceneEvent('boarding');
  if (phase === 'dwell' && prevPhase !== 'dwell') pushSceneEvent('arrival');
  else if (platformIndex !== prevIndex && phase === 'dwell') pushSceneEvent('arrival');
  prevSeated = seated;
  prevOnPlatform = onPlatform;
  prevPhase = phase;
  prevIndex = platformIndex;

  // Frôler quelqu'un en marchant, de loin en loin : ni un choc, ni une
  // sollicitation — juste un mot lâché au passage.
  passbyT -= dt;
  if (passbyT > 0) return;
  passbyT = 4;
  if (seated || conversation.active) return;
  const near = findNearbyPax(1.15);
  if (near && Math.random() < 0.22) pushPaxEvent(near.scope, near.id, 'passby');
}

export function updateConversation(dt: number): void {
  clock += dt;
  forgetDeparted(dt);

  // Cible en joue : sondée dix fois par seconde, c'est bien assez pour une
  // invite, et ça évite de balayer les deux populations à chaque image.
  targetPollT -= dt;
  if (targetPollT <= 0) {
    targetPollT = 0.1;
    talkTarget.target = conversation.active ? null : findTargetedPax();
  }

  if (input.talkRequest) {
    input.talkRequest = false;
    if (conversation.active) {
      // Deuxième appui : on coupe court, comme on tourne les talons.
      endConversation();
    } else {
      const t = talkTarget.target;
      if (t) {
        startConversation(t.scope, t.id, 'ask');
        talkTarget.target = null;
      }
    }
  }

  // Réactions spontanées (bousculade, chute voisine, montée du joueur…).
  watchPlayerEvents(dt);
  for (const e of drainPaxEvents()) handleEvent(e);

  if (!conversation.active || !talk) return;

  // L'interlocuteur doit rester là, et à portée de voix.
  const anchor = paxAnchor(conversation.scope, conversation.id);
  if (!anchor || anchor.dist > TALK_BREAK_RANGE) {
    endConversation();
    return;
  }
  conversation.x = anchor.x;
  conversation.y = anchor.y;
  conversation.z = anchor.z;

  if (talk.gap > 0) {
    talk.gap -= dt;
    if (talk.gap <= 0) speakLine();
    return;
  }

  conversation.t += dt;
  if (conversation.t < conversation.dur) return;

  const next = talk.line + 1;
  if (next >= talk.entry.lines.length) {
    endConversation();
    return;
  }
  talk.line = next;
  const gap = talk.entry.lines[next].gap ?? 0.35;
  conversation.text = '';
  conversation.revision++;
  if (gap > 0) {
    talk.gap = gap;
    return;
  }
  speakLine();
}

/** Remet le module à zéro : plus personne ne se souvient de rien. */
export function resetConversation(): void {
  endConversation();
  saidBy.clear();
  lastSpokeAt.clear();
  recentGlobal.length = 0;
  talkTarget.target = null;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Outils dev, pendants de __pax et __crowd : __conversation donne l'échange
  // en cours et qui l'a en joue ; __talk() fait parler le voyageur visé sans
  // avoir à viser, __forget() rouvre tout le catalogue.
  const w = window as unknown as Record<string, unknown>;
  w.__conversation = conversation;
  w.__talk = (trigger: DialogueTrigger = 'ask') => {
    const t = talkTarget.target ?? findNearbyPax(3.5);
    return t ? startConversation(t.scope, t.id, trigger) : false;
  };
  w.__forget = resetConversation;
}
