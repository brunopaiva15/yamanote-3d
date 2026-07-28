// Limites de zone : là où la promenade s'arrête.
//
// Le quai est praticable sur 224 m et les trémies d'escalier sont désormais
// percées, mais on ne quitte pas la gare : au bout du quai et au pied des
// marches, la marche du joueur est bloquée par systems/walkable. Sans rien à
// l'écran, on butait dans le vide.
//
// D'où ce panneau : invisible tant qu'on est loin, il s'allume à mesure qu'on
// s'en approche — nid d'abeilles rouge, halo autour du point où l'on va le
// toucher. Purement décoratif : la collision, elle, est dans walkable.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../systems/runtime';

/** Distance à laquelle le panneau commence à apparaître (m). */
const FADE_FAR = 3.0;
/** Distance à laquelle il est à pleine intensité (m). */
const FADE_NEAR = 0.6;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

  void main() {
    vec2 world = (vUv - 0.5) * uSize;
    // Petits hexagones : ~11 cm de côté à côté, arêtes de deux centimètres.
    float cell = 0.11;
    float d = hexDist(hexFold(world / cell));
    float edge = smoothstep(0.34, 0.47, d);

    // Halo autour de l'endroit où le joueur touche la limite.
    vec2 hit = (uHit - 0.5) * uSize;
    float glow = exp(-length(world - hit) * 2.0);

    // Balayage lent : la limite respire au lieu d'être un décalque figé.
    float sweep = 0.5 + 0.5 * sin(uTime * 1.5 - world.y * 1.3);

    float a = uStrength * (0.03 + 0.30 * edge + 0.38 * glow * (0.3 + 0.7 * edge));
    a *= 0.8 + 0.2 * sweep;

    // Les bords du panneau se dissolvent : aucune arête franche dans le vide.
    vec2 lo = smoothstep(vec2(0.0), vec2(0.10, 0.06), vUv);
    vec2 hi = vec2(1.0) - smoothstep(vec2(0.90, 0.78), vec2(1.0), vUv);
    a *= lo.x * lo.y * hi.x * hi.y;

    if (a < 0.004) discard;
    vec3 col = uColor * (0.45 + 0.8 * edge + 1.1 * glow);
    gl_FragColor = vec4(col, min(a, 0.62));
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
  const uniforms = useMemo(
    () => ({
      uSize: { value: new THREE.Vector2(width, height) },
      uHit: { value: new THREE.Vector2(0.5, 0.5) },
      uStrength: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ff2f3a') },
    }),
    [width, height],
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [uniforms],
  );

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
