// JY29 新橋 — la gare de bureaux sous son vieux viaduc.
//
// Shimbashi tient de Yūrakuchō par l'ouvrage — même acier ancien, même
// couverture dense — mais elle est bien plus large : huit voies parallèles sous
// la même charpente, et c'est le faisceau (`openFarSide`) qui le donne à voir.
// Ce qui lui est propre, c'est la couverture CONTINUE qui court par-dessus
// tout ce faisceau, portée par des fermes en treillis qui enjambent les voies
// d'un seul tenant — là où Yūrakuchō n'a que des portiques au-dessus du quai.
//
// Les tours de Shiodome sont déjà dans le décor de quartier, et la locomotive
// de la place aussi (three/Landmarks) : rien à redessiner ici.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { mat, useInstances } from '../instancing';
import { siteCut, useSigMaterials, type SigProps } from './kit';

/** Portée du faisceau au-delà du quai d'en face — cf. Station.tsx. */
const YARD_REACH = 4 * 4.6;

export function Shimbashi({ layout, place }: SigProps) {
  const { oppBackX } = siteCut(place);
  const top = layout.canopyY;
  const x0 = PSD_X - 0.8;
  const x1 = oppBackX + YARD_REACH + 0.8;
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;
  /** Faîte de la couverture générale, au-dessus de l'auvent de quai. */
  const crown = top + 2.4;

  const s = useSigMaterials(
    () => ({
      steel: new THREE.MeshStandardMaterial({ color: '#464f4d', roughness: 0.86, metalness: 0.34 }),
      deck: new THREE.MeshStandardMaterial({
        color: '#3a4240',
        roughness: 0.95,
        emissive: '#2a302f',
        emissiveIntensity: 0.16,
      }),
      brick: new THREE.MeshStandardMaterial({
        color: '#7f5a48',
        roughness: 0.94,
        emissive: '#553a2e',
        emissiveIntensity: 0.12,
      }),
    }),
    [],
  );

  // La trame des fermes vient du plan (data/stationLayouts) : c'est lui qui
  // écarte les poteaux d'épine des accès, du kiosque, des potences et de la
  // bande directionnelle — et que mobilier et caissons consultent en retour.
  const trussZ = useMemo(
    () => (layout.sigPlan?.posts ?? []).map((p) => p.z),
    [layout.sigPlan],
  );

  // Poteaux : au droit de l'épine, du fond du quai d'en face et du bout du
  // faisceau. Jamais dans une voie, jamais dans un passage.
  const postX = useMemo(() => [place.backX, oppBackX, x1 - 0.8], [place.backX, oppBackX, x1]);
  const posts = useMemo(
    () =>
      trussZ.flatMap((z) =>
        postX.map((x) =>
          mat(x, PLATFORM_TOP + (crown - PLATFORM_TOP) / 2, z, 0.42, crown - PLATFORM_TOP, 0.42),
        ),
      ),
    [trussZ, postX, crown],
  );
  const bases = useMemo(
    () => trussZ.flatMap((z) => postX.map((x) => mat(x, PLATFORM_TOP + 0.6, z, 0.6, 1.2, 0.6))),
    [trussZ, postX],
  );
  const postRef = useRef<THREE.InstancedMesh>(null);
  const baseRef = useRef<THREE.InstancedMesh>(null);
  useInstances(postRef, posts);
  useInstances(baseRef, bases);

  return (
    <group>
      {/* Couverture générale : elle court sur tout le faisceau, pas seulement
          sur le quai. C'est ce qui fait qu'à Shimbashi on ne voit jamais le
          ciel, quel que soit l'endroit où l'on regarde. */}
      <mesh position={[midX, crown + 0.2, 0]} material={s.deck}>
        <boxGeometry args={[span, 0.22, layout.length - 2]} />
      </mesh>

      {trussZ.map((z) => (
        <group key={`t${z}`} position={[0, 0, z]}>
          <mesh position={[midX, crown - 1.2, 0]} material={s.steel}>
            <boxGeometry args={[span, 0.18, 0.3]} />
          </mesh>
          <mesh position={[midX, crown, 0]} material={s.steel}>
            <boxGeometry args={[span, 0.22, 0.3]} />
          </mesh>
          {/* Treillis entre les deux membrures. */}
          {[-5, -3, -1, 1, 3, 5].map((k) => (
            <mesh
              key={k}
              position={[midX + k * (span / 12), crown - 0.6, 0]}
              rotation={[0, 0, k % 2 === 0 ? 0.6 : -0.6]}
              material={s.steel}
            >
              <boxGeometry args={[0.1, 1.5, 0.2]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Poteaux et socles de brique : l'ouvrage a cent ans, et cela se voit
          par le bas bien plus que par le haut. */}
      <instancedMesh ref={postRef} args={[undefined, undefined, Math.max(1, posts.length)]} material={s.steel}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={baseRef} args={[undefined, undefined, Math.max(1, bases.length)]} material={s.brick}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </group>
  );
}
