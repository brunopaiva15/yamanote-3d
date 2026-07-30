// Triangulation des surfaces CityGML et mesures géométriques.
//
// Les polygones CityGML sont plans (ou presque) mais quelconques : concaves,
// percés de trous (gml:interior), et orientés dans n'importe quelle direction.
// On calcule leur normale par la formule de Newell, on les rabat sur le plan
// de coordonnées le plus favorable, on triangule avec earcut, puis on remet
// chaque triangle dans le bon sens en comparant sa normale à celle du
// polygone - ce recollement rend le pipeline indifférent au sens de rotation
// choisi par le producteur de données.

import earcutModule from 'earcut';

const earcut = earcutModule.default ?? earcutModule;

/** Normale non normalisée d'un anneau 3D (formule de Newell). */
export function newellNormal(ring) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

/** Retire le sommet de fermeture s'il double le premier. */
export function openRing(ring) {
  if (ring.length < 2) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  const same =
    Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9;
  return same ? ring.slice(0, -1) : ring;
}

/** Aire d'un polygone 3D plan (somme des normales de Newell / 2). */
export function polygonArea(ring) {
  const [nx, ny, nz] = newellNormal(openRing(ring));
  return Math.hypot(nx, ny, nz) / 2;
}

/**
 * Triangule un polygone 3D (anneau extérieur + trous).
 * `ring` et `holes` sont des listes de `[x, y, z]`.
 * Renvoie `{ positions: number[], normal: [x,y,z], triangles: number }`,
 * positions étant les triangles à plat (9 nombres par triangle).
 */
export function triangulatePolygon(ring, holes = []) {
  const outer = openRing(ring);
  if (outer.length < 3) return null;
  const raw = newellNormal(outer);
  const len = Math.hypot(raw[0], raw[1], raw[2]);
  if (!(len > 1e-12)) return null; // surface dégénérée (colinéaire)
  const normal = [raw[0] / len, raw[1] / len, raw[2] / len];

  // Axe dominant : on projette sur le plan qui conserve le plus d'aire.
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const u = drop === 0 ? 1 : 0;
  const v = drop === 2 ? 1 : 2;

  const flat = [];
  const vertices = [];
  const holeIndices = [];
  const push = (list) => {
    for (const p of list) {
      flat.push(p[u], p[v]);
      vertices.push(p);
    }
  };
  push(outer);
  for (const hole of holes) {
    const open = openRing(hole);
    if (open.length < 3) continue;
    holeIndices.push(vertices.length);
    push(open);
  }

  const indices = earcut(flat, holeIndices, 2);
  if (indices.length < 3) return null;

  const positions = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]];
    const b = vertices[indices[i + 1]];
    const c = vertices[indices[i + 2]];
    // Normale du triangle : si elle s'oppose à celle du polygone, on inverse.
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const tn = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const dot = tn[0] * normal[0] + tn[1] * normal[1] + tn[2] * normal[2];
    if (dot >= 0) positions.push(...a, ...b, ...c);
    else positions.push(...a, ...c, ...b);
  }
  return { positions, normal, triangles: positions.length / 9 };
}

/** Boîte englobante d'une liste plate de positions (stride 3). */
export function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}
