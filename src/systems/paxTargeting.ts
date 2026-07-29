// Qui le joueur a en face de lui.
//
// Le jeu savait déjà où est le joueur — les PNJ tournent la tête vers lui
// depuis longtemps. Pour lui ADRESSER la parole (systems/conversation), il
// faut l'inverse : désigner un voyageur précis, celui qu'on regarde et dont on
// est assez près pour qu'un mot passe.
//
// Les deux populations sont candidates, avec leurs repères respectifs : ceux
// de la rame vivent dans le repère du WAGON, ceux du quai dans celui de la
// GARE (voir systems/playerFrame). On les ramène ici en monde, seul repère où
// « à deux mètres devant moi » veut dire quelque chose.

import { paxList } from './passengers';
import { crowdList } from './platformCrowd';
import { carToWorldZ, platformToWorld, PLATFORM_TOP } from './playerFrame';
import { runtime } from './runtime';

/** Population d'origine du voyageur visé. */
export type PaxScope = 'car' | 'platform';

export interface PaxTarget {
  scope: PaxScope;
  id: number;
  /** Ancre monde : à hauteur de tête, là où se posera la bulle. */
  x: number;
  y: number;
  z: number;
  dist: number;
  feminine: boolean;
}

/** Distance maximale d'un échange : au-delà, on crierait. */
export const TALK_RANGE = 2.9;
/** Le voyageur doit rester à portée un peu au-delà, sinon la moindre
 *  oscillation de la caisse couperait la conversation en deux. */
export const TALK_BREAK_RANGE = 4.2;
/** Demi-angle du cône de visée (rad) : ~24°, la largeur d'un visage à 2 m. */
const TALK_CONE = 0.42;

/**
 * Hauteur de tête, en mètres, pour un PNJ d'échelle donnée. Le sommet du
 * crâne du squelette est à 1,445 × échelle (systems/appearance) ; on vise
 * légèrement en dessous, à hauteur de visage. Assis, le bassin descend d'une
 * quarantaine de centimètres.
 */
function headY(scale: number, seated: boolean): number {
  return seated ? scale * 0.95 : scale * 1.33;
}

const tmpPlat = { x: 0, z: 0 };

interface Candidate {
  scope: PaxScope;
  id: number;
  x: number;
  y: number;
  z: number;
  feminine: boolean;
}

const candidates: Candidate[] = [];

/**
 * Voyageurs à qui l'on peut parler, ramenés en coordonnées monde.
 *
 * Seuls ceux du CÔTÉ OÙ L'ON SE TIENT comptent. Debout sur le quai, on est
 * peut-être à un mètre de quelqu'un d'assis dans la rame — il y a une caisse
 * en acier et une baie vitrée entre les deux, et on ne s'adresse pas à un
 * voyageur au travers d'une vitre. Une fois à bord, la règle s'inverse : c'est
 * la foule du quai qui devient hors d'atteinte.
 *
 * C'est aussi ce qui coupe un échange quand on descend au milieu d'une
 * réplique : l'interlocuteur n'est plus joignable, la bulle se ferme.
 */
function collectCandidates(): void {
  candidates.length = 0;
  const aboard = runtime.playerFrame === 'car';
  if (!aboard) {
    for (const p of crowdList) {
      if (p.state !== 'waiting' && p.state !== 'ambling' && p.state !== 'patrolling') continue;
      // Un voyageur dans une trémie est à moitié sous la dalle : hors de portée.
      if (p.y < -0.2) continue;
      platformToWorld(p.pos.x, p.pos.z, tmpPlat);
      candidates.push({
        scope: 'platform',
        id: p.id,
        x: tmpPlat.x,
        y: PLATFORM_TOP + p.y + headY(p.height, false) + p.bob,
        z: tmpPlat.z,
        feminine: p.appearance.feminine,
      });
    }
    return;
  }
  for (const p of paxList) {
    if (p.state !== 'seated' && p.state !== 'standing') continue;
    candidates.push({
      scope: 'car',
      id: p.id,
      x: p.pos.x,
      y: headY(p.height, p.state === 'seated') + p.bob,
      z: carToWorldZ(p.pos.z),
      feminine: p.appearance.feminine,
    });
  }
}

/**
 * Le voyageur regardé, s'il y en a un : le mieux centré dans le cône de
 * visée, à portée de voix. Renvoie null si personne n'est en face.
 */
export function findTargetedPax(range = TALK_RANGE): PaxTarget | null {
  const ex = runtime.playerX;
  const ey = runtime.playerY;
  const ez = runtime.playerZ;
  const fx = runtime.lookX;
  const fy = runtime.lookY;
  const fz = runtime.lookZ;
  const minDot = Math.cos(TALK_CONE);

  collectCandidates();

  let best: Candidate | null = null;
  let bestScore = -Infinity;
  let bestDist = 0;
  for (const c of candidates) {
    const dx = c.x - ex;
    const dy = c.y - ey;
    const dz = c.z - ez;
    const d = Math.hypot(dx, dy, dz);
    if (d > range || d < 1e-3) continue;
    const dot = (dx * fx + dy * fy + dz * fz) / d;
    if (dot < minDot) continue;
    // Le mieux centré l'emporte ; à cadrage égal, le plus proche.
    const score = dot * 4 - d * 0.25;
    if (score <= bestScore) continue;
    bestScore = score;
    bestDist = d;
    best = c;
  }
  if (!best) return null;
  return {
    scope: best.scope,
    id: best.id,
    x: best.x,
    y: best.y,
    z: best.z,
    dist: bestDist,
    feminine: best.feminine,
  };
}

/**
 * Le voyageur le plus proche, qu'on le regarde ou non. Sert aux répliques
 * spontanées : quand le joueur s'assoit ou que la rame entre en gare, c'est
 * le voisin qui parle, pas celui qu'on avait en joue.
 */
export function findNearbyPax(range: number): PaxTarget | null {
  const ex = runtime.playerX;
  const ey = runtime.playerY;
  const ez = runtime.playerZ;
  collectCandidates();
  let best: Candidate | null = null;
  let bestD = range;
  for (const c of candidates) {
    const d = Math.hypot(c.x - ex, c.y - ey, c.z - ez);
    if (d >= bestD) continue;
    bestD = d;
    best = c;
  }
  if (!best) return null;
  return { scope: best.scope, id: best.id, x: best.x, y: best.y, z: best.z, dist: bestD, feminine: best.feminine };
}

/**
 * Les voyageurs à portée, du plus proche au plus loin. Sert aux réactions en
 * chaîne : quand plusieurs voisins réagissent au même événement, il faut
 * pouvoir passer au suivant au lieu de retomber sur le même.
 */
export function findNearbyPaxList(range: number, max = 8): PaxTarget[] {
  const ex = runtime.playerX;
  const ey = runtime.playerY;
  const ez = runtime.playerZ;
  collectCandidates();
  const found: PaxTarget[] = [];
  for (const c of candidates) {
    const d = Math.hypot(c.x - ex, c.y - ey, c.z - ez);
    if (d >= range) continue;
    found.push({ scope: c.scope, id: c.id, x: c.x, y: c.y, z: c.z, dist: d, feminine: c.feminine });
  }
  found.sort((a, b) => a.dist - b.dist);
  return found.length > max ? found.slice(0, max) : found;
}

/**
 * Position monde (tête) d'un voyageur donné, ou null s'il n'est plus
 * joignable — parti, ou passé de l'autre côté des portes.
 */
export function paxAnchor(scope: PaxScope, id: number): PaxTarget | null {
  // Même règle que la visée : on ne parle pas à travers la caisse.
  if (scope === 'car' && runtime.playerFrame !== 'car') return null;
  if (scope === 'platform' && runtime.playerFrame !== 'platform') return null;
  if (scope === 'car') {
    const p = paxList[id];
    if (!p || (p.state !== 'seated' && p.state !== 'standing')) return null;
    const x = p.pos.x;
    const y = headY(p.height, p.state === 'seated') + p.bob;
    const z = carToWorldZ(p.pos.z);
    return {
      scope,
      id,
      x,
      y,
      z,
      dist: Math.hypot(x - runtime.playerX, y - runtime.playerY, z - runtime.playerZ),
      feminine: p.appearance.feminine,
    };
  }
  const p = crowdList[id];
  if (!p) return null;
  if (p.state !== 'waiting' && p.state !== 'ambling' && p.state !== 'patrolling') return null;
  platformToWorld(p.pos.x, p.pos.z, tmpPlat);
  const y = PLATFORM_TOP + p.y + headY(p.height, false) + p.bob;
  return {
    scope,
    id,
    x: tmpPlat.x,
    y,
    z: tmpPlat.z,
    dist: Math.hypot(tmpPlat.x - runtime.playerX, y - runtime.playerY, tmpPlat.z - runtime.playerZ),
    feminine: p.appearance.feminine,
  };
}
