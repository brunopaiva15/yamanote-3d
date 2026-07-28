// Cinématique mécanique des portes : profil de vitesse trapézoïdal (démarrage
// franc du moteur, croisière, arrivée en butée) avec claquement de
// déverrouillage au départ, choc métallique et léger rebond à l'impact.
// Les portes palières du quai (ホームドア) sont pilotées séparément et en
// décalé : la rame et le quai ne bougent jamais exactement en même temps,
// et chaque porte de la rame part avec son propre petit retard, comme des
// moteurs jamais parfaitement synchrones.

import { CONFIG } from '../data/config';
import { runtime } from './runtime';
import * as audio from './audioEngine';

// Retards retirés au sort à chaque station : quelle porte de la rame part en
// premier, de combien traînent les autres, le retard propre de chaque
// portique du quai et le décalage global quai/rame changent d'une gare à
// l'autre — jamais deux arrêts identiques.
const trainLags: Record<number, number> = {};
let sortedTrainLags: number[] = [];
let psdGateLags: number[] = [];
// Décalages du quai sur la rame (s) : début d'ouverture et de fermeture.
export const stationTimings = { psdOpenDelay: 0.8, psdCloseDelay: 0.8 };

export function randomizeDoorTimings(): void {
  // Une porte part immédiatement, les autres traînent chacune un peu.
  const raw = CONFIG.doorCenters.map(() => Math.random() * 0.3);
  const min = Math.min(...raw);
  CONFIG.doorCenters.forEach((dz, i) => {
    trainLags[dz] = raw[i] - min;
  });
  sortedTrainLags = Object.values(trainLags).sort((a, b) => a - b);
  psdGateLags = Array.from({ length: 32 }, () => Math.random() * 0.3);
  stationTimings.psdOpenDelay = 0.55 + Math.random() * 0.6;
  stationTimings.psdCloseDelay = 0.55 + Math.random() * 0.4;
}
randomizeDoorTimings();

// Retard (s) d'une porte de la rame, par son centre z.
export function trainDoorLag(dz: number): number {
  return trainLags[dz] ?? 0;
}

// Retard (s) d'un portique du quai, par son indice.
export function psdGateLag(gate: number): number {
  return psdGateLags[gate % psdGateLags.length] ?? 0;
}

interface Profile {
  duration: number; // temps de course (s)
  accel: number; // fraction du trajet en accélération
  decel: number; // fraction du trajet en décélération
  rebound: number; // amplitude du rebond en butée (fraction de course)
  reboundDur: number; // durée du rebond (s)
}

// Ouverture amortie, fermeture plus sèche (impact franc, rebond visible).
const TRAIN_OPEN: Profile = { duration: CONFIG.doorTime, accel: 0.22, decel: 0.3, rebound: 0.018, reboundDur: 0.22 };
const TRAIN_CLOSE: Profile = { duration: 1.15, accel: 0.2, decel: 0.1, rebound: 0.035, reboundDur: 0.26 };
// Portes palières : plus légères, course plus courte, chocs plus mats.
const PSD_OPEN: Profile = { duration: 1.7, accel: 0.25, decel: 0.35, rebound: 0.012, reboundDur: 0.18 };
const PSD_CLOSE: Profile = { duration: 0.9, accel: 0.25, decel: 0.12, rebound: 0.028, reboundDur: 0.2 };

// Position 0..1 sur un profil trapézoïdal de vitesse : rampe quadratique au
// départ, vitesse constante, rampe quadratique à l'arrivée.
function trapezoid(u: number, a: number, d: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const v = 1 / (1 - a / 2 - d / 2); // vitesse de croisière
  if (u < a) return (v * u * u) / (2 * a);
  if (u > 1 - d) {
    const r = 1 - u;
    return 1 - (v * r * r) / (2 * d);
  }
  return (v * a) / 2 + v * (u - a);
}

// Progression 0..1 d'un mouvement, rebond en butée compris : la porte touche
// sa butée à t = duration, recule légèrement, puis se cale.
function movePos(t: number, p: Profile): number {
  if (t <= 0) return 0;
  if (t < p.duration) return trapezoid(t / p.duration, p.accel, p.decel);
  const tr = t - p.duration;
  if (tr < p.reboundDur) return 1 - p.rebound * Math.sin((Math.PI * tr) / p.reboundDur);
  return 1;
}

// Ouverture (0 fermé → 1 ouvert) d'une porte de la rame, avec retard optionnel.
export function trainDoorPos(lag = 0): number {
  const p = runtime.doorTarget === 1 ? TRAIN_OPEN : TRAIN_CLOSE;
  const m = movePos(runtime.doorT - lag, p);
  return runtime.doorTarget === 1 ? m : 1 - m;
}

// Ouverture (0..1) d'une porte palière du quai, avec retard optionnel.
export function psdDoorPos(lag = 0): number {
  const p = runtime.psdTarget === 1 ? PSD_OPEN : PSD_CLOSE;
  const m = movePos(runtime.psdT - lag, p);
  return runtime.psdTarget === 1 ? m : 1 - m;
}

let trainImpactsFired = Infinity;
let psdImpactFired = true;
let prevTrain = 0;
let prevPsd = 0;

export function setTrainDoors(target: 0 | 1): void {
  if (runtime.doorTarget === target) return;
  runtime.doorTarget = target;
  runtime.doorT = 0;
  trainImpactsFired = 0;
  audio.doorClunk(0.16); // déverrouillage avant la mise en mouvement
}

export function setPsdDoors(target: 0 | 1): void {
  if (runtime.psdTarget === target) return;
  runtime.psdTarget = target;
  runtime.psdT = 0;
  psdImpactFired = false;
  // La cinématique continue de tourner même sans portes de quai — le cycle
  // station n'a pas à connaître la gare — mais on n'entend pas déverrouiller
  // ce qui n'existe pas.
  if (runtime.psdPresent) audio.psdClunk(0.09);
}

// À appeler chaque frame : avance les horloges, publie les positions de
// référence dans runtime et déclenche les sons mécaniques (chocs en butée,
// frottement de glissière proportionnel à la vitesse).
export function updateDoorMotion(dt: number): void {
  runtime.doorT += dt;
  runtime.psdT += dt;
  const train = trainDoorPos(0);
  const psd = psdDoorPos(0);
  runtime.doorOpen = train;
  runtime.psdOpen = psd;

  // Chocs en butée de la rame, un par porte, dans l'ordre de leurs retards.
  const tp = runtime.doorTarget === 1 ? TRAIN_OPEN : TRAIN_CLOSE;
  while (
    trainImpactsFired < sortedTrainLags.length &&
    runtime.doorT >= tp.duration + sortedTrainLags[trainImpactsFired]
  ) {
    trainImpactsFired += 1;
    audio.doorClunk(runtime.doorTarget === 1 ? 0.13 : 0.28);
  }

  // Choc unique et plus mat pour les portes palières (elles sont dehors).
  const pp = runtime.psdTarget === 1 ? PSD_OPEN : PSD_CLOSE;
  if (!psdImpactFired && runtime.psdT >= pp.duration) {
    psdImpactFired = true;
    if (runtime.psdPresent) audio.psdClunk(runtime.psdTarget === 1 ? 0.07 : 0.15);
  }

  if (dt > 0) {
    const vTrain = Math.abs(train - prevTrain) / dt;
    const vPsd = runtime.psdPresent ? Math.abs(psd - prevPsd) / dt : 0;
    audio.setDoorSlide(Math.min(1, vTrain * 1.6), Math.min(1, vPsd * 1.6));
  }
  prevTrain = train;
  prevPsd = psd;
}

export function resetDoorMotion(): void {
  trainImpactsFired = Infinity;
  psdImpactFired = true;
  prevTrain = 0;
  prevPsd = 0;
}

// Pose les portes (rame + quai) à un instant déjà écoulé, sans sons ni chocs :
// utilisé pour un démarrage au milieu d'une phase d'arrêt.
export function seedDoorMotion(
  trainTarget: 0 | 1,
  trainT: number,
  psdTarget: 0 | 1,
  psdT: number,
): void {
  runtime.doorTarget = trainTarget;
  runtime.doorT = trainT;
  runtime.psdTarget = psdTarget;
  runtime.psdT = psdT;
  trainImpactsFired = Infinity;
  psdImpactFired = true;
  runtime.doorOpen = trainDoorPos(0);
  runtime.psdOpen = psdDoorPos(0);
  prevTrain = runtime.doorOpen;
  prevPsd = runtime.psdOpen;
}
