// La géographie tient-elle debout ?
//
// src/data/tokyoGeo.ts est engendré depuis data/geo/yamanote-loop.geojson, que
// scripts/geo/fetch-loop.mjs va chercher chez OpenStreetMap. Un import n'est pas
// une saisie, mais il a ses propres façons de se tromper : recoudre la mauvaise
// voie, la parcourir à l'envers, prendre l'embranchement à une jonction,
// attribuer à une gare le point d'arrêt de sa voisine. Toutes se voient à
// l'écran sous la forme d'un Skytree au sud.
//
// Ce que ce fichier verrouille, dans l'ordre de ce qui compte :
//
//   · la FORME de la boucle - trente gares dont le relèvement autour du centre
//     tourne toujours dans le même sens : c'est ce qui interdit à une gare de
//     partir ailleurs, et c'est la propriété la plus difficile à obtenir par
//     accident ;
//   · sa LONGUEUR, contre le kilométrage JR de src/data/segments.ts ;
//   · l'ACCORD DES DEUX SOURCES sur chaque gare : le point d'arrêt relevé et le
//     milieu de quai publié doivent désigner le même endroit ;
//   · quelques RELÈVEMENTS que n'importe qui peut vérifier sur une carte : le
//     Skytree à l'est d'Ueno, le Fuji au sud-ouest de Shinjuku, le 都庁 à l'ouest
//     de la gare de Shinjuku ;
//   · la CONTINUITÉ du cap, sans quoi l'horizon lointain sauterait d'un bloc.
//
// La comparaison au kilométrage reste volontairement large PAR TRONÇON. Le
// barème JR est arrondi à cent mètres - un inter-gare de cinq cents mètres porte
// donc déjà ±10 % de quantification - et il se mesure entre des points de
// référence de gare qui ne sont pas les points d'arrêt : à Ueno, seize voies
// séparent les deux. Sur la BOUCLE ENTIÈRE, en revanche, ces écarts se
// compensent et l'accord doit être serré : c'est le meilleur contrôle qu'on ait
// de l'import.

import test from 'node:test';
import assert from 'node:assert/strict';
import { GEO_LANDMARKS, GEO_LEG_M, GEO_LOOP, GEO_STATIONS } from '../src/data/tokyoGeo.ts';
import { LOOP_KM, SEGMENT_KM } from '../src/data/segments.ts';
import { STATIONS } from '../src/data/stations.ts';
import { LOOP_PERIMETER, loopPose, makePose, sightTo } from '../src/systems/tokyoBearing.ts';

const DEG = 180 / Math.PI;

/** Relèvement vrai (degrés, 0 = nord, sens horaire) de a vers b. */
function bearingDeg(ax: number, az: number, bx: number, bz: number): number {
  const d = Math.atan2(bx - ax, -(bz - az)) * DEG;
  return (d + 360) % 360;
}

test('trente gares, dans l’ordre de src/data/stations.ts', () => {
  assert.equal(GEO_STATIONS.length, STATIONS.length);
  for (let i = 0; i < GEO_STATIONS.length; i++) {
    assert.equal(GEO_STATIONS[i].index, i);
    assert.equal(GEO_STATIONS[i].jy, STATIONS[i].jy);
    // Tokyo est l'origine du repère.
    if (i === 0) {
      assert.ok(Math.hypot(GEO_STATIONS[0].x, GEO_STATIONS[0].z) < 1);
    }
  }
});

test('la boucle est une boucle : le relèvement tourne toujours du même sens', () => {
  const cx = GEO_STATIONS.reduce((s, st) => s + st.x, 0) / GEO_STATIONS.length;
  const cz = GEO_STATIONS.reduce((s, st) => s + st.z, 0) / GEO_STATIONS.length;
  let turned = 0;
  for (let i = 0; i < GEO_STATIONS.length; i++) {
    const a = GEO_STATIONS[i];
    const b = GEO_STATIONS[(i + 1) % GEO_STATIONS.length];
    // Toutes les gares se tiennent à quelques kilomètres du centre. La boucle
    // n'est pas ronde - elle est étirée du nord au sud, d'Ikebukuro à Ōsaki -
    // mais elle n'a pas d'excroissance : de deux kilomètres et demi (Yūrakuchō,
    // presque au centre du côté est) à sept et demi (Ōsaki, la pointe).
    const r = Math.hypot(a.x - cx, a.z - cz);
    assert.ok(r > 2000 && r < 8000, `${a.name} à ${Math.round(r)} m du centre`);
    let d = bearingDeg(cx, cz, b.x, b.z) - bearingDeg(cx, cz, a.x, a.z);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    // Vu du centre, la gare suivante est TOUJOURS plus loin dans le même sens.
    // Une seule gare mal placée casse cette propriété.
    assert.ok(d < -0.5, `${a.name} → ${b.name} : ${d.toFixed(1)}° au centre`);
    turned += d;
  }
  // Un tour complet, et un seul.
  assert.ok(Math.abs(turned + 360) < 1, `tour total ${turned.toFixed(1)}°`);
});

test('la longueur de la boucle retombe sur le kilométrage JR', () => {
  const total = GEO_LEG_M.reduce((s, m) => s + m, 0);
  const km = LOOP_KM * 1000;
  const off = total / km - 1;
  // L'axe relevé et le barème JR mesurent la même voie : l'accord est au
  // quart de pour cent, soit moins que l'arrondi du barème lui-même. Le seuil
  // est serré à dessein - c'est lui qui a attrapé la couture qui partait sur
  // l'embranchement d'Ikebukuro, et sautait quatre cent soixante-dix mètres en
  // travers de la gare : la boucle mesurait alors 1,3 % de trop.
  assert.ok(Math.abs(off) < 0.01, `boucle ${total} m contre ${km} m (${(off * 100).toFixed(1)} %)`);
  assert.ok(Math.abs(LOOP_PERIMETER - total) < 60, `périmètre échantillonné ${LOOP_PERIMETER}`);
});

test('les deux sources s’accordent sur chaque point d’arrêt', () => {
  for (const st of GEO_STATIONS) {
    // Le point d'arrêt vient de la voie relevée, le milieu de quai d'une donnée
    // publiée : deux chaînes indépendantes. Une centaine de mètres est normale
    // dans une gare qui compte seize voies - Tabata, Shinjuku, Ueno sont les
    // trois plus larges écarts. Au-delà, c'est un point d'arrêt attribué à la
    // mauvaise gare.
    assert.ok(
      st.offset < 150,
      `${st.name} : ${st.offset} m entre le point d’arrêt et le milieu de quai`,
    );
  }
  const mean = GEO_STATIONS.reduce((s, st) => s + st.offset, 0) / GEO_STATIONS.length;
  assert.ok(mean < 60, `écart moyen ${mean.toFixed(0)} m`);
});

test('chaque inter-gare retombe sur le kilométrage de son tronçon', () => {
  assert.equal(GEO_LEG_M.length, SEGMENT_KM.length);
  for (let i = 0; i < GEO_LEG_M.length; i++) {
    const km = SEGMENT_KM[i] * 1000;
    const off = GEO_LEG_M[i] / km - 1;
    assert.ok(
      Math.abs(off) < 0.3,
      `tronçon ${i} (${GEO_STATIONS[i].name}→${GEO_STATIONS[(i + 1) % 30].name}) : ` +
        `${GEO_LEG_M[i]} m contre ${km} m (${(off * 100).toFixed(0)} %)`,
    );
  }
});

test('les repères sont là où une carte les met', () => {
  const by = (id: string) => {
    const l = GEO_LANDMARKS.find((x) => x.id === id);
    assert.ok(l, `repère ${id} absent`);
    return l!;
  };
  const st = (name: string) => {
    const s = GEO_STATIONS.find((x) => x.name === name);
    assert.ok(s, `gare ${name} absente`);
    return s!;
  };

  // Faits vérifiables, un par quadrant. Tolérance large : ce sont les
  // ORIENTATIONS qu'on verrouille, pas des minutes d'arc.
  const cases: [string, string, number, number, number][] = [
    // repère, gare, relèvement attendu (°), tolérance (°), distance max (km)
    ['skytree', 'Ueno', 73, 25, 5],
    ['skytree', 'Tokyo', 43, 25, 8],
    ['fuji', 'Shinjuku', 248, 12, 120],
    ['fuji', 'Shibuya', 250, 12, 120],
    ['tocho', 'Shinjuku', 268, 25, 2],
    ['sunshine60', 'Ikebukuro', 94, 30, 2],
    ['tokyo-tower', 'Hamamatsucho', 289, 30, 2.5],
    ['rainbow', 'Hamamatsucho', 145, 35, 3.5],
  ];
  for (const [id, station, want, tol, maxKm] of cases) {
    const l = by(id);
    const s = st(station);
    let d = bearingDeg(s.x, s.z, l.x, l.z) - want;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    assert.ok(Math.abs(d) < tol, `${id} vu de ${station} : ${d.toFixed(0)}° d'écart`);
    const km = Math.hypot(l.x - s.x, l.z - s.z) / 1000;
    assert.ok(km < maxKm, `${id} vu de ${station} : ${km.toFixed(1)} km`);
  }

  // Le Fuji est à une centaine de kilomètres, et c'est tout l'enjeu : il
  // n'apparaît que par temps sec.
  const fujiKm = Math.hypot(by('fuji').x - st('Shinjuku').x, by('fuji').z - st('Shinjuku').z) / 1000;
  assert.ok(fujiKm > 85 && fujiKm < 110, `Fuji à ${fujiKm.toFixed(0)} km de Shinjuku`);
  assert.equal(by('fuji').height, 3776);
});

test('la pose tombe sur le quai à l’arrêt, dans les deux sens', () => {
  const pose = makePose();
  for (let i = 0; i < 30; i++) {
    for (const dir of ['inner', 'outer'] as const) {
      // p = 1 : le train est à quai.
      loopPose(i, 1, dir, pose);
      const st = GEO_STATIONS[i];
      const off = Math.hypot(pose.x - st.x, pose.z - st.z);
      assert.ok(off < 2, `${st.name} ${dir} : ${off.toFixed(1)} m du quai`);
    }
  }
});

test('les deux sens de marche ont des caps opposés', () => {
  const a = makePose();
  const b = makePose();
  for (let i = 0; i < 30; i++) {
    // Même point de la boucle : la gare i. Les caps doivent différer de 180°.
    loopPose(i, 1, 'inner', a);
    loopPose(i, 1, 'outer', b);
    let d = (a.bearing - b.bearing) * DEG;
    d = ((d % 360) + 360) % 360;
    assert.ok(Math.abs(d - 180) < 0.01, `gare ${i} : ${d.toFixed(2)}° entre les deux sens`);
  }
});

test('le cap est continu tout le long de la boucle', () => {
  const pose = makePose();
  let prev: number | null = null;
  let worst = 0;
  // Un tour complet, échantillonné tous les demi-pour-cent de trajet - soit
  // tous les cinq mètres environ.
  for (let k = 0; k <= 6000; k++) {
    const t = k / 200;
    const arrival = (Math.floor(t) + 1) % 30;
    loopPose(arrival, t % 1, 'inner', pose);
    if (prev !== null) {
      let d = (pose.bearing - prev) * DEG;
      d = ((((d + 180) % 360) + 360) % 360) - 180;
      worst = Math.max(worst, Math.abs(d));
    }
    prev = pose.bearing;
  }
  // Le pire est la pointe sud-ouest, à Ōsaki : la voie y tourne de cent
  // quarante degrés. Ailleurs c'est dix fois moins.
  assert.ok(worst < 6, `saut de cap maximal ${worst.toFixed(1)}°`);
});

test('un repère passe d’un bord de la vitre à l’autre, sans saut', () => {
  const pose = makePose();
  const sight = { azimuth: 0, distance: 0 };
  const tower = GEO_LANDMARKS.find((l) => l.id === 'tokyo-tower')!;
  let prevSide = 0;
  let prevAz = 0;
  const crossings: number[] = [];
  for (let k = 0; k <= 3000; k++) {
    const t = k / 100;
    const arrival = (Math.floor(t) + 1) % 30;
    loopPose(arrival, t % 1, 'inner', pose);
    sightTo(pose, tower.x, tower.z, sight);
    assert.ok(sight.azimuth > -Math.PI - 1e-9 && sight.azimuth <= Math.PI + 1e-9);
    const side = Math.sign(sight.azimuth);
    if (prevSide && side && side !== prevSide) crossings.push(Math.abs(prevAz) * DEG);
    prevSide = side;
    prevAz = sight.azimuth;
  }
  // La tour de Tokyo est à l'intérieur de la boucle : en faisant le tour, elle
  // reste du même côté du train, sauf quand on va DROIT SUR ELLE ou droit à
  // l'opposé - et là elle traverse la vitre par le milieu ou par l'arrière.
  //
  // Ce qui serait faux, c'est un changement de côté alors qu'elle est par le
  // travers : ce serait un cap qui tremble. On ne compte donc pas les passages,
  // on vérifie OÙ ils ont lieu. La voie relevée en produit six et non quatre -
  // la boucle a des courbes qui ramènent brièvement le nez vers la tour - mais
  // tous se font droit devant ou droit derrière.
  assert.ok(crossings.length > 0, 'la tour ne traverse jamais l’axe');
  for (const at of crossings) {
    assert.ok(at < 25 || at > 155, `changement de côté à ${at.toFixed(0)}° du sens de marche`);
  }
});

test('la polyligne est l’axe relevé, pas une suite de cordes', () => {
  const extra = GEO_LOOP.filter((p) => p.station < 0).length;
  assert.equal(GEO_LOOP.length, GEO_STATIONS.length + extra);
  // La table saisie à la main en portait six. L'axe relevé en porte des
  // centaines, et c'est la différence entre couper les virages et les suivre.
  assert.ok(extra > 200, `${extra} sommets hors gares`);
  // Les sommets sont dans l'ordre : chaque gare apparaît une fois, croissante.
  let last = -1;
  for (const p of GEO_LOOP) {
    if (p.station < 0) continue;
    assert.equal(p.station, last + 1);
    last = p.station;
  }
  assert.equal(last, 29);

  // Aucun segment de longueur nulle : il ferait diverger la tangente. Les plus
  // longs, eux, sont de vrais alignements droits que la simplification a
  // réduits à une corde - la tranchée de Komagome vers Sugamo et la ligne
  // droite de Harajuku vers Shibuya font toutes deux près de huit cents mètres
  // sans dévier d'un mètre.
  let longest = 0;
  for (let i = 0; i < GEO_LOOP.length; i++) {
    const a = GEO_LOOP[i];
    const b = GEO_LOOP[(i + 1) % GEO_LOOP.length];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(d > 0.01, `segment nul au sommet ${i}`);
    longest = Math.max(longest, d);
  }
  assert.ok(longest < 1000, `plus long segment ${Math.round(longest)} m`);
});
