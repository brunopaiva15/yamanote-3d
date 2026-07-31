// Le seuil de porte (src/systems/walkable.ts).
//
// Une seule règle, et elle tient tout : on ne franchit une porte que si elle
// est ouverte. Le reste du jeu en dépend - descendre sur le quai renverse le
// référentiel (systems/platformWait), gèle `runtime.distance` et arrête la
// rame. Franchi au mauvais moment, le seuil ne fait pas une petite erreur de
// position : il arrête un train en pleine voie.
//
// Ce qui est reproduit ici, c'est la fin de frame de `three/Player` : l'ŒIL
// (`playerX`) porte le balancement de la caisse, les PIEDS (`stanceX`) non.
// Deux centimètres d'écart, et pendant longtemps ils ont suffi - collé au fond
// de l'alcôve pendant que la rame entrait en gare, on passait à travers une
// porte fermée, un pas après l'autre.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

// Les modules du volume praticable importent leurs voisins sans extension
// (c'est Vite qui les résout dans le jeu) : voir fixtures/ts-resolve.
register('./fixtures/ts-resolve.mjs', import.meta.url);

const { frameAt, playerDoorwayZ, resolveMove } = await import('../src/systems/walkable.ts');
const { runtime } = await import('../src/systems/runtime.ts');
const { useStore } = await import('../src/store.ts');
const { CONFIG, V_MAX } = await import('../src/data/config.ts');
const { DOOR_SIDE } = await import('../src/data/stations.ts');

/**
 * Une gare dont le quai est du côté +x.
 *
 * Tout ce fichier marche vers les x croissants pour sortir du wagon, ce qui
 * n'a de sens que si le quai est de ce côté-là. C'était écrit `index: 0` -
 * Tokyo -, donc vrai par coïncidence : le relevé de janvier 2026 a fait passer
 * Tokyo à gauche, et les deux tests de franchissement se sont mis à marcher
 * vers la voie d'en face. Le seuil de porte ne dépend pas de la gare choisie ;
 * on prend donc la première qui ouvre du bon côté, et le sens de marche cesse
 * d'être une hypothèse tacite.
 */
const SIDE_PLUS = DOOR_SIDE.indexOf(1);

const DT = 1 / 60;
/** Axe d'une baie de porte, en repère wagon. */
const DOOR_Z = CONFIG.doorCenters[2];

interface Scene {
  /** Vitesse de la rame (m/s). */
  speed: number;
  /** Ouverture des portes, rame et quai (0..1). */
  open: number;
  /** Y a-t-il une rame en face ? */
  present?: boolean;
}

function scene({ speed, open, present = true }: Scene): void {
  useStore.setState({
    doorSide: 1,
    index: SIDE_PLUS,
    platformIndex: SIDE_PLUS,
    started: true,
  });
  runtime.trainPresent = present;
  runtime.trainZ = 0;
  runtime.platformSlide = 0;
  runtime.doorOpen = open;
  runtime.psdOpen = open;
  runtime.psdPresent = true;
  runtime.speed = speed;
  runtime.playerFrame = 'car';
  runtime.swayTime = 0;
}

/**
 * Une frame de marche, publication comprise. Le balancement de caisse est celui
 * de `systems/stationCycle` et son report sur la caméra celui de `three/Player`
 * - c'est le couple exact que le bug exploitait.
 */
function step(pos: THREE.Vector3, dx: number): 'car' | 'platform' | null {
  resolveMove(pos, dx, 0);
  runtime.swayTime += DT;
  const s01 = runtime.speed / V_MAX;
  const sway =
    (Math.sin(runtime.swayTime * 0.8) + 0.5 * Math.sin(runtime.swayTime * 1.73)) * 0.55 * s01;
  runtime.playerX = pos.x + sway * 0.028; // l'œil : il balance
  runtime.playerY = 1.55;
  runtime.playerZ = pos.z;
  runtime.stanceX = pos.x; // les pieds : ils ne balancent pas
  runtime.stanceZ = pos.z;
  return frameAt(pos.x, pos.z);
}

/** Marche vers le quai (dx > 0) ou vers l'allée (dx < 0) et rend le repère atteint. */
function walk(pos: THREE.Vector3, dx: number, frames: number): 'car' | 'platform' | null {
  let frame: 'car' | 'platform' | null = null;
  for (let i = 0; i < frames; i++) {
    frame = step(pos, dx);
    if (dx > 0 && frame === 'platform') break;
    if (dx < 0 && pos.x < 1) break;
  }
  return frame;
}

function atDoor(x = 0): THREE.Vector3 {
  return new THREE.Vector3(x, 1.55, DOOR_Z);
}

test('une porte fermée ne se franchit pas, même à pleine vitesse', () => {
  // Le jeu qui reste entre le dernier pas et la paroi de l'alcôve change avec
  // la position de départ, et c'est lui que le roulis venait combler : on
  // balaie donc le départ, et les phases du balancement avec.
  for (const speed of [V_MAX, V_MAX * 0.8, V_MAX * 0.6]) {
    for (let k = 0; k < 20; k++) {
      scene({ speed, open: 0 });
      runtime.swayTime = k * 0.37;
      const pos = atDoor(k * 0.001);
      const frame = walk(pos, CONFIG.walkSpeed * DT, 900);
      assert.equal(
        frame,
        'car',
        `sorti par une porte fermée à ${speed.toFixed(1)} m/s (départ ${k * 0.001} m)`,
      );
      assert.equal(runtime.playerFrame, 'car');
    }
  }
});

test('sans rame en face, le seuil reste fermé portes grandes ouvertes', () => {
  scene({ speed: 0, open: 1, present: false });
  assert.equal(walk(atDoor(), CONFIG.walkSpeed * DT, 300), 'car');
});

test('à quai portes ouvertes, on descend', () => {
  scene({ speed: 0, open: 1 });
  assert.equal(walk(atDoor(), CONFIG.walkSpeed * DT, 300), 'platform');
});

test('la porte qui se referme sur le joueur ne l’emmure pas', () => {
  // Il entre dans l'encadrement pendant que les portes sont ouvertes, puis
  // elles se referment sur lui : il est l'obstacle (systems/doorObstruction) et
  // il lui reste les deux côtés.
  for (const dx of [CONFIG.walkSpeed * DT, -CONFIG.walkSpeed * DT]) {
    scene({ speed: 0, open: 1 });
    const pos = atDoor();
    for (let i = 0; i < 60; i++) step(pos, CONFIG.walkSpeed * DT);
    assert.equal(playerDoorwayZ(), DOOR_Z, 'il devrait être dans l’encadrement');
    runtime.doorOpen = 0;
    runtime.psdOpen = 0;
    assert.equal(playerDoorwayZ(), DOOR_Z, 'refermée sur lui, elle le reconnaît encore');
    assert.equal(walk(pos, dx, 300), dx > 0 ? 'platform' : 'car');
  }
});

test('adossé au fond de l’alcôve, on n’est pas dans l’encadrement', () => {
  // C'est la moitié « lecture » du bug : l'œil dépassait la paroi de l'alcôve
  // sous l'effet du roulis, et le joueur devenait un obstacle pour une porte
  // dans laquelle il n'avait pas mis les pieds.
  scene({ speed: V_MAX, open: 0 });
  const pos = atDoor();
  for (let i = 0; i < 200; i++) {
    step(pos, CONFIG.walkSpeed * DT);
    assert.equal(playerDoorwayZ(), null);
  }
});
