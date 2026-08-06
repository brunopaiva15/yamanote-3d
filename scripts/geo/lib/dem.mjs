// Lire l'altitude du sol japonais, tuile par tuile.
//
// Le 国土地理院 publie son modèle numérique de terrain en tuiles XYZ de texte :
// 256 × 256 valeurs en mètres, séparées par des virgules, une ligne par rangée
// de pixels, et la lettre « e » là où il n'y a pas de donnée - la mer, pour
// l'essentiel. C'est le format le plus simple qui soit, et il n'a besoin
// d'aucune dépendance.
//
//   dem       DEM10B, maille nominale 10 m, couverture nationale
//   dem5a     DEM5A, maille 5 m, levé LiDAR, couverture partielle
//
// Ce module ne prend que le DEM10B : le DEM5A ne couvre pas tout le rayon de
// cinquante kilomètres de la bible, et un décor bâti sur deux jeux d'altitude
// aurait des marches là où l'un s'arrête. Dix mètres de maille, c'est déjà bien
// au-delà de ce que le décor sait montrer.
//
// LE ZOOM CHOISIT LA MAILLE. La tuile couvre 360/2^z degrés de longitude, soit
// environ 1 986 m au zoom 14 à la latitude de Tokyo, et 256 pixels dedans :
//
//   z14  ~7,8 m/px   la voie et son corridor
//   z12  ~31 m/px    la bande de vingt kilomètres
//   z9   ~248 m/px   le relief régional, jusqu'à Tanzawa et Chichibu
//
// ⚠️ CES ALTITUDES SONT ORTHOMÉTRIQUES (au-dessus du géoïde japonais), là où
// d'autres sources publient des hauteurs ELLIPSOÏDALES. L'écart vaut ~36-37 m à
// Tokyo. Il est constant à l'échelle de la ville, donc invisible tant qu'on ne
// mêle pas les deux ; scripts/geo/lib/geo.mjs le note déjà de son côté.

import { gsiTile } from './net.mjs';

const D2R = Math.PI / 180;

/** (lon, lat) → coordonnées de tuile fractionnaires, au zoom `z`. */
export function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin(lat * D2R);
  const y = ((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  return { x, y };
}

/** Taille au sol d'un pixel de tuile (m), à une latitude donnée. */
export function pixelMeters(lat, z) {
  return (156543.03392 * Math.cos(lat * D2R)) / 2 ** z;
}

/**
 * Échantillonneur d'altitude. Charge les tuiles à la demande, les garde en
 * mémoire, et interpole bilinéairement entre les quatre pixels voisins.
 *
 * `sample` renvoie `null` hors couverture - la mer, ou l'étranger. C'est une
 * information, pas une erreur : le trait de côte du chantier 3 s'en sert.
 */
export class Dem {
  constructor({ zoom = 14, force = false } = {}) {
    this.zoom = zoom;
    this.force = force;
    this.tiles = new Map();
    this.misses = 0;
    this.hits = 0;
  }

  key(tx, ty) {
    return `${tx}/${ty}`;
  }

  /** Précharge la grille de tuiles couvrant une emprise (lon/lat). */
  async load(minLon, minLat, maxLon, maxLat, { label = 'MNT' } = {}) {
    const a = tileXY(minLon, maxLat, this.zoom);
    const b = tileXY(maxLon, minLat, this.zoom);
    const x0 = Math.floor(a.x);
    const x1 = Math.floor(b.x);
    const y0 = Math.floor(a.y);
    const y1 = Math.floor(b.y);
    const total = (x1 - x0 + 1) * (y1 - y0 + 1);
    let done = 0;
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        await this.tile(tx, ty);
        done++;
        if (done % 25 === 0 || done === total) {
          process.stdout.write(`\r  ${label} z${this.zoom} : ${done}/${total} tuiles`);
        }
      }
    }
    process.stdout.write(`\r  ${label} z${this.zoom} : ${total} tuiles, ${this.misses} hors couverture\n`);
  }

  async tile(tx, ty) {
    const k = this.key(tx, ty);
    const seen = this.tiles.get(k);
    if (seen !== undefined) return seen;
    const url = `https://cyberjapandata.gsi.go.jp/xyz/dem/${this.zoom}/${tx}/${ty}.txt`;
    const text = await gsiTile(url, { force: this.force });
    if (text === null) {
      this.tiles.set(k, null);
      this.misses++;
      return null;
    }
    const grid = new Float32Array(256 * 256);
    const rows = text.trimEnd().split('\n');
    for (let r = 0; r < 256; r++) {
      const cols = rows[r]?.split(',');
      for (let c = 0; c < 256; c++) {
        const v = cols?.[c];
        grid[r * 256 + c] = v === undefined || v === 'e' || v === '' ? NaN : Number(v);
      }
    }
    this.tiles.set(k, grid);
    this.hits++;
    return grid;
  }

  /**
   * Altitude (m) en (lon, lat), ou `null` hors couverture.
   * Synchrone : les tuiles doivent avoir été préchargées par `load`.
   */
  sample(lon, lat) {
    const t = tileXY(lon, lat, this.zoom);
    const px = (t.x - Math.floor(t.x)) * 256 - 0.5;
    const py = (t.y - Math.floor(t.y)) * 256 - 0.5;
    const i0 = Math.floor(px);
    const j0 = Math.floor(py);
    const fx = px - i0;
    const fy = py - j0;
    let sum = 0;
    let weight = 0;
    for (const [di, dj, w] of [
      [0, 0, (1 - fx) * (1 - fy)],
      [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy],
      [1, 1, fx * fy],
    ]) {
      const v = this.pixel(Math.floor(t.x), Math.floor(t.y), i0 + di, j0 + dj);
      if (v === null || Number.isNaN(v)) continue;
      sum += v * w;
      weight += w;
    }
    // Un quart de pixel de donnée suffit : sur le trait de côte, trois pixels
    // sur quatre sont en mer et le quatrième porte la vraie altitude du quai.
    return weight > 0.25 ? sum / weight : null;
  }

  /** Pixel (i, j) d'une tuile, en débordant sur les tuiles voisines. */
  pixel(tx, ty, i, j) {
    let ax = tx;
    let ay = ty;
    let bi = i;
    let bj = j;
    if (bi < 0) {
      ax -= 1;
      bi += 256;
    } else if (bi > 255) {
      ax += 1;
      bi -= 256;
    }
    if (bj < 0) {
      ay -= 1;
      bj += 256;
    } else if (bj > 255) {
      ay += 1;
      bj -= 256;
    }
    const grid = this.tiles.get(this.key(ax, ay));
    if (!grid) return null;
    return grid[bj * 256 + bi];
  }
}
