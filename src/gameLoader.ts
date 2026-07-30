// Une fonction partagée garantit que le clic du bouton et React réutilisent
// exactement la même promesse (et donc le même téléchargement) du jeu.
let gamePromise: ReturnType<typeof importGame> | undefined;

function importGame() {
  return import('./Game');
}

export function loadGame(): ReturnType<typeof importGame> {
  gamePromise ??= importGame();
  return gamePromise;
}
