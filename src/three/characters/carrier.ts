// Caisse de transport pour animal — le seul contenant dans lequel un chien
// peut légalement franchir les portiques de la Yamanote.
//
// Les règles de JR East ne laissent aucune latitude, et ce sont ELLES qui
// donnent le gabarit modélisé ici :
//
//   - l'animal doit être ENTIÈREMENT enfermé, sans sortir la tête ;
//   - longueur + largeur + hauteur de la caisse ≤ 120 cm ;
//   - poids total (animal + caisse) ≤ 10 kg — donc un petit chien, jamais un
//     husky ni rien d'approchant ;
//   - un billet « bagage à main » à 290 ¥, pris au guichet.
//
// D'où 50 × 34 × 34 cm : 118 cm de somme, sous la limite, et l'ordre de
// grandeur de ce qu'on croise réellement sur un quai. Un chien tenu en laisse,
// porté dans les bras, glissé dans une écharpe ou promené en poussette est
// interdit — c'est exactement ce que barre le pictogramme de JR East.
//
// La caisse est MODELÉE dans l'esprit de characters/props.ts : coque à deux
// tons, fentes d'aération, porte à barreaux (ajourée pour de bon — c'est par
// là qu'on voit le chien), poignée de portage et quatre pieds. Toutes les
// géométries sont transformées « en dur » à la construction du module et
// partagées ; seuls les matériaux teintés sont créés par passager.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Cotes extérieures (m) : leur somme doit rester sous les 120 cm de JR East. */
export const CARRIER_W = 0.34; // largeur (x)
export const CARRIER_H = 0.34; // hauteur (y)
export const CARRIER_L = 0.50; // longueur (z), la porte est en +Z

/** Épaisseur des parois : ce qui reste dedans pour le chien. */
const WALL = 0.022;
export const CARRIER_INNER_H = CARRIER_H - WALL * 2;
export const CARRIER_INNER_L = CARRIER_L - WALL * 2;

// --- Géométries partagées --------------------------------------------------

// Coque : deux demi-coques (base teintée, capot clair), séparées par un joint.
const baseGeo = new RoundedBoxGeometry(CARRIER_W, CARRIER_H * 0.52, CARRIER_L, 2, 0.022);
const lidGeo = new RoundedBoxGeometry(CARRIER_W * 0.99, CARRIER_H * 0.5, CARRIER_L * 0.99, 2, 0.026);
// Creusé : la caisse est un contenant, pas un bloc. On ne modélise pas
// l'intérieur (invisible) — on retire seulement la face avant, remplacée par
// la porte à barreaux, et le volume que le chien occupe.
const cavityGeo = new THREE.BoxGeometry(CARRIER_W - WALL * 2, CARRIER_INNER_H, CARRIER_INNER_L);

// Fentes d'aération : rangées de petites lucarnes sur les deux flancs.
function ventGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BoxGeometry(0.004, 0.075, 0.016);
      g.translate(0, CARRIER_H * 0.62 - row * 0.085, -CARRIER_L * 0.3 + i * 0.062);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

// Fusion maison : évite une dépendance à BufferGeometryUtils pour six boîtes.
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push(base + gi.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    g.dispose();
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

const ventsGeo = ventGeo();

// Porte : un cadre plein et une grille de barreaux croisés, AJOURÉE — c'est
// par là qu'on voit le chien, et sans vrais trous il n'y aurait rien à voir.
function doorGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const w = CARRIER_W * 0.78;
  const h = CARRIER_H * 0.66;
  const r = 0.006;
  // Cadre.
  for (const [dx, dy, sx, sy] of [
    [0, h / 2, w, r * 2],
    [0, -h / 2, w, r * 2],
    [-w / 2, 0, r * 2, h],
    [w / 2, 0, r * 2, h],
  ]) {
    const g = new THREE.BoxGeometry(sx, sy, 0.012);
    g.translate(dx, dy, 0);
    parts.push(g);
  }
  // Barreaux verticaux puis horizontaux.
  for (let i = 1; i < 5; i++) {
    const g = new THREE.BoxGeometry(0.005, h, 0.008);
    g.translate(-w / 2 + (i * w) / 5, 0, 0);
    parts.push(g);
  }
  for (let i = 1; i < 4; i++) {
    const g = new THREE.BoxGeometry(w, 0.005, 0.008);
    g.translate(0, -h / 2 + (i * h) / 4, 0);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  geo.translate(0, CARRIER_H * 0.5, CARRIER_L / 2 - 0.004);
  return geo;
}
const gridGeo = doorGeo();

// Poignée de portage : arche sur le dessus, c'est par là qu'on la tient.
const handleGeo = new THREE.TorusGeometry(0.055, 0.008, 5, 12, Math.PI);
handleGeo.scale(1, 0.85, 1);
handleGeo.rotateY(Math.PI / 2);
handleGeo.translate(0, CARRIER_H - 0.004, 0);

// Loquet de la porte.
const latchGeo = new RoundedBoxGeometry(0.022, 0.032, 0.014, 1, 0.004);
latchGeo.translate(CARRIER_W * 0.42, CARRIER_H * 0.5, CARRIER_L / 2 - 0.006);

// Pieds.
const footGeo = new THREE.BoxGeometry(0.03, 0.014, 0.03);

const gridMat = new THREE.MeshStandardMaterial({ color: '#2c2f33', roughness: 0.5, metalness: 0.35 });
const lidMat = new THREE.MeshStandardMaterial({ color: '#e6ebe2', roughness: 0.65 });

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - k));
  const g = Math.round(((n >> 8) & 255) * (1 - k));
  const b = Math.round((n & 255) * (1 - k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export interface Carrier {
  /** Groupe de la caisse : origine au CENTRE DU SOL, porte vers +Z. */
  group: THREE.Group;
  /** Où loger le chien : au fond, museau vers la porte. */
  petAnchor: THREE.Group;
}

/**
 * Fabrique une caisse. `color` teinte la demi-coque basse — la couleur du sac
 * du voyageur, pour que ses affaires aillent ensemble.
 */
export function makeCarrier(color: string): Carrier {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: shade(color, 0.35), roughness: 0.55 });

  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = CARRIER_H * 0.26;
  group.add(base);

  const lid = new THREE.Mesh(lidGeo, lidMat);
  lid.position.y = CARRIER_H * 0.75;
  group.add(lid);

  // Évidement : rendu par-derrière, il creuse visuellement la caisse vue à
  // travers la porte au lieu de laisser un bloc plein derrière les barreaux.
  const cavity = new THREE.Mesh(
    cavityGeo,
    new THREE.MeshStandardMaterial({ color: shade(color, 0.72), roughness: 0.95, side: THREE.BackSide }),
  );
  cavity.position.y = WALL + CARRIER_INNER_H / 2;
  group.add(cavity);

  for (const s of [-1, 1]) {
    const vents = new THREE.Mesh(ventsGeo, trimMat);
    vents.position.x = (s * CARRIER_W) / 2;
    group.add(vents);
  }

  group.add(new THREE.Mesh(gridGeo, gridMat));
  group.add(new THREE.Mesh(latchGeo, gridMat));
  group.add(new THREE.Mesh(handleGeo, trimMat));

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(footGeo, trimMat);
      foot.position.set(sx * CARRIER_W * 0.36, -0.006, sz * CARRIER_L * 0.38);
      group.add(foot);
    }
  }

  // Le chien est posé au fond, un peu en retrait de la porte : la règle veut
  // qu'aucune tête ne dépasse, et c'est aussi là qu'il se tient vraiment.
  const petAnchor = new THREE.Group();
  petAnchor.position.set(0, WALL, -CARRIER_L * 0.12);
  group.add(petAnchor);

  for (const obj of [base, lid, cavity]) {
    obj.castShadow = false;
    obj.receiveShadow = false;
  }
  return { group, petAnchor };
}
