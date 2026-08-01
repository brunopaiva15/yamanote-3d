// L'expérience 3D est isolée du menu afin que Three.js, la scène et ses
// ressources ne soient téléchargés qu'après une action explicite du joueur.
//
// Deux moteurs cohabitent ici, et un seul est monté à la fois. Les six
// qualités historiques rendent en WebGL ; « Extraordinaire » rend en WebGPU,
// avec son propre pipeline (three/webgpu). Le choix est fait AVANT le montage
// de la toile - `key` force un remontage complet si le joueur change d'avis en
// cours de trajet - parce qu'un renderer ne se remplace pas à chaud : la toile,
// le contexte, les textures et tous les programmes en dépendent.
//
// Le paquet WebGPU (three/webgpu, TSL, nœuds de post-traitement) est chargé à
// la demande. Un joueur qui reste en Ultra ne le télécharge jamais.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, type GLProps } from '@react-three/fiber';
import { CONFIG } from './data/config';
import { Engine } from './three/Engine';
import { RenderBootSignal } from './three/RenderBootSignal';
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
import { StationDevelopmentNotice } from './ui/StationDevelopmentNotice';
import { QualityNotice } from './ui/QualityNotice';
import { extraordinaryAvailable, reportWebgpuFailure, usePerf } from './systems/perf';
import { clearGpuKit, loadGpuKit } from './three/webgpu/kit';
import { beginRenderBoot, endRenderBoot } from './systems/renderBoot';

/**
 * Le moteur demandé est-il prêt ?
 *
 * Trois états, et non deux : « WebGL » (le cas courant), « WebGPU prêt », et
 * l'entre-deux où l'on interroge l'adaptateur et où l'on télécharge le paquet.
 * La toile n'est PAS montée pendant cet entre-deux : la monter en WebGL pour la
 * remonter en WebGPU une seconde plus tard reconstruirait toute la scène deux
 * fois, textures procédurales comprises.
 */
function useRenderPath(): 'webgl' | 'webgpu' | 'pending' {
  const quality = usePerf((s) => s.quality);
  const wanted = quality === 'extraordinary' && extraordinaryAvailable();
  const [ready, setReady] = useState(false);

  // Retrait du sac WebGPU PENDANT le rendu, et non dans un effet.
  //
  // C'est la seule fenêtre qui convienne. Les matériaux de la scène (ciel,
  // ville, pluie, limites de zone) consultent `gpuKit()` dans leur `useMemo`,
  // et ces `useMemo` tournent quand react-three-fiber monte sa racine - donc
  // dans un effet de MISE EN PAGE de la toile, qui précède les effets de ce
  // composant-ci. Un nettoyage différé arriverait après : la toile WebGL
  // serait déjà peuplée de matériaux à nœuds qu'elle ne sait pas compiler.
  // L'affectation est idempotente et ne touche rien d'autre.
  if (!wanted) clearGpuKit();

  useEffect(() => {
    if (!wanted) {
      setReady(false);
      endRenderBoot();
      return;
    }
    // Le voile d'attente se lève tout seul, mais il se pose ICI : c'est le
    // premier instant où la toile va disparaître. Il ne retombera qu'à la
    // première image réellement dessinée par le pipeline (three/Scene), pas à
    // la fin du téléchargement - entre les deux il reste la négociation du
    // périphérique et la compilation des nuanceurs, qui sont le plus long.
    beginRenderBoot();
    let alive = true;
    void (async () => {
      try {
        const { probeWebgpu } = await import('./three/webgpu/renderer');
        if (!(await probeWebgpu())) throw new Error('Aucun adaptateur WebGPU');
        await loadGpuKit();
        if (alive) setReady(true);
      } catch {
        // L'adaptateur a refusé, ou le paquet n'a pas pu être chargé. On le dit
        // et on redescend sur Ultra plutôt que d'ouvrir sur une toile noire.
        if (alive) {
          endRenderBoot();
          reportWebgpuFailure();
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [wanted]);

  if (!wanted) return 'webgl';
  return ready ? 'webgpu' : 'pending';
}

/**
 * Fabrique de renderer passée à react-three-fiber, qui l'attend et s'en sert
 * telle quelle. Le transtypage tient à un détail de typage : `DefaultGLProps`
 * décrit sa toile avec la déclaration d'`OffscreenCanvas` de three, distincte
 * de celle de la bibliothèque standard alors qu'elles décrivent le même objet.
 */
const webgpuRenderer = (async (props: { canvas: HTMLCanvasElement }) => {
  const { createWebGPURenderer } = await import('./three/webgpu/renderer');
  return createWebGPURenderer(props);
}) as unknown as GLProps;

export default function Game() {
  const path = useRenderPath();

  // Le voile d'attente est posé par App et se lève à la première image. Il
  // faut seulement le REPOSER quand on change de moteur en cours de trajet :
  // là, la toile est démontée pour de bon et tout est à reconstruire.
  //
  // Effet de mise en page et non effet ordinaire : celui-ci s'exécute avant que
  // le navigateur ne peigne, celui-là après - la différence est une image de
  // fond gris, exactement celle qu'on cherche à supprimer.
  const firstPath = useRef(path);
  useLayoutEffect(() => {
    if (path === firstPath.current) return;
    firstPath.current = path;
    beginRenderBoot();
  }, [path]);

  return (
    <>
      {path === 'pending' ? null : (
      <Canvas
        key={path}
        dpr={[1, 2]}
        gl={
          path === 'webgpu'
            ? webgpuRenderer
            : { powerPreference: 'high-performance', antialias: true }
        }
        camera={{ fov: 70, near: 0.05, far: 260, position: [0, CONFIG.eyeHeight, 4.2] }}
        shadows="percentage"
      >
        <Scene />
        <Engine />
        <RenderBootSignal />
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
      )}
      <Hud />
      <BoardingPrompt />
      <TalkPrompt />
      <StationDevelopmentNotice />
      <QualityNotice className="quality-note-hud" failureOnly />
      <Controls />
    </>
  );
}
