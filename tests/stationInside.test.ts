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
const { concourseBays, networkIssues } = await import('../src/data/stationConcourseBuild.ts');
const { wiredProfile } = await import('../src/data/stationConcourseWired.ts');
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

/**
 * LA RÉFÉRENCE EST LE RÉSEAU, plus le hall générique.
 *
 * Ces contrôles lisaient `place.interior` — une ligne de portillons, un fond de
 * hall, deux bouches — parce qu'il n'y avait rien d'autre à lire. Une gare
 * branchée sur son relevé (phase 20) a trois lignes et cinq bouches, et son
 * `interior` générique ne décrit plus rien de ce qu'on parcourt. On interroge
 * donc la même source que la marche : `place.network`.
 */
const baysOf = (place: Place) => concourseBays(place.network);

/**
 * Les lignes de portillon que le compilateur signale comme INFRANCHISSABLES.
 *
 * Ce n'est pas un contournement : `networkIssues` les nomme une par une, elles
 * sont documentées dans `STATION_CONCOURSE_SCOPE`, et une ligne cotée hors du
 * recouvrement de ses deux pièces n'a par construction aucune approche. Le
 * test s'en sert pour ne pas exiger d'un itinéraire qu'il aille là où il n'y a
 * pas de sol.
 */
const OFF_ROOM = (i: number): { where: string }[] => {
  const p = wiredProfile(i);
  if (!p) return [];
  return networkIssues(p, ALL[i].place.network).filter((it) => it.code === 'gateOffRoom');
};

/** L'axe qu'on franchit à une baie, et les deux bords de sa ligne. */
function gateSpan(place: Place, tap: number): { axis: 'x' | 'z'; g0: number; g1: number; paidLow: boolean } {
  const bay = baysOf(place)[tap];
  const axis = bay.cross;
  const [g0, g1] = axis === 'z' ? [bay.rect.z0, bay.rect.z1] : [bay.rect.x0, bay.rect.x1];
  const gate = place.network.gates.find((g) => g.id === bay.gateId)!;
  const paid = place.network.rooms.find((r) => r.id === gate.from)!;
  const [p0, p1] = axis === 'z' ? [paid.rect.z0, paid.rect.z1] : [paid.rect.x0, paid.rect.x1];
  return { axis, g0, g1, paidLow: (p0 + p1) / 2 < (g0 + g1) / 2 };
}

const INSIDE = ALL.filter(({ place }) => stationInteriorOpen(place));

test('toutes les gares bâties ont un intérieur où descendre', () => {
  // TRENTE SUR TRENTE, depuis la phase 22. Nippori était le seul cas manquant :
  // le hall générique refusait de se bâtir chez elle (`bespoke: true`) pour ne
  // pas empiler un second pont-concourse dans le premier — la bonne décision,
  // prise faute de pouvoir dire mieux. Son relevé le dit en donnée ordinaire :
  // deux ponts-concours au 2F, et le niveau EXISTE. C'était le constat R4.
  assert.equal(INSIDE.length, STATION_COUNT);
  const missing = ALL.filter(({ place }) => !stationInteriorOpen(place)).map((s) => s.name);
  assert.deepEqual(missing, []);
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
    const n = baysOf(place).length;
    for (let k = 0; k < 20; k++) {
      // Sortir se valide côté PAYANT, entrer côté LIBRE : dans les deux cas,
      // du côté d'où l'on vient. On bipe avant de s'engager, jamais après -
      // c'est le geste même du 改札, et une validation posée de l'autre côté
      // de la ligne ferait passer le portillon pour un tourniquet de métro
      // parisien qu'on paie en sortant.
      const ways = [
        { stops: routeToStreet(place), from: 'le quai', side: -1 },
        { stops: routeFromStreet(place)?.stops, from: 'la rue', side: 1 },
      ] as const;
      for (const { stops, from, side } of ways) {
        assert.ok(stops);
        const taps = stops.filter((s) => s.tap !== undefined);
        assert.equal(taps.length, 1, `${name} : ${taps.length} validations dans un trajet`);
        const tap = taps[0].tap as number;
        assert.ok(tap >= 0 && tap < n, `${name} : passage ${tap} inexistant`);
        // On valide DEVANT la borne, pas dedans : le geste se voit, et le
        // portillon a le temps de s'ouvrir avant qu'on l'atteigne. Le côté
        // PAYANT n'est plus « le z le plus petit » : une ligne peut se franchir
        // selon x, et la zone payante être au-delà.
        const { axis, g0, g1, paidLow } = gateSpan(place, tap);
        const at = (st: Stop) => (axis === 'z' ? st.z : st.x);
        // `side < 0` : on vient du quai, donc du côté payant.
        const fromLow = side < 0 ? paidLow : !paidLow;
        const a = at(taps[0]);
        const edge = fromLow ? g0 : g1;
        assert.ok(
          fromLow ? a < edge && a > edge - 2 : a > edge && a < edge + 2,
          `${name} : en venant de ${from}, validation à ${a.toFixed(2)} -`
            + ` hors d'atteinte du lecteur, ou de l'autre côté de la ligne`,
        );
        // Et AVANT de la franchir : le point de validation précède tout point
        // posé au-delà de la ligne.
        const crossed = stops.findIndex((s) => (fromLow ? at(s) > g1 : at(s) < g0));
        const tapAt = stops.findIndex((s) => s.tap !== undefined);
        assert.ok(
          crossed < 0 || tapAt < crossed,
          `${name} : en venant de ${from}, on franchit la ligne avant de biper`,
        );
        assert.ok((taps[0].hold ?? 0) > 0, `${name} : on ne s'arrête pas pour valider`);
      }
    }
  }
});

test('on ne s’engouffre pas tous dans le même vantail', () => {
  // La ligne se remplit : sur quatre cents départs, chacune des baies sert. Une
  // règle fixe - « la plus loin du joueur » - envoyait la gare entière dans le
  // même passage, l'un derrière l'autre, les autres déserts.
  //
  // QUATRE CENTS ET NON CENT : Shinjuku a quatorze baies sur trois lignes, et
  // le choix n'est pas uniforme — on vise la baie libre, pas une baie au sort.
  // Cent tirages en manquaient une de temps en temps, ce qui faisait tomber le
  // test un jour sur quatre sans qu'aucune gare ait bougé.
  for (const { i, name, place } of INSIDE) {
    // SAUF LES BAIES D'UNE LIGNE QUI NE SE FRANCHIT PAS. Le relevé de Shibuya
    // cote le 八チ公改札 hors du recouvrement de ses deux pièces — le chantier
    // 2026 a déplacé la pièce, pas la ligne — et le compilateur le DIT déjà
    // (`gateOffRoom`). Ses baies sont donc inapprochables, et c'est le bon
    // comportement : les servir demanderait d'inventer une cote. Exiger ici
    // qu'elles servent reviendrait à exiger cette invention.
    const off = new Set(
      OFF_ROOM(i).map((issue) => issue.where),
    );
    const bays = baysOf(place).map((b, k) => ({ b, k })).filter(({ b }) => !off.has(b.gateId));
    const seen = new Set<number>();
    for (let k = 0; k < 400; k++) {
      const stops = routeToStreet(place);
      assert.ok(stops);
      seen.add(stops.find((s) => s.tap !== undefined)?.tap as number);
    }
    assert.deepEqual(
      [...seen].sort((a, b) => a - b),
      bays.map(({ k }) => k),
      `${name} : ${seen.size} baies servies sur ${bays.length}`,
    );
  }
});

test('une baie déjà prise se cède à la voisine', () => {
  for (const { name, place } of INSIDE) {
    const n = baysOf(place).length;
    // Trois voyageurs déjà en route vers la baie 0 : on va ailleurs. Pas
    // JAMAIS - deux files se forment très bien dans un hall chargé - mais
    // presque, et c'est cet écart-là qui se vérifie.
    const busy = new Array<number>(n).fill(0);
    busy[0] = 3;
    let same = 0;
    for (let k = 0; k < 200; k++) {
      const stops = routeToStreet(place, busy);
      assert.ok(stops);
      if (stops.find((s) => s.tap !== undefined)?.tap === 0) same++;
    }
    // La ligne la plus étroite du réseau en fait 7 % ; une baie sur cinq
    // voudrait dire que la charge n'a pas été lue du tout.
    assert.ok(same < 40, `${name} : ${same}/200 départs sur une baie encombrée`);
  }
});

test('la baie devant laquelle le joueur se tient n’est pas à prendre', () => {
  const { name, place } = INSIDE[0];
  const bays = baysOf(place);
  const n = bays.length;
  runtime.playerLevel = 'concourse';
  // UN MÈTRE DEVANT LA BAIE, du côté payant — et « devant » se dit sur l'axe
  // qu'on FRANCHIT : Tokyo se traverse selon x, et un joueur posé un mètre plus
  // bas en z se tenait simplement à côté de la ligne, sans rien bloquer.
  const { axis, g0, g1, paidLow } = gateSpan(place, 1);
  const at = paidLow ? g0 - 1 : g1 + 1;
  runtime.playerPlatX = axis === 'x' ? at : bays[1].x;
  runtime.playerPlatZ = axis === 'x' ? bays[1].z : at;
  try {
    const seen = new Set<number>();
    for (let k = 0; k < 120; k++) {
      const stops = routeToStreet(place);
      assert.ok(stops);
      seen.add(stops.find((s) => s.tap !== undefined)?.tap as number);
    }
    assert.ok(!seen.has(1), `${name} : on passe dans la baie où le joueur hésite`);
    // Toutes les autres, en revanche : ce n'est pas une baie qu'on choisit,
    // c'est une baie qu'on écarte.
    assert.equal(seen.size, n - 1, `${name} : ${seen.size} baies servies sur ${n - 1}`);
  } finally {
    runtime.playerLevel = 'platform';
  }
});

test('on s’efface en haut de la volée d’une bouche, jamais en plein hall', () => {
  for (const { name, place } of INSIDE) {
    for (let k = 0; k < 20; k++) {
      const stops = routeToStreet(place);
      assert.ok(stops);
      const last = stops[stops.length - 1];
      // La bouche où l'on s'efface : celle dont la volée contient le dernier
      // point. Une bouche perce N'IMPORTE QUELLE paroi depuis la phase 7 — le
      // fond du hall n'est plus forcément le +z de la zone libre.
      const found = place.network.mouths
        .map((m) => {
          const room = place.network.rooms.find((r) => r.id === m.roomId);
          if (!room?.walkable) return null;
          const r = room.rect;
          // Enfoncement dans la volée, et écart au milieu de la baie.
          const t = m.side === 'z1' ? last.z - r.z1
            : m.side === 'z0' ? r.z0 - last.z
              : m.side === 'x1' ? last.x - r.x1
                : r.x0 - last.x;
          const off = m.side === 'z0' || m.side === 'z1'
            ? Math.abs(last.x - m.at)
            : Math.abs(last.z - m.at);
          return { t, off, m };
        })
        .filter((c): c is { t: number; off: number; m: typeof place.network.mouths[number] } =>
          c !== null && c.off <= c.m.halfWidth + 1e-6)
        .sort((a, b) => Math.abs(a.t) - Math.abs(b.t))[0];
      assert.ok(found, `${name} : effacement hors de toute bouche`);
      // Au moins cinq girons dans la bouche : au-dessous, le linteau ne cache
      // pas encore, et l'effacement se verrait depuis le hall.
      assert.ok(
        found.t >= EXIT_MOUTH_Z0 + 5 * 0.31 - 1e-6 && found.t <= EXIT_MOUTH_END + 1e-6,
        `${name} : effacement à ${found.t.toFixed(2)} m du nu de la paroi`,
      );
    }
  }
});

test('celui qui entre au konbini en fait vraiment le tour', () => {
  // La visite est tirée au sort : on en fait assez pour tomber dessus, et l'on
  // vérifie qu'elle mène jusqu'à la CAISSE. Une boutique où l'on entrerait
  // pour faire trois pas et ressortir ne se lirait pas comme une boutique.
  // Le konbini se lit sur le RÉSEAU, comme le reste : une gare branchée sur son
  // relevé range son mobilier contre SES parois, et la cote du hall générique
  // ne dit plus où il est (phase 20).
  const shops = INSIDE.filter(({ place }) =>
    place.network.fixtures.some((f) => f.kind === 'konbini'));
  // SIX gares, comme avant la phase 20 : c'est le mobilier générique qui les
  // donne, et le relevé n'en a jamais coté un seul — un plan officiel ne cote
  // pas une boutique de quai. Le seuil dit ce qui EST, et tombera si le
  // mobilier cesse d'être posé.
  assert.ok(shops.length >= 6, `trop peu de konbini : ${shops.length}`);
  const away: string[] = [];
  for (const { name, place } of shops) {
    const shop = place.network.fixtures.find((f) => f.kind === 'konbini');
    assert.ok(shop);
    let visits = 0;
    for (let k = 0; k < 240 && visits < 6; k++) {
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
    if (visits === 0) away.push(name);
  }
  // ET TROIS BOUTIQUES N'ONT PAS DE CLIENTS, pour une raison qui se dit.
  //
  // Le mobilier générique se range CONTRE LA PAROI QU'IL REGARDE, et cette
  // paroi est repérée sur x — c'est la profondeur du hall générique, qui se
  // développe en z. Trois relevés retournent cette logique : les halls de
  // Tokyo, d'Ikebukuro et de Shibuya se développent en X, sur quarante à
  // soixante-seize mètres, et « contre la paroi x1 » y désigne le PIGNON, à
  // l'autre bout de la pièce. La boutique s'y pose sans rien barrer, mais elle
  // est à trente-cinq mètres du trajet, et un crochet de trente-cinq mètres
  // n'est plus un crochet — le voyageur qui l'ferait ne ressortirait pas de la
  // gare dans le temps où les autres la traversent.
  //
  // Faire tourner le meuble avec la pièce demanderait de donner un axe au
  // mobilier, donc de reprendre le rendu, le plan de konbini et la marche : ce
  // n'est pas une correction, c'est une phase. La liste est donc écrite ici,
  // et elle doit rester COURTE.
  assert.deepEqual(away, ['JY01 Tokyo', 'JY13 Ikebukuro', 'JY20 Shibuya']);
});
