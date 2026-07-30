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
import { paxList, removeAssistedPassenger, type Pax } from './passengers';
import { worldToPlatform } from './playerFrame';
import { runtime } from './runtime';
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
  removePassenger(id: number): void;
  restorePassenger(id: number): void;
}

const GAP_MIN = 52; // environ deux heures aux temps de parcours du jeu
const GAP_MAX = 104; // environ quatre heures
const FIRST_MIN = 18;
const FIRST_MAX = 58;

let stationsUntil = drawInt(FIRST_MIN, FIRST_MAX, Math.random);
let stage: PassengerAssistanceStage = 'none';
let plan: AssistancePlan | null = null;
let elapsed = 0;
let passengerId: number | null = null;
let announcedWait = false;
let agentSpoke = false;

type Snapshot = Pick<Pax, 'state' | 'action' | 'bodyLean' | 'bodyRoll' | 'headPitch' | 'pos' | 'yaw'>;
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

function defaultPose(id: number, doorZ: number): void {
  const p = paxList[id];
  if (!p) return;
  snapshot = { state: p.state, action: p.action, bodyLean: p.bodyLean, bodyRoll: p.bodyRoll,
    headPitch: p.headPitch, pos: p.pos.clone(), yaw: p.yaw };
  p.action = 'none';
  p.bodyLean = 0.42;
  p.bodyRoll = 0.08;
  p.headPitch = 0.5;
  p.pos.z += Math.max(-0.8, Math.min(0.8, doorZ - p.pos.z));
}

function defaultRemove(id: number): void {
  removeAssistedPassenger(id);
}

function defaultRestore(id: number): void {
  const p = paxList[id];
  if (!p || !snapshot) return;
  p.state = snapshot.state; p.action = snapshot.action; p.bodyLean = snapshot.bodyLean;
  p.bodyRoll = snapshot.bodyRoll; p.headPitch = snapshot.headPitch; p.pos.copy(snapshot.pos); p.yaw = snapshot.yaw;
}

const defaultEffects: AssistanceEffects = {
  announce: (lines) => say(lines),
  callAgent: (doorZ) => { const out = { x: 0, z: 0 }; worldToPlatform(0, doorZ + runtime.trainZ, out); callPlatformAgent(out.z); },
  agentReady: platformAgentReady,
  agentSpeak: () => { platformAgentAssistanceSays(); },
  releaseAgent: releasePlatformAgent,
  selectPassenger: defaultSelect,
  posePassenger: defaultPose,
  removePassenger: defaultRemove,
  restorePassenger: defaultRestore,
};

export function updatePassengerAssistance(dt: number, effects: AssistanceEffects = defaultEffects): void {
  if (stage === 'none' || stage === 'released' || !plan) return;
  if (stage === 'armed') {
    if (useStore.getState().phase !== 'dwell' || runtime.doorOpen < 0.8 || runtime.doorTarget !== 1 || conflicting()) return;
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
  if (stage === 'agent-arriving' && elapsed >= plan.reaction && effects.agentReady()) {
    if (!agentSpoke) { effects.agentSpeak(); agentSpoke = true; }
    stage = 'assisting'; elapsed = 0;
  } else if (stage === 'assisting') {
    if (!announcedWait && plan.prolongedAt != null && elapsed >= plan.prolongedAt) {
      effects.announce(passengerAssistanceWaitAnnouncement()); announcedWait = true;
    }
    if (elapsed >= plan.assist) { stage = 'passenger-alighting'; elapsed = 0; }
  } else if (stage === 'passenger-alighting' && elapsed >= plan.alight) {
    effects.removePassenger(passengerId!); snapshot = null; stage = 'final-check'; elapsed = 0;
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
