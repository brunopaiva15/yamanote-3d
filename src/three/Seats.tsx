// Banquettes E235 : assises vertes en moquette (bleu-gris pour les places
// prioritaires), dossiers contre la paroi, panneaux de séparation (袖仕切り).

import { useMemo } from 'react';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { BENCHES } from '../systems/seats';
import { makeSeatTexture } from '../textures/procedural';

const SEAT_H = 0.44;

export function Seats() {
  const materials = useMemo(() => {
    const green = makeSeatTexture('#7cbf3a');
    const priority = makeSeatTexture('#7f9dbf');
    return {
      green: new THREE.MeshStandardMaterial({ map: green, roughness: 0.95 }),
      priority: new THREE.MeshStandardMaterial({ map: priority, roughness: 0.95 }),
      frame: new THREE.MeshStandardMaterial({ color: '#ccd1d6', roughness: 0.35, metalness: 0.7 }),
      panel: new THREE.MeshStandardMaterial({
        color: '#c3d4de',
        transparent: true,
        opacity: 0.45,
        roughness: 0.2,
      }),
    };
  }, []);

  const sides: (1 | -1)[] = [1, -1];
  const wallX = CONFIG.carHalfWidth;

  return (
    <group>
      {sides.map((s) =>
        BENCHES.map((b, i) => {
          const len = b.z1 - b.z0;
          const zc = (b.z0 + b.z1) / 2;
          const cushion = b.priority ? materials.priority : materials.green;
          return (
            <group key={`bench${s}-${i}`}>
              {/* Assise */}
              <mesh position={[s * (wallX - 0.28), SEAT_H - 0.06, zc]} material={cushion}>
                <boxGeometry args={[0.46, 0.12, len]} />
              </mesh>
              {/* Dossier légèrement incliné contre la paroi */}
              <mesh
                position={[s * (wallX - 0.09), SEAT_H + 0.28, zc]}
                rotation={[0, 0, s * 0.12]}
                material={cushion}
              >
                <boxGeometry args={[0.09, 0.56, len]} />
              </mesh>
              {/* Piètement */}
              <mesh position={[s * (wallX - 0.28), (SEAT_H - 0.12) / 2, zc]} material={materials.frame}>
                <boxGeometry args={[0.4, SEAT_H - 0.12, len - 0.15]} />
              </mesh>
              {/* Panneaux de séparation aux extrémités (袖仕切り) */}
              {[b.z0, b.z1].map((z) => (
                <group key={`pan${z}`}>
                  <mesh position={[s * (wallX - 0.35), 0.72, z]} material={materials.panel}>
                    <boxGeometry args={[0.62, 1.24, 0.03]} />
                  </mesh>
                  <mesh position={[s * (wallX - 0.66), 0.72, z]} material={materials.frame}>
                    <boxGeometry args={[0.035, 1.3, 0.05]} />
                  </mesh>
                </group>
              ))}
            </group>
          );
        }),
      )}
    </group>
  );
}
