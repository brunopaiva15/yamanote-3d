// L'about de la voiture du joueur : masquer le flanc sans boucher la travée.
//
// Deux exigences opposées se rencontrent à cet endroit précis, et rien dans le
// code ne les rappelle une fois qu'on y retouche.
//
// D'un côté, l'intérieur du wagon est modélisé jusqu'à z = ±10 alors que la
// caisse extérieure s'arrête à ±9,8 : la paroi d'about et les parois roses de
// la zone prioritaire débordent donc dans l'intervalle entre deux caisses, et
// sans rien pour les couvrir on lit un liseré rose au droit de chaque about
// depuis le quai. C'est la raison d'être du soufflet.
//
// De l'autre, la voiture du joueur est la seule à avoir un VRAI intérieur, et
// on le regarde depuis le quai par la porte ouverte. Toute pièce de la coque
// posée en travers de la caisse le tranche alors en pleine travée prioritaire -
// celle des places réservées et de la フリースペース. Deux s'y sont mises tour à
// tour : le soufflet en volume plein, qui empiète de 25 cm dans chaque caisse,
// puis les plaques d'about de la peau inox, à z = ±9,77. La travée s'achevait
// sur un pan noir, puis sur un pan gris, à la place de la paroi d'about, de ses
// affiches et de sa porte d'intercirculation. Et rien ne le signalait de
// l'intérieur, où la caisse extérieure est éteinte.
//
// D'où ces tests : rien de la coque ni du soufflet dans le gabarit intérieur,
// et pas une ligne de visée depuis le quai qui atteigne le rose.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { CONFIG } = await import('../src/data/config.ts');
const { E235 } = await import('../src/data/e235.ts');
const { buildCarGeometries } = await import('../src/three/exterior/carShellGeometry.ts');

type Geo = { getAttribute: (n: string) => Attr; getIndex: () => Attr | null };
type Attr = { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number };

/** Gabarit intérieur : le vide que le voyageur voit, parois comprises. */
const CLEAR_HALF_W = CONFIG.carHalfWidth - 0.08; // nu intérieur des parois
const CLEAR_H = CONFIG.carHeight;
/** Nu extérieur du rose, qu'il faut noyer, et peau de caisse, qu'il faut fuir. */
const PINK_OUTER_X = CONFIG.carHalfWidth + 0.04;
const GAP = E235.pitch - E235.bodyHalfLen * 2;
/** Tolérance : sous le millimètre, deux nus sont le même nu. */
const EPS = 0.001;

const geos = buildCarGeometries();

/** Boîte englobante de chaque triangle d'une géométrie. */
function triangleBoxes(geo: Geo): { min: number[]; max: number[] }[] {
  const pos = geo.getAttribute('position');
  const index = geo.getIndex();
  const count = index ? index.count : pos.count;
  const at = (k: number) => {
    const i = index ? index.getX(k) : k;
    return [pos.getX(i), pos.getY(i), pos.getZ(i)];
  };
  const out: { min: number[]; max: number[] }[] = [];
  for (let k = 0; k < count; k += 3) {
    const v = [at(k), at(k + 1), at(k + 2)];
    out.push({
      min: [0, 1, 2].map((a) => Math.min(v[0][a], v[1][a], v[2][a])),
      max: [0, 1, 2].map((a) => Math.max(v[0][a], v[1][a], v[2][a])),
    });
  }
  return out;
}

/** Rien de `geo` ne doit traverser la section transversale du décor intérieur. */
function assertGabaritLibre(geo: Geo, quoi: string): void {
  for (const t of triangleBoxes(geo)) {
    const inX = t.min[0] < CLEAR_HALF_W - EPS && t.max[0] > -CLEAR_HALF_W + EPS;
    const inY = t.min[1] < CLEAR_H - EPS && t.max[1] > EPS;
    assert.ok(
      !(inX && inY),
      `${quoi} dans la travée : x ${t.min[0].toFixed(2)}..${t.max[0].toFixed(2)}, ` +
        `y ${t.min[1].toFixed(2)}..${t.max[1].toFixed(2)}, ` +
        `z ${t.min[2].toFixed(2)}..${t.max[2].toFixed(2)}`,
    );
  }
}

test('le soufflet ne pose rien dans le gabarit intérieur du wagon', () => {
  // Le gabarit est ouvert en z : le soufflet traverse l'about de part en part,
  // c'est la section transversale qui doit rester libre.
  assertGabaritLibre(geos.bellows as unknown as Geo, 'soufflet');
});

test('la coque de la voiture du joueur laisse sa travée libre', () => {
  assertGabaritLibre(geos.bodyOpen as unknown as Geo, 'coque');
});

test('les dix autres voitures gardent leurs plaques d’about', () => {
  // Elles n'ont qu'une doublure : sans ces plaques on verrait au travers de la
  // rame. Le test n'a de sens que si les deux peaux diffèrent vraiment.
  const pleine = triangleBoxes(geos.body as unknown as Geo);
  const ouverte = triangleBoxes(geos.bodyOpen as unknown as Geo);
  assert.ok(pleine.length > ouverte.length, 'les deux peaux sont identiques');
  const bouchons = pleine.filter(
    (t) => t.min[0] < CLEAR_HALF_W && t.max[0] > -CLEAR_HALF_W && t.min[1] < CLEAR_H && t.max[1] > 0,
  );
  assert.ok(bouchons.length > 0, 'la peau pleine ne ferme plus l’about');
  for (const t of bouchons) {
    assert.ok(
      Math.abs(t.min[2]) > E235.bodyHalfLen - 0.1,
      `plaque d’about égarée en z ${t.min[2].toFixed(2)}`,
    );
  }
});

test('la joue du soufflet masque tout le flanc de l’intervalle, sans saillir', () => {
  const tris = triangleBoxes(geos.bellows as unknown as Geo);
  // Les faces opaques posées AU-DELÀ du nu rose : ce sont elles qui arrêtent
  // le regard venu du quai avant qu'il n'atteigne la paroi de la travée.
  const ecrans = tris.filter(
    (t) => Math.abs(t.max[0] - t.min[0]) < EPS && t.min[0] >= PINK_OUTER_X - EPS,
  );
  assert.ok(ecrans.length > 0, 'aucune face au-delà du nu rose');

  // On tire un rayon horizontal depuis le quai en chaque point de la section
  // de l'intervalle, sur toute la hauteur du décor intérieur.
  for (let y = 0.02; y < CLEAR_H; y += 0.19) {
    for (let z = -GAP / 2; z <= GAP / 2 + EPS; z += GAP / 8) {
      const arrete = ecrans.some(
        (t) => t.min[1] <= y && t.max[1] >= y && t.min[2] <= z && t.max[2] >= z,
      );
      assert.ok(arrete, `flanc à nu en y ${y.toFixed(2)}, z ${z.toFixed(2)}`);
    }
  }

  // Et rien ne dépasse de la peau de caisse.
  const pos = (geos.bellows as unknown as Geo).getAttribute('position');
  let maxX = -Infinity;
  for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, Math.abs(pos.getX(i)));
  assert.ok(maxX <= E235.halfWidth, 'le soufflet saille sur le flanc');
});
