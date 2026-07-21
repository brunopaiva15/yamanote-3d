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
    scene.environmentIntensity = 0.42;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

export function Scene() {
  return (
    <>
      <color attach="background" args={['#e0b494']} />
      <fog attach="fog" args={['#dcae8f', 18, 88]} />
      <EnvironmentMap />

      {/* Soleil bas, chaud, qui entre par les fenêtres. */}
      <directionalLight position={[34, 7, -14]} intensity={1.9} color="#ffb37a" />
      <directionalLight position={[-30, 9, 18]} intensity={0.55} color="#e8a98c" />
      {/* Ciel rosé / sol froid. */}
      <hemisphereLight args={['#eec5ae', '#5f5a64', 0.5]} />
      <ambientLight intensity={0.3} color="#e3cabb" />

      {/* Intérieur : chapelet de points blanc chaud sous le bandeau plafond. */}
      {LAMP_POSITIONS.map((p, i) => (
        <pointLight key={i} position={p} intensity={2.7} distance={7} decay={1.7} color="#fff0da" />
      ))}

      <EffectComposer>
        <Bloom intensity={CONFIG.bloom} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.14} />
        <Vignette eskil={false} offset={0.3} darkness={0.62} />
      </EffectComposer>
    </>
  );
}
