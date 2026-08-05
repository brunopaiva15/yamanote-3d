// Ce qu'il y a sur un toit japonais.
//
// La Yamanote court sur viaduc la moitié de la boucle : sept mètres au-dessus
// de la rue, le regard passe par-dessus le bâti bas et la surface qu'on voit le
// plus n'est ni une façade ni une chaussée, c'est une TOITURE. Or elle n'avait
// qu'un acrotère et, de loin en loin, un édicule en boîte - et une boîte sur
// une boîte ne se lit pas comme un toit habité.
//
// Trois familles suffisent, parce que ce sont les trois qu'on voit :
//
//   · le RÉSERVOIR sur pieds (高置水槽) - la silhouette la plus reconnaissable
//     d'un immeuble japonais, et la seule qui se détache sur le ciel ;
//   · la BATTERIE de condenseurs, alignée le long d'un bord - c'est elle qui
//     donne au toit sa texture industrielle ;
//   · le MÂT d'antenne, avec son feu rouge d'obstacle au-dessus de quarante
//     mètres - le seul point rouge fixe d'un ciel de Tokyo la nuit.
//
// Toutes sont écrites dans un cube unité POSÉ PAR LA BASE, comme les croupes et
// les bosquets de cityProps : la matrice d'instance (profondeur, hauteur,
// longueur) suffit alors à les dimensionner, et le générateur raisonne en
// mètres. Chacune est fusionnée en une seule géométrie - un réservoir, ce sont
// six volumes, et sans fusion un toit coûterait plus cher que son immeuble.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Pose une pièce dans le cube unité, cotée en fractions de l'unité. */
function part(
  parts: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): void {
  const g = new THREE.BoxGeometry(d, h, w);
  g.translate(x, y, z);
  parts.push(g);
}

/**
 * Réservoir d'eau sur pieds.
 *
 * La cuve ne touche pas le toit - c'est tout l'intérêt de la forme : on voit le
 * ciel SOUS elle, et c'est ce vide qui la fait lire comme un réservoir plutôt
 * que comme un édicule. Quatre pieds, une cuve, un couvercle en léger débord.
 */
export function makeWaterTankGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const legH = 0.34;
  const legT = 0.09;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      part(parts, legT, legH, legT, sx * 0.38, legH / 2, sz * 0.38);
    }
  }
  // Cuve, puis couvercle débordant : l'ombre qu'il porte sur la cuve est ce qui
  // distingue les deux volumes à contre-jour.
  part(parts, 0.9, 0.58, 0.86, 0, legH + 0.29, 0);
  part(parts, 0.98, 0.07, 0.94, 0, legH + 0.61, 0);
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/**
 * Batterie de condenseurs de climatisation.
 *
 * Trois caissons de front, sur un châssis bas. On les aligne le long d'un bord
 * de toiture, jamais au milieu : c'est là qu'ils sont, pour la reprise d'air.
 */
export function makeAcBankGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  part(parts, 1, 0.1, 0.72, 0, 0.05, 0); // châssis
  for (let i = 0; i < 3; i++) {
    const z = (i - 1) * 0.33;
    part(parts, 0.28, 0.52, 0.6, 0, 0.36, z);
    // Grille : une plaque en léger retrait, plus sombre à l'ombrage.
    part(parts, 0.22, 0.34, 0.05, 0.31, 0.4, z);
  }
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/**
 * Mât d'antenne haubané.
 *
 * Un fût fin, un bras de traverse, trois haubans en pente. La finesse est le
 * sujet : un mât épais devient un poteau, et un poteau sur un toit ne raconte
 * rien. À cette échelle, quatre volumes suffisent - la brume mange le reste.
 */
export function makeMastGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  part(parts, 0.08, 1, 0.08, 0, 0.5, 0);
  part(parts, 0.44, 0.05, 0.05, 0, 0.86, 0);
  part(parts, 0.05, 0.05, 0.44, 0, 0.78, 0);
  // Embase : c'est elle qui l'assied, et sans elle le mât flotte.
  part(parts, 0.24, 0.08, 0.24, 0, 0.04, 0);
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/**
 * Feu rouge d'obstacle, en haut du mât.
 *
 * Il vit dans son propre maillage, parce qu'il ne partage rien avec le reste :
 * ni son matériau (il est émissif, et non éclairé), ni sa cote (il est au
 * sommet), ni son heure (il ne s'allume qu'à la nuit). C'est le seul point
 * rouge fixe d'un ciel de Tokyo, et on ne l'invente pas : la réglementation
 * l'impose au-dessus de soixante mètres, et l'usage bien plus bas.
 */
export function makeObstacleLightGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.5, 6, 4);
}

/**
 * Garde-corps de toiture : deux lisses sur des montants, tout autour.
 *
 * Il se pose sur l'acrotère du bâti moyen. Vu d'un viaduc, c'est lui qui dit
 * qu'un toit est accessible - donc habité - et il coûte peu : deux cadres
 * croisés, sans montants d'angle, parce que personne ne les compte.
 */
export function makeRoofRailGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const t = 0.035;
  for (const sx of [-0.5, 0.5]) {
    part(parts, 1, t, t, sx, 1, 0);
    part(parts, 1, t, t, sx, 0.58, 0);
  }
  for (const sz of [-0.5, 0.5]) {
    part(parts, t, t, 1, 0, 1, sz);
    part(parts, t, t, 1, 0, 0.58, sz);
  }
  // Montants, un sur cinq : de loin, c'est le rythme qui compte, pas le compte.
  for (let i = 0; i < 5; i++) {
    const z = (i - 2) * 0.25;
    part(parts, t, 1, t, -0.5, 0.5, z);
    part(parts, t, 1, t, 0.5, 0.5, z);
  }
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}
