// Repères 3D emblématiques par gare : silhouettes procédurales (tours, Tokyo
// Tower, viaducs de brique, torii, écrans géants, tram, monorail…) qui
// APPARAISSENT en fondu à l'approche de leur station et disparaissent après.
//
// Deux « slots » ping-pong (arrivant / partant) comme les banques de ville :
// au changement de gare, le slot devenu arrivant est reconstruit depuis
// DISTRICTS[index].landmarks (invisible à cet instant, donc sans à-coup).
//
// Convention de repère LOCAL :
//   · lointain (far) : le groupe est tourné pour que +z pointe vers la voie ;
//     l'axe X local court le long des rails, Y vers le haut, +Z vers le train.
//   · proche (near) : pas de rotation ; l'axe Z local court le long des rails
//     et le repère défile en z (idiome des poteaux/arbres).

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { useStore } from '../store';
import { CONFIG } from '../data/config';
import { DISTRICTS, type Land, type LandmarkSpec } from '../data/districts';
import { rng } from '../textures/procedural';
import { box, glow, plane, sil, vehicle, type Ctx } from './landmarkKit';

const BASE_Y = -1.1; // niveau du sol extérieur.
const FAR_X = 34; // distance latérale des silhouettes (devant la couche lointaine).
const FAR_Z = -5;
const NEAR_X = 8; // repères au niveau de la voie.
const NEAR_SPAN = 100; // période de défilement des repères proches (m).

const PHASE_BASE: Record<string, number> = {
  depart: 0,
  cruise: CONFIG.departTime,
  brake: CONFIG.departTime + CONFIG.cruiseTime,
  dwell: CONFIG.departTime + CONFIG.cruiseTime + CONFIG.brakeTime,
};
const JOURNEY = CONFIG.departTime + CONFIG.cruiseTime + CONFIG.brakeTime;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// (Ctx et les primitives sil/glow/box/plane/vehicle vivent dans landmarkKit,
// partagées avec SegmentEnvironment.)
function sphere(ctx: Ctx, mat: THREE.Material, rad: number, x: number, y: number, z: number): void {
  const g = new THREE.SphereGeometry(rad, 12, 10);
  ctx.geos.push(g);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.scale.y = 0.9;
  ctx.group.add(m);
}

// --- Briques de construction paramétriques ---

// Grappe de tours : boîtes + bandeau de fenêtres émissif face à la voie.
function towers(ctx: Ctx, n: number, body: string, win: string, wBase: number, hBase: number): void {
  const mat = sil(ctx, body);
  const winMat = glow(ctx, win);
  for (let i = 0; i < n; i++) {
    const w = wBase * (0.7 + ctx.r() * 0.6);
    const h = hBase * (0.6 + ctx.r() * 0.75);
    const px = (i - (n - 1) / 2) * wBase * 1.15 + (ctx.r() - 0.5) * 3;
    const pz = (ctx.r() - 0.5) * 5;
    box(ctx, mat, w, h, w * 0.85, px, h / 2, pz);
    plane(ctx, winMat, w * 0.72, h * 0.9, px, h * 0.52, pz + w * 0.44);
  }
}

// Tour treillis effilée à 4 pieds (Tokyo Tower, flèches). +z = vers la voie.
// Pieds épais + entretoises horizontales pour une silhouette lisible de loin.
function lattice(ctx: Ctx, h: number, spread: number, body: string, plat: string): void {
  const mat = sil(ctx, body);
  const platMat = sil(ctx, plat);
  const legW = 1.1;
  const steps = 5;
  const taper = (t: number) => spread * (1 - t * 0.82);
  const legs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  for (const [sx, sz] of legs) {
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const y = (h * (t0 + t1)) / 2;
      const r0 = taper(t0);
      const seg = (h / steps) * 1.04;
      box(ctx, mat, legW, seg, legW, sx * r0, y, sz * r0);
    }
  }
  // Entretoises horizontales (anneaux) à chaque étage.
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const r = taper(t);
    const y = h * t;
    box(ctx, mat, r * 2 + legW, 0.6, legW, 0, y, r);
    box(ctx, mat, r * 2 + legW, 0.6, legW, 0, y, -r);
    box(ctx, mat, legW, 0.6, r * 2 + legW, r, y, 0);
    box(ctx, mat, legW, 0.6, r * 2 + legW, -r, y, 0);
  }
  // Plateformes.
  box(ctx, platMat, spread * 1.7, 1.6, spread * 1.7, 0, h * 0.42, 0);
  box(ctx, platMat, spread * 1.0, 1.3, spread * 1.0, 0, h * 0.66, 0);
  // Antenne.
  box(ctx, mat, 0.5, h * 0.3, 0.5, 0, h * 1.14, 0);
}

// Colonnade d'arches (viaduc de brique, arcade de marché). Le long de +z (near).
function arches(ctx: Ctx, color: string, glowColor: string | null, len: number): void {
  const mat = sil(ctx, color);
  const openMat = glowColor ? glow(ctx, glowColor) : sil(ctx, '#241a16');
  const n = Math.round(len / 6);
  // Bandeau supérieur continu.
  box(ctx, mat, 3.4, 1.0, len, 0, 3.4, 0);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + 3 + i * 6;
    box(ctx, mat, 3.0, 3.0, 1.2, 0, 1.5, z); // pilier
    plane(ctx, openMat, 2.0, 2.2, 1.55, 1.4, z + 3); // ouverture (côté voie)
  }
}

// Masse d'arbres (parc, forêt de sanctuaire), + torii optionnel.
function forest(ctx: Ctx, spread: number, torii: boolean): void {
  const trunk = sil(ctx, '#5a4632');
  const leafA = sil(ctx, '#4f9a3a');
  const leafB = sil(ctx, '#3f8230');
  const n = 6 + Math.floor(ctx.r() * 5);
  for (let i = 0; i < n; i++) {
    const px = (ctx.r() - 0.5) * spread * 2;
    const pz = (ctx.r() - 0.5) * spread;
    const th = 4 + ctx.r() * 5;
    box(ctx, trunk, 0.5, th * 0.5, 0.5, px, th * 0.25, pz);
    sphere(ctx, i % 2 ? leafA : leafB, th * (0.42 + ctx.r() * 0.2), px, th * 0.62, pz);
  }
  if (torii) {
    const t = sil(ctx, '#c0392b');
    const w = 5;
    const hh = 6;
    box(ctx, t, 0.6, hh, 0.6, -w / 2, hh / 2, spread * 0.6);
    box(ctx, t, 0.6, hh, 0.6, w / 2, hh / 2, spread * 0.6);
    box(ctx, t, w + 1.6, 0.7, 0.7, 0, hh, spread * 0.6);
    box(ctx, t, w + 0.6, 0.5, 0.6, 0, hh - 1.1, spread * 0.6);
  }
}

// Immeuble à écrans géants émissifs (Shibuya, Shinjuku, Akihabara).
function screenWall(ctx: Ctx, w: number, h: number): void {
  const mat = sil(ctx, '#2a2e36');
  box(ctx, mat, w, h, w * 0.5, 0, h / 2, 0);
  const cols = ['#8fd0ff', '#ff6a8a', '#ffd24a'];
  for (let i = 0; i < 3; i++) {
    const sw = w * (0.5 + ctx.r() * 0.35);
    const sh = h * (0.18 + ctx.r() * 0.12);
    const sy = h * (0.3 + i * 0.22);
    const g = glow(ctx, cols[i % cols.length]);
    plane(ctx, g, sw, sh, (ctx.r() - 0.5) * w * 0.3, sy, w * 0.26);
  }
}

// Façade basse à arches / colonnes (gare de brique, musée, brasserie).
function lowFacade(ctx: Ctx, w: number, h: number, color: string, columns: boolean): void {
  const mat = sil(ctx, color);
  box(ctx, mat, w, h, 6, 0, h / 2, 0);
  // Toit / corniche.
  box(ctx, sil(ctx, '#3a4048'), w * 1.02, h * 0.14, 6.4, 0, h * 1.02, 0);
  if (columns) {
    const cm = sil(ctx, '#e8e2d4');
    const n = Math.round(w / 4);
    for (let i = 0; i < n; i++) {
      const px = -w / 2 + 2 + i * 4;
      box(ctx, cm, 0.8, h * 0.8, 0.8, px, h * 0.4, 3.1);
    }
  } else {
    // Dômes / pignons de brique.
    const dm = sil(ctx, color);
    box(ctx, dm, w * 0.16, h * 0.3, 3, -w * 0.32, h * 1.12, 0);
    box(ctx, dm, w * 0.16, h * 0.3, 3, w * 0.32, h * 1.12, 0);
  }
}

// Toit de temple à croupe (tuiles sombres), sur un corps clair.
function templeRoof(ctx: Ctx, w: number, h: number): void {
  box(ctx, sil(ctx, '#d8cdb8'), w, h, 5, 0, h / 2, 0);
  const roof = sil(ctx, '#39414a');
  box(ctx, roof, w * 1.25, h * 0.16, 6.5, 0, h + h * 0.1, 0);
  box(ctx, roof, w * 0.9, h * 0.16, 5.4, 0, h + h * 0.34, 0);
  box(ctx, sil(ctx, '#2a3038'), w * 1.28, 0.4, 0.6, 0, h + h * 0.02, 3.3);
}

// Tour cylindrique mode (façon 109) avec bandeaux lumineux.
function cylinder(ctx: Ctx, h: number): void {
  const bodyMat = sil(ctx, '#d8d2cc');
  const g = new THREE.CylinderGeometry(4, 5, h, 18, 1, false);
  ctx.geos.push(g);
  const m = new THREE.Mesh(g, bodyMat);
  m.position.set(0, h / 2, 0);
  ctx.group.add(m);
  for (let i = 0; i < 4; i++) {
    const bg = glow(ctx, i % 2 ? '#ff5a8a' : '#8fd0ff');
    plane(ctx, bg, 7, h * 0.1, 0, h * (0.25 + i * 0.18), 4.6);
  }
}

// Façade d'enseignes empilées lumineuses (Koreatown, arcades).
function stackedSign(ctx: Ctx, w: number, h: number): void {
  box(ctx, sil(ctx, '#332e30'), w, h, 4, 0, h / 2, 0);
  const cols = ['#ff6fae', '#ffd24a', '#8fd0ff', '#ff8f5a'];
  const n = Math.floor(h / 2.4);
  for (let i = 0; i < n; i++) {
    const g = glow(ctx, cols[i % cols.length]);
    plane(ctx, g, w * 0.86, 1.6, 0, 1.6 + i * 2.4, 2.1);
  }
}

// Poutre de monorail surélevée (near) le long de +z.
function monorailBeam(ctx: Ctx, len: number): void {
  const mat = sil(ctx, '#c8c8cc');
  box(ctx, mat, 1.4, 1.2, len, 0, 6.5, 0); // poutre
  const n = Math.round(len / 12);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + 6 + i * 12;
    box(ctx, mat, 1.0, 6.5, 1.0, 0, 3.25, z); // pile
  }
}

// Porte / portique lumineux d'entrée de quartier de divertissement.
function gate(ctx: Ctx): void {
  const mat = sil(ctx, '#8a2f2a');
  box(ctx, mat, 10, 1.6, 1.2, 0, 6.5, 0);
  box(ctx, mat, 1.2, 7, 1.2, -4.4, 3.5, 0);
  box(ctx, mat, 1.2, 7, 1.2, 4.4, 3.5, 0);
  plane(ctx, glow(ctx, '#ffd24a'), 8, 1.2, 0, 6.5, 0.7);
}

// Verrière blanche moderne (Takanawa Gateway).
function whiteRoof(ctx: Ctx, w: number): void {
  const mat = sil(ctx, '#eef0f2');
  box(ctx, mat, w, 0.6, 12, 0, 9, 0);
  const beams = sil(ctx, '#d6dade');
  for (let i = 0; i < 6; i++) {
    const px = -w / 2 + 2 + i * (w / 6);
    box(ctx, beams, 0.5, 9, 0.5, px, 4.5, -5);
    box(ctx, beams, 0.5, 11, 0.5, px, 5.5, 5);
  }
}

// Arche vitrée (Yebisu Garden Place).
function gardenArch(ctx: Ctx, h: number): void {
  const mat = sil(ctx, '#a6bcd0');
  box(ctx, mat, 12, h, 6, 0, h / 2, 0);
  const g = new THREE.CylinderGeometry(6, 6, 6, 16, 1, false, 0, Math.PI);
  ctx.geos.push(g);
  const arch = sil(ctx, '#b8ccdc');
  const m = new THREE.Mesh(g, arch);
  m.rotation.z = Math.PI / 2;
  m.rotation.y = Math.PI / 2;
  m.position.set(0, h, 0);
  ctx.group.add(m);
  plane(ctx, glow(ctx, '#cfe4f4'), 9, h * 0.8, 0, h * 0.5, 3.05);
}

// --- Registre : quels builders + proche/lointain par type ---
interface Builder {
  near: boolean;
  build: (ctx: Ctx) => void;
}

const BUILDERS: Record<Land, Builder> = {
  tokyoTower: { near: false, build: (c) => lattice(c, 34, 3.2, '#e2603a', '#f0ece4') },
  latticeTower: { near: false, build: (c) => lattice(c, 26, 1.8, '#9aa0a6', '#c8ccd0') },
  glassTowerCluster: { near: false, build: (c) => towers(c, 4, '#8ea6c4', '#bcd8ff', 9, 26) },
  boxyTower: { near: false, build: (c) => towers(c, 3, '#9a8f7a', '#ffe6b0', 11, 30) },
  twinTowers: { near: false, build: (c) => towers(c, 2, '#8a94a4', '#cfe0f2', 10, 32) },
  officeBlock: { near: false, build: (c) => towers(c, 2, '#9aa2ac', '#d6e2ee', 9, 20) },
  giantScreenWall: { near: false, build: (c) => screenWall(c, 16, 20) },
  cylinderFashion: { near: false, build: (c) => cylinder(c, 22) },
  redBrickStation: { near: false, build: (c) => lowFacade(c, 26, 9, '#a8543a', false) },
  brickViaduct: { near: true, build: (c) => arches(c, '#9a5238', '#ffce96', NEAR_SPAN) },
  marketArcade: { near: true, build: (c) => arches(c, '#c8503a', '#ffe0b0', NEAR_SPAN) },
  toriiForest: { near: false, build: (c) => forest(c, 12, true) },
  forestMass: { near: false, build: (c) => forest(c, 13, false) },
  museumFacade: { near: false, build: (c) => lowFacade(c, 24, 11, '#d8cfc0', true) },
  templeRoof: { near: false, build: (c) => templeRoof(c, 12, 6) },
  tramCar: { near: true, build: (c) => vehicle(c, 'tram') },
  monorailBeam: { near: true, build: (c) => monorailBeam(c, NEAR_SPAN) },
  shinkansenSet: { near: true, build: (c) => vehicle(c, 'shinkansen') },
  steamLoco: { near: true, build: (c) => vehicle(c, 'loco') },
  gardenPlaceArch: { near: false, build: (c) => gardenArch(c, 18) },
  kabukichoGate: { near: true, build: (c) => gate(c) },
  whiteLatticeRoof: { near: false, build: (c) => whiteRoof(c, 22) },
  stackedSignFacade: { near: false, build: (c) => stackedSign(c, 12, 18) },
};

// --- État d'un slot (arrivant / partant) ---
interface SlotItem {
  group: THREE.Group;
  near: boolean;
  phase: number; // décalage z du défilement (near).
}
interface Slot {
  root: THREE.Group;
  district: number;
  items: SlotItem[];
  sil: THREE.MeshBasicMaterial[];
  glow: THREE.MeshBasicMaterial[];
  geos: THREE.BufferGeometry[];
}

function disposeSlot(slot: Slot): void {
  for (const m of slot.sil) m.dispose();
  for (const m of slot.glow) m.dispose();
  for (const g of slot.geos) g.dispose();
  slot.root.clear();
  slot.items = [];
  slot.sil = [];
  slot.glow = [];
  slot.geos = [];
}

function populate(slot: Slot, districtIndex: number): void {
  disposeSlot(slot);
  slot.district = districtIndex;
  const specs = DISTRICTS[districtIndex]?.landmarks ?? [];
  specs.forEach((spec: LandmarkSpec, i: number) => {
    const builder = BUILDERS[spec.kind];
    if (!builder) return;
    const itemGroup = new THREE.Group();
    const ctx: Ctx = {
      group: itemGroup,
      sil: slot.sil,
      glow: slot.glow,
      geos: slot.geos,
      r: rng(700 + districtIndex * 53 + i * 131 + spec.kind.length * 7),
    };
    builder.build(ctx);
    const side = spec.side ?? 1;
    const scale = spec.scale ?? 1;
    itemGroup.scale.setScalar(scale);
    if (builder.near) {
      itemGroup.position.set(side * NEAR_X, BASE_Y, 0);
    } else {
      itemGroup.position.set(side * FAR_X, BASE_Y, FAR_Z);
      // Oriente +z local vers la voie (x=0).
      itemGroup.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
    }
    slot.root.add(itemGroup);
    slot.items.push({ group: itemGroup, near: builder.near, phase: i * 23 });
  });
}

export function Landmarks() {
  const rootA = useRef<THREE.Group>(null);
  const rootB = useRef<THREE.Group>(null);
  const slots = useRef<[Slot, Slot] | null>(null);
  const arrivingSlot = useRef<0 | 1>(0);
  const lastIndex = useRef<number>(CONFIG.startIndex);

  useEffect(() => {
    if (!rootA.current || !rootB.current) return;
    const mk = (root: THREE.Group): Slot => ({ root, district: -1, items: [], sil: [], glow: [], geos: [] });
    const pair: [Slot, Slot] = [mk(rootA.current), mk(rootB.current)];
    slots.current = pair;
    populate(pair[0], CONFIG.startIndex);
    populate(pair[1], (CONFIG.startIndex + 29) % 30);
    return () => {
      disposeSlot(pair[0]);
      disposeSlot(pair[1]);
    };
  }, []);

  useFrame(() => {
    const pair = slots.current;
    if (!pair) return;
    const { index, phase } = useStore.getState();

    // Changement de gare : bascule et reconstruction du nouveau slot arrivant.
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      arrivingSlot.current = arrivingSlot.current === 0 ? 1 : 0;
      populate(pair[arrivingSlot.current], index);
    }

    const p = Math.min(1, Math.max(0, (PHASE_BASE[phase] + runtime.phaseT) / JOURNEY));
    const closeArr = smoothstep(0.55, 1.0, p);
    const closeDep = smoothstep(0.55, 1.0, 1 - p);

    const w = dayNightWeights(runtime.clockMin / 60);
    const cityNight = Math.min(1, w.night + w.golden * 0.45);
    const silDay = 1 - 0.5 * cityNight; // silhouettes : plus sombres la nuit.
    const glowLvl = 0.28 + 0.72 * cityNight; // écrans/néons : éclatants la nuit.

    const arriving = arrivingSlot.current;
    for (let s = 0; s < 2; s++) {
      const slot = pair[s];
      const closeness = s === arriving ? closeArr : closeDep;
      const visible = closeness > 0.02;
      slot.root.visible = visible;
      if (!visible) continue;
      for (const m of slot.sil) {
        m.opacity = closeness;
        const base = m.userData.base as THREE.Color | undefined;
        if (base) m.color.copy(base).multiplyScalar(silDay);
      }
      for (const m of slot.glow) m.opacity = closeness * glowLvl;
      // Défilement des repères proches (tram, viaduc, monorail…).
      for (const item of slot.items) {
        if (!item.near) continue;
        item.group.position.z = ((runtime.distance + item.phase) % NEAR_SPAN) - NEAR_SPAN / 2;
      }
    }
  });

  return (
    <>
      <group ref={rootA} />
      <group ref={rootB} />
    </>
  );
}
