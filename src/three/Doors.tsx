// Portes coulissantes : 4 par face, deux vantaux chacune, liseré à pois
// jaunes sur le chant, autocollants d'avertissement. Seul le côté quai
// (doorSide) coulisse. Animation lue dans runtime.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG, DOOR_POCKET_TUCK } from '../data/config';
import { useStore } from '../store';
import { trainDoorLag, trainDoorPos } from '../systems/doorMotion';
import { makeDoorEdgeTexture, makeDoorStickerTexture } from '../textures/procedural';
import { roundedRect } from './shapes';

const DOOR_H = 1.85; // hauteur d'ouverture réelle d'une rame de banlieue
const PANEL_W = CONFIG.doorHalfWidth; // 0.66 par vantail

interface PanelRef {
  mesh: THREE.Group | null;
  side: 1 | -1;
  baseZ: number;
  dir: 1 | -1; // sens de coulissement
  dz: number; // centre z de la porte, pour son retard tiré au sort
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
      // Liseré et autocollant sont déjà décollés de trois millimètres du nu du
      // vantail : c'est mille fois la précision du tampon de profondeur à cette
      // distance, aucun décalage de polygones n'est nécessaire. Et il était
      // NUISIBLE : porte ouverte, ces deux décalques sont enfouis dans la paroi
      // du wagon, et un polygonOffset négatif les faisait ressortir au travers
      // sous les angles rasants — le chant de la porte scintillait.
      edge: new THREE.MeshBasicMaterial({
        map: makeDoorEdgeTexture(),
        transparent: true,
        toneMapped: false,
      }),
      sticker: new THREE.MeshBasicMaterial({
        map: makeDoorStickerTexture(),
        transparent: true,
        toneMapped: false,
      }),
    }),
    [],
  );

  // Vitres à coins arrondis (comme sur l'E235) et leur encadrement — et
  // surtout le VANTAIL lui-même, percé de la même baie : la vitre était
  // plaquée sur un panneau plein, on voyait la tôle au travers au lieu du
  // dehors. Le panneau est extrudé autour de la découpe.
  const windowGeos = useMemo(() => {
    const glassShape = roundedRect(0.42, 0.78, 0.09);
    const frameShape = roundedRect(0.5, 0.86, 0.11);
    frameShape.holes.push(roundedRect(0.42, 0.78, 0.09));
    const panelShape = roundedRect(PANEL_W, DOOR_H, 0.01, 0, DOOR_H / 2);
    panelShape.holes.push(roundedRect(0.42, 0.78, 0.09, 0, 1.32));
    const panel = new THREE.ExtrudeGeometry(panelShape, { depth: 0.05, bevelEnabled: false });
    panel.translate(0, 0, -0.025);
    return {
      glass: new THREE.ShapeGeometry(glassShape, 16),
      frame: new THREE.ShapeGeometry(frameShape, 16),
      panel,
    };
  }, []);

  useFrame(() => {
    const doorSide = useStore.getState().doorSide;
    for (const p of panels.current) {
      if (!p.mesh) continue;
      const open = p.side === doorSide ? trainDoorPos(trainDoorLag(p.dz)) : 0;
      // Course + dépassement : en butée le chant passe derrière le montant de
      // baie au lieu de tomber dans son plan (voir DOOR_POCKET_TUCK).
      p.mesh.position.z = p.baseZ + p.dir * open * (PANEL_W + DOOR_POCKET_TUCK);
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
                  if (g) panels.current.push({ mesh: g, side: s, baseZ, dir: half, dz });
                }}
                position={[s * (CONFIG.carHalfWidth + 0.03), 0, baseZ]}
              >
                {/* Vantail percé de sa baie : on voit dehors au travers */}
                <mesh
                  geometry={windowGeos.panel}
                  position={[0, 0, 0]}
                  rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  material={materials.panel}
                />
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
