// Limites de zone : là où la promenade s'arrête.
//
// Le quai est praticable sur 224 m et les trémies d'escalier sont désormais
// percées, mais on ne quitte pas la gare : au bout du quai et au pied des
// marches, la marche du joueur est bloquée par systems/walkable. Sans rien à
// l'écran, on butait dans le vide.
//
// D'où ce panneau : invisible tant qu'on est loin, il s'allume à mesure qu'on
// s'en approche - nid d'abeilles rouge, halo autour du point où l'on va le
// toucher. Purement décoratif : la collision, elle, est dans walkable.
//
// Trois formes, une seule encre :
//   - `Barrier`     : un panneau dressé EN TRAVERS du quai (normale selon z),
//                     pour les deux abouts et le pied de chaque volée ;
//   - `EdgeBarrier` : la limite du BORD DE QUAI, tout du long (normale selon x) ;
//   - `GateBarrier` : la baie de porte palière par laquelle on ne peut pas
//                     monter - les quarante autres voitures de la rame.
//
// La deuxième n'existe que là où il n'y a pas de portes palières - Shinjuku et
// Shibuya. Ailleurs, c'est le muret qui arrête l'œil en même temps que le pas ;
// sur ces deux quais-là le bord était nu des deux côtés, et le joueur butait
// sur un mur invisible au ras du liseré blanc. Elle s'ouvre au droit des baies
// de porte, exactement quand walkable y laisse passer - c'est-à-dire aux
// quatre portes de la voiture du joueur, et à elles seules.
//
// La troisième prend le relais partout où le muret existe : là, la baie est
// déjà un trou dans un mur, et c'est ce trou qu'il faut fermer.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_H, PSD_HALF_GAP, PSD_X } from '../../data/stationGeometry';
import { runtime } from '../../systems/runtime';
import { PORTAL_HALF_Z, PORTAL_MIN_OPEN, portalOpen } from '../../systems/walkable';
import { blockedGates, wrongDoor } from '../../systems/wrongDoor';
import {
  gpuKit,
  type BarrierEdgeUniforms,
  type BarrierGateUniforms,
  type BarrierPanelUniforms,
} from '../webgpu/kit';

/** Distance à laquelle le panneau commence à apparaître (m). */
const FADE_FAR = 3.0;
/** Distance à laquelle il est à pleine intensité (m). */
const FADE_NEAR = 0.6;

/**
 * Hauteur de la limite d'un bord de quai nu : celle du muret qui manque. On
 * regarde PAR-DESSUS, exactement comme par-dessus des portes palières - à
 * hauteur d'homme, elle barrait le ciel et la ville d'un bout à l'autre.
 */
const EDGE_H = PSD_H;
/**
 * Portée du halo le long d'un bord de quai (m). Le bord fait 224 m : allumé
 * d'un bout à l'autre, il aurait tracé une barre rouge sur toute la gare au
 * lieu d'une limite qu'on rencontre.
 */
const EDGE_SPAN = 5;
/**
 * Le bord, lui, se longe en permanence - on descend du train à 75 cm de ce
 * plan. Il s'allume donc bien plus tard qu'un about de quai, qu'on ne va
 * chercher qu'une fois : à un pas de la limite, pas trois.
 */
const EDGE_FADE_FAR = 1.4;
const EDGE_FADE_NEAR = 0.4;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * L'encre d'une limite de zone, commune aux trois formes : la maille, le halo
 * autour du point de contact et le balayage. Les coordonnées sont en MÈTRES
 * dans le plan du panneau - (largeur, hauteur) pour un panneau en travers,
 * (z du quai, hauteur) pour un bord. Chaque forme dissout ensuite l'opacité
 * sur ses propres bords, et règle la portée du halo : on lit un about de quai
 * de trois mètres, on longe un bord de quai le nez dessus.
 */
const INK = /* glsl */ `
  // Repli d'un plan sur la maille hexagonale : rend la position dans la
  // cellule la plus proche. Le bord de l'hexagone est à 0,5.
  vec2 hexFold(vec2 p) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    return dot(a, a) < dot(b, b) ? a : b;
  }

  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, vec2(0.5, 0.8660254)), p.x);
  }

  vec4 ink(vec2 p, vec2 hit, float strength, float time, float halo, float gain) {
    // Petits hexagones : ~11 cm de côté à côté, arêtes de deux centimètres.
    float cell = 0.11;
    float d = hexDist(hexFold(p / cell));
    float edge = smoothstep(0.34, 0.47, d);

    // Halo autour de l'endroit où le joueur touche la limite.
    float glow = exp(-length(p - hit) * halo);

    // Balayage lent : la limite respire au lieu d'être un décalque figé.
    float sweep = 0.5 + 0.5 * sin(time * 1.5 - p.y * 1.3);

    float a = strength * (0.03 + 0.30 * edge + gain * glow * (0.3 + 0.7 * edge));
    a *= 0.8 + 0.2 * sweep;
    return vec4(uColor * (0.45 + 0.8 * edge + 1.1 * glow), a);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uSize;      // largeur, hauteur du panneau (m)
  uniform vec2 uHit;       // point le plus proche du joueur, en UV
  uniform float uStrength; // 0 loin, 1 au contact
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;

  ${INK}

  void main() {
    vec4 c = ink((vUv - 0.5) * uSize, (uHit - 0.5) * uSize, uStrength, uTime, 2.0, 0.38);
    float a = c.a;

    // Les bords du panneau se dissolvent : aucune arête franche dans le vide.
    vec2 lo = smoothstep(vec2(0.0), vec2(0.10, 0.06), vUv);
    vec2 hi = vec2(1.0) - smoothstep(vec2(0.90, 0.78), vec2(1.0), vUv);
    a *= lo.x * lo.y * hi.x * hi.y;

    if (a < 0.004) discard;
    gl_FragColor = vec4(c.rgb, min(a, 0.62));
  }
`;

export interface BarrierProps {
  /** Centre du panneau, repère LOCAL du quai (côté +x, avant rotation). */
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

/**
 * Un panneau de limite, dressé en travers du quai (normale selon z). Il ne
 * s'affiche que lorsque le joueur marche sur le quai : depuis la rame, la gare
 * n'a pas de bord.
 */
export function Barrier({ x, y, z, width, height }: BarrierProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const { material, uniforms } = useMemo(() => {
    const kit = gpuKit();
    if (kit) return kit.makeBarrierPanelMaterial(width, height);
    const u: BarrierPanelUniforms = {
      uSize: { value: new THREE.Vector2(width, height) },
      uHit: { value: new THREE.Vector2(0.5, 0.5) },
      uStrength: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ff2f3a') },
    };
    return {
      material: new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: u as unknown as Record<string, THREE.IUniform>,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }) as THREE.Material,
      uniforms: u,
    };
  }, [width, height]);

  // Un panneau de limite est reconstruit à chaque gare : son programme de
  // shader ne survit pas au départ.
  useLayoutEffect(() => () => material.dispose(), [material]);

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    uniforms.uTime.value += Math.min(rawDt, 0.05);

    // Hors du quai (assis dans la rame, gare qui défile), aucune limite.
    if (runtime.playerFrame !== 'platform' || runtime.platformFade < 0.5) {
      uniforms.uStrength.value = 0;
      m.visible = false;
      return;
    }

    const px = runtime.playerPlatX;
    const pz = runtime.playerPlatZ;
    // Milieu du buste plutôt que l'œil : la limite s'allume à hauteur d'homme.
    const py = runtime.playerPlatY - 0.75;

    const dx = Math.max(0, Math.abs(px - x) - width / 2);
    const dy = Math.max(0, Math.abs(py - y) - height / 2);
    const dz = pz - z;
    const dist = Math.hypot(dx, dy, dz);

    const s = THREE.MathUtils.clamp((FADE_FAR - dist) / (FADE_FAR - FADE_NEAR), 0, 1);
    uniforms.uStrength.value = s * s;
    m.visible = s > 0.001;
    if (!m.visible) return;
    uniforms.uHit.value.set(
      THREE.MathUtils.clamp((px - x) / width + 0.5, 0, 1),
      THREE.MathUtils.clamp((py - y) / height + 0.5, 0, 1),
    );
  });

  return (
    <mesh ref={mesh} position={[x, y, z]} material={material} visible={false} renderOrder={10}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
}

// --- Limite d'un bord de quai nu ----------------------------------------

const VERT_EDGE = /* glsl */ `
  attribute float aBay;   // 1 au droit d'une baie de porte, 0 sur un plein
  varying float vBay;
  varying vec2 vP;        // (z du quai, hauteur), en mètres
  void main() {
    vBay = aBay;
    vP = vec2(position.z, position.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG_EDGE = /* glsl */ `
  precision highp float;
  uniform vec2 uHit;       // (z, hauteur) du point le plus proche du joueur
  uniform float uStrength; // 0 loin, 1 au contact
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec2 uY;         // bas et haut du panneau (m)
  uniform vec2 uZ;         // bouts du bord (m)
  uniform float uSpan;     // portée du halo le long du quai (m)
  uniform float uOpen;     // 0 baies fermées, 1 baies effacées
  varying float vBay;
  varying vec2 vP;

  ${INK}

  void main() {
    // Halo resserré : le joueur longe ce plan à vingt centimètres, un halo
    // d'un mètre lui aurait mis une tache rouge en plein visage.
    vec4 c = ink(vP, uHit, uStrength, uTime, 3.6, 0.22);
    float a = c.a;

    // Baie de porte : la limite s'efface le temps que le passage soit dégagé -
    // le même seuil que celui qui ouvre le portillon dans walkable. Les joues
    // de la baie, elles, restent FRANCHES : c'est un jambage de porte, pas un
    // bord perdu - adoucies, elles creusaient une rainure sombre tous les
    // cinq mètres, baies fermées comprises.
    a *= mix(1.0, 1.0 - uOpen, vBay);

    // Bouts du bord, sol et haut du panneau : aucune arête franche.
    a *= smoothstep(0.0, 1.2, vP.x - uZ.x) * smoothstep(0.0, 1.2, uZ.y - vP.x);
    a *= smoothstep(0.0, 0.10, vP.y - uY.x) * (1.0 - smoothstep(uY.y - 0.45, uY.y, vP.y));

    // Deux cent vingt mètres de bord : seul le tronçon devant le joueur
    // s'allume, le reste reste éteint.
    a *= 1.0 - smoothstep(uSpan * 0.4, uSpan, abs(vP.x - uHit.x));

    if (a < 0.004) discard;
    // Plafond plus bas qu'un about de quai : celui-ci, on l'a sous le nez.
    gl_FragColor = vec4(c.rgb, min(a, 0.42));
  }
`;

interface EdgeSpan {
  z0: number;
  z1: number;
  bay: boolean;
}

/**
 * Découpe du bord en pleins et en baies. Sans baies (le bord d'en face, où
 * aucune rame ne se présente), un seul tronçon d'un bout à l'autre.
 */
function edgeSpans(length: number, gates: readonly number[] | undefined): EdgeSpan[] {
  const half = length / 2;
  if (!gates?.length) return [{ z0: -half, z1: half, bay: false }];
  const spans: EdgeSpan[] = [];
  let prev = -half;
  for (const g of gates) {
    const z0 = Math.max(-half, g - PORTAL_HALF_Z);
    const z1 = Math.min(half, g + PORTAL_HALF_Z);
    if (z0 > prev) spans.push({ z0: prev, z1: z0, bay: false });
    if (z1 > z0) spans.push({ z0, z1, bay: true });
    prev = z1;
  }
  if (prev < half) spans.push({ z0: prev, z1: half, bay: false });
  return spans;
}

/**
 * Un quad par tronçon, tous dans le même tampon : quatre-vingt-neuf plans
 * répartis sur 224 m, mais un seul appel de rendu et un seul programme.
 */
function edgeGeometry(spans: readonly EdgeSpan[], y0: number, y1: number): THREE.BufferGeometry {
  const position = new Float32Array(spans.length * 18);
  const aBay = new Float32Array(spans.length * 6);
  let p = 0;
  let b = 0;
  for (const sp of spans) {
    const corners = [
      [sp.z0, y0],
      [sp.z1, y0],
      [sp.z1, y1],
      [sp.z0, y0],
      [sp.z1, y1],
      [sp.z0, y1],
    ];
    for (const [z, y] of corners) {
      position[p++] = 0;
      position[p++] = y;
      position[p++] = z;
      aBay[b++] = sp.bay ? 1 : 0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('aBay', new THREE.BufferAttribute(aBay, 1));
  return g;
}

export interface EdgeBarrierProps {
  /** Plan de la limite, repère LOCAL du quai (côté +x, avant rotation). */
  x: number;
  /** Longueur du quai (m). */
  length: number;
  /**
   * Axes des SEUILS FRANCHISSABLES, quand ce bord en a - la limite s'y ouvre
   * dès que la rame est à quai, portes dégagées. Sans eux, le bord est continu.
   *
   * Ce sont les quatre portes de la voiture du joueur, pas les quarante-quatre
   * baies de la rame : devant les autres voitures, la rame est là, ses portes
   * s'écartent, et pourtant on ne peut pas monter - la limite doit y rester.
   */
  gates?: readonly number[];
  /** Hauteur de la limite (m au-dessus du sol du quai). */
  height?: number;
}

/**
 * La limite d'un bord de quai NU, sur toute la longueur (normale selon x).
 *
 * Le joueur marche jusqu'à 20 cm de ce plan ; au-delà il y a la voie. Là où
 * les portes palières existent, leur muret dit tout et cette limite n'a rien à
 * faire ; c'est pour les deux quais qui n'en ont pas qu'elle est écrite.
 */
export function EdgeBarrier({ x, length, gates, height = EDGE_H }: EdgeBarrierProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const y0 = PLATFORM_TOP;
  const y1 = PLATFORM_TOP + height;

  const geometry = useMemo(() => edgeGeometry(edgeSpans(length, gates), y0, y1), [length, gates, y0, y1]);
  const { material, uniforms } = useMemo(() => {
    const kit = gpuKit();
    if (kit) return kit.makeBarrierEdgeMaterial(y0, y1, length, EDGE_SPAN);
    const u: BarrierEdgeUniforms = {
      uHit: { value: new THREE.Vector2(0, y0) },
      uStrength: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ff2f3a') },
      uY: { value: new THREE.Vector2(y0, y1) },
      uZ: { value: new THREE.Vector2(-length / 2, length / 2) },
      uSpan: { value: EDGE_SPAN },
      uOpen: { value: 0 },
    };
    return {
      material: new THREE.ShaderMaterial({
        vertexShader: VERT_EDGE,
        fragmentShader: FRAG_EDGE,
        uniforms: u as unknown as Record<string, THREE.IUniform>,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }) as THREE.Material,
      uniforms: u,
    };
  }, [y0, y1, length]);

  useLayoutEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry],
  );

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    uniforms.uTime.value += Math.min(rawDt, 0.05);

    if (runtime.playerFrame !== 'platform' || runtime.platformFade < 0.5) {
      uniforms.uStrength.value = 0;
      m.visible = false;
      return;
    }

    const px = runtime.playerPlatX;
    const pz = runtime.playerPlatZ;
    const py = runtime.playerPlatY - 0.75;

    const dx = px - x;
    const dy = Math.max(0, Math.abs(py - (y0 + y1) / 2) - height / 2);
    const dz = Math.max(0, Math.abs(pz) - length / 2);
    const dist = Math.hypot(dx, dy, dz);

    const s = THREE.MathUtils.clamp(
      (EDGE_FADE_FAR - dist) / (EDGE_FADE_FAR - EDGE_FADE_NEAR),
      0,
      1,
    );
    uniforms.uStrength.value = s * s;
    m.visible = s > 0.001;
    if (!m.visible) return;
    uniforms.uHit.value.set(pz, THREE.MathUtils.clamp(py, y0, y1));
    // Les baies suivent le portillon : ouvertes, la limite n'y est plus.
    uniforms.uOpen.value = THREE.MathUtils.smoothstep(
      portalOpen(),
      PORTAL_MIN_OPEN - 0.12,
      PORTAL_MIN_OPEN + 0.12,
    );
  });

  return (
    <mesh
      ref={mesh}
      position={[x, 0, 0]}
      geometry={geometry}
      material={material}
      visible={false}
      renderOrder={10}
    />
  );
}

// --- Baie de porte palière par laquelle on ne peut pas monter -------------

/**
 * Plan de la limite. Les vantaux coulissent à mi-épaisseur du muret : la
 * limite se tient exactement dans leur plan, là où le regard attend une porte.
 */
const GATE_X = PSD_X;

const VERT_GATE = /* glsl */ `
  attribute float aGate;  // axe de la baie à laquelle ce sommet appartient (m)
  varying float vGate;
  varying vec2 vP;        // (z du quai, hauteur), en mètres
  void main() {
    vGate = aGate;
    vP = vec2(position.z, position.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG_GATE = /* glsl */ `
  precision highp float;
  uniform vec2 uHit;       // (z, hauteur) du joueur
  uniform float uStrength; // 0 rien, 1 nez contre la limite
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec2 uY;         // sol et linteau de la baie (m)
  uniform float uGate;     // axe de la baie visée
  varying float vGate;
  varying vec2 vP;

  ${INK}

  void main() {
    // Halo resserré et franc : on a cette limite à quarante centimètres du
    // visage, et c'est un refus, pas un décor de fond.
    vec4 c = ink(vP, uHit, uStrength, uTime, 2.6, 0.42);
    float a = c.a;

    // Une SEULE baie s'allume : celle qu'on a devant soi. Les quarante autres
    // restent éteintes - c'est une porte qu'on refuse, pas le quai entier.
    a *= 1.0 - smoothstep(0.1, 0.9, abs(vGate - uGate));

    // Le seuil et le linteau : la trame naît du sol et meurt sous le bandeau.
    // Les jambages, eux, restent FRANCS - c'est une baie de porte, pas un bord
    // perdu : la limite affleure le montant, comme un vantail qu'on n'a pas.
    a *= smoothstep(0.0, 0.08, vP.y - uY.x) * (1.0 - smoothstep(uY.y - 0.18, uY.y, vP.y));

    if (a < 0.004) discard;
    gl_FragColor = vec4(c.rgb, min(a, 0.72));
  }
`;

/** Un quad par baie refusée, tous dans le même tampon : un seul appel de rendu. */
function gateGeometry(gates: readonly number[], y0: number, y1: number): THREE.BufferGeometry {
  const position = new Float32Array(gates.length * 18);
  const aGate = new Float32Array(gates.length * 6);
  let p = 0;
  let g = 0;
  for (const gz of gates) {
    const z0 = gz - PSD_HALF_GAP;
    const z1 = gz + PSD_HALF_GAP;
    const corners = [
      [z0, y0],
      [z1, y0],
      [z1, y1],
      [z0, y0],
      [z1, y1],
      [z0, y1],
    ];
    for (const [z, y] of corners) {
      position[p++] = 0;
      position[p++] = y;
      position[p++] = z;
      aGate[g++] = gz;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aGate', new THREE.BufferAttribute(aGate, 1));
  return geo;
}

export interface GateBarrierProps {
  /** Longueur du quai (m) : la trame des baies s'y ajuste. */
  length: number;
}

/**
 * La limite d'une baie de porte palière par laquelle on ne peut pas monter.
 *
 * La rame a onze voitures et le quai quarante-quatre baies, mais une seule
 * voiture est modélisée : devant les quarante autres portes, grandes ouvertes
 * elles aussi, `walkable` n'ouvre aucun portillon. On y venait, on s'y cognait,
 * et rien ne le disait - c'était le seul mur invisible du quai.
 *
 * La limite ne se dresse que quand on va vraiment vers cette porte-là : les
 * portes sont dégagées, on est au bord, et on s'est tourné vers la voie
 * (systems/wrongDoor). Longer le quai n'allume rien.
 */
export function GateBarrier({ length }: GateBarrierProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const y0 = PLATFORM_TOP;
  const y1 = PLATFORM_TOP + PSD_H;

  const gates = useMemo(() => blockedGates(length), [length]);
  const geometry = useMemo(() => gateGeometry(gates, y0, y1), [gates, y0, y1]);
  const { material, uniforms } = useMemo(() => {
    const kit = gpuKit();
    if (kit) return kit.makeBarrierGateMaterial(y0, y1);
    const u: BarrierGateUniforms = {
      uHit: { value: new THREE.Vector2(0, y0) },
      uStrength: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ff2f3a') },
      uY: { value: new THREE.Vector2(y0, y1) },
      uGate: { value: 0 },
    };
    return {
      material: new THREE.ShaderMaterial({
        vertexShader: VERT_GATE,
        fragmentShader: FRAG_GATE,
        uniforms: u as unknown as Record<string, THREE.IUniform>,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }) as THREE.Material,
      uniforms: u,
    };
  }, [y0, y1]);

  useLayoutEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry],
  );

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    uniforms.uTime.value += Math.min(rawDt, 0.05);

    const wrong = wrongDoor();
    if (!wrong) {
      uniforms.uStrength.value = 0;
      m.visible = false;
      return;
    }

    uniforms.uStrength.value = wrong.strength;
    uniforms.uGate.value = wrong.z;
    // Milieu du buste plutôt que l'œil : la limite s'allume à hauteur d'homme.
    uniforms.uHit.value.set(
      runtime.playerPlatZ,
      THREE.MathUtils.clamp(runtime.playerPlatY - 0.75, y0, y1),
    );
    m.visible = true;
  });

  return (
    <mesh
      ref={mesh}
      position={[GATE_X, 0, 0]}
      geometry={geometry}
      material={material}
      visible={false}
      renderOrder={10}
    />
  );
}
