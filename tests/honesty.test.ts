// La purge des repères faux, et la séparation des familles.
//
// La bible géographique (règles 11 et 12) dit qu'un repère est un objet qu'on
// peut retrouver sur une carte, et qu'on n'en invente aucun. Ce fichier refuse
// trois dérives :
//
//   · une silhouette inventée (la tour treillis de Nippori / Yoyogi) ;
//   · une silhouette qui ne dit pas ce qu'elle EST (truth manquant) ;
//   · un objet « réel » sans famille dans le relevé, ou un proche hors de
//     GEO_LANDMARKS - le relais proche / lointain doit lire un seul jeu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DISTRICTS,
  LAND_FAMILY,
  type LandmarkTruth,
} from '../src/data/districts.ts';
import { NEAR_LANDMARKS } from '../src/data/nearLandmarks.ts';
import { GEO_LANDMARKS } from '../src/data/tokyoGeo.ts';

const TRUTHS = new Set<LandmarkTruth>(['geo', 'station', 'fabric']);

test('latticeTower n’existe plus nulle part', () => {
  // C'était le repère inventé de Nippori et le doublon de Yoyogi. Le type Land
  // ne le porte plus, et aucun quartier ne peut le redemander.
  const districtsSrc = readFileSync(new URL('../src/data/districts.ts', import.meta.url), 'utf8');
  const landmarksSrc = readFileSync(new URL('../src/three/Landmarks.tsx', import.meta.url), 'utf8');
  assert.equal(districtsSrc.includes("'latticeTower'"), false);
  assert.equal(districtsSrc.includes('"latticeTower"'), false);
  assert.equal(/latticeTower\s*:/.test(landmarksSrc), false);
  for (const d of DISTRICTS) {
    for (const lm of d.landmarks) {
      assert.notEqual(lm.kind as string, 'latticeTower', `${d.name}`);
    }
  }
});

test('toute silhouette déclare ce qu’elle est', () => {
  for (const d of DISTRICTS) {
    for (const lm of d.landmarks) {
      assert.ok(lm.truth, `${d.name} / ${lm.kind} : sans truth`);
      assert.ok(TRUTHS.has(lm.truth), `${d.name} / ${lm.kind} : truth « ${lm.truth} » inconnu`);
    }
  }
});

test('un objet geo a une famille, et un fabric n’en a pas besoin', () => {
  for (const d of DISTRICTS) {
    for (const lm of d.landmarks) {
      if (lm.truth === 'geo') {
        assert.ok(
          LAND_FAMILY[lm.kind],
          `${d.name} / ${lm.kind} : truth geo sans famille LAND_FAMILY`,
        );
        // Son côté vient du terrain : on n'écrit plus side à la main.
        assert.equal(
          lm.side,
          undefined,
          `${d.name} / ${lm.kind} : un geo ne choisit pas son côté`,
        );
      }
      if (lm.truth === 'fabric' || lm.truth === 'station') {
        // Le tissu et les faits de gare gardent un côté écrit : ce n'est pas un
        // objet géoréférencé.
        assert.ok(lm.side === 1 || lm.side === -1, `${d.name} / ${lm.kind}`);
      }
    }
  }
});

test('GEO_LANDMARKS porte l’horizon et le bord de voie', () => {
  const horizon = GEO_LANDMARKS.filter((lm) => lm.band === 'horizon');
  const near = GEO_LANDMARKS.filter((lm) => lm.band === 'near');
  assert.equal(horizon.length, 16, 'les seize repères d’horizon restent');
  assert.ok(near.length >= 100, `bande near trop maigre (${near.length})`);
  assert.equal(near.length, NEAR_LANDMARKS.length, 'nearLandmarks et GEO_LANDMARKS restent calés');
  for (const lm of near) {
    assert.ok(lm.family, `${lm.id} : sans famille`);
    assert.ok(lm.station !== null && lm.station >= 0 && lm.station < 30, `${lm.id}`);
    const src = NEAR_LANDMARKS.find((n) => n.id === lm.id);
    assert.ok(src, `${lm.id} absent de nearLandmarks`);
    assert.equal(lm.family, src!.family);
    assert.equal(lm.station, src!.station);
  }
  for (const lm of horizon) {
    assert.equal(lm.family, null);
    assert.equal(lm.station, null);
  }
});

test('Nippori et Yoyogi n’inventent plus de tour treillis', () => {
  // Nippori = index 6, Yoyogi = index 17.
  assert.ok(!DISTRICTS[6].landmarks.some((l) => (l.kind as string) === 'latticeTower'));
  assert.ok(!DISTRICTS[17].landmarks.some((l) => (l.kind as string) === 'latticeTower'));
  // Yoyogi porte un parc (geo), pas une tour inventée.
  assert.ok(DISTRICTS[17].landmarks.some((l) => l.kind === 'forestMass' && l.truth === 'geo'));
});
