// Les limites de zone (three/station/Barrier), en nœuds.
//
// Les trois formes - panneau en travers, bord de quai, baie refusée - partagent
// la même encre : maille hexagonale, halo au point de contact, balayage lent.
// C'était déjà le cas en GLSL, où les trois nuanceurs incluaient le même bloc
// `INK` ; ici c'est une fonction TypeScript qui construit le même sous-graphe,
// et le compilateur de nœuds le partage vraiment.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  attribute,
  exp,
  float,
  max,
  mix,
  positionGeometry,
  select,
  sin,
  smoothstep,
  uniform,
  uv,
  varying,
  vec2,
  vec4,
} from 'three/tsl';
import type { F, V2, V3, V4 } from './nodes';
import type {
  BarrierEdgeUniforms,
  BarrierGateUniforms,
  BarrierPanelUniforms,
} from '../kit';

/**
 * Le `mod` de GLSL, écrit à la main.
 *
 * WGSL n'a que `%`, qui garde le SIGNE du dividende : `-0.2 % 1.0` y vaut
 * -0,2 là où GLSL rend 0,8. Le repli hexagonal ne survit pas à la différence -
 * la maille se déchire sur la moitié négative du panneau.
 */
function glslMod(x: V2, y: V2): V2 {
  return x.sub(y.mul(x.div(y).floor()));
}

/** Repli d'un plan sur la maille hexagonale : le bord de l'hexagone est à 0,5. */
function hexFold(p: V2): V2 {
  const r = vec2(1, 1.7320508);
  const h = r.mul(0.5);
  const a = glslMod(p, r).sub(h).toVar();
  const b = glslMod(p.sub(h), r).sub(h).toVar();
  return select(a.dot(a).lessThan(b.dot(b)), a as V2, b as V2);
}

function hexDist(p: V2): F {
  const q = p.abs().toVar();
  return max(q.dot(vec2(0.5, 0.8660254)), q.x);
}

/**
 * L'encre d'une limite de zone. Les coordonnées sont en MÈTRES dans le plan du
 * panneau - (largeur, hauteur) pour un panneau en travers, (z du quai, hauteur)
 * pour un bord. Chaque forme dissout ensuite l'opacité sur ses propres bords,
 * et règle la portée du halo : on lit un about de quai de trois mètres, on
 * longe un bord de quai le nez dessus.
 */
function ink(
  p: V2,
  hit: V2,
  strength: F,
  time: F,
  halo: number,
  gain: number,
  color: V3,
): V4 {
  // Petits hexagones : ~11 cm de côté à côté, arêtes de deux centimètres.
  const d = hexDist(hexFold(p.div(0.11)));
  const edge = smoothstep(0.34, 0.47, d);

  // Halo autour de l'endroit où le joueur touche la limite.
  const glow = exp(p.sub(hit).length().mul(-halo));

  // Balayage lent : la limite respire au lieu d'être un décalque figé.
  const sweep = sin(time.mul(1.5).sub(p.y.mul(1.3))).mul(0.5).add(0.5);

  const a = strength
    .mul(edge.mul(0.3).add(glow.mul(gain).mul(edge.mul(0.7).add(0.3))).add(0.03))
    .mul(sweep.mul(0.2).add(0.8));

  return vec4(color.mul(edge.mul(0.8).add(glow.mul(1.1)).add(0.45)), a);
}

function baseMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  return material;
}

// --- Panneau en travers du quai ------------------------------------------

export function makeBarrierPanelMaterial(
  width: number,
  height: number,
): { material: THREE.Material; uniforms: BarrierPanelUniforms } {
  const uSize = uniform(new THREE.Vector2(width, height));
  const uHit = uniform(new THREE.Vector2(0.5, 0.5));
  const uStrength = uniform(0);
  const uTime = uniform(0);
  const uColor = uniform(new THREE.Color('#ff2f3a'));

  const material = baseMaterial();
  const panelUv = uv();
  const c = ink(
    panelUv.sub(0.5).mul(uSize),
    uHit.sub(0.5).mul(uSize),
    uStrength,
    uTime,
    2.0,
    0.38,
    uColor.rgb,
  );

  // Les bords du panneau se dissolvent : aucune arête franche dans le vide.
  const lo = smoothstep(vec2(0, 0), vec2(0.1, 0.06), panelUv);
  const hi = smoothstep(vec2(0.9, 0.78), vec2(1, 1), panelUv).oneMinus();

  material.colorNode = c.rgb;
  material.opacityNode = c.a.mul(lo.x).mul(lo.y).mul(hi.x).mul(hi.y).min(0.62);

  return {
    material,
    uniforms: { uSize, uHit, uStrength, uTime, uColor } as unknown as BarrierPanelUniforms,
  };
}

// --- Bord de quai nu ------------------------------------------------------

export function makeBarrierEdgeMaterial(
  y0: number,
  y1: number,
  length: number,
  span: number,
): { material: THREE.Material; uniforms: BarrierEdgeUniforms } {
  const uHit = uniform(new THREE.Vector2(0, y0));
  const uStrength = uniform(0);
  const uTime = uniform(0);
  const uColor = uniform(new THREE.Color('#ff2f3a'));
  const uY = uniform(new THREE.Vector2(y0, y1));
  const uZ = uniform(new THREE.Vector2(-length / 2, length / 2));
  const uSpan = uniform(span);
  const uOpen = uniform(0);

  const material = baseMaterial();
  // (z du quai, hauteur), en mètres - le plan est dressé selon x.
  const p: V2 = varying(vec2(positionGeometry.z, positionGeometry.y));
  const bay: F = varying(attribute<'float'>('aBay', 'float'));

  // Halo resserré : le joueur longe ce plan à vingt centimètres, un halo d'un
  // mètre lui aurait mis une tache rouge en plein visage.
  const c = ink(p, uHit.xy, uStrength, uTime, 3.6, 0.22, uColor.rgb);

  material.colorNode = c.rgb;
  material.opacityNode = c.a
    // Baie de porte : la limite s'efface le temps que le passage soit dégagé -
    // le même seuil que celui qui ouvre le portillon dans walkable. Les joues
    // de la baie, elles, restent FRANCHES : c'est un jambage de porte.
    .mul(mix(float(1), float(1).sub(uOpen), bay))
    // Bouts du bord, sol et haut du panneau : aucune arête franche.
    .mul(smoothstep(0, 1.2, p.x.sub(uZ.x)))
    .mul(smoothstep(0, 1.2, uZ.y.sub(p.x)))
    .mul(smoothstep(0, 0.1, p.y.sub(uY.x)))
    .mul(smoothstep(uY.y.sub(0.45), uY.y, p.y).oneMinus())
    // Deux cent vingt mètres de bord : seul le tronçon devant le joueur
    // s'allume, le reste reste éteint.
    .mul(smoothstep(uSpan.mul(0.4), uSpan, p.x.sub(uHit.x).abs()).oneMinus())
    // Plafond plus bas qu'un about de quai : celui-ci, on l'a sous le nez.
    .min(0.42);

  return {
    material,
    uniforms: {
      uHit,
      uStrength,
      uTime,
      uColor,
      uY,
      uZ,
      uSpan,
      uOpen,
    } as unknown as BarrierEdgeUniforms,
  };
}

// --- Baie de porte palière refusée ---------------------------------------

export function makeBarrierGateMaterial(
  y0: number,
  y1: number,
): { material: THREE.Material; uniforms: BarrierGateUniforms } {
  const uHit = uniform(new THREE.Vector2(0, y0));
  const uStrength = uniform(0);
  const uTime = uniform(0);
  const uColor = uniform(new THREE.Color('#ff2f3a'));
  const uY = uniform(new THREE.Vector2(y0, y1));
  const uGate = uniform(0);

  const material = baseMaterial();
  const p: V2 = varying(vec2(positionGeometry.z, positionGeometry.y));
  const gate: F = varying(attribute<'float'>('aGate', 'float'));

  // Halo resserré et franc : on a cette limite à quarante centimètres du
  // visage, et c'est un refus, pas un décor de fond.
  const c = ink(p, uHit.xy, uStrength, uTime, 2.6, 0.42, uColor.rgb);

  material.colorNode = c.rgb;
  material.opacityNode = c.a
    // Une SEULE baie s'allume : celle qu'on a devant soi. Les quarante autres
    // restent éteintes - c'est une porte qu'on refuse, pas le quai entier.
    .mul(smoothstep(0.1, 0.9, gate.sub(uGate).abs()).oneMinus())
    // Le seuil et le linteau : la trame naît du sol et meurt sous le bandeau.
    .mul(smoothstep(0, 0.08, p.y.sub(uY.x)))
    .mul(smoothstep(uY.y.sub(0.18), uY.y, p.y).oneMinus())
    .min(0.72);

  return {
    material,
    uniforms: { uHit, uStrength, uTime, uColor, uY, uGate } as unknown as BarrierGateUniforms,
  };
}
