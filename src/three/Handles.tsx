// Tsurikawa E235 : poignées triangulaires vert Yamanote suspendues à des
// rails noirs (jaunes en zone prioritaire, aux extrémités du wagon).
// Les rangées oscillent avec le balancement du train.

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { runtime } from '../systems/runtime';

const RAIL_Y = 2.06;
// Sangles longues : anneau à ~1,64 m, la hauteur réelle des tsurikawa E235.
// Les PNJ ont des tailles japonaises réalistes ; ceux qui sont trop petits ne
// s'accrochent simplement pas (voir systems/passengers). Cette hauteur est
// reprise telle quelle par three/characters/pose.ts (STRAP_RING_Y) comme cible
// du bras levé : le centre de l'anneau ne doit pas bouger.
const STRAP_LEN = 0.32;
const RING_Y = -STRAP_LEN - 0.1;
const PRIORITY_Z = 8.1; // au-delà : zone prioritaire
// Pas relevé sur la rame : 45 cm, pas 50.
const RING_PITCH = 0.451;

// Anneau : triangle à coins arrondis, pointe en haut, 22 cm hors tout —
// mesuré sur la maquette de référence, contre 19 auparavant. Un tore à trois
// segments donnait des angles vifs et une section de 3,4 cm, bien trop grosse :
// la vraie barre fait 2 cm. On échantillonne chaque côté (sommet + trois points
// intermédiaires) avant de passer le tout à une Catmull-Rom fermée : les côtés
// restent tendus et seuls les angles s'arrondissent.
const RING_R = 0.116;
const RING_TUBE = 0.01;

function makeRingGeometry(): THREE.TubeGeometry {
  const corners = [0, 1, 2].map((i) => {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return new THREE.Vector3(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0);
  });
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 3; i++) {
    const from = corners[i];
    const to = corners[(i + 1) % 3];
    for (const t of [0, 0.25, 0.5, 0.75]) points.push(from.clone().lerp(to, t));
  }
  const curve = new THREE.CatmullRomCurve3(points, true);
  // 24 pas le long du parcours suffisent à tenir les angles arrondis, et 6
  // faces de section pour une barre de 2 cm : au-delà, on paie très cher un
  // objet minuscule répété 84 fois (un tube à 48 × 8 coûtait 64 000 triangles
  // pour l'ensemble des poignées, contre 4 500 à l'ancien tore).
  return new THREE.TubeGeometry(curve, 24, RING_TUBE, 6, true);
}

// Statique et partagée par les deux rangées.
const RING_GEO = makeRingGeometry();

function HandleRow({ x }: { x: number }) {
  const group = useRef<THREE.Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(() => {
    if (!group.current) return;
    // Balancement latéral uniquement (rotation.z) : il déplace toutes les
    // poignées de la même façon quel que soit leur z. On N'applique PAS de
    // tangage (rotation.x) : sur une rangée longue de ~19 m, il déplaçait les
    // poignées éloignées proportionnellement à leur distance au centre, d'où le
    // grand saut / « reset » au freinage puis à l'arrêt.
    const speedFactor = Math.min(1, runtime.speed / 3);
    const swing = runtime.sway * 0.09 + Math.sin(runtime.swayTime * 2.1 + phase) * 0.02 * speedFactor;
    group.current.rotation.z = swing;
  });

  const zs: number[] = [];
  for (let z = -9.35; z <= 9.35; z += RING_PITCH) zs.push(z);
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
          <meshStandardMaterial color="#2c2e33" roughness={0.82} />
          {zs.map((z) => (
            <Instance key={`s${z}`} position={[0, -STRAP_LEN / 2, z]} />
          ))}
        </Instances>
        {/* Anneaux triangulaires verts */}
        <Instances geometry={RING_GEO} limit={normal.length}>
          <meshStandardMaterial color="#79c140" roughness={0.55} metalness={0.02} />
          {normal.map((z) => (
            <Instance key={`r${z}`} position={[0, RING_Y, z]} />
          ))}
        </Instances>
        {/* Poignées jaunes de la zone prioritaire */}
        <Instances geometry={RING_GEO} limit={Math.max(1, priority.length)}>
          <meshStandardMaterial color="#e0b23c" roughness={0.55} metalness={0.02} />
          {priority.map((z) => (
            <Instance key={`p${z}`} position={[0, RING_Y, z]} />
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
