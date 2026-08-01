// La marchandise d'une boutique, en deux appels de rendu.
//
// `shopKit.fillShelf` range les articles ; ce composant les POSE. La séparation
// tient à une chose : le rangement d'un linéaire est de l'arithmétique - des
// bornes, des facings, des entre-étages - et il se relit, se teste et se
// partage entre le konbini et le kiosque sans qu'aucun des deux ait à savoir
// comment on déclare un InstancedMesh.
//
// DEUX FAMILLES, DEUX MAILLAGES. Le prisme (briques, paquets, boîtes) et le
// révolutionné (canettes, bouteilles, pots). Un konbini garni compte huit cents
// à mille exemplaires ; en maillages séparés par article, c'eût été mille
// appels de rendu pour une gare. Ici, deux - et le nombre d'articles n'y change
// rien.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useInstanceColors, useInstances } from './instancing';
import { ofShape, shopPool, type Good } from './shopKit';

export function Goods({ goods, name }: { goods: Good[]; name: string }) {
  const p = shopPool();
  const boxes = useMemo(() => ofShape(goods, 'box'), [goods]);
  const round = useMemo(() => ofShape(goods, 'round'), [goods]);
  const boxRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);
  useInstances(boxRef, useMemo(() => boxes.map((g) => g.m), [boxes]));
  useInstanceColors(boxRef, useMemo(() => boxes.map((g) => g.color), [boxes]));
  useInstances(roundRef, useMemo(() => round.map((g) => g.m), [round]));
  useInstanceColors(roundRef, useMemo(() => round.map((g) => g.color), [round]));

  return (
    <group name={name}>
      <instancedMesh
        ref={boxRef}
        args={[undefined, undefined, Math.max(1, boxes.length)]}
        material={p.goods}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {/* Rayon 0,5 : le cylindre unitaire a alors un DIAMÈTRE de 1, et les
          échelles se lisent comme des largeurs, exactement comme pour la
          boîte. Dix pans - à quinze centimètres de haut et vu de face, un
          douzième pan ne se voit sur aucun écran. */}
      <instancedMesh
        ref={roundRef}
        args={[undefined, undefined, Math.max(1, round.length)]}
        material={p.goods}
      >
        <cylinderGeometry args={[0.5, 0.5, 1, 10]} />
      </instancedMesh>
    </group>
  );
}
