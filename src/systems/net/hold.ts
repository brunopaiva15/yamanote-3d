// La rame attend ses passagers. Tous, et aussi longtemps qu'il le faut.
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
// --- POURQUOI LE PLAFOND A DISPARU ------------------------------------------
//
// Il valait quatre-vingt-dix secondes. Passé ce délai la rame partait, et le
// retardataire se DÉTACHAIT : il gardait sa gare, les autres continuaient sans
// lui, et un bouton « Rattraper la rame » proposait de se reposer là où le
// salon en était.
//
// Ça ne tenait pas debout, et le symptôme le disait : resté à quai pendant que
// les autres embarquaient, on voyait LES BÂTIMENTS AVANCER TOUT SEULS. Ce
// n'était pas un défaut de rendu. Le monde d'un suiveur se recale sur celui de
// l'hôte (`systems/net/worldSync`), et la resynchronisation dure écrit
// `runtime.distance` : dès que la rame du salon roulait, notre décor roulait
// avec elle, quai sous les pieds. Deux mondes qui divergent ne se rejoignent pas
// à moitié.
//
// La rame attend donc maintenant que TOUT LE MONDE soit à bord. C'est plus
// simple à expliquer qu'un compte à rebours, c'est vrai d'une vraie ligne quand
// un agent tient une porte, et surtout ça ne peut pas produire deux mondes.
//
// --- Ce qui remplace le plafond ---------------------------------------------
//
// La peur qu'il calmait était réelle : quelqu'un qui pose son casque et va
// déjeuner immobiliserait le salon. La réponse n'est pas un chronomètre, c'est
// la PRÉSENCE. Un onglet fermé disparaît du roster et cesse d'être attendu ; un
// onglet muet - plus une seule pose depuis deux secondes et demie - ne compte
// plus non plus. On attend les joueurs qui jouent, pas les places vides.

import { runtime } from '../runtime';
import { setDepartureBlockers } from '../departureSequence';
import { peers } from './peers';
import { isStale } from './poseBuffer';
import { netRole } from './worldDecisions';

/** Combien de membres du salon ont les pieds sur le quai, nous compris. */
let aQuai = 0;
/** Sommes-nous l'un d'eux ? Le message affiché n'est pas le même. */
let moiAQuai = false;

/** Combien de voyageurs la rame attend. Zéro : elle n'attend personne. */
export function holdingAshore(): number {
  return runtime.departureBlockers.heldAtStation ? aQuai : 0;
}

/** La rame m'attend-elle, MOI ? */
export function holdingSelf(): boolean {
  return runtime.departureBlockers.heldAtStation && moiAQuai;
}

/**
 * Qui du salon est sur le quai ?
 *
 * Nous compris : si c'est NOUS qui sommes descendus, la rame doit nous attendre
 * aussi. Le drapeau `attached` d'un pair vaut faux quand il n'est pas dans le
 * monde du salon - celui-là n'a pas de rame à prendre.
 *
 * Un pair MUET ne compte pas. Ce n'est pas une entorse à la règle « on attend
 * tout le monde » : c'est ce qui la rend tenable. Un onglet fermé met un instant
 * à quitter le roster, et sa dernière pose le montre debout sur le quai pour
 * toujours. On attend les joueurs qui jouent.
 */
function compterAQuai(now: number): void {
  aQuai = 0;
  moiAQuai = runtime.playerFrame === 'platform';
  if (moiAQuai) aQuai++;
  for (const p of peers.values()) {
    if (!p.attached || p.gone) continue;
    if (isStale(p.poses, now)) continue;
    const derniere = p.poses[p.poses.length - 1];
    if (derniere && derniere.frame === 1) aQuai++;
  }
}

/**
 * Décide si la rame attend. Une fois par image.
 *
 * Seul l'HÔTE pose le blocage : c'est lui qui décide du départ, et les suiveurs
 * le reçoivent dans le battement. Deux clients qui poseraient chacun leur
 * blocage se retiendraient l'un l'autre sans jamais s'accorder sur la fin de
 * l'attente.
 *
 * Le comptage, lui, se fait CHEZ TOUT LE MONDE : c'est ce qui permet à un
 * suiveur d'afficher pourquoi les portes ne se ferment pas, sans attendre que
 * l'hôte le lui dise.
 */
export function updateHold(now: number = Date.now()): void {
  const role = netRole();
  if (role === 'solo') {
    // Hors salon, ce blocage n'a pas de producteur - comme avant.
    aQuai = 0;
    moiAQuai = false;
    return;
  }

  compterAQuai(now);
  if (role !== 'host') return;

  const attendre = aQuai > 0;
  if (runtime.departureBlockers.heldAtStation !== attendre) {
    setDepartureBlockers({ heldAtStation: attendre });
  }
}

/** Quitter le salon remet tout à plat. */
export function resetHold(): void {
  aQuai = 0;
  moiAQuai = false;
}
