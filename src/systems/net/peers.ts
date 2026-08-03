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
  /** Dernier message reçu de lui, quelle qu'en soit la nature (ms). */
  lastSeen: number;
  /**
   * Présence à l'écran, 0..1.
   *
   * Un pair qui se tait ne disparaît pas d'un coup : son avatar s'estompe. Un
   * personnage qui s'évapore en une image se remarque bien davantage qu'un
   * personnage qui s'efface en une demi-seconde, et le réseau hoquette assez
   * souvent pour que la différence compte.
   */
  fade: number;
}

/** Le roster, indexé par identifiant d'onglet. Muté, jamais remplacé. */
export const peers = new Map<string, Peer>();

/** Durée du fondu d'apparition et de disparition (s). */
const FADE_S = 0.4;

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
    lastSeen: now,
    fade: 0,
  };
}

/** Range une pose reçue dans le tampon de son émetteur. */
export function receivePose(id: string, pose: Pose, now: number): void {
  const peer = peers.get(id);
  if (!peer) return;
  peer.lastSeen = now;
  pushSample(peer.poses, { ...pose });
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
    const perdu = isStale(peer.poses, now);
    const cible = perdu ? 0 : 1;
    const pas = dt / FADE_S;
    peer.fade = cible > peer.fade ? Math.min(cible, peer.fade + pas) : Math.max(cible, peer.fade - pas);
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
      continue;
    }
    peers.set(p.id, makePeer(p.id, p.name, p.avatar, p.mode, p.joinedAt, now, p.attached));
  }
  for (const id of [...peers.keys()]) {
    if (!vus.has(id)) peers.delete(id);
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
