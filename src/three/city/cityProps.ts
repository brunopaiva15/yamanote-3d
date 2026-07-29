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

/**
 * Le feuillage n'est plus vert DANS LES SOMMETS.
 *
 * Il l'était, et c'était le mur contre lequel butait toute idée de saison :
 * la couleur d'instance MULTIPLIE la couleur de sommet, et un vert multiplié
 * par un rouge d'automne ne donne pas du rouge, il donne de la boue. Les
 * sommets ne portent donc plus qu'un ombrage neutre — trois valeurs de gris,
 * une par sujet, pour que la masse garde du relief — et c'est la couleur
 * d'instance qui porte la teinte entière, verte en juillet, rousse fin
 * novembre, rose fin mars.
 *
 * Le tronc, lui, ne suit pas la saison : un tronc reste brun quand les feuilles
 * rougissent. Il est reconnu dans le nuanceur par un attribut de sommet, et
 * repeint de sa propre teinte (voir makeGroveMaterial).
 */
const TRUNK = new THREE.Color('#6a533c').convertSRGBToLinear();
const LEAF_A = new THREE.Color('#ffffff').convertSRGBToLinear();
const LEAF_B = new THREE.Color('#eef0ea').convertSRGBToLinear();
const LEAF_C = new THREE.Color('#d9ddd4').convertSRGBToLinear();

/**
 * Pose sur une pièce du bosquet son ombrage, son appartenance (tronc ou
 * frondaison) et le centre autour duquel elle se rétracte quand la saison
 * dépouille l'arbre. Les trois attributs sont posés sur TOUTES les pièces :
 * `mergeGeometries` exige des jeux d'attributs identiques.
 */
function tagged(
  geo: THREE.BufferGeometry,
  color: THREE.Color,
  trunk: boolean,
  hub: [number, number, number],
): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  const t = new Float32Array(n);
  const h = new Float32Array(n * 3);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
    t[i] = trunk ? 1 : 0;
    // Un tronc ne se rétracte pas : son centre de rétraction est lui-même.
    h[i * 3] = trunk ? pos.getX(i) : hub[0];
    h[i * 3 + 1] = trunk ? pos.getY(i) : hub[1];
    h[i * 3 + 2] = trunk ? pos.getZ(i) : hub[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('aTrunk', new THREE.BufferAttribute(t, 1));
  geo.setAttribute('aHub', new THREE.BufferAttribute(h, 3));
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
    parts.push(tagged(trunk, TRUNK, true, [x, h * 0.225, z]));
    // Huit méridiens, cinq parallèles : au-delà, on paie de la rondeur que la
    // brume et la distance mangent — et il s'en instancie des centaines.
    const crown = new THREE.SphereGeometry(rad, 8, 5);
    crown.scale(1, 0.86, 1);
    crown.translate(x, h * 0.68, z);
    parts.push(tagged(crown, leaf, false, [x, h * 0.68, z]));
  }
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/** Teinte du bois : elle ne suit pas la saison, un tronc reste brun. */
const TRUNK_TONE = new THREE.Color('#6a533c').convertSRGBToLinear();

export interface GroveMaterial {
  material: THREE.MeshLambertMaterial;
  /** 1 en pleine feuille, ~0,6 sur une ramure nue. */
  canopy: { value: number };
  /** Blanchiment de la frondaison par la neige (0..1). */
  snow: { value: number };
  dispose(): void;
}

/**
 * Matériau des bosquets, partagé par le ruban urbain et le bord de voie.
 *
 * Deux choses que la couleur d'instance seule ne sait pas faire :
 *
 *   · GARDER LE TRONC BRUN quand la frondaison rougit. Un attribut de sommet
 *     dit qui est bois et qui est feuille ; le bois est repeint de sa teinte,
 *     la feuille garde celle de l'instance ;
 *   · DÉPOUILLER L'ARBRE. Ce qui dit l'hiver de loin, ce n'est pas la couleur,
 *     c'est le VOLUME : une frondaison de juillet est une masse pleine, une
 *     ramure de janvier est un dessin. Les sommets de couronne se rétractent
 *     vers le centre de leur propre sujet — mettre à l'échelle l'instance
 *     entière rapetisserait l'arbre au lieu de le dénuder.
 */
export function makeGroveMaterial(): GroveMaterial {
  const canopy = { value: 1 };
  const snow = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCanopy = canopy;
    shader.uniforms.uGroveSnow = snow;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aTrunk;
        attribute vec3 aHub;
        uniform float uCanopy;
        varying float vTrunk;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed = aHub + (transformed - aHub) * uCanopy;
        vTrunk = aTrunk;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uGroveSnow;
        varying float vTrunk;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Le bois reprend sa teinte : la couleur d'instance ne vaut que pour
        // la feuille.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${TRUNK_TONE.r.toFixed(4)}, ${TRUNK_TONE.g.toFixed(4)}, ${TRUNK_TONE.b.toFixed(4)}), vTrunk);
        // La neige se pose sur la frondaison, pas sur le tronc.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.94), uGroveSnow * (1.0 - vTrunk));`,
      );
  };
  material.customProgramCacheKey = () => 'yamanote-grove';

  return {
    material,
    canopy,
    snow,
    dispose() {
      material.dispose();
    },
  };
}
