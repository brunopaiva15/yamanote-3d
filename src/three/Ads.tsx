// Publicités japonaises : nakazuri (中吊り, affiches portrait suspendues dans
// l'allée, imprimées recto-verso) et écrans publicitaires inclinés au-dessus
// des fenêtres (窓上, à la manière de l'E235).

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { makeAdTexture } from '../textures/procedural';

export function Ads() {
  // Un pivot par affichette, à son point d'accroche au plafond : chaque
  // nakazuri se balance sur sa tringle, sans translation parasite.
  const pivots = useRef<(THREE.Group | null)[]>([]);

  const { portraitMats, screenMats, housingMat, bezelMat } = useMemo(() => {
    const portraitMats: THREE.MeshStandardMaterial[] = [];
    const screenMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 6; i++) {
      portraitMats.push(new THREE.MeshStandardMaterial({ map: makeAdTexture(i, true), roughness: 0.9 }));
    }
    for (let i = 0; i < 6; i++) {
      screenMats.push(new THREE.MeshBasicMaterial({ map: makeAdTexture(20 + i, false), toneMapped: false }));
    }
    const housingMat = new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.25, metalness: 0.05 });
    const bezelMat = new THREE.MeshStandardMaterial({ color: '#1c1e22', roughness: 0.4 });
    return { portraitMats, screenMats, housingMat, bezelMat };
  }, []);

  useFrame(() => {
    for (let i = 0; i < pivots.current.length; i++) {
      const p = pivots.current[i];
      if (!p) continue;
      // Balancement avant-arrière autour de la tringle, léger déphasage
      // par affichette pour casser la synchronisation.
      p.rotation.x =
        runtime.sway * 0.05 +
        Math.sin(runtime.swayTime * 1.35 + i * 1.7) * 0.012 * Math.min(1, runtime.speed) -
        runtime.accel * 0.035;
    }
  });

  // Nakazuri en quinconce le long de l'allée.
  const nakazuri: { z: number; x: number }[] = [];
  for (let i = 0; i < 6; i++) {
    nakazuri.push({ z: -7.8 + i * 3.1, x: i % 2 === 0 ? -0.16 : 0.16 });
  }

  // Paires d'écrans inclinés au centre des baies entre portes.
  const madoue: number[] = [-5, 0, 5];

  return (
    <group>
      {nakazuri.map((n, i) => (
        <group
          key={`nk${i}`}
          position={[n.x, 2.14, n.z]}
          ref={(g) => {
            pivots.current[i] = g;
          }}
        >
          {/* Tringle de suspension, du plafond vers l'affiche */}
          <mesh position={[0, -0.06, 0]}>
            <boxGeometry args={[0.015, 0.12, 0.015]} />
            <meshStandardMaterial color="#9aa0a6" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Recto et verso imprimés : jamais de texte en miroir */}
          <mesh position={[0, -0.37, 0]} material={portraitMats[i % portraitMats.length]}>
            <planeGeometry args={[0.62, 0.5]} />
          </mesh>
          <mesh position={[0, -0.37, 0]} rotation={[0, Math.PI, 0]} material={portraitMats[(i + 3) % portraitMats.length]}>
            <planeGeometry args={[0.62, 0.5]} />
          </mesh>
        </group>
      ))}
      {/* Écrans publicitaires 窓上 : boîtiers blancs inclinés vers l'allée */}
      {([1, -1] as const).map((s) =>
        madoue.map((z, i) =>
          [-0.52, 0.52].map((dz, k) => (
            <group
              key={`mu${s}-${z}-${k}`}
              position={[s * (1.4 - 0.09), 2.0, z + dz]}
              rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              <group rotation={[0.32, 0, 0]}>
                <mesh material={housingMat}>
                  <boxGeometry args={[0.98, 0.34, 0.05]} />
                </mesh>
                <mesh position={[0, 0, 0.027]} material={bezelMat}>
                  <planeGeometry args={[0.9, 0.28]} />
                </mesh>
                <mesh position={[0, 0, 0.03]} material={screenMats[(i * 2 + k + (s === 1 ? 0 : 3)) % screenMats.length]}>
                  <planeGeometry args={[0.84, 0.24]} />
                </mesh>
              </group>
            </group>
          )),
        ),
      )}
    </group>
  );
}
