// Grandes toitures des hubs (Tokyo, Ueno, Ikebukuro, Shinjuku, Shibuya,
// Shinagawa + verrière blanche de Takanawa Gateway) : la structure avale
// progressivement le ciel pendant TOUT le freinage puis se dissipe au départ.
// Piloté par la progression p de segEnv — runtime.platformFade ne monte que
// sur les ~4 dernières secondes, trop tard pour cet effet. Statique + fondu
// d'opacité, comme le quai. Écrit segEnv.roofShade, consommé par Scene pour
// l'assombrissement global.

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { useStore } from '../store';
import { segEnv } from '../systems/segmentEnv';
import { ROOF_HUBS, SEGMENTS, segmentAt } from '../data/segments';

const ROOF_LEN = 180;
const ROOF_W = 26;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface Roof {
  root: THREE.Group;
  mats: THREE.MeshBasicMaterial[]; // structure (s'assombrit la nuit)
  glows: THREE.MeshBasicMaterial[]; // éclairage sous toiture (s'allume la nuit)
}

function roofBuilder(): {
  roof: Roof;
  mat: (color: string) => THREE.MeshBasicMaterial;
  glow: (color: string) => THREE.MeshBasicMaterial;
  box: (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rotZ?: number) => void;
} {
  const roof: Roof = { root: new THREE.Group(), mats: [], glows: [] };
  const mat = (color: string) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, fog: true, depthWrite: false });
    m.userData.base = m.color.clone();
    roof.mats.push(m);
    return m;
  };
  const glow = (color: string) => {
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      fog: true,
      depthWrite: false,
      toneMapped: false,
    });
    roof.glows.push(m);
    return m;
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    if (rotZ) mesh.rotation.z = rotZ;
    roof.root.add(mesh);
  };
  return { roof, mat, glow, box };
}

// Toiture acier sombre : dalle, fermes transversales, colonnes, bandeaux
// lumineux chauds (gares classiques).
function buildSteelRoof(): Roof {
  const { roof, mat, glow, box } = roofBuilder();
  const slab = mat('#3a3f46');
  const truss = mat('#4a5058');
  const col = mat('#555b63');
  const lamp = glow('#ffd9a2');
  box(slab, ROOF_W, 0.5, ROOF_LEN, 0, 6.3, 0);
  for (let z = -81; z <= 81; z += 18) box(truss, ROOF_W, 0.6, 0.6, 0, 5.95, z);
  for (let z = -75; z <= 75; z += 30) {
    box(col, 0.55, 7.4, 0.55, -10, 2.6, z);
    box(col, 0.55, 7.4, 0.55, 10, 2.6, z);
  }
  box(lamp, 0.3, 0.08, ROOF_LEN - 4, -4.5, 6.0, 0);
  box(lamp, 0.3, 0.08, ROOF_LEN - 4, 4.5, 6.0, 0);
  roof.root.visible = false;
  return roof;
}

// Verrière blanche (Takanawa Gateway) : dalle claire, ailes latérales
// inclinées, diagonales fines, lumière blanche chaude.
function buildLatticeRoof(): Roof {
  const { roof, mat, glow, box } = roofBuilder();
  const slab = mat('#eef0f2');
  const wing = mat('#e6e9ec');
  const beam = mat('#d6dade');
  const lamp = glow('#fff4da');
  box(slab, ROOF_W, 0.5, ROOF_LEN, 0, 6.7, 0);
  box(wing, 9, 0.4, ROOF_LEN, -10.5, 5.9, 0, 0.35);
  box(wing, 9, 0.4, ROOF_LEN, 10.5, 5.9, 0, -0.35);
  let flip = 1;
  for (let z = -70; z <= 70; z += 20) {
    box(beam, 0.35, 6.8, 0.35, -8.6, 3.0, z, flip * 0.45);
    box(beam, 0.35, 6.8, 0.35, 8.6, 3.0, z, -flip * 0.45);
    flip = -flip;
  }
  box(lamp, 0.3, 0.08, ROOF_LEN - 4, -3.5, 6.35, 0);
  box(lamp, 0.3, 0.08, ROOF_LEN - 4, 3.5, 6.35, 0);
  roof.root.visible = false;
  return roof;
}

export function HubStationRoof() {
  const built = useMemo(() => ({ steel: buildSteelRoof(), lattice: buildLatticeRoof() }), []);

  useFrame(() => {
    if (segEnv.seg < 0) return;
    const { index } = useStore.getState();
    const arrHub = ROOF_HUBS[index];
    const depHub = ROOF_HUBS[segmentAt(index)];
    const p = segEnv.p;

    // Le freinage couvre p 0.878→1 : la toiture croît sur toute l'approche,
    // reste pleine pendant l'arrêt (p=1), puis se dissipe en début de départ.
    const arr = arrHub ? smoothstep(0.86, 0.97, p) : 0;
    const dep = depHub ? 1 - smoothstep(0.03, 0.14, p) : 0;
    let fade = Math.max(arr, dep);
    let variant = arr >= dep ? (arrHub ?? depHub) : (depHub ?? arrHub);
    // Tronçon couvert (Shinjuku→Yoyogi) : la structure ne disparaît jamais.
    if (SEGMENTS[segEnv.seg].covered) {
      fade = Math.max(fade, 0.3);
      variant = variant ?? 'steel';
    }
    segEnv.roofShade = fade;

    const w = dayNightWeights(runtime.clockMin / 60);
    const cityNight = Math.min(1, w.night + w.golden * 0.45);
    const structDay = 1 - 0.45 * cityNight;
    const lampLvl = 0.3 + 0.7 * cityNight;

    for (const [kind, roof] of [
      ['steel', built.steel],
      ['lattice', built.lattice],
    ] as const) {
      const active = fade > 0.02 && variant === kind;
      roof.root.visible = active;
      if (!active) continue;
      for (const m of roof.mats) {
        m.opacity = fade;
        const base = m.userData.base as THREE.Color;
        m.color.copy(base).multiplyScalar(structDay);
      }
      for (const m of roof.glows) m.opacity = fade * lampLvl;
    }
  });

  return (
    <>
      <primitive object={built.steel.root} />
      <primitive object={built.lattice.root} />
    </>
  );
}
