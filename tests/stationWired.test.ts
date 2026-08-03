// LES PREMIÈRES GARES BRANCHÉES SUR LEUR RELEVÉ (phase 20).
//
// Vingt phases pour arriver ici : format, sources, relevé, profils, emprise,
// compilateur, niveaux, marche, portillons, itinéraires, accès, rendu,
// archétypes, limites, occlusion, signalétique, commerces. Rien de tout cela
// ne se voyait — chaque phase se branchait sur un hall générique qui restait le
// même. Huit gares passent maintenant par leur PROFIL, et c'est la première
// fois que le relevé décide de ce qu'on voit.
//
// Ce fichier ne contrôle pas la beauté du résultat : il contrôle que ces huit
// gares tiennent debout. Une gare branchée dont on ne peut pas sortir, dont le
// sol s'arrête, ou dont personne ne trouve la trémie serait un recul, et les
// vingt-deux autres attendent derrière.
//
// Il vérifie AUSSI qu'elles apportent quelque chose. Une gare qu'on branche
// pour retrouver le même couloir droit ne valait pas le détour : ce que chacune
// gagne est écrit ici, gare par gare, tiré de son relevé.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { concourseBays, networkIssues } = await import('../src/data/stationConcourseBuild.ts');
const { profileFor } = await import('../src/data/stationConcourseProfiles.ts');
const { wiredIndices } = await import('../src/data/stationConcourseWired.ts');
const { signageFor } = await import('../src/data/stationSignage.ts');
const {
  routeFromStreet,
  routeToStreet,
  stationInteriorOpen,
} = await import('../src/systems/concourseRoute.ts');
const { concourseFloorAt } = await import('../src/systems/stationLevels.ts');
const { STATIONS } = await import('../src/data/stations.ts');

const GATES = psdGates();
const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
const WIRED = wiredIndices().map((i) => ({ i, name: NAME(i), place: placementFor(i, GATES) }));

test('les TRENTE gares passent par leur relevé', () => {
  assert.deepEqual(
    WIRED.map((w) => w.name),
    [
      'JY01 Tokyo',
      'JY02 Kanda',
      'JY03 Akihabara',
      'JY04 Okachimachi',
      'JY05 Ueno',
      'JY06 Uguisudani',
      'JY07 Nippori',
      'JY08 Nishi-Nippori',
      'JY09 Tabata',
      'JY10 Komagome',
      'JY11 Sugamo',
      'JY12 Ōtsuka',
      'JY13 Ikebukuro',
      'JY14 Mejiro',
      'JY15 Takadanobaba',
      'JY16 Shin-Ōkubo',
      'JY17 Shinjuku',
      'JY18 Yoyogi',
      'JY19 Harajuku',
      'JY20 Shibuya',
      'JY21 Ebisu',
      'JY22 Meguro',
      'JY23 Gotanda',
      'JY24 Ōsaki',
      'JY25 Shinagawa',
      'JY26 Takanawa Gateway',
      'JY27 Tamachi',
      'JY28 Hamamatsuchō',
      'JY29 Shimbashi',
      'JY30 Yūrakuchō',
    ],
  );
  for (const { name, place } of WIRED) {
    assert.equal(place.network.source, 'profile', name);
    assert.equal(place.network.built, true, name);
  }
});

test('une gare branchée reste une gare où l’on entre et d’où l’on sort', () => {
  for (const { name, place } of WIRED) {
    assert.ok(stationInteriorOpen(place), `${name} : hall fermé`);
    assert.ok(place.liveAccesses.length > 0, `${name} : aucune trémie vivante`);
    // Vingt tirages : les itinéraires sont aléatoires, et un seul qui échoue
    // suffit à laisser un voyageur planté au milieu du hall.
    for (let k = 0; k < 20; k++) {
      assert.ok(routeToStreet(place), `${name} : pas d’itinéraire de sortie`);
      assert.ok(routeFromStreet(place), `${name} : pas d’itinéraire d’entrée`);
    }
  }
});

test('le sol répond partout où rien ne barre', () => {
  for (const { name, place } of WIRED) {
    const net = place.network;
    let floor = 0;
    for (const r of net.rooms.filter((x) => x.walkable)) {
      for (let x = r.rect.x0 + 0.25; x < r.rect.x1; x += 0.5) {
        for (let z = r.rect.z0 + 0.25; z < r.rect.z1; z += 0.5) {
          // Ce qui barre barre : bornes de portillon, vitrines, palissades.
          const blocked = net.obstacles.some(
            (o) => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1,
          );
          if (blocked) continue;
          assert.equal(
            concourseFloorAt(place, x, z),
            r.floorY,
            `${name} : pas de sol en (${x.toFixed(2)}, ${z.toFixed(2)}) dans ${r.id}`,
          );
          floor++;
        }
      }
    }
    // Un hall qui ne rendrait que des `null` passerait la boucle ci-dessus
    // sans rien prouver.
    assert.ok(floor > 200, `${name} : seulement ${floor} points de sol`);
  }
});

test('chaque baie est desservie, et chaque bouche atteignable', () => {
  for (const { name, place } of WIRED) {
    const net = place.network;
    const bays = concourseBays(net);
    assert.ok(bays.length > 0, `${name} : aucune baie franchissable`);
    // TOUT CE QU'ON PEUT ATTEINDRE depuis les trémies vivantes : de pièce en
    // pièce, par une volée intérieure comme par un portillon. Un volume ne
    // suffit pas — à Okachimachi on arrive sur une mezzanine, et le hall est un
    // demi-niveau plus bas.
    const seen = new Set(net.accesses.map((a) => a.toRoomId));
    for (let grew = true; grew;) {
      grew = false;
      for (const link of [...net.joins, ...net.gates]) {
        if (!link.walkable) continue;
        for (const [a, b] of [[link.from, link.to], [link.to, link.from]]) {
          if (seen.has(a) && !seen.has(b)) { seen.add(b); grew = true; }
        }
      }
    }
    assert.ok(
      net.mouths.some((m) => seen.has(m.roomId)),
      `${name} : aucune bouche atteignable depuis la trémie`,
    );
    assert.ok(
      bays.some((b) => seen.has(net.gates.find((g) => g.id === b.gateId)!.from)),
      `${name} : aucune baie desservie`,
    );
  }
});

test('CE QUE CHAQUE GARE GAGNE, et qui n’existait pas dans le hall générique', () => {
  // Le hall générique donne une pièce payante, une ligne, une pièce libre, un
  // seul niveau, aucune correspondance et aucune devanture relevée. Ce tableau
  // est la raison d'être de la phase : ce que le relevé ajoute, gare par gare.
  const got = WIRED.map(({ i, place }) => {
    const n = place.network;
    return {
      gare: NAME(i),
      lignes: n.gates.length,
      niveaux: new Set(n.rooms.map((r) => r.floorY)).size,
      archétypes: [...new Set(n.rooms.map((r) => r.kind))].sort().join('+'),
      correspondances: n.transfers.length,
      devantures: n.frontages.length,
    };
  });
  assert.deepEqual(got, [
    { gare: 'JY01 Tokyo', lignes: 2, niveaux: 2, archétypes: 'cross+hubSlice+mezzanine', correspondances: 4, devantures: 2 },
    { gare: 'JY02 Kanda', lignes: 2, niveaux: 1, archétypes: 'underViaduct', correspondances: 2, devantures: 0 },
    { gare: 'JY03 Akihabara', lignes: 3, niveaux: 2, archétypes: 'compact+overbridge+underViaduct', correspondances: 3, devantures: 3 },
    { gare: 'JY04 Okachimachi', lignes: 2, niveaux: 2, archétypes: 'mezzanine+underViaduct', correspondances: 0, devantures: 0 },
    { gare: 'JY05 Ueno', lignes: 2, niveaux: 2, archétypes: 'hubSlice', correspondances: 3, devantures: 2 },
    { gare: 'JY06 Uguisudani', lignes: 2, niveaux: 2, archétypes: 'compact+linear', correspondances: 0, devantures: 0 },
    { gare: 'JY07 Nippori', lignes: 2, niveaux: 2, archétypes: 'overbridge', correspondances: 3, devantures: 0 },
    { gare: 'JY08 Nishi-Nippori', lignes: 1, niveaux: 2, archétypes: 'compact+overbridge', correspondances: 4, devantures: 1 },
    { gare: 'JY09 Tabata', lignes: 2, niveaux: 1, archétypes: 'compact+overbridge', correspondances: 0, devantures: 1 },
    { gare: 'JY10 Komagome', lignes: 2, niveaux: 2, archétypes: 'compact+overbridge', correspondances: 1, devantures: 1 },
    { gare: 'JY11 Sugamo', lignes: 1, niveaux: 1, archétypes: 'overbridge', correspondances: 1, devantures: 2 },
    { gare: 'JY12 Ōtsuka', lignes: 1, niveaux: 1, archétypes: 'underViaduct', correspondances: 1, devantures: 0 },
    { gare: 'JY13 Ikebukuro', lignes: 4, niveaux: 1, archétypes: 'hubSlice', correspondances: 4, devantures: 2 },
    { gare: 'JY14 Mejiro', lignes: 1, niveaux: 2, archétypes: 'compact+mezzanine+overbridge', correspondances: 0, devantures: 0 },
    { gare: 'JY15 Takadanobaba', lignes: 2, niveaux: 1, archétypes: 'compact+underViaduct', correspondances: 2, devantures: 0 },
    { gare: 'JY16 Shin-Ōkubo', lignes: 2, niveaux: 2, archétypes: 'compact+overbridge', correspondances: 0, devantures: 0 },
    { gare: 'JY17 Shinjuku', lignes: 4, niveaux: 2, archétypes: 'cross+hubSlice+linear', correspondances: 4, devantures: 3 },
    { gare: 'JY18 Yoyogi', lignes: 2, niveaux: 1, archétypes: 'compact', correspondances: 3, devantures: 0 },
    { gare: 'JY19 Harajuku', lignes: 2, niveaux: 2, archétypes: 'compact+overbridge', correspondances: 1, devantures: 1 },
    { gare: 'JY20 Shibuya', lignes: 4, niveaux: 1, archétypes: 'hubSlice', correspondances: 4, devantures: 0 },
    { gare: 'JY21 Ebisu', lignes: 2, niveaux: 2, archétypes: 'hubSlice+overbridge+underViaduct', correspondances: 2, devantures: 2 },
    { gare: 'JY22 Meguro', lignes: 1, niveaux: 2, archétypes: 'compact+hubSlice+overbridge', correspondances: 1, devantures: 2 },
    { gare: 'JY23 Gotanda', lignes: 1, niveaux: 2, archétypes: 'overbridge+underViaduct', correspondances: 2, devantures: 2 },
    { gare: 'JY24 Ōsaki', lignes: 2, niveaux: 1, archétypes: 'cross+overbridge', correspondances: 2, devantures: 2 },
    { gare: 'JY25 Shinagawa', lignes: 2, niveaux: 1, archétypes: 'cross+overbridge', correspondances: 3, devantures: 1 },
    { gare: 'JY26 Takanawa Gateway', lignes: 2, niveaux: 2, archétypes: 'cross+overbridge', correspondances: 1, devantures: 0 },
    { gare: 'JY27 Tamachi', lignes: 2, niveaux: 2, archétypes: 'cross+overbridge', correspondances: 1, devantures: 0 },
    { gare: 'JY28 Hamamatsuchō', lignes: 2, niveaux: 2, archétypes: 'hubSlice+overbridge+underViaduct', correspondances: 2, devantures: 0 },
    { gare: 'JY29 Shimbashi', lignes: 3, niveaux: 3, archétypes: 'linear+underViaduct', correspondances: 4, devantures: 0 },
    { gare: 'JY30 Yūrakuchō', lignes: 4, niveaux: 1, archétypes: 'underViaduct', correspondances: 1, devantures: 1 },
  ]);
});

test('une gare branchée annonce SES sorties, et pas les deux premières d’un tableau', () => {
  for (const { i, name, place } of WIRED) {
    const sign = signageFor(place.network, i);
    const relevé = new Set(profileFor(i).exits.map((e) => e.nameJp));
    for (const e of sign.exits) {
      assert.ok(relevé.has(e.jp), `${name} : ${e.jp} n’est pas une sortie du relevé`);
    }
    // Et chaque bouche porte le nom que le relevé lui donne, pas un rang.
    for (const m of place.network.mouths) {
      assert.equal(sign.mouths.get(m.id)?.jp, m.nameJp, `${name} ${m.id}`);
    }
  }
});

test('ce que le compilateur a rogné est DIT, pas caché', () => {
  // Les lignes de portillons du relevé demandent plus de baies que la largeur
  // d'un quai n'en porte : c'est le constat de la phase 7, et il ne disparaît
  // pas parce qu'on branche la gare. Ce qui compte est qu'il reste ÉNONCÉ.
  const codes = new Map<string, number>();
  for (const { i, place } of WIRED) {
    for (const issue of networkIssues(profileFor(i), place.network)) {
      codes.set(issue.code, (codes.get(issue.code) ?? 0) + 1);
    }
  }
  assert.deepEqual(
    [...codes.keys()].sort(),
    ['crampedGate', 'gateOffRoom', 'gateOverlap', 'mouthOverShop', 'narrowMouth', 'shopDropped'],
  );
  // Aucune devanture ne mange le passage : c'est ce qui rendrait une gare
  // INJOUABLE, et le compilateur rogne les vitrines plutôt que de le permettre.
  assert.equal(codes.get('shopEatsAisle'), undefined);
  // DEUX LIGNES COTÉES HORS DE LEURS PIÈCES, et ce sont les deux que le relevé
  // porte : le sud d'Ikebukuro et le 八チ公改札 de Shibuya. Le chantier de 2026 a
  // déplacé la pièce, pas la ligne, et rapprocher l'une de l'autre demanderait
  // d'inventer une cote. Elles sont donc posées telles quelles, DITES, et leurs
  // baies restent inapprochables — ce que `stationInside` sait et n'exige pas.
  assert.equal(codes.get('gateOffRoom'), 2);
  // Trois bouches s'ouvrent au droit d'une devanture — Harajuku et Ebisu, dont
  // les parois sont entièrement commerciales. Une sortie passe avant un
  // magasin : elle est posée quand même, et le compilateur le dit.
  assert.equal(codes.get('mouthOverShop'), 3);
  // ET UNE SUPERPOSITION DE LIGNES : Shin-Ōkubo cote un 改札口 de 4,20 m et un
  // 出口専用 de 1,60 m dans un hall qui en fait 5,20. Les deux largeurs sont
  // COMPOSÉES — un plan japonais n'a pas d'échelle, il dit de quel côté est
  // chaque ligne et combien elle a de baies — et le compilateur range la
  // seconde dans ce que la première laisse. Quand ce qui reste n'a plus la
  // place d'une baie, il garde la cote du relevé et le dit ici plutôt que de
  // rendre un contrôle qu'on ne franchit pas.
  assert.equal(codes.get('gateOverlap'), 1);
});

// --- Phase 22 : les trois premières signatures ---------------------------

test('LES REPÈRES DU LIEU arrivent jusqu’au rendu', () => {
  // Constat R3 : les signatures existantes dessinent ce qu'on voit DEPUIS LE
  // QUAI, et rien pour l'intérieur. Le relevé note quarante repères ; ils ne
  // servaient à personne.
  const seen = new Map<string, number>();
  for (const { i, place } of WIRED) {
    for (const l of place.network.landmarks) {
      seen.set(l.kind, (seen.get(l.kind) ?? 0) + 1);
      assert.ok(
        place.network.rooms.some((r) => r.id === l.roomId),
        `${NAME(i)} : repère ${l.id} dans une pièce inconnue`,
      );
      // Aucun n'a d'emprise : un plan officiel ne cote pas une horloge. C'est
      // ce fait-là qui interdit de les poser au centimètre.
      assert.equal(l.rect, null, `${NAME(i)} : ${l.id} a une emprise cotée`);
    }
  }
  assert.ok(seen.size >= 4, `seulement ${seen.size} catégories de repères`);
  // Le 三角時計 de Shinagawa : la seule horloge nommée du relevé, et le point
  // de rendez-vous de la gare.
  assert.equal(seen.get('clock'), 1);
});

test('les trois signatures de la phase 22 tiennent leur promesse', () => {
  const by = (i: number) => WIRED.find((w) => w.i === i)!.place.network;

  // NIPPORI cesse d'être un cas spécial : son niveau EXISTE, et c'est un pont
  // qui enjambe le faisceau — deux pièces `overbridge`, pas un hall générique
  // empilé dans le premier (constat R4).
  const nippori = by(6);
  assert.equal(nippori.built, true);
  assert.ok(nippori.rooms.some((r) => r.kind === 'overbridge' && r.walkable));
  assert.ok(nippori.landmarks.some((l) => l.kind === 'trackView'));

  // SHINAGAWA : le passage traversant, son horloge, et le CHANTIER de 2026 qui
  // ferme trente et un mètres de la zone payante — les baies se replient sur ce
  // qui reste atteignable.
  const shinagawa = by(24);
  assert.ok(shinagawa.landmarks.some((l) => l.kind === 'clock'));
  assert.ok(shinagawa.hoardings.length > 0);
  const central = concourseBays(shinagawa).filter((b) => b.gateId === 'gate-central');
  const hoard = shinagawa.hoardings.find((h) => h.roomId === 'paid-central')!;
  for (const b of central) {
    assert.ok(
      b.x > hoard.rect.x1 || b.x < hoard.rect.x0,
      `Shinagawa : une baie reste derrière la palissade (x=${b.x.toFixed(2)})`,
    );
  }

  // TAKANAWA GATEWAY : la toiture pliée et le bois, deux repères qui sont des
  // QUALITÉS du volume — ils arrivent jusqu'au rendu, qui a le droit de n'en
  // rien dessiner et le dit.
  const takanawa = by(25);
  assert.deepEqual(
    takanawa.landmarks.map((l) => l.kind).sort(),
    ['ceiling', 'material'],
  );
});

// --- Phase 27 : ce que les captures ont trouvé ---------------------------

test('UNE BOUCHE S’OUVRE SUR SA PAROI, quelle qu’elle soit', () => {
  // Les captures de contrôle ont montré d'un coup d'œil ce qu'aucun test ne
  // regardait : à Tokyo, un mur nu là où sept sorties auraient dû s'ouvrir. Le
  // rendu ne perçait que le FOND du hall — le seul cas d'un hall longitudinal —
  // et trente-trois bouches sur quatre-vingt-deux donnent sur une paroi en x.
  const sides = new Map<string, number>();
  for (const { i, place } of WIRED) {
    const net = place.network;
    for (const m of net.mouths) {
      sides.set(m.side, (sides.get(m.side) ?? 0) + 1);
      const room = net.rooms.find((r) => r.id === m.roomId);
      assert.ok(room, `${NAME(i)} : bouche ${m.id} sans pièce`);
      // La cote `at` se lit LE LONG de la paroi, et doit y tomber.
      const [lo, hi] = m.side === 'x0' || m.side === 'x1'
        ? [room.rect.z0, room.rect.z1]
        : [room.rect.x0, room.rect.x1];
      assert.ok(
        m.at - m.halfWidth >= lo - 1e-6 && m.at + m.halfWidth <= hi + 1e-6,
        `${NAME(i)} : ${m.id} déborde de sa paroi ${m.side}`,
      );
    }
  }
  // Les quatre parois servent : si une seule disparaissait de ce compte, c'est
  // que le relevé aurait été aplati sur le cas longitudinal.
  assert.deepEqual([...sides.keys()].sort(), ['x0', 'x1', 'z0', 'z1']);
  // Et Tokyo n'a AUCUNE bouche au fond : c'est elle qui a fait tomber le
  // masque, et c'est elle qui garde le test honnête.
  const tokyo = WIRED.find((w) => w.i === 0)!.place.network;
  assert.ok(tokyo.mouths.every((m) => m.side === 'x0' || m.side === 'x1'));
});
