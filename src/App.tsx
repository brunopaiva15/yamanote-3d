// Composition : Canvas R3F (scène + systèmes) et overlays HTML (HUD,
// écran de démarrage, contrôles tactiles).

import { Canvas } from '@react-three/fiber';
import { useStore } from './store';
import { CONFIG } from './data/config';
import { Engine } from './three/Engine';
import { Scene } from './three/Scene';
import { TrainRig } from './three/TrainRig';
import { TrainConsist } from './three/exterior/TrainConsist';
import { PassingTrain } from './three/exterior/PassingTrain';
import { Car } from './three/Car';
import { Seats } from './three/Seats';
import { Doors } from './three/Doors';
import { Handles } from './three/Handles';
import { Ads } from './three/Ads';
import { Screens } from './three/Screens';
import { DoorCloseLed } from './three/DoorCloseLed';
import { Wayside } from './three/Wayside';
import { SkyDome } from './three/city/SkyDome';
import { CityRibbon } from './three/city/CityRibbon';
import { Landmarks } from './three/Landmarks';
import { SegmentEnvironment } from './three/SegmentEnvironment';
import { PlateauWorld } from './three/PlateauWorld';
import { HubStationRoof } from './three/HubStationRoof';
import { Station } from './three/station/Station';
import { PlatformCrowd } from './three/PlatformCrowd';
import { Passengers } from './three/Passengers';
import { Player } from './three/Player';
import { Hud } from './ui/Hud';
import { StartScreen } from './ui/StartScreen';
import { Controls } from './ui/Controls';
import { BoardingPrompt } from './ui/BoardingPrompt';

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
        {/* Tout ce qui appartient à la rame : fixe à l'origine tant qu'on est
            à bord, glissant le long de la voie quand on la regarde du quai. */}
        <TrainRig>
          <Car />
          <Seats />
          <Doors />
          <Handles />
          <Ads />
          <Screens />
          <DoorCloseLed />
          <Passengers />
          <TrainConsist />
        </TrainRig>
        <SkyDome />
        <CityRibbon />
        {/* Ville géoréférencée du prototype PLATEAU. Ne se montre que sur le
            tronçon pour lequel elle a été produite (Sugamo → Ōtsuka) ; partout
            ailleurs, et prototype coupé, elle ne rend rien du tout et le décor
            procédural ci-dessus reste seul en scène. */}
        <PlateauWorld />
        <Wayside />
        <Landmarks />
        <SegmentEnvironment />
        <HubStationRoof />
        <Station />
        {/* La voie d'en face, quand une rame la traverse sans s'arrêter. Suit
            le repère du quai, pas celui de la rame. */}
        <PassingTrain />
        <PlatformCrowd />
        <Player />
      </Canvas>
      <Hud />
      <BoardingPrompt />
      <Controls />
      {!started && <StartScreen />}
    </div>
  );
}
