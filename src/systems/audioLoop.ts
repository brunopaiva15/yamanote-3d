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
//   • DESCENDRE SUR LE QUAI, et avec cela `platformWait` - l'attente du
//     prochain train, le tableau des départs, l'avancement des perturbations
//     de la ligne. On ne descend pas d'un train sans marcher : dans
//     l'expérience complète il n'y a d'ailleurs ni bouton ni commande pour
//     cela, on franchit la porte ouverte à pied et c'est le pas qui fait
//     basculer le repère. Le voyage sonore se fait donc ASSIS, du début à la
//     fin, et `runtime.playerFrame` ne quitte jamais la rame.
//
//     Un retard déclaré à bord (arrêt d'urgence, coupure de caténaire) est
//     bien posé - et il pèse sur les annonces de quai qu'on entend par la
//     porte ouverte - mais son chrono ne court que pour qui l'attend debout
//     sur le quai. C'est déjà le cas de l'expérience complète tant qu'on reste
//     à sa place ;
//   • l'occultation du décor par le quai : du rendu, rien que du rendu.

import { useStore } from '../store';
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
import { updateSegmentEnv } from './segmentEnv';
import { updateCycle } from './stationCycle';
import { updateWeather } from './weather';

// --- L'horloge, et pourquoi elle change de moteur ------------------------
//
// `requestAnimationFrame` ne bat que pour une page qu'on REGARDE : dès que
// l'onglet passe derrière ou que la fenêtre est réduite, le navigateur cesse
// de l'appeler. C'est le bon comportement pour l'expérience complète - on
// n'anime pas une scène que personne ne voit - et c'est exactement le mauvais
// ici : la version sonore est faite pour tourner dans un onglet qu'on laisse
// de côté, et une ligne qui se fige dès qu'on regarde ailleurs n'est plus une
// ligne. Le graphe audio, lui, continuerait de jouer le dernier état
// programmé : un ronflement de roulement figé, sans gare, sans annonce et sans
// fin.
//
// La mesure vient donc d'un SECOND moteur quand la page est cachée : un
// `setInterval`. Les navigateurs le bornent à un réveil par seconde en
// arrière-plan, ce qui suffit très largement - une seconde de monde par pas,
// parcourue en sous-pas de physique comme n'importe quelle image lente, et le
// son est programmé à l'échantillon près par Web Audio de toute façon.
//
// Chrome va plus loin après cinq minutes (un réveil par MINUTE), mais il en
// dispense les pages qui JOUENT DU SON - ce qui est, ici, la définition même
// de la page. Le cas d'usage tient donc debout : on lance la ligne, on va
// travailler ailleurs, elle continue.
const BACKGROUND_TICK_MS = 250;

// Onglet repris après masquage : sur une reprise ordinaire il n'y a plus de
// trou à rattraper - le moteur d'arrière-plan a tourné pendant ce temps -,
// mais une machine mise en veille en laisse un vrai. On saute l'avance du
// cycle sur cette frame-là, et UNIQUEMENT elle : une frame lente sur un onglet
// visible doit compter en entier, sinon le cycle gèle sous charge et le
// prochain arrêt n'arrive jamais.
let tabJustResumed = false;
let visibilityBound = false;

/** La page est-elle regardée ? Vrai hors navigateur (tests). */
function pageVisible(): boolean {
  return typeof document === 'undefined' || !document.hidden;
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tabJustResumed = true;
    // Changer de moteur d'horloge, sans jamais en laisser deux tourner.
    if (frameId || timerId) startAudioLoop.restart();
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

  if (!useStore.getState().started) return;

  if (cycleDt > 0) {
    updateCycle(cycleDt);
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
    publishAudioEnvironment(physSpan);
  }
}

let frameId = 0;
let timerId = 0;
let lastTime = 0;

/** Un pas, quel que soit le pilote : le temps écoulé depuis le précédent. */
function advance(now: number): void {
  // Première mesure : aucun temps à rattraper, seulement une origine à poser.
  // Sans cela, `now` (l'horloge du document) passerait entier dans le premier
  // pas et le train partirait déjà loin.
  if (lastTime === 0) {
    lastTime = now;
    return;
  }
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  stepAudioFrame(dt);
}

function stopDrivers(): void {
  if (frameId) cancelAnimationFrame(frameId);
  if (timerId) window.clearInterval(timerId);
  frameId = 0;
  timerId = 0;
}

function runDriver(): void {
  stopDrivers();
  if (pageVisible()) {
    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      advance(now);
    };
    frameId = requestAnimationFrame(frame);
    return;
  }
  // Page cachée : le navigateur bornera lui-même la cadence. On demande fin,
  // il donnera ce qu'il veut bien donner, et le pas s'ajuste au temps écoulé.
  timerId = window.setInterval(() => advance(performance.now()), BACKGROUND_TICK_MS);
}

/**
 * Démarre la boucle. Rendue idempotente à dessein : un montage / démontage de
 * React en développement (StrictMode) ne doit pas faire tourner deux boucles,
 * ce qui doublerait la vitesse du train.
 */
export function startAudioLoop(): void {
  if (frameId || timerId) return;
  bindVisibility();
  lastTime = 0;
  runDriver();
}

/**
 * Rebascule sur le pilote qui convient à l'état courant de la page. Posée sur
 * la fonction plutôt qu'exportée à part : c'est un détail de la boucle, et rien
 * d'autre n'a de raison de l'appeler.
 */
startAudioLoop.restart = runDriver;

export function stopAudioLoop(): void {
  stopDrivers();
}
