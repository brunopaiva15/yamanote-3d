// Boucle 60 fps unique : toute la logique par frame passe par ici, aucune
// mise à jour d'état React par frame ailleurs.

import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { updateCycle } from '../systems/stationCycle';
import { updateDoorMotion } from '../systems/doorMotion';
import { updateDoorObstruction } from '../systems/doorObstruction';
import { updatePlatformAgentSpeech } from '../systems/platformAgent';
import { updateSegmentEnv } from '../systems/segmentEnv';
import { updateWeather } from '../systems/weather';
import { updatePlatformPresence } from '../systems/platformPresence';
import { updateStationOcclusion } from '../systems/stationOcclusion';
import { updatePlatformWait } from '../systems/platformWait';
import { updatePassingTrain } from '../systems/passingTrain';
import { updatePetCarriers } from '../systems/petCarriers';
import { updatePlatformCrowd } from '../systems/platformCrowd';
import {
  CYCLE_DT_CAP,
  PHYS_SPAN_CAP,
  PHYS_STEP,
  publishAudioEnvironment,
} from '../systems/audioFrame';
import { updatePassengers, trimPassengersForPerf } from '../systems/passengers';
import { updateConversation } from '../systems/conversation';
import { updateHeldItem, updateInteraction } from '../systems/interaction';
import { updateFareGates } from '../systems/fareGate';
import { setPickCamera } from '../systems/pick';
import { perfLevel } from '../systems/perf';
import {
  netCycleDt,
  netPumpIn,
  netPumpOut,
  startWorldSync,
  stopWorldSync,
} from '../systems/net/worldSync';
import { useRoom } from '../systems/net/room';
import { sendPose, startPoseStream, stopPoseStream } from '../systems/net/pose';
import { updatePeers } from '../systems/net/peers';

// Les trois bornes de temps (dt du cycle, pas de physique, plafond par image)
// sont dans systems/audioFrame : elles valent pour les deux versions du jeu, et
// une seule horloge vaut mieux que deux qui se ressemblent.

// Onglet repris après masquage : rAF était en pause, la première frame porte
// tout le temps caché. On saute l'avance du cycle sur cette frame-là (évite
// de sauter des gares) - mais UNIQUEMENT elle : une frame lente sur un onglet
// visible (shaders, GC, GPU saturé) doit compter en entier, sinon le cycle
// gèle sous charge et le prochain arrêt n'arrive jamais.
let tabJustResumed = false;
// Dernier palier de qualité appliqué aux PNJ (voir bloc qualité dans useFrame).
let lastPerfLevel = perfLevel();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tabJustResumed = true;
  });
}

export function Engine(): null {
  const gl = useThree((s) => s.gl);
  const inRoom = useRoom((s) => s.status === 'joined');
  const camera = useThree((s) => s.camera);

  // Outil dev : __renderInfo() donne le coût de la frame précédente. Sert à
  // vérifier qu'ajouter la gare et l'extérieur de la rame ne change rien au
  // budget quand on est simplement assis dans le wagon.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__renderInfo = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
  }, [gl]);

  // La visée part de la caméra : c'est elle, et rien d'autre, qui dit ce que le
  // réticule touche (systems/pick).
  useEffect(() => {
    setPickCamera(camera);
    return () => setPickCamera(null);
  }, [camera]);

  // Le monde partagé s'écoute tant qu'on est dans un salon. Branché ICI et non
  // dans `net/room` : `worldSync` a besoin de `net/room` pour émettre, et si
  // `net/room` avait besoin de `worldSync` pour brancher l'écoute, les deux
  // modules s'importeraient l'un l'autre. La boucle, elle, connaît
  // légitimement les deux - c'est elle qui les fait tourner.
  useEffect(() => {
    if (!inRoom) return;
    startWorldSync();
    startPoseStream();
    return () => {
      stopWorldSync();
      stopPoseStream();
    };
  }, [inRoom]);

  useFrame((_, rawDt) => {
    const raw = Math.max(0, rawDt);
    const skipCycle = tabJustResumed;
    tabJustResumed = false;
    // Cycle & déplacement : horloge murale. Un FPS bas ne doit ni ralentir ni
    // geler le passage d'une gare à l'autre.
    const cycleDt = skipCycle ? 0 : Math.min(raw, CYCLE_DT_CAP);
    // La physique parcourt le MÊME temps que le cycle : c'est la seule façon que
    // les portes et les phases restent d'accord (voir PHYS_STEP). Sur la frame
    // de reprise d'onglet, où le cycle ne bouge pas, elle avance d'un pas.
    const physSpan = skipCycle ? PHYS_STEP : Math.min(raw, PHYS_SPAN_CAP);
    if (cycleDt <= 0 && physSpan <= 0) return;

    if (!useStore.getState().started) return;

    // Le réseau AVANT le cycle : une correction appliquée après porterait sur
    // une image déjà écoulée, et le suiveur courrait perpétuellement une image
    // derrière l'hôte. Sans salon, c'est un retour immédiat.
    netPumpIn();

    // Qualité vidéo abaissée en cours de trajet : allège immédiatement le
    // pool de PNJ. En sens inverse (qualité remontée), la densité se remplit
    // naturellement à l'échange de passagers du prochain arrêt.
    const perfNow = perfLevel();
    if (perfNow !== lastPerfLevel) {
      lastPerfLevel = perfNow;
      trimPassengersForPerf();
    }

    if (cycleDt > 0) {
      // Descendu sur le quai, le joueur n'est plus dans le référentiel du
      // train : la gare devient fixe, la rame glisse, et c'est une autre
      // machine à états qui mène la danse.
      // Le pas de temps du cycle, modulé de la dérive quand on suit quelqu'un.
      // On ne corrige QUE le cycle : la physique des portes et la foule
      // avancent au temps réel, sinon un rattrapage de 10 % ferait battre les
      // vantaux 10 % trop vite, ce qui s'entend.
      const worldDt = netCycleDt(cycleDt);
      if (runtime.playerFrame === 'platform') updatePlatformWait(worldDt);
      else updateCycle(worldDt);
      // Le train qui traverse la voie d'en face appartient à la GARE, pas à
      // notre rame : il avance de la même façon qu'on soit assis dedans ou
      // debout sur le quai, et les deux machines à états ci-dessus ne font que
      // lui ouvrir un créneau.
      updatePassingTrain(cycleDt);
      updateSegmentEnv(cycleDt);
      // La météo suit l'horloge du monde et non celle de la machine : elle
      // avance donc du dt de CYCLE, comme la course du train. Une frame lente
      // ne doit pas figer une averse.
      updateWeather(cycleDt);
      updatePlatformPresence();
      // Lit platformFade / platformSlide : doit venir après.
      updateStationOcclusion();
    }
    if (physSpan > 0) {
      // Tout ce qui INTÈGRE du temps avance par sous-pas de PHYS_STEP au plus,
      // sur la totalité du temps écoulé. Ce qui ne fait que PUBLIER l'état
      // courant (niveaux audio, ambiance, tonnerre) reste après la boucle : une
      // seule fois par image suffit, et deux fois ne veulent rien dire.
      for (let left = physSpan; left > 1e-6; left -= PHYS_STEP) {
        const step = Math.min(PHYS_STEP, left);
        updateDoorMotion(step);
        // Après le mouvement des vantaux : la procédure de porte bloquée réagit
        // au contact que le sous-pas vient d'établir.
        updateDoorObstruction(step);
        // La bulle de l'agent suit sa tête, et lui survit le temps d'être lue.
        updatePlatformAgentSpeech(step);
        updatePassengers(step);
        updatePlatformCrowd(step);
        // Les battants des portillons, puis ce qu'on a devant soi. L'ordre
        // compte : la touche d'action est UNIQUE (voir systems/interaction) et
        // ces deux appels l'encadrent - un appareil visé passe avant un voisin
        // à qui parler, ce qu'on tient passe après.
        updateFareGates(step);
        updateInteraction(step);
        // Après les voyageurs : la conversation vise une tête dont la position
        // vient d'être mise à jour, et récolte les événements de ce sous-pas.
        updateConversation(step);
        updateHeldItem();
      }
      // Après la foule : c'est elle qui dit qui est encore là pour porter
      // une caisse, et qui vient de disparaître dans l'escalier ou en rame.
      updatePetCarriers();
      // Et tout ce que la boucle doit dire au moteur audio : niveaux de la
      // rame, ambiance, ouvertures, diffuseurs du quai, dehors, tonnerre. Le
      // bloc est partagé avec la version sonore (systems/audioFrame) - c'est le
      // même mixage, dans les deux versions du jeu. UNE fois par image : les
      // niveaux étaient reprogrammés à chaque sous-pas, pour un résultat
      // identique et vingt fois le travail.
      publishAudioEnvironment(physSpan);
    }

    // Et ce qu'on a à dire aux autres, une fois l'image faite : le battement de
    // l'hôte, les tirages de l'arrêt, et notre propre pose. Sans salon, retour
    // immédiat pour les trois.
    netPumpOut(cycleDt);
    // Les fondus des avatars distants avancent au temps RÉEL et non au temps du
    // cycle : un pair qui décroche doit s'estomper à la même vitesse qu'on
    // roule vite ou qu'on soit à l'arrêt.
    updatePeers(raw, Date.now());
    sendPose(raw, Date.now());
  });
  return null;
}
