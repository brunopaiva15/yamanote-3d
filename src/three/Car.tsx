// Coque du wagon E235 : sol clair à joints, plafond à caisson central, parois
// laquées avec fenêtres, zone prioritaire rose aux extrémités, bandeau LED,
// bandes tactiles à picots, parois d'about vitrées.

import { useMemo } from 'react';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import {
  makeFloorTexture,
  makeTactileTexture,
  makePriorityFloorTexture,
  makePrioritySignTexture,
} from '../textures/procedural';

const HL = CONFIG.carHalfLength; // 10
const HW = CONFIG.carHalfWidth; // 1.4
const H = CONFIG.carHeight; // 2.3
const DOOR_HW = CONFIG.doorHalfWidth; // 0.66
const DOOR_H = 1.95;

// Segments de paroi entre les ouvertures de portes (portes à ±2.5 et ±7.5).
// Les segments d'extrémité (index 0 et 4) sont en zone prioritaire (rose).
const WALL_SEGMENTS: { z0: number; z1: number; pink: boolean }[] = [
  { z0: -HL, z1: -7.5 - DOOR_HW, pink: true },
  { z0: -7.5 + DOOR_HW, z1: -2.5 - DOOR_HW, pink: false },
  { z0: -2.5 + DOOR_HW, z1: 2.5 - DOOR_HW, pink: false },
  { z0: 2.5 + DOOR_HW, z1: 7.5 - DOOR_HW, pink: false },
  { z0: 7.5 + DOOR_HW, z1: HL, pink: true },
];

const WINDOW_BOTTOM = 0.85;
const WINDOW_TOP = 1.75;
const PILLAR_W = 0.14;

export function Car() {
  const textures = useMemo(
    () => ({
      floor: makeFloorTexture(),
      tactile: makeTactileTexture(),
      priorityFloor: makePriorityFloorTexture(),
      prioritySign: makePrioritySignTexture(),
    }),
    [],
  );

  const materials = useMemo(
    () => ({
      floor: new THREE.MeshStandardMaterial({ map: textures.floor, roughness: 0.42, metalness: 0.1 }),
      wall: new THREE.MeshStandardMaterial({ color: '#e4e3dc', roughness: 0.28, metalness: 0.02 }),
      pinkWall: new THREE.MeshStandardMaterial({ color: '#efd3da', roughness: 0.3, metalness: 0.02 }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#dfe0de', roughness: 0.5 }),
      ceilingCenter: new THREE.MeshStandardMaterial({ color: '#e9eae7', roughness: 0.35 }),
      partition: new THREE.MeshStandardMaterial({ color: '#e6e4de', roughness: 0.28 }),
      pinkPartition: new THREE.MeshStandardMaterial({ color: '#efd3da', roughness: 0.3 }),
      steel: new THREE.MeshStandardMaterial({ color: '#d6dade', roughness: 0.18, metalness: 0.9 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#cfd8da',
        transparent: true,
        opacity: 0.09,
        roughness: 0.06,
        metalness: 0.25,
        side: THREE.DoubleSide,
      }),
      led: new THREE.MeshStandardMaterial({
        color: '#fff4e2',
        emissive: '#ffe9c8',
        emissiveIntensity: 1.0,
        roughness: 0.4,
      }),
      vent: new THREE.MeshStandardMaterial({ color: '#b9bcbe', roughness: 0.55, metalness: 0.3 }),
      ventSlot: new THREE.MeshStandardMaterial({ color: '#3c3f44', roughness: 0.7 }),
      tactile: new THREE.MeshStandardMaterial({
        map: textures.tactile,
        roughness: 0.65,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      priorityFloor: new THREE.MeshBasicMaterial({
        map: textures.priorityFloor,
        transparent: true,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      prioritySign: new THREE.MeshBasicMaterial({ map: textures.prioritySign, toneMapped: false }),
      darkCap: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.9 }),
    }),
    [textures],
  );

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {/* Sol */}
      <mesh position={[0, -0.05, 0]} material={materials.floor}>
        <boxGeometry args={[HW * 2, 0.1, HL * 2]} />
      </mesh>

      {/* Stickers de sol 優先席 aux extrémités */}
      {[-1, 1].map((e) => (
        <mesh
          key={`pf${e}`}
          position={[0, 0.003, e * 9.1]}
          rotation={[-Math.PI / 2, 0, e === 1 ? Math.PI : 0]}
          material={materials.priorityFloor}
        >
          <planeGeometry args={[1.15, 1.15]} />
        </mesh>
      ))}

      {/* Plafond et caisson central */}
      <mesh position={[0, H + 0.05, 0]} material={materials.ceiling}>
        <boxGeometry args={[HW * 2, 0.1, HL * 2]} />
      </mesh>
      <mesh position={[0, H - 0.012, 0]} material={materials.ceilingCenter}>
        <boxGeometry args={[1.05, 0.025, HL * 2 - 0.8]} />
      </mesh>
      {/* Fentes de ventilation le long du caisson */}
      {sides.map((s) => (
        <mesh key={`slot${s}`} position={[s * 0.56, H - 0.008, 0]} material={materials.ventSlot}>
          <boxGeometry args={[0.05, 0.018, HL * 2 - 1.2]} />
        </mesh>
      ))}

      {/* Bandeau LED : deux lignes émissives, LA source visuelle. */}
      {sides.map((s) => (
        <mesh key={`led${s}`} position={[s * 0.78, H - 0.03, 0]} material={materials.led}>
          <boxGeometry args={[0.14, 0.028, HL * 2 - 1]} />
        </mesh>
      ))}

      {/* Grilles de clim au plafond */}
      {[-7.5, -2.5, 2.5, 7.5].map((z) => (
        <mesh key={`vent${z}`} position={[0, H - 0.028, z]} material={materials.vent}>
          <boxGeometry args={[0.7, 0.03, 1.6]} />
        </mesh>
      ))}

      {/* Parois latérales : segments entre portes, fenêtres cadrées. */}
      {sides.map((s) =>
        WALL_SEGMENTS.map((seg, i) => {
          const len = seg.z1 - seg.z0;
          const zc = (seg.z0 + seg.z1) / 2;
          const glassLen = Math.max(0.2, len - PILLAR_W * 2);
          const wallMat = seg.pink ? materials.pinkWall : materials.wall;
          return (
            <group key={`wall${s}-${i}`}>
              <mesh position={[s * HW, WINDOW_BOTTOM / 2, zc]} material={wallMat}>
                <boxGeometry args={[0.08, WINDOW_BOTTOM, len]} />
              </mesh>
              <mesh position={[s * HW, (WINDOW_TOP + H) / 2, zc]} material={wallMat}>
                <boxGeometry args={[0.08, H - WINDOW_TOP, len]} />
              </mesh>
              <mesh position={[s * (HW - 0.01), (WINDOW_BOTTOM + WINDOW_TOP) / 2, zc]} material={materials.glass}>
                <boxGeometry args={[0.02, WINDOW_TOP - WINDOW_BOTTOM, glassLen]} />
              </mesh>
              <mesh position={[s * HW, (WINDOW_BOTTOM + WINDOW_TOP) / 2, seg.z0 + PILLAR_W / 2]} material={wallMat}>
                <boxGeometry args={[0.08, WINDOW_TOP - WINDOW_BOTTOM, PILLAR_W]} />
              </mesh>
              <mesh position={[s * HW, (WINDOW_BOTTOM + WINDOW_TOP) / 2, seg.z1 - PILLAR_W / 2]} material={wallMat}>
                <boxGeometry args={[0.08, WINDOW_TOP - WINDOW_BOTTOM, PILLAR_W]} />
              </mesh>
              {/* Panneau 優先席 sur le montant haut des segments roses */}
              {seg.pink && (
                <mesh
                  position={[s * (HW - 0.045), 1.98, zc]}
                  rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  material={materials.prioritySign}
                >
                  <planeGeometry args={[0.34, 0.21]} />
                </mesh>
              )}
            </group>
          );
        }),
      )}

      {/* Linteaux au-dessus des portes */}
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <mesh key={`lintel${s}-${z}`} position={[s * HW, (DOOR_H + H) / 2, z]} material={materials.wall}>
            <boxGeometry args={[0.08, H - DOOR_H, DOOR_HW * 2]} />
          </mesh>
        )),
      )}

      {/* Bandes tactiles jaunes à picots devant chaque porte */}
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <mesh key={`tact${s}-${z}`} position={[s * (HW - 0.28), 0.004, z]} material={materials.tactile}>
            <boxGeometry args={[0.42, 0.008, DOOR_HW * 2]} />
          </mesh>
        )),
      )}

      {/* Parois d'about (roses, zone prioritaire) avec porte d'intercirculation */}
      {[-1, 1].map((e) => (
        <group key={`end${e}`}>
          <mesh position={[-0.91, H / 2, e * HL]} material={materials.pinkPartition}>
            <boxGeometry args={[0.98, H, 0.1]} />
          </mesh>
          <mesh position={[0.91, H / 2, e * HL]} material={materials.pinkPartition}>
            <boxGeometry args={[0.98, H, 0.1]} />
          </mesh>
          <mesh position={[0, 2.05, e * HL]} material={materials.pinkPartition}>
            <boxGeometry args={[0.84, 0.5, 0.1]} />
          </mesh>
          <mesh position={[0, 0.95, e * HL - e * 0.01]} material={materials.steel}>
            <boxGeometry args={[0.84, 1.9, 0.06]} />
          </mesh>
          <mesh position={[0, 1.25, e * HL - e * 0.045]} material={materials.glass}>
            <boxGeometry args={[0.56, 1.05, 0.02]} />
          </mesh>
          {/* Cap sombre derrière la vitre : silhouette du wagon suivant */}
          <mesh position={[0, 1.1, e * (HL + 0.6)]} material={materials.darkCap}>
            <boxGeometry args={[2.4, 2.3, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
