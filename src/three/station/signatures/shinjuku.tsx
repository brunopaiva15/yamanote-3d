// JY17 新宿 — la forêt de piliers.
//
// Dalle basse, poteaux carrés serrés, chemins de câbles et néons rapprochés :
// la gare la plus fréquentée du monde n'a rien d'aérien. On y avance sous un
// plafond technique, entre des poteaux, sans jamais voir loin.

import { useMemo } from 'react';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { bays, type SigProps } from './kit';

export function Shinjuku({ layout, m }: SigProps) {
  const depth = layout.depth;
  const midX = PSD_X + depth / 2;
  const top = layout.canopyY;
  const gridZ = useMemo(() => bays(layout.length, 4.5), [layout.length]);
  const ribZ = useMemo(() => bays(layout.length, 12), [layout.length]);

  return (
    <group>
      {gridZ.map((z) => (
        <group key={`g${z}`} position={[0, 0, z]}>
          <mesh position={[midX, top - 0.24, 0]} material={m.metal}>
            <boxGeometry args={[depth - 0.6, 0.1, 0.16]} />
          </mesh>
          <mesh position={[PSD_X + depth * 0.32, top - 0.16, 0]} material={m.lamp}>
            <boxGeometry args={[2.2, 0.06, 0.16]} />
          </mesh>
          <mesh position={[PSD_X + depth * 0.72, top - 0.16, 0]} material={m.lamp}>
            <boxGeometry args={[2.2, 0.06, 0.16]} />
          </mesh>
        </group>
      ))}
      {/* Chemins de câbles et gaines, dans l'axe. */}
      <mesh position={[midX + 0.9, top - 0.42, 0]} material={m.metal}>
        <boxGeometry args={[0.7, 0.3, layout.length]} />
      </mesh>
      {/* Rangée supplémentaire de piliers côté voie. */}
      {ribZ.map((z) => (
        <mesh
          key={`c${z}`}
          position={[PSD_X + 1.1, PLATFORM_TOP + (top - PLATFORM_TOP) / 2, z]}
          material={m.column}
        >
          <boxGeometry args={[0.34, top - PLATFORM_TOP, 0.34]} />
        </mesh>
      ))}
    </group>
  );
}
