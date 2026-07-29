// Poser des matrices sur un InstancedMesh, sans y penser.
//
// Ces trois helpers vivaient dans Station.tsx, où ils suffisaient tant qu'un
// seul fichier instanciait quelque chose. La trousse de quai (PlatformKit) en a
// besoin des mêmes : diffuseurs, extincteurs, bornes et descentes d'eau se
// répètent tous sur deux cent vingt mètres, et aucun ne mérite un appel de
// rendu par exemplaire.

import { useLayoutEffect } from 'react';
import * as THREE from 'three';

const UP = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

/** Quart de tour vers -x : un plan (dressé en XY) regarde alors la voie. */
export const FACING_TRACK = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  -Math.PI / 2,
);

/** Quart de tour vers +x : le plan regarde le fond du quai. */
export const FACING_BACK = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI / 2,
);

/** Rabattu à l'horizontale, face vers le bas : sous-face d'auvent. */
export const FACING_DOWN = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2,
);

export function mat(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V.set(x, y, z), UP, S.set(sx, sy, sz));
}

/** Comme mat(), pour un plan orienté par un des quaternions ci-dessus. */
export function matFacing(
  q: THREE.Quaternion,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V.set(x, y, z), q, S.set(width, height, 1));
}

/** Comme mat(), pour un plan plaqué sur une face tournée vers la voie. */
export function matFacingTrack(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
): THREE.Matrix4 {
  return matFacing(FACING_TRACK, x, y, z, width, height);
}

/** Pose une liste de matrices sur un InstancedMesh et ajuste son compte. */
export function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  matrices: THREE.Matrix4[],
): void {
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
    im.count = matrices.length;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [ref, matrices]);
}

/**
 * Teinte par exemplaire, sur un InstancedMesh dont le matériau reste blanc :
 * la caisse d'un distributeur est la même tôle d'une machine à l'autre, mais
 * jamais la même peinture. Sans cela il faudrait un appel de rendu par marque.
 */
export function useInstanceColors(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  colors: THREE.Color[],
): void {
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    for (let i = 0; i < colors.length; i++) im.setColorAt(i, colors[i]);
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [ref, colors]);
}

/** Comme mat(), mais orientée : pour une boîte inclinée (panneau, ferme, rampe). */
export function matOriented(
  q: THREE.Quaternion,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V.set(x, y, z), q, S.set(sx, sy, sz));
}

/** Quaternion d'une rotation autour de l'axe z : l'inclinaison d'un versant. */
export function tiltZ(angle: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
}

/**
 * Versant incliné PUIS plié : la pente autour de z, le pli autour de x.
 *
 * L'ordre compte, et il est celui-là — on incline d'abord le pan dans la coupe
 * (c'est la pente du toit), puis on le bascule le long de la voie (c'est le
 * pli). Composé dans l'autre sens, le pli se mesurerait dans le plan déjà
 * incliné et les arêtes de deux pans voisins ne se rejoindraient plus.
 */
export function tiltXZ(pitch: number, fold: number): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fold);
  return q.multiply(tiltZ(pitch));
}
