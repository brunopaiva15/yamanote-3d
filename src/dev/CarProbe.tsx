// Page de probe DEV (voir /car-probe.html) : superpose le wagon procédural et
// une maquette de référence (public/models/raw/, hors dépôt) sous le VRAI
// éclairage du jeu, pour arbitrer forme par forme.
//
// La maquette sort de `npm run models:inspect -- … --extract` : 1 unité =
// 1 mètre, plancher à y = 0, module centré. Elle n'a qu'UNE travée de porte :
// elle est décalée en z pour tomber sur une porte du wagon (±2,5 / ±7,5).
//
// ⚠️ La maquette a l'intérieur d'un E235-1000 : ses banquettes bleues ne sont
// PAS celles du E235-0 de la Yamanote. On y lit des formes, jamais des teintes.

import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '../data/config';
import { runtime } from '../systems/runtime';
import { Scene } from '../three/Scene';
import { Car } from '../three/Car';
import { Seats } from '../three/Seats';
import { Doors } from '../three/Doors';
import { Handles } from '../three/Handles';
import { Ads } from '../three/Ads';
import { Screens } from '../three/Screens';

const REF_URL = 'models/raw/e235-ref-module.glb';

type RefStyle = 'texture' | 'ghost' | 'wire';
const STYLES: RefStyle[] = ['texture', 'ghost', 'wire'];

const q = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => {
  const v = parseFloat(q.get(key) ?? '');
  return Number.isFinite(v) ? v : fallback;
};

// Heure du monde : pilote tout le fondu jour / nuit de three/Scene.tsx.
// ?h=17.2 pour juger les matériaux à l'heure dorée, ?h=21 de nuit.
runtime.clockMin = num('h', CONFIG.clockStart / 60) * 60;

// Prépare la maquette une fois chargée : on masque tout ce qui passe sous le
// plancher (châssis, bogies, coffres) — invisible en jeu, et ça encombre la vue.
function prepare(root: THREE.Object3D): void {
  const box = new THREE.Box3();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    box.setFromObject(mesh);
    if (box.max.y < -0.02) mesh.visible = false;
  });
}

function applyStyle(root: THREE.Object3D, style: RefStyle, originals: Map<string, THREE.Material | THREE.Material[]>): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!originals.has(mesh.uuid)) originals.set(mesh.uuid, mesh.material);
    if (style === 'texture') {
      const original = originals.get(mesh.uuid);
      if (original) mesh.material = original;
      return;
    }
    mesh.material = new THREE.MeshStandardMaterial({
      color: '#ff4f9d',
      roughness: 0.9,
      transparent: style === 'ghost',
      opacity: style === 'ghost' ? 0.35 : 1,
      depthWrite: style !== 'ghost',
      wireframe: style === 'wire',
    });
  });
}

export function CarProbe() {
  const [ref, setRef] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRef, setShowRef] = useState(q.get('ref') !== '0');
  const [showProc, setShowProc] = useState(q.get('proc') !== '0');
  const [style, setStyle] = useState<RefStyle>((q.get('style') as RefStyle) ?? 'texture');
  const originals = useMemo(() => new Map<string, THREE.Material | THREE.Material[]>(), []);
  const refZ = num('refZ', 2.5); // travée de porte du jeu la plus proche du départ

  useEffect(() => {
    let cancelled = false;
    new GLTFLoader().load(
      REF_URL,
      (gltf) => {
        if (cancelled) return;
        prepare(gltf.scene);
        setRef(gltf.scene);
      },
      undefined,
      () => {
        if (!cancelled) setError(`Maquette introuvable : public/${REF_URL}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ref) applyStyle(ref, style, originals);
  }, [ref, style, originals]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r') setShowRef((v) => !v);
      else if (e.key === 'p') setShowProc((v) => !v);
      else if (e.key === 's') setStyle((v) => STYLES[(STYLES.indexOf(v) + 1) % STYLES.length]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{
          fov: 70,
          near: 0.05,
          far: 120,
          position: [num('x', 0), num('y', CONFIG.eyeHeight), num('z', 6)],
        }}
        shadows
      >
        <Scene />
        {showProc && (
          <>
            <Car />
            <Seats />
            <Doors />
            <Handles />
            <Ads />
            <Screens />
          </>
        )}
        {showRef && ref && <primitive object={ref} position={[0, 0, refZ]} />}
        <OrbitControls target={[num('tx', 0), num('ty', 1.4), num('tz', -2)]} makeDefault />
      </Canvas>
      <div className="probe-hud">
        <b>car-probe</b> — <kbd>R</kbd> maquette {showRef ? 'on' : 'off'} · <kbd>P</kbd> procédural{' '}
        {showProc ? 'on' : 'off'} · <kbd>S</kbd> style {style}
        <br />
        maquette en z = {refZ} m · heure {(runtime.clockMin / 60).toFixed(1)} h (<code>?h=</code>)
        {error && <div className="probe-error">{error}</div>}
      </div>
    </>
  );
}
