// Tsurikawa E235 : poignées triangulaires vert Yamanote (jaunes en zone
// prioritaire, aux extrémités du wagon), refaites d'après photos. Il n'y a
// PAS de sangle souple accrochée à un rail noir : chaque poignée est un
// COLLIER de plastique articulé serré sur une barre chromée, prolongé d'une
// courte attache rigide, puis l'anneau — le tout d'une seule teinte. La barre
// est portée par de petits pendards fixés au plafond.
// Les rangées oscillent avec le balancement du train.

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { CONFIG } from '../data/config';
import { runtime } from '../systems/runtime';

// Barre chromée un peu plus basse que l'ancien rail, mais attache COURTE :
// le bas de l'anneau remonte à ~1,70 m, au-dessus de la tête du joueur (yeux
// à 1,55 m) — on ne se prend plus les poignées en marchant. Cette hauteur est
// reprise par three/characters/pose.ts (STRAP_RING_Y ≈ centre d'anneau) et
// par le seuil d'atteinte des PNJ (systems/passengers).
const RAIL_Y = 2.0;
const LINK_LEN = 0.1; // attache rigide collier → anneau
const PRIORITY_Z = 8.1; // au-delà : zone prioritaire
// Pas relevé sur la rame : 45 cm.
const RING_PITCH = 0.451;

// Anneau : triangle à coins arrondis, pointe en haut, 22 cm hors tout —
// mesuré sur la maquette de référence. On échantillonne chaque côté (sommet +
// trois points intermédiaires) avant de passer le tout à une Catmull-Rom
// fermée : les côtés restent tendus et seuls les angles s'arrondissent.
const RING_R = 0.116;
const RING_TUBE = 0.011;
// Centre de l'anneau sous la barre : collier, attache, puis rayon.
const RING_Y = -(0.01 + LINK_LEN + RING_R);

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
  // 24 pas le long du parcours et 6 faces de section : suffisant pour un
  // objet de 22 cm répété 84 fois — au-delà, on paie très cher.
  return new THREE.TubeGeometry(curve, 24, RING_TUBE, 6, true);
}

// Géométries statiques, partagées par les deux rangées.
const RING_GEO = makeRingGeometry();
const COLLAR_GEO = new THREE.CylinderGeometry(0.024, 0.024, 0.05, 10);
const LINK_GEO = new THREE.BoxGeometry(0.036, LINK_LEN + 0.02, 0.013);

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

  // Une poignée complète = collier sur la barre + attache + anneau, d'une
  // seule teinte : trois jeux d'instances par couleur.
  const handleSet = (list: number[], color: string, keyPrefix: string) => (
    <>
      <Instances geometry={COLLAR_GEO} limit={Math.max(1, list.length)}>
        <meshStandardMaterial color={color} roughness={0.62} metalness={0.02} />
        {list.map((z) => (
          <Instance key={`${keyPrefix}c${z}`} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]} />
        ))}
      </Instances>
      <Instances geometry={LINK_GEO} limit={Math.max(1, list.length)}>
        <meshStandardMaterial color={color} roughness={0.62} metalness={0.02} />
        {list.map((z) => (
          <Instance key={`${keyPrefix}l${z}`} position={[0, -(LINK_LEN + 0.02) / 2, z]} />
        ))}
      </Instances>
      <Instances geometry={RING_GEO} limit={Math.max(1, list.length)}>
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.02} />
        {list.map((z) => (
          <Instance key={`${keyPrefix}r${z}`} position={[0, RING_Y, z]} />
        ))}
      </Instances>
    </>
  );

  return (
    <group position={[x, RAIL_Y, 0]}>
      {/* Barre porteuse chromée */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 19.2, 12]} />
        <meshStandardMaterial color="#c9ced3" roughness={0.28} metalness={0.9} />
      </mesh>
      {/* Pendards : petits tubes qui portent la barre depuis le plafond */}
      {[-8.4, -6, -3.6, -1.2, 1.2, 3.6, 6, 8.4].map((z) => (
        <mesh key={`sup${z}`} position={[0, (CONFIG.carHeight - RAIL_Y) / 2, z]}>
          <cylinderGeometry args={[0.009, 0.009, CONFIG.carHeight - RAIL_Y, 8]} />
          <meshStandardMaterial color="#dfe1e3" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
      <group ref={group}>
        {handleSet(normal, '#79c140', 'n')}
        {handleSet(priority, '#e0b23c', 'p')}
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
