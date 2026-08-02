// Le réseau sous les pieds (systems/stationLevels + systems/stationPlacement).
//
// C'est la première fois que le relevé touche le jeu. Jusqu'ici il vivait à
// côté : format, sources, profils, portée, compilateur — quatre phases sans un
// seul consommateur. `concourseFloorAt` interroge maintenant le RÉSEAU, et
// c'est elle qui décide où le joueur pose le pied, où la foule marche, et où
// `systems/concourseRoute` accepte de tracer un itinéraire.
//
// DEUX CHOSES À PROTÉGER, ET ELLES TIRENT EN SENS CONTRAIRE :
//
//   · que RIEN NE CHANGE. Aucune gare n'est branchée sur son relevé : le
//     réseau est l'enveloppe du hall générique, et le sol doit être le même au
//     centimètre. Un test compare donc les deux, point par point, sur les
//     trente gares — c'est le seul moyen de savoir qu'un branchement n'a pas
//     déplacé un plancher en silence ;
//   · que le réseau SACHE FAIRE PLUS. N pièces à N altitudes, des liens dont
//     le sol s'interpole, des bouches sur n'importe quelle paroi : cela ne se
//     voit sur aucune gare aujourd'hui, et cela se vérifie sur les relevés
//     compilés.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const {
  concourseFloorAt,
  exitMouthFloorAt,
  joinFloorAt,
} = await import('../src/systems/stationLevels.ts');
const { compileProfile } = await import('../src/data/stationConcourseBuild.ts');
const { CONCOURSE_PROFILES } = await import('../src/data/stationConcourseProfiles.ts');
const { wiredCount } = await import('../src/data/stationConcourseWired.ts');
const { EXIT_MOUTH_END } = await import('../src/data/stationInterior.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');

const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
const PLACE = (i: number) => placementFor(i, psdGates());

test('le placement porte le réseau de chaque gare', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = PLACE(i);
    assert.equal(p.network.stationIndex, i, NAME(i));
    assert.equal(p.network.source, 'legacy', NAME(i));
    assert.equal(p.network.built, p.interior.built, NAME(i));
  }
  assert.equal(wiredCount(), 0, 'une gare a été branchée sans que le test le sache');
});

test('LE SOL N’A PAS BOUGÉ D’UN CENTIMÈTRE', () => {
  // LE TEST QUI COMPTE. On rejoue à la main ce que faisait `concourseFloorAt`
  // avant la phase 8 — une boîte, du débouché du couloir au fond de la zone
  // libre, moins les obstacles — et l'on exige que le réseau réponde
  // exactement la même chose. Sur toute la surface des trente halls, au
  // demi-mètre.
  let sampled = 0;
  let floor = 0;
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = PLACE(i);
    const it = p.interior;
    /** L'ancienne implémentation, mot pour mot. */
    const before = (x: number, z: number): number | null => {
      if (!it.built) return null;
      if (x < it.paid.x0 || x > it.paid.x1) return null;
      if (z < it.paid.z0 || z > it.free.z1) return null;
      for (const o of it.obstacles) {
        if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1) return null;
      }
      return it.floorY;
    };
    for (let x = it.paid.x0 - 1; x <= it.paid.x1 + 1; x += 0.5) {
      for (let z = it.paid.z0 - 1; z <= it.free.z1 + 1; z += 0.5) {
        sampled++;
        const now = concourseFloorAt(p, x, z);
        assert.equal(now, before(x, z), `${NAME(i)} : le sol a changé en (${x}, ${z})`);
        if (now !== null) floor++;
      }
    }
  }
  // Et l'échantillon a bien touché du sol : un test qui ne compare que des
  // `null` ne prouve rien.
  assert.ok(sampled > 30000, `échantillon trop maigre : ${sampled} points`);
  assert.ok(floor > 5000, `seulement ${floor} points de sol trouvés`);
});

test('les bouches de sortie répondent comme avant', () => {
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = PLACE(i);
    const it = p.interior;
    for (const e of it.exits) {
      for (let t = -0.2; t <= EXIT_MOUTH_END + 0.2; t += 0.1) {
        for (const dx of [-e.halfWidth - 0.1, -e.halfWidth + 0.05, 0, e.halfWidth + 0.1]) {
          const x = e.x + dx;
          const z = it.free.z1 + t;
          const inside = it.built
            && t >= 0 && t <= EXIT_MOUTH_END
            && Math.abs(dx) <= e.halfWidth;
          const got = exitMouthFloorAt(p, x, z);
          assert.equal(
            got !== null,
            inside,
            `${NAME(i)} : bouche ${e.slot} à t=${t.toFixed(1)} dx=${dx.toFixed(2)}`,
          );
        }
      }
    }
  }
});

test('aucun hall générique n’a de liaison interne — c’est le sujet de la suite', () => {
  // `joinFloorAt` ne rend jamais rien aujourd'hui : le hall générique est
  // d'un seul tenant. C'est exactement le constat S1 du plan, et c'est
  // pourquoi la fonction se vérifie sur les relevés, pas sur les gares.
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = PLACE(i);
    assert.equal(p.network.joins.length, 0, NAME(i));
    assert.equal(joinFloorAt(p, 4, 20), null, NAME(i));
  }
});

test('un lien praticable est du sol, et sa pente s’interpole', () => {
  // La démonstration se fait sur Okachimachi, seule gare du relevé dont un
  // lien PRATICABLE joint deux niveaux : la mezzanine M2F et le hall du 1F.
  // C'est le demi-niveau que le plan officiel montre, et qu'aucun hall
  // générique ne produirait.
  const net = compileProfile(CONCOURSE_PROFILES[3]);
  const j = net.joins.find((x) => x.id === 'c-mezz-north');
  assert.ok(j, 'JY04 Okachimachi : le lien de mezzanine a disparu');
  assert.equal(j.walkable, true);
  assert.ok(j.fromY > j.toY, 'la volée devrait descendre vers le hall');

  const fake = { network: net } as unknown as Parameters<typeof joinFloorAt>[0];
  const mid = { x: (j.rect.x0 + j.rect.x1) / 2, z: (j.rect.z0 + j.rect.z1) / 2 };
  const at = (z: number) => joinFloorAt(fake, mid.x, z);

  // Aux deux bouts, les deux altitudes ; au milieu, la moyenne.
  assert.ok(Math.abs(at(j.rect.z0)! - j.fromY) < 1e-9, 'le haut de la volée');
  assert.ok(Math.abs(at(j.rect.z1)! - j.toY) < 1e-9, 'le bas de la volée');
  assert.ok(Math.abs(at(mid.z)! - (j.fromY + j.toY) / 2) < 1e-9, 'le milieu');
  // Et hors de l'ouvrage, rien.
  assert.equal(joinFloorAt(fake, mid.x, j.rect.z0 - 1), null);
});

test('les relevés compilés donnent N pièces à N altitudes', () => {
  // Ce que le hall générique ne saura jamais faire, et qui est toute la raison
  // du chantier : le sol sous les pieds change d'altitude selon l'endroit.
  const multi: string[] = [];
  for (const p of CONCOURSE_PROFILES) {
    const net = compileProfile(p);
    const floors = new Set(net.rooms.filter((r) => r.walkable).map((r) => r.floorY.toFixed(3)));
    if (floors.size > 1) multi.push(NAME(p.stationIndex));
  }
  // Deux gares ont DEUX SOLS PRATICABLES à des altitudes différentes : le
  // demi-niveau d'Okachimachi, et les deux ensembles de Harajuku — le
  // souterrain de Takeshita sous la voie, le bâtiment de 2020 au-dessus.
  assert.deepEqual(multi, ['JY04 Okachimachi', 'JY19 Harajuku']);

  // Harajuku est le cas extrême : près de douze mètres entre les deux sols.
  const harajuku = compileProfile(CONCOURSE_PROFILES[18]);
  const ys = harajuku.rooms.filter((r) => r.walkable).map((r) => r.floorY);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 11, 'les deux gares de Harajuku se sont rejointes');
});
