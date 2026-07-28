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
// Chaque annonce est d'abord cherchée en CLIP pré-généré (Kokoro TTS, voir
// scripts/announcements-gen.py) — joué par audioManager sur le bus voulu, donc
// réellement spatialisé. speechSynthesis ne sert que de REPLI pour un texte
// sans clip ; sans voix ja-JP, seul l'anglais est alors émis.
//
// Robustesse navigateurs :
// - iOS / Safari : la synthèse doit être amorcée DANS le geste utilisateur ;
//   initSpeech() parle une utterance silencieuse au clic « Monter à bord ».
// - Chrome : les utterances longues sont coupées (~15 s) sans onend ; on
//   découpe donc par phrases, avec un keep-alive pause/resume et un filet
//   de sécurité si aucun événement de fin n'arrive.
// - Edge : les voix « Online (Natural) » (Nanami, Aria) sont des voix réseau
//   qui peuvent échouer en silence — aucun son, pas de onstart, parfois aucun
//   événement. Si une voix ne démarre pas, on la met en liste noire pour la
//   session et on rejoue le segment avec la voix suivante. pause() tue aussi
//   ces voix réseau dans Chromium : le keep-alive est réservé aux voix locales.
//
// speechSynthesis est une ressource UNIQUE : il n'y a qu'une bouche pour deux
// files. Le canal qui la tient bloque l'autre le temps de son segment (voir
// ttsOwner) — les clips, eux, sont vraiment simultanés.
//
// Spatialisation du repli : speechSynthesis sort directement sur la carte
// son, hors du graphe Web Audio — impossible de le panner. On l'ancre aux
// diffuseurs par deux biais : le souffle de ligne spatialisé, ouvert pendant
// toute l'annonce (paVoiceOpen/paVoiceClose), et le volume de l'utterance qui
// suit la distance au diffuseur le plus proche (speakerProximity).

import type { Utterance } from '../data/announcements';
import { announcementClipPath } from '../data/announcementClips';
import { useStore } from '../store';
import {
  audioManager,
  paVoiceClose,
  paVoiceOpen,
  speakerProximity,
  type VoiceBus,
} from './audioEngine';

/** Qui parle : la sono de la rame, ou celle de la gare. */
export type SpeechChannel = 'cabin' | 'platform';

const BUS: Record<SpeechChannel, VoiceBus> = {
  cabin: 'cabinVoice',
  platform: 'platformVoice',
};

type QueueItem =
  | { kind: 'clip'; path: string; lang: Utterance['lang']; text: string }
  | { kind: 'tts'; lang: Utterance['lang']; text: string }
  | { kind: 'pause'; ms: number };

interface ChannelState {
  queue: QueueItem[];
  speaking: boolean;
  /** Génération d'annulation : invalide les callbacks d'un clip en vol. */
  generation: number;
  currentClipPath: string | null;
  lineOpen: boolean;
  pauseId: number;
  /** Attente du tour de parole quand l'autre canal tient speechSynthesis. */
  deferId: number;
}

function newChannel(): ChannelState {
  return {
    queue: [],
    speaking: false,
    generation: 0,
    currentClipPath: null,
    lineOpen: false,
    pauseId: 0,
    deferId: 0,
  };
}

const channels: Record<SpeechChannel, ChannelState> = {
  cabin: newChannel(),
  platform: newChannel(),
};

const ALL_CHANNELS: SpeechChannel[] = ['cabin', 'platform'];

// --- État de speechSynthesis (ressource unique, partagée) ----------------

let voicesReady = false;
let jaVoice: SpeechSynthesisVoice | null = null;
let enVoice: SpeechSynthesisVoice | null = null;
let watchdogId = 0;
let startWatchdogId = 0;
let retryId = 0;
let keepAliveId = 0;
let volumeSyncId = 0;
let currentUtterance: SpeechSynthesisUtterance | null = null;
/** Canal qui tient la bouche unique, null si elle est libre. */
let ttsOwner: SpeechChannel | null = null;

// Voix qui n'ont jamais produit de son : écartées jusqu'au rechargement.
const badVoices = new Set<string>();

function voiceKey(v: SpeechSynthesisVoice): string {
  return `${v.voiceURI}|${v.name}|${v.lang}`;
}

// Niveau utterance : volume du site × proximité du diffuseur (hors graphe Tone).
function speechLevel(channel: SpeechChannel): number {
  const { muted, volume } = useStore.getState();
  if (muted || volume <= 0.001) return 0;
  return Math.min(1, volume * 1.15 * speakerProximity(BUS[channel]));
}

// Applique le volume courant à l'utterance en cours (slider + distance).
function syncSpeechVolume(): void {
  if (!currentUtterance || !ttsOwner) return;
  currentUtterance.volume = speechLevel(ttsOwner);
}

// Voix visées, par langue : les Microsoft Natural annoncées par leur
// identifiant Azure. L'API Web Speech ne les expose pas sous ce nom-là — Edge
// renvoie « Microsoft Server Speech Text to Speech Voice (ja-JP, NanamiNeural) »
// en voiceURI et « Microsoft Nanami Online (Natural) - Japanese (Japan) » en
// name. On teste donc l'identifiant complet, puis le seul prénom de la voix
// (Nanami, Aria), avant de retomber sur l'heuristique féminine.
const PREFERRED_VOICE: Record<string, string> = {
  ja: 'ja-JP-NanamiNeural',
  en: 'en-US-AriaNeural',
};

const FEMALE_HINTS = ['female', 'kyoko', 'o-ren', 'haruka', 'sayaka', 'nanami', 'ayumi', 'samantha', 'zira', 'google'];

// Réduit un nom de voix à ses lettres et chiffres : « (ja-JP, NanamiNeural) »
// et « ja-JP-NanamiNeural » se rejoignent alors sur « jajpnanamineural ».
function normalizeVoiceName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang))
    .filter((v) => !badVoices.has(voiceKey(v)));
  if (voices.length === 0) return null;
  const wanted = PREFERRED_VOICE[lang];
  if (wanted) {
    const id = normalizeVoiceName(wanted);
    // Ex. « ja-JP-NanamiNeural » → « nanami ».
    const firstName = normalizeVoiceName(wanted.split('-').pop() ?? '').replace(/neural$/, '');
    const haystack = (v: SpeechSynthesisVoice) => normalizeVoiceName(`${v.name} ${v.voiceURI}`);
    const exact = voices.find((v) => haystack(v).includes(id));
    if (exact) return exact;
    const byName = firstName.length > 0 ? voices.find((v) => haystack(v).includes(firstName)) : undefined;
    if (byName) return byName;
  }
  const female = voices.find((v) => FEMALE_HINTS.some((h) => v.name.toLowerCase().includes(h)));
  return female ?? voices[0];
}

function refreshVoices(): void {
  jaVoice = pickVoice('ja');
  enVoice = pickVoice('en');
  voicesReady = window.speechSynthesis.getVoices().length > 0;
}

// À appeler de façon SYNCHRONE dans le gestionnaire de clic de démarrage.
export function initSpeech(): void {
  if (!('speechSynthesis' in window)) return;
  refreshVoices();
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  // Amorce silencieuse dans le geste utilisateur : débloque iOS / Safari.
  try {
    window.speechSynthesis.cancel();
    const primer = new SpeechSynthesisUtterance(' ');
    primer.volume = 0;
    window.speechSynthesis.speak(primer);
  } catch {
    /* sans gravité */
  }
}

// Découpe par phrases : évite la coupure Chrome des utterances longues.
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if (ch === '。' || ch === '.') {
      if (buf.trim().length > 0) out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim().length > 0) out.push(buf.trim());
  return out;
}

// Pauses de cadence du japonais, alignées sur les clips Kokoro (voir
// scripts/announcements-gen.py) : respiration aux 、, plus longue aux 。.
const JA_COMMA_PAUSE_MS = 380;
const JA_SENTENCE_PAUSE_MS = 620;

// Items TTS d'un texte sans clip. Anglais : découpe par phrases (suffisant,
// speechSynthesis marque bien la ponctuation anglaise). Japonais : segments
// aux 、/。 séparés par de vraies pauses — sinon la voix enchaîne
// 「まもなく、渋谷、渋谷。」d'une traite.
function ttsItems(lang: Utterance['lang'], text: string): QueueItem[] {
  if (lang !== 'ja-JP') {
    return splitSentences(text).map((t) => ({ kind: 'tts', lang, text: t }));
  }
  const segments = (text.match(/[^、。]+[、。]?/g) ?? []).filter((s) => s.trim().length > 0);
  const out: QueueItem[] = [];
  for (let i = 0; i < segments.length; i++) {
    out.push({ kind: 'tts', lang, text: segments[i] });
    if (i < segments.length - 1) {
      const ms = segments[i].endsWith('。') ? JA_SENTENCE_PAUSE_MS : JA_COMMA_PAUSE_MS;
      out.push({ kind: 'pause', ms });
    }
  }
  return out;
}

/** Timers de l'utterance en cours (ressource unique). */
function clearTtsTimers(): void {
  if (watchdogId) window.clearTimeout(watchdogId);
  if (startWatchdogId) window.clearTimeout(startWatchdogId);
  if (retryId) window.clearTimeout(retryId);
  if (keepAliveId) window.clearInterval(keepAliveId);
  if (volumeSyncId) window.clearInterval(volumeSyncId);
  watchdogId = 0;
  startWatchdogId = 0;
  retryId = 0;
  keepAliveId = 0;
  volumeSyncId = 0;
}

function releaseTts(): SpeechChannel | null {
  const owner = ttsOwner;
  clearTtsTimers();
  currentUtterance = null;
  ttsOwner = null;
  return owner;
}

function finishUtterance(): void {
  const owner = releaseTts();
  if (owner) {
    channels[owner].speaking = false;
    pump(owner);
  }
  // La bouche est libre : l'autre canal peut avoir un segment en attente.
  for (const c of ALL_CHANNELS) if (c !== owner) pump(c);
}

// Une voix n'a jamais produit de son (voix réseau Edge en échec silencieux) :
// on l'écarte et on rejoue le même segment avec la voix suivante.
function failVoiceAndRetry(
  channel: SpeechChannel,
  item: QueueItem & { kind: 'tts' },
  voice: SpeechSynthesisVoice,
): void {
  console.warn(`[speech] Voix « ${voice.name} » muette — repli sur une autre voix.`);
  badVoices.add(voiceKey(voice));
  refreshVoices();
  if (currentUtterance) {
    currentUtterance.onstart = null;
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
  }
  releaseTts();
  channels[channel].queue.unshift(item);
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* sans gravité */
  }
  // Chromium avale un speak() lancé dans la foulée d'un cancel() : on laisse
  // retomber la poussière avant de relancer la file.
  retryId = window.setTimeout(() => {
    retryId = 0;
    channels[channel].speaking = false;
    pump(channel);
  }, 250);
}

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
  const item = ch.queue[0];
  if (item.kind === 'tts' && ttsOwner !== null && ttsOwner !== channel) {
    // L'autre sono tient la bouche unique : on repasse dans un instant plutôt
    // que de jeter le segment. Les clips, eux, ne s'attendent pas.
    if (ch.deferId) return;
    ch.deferId = window.setTimeout(() => {
      ch.deferId = 0;
      pump(channel);
    }, 200);
    return;
  }
  ch.queue.shift();
  if (item.kind === 'pause') {
    ch.speaking = true;
    ch.pauseId = window.setTimeout(() => {
      ch.pauseId = 0;
      ch.speaking = false;
      pump(channel);
    }, item.ms);
    return;
  }
  if (item.kind === 'clip') {
    playClipItem(channel, item);
    return;
  }
  speakTtsItem(channel, item);
}

// Clip pré-généré : joué sur le bus spatialisé du canal. Fichier introuvable
// (déploiement partiel, cache) → repli speechSynthesis sur le même texte.
function playClipItem(channel: SpeechChannel, item: QueueItem & { kind: 'clip' }): void {
  const ch = channels[channel];
  ch.speaking = true;
  ch.currentClipPath = item.path;
  const g = ch.generation;
  void audioManager.playOnce(item.path, BUS[channel]).then((played) => {
    if (g !== ch.generation) return;
    ch.currentClipPath = null;
    ch.speaking = false;
    if (!played) {
      ch.queue.unshift(...ttsItems(item.lang, item.text));
    }
    pump(channel);
  });
}

// Repli speechSynthesis pour un texte sans clip.
function speakTtsItem(channel: SpeechChannel, item: QueueItem & { kind: 'tts' }): void {
  const ch = channels[channel];
  if (!('speechSynthesis' in window)) {
    pump(channel);
    return;
  }
  if (!voicesReady) refreshVoices();
  // Sans voix japonaise disponible : sauter les segments japonais.
  if (item.lang === 'ja-JP' && !jaVoice) {
    pump(channel);
    return;
  }
  const u = new SpeechSynthesisUtterance(item.text);
  u.lang = item.lang;
  const voice = item.lang === 'ja-JP' ? jaVoice : enVoice;
  if (voice) u.voice = voice;
  u.rate = item.lang === 'ja-JP' ? 0.97 : 0.9;
  u.pitch = 1.03;
  // Le niveau suit le volume du site et la distance au diffuseur le plus proche :
  // sous une grille l'annonce claque, au milieu de deux portes elle recule.
  u.volume = speechLevel(channel);
  currentUtterance = u;
  ttsOwner = channel;
  ch.speaking = true;
  let started = false;
  u.onstart = () => {
    started = true;
  };
  u.onend = finishUtterance;
  u.onerror = (e) => {
    // Échec avant le moindre son (Edge « Online (Natural) » sans réseau,
    // synthesis-failed…) : la voix est écartée et le segment rejoué.
    if (!started && voice && e.error !== 'canceled' && e.error !== 'interrupted') {
      failVoiceAndRetry(channel, item, voice);
      return;
    }
    finishUtterance();
  };
  // Filet de sécurité : si onend n'arrive jamais, on libère la file.
  const estimatedMs = 5000 + item.text.length * 260;
  watchdogId = window.setTimeout(() => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* sans gravité */
    }
    finishUtterance();
  }, estimatedMs);
  // Certaines voix réseau échouent en silence, sans aucun événement : si rien
  // n'a démarré au bout de 4 s, on change de voix plutôt que d'attendre le
  // watchdog en laissant l'annonce muette.
  startWatchdogId = window.setTimeout(() => {
    if (started) return;
    if (voice) {
      failVoiceAndRetry(channel, item, voice);
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* sans gravité */
    }
    finishUtterance();
  }, 4000);
  // Keep-alive Chrome : pause/resume périodique pendant la lecture. Réservé
  // aux voix locales — pause() coupe définitivement les voix réseau (Edge
  // Natural) dans Chromium.
  if (!voice || voice.localService) {
    keepAliveId = window.setInterval(() => {
      try {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } catch {
        /* sans gravité */
      }
    }, 10000);
  }
  // Resync volume / proximité pendant l'annonce (le slider et la tête bougent).
  volumeSyncId = window.setInterval(syncSpeechVolume, 200);
  window.speechSynthesis.speak(u);
}

/**
 * Met une séquence en file. `channel` dit QUELLE sono parle : celle de la rame
 * (défaut) ou celle de la gare. Les deux files avancent en parallèle.
 *
 * `leadMs` retarde le premier mot sans retarder la mise en file : c'est ce qui
 * laisse un carillon ou un signal finir avant que la voix ne commence, au lieu
 * de démarrer par-dessus ses dernières notes.
 */
export function say(items: Utterance[], channel: SpeechChannel = 'cabin', leadMs = 0): void {
  const { muted, volume } = useStore.getState();
  if (muted || volume <= 0.001) return;
  const ch = channels[channel];
  if (leadMs > 0 && items.length > 0) ch.queue.push({ kind: 'pause', ms: leadMs });
  for (const item of items) {
    const clip = announcementClipPath(item.lang, item.text);
    if (clip) {
      ch.queue.push({ kind: 'clip', path: clip, lang: item.lang, text: item.text });
      continue;
    }
    ch.queue.push(...ttsItems(item.lang, item.text));
  }
  if (ch.queue.length > 0) openLine(channel);
  pump(channel);
}

/** Vide une file (ou les deux) et coupe ce qui est en train d'être dit. */
export function cancelSpeech(channel?: SpeechChannel): void {
  const targets = channel ? [channel] : ALL_CHANNELS;
  for (const c of targets) {
    const ch = channels[c];
    ch.generation++;
    ch.queue.length = 0;
    if (ch.pauseId) window.clearTimeout(ch.pauseId);
    if (ch.deferId) window.clearTimeout(ch.deferId);
    ch.pauseId = 0;
    ch.deferId = 0;
    if (ch.currentClipPath) {
      audioManager.stop(ch.currentClipPath);
      ch.currentClipPath = null;
    }
    // La bouche unique n'est coupée que si c'est ce canal-ci qui la tient :
    // annuler la rame ne doit pas faire taire le quai au milieu d'un mot.
    if (ttsOwner === c) {
      releaseTts();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    ch.speaking = false;
    closeLine(c);
  }
  // Une bouche libérée peut débloquer un segment en attente sur l'autre canal.
  for (const c of ALL_CHANNELS) if (!targets.includes(c)) pump(c);
}

// À appeler quand le volume du site change : coupe la voix à 0, sinon met à jour.
export function applySpeechVolume(): void {
  const { muted, volume } = useStore.getState();
  if (muted || volume <= 0.001) {
    cancelSpeech();
    return;
  }
  syncSpeechVolume();
}
