// Moteur audio (Tone.js) : roulement, onduleur VVVF, joints de rail, freinage,
// carillons de porte, jingle d'arrivée — synthétisés — et mélodies de départ
// (発車メロディ) : clip quai réel quand disponible (voir data/melodies.ts),
// sinon synthèse. Démarré uniquement au clic « Monter à bord ».
//
// Spatialisation : tout ce qui sort de la SONORISATION (carillons de porte,
// jingle d'arrivée, souffle de ligne des annonces) passe par un bus « PA »
// — filtrage passe-bande + compression, le timbre d'un haut-parleur de wagon —
// puis est diffusé par un Panner3D PAR DIFFUSEUR de plafond (voir
// CABIN_SPEAKERS). La mélodie de départ (発車メロディ), elle, vient des
// haut-parleurs du QUAI : elle est étouffée portes fermées et s'ouvre par les
// portes. L'auditeur (Tone.Listener) suit la caméra, donc le son tourne quand
// on tourne la tête et se rapproche quand on marche sous un diffuseur.
//
// Limite connue : speechSynthesis ne peut pas être routé dans le graphe Web
// Audio, les annonces vocales ne sont donc pas pannées. On ancre malgré tout la
// voix aux diffuseurs avec le souffle de ligne spatialisé (paVoiceOpen/Close)
// et un volume d'utterance suivant la distance au diffuseur le plus proche
// (speakerProximity, lu par systems/speech.ts).
//
// Hook fichiers locaux : playClip(name, fallback) joue public/audio/<name>.mp3
// s'il existe, sinon retombe sur la synthèse. audioManager.playOnce(path) joue
// un chemin (ex. /audio/melodies/…) une seule fois sans relancer. Les clips
// locaux passent eux aussi par le bus spatialisé.

import * as Tone from 'tone';
import { CABIN_SPEAKERS, CONFIG, PLATFORM_SPEAKERS } from '../data/config';
import {
  EBISU_INNER_THIRD_MAN_F_PATH,
  INNER_MAIN_MELODY_PATH,
  KOMAGOME_INNER_SAKURA_V2_PATH,
  KOMAGOME_OUTER_SAKURA_A_PATH,
  OSAKI_INNER_SECONDARY_MELODY_PATH,
  OSAKI_OUTER_SECONDARY_MELODY_PATH,
  OUTER_MAIN_MELODY_PATH,
  SESERAGI_MELODY_PATH,
  TAKADANOBABA_INNER_ATOM_B_PATH,
  TAKADANOBABA_OUTER_ATOM_A_PATH,
  UGUISUDANI_INNER_HARU_TREMOLO_PATH,
} from '../data/melodies';
import { STATIONS } from '../data/stations';
import { buildDepartureContext, playDepartureMelodyForContext } from './departureSequence';

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
  slideTrainGain: Tone.Gain;
  slidePsdGain: Tone.Gain;
  thud: Tone.MembraneSynth;
  chime: Tone.Synth;
  bell: Tone.Synth;
  melodyA: Tone.Synth;
  melodyB: Tone.Synth;
  // Sonorisation.
  paIn: Tone.Gain; // entrée du bus wagon (avant timbre haut-parleur)
  platIn: Tone.Gain; // entrée du bus quai
  platGain: Tone.Gain;
  platLp: Tone.Filter;
  platPanners: Tone.Panner3D[];
  hissGain: Tone.Gain;
  paClick: Tone.NoiseSynth;
}

let nodes: Nodes | null = null;
let volume = 0.8;
let prevSpeed01 = 0;

// Pose de l'auditeur, tenue à jour par la caméra (voir setListenerPose).
const listenerPos: { x: number; y: number; z: number } = { x: 0, y: CONFIG.eyeHeight, z: 4.2 };

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

  // Frottement de glissière pendant le coulissement des portes : bruit grave
  // dont le gain suit la vitesse des vantaux (rame et portes palières).
  const slideTrainNoise = new Tone.Noise('brown');
  const slideTrainFilter = new Tone.Filter({ type: 'lowpass', frequency: 260, Q: 0.7 });
  const slideTrainGain = new Tone.Gain(0);
  slideTrainNoise.chain(slideTrainFilter, slideTrainGain, master);
  slideTrainNoise.start();
  const slidePsdNoise = new Tone.Noise('brown');
  const slidePsdFilter = new Tone.Filter({ type: 'lowpass', frequency: 520, Q: 0.7 });
  const slidePsdGain = new Tone.Gain(0);
  slidePsdNoise.chain(slidePsdFilter, slidePsdGain, master);
  slidePsdNoise.start();

  // Chocs mécaniques sourds : déverrouillage et arrivée en butée des portes.
  const thud = new Tone.MembraneSynth({
    pitchDecay: 0.035,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    volume: -8,
  }).connect(master);

  // --- Bus SONORISATION du wagon ---------------------------------------
  // Timbre : un diffuseur de plafond ne descend pas dans le grave et coupe
  // haut ; une bosse de présence et une compression serrée font le reste.
  const paIn = new Tone.Gain(1);
  const paHp = new Tone.Filter({ type: 'highpass', frequency: 300, rolloff: -24, Q: 0.7 });
  const paPresence = new Tone.Filter({ type: 'peaking', frequency: 1900, Q: 0.9, gain: 4.5 });
  const paLp = new Tone.Filter({ type: 'lowpass', frequency: 5000, rolloff: -24, Q: 0.5 });
  const paComp = new Tone.Compressor({ threshold: -22, ratio: 3.2, attack: 0.004, release: 0.14 });
  // Gain de bus calé pour que la somme des huit diffuseurs, atténuation de
  // distance comprise, retombe au niveau d'avant spatialisation.
  const paBus = new Tone.Gain(0.5);
  paIn.chain(paHp, paPresence, paLp, paComp, paBus);

  // Un Panner3D par diffuseur : c'est CE fan-out qui donne l'impression que le
  // son sort des grilles du plafond. Cône dirigé vers le bas (les diffuseurs
  // arrosent l'allée), atténuation inverse avec la distance.
  for (const [x, y, z] of CABIN_SPEAKERS) {
    const p = new Tone.Panner3D({
      positionX: x,
      positionY: y,
      positionZ: z,
      orientationX: 0,
      orientationY: -1,
      orientationZ: 0,
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 1.15,
      rolloffFactor: 1.25,
      maxDistance: 40,
      coneInnerAngle: 110,
      coneOuterAngle: 250,
      coneOuterGain: 0.45,
    });
    paBus.connect(p);
    p.connect(master);
  }

  // Petite réverbération de cabine, NON spatialisée : elle recolle les
  // diffuseurs entre eux sans brouiller les indices de direction.
  const paVerb = new Tone.Reverb({ decay: 0.85, preDelay: 0.012, wet: 1 });
  const paVerbGain = new Tone.Gain(0.16);
  paBus.chain(paVerb, paVerbGain, master);

  // Souffle de ligne : la sono s'ouvre juste avant l'annonce et se referme
  // après. Spatialisé, il ancre la voix (non pannable) sur les diffuseurs.
  const hiss = new Tone.Noise('pink');
  const hissFilter = new Tone.Filter({ type: 'bandpass', frequency: 1500, Q: 0.4 });
  const hissGain = new Tone.Gain(0);
  hiss.chain(hissFilter, hissGain, paIn);
  hiss.start();
  // Déclic d'ouverture / fermeture de la ligne.
  const paClick = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.02, sustain: 0 },
    volume: -14,
  }).connect(paIn);

  // --- Bus SONORISATION du quai ----------------------------------------
  // La 発車メロディ est diffusée sur le quai, pas dans la rame : portes
  // fermées elle est sourde et lointaine, portes ouvertes elle entre par les
  // ouvertures. platLp / platGain sont pilotés par setPlatformDoors().
  const platIn = new Tone.Gain(1);
  const platHp = new Tone.Filter({ type: 'highpass', frequency: 260, rolloff: -12, Q: 0.7 });
  const platLp = new Tone.Filter({ type: 'lowpass', frequency: 900, rolloff: -24, Q: 0.4 });
  const platGain = new Tone.Gain(0.16);
  platIn.chain(platHp, platLp, platGain);
  const platPanners = PLATFORM_SPEAKERS.map(([x, y, z]) => {
    const p = new Tone.Panner3D({
      positionX: x,
      positionY: y,
      positionZ: z,
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 2.6,
      rolloffFactor: 0.9,
      maxDistance: 60,
    });
    platGain.connect(p);
    p.connect(master);
    return p;
  });

  // Carillons et jingles : sortent des diffuseurs du wagon.
  const chime = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.15, release: 0.35 },
  }).connect(paIn);
  const bell = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 },
  }).connect(paIn);

  // Mélodies de départ : triangle principal + harmonique douce à l'octave,
  // envoyées sur les haut-parleurs du quai.
  const melodyA = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.25 },
  }).connect(platIn);
  const melodyB = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.25, release: 0.25 },
    volume: -14,
  }).connect(platIn);

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
    slideTrainGain,
    slidePsdGain,
    thud,
    chime,
    bell,
    melodyA,
    melodyB,
    paIn,
    platIn,
    platGain,
    platLp,
    platPanners,
    hissGain,
    paClick,
  };
}

export function setVolume(v: number): void {
  volume = v;
  if (nodes) nodes.master.gain.rampTo(v * 0.9, 0.1);
}

export function setMuted(m: boolean): void {
  Tone.getDestination().mute = m;
}

// --- Spatialisation -----------------------------------------------------

// Pose de l'auditeur, appelée chaque frame depuis la caméra. Les diffuseurs
// sont fixes dans le repère du wagon, seule la tête bouge.
export function setListenerPose(
  px: number,
  py: number,
  pz: number,
  fx: number,
  fy: number,
  fz: number,
  ux: number,
  uy: number,
  uz: number,
): void {
  listenerPos.x = px;
  listenerPos.y = py;
  listenerPos.z = pz;
  if (!nodes) return;
  const l = Tone.getListener();
  l.positionX.value = px;
  l.positionY.value = py;
  l.positionZ.value = pz;
  l.forwardX.value = fx;
  l.forwardY.value = fy;
  l.forwardZ.value = fz;
  l.upX.value = ux;
  l.upY.value = uy;
  l.upZ.value = uz;
}

// Côté d'ouverture : les haut-parleurs du quai basculent avec lui.
export function setPlatformSide(side: 1 | -1): void {
  if (!nodes) return;
  nodes.platPanners.forEach((p, i) => {
    p.positionX.value = side * PLATFORM_SPEAKERS[i][0];
  });
}

// Ouverture acoustique du quai vers la cabine (0 = portes fermées, son sourd
// et lointain ; 1 = portes ouvertes, la mélodie entre franchement).
export function setPlatformDoors(open01: number): void {
  if (!nodes) return;
  const o = Math.max(0, Math.min(1, open01));
  nodes.platLp.frequency.rampTo(750 + o * 3600, 0.12);
  nodes.platGain.gain.rampTo(0.16 + o * 0.44, 0.12);
}

// Facteur de volume 0..1 selon la distance au diffuseur le plus proche. Sert
// aux annonces vocales, que speechSynthesis ne permet pas de panner : au moins
// leur niveau suit la position de la tête dans le wagon.
export function speakerProximity(): number {
  let best = Infinity;
  for (const [x, y, z] of CABIN_SPEAKERS) {
    const d = Math.hypot(x - listenerPos.x, y - listenerPos.y, z - listenerPos.z);
    if (d < best) best = d;
  }
  if (!Number.isFinite(best)) return 1;
  return Math.max(0.62, Math.min(1, 1.7 / Math.max(1.2, best)));
}

// Ouverture / fermeture de la ligne de sonorisation autour d'une annonce.
export function paVoiceOpen(): void {
  if (!nodes) return;
  nodes.paClick.triggerAttackRelease(0.02, Tone.now(), 0.5);
  nodes.hissGain.gain.rampTo(0.03, 0.1);
}

export function paVoiceClose(): void {
  if (!nodes) return;
  nodes.hissGain.gain.rampTo(0, 0.3);
  nodes.paClick.triggerAttackRelease(0.015, Tone.now() + 0.18, 0.3);
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

// Gain du frottement de glissière, piloté chaque frame par la vitesse
// normalisée des vantaux (0 = arrêtés, 1 = pleine vitesse).
export function setDoorSlide(train01: number, psd01: number): void {
  if (!nodes) return;
  nodes.slideTrainGain.gain.rampTo(train01 * 0.05, 0.05);
  nodes.slidePsdGain.gain.rampTo(psd01 * 0.018, 0.05);
}

// Choc mécanique d'une porte de la rame : coup sourd + claquement métallique.
export function doorClunk(vel: number): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.thud.triggerAttackRelease('G1', 0.09, now, vel);
  nodes.clack.triggerAttackRelease(0.03, now + 0.012, vel * 0.7);
}

// Choc plus mat des portes palières, entendues depuis l'intérieur du wagon.
export function psdClunk(vel: number): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.thud.triggerAttackRelease('C2', 0.07, now, vel * 0.8);
  nodes.clack.triggerAttackRelease(0.025, now + 0.01, vel * 0.45);
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

// Durée cible de la 発車メロディ (secondes). En réalité elle joue pendant que les
// portes sont ouvertes, ~8–11 s en situation normale — bien avant l'annonce de
// fermeture, qui ne vient qu'APRÈS la fin de la musique. Le motif est donc bouclé
// jusqu'à approcher cette cible (≈ 3 tours).
export const MELODY_DURATION = 6.5;

function synthMelody(index: number): void {
  if (!nodes) return;
  const jy = STATIONS[index].jy;
  const tune = SPECIALS[jy] ?? (index % 2 === 0 ? HOUSE_A : HOUSE_B);
  const unit = 0.21;
  const start = Tone.now() + 0.05;
  let t = start;
  // Boucle sur des tours complets jusqu'à atteindre la durée cible.
  while (t - start < MELODY_DURATION) {
    for (const [note, beats] of tune) {
      const dur = beats * unit;
      nodes.melodyA.triggerAttackRelease(note, dur * 0.92, t, 0.42);
      nodes.melodyB.triggerAttackRelease(Tone.Frequency(note).transpose(12).toNote(), dur * 0.92, t, 0.3);
      t += dur;
    }
  }
}

// --- Hook fichiers locaux : public/audio/<name>.mp3 si présent ---

const clipAvailable = new Map<string, boolean>();

/** Résout un chemin logique (/audio/...) en URL relative compatible base Vite. */
function resolveAudioUrl(pathOrName: string): string {
  if (pathOrName.startsWith('/')) {
    const base = import.meta.env.BASE_URL || './';
    const normalized = base.endsWith('/') ? base : `${base}/`;
    return `${normalized}${pathOrName.replace(/^\//, '')}`;
  }
  if (pathOrName.includes('/')) {
    const base = import.meta.env.BASE_URL || './';
    const normalized = base.endsWith('/') ? base : `${base}/`;
    return `${normalized}${pathOrName.replace(/^\//, '')}`;
  }
  return `audio/${pathOrName}.mp3`;
}

async function probeUrl(url: string): Promise<boolean> {
  const cached = clipAvailable.get(url);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    ok = res.ok && (type.includes('audio') || type.includes('octet-stream') || type === '');
    // Certains serveurs statiques omettent content-type sur HEAD : retenter GET partiel.
    if (res.ok && !ok) {
      const get = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      ok = get.ok;
    }
  } catch {
    ok = false;
  }
  clipAvailable.set(url, ok);
  return ok;
}

async function probeClip(name: string): Promise<boolean> {
  return probeUrl(resolveAudioUrl(name));
}

// Un clip local rejoint le MÊME bus spatialisé que sa version synthétisée :
// déposer un door-open.mp3 ne fait pas ressortir le son du centre de la tête.
// Repli sans spatialisation si le contexte refuse la source média.
type Bus = 'cabin' | 'platform';

function routeClip(el: HTMLAudioElement, bus: Bus): void {
  if (!nodes) {
    el.volume = Math.min(1, volume);
    return;
  }
  try {
    const src = Tone.getContext().createMediaElementSource(el);
    src.connect(bus === 'platform' ? nodes.platIn.input : nodes.paIn.input);
    el.addEventListener('ended', () => src.disconnect(), { once: true });
  } catch {
    el.volume = Math.min(1, volume);
  }
}

export async function playClip(name: string, fallback: () => void, bus: Bus = 'cabin'): Promise<void> {
  if (await probeClip(name)) {
    const el = new Audio(resolveAudioUrl(name));
    routeClip(el, bus);
    void el.play().catch(() => fallback());
  } else {
    fallback();
  }
}

// --- audioManager : lecture unique / arrêt par chemin ---

const activeByPath = new Map<string, HTMLAudioElement>();
const playWaiters = new Map<string, Array<() => void>>();

function notifyPlayDone(path: string): void {
  const waiters = playWaiters.get(path);
  if (!waiters) return;
  playWaiters.delete(path);
  for (const w of waiters) w();
}

function waitForPath(path: string): Promise<void> {
  return new Promise((resolve) => {
    const list = playWaiters.get(path) ?? [];
    list.push(resolve);
    playWaiters.set(path, list);
  });
}

/**
 * Joue un fichier audio une seule fois. Si le même chemin est déjà en cours,
 * ne relance pas et attend la fin de la lecture existante.
 * @returns false si le fichier est introuvable.
 */
async function playOnce(path: string, bus: Bus = 'platform'): Promise<boolean> {
  const existing = activeByPath.get(path);
  if (existing && !existing.paused && !existing.ended) {
    await new Promise<void>((resolve) => {
      const el = activeByPath.get(path);
      if (!el || el.paused || el.ended) {
        resolve();
        return;
      }
      const list = playWaiters.get(path) ?? [];
      list.push(resolve);
      playWaiters.set(path, list);
    });
    return true;
  }

  const url = resolveAudioUrl(path);
  if (!(await probeUrl(url))) return false;

  const el = new Audio(url);
  activeByPath.set(path, el);
  routeClip(el, bus);

  const finished = waitForPath(path);
  const done = () => {
    if (activeByPath.get(path) === el) activeByPath.delete(path);
    notifyPlayDone(path);
  };
  el.addEventListener('ended', done, { once: true });
  el.addEventListener('error', done, { once: true });
  void el.play().catch(done);
  await finished;
  return true;
}

/** Arrête un clip lancé via playOnce (annulation de départ, urgence…). */
function stop(path: string): void {
  const el = activeByPath.get(path);
  if (!el) {
    notifyPlayDone(path);
    return;
  }
  el.pause();
  el.currentTime = 0;
  activeByPath.delete(path);
  notifyPlayDone(path);
}

export const audioManager = {
  playOnce,
  stop,
  isPlaying(path: string): boolean {
    const el = activeByPath.get(path);
    return !!el && !el.paused && !el.ended;
  },
};

export function doorOpenChime(): void {
  void playClip('door-open', synthDoorOpen);
}
export function doorCloseChime(): void {
  void playClip('door-close', synthDoorClose);
}
export function arrivalJingle(): void {
  void playClip('arrival', synthArrival);
}

/**
 * 発車メロディ : clips Inner/Outer Main selon quai et sens, sinon
 * melody-JYXX.mp3 ou synthèse. Délègue la sélection à departureSequence
 * (évite les doubles lectures via departureId).
 */
export function departureMelody(index: number): void {
  const ctx = buildDepartureContext({
    departureSequenceStarted: true,
    stationIndex: index,
  });
  void playDepartureMelodyForContext(ctx).then((played) => {
    if (!played) {
      void playClip(`melody-${STATIONS[index].jy}`, () => synthMelody(index), 'platform');
    }
  });
}

/** Arrêt d'urgence des clips de départ connus (reset / quitter la gare). */
export function stopDepartureMelodyClips(): void {
  audioManager.stop(INNER_MAIN_MELODY_PATH);
  audioManager.stop(OUTER_MAIN_MELODY_PATH);
  audioManager.stop(OSAKI_INNER_SECONDARY_MELODY_PATH);
  audioManager.stop(OSAKI_OUTER_SECONDARY_MELODY_PATH);
  audioManager.stop(KOMAGOME_OUTER_SAKURA_A_PATH);
  audioManager.stop(KOMAGOME_INNER_SAKURA_V2_PATH);
  audioManager.stop(UGUISUDANI_INNER_HARU_TREMOLO_PATH);
  audioManager.stop(SESERAGI_MELODY_PATH);
  audioManager.stop(TAKADANOBABA_OUTER_ATOM_A_PATH);
  audioManager.stop(TAKADANOBABA_INNER_ATOM_B_PATH);
  audioManager.stop(EBISU_INNER_THIRD_MAN_F_PATH);
}
