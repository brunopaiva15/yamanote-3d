// File d'attente d'annonces vocales sur speechSynthesis : une utterance à la
// fois, japonais puis anglais. Voix féminine si disponible ; sans voix ja-JP,
// seul l'anglais est émis.
//
// Robustesse navigateurs :
// - iOS / Safari : la synthèse doit être amorcée DANS le geste utilisateur ;
//   initSpeech() parle une utterance silencieuse au clic « Monter à bord ».
// - Chrome : les utterances longues sont coupées (~15 s) sans onend ; on
//   découpe donc par phrases, avec un keep-alive pause/resume et un filet
//   de sécurité si aucun événement de fin n'arrive.
//
// Spatialisation : speechSynthesis sort directement sur la carte son, hors du
// graphe Web Audio — impossible de la panner. On l'ancre donc aux diffuseurs
// du plafond par deux biais : le souffle de ligne spatialisé, ouvert pendant
// toute l'annonce (paVoiceOpen/paVoiceClose), et le volume de l'utterance qui
// suit la distance au diffuseur le plus proche (speakerProximity).

import type { Utterance } from '../data/announcements';
import { useStore } from '../store';
import { paVoiceClose, paVoiceOpen, speakerProximity } from './audioEngine';

const queue: Utterance[] = [];
let speaking = false;
let voicesReady = false;
let jaVoice: SpeechSynthesisVoice | null = null;
let enVoice: SpeechSynthesisVoice | null = null;
let watchdogId = 0;
let keepAliveId = 0;
let volumeSyncId = 0;
let currentUtterance: SpeechSynthesisUtterance | null = null;

// Niveau utterance : volume du site × proximité du diffuseur (hors graphe Tone).
function speechLevel(): number {
  const { muted, volume } = useStore.getState();
  if (muted || volume <= 0.001) return 0;
  return Math.min(1, volume * 1.15 * speakerProximity());
}

// Applique le volume courant à l'utterance en cours (slider + distance).
function syncSpeechVolume(): void {
  if (!currentUtterance) return;
  currentUtterance.volume = speechLevel();
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

// Voix listées par le navigateur mais restées muettes à l'usage : on ne les
// repropose plus (voir la détection d'échec dans pump()).
const mutedVoices = new Set<string>();

// Réduit un nom de voix à ses lettres et chiffres : « (ja-JP, NanamiNeural) »
// et « ja-JP-NanamiNeural » se rejoignent alors sur « jajpnanamineural ».
function normalizeVoiceName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Windows publie ses voix « Online (Natural) » à tous les navigateurs, mais
// seul Edge sait les jouer : ailleurs elles sont sélectionnables et muettes.
// On les garde en dernier recours au lieu de les choisir d'office.
const isEdge = typeof navigator !== 'undefined' && navigator.userAgent.includes('Edg/');

function isRemoteNatural(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  return name.includes('online') || name.includes('natural');
}

// Classement des voix d'une langue : identifiant Azure complet d'abord, prénom
// de la voix ensuite (Edge nomme la même voix de deux façons selon name et
// voiceURI), puis l'heuristique féminine historique.
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const wanted = PREFERRED_VOICE[lang] ?? '';
  const id = normalizeVoiceName(wanted);
  // Ex. « ja-JP-NanamiNeural » → « nanami ».
  const firstName = normalizeVoiceName(wanted.split('-').pop() ?? '').replace(/neural$/, '');
  const score = (voice: SpeechSynthesisVoice): number => {
    const haystack = normalizeVoiceName(`${voice.name} ${voice.voiceURI}`);
    let value = 0;
    if (id.length > 0 && haystack.includes(id)) value += 100;
    else if (firstName.length > 0 && haystack.includes(firstName)) value += 50;
    if (FEMALE_HINTS.some((h) => voice.name.toLowerCase().includes(h))) value += 10;
    if (!isEdge && isRemoteNatural(voice)) value -= 200;
    return value;
  };
  const ranked = window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang))
    .filter((v) => !mutedVoices.has(v.voiceURI))
    .map((voice, index) => ({ voice, index, value: score(voice) }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  return ranked.length > 0 ? ranked[0].voice : null;
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

function clearTimers(): void {
  if (watchdogId) window.clearTimeout(watchdogId);
  if (keepAliveId) window.clearInterval(keepAliveId);
  if (volumeSyncId) window.clearInterval(volumeSyncId);
  watchdogId = 0;
  keepAliveId = 0;
  volumeSyncId = 0;
}

function finishUtterance(): void {
  clearTimers();
  currentUtterance = null;
  speaking = false;
  pump();
}

// Ligne de sonorisation ouverte : souffle spatialisé + déclics d'ouverture et
// de fermeture, qui ancrent la voix sur les diffuseurs du plafond.
let lineOpen = false;

function openLine(): void {
  if (lineOpen) return;
  lineOpen = true;
  paVoiceOpen();
}

function closeLine(): void {
  if (!lineOpen) return;
  lineOpen = false;
  paVoiceClose();
}

function pump(): void {
  if (speaking) return;
  if (queue.length === 0) {
    closeLine();
    return;
  }
  if (!('speechSynthesis' in window)) {
    queue.length = 0;
    closeLine();
    return;
  }
  if (useStore.getState().muted || useStore.getState().volume <= 0.001) {
    queue.length = 0;
    closeLine();
    return;
  }
  const item = queue.shift();
  if (!item) return;
  if (!voicesReady) refreshVoices();
  // Sans voix japonaise disponible : sauter les segments japonais.
  if (item.lang === 'ja-JP' && !jaVoice) {
    pump();
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
  u.volume = speechLevel();
  currentUtterance = u;
  speaking = true;
  // Filet anti-voix muette : si l'utterance ne démarre jamais ou se termine
  // instantanément, la voix choisie ne produit pas de son (cas des « Online
  // (Natural) » de Windows hors Edge). On l'écarte et on rejoue le segment.
  let started = false;
  const startedAt = performance.now();
  u.onstart = () => {
    started = true;
  };
  const onDone = (): void => {
    // Utterance annulée entre-temps : cancelSpeech a déjà fait le ménage.
    if (currentUtterance !== u) return;
    const silent = !started || (performance.now() - startedAt < 250 && item.text.length >= 6);
    if (silent && voice && !mutedVoices.has(voice.voiceURI)) {
      mutedVoices.add(voice.voiceURI);
      console.warn('Voix muette écartée, repli sur la suivante :', voice.name);
      refreshVoices();
      queue.unshift(item);
    }
    finishUtterance();
  };
  u.onend = onDone;
  u.onerror = onDone;
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
  // Keep-alive Chrome : pause/resume périodique pendant la lecture.
  keepAliveId = window.setInterval(() => {
    try {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    } catch {
      /* sans gravité */
    }
  }, 10000);
  // Resync volume / proximité pendant l'annonce (le slider et la tête bougent).
  volumeSyncId = window.setInterval(syncSpeechVolume, 200);
  window.speechSynthesis.speak(u);
}

export function say(items: Utterance[]): void {
  const { muted, volume } = useStore.getState();
  if (muted || volume <= 0.001) return;
  for (const item of items) {
    for (const text of splitSentences(item.text)) {
      queue.push({ text, lang: item.lang });
    }
  }
  if (queue.length > 0) openLine();
  pump();
}

export function cancelSpeech(): void {
  queue.length = 0;
  clearTimers();
  currentUtterance = null;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  speaking = false;
  closeLine();
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
