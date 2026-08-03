// Le salon : ouvrir le canal, s'y annoncer, savoir qui est là.
//
// Ce module tient l'état DISCRET du multijoueur - suis-je dans un salon, sous
// quel code, avec qui, et qui mène la rame - dans un store zustand, parce que
// c'est de l'état qui change rarement et que l'interface doit suivre. Les
// positions, elles, vivent dans `systems/net/peers` et ne réveillent jamais
// React. C'est le même partage que `src/store.ts` et `systems/runtime`.
//
// Ce qu'il ne fait PAS, et volontairement : il ne touche pas au monde. Le
// battement de l'hôte, les tirages d'arrêt, la resynchronisation sont l'affaire
// de `worldSync`, qui viendra se brancher dessus. Ici, on ne fait qu'ouvrir la
// porte et regarder qui entre - ce qui se teste, se casse et se répare tout
// seul, sans jamais mettre une rame de travers.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { isDev, netClient, netEnabled } from './config';
import { electHostWithLiveness, gateHost, type HostGate, type Member } from './hostElection';
import { clearPeers, lastSeenMap, rosterSnapshot, syncRoster } from './peers';
import { PROTOCOL_VERSION, ROOM_CAPACITY, validPresence, type PresencePayload } from './protocol';
import { makeRoomCode, normalizeRoomCode, roomChannel } from './roomCode';
import { setNetRole } from './worldDecisions';

export { ROOM_CAPACITY } from './protocol';

/**
 * Où en est-on du salon ?
 *
 * `error` n'est pas une erreur de programme mais une réponse à afficher : le
 * salon est plein, le réseau ne répond pas, le code est refusé. Elle se lit
 * dans l'interface et se dissipe dès qu'on retente.
 */
export type RoomStatus = 'idle' | 'joining' | 'joined' | 'error';

/** Pourquoi ça n'a pas marché, dans un vocabulaire que l'i18n sait traduire. */
export type RoomError = 'network' | 'full' | 'code';

export interface RosterEntry {
  id: string;
  name: string;
  avatar: number;
  attached: boolean;
  joinedAt: number;
}

interface RoomState {
  status: RoomStatus;
  error: RoomError | null;
  /** Code du salon courant, en majuscules, ou `null`. */
  code: string | null;
  /** Notre propre identifiant d'onglet dans ce salon. */
  selfId: string;
  selfName: string;
  selfAvatar: number;
  /** Les AUTRES, triés par ancienneté. Nous n'y sommes pas. */
  roster: RosterEntry[];
  /** Qui mène la rame, nous compris. `null` si personne ne la mène. */
  hostId: string | null;
}

export const useRoom = create<RoomState>(() => ({
  status: 'idle',
  error: null,
  code: null,
  selfId: '',
  selfName: '',
  selfAvatar: 0,
  roster: [],
  hostId: null,
}));

/**
 * Efface le dernier reproche affiché.
 *
 * Appelé quand le joueur corrige sa saisie : un message d'erreur qui survit à
 * la correction fait croire que la nouvelle valeur est refusée elle aussi. Ne
 * touche pas au statut - on ne sort d'un `error` que par une nouvelle tentative.
 */
export function clearRoomError(): void {
  if (useRoom.getState().error === null) return;
  useRoom.setState({ error: null, status: 'idle' });
}

/** Sommes-nous celui qui tire au sort et publie ? */
export function isHost(): boolean {
  const s = useRoom.getState();
  return s.status === 'joined' && s.hostId !== '' && s.hostId === s.selfId;
}

/** Sommes-nous dans un salon en état de marche ? */
export function inRoom(): boolean {
  return useRoom.getState().status === 'joined';
}

// --- Identité de cet onglet -------------------------------------------------

function tabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Longueur maximale d'un prénom affiché. */
export const NAME_MAX_LENGTH = 16;

/**
 * Nettoie un prénom : une ligne, pas de commandes, seize caractères.
 *
 * Il s'affiche dans le roster et au-dessus des têtes ; les mêmes précautions
 * que pour le tchat s'appliquent, en plus court.
 */
export function sanitizeName(raw: string): string {
  if (typeof raw !== 'string') return '';
  let out = '';
  let n = 0;
  for (const ch of raw.replace(/\s+/gu, ' ').trim()) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) continue;
    if (cp >= 0x200b && cp <= 0x200f) continue;
    if (cp >= 0x202a && cp <= 0x202e) continue;
    if (n >= NAME_MAX_LENGTH) break;
    out += ch;
    n++;
  }
  return out.trim();
}

/**
 * Une graine d'apparence dérivée de l'identifiant (FNV-1a, 32 bits).
 *
 * Pour que quelqu'un qui n'a rien choisi ait quand même une silhouette stable :
 * même onglet, même personne, d'un bout à l'autre de la session. La graine est
 * ensuite PUBLIÉE et non recalculée par les autres (voir protocol) - la dériver
 * chacun de son côté marcherait tout aussi bien aujourd'hui et casserait le jour
 * où l'on offrira de choisir son allure.
 */
export function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// --- Le paramètre d'URL -----------------------------------------------------
//
// Même forme que `?mode=` et `?lang=` (systems/gameMode, i18n/strings) : lu au
// démarrage, écrit par `replaceState`, retiré quand il ne s'applique plus. Un
// lien de salon se partage donc comme n'importe quel lien du jeu.

const ROOM_PARAM = 'room';

/** Le code présent dans l'URL, s'il est valide. Sinon `null`. */
export function roomFromUrl(): string | null {
  if (typeof location === 'undefined') return null;
  try {
    const raw = new URL(location.href).searchParams.get(ROOM_PARAM);
    return raw === null ? null : normalizeRoomCode(raw);
  } catch {
    return null;
  }
}

function applyRoomToUrl(code: string | null): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const url = new URL(location.href);
    if (code === null) url.searchParams.delete(ROOM_PARAM);
    else url.searchParams.set(ROOM_PARAM, code);
    history.replaceState(null, '', url.toString());
  } catch {
    /* URL non modifiable (iframe, politique du navigateur) : sans importance */
  }
}

// --- Le canal ---------------------------------------------------------------

let channel: RealtimeChannel | null = null;
let joinedAt = 0;
/** Élection retenue, et depuis quand : voir HOST_GRACE_MS. */
let pendingHost: HostGate | null = null;

/** Ce que les autres modules du salon branchent sur le canal (tchat, monde). */
type Handler = (event: string, payload: unknown) => void;
const handlers = new Set<Handler>();

export function onRoomMessage(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Distribue un message à tous les abonnés.
 *
 * Sorti du rappel du canal pour deux raisons. La première est que ce rappel n'a
 * plus qu'une ligne, ce qui se relit mieux. La seconde est qu'un test peut
 * alors éprouver le TRAITEMENT des messages - déduplication, nettoyage, débit -
 * sans avoir besoin d'un serveur Supabase, en empruntant exactement le chemin
 * qu'ils prennent en vrai. Une réception éprouvée par un chemin parallèle
 * n'éprouve que le chemin parallèle.
 */
export function deliverRoomMessage(event: string, payload: unknown): void {
  for (const handler of handlers) handler(event, payload);
}

/**
 * Diffuse un message dans le salon. Sans effet hors salon.
 *
 * Ne rend rien et n'attend rien : `ack: false` côté client, et le protocole est
 * bâti pour supporter la perte (voir worldDecisions, sur la marge de vingt
 * secondes entre un tirage et son premier usage). Attendre un accusé doublerait
 * la latence pour une garantie dont personne n'a besoin.
 */
export function roomSend(event: string, payload: Record<string, unknown>): void {
  if (!channel) return;
  void channel.send({ type: 'broadcast', event, payload });
}

/** Notre présence, republiée quand elle change. */
function selfPresence(attached: boolean): PresencePayload {
  const s = useRoom.getState();
  return {
    v: PROTOCOL_VERSION,
    id: s.selfId,
    joinedAt,
    name: s.selfName,
    avatar: s.selfAvatar,
    mode: 'full',
    attached,
  };
}

let selfAttached = true;

/**
 * Dit au salon qu'on est monté ou descendu de LA rame.
 *
 * C'est ce drapeau qui décide qui peut être élu hôte : quelqu'un qui a laissé
 * la rame partir sans lui vit dans un autre monde, et en faire l'autorité
 * téléporterait tout le salon sur son quai.
 */
export function setAttached(attached: boolean): void {
  if (selfAttached === attached) return;
  selfAttached = attached;
  if (channel) void channel.track(selfPresence(attached));
}

function refreshRoster(now: number): void {
  if (!channel) return;
  const etat = channel.presenceState<PresencePayload>();
  const presents: PresencePayload[] = [];
  for (const entrees of Object.values(etat)) {
    for (const brut of entrees) {
      // Un onglet resté ouvert sur une version antérieure du protocole ne doit
      // ni figurer au roster ni peser dans l'élection : il ne parle pas la même
      // langue, et l'élire reviendrait à confier la rame à un muet.
      if (validPresence(brut)) presents.push(brut);
    }
  }

  const self = useRoom.getState().selfId;
  syncRoster(presents, self, now);

  // Le plafond est CONSULTATIF, et il faut le dire : sans serveur, personne ne
  // peut refuser une connexion. On applique donc la règle sur soi-même - si je
  // ne suis pas dans les huit plus anciens, je m'en vais - ce qui converge
  // parce que tout le monde voit le même roster et applique le même tri.
  const parAnciennete = [...presents].sort(
    (a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1),
  );
  const rang = parAnciennete.findIndex((p) => p.id === self);
  if (rang >= ROOM_CAPACITY) {
    leaveRoom('full');
    return;
  }

  const membres: Member[] = presents.map((p) => ({
    id: p.id,
    joinedAt: p.joinedAt,
    attached: p.attached,
  }));
  const elu = electHostWithLiveness(membres, lastSeenMap(), now);

  // Délai de grâce : Supabase publie ses synchronisations avec un peu de gigue,
  // et une arrivée suivie d'un départ dans la même seconde peut se présenter
  // dans deux ordres différents chez deux clients. Sans ce délai, l'autorité
  // changerait de main deux fois par seconde, et chaque bascule coûte un
  // battement hors cadence.
  const actuel = useRoom.getState().hostId;
  const porte = gateHost(elu, actuel, pendingHost, now);
  pendingHost = porte.pending;
  if (!porte.settled) {
    // On DIFFÈRE, on n'abandonne pas : c'est la minuterie ci-dessous qui
    // reprendra la décision. Sans elle, une élection différée ne serait jamais
    // reprise dans un salon où plus personne n'arrive ni ne part - et c'est
    // très exactement le bogue qui laissait deux joueurs rouler dans deux
    // mondes séparés en se voyant l'un l'autre.
    useRoom.setState({ roster: rosterSnapshot() });
    return;
  }

  setNetRole(elu !== null && elu === self ? 'host' : 'follower');
  useRoom.setState({ roster: rosterSnapshot(), hostId: elu });
}

/**
 * Période de reprise de l'élection (ms).
 *
 * L'élection ne peut pas se contenter des événements de présence : ils ne se
 * produisent qu'aux arrivées et aux départs, alors que deux des règles qui la
 * gouvernent dépendent du TEMPS - le délai de grâce, et le silence au bout
 * duquel on considère un hôte muet. Une seconde est bien assez fine pour les
 * deux, et assez lâche pour ne rien coûter.
 */
const ELECTION_TICK_MS = 1_000;
let electionTimer = 0;

function startElectionTimer(): void {
  if (electionTimer) return;
  electionTimer = window.setInterval(() => refreshRoster(Date.now()), ELECTION_TICK_MS);
}

function stopElectionTimer(): void {
  if (electionTimer) window.clearInterval(electionTimer);
  electionTimer = 0;
}

// --- Entrer, sortir ---------------------------------------------------------

/** Délai au-delà duquel on renonce à rejoindre et l'on embarque en solo (ms). */
const JOIN_TIMEOUT_MS = 5_000;

async function open(code: string, name: string): Promise<boolean> {
  const client = await netClient();
  if (!client) {
    useRoom.setState({ status: 'error', error: 'network' });
    return false;
  }

  const id = tabId();
  joinedAt = Date.now();
  selfAttached = true;
  useRoom.setState({
    status: 'joining',
    error: null,
    code,
    selfId: id,
    selfName: name,
    selfAvatar: seedFromId(id),
    roster: [],
    hostId: null,
  });

  const ch = client.channel(roomChannel(code), {
    config: {
      presence: { key: id },
      // `self: false` : se recevoir soi-même doublerait chaque message pour
      // rien. `ack: false` : voir `roomSend`.
      broadcast: { self: false, ack: false },
    },
  });
  channel = ch;

  ch.on('presence', { event: 'sync' }, () => refreshRoster(Date.now()));
  ch.on('broadcast', { event: '*' }, (message) => {
    const m = message as { event?: string; payload?: unknown };
    deliverRoomMessage(m.event ?? '', m.payload);
  });

  return await new Promise<boolean>((resolve) => {
    let regle = false;
    const finir = (ok: boolean) => {
      if (regle) return;
      regle = true;
      resolve(ok);
    };
    // On n'attend pas indéfiniment : un service tiers qui ne répond pas ne doit
    // pas laisser le joueur devant un menu bloqué. Passé le délai, on embarque
    // en solo et l'on dit pourquoi, discrètement.
    const minuterie = setTimeout(() => {
      if (regle) return;
      leaveRoom('network');
      finir(false);
    }, JOIN_TIMEOUT_MS);

    void ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(minuterie);
        // Republier la présence à CHAQUE abonnement, pas seulement au premier :
        // supabase-js rétablit sa socket tout seul après une coupure, et
        // rappelle ce gestionnaire - mais notre entrée de présence, elle, a été
        // retirée pendant le silence. Sans ce `track`, on revient dans le salon
        // en fantôme : on voit tout le monde, personne ne nous voit.
        void ch.track(selfPresence(selfAttached));
        const reprise = useRoom.getState().status === 'joined';
        useRoom.setState({ status: 'joined', error: null });
        applyRoomToUrl(code);
        startElectionTimer();
        // Sur une REPRISE, on ne résout pas la promesse d'entrée (elle l'est
        // depuis longtemps) : on prévient ceux qui écoutent, à charge pour eux
        // de redemander l'état du monde.
        if (reprise) for (const handler of handlers) handler('resubscribed', null);
        finir(true);
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(minuterie);
        // Une erreur PENDANT la partie n'est pas une erreur d'entrée : le monde
        // tourne déjà en local et continuera très bien sans le salon. On sort
        // proprement plutôt que d'afficher un message d'échec à quelqu'un qui
        // roule depuis vingt minutes.
        if (regle) {
          leaveRoom(null);
          return;
        }
        leaveRoom('network');
        finir(false);
      }
    });
  });
}

/** Crée un salon et y entre. Rend le code, ou `null` si ça n'a pas marché. */
export async function createRoom(name: string): Promise<string | null> {
  if (!netEnabled) return null;
  const code = makeRoomCode();
  const ok = await open(code, sanitizeName(name));
  return ok ? code : null;
}

/**
 * Rejoint un salon existant. Rend le code normalisé, ou `null`.
 *
 * Un code refusé n'ouvre aucune connexion : on le dit tout de suite plutôt que
 * d'ouvrir un canal vide où le joueur attendrait des amis qui sont ailleurs.
 */
export async function joinRoom(raw: string, name: string): Promise<string | null> {
  if (!netEnabled) return null;
  const code = normalizeRoomCode(raw);
  if (code === null) {
    useRoom.setState({ status: 'error', error: 'code' });
    return null;
  }
  const ok = await open(code, sanitizeName(name));
  return ok ? code : null;
}

/**
 * Quitte le salon. Le monde ne bouge pas : il tournait déjà en local.
 *
 * C'est la propriété la plus rassurante de toute l'architecture, et elle vaut
 * d'être dite ici : couper le réseau en pleine course ne fait rien d'autre que
 * rendre les autres invisibles. La rame continue, l'annonce suivante sort à
 * l'heure, la mélodie sonne. On repasse en solo, littéralement.
 */
export function leaveRoom(error: RoomError | null = null): void {
  const ch = channel;
  channel = null;
  stopElectionTimer();
  pendingHost = null;
  selfAttached = true;
  if (ch) {
    void ch.untrack();
    void ch.unsubscribe();
  }
  clearPeers();
  setNetRole('solo');
  applyRoomToUrl(null);
  useRoom.setState({
    status: error ? 'error' : 'idle',
    error,
    code: null,
    roster: [],
    hostId: null,
  });
}

// Outils de mise au point, dans la lignée des `__jumpTo` et `__crowd` du reste
// du jeu. `__joinFake` pose l'état d'un salon SANS ouvrir de canal : c'est ce
// qui permet d'éprouver l'interface du tchat et des avatars dans un vrai
// navigateur sans avoir de serveur Supabase sous la main - et c'est très
// exactement la moitié du multijoueur qu'on peut ainsi vérifier pour de bon.
if (isDev() && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.__joinFake = (code = 'DEV123', name = 'Moi') => {
    useRoom.setState({
      status: 'joined',
      error: null,
      code,
      selfId: 'dev-self',
      selfName: name,
      selfAvatar: seedFromId('dev-self'),
      roster: [],
      hostId: 'dev-self',
    });
  };
  w.__room = () => useRoom.getState();
}

// Onglet fermé : on se retire proprement plutôt que d'attendre que Supabase
// s'aperçoive du silence. Les autres voient l'avatar disparaître tout de suite,
// et l'élection se refait sans le délai d'expiration.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (channel) leaveRoom();
  });
}
