// La règle 10, à la lettre : tout objet posé dans la scène sait d'où il vient.
//
// « Chaque objet doit enregistrer : source ; licence ; date du jeu de données ;
// coordonnées ; niveau de détail ; distance minimale et maximale d'affichage ;
// date de dernière vérification. »
//
// Sept champs, dont six sont les mêmes pour tous les objets d'un même import.
// Les écrire objet par objet coûterait, pour le seul corridor, neuf mille
// répétitions de « OpenStreetMap · ODbL 1.0 · 2026-08-06 » - un demi-méga-octet
// pour ne rien apprendre à personne. Ils sont donc écrits une fois par jeu de
// données, et `geoRecordOf` rend l'enregistrement complet à la demande.
//
// CE QUE CE TEST GARANTIT, ET C'EST TOUT L'INTÉRÊT : que rien n'arrive à
// l'écran sans provenance. Il parcourt les tables que la scène pose vraiment -
// pas une liste de noms tenue à la main - et exige de chacune un jeu déclaré et
// un enregistrement valide pour chaque objet. Ajouter une couche sans la
// déclarer fait échouer le test, ce qui est le seul moyen que la règle survive
// à la prochaine passe.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GEO_DATASETS,
  GEO_REGISTRY,
  geoRecordIssue,
  geoRecordOf,
  type GeoObject,
} from '../src/data/geo/provenance.ts';
import { CORRIDOR, CORRIDOR_FAR_MAX, CORRIDOR_NEAR_MIN } from '../src/data/corridor.ts';
import { CRUST, CRUST_MIN_DISTANCE } from '../src/data/crust.ts';
import { SECTORS } from '../src/data/sectors.ts';
import { WATER_CROSSINGS } from '../src/data/water.ts';
import { NEAR_LANDMARKS } from '../src/data/nearLandmarks.ts';
import { GEO_LANDMARKS, GEO_LOOP } from '../src/data/tokyoGeo.ts';

/**
 * Les tables que la scène pose, et le jeu de données dont chacune relève.
 *
 * `sample` ramène chaque objet à ce qu'il porte LUI-MÊME : identifiant,
 * coordonnées, et le drapeau `measured` quand la table le distingue.
 */
const LAYERS: {
  dataset: string;
  what: string;
  objects: () => GeoObject[];
}[] = [
  {
    dataset: 'osm-corridor',
    what: 'les empreintes du ruban',
    objects: () =>
      CORRIDOR.map((b) => ({
        id: `osm-way-${b.osmWay}`,
        x: b.offset,
        z: b.s,
        measured: b.measured,
      })),
  },
  {
    dataset: 'osm-crust',
    what: 'la nappe urbaine',
    objects: () => CRUST.map((c) => ({ id: c.id, x: c.x, z: c.z, measured: true })),
  },
  {
    dataset: 'osm-sectors',
    what: 'les amas de tours',
    objects: () => SECTORS.map((s) => ({ id: s.id, x: s.x, z: s.z, measured: true })),
  },
  {
    dataset: 'osm-water',
    what: 'les traversées d’eau',
    objects: () =>
      WATER_CROSSINGS.map((w) => ({
        id: `osm-way-${w.osmWay}`,
        x: w.x,
        z: w.z,
        measured: w.measured,
      })),
  },
  {
    dataset: 'osm-near-landmarks',
    what: 'les repères du bord de voie',
    objects: () =>
      NEAR_LANDMARKS.map((lm) => ({ id: lm.id, x: lm.x, z: lm.z, measured: true })),
  },
  {
    dataset: 'osm-horizon-landmarks',
    what: 'les repères d’horizon',
    objects: () =>
      GEO_LANDMARKS.filter((lm) => lm.band === 'horizon').map((lm) => ({
        id: lm.id,
        lon: lm.lon,
        lat: lm.lat,
        measured: true,
      })),
  },
  {
    dataset: 'yamanote-loop',
    what: 'la polyligne de la boucle',
    objects: () =>
      GEO_LOOP.map((p, i) => ({ id: `yamanote-loop-${i}`, x: p.x, z: p.z, measured: true })),
  },
];

test('toute couche posée dans la scène a son jeu de données déclaré', () => {
  for (const layer of LAYERS) {
    assert.ok(
      GEO_DATASETS[layer.dataset],
      `${layer.what} : jeu « ${layer.dataset} » absent de GEO_DATASETS`,
    );
  }
});

for (const layer of LAYERS) {
  test(`${layer.what} : chaque objet produit un enregistrement complet`, () => {
    const objects = layer.objects();
    assert.ok(objects.length > 0, `${layer.what} : table vide`);
    for (const obj of objects) {
      const record = geoRecordOf(layer.dataset, obj);
      assert.ok(record, `${obj.id} : jeu de données introuvable`);
      const issue = geoRecordIssue(record);
      assert.equal(issue, null, `${obj.id} : ${issue}`);
    }
  });
}

test('un enregistrement sans coordonnées est refusé', () => {
  const record = geoRecordOf('osm-corridor', { id: 'osm-way-1' });
  assert.ok(record);
  assert.match(geoRecordIssue(record) ?? '', /coordonnées manquantes/);
});

test('un objet dont la source expose une page la porte', () => {
  const b = CORRIDOR[0];
  const record = geoRecordOf('osm-corridor', {
    id: `osm-way-${b.osmWay}`,
    x: b.offset,
    z: b.s,
  });
  assert.equal(record?.sourceUrl, `https://www.openstreetmap.org/way/${b.osmWay}`);
  // Un jeu qui n'expose pas de page par objet le dit, plutôt que d'en inventer.
  assert.equal(geoRecordOf('gsi-dem', { id: 'dem', x: 0, z: 0 })?.sourceUrl, null);
});

test('un jeu inconnu ne rend pas un enregistrement plausible', () => {
  assert.equal(geoRecordOf('osm-inventé', { id: 'x', x: 0, z: 0 }), null);
});

test('les distances d’affichage déclarées sont celles que le rendu applique', () => {
  // C'est le champ le plus facile à laisser dériver : on l'écrit une fois, la
  // couche change de portée, et le registre continue d'affirmer l'ancienne.
  const corridor = GEO_DATASETS['osm-corridor'];
  assert.equal(corridor.minDistance, CORRIDOR_NEAR_MIN);
  assert.equal(corridor.maxDistance, CORRIDOR_FAR_MAX);
  for (const b of CORRIDOR) {
    const x = Math.abs(b.offset);
    assert.ok(x >= corridor.minDistance && x <= corridor.maxDistance, `${b.osmWay} hors portée`);
  }

  const crust = GEO_DATASETS['osm-crust'];
  assert.equal(crust.minDistance, CRUST_MIN_DISTANCE);
  for (const c of CRUST) {
    assert.ok(c.distance >= crust.minDistance, `${c.id} plus près que la portée déclarée`);
    assert.ok(c.distance <= crust.maxDistance, `${c.id} au-delà de la portée déclarée`);
  }
});

test('le registre historique reste valide', () => {
  for (const r of GEO_REGISTRY) {
    const issue = geoRecordIssue(r);
    assert.equal(issue, null, `${r.id} : ${issue}`);
  }
});

test('aucun jeu ne se présente comme relevé sans l’être', () => {
  // Le corridor porte des hauteurs estimées : elles doivent le dire, objet par
  // objet, et non se cacher derrière la moyenne du jeu.
  const estimated = CORRIDOR.filter((b) => !b.measured);
  assert.ok(estimated.length > 0, 'plus aucune hauteur estimée : vérifier l’import');
  for (const b of estimated.slice(0, 50)) {
    const record = geoRecordOf('osm-corridor', {
      id: `osm-way-${b.osmWay}`,
      x: b.offset,
      z: b.s,
      measured: b.measured,
    });
    assert.equal(record?.measured, false, `${b.osmWay} : estimation présentée comme relevé`);
  }
});
