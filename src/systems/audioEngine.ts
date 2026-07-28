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
// Annonces vocales : les clips pré-générés (Kokoro, voir systems/speech.ts)
// passent par audioManager sur le bus « PA » et sont donc pannés comme le
// reste. Le REPLI speechSynthesis, lui, sort hors du graphe Web Audio et ne
// peut pas être panné : on l'ancre aux diffuseurs avec le souffle de ligne
// spatialisé (paVoiceOpen/Close) et un volume d'utterance suivant la distance
// au diffuseur le plus proche (speakerProximity, lu par systems/speech.ts).
//
// Hook fichiers locaux : playClip(name, fallback) joue public/audio/<name>.mp3
// s'il existe, sinon retombe sur la synthèse. audioManager.playOnce(path) joue
// un chemin (ex. /audio/melodies/…) une seule fois sans relancer. Les clips
// locaux passent eux aussi par le bus spatialisé.
//
// Les clips sont TÉLÉCHARGÉS ET DÉCODÉS, puis joués par un Tone.Player : ils ne
// passent plus par un <audio> (voir le bloc « Clips » plus bas — c'est ce qui
// les rendait muets sur téléphone).
//
// Distance : tout ce qui est porté par la RAME (roulement, onduleur, freins,
// joints de rail, chocs de porte…) passe par un bus commun dont le gain suit la
// distance à la rame. Sur le quai, un train qui part s'éloigne vraiment.

import * as Tone from 'tone';
import { CABIN_SPEAKERS, CONFIG, PLATFORM_SPEAKERS } from '../data/config';
import {
  EBISU_INNER_THIRD_MAN_F_PATH,
  INNER_MAIN_MELODY_PATH,
  IKEBUKURO_INNER_BIC_CAMERA_A_PATH,
  IKEBUKURO_INNER_BIC_CAMERA_B_PATH,
  KANDA_INNER_MONDAMIN_B_PATH,
  KANDA_OUTER_MONDAMIN_A_PATH,
  KOMAGOME_INNER_SAKURA_V2_PATH,
  KOMAGOME_OUTER_SAKURA_A_PATH,
  MELODY_REPEATS,
  MELODY_REPEAT_GAP_S,
  OSAKI_INNER_SECONDARY_MELODY_PATH,
  OSAKI_OUTER_SECONDARY_MELODY_PATH,
  OUTER_MAIN_MELODY_PATH,
  SESERAGI_MELODY_PATH,
  TAKADANOBABA_INNER_ATOM_B_PATH,
  TAKADANOBABA_OUTER_ATOM_A_PATH,
  TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH,
  TAKANAWA_GATEWAY_OUTER_GLORIOUS_B_PATH,
  UGUISUDANI_INNER_HARU_TREMOLO_PATH,
} from '../data/melodies';
import { STATIONS } from '../data/stations';
import { buildDepartureContext, playDepartureMelodyForContext } from './departureSequence';

interface Nodes {
  master: Tone.Gain;
  /** Bus de tout ce que porte la rame ; son gain suit la distance au train. */
  trainBus: Tone.Gain;
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
  vent: Tone.NoiseSynth;
  squeal: Tone.Synth;
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

  // Bus de la rame : tout ce qui est PORTÉ PAR LE TRAIN y passe, et lui seul
  // s'atténue avec la distance (voir updateAudio). À bord, son gain vaut 1 et
  // il est parfaitement transparent.
  const trainBus = new Tone.Gain(1).connect(master);

  // Roulement : bruit rose → passe-bas → gain, modulés par la vitesse.
  const rollNoise = new Tone.Noise('pink');
  const rollFilter = new Tone.Filter({ type: 'lowpass', frequency: 300, Q: 0.6 });
  const rollGain = new Tone.Gain(0);
  rollNoise.chain(rollFilter, rollGain, trainBus);
  rollNoise.start();

  // Onduleur VVVF : dent de scie → passe-bande, fréquence liée à la vitesse.
  const vvvfOsc = new Tone.Oscillator({ type: 'sawtooth', frequency: 55 });
  const vvvfFilter = new Tone.Filter({ type: 'bandpass', frequency: 200, Q: 6 });
  const vvvfGain = new Tone.Gain(0);
  vvvfOsc.chain(vvvfFilter, vvvfGain, trainBus);
  vvvfOsc.start();

  // Crissement de frein : bruit blanc → passe-bande aigu.
  const brakeNoise = new Tone.Noise('white');
  const brakeFilter = new Tone.Filter({ type: 'bandpass', frequency: 2400, Q: 3.5 });
  const brakeGain = new Tone.Gain(0);
  brakeNoise.chain(brakeFilter, brakeGain, trainBus);
  brakeNoise.start();

  // Joints de rail : impulsions de bruit filtré passe-bas.
  const clackFilter = new Tone.Filter({ type: 'lowpass', frequency: 420, Q: 1 });
  const clack = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.055, sustain: 0 },
  });
  clack.chain(clackFilter, trainBus);

  // Air comprimé (fermeture de portes).
  const airFilter = new Tone.Filter({ type: 'lowpass', frequency: 1600, Q: 0.8 });
  const air = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.02, decay: 0.55, sustain: 0 },
  });
  air.chain(airFilter, trainBus);

  // Purges d'air du circuit de frein (application, desserrage, compresseur) :
  // souffle plus grave et plus feutré que l'air des portes.
  const ventFilter = new Tone.Filter({ type: 'lowpass', frequency: 750, Q: 0.6 });
  const vent = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.04, decay: 1.1, sustain: 0 },
    volume: -10,
  });
  vent.chain(ventFilter, trainBus);

  // Crissement de boudin dans les courbes : sinus aigu tenu, très discret.
  const squealHp = new Tone.Filter({ type: 'highpass', frequency: 1500, Q: 0.5 });
  const squeal = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.35, decay: 0.3, sustain: 0.4, release: 0.6 },
    volume: -26,
  });
  squeal.chain(squealHp, trainBus);

  // Frottement de glissière pendant le coulissement des portes : bruit grave
  // dont le gain suit la vitesse des vantaux (rame et portes palières).
  const slideTrainNoise = new Tone.Noise('brown');
  const slideTrainFilter = new Tone.Filter({ type: 'lowpass', frequency: 260, Q: 0.7 });
  const slideTrainGain = new Tone.Gain(0);
  slideTrainNoise.chain(slideTrainFilter, slideTrainGain, trainBus);
  slideTrainNoise.start();
  const slidePsdNoise = new Tone.Noise('brown');
  const slidePsdFilter = new Tone.Filter({ type: 'lowpass', frequency: 520, Q: 0.7 });
  const slidePsdGain = new Tone.Gain(0);
  slidePsdNoise.chain(slidePsdFilter, slidePsdGain, trainBus);
  slidePsdNoise.start();

  // Chocs mécaniques sourds : déverrouillage et arrivée en butée des portes.
  const thud = new Tone.MembraneSynth({
    pitchDecay: 0.035,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    volume: -8,
  }).connect(trainBus);

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
    trainBus,
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
    vent,
    squeal,
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

  watchContextState();
}

// Sur téléphone, le contexte est suspendu par le système à la moindre
// interruption (appel, écran verrouillé, autre application qui prend l'audio) et
// ne repart pas tout seul : sans ce filet, l'expérience revient muette.
let contextWatched = false;

function watchContextState(): void {
  if (contextWatched || typeof window === 'undefined') return;
  contextWatched = true;
  const resume = (): void => {
    if (Tone.getContext().state === 'running') return;
    void Tone.getContext().resume().catch(() => {
      /* le prochain geste retentera */
    });
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resume();
  });
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(ev, resume, { passive: true });
  }
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

/**
 * L'auditeur est-il dehors, sur le quai ? Le filtrage du bus quai simule le
 * son entendu À TRAVERS les ouvertures de la rame ; debout sous les
 * haut-parleurs, il n'a plus lieu d'être.
 */
let listenerOutside = false;

export function setListenerOutside(outside: boolean): void {
  listenerOutside = outside;
  if (!nodes) return;
  if (outside) {
    nodes.platLp.frequency.rampTo(11000, 0.25);
    nodes.platGain.gain.rampTo(0.82, 0.25);
  }
}

/**
 * Distance à la rame (m), pour le roulement. À bord elle vaut zéro ; depuis le
 * quai, elle fait décroître le bruit du train qui s'éloigne.
 */
let rollingDistance = 0;

export function setRollingDistance(m: number): void {
  rollingDistance = Math.max(0, m);
}

// Ouverture acoustique du quai vers la cabine (0 = portes fermées, son sourd
// et lointain ; 1 = portes ouvertes, la mélodie entre franchement).
export function setPlatformDoors(open01: number): void {
  if (!nodes) return;
  // Dehors, les portes de la rame ne filtrent plus rien : setListenerOutside
  // a déjà ouvert le bus en grand.
  if (listenerOutside) return;
  const o = Math.max(0, Math.min(1, open01));
  nodes.platLp.frequency.rampTo(750 + o * 3600, 0.12);
  nodes.platGain.gain.rampTo(0.16 + o * 0.44, 0.12);
}

// Facteur de volume 0..1 selon la distance au diffuseur le plus proche. Sert
// aux annonces vocales, que speechSynthesis ne permet pas de panner : au moins
// leur niveau suit la position de la tête dans le wagon.
export function speakerProximity(): number {
  // Depuis le quai, la sono du wagon n'est plus qu'un lointain : ce sont les
  // haut-parleurs du quai qui portent les annonces.
  if (listenerOutside) return 0.45;
  let best = Infinity;
  for (const [x, y, z] of CABIN_SPEAKERS) {
    const d = Math.hypot(x - listenerPos.x, y - listenerPos.y, z - listenerPos.z);
    if (d < best) best = d;
  }
  if (!Number.isFinite(best)) return 1;
  return Math.max(0.62, Math.min(1, 1.7 / Math.max(1.2, best)));
}

// Ouverture / fermeture de la ligne de sonorisation autour d'une annonce.
// Le NoiseSynth du clic refuse tout événement antérieur au dernier programmé :
// une ligne fermée puis rouverte dans la même frame (annonce coupée par une
// annonce d'urgence) doit caler son clic APRÈS celui de fermeture déjà posé.
let lastPaClickAt = 0;

function paClick(duration: number, when: number, velocity: number): void {
  if (!nodes) return;
  const t = Math.max(when, lastPaClickAt + 0.005);
  lastPaClickAt = t;
  nodes.paClick.triggerAttackRelease(duration, t, velocity);
}

export function paVoiceOpen(): void {
  if (!nodes) return;
  paClick(0.02, Tone.now(), 0.5);
  nodes.hissGain.gain.rampTo(0.03, 0.1);
}

export function paVoiceClose(): void {
  if (!nodes) return;
  nodes.hissGain.gain.rampTo(0, 0.3);
  paClick(0.015, Tone.now() + 0.18, 0.3);
}

// Mise à jour continue, pilotée par la vitesse normalisée (0..1).
export function updateAudio(dt: number, speed01: number, braking: boolean): void {
  if (!nodes || dt <= 0) return;
  const accel01 = (speed01 - prevSpeed01) / dt; // par seconde
  prevSpeed01 = speed01;

  // Atténuation en 1/(1+d) sur TOUT le bus de la rame : roulement, onduleur,
  // freins, joints de rail, chocs de porte. Un train qui quitte la gare
  // s'éloigne vraiment, au lieu de garder son chant VVVF plein pot jusqu'à
  // disparaître du champ. Les aigus partent avant les graves, comme dehors.
  const far = 1 / (1 + Math.pow(rollingDistance / 22, 1.6));
  nodes.trainBus.gain.rampTo(far, 0.12);
  nodes.rollGain.gain.rampTo(Math.pow(speed01, 1.1) * 0.32, 0.08);
  nodes.rollFilter.frequency.rampTo((280 + speed01 * 1500) * (0.35 + 0.65 * far), 0.08);

  // Le « chant » VVVF : surtout audible à l'accélération, plus discrètement
  // au freinage (récupération). L'accélération réelle est ~0,84 m/s² : le
  // facteur est calé pour que la pleine traction donne un boost proche de 1.
  const accelBoost = Math.max(0, Math.min(1, accel01 * 12));
  const regenBoost = Math.max(0, Math.min(0.5, -accel01 * 6));
  const boost = Math.max(accelBoost, regenBoost);
  nodes.vvvfOsc.frequency.rampTo(52 + speed01 * 170, 0.08);
  nodes.vvvfFilter.frequency.rampTo(160 + speed01 * 1900, 0.08);
  nodes.vvvfGain.gain.rampTo(speed01 > 0.005 ? 0.012 + boost * 0.05 * (0.35 + speed01) : 0, 0.1);

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

// --- Bruitages du circuit de frein et de course -------------------------

// Mise en action des freins : brève purge d'air en début de freinage.
export function brakeApply(): void {
  if (!nodes) return;
  nodes.vent.envelope.decay = 0.5;
  nodes.vent.triggerAttackRelease(0.25, Tone.now(), 0.12);
}

// Desserrage des freins juste avant le départ : longue purge « pshhh »
// suivie d'une petite queue d'échappement.
export function brakeRelease(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.vent.envelope.decay = 1.3;
  nodes.vent.triggerAttackRelease(0.55, now, 0.2);
  nodes.vent.triggerAttackRelease(0.2, now + 1.15, 0.07);
}

// Immobilisation complète : léger tassement de caisse puis serrage à l'arrêt.
export function stopSettle(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.thud.triggerAttackRelease('F1', 0.12, now, 0.1);
  nodes.vent.envelope.decay = 0.4;
  nodes.vent.triggerAttackRelease(0.2, now + 0.3, 0.09);
}

// Crissement de boudin dans une courbe : deux tenues aiguës, très en retrait.
export function flangeSqueal(intensity: number): void {
  if (!nodes) return;
  const now = Tone.now();
  const base = 2500 + Math.random() * 900;
  const vel = 0.05 + intensity * 0.06;
  nodes.squeal.triggerAttackRelease(base, 0.9 + Math.random() * 0.8, now, vel);
  nodes.squeal.triggerAttackRelease(base * 1.045, 0.5, now + 1.35, vel * 0.6);
}

// Petite purge du compresseur sous le plancher, en pleine course.
export function airCompressorPurge(): void {
  if (!nodes) return;
  nodes.vent.envelope.decay = 0.35;
  nodes.vent.triggerAttackRelease(0.15, Tone.now(), 0.05);
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
  let t = Tone.now() + 0.05;
  // Deux passages, comme les clips : des tours complets jusqu'à la durée
  // cible, une respiration, puis le second passage.
  for (let round = 0; round < MELODY_REPEATS; round++) {
    const start = t;
    while (t - start < MELODY_DURATION) {
      for (const [note, beats] of tune) {
        const dur = beats * unit;
        nodes.melodyA.triggerAttackRelease(note, dur * 0.92, t, 0.42);
        nodes.melodyB.triggerAttackRelease(Tone.Frequency(note).transpose(12).toNote(), dur * 0.92, t, 0.3);
        t += dur;
      }
    }
    t += MELODY_REPEAT_GAP_S;
  }
}

// --- Hook fichiers locaux : public/audio/<name>.mp3 si présent ---
//
// Les clips sont téléchargés puis DÉCODÉS en AudioBuffer, et joués par un
// Tone.Player branché sur le bus voulu. La version précédente créait un
// HTMLAudioElement (`new Audio(...)`) routé par createMediaElementSource : deux
// pièges qui ne se voient que sur téléphone.
//
// 1. Politique d'autoplay. iOS n'autorise `play()` sur un élément média que
//    dans un geste utilisateur. Le clic « Monter à bord » débloque le contexte
//    Web Audio, pas les éléments créés dix minutes plus tard : chaque annonce
//    partait en NotAllowedError, avalée par le `.catch()`. Pire, playOnce
//    renvoyait quand même `true` — donc pas même de repli speechSynthesis.
//    D'où le symptôme : tout s'entend sauf les voix.
// 2. MediaElementSource. WebKit rend régulièrement du silence pour un élément
//    détaché du document branché sur le graphe audio.
//
// Un AudioBuffer décodé n'a ni l'une ni l'autre contrainte : dès que le
// contexte tourne, il sonne.

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

// Un clip local rejoint le MÊME bus spatialisé que sa version synthétisée :
// déposer un door-open.mp3 ne fait pas ressortir le son du centre de la tête.
type Bus = 'cabin' | 'platform';

function busInput(bus: Bus): Tone.Gain | null {
  if (!nodes) return null;
  return bus === 'platform' ? nodes.platIn : nodes.paIn;
}

// --- Téléchargement et décodage des clips -------------------------------

/**
 * Budget de PCM décodé conservé en mémoire (octets). Les 204 annonces pèsent
 * 7,7 Mo compressées mais bien davantage une fois décodées : on garde les plus
 * récentes, les autres se retéléchargent depuis le cache HTTP du navigateur.
 */
const CLIP_CACHE_BYTES = 24 * 1024 * 1024;

/** Insertion la plus ancienne en tête : c'est l'ordre d'éviction. */
const clipCache = new Map<string, Tone.ToneAudioBuffer>();
let clipCacheBytes = 0;
const clipLoads = new Map<string, Promise<Tone.ToneAudioBuffer | null>>();
/** URLs qui ont répondu 404 : inutile de les redemander à chaque annonce. */
const missingClips = new Set<string>();

function clipBytes(buf: Tone.ToneAudioBuffer): number {
  return buf.length * buf.numberOfChannels * 4;
}

function cacheClip(url: string, buf: Tone.ToneAudioBuffer): void {
  clipCache.set(url, buf);
  clipCacheBytes += clipBytes(buf);
  for (const [key, old] of clipCache) {
    if (clipCacheBytes <= CLIP_CACHE_BYTES || key === url) break;
    clipCache.delete(key);
    clipCacheBytes -= clipBytes(old);
  }
}

/** Buffer décodé d'un clip, ou null si le fichier n'existe pas. */
async function loadClip(url: string): Promise<Tone.ToneAudioBuffer | null> {
  if (missingClips.has(url)) return null;
  const hit = clipCache.get(url);
  if (hit) {
    // Remis en fin de file : le plus récemment joué sort en dernier.
    clipCache.delete(url);
    clipCache.set(url, hit);
    return hit;
  }
  const pending = clipLoads.get(url);
  if (pending) return pending;
  const load = Tone.ToneAudioBuffer.fromUrl(url)
    .then((buf) => {
      clipLoads.delete(url);
      cacheClip(url, buf);
      return buf;
    })
    .catch(() => {
      clipLoads.delete(url);
      missingClips.add(url);
      return null;
    });
  clipLoads.set(url, load);
  return load;
}

interface ClipHandle {
  /** Résolue à la fin de la lecture, qu'elle aille au bout ou soit coupée. */
  ended: Promise<void>;
  stop: () => void;
}

/** Lance un buffer décodé sur un bus. Le player se démonte tout seul. */
function startClip(buf: Tone.ToneAudioBuffer, bus: Bus): ClipHandle {
  const dest = busInput(bus);
  const player = new Tone.Player({ url: buf });
  if (dest) player.connect(dest);
  else player.toDestination();

  let settle: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    settle = resolve;
  });
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.clearTimeout(guard);
    // Le démontage attend la sortie du callback : Tone n'aime pas qu'on
    // dispose un nœud depuis son propre onstop.
    window.setTimeout(() => player.dispose(), 0);
    settle();
  };
  // Filet : si onstop n'arrive jamais (contexte suspendu en cours de route),
  // la file d'annonces ne doit pas rester bloquée sur ce clip.
  const guard = window.setTimeout(finish, (buf.duration + 2) * 1000);
  player.onstop = finish;
  player.start();

  return {
    ended,
    stop: () => {
      if (finished) return;
      try {
        player.stop();
      } catch {
        /* déjà arrêté */
      }
      finish();
    },
  };
}

export async function playClip(name: string, fallback: () => void, bus: Bus = 'cabin'): Promise<void> {
  const buf = await loadClip(resolveAudioUrl(name));
  if (!buf) {
    fallback();
    return;
  }
  await startClip(buf, bus).ended;
}

// --- audioManager : lecture unique / arrêt par chemin ---

const activeByPath = new Map<string, ClipHandle>();
/** Incrémenté par stop() : invalide une lecture encore en cours de chargement. */
const stopEpoch = new Map<string, number>();

/**
 * Joue un fichier audio une seule fois. Si le même chemin est déjà en cours,
 * ne relance pas et attend la fin de la lecture existante.
 * @returns false si le fichier est introuvable (l'appelant peut alors se
 * rabattre sur la synthèse ou sur speechSynthesis).
 */
async function playOnce(path: string, bus: Bus = 'platform'): Promise<boolean> {
  const existing = activeByPath.get(path);
  if (existing) {
    await existing.ended;
    return true;
  }

  const epoch = stopEpoch.get(path) ?? 0;
  const buf = await loadClip(resolveAudioUrl(path));
  if (!buf) return false;
  // Annulé pendant le téléchargement (départ avorté, arrêt d'urgence) : on ne
  // lance surtout pas la lecture après coup.
  if ((stopEpoch.get(path) ?? 0) !== epoch) return true;

  // Un autre appel a pu démarrer le même clip pendant le téléchargement.
  const raced = activeByPath.get(path);
  if (raced) {
    await raced.ended;
    return true;
  }

  const handle = startClip(buf, bus);
  activeByPath.set(path, handle);
  void handle.ended.then(() => {
    if (activeByPath.get(path) === handle) activeByPath.delete(path);
  });
  await handle.ended;
  return true;
}

/** Arrête un clip lancé via playOnce (annulation de départ, urgence…). */
function stop(path: string): void {
  stopEpoch.set(path, (stopEpoch.get(path) ?? 0) + 1);
  const handle = activeByPath.get(path);
  if (!handle) return;
  activeByPath.delete(path);
  handle.stop();
}

export const audioManager = {
  playOnce,
  stop,
  isPlaying(path: string): boolean {
    return activeByPath.has(path);
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
  audioManager.stop(TAKANAWA_GATEWAY_INNER_GLORIOUS_A_PATH);
  audioManager.stop(TAKANAWA_GATEWAY_OUTER_GLORIOUS_B_PATH);
  audioManager.stop(KANDA_OUTER_MONDAMIN_A_PATH);
  audioManager.stop(KANDA_INNER_MONDAMIN_B_PATH);
  audioManager.stop(IKEBUKURO_INNER_BIC_CAMERA_A_PATH);
  audioManager.stop(IKEBUKURO_INNER_BIC_CAMERA_B_PATH);
}
