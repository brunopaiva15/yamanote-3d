// Les deux ou trois choses que le jeu demande au navigateur lui-même, et qui
// ne sont ni de l'état, ni du rendu, ni du son.
//
// Elles vivent ensemble parce qu'elles sont réclamées des deux côtés de la
// frontière React : le HUD (`ui/Hud`) a un bouton plein écran, la boucle de
// contrôle (`three/Player`) a la touche F, et les deux doivent faire exactement
// la même chose - sinon l'une bascule quand l'autre ne fait qu'ouvrir.

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
 * Le pointeur principal de cet appareil est-il un DOIGT ?
 *
 * Posée AVANT le premier contact, et c'est tout l'intérêt.
 *
 * L'interface tactile ne se détectait jusqu'ici qu'au premier `touchstart`
 * (`ui/Controls`). Sur un téléphone, la conséquence était voyante et a été
 * rapportée telle quelle : « le HUD, quand je clique dessus, il change
 * d'emplacement ». Le premier appui - sur n'importe quoi, y compris sur un
 * bouton du HUD - faisait apparaître le joystick et le gros bouton
 * « s'asseoir » du pouce, et disparaître le « s'asseoir » de la barre, qui ne
 * s'affiche qu'au clavier. La barre du bas se remettait donc entièrement en
 * page sous le doigt : les commandes changeaient de rangée, et celle qu'on
 * visait n'était plus là où on l'avait vue.
 *
 * `(pointer: coarse)` interroge le pointeur PRINCIPAL, et c'est exactement la
 * bonne question. Un portable à écran tactile a un trackpad pour pointeur
 * principal : il reste au clavier, comme aujourd'hui, et bascule seulement si
 * son propriétaire touche vraiment l'écran - la détection paresseuse de
 * `ui/Controls` reste en place pour lui. Un téléphone, lui, est reconnu dès la
 * première image, et plus rien ne bouge ensuite.
 *
 * `navigator.maxTouchPoints` ne conviendrait pas : il vaut aussi pour le
 * portable à écran tactile, qu'on enverrait alors au joystick sans qu'il ait
 * rien demandé.
 */
export function coarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Le plein écran existe-t-il ici ?
 *
 * Il n'existe pas partout : iPhone ne l'expose pas du tout, et une page en
 * iframe ne l'a que si son hôte l'autorise. Le HUD s'en sert pour ne pas
 * afficher un bouton mort - dans la barre du bas d'un téléphone, la place est
 * comptée.
 */
export function fullscreenAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof document.documentElement.requestFullscreen !== 'function') return false;
  return document.fullscreenEnabled !== false;
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
  await toggleFullscreenOf(document.documentElement);
}

/**
 * Le même interrupteur, sur un élément choisi.
 *
 * La version sonore s'en sert pour ne mettre en grand QUE l'afficheur de bord :
 * le plein écran du document montrerait la même page en plus large, alors que
 * ce qu'on veut voir en grand est la dalle, seule, sur du noir - comme un
 * écran de gare.
 *
 * Sortir se fait toujours par `document.exitFullscreen`, quel que soit
 * l'élément entré : c'est le document qui est en plein écran, l'élément n'est
 * que ce qu'on y montre.
 */
export async function toggleFullscreenOf(el: Element): Promise<void> {
  if (!fullscreenAvailable()) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  } catch {
    /* refus silencieux (iframe, politique navigateur…) */
  }
}
