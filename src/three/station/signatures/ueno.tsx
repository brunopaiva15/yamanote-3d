// JY05 上野 - la halle rivetée, et son ouverture au nord.
//
// Ueno n'est pas couverte d'un bout à l'autre : la moitié sud disparaît sous
// les anciennes charpentes et les bâtiments, la moitié nord s'ouvre sur le
// faisceau et le ciel. C'est ce contraste - la longue perspective sombre qui
// débouche d'un coup - qui fait la gare, bien plus que le détail des fermes.

import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { bays, siteCut, useSigMaterials, type SigProps } from './kit';
import * as THREE from 'three';

/** Entraxe des fermes de la halle (m). */
const TRUSS = 18;

export function Ueno({ layout, place, m }: SigProps) {
  const { oppBackX } = siteCut(place);
  const top = layout.canopyY;
  const x0 = PSD_X - 1;
  const x1 = oppBackX + 1;
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;
  /** Faîte de la halle. */
  const crown = top + 3.6;

  const s = useSigMaterials(
    () => ({
      truss: new THREE.MeshStandardMaterial({ color: '#535b58', roughness: 0.8, metalness: 0.36 }),
      deck: new THREE.MeshStandardMaterial({
        color: '#3c4442',
        roughness: 0.94,
        emissive: '#2a302f',
        emissiveIntensity: 0.18,
      }),
      gable: new THREE.MeshStandardMaterial({ color: '#6e716b', roughness: 0.92 }),
    }),
    [],
  );

  // La halle ne couvre que la moitié sud. Au-delà, plus rien : c'est
  // l'ouverture vers Uguisudani et les voies terminales.
  const trussZ = bays(layout.length, TRUSS, -0.5, 0.04);

  return (
    <group>
      {/* Couverture de la halle, entre les fermes. */}
      <mesh position={[midX, crown + 0.2, -layout.length * 0.23]} material={s.deck}>
        <boxGeometry args={[span, 0.22, layout.length * 0.54]} />
      </mesh>

      {trussZ.map((z) => (
        <group key={`t${z}`} position={[0, 0, z]}>
          {/* Membrures inférieure et supérieure. */}
          <mesh position={[midX, crown - 1.5, 0]} material={s.truss}>
            <boxGeometry args={[span, 0.2, 0.34]} />
          </mesh>
          <mesh position={[midX, crown, 0]} material={s.truss}>
            <boxGeometry args={[span, 0.24, 0.34]} />
          </mesh>
          {/* Treillis : diagonales alternées entre les deux membrures. */}
          {[-4, -2.4, -0.8, 0.8, 2.4, 4].map((k) => (
            <mesh
              key={k}
              position={[midX + k * (span / 10), crown - 0.75, 0]}
              rotation={[0, 0, k % 2 === 0 ? 0.62 : -0.62]}
              material={s.truss}
            >
              <boxGeometry args={[0.11, 1.8, 0.22]} />
            </mesh>
          ))}
          {/* Poteaux de rive, jusqu'au sol, un par bord de site. */}
          {[x0 + 0.5, x1 - 0.5].map((x) => (
            <mesh
              key={x}
              position={[x, PLATFORM_TOP + (crown - PLATFORM_TOP) / 2, 0]}
              material={s.truss}
            >
              <boxGeometry args={[0.46, crown - PLATFORM_TOP, 0.46]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Pignon de bout de halle : le mur qui ferme la partie couverte, et
          contre lequel bute la perspective quand on regarde vers le sud. */}
      <mesh position={[midX, crown - 1.4, layout.length * 0.04]} material={s.gable}>
        <boxGeometry args={[span, 2.8, 0.4]} />
      </mesh>

      {/* Bandeau lumineux sous la halle : la moitié couverte reste éclairée.
          Il court SOUS les poutres et EN RETRAIT de l'épine - sur l'axe, il
          traversait les gaines d'escalier mécanique, la bande directionnelle
          et les suspentes des plaques d'accès ; à 1,6 m, c'était l'horloge et
          les suspentes du panneau 番線 ; à 2,23 m, celles des potences. Le
          créneau libre est à 3,15 m, au-dessus de l'allée côté voie. */}
      <mesh position={[place.backX - 3.15, top - 0.215, -layout.length * 0.23]} material={m.lamp}>
        <boxGeometry args={[0.6, 0.08, layout.length * 0.5]} />
      </mesh>
    </group>
  );
}
