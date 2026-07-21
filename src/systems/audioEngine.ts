// Moteur audio (Tone.js), tout synthétisé : roulement, onduleur VVVF, joints
// de rail, freinage, carillons de porte, jingle d'arrivée et mélodies de
// départ originales. Démarré uniquement au clic « Monter à bord ».
//
// Hook fichiers locaux : playClip(name, fallback) joue public/audio/<name>.mp3
// s'il existe (déposez vos propres enregistrements), sinon retombe sur la
// synthèse. Aucun asset audio protégé n'est fourni.

import * as Tone from 'tone';
import { STATIONS } from '../data/stations';

interface Nodes {
  master: Tone.Gain;
  rollNoise: Tone.Noise;
  rollFilter: Tone.Filter;
  rollGain: Tone.Gain;
  vvvfOsc: Tone.Oscillator;
  vvvfFilter: Tone.Filter;
  vvvfGain: Tone.Gain;
  brakeNoise: Tone.Noise;
  brakeFilter: Tone.Filter;
  brakeGain: Tone.Gain;
  clack: Tone.NoiseSynth;
  clackFilter: Tone.Filter;
  air: Tone.NoiseSynth;
  airFilter: Tone.Filter;
  chime: Tone.Synth;
  bell: Tone.Synth;
  melodyA: Tone.Synth;
  melodyB: Tone.Synth;
}

let nodes: Nodes | null = null;
let volume = 0.8;
let prevSpeed01 = 0;

export async function startAudio(): Promise<void> {
  if (nodes) return;
  await Tone.start();

  const master = new Tone.Gain(volume * 0.9).toDestination();

  // Roulement : bruit rose → passe-bas → gain, modulés par la vitesse.
  const rollNoise = new Tone.Noise('pink');
  const rollFilter = new Tone.Filter({ type: 'lowpass', frequency: 300, Q: 0.6 });
  const rollGain = new Tone.Gain(0);
  rollNoise.chain(rollFilter, rollGain, master);
  rollNoise.start();

  // Onduleur VVVF : dent de scie → passe-bande, fréquence liée à la vitesse.
  const vvvfOsc = new Tone.Oscillator({ type: 'sawtooth', frequency: 55 });
  const vvvfFilter = new Tone.Filter({ type: 'bandpass', frequency: 200, Q: 6 });
  const vvvfGain = new Tone.Gain(0);
  vvvfOsc.chain(vvvfFilter, vvvfGain, master);
  vvvfOsc.start();

  // Crissement de frein : bruit blanc → passe-bande aigu.
  const brakeNoise = new Tone.Noise('white');
  const brakeFilter = new Tone.Filter({ type: 'bandpass', frequency: 2400, Q: 3.5 });
  const brakeGain = new Tone.Gain(0);
  brakeNoise.chain(brakeFilter, brakeGain, master);
  brakeNoise.start();

  // Joints de rail : impulsions de bruit filtré passe-bas.
  const clackFilter = new Tone.Filter({ type: 'lowpass', frequency: 420, Q: 1 });
  const clack = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.055, sustain: 0 },
  });
  clack.chain(clackFilter, master);

  // Air comprimé (fermeture de portes).
  const airFilter = new Tone.Filter({ type: 'lowpass', frequency: 1600, Q: 0.8 });
  const air = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.02, decay: 0.55, sustain: 0 },
  });
  air.chain(airFilter, master);

  // Carillons et jingles.
  const chime = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.15, release: 0.35 },
  }).connect(master);
  const bell = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 },
  }).connect(master);

  // Mélodies de départ : triangle principal + harmonique douce à l'octave.
  const melodyA = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.25 },
  }).connect(master);
  const melodyB = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.25, release: 0.25 },
    volume: -14,
  }).connect(master);

  nodes = {
    master,
    rollNoise,
    rollFilter,
    rollGain,
    vvvfOsc,
    vvvfFilter,
    vvvfGain,
    brakeNoise,
    brakeFilter,
    brakeGain,
    clack,
    clackFilter,
    air,
    airFilter,
    chime,
    bell,
    melodyA,
    melodyB,
  };
}

export function setVolume(v: number): void {
  volume = v;
  if (nodes) nodes.master.gain.rampTo(v * 0.9, 0.1);
}

export function setMuted(m: boolean): void {
  Tone.getDestination().mute = m;
}

// Mise à jour continue, pilotée par la vitesse normalisée (0..1).
export function updateAudio(dt: number, speed01: number, braking: boolean): void {
  if (!nodes || dt <= 0) return;
  const accel01 = (speed01 - prevSpeed01) / dt; // par seconde
  prevSpeed01 = speed01;

  nodes.rollGain.gain.rampTo(Math.pow(speed01, 1.1) * 0.32, 0.08);
  nodes.rollFilter.frequency.rampTo(280 + speed01 * 1500, 0.08);

  // Le « chant » VVVF : surtout audible à l'accélération.
  const accelBoost = Math.max(0, Math.min(1, accel01 * 9));
  nodes.vvvfOsc.frequency.rampTo(52 + speed01 * 170, 0.08);
  nodes.vvvfFilter.frequency.rampTo(160 + speed01 * 1900, 0.08);
  nodes.vvvfGain.gain.rampTo(speed01 > 0.005 ? 0.012 + accelBoost * 0.05 * (0.35 + speed01) : 0, 0.1);

  // Crissement sous ~40 % de vitesse en freinage.
  const squeal = braking && speed01 < 0.4 && speed01 > 0.015 ? (0.4 - speed01) * 0.5 * 0.28 : 0;
  nodes.brakeGain.gain.rampTo(squeal, 0.12);
}

// « Clac-clac » des deux bogies au passage d'un joint de rail.
export function railClack(speed01: number): void {
  if (!nodes) return;
  const now = Tone.now();
  const v = 0.12 + speed01 * 0.5;
  const bogieDelay = 0.5 - speed01 * 0.32; // second bogie plus proche à vitesse haute
  const hit = (t: number, vel: number) => nodes!.clack.triggerAttackRelease(0.05, t, vel);
  hit(now, v);
  hit(now + 0.09, v * 0.85);
  hit(now + bogieDelay, v * 0.9);
  hit(now + bogieDelay + 0.09, v * 0.75);
}

// --- Carillons et jingles (synthèse, avec hook fichiers locaux) ---

function synthDoorOpen(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.chime.triggerAttackRelease('E5', 0.16, now, 0.5);
  nodes.chime.triggerAttackRelease('A5', 0.3, now + 0.18, 0.5);
}

function synthDoorClose(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.chime.triggerAttackRelease('A5', 0.16, now, 0.5);
  nodes.chime.triggerAttackRelease('E5', 0.3, now + 0.18, 0.5);
  nodes.air.triggerAttackRelease(0.5, now + 0.5, 0.18);
}

function synthArrival(): void {
  if (!nodes) return;
  const now = Tone.now();
  const notes = ['G5', 'C6', 'E6', 'G6'];
  notes.forEach((n, i) => nodes!.bell.triggerAttackRelease(n, 0.3, now + i * 0.17, 0.4));
}

// --- Mélodies de départ (発車メロディ), compositions ORIGINALES ---
// Structure fidèle à la réalité : deux mélodies « maison » alternées pour la
// plupart des gares, quelques gares avec leur propre jingle. Aucune mélodie
// réelle n'est transcrite.

type Note = [string, number]; // [hauteur, durée en unités]

const HOUSE_A: Note[] = [
  ['G5', 1], ['A5', 1], ['B5', 1], ['D6', 2], ['B5', 1], ['A5', 1], ['G5', 2], ['E5', 1], ['G5', 3],
];
const HOUSE_B: Note[] = [
  ['E5', 1], ['G5', 1], ['A5', 1], ['B5', 1], ['A5', 2], ['G5', 1], ['E5', 1], ['D5', 1], ['E5', 3],
];
const SPECIALS: Record<string, Note[]> = {
  JY02: [['C6', 1], ['A5', 1], ['G5', 1], ['E5', 1], ['G5', 1], ['A5', 1], ['C6', 2], ['A5', 1], ['G5', 3]], // Kanda
  JY03: [['E6', 1], ['D6', 1], ['B5', 1], ['A5', 1], ['B5', 1], ['D6', 1], ['E6', 2], ['B5', 3]], // Akihabara
  JY04: [['A5', 1], ['C6', 1], ['D6', 1], ['E6', 2], ['D6', 1], ['C6', 1], ['A5', 2], ['G5', 1], ['A5', 3]], // Okachimachi
  JY05: [['G5', 1], ['B5', 1], ['D6', 1], ['G6', 2], ['E6', 1], ['D6', 1], ['B5', 1], ['A5', 1], ['G5', 3]], // Ueno
  JY11: [['D6', 1], ['B5', 1], ['A5', 1], ['G5', 1], ['A5', 1], ['B5', 1], ['A5', 2], ['E5', 1], ['G5', 3]], // Sugamo
  JY26: [['C6', 1], ['D6', 1], ['E6', 1], ['G6', 1], ['E6', 1], ['D6', 1], ['C6', 1], ['D6', 2], ['C6', 3]], // Takanawa GW
};

function synthMelody(index: number): void {
  if (!nodes) return;
  const jy = STATIONS[index].jy;
  const tune = SPECIALS[jy] ?? (index % 2 === 0 ? HOUSE_A : HOUSE_B);
  const unit = 0.21;
  let t = Tone.now() + 0.05;
  for (const [note, beats] of tune) {
    const dur = beats * unit;
    nodes.melodyA.triggerAttackRelease(note, dur * 0.92, t, 0.42);
    nodes.melodyB.triggerAttackRelease(Tone.Frequency(note).transpose(12).toNote(), dur * 0.92, t, 0.3);
    t += dur;
  }
}

// --- Hook fichiers locaux : public/audio/<name>.mp3 si présent ---

const clipAvailable = new Map<string, boolean>();

async function probeClip(name: string): Promise<boolean> {
  const cached = clipAvailable.get(name);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const res = await fetch(`audio/${name}.mp3`, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    ok = res.ok && type.includes('audio');
  } catch {
    ok = false;
  }
  clipAvailable.set(name, ok);
  return ok;
}

export async function playClip(name: string, fallback: () => void): Promise<void> {
  if (await probeClip(name)) {
    const el = new Audio(`audio/${name}.mp3`);
    el.volume = Math.min(1, volume);
    void el.play().catch(() => fallback());
  } else {
    fallback();
  }
}

export function doorOpenChime(): void {
  void playClip('door-open', synthDoorOpen);
}
export function doorCloseChime(): void {
  void playClip('door-close', synthDoorClose);
}
export function arrivalJingle(): void {
  void playClip('arrival', synthArrival);
}
export function departureMelody(index: number): void {
  void playClip(`melody-${STATIONS[index].jy}`, () => synthMelody(index));
}
