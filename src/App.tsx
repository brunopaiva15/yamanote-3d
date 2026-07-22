// Composition : Canvas R3F (scène + systèmes) et overlays HTML (HUD,
// écran de démarrage, contrôles tactiles).

import { Canvas } from '@react-three/fiber';
import { useStore } from './store';
import { CONFIG } from './data/config';
import { Engine } from './three/Engine';
import { Scene } from './three/Scene';
import { Car } from './three/Car';
import { Seats } from './three/Seats';
import { Doors } from './three/Doors';
import { Handles } from './three/Handles';
import { Ads } from './three/Ads';
import { Screens } from './three/Screens';
import { Scenery } from './three/Scenery';
import { Platform } from './three/Platform';
import { Passengers } from './three/Passengers';
import { Player } from './three/Player';
import { Hud } from './ui/Hud';
import { StartScreen } from './ui/StartScreen';
import { Controls } from './ui/Controls';

export default function App() {
  const started = useStore((s) => s.started);

  return (
    <div className="app">
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{ fov: 70, near: 0.05, far: 120, position: [0, CONFIG.eyeHeight, 4.2] }}
        shadows
      >
        <Scene />
        <Engine />
        <Car />
        <Seats />
        <Doors />
        <Handles />
        <Ads />
        <Screens />
        <Scenery />
        <Platform />
        <Passengers />
        <Player />
      </Canvas>
      <Hud />
      <Controls />
      {!started && <StartScreen />}
    </div>
  );
}
