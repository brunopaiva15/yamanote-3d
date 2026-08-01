// Les deux commerces de gare : le kiosque du quai, le konbini du hall.
//
// Ils ont grandi tous les deux - le kiosque de 2,50 × 4,80 à 3,00 × 6,40, le
// konbini de 6,40 × 3,20 à 7,80 × 3,40 - et une boutique qui grandit prend sa
// place sur le PASSAGE. C'est ce que ce fichier surveille, et rien d'autre :
// pas la garniture, pas les enseignes, pas ce qu'on voit à travers la vitre,
// mais le fait qu'on puisse encore marcher autour.
//
// Deux règles, une par commerce :
//
//   · LE KIOSQUE EST UN ÎLOT. Il s'ouvre des deux longueurs, donc il doit
//     laisser passer des DEUX côtés - et pas seulement d'un. Décalé de 1,35 m
//     vers la voie comme il l'était, il ne laissait que vingt-cinq centimètres
//     entre lui et le bord d'embarquement du quai le plus étroit qui en porte
//     un : on ne passait plus, et le comptoir de ce côté-là donnait sur un mur
//     d'air. La faute ne se voyait dans aucune capture - elle se voyait en
//     marchant, et personne ne marche par là dans une capture.
//
//   · LE KONBINI NE DOIT PERDRE AUCUNE GARE. Sa profondeur décide de qui
//     l'obtient (`data/stationInterior`, règle du passage libre) : à 3,40 m
//     toutes celles qui l'avaient à 3,20 m l'ont encore, et un centimètre de
//     plus en aurait coûté deux.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { layoutFor } = await import('../src/data/stationLayouts.ts');
const { KIOSK_HALF_X, KIOSK_HALF_Z, PSD_X } = await import('../src/data/stationGeometry.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');
const { STATIONS } = await import('../src/data/stations.ts');

const GATES = psdGates();
const ALL = Array.from({ length: STATION_COUNT }, (_, i) => ({
  i,
  name: `${STATIONS[i].jy} ${STATIONS[i].romaji}`,
  layout: layoutFor(i),
  place: placementFor(i, GATES),
}));

/**
 * Passage libre exigé de chaque côté du kiosque.
 *
 * Un mètre vingt : de quoi croiser quelqu'un sans se ranger. C'est moins que
 * le couloir de correspondance (2 m, la règle du hall) parce qu'un quai offre
 * toujours l'AUTRE côté de l'îlot en secours, ce qu'un couloir n'offre pas.
 */
const KIOSK_CLEAR = 1.2;

test('le kiosque laisse passer des deux côtés, sur toutes les gares qui en ont un', () => {
  let seen = 0;
  for (const { name, place } of ALL) {
    const k = place.kiosk;
    if (!k) continue;
    seen += 1;
    const near = k.x - k.halfX - place.walkX0;
    const far = place.walkX1 - (k.x + k.halfX);
    assert.ok(near >= KIOSK_CLEAR, `${name} : ${near.toFixed(2)} m côté voie`);
    assert.ok(far >= KIOSK_CLEAR, `${name} : ${far.toFixed(2)} m côté opposé`);
  }
  assert.ok(seen >= 8, `trop peu de gares à kiosque : ${seen}`);
});

test('le kiosque est centré sur l’épine, et non poussé vers un bord', () => {
  // C'est ce centrage qui fait qu'il SERT des deux côtés. Un kiosque décentré
  // n'est pas un kiosque de moins bonne facture : c'est une boutique.
  for (const { name, layout, place } of ALL) {
    const k = place.kiosk;
    if (!k || layout.config === 'side') continue;
    assert.ok(Math.abs(k.x - place.backX) < 1e-9, `${name} : kiosque hors de l’épine`);
    assert.equal(k.halfX, KIOSK_HALF_X, name);
    assert.equal(k.halfZ, KIOSK_HALF_Z, name);
  }
});

test('le kiosque tient sous l’auvent, quelle que soit la gare', () => {
  // Auvent + bandeau : 2,48 + 0,38 + 0,08 de rive, soit 2,94 m hors tout
  // (three/station/Kiosk). Sous un auvent de quai bas, cela doit encore passer.
  const KIOSK_TOP = 2.94;
  for (const { name, layout, place } of ALL) {
    if (!place.kiosk) continue;
    assert.ok(layout.canopyY - KIOSK_TOP >= 0.5, `${name} : auvent à ${layout.canopyY} m`);
  }
});

test('le kiosque ne mord sur aucun accès vertical', () => {
  // Trémies, escaliers mécaniques et ascenseur sont posés par le gabarit, comme
  // lui : personne ne s'écarte, donc il faut que ça tombe juste.
  for (const { name, place } of ALL) {
    const k = place.kiosk;
    if (!k) continue;
    const others = [...place.stairs, ...place.escalators, ...(place.elevator ? [place.elevator] : [])];
    for (const o of others) {
      const dz = Math.abs(o.z - k.z) - (o.halfZ + k.halfZ);
      const dx = Math.abs(o.x - k.x) - (o.halfX + k.halfX);
      assert.ok(dz > 0 || dx > 0, `${name} : kiosque et accès en z=${o.z.toFixed(1)}`);
    }
  }
});

test('le konbini n’a coûté sa boutique à aucune gare en grandissant', () => {
  // La liste est celle des gares assez fréquentées (crowdScale ≥ 1,2) ET assez
  // larges pour garder deux mètres de passage. Elle ne doit pas rétrécir : un
  // konbini perdu à Takadanobaba serait passé inaperçu au rendu et se serait vu
  // dans le hall, un jour, sous la forme d'un mur nu.
  const withKonbini = ALL.filter(({ place }) =>
    place.interior.fixtures.some((f) => f.kind === 'konbini'),
  );
  // La liste est GELÉE, et non recalculée à côté du moteur : la place d'un
  // konbini ne tient pas à la largeur du hall seule, mais à ce qu'il a EN FACE
  // de lui. Une règle écrite ici (« assez large pour 3,40 m plus deux mètres »)
  // décrivait un hall aux parois nues, qui n'existe nulle part : à 5,70 m,
  // Akihabara ne peut même pas mettre une boutique en face d'un distributeur de
  // titres, et le moteur a raison de refuser.
  assert.deepEqual(withKonbini.map((k) => k.name), [
    'JY01 Tokyo',
    'JY13 Ikebukuro',
    'JY17 Shinjuku',
    'JY20 Shibuya',
    'JY24 Ōsaki',
    'JY29 Shimbashi',
  ]);
  // Et chacune est bien assez fréquentée et assez large pour l'avoir méritée.
  for (const k of withKonbini) {
    const width = k.place.interior.free.x1 - k.place.interior.free.x0;
    assert.ok(k.layout.crowdScale >= 1.2, `${k.name} : konbini dans une gare calme`);
    assert.ok(width >= 3.4 + 2 + 0.12, `${k.name} : konbini dans un hall trop étroit`);
  }
});

test('le konbini laisse deux mètres de passage dans le hall', () => {
  // La règle du hall, celle qui refuse un meuble plutôt que de l'y tasser.
  for (const { name, place } of ALL) {
    const it = place.interior;
    for (const f of it.fixtures) {
      if (f.kind !== 'konbini') continue;
      const depth = f.rect.x1 - f.rect.x0;
      const width = it.free.x1 - it.free.x0;
      assert.ok(width - depth >= 2 - 1e-9, `${name} : passage à ${(width - depth).toFixed(2)} m`);
    }
  }
});

test('le konbini reste en zone libre, jamais derrière les portillons', () => {
  // On n'achète pas son onigiri après avoir composté : la boutique est devant
  // la ligne, comme les distributeurs de titres et les consignes.
  for (const { name, place } of ALL) {
    for (const f of place.interior.fixtures) {
      if (f.kind !== 'konbini') continue;
      assert.ok(f.rect.z0 >= place.interior.free.z0 - 1e-9, `${name} : konbini en zone payante`);
    }
  }
});

test('le gabarit de charpente écarte ses poteaux du kiosque', () => {
  // Les poteaux d'épine des charpentes signature sont posés par data (avant le
  // placement) : ils lisent la même emprise de kiosque, ou ils s'y plantent.
  for (const { name, layout, place } of ALL) {
    const k = place.kiosk;
    if (!k || !layout.sigPlan) continue;
    for (const post of layout.sigPlan.posts) {
      const dz = Math.abs(post.z - k.z) - (k.halfZ + 0.35);
      const dx = Math.abs(post.x - k.x) - (k.halfX + 0.35);
      assert.ok(dz > 0 || dx > 0, `${name} : poteau de charpente dans le kiosque`);
    }
  }
});

test('les emprises déclarées sont bien celles que le rendu emploie', () => {
  // Le kiosque est le seul meuble de quai dont les cotes soient PARTAGÉES entre
  // trois fichiers - la géométrie les déclare, le placement les pose, le
  // gabarit de charpente les évite. Deux valeurs divergentes, et un poteau
  // d'auvent tombe dans la boutique sans que rien ne le dise.
  assert.equal(KIOSK_HALF_X * 2, 3);
  assert.equal(KIOSK_HALF_Z * 2, 6.4);
  // Et le kiosque tient sur la dalle : son nu ne déborde jamais du quai.
  for (const { name, layout, place } of ALL) {
    const k = place.kiosk;
    if (!k) continue;
    assert.ok(k.x - k.halfX >= PSD_X, `${name} : kiosque au-dessus de la voie`);
    assert.ok(k.x + k.halfX <= PSD_X + layout.depth, `${name} : kiosque hors dalle`);
  }
});

// --- Le konbini, praticable ----------------------------------------------
//
// La boutique a cessé d'être un bloc : on y entre. C'est le genre de bascule
// qui marche du premier coup à l'écran et se casse en silence six mois plus
// tard, quand une cote de meuble bouge d'un côté sans bouger de l'autre. Ce
// qui suit tient les deux bouts : on passe par où il faut, et nulle part
// ailleurs.

const { konbiniPlan } = await import('../src/data/konbiniPlan.ts');

/** Les konbini réellement posés, avec leur emprise et leur sens de façade. */
const SHOPS = ALL.flatMap(({ name, place }) =>
  place.interior.fixtures
    .filter((f) => f.kind === 'konbini')
    .map((f) => ({ name, it: place.interior, f })),
);

/** Un point du repère LOCAL de la boutique, rabattu en repère quai. */
function toStation(f: { rect: { x0: number; x1: number; z0: number; z1: number }; facing: -1 | 1 }, lx: number, lz: number) {
  const cx = (f.rect.x0 + f.rect.x1) / 2;
  const cz = (f.rect.z0 + f.rect.z1) / 2;
  return f.facing === 1 ? { x: cx + lz, z: cz - lx } : { x: cx - lz, z: cz + lx };
}

/** Le sol du hall existe-t-il sous ce point ? (même règle que systems/walkable) */
function walkable(it: { paid: { x0: number; x1: number; z0: number }; free: { z1: number }; obstacles: { x0: number; x1: number; z0: number; z1: number }[] }, x: number, z: number): boolean {
  if (x < it.paid.x0 || x > it.paid.x1) return false;
  if (z < it.paid.z0 || z > it.free.z1) return false;
  return !it.obstacles.some((o) => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1);
}

test('on entre dans le konbini par sa porte, et par elle seule', () => {
  assert.ok(SHOPS.length >= 6, `trop peu de konbini : ${SHOPS.length}`);
  for (const { name, it, f } of SHOPS) {
    const plan = konbiniPlan(f.rect.z1 - f.rect.z0, f.rect.x1 - f.rect.x0);
    // Dans l'axe de la baie, au nu de la devanture : on passe.
    const door = toStation(f, plan.doorX, plan.zf - 0.02);
    assert.ok(walkable(it, door.x, door.z), `${name} : porte murée`);
    // À un mètre de l'axe, sur le panneau fixe : on ne passe pas.
    const wall = toStation(f, plan.doorL - 0.5, plan.zf - 0.02);
    assert.ok(!walkable(it, wall.x, wall.z), `${name} : on traverse la vitrine`);
  }
});

test('depuis la porte, on atteint le fond de la boutique', () => {
  // LA SEULE PROPRIÉTÉ QUI COMPTE, et elle n'est pas géométrique : la
  // CONNEXITÉ. Une boutique dont l'allée serait coupée en deux redeviendrait
  // une vitrine, et aucune cote prise séparément ne le dirait - c'est le jeu
  // des meubles ENTRE EUX qui bouche un passage. Un premier essai vérifiait
  // qu'une ligne droite traversait la boutique : il tombait sur le bac à
  // glaces, qui est en plein milieu du passage parce que c'est là qu'il est en
  // vrai. On contourne, donc on cherche un CHEMIN, pas une droite.
  //
  // Le pas de dix centimètres n'est pas un réglage : c'est quatre fois le pas
  // du joueur à soixante images par seconde, donc largement de quoi ne rater
  // aucun goulet que la marche saurait franchir.
  const STEP = 0.1;
  for (const { name, it, f } of SHOPS) {
    const plan = konbiniPlan(f.rect.z1 - f.rect.z0, f.rect.x1 - f.rect.x0);
    const nx = Math.ceil((2 * plan.hw) / STEP);
    const nz = Math.ceil((plan.zf - plan.zb) / STEP);
    const at = (ix: number, iz: number) => {
      const q = toStation(f, -plan.hw + (ix + 0.5) * STEP, plan.zb + (iz + 0.5) * STEP);
      return walkable(it, q.x, q.z);
    };
    const seen = new Set<number>();
    // On part du seuil, dans l'axe de la baie.
    const start: [number, number] = [
      Math.floor((plan.doorX + plan.hw) / STEP),
      Math.floor((plan.zf - 0.05 - plan.zb) / STEP),
    ];
    assert.ok(at(start[0], start[1]), `${name} : seuil infranchissable`);
    const queue: [number, number][] = [start];
    seen.add(start[0] * 1000 + start[1]);
    while (queue.length) {
      const [ix, iz] = queue.pop()!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const jx = ix + dx;
        const jz = iz + dz;
        const key = jx * 1000 + jz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz || seen.has(key)) continue;
        if (!at(jx, jz)) continue;
        seen.add(key);
        queue.push([jx, jz]);
      }
    }
    // Le fond de la boutique : le coin le plus éloigné de la porte, devant le
    // meuble froid. Si on l'atteint, tout ce qu'il y a entre les deux est
    // atteint. On le prend à quarante centimètres de la joue - au milieu, on
    // tombait sur le VENDEUR, qui est un obstacle comme un autre.
    const deepX = -plan.hw + 0.4;
    const deepZ = plan.zb + plan.coolD + 0.3;
    const deep = toStation(f, deepX, deepZ);
    assert.ok(walkable(it, deep.x, deep.z), `${name} : le fond n'est pas du sol`);
    const dix = Math.floor((deepX + plan.hw) / STEP);
    const diz = Math.floor((deepZ - plan.zb) / STEP);
    assert.ok(seen.has(dix * 1000 + diz), `${name} : le fond de la boutique est coupé de la porte`);
  }
});

test('les meubles du konbini restent infranchissables', () => {
  // On entre dans la boutique, pas dans la gondole. Chaque meuble est testé en
  // son CENTRE : c'est le point qu'aucune tolérance de bord ne sauve.
  for (const { name, it, f } of SHOPS) {
    const plan = konbiniPlan(f.rect.z1 - f.rect.z0, f.rect.x1 - f.rect.x0);
    const middles: [string, number, number][] = [
      ['gondole', (plan.gondX0 + plan.gondX1) / 2, plan.gondZ],
      ['vitrines', (plan.coolX0 + plan.coolX1) / 2, plan.zb + plan.coolD / 2],
      ['comptoir', (plan.counter.x0 + plan.counter.x1) / 2, plan.counter.z0 + plan.counter.depth / 2],
      ['bac à glaces', plan.chest.x, plan.chest.z],
      ['magazines', (plan.rackX0 + plan.rackX1) / 2, plan.rackZ],
    ];
    for (const [what, lx, lz] of middles) {
      const q = toStation(f, lx, lz);
      assert.ok(!walkable(it, q.x, q.z), `${name} : on traverse ${what}`);
    }
  }
});
