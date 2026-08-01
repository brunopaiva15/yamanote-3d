// Les plaques de baie : 「N号車 M番ドア」, à gauche de chaque paire de portes.
//
// C'est le repère que tout le monde utilise sur un quai japonais. On ne dit pas
// « la porte du milieu » : on dit 6号車 2番ドア, et c'est écrit là, sur le
// caisson où le vantail s'efface, à hauteur d'épaule. Dessous, la bande de
// pictogrammes - un triangle jaune et trois anneaux rouges.
//
// Le numéro n'est pas décoratif : il se DÉDUIT de la position de la baie sur
// le quai (psdLayout.gateLabel), qui est bâti sur la trame de la rame. La baie
// devant laquelle le joueur descend porte donc le numéro de SA voiture, la
// même que les repères peints au sol deux mètres derrière lui.
//
// Quarante-quatre plaques toutes différentes, et pourtant deux appels de rendu :
// les cartouches vont chercher leur case dans un atlas commun (textures/
// psdPlate), la bande d'avertissements est la même image pour toutes, et les
// quads sont fondus en deux géométries.

import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  PLATFORM_TOP,
  PSD_HALF_GAP,
  PSD_WALL_T,
  PSD_X,
} from '../../data/stationGeometry';
import { gatePlateAtlas, gatePlateUv, gateWarningTexture } from '../../textures/psdPlate';
import { gateLabel, type PsdSpan } from './psdLayout';

/** Largeur de l'adhésif (le long du quai) et hauteur de ses deux bandes. */
const PLATE_W = 0.4;
const HEADER_H = 0.19;
const WARN_H = 0.2;

/** Haut du cartouche au-dessus du sol du quai : sous le bandeau, à hauteur d'œil. */
const PLATE_TOP = 1.05;

/**
 * Retrait du chant de la baie. La plaque est collée près de la porte - c'est
 * pour elle qu'on la lit - mais pas à cheval sur le montant.
 */
const PLATE_NEAR = 0.18;

/** Quatre millimètres devant la face du caisson : un adhésif, pas une gravure. */
const PLATE_X = PSD_X + PSD_WALL_T / 2 + 0.004;

interface Quad {
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/**
 * Un seul tampon pour tous les quads.
 *
 * Le plan regarde le quai (+x) ; vu de là, +z part vers la GAUCHE, et les u
 * de la texture doivent donc décroître avec z - sinon chaque plaque s'affiche
 * en miroir et le 6号車 se lit à l'envers.
 */
function quadGeometry(quads: readonly Quad[]): THREE.BufferGeometry {
  const position = new Float32Array(quads.length * 18);
  const normal = new Float32Array(quads.length * 18);
  const uv = new Float32Array(quads.length * 12);
  let p = 0;
  let t = 0;
  for (const q of quads) {
    const corners: [number, number, number, number][] = [
      [q.z1, q.y0, q.u0, q.v0],
      [q.z0, q.y0, q.u1, q.v0],
      [q.z0, q.y1, q.u1, q.v1],
      [q.z1, q.y0, q.u0, q.v0],
      [q.z0, q.y1, q.u1, q.v1],
      [q.z1, q.y1, q.u0, q.v1],
    ];
    for (const [z, y, u, v] of corners) {
      position[p] = PLATE_X;
      position[p + 1] = y;
      position[p + 2] = z;
      normal[p] = 1;
      normal[p + 1] = 0;
      normal[p + 2] = 0;
      p += 3;
      uv[t] = u;
      uv[t + 1] = v;
      t += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Les baies qui peuvent porter leur plaque.
 *
 * Il faut du caisson plein à gauche de la baie pour la coller : au bout du
 * quai, la trame tombe où elle tombe et le dernier tronçon peut ne faire que
 * quelques centimètres. Une plaque y aurait flotté dans le vide, au-delà du
 * muret.
 */
function plated(gates: readonly number[], segs: readonly PsdSpan[]): number[] {
  const need = PSD_HALF_GAP + PLATE_NEAR + PLATE_W + 0.04;
  return gates.filter((g) => segs.some((s) => s.z0 < g + PSD_HALF_GAP + 0.01 && s.z1 >= g + need));
}

export interface GatePlatesProps {
  /** Axes des baies du quai. */
  gates: readonly number[];
  /** Murets, pour savoir de quel côté il y a de quoi coller. */
  segs: readonly PsdSpan[];
}

export function GatePlates({ gates, segs }: GatePlatesProps) {
  const { header, warn } = useMemo(() => {
    const heads: Quad[] = [];
    const warns: Quad[] = [];
    for (const g of plated(gates, segs)) {
      // Côté GAUCHE quand on fait face à la voie, c'est-à-dire vers +z.
      const z0 = g + PSD_HALF_GAP + PLATE_NEAR;
      const z1 = z0 + PLATE_W;
      const top = PLATFORM_TOP + PLATE_TOP;
      const { car, door } = gateLabel(g);
      heads.push({ z0, z1, y0: top - HEADER_H, y1: top, ...gatePlateUv(car, door) });
      warns.push({
        z0,
        z1,
        y0: top - HEADER_H - WARN_H,
        y1: top - HEADER_H,
        u0: 0,
        u1: 1,
        v0: 0,
        v1: 1,
      });
    }
    return { header: quadGeometry(heads), warn: quadGeometry(warns) };
  }, [gates, segs]);

  // Les matériaux tiennent la session entière : l'atlas ne dépend pas de la
  // gare, seule la découpe change. Les géométries, elles, sont refaites à
  // chaque quai - c'est sa longueur qui décide du nombre de baies.
  const mats = useMemo(() => plateMaterials(), []);
  useLayoutEffect(
    () => () => {
      header.dispose();
      warn.dispose();
    },
    [header, warn],
  );

  return (
    <group name="plaques-baie">
      <mesh geometry={header} material={mats.header} />
      <mesh geometry={warn} material={mats.warn} />
    </group>
  );
}

let materials: { header: THREE.MeshStandardMaterial; warn: THREE.MeshStandardMaterial } | null = null;

/**
 * Adhésif mat, pas caisson lumineux : ces plaques sont éclairées par le quai
 * comme le caisson qui les porte. Un rappel d'émissif les garde lisibles sous
 * un auvent, où plus aucune lumière directe n'arrive - le même que celui de
 * toutes les surfaces claires de la gare.
 */
function plateMaterials() {
  if (materials) return materials;
  const skin = (map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: '#ffffff',
      emissiveIntensity: 0.16,
      roughness: 0.74,
      metalness: 0,
    });
  materials = { header: skin(gatePlateAtlas()), warn: skin(gateWarningTexture()) };
  return materials;
}
