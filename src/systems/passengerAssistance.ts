import * as THREE from 'three';
import { CONFIG } from '../data/config';
import {
  passengerAssistanceInitialAnnouncement,
  passengerAssistanceResumeAnnouncement,
  passengerAssistanceWaitAnnouncement,
  type Utterance,
} from '../data/announcements';
import { useStore } from '../store';
import { cancelArmedDoorObstruction, doorObstructionActive } from './doorObstruction';
import { setDepartureBlockers } from './departureSequence';
import { callPlatformAgent, platformAgentAssistanceSays, platformAgentReady, releasePlatformAgent } from './platformAgent';
import { paxList, type Pax } from './passengers';
import { worldToPlatform } from './playerFrame';
import { runtime } from './runtime';
import { seatOccupant, standOccupant } from './seats';
import { say } from './speech';

export type AssistanceSeverity = 'minor' | 'standard' | 'serious';
export type PassengerAssistanceStage =
  | 'none' | 'armed' | 'agent-arriving' | 'assisting' | 'passenger-alighting'
  | 'final-check' | 'resume-announcement' | 'released';

export interface AssistancePlan {
  severity: AssistanceSeverity;
  reaction: number;
  assist: number;
  alight: number;
  finalCheck: number;
  resume: number;
  prolongedAt: number | null;
  doorZ: number;
}

export interface AssistanceEffects {
  announce(lines: Utterance[]): void;
  callAgent(doorZ: number): void;
  agentReady(): boolean;
  agentSpeak(): void;
  releaseAgent(): void;
  selectPassenger(doorZ: number): number | null;
  posePassenger(id: number, doorZ: number): void;
  beginPassengerAlight(id: number, doorZ: number): boolean;
  passengerAlighted(id: number): boolean;
  removePassenger(id: number): void;
  restorePassenger(id: number): void;
}

const GAP_MIN = 52; // environ deux heures aux temps de parcours du jeu
const GAP_MAX = 104; // environ quatre heures
const FIRST_MIN = 18;
const FIRST_MAX = 58;
/** L'échange ordinaire démarre à 1,6 s : on choisit le malade juste après. */
const SELECT_AFTER_EXCHANGE = 1.7;
/** Même seuil que le relais rame → quai de systems/passengers. */
const DOOR_HANDOVER_X = 2.0;

let stationsUntil = drawInt(FIRST_MIN, FIRST_MAX, Math.random);
let stage: PassengerAssistanceStage = 'none';
let plan: AssistancePlan | null = null;
let elapsed = 0;
let passengerId: number | null = null;
let announcedWait = false;
let agentSpoke = false;

type Snapshot = Pick<Pax,
  | 'state' | 'action' | 'anchor' | 'anchorLeft' | 'interludeT'
  | 'bodyLean' | 'bodyRoll' | 'headPitch' | 'pos' | 'yaw' | 'targetYaw'
  | 'seatSlot' | 'standSlot' | 'afterWalk' | 'exitDoorZ' | 'wpi'
> & { waypoints: THREE.Vector3[] };
let snapshot: Snapshot | null = null;

function drawInt(min: number, max: number, random: () => number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function drawPassengerAssistancePlan(random: () => number = Math.random): AssistancePlan {
  const r = random();
  const severity: AssistanceSeverity = r < 0.3 ? 'minor' : r < 0.82 ? 'standard' : 'serious';
  const assistRange = severity === 'minor' ? [35, 50] : severity === 'standard' ? [52, 78] : [80, 100];
  const assist = assistRange[0] + random() * (assistRange[1] - assistRange[0]);
  return {
    severity,
    reaction: 3 + random() * 5,
    assist,
    // Délai de sécurité : la transition se fait normalement dès que le PNJ
    // atteint réellement le quai, jamais simplement parce que le chrono expire.
    alight: 8 + random() * 12,
    finalCheck: 5 + random() * 10,
    resume: 5 + random() * 5,
    prolongedAt: assist >= 70 ? 55 : null,
    doorZ: CONFIG.doorCenters[Math.floor(random() * CONFIG.doorCenters.length)],
  };
}

function conflicting(): boolean {
  const em = runtime.emergencyStop.stage !== 'none';
  const b = runtime.departureBlockers;
  return em || doorObstructionActive() || b.doorBlocked || b.heldAtStation || b.signalStop || b.emergency;
}

export function canForcePassengerAssistance(): boolean {
  const phase = useStore.getState().phase;
  return stage === 'none' && !conflicting() && runtime.playerFrame === 'car' &&
    (phase === 'cruise' || (phase === 'dwell' && runtime.doorTarget === 1 && runtime.doorOpen > 0.8));
}

export function forcePassengerAssistance(random: () => number = Math.random): boolean {
  if (!canForcePassengerAssistance()) return false;
  plan = drawPassengerAssistancePlan(random);
  stage = 'armed';
  return true;
}

/** Appele une fois au debut de chaque nouvelle course. */
export function rollPassengerAssistance(random: () => number = Math.random): void {
  if (stage !== 'none') return;
  if (stationsUntil-- > 0) return;
  plan = drawPassengerAssistancePlan(random);
  stage = 'armed';
  stationsUntil = drawInt(GAP_MIN, GAP_MAX, random);
}

function defaultSelect(doorZ: number): number | null {
  const candidates = paxList.filter((p) => p.state === 'seated' || p.state === 'standing');
  candidates.sort((a, b) => Math.abs(a.pos.z - doorZ) - Math.abs(b.pos.z - doorZ));
  return candidates[0]?.id ?? null;
}

function defaultPose(id: number, _doorZ: number): void {
  const p = paxList[id];
  if (!p) return;
  if (!snapshot) {
    snapshot = {
      state: p.state,
      action: p.action,
      anchor: p.anchor,
      anchorLeft: p.anchorLeft,
      interludeT: p.interludeT,
      bodyLean: p.bodyLean,
      bodyRoll: p.bodyRoll,
      headPitch: p.headPitch,
      pos: p.pos.clone(),
      yaw: p.yaw,
      targetYaw: p.targetYaw,
      seatSlot: p.seatSlot,
      standSlot: p.standSlot,
      afterWalk: p.afterWalk,
      exitDoorZ: p.exitDoorZ,
      wpi: p.wpi,
      waypoints: p.waypoints.map((wp) => wp.clone()),
    };
  }
  // Réappliqué chaque frame pendant l'intervention : la couche de vie ordinaire
  // ne peut plus redresser le malade ou relancer son téléphone entre deux ticks.
  p.action = 'none';
  p.anchor = 'none';
  p.anchorLeft = 0;
  p.interludeT = 999;
  p.partner = -1;
  // Conserver ici l'état visuel d'origine est essentiel pour un voyageur assis :
  // `alighting` ferait immédiatement afficher son rig debout, alors que sa
  // position et son cap restent ceux du siège. Le modèle apparaissait donc
  // planté de biais dans le coussin pendant toute l'intervention. Les compteurs
  // ordinaires ne peuvent pas l'emporter (la sélection suit déjà l'échange) et
  // cette pose est réappliquée à chaque frame jusqu'au vrai départ accompagné.
  p.state = snapshot?.state ?? p.state;
  p.afterWalk = 'hidden';
  p.waypoints.length = 0;
  p.wpi = 0;
  p.bodyLean = 0.42;
  p.bodyRoll = 0.08;
  p.headPitch = 0.5;
}

function releasePassengerSlots(p: Pax): void {
  if (p.seatSlot >= 0 && seatOccupant[p.seatSlot] === p.id) seatOccupant[p.seatSlot] = null;
  if (p.standSlot >= 0 && standOccupant[p.standSlot] === p.id) standOccupant[p.standSlot] = null;
  p.seatSlot = -1;
  p.standSlot = -1;
}

function defaultBeginAlight(id: number, doorZ: number): boolean {
  const p = paxList[id];
  if (!p || (p.state !== 'seated' && p.state !== 'standing')) return false;
  const side = useStore.getState().doorSide;
  releasePassengerSlots(p);
  p.action = 'none';
  p.anchor = 'none';
  p.anchorLeft = 0;
  p.partner = -1;
  p.state = 'alighting';
  p.afterWalk = 'hidden';
  p.exitDoorZ = doorZ;
  // Le malade se redresse pour descendre. Sans ça, la pose « souffrant »
  // (buste plié ~0,42 rad, tête basse) reste posée alors que l'état n'est plus
  // `seated` : le rendu ne bride plus l'inclinaison assise (cf.
  // LibraryPassengers/ProceduralPassengers) et le voyageur apparaît plié à 45°
  // dans son siège pendant toute la descente - jusqu'à la marche qui la relâche,
  // voire toute la fenêtre du garde-fou si le pas se bloque.
  p.bodyLean = 0;
  p.bodyRoll = 0;
  p.headPitch = 0;
  p.headRoll = 0;
  p.waypoints = [
    new THREE.Vector3(side * 0.3, 0, p.pos.z),
    new THREE.Vector3(side * 0.95, 0, doorZ),
    new THREE.Vector3(side * DOOR_HANDOVER_X, 0, doorZ),
  ];
  p.wpi = 0;
  return true;
}

function defaultPassengerAlighted(id: number): boolean {
  return paxList[id]?.state === 'hidden';
}

function defaultRemove(id: number): void {
  const p = paxList[id];
  if (!p) return;
  releasePassengerSlots(p);
  p.state = 'hidden';
  p.waypoints.length = 0;
  p.wpi = 0;
  p.partner = -1;
  // On efface aussi la pose « souffrant » : le slot retourne au pool et ne doit
  // pas ressurgir plié en avant avant que la montée ne la relâche.
  p.bodyLean = 0;
  p.bodyRoll = 0;
  p.headPitch = 0;
  p.headRoll = 0;
}

function defaultRestore(id: number): void {
  const p = paxList[id];
  if (!p || !snapshot) return;
  releasePassengerSlots(p);
  p.state = snapshot.state;
  p.action = snapshot.action;
  p.anchor = snapshot.anchor;
  p.anchorLeft = snapshot.anchorLeft;
  p.interludeT = snapshot.interludeT;
  p.bodyLean = snapshot.bodyLean;
  p.bodyRoll = snapshot.bodyRoll;
  p.headPitch = snapshot.headPitch;
  p.pos.copy(snapshot.pos);
  p.yaw = snapshot.yaw;
  p.targetYaw = snapshot.targetYaw;
  p.seatSlot = snapshot.seatSlot;
  p.standSlot = snapshot.standSlot;
  if (p.seatSlot >= 0) seatOccupant[p.seatSlot] = p.id;
  if (p.standSlot >= 0) standOccupant[p.standSlot] = p.id;
  p.afterWalk = snapshot.afterWalk;
  p.exitDoorZ = snapshot.exitDoorZ;
  p.wpi = snapshot.wpi;
  p.waypoints = snapshot.waypoints.map((wp) => wp.clone());
}

const defaultEffects: AssistanceEffects = {
  announce: (lines) => say(lines),
  callAgent: (doorZ) => { const out = { x: 0, z: 0 }; worldToPlatform(0, doorZ + runtime.trainZ, out); callPlatformAgent(out.z); },
  agentReady: platformAgentReady,
  agentSpeak: () => { platformAgentAssistanceSays(); },
  releaseAgent: releasePlatformAgent,
  selectPassenger: defaultSelect,
  posePassenger: defaultPose,
  beginPassengerAlight: defaultBeginAlight,
  passengerAlighted: defaultPassengerAlighted,
  removePassenger: defaultRemove,
  restorePassenger: defaultRestore,
};

function finishPassengerAlighting(): void {
  snapshot = null;
  stage = 'final-check';
  elapsed = 0;
}

export function updatePassengerAssistance(dt: number, effects: AssistanceEffects = defaultEffects): void {
  if (stage === 'none' || stage === 'released' || !plan) return;
  if (stage === 'armed') {
    if (useStore.getState().phase !== 'dwell' || runtime.doorOpen < 0.8 || runtime.doorTarget !== 1 || conflicting()) return;
    // stationCycle lance l'échange ordinaire à 1,6 s. Le malade est choisi juste
    // après, afin qu'il ne puisse pas être emporté par la descente aléatoire.
    if (runtime.phaseT < SELECT_AFTER_EXCHANGE) return;
    cancelArmedDoorObstruction();
    passengerId = effects.selectPassenger(plan.doorZ);
    if (passengerId == null) { resetPassengerAssistance(effects); return; }
    effects.posePassenger(passengerId, plan.doorZ);
    setDepartureBlockers({ passengerAssistance: true });
    effects.announce(passengerAssistanceInitialAnnouncement());
    effects.callAgent(plan.doorZ);
    stage = 'agent-arriving'; elapsed = 0;
    return;
  }
  elapsed += dt;
  if ((stage === 'agent-arriving' || stage === 'assisting') && passengerId != null) {
    effects.posePassenger(passengerId, plan.doorZ);
  }
  if (stage === 'agent-arriving' && elapsed >= plan.reaction && effects.agentReady()) {
    if (!agentSpoke) { effects.agentSpeak(); agentSpoke = true; }
    stage = 'assisting'; elapsed = 0;
  } else if (stage === 'assisting') {
    if (!announcedWait && plan.prolongedAt != null && elapsed >= plan.prolongedAt) {
      effects.announce(passengerAssistanceWaitAnnouncement()); announcedWait = true;
    }
    if (elapsed >= plan.assist) {
      if (!effects.beginPassengerAlight(passengerId!, plan.doorZ)) {
        effects.removePassenger(passengerId!);
        finishPassengerAlighting();
      } else {
        stage = 'passenger-alighting'; elapsed = 0;
      }
    }
  } else if (stage === 'passenger-alighting') {
    if (effects.passengerAlighted(passengerId!)) {
      finishPassengerAlighting();
    } else if (elapsed >= plan.alight) {
      // Garde-fou uniquement : waypoint bloqué ou frame perdue. Le chemin normal
      // attend le passage réel de l'embrasure vers le pool du quai.
      effects.removePassenger(passengerId!);
      finishPassengerAlighting();
    }
  } else if (stage === 'final-check' && elapsed >= plan.finalCheck) {
    effects.releaseAgent(); effects.announce(passengerAssistanceResumeAnnouncement());
    stage = 'resume-announcement'; elapsed = 0;
  } else if (stage === 'resume-announcement' && elapsed >= plan.resume) {
    setDepartureBlockers({ passengerAssistance: false }); stage = 'released'; elapsed = 0;
  }
}

export function passengerAssistanceActive(): boolean { return stage !== 'none' && stage !== 'released'; }
export function passengerAssistanceStage(): PassengerAssistanceStage { return stage; }
export function passengerAssistanceBlocksDeparture(): boolean { return runtime.departureBlockers.passengerAssistance; }

export function resetPassengerAssistance(effects: AssistanceEffects = defaultEffects): void {
  if (passengerId != null && snapshot) effects.restorePassenger(passengerId);
  effects.releaseAgent();
  setDepartureBlockers({ passengerAssistance: false });
  stage = 'none'; plan = null; elapsed = 0; passengerId = null; snapshot = null;
  announcedWait = false; agentSpoke = false;
}

export function finishReleasedPassengerAssistance(): void {
  if (stage === 'released') { stage = 'none'; plan = null; passengerId = null; }
}
