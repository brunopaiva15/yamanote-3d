// La boucle d'images de la version sonore.
//
// Elle fait exactement ce que fait three/Engine, moins tout ce qui n'existe que
// pour être VU. Le train roule, freine, s'arrête, ouvre ses portes, la sono du
// quai annonce, la 発車メロディ sonne, la pluie tombe sur le pavillon : ces
// machines à états ne dépendent d'aucune image, elles n'ont jamais eu besoin
// d'une toile - c'est three/Engine qui les cadençait, parce qu'il se trouvait
// être le seul à battre la mesure.
//
// La mesure vient donc d'ici, en requestAnimationFrame. Pas d'un setInterval :
// rAF se met en pause avec l'onglet, ce qui est très exactement ce qu'on veut
// - un onglet caché n'a pas à faire avancer la ligne de trente gares pendant
// qu'on lit ses courriels - et sa cadence suit l'écran, donc les portes
// coulissent aussi finement que dans l'autre version.
//
// La règle est simple : TOUT ce qui s'entend tourne, y compris ce qui n'a
// aucune chance d'être vu. Les voyageurs de la rame et la foule du quai
// avancent, avec leurs éternuements, leurs toux, leurs sacs et leurs voix ; la
// porte peut être bloquée par quelqu'un, avec son avertisseur et l'agent de
// quai qui vient s'en occuper ; l'assistance à un voyageur, les arrêts
// d'urgence et les coupures de caténaire arrivent comme ailleurs (c'est
// stationCycle qui les mène, et il tourne ici entier). L'auditeur est assis au
// milieu de la voiture (AudioGame), et toutes ces sources gardent donc leur
// distance et leur direction : un éternuement vient bien de trois rangées plus
// loin, sur la gauche.
//
// Ce qui est ÉCARTÉ ne l'est que pour une raison, et c'est toujours la même :
// il n'y a PAS DE CORPS à déplacer. Sans corps, ces machines-là n'ont rien à
// calculer.
//
//   • la marche, la visée, la conversation, ce qu'on tient dans la main, les
//     portillons et les appareils de gare : tous attendent un joueur qui
//     avance, vise ou appuie ;
//   • l'occultation du décor par le quai : du rendu, rien que du rendu.
//
// DESCENDRE SUR LE QUAI, en revanche, n'est pas écarté : c'est le geste qui
// change le plus ce qu'on entend, et il a son bouton (systems/audioBoarding).
// L'attente du prochain train tourne alors ici comme dans l'autre version -
// tableau des départs, annonces d'approche, et l'avancement des perturbations
// de la ligne avec ses annonces de retard, ses estimations révisées et sa
// reprise du trafic. Un retard déclaré à bord (arrêt d'urgence, coupure de
// caténaire) est posé dans les deux versions ; son chrono, lui, ne court que
// sur le quai - c'est déjà le cas de l'expérience complète tant qu'on reste
// assis.

import { V_MAX } from '../data/config';
import { useStore } from '../store';
import { runtime } from './runtime';
import { updateAmbience, updateAudio } from './audioEngine';
import {
  CYCLE_DT_CAP,
  PHYS_SPAN_CAP,
  PHYS_STEP,
  publishAudioEnvironment,
} from './audioFrame';
import { updateDoorMotion } from './doorMotion';
import { updateDoorObstruction } from './doorObstruction';
import { updatePassingTrain } from './passingTrain';
import { updatePassengers } from './passengers';
import { updatePetCarriers } from './petCarriers';
import { updatePlatformAgentSpeech } from './platformAgent';
import { updatePlatformCrowd } from './platformCrowd';
import { updatePlatformPresence } from './platformPresence';
import { updatePlatformWait } from './platformWait';
import { updateSegmentEnv } from './segmentEnv';
import { updateCycle } from './stationCycle';
import { updateWeather } from './weather';

// Onglet repris après masquage : rAF était en pause, la première frame porte
// tout le temps caché. On saute l'avance du cycle sur cette frame-là (évite
// de sauter des gares) - mais UNIQUEMENT elle : une frame lente sur un onglet
// visible doit compter en entier, sinon le cycle gèle sous charge et le
// prochain arrêt n'arrive jamais.
let tabJustResumed = false;
let visibilityBound = false;

function bindVisibility(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tabJustResumed = true;
  });
}

/**
 * Une image de la version sonore. `rawDt` est le temps écoulé depuis la
 * précédente, en secondes.
 *
 * Exportée à part de la boucle qui l'appelle : c'est elle qu'on met sous test,
 * sans avoir à faire tourner un navigateur.
 */
export function stepAudioFrame(rawDt: number): void {
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

  const { phase, started } = useStore.getState();
  if (!started) return;

  if (cycleDt > 0) {
    // Descendu sur le quai, le joueur n'est plus dans le référentiel du train :
    // la gare devient fixe, la rame glisse, et c'est une autre machine à états
    // qui mène la danse - celle qui attend le prochain train, annonce les
    // retards et guette la reprise du trafic.
    if (runtime.playerFrame === 'platform') updatePlatformWait(cycleDt);
    else updateCycle(cycleDt);
    // Le train qui traverse la voie d'en face appartient à la GARE, pas à
    // notre rame : le cycle ne fait que lui ouvrir un créneau.
    updatePassingTrain(cycleDt);
    // Le tronçon courant ne se voit pas ici, mais il s'entend : c'est lui qui
    // dit si l'on roule en tranchée, sous une dalle ou sur un viaduc, et la
    // réverbération du lieu suit.
    updateSegmentEnv(cycleDt);
    // La météo suit l'horloge du monde et non celle de la machine : elle
    // avance donc du dt de CYCLE, comme la course du train.
    updateWeather(cycleDt);
    // Pose platformFade / platformSlide, dont dépendent l'ambiance de gare et
    // la position des diffuseurs : la gare s'approche, passe et s'éloigne.
    updatePlatformPresence();
  }

  if (physSpan > 0) {
    // Tout ce qui INTÈGRE du temps avance par sous-pas de PHYS_STEP au plus,
    // sur la totalité du temps écoulé. Ce qui ne fait que PUBLIER l'état
    // courant reste après la boucle : une seule fois par image suffit.
    for (let left = physSpan; left > 1e-6; left -= PHYS_STEP) {
      const step = Math.min(PHYS_STEP, left);
      updateDoorMotion(step);
      // Après le mouvement des vantaux : la procédure de porte bloquée réagit
      // au contact que le sous-pas vient d'établir.
      updateDoorObstruction(step);
      // L'agent de quai parle, et sa consigne dure le temps d'être entendue.
      updatePlatformAgentSpeech(step);
      updateAudio(
        step,
        runtime.speed / V_MAX,
        phase === 'brake' || runtime.accel < -0.05,
        runtime.carPower,
      );
      updateAmbience(step);
      // Les voyageurs et la foule du quai : ce sont eux qui éternuent, qui
      // toussent, qui froissent un sac, qui se cognent à l'embarquement - et
      // c'est ce qu'on entend le plus, après les annonces, quand on ferme les
      // yeux dans un wagon.
      updatePassengers(step);
      updatePlatformCrowd(step);
    }
    // Après la foule : c'est elle qui dit qui est encore là pour porter une
    // caisse, et qui vient de disparaître dans l'escalier ou en rame.
    updatePetCarriers();
    publishAudioEnvironment();
  }
}

let frameId = 0;
let lastTime = 0;

/**
 * Démarre la boucle. Rendue idempotente à dessein : un montage / démontage de
 * React en développement (StrictMode) ne doit pas faire tourner deux boucles,
 * ce qui doublerait la vitesse du train.
 */
export function startAudioLoop(): void {
  if (frameId) return;
  bindVisibility();
  lastTime = 0;
  const frame = (now: number) => {
    frameId = requestAnimationFrame(frame);
    // Première image : aucun temps écoulé à rattraper, seulement une origine
    // à poser. Sans cela, `now` (l'horloge du document) passerait entier dans
    // le premier pas et le train partirait déjà loin.
    if (lastTime === 0) {
      lastTime = now;
      return;
    }
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    stepAudioFrame(dt);
  };
  frameId = requestAnimationFrame(frame);
}

export function stopAudioLoop(): void {
  if (!frameId) return;
  cancelAnimationFrame(frameId);
  frameId = 0;
}
