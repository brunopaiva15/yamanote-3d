// Lecteur CityGML : la fixture exerce ce que le générateur d'échantillon ne
// produit PAS — préfixes exotiques, LOD2 dans boundedBy, anneaux intérieurs,
// gml:pos, BuildingPart, bâtiment sans géométrie.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCityGmlBuildings, readNamespacePrefixes, readSrs } from '../scripts/plateau/lib/citygml.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(HERE, 'fixtures/citygml-lod2-sample.gml'), 'utf8');

test('les préfixes d’espaces de noms sont résolus, pas devinés', () => {
  const ns = readNamespacePrefixes(FIXTURE);
  assert.equal(ns.bldg, 'bld');
  assert.equal(ns.gml, 'g');
});

test('srsName en URN → EPSG:6697, ordre latitude/longitude', () => {
  const srs = readSrs(FIXTURE);
  assert.equal(srs.epsg, 6697);
  assert.equal(srs.axisOrder, 'lat,lon,height');
});

test('srsName absent ou inexploitable → erreur explicite', () => {
  assert.throws(
    () => readSrs('<CityModel></CityModel>'),
    /projection géographique n'a pas pu être déterminée/,
  );
  assert.throws(() => readSrs('<a srsName="EPSG:3857"/>'), /n'est pas un CRS géographique/);
  assert.throws(() => readSrs('<a srsName="local-cs"/>'), /srsName non reconnu/);
});

test('extraction : LOD2, LOD1 troué, BuildingPart, et le bâtiment vide écarté', () => {
  const parsed = parseCityGmlBuildings(FIXTURE, { sourcePath: 'fixture' });
  assert.equal(parsed.stats.detected, 4);
  assert.equal(parsed.stats.kept, 3);
  assert.equal(parsed.stats.withoutGeometry, 1);
  assert.equal(parsed.stats.buildingParts, 1);

  const byId = Object.fromEntries(parsed.buildings.map((b) => [b.id, b]));

  // 1. LOD2 : les surfaces viennent de bldg:boundedBy, pas du lod2Solid qui
  // ne fait que les référencer en xlink. Deux polygones, pas quatre.
  const lod2 = byId.BLD_LOD2;
  assert.equal(lod2.lod, 2);
  assert.equal(lod2.polygons.length, 2);
  assert.equal(lod2.measuredHeight, 12.5);
  assert.equal(lod2.class, '3001');
  assert.equal(lod2.usage, '411');
  // Ordre des axes : la source écrit « lat lon h », le lecteur rend « lon lat h ».
  const [lon, lat, alt] = lod2.polygons[0].exterior[0];
  assert.ok(Math.abs(lon - 139.7381) < 1e-9, `lon ${lon}`);
  assert.ok(Math.abs(lat - 35.7331) < 1e-9, `lat ${lat}`);
  assert.equal(alt, 65);
  // Le toit est décrit en gml:pos : il doit être lu comme les autres.
  assert.equal(lod2.polygons[1].exterior.length, 5);
  assert.equal(lod2.polygons[1].exterior[0][2], 77.5);

  // 2. LOD1 avec patio : l'anneau intérieur est conservé.
  const hole = byId.BLD_LOD1_HOLE;
  assert.equal(hole.lod, 1);
  assert.equal(hole.polygons.length, 1);
  assert.equal(hole.polygons[0].interiors.length, 1);
  assert.equal(hole.polygons[0].interiors[0].length, 5);

  // 3. La géométrie d'une BuildingPart remonte sur le bâtiment porteur, et sa
  // hauteur aussi puisque le porteur n'en déclare pas.
  const part = byId.BLD_WITH_PART;
  assert.equal(part.polygons.length, 1);
  assert.equal(part.measuredHeight, 5);

  assert.equal(byId.BLD_NO_GEOMETRY, undefined);
});

test('un fichier sans bldg:Building échoue avec un message actionnable', () => {
  const xml = `<?xml version="1.0"?><core:CityModel
    xmlns:core="http://www.opengis.net/citygml/2.0"
    xmlns:bldg="http://www.opengis.net/citygml/building/2.0"
    xmlns:gml="http://www.opengis.net/gml">
    <gml:boundedBy><gml:Envelope srsName="EPSG:6697"/></gml:boundedBy>
  </core:CityModel>`;
  assert.throws(() => parseCityGmlBuildings(xml, { sourcePath: 'vide.gml' }), /Aucun bldg:Building/);
});

test('« Building » ne capture pas « BuildingPart » comme un bâtiment de plus', () => {
  // Régression : le balayage de balises doit exiger un séparateur après le nom.
  const parsed = parseCityGmlBuildings(FIXTURE, { sourcePath: 'fixture' });
  assert.equal(parsed.stats.detected, 4, 'BuildingPart compté comme Building');
});
