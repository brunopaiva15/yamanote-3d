// Les deux versions du jeu.
//
// `full` est l'expérience d'origine : on est DANS la rame, on marche, on
// regarde la ville défiler. `audio` est la même ligne, la même horloge, les
// mêmes annonces et la même sonorisation - mais sans une seule image de trois
// dimensions. Rien n'est simulé en moins côté son : la boucle tourne, les
// portes s'ouvrent, la 発車メロディ sonne, l'ATOS annonce l'approche. Ce qui
// disparaît est le rendu, et lui seul.
//
// Ce n'est pas un mode dégradé pour petite machine (la qualité vidéo s'en
// charge déjà, voir systems/perf) : c'est une autre façon d'écouter la ligne -
// et la seule qui marche sans WebGL, sur une machine qui n'en a pas, ou quand
// on veut simplement laisser tourner la Yamanote dans un onglet. Les
// SOUS-TITRES en sont la contrepartie : privé d'image, on doit pouvoir LIRE ce
// qui se dit, et c'est ce que fait systems/subtitles.
//
// Le choix se mémorise et s'écrit dans l'URL, exactement comme la langue
// (i18n/strings) : `?mode=audio` est partageable tel quel.

export type GameMode = 'full' | 'audio';

/** Ordre d'affichage dans le sélecteur du menu. */
export const GAME_MODES: readonly GameMode[] = ['full', 'audio'];

const STORAGE_KEY = 'yamanote.mode';

/** Nom du paramètre d'URL, aligné sur `LANG_PARAM`. */
export const MODE_PARAM = 'mode';

function isMode(value: string | null | undefined): value is GameMode {
  return value === 'full' || value === 'audio';
}

/**
 * Version imposée par l'URL, s'il y en a une.
 *
 * Une valeur inconnue est ignorée plutôt que corrigée : on ne devine pas ce
 * qu'un `?mode=radio` voulait dire.
 */
export function modeFromUrl(): GameMode | null {
  if (typeof location === 'undefined') return null;
  try {
    const value = new URL(location.href).searchParams.get(MODE_PARAM);
    return isMode(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * L'URL d'abord (explicite et partageable), puis le choix mémorisé, puis
 * l'expérience complète.
 *
 * Il n'y a PAS de détection automatique ici, et c'est volontaire : une machine
 * sans WebGL n'a pas demandé la version sonore, elle en a seulement besoin. Le
 * repli automatique appartient à l'écran d'échec du rendu (ui/RenderFailure),
 * qui sait, lui, que la toile a réellement refusé de démarrer.
 */
export function initialMode(): GameMode {
  const fromUrl = modeFromUrl();
  if (fromUrl) return fromUrl;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isMode(stored)) return stored;
  } catch {
    /* localStorage indisponible (mode privé, iframe cloisonnée) */
  }
  return 'full';
}

/** Mémorise le choix explicite du joueur. */
export function storeMode(mode: GameMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* le jeu reste jouable, la préférence ne survivra pas au rechargement */
  }
}

/**
 * Écrit (ou retire) `?mode=` dans la barre d'adresse, sans recharger.
 *
 * `full` RETIRE le paramètre au lieu de l'écrire : c'est le cas par défaut, et
 * une URL propre est celle qu'on partage. Seule la version sonore, qui n'est
 * pas ce qu'un visiteur obtient sans rien demander, mérite d'être nommée.
 */
export function applyModeToUrl(mode: GameMode): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const url = new URL(location.href);
    if (mode === 'full') url.searchParams.delete(MODE_PARAM);
    else url.searchParams.set(MODE_PARAM, mode);
    history.replaceState(history.state, '', url);
  } catch {
    /* URL non manipulable (about:blank, iframe cloisonnée) */
  }
}
