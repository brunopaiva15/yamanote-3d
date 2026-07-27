// La gare : quai praticable de 224 m, décliné en cinq typologies.
//
// Remplace l'ancien Platform.tsx, qui décrivait un quai unique de 96 m pensé
// pour n'être vu que par les vitres. Maintenant qu'on y marche, il faut sa
// vraie longueur (onze voitures de 20 m), de quoi occuper les yeux d'un bout à
// l'autre, et une gare de viaduc qui ne ressemble pas à une gare en tranchée.
//
// Construit côté +x puis retourné d'un demi-tour selon le côté d'ouverture, et
// glissant le long de la voie — comme avant. Tout ce qui se répète (murets de
// portes palières, vantaux, piliers, poutres, néons, bancs, marquages au sol)
// passe par un InstancedMesh : le quai a beau être deux fois et demie plus
// long, il coûte dix fois moins d'appels de rendu.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { runtime } from '../../systems/runtime';
import { psdDoorPos, psdGateLag } from '../../systems/doorMotion';
import { placementFor } from '../../systems/stationPlacement';
import { layoutFor, type StationPalette } from '../../data/stationLayouts';
import {
  PLATFORM_TOP,
  PSD_H,
  PSD_LEAF_TRAVEL,
  PSD_LEAF_W,
  PSD_X,
} from '../../data/stationGeometry';
import { makeAdTexture, makePlatformFloorTexture, makeTactileTexture } from '../../textures/procedural';
import { PlatformSignage } from './PlatformSignage';
import { psdLayout } from './psdLayout';

const UP = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

function mat(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V.set(x, y, z), UP, S.set(sx, sy, sz));
}

/** Pose une liste de matrices sur un InstancedMesh et ajuste son compte. */
function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  matrices: THREE.Matrix4[],
): void {
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
    im.count = matrices.length;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [ref, matrices]);
}

type StationTextures = {
  floor: THREE.Texture;
  tactile: THREE.Texture;
  ads: THREE.Texture[];
};

/** Tous les matériaux d'une gare, dérivés de sa palette. */
function makeStationMaterials(p: StationPalette, textures: StationTextures) {
  return {
      slab: new THREE.MeshStandardMaterial({
        map: textures.floor,
        color: p.slab,
        roughness: 0.94,
        emissive: p.slab,
        emissiveIntensity: 0.12,
      }),
      tactile: new THREE.MeshStandardMaterial({
        map: textures.tactile,
        color: '#e8c84a',
        roughness: 0.82,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      edge: new THREE.MeshStandardMaterial({
        color: '#f2f2ef',
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
      queue: new THREE.MeshBasicMaterial({
        color: '#e8e4d8',
        transparent: true,
        opacity: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        toneMapped: false,
      }),
      rubber: new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.95 }),
      psd: new THREE.MeshStandardMaterial({ color: '#d8dad6', roughness: 0.62, metalness: 0.18 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#9eb4c4',
        roughness: 0.15,
        metalness: 0.05,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
      accent: new THREE.MeshStandardMaterial({ color: p.accent, roughness: 0.68 }),
      canopy: new THREE.MeshStandardMaterial({
        color: p.canopy,
        roughness: 0.9,
        metalness: 0.15,
        // Sous un auvent, aucune lumière directe n'atteint la sous-face : sans
        // ce rappel, elle vire au noir dès qu'on marche dessous.
        emissive: p.canopy,
        emissiveIntensity: 0.34,
      }),
      beam: new THREE.MeshStandardMaterial({
        color: p.canopy,
        roughness: 0.78,
        metalness: 0.3,
        emissive: p.canopy,
        emissiveIntensity: 0.28,
      }),
      column: new THREE.MeshStandardMaterial({
        color: p.column,
        roughness: 0.72,
        metalness: 0.18,
        emissive: p.column,
        emissiveIntensity: 0.16,
      }),
      wall: new THREE.MeshStandardMaterial({
        color: p.wall,
        roughness: 0.92,
        emissive: p.wall,
        emissiveIntensity: 0.14,
      }),
      wallDark: new THREE.MeshStandardMaterial({ color: p.column, roughness: 0.9 }),
      bench: new THREE.MeshStandardMaterial({ color: '#6a5a48', roughness: 0.88 }),
      metal: new THREE.MeshStandardMaterial({ color: '#7a8088', roughness: 0.45, metalness: 0.55 }),
      frame: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.55, metalness: 0.35 }),
      lamp: new THREE.MeshStandardMaterial({
        color: p.lamp,
        emissive: p.lamp,
        emissiveIntensity: 0.9,
        roughness: 0.4,
      }),
      bin: new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.7, metalness: 0.2 }),
      vending: new THREE.MeshStandardMaterial({ color: '#b8322c', roughness: 0.6 }),
      vendingFace: new THREE.MeshBasicMaterial({ map: textures.ads[0], toneMapped: false }),
      kiosk: new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.78 }),
      ad: new THREE.MeshBasicMaterial({
        map: textures.ads[1],
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
      liner: new THREE.MeshStandardMaterial({ color: '#3b3f44', roughness: 0.95 }),
    };

}

type Mats = ReturnType<typeof makeStationMaterials>;

export function Station() {
  const doorSide = useStore((s) => s.doorSide);
  const index = useStore((s) => s.index);
  const root = useRef<THREE.Group>(null);

  const layout = layoutFor(index);
  const { segs, gaps } = useMemo(() => psdLayout(layout.length), [layout.length]);
  const place = useMemo(() => placementFor(index, gaps), [index, gaps]);
  const halfZ = layout.length / 2;
  const backX = place.backX;
  const depth = layout.depth;
  const canopyY = layout.canopyY;

  // --- Textures et matériaux, refaits à chaque changement de gare ---
  const textures = useMemo(() => {
    const floor = makePlatformFloorTexture();
    floor.repeat.set(3, Math.round(layout.length / 7));
    const tactile = makeTactileTexture();
    tactile.repeat.set(1, Math.round(layout.length / 3.4));
    return { floor, tactile, ads: [makeAdTexture(4101, true), makeAdTexture(4102, true)] };
  }, [layout.length]);

  const m = useMemo(() => makeStationMaterials(layout.palette, textures), [layout.palette, textures]);

  // Les matériaux et textures d'une gare quittée ne resservent pas.
  useLayoutEffect(() => {
    const mats = Object.values(m);
    const texs = [textures.floor, textures.tactile, ...textures.ads];
    return () => {
      for (const x of mats) x.dispose();
      for (const t of texs) t.dispose();
    };
  }, [m, textures]);

  // --- Matrices des éléments répétés ---
  const psdSegs = useMemo(
    () => segs.map((s) => mat(PSD_X, PLATFORM_TOP + PSD_H / 2, (s.z0 + s.z1) / 2, 0.1, PSD_H, s.z1 - s.z0)),
    [segs],
  );
  const psdGlass = useMemo(
    () =>
      segs.map((s) =>
        mat(PSD_X + 0.02, PLATFORM_TOP + PSD_H * 0.72, (s.z0 + s.z1) / 2, 0.02, PSD_H * 0.42, s.z1 - s.z0 - 0.16),
      ),
    [segs],
  );
  const psdBand = useMemo(
    () =>
      segs.map((s) =>
        mat(PSD_X - 0.005, PLATFORM_TOP + PSD_H - 0.07, (s.z0 + s.z1) / 2, 0.12, 0.1, s.z1 - s.z0),
      ),
    [segs],
  );
  const columns = useMemo(
    () =>
      place.columns.map((z) =>
        mat(backX - 0.55, PLATFORM_TOP + (canopyY - PLATFORM_TOP) / 2, z, 0.3, canopyY - PLATFORM_TOP, 0.3),
      ),
    [place.columns, backX, canopyY],
  );
  const columnBands = useMemo(
    () => place.columns.map((z) => mat(backX - 0.55, PLATFORM_TOP + 1.4, z, 0.33, 0.16, 0.33)),
    [place.columns, backX],
  );
  const beams = useMemo(
    () => place.columns.map((z) => mat(PSD_X + depth / 2, canopyY - 0.09, z, depth - 0.2, 0.18, 0.24)),
    [place.columns, depth, canopyY],
  );
  const lamps = useMemo(
    () =>
      place.columns.flatMap((z) => [
        mat(PSD_X + depth * 0.28, canopyY - 0.11, z + layout.columnSpacing / 2, 1.7, 0.05, 0.14),
        mat(PSD_X + depth * 0.72, canopyY - 0.11, z, 1.7, 0.05, 0.14),
      ]),
    [place.columns, depth, canopyY, layout.columnSpacing],
  );
  const queue = useMemo(
    () => place.queueMarks.map((q) => mat(q.x, PLATFORM_TOP + 0.006, q.z, 0.9, 1, 0.5)),
    [place.queueMarks],
  );
  const benchSeat = useMemo(
    () => place.benches.map((b) => mat(b.x, PLATFORM_TOP + 0.42, b.z, 0.55, 0.08, 2.4)),
    [place.benches],
  );
  const benchBack = useMemo(
    () => place.benches.map((b) => mat(b.x + 0.2, PLATFORM_TOP + 0.72, b.z, 0.08, 0.55, 2.4)),
    [place.benches],
  );
  const benchLegs = useMemo(
    () =>
      place.benches.flatMap((b) =>
        [-0.9, 0.9].map((dz) => mat(b.x, PLATFORM_TOP + 0.2, b.z + dz, 0.45, 0.4, 0.08)),
      ),
    [place.benches],
  );
  const bins = useMemo(
    () => place.bins.map((b) => mat(b.x, PLATFORM_TOP + 0.45, b.z, 1, 1, 1)),
    [place.bins],
  );
  const vending = useMemo(
    () => place.vending.map((v) => mat(v.x, PLATFORM_TOP + 0.9, v.z, 0.8, 1.8, 1.4)),
    [place.vending],
  );
  const vendingFace = useMemo(
    () => place.vending.map((v) => mat(v.x - 0.41, PLATFORM_TOP + 1.05, v.z, 1, 1.1, 1.2)),
    [place.vending],
  );

  const psdRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);
  const columnRef = useRef<THREE.InstancedMesh>(null);
  const columnBandRef = useRef<THREE.InstancedMesh>(null);
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const lampRef = useRef<THREE.InstancedMesh>(null);
  const queueRef = useRef<THREE.InstancedMesh>(null);
  const seatRef = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);
  const legRef = useRef<THREE.InstancedMesh>(null);
  const binRef = useRef<THREE.InstancedMesh>(null);
  const vendRef = useRef<THREE.InstancedMesh>(null);
  const vendFaceRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);

  useInstances(psdRef, psdSegs);
  useInstances(glassRef, psdGlass);
  useInstances(bandRef, psdBand);
  useInstances(columnRef, columns);
  useInstances(columnBandRef, columnBands);
  useInstances(beamRef, beams);
  useInstances(lampRef, lamps);
  useInstances(queueRef, queue);
  useInstances(seatRef, benchSeat);
  useInstances(backRef, benchBack);
  useInstances(legRef, benchLegs);
  useInstances(binRef, bins);
  useInstances(vendRef, vending);
  useInstances(vendFaceRef, vendingFace);

  // --- Vantaux des portes palières, animés ---
  const leafMat = useRef(new THREE.Matrix4());
  const leafCount = gaps.length * 2;
  useFrame(() => {
    const presence = runtime.platformFade;
    if (root.current) {
      root.current.visible = presence > 0.02;
      root.current.position.z = runtime.platformSlide;
    }
    const im = leafRef.current;
    if (!im || presence <= 0.02) return;
    const mm = leafMat.current;
    let k = 0;
    for (let g = 0; g < gaps.length; g++) {
      const open = psdDoorPos(psdGateLag(g)) * PSD_LEAF_TRAVEL;
      for (const dir of [1, -1] as const) {
        mm.compose(
          V.set(PSD_X + 0.08, PLATFORM_TOP + PSD_H / 2, gaps[g] + dir * (PSD_LEAF_W / 2 + open)),
          UP,
          S.set(0.07, PSD_H - 0.06, PSD_LEAF_W),
        );
        im.setMatrixAt(k++, mm);
      }
    }
    im.count = leafCount;
    im.instanceMatrix.needsUpdate = true;
  });

  const midX = PSD_X + depth * 0.55;
  const wallH = canopyY - 0.07 - PLATFORM_TOP;

  return (
    <group ref={root} rotation={[0, doorSide === 1 ? 0 : Math.PI, 0]} visible={false}>
      {/* --- Dalle, bord de quai, bande tactile --- */}
      <mesh
        position={[PSD_X + depth / 2, PLATFORM_TOP - 0.22, 0]}
        material={m.slab}
        receiveShadow
      >
        <boxGeometry args={[depth, 0.44, layout.length]} />
      </mesh>
      <mesh position={[PSD_X + 0.12, PLATFORM_TOP + 0.01, 0]} material={m.rubber}>
        <boxGeometry args={[0.16, 0.04, layout.length]} />
      </mesh>
      <mesh position={[PSD_X + 0.24, PLATFORM_TOP + 0.006, 0]} material={m.edge}>
        <boxGeometry args={[0.12, 0.012, layout.length]} />
      </mesh>
      <mesh
        position={[PSD_X + 0.5, PLATFORM_TOP + 0.008, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={m.tactile}
      >
        <planeGeometry args={[0.42, layout.length]} />
      </mesh>
      {/* Repères d'attente peints au sol, deux par baie */}
      <instancedMesh ref={queueRef} args={[undefined, undefined, Math.max(1, queue.length)]} material={m.queue}>
        <boxGeometry args={[1, 0.004, 1]} />
      </instancedMesh>

      {/* --- Portes palières --- */}
      <instancedMesh ref={psdRef} args={[undefined, undefined, Math.max(1, psdSegs.length)]} material={m.psd}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={glassRef} args={[undefined, undefined, Math.max(1, psdGlass.length)]} material={m.glass}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={bandRef} args={[undefined, undefined, Math.max(1, psdBand.length)]} material={m.accent}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[undefined, undefined, Math.max(1, leafCount)]} material={m.psd}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* --- Fond de quai selon la typologie --- */}
      <Backdrop layout={layout} backX={backX} wallH={wallH} m={m} />

      {/* --- Auvent, poutres, piliers, néons --- */}
      <mesh position={[PSD_X + depth / 2, canopyY + 0.07, 0]} material={m.canopy} receiveShadow>
        <boxGeometry args={[depth + 0.4, 0.14, layout.length]} />
      </mesh>
      <instancedMesh ref={beamRef} args={[undefined, undefined, Math.max(1, beams.length)]} material={m.beam}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={columnRef}
        args={[undefined, undefined, Math.max(1, columns.length)]}
        material={m.column}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={columnBandRef} args={[undefined, undefined, Math.max(1, columnBands.length)]} material={m.accent}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={lampRef} args={[undefined, undefined, Math.max(1, lamps.length)]} material={m.lamp}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* --- Mobilier --- */}
      <instancedMesh ref={seatRef} args={[undefined, undefined, Math.max(1, benchSeat.length)]} material={m.bench}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={backRef} args={[undefined, undefined, Math.max(1, benchBack.length)]} material={m.bench}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={legRef} args={[undefined, undefined, Math.max(1, benchLegs.length)]} material={m.metal}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={binRef} args={[undefined, undefined, Math.max(1, bins.length)]} material={m.bin}>
        <cylinderGeometry args={[0.18, 0.2, 0.9, 10]} />
      </instancedMesh>
      <instancedMesh ref={vendRef} args={[undefined, undefined, Math.max(1, vending.length)]} material={m.vending}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={vendFaceRef} args={[undefined, undefined, Math.max(1, vendingFace.length)]} material={m.vendingFace}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>

      <Amenities place={place} canopyY={canopyY} m={m} />

      <PlatformSignage
        hangX={midX + 0.7}
        canopyY={canopyY}
        halfZ={halfZ}
        totemX={midX - 0.6}
        frame={m.frame}
        metal={m.metal}
        accent={m.accent}
      />
    </group>
  );
}

/** Fond du quai : ce qu'on a derrière soi quand on regarde la voie. */
function Backdrop({
  layout,
  backX,
  wallH,
  m,
}: {
  layout: ReturnType<typeof layoutFor>;
  backX: number;
  wallH: number;
  m: Mats;
}) {
  const len = layout.length;
  if (layout.backdrop === 'parapet') {
    // Viaduc : garde-corps ajouré, la ville se voit par-dessus.
    return (
      <group>
        <mesh position={[backX, PLATFORM_TOP + 0.6, 0]} material={m.wall}>
          <boxGeometry args={[0.18, 1.2, len]} />
        </mesh>
        <mesh position={[backX, PLATFORM_TOP + 1.24, 0]} material={m.metal}>
          <boxGeometry args={[0.1, 0.08, len]} />
        </mesh>
        <mesh position={[backX, PLATFORM_TOP + 1.9, 0]} material={m.metal}>
          <boxGeometry args={[0.08, 0.06, len]} />
        </mesh>
      </group>
    );
  }
  if (layout.backdrop === 'retaining') {
    // Tranchée : la paroi monte au-delà de l'auvent.
    return (
      <group>
        <mesh position={[backX, PLATFORM_TOP + wallH / 2, 0]} material={m.wall}>
          <boxGeometry args={[0.22, wallH, len]} />
        </mesh>
        <mesh position={[backX + 0.1, PLATFORM_TOP + wallH + 1.6, 0]} material={m.wallDark}>
          <boxGeometry args={[0.4, 3.2, len]} />
        </mesh>
      </group>
    );
  }
  if (layout.backdrop === 'secondTrack') {
    // Îlot : la deuxième voie et le quai d'en face, en fond.
    return (
      <group>
        <mesh position={[backX, PLATFORM_TOP + 0.62, 0]} material={m.wall}>
          <boxGeometry args={[0.2, 1.24, len]} />
        </mesh>
        {/* Voie opposée : ballast sombre puis quai d'en face. */}
        <mesh position={[backX + 2.6, PLATFORM_TOP - 1.05, 0]} material={m.liner}>
          <boxGeometry args={[5, 0.3, len]} />
        </mesh>
        <mesh position={[backX + 6.2, PLATFORM_TOP - 0.24, 0]} material={m.slab}>
          <boxGeometry args={[4.4, 0.44, len]} />
        </mesh>
        <mesh position={[backX + 8.3, PLATFORM_TOP + 1.7, 0]} material={m.wall}>
          <boxGeometry args={[0.24, 3.5, len]} />
        </mesh>
      </group>
    );
  }
  // Mur plein, jusqu'à la sous-face de l'auvent.
  return (
    <group>
      <mesh position={[backX, PLATFORM_TOP + wallH / 2, 0]} material={m.wall}>
        <boxGeometry args={[0.18, wallH, len]} />
      </mesh>
      <mesh position={[backX - 0.02, PLATFORM_TOP + wallH - 0.6, 0]} material={m.wallDark}>
        <boxGeometry args={[0.2, 0.35, len]} />
      </mesh>
      <mesh position={[backX - 0.03, PLATFORM_TOP + wallH - 0.92, 0]} material={m.accent}>
        <boxGeometry args={[0.08, 0.1, len]} />
      </mesh>
    </group>
  );
}

/** Ce qui ne se répète pas : kiosque, escaliers, escalators, ascenseur. */
function Amenities({
  place,
  canopyY,
  m,
}: {
  place: ReturnType<typeof placementFor>;
  canopyY: number;
  m: Mats;
}) {
  return (
    <group>
      {/* Trémies d'escalier : on descend vers la salle des billets, mais on
          ne quitte pas le quai — la balade s'arrête ici. */}
      {place.stairs.map((s, i) => (
        <group key={`stair${i}`} position={[s.x, PLATFORM_TOP, s.z]}>
          {/* Le vide de la trémie, sous la dalle. */}
          <mesh position={[0, -1.4, 0]} material={m.liner}>
            <boxGeometry args={[s.halfX * 2 - 0.24, 2.6, s.halfZ * 2 - 0.24]} />
          </mesh>
          {/* Volée de marches qui s'enfonce. */}
          {Array.from({ length: 8 }, (_, k) => (
            <mesh
              key={`st${k}`}
              position={[0, -0.09 - k * 0.17, -s.halfZ + 0.35 + k * 0.3]}
              material={m.wall}
            >
              <boxGeometry args={[s.halfX * 2 - 0.4, 0.06, 0.3]} />
            </mesh>
          ))}
          {/* Balustrade : trois côtés pleins, l'entrée reste dégagée. */}
          {[-1, 1].map((d) => (
            <group key={`r${d}`}>
              <mesh position={[d * (s.halfX - 0.06), 0.5, 0]} material={m.wall}>
                <boxGeometry args={[0.12, 1, s.halfZ * 2]} />
              </mesh>
              <mesh position={[d * (s.halfX - 0.06), 1.03, 0]} material={m.metal}>
                <boxGeometry args={[0.16, 0.07, s.halfZ * 2]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.5, s.halfZ - 0.06]} material={m.wall}>
            <boxGeometry args={[s.halfX * 2, 1, 0.12]} />
          </mesh>
          {/* Fléchage de sortie au-dessus de la trémie. */}
          <mesh position={[0, 2.25, s.halfZ - 0.1]} material={m.accent}>
            <boxGeometry args={[1.5, 0.34, 0.08]} />
          </mesh>
        </group>
      ))}

      {/* Escaliers mécaniques : la rampe monte hors du quai. */}
      {place.escalators.map((e, i) => (
        <group key={`esc${i}`} position={[e.x, PLATFORM_TOP, e.z]}>
          {/* Rampe montante : elle sort du quai vers la mezzanine. */}
          <mesh position={[0, 1.05, 0.4]} rotation={[-0.52, 0, 0]} material={m.metal}>
            <boxGeometry args={[1.1, 0.14, e.halfZ * 2.6]} />
          </mesh>
          {Array.from({ length: 9 }, (_, k) => (
            <mesh
              key={`s${k}`}
              position={[0, 0.16 + k * 0.2, -e.halfZ + 0.5 + k * 0.35]}
              material={m.metal}
            >
              <boxGeometry args={[0.98, 0.05, 0.34]} />
            </mesh>
          ))}
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[d * 0.58, 1.45, 0.4]}
              rotation={[-0.52, 0, 0]}
              material={m.glass}
            >
              <boxGeometry args={[0.05, 0.95, e.halfZ * 2.6]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Ascenseur vitré. */}
      {place.elevator && (
        <group position={[place.elevator.x, PLATFORM_TOP, place.elevator.z]}>
          <mesh position={[0, 1.2, 0]} material={m.glass}>
            <boxGeometry args={[1.7, 2.4, 1.7]} />
          </mesh>
          <mesh position={[0, 2.44, 0]} material={m.metal}>
            <boxGeometry args={[1.8, 0.12, 1.8]} />
          </mesh>
        </group>
      )}

      {/* Kiosque de quai. */}
      {place.kiosk && (
        <group position={[place.kiosk.x, PLATFORM_TOP, place.kiosk.z]}>
          <mesh position={[0, 1.2, 0]} material={m.kiosk}>
            <boxGeometry args={[place.kiosk.halfX * 2, 2.4, place.kiosk.halfZ * 2]} />
          </mesh>
          <mesh position={[-place.kiosk.halfX - 0.05, 1.55, 0]} rotation={[0, -Math.PI / 2, 0]} material={m.ad}>
            <planeGeometry args={[place.kiosk.halfZ * 1.7, 1.2]} />
          </mesh>
          <mesh position={[0, 2.5, 0]} material={m.accent}>
            <boxGeometry args={[place.kiosk.halfX * 2 + 0.2, 0.22, place.kiosk.halfZ * 2 + 0.2]} />
          </mesh>
        </group>
      )}

      {/* Horloge de quai, suspendue à l'auvent. */}
      {place.layout.amenities.clock && (
        <group position={[place.backX - 1.6, canopyY - 0.62, 0]}>
          <mesh material={m.metal}>
            <boxGeometry args={[0.09, 0.55, 0.55]} />
          </mesh>
          <mesh position={[-0.06, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={m.kiosk}>
            <circleGeometry args={[0.24, 20]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
