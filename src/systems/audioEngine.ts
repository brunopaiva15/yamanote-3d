// Moteur audio (Tone.js) : roulement, onduleur VVVF, joints de rail, freinage,
// carillons de porte, jingle d'arrivée — synthétisés — et mélodies de départ
// (発車メロディ) : clip quai réel quand disponible (voir data/melodies.ts),
// sinon synthèse. Démarré uniquement au clic « Monter à bord ».
//
// Spatialisation : tout ce qui sort de la SONORISATION (carillons de porte,
// jingle d'arrivée, souffle de ligne des annonces) passe par un bus « PA »
// — filtrage passe-bande + compression, le timbre d'un haut-parleur de wagon —
// puis est diffusé par un Panner3D PAR DIFFUSEUR de plafond (voir
// CABIN_SPEAKERS). La mélodie de départ (発車メロディ) et les annonces ATOS,
// elles, viennent des haut-parleurs du QUAI : elles sont étouffées portes
// fermées et s'ouvrent par les portes. L'auditeur (Tone.Listener) suit la
// caméra, donc le son tourne quand on tourne la tête et se rapproche quand on
// marche sous un diffuseur.
//
// Deux sonorisations, deux VOIX. Une gare a sa propre sono, indépendante de
// celle de la rame, et on ne les entend pas au même endroit :
//
//   • sur le QUAI, la voix de bord est inaudible — les diffuseurs sont dans le
//     wagon, derrière les vitres (paVoiceGain tombe à zéro) ;
//   • DANS la rame arrêtée en gare, la voix du quai n'est qu'un lointain qui
//     entre par les portes (platVoiceGain très en retrait).
//
// La MUSIQUE du quai, elle, ne suit pas cette règle : la 発車メロディ est faite
// pour être entendue des voyageurs déjà montés, et elle passe donc en clair par
// les portes ouvertes (bus « melody » → platIn, sans platVoiceGain). Ce bus lui
// est propre : il porte son niveau, calé plus bas sur le quai que dans la rame
// (MELODY_OUTSIDE / MELODY_INSIDE), pour qu'elle sonne DEPUIS LA GARE sans
// écraser le reste, et reste franchement audible d'une voiture à quai.
//
// Annonces vocales : elles passent TOUTES par un clip pré-généré (Kokoro, voir
// systems/speech.ts), joué par audioManager sur le bus « PA » et donc panné
// comme le reste, sous son souffle de ligne (paVoiceOpen/Close). Il n'y a plus
// de repli speechSynthesis : cette voix-là sortait hors du graphe Web Audio,
// impossible à panner, et s'entendait comme une cinquième voix au milieu des
// quatre du jeu.
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
  MELODY_PATHS,
  MELODY_REPEATS,
  MELODY_REPEAT_GAP_S,
  SYNTH_MELODY_DURATION_S,
} from '../data/melodies';
import { STATIONS } from '../data/stations';
import {
  buildDepartureContext,
  isDepartureBlocked,
  playDepartureMelodyForContext,
} from './departureSequence';

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
  paVoiceIn: Tone.Gain; // voix de bord seule, coupée depuis le quai
  paVoiceGain: Tone.Gain;
  platIn: Tone.Gain; // entrée du bus quai
  platVoiceIn: Tone.Gain; // voix du quai seule, lointaine depuis la rame
  platVoiceGain: Tone.Gain;
  melodyIn: Tone.Gain; // 発車メロディ seule, calée à part du reste du quai
  platGain: Tone.Gain;
  platLp: Tone.Filter;
  platPanners: Tone.Panner3D[];
  hissGain: Tone.Gain;
  paClick: Tone.NoiseSynth;
  platHissGain: Tone.Gain;
  platClick: Tone.NoiseSynth;
  platChime: Tone.Synth;
  platBeep: Tone.Synth;
  // Ambiance de gare : le fond sonore du LIEU, distinct de la sonorisation.
  ambBed: Tone.Noise;
  ambFilter: Tone.Filter;
  ambGain: Tone.Gain;
  ambIn: Tone.Gain;
  ambChirp: Tone.Synth;
  ambBell: Tone.Synth;
  ambWhoosh: Tone.NoiseSynth;
  roomVerb: Tone.Reverb;
  roomSend: Tone.Gain;
  roomLp: Tone.Filter;
  // Train qui traverse sur la voie d'en face : sa propre source, spatialisée
  // au point de la rame le plus proche de l'oreille (voir setPassBy).
  passPanner: Tone.Panner3D;
  passRoar: Tone.Noise;
  passRoarFilter: Tone.Filter;
  passRoarGain: Tone.Gain;
  passWind: Tone.Noise;
  passWindFilter: Tone.Filter;
  passWindGain: Tone.Gain;
  passClack: Tone.NoiseSynth;
  passHornA: Tone.Synth;
  passHornB: Tone.Synth;
  /** Bruitages PNJ : souffle (éternuement, toux, bâillement). */
  paxBreath: Tone.NoiseSynth;
  paxBreathFilter: Tone.Filter;
  /** Tissu / sac. */
  paxFabric: Tone.NoiseSynth;
  paxFabricFilter: Tone.Filter;
  /** Clics secs (photo, écouteurs). */
  paxClick: Tone.NoiseSynth;
  /** Murmure d'un voyageur qui s'adresse au joueur (syllabes, pas de mots). */
  paxVoiceSynth: Tone.Synth;
  paxVoiceFilter: Tone.Filter;
  // Météo : la pluie sur le pavillon, la pluie du dehors, le tonnerre.
  rainRoof: Tone.Noise;
  rainRoofFilter: Tone.Filter;
  rainRoofGain: Tone.Gain;
  rainOut: Tone.Noise;
  rainOutFilter: Tone.Filter;
  rainOutGain: Tone.Gain;
  thunderNoise: Tone.NoiseSynth;
  thunderFilter: Tone.Filter;
  thunderCrack: Tone.Synth;
}

let nodes: Nodes | null = null;
let volume = 0.8;
let prevSpeed01 = 0;

/**
 * Niveau de la voix du QUAI entendue depuis la rame. Assez pour reconnaître
 * qu'une annonce passe dehors et en attraper des morceaux, pas assez pour
 * couvrir celle du wagon : c'est ce qu'on entend vraiment, assis porte ouverte.
 */
const PLAT_VOICE_INSIDE = 0.3;

/**
 * Niveau du bus de la sono du QUAI, aux trois points de calage : portes
 * fermées, portes ouvertes, et debout sur le quai.
 *
 * Ce bus alimente QUATRE Panner3D qui se somment sur l'auditeur, et sur le quai
 * on se tient à trois mètres sous le plus proche : un gain qui semble modeste
 * au nœud arrive bien plus fort à l'oreille, et la gare écrasait tout le reste.
 * Les trois valeurs gardent entre elles les mêmes rapports qu'avant — la
 * mélodie entre toujours franchement par les portes, et le quai reste plus
 * ouvert que la rame — mais l'ensemble redescend d'environ 8 dB.
 */
const PLAT_BUS_CLOSED = 0.07;
const PLAT_BUS_OPEN = 0.26;
const PLAT_BUS_OUTSIDE = 0.34;

/**
 * Niveau propre de la 発車メロディ, en plus du bus du quai.
 *
 * Les clips sont normalisés en crête (voir scripts/melodies-gen.py) : envoyés
 * tels quels sur le bus, ils sonnaient bien plus fort que tout le reste de la
 * gare — la mélodie écrasait l'annonce qui la suit et le brouhaha du quai.
 *
 * Deux calages, parce que ce n'est pas le même problème des deux côtés des
 * portes. Sur le QUAI on se tient à trois mètres sous un diffuseur : c'est là
 * que c'était criard, et c'est là qu'on retire le plus (≈ −10 dB). DANS la
 * rame la mélodie arrive déjà filtrée par les ouvertures, et elle doit rester
 * ce qu'elle est pour un voyageur assis — le signal qu'il faut descendre
 * maintenant : on n'en retire que ≈ 5 dB, de quoi la ramener au niveau des
 * autres sons de gare sans jamais la faire passer au second plan.
 *
 * Le rapport entre les deux garde la mélodie DU CÔTÉ DU QUAI : à l'oreille
 * elle reste plus présente dehors que dedans, elle vient toujours des
 * haut-parleurs de la gare et non de la rame.
 */
const MELODY_INSIDE = 0.55;
const MELODY_OUTSIDE = 0.32;

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

  // Voix de bord : tout ce que DIT la rame passe par ce robinet, et lui seul se
  // ferme quand le joueur descend sur le quai. Les carillons de porte et le
  // jingle d'arrivée restent branchés en direct sur paIn — eux, on les entend
  // très bien depuis le quai.
  const paVoiceGain = new Tone.Gain(1).connect(paIn);
  const paVoiceIn = new Tone.Gain(1).connect(paVoiceGain);

  // Souffle de ligne : la sono s'ouvre juste avant l'annonce et se referme
  // après. Spatialisé, il ancre la voix (non pannable) sur les diffuseurs.
  const hiss = new Tone.Noise('pink');
  const hissFilter = new Tone.Filter({ type: 'bandpass', frequency: 1500, Q: 0.4 });
  const hissGain = new Tone.Gain(0);
  hiss.chain(hissFilter, hissGain, paVoiceIn);
  hiss.start();
  // Déclic d'ouverture / fermeture de la ligne.
  const paClick = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.02, sustain: 0 },
    volume: -14,
  }).connect(paVoiceIn);

  // --- Bus SONORISATION du quai ----------------------------------------
  // La 発車メロディ est diffusée sur le quai, pas dans la rame : portes
  // fermées elle est sourde et lointaine, portes ouvertes elle entre par les
  // ouvertures. platLp / platGain sont pilotés par setPlatformDoors().
  const platIn = new Tone.Gain(1);
  const platHp = new Tone.Filter({ type: 'highpass', frequency: 260, rolloff: -12, Q: 0.7 });
  const platLp = new Tone.Filter({ type: 'lowpass', frequency: 900, rolloff: -24, Q: 0.4 });
  const platGain = new Tone.Gain(PLAT_BUS_CLOSED);
  platIn.chain(platHp, platLp, platGain);
  // Voix du quai (annonces ATOS, agent de quai) : même sono que la mélodie,
  // mais elle passe par un robinet à part. La musique est faite pour porter
  // jusque dans la rame ; la parole du quai, non — depuis une voiture arrêtée
  // on n'en saisit qu'un lointain, même portes ouvertes.
  const platVoiceGain = new Tone.Gain(PLAT_VOICE_INSIDE).connect(platIn);
  const platVoiceIn = new Tone.Gain(1).connect(platVoiceGain);
  const platHiss = new Tone.Noise('pink');
  const platHissFilter = new Tone.Filter({ type: 'bandpass', frequency: 1300, Q: 0.4 });
  const platHissGain = new Tone.Gain(0);
  platHiss.chain(platHissFilter, platHissGain, platVoiceIn);
  platHiss.start();
  const platClick = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.025, sustain: 0 },
    volume: -16,
  }).connect(platVoiceIn);

  // Carillon ATOS (avant l'annonce d'approche) et bips de service : le signal
  // électronique de l'entrée en gare, les bips des portes palières. Branchés
  // en direct sur platIn — ce sont des signaux, pas de la parole, et ils
  // portent jusque dans la rame.
  const platChime = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.004, decay: 0.7, sustain: 0.05, release: 0.6 },
    volume: -6,
  }).connect(platIn);
  const platBeep = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.002, decay: 0.1, sustain: 0.3, release: 0.06 },
    volume: -20,
  }).connect(platIn);

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

  // --- Bus de la 発車メロディ -------------------------------------------
  //
  // La mélodie de départ passe par la sono du quai comme le reste, mais avec
  // son propre robinet : c'est le seul élément de la gare qu'on veut pouvoir
  // baisser sans toucher au carillon ATOS ni aux annonces. Une petite bosse
  // de présence la maintient LISIBLE une fois le niveau descendu — dans la
  // rame, le passe-bas des portes lui coupe déjà le haut du spectre, et c'est
  // cette bande-là qui la fait passer par-dessus le brouhaha et la clim.
  const melodyIn = new Tone.Gain(MELODY_INSIDE);
  const melodyPresence = new Tone.Filter({ type: 'peaking', frequency: 2100, Q: 0.8, gain: 3 });
  melodyIn.chain(melodyPresence, platIn);

  // Mélodies de départ : triangle principal + harmonique douce à l'octave,
  // envoyées sur les haut-parleurs du quai.
  const melodyA = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.25 },
  }).connect(melodyIn);
  const melodyB = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.25, release: 0.25 },
    volume: -14,
  }).connect(melodyIn);

  // --- Ambiance du lieu -----------------------------------------------
  //
  // Ce n'est ni la rame ni la sonorisation : c'est ce qu'on entend PAR-DESSUS,
  // et qui n'est pas le même à Uguisudani, dans sa vallée d'arbres, qu'à
  // Shinjuku sous sa dalle. Un lit de bruit filtré donne la couleur du lieu ;
  // trois petits générateurs y posent des événements — un chant d'oiseau, un
  // timbre de tram, le passage feutré d'un monorail.
  const ambIn = new Tone.Gain(1);
  const ambFilter = new Tone.Filter({ type: 'lowpass', frequency: 900, rolloff: -12, Q: 0.5 });
  const ambGain = new Tone.Gain(0);
  ambIn.chain(ambFilter, ambGain);
  ambGain.connect(master);
  const ambBed = new Tone.Noise('pink').connect(ambIn);
  ambBed.volume.value = -18;
  ambBed.start();

  const ambChirp = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.006, decay: 0.09, sustain: 0, release: 0.06 },
    volume: -16,
  }).connect(ambIn);
  const ambBell = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.002, decay: 0.7, sustain: 0, release: 0.5 },
    volume: -20,
  }).connect(ambIn);
  const ambWhoosh = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.5, decay: 1.4, sustain: 0, release: 0.6 },
    volume: -18,
  }).connect(ambIn);

  // Réverbération du LIEU. Une seule queue, dont on ne fait varier que le
  // niveau d'envoi et la brillance : une tranchée est sourde et proche, une
  // halle longue et claire, un viaduc n'en a pour ainsi dire pas. Recréer une
  // réponse impulsionnelle à chaque gare coûterait un rendu asynchrone pour un
  // effet que l'oreille attribue surtout à la quantité de réverbération.
  const roomVerb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 });
  const roomLp = new Tone.Filter({ type: 'lowpass', frequency: 2200, rolloff: -12, Q: 0.4 });
  const roomSend = new Tone.Gain(0);
  roomSend.chain(roomLp, roomVerb);
  roomVerb.connect(master);
  ambGain.connect(roomSend);
  platGain.connect(roomSend);

  // --- Train qui traverse ----------------------------------------------
  //
  // Rien de tout cela n'appartient à la rame du joueur : ni le bus train (qui
  // s'atténue avec SA distance), ni la sono. C'est une source à part, posée
  // dans l'espace et qui balaie l'auditeur en quelques secondes — le seul son
  // du jeu qui passe VRAIMENT d'un côté à l'autre de la tête.
  //
  // Deux couches, parce qu'un passage à 90 km/h s'entend en deux temps : le
  // grondement, qui monte longtemps à l'avance et porte loin, et le souffle
  // aigu — l'air déplacé, le crissement des boudins — qui n'existe qu'au
  // moment où la caisse est là.
  const passPanner = new Tone.Panner3D({
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    refDistance: 8,
    rolloffFactor: 0.8,
    maxDistance: 400,
  }).connect(master);
  const passRoar = new Tone.Noise('brown');
  const passRoarFilter = new Tone.Filter({ type: 'lowpass', frequency: 300, Q: 0.9 });
  const passRoarGain = new Tone.Gain(0);
  passRoar.chain(passRoarFilter, passRoarGain, passPanner);
  passRoar.start();
  const passWind = new Tone.Noise('white');
  const passWindFilter = new Tone.Filter({ type: 'highpass', frequency: 2200, rolloff: -12, Q: 0.6 });
  const passWindGain = new Tone.Gain(0);
  passWind.chain(passWindFilter, passWindGain, passPanner);
  passWind.start();
  // La gare répond : un passage en tranchée cogne, sur un viaduc il file.
  passRoarGain.connect(roomSend);
  // Martèlement des bogies sur les joints, plus sec que le nôtre : ce n'est
  // pas sous nos pieds, ça vient d'en face.
  const passClackFilter = new Tone.Filter({ type: 'bandpass', frequency: 620, Q: 1.2 });
  const passClack = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
  });
  passClack.chain(passClackFilter, passPanner);
  // Avertisseur : deux tons tenus ensemble, à l'entrée en gare.
  const passHornA = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.04, decay: 0.2, sustain: 0.6, release: 0.25 },
    volume: -20,
  }).connect(passPanner);
  const passHornB = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.04, decay: 0.2, sustain: 0.6, release: 0.25 },
    volume: -22,
  }).connect(passPanner);

  // Bruitages voyageurs : très discrets, sur le bus rame (pas la sono PA).
  const paxBreathFilter = new Tone.Filter({ type: 'bandpass', frequency: 1600, Q: 0.85 });
  const paxBreath = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.015, decay: 0.22, sustain: 0 },
    volume: -16,
  });
  paxBreath.chain(paxBreathFilter, trainBus);

  const paxFabricFilter = new Tone.Filter({ type: 'bandpass', frequency: 780, Q: 0.7 });
  const paxFabric = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.008, decay: 0.14, sustain: 0 },
    volume: -20,
  });
  paxFabric.chain(paxFabricFilter, trainBus);

  const paxClickFilter = new Tone.Filter({ type: 'highpass', frequency: 2200, Q: 0.5 });
  const paxClick = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0 },
    volume: -18,
  });
  paxClick.chain(paxClickFilter, trainBus);

  // Voix d'un voyageur : jamais des mots — une bouche fermée derrière un
  // masque, à un mètre. Une dent de scie très filtrée passée en bande étroite
  // autour du premier formant donne la bonne matière : on entend QUE quelqu'un
  // parle, pas CE qu'il dit — le texte, lui, est à l'écran.
  const paxVoiceFilter = new Tone.Filter({ type: 'bandpass', frequency: 620, Q: 2.4 });
  const paxVoiceSynth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.02, decay: 0.09, sustain: 0.35, release: 0.06 },
    volume: -26,
  });
  paxVoiceSynth.chain(paxVoiceFilter, trainBus);

  // --- La météo -----------------------------------------------------------
  //
  // La pluie s'entend en DEUX endroits qui n'ont rien à voir, et c'est ce qui
  // la rend crédible depuis un train :
  //
  //   · sur le PAVILLON, au-dessus de la tête. Un crépitement mat, sourd, sans
  //     aigus — la tôle et l'isolant les mangent. Il ne passe pas par les
  //     portes : il est là même portes fermées, et c'est le seul son du jeu
  //     dont l'ouverture des portes ne change rien. Il appartient à la rame,
  //     donc au bus qui s'atténue quand on la regarde depuis le quai ;
  //   · DEHORS, sur la ville et sur le quai. Un souffle large et brillant, qui
  //     n'entre dans le wagon que par les ouvertures — comme l'ambiance de
  //     gare, et pour la même raison.
  //
  // Une seule source de bruit pour les deux aurait forcé à choisir un timbre,
  // et le timbre est précisément ce qui distingue les deux endroits.
  const rainRoof = new Tone.Noise('brown');
  const rainRoofFilter = new Tone.Filter({ type: 'lowpass', frequency: 620, rolloff: -24, Q: 0.6 });
  const rainRoofGain = new Tone.Gain(0);
  rainRoof.chain(rainRoofFilter, rainRoofGain, trainBus);
  rainRoof.start();

  const rainOut = new Tone.Noise('pink');
  const rainOutFilter = new Tone.Filter({ type: 'highpass', frequency: 700, rolloff: -12, Q: 0.4 });
  const rainOutGain = new Tone.Gain(0);
  rainOut.chain(rainOutFilter, rainOutGain, master);
  rainOut.start();

  // Le tonnerre : un grondement long et sourd, plus un claquement qui ne vaut
  // que pour les coups proches. C'est le RAPPORT des deux qui donne la
  // distance, bien plus que le niveau.
  const thunderFilter = new Tone.Filter({ type: 'lowpass', frequency: 220, rolloff: -24, Q: 1.1 });
  const thunderNoise = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.18, decay: 3.2, sustain: 0.06, release: 2.4 },
    volume: -6,
  });
  thunderNoise.chain(thunderFilter, master);
  const thunderCrack = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.002, decay: 0.22, sustain: 0, release: 0.2 },
    volume: -20,
  }).connect(thunderFilter);

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
    paVoiceIn,
    paVoiceGain,
    platIn,
    platVoiceIn,
    platVoiceGain,
    melodyIn,
    platGain,
    platLp,
    platPanners,
    hissGain,
    paClick,
    platHissGain,
    platClick,
    platChime,
    platBeep,
    ambBed,
    ambFilter,
    ambGain,
    ambIn,
    ambChirp,
    ambBell,
    ambWhoosh,
    roomVerb,
    roomSend,
    roomLp,
    passPanner,
    passRoar,
    passRoarFilter,
    passRoarGain,
    passWind,
    passWindFilter,
    passWindGain,
    passClack,
    passHornA,
    passHornB,
    paxBreath,
    paxBreathFilter,
    paxFabric,
    paxFabricFilter,
    paxClick,
    paxVoiceSynth,
    paxVoiceFilter,
    rainRoof,
    rainRoofFilter,
    rainRoofGain,
    rainOut,
    rainOutFilter,
    rainOutGain,
    thunderNoise,
    thunderFilter,
    thunderCrack,
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
    nodes.platGain.gain.rampTo(PLAT_BUS_OUTSIDE, 0.25);
  }
  // Debout sur le quai, la sono du wagon est derrière les vitres : les
  // diffuseurs sont à l'intérieur, la voix de bord ne sort pas. À l'inverse,
  // celle du quai n'a plus rien à traverser.
  nodes.paVoiceGain.gain.rampTo(outside ? 0 : 1, 0.3);
  nodes.platVoiceGain.gain.rampTo(outside ? 1 : PLAT_VOICE_INSIDE, 0.3);
  // La mélodie, elle, est CALÉE PAR LIEU : sous le diffuseur elle doit se
  // tenir, depuis la rame elle doit s'entendre. Voir MELODY_INSIDE.
  nodes.melodyIn.gain.rampTo(outside ? MELODY_OUTSIDE : MELODY_INSIDE, 0.3);
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
  nodes.platGain.gain.rampTo(PLAT_BUS_CLOSED + o * (PLAT_BUS_OPEN - PLAT_BUS_CLOSED), 0.12);
}

// Un instrument Tone refuse tout déclenchement antérieur ou égal au dernier
// programmé : « Start time must be strictly greater than previous start time ».
// Sur une frame longue (onglet repris, GPU saturé, machine lente), plusieurs
// événements du cycle tombent au MÊME instant audio — deux portes qui claquent,
// l'immobilisation et un choc de porte — et l'assertion cassait la frame.
// Chaque instrument à déclenchements multiples réserve donc son créneau ici.
const lastTriggerAt = new Map<string, number>();

function slot(instrument: string, when: number, gap = 0.005): number {
  const t = Math.max(when, (lastTriggerAt.get(instrument) ?? 0) + gap);
  lastTriggerAt.set(instrument, t);
  return t;
}

// Ouverture / fermeture d'une ligne de sonorisation autour d'une annonce.
// Deux lignes indépendantes : celle de la rame et celle de la gare.
export function paVoiceOpen(bus: VoiceBus = 'cabinVoice'): void {
  if (!nodes) return;
  const plat = bus === 'platformVoice';
  const click = plat ? nodes.platClick : nodes.paClick;
  const hiss = plat ? nodes.platHissGain : nodes.hissGain;
  click.triggerAttackRelease(0.02, slot(plat ? 'platClick' : 'paClick', Tone.now()), 0.5);
  hiss.gain.rampTo(plat ? 0.022 : 0.03, 0.1);
}

export function paVoiceClose(bus: VoiceBus = 'cabinVoice'): void {
  if (!nodes) return;
  const plat = bus === 'platformVoice';
  const click = plat ? nodes.platClick : nodes.paClick;
  const hiss = plat ? nodes.platHissGain : nodes.hissGain;
  hiss.gain.rampTo(0, 0.3);
  click.triggerAttackRelease(0.015, slot(plat ? 'platClick' : 'paClick', Tone.now() + 0.18), 0.3);
}

// --- Signaux de la sono du quai -----------------------------------------

/**
 * Carillon ATOS : le motif de quelques notes qui précède l'annonce d'approche.
 * Ce n'est pas la mélodie de départ — c'est un signal d'attention, court, sur
 * lequel personne ne se retourne mais que tout le monde reconnaît.
 *
 * @returns la durée du motif (s). Le carillon PRÉCÈDE l'annonce, il ne la
 *          couvre pas : l'appelant attend ce délai avant de faire parler la
 *          gare (voir stationPa.paApproach).
 */
export function platformChime(): number {
  if (!nodes) return 0;
  const lead = 0.05;
  const step = 0.3;
  const tail = 0.6;
  const now = Tone.now() + lead;
  const notes = ['C#6', 'G#5', 'B5', 'E5', 'G#5'];
  notes.forEach((n, i) => {
    nodes!.platChime.triggerAttackRelease(n, 0.6, slot('platChime', now + i * step), 0.42);
  });
  return lead + (notes.length - 1) * step + tail;
}

/**
 * Signal électronique avant 「電車がまいります」 : deux bips secs.
 *
 * @returns la durée du signal (s), pour la même raison que le carillon.
 */
export function platformWarningSignal(): number {
  if (!nodes) return 0;
  const now = Tone.now();
  const gap = 0.24;
  const tail = 0.14;
  nodes.platBeep.triggerAttackRelease('E6', 0.14, slot('platBeep', now), 0.4);
  nodes.platBeep.triggerAttackRelease('E6', 0.14, slot('platBeep', now + gap), 0.4);
  return gap + tail;
}

/** Bips des portes palières pendant leur fermeture. */
export function psdDoorBeeps(): void {
  if (!nodes) return;
  const now = Tone.now();
  for (let i = 0; i < 5; i++) {
    nodes.platBeep.triggerAttackRelease('B5', 0.1, slot('platBeep', now + i * 0.36), 0.3);
  }
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
  // Sur le quai la référence est plus longue (~65 m) : la rame qui arrive se
  // fait entendre dès le bout du quai, et celle qui part s'efface vers 320 m.
  const ref = listenerOutside ? 65 : 22;
  const exp = listenerOutside ? 1.35 : 1.6;
  const far = 1 / (1 + Math.pow(rollingDistance / ref, exp));
  nodes.trainBus.gain.rampTo(far, 0.12);

  // Gains calés pour l'intérieur du wagon : debout sur le quai, face à la
  // rame et contre l'ambiance de gare, on les remonte pour que départ et
  // arrivée se lisent clairement.
  const exterior = listenerOutside ? 2.8 : 1;
  nodes.rollGain.gain.rampTo(Math.pow(speed01, 1.1) * 0.32 * exterior, 0.08);
  // Rail mouillé : le roulement monte dans les aigus. C'est la pellicule d'eau
  // qui siffle sous la bande de roulement, et tout voyageur régulier
  // l'entend — c'est même souvent à ça qu'on devine qu'il pleut avant de
  // regarder dehors.
  nodes.rollFilter.frequency.rampTo(
    (280 + speed01 * 1500) * (0.35 + 0.65 * far) * (1 + 0.3 * railWet),
    0.08,
  );

  // Le « chant » VVVF : surtout audible à l'accélération, plus discrètement
  // au freinage (récupération). L'accélération réelle est ~0,84 m/s² : le
  // facteur est calé pour que la pleine traction donne un boost proche de 1.
  const accelBoost = Math.max(0, Math.min(1, accel01 * 12));
  const regenBoost = Math.max(0, Math.min(0.5, -accel01 * 6));
  const boost = Math.max(accelBoost, regenBoost);
  nodes.vvvfOsc.frequency.rampTo(52 + speed01 * 170, 0.08);
  nodes.vvvfFilter.frequency.rampTo(160 + speed01 * 1900, 0.08);
  nodes.vvvfGain.gain.rampTo(
    speed01 > 0.005 ? (0.012 + boost * 0.05 * (0.35 + speed01)) * exterior : 0,
    0.1,
  );

  // Crissement sous ~40 % de vitesse en freinage.
  const squeal =
    braking && speed01 < 0.4 && speed01 > 0.015 ? (0.4 - speed01) * 0.5 * 0.28 * exterior : 0;
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
  nodes.thud.triggerAttackRelease('G1', 0.09, slot('thud', now), vel);
  nodes.clack.triggerAttackRelease(0.03, slot('clack', now + 0.012), vel * 0.7);
}

/**
 * La porte rencontre quelqu'un, ou quelque chose.
 *
 * Ce n'est pas un choc de butée : rien ne claque, rien ne verrouille. Un coup
 * sourd, court, amorti par ce qui est pris dedans — c'est exactement à ça
 * qu'on entend, depuis l'intérieur, qu'une porte ne s'est pas fermée.
 */
export function doorObstacleBump(vel: number): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.thud.triggerAttackRelease('E1', 0.12, slot('thud', now), vel);
}

// Choc plus mat des portes palières, entendues depuis l'intérieur du wagon.
export function psdClunk(vel: number): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.thud.triggerAttackRelease('C2', 0.07, slot('thud', now), vel * 0.8);
  nodes.clack.triggerAttackRelease(0.025, slot('clack', now + 0.01), vel * 0.45);
}

// --- Bruitages du circuit de frein et de course -------------------------

// Mise en action des freins : brève purge d'air en début de freinage.
export function brakeApply(): void {
  if (!nodes) return;
  nodes.vent.envelope.decay = 0.5;
  nodes.vent.triggerAttackRelease(0.25, slot('vent', Tone.now()), listenerOutside ? 0.28 : 0.12);
}

// Desserrage des freins juste avant le départ : longue purge « pshhh »
// suivie d'une petite queue d'échappement.
export function brakeRelease(): void {
  if (!nodes) return;
  const now = Tone.now();
  const loud = listenerOutside ? 2.2 : 1;
  nodes.vent.envelope.decay = 1.3;
  nodes.vent.triggerAttackRelease(0.55, slot('vent', now), 0.2 * loud);
  nodes.vent.triggerAttackRelease(0.2, slot('vent', now + 1.15), 0.07 * loud);
}

// Immobilisation complète : léger tassement de caisse puis serrage à l'arrêt.
export function stopSettle(): void {
  if (!nodes) return;
  const now = Tone.now();
  const loud = listenerOutside ? 2 : 1;
  nodes.thud.triggerAttackRelease('F1', 0.12, slot('thud', now), 0.1 * loud);
  nodes.vent.envelope.decay = 0.4;
  nodes.vent.triggerAttackRelease(0.2, slot('vent', now + 0.3), 0.09 * loud);
}

// Crissement de boudin dans une courbe : deux tenues aiguës, très en retrait.
export function flangeSqueal(intensity: number): void {
  if (!nodes) return;
  const now = Tone.now();
  const base = 2500 + Math.random() * 900;
  const vel = (0.05 + intensity * 0.06) * (listenerOutside ? 2.4 : 1);
  nodes.squeal.triggerAttackRelease(base, 0.9 + Math.random() * 0.8, slot('squeal', now), vel);
  nodes.squeal.triggerAttackRelease(base * 1.045, 0.5, slot('squeal', now + 1.35), vel * 0.6);
}

// Petite purge du compresseur sous le plancher, en pleine course.
export function airCompressorPurge(): void {
  if (!nodes) return;
  nodes.vent.envelope.decay = 0.35;
  nodes.vent.triggerAttackRelease(0.15, slot('vent', Tone.now()), 0.05);
}

// --- Bruitages voyageurs (Foley discret, bus rame) -----------------------

/** Atténuation par distance au joueur (m). Au-delà de ~7 m : silence. */
function paxVel(dist: number, base: number): number {
  if (dist > 7.5) return 0;
  return base / (1 + dist * 0.55);
}

/** Éternuement feutré (inspiration + atchoum). */
export function paxSneeze(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.09);
  if (v <= 0) return;
  const now = Tone.now();
  nodes.paxBreathFilter.frequency.value = 1200;
  nodes.paxBreath.envelope.decay = 0.12;
  nodes.paxBreath.triggerAttackRelease(0.1, slot('paxBreath', now), v * 0.35);
  nodes.paxBreathFilter.frequency.setValueAtTime(2200, now + 0.14);
  nodes.paxBreath.envelope.decay = 0.2;
  nodes.paxBreath.triggerAttackRelease(0.16, slot('paxBreath', now + 0.14), v);
  nodes.paxFabric.triggerAttackRelease(0.08, slot('paxFabric', now + 0.16), v * 0.4);
}

/** Toux sèche, courte. */
export function paxCough(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.07);
  if (v <= 0) return;
  const now = Tone.now();
  nodes.paxBreathFilter.frequency.value = 2400;
  nodes.paxBreath.envelope.decay = 0.1;
  nodes.paxBreath.triggerAttackRelease(0.07, slot('paxBreath', now), v);
  nodes.paxBreath.triggerAttackRelease(0.05, slot('paxBreath', now + 0.11), v * 0.65);
}

/** Reniflement. */
export function paxSniffle(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.045);
  if (v <= 0) return;
  nodes.paxBreathFilter.frequency.value = 2800;
  nodes.paxBreath.envelope.decay = 0.08;
  nodes.paxBreath.triggerAttackRelease(0.06, slot('paxBreath', Tone.now()), v);
}

/** Bâillement : souffle très bas. */
export function paxYawn(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.035);
  if (v <= 0) return;
  const now = Tone.now();
  nodes.paxBreathFilter.frequency.value = 700;
  nodes.paxBreath.envelope.decay = 0.55;
  nodes.paxBreath.triggerAttackRelease(0.45, slot('paxBreath', now), v);
  nodes.paxFabric.triggerAttackRelease(0.2, slot('paxFabric', now + 0.1), v * 0.5);
}

/** Fouille de sac / tissu. */
export function paxFabricRustle(dist: number, pulses = 3): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.055);
  if (v <= 0) return;
  const now = Tone.now();
  for (let i = 0; i < pulses; i++) {
    nodes.paxFabric.triggerAttackRelease(
      0.07 + Math.random() * 0.05,
      slot('paxFabric', now + i * 0.12),
      v * (0.7 + Math.random() * 0.3),
    );
  }
}

/** Gorgée discrète. */
export function paxDrink(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.04);
  if (v <= 0) return;
  const now = Tone.now();
  nodes.paxBreathFilter.frequency.value = 900;
  nodes.paxBreath.envelope.decay = 0.15;
  nodes.paxBreath.triggerAttackRelease(0.12, slot('paxBreath', now + 0.55), v);
  nodes.paxClick.triggerAttackRelease(0.02, slot('paxClick', now + 0.05), v * 0.5);
}

/**
 * Murmure d'un voyageur qui parle au joueur : une poignée de syllabes, pas
 * des mots. La hauteur suit la personne — une voix de femme au-dessus d'une
 * voix d'homme, un grand plus bas qu'un petit, un ancien plus voilé — et la
 * phrase retombe à la fin, comme une phrase japonaise affirmative.
 */
export function paxVoice(opts: {
  dist: number;
  feminine: boolean;
  senior: boolean;
  /** Échelle du personnage (≈ taille / 1,445) : un grand parle plus bas. */
  scale: number;
  syllables: number;
}): void {
  if (!nodes) return;
  const v = paxVel(opts.dist, 0.5);
  if (v <= 0) return;
  const now = Tone.now();
  // Fondamentale : ~195 Hz pour une voix féminine, ~118 Hz pour une masculine.
  let base = opts.feminine ? 195 : 118;
  base *= 1 / Math.max(0.85, Math.min(1.15, opts.scale));
  if (opts.senior) base *= 0.92;
  nodes.paxVoiceFilter.frequency.value = opts.feminine ? 780 : 560;
  nodes.paxVoiceSynth.envelope.sustain = opts.senior ? 0.28 : 0.35;
  const n = Math.max(2, Math.min(10, opts.syllables));
  let t = now;
  for (let i = 0; i < n; i++) {
    // La ligne mélodique descend d'un ton et demi sur la phrase, avec le
    // petit tremblement d'une voix réelle.
    const fall = 1 - (i / n) * 0.16;
    const jitter = 0.94 + Math.random() * 0.13;
    const hold = 0.09 + Math.random() * 0.06;
    nodes.paxVoiceSynth.triggerAttackRelease(
      base * fall * jitter,
      hold,
      slot('paxVoice', t),
      v * (0.72 + Math.random() * 0.28),
    );
    t += hold + 0.045 + Math.random() * 0.06;
  }
  // Un souffle en fin de phrase : c'est ce qui fait qu'on entend quelqu'un et
  // pas un instrument.
  nodes.paxBreathFilter.frequency.value = 1500;
  nodes.paxBreath.envelope.decay = 0.16;
  nodes.paxBreath.triggerAttackRelease(0.12, slot('paxBreath', t + 0.02), v * 0.22);
}

/** Clic d'obturateur / écouteurs. */
export function paxClick(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.05);
  if (v <= 0) return;
  nodes.paxClick.triggerAttackRelease(0.025, slot('paxClick', Tone.now()), v);
}

/** Faux pas : déséquilibre + rattrapage. */
export function paxStumble(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.08);
  if (v <= 0) return;
  const now = Tone.now();
  nodes.paxFabric.triggerAttackRelease(0.12, slot('paxFabric', now), v);
  nodes.clack.triggerAttackRelease(0.04, slot('clack', now + 0.08), v * 0.35);
  nodes.paxFabric.triggerAttackRelease(0.1, slot('paxFabric', now + 0.35), v * 0.55);
  nodes.thud.triggerAttackRelease('C2', 0.06, slot('thud', now + 0.4), v * 0.25);
}

/**
 * Chute : bascule, impact au sol, relevé (bruitages calés sur paxMotion « fall »).
 */
export function paxFall(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.12);
  if (v <= 0) return;
  const now = Tone.now();
  nodes.paxFabric.triggerAttackRelease(0.18, slot('paxFabric', now), v * 0.8);
  nodes.paxBreathFilter.frequency.value = 1100;
  nodes.paxBreath.envelope.decay = 0.2;
  nodes.paxBreath.triggerAttackRelease(0.15, slot('paxBreath', now + 0.1), v * 0.4);
  nodes.thud.triggerAttackRelease('F1', 0.16, slot('thud', now + 0.55), v * 0.85);
  nodes.clack.triggerAttackRelease(0.05, slot('clack', now + 0.56), v * 0.45);
  nodes.paxFabric.triggerAttackRelease(0.2, slot('paxFabric', now + 0.58), v);
  nodes.paxFabric.triggerAttackRelease(0.1, slot('paxFabric', now + 1.4), v * 0.4);
  nodes.paxFabric.triggerAttackRelease(0.15, slot('paxFabric', now + 2.75), v * 0.7);
  nodes.thud.triggerAttackRelease('A1', 0.08, slot('thud', now + 3.2), v * 0.3);
  nodes.paxFabric.triggerAttackRelease(0.12, slot('paxFabric', now + 3.5), v * 0.45);
}

/** Glissade quai. */
export function paxSlip(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.07);
  if (v <= 0) return;
  const now = Tone.now();
  nodes.paxFabric.triggerAttackRelease(0.14, slot('paxFabric', now), v);
  nodes.clack.triggerAttackRelease(0.035, slot('clack', now + 0.12), v * 0.3);
  nodes.thud.triggerAttackRelease('G1', 0.07, slot('thud', now + 0.35), v * 0.35);
  nodes.paxFabric.triggerAttackRelease(0.1, slot('paxFabric', now + 0.9), v * 0.5);
}

/** Petit choc quand le joueur bouscule un voyageur. */
export function paxBump(dist: number, hard = false): void {
  if (!nodes) return;
  const v = paxVel(dist, hard ? 0.1 : 0.06);
  if (v <= 0) return;
  const now = Tone.now();
  nodes.paxFabric.triggerAttackRelease(0.08, slot('paxFabric', now), v);
  nodes.clack.triggerAttackRelease(0.025, slot('clack', now + 0.02), v * (hard ? 0.45 : 0.25));
  if (hard) nodes.thud.triggerAttackRelease('A1', 0.06, slot('thud', now + 0.03), v * 0.35);
}

/** Éclats de dispute / bagarre (tissu + petits chocs). */
export function paxScuffle(dist: number): void {
  if (!nodes) return;
  const v = paxVel(dist, 0.08);
  if (v <= 0) return;
  const now = Tone.now();
  for (let i = 0; i < 3; i++) {
    nodes.paxFabric.triggerAttackRelease(0.06, slot('paxFabric', now + i * 0.18), v * (0.6 + Math.random() * 0.4));
    if (i > 0) nodes.clack.triggerAttackRelease(0.03, slot('clack', now + i * 0.18 + 0.02), v * 0.3);
  }
}

// « Clac-clac » des deux bogies au passage d'un joint de rail.
export function railClack(speed01: number): void {
  if (!nodes) return;
  const now = Tone.now();
  const v = (0.12 + speed01 * 0.5) * (listenerOutside ? 2.2 : 1);
  const bogieDelay = 0.5 - speed01 * 0.32; // second bogie plus proche à vitesse haute
  const hit = (t: number, vel: number) =>
    nodes!.clack.triggerAttackRelease(0.05, slot('clack', t), vel);
  hit(now, v);
  hit(now + 0.09, v * 0.85);
  hit(now + bogieDelay, v * 0.9);
  hit(now + bogieDelay + 0.09, v * 0.75);
}

// --- Train qui traverse la gare -----------------------------------------
//
// Piloté image par image par systems/passingTrain, qui sait où en est la rame.
// Ce module ne connaît que le POINT de la rame le plus proche de l'oreille :
// une caisse de 200 m n'est pas une source ponctuelle, et la faire sonner
// depuis son nez donnerait un son qui a déjà filé alors que la moitié du train
// est encore devant nous.

/** Niveau de crête du grondement et du souffle, debout sur le quai. */
const PASS_ROAR = 0.42;
const PASS_WIND = 0.2;
/** Ce qu'il en reste dans le wagon : la caisse et les vitres en mangent la moitié. */
const PASS_INSIDE = 0.42;

let passActive = false;

export function passByStart(): void {
  passActive = true;
}

/**
 * Pose la source et son niveau.
 *
 * @param x,y,z   point de la rame le plus proche de l'auditeur (repère monde)
 * @param closing −1 (rame déjà passée) … +1 (rame encore devant) : c'est le
 *                seul effet Doppler qu'on puisse donner à du bruit large bande,
 *                et c'est celui qu'on entend — le grondement se referme d'un
 *                cran au moment exact où la cabine arrive à notre hauteur.
 */
export function setPassBy(x: number, y: number, z: number, closing: number): void {
  if (!nodes || !passActive) return;
  const p = nodes.passPanner;
  p.positionX.value = x;
  p.positionY.value = y;
  p.positionZ.value = z;
  const d = Math.hypot(x - listenerPos.x, y - listenerPos.y, z - listenerPos.z);
  const near = 1 / (1 + Math.pow(d / 26, 1.5));
  const inside = listenerOutside ? 1 : PASS_INSIDE;
  nodes.passRoarGain.gain.rampTo(near * PASS_ROAR * inside, 0.06);
  // Le souffle ne porte pas : il n'existe qu'à quelques mètres.
  nodes.passWindGain.gain.rampTo(Math.pow(near, 2.4) * PASS_WIND * inside, 0.06);
  const doppler = 1 + 0.07 * Math.max(-1, Math.min(1, closing));
  nodes.passRoarFilter.frequency.rampTo((240 + 900 * near) * doppler, 0.06);
  nodes.passWindFilter.frequency.rampTo(2100 * doppler, 0.08);
}

export function passByEnd(): void {
  passActive = false;
  if (!nodes) return;
  nodes.passRoarGain.gain.rampTo(0, 0.4);
  nodes.passWindGain.gain.rampTo(0, 0.3);
}

/** Un joint de rail sous la rame d'en face. `level` suit la distance. */
export function passByClack(level: number): void {
  if (!nodes || level <= 0.002) return;
  const now = Tone.now();
  nodes.passClack.triggerAttackRelease(0.04, slot('passClack', now), level);
  nodes.passClack.triggerAttackRelease(0.04, slot('passClack', now + 0.07), level * 0.8);
}

/** Avertisseur à l'entrée en gare : deux tons tenus, brefs. */
export function passByHorn(): void {
  if (!nodes) return;
  const now = Tone.now();
  const loud = listenerOutside ? 0.5 : 0.28;
  nodes.passHornA.triggerAttackRelease('A4', 0.75, slot('passHornA', now), loud);
  nodes.passHornB.triggerAttackRelease('C#5', 0.75, slot('passHornB', now), loud);
}

// --- Carillons et jingles (synthèse, avec hook fichiers locaux) ---

function synthDoorOpen(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.chime.triggerAttackRelease('E5', 0.16, slot('chime', now), 0.5);
  nodes.chime.triggerAttackRelease('A5', 0.3, slot('chime', now + 0.18), 0.5);
}

function synthDoorClose(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.chime.triggerAttackRelease('A5', 0.16, slot('chime', now), 0.5);
  nodes.chime.triggerAttackRelease('E5', 0.3, slot('chime', now + 0.18), 0.5);
  nodes.air.triggerAttackRelease(0.5, slot('air', now + 0.5), 0.18);
}

function synthArrival(): void {
  if (!nodes) return;
  const now = Tone.now();
  const notes = ['G5', 'C6', 'E6', 'G6'];
  notes.forEach((n, i) => nodes!.bell.triggerAttackRelease(n, 0.3, slot('bell', now + i * 0.17), 0.4));
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

// Durée d'un passage du motif (secondes) : le motif est bouclé jusqu'à
// approcher cette cible, comme un clip de quai. La valeur vit dans
// data/melodies, avec les autres durées — c'est elle qui sert de repli quand il
// faut mesurer la fenêtre sonore d'un quai sans clip.
export const MELODY_DURATION = SYNTH_MELODY_DURATION_S;

/**
 * Repli synthétisé pour les quais sans clip. Les notes sont PLANIFIÉES à
 * l'avance dans Tone : une fois posées, on ne peut plus les rappeler. La
 * mélodie est donc écrite d'emblée à sa longueur définitive, au lieu d'être
 * coupée après coup.
 *
 * Comme un clip, elle fait MELODY_REPEATS passages ENTIERS : la fenêtre que
 * l'arrêt lui réserve est calculée sur MELODY_DURATION (voir
 * data/melodies.melodyRoundsDuration), et un passage doit donc y tenir. D'où le
 * compte de motifs fait à l'avance — on n'en démarre pas un qui déborderait —
 * et le motif au minimum joué une fois, même s'il est plus long que la cible.
 */
function synthMelody(index: number): void {
  if (!nodes) return;
  const jy = STATIONS[index].jy;
  const tune = SPECIALS[jy] ?? (index % 2 === 0 ? HOUSE_A : HOUSE_B);
  const unit = 0.21;
  const tuneLength = tune.reduce((sum, [, beats]) => sum + beats * unit, 0);
  const loops = Math.max(1, Math.floor(MELODY_DURATION / tuneLength));
  const t0 = Tone.now() + 0.05;
  let t = t0;
  for (let round = 0; round < MELODY_REPEATS; round++) {
    for (let loop = 0; loop < loops; loop++) {
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
// Les deux entrées « …Voice » sont celles que le lieu d'écoute fait taire :
// la voix de bord depuis le quai, celle du quai depuis la rame. « melody » est
// la sono du quai elle aussi, avec le niveau propre de la 発車メロディ.
export type Bus = 'cabin' | 'platform' | 'cabinVoice' | 'platformVoice' | 'melody';
/** Les deux bus de PAROLE, seuls concernés par la coupure selon le lieu. */
export type VoiceBus = Extract<Bus, 'cabinVoice' | 'platformVoice'>;

function busInput(bus: Bus): Tone.Gain | null {
  if (!nodes) return null;
  if (bus === 'platform') return nodes.platIn;
  if (bus === 'cabinVoice') return nodes.paVoiceIn;
  if (bus === 'platformVoice') return nodes.platVoiceIn;
  if (bus === 'melody') return nodes.melodyIn;
  return nodes.paIn;
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
  /** Coupe en fondu sur `seconds` au lieu de trancher net. */
  fadeOut: (seconds: number) => void;
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

  const hardStop = (): void => {
    if (finished) return;
    try {
      player.stop();
    } catch {
      /* déjà arrêté */
    }
    finish();
  };

  return {
    ended,
    stop: hardStop,
    // Coupure en fondu : ATOS ne tranche pas la 発車メロディ au milieu d'une
    // note, il la referme en une fraction de seconde quand le chef relâche le
    // bouton. `finish` n'est appelé qu'à l'arrêt planifié, via onstop.
    fadeOut: (seconds: number) => {
      if (finished) return;
      try {
        player.volume.rampTo(-48, seconds);
        player.stop(`+${seconds}`);
      } catch {
        hardStop();
      }
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

/** Même chose, mais en fondu — coupure de la 発車メロディ par le chef de train. */
function fadeOut(path: string, seconds: number): void {
  stopEpoch.set(path, (stopEpoch.get(path) ?? 0) + 1);
  const handle = activeByPath.get(path);
  if (!handle) return;
  activeByPath.delete(path);
  handle.fadeOut(seconds);
}

export const audioManager = {
  playOnce,
  stop,
  fadeOut,
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

/** Gare dont le repli est déjà lancé, pour ne pas l'empiler sur lui-même. */
let fallbackMelodyStation = -1;
/** Clip melody-JYXX.mp3 déposé par l'utilisateur et en cours, s'il y en a un. */
let fallbackMelodyPath: string | null = null;

/**
 * 発車メロディ : clips Inner/Outer Main selon quai et sens, sinon
 * melody-JYXX.mp3 déposé dans public/audio/, sinon synthèse. Délègue la
 * sélection à departureSequence (évite les doubles lectures via departureId).
 *
 * Aucune durée à passer : clip comme synthèse font MELODY_REPEATS passages
 * entiers, et c'est stationCycle qui a taillé la fenêtre de l'arrêt sur eux
 * (data/melodies.melodyRoundsDuration). La coupure du chef de train tombe donc
 * sur un silence, pas au milieu d'une note.
 */
export function departureMelody(index: number): void {
  const ctx = buildDepartureContext({
    departureSequenceStarted: true,
    stationIndex: index,
  });
  void playDepartureMelodyForContext(ctx).then(async (played) => {
    // Rien joué parce que le départ est bloqué : surtout pas de repli, le quai
    // doit rester muet tant que la procédure ne repart pas.
    if (played || isDepartureBlocked() || fallbackMelodyStation === index) return;
    fallbackMelodyStation = index;
    const path = `melody-${STATIONS[index].jy}`;
    fallbackMelodyPath = path;
    if (!(await audioManager.playOnce(path, 'melody'))) {
      fallbackMelodyPath = null;
      synthMelody(index);
    }
  });
}

/** Coupe le repli en cours ; `fade` à 0 pour trancher net. */
export function stopFallbackMelody(fade: number): void {
  if (!fallbackMelodyPath) return;
  if (fade > 0) audioManager.fadeOut(fallbackMelodyPath, fade);
  else audioManager.stop(fallbackMelodyPath);
  fallbackMelodyPath = null;
}

/** Réarme le repli : la mélodie de cet arrêt-là est derrière nous. */
export function resetFallbackMelodyGuard(): void {
  fallbackMelodyStation = -1;
}

/** Arrêt d'urgence des clips de départ connus (reset / quitter la gare). */
export function stopDepartureMelodyClips(): void {
  for (const path of MELODY_PATHS) audioManager.stop(path);
}

// --- Ambiance de gare ----------------------------------------------------
//
// Ce qu'on entend PAR-DESSUS la sonorisation, et qui n'est pas le même d'une
// gare à l'autre : les oiseaux d'Uguisudani — dont le nom veut dire « vallée du
// rossignol » —, le timbre du tram à Ōtsuka, le passage feutré du monorail à
// Hamamatsuchō, la rumeur d'un quai de bureaux ou le silence d'une tranchée.
//
// Deux réglages seulement, mais qui suffisent : la COULEUR du lit sonore, et la
// RÉVERBÉRATION du lieu. Une gare de viaduc n'a pratiquement pas de queue, une
// tranchée est sourde et proche, une halle est longue et claire.

/** Réglage d'un lit d'ambiance : couleur, niveau, et cadence d'événements. */
interface AmbienceSpec {
  /** Coupure du lit de bruit (Hz) : grave = sourd, aigu = vif. */
  cut: number;
  /** Niveau du lit. */
  level: number;
  /** Événement posé par-dessus, et son intervalle moyen (s). 0 = aucun. */
  event?: 'chirp' | 'bell' | 'whoosh';
  every?: number;
}

const AMBIENCE: Record<string, AmbienceSpec> = {
  // Les oiseaux de la vallée du rossignol : c'est l'identité du lieu.
  birds: { cut: 1500, level: 0.1, event: 'chirp', every: 5 },
  park: { cut: 1200, level: 0.13, event: 'chirp', every: 11 },
  tram: { cut: 760, level: 0.2, event: 'bell', every: 17 },
  monorail: { cut: 900, level: 0.22, event: 'whoosh', every: 21 },
  electric: { cut: 1900, level: 0.24, event: 'chirp', every: 7 },
  market: { cut: 1050, level: 0.3 },
  students: { cut: 1250, level: 0.3 },
  street: { cut: 850, level: 0.22 },
  office: { cut: 700, level: 0.2 },
  hall: { cut: 620, level: 0.26 },
  quiet: { cut: 560, level: 0.09 },
};

let ambKind = '';
let ambTimer = 0;
let ambNext = 4;

/**
 * Étouffement du lieu par la neige au sol (0..1).
 *
 * C'est le fait le plus remarquable de toute la météo sonore, et le seul qui
 * consiste à RETIRER : une ville sous la neige est plus silencieuse que
 * d'ordinaire, la couche absorbant les aigus au lieu de les renvoyer. Ça ne
 * s'ajoute pas au fond sonore, ça le rabote.
 */
let snowMuffle = 0;

/** Humidité du rail (0..1), lue par le roulement. */
let railWet = 0;

/** Recale la coupure du lit d'ambiance : couleur de la gare, moins la neige. */
function applyAmbienceCut(ramp: number): void {
  if (!nodes) return;
  const spec = AMBIENCE[ambKind] ?? AMBIENCE.street;
  nodes.ambFilter.frequency.rampTo(spec.cut * (1 - 0.5 * snowMuffle), ramp);
}

/**
 * Règle l'ambiance du lieu.
 *
 * @param kind     couleur sonore de la gare (data/stationLayouts).
 * @param presence 0 = inaudible, 1 = on est dessus. Dans la rame, l'ambiance
 *                 n'entre que par les portes ouvertes.
 * @param room     0 = plein air, 1 = grande halle fermée.
 */
export function setStationAmbience(kind: string, presence: number, room: number): void {
  if (!nodes) return;
  const spec = AMBIENCE[kind] ?? AMBIENCE.street;
  const p = Math.max(0, Math.min(1, presence));
  if (kind !== ambKind) {
    ambKind = kind;
    applyAmbienceCut(0.6);
    ambNext = (spec.every ?? 8) * (0.5 + Math.random());
    ambTimer = 0;
  }
  nodes.ambGain.gain.rampTo(spec.level * p, 0.4);
  // La réverbération du lieu ne s'entend que si l'on est dans le lieu.
  nodes.roomSend.gain.rampTo(0.06 + room * 0.34, 0.5);
  nodes.roomLp.frequency.rampTo(900 + room * 3200, 0.5);
}

/** Pose les événements d'ambiance. À appeler chaque frame de physique. */
/**
 * Le temps qu'il fait, porté à l'oreille.
 *
 * `openings` est le produit porte de rame × porte palière, exactement comme
 * pour l'ambiance de gare : c'est par là, et par là seulement, que le dehors
 * entre. La pluie sur le pavillon, elle, l'ignore — elle tombe sur le toit,
 * pas devant la porte.
 *
 * La neige ne fait aucun bruit, et c'est le fait le plus remarquable de toute
 * la météo sonore : une ville sous la neige est plus SILENCIEUSE que d'ordinaire,
 * la couche absorbant les aigus. D'où l'atténuation du dehors quand elle tient.
 */
export function setWeatherSound(
  rain: number,
  snow: number,
  snowCover: number,
  wet: number,
  openings: number,
  outside: boolean,
): void {
  if (!nodes) return;
  railWet = Math.max(0, Math.min(1, wet));
  const r = Math.max(0, Math.min(1, rain));
  // Sur le pavillon : rien tant qu'on est dehors, sur le quai — le toit sous
  // lequel on se tient alors est celui de la gare, pas celui de la rame.
  const roof = outside ? 0 : r;
  nodes.rainRoofGain.gain.rampTo(0.16 * roof * roof + 0.06 * roof, 0.4);
  // L'averse crépite plus haut que la bruine : la goutte est plus grosse et
  // frappe plus fort, la tôle sonne plus clair.
  nodes.rainRoofFilter.frequency.rampTo(430 + 460 * r, 0.6);
  // Dehors : plein pot sur le quai, filtré par les ouvertures dans la rame.
  const through = outside ? 1 : 0.1 + 0.9 * openings;
  const muffled = 1 - 0.45 * Math.min(1, snowCover);
  nodes.rainOutGain.gain.rampTo(0.2 * r * through * muffled, 0.4);
  // Portes fermées, il ne reste du dehors que le grave : le vitrage coupe tout
  // au-dessus de deux ou trois kilohertz.
  nodes.rainOutFilter.frequency.rampTo(outside ? 900 : 1500 - 600 * openings, 0.4);
  // La neige n'ajoute rien ; elle retire. Le lit d'ambiance du lieu perd ses
  // aigus, et c'est tout ce qu'il faut pour l'entendre tomber.
  const muffle = Math.max(0, Math.min(1, snowCover * 0.7 + snow * 0.4));
  if (Math.abs(muffle - snowMuffle) > 0.04) {
    snowMuffle = muffle;
    applyAmbienceCut(2);
  }
}

/**
 * Un coup de tonnerre. `far` va de 0 (sur nous) à 1 (à l'horizon) : il règle
 * le retard — le son met trois secondes par kilomètre —, le niveau, et surtout
 * la PART DE CLAQUEMENT. Un coup lointain roule sans jamais claquer ; c'est ce
 * rapport-là qui dit la distance, pas le volume.
 */
export function playThunder(far: number): void {
  if (!nodes) return;
  const f = Math.max(0, Math.min(1, far));
  const now = Tone.now();
  const delay = 0.15 + f * 7;
  const level = 1 - 0.7 * f;
  nodes.thunderFilter.frequency.rampTo(90 + 260 * (1 - f), 0.1);
  nodes.thunderNoise.volume.value = -10 - 16 * f;
  nodes.thunderNoise.triggerAttackRelease(1.4 + 2.6 * f, now + delay);
  if (f < 0.45) {
    nodes.thunderCrack.volume.value = -18 - 30 * f;
    nodes.thunderCrack.triggerAttackRelease(70 + 40 * level, 0.16, now + delay);
  }
}

export function updateAmbience(dt: number): void {
  if (!nodes || dt <= 0) return;
  const spec = AMBIENCE[ambKind];
  if (!spec?.event || nodes.ambGain.gain.value < 0.02) return;
  ambTimer += dt;
  if (ambTimer < ambNext) return;
  ambTimer = 0;
  ambNext = (spec.every ?? 8) * (0.55 + Math.random() * 0.9);
  const now = Tone.now();
  if (spec.event === 'chirp') {
    // Deux ou trois notes brèves qui montent : un chant, pas un bip.
    const base = 1900 + Math.random() * 900;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      nodes.ambChirp.triggerAttackRelease(base * (1 + k * 0.13), 0.06, now + k * 0.11);
    }
  } else if (spec.event === 'bell') {
    // Le timbre du tram : deux coups, le second plus faible.
    nodes.ambBell.triggerAttackRelease(880, 0.5, now);
    nodes.ambBell.triggerAttackRelease(880, 0.4, now + 0.34);
  } else {
    // Le monorail passe : un souffle qui enfle puis s'en va.
    nodes.ambWhoosh.triggerAttackRelease(1.6, now);
  }
}
