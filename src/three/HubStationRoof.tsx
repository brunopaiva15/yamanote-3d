// Grandes toitures des hubs (Tokyo, Ueno, Ikebukuro, Shinjuku, Shibuya,
// Shinagawa) : la structure avale progressivement le ciel pendant TOUT le
// freinage puis se dissipe au départ. Takanawa Gateway avait la sienne ici,
// blanche ; elle masquait la toiture pliée que le quai porte maintenant
// lui-même (voir ROOF_HUBS dans data/segments).
// Piloté par la progression p de segEnv, en amont du coulissement spatial du
// quai (platformPresence). Écrit segEnv.roofShade, consommé par Scene pour
// l'assombrissement global.
//
// LES COTES NE SONT PLUS ICI : elles sont dans `systems/hubRoof`, avec la
// percée que le hall d'Ueno et celui de Shinagawa y font. Ce fichier ne fait
// plus que les DESSINER — voir là-bas pourquoi la halle cède et non la gare.

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { dayNightWeights } from '../systems/daynight';
import { useStore } from '../store';
import { segEnv } from '../systems/segmentEnv';
import { ROOF_HUBS, SEGMENTS, segmentAt } from '../data/segments';
import {
  COL_FOOT_Y,
  COL_HEAD_Y,
  COL_X,
  COL_ZS,
  LAMP_LEN,
  LAMP_T,
  LAMP_X,
  LAMP_Y,
  ROOF_LEN,
  ROOF_W,
  SLAB_T,
  SLAB_Y,
  TRUSS_T,
  TRUSS_Y,
  TRUSS_ZS,
  roofGapWorld,
} from '../systems/hubRoof';

const COL_H = COL_HEAD_Y - COL_FOOT_Y;
const COL_Y = (COL_HEAD_Y + COL_FOOT_Y) / 2;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Un ouvrage LONG de la halle — la dalle, un bandeau lumineux.
 *
 * Il est fait de deux morceaux et non d'un seul, parce qu'une percée tombe au
 * milieu : le premier va du bout sud au bord de la percée, le second du bord
 * nord au bout nord. Sans percée, le premier est escamoté et le second couvre
 * tout — il n'y a alors pas un joint de plus qu'avant.
 */
interface Run {
  a: THREE.Mesh;
  b: THREE.Mesh;
  z0: number;
  z1: number;
}

/** Un ouvrage PONCTUEL — une ferme, une colonne — et l'emprise qu'il occupe. */
interface Post {
  mesh: THREE.Mesh;
  z0: number;
  z1: number;
}

interface Roof {
  root: THREE.Group;
  mats: THREE.MeshBasicMaterial[]; // structure (s'assombrit la nuit)
  glows: THREE.MeshBasicMaterial[]; // éclairage sous toiture (s'allume la nuit)
  runs: Run[];
  posts: Post[];
}

function roofBuilder(): {
  roof: Roof;
  mat: (color: string) => THREE.MeshBasicMaterial;
  glow: (color: string) => THREE.MeshBasicMaterial;
  box: (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => THREE.Mesh;
} {
  const roof: Roof = { root: new THREE.Group(), mats: [], glows: [], runs: [], posts: [] };
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
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    roof.root.add(mesh);
    return mesh;
  };
  return { roof, mat, glow, box };
}

/** Une longueur, en deux morceaux d'un mètre qu'on étirera chaque image. */
function run(
  roof: Roof,
  box: (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => THREE.Mesh,
  m: THREE.Material,
  w: number,
  h: number,
  x: number,
  y: number,
  len: number,
): void {
  roof.runs.push({
    a: box(m, w, h, 1, x, y, 0),
    b: box(m, w, h, 1, x, y, 0),
    z0: -len / 2,
    z1: len / 2,
  });
}

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
  run(roof, box, slab, ROOF_W, SLAB_T, 0, SLAB_Y, ROOF_LEN);
  for (const z of TRUSS_ZS) {
    roof.posts.push({
      mesh: box(truss, ROOF_W, TRUSS_T, TRUSS_T, 0, TRUSS_Y, z),
      z0: z - TRUSS_T / 2,
      z1: z + TRUSS_T / 2,
    });
  }
  for (const z of COL_ZS) {
    for (const x of [-COL_X, COL_X]) {
      roof.posts.push({
        mesh: box(col, 0.55, COL_H, 0.55, x, COL_Y, z),
        z0: z - 0.275,
        z1: z + 0.275,
      });
    }
  }
  for (const x of [-LAMP_X, LAMP_X]) run(roof, box, lamp, 0.3, LAMP_T, x, LAMP_Y, LAMP_LEN);
  roof.root.visible = false;
  return roof;
}

/** Un morceau d'ouvrage long, posé entre deux cotes. En deçà, il n'existe pas. */
function lay(mesh: THREE.Mesh, a: number, b: number): void {
  const len = b - a;
  mesh.visible = len > 0.02;
  if (!mesh.visible) return;
  mesh.scale.z = len;
  mesh.position.z = (a + b) / 2;
}

export function HubStationRoof() {
  const built = useMemo(() => ({ steel: buildSteelRoof() }), []);

  useFrame(() => {
    if (segEnv.seg < 0) return;
    const { index, loopDirection, platformIndex } = useStore.getState();
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

    // LA PERCÉE SUIT LE QUAI. Elle est prise sur la gare dont le quai est là —
    // pas sur `index`, qui est déjà passé à la suivante au départ — et elle
    // coulisse avec lui : un trou immobile ne serait au bon endroit qu'à
    // l'arrêt. Quai absent, plus de hall : la halle se referme.
    const g = runtime.platformFade > 0.02
      ? roofGapWorld(platformIndex)
      : null;

    const w = dayNightWeights(runtime.clockMin / 60);
    const cityNight = Math.min(1, w.night + w.golden * 0.45);
    const structDay = 1 - 0.45 * cityNight;
    const lampLvl = 0.3 + 0.7 * cityNight;

    for (const [kind, roof] of [['steel', built.steel]] as const) {
      const active = fade > 0.02 && variant === kind;
      roof.root.visible = active;
      if (!active) continue;
      for (const r of roof.runs) {
        // Sans percée, le premier morceau est nul et le second couvre tout.
        const c0 = g ? Math.max(r.z0, Math.min(r.z1, g.z0)) : r.z0;
        const c1 = g ? Math.max(r.z0, Math.min(r.z1, g.z1)) : r.z0;
        lay(r.a, r.z0, c0);
        lay(r.b, c1, r.z1);
      }
      for (const s of roof.posts) s.mesh.visible = !g || s.z1 <= g.z0 || s.z0 >= g.z1;
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
