// Les autres voyageurs du salon, en données mutées à chaque image.
//
// Même partage que le reste du jeu, et pour la même raison : l'état DISCRET -
// qui est là, comment il s'appelle, qui mène la rame - vit dans un store
// zustand (systems/net/room) et fait re-rendre l'interface quand il change ;
// l'état CONTINU - où chacun se tient, dans quel sens il regarde - vit ici,
// dans un objet ordinaire qu'on écrit huit fois par seconde et qu'on lit
// soixante fois, sans jamais réveiller React.
//
// C'est le contrat que `src/store.ts` énonce dès sa première ligne, et le
// nombre de re-rendus qu'il économise se compte en milliers par minute.

import type { Pose } from './protocol';
import { type PoseSample, isStale, pushSample, sampleAt } from './poseBuffer';

/**
 * Un voyageur distant, tel que le rendu le voit.
 *
 * `identity` n'existe pas ici, contrairement à `Pax` et `CrowdPax` : dans les
 * pools de PNJ, une place et une personne sont deux choses distinctes parce
 * qu'une identité traverse la porte d'un pool à l'autre. Un joueur, lui, EST
 * son identifiant - il n'échange sa place avec personne.
 */
export interface Peer {
  id: string;
  name: string;
  /** Graine d'apparence, telle qu'il l'a publiée. Voir `makeAppearance`. */
  avatar: number;
  mode: 'full' | 'audio';
  /** Encore dans la rame du salon ? Voir systems/net/hostElection. */
  attached: boolean;
  joinedAt: number;
  /** Les dernières poses reçues, triées : le tampon d'interpolation. */
  poses: PoseSample[];
  /**
   * Ce qu'il faut ajouter à SON horloge pour obtenir la NÔTRE (ms).
   *
   * `null` tant qu'on ne l'a jamais entendu. Voir `receivePose` : c'est la
   * pièce sans laquelle deux navigateurs dont les horloges ne sont pas d'accord
   * ne se voient tout simplement pas.
   */
  clockOffset: number | null;
  /** Dernier message reçu de lui, quelle qu'en soit la nature (ms). */
  lastSeen: number;
  /**
   * Présence à l'écran, 0..1.
   *
   * Piloté par la PRÉSENCE - qui est dans le salon - et par elle seule. Un
   * personnage qui s'évapore en une image se remarque bien davantage qu'un
   * personnage qui s'efface en une demi-seconde, d'où le fondu plutôt qu'une
   * disparition sèche.
   */
  fade: number;
  /**
   * Ce pair a-t-il quitté le salon ? Son avatar s'efface, puis on l'oublie.
   *
   * Un drapeau plutôt qu'un `delete` immédiat : sans lui, quelqu'un qui ferme
   * son onglet disparaît d'une image à l'autre, ce qui est très exactement ce
   * que le fondu existe pour éviter.
   */
  gone: boolean;
  /**
   * 0..1 : depuis combien de temps n'a-t-on plus de ses nouvelles.
   *
   * PAS la même chose que `fade`, et les confondre était un défaut visible :
   * un onglet laissé en arrière-plan voit son `requestAnimationFrame` suspendu
   * par le navigateur, donc ses poses cessent - alors que sa présence, elle,
   * tient très bien sur la socket. Le joueur est toujours là ; il ne dit
   * simplement plus où il est. Le faire DISPARAÎTRE revenait à annoncer un
   * départ qui n'avait pas eu lieu.
   *
   * On le laisse donc à l'écran, figé sur sa dernière pose, et on le GRISE.
   */
  away: number;
}

/** Le roster, indexé par identifiant d'onglet. Muté, jamais remplacé. */
export const peers = new Map<string, Peer>();

/** Durée du fondu d'apparition et de disparition (s). */
const FADE_S = 0.4;

/**
 * Durée du passage au gris, et du retour (s).
 *
 * Plus lent que le fondu de présence, et volontairement : le gris dit « je ne
 * sais plus », pas « il est parti ». Une bascule trop vive le ferait clignoter
 * au moindre hoquet du réseau, alors qu'une seconde de dégradé se lit comme
 * quelqu'un qui s'absente.
 */
const AWAY_S = 1;

export function makePeer(
  id: string,
  name: string,
  avatar: number,
  mode: 'full' | 'audio',
  joinedAt: number,
  now: number,
  attached = true,
): Peer {
  return {
    id,
    name,
    avatar,
    mode,
    // Porté par l'appelant, et pas supposé vrai : quelqu'un peut parfaitement
    // ARRIVER dans un salon alors qu'il a déjà laissé sa rame partir - il
    // rejoint depuis un quai, ce qui est le cas normal quand on donne son code
    // à un ami en cours de trajet. Le supposer à bord ferait attendre la rame
    // pour quelqu'un qui n'y montera jamais.
    attached,
    joinedAt,
    poses: [],
    clockOffset: null,
    lastSeen: now,
    fade: 0,
    gone: false,
    away: 0,
  };
}

/**
 * Écart d'horloge au-delà duquel on se réaligne vers le HAUT (ms).
 *
 * Le recalage vers le bas est permanent (voir `receivePose`) : c'est ainsi
 * qu'on converge vers le vrai décalage. Vers le haut, en revanche, il faut se
 * méfier - un unique paquet en retard n'est pas une horloge qui a bougé. Trente
 * secondes ne s'expliquent plus par le réseau : c'est une machine qui sort de
 * veille, une correction NTP, un fuseau qu'on vient de changer. Là, on repart
 * de zéro plutôt que de traîner un décalage devenu faux.
 */
const CLOCK_REANCHOR_MS = 30_000;

/**
 * Range une pose reçue dans le tampon de son émetteur, RAMENÉE À NOTRE HORLOGE.
 *
 * C'est la subtilité de tout ce module, et son absence a coûté cher : une pose
 * porte l'horodatage de l'ÉMETTEUR (`Date.now()` de sa machine), alors que tout
 * ce qui la relit ensuite raisonne avec la nôtre - `peerWorldPose` échantillonne
 * à `now - INTERP_DELAY_MS`, `isStale` compare à `now`. Deux navigateurs dont
 * les horloges diffèrent d'une seconde - ce qui est parfaitement ordinaire, rien
 * ne garantit qu'un téléphone et un portable soient d'accord à la milliseconde -
 * et le tampon paraissait vieux d'une seconde en permanence : le pair était
 * déclaré muet dès son premier message, son fondu ne décollait jamais, et son
 * avatar n'était JAMAIS dessiné. Le salon disait pourtant « 2 voyageurs », le
 * tchat marchait, le monde était synchronisé. On voyait le nom de son ami, on ne
 * voyait pas son ami - et le défaut était à sens unique : celui dont l'horloge
 * était en avance voyait l'autre très bien.
 *
 * Le décalage s'estime par le MINIMUM de `now - pose.t` observé. La gigue du
 * réseau ne fait qu'ajouter du retard, jamais en retirer : le plus petit écart
 * jamais vu est donc le moins pollué, et il s'affine tout seul à mesure qu'un
 * paquet passe plus vite que ses prédécesseurs. On ne calcule surtout pas une
 * moyenne, qui suivrait la congestion au lieu de l'horloge.
 *
 * Les échantillons DÉJÀ rangés sont décalés d'autant quand l'estimation change :
 * un tampon dont les entrées seraient converties avec deux décalages différents
 * ferait des bonds à la lecture.
 */
export function receivePose(id: string, pose: Pose, now: number): void {
  const peer = peers.get(id);
  if (!peer) return;
  peer.lastSeen = now;

  const brut = now - pose.t;
  const connu = peer.clockOffset;
  let decalage = connu ?? brut;
  if (connu !== null && brut < connu) {
    // On vient de mieux mesurer le MÊME décalage : les échantillons déjà rangés
    // portaient donc tous la même erreur, et on la leur retire aussi.
    for (const sample of peer.poses) sample.t += brut - connu;
    decalage = brut;
  } else if (connu !== null && brut > connu + CLOCK_REANCHOR_MS) {
    // Son horloge a bougé, la nôtre aussi peut-être. Les échantillons déjà
    // rangés, eux, ne bougent PAS : ils sont sur notre horloge depuis leur
    // arrivée, et cette conversion-là était juste. Les décaler du saut les
    // enverrait une minute dans l'avenir - ils masqueraient la pose qui arrive
    // et le pair se figerait sur une position périmée.
    decalage = brut;
  }
  peer.clockOffset = decalage;

  pushSample(peer.poses, { ...pose, t: pose.t + decalage });
}

/**
 * La pose à AFFICHER pour un pair, à l'instant demandé, ou `null`.
 *
 * L'instant passé ici est déjà retardé par l'appelant (voir `INTERP_DELAY_MS`) :
 * ce module ne décide pas de la latence de rendu, il l'applique.
 */
export function peerPoseAt(peer: Peer, at: number): PoseSample | null {
  return sampleAt(peer.poses, at);
}

/**
 * Avance les fondus, et rend la liste des pairs à dessiner.
 *
 * Appelée une fois par image depuis la boucle (three/Engine), jamais depuis un
 * composant : c'est la même discipline que `paxList`, dont les composants de
 * rendu ne font que LIRE l'état déjà calculé.
 */
export function updatePeers(dt: number, now: number): void {
  for (const peer of peers.values()) {
    // La présence commande l'existence à l'écran ; le silence ne commande que
    // la couleur. C'est toute la correction : le silence n'est PAS un départ.
    const cible = peer.gone ? 0 : 1;
    const pas = dt / FADE_S;
    peer.fade = cible > peer.fade ? Math.min(cible, peer.fade + pas) : Math.max(cible, peer.fade - pas);

    const muet = isStale(peer.poses, now) ? 1 : 0;
    const pasGris = dt / AWAY_S;
    peer.away =
      muet > peer.away ? Math.min(muet, peer.away + pasGris) : Math.max(muet, peer.away - pasGris);

    // Effacé pour de bon : sa place est libre pour quelqu'un d'autre.
    if (peer.gone && peer.fade <= 0) peers.delete(peer.id);
  }
}

/**
 * Met le roster d'accord avec ce que dit la présence.
 *
 * Les pairs absents de la liste sont retirés, les nouveaux ajoutés, les connus
 * mis à jour SANS PERDRE leur tampon de poses : une simple republication de
 * présence - quelqu'un qui descend sur le quai et met son drapeau `attached` à
 * faux - ne doit pas faire clignoter son avatar en le reconstruisant de zéro.
 */
export function syncRoster(
  present: readonly {
    id: string;
    name: string;
    avatar: number;
    mode: 'full' | 'audio';
    attached: boolean;
    joinedAt: number;
  }[],
  selfId: string,
  now: number,
): void {
  const vus = new Set<string>();
  for (const p of present) {
    // On ne se met pas soi-même dans le roster des autres : on se voit déjà
    // parfaitement bien, et un avatar planté dans sa propre caméra est la
    // première chose qu'on remarque.
    if (p.id === selfId) continue;
    vus.add(p.id);
    const connu = peers.get(p.id);
    if (connu) {
      connu.name = p.name;
      connu.avatar = p.avatar;
      connu.mode = p.mode;
      connu.attached = p.attached;
      connu.joinedAt = p.joinedAt;
      // Il était en train de s'effacer et le voilà de retour : on le rattrape
      // en vol plutôt que de le laisser disparaître pour le reconstruire.
      connu.gone = false;
      continue;
    }
    peers.set(p.id, makePeer(p.id, p.name, p.avatar, p.mode, p.joinedAt, now, p.attached));
  }
  // Sortis du salon : on les marque, `updatePeers` les efface en fondu puis les
  // oublie. Un `delete` ici les ferait disparaître d'une image à l'autre.
  for (const peer of peers.values()) {
    if (!vus.has(peer.id)) peer.gone = true;
  }
}

/** Le roster, sous une forme que l'interface peut afficher et comparer. */
export function rosterSnapshot(): {
  id: string;
  name: string;
  avatar: number;
  attached: boolean;
  joinedAt: number;
}[] {
  return [...peers.values()]
    // Ceux qui s'effacent ne sont plus du salon : ils ne comptent plus dans la
    // liste ni dans l'effectif, même si leur avatar met encore une demi-seconde
    // à s'en aller.
    .filter((p) => !p.gone)
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      attached: p.attached,
      joinedAt: p.joinedAt,
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
}

/** Le dernier instant où l'on a eu des nouvelles de chacun (pour l'élection). */
export function lastSeenMap(): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of peers.values()) out.set(p.id, p.lastSeen);
  return out;
}

/** Quitte le salon : plus personne. */
export function clearPeers(): void {
  peers.clear();
}
