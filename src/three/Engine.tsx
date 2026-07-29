// Boucle 60 fps unique : toute la logique par frame passe par ici, aucune
// mise à jour d'état React par frame ailleurs.

import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { V_MAX } from '../data/config';
import { layoutFor, roomTone } from '../data/stationLayouts';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { updateCycle } from '../systems/stationCycle';
import { updateDoorMotion } from '../systems/doorMotion';
import { updateSegmentEnv } from '../systems/segmentEnv';
import { updatePlatformPresence } from '../systems/platformPresence';
import { updateStationOcclusion } from '../systems/stationOcclusion';
import { updatePlatformWait } from '../systems/platformWait';
import { updatePassingTrain } from '../systems/passingTrain';
import { updatePlatformCrowd } from '../systems/platformCrowd';
import { setPlatformDoors, setStationAmbience, updateAmbience, updateAudio } from '../systems/audioEngine';
import { updatePassengers, trimPassengersForPerf } from '../systems/passengers';
import { updateConversation } from '../systems/conversation';
import { perfLevel } from '../systems/perf';

/**
 * Plafond du dt cycle : borne les trous que l'API Visibility ne signale pas
 * (mise en veille machine, page restée « visible »). Une frame lente mais
 * visible avance le cycle de tout son temps écoulé — le seuil ne sert qu'à
 * éviter de téléporter le train de plusieurs gares d'un coup.
 */
const CYCLE_DT_CAP = 5;
/** Plafond du dt physique : pas stables pour portes / PNJ / audio. */
const PHYS_DT_CAP = 0.05;

// Onglet repris après masquage : rAF était en pause, la première frame porte
// tout le temps caché. On saute l'avance du cycle sur cette frame-là (évite
// de sauter des gares) — mais UNIQUEMENT elle : une frame lente sur un onglet
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

  useFrame((_, rawDt) => {
    const raw = Math.max(0, rawDt);
    const skipCycle = tabJustResumed;
    tabJustResumed = false;
    // Cycle & déplacement : horloge murale. Un FPS bas ne doit ni ralentir ni
    // geler le passage d'une gare à l'autre.
    const cycleDt = skipCycle ? 0 : Math.min(raw, CYCLE_DT_CAP);
    const physDt = Math.min(raw, PHYS_DT_CAP);
    if (cycleDt <= 0 && physDt <= 0) return;

    const { phase, started } = useStore.getState();
    if (!started) return;

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
      if (runtime.playerFrame === 'platform') updatePlatformWait(cycleDt);
      else updateCycle(cycleDt);
      // Le train qui traverse la voie d'en face appartient à la GARE, pas à
      // notre rame : il avance de la même façon qu'on soit assis dedans ou
      // debout sur le quai, et les deux machines à états ci-dessus ne font que
      // lui ouvrir un créneau.
      updatePassingTrain(cycleDt);
      updateSegmentEnv(cycleDt);
      updatePlatformPresence();
      // Lit platformFade / platformSlide : doit venir après.
      updateStationOcclusion();
    }
    if (physDt > 0) {
      updateDoorMotion(physDt);
      // Sur le quai la phase du store reste 'dwell' : le freinage réel se lit
      // sur l'accélération (rame qui arrive), sinon le crissement ne part jamais.
      updateAudio(
        physDt,
        runtime.speed / V_MAX,
        phase === 'brake' || runtime.accel < -0.05,
      );
      // Le quai n'est audible que par les ouvertures réellement dégagées : il
      // faut la porte de la rame ET la porte palière en face — là où il y en a
      // une. À Shinjuku et Shibuya, la porte de la rame donne directement sur
      // le quai, et la mélodie entre dès qu'elle s'écarte.
      const openings = runtime.doorOpen * (runtime.psdPresent ? runtime.psdOpen : 1);
      setPlatformDoors(openings);
      // L'ambiance du lieu suit les mêmes ouvertures : sur le quai on est
      // dedans, dans la rame portes fermées on ne l'entend presque plus. Elle
      // ne vit qu'aussi longtemps que la gare est là.
      // La gare qu'on entend est celle dont le quai est là (platformIndex) :
      // au départ, index désigne déjà la suivante alors que celle-ci défile
      // encore le long des vitres, et son ambiance s'éloigne avec elle.
      const stationIndex = useStore.getState().platformIndex;
      setStationAmbience(
        layoutFor(stationIndex).ambience,
        runtime.platformFade *
          (runtime.playerFrame === 'platform' ? 1 : 0.12 + 0.88 * openings),
        roomTone(stationIndex),
      );
      updateAmbience(physDt);
      updatePassengers(physDt);
      updatePlatformCrowd(physDt);
      // Après les voyageurs : la conversation vise une tête dont la position
      // vient d'être mise à jour, et récolte les événements de cette image.
      updateConversation(physDt);
    }
  });
  return null;
}
