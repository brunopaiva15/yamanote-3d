// File d'attente d'annonces vocales sur speechSynthesis : une utterance à la
// fois, japonais puis anglais. Voix féminine si disponible ; sans voix ja-JP,
// seul l'anglais est émis.

import type { Utterance } from '../data/announcements';
import { useStore } from '../store';

const queue: Utterance[] = [];
let speaking = false;
let voicesReady = false;
let jaVoice: SpeechSynthesisVoice | null = null;
let enVoice: SpeechSynthesisVoice | null = null;

const FEMALE_HINTS = ['female', 'kyoko', 'o-ren', 'haruka', 'sayaka', 'nanami', 'ayumi', 'samantha', 'zira', 'google'];

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').startsWith(lang));
  if (voices.length === 0) return null;
  const female = voices.find((v) => FEMALE_HINTS.some((h) => v.name.toLowerCase().includes(h)));
  return female ?? voices[0];
}

function refreshVoices(): void {
  jaVoice = pickVoice('ja');
  enVoice = pickVoice('en');
  voicesReady = true;
}

export function initSpeech(): void {
  if (!('speechSynthesis' in window)) return;
  refreshVoices();
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
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
  u.onend = () => {
    speaking = false;
    pump();
  };
  u.onerror = () => {
    speaking = false;
    pump();
  };
  window.speechSynthesis.speak(u);
}

export function say(items: Utterance[]): void {
  if (useStore.getState().muted) return;
  queue.push(...items);
  pump();
}

export function cancelSpeech(): void {
  queue.length = 0;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  speaking = false;
}
