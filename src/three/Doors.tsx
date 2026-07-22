// Portes coulissantes : 4 par face, deux vantaux chacune, liseré à pois
// jaunes sur le chant, autocollants d'avertissement. Seul le côté quai
// (doorSide) coulisse. Animation lue dans runtime.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { makeDoorEdgeTexture, makeDoorStickerTexture } from '../textures/procedural';

const DOOR_H = 1.95;
const PANEL_W = CONFIG.doorHalfWidth; // 0.66 par vantail

// Rectangle à coins arrondis, centré sur l'origine.
function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

interface PanelRef {
  mesh: THREE.Group | null;
  side: 1 | -1;
  baseZ: number;
  dir: 1 | -1; // sens de coulissement
}

export function Doors() {
  const panels = useRef<PanelRef[]>([]);
  panels.current = [];

  const materials = useMemo(
    () => ({
      panel: new THREE.MeshStandardMaterial({ color: '#ced1d5', roughness: 0.52, metalness: 0.35 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#cfd8da',
        transparent: true,
        opacity: 0.09,
        roughness: 0.08,
        metalness: 0.1,
        side: THREE.DoubleSide,
      }),
      frame: new THREE.MeshStandardMaterial({ color: '#b2b5b9', roughness: 0.55, metalness: 0.4 }),
      edge: new THREE.MeshBasicMaterial({
        map: makeDoorEdgeTexture(),
        transparent: true,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      sticker: new THREE.MeshBasicMaterial({
        map: makeDoorStickerTexture(),
        transparent: true,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    }),
    [],
  );

  // Vitres à coins arrondis (comme sur l'E235) et leur encadrement.
  const windowGeos = useMemo(() => {
    const glassShape = roundedRect(0.42, 0.78, 0.09);
    const frameShape = roundedRect(0.5, 0.86, 0.11);
    frameShape.holes.push(roundedRect(0.42, 0.78, 0.09));
    return {
      glass: new THREE.ShapeGeometry(glassShape, 16),
      frame: new THREE.ShapeGeometry(frameShape, 16),
    };
  }, []);

  useFrame(() => {
    const doorSide = useStore.getState().doorSide;
    for (const p of panels.current) {
      if (!p.mesh) continue;
      const open = p.side === doorSide ? runtime.doorOpen : 0;
      p.mesh.position.z = p.baseZ + p.dir * open * PANEL_W;
    }
  });

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {sides.map((s) =>
        CONFIG.doorCenters.map((dz) =>
          ([-1, 1] as const).map((half) => {
            const baseZ = dz + half * (PANEL_W / 2);
            const inner = s * -0.028; // face intérieure du vantail
            return (
              <group
                key={`door${s}-${dz}-${half}`}
                ref={(g) => {
                  if (g) panels.current.push({ mesh: g, side: s, baseZ, dir: half });
                }}
                position={[s * (CONFIG.carHalfWidth + 0.03), 0, baseZ]}
              >
                {/* Vantail */}
                <mesh position={[0, DOOR_H / 2, 0]} material={materials.panel}>
                  <boxGeometry args={[0.05, DOOR_H, PANEL_W]} />
                </mesh>
                {/* Encadrement de vitre à coins arrondis */}
                <mesh
                  geometry={windowGeos.frame}
                  position={[inner, 1.32, 0]}
                  rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  material={materials.frame}
                />
                {/* Vitre du vantail, coins arrondis */}
                <mesh
                  geometry={windowGeos.glass}
                  position={[s * -0.03, 1.32, 0]}
                  rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  material={materials.glass}
                />
                {/* Liseré à pois jaunes sur le chant côté fermeture */}
                <mesh
                  position={[inner, 1.0, -half * (PANEL_W / 2 - 0.035)]}
                  rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  material={materials.edge}
                >
                  <planeGeometry args={[0.06, 1.85]} />
                </mesh>
                {/* Autocollant d'avertissement sous la vitre */}
                <mesh
                  position={[inner, 0.78, half * 0.12]}
                  rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  material={materials.sticker}
                >
                  <planeGeometry args={[0.13, 0.13]} />
                </mesh>
              </group>
            );
          }),
        ),
      )}
    </group>
  );
}
