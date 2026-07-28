// Abords immédiats de la voie : ballast, emprise urbaine au sol, portiques
// caténaires et arbres défilants.
//
// Ce fichier portait aussi le ciel et les trois couches d'immeubles peints. Les
// deux sont partis :
//   · le ciel et la ligne d'horizon vivent dans three/city/SkyDome, en une
//     seule passe posée à l'infini ;
//   · la ville est devenue un volume — three/city/CityRibbon — bâti dans le
//     monde et non plus glissé par `texture.offset`.
//
// Ce qui reste ici défile en GÉOMÉTRIE (recyclage en z par `runtime.distance`),
// exactement comme avant : ce sont les vrais vendeurs de vitesse.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../systems/runtime';
import { segEnv } from '../systems/segmentEnv';
import { hiddenByStation, sidePush } from '../systems/stationOcclusion';
import { makeGroundTexture } from '../textures/procedural';
import { GROUND_TILE, makeCityGroundTexture } from '../textures/city';

/** Longueur des plans au sol : la vue en biais vers le fond du wagon porte loin. */
const PLANE_LEN = 460;
/**
 * Largeur de l'emprise urbaine au sol. Elle allait jusqu'à 160 m d'un seul
 * aplat clair ; elle porte maintenant un tissu de parcelles et court au-delà du
 * dernier rang de bâtiments (66 m + profondeur), assez loin pour que ce soit la
 * brume, et non un bord franc, qui en marque la fin.
 */
const GROUND_WIDTH = 320;

export function Scenery() {
  const built = useMemo(() => {
    const groundTex = makeGroundTexture();
    groundTex.repeat.set(2, 24);
    const gm = new THREE.MeshBasicMaterial({ map: groundTex, fog: true, color: '#d6d4ce' });
    // Le sol urbain est ÉCLAIRÉ, comme la ville qu'il porte : il se dore à
    // l'heure dorée et s'éteint la nuit, au lieu de rester un aplat constant.
    const cityGroundTex = makeCityGroundTexture();
    cityGroundTex.repeat.set(GROUND_WIDTH / GROUND_TILE, PLANE_LEN / GROUND_TILE);
    const cgm = new THREE.MeshLambertMaterial({ map: cityGroundTex, fog: true });
    return { gm, cgm };
  }, []);

  // Poteaux caténaires et arbres qui défilent : les vrais vendeurs de vitesse.
  const poles = useRef<(THREE.Group | null)[]>([]);
  const POLE_COUNT = 8;
  const POLE_SPACING = 30;
  const trees = useRef<(THREE.Group | null)[]>([]);
  const TREE_COUNT = 12;
  const TREE_SPACING = 21;

  // Arbres boules (esprit Shashingo) : tronc + deux masses de feuillage.
  // (Défini avant le useFrame, qui module leur échelle selon le tronçon.)
  const treeSpecs = useMemo(
    () =>
      Array.from({ length: TREE_COUNT }, (_, i) => ({
        x: (i % 2 === 0 ? 1 : -1) * (7.2 + ((i * 13) % 5) * 0.5),
        scale: 0.85 + ((i * 29) % 10) / 22,
        leaf: ['#5fb54a', '#6ec25a', '#54a844'][i % 3],
      })),
    [],
  );

  useFrame(() => {
    // --- Sol défilant ---
    const g = built.gm.map;
    if (g) g.offset.y = runtime.distance / 10;
    const cg = built.cgm.map;
    if (cg) cg.offset.y = runtime.distance / GROUND_TILE;

    // --- Portiques et arbres défilants ---
    // Un mât de portique tombe à x = ±5.2, en plein milieu du quai : dans
    // l'emprise de la gare, le portique s'efface (la caténaire y est portée
    // par la charpente de l'auvent, comme en vrai).
    const span = POLE_COUNT * POLE_SPACING;
    for (let i = 0; i < POLE_COUNT; i++) {
      const pl = poles.current[i];
      if (!pl) continue;
      const z = ((runtime.distance + i * POLE_SPACING) % span) - span / 2;
      pl.position.z = z;
      pl.visible = !hiddenByStation(z);
    }
    const treeSpan = TREE_COUNT * TREE_SPACING;
    const treeScale = 1 + 0.18 * segEnv.green; // végétation renforcée (greenery)
    const treesVisible = segEnv.w.trench < 0.5; // pas d'arbres entre les murs
    for (let i = 0; i < TREE_COUNT; i++) {
      const t = trees.current[i];
      if (!t) continue;
      const spec = treeSpecs[i];
      const side = spec.x >= 0 ? 1 : -1;
      t.visible = treesVisible;
      t.scale.setScalar(spec.scale * treeScale);
      t.position.x = spec.x + side * sidePush(side);
      t.position.z = ((runtime.distance * 0.999 + i * TREE_SPACING + 9) % treeSpan) - treeSpan / 2;
    }
  });

  return (
    <group>
      {/* Arbres boules défilants le long de la voie */}
      {treeSpecs.map((spec, i) => (
        <group
          key={`tree${i}`}
          ref={(gr) => {
            trees.current[i] = gr;
          }}
          position={[spec.x, -1.1, 0]}
          scale={spec.scale}
        >
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.14, 0.2, 2.2, 8]} />
            <meshStandardMaterial color="#7a5c42" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.9, 0]} scale={[1, 0.88, 1]}>
            <sphereGeometry args={[1.35, 14, 12]} />
            <meshStandardMaterial color={spec.leaf} roughness={0.85} />
          </mesh>
          <mesh position={[0.7, 2.2, 0.3]} scale={[1, 0.8, 1]}>
            <sphereGeometry args={[0.8, 12, 10]} />
            <meshStandardMaterial color="#74c85a" roughness={0.85} />
          </mesh>
        </group>
      ))}

      {/* Portiques caténaires défilants */}
      {Array.from({ length: POLE_COUNT }, (_, i) => (
        <group
          key={`pole${i}`}
          ref={(gr) => {
            poles.current[i] = gr;
          }}
        >
          {([-1, 1] as const).map((s) => (
            <mesh key={`pl${s}`} position={[s * 5.2, 2.2, 0]}>
              <cylinderGeometry args={[0.09, 0.11, 7, 8]} />
              <meshStandardMaterial color="#4a4f55" roughness={0.7} metalness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, 5.4, 0]}>
            <boxGeometry args={[10.6, 0.14, 0.14]} />
            <meshStandardMaterial color="#4a4f55" roughness={0.7} metalness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Sol extérieur : bande de ballast étroite sous le train */}
      <mesh position={[0, -1.15, 0]} rotation={[-Math.PI / 2, 0, 0]} material={built.gm}>
        <planeGeometry args={[9, PLANE_LEN]} />
      </mesh>
      {/* Tissu urbain au sol : parcelles, cours, ruelles — ce sur quoi le
          ruban de bâtiments est posé, et ce qu'on voit dans ses trouées. */}
      <mesh position={[0, -1.18, 0]} rotation={[-Math.PI / 2, 0, 0]} material={built.cgm}>
        <planeGeometry args={[GROUND_WIDTH, PLANE_LEN]} />
      </mesh>
    </group>
  );
}
