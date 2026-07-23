// Ambiance : fin d'après-midi dorée. Soleil bas et chaud à travers les vitres,
// intérieur fluorescent doux, brume chaude au loin, réflexions d'environnement
// pour les laqués et le chrome, post-process filmique discret
// (bloom seuil haut, grain, vignette).

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer, Bloom, Vignette, ToneMapping, Noise } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { CONFIG } from '../data/config';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { segEnv } from '../systems/segmentEnv';

const LAMP_POSITIONS: [number, number, number][] = [
  [0, 2.16, -7.5],
  [0, 2.16, -3.75],
  [0, 2.16, 0],
  [0, 2.16, 3.75],
  [0, 2.16, 7.5],
];

// Réflexions douces sur le chrome et les panneaux laqués, sans requête réseau.
function EnvironmentMap(): null {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    // Discret : juste de quoi faire vivre l'inox et le verre, sans vernis.
    scene.environmentIntensity = 0.22;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

// Ombres portées du soleil : activation en une passe sur toute la scène.
// Les matériaux transparents (vitres, fondu du quai) ne projettent pas ;
// les matériaux non éclairés (ville, ciel, écrans) sont ignorés.
function ShadowFlags(): null {
  const { scene } = useThree();
  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material;
      if (mat instanceof THREE.MeshStandardMaterial) {
        mesh.receiveShadow = true;
        if (!mat.transparent) mesh.castShadow = true;
      }
    });
  }, [scene]);
  return null;
}

// Trois ambiances lumineuses fondues selon l'heure réelle de Tokyo.
const SUN = {
  day: { color: new THREE.Color('#fff6e4'), intensity: 1.7, pos: new THREE.Vector3(26, 30, -16) },
  golden: { color: new THREE.Color('#ffb37a'), intensity: 1.6, pos: new THREE.Vector3(34, 7, -14) },
  night: { color: new THREE.Color('#8fa4cc'), intensity: 0.16, pos: new THREE.Vector3(20, 26, 12) },
};
const FOG_COLORS = { day: new THREE.Color('#d6e8f2'), golden: new THREE.Color('#dcae8f'), night: new THREE.Color('#161d2c') };
const BG_COLORS = { day: new THREE.Color('#bcdaee'), golden: new THREE.Color('#e0b494'), night: new THREE.Color('#10141f') };
const HEMI_SKY = { day: new THREE.Color('#cfe6f6'), golden: new THREE.Color('#eec5ae'), night: new THREE.Color('#2c3854') };
const AMBIENT = { day: new THREE.Color('#e9f1f5'), golden: new THREE.Color('#e3cabb'), night: new THREE.Color('#38405a') };

function mixColor(out: THREE.Color, w: { day: number; golden: number; night: number }, set: { day: THREE.Color; golden: THREE.Color; night: THREE.Color }): THREE.Color {
  out.setRGB(
    set.day.r * w.day + set.golden.r * w.golden + set.night.r * w.night,
    set.day.g * w.day + set.golden.g * w.golden + set.night.g * w.night,
    set.day.b * w.day + set.golden.b * w.golden + set.night.b * w.night,
  );
  return out;
}

// Pilote lumières, brume et fond selon l'heure (jamais par re-render React).
//
// Les mélanges coûteux (couleurs, positions, brume, fond) restent throttlés à
// 0,5 s ; le bloc throttlé ne stocke que les intensités DE BASE. Après le
// throttle, chaque frame applique un multiplicateur d'assombrissement issu de
// segEnv (passage sous un pont ~0,3-0,5 s, toiture de gare) : à ombre nulle
// le résultat est identique au comportement historique, le fondu jour/nuit
// n'est donc jamais concurrencé. Brume et fond ne sont pas touchés (leur
// cadence 0,5 s scintillerait contre un passage de pont). Les pointLight du
// wagon ne sont pas atténués : les néons restent allumés sous un pont.
function DayNightLighting() {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const acc = useRef(1);
  const tmp = useRef(new THREE.Color());
  const bases = useRef({ sun: 1.7, fill: 0.4, hemi: 0.62, amb: 0.4, dayness: 1 });

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current >= 0.5) {
      acc.current = 0;
      const w = dayNightWeights(runtime.clockMin / 60);
      const b = bases.current;
      b.sun = SUN.day.intensity * w.day + SUN.golden.intensity * w.golden + SUN.night.intensity * w.night;
      b.fill = 0.4 * w.day + 0.5 * w.golden + 0.1 * w.night;
      b.hemi = 0.62 * w.day + 0.52 * w.golden + 0.22 * w.night;
      b.amb = 0.4 * w.day + 0.35 * w.golden + 0.24 * w.night;
      b.dayness = w.day + 0.8 * w.golden + 0.25 * w.night;
      if (sun.current) {
        mixColor(sun.current.color, w, { day: SUN.day.color, golden: SUN.golden.color, night: SUN.night.color });
        sun.current.position
          .set(0, 0, 0)
          .addScaledVector(SUN.day.pos, w.day)
          .addScaledVector(SUN.golden.pos, w.golden)
          .addScaledVector(SUN.night.pos, w.night);
      }
      if (hemi.current) mixColor(hemi.current.color, w, HEMI_SKY);
      if (amb.current) mixColor(amb.current.color, w, AMBIENT);
      if (scene.fog instanceof THREE.Fog) {
        mixColor(scene.fog.color, w, FOG_COLORS);
        scene.fog.near = 26 * w.day + 18 * w.golden + 14 * w.night;
        scene.fog.far = 115 * w.day + 88 * w.golden + 72 * w.night;
      }
      if (scene.background instanceof THREE.Color) {
        mixColor(tmp.current, w, BG_COLORS);
        scene.background.copy(tmp.current);
      }
    }

    // Assombrissement par frame : pont au-dessus ou grande toiture de gare.
    const b = bases.current;
    const shade = Math.max(segEnv.bridgeShade, 0.7 * segEnv.roofShade);
    const dim = 1 - 0.6 * shade * b.dayness;
    if (sun.current) sun.current.intensity = b.sun * dim;
    if (fill.current) fill.current.intensity = b.fill * dim;
    if (hemi.current) hemi.current.intensity = b.hemi * dim;
    if (amb.current) amb.current.intensity = b.amb * dim;
  });

  return (
    <>
      <directionalLight
        ref={sun}
        position={[26, 30, -16]}
        intensity={1.7}
        color="#fff6e4"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={14}
        shadow-camera-bottom={-8}
        shadow-camera-near={5}
        shadow-camera-far={100}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
      />
      <directionalLight ref={fill} position={[-30, 16, 18]} intensity={0.4} color="#dfeaf2" />
      <hemisphereLight ref={hemi} args={['#cfe6f6', '#8d9088', 0.62]} />
      <ambientLight ref={amb} intensity={0.4} color="#e9f1f5" />
    </>
  );
}

export function Scene() {
  return (
    <>
      <color attach="background" args={['#bcdaee']} />
      <fog attach="fog" args={['#d6e8f2', 26, 115]} />
      <EnvironmentMap />
      <ShadowFlags />
      <DayNightLighting />

      {/* Intérieur : chapelet de points blanc chaud sous le bandeau plafond. */}
      {LAMP_POSITIONS.map((p, i) => (
        <pointLight key={i} position={p} intensity={3.0} distance={7} decay={1.7} color="#fff0da" />
      ))}

      <EffectComposer>
        <Bloom intensity={CONFIG.bloom} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.05} />
        <Vignette eskil={false} offset={0.32} darkness={0.42} />
      </EffectComposer>
    </>
  );
}
