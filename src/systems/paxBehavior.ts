// Le RYTHME des PNJ : qui fait quoi, pendant combien de temps, et à quelle
// fréquence il en change. Partagé par la rame (systems/passengers) et le quai
// (systems/platformCrowd), qui n'avaient jusqu'ici ni l'un ni l'autre de
// notion de durée réelle : chacun retirait une occupation au sort toutes les
// deux à cinq secondes, si bien qu'un wagon produisait plusieurs disputes par
// minute et que personne ne restait sur son téléphone plus de sept secondes.
//
// Trois mécanismes corrigent ça, et ils tiennent tous ici :
//
// 1. OCCUPATION DE FOND + INTERRUPTIONS. Un voyageur choisit ce qu'il fait des
//    prochaines minutes (`anchor` du catalogue), s'interrompt de loin en loin
//    pour un geste bref, puis REPREND son occupation. C'est ce qui donne
//    l'immobilité têtue d'une vraie rame.
// 2. TEMPÉRAMENT. Chaque PNJ a un caractère stable, tiré de son id comme son
//    apparence : un bavard bavarde, un taciturne reste sur son écran, un
//    nerveux s'agite trois fois plus souvent. Sans lui, tout le monde fait
//    tout, et la foule redevient uniforme.
// 3. BUDGET D'ÉVÉNEMENTS RARES. Disputes, chutes, bagarres et séductions
//    passent par un compteur global : une dispute toutes les quelques minutes,
//    une bagarre à peine une fois par tour de boucle. Le budget est compté
//    séparément pour la rame et pour le quai — ce sont deux lieux.
//
// Le contexte (heure de Tokyo, remplissage, phase du cycle) module ensuite les
// poids : silence du matin, rire du vendredi soir, bras au corps quand c'est
// bondé, regards vers les portes à quai.

import { rng } from '../textures/procedural';
import {
  PAX_ACTIONS,
  type ActionWhere,
  type PaxActionDef,
  type RareKind,
} from '../data/paxActions';
import type { Appearance } from './appearance';
import { currentSegmentOccupancy } from './occupancy';
import { runtime } from './runtime';
import { useStore } from '../store';

// --- Tempérament ---------------------------------------------------------

export interface Temper {
  /** Goût de la conversation : conditionne les échanges à deux. */
  social: number;
  /** Besoin de bouger : fréquence des gestes brefs. */
  restless: number;
  /** Attachement à l'écran. */
  screen: number;
  /** Tendance à somnoler. */
  sleepy: number;
  /** Curiosité envers le joueur. */
  nosy: number;
  /** Susceptibilité : seule porte d'entrée des scènes de drame. */
  irritable: number;
}

const tempers = new Map<number, Temper>();

/**
 * Caractère d'un PNJ, stable pour toute la session (même graine que son
 * apparence, décalée). Deux voyageurs voisins n'ont pas le même métronome.
 */
export function temperFor(id: number): Temper {
  const cached = tempers.get(id);
  if (cached) return cached;
  const r = rng(77003 + id * 2246822519);
  const t: Temper = {
    // Peu de vrais bavards : la plupart des gens ne parlent à personne.
    social: r() ** 2.1,
    restless: 0.15 + r() * 0.85,
    screen: 0.25 + r() * 0.75,
    sleepy: r() ** 1.6,
    nosy: r() ** 1.8,
    irritable: r() ** 3,
  };
  tempers.set(id, t);
  return t;
}

// --- Budget des événements rares ----------------------------------------

/** Lieu du budget : la rame et le quai ne partagent pas leurs quotas. */
export type RareScope = 'car' | 'platform';

// Intervalle [min, max] en secondes entre deux événements d'une même famille.
// Une bagarre par tour de boucle (~60 min) est déjà généreux.
const RARE_INTERVAL: Record<RareKind, readonly [number, number]> = {
  drama: [150, 420],
  fight: [1200, 3000],
  fall: [240, 720],
  balance: [70, 220],
  flirt: [300, 800],
  comic: [120, 330],
  mood: [100, 260],
};

/** Horloge de comportement, avancée par la boucle des voyageurs. */
let clock = 0;
const rareReadyAt = new Map<string, number>();

export function advanceBehaviorClock(dt: number): void {
  clock += dt;
}

function rareKey(scope: RareScope, kind: RareKind): string {
  return `${scope}:${kind}`;
}

/** Le budget autorise-t-il cette famille, ici et maintenant ? */
export function rareAvailable(scope: RareScope, kind: RareKind): boolean {
  return clock >= (rareReadyAt.get(rareKey(scope, kind)) ?? 0);
}

/** Consomme le budget : la famille se referme pour un moment. */
export function claimRare(scope: RareScope, kind: RareKind): void {
  const [lo, hi] = RARE_INTERVAL[kind];
  rareReadyAt.set(rareKey(scope, kind), clock + lo + Math.random() * (hi - lo));
}

/** Remet les compteurs à plat (changement de gare, purge de qualité). */
export function resetRareBudget(scope?: RareScope): void {
  if (!scope) {
    rareReadyAt.clear();
    return;
  }
  for (const key of [...rareReadyAt.keys()]) {
    if (key.startsWith(`${scope}:`)) rareReadyAt.delete(key);
  }
}

// --- Contexte du monde ---------------------------------------------------

interface WorldCtx {
  /** Heure de Tokyo, 0..24. */
  hour: number;
  morningRush: number; // 0..1
  eveningRush: number; // 0..1
  night: number; // 0..1 (soirée arrosée, dernier train)
  weekend: boolean;
  /** Remplissage 0..1 du tronçon courant. */
  crowding: number;
  atStation: boolean;
}

let cachedCtx: WorldCtx | null = null;
let cachedAt = -1;

function bump(x: number, center: number, halfWidth: number): number {
  const d = Math.abs(x - center) / halfWidth;
  return d >= 1 ? 0 : 1 - d * d;
}

/** Contexte partagé, recalculé au plus une fois par seconde. */
function worldCtx(): WorldCtx {
  if (cachedCtx && clock - cachedAt < 1) return cachedCtx;
  const hour = (runtime.clockMin / 60) % 24;
  const { phase, platformIndex, index } = useStore.getState();
  const weekday = runtime.tokyoDate.weekday;
  const crowding = Math.min(1, currentSegmentOccupancy().percent / 100);
  cachedCtx = {
    hour,
    morningRush: bump(hour, 8.2, 2.0),
    eveningRush: bump(hour, 18.5, 2.4),
    // Un pic à minuit qui déborde des deux côtés (dernier train, retours du
    // vendredi) : 22 h → 0,3 ; 0 h 30 → ~1.
    night: Math.max(bump(hour, 0.3, 2.6), bump(hour, 24.3, 2.6)),
    weekend: weekday === 0 || weekday === 6,
    crowding,
    atStation: phase === 'dwell' || phase === 'depart' || platformIndex !== index,
  };
  cachedAt = clock;
  return cachedCtx;
}

// --- Modulation contextuelle des poids -----------------------------------

const TALKY = new Set(['chat', 'gossip', 'sideChat', 'whisper', 'laugh', 'nodAgree', 'sharePhone']);
const BIG_GESTURE = new Set(['stretch', 'stretchLegs', 'fanSelf', 'read', 'tieLace', 'neckRoll', 'rollShoulders']);

/**
 * Coefficient d'ambiance appliqué au poids d'une occupation. Le matin, un
 * wagon de la Yamanote est silencieux ; le vendredi soir il rit, titube et
 * s'endort. C'est là que ça se décide.
 */
function contextMul(def: PaxActionDef): number {
  const w = worldCtx();
  let m = 1;
  const id = def.id;

  if (TALKY.has(id)) {
    // Silence de rigueur aux heures de bureau, bavardage le soir et le week-end.
    m *= 1 - 0.62 * w.morningRush;
    m *= 1 + 0.5 * w.eveningRush + 1.1 * w.night;
    if (w.weekend) m *= 1.45;
    // Difficile de tenir une conversation collé à un inconnu.
    m *= 1 - 0.45 * w.crowding;
  }

  if (def.rare === 'drama' || def.rare === 'fight') {
    // L'alcool du dernier train, pas la fatigue du matin.
    m *= 1 + 2.2 * w.night;
    m *= 1 - 0.5 * w.morningRush;
    m *= 1 + 0.6 * w.crowding;
  }
  if (def.rare === 'balance' || def.rare === 'fall') m *= 1 + 1.5 * w.night;
  if (def.rare === 'flirt') m *= 1 + 1.2 * w.night + (w.weekend ? 0.5 : 0);

  if (BIG_GESTURE.has(id)) m *= 1 - 0.7 * w.crowding;
  if (def.needsRoom) m *= 1 - 0.85 * w.crowding;

  switch (id) {
    case 'doze':
      m *= 1 + 1.6 * w.night + 0.9 * w.morningRush + 0.5 * w.eveningRush;
      break;
    case 'yawn':
    case 'rubEyes':
      m *= 1 + 1.2 * w.night + 0.8 * w.morningRush;
      break;
    case 'checkWatch':
    case 'checkTime':
      m *= 1 + 1.3 * w.morningRush + 0.4 * w.eveningRush;
      break;
    case 'windowGaze':
      // À quai, la vitre ne donne que sur un quai : on regarde ailleurs.
      m *= w.atStation ? 0.35 : 1.3;
      m *= 1 - 0.4 * w.morningRush;
      break;
    case 'watchDoor':
    case 'glanceBoarding':
    case 'lookTracks':
    case 'stepBack':
    case 'queueShuffle':
      m *= w.atStation ? 2.6 : 0.35;
      break;
    case 'read':
      m *= w.weekend ? 1.2 : 1;
      break;
    case 'eat':
      m *= 0.4 + 1.8 * w.night + 0.8 * w.eveningRush;
      break;
    case 'fanSelf':
      // Juillet–septembre : l'été tokyoïte.
      m *= runtime.tokyoDate.month >= 7 && runtime.tokyoDate.month <= 9 ? 2.4 : 0.25;
      break;
    case 'phone':
      m *= 1 - 0.15 * w.crowding;
      break;
    case 'sway':
    case 'shiftWeight':
      m *= 1 + 0.5 * w.crowding;
      break;
    case 'photoSnap':
      m *= w.atStation ? 1.8 : 1;
      break;
    default:
      break;
  }
  return m;
}

/** Coefficient lié au caractère du voyageur. */
function temperMul(def: PaxActionDef, t: Temper): number {
  const id = def.id;
  if (def.kind === 'pair') return 0.25 + t.social * 2.6;
  if (def.kind === 'player') return 0.3 + t.nosy * 2.2;
  if (def.rare === 'drama' || def.rare === 'fight' || def.rare === 'mood') {
    return 0.15 + t.irritable * 3.4;
  }
  if (def.rare === 'flirt') return 0.2 + t.social * 1.6;
  if (id === 'phone' || id === 'sharePhone' || id === 'photoSnap') return 0.35 + t.screen * 1.9;
  if (id === 'doze' || id === 'yawn' || id === 'rubEyes' || id === 'restChin') return 0.3 + t.sleepy * 2.2;
  if (id === 'fidget' || id === 'tapFoot' || id === 'bounceKnee' || id === 'paceInPlace') {
    return 0.25 + t.restless * 2.2;
  }
  if (id === 'read' || id === 'windowGaze' || id === 'none' || id === 'lookFloor') {
    // Les occupations contemplatives vont aux calmes.
    return 0.4 + (1 - t.restless) * 1.4;
  }
  return 1;
}

// --- Tirage --------------------------------------------------------------

export interface PickCtx {
  where: ActionWhere;
  appearance: Appearance;
  temper: Temper;
  scope: RareScope;
  /** Distance au joueur dans le repère du système appelant. */
  playerDist: number;
  /** Le joueur est-il seulement dans ce repère-là ? */
  playerHere: boolean;
  /** Tangage de la caisse : favorise les pertes d'équilibre. */
  jolt?: number;
  /** Le voyageur tient-il une poignée ? */
  holdStrap?: boolean;
}

const weights: number[] = [];

/**
 * Tire une occupation. `wantAnchor` sépare les deux lots : ce qu'on fait des
 * prochaines minutes, ou le geste bref qui vient l'interrompre. Renvoie null
 * si rien n'est éligible (l'appelant retombe alors sur un temps mort).
 */
export function pickPaxAction(ctx: PickCtx, wantAnchor: boolean): PaxActionDef | null {
  const arch = ctx.appearance.archetype;
  const jolt = ctx.jolt ?? 0;
  let total = 0;

  for (let i = 0; i < PAX_ACTIONS.length; i++) {
    const def = PAX_ACTIONS[i];
    weights[i] = 0;
    if (def.weight <= 0) continue;
    if ((def.anchor === true) !== wantAnchor) continue;
    if (!def.where.includes(ctx.where)) continue;
    if (def.needsMask && !ctx.appearance.mask) continue;
    if (def.needsGlasses && !ctx.appearance.glasses) continue;
    if (def.needsBag && ctx.appearance.bag === 'none') continue;
    if (def.kind === 'player') {
      if (!ctx.playerHere) continue;
      if (ctx.playerDist >= (def.playerDist ?? 3.5)) continue;
    }
    // Un événement rare ne concourt que si son budget est ouvert.
    if (def.rare && !rareAvailable(ctx.scope, def.rare)) continue;

    let w = def.weight * contextMul(def) * temperMul(def, ctx.temper);
    if (def.archetypes && def.archetypes.includes(arch)) w *= def.archetypeBoost ?? 1.4;

    // Pertes d'équilibre : amplifiées par le tangage, freinées par la poignée.
    if (def.rare === 'balance' || def.rare === 'fall') {
      w *= ctx.holdStrap ? 0.3 : 1.35;
      if (jolt > 0.35) w *= 1 + jolt * 2.5;
      if (arch === 'senior') w *= 1.25;
      if (arch === 'student') w *= 1.15;
    }

    weights[i] = w;
    total += w;
  }

  if (total <= 0) return null;

  let pick = Math.random() * total;
  for (let i = 0; i < PAX_ACTIONS.length; i++) {
    pick -= weights[i];
    if (pick <= 0 && weights[i] > 0) {
      const def = PAX_ACTIONS[i];
      if (def.rare) claimRare(ctx.scope, def.rare);
      return def;
    }
  }
  return null;
}

/** Durée tirée dans la fourchette de l'occupation, étirée par le caractère. */
export function actionDuration(def: PaxActionDef, t: Temper): number {
  const [lo, hi] = def.dur;
  let d = lo + Math.random() * (hi - lo);
  if (def.anchor) {
    // Un calme tient sa position ; un nerveux en change vite.
    d *= 0.65 + (1 - t.restless) * 0.8;
    if (def.id === 'doze') d *= 0.8 + t.sleepy * 0.7;
  }
  return d;
}

/**
 * Délai avant la prochaine interruption d'une occupation de fond. Un voyageur
 * placide tient une demi-minute sans bouger ; un nerveux se gratte, vérifie
 * l'heure et remonte son sac toutes les dix secondes.
 */
export function nextInterludeDelay(t: Temper): number {
  const base = 7 + (1 - t.restless) * 26;
  return base * (0.6 + Math.random() * 0.9);
}

/** Délai avant qu'un voyageur puisse relancer un échange après en avoir fini un. */
export function nextSocialDelay(t: Temper): number {
  return (18 + Math.random() * 70) * (1.6 - t.social);
}
