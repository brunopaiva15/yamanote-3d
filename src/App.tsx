// Le menu reste volontairement dans le bundle initial. Toute l'expérience 3D
// vit derrière l'import dynamique et ne commence à charger qu'au clic sur
// « Jouer » (StartScreen appelle loadGame avant de basculer `started`).

import { lazy, Suspense } from 'react';
import { useStore } from './store';
import { loadGame } from './gameLoader';
import { StartScreen } from './ui/StartScreen';

const Game = lazy(loadGame);

export default function App() {
  const started = useStore((s) => s.started);

  return (
    <div className="app">
      {started ? (
        <Suspense fallback={null}>
          <Game />
        </Suspense>
      ) : (
        <StartScreen />
      )}
    </div>
  );
}
