// Ambiance : fin d'après-midi dorée. Soleil bas et chaud à travers les vitres,
// intérieur fluorescent doux, brume chaude au loin, réflexions d'environnement
// pour les laqués et le chrome, post-process filmique discret
// (bloom seuil haut, grain, vignette).

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer, Bloom, Vignette, ToneMapping, Noise } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { CONFIG } from '../data/config';

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

export function Scene() {
  return (
    <>
      <color attach="background" args={['#bcdaee']} />
      <fog attach="fog" args={['#d6e8f2', 26, 115]} />
      <EnvironmentMap />
      <ShadowFlags />

      {/* Plein jour éclatant (esprit Shashingo) : soleil haut, air limpide,
          ombres nettes mais douces. */}
      <directionalLight
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
      <directionalLight position={[-30, 16, 18]} intensity={0.4} color="#dfeaf2" />
      {/* Ciel bleu clair / sol neutre. */}
      <hemisphereLight args={['#cfe6f6', '#8d9088', 0.62]} />
      <ambientLight intensity={0.4} color="#e9f1f5" />

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
