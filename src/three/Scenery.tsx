// Décor extérieur, spécifique au quartier de chaque gare : ciel de Tokyo
// (jour / doré / nuit), trois couches d'immeubles en parallaxe par côté qui
// FONDENT d'un quartier à l'autre au fil du trajet (deux « banques » ping-pong
// par couche/côté), ballast au sol, arbres et portiques caténaires défilants.
//
// Les silhouettes défilent par texture.offset (piloté par la distance) ; le
// fondu entre le quartier quitté et celui approché est piloté par la
// progression `p` du trajet inter-gares. Voir data/districts.ts.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { useStore, type Phase } from '../store';
import { CONFIG } from '../data/config';
import { DISTRICTS } from '../data/districts';
import {
  drawCityInto,
  cityTexSize,
  makeGroundTexture,
  makeSkyTexture,
  makeSunsetSkyTexture,
  makeNightSkyTexture,
} from '../textures/procedural';

interface LayerDef {
  x: number;
  height: number;
  metersPerRepeat: number;
  repeat: number;
  layer: 0 | 1 | 2;
  opacity: number;
}

const LAYERS: LayerDef[] = [
  { x: 11, height: 8, metersPerRepeat: 60, repeat: 4, layer: 0, opacity: 1 },
  { x: 24, height: 12, metersPerRepeat: 120, repeat: 2, layer: 1, opacity: 1 },
  { x: 42, height: 18, metersPerRepeat: 240, repeat: 1, layer: 2, opacity: 0.9 },
];

const PLANE_LEN = 240;

// Durée d'un trajet inter-gares (s) : depart → cruise → brake (l'arrêt `dwell`
// prolonge p=1). `index` s'incrémente au début de `depart`, donc à tout instant
// arrivingDistrict = index et departingDistrict = index-1 : continu, sans saut.
const JOURNEY = CONFIG.departTime + CONFIG.cruiseTime + CONFIG.brakeTime;
const PHASE_BASE: Record<Phase, number> = {
  depart: 0,
  cruise: CONFIG.departTime,
  brake: CONFIG.departTime + CONFIG.cruiseTime,
  dwell: CONFIG.departTime + CONFIG.cruiseTime + CONFIG.brakeTime,
};

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Une banque = une version « quartier » d'un plan de ville (jour + éventuelle
// variante nuit), avec son canvas réutilisable pour la régénération.
interface Bank {
  slot: 0 | 1;
  layer: 0 | 1 | 2;
  metersPerRepeat: number;
  sign: number;
  baseOpacity: number;
  hasNight: boolean;
  dayCtx: CanvasRenderingContext2D;
  dayTex: THREE.CanvasTexture;
  dayMat: THREE.MeshBasicMaterial;
  nightCtx: CanvasRenderingContext2D | null;
  nightTex: THREE.CanvasTexture | null;
  nightMat: THREE.MeshBasicMaterial | null;
  district: number;
}

function makeBankCanvas(layer: 0 | 1 | 2): {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
} {
  const [w, h] = cityTexSize(layer);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return { ctx, tex };
}

export function Scenery() {
  const arrivingSlot = useRef<0 | 1>(0);
  const lastIndex = useRef<number>(CONFIG.startIndex);
  const regenQueue = useRef<(() => void)[]>([]);

  // Tout est construit une fois ici et renvoyé (jamais via des refs mutées dans
  // useMemo : en StrictMode la factory est appelée deux fois, ce qui
  // désynchroniserait les objets rendus des refs pilotées par useFrame).
  const built = useMemo(() => {
    const banks: Bank[] = [];
    const planes: {
      key: string;
      x: number;
      y: number;
      rotY: number;
      height: number;
      mat: THREE.MeshBasicMaterial;
    }[] = [];
    // slot 0 = arrivant (index de départ), slot 1 = partant (index précédent).
    const start = CONFIG.startIndex;
    const initDistrict = (slot: 0 | 1) => (slot === 0 ? start : (start + 29) % 30);

    for (const L of LAYERS) {
      for (const side of [1, -1] as const) {
        const sign = side === -1 ? 1 : -1;
        const rotY = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        const y = L.height / 2 - 1.1;
        const hasNight = L.layer < 2;
        for (const slot of [0, 1] as const) {
          const district = initDistrict(slot);
          const day = makeBankCanvas(L.layer);
          day.tex.repeat.set(L.repeat, 1);
          drawCityInto(day.ctx, L.layer, false, DISTRICTS[district]);
          day.tex.needsUpdate = true;
          const dayMat = new THREE.MeshBasicMaterial({
            map: day.tex,
            transparent: true,
            opacity: 0,
            fog: true,
            depthWrite: false,
          });
          const bank: Bank = {
            slot,
            layer: L.layer,
            metersPerRepeat: L.metersPerRepeat,
            sign,
            baseOpacity: L.opacity,
            hasNight,
            dayCtx: day.ctx,
            dayTex: day.tex,
            dayMat,
            nightCtx: null,
            nightTex: null,
            nightMat: null,
            district,
          };
          // Décalage de profondeur « vers la caméra » (x=0) pour que les plans
          // coplanaires (2 slots × jour/nuit) se trient sans z-fighting, tout
          // en restant bien avant les vitres du wagon (|x| ≈ 1,4).
          const bias = slot * 0.04;
          planes.push({
            key: `city-${L.layer}-${side}-${slot}-day`,
            x: side * L.x - side * bias,
            y,
            rotY,
            height: L.height,
            mat: dayMat,
          });
          if (hasNight) {
            const night = makeBankCanvas(L.layer);
            night.tex.repeat.set(L.repeat, 1);
            drawCityInto(night.ctx, L.layer, true, DISTRICTS[district]);
            night.tex.needsUpdate = true;
            const nightMat = new THREE.MeshBasicMaterial({
              map: night.tex,
              transparent: true,
              opacity: 0,
              fog: true,
              depthWrite: false,
            });
            bank.nightCtx = night.ctx;
            bank.nightTex = night.tex;
            bank.nightMat = nightMat;
            planes.push({
              key: `city-${L.layer}-${side}-${slot}-night`,
              x: side * L.x - side * (bias + 0.02),
              y,
              rotY,
              height: L.height,
              mat: nightMat,
            });
          }
          banks.push(bank);
        }
      }
    }

    const groundTex = makeGroundTexture();
    groundTex.repeat.set(2, 24);
    const gm = new THREE.MeshBasicMaterial({ map: groundTex, fog: true, color: '#d6d4ce' });

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
    const sky = {
      day: mkSky(makeSkyTexture(), 1),
      golden: mkSky(makeSunsetSkyTexture(), 0),
      night: mkSky(makeNightSkyTexture(), 0),
    };

    return { planes, banks, gm, sky };
  }, []);

  // Poteaux caténaires et arbres qui défilent : les vrais vendeurs de vitesse.
  const poles = useRef<(THREE.Group | null)[]>([]);
  const POLE_COUNT = 8;
  const POLE_SPACING = 30;
  const trees = useRef<(THREE.Group | null)[]>([]);
  const TREE_COUNT = 12;
  const TREE_SPACING = 21;

  useFrame(() => {
    const { index, phase } = useStore.getState();

    // --- Changement de gare : bascule des banques et régénération échelonnée ---
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      // L'ancien slot partant devient le nouvel arrivant (invisible car p≈0).
      arrivingSlot.current = arrivingSlot.current === 0 ? 1 : 0;
      const newArriving = arrivingSlot.current;
      for (const b of built.banks) {
        if (b.slot !== newArriving) continue;
        b.district = index;
        regenQueue.current.push(() => {
          drawCityInto(b.dayCtx, b.layer, false, DISTRICTS[b.district]);
          b.dayTex.needsUpdate = true;
        });
        if (b.hasNight && b.nightCtx && b.nightTex) {
          const ctx = b.nightCtx;
          const tex = b.nightTex;
          regenQueue.current.push(() => {
            drawCityInto(ctx, b.layer, true, DISTRICTS[b.district]);
            tex.needsUpdate = true;
          });
        }
      }
    }
    // Drainer la file (≤2 dessins / frame) : la banque reste invisible tant que
    // p < 0.38, on a donc des dizaines de secondes de marge, sans à-coup.
    for (let k = 0; k < 2 && regenQueue.current.length > 0; k++) {
      const task = regenQueue.current.shift();
      if (task) task();
    }

    // --- Progression du trajet et poids de fondu ---
    const p = Math.min(1, Math.max(0, (PHASE_BASE[phase] + runtime.phaseT) / JOURNEY));
    const wArr = smoothstep(0.38, 0.62, p);
    const wDep = 1 - wArr;

    // --- Cycle jour / nuit ---
    const w = dayNightWeights(runtime.clockMin / 60);
    const cityNight = Math.min(1, w.night + w.golden * 0.45);

    const arriving = arrivingSlot.current;
    for (const b of built.banks) {
      const weight = b.slot === arriving ? wArr : wDep;
      const off = (b.sign * runtime.distance) / b.metersPerRepeat;
      b.dayTex.offset.x = off;
      if (b.hasNight) {
        b.dayMat.opacity = weight * b.baseOpacity * (1 - cityNight);
        if (b.nightMat && b.nightTex) {
          b.nightMat.opacity = weight * b.baseOpacity * cityNight;
          b.nightTex.offset.x = off;
        }
      } else {
        // Couche lointaine : pas de variante nuit, on assombrit par teinte.
        b.dayMat.opacity = weight * b.baseOpacity;
        const k = 1 - 0.72 * cityNight;
        b.dayMat.color.setRGB(k, k, k * 1.08);
      }
    }

    // --- Sol défilant ---
    const g = built.gm.map;
    if (g) g.offset.y = runtime.distance / 10;

    // --- Portiques et arbres défilants ---
    const span = POLE_COUNT * POLE_SPACING;
    for (let i = 0; i < POLE_COUNT; i++) {
      const pl = poles.current[i];
      if (!pl) continue;
      pl.position.z = ((runtime.distance + i * POLE_SPACING) % span) - span / 2;
    }
    const treeSpan = TREE_COUNT * TREE_SPACING;
    for (let i = 0; i < TREE_COUNT; i++) {
      const t = trees.current[i];
      if (!t) continue;
      t.position.z = ((runtime.distance * 0.999 + i * TREE_SPACING + 9) % treeSpan) - treeSpan / 2;
    }

    // --- Fondu des ciels selon l'heure de Tokyo ---
    built.sky.day.opacity = w.day;
    built.sky.golden.opacity = w.golden;
    built.sky.night.opacity = w.night;
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

      {/* Plans de ville : deux banques ping-pong par couche/côté, fondues */}
      {built.planes.map((pl) => (
        <mesh key={pl.key} position={[pl.x, pl.y, 0]} rotation={[0, pl.rotY, 0]} material={pl.mat}>
          <planeGeometry args={[PLANE_LEN, pl.height]} />
        </mesh>
      ))}

      {/* Arbres boules défilants le long de la voie */}
      {treeSpecs.map((spec, i) => (
        <group
          key={`tree${i}`}
          ref={(gr) => {
            trees.current[i] = gr;
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
      {Array.from({ length: POLE_COUNT }, (_, i) => (
        <group
          key={`pole${i}`}
          ref={(gr) => {
            poles.current[i] = gr;
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
