// Petite boîte aux lettres entre les voyageurs et le moteur de conversation.
//
// Les PNJ vivent dans systems/passengers et systems/platformCrowd ; les mots
// dans systems/conversation. Si les premiers appelaient directement le second,
// les trois modules s'importeraient en rond. Ils déposent donc ici un
// événement — « le joueur m'a bousculé », « il vient de s'asseoir à côté » —
// que le moteur relève à son tour de boucle.
//
// La file est courte à dessein : une bousculade d'il y a dix secondes ne
// mérite plus de réponse.

import type { DialogueTrigger } from '../data/dialogue/types';
import type { PaxScope } from './paxTargeting';

export interface PaxEvent {
  scope: PaxScope;
  id: number;
  trigger: DialogueTrigger;
}

const queue: PaxEvent[] = [];
const MAX_QUEUED = 6;

export function pushPaxEvent(scope: PaxScope, id: number, trigger: DialogueTrigger): void {
  if (queue.length >= MAX_QUEUED) return;
  // Un même voyageur ne fait pas la queue deux fois.
  if (queue.some((e) => e.scope === scope && e.id === id)) return;
  queue.push({ scope, id, trigger });
}

export function drainPaxEvents(): PaxEvent[] {
  if (queue.length === 0) return EMPTY;
  return queue.splice(0, queue.length);
}

export function clearPaxEvents(): void {
  queue.length = 0;
}

const EMPTY: PaxEvent[] = [];
