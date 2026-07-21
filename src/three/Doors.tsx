// Portes coulissantes : 4 par face, deux vantaux chacune. Seul le côté quai
// (doorSide) coulisse, l'autre reste fermé. Animation lue dans runtime.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';

const DOOR_H = 1.95;
const PANEL_W = CONFIG.doorHalfWidth; // 0.66 par vantail

interface PanelRef {
  mesh: THREE.Group | null;
  side: 1 | -1;
  baseZ: number;
  dir: 1 | -1; // sens de coulissement
}

export function Doors() {
  const panels = useRef<PanelRef[]>([]);
  panels.current = [];

  const materials = useMemo(
    () => ({
      panel: new THREE.MeshStandardMaterial({ color: '#c9cdd2', roughness: 0.4, metalness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#aebfc4',
        transparent: true,
        opacity: 0.1,
        roughness: 0.12,
        side: THREE.DoubleSide,
      }),
    }),
    [],
  );

  useFrame(() => {
    const doorSide = useStore.getState().doorSide;
    for (const p of panels.current) {
      if (!p.mesh) continue;
      const open = p.side === doorSide ? runtime.doorOpen : 0;
      // Interpolation douce du vantail le long de z.
      p.mesh.position.z = p.baseZ + p.dir * open * PANEL_W;
    }
  });

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {sides.map((s) =>
        CONFIG.doorCenters.map((dz) =>
          ([-1, 1] as const).map((half) => {
            const baseZ = dz + half * (PANEL_W / 2);
            return (
              <group
                key={`door${s}-${dz}-${half}`}
                ref={(g) => {
                  if (g) panels.current.push({ mesh: g, side: s, baseZ, dir: half });
                }}
                position={[s * (CONFIG.carHalfWidth + 0.03), 0, baseZ]}
              >
                {/* Vantail */}
                <mesh position={[0, DOOR_H / 2, 0]} material={materials.panel}>
                  <boxGeometry args={[0.05, DOOR_H, PANEL_W]} />
                </mesh>
                {/* Vitre du vantail */}
                <mesh position={[s * -0.03, 1.32, 0]} material={materials.glass}>
                  <boxGeometry args={[0.02, 0.78, PANEL_W - 0.24]} />
                </mesh>
              </group>
            );
          }),
        ),
      )}
    </group>
  );
}
