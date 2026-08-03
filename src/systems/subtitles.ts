// Sous-titres : ce qui se DIT et ce qui SONNE, en texte.
//
// Le jeu parle beaucoup - deux sonorisations, quatre voix, une trentaine de
// gares - et jusqu'ici il fallait l'entendre pour le savoir. C'est acceptable
// dans l'expérience complète, où l'image dit déjà où l'on est ; ça ne l'est
// plus dans la version sonore (systems/gameMode), où il n'y a rien d'autre à
// regarder. Et ça ne l'a jamais été pour qui n'entend pas.
//
// Deux registres, comme au cinéma, et il ne faut pas les confondre :
//
//   • la PAROLE. Les annonces de bord et celles du quai, mot pour mot, dans la
//     langue où elles sont dites (japonais puis anglais, comme en vrai). Elles
//     sont poussées par systems/speech, qui est le seul endroit du jeu d'où
//     sort une voix - donc le seul crochet nécessaire, et un crochet qui ne
//     peut pas se désynchroniser : le texte affiché EST le texte du clip joué,
//     posé quand il commence et retiré quand il finit ;
//
//   • le SON. Le carillon des portes, la 発車メロディ, l'avertisseur d'une
//     baie palière, le tonnerre, la rame qui traverse en face. Ce sont les
//     [crochets] d'un sous-titrage pour sourds et malentendants : ils ne
//     transcrivent pas des mots, ils nomment un événement. Chacun s'efface
//     tout seul au bout de quelques secondes - un son n'a pas de fin qu'on
//     puisse guetter comme celle d'un clip.
//
// Enfin un JOURNAL, qui garde les dernières lignes avec l'heure et la gare :
// c'est ce que lit le tableau de bord de la version sonore, et c'est ce qui
// permet de rattraper une annonce qu'on n'a pas eu le temps de lire.
//
// Ce module ne dépend ni du moteur audio ni de la file de parole : ce sont eux
// qui l'appellent. Sans quoi le graphe d'imports se refermerait sur lui-même.

import { create } from 'zustand';

/** Qui parle : la sono de la rame, ou celle de la gare. */
export type SubtitleChannel = 'cabin' | 'platform';

/**
 * Les sons qu'on nomme.
 *
 * La liste est courte à dessein. Sous-titrer CHAQUE bruitage - un joint de
 * rail, un froissement de tissu, le souffle de la climatisation - remplirait
 * l'écran d'un texte que personne ne lit et noierait les trois ou quatre
 * signaux qui, eux, veulent dire quelque chose : le train part, la porte se
 * ferme, il faut descendre maintenant.
 */
export type SoundCue =
  /** ピンポーン : les portes de la rame, à l'ouverture comme à la fermeture. */
  | 'doorChime'
  /** Fa5–La5–Do6 qui monte : une baie palière s'ouvre. */
  | 'psdOpen'
  /** Mi5–Do5 qui descend : une baie palière va se fermer. */
  | 'psdClose'
  /** Le carillon ATOS, juste avant l'annonce d'approche. */
  | 'atosChime'
  /** 発車メロディ : la mélodie de départ du quai. */
  | 'melody'
  /** Le tonnerre. */
  | 'thunder'
  /** Une rame traverse sur la voie d'en face. */
  | 'passingTrain'
  /** Freinage d'urgence. */
  | 'emergencyBrake'
  /** Coupure de la caténaire : tout s'éteint. */
  | 'powerOutage';

/** Combien de temps un son reste nommé à l'écran (ms), faute de fin à guetter. */
const CUE_MS = 4000;

/** Longueur du journal : de quoi rattraper les deux ou trois dernières gares. */
const LOG_MAX = 40;

export interface SubtitleLine {
  /** Identité de la ligne : ce qui fait repartir une animation d'apparition. */
  id: number;
  text: string;
  lang: 'ja-JP' | 'en-US';
}

export interface SubtitleCue {
  id: number;
  cue: SoundCue;
  /** Précision libre (nom de mélodie, gare) déjà écrite dans sa langue. */
  detail?: string;
}

/** Une entrée du journal : ce qui a été dit ou sonné, et quand. */
export interface SubtitleLogEntry {
  id: number;
  /** `null` pour un son : il n'a pas de sonorisation d'origine. */
  channel: SubtitleChannel | null;
  cue?: SoundCue;
  text: string;
  lang?: 'ja-JP' | 'en-US';
  /** Horloge du monde au moment où la ligne est sortie (minutes depuis minuit). */
  clockMin: number;
}

interface SubtitleState {
  /** La ligne en cours sur chaque sonorisation, ou rien. */
  cabin: SubtitleLine | null;
  platform: SubtitleLine | null;
  /** Le dernier son nommé, tant qu'il n'a pas expiré. */
  cue: SubtitleCue | null;
  log: readonly SubtitleLogEntry[];
}

export const useSubtitles = create<SubtitleState>(() => ({
  cabin: null,
  platform: null,
  cue: null,
  log: [],
}));

let nextId = 1;
let cueTimer = 0;

/**
 * Horloge du monde, lue paresseusement.
 *
 * `runtime` n'est pas importé : ce module est appelé depuis le moteur audio et
 * depuis la file de parole, et un import de plus dans ce sens-là refermerait le
 * graphe. L'horloge est donc POUSSÉE par la boucle d'images - ou, à défaut,
 * reste à zéro, et le journal n'affiche pas d'heure.
 */
let clockMin = 0;

/** Appelée une fois par image par la boucle : l'heure qu'il est dans le monde. */
export function setSubtitleClock(minutes: number): void {
  clockMin = minutes;
}

function pushLog(entry: Omit<SubtitleLogEntry, 'clockMin'>): void {
  useSubtitles.setState((s) => {
    const log = [{ ...entry, clockMin }, ...s.log];
    return { log: log.length > LOG_MAX ? log.slice(0, LOG_MAX) : log };
  });
}

/**
 * Une annonce commence. Appelée par systems/speech au moment où le clip part,
 * donc parfaitement calée sur la voix.
 */
export function showSpeech(
  channel: SubtitleChannel,
  text: string,
  lang: 'ja-JP' | 'en-US',
): void {
  const line: SubtitleLine = { id: nextId++, text, lang };
  useSubtitles.setState({ [channel]: line } as Partial<SubtitleState>);
  pushLog({ id: line.id, channel, text, lang });
}

/** L'annonce est finie (ou coupée) : la ligne s'efface. */
export function clearSpeech(channel: SubtitleChannel): void {
  if (!useSubtitles.getState()[channel]) return;
  useSubtitles.setState({ [channel]: null } as Partial<SubtitleState>);
}

/**
 * Nomme un son. `detail` complète l'étiquette quand elle serait trop vague -
 * le nom d'une mélodie, la gare d'où part un train.
 *
 * Le libellé lui-même n'est PAS ici : il est dans le dictionnaire de la langue
 * courante (i18n), parce que c'est de l'interface et que ça se traduit. Ici on
 * ne pose que la nature de l'événement.
 */
export function soundCue(cue: SoundCue, detail?: string): void {
  const entry: SubtitleCue = { id: nextId++, cue, detail };
  useSubtitles.setState({ cue: entry });
  pushLog({ id: entry.id, channel: null, cue, text: detail ?? '' });
  if (typeof window === 'undefined') return;
  if (cueTimer) window.clearTimeout(cueTimer);
  cueTimer = window.setTimeout(() => {
    cueTimer = 0;
    // Ne retirer QUE si c'est toujours le nôtre : un son survenu entre-temps a
    // sa propre minuterie, et l'effacer ferait clignoter l'écran.
    if (useSubtitles.getState().cue?.id === entry.id) useSubtitles.setState({ cue: null });
  }, CUE_MS);
}

/** Vide tout : changement de version, retour au menu, fin de partie. */
export function resetSubtitles(): void {
  if (cueTimer && typeof window !== 'undefined') window.clearTimeout(cueTimer);
  cueTimer = 0;
  useSubtitles.setState({ cabin: null, platform: null, cue: null, log: [] });
}
