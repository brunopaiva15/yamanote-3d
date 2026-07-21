// Décor extérieur : ciel de fin d'après-midi (cylindre à dégradé + soleil),
// trois couches d'immeubles en silhouette par côté, défilement par
// texture.offset piloté par la distance parcourue, ballast au sol.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { makeCityTexture, makeGroundTexture, makeSkyTexture } from '../textures/procedural';

interface Layer {
  x: number;
  height: number;
  metersPerRepeat: number;
  repeat: number;
  layer: 0 | 1 | 2;
  opacity: number;
}

const LAYERS: Layer[] = [
  { x: 11, height: 8, metersPerRepeat: 60, repeat: 4, layer: 0, opacity: 1 },
  { x: 24, height: 12, metersPerRepeat: 120, repeat: 2, layer: 1, opacity: 1 },
  { x: 42, height: 18, metersPerRepeat: 240, repeat: 1, layer: 2, opacity: 0.9 },
];

const PLANE_LEN = 240;

export function Scenery() {
  const materials = useRef<{ mat: THREE.MeshBasicMaterial; metersPerRepeat: number; sign: number }[]>([]);
  const groundMat = useRef<THREE.MeshBasicMaterial | null>(null);

  const built = useMemo(() => {
    materials.current = [];
    const planes: { key: string; x: number; y: number; rotY: number; height: number; mat: THREE.MeshBasicMaterial }[] = [];
    for (const L of LAYERS) {
      for (const side of [1, -1] as const) {
        const tex = makeCityTexture(L.layer);
        tex.repeat.set(L.repeat, 1);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: L.opacity,
          fog: true,
          depthWrite: false,
        });
        // Sens de défilement : les immeubles reculent quand le train avance.
        materials.current.push({ mat, metersPerRepeat: L.metersPerRepeat, sign: side === -1 ? 1 : -1 });
        planes.push({
          key: `city${L.layer}-${side}`,
          x: side * L.x,
          y: L.height / 2 - 1.1,
          rotY: side === -1 ? Math.PI / 2 : -Math.PI / 2,
          height: L.height,
          mat,
        });
      }
    }
    const groundTex = makeGroundTexture();
    groundTex.repeat.set(2, 24);
    const gm = new THREE.MeshBasicMaterial({ map: groundTex, fog: true, color: '#c9a58c' });
    groundMat.current = gm;
    const skyTex = makeSkyTexture();
    return { planes, gm, skyTex };
  }, []);

  // Poteaux caténaires qui défilent : le vrai vendeur de vitesse.
  const poles = useRef<(THREE.Group | null)[]>([]);
  const POLE_COUNT = 8;
  const POLE_SPACING = 30;

  useFrame(() => {
    for (const m of materials.current) {
      const tex = m.mat.map;
      if (tex) tex.offset.x = (m.sign * runtime.distance) / m.metersPerRepeat;
    }
    const g = groundMat.current?.map;
    if (g) g.offset.y = runtime.distance / 10;
    const span = POLE_COUNT * POLE_SPACING;
    for (let i = 0; i < POLE_COUNT; i++) {
      const p = poles.current[i];
      if (!p) continue;
      p.position.z = ((runtime.distance + i * POLE_SPACING) % span) - span / 2;
    }
  });

  return (
    <group>
      {/* Ciel : cylindre inversé, hors brouillard pour rester éclatant */}
      <mesh position={[0, 14, 0]}>
        <cylinderGeometry args={[78, 78, 64, 48, 1, true]} />
        <meshBasicMaterial map={built.skyTex} side={THREE.BackSide} fog={false} toneMapped={false} />
      </mesh>

      {built.planes.map((p) => (
        <mesh key={p.key} position={[p.x, p.y, 0]} rotation={[0, p.rotY, 0]} material={p.mat}>
          <planeGeometry args={[PLANE_LEN, p.height]} />
        </mesh>
      ))}

      {/* Portiques caténaires défilants */}
      {Array.from({ length: 8 }, (_, i) => (
        <group
          key={`pole${i}`}
          ref={(g) => {
            poles.current[i] = g;
          }}
        >
          {([-1, 1] as const).map((s) => (
            <mesh key={`pl${s}`} position={[s * 5.2, 2.2, 0]}>
              <cylinderGeometry args={[0.09, 0.11, 7, 8]} />
              <meshStandardMaterial color="#4a4f55" roughness={0.7} metalness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, 5.4, 0]}>
            <boxGeometry args={[10.6, 0.14, 0.14]} />
            <meshStandardMaterial color="#4a4f55" roughness={0.7} metalness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Sol extérieur : bande de ballast étroite sous le train */}
      <mesh position={[0, -1.15, 0]} rotation={[-Math.PI / 2, 0, 0]} material={built.gm}>
        <planeGeometry args={[9, PLANE_LEN]} />
      </mesh>
      {/* Base urbaine chaude jusqu'aux immeubles, fondue dans la brume */}
      <mesh position={[0, -1.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[160, PLANE_LEN]} />
        <meshBasicMaterial color="#a58a7d" fog />
      </mesh>
    </group>
  );
}
