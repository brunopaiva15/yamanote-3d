// L'ombre qui tombe dans le wagon quand les tubes s'éteignent.
//
// Le problème que ce fichier résout : couper les cinq luminaires du plafond ne
// changeait quasiment rien à l'image. Une coupure de caténaire laissait la
// voiture ENTIÈREMENT éclairée — pas de clignotement, pas de pénombre, rien.
// La mesure est sans appel : à alimentation nulle, la clarté de l'intérieur ne
// tombait que d'un dixième.
//
// La raison n'est pas dans la séquence de coupure, elle est dans le moteur.
// Un rasteriseur n'a pas d'éclairage global : la lumière d'ambiance du wagon
// est posée à la main (ambiante, hémisphérique, carte d'environnement) et ces
// trois sources ne savent pas que le wagon est une boîte fermée. Elles
// éclairent le plafond par-dessus comme si le toit n'existait pas, et elles ne
// dépendent d'aucune alimentation. Les luminaires, eux, ne pesaient presque
// rien à côté.
//
// Ce qu'on fait ici : rendre à cette ambiance sa véritable origine. Dans une
// voiture allumée, la clarté diffuse qui remplit l'espace, c'est le renvoi des
// tubes sur les parois blanches — donc elle doit mourir avec eux. On l'atténue
// par une OCCLUSION AMBIANTE portée sur les matériaux de l'intérieur : le
// nuanceur de three.js ne l'applique qu'à la lumière indirecte, si bien que le
// soleil qui entre par la baie et les luminaires de secours, eux, continuent
// d'éclairer normalement. C'est exactement le partage qu'on cherche.
//
// La carte d'occlusion est une image d'un pixel NOIR : le nuanceur calcule
// `(texel.r - 1) * aoMapIntensity + 1`, donc avec un texel à zéro l'intensité
// devient directement la part d'ambiance retirée. Un seul uniforme à écrire
// par matériau et par image, aucune recompilation.

import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { cabinShade } from '../systems/carPower';
import { dayNightWeights } from '../systems/daynight';

/** Un pixel noir : voir plus haut, c'est lui qui fait de l'intensité une part. */
const SHADE_MAP = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
// Premier jeu d'UV : les géométries du wagon n'en ont qu'un, et une carte
// d'occlusion en réclame un second par défaut.
SHADE_MAP.channel = 0;
SHADE_MAP.needsUpdate = true;

/** Matériau qui sait recevoir une carte d'occlusion (standard, physical, basic). */
type Shadeable = THREE.Material & { aoMap: THREE.Texture | null; aoMapIntensity: number };

function isShadeable(m: THREE.Material): m is Shadeable {
  // Un matériau qui ne connaît pas l'occlusion ambiante n'a, par construction,
  // pas d'ambiante à retirer : bulles de dialogue, lignes, sprites.
  return 'aoMapIntensity' in m;
}

/** Pose la carte sur un matériau si besoin, et lui applique la part du moment. */
function shadeMaterial(m: THREE.Material, shade: number, seen: Set<Shadeable>): void {
  if (!isShadeable(m) || seen.has(m)) return;
  // Un matériau qui porte DÉJÀ une occlusion cuite dans sa texture n'est pas à
  // nous : on ne l'écrase pas.
  if (m.aoMap && m.aoMap !== SHADE_MAP) return;
  seen.add(m);
  if (m.aoMap !== SHADE_MAP) {
    m.aoMap = SHADE_MAP;
    m.needsUpdate = true;
  }
  m.aoMapIntensity = shade;
}

/**
 * Enveloppe l'intérieur de la rame. Tout ce qui vit là-dedans s'assombrit
 * ensemble — parois, sièges, barres, affiches, et les voyageurs avec.
 */
export function CabinShade({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null);
  const seen = useRef(new Set<Shadeable>());
  // Clarté extérieure, relue de loin en loin : l'heure ne bouge pas d'une
  // image à l'autre, et c'est la seule chose ici qui coûte un calcul.
  const dayness = useRef(1);
  const clockAcc = useRef(1e3);
  // Le parcours du graphe : à chaque image pendant une coupure, où un
  // matériau qui apparaît en retard se verrait ; quatre fois par seconde le
  // reste du temps, où il n'y a rien à voir et où des voyageurs montent.
  const sweepAcc = useRef(1e3);
  const wasShaded = useRef(false);

  useFrame((_, dt) => {
    clockAcc.current += dt;
    if (clockAcc.current >= 0.5) {
      clockAcc.current = 0;
      const w = dayNightWeights(runtime.clockMin / 60);
      dayness.current = w.day + 0.8 * w.golden + 0.25 * w.night;
    }

    const shade = cabinShade(runtime.carPower, dayness.current);
    const shaded = shade > 0.001;
    sweepAcc.current += dt;
    // Une dernière passe après la coupure : c'est elle qui rend au wagon son
    // ambiance pleine, sinon les matériaux resteraient figés sur la dernière
    // valeur écrite.
    if (!shaded && !wasShaded.current && sweepAcc.current < 0.25) return;
    sweepAcc.current = 0;
    wasShaded.current = shaded;

    const g = root.current;
    if (!g) return;
    const s = seen.current;
    s.clear();
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      if (Array.isArray(m)) for (const x of m) shadeMaterial(x, shade, s);
      else shadeMaterial(m, shade, s);
    });
  });

  return <group ref={root}>{children}</group>;
}
