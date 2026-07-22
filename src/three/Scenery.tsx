// Décor extérieur : ciel de fin d'après-midi (cylindre à dégradé + soleil),
// trois couches d'immeubles en silhouette par côté, défilement par
// texture.offset piloté par la distance parcourue, ballast au sol.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import {
  makeCityTexture,
  makeGroundTexture,
  makeSkyTexture,
  makeSunsetSkyTexture,
  makeNightSkyTexture,
} from '../textures/procedural';

interface Layer {
  x: number;
  height: number;
  metersPerRepeat: number;
  repeat: number;
  layer: 0 | 1 | 2;
  opacity: number;
}

const LAYERS: Layer[] = [
  { x: 11, height: 8, metersPerRepeat: 60, repeat: 4, layer: 0, opacity: 1 },
  { x: 24, height: 12, metersPerRepeat: 120, repeat: 2, layer: 1, opacity: 1 },
  { x: 42, height: 18, metersPerRepeat: 240, repeat: 1, layer: 2, opacity: 0.9 },
];

const PLANE_LEN = 240;

export function Scenery() {
  const materials = useRef<{ mat: THREE.MeshBasicMaterial; metersPerRepeat: number; sign: number }[]>([]);
  const groundMat = useRef<THREE.MeshBasicMaterial | null>(null);

  // Variante nuit de la ville : plans superposés dont l'opacité suit l'heure.
  const nightMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const dayCityMats = useRef<{ mat: THREE.MeshBasicMaterial; base: number; hasNight: boolean }[]>([]);
  const skyMats = useRef<{ day: THREE.MeshBasicMaterial; golden: THREE.MeshBasicMaterial; night: THREE.MeshBasicMaterial } | null>(
    null,
  );

  const built = useMemo(() => {
    materials.current = [];
    nightMats.current = [];
    dayCityMats.current = [];
    const planes: {
      key: string;
      x: number;
      y: number;
      rotY: number;
      height: number;
      mat: THREE.MeshBasicMaterial;
      night?: THREE.MeshBasicMaterial;
    }[] = [];
    for (const L of LAYERS) {
      for (const side of [1, -1] as const) {
        const tex = makeCityTexture(L.layer);
        tex.repeat.set(L.repeat, 1);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: L.opacity,
          fog: true,
          depthWrite: false,
        });
        // Sens de défilement : les immeubles reculent quand le train avance.
        const sign = side === -1 ? 1 : -1;
        materials.current.push({ mat, metersPerRepeat: L.metersPerRepeat, sign });
        dayCityMats.current.push({ mat, base: L.opacity, hasNight: L.layer < 2 });
        // Plan nuit (mêmes bâtiments, fenêtres allumées) pour les couches proches.
        let night: THREE.MeshBasicMaterial | undefined;
        if (L.layer < 2) {
          const ntex = makeCityTexture(L.layer, true);
          ntex.repeat.set(L.repeat, 1);
          night = new THREE.MeshBasicMaterial({
            map: ntex,
            transparent: true,
            opacity: 0,
            fog: true,
            depthWrite: false,
          });
          materials.current.push({ mat: night, metersPerRepeat: L.metersPerRepeat, sign });
          nightMats.current.push(night);
        }
        planes.push({
          key: `city${L.layer}-${side}`,
          x: side * L.x,
          y: L.height / 2 - 1.1,
          rotY: side === -1 ? Math.PI / 2 : -Math.PI / 2,
          height: L.height,
          mat,
          night,
        });
      }
    }
    const groundTex = makeGroundTexture();
    groundTex.repeat.set(2, 24);
    const gm = new THREE.MeshBasicMaterial({ map: groundTex, fog: true, color: '#d6d4ce' });
    groundMat.current = gm;
    // Trois ciels superposés, fondus selon l'heure de Tokyo.
    const mkSky = (map: THREE.CanvasTexture, opacity: number) =>
      new THREE.MeshBasicMaterial({
        map,
        side: THREE.BackSide,
        fog: false,
        toneMapped: false,
        transparent: true,
        opacity,
        depthWrite: false,
      });
    skyMats.current = {
      day: mkSky(makeSkyTexture(), 1),
      golden: mkSky(makeSunsetSkyTexture(), 0),
      night: mkSky(makeNightSkyTexture(), 0),
    };
    return { planes, gm, sky: skyMats.current };
  }, []);

  // Poteaux caténaires et arbres qui défilent : les vrais vendeurs de vitesse.
  const poles = useRef<(THREE.Group | null)[]>([]);
  const POLE_COUNT = 8;
  const POLE_SPACING = 30;
  const trees = useRef<(THREE.Group | null)[]>([]);
  const TREE_COUNT = 12;
  const TREE_SPACING = 21;

  useFrame(() => {
    for (const m of materials.current) {
      const tex = m.mat.map;
      if (tex) tex.offset.x = (m.sign * runtime.distance) / m.metersPerRepeat;
    }
    const g = groundMat.current?.map;
    if (g) g.offset.y = runtime.distance / 10;
    const span = POLE_COUNT * POLE_SPACING;
    for (let i = 0; i < POLE_COUNT; i++) {
      const p = poles.current[i];
      if (!p) continue;
      p.position.z = ((runtime.distance + i * POLE_SPACING) % span) - span / 2;
    }
    const treeSpan = TREE_COUNT * TREE_SPACING;
    for (let i = 0; i < TREE_COUNT; i++) {
      const t = trees.current[i];
      if (!t) continue;
      t.position.z = ((runtime.distance * 0.999 + i * TREE_SPACING + 9) % treeSpan) - treeSpan / 2;
    }
    // Cycle jour / nuit : fondu des ciels et des fenêtres de la ville.
    const w = dayNightWeights(runtime.clockMin / 60);
    if (skyMats.current) {
      skyMats.current.day.opacity = w.day;
      skyMats.current.golden.opacity = w.golden;
      skyMats.current.night.opacity = w.night;
    }
    const cityNight = Math.min(1, w.night + w.golden * 0.45);
    for (const m of nightMats.current) m.opacity = cityNight;
    // Le plan jour s'efface à la nuit (les couches sans variante nuit
    // s'assombrissent par teinte).
    for (const d of dayCityMats.current) {
      if (d.hasNight) d.mat.opacity = d.base * (1 - cityNight);
      else {
        const k = 1 - 0.72 * cityNight;
        d.mat.color.setRGB(k, k, k * 1.08);
      }
    }
  });

  // Arbres boules (esprit Shashingo) : tronc + deux masses de feuillage.
  const treeSpecs = useMemo(
    () =>
      Array.from({ length: TREE_COUNT }, (_, i) => ({
        x: (i % 2 === 0 ? 1 : -1) * (7.2 + ((i * 13) % 5) * 0.5),
        scale: 0.85 + ((i * 29) % 10) / 22,
        leaf: ['#5fb54a', '#6ec25a', '#54a844'][i % 3],
      })),
    [],
  );

  return (
    <group>
      {/* Ciels superposés (jour / doré / nuit), fondus selon l'heure de Tokyo */}
      {([
        ['night', built.sky.night, -6],
        ['golden', built.sky.golden, -5],
        ['day', built.sky.day, -4],
      ] as const).map(([key, mat, order]) => (
        <mesh key={`sky-${key}`} position={[0, 14, 0]} material={mat} renderOrder={order}>
          <cylinderGeometry args={[78, 78, 64, 48, 1, true]} />
        </mesh>
      ))}

      {built.planes.map((p) => (
        <group key={p.key}>
          <mesh position={[p.x, p.y, 0]} rotation={[0, p.rotY, 0]} material={p.mat}>
            <planeGeometry args={[PLANE_LEN, p.height]} />
          </mesh>
          {/* Variante nuit, 2 cm plus proche : le tri par distance la dessine
              après le plan jour et AVANT les vitres du wagon (dont l'écriture
              de profondeur éliminerait tout plan dessiné après elles). */}
          {p.night && (
            <mesh position={[p.x + (p.x > 0 ? -0.02 : 0.02), p.y, 0]} rotation={[0, p.rotY, 0]} material={p.night}>
              <planeGeometry args={[PLANE_LEN, p.height]} />
            </mesh>
          )}
        </group>
      ))}

      {/* Arbres boules défilants le long de la voie */}
      {treeSpecs.map((spec, i) => (
        <group
          key={`tree${i}`}
          ref={(g) => {
            trees.current[i] = g;
          }}
          position={[spec.x, -1.1, 0]}
          scale={spec.scale}
        >
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.14, 0.2, 2.2, 8]} />
            <meshStandardMaterial color="#7a5c42" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.9, 0]} scale={[1, 0.88, 1]}>
            <sphereGeometry args={[1.35, 14, 12]} />
            <meshStandardMaterial color={spec.leaf} roughness={0.85} />
          </mesh>
          <mesh position={[0.7, 2.2, 0.3]} scale={[1, 0.8, 1]}>
            <sphereGeometry args={[0.8, 12, 10]} />
            <meshStandardMaterial color="#74c85a" roughness={0.85} />
          </mesh>
        </group>
      ))}

      {/* Portiques caténaires défilants */}
      {Array.from({ length: 8 }, (_, i) => (
        <group
          key={`pole${i}`}
          ref={(g) => {
            poles.current[i] = g;
          }}
        >
          {([-1, 1] as const).map((s) => (
            <mesh key={`pl${s}`} position={[s * 5.2, 2.2, 0]}>
              <cylinderGeometry args={[0.09, 0.11, 7, 8]} />
              <meshStandardMaterial color="#4a4f55" roughness={0.7} metalness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, 5.4, 0]}>
            <boxGeometry args={[10.6, 0.14, 0.14]} />
            <meshStandardMaterial color="#4a4f55" roughness={0.7} metalness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Sol extérieur : bande de ballast étroite sous le train */}
      <mesh position={[0, -1.15, 0]} rotation={[-Math.PI / 2, 0, 0]} material={built.gm}>
        <planeGeometry args={[9, PLANE_LEN]} />
      </mesh>
      {/* Base urbaine claire (béton, trottoirs) jusqu'aux immeubles */}
      <mesh position={[0, -1.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[160, PLANE_LEN]} />
        <meshBasicMaterial color="#c4c6bc" fog />
      </mesh>
    </group>
  );
}
