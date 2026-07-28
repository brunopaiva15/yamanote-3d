// JY17 新宿 — la forêt de piliers.
//
// Dalle basse, poteaux carrés serrés, chemins de câbles et néons rapprochés :
// la gare la plus fréquentée du monde n'a rien d'aérien. On y avance sous un
// plafond technique, entre des poteaux, sans jamais voir loin.

import { useMemo } from 'react';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { bays, type SigProps } from './kit';

export function Shinjuku({ layout, place, m }: SigProps) {
  const depth = layout.depth;
  const midX = PSD_X + depth / 2;
  const top = layout.canopyY;
  // La grille passe au large des gaines d'escalier mécanique et des miroirs de
  // départ : ses barres, pleine largeur, leur rentraient dedans.
  const gridZ = useMemo(() => {
    const mirrors = place.kit.mirrors;
    return bays(layout.length, 4.5).filter(
      (z) =>
        !place.escalators.some((e) => Math.abs(z - e.z) < e.halfZ + 0.6) &&
        !mirrors.some((mz) => Math.abs(z - mz) < 0.5),
    );
  }, [layout.length, place.escalators, place.kit.mirrors]);
  // La rangée de piliers côté voie vient du plan : le panneau 番線 la consulte
  // pour se caler entre deux poteaux.
  const ribZ = useMemo(() => (layout.sigPlan?.keepOut ?? []).map((k) => k.z), [layout.sigPlan]);

  return (
    <group>
      {/* Barres et réglettes serrées, PLAQUÉES à la sous-face : descendues de
          vingt-quatre centimètres, elles balayaient la bande directionnelle,
          la gouttière et le haut des panneaux suspendus. */}
      {gridZ.map((z) => (
        <group key={`g${z}`} position={[0, 0, z]}>
          <mesh position={[midX, top - 0.14, 0]} material={m.metal}>
            <boxGeometry args={[depth - 0.6, 0.1, 0.16]} />
          </mesh>
          <mesh position={[PSD_X + depth * 0.32, top - 0.08, 0]} material={m.lamp}>
            <boxGeometry args={[2.2, 0.06, 0.16]} />
          </mesh>
          <mesh position={[PSD_X + depth * 0.72, top - 0.08, 0]} material={m.lamp}>
            <boxGeometry args={[2.2, 0.06, 0.16]} />
          </mesh>
        </group>
      ))}
      {/* Gaine de câbles le long de la rangée de piliers côté voie, juste sous
          les poutres : dans l'axe du quai, elle courait au travers des caissons
          des panneaux de nom de gare et des bannières. */}
      <mesh position={[PSD_X + 1.1, top - 0.26, 0]} material={m.metal}>
        <boxGeometry args={[0.7, 0.16, layout.length]} />
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
