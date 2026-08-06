// Les nappes du niveau du sol, et le trou que le quai y fait.
//
// Deux surfaces horizontales courent le long de la voie, un mètre sous la
// dalle du quai : le ballast (three/Wayside, de l'axe à ±5 m) et la rue de la
// ville (three/city/CityRibbon, de 5 m vers l'extérieur). Le quai les masque
// toutes deux - sauf au droit d'une TRÉMIE D'ESCALIER, dont la volée descend
// plus bas qu'elles. Elles traversaient alors la cage de part en part : un
// plancher gris à mi-hauteur des marches, qui cachait le bas de la volée, le
// palier et son fléchage de sortie.
//
// Les écarter sur TOUTE leur longueur ne marche pas : elles font quatre cent
// soixante mètres, le quai deux cent vingt, et au-delà de ses abouts il n'y a
// plus rien pour couvrir ce qu'on découvre - on voyait le ciel entre le
// ballast et la première rue. Une nappe se dérobe donc PAR TRONÇONS : pleine
// largeur partout, rentrée seulement sur l'emprise du quai, et le raccord se
// fait en biseau sur une vingtaine de mètres pour qu'aucune arête ne coure en
// travers de la voie.
//
// La texture suit les sommets : les UV se recalculent avec les abscisses,
// sinon ballast, traverses et caniveaux s'écrasaient au droit de la gare au
// lieu de s'y raccourcir.

import * as THREE from 'three';

/**
 * Découpe en long : vingt mètres environ par tronçon, c'est la maille la plus
 * grossière où le biseau d'about (TAPER, 22 m) reste une pente et non une
 * marche. Elle se déduit donc de la LONGUEUR, et ne peut pas être une constante
 * - une nappe de mille deux cents mètres découpée en vingt-quatre donnerait
 * cinquante mètres par tronçon, et le biseau redeviendrait un ressaut.
 */
function segmentsFor(length: number): number {
  return Math.max(8, Math.min(96, Math.round(length / 19)));
}

export interface GroundStrip {
  geometry: THREE.BufferGeometry;
  /**
   * Repose la rive. `edgeAt(z, x)` reçoit l'abscisse LOCALE au repos d'un
   * sommet de rive et le z monde de sa ligne, et rend l'abscisse locale voulue.
   */
  update(edgeAt: (z: number, x: number) => number): void;
  /**
   * Relève la nappe. `heightAt(z, x)` reçoit la position LOCALE au repos d'un
   * sommet et rend sa cote (m).
   *
   * La rue de la ville n'est plus horizontale depuis que le relief du
   * 国土地理院 est entré dans le décor : elle monte vers la falaise du plateau à
   * Nishi-Nippori, elle plonge dans la cuvette de Shibuya. Sans ce relèvement,
   * les bâtiments montaient et descendaient au-dessus d'un bitume resté plat.
   */
  lift(heightAt: (z: number, x: number) => number): void;
  dispose(): void;
}

/**
 * Une nappe horizontale, à plat dans le plan (x, z) et prête à se dérober.
 *
 * `width` × `length` et les UV sont exactement ceux d'un PlaneGeometry couché
 * - c'est d'ailleurs de là qu'ils viennent, pour que le calage de texture des
 * appelants (repeat, offset défilant) continue de valoir mot pour mot.
 *
 * `widthSegments` vaut un par défaut : une nappe qui reste plate n'a besoin que
 * de ses deux rives. Celle qui suit le relief en demande davantage, sans quoi
 * quatre cents mètres de travers seraient interpolés en ligne droite et la
 * falaise deviendrait une rampe.
 */
export function makeGroundStrip(
  width: number,
  length: number,
  widthSegments = 1,
): GroundStrip {
  const geometry = new THREE.PlaneGeometry(width, length, widthSegments, segmentsFor(length));
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  // Abscisses et cotes AU REPOS : la mise à jour part toujours d'elles, jamais
  // de la pose précédente, sinon la rive dérivait d'image en image.
  const restX = new Float32Array(pos.count);
  const restZ = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    restX[i] = pos.getX(i);
    restZ[i] = pos.getZ(i);
  }

  return {
    geometry,
    update(edgeAt) {
      let moved = false;
      for (let i = 0; i < pos.count; i++) {
        const x = edgeAt(restZ[i], restX[i]);
        if (x !== pos.getX(i)) {
          pos.setX(i, x);
          uv.setX(i, (x + width / 2) / width);
          moved = true;
        }
      }
      if (moved) {
        pos.needsUpdate = true;
        uv.needsUpdate = true;
      }
    },
    lift(heightAt) {
      let moved = false;
      for (let i = 0; i < pos.count; i++) {
        const y = heightAt(restZ[i], restX[i]);
        if (y !== pos.getY(i)) {
          pos.setY(i, y);
          moved = true;
        }
      }
      // Les normales ne sont PAS recalculées, et c'est délibéré : elles
      // resteraient verticales à un degré près - la plus forte pente du
      // corridor, la falaise de Yanaka, fait moins de dix pour cent sur la
      // largeur d'une maille - et les recalculer coûterait un parcours de mille
      // triangles à chaque image pour une nuance d'éclairage invisible sur un
      // bitume. Ce qui compte est que la rue MONTE, pas qu'elle s'ombre.
      if (moved) pos.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
    },
  };
}

/** Longueur du biseau à chaque about de quai (m). */
const TAPER = 22;

/**
 * Part de la rentrée à appliquer en `z` : pleine sur l'emprise du quai, nulle
 * au-delà, et un biseau entre les deux. `z0`/`z1` sont les abouts en repère
 * monde, tels que systems/stationOcclusion les publie.
 */
export function underStation(z: number, z0: number, z1: number): number {
  if (z <= z0 || z >= z1) return 0;
  return Math.min(
    THREE.MathUtils.smoothstep(z - z0, 0, TAPER),
    THREE.MathUtils.smoothstep(z1 - z, 0, TAPER),
  );
}
