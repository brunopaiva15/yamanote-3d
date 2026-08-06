// L'épaisseur de l'air, partagée par les couches lointaines.
//
// Trois couches regardent au-delà du ruban urbain : les repères de Tokyo
// (three/city/FarSkyline), le relief du 国土地理院 (three/city/FarRelief), et
// la silhouette peinte du ciel (three/city/SkyDome). Elles doivent s'effacer
// ENSEMBLE, sinon le jour où le Fuji disparaît dans la moiteur d'août, le
// Tanzawa qui est deux fois plus près resterait net derrière lui - et l'œil
// lit ça immédiatement comme une erreur, même sans savoir nommer ce qui cloche.
//
// D'où ce module minuscule : une seule loi d'extinction, une seule portée.

import { seasonNow } from '../../systems/season';
import { weather } from '../../systems/weather';

/**
 * Portée de référence de l'air (m), pour une clarté de 1.
 *
 * L'extinction suit une exponentielle en distance - la loi de Beer, celle de la
 * brume de three/Scene -, et cette échelle-ci est bien plus longue que la
 * portée de la brume de scène : la brume de scène ferme le décor à cinq cents
 * mètres, alors qu'un repère de cinq kilomètres reste parfaitement lisible par
 * temps clair à Tokyo. Les deux ne décrivent pas la même chose : l'une est un
 * mur de fin de décor, l'autre l'épaisseur réelle de l'atmosphère.
 *
 * Calage : par un janvier sec (clarté ≈ 1,3), la portée approche quatre-vingts
 * kilomètres - la tour de Tokyo est franche, Yokohama se devine, le Fuji est un
 * fantôme bleu. Par un août moite (clarté ≈ 0,7), elle tombe à vingt : le Fuji
 * a disparu, la tour de Tokyo se voile. Sous l'averse, il ne reste rien
 * au-delà du kilomètre.
 */
export const AIR_RANGE = 46000;

/** Au-delà, il ne reste rien à peindre qui se distingue du ciel. */
export const VEIL_MAX = 0.94;

/**
 * Portée du moment (m) : la clarté de la saison, moins ce que le temps lui
 * retire. C'est le même produit qui commande la portée de la brume de scène et
 * le voile du ciel - trois couches, un seul air.
 */
export function airRange(): number {
  const se = seasonNow();
  const air = Math.max(0.15, se.clarity * weather.visibility * (1 - 0.75 * weather.cloud));
  return AIR_RANGE * air * air;
}

/** Part de brume à `d` mètres : 0 = franc, 1 = confondu avec le ciel. */
export function veilAt(d: number, range: number): number {
  return 1 - Math.exp(-d / range);
}

/**
 * Distance (m) au-delà de laquelle une masse opaque ne doit plus être peinte.
 *
 * C'est l'inverse de `veilAt` en `VEIL_MAX`. Une couche opaque poussée jusqu'au
 * bout du voile ne disparaît pas vraiment : elle prend la couleur de la brume,
 * qui n'est jamais exactement celle du ciel derrière elle, et il en reste un
 * fantôme. Mieux vaut la retirer une fois pour toutes.
 */
export function veilCutoff(range: number): number {
  return -range * Math.log(1 - VEIL_MAX);
}
