// Publier la hauteur réelle d'un élément flottant en variable CSS.
//
// Le HUD, le bandeau de sous-titres : tout ce qui est posé PAR-DESSUS la page
// occupe une hauteur que le reste doit connaître pour ne pas passer dessous. Et
// cette hauteur n'est pas calculable : elle dépend de la longueur des libellés
// traduits, donc de la langue, de la largeur de l'écran, du nombre de lignes
// qu'une annonce japonaise prend à cet instant. Un nombre écrit en dur serait
// faux dans deux langues sur trois, et faux à la première annonce longue.
//
// On la MESURE donc, et on la publie sur la racine du document : le CSS s'en
// sert dans ses `calc()`, sans rien savoir de React. C'est ce qui empêche deux
// « s'asseoir » de se recouvrir sur un téléphone, et le journal de la version
// sonore de passer sous les sous-titres.

import { useEffect, useRef } from 'react';

export function usePublishedHeight<T extends HTMLElement>(cssVar: string, active: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!active || !el) {
      root.style.removeProperty(cssVar);
      return;
    }
    const apply = () => {
      root.style.setProperty(cssVar, `${Math.round(el.getBoundingClientRect().height)}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(cssVar);
    };
  }, [cssVar, active]);
  return ref;
}
