// Vocabulaire des conversations : ce qu'une réplique contient, et à quelles
// conditions un voyageur peut la dire.
//
// Une entrée = un échange complet (une à quatre répliques enchaînées), écrit
// dans les TROIS langues de l'interface côte à côte : traduire ailleurs
// reviendrait à écrire deux fois le même catalogue et à les voir diverger.
//
// Le genre se décline là où la langue l'impose : « je suis fatiguée » / « je
// suis fatigué » en français, 僕 / 私 et ～だよ / ～わよ en japonais, à peu près
// rien en anglais. D'où le type `Gendered` : une chaîne quand le genre ne
// change rien, une paire { f, m } quand il change quelque chose.

import type { Archetype } from '../../systems/appearance';
import type { Phase } from '../../store';

/** Texte éventuellement décliné selon le genre du PNJ qui parle. */
export type Gendered = string | { readonly f: string; readonly m: string };

/** La même réplique dans les trois langues de l'interface. */
export interface LineText {
  readonly fr: Gendered;
  readonly en: Gendered;
  readonly ja: Gendered;
}

export interface DialogueLine {
  readonly t: LineText;
  /** Silence avant cette réplique (s) : un regard, une hésitation. */
  readonly gap?: number;
}

/** Ce qui a provoqué la parole. `ask` = le joueur a engagé. */
export type DialogueTrigger =
  | 'ask'
  /** Le joueur a bousculé ce voyageur. */
  | 'bump'
  /** Quelqu'un est tombé juste à côté. */
  | 'fallNearby'
  /** Le joueur vient de monter ou de descendre. */
  | 'boarding'
  /** Le joueur passe à portée sans rien demander. */
  | 'passby'
  /** Le joueur s'est assis à côté. */
  | 'satDown'
  /** La rame vient de s'arrêter en gare. */
  | 'arrival';

export type Posture = 'seated' | 'standing' | 'waiting';

/** Conditions d'emploi d'un échange. Tout champ absent = pas de contrainte. */
export interface DialogueWhen {
  readonly place?: 'car' | 'platform';
  readonly posture?: readonly Posture[];
  readonly archetype?: readonly Archetype[];
  /** true = seulement les femmes, false = seulement les hommes. */
  readonly feminine?: boolean;
  readonly senior?: boolean;
  /** Accessoires exigés sur le PNJ (masque, lunettes, sac, chapeau, écharpe). */
  readonly needs?: readonly ('mask' | 'glasses' | 'bag' | 'hat' | 'scarf')[];
  /** Créneau horaire [début, fin[ en heures ; passe minuit si début > fin. */
  readonly hours?: readonly [number, number];
  readonly weekend?: boolean;
  /** Remplissage du tronçon, 0..1. */
  readonly crowdMin?: number;
  readonly crowdMax?: number;
  readonly phase?: readonly Phase[];
  /** Index de gare (0 = JY01 Tokyo) concernés — la gare visée par la réplique. */
  readonly station?: readonly number[];
  /** true = la rame roule, false = elle est à l'arrêt. */
  readonly moving?: boolean;
  readonly playerSeated?: boolean;
  /** Déclencheur attendu ; par défaut, une sollicitation du joueur. */
  readonly trigger?: DialogueTrigger;
  /** Mois de Tokyo concernés (1–12) : la canicule d'août, le froid de janvier. */
  readonly months?: readonly number[];
}

export interface DialogueEntry {
  /** Identifiant stable : sert de mémoire (« il me l'a déjà dite »). */
  readonly id: string;
  readonly lines: readonly DialogueLine[];
  /** Poids relatif dans le tirage (défaut 1). */
  readonly weight?: number;
  readonly when?: DialogueWhen;
}

/** État du monde au moment où quelqu'un ouvre la bouche. */
export interface DialogueCtx {
  place: 'car' | 'platform';
  posture: Posture;
  archetype: Archetype;
  feminine: boolean;
  senior: boolean;
  mask: boolean;
  glasses: boolean;
  bag: boolean;
  hat: boolean;
  scarf: boolean;
  /** Heure de Tokyo, 0..24. */
  hour: number;
  month: number;
  weekend: boolean;
  crowd: number;
  phase: Phase;
  moving: boolean;
  playerSeated: boolean;
  /** Gare suivante (index 0..29) et gare dont le quai est là. */
  nextIndex: number;
  hereIndex: number;
  trigger: DialogueTrigger;
}

/**
 * Créneau horaire, minuit compris. Une nuit s'écrit aussi bien [22, 2] que
 * [22, 26] — la seconde forme se lit mieux quand on pense « jusqu'à deux
 * heures du matin », et c'est celle qu'on écrit sans y penser.
 */
function inHours(hour: number, [from, to]: readonly [number, number]): boolean {
  const end = to > 24 ? to - 24 : to;
  return from <= end ? hour >= from && hour < end : hour >= from || hour < end;
}

/** L'échange est-il recevable dans ce contexte ? */
export function matches(entry: DialogueEntry, ctx: DialogueCtx): boolean {
  const w = entry.when;
  const trigger = w?.trigger ?? 'ask';
  if (trigger !== ctx.trigger) return false;
  if (!w) return true;
  if (w.place && w.place !== ctx.place) return false;
  if (w.posture && !w.posture.includes(ctx.posture)) return false;
  if (w.archetype && !w.archetype.includes(ctx.archetype)) return false;
  if (w.feminine !== undefined && w.feminine !== ctx.feminine) return false;
  if (w.senior !== undefined && w.senior !== ctx.senior) return false;
  if (w.needs) {
    for (const n of w.needs) {
      if (n === 'mask' && !ctx.mask) return false;
      if (n === 'glasses' && !ctx.glasses) return false;
      if (n === 'bag' && !ctx.bag) return false;
      if (n === 'hat' && !ctx.hat) return false;
      if (n === 'scarf' && !ctx.scarf) return false;
    }
  }
  if (w.hours && !inHours(ctx.hour, w.hours)) return false;
  if (w.months && !w.months.includes(ctx.month)) return false;
  if (w.weekend !== undefined && w.weekend !== ctx.weekend) return false;
  if (w.crowdMin !== undefined && ctx.crowd < w.crowdMin) return false;
  if (w.crowdMax !== undefined && ctx.crowd > w.crowdMax) return false;
  if (w.phase && !w.phase.includes(ctx.phase)) return false;
  if (w.moving !== undefined && w.moving !== ctx.moving) return false;
  if (w.playerSeated !== undefined && w.playerSeated !== ctx.playerSeated) return false;
  if (w.station && !w.station.includes(ctx.nextIndex) && !w.station.includes(ctx.hereIndex)) {
    return false;
  }
  return true;
}
