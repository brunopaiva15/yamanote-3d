// Cibles de tête / buste pour chaque occupation PNJ.
// Les systèmes de rame et de quai appellent resolveMotion() chaque frame ;
// aucun dialogue : uniquement des gestes silencieux crédibles.

import * as THREE from 'three';
import type { PaxAction } from '../data/paxActions';
import { ACTION_BY_ID } from '../data/paxActions';
import { CONFIG } from '../data/config';
import { runtime } from './runtime';

export interface MotionTargets {
  yaw: number;
  pitch: number;
  lean: number;
  /** Roulis du buste (chute latérale). */
  roll: number;
  /** Décalage vertical (négatif = au sol). */
  drop: number;
  /** Vitesse de lissage (sneeze/cough/chute plus vifs). */
  speed: number;
}

export interface MotionContext {
  action: PaxAction;
  actionT: number;
  bobPhase: number;
  chatRole: 0 | 1;
  lookYawTarget: number;
  /** Position du PNJ. */
  posX: number;
  posZ: number;
  yaw: number;
  /** Cible partenaire (monde), si discussion. */
  partnerX?: number;
  partnerZ?: number;
  /** Joueur (repère voiture ou quai selon le contexte). */
  playerX: number;
  playerY: number;
  playerZ: number;
  /** Côté siège (+1 / -1) pour regarder la vitre ; 0 si debout. */
  seatSide?: number;
}

function clampYaw(d: number): number {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return THREE.MathUtils.clamp(d, -1.15, 1.15);
}

export function headYawToward(ctx: MotionContext, x: number, z: number): number {
  const world = Math.atan2(x - ctx.posX, z - ctx.posZ);
  return clampYaw(world - ctx.yaw);
}

function nearestDoorZ(z: number): number {
  let best: number = CONFIG.doorCenters[0];
  let bestD = Infinity;
  for (const dz of CONFIG.doorCenters) {
    const d = Math.abs(dz - z);
    if (d < bestD) {
      bestD = d;
      best = dz;
    }
  }
  return best;
}

const out: MotionTargets = { yaw: 0, pitch: 0, lean: 0, roll: 0, drop: 0, speed: 4.5 };

function set(
  yaw: number,
  pitch: number,
  lean = 0,
  speed = 4.5,
  roll = 0,
  drop = 0,
): MotionTargets {
  out.yaw = yaw;
  out.pitch = pitch;
  out.lean = lean;
  out.roll = roll;
  out.drop = drop;
  out.speed = speed;
  return out;
}

/** Calcule les cibles de tête / lean pour l'action courante. */
export function resolveMotion(ctx: MotionContext): MotionTargets {
  const def = ACTION_BY_ID.get(ctx.action);
  const motion = def?.motion ?? 'idle';
  const t = ctx.actionT;
  const phase = ctx.bobPhase;
  const role = ctx.chatRole;

  switch (motion) {
    case 'idle':
      return set(0, 0);
    case 'look':
      return set(ctx.lookYawTarget, 0.04);
    case 'phone':
    case 'read':
    case 'map':
      return set(0, 0.55);
    case 'doze':
      return set(0.25, 0.4 + Math.sin(phase * 0.9) * 0.05, 0.05);
    case 'stare':
      return set(
        headYawToward(ctx, ctx.playerX, ctx.playerZ),
        THREE.MathUtils.clamp((1.35 - ctx.playerY) * 0.3, -0.3, 0.25),
      );
    case 'chat':
    case 'sideChat':
    case 'gossip':
    case 'agree': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      const pitch =
        motion === 'gossip'
          ? Math.max(0, Math.sin(t * 2.8 + role * Math.PI)) * 0.11 + 0.04
          : Math.max(0, Math.sin(t * 2.4 + role * Math.PI)) * 0.09;
      return set(yaw, pitch, motion === 'gossip' ? 0.03 : 0);
    }
    case 'whisper': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      return set(
        headYawToward(ctx, ctx.partnerX, ctx.partnerZ),
        0.12 + Math.max(0, Math.sin(t * 2.1 + role * Math.PI)) * 0.06,
        0.06,
      );
    }
    case 'laugh': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      return set(
        headYawToward(ctx, ctx.partnerX, ctx.partnerZ),
        0.08 + Math.abs(Math.sin(t * 7.5)) * 0.14,
        0.04,
        10,
      );
    }
    case 'share': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0.5);
      // Les deux regardent un point entre eux, un peu bas (écran).
      const mx = (ctx.posX + ctx.partnerX) * 0.5;
      const mz = (ctx.posZ + ctx.partnerZ) * 0.5;
      return set(headYawToward(ctx, mx, mz), 0.48 + Math.sin(t * 1.2) * 0.03);
    }
    case 'couple': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      return set(headYawToward(ctx, ctx.partnerX, ctx.partnerZ) * 0.55, 0.06, 0.07);
    }
    case 'point': {
      // Regard vers la vitre, partenaire en périphérie.
      const side = ctx.seatSide ?? (ctx.posX >= 0 ? 1 : -1);
      const winYaw = headYawToward(ctx, ctx.posX + side * 1.2, ctx.posZ);
      return set(winYaw, -0.05 + Math.sin(t * 0.8) * 0.03, 0.02);
    }
    case 'sneeze': {
      if (t < 0.35) return set(0, (-0.3 * t) / 0.35, 0, 14);
      if (t < 0.55) return set(0, 0.55, 0.09, 14);
      return set(0, 0.55 * (1 - (t - 0.55) / 0.35), 0, 14);
    }
    case 'yawn': {
      // Inspiration lente, bouche ouverte (tête en arrière), relâchement.
      if (t < 0.45) return set(0, (-0.35 * t) / 0.45, -0.02, 6);
      if (t < 1.1) return set((Math.random() - 0.5) * 0.02, -0.38, -0.03, 5);
      const u = Math.min(1, (t - 1.1) / 0.8);
      return set(0, -0.38 * (1 - u), 0, 5);
    }
    case 'stretch':
      return set(Math.sin(t * 1.2) * 0.15, -0.25 + Math.sin(t * 2) * 0.05, -0.08, 3.5);
    case 'cough': {
      if (t < 0.2) return set(0, -0.1, 0, 12);
      if (t < 0.55) return set(0, 0.45 + Math.sin(t * 40) * 0.05, 0.1, 14);
      return set(0, 0.2 * (1 - (t - 0.55) / 0.4), 0.04, 10);
    }
    case 'scratch':
      return set(0.55 + Math.sin(t * 9) * 0.12, 0.25, 0, 7);
    case 'adjust':
      return set(Math.sin(t * 3) * 0.2, 0.35 + Math.sin(t * 5) * 0.08, 0, 6);
    case 'watch':
      return set(0.7, 0.45, 0, 6);
    case 'window': {
      const side = ctx.seatSide ?? (ctx.posX >= 0 ? 1 : -1);
      return set(headYawToward(ctx, ctx.posX + side * 1.5, ctx.posZ + Math.sin(phase * 0.3) * 0.4), -0.08, 0.02);
    }
    case 'music':
      return set(Math.sin(phase * 0.7) * 0.12, 0.08 + Math.sin(phase * 2.4) * 0.1, 0);
    case 'fidget':
      return set(Math.sin(phase * 2.1) * 0.35, 0.05 + Math.sin(phase * 3.3) * 0.04, 0);
    case 'rubEyes':
      return set(0, 0.55 + Math.sin(t * 6) * 0.05, 0.04, 6);
    case 'sigh': {
      if (t < 0.7) return set(0, -0.12 * (t / 0.7), -0.02);
      return set(0, -0.12 + 0.2 * Math.min(1, (t - 0.7) / 1.2), 0);
    }
    case 'neckRoll':
      return set(Math.sin(t * 1.8) * 0.7, Math.cos(t * 1.8) * 0.25, 0, 5);
    case 'lean':
      return set(0.1, 0.05, 0.1 + Math.sin(phase * 0.5) * 0.02);
    case 'shift':
      return set(Math.sin(t * 1.5) * 0.2, 0.02, Math.sin(t * 1.5) * 0.06, 5);
    case 'tap':
      return set(0, 0.04, Math.abs(Math.sin(phase * 5)) * 0.015);
    case 'eat':
      return set(0, 0.35 + Math.abs(Math.sin(t * 3.2)) * 0.12, 0.03, 6);
    case 'drink': {
      if (t < 0.6) return set(0, -0.15 * (t / 0.6), 0, 5);
      if (t < 1.8) return set(0, -0.28, 0.02, 5);
      return set(0, -0.1, 0, 5);
    }
    case 'fan':
      return set(Math.sin(t * 6) * 0.25, 0.1, 0, 7);
    case 'wipe':
      return set(Math.sin(t * 4) * 0.4, 0.3, 0, 7);
    case 'earbud':
      return set(0.65, 0.2 + Math.sin(t * 5) * 0.08, 0, 6);
    case 'ticket':
      return set(0.35, 0.5, 0, 6);
    case 'rummage':
      return set(Math.sin(t * 2.5) * 0.3, 0.55, 0.05, 5);
    case 'photo':
      return set(0, -0.05, 0, 6);
    case 'legs':
      return set(0.15, 0.1, 0.04);
    case 'crossArms':
      return set(0, 0.08, 0.02);
    case 'bounce':
      return set(0, 0.05, Math.abs(Math.sin(phase * 4.5)) * 0.03);
    case 'crack':
      return set(Math.sin(t * 8) * 0.55, 0.1, 0, 9);
    case 'glasses':
      return set(0, 0.4 + Math.sin(t * 4) * 0.1, 0, 6);
    case 'sniffle':
      return set(0, -0.15 + Math.sin(t * 12) * 0.05, 0, 10);
    case 'hum':
      return set(Math.sin(phase * 0.9) * 0.1, 0.05 + Math.sin(phase * 3.5) * 0.04, 0);
    case 'chin':
      return set(0.2, 0.45, 0.04);
    case 'tie':
      return set(0, 0.7, 0.08, 5);
    case 'button':
      return set(0, 0.4, 0.03, 5);
    case 'shrug':
      return set(0, -0.05, -0.04 + Math.sin(t * 6) * 0.02, 7);
    case 'shoulders':
      return set(Math.sin(t * 2.2) * 0.15, 0.05, Math.sin(t * 2.2) * 0.05, 5);
    case 'ceiling':
      return set(0, -0.45, -0.02);
    case 'floor':
      return set(0, 0.55, 0.03);
    case 'sway':
      return set(Math.sin(phase * 1.1) * 0.2, 0.02, Math.sin(phase * 1.1) * 0.05);
    case 'stumble': {
      // Côté figé dans lookYawTarget (±1) au démarrage de l'action.
      const side = ctx.lookYawTarget >= 0 ? 1 : -1;
      if (t < 0.35) {
        // Perd l'équilibre.
        const u = t / 0.35;
        return set(side * 0.4 * u, 0.1, 0.15 * u, 10, side * 0.55 * u, -0.02 * u);
      }
      if (t < 0.9) {
        // Presque au sol, se rattrape.
        const u = (t - 0.35) / 0.55;
        return set(side * 0.5, 0.2, 0.35 * (1 - u * 0.4), 9, side * (0.7 - u * 0.35), -0.08 * (1 - u));
      }
      // Relevage gêné, coup d'œil autour.
      const u = Math.min(1, (t - 0.9) / 0.9);
      return set(side * 0.3 * (1 - u) + Math.sin(t * 3) * 0.1, 0.15, 0.05 * (1 - u), 7, side * 0.15 * (1 - u), 0);
    }
    case 'fall': {
      const side = ctx.lookYawTarget >= 0 ? 1 : -1;
      if (t < 0.45) {
        // Tangage → bascule.
        const u = t / 0.45;
        return set(side * 0.5 * u, 0.15 * u, 0.55 * u, 11, side * 0.7 * u, -0.15 * u * u);
      }
      if (t < 1.1) {
        // Impact au sol.
        const u = (t - 0.45) / 0.65;
        return set(
          side * (0.6 + Math.sin(u * 8) * 0.05),
          0.35,
          1.05,
          14,
          side * 1.05,
          -0.52 - 0.04 * Math.sin(u * Math.PI),
        );
      }
      if (t < 2.6) {
        // Assis par terre, gêné, regarde autour.
        const look = Math.sin(t * 1.7) * 0.55;
        return set(look, 0.25 + Math.sin(t * 2.2) * 0.05, 0.95, 5, side * 0.85, -0.55);
      }
      if (t < 3.6) {
        // Se hisse à quatre pattes / à genoux.
        const u = (t - 2.6) / 1.0;
        return set(side * 0.2 * (1 - u), 0.35, 0.95 - u * 0.55, 6, side * (0.85 - u * 0.6), -0.55 + u * 0.35);
      }
      // Se redresse, secoue la tête, un peu penaud.
      const u = Math.min(1, (t - 3.6) / 1.4);
      return set(side * 0.15 * (1 - u) + Math.sin(t * 4) * 0.08, 0.12, 0.2 * (1 - u), 5, side * 0.12 * (1 - u), -0.2 * (1 - u));
    }
    case 'slip': {
      const side = ctx.lookYawTarget >= 0 ? 1 : -1;
      if (t < 0.4) {
        const u = t / 0.4;
        return set(side * 0.35 * u, 0.1, 0.2 * u, 10, side * 0.65 * u, -0.05 * u);
      }
      if (t < 1.1) {
        const u = (t - 0.4) / 0.7;
        return set(side * 0.45, 0.25, 0.55 * (1 - u * 0.3), 9, side * (0.9 - u * 0.4), -0.18 * (1 - u * 0.5));
      }
      const u = Math.min(1, (t - 1.1) / 1.0);
      return set(side * 0.2 * (1 - u), 0.1, 0.08 * (1 - u), 6, side * 0.2 * (1 - u), 0);
    }
    case 'bow': {
      if (t < 0.5) return set(0, 0.55 * (t / 0.5), 0.08, 6);
      if (t < 1.0) return set(0, 0.55, 0.08, 5);
      return set(0, 0.55 * (1 - (t - 1.0) / 0.7), 0, 5);
    }
    case 'offer':
      return set(headYawToward(ctx, ctx.playerX, ctx.playerZ) * 0.4, 0.15, 0.03);
    case 'curious': {
      // Coup d'œil puis détournement.
      if (t < 0.9) {
        return set(
          headYawToward(ctx, ctx.playerX, ctx.playerZ),
          THREE.MathUtils.clamp((1.35 - ctx.playerY) * 0.25, -0.2, 0.2),
        );
      }
      return set(ctx.lookYawTarget || 0.4, 0.05);
    }
    case 'avoid': {
      const toward = headYawToward(ctx, ctx.playerX, ctx.playerZ);
      return set(-Math.sign(toward || 1) * 0.85, 0.2, 0);
    }
    case 'polite': {
      const yaw = headYawToward(ctx, ctx.playerX, ctx.playerZ);
      if (t < 0.5) return set(yaw, 0.05);
      if (t < 1.0) return set(yaw, 0.35);
      return set(yaw * 0.5, 0.08);
    }
    case 'doubleTake': {
      if (t < 0.35) return set(headYawToward(ctx, ctx.playerX, ctx.playerZ) * 0.3, 0.05, 0, 8);
      if (t < 0.55) return set(0, 0, 0, 8);
      return set(headYawToward(ctx, ctx.playerX, ctx.playerZ), 0.08, 0, 9);
    }
    case 'door': {
      const dz = nearestDoorZ(ctx.posZ);
      return set(headYawToward(ctx, Math.sign(ctx.posX || 1) * 1.2, dz), 0.02);
    }
    case 'boarding': {
      // Regarde vers la porte la plus proche (montées).
      const dz = nearestDoorZ(ctx.posZ);
      return set(headYawToward(ctx, Math.sign(ctx.posX || 1) * 1.4, dz), -0.02 + Math.sin(t) * 0.03);
    }
    case 'board':
      // Quai : regard vers le haut (panneau d'affichage).
      return set(ctx.lookYawTarget * 0.35, -0.35, 0);
    case 'tracks':
      // Quai : vers les voies (−X local).
      return set(headYawToward(ctx, ctx.posX - 2.5, ctx.posZ), 0.1);
    case 'queue':
      return set(Math.sin(t * 2) * 0.25, 0.05, Math.sin(t * 2) * 0.04, 5);
    case 'wave':
      return set(headYawToward(ctx, ctx.posX - 3, ctx.posZ), -0.1, 0, 6);
    case 'stepBack':
      return set(0, 0.05, -0.06, 5);
    case 'checkTime':
      return set(0.65, 0.4, 0, 6);
    case 'bagFeet':
      return set(0, 0.65, 0.06);
    case 'pace':
      return set(Math.sin(phase * 2.5) * 0.4, 0.04, Math.sin(phase * 2.5) * 0.03, 5);
    default:
      return set(0, 0);
  }
}

/** Contexte joueur côté rame. */
export function trainPlayerCtx(): Pick<MotionContext, 'playerX' | 'playerY' | 'playerZ'> {
  return {
    playerX: runtime.playerCarX,
    playerY: runtime.playerCarY,
    playerZ: runtime.playerCarZ,
  };
}

/** Contexte joueur côté quai. */
export function platformPlayerCtx(): Pick<MotionContext, 'playerX' | 'playerY' | 'playerZ'> {
  return {
    playerX: runtime.playerPlatX,
    playerY: 1.5,
    playerZ: runtime.playerPlatZ,
  };
}
