// La chronologie sonore d'un arrêt à Shibuya, bout à bout.
//
// Shibuya est la seule gare qui parle plus que les autres, et c'est donc la seule
// où la file du quai peut se remplir assez pour repousser un message facultatif
// hors du moment où il voulait dire quelque chose. Cet arrêt-là est le cas
// limite du système entier : deux automates, une consigne locale en deux langues,
// un plan probabiliste et une mélodie qui ne se décale pas.
//
// Ce que ce fichier rejoue, dans l'ordre où systems/stationPa et
// systems/platformWait le construisent :
//
//   arrivée de la rame
//     → 渋谷、渋谷。ご乗車、ありがとうございます。      (automate du sens)
//     → 電車とホームの間が…足元にご注意ください。       (consigne locale, ja)
//     → Please mind the gap between the train and the platform.  (consigne, en)
//     → « laissez descendre »          (agent, si le plan l'a retenu ET si ça tient)
//     → premier message d'agent        (agent, même condition)
//     → 発車メロディ
//
// Les durées sont celles des MP3 réellement gravés (pa-manifest), et la file est
// simulée à la seconde : c'est ce qui permet de vérifier qu'aucun message
// facultatif ne mord sur la mélodie.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  ANNOUNCEMENT_MARGIN,
  PLATFORM_SCHEDULE,
  createPlatformAnnouncementPlan,
  optionalMessagePlays,
  platformPlanSeed,
  seededRandom,
} = await import('../src/systems/platformAnnouncementPlan.ts');
const { announcementClipDuration, announcementClipPath } = await import(
  '../src/data/announcementClips.ts'
);
const {
  platformAgentMessage,
  platformAlightFirstAnnouncement,
  platformArrivalAnnouncement,
} = await import('../src/data/stationAnnouncements.ts');
const { platformNoticesForStation } = await import(
  '../src/data/stationAnnouncementRules.ts'
);
const { approachSequence } = await import('../src/data/announcements.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { clipKey } = await import('../src/data/clipKey.ts');

const SHIBUYA = STATIONS.findIndex((st) => st.jy === 'JY20');
const SHIBUYA_JY = 'JY20';
const DIRECTIONS = ['inner', 'outer'] as const;

const GAP_EN_PLATFORM = 'Please mind the gap between the train and the platform.';
const GAP_EN_CABIN = 'Please watch your step when you leave the train.';

/** Durée gravée d'un segment (s) ; 0 s'il n'a pas de clip. */
const durOf = (u) => announcementClipDuration(u.lang, u.text, u.voice) ?? 0;
const durationOf = (items) => items.reduce((s, u) => s + durOf(u), 0);

/** Instant d'ouverture effective + retard des baies palières (systems/platformWait). */
const OPEN_AT = 0.4 + 0.85 + 0.6;
/** Annonce du nom de la gare, juste après l'immobilisation. */
const ARRIVAL_AT = 0.9;

/**
 * La file du quai, telle que systems/speech la sert : un seul segment à la fois,
 * dans l'ordre d'arrivée, et rien ne se joue avant que le précédent soit fini.
 */
function makeQueue() {
  let freeAt = 0;
  return {
    /** Met une séquence en file à l'instant `t` et rend ses créneaux. */
    push(t, items, kind) {
      const spans = [];
      let at = Math.max(t, freeAt);
      for (const u of items) {
        const d = durOf(u);
        spans.push({ text: u.text, voice: u.voice, from: at, to: at + d, kind });
        at += d;
      }
      freeAt = at;
      return spans;
    },
    /** Ce qu'il reste à dire à l'instant `t` (speechQueueRemaining). */
    remaining(t) {
      return Math.max(0, freeAt - t);
    },
  };
}

/** Un arrêt complet à Shibuya, joué seconde par seconde. */
function playShibuyaStop({ direction, melodyAfterStop, plan }) {
  const melodyAt = melodyAfterStop - 1; // STOP_TO_DWELL_T0
  const queue = makeQueue();
  const spans = [];

  // Obligatoire : la gare dit son nom, et Shibuya enchaîne sur sa consigne.
  spans.push(
    ...queue.push(
      ARRIVAL_AT,
      [
        ...platformArrivalAnnouncement(SHIBUYA, direction),
        ...platformNoticesForStation(SHIBUYA_JY, direction, 'arrival'),
      ],
      'mandatory',
    ),
  );

  const alight = platformAlightFirstAnnouncement();
  const alightPlayed = optionalMessagePlays(
    plan.playAlightFirstMessage,
    durationOf(alight),
    queue.remaining(OPEN_AT),
    melodyAt - OPEN_AT,
  );
  if (alightPlayed) spans.push(...queue.push(OPEN_AT, alight, 'optional'));

  const agentAt = PLATFORM_SCHEDULE.agentExchangeAt;
  const agent = plan.agentMessages.length > 0 ? platformAgentMessage(plan.agentMessages[0]) : [];
  const agentPlayed = optionalMessagePlays(
    plan.agentMessages.length > 0,
    durationOf(agent),
    queue.remaining(agentAt),
    melodyAt - agentAt,
  );
  if (agentPlayed) spans.push(...queue.push(agentAt, agent, 'optional'));

  return { spans, melodyAt, alightPlayed, agentPlayed };
}

/** Plan de référence : tout est retenu, pour éprouver les créneaux et non le tirage. */
const FULL_PLAN = { playGreeting: false, playPreAnnouncement: false, playAlightFirstMessage: true, agentMessages: [1] };

test('chaque clip de la chronologie de Shibuya existe', () => {
  for (const direction of DIRECTIONS) {
    const { spans } = playShibuyaStop({ direction, melodyAfterStop: 25, plan: FULL_PLAN });
    assert.ok(spans.length >= 5, `${direction} : ${spans.length} segments`);
    for (const span of spans) {
      assert.ok(
        announcementClipPath('ja-JP', span.text, span.voice) ||
          announcementClipPath('en-US', span.text, span.voice),
        `« ${span.text} » (${span.voice}) sans MP3`,
      );
      assert.ok(span.to > span.from, `« ${span.text} » de durée nulle`);
    }
  }
});

test('les rôles vocaux de la chronologie sont ceux attendus', () => {
  for (const [direction, automat] of [
    ['inner', 'atos-inner'],
    ['outer', 'atos-outer'],
  ] as const) {
    const { spans } = playShibuyaStop({ direction, melodyAfterStop: 25, plan: FULL_PLAN });
    assert.deepEqual(spans.map((s) => s.voice), [
      automat, // 渋谷、渋谷。
      automat, // consigne d'écart, japonais
      'atos-en', // consigne d'écart, anglais
      'agent', // laissez descendre
      'agent', // premier message d'agent
    ]);
  }
});

test('l’avertissement anglais du quai est celui du quai, pas celui de la rame', () => {
  for (const direction of DIRECTIONS) {
    const { spans } = playShibuyaStop({ direction, melodyAfterStop: 25, plan: FULL_PLAN });
    const english = spans.filter((s) => s.voice === 'atos-en');
    assert.deepEqual(english.map((s) => s.text), [GAP_EN_PLATFORM]);
    assert.ok(!english[0].text.includes('leave the train'), english[0].text);
    // Et la rame, elle, garde sa formulation : les deux existent, gravées
    // séparément, et ne se partagent pas de clip.
    const cabin = approachSequence(SHIBUYA, 1, direction).filter((u) => u.lang === 'en-US');
    assert.ok(
      cabin.some((u) => u.text === GAP_EN_CABIN),
      'la rame a perdu sa version de la consigne',
    );
    assert.notEqual(clipKey('en-US', GAP_EN_CABIN), clipKey('en-US', GAP_EN_PLATFORM, 'atos-en'));
  }
});

test('« laissez descendre » ne passe que s’il finit avant la mélodie', () => {
  for (const direction of DIRECTIONS) {
    // Arrêt le plus court (mélodie 15 s après l'arrêt) : la séquence d'arrivée de
    // Shibuya occupe déjà le créneau, le message est abandonné.
    const tight = playShibuyaStop({ direction, melodyAfterStop: 15, plan: FULL_PLAN });
    assert.equal(tight.alightPlayed, false, `${direction} : arrêt court`);

    // Arrêt qui prend son temps : il passe, et il finit avant la première note.
    const roomy = playShibuyaStop({ direction, melodyAfterStop: 25, plan: FULL_PLAN });
    assert.equal(roomy.alightPlayed, true, `${direction} : arrêt long`);
    const last = roomy.spans[roomy.spans.length - 1];
    assert.ok(
      last.to + ANNOUNCEMENT_MARGIN <= roomy.melodyAt + ANNOUNCEMENT_MARGIN,
      `${direction} : dernier segment à ${last.to.toFixed(1)} s pour une mélodie à ${roomy.melodyAt} s`,
    );
  }
});

test('aucun message facultatif ne déborde sur la mélodie', () => {
  // Toutes les longueurs d'arrêt admises (systems/stationCycle : 15 à 25 s après
  // l'immobilisation — Shibuya ne descend en pratique pas sous 17,5 s, mais on
  // éprouve la borne basse quand même), les deux sens, un plan qui demande tout.
  //
  // La règle ne porte que sur le FACULTATIF, et c'est voulu : la séquence
  // d'arrivée, elle, est obligatoire, et à Shibuya elle peut encore parler quand
  // la mélodie part sur l'arrêt le plus court. Ce n'est pas un conflit de file —
  // la 発車メロディ n'est pas dans la file de la sono, c'est une autre source, et
  // un vrai quai laisse très bien la version anglaise finir sous les premières
  // notes. Ce qu'on refuse, c'est de RAJOUTER une consigne par-dessus.
  for (const direction of DIRECTIONS) {
    for (let melodyAfterStop = 15; melodyAfterStop <= 25; melodyAfterStop += 0.5) {
      const { spans, melodyAt } = playShibuyaStop({ direction, melodyAfterStop, plan: FULL_PLAN });
      for (const span of spans.filter((sp) => sp.kind === 'optional')) {
        assert.ok(
          span.to <= melodyAt,
          `${direction} @${melodyAfterStop} s : « ${span.text} » finit à ${span.to.toFixed(1)} s, mélodie à ${melodyAt} s`,
        );
      }
      // Et rien ne COMMENCE après la mélodie, obligatoire compris : la gare
      // n'entame pas une séquence par-dessus le morceau.
      for (const span of spans) {
        assert.ok(
          span.from < melodyAt,
          `${direction} @${melodyAfterStop} s : « ${span.text} » démarre à ${span.from.toFixed(1)} s`,
        );
      }
    }
  }
});

test('sur l’arrêt le plus court, c’est la consigne obligatoire qui reste — pas une de plus', () => {
  // Le cas limite, nommé : mélodie 15 s après l'arrêt. La séquence d'arrivée de
  // Shibuya (nom + consigne ja + consigne en) occupe tout, donc aucun message
  // facultatif ne passe, et le seul dépassement possible est celui d'un segment
  // obligatoire déjà commencé.
  for (const direction of DIRECTIONS) {
    const { spans, melodyAt, alightPlayed, agentPlayed } = playShibuyaStop({
      direction,
      melodyAfterStop: 15,
      plan: FULL_PLAN,
    });
    assert.equal(alightPlayed, false);
    assert.equal(agentPlayed, false);
    assert.ok(spans.every((sp) => sp.kind === 'mandatory'));
    const over = spans.filter((sp) => sp.to > melodyAt);
    assert.equal(over.length, 1, 'un seul segment peut encore parler sous les notes');
    assert.equal(over[0].text, GAP_EN_PLATFORM);
  }
});

test('rien n’est dit deux fois dans le même arrêt', () => {
  for (const direction of DIRECTIONS) {
    for (let melodyAfterStop = 15; melodyAfterStop <= 25; melodyAfterStop += 0.5) {
      // Plan réel, tiré comme en jeu : c'est lui qui garantit que « laissez
      // descendre » et le message d'agent ne sont pas la même consigne.
      for (let stop = 0; stop < 12; stop++) {
        const context = {
          stationIndex: SHIBUYA,
          direction,
          headwaySeconds: 120,
          hour: 8.25,
          crowdLevel: 0.85,
          delayed: false,
          stopSequence: stop,
        };
        const plan = createPlatformAnnouncementPlan(
          context,
          seededRandom(platformPlanSeed(context)),
        );
        const { spans } = playShibuyaStop({ direction, melodyAfterStop, plan });
        const texts = spans.map((s) => s.text);
        assert.equal(
          new Set(texts).size,
          texts.length,
          `${direction} @${melodyAfterStop} s, arrêt ${stop} : ${texts.join(' | ')}`,
        );
      }
    }
  }
});

test('la file du quai ne recouvre jamais son propre segment précédent', () => {
  for (const direction of DIRECTIONS) {
    const { spans } = playShibuyaStop({ direction, melodyAfterStop: 25, plan: FULL_PLAN });
    for (let i = 1; i < spans.length; i++) {
      assert.ok(
        spans[i].from >= spans[i - 1].to - 1e-9,
        `${direction} : « ${spans[i].text} » démarre avant la fin de « ${spans[i - 1].text} »`,
      );
    }
  }
});

test('le canal de la rame reste indépendant de celui du quai', () => {
  // Les deux sonorisations parlent en même temps à Shibuya — la rame finit sa
  // séquence d'approche pendant que le quai annonce le nom de la gare — et elles
  // ne peuvent pas se partager un fichier : les clips du quai portent leur rôle
  // vocal dans leur clé, ceux de la rame n'en ont pas.
  for (const direction of DIRECTIONS) {
    const cabinKeys = new Set(
      approachSequence(SHIBUYA, 1, direction).map((u) => clipKey(u.lang, u.text)),
    );
    const { spans } = playShibuyaStop({ direction, melodyAfterStop: 25, plan: FULL_PLAN });
    const platformKeys = spans.map((s) =>
      clipKey(s.text === GAP_EN_PLATFORM ? 'en-US' : 'ja-JP', s.text, s.voice),
    );
    for (const key of platformKeys) {
      assert.ok(!cabinKeys.has(key), `clip partagé entre la rame et le quai : ${key}`);
    }
    // Et la consigne japonaise, elle, existe des deux côtés — deux textes
    // différents (ponctuation de bord) et donc deux clips.
    const cabinJp = approachSequence(SHIBUYA, 1, direction).filter((u) =>
      u.text.includes('足元にご注意ください'),
    );
    const platformJp = spans.filter((s) => s.text.includes('足元にご注意ください'));
    assert.equal(cabinJp.length, 1);
    assert.equal(platformJp.length, 1);
    assert.notEqual(cabinJp[0].text, platformJp[0].text);
  }
});
