// Publicités japonaises : nakazuri (中吊り) suspendues dans l'axe du wagon et
// écrans inclinés au-dessus des fenêtres (窓上, à la manière de l'E235).
//
// Les nakazuri ne sont pas orientées le long du wagon mais EN TRAVERS : leur
// face regarde l'avant et l'arrière de la rame. C'est ce qui donne, quand on
// regarde dans l'axe de l'allée, ce tunnel d'affiches qui fuit vers le fond —
// et c'est ainsi qu'on les lit, assis sur les banquettes latérales.
//
// Proportions relevées sur photos : la bannière est bien plus large que haute,
// de l'ordre de trois fois. Sa largeur est bornée par l'espace libre entre les
// deux rails de tsurikawa (x = ±0,45), qu'elle ne doit jamais toucher ; sa
// hauteur en découle. C'est un bandeau plat sous le plafond, pas un panneau.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { runtime } from '../systems/runtime';
import { makeAdTexture, makeNakazuriTexture } from '../textures/procedural';

const HL = CONFIG.carHalfLength; // 10

// Géométrie de la suspension, en mètres.
const NK_W = 0.86;
const NK_H = 0.3;
const NK_TOP = 2.25; // le haut de l'affiche affleure le caisson de plafond
const NK_PITCH = 1.05; // pas de la rangée : un ruban ajouré, comme sur la rame
const NK_RAIL_Y = 2.26;

// Matériaux partagés par les 11 voitures : une seule série de CanvasTexture.
let sharedMats: {
  nakazuriMats: THREE.MeshStandardMaterial[];
  screenMats: THREE.MeshBasicMaterial[];
  housingMat: THREE.MeshStandardMaterial;
  bezelMat: THREE.MeshStandardMaterial;
  clipMat: THREE.MeshStandardMaterial;
  railMat: THREE.MeshStandardMaterial;
} | null = null;

function getAdMaterials() {
  if (sharedMats) return sharedMats;
  const nakazuriMats = Array.from(
    { length: 8 },
    (_, i) =>
      new THREE.MeshStandardMaterial({
        map: makeNakazuriTexture(i),
        roughness: 0.72,
        metalness: 0,
      }),
  );
  const screenMats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    screenMats.push(new THREE.MeshBasicMaterial({ map: makeAdTexture(20 + i, false), toneMapped: false }));
  }
  sharedMats = {
    nakazuriMats,
    screenMats,
    housingMat: new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.6, metalness: 0.02 }),
    bezelMat: new THREE.MeshStandardMaterial({ color: '#1c1e22', roughness: 0.55 }),
    clipMat: new THREE.MeshStandardMaterial({ color: '#b9bec3', roughness: 0.42, metalness: 0.7 }),
    railMat: new THREE.MeshStandardMaterial({ color: '#aeb3b8', roughness: 0.36, metalness: 0.8 }),
  };
  return sharedMats;
}

export function Ads({ carNumber = CONFIG.playerCar }: { carNumber?: number }) {
  // Un pivot par affiche, à son point d'accroche : chaque nakazuri se balance
  // sur ses pinces, sans translation parasite.
  const pivots = useRef<(THREE.Group | null)[]>([]);
  const mats = useMemo(() => getAdMaterials(), []);
  const { nakazuriMats, screenMats, housingMat, bezelMat, clipMat, railMat } = mats;

  // Rangée continue le long de l'axe, sans déborder sur les travées d'about.
  // Décalage par voiture pour ne pas aligner les mêmes visuels d'un bout à l'autre.
  const nakazuri = useMemo(() => {
    const out: { z: number; front: number; back: number }[] = [];
    const span = HL - 1.1;
    const shift = (carNumber - 1) * 3;
    for (let z = -span; z <= span + 0.001; z += NK_PITCH) {
      const i = out.length;
      out.push({ z, front: (i + shift) % 8, back: (i + shift + 5) % 8 });
    }
    return out;
  }, [carNumber]);

  useFrame(() => {
    for (let i = 0; i < pivots.current.length; i++) {
      const p = pivots.current[i];
      if (!p) continue;
      // Deux balancements distincts : le roulis du train fait pencher l'affiche
      // dans son plan, l'accélération la pousse d'avant en arrière.
      const speedFactor = Math.min(1, runtime.speed / 3);
      const phase = i + carNumber * 2.3;
      p.rotation.z = runtime.sway * 0.055 + Math.sin(runtime.swayTime * 1.6 + phase * 0.9) * 0.012 * speedFactor;
      p.rotation.x = -runtime.accel * 0.05 + Math.sin(runtime.swayTime * 1.15 + phase * 1.7) * 0.02 * speedFactor;
    }
  });

  // Paires d'écrans inclinés au centre des baies entre portes.
  const madoue: number[] = [-5, 0, 5];

  return (
    <group>
      {/* Rail de suspension au plafond, dans l'axe */}
      <mesh position={[0, NK_RAIL_Y, 0]} material={railMat}>
        <boxGeometry args={[0.022, 0.022, (HL - 1) * 2]} />
      </mesh>

      {nakazuri.map((n, i) => (
        <group
          key={`nk${i}`}
          position={[0, NK_TOP, n.z]}
          ref={(g) => {
            pivots.current[i] = g;
          }}
        >
          {/* Pinces de suspension */}
          {[-0.3, 0.3].map((x) => (
            <mesh key={`clip${x}`} position={[x, 0.014, 0]} material={clipMat}>
              <boxGeometry args={[0.05, 0.028, 0.012]} />
            </mesh>
          ))}
          {/* Recto et verso imprimés : jamais de texte en miroir */}
          <mesh position={[0, -NK_H / 2, 0.001]} material={nakazuriMats[n.front]}>
            <planeGeometry args={[NK_W, NK_H]} />
          </mesh>
          <mesh position={[0, -NK_H / 2, -0.001]} rotation={[0, Math.PI, 0]} material={nakazuriMats[n.back]}>
            <planeGeometry args={[NK_W, NK_H]} />
          </mesh>
        </group>
      ))}

      {/* Écrans publicitaires 窓上 : boîtiers blancs inclinés vers l'allée */}
      {([1, -1] as const).map((s) =>
        madoue.map((z, i) =>
          [-0.52, 0.52].map((dz, k) => (
            <group
              key={`mu${s}-${z}-${k}`}
              position={[s * (1.4 - 0.09), 2.12, z + dz]}
              rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              <group rotation={[0.32, 0, 0]}>
                <mesh material={housingMat}>
                  <boxGeometry args={[0.98, 0.34, 0.05]} />
                </mesh>
                <mesh position={[0, 0, 0.027]} material={bezelMat}>
                  <planeGeometry args={[0.9, 0.28]} />
                </mesh>
                <mesh
                  position={[0, 0, 0.03]}
                  material={screenMats[(i * 2 + k + (s === 1 ? 0 : 3) + carNumber) % screenMats.length]}
                >
                  <planeGeometry args={[0.84, 0.24]} />
                </mesh>
              </group>
            </group>
          )),
        ),
      )}
    </group>
  );
}
