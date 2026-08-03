// LES DEVANTURES RELEVÉES (phase 19, constat D8).
//
// Le hall générique déduit ses commerces de l'affluence ; le relevé les a LUS.
// Ce test tient les deux séparés, et surtout il tient la règle qui fait toute
// la valeur du dispositif : UNE ENSEIGNE NE S'INVENTE PAS. Un commerce dont le
// statut ne dit pas qu'on l'a lue n'a pas le droit d'en porter une.
//
// Le reste est de la géométrie, et elle a une raison d'être : un commerce de
// gare borde le hall, il ne le bouche pas. Le relevé cote une EMPRISE — GRANSTA
// fait quarante-six mètres de long sur huit de fond — et ce qu'on en montre est
// la devanture. Poser l'emprise telle quelle remplirait le niveau d'un bloc
// plein qu'on ne pourrait pas contourner.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const {
  compileProfile,
  networkIssues,
  shellsOf,
} = await import('../src/data/stationConcourseBuild.ts');
const { CONCOURSE_PROFILES } = await import('../src/data/stationConcourseProfiles.ts');
const { GALLERY_DEPTH, SHOP_DEPTH } = await import('../src/data/stationInterior.ts');
const { MIN_MAIN_WIDTH } = await import('../src/data/stationConcourseTypes.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const { wiredIndices } = await import('../src/data/stationConcourseWired.ts');

/**
 * Les gares restées sur le hall générique.
 *
 * Ce qui suit compare l'affichage d'aujourd'hui à celui d'avant la source
 * unique. Une gare BRANCHÉE sur son relevé (phase 20) annonce ses vraies
 * sorties, pas les deux premières d'un tableau : l'y contraindre reviendrait à
 * exiger qu'elle ne soit pas branchée.
 */
const LEGACY = Array.from({ length: STATION_COUNT }, (_, i) => i)
  .filter((i) => !wiredIndices().includes(i));

const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
const NETS = CONCOURSE_PROFILES.map((p) => ({ p, net: compileProfile(p) }));

test('le hall générique ne porte aucune devanture relevée', () => {
  for (const i of LEGACY) {
    const net = placementFor(i, psdGates()).network;
    assert.deepEqual(net.frontages, [], NAME(i));
  }
});

test('chaque zone commerciale du relevé devient une devanture, ou se DIT perdue', () => {
  let total = 0;
  let dropped = 0;
  for (const { p, net } of NETS) {
    const zones = p.commercialZones.filter((z) =>
      p.concourses.some((n) => n.id === z.nodeId),
    );
    // Une zone que le hall ne peut pas porter sans fermer le passage disparaît
    // — Gotanda a deux atre de trois mètres de fond pour un hall de six — et
    // `networkIssues` le dit alors en toutes lettres (`shopDropped`).
    const lost = zones.length - net.frontages.length;
    dropped += lost;
    assert.equal(
      networkIssues(p, net).filter((i) => i.code === 'shopDropped').length,
      lost,
      NAME(p.stationIndex),
    );
    assert.equal(
      new Set(net.frontages.map((f) => f.id)).size,
      net.frontages.length,
      NAME(p.stationIndex),
    );
    total += net.frontages.length;
  }
  // Vingt-neuf devantures posées sur les trente gares, et deux perdues faute de
  // place. Un plancher, pas une valeur exacte : s'il tombe, c'est le relevé qui
  // a été vidé.
  assert.ok(total >= 28, `${total} devantures`);
  assert.equal(dropped, 3, `${dropped} devantures perdues`);
});

test('UNE ENSEIGNE NE S’INVENTE PAS', () => {
  for (const { p, net } of NETS) {
    for (const f of net.frontages) {
      if (f.brand === undefined) continue;
      assert.ok(
        f.status === 'namedVerified' || f.status === 'gallery',
        `${NAME(p.stationIndex)} ${f.id} : ${f.status} porte l’enseigne ${f.brand}`,
      );
      assert.ok(f.brand.trim().length > 0, `${NAME(p.stationIndex)} ${f.id}`);
    }
  }
});

test('une devanture s’adosse à la paroi la plus proche, et regarde la pièce', () => {
  for (const { p, net } of NETS) {
    for (const f of net.frontages) {
      const room = net.rooms.find((r) => r.id === f.roomId);
      assert.ok(room, `${NAME(p.stationIndex)} ${f.id}`);
      const gaps: Record<string, number> = {
        x0: f.rect.x0 - room.rect.x0,
        x1: room.rect.x1 - f.rect.x1,
        z0: f.rect.z0 - room.rect.z0,
        z1: room.rect.z1 - f.rect.z1,
      };
      const closest = Object.entries(gaps).sort((a, b) => a[1] - b[1])[0][0];
      assert.equal(f.side, closest, `${NAME(p.stationIndex)} ${f.id}`);
      // La vitrine se développe LE LONG de sa paroi, jamais en travers.
      assert.equal(
        f.along,
        f.side === 'x0' || f.side === 'x1' ? 'z' : 'x',
        `${NAME(p.stationIndex)} ${f.id}`,
      );
    }
  }
});

test('on ne montre que la DEVANTURE, jamais l’emprise entière', () => {
  let trimmed = 0;
  for (const { p, net } of NETS) {
    for (const f of net.frontages) {
      const depth =
        f.along === 'z' ? f.rect.x1 - f.rect.x0 : f.rect.z1 - f.rect.z0;
      const max = f.category === 'gallery' ? GALLERY_DEPTH : SHOP_DEPTH;
      assert.ok(
        depth <= max + 1e-6,
        `${NAME(p.stationIndex)} ${f.id} : ${depth.toFixed(2)} m de fond`,
      );
      const zone = p.commercialZones.find((z) => z.id === f.id);
      assert.ok(zone);
      const declared =
        f.along === 'z' ? zone.rect.x1 - zone.rect.x0 : zone.rect.z1 - zone.rect.z0;
      if (declared > max + 1e-6) trimmed++;
    }
  }
  // GRANSTA fait huit mètres de fond : au moins une emprise est rognée, sinon
  // la règle ne s'applique à rien et ce test ne prouve plus rien.
  assert.ok(trimmed > 0, 'aucune emprise rognée');
});

test('une devanture reste dans sa pièce, et laisse le passage', () => {
  for (const { p, net } of NETS) {
    for (const f of net.frontages) {
      const room = net.rooms.find((r) => r.id === f.roomId);
      assert.ok(room);
      assert.ok(
        f.rect.x0 >= room.rect.x0 - 1e-6 && f.rect.x1 <= room.rect.x1 + 1e-6
          && f.rect.z0 >= room.rect.z0 - 1e-6 && f.rect.z1 <= room.rect.z1 + 1e-6,
        `${NAME(p.stationIndex)} ${f.id} déborde de ${f.roomId}`,
      );
      const left =
        f.along === 'z'
          ? Math.max(f.rect.x0 - room.rect.x0, room.rect.x1 - f.rect.x1)
          : Math.max(f.rect.z0 - room.rect.z0, room.rect.z1 - f.rect.z1);
      assert.ok(
        left >= MIN_MAIN_WIDTH - 1e-6,
        `${NAME(p.stationIndex)} ${f.id} : ${left.toFixed(2)} m de passage`,
      );
    }
  }
});

test('aucune gare ne signale une devanture qui mange le passage', () => {
  for (const { p, net } of NETS) {
    const bad = networkIssues(p, net).filter((i) => i.code === 'shopEatsAisle');
    assert.deepEqual(bad, [], `${NAME(p.stationIndex)} : ${bad.map((b) => b.message)}`);
  }
});

test('une vitrine ne se traverse pas', () => {
  for (const { p, net } of NETS) {
    for (const f of net.frontages) {
      assert.ok(
        net.obstacles.some(
          (o) =>
            Math.abs(o.x0 - f.rect.x0) < 1e-6 && Math.abs(o.x1 - f.rect.x1) < 1e-6
            && Math.abs(o.z0 - f.rect.z0) < 1e-6 && Math.abs(o.z1 - f.rect.z1) < 1e-6,
        ),
        `${NAME(p.stationIndex)} ${f.id} n’est pas un obstacle`,
      );
    }
  }
});

test('une devanture qui ne se dessinera pas est une devanture NON PRATICABLE', () => {
  // `Concourse` enveloppe les volumes praticables, et rien d'autre. Une
  // devanture posée dans une pièce qu'on REGARDE sans y aller — GRANSTA, vue
  // depuis le hall de Tokyo, `depiction: 'vista'` — ne s'affichera donc pas
  // tant que les phases de signature n'auront pas appris à dessiner une vue.
  //
  // Ce n'est pas un défaut de la donnée : c'est une limite du rendu, et elle
  // est nommée ici pour qu'elle ne passe pas pour un oubli. Ce que le test
  // interdit, c'est qu'une devanture d'une pièce PRATICABLE disparaisse.
  const pending: string[] = [];
  for (const { p, net } of NETS) {
    const drawn = new Set(shellsOf(net).flatMap((s) => s.rooms.map((r) => r.id)));
    for (const f of net.frontages) {
      if (drawn.has(f.roomId)) continue;
      const room = net.rooms.find((r) => r.id === f.roomId);
      assert.ok(room, `${NAME(p.stationIndex)} ${f.id} : pièce inconnue`);
      assert.equal(
        room.walkable,
        false,
        `${NAME(p.stationIndex)} ${f.id} : pièce praticable, et pourtant hors volume`,
      );
      pending.push(`${NAME(p.stationIndex)} ${f.id}`);
    }
  }
  // Six devantures sur trente et une, et ce sont exactement les galeries que le
  // relevé a posées dans une pièce qu'on REGARDE : GRANSTA depuis le hall de
  // Tokyo, le Seibu depuis Ikebukuro, NEWoMan depuis Shinjuku. La liste est
  // celle d'aujourd'hui, et elle doit rester COURTE : une gare de plus dedans
  // est une décision, pas un effet de bord.
  assert.deepEqual(pending, [
    'JY01 Tokyo shop-gransta',
    'JY03 Akihabara shop-atre2',
    'JY05 Ueno shop-atre',
    'JY13 Ikebukuro shop-seibu',
    'JY17 Shinjuku shop-newoman',
    'JY21 Ebisu shop-atre-east',
  ]);
});
