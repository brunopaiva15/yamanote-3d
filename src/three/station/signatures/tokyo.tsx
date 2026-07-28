// JY01 東京 — la halle de Marunouchi.
//
// Fermes rivetées sombres, arcs surbaissés, entraxe large : depuis les quais
// Yamanote, l'impression n'est pas celle d'une façade de brique mais d'un
// gigantesque environnement ferroviaire couvert. La Yamanote y est sur un îlot
// partagé avec la Keihin-Tōhoku, et les colonnes de la halle prennent appui sur
// chaque bord de quai — pas sur un mur de fond, que Tokyo n'a pas.

import { useMemo } from 'react';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { bays, siteCut, type SigProps } from './kit';

export function Tokyo({ layout, place, m }: SigProps) {
  const depth = layout.depth;
  const midX = PSD_X + depth / 2;
  const top = layout.canopyY;
  const { outerX } = siteCut(place);
  const trussZ = useMemo(() => bays(layout.length, 16), [layout.length]);

  return (
    <group>
      {trussZ.map((z) => (
        <group key={`t${z}`} position={[0, 0, z]}>
          {/* Membrure inférieure et supérieure de la ferme. */}
          <mesh position={[midX, top + 0.3, 0]} material={m.beam}>
            <boxGeometry args={[depth + 0.6, 0.16, 0.3]} />
          </mesh>
          <mesh position={[midX, top + 1.5, 0]} material={m.beam}>
            <boxGeometry args={[depth * 0.7, 0.14, 0.26]} />
          </mesh>
          {/* Treillis : diagonales alternées. */}
          {[-3, -1.5, 0, 1.5, 3].map((k) => (
            <mesh
              key={k}
              position={[midX + k * (depth / 8), top + 0.9, 0]}
              rotation={[0, 0, k % 3 === 0 ? 0.5 : -0.5]}
              material={m.beam}
            >
              <boxGeometry args={[0.1, 1.5, 0.2]} />
            </mesh>
          ))}
          {/* Colonnes rivetées jusqu'au sol, une par bord de quai. */}
          {[PSD_X + 0.5, outerX - 0.5].map((x) => (
            <mesh key={x} position={[x, PLATFORM_TOP + (top - PLATFORM_TOP) / 2, 0]} material={m.column}>
              <boxGeometry args={[0.4, top - PLATFORM_TOP, 0.4]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
