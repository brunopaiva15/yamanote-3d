// Publicités japonaises : nakazuri (中吊り, affiches portrait suspendues dans
// l'allée) et bandeaux 窓上 (paysage au-dessus des fenêtres).

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { makeAdTexture } from '../textures/procedural';

export function Ads() {
  const swayGroup = useRef<THREE.Group>(null);

  const { portraitMats, landscapeMats } = useMemo(() => {
    const portraitMats: THREE.MeshStandardMaterial[] = [];
    const landscapeMats: THREE.MeshStandardMaterial[] = [];
    for (let i = 0; i < 6; i++) {
      portraitMats.push(new THREE.MeshStandardMaterial({ map: makeAdTexture(i, true), roughness: 0.9 }));
    }
    for (let i = 0; i < 6; i++) {
      landscapeMats.push(new THREE.MeshStandardMaterial({ map: makeAdTexture(20 + i, false), roughness: 0.9 }));
    }
    return { portraitMats, landscapeMats };
  }, []);

  useFrame(() => {
    if (!swayGroup.current) return;
    swayGroup.current.rotation.x = runtime.sway * 0.045 - runtime.accel * 0.03;
  });

  // Nakazuri en quinconce le long de l'allée.
  const nakazuri: { z: number; x: number }[] = [];
  for (let i = 0; i < 6; i++) {
    nakazuri.push({ z: -7.8 + i * 3.1, x: i % 2 === 0 ? -0.16 : 0.16 });
  }

  // Bandeaux 窓上 au centre des baies entre portes.
  const madoue: number[] = [-5, 0, 5];

  return (
    <group>
      <group ref={swayGroup}>
        {nakazuri.map((n, i) => (
          <group key={`nk${i}`} position={[n.x, 1.86, n.z]}>
            {/* Tringle de suspension */}
            <mesh position={[0, 0.28, 0]}>
              <boxGeometry args={[0.015, 0.32, 0.015]} />
              <meshStandardMaterial color="#9aa0a6" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Recto et verso imprimés : jamais de texte en miroir */}
            <mesh material={portraitMats[i % portraitMats.length]}>
              <planeGeometry args={[0.62, 0.5]} />
            </mesh>
            <mesh rotation={[0, Math.PI, 0]} material={portraitMats[(i + 3) % portraitMats.length]}>
              <planeGeometry args={[0.62, 0.5]} />
            </mesh>
          </group>
        ))}
      </group>
      {([1, -1] as const).map((s) =>
        madoue.map((z, i) => (
          <mesh
            key={`mu${s}-${z}`}
            position={[s * (1.4 - 0.055), 1.94, z]}
            rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
            material={landscapeMats[(i + (s === 1 ? 0 : 3)) % landscapeMats.length]}
          >
            <planeGeometry args={[0.92, 0.28]} />
          </mesh>
        )),
      )}
    </group>
  );
}
