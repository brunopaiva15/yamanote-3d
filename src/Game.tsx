// L'expérience 3D est isolée du menu afin que Three.js, la scène et ses
// ressources ne soient téléchargés qu'après une action explicite du joueur.

import { Canvas } from '@react-three/fiber';
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
import { Weather } from './three/Weather';
import { SkyDome } from './three/city/SkyDome';
import { CityRibbon } from './three/city/CityRibbon';
import { Landmarks } from './three/Landmarks';
import { SegmentEnvironment } from './three/SegmentEnvironment';
import { PlateauWorld } from './three/PlateauWorld';
import { HubStationRoof } from './three/HubStationRoof';
import { Station } from './three/station/Station';
import { PlatformCrowd } from './three/PlatformCrowd';
import { Passengers } from './three/Passengers';
import { PaxSpeechBubble } from './three/PaxSpeechBubble';
import { AgentSpeechBubble } from './three/AgentSpeechBubble';
import { Player } from './three/Player';
import { Hud } from './ui/Hud';
import { Controls } from './ui/Controls';
import { BoardingPrompt } from './ui/BoardingPrompt';
import { TalkPrompt } from './ui/TalkPrompt';

export default function Game() {
  return (
    <>
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{ fov: 70, near: 0.05, far: 260, position: [0, CONFIG.eyeHeight, 4.2] }}
        shadows="percentage"
      >
        <Scene />
        <Engine />
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
        <PlateauWorld />
        <Wayside />
        <Landmarks />
        <SegmentEnvironment />
        <HubStationRoof />
        <Station />
        <PassingTrain />
        <PlatformCrowd />
        <PaxSpeechBubble />
        <AgentSpeechBubble />
        <Weather />
        <Player />
      </Canvas>
      <Hud />
      <BoardingPrompt />
      <TalkPrompt />
      <Controls />
    </>
  );
}
