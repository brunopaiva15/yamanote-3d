// JY21 恵比寿 - la gare avalée par son centre commercial.
//
// Ebisu est un quai de viaduc coiffé du complexe Atre : un bâtiment entier
// enjambe les voies, et depuis le quai on ne voit pas le ciel mais une
// sous-face de dalle, des poutres et des halls éclairés au-dessus. À une
// extrémité, la longue passerelle couverte part vers Ebisu Garden Place.
//
// L'arche de Garden Place elle-même est déjà dans le décor de quartier
// (three/Landmarks) : ici, c'est la passerelle qui y mène.

import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { bays, siteCut, useSigMaterials, type SigProps } from './kit';

/** Part de la longueur du quai couverte par le complexe. */
const BUILT = 0.46;

export function Ebisu({ layout, place }: SigProps) {
  const { outerX, oppBackX } = siteCut(place);
  const top = layout.canopyY;
  const x0 = PSD_X - 0.6;
  const x1 = oppBackX + 0.6;
  const midX = (x0 + x1) / 2;
  const span = x1 - x0;
  const built = layout.length * BUILT;
  /** Sous-face de la dalle du complexe. */
  const soffit = top + 1.3;

  const s = useSigMaterials(
    () => ({
      // Sous-face de dalle : claire mais mate, elle ne renvoie rien.
      soffit: new THREE.MeshStandardMaterial({
        color: '#b9b6ae',
        roughness: 0.95,
        emissive: '#8e8b83',
        emissiveIntensity: 0.22,
      }),
      beam: new THREE.MeshStandardMaterial({ color: '#8f8d86', roughness: 0.86 }),
      // Vitrines des halls supérieurs : c'est la seule lumière franche du lieu.
      shopfront: new THREE.MeshStandardMaterial({
        color: '#ffeec8',
        emissive: '#ffe3a8',
        emissiveIntensity: 0.8,
        roughness: 0.4,
      }),
      wall: new THREE.MeshStandardMaterial({ color: '#a8a49a', roughness: 0.9 }),
    }),
    [],
  );

  return (
    <group>
      {/* La dalle du complexe, qui enjambe le quai et les voies. */}
      <mesh position={[midX, soffit + 0.45, -layout.length * 0.16]} material={s.soffit}>
        <boxGeometry args={[span, 0.9, built]} />
      </mesh>
      {/* Poutres transversales sous la dalle : la trame qu'on a sur la tête. */}
      {bays(built, 6).map((z) => (
        <mesh
          key={`b${z}`}
          position={[midX, soffit - 0.22, z - layout.length * 0.16]}
          material={s.beam}
        >
          <boxGeometry args={[span, 0.44, 0.36]} />
        </mesh>
      ))}
      {/* Descentes de charge : au droit de l'épine et du fond de la travée.
          Leur trame vient du plan (data/stationLayouts), qui les écarte des
          escaliers mécaniques, des potences et de la bande directionnelle -
          l'une d'elles se plantait en plein milieu d'un escalier mécanique. */}
      {(layout.sigPlan?.posts ?? []).map(({ z }) =>
        [place.backX, oppBackX].map((x) => (
          <mesh
            key={`c${x}-${z}`}
            position={[x, PLATFORM_TOP + (soffit - PLATFORM_TOP) / 2, z]}
            material={s.wall}
          >
            <boxGeometry args={[0.44, soffit - PLATFORM_TOP, 0.44]} />
          </mesh>
        )),
      )}
      {/* Vitrines du niveau supérieur, visibles par-dessus le garde-corps. */}
      <mesh position={[oppBackX + 0.5, soffit + 1.9, -layout.length * 0.16]} material={s.shopfront}>
        <boxGeometry args={[0.16, 2, built - 6]} />
      </mesh>

      {/* La passerelle couverte vers Garden Place : elle quitte la gare par une
          extrémité et s'en va au-dessus de la ville. On n'en modélise que la
          première portée - l'arche de Garden Place, à laquelle elle mène, est
          déjà dans le décor de quartier, plus loin. */}
      <group position={[0, 0, layout.length * 0.4]}>
        <mesh position={[oppBackX + 5, soffit + 0.6, 0]} material={s.wall}>
          <boxGeometry args={[10, 0.5, 4.4]} />
        </mesh>
        <mesh position={[oppBackX + 5, soffit + 1.75, 0]} material={s.shopfront}>
          <boxGeometry args={[9.4, 1.7, 4]} />
        </mesh>
        <mesh position={[oppBackX + 5, soffit + 2.8, 0]} material={s.soffit}>
          <boxGeometry args={[10, 0.4, 4.8]} />
        </mesh>
        {/* Piles de la passerelle, hors de toute voie. */}
        {[1.6, 8.4].map((d) => (
          <mesh key={d} position={[oppBackX + d, PLATFORM_TOP + (soffit - PLATFORM_TOP) / 2, 0]} material={s.wall}>
            <boxGeometry args={[0.7, soffit - PLATFORM_TOP + 1.2, 0.7]} />
          </mesh>
        ))}
      </group>

      {/* Au-delà du bâti, le quai retrouve son auvent : le contraste entre les
          deux moitiés est ce qu'on remarque en marchant vers l'est. Le rail
          court SOUS les poutres transversales, qu'il traversait à leur cote. */}
      <mesh position={[outerX - 0.9, top - 0.26, layout.length * 0.22]} material={s.beam}>
        <boxGeometry args={[0.34, 0.24, layout.length * 0.3]} />
      </mesh>
    </group>
  );
}
