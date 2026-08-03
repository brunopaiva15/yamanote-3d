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
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { ASCENT_LEN, DESCENT_LEN, PLATFORM_TOP, STAIR_LOWER_Y } =
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

  // La descente est monotone, sans trou, sur toute la longueur praticable.
  let previous = PLATFORM_TOP;
  for (let t = 0.1; t <= 11.3; t += 0.1) {
    const y = floorAt(STATION, stair.x, top + t);
    assert.notEqual(y, null, `sol manquant à ${t.toFixed(1)} m du nez`);
    assert.ok(y! <= previous + 1e-9, `remontée à ${t.toFixed(1)} m`);
    // Aucune marche franche : le profil passe par le milieu des girons.
    assert.ok(previous - y! < 0.1, `décrochement de ${(previous - y!).toFixed(3)} m`);
    previous = y!;
  }
  // Au fond du couloir, on est au niveau du hall.
  assert.ok(Math.abs(previous - (PLATFORM_TOP + STAIR_LOWER_Y)) < 1e-6);
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
  const it = place(STATION).interior;

  // Zone payante et zone libre : de plain-pied, au niveau du couloir.
  const midPaid = (it.paid.z0 + it.paid.z1) / 2;
  const midFree = (it.free.z0 + it.free.z1) / 2;
  const midX = (it.paid.x0 + it.paid.x1) / 2;
  assert.equal(floorInHall(STATION, midX, midPaid), PLATFORM_TOP + it.floorY);
  assert.equal(floorInHall(STATION, midX, midFree), PLATFORM_TOP + it.floorY);

  // Au droit d'un passage, on passe ; au droit d'une borne, non.
  const gateZ = (it.gate.z0 + it.gate.z1) / 2;
  for (const passage of it.gate.passages) {
    assert.notEqual(floorInHall(STATION, passage.x, gateZ), null, `passage en x=${passage.x}`);
  }
  for (const cabinet of it.gate.cabinets) {
    const x = (cabinet.x0 + cabinet.x1) / 2;
    assert.equal(floorInHall(STATION, x, gateZ), null, `borne en x=${x}`);
  }
});

test('le hall se ferme : ni au-delà du fond, ni à travers les parois', () => {
  onPlatform();
  const it = place(STATION).interior;
  const midX = (it.paid.x0 + it.paid.x1) / 2;
  assert.equal(floorInHall(STATION, midX, it.free.z1 + 0.3), null, 'fond de la zone libre');
  assert.equal(floorInHall(STATION, it.paid.x0 - 0.3, it.paid.z0 + 2), null, 'paroi côté voie');
  assert.equal(floorInHall(STATION, it.paid.x1 + 0.3, it.paid.z0 + 2), null, 'paroi côté fond');
});

test('on marche du quai jusqu’à la zone libre sans buter sur rien', () => {
  onPlatform();
  const p = place(STATION);
  const it = p.interior;
  const flip = DOOR_SIDE[STATION];
  const stair = p.mainStair;

  // Départ : sur le quai, dans l'axe de la trémie, deux mètres avant son nez.
  const start = world(STATION, stair.x, stairTopZ(stair) - 2);
  const pos = new THREE.Vector3(start.x, 1.55, start.z);
  const step = CONFIG.walkSpeed * DT;

  // On vise le passage large : c'est celui du bout, et c'est celui qu'on prend
  // avec une valise. La marche est en deux temps - tout droit jusqu'au hall,
  // puis on se recale sur l'axe du passage avant de le franchir.
  const wide = it.gate.passages[it.gate.passages.length - 1];
  let reached = false;
  for (let i = 0; i < 4000 && !reached; i++) {
    const localZ = flip * pos.z;
    const localU = flip * pos.x;
    // Recalage latéral : seulement une fois dans le hall, où il y a la place.
    const wantU = localZ > it.paid.z0 + 1 ? wide.x : stair.x;
    const du = THREE.MathUtils.clamp(wantU - localU, -step, step);
    const dz = Math.sqrt(Math.max(0, step * step - du * du));
    resolveMove(pos, flip * du, flip * dz);
    runtime.stanceX = pos.x;
    runtime.stanceZ = pos.z;
    reached = flip * pos.z > it.free.z0 + 1;
  }

  assert.ok(reached, 'la zone libre n’a pas été atteinte');
  assert.equal(frameAt(pos.x, pos.z), 'platform');
  assert.ok(Math.abs(groundY(pos.x, pos.z) - (PLATFORM_TOP + it.floorY)) < 1e-6);
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
    const end = top + (rise === 'up' ? ASCENT_LEN : DESCENT_LEN) - 0.05;
    assert.notEqual(floorAt(index, stair.x, end), null, `${name} accès`);
    const room = p.network.rooms.find((r) => r.id === live?.toRoomId) ?? null;
    const z0 = room ? room.rect.z0 : p.interior.paid.z0;
    assert.notEqual(floorInHall(index, stair.x, z0 + 0.05), null, `${name} hall`);
    assert.ok(
      Math.abs(floorAt(index, stair.x, end)! - floorInHall(index, stair.x, z0 + 0.05)!) < 0.02,
      `${name} : décrochement au raccord`,
    );
  }
});
