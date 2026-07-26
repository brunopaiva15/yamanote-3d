// Quai et portes palières (ホームドア), visibles uniquement à l'arrêt et du
// côté d'ouverture, avec fondu d'opacité. Construit côté droit (+x) puis
// retourné de 180° pour le côté gauche.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG, CAR_PITCH, TRAIN_Z_MIN, TRAIN_Z_MAX, carNumbers, carOffsetZ } from '../data/config';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { psdDoorPos, psdGateLag } from '../systems/doorMotion';
import { makeStationSign } from '../textures/procedural';

const PLATFORM_TOP = -0.06;
const PSD_X = 1.78;
const PSD_H = 1.32;
const HALF_GAP = 0.9;
const LEAF_W = 0.98; // largeur d'un vantail de porte palière
const LEAF_TRAVEL = 0.92; // course d'ouverture (dégage tout le passage)
const PLATFORM_LEN = TRAIN_Z_MAX - TRAIN_Z_MIN;
const PLATFORM_MID = (TRAIN_Z_MIN + TRAIN_Z_MAX) / 2;

// Portes palières : murets fixes entre les ouvertures alignées sur les portes
// de chaque voiture (z ≡ offset + ±2.5 / ±7.5), sur toute la longueur de la
// rame, plus la liste des centres d'ouverture où coulissent les vantaux.
function psdLayout(): { segs: { z0: number; z1: number }[]; gaps: number[] } {
  const gaps: number[] = [];
  for (const car of carNumbers()) {
    const oz = carOffsetZ(car);
    for (const dz of CONFIG.doorCenters) gaps.push(oz + dz);
  }
  gaps.sort((a, b) => a - b);
  const segs: { z0: number; z1: number }[] = [];
  let prev = TRAIN_Z_MIN;
  for (const gz of gaps) {
    if (gz - HALF_GAP > prev) segs.push({ z0: prev, z1: gz - HALF_GAP });
    prev = gz + HALF_GAP;
  }
  if (prev < TRAIN_Z_MAX) segs.push({ z0: prev, z1: TRAIN_Z_MAX });
  return { segs, gaps };
}

interface LeafRef {
  mesh: THREE.Group | null;
  baseZ: number; // position fermée du vantail
  dir: 1 | -1; // sens de coulissement à l'ouverture
  gate: number; // indice du portique, pour son retard tiré au sort
}

export function Platform() {
  const doorSide = useStore((s) => s.doorSide);
  const group = useRef<THREE.Group>(null);
  const lastSignIndex = useRef(-1);

  const sign = useMemo(() => makeStationSign(), []);

  const materials = useMemo(() => {
    const mk = (opts: THREE.MeshStandardMaterialParameters) =>
      new THREE.MeshStandardMaterial({ ...opts, transparent: true, opacity: 0 });
    return {
      slab: mk({ color: '#9b9c98', roughness: 0.95 }),
      yellow: mk({ color: '#e0bd35', roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -2 }),
      psd: mk({ color: '#d6d8d4', roughness: 0.68, metalness: 0.15 }),
      green: mk({ color: '#80c241', roughness: 0.7 }),
      roof: mk({ color: '#6f7376', roughness: 0.92 }),
      column: mk({ color: '#8e9296', roughness: 0.75, metalness: 0.2 }),
      people: mk({ color: '#3c4048', roughness: 0.95 }),
      sign: new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true, opacity: 0, toneMapped: false }),
    };
  }, [sign]);

  const matList = useMemo(() => Object.values(materials), [materials]);
  const { segs: segments, gaps } = useMemo(() => psdLayout(), []);
  const leaves = useRef<LeafRef[]>([]);
  leaves.current = [];
  const silhouettes = useMemo(() => {
    const list: { z: number; x: number; h: number }[] = [];
    for (let i = 0; i < 18; i++) {
      list.push({
        z: TRAIN_Z_MIN + 8 + i * (PLATFORM_LEN / 19),
        x: 2.9 + (i % 2) * 0.9,
        h: 1.5 + (i % 3) * 0.1,
      });
    }
    return list;
  }, []);
  const columns = useMemo(() => {
    const zs: number[] = [];
    for (let z = TRAIN_Z_MIN + CAR_PITCH / 2; z <= TRAIN_Z_MAX - CAR_PITCH / 2 + 0.01; z += CAR_PITCH / 2) {
      zs.push(z);
    }
    return zs;
  }, []);
  const signZs = useMemo(
    () => carNumbers().filter((n) => n % 2 === 1).map((n) => carOffsetZ(n)),
    [],
  );

  useFrame(() => {
    const fade = runtime.platformFade;
    if (group.current) group.current.visible = fade > 0.02;
    for (const m of matList) m.opacity = fade * (m === materials.sign ? 1 : 0.98);
    // Coulissement des vantaux, chaque portique avec son léger retard propre.
    for (const l of leaves.current) {
      if (!l.mesh) continue;
      l.mesh.position.z = l.baseZ + l.dir * psdDoorPos(psdGateLag(l.gate)) * LEAF_TRAVEL;
    }
    // Redessiner le panneau de gare à l'approche d'une nouvelle station.
    const { index, phase } = useStore.getState();
    if (fade > 0.03 && phase !== 'cruise' && lastSignIndex.current !== index) {
      lastSignIndex.current = index;
      sign.redraw(index);
    }
  });

  return (
    <group ref={group} rotation={[0, doorSide === 1 ? 0 : Math.PI, 0]} visible={false}>
      {/* Dalle du quai — toute la longueur de la rame */}
      <mesh position={[3.75, PLATFORM_TOP - 0.25, PLATFORM_MID]} material={materials.slab}>
        <boxGeometry args={[4.1, 0.5, PLATFORM_LEN]} />
      </mesh>
      {/* Ligne jaune de sécurité */}
      <mesh position={[2.1, PLATFORM_TOP + 0.004, PLATFORM_MID]} material={materials.yellow}>
        <boxGeometry args={[0.34, 0.01, PLATFORM_LEN]} />
      </mesh>
      {/* Portes palières : murets + liseré vert Yamanote */}
      {segments.map((s, i) => {
        const len = s.z1 - s.z0;
        const zc = (s.z0 + s.z1) / 2;
        return (
          <group key={`psd${i}`}>
            <mesh position={[PSD_X, PLATFORM_TOP + PSD_H / 2, zc]} material={materials.psd}>
              <boxGeometry args={[0.09, PSD_H, len]} />
            </mesh>
            <mesh position={[PSD_X, PLATFORM_TOP + PSD_H - 0.09, zc]} material={materials.green}>
              <boxGeometry args={[0.1, 0.14, len]} />
            </mesh>
          </group>
        );
      })}
      {/* Vantaux coulissants des portiques, un léger retard propre à chacun */}
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
              <mesh position={[PSD_X + 0.085, PLATFORM_TOP + PSD_H - 0.13, 0]} material={materials.green}>
                <boxGeometry args={[0.055, 0.12, LEAF_W]} />
              </mesh>
              {/* Bande jaune d'avertissement sur le chant côté fermeture */}
              <mesh position={[PSD_X + 0.085, PLATFORM_TOP + PSD_H * 0.42, -dir * (LEAF_W / 2 - 0.03)]} material={materials.yellow}>
                <boxGeometry args={[0.055, PSD_H * 0.55, 0.06]} />
              </mesh>
            </group>
          );
        }),
      )}
      {/* Panneaux de nom de station, une voiture sur deux */}
      {signZs.map((z) => (
        <group key={`sign${z}`} position={[3.6, 1.85, z]}>
          <mesh position={[0, 0.55, 0]} material={materials.column}>
            <cylinderGeometry args={[0.04, 0.04, 1.4, 8]} />
          </mesh>
          <mesh rotation={[0, -Math.PI / 2, 0]} material={materials.sign}>
            <planeGeometry args={[2.3, 0.72]} />
          </mesh>
        </group>
      ))}
      {/* Toit et piliers */}
      <mesh position={[4.1, 3.15, PLATFORM_MID]} material={materials.roof}>
        <boxGeometry args={[4.6, 0.12, PLATFORM_LEN]} />
      </mesh>
      {columns.map((z) => (
        <mesh key={`col${z}`} position={[4.6, 1.55, z]} material={materials.column}>
          <cylinderGeometry args={[0.09, 0.09, 3.2, 10]} />
        </mesh>
      ))}
      {/* Silhouettes de voyageurs statiques */}
      {silhouettes.map((p, i) => (
        <group key={`ppl${i}`} position={[p.x, PLATFORM_TOP, p.z]}>
          <mesh position={[0, p.h * 0.42, 0]} material={materials.people}>
            <capsuleGeometry args={[0.14, p.h * 0.62, 4, 8]} />
          </mesh>
          <mesh position={[0, p.h * 0.92, 0]} material={materials.people}>
            <sphereGeometry args={[0.1, 10, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
