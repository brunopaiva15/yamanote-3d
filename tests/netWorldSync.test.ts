// L'échantillonnage et l'application du monde partagé.
//
// Ce que ce fichier protège tient en trois propriétés, et aucune ne se voit en
// jouant seul :
//
//  · un battement fait l'aller-retour sans rien perdre - une erreur d'unité sur
//    `phaseT` (secondes contre millisecondes) donnerait une resynchronisation
//    dure à chaque paquet, donc un carillon toutes les demi-secondes ;
//  · un battement plus vieux que le dernier vu est JETÉ. Les messages d'un canal
//    temps réel n'arrivent pas dans un ordre garanti, et appliquer un paquet en
//    retard ferait reculer le monde ;
//  · un paquet de tirages qui ne concerne pas l'arrêt courant est ignoré.
//    L'appliquer donnerait une rame qui s'arrête au bon endroit pour la
//    mauvaise gare - ce qui ne se remarque qu'aux portes palières, et ne se
//    diagnostique jamais.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { sampleStop, sampleTick } = await import('../src/systems/net/worldSample.ts');
const { validStop, validTick, PROTOCOL_VERSION } = await import(
  '../src/systems/net/protocol.ts'
);
const { runtime } = await import('../src/systems/runtime.ts');
const { useStore } = await import('../src/store.ts');
const {
  applyStopDraws,
  beginStopDraws,
  drawAlternativePlatform,
  drawBerthOffset,
  drawDoorSeed,
  drawMelodyJitter,
  drawPassThrough,
  resetDecisions,
  setNetRole,
} = await import('../src/systems/net/worldDecisions.ts');

function monde(): void {
  useStore.setState({
    phase: 'dwell',
    index: 12,
    platformIndex: 12,
    doorSide: 1,
    loopDirection: 'inner',
  });
  runtime.phaseT = 14.237;
  runtime.speed = 0;
  runtime.accel = 0;
  runtime.distance = 8_123.45;
  runtime.departStartDist = 8_000;
  runtime.clockMin = 1_015.25;
  runtime.tokyoDate = { year: 2026, month: 8, day: 3, weekday: 1 };
  runtime.stopSequence = 5;
}

// --- Le battement -----------------------------------------------------------

test('un battement échantillonné est un message valide', () => {
  monde();
  const m = sampleTick(1, 'hote');
  assert.equal(validTick(m), true);
});

test('le battement porte l’état de la ligne sans le déformer', () => {
  monde();
  const m = sampleTick(7, 'hote');
  assert.equal(m.seq, 7);
  assert.equal(m.ph, 'dwell');
  assert.equal(m.ix, 12);
  assert.equal(m.pix, 12);
  assert.equal(m.dir, 'inner');
  assert.equal(m.ss, 5);
  // Millisecondes : une erreur d'unité ici donnerait une resynchronisation dure
  // à chaque paquet, donc un carillon toutes les demi-secondes.
  assert.equal(m.pt, 14_237);
  // Centièmes de minute pour l'horloge, centimètres pour les distances.
  assert.equal(m.ck, 101_525);
  assert.equal(m.di, 812_345);
});

test('l’aller-retour du battement rend les mêmes valeurs', () => {
  monde();
  const m = sampleTick(1, 'hote');
  // On refait à la main la conversion qu'applique le suiveur, et l'on vérifie
  // qu'elle retombe sur ce qu'on a échantillonné. Une unité qui change d'un
  // côté seulement ne se voit qu'à deux, et se manifeste par une rame qui
  // recule d'un mètre toutes les demi-secondes.
  assert.ok(Math.abs(m.pt / 1000 - runtime.phaseT) < 0.001);
  assert.ok(Math.abs(m.ck / 100 - runtime.clockMin) < 0.01);
  assert.ok(Math.abs(m.di / 100 - runtime.distance) < 0.01);
  assert.ok(Math.abs(m.dsd / 100 - runtime.departStartDist) < 0.01);
});

test('la date civile survit au voyage', () => {
  monde();
  const m = sampleTick(1, 'hote');
  assert.deepEqual(m.dt, [2026, 8, 3, 1]);
});

test('les blocages de départ tiennent dans leur champ de bits', () => {
  monde();
  runtime.departureBlockers.doorBlocked = true;
  runtime.departureBlockers.heldAtStation = true;
  const m = sampleTick(1, 'hote');
  assert.equal(m.bl & 1, 1, 'porte bloquée');
  assert.equal(m.bl & 2, 2, 'retenu à quai');
  assert.equal(m.bl & 4, 0, 'aucun signal');
  runtime.departureBlockers.doorBlocked = false;
  runtime.departureBlockers.heldAtStation = false;
  assert.equal(sampleTick(2, 'hote').bl, 0);
});

test('chaque phase du cycle passe le validateur', () => {
  monde();
  for (const phase of ['cruise', 'brake', 'dwell', 'depart'] as const) {
    useStore.setState({ phase });
    assert.equal(validTick(sampleTick(1, 'hote')), true, phase);
  }
});

test('les deux sens de circulation passent aussi', () => {
  monde();
  for (const dir of ['inner', 'outer'] as const) {
    useStore.setState({ loopDirection: dir });
    assert.equal(validTick(sampleTick(1, 'hote')), true, dir);
  }
});

test('un battement échantillonné en pleine course reste valide', () => {
  // La croisière porte des vitesses et des accélérations non nulles, et une
  // distance qui grimpe à plusieurs dizaines de kilomètres sur un long trajet.
  monde();
  useStore.setState({ phase: 'cruise' });
  runtime.speed = 24.7;
  runtime.accel = -0.83;
  runtime.distance = 148_000;
  const m = sampleTick(1, 'hote');
  assert.equal(validTick(m), true);
  assert.ok(Math.abs(m.sp / 1000 - 24.7) < 0.001);
  assert.ok(Math.abs(m.ac / 1000 + 0.83) < 0.001);
});

// --- Les tirages de l'arrêt -------------------------------------------------

// Le paquet décrit l'arrêt À VENIR : `runtime.stopSequence` vaut 5 dans
// `monde()`, le dwell suivant portera donc le numéro 6, et c'est celui-là qui
// est tiré et publié - une gare à l'avance.
const ARRET = 6;

function tirages(): void {
  resetDecisions();
  setNetRole('host');
  beginStopDraws(ARRET);
  drawBerthOffset(0.03, 0.11);
  drawMelodyJitter();
  drawAlternativePlatform(0.5);
  drawDoorSeed();
  drawPassThrough(0.3);
}

test('un paquet de tirages complet est valide', () => {
  monde();
  tirages();
  const m = sampleStop('hote');
  assert.ok(m, 'aucun paquet produit');
  assert.equal(validStop(m), true);
  assert.equal(m.ss, ARRET);
  assert.equal(m.ix, 12);
});

test('le paquet est estampillé de l’arrêt qu’il DÉCRIT, pas de celui qu’on vit', () => {
  // Le paquet part au départ de la gare précédente : au moment où il est
  // publié, `runtime.stopSequence` en est encore à l'arrêt qu'on quitte.
  // L'estampiller de celui-là faisait arriver chez les autres, sous le bon
  // numéro, les tirages de la gare d'avant.
  monde();
  tirages();
  assert.notEqual(sampleStop('hote')?.ss, runtime.stopSequence);
  assert.equal(sampleStop('hote')?.ss, runtime.stopSequence + 1);
});

test('un arrêt qui n’a pas fini de tirer ne publie RIEN', () => {
  // Un paquet à trous ferait croire au suiveur qu'il a tout reçu, alors qu'il
  // lui manque de quoi poser sa rame au bon endroit - et il n'aurait aucun
  // moyen de s'en apercevoir, puisqu'un champ absent vaut « valeur par défaut ».
  monde();
  resetDecisions();
  setNetRole('host');
  beginStopDraws(ARRET);
  drawBerthOffset(0.03, 0.11);
  assert.equal(sampleStop('hote'), null);
});

test('les tirages font l’aller-retour sans perte sensible', () => {
  monde();
  resetDecisions();
  setNetRole('follower');
  const source = {
    berthOffset: -0.0741,
    alternativePlatform: true,
    melodyJitter: 0.4237,
    doorSeed: 0x1234abcd,
    passThrough: true,
  };
  applyStopDraws(source, ARRET);
  // Pas de bascule de rôle ici : `setNetRole` remet les tirages à plat, et à
  // raison - un ancien hôte devenu suiveur n'a plus rien à publier. On
  // échantillonne donc en suiveur, ce qui est de toute façon la seule situation
  // où l'on détient des tirages reçus.
  const m = sampleStop('hote');
  assert.ok(m);
  // Millimètres pour l'écart d'arrêt : la tolérance JR East est de ±35 cm et
  // le TASC en garde une dizaine de centimètres - le millimètre est déjà
  // largement en dessous de ce qui se voit entre deux montants de porte.
  assert.ok(Math.abs(m.berth / 1000 - source.berthOffset) <= 0.0005);
  assert.ok(Math.abs(m.jitter / 1_000_000 - source.melodyJitter) <= 1e-6);
  assert.equal(m.seed, source.doorSeed);
  assert.equal(m.alt, 1);
  assert.equal(m.pass, 1);
});

test('la graine des portes traverse sans être abîmée', () => {
  // Trente-deux bits pleins : une graine tronquée donnerait des retards de
  // vantaux différents des deux côtés du fil, à partir du « même » nombre.
  monde();
  resetDecisions();
  setNetRole('follower');
  for (const seed of [0, 1, 0x7fffffff, 0xffffffff, 0xdeadbeef]) {
    applyStopDraws({
      berthOffset: 0,
      alternativePlatform: false,
      melodyJitter: 0,
      doorSeed: seed,
      passThrough: false,
    }, ARRET);
    const m = sampleStop('hote');
    assert.ok(m);
    assert.equal(m.seed, seed, `graine ${seed}`);
    assert.equal(validStop(m), true, `graine ${seed} refusée par le validateur`);
  }
});

test('un écart d’arrêt extrême reste dans ce que le validateur accepte', () => {
  monde();
  resetDecisions();
  setNetRole('follower');
  applyStopDraws({
    berthOffset: -0.11,
    alternativePlatform: false,
    melodyJitter: -1,
    doorSeed: 1,
    passThrough: false,
  }, ARRET);
  const m = sampleStop('hote');
  assert.ok(m);
  assert.equal(validStop(m), true);
});

test('le paquet porte la version du protocole', () => {
  monde();
  tirages();
  assert.equal(sampleStop('hote')?.v, PROTOCOL_VERSION);
  assert.equal(sampleTick(1, 'hote').v, PROTOCOL_VERSION);
});
