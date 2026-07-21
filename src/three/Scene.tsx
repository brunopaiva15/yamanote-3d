// Ambiance : brouillard, éclairage intérieur chaud tamisé contre extérieur
// terne et froid, post-process léger (bloom seuil haut + vignette).

import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { CONFIG } from '../data/config';

const LAMP_POSITIONS: [number, number, number][] = [
  [0, 2.16, -7.5],
  [0, 2.16, -3.75],
  [0, 2.16, 0],
  [0, 2.16, 3.75],
  [0, 2.16, 7.5],
];

export function Scene() {
  return (
    <>
      <color attach="background" args={['#8f9fac']} />
      <fog attach="fog" args={['#8f9fac', 16, 82]} />

      {/* Extérieur : lumière froide, douce, fin d'après-midi voilée. */}
      <hemisphereLight args={['#b8c4cc', '#5a5f66', 0.55]} />
      <ambientLight intensity={0.34} color="#cfd6da" />
      <directionalLight position={[18, 14, -8]} intensity={1.05} color="#d8dde2" />

      {/* Intérieur : chapelet de points blanc chaud sous le bandeau plafond. */}
      {LAMP_POSITIONS.map((p, i) => (
        <pointLight key={i} position={p} intensity={3.4} distance={7} decay={1.7} color="#ffe9cd" />
      ))}

      <EffectComposer>
        <Bloom intensity={CONFIG.bloom} luminanceThreshold={0.92} luminanceSmoothing={0.18} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette eskil={false} offset={0.28} darkness={0.62} />
      </EffectComposer>
    </>
  );
}
