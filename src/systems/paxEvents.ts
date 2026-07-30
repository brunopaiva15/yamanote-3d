// Petite boîte aux lettres entre les voyageurs et le moteur de conversation.
//
// Les PNJ vivent dans systems/passengers et systems/platformCrowd ; les mots
// dans systems/conversation. Si les premiers appelaient directement le second,
// les trois modules s'importeraient en rond. Ils déposent donc ici un
// événement - « le joueur m'a bousculé », « il vient de s'asseoir à côté » -
// que le moteur relève à son tour de boucle.
//
// La file est courte à dessein : une bousculade d'il y a dix secondes ne
// mérite plus de réponse.

import type { DialogueTrigger } from '../data/dialogue/types';
import type { PaxScope } from './paxTargeting';

export interface PaxEvent {
  scope: PaxScope;
  /** -1 : personne en particulier - au moteur de désigner qui est à portée. */
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

/**
 * Événement sans destinataire : quelque chose vient d'arriver AU JOUEUR (il
 * monte, il s'assoit, la rame entre en gare) et n'importe quel voisin peut le
 * relever. Le moteur choisira qui.
 */
export function pushSceneEvent(trigger: DialogueTrigger): void {
  if (queue.length >= MAX_QUEUED) return;
  if (queue.some((e) => e.trigger === trigger)) return;
  queue.push({ scope: 'car', id: -1, trigger });
}

export function drainPaxEvents(): PaxEvent[] {
  if (queue.length === 0) return EMPTY;
  return queue.splice(0, queue.length);
}

export function clearPaxEvents(): void {
  queue.length = 0;
}

const EMPTY: PaxEvent[] = [];
