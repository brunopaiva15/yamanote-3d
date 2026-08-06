// Le corridor bâti : le ruban pose-t-il ce qui est vraiment là ?
//
// La quatrième passe avait importé vingt-quatre mille empreintes et n'en
// dessinait aucune : `src/data/footprints.ts` n'était lu que par une sonde de
// développement, et le ruban urbain continuait d'inventer sa ville à douze
// mètres de la vitre. C'est très exactement ce que la règle 4 de la bible
// interdit, et ces tests tiennent le raccordement.
//
// Ils vérifient trois choses, et il faut les distinguer :
//
//   · LA TABLE est bien une dérivation de la source - ordre, bande, bornes,
//     identifiants OSM, et surtout l'ORIENTATION, qui doit être celle des axes
//     de la projection et non une trame tirée au sort ;
//   · LE RUBAN pose vraiment ces bâtiments-là, à leur place, à leur hauteur,
//     dans les deux sens de marche ;
//   · LE TISSU s'écarte de ce qui existe, au lieu de bâtir dessus.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  CORRIDOR,
  CORRIDOR_CLIPPED,
  CORRIDOR_PLATE_MAX,
  CORRIDOR_FAR,
  CORRIDOR_FAR_MAX,
  CORRIDOR_LOOP_M,
  CORRIDOR_NEAR,
  CORRIDOR_NEAR_MAX,
  CORRIDOR_NEAR_MIN,
  CORRIDOR_TOTAL,
} from '../src/data/corridor.ts';
import { GEO_LOOP } from '../src/data/tokyoGeo.ts';
import {
  CELL_LEN,
  CELL_CAPACITY,
  FAR_CELL_LEN,
  FAR_CELL_CAPACITY,
  buildCell,
  buildFarCell,
  cityAnchor,
  makeCellBuffer,
  type CityBuilding,
} from '../src/systems/cityField.ts';
import { updateTerrain } from '../src/systems/terrain.ts';

const pack = JSON.parse(readFileSync(new URL('../src/data/corridor.json', import.meta.url), 'utf8'));

/**
 * Pose le train, exactement comme three/city/CityRibbon le fait à chaque image.
 * `step` est le sens de marche : +1 en 内回り, −1 en 外回り.
 */
function placeTrain(distance: number, step: 1 | -1 = 1, index = 0): void {
  cityAnchor.s = 0;
  cityAnchor.index = index;
  cityAnchor.span = 1150;
  cityAnchor.step = step;
  updateTerrain(distance, cityAnchor);
}

/** Un tour complet de cellules proches, une sur sept. */
const CELLS = Array.from({ length: 123 }, (_, i) => i * 7);

// --- La table ---------------------------------------------------------------

test('la table est une dérivation de la source, et le dit', () => {
  assert.equal(pack.generatedBy, 'scripts/geo/build-corridor.mjs');
  assert.deepEqual(pack.derivedFrom, [
    'data/geo/footprints.json',
    'data/geo/yamanote-loop.geojson',
  ]);
  assert.equal(pack.layer, 'DATA_STATIC');
  assert.equal(pack.source, 'OpenStreetMap');
  assert.match(pack.license, /ODbL/);
  assert.match(pack.datasetDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(pack.rows.length, CORRIDOR_TOTAL);
  assert.equal(CORRIDOR.length, CORRIDOR_TOTAL);
  assert.equal(CORRIDOR_NEAR + CORRIDOR_FAR, CORRIDOR_TOTAL);
});

test('chaque sujet est dans la bande du ruban, et retrouvable sur la carte', () => {
  let near = 0;
  for (const b of CORRIDOR) {
    const x = Math.abs(b.offset);
    assert.ok(
      x >= CORRIDOR_NEAR_MIN && x <= CORRIDOR_FAR_MAX,
      `hors bande : ${b.osmWay} à ${x} m`,
    );
    assert.ok(b.s >= 0 && b.s <= CORRIDOR_LOOP_M, `abscisse hors boucle : ${b.osmWay}`);
    assert.ok(b.h > 1 && b.h < 800, `hauteur absurde : ${b.osmWay} (${b.h})`);
    assert.ok(b.plate >= 1 && b.plate <= CORRIDOR_PLATE_MAX, `emprise absurde : ${b.osmWay} (${b.plate})`);
    assert.ok(b.depth >= 1 && b.depth <= b.plate + 1e-6, `profondeur absurde : ${b.osmWay}`);
    assert.ok(Number.isInteger(b.osmWay) && b.osmWay > 0, 'identifiant OSM manquant');
    assert.equal(typeof b.measured, 'boolean');
    if (x <= CORRIDOR_NEAR_MAX) near++;
  }
  assert.equal(near, CORRIDOR_NEAR);
});

test('la table est rangée par abscisse : la recherche par tranche en dépend', () => {
  for (let i = 1; i < CORRIDOR.length; i++) {
    assert.ok(CORRIDOR[i].s >= CORRIDOR[i - 1].s, `désordre en ${i}`);
  }
});

test('l’orientation est celle de la voie, et non une trame tirée au sort', () => {
  // La boîte est celle du contour, alignée sur les axes de la projection. Son
  // orientation dans le repère du ruban est donc exactement celle de la voie,
  // au quart de tour près - et c'est vérifiable sur la polyligne elle-même.
  const cum = [0];
  for (let i = 0; i < GEO_LOOP.length; i++) {
    const a = GEO_LOOP[i];
    const b = GEO_LOOP[(i + 1) % GEO_LOOP.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const quarter = Math.PI / 2;
  /** Écart de deux angles, replié au quart de tour. */
  const gap = (a: number, b: number) => {
    let d = (((a - b) % quarter) + quarter) % quarter;
    if (d > quarter / 2) d -= quarter;
    return Math.abs(d);
  };

  /** Cap de la voie sur le segment `seg` (rad). */
  const bearing = (seg: number) => {
    const n = GEO_LOOP.length;
    const p = GEO_LOOP[((seg % n) + n) % n];
    const q = GEO_LOOP[((seg + 1) % n + n) % n];
    return Math.atan2(-(q.x - p.x), -(q.z - p.z));
  };

  let worst = 0;
  for (let k = 0; k < CORRIDOR.length; k += 37) {
    const b = CORRIDOR[k];
    let seg = 0;
    while (seg + 1 < GEO_LOOP.length && cum[seg + 1] <= b.s) seg++;
    // Un bâtiment dont la perpendiculaire tombe hors du segment se projette sur
    // un SOMMET, et deux segments s'y rejoignent avec deux caps différents -
    // franchement différents dans les courbes serrées d'Ōsaki. On accepte l'un
    // ou l'autre : ce qu'on veut prouver est que l'orientation vient de la
    // voie, pas qu'elle vient d'un segment plutôt que de son voisin.
    const best = Math.min(
      gap(b.yaw, bearing(seg - 1)),
      gap(b.yaw, bearing(seg)),
      gap(b.yaw, bearing(seg + 1)),
    );
    worst = Math.max(worst, best);
  }
  // Deux degrés : la table replie au quart de tour et arrondit à 1e-4 rad.
  assert.ok(worst < 0.035, `orientation décrochée de la voie (${worst.toFixed(4)} rad)`);
});

// --- Le ruban ---------------------------------------------------------------

/** Tous les bâtiments d'un tour de boucle, proches ou lointains. */
function sweep(far: boolean, step: 1 | -1 = 1): CityBuilding[] {
  const cap = far ? FAR_CELL_CAPACITY : CELL_CAPACITY;
  const len = far ? FAR_CELL_LEN : CELL_LEN;
  const buf = makeCellBuffer(cap);
  const all: CityBuilding[] = [];
  for (const cell of CELLS) {
    for (const side of [1, -1] as const) {
      placeTrain(cell * len, step);
      const n = far ? buildFarCell(cell, side, buf) : buildCell(cell, side, buf);
      for (let i = 0; i < n; i++) all.push({ ...buf[i] });
    }
  }
  return all;
}

test('le ruban pose des bâtiments relevés, et l’arrière-pays en vit', () => {
  const near = sweep(false);
  const far = sweep(true);
  const realNear = near.filter((b) => b.real).length;
  const realFar = far.filter((b) => b.real).length;

  assert.ok(realNear > 0, 'aucun bâtiment relevé au bord de voie');
  // L'arrière-pays est la bande que la source remplit vraiment : la majorité de
  // ce qu'on y voit doit venir d'OpenStreetMap, sinon le raccordement est mort
  // sans que rien ne le dise.
  assert.ok(
    realFar / far.length > 0.6,
    `arrière-pays encore inventé : ${realFar}/${far.length} de relevé`,
  );
});

test('un bâtiment relevé garde la hauteur et l’emprise de sa source', () => {
  const byPlate = new Map<string, (typeof CORRIDOR)[number]>();
  for (const b of CORRIDOR) byPlate.set(`${b.h.toFixed(1)}|${b.plate.toFixed(1)}`, b);

  for (const b of [...sweep(false), ...sweep(true)]) {
    if (!b.real) continue;
    // Un prisme carré, SAUF pour ceux que le gabarit ferroviaire a découpés :
    // la source donne la boîte englobante du contour, et rien ne doit lui
    // inventer un rapport de forme dans l'autre sens.
    assert.ok(b.d <= b.w + 1e-6, 'emprise plus profonde que longue sur un sujet relevé');
    const key = `${b.h.toFixed(1)}|${b.w.toFixed(1)}`;
    assert.ok(byPlate.has(key), `hauteur/emprise introuvable dans la source (${key})`);
    assert.ok(b.x >= CORRIDOR_NEAR_MIN && b.x <= CORRIDOR_FAR_MAX, 'hors bande');
    assert.equal(b.grove, false, 'un bâtiment relevé ne se change pas en bosquet');
  }
});

test('le tissu s’écarte de ce qui existe au lieu de bâtir dessus', () => {
  const buf = makeCellBuffer(CELL_CAPACITY);
  const farBuf = makeCellBuffer(FAR_CELL_CAPACITY);
  /** Emprise vue d'un sujet, le long de la voie et en travers. */
  const span = (b: CityBuilding, along: boolean) => {
    const c = Math.abs(Math.cos(b.yaw));
    const s = Math.abs(Math.sin(b.yaw));
    return along ? b.w * c + b.d * s : b.d * c + b.w * s;
  };

  let checked = 0;
  for (const cell of CELLS) {
    for (const side of [1, -1] as const) {
      for (const [len, build, target] of [
        [CELL_LEN, buildCell, buf],
        [FAR_CELL_LEN, buildFarCell, farBuf],
      ] as const) {
        placeTrain(cell * len, 1);
        const n = build(cell, side, target);
        for (let i = 0; i < n; i++) {
          if (!target[i].real) continue;
          for (let j = 0; j < n; j++) {
            if (target[j].real) continue;
            const a = target[i];
            const b = target[j];
            const overlapS =
              Math.abs(a.s - b.s) < (span(a, true) + span(b, true)) / 2;
            const overlapX =
              Math.abs(a.x - b.x) < (span(a, false) + span(b, false)) / 2;
            assert.ok(
              !(overlapS && overlapX),
              `tissu bâti sur un relevé (cellule ${cell}, côté ${side})`,
            );
            checked++;
          }
        }
      }
    }
  }
  assert.ok(checked > 500, `échantillon trop maigre (${checked} paires)`);
});

test('le même bâtiment est là dans les deux sens de marche', () => {
  // Le repère du ruban se retourne en 外回り - l'abscisse de boucle décroît, et
  // la droite devient la gauche. Un bâtiment relevé doit malgré tout se
  // retrouver du BON côté du train, sans quoi la ville se réfléchit.
  const inner = new Set(sweep(true, 1).filter((b) => b.real).map((b) => `${b.h}|${b.w}`));
  const outer = new Set(sweep(true, -1).filter((b) => b.real).map((b) => `${b.h}|${b.w}`));
  let common = 0;
  for (const k of inner) if (outer.has(k)) common++;
  assert.ok(
    common / inner.size > 0.7,
    `les deux sens ne voient pas la même ville (${common}/${inner.size})`,
  );
});

test('deux passages sur la même cellule donnent la même ville', () => {
  const a = makeCellBuffer(CELL_CAPACITY);
  const b = makeCellBuffer(CELL_CAPACITY);
  for (const cell of CELLS) {
    placeTrain(cell * CELL_LEN, 1);
    const na = buildCell(cell, 1, a);
    const nb = buildCell(cell, 1, b);
    assert.equal(na, nb);
    for (let i = 0; i < na; i++) assert.deepEqual(a[i], b[i], `cellule ${cell}, sujet ${i}`);
  }
});

test('le prisme relevé se pose bien où la source le dit', () => {
  // On repasse le sujet par la MATRICE que le rendu emploie (three/city/
  // CityRibbon) : position (côté × x, ·, origine − s), rotation de −yaw, échelle
  // (d, h, w). Un carré doit rester un carré, et ses côtés garder la longueur
  // de l'emprise.
  const buf = makeCellBuffer(FAR_CELL_CAPACITY);
  const Y = new THREE.Vector3(0, 1, 0);
  const mtx = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  let seen = 0;
  for (const cell of CELLS) {
    placeTrain(cell * FAR_CELL_LEN, 1);
    const n = buildFarCell(cell, 1, buf);
    for (let i = 0; i < n; i++) {
      const b = buf[i];
      if (!b.real) continue;
      pos.set(b.x, 0, -b.s);
      rot.setFromAxisAngle(Y, -b.yaw);
      scl.set(b.d, b.h, b.w);
      mtx.compose(pos, rot, scl);
      const u = new THREE.Vector3(0.5, 0, 0).applyMatrix4(mtx).sub(pos);
      const v = new THREE.Vector3(0, 0, 0.5).applyMatrix4(mtx).sub(pos);
      assert.ok(Math.abs(u.length() * 2 - b.w) < 1e-6, 'le côté a perdu sa longueur');
      assert.ok(Math.abs(u.length() - v.length()) < 1e-6, 'le prisme n’est plus carré');
      assert.ok(Math.abs(u.dot(v)) < 1e-6, 'les côtés ne sont plus perpendiculaires');
      seen++;
    }
  }
  assert.ok(seen > 100, `échantillon trop maigre (${seen})`);
});

// --- Le gabarit ferroviaire -------------------------------------------------

test('aucun bâtiment posé n’empiète sur la voie', () => {
  // C'EST LE BUG QUI A MOTIVÉ CE TEST. Le filtre d'import portait sur le
  // CENTROÏDE - à plus de douze mètres de l'axe - et la boîte débordait autour
  // de lui : un bâtiment dont le centre est à treize mètres avec une emprise de
  // quarante en occupait sept DANS la voie. Le train lui rentrait dedans, et
  // trois fois entre Okachimachi et Ueno, dont une à vingt-cinq mètres du point
  // d'arrêt.
  //
  // Ce qu'on vérifie ici est l'emprise VUE, celle du prisme tel qu'il est posé,
  // rotation comprise - et non la distance du centre, qui était précisément la
  // grandeur trompeuse.
  let worst = Infinity;
  let culprit = 0;
  for (const b of CORRIDOR) {
    const c = Math.abs(Math.cos(b.yaw));
    const s = Math.abs(Math.sin(b.yaw));
    const half = (b.depth * c + b.plate * s) / 2;
    const inner = Math.abs(b.offset) - half;
    if (inner < worst) {
      worst = inner;
      culprit = b.osmWay;
    }
  }
  // Une décimale de tolérance : les cotes sont versionnées au décimètre.
  assert.ok(
    worst >= CORRIDOR_NEAR_MIN - 0.1,
    `osm way/${culprit} entre dans la voie : bord interne à ${worst.toFixed(2)} m`,
  );
});

test('découper ne déplace pas le bord extérieur', () => {
  // On retire ce qui empiète, on ne pousse pas le bâtiment dehors. Le bord
  // extérieur d'un sujet découpé doit donc rester au moins aussi loin que
  // l'entrée du gabarit, et sa profondeur avoir vraiment cédé.
  const clipped = CORRIDOR.filter((b) => b.depth < b.plate - 1e-6);
  assert.equal(clipped.length, CORRIDOR_CLIPPED);
  assert.ok(clipped.length > 0, 'plus rien n’est découpé : vérifier l’import');
  for (const b of clipped) {
    const c = Math.abs(Math.cos(b.yaw));
    const s = Math.abs(Math.sin(b.yaw));
    const half = (b.depth * c + b.plate * s) / 2;
    assert.ok(
      Math.abs(b.offset) + half > CORRIDOR_NEAR_MIN,
      `osm way/${b.osmWay} : découpé jusqu’à disparaître`,
    );
  }
});

test('un carré ne prétend pas représenter une marquise de quai', () => {
  // Quatre cent neuf mètres de côté pour la marquise de Tokyo, c'est cent
  // soixante-sept mille mètres carrés revendiqués sur la foi d'un seul nombre.
  // Ces emprises-là restent dans data/geo/footprints.json.
  for (const b of CORRIDOR) {
    assert.ok(b.plate <= CORRIDOR_PLATE_MAX, `osm way/${b.osmWay} : ${b.plate} m de côté`);
  }
});

test('rien de ce que le ruban pose n’entre dans le gabarit, tissu compris', () => {
  // Le même défaut vivait dans le tissu engendré : il réservait sa PROFONDEUR
  // là où il occupe son emprise vue, si bien qu'un sujet tourné dans sa trame
  // descendait à huit mètres trente de l'axe - à portée des poteaux caténaires,
  // qui sont à 5,2 m. Le ruban est balayé sur un tour complet, des deux côtés.
  const near = makeCellBuffer(CELL_CAPACITY);
  const far = makeCellBuffer(FAR_CELL_CAPACITY);
  let worst = Infinity;
  let culprit = '';
  for (const cell of CELLS) {
    for (const side of [1, -1] as const) {
      for (const [len, build, buf] of [
        [CELL_LEN, buildCell, near],
        [FAR_CELL_LEN, buildFarCell, far],
      ] as const) {
        placeTrain(cell * len, 1);
        const n = build(cell, side, buf);
        for (let i = 0; i < n; i++) {
          const b = buf[i];
          const c = Math.abs(Math.cos(b.yaw));
          const s2 = Math.abs(Math.sin(b.yaw));
          const inner = b.x - (b.d * c + b.w * s2) / 2;
          if (inner < worst) {
            worst = inner;
            culprit = `${b.real ? 'relevé' : 'tissu'} cellule ${cell} côté ${side}`;
          }
        }
      }
    }
  }
  assert.ok(
    worst >= CORRIDOR_NEAR_MIN - 0.1,
    `${culprit} entre dans le gabarit : bord interne à ${worst.toFixed(2)} m`,
  );
});
