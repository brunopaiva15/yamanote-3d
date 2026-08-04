// Les gens partagés : la rame et le quai, vus pareil par tout le monde.
//
// Tout le reste du multijoueur transporte des TIRAGES et laisse chaque client
// dérouler la même chronologie (systems/net/worldDecisions). Les voyageurs, eux,
// ne sont pas une chronologie mais une simulation à état : deux clients partis
// de deux rames différemment peuplées ne convergeraient jamais, quand bien même
// ils tireraient les mêmes nombres. Il faut donc bien, une fois par arrêt, se
// mettre d'accord sur QUI est là - et c'est la seule chose que ces deux listes
// transportent.
//
// Ce que ce fichier protège :
//
//  · un aller-retour ne perd ni un visage ni un siège ;
//  · appliquer deux fois la même population ne bouge personne (sans quoi la
//    rame se réarrangerait à chaque message, deux fois par arrêt) ;
//  · deux places du pool ne se retrouvent jamais sur le même siège - le bogue
//    classique d'une redistribution en un seul passage, où le premier réassigné
//    écrase la réservation d'un voisin pas encore libéré ;
//  · une petite machine voit MOINS de monde, mais LES MÊMES gens aux mêmes
//    places, jamais une foule différente.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { applyPaxPopulation, paxList, samplePaxPopulation, seedPassengers } = await import(
  '../src/systems/passengers.ts'
);
const { applyCrowdPopulation, clearPlatformCrowd, crowdList, sampleCrowdPopulation, seedPlatformCrowd } =
  await import('../src/systems/platformCrowd.ts');
const { validPop, PROTOCOL_VERSION } = await import('../src/systems/net/protocol.ts');
const { useStore } = await import('../src/store.ts');
const { DOOR_SIDE } = await import('../src/data/stations.ts');

function gare(index: number): void {
  useStore.setState({ index, platformIndex: index, doorSide: DOOR_SIDE[index] });
}

/** Ce qu'on regarde d'une rame : qui est là, et où. */
function tableau(): string[] {
  return paxList.map((p) => `${p.identity}@${p.state}:${p.seatSlot}/${p.standSlot}`);
}

// --- La rame ----------------------------------------------------------------

test('l’aller-retour d’une rame ne perd ni un visage ni un siège', () => {
  gare(11);
  seedPassengers();
  const avant = tableau();
  const paquet = samplePaxPopulation();

  // On casse tout, comme le ferait un autre client parti d'une autre rame.
  seedPassengers();
  for (const p of paxList) p.identity = p.id + 5000;

  applyPaxPopulation(paquet);
  assert.deepEqual(tableau(), avant);
});

test('appliquer deux fois de suite ne bouge personne', () => {
  // Le message part deux fois par arrêt. S'il réarrangeait la rame à chaque
  // passage, le wagon clignoterait à chaque gare - ce qui serait pire que la
  // désynchronisation qu'il vient corriger.
  gare(4);
  seedPassengers();
  const paquet = samplePaxPopulation();
  applyPaxPopulation(paquet);
  const une = tableau();
  applyPaxPopulation(paquet);
  assert.deepEqual(tableau(), une);
  assert.deepEqual(samplePaxPopulation(), paquet);
});

test('deux voyageurs ne se retrouvent jamais sur le même siège', () => {
  // Le piège d'une redistribution en un seul passage : on assoit quelqu'un sur
  // une place qu'un voisin pas encore libéré réserve encore, et le voisin
  // l'efface en partant. Deux corps sur un coussin, ou un siège vide déclaré
  // occupé pour le reste de la partie.
  gare(20);
  seedPassengers();
  const paquet = samplePaxPopulation();
  // On INVERSE l'ordre des places : chacun hérite de la position d'un autre,
  // ce qui garantit que tout le monde doit bouger en même temps.
  const melange: number[] = [];
  for (let i = 0; i < paxList.length; i++) {
    const j = paxList.length - 1 - i;
    melange.push(paquet[j * 2], paquet[j * 2 + 1]);
  }
  applyPaxPopulation(melange);

  const sieges = new Map<number, number>();
  const debouts = new Map<number, number>();
  for (const p of paxList) {
    if (p.state === 'seated') {
      assert.equal(sieges.has(p.seatSlot), false, `siège ${p.seatSlot} occupé deux fois`);
      sieges.set(p.seatSlot, p.id);
    }
    if (p.state === 'standing') {
      assert.equal(debouts.has(p.standSlot), false, `place ${p.standSlot} occupée deux fois`);
      debouts.set(p.standSlot, p.id);
    }
  }
  assert.deepEqual(samplePaxPopulation(), melange, 'la rame ne dit pas ce qu’on lui a demandé');
});

test('une rame vide se transmet aussi', () => {
  gare(7);
  seedPassengers();
  const vide = paxList.flatMap((p) => [p.identity, -1]);
  applyPaxPopulation(vide);
  assert.equal(paxList.every((p) => p.state === 'hidden'), true);
});

// --- Le quai ----------------------------------------------------------------

test('l’aller-retour d’un quai garde les mêmes visages aux mêmes places', () => {
  gare(13);
  clearPlatformCrowd();
  seedPlatformCrowd(13);
  const paquet = sampleCrowdPopulation();
  const avant = crowdList.map((p) => `${p.identity}@${p.state}:${p.pos.x.toFixed(3)},${p.pos.z.toFixed(3)}`);

  // Un autre client : d'autres visages sur les mêmes places du pool.
  for (const p of crowdList) if (!p.staff) p.identity = p.id + 9000;
  applyCrowdPopulation(13, paquet);

  assert.deepEqual(
    crowdList.map((p) => `${p.identity}@${p.state}:${p.pos.x.toFixed(3)},${p.pos.z.toFixed(3)}`),
    avant,
  );
});

test('un effectif plus grand que le nôtre est ramené au nôtre', () => {
  // Le seul endroit où l'on s'écarte sciemment du « tout le monde voit la même
  // chose », et c'est pour que tout le monde puisse jouer : un téléphone dans
  // un salon mené depuis un ordinateur de bureau voit les mêmes gens, aux mêmes
  // places, simplement moins loin dans la file.
  gare(13);
  clearPlatformCrowd();
  seedPlatformCrowd(13);
  const mien = sampleCrowdPopulation();
  const enorme = [...mien];
  enorme[0] = 999;
  enorme[1] = 999;
  applyCrowdPopulation(13, enorme);
  const apres = sampleCrowdPopulation();
  assert.equal(apres[0], mien[0], 'on a accepté un effectif qu’on ne sait pas dessiner');
  assert.equal(apres[1], mien[1]);
});

test('une foule vide ou tronquée ne casse rien', () => {
  gare(13);
  clearPlatformCrowd();
  seedPlatformCrowd(13);
  const avant = crowdList.map((p) => p.identity);
  applyCrowdPopulation(13, []);
  applyCrowdPopulation(13, [5]);
  assert.deepEqual(crowdList.map((p) => p.identity), avant);
});

// --- Le fil ------------------------------------------------------------------

test('le message de population passe le validateur, et les faux sont rejetés', () => {
  gare(2);
  seedPassengers();
  clearPlatformCrowd();
  seedPlatformCrowd(2);
  const m = {
    v: PROTOCOL_VERSION,
    from: 'hote',
    st: 2,
    px: samplePaxPopulation(),
    cr: sampleCrowdPopulation(),
  };
  assert.equal(validPop(m), true);

  // Ce qui ne doit JAMAIS atteindre le rendu : un identifiant qui n'est pas un
  // nombre entier fini ne se dérive pas en apparence, et une liste à rallonge
  // n'est pas une rame.
  assert.equal(validPop({ ...m, px: [1, NaN] }), false);
  assert.equal(validPop({ ...m, px: [1, 1.5] }), false);
  assert.equal(validPop({ ...m, cr: ['a'] }), false);
  assert.equal(validPop({ ...m, px: new Array(4000).fill(0) }), false);
  assert.equal(validPop({ ...m, st: 30 }), false);
  assert.equal(validPop({ ...m, px: 'plein' }), false);
  assert.equal(validPop({ ...m, v: PROTOCOL_VERSION + 1 }), false);
});
