// À la gare, le décor doit être à la gare.
//
// C'est l'invariant que le paysage n'avait pas, et son absence se voyait : en
// sortant de Shin-Ōkubo, toute la ville montait au-dessus du sol.
//
// LE MÉCANISME. Le décor ne se repère pas en mètres d'odomètre mais en FRACTION
// de tronçon : `loopSOfWorld` lit `(worldS - anchor.s) / anchor.span` et reporte
// cette fraction sur la table des abscisses de gare. C'est la bonne idée - les
// tronçons du jeu sont plus longs que les vrais, seule la proportion se
// transporte. Mais `anchor.span` était MESURÉ APRÈS COUP : on chronométrait le
// tronçon qu'on venait de finir et on s'en servait comme mètre-étalon du
// suivant. Or les tronçons de la boucle vont du simple au quadruple - cinq
// cents mètres entre Nippori et Nishi-Nippori, deux kilomètres entre Ōsaki et
// Shinagawa. La fraction était donc lue avec le mauvais mètre, et l'abscisse de
// boucle dérivait de plusieurs centaines de mètres avant de se recaler d'un
// coup à la gare suivante.
//
// Ce n'était pas une erreur d'arrondi : jusqu'à quinze cents mètres d'abscisse,
// soit dix mètres d'altitude là où la Yamanote monte sur le plateau. Le relief
// du 国土地理院 est lu à cette abscisse-là - et le ruban urbain avec lui.
//
// La longueur du tronçon EN COURS est connue d'avance (`segmentLength` intègre
// le profil de traction). Il n'y a jamais eu besoin de la mesurer.

import test from 'node:test';
import assert from 'node:assert/strict';

import { cityAnchor, updateCityAnchor } from '../src/systems/cityField.ts';
import { loopSOfWorld, trackAt, updateTerrain } from '../src/systems/terrain.ts';
import { LOOP_PERIMETER, STATION_S } from '../src/systems/tokyoBearing.ts';
import { segmentLength } from '../src/systems/trainPhysics.ts';
import { directionStep, wrapStation } from '../src/data/loop.ts';
import { STATIONS } from '../src/data/stations.ts';
import { runtime } from '../src/systems/runtime.ts';

/** Écart d'abscisses, replié sur la boucle. */
function gap(a: number, b: number): number {
  let d = a - b;
  if (d > LOOP_PERIMETER / 2) d -= LOOP_PERIMETER;
  if (d < -LOOP_PERIMETER / 2) d += LOOP_PERIMETER;
  return d;
}

/**
 * Fait rouler la rame sur `legs` inter-gares depuis `start`, exactement comme
 * le cycle station le fait : l'index avance au départ, l'odomètre gagne la
 * longueur du tronçon, l'ancre et le relief se mettent à jour à chaque image.
 *
 * Renvoie l'écart entre l'abscisse de boucle LUE à l'arrêt et celle de la gare.
 */
function ride(dir: 'inner' | 'outer', start: number, legs: number) {
  const step = directionStep(dir);
  runtime.distance = 0;
  let index = wrapStation(start + step);
  const out: { gare: string; ds: number; dy: number; midMax: number }[] = [];
  for (let leg = 0; leg < legs; leg++) {
    const len = segmentLength(index, dir);
    let midMax = 0;
    for (let k = 0; k <= 40; k++) {
      const p = k / 40;
      if (k > 0) runtime.distance += len / 40;
      updateCityAnchor(index, p, dir);
      updateTerrain(runtime.distance, cityAnchor);
      // En cours de route, la fraction lue doit être celle qu'on parcourt : on
      // compare à l'interpolation exacte entre les deux gares.
      const from = wrapStation(index - step);
      let d = STATION_S[index] - STATION_S[from];
      if (step > 0 && d < 0) d += LOOP_PERIMETER;
      if (step < 0 && d > 0) d -= LOOP_PERIMETER;
      midMax = Math.max(midMax, Math.abs(gap(loopSOfWorld(runtime.distance), STATION_S[from] + d * p)));
    }
    const got = loopSOfWorld(runtime.distance);
    out.push({
      gare: STATIONS[index].romaji,
      ds: gap(got, STATION_S[index]),
      dy: trackAt(got) - trackAt(STATION_S[index]),
      midMax,
    });
    index = wrapStation(index + step);
  }
  return out;
}

for (const dir of ['inner', 'outer'] as const) {
  test(`${dir} : à l’arrêt, l’abscisse de boucle est celle de la gare`, () => {
    // Un tour complet : aucun tronçon ne doit s'en tirer par chance.
    for (const r of ride(dir, 0, 30)) {
      assert.ok(
        Math.abs(r.ds) < 1,
        `${r.gare} : le décor est à ${r.ds.toFixed(0)} m de la gare (${r.dy.toFixed(1)} m d’altitude)`,
      );
    }
  });

  test(`${dir} : entre deux gares, la fraction parcourue est la fraction lue`, () => {
    for (const r of ride(dir, 0, 30)) {
      assert.ok(
        r.midMax < 1,
        `${r.gare} : jusqu’à ${r.midMax.toFixed(0)} m d’écart en cours de tronçon`,
      );
    }
  });
}

test('le tronçon en cours ne se déduit pas du précédent', () => {
  // Nippori→Nishi-Nippori est le plus court de la boucle, Ōsaki→Shinagawa le
  // plus long. Si l'un servait de mètre-étalon à l'autre, l'ancre porterait la
  // mauvaise longueur, et c'est exactement ce qui arrivait.
  const lengths = STATIONS.map((_, i) => segmentLength(i, 'inner'));
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  assert.ok(max / min > 2, `tronçons trop semblables pour que le test morde (${min}/${max})`);

  runtime.distance = 0;
  // On roule jusqu'au tronçon le plus long, puis on vérifie que l'ancre porte
  // SA longueur et non celle d'avant.
  const longest = lengths.indexOf(max);
  const step = directionStep('inner');
  let index = wrapStation(longest - 3);
  for (let leg = 0; leg < 4; leg++) {
    const len = segmentLength(index, 'inner');
    updateCityAnchor(index, 0, 'inner');
    assert.equal(
      +cityAnchor.span.toFixed(3),
      +len.toFixed(3),
      `${STATIONS[index].romaji} : l’ancre porte ${cityAnchor.span.toFixed(0)} m au lieu de ${len.toFixed(0)}`,
    );
    runtime.distance += len;
    index = wrapStation(index + step);
  }
});
