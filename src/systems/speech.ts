// Files d'attente d'annonces vocales. Deux sonorisations parlent dans ce jeu,
// et elles ne se doivent rien : celle de la RAME (次は、渋谷…) et celle de la
// GARE (まもなく、1番線に…). Chacune a sa file, son ordre, son souffle de ligne
// et son bus spatialisé ; les deux peuvent se chevaucher, comme en vrai quand
// on est assis porte ouverte et que le quai annonce la fermeture.
//
// Où on les entend est décidé par audioEngine (paVoiceGain / platVoiceGain) :
// sur le quai la voix de bord est muette, dans la rame celle du quai est un
// lointain. Ce module ne s'occupe que de QUI parle et dans quel ordre.
//
// TOUT passe par un clip Kokoro pré-généré (scripts/announcements-gen.py), joué
// par audioManager sur le bus voulu, donc réellement spatialisé. Il n'existe
// AUCUN repli speechSynthesis : la voix du navigateur sort hors du graphe Web
// Audio — pas de panoramique, pas de souffle de ligne — et son timbre n'est
// celui d'aucune des cinq voix du jeu. Elle s'entendait comme une sixième
// voix, plaquée, au milieu d'annonces gravées.
//
// La contrepartie est qu'un texte sans clip ne se dit pas. C'est voulu : une
// annonce muette passe inaperçue là où une voix étrangère casse la scène. Pour
// que le cas n'arrive jamais, tests/announcementClips.test.ts vérifie que
// chaque texte réellement joué a son MP3 — retoucher un mot d'annonce sans
// regraver fait échouer la suite de tests, pas le rendu sonore.
//
// Les deux files sont vraiment simultanées : deux clips peuvent sonner en même
// temps, chacun sur son bus.

import type { Utterance } from '../data/announcements';
import { announcementClipDuration, announcementClipPath } from '../data/announcementClips';
import { useStore } from '../store';
import { audioManager, paVoiceClose, paVoiceOpen, type VoiceBus } from './audioEngine';

/** Qui parle : la sono de la rame, ou celle de la gare. */
export type SpeechChannel = 'cabin' | 'platform';

/**
 * Ce que la file sait dire : un texte, sa langue, et — pour le quai — le RÔLE
 * VOCAL qui le dit (data/stationAnnouncements). Le rôle n'est pas décoratif :
 * il entre dans la clé du clip, donc c'est lui qui choisit entre la voix du
 * 内回り et celle du 外回り pour un texte que les deux partagent. Les annonces de
 * bord n'en ont pas — une seule voix par langue.
 */
export type SpeechItem = Utterance & { voice?: string };

const BUS: Record<SpeechChannel, VoiceBus> = {
  cabin: 'cabinVoice',
  platform: 'platformVoice',
};

type QueueItem =
  | { kind: 'clip'; path: string; text: string; tries: number; dur: number }
  | { kind: 'pause'; ms: number };

/**
 * Une seule reprise quand un clip ne se charge pas : un cache froid ou une
 * coupure d'un instant se rattrape, un fichier absent non. Au-delà on renonce
 * en silence plutôt que d'immobiliser la file sur une annonce qui ne viendra
 * pas.
 */
const CLIP_RETRIES = 1;
/** Délai avant la reprise (ms) : le temps que le réseau se remette. */
const CLIP_RETRY_MS = 400;

interface ChannelState {
  queue: QueueItem[];
  speaking: boolean;
  /** Génération d'annulation : invalide les callbacks d'un clip en vol. */
  generation: number;
  currentClipPath: string | null;
  /** Durée du clip (ou de la pause) en cours, et l'instant où il a commencé. */
  currentDur: number;
  currentStart: number;
  lineOpen: boolean;
  pauseId: number;
  retryId: number;
}

function newChannel(): ChannelState {
  return {
    queue: [],
    speaking: false,
    generation: 0,
    currentClipPath: null,
    currentDur: 0,
    currentStart: 0,
    lineOpen: false,
    pauseId: 0,
    retryId: 0,
  };
}

/** Horloge murale, en secondes, sans dépendre d'un navigateur pour les tests. */
function nowS(): number {
  return typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000;
}

const channels: Record<SpeechChannel, ChannelState> = {
  cabin: newChannel(),
  platform: newChannel(),
};

const ALL_CHANNELS: SpeechChannel[] = ['cabin', 'platform'];

// Ligne de sonorisation ouverte : souffle spatialisé + déclics d'ouverture et
// de fermeture, qui ancrent la voix sur les diffuseurs.
function openLine(channel: SpeechChannel): void {
  const ch = channels[channel];
  if (ch.lineOpen) return;
  ch.lineOpen = true;
  paVoiceOpen(BUS[channel]);
}

function closeLine(channel: SpeechChannel): void {
  const ch = channels[channel];
  if (!ch.lineOpen) return;
  ch.lineOpen = false;
  paVoiceClose(BUS[channel]);
}

function pump(channel: SpeechChannel): void {
  const ch = channels[channel];
  if (ch.speaking) return;
  if (ch.queue.length === 0) {
    closeLine(channel);
    return;
  }
  if (useStore.getState().muted || useStore.getState().volume <= 0.001) {
    ch.queue.length = 0;
    closeLine(channel);
    return;
  }
  const item = ch.queue.shift()!;
  if (item.kind === 'pause') {
    ch.speaking = true;
    ch.currentDur = item.ms / 1000;
    ch.currentStart = nowS();
    ch.pauseId = window.setTimeout(() => {
      ch.pauseId = 0;
      ch.speaking = false;
      pump(channel);
    }, item.ms);
    return;
  }
  playClipItem(channel, item);
}

// Clip pré-généré, joué sur le bus spatialisé du canal. Introuvable après sa
// reprise (déploiement partiel, cache froid) : on passe au suivant sans bruit.
function playClipItem(channel: SpeechChannel, item: QueueItem & { kind: 'clip' }): void {
  const ch = channels[channel];
  ch.speaking = true;
  ch.currentClipPath = item.path;
  ch.currentDur = item.dur;
  ch.currentStart = nowS();
  const g = ch.generation;
  void audioManager.playOnce(item.path, BUS[channel]).then((played) => {
    if (g !== ch.generation) return;
    ch.currentClipPath = null;
    ch.speaking = false;
    if (!played && item.tries < CLIP_RETRIES) {
      ch.retryId = window.setTimeout(() => {
        ch.retryId = 0;
        if (g !== ch.generation) return;
        ch.queue.unshift({ ...item, tries: item.tries + 1 });
        pump(channel);
      }, CLIP_RETRY_MS);
      return;
    }
    if (!played) {
      console.warn(`[speech] Clip introuvable, annonce passée : ${item.text}`);
    }
    pump(channel);
  });
}

/**
 * Met une séquence en file. `channel` dit QUELLE sono parle : celle de la rame
 * (défaut) ou celle de la gare. Les deux files avancent en parallèle.
 *
 * `leadMs` retarde le premier mot sans retarder la mise en file : c'est ce qui
 * laisse un carillon ou un signal finir avant que la voix ne commence, au lieu
 * de démarrer par-dessus ses dernières notes.
 */
export function say(
  items: readonly SpeechItem[],
  channel: SpeechChannel = 'cabin',
  leadMs = 0,
): void {
  const { muted, volume } = useStore.getState();
  if (muted || volume <= 0.001) return;
  const ch = channels[channel];
  if (leadMs > 0 && items.length > 0) ch.queue.push({ kind: 'pause', ms: leadMs });
  for (const item of items) {
    const clip = announcementClipPath(item.lang, item.text, item.voice);
    // Sans clip, rien : voir l'en-tête. Le test de couverture est là pour que
    // ce cas ne se produise pas en jeu.
    if (!clip) {
      console.warn(`[speech] Aucun clip pour « ${item.text} » — annonce muette.`);
      continue;
    }
    ch.queue.push({
      kind: 'clip',
      path: clip,
      text: item.text,
      tries: 0,
      dur: announcementClipDuration(item.lang, item.text, item.voice) ?? 0,
    });
  }
  if (ch.queue.length > 0) openLine(channel);
  pump(channel);
}

/**
 * Durée d'une séquence si on la mettait en file (s), pauses de tête exclues.
 * Un segment sans clip compte pour zéro : il ne se dira pas.
 */
export function utteranceDuration(items: readonly SpeechItem[]): number {
  let s = 0;
  for (const item of items) {
    s += announcementClipDuration(item.lang, item.text, item.voice) ?? 0;
  }
  return s;
}

/**
 * Ce qu'il reste à dire sur ce canal (s), segment en cours compris.
 *
 * `speechBusy` répond oui ou non ; cela ne suffit pas à décider s'il reste la
 * place de glisser une consigne d'agent avant la mélodie. Ici on donne la
 * DURÉE, pour qu'un message qui déborderait soit abandonné plutôt que joué
 * trop tard (voir systems/platformWait).
 */
export function speechQueueRemaining(channel: SpeechChannel): number {
  const ch = channels[channel];
  let s = 0;
  if (ch.speaking) s += Math.max(0, ch.currentDur - (nowS() - ch.currentStart));
  for (const item of ch.queue) s += item.kind === 'pause' ? item.ms / 1000 : item.dur;
  return s;
}

/**
 * Cette sono a-t-elle encore quelque chose à dire ? Vrai tant qu'un segment est
 * en cours ou qu'il en reste en file. Sert à qui veut PARLER SANS COUPER : la
 * file sérialise déjà les segments, mais une annonce mise en file derrière une
 * autre sortirait trop tard pour ce qu'elle annonce (voir systems/passingTrain,
 * qui renonce au passage plutôt que d'annoncer une rame déjà repartie).
 */
export function speechBusy(channel: SpeechChannel): boolean {
  const ch = channels[channel];
  return ch.speaking || ch.queue.length > 0;
}

/** Vide une file (ou les deux) et coupe ce qui est en train d'être dit. */
export function cancelSpeech(channel?: SpeechChannel): void {
  const targets = channel ? [channel] : ALL_CHANNELS;
  for (const c of targets) {
    const ch = channels[c];
    ch.generation++;
    ch.queue.length = 0;
    if (ch.pauseId) window.clearTimeout(ch.pauseId);
    if (ch.retryId) window.clearTimeout(ch.retryId);
    ch.pauseId = 0;
    ch.retryId = 0;
    if (ch.currentClipPath) {
      audioManager.stop(ch.currentClipPath);
      ch.currentClipPath = null;
    }
    ch.currentDur = 0;
    ch.speaking = false;
    closeLine(c);
  }
}

// À appeler quand le volume du site change. Les clips passent par le graphe
// Web Audio, dont les bus suivent déjà le curseur : il ne reste qu'à faire
// taire ce qui est en cours quand le son tombe à zéro.
export function applySpeechVolume(): void {
  const { muted, volume } = useStore.getState();
  if (muted || volume <= 0.001) cancelSpeech();
}
