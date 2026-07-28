// Géométries des volumes qui ne sont pas des boîtes : toiture en croupe et
// masse d'arbres. Toutes deux sont écrites dans un cube unité, pour que la
// matrice d'instance (profondeur, hauteur, longueur) suffise à les dimensionner.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Toiture en croupe, unitaire.
 *
 * Un cylindre à quatre pans tourné d'un huitième de tour EST une pyramide
 * tronquée à base carrée — soit exactement une croupe. Le faîte n'est pas
 * réduit à une arête : sur une maison de ville japonaise il court sur une
 * bonne moitié de la longueur.
 */
export function makeHipRoofGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.3, Math.SQRT1_2, 1, 4, 1, false);
  g.rotateY(Math.PI / 4);
  // Base à y = 0 : la matrice d'instance pose la toiture sur l'acrotère.
  g.translate(0, 0.5, 0);
  return g;
}

/** Teintes fixées dans les sommets : le matériau n'en porte qu'une. */
const TRUNK = new THREE.Color('#6a533c').convertSRGBToLinear();
const LEAF_A = new THREE.Color('#5c9c46').convertSRGBToLinear();
const LEAF_B = new THREE.Color('#6cae52').convertSRGBToLinear();
const LEAF_C = new THREE.Color('#4e8c3c').convertSRGBToLinear();

function tinted(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/**
 * Masse d'arbres unitaire : trois sujets serrés, hauteur 1, emprise ±0,5.
 *
 * C'est un BOSQUET et non un arbre : ce qui borde la voie à Ueno, à Komagome
 * ou derrière Harajuku, ce sont des lisières, pas des sujets isolés. Un arbre
 * seul se lit comme du mobilier ; une masse se lit comme un lieu.
 */
export function makeGroveGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const sujets: [number, number, number, number, THREE.Color][] = [
    [0, 0, 1, 0.34, LEAF_A],
    [-0.3, 0.24, 0.74, 0.27, LEAF_B],
    [0.28, -0.26, 0.82, 0.29, LEAF_C],
  ];
  for (const [x, z, h, rad, leaf] of sujets) {
    const trunk = new THREE.CylinderGeometry(0.035, 0.055, h * 0.45, 4);
    trunk.translate(x, h * 0.225, z);
    parts.push(tinted(trunk, TRUNK));
    // Huit méridiens, cinq parallèles : au-delà, on paie de la rondeur que la
    // brume et la distance mangent — et il s'en instancie des centaines.
    const crown = new THREE.SphereGeometry(rad, 8, 5);
    crown.scale(1, 0.86, 1);
    crown.translate(x, h * 0.68, z);
    parts.push(tinted(crown, leaf));
  }
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}
