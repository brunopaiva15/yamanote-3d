// JY20 渋谷 — le quai unifié de 2023.
//
// Arcs d'acier blanc, verrières entre les arcs, hauteur libre : depuis janvier
// 2023 les deux sens tiennent sur un unique quai central, large mais fortement
// courbé. Il n'a toujours pas ses portes de quai, et les parois provisoires du
// chantier lui donnent son allure d'ouvrage inachevé.

import { useMemo } from 'react';
import { PSD_X } from '../../../data/stationGeometry';
import { bays, siteCut, type SigProps } from './kit';

export function Shibuya({ layout, place, m }: SigProps) {
  const depth = layout.depth;
  const midX = PSD_X + depth / 2;
  const top = layout.canopyY;
  const { outerX } = siteCut(place);
  const ribZ = useMemo(() => bays(layout.length, 12), [layout.length]);

  return (
    <group>
      {ribZ.map((z) => (
        <group key={`r${z}`} position={[0, 0, z]}>
          <mesh position={[midX, top + 0.55, 0]} material={m.metal}>
            <boxGeometry args={[depth + 1.2, 0.22, 0.34]} />
          </mesh>
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[midX + d * (depth / 2 + 0.2), top + 1.15, 0]}
              rotation={[0, 0, d * 0.5]}
              material={m.metal}
            >
              <boxGeometry args={[0.2, 1.5, 0.3]} />
            </mesh>
          ))}
          {/* Verrière entre deux arcs : la lumière tombe sur le quai. */}
          <mesh position={[midX, top + 0.72, 6]} material={m.glass}>
            <boxGeometry args={[depth * 0.55, 0.06, 5.4]} />
          </mesh>
        </group>
      ))}
      {/* Bandeau lumineux continu au droit de chaque bord de quai — calé SOUS
          les poutres transversales, qu'il traversait au ras de la sous-face. */}
      <mesh position={[PSD_X + 0.9, top - 0.215, 0]} material={m.lamp}>
        <boxGeometry args={[0.5, 0.07, layout.length - 8]} />
      </mesh>
      <mesh position={[outerX - 1.4, top - 0.215, 0]} material={m.lamp}>
        <boxGeometry args={[0.5, 0.07, layout.length - 8]} />
      </mesh>
    </group>
  );
}
