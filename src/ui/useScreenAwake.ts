// Brancher le verrou d'écran sur la durée du trajet.
//
// Le verrou lui-même vit dans systems/wakeLock ; ce crochet ne fait que le
// tenir tant que `active` est vrai, et le rendre à la sortie. Il est posé sur
// `App` et non dans l'une des deux versions du jeu : la 3D et la version sonore
// en ont besoin toutes les deux, pour des raisons différentes mais avec la même
// conséquence si on l'oublie.
//
// L'écouteur de visibilité est ICI, et non dans le module : redemander le jeton
// est une réaction à un événement du document, et le module n'a pas à savoir
// qu'il tourne dans un navigateur. On ne redemande qu'au RETOUR (la page
// masquée essuierait un refus, c'est le système qui a repris le jeton et il ne
// le rendra pas tant qu'on ne le regarde pas).

import { useEffect } from 'react';
import { screenAwake } from '../systems/wakeLock';

export function useScreenAwake(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    void screenAwake.wake();
    const onVisibility = (): void => {
      if (!document.hidden) void screenAwake.refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void screenAwake.sleep();
    };
  }, [active]);
}
