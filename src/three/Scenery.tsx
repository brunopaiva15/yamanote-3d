// Ville en parallaxe : trois couches d'immeubles par côté, défilement par
// texture.offset piloté par la distance parcourue, plus ballast au sol.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { makeCityTexture, makeGroundTexture } from '../textures/procedural';

interface Layer {
  x: number;
  height: number;
  metersPerRepeat: number;
  repeat: number;
  layer: 0 | 1 | 2;
  tint: string;
}

const LAYERS: Layer[] = [
  { x: 11, height: 13, metersPerRepeat: 60, repeat: 4, layer: 0, tint: '#ffffff' },
  { x: 24, height: 18, metersPerRepeat: 120, repeat: 2, layer: 1, tint: '#dfe5ea' },
  { x: 42, height: 24, metersPerRepeat: 240, repeat: 1, layer: 2, tint: '#ced8e0' },
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
          color: L.tint,
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
    groundTex.repeat.set(5, 24);
    const gm = new THREE.MeshBasicMaterial({ map: groundTex, fog: true, color: '#9aa2a8' });
    groundMat.current = gm;
    return { planes, gm };
  }, []);

  useFrame(() => {
    for (const m of materials.current) {
      const tex = m.mat.map;
      if (tex) tex.offset.x = (m.sign * runtime.distance) / m.metersPerRepeat;
    }
    const g = groundMat.current?.map;
    if (g) g.offset.y = runtime.distance / 10;
  });

  return (
    <group>
      {built.planes.map((p) => (
        <mesh key={p.key} position={[p.x, p.y, 0]} rotation={[0, p.rotY, 0]} material={p.mat}>
          <planeGeometry args={[PLANE_LEN, p.height]} />
        </mesh>
      ))}
      {/* Sol extérieur : bande de ballast étroite sous le train */}
      <mesh position={[0, -1.15, 0]} rotation={[-Math.PI / 2, 0, 0]} material={built.gm}>
        <planeGeometry args={[9, PLANE_LEN]} />
      </mesh>
      {/* Base urbaine claire jusqu'aux immeubles, fondue dans le brouillard */}
      <mesh position={[0, -1.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, PLANE_LEN]} />
        <meshBasicMaterial color="#828b93" fog />
      </mesh>
    </group>
  );
}
