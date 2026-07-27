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

export function consumeLook(): { dx: number; dy: number } {
  const dx = input.lookDX;
  const dy = input.lookDY;
  input.lookDX = 0;
  input.lookDY = 0;
  return { dx, dy };
}
