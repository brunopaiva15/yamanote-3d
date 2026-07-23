// Environnement du tronçon courant : poids fondus par type (viaduc, corridor,
// tranchée, sol), hauteur de mur effective, ombrage des ponts routiers et des
// toitures de gare. Valeurs mutées chaque frame (idiome runtime.ts), lues par
// les composants three dans leur useFrame — aucun état React.
//
// L'environnement appartient au tronçon ENTIER et bascule au début de
// `depart` (quand index avance) : le quai et la vitesse quasi nulle masquent
// le fondu (~2,5 s). Voir data/segments.ts pour la classification.

import { CONFIG } from '../data/config';
import { SEGMENTS, segmentAt, type SegmentKind } from '../data/segments';
import { useStore, type Phase } from '../store';
import { runtime } from './runtime';

// Progression du trajet inter-gares : même convention que Scenery/Landmarks
// (depart → cruise → brake ; dwell maintient p = 1).
const JOURNEY = CONFIG.departTime + CONFIG.cruiseTime + CONFIG.brakeTime;
const PHASE_BASE: Record<Phase, number> = {
  depart: 0,
  cruise: CONFIG.departTime,
  brake: CONFIG.departTime + CONFIG.cruiseTime,
  dwell: JOURNEY,
};

const KINDS: SegmentKind[] = ['viaduct', 'corridor', 'trench', 'ground'];

export const WALL_DEFAULT = 5; // hauteur de mur par défaut (m)
export const WALL_MAX = 7.5; // course de glissement vertical des murs (m)
export const BRIDGE_COUNT = 2; // tabliers recyclés

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const segEnv = {
  seg: -1, // tronçon courant : segmentAt(index)
  p: 0, // progression 0..1 du trajet
  w: { viaduct: 1, corridor: 0, trench: 0, ground: 0 } as Record<SegmentKind, number>,
  green: 0, // végétation fondue (flag greenery)
  wallH: WALL_DEFAULT, // hauteur de mur effective (m), lissée
  segStartDist: 0, // runtime.distance à l'entrée du tronçon
  bridgeW: 0, // 0..1 : présence des ponts (gate fondu, 0 si le tronçon n'en a pas)
  bridgeShade: 0, // 0..1 : assombrissement instantané sous un tablier
  roofShade: 0, // 0..1 : écrit par HubStationRoof (grande toiture au-dessus)
};

// Période et position z des tabliers : source unique de vérité, partagée
// entre l'ombrage (ici) et les meshes (SegmentEnvironment). Décalé d'une
// demi-période pour qu'aucun pont ne surplombe le train à l'entrée du
// tronçon : le premier arrive après ~period/2 mètres, depuis le brouillard.
export function bridgePeriod(seg: number): number {
  return (SEGMENTS[seg]?.bridges ?? 1) >= 2 ? 260 : 400;
}

export function bridgeZ(k: number): number {
  const period = bridgePeriod(segEnv.seg);
  const span = BRIDGE_COUNT * period;
  const d = runtime.distance - segEnv.segStartDist + period / 2 + k * period;
  return (((d % span) + span) % span) - span / 2;
}

export function updateSegmentEnv(dt: number): void {
  const { index, phase } = useStore.getState();
  const seg = segmentAt(index);
  if (seg !== segEnv.seg) {
    const first = segEnv.seg < 0;
    segEnv.seg = seg;
    segEnv.segStartDist = runtime.distance;
    if (first) {
      // Premier tick : état cible immédiat, sans fondu d'amorçage.
      for (const kind of KINDS) segEnv.w[kind] = SEGMENTS[seg].kind === kind ? 1 : 0;
      segEnv.green = SEGMENTS[seg].greenery ? 1 : 0;
      segEnv.wallH = SEGMENTS[seg].wallHeight ?? WALL_DEFAULT;
    }
  }

  const spec = SEGMENTS[seg];
  segEnv.p = Math.min(1, Math.max(0, (PHASE_BASE[phase] + runtime.phaseT) / JOURNEY));

  // Fondu exponentiel (~2,5 s), entièrement masqué par le quai pendant `depart`.
  const k = Math.min(1, dt * 0.9);
  for (const kind of KINDS) {
    const target = spec.kind === kind ? 1 : 0;
    segEnv.w[kind] += (target - segEnv.w[kind]) * k;
  }
  segEnv.green += ((spec.greenery ? 1 : 0) - segEnv.green) * k;

  // Hauteur de mur : s'abaisse quand la tranchée s'ouvre en fin de tronçon.
  let wallTarget = spec.wallHeight ?? WALL_DEFAULT;
  if (spec.opensAtEnd) wallTarget *= 1 - smoothstep(0.7, 0.95, segEnv.p);
  segEnv.wallH += (wallTarget - segEnv.wallH) * k;

  // Ponts : gate fondu sur le poids du type porteur, ombrage analytique
  // (zéro allocation) depuis la position des deux tabliers recyclés.
  segEnv.bridgeW = spec.bridges ? smoothstep(0.5, 0.8, segEnv.w[spec.kind]) : 0;
  let shade = 0;
  if (segEnv.bridgeW > 0.01) {
    for (let b = 0; b < BRIDGE_COUNT; b++) {
      const z = bridgeZ(b);
      const s = 1 - (z / 14) * (z / 14); // tablier ~8 m + pénombre
      if (s > shade) shade = s;
    }
    shade = Math.max(0, shade) * segEnv.bridgeW;
  }
  segEnv.bridgeShade = shade;
}
