// Une porte qui ne se ferme pas : les nombres de l'affaire.
//
// Sur le E235, un voyageur resté dans l'encadrement ne déclenche pas le
// réflexe d'un ascenseur. La porte rencontre une résistance, s'arrête là où
// elle est, ne se verrouille pas — et RIEN ne bouge tant qu'un humain n'a pas
// agi. Ce qui se passe ensuite tient à trois décisions : combien de temps le
// conducteur met à réagir, combien de temps il maintient la commande de
// réouverture (再開閉スイッチ), et si ça suffit.
//
// Ce module ne tient que ces décisions-là, sans aucune dépendance : la
// mécanique du vantail est dans systems/doorMotion, la procédure dans
// systems/doorObstruction, et les tests (tests/doorObstruction.test.ts)
// prennent ce fichier tel quel.

/**
 * Ce qui est pris dans la porte.
 *
 * `person` : un corps, franc, que la détection sensible voit tout de suite —
 * la porte reste largement entrebâillée.
 * `object` : une sangle de sac, un câble d'écouteur. C'est le cas DIFFICILE :
 * les vantaux se rejoignent presque, il n'y a rien à voir depuis la cabine, et
 * ce qui alerte n'est pas la vue mais l'absence de verrouillage.
 */
export type ObstacleKind = 'person' | 'object';

export interface ObstructionPlan {
  kind: ObstacleKind;
  /**
   * Ouverture résiduelle imposée par l'obstacle, en fraction de course (la
   * course pleine d'un vantail vaut 0,66 m, et les deux s'écartent : 0,2 laisse
   * un passage de 26 cm).
   */
  gap: number;
}

export type Rand = () => number;

function between(a: number, b: number, rand: Rand): number {
  return a + (b - a) * rand();
}

/** Part des obstructions dues à un objet fin plutôt qu'à une personne. */
const OBJECT_SHARE = 0.28;

/** Ouverture résiduelle : un corps tient la porte largement ouverte. */
const PERSON_GAP_MIN = 0.17;
const PERSON_GAP_MAX = 0.26;
/** Une sangle ne tient que quelques centimètres — d'où la difficulté. */
const OBJECT_GAP_MIN = 0.012;
const OBJECT_GAP_MAX = 0.035;

/** Tentatives de réouverture avant que le conducteur ne rouvre tout. */
export const MAX_ATTEMPTS = 3;

/**
 * Probabilité qu'un arrêt donné voie une porte bloquée, selon le taux
 * d'occupation annoncé (en %, voir data/occupancy).
 *
 * À vide personne ne se fait prendre ; à 130 % les portes se referment sur des
 * gens qui n'ont nulle part où reculer. Les bornes gardent l'événement rare
 * sans le rendre anecdotique : de l'ordre d'un arrêt sur vingt-cinq en heure
 * creuse, un sur six en pointe.
 */
export function obstructionChance(percent: number): number {
  const load = Math.max(0, Math.min(1.6, percent / 100));
  return Math.max(0.04, Math.min(0.18, 0.035 + load * 0.1));
}

/** Tire l'obstruction de cet arrêt, ou null s'il n'y en a pas. */
export function drawObstruction(percent: number, rand: Rand = Math.random): ObstructionPlan | null {
  if (rand() >= obstructionChance(percent)) return null;
  return drawObstacle(rand);
}

/** L'obstacle lui-même, une fois décidé qu'il y en a un. */
export function drawObstacle(rand: Rand = Math.random): ObstructionPlan {
  const kind: ObstacleKind = rand() < OBJECT_SHARE ? 'object' : 'person';
  const gap =
    kind === 'person'
      ? between(PERSON_GAP_MIN, PERSON_GAP_MAX, rand)
      : between(OBJECT_GAP_MIN, OBJECT_GAP_MAX, rand);
  return { kind, gap };
}

/**
 * Délai (s) entre le contact et la commande de réouverture.
 *
 * Première tentative : le conducteur arrière voit la scène sur le moniteur, ou
 * ne la voit pas — un objet fin ne se remarque qu'à l'indication de départ qui
 * ne vient pas, et ça prend plus longtemps. Ensuite il ne quitte plus la porte
 * des yeux, et la main est déjà sur la commande.
 */
export function reactionDelay(kind: ObstacleKind, attempt: number, rand: Rand = Math.random): number {
  if (attempt > 1) return between(0.4, 1.2, rand);
  return kind === 'object' ? between(1.6, 3.6, rand) : between(0.5, 2.0, rand);
}

/**
 * Durée (s) d'appui sur la commande de réouverture.
 *
 * Ce n'est pas une durée d'ouverture : c'est un temps d'APPUI, et il court dès
 * l'instant où le conducteur presse. Un vantail met environ deux secondes à
 * s'écarter en grand — une impulsion de six dixièmes ne l'ouvre donc qu'à
 * moitié avant de le renvoyer en arrière, et c'est précisément le geste qu'on
 * fait pour décoincer une sangle. Une tentative qui a échoué appelle la
 * suivante plus généreuse.
 */
export function reopenHold(kind: ObstacleKind, attempt: number, rand: Rand = Math.random): number {
  const extra = (attempt - 1) * 0.6;
  return kind === 'object'
    ? between(0.35, 0.9, rand) + extra
    : between(1.0, 3.0, rand) + extra;
}

/** Chances qu'une tentative dégage réellement l'obstacle, par numéro d'essai. */
const CLEAR_ODDS: Record<ObstacleKind, readonly number[]> = {
  person: [0.62, 0.82, 0.9],
  object: [0.5, 0.75, 0.88],
};

/** L'obstacle est-il dégagé au bout de cette tentative-ci ? */
export function clearsOnAttempt(
  kind: ObstacleKind,
  attempt: number,
  rand: Rand = Math.random,
): boolean {
  const odds = CLEAR_ODDS[kind];
  const p = odds[Math.min(odds.length - 1, Math.max(0, attempt - 1))];
  return rand() < p;
}

/**
 * Durée (s) pendant laquelle TOUTES les portes restent ouvertes quand le
 * conducteur renonce à la seule porte concernée : le temps qu'un agent de quai
 * arrive et dégage lui-même le passage.
 */
export function escalationHold(rand: Rand = Math.random): number {
  return between(4, 7, rand);
}
