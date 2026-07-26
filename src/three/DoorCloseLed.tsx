// Petite LED orange sous le panneau LCD au-dessus de chaque porte (E235) :
// elle clignote pendant la fermeture des portes du côté quai — comme sur la
// rame réelle, encastrée dans la sous-face de la paroi blanche.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';

// Fréquence de clignotement (~2,5 Hz), calée sur l'indicateur réel.
const BLINK_HZ = 2.5;

function makeLedMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#5a2a0c',
    emissive: '#ff6a12',
    emissiveIntensity: 0,
    roughness: 0.35,
    metalness: 0.05,
    toneMapped: false,
  });
}

export function DoorCloseLed() {
  // Un matériau par face du wagon : seul le côté quai clignote.
  const mats = useMemo(
    () => ({
      right: makeLedMat(), // side +1
      left: makeLedMat(), // side -1
    }),
    [],
  );
  const matsRef = useRef(mats);
  matsRef.current = mats;

  useFrame(({ clock }) => {
    const doorSide = useStore.getState().doorSide;
    // Fermeture en cours : cible fermée et vantaux encore ouverts / en course.
    const closing = runtime.doorTarget === 0 && runtime.doorOpen > 0.02;
    const lit = closing && (clock.elapsedTime * BLINK_HZ) % 1 < 0.5;

    for (const side of [1, -1] as const) {
      const m = side === 1 ? matsRef.current.right : matsRef.current.left;
      if (side === doorSide && closing) {
        m.emissiveIntensity = lit ? 2.4 : 0.04;
        m.color.set(lit ? '#ff8a28' : '#5a2a0c');
      } else {
        m.emissiveIntensity = 0;
        m.color.set('#5a2a0c');
      }
    }
  });

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <group
            key={`doorLed${s}-${z}`}
            position={[s * (CONFIG.carHalfWidth - 0.05), 2.11, z]}
            rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
          >
            {/* Sous-face du panneau blanc (hauteur 0,5 → y = −0,25), centrée
                au-dessus de l'ouverture, légèrement en avant vers la cabine. */}
            <mesh position={[0, -0.258, 0.008]} scale={[1, 0.45, 1]} material={s === 1 ? mats.right : mats.left}>
              <sphereGeometry args={[0.02, 14, 10]} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}
