// Signalétique du quai : panneaux de nom de gare suspendus, tableau
// d'affichage électronique, totems d'information.
//
// Ce bloc est repris tel quel de l'ancien Platform.tsx, redraw compris. Les
// panneaux d'affichage ne changent pas : seul l'endroit d'où on les regarde
// change. La seule adaptation est leur répartition sur un quai désormais long
// de plus de deux cents mètres, au lieu de quatre-vingt-seize.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { runtime } from '../../systems/runtime';
import { makePlatformBoard, makeStationSign } from '../../textures/procedural';
import { PLATFORM_TOP } from '../../data/stationGeometry';

interface Props {
  /** Abscisse de suspension des caissons (repère quai). */
  hangX: number;
  /** Hauteur de la sous-face de l'auvent. */
  canopyY: number;
  /** Demi-longueur du quai. */
  halfZ: number;
  /** Abscisse des totems posés au sol. */
  totemX: number;
  frame: THREE.Material;
  metal: THREE.Material;
  accent: THREE.Material;
}

export function PlatformSignage({ hangX, canopyY, halfZ, totemX, frame, metal, accent }: Props) {
  const sign = useMemo(() => makeStationSign(), []);
  const board = useMemo(() => makePlatformBoard(), []);
  const lastSignIndex = useRef(-1);

  const materials = useMemo(
    () => ({
      sign: new THREE.MeshBasicMaterial({
        map: sign.texture,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
      board: new THREE.MeshBasicMaterial({
        map: board.texture,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
    }),
    [sign, board],
  );

  // Un panneau de nom de gare tous les ~55 m, un tableau d'affichage tous les
  // ~110 m : sur un quai de 224 m, un seul de chaque serait introuvable.
  const signZ = useMemo(() => {
    const out: number[] = [];
    for (let z = -halfZ + 26; z <= halfZ - 26; z += 55) out.push(z);
    return out;
  }, [halfZ]);
  const boardZ = useMemo(() => [-halfZ * 0.45, halfZ * 0.45], [halfZ]);
  const totemZ = useMemo(() => [-halfZ * 0.66, 0, halfZ * 0.66], [halfZ]);

  useFrame(() => {
    if (runtime.platformFade <= 0.03) return;
    const { index, phase } = useStore.getState();
    // Pendant depart l'index a déjà avancé : panneau = gare quittée (index-1).
    const signIndex = phase === 'depart' ? (index + 29) % 30 : index;
    if (
      (phase === 'brake' || phase === 'dwell' || phase === 'depart') &&
      lastSignIndex.current !== signIndex
    ) {
      lastSignIndex.current = signIndex;
      sign.redraw(signIndex);
      board.redraw(signIndex);
    }
  });

  const signY = canopyY - 0.77;
  const boardY = canopyY - 0.39;

  return (
    <group>
      {/* Panneaux JR suspendus, lisibles depuis le wagon comme depuis le quai */}
      {signZ.map((z) => (
        <group key={`sign${z}`} position={[hangX, signY, z]}>
          {[-1.1, 1.1].map((dz) => (
            <mesh key={`hang${dz}`} position={[0.06, 0.52, dz]} material={frame}>
              <boxGeometry args={[0.045, 0.75, 0.07]} />
            </mesh>
          ))}
          {/* Caisson noir derrière la face éclairée */}
          <mesh position={[0.055, 0, 0]} material={frame}>
            <boxGeometry args={[0.1, 1.0, 3.35]} />
          </mesh>
          <mesh position={[-0.01, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={materials.sign}>
            <planeGeometry args={[3.2, 0.96]} />
          </mesh>
        </group>
      ))}

      {/* Tableaux d'affichage suspendus */}
      {boardZ.map((z) => (
        <group key={`board${z}`} position={[hangX - 0.1, boardY, z]}>
          <mesh position={[0.08, 0.15, 0]} material={metal}>
            <boxGeometry args={[0.5, 0.06, 3.4]} />
          </mesh>
          <mesh position={[0.05, -0.28, 0]} material={metal}>
            <boxGeometry args={[0.08, 0.88, 3.3]} />
          </mesh>
          <mesh
            position={[-0.02, -0.28, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            material={materials.board}
          >
            <planeGeometry args={[3.2, 0.8]} />
          </mesh>
          {[-1.4, 1.4].map((dz) => (
            <mesh key={`hang${dz}`} position={[0.08, 0.45, dz]} material={metal}>
              <boxGeometry args={[0.04, 0.55, 0.04]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Totems d'information */}
      {totemZ.map((z) => (
        <group key={`totem${z}`} position={[totemX, PLATFORM_TOP, z]}>
          <mesh position={[0, 1.1, 0]} material={metal}>
            <boxGeometry args={[0.22, 2.2, 0.35]} />
          </mesh>
          <mesh
            position={[-0.12, 1.55, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            material={materials.sign}
          >
            <planeGeometry args={[0.3, 0.9]} />
          </mesh>
          <mesh position={[0, 2.35, 0]} material={accent}>
            <boxGeometry args={[0.28, 0.12, 0.4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
