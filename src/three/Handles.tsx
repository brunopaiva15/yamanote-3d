// Tsurikawa (poignées suspendues) et barres verticales, instanciés.
// Les rangées de poignées oscillent avec le balancement du train.

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { runtime } from '../systems/runtime';

const RAIL_Y = 2.06;
const STRAP_LEN = 0.2;
const RING_Y = -STRAP_LEN - 0.05;

function HandleRow({ x }: { x: number }) {
  const group = useRef<THREE.Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(() => {
    if (!group.current) return;
    // Oscillation latérale autour du rail, amortie, liée au balancement et à
    // l'accélération longitudinale.
    const swing = runtime.sway * 0.09 + Math.sin(runtime.swayTime * 2.1 + phase) * 0.02 * (runtime.speed > 0.5 ? 1 : 0.2);
    const pitch = -runtime.accel * 0.045;
    group.current.rotation.z = swing;
    group.current.rotation.x = pitch;
  });

  const zs: number[] = [];
  for (let z = -8.8; z <= 8.8; z += 0.55) zs.push(z);

  return (
    <group position={[x, RAIL_Y, 0]}>
      {/* Rail porteur */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 18.4, 8]} />
        <meshStandardMaterial color="#ccd1d6" roughness={0.35} metalness={0.75} />
      </mesh>
      <group ref={group}>
        {/* Sangles */}
        <Instances limit={zs.length}>
          <boxGeometry args={[0.035, STRAP_LEN, 0.012]} />
          <meshStandardMaterial color="#e7e4da" roughness={0.85} />
          {zs.map((z) => (
            <Instance key={`s${z}`} position={[0, -STRAP_LEN / 2, z]} />
          ))}
        </Instances>
        {/* Anneaux verts */}
        <Instances limit={zs.length}>
          <torusGeometry args={[0.055, 0.013, 8, 20]} />
          <meshStandardMaterial color="#5da632" roughness={0.6} />
          {zs.map((z) => (
            <Instance key={`r${z}`} position={[0, RING_Y, z]} />
          ))}
        </Instances>
      </group>
    </group>
  );
}

export function Handles() {
  // Barres verticales aux extrémités des banquettes.
  const poleZs = [-8.16, -6.84, -3.16, -1.84, 1.84, 3.16, 6.84, 8.16];
  return (
    <group>
      <HandleRow x={0.45} />
      <HandleRow x={-0.45} />
      <Instances limit={poleZs.length * 2}>
        <cylinderGeometry args={[0.019, 0.019, 2.3, 10]} />
        <meshStandardMaterial color="#ccd1d6" roughness={0.3} metalness={0.8} />
        {poleZs.map((z) => (
          <Instance key={`p${z}`} position={[0.72, 1.15, z]} />
        ))}
        {poleZs.map((z) => (
          <Instance key={`q${z}`} position={[-0.72, 1.15, z]} />
        ))}
      </Instances>
    </group>
  );
}
