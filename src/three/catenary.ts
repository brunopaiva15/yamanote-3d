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
/** Flèche du fil de contact : quasi nul, tenu droit par les pendules. */
const CONTACT_SAG = 0.02;
/**
 * Désaxement (zigzag) du fil de contact (m). Sur voie réelle le fil serpente
 * de part et d'autre de l'axe pour user la bande du pantographe sur toute sa
 * largeur ; c'est ce serpentement qu'on lit en levant les yeux. Ici il revient
 * au même côté à chaque portique, de sorte qu'une portée unique se recopie sans
 * couture le long de la voie.
 */
const STAGGER = 0.2;
/**
 * La poutre est HAUTE : porteur et fil de contact pendent sous elle. Autrefois
 * le porteur passait au-dessus d'une barre basse, sans rien pour l'accrocher -
 * on remonte donc la poutre au-dessus du porteur (6,05) et tout descend d'elle.
 */
const BEAM_BOT = 6.2;
const BEAM_TOP = 6.66;
/** Demi-largeur hors-tout de la poutre : elle coiffe les deux mâts. */
const BEAM_HALF = POLE_X + 0.14;
/** Écartement des deux plans du treillis (m). */
const BEAM_DEPTH = 0.16;
/** Sommet du mât (le fût dépasse un peu la poutre). */
const MAST_TOP = 6.84;

/** Abscisse du fil de contact le long d'une portée (paramètre t ∈ [0,1]). */
function contactX(t: number): number {
  return -STAGGER * Math.cos(2 * Math.PI * t);
}
/** Hauteur d'un fil parabolique au paramètre t. */
function wireY(y0: number, sag: number, t: number): number {
  return y0 - sag * 4 * t * (1 - t);
}

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

/**
 * Barre droite entre deux points du plan xy (membrure ou diagonale de
 * treillis) : une boîte mise à la longueur et inclinée dans le plan.
 */
function strut(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  t: number,
  depth: number,
): THREE.BufferGeometry {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const g = new THREE.BoxGeometry(len, t, depth);
  g.rotateZ(Math.atan2(dy, dx));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return g;
}

/**
 * Poutre-treillis transversale (門型ビーム) : deux plans verticaux identiques
 * (avant/arrière), chacun deux membrures reliées par une âme en zigzag de
 * type Warren, et quelques entretoises entre les plans pour la profondeur.
 * C'est ce dessin-là qui dit « poutre de chemin de fer » plutôt que « barre ».
 */
function buildBeam(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const panels = 12;
  const step = (BEAM_HALF * 2) / panels;
  const node = (i: number) => -BEAM_HALF + i * step;
  const zf = BEAM_DEPTH / 2;

  for (const z of [zf, -zf]) {
    // Membrures haute et basse.
    parts.push(boxAt(BEAM_HALF * 2, 0.075, 0.06, 0, BEAM_TOP, z));
    parts.push(boxAt(BEAM_HALF * 2, 0.075, 0.06, 0, BEAM_BOT, z));
    // Âme : diagonales alternées (Warren) + montants aux nœuds.
    for (let i = 0; i < panels; i++) {
      const xa = node(i);
      const xb = node(i + 1);
      if (i % 2 === 0) parts.push(strut(xa, BEAM_BOT, xb, BEAM_TOP, z, 0.032, 0.045));
      else parts.push(strut(xa, BEAM_TOP, xb, BEAM_BOT, z, 0.032, 0.045));
    }
    for (let i = 0; i <= panels; i += 2) {
      parts.push(boxAt(0.036, BEAM_TOP - BEAM_BOT, 0.045, node(i), (BEAM_TOP + BEAM_BOT) / 2, z));
    }
  }
  // Entretoises entre les deux plans, une sur trois nœuds.
  for (let i = 0; i <= panels; i += 3) {
    parts.push(boxAt(0.05, 0.05, BEAM_DEPTH, node(i), BEAM_TOP, 0));
    parts.push(boxAt(0.05, 0.05, BEAM_DEPTH, node(i), BEAM_BOT, 0));
  }
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
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
    const x = s * POLE_X;
    // Mât octogonal légèrement fuselé, du pied jusqu'au-dessus de la poutre.
    parts.push(cylAt(0.1, 0.15, 8.3, 8, x, 2.75, 0));
    // Embase : platine et écrou de scellement, le mât ne « pousse » plus nu.
    parts.push(boxAt(0.42, 0.09, 0.42, x, -0.86, 0));
    parts.push(cylAt(0.17, 0.2, 0.34, 8, x, -0.68, 0));
    // Tête de mât.
    parts.push(boxAt(0.19, 0.16, 0.19, x, MAST_TOP, 0));
    // Goussets : deux plaques inclinées reliant le fût aux membrures.
    const gx = s * (POLE_X - 0.16);
    parts.push(strut(x, BEAM_TOP - 0.02, gx, BEAM_BOT - 0.26, 0.07, 0.05, BEAM_DEPTH + 0.05));
    parts.push(strut(x, BEAM_TOP - 0.02, gx, BEAM_BOT - 0.26, -0.07, 0.05, BEAM_DEPTH + 0.05));
    // Potence d'éclairage (le foyer émissif est posé à part par Wayside).
    parts.push(boxAt(LAMP_REACH, 0.07, 0.07, s * (POLE_X - LAMP_REACH / 2), LAMP_Y, 0));
    parts.push(boxAt(0.34, 0.09, 0.2, s * (POLE_X - LAMP_REACH), LAMP_Y - 0.07, 0));
  }

  // Poutre-treillis transversale.
  parts.push(buildBeam());

  // Suspente du porteur : au portique il pend juste sous la membrure basse.
  parts.push(boxAt(0.035, BEAM_BOT - MESSENGER_Y + 0.05, 0.035, 0, (BEAM_BOT + MESSENGER_Y) / 2, 0));

  // Bras de rappel : un hauban oblique descend de la poutre au fil de contact
  // et le tient à son désaxement ; une griffe marque le point d'accroche.
  const cx = contactX(0);
  parts.push(strut(0.02, BEAM_BOT - 0.05, cx, CONTACT_Y + 0.18, 0, 0.03, 0.03));
  parts.push(strut(cx - 0.34, CONTACT_Y + 0.12, cx, CONTACT_Y + 0.05, 0, 0.028, 0.028));
  parts.push(boxAt(0.06, 0.13, 0.06, cx, CONTACT_Y + 0.05, 0));

  // Pendules : ils relient le porteur (axe) au fil de contact (désaxé), et
  // c'est leur rythme qu'on lit en passant dessous, plus que les fils.
  const drops = 7;
  for (let i = 1; i < drops; i++) {
    const t = i / drops;
    const my = wireY(MESSENGER_Y, MESSENGER_SAG, t);
    const cy = wireY(CONTACT_Y, CONTACT_SAG, t);
    parts.push(strut(0, my, contactX(t), cy, t * POLE_SPACING, 0.022, 0.022));
  }

  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

/** Fil de contact (cuivre) : quasi droit, mais serpentant (désaxement). */
function buildContact(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector3(contactX(t), wireY(CONTACT_Y, CONTACT_SAG, t), t * POLE_SPACING));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.028, 5, false);
}

/** Câble porteur (acier sombre), tendu dans l'axe avec sa flèche. */
function buildMessenger(): THREE.BufferGeometry {
  return wire(MESSENGER_Y, MESSENGER_SAG, POLE_SPACING, 0.035);
}

/** Un isolateur : quelques ailettes empilées, à l'aplomb d'un ancrage. */
function insulatorAt(x: number, y: number): THREE.BufferGeometry[] {
  return [
    cylAt(0.045, 0.045, 0.05, 8, x, y, 0),
    cylAt(0.075, 0.075, 0.028, 8, x, y - 0.045, 0),
    cylAt(0.05, 0.05, 0.05, 8, x, y - 0.09, 0),
    cylAt(0.078, 0.078, 0.028, 8, x, y - 0.13, 0),
  ];
}

/**
 * Isolateurs porcelaine : matériau clair à part, ils accrochent l'œil aux
 * points d'ancrage (porteur, bras de rappel, cantilevers) et cassent le
 * tout-noir de l'acier.
 */
function buildInsulators(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Ancrage du porteur sous la poutre.
  parts.push(...insulatorAt(0, BEAM_BOT - 0.02));
  // Ancrage du bras de rappel.
  parts.push(...insulatorAt(0.02, BEAM_BOT - 0.08));
  // Cantilevers près des mâts.
  for (const s of [-1, 1]) parts.push(...insulatorAt(s * (POLE_X - 0.55), BEAM_BOT - 0.12));
  return mergeGeometries(parts, false) as THREE.BufferGeometry;
}

export interface CatenaryParts {
  structure: THREE.BufferGeometry;
  contact: THREE.BufferGeometry;
  messenger: THREE.BufferGeometry;
  insulator: THREE.BufferGeometry;
}

/** Les familles d'une portée, à poser par les mêmes matrices. */
export function buildCatenary(): CatenaryParts {
  return {
    structure: buildStructure(),
    contact: buildContact(),
    messenger: buildMessenger(),
    insulator: buildInsulators(),
  };
}
