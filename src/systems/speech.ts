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

import type { Utterance } from '../data/announcements';
import { useStore } from '../store';

const queue: Utterance[] = [];
let speaking = false;
let voicesReady = false;
let jaVoice: SpeechSynthesisVoice | null = null;
let enVoice: SpeechSynthesisVoice | null = null;
let watchdogId = 0;
let keepAliveId = 0;

const FEMALE_HINTS = ['female', 'kyoko', 'o-ren', 'haruka', 'sayaka', 'nanami', 'ayumi', 'samantha', 'zira', 'google'];

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang));
  if (voices.length === 0) return null;
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

function clearTimers(): void {
  if (watchdogId) window.clearTimeout(watchdogId);
  if (keepAliveId) window.clearInterval(keepAliveId);
  watchdogId = 0;
  keepAliveId = 0;
}

function finishUtterance(): void {
  clearTimers();
  speaking = false;
  pump();
}

function pump(): void {
  if (speaking || queue.length === 0) return;
  if (!('speechSynthesis' in window)) {
    queue.length = 0;
    return;
  }
  if (useStore.getState().muted) {
    queue.length = 0;
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
  u.volume = Math.min(1, useStore.getState().volume * 1.15);
  speaking = true;
  u.onend = finishUtterance;
  u.onerror = finishUtterance;
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
  window.speechSynthesis.speak(u);
}

export function say(items: Utterance[]): void {
  if (useStore.getState().muted) return;
  for (const item of items) {
    for (const text of splitSentences(item.text)) {
      queue.push({ text, lang: item.lang });
    }
  }
  pump();
}

export function cancelSpeech(): void {
  queue.length = 0;
  clearTimers();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  speaking = false;
}
