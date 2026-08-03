// État global (zustand) : uniquement l'état discret, à faible fréquence de
// changement. Les valeurs continues (vitesse, distance, portes) vivent dans
// systems/runtime.ts et sont mutées chaque frame sans re-render React.

import { create } from 'zustand';
import { CONFIG } from './data/config';
import type { LoopDirection } from './data/platforms';
import { DOOR_SIDE } from './data/stations';
import { applyDocumentLang } from './i18n/documentMeta';
import { initialLang, storeLang, type Lang } from './i18n/strings';
import { applyModeToUrl, initialMode, storeMode, type GameMode } from './systems/gameMode';

export type Phase = 'cruise' | 'brake' | 'dwell' | 'depart';

/**
 * Ce qu'on a dans la main.
 *
 * Un seul objet à la fois, et c'est voulu : on ne se promène pas sur un quai
 * avec trois canettes. `sips` descend à chaque gorgée ; à zéro l'objet est vide
 * et ne sert plus qu'à être jeté - ce qui est très exactement le parcours d'une
 * canette de gare, du volet de retrait au bac de tri trois mètres plus loin.
 */
export interface HeldItem {
  productId: string;
  /** Gorgées restantes. */
  sips: number;
  /** Contenance d'origine, pour le niveau visible dans une bouteille. */
  maxSips: number;
  /** Décapsulée / décachetée : le premier appui ouvre, le second boit. */
  opened: boolean;
}

/**
 * Le titre de transport en poche.
 *
 * Deux formes, comme en vrai : la carte IC rechargeable, et le petit billet
 * magnétique acheté au distributeur pour un tarif donné. La carte se garde, le
 * billet est avalé par le portique de sortie.
 */
export interface Pocket {
  /** Le joueur possède une carte IC (Suica-like), et son solde en yens. */
  ic: boolean;
  icBalance: number;
  /** Billet magnétique en cours, avec son tarif et la gare où il a été acheté. */
  ticket: { fare: number; from: number } | null;
  /** Le joueur est-il DANS la zone payante ? Posé par le portique d'entrée. */
  insideGate: boolean;
  /**
   * Gare où le trajet en cours a commencé, ou null.
   *
   * C'est ce que retient une carte IC entre l'entrée et la sortie, et c'est la
   * seule donnée qui permette au portique de sortie de calculer un tarif plutôt
   * que d'en inventer un.
   */
  entry: number | null;
}

interface AppState {
  started: boolean;
  muted: boolean;
  volume: number;
  index: number; // station suivante (en roulant) ou courante (à quai)
  /**
   * Gare dont le quai est physiquement là, autour de la rame. Égal à `index`
   * sauf pendant le départ : `index` avance vers la gare suivante dès l'entrée
   * en `depart`, alors que le quai qu'on longe encore - géométrie, palette,
   * signalétique - reste celui de la gare quittée, jusqu'à être hors de vue.
   */
  platformIndex: number;
  phase: Phase;
  doorSide: 1 | -1;
  /**
   * Sens de circulation. Posé une fois par `randomizeEntry` au moment de
   * monter - choisi au menu, ou tiré à pile ou face - et constant ensuite : on
   * ne se retourne pas en cours de boucle, on descend et on change de quai.
   * La valeur initiale ci-dessous n'est qu'un défaut avant embarquement.
   */
  loopDirection: LoopDirection;
  seated: boolean;
  /** Le joueur est descendu sur le quai (état discret, pour le HUD). */
  onPlatform: boolean;
  touch: boolean; // interface tactile active
  /** Langue de l'interface : détectée au premier lancement, puis mémorisée. */
  lang: Lang;
  /**
   * Version du jeu : l'expérience complète, ou la version sonore sans 3D.
   *
   * Posé AVANT d'embarquer et constant ensuite : ce n'est pas un réglage
   * d'affichage qu'on pousse en cours de trajet comme la qualité vidéo, c'est
   * le choix de ce qu'on lance - deux racines de rendu différentes, deux
   * boucles d'images différentes. Changer d'avis se fait en revenant au menu.
   */
  mode: GameMode;
  /**
   * Sous-titres à l'écran. Vrais par défaut dans la version sonore, où ils
   * sont la seule façon de lire ce qui se dit ; disponibles aussi dans
   * l'expérience complète, où ils doublent les annonces.
   */
  subtitles: boolean;
  /**
   * Le joueur a-t-il touché lui-même au réglage des sous-titres ?
   *
   * Tant que non, ils suivent la version choisie (allumés en sonore, éteints
   * en complet). Dès qu'il en décide, son choix tient : changer de version ne
   * doit pas rallumer un bandeau qu'il vient d'éteindre.
   */
  subtitlesPinned: boolean;

  /** Espèces en poche, en yens : ce qu'on glisse dans un monnayeur. */
  cash: number;
  pocket: Pocket;
  /** L'objet tenu en main, ou rien. */
  held: HeldItem | null;

  start: () => void;
  setLang: (l: Lang) => void;
  setMode: (m: GameMode) => void;
  setSubtitles: (b: boolean) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  setPhase: (p: Phase) => void;
  setIndex: (i: number) => void;
  setPlatformIndex: (i: number) => void;
  setDoorSide: (s: 1 | -1) => void;
  setLoopDirection: (d: LoopDirection) => void;
  setSeated: (b: boolean) => void;
  setOnPlatform: (b: boolean) => void;
  setTouch: (b: boolean) => void;
  setCash: (v: number) => void;
  setPocket: (p: Pocket) => void;
  setHeld: (h: HeldItem | null) => void;
}

/**
 * Ce qu'on a sur soi en montant.
 *
 * Trois mille yens en espèces et une carte IC déjà chargée : c'est ce qu'a
 * n'importe qui dans le train, et surtout c'est ce qu'il faut pour que la
 * première machine devant laquelle on passe SERVE À QUELQUE CHOSE. Un jeu qui
 * commence sans un yen ferait de l'achat une corvée avant d'en faire un geste.
 */
const START_CASH = 3000;
const START_IC = 1480;

const START_LANG = initialLang();
applyDocumentLang(START_LANG);

// La version demandée est connue avant tout montage : c'est elle qui décide
// quel morceau de code sera téléchargé au clic sur « Monter à bord », et le
// menu doit donc pouvoir l'afficher dès la première image.
const START_MODE = initialMode();

export const useStore = create<AppState>((set) => ({
  started: false,
  muted: false,
  volume: 0.8,
  index: CONFIG.startIndex,
  platformIndex: CONFIG.startIndex,
  // Valeurs par défaut avant boarding ; randomizeEntry() les remplace.
  phase: 'cruise',
  doorSide: DOOR_SIDE[CONFIG.startIndex],
  loopDirection: 'inner',
  seated: false,
  onPlatform: false,
  touch: false,
  lang: START_LANG,
  mode: START_MODE,
  // Dans la version sonore, ils sont l'image : allumés d'office. Dans
  // l'expérience complète, la scène dit déjà où l'on est, et un bandeau de
  // texte permanent lui passerait devant - éteints, à rallumer au HUD.
  subtitles: START_MODE === 'audio',
  subtitlesPinned: false,
  cash: START_CASH,
  // On monte déjà passé les portiques : c'est bien le cas de quelqu'un assis
  // dans la rame, et sortir en gare demandera donc de valider à la sortie.
  pocket: { ic: true, icBalance: START_IC, ticket: null, insideGate: true, entry: null },
  held: null,

  start: () => {
    // L'horloge et la date sont posées par StartScreen.board() (heure réelle
    // à Tokyo, ou celle choisie avant de monter). On ne les écrase pas ici.
    //
    // La carte IC, elle, retient d'où l'on part : on monte déjà validé, et
    // c'est cette gare-là que le portique de sortie facturera. Sans elle, la
    // première sortie du jeu se serait payée au tarif minimum quel que soit le
    // chemin parcouru.
    set((s) => ({ started: true, pocket: { ...s.pocket, entry: s.index } }));
  },
  setLang: (lang) => {
    storeLang(lang);
    // Choix explicite : l'URL prend `?lang=…` et devient partageable telle
    // quelle (voir applyDocumentLang).
    applyDocumentLang(lang, true);
    set({ lang });
  },
  setMode: (mode) => {
    storeMode(mode);
    // Comme la langue : le choix explicite devient partageable tel quel.
    applyModeToUrl(mode);
    // Les sous-titres suivent la version tant que le joueur ne les a pas
    // réglés lui-même : passer en version sonore sans eux ouvrirait sur un
    // écran qui ne dit rien de ce qu'on entend.
    set((s) => ({ mode, subtitles: s.subtitlesPinned ? s.subtitles : mode === 'audio' }));
  },
  setSubtitles: (subtitles) => set({ subtitles, subtitlesPinned: true }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setVolume: (volume) => set({ volume }),
  setPhase: (phase) => set({ phase }),
  setIndex: (index) => set({ index }),
  setPlatformIndex: (platformIndex) => set({ platformIndex }),
  setDoorSide: (doorSide) => set({ doorSide }),
  setLoopDirection: (loopDirection) => set({ loopDirection }),
  setSeated: (seated) => set({ seated }),
  setOnPlatform: (onPlatform) => set({ onPlatform }),
  setTouch: (touch) => set({ touch }),
  setCash: (cash) => set({ cash }),
  setPocket: (pocket) => set({ pocket }),
  setHeld: (held) => set({ held }),
}));
