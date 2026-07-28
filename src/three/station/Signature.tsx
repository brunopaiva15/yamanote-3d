// Ce qui ne se paramètre pas : le caractère propre de trois gares.
//
// Le gabarit décrit très bien une gare ordinaire de la boucle. Il ne dira
// jamais la charpente rivetée de la halle de Marunouchi, la forêt de piliers
// de Shinjuku ni la verrière blanche du quai unifié de Shibuya. Ces trois-là
// reçoivent donc une charpente à elles, posée par-dessus le gabarit.

import { useMemo } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../data/stationGeometry';
import type { StationLayout } from '../../data/stationLayouts';

interface Props {
  layout: StationLayout;
  backX: number;
  materials: {
    beam: THREE.Material;
    column: THREE.Material;
    metal: THREE.Material;
    glass: THREE.Material;
    wall: THREE.Material;
    lamp: THREE.Material;
    accent: THREE.Material;
  };
}

/** Positions régulières sur la longueur du quai. */
function bays(length: number, spacing: number): number[] {
  const out: number[] = [];
  const half = length / 2 - spacing * 0.4;
  for (let z = -half; z <= half; z += spacing) out.push(z);
  return out;
}

export function Signature({ layout, backX, materials: m }: Props) {
  const depth = layout.depth;
  const midX = PSD_X + depth / 2;
  const top = layout.canopyY;

  const trussZ = useMemo(() => bays(layout.length, 16), [layout.length]);
  const ribZ = useMemo(() => bays(layout.length, 12), [layout.length]);
  const gridZ = useMemo(() => bays(layout.length, 4.5), [layout.length]);

  if (layout.signature === 'tokyo') {
    // Halle de Marunouchi : fermes rivetées sombres, arcs surbaissés, brique.
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
            {/* Colonnes rivetées jusqu'au sol. */}
            {[PSD_X + 0.5, backX - 0.5].map((x) => (
              <mesh key={x} position={[x, PLATFORM_TOP + (top - PLATFORM_TOP) / 2, 0]} material={m.column}>
                <boxGeometry args={[0.4, top - PLATFORM_TOP, 0.4]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Pilastres de brique le long du mur de fond. */}
        {ribZ.map((z) => (
          <mesh key={`b${z}`} position={[backX - 0.22, PLATFORM_TOP + 1.9, z]} material={m.wall}>
            <boxGeometry args={[0.28, 3.8, 1.1]} />
          </mesh>
        ))}
      </group>
    );
  }

  if (layout.signature === 'shinjuku') {
    // Dalle basse, forêt de piliers carrés, chemins de câbles et néons serrés :
    // la gare la plus fréquentée du monde n'a rien d'aérien.
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

  // Une clé déclarée dans les données mais pas encore dessinée ne rend rien :
  // sans ce garde-fou, toute nouvelle gare signature héritait silencieusement
  // de la charpente de Shibuya.
  if (layout.signature !== 'shibuya') return null;

  // Shibuya : arcs d'acier blanc, verrières entre les arcs, hauteur libre.
  return (
    <group>
      {ribZ.map((z) => (
        <group key={`r${z}`} position={[0, 0, z]}>
          <mesh position={[midX, top + 0.55, 0]} rotation={[0, 0, 0]} material={m.metal}>
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
      {/* Bandeau lumineux continu au droit du bord de quai. */}
      <mesh position={[PSD_X + 0.9, top - 0.14, 0]} material={m.lamp}>
        <boxGeometry args={[0.5, 0.07, layout.length - 8]} />
      </mesh>
      <mesh position={[backX - 1.4, top - 0.14, 0]} material={m.lamp}>
        <boxGeometry args={[0.5, 0.07, layout.length - 8]} />
      </mesh>
    </group>
  );
}
