// Cinématique mécanique des portes : profil de vitesse trapézoïdal (démarrage
// franc du moteur, croisière, arrivée en butée) avec claquement de
// déverrouillage au départ, choc métallique et léger rebond à l'impact.
// Les portes palières du quai (ホームドア) sont pilotées séparément et en
// décalé : la rame et le quai ne bougent jamais exactement en même temps,
// et chaque porte de la rame part avec son propre petit retard, comme des
// moteurs jamais parfaitement synchrones.

import { CONFIG } from '../data/config';
import { carZ } from '../data/e235';
import { runtime } from './runtime';
import { worldToPlatform } from './playerFrame';
import * as audio from './audioEngine';

// Retards retirés au sort à chaque station : quelle porte de la rame part en
// premier, de combien traînent les autres, le retard propre de chaque
// portique du quai et le décalage global quai/rame changent d'une gare à
// l'autre - jamais deux arrêts identiques.
const trainLags: Record<number, number> = {};
let sortedTrainLags: number[] = [];
let psdGateLags: number[] = [];
// Décalages du quai sur la rame (s) : début d'ouverture et de fermeture.
export const stationTimings = { psdOpenDelay: 0.8, psdCloseDelay: 0.8 };

/**
 * Tire les retards de l'arrêt qui commence.
 *
 * Le générateur est INJECTÉ, avec `Math.random` par défaut : en solo rien ne
 * change, mais dans un salon les deux côtés du fil déroulent la même suite à
 * partir d'une seule graine de trente-deux bits (systems/net/worldDecisions,
 * `doorRandom`). Trente-huit nombres pour quatre octets - au-delà de trois
 * tirages liés, on transmet la graine et non les valeurs.
 *
 * L'ordre des appels ci-dessous est donc devenu SIGNIFICATIF : deux clients qui
 * ne tireraient pas dans le même ordre obtiendraient des portes différentes à
 * partir de la même graine. C'est le prix de la graine, et c'est pour ça qu'on
 * ne la réserve qu'aux séries d'un seul tenant comme celle-ci.
 */
export function randomizeDoorTimings(random: () => number = Math.random): void {
  // Une porte part immédiatement, les autres traînent chacune un peu.
  const raw = CONFIG.doorCenters.map(() => random() * 0.3);
  const min = Math.min(...raw);
  CONFIG.doorCenters.forEach((dz, i) => {
    trainLags[dz] = raw[i] - min;
  });
  sortedTrainLags = Object.values(trainLags).sort((a, b) => a - b);
  psdGateLags = Array.from({ length: 32 }, () => random() * 0.3);
  stationTimings.psdOpenDelay = 0.55 + random() * 0.6;
  stationTimings.psdCloseDelay = 0.55 + random() * 0.4;
}

// Un tirage à l'IMPORT du module vivait ici, et il fallait le retirer.
//
// Il s'exécutait au chargement, c'est-à-dire avant que le joueur ait choisi
// quoi que ce soit et, désormais, avant qu'on sache si l'on mène la rame ou si
// l'on suit celle d'un autre. Un suiveur consommait donc trente-huit nombres
// hors protocole, sur des retards qui seraient de toute façon remplacés à
// l'entrée en freinage.
//
// Les valeurs par défaut ci-dessus (0,8 s de décalage quai/rame, aucun retard
// de vantail) suffisent parfaitement à tenir jusqu'au premier arrêt : elles
// décrivent une rame dont toutes les portes partent ensemble, ce qu'aucun arrêt
// réel ne fait mais qu'aucun œil ne voit avant que `randomizeStopTimings` n'ait
// tiré les vraies.

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
const PSD_CLOSE: Profile = { duration: CONFIG.psdCloseTime, accel: 0.25, decel: 0.12, rebound: 0.028, reboundDur: 0.2 };

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

// --- La porte qui rencontre un obstacle ----------------------------------
//
// Une porte bloquée quitte la chorégraphie d'ensemble : elle a sa propre
// horloge, sa propre course - jamais une course pleine, elle repart d'où elle
// est - et une butée souple qui l'empêche d'atteindre sa position fermée.
// La porte palière en vis-à-vis suit le même mouvement, avec le retard
// habituel du quai sur la rame.
//
// Ce bloc ne tient QUE la mécanique. Qui bloque, combien de temps, et ce que
// le conducteur en fait, c'est systems/doorObstruction.

interface BlockedDoor {
  /** Voiture (index dans CONSIST) et centre z de la porte dans la voiture. */
  car: number;
  dz: number;
  /** Ouverture au début du mouvement courant, et ouverture visée. */
  from: number;
  /** Idem pour la porte palière en vis-à-vis, qui n'en est pas au même point. */
  psdFrom: number;
  to: 0 | 1;
  /** Horloge et durée du mouvement courant (s). */
  t: number;
  dur: number;
  /** Ouverture minimale imposée par l'obstacle (0 = passage dégagé). */
  gap: number;
  /** Ouverture courante du vantail de la rame, et de la porte palière. */
  pos: number;
  psdPos: number;
  /** Le vantail a touché l'obstacle sur ce mouvement-ci. */
  touched: boolean;
  /** Instant du contact dans le mouvement courant (s), -1 tant qu'il n'a pas eu lieu. */
  touchT: number;
  /** z de la baie du quai en vis-à-vis, repère quai (recalculé par frame). */
  psdZ: number;
}

let blocked: BlockedDoor | null = null;

/**
 * Retard de la porte palière sur la porte de la rame concernée. C'est le même
 * décalage que pour l'ensemble - le quai suit toujours la rame - mais fixé
 * ici : le tirage de la gare porte sur la fermeture d'ensemble, pas sur une
 * réouverture décidée porte par porte.
 */
const BLOCKED_PSD_LAG = 0.9;

/**
 * Recul du vantail après contact (fraction de course) et temps qu'il y met.
 *
 * Le E235 ne pousse pas : la force de maintien est réduite avant le démarrage
 * pour qu'on puisse se dégager. La porte touche, s'arrête, et relâche de deux
 * centimètres au lieu de rester en appui.
 */
const CONTACT_RELIEF = 0.016;
const CONTACT_RELIEF_TIME = 0.3;

/** Durée d'un mouvement partiel : proportionnelle à la course qui reste. */
function partialDuration(from: number, to: number): number {
  const p = to === 1 ? TRAIN_OPEN : TRAIN_CLOSE;
  return Math.max(0.15, p.duration * Math.abs(to - from));
}

/**
 * Une porte rencontre un obstacle en se fermant : elle sort de l'ensemble et
 * part de sa position courante vers la fermeture, qu'elle n'atteindra pas.
 */
export function startBlockedDoor(car: number, dz: number, gap: number): void {
  const from = trainDoorPos(trainDoorLag(dz));
  const psdFrom = psdDoorPos(0);
  blocked = {
    car,
    dz,
    from,
    psdFrom,
    to: 0,
    t: 0,
    dur: partialDuration(from, 0),
    gap,
    pos: from,
    psdPos: psdFrom,
    touched: false,
    touchT: -1,
    psdZ: Number.NaN,
  };
}

/**
 * Commande de réouverture (再開閉スイッチ) maintenue, puis relâchée : la porte
 * repart de là où elle est, dans l'autre sens.
 */
export function moveBlockedDoor(to: 0 | 1): void {
  if (!blocked || blocked.to === to) return;
  blocked.from = blocked.pos;
  blocked.psdFrom = blocked.psdPos;
  blocked.to = to;
  blocked.t = 0;
  blocked.dur = partialDuration(blocked.from, to);
  blocked.touched = false;
  blocked.touchT = -1;
  audio.doorClunk(0.1);
}

/**
 * Change ce que l'obstacle laisse passer (0 = plus d'obstacle du tout).
 *
 * Une porte arrêtée sur un obstacle qui s'en va REPREND sa course d'où elle en
 * est : son mouvement était fini, la rendre libre sans la relancer la ferait
 * sauter en butée d'un seul coup.
 */
export function setBlockedGap(gap: number): void {
  if (!blocked) return;
  const stopped = blocked.touched && blocked.to === 0;
  blocked.gap = gap;
  if (gap === 0 && stopped) {
    blocked.from = blocked.pos;
    blocked.psdFrom = blocked.psdPos;
    blocked.t = 0;
    blocked.dur = partialDuration(blocked.from, 0);
    blocked.touched = false;
    blocked.touchT = -1;
  }
}

/** L'obstacle est dégagé : la porte peut aller jusqu'à sa butée. */
export function releaseBlockedGap(): void {
  setBlockedGap(0);
}

/** La porte rejoint la chorégraphie d'ensemble (fin de procédure, reset). */
export function clearBlockedDoor(): void {
  blocked = null;
}

export interface BlockedDoorView {
  car: number;
  dz: number;
  pos: number;
  to: 0 | 1;
  gap: number;
  touched: boolean;
  /** Le mouvement courant est terminé (butée, obstacle, ou fin de course). */
  settled: boolean;
}

/** État de la porte bloquée, ou null s'il n'y en a pas. */
export function blockedDoor(): BlockedDoorView | null {
  if (!blocked) return null;
  return {
    car: blocked.car,
    dz: blocked.dz,
    pos: blocked.pos,
    to: blocked.to,
    gap: blocked.gap,
    touched: blocked.touched,
    settled: blocked.touched || blocked.t >= blocked.dur,
  };
}

/** Cette porte-là est-elle la porte bloquée ? */
export function isBlockedDoor(car: number, dz: number): boolean {
  return blocked !== null && blocked.car === car && Math.abs(blocked.dz - dz) < 0.01;
}

/**
 * Position libre du vantail bloqué à l'instant t : ce qu'elle serait sans
 * obstacle, sur une course partielle (elle repart de là où elle est).
 */
function blockedFreePos(b: BlockedDoor): number {
  const p = b.to === 1 ? TRAIN_OPEN : TRAIN_CLOSE;
  const u = b.dur > 0 ? Math.min(1, b.t / b.dur) : 1;
  return b.from + (b.to - b.from) * trapezoid(u, p.accel, p.decel);
}

/** Ouverture (0..1) d'une porte de la rame, voiture par voiture. */
export function trainDoorPosAt(car: number, dz: number): number {
  if (blocked && blocked.car === car && Math.abs(blocked.dz - dz) < 0.01) return blocked.pos;
  return trainDoorPos(trainDoorLag(dz));
}

/**
 * Ouverture (0..1) d'une baie du quai, repérée par son axe en repère quai :
 * celle qui fait face à la porte bloquée suit cette porte, les autres suivent
 * l'ensemble.
 */
export function psdDoorPosAt(gateZ: number, lag = 0): number {
  if (blocked && Number.isFinite(blocked.psdZ) && Math.abs(gateZ - blocked.psdZ) < 0.5) {
    return blocked.psdPos;
  }
  return psdDoorPos(lag);
}

const psdProbe = { x: 0, z: 0 };

// Avance la porte bloquée d'une frame : vantail de la rame, porte palière en
// vis-à-vis, et le coup sourd du contact (un corps, pas une butée : rien ne
// claque, rien ne verrouille).
function updateBlockedDoor(dt: number): void {
  const b = blocked;
  if (!b) return;
  b.t += dt;
  const free = blockedFreePos(b);
  if (b.to === 0 && free <= b.gap && b.gap > 0) {
    // Contact : la porte s'arrête sur l'obstacle et relâche aussitôt sa
    // pression de deux centimètres, au lieu de rester en appui.
    if (!b.touched) {
      b.touched = true;
      b.touchT = b.t;
      audio.doorObstacleBump(Math.min(0.3, 0.1 + b.gap));
    }
    const relief = Math.min(1, (b.t - b.touchT) / CONTACT_RELIEF_TIME);
    b.pos = b.gap + CONTACT_RELIEF * relief;
  } else {
    b.pos = free;
  }
  // Porte palière : même mouvement, décalé, et arrêtée par le même obstacle.
  // Elle part de SA position au début du mouvement (`psdFrom`) et non de celle
  // du vantail de la rame : les deux sont voisines à l'instant du blocage, mais
  // le quai suit la rame avec un retard, et prendre l'origine de l'autre faisait
  // sauter la baie d'autant.
  const p = b.to === 1 ? PSD_OPEN : PSD_CLOSE;
  const u = b.dur > 0 ? Math.min(1, Math.max(0, (b.t - BLOCKED_PSD_LAG) / b.dur)) : 1;
  const raw = b.psdFrom + (b.to - b.psdFrom) * trapezoid(u, p.accel, p.decel);
  b.psdPos = b.to === 0 ? Math.max(raw, b.gap) : raw;
  // Axe de la baie en vis-à-vis, en repère quai : la rame glisse (trainZ) et le
  // quai se retourne selon le côté d'ouverture.
  worldToPlatform(0, carZ(b.car) + b.dz + runtime.trainZ, psdProbe);
  b.psdZ = psdProbe.z;
}

/** Ouverture de la porte bloquée, ou -1 s'il n'y en a pas. */
export function blockedDoorOpen(): number {
  return blocked ? blocked.pos : -1;
}

let trainImpactsFired = Infinity;
let psdImpactFired = true;
let prevTrain = 0;
let prevPsd = 0;
let prevBlocked = 0;

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
  // La cinématique continue de tourner même sans portes de quai - le cycle
  // station n'a pas à connaître la gare - mais on n'entend pas déverrouiller
  // ce qui n'existe pas.
  if (!runtime.psdPresent) return;
  audio.psdClunk(0.09);
  // Les baies s'annoncent DANS LES DEUX SENS, et le signal part avec le
  // déverrouillage, pas à la fin de la course : c'est un avertissement, il ne
  // sert qu'à ceux qui sont encore devant les vantaux. Chaque mouvement le
  // relance, réouverture après porte bloquée comprise - sur un vrai quai, une
  // baie qui repart resonne (voir systems/doorObstruction).
  //
  // L'ouverture est un morceau qui se joue en entier, et c'est ici qu'il part.
  // La fermeture, elle, est une BOUCLE dont updateDoorMotion tient l'ouverture
  // et l'arrêt d'après l'état des vantaux : on ne fait que la couper net quand
  // les baies repartent dans l'autre sens, pour ne pas laisser une paire
  // chevaucher la première note du signal d'ouverture.
  if (target === 1) {
    audio.psdCloseWarning(false);
    audio.psdOpenChime();
  }
}

/**
 * Une baie est-elle retenue entrebâillée ?
 *
 * L'ensemble ne suffit pas à dire que le passage est refermé : pendant une
 * procédure de porte bloquée, la baie en vis-à-vis suit le vantail retenu et
 * reste ouverte alors que toutes les autres sont closes depuis longtemps -
 * elle peut même repartir à l'ouverture toute seule (moveBlockedDoor). Tant
 * que ce passage-là n'est pas dégagé, on ne sait pas quand il se fermera, et
 * le quai continue d'avertir : c'est exactement ce que fait une vraie gare.
 */
function psdHeldOpen(): boolean {
  return blocked !== null && blocked.psdPos > 0.001;
}

// À appeler chaque frame : avance les horloges, publie les positions de
// référence dans runtime et déclenche les sons mécaniques (chocs en butée,
// frottement de glissière proportionnel à la vitesse).
export function updateDoorMotion(dt: number): void {
  runtime.doorT += dt;
  runtime.psdT += dt;
  updateBlockedDoor(dt);
  const train = trainDoorPos(0);
  const psd = psdDoorPos(0);
  // `doorOpen` reste la porte de RÉFÉRENCE : c'est elle qui décide des seuils
  // franchissables, de ce que le quai laisse entendre et de l'ambiance. Une
  // porte bloquée qui rouvre seule n'ouvre pas la rame - et n'a d'ailleurs
  // jamais servi à monter : quelqu'un est dedans.
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

  // L'avertisseur de fermeture suit l'ÉTAT du passage, et non le geste qui l'a
  // lancé : il tourne tant que les baies vont vers la fermeture sans y être, et
  // se tait quand tout est joint. C'est ce qui le rend juste dans les cas
  // tordus - une baie seule qui se referme après une tentative ratée n'appelle
  // aucun setPsdDoors, et un signal branché sur la commande resterait muet là
  // où un vrai quai avertit.
  //
  // L'échéance est la BUTÉE, pas l'extinction du rebond : les vantaux sont
  // joints à `PSD_CLOSE.duration`, le centimètre qui suit n'est qu'un ressaut.
  // Sur une course normale - 0,9 s - la boucle donne ainsi exactement les trois
  // paires Mi5–Do5 de data/psdCloseWarning et s'arrête sur le choc ; sur une
  // baie retenue, elle n'a plus d'échéance et continue.
  const closing = runtime.psdPresent && runtime.psdTarget === 0;
  const closesIn = psdHeldOpen()
    ? Number.POSITIVE_INFINITY
    : PSD_CLOSE.duration - runtime.psdT;
  if (closing && closesIn > 0) {
    audio.psdCloseWarning(true);
    audio.pumpPsdCloseWarning(closesIn);
  } else {
    audio.psdCloseWarning(false);
  }

  if (dt > 0) {
    // Une porte seule glisse aussi, et c'est même tout ce qu'on entend pendant
    // une réouverture : sa vitesse compte au même titre que celle de l'ensemble.
    const vTrain = Math.max(
      Math.abs(train - prevTrain),
      blocked ? Math.abs(blocked.pos - prevBlocked) : 0,
    ) / dt;
    const vPsd = runtime.psdPresent ? Math.abs(psd - prevPsd) / dt : 0;
    audio.setDoorSlide(Math.min(1, vTrain * 1.6), Math.min(1, vPsd * 1.6));
  }
  prevTrain = train;
  prevPsd = psd;
  prevBlocked = blocked ? blocked.pos : 0;
}

export function resetDoorMotion(): void {
  audio.psdCloseWarning(false);
  trainImpactsFired = Infinity;
  psdImpactFired = true;
  prevTrain = 0;
  prevPsd = 0;
  prevBlocked = 0;
  blocked = null;
}

// Pose les portes (rame + quai) à un instant déjà écoulé, sans sons ni chocs :
// utilisé pour un démarrage au milieu d'une phase d'arrêt.
export function seedDoorMotion(
  trainTarget: 0 | 1,
  trainT: number,
  psdTarget: 0 | 1,
  psdT: number,
): void {
  // Reprise au milieu d'un arrêt : on repose les portes où elles en sont, sans
  // rien faire sonner - y compris l'avertisseur, qui ne doit pas repartir pour
  // une fermeture déjà consommée.
  audio.psdCloseWarning(false);
  runtime.doorTarget = trainTarget;
  runtime.doorT = trainT;
  runtime.psdTarget = psdTarget;
  runtime.psdT = psdT;
  trainImpactsFired = Infinity;
  psdImpactFired = true;
  blocked = null;
  runtime.doorOpen = trainDoorPos(0);
  runtime.psdOpen = psdDoorPos(0);
  prevTrain = runtime.doorOpen;
  prevPsd = runtime.psdOpen;
}
