// Menuiserie d'un vantail de porte palière.
//
// Un vantail n'est pas une plaque : c'est un CADRE qui tient une vitre. La
// traverse basse est haute comme la main, la traverse haute est plus mince, et
// deux montants ferment les chants ; entre les quatre, du verre - et derrière
// le verre, la rame. C'est tout ce qui distingue une ホームドア d'un portillon
// de chantier, et c'est ce qu'on voit en premier en descendant sur le quai.
//
// Les deux géométries sont écrites dans la BOÎTE UNITÉ : Station.tsx pose les
// vantaux par une matrice d'échelle (0,07 × PSD_H-0,06 × PSD_LEAF_W), et les
// mêmes matrices servent au cadre et à la vitre. Les cotes ci-dessous sont donc
// des FRACTIONS, calculées à partir des centimètres qu'on veut voir.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PSD_H, PSD_LEAF_W } from '../../data/stationGeometry';

/** Hauteur et largeur réelles d'un vantail, telles que Station les met à l'échelle. */
const LEAF_H = PSD_H - 0.06;
const LEAF_W = PSD_LEAF_W;

/** Traverse basse : 16 cm, la seule partie pleine qu'on regarde de près. */
const RAIL_LOW = 0.16 / LEAF_H;
/** Traverse haute : 10 cm, sous le linteau. */
const RAIL_HIGH = 0.1 / LEAF_H;
/** Montants de chant : 5 cm de chaque côté. */
const STILE = 0.05 / LEAF_W;

/** Une boîte définie par ses bornes plutôt que par son centre. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Le cadre seul : deux traverses et deux montants, dans la boîte unité. */
export function psdLeafFrameGeometry(): THREE.BufferGeometry {
  const yLow = -0.5 + RAIL_LOW;
  const yHigh = 0.5 - RAIL_HIGH;
  return mergeGeometries(
    [
      box(-0.5, 0.5, -0.5, yLow, -0.5, 0.5),
      box(-0.5, 0.5, yHigh, 0.5, -0.5, 0.5),
      box(-0.5, 0.5, yLow, yHigh, -0.5, -0.5 + STILE),
      box(-0.5, 0.5, yLow, yHigh, 0.5 - STILE, 0.5),
    ],
    false,
  ) as THREE.BufferGeometry;
}

/**
 * La vitre : plus MINCE que le cadre (elle est feuillurée dedans, pas posée
 * dessus), et mordant de quelques millimètres sous les traverses - un jour
 * entre le verre et le cadre aurait laissé voir la voie par une fente.
 */
export function psdLeafGlassGeometry(): THREE.BufferGeometry {
  const bite = 0.004 / LEAF_H;
  const biteZ = 0.004 / LEAF_W;
  return box(
    -0.2,
    0.2,
    -0.5 + RAIL_LOW - bite,
    0.5 - RAIL_HIGH + bite,
    -0.5 + STILE - biteZ,
    0.5 - STILE + biteZ,
  );
}
