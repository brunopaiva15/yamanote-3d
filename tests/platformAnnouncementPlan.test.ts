// Le plan d'annonces d'un arrêt (systems/platformAnnouncementPlan).
//
// C'est ce module qui a remplacé l'horloge : la gare ne dit plus l'annonce
// anticipée à la quatorzième seconde de chaque creux, et l'agent de quai ne
// débite plus deux consignes par arrêt dans l'ordre du numéro d'arrêt. Ce qui
// doit rester vrai :
//
//   • un creux long rend l'anticipée plus probable qu'un creux court ;
//   • un quai chargé n'a jamais MOINS de consignes qu'un quai calme ;
//   • une heure de pointe fait parler davantage ;
//   • un retard pousse les messages de circulation et de portes ;
//   • une petite gare déserte peut ne rien dire du tout ;
//   • et le plan ne se retire pas : relu, il est le même — aucun tirage n'a lieu
//     à la frame.
//
// Le module est pur : ni store, ni audio, ni Math.random(). Le dernier point se
// vérifie en piégeant Math.random pendant l'appel.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  agentCountWeights,
  agentMessageCount,
  agentMessageWeights,
  alightFirstChance,
  createPlatformAnnouncementPlan,
  fitsBeforeCutoff,
  greetingChance,
  isPeakHour,
  platformPlanSeed,
  preAnnouncementChance,
  seededRandom,
} = await import('../src/systems/platformAnnouncementPlan.ts');
const { PLATFORM_AGENT_MESSAGES } = await import('../src/data/stationAnnouncements.ts');

/** Shinjuku (16) est un hub, Uguisudani (5) non — voir isMajorHub. */
const HUB = 16;
const SMALL = 5;

const base = (over = {}) => ({
  stationIndex: SMALL,
  direction: 'inner' as const,
  headwaySeconds: 120,
  hour: 13,
  crowdLevel: 0.4,
  delayed: false,
  stopSequence: 7,
  ...over,
});

/** Générateur qui rend toujours la même valeur : deux contextes comparables. */
const fixed = (v: number) => () => v;
/** Générateur qui débite une liste, puis répète la dernière valeur. */
const scripted = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

/** Le même, en comptant les valeurs consommées. */
const counting = (values: number[]) => {
  const rng = scripted(values);
  const state = { calls: 0, next: () => ((state.calls += 1), rng()) };
  return state;
};

test('les bornes de pointe sont celles annoncées', () => {
  assert.equal(isPeakHour(8), true);
  assert.equal(isPeakHour(7), true);
  assert.equal(isPeakHour(9.4), true);
  assert.equal(isPeakHour(9.6), false);
  assert.equal(isPeakHour(18), true);
  assert.equal(isPeakHour(16.9), false);
  assert.equal(isPeakHour(19.6), false);
  assert.equal(isPeakHour(13), false);
});

// --- Annonce anticipée ---------------------------------------------------

test('un creux long rend l’annonce anticipée plus probable qu’un creux court', () => {
  const short = preAnnouncementChance(base({ headwaySeconds: 60 }));
  const middle = preAnnouncementChance(base({ headwaySeconds: 120 }));
  const long = preAnnouncementChance(base({ headwaySeconds: 200 }));
  assert.ok(short < middle, `${short} < ${middle}`);
  assert.ok(middle < long, `${middle} < ${long}`);
  // Les paliers de référence : 25 % sous 90 s, 55 % à 150 s, 80 % au-delà.
  assert.equal(preAnnouncementChance(base({ headwaySeconds: 80 })).toFixed(2), '0.25');
  assert.equal(preAnnouncementChance(base({ headwaySeconds: 150 })).toFixed(2), '0.55');
  assert.equal(preAnnouncementChance(base({ headwaySeconds: 240 })).toFixed(2), '0.80');
});

test('à tirage égal, le creux long l’annonce et le creux court non', () => {
  const roll = 0.5; // entre 25 % et 80 %
  const short = createPlatformAnnouncementPlan(
    base({ headwaySeconds: 60 }),
    fixed(roll),
  );
  const long = createPlatformAnnouncementPlan(base({ headwaySeconds: 240 }), fixed(roll));
  assert.equal(short.playPreAnnouncement, false);
  assert.equal(long.playPreAnnouncement, true);
});

test('l’anticipée n’est plus systématique, et le remerciement encore moins', () => {
  // Sur une centaine de creux ordinaires, ni l'une ni l'autre ne passe à tous
  // les coups — c'était précisément le défaut de l'ancienne horloge.
  let pre = 0;
  let greet = 0;
  for (let stop = 0; stop < 120; stop++) {
    const context = base({ stopSequence: stop, headwaySeconds: 60 + (stop % 3) * 45 });
    const plan = createPlatformAnnouncementPlan(
      context,
      seededRandom(platformPlanSeed(context)),
    );
    if (plan.playPreAnnouncement) pre++;
    if (plan.playGreeting) greet++;
  }
  assert.ok(pre > 10 && pre < 110, `préannonces : ${pre}/120`);
  assert.ok(greet < pre, `remerciements (${greet}) plus rares que préannonces (${pre})`);
  assert.ok(greet > 0, 'le remerciement doit passer de temps en temps');
});

test('le remerciement ne passe jamais sans l’annonce qu’il précède', () => {
  for (let stop = 0; stop < 200; stop++) {
    const context = base({ stopSequence: stop, crowdLevel: (stop % 10) / 10 });
    const plan = createPlatformAnnouncementPlan(
      context,
      seededRandom(platformPlanSeed(context)),
    );
    if (plan.playGreeting) assert.ok(plan.playPreAnnouncement);
  }
});

test('la pointe rend l’anticipée plus rare quand les rames se suivent', () => {
  const tight = { headwaySeconds: 70 };
  assert.ok(
    preAnnouncementChance(base({ ...tight, hour: 8 })) <
      preAnnouncementChance(base({ ...tight, hour: 13 })),
  );
  // Creux large : la pointe ne la pénalise plus, il y a la place.
  assert.equal(
    preAnnouncementChance(base({ headwaySeconds: 200, hour: 8 })),
    preAnnouncementChance(base({ headwaySeconds: 200, hour: 13 })),
  );
});

test('le remerciement se raréfie en pointe', () => {
  assert.ok(greetingChance(base({ hour: 8 })) < greetingChance(base({ hour: 13 })));
});

// --- « Laissez descendre » ----------------------------------------------

test('« laissez descendre » suit l’affluence, la gare et l’heure', () => {
  const quiet = alightFirstChance(base({ crowdLevel: 0.1, stationIndex: SMALL, hour: 13 }));
  const busyHub = alightFirstChance(base({ crowdLevel: 0.9, stationIndex: HUB, hour: 8 }));
  assert.ok(quiet < 0.25, `petite gare calme : ${quiet}`);
  assert.ok(busyHub > 0.9, `hub bondé en pointe : ${busyHub}`);
  assert.ok(
    alightFirstChance(base({ stationIndex: HUB })) >
      alightFirstChance(base({ stationIndex: SMALL })),
  );
});

test('une petite gare déserte peut n’avoir aucun message', () => {
  const context = base({ crowdLevel: 0.05, stationIndex: SMALL, hour: 13 });
  // Tirage haut sur « laissez descendre » (au-dessus de son maigre seuil), bas
  // sur le nombre de messages (dans la part de silence, majoritaire ici).
  const plan = createPlatformAnnouncementPlan(context, scripted([0.99, 0.99, 0.99, 0.1]));
  assert.equal(plan.playAlightFirstMessage, false);
  assert.deepEqual(plan.agentMessages, []);
  // Et sur une vraie série d'arrêts, le silence complet arrive régulièrement.
  let silent = 0;
  for (let stop = 0; stop < 60; stop++) {
    const c = { ...context, stopSequence: stop };
    const p = createPlatformAnnouncementPlan(c, seededRandom(platformPlanSeed(c)));
    if (!p.playAlightFirstMessage && p.agentMessages.length === 0) silent++;
  }
  assert.ok(silent > 10, `arrêts entièrement muets : ${silent}/60`);
});

test('un hub chargé en pointe peut avoir deux messages pertinents', () => {
  const context = base({ crowdLevel: 0.9, stationIndex: HUB, hour: 8, headwaySeconds: 100 });
  const plan = createPlatformAnnouncementPlan(context, fixed(0.99));
  assert.equal(plan.agentMessages.length, 2);
  assert.equal(new Set(plan.agentMessages).size, 2, 'deux messages distincts');
});

// --- Nombre de messages d'agent -----------------------------------------

test('à tirage égal, un quai chargé n’a jamais moins de messages qu’un quai calme', () => {
  for (let r = 0; r < 1; r += 0.01) {
    const low = agentMessageCount(base({ crowdLevel: 0.1 }), r);
    const mid = agentMessageCount(base({ crowdLevel: 0.5 }), r);
    const high = agentMessageCount(base({ crowdLevel: 0.9 }), r);
    assert.ok(low <= mid && mid <= high, `r=${r.toFixed(2)} : ${low}/${mid}/${high}`);
  }
});

test('les paliers de référence par affluence', () => {
  const low = agentCountWeights(base({ crowdLevel: 0.1 }));
  const mid = agentCountWeights(base({ crowdLevel: 0.5 }));
  const high = agentCountWeights(base({ crowdLevel: 0.9 }));
  assert.deepEqual(low, { none: 0.55, one: 0.4, two: 0.05 });
  assert.deepEqual(mid, { none: 0.2, one: 0.65, two: 0.15 });
  assert.deepEqual(high, { none: 0.05, one: 0.55, two: 0.4 });
});

test('l’heure de pointe augmente la probabilité des messages d’agent', () => {
  const day = agentCountWeights(base({ hour: 13 }));
  const peak = agentCountWeights(base({ hour: 8 }));
  assert.ok(peak.none < day.none, `${peak.none} < ${day.none}`);
  for (let r = 0; r < 1; r += 0.01) {
    assert.ok(
      agentMessageCount(base({ hour: 8 }), r) >= agentMessageCount(base({ hour: 13 }), r),
      `r=${r.toFixed(2)}`,
    );
  }
});

test('un hub en pointe penche un peu plus vers deux messages', () => {
  const hub = agentCountWeights(base({ hour: 8, stationIndex: HUB, crowdLevel: 0.9 }));
  const small = agentCountWeights(base({ hour: 8, stationIndex: SMALL, crowdLevel: 0.9 }));
  assert.ok(hub.two > small.two);
});

test('un retard fait parler l’agent au moins une fois sur un quai rempli', () => {
  for (let r = 0; r < 1; r += 0.01) {
    assert.ok(
      agentMessageCount(base({ delayed: true, crowdLevel: 0.5 }), r) >= 1,
      `r=${r.toFixed(2)}`,
    );
    assert.ok(
      agentMessageCount(base({ delayed: true }), r) >= agentMessageCount(base(), r),
      `r=${r.toFixed(2)}`,
    );
  }
});

// --- Quel message -------------------------------------------------------

test('un retard favorise les messages de circulation et de portes', () => {
  const wanted = ['move-inside', 'move-along-platform', 'clear-doors', 'wait-next-train'];
  const context = base({ crowdLevel: 0.8 });
  const calm = agentMessageWeights(context, 'exchange');
  const late = agentMessageWeights({ ...context, delayed: true }, 'exchange');
  const share = (w: number[]) => {
    const total = w.reduce((s, x) => s + x, 0);
    const part = w.reduce(
      (s, x, i) => s + (wanted.includes(PLATFORM_AGENT_MESSAGES[i].category) ? x : 0),
      0,
    );
    return part / total;
  };
  assert.ok(share(late) > share(calm), `${share(late)} > ${share(calm)}`);
});

test('un message hors de sa situation ne se dit pas', () => {
  // Quai presque vide : demander d'avancer vers le milieu de la voiture ou de
  // prendre le train suivant n'a aucun sens.
  const weights = agentMessageWeights(base({ crowdLevel: 0.05 }), 'exchange');
  for (let i = 0; i < PLATFORM_AGENT_MESSAGES.length; i++) {
    const m = PLATFORM_AGENT_MESSAGES[i];
    if (m.minCrowd != null && m.minCrowd > 0.05) assert.equal(weights[i], 0, m.text);
  }
  // Et il reste toujours quelque chose à dire : les poids ne sont jamais tous nuls.
  assert.ok(weights.some((w) => w > 0));
});

test('chaque créneau tire dans son propre registre', () => {
  const context = base({ crowdLevel: 0.9 });
  const exchange = agentMessageWeights(context, 'exchange');
  const preMelody = agentMessageWeights(context, 'pre-melody');
  const idx = (cat: string) => PLATFORM_AGENT_MESSAGES.findIndex((m) => m.category === cat);
  assert.ok(exchange[idx('alighting')] > preMelody[idx('alighting')]);
  assert.ok(preMelody[idx('no-rushing')] > exchange[idx('no-rushing')]);
});

test('« laissez descendre » ne passe pas deux fois dans le même arrêt', () => {
  const alighting = PLATFORM_AGENT_MESSAGES.findIndex((m) => m.category === 'alighting');
  for (let stop = 0; stop < 300; stop++) {
    const context = base({ stopSequence: stop, crowdLevel: (stop % 11) / 10, stationIndex: stop % 30 });
    const plan = createPlatformAnnouncementPlan(
      context,
      seededRandom(platformPlanSeed(context)),
    );
    if (plan.playAlightFirstMessage) {
      assert.ok(!plan.agentMessages.includes(alighting), `arrêt ${stop}`);
    }
    assert.equal(new Set(plan.agentMessages).size, plan.agentMessages.length);
  }
});

// --- Déterminisme -------------------------------------------------------

test('le plan est le même à chaque relecture du même arrêt', () => {
  const context = base({ crowdLevel: 0.7, stationIndex: HUB });
  const seed = platformPlanSeed(context);
  const a = createPlatformAnnouncementPlan(context, seededRandom(seed));
  const b = createPlatformAnnouncementPlan(context, seededRandom(seed));
  assert.deepEqual(a, b);
});

test('la rame suivante obtient un autre plan', () => {
  const seeds = new Set();
  for (let stop = 0; stop < 8; stop++) {
    seeds.add(platformPlanSeed(base({ stopSequence: stop })));
  }
  assert.equal(seeds.size, 8);
  // La graine bouge aussi avec la gare, le sens et la minute simulée : deux
  // quais de la même gare ne parlent pas d'un seul mouvement.
  assert.notEqual(
    platformPlanSeed(base({ direction: 'inner' })),
    platformPlanSeed(base({ direction: 'outer' })),
  );
  assert.notEqual(
    platformPlanSeed(base({ stationIndex: 1 })),
    platformPlanSeed(base({ stationIndex: 2 })),
  );
  assert.notEqual(platformPlanSeed(base({ hour: 8 })), platformPlanSeed(base({ hour: 8.5 })));
});

test('aucun tirage caché : Math.random n’est jamais appelé', () => {
  const real = Math.random;
  Math.random = () => {
    throw new Error('le plan ne doit pas tirer lui-même');
  };
  try {
    const context = base({ crowdLevel: 0.9, stationIndex: HUB, hour: 8 });
    createPlatformAnnouncementPlan(context, seededRandom(platformPlanSeed(context)));
  } finally {
    Math.random = real;
  }
});

test('le nombre de valeurs consommées ne dépend que du nombre de messages', () => {
  const silent = counting([0.99, 0.99, 0.99, 0.1]);
  const none = createPlatformAnnouncementPlan(base({ crowdLevel: 0.05 }), silent.next);
  assert.equal(none.agentMessages.length, 0);
  assert.equal(silent.calls, 4, 'quatre décisions fixes');

  const loud = counting([0.99]);
  const two = createPlatformAnnouncementPlan(
    base({ crowdLevel: 0.9, stationIndex: HUB, hour: 8 }),
    loud.next,
  );
  assert.equal(two.agentMessages.length, 2);
  assert.equal(loud.calls, 6, 'quatre décisions plus un tirage par message');
});

test('un générateur scripté donne un plan lisible', () => {
  // anticipée (0.1 < seuil), remerciement (0.9 > seuil), laissez-descendre
  // (0.01 < seuil), un seul message, puis son tirage.
  const plan = createPlatformAnnouncementPlan(
    base({ headwaySeconds: 200, crowdLevel: 0.5 }),
    scripted([0.1, 0.9, 0.01, 0.5, 0.0]),
  );
  assert.equal(plan.playPreAnnouncement, true);
  assert.equal(plan.playGreeting, false);
  assert.equal(plan.playAlightFirstMessage, true);
  assert.equal(plan.agentMessages.length, 1);
});

// --- Créneaux sonores ---------------------------------------------------

test('un message qui déborde sur la mélodie est abandonné', () => {
  // 4 s de message, rien en file, 10 s avant la mélodie : ça tient.
  assert.equal(fitsBeforeCutoff(4, 0, 10), true);
  // La même chose avec 5 s encore à dire : non.
  assert.equal(fitsBeforeCutoff(4, 5, 10), false);
  // Juste à la limite : la marge de silence tranche.
  assert.equal(fitsBeforeCutoff(4, 0, 5.5), true);
  assert.equal(fitsBeforeCutoff(4, 0, 5.4), false);
  // Un message sans clip ne tient jamais : il ne se dirait pas.
  assert.equal(fitsBeforeCutoff(0, 0, 60), false);
  // Et un créneau déjà passé non plus.
  assert.equal(fitsBeforeCutoff(4, 0, -1), false);
});

test('le tirage déterministe couvre bien [0, 1[', () => {
  const rng = seededRandom(12345);
  let min = 1;
  let max = 0;
  for (let i = 0; i < 5000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  assert.ok(min < 0.01 && max > 0.99, `${min} / ${max}`);
});
