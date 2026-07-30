// Pool de visuels publicitaires de gare, partagé par tout ce qui en affiche :
// caissons du quai, colonnes habillées, bannières suspendues, allèges de portes
// palières, parois des trémies d'escalier.
//
// Construit UNE FOIS pour toute la session, et non par gare : dessiner vingt
// canvas à chaque arrêt coûterait une saccade à chaque entrée en gare. C'est
// l'AGENCEMENT qui change d'une gare à l'autre - décalage du tirage par index
// de gare - pas les images.
//
// Les visuels sont des caissons RÉTROÉCLAIRÉS : MeshBasicMaterial, hors
// éclairage et hors tone mapping. C'est ce qui les rend francs de jour et
// lumineux la nuit, et c'est aussi ce que fait un vrai caisson publicitaire.

import * as THREE from 'three';
import { makeAdTexture, makeMannersPetTexture } from '../../textures/procedural';

/** Nombre de visuels distincts par orientation. */
const LANDSCAPE = 12;
const PORTRAIT = 9;

export interface AdPool {
  landscape: THREE.MeshBasicMaterial[];
  portrait: THREE.MeshBasicMaterial[];
  /** Monture noire des caissons. */
  frame: THREE.MeshStandardMaterial;
  /** Dos et joues de caisson, blanc cassé. */
  housing: THREE.MeshStandardMaterial;
}

let pool: AdPool | null = null;

export function adPool(): AdPool {
  if (pool) return pool;
  // `bold` : fonds francs uniquement. Une affiche à fond crème sur un quai de
  // béton clair ne se voit tout simplement pas.
  const basic = (seed: number, portrait: boolean) =>
    new THREE.MeshBasicMaterial({ map: makeAdTexture(seed, portrait, true), toneMapped: false });
  // Une affiche sur neuf n'est pas une réclame mais un rappel de manières -
  // celle des animaux, dont les règles pilotent aussi systems/petCarriers.
  // Une seule dans le pool : on la croise de loin en loin, et pas deux fois
  // dans le même champ de vision.
  const manners = new THREE.MeshBasicMaterial({ map: makeMannersPetTexture(256, 1024), toneMapped: false });
  pool = {
    landscape: Array.from({ length: LANDSCAPE }, (_, i) => basic(5100 + i, false)),
    portrait: Array.from({ length: PORTRAIT }, (_, i) => (i === 4 ? manners : basic(5300 + i, true))),
    frame: new THREE.MeshStandardMaterial({ color: '#17191d', roughness: 0.5, metalness: 0.25 }),
    housing: new THREE.MeshStandardMaterial({ color: '#e6e4de', roughness: 0.55 }),
  };
  return pool;
}

/** Un visuel du pool, tiré de façon stable pour une gare et un rang donnés. */
export function stationAd(station: number, i: number, portrait = false): THREE.MeshBasicMaterial {
  const p = adPool();
  const mats = portrait ? p.portrait : p.landscape;
  return mats[(i * 3 + station * 5 + (i % 2)) % mats.length];
}
