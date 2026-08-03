// Les battants, et sur QUI ils se ferment.
//
// Un portillon japonais est ouvert au repos et ne se rabat que devant celui
// qui n'a rien présenté. Cette règle-là valait pour le joueur seul : la foule
// traversait une baie qui ne bougeait pas, et l'on voyait vingt personnes
// enfiler un 改札 dont les vantaux n'avaient jamais claqué de la journée.
//
// CE QUI SE VÉRIFIE ICI est l'ENCHAÎNEMENT, parce que c'est lui qui fait le
// portillon : les battants se ferment devant celui qui arrive, il pose sa
// carte, ils s'écartent, il passe. Dans cet ordre. Un pas de la simulation
// (`updateFareGates`) sépare chaque étape de la suivante, comme dans le jeu.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { gateStates, paxNearGate, paxTapGate, resetFareGates, updateFareGates } =
  await import('../src/systems/fareGate.ts');
const { placementFor } = await import('../src/systems/stationPlacement.ts');
const { concourseBays } = await import('../src/data/stationConcourseBuild.ts');
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { runtime } = await import('../src/systems/runtime.ts');
const { useStore } = await import('../src/store.ts');

/** Le joueur est sur le quai : rien de ce qui suit ne se cale sur lui. */
runtime.playerLevel = 'platform';

/**
 * LA GARE EST ÉPINGLÉE, et il faut qu'elle le soit.
 *
 * `CONFIG.startIndex` est un tirage - `Math.floor(Math.random() * 30)` - et
 * `systems/fareGate` lit `store.platformIndex` à chaque appel. Ce fichier
 * partait donc d'une gare différente à chaque exécution, et tombait sur
 * Nippori une fois sur trente : c'est la seule de la boucle dont le niveau est
 * déclaré sans être bâti (`interior.built === false`), donc la seule où la
 * ligne de portillons n'existe pas. Les sept tests s'effondraient alors d'un
 * coup, sur un message qui parlait de JY01.
 *
 * Ce message disait d'ailleurs l'intention : le test est écrit pour Tokyo. On
 * la lui donne, au lieu de la lui souhaiter.
 */
const STATION = 0;
useStore.setState({ index: STATION, platformIndex: STATION });

const PLACE = placementFor(STATION, psdGates());
/**
 * LA BAIE SE LIT SUR LE RÉSEAU, comme partout ailleurs depuis la phase 20.
 * Tokyo passe par son relevé : son contrôle central n'est plus celui du hall
 * générique, ni à la même place, et `interior.gate` ne décrit plus rien de ce
 * qu'on éprouve ici.
 */
const BAY = concourseBays(PLACE.network)[0];
const GATE_LINE = PLACE.network.gates.find((g) => g.id === BAY.gateId)!;
const PAID = PLACE.network.rooms.find((r) => r.id === GATE_LINE.from)!;
/** Les deux bords de la ligne, sur l'axe qu'on la franchit, et le côté payant. */
const [G0, G1] = BAY.cross === 'z'
  ? [BAY.rect.z0, BAY.rect.z1]
  : [BAY.rect.x0, BAY.rect.x1];
const [P0, P1] = BAY.cross === 'z'
  ? [PAID.rect.z0, PAID.rect.z1]
  : [PAID.rect.x0, PAID.rect.x1];
/** +1 si la zone payante est du côté des cotes basses. */
const SIDE = (P0 + P1) / 2 < (G0 + G1) / 2 ? 1 : -1;
/** Un point à `d` mètres du bord payant de la ligne, dans la file de la baie. */
const at = (d: number) => (BAY.cross === 'z'
  ? { x: BAY.x, z: SIDE > 0 ? G0 - d : G1 + d }
  : { x: SIDE > 0 ? G0 - d : G1 + d, z: BAY.z });

/** Un pas de simulation, au pas de physique du jeu. */
const STEP = 1 / 60;

/** Fait tourner la boucle `n` pas, en redéclarant `who` à chaque pas. */
function run(n: number, who?: () => void): void {
  for (let i = 0; i < n; i++) {
    who?.();
    updateFareGates(STEP);
  }
}

/** Un voyageur planté à `dz` de la ligne, côté payant. */
function standing(dz: number, granted = false) {
  const q = at(dz);
  return () => paxNearGate(q.x, q.z, granted);
}

const flap = () => gateStates()[0].flap;

test('la gare de départ a bien une ligne de portillons à éprouver', () => {
  assert.ok(PLACE.network.built, 'JY01 sans intérieur bâti');
  assert.ok(concourseBays(PLACE.network).length > 0, 'ligne sans passage');
});

test('au repos, la baie est ouverte', () => {
  resetFareGates();
  run(30);
  assert.equal(flap(), 1);
});

test('les battants se ferment sur le voyageur qui n’a pas encore bipé', () => {
  resetFareGates();
  run(30);
  // Il arrive à un pas et demi de la ligne : c'est là que le mécanisme claque.
  run(20, standing(1.4));
  assert.equal(flap(), 0, 'la baie est restée ouverte devant un voyageur sans titre');
});

test('son coup de carte les rouvre, et il passe', () => {
  resetFareGates();
  run(30);
  run(20, standing(1.4));
  assert.equal(flap(), 0);
  // Il pose sa carte à l'arrêt, DEVANT la ligne : c'est ce que fait son
  // itinéraire (systems/concourseRoute), et c'est ce qui rouvre.
  paxTapGate(0, 99);
  run(20, standing(0.75, true));
  assert.equal(flap(), 1, 'la baie ne s’est pas rouverte après le ピッ');
  // Puis il traverse : entre les bornes, on ne se fait jamais pincer.
  const mid = at(-(G1 - G0) / 2);
  run(20, () => paxNearGate(mid.x, mid.z, true));
  assert.equal(flap(), 1);
});

test('elle se referme derrière lui, sur le suivant qui n’a pas bipé', () => {
  resetFareGates();
  run(30);
  paxTapGate(0, 99);
  // Celui qui vient de valider s'éloigne côté libre, hors de portée de la
  // cellule ; celui qui le suit se présente sans rien avoir présenté.
  run(20, standing(1.5));
  assert.equal(flap(), 0, 'le suivant s’est engouffré sur la validation du premier');
});

test('la baie se rouvre toute seule quand il n’y a plus personne devant', () => {
  resetFareGates();
  run(30);
  run(20, standing(1.4));
  assert.equal(flap(), 0);
  // Il renonce et s'écarte : plus rien à couper, plus de raison de rester
  // fermé. Un portillon au repos est ouvert.
  run(30);
  assert.equal(flap(), 1);
});

test('on ne ferme pas sur quelqu’un qui est déjà entre les bornes', () => {
  resetFareGates();
  run(30);
  // Un dans le passage, un autre qui arrive derrière sans avoir bipé : les
  // vantaux attendent d'être libres.
  run(25, () => {
    const inside = at(-(G1 - G0) / 2);
    const behind = at(1.4);
    paxNearGate(inside.x, inside.z, false);
    paxNearGate(behind.x, behind.z, false);
  });
  assert.equal(flap(), 1, 'les battants se sont rabattus sur quelqu’un dans la baie');
});
