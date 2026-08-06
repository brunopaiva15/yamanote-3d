// Les repères réels du bord de voie : le jeu cite-t-il ce qui est là ?
//
// Deux plafonds tenaient ces objets loin de l'écran, et il fallait les
// distinguer pour les lever :
//
//   · LE RELEVÉ n'en gardait qu'UN par gare et par famille. Le critère qui
//     départageait - une fiche Wikidata, puis la proximité de la gare - ne peut
//     pas arbitrer ce qu'on lui demandait : à Tokyo, l'objet le plus proche
//     d'une gare qui porte une fiche est presque toujours un petit sanctuaire
//     de quartier. On gardait le 真性寺 et on écartait le 高岩寺.
//   · LE DÉCOR ne déclarait que QUATORZE emplacements `truth: 'geo'` sur toute
//     la boucle, quand le relevé résolvait quatre-vingt-neuf couples gare ×
//     famille. Hamamatsuchō avait le 旧芝離宮恩賜庭園 à cent trente-neuf mètres
//     et ne le citait pas, faute d'une ligne écrite à la main.
//
// Le second était le vrai. Ces tests tiennent les deux.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NEAR_LANDMARKS,
  NEAR_PER_FAMILY,
  NEAR_REACH,
  nearLandmark,
} from '../src/data/nearLandmarks.ts';
import { GEO_LANDMARKS } from '../src/data/tokyoGeo.ts';
import { DISTRICTS, LAND_FAMILY, type Land } from '../src/data/districts.ts';

const survey = JSON.parse(
  readFileSync(new URL('../data/geo/near-landmarks.geojson', import.meta.url), 'utf8'),
);

const FAMILIES = ['museum', 'worship', 'park', 'historic'] as const;

test('la sélection est une dérivation du relevé, et le dit', () => {
  assert.equal(survey.properties.pickedBy, 'scripts/geo/pick-near.mjs');
  assert.equal(survey.properties.perStationPerFamily, NEAR_PER_FAMILY);
  const picked = survey.features.filter((f: { properties: { picked: boolean } }) => f.properties.picked);
  assert.equal(picked.length, NEAR_LANDMARKS.length);
  assert.ok(NEAR_PER_FAMILY >= 2, 'le plafond d’un par gare et par famille est revenu');
});

test('chaque repère est retrouvable sur la carte', () => {
  for (const lm of NEAR_LANDMARKS) {
    assert.match(lm.id, /^osm-(node|way|relation)-\d+$/, lm.id);
    assert.ok(lm.distance <= NEAR_REACH, `${lm.id} hors portée`);
    assert.ok(lm.station >= 0 && lm.station < 30, `${lm.id} sans gare`);
    assert.ok(FAMILIES.includes(lm.family), `${lm.id} famille inconnue`);
    assert.equal(nearLandmark(lm.id)?.id, lm.id);
  }
});

test('les rangs sont contigus, et rangés par le score du relevé', () => {
  const byKey = new Map<string, typeof NEAR_LANDMARKS>();
  for (const lm of NEAR_LANDMARKS) {
    const key = `${lm.station}/${lm.family}`;
    byKey.set(key, [...(byKey.get(key) ?? []), lm] as typeof NEAR_LANDMARKS);
  }
  for (const [key, list] of byKey) {
    const ranks = list.map((l) => l.rank).sort((a, b) => a - b);
    assert.deepEqual(
      ranks,
      list.map((_, i) => i),
      `${key} : rangs non contigus (${ranks.join(',')})`,
    );
    assert.ok(list.length <= NEAR_PER_FAMILY, `${key} : plus de ${NEAR_PER_FAMILY} retenus`);
    // Le score : fiche Wikidata d'abord, puis la proximité de la gare.
    const score = (l: (typeof NEAR_LANDMARKS)[number]) => (l.wikidata ? 1e5 : 0) - l.fromStation;
    const ordered = [...list].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < ordered.length; i++) {
      assert.ok(score(ordered[i - 1]) >= score(ordered[i]), `${key} : rangs désordonnés`);
    }
  }
});

test('tokyoGeo porte le même jeu, rang compris', () => {
  const near = GEO_LANDMARKS.filter((lm) => lm.band === 'near');
  assert.equal(near.length, NEAR_LANDMARKS.length);
  for (const lm of near) {
    const src = nearLandmark(lm.id);
    assert.ok(src, `${lm.id} absent du relevé`);
    assert.equal(lm.rank, src.rank, `${lm.id} : rang perdu en route`);
    assert.equal(lm.family, src.family, `${lm.id} : famille perdue en route`);
    assert.equal(lm.station, src.station, `${lm.id} : gare perdue en route`);
  }
});

// --- Ce que le décor cite ---------------------------------------------------

/** La silhouette d'office de chaque famille, comme three/Landmarks la choisit. */
const AUTO_KIND: Record<string, Land> = {
  museum: 'museumFacade',
  worship: 'templeRoof',
  park: 'forestMass',
  historic: 'stoneMarker',
};
const GEO_BUDGET = 4;

/** Les familles qu'un quartier cite, emplacements écrits et d'office confondus. */
function citedBy(station: number): Set<string> {
  const authored = DISTRICTS[station]?.landmarks ?? [];
  const covered = new Set<string>();
  for (const spec of authored) {
    if (spec.truth !== 'geo') continue;
    const family = LAND_FAMILY[spec.kind];
    if (family) covered.add(family);
  }
  for (const lm of GEO_LANDMARKS) {
    if (covered.size >= GEO_BUDGET) break;
    if (lm.band !== 'near' || lm.station !== station || lm.rank !== 0) continue;
    if (!lm.family || covered.has(lm.family)) continue;
    covered.add(lm.family);
  }
  return covered;
}

test('toute gare cite ce que le relevé lui résout, dans la limite du budget', () => {
  let total = 0;
  for (let station = 0; station < 30; station++) {
    const resolved = new Set(
      GEO_LANDMARKS.filter((lm) => lm.band === 'near' && lm.station === station && lm.family).map(
        (lm) => lm.family as string,
      ),
    );
    const cited = citedBy(station);
    total += cited.size;
    const expected = Math.min(GEO_BUDGET, resolved.size);
    assert.equal(
      cited.size,
      expected,
      `${DISTRICTS[station]?.name} : ${cited.size} citations pour ${resolved.size} familles résolues`,
    );
    for (const family of cited) assert.ok(resolved.has(family), `citation sans objet résolu`);
  }
  // Quatorze avant, et c'était le vrai plafond du paysage.
  assert.ok(total >= 100, `trop peu de citations réelles (${total})`);
});

test('chaque famille a une silhouette, y compris les sites historiques', () => {
  for (const family of FAMILIES) {
    const kind = AUTO_KIND[family];
    assert.ok(kind, `${family} sans silhouette d’office`);
    assert.equal(
      LAND_FAMILY[kind],
      family,
      `${kind} ne se résout pas vers ${family} : la famille resterait invisible`,
    );
  }
  // Le cas qui a motivé le test : `historic` était relevé, versionné, et n'avait
  // aucun `kind` qui lui réponde - trente objets morts dans les données.
  const historic = NEAR_LANDMARKS.filter((lm) => lm.family === 'historic');
  assert.ok(historic.length > 20, `relevé historique trop maigre (${historic.length})`);
});
