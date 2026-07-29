// Les deux ou trois choses que le jeu demande au navigateur lui-même, et qui
// ne sont ni de l'état, ni du rendu, ni du son.
//
// Elles vivent ensemble parce qu'elles sont réclamées des deux côtés de la
// frontière React : le HUD (`ui/Hud`) a un bouton plein écran, la boucle de
// contrôle (`three/Player`) a la touche F, et les deux doivent faire exactement
// la même chose — sinon l'une bascule quand l'autre ne fait qu'ouvrir.

/**
 * Le focus est-il dans un champ de saisie ?
 *
 * Un écouteur de touches posé sur `window` reçoit AUSSI ce que le joueur tape
 * dans le menu de départ et dans le HUD. Sans cette question, taper une date
 * coupait le son (M), passait le navigateur en plein écran (F) et empêchait
 * d'ouvrir un `<select>` (le `preventDefault` sur Espace) ; régler le volume aux
 * flèches faisait marcher le joueur de côté.
 *
 * `<select>` en fait partie : c'est là que se choisissent la gare, le sens et la
 * qualité, et Espace y a un sens qui n'est pas le nôtre.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

/**
 * Bascule le plein écran, dans les deux sens.
 *
 * `requestFullscreen` seul ne fait pas un interrupteur : une fois dedans, le
 * bouton du HUD restait affiché sans plus rien faire et la touche F non plus,
 * alors que le pense-bête du menu promet « F : plein écran ». Les refus sont
 * avalés : un iframe cloisonné ou une politique de navigateur n'a pas à
 * remonter dans la console du joueur.
 */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* refus silencieux (iframe, politique navigateur…) */
  }
}
