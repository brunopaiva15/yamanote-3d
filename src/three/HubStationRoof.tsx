// Grandes toitures des hubs (Tokyo, Ueno, Ikebukuro, Shinjuku, Shibuya,
// Shinagawa) : la structure avale progressivement le ciel pendant TOUT le
// freinage puis se dissipe au départ. Takanawa Gateway avait la sienne ici,
// blanche ; elle masquait la toiture pliée que le quai porte maintenant
// lui-même (voir ROOF_HUBS dans data/segments).
// Piloté par la progression p de segEnv, en amont du coulissement spatial du
// quai (platformPresence). Écrit segEnv.roofShade, consommé par Scene pour
// l'assombrissement global.

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { useStore } from '../store';
import { segEnv } from '../systems/segmentEnv';
import { ROOF_HUBS, SEGMENTS, segmentAt } from '../data/segments';
import { PLATFORM_TOP } from '../data/stationGeometry';

const ROOF_LEN = 180;
const ROOF_W = 26;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface Roof {
  root: THREE.Group;
  mats: THREE.MeshBasicMaterial[]; // structure (s'assombrit la nuit)
  glows: THREE.MeshBasicMaterial[]; // éclairage sous toiture (s'allume la nuit)
}

function roofBuilder(): {
  roof: Roof;
  mat: (color: string) => THREE.MeshBasicMaterial;
  glow: (color: string) => THREE.MeshBasicMaterial;
  box: (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rotZ?: number) => void;
} {
  const roof: Roof = { root: new THREE.Group(), mats: [], glows: [] };
  const mat = (color: string) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, fog: true, depthWrite: false });
    m.userData.base = m.color.clone();
    roof.mats.push(m);
    return m;
  };
  const glow = (color: string) => {
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      fog: true,
      depthWrite: false,
      toneMapped: false,
    });
    roof.glows.push(m);
    return m;
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    if (rotZ) mesh.rotation.z = rotZ;
    roof.root.add(mesh);
  };
  return { roof, mat, glow, box };
}

/**
 * Pied des colonnes.
 *
 * Une colonne de halle PREND APPUI SUR LE QUAI. La sienne descendait un mètre
 * plus bas, à −1,10, et cela ne se voyait pas tant que la gare s'arrêtait à sa
 * dalle : le quai est opaque, et un pied enterré sous lui n'existe pour
 * personne. Depuis qu'on DESCEND dans les gares, ce mètre est passé de l'autre
 * côté - la sous-face de la dalle est le plafond du hall souterrain, à −0,60, et
 * ce qui traverse ressort DEDANS. Chaque colonne pendait donc au plafond du
 * hall, un demi-mètre de bloc gris sans ombre ni texture (la toiture est en
 * `MeshBasicMaterial`), au-dessus des portillons de Tokyo, d'Ueno, d'Ikebukuro,
 * de Shinjuku, de Shibuya et de Shinagawa.
 *
 * Le pied s'arrête donc au nu du quai, avec deux centimètres d'engravure pour
 * ne pas laisser deux faces coplanaires - assez pour asseoir la colonne, trop
 * peu pour ressortir sous une dalle qui fait cinquante centimètres.
 */
const COL_FOOT_Y = PLATFORM_TOP - 0.02;
/** Tête des colonnes : dans la dalle de toiture, qu'elles portent. */
const COL_HEAD_Y = 6.3;
const COL_H = COL_HEAD_Y - COL_FOOT_Y;
const COL_Y = (COL_HEAD_Y + COL_FOOT_Y) / 2;

// Toiture acier sombre : dalle, fermes transversales, colonnes, bandeaux
// lumineux chauds (gares classiques).
function buildSteelRoof(): Roof {
  const { roof, mat, glow, box } = roofBuilder();
  // Éclairci depuis qu'on peut se tenir dessous : à 6,30 m au-dessus du quai,
  // une dalle presque noire faisait un ciel de plomb.
  const slab = mat('#5c636c');
  const truss = mat('#6b727b');
  const col = mat('#767d86');
  const lamp = glow('#ffd9a2');
  box(slab, ROOF_W, 0.5, ROOF_LEN, 0, 6.3, 0);
  for (let z = -81; z <= 81; z += 18) box(truss, ROOF_W, 0.6, 0.6, 0, 5.95, z);
  for (let z = -75; z <= 75; z += 30) {
    box(col, 0.55, COL_H, 0.55, -10, COL_Y, z);
    box(col, 0.55, COL_H, 0.55, 10, COL_Y, z);
  }
  box(lamp, 0.3, 0.08, ROOF_LEN - 4, -4.5, 6.0, 0);
  box(lamp, 0.3, 0.08, ROOF_LEN - 4, 4.5, 6.0, 0);
  roof.root.visible = false;
  return roof;
}

export function HubStationRoof() {
  const built = useMemo(() => ({ steel: buildSteelRoof() }), []);

  useFrame(() => {
    if (segEnv.seg < 0) return;
    const { index, loopDirection } = useStore.getState();
    const arrHub = ROOF_HUBS[index];
    const depHub = ROOF_HUBS[segmentAt(index, loopDirection)];
    const p = segEnv.p;

    // Le freinage couvre p 0.878→1 : la toiture croît sur toute l'approche,
    // reste pleine pendant l'arrêt (p=1), puis se dissipe en début de départ.
    const arr = arrHub ? smoothstep(0.86, 0.97, p) : 0;
    const dep = depHub ? 1 - smoothstep(0.03, 0.14, p) : 0;
    let fade = Math.max(arr, dep);
    let variant = arr >= dep ? (arrHub ?? depHub) : (depHub ?? arrHub);
    // Tronçon couvert (Shinjuku→Yoyogi) : la structure ne disparaît jamais.
    if (SEGMENTS[segEnv.seg].covered) {
      fade = Math.max(fade, 0.3);
      variant = variant ?? 'steel';
    }
    segEnv.roofShade = fade;

    const w = dayNightWeights(runtime.clockMin / 60);
    const cityNight = Math.min(1, w.night + w.golden * 0.45);
    const structDay = 1 - 0.45 * cityNight;
    const lampLvl = 0.3 + 0.7 * cityNight;

    for (const [kind, roof] of [['steel', built.steel]] as const) {
      const active = fade > 0.02 && variant === kind;
      roof.root.visible = active;
      if (!active) continue;
      for (const m of roof.mats) {
        m.opacity = fade;
        const base = m.userData.base as THREE.Color;
        m.color.copy(base).multiplyScalar(structDay);
      }
      for (const m of roof.glows) m.opacity = fade * lampLvl;
    }
  });

  return (
    <>
      <primitive object={built.steel.root} />
    </>
  );
}
