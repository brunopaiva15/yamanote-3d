// CE QUE LE VOLUME OCCUPE VRAIMENT, ET NON LA BOÎTE AUTOUR.
//
// `shellsOf` groupe les pièces continues et rend leur ENVELOPPE — un rectangle.
// Le rendu s'en servait pour tout : sol, plafond, parois. C'était juste tant
// qu'un hall était un couloir, où l'enveloppe EST la pièce. Ça ne l'est plus.
//
// À Shinagawa, la zone payante fait 45 m de large et le passage libre 111 :
// l'enveloppe en fait 3 547 m² là où les pièces en occupent 2 308. Il restait
// **1 239 m² de plancher fantôme** — dessiné, éclairé, entouré de murs, et
// impossible à fouler. Sur les trente gares : 6 345 m², et un seul volume sur
// trente-deux n'en avait pas. C'est ce que le joueur rapporte comme « les
// espaces sont vides, sans vie » et « des murs pas connectés » — et c'est aussi
// pourquoi « des bâtiments poppent de nulle part » : les immeubles de la ville
// n'ont pas bougé, c'est le plancher fantôme qui est venu par-dessus eux.
//
// CE FICHIER DIT OÙ S'ARRÊTE LE VOLUME. Les pièces d'un hall se suivent sur UN
// axe — dix-sept volumes en z, quinze en x — et débordent l'une sur l'autre en
// travers. On les range donc en BANDES le long de cet axe, chacune avec sa
// propre largeur, et le contour de l'union se lit alors sans géométrie savante :
// les flancs de chaque bande, et la marche entre deux bandes voisines.
//
// Les lignes de portillons comptent comme des pièces : on les franchit.

import type { ConcourseShell } from './stationConcourseBuild.ts';
import type { InteriorRect } from './stationInterior.ts';

/** Une tranche du volume : son étendue le long de l'axe, et sa largeur. */
export interface Band {
  /** Bornes le long de l'axe de suite. */
  a0: number;
  a1: number;
  /** Bornes en travers. */
  c0: number;
  c1: number;
}

export interface Footprint {
  /** Les pièces se suivent-elles en z ? Sinon, en x. */
  alongZ: boolean;
  bands: Band[];
}

/** Recouvrement total des rectangles sur un axe : l'axe de suite en a le moins. */
function overlapOn(rects: readonly InteriorRect[], onZ: boolean): number {
  let sum = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const lo = onZ ? Math.max(a.z0, b.z0) : Math.max(a.x0, b.x0);
      const hi = onZ ? Math.min(a.z1, b.z1) : Math.min(a.x1, b.x1);
      sum += Math.max(0, hi - lo);
    }
  }
  return sum;
}

/**
 * LE CONTOUR DU VOLUME, en bandes.
 *
 * L'axe de suite est celui sur lequel les pièces se recouvrent le MOINS : c'est
 * la définition la plus simple qui tienne les trente-deux volumes, et elle ne
 * demande aucune liste. Deux pièces qui se chevauchent encore sur cet axe — il
 * y en a, de quarante centimètres — fondent dans la même bande, ce qui est ce
 * qu'on veut : à cet endroit-là, le volume est aussi large que la plus large
 * des deux.
 */
export function footprintOf(shell: ConcourseShell): Footprint {
  const rects: InteriorRect[] = [
    ...shell.rooms.map((r) => r.rect),
    ...shell.gates.map((g) => g.rect),
  ];
  if (!rects.length) return { alongZ: true, bands: [] };
  const alongZ = overlapOn(rects, true) <= overlapOn(rects, false);
  const along = (r: InteriorRect) => (alongZ ? [r.z0, r.z1] : [r.x0, r.x1]);
  const across = (r: InteriorRect) => (alongZ ? [r.x0, r.x1] : [r.z0, r.z1]);

  const sorted = [...rects].sort((a, b) => along(a)[0] - along(b)[0]);
  const bands: Band[] = [];
  for (const r of sorted) {
    const [a0, a1] = along(r);
    const [c0, c1] = across(r);
    const last = bands[bands.length - 1];
    // Elles se chevauchent le long de l'axe : c'est la même tranche.
    if (last && a0 < last.a1 - 0.02) {
      last.a1 = Math.max(last.a1, a1);
      last.c0 = Math.min(last.c0, c0);
      last.c1 = Math.max(last.c1, c1);
      continue;
    }
    bands.push({ a0, a1, c0, c1 });
  }
  // LES INTERVALLES SE COMBLENT. Entre deux pièces il y a souvent une ligne de
  // portillons ou un simple jeu de deux centimètres ; laisser le trou ferait
  // une paroi de part et d'autre d'un passage qu'on franchit.
  for (let i = 1; i < bands.length; i++) {
    const gap = bands[i].a0 - bands[i - 1].a1;
    if (gap <= 0) continue;
    bands[i - 1].a1 += gap / 2;
    bands[i].a0 -= gap / 2;
  }
  return { alongZ, bands };
}

/** Ce qui est dans `[a0, a1]` et pas dans `[b0, b1]` : zéro, un ou deux bouts. */
export function without(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): [number, number][] {
  const out: [number, number][] = [];
  if (a0 < Math.min(a1, b0)) out.push([a0, Math.min(a1, b0)]);
  if (Math.max(a0, b1) < a1) out.push([Math.max(a0, b1), a1]);
  return out.filter(([p, q]) => q - p > 0.05);
}
