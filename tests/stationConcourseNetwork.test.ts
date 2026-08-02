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

const { liveAccessesFor, placementFor } = await import('../src/systems/stationPlacement.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const {
  CLEAR_DECK,
  concourseFloorAt,
  exitMouthFloorAt,
  joinFloorAt,
  mainAccessFloor,
  walkerBlocked,
} = await import('../src/systems/stationLevels.ts');
const {
  bayAt,
  compileProfile,
  concourseBays,
} = await import('../src/data/stationConcourseBuild.ts');
const {
  routeToStreet,
  stationInteriorOpen,
} = await import('../src/systems/concourseRoute.ts');
const { CONCOURSE_PROFILES } = await import('../src/data/stationConcourseProfiles.ts');
const { wiredCount } = await import('../src/data/stationConcourseWired.ts');
const { EXIT_MOUTH_END } = await import('../src/data/stationInterior.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');

const NAME = (i: number) => `${STATIONS[i].jy} ${STATIONS[i].romaji}`;
const PLACE = (i: number) => placementFor(i, psdGates());

/**
 * Une gare BRANCHÉE sur son relevé — exactement ce que fera
 * `data/stationConcourseWired` le jour venu : le réseau compilé, et les accès
 * de quai appariés avec lui. Les deux vont ensemble ; un placement dont le
 * réseau et les accès ne se répondent pas ne dessert plus rien, et c'est le
 * bon comportement.
 */
function wired(i: number) {
  const base = PLACE(i);
  const network = compileProfile(CONCOURSE_PROFILES[i]);
  return {
    ...base,
    network,
    liveAccesses: liveAccessesFor(network, base.mainStair, {
      stairs: base.stairs,
      escalator: base.escalators,
      elevator: base.elevator ? [base.elevator] : [],
    }),
  };
}

/** La volée principale appartient aux deux étages : elle n'est jamais barrée. */
const mainAccessBypass = (
  p: ReturnType<typeof PLACE>,
  x: number,
  z: number,
): boolean => mainAccessFloor(p, x, z) !== null || mainAccessFloor(p, x, z + CLEAR_DECK) !== null;

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

// --- Phase 9 : la marche ------------------------------------------------

test('une volée intérieure se descend au lieu de faire un mur', () => {
  // LE GESTE QUE LA PHASE 9 REND POSSIBLE. Le demi-niveau d'Okachimachi est un
  // sol à part entière : on y arrive du quai, on le traverse, on descend au
  // hall. Sans lui, la mezzanine serait un plancher flottant qu'on ne peut pas
  // quitter — et la foule, elle, buterait sur un mur invisible d'un mètre.
  //
  // Le placement réel d'Okachimachi porte encore son hall générique : on lui
  // greffe le réseau compilé de son relevé, ce qui est exactement ce que fera
  // `data/stationConcourseWired` le jour venu.
  const p = wired(3);
  const j = p.network.joins.find((x) => x.id === 'c-mezz-north')!;
  const mid = {
    x: (j.rect.x0 + j.rect.x1) / 2,
    z: (j.rect.z0 + j.rect.z1) / 2,
  };

  // Ce n'est pas une pièce…
  assert.equal(concourseFloorAt(p, mid.x, mid.z), null);
  // …c'est un ouvrage, et c'est du sol.
  const y = joinFloorAt(p, mid.x, mid.z);
  assert.ok(y !== null, 'la volée de mezzanine n’est pas du sol');
  assert.ok(y! < j.fromY && y! > j.toY, 'la volée ne descend pas en chemin');
  // Et la foule le sait aussi.
  assert.equal(walkerBlocked(p, 'concourse', mid.x, mid.z), false);

  // Les deux pièces qu'elle joint sont bien à deux altitudes différentes.
  const mezz = p.network.rooms.find((r) => r.id === 'mezz-north')!;
  const hall = p.network.rooms.find((r) => r.id === 'paid-north')!;
  assert.ok(mezz.floorY - hall.floorY > 1.5, 'le demi-niveau s’est aplati');
  assert.equal(concourseFloorAt(p, mid.x, mezz.rect.z1 - 0.1), mezz.floorY);
  assert.equal(concourseFloorAt(p, mid.x, hall.rect.z0 + 0.1), hall.floorY);
});

test('un ouvrage ne franchit pas ce qui barre', () => {
  // Une borne de portillon plantée au pied d'une volée ne devient pas
  // franchissable parce qu'on descend.
  const p = wired(3);
  const cab = p.network.obstacles[0];
  const at = { x: (cab.x0 + cab.x1) / 2, z: (cab.z0 + cab.z1) / 2 };
  assert.equal(joinFloorAt(p, at.x, at.z), null);
  assert.equal(concourseFloorAt(p, at.x, at.z), null);
  assert.equal(walkerBlocked(p, 'concourse', at.x, at.z), true);
});

test('la marche des trente gares n’a pas changé', () => {
  // Aucun hall générique n'ayant de liaison, l'ajout des ouvrages ne peut rien
  // déplacer. On le vérifie plutôt que de le supposer : `walkerBlocked` est ce
  // qui tient la foule dans le hall, et une régression y serait invisible
  // jusqu'à ce qu'un voyageur traverse un mur.
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = PLACE(i);
    const it = p.interior;
    for (let x = it.paid.x0 - 1; x <= it.paid.x1 + 1; x += 0.6) {
      for (let z = it.paid.z0 - 1; z <= it.free.z1 + 1; z += 0.6) {
        const blocked = walkerBlocked(p, 'concourse', x, z);
        // Reconstruit à la main, sans le réseau : bouche, sol, obstacles.
        const byHand = exitMouthFloorAt(p, x, z) !== null
          ? false
          : concourseFloorAt(p, x, z) === null
            ? true
            : it.obstacles.some((o) => x > o.x0 - 0.05 && x < o.x1 + 0.05
              && z > o.z0 - 0.05 && z < o.z1 + 0.05);
        assert.equal(
          blocked,
          mainAccessBypass(p, x, z) ? false : byHand,
          `${NAME(i)} : la marche a changé en (${x.toFixed(1)}, ${z.toFixed(1)})`,
        );
      }
    }
  }
});

// --- Phase 10 : les baies, toutes lignes confondues ---------------------

test('les baies du hall générique sont EXACTEMENT celles d’avant', () => {
  // `systems/fareGate` tient un état par baie, indexé par un rang plat. Ce rang
  // traverse maintenant les groupes ; pour une gare à une seule ligne il doit
  // rester le même, dans le même ordre, sans quoi les battants s'ouvriraient au
  // mauvais endroit.
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = PLACE(i);
    const bays = concourseBays(p.network);
    const before = p.interior.built ? p.interior.gate.passages : [];
    assert.equal(bays.length, before.length, NAME(i));
    bays.forEach((b, k) => {
      assert.equal(b.index, k, NAME(i));
      assert.equal(b.x, before[k].x, `${NAME(i)} : baie ${k} déplacée`);
      assert.equal(b.width, before[k].width, NAME(i));
      assert.equal(b.wide, before[k].wide, NAME(i));
      assert.equal(b.cross, 'z', NAME(i));
    });
  }
});

test('« dans quelle baie suis-je » répond comme avant', () => {
  // Quatre endroits posaient cette question de quatre façons ; elle est posée
  // une fois. On rejoue l'ancienne réponse sur toute la ligne de portillons.
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = PLACE(i);
    const it = p.interior;
    if (!it.built) continue;
    const before = (x: number, z: number): number => {
      if (z < it.gate.z0 || z > it.gate.z1) return -1;
      for (let k = 0; k < it.gate.passages.length; k++) {
        if (Math.abs(x - it.gate.passages[k].x) <= it.gate.passages[k].width / 2) return k;
      }
      return -1;
    };
    for (let x = it.paid.x0; x <= it.paid.x1; x += 0.07) {
      for (let z = it.gate.z0 - 0.6; z <= it.gate.z1 + 0.6; z += 0.15) {
        const hit = bayAt(p.network, x, z);
        const now = hit && hit.gap === 0 ? hit.bay.index : -1;
        assert.equal(now, before(x, z), `${NAME(i)} : baie changée en (${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
  }
});

test('DEUX GROUPES, un seul rang de baies', () => {
  // Takanawa Gateway est la seule gare du relevé dont les DEUX contrôles sont
  // franchissables : c'est un hall d'une pièce, deux portes. Le rang plat les
  // enfile, et chaque baie sait de quel groupe elle vient.
  const net = compileProfile(CONCOURSE_PROFILES[25]);
  const bays = concourseBays(net);
  const groups = [...new Set(bays.map((b) => b.gateId))];
  assert.deepEqual(groups, ['gate-north', 'gate-south']);
  bays.forEach((b, k) => assert.equal(b.index, k));
  assert.ok(bays.length >= 8, `seulement ${bays.length} baies`);

  // Et l'on retrouve chacune là où elle est : ces lignes se franchissent en x,
  // donc leurs baies s'égrènent en z — l'inverse du hall générique.
  for (const b of bays) {
    assert.equal(b.cross, 'x');
    const hit = bayAt(net, (b.rect.x0 + b.rect.x1) / 2, b.z);
    assert.equal(hit?.bay.index, b.index, `baie ${b.index} introuvable`);
    assert.equal(hit?.gap, 0);
  }
  // Les deux groupes sont à des z différents : on ne les confond pas.
  const north = bays.filter((b) => b.gateId === 'gate-north');
  const south = bays.filter((b) => b.gateId === 'gate-south');
  assert.ok(Math.min(...north.map((b) => b.z)) > Math.max(...south.map((b) => b.z)));
});

test('l’écart à la ligne se mesure sur l’axe qu’on franchit', () => {
  // `gap` vaut zéro ENTRE LES BORNES — c'est ce qui fait qu'un portillon ne
  // pince personne — et croît dès qu'on s'en éloigne, du bon côté.
  const net = compileProfile(CONCOURSE_PROFILES[25]);
  const b = concourseBays(net)[0];
  const mid = (b.rect.x0 + b.rect.x1) / 2;
  assert.equal(bayAt(net, mid, b.z)?.gap, 0);
  assert.ok(Math.abs(bayAt(net, b.rect.x0 - 1.2, b.z)!.gap - 1.2) < 1e-9);
  assert.ok(Math.abs(bayAt(net, b.rect.x1 + 0.4, b.z)!.gap - 0.4) < 1e-9);
  // Hors du fuseau latéral, rien : on n'est dans aucune baie.
  assert.equal(bayAt(net, mid, b.z + b.width), null);
});

test('« carte seule » et « sortie seule » survivent à la compilation', () => {
  // Deux faits qu'aucune génération ne produit, et qui doivent arriver
  // jusqu'au portillon lui-même : Shin-Ōkubo a une bretelle à sens unique
  // réservée à la carte sans contact, Tokyo un contrôle central qui n'accepte
  // qu'elle.
  const okubo = concourseBays(compileProfile(CONCOURSE_PROFILES[15]));
  const only = okubo.filter((b) => b.exitOnly);
  assert.ok(only.length >= 1, 'JY16 Shin-Ōkubo : la bretelle a disparu');
  assert.ok(only.every((b) => b.icOnly), 'la bretelle devrait être à carte seule');
  assert.ok(okubo.some((b) => !b.exitOnly), 'il ne reste que la bretelle');

  const tokyo = concourseBays(compileProfile(CONCOURSE_PROFILES[0]));
  assert.ok(tokyo.every((b) => b.icOnly), 'JY01 Tokyo : le Marunouchi central accepte tout');
});

// --- Phase 11 : les itinéraires ------------------------------------------

test('UN HALL TRANSVERSAL SE TRAVERSE EN TRAVERS', () => {
  // Le routeur supposait l'axe : il longeait toujours z, entre `paid.x0` et
  // `paid.x1`, avec la ligne de portillons au milieu (constat S3). Takanawa
  // Gateway est l'inverse exact — un hall d'une pièce qu'on franchit en x, deux
  // contrôles à ses deux bouts, les bouches sur un flanc — et c'est là que la
  // généralisation se voit.
  const p = wired(25);
  assert.equal(stationInteriorOpen(p), true, 'JY26 Takanawa Gateway : hall fermé');

  // Les deux contrôles se franchissent en x, les deux bouches percent un flanc.
  assert.ok(p.network.gates.every((g) => g.cross === 'x'));
  assert.ok(p.network.mouths.every((m) => m.side === 'x1'));

  // Cent tirages : à chaque fois un itinéraire complet, et jamais un pas hors
  // du sol. C'est le même contrôle que `stationInside` applique aux trente
  // gares — celui qui compte, parce qu'un voyageur qui traverse un mur ne se
  // rattrape pas.
  for (let k = 0; k < 100; k++) {
    const route = routeToStreet(p);
    assert.ok(route, 'itinéraire refusé');
    for (const stop of route!) {
      const onFloor = concourseFloorAt(p, stop.x, stop.z) !== null
        || exitMouthFloorAt(p, stop.x, stop.z) !== null
        || joinFloorAt(p, stop.x, stop.z) !== null
        // Le premier point est dans la volée d'accès, le dernier au-dessus de
        // la bouche : ni l'un ni l'autre n'est du sol de hall.
        || stop === route![0] || stop === route![route!.length - 1];
      assert.ok(onFloor, `pas hors sol en (${stop.x.toFixed(2)}, ${stop.z.toFixed(2)})`);
    }
    // Et le trajet PROGRESSE EN X : c'est un hall qu'on traverse, pas qu'on
    // longe. Le hall générique donnerait exactement l'inverse.
    const body = route!.slice(1, -1);
    const dx = Math.max(...body.map((q) => q.x)) - Math.min(...body.map((q) => q.x));
    const dz = Math.max(...body.map((q) => q.z)) - Math.min(...body.map((q) => q.z));
    assert.ok(dx > dz, `trajet longé en z (dx=${dx.toFixed(1)} dz=${dz.toFixed(1)})`);
  }
});

test('on valide une fois, du côté d’où l’on vient', () => {
  // La règle ne dépend pas de l'axe : le lecteur est sur le dessus de la borne,
  // et la carte s'y pose AVANT de s'engager. En sortant on bipe côté payant, en
  // entrant côté libre — dans un hall transversal comme dans un couloir droit.
  const p = wired(25);
  const bays = concourseBays(p.network);
  for (let k = 0; k < 60; k++) {
    const out = routeToStreet(p)!;
    const taps = out.filter((q) => q.tap !== undefined);
    assert.equal(taps.length, 1, 'une validation, pas deux');
    const bay = bays[taps[0].tap!];
    assert.ok(bay, 'validation sur une baie qui n’existe pas');
    // Le point de validation est du côté PAYANT de sa ligne…
    const paid = p.network.rooms.find(
      (r) => r.id === p.network.gates.find((g) => g.id === bay.gateId)!.from,
    )!;
    const gateMid = (bay.rect.x0 + bay.rect.x1) / 2;
    const roomMid = (paid.rect.x0 + paid.rect.x1) / 2;
    assert.equal(
      taps[0].x < gateMid,
      roomMid < gateMid,
      'on a bipé du mauvais côté de la ligne',
    );
    // …et le point SUIVANT est de l'autre côté : on bipe, puis on franchit.
    const after = out[out.indexOf(taps[0]) + 1];
    assert.equal(
      Math.sign(after.x - gateMid),
      -Math.sign(taps[0].x - gateMid),
      'la validation ne précède pas le franchissement',
    );
  }
});

test('les deux groupes de Takanawa Gateway se remplissent tous les deux', () => {
  // Le choix de groupe est ce que la phase 11 rend possible : le rang plat
  // traverse les lignes, donc le tirage aussi. Une gare où l'on ne verrait
  // jamais personne au second contrôle serait fausse.
  const p = wired(25);
  const bays = concourseBays(p.network);
  const seen = new Set<string>();
  for (let k = 0; k < 300; k++) {
    const tap = routeToStreet(p)!.find((q) => q.tap !== undefined)!;
    seen.add(bays[tap.tap!].gateId);
  }
  assert.deepEqual([...seen].sort(), ['gate-north', 'gate-south']);
});

// --- Phase 12 : les accès secondaires ------------------------------------

test('vingt-huit gares ont UN accès vivant, et c’est le principal', () => {
  // Le repli ne change pas : la trémie la plus proche du milieu du quai mène
  // au hall, les autres restent les couloirs borgnes qu'elles étaient.
  for (let i = 0; i < STATION_COUNT; i++) {
    const p = PLACE(i);
    if (!p.network.built) {
      assert.equal(p.liveAccesses.length, 0, `${NAME(i)} : rien n’est bâti, rien ne mène nulle part`);
      continue;
    }
    assert.equal(p.liveAccesses.length, 1, NAME(i));
    assert.equal(p.liveAccesses[0].stair, p.mainStair, NAME(i));
    assert.equal(p.liveAccesses[0].rise, p.mainRise, NAME(i));
  }
});

test('HARAJUKU EN A DEUX, et ils ne se rejoignent que par le quai', () => {
  // La gare qui a fait tomber G3. Ses deux ensembles — le souterrain de
  // Takeshita sous la voie, le bâtiment de 2020 au-dessus — sont si petits que
  // l'un ne suffirait pas à faire une gare, et AUCUN couloir ne les joint.
  const p = wired(18);
  assert.equal(p.liveAccesses.length, 2);
  assert.equal(p.network.joins.length, 0, 'un couloir est apparu entre les deux');

  const [a, b] = p.liveAccesses;
  assert.notEqual(a.stair, b.stair, 'les deux accès partagent une trémie');
  assert.notEqual(a.toRoomId, b.toRoomId, 'les deux accès mènent au même endroit');
  // L'un descend sous la voie, l'autre monte au bâtiment : douze mètres entre
  // les deux sols.
  const y = (id: string) => p.network.rooms.find((r) => r.id === id)!.floorY;
  assert.ok(Math.abs(y(a.toRoomId) - y(b.toRoomId)) > 11);
  assert.deepEqual([a.rise, b.rise].sort(), ['down', 'up']);

  // Et les DEUX volées se descendent : c'est exactement ce que `mainAccessFloor`
  // refusait avant, et ce qui rendait le second ensemble inatteignable.
  for (const acc of p.liveAccesses) {
    const mid = { x: acc.stair.x, z: acc.stair.z - acc.stair.halfZ + 4 };
    const floor = mainAccessFloor(p, mid.x, mid.z);
    assert.ok(floor, `${acc.id} : la volée n’est pas du sol`);
  }
});

test('on entre par la volée qui donne sur SA zone payante', () => {
  // Un voyageur qui sort par le souterrain de Takeshita n'est pas descendu par
  // la volée du bâtiment de 2020, à l'autre bout du quai : les deux ensembles
  // ne communiquent pas.
  const p = wired(18);
  const bays = concourseBays(p.network);
  const stairOf = new Map(p.liveAccesses.map((a) => [a.toRoomId, a.stair]));
  let both = new Set<string>();
  for (let k = 0; k < 200; k++) {
    const route = routeToStreet(p)!;
    const tap = route.find((q) => q.tap !== undefined)!;
    const bay = bays[tap.tap!];
    const paid = p.network.gates.find((g) => g.id === bay.gateId)!.from;
    both.add(paid);
    // Le premier point du trajet est au pied de LA volée de cette zone-là.
    const stair = stairOf.get(paid)!;
    assert.ok(
      Math.abs(route[0].x - stair.x) < 1.2,
      `entré par la mauvaise volée pour ${paid}`,
    );
  }
  // Et les deux ensembles servent, sinon la moitié de la gare serait morte.
  assert.deepEqual([...both].sort(), ['paid-omote', 'paid-takeshita']);
});
