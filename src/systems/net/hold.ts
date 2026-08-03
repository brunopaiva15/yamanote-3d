// La rame attend ses passagers, et jusqu'à quand.
//
// --- Le problème que ça résout ----------------------------------------------
//
// Un salon partage UNE rame. Or il y a deux machines à états dans ce jeu : le
// cycle station, qui fait le tour de la boucle, et l'attente de quai
// (`systems/platformWait`), qui fige la gare et regarde passer les trains. Elles
// ne se ressemblent pas et ne s'accordent pas : dès que l'un descend et que
// l'autre reste à bord, leurs mondes divergent pour de bon - l'un avance vers
// Ebisu, l'autre attend à Shibuya, et rien ne les ramènera l'un vers l'autre.
//
// Plutôt que de répliquer `platformWait` - un chantier à lui seul, et qui
// n'apporterait rien tant qu'on n'a pas vu deux joueurs marcher ensemble sur un
// quai -, on empêche la divergence d'arriver : tant qu'un membre du salon a les
// pieds sur le quai, la rame ATTEND.
//
// --- Pourquoi c'était déjà là -----------------------------------------------
//
// `runtime.departureBlockers.heldAtStation` existe depuis longtemps, est lu par
// `departureSequence` en quatre endroits - il coupe la 発車メロディ et retient
// l'autorisation de départ - et n'avait AUCUN producteur. Il attendait
// quelqu'un. Et ce qu'il décrit est parfaitement réel : une rame tenue à quai
// pour laisser monter un voyageur, avec l'annonce qui va avec, c'est le
// quotidien de la Yamanote.
//
// --- Pourquoi un plafond ----------------------------------------------------
//
// Parce que sans lui, un joueur qui pose son casque et va déjeuner immobilise
// tout le salon indéfiniment. Quatre-vingt-dix secondes, c'est deux fois le
// temps d'un arrêt : largement de quoi remonter, et pas assez pour que les
// autres se demandent si le jeu a planté. Passé ce délai, la rame part, et le
// retardataire se DÉTACHE - il continue de jouer et de discuter, mais son monde
// n'est plus celui du salon, et il ne peut plus en être l'hôte.

import { runtime } from '../runtime';
import { setDepartureBlockers } from '../departureSequence';
import { peers } from './peers';
import { netRole } from './worldDecisions';

/**
 * Combien de temps la rame accepte d'attendre un membre resté à quai (s).
 *
 * Deux fois la durée d'un arrêt ordinaire. Au-delà, ce n'est plus quelqu'un qui
 * traîne, c'est quelqu'un qui est parti.
 */
export const HOLD_MAX_S = 90;

/** Temps déjà passé à attendre pour l'arrêt en cours. */
let attente = 0;
/** L'arrêt pour lequel on compte : un nouvel arrêt remet le compteur à zéro. */
let attenteStop = -1;
/** On s'est détaché soi-même : la rame est partie sans nous. */
let detache = false;

export function isDetached(): boolean {
  return detache;
}

/** Le temps d'attente restant (s), pour l'afficher. Zéro si personne n'attend. */
export function holdRemaining(): number {
  if (!runtime.departureBlockers.heldAtStation) return 0;
  return Math.max(0, HOLD_MAX_S - attente);
}

/**
 * Y a-t-il quelqu'un du salon sur le quai ?
 *
 * Nous compris : si c'est NOUS qui sommes descendus, la rame doit nous attendre
 * aussi. Le drapeau `attached` d'un pair vaut faux dès qu'il a laissé la rame
 * partir - celui-là, on ne l'attend plus, il a déjà son propre monde.
 */
function quelquUnAQuai(): boolean {
  if (runtime.playerFrame === 'platform' && !detache) return true;
  for (const p of peers.values()) {
    if (!p.attached) continue;
    const derniere = p.poses[p.poses.length - 1];
    if (derniere && derniere.frame === 1) return true;
  }
  return false;
}

/**
 * Décide si la rame attend, et jusqu'à quand. Une fois par image.
 *
 * Seul l'HÔTE pose le blocage : c'est lui qui décide du départ, et les suiveurs
 * le reçoivent dans le battement. Deux clients qui poseraient chacun leur
 * blocage se retiendraient l'un l'autre sans jamais s'accorder sur la fin de
 * l'attente.
 */
export function updateHold(dt: number): void {
  const role = netRole();
  if (role === 'solo') {
    // Hors salon, ce blocage n'a pas de producteur - comme avant.
    attente = 0;
    attenteStop = -1;
    detache = false;
    return;
  }

  // Un nouvel arrêt : on repart d'une attente vierge.
  if (attenteStop !== runtime.stopSequence) {
    attenteStop = runtime.stopSequence;
    attente = 0;
  }

  // Remonter à bord annule le détachement : on redemande sa place au salon.
  if (detache && runtime.playerFrame === 'car') detache = false;

  if (role !== 'host') return;

  const attendre = quelquUnAQuai() && attente < HOLD_MAX_S;
  if (attendre) attente += dt;

  if (runtime.departureBlockers.heldAtStation !== attendre) {
    setDepartureBlockers({ heldAtStation: attendre });
  }
}

/**
 * La rame est partie sans nous : on se détache.
 *
 * Appelé par `platformWait` quand la rame quittée est hors de vue - c'est le
 * moment précis où les deux mondes cessent d'être le même, et où continuer à
 * faire semblant coûterait plus cher que de le dire.
 */
export function detachSelf(): void {
  if (netRole() === 'solo') return;
  detache = true;
}

/** Quitter le salon remet tout à plat. */
export function resetHold(): void {
  attente = 0;
  attenteStop = -1;
  detache = false;
}
