// Nez de cabine du E235-0 : le masque vert arrondi, son grand pare-brise noir,
// le dégradé en damier qui court sous la vitre, la girouette LED, les feux et
// l'attelage. Construit pour l'extrémité +z d'une voiture ; la voiture de queue
// reçoit le même objet, retourné d'un demi-tour.

import * as THREE from 'three';
import { E235 } from '../../data/e235';
import { roundedRect } from '../shapes';

/** Abscisse longitudinale du nu de la face avant, en repère voiture. */
export const CAB_FRONT_Z = E235.bodyHalfLen + 0.6;
const BEVEL = 0.15;
/** Profondeur d'extrusion : le chanfrein ajoute son épaisseur aux deux bouts. */
const DEPTH = E235.cabLen - 2 * BEVEL;
const CAB_BACK_Z = CAB_FRONT_Z - E235.cabLen + BEVEL;
/** Nu réel de la face avant, chanfrein compris - c'est là que se posent les
 *  vitres, la girouette et les feux. Le rater les enfouit dans le masque. */
const FACE_Z = CAB_BACK_Z + DEPTH + BEVEL + 0.006;

export interface CabMaterials {
  green: THREE.Material;
  black: THREE.Material;
  checker: THREE.Material;
  sign: THREE.Material;
  headlight: THREE.Material;
  taillight: THREE.Material;
  underframe: THREE.Material;
  metal: THREE.Material;
}

export function buildCab(mats: CabMaterials): THREE.Group {
  const g = new THREE.Group();
  const yBottom = E235.underframeY - 0.1;
  const yTop = E235.roofY + 0.02;
  const h = yTop - yBottom;
  const yMid = (yTop + yBottom) / 2;

  // Masque : section de caisse à coins largement adoucis, extrudée vers
  // l'avant avec un chanfrein qui arrondit le nez.
  const shape = roundedRect(E235.halfWidth * 2, h, 0.3, 0, yMid);
  const mask = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelSize: BEVEL,
    bevelThickness: BEVEL,
    bevelSegments: 4,
    curveSegments: 14,
  });
  mask.translate(0, 0, CAB_BACK_Z);
  g.add(new THREE.Mesh(mask, mats.green));

  const face = FACE_Z;

  // Pare-brise : une grande glace unique, très inclinée sur le E235 mais
  // rendue à plat ici - c'est sa masse noire qui fait la silhouette. Elle
  // occupe presque toute la largeur, comme sur la série.
  const glassW = E235.halfWidth * 2 - 0.5;
  const glassH = E235.windshieldTop - E235.windshieldBottom;
  const glass = new THREE.PlaneGeometry(glassW, glassH);
  glass.translate(0, (E235.windshieldTop + E235.windshieldBottom) / 2, face);
  g.add(new THREE.Mesh(glass, mats.black));

  // Girouette LED, dans le bandeau noir en haut du pare-brise.
  const sign = new THREE.PlaneGeometry(glassW * 0.62, 0.3);
  sign.translate(glassW * 0.16, E235.windshieldTop - 0.2, face + 0.012);
  g.add(new THREE.Mesh(sign, mats.sign));

  // Dégradé en damier sous le pare-brise : la signature graphique de la série.
  const checkerH = E235.windshieldBottom - yBottom - 0.1;
  const checker = new THREE.PlaneGeometry(E235.halfWidth * 2 - 0.34, checkerH);
  checker.translate(0, E235.windshieldBottom - 0.05 - checkerH / 2, face + 0.006);
  g.add(new THREE.Mesh(checker, mats.checker));

  // Essuie-glaces, posés sur la vitre.
  for (const x of [-0.46, 0.5]) {
    const arm = new THREE.BoxGeometry(0.045, 0.8, 0.04);
    arm.rotateZ(x < 0 ? 0.34 : -0.34);
    arm.translate(x, E235.windshieldBottom + 0.42, face + 0.02);
    g.add(new THREE.Mesh(arm, mats.metal));
  }

  // Feux : blancs en haut, rouges juste en dessous, aux deux angles.
  for (const s of [1, -1] as const) {
    const head = new THREE.BoxGeometry(0.3, 0.11, 0.05);
    head.translate(s * 1.08, E235.windshieldTop + 0.17, face);
    g.add(new THREE.Mesh(head, mats.headlight));
    const tail = new THREE.BoxGeometry(0.18, 0.09, 0.05);
    tail.translate(s * 1.08, E235.windshieldTop + 0.03, face);
    g.add(new THREE.Mesh(tail, mats.taillight));
  }

  // Jupe avant et tête d'attelage.
  const skirt = new THREE.BoxGeometry(2.1, 0.5, 0.5);
  skirt.translate(0, E235.underframeY - 0.34, FACE_Z - 0.32);
  g.add(new THREE.Mesh(skirt, mats.underframe));
  const coupler = new THREE.BoxGeometry(0.66, 0.42, 0.5);
  coupler.translate(0, E235.underframeY - 0.62, FACE_Z - 0.18);
  g.add(new THREE.Mesh(coupler, mats.underframe));

  // Marchepied de secours sous la vitre.
  const step = new THREE.BoxGeometry(0.9, 0.07, 0.18);
  step.translate(0, E235.underframeY + 0.16, FACE_Z - 0.07);
  g.add(new THREE.Mesh(step, mats.metal));

  return g;
}
