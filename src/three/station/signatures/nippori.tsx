// JY07 日暮里 — l'immense corridor ferroviaire.
//
// Ce qui fait Nippori n'est pas un bâtiment, c'est une largeur : un faisceau de
// voies JR, Keisei et Nippori–Toneri, et de grands ponts-concours qui
// l'enjambent d'un seul tenant. Depuis le quai on ne voit pas un mur mais une
// perspective — des rails jusqu'au bord du champ, et par-dessus, la sous-face
// d'une passerelle.

import * as THREE from 'three';
import { PLATFORM_TOP } from '../../../data/stationGeometry';
import { siteCut, useSigMaterials, type SigProps } from './kit';

/** Altitude de la sous-face des ponts-concours. */
const BRIDGE_SOFFIT = 5.1;
/**
 * Portée des ponts-concours : ils enjambent le faisceau que `openFarSide`
 * dessine dans le fond de quai, plus une marge de chaque côté.
 */
const YARD_REACH = 4 * 4.6 + 2;

export function Nippori({ layout, place }: SigProps) {
  const { oppBackX } = siteCut(place);
  const len = layout.length;

  const s = useSigMaterials(
    () => ({
      deck: new THREE.MeshStandardMaterial({ color: '#585e62', roughness: 0.9 }),
      soffit: new THREE.MeshStandardMaterial({
        color: '#464c50',
        roughness: 0.95,
        emissive: '#32373a',
        emissiveIntensity: 0.16,
      }),
      parapet: new THREE.MeshStandardMaterial({ color: '#c3c6c0', roughness: 0.88 }),
    }),
    [],
  );

  /** Bord extérieur du faisceau. */
  const yardEnd = oppBackX + YARD_REACH;

  return (
    <group>
      {/* Ponts-concours : deux tabliers qui enjambent tout le faisceau, et dont
          on ne voit d'en bas que la sous-face et les parapets. */}
      {[-len * 0.26, len * 0.17].map((z) => (
        <group key={`b${z}`} position={[0, 0, z]}>
          <mesh position={[(0 + yardEnd) / 2, BRIDGE_SOFFIT + 0.4, 0]} material={s.deck}>
            <boxGeometry args={[yardEnd + 6, 0.8, 7]} />
          </mesh>
          <mesh position={[(0 + yardEnd) / 2, BRIDGE_SOFFIT - 0.06, 0]} material={s.soffit}>
            <boxGeometry args={[yardEnd + 5.6, 0.12, 6.6]} />
          </mesh>
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[(0 + yardEnd) / 2, BRIDGE_SOFFIT + 1.4, d * 3.4]}
              material={s.parapet}
            >
              <boxGeometry args={[yardEnd + 6, 1.2, 0.28]} />
            </mesh>
          ))}
          {/* Poutres longitudinales sous le tablier. */}
          {[-2.2, 2.2].map((dz) => (
            <mesh
              key={`g${dz}`}
              position={[(0 + yardEnd) / 2, BRIDGE_SOFFIT - 0.42, dz]}
              material={s.deck}
            >
              <boxGeometry args={[yardEnd + 5, 0.62, 0.5]} />
            </mesh>
          ))}
          {/* Appui sur le quai d'en face : une pile, hors de toute voie. */}
          <mesh position={[oppBackX - 1.2, (BRIDGE_SOFFIT - PLATFORM_TOP) / 2, 0]} material={s.deck}>
            <boxGeometry args={[0.9, BRIDGE_SOFFIT - PLATFORM_TOP, 1.4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
