// Les secteurs nommés de la bible, et ce qu'on a su en résoudre.
//
// Ce fichier vérifie une DISCIPLINE plus qu'un rendu. La bible géographique
// fournit un cadrage - trente-six points kilométriques, cinq rayons - et sa
// règle 11 dit ce qu'on a le droit d'en faire : aller chercher chaque secteur
// dans une source datée, et laisser vide ce qu'on ne sait pas résoudre. Le
// piège serait de combler un trou avec une silhouette plausible ; c'est
// exactement ce qu'on teste ici, en refusant qu'une case de la grille soit
// muette - elle est résolue, ou elle porte la raison de ne pas l'être.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SECTORS, SECTOR_BANDS, SECTOR_DRAW_MAX, SECTOR_TALL_MIN } from '../src/data/sectors.ts';
import { BANDS, BIBLE_KM_POSTS, bibleKmPoint } from '../src/systems/kmPost.ts';

const bible = JSON.parse(readFileSync(new URL('../data/geo/km-bible.json', import.meta.url), 'utf8'));
const survey = JSON.parse(readFileSync(new URL('../data/geo/sectors.json', import.meta.url), 'utf8'));

test('la grille de la bible a la forme du document', () => {
  // Trente-six points, cinq bandes, KM 0 à Shinagawa. Ce sont les seuls
  // chiffres que la bible impose, et les seuls qu'on lui emprunte.
  assert.equal(bible.posts.length, BIBLE_KM_POSTS.length);
  assert.equal(bible.km0Station, 24, 'Shinagawa');
  assert.deepEqual([...bible.bands], [...BANDS]);
  assert.deepEqual([...SECTOR_BANDS], [...BANDS]);
  for (let i = 0; i < bible.posts.length; i++) {
    assert.equal(bible.posts[i].km, BIBLE_KM_POSTS[i]);
    assert.equal(bible.posts[i].bands.length, BANDS.length);
  }
});

test('les points kilométriques du jeu tombent sur ceux du relevé', () => {
  // Deux calculs indépendants du même point : src/systems/kmPost le refait au
  // départ de src/data/tokyoGeo, le script d'import l'avait fait au départ du
  // GeoJSON. Un écart voudrait dire que l'un des deux a dérivé.
  const p = { x: 0, z: 0 };
  for (const post of bible.posts) {
    bibleKmPoint(post.km, p);
    const d = Math.hypot(p.x - post.x, p.z - post.z);
    assert.ok(d < 12, `KM ${post.km} : ${d.toFixed(1)} m d’écart`);
  }
});

test('aucune case de la grille n’est muette', () => {
  // C'est LE test de la règle 11. Une bande peuplée de secteurs nommés doit
  // soit en avoir résolu, soit dire pourquoi elle n'en résout aucun - jamais
  // rester silencieuse, parce qu'une case silencieuse est une invitation à la
  // remplir au jugé.
  for (const post of bible.posts) {
    for (const band of post.bands) {
      const where = `KM ${post.km}, bande ${band.inner / 1000}-${band.outer / 1000} km`;
      assert.ok(band.coveredBy, `${where} : personne ne s’en charge`);
      assert.equal(
        band.sectors,
        band.resolved + band.unresolved,
        `${where} : le compte ne tombe pas juste`,
      );
      if (band.sectors === 0) continue;
      assert.ok(
        band.resolved > 0 || band.unresolved > 0,
        `${where} : ${band.sectors} secteurs et aucun verdict`,
      );
    }
  }
});

test('les bandes 1 à 20 km sont bien celles de DistrictMassif', () => {
  // La bande 0-1 km appartient au ruban urbain, la bande 20-50 km au relief
  // régional du chantier 2. Entre les deux, c'est cette couche - et le test
  // existe pour que personne ne déplace silencieusement une frontière.
  for (const post of bible.posts) {
    assert.equal(post.bands[0].coveredBy, 'ruban urbain (systems/cityField)');
    for (const b of [1, 2, 3]) assert.equal(post.bands[b].coveredBy, 'DistrictMassif');
    assert.equal(post.bands[4].coveredBy, 'relief régional (data/relief)');
  }
});

test('chaque secteur est résolu ou porte la raison de ne pas l’être', () => {
  assert.ok(survey.sectors.length > 900, `le relevé est fourni (${survey.sectors.length})`);
  let resolved = 0;
  for (const s of survey.sectors) {
    assert.ok(s.id && s.name && s.rank, 'un secteur porte son identité');
    assert.ok(s.osmNode > 0, `${s.name} : de quel nœud OSM sort-il ?`);
    assert.equal(s.measuredRadius, false, 'le rayon est déduit, jamais relevé');
    if (s.unresolved === null) {
      resolved++;
      assert.ok(s.samples >= 6, `${s.name} : résolu sur ${s.samples} bâtiments`);
      assert.ok(s.roof !== null, `${s.name} : résolu sans classe de hauteur`);
    } else {
      assert.equal(typeof s.unresolved, 'string');
      assert.ok(s.unresolved.length > 10, `${s.name} : la raison doit être une phrase`);
      assert.equal(s.roof, null, `${s.name} : non résolu, donc sans hauteur`);
    }
  }
  assert.ok(resolved > 200, `il en reste tout de même beaucoup (${resolved})`);
});

test('les masses dessinées sont mesurées, et rien qu’elles', () => {
  assert.ok(SECTORS.length > 20, `la couche n’est pas vide (${SECTORS.length})`);
  const ids = new Set<string>();
  for (const s of SECTORS) {
    assert.ok(!ids.has(s.id), `identifiant unique : ${s.id}`);
    ids.add(s.id);
    // Chaque masse tient sa hauteur d'au moins trois tours relevées, et sa
    // hauteur ne dépasse jamais la plus haute d'entre elles : un percentile
    // ne peut pas inventer un mètre de plus que son échantillon.
    assert.ok(s.tall >= 3, `${s.name} : ${s.tall} tour(s)`);
    assert.ok(s.height >= SECTOR_TALL_MIN, `${s.name} : faîte ${s.height} m`);
    assert.ok(s.height <= s.tallest, `${s.name} : le faîte dépasse la plus haute tour`);
    assert.ok(s.tallest <= 640, `${s.name} : ${s.tallest} m, invraisemblable à Tokyo`);
    assert.ok(s.radius >= 200, `${s.name} : une masse a une emprise`);
    // Entre le ruban et le relief régional, et pas ailleurs.
    assert.ok(s.distance > 440, `${s.name} : à ${s.distance} m, c’est le ruban qui dessine`);
    assert.ok(s.distance <= SECTOR_DRAW_MAX, `${s.name} : à ${s.distance} m, c’est le relief`);
    assert.equal(s.band, BANDS.findIndex((b) => s.distance <= b), `${s.name} : mauvaise bande`);
  }
});

test('les masses sont posées là où sont les tours, pas où est le nom', () => {
  // La panne qu'on a eue, et qu'on ne veut plus : chercher les tours dans
  // l'emprise administrative d'un secteur mettait le barycentre des soixante-dix
  // tours de Shinjuku AU MILIEU DE LA GARE, parce qu'elles s'étalent des deux
  // côtés de la voie. Une masse posée à moins de quatre cent quarante mètres de
  // l'axe est le symptôme de ce défaut-là, et le test ci-dessus l'attrape ;
  // celui-ci vérifie l'autre bout - que le nom n'a pas tiré la masse à lui.
  for (const m of survey.masses ?? []) {
    if (m.namedFrom === null) continue;
    const named = survey.sectors.find((s: { id: string }) => s.id === m.namedFrom);
    if (!named) continue;
    assert.ok(
      Math.abs(m.x - named.x) > 0.5 || Math.abs(m.z - named.z) > 0.5,
      `${m.name} : la masse est exactement sur le nœud du nom, ce n’est pas une mesure`,
    );
  }
  // Et Nishi-Shinjuku, qui est le cas d'école, doit être là où il est : à l'ouest
  // de la boucle, à quelques centaines de mètres de la voie, plus de cent
  // cinquante mètres de faîte.
  const shinjuku = SECTORS.find((s) => s.name === '西新宿');
  assert.ok(shinjuku, 'la barre de Nishi-Shinjuku est relevée');
  assert.ok(shinjuku.height > 150, `faîte ${shinjuku.height} m`);
  assert.ok(shinjuku.tall > 30, `${shinjuku.tall} tours relevées`);
  assert.ok(shinjuku.distance > 440 && shinjuku.distance < 1500);
});

test('la provenance du relevé est complète', () => {
  for (const key of ['source', 'license', 'attribution', 'datasetDate', 'verifiedAt', 'layer']) {
    assert.ok(survey[key], `le relevé déclare ${key}`);
  }
  assert.equal(survey.layer, 'DATA_STATIC');
  assert.match(survey.datasetDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(bible.source, 'bible géographique (cadrage macroscopique)');
  // La bible est une liste de couverture. Si elle se mettait à porter des
  // coordonnées de secteurs, c'est qu'on aurait recommencé à lire une
  // géométrie dans un texte.
  assert.ok(bible.note.includes('règle 11'));
});
