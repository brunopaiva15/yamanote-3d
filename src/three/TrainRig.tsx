// Racine de la rame : tout ce qui appartient au train vit sous ce groupe.
//
// Tant que le joueur est à bord, `runtime.trainZ` vaut 0 et ce groupe est
// l'identité — le train reste fixe à l'origine et c'est le monde qui défile,
// exactement comme avant. Dès que le joueur descend sur le quai, on épingle la
// gare et c'est la rame qui glisse : ce groupe porte alors tout le mouvement,
// intérieur compris (on peut regarder par la fenêtre d'un train qui s'en va).

import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';

export function TrainRig({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null);

  useFrame(() => {
    if (root.current) root.current.position.z = runtime.trainZ;
  });

  return <group ref={root}>{children}</group>;
}
