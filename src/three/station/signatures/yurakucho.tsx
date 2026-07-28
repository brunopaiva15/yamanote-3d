// JY30 有楽町 — le vieux viaduc de brique et d'acier.
//
// Le quai le plus étroit du secteur, sous une charpente rivetée basse et serrée,
// portée par des piliers épais. C'est un ouvrage du début du siècle dernier,
// pas une gare moderne : entraxe court, poutrelles partout, tons sombres. En
// contrepoint, à l'ouest, les coques de verre de l'International Forum.
//
// Les portiques sont instanciés : trente travées sur deux cent vingt mètres.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { mat, useInstances } from '../instancing';
import { bays, siteCut, useSigMaterials, type SigProps } from './kit';

/** Entraxe des portiques rivetés (m) : court, comme sur l'ouvrage réel. */
const FRAME = 7.2;

export function Yurakucho({ layout, place }: SigProps) {
  const { outerX, oppBackX } = siteCut(place);
  const top = layout.canopyY;
  const colX0 = PSD_X + 0.45;
  const colX1 = outerX - 0.45;
  const midX = (colX0 + colX1) / 2;
  const h = top - PLATFORM_TOP;

  const s = useSigMaterials(
    () => ({
      steel: new THREE.MeshStandardMaterial({ color: '#3f4a4c', roughness: 0.84, metalness: 0.38 }),
      brick: new THREE.MeshStandardMaterial({
        color: '#8a5a45',
        roughness: 0.94,
        emissive: '#5d3a2c',
        emissiveIntensity: 0.14,
      }),
      // Coques de verre de l'International Forum, en contrepoint moderne.
      forum: new THREE.MeshStandardMaterial({
        color: '#aebfcb',
        roughness: 0.14,
        metalness: 0.24,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    }),
    [],
  );

  const frameZ = useMemo(() => bays(layout.length, FRAME), [layout.length]);

  const posts = useMemo(
    () =>
      frameZ.flatMap((z) =>
        [colX0, colX1].map((x) => mat(x, PLATFORM_TOP + h / 2, z, 0.38, h, 0.38)),
      ),
    [frameZ, colX0, colX1, h],
  );
  const bases = useMemo(
    () =>
      frameZ.flatMap((z) =>
        [colX0, colX1].map((x) => mat(x, PLATFORM_TOP + 0.55, z, 0.52, 1.1, 0.52)),
      ),
    [frameZ, colX0, colX1],
  );
  const girders = useMemo(
    () => frameZ.map((z) => mat(midX, top - 0.28, z, colX1 - colX0 + 0.8, 0.52, 0.34)),
    [frameZ, midX, colX0, colX1, top],
  );
  const braces = useMemo(
    () =>
      frameZ.flatMap((z) =>
        [colX0 + 0.9, colX1 - 0.9].map((x) => mat(x, top - 0.72, z, 1.5, 0.16, 0.24)),
      ),
    [frameZ, colX0, colX1, top],
  );

  const postRef = useRef<THREE.InstancedMesh>(null);
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const girderRef = useRef<THREE.InstancedMesh>(null);
  const braceRef = useRef<THREE.InstancedMesh>(null);
  useInstances(postRef, posts);
  useInstances(baseRef, bases);
  useInstances(girderRef, girders);
  useInstances(braceRef, braces);

  return (
    <group>
      {/* Portiques rivetés : deux montants, une poutre, deux goussets. */}
      <instancedMesh ref={postRef} args={[undefined, undefined, Math.max(1, posts.length)]} material={s.steel}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={baseRef} args={[undefined, undefined, Math.max(1, bases.length)]} material={s.brick}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={girderRef} args={[undefined, undefined, Math.max(1, girders.length)]} material={s.steel}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={braceRef} args={[undefined, undefined, Math.max(1, braces.length)]} material={s.steel}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Longeron continu dans l'axe : ce qui donne au plafond sa trame serrée. */}
      <mesh position={[midX, top - 0.62, 0]} material={s.steel}>
        <boxGeometry args={[0.3, 0.34, layout.length - 4]} />
      </mesh>

      {/* L'International Forum : deux coques de verre par-dessus le parapet,
          la modernité à laquelle le vieux viaduc se cogne. */}
      {[-layout.length * 0.18, layout.length * 0.12].map((z, k) => (
        <mesh
          key={z}
          position={[oppBackX + 7 + k * 2, 6.5, z]}
          rotation={[0, 0, 0.06]}
          material={s.forum}
        >
          <boxGeometry args={[7 - k * 2, 15 - k * 3, 46 - k * 12]} />
        </mesh>
      ))}
    </group>
  );
}
