// Les nus du portique de porte palière ne se disputent pas la profondeur.
//
// Trois pièces se recouvrent au même endroit : le muret, le joint de rive qui
// en dépasse, et le bandeau uguisu qui les coiffe. Elles sont concentriques -
// même axe, épaisseurs croissantes - et il suffit que deux d'entre elles aient
// la même épaisseur pour que leurs faces tombent dans le MÊME PLAN.
//
// Ce n'est pas une faute qu'on voit en relisant le code : il faut que la porte
// s'ouvre pour que le joint remonte sous le bandeau, et alors deux plaques -
// une noire, une verte - clignotent l'une dans l'autre aux quarante baies du
// quai, à chaque arrêt. C'est exactement ce qui est arrivé le jour où le joint
// est passé de 7,6 cm (il était devant le muret) à 11 cm (il est dedans) : il a
// rejoint le nu du bandeau au millimètre près.
//
// Le test reconstruit donc les boîtes du portique, porte fermée puis porte
// ouverte, et vérifie qu'aucune paire de pièces qui SE RECOUVRENT n'a deux
// faces dans le même plan. Le seuil est à 2,5 mm : en dessous, le tampon de
// profondeur de ce rendu (proche à 5 cm) ne sépare plus rien passé une
// trentaine de mètres.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  PLATFORM_TOP,
  PSD_BAND_T,
  PSD_FACE_X,
  PSD_H,
  PSD_HALF_GAP,
  PSD_JOINT_T,
  PSD_LEAF_JOINT_W,
  PSD_LEAF_T,
  PSD_LEAF_TIP_INSET,
  PSD_LEAF_TRAVEL,
  PSD_LEAF_W,
  PSD_WALL_T,
  PSD_X,
} = await import('../src/data/stationGeometry.ts');

/** Écart en deçà duquel deux faces parallèles finissent par se confondre. */
const CLASH = 0.0025;

type Box = [number, number, number, number, number, number];

/** Une boîte donnée par son centre et ses côtés, comme les matrices du rendu. */
function box(cx: number, sx: number, cy: number, sy: number, cz: number, sz: number): Box {
  return [cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2];
}

/**
 * Le portique d'une baie prise à z = 0, avec le tronçon de muret qui la borde
 * côté +z. `open` est la course du vantail : 0 porte fermée.
 */
function portique(open: number): Record<string, Box> {
  const z0 = PSD_HALF_GAP;
  const z1 = PSD_HALF_GAP + 3.2;
  const mid = (z0 + z1) / 2;
  return {
    vantail: box(
      PSD_X,
      PSD_LEAF_T,
      PLATFORM_TOP + PSD_H / 2,
      PSD_H - 0.06,
      PSD_LEAF_W / 2 + open + PSD_LEAF_TIP_INSET,
      PSD_LEAF_W,
    ),
    joint: box(
      PSD_X,
      PSD_JOINT_T,
      PLATFORM_TOP + PSD_H / 2,
      PSD_H - 0.05,
      open + PSD_LEAF_JOINT_W / 2,
      PSD_LEAF_JOINT_W,
    ),
    muret: box(PSD_X, PSD_WALL_T, PLATFORM_TOP + PSD_H / 2, PSD_H, mid, z1 - z0),
    bandeau: box(
      PSD_X - 0.005,
      PSD_BAND_T,
      PLATFORM_TOP + PSD_H - 0.07,
      0.1,
      mid,
      z1 - z0 - 0.012,
    ),
    // La plaque de baie est un quad : une boîte d'épaisseur nulle.
    plaque: [PSD_FACE_X + 0.004, PSD_FACE_X + 0.004, PLATFORM_TOP + 0.66, PLATFORM_TOP + 1.05, z0 + 0.18, z0 + 0.58],
    affiche: [PSD_X + 0.056, PSD_X + 0.056, PLATFORM_TOP + 0.12, PLATFORM_TOP + 0.62, mid - 0.8, mid + 0.8],
    arrêtUrgence: box(PSD_X + 0.05, 0.09, PLATFORM_TOP + 0.94, 0.4, PSD_HALF_GAP + 1.6, 0.31),
  };
}

/** Recouvrement de deux boîtes sur un axe (négatif = elles ne se croisent pas). */
function span(a: Box, b: Box, axis: number): number {
  return Math.min(a[axis * 2 + 1], b[axis * 2 + 1]) - Math.max(a[axis * 2], b[axis * 2]);
}

/**
 * Les paires dont deux faces sont dans le même plan ALORS QUE les boîtes se
 * recouvrent dans les deux autres directions - la seule configuration où le
 * tampon de profondeur a un arbitrage à rendre.
 */
function clashes(parts: Record<string, Box>): string[] {
  const names = Object.keys(parts);
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = parts[names[i]];
      const b = parts[names[j]];
      for (let axis = 0; axis < 3; axis++) {
        if (span(a, b, (axis + 1) % 3) <= 1e-9) continue;
        if (span(a, b, (axis + 2) % 3) <= 1e-9) continue;
        for (const fa of [a[axis * 2], a[axis * 2 + 1]]) {
          for (const fb of [b[axis * 2], b[axis * 2 + 1]]) {
            if (Math.abs(fa - fb) < CLASH) {
              out.push(`${names[i]} ✕ ${names[j]} sur ${'xyz'[axis]} (${(Math.abs(fa - fb) * 1000).toFixed(1)} mm)`);
            }
          }
        }
      }
    }
  }
  return out;
}

test('aucun nu confondu, porte fermée', () => {
  assert.deepEqual(clashes(portique(0)), []);
});

test('aucun nu confondu, porte ouverte', () => {
  // C'est ici que le joint remonte sous le bandeau.
  assert.deepEqual(clashes(portique(PSD_LEAF_TRAVEL)), []);
});

test('les trois épaisseurs du portique sont étagées', () => {
  // Muret < joint < bandeau, et jamais moins de cinq millimètres entre deux
  // crans : c'est cet étagement qui garantit les deux tests ci-dessus, et il
  // se lit d'un coup d'œil là où eux demandent de reconstruire des boîtes.
  assert.ok(PSD_JOINT_T - PSD_WALL_T >= 0.005 - 1e-9);
  assert.ok(PSD_BAND_T - PSD_JOINT_T >= 0.005 - 1e-9);
});

test('le vantail garde son jeu dans le muret', () => {
  // Rentré, il ne doit toucher aucune des deux joues de sa poche - sinon les
  // deux faces se confondent sur toute la hauteur de la porte.
  assert.ok((PSD_WALL_T - PSD_LEAF_T) / 2 >= CLASH);
});
