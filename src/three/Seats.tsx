// Modules d'assise E235, fidèles au design réel : coussins gris matelassés,
// traversin de dossier en moquette damier verte (rouge en zone prioritaire),
// panneaux d'extrémité blancs laqués ajourés, porte-bagages, arceaux chromés
// montant au plafond, radiateurs sous les assises.

import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Instances, Instance } from '@react-three/drei';
import { CONFIG } from '../data/config';
import { BENCHES, SEAT_SLOTS } from '../systems/seats';
import {
  makeCheckerTexture,
  makeQuiltTexture,
  makePriorityBadgeTexture,
  makeSurfaceTexture,
  makeRoughnessMap,
  GREEN_CHECKER,
  RED_CHECKER,
} from '../textures/procedural';

const WALL_X = CONFIG.carHalfWidth; // 1.4

// --- Panneau d'extrémité (袖仕切り) : silhouette ajourée extrudée ---
function makePanelGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Contour (x = profondeur depuis la paroi, y = hauteur).
  shape.moveTo(0, 0.07);
  shape.lineTo(0.5, 0.07);
  shape.quadraticCurveTo(0.68, 0.1, 0.66, 0.42);
  shape.lineTo(0.62, 1.02);
  shape.quadraticCurveTo(0.6, 1.34, 0.4, 1.42);
  shape.quadraticCurveTo(0.2, 1.47, 0, 1.46);
  shape.lineTo(0, 0.07);
  // Découpe arrondie (poignée), triangle adouci comme sur l'E235.
  const hole = new THREE.Path();
  hole.moveTo(0.44, 0.8);
  hole.quadraticCurveTo(0.58, 0.9, 0.51, 1.04);
  hole.quadraticCurveTo(0.44, 1.17, 0.32, 1.11);
  hole.quadraticCurveTo(0.22, 1.0, 0.29, 0.87);
  hole.quadraticCurveTo(0.35, 0.79, 0.44, 0.8);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.008,
    bevelSegments: 2,
    curveSegments: 14,
  });
  return geo;
}

// --- Arceau chromé du panneau vers le rail plafond ---
function makeStanchionGeometry(side: 1 | -1): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.76, 1.4, 0),
    new THREE.Vector3(side * 0.63, 1.74, 0),
    new THREE.Vector3(side * 0.47, 2.04, 0),
  ]);
  return new THREE.TubeGeometry(curve, 14, 0.017, 10);
}

// --- Arceau intermédiaire (banquettes de 7) : du bord d'assise au plafond ---
function makeMidStanchionGeometry(side: 1 | -1): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.99, 0.46, 0),
    new THREE.Vector3(side * 0.95, 1.1, 0),
    new THREE.Vector3(side * 0.72, 1.7, 0),
    new THREE.Vector3(side * 0.47, 2.05, 0),
  ]);
  return new THREE.TubeGeometry(curve, 20, 0.016, 10);
}

export function Seats() {
  const geos = useMemo(
    () => ({
      panel: makePanelGeometry(),
      stanchionR: makeStanchionGeometry(1),
      stanchionL: makeStanchionGeometry(-1),
      midR: makeMidStanchionGeometry(1),
      midL: makeMidStanchionGeometry(-1),
      // Coussins individuels arrondis (pas standard / prioritaire).
      cushion7: new RoundedBoxGeometry(0.44, 0.11, 0.5, 3, 0.035),
      cushion3: new RoundedBoxGeometry(0.44, 0.11, 0.44, 3, 0.035),
      slat: new THREE.BoxGeometry(0.055, 0.016, 3.46),
    }),
    [],
  );

  const materials = useMemo(() => {
    const green = makeCheckerTexture(GREEN_CHECKER);
    const red = makeCheckerTexture(RED_CHECKER);
    const quilt = makeQuiltTexture();
    const badge = makePriorityBadgeTexture();
    const rough = makeRoughnessMap();
    return {
      green: new THREE.MeshStandardMaterial({ map: green, roughness: 0.95 }),
      red: new THREE.MeshStandardMaterial({ map: red, roughness: 0.95 }),
      quilt: new THREE.MeshStandardMaterial({ map: quilt, roughness: 0.9 }),
      // FRP peint satiné, pas laqué : grain + rugosité bruitée.
      shell: new THREE.MeshStandardMaterial({
        map: makeSurfaceTexture('#eceae4', 0.8),
        roughnessMap: rough,
        roughness: 0.62,
        metalness: 0.02,
      }),
      // Inox brossé plutôt que chrome miroir.
      chrome: new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.3, metalness: 0.9 }),
      yellowGrip: new THREE.MeshStandardMaterial({ color: '#e0b23c', roughness: 0.68 }),
      heater: new THREE.MeshStandardMaterial({ color: '#585b60', roughness: 0.65, metalness: 0.35 }),
      badge: new THREE.MeshBasicMaterial({ map: badge, transparent: true, toneMapped: false }),
      rack: new THREE.MeshStandardMaterial({
        map: makeSurfaceTexture('#e9e7e1', 0.7),
        roughness: 0.6,
        metalness: 0.05,
      }),
    };
  }, []);

  const checkerByN = useMemo(() => {
    const cache = new Map<string, THREE.MeshStandardMaterial>();
    for (const priority of [false, true]) {
      for (const n of [3, 7]) {
        const src = priority ? materials.red : materials.green;
        const m = src.clone();
        const tex = (src.map as THREE.Texture).clone();
        tex.repeat.set(2, n);
        tex.needsUpdate = true;
        m.map = tex;
        cache.set(`${priority}-${n}`, m);
      }
    }
    return cache;
  }, [materials]);

  const sides: (1 | -1)[] = [1, -1];
  const seats7 = SEAT_SLOTS.filter((sl) => !sl.priority);
  const seats3 = SEAT_SLOTS.filter((sl) => sl.priority);
  // Lattes de la claie du porte-bagages (banquettes de 7 uniquement).
  const slats = useMemo(() => {
    const list: { x: number; y: number; z: number }[] = [];
    for (const s of [1, -1] as const) {
      for (const b of BENCHES) {
        if (b.priority) continue;
        const zc = (b.z0 + b.z1) / 2;
        for (let i = 0; i < 4; i++) {
          list.push({ x: s * (WALL_X - 0.09 - i * 0.1), y: 1.81 - i * 0.014, z: zc });
        }
      }
    }
    return list;
  }, []);

  return (
    <group>
      {/* Coussins individuels : un module arrondi par place assise */}
      <Instances geometry={geos.cushion7} material={materials.quilt} limit={seats7.length}>
        {seats7.map((sl, i) => (
          <Instance key={`c7-${i}`} position={[sl.side * 1.02, 0.4, sl.z]} />
        ))}
      </Instances>
      <Instances geometry={geos.cushion3} material={materials.quilt} limit={seats3.length}>
        {seats3.map((sl, i) => (
          <Instance key={`c3-${i}`} position={[sl.side * 1.02, 0.4, sl.z]} />
        ))}
      </Instances>
      {/* Claie ajourée des porte-bagages */}
      <Instances geometry={geos.slat} material={materials.rack} limit={slats.length}>
        {slats.map((p, i) => (
          <Instance key={`sl-${i}`} position={[p.x, p.y, p.z]} />
        ))}
      </Instances>
      {sides.map((s) =>
        BENCHES.map((b, bi) => {
          const len = b.z1 - b.z0;
          const zc = (b.z0 + b.z1) / 2;
          const checkerMat = checkerByN.get(`${b.priority}-${b.n}`) ?? materials.green;
          const stanchionMat = b.priority ? materials.yellowGrip : materials.chrome;
          const seatDepth = 0.46;
          const seatX = s * (WALL_X - 0.15 - seatDepth / 2);
          // Arceaux intermédiaires des banquettes de 7 (division 2-3-2).
          const midZs = b.n === 7 ? [b.z0 + (len * 2) / 7, b.z0 + (len * 5) / 7] : [];
          return (
            <group key={`bench${s}-${bi}`}>
              {/* Coque blanche cantilever sous l'assise */}
              <mesh position={[seatX, 0.3, zc]} material={materials.shell}>
                <boxGeometry args={[seatDepth + 0.06, 0.07, len]} />
              </mesh>
              {/* Radiateur incliné sous l'assise */}
              <mesh position={[s * (WALL_X - 0.42), 0.16, zc]} rotation={[0, 0, s * 0.35]} material={materials.heater}>
                <boxGeometry args={[0.3, 0.16, len - 0.3]} />
              </mesh>
              {/* Traversin de dossier en moquette damier */}
              <mesh
                position={[s * (WALL_X - 0.2), 0.8, zc]}
                rotation={[Math.PI / 2, 0, 0]}
                material={checkerMat}
              >
                <capsuleGeometry args={[0.155, Math.max(0.2, len - 0.34), 6, 14]} />
              </mesh>
              {/* Coque blanche derrière le dossier */}
              <mesh position={[s * (WALL_X - 0.05), 0.92, zc]} material={materials.shell}>
                <boxGeometry args={[0.05, 0.95, len]} />
              </mesh>
              {/* Badges 優先席 sur le dossier des places prioritaires */}
              {b.priority &&
                Array.from({ length: b.n }, (_, k) => {
                  const zSeat = b.z0 + (len / b.n) * (k + 0.5);
                  return (
                    <mesh
                      key={`badge${k}`}
                      position={[s * (WALL_X - 0.2 - 0.157), 0.86, zSeat]}
                      rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                      material={materials.badge}
                    >
                      <planeGeometry args={[0.17, 0.115]} />
                    </mesh>
                  );
                })}
              {/* Panneaux d'extrémité laqués ajourés */}
              {[b.z0, b.z1].map((z, k) => (
                <mesh
                  key={`panel${k}`}
                  geometry={geos.panel}
                  material={materials.shell}
                  position={[s * WALL_X, 0, z - 0.0175]}
                  rotation={[0, s === 1 ? Math.PI : 0, 0]}
                />
              ))}
              {/* Arceaux chromés (jaunes en zone prioritaire) vers le plafond */}
              {[b.z0, b.z1].map((z, k) => (
                <mesh
                  key={`stan${k}`}
                  geometry={s === 1 ? geos.stanchionR : geos.stanchionL}
                  material={stanchionMat}
                  position={[0, 0, z]}
                />
              ))}
              {midZs.map((z, k) => (
                <mesh
                  key={`mid${k}`}
                  geometry={s === 1 ? geos.midR : geos.midL}
                  material={materials.chrome}
                  position={[0, 0, z]}
                />
              ))}
              {/* Barre horizontale chromée au-dessus du dossier */}
              <mesh
                position={[s * 0.93, 1.32, zc]}
                rotation={[Math.PI / 2, 0, 0]}
                material={materials.chrome}
              >
                <cylinderGeometry args={[0.014, 0.014, len - 0.06, 8]} />
              </mesh>
              {/* Porte-bagages : lisse avant chromée et supports (la claie
                  ajourée est instanciée plus haut) */}
              {!b.priority && (
                <group>
                  <mesh
                    position={[s * (WALL_X - 0.45), 1.76, zc]}
                    rotation={[Math.PI / 2, 0, 0]}
                    material={materials.chrome}
                  >
                    <cylinderGeometry args={[0.013, 0.013, len - 0.15, 8]} />
                  </mesh>
                  {[b.z0 + 0.12, b.z1 - 0.12].map((z, k) => (
                    <mesh key={`arm${k}`} position={[s * (WALL_X - 0.3), 1.77, z]} rotation={[0, 0, s * 0.1]} material={materials.rack}>
                      <boxGeometry args={[0.32, 0.02, 0.03]} />
                    </mesh>
                  ))}
                </group>
              )}
            </group>
          );
        }),
      )}
    </group>
  );
}
