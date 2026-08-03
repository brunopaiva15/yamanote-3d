// Se parler dans la rame.
//
// Un store à part, et surtout PAS `systems/subtitles`. La tentation sera forte -
// les deux affichent du texte par-dessus la scène, les deux tiennent un journal
// des dernières lignes - et il faut y résister : `subtitles` décrit « ce qui a
// été dit ou sonné » PAR UNE SONORISATION. Il porte un `channel` qui vaut
// « cabin » ou « platform », des `SoundCue` nommés, une langue de synthèse
// vocale. Un joueur qui écrit n'est rien de tout ça : il n'a pas de haut-parleur,
// il ne fait pas partie du monde, et le sous-titrer reviendrait à prétendre que
// le chef de train a parlé.
//
// Ce qui EST partagé, en revanche, c'est l'allure : `ui/Chat` reprend le bloc du
// bandeau de sous-titres, sa lisibilité par-dessus la scène et sa place dans la
// pile. Deux façons d'afficher du texte auraient l'air de deux jeux.

import { create } from 'zustand';
import { bucketFor, sanitize, takeToken, type Bucket } from './chatLimiter';
import { peers } from './peers';
import { PROTOCOL_VERSION, validChat, type ChatPayload } from './protocol';
import { onRoomMessage, roomSend, useRoom } from './room';

/** Ce qu'on garde à l'écran. Au-delà, les plus vieux tombent. */
const LOG_MAX = 50;

export interface ChatMessage {
  /** `${émetteur}:${compteur}` : dédoublonne une retransmission. */
  key: string;
  from: string;
  /** Le prénom au moment de l'envoi, figé : celui qui parle est celui d'alors. */
  name: string;
  text: string;
  /** Horloge locale de réception (ms). */
  at: number;
  /** C'est nous : l'affichage le distingue sans avoir à comparer des identifiants. */
  self: boolean;
}

interface ChatState {
  messages: readonly ChatMessage[];
  /** Le compositeur est-il ouvert ? Lu par three/Player pour lâcher la souris. */
  open: boolean;
  /**
   * Le dernier envoi a-t-il été refusé par le seau à jetons ?
   *
   * Un booléen et non un message : l'interface grise le bouton un instant, et
   * c'est tout ce qu'il faut dire. Écrire « vous parlez trop vite » à quelqu'un
   * qui discute avec un ami serait à la fois inutile et désagréable.
   */
  throttled: boolean;
}

export const useChat = create<ChatState>(() => ({
  messages: [],
  open: false,
  throttled: false,
}));

/** Le compositeur est-il ouvert ? Lu à 60 fps, donc hors de React. */
let composerOpen = false;

export function chatOpen(): boolean {
  return composerOpen;
}

export function setChatOpen(open: boolean): void {
  if (composerOpen === open) return;
  composerOpen = open;
  useChat.setState({ open, throttled: false });
}

// --- Débit ------------------------------------------------------------------
//
// Deux jeux de seaux, et c'est volontaire : celui d'envoi nous protège de nos
// propres bogues, ceux de réception protègent le salon d'un pair emballé. Un
// seau par pair pour les seconds - un seau commun laisserait un onglet
// déraillé consommer la parole de tout le monde.

const seauEnvoi: { bucket: Bucket | null } = { bucket: null };
const seauxReception = new Map<string, Bucket>();

let compteur = 0;

function pousser(message: ChatMessage): void {
  useChat.setState((s) => {
    // Retransmission : Supabase ne garantit pas l'unicité, et un `hello` de
    // reconnexion peut très bien ramener une phrase déjà lue.
    if (s.messages.some((m) => m.key === message.key)) return s;
    const suite = [...s.messages, message];
    return { messages: suite.length > LOG_MAX ? suite.slice(suite.length - LOG_MAX) : suite };
  });
}

/**
 * Envoie un message. Rend `false` s'il n'est pas parti.
 *
 * Deux raisons de refuser, et une seule se dit à l'écran : un message vide une
 * fois nettoyé (on ne dit rien, il n'y a rien à signaler) et un seau vide (le
 * bouton se grise un instant).
 */
export function sendChat(raw: string): boolean {
  const texte = sanitize(raw);
  if (texte.length === 0) return false;

  const salon = useRoom.getState();
  if (salon.status !== 'joined') return false;

  const now = Date.now();
  if (seauEnvoi.bucket === null) seauEnvoi.bucket = { tokens: 3, at: now };
  if (!takeToken(seauEnvoi.bucket, now)) {
    useChat.setState({ throttled: true });
    return false;
  }

  compteur += 1;
  const charge: ChatPayload = {
    v: PROTOCOL_VERSION,
    from: salon.selfId,
    id: compteur,
    text: texte,
    t: now,
  };
  roomSend('chat', charge as unknown as Record<string, unknown>);

  // On s'affiche soi-même sans attendre : le canal est configuré en
  // `self: false` (on ne se reçoit pas), et surtout personne n'a envie de voir
  // sa propre phrase arriver avec cent millisecondes de retard.
  pousser({
    key: `${salon.selfId}:${compteur}`,
    from: salon.selfId,
    name: salon.selfName,
    text: texte,
    at: now,
    self: true,
  });
  useChat.setState({ throttled: false });
  return true;
}

/**
 * Un message reçu. Nettoyé et limité À NOUVEAU, et ce n'est pas de la paranoïa :
 * le nettoyage à l'envoi protège nos camarades de nos bogues, celui-ci nous
 * protège d'un onglet resté ouvert sur une version d'avant. Personne n'a besoin
 * d'être malveillant pour qu'un message arrive de travers.
 */
function recevoir(brut: unknown): void {
  if (!validChat(brut)) return;
  const m = brut as ChatPayload;
  const texte = sanitize(m.text);
  if (texte.length === 0) return;

  const now = Date.now();
  if (!takeToken(bucketFor(seauxReception, m.from, now), now)) return;

  const pair = peers.get(m.from);
  if (pair) pair.lastSeen = now;

  pousser({
    key: `${m.from}:${m.id}`,
    from: m.from,
    // Le prénom vient du roster et non du message : un pair pourrait sinon
    // s'annoncer sous le nom d'un autre à chaque phrase.
    name: pair?.name ?? '',
    text: texte,
    at: now,
    self: false,
  });
}

/**
 * Ce qu'un pair vient de dire, s'il l'a dit assez récemment pour qu'on
 * l'affiche encore au-dessus de sa tête. Sinon `null`.
 *
 * La durée dépend de la longueur : cinq secondes de base, quarante
 * millisecondes par caractère, neuf secondes au plus. Une bulle de deux mots
 * qui resterait neuf secondes gêne la vue ; une phrase entière qui disparaît en
 * trois ne se lit pas.
 */
export function bubbleFor(id: string, now: number): string | null {
  const messages = useChat.getState().messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.from !== id) continue;
    const duree = Math.min(9_000, 5_000 + m.text.length * 40);
    return now - m.at < duree ? m.text : null;
  }
  return null;
}

// --- Branchement sur le canal ----------------------------------------------

let detacher: (() => void) | null = null;

/** Écoute les messages du salon. Idempotent (StrictMode monte deux fois). */
export function startChat(): void {
  if (detacher) return;
  detacher = onRoomMessage((event, payload) => {
    if (event === 'chat') recevoir(payload);
  });
}

/** Quitte le salon : le journal se vide, les seaux repartent à neuf. */
export function resetChat(): void {
  detacher?.();
  detacher = null;
  seauEnvoi.bucket = null;
  seauxReception.clear();
  compteur = 0;
  composerOpen = false;
  useChat.setState({ messages: [], open: false, throttled: false });
}
