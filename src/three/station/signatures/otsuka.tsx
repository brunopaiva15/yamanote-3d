// JY12 大塚 — le quai aérien à toiture centrale.
//
// Ōtsuka n'est couverte qu'en son milieu : une toiture à deux pentes coiffe la
// partie centrale du quai, et les deux extrémités restent à ciel ouvert. C'est
// ce qui la distingue de toutes les autres gares aériennes de la boucle, où
// l'auvent court d'un bout à l'autre — et ce qui explique qu'on y sente la
// rue, immédiatement en dessous, bien plus qu'ailleurs.
//
// Le tram Arakawa, lui, est déjà dans le décor de quartier (three/Landmarks) :
// il n'a pas à être dessiné deux fois.

import * as THREE from 'three';
import { PSD_X } from '../../../data/stationGeometry';
import { bays, siteCut, useSigMaterials, type SigProps } from './kit';

/** Part de la longueur du quai réellement couverte. */
const COVERED = 0.54;
/** Pente de la toiture centrale. */
const PITCH = 0.3;

export function Otsuka({ layout, place, m }: SigProps) {
  const { outerX } = siteCut(place);
  const top = layout.canopyY;
  const x0 = PSD_X - 0.5;
  const x1 = outerX + 0.5;
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;
  const half = span / 2;
  const rise = half * Math.tan(PITCH);
  const covered = layout.length * COVERED;

  const s = useSigMaterials(
    () => ({
      roof: new THREE.MeshStandardMaterial({
        color: '#8b9096',
        roughness: 0.84,
        metalness: 0.22,
        emissive: '#6e7378',
        emissiveIntensity: 0.24,
      }),
      purlin: new THREE.MeshStandardMaterial({ color: '#6d7378', roughness: 0.6, metalness: 0.4 }),
    }),
    [],
  );

  return (
    <group>
      {/* Les deux versants de la toiture centrale. */}
      {[-1, 1].map((d) => (
        <mesh
          key={d}
          position={[midX + d * half * 0.5, top + 0.42 + rise / 2, 0]}
          rotation={[0, 0, -d * PITCH]}
          material={s.roof}
        >
          <boxGeometry args={[half / Math.cos(PITCH), 0.16, covered]} />
        </mesh>
      ))}
      {/* Faîtière, et pannes d'égout au droit de chaque bord de quai. */}
      <mesh position={[midX, top + 0.34 + rise, 0]} material={s.purlin}>
        <boxGeometry args={[0.34, 0.3, covered]} />
      </mesh>
      {[x0 + 0.4, x1 - 0.4].map((x) => (
        <mesh key={x} position={[x, top + 0.44, 0]} material={s.purlin}>
          <boxGeometry args={[0.3, 0.26, covered]} />
        </mesh>
      ))}

      {/* Fermes légères sous les versants : c'est tout ce qui tient la toiture,
          et on les voit puisqu'il n'y a pas de faux plafond. */}
      {bays(covered, 8).map((z) => (
        <group key={`f${z}`} position={[0, 0, z]}>
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[midX + d * half * 0.5, top + 0.28 + rise / 2, 0]}
              rotation={[0, 0, -d * PITCH]}
              material={s.purlin}
            >
              <boxGeometry args={[half / Math.cos(PITCH), 0.1, 0.14]} />
            </mesh>
          ))}
          <mesh position={[midX, top + 0.16, 0]} material={s.purlin}>
            <boxGeometry args={[span * 0.94, 0.12, 0.16]} />
          </mesh>
        </group>
      ))}

      {/* Pignons : les deux bouts de la toiture se ferment, et c'est là que le
          quai s'ouvre franchement sur le ciel. */}
      {[-1, 1].map((d) => (
        <mesh key={`g${d}`} position={[midX, top + 0.5 + rise / 2, d * covered / 2]} material={s.roof}>
          <boxGeometry args={[span * 0.9, rise, 0.14]} />
        </mesh>
      ))}

      {/* Éclairage seulement sous la partie couverte : ailleurs, c'est le jour.
          Le bandeau court SOUS les poutres et EN RETRAIT de l'épine : posé sur
          l'axe, il traversait la bande directionnelle, ses suspentes et les
          plaques d'accès ; à 1,6 m, c'était l'horloge qu'il trouvait. */}
      <mesh position={[place.backX - 2.23, top - 0.215, 0]} material={m.lamp}>
        <boxGeometry args={[0.5, 0.07, covered - 3]} />
      </mesh>
    </group>
  );
}
