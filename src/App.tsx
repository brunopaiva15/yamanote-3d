// Le menu reste volontairement dans le bundle initial. Toute l'expérience 3D
// vit derrière l'import dynamique et ne commence à charger qu'au clic sur
// « Jouer » (StartScreen appelle loadGame avant de basculer `started`).

import { lazy, Suspense } from 'react';
import { useStore } from './store';
import { loadGame } from './gameLoader';
import { StartScreen } from './ui/StartScreen';
import { RenderLoading } from './ui/RenderLoading';

const Game = lazy(loadGame);

export default function App() {
  const started = useStore((s) => s.started);

  return (
    <div className="app">
      {started ? (
        <>
          <Suspense fallback={null}>
            <Game />
          </Suspense>
          {/* Le voile d'attente est posé ICI et non dans Game, parce qu'il doit
              couvrir le montage de Game lui-même : le repli du Suspense, puis
              la construction de la scène, qui a lieu pendant le rendu React et
              donc avant le moindre effet. Il se lève tout seul à la première
              image dessinée (three/RenderBootSignal). */}
          <RenderLoading />
        </>
      ) : (
        <StartScreen />
      )}
    </div>
  );
}
