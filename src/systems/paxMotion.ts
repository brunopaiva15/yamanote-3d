// Cibles de tête / buste pour chaque occupation PNJ.
// Les systèmes de rame et de quai appellent resolveMotion() chaque frame ;
// aucun dialogue : uniquement des gestes silencieux crédibles.

import { clamp } from './vec3';
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
  /** Inclinaison de tête (écoute / sourire / connivence). */
  headRoll: number;
  /** Décalage vertical (négatif = au sol). */
  drop: number;
  /**
   * Hauteur du PIVOT du corps, en fraction de la taille (0 = les pieds).
   *
   * Une inclinaison légère pivote aux chevilles : les pieds restent au sol,
   * c'est le cas par défaut. Une CHUTE, non - elle bascule autour du bassin.
   * Pivoter une chute aux pieds couche le corps en le translatant de plus
   * d'un mètre : le voyageur au sol partait dans la banquette, quand ce
   * n'était pas au travers de la caisse.
   */
  pivot: number;
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
  return clamp(d, -1.15, 1.15);
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

const out: MotionTargets = { yaw: 0, pitch: 0, lean: 0, roll: 0, headRoll: 0, drop: 0, pivot: 0, speed: 4.5 };

function set(
  yaw: number,
  pitch: number,
  lean = 0,
  speed = 4.5,
  roll = 0,
  drop = 0,
  headRoll = 0,
  pivot = 0,
): MotionTargets {
  out.yaw = yaw;
  out.pitch = pitch;
  out.lean = lean;
  out.roll = roll;
  out.drop = drop;
  out.headRoll = headRoll;
  out.pivot = pivot;
  out.speed = speed;
  return out;
}

/** Bassin : pivot des chutes, en fraction de la taille du PNJ. */
const HIP = 0.6;

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
        clamp((1.35 - ctx.playerY) * 0.3, -0.3, 0.25),
      );
    case 'chat':
    case 'sideChat':
    case 'gossip':
    case 'agree': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      // Alternance claire : un « parle », l'autre écoute / hoche / sourit.
      const wave = Math.sin(t * 2.6 + role * Math.PI);
      const speaking = wave > 0.05;
      if (motion === 'agree') {
        // Hochements d'acquiescement synchrones, regard tenu (tête seule).
        return set(yaw, 0.1 + Math.max(0, Math.sin(t * 4.2)) * 0.12, 0, 7, 0, 0, Math.sin(t * 1.3) * 0.08);
      }
      if (speaking) {
        // Parole silencieuse : hochements rythmés - pas de lean (sinon les
        // pieds glissent sur le coussin quand on est assis).
        const jab = Math.max(0, Math.sin(t * (motion === 'gossip' ? 9 : 7.5)));
        return set(
          yaw + Math.sin(t * 3.1) * 0.04,
          0.06 + jab * (motion === 'gossip' ? 0.18 : 0.14),
          0,
          8,
          0,
          0,
          Math.sin(t * 2.2) * 0.05,
        );
      }
      // Écoute : petits hochements, tête penchée (sourire / intérêt).
      const listenNod = Math.max(0, Math.sin(t * 5.2 + 1.1)) * 0.07;
      return set(
        yaw * 0.95,
        0.1 + listenNod,
        0,
        6,
        0,
        0,
        0.12 + Math.sin(t * 0.9 + role) * 0.06,
      );
    }
    case 'whisper': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      const wave = Math.sin(t * 2.2 + role * Math.PI);
      const speaking = wave > 0;
      return set(
        yaw,
        speaking ? 0.18 + Math.max(0, Math.sin(t * 6)) * 0.08 : 0.14,
        0,
        6,
        0,
        0,
        speaking ? 0.06 : 0.14,
      );
    }
    case 'laugh': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      // Rire silencieux : tête qui rebondit, léger penché complice (tête seule).
      return set(
        yaw + Math.sin(t * 3) * 0.08,
        0.05 + Math.abs(Math.sin(t * 8.5)) * 0.2,
        0,
        11,
        0,
        0,
        0.1 + Math.sin(t * 4) * 0.08,
      );
    }
    case 'flirt': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      return set(
        yaw * 0.9,
        0.06 + Math.sin(t * 2.4 + role) * 0.05,
        0,
        5,
        0,
        0,
        0.16 + Math.sin(t * 1.5) * 0.05,
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
      // Assis : inclinaison de tête seulement (pas de lean buste → pieds stables).
      return set(headYawToward(ctx, ctx.partnerX, ctx.partnerZ) * 0.55, 0.06, 0, 5, 0, 0, 0.08);
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
    case 'bag':
      // Sangle remontée : coup d'œil à l'épaule, buste qui se redresse.
      return set(0.4 + Math.sin(t * 2.4) * 0.12, 0.22, -0.03, 6);
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
    // --- Chutes ------------------------------------------------------------
    //
    // Ces trois cas ont DEUX consommateurs, et il faut les lire ainsi :
    //
    //  - le REGARD (yaw / pitch / headRoll) sert toujours : c'est lui qui joue
    //    la gêne, par-dessus le clip de chute du pack comme sur le repli ;
    //  - la BASCULE du groupe (lean / roll / drop / pivot) n'est plus qu'un
    //    REPLI, pour un pack qui n'aurait ni « Death » ni « HitRecieve ». Dès
    //    que le pack sait tomber pour de vrai, three/characters/fall.ts éteint
    //    ces quatre canaux et joue l'animation.
    //
    // Le repli se termine donc EXACTEMENT quand la piste du clip se termine
    // (4,0 s pour une chute, 1,5 s pour un faux pas, 1,5 s pour une glissade) :
    // sinon le corps, à peine relevé par le clip, se remettait à pencher au
    // moment où celui-ci rendait la main.
    case 'stumble': {
      // Côté figé dans lookYawTarget (±1) au démarrage de l'action.
      const side = ctx.lookYawTarget >= 0 ? 1 : -1;
      if (t < 0.35) {
        // Perd l'équilibre : les pieds tiennent encore, pivot bas.
        const u = t / 0.35;
        return set(side * 0.4 * u, 0.1, 0.15 * u, 10, side * 0.55 * u, -0.02 * u, 0, HIP * 0.3 * u);
      }
      if (t < 0.9) {
        // Presque au sol, se rattrape.
        const u = (t - 0.35) / 0.55;
        return set(side * 0.5, 0.2, 0.35 * (1 - u * 0.4), 9, side * (0.7 - u * 0.35), -0.08 * (1 - u), 0, HIP * 0.35);
      }
      // Relevage gêné, coup d'œil autour.
      const u = Math.min(1, (t - 0.9) / 0.6);
      return set(side * 0.3 * (1 - u) + Math.sin(t * 3) * 0.1, 0.15, 0.05 * (1 - u), 7, side * 0.15 * (1 - u), 0, 0, HIP * 0.3 * (1 - u));
    }
    case 'fall': {
      const side = ctx.lookYawTarget >= 0 ? 1 : -1;
      if (t < 0.45) {
        // Tangage → bascule : le pivot monte des chevilles vers le bassin.
        const u = t / 0.45;
        return set(side * 0.5 * u, 0.15 * u, 0.55 * u, 11, side * 0.7 * u, -0.12 * u * u, 0, HIP * u);
      }
      if (t < 0.9) {
        // Impact au sol : le bassin touche, le corps s'y couche autour.
        const u = (t - 0.45) / 0.45;
        return set(
          side * (0.6 + Math.sin(u * 8) * 0.05),
          0.35,
          1.05,
          14,
          side * 1.05,
          -0.72 - 0.04 * Math.sin(u * Math.PI),
          0,
          HIP,
        );
      }
      if (t < 2.15) {
        // Assis par terre, gêné, regarde autour.
        const look = Math.sin(t * 1.7) * 0.55;
        return set(look, 0.25 + Math.sin(t * 2.2) * 0.05, 0.95, 5, side * 0.85, -0.66, 0, HIP);
      }
      if (t < 3.15) {
        // Se hisse à quatre pattes / à genoux.
        const u = (t - 2.15) / 1.0;
        return set(side * 0.2 * (1 - u), 0.35, 0.95 - u * 0.55, 6, side * (0.85 - u * 0.6), -0.66 + u * 0.5, 0, HIP * (1 - u * 0.5));
      }
      // Se redresse, secoue la tête, un peu penaud.
      const u = Math.min(1, (t - 3.15) / 0.85);
      return set(side * 0.15 * (1 - u) + Math.sin(t * 4) * 0.08, 0.12, 0.2 * (1 - u), 5, side * 0.12 * (1 - u), -0.16 * (1 - u), 0, HIP * 0.5 * (1 - u));
    }
    case 'slip': {
      const side = ctx.lookYawTarget >= 0 ? 1 : -1;
      if (t < 0.4) {
        const u = t / 0.4;
        return set(side * 0.35 * u, 0.1, 0.2 * u, 10, side * 0.65 * u, -0.05 * u, 0, HIP * 0.4 * u);
      }
      if (t < 1.1) {
        const u = (t - 0.4) / 0.7;
        return set(side * 0.45, 0.25, 0.55 * (1 - u * 0.3), 9, side * (0.9 - u * 0.4), -0.16 * (1 - u * 0.5), 0, HIP * 0.5);
      }
      const u = Math.min(1, (t - 1.1) / 0.4);
      return set(side * 0.2 * (1 - u), 0.1, 0.08 * (1 - u), 6, side * 0.2 * (1 - u), 0, 0, HIP * 0.4 * (1 - u));
    }
    case 'argue': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      // Hochements vifs alternés, buste en avant.
      const jab = Math.max(0, Math.sin(t * 5.5 + role * Math.PI));
      return set(yaw + Math.sin(t * 8) * 0.08, 0.12 + jab * 0.18, 0.08 + jab * 0.1, 9);
    }
    case 'fight': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      const punch = Math.sin(t * 9 + role * 1.7);
      const side = role === 0 ? 1 : -1;
      return set(
        yaw + punch * 0.2,
        0.15 + Math.abs(punch) * 0.2,
        0.12 + Math.max(0, punch) * 0.18,
        12,
        side * punch * 0.35,
        Math.min(0, punch) * -0.04,
      );
    }
    case 'jealous': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      // Role 0 : fixe le partenaire ; role 1 : détourne le regard puis re-fixe.
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      if (role === 1) {
        const turn = Math.sin(t * 1.4);
        return set(yaw * (0.3 + 0.5 * Math.max(0, turn)), 0.25, 0.04, 5, -0.08);
      }
      return set(yaw * 0.9 + Math.sin(t * 2) * 0.15, 0.2, 0.05, 6);
    }
    case 'angry': {
      // Tête qui tourne sèchement, menton bas, buste raide.
      const snap = Math.sin(t * 3.2) > 0 ? 0.85 : -0.55;
      return set(snap, 0.22, 0.06, 8);
    }
    case 'scold': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      const wag = Math.sin(t * 6 + role * Math.PI) * 0.25;
      return set(yaw + wag, 0.18 + (role === 0 ? 0.12 : 0.05), role === 0 ? 0.12 : 0.02, 8);
    }
    case 'shove': {
      if (ctx.partnerX === undefined || ctx.partnerZ === undefined) return set(0, 0);
      const yaw = headYawToward(ctx, ctx.partnerX, ctx.partnerZ);
      const side = role === 0 ? 1 : -1;
      if (t < 0.35) return set(yaw, 0.1, 0.05, 10, side * 0.1);
      if (t < 0.7) {
        // Role 0 pousse ; role 1 encaisse.
        const u = (t - 0.35) / 0.35;
        return set(
          yaw,
          0.2,
          role === 0 ? 0.25 * u : -0.05,
          14,
          side * (role === 0 ? 0.15 : 0.55 * u),
          role === 1 ? -0.12 * u : 0,
        );
      }
      const u = Math.min(1, (t - 0.7) / 1.0);
      return set(yaw * (1 - u * 0.5), 0.1, 0.05 * (1 - u), 7, side * 0.2 * (1 - u), 0);
    }
    case 'sulk':
      return set(0.75, 0.35, 0.08, 4, -0.06);
    case 'gasp': {
      if (t < 0.35) return set(0, -0.25 * (t / 0.35), -0.04, 10);
      return set(Math.sin(t * 9) * 0.12, -0.15 + 0.3 * Math.min(1, (t - 0.35) / 0.6), 0, 7);
    }
    case 'facepalm':
      return set(0.15, 0.65 + Math.sin(t * 2) * 0.05, 0.1, 5);
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
          clamp((1.35 - ctx.playerY) * 0.25, -0.2, 0.2),
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
    case 'talk': {
      // S'adresse au joueur : tête tournée vers lui pour de bon, avec les
      // hochements et le léger buste en avant de quelqu'un qui parle. Le
      // rythme est celui d'une phrase, pas d'un tic - deux temps par seconde.
      const yaw = headYawToward(ctx, ctx.playerX, ctx.playerZ);
      const pitch = clamp((1.35 - ctx.playerY) * 0.32, -0.28, 0.3);
      const beat = Math.sin(t * 5.2);
      return set(
        yaw + Math.sin(t * 1.7) * 0.05,
        pitch + beat * 0.055,
        0.05,
        5.5,
        0,
        0,
        Math.sin(t * 1.1) * 0.06,
      );
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
