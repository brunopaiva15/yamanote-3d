// Aller dans la gare, à pied (systems/walkable + data/stationInterior).
//
// Le volume praticable s'arrêtait cinq marches sous le quai, sur rien du tout :
// le couloir bas, le hall et les portillons étaient dessinés et interdits. Ce
// fichier vérifie que le chemin est CONTINU - depuis le liseré du quai jusqu'à
// la zone libre, en franchissant un portillon - et qu'il ne l'est pas là où il
// ne doit pas l'être : pas à travers une borne, pas au-delà du fond du hall,
// pas dans un couloir borgne.
//
// Le pas est celui du jeu (CONFIG.walkSpeed à 60 images par seconde) et le
// déplacement passe par `resolveMove`, comme dans three/Player : une limite qui
// ne se voit qu'en marchant ne se verrait pas en interrogeant des points.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { frameAt, groundY, resolveMove } = await import('../src/systems/walkable.ts');
const { runtime } = await import('../src/systems/runtime.ts');
const { useStore } = await import('../src/store.ts');
const { CONFIG } = await import('../src/data/config.ts');
const { DOOR_SIDE } = await import('../src/data/stations.ts');
const { placementFor, stairTopZ } = await import('../src/systems/stationPlacement.ts');
const { concourseBays } = await import('../src/data/stationConcourseBuild.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { ASCENT_LEN, PLATFORM_TOP, STAIR_LOWER_Y, descentLenTo } =
  await import('../src/data/stationGeometry.ts');
const { STATION_COUNT } = await import('../src/data/loop.ts');

const DT = 1 / 60;
/** Tokyo : hall sous les voies, et le quai le plus large de la boucle. */
const STATION = 0;

/** Pose la scène : le joueur est sur le quai, la rame est partie. */
function onPlatform(index = STATION): void {
  useStore.setState({
    doorSide: DOOR_SIDE[index],
    index,
    platformIndex: index,
    started: true,
  });
  runtime.trainPresent = false;
  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  runtime.doorOpen = 0;
  runtime.psdOpen = 0;
  runtime.speed = 0;
  runtime.playerFrame = 'platform';
  runtime.swayTime = 0;
}

/** Repère quai -> monde. Le quai se retourne avec le côté d'ouverture. */
function world(index: number, u: number, z: number): { x: number; z: number } {
  const flip = DOOR_SIDE[index];
  return { x: flip * u, z: flip * z };
}

function place(index: number) {
  return placementFor(index, psdGates());
}

/** Sol sous un point donné en repère QUAI, ou null s'il n'est pas praticable. */
function floorAt(index: number, u: number, z: number): number | null {
  const w = world(index, u, z);
  return frameAt(w.x, w.z) === null ? null : groundY(w.x, w.z);
}

/**
 * Interroge le sol depuis le NIVEAU BAS.
 *
 * À l'aplomb du hall il y a aussi la dalle du quai : sans dire d'où l'on
 * regarde, la question n'a pas de réponse - et la marche répond « le quai »,
 * ce qui est juste tant qu'on n'est pas descendu. Descendre est l'affaire du
 * dernier test ; ceux-ci posent l'étage et vérifient la pièce.
 */
function floorInHall(index: number, u: number, z: number): number | null {
  runtime.playerLevel = 'concourse';
  const y = floorAt(index, u, z);
  runtime.playerLevel = 'platform';
  return y;
}

test('la volée principale se descend en entier, jusqu’au couloir bas', () => {
  onPlatform();
  const p = place(STATION);
  const stair = p.mainStair;
  const top = stairTopZ(stair);

  // Au nez de la trémie : encore le sol du quai.
  assert.equal(floorAt(STATION, stair.x, top + 0.05), PLATFORM_TOP);

  // La descente est monotone, sans trou, sur toute la longueur praticable —
  // et cette longueur DÉPEND de ce que la volée dessert : cinq gares
  // descendent sous les voies, à −6,40 m, avec vingt-deux marches au lieu de
  // six (`data/stationGeometry.lowerFlightTo`).
  const live = p.liveAccesses.find((a) => a.stair === stair && a.rise === 'down');
  const floorY = live?.floorY ?? STAIR_LOWER_Y;
  const len = descentLenTo(floorY);
  let previous = PLATFORM_TOP;
  for (let t = 0.1; t <= len - 0.1; t += 0.1) {
    const y = floorAt(STATION, stair.x, top + t);
    assert.notEqual(y, null, `sol manquant à ${t.toFixed(1)} m du nez`);
    assert.ok(y! <= previous + 1e-9, `remontée à ${t.toFixed(1)} m`);
    // Aucune marche franche : le profil passe par le milieu des girons.
    assert.ok(previous - y! < 0.1, `décrochement de ${(previous - y!).toFixed(3)} m`);
    previous = y!;
  }
  // Au fond du couloir, on est au niveau du hall.
  assert.ok(
    Math.abs(previous - (PLATFORM_TOP + floorY)) < 1e-6,
    `la volée s'arrête à ${(previous - PLATFORM_TOP).toFixed(3)} au lieu de ${floorY}`,
  );
});

test('les autres trémies restent borgnes : on s’arrête cinq marches plus bas', () => {
  onPlatform();
  const p = place(STATION);
  const other = p.stairs.find((s) => s !== p.mainStair);
  assert.ok(other, 'la gare a bien une seconde trémie');
  const top = stairTopZ(other!);
  assert.notEqual(floorAt(STATION, other!.x, top + 1.5), null);
  assert.equal(floorAt(STATION, other!.x, top + 3), null);
});

test('le hall se parcourt, et la ligne de portillons ne se contourne pas', () => {
  onPlatform();
  // LE HALL SE LIT SUR LE RÉSEAU : Tokyo passe par son relevé, et son hall
  // n'est ni à la place ni à l'altitude de celui que `interior` décrit.
  const net = place(STATION).network;
  const paid = net.rooms.find((r) => r.walkable && r.fare === 'paid')!;
  const free = net.rooms.find((r) => r.walkable && r.fare === 'free')!;
  const line = net.gates.find((g) => g.walkable)!;

  // Zone payante et zone libre : chacune au niveau de SA pièce.
  const at = (r: typeof paid) => floorInHall(
    STATION,
    (r.rect.x0 + r.rect.x1) / 2,
    (r.rect.z0 + r.rect.z1) / 2,
  );
  assert.equal(at(paid), PLATFORM_TOP + paid.floorY);
  assert.equal(at(free), PLATFORM_TOP + free.floorY);

  // Au droit d'un passage, on passe ; au droit d'une borne, non.
  const mid = (r: { x0: number; x1: number; z0: number; z1: number }) => ({
    x: (r.x0 + r.x1) / 2,
    z: (r.z0 + r.z1) / 2,
  });
  for (const b of concourseBays(net).filter((x) => x.gateId === line.id)) {
    assert.notEqual(floorInHall(STATION, b.x, b.z), null, `passage en ${b.index}`);
  }
  for (const cabinet of line.cabinets) {
    const c = mid(cabinet);
    assert.equal(floorInHall(STATION, c.x, c.z), null, `borne en x=${c.x.toFixed(2)}`);
  }
});

test('le hall se ferme : ni au-delà du fond, ni à travers les parois', () => {
  onPlatform();
  const net = place(STATION).network;
  const paid = net.rooms.find((r) => r.walkable && r.fare === 'paid')!;
  const free = net.rooms.find((r) => r.walkable && r.fare === 'free')!;
  const midX = (paid.rect.x0 + paid.rect.x1) / 2;
  assert.equal(floorInHall(STATION, midX, free.rect.z1 + 0.3), null, 'fond de la zone libre');
  assert.equal(
    floorInHall(STATION, paid.rect.x0 - 0.3, paid.rect.z0 + 2),
    null,
    'paroi côté voie',
  );
  assert.equal(
    floorInHall(STATION, paid.rect.x1 + 0.3, paid.rect.z0 + 2),
    null,
    'paroi côté fond',
  );
});

test('on marche du quai jusqu’à la zone libre sans buter sur rien', () => {
  onPlatform();
  const p = place(STATION);
  // LE HALL VIENT DU RÉSEAU, et l'on ne sait plus d'avance dans quel sens il se
  // traverse : Tokyo passe par son relevé, sa zone libre est à l'OUEST de la
  // zone payante et son contrôle se franchit selon x. Le trajet se compose
  // donc de trois visées — le pied de la volée, la baie, puis le point qui la
  // suit de deux mètres — et non plus d'un « tout droit » suivi d'un recalage.
  const net = p.network;
  const flip = DOOR_SIDE[STATION];
  const live = p.liveAccesses[0];
  const stair = live?.stair ?? p.mainStair;
  const paid = net.rooms.find((r) => r.walkable && r.fare === 'paid')!;
  const bay = concourseBays(net)[0];
  const line = net.gates.find((g) => g.id === bay.gateId)!;
  const [g0, g1] = bay.cross === 'z'
    ? [line.rect.z0, line.rect.z1]
    : [line.rect.x0, line.rect.x1];
  const [p0, p1] = bay.cross === 'z'
    ? [paid.rect.z0, paid.rect.z1]
    : [paid.rect.x0, paid.rect.x1];
  const beyond = (p0 + p1) / 2 < (g0 + g1) / 2 ? g1 + 2 : g0 - 2;

  // Les trois visées, en repère QUAI.
  const aims = [
    { u: stair.x, z: paid.rect.z0 + 1.2 },
    { u: bay.cross === 'z' ? bay.x : g0 - 1.2, z: bay.cross === 'z' ? g0 - 1.2 : bay.z },
    { u: bay.cross === 'z' ? bay.x : beyond, z: bay.cross === 'z' ? beyond : bay.z },
  ];

  const start = world(STATION, stair.x, stairTopZ(stair) - 2);
  const pos = new THREE.Vector3(start.x, 1.55, start.z);
  const step = CONFIG.walkSpeed * DT;
  let aim = 0;
  for (let i = 0; i < 6000 && aim < aims.length; i++) {
    const target = aims[aim];
    const du = THREE.MathUtils.clamp(target.u - flip * pos.x, -step, step);
    const dz = THREE.MathUtils.clamp(target.z - flip * pos.z, -step, step);
    resolveMove(pos, flip * du, flip * dz);
    runtime.stanceX = pos.x;
    runtime.stanceZ = pos.z;
    if (Math.hypot(target.u - flip * pos.x, target.z - flip * pos.z) < 0.25) aim++;
  }

  assert.equal(aim, aims.length, 'le trajet n’est pas allé au bout');
  assert.equal(frameAt(pos.x, pos.z), 'platform');
  // On est arrivé DANS une pièce du réseau, et c'est son sol qu'on a sous les
  // pieds — la zone libre, de l'autre côté du contrôle.
  const localX = flip * pos.x;
  const localZ = flip * pos.z;
  const here = net.rooms.find((r) => r.walkable
    && localX >= r.rect.x0 && localX <= r.rect.x1
    && localZ >= r.rect.z0 && localZ <= r.rect.z1);
  assert.ok(here, 'arrivée hors de toute pièce du réseau');
  assert.equal(here.fare, 'free', `arrivée en zone ${here.fare}`);
  assert.ok(
    Math.abs(groundY(pos.x, pos.z) - (PLATFORM_TOP + here.floorY)) < 1e-6,
    `sol à ${(groundY(pos.x, pos.z) - PLATFORM_TOP).toFixed(3)} dans ${here.id}`,
  );
});

test('toute gare dont le hall est construit s’atteint depuis sa trémie', () => {
  // Le raccord couloir / hall est calculé par data/stationInterior à partir de
  // la trémie que systems/stationPlacement a choisie. Les deux se lisent d'un
  // fichier à l'autre : une gare dont le hall commencerait un mètre trop loin
  // laisserait un trou dans le sol, et le joueur y resterait planté.
  for (let index = 0; index < STATION_COUNT; index++) {
    onPlatform(index);
    const p = place(index);
    if (!p.interior.built) continue;
    // La trémie qui dessert, et le sens dans lequel elle va : `mainRise` est le
    // sens du hall GÉNÉRIQUE, et une gare branchée peut monter là où il
    // descendait (Ōsaki : passerelle au-dessus des voies).
    const live = p.liveAccesses[0];
    const stair = live?.stair ?? p.mainStair;
    const rise = live?.rise ?? p.mainRise;
    const top = stairTopZ(stair);
    const name = `gare ${index} (${rise === 'up' ? 'montante' : 'descendante'})`;
    // Le dernier centimètre de l'accès, et le premier de CE QUE LA TRÉMIE
    // DESSERT. Ce n'était que `interior.paid` tant que toutes les gares
    // partageaient un hall générique ; une gare branchée sur son relevé peut
    // déboucher sur une mezzanine, et c'est le RÉSEAU qui sait où.
    const end = top + (rise === 'up' ? ASCENT_LEN : descentLenTo(live?.floorY ?? STAIR_LOWER_Y)) - 0.05;
    assert.notEqual(floorAt(index, stair.x, end), null, `${name} accès`);
    // LE RACCORD SE MESURE À L'ARRIVÉE, pas au bord de la pièce : une pièce du
    // relevé peut commencer AVANT la fin de la volée — elle enveloppe alors le
    // débouché, ce qui est mieux et non moins bien. Ce qui doit tenir, c'est
    // qu'au dernier centimètre de la volée on soit sur le sol qu'elle dessert.
    const room = p.network.rooms.find((r) => r.id === live?.toRoomId) ?? null;
    const want = room ? room.floorY : p.interior.floorY;
    assert.ok(
      Math.abs(floorAt(index, stair.x, end)! - (PLATFORM_TOP + want)) < 0.02,
      `${name} : la volée aboutit à ${(floorAt(index, stair.x, end)! - PLATFORM_TOP).toFixed(3)}`
        + ` au lieu de ${want.toFixed(3)}`,
    );
  }
});
