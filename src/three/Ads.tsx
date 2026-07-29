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

/** Alimentation en dessous de laquelle les écrans 窓上 sont éteints (cf. Screens). */
const SCREEN_CUTOFF = 0.45;

export function Ads() {
  // Un pivot par affiche, à son point d'accroche : chaque nakazuri se balance
  // sur ses pinces, sans translation parasite.
  const pivots = useRef<(THREE.Group | null)[]>([]);

  // Rangée continue le long de l'axe, sans déborder sur les travées d'about.
  // Calculée d'abord pour dimensionner le pool de textures (recto + verso
  // uniques sur chaque suspension).
  const nakazuri = useMemo(() => {
    const out: { z: number; front: number; back: number }[] = [];
    const span = HL - 1.1;
    for (let z = -span; z <= span + 0.001; z += NK_PITCH) {
      const i = out.length;
      out.push({ z, front: i, back: 0 }); // back rempli après le décompte
    }
    const n = out.length;
    for (let i = 0; i < n; i++) out[i].back = n + i;
    return out;
  }, []);

  const { nakazuriMats, screenMats, housingMat, bezelMat, clipMat, railMat } = useMemo(() => {
    // Un visuel distinct par face (recto/verso) : plus de répétition dans l'allée.
    const nakazuriCount = Math.max(2, nakazuri.length * 2);
    const nakazuriMats = Array.from(
      { length: nakazuriCount },
      (_, i) =>
        new THREE.MeshStandardMaterial({
          map: makeNakazuriTexture(i),
          roughness: 0.72,
          metalness: 0,
        }),
    );
    // Douze écrans 窓上 : une texture par panneau (seeds 100–111).
    const screenMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 12; i++) {
      screenMats.push(new THREE.MeshBasicMaterial({ map: makeAdTexture(100 + i, false), toneMapped: false }));
    }
    const housingMat = new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.6, metalness: 0.02 });
    const bezelMat = new THREE.MeshStandardMaterial({ color: '#1c1e22', roughness: 0.55 });
    const clipMat = new THREE.MeshStandardMaterial({ color: '#b9bec3', roughness: 0.42, metalness: 0.7 });
    const railMat = new THREE.MeshStandardMaterial({ color: '#aeb3b8', roughness: 0.36, metalness: 0.8 });
    return { nakazuriMats, screenMats, housingMat, bezelMat, clipMat, railMat };
  }, [nakazuri]);

  useFrame(() => {
    // Les douze écrans 窓上 sont de la publicité, rien de plus : ils tombent
    // avec l'alimentation de bord et ne reviennent qu'avec elle. Les nakazuri,
    // elles, sont du papier — une coupure de courant ne les décroche pas, et
    // c'est le seul affichage du wagon qui reste lisible dans le noir.
    const lit = 0.05 + 0.95 * Math.max(0, (runtime.carPower - SCREEN_CUTOFF) / (1 - SCREEN_CUTOFF));
    for (const m of screenMats) m.color.setScalar(lit);

    for (let i = 0; i < pivots.current.length; i++) {
      const p = pivots.current[i];
      if (!p) continue;
      // Deux balancements distincts : le roulis du train fait pencher l'affiche
      // dans son plan, l'accélération la pousse d'avant en arrière.
      const speedFactor = Math.min(1, runtime.speed / 3);
      p.rotation.z = runtime.sway * 0.055 + Math.sin(runtime.swayTime * 1.6 + i * 0.9) * 0.012 * speedFactor;
      p.rotation.x = -runtime.accel * 0.05 + Math.sin(runtime.swayTime * 1.15 + i * 1.7) * 0.02 * speedFactor;
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
                  material={screenMats[(s === 1 ? 0 : 6) + i * 2 + k]}
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
