// Point d'entrée i18n côté interface : le hook `useT()` renvoie le dictionnaire
// de la langue courante et re-rend le composant à chaque changement.

import { useStore } from '../store';
import { STRINGS, type Strings } from './strings';

export {
  LANGS,
  LANG_LABEL,
  LANG_PARAM,
  LANG_SHORT,
  STRINGS,
  detectBrowserLang,
  initialLang,
  langFromUrl,
  storeLang,
  type Lang,
  type Strings,
} from './strings';

export { applyDocumentLang, canonicalFor } from './documentMeta';

/** Dictionnaire de la langue courante. */
export function useT(): Strings {
  return useStore((s) => STRINGS[s.lang]);
}
