// Caténaire de pleine voie : le portique (門型) et la portée qu'il porte.
//
// Sortie de three/Wayside pour être retravaillée et éprouvée à part (voir
// /caten-probe.html). Une portée est accrochée à CHAQUE portique et s'étend
// jusqu'au suivant : des portées identiques espacées de POLE_SPACING pavent
// donc la voie sans couture, y compris au recyclage par runtime.distance.
//
// La géométrie est éclatée en TROIS familles, chacune son matériau - c'est ce
// qui sort la caténaire du « paquet de fils noirs » :
//   · structure : mâts, poutre, bras, pendules  → acier peint sombre ;
//   · contact   : le fil de contact             → cuivre patiné, plus clair ;
//   · messenger : le câble porteur              → acier gris foncé.
// Les trois sont posées par les MÊMES matrices d'instance (un portique = une
// matrice appliquée aux trois maillages).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Cotes partagées avec le placement (Wayside) -------------------------
/** Abscisse des mâts (m), de part et d'autre de la voie. */
export const POLE_X = 5.2;
/** Nombre de portiques recyclés le long de la voie. */
export const POLE_COUNT = 8;
/** Entraxe des portiques = longueur d'une portée (m). */
export const POLE_SPACING = 30;
/** Hauteur du foyer d'éclairage porté par les mâts (m). */
export const LAMP_Y = 5.15;
/** Déport du foyer vers la voie (m). */
export const LAMP_REACH = 0.95;
/** Hauteur du fil de contact au-dessus du rail (m). */
export const CONTACT_Y = 4.9;
/** Hauteur du câble porteur à l'aplomb d'un portique (m). */
export const MESSENGER_Y = 6.05;

// --- Cotes internes de la structure --------------------------------------
/** Flèche du porteur à mi-portée (m). */
const MESSENGER_SAG = 0.55;

// --- Petites fabriques ----------------------------------------------------

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cylAt(rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

/** Fil tendu entre deux portiques, avec sa flèche parabolique. */
function wire(y0: number, sag: number, span: number, radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Chaînette approchée par une parabole : à cette échelle l'œil ne fait pas
    // la différence, et la courbe coûte huit points au lieu d'une intégrale.
    pts.push(new THREE.Vector3(0, y0 - sag * 4 * t * (1 - t), t * span));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, radius, 4, false);
}

// --- Familles de géométrie ------------------------------------------------

/** Mâts, poutre-treillis, bras et pendules : tout ce qui est en acier peint. */
function buildStructure(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const s of [-1, 1]) {
    // Mât octogonal légèrement fuselé.
    parts.push(cylAt(0.09, 0.13, 7, 8, s * POLE_X, 2.2, 0));
    // Tête de mât.
    parts.push(boxAt(0.16, 0.16, 0.16, s * POLE_X, 5.72, 0));
    // Potence d'éclairage (le foyer émissif est posé à part par Wayside).
    parts.push(boxAt(LAMP_REACH, 0.07, 0.07, s * (POLE_X - LAMP_REACH / 2), LAMP_Y, 0));
    parts.push(boxAt(0.34, 0.09, 0.2, s * (POLE_X - LAMP_REACH), LAMP_Y - 0.07, 0));
  }

  // Poutre transversale (Phase 2 : deviendra un treillis).
  parts.push(boxAt(10.6, 0.14, 0.14, 0, 5.4, 0));

  // Pendules : ils relient le porteur au fil de contact.
  const drops = 5;
  for (let i = 1; i < drops; i++) {
    const t = i / drops;
    const top = MESSENGER_Y - MESSENGER_SAG * 4 * t * (1 - t);
    parts.push(boxAt(0.03, top - CONTACT_Y, 0.03, 0, (top + CONTACT_Y) / 2, t * POLE_SPACING));
  }

  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/** Fil de contact (cuivre). */
function buildContact(): THREE.BufferGeometry {
  return wire(CONTACT_Y, 0.04, POLE_SPACING, 0.03);
}

/** Câble porteur (acier sombre). */
function buildMessenger(): THREE.BufferGeometry {
  return wire(MESSENGER_Y, MESSENGER_SAG, POLE_SPACING, 0.035);
}

export interface CatenaryParts {
  structure: THREE.BufferGeometry;
  contact: THREE.BufferGeometry;
  messenger: THREE.BufferGeometry;
}

/** Les trois familles d'une portée, à poser par les mêmes matrices. */
export function buildCatenary(): CatenaryParts {
  return {
    structure: buildStructure(),
    contact: buildContact(),
    messenger: buildMessenger(),
  };
}
