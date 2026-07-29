// Petite LED orange sous le panneau LCD au-dessus de chaque porte (E235) :
// encastrée dans la sous-face de la paroi blanche, elle clignote côté quai
// dès l'annonce de fermeture et pendant la course des vantaux.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { PLAYER_CAR } from '../data/e235';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { doorObstructionAt } from '../systems/doorObstruction';
import { CLOSE_ANNOUNCE_LEAD, dwellDuration } from '../systems/stationCycle';

// Fréquence de clignotement (~2,5 Hz), calée sur l'indicateur réel.
const BLINK_HZ = 2.5;

const COLOR_OFF = '#6a3210';
const COLOR_DIM = '#b85414';
const COLOR_ON = '#ff8c1a';

function makeLedMat(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: COLOR_OFF,
    toneMapped: false,
    side: THREE.DoubleSide,
    // La sous-face est dans un creux : sans ça, le N8AO l'éteint.
    depthTest: true,
    depthWrite: false,
  });
}

function isDoorClosingWarn(): boolean {
  const { phase, index } = useStore.getState();
  // De l'annonce « portes qui ferment » jusqu'à la fin de la course : le même
  // instant que `announce-close` dans stationCycle, dwell compris.
  const fromAnnounce =
    phase === 'dwell' &&
    runtime.phaseT >= dwellDuration(index) - CLOSE_ANNOUNCE_LEAD &&
    runtime.doorOpen > 0.02;
  const closing = runtime.doorTarget === 0 && runtime.doorOpen > 0.02;
  return fromAnnounce || closing;
}

/** Clé du matériau d'une lentille : une par porte et par face. */
function ledKey(side: 1 | -1, z: number): string {
  return `${side}:${z}`;
}

export function DoorCloseLed() {
  // Un matériau par porte et par face : le témoin d'une porte restée ouverte
  // continue de clignoter quand tous les autres se sont éteints, et c'est
  // exactement comme ça qu'on repère la porte qui coince depuis l'intérieur.
  const mats = useMemo(() => {
    const map = new Map<string, THREE.MeshBasicMaterial>();
    for (const side of [1, -1] as const) {
      for (const z of CONFIG.doorCenters) map.set(ledKey(side, z), makeLedMat());
    }
    return map;
  }, []);
  const matsRef = useRef(mats);
  matsRef.current = mats;

  useFrame(({ clock }) => {
    const doorSide = useStore.getState().doorSide;
    const warn = isDoorClosingWarn();
    const lit = (clock.elapsedTime * BLINK_HZ) % 1 < 0.55;

    for (const side of [1, -1] as const) {
      for (const z of CONFIG.doorCenters) {
        const m = matsRef.current.get(ledKey(side, z));
        if (!m) continue;
        if (side !== doorSide) {
          // Face opposée au quai : lentille présente mais éteinte.
          m.color.set(COLOR_OFF);
          continue;
        }
        // La fermeture d'ensemble est finie, mais celle-ci n'est pas rentrée :
        // son témoin ne s'éteint pas tant qu'elle n'est pas confirmée fermée.
        const blocked = doorObstructionAt(PLAYER_CAR, z);
        if (warn || blocked) {
          m.color.set(lit ? COLOR_ON : COLOR_DIM);
        } else {
          // Lentille toujours un peu visible sous le panneau.
          m.color.set(COLOR_DIM);
        }
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
            {/* Sous-face du panneau blanc (h = 0,5 → y = −0,25) : disque orange
                orienté vers le bas, bien détaché pour rester lisible en cabine. */}
            <mesh
              position={[0, -0.268, 0.02]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={3}
              material={mats.get(ledKey(s, z))}
            >
              <circleGeometry args={[0.032, 20]} />
            </mesh>
            {/* Dôme légèrement bombé, comme la lentille réelle. */}
            <mesh
              position={[0, -0.272, 0.02]}
              scale={[1, 0.4, 1]}
              renderOrder={3}
              material={mats.get(ledKey(s, z))}
            >
              <sphereGeometry args={[0.026, 16, 10]} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}
