// La charge du fil audio, et ce qu'on lui retire quand il n'y arrive plus.
//
// Le son de ce jeu est SYNTHÉTISÉ, presque entièrement : une trentaine de
// générateurs, une vingtaine de filtres, dix-neuf sources spatialisées et deux
// réverbérations à convolution tournent dans le fil de rendu audio du
// navigateur - un fil temps réel, qui doit remplir son tampon toutes les deux
// ou trois millisecondes et n'a pas le droit d'être en retard une seule fois.
// Quand il l'est, on ne perd pas « un peu de qualité » : le tampon sort vide,
// et cela s'entend comme un craquement, un hoquet, un grésillement. C'est le
// défaut le plus insupportable qu'un jeu sonore puisse avoir, parce qu'il ne
// ressemble à rien de ce que le monde représenté pourrait produire.
//
// Sur une machine confortable, la marge est telle qu'on ne l'atteint jamais.
// Sur une machine modeste - un portable de bureau, une puce sans ventilateur,
// un navigateur qui partage deux cœurs avec le rendu 3D - elle est atteinte
// couramment. Ce module est ce qui décide, pour cette machine-ci, jusqu'où le
// moteur va.
//
// Trois paliers, du plus riche au plus sûr :
//
//   • `full`     : tout, tel que le moteur a été réglé. Panoramique HRTF (une
//                  convolution d'oreille par source), les deux réverbérations,
//                  le plus petit tampon de sortie.
//   • `reduced`  : le même mixage, la même partition, les mêmes niveaux - mais
//                  le panoramique passe en puissance constante (la direction
//                  reste, la coloration d'oreille part), le tampon de sortie
//                  double, et l'anticipation de programmation s'allonge pour
//                  qu'une image longue ne fasse plus arriver un son en retard.
//   • `minimal`  : en plus, les deux réverbérations sont coupées et le nombre
//                  de bruitages de foule par seconde est borné. Le lieu sonne
//                  plus sec ; il sonne, et sans un craquement.
//
// Ce qui NE CHANGE À AUCUN PALIER : la partition, les niveaux, les durées, les
// voix, ce qui est dit et quand. Un palier bas n'est pas une version pauvre de
// la ligne, c'est la même ligne dans une pièce moins réverbérante.
//
// Le palier se décide de trois façons, dans cet ordre :
//
//   1. le joueur, s'il a choisi (écran de démarrage) ;
//   2. la machine, à vue de nez, avant même d'avoir joué une note (nombre de
//      cœurs, mémoire, téléphone) - c'est ce qui permet d'ouvrir le contexte
//      audio avec le BON tampon dès la première note, ce qu'aucune mesure ne
//      pourra plus faire ensuite : la taille du tampon se fige à la création du
//      contexte ;
//   3. la mesure, en cours de route (voir `LoadWatch`). Chrome sait dire
//      combien de temps son fil audio a passé à calculer et combien de fois il
//      a raté son tampon (`AudioContext.renderCapacity`) : on ne devine plus, on
//      LIT le grésillement, et on descend d'un cran dès qu'il apparaît. Là où
//      cette mesure n'existe pas, on se rabat sur la cadence d'images, qui dit
//      la même chose de plus loin.
//
// Le palier atteint est MÉMORISÉ. Une machine qui a grésillé une fois ouvrira
// son prochain contexte avec le grand tampon, et n'aura pas à regrésiller pour
// le mériter. On ne remonte jamais tout seul en cours de partie : un moteur qui
// oscillerait entre deux paliers ferait entendre ses hésitations.

import { create } from 'zustand';

export type AudioTier = 'full' | 'reduced' | 'minimal';

/** Du plus riche au plus sûr. */
export const AUDIO_TIERS: readonly AudioTier[] = ['full', 'reduced', 'minimal'];

/** Ce que le joueur peut demander : `auto` laisse la machine décider. */
export type AudioPref = 'auto' | AudioTier;

export const AUDIO_PREFS: readonly AudioPref[] = ['auto', 'full', 'reduced', 'minimal'];

export function tierRank(tier: AudioTier): number {
  return AUDIO_TIERS.indexOf(tier);
}

/** Le cran du dessous, ou le même s'il n'y en a plus. */
export function lowerTier(tier: AudioTier): AudioTier {
  return AUDIO_TIERS[Math.min(AUDIO_TIERS.length - 1, tierRank(tier) + 1)];
}

/** Le plus prudent des deux. */
export function safestTier(a: AudioTier, b: AudioTier): AudioTier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

// --- Ce que la machine dit d'elle-même ------------------------------------

export interface DeviceProbe {
  /** `navigator.hardwareConcurrency`, ou 0 si le navigateur se tait. */
  cores: number;
  /** `navigator.deviceMemory` en Go, ou 0. */
  memory: number;
  mobile: boolean;
}

/**
 * Le palier d'ouverture, avant d'avoir joué une seule note.
 *
 * C'est un pari, et il est délibérément PRUDENT : se tromper vers le bas coûte
 * une coloration d'oreille que personne ne réclame ; se tromper vers le haut
 * coûte trente secondes de grésillement avant que la mesure ne rattrape, et
 * c'est trente secondes de trop. Le tampon de sortie, lui, ne se rattrape pas
 * du tout - il est fixé à la création du contexte -, et c'est la vraie raison
 * de ce pari : il faut le demander grand AVANT de savoir.
 *
 * Deux cœurs ou moins : la machine n'a pas de quoi tenir un fil audio serré à
 * côté d'un rendu 3D, quel que soit son âge. Quatre cœurs avec 4 Go : c'est le
 * portable de bureau ordinaire, celui qui grésille. Un téléphone tient
 * étonnamment bien le son (sa puce est bien plus récente que le portable), mais
 * son navigateur lui rogne les tampons pour économiser la batterie : on lui
 * donne le palier intermédiaire.
 */
export function deviceTier(probe: DeviceProbe): AudioTier {
  const { cores, memory, mobile } = probe;
  if (cores > 0 && cores <= 2) return 'minimal';
  if (memory > 0 && memory <= 2) return 'minimal';
  if (cores > 0 && cores <= 4) return 'reduced';
  if (memory > 0 && memory <= 4) return 'reduced';
  if (mobile) return 'reduced';
  return 'full';
}

/** Ce que le navigateur veut bien dire de la machine. */
export function probeDevice(): DeviceProbe {
  if (typeof navigator === 'undefined') return { cores: 0, memory: 0, mobile: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse) and (hover: none)').matches;
  return {
    cores: Math.max(0, nav.hardwareConcurrency ?? 0),
    memory: Math.max(0, nav.deviceMemory ?? 0),
    mobile,
  };
}

// --- Ce que chaque palier change ------------------------------------------

export interface ContextSettings {
  /**
   * Taille du tampon de sortie, dite au navigateur en termes de latence.
   *
   * C'est le réglage le plus efficace de tout ce module, et de loin. Un tampon
   * « interactive » fait cent vingt-huit échantillons : le fil audio a moins de
   * trois millisecondes pour tout calculer, et le moindre à-coup - un ramassage
   * de miettes, une texture qui monte au GPU, un onglet voisin qui s'anime -
   * le fait rater son échéance. Un tampon « playback » en fait dix à vingt
   * fois plus : la même machine dispose alors de dizaines de millisecondes
   * d'avance, et le même à-coup passe inaperçu.
   *
   * Ce qu'on paie : le délai entre un geste et le son qu'il produit. Ici,
   * presque rien n'est joué par le joueur - un bouton de distributeur, un
   * portillon -, et le reste (annonces, mélodies, roulement, foule) est du monde
   * qui tourne tout seul. Vingt millisecondes de plus sur un ピッ de portillon
   * ne s'entendent pas ; un craquement, si.
   */
  latencyHint: AudioContextLatencyCategory;
  /**
   * Anticipation de programmation de Tone (s) : de combien `Tone.now()` est en
   * avance sur l'horloge du contexte.
   *
   * L'autre cause de hoquet sur machine lente, et elle n'a rien à voir avec le
   * tampon : les sons sont programmés depuis la boucle d'images, sur le fil
   * principal. Si une image dure deux cents millisecondes et que l'anticipation
   * n'en couvre que cent, l'instant demandé est déjà passé quand le navigateur
   * le reçoit - Web Audio le ramène à « maintenant », et une attaque qui devait
   * tomber sur un temps tombe où elle peut. Trois carillons de porte qui se
   * tassent, une paire d'avertisseur qui boite : ce n'est plus du grésillement,
   * c'est du bégaiement, et c'est tout aussi insupportable.
   *
   * On donne donc à l'anticipation de quoi couvrir une image longue.
   */
  lookAhead: number;
  /** Cadence de l'horloge interne de Tone (s) : un réveil de moins par image. */
  updateInterval: number;
}

export function contextSettings(tier: AudioTier): ContextSettings {
  if (tier === 'minimal') {
    return { latencyHint: 'playback', lookAhead: 0.3, updateInterval: 0.12 };
  }
  if (tier === 'reduced') {
    return { latencyHint: 'playback', lookAhead: 0.2, updateInterval: 0.08 };
  }
  return { latencyHint: 'interactive', lookAhead: 0.1, updateInterval: 0.05 };
}

/**
 * Le modèle de panoramique des sources spatialisées.
 *
 * HRTF convolue, par source et par échantillon, la paire de réponses d'oreille
 * qui correspond à la direction : c'est ce qui fait qu'un diffuseur au-dessus
 * de la tête s'entend au-dessus de la tête, et c'est aussi, à dix-neuf sources,
 * le plus gros poste de calcul du moteur. « equalpower » garde la DIRECTION -
 * gauche, droite, devant, derrière par le niveau, et toute l'atténuation de
 * distance - et abandonne la hauteur et la coloration de pavillon. Sur un
 * portable, entre l'un et l'autre, il n'y a pas photo : entre l'un et le
 * grésillement non plus.
 */
export function panningModelFor(tier: AudioTier): PanningModelType {
  return tier === 'full' ? 'HRTF' : 'equalpower';
}

/** Les réverbérations à convolution tiennent-elles encore ? */
export function reverbEnabled(tier: AudioTier): boolean {
  return tier !== 'minimal';
}

/**
 * Combien de bruitages de foule par seconde au plus.
 *
 * Un wagon plein et un quai bondé peuvent déclencher, dans la même seconde, une
 * dizaine d'éternuements, de sacs froissés et de semelles - chacun programmant
 * trois ou quatre enveloppes. Aucune oreille ne les distingue ; le fil audio,
 * lui, les calcule tous. On plafonne, et ce qui déborde est simplement écarté :
 * personne n'entend le froissement de sac qui n'a pas eu lieu.
 */
export function sfxPerSecond(tier: AudioTier): number {
  if (tier === 'minimal') return 7;
  if (tier === 'reduced') return 14;
  return Number.POSITIVE_INFINITY;
}

/**
 * Budget de PCM décodé gardé en mémoire (octets).
 *
 * Sur une machine à quatre gigaoctets, vingt-quatre mégaoctets de son décodé
 * pèsent sur le ramasse-miettes, et un ramassage qui bloque le fil principal
 * finit toujours par s'entendre. Les clips évincés se retéléchargent depuis le
 * cache HTTP du navigateur : on échange de la mémoire contre un décodage.
 */
export function clipCacheBytes(tier: AudioTier): number {
  if (tier === 'minimal') return 8 * 1024 * 1024;
  if (tier === 'reduced') return 14 * 1024 * 1024;
  return 24 * 1024 * 1024;
}

// --- La mesure ------------------------------------------------------------

/**
 * Un relevé du fil audio.
 *
 * `underrunRatio` est la part des tampons SORTIS VIDES depuis le relevé
 * précédent : c'est le grésillement lui-même, chiffré. `averageLoad` et
 * `peakLoad` sont la part du temps disponible réellement passée à calculer -
 * à 1,0 le fil n'a plus une microseconde de marge.
 */
export interface LoadSample {
  underrunRatio: number;
  averageLoad: number;
  peakLoad: number;
}

/** Un tampon vide, c'est déjà un craquement : on ne discute pas au-delà. */
const UNDERRUN_ALARM = 0.02;
/** Un seul tampon raté peut arriver au montage du graphe ; deux, non. */
const UNDERRUN_STRIKES = 2;
/** Au-dessus, la moindre bourrasque fera rater le tampon suivant. */
const LOAD_ALARM = 0.68;
const LOAD_STRIKES = 3;
/** Une pointe à ce niveau a frôlé le vide, même si la moyenne est tranquille. */
const PEAK_ALARM = 0.92;
const PEAK_STRIKES = 2;
/** Les alertes s'oublient : un à-coup isolé ne doit pas s'additionner à celui d'il y a une minute (s). */
const STRIKE_MEMORY = 12;
/** Après une descente, le temps de la laisser produire son effet (s). */
const DOWNGRADE_COOLDOWN = 8;

/**
 * Le juge : il reçoit les relevés et dit quand il faut descendre d'un cran.
 *
 * Pur, sans horloge à lui ni effet de bord - c'est ce qui le rend vérifiable
 * sans navigateur (tests/audioLoad.test.ts).
 */
export class LoadWatch {
  private underruns: number[] = [];
  private loads: number[] = [];
  private peaks: number[] = [];
  private lastDowngrade = -Infinity;

  /**
   * @returns `true` s'il faut descendre d'un palier maintenant.
   */
  push(now: number, sample: LoadSample): boolean {
    this.remember(this.underruns, now, sample.underrunRatio >= UNDERRUN_ALARM);
    this.remember(this.peaks, now, sample.peakLoad >= PEAK_ALARM);
    // La charge moyenne ne compte que si elle est SOUTENUE : on garde les
    // relevés consécutifs, et un seul relevé calme remet le compteur à zéro.
    if (sample.averageLoad >= LOAD_ALARM) this.loads.push(now);
    else this.loads.length = 0;

    if (now - this.lastDowngrade < DOWNGRADE_COOLDOWN) return false;

    // Un tampon franchement raté n'attend pas la confirmation : c'est déjà
    // audible, et c'est exactement ce qu'on est venu supprimer.
    const severe = sample.underrunRatio >= UNDERRUN_ALARM * 5;
    const down =
      severe ||
      this.underruns.length >= UNDERRUN_STRIKES ||
      this.loads.length >= LOAD_STRIKES ||
      this.peaks.length >= PEAK_STRIKES;
    if (!down) return false;
    this.lastDowngrade = now;
    this.underruns.length = 0;
    this.loads.length = 0;
    this.peaks.length = 0;
    return true;
  }

  private remember(list: number[], now: number, hit: boolean): void {
    while (list.length > 0 && now - list[0] > STRIKE_MEMORY) list.shift();
    if (hit) list.push(now);
  }
}

// --- La cadence d'images, pour les navigateurs qui ne mesurent rien -------

/**
 * Là où `renderCapacity` n'existe pas (Firefox, Safari), on n'a pas de vue sur
 * le fil audio. Reste la cadence d'images du fil principal : elle ne dit pas la
 * même chose, mais elle dit quelque chose de vrai - une machine qui n'arrive
 * plus à sortir dix images par seconde partage ses cœurs avec un fil audio qui,
 * lui non plus, n'y arrive plus. Et la programmation des sons vient de cette
 * boucle-là : sous cette cadence, elle arrive de toute façon en retard.
 */
const SLOW_FRAME_MS = 90;
/** Il faut que ça dure : une image longue isolée est un chargement, pas une machine lente. */
const SLOW_FRAME_WINDOW = 5;
const SLOW_FRAME_SHARE = 0.5;

/**
 * Traduit une fenêtre d'images en relevé de charge, pour le même juge.
 *
 * On ne prétend pas mesurer le fil audio : on lui prête la peine du fil
 * principal, ce qui suffit à déclencher la descente là où elle est utile.
 */
export function frameLoadSample(slowShare: number): LoadSample {
  const load = Math.max(0, Math.min(1, slowShare));
  return { underrunRatio: 0, averageLoad: load >= SLOW_FRAME_SHARE ? 1 : 0, peakLoad: 0 };
}

/** Dernières durées d'image (ms), fenêtre glissante. */
const frames: { at: number; ms: number }[] = [];
let frameSum = 0;

/**
 * Une image vient de passer. Appelé par les deux boucles du jeu (three/Engine
 * et systems/audioLoop) : c'est la seule mesure de temps que ce module possède
 * en propre.
 */
export function noteFrame(seconds: number): void {
  if (!(seconds > 0) || seconds > 5) return;
  const at = nowSeconds();
  frames.push({ at, ms: seconds * 1000 });
  frameSum += seconds;
  while (frames.length > 0 && at - frames[0].at > SLOW_FRAME_WINDOW) {
    frameSum -= frames[0].ms / 1000;
    frames.shift();
  }
}

/** Part des images de la fenêtre qui ont dépassé le seuil de lenteur. */
export function slowFrameShare(): number {
  if (frames.length < 8) return 0;
  let slow = 0;
  for (const f of frames) if (f.ms >= SLOW_FRAME_MS) slow++;
  return slow / frames.length;
}

/**
 * Durée d'image récente (s), pour les boucles qui doivent programmer du son
 * au-delà de la prochaine image (voir `pumpPsdCloseWarning`). Bornée : ce n'est
 * pas parce qu'une image a duré deux secondes qu'il faut programmer deux
 * secondes de signal d'avance.
 */
export function recentFrameSeconds(): number {
  if (frames.length === 0) return 0;
  return Math.min(0.35, frameSum / frames.length);
}

// --- Le palier courant, et sa mémoire -------------------------------------

const PREF_KEY = 'yamanote.audioQuality';
/** Le palier auquel cette machine est descendue, la dernière fois qu'elle a joué. */
const FLOOR_KEY = 'yamanote.audioFloor';

function isTier(v: string | null | undefined): v is AudioTier {
  return (AUDIO_TIERS as readonly string[]).includes(v ?? '');
}

function isPref(v: string | null | undefined): v is AudioPref {
  return (AUDIO_PREFS as readonly string[]).includes(v ?? '');
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* le jeu reste jouable, la préférence ne survivra pas au rechargement */
  }
}

function storedPref(): AudioPref {
  const v = readStored(PREF_KEY);
  return isPref(v) ? v : 'auto';
}

function storedFloor(): AudioTier | null {
  const v = readStored(FLOOR_KEY);
  return isTier(v) ? v : null;
}

interface AudioLoadState {
  /** Ce que le joueur a demandé. */
  pref: AudioPref;
  /** Ce qui tourne réellement. */
  tier: AudioTier;
  /** Le moteur est-il descendu tout seul depuis le début de la session ? */
  lowered: boolean;
}

export const useAudioLoad = create<AudioLoadState>(() => ({
  pref: storedPref(),
  tier: 'full',
  lowered: false,
}));

export function audioTier(): AudioTier {
  return useAudioLoad.getState().tier;
}

export function audioPref(): AudioPref {
  return useAudioLoad.getState().pref;
}

/**
 * Le palier avec lequel OUVRIR le contexte audio.
 *
 * Appelé une fois, juste avant la création du graphe : c'est là, et seulement
 * là, que la taille du tampon de sortie se décide. Un choix explicite du joueur
 * prime ; sinon on prend le plus prudent entre ce que la machine annonce et ce
 * qu'elle a déjà prouvé lors d'une visite précédente.
 */
export function openingTier(): AudioTier {
  const pref = storedPref();
  const tier =
    pref === 'auto'
      ? safestTier(deviceTier(probeDevice()), storedFloor() ?? 'full')
      : pref;
  useAudioLoad.setState({ pref, tier, lowered: false });
  return tier;
}

/** Choix du joueur. Il ne prend effet qu'au prochain embarquement (voir plus bas). */
export function setAudioPref(pref: AudioPref): void {
  writeStored(PREF_KEY, pref);
  useAudioLoad.setState({ pref });
}

// --- La surveillance en cours de partie -----------------------------------

/** Intervalle des relevés (s). */
const SAMPLE_PERIOD = 1;

let watching = false;

/**
 * Ouvre la surveillance du fil audio, et descend d'un palier quand il peine.
 *
 * @param context  le contexte natif, s'il est accessible : c'est lui qui porte
 *                 `renderCapacity`.
 * @param apply    ce que le moteur fait d'un nouveau palier (voir
 *                 systems/audioEngine.applyAudioTier).
 */
export function watchAudioLoad(
  context: BaseAudioContext | null,
  apply: (tier: AudioTier) => void,
): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const watch = new LoadWatch();

  const down = (at: number): void => {
    const { tier, pref } = useAudioLoad.getState();
    // Un palier CHOISI par le joueur n'est pas discuté : il a demandé « tout »,
    // il garde tout, même si sa machine tousse. On ne descend d'office que ce
    // qu'on a soi-même monté.
    if (pref !== 'auto') return;
    const next = lowerTier(tier);
    if (next === tier) return;
    useAudioLoad.setState({ tier: next, lowered: true });
    writeStored(FLOOR_KEY, next);
    apply(next);
    void at;
  };

  const capacity = renderCapacityOf(context);
  if (capacity) {
    capacity.onupdate = (event: RenderCapacityEvent) => {
      if (
        watch.push(nowSeconds(), {
          underrunRatio: event.underrunRatio ?? 0,
          averageLoad: event.averageLoad ?? 0,
          peakLoad: event.peakLoad ?? 0,
        })
      ) {
        down(nowSeconds());
      }
    };
    try {
      capacity.start({ updateInterval: SAMPLE_PERIOD });
      return;
    } catch {
      /* le navigateur l'annonce sans savoir le faire : on retombe plus bas */
    }
  }

  // Pas de mesure du fil audio : la cadence d'images fera l'affaire.
  window.setInterval(() => {
    if (watch.push(nowSeconds(), frameLoadSample(slowFrameShare()))) down(nowSeconds());
  }, SAMPLE_PERIOD * 1000);
}

// `AudioRenderCapacity` n'est typé nulle part encore : on décrit ce qu'on lit.
interface RenderCapacityEvent {
  averageLoad?: number;
  peakLoad?: number;
  underrunRatio?: number;
}

interface RenderCapacityLike {
  start: (options: { updateInterval: number }) => void;
  onupdate: ((event: RenderCapacityEvent) => void) | null;
}

function renderCapacityOf(context: BaseAudioContext | null): RenderCapacityLike | null {
  if (!context) return null;
  const holder = context as unknown as { renderCapacity?: RenderCapacityLike };
  const capacity = holder.renderCapacity;
  return capacity && typeof capacity.start === 'function' ? capacity : null;
}

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000;
}
