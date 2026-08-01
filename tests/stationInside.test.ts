// Aller dans la gare, quand on n'est pas le joueur.
//
// La foule du quai descendait dans la trémie principale et s'y effaçait au
// fond du couloir bas : invisible depuis le quai - c'est la dalle qui cache -
// mais en plein champ depuis le HALL, où l'on descend maintenant. Elle va donc
// jusqu'à la rue : zone payante, portillon, zone libre, konbini, bouche de
// sortie (`systems/concourseRoute`).
//
// UN ITINÉRAIRE NE SE VÉRIFIE PAS EN LE REGARDANT. Il tient à la position d'un
// bac à glaces, à la largeur d'un passage de portillon, à la profondeur d'une
// devanture - trois cotes qui vivent dans trois fichiers et qui bougeront.
// Ce qui suit le PARCOURT, au pas de huit centimètres, avec la règle de marche
// des PNJ eux-mêmes (`systems/stationLevels`, `walkerBlocked`) : le jour où un
// meuble grandit d'un centimètre de trop, c'est ici que ça se voit, et pas six
// mois plus tard dans une capture.
//
// Le tirage aléatoire des itinéraires est une raison de PLUS de les parcourir :
// on en tire des dizaines par gare, et il suffit qu'un seul passe dans une
// gondole pour que le test tombe.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { routeFromStreet, routeToStreet, stationInteriorOpen } =
  await import('../src/systems/concourseRoute.ts');
const { mainAccessFloor, walkerBlocked } = await import('../src/systems/stationLevels.ts');
const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { EXIT_MOUTH_END, EXIT_MOUTH_Z0 } = await import('../src/data/stationInterior.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { runtime } = await import('../src/systems/runtime.ts');

type Level = 'platform' | 'concourse';
type Stop = { x: number; z: number; tap?: number; hold?: number };
type Place = ReturnType<typeof placementFor>;

const GATES = psdGates();
const ALL = Array.from({ length: STATION_COUNT }, (_, i) => ({
  i,
  name: `${STATIONS[i].jy} ${STATIONS[i].romaji}`,
  place: placementFor(i, GATES),
}));

/** Le joueur est là-haut : les itinéraires ne se calent pas sur lui. */
runtime.playerLevel = 'platform';

/**
 * Parcourt un itinéraire au pas de huit centimètres - deux fois le pas du
 * joueur à soixante images par seconde - et signale le premier point où l'on
 * ne serait plus sur du sol.
 *
 * L'ÉTAGE SE SUIT EN CHEMIN, comme le voyageur le suit : il ne change que dans
 * la volée principale. Sans cela, le test se poserait la question la plus
 * fausse qui soit - « y a-t-il du sol quelque part sous ce point ? » - et
 * validerait un chemin qui traverse une gondole de konbini en marchant sur la
 * dalle du quai, trois mètres et demi plus haut.
 */
function walk(place: Place, stops: Stop[], level: Level): string | null {
  let cur = level;
  let x = stops[0].x;
  let z = stops[0].z;
  for (let k = 1; k < stops.length; k++) {
    const s = stops[k];
    const n = Math.max(1, Math.ceil(Math.hypot(s.x - x, s.z - z) / 0.08));
    for (let i = 1; i <= n; i++) {
      const cx = x + (s.x - x) * (i / n);
      const cz = z + (s.z - z) * (i / n);
      const access = mainAccessFloor(place, cx, cz);
      if (access) {
        cur = access.level;
        continue;
      }
      if (walkerBlocked(place, cur, cx, cz)) {
        return `étape ${k} (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) : bloqué en `
          + `(${cx.toFixed(2)}, ${cz.toFixed(2)}) au niveau ${cur}`;
      }
    }
    x = s.x;
    z = s.z;
  }
  return null;
}

const INSIDE = ALL.filter(({ place }) => stationInteriorOpen(place));

test('toutes les gares bâties ont un intérieur où descendre', () => {
  // Vingt-neuf sur trente : Nippori déclare son niveau sans le construire
  // (docs/STATION_INTERIOR, phase 6), et ses voyageurs continuent donc de
  // s'effacer dans la trémie. C'est le seul cas, et il est nommé.
  assert.equal(INSIDE.length, STATION_COUNT - 1);
  const missing = ALL.filter(({ place }) => !stationInteriorOpen(place)).map((s) => s.name);
  assert.deepEqual(missing, ['JY07 Nippori']);
});

test('du quai à la rue, on ne traverse rien', () => {
  for (const { name, place } of INSIDE) {
    for (let k = 0; k < 40; k++) {
      const stops = routeToStreet(place);
      assert.ok(stops, `${name} : pas d'itinéraire de sortie`);
      const bad = walk(place, stops, 'platform');
      assert.equal(bad, null, `${name} (tirage ${k}) : ${bad}`);
    }
  }
});

test('de la rue au quai, on ne traverse rien non plus', () => {
  for (const { name, place } of INSIDE) {
    for (let k = 0; k < 40; k++) {
      const route = routeFromStreet(place);
      assert.ok(route, `${name} : pas d'itinéraire d'entrée`);
      // On naît dans la bouche de sortie, donc au niveau du hall.
      const bad = walk(place, route.stops, 'concourse');
      assert.equal(bad, null, `${name} (tirage ${k}) : ${bad}`);
    }
  }
});

test('on passe le portillon, une fois, et par un vrai passage', () => {
  for (const { name, place } of INSIDE) {
    const n = place.interior.gate.passages.length;
    for (let k = 0; k < 20; k++) {
      for (const stops of [routeToStreet(place), routeFromStreet(place)?.stops]) {
        assert.ok(stops);
        const taps = stops.filter((s) => s.tap !== undefined);
        assert.equal(taps.length, 1, `${name} : ${taps.length} validations dans un trajet`);
        const tap = taps[0].tap as number;
        assert.ok(tap >= 0 && tap < n, `${name} : passage ${tap} inexistant`);
        // On valide DEVANT la borne, pas dedans : le geste se voit, et le
        // portillon a le temps de s'ouvrir avant qu'on l'atteigne.
        assert.ok(
          taps[0].z < place.interior.gate.z0 && taps[0].z > place.interior.gate.z0 - 2,
          `${name} : validation à ${taps[0].z.toFixed(2)}, hors d'atteinte du lecteur`,
        );
        assert.ok((taps[0].hold ?? 0) > 0, `${name} : on ne s'arrête pas pour valider`);
      }
    }
  }
});

test('on s’efface en haut de la volée d’une bouche, jamais en plein hall', () => {
  for (const { name, place } of INSIDE) {
    const it = place.interior;
    for (let k = 0; k < 20; k++) {
      const stops = routeToStreet(place);
      assert.ok(stops);
      const last = stops[stops.length - 1];
      const t = last.z - it.free.z1;
      // Au moins cinq girons dans la bouche : au-dessous, le linteau ne cache
      // pas encore, et l'effacement se verrait depuis le hall.
      assert.ok(
        t >= EXIT_MOUTH_Z0 + 5 * 0.31 - 1e-6 && t <= EXIT_MOUTH_END + 1e-6,
        `${name} : effacement à ${t.toFixed(2)} m du fond du hall`,
      );
      const exit = it.exits.find((e) => Math.abs(last.x - e.x) <= e.halfWidth);
      assert.ok(exit, `${name} : effacement hors de toute bouche`);
    }
  }
});

test('celui qui entre au konbini en fait vraiment le tour', () => {
  // La visite est tirée au sort : on en fait assez pour tomber dessus, et l'on
  // vérifie qu'elle mène jusqu'à la CAISSE. Une boutique où l'on entrerait
  // pour faire trois pas et ressortir ne se lirait pas comme une boutique.
  const shops = INSIDE.filter(({ place }) =>
    place.interior.fixtures.some((f) => f.kind === 'konbini'));
  assert.ok(shops.length >= 6, `trop peu de konbini : ${shops.length}`);
  for (const { name, place } of shops) {
    const shop = place.interior.fixtures.find((f) => f.kind === 'konbini');
    assert.ok(shop);
    let visits = 0;
    for (let k = 0; k < 120 && visits < 6; k++) {
      const stops = routeToStreet(place);
      assert.ok(stops);
      const inside = stops.filter(
        (s) => s.x >= shop.rect.x0 && s.x <= shop.rect.x1
          && s.z >= shop.rect.z0 && s.z <= shop.rect.z1,
      );
      if (inside.length === 0) continue;
      visits++;
      assert.ok(inside.length >= 4, `${name} : visite de ${inside.length} points seulement`);
      assert.ok(
        inside.some((s) => (s.hold ?? 0) > 0),
        `${name} : on traverse la boutique sans s'y arrêter`,
      );
    }
    assert.ok(visits > 0, `${name} : personne n'entre jamais dans la boutique`);
  }
});
