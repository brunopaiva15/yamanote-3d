// Ombres portées du soleil : les matériaux transparents (vitres, vitrages de
// quai) ne projettent pas, les matériaux non éclairés (ville, ciel, écrans)
// sont ignorés.
//
// Scene applique cette passe à toute la scène au montage, une seule fois. Toute
// géométrie construite hors React après coup (idiome des builders type
// HubStationRoof, gare, extérieur de rame) doit l'appeler elle-même, sinon elle
// ne projette ni ne reçoit d'ombre.

import * as THREE from 'three';

export function applyShadowFlags(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Refus explicite : ce dont l'ombre tombe là où personne ne regarde - le
    // ballast, la plate-forme - mais qui serait sinon dessiné deux fois.
    if (mesh.userData.noShadow) return;
    const mat = mesh.material as THREE.Material;
    if (mat instanceof THREE.MeshStandardMaterial) {
      mesh.receiveShadow = true;
      if (!mat.transparent) mesh.castShadow = true;
    }
  });
}
