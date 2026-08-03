// Ce que le fil a le droit de transporter, et ce qu'il doit refuser.
//
// Deux choses se jouent ici, et une seule saute aux yeux.
//
// La première est l'aller-retour : une pose quantifiée en centimètres puis
// relue doit rendre la même position à un demi-centimètre près. C'est du calcul,
// ça se vérifie en trois lignes, et ça ne casse jamais.
//
// La seconde est la RÉCEPTION, et c'est celle qui compte. Le rendu des avatars
// lit ces nombres sans les regarder : un `NaN` qui passe la porte devient une
// position `NaN`, donc une matrice de transformation `NaN`, donc une géométrie
// que three.js élimine silencieusement - et l'avatar disparaît sans que rien
// n'apparaisse dans la console. On ne trouve pas ce défaut-là en jouant. On le
// prévient ici.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  PROTOCOL_VERSION,
  decodePose,
  encodePose,
  validChat,
  validEvent,
  validPose,
  validPresence,
  validStop,
  validTick,
} = await import('../src/systems/net/protocol.ts');

type Pose = Parameters<typeof encodePose>[1];

function pose(over: Partial<Pose> = {}): Pose {
  return {
    t: 1_234,
    frame: 0,
    level: 0,
    station: 7,
    x: 0.42,
    y: 1.55,
    z: -3.17,
    yaw: 1.23,
    pitch: -0.4,
    seated: false,
    moving: true,
    ...over,
  };
}

test('une pose fait l’aller-retour au demi-centimètre près', () => {
  const before = pose();
  const after = decodePose(encodePose('moi', before));
  for (const k of ['x', 'y', 'z'] as const) {
    assert.ok(
      Math.abs(after[k] - before[k]) <= 0.005,
      `${k} : ${after[k]} contre ${before[k]}`,
    );
  }
  for (const k of ['yaw', 'pitch'] as const) {
    assert.ok(Math.abs(after[k] - before[k]) <= 0.005, `${k}`);
  }
  assert.equal(after.seated, before.seated);
  assert.equal(after.moving, before.moving);
  assert.equal(after.frame, before.frame);
  assert.equal(after.level, before.level);
  assert.equal(after.station, before.station);
});

test('les booléens survivent dans les deux sens', () => {
  const assis = decodePose(encodePose('moi', pose({ seated: true, moving: false })));
  assert.equal(assis.seated, true);
  assert.equal(assis.moving, false);
});

test('une pose bien formée est acceptée', () => {
  assert.equal(validPose(encodePose('moi', pose())), true);
});

test('une version de protocole étrangère est rejetée', () => {
  const m = encodePose('moi', pose());
  assert.equal(validPose({ ...m, v: PROTOCOL_VERSION + 1 }), false);
  assert.equal(validPose({ ...m, v: PROTOCOL_VERSION - 1 }), false);
});

test('un émetteur anonyme est rejeté', () => {
  const m = encodePose('moi', pose());
  assert.equal(validPose({ ...m, from: '' }), false);
  assert.equal(validPose({ ...m, from: undefined }), false);
});

// Le cœur du fichier : rien de ce qui suit ne doit atteindre le rendu.
test('NaN, Infini et flottants sont rejetés sur chaque champ numérique', () => {
  const m = encodePose('moi', pose());
  for (const k of ['t', 'st', 'x', 'y', 'z', 'yw', 'pt'] as const) {
    assert.equal(validPose({ ...m, [k]: NaN }), false, `${k} = NaN`);
    assert.equal(validPose({ ...m, [k]: Infinity }), false, `${k} = Infini`);
    assert.equal(validPose({ ...m, [k]: 1.5 }), false, `${k} = flottant`);
    assert.equal(validPose({ ...m, [k]: '3' }), false, `${k} = chaîne`);
  }
});

test('une gare hors de la boucle est rejetée', () => {
  const m = encodePose('moi', pose());
  assert.equal(validPose({ ...m, st: -1 }), false);
  assert.equal(validPose({ ...m, st: 30 }), false);
  assert.equal(validPose({ ...m, st: 29 }), true);
  assert.equal(validPose({ ...m, st: 0 }), true);
});

test('une position à quatre cents mètres du quai est rejetée', () => {
  const m = encodePose('moi', pose());
  assert.equal(validPose({ ...m, x: 40_001 }), false);
  assert.equal(validPose({ ...m, z: -40_001 }), false);
  // Le quai fait deux cent vingt-quatre mètres : le bout reste accepté.
  assert.equal(validPose({ ...m, z: 11_200 }), true);
});

test('les drapeaux n’acceptent que zéro ou un', () => {
  const m = encodePose('moi', pose());
  for (const k of ['f', 'lv', 's', 'mv'] as const) {
    assert.equal(validPose({ ...m, [k]: 2 }), false, k);
    assert.equal(validPose({ ...m, [k]: true }), false, k);
  }
});

test('un objet vide, null et une chaîne ne sont pas des messages', () => {
  for (const junk of [null, undefined, {}, 'coucou', 42, []]) {
    assert.equal(validPose(junk), false);
    assert.equal(validTick(junk), false);
    assert.equal(validStop(junk), false);
    assert.equal(validEvent(junk), false);
    assert.equal(validChat(junk), false);
    assert.equal(validPresence(junk), false);
  }
});

// --- Battement ------------------------------------------------------------

function tick(over: Record<string, unknown> = {}) {
  return {
    v: PROTOCOL_VERSION,
    from: 'hote',
    seq: 12,
    ph: 'dwell',
    pt: 4_200,
    ix: 3,
    pix: 3,
    ds: 1,
    dir: 'inner',
    sp: 0,
    ac: 0,
    di: 812_000,
    dsd: 0,
    ck: 101_500,
    dt: [2026, 8, 3, 1],
    ss: 5,
    bl: 0,
    ...over,
  };
}

test('un battement bien formé est accepté', () => {
  assert.equal(validTick(tick()), true);
});

test('une phase inconnue est rejetée', () => {
  assert.equal(validTick(tick({ ph: 'coasting' })), false);
  assert.equal(validTick(tick({ ph: 'cruise' })), true);
  assert.equal(validTick(tick({ ph: 'depart' })), true);
});

test('un sens de circulation inconnu est rejeté', () => {
  assert.equal(validTick(tick({ dir: 'sideways' })), false);
  assert.equal(validTick(tick({ dir: 'outer' })), true);
});

test('un côté de porte qui n’est ni +1 ni -1 est rejeté', () => {
  assert.equal(validTick(tick({ ds: 0 })), false);
  assert.equal(validTick(tick({ ds: -1 })), true);
});

test('une date incomplète est rejetée', () => {
  assert.equal(validTick(tick({ dt: [2026, 8, 3] })), false);
  assert.equal(validTick(tick({ dt: 'demain' })), false);
  assert.equal(validTick(tick({ dt: [2026, 8, 3, NaN] })), false);
});

// --- Tirages d'un arrêt ---------------------------------------------------

function stop(over: Record<string, unknown> = {}) {
  return {
    v: PROTOCOL_VERSION,
    from: 'hote',
    ss: 5,
    ix: 12,
    seed: 987_654,
    berth: -74,
    jitter: 420_000,
    alt: 0,
    pass: 1,
    ...over,
  };
}

test('un paquet de tirages bien formé est accepté', () => {
  assert.equal(validStop(stop()), true);
});

test('un décalage de mélodie hors de [-1, 1] est rejeté', () => {
  // C'est un TIRAGE, pas une durée : hors de ses bornes, il décalerait
  // l'instant de la 発車メロディ de plusieurs secondes, donc allongerait ou
  // raccourcirait l'arrêt d'autant, donc désaccorderait les portes.
  assert.equal(validStop(stop({ jitter: 1_000_001 })), false);
  assert.equal(validStop(stop({ jitter: -1_000_001 })), false);
  assert.equal(validStop(stop({ jitter: 1_000_000 })), true);
  assert.equal(validStop(stop({ jitter: 0 })), true);
});

test('un écart d’arrêt négatif reste valide : la rame déborde des deux côtés', () => {
  assert.equal(validStop(stop({ berth: -110 })), true);
  assert.equal(validStop(stop({ berth: 110 })), true);
});

test('un écart d’arrêt délirant est rejeté', () => {
  // Onze centimètres est le maximum physique ; un mètre n'est plus un écart
  // d'arrêt, c'est une rame garée ailleurs.
  assert.equal(validStop(stop({ berth: 1_001 })), false);
  assert.equal(validStop(stop({ berth: -1_001 })), false);
});

// --- Événements -----------------------------------------------------------

test('chaque nature d’événement exige ses propres champs', () => {
  const base = { v: PROTOCOL_VERSION, from: 'hote' };
  assert.equal(validEvent({ ...base, k: 'hello' }), true);
  assert.equal(validEvent({ ...base, k: 'detach' }), true);
  assert.equal(validEvent({ ...base, k: 'emergency', hold: 90, reason: 2 }), true);
  assert.equal(validEvent({ ...base, k: 'emergency', hold: 90 }), false);
  assert.equal(validEvent({ ...base, k: 'outage', hold: 40, coast: 6 }), true);
  assert.equal(validEvent({ ...base, k: 'blockers', bits: 3 }), true);
  assert.equal(validEvent({ ...base, k: 'blockers' }), false);
  assert.equal(validEvent({ ...base, k: 'disruption', seed: '5:12:inner', force: false }), true);
  assert.equal(validEvent({ ...base, k: 'disruption', seed: 5, force: false }), false);
  assert.equal(validEvent({ ...base, k: 'derailment' }), false);
});

// --- Tchat et présence ----------------------------------------------------

test('un message de tchat très long reste valide : c’est le nettoyage qui coupe', () => {
  // Rejeter ici ferait taire quelqu'un qui a simplement trop écrit ; le
  // nettoyage (chatLimiter) tronque et laisse passer, ce qui est plus aimable.
  const long = { v: PROTOCOL_VERSION, from: 'moi', id: 1, text: 'a'.repeat(5_000), t: 9 };
  assert.equal(validChat(long), true);
});

test('un message de tchat sans texte est rejeté', () => {
  assert.equal(validChat({ v: PROTOCOL_VERSION, from: 'moi', id: 1, t: 9 }), false);
  assert.equal(validChat({ v: PROTOCOL_VERSION, from: 'moi', id: 1, text: 42, t: 9 }), false);
});

test('une présence bien formée est acceptée, une version de jeu inconnue non', () => {
  const p = {
    v: PROTOCOL_VERSION,
    id: 'abc',
    joinedAt: 1_700_000_000_000,
    name: 'Aya',
    avatar: 12_345,
    mode: 'full',
    attached: true,
  };
  assert.equal(validPresence(p), true);
  assert.equal(validPresence({ ...p, mode: 'audio' }), true);
  assert.equal(validPresence({ ...p, mode: 'vr' }), false);
  assert.equal(validPresence({ ...p, attached: 'oui' }), false);
  assert.equal(validPresence({ ...p, id: '' }), false);
});
