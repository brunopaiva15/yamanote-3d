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
const {
  concourseBays,
  networkIssues,
  shellsOf,
} = await import('../src/data/stationConcourseBuild.ts');
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

test('les huit gares de la phase 20 passent par leur relevé', () => {
  assert.deepEqual(
    WIRED.map((w) => w.name),
    [
      'JY02 Kanda',
      'JY06 Uguisudani',
      'JY08 Nishi-Nippori',
      'JY10 Komagome',
      'JY11 Sugamo',
      'JY14 Mejiro',
      'JY16 Shin-Ōkubo',
      'JY18 Yoyogi',
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
    // Le volume où débouchent les accès : c'est là qu'on arrive, et tout ce
    // qu'on doit pouvoir atteindre en part.
    const shells = shellsOf(net);
    const served = shells.filter((s) =>
      s.rooms.some((r) => net.accesses.some((a) => a.toRoomId === r.id)));
    assert.equal(served.length, 1, `${name} : ${served.length} volumes desservis`);
    const inside = new Set(served[0].rooms.map((r) => r.id));
    const mouths = net.mouths.filter((m) => inside.has(m.roomId));
    assert.ok(mouths.length > 0, `${name} : aucune bouche dans le volume desservi`);
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
    // Le dessous du viaduc, deux contrôles, et le Ginza qu'on voit sans le
    // prendre : c'est Kanda, et aucun couloir droit ne l'aurait donné.
    { gare: 'JY02 Kanda', lignes: 2, niveaux: 1, archétypes: 'underViaduct', correspondances: 2, devantures: 0 },
    // DEUX HALLS, à cent mètres l'un de l'autre et sur deux niveaux : le nord
    // passe sous les voies, et c'est pour cela qu'il descend à −6,40 m.
    { gare: 'JY06 Uguisudani', lignes: 2, niveaux: 2, archétypes: 'compact+linear', correspondances: 0, devantures: 0 },
    // Un pont-concourse au-dessus du faisceau, et quatre lignes en
    // correspondance : Chiyoda, Nippori-Toneri, et le reste.
    { gare: 'JY08 Nishi-Nippori', lignes: 1, niveaux: 2, archétypes: 'compact+overbridge', correspondances: 4, devantures: 1 },
    { gare: 'JY10 Komagome', lignes: 2, niveaux: 2, archétypes: 'compact+overbridge', correspondances: 1, devantures: 1 },
    // La tranchée : le hall enjambe les voies, et les deux blocs d'atre vie
    // que le dépôt ne déclarait pas bordent la zone libre.
    { gare: 'JY11 Sugamo', lignes: 1, niveaux: 1, archétypes: 'overbridge', correspondances: 1, devantures: 2 },
    // Une MEZZANINE : un demi-niveau ouvert, qui donne à cette petite gare une
    // coupe à trois niveaux.
    { gare: 'JY14 Mejiro', lignes: 1, niveaux: 2, archétypes: 'compact+mezzanine+overbridge', correspondances: 0, devantures: 0 },
    { gare: 'JY16 Shin-Ōkubo', lignes: 2, niveaux: 2, archétypes: 'compact+overbridge', correspondances: 0, devantures: 0 },
    { gare: 'JY18 Yoyogi', lignes: 2, niveaux: 1, archétypes: 'compact', correspondances: 3, devantures: 0 },
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
  assert.deepEqual([...codes.keys()].sort(), ['crampedGate', 'narrowMouth']);
  // Aucune devanture ne mange le passage, et aucune bouche ne s'ouvre dans une
  // vitrine : ce sont les deux qui rendraient une gare INJOUABLE.
  assert.equal(codes.get('shopEatsAisle'), undefined);
  assert.equal(codes.get('mouthOverShop'), undefined);
});
