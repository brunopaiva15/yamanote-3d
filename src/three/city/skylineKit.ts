// Les silhouettes de l'horizon lointain, et pourquoi elles sont PLATES.
//
// Une tour à cinq kilomètres n'a plus d'épaisseur : deux faces séparées de
// quarante mètres, vues sous un angle de huit millièmes de radian, se
// superposent au pixel près. Ce qui reste d'un repère à cette distance est son
// CONTOUR, et rien d'autre - c'est pourquoi une découpe à plat tournée vers
// l'œil dit exactement ce qu'un volume dirait, pour un vingtième des triangles.
// Le contour lui-même évolue quand on tourne autour, mais il faut parcourir des
// kilomètres pour que ça se voie, et la boucle en fait trente-quatre : c'est le
// relèvement qui change vite, pas le profil.
//
// CONVENTION - la seule chose à retenir de ce module. Chaque silhouette est
// écrite en UNITÉS DE HAUTEUR DE STRUCTURE : y = 0 au pied, y = 1 au sommet, x
// centré et mesuré dans la même unité. Une tour deux fois plus haute est donc
// deux fois plus large, ce qui est vrai des immeubles et faux des montagnes -
// d'où un profil de cône trois fois plus étalé que haut. L'appelant n'a plus
// qu'à multiplier par la taille angulaire du repère (three/city/FarSkyline).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Ce que la seconde couleur d'un repère éclaire.
 *
 * Une découpe à plat ne porte qu'un ton, et il en faut parfois deux : la neige
 * du Fuji n'est pas de la roche, un feu d'obstacle n'est pas de l'acier. Le
 * second morceau est donc une géométrie à part, avec son matériau, allumée par
 * la saison ou par l'heure selon sa nature.
 */
export type TrimKind = 'none' | 'snow' | 'beacon' | 'lights';

export interface Silhouette {
  body: THREE.BufferGeometry;
  trim: THREE.BufferGeometry | null;
  trimKind: TrimKind;
}

/** Un profil : suite de (hauteur, demi-largeur), du pied vers le sommet. */
type Profile = readonly (readonly [number, number])[];

/**
 * Bande symétrique décrite par son profil.
 *
 * Deux sommets par niveau, deux triangles par intervalle : le maillage le plus
 * court qui suive une courbe. C'est ce qui donne les fuseaux - la jambe d'une
 * tour treillis, la pente concave d'un volcan - qu'un empilement de boîtes ne
 * sait pas rendre sans mentir sur le nombre de faces.
 */
function strip(profile: Profile): THREE.BufferGeometry {
  const n = profile.length;
  const pos = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    const [y, half] = profile[i];
    pos[i * 6] = -half;
    pos[i * 6 + 1] = y;
    pos[i * 6 + 3] = half;
    pos[i * 6 + 4] = y;
  }
  const idx: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const l0 = i * 2;
    const r0 = l0 + 1;
    const l1 = l0 + 2;
    const r1 = l0 + 3;
    idx.push(l0, r0, r1, l0, r1, l1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Rectangle plein, coins (x0, y0) et (x1, y1). */
function rect(x0: number, y0: number, x1: number, y1: number): THREE.BufferGeometry {
  return strip([
    [y0, (x1 - x0) / 2],
    [y1, (x1 - x0) / 2],
  ]).translate((x0 + x1) / 2, 0, 0);
}

/** Barreau incliné d'épaisseur verticale constante, de (x0, y0) à (x1, y1). */
function bar(x0: number, y0: number, x1: number, y1: number, thick: number): THREE.BufferGeometry {
  const h = thick / 2;
  const pos = new Float32Array([x0, y0 - h, 0, x1, y1 - h, 0, x1, y1 + h, 0, x0, y0 + h, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false) as THREE.BufferGeometry;
  for (const p of parts) p.dispose();
  return g;
}

/**
 * Tour treillis effilée : Skytree, tour de Tokyo, Docomo Yoyogi.
 *
 * Le profil est CONCAVE, et c'est tout le sujet : une tour de télédiffusion
 * s'évase du sol comme un tronc, parce que c'est le vent qu'elle doit tenir et
 * non son poids. Un cône droit se lirait comme un clocher. Deux ceintures plus
 * larges marquent les belvédères, et le mât qui dépasse porte le feu rouge.
 */
function needle(): Silhouette {
  const shaft: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    // Décroissance en puissance : large au pied, presque cylindrique à mi-hauteur.
    shaft.push([t * 0.72, 0.008 + 0.072 * Math.pow(1 - t, 1.9)]);
  }
  return {
    body: merge([
      strip(shaft),
      // Le fût du mât, au-dessus du treillis.
      rect(-0.007, 0.72, 0.007, 1),
      // Belvédères : le bas large et bombé, le haut resserré.
      rect(-0.042, 0.44, 0.042, 0.485),
      rect(-0.028, 0.63, 0.028, 0.663),
    ]),
    // Feu d'obstacle : une tête d'épingle, mais c'est elle qu'on cherche des
    // yeux la nuit, et elle qui prouve que la tour est là et non peinte.
    trim: rect(-0.009, 0.975, 0.009, 1.005),
    trimKind: 'beacon',
  };
}

/**
 * Immeuble de grande hauteur : la masse ordinaire d'un quartier d'affaires.
 *
 * Un retrait sous le sommet et un couronnement d'équipements : c'est le peu
 * qui distingue une tour d'un parallélépipède, et ça suffit à cette distance.
 */
function tower(): Silhouette {
  return {
    body: merge([
      strip([
        [0, 0.2],
        [0.9, 0.2],
        [0.9, 0.155],
        [0.985, 0.155],
      ]),
      // Local des machines, décalé : une toiture d'immeuble n'est jamais
      // symétrique, et c'est ce décalage qui la rend crédible.
      rect(-0.09, 0.985, 0.055, 1),
    ]),
    trim: rect(-0.014, 0.995, 0.014, 1.02),
    trimKind: 'beacon',
  };
}

/**
 * Deux fûts sur un socle : le bureau métropolitain de Shinjuku, le Park Tower.
 *
 * La forme jumelle est la signature du Shinjuku de l'ouest, celle qu'on
 * reconnaît de Nakano comme du Fuji : deux traits verticaux qui se détachent
 * ensemble d'une base plus large.
 */
function twin(): Silhouette {
  const shaft = (x: number) =>
    strip([
      [0, 0.11],
      [0.94, 0.11],
      [1, 0.085],
    ]).translate(x, 0, 0);
  return {
    body: merge([shaft(-0.15), shaft(0.15), rect(-0.3, 0, 0.3, 0.4)]),
    trim: merge([rect(-0.163, 0.995, -0.137, 1.015), rect(0.137, 0.995, 0.163, 1.015)]),
    trimKind: 'beacon',
  };
}

/**
 * Le Fuji.
 *
 * Le profil d'un stratovolcan est concave et très étalé : trois mille sept cent
 * soixante-seize mètres pour une base de plus de trente kilomètres. En unités
 * de hauteur, il est donc trois fois plus large que haut - la seule silhouette
 * de ce module qui ne suive pas la règle des immeubles, et la raison pour
 * laquelle la règle est écrite en tête.
 *
 * Le sommet est PLAT : c'est la lèvre du cratère, large de sept cents mètres,
 * et sans elle la montagne se termine en pointe de crayon.
 */
function mountain(): Silhouette {
  const cone: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    cone.push([t, 0.09 + 3.0 * Math.pow(1 - t, 1.45)]);
  }
  const snow: [number, number][] = cone.filter(([y]) => y >= 0.6 - 1e-6);
  // La ligne de neige n'est pas horizontale sur une pente : on la fait
  // commencer au niveau exact où le cône passe, sinon la calotte flotte.
  const at = (y: number) => 0.09 + 3.0 * Math.pow(1 - y, 1.45);
  snow.unshift([0.6, at(0.6)]);
  return { body: strip(cone), trim: strip(snow), trimKind: 'snow' };
}

/**
 * Un pont suspendu : le Rainbow Bridge, seul repère de la boucle qui soit
 * horizontal.
 *
 * Deux pylônes, un tablier, et le câble en chaînette entre les deux - c'est
 * cette courbe qui fait lire « pont » et non « portique ». Le tout est étalé
 * sur dix unités de hauteur : cent vingt-sept mètres de pylône pour huit cents
 * mètres de travée centrale.
 */
function bridge(): Silhouette {
  const parts: THREE.BufferGeometry[] = [];
  const px = 3.14; // demi-travée centrale, en hauteurs de pylône.
  for (const s of [-1, 1]) {
    parts.push(rect(s * px - 0.075, 0, s * px + 0.075, 1));
    // Entretoise haute du pylône : le trait qui referme le portique.
    parts.push(rect(s * px - 0.075, 0.72, s * px + 0.075, 0.78));
  }
  // Tablier, prolongé par les viaducs d'accès des deux bords.
  parts.push(rect(-5.1, 0.36, 5.1, 0.43));
  // Câble porteur : chaînette échantillonnée en barreaux inclinés, épaissie de
  // quatre mètres pour rester visible - un vrai câble d'un mètre de diamètre
  // disparaîtrait, et une marche d'escalier se verrait.
  const N = 14;
  const sag = (x: number) => 0.5 + 0.5 * (x / px) * (x / px);
  for (let i = 0; i < N; i++) {
    const x0 = -px + (2 * px * i) / N;
    const x1 = -px + (2 * px * (i + 1)) / N;
    parts.push(bar(x0, sag(x0), x1, sag(x1), 0.03));
  }
  // Piles des viaducs d'accès, dans l'eau.
  for (const x of [-4.6, -3.9, 3.9, 4.6]) parts.push(rect(x - 0.05, 0, x + 0.05, 0.4));
  return {
    body: merge(parts),
    // L'éclairage du tablier : la ligne de lampadaires qui dessine la courbe
    // du pont sur la baie, et la seule chose qu'on en voit de nuit.
    trim: rect(-5.1, 0.43, 5.1, 0.47),
    trimKind: 'lights',
  };
}

/** Une silhouette neuve par famille. L'appelant en possède les géométries. */
export function makeSilhouette(shape: 'tower' | 'twin' | 'needle' | 'mountain' | 'bridge'): Silhouette {
  if (shape === 'needle') return needle();
  if (shape === 'twin') return twin();
  if (shape === 'mountain') return mountain();
  if (shape === 'bridge') return bridge();
  return tower();
}
