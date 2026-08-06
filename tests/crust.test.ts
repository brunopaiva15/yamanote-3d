// La nappe urbaine : la bande 10-20 km avait quatre découpes pour six cent neuf
// secteurs.
//
// La règle 7 de la bible demande, entre dix et vingt kilomètres, « une nappe de
// volumes simplifiés » - la masse urbaine, pas les tours.
// `three/city/DistrictMassif` ne dessinait que les AMAS, c'est-à-dire les
// groupes de bâtiments de plus de cinquante-cinq mètres : quatre sur toute la
// bande, si bien que l'horizon y était un trait.
//
// Or le relevé portait bien plus. Sur les 1 226 secteurs nommés
// d'OpenStreetMap à moins de vingt kilomètres, 375 sont résolus - assez de
// bâtiments y déclarent leur hauteur pour qu'on en tire un faîte - et seuls 26
// portent un amas. Les autres étaient calculés, versionnés, et jetés.
//
// Ces tests tiennent trois choses : que la nappe est bien cette dérivation-là,
// qu'elle ne se présente pas comme mesurée là où elle est déduite, et qu'elle
// ne marche pas sur les plates-bandes du ruban urbain.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CRUST, CRUST_MIN_DISTANCE, type CrustSector } from '../src/data/crust.ts';
import { SECTORS } from '../src/data/sectors.ts';
import { CORRIDOR_FAR_MAX } from '../src/data/corridor.ts';

const pack = JSON.parse(
  readFileSync(new URL('../data/geo/sectors.json', import.meta.url), 'utf8'),
);

const bySector = new Map<string, Record<string, unknown>>(
  pack.sectors.map((s: { id: string }) => [s.id, s as Record<string, unknown>]),
);

test('la nappe est une dérivation du relevé, secteur par secteur', () => {
  assert.ok(CRUST.length > 250, `nappe trop maigre (${CRUST.length})`);
  for (const c of CRUST) {
    const src = bySector.get(c.id);
    assert.ok(src, `${c.id} : absent de data/geo/sectors.json`);
    assert.equal(src.unresolved, null, `${c.id} : secteur non résolu posé quand même`);
    assert.equal(src.mass, null, `${c.id} : porte un amas, il relève de SECTORS`);
    assert.equal(c.height, src.roof, `${c.id} : faîte réécrit en chemin`);
    assert.equal(c.elevation, src.elevation, `${c.id} : altitude réécrite en chemin`);
    assert.equal(c.x, src.x);
    assert.equal(c.z, src.z);
  }
});

test('les deux couches ne se recouvrent pas', () => {
  const masses = new Set(SECTORS.map((s) => s.id));
  for (const c of CRUST) {
    assert.ok(!masses.has(c.id), `${c.id} : dessiné deux fois`);
  }
});

test('la nappe ne dessine pas là où le ruban pose de vrais bâtiments', () => {
  assert.ok(
    CRUST_MIN_DISTANCE >= CORRIDOR_FAR_MAX,
    `la nappe commence à ${CRUST_MIN_DISTANCE} m, le corridor va à ${CORRIDOR_FAR_MAX}`,
  );
  for (const c of CRUST) {
    assert.ok(c.distance >= CRUST_MIN_DISTANCE, `${c.id} à ${c.distance} m de la voie`);
  }
});

test('la bande 10-20 km n’est plus vide', () => {
  const band = (b: number, list: readonly { band: number }[]) =>
    list.filter((s) => s.band === b).length;
  // Quatre amas avant, et c'était tout ce que la bande portait.
  assert.ok(band(3, SECTORS) < 10, 'le relevé d’amas a changé : revoir le test');
  assert.ok(
    band(3, CRUST) > 100,
    `bande 10-20 km toujours vide (${band(3, CRUST)} secteurs de nappe)`,
  );
  // Et la bande 5-10 km, qui n'avait que deux amas, en profite aussi.
  assert.ok(band(2, CRUST) > 50, `bande 5-10 km trop maigre (${band(2, CRUST)})`);
});

test('ce qui est déduit ne se présente pas comme relevé', () => {
  for (const c of CRUST) {
    // Le rayon vient de la distance au voisin de même rang : aucun secteur
    // d'OpenStreetMap ne porte son emprise, et le champ doit le dire.
    assert.equal(c.measuredRadius, false, `${c.id} : rayon présenté comme relevé`);
    assert.ok(c.radius > 0, `${c.id} : rayon absurde`);
    // Le faîte, lui, EST mesuré : il vient de bâtiments étiquetés.
    assert.ok(c.samples > 0, `${c.id} : faîte sans aucun bâtiment mesuré`);
    assert.ok(c.height > 0 && c.height < 300, `${c.id} : faîte absurde (${c.height})`);
  }
});

test('les secteurs non résolus restent vides, et c’est la règle 11', () => {
  const drawn = new Set<string>([...CRUST.map((c) => c.id), ...SECTORS.map((s) => s.id)]);
  const unresolved = pack.sectors.filter((s: { unresolved: string | null }) => s.unresolved !== null);
  assert.ok(unresolved.length > 500, 'relevé trop complet pour que le test morde');
  for (const s of unresolved as { id: string }[]) {
    assert.ok(!drawn.has(s.id), `${s.id} : secteur non résolu dessiné quand même`);
  }
});

test('la nappe est basse, et c’est le sol qu’elle porte qui se voit', () => {
  // Le fait qui justifie la couche : au-delà de dix kilomètres, le faîte
  // médian est d'une dizaine de mètres, quand l'altitude du sol va de la
  // plaine alluviale au plateau de Musashino. Si la nappe se mettait à porter
  // des hauteurs de tours, c'est que l'import aurait dérivé.
  const far = CRUST.filter((c: CrustSector) => c.band === 3);
  const heights = far.map((c) => c.height).sort((a, b) => a - b);
  const median = heights[heights.length >> 1];
  assert.ok(median < 20, `faîte médian de ${median} m à 10-20 km : ce ne sont plus des secteurs bas`);
  const elevations = far.map((c) => c.elevation);
  const spread = Math.max(...elevations) - Math.min(...elevations);
  assert.ok(spread > 40, `le relief sous la nappe est plat (${spread.toFixed(1)} m)`);
});
