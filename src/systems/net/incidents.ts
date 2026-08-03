// La couture par laquelle le cycle station annonce un incident au réseau.
//
// Elle existe pour une seule raison : casser un cycle d'imports.
//
// `net/worldSync` a besoin de `stationCycle` - il lui pose des instantanés, il
// lui demande son plancher d'événements, il déclenche ses arrêts d'urgence sur
// ordre de l'hôte. C'est le sens naturel : le réseau est la couche du dessus,
// il orchestre.
//
// Mais l'hôte doit aussi annoncer un incident À L'INSTANT où il le déclenche -
// pas au battement suivant. Une demi-seconde de décalage sur une coupure de
// caténaire, c'est une rame qui s'éteint chez l'un et roule encore chez
// l'autre, avec l'éclairage de secours d'un côté et les néons de l'autre. Il
// faut donc que `stationCycle` puisse parler au réseau, et l'import direct
// refermait le graphe.
//
// Ce module ne dépend de RIEN. `stationCycle` appelle `notifyIncident` sans
// savoir si quelqu'un écoute ; `worldSync` s'inscrit s'il en a l'usage. C'est
// le même procédé que `systems/paxEvents`, qui existe depuis longtemps pour
// exactement ce genre de raison.

/** Les deux natures d'arrêt subi (voir systems/runtime, EmergencyKind). */
export type IncidentKind = 'emergency' | 'outage';

let ecoute: ((kind: IncidentKind) => void) | null = null;

/**
 * S'inscrire pour être prévenu. Un seul auditeur, et c'est voulu : il n'y en a
 * qu'un possible - le réseau -, et un `Set` laisserait croire le contraire.
 */
export function onIncident(handler: ((kind: IncidentKind) => void) | null): void {
  ecoute = handler;
}

/** Un incident vient de commencer. Sans auditeur, ne fait rien. */
export function notifyIncident(kind: IncidentKind): void {
  ecoute?.(kind);
}
