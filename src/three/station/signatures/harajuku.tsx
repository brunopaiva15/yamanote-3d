// JY19 原宿 — le seul couple de quais latéraux de la boucle.
//
// Deux choses font Harajuku, et elles s'opposent : le bâtiment clair et vitré
// de 2020, tout en blanc et en verre, avec son hall au niveau supérieur ; et
// de l'autre côté, la masse sombre et continue des arbres du Meiji-jingū. Entre
// les deux, deux voies et le quai d'en face — celui de l'autre sens, qu'on voit
// en entier puisqu'il n'y a rien pour le masquer.
//
// C'est la seule gare où le décor d'en face se trouve du côté NÉGATIF : notre
// quai est un quai latéral, la voie est devant nous, et le quai opposé au-delà.

import * as THREE from 'three';
import { GAUGE_HALF, PLATFORM_TOP, TRACK_HALF } from '../../../data/stationGeometry';
import { bays, useSigMaterials, type SigProps } from './kit';

/** Profondeur du quai d'en face. */
const OPP_DEPTH = 4.6;
/** Entraxe des deux voies : c'est ce qui sépare les deux quais latéraux. */
const TRACK_SPACING = 3.6;

export function Harajuku({ layout, place }: SigProps) {
  const len = layout.length;
  const backX = place.backX;
  const top = layout.canopyY;
  // Deux quais latéraux, deux voies entre eux. La seconde voie court à
  // TRACK_SPACING de la nôtre, et le quai d'en face la borde — donc tout cela
  // se trouve en x NÉGATIF, du côté d'où le train est arrivé.
  const otherTrackX = -TRACK_SPACING;
  const oppEdge = otherTrackX - TRACK_HALF;
  const oppBack = oppEdge - OPP_DEPTH;

  const s = useSigMaterials(
    () => ({
      // Acier blanc et bois blond du bâtiment de 2020.
      white: new THREE.MeshStandardMaterial({
        color: '#f0efe9',
        roughness: 0.66,
        emissive: '#e6e4dc',
        emissiveIntensity: 0.22,
      }),
      pane: new THREE.MeshStandardMaterial({
        color: '#d8e6ee',
        roughness: 0.1,
        metalness: 0.04,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
      // Le Meiji-jingū : une masse sombre et continue, jamais un arbre isolé.
      grove: new THREE.MeshStandardMaterial({ color: '#33502f', roughness: 0.98 }),
      ballast: new THREE.MeshStandardMaterial({ color: '#43474a', roughness: 0.97 }),
      rail: new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.42, metalness: 0.6 }),
      slab: new THREE.MeshStandardMaterial({ color: '#cfd0ca', roughness: 0.93 }),
    }),
    [],
  );

  return (
    <group>
      {/* --- Le quai d'en face, de l'autre côté de notre voie ------------- */}
      <mesh position={[(oppEdge + oppBack) / 2, PLATFORM_TOP - 0.22, 0]} material={s.slab}>
        <boxGeometry args={[OPP_DEPTH, 0.44, len]} />
      </mesh>
      <mesh position={[(oppEdge + oppBack) / 2, top + 0.07, 0]} material={s.white}>
        <boxGeometry args={[OPP_DEPTH + 0.4, 0.14, len]} />
      </mesh>
      {bays(len, 11).map((z) => (
        <mesh
          key={`oc${z}`}
          position={[oppBack + 0.6, PLATFORM_TOP + (top - PLATFORM_TOP) / 2, z]}
          material={s.white}
        >
          <boxGeometry args={[0.28, top - PLATFORM_TOP, 0.28]} />
        </mesh>
      ))}
      {/* La seconde voie, celle de l'autre sens, entre les deux quais. */}
      <mesh position={[otherTrackX, PLATFORM_TOP - 1.32, 0]} material={s.ballast}>
        <boxGeometry args={[TRACK_HALF * 2, 0.42, len]} />
      </mesh>
      {[-1, 1].map((d) => (
        <mesh key={`or${d}`} position={[otherTrackX + d * GAUGE_HALF, -1.11, 0]} material={s.rail}>
          <boxGeometry args={[0.08, 0.16, len]} />
        </mesh>
      ))}

      {/* --- Le bâtiment de 2020, par-dessus notre mur de fond ------------ */}
      {/* Façade vitrée continue : montants blancs serrés, verre entre eux. */}
      <mesh position={[backX + 0.24, PLATFORM_TOP + 4.6, 0]} material={s.pane}>
        <boxGeometry args={[0.12, 6.4, len * 0.62]} />
      </mesh>
      {bays(len, 3.4, -0.31, 0.31).map((z) => (
        <mesh key={`mu${z}`} position={[backX + 0.3, PLATFORM_TOP + 4.6, z]} material={s.white}>
          <boxGeometry args={[0.16, 6.4, 0.16]} />
        </mesh>
      ))}
      {/* Hall du niveau supérieur : un volume clair posé sur la façade, côté
          Omote-sandō. C'est lui qu'on aperçoit en levant les yeux. */}
      <mesh position={[backX + 3.4, PLATFORM_TOP + 8.4, -len * 0.3]} material={s.white}>
        <boxGeometry args={[7.4, 3.6, len * 0.26]} />
      </mesh>
      <mesh position={[backX + 0.2, PLATFORM_TOP + 8.4, -len * 0.3]} material={s.pane}>
        <boxGeometry args={[0.1, 2.8, len * 0.24]} />
      </mesh>

      {/* --- Le Meiji-jingū : la masse d'arbres derrière le bâtiment ------ */}
      {bays(len, 26).map((z, k) => (
        <mesh
          key={`g${z}`}
          position={[backX + 12 + (k % 2) * 3, PLATFORM_TOP + 5.5 + (k % 3), z]}
          material={s.grove}
        >
          <boxGeometry args={[13, 11 + (k % 3) * 2, 24]} />
        </mesh>
      ))}
    </group>
  );
}
