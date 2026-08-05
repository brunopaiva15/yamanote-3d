// Le menu reste volontairement dans le bundle initial. Toute l'expérience 3D
// vit derrière l'import dynamique et ne commence à charger qu'au clic sur
// « Jouer » (StartScreen appelle loadGameFor avant de basculer `started`).
//
// Deux versions, deux racines, un seul menu. La version sonore
// (systems/gameMode) n'a ni toile, ni voile d'attente : il n'y a pas d'image à
// attendre, seulement un graphe audio déjà construit par prepareGame. Son
// morceau est distinct de celui de la 3D pour qu'une machine qui la choisit ne
// télécharge jamais three.js.

import { lazy, Suspense } from 'react';
import { useStore } from './store';
import { loadAudioGame, loadGame } from './gameLoader';
import { StartScreen } from './ui/StartScreen';
import { RenderLoading } from './ui/RenderLoading';
import { useScreenAwake } from './ui/useScreenAwake';

const Game = lazy(loadGame);
const AudioGame = lazy(loadAudioGame);

export default function App() {
  const started = useStore((s) => s.started);
  const mode = useStore((s) => s.mode);

  // L'écran ne s'éteint pas pendant le trajet. Posé ici, au-dessus des deux
  // versions : le téléphone qui verrouille au bout de trente secondes coupe
  // l'image de l'une et le SON de l'autre (iOS suspend le contexte audio à
  // l'extinction). Le menu, lui, n'a rien à retenir - on y lit, on y clique,
  // et la minuterie du système y est à sa place.
  useScreenAwake(started);

  if (!started) {
    return (
      <div className="app">
        <StartScreen />
      </div>
    );
  }

  if (mode === 'audio') {
    return (
      <div className="app app-audio">
        <Suspense fallback={null}>
          <AudioGame />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="app">
      <Suspense fallback={null}>
        <Game />
      </Suspense>
      {/* Le voile d'attente est posé ICI et non dans Game, parce qu'il doit
          couvrir le montage de Game lui-même : le repli du Suspense, puis
          la construction de la scène, qui a lieu pendant le rendu React et
          donc avant le moindre effet. Il se lève tout seul à la première
          image dessinée (three/RenderBootSignal). */}
      <RenderLoading />
    </div>
  );
}
