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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { FarSkyline } from './three/city/FarSkyline';
import { FarRelief } from './three/city/FarRelief';
import { DistrictMassif } from './three/city/DistrictMassif';
import { CityRibbon } from './three/city/CityRibbon';
import { Waterways } from './three/city/Waterways';
import { Utilities } from './three/city/Utilities';
import { Traffic } from './three/city/Traffic';
import { Landmarks } from './three/Landmarks';
import { SegmentEnvironment } from './three/SegmentEnvironment';
import { Singularities } from './three/Singularities';
import { HubStationRoof } from './three/HubStationRoof';
import { Station } from './three/station/Station';
import { PlatformCrowd } from './three/PlatformCrowd';
import { Passengers } from './three/Passengers';
import { PaxSpeechBubble } from './three/PaxSpeechBubble';
import { AgentSpeechBubble } from './three/AgentSpeechBubble';
import { Player } from './three/Player';
import { RemotePlayers } from './three/RemotePlayers';
import { HeldItem } from './three/HeldItem';
import { Hud } from './ui/Hud';
import { RenderFailure } from './ui/RenderFailure';
import { Controls } from './ui/Controls';
import { Chat } from './ui/Chat';
import { BoardingPrompt } from './ui/BoardingPrompt';
import { TalkPrompt } from './ui/TalkPrompt';
import { DevicePrompt } from './ui/DevicePrompt';
import { StationDevelopmentNotice } from './ui/StationDevelopmentNotice';
import { AudioQualityNotice } from './ui/AudioQualitySelect';
import { QualityNotice } from './ui/QualityNotice';
import { extraordinaryAvailable, reportWebgpuFailure, usePerf } from './systems/perf';
import { clearGpuKit, loadGpuKit } from './three/webgpu/kit';
import { beginRenderBoot, endRenderBoot } from './systems/renderBoot';
import { createWebglRenderer } from './three/glRenderer';
import {
  RENDER_WATCHDOG,
  RETRY_DELAY,
  type RenderStatus,
  remountRenderer,
  reportRenderFailure,
  useRenderHealth,
} from './systems/renderHealth';

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
 * Portée du plan lointain de la caméra (m).
 *
 * Elle valait 260, du temps où la ville s'arrêtait à soixante-six mètres.
 * L'arrière-pays du ruban va jusqu'à deux cent soixante de côté - donc bien
 * au-delà dans l'axe de la voie - et les repères géographiques de l'horizon se
 * posent plus loin encore. La reculer ne coûte pas de précision de profondeur :
 * la résolution du tampon à une distance donnée est commandée par `near`, que
 * le terme en 1/near écrase, et `near` ne bouge pas.
 */
const CAMERA_FAR = 1400;

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

/**
 * Surveille que la toile a bien fini par dessiner, et remonte tant qu'il reste
 * des tentatives.
 *
 * Le chien de garde ne guette pas un signal d'échec - il guette une IMAGE. Un
 * contexte refusé se signale de lui-même (three/glRenderer) et la reprise est
 * immédiate ; tout le reste - une toile mesurée à zéro, un pilote muet - ne se
 * voit qu'à ce silence-là, et finissait en écran noir définitif.
 */
function useRenderWatchdog(active: boolean): { generation: number; status: RenderStatus } {
  const status = useRenderHealth((s) => s.status);
  const generation = useRenderHealth((s) => s.generation);
  const alive = useRenderHealth((s) => s.alive);

  useEffect(() => {
    // Une image dessinée désarme la minuterie pour de bon : sans cette
    // condition, elle sonnerait sur une toile qui tourne parfaitement.
    if (!active || alive || status !== 'ok') return;
    const id = window.setTimeout(() => reportRenderFailure(null), RENDER_WATCHDOG);
    return () => window.clearTimeout(id);
    // `generation` est dans les dépendances à dessein : chaque toile neuve a
    // droit à son propre délai, sans quoi la deuxième tentative hériterait du
    // chronomètre déjà bien entamé de la première.
  }, [active, alive, status, generation]);

  useEffect(() => {
    if (status !== 'retrying') return;
    // Laisser respirer le processus graphique avant de redemander : c'est de la
    // place qui manquait, et la scène avortée n'est pas encore ramassée.
    const id = window.setTimeout(remountRenderer, RETRY_DELAY);
    return () => window.clearTimeout(id);
  }, [status]);

  // Une reprise reconstruit tout : il faut remettre le voile, sinon le joueur
  // regarde son HUD figé sur du noir pendant qu'on retente en coulisses - la
  // scène même dont on essaie de le sortir. Il se relèvera comme d'habitude,
  // à la première image dessinée (three/RenderBootSignal).
  useEffect(() => {
    if (generation > 0) beginRenderBoot();
  }, [generation]);

  return { generation, status };
}

export default function Game() {
  const path = useRenderPath();
  // La reprise ne concerne que la toile WebGL : en Extraordinaire, un moteur
  // qui refuse de démarrer est déjà rattrapé par le repli sur Ultra.
  const { generation, status } = useRenderWatchdog(path === 'webgl');
  const attempts = useRenderHealth((s) => s.attempts);

  // La fabrique doit changer d'identité à chaque tentative pour que la toile
  // neuve demande bien un contexte plus modeste que celle qu'on vient de
  // perdre (systems/renderHealth, contextAttemptOptions).
  const webglRenderer = useMemo(
    () =>
      ((props: { canvas: HTMLCanvasElement }) =>
        createWebglRenderer(props, attempts)) as unknown as GLProps,
    [attempts],
  );

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
      {/* La toile est DÉMONTÉE dès qu'on sait qu'elle n'a pas démarré, et pas
          seulement au moment de la remplacer. D'abord parce que react-three-fiber
          redemande un contexte à chaque rendu tant qu'il n'en a pas obtenu un,
          et que ce pilonnage n'a jamais rien donné ; ensuite parce que la place
          qui manquait ne se libérera pas tant que la scène avortée est encore
          accrochée - or c'est précisément ce qu'on attend d'elle. */}
      {path === 'pending' || (path === 'webgl' && status !== 'ok') ? null : (
      <Canvas
        key={`${path}-${generation}`}
        dpr={[1, 2]}
        gl={path === 'webgpu' ? webgpuRenderer : webglRenderer}
        camera={{ fov: 70, near: 0.05, far: CAMERA_FAR, position: [0, CONFIG.eyeHeight, 4.2] }}
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
        {/* Entre le ciel et la ville, au sens propre. D'abord ce qui est le
            plus loin - la ligne de crête du Tanzawa et de l'Okutama, relevée
            sur le MNT -, puis les repères de Tokyo à leur relèvement. */}
        <FarRelief />
        {/* Puis les masses urbaines des bandes 1 à 20 km de la bible, relevées
            sur les hauteurs déclarées d'OpenStreetMap : ce qui manquait entre
            le dernier immeuble du ruban et le premier repère de l'horizon. */}
        <DistrictMassif />
        <FarSkyline />
        <CityRibbon />
        {/* Les canaux du corridor et la baie, relevés sur OpenStreetMap. Après
            le ruban : c'est une nappe transparente, elle doit se composer sur
            une ville déjà écrite dans le tampon de profondeur. */}
        <Waterways />
        <Utilities />
        <Traffic />
        <Wayside />
        <Landmarks />
        <SegmentEnvironment />
        {/* Ce qui n'arrive qu'une fois sur la boucle : le passage à niveau, les
            rivières, l'autoroute urbaine. */}
        <Singularities />
        <HubStationRoof />
        <Station />
        <PassingTrain />
        <PlatformCrowd />
        {/* Les autres voyageurs du salon. HORS de `TrainRig` : la conversion de
            repère est faite dans systems/net/pose, pas par le graphe de scène -
            un pair peut être dans le wagon quand on est sur le quai, et
            l'inverse. Sans salon, le composant ne dessine rien. */}
        <RemotePlayers />
        <PaxSpeechBubble />
        <AgentSpeechBubble />
        <Weather />
        <Player />
        {/* Ce qu'on tient : accroché à la caméra, donc rendu après elle. */}
        <HeldItem />
      </Canvas>
      )}
      <Hud />
      <BoardingPrompt />
      <TalkPrompt />
      <DevicePrompt />
      <StationDevelopmentNotice />
      <QualityNotice className="quality-note-hud" failureOnly />
      {/* Et, sur la même ligne, ce que le moteur audio a décidé tout seul :
          descendre d'un palier s'entend, et cela mérite un mot. */}
      <AudioQualityNotice className="quality-note-hud" transient />
      <Controls />
      {/* Le tchat du salon. Hors salon, il ne rend rien du tout. */}
      <Chat />
      {/* En dernier, et par-dessus tout le reste : quand la toile n'a pas
          démarré, le HUD affiche un état figé qui ressemble à s'y méprendre à
          un jeu qui tourne. */}
      <RenderFailure />
    </>
  );
}
