// Rendu des PNJ : pool de groupes réutilisés, synchronisés chaque frame sur
// l'état de systems/passengers. Visages en CanvasTexture, manteaux variés.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { paxList, POOL_SIZE, initPassengers } from '../systems/passengers';
import { runtime } from '../systems/runtime';
import { makeFaceVariants } from '../textures/procedural';

const SEATED_DROP = 0.3;

interface PaxRefs {
  group: THREE.Group | null;
  legs: THREE.Mesh | null;
  head: THREE.Group | null;
}

export function Passengers() {
  initPassengers();
  const refs = useRef<PaxRefs[]>(
    Array.from({ length: POOL_SIZE }, () => ({ group: null, legs: null, head: null })),
  );

  const faces = useMemo(() => makeFaceVariants(), []);

  const shared = useMemo(
    () => ({
      legsGeo: new THREE.CylinderGeometry(0.085, 0.095, 0.55, 10),
      bodyGeo: new THREE.CylinderGeometry(0.13, 0.17, 0.64, 12),
      headGeo: new THREE.SphereGeometry(0.105, 14, 12),
      hairGeo: new THREE.SphereGeometry(0.112, 14, 12),
      faceGeo: new THREE.PlaneGeometry(0.17, 0.17),
      pantsMat: new THREE.MeshStandardMaterial({ color: '#3a3d46', roughness: 0.9 }),
    }),
    [],
  );

  const perPax = useMemo(
    () =>
      paxList.map((p) => {
        const face = faces[p.face % faces.length];
        return {
          coatMat: new THREE.MeshStandardMaterial({ color: p.coat, roughness: 0.88 }),
          skinMat: new THREE.MeshStandardMaterial({ color: face.skin, roughness: 0.7 }),
          hairMat: new THREE.MeshStandardMaterial({ color: face.hair, roughness: 0.85 }),
          faceMat: new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, toneMapped: false }),
        };
      }),
    [faces],
  );

  useFrame(() => {
    for (let i = 0; i < paxList.length; i++) {
      const p = paxList[i];
      const r = refs.current[i];
      if (!r.group) continue;
      if (p.state === 'hidden') {
        r.group.visible = false;
        continue;
      }
      r.group.visible = true;
      const seated = p.state === 'seated';
      const standingSway = p.state === 'standing' ? runtime.sway * 0.035 : 0;
      const seatedSway = seated ? runtime.sway * 0.012 : 0;
      r.group.position.set(
        p.pos.x + (p.state === 'standing' ? runtime.sway * 0.02 : 0),
        p.pos.y + p.bob - (seated ? SEATED_DROP : 0),
        p.pos.z,
      );
      r.group.rotation.set(p.bodyLean, p.yaw, standingSway + seatedSway);
      r.group.scale.set(p.height * p.width, p.height, p.height * p.width);
      if (r.legs) r.legs.visible = !seated;
      // Tête vivante : regard et hochements pilotés par la couche d'actions.
      if (r.head) r.head.rotation.set(p.headPitch, p.headYaw, 0);
    }
  });

  return (
    <group>
      {paxList.map((p, i) => (
        <group
          key={`pax${p.id}`}
          visible={false}
          ref={(g) => {
            refs.current[i].group = g;
          }}
        >
          {/* Jambes (masquées en position assise) */}
          <mesh
            geometry={shared.legsGeo}
            material={shared.pantsMat}
            position={[0, 0.275, 0]}
            ref={(m) => {
              refs.current[i].legs = m;
            }}
          />
          {/* Corps / manteau */}
          <mesh geometry={shared.bodyGeo} material={perPax[i].coatMat} position={[0, 0.86, 0]} />
          {/* Tête articulée (regards, hochements, éternuements) */}
          <group
            position={[0, 1.34, 0]}
            ref={(g) => {
              refs.current[i].head = g;
            }}
          >
            <mesh geometry={shared.headGeo} material={perPax[i].skinMat} />
            <mesh
              geometry={shared.hairGeo}
              material={perPax[i].hairMat}
              position={[0, 0.035, -0.022]}
              scale={[1, 0.82, 0.95]}
            />
            <mesh geometry={shared.faceGeo} material={perPax[i].faceMat} position={[0, -0.005, 0.102]} />
          </group>
        </group>
      ))}
    </group>
  );
}
