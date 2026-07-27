// Sélecteur de langue : trois pastilles (FR / EN / 日本語). La langue de départ
// vient de la détection automatique (navigator.languages) ; un clic ici fige un
// choix explicite, mémorisé pour les visites suivantes.

import { useStore } from '../store';
import { LANGS, LANG_LABEL, LANG_SHORT, useT } from '../i18n';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const t = useT();

  return (
    <div className={`lang-switch ${className}`.trim()} role="group" aria-label={t.language}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          className={`lang-option${code === lang ? ' lang-option-active' : ''}`}
          onClick={() => setLang(code)}
          lang={code}
          title={LANG_LABEL[code]}
          aria-label={LANG_LABEL[code]}
          aria-pressed={code === lang}
        >
          {LANG_SHORT[code]}
        </button>
      ))}
    </div>
  );
}
