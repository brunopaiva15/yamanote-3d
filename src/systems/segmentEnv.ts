// Environnement du tronçon courant : poids fondus par type (viaduc, corridor,
// tranchée, sol), hauteur de mur effective, ombrage des ponts routiers et des
// toitures de gare. Valeurs mutées chaque frame (idiome runtime.ts), lues par
// les composants three dans leur useFrame - aucun état React.
//
// L'environnement appartient au tronçon ENTIER. L'index avance au début de
// `depart`, mais on retient le tronçon d'arrivée tant que le quai est encore
// visible - sinon murs / clôtures du prochain segment remplacent le mur de
// gare sous les yeux. Voir data/segments.ts pour la classification.

import { SEGMENTS, journeyProgress, segmentAt, type SegmentKind } from '../data/segments';
import { useStore } from '../store';
import { runtime } from './runtime';

// Progression du trajet inter-gares : même convention que SkyDome/Landmarks
// (depart → cruise → brake ; dwell maintient p = 1). Durée variable par tronçon.

const KINDS: SegmentKind[] = ['viaduct', 'corridor', 'trench', 'ground'];

export const WALL_DEFAULT = 5; // hauteur de mur par défaut (m)
export const WALL_MAX = 7.5; // course de glissement vertical des murs (m)
export const BRIDGE_COUNT = 2; // tabliers recyclés

/** Niveau du sol au droit de la voie (m) : le repère de tout le décor. */
export const GROUND_Y = -1.1;
/** Hauteur du tablier au-dessus de la rue, sur les tronçons en viaduc (m). */
export const VIADUCT_RISE = 7.5;
/**
 * Recul latéral de la ville dans un corridor ferroviaire (m) : le faisceau de
 * voies parallèles s'étend jusqu'à quatorze mètres de l'axe, la ville ne peut
 * pas commencer à douze.
 */
export const CORRIDOR_SETBACK = 9;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const segEnv = {
  seg: -1, // tronçon courant : segmentAt(index, sens)
  p: 0, // progression 0..1 du trajet
  w: { viaduct: 1, corridor: 0, trench: 0, ground: 0 } as Record<SegmentKind, number>,
  green: 0, // végétation fondue (flag greenery)
  wallH: WALL_DEFAULT, // hauteur de mur effective (m), lissée
  segStartDist: 0, // runtime.distance à l'entrée du tronçon
  bridgeW: 0, // 0..1 : présence des ponts (gate fondu, 0 si le tronçon n'en a pas)
  bridgeShade: 0, // 0..1 : assombrissement instantané sous un tablier
  roofShade: 0, // 0..1 : écrit par HubStationRoof (grande toiture au-dessus)
  /**
   * Niveau du sol de LA VILLE (m), qui n'est pas celui de la voie.
   *
   * `elevation` ne servait jusqu'ici qu'à habiller : murs en tranchée, piles de
   * pont plus hautes en viaduc. Or c'est la cote qui commande tout le paysage.
   * Depuis un siège, par une baie, on ne voit d'un bâtiment posé à douze mètres
   * qu'une tranche de quatre mètres de haut - ni ciel, ni ligne de toit. C'est
   * exact au niveau du sol ; ça ne l'est pas sur les treize tronçons en viaduc,
   * où l'on court sept mètres au-dessus de la rue et où le regard passe
   * PAR-DESSUS les toits bas. En tranchée, symétriquement, la ville s'assied
   * sur la crête des murs de soutènement.
   */
  cityY: GROUND_Y,
  /** Recul latéral supplémentaire de la ville (m) : faisceau des corridors. */
  citySetback: 0,
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
  const { index, phase, platformIndex, loopDirection } = useStore.getState();
  // Au début de `depart`, l'index a déjà avancé vers la gare suivante - mais
  // le quai (opaque, coulissant) est encore sous les yeux. On conserve le
  // tronçon d'arrivée jusqu'à ce que le quai soit hors de vue, sinon les
  // murs / clôtures du prochain segment « remplacent » le mur de gare.
  // platformIndex retient précisément cette gare-là (17 s de depart ne
  // suffisent pas à dépasser un quai de 224 m : le défilement déborde sur la
  // croisière), et ce quel que soit le sens de la boucle.
  const seg = segmentAt(platformIndex, loopDirection);
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
  // Progression visuelle du trajet : toujours basée sur l'index courant
  // (annonces / scenery), pas sur le hold d'environnement.
  segEnv.p = journeyProgress(phase, runtime.phaseT, index, loopDirection);

  // Fondu exponentiel (~2,5 s). Pendant le hold de départ on ne change pas
  // de cible (même tronçon) ; le vrai morph n'arrive qu'une fois le quai parti.
  const k = Math.min(1, dt * 0.9);
  for (const kind of KINDS) {
    const target = spec.kind === kind ? 1 : 0;
    segEnv.w[kind] += (target - segEnv.w[kind]) * k;
  }
  segEnv.green += ((spec.greenery ? 1 : 0) - segEnv.green) * k;

  // Hauteur de mur : s'abaisse quand la tranchée s'ouvre en fin de tronçon.
  // Pendant le hold de départ, on fige la hauteur (pas d'opensAtEnd du
  // prochain tronçon qui ferait monter/descendre les murs sous le quai).
  let wallTarget = spec.wallHeight ?? WALL_DEFAULT;
  const holdingDepart = platformIndex !== index;
  if (spec.opensAtEnd && !holdingDepart) wallTarget *= 1 - smoothstep(0.7, 0.95, segEnv.p);
  segEnv.wallH += (wallTarget - segEnv.wallH) * k;

  // Ponts : gate fondu sur le poids du type porteur, ombrage analytique
  // (zéro allocation) depuis la position des deux tabliers recyclés.
  // Le gate suit AUSSI la hauteur de mur : le tablier est posé sur les murs
  // de la tranchée, et quand elle s'ouvre à l'approche d'une gare, les murs
  // fondent - sans ce facteur, le tablier descendait avec eux jusqu'à
  // traverser le wagon. Il s'estompe dès que les murs passent sous ~3,9 m,
  // la hauteur qui le tient au-dessus de la caisse (le rendu borne en plus
  // la hauteur du tablier, ceinture et bretelles).
  segEnv.bridgeW = spec.bridges
    ? smoothstep(0.5, 0.8, segEnv.w[spec.kind]) * smoothstep(3.4, 3.9, segEnv.wallH)
    : 0;
  // Élévation de la ville. Les poids fondus font le morph : la bascule d'un
  // tronçon à l'autre a lieu à l'arrêt, masquée par le quai, exactement comme
  // le glissement vertical des murs de tranchée.
  segEnv.cityY =
    GROUND_Y - VIADUCT_RISE * segEnv.w.viaduct + Math.max(0, segEnv.wallH) * segEnv.w.trench;
  segEnv.citySetback = CORRIDOR_SETBACK * segEnv.w.corridor;

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
