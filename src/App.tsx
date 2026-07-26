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
import { DoorCloseLed } from './three/DoorCloseLed';
import { Scenery } from './three/Scenery';
import { Landmarks } from './three/Landmarks';
import { SegmentEnvironment } from './three/SegmentEnvironment';
import { HubStationRoof } from './three/HubStationRoof';
import { Platform } from './three/Platform';
import { PlatformCrowd } from './three/PlatformCrowd';
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
        // far généreux : en regardant le fond du wagon, les baies latérales
        // visent la ville sous un angle rasant (rayons ≫ distance latérale).
        camera={{ fov: 70, near: 0.05, far: 260, position: [0, CONFIG.eyeHeight, 4.2] }}
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
        <DoorCloseLed />
        <Scenery />
        <Landmarks />
        <SegmentEnvironment />
        <HubStationRoof />
        <Platform />
        <PlatformCrowd />
        <Passengers />
        <Player />
      </Canvas>
      <Hud />
      <Controls />
      {!started && <StartScreen />}
    </div>
  );
}
