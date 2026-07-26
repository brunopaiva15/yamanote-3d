// Publicités japonaises : écrans inclinés au-dessus des fenêtres (窓上, à la
// manière de l'E235). Les nakazuri (中吊り, affiches suspendues dans l'allée)
// ont été retirées et seront reprises plus tard.

import { useMemo } from 'react';
import * as THREE from 'three';
import { makeAdTexture } from '../textures/procedural';

export function Ads() {
  const { screenMats, housingMat, bezelMat } = useMemo(() => {
    const screenMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 6; i++) {
      screenMats.push(new THREE.MeshBasicMaterial({ map: makeAdTexture(20 + i, false), toneMapped: false }));
    }
    const housingMat = new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.6, metalness: 0.02 });
    const bezelMat = new THREE.MeshStandardMaterial({ color: '#1c1e22', roughness: 0.55 });
    return { screenMats, housingMat, bezelMat };
  }, []);

  // Paires d'écrans inclinés au centre des baies entre portes.
  const madoue: number[] = [-5, 0, 5];

  return (
    <group>
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
