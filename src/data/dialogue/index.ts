// Catalogue des conversations, et tirage d'un échange dans le contexte du
// moment. Les répliques elles-mêmes vivent dans les cinq modules thématiques
// importés ci-dessous ; ce fichier n'assemble, ne filtre et ne rend.

import { STATIONS } from '../stations';
import type { Lang } from '../../i18n/strings';
import { DIALOGUE_SMALLTALK } from './smallTalk';
import { DIALOGUE_PEOPLE } from './people';
import { DIALOGUE_PLACES } from './places';
import { DIALOGUE_MOMENTS } from './moments';
import { DIALOGUE_EVENTS } from './events';
import { matches, type DialogueCtx, type DialogueEntry, type DialogueLine, type Gendered } from './types';

export * from './types';

export const DIALOGUES: readonly DialogueEntry[] = [
  ...DIALOGUE_SMALLTALK,
  ...DIALOGUE_PEOPLE,
  ...DIALOGUE_PLACES,
  ...DIALOGUE_MOMENTS,
  ...DIALOGUE_EVENTS,
];

if (import.meta.env.DEV) {
  const seen = new Set<string>();
  for (const d of DIALOGUES) {
    if (seen.has(d.id)) console.warn(`[dialogue] identifiant en double : ${d.id}`);
    seen.add(d.id);
  }
}

/** Nombre d'échanges du catalogue (affiché par la sonde dev __dialogue). */
export const DIALOGUE_COUNT = DIALOGUES.length;

/**
 * Choisit un échange. `recent` écarte ce qui vient d'être entendu — la
 * variété d'un catalogue de deux cents entrées ne sert à rien si le tirage
 * ressort la même réplique trois fois de suite.
 */
export function pickDialogue(ctx: DialogueCtx, recent: (id: string) => boolean): DialogueEntry | null {
  let total = 0;
  const pool: DialogueEntry[] = [];
  const weights: number[] = [];
  let fallbackPool: DialogueEntry[] = [];
  for (const entry of DIALOGUES) {
    if (!matches(entry, ctx)) continue;
    if (recent(entry.id)) {
      fallbackPool.push(entry);
      continue;
    }
    const w = entry.weight ?? 1;
    pool.push(entry);
    weights.push(w);
    total += w;
  }
  if (pool.length === 0) {
    // Tout a déjà été dit récemment : on se répète plutôt que de se taire.
    if (fallbackPool.length === 0) return null;
    return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
  }
  let pick = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function genderOf(text: Gendered, feminine: boolean): string {
  return typeof text === 'string' ? text : feminine ? text.f : text.m;
}

/** Nom d'une gare dans la langue de l'interface (kanji en japonais). */
function stationName(index: number, lang: Lang): string {
  const s = STATIONS[((index % STATIONS.length) + STATIONS.length) % STATIONS.length];
  return lang === 'ja' ? s.kanji : s.romaji;
}

/**
 * Rend une réplique : langue de l'interface, genre du PNJ, et noms de gares
 * substitués — `{next}` la gare vers laquelle on roule, `{here}` celle dont le
 * quai est là.
 */
export function renderLine(line: DialogueLine, lang: Lang, feminine: boolean, ctx: DialogueCtx): string {
  const raw = genderOf(line.t[lang], feminine);
  return raw
    .replace(/\{next\}/g, () => stationName(ctx.nextIndex, lang))
    .replace(/\{here\}/g, () => stationName(ctx.hereIndex, lang));
}
