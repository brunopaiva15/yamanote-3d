// Entrées unifiées : clavier + joystick tactile + regard. Les axes clavier et
// joystick sont additionnés (jamais écrasés), le regard est un delta accumulé
// consommé par la caméra à chaque frame.

export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0 }, // joystick tactile, -1..1
  lookDX: 0,
  lookDY: 0, // deltas de regard accumulés (pixels)
  sitRequest: false, // demande s'asseoir / se lever (bouton tactile ou clic)
  standRequest: false, // demande se lever (espace)
  /** Demande d'adresser la parole au voyageur qu'on a en face (E, ou bouton tactile). */
  talkRequest: false,
};

// Axes de déplacement combinés (clavier physique : codes → AZERTY et QWERTY
// fonctionnent tous les deux, ZQSD comme WASD).
export function moveAxes(): { x: number; y: number } {
  const k = input.keys;
  let x = 0;
  let y = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  x += input.joy.x;
  y += input.joy.y;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

/** Course du manche tactile, en pixels : au-delà, l'axe est à fond. */
export const JOY_RADIUS = 52;
/** Zone morte, en pixels : un pouce posé n'est jamais tout à fait immobile. */
export const JOY_DEAD = 5;

/**
 * Axes du joystick tactile, à partir de l'écart AU POINT D'APPUI du geste -
 * jamais au centre du disque.
 *
 * La distinction n'est pas cosmétique, c'est le défaut qu'on corrige : mesuré
 * depuis le centre, un pouce posé sur le bord droit du cercle valait déjà
 * « à droite, presque à fond » sans que rien n'ait bougé, et glisser vers la
 * gauche ne faisait que revenir vers le centre. Sur une tablette tenue à
 * l'horizontale, le disque est ancré loin dans le coin bas gauche et le pouce
 * qui tient l'appareil n'atteint que son bord intérieur - toujours le même,
 * toujours à droite : le joueur partait à droite à chaque fois.
 *
 * En repère relatif, l'appui vaut zéro où qu'il tombe, et une même amplitude
 * vaut autant d'un côté que de l'autre.
 *
 * `dx` / `dy` sont l'écart RAMENÉ à la course - de quoi placer le manche.
 */
export function joyAxes(
  ex: number,
  ey: number,
): { x: number; y: number; dx: number; dy: number } {
  const len = Math.hypot(ex, ey);
  const k = len > JOY_RADIUS ? JOY_RADIUS / len : 1;
  const dx = ex * k;
  const dy = ey * k;
  // L'écran a son y vers le bas, la marche a son avant vers le haut.
  if (len < JOY_DEAD) return { x: 0, y: 0, dx, dy };
  return { x: dx / JOY_RADIUS, y: -dy / JOY_RADIUS, dx, dy };
}

export function consumeLook(): { dx: number; dy: number } {
  const dx = input.lookDX;
  const dy = input.lookDY;
  input.lookDX = 0;
  input.lookDY = 0;
  return { dx, dy };
}
