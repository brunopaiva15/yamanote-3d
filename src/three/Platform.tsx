// Quai JR : structure opaque qui glisse le long de la voie à l'approche et
// au départ (plus de fondu d'opacité). Construit côté droit (+x) puis retourné
// de 180° pour le côté gauche. Portes palières, bande tactile, auvent, mur
// de fond, bancs, panneaux — une vraie gare vue depuis le wagon.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { psdDoorPos, psdGateLag } from '../systems/doorMotion';
import {
  makeStationSign,
  makePlatformFloorTexture,
  makeTactileTexture,
  makePlatformBoard,
  makeAdTexture,
} from '../textures/procedural';

const PLATFORM_TOP = -0.06;
const PSD_X = 1.78;
const PSD_H = 1.32;
const HALF_GAP = 0.9;
const LEAF_W = 0.98;
const LEAF_TRAVEL = 0.92;
const PLATFORM_LEN = 96;
const PLATFORM_DEPTH = 5.4;

function psdLayout(): { segs: { z0: number; z1: number }[]; gaps: number[] } {
  const gaps: number[] = [];
  for (let base = -40; base <= 40; base += 20) {
    for (const dz of [-7.5, -2.5, 2.5, 7.5]) gaps.push(base + dz);
  }
  gaps.sort((a, b) => a - b);
  const segs: { z0: number; z1: number }[] = [];
  let prev = -PLATFORM_LEN / 2;
  for (const gz of gaps) {
    if (gz - HALF_GAP > prev) segs.push({ z0: prev, z1: gz - HALF_GAP });
    prev = gz + HALF_GAP;
  }
  if (prev < PLATFORM_LEN / 2) segs.push({ z0: prev, z1: PLATFORM_LEN / 2 });
  return { segs, gaps };
}

interface LeafRef {
  mesh: THREE.Group | null;
  baseZ: number;
  dir: 1 | -1;
  gate: number;
}

export function Platform() {
  const doorSide = useStore((s) => s.doorSide);
  const root = useRef<THREE.Group>(null);
  const lastSignIndex = useRef(-1);

  const sign = useMemo(() => makeStationSign(), []);
  const board = useMemo(() => makePlatformBoard(), []);
  const floorTex = useMemo(() => {
    const t = makePlatformFloorTexture();
    t.repeat.set(3, 14);
    return t;
  }, []);
  const tactileTex = useMemo(() => {
    const t = makeTactileTexture();
    t.repeat.set(1, 28);
    return t;
  }, []);
  const ads = useMemo(() => [makeAdTexture(4101, true), makeAdTexture(4102, true), makeAdTexture(4103, true)], []);

  const materials = useMemo(() => {
    return {
      slab: new THREE.MeshStandardMaterial({ map: floorTex, color: '#c8c9c4', roughness: 0.94 }),
      tactile: new THREE.MeshStandardMaterial({
        map: tactileTex,
        color: '#e8c84a',
        roughness: 0.82,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      edge: new THREE.MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }),
      psd: new THREE.MeshStandardMaterial({ color: '#d8dad6', roughness: 0.62, metalness: 0.18 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#9eb4c4',
        roughness: 0.15,
        metalness: 0.05,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
      green: new THREE.MeshStandardMaterial({ color: '#80c241', roughness: 0.68 }),
      roof: new THREE.MeshStandardMaterial({ color: '#5e646a', roughness: 0.9, metalness: 0.15 }),
      beam: new THREE.MeshStandardMaterial({ color: '#6e747a', roughness: 0.78, metalness: 0.25 }),
      column: new THREE.MeshStandardMaterial({ color: '#8e9296', roughness: 0.72, metalness: 0.18 }),
      wall: new THREE.MeshStandardMaterial({ color: '#b8bab4', roughness: 0.92 }),
      wallDark: new THREE.MeshStandardMaterial({ color: '#9a9c96', roughness: 0.9 }),
      bench: new THREE.MeshStandardMaterial({ color: '#6a5a48', roughness: 0.88 }),
      metal: new THREE.MeshStandardMaterial({ color: '#7a8088', roughness: 0.45, metalness: 0.55 }),
      signFrame: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.55, metalness: 0.35 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff2d4', emissive: '#ffe7b0', emissiveIntensity: 0.85, roughness: 0.4 }),
      bin: new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.7, metalness: 0.2 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.95 }),
      sign: new THREE.MeshBasicMaterial({
        map: sign.texture,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
      board: new THREE.MeshBasicMaterial({
        map: board.texture,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
      ad0: new THREE.MeshBasicMaterial({ map: ads[0], toneMapped: false, side: THREE.DoubleSide }),
      ad1: new THREE.MeshBasicMaterial({ map: ads[1], toneMapped: false, side: THREE.DoubleSide }),
      ad2: new THREE.MeshBasicMaterial({ map: ads[2], toneMapped: false, side: THREE.DoubleSide }),
    };
  }, [floorTex, tactileTex, sign, board, ads]);

  const { segs: segments, gaps } = useMemo(() => psdLayout(), []);
  const leaves = useRef<LeafRef[]>([]);
  leaves.current = [];

  const columns = useMemo(() => {
    const zs: number[] = [];
    for (let z = -42; z <= 42; z += 10.5) zs.push(z);
    return zs;
  }, []);

  const benches = useMemo(
    () =>
      [-33, -18, -3, 12, 27].map((z, i) => ({
        z,
        ad: i % 3,
      })),
    [],
  );

  useFrame(() => {
    const presence = runtime.platformFade;
    if (root.current) {
      root.current.visible = presence > 0.02;
      root.current.position.z = runtime.platformSlide;
    }
    for (const l of leaves.current) {
      if (!l.mesh) continue;
      l.mesh.position.z = l.baseZ + l.dir * psdDoorPos(psdGateLag(l.gate)) * LEAF_TRAVEL;
    }
    const { index, phase } = useStore.getState();
    // Pendant depart l'index a déjà avancé : panneau = gare quittée (index-1).
    if (presence > 0.03) {
      const signIndex = phase === 'depart' ? (index + 29) % 30 : index;
      if ((phase === 'brake' || phase === 'dwell' || phase === 'depart') && lastSignIndex.current !== signIndex) {
        lastSignIndex.current = signIndex;
        sign.redraw(signIndex);
        board.redraw(signIndex);
      }
    }
  });

  const backX = 1.78 + PLATFORM_DEPTH - 0.15;
  const midX = 1.78 + PLATFORM_DEPTH * 0.55;

  return (
    <group ref={root} rotation={[0, doorSide === 1 ? 0 : Math.PI, 0]} visible={false}>
      {/* Dalle du quai */}
      <mesh position={[1.78 + PLATFORM_DEPTH / 2, PLATFORM_TOP - 0.22, 0]} material={materials.slab} receiveShadow>
        <boxGeometry args={[PLATFORM_DEPTH, 0.44, PLATFORM_LEN]} />
      </mesh>
      {/* Nez de quai caoutchouc */}
      <mesh position={[PSD_X + 0.12, PLATFORM_TOP + 0.01, 0]} material={materials.rubber}>
        <boxGeometry args={[0.16, 0.04, PLATFORM_LEN]} />
      </mesh>
      {/* Liseré blanc d'écartement */}
      <mesh position={[2.02, PLATFORM_TOP + 0.006, 0]} material={materials.edge}>
        <boxGeometry args={[0.12, 0.012, PLATFORM_LEN]} />
      </mesh>
      {/* Bande tactile jaune à picots */}
      <mesh position={[2.28, PLATFORM_TOP + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.tactile}>
        <planeGeometry args={[0.42, PLATFORM_LEN]} />
      </mesh>

      {/* Portes palières : murets + vitrage + liseré vert */}
      {segments.map((s, i) => {
        const len = s.z1 - s.z0;
        const zc = (s.z0 + s.z1) / 2;
        return (
          <group key={`psd${i}`}>
            <mesh position={[PSD_X, PLATFORM_TOP + PSD_H / 2, zc]} material={materials.psd}>
              <boxGeometry args={[0.1, PSD_H, len]} />
            </mesh>
            <mesh position={[PSD_X + 0.02, PLATFORM_TOP + PSD_H * 0.48, zc]} material={materials.glass}>
              <boxGeometry args={[0.04, PSD_H * 0.72, Math.max(0.2, len - 0.12)]} />
            </mesh>
            <mesh position={[PSD_X, PLATFORM_TOP + PSD_H - 0.09, zc]} material={materials.green}>
              <boxGeometry args={[0.12, 0.14, len]} />
            </mesh>
          </group>
        );
      })}

      {/* Vantaux coulissants */}
      {gaps.map((gz, i) =>
        ([-1, 1] as const).map((dir) => {
          const baseZ = gz + dir * (LEAF_W / 2);
          return (
            <group
              key={`leaf${i}-${dir}`}
              ref={(g) => {
                if (g) leaves.current.push({ mesh: g, baseZ, dir, gate: i });
              }}
              position={[0, 0, baseZ]}
            >
              <mesh position={[PSD_X + 0.08, PLATFORM_TOP + PSD_H / 2 - 0.03, 0]} material={materials.psd}>
                <boxGeometry args={[0.05, PSD_H - 0.06, LEAF_W]} />
              </mesh>
              <mesh position={[PSD_X + 0.1, PLATFORM_TOP + PSD_H * 0.48, 0]} material={materials.glass}>
                <boxGeometry args={[0.03, PSD_H * 0.7, LEAF_W - 0.1]} />
              </mesh>
              <mesh position={[PSD_X + 0.085, PLATFORM_TOP + PSD_H - 0.13, 0]} material={materials.green}>
                <boxGeometry args={[0.055, 0.12, LEAF_W]} />
              </mesh>
              <mesh position={[PSD_X + 0.085, PLATFORM_TOP + PSD_H * 0.42, -dir * (LEAF_W / 2 - 0.03)]} material={materials.tactile}>
                <boxGeometry args={[0.055, PSD_H * 0.55, 0.06]} />
              </mesh>
            </group>
          );
        }),
      )}

      {/* Mur de fond du quai */}
      <mesh position={[backX, PLATFORM_TOP + 1.55, 0]} material={materials.wall}>
        <boxGeometry args={[0.18, 3.1, PLATFORM_LEN]} />
      </mesh>
      {/* Bandeau sombre + frise verte JR */}
      <mesh position={[backX - 0.02, PLATFORM_TOP + 2.85, 0]} material={materials.wallDark}>
        <boxGeometry args={[0.2, 0.35, PLATFORM_LEN]} />
      </mesh>
      <mesh position={[backX - 0.03, PLATFORM_TOP + 2.55, 0]} material={materials.green}>
        <boxGeometry args={[0.08, 0.1, PLATFORM_LEN]} />
      </mesh>

      {/* Panneaux JR suspendus — en retrait sur le quai pour être lisibles depuis le wagon */}
      {[-9, 9].map((z) => (
        <group key={`sign${z}`} position={[5.45, PLATFORM_TOP + 2.72, z]}>
          {[-1.1, 1.1].map((dz) => (
            <mesh key={`hang${dz}`} position={[0.06, 0.52, dz]} material={materials.signFrame}>
              <boxGeometry args={[0.045, 0.75, 0.07]} />
            </mesh>
          ))}
          {/* Caisson noir derrière la face éclairée */}
          <mesh position={[0.055, 0, 0]} material={materials.signFrame}>
            <boxGeometry args={[0.1, 1.0, 3.35]} />
          </mesh>
          <mesh position={[-0.01, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={materials.sign}>
            <planeGeometry args={[3.2, 0.96]} />
          </mesh>
        </group>
      ))}

      {/* Tableau d'affichage suspendu, même profondeur que les panneaux JR */}
      <group position={[5.35, PLATFORM_TOP + 3.1, 0]}>
        <mesh position={[0.08, 0.15, 0]} material={materials.metal}>
          <boxGeometry args={[0.5, 0.06, 3.4]} />
        </mesh>
        <mesh position={[0.05, -0.28, 0]} material={materials.metal}>
          <boxGeometry args={[0.08, 0.88, 3.3]} />
        </mesh>
        <mesh position={[-0.02, -0.28, 0]} rotation={[0, -Math.PI / 2, 0]} material={materials.board}>
          <planeGeometry args={[3.2, 0.8]} />
        </mesh>
        {[-1.4, 1.4].map((z) => (
          <mesh key={`hang${z}`} position={[0.08, 0.45, z]} material={materials.metal}>
            <boxGeometry args={[0.04, 0.55, 0.04]} />
          </mesh>
        ))}
      </group>

      {/* Auvent + poutres + néons */}
      <mesh position={[1.78 + PLATFORM_DEPTH / 2, PLATFORM_TOP + 3.55, 0]} material={materials.roof}>
        <boxGeometry args={[PLATFORM_DEPTH + 0.4, 0.14, PLATFORM_LEN]} />
      </mesh>
      {columns.map((z) => (
        <group key={`col${z}`}>
          <mesh position={[backX - 0.55, PLATFORM_TOP + 1.7, z]} material={materials.column} castShadow>
            <boxGeometry args={[0.28, 3.4, 0.28]} />
          </mesh>
          {/* Bandeau vert sur pilier */}
          <mesh position={[backX - 0.55, PLATFORM_TOP + 1.35, z]} material={materials.green}>
            <boxGeometry args={[0.3, 0.16, 0.3]} />
          </mesh>
          <mesh position={[1.78 + PLATFORM_DEPTH / 2, PLATFORM_TOP + 3.42, z]} material={materials.beam}>
            <boxGeometry args={[PLATFORM_DEPTH - 0.2, 0.16, 0.22]} />
          </mesh>
          {/* Néon sous auvent */}
          <mesh position={[2.9, PLATFORM_TOP + 3.38, z]} material={materials.lamp}>
            <boxGeometry args={[1.6, 0.05, 0.12]} />
          </mesh>
        </group>
      ))}

      {/* Bancs + affiches + poubelles */}
      {benches.map((b) => {
        const adMat = b.ad === 0 ? materials.ad0 : b.ad === 1 ? materials.ad1 : materials.ad2;
        return (
          <group key={`bench${b.z}`} position={[backX - 0.85, PLATFORM_TOP, b.z]}>
            <mesh position={[0, 0.42, 0]} material={materials.bench}>
              <boxGeometry args={[0.55, 0.08, 2.4]} />
            </mesh>
            <mesh position={[0.2, 0.72, 0]} material={materials.bench}>
              <boxGeometry args={[0.08, 0.55, 2.4]} />
            </mesh>
            {[-0.9, 0.9].map((dz) => (
              <mesh key={`leg${dz}`} position={[0, 0.2, dz]} material={materials.metal}>
                <boxGeometry args={[0.45, 0.4, 0.08]} />
              </mesh>
            ))}
            {/* Affiche murale : fond derrière, image face au train */}
            <mesh position={[0.72, 1.55, 0]} material={materials.metal}>
              <boxGeometry args={[0.05, 1.65, 1.15]} />
            </mesh>
            <mesh position={[0.68, 1.55, 0]} rotation={[0, -Math.PI / 2, 0]} material={adMat}>
              <planeGeometry args={[1.1, 1.6]} />
            </mesh>
            {/* Poubelle */}
            <mesh position={[-0.15, 0.45, 1.55]} material={materials.bin}>
              <cylinderGeometry args={[0.18, 0.2, 0.9, 10]} />
            </mesh>
          </group>
        );
      })}

      {/* Totems d'information */}
      {[-24, 24].map((z) => (
        <group key={`totem${z}`} position={[midX - 0.6, PLATFORM_TOP, z]}>
          <mesh position={[0, 1.1, 0]} material={materials.metal}>
            <boxGeometry args={[0.22, 2.2, 0.35]} />
          </mesh>
          <mesh position={[-0.12, 1.55, 0]} rotation={[0, -Math.PI / 2, 0]} material={materials.sign}>
            <planeGeometry args={[0.3, 0.9]} />
          </mesh>
          <mesh position={[0, 2.35, 0]} material={materials.green}>
            <boxGeometry args={[0.28, 0.12, 0.4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
