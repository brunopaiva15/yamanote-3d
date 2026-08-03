// La foule du quai contourne le mobilier.
//
// Le quai est meublé - bancs, poteaux, batteries de tri, distributeurs, cages
// d'escalier - et la foule le traversait de part en part : on voyait des gens
// assis dans un banc jusqu'à la taille, des promeneurs sortir d'un poteau, une
// file d'attente dont la quatrième rangée passait dans un distributeur. Les
// emprises étaient pourtant publiées depuis toujours (systems/stationPlacement,
// `obstacles`) : ce sont exactement celles que la marche du joueur respecte.
//
// CE FICHIER FAIT MARCHER LA FOULE, il ne l'interroge pas. Une position de
// départ propre ne prouve rien - c'est en avançant qu'on entre dans un banc -
// et le fichier fait donc tourner la boucle réelle (`updatePlatformCrowd`) à
// soixante images par seconde pendant deux minutes de quai, sur des gares
// choisies pour leurs gabarits, en regardant à chaque image où sont les pieds
// de tout le monde.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  clearPlatformCrowd,
  crowdArrive,
  crowdDisperse,
  crowdList,
  seedPlatformCrowd,
  updatePlatformCrowd,
} = await import('../src/systems/platformCrowd.ts');
const { CLEAR_ROOM, mainAccessFloor, walkerBlocked } =
  await import('../src/systems/stationLevels.ts');
const { placementFor, stairwellAt } = await import('../src/systems/stationPlacement.ts');
const { CLEAR_DECK, STAIR_FULL_LEN, STAIR_FULL_STEPS } =
  await import('../src/data/stationGeometry.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { runtime } = await import('../src/systems/runtime.ts');
const { useStore } = await import('../src/store.ts');
const { DOOR_SIDE } = await import('../src/data/stations.ts');
const { STATIONS } = await import('../src/data/stations.ts');

const DT = 1 / 60;

/**
 * Les cinq gabarits qui comptent, plutôt que les trente.
 *
 * Tokyo : le quai le plus large et le hall le plus garni. Shinjuku : le plus
 * fréquenté, donc quatre rangées d'attente. Harajuku : le seul quai LATÉRAL de
 * la boucle, avec un vrai mur de fond. Mejiro : accès MONTANT, un ouvrage posé
 * sur la dalle et non un trou dedans - c'est le seul cas où l'emprise de
 * l'escalier barre pour de bon. Shibuya : SANS PORTES PALIÈRES, donc les
 * boutons d'arrêt d'urgence sur borne libre, plantés en pleine circulation à un
 * mètre du liseré - le seul mobilier que la marche rencontre de face.
 */
const CASES = [0, 16, 18, 13, 19];

function stage(index: number): void {
  useStore.setState({
    doorSide: DOOR_SIDE[index],
    index,
    platformIndex: index,
    started: true,
  });
  runtime.trainPresent = false;
  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  runtime.platformFade = 1;
  runtime.speed = 0;
  runtime.playerFrame = 'car';
  runtime.playerLevel = 'platform';
  // Le joueur est loin : ce test regarde la foule seule, pas l'esquive.
  runtime.playerPlatX = 0;
  runtime.playerPlatZ = 400;
  clearPlatformCrowd();
  seedPlatformCrowd(index);
}

/** Tout le monde est-il sur du sol, à cette image-ci ? */
function check(index: number, when: string): void {
  const place = placementFor(index, psdGates());
  const name = `${STATIONS[index].jy} ${STATIONS[index].romaji}`;
  for (const p of crowdList) {
    if (p.state === 'hidden') continue;
    assert.ok(
      !walkerBlocked(place, p.level, p.pos.x, p.pos.z),
      `${name} ${when} : ${p.id} (${p.state}, ${p.level}) dans le décor `
      + `en (${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)})`,
    );
  }
}

test('personne ne se pose dans un banc au moment où le quai se peuple', () => {
  for (const index of CASES) {
    stage(index);
    check(index, 'au peuplement');
  }
});

test('personne n’entre dans le mobilier en marchant', () => {
  for (const index of CASES) {
    stage(index);
    // Deux minutes de quai : de quoi laisser les promeneurs faire plusieurs
    // allers-retours sur toute la longueur, et les attenteurs se déplacer.
    for (let i = 0; i < 120 * 60; i++) {
      updatePlatformCrowd(DT);
      if (i % 30 === 0) check(index, `à ${(i * DT).toFixed(0)} s`);
    }
    check(index, 'à la fin');
  }
});

test('le flux d’arrivées et de départs reste sur du sol, hall compris', () => {
  for (const index of CASES) {
    stage(index);
    // Le train vient de partir : tout le monde gagne la sortie, et le quai se
    // repeuple par la rue et par les trémies. C'est le moment où le plus de
    // monde est en mouvement, et le seul où l'on traverse la gare entière.
    crowdDisperse();
    for (let i = 0; i < 180 * 60; i++) {
      if (i % 90 === 0) crowdArrive(index);
      updatePlatformCrowd(DT);
      if (i % 30 === 0) check(index, `à ${(i * DT).toFixed(0)} s du départ`);
    }
  }
});

/**
 * Distance d'un point à une emprise, en mètres. Zéro dedans.
 */
function gap(x: number, z: number, o: { x: number; z: number; halfX: number; halfZ: number }): number {
  return Math.hypot(
    Math.max(Math.abs(x - o.x) - o.halfX, 0),
    Math.max(Math.abs(z - o.z) - o.halfZ, 0),
  );
}

/** Une volée est du SOL : son emprise ne se contourne pas, elle se descend. */
function onStairs(place: ReturnType<typeof placementFor>, x: number, z: number): boolean {
  return !!stairwellAt(place, x, z, STAIR_FULL_LEN, STAIR_FULL_STEPS)
    || !!mainAccessFloor(place, x, z);
}

test('on ne longe pas le mobilier en le frottant', () => {
  // NE PAS TRAVERSER NE SUFFIT PAS. `CLEAR_DECK` est un gabarit d'épaule : posé
  // pile dessus, on ne viole aucune règle et l'on FRÔLE - le bras qui balance
  // et le sac à dos passent dans le caisson. Et l'on s'y posait
  // systématiquement, parce que les trajets visaient exactement cette
  // frontière-là : la bande de circulation était mesurée au gabarit, et le pas
  // de côté s'arrêtait à la première case libre venue.
  //
  // Ce test compte le TEMPS passé au contact. Avant, un quai sur trois le
  // passait à plus de vingt pour cent, Mejiro à quarante-cinq.
  const BERTH = CLEAR_DECK + CLEAR_ROOM;
  for (const index of CASES) {
    stage(index);
    const place = placementFor(index, psdGates());
    const name = `${STATIONS[index].jy} ${STATIONS[index].romaji}`;
    let seen = 0;
    let close = 0;
    for (let i = 0; i < 90 * 60; i++) {
      if (i % 90 === 0) crowdArrive(index);
      updatePlatformCrowd(DT);
      if (i % 5) continue;
      for (const p of crowdList) {
        if (p.state === 'hidden' || p.level !== 'platform') continue;
        if (onStairs(place, p.pos.x, p.pos.z)) continue;
        seen++;
        if (place.obstacles.some((o) => gap(p.pos.x, p.pos.z, o) < BERTH)) close++;
      }
    }
    const share = (100 * close) / Math.max(1, seen);
    assert.ok(
      share < 3,
      `${name} : ${share.toFixed(1)} % du temps au contact du mobilier (${close}/${seen})`,
    );
  }
});

test('personne ne s’installe contre une borne d’arrêt d’urgence', () => {
  // LE DÉFAUT SIGNALÉ, et le voici en clair : à Shibuya, un voyageur restait
  // planté l'épaule dans le caisson jaune pour tout l'arrêt. La borne est
  // plantée à un mètre du liseré ; la bande de circulation se rabattait sur
  // elle, il ne restait que vingt-quatre centimètres entre elle et le vide, et
  // c'est là que tout le monde passait et attendait.
  //
  // On ne demande pas de ne jamais l'approcher - on passe à côté d'un poteau,
  // c'est la vie d'un quai - mais de ne pas s'y INSTALLER : le contact se
  // compte en fractions de seconde, pas en minutes.
  const BERTH = CLEAR_DECK + CLEAR_ROOM;
  for (const index of [19, 16]) {
    stage(index);
    const place = placementFor(index, psdGates());
    const name = `${STATIONS[index].jy} ${STATIONS[index].romaji}`;
    const bornes = place.obstacles.filter((o) => o.halfX === 0.16 && o.halfZ === 0.16);
    assert.ok(bornes.length > 0, `${name} : pas de borne libre à éprouver`);
    const streak = new Map<string, number>();
    let worst = 0;
    for (let i = 0; i < 90 * 60; i++) {
      updatePlatformCrowd(DT);
      for (const p of crowdList) {
        if (p.state === 'hidden' || p.level !== 'platform') continue;
        for (let k = 0; k < bornes.length; k++) {
          const key = `${p.id}/${k}`;
          const near = gap(p.pos.x, p.pos.z, bornes[k]) < BERTH;
          const t = near ? (streak.get(key) ?? 0) + DT : 0;
          streak.set(key, t);
          worst = Math.max(worst, t);
        }
      }
    }
    assert.ok(worst < 2, `${name} : quelqu'un reste ${worst.toFixed(1)} s collé à une borne`);
  }
});

test('un joueur planté au milieu du hall se fait contourner, pas assiéger', () => {
  // C'est le défaut qui se voit LE PLUS, parce qu'on le provoque soi-même :
  // on descend, on s'arrête pour regarder les portillons, et la file entière
  // vient se masser contre son dos sans jamais le dépasser. La cause était un
  // glissement réduit à la composante latérale du pas - quasi nulle chez
  // quelqu'un qui marche droit vers son but - donc deux millimètres par
  // seconde de pas de côté.
  const index = 0;
  stage(index);
  const place = placementFor(index, psdGates());
  const it = place.interior;
  // DANS LE COULOIR BAS, au milieu, à un pas du débouché du hall : le seul
  // point par lequel tout le monde passe, et le plus étroit du parcours -
  // deux mètres vingt entre les joues. Il reste un demi-mètre de chaque côté,
  // donc on PEUT le contourner ; c'est tout l'objet du test.
  runtime.playerFrame = 'platform';
  runtime.playerLevel = 'concourse';
  runtime.playerPlatX = place.mainStair.x;
  runtime.playerPlatZ = it.paid.z0 - 1;
  // Ce qu'on compte : ceux qui étaient DANS LE HALL et qui en sont ressortis
  // par le haut. Compter qui se trouve au-delà de la ligne de portillons ne
  // dirait rien - tout le quai y est déjà.
  const inHall = new Set<number>();
  const crossed = new Set<number>();
  for (let i = 0; i < 240 * 60; i++) {
    if (i % (20 * 60) === 0) for (let k = 0; k < 8; k++) crowdArrive(index);
    updatePlatformCrowd(DT);
    if (i % 30) continue;
    for (const p of crowdList) {
      if (p.state === 'hidden') continue;
      if (p.level === 'concourse') inHall.add(p.id);
      else if (inHall.has(p.id) && p.pos.z < it.paid.z0) crossed.add(p.id);
    }
  }
  assert.ok(inHall.size >= 6, `seulement ${inHall.size} voyageurs sont passés par le hall`);
  assert.ok(
    crossed.size >= 4,
    `${crossed.size} voyageurs sur ${inHall.size} ont pu doubler le joueur`,
  );
});

test('les partants descendent vraiment dans la gare, et n’y restent pas', () => {
  // Tokyo : hall bâti, konbini, deux bouches de sortie. Ce que l'on vérifie
  // n'est pas qu'ils partent - c'était déjà le cas - mais qu'ils DESCENDENT
  // (niveau hall atteint), qu'ils en ressortent (le pool se libère), et que le
  // hall ne se remplit pas indéfiniment.
  const index = 0;
  stage(index);
  crowdDisperse();
  let sawConcourse = 0;
  let peak = 0;
  for (let i = 0; i < 240 * 60; i++) {
    updatePlatformCrowd(DT);
    let here = 0;
    for (const p of crowdList) {
      if (p.state === 'hidden') continue;
      if (p.level === 'concourse') here++;
    }
    sawConcourse = Math.max(sawConcourse, here);
    peak = Math.max(peak, here);
  }
  assert.ok(sawConcourse >= 3, `personne ne descend dans le hall (${sawConcourse})`);
  assert.ok(peak <= 12, `le hall déborde : ${peak} voyageurs`);
  // Quatre minutes plus tard, tout le monde est ressorti : un itinéraire qui
  // se bloquerait laisserait des voyageurs plantés pour toujours, et le pool
  // du quai s'épuiserait d'une gare à l'autre.
  const left = crowdList.filter((p) => p.state !== 'hidden' && p.inStation).length;
  assert.equal(left, 0, `${left} voyageurs coincés dans la gare`);
});
