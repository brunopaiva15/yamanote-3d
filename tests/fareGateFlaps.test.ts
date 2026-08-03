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
const { psdGates } = await import('../src/three/station/psdLayout.ts');
const { runtime } = await import('../src/systems/runtime.ts');
const { useStore } = await import('../src/store.ts');

/** Le joueur est sur le quai : rien de ce qui suit ne se cale sur lui. */
runtime.playerLevel = 'platform';

/**
 * La gare est CHOISIE, et non héritée de l'état par défaut.
 *
 * `CONFIG.startIndex` est tiré au sort au chargement du module
 * (`Math.random()`) : la gare que le magasin porte au démarrage change à chaque
 * exécution. Ce test s'en contentait, et il tombait donc une fois sur trente -
 * exactement les fois où le tirage donnait Nippori, la seule gare dont le hall
 * attend encore son traitement propre (`bespoke`, voir data/stationInterior) et
 * dont l'intérieur n'est donc pas bâti. Un échec sur trente exécutions n'est pas
 * un test qui trouve quelque chose : c'est un test qu'on finit par relancer sans
 * lire, et c'est ainsi qu'on rate le vrai.
 *
 * Ce qui est éprouvé ici, ce sont les BATTANTS. La gare n'est qu'un décor, et
 * elle est donc posée : Tokyo, qui a une ligne de portillons générique comme
 * vingt-neuf gares sur trente.
 */
const STATION = 0;
useStore.setState({ index: STATION, platformIndex: STATION });

const PLACE = placementFor(STATION, psdGates());
const GATE = PLACE.interior.gate;
const LANE = GATE.passages[0];

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
  return () => paxNearGate(LANE.x, GATE.z0 - dz, granted);
}

const flap = () => gateStates()[0].flap;

test('la gare choisie a bien une ligne de portillons à éprouver', () => {
  // Le garde-fou reste : si Tokyo passait un jour en hall sur mesure, ou perdait
  // sa ligne de portillons, tout ce qui suit n'éprouverait plus rien - et le
  // dirait ici plutôt qu'en sept assertions illisibles.
  assert.ok(PLACE.interior.built, 'JY01 sans intérieur bâti');
  assert.ok(GATE.passages.length > 0, 'ligne sans passage');
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
  run(20, () => paxNearGate(LANE.x, (GATE.z0 + GATE.z1) / 2, true));
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
    paxNearGate(LANE.x, (GATE.z0 + GATE.z1) / 2, false);
    paxNearGate(LANE.x, GATE.z0 - 1.4, false);
  });
  assert.equal(flap(), 1, 'les battants se sont rabattus sur quelqu’un dans la baie');
});
