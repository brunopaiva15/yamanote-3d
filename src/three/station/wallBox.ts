// Une boîte dont la texture est à l'échelle du BÂTIMENT, pas de la boîte.
//
// LE PROBLÈME. Les UV d'une BoxGeometry vont de 0 à 1 sur chaque face, quelle
// que soit sa taille. Un mur de fond de 224 m et une joue de trémie de 1,5 m
// reçoivent donc exactement la même image, l'une étirée cent cinquante fois
// plus que l'autre. Régler `repeat` sur la texture ne sauve rien : elle est
// partagée par les deux, et le pas qui va au mur donne du moiré sur la joue.
//
// LA RÈGLE. `repeat` reste à (1, 1) et c'est la GÉOMÉTRIE qui porte l'échelle :
// on multiplie u (et v, pour un plafond) par la dimension réelle divisée par le
// module de la texture. Une tuile fait alors toujours ses 2,40 m de mur ou ses
// 1,20 m de plafond, sur le mur de fond comme sur la joue.
//
// POURQUOI v RESTE ENTIER SUR UN MUR. `wallBox` ne touche pas à v : une tuile
// de mur couvre TOUTE la hauteur, du pied au couronnement. C'est ce qui permet
// à `textures/stationWall` d'y peindre une crasse de pied et une suie de haut
// qui tombent au bon endroit sur un mur de 2,60 m comme sur un mur de 5 m -
// alors qu'un v répété les aurait fait réapparaître en pleine hauteur.
//
// Les petites boîtes qui n'appellent rien d'ici gardent leurs UV d'origine : une
// tuile pour toute la face. À l'échelle d'un coffret ou d'une joue de deux
// mètres, c'est justement la bonne.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

type Dim = 'w' | 'h' | 'd';

/**
 * Pour chacune des six faces d'une BoxGeometry, dans l'ordre où three les
 * construit (+x, -x, +y, -y, +z, -z) : la dimension que parcourt u, puis celle
 * que parcourt v.
 */
const FACE_UV: readonly (readonly [Dim, Dim])[] = [
  ['d', 'h'],
  ['d', 'h'],
  ['w', 'd'],
  ['w', 'd'],
  ['w', 'h'],
  ['w', 'h'],
];

function scaleUv(
  geo: THREE.BoxGeometry,
  dims: Record<Dim, number>,
  moduleU: number,
  moduleV: number | null,
): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const [du, dv] = FACE_UV[f];
    const su = dims[du] / moduleU;
    const sv = moduleV === null ? 1 : dims[dv] / moduleV;
    // Une face sans segment intermédiaire, c'est quatre sommets consécutifs.
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
}

/**
 * Boîte de mur : la texture se répète au pas réel en largeur, et couvre la
 * hauteur d'un seul tenant.
 *
 * À appeler directement quand les cotes sont des constantes de module - une
 * trémie a les mêmes dans les trente gares, et la géométrie n'a alors aucune
 * raison d'être refaite ni libérée. Sinon, `useWallBox`.
 */
export function wallBoxGeometry(
  w: number,
  h: number,
  d: number,
  module: number,
): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleUv(g, { w, h, d }, module, null);
  return g;
}

/** Boîte de dalle : la texture se répète au pas réel dans les deux sens. */
export function panelBoxGeometry(
  w: number,
  h: number,
  d: number,
  module: number,
): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleUv(g, { w, h, d }, module, module);
  return g;
}

function useBox(
  make: (w: number, h: number, d: number, module: number) => THREE.BoxGeometry,
  w: number,
  h: number,
  d: number,
  module: number,
): THREE.BoxGeometry {
  const geo = useMemo(() => make(w, h, d, module), [make, w, h, d, module]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/** `wallBoxGeometry`, refaite et libérée quand les cotes changent de gare. */
export function useWallBox(w: number, h: number, d: number, module: number): THREE.BoxGeometry {
  return useBox(wallBoxGeometry, w, h, d, module);
}

/** `panelBoxGeometry`, refaite et libérée quand les cotes changent de gare. */
export function usePanelBox(w: number, h: number, d: number, module: number): THREE.BoxGeometry {
  return useBox(panelBoxGeometry, w, h, d, module);
}
