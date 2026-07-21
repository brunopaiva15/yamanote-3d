// Coque du wagon E235 : sol, plafond, parois avec fenêtres, bandeau LED,
// grilles de clim, bandes tactiles jaunes, parois d'about vitrées.

import { useMemo } from 'react';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { makeFloorTexture } from '../textures/procedural';

const HL = CONFIG.carHalfLength; // 10
const HW = CONFIG.carHalfWidth; // 1.4
const H = CONFIG.carHeight; // 2.3
const DOOR_HW = CONFIG.doorHalfWidth; // 0.66
const DOOR_H = 1.95;

// Segments de paroi entre les ouvertures de portes (portes à ±2.5 et ±7.5).
const WALL_SEGMENTS: { z0: number; z1: number }[] = [
  { z0: -HL, z1: -7.5 - DOOR_HW },
  { z0: -7.5 + DOOR_HW, z1: -2.5 - DOOR_HW },
  { z0: -2.5 + DOOR_HW, z1: 2.5 - DOOR_HW },
  { z0: 2.5 + DOOR_HW, z1: 7.5 - DOOR_HW },
  { z0: 7.5 + DOOR_HW, z1: HL },
];

const WINDOW_BOTTOM = 0.85;
const WINDOW_TOP = 1.75;
const PILLAR_W = 0.14;

export function Car() {
  const floorTexture = useMemo(() => makeFloorTexture(), []);

  const materials = useMemo(
    () => ({
      floor: new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.55, metalness: 0.15 }),
      wall: new THREE.MeshStandardMaterial({ color: '#d7d7ce', roughness: 0.8 }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#cbcdcc', roughness: 0.85 }),
      partition: new THREE.MeshStandardMaterial({ color: '#e2e2db', roughness: 0.75 }),
      steel: new THREE.MeshStandardMaterial({ color: '#ccd1d6', roughness: 0.35, metalness: 0.75 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#aebfc4',
        transparent: true,
        opacity: 0.1,
        roughness: 0.12,
        metalness: 0.1,
        side: THREE.DoubleSide,
      }),
      led: new THREE.MeshStandardMaterial({
        color: '#fff4e2',
        emissive: '#ffe9c8',
        emissiveIntensity: 1.35,
        roughness: 0.4,
      }),
      vent: new THREE.MeshStandardMaterial({ color: '#b9bcbe', roughness: 0.6, metalness: 0.3 }),
      tactile: new THREE.MeshStandardMaterial({
        color: '#e8c33a',
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      darkCap: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.9 }),
    }),
    [floorTexture],
  );

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {/* Sol */}
      <mesh position={[0, -0.05, 0]} material={materials.floor}>
        <boxGeometry args={[HW * 2, 0.1, HL * 2]} />
      </mesh>

      {/* Plafond */}
      <mesh position={[0, H + 0.05, 0]} material={materials.ceiling}>
        <boxGeometry args={[HW * 2, 0.1, HL * 2]} />
      </mesh>

      {/* Bandeau LED : deux lignes émissives sous le plafond, LA source visuelle. */}
      {sides.map((s) => (
        <mesh key={`led${s}`} position={[s * 0.52, H - 0.035, 0]} material={materials.led}>
          <boxGeometry args={[0.16, 0.03, HL * 2 - 1]} />
        </mesh>
      ))}

      {/* Grilles de clim au plafond */}
      {[-7.5, -2.5, 2.5, 7.5].map((z) => (
        <mesh key={`vent${z}`} position={[0, H - 0.015, z]} material={materials.vent}>
          <boxGeometry args={[0.7, 0.03, 1.6]} />
        </mesh>
      ))}

      {/* Parois latérales : segments entre portes, avec fenêtres cadrées. */}
      {sides.map((s) =>
        WALL_SEGMENTS.map((seg, i) => {
          const len = seg.z1 - seg.z0;
          const zc = (seg.z0 + seg.z1) / 2;
          const glassLen = Math.max(0.2, len - PILLAR_W * 2);
          return (
            <group key={`wall${s}-${i}`}>
              {/* Bas de caisse */}
              <mesh position={[s * HW, WINDOW_BOTTOM / 2, zc]} material={materials.wall}>
                <boxGeometry args={[0.08, WINDOW_BOTTOM, len]} />
              </mesh>
              {/* Haut de caisse */}
              <mesh position={[s * HW, (WINDOW_TOP + H) / 2, zc]} material={materials.wall}>
                <boxGeometry args={[0.08, H - WINDOW_TOP, len]} />
              </mesh>
              {/* Vitre, strictement dans l'interstice */}
              <mesh position={[s * (HW - 0.01), (WINDOW_BOTTOM + WINDOW_TOP) / 2, zc]} material={materials.glass}>
                <boxGeometry args={[0.02, WINDOW_TOP - WINDOW_BOTTOM, glassLen]} />
              </mesh>
              {/* Montants aux extrémités du segment */}
              <mesh
                position={[s * HW, (WINDOW_BOTTOM + WINDOW_TOP) / 2, seg.z0 + PILLAR_W / 2]}
                material={materials.wall}
              >
                <boxGeometry args={[0.08, WINDOW_TOP - WINDOW_BOTTOM, PILLAR_W]} />
              </mesh>
              <mesh
                position={[s * HW, (WINDOW_BOTTOM + WINDOW_TOP) / 2, seg.z1 - PILLAR_W / 2]}
                material={materials.wall}
              >
                <boxGeometry args={[0.08, WINDOW_TOP - WINDOW_BOTTOM, PILLAR_W]} />
              </mesh>
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

      {/* Bandes tactiles jaunes au sol devant chaque porte */}
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <mesh key={`tact${s}-${z}`} position={[s * (HW - 0.28), 0.004, z]} material={materials.tactile}>
            <boxGeometry args={[0.42, 0.008, DOOR_HW * 2]} />
          </mesh>
        )),
      )}

      {/* Parois d'about avec porte d'intercirculation vitrée */}
      {[-1, 1].map((e) => (
        <group key={`end${e}`}>
          <mesh position={[-0.91, H / 2, e * HL]} material={materials.partition}>
            <boxGeometry args={[0.98, H, 0.1]} />
          </mesh>
          <mesh position={[0.91, H / 2, e * HL]} material={materials.partition}>
            <boxGeometry args={[0.98, H, 0.1]} />
          </mesh>
          {/* Cadre inox et vitre de la porte d'intercirculation */}
          <mesh position={[0, 2.05, e * HL]} material={materials.partition}>
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
