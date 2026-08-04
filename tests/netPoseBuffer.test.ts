// Le tampon qui empêche les autres voyageurs de sauter.
//
// Huit poses par seconde, affichées telles quelles, donnent un avatar qui se
// téléporte huit fois par seconde. On garde donc les derniers échantillons et
// l'on affiche un instant PASSÉ, choisi assez en arrière pour qu'il y ait
// toujours deux positions réelles de part et d'autre.
//
// Trois pièges se cachent là-dedans, et les trois sont vérifiés ici :
//
//  · le désordre - les messages d'un canal temps réel n'arrivent pas forcément
//    dans l'ordre d'émission, et un échantillon en retard ajouté en queue ferait
//    reculer le temps du tampon, donc sauter l'avatar en arrière ;
//  · le passage par ±π - quelqu'un qui tourne la tête de +3,0 à -3,0 rad fait un
//    dixième de tour, pas un tour complet ;
//  · les champs discrets - « à moitié assis » n'existe pas.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  EXTRAPOLATE_MAX_MS,
  POSE_BUFFER_SIZE,
  POSE_DEAD_ZONE_M,
  POSE_KEEPALIVE_MS,
  POSE_STALE_MS,
  isStale,
  pushSample,
  sampleAt,
  shouldSendPose,
} = await import('../src/systems/net/poseBuffer.ts');

type Sample = Parameters<typeof pushSample>[1];

function s(t: number, over: Partial<Sample> = {}): Sample {
  return {
    t,
    x: 0,
    y: 1.55,
    z: 0,
    yaw: 0,
    pitch: 0,
    frame: 0,
    level: 0,
    station: 0,
    seated: false,
    moving: false,
    ...over,
  };
}

// --- Interpolation --------------------------------------------------------

test('entre deux échantillons, la position est un mélange exact', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0, { x: 0 }));
  pushSample(buf, s(125, { x: 1 }));
  pushSample(buf, s(250, { x: 2 }));

  const milieu = sampleAt(buf, 62.5);
  assert.ok(milieu);
  assert.ok(Math.abs(milieu.x - 0.5) < 1e-9, `x = ${milieu.x}`);

  const troisQuarts = sampleAt(buf, 187.5);
  assert.ok(troisQuarts);
  assert.ok(Math.abs(troisQuarts.x - 1.5) < 1e-9, `x = ${troisQuarts.x}`);
});

test('avant le premier échantillon, on rend le premier tel quel', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(100, { x: 7 }));
  pushSample(buf, s(200, { x: 8 }));
  const avant = sampleAt(buf, 0);
  assert.ok(avant);
  assert.equal(avant.x, 7);
});

test('un tampon vide ne sait rien, et le dit', () => {
  assert.equal(sampleAt([], 42), null);
});

// --- Extrapolation --------------------------------------------------------

test('juste après le dernier échantillon, on prolonge le mouvement', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0, { x: 0 }));
  pushSample(buf, s(100, { x: 1 }));
  const apres = sampleAt(buf, 150);
  assert.ok(apres);
  assert.ok(Math.abs(apres.x - 1.5) < 1e-9, `x = ${apres.x}`);
});

test('l’extrapolation est plafonnée : un avatar perdu s’arrête, il ne file pas', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0, { x: 0 }));
  pushSample(buf, s(100, { x: 1 }));
  // Une seconde entière après le dernier message : sans plafond, l'avatar
  // serait dix mètres plus loin, à travers la cloison du wagon.
  const loin = sampleAt(buf, 1_100);
  assert.ok(loin);
  const maxAttendu = 1 + EXTRAPOLATE_MAX_MS / 100;
  assert.ok(loin.x <= maxAttendu + 1e-9, `x = ${loin.x}, plafond ${maxAttendu}`);
});

test('avec un seul échantillon, on ne prolonge rien', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0, { x: 3 }));
  const apres = sampleAt(buf, 5_000);
  assert.ok(apres);
  assert.equal(apres.x, 3);
});

// --- Le lacet -------------------------------------------------------------

test('un lacet qui franchit ±π prend le chemin court', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0, { yaw: 3.0 }));
  pushSample(buf, s(100, { yaw: -3.0 }));
  const milieu = sampleAt(buf, 50);
  assert.ok(milieu);
  // Le chemin court fait 0,283 rad et passe par ±π ; le chemin long en fait 6,0
  // et ferait tourner le personnage sur lui-même. À mi-parcours, on doit être
  // au-delà de |3,0|, pas revenu vers zéro.
  assert.ok(
    Math.abs(milieu.yaw) > 3.0,
    `à mi-chemin le lacet vaut ${milieu.yaw} : il est passé par le mauvais côté`,
  );
});

test('un lacet ordinaire s’interpole normalement', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0, { yaw: 0 }));
  pushSample(buf, s(100, { yaw: 1 }));
  const milieu = sampleAt(buf, 50);
  assert.ok(milieu);
  assert.ok(Math.abs(milieu.yaw - 0.5) < 1e-9, `yaw = ${milieu.yaw}`);
});

// --- Les champs discrets --------------------------------------------------

test('« assis » bascule net, il ne se fond pas', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0, { seated: false }));
  pushSample(buf, s(100, { seated: true }));
  assert.equal(sampleAt(buf, 1)?.seated, false);
  assert.equal(sampleAt(buf, 99)?.seated, false);
  assert.equal(sampleAt(buf, 100)?.seated, true);
});

test('le repère et l’étage basculent net eux aussi', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0, { frame: 0, level: 0, station: 3 }));
  pushSample(buf, s(100, { frame: 1, level: 1, station: 4 }));
  const avant = sampleAt(buf, 50);
  assert.ok(avant);
  // Un repère à moitié wagon et à moitié quai n'existe pas, et une gare à
  // 3,5 encore moins.
  assert.equal(avant.frame, 0);
  assert.equal(avant.level, 0);
  assert.equal(avant.station, 3);
});

// --- L'anneau -------------------------------------------------------------

test('un échantillon en retard s’insère à son rang, il ne casse pas l’ordre', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(0));
  pushSample(buf, s(200));
  pushSample(buf, s(100)); // arrivé après, mais daté d'avant
  assert.deepEqual(
    buf.map((x) => x.t),
    [0, 100, 200],
  );
});

test('un doublon exact est ignoré', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(100, { x: 1 }));
  pushSample(buf, s(100, { x: 99 }));
  assert.equal(buf.length, 1);
  assert.equal(buf[0].x, 1);
});

test('l’anneau évince les plus vieux et reste trié', () => {
  const buf: Sample[] = [];
  for (let i = 0; i < POSE_BUFFER_SIZE * 3; i++) pushSample(buf, s(i * 125));
  assert.equal(buf.length, POSE_BUFFER_SIZE);
  for (let i = 1; i < buf.length; i++) {
    assert.ok(buf[i].t > buf[i - 1].t, 'le tampon n’est plus trié');
  }
});

// --- Péremption -----------------------------------------------------------

test('un pair muet finit par être déclaré perdu', () => {
  const buf: Sample[] = [];
  pushSample(buf, s(1_000));
  assert.equal(isStale(buf, 1_000 + POSE_STALE_MS - 1), false);
  assert.equal(isStale(buf, 1_000 + POSE_STALE_MS + 1), true);
});

test('un tampon vide est périmé d’office', () => {
  assert.equal(isStale([], 0), true);
});

test('la péremption laisse passer DEUX trames de vie', () => {
  // L'invariant qui manquait, et le défaut qu'il empêche : les deux constantes
  // valaient toutes les deux une seconde. Un voyageur assis - qui n'émet que sa
  // trame de vie - voyait donc son dernier échantillon périmer juste avant que
  // le suivant n'arrive, une fois par seconde, indéfiniment. Son avatar
  // clignotait chez les autres, et sur une liaison lente il disparaissait pour
  // de bon à chaque cycle.
  //
  // Un seuil de disparition doit toujours laisser manquer deux rendez-vous.
  assert.ok(
    POSE_STALE_MS >= 2 * POSE_KEEPALIVE_MS,
    `péremption (${POSE_STALE_MS} ms) trop proche de la trame de vie (${POSE_KEEPALIVE_MS} ms)`,
  );
});

test('un voyageur assis ne clignote pas, même sur une liaison lente', () => {
  // Le scénario complet, tel qu'il se joue : émission à la trame de vie, plus
  // la quantification d'envoi (125 ms), plus un transit de 400 ms. Aucun de ces
  // instants ne doit être déclaré périmé.
  const buf: Sample[] = [];
  const PERIODE = POSE_KEEPALIVE_MS + 125;
  const TRANSIT = 400;
  for (let envoi = 0; envoi < 10; envoi++) {
    const t = envoi * PERIODE;
    pushSample(buf, s(t));
    // De l'arrivée de cette pose à celle de la suivante, il ne se passe rien.
    for (let now = t + TRANSIT; now < t + PERIODE + TRANSIT; now += 50) {
      assert.equal(isStale(buf, now), false, `périmé à ${now} ms après le dernier envoi`);
    }
  }
});

// --- La bande morte à l'émission ------------------------------------------

test('la première pose part toujours', () => {
  assert.equal(shouldSendPose(null, s(0), 0), true);
});

test('un joueur parfaitement immobile ne parle qu’une fois par seconde', () => {
  // C'est le garde-fou de quota : un salon de huit personnes assises pendant
  // une demi-heure doit coûter huit messages par seconde, pas soixante-quatre.
  const pose = s(0);
  assert.equal(shouldSendPose(pose, s(0), POSE_KEEPALIVE_MS - 1), false);
  assert.equal(shouldSendPose(pose, s(0), POSE_KEEPALIVE_MS), true);
});

test('un déplacement sous le seuil ne réveille pas l’émission', () => {
  const pose = s(0);
  const infime = s(0, { x: POSE_DEAD_ZONE_M / 2 });
  assert.equal(shouldSendPose(pose, infime, 10), false);
});

test('un déplacement au-dessus du seuil part aussitôt', () => {
  const pose = s(0);
  assert.equal(shouldSendPose(pose, s(0, { x: POSE_DEAD_ZONE_M * 2 }), 10), true);
});

test('un changement discret part aussitôt, si petit soit le mouvement', () => {
  // S'asseoir sans bouger d'un centimètre reste un événement : sans ça, on
  // resterait debout chez les autres jusqu'à la trame de vie suivante.
  const pose = s(0);
  assert.equal(shouldSendPose(pose, s(0, { seated: true }), 10), true);
  assert.equal(shouldSendPose(pose, s(0, { frame: 1 }), 10), true);
  assert.equal(shouldSendPose(pose, s(0, { level: 1 }), 10), true);
  assert.equal(shouldSendPose(pose, s(0, { station: 1 }), 10), true);
  assert.equal(shouldSendPose(pose, s(0, { moving: true }), 10), true);
});

test('une marche lente finit par être émise, malgré la bande morte', () => {
  // Le piège classique : si la bande morte se mesurait par rapport à l'image
  // précédente et non par rapport à la dernière pose ÉMISE, un déplacement
  // toujours sous le seuil ne partirait jamais - et l'avatar traverserait le
  // wagon sans que personne ne le voie bouger.
  let derniereEmise = s(0);
  let x = 0;
  let emissions = 0;
  for (let i = 1; i <= 200; i++) {
    x += POSE_DEAD_ZONE_M / 10; // dix fois plus lent que le seuil
    const candidate = s(i * 16, { x });
    if (shouldSendPose(derniereEmise, candidate, i * 16)) {
      derniereEmise = candidate;
      emissions++;
    }
  }
  assert.ok(emissions > 5, `seulement ${emissions} émissions sur deux mètres parcourus`);
});
