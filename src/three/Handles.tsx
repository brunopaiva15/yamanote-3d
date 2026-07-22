// Tsurikawa E235 : poignées triangulaires vert Yamanote suspendues à des
// rails noirs (jaunes en zone prioritaire, aux extrémités du wagon).
// Les rangées oscillent avec le balancement du train.

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { runtime } from '../systems/runtime';

const RAIL_Y = 2.06;
const STRAP_LEN = 0.16;
const RING_Y = -STRAP_LEN - 0.075;
const PRIORITY_Z = 8.1; // au-delà : zone prioritaire

function HandleRow({ x }: { x: number }) {
  const group = useRef<THREE.Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(() => {
    if (!group.current) return;
    const swing =
      runtime.sway * 0.09 + Math.sin(runtime.swayTime * 2.1 + phase) * 0.02 * (runtime.speed > 0.5 ? 1 : 0.2);
    const pitch = -runtime.accel * 0.045;
    group.current.rotation.z = swing;
    group.current.rotation.x = pitch;
  });

  const zs: number[] = [];
  for (let z = -9.35; z <= 9.35; z += 0.5) zs.push(z);
  const normal = zs.filter((z) => Math.abs(z) <= PRIORITY_Z);
  const priority = zs.filter((z) => Math.abs(z) > PRIORITY_Z);

  return (
    <group position={[x, RAIL_Y, 0]}>
      {/* Rail porteur noir */}
      <mesh>
        <boxGeometry args={[0.035, 0.045, 19.2]} />
        <meshStandardMaterial color="#26282c" roughness={0.7} metalness={0.25} />
      </mesh>
      <group ref={group}>
        {/* Sangles */}
        <Instances limit={zs.length}>
          <boxGeometry args={[0.03, STRAP_LEN, 0.014]} />
          <meshStandardMaterial color="#dcd9cf" roughness={0.85} />
          {zs.map((z) => (
            <Instance key={`s${z}`} position={[0, -STRAP_LEN / 2, z]} />
          ))}
        </Instances>
        {/* Anneaux triangulaires verts (torus à 3 segments, pointe en haut) */}
        <Instances limit={normal.length}>
          <torusGeometry args={[0.078, 0.017, 10, 3]} />
          <meshStandardMaterial color="#79c140" roughness={0.55} metalness={0.02} />
          {normal.map((z) => (
            <Instance key={`r${z}`} position={[0, RING_Y, z]} rotation={[0, 0, Math.PI / 2]} />
          ))}
        </Instances>
        {/* Poignées jaunes de la zone prioritaire */}
        <Instances limit={Math.max(1, priority.length)}>
          <torusGeometry args={[0.078, 0.017, 10, 3]} />
          <meshStandardMaterial color="#e0b23c" roughness={0.55} metalness={0.02} />
          {priority.map((z) => (
            <Instance key={`p${z}`} position={[0, RING_Y, z]} rotation={[0, 0, Math.PI / 2]} />
          ))}
        </Instances>
      </group>
    </group>
  );
}

export function Handles() {
  return (
    <group>
      <HandleRow x={0.45} />
      <HandleRow x={-0.45} />
    </group>
  );
}
