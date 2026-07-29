// Laisse : le seul lien qui fait lire « quelqu'un promène son chien » plutôt
// que « un chien passe à côté de quelqu'un ». C'est un tube fin reconstruit
// EN PLACE chaque image entre la main du promeneur et le collier — pas une
// ligne (une LineBasicMaterial fait toujours un pixel, quelle que soit la
// distance : à trois mètres c'est un cheveu, à trente c'est une corde).
//
// La sangle PEND : sa flèche est proportionnelle au mou, c'est-à-dire à ce
// qu'il reste de longueur une fois la distance main → collier retirée. Une
// laisse tendue est une ligne droite, une laisse lâche fait un ventre — et
// c'est exactement ce qu'on lit d'un chien qui tire ou qui suit.

import * as THREE from 'three';

/** Segments le long de la sangle (la flèche doit être ronde, pas polygonale). */
const SEGMENTS = 12;
/** Côtés de la section : un tube de 8 mm n'a pas besoin de plus. */
const SIDES = 4;
const RADIUS = 0.006;

export interface Leash {
  mesh: THREE.Mesh;
  /** Longueur totale de la sangle, en mètres. */
  length: number;
}

function buildGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const count = (SEGMENTS + 1) * SIDES;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      const c = a + SIDES;
      const d = b + SIDES;
      index.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(index);
  // Les bornes ne servent à rien ici (la sangle bouge à chaque image) et un
  // culling par frustum la ferait clignoter quand le chien sort du champ.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  return geo;
}

export function makeLeash(color: string, length: number): Leash {
  const mesh = new THREE.Mesh(
    buildGeometry(),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  return { mesh, length };
}

export function setLeashColor(leash: Leash, color: string): void {
  (leash.mesh.material as THREE.MeshStandardMaterial).color.set(color);
}

const vFrom = new THREE.Vector3();
const vTo = new THREE.Vector3();
const vPrev = new THREE.Vector3();
const vCur = new THREE.Vector3();
const vNext = new THREE.Vector3();
const vTan = new THREE.Vector3();
const vSideA = new THREE.Vector3();
const vSideB = new THREE.Vector3();
const vRad = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FALLBACK = new THREE.Vector3(1, 0, 0);

/** Point de la sangle à l'abscisse u, flèche `sag` au milieu. */
function pointAt(from: THREE.Vector3, to: THREE.Vector3, u: number, sag: number, out: THREE.Vector3): THREE.Vector3 {
  out.lerpVectors(from, to, u);
  out.y -= sag * 4 * u * (1 - u);
  return out;
}

/**
 * Reconstruit la sangle entre deux points (repère du groupe parent). Les
 * positions et les normales sont réécrites dans les tampons existants : aucune
 * géométrie n'est allouée par image.
 */
export function updateLeash(leash: Leash, from: THREE.Vector3, to: THREE.Vector3): void {
  vFrom.copy(from);
  vTo.copy(to);
  const span = vFrom.distanceTo(vTo);
  // Mou restant : ce qui dépasse de la distance à couvrir pend en dessous.
  const slack = Math.max(0, leash.length - span);
  const sag = Math.min(leash.length * 0.42, slack * 0.62);

  const pos = leash.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const nrm = leash.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS;
    pointAt(vFrom, vTo, u, sag, vCur);
    // Tangente par différences centrées : la section reste perpendiculaire à
    // la sangle jusque dans le creux du ventre.
    pointAt(vFrom, vTo, Math.max(0, u - 1 / SEGMENTS), sag, vPrev);
    pointAt(vFrom, vTo, Math.min(1, u + 1 / SEGMENTS), sag, vNext);
    vTan.subVectors(vNext, vPrev);
    if (vTan.lengthSq() < 1e-10) vTan.set(0, 1, 0);
    vTan.normalize();
    vSideA.crossVectors(vTan, UP);
    if (vSideA.lengthSq() < 1e-8) vSideA.crossVectors(vTan, FALLBACK);
    vSideA.normalize();
    vSideB.crossVectors(vTan, vSideA).normalize();
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      vRad.copy(vSideA).multiplyScalar(Math.cos(a)).addScaledVector(vSideB, Math.sin(a));
      const k = i * SIDES + j;
      pos.setXYZ(k, vCur.x + vRad.x * RADIUS, vCur.y + vRad.y * RADIUS, vCur.z + vRad.z * RADIUS);
      nrm.setXYZ(k, vRad.x, vRad.y, vRad.z);
    }
  }
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
}
