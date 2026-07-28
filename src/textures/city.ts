// Textures du ruban urbain (three/city/CityRibbon).
//
// Trois tuiles, toutes exprimées EN MÈTRES et non en fraction de bâtiment :
// le nuanceur calcule l'UV dans l'espace monde local de chaque instance, si
// bien qu'un étage fait trois mètres sur une tour de cinquante comme sur une
// échoppe de six. C'est ce qui fait qu'un bâtiment a une taille — un motif
// étiré sur toute une façade, lui, se lit comme du papier peint.
//
// Ce sont des DataTexture et non des CanvasTexture, à dessein : le canal alpha
// ne porte pas de la transparence mais des MASQUES (aléa d'allumage des
// fenêtres, bandeaux de devanture, néons), et un canvas 2D stocke ses pixels en
// alpha prémultiplié — un alpha nul y écraserait la couleur.

import * as THREE from 'three';
import { rng } from './procedural';

/** Côté de la tuile de façade, en mètres (4 travées × 4 niveaux de 3 m). */
export const FACADE_TILE = 12;
/** Tuile de toiture, en mètres. */
export const ROOF_TILE = 12;
/** Tuile de devanture : 8 m de large sur les 3 premiers mètres de hauteur. */
export const SOCLE_TILE: [number, number] = [8, 3];

// --- Masques portés par le canal alpha (lus par le nuanceur) ---
// Façade : 0 = mur, > 0 = vitrage, la valeur étant l'aléa d'allumage nocturne.
// Devanture : 0 = mur, 0,35 = bandeau d'enseigne (teinte du quartier),
//             0,75 = vitrine (lueur chaude), 1 = néon.
const A_ACCENT = 89; // 0,35 × 255
const A_GLASS = 191; // 0,75 × 255
const A_NEON = 255;

function rect(
  d: Uint8Array,
  W: number,
  H: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const xa = Math.max(0, Math.round(x0));
  const ya = Math.max(0, Math.round(y0));
  const xb = Math.min(W, Math.round(x0 + w));
  const yb = Math.min(H, Math.round(y0 + h));
  for (let y = ya; y < yb; y++) {
    let i = (y * W + xa) * 4;
    for (let x = xa; x < xb; x++) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
      i += 4;
    }
  }
}

function toTexture(data: Uint8Array, W: number, H: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Façade courante : quatre travées sur quatre niveaux de trois mètres.
 *
 * Le RGB est une MODULATION (il multiplie la teinte d'instance, propre au
 * quartier) : mur clair, meneaux et nez de dalle plus sourds, vitrage bleuté.
 * L'alpha porte, pour chaque vitrage, un tirage stable qui décide de l'ordre
 * d'allumage à la tombée du jour — les fenêtres s'allument par paquets au fil
 * de la soirée au lieu de basculer toutes ensemble.
 */
export function makeFacadeTexture(): THREE.DataTexture {
  const S = 256;
  const CELL = S / 4; // 64 px = 3 m
  const d = new Uint8Array(S * S * 4);
  const r = rng(0x5ea51de);

  rect(d, S, S, 0, 0, S, S, 236, 233, 228, 0);
  for (let fy = 0; fy < 4; fy++) {
    const y = fy * CELL;
    // Nez de dalle : la ligne horizontale qui donne l'échelle d'un immeuble.
    rect(d, S, S, 0, y, S, 5, 205, 201, 194, 0);
    rect(d, S, S, 0, y + 5, S, 2, 222, 218, 212, 0);
    for (let fx = 0; fx < 4; fx++) {
      const x = fx * CELL;
      rect(d, S, S, x, y, 4, CELL, 216, 212, 205, 0); // meneau vertical
      rect(d, S, S, x + 10, y + 12, 44, 40, 116, 118, 123, 0); // encadrement
      // Vitrage. L'aléa est borné bas pour rester distinguable du mur après
      // filtrage mip (où alpha se moyenne avec les zéros voisins).
      const lit = 26 + Math.floor(r() * 229);
      rect(d, S, S, x + 13, y + 15, 38, 34, 148, 166, 187, lit);
      rect(d, S, S, x + 13, y + 15, 38, 6, 168, 184, 202, lit); // imposte
    }
  }
  return toTexture(d, S, S);
}

/**
 * Toiture vue de trois quarts : la Yamanote court sur viaduc la moitié de la
 * boucle, on regarde donc des toits, pas seulement des façades. Étanchéité
 * grise, joints de lés, blocs techniques et un réservoir clair.
 */
export function makeRoofTexture(): THREE.DataTexture {
  const S = 128; // 12 m
  const d = new Uint8Array(S * S * 4);
  const r = rng(0x0f00f);
  rect(d, S, S, 0, 0, S, S, 118, 117, 112, 0);
  for (let i = 0; i < S; i += 16) {
    rect(d, S, S, 0, i, S, 1, 100, 99, 95, 0); // joints de lés
  }
  for (let i = 0; i < 5; i++) {
    const w = 14 + Math.floor(r() * 22);
    const h = 10 + Math.floor(r() * 16);
    const x = Math.floor(r() * (S - w));
    const y = Math.floor(r() * (S - h));
    rect(d, S, S, x, y, w, h, 86, 86, 90, 0); // groupes techniques
    rect(d, S, S, x, y + h - 3, w, 3, 66, 66, 70, 0);
  }
  rect(d, S, S, 86, 20, 22, 20, 168, 165, 156, 0); // réservoir
  rect(d, S, S, 86, 36, 22, 4, 92, 90, 87, 0);
  return toTexture(d, S, S);
}

/** Côté de la tuile de sol urbain, en mètres (calé sur la cellule du ruban). */
export const GROUND_TILE = 40;

/**
 * Sol urbain vu d'en haut, entre les bâtiments : parcelles, cours, petites
 * toitures, ruelles. C'est ce qui remplace la nappe de béton uniforme de
 * cent soixante mètres qui courait sous toute la ville — la seule surface
 * assez large pour ruiner à elle seule l'illusion de profondeur.
 *
 * Rien de directionnel : les rues du ruban sont engendrées à part et ne
 * sauraient s'aligner sur une tuile. On cherche un TISSU, pas un plan.
 */
export function makeCityGroundTexture(): THREE.DataTexture {
  const S = 256; // 40 m
  const d = new Uint8Array(S * S * 4);
  const r = rng(0x6c0117);
  rect(d, S, S, 0, 0, S, S, 92, 91, 88, 255); // enrobé de fond

  // Parcelles : dalles, cours, petites toitures. Les tons restent proches —
  // c'est la fragmentation qui compte, pas le contraste.
  for (let i = 0; i < 46; i++) {
    const w = 12 + Math.floor(r() * 46);
    const h = 12 + Math.floor(r() * 46);
    const x = Math.floor(r() * S);
    const y = Math.floor(r() * S);
    const t = r();
    const c =
      t < 0.34
        ? [116, 113, 108]
        : t < 0.58
          ? [100, 98, 95]
          : t < 0.76
            ? [80, 86, 74]
            : t < 0.9
              ? [124, 120, 113]
              : [72, 71, 70];
    // Enroulement manuel : la tuile doit rester continue d'un bord à l'autre.
    for (const dx of [0, -S, S]) {
      for (const dy of [0, -S, S]) {
        rect(d, S, S, x + dx, y + dy, w, h, c[0], c[1], c[2], 255);
      }
    }
  }
  // Ruelles : de fines saignées sombres, dans les deux sens.
  for (let i = 0; i < 10; i++) {
    const along = r() < 0.5;
    const p = Math.floor(r() * S);
    const t = 3 + Math.floor(r() * 4);
    if (along) rect(d, S, S, 0, p, S, t, 66, 65, 64, 255);
    else rect(d, S, S, p, 0, t, S, 66, 65, 64, 255);
  }
  const t = toTexture(d, S, S);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Devanture : les trois premiers mètres, là où vit tout le caractère d'une rue
 * de Tokyo. Deux locaux de quatre mètres, vitrine, bandeau d'enseigne, store,
 * et de loin en loin un néon vertical.
 *
 * Comme pour la façade, le RGB module et l'alpha désigne : le bandeau prend la
 * teinte d'accent du quartier, la vitrine s'allume chaud, le néon éclate.
 */
export function makeSocleTexture(): THREE.DataTexture {
  const W = 256; // 8 m
  const H = 96; // 3 m — la ligne 0 est AU SOL (DataTexture ne retourne pas V).
  const d = new Uint8Array(W * H * 4);
  const r = rng(0x50c1e);
  rect(d, W, H, 0, 0, W, H, 132, 128, 123, 0);

  for (let bay = 0; bay < 2; bay++) {
    const x = bay * 128;
    rect(d, W, H, x + 2, 0, 124, H, 118, 114, 110, 0); // trumeau
    rect(d, W, H, x + 8, 2, 112, 62, 214, 203, 186, A_GLASS); // vitrine
    rect(d, W, H, x + 8, 2, 112, 5, 128, 120, 110, 0); // seuil
    rect(d, W, H, x + 60, 2, 5, 62, 128, 122, 114, 0); // meneau de vitrine
    rect(d, W, H, x + 6, 64, 116, 16, 248, 245, 240, A_ACCENT); // bandeau d'enseigne
    rect(d, W, H, x + 6, 80, 116, 14, 216, 212, 208, A_ACCENT); // store
    for (let s = 0; s < 6; s++) {
      // Rayures du store, une sur deux neutre.
      if (s % 2 === 0) rect(d, W, H, x + 6 + s * 19, 80, 19, 14, 246, 244, 240, 0);
    }
    if (r() < 0.6) rect(d, W, H, x + 112, 8, 12, 74, 255, 250, 244, A_NEON); // néon vertical
  }
  return toTexture(d, W, H);
}
