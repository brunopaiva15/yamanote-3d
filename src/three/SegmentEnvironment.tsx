// Environnement du tronçon courant (voir data/segments.ts) : murs de
// soutènement et ponts routiers en tranchée, faisceau de voies + trains dans
// les corridors ferroviaires, clôtures/haies au niveau du sol. Le type
// `viaduct` est l'identité : aucun ajout, le look historique est préservé.
//
// Tout est construit une fois (useMemo) et piloté par les poids fondus de
// segEnv dans un seul useFrame — la bascule d'un type à l'autre a lieu à
// l'arrêt, masquée par le quai. Les murs sont OPAQUES et glissent
// verticalement (jamais de fondu d'opacité) : ils occultent ainsi proprement
// les plans ville et le ciel (transparents, depthWrite:false) sous la ligne
// de crête, sans travail de tri.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { segEnv, bridgeZ, BRIDGE_COUNT, WALL_MAX } from '../systems/segmentEnv';
import { SEGMENTS } from '../data/segments';
import {
  rng,
  makeRetainingWallTexture,
  makeTrackFieldTexture,
  makeTrackFenceTexture,
} from '../textures/procedural';
import { vehicle, type Ctx } from './landmarkKit';

const PLANE_LEN = 240;
const WALL_X = 6.6; // murs juste derrière les poteaux caténaires (±5.2)
const FENCE_X = 6.2;
const FIELD_X = 9; // centre du plan de faisceau (s'étend de 4 à 14 m)

// Idiome des banques Scenery : le décor du côté gauche défile en +offset,
// celui du côté droit en -offset.
const SIDES = [
  { side: -1 as const, sign: 1, rotY: Math.PI / 2 },
  { side: 1 as const, sign: -1, rotY: -Math.PI / 2 },
];

function makeTrainGroup(
  kind: 'shinkansen' | 'commuter',
  sil: THREE.MeshBasicMaterial[],
  glow: THREE.MeshBasicMaterial[],
  geos: THREE.BufferGeometry[],
  seed: number,
): THREE.Group {
  const group = new THREE.Group();
  const ctx: Ctx = { group, sil, glow, geos, r: rng(seed) };
  vehicle(ctx, kind);
  return group;
}

export function SegmentEnvironment() {
  const lastSeg = useRef(-1);

  const built = useMemo(() => {
    // --- Murs de soutènement : un plan opaque + parapet par côté ---
    const walls = SIDES.map(({ side, sign, rotY }) => {
      const tex = makeRetainingWallTexture();
      tex.repeat.set(PLANE_LEN / 30, 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
      return { key: `wall${side}`, x: side * WALL_X, sign, rotY, tex, mat };
    });
    const capMat = new THREE.MeshBasicMaterial({ color: '#9a978f', fog: true });
    capMat.userData.base = capMat.color.clone();

    // --- Ponts routiers : tabliers recyclés (idiome des poteaux), matériaux
    // éclairés pour projeter une vraie ombre dans le wagon ---
    const deckMat = new THREE.MeshStandardMaterial({ color: '#565a60', roughness: 0.85 });
    const parapetMat = new THREE.MeshStandardMaterial({ color: '#6a6e74', roughness: 0.8 });
    const pierGeo = new THREE.CylinderGeometry(0.55, 0.62, 1, 10);
    const bridges = Array.from({ length: BRIDGE_COUNT }, () => {
      const root = new THREE.Group();
      const deckG = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 0.7, 8), deckMat);
      deck.position.y = 0.35;
      deck.castShadow = true;
      deckG.add(deck);
      for (const zp of [-3.8, 3.8]) {
        const par = new THREE.Mesh(new THREE.BoxGeometry(30, 0.9, 0.4), parapetMat);
        par.position.set(0, 1.15, zp);
        par.castShadow = true;
        deckG.add(par);
      }
      root.add(deckG);
      const piers = [-13, 13].map((px) => {
        const pier = new THREE.Mesh(pierGeo, deckMat);
        pier.position.x = px;
        root.add(pier);
        return pier;
      });
      root.visible = false;
      return { root, deckG, piers };
    });

    // --- Faisceau de voies (corridors) : un plan au sol par côté, rails
    // dans la texture, même vitesse de défilement que le ballast ---
    const fieldTex = makeTrackFieldTexture();
    fieldTex.repeat.set(2, 24);
    const fieldMat = new THREE.MeshBasicMaterial({
      map: fieldTex,
      transparent: true,
      opacity: 0,
      fog: true,
      depthWrite: false,
    });
    fieldMat.userData.base = fieldMat.color.clone();

    // --- Clôtures / haies (niveau du sol) ---
    const fences = SIDES.flatMap(({ side, sign, rotY }) =>
      ([false, true] as const).map((hedge) => {
        const tex = makeTrackFenceTexture(hedge);
        tex.repeat.set(PLANE_LEN / 6, 1);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0,
          fog: true,
          depthWrite: false,
        });
        mat.userData.base = mat.color.clone();
        return { key: `fence${side}${hedge ? 'h' : 'f'}`, x: side * FENCE_X, sign, rotY, hedge, tex, mat };
      }),
    );

    // --- Trains des corridors : croisement (gauche) et dépôt (droite) ---
    const geos: THREE.BufferGeometry[] = [];
    const passSil: THREE.MeshBasicMaterial[] = [];
    const passGlow: THREE.MeshBasicMaterial[] = [];
    const depotSil: THREE.MeshBasicMaterial[] = [];
    const depotGlow: THREE.MeshBasicMaterial[] = [];
    const passShinkansen = makeTrainGroup('shinkansen', passSil, passGlow, geos, 101);
    passShinkansen.position.set(-8.5, -1.1, 0);
    const passCommuter = makeTrainGroup('commuter', passSil, passGlow, geos, 102);
    passCommuter.position.set(-6.0, -1.1, 0);
    const depotTrains = [
      { group: makeTrainGroup('commuter', depotSil, depotGlow, geos, 103), x: 8.6, off: 40 },
      { group: makeTrainGroup('commuter', depotSil, depotGlow, geos, 104), x: 10.4, off: 170 },
    ];
    for (const d of depotTrains) {
      d.group.position.set(d.x, -1.1, 0);
      d.group.visible = false;
    }
    passShinkansen.visible = false;
    passCommuter.visible = false;

    return {
      walls,
      capMat,
      bridges,
      fieldTex,
      fieldMat,
      fences,
      passShinkansen,
      passCommuter,
      depotTrains,
      passSil,
      passGlow,
      depotSil,
      depotGlow,
    };
  }, []);

  const wallRefs = useRef<(THREE.Mesh | null)[]>([]);
  const capRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const seg = segEnv.seg;
    if (seg < 0) return;
    const spec = SEGMENTS[seg];

    // Nombre de paires de voies du faisceau : ajusté à la bascule de tronçon
    // (le plan est alors quasi invisible, aucun saut perceptible).
    if (seg !== lastSeg.current) {
      lastSeg.current = seg;
      built.fieldTex.repeat.x = spec.tracks ?? 2;
    }

    const w = dayNightWeights(runtime.clockMin / 60);
    const cityNight = Math.min(1, w.night + w.golden * 0.45);
    const silDay = 1 - 0.5 * cityNight;
    const glowLvl = 0.28 + 0.72 * cityNight;
    const nightK = 1 - 0.55 * cityNight;

    const trench01 = segEnv.w.trench;
    const corridor01 = segEnv.w.corridor;
    const ground01 = segEnv.w.ground;

    // --- Murs : glissement vertical opaque, défilement de la texture ---
    const wallsVisible = trench01 > 0.02;
    const wallTop = -1.1 + segEnv.wallH;
    const sink = (1 - trench01) * (WALL_MAX + 0.6);
    for (let i = 0; i < built.walls.length; i++) {
      const wall = built.walls[i];
      const mesh = wallRefs.current[i];
      const cap = capRefs.current[i];
      wall.tex.offset.x = (wall.sign * runtime.distance) / 30;
      wall.mat.color.setRGB(nightK, nightK, nightK * 1.03);
      if (mesh) {
        mesh.visible = wallsVisible;
        mesh.scale.y = segEnv.wallH;
        mesh.position.y = wallTop - segEnv.wallH / 2 - sink;
      }
      if (cap) {
        cap.visible = wallsVisible;
        cap.position.y = wallTop + 0.17 - sink;
      }
    }
    const capBase = built.capMat.userData.base as THREE.Color;
    built.capMat.color.copy(capBase).multiplyScalar(nightK);

    // --- Ponts : position depuis bridgeZ (source unique, partagée avec
    // l'ombrage), tablier posé sur les murs en tranchée, plus haut (piles
    // apparentes) sur les tronçons en viaduc ---
    const bridgesVisible = segEnv.bridgeW > 0.02;
    const deckY = trench01 * (wallTop + 0.1) + (1 - trench01) * 6.4;
    for (let k = 0; k < built.bridges.length; k++) {
      const b = built.bridges[k];
      b.root.visible = bridgesVisible;
      if (!bridgesVisible) continue;
      b.root.position.z = bridgeZ(k);
      b.deckG.position.y = deckY;
      for (const pier of b.piers) {
        pier.scale.y = deckY + 1.1;
        pier.position.y = (deckY - 1.1) / 2;
      }
    }

    // --- Faisceau de voies ---
    built.fieldTex.offset.y = runtime.distance / 10;
    built.fieldMat.opacity = corridor01 * 0.95;
    const fieldBase = built.fieldMat.userData.base as THREE.Color;
    built.fieldMat.color.copy(fieldBase).multiplyScalar(nightK);

    // --- Clôtures / haies : fondu croisé selon la végétation du tronçon ---
    for (const f of built.fences) {
      f.tex.offset.x = (f.sign * runtime.distance) / 6;
      f.mat.opacity = f.hedge ? ground01 * segEnv.green : ground01 * (1 - segEnv.green) * 0.9;
      const base = f.mat.userData.base as THREE.Color;
      f.mat.color.copy(base).multiplyScalar(silDay);
    }

    // --- Trains : croisement à gauche (défilement accéléré), dépôt à droite ---
    const passKind = spec.passing;
    const passActive = corridor01 > 0.02 && !!passKind;
    built.passShinkansen.visible = passActive && passKind === 'shinkansen';
    built.passCommuter.visible = passActive && passKind === 'commuter';
    if (passActive) {
      const z = ((runtime.distance * 1.7 + 150) % 600) - 300;
      built.passShinkansen.position.z = z;
      built.passCommuter.position.z = z;
    }
    const depotActive = corridor01 > 0.02 && !!spec.depot;
    for (const d of built.depotTrains) {
      d.group.visible = depotActive;
      if (depotActive) d.group.position.z = ((runtime.distance + d.off) % 260) - 130;
    }
    for (const m of built.passSil) {
      m.opacity = corridor01;
      const base = m.userData.base as THREE.Color | undefined;
      if (base) m.color.copy(base).multiplyScalar(silDay);
    }
    for (const m of built.passGlow) m.opacity = corridor01 * glowLvl;
    for (const m of built.depotSil) {
      m.opacity = corridor01;
      const base = m.userData.base as THREE.Color | undefined;
      if (base) m.color.copy(base).multiplyScalar(silDay);
    }
    for (const m of built.depotGlow) m.opacity = corridor01 * glowLvl;
  });

  return (
    <group>
      {/* Murs de soutènement + parapets (tranchées) */}
      {built.walls.map((wall, i) => (
        <mesh
          key={wall.key}
          ref={(m) => {
            wallRefs.current[i] = m;
          }}
          position={[wall.x, -20, 0]}
          rotation={[0, wall.rotY, 0]}
          material={wall.mat}
          visible={false}
        >
          <planeGeometry args={[PLANE_LEN, 1]} />
        </mesh>
      ))}
      {built.walls.map((wall, i) => (
        <mesh
          key={`cap${wall.key}`}
          ref={(m) => {
            capRefs.current[i] = m;
          }}
          position={[wall.x * 1.02, -20, 0]}
          material={built.capMat}
          visible={false}
        >
          <boxGeometry args={[0.5, 0.35, PLANE_LEN]} />
        </mesh>
      ))}

      {/* Ponts routiers recyclés */}
      {built.bridges.map((b, k) => (
        <primitive key={`bridge${k}`} object={b.root} />
      ))}

      {/* Faisceau de voies des corridors */}
      {SIDES.map(({ side }) => (
        <mesh
          key={`field${side}`}
          position={[side * FIELD_X, -1.16, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={built.fieldMat}
        >
          <planeGeometry args={[10, PLANE_LEN]} />
        </mesh>
      ))}

      {/* Clôtures / haies du niveau du sol */}
      {built.fences.map((f) => (
        <mesh
          key={f.key}
          position={[f.x, -0.5, 0]}
          rotation={[0, f.rotY, 0]}
          material={f.mat}
        >
          <planeGeometry args={[PLANE_LEN, 1.2]} />
        </mesh>
      ))}

      {/* Trains des corridors */}
      <primitive object={built.passShinkansen} />
      <primitive object={built.passCommuter} />
      {built.depotTrains.map((d, i) => (
        <primitive key={`depot${i}`} object={d.group} />
      ))}
    </group>
  );
}
