// Point d'entrée i18n côté interface : le hook `useT()` renvoie le dictionnaire
// de la langue courante et re-rend le composant à chaque changement.

import { useStore } from '../store';
import { STRINGS, type Strings } from './strings';

export {
  LANGS,
  LANG_LABEL,
  LANG_SHORT,
  STRINGS,
  applyDocumentLang,
  detectBrowserLang,
  initialLang,
  storeLang,
  type Lang,
  type Strings,
} from './strings';

/** Dictionnaire de la langue courante. */
export function useT(): Strings {
  return useStore((s) => STRINGS[s.lang]);
}
