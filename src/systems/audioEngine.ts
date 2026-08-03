// Moteur audio (Tone.js) : roulement, onduleur VVVF, joints de rail, freinage,
// carillons de porte - synthétisés - et mélodies de départ
// (発車メロディ) : clip quai réel quand disponible (voir data/melodies.ts),
// sinon synthèse. Démarré uniquement au clic « Monter à bord ».
//
// Spatialisation : tout ce qui sort de la SONORISATION (carillons de porte,
// souffle de ligne des annonces) passe par un bus « PA »
// - filtrage passe-bande + compression, le timbre d'un haut-parleur de wagon -
// puis est diffusé par un Panner3D PAR DIFFUSEUR de plafond (voir
// CABIN_SPEAKERS). La mélodie de départ (発車メロディ) et les annonces ATOS,
// elles, viennent des haut-parleurs du QUAI : elles sont étouffées portes
// fermées et s'ouvrent par les portes. L'auditeur (Tone.Listener) suit la
// caméra, donc le son tourne quand on tourne la tête et se rapproche quand on
// marche sous un diffuseur.
//
// La sono du quai est une LIGNE de diffuseurs, pas un point : elle couvre les
// deux cent vingt mètres du quai, et le graphe en panne les six plus proches de
// la tête (PLATFORM_TAPS, setPlatformSpeakers - c'est systems/stationPa qui les
// désigne). On entend donc l'annonce d'un bout du quai à l'autre, et le
// diffuseur au-dessus de soi change quand on marche.
//
// Deux sonorisations, deux VOIX. Une gare a sa propre sono, indépendante de
// celle de la rame, et on ne les entend pas au même endroit :
//
//   • sur le QUAI, la voix de bord n'est plus qu'un lointain - les diffuseurs
//     sont dans le wagon, derrière les vitres (paVoiceGain tombe très bas) ;
//   • DANS la rame arrêtée en gare, la voix du quai n'est qu'un lointain qui
//     entre par les portes (platVoiceGain très en retrait).
//
// Les deux sont pilotées par la MÊME ouverture (setPlatformDoors) : ce qui
// laisse passer la parole d'un côté la laisse passer de l'autre, et une porte
// qui se referme éteint les deux lointains en même temps.
//
// La MUSIQUE du quai, elle, ne suit pas cette règle : la 発車メロディ est faite
// pour être entendue des voyageurs déjà montés, et elle passe donc en clair par
// les portes ouvertes (bus « melody » → platIn, sans platVoiceGain). Ce bus lui
// est propre : il porte son niveau, calé plus bas sur le quai que dans la rame
// (MELODY_OUTSIDE / MELODY_INSIDE), pour qu'elle sonne DEPUIS LA GARE sans
// écraser le reste, et reste franchement audible d'une voiture à quai.
//
// Les portes de la RAME ont leur carillon à elles (data/doorChime) : le
// « pin-pōn » de 824 et 616 Hz, trois fois, sur les haut-parleurs vissés
// au-dessus des baies. Il est LE MÊME à l'ouverture et à la fermeture - une
// rame ne joue pas deux carillons, elle en joue un seul, et c'est la mécanique
// autour qui distingue les deux moments.
//
// Les PORTES PALIÈRES, elles, ont leur propre bouche, et c'est une troisième
// ligne : leurs deux avertisseurs ne sortent ni des diffuseurs du wagon ni de
// ceux de l'auvent, mais d'un petit haut-parleur vissé sur le linteau de
// chaque baie. On les entend donc DEVANT soi, à hauteur d'épaule et à un pas -
// et c'est à cela qu'on sait quelle porte bouge. Ils disent le SENS et rien
// d'autre : Fa5–La5–Do6 qui monte à l'ouverture (data/psdOpenChime), Mi5–Do5
// qui descend à la fermeture (data/psdCloseWarning). Voir le bloc
// « L'avertisseur des PORTES PALIÈRES » plus bas.
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
// passent plus par un <audio> (voir le bloc « Clips » plus bas - c'est ce qui
// les rendait muets sur téléphone).
//
// Distance : tout ce qui est porté par la RAME (roulement, onduleur, freins,
// joints de rail, chocs de porte…) passe par un bus commun dont le gain suit la
// distance à la rame. Sur le quai, un train qui part s'éloigne vraiment.

import * as Tone from 'tone';
import { CABIN_SPEAKERS, CONFIG, type SpeakerPos } from '../data/config';
import { APPROACH_CHIME_SCORE, APPROACH_CHIME_TOTAL_S } from '../data/approachChimes';
import type { PowerSoundKind } from './carPower';
import {
  MELODY_PATHS,
  MELODY_REPEATS,
  MELODY_REPEAT_GAP_S,
  SYNTH_MELODY_DURATION_S,
} from '../data/melodies';
import {
  psdCloseWarningPair,
  PSD_WARN_NOTE_HOLD,
  PSD_WARN_PAIR_STEP,
} from '../data/psdCloseWarning';
import { PSD_CHIME_DURATION, PSD_CHIME_NOTE_HOLD, psdOpenChimeScore } from '../data/psdOpenChime';
import {
  DOOR_CHIME_ATTACK,
  DOOR_CHIME_CLICK_HZ,
  DOOR_CHIME_CLICK_S,
  DOOR_CHIME_DURATION,
  DOOR_CHIME_SETTLE_RATIO,
  DOOR_CHIME_SETTLE_S,
  DOOR_CHIME_TONES,
  doorChimeScore,
} from '../data/doorChime';
import { STATIONS } from '../data/stations';
import {
  buildDepartureContext,
  isDepartureBlocked,
  playDepartureMelodyForContext,
} from './departureSequence';
import { melodyDefinitionForPath } from '../data/melodyDefinitions';
import { soundCue } from './subtitles';

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
  hvacNoise: Tone.Noise;
  hvacFilter: Tone.Filter;
  hvacGain: Tone.Gain;
  spark: Tone.NoiseSynth;
  sivOsc: Tone.Oscillator;
  sivFilter: Tone.Filter;
  sivGain: Tone.Gain;
  clack: Tone.NoiseSynth;
  clackFilter: Tone.Filter;
  air: Tone.NoiseSynth;
  airFilter: Tone.Filter;
  vent: Tone.NoiseSynth;
  squeal: Tone.Synth;
  slideTrainGain: Tone.Gain;
  slidePsdGain: Tone.Gain;
  thud: Tone.MembraneSynth;
  doorChime: Tone.Synth[][];
  doorChimeClick: Tone.Synth;
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
  platTaps: PlatformTap[];
  // Avertisseurs des portes palières : deux voix - l'ouverture et la
  // fermeture - sur un seul haut-parleur, et sa propre ligne de diffusion.
  psdChime: Tone.PolySynth<Tone.Synth>;
  psdWarn: Tone.PolySynth<Tone.Synth>;
  psdChimeClick: Tone.NoiseSynth;
  psdChimeDoor: Tone.Gain;
  psdTaps: PlatformTap[];
  hissGain: Tone.Gain;
  paClick: Tone.NoiseSynth;
  platHissGain: Tone.Gain;
  platClick: Tone.NoiseSynth;
  platChime: Tone.PolySynth<Tone.FMSynth>;
  platChimeHold: Tone.FMSynth;
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
  // Appareils de gare : distributeurs, billetterie, portillons. Tout ce qu'on
  // actionne SOI-MÊME, donc toujours à bout de bras - d'où un bus à part, sans
  // atténuation de distance, mais envoyé dans la réverbération du lieu.
  devBus: Tone.Gain;
  devClick: Tone.NoiseSynth;
  devClickFilter: Tone.Filter;
  devBeep: Tone.Synth;
  devCoin: Tone.MetalSynth;
  devMotor: Tone.Noise;
  devMotorFilter: Tone.Filter;
  devMotorGain: Tone.Gain;
  devThud: Tone.MembraneSynth;
  devHiss: Tone.NoiseSynth;
  devHissFilter: Tone.Filter;
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
 * Niveau de la voix de BORD entendue depuis le quai. Elle doit continuer à
 * provenir des diffuseurs spatialisés de la rame, mais rester bien plus
 * discrète que la voix du quai : juste ce qui traverse une porte ouverte et
 * permet d'entendre la fin d'une phrase après être descendu.
 *
 * Deux valeurs, exactement comme pour la voix du quai entendue de la rame
 * (PLAT_BUS_CLOSED / PLAT_BUS_OPEN) : ce qui laisse passer la parole, c'est
 * l'OUVERTURE, pas le lieu d'écoute. Portes closes, les diffuseurs sont
 * derrière une baie vitrée et une caisse d'acier - il n'en reste qu'un
 * murmure ; portes ouvertes, la voix sort par le vide de la baie. La ligne se
 * pilote donc par setPlatformDoors, du même geste et sur la même ouverture.
 */
const CABIN_VOICE_OUTSIDE_OPEN = 0.08;
const CABIN_VOICE_OUTSIDE_CLOSED = 0.012;

/**
 * Prises de la sonorisation du QUAI : le nombre de diffuseurs réellement pannés
 * autour de l'oreille à un instant donné.
 *
 * Un quai n'a pas UN haut-parleur, il en a une ligne - un tous les dix-neuf
 * mètres sous l'auvent (systems/stationPlacement) - et c'est ce qui fait qu'on
 * entend l'annonce pareil devant la voiture 1 et au bout du quai. Le graphe
 * garde donc six points de diffusion fixes ; ce ne sont pas six haut-parleurs
 * donnés une fois pour toutes, mais six PRISES à qui systems/stationPa assigne,
 * image par image, les diffuseurs les plus proches de la tête.
 *
 * Six suffit : au-delà, une source est à plus de cinquante mètres et n'apporte
 * plus qu'un quarantième du champ, pour un Panner3D HRTF de plus.
 */
const PLATFORM_TAPS = 6;

/**
 * Prises de l'avertisseur des PORTES PALIÈRES : les baies dont on entend le
 * petit haut-parleur de linteau.
 *
 * Une baie tous les cinq mètres environ, et un avertisseur par baie : elles
 * sonnent toutes ensemble, mais au-delà de la quatrième la source est à plus
 * de quinze mètres et ne pèse plus rien devant celle qu'on a sous le nez.
 * Quatre suffisent donc à donner la LIGNE - c'est ce qui fait qu'on entend le
 * signal courir le long du quai plutôt que sortir d'un point.
 */
const PSD_TAPS = 4;

/**
 * Une prise : son point de diffusion, et le robinet qui la coupe.
 *
 * Le robinet ne sert qu'aux quais qui compteraient moins de diffuseurs que le
 * graphe n'a de prises - deux prises au même endroit doubleraient le niveau
 * juste là, ce qui est exactement le défaut qu'on corrige ici.
 */
interface PlatformTap {
  gain: Tone.Gain;
  panner: Tone.Panner3D;
}

/**
 * Niveau du bus de la sono du QUAI, aux trois points de calage : portes
 * fermées, portes ouvertes, et debout sur le quai.
 *
 * Ce bus alimente les prises de la ligne de diffuseurs (PLATFORM_TAPS), qui se
 * somment sur l'auditeur, et sur le quai on se tient à trois mètres sous le plus
 * proche : un gain qui semble modeste au nœud arrive bien plus fort à l'oreille,
 * et la gare écrasait tout le reste. Les trois valeurs gardent entre elles les
 * mêmes rapports qu'avant - la mélodie entre toujours franchement par les
 * portes, et le quai reste plus ouvert que la rame.
 *
 * Les trois ont été REPRISES quand la sono du quai est passée de quatre points
 * fixes à une ligne de diffuseurs : là où quatre points laissaient l'oreille
 * entre deux sources lointaines, la ligne la met toujours sous une grille, et
 * la somme monte. Chacune est ramenée à ce qu'elle donnait AVANT au point où
 * elle avait été calée - le quai à trois mètres sous un diffuseur, la rame au
 * milieu de la voiture. Ce qui change n'est donc pas le niveau qu'on entend là
 * où on l'avait réglé, mais le fait qu'on l'entende AILLEURS AUSSI.
 */
const PLAT_BUS_CLOSED = 0.043;
const PLAT_BUS_OPEN = 0.16;
const PLAT_BUS_OUTSIDE = 0.29;

/**
 * Niveau propre de la 発車メロディ, en plus du bus du quai.
 *
 * Les clips sont normalisés en crête (voir scripts/melodies-gen.py) : envoyés
 * tels quels sur le bus, ils sonnaient bien plus fort que tout le reste de la
 * gare - la mélodie écrasait l'annonce qui la suit et le brouhaha du quai.
 *
 * Deux calages, parce que ce n'est pas le même problème des deux côtés des
 * portes. Sur le QUAI on se tient à trois mètres sous un diffuseur : c'est là
 * que c'était criard, et c'est là qu'on retire le plus (≈ −10 dB). DANS la
 * rame la mélodie arrive déjà filtrée par les ouvertures, et elle doit rester
 * ce qu'elle est pour un voyageur assis - le signal qu'il faut descendre
 * maintenant : on n'en retire que ≈ 5 dB, de quoi la ramener au niveau des
 * autres sons de gare sans jamais la faire passer au second plan.
 *
 * Le rapport entre les deux garde la mélodie DU CÔTÉ DU QUAI : à l'oreille
 * elle reste plus présente dehors que dedans, elle vient toujours des
 * haut-parleurs de la gare et non de la rame.
 */
const MELODY_INSIDE = 0.55;
const MELODY_OUTSIDE = 0.32;

/**
 * Niveau de l'avertisseur des portes palières, à l'entrée de sa ligne.
 *
 * Il est calé pour que la somme des quatre prises, atténuation de distance
 * comprise, arrive à l'oreille au niveau d'un signal de service : plus présent
 * que les bips de fermeture (qui, eux, passent par la sono lointaine de
 * l'auvent), très en dessous de la 発車メロディ. On est debout à un mètre de
 * la baie ; ce qui semble modeste au nœud arrive fort au tympan.
 */
const PSD_CHIME_LEVEL = 0.07;

/**
 * Ce que les portes de la RAME laissent passer de l'avertisseur, portes
 * fermées puis grandes ouvertes.
 *
 * Il ne s'agit pas d'un filtrage - le signal est déjà étroit - mais d'un
 * simple retrait : le portique sonne à deux mètres, derrière une paroi de
 * caisse et une baie vitrée. En pratique les portes de la rame sont déjà
 * ouvertes quand le quai lance son signal ; ce robinet n'existe que pour les
 * cas où elles ne le sont pas encore tout à fait.
 */
const PSD_CHIME_DOORS_CLOSED = 0.28;
const PSD_CHIME_DOORS_OPEN = 1;

/**
 * Réflexions du linteau et du muret, les seules qu'on ajoute au signal.
 *
 * Neuf et dix-huit millisecondes : ce sont les trois et six mètres qui
 * séparent la baie de la face de la rame et du fond du quai. Ce n'est PAS une
 * réverbération - un avertisseur de quai n'en a pas, et une queue le
 * transformerait en carillon. Deux retours très faibles suffisent à lui donner
 * le grain d'un petit haut-parleur posé dehors plutôt qu'en studio.
 */
const PSD_CHIME_REFLECTIONS: [delay: number, gain: number][] = [
  [0.009, 0.055],
  [0.018, 0.026],
];

/**
 * Place du carillon des portes de la rame dans le mixage.
 *
 * Les six voix additionnées sortent à -2,99 dBFS, soit les trois décibels de
 * marge voulus - mesurés par rendu hors ligne sur le SIGNAL ENTIER,
 * recouvrements, amorces et réflexions compris, parce que ce n'est pas la
 * crête d'un son qui compte mais leur somme. Ce robinet-ci ne fait que poser
 * le carillon dans la voiture : assis à trois mètres de la baie, il doit
 * s'entendre par-dessus la clim sans jamais couvrir l'annonce de bord.
 */
const DOOR_CHIME_LEVEL = 0.64;

/**
 * Les deux seules réflexions du carillon de porte.
 *
 * Treize et vingt-neuf millisecondes, très bas : la cloison d'en face et le
 * bout du couloir. Ce n'est pas une réverbération - dans une voiture il n'y en
 * a pas - mais ce qui empêche le signal de sonner comme s'il était joué en
 * studio.
 */
const DOOR_CHIME_REFLECTIONS: [delay: number, gain: number][] = [
  [0.013, 0.05],
  [0.029, 0.022],
];

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

  // Climatisation et ventilation : le souffle qu'on n'entend plus une fois
  // monté, et qui n'existe vraiment que le jour où il s'arrête. Bruit rose
  // très sourd, sans aigus - la gaine est au plafond et souffle vers le bas,
  // ce qui arrive à l'oreille n'a plus de bande passante. C'est la première
  // chose que coupe une coupure de caténaire (voir setCarPower).
  const hvacNoise = new Tone.Noise('pink');
  const hvacFilter = new Tone.Filter({ type: 'lowpass', frequency: 420, Q: 0.9 });
  const hvacGain = new Tone.Gain(0);
  hvacNoise.chain(hvacFilter, hvacGain, trainBus);
  hvacNoise.start();

  // Grésillement électrique : bruit blanc très court, très aigu, sans aucun
  // grave. C'est le timbre d'un arc - un tube qui essaie de se réamorcer, un
  // contact qui se rompt - et il ne ressemble à rien d'autre dans le wagon :
  // tous les autres bruitages ont un corps, celui-ci n'a que du haut.
  const sparkFilter = new Tone.Filter({ type: 'highpass', frequency: 2400, rolloff: -24, Q: 0.7 });
  const spark = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.0004, decay: 0.02, sustain: 0 },
    volume: -13,
  });
  spark.chain(sparkFilter, trainBus);

  // Sifflement du convertisseur statique : le petit aigu tenu qu'on n'entend
  // jamais tant qu'il est là. Il ne sert qu'aux transitions - il s'effondre à
  // la coupure, il remonte au retour -, et reste à zéro le reste du temps :
  // une note aiguë permanente dans un jeu qu'on écoute une heure serait une
  // punition.
  const sivOsc = new Tone.Oscillator({ type: 'triangle', frequency: 1300 });
  const sivFilter = new Tone.Filter({ type: 'bandpass', frequency: 1300, Q: 3.5 });
  const sivGain = new Tone.Gain(0);
  sivOsc.chain(sivFilter, sivGain, trainBus);
  sivOsc.start();

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

  // Voix de bord : tout ce que DIT la rame passe par ce robinet, et lui seul
  // tombe à un niveau lointain quand le joueur descend sur le quai. Les
  // carillons de porte, eux, restent branchés en direct sur paIn - on les
  // entend très bien depuis le quai.
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
  // jusque dans la rame ; la parole du quai, non - depuis une voiture arrêtée
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
  // sur le bus quai sans passer par platVoiceIn - ce sont des signaux, pas de
  // la parole, et ils portent jusque dans la rame.
  //
  // Le timbre visé est celui d'un vibraphone ÉLECTRONIQUE, ou d'une cloche
  // numérique de sono ferroviaire des années 1990-2000 : clair, brillant, un
  // peu métallique, franchement synthétique. Ni piano, ni xylophone de bois, ni
  // bourdon d'église. D'où une FM à porteuse et modulante sinusoïdales,
  // d'harmonicité 3,01 - juste à côté du rang 3, donc légèrement inharmonique,
  // ce qui suffit à faire entendre du métal - dont l'enveloppe de modulation
  // retombe en 90 ms : le métal n'est QUE dans l'attaque, la queue redevient
  // une sinusoïde propre.
  const chimeVoice = {
    harmonicity: 3.01,
    oscillator: { type: 'sine' as const },
    modulation: { type: 'sine' as const },
    modulationEnvelope: { attack: 0.002, decay: 0.09, sustain: 0, release: 0.08 },
  };
  // Le motif part d'un Mi3 à 164,8 Hz, soit une demi-octave SOUS le passe-haut
  // du bus quai : sans rien, la note de fondation arrive huit décibels sous le
  // reste et la montée démarre dans le vide. Ce shelf ne rend au carillon que ce
  // que la sono lui prend, et lui seul en profite - le passe-haut du bus, lui,
  // ne bouge pas : c'est ce qui fait sonner haut-parleur de quai.
  const chimeShelf = new Tone.Filter({ type: 'lowshelf', frequency: 220, gain: 5 }).connect(platIn);
  // Les six premières notes du motif. Polyphonique non pas pour jouer des
  // accords - la partition reste monophonique, voir data/approachChimes - mais
  // parce que les attaques tombent toutes les 200 ms alors que les résonances
  // durent le triple : sur un synthé mono, chaque note couperait la queue de la
  // précédente et le carillon sonnerait comme un bloc-notes.
  const platChime = new Tone.PolySynth(Tone.FMSynth, {
    ...chimeVoice,
    modulationIndex: 2.4,
    envelope: { attack: 0.005, decay: 0.22, sustain: 0.03, release: 0.5 },
    volume: -7,
  }).connect(chimeShelf);
  // La finale tenue (Sol♯5). Même timbre, deux différences : sa décroissance
  // court sur 1,2 s au lieu de 0,22, et sa modulation est plus discrète - la
  // dernière note dure beaucoup plus longtemps, elle ne doit pas frapper plus
  // fort pour autant. Instrument à part plutôt qu'un `set()` de dernière
  // minute : les notes sont programmées d'avance, un réglage posé maintenant
  // s'appliquerait aussi à celles qui n'ont pas encore sonné.
  const platChimeHold = new Tone.FMSynth({
    ...chimeVoice,
    modulationIndex: 1.6,
    envelope: { attack: 0.005, decay: 1.2, sustain: 0.05, release: 0.55 },
    volume: -8,
  }).connect(chimeShelf);
  const platBeep = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.002, decay: 0.1, sustain: 0.3, release: 0.06 },
    volume: -20,
  }).connect(platIn);

  // Les prises de la sono du quai. Contrairement aux diffuseurs du wagon, dont
  // la position est acquise une fois pour toutes, celles-ci suivent la gare :
  // stationPa leur pousse à chaque image les diffuseurs les plus proches de
  // l'oreille, en repère monde (setPlatformSpeakers).
  //
  // L'atténuation, elle, n'est pas celle d'une source ponctuelle. Une LIGNE de
  // sources ne décroît pas comme un point : une distance de référence large et
  // un rolloff doux donnent le champ à peu près constant d'une sono de quai -
  // debout sous une grille ou à mi-chemin de deux, il reste moins d'un décibel
  // d'écart, ce qui est précisément ce qu'on cherche à obtenir.
  const platTaps: PlatformTap[] = Array.from({ length: PLATFORM_TAPS }, (_, i) => {
    const gain = new Tone.Gain(1);
    const panner = new Tone.Panner3D({
      // Position d'attente : la première image de stationPa la remplace.
      positionX: 3.3,
      positionY: 3.4,
      positionZ: (i - (PLATFORM_TAPS - 1) / 2) * 19,
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 7,
      rolloffFactor: 0.9,
      maxDistance: 120,
    });
    platGain.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    return { gain, panner };
  });

  // --- L'avertisseur des PORTES PALIÈRES ---------------------------------
  //
  // Le signal d'ouverture (data/psdOpenChime) ne sort ni de la rame ni de la
  // sono de l'auvent : il sort des BAIES, d'un haut-parleur gros comme la main
  // vissé sur chaque linteau. Il lui faut donc sa propre chaîne, et elle est
  // faite pour imiter ce haut-parleur-là, pas pour sonner joli.
  //
  // Le timbre est presque un sinus : 82 % de fondamentale, 13 % de deuxième
  // harmonique, 5,5 % de troisième, 1,8 % de cinquième - et rien sur la
  // quatrième, dont la présence donnerait tout de suite le corps d'un carillon.
  // C'est ce qui distingue un buzzer tonal d'un vibraphone : les partiels sont
  // là pour rendre le signal PERÇANT, pas chantant.
  const psdChime = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'custom', partials: [0.82, 0.13, 0.055, 0, 0.018] },
    // Attaque franche, plateau constant, coupure nette : une enveloppe de
    // machine. Le `decay` ne sert qu'à rejoindre le plateau ; il n'y a aucune
    // décroissance musicale, et le `release` de douze millisecondes coupe le
    // son au lieu de le laisser mourir.
    envelope: { attack: 0.0025, decay: 0.01, sustain: 0.94, release: 0.012 },
    // Trois décibels de marge sous la pleine échelle, mesurés sur le SIGNAL
    // ENTIER à l'entrée du robinet de niveau : recouvrement des notes et
    // réflexions sommés. Réglé par rendu hors ligne, parce que ce n'est pas la
    // crête d'une note qui compte - à -3 dB par voix, la somme atteignait
    // +2,9 dBFS. Le placement dans le mixage, lui, est PSD_CHIME_LEVEL.
    volume: -8.9,
  });
  // La petite attaque électronique du haut-parleur : le tout début de l'onde
  // qui met la membrane en route. Une milliseconde et demie de bruit très
  // haut, sous le seuil de la conscience - on ne l'entend pas, on entend
  // seulement que la note DÉMARRE au lieu d'apparaître.
  const psdChimeClickHp = new Tone.Filter({ type: 'highpass', frequency: 3200, Q: 0.6 });
  const psdChimeClick = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.0004, decay: 0.005, sustain: 0 },
    volume: -30,
  });
  // Et la voix de la FERMETURE (data/psdCloseWarning). Même haut-parleur, même
  // famille, un timbre à peine plus épais - quatorze pour cent de deuxième
  // harmonique au lieu de treize - et une attaque un rien plus molle. On ne
  // distingue pas les deux signaux à leur couleur : on les distingue à leur
  // SENS, Mi5–Do5 qui descend contre Fa5–La5–Do6 qui monte. Le timbre, lui, ne
  // doit surtout pas changer - c'est le même équipement qui parle.
  const psdWarn = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'custom', partials: [0.8, 0.14, 0.055, 0, 0.018] },
    envelope: { attack: 0.0028, decay: 0.01, sustain: 0.94, release: 0.013 },
    // Même marge de trois décibels que le signal d'ouverture, mesurée de la
    // même façon : sur la paire entière, recouvrement et réflexions compris.
    volume: -8.95,
  });
  const psdChimeIn = new Tone.Gain(PSD_CHIME_LEVEL);
  psdChime.connect(psdChimeIn);
  psdWarn.connect(psdChimeIn);
  psdChimeClick.chain(psdChimeClickHp, psdChimeIn);
  // Le haut-parleur : petit, en plastique, sur un quai. Il ne monte pas.
  const psdChimeLp = new Tone.Filter({ type: 'lowpass', frequency: 6200, rolloff: -12, Q: 0.5 });
  const psdChimeMix = new Tone.Gain(1);
  psdChimeIn.chain(psdChimeLp, psdChimeMix);
  for (const [time, level] of PSD_CHIME_REFLECTIONS) {
    const tap = new Tone.Delay(time);
    const g = new Tone.Gain(level);
    psdChimeLp.chain(tap, g, psdChimeMix);
  }
  const psdChimeDoor = new Tone.Gain(PSD_CHIME_DOORS_CLOSED);
  psdChimeMix.connect(psdChimeDoor);

  // Les prises de la ligne des baies, sur le même principe que celles de
  // l'auvent - stationPa leur pousse les baies les plus proches de l'oreille.
  // La décroissance, elle, est bien plus RAIDE : ces haut-parleurs-là sont
  // petits et bas, on est dessus ou on ne l'est pas, et c'est justement à ce
  // gradient qu'on reconnaît quelle baie s'ouvre devant soi.
  const psdTaps: PlatformTap[] = Array.from({ length: PSD_TAPS }, (_, i) => {
    const gain = new Tone.Gain(1);
    const panner = new Tone.Panner3D({
      // Position d'attente : la première image de stationPa la remplace.
      positionX: 1.86,
      positionY: 1.46,
      positionZ: (i - (PSD_TAPS - 1) / 2) * 4.9,
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 4,
      rolloffFactor: 1.1,
      maxDistance: 90,
    });
    psdChimeDoor.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    return { gain, panner };
  });

  // --- Le carillon des PORTES DE LA RAME (ピンポーン) --------------------
  //
  // Il sort des petits haut-parleurs vissés au-dessus des baies, à l'intérieur
  // de la voiture - pas de la sono du quai, pas des diffuseurs de plafond de
  // la voix. La partition est dans data/doorChime ; ce qui suit n'est que la
  // fabrique du timbre.
  //
  // Le haut-parleur lui-même : une bande étroite et deux réflexions de
  // caisse, rien de plus. Treize et vingt-neuf millisecondes, ce sont les
  // quatre et neuf mètres du couloir et de la cloison d'en face ; à ces
  // niveaux-là on n'entend pas un écho, on entend qu'il y a une voiture autour
  // du haut-parleur. Surtout pas de réverbération : un carillon de porte n'en
  // a aucune, et une queue le transformerait en cloche.
  const doorChimeIn = new Tone.Gain(DOOR_CHIME_LEVEL);
  const doorChimeHp = new Tone.Filter({ type: 'highpass', frequency: 180, rolloff: -12, Q: 0.6 });
  const doorChimeLp = new Tone.Filter({ type: 'lowpass', frequency: 6800, rolloff: -12, Q: 0.5 });
  const doorChimeMix = new Tone.Gain(1);
  doorChimeIn.chain(doorChimeHp, doorChimeLp, doorChimeMix);
  for (const [time, level] of DOOR_CHIME_REFLECTIONS) {
    const tap = new Tone.Delay(time);
    const g = new Tone.Gain(level);
    doorChimeLp.chain(tap, g, doorChimeMix);
  }
  // De là, le carillon rejoint la sonorisation de la rame comme avant : c'est
  // un signal, pas de la parole, et il porte jusque sur le quai par les portes
  // ouvertes.
  doorChimeMix.connect(paIn);

  // Chaque son est ADDITIF : une fondamentale et deux partiels légèrement
  // désaccordés, chacun sur son propre oscillateur parce que les rapports
  // visés (2,01 et 3,97 fois la fondamentale) ne sont pas des harmoniques -
  // un oscillateur `custom` de Tone, qui ne sait empiler que des rangs
  // entiers, sonnerait juste, donc faux. Six voix en tout : trois par son,
  // deux sons. Elles sont monophoniques et c'est suffisant - à l'intérieur
  // d'un carillon, une même voix ne repart que 820 ms plus tard.
  const doorChime = DOOR_CHIME_TONES.map((tone) =>
    tone.partials.map((p) =>
      new Tone.Synth({
        oscillator: { type: 'sine' },
        // Enveloppe de machine : attaque arrondie, plateau, coupure. Les
        // partiels retombent vers un plateau bas plus vite que la
        // fondamentale - le mordant est dans l'attaque, la tenue est presque
        // pure.
        envelope: {
          attack: DOOR_CHIME_ATTACK,
          decay: p.decay,
          sustain: p.sustain,
          release: tone.release,
        },
      }).connect(doorChimeIn),
    ),
  );
  // L'amorce du haut-parleur, au tout début de chaque son : une impulsion de
  // cinq millisecondes vers 3150 Hz, vingt-six décibels sous le carillon. On
  // ne l'entend pas ; on entend qu'il démarre.
  const doorChimeClick = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.0005, decay: 0.004, sustain: 0, release: 0.002 },
    volume: -26,
  }).connect(doorChimeIn);

  // --- Bus de la 発車メロディ -------------------------------------------
  //
  // La mélodie de départ passe par la sono du quai comme le reste, mais avec
  // son propre robinet : c'est le seul élément de la gare qu'on veut pouvoir
  // baisser sans toucher au carillon ATOS ni aux annonces. Une petite bosse
  // de présence la maintient LISIBLE une fois le niveau descendu - dans la
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
  // trois petits générateurs y posent des événements - un chant d'oiseau, un
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
  // dans l'espace et qui balaie l'auditeur en quelques secondes - le seul son
  // du jeu qui passe VRAIMENT d'un côté à l'autre de la tête.
  //
  // Deux couches, parce qu'un passage à 90 km/h s'entend en deux temps : le
  // grondement, qui monte longtemps à l'avance et porte loin, et le souffle
  // aigu - l'air déplacé, le crissement des boudins - qui n'existe qu'au
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

  // Voix d'un voyageur : jamais des mots - une bouche fermée derrière un
  // masque, à un mètre. Une dent de scie très filtrée passée en bande étroite
  // autour du premier formant donne la bonne matière : on entend QUE quelqu'un
  // parle, pas CE qu'il dit - le texte, lui, est à l'écran.
  const paxVoiceFilter = new Tone.Filter({ type: 'bandpass', frequency: 620, Q: 2.4 });
  const paxVoiceSynth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.02, decay: 0.09, sustain: 0.35, release: 0.06 },
    volume: -26,
  });
  paxVoiceSynth.chain(paxVoiceFilter, trainBus);

  // --- Les appareils de gare ---------------------------------------------
  //
  // Un distributeur, un 券売機, un portillon : on ne les entend jamais de loin,
  // on les entend PARCE QU'ON EST DEVANT. Ils n'appartiennent donc ni au bus de
  // la rame (qui s'atténue quand elle s'éloigne) ni à la sonorisation. Un bus à
  // part, à niveau fixe, envoyé dans la réverbération du lieu : sous une dalle
  // souterraine, le fracas d'une canette qui tombe traîne, et c'est ce qui fait
  // qu'on l'entend comme un son de gare et non comme un bruitage.
  const devBus = new Tone.Gain(1).connect(master);
  devBus.connect(roomSend);

  // Le clic des touches, l'arête d'une pièce sur la fente, le déclic d'un
  // volet : très court, très haut, jamais tonique.
  const devClickFilter = new Tone.Filter({ type: 'highpass', frequency: 2600, Q: 0.6 });
  const devClick = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
    volume: -14,
  });
  devClick.chain(devClickFilter, devBus);

  // Le bip. C'est LE son d'une gare japonaise - le ピッ du portillon, le
  // carillon de confirmation d'un distributeur - et il est toujours le même :
  // une onde carrée nue, très courte, sans queue. Ce qui change d'un appareil
  // à l'autre, c'est la hauteur et le nombre.
  const devBeep = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0.85, release: 0.012 },
    volume: -17,
  }).connect(devBus);

  // La pièce : un métal court qui rebondit deux fois au fond du monnayeur.
  const devCoin = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.14, release: 0.02 },
    harmonicity: 6.2,
    modulationIndex: 26,
    resonance: 5200,
    octaves: 1.4,
    volume: -26,
  }).connect(devBus);

  // Le moteur : la spirale qui tourne, le rouleau d'une imprimante thermique,
  // le mécanisme d'un battant. Un souffle qu'on ouvre et qu'on referme, pas un
  // événement - sa durée est celle du geste.
  const devMotorFilter = new Tone.Filter({ type: 'bandpass', frequency: 420, Q: 2.2 });
  const devMotorGain = new Tone.Gain(0);
  const devMotor = new Tone.Noise('brown');
  devMotor.chain(devMotorFilter, devMotorGain, devBus);
  devMotor.start();

  // Le fond de la sébile : une canette de 350 g qui tombe de quatre-vingts
  // centimètres sur une tôle. C'est le son le plus reconnaissable de tout un
  // quai, et il est grave, pas claquant.
  const devThud = new Tone.MembraneSynth({
    pitchDecay: 0.06,
    octaves: 3.5,
    envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.1 },
    volume: -12,
  }).connect(devBus);

  // Le souffle : la décapsulation, le volet de retrait qu'on soulève, le
  // battant du portique qui chasse l'air.
  const devHissFilter = new Tone.Filter({ type: 'highpass', frequency: 1400, Q: 0.5 });
  const devHiss = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.004, decay: 0.3, sustain: 0 },
    volume: -20,
  });
  devHiss.chain(devHissFilter, devBus);

  // --- La météo -----------------------------------------------------------
  //
  // La pluie s'entend en DEUX endroits qui n'ont rien à voir, et c'est ce qui
  // la rend crédible depuis un train :
  //
  //   · sur le PAVILLON, au-dessus de la tête. Un crépitement mat, sourd, sans
  //     aigus - la tôle et l'isolant les mangent. Il ne passe pas par les
  //     portes : il est là même portes fermées, et c'est le seul son du jeu
  //     dont l'ouverture des portes ne change rien. Il appartient à la rame,
  //     donc au bus qui s'atténue quand on la regarde depuis le quai ;
  //   · DEHORS, sur la ville et sur le quai. Un souffle large et brillant, qui
  //     n'entre dans le wagon que par les ouvertures - comme l'ambiance de
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
    hvacNoise,
    hvacFilter,
    hvacGain,
    spark,
    sivOsc,
    sivFilter,
    sivGain,
    clack,
    clackFilter,
    air,
    airFilter,
    vent,
    squeal,
    slideTrainGain,
    slidePsdGain,
    thud,
    doorChime,
    doorChimeClick,
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
    platTaps,
    psdChime,
    psdWarn,
    psdChimeClick,
    psdChimeDoor,
    psdTaps,
    hissGain,
    paClick,
    platHissGain,
    platClick,
    platChime,
    platChimeHold,
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
    devBus,
    devClick,
    devClickFilter,
    devBeep,
    devCoin,
    devMotor,
    devMotorFilter,
    devMotorGain,
    devThud,
    devHiss,
    devHissFilter,
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

/** Combien de diffuseurs la sono du quai peut panner à la fois. */
export const platformSpeakerTaps = PLATFORM_TAPS;

/**
 * Où sont les diffuseurs du quai à cette image, en repère MONDE - donc côté
 * d'ouverture appliqué et glissement du quai compris. C'est systems/stationPa
 * qui les choisit ; ici on ne fait que les poser sur les prises, dans l'ordre
 * reçu. Les prises en trop se taisent.
 */
export function setPlatformSpeakers(points: readonly SpeakerPos[]): void {
  if (!nodes) return;
  for (let i = 0; i < nodes.platTaps.length; i++) {
    const { gain, panner } = nodes.platTaps[i];
    const p = points[i];
    if (!p) {
      gain.gain.value = 0;
      continue;
    }
    gain.gain.value = 1;
    panner.positionX.value = p[0];
    panner.positionY.value = p[1];
    panner.positionZ.value = p[2];
  }
}

/** Combien de baies palières l'avertisseur peut panner à la fois. */
export const psdChimeTaps = PSD_TAPS;

/**
 * Où sonnent les avertisseurs de baie à cette image, en repère MONDE. Même
 * contrat que setPlatformSpeakers : stationPa choisit les baies, on ne fait
 * que les poser sur les prises. Une liste vide - gare sans portes palières -
 * fait taire la ligne entière.
 */
export function setPsdBuzzers(points: readonly SpeakerPos[]): void {
  if (!nodes) return;
  for (let i = 0; i < nodes.psdTaps.length; i++) {
    const { gain, panner } = nodes.psdTaps[i];
    const p = points[i];
    if (!p) {
      gain.gain.value = 0;
      continue;
    }
    gain.gain.value = 1;
    panner.positionX.value = p[0];
    panner.positionY.value = p[1];
    panner.positionZ.value = p[2];
  }
}

/**
 * L'auditeur est-il dehors, sur le quai ? Le filtrage du bus quai simule le
 * son entendu À TRAVERS les ouvertures de la rame ; debout sous les
 * haut-parleurs, il n'a plus lieu d'être.
 */
let listenerOutside = false;

/**
 * Dernière ouverture reçue (0–1), gardée pour que le changement de lieu
 * d'écoute retrouve tout de suite le bon niveau de voix de bord : descendre
 * portes grandes ouvertes et descendre sur une porte qui se referme ne laissent
 * pas passer la même chose.
 */
let doorOpening = 0;

/** Voix de bord entendue du quai, au degré d'ouverture courant. */
function cabinVoiceOutside(): number {
  return (
    CABIN_VOICE_OUTSIDE_CLOSED +
    doorOpening * (CABIN_VOICE_OUTSIDE_OPEN - CABIN_VOICE_OUTSIDE_CLOSED)
  );
}

export function setListenerOutside(outside: boolean): void {
  listenerOutside = outside;
  if (!nodes) return;
  if (outside) {
    nodes.platLp.frequency.rampTo(11000, 0.25);
    nodes.platGain.gain.rampTo(PLAT_BUS_OUTSIDE, 0.25);
  }
  // Debout sur le quai, la sono du wagon est derrière les vitres : les
  // diffuseurs sont à l'intérieur, mais un peu de voix traverse encore les
  // portes ouvertes. À l'inverse, celle du quai n'a plus rien à traverser.
  nodes.paVoiceGain.gain.rampTo(outside ? cabinVoiceOutside() : 1, 0.3);
  nodes.platVoiceGain.gain.rampTo(outside ? 1 : PLAT_VOICE_INSIDE, 0.3);
  // La mélodie, elle, est CALÉE PAR LIEU : sous le diffuseur elle doit se
  // tenir, depuis la rame elle doit s'entendre. Voir MELODY_INSIDE.
  nodes.melodyIn.gain.rampTo(outside ? MELODY_OUTSIDE : MELODY_INSIDE, 0.3);
  // Debout sur le quai, plus rien ne s'interpose entre le linteau et l'oreille.
  if (outside) nodes.psdChimeDoor.gain.rampTo(PSD_CHIME_DOORS_OPEN, 0.25);
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
  const o = Math.max(0, Math.min(1, open01));
  doorOpening = o;
  // Dehors, les portes de la rame ne filtrent plus la sono du QUAI -
  // setListenerOutside a déjà ouvert ce bus-là en grand. Ce qu'elles filtrent
  // alors, c'est la voix de BORD, dans l'autre sens : la même ouverture, la
  // même porte, la parole qui la traverse en sens inverse.
  if (listenerOutside) {
    nodes.paVoiceGain.gain.rampTo(cabinVoiceOutside(), 0.12);
    return;
  }
  nodes.platLp.frequency.rampTo(750 + o * 3600, 0.12);
  nodes.platGain.gain.rampTo(PLAT_BUS_CLOSED + o * (PLAT_BUS_OPEN - PLAT_BUS_CLOSED), 0.12);
  nodes.psdChimeDoor.gain.rampTo(
    PSD_CHIME_DOORS_CLOSED + o * (PSD_CHIME_DOORS_OPEN - PSD_CHIME_DOORS_CLOSED),
    0.12,
  );
}

// Un instrument Tone refuse tout déclenchement antérieur ou égal au dernier
// programmé : « Start time must be strictly greater than previous start time ».
// Sur une frame longue (onglet repris, GPU saturé, machine lente), plusieurs
// événements du cycle tombent au MÊME instant audio - deux portes qui claquent,
// l'immobilisation et un choc de porte - et l'assertion cassait la frame.
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
 * Carillon ATOS : le motif de sept notes qui précède l'annonce d'approche. Ce
 * n'est pas la mélodie de départ - c'est un signal d'attention, sur lequel
 * personne ne se retourne mais que tout le monde reconnaît.
 *
 * La partition est dans data/approachChimes ; ici on ne fait que la jouer, à
 * l'instant près : six attaques régulières puis la finale tenue.
 *
 * @returns la durée du motif (s), queue comprise. Le carillon PRÉCÈDE
 *          l'annonce, il ne la couvre pas : l'appelant attend ce délai avant de
 *          faire parler la gare (voir stationPa.paApproach).
 */
export function platformChime(): number {
  if (!nodes) return 0;
  soundCue('atosChime');
  const lead = 0.05;
  // UNE seule réservation, pour la phrase entière. En réservant note à note, un
  // carillon déclenché pendant qu'un autre résonne verrait ses premières
  // attaques repoussées les unes contre les autres : les 200 ms régulières se
  // tasseraient, et la montée deviendrait un roulement. Le créneau demandé vaut
  // donc tout le motif - deux carillons ne peuvent pas se chevaucher.
  const start = slot('platChime', Tone.now() + lead, APPROACH_CHIME_TOTAL_S);
  const last = APPROACH_CHIME_SCORE.length - 1;
  APPROACH_CHIME_SCORE.forEach((n, i) => {
    const voice = i === last ? nodes!.platChimeHold : nodes!.platChime;
    voice.triggerAttackRelease(n.note, n.hold, start + n.at, n.velocity);
  });
  return lead + APPROACH_CHIME_TOTAL_S;
}

/** Écart entre les deux bips du signal d'entrée, puis extinction du second (s). */
const WARNING_BEEP_GAP = 0.24;
const WARNING_BEEP_TAIL = 0.14;

/**
 * Durée du signal d'entrée (s). Elle est publique parce qu'elle se CHIFFRE
 * avant de sonner : l'avertissement qui la suit n'est diffusé que s'il tient
 * avant l'arrêt de la rame (stationPa.paTrainEntering), et rien ne doit sortir
 * des haut-parleurs tant que cette décision n'est pas prise.
 */
export const PLATFORM_WARNING_SIGNAL_S = WARNING_BEEP_GAP + WARNING_BEEP_TAIL;

/**
 * Signal électronique avant 「電車がまいります」 : deux bips secs.
 *
 * @returns la durée du signal (s), pour la même raison que le carillon.
 */
export function platformWarningSignal(): number {
  if (!nodes) return 0;
  const now = Tone.now();
  nodes.platBeep.triggerAttackRelease('E6', 0.14, slot('platBeep', now), 0.4);
  nodes.platBeep.triggerAttackRelease(
    'E6', 0.14, slot('platBeep', now + WARNING_BEEP_GAP), 0.4,
  );
  return PLATFORM_WARNING_SIGNAL_S;
}

/** Fin du signal d'ouverture en cours, sur l'horloge audio. */
let psdChimeUntil = 0;

/**
 * Le signal d'OUVERTURE des portes palières : neuf fois Fa5–La5–Do6, en trois
 * blocs de trois, depuis les baies elles-mêmes.
 *
 * La partition est dans data/psdOpenChime ; ici on ne fait que la poser sur
 * l'horloge audio, d'un seul coup. Tout est programmé à l'avance plutôt que
 * suivi image par image : trois secondes et demie de signal ne doivent pas
 * boiter parce qu'une frame a duré cent millisecondes.
 *
 * Les notes se RECOUVRENT de sept millisecondes, d'où le PolySynth : un synthé
 * monophonique verrait l'attaque de La5 arriver avant le relâchement de Fa5 et
 * couperait la note en plein milieu.
 *
 * @returns la durée du signal (s), ou 0 si l'audio n'est pas démarré.
 */
export function psdOpenChime(): number {
  if (!nodes) return 0;
  // Un signal déjà en cours n'est pas relancé : une baie qui repart pendant
  // que la précédente sonne encore doublerait les vingt-sept notes.
  const now = Tone.now() + 0.02;
  if (now < psdChimeUntil) return 0;
  soundCue('psdOpen');
  for (const note of psdOpenChimeScore()) {
    const at = now + note.at;
    nodes.psdChime.triggerAttackRelease(note.freq, PSD_CHIME_NOTE_HOLD, at);
    nodes.psdChimeClick.triggerAttackRelease(0.004, slot('psdChimeClick', at), 0.6);
  }
  psdChimeUntil = now + PSD_CHIME_DURATION;
  return PSD_CHIME_DURATION;
}

// --- L'avertisseur de FERMETURE ------------------------------------------
//
// Contrairement au signal d'ouverture, celui-ci n'est PAS un morceau qu'on
// lance : c'est une boucle qu'on ouvre au premier millimètre de course et
// qu'on ferme à la seconde où les vantaux sont en butée. Les trois paires
// Mi5–Do5 d'une fermeture normale ne sont pas programmées - elles sont ce que
// la boucle produit en 0,9 s, la durée du mouvement. Une baie retenue par un
// obstacle continue donc d'avertir aussi longtemps qu'elle reste entrebâillée,
// ce qu'un signal de longueur fixe ne saurait pas faire.
//
// La boucle n'anticipe que d'une fraction de seconde, et c'est délibéré : ce
// qui est programmé ne s'annule pas proprement dans Tone (relâcher une voix
// dont l'attaque est à venir ne fait rien). En ne prenant jamais plus d'avance
// que PSD_WARN_LOOKAHEAD, l'arrêt ne laisse jamais partir de paire de trop.

/** Avance maximale de la boucle sur l'horloge audio (s). */
const PSD_WARN_LOOKAHEAD = 0.1;

/** La boucle tourne-t-elle, et quand tombe la prochaine paire. */
let psdWarnOn = false;
let psdWarnNextAt = 0;

/**
 * Ouvre ou ferme l'avertisseur de fermeture des portes palières.
 *
 * `true` au démarrage du mouvement, `false` dès que TOUT est confirmé fermé -
 * c'est systems/doorMotion qui tient cette condition, parce que lui seul sait
 * où en est la baie bloquée. La fermeture coupe net : ce qui sonne encore est
 * relâché sur place, en treize millisecondes.
 */
export function psdCloseWarning(on: boolean): void {
  if (!nodes || on === psdWarnOn) return;
  psdWarnOn = on;
  if (!on) {
    nodes.psdWarn.releaseAll(Tone.now());
    return;
  }
  soundCue('psdClose');
  psdWarnNextAt = Tone.now();
  pumpPsdCloseWarning();
}

/**
 * Alimente la boucle : à appeler chaque image tant qu'elle tourne. Sans effet
 * si elle est fermée.
 *
 * `closesIn` est le temps qui reste avant la butée, tel que systems/doorMotion
 * le connaît - `Infinity` quand une baie est retenue et qu'on ne sait pas
 * quand elle se fermera. Aucune paire ne DÉMARRE après cette échéance : sans
 * cette borne, la boucle en lancerait une quatrième neuf millisecondes avant
 * l'arrivée en butée, et l'avertisseur déborderait sur des vantaux déjà clos.
 * C'est ce qui fait qu'une fermeture normale donne exactement trois paires.
 */
export function pumpPsdCloseWarning(closesIn = Number.POSITIVE_INFINITY): void {
  if (!nodes || !psdWarnOn) return;
  const now = Tone.now();
  const deadline = now + Math.max(0, closesIn);
  while (psdWarnNextAt <= now + PSD_WARN_LOOKAHEAD) {
    // Une image très longue peut avoir laissé passer l'heure de la paire : on
    // la joue tout de suite plutôt que dans le passé, et la boucle se recale.
    const at = Math.max(psdWarnNextAt, now);
    if (at >= deadline) break;
    for (const note of psdCloseWarningPair()) {
      const t = at + note.at;
      nodes.psdWarn.triggerAttackRelease(note.freq, PSD_WARN_NOTE_HOLD, t);
      nodes.psdChimeClick.triggerAttackRelease(0.004, slot('psdChimeClick', t), 0.6);
    }
    psdWarnNextAt = at + PSD_WARN_PAIR_STEP;
  }
}

// --- Les appareils de gare ------------------------------------------------
//
// Tout ce qu'on actionne soi-même : le monnayeur, les touches, la spirale, la
// sébile, le volet, le portillon, l'imprimante à billets. Ces sons ne sont pas
// du décor - ils sont la RÉPONSE à un geste, et c'est à ça qu'on juge qu'un
// appareil fonctionne. Un distributeur muet reste un meuble, même s'il rend une
// canette.

/** Une pièce qui tombe dans le monnayeur, et rebondit au fond. */
export function deviceCoin(value = 100): void {
  if (!nodes) return;
  const now = Tone.now();
  // Une pièce de 500 sonne plus grave qu'une de 10 : c'est la masse.
  const f = value >= 500 ? 3200 : value >= 100 ? 4200 : 5400;
  nodes.devCoin.triggerAttackRelease(f, 0.05, slot('devCoin', now), 0.5);
  nodes.devCoin.triggerAttackRelease(f * 1.18, 0.03, slot('devCoin', now + 0.07), 0.22);
  nodes.devClick.triggerAttackRelease(0.02, slot('devClick', now + 0.13), 0.3);
}

/** Un billet avalé : le rouleau qui l'entraîne, puis le déclic du lecteur. */
export function deviceBillFeed(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.devMotorFilter.frequency.value = 780;
  nodes.devMotorGain.gain.cancelScheduledValues(now);
  nodes.devMotorGain.gain.setValueAtTime(0, now);
  nodes.devMotorGain.gain.linearRampToValueAtTime(0.06, now + 0.05);
  nodes.devMotorGain.gain.setValueAtTime(0.06, now + 0.55);
  nodes.devMotorGain.gain.linearRampToValueAtTime(0, now + 0.68);
  nodes.devClick.triggerAttackRelease(0.02, slot('devClick', now + 0.7), 0.35);
}

/** Une touche du clavier tarifaire, ou un bouton de sélection. */
export function deviceButton(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.devClick.triggerAttackRelease(0.015, slot('devClick', now), 0.45);
  nodes.devBeep.triggerAttackRelease('A6', 0.045, slot('devBeep', now + 0.005), 0.3);
}

/**
 * Le ピッ du portillon : UN bip court et clair, et rien d'autre.
 *
 * C'est le son de gare japonais par excellence, celui qu'on entend deux mille
 * fois par heure à Shinjuku - et il tient en soixante millisecondes d'onde
 * carrée. La version d'entrée et celle de sortie ne diffèrent pas : ce qui
 * change, c'est ce que dit l'afficheur.
 *
 * `gain` sert aux bips qui ne sont pas les nôtres : ceux de la file d'à côté,
 * qui ponctuent le hall sans être adressés à personne (systems/fareGate).
 */
export function gateBeep(gain = 1): void {
  if (!nodes) return;
  nodes.devBeep.triggerAttackRelease('D7', 0.075, slot('devBeep', Tone.now()), 0.5 * gain);
}

/**
 * Le refus : deux notes descendantes, graves, désagréables à dessein.
 *
 * Un portillon qui refuse ne fait pas un bip plus long - il fait un AUTRE son,
 * et c'est ce contraste qui fait qu'on s'arrête sans avoir à lire l'écran.
 */
export function gateDeny(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.devBeep.triggerAttackRelease('A4', 0.16, slot('devBeep', now), 0.42);
  nodes.devBeep.triggerAttackRelease('E4', 0.26, slot('devBeep', now + 0.19), 0.42);
}

/**
 * Les battants du portillon qui se ferment ou se rouvrent.
 *
 * `gain` sert aux baies qui ne sont pas la nôtre : la ligne entière claque au
 * passage de la foule (systems/fareGate), et un vantail à vingt mètres ne
 * s'entend pas comme celui qu'on a devant le nez.
 */
export function gateFlap(closing: boolean, gain = 1): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.devHissFilter.frequency.value = 900;
  nodes.devHiss.envelope.decay = 0.12;
  nodes.devHiss.triggerAttackRelease(0.09, slot('devHiss', now), (closing ? 0.5 : 0.35) * gain);
  nodes.devClick.triggerAttackRelease(0.02, slot('devClick', now + 0.14), (closing ? 0.5 : 0.25) * gain);
}

/**
 * La spirale du distributeur qui tourne, puis l'objet qui tombe dans la sébile.
 *
 * `heavy` distingue la bouteille de 550 ml de la petite boîte de café : ce
 * n'est pas la même chute, et c'est au bruit qu'on sait ce qu'on va ramasser.
 */
export function vendingDispense(heavy: boolean): void {
  if (!nodes) return;
  const now = Tone.now();
  // Le mécanisme : un moteur lent, une seconde à peine.
  nodes.devMotorFilter.frequency.value = 320;
  nodes.devMotorGain.gain.cancelScheduledValues(now);
  nodes.devMotorGain.gain.setValueAtTime(0, now);
  nodes.devMotorGain.gain.linearRampToValueAtTime(0.09, now + 0.08);
  nodes.devMotorGain.gain.setValueAtTime(0.09, now + 0.62);
  nodes.devMotorGain.gain.linearRampToValueAtTime(0, now + 0.78);
  // La chute : le fond de la sébile, puis un rebond plus sec.
  const drop = now + 0.86;
  nodes.devThud.triggerAttackRelease(heavy ? 'F1' : 'A1', 0.12, slot('devThud', drop), heavy ? 0.85 : 0.6);
  nodes.devCoin.triggerAttackRelease(heavy ? 2400 : 3600, 0.04, slot('devCoin', drop + 0.02), heavy ? 0.3 : 0.42);
  nodes.devThud.triggerAttackRelease('C2', 0.06, slot('devThud', drop + 0.13), 0.3);
}

/** Le volet du 取出口 qu'on pousse, et qui retombe tout seul derrière la main. */
export function vendingFlap(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.devHissFilter.frequency.value = 1800;
  nodes.devHiss.envelope.decay = 0.09;
  nodes.devHiss.triggerAttackRelease(0.06, slot('devHiss', now), 0.3);
  nodes.devClick.triggerAttackRelease(0.02, slot('devClick', now + 0.02), 0.35);
  nodes.devClick.triggerAttackRelease(0.03, slot('devClick', now + 0.26), 0.28);
}

/** La monnaie rendue : trois pièces qui dégringolent dans la sébile. */
export function vendingChange(coins: number): void {
  if (!nodes) return;
  const now = Tone.now();
  const n = Math.max(1, Math.min(6, coins));
  for (let i = 0; i < n; i++) {
    const t = now + i * (0.055 + Math.random() * 0.04);
    nodes.devCoin.triggerAttackRelease(3400 + Math.random() * 1800, 0.05, slot('devCoin', t), 0.4);
  }
  nodes.devThud.triggerAttackRelease('C2', 0.05, slot('devThud', now + 0.04), 0.2);
}

/**
 * L'imprimante d'un 券売機 : le rouleau, la découpe, et le billet qui sort.
 *
 * Le carillon de confirmation vient AVANT - c'est lui qui annonce que la
 * machine a compris - et l'impression suit. Cet ordre-là n'est pas décoratif :
 * il est ce qui fait qu'on retire la main de l'écran et qu'on regarde la fente.
 */
export function ticketPrint(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.devBeep.triggerAttackRelease('E6', 0.07, slot('devBeep', now), 0.34);
  nodes.devBeep.triggerAttackRelease('A6', 0.11, slot('devBeep', now + 0.1), 0.34);
  nodes.devMotorFilter.frequency.value = 1250;
  nodes.devMotorGain.gain.cancelScheduledValues(now);
  nodes.devMotorGain.gain.setValueAtTime(0, now + 0.25);
  nodes.devMotorGain.gain.linearRampToValueAtTime(0.05, now + 0.32);
  nodes.devMotorGain.gain.setValueAtTime(0.05, now + 0.95);
  nodes.devMotorGain.gain.linearRampToValueAtTime(0, now + 1.05);
  nodes.devClick.triggerAttackRelease(0.02, slot('devClick', now + 1.08), 0.4);
}

/** Décapsulation : le déclic de l'anneau, puis le gaz qui s'échappe. */
export function canOpen(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.devClick.triggerAttackRelease(0.015, slot('devClick', now), 0.5);
  nodes.devHissFilter.frequency.value = 3200;
  nodes.devHiss.envelope.decay = 0.42;
  nodes.devHiss.triggerAttackRelease(0.3, slot('devHiss', now + 0.02), 0.34);
}

/** Une canette vide jetée dans le bac : le fond de plastique, puis le roulé. */
export function binToss(): void {
  if (!nodes) return;
  const now = Tone.now();
  nodes.devThud.triggerAttackRelease('D2', 0.09, slot('devThud', now + 0.18), 0.45);
  nodes.devCoin.triggerAttackRelease(3000, 0.04, slot('devCoin', now + 0.2), 0.28);
  nodes.devCoin.triggerAttackRelease(2600, 0.03, slot('devCoin', now + 0.32), 0.16);
}

/**
 * Vitesse des turbines de climatisation (0..1), qui n'est PAS l'alimentation
 * de bord : un ventilateur a de l'inertie. La tension tombe d'un coup, le
 * souffle met deux bonnes secondes à mourir - et il remonte plus vite qu'il
 * n'est descendu, parce qu'au retour de la tension les moteurs sont relancés
 * en charge.
 */
let hvacSpin = 1;
const HVAC_SPIN_DOWN = 2.2; // s pour passer de 1 à 0
const HVAC_SPIN_UP = 1.1; // s pour repartir de 0 à 1
/** Niveau du souffle à bord, à pleine ventilation. */
const HVAC_LEVEL = 0.019;

// Mise à jour continue, pilotée par la vitesse normalisée (0..1).
//
// `power` est l'alimentation de bord (runtime.carPower) : à 0, l'onduleur est
// muet - pas de chant VVVF, et surtout pas de freinage par récupération, la
// rame se pose au seul frein pneumatique - et la climatisation s'éteint.
export function updateAudio(dt: number, speed01: number, braking: boolean, power = 1): void {
  if (!nodes || dt <= 0) return;
  const accel01 = (speed01 - prevSpeed01) / dt; // par seconde
  prevSpeed01 = speed01;

  // Les turbines suivent la tension avec leur propre inertie.
  const spinRate = power > hvacSpin ? dt / HVAC_SPIN_UP : dt / HVAC_SPIN_DOWN;
  hvacSpin += Math.max(-spinRate, Math.min(spinRate, power - hvacSpin));

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
  // l'entend - c'est même souvent à ça qu'on devine qu'il pleut avant de
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
  // Sans tension à la caténaire, l'onduleur se tait dans l'instant : pas de
  // descente de chant, pas de récupération au freinage. C'est ce silence-là
  // qu'on entend en premier, avant même de voir l'éclairage baisser.
  nodes.vvvfGain.gain.rampTo(
    speed01 > 0.005 ? (0.012 + boost * 0.05 * (0.35 + speed01)) * exterior * power : 0,
    power > 0.5 ? 0.1 : 0.05,
  );

  // Souffle de climatisation : plein à bord, presque rien depuis le quai - de
  // dehors, ce qu'on entend d'un groupe de toiture n'est pas ce qui souffle
  // dans le wagon.
  nodes.hvacGain.gain.rampTo(HVAC_LEVEL * hvacSpin * (listenerOutside ? 0.22 : 1), 0.15);

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
 * sourd, court, amorti par ce qui est pris dedans - c'est exactement à ça
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

// --- Les petits bruits électriques ---------------------------------------
//
// Une coupure de caténaire est faite de sons qui s'ARRÊTENT - l'onduleur, la
// climatisation. Mais entre les deux silences, il se passe quelque chose de
// très sonore et de très court : du matériel électrique qui travaille. C'est
// ce qui donne à l'événement sa texture, et sans quoi le wagon a simplement
// l'air de s'éteindre.
//
// Les INSTANTS ne sont pas ici : ils vivent avec les images-clés de la lumière
// (systems/carPower), pour que ce qu'on voit clignoter et ce qu'on entend
// claquer restent le même événement. Ici, seulement les timbres.

/** Grésillement d'arc : n impulsions très courtes, très aiguës, resserrées. */
function crackle(now: number, count: number, spread: number, level: number): void {
  if (!nodes) return;
  for (let i = 0; i < count; i++) {
    const t = now + (i / count) * spread + Math.random() * spread * 0.35;
    nodes.spark.triggerAttackRelease(0.012, slot('spark', t, 0.004), level * (0.5 + Math.random()));
  }
}

/**
 * Un petit bruit électrique de la séquence en cours.
 *
 * Appelé par stationCycle au moment exact où `stepCarPower` signale que la
 * courbe vient de croiser l'événement - donc jamais décalé du clignotement
 * qu'il accompagne.
 */
export function powerSound(kind: PowerSoundKind): void {
  if (!nodes) return;
  const now = Tone.now();
  switch (kind) {
    case 'breaker':
      // Sous le plancher, et ça se sent autant que ça s'entend.
      nodes.thud.triggerAttackRelease('D1', 0.11, slot('thud', now), 0.42);
      crackle(now + 0.005, 3, 0.03, 0.5);
      break;
    case 'relay':
      // Un contacteur : le claquement sec du noyau, et l'étincelle de rupture.
      nodes.thud.triggerAttackRelease('A1', 0.05, slot('thud', now), 0.22);
      nodes.clack.triggerAttackRelease(0.018, slot('clack', now + 0.004), 0.3);
      crackle(now + 0.006, 2, 0.02, 0.35);
      break;
    case 'strike':
      // Un tube qui essaie de se réamorcer : ça grésille, ça n'a pas de corps.
      crackle(now, 5, 0.07, 0.42);
      break;
    case 'arc':
      // Ce qui reste s'échappe : plus ténu, plus étalé, sans coup.
      crackle(now, 4, 0.13, 0.2);
      break;
    case 'whineDown':
      // Le sifflement du convertisseur s'effondre en une demi-seconde.
      nodes.sivGain.gain.cancelScheduledValues(now);
      nodes.sivGain.gain.setValueAtTime(0.02, now);
      nodes.sivOsc.frequency.cancelScheduledValues(now);
      nodes.sivOsc.frequency.setValueAtTime(1300, now);
      nodes.sivOsc.frequency.exponentialRampToValueAtTime(180, now + 0.5);
      nodes.sivFilter.frequency.rampTo(300, 0.5);
      nodes.sivGain.gain.linearRampToValueAtTime(0, now + 0.55);
      break;
    case 'whineUp':
      // …et remonte, une fois le contacteur accroché. Plus vite qu'il n'est
      // tombé : ce qui se réamorce se réamorce d'un coup.
      nodes.sivGain.gain.cancelScheduledValues(now);
      nodes.sivGain.gain.setValueAtTime(0, now);
      nodes.sivOsc.frequency.cancelScheduledValues(now);
      nodes.sivOsc.frequency.setValueAtTime(240, now);
      nodes.sivOsc.frequency.exponentialRampToValueAtTime(1300, now + 0.35);
      nodes.sivFilter.frequency.rampTo(1300, 0.35);
      nodes.sivGain.gain.linearRampToValueAtTime(0.022, now + 0.12);
      // Puis il s'efface : à régime établi, on ne l'entend plus.
      nodes.sivGain.gain.linearRampToValueAtTime(0, now + 1.1);
      break;
    case 'fans':
      // Reprise des turbines en charge : un appel d'air court.
      nodes.air.triggerAttackRelease(0.4, slot('air', now), 0.1);
      break;
  }
}

/**
 * Un déclic isolé dans le noir.
 *
 * Une rame sur batteries n'est pas muette : il reste des relais qui travaillent
 * quelque part sous le plancher, et c'est ce qu'on entend pendant les minutes
 * d'attente. Volontairement rare et volontairement ténu - c'est ce qui fait
 * qu'un silence de cinq minutes reste habité au lieu d'être un blanc.
 */
export function batteryTick(): void {
  if (!nodes) return;
  const now = Tone.now();
  if (Math.random() < 0.55) {
    nodes.clack.triggerAttackRelease(0.014, slot('clack', now), 0.12);
    crackle(now + 0.004, 2, 0.02, 0.12);
  } else {
    crackle(now, 3, 0.05, 0.14);
  }
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
 * des mots. La hauteur suit la personne - une voix de femme au-dessus d'une
 * voix d'homme, un grand plus bas qu'un petit, un ancien plus voilé - et la
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
  soundCue('passingTrain');
}

/**
 * Pose la source et son niveau.
 *
 * @param x,y,z   point de la rame le plus proche de l'auditeur (repère monde)
 * @param closing −1 (rame déjà passée) … +1 (rame encore devant) : c'est le
 *                seul effet Doppler qu'on puisse donner à du bruit large bande,
 *                et c'est celui qu'on entend - le grondement se referme d'un
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

// --- Carillons de porte (synthèse, avec hook fichiers locaux) ---

/**
 * Le carillon des portes, à l'ouverture comme à la fermeture.
 *
 * Une seule fonction pour les deux moments, et c'est le fond de l'affaire :
 * une rame ne joue pas un carillon d'ouverture et un carillon de fermeture,
 * elle joue LE carillon des portes. Ce qui change entre les deux, ce sont les
 * vantaux, la purge d'air et l'avertisseur du quai - jamais les six sons.
 */
function synthDoorChime(): void {
  if (!nodes) return;
  const start = slot('doorChime', Tone.now() + 0.02, DOOR_CHIME_DURATION);
  for (const ev of doorChimeScore()) {
    const tone = DOOR_CHIME_TONES[ev.tone];
    const at = start + ev.at;
    tone.partials.forEach((p, k) => {
      const voice = nodes!.doorChime[ev.tone][k];
      const hz = tone.freq * p.ratio;
      // La voix part 0,8 % trop haut et rejoint sa fréquence en 18 ms : le
      // temps que le générateur se cale. La rampe est posée APRÈS l'attaque,
      // qui écrit elle-même la fréquence de départ sur le signal.
      voice.triggerAttackRelease(hz * (1 + DOOR_CHIME_SETTLE_RATIO), tone.hold, at, p.amp * tone.gain);
      voice.frequency.exponentialRampToValueAtTime(hz, at + DOOR_CHIME_SETTLE_S);
    });
    nodes.doorChimeClick.triggerAttackRelease(DOOR_CHIME_CLICK_HZ, DOOR_CHIME_CLICK_S, at);
  }
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
// data/melodies, avec les autres durées - c'est elle qui sert de repli quand il
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
 * compte de motifs fait à l'avance - on n'en démarre pas un qui déborderait -
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
//    renvoyait quand même `true` - donc pas même de repli speechSynthesis.
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
  if (bus === 'melody') cueMelody(path);
  activeByPath.set(path, handle);
  void handle.ended.then(() => {
    if (activeByPath.get(path) === handle) activeByPath.delete(path);
  });
  await handle.ended;
  return true;
}

/**
 * Dernière 発車メロディ nommée à l'écran, et quand.
 *
 * La mélodie fait DEUX passages entiers (MELODY_REPEATS), donc deux appels à
 * playOnce pour un seul départ : sans ce garde-fou, le journal des sous-titres
 * porterait deux fois la même ligne à chaque arrêt. Trente secondes suffisent à
 * les réunir sans jamais réunir deux gares - il s'écoule au moins une minute
 * entre deux mélodies.
 */
let lastMelodyCue = { path: '', at: -1e9 };
const MELODY_CUE_DEBOUNCE_S = 30;

function cueMelody(path: string): void {
  const now = Tone.now();
  if (path === lastMelodyCue.path && now - lastMelodyCue.at < MELODY_CUE_DEBOUNCE_S) return;
  lastMelodyCue = { path, at: now };
  // Le nom de la composition quand elle en a un ; les mélodies principales
  // Inner/Outer n'en portent pas, et le sous-titre dira simplement qu'une
  // mélodie de départ sonne.
  soundCue('melody', melodyDefinitionForPath(path)?.displayName);
}

/** Arrête un clip lancé via playOnce (annulation de départ, urgence…). */
function stop(path: string): void {
  stopEpoch.set(path, (stopEpoch.get(path) ?? 0) + 1);
  const handle = activeByPath.get(path);
  if (!handle) return;
  activeByPath.delete(path);
  handle.stop();
}

/** Même chose, mais en fondu - coupure de la 発車メロディ par le chef de train. */
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
  soundCue('doorChime');
  void playClip('door-open', synthDoorChime);
}
export function doorCloseChime(): void {
  soundCue('doorChime');
  void playClip('door-close', synthDoorChime);
  // La purge d'air des vantaux, elle, n'appartient pas au carillon : c'est de
  // la mécanique, et elle ne sonne qu'à la fermeture. Elle reste donc dehors,
  // et joue même si un door-close.mp3 remplace le carillon.
  if (nodes) nodes.air.triggerAttackRelease(0.5, slot('air', Tone.now() + 0.5), 0.18);
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
// gare à l'autre : les oiseaux d'Uguisudani - dont le nom veut dire « vallée du
// rossignol » -, le timbre du tram à Ōtsuka, le passage feutré du monorail à
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
 * entre. La pluie sur le pavillon, elle, l'ignore - elle tombe sur le toit,
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
  // Sur le pavillon : rien tant qu'on est dehors, sur le quai - le toit sous
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
 * le retard - le son met trois secondes par kilomètre -, le niveau, et surtout
 * la PART DE CLAQUEMENT. Un coup lointain roule sans jamais claquer ; c'est ce
 * rapport-là qui dit la distance, pas le volume.
 */
export function playThunder(far: number): void {
  if (!nodes) return;
  soundCue('thunder');
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
