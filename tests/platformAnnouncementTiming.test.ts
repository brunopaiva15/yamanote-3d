// La chronologie sonore du quai : ce qui ne doit jamais se marcher dessus.
//
// La sono du quai n'a qu'une file (systems/speech, canal 'platform') : deux
// annonces ne peuvent pas sonner en même temps, mais la seconde peut très bien
// sortir trop tard - par-dessus la mélodie, après la fermeture des portes
// qu'elle demandait de dégager, ou sur le carillon du train qui arrive. C'est le
// vrai risque une fois les messages devenus facultatifs : ce qui n'est pas
// obligatoire doit être ABANDONNÉ plutôt que repoussé.
//
// Ce fichier croise donc trois choses qui peuvent diverger en silence : la
// chronologie (PLATFORM_SCHEDULE), la longueur RÉELLE des clips gravés
// (pa-manifest) et les bornes du dwell (systems/stationCycle, dont les valeurs
// sont rappelées ici - le module tire tout le moteur audio et n'est pas
// importable dans Node, comme pour tests/melodyTiming).

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const {
  ANNOUNCEMENT_MARGIN,
  PLATFORM_SCHEDULE,
  createPlatformAnnouncementPlan,
  fitsBeforeCutoff,
  optionalMessagePlays,
  trainEnteringPasses,
} = await import('../src/systems/platformAnnouncementPlan.ts');
const { announcementClipDuration } = await import('../src/data/announcementClips.ts');
const {
  PLATFORM_AGENT_MESSAGES,
  PLATFORM_DELAY_CAUSES,
  platformTrainEnteringAnnouncement,
  platformAgentMessage,
  platformAlightFirstAnnouncement,
  platformApproachAnnouncement,
  platformArrivalAnnouncement,
  platformDelayAnnouncement,
  platformDoorsClosingAnnouncement,
  platformGreeting,
  platformPreAnnouncement,
} = await import('../src/data/stationAnnouncements.ts');
const { doorsClosingAnnouncement } = await import('../src/data/announcements.ts');
const { platformNoticesForStation } = await import(
  '../src/data/stationAnnouncementRules.ts'
);
const { STATIONS } = await import('../src/data/stations.ts');
const { platformFor } = await import('../src/data/platforms.ts');
const { APPROACH_CHIME_TOTAL_S } = await import('../src/data/approachChimes.ts');
const { V_MAX } = await import('../src/data/config.ts');
const { DEPART_HOLD, integrateTrain, stopDistance } = await import(
  '../src/systems/trainPhysics.ts'
);

const { readFileSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');
const { dirname, join } = await import('node:path');

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'systems');
const readSystem = (name) => readFileSync(join(SRC, name), 'utf8');

const DIRECTIONS = ['inner', 'outer'] as const;

/** Durée gravée d'une séquence (s) ; 0 pour un texte sans clip. */
const durationOf = (items) =>
  items.reduce((s, u) => s + (announcementClipDuration(u.lang, u.text, u.voice) ?? 0), 0);

const platformOf = (index, direction) =>
  platformFor(STATIONS[index].jy, direction)?.platform ?? 1;

// Les trois séquences que la gare construit VRAIMENT (systems/stationPa) :
// consignes locales comprises. Les mesurer sans elles reviendrait à chronométrer
// autre chose que ce qui sort des haut-parleurs - à Shibuya, la consigne d'écart
// double presque la séquence d'arrivée.

const approachItems = (index, direction) => [
  ...platformApproachAnnouncement(index, platformOf(index, direction), direction),
  ...platformNoticesForStation(STATIONS[index].jy, direction, 'approach'),
];

const preAnnounceItems = (index, direction, withGreeting) => [
  ...(withGreeting ? platformGreeting(direction) : []),
  ...platformPreAnnouncement(index, platformOf(index, direction), direction),
  ...platformNoticesForStation(STATIONS[index].jy, direction, 'pre-approach'),
];

const arrivalItems = (index, direction) => [
  ...platformArrivalAnnouncement(index, direction),
  ...platformNoticesForStation(STATIONS[index].jy, direction, 'arrival'),
];

/**
 * Bornes du dwell rappelées de systems/stationCycle : le plus tôt où la mélodie
 * peut partir, une fois retirée la seconde écoulée avant l'entrée en dwell.
 * (MELODY_AFTER_STOP_MIN = 15 s, STOP_TO_DWELL_T0 = 1 s.)
 */
const MELODY_START_MIN = 15 - 1;

/** Creux le plus court entre deux rames (systems/platformWait, HEADWAY_GAP). */
const HEADWAY_GAP = 60;

/**
 * Bornes de la fermeture, rappelées de systems/stationCycle : avance de
 * l'annonce sur la fin du dwell, et retard de la voix de la gare sur celle de la
 * rame. Le module n'est pas importable ici (il tire tout le moteur audio), donc
 * les deux valeurs sont relues dans sa source juste en dessous.
 */
const CLOSE_ANNOUNCE_LEAD = 13.0;
const PA_CLOSE_LAG = 1.2;

test('les bornes de la fermeture rappelées ici sont celles du cycle', () => {
  const cycle = readSystem('stationCycle.ts');
  assert.match(cycle, /export const CLOSE_ANNOUNCE_LEAD = 13\.0;/);
  assert.match(cycle, /export const PA_CLOSE_LAG = 1\.2;/);
});

test('l’annonce d’approche n’est pas facultative', () => {
  // Rien dans le plan ne peut l'empêcher : elle n'y a pas de drapeau, et le
  // rendez-vous qui la lance ne consulte pas le plan (systems/platformWait,
  // clé 'announce').
  const plan = createPlatformAnnouncementPlan(
    {
      stationIndex: 0,
      direction: 'inner',
      headwaySeconds: 60,
      hour: 13,
      crowdLevel: 0.5,
      delayed: false,
      stopSequence: 1,
    },
    () => 0.99,
  );
  assert.deepEqual(Object.keys(plan).sort(), [
    'agentMessages',
    'playAlightFirstMessage',
    'playGreeting',
    'playPreAnnouncement',
  ]);
});

test('l’annonce d’approche a dit l’essentiel avant que la rame ne paraisse', () => {
  // Elle part à headway − 24 s. Le JAPONAIS doit être fini quand la rame se
  // présente : c'est lui qui dit la voie, le sens et la consigne de recul.
  // L'anglais, lui, peut courir sur l'entrée en gare - c'est ce qui se passe
  // sur un vrai quai, où la version anglaise finit souvent devant la rame déjà
  // à l'arrêt. Ce qui ne doit pas arriver, c'est qu'elle déborde jusqu'à
  // l'annonce du nom de la gare, une trentaine de secondes plus loin.
  //
  // Séquence complète, consignes locales comprises : c'est ce que la gare met en
  // file, pas seulement l'annonce d'approche seule.
  const untilArrival = PLATFORM_SCHEDULE.approachBefore;
  for (const direction of DIRECTIONS) {
    for (let i = 0; i < STATIONS.length; i++) {
      const items = approachItems(i, direction);
      const jp = durationOf(items.filter((u) => u.lang === 'ja-JP'));
      const all = durationOf(items);
      const where = `${STATIONS[i].jy} (${direction})`;
      assert.ok(jp > 0, `annonce d'approche sans clip à ${where}`);
      assert.ok(jp <= untilArrival, `${where} : japonais ${jp.toFixed(1)} s pour ${untilArrival} s`);
      assert.ok(all <= untilArrival + 12, `${where} : ${all.toFixed(1)} s au total`);
    }
  }
});

// --- L'entrée en gare, du carillon aux portes ----------------------------
//
// Les instants de cette séquence sont rappelés ici pour la même raison que les
// bornes du dwell : ils vivent dans des modules qui tirent le moteur audio et
// ne s'importent pas dans Node.

/** Silence entre un signal de la sono et le premier mot (systems/stationPa). */
const SIGNAL_TO_VOICE = 0.3;
/** Attaque du carillon ATOS (audioEngine.platformChime, `lead`). */
const CHIME_LEAD = 0.05;
/** Du déclenchement du carillon au premier mot de l'annonce d'approche. */
const APPROACH_VOICE_AT = CHIME_LEAD + APPROACH_CHIME_TOTAL_S + SIGNAL_TO_VOICE;
/** Les deux bips du signal d'entrée (audioEngine.PLATFORM_WARNING_SIGNAL_S). */
const WARNING_SIGNAL = 0.24 + 0.14;
/** Du déclenchement du signal au premier mot de l'avertissement d'entrée. */
const WARNING_VOICE_AT = WARNING_SIGNAL + SIGNAL_TO_VOICE;
/** Distance restant à parcourir à laquelle il part (systems/platformWait). */
const ENTERING_AT_LEFT = 150;

/**
 * Le freinage tel que le quai le voit : quand la rame paraît au bout du quai
 * (t = 0, elle roule à V_MAX), quand elle arrive à portée de l'avertissement
 * d'entrée, et quand elle s'immobilise.
 */
function brakingRun(): { warningAt: number; stopAt: number } {
  const s = { v: V_MAX, a: 0, d: 0 };
  const dt = 1 / 30;
  let t = 0;
  let warningAt = 0;
  while (s.v > 0.02 && t < 120) {
    integrateTrain(s, 0, dt);
    t += dt;
    if (!warningAt && stopDistance(s.v, s.a) <= ENTERING_AT_LEFT) warningAt = t;
  }
  return { warningAt, stopAt: t };
}

test('l’annonce d’approche part AVANT la rame, pas avec elle', () => {
  // La régression que ce test verrouille : le déclencheur de l'annonce
  // d'approche avait été mis sous condition du LÂCHER de la rame
  // (`released && t >= releaseAt - APPROACH_AT_BEFORE`), or `released` contient
  // déjà `t >= releaseAt`. L'annonce partait donc à la seconde où la rame
  // s'élançait vers le quai : « the train will soon arrive » sur une rame en
  // train d'entrer, puis 「電車がまいります」 repoussé derrière ses trente
  // secondes de parole, jusqu'après l'ouverture des portes.
  const line = readSystem('platformWait.ts')
    .split('\n')
    .find((l) => l.includes("once('announce'"));
  assert.ok(line, "aucun déclencheur 'announce' dans platformWait.ts");
  assert.ok(
    line.includes('APPROACH_AT_BEFORE'),
    `l'annonce d'approche ne lit pas son avance : ${line.trim()}`,
  );
  assert.ok(
    !/\breleased\b/.test(line),
    `l'annonce d'approche attend le lâcher de la rame : ${line.trim()}`,
  );
});

test('l’avertissement d’entrée sort pendant l’entrée, deux fois, et pas après', () => {
  // Bout à bout, sur la file du quai : le carillon puis l'annonce d'approche
  // partent APPROACH_AT_BEFORE avant que la rame ne paraisse ; l'avertissement
  // d'entrée se présente pendant le freinage, derrière ce qu'il en reste - le
  // plus souvent la version anglaise. Les deux passages doivent tenir avant
  // l'immobilisation, sans quoi ils sortiraient sur les portes qui s'ouvrent.
  const { warningAt, stopAt } = brakingRun();
  assert.ok(warningAt > 0 && warningAt < stopAt, 'avertissement hors du freinage');
  for (const direction of DIRECTIONS) {
    const warning = durationOf(platformTrainEnteringAnnouncement(direction));
    assert.ok(warning > 0, `avertissement d'entrée sans clip (${direction})`);
    for (let i = 0; i < STATIONS.length; i++) {
      const where = `${STATIONS[i].jy} (${direction})`;
      // Origine des temps : l'instant où la rame paraît au bout du quai.
      const approachEndsAt =
        -PLATFORM_SCHEDULE.approachBefore + APPROACH_VOICE_AT + durationOf(approachItems(i, direction));
      assert.ok(
        approachEndsAt < warningAt + ANNOUNCEMENT_MARGIN,
        `${where} : l'annonce d'approche parle encore à ${approachEndsAt.toFixed(1)} s`,
      );
      const queue = Math.max(0, approachEndsAt - warningAt);
      assert.equal(
        trainEnteringPasses(warning, WARNING_VOICE_AT, queue, stopAt - warningAt),
        2,
        `${where} : ${queue.toFixed(1)} s de file pour ${(stopAt - warningAt).toFixed(1)} s`,
      );
    }
  }
});

test('l’avertissement d’entrée est abandonné plutôt que dit à une rame posée', () => {
  const warning = durationOf(platformTrainEnteringAnnouncement('inner'));
  const window = 20;
  // File pleine : le second passage tombe d'abord, puis le premier.
  assert.equal(trainEnteringPasses(warning, WARNING_VOICE_AT, 0, window), 2);
  /** Ce que la file doit laisser pour un passage, et pour deux. */
  const forOne = WARNING_VOICE_AT + warning + ANNOUNCEMENT_MARGIN;
  const forTwo = forOne + warning;
  assert.equal(trainEnteringPasses(warning, WARNING_VOICE_AT, window - forTwo, window), 2);
  assert.equal(
    trainEnteringPasses(warning, WARNING_VOICE_AT, window - forTwo + 0.01, window),
    1,
  );
  assert.equal(trainEnteringPasses(warning, WARNING_VOICE_AT, window - forOne, window), 1);
  assert.equal(
    trainEnteringPasses(warning, WARNING_VOICE_AT, window - forOne + 0.01, window),
    0,
  );
  assert.equal(trainEnteringPasses(warning, WARNING_VOICE_AT, window, window), 0);
  // Et jamais rien à moins d'une marge de silence de l'immobilisation.
  const exact = WARNING_VOICE_AT + warning + ANNOUNCEMENT_MARGIN;
  assert.equal(trainEnteringPasses(warning, WARNING_VOICE_AT, 0, exact), 1);
  assert.equal(trainEnteringPasses(warning, WARNING_VOICE_AT, 0, exact - 0.01), 0);
});

test('l’excuse de retard est terminée avant le rendez-vous décalé de l’anticipée', () => {
  const { delayAt, preAnnounceAfterDelayAt } = PLATFORM_SCHEDULE;
  for (const direction of DIRECTIONS) {
    for (let c = 0; c < PLATFORM_DELAY_CAUSES.length; c++) {
      const d = durationOf(platformDelayAnnouncement(c, direction));
      assert.ok(d > 0, `motif ${c} sans clip (${direction})`);
      assert.ok(
        delayAt + d <= preAnnounceAfterDelayAt,
        `motif ${c} (${direction}) : finit à ${(delayAt + d).toFixed(1)} s`,
      );
    }
  }
});

test('l’anticipée facultative ne retarde pas l’annonce d’approche', () => {
  // Créneau réel du creux le plus court : de son rendez-vous à l'annonce
  // d'approche. Ce qui n'y tient pas est abandonné (paPreAnnouncement vérifie
  // fitsBeforeCutoff) - jamais joué en retard. Les consignes locales de phase
  // 'pre-approach' comptent : c'est la séquence entière qui doit tenir.
  const cutoff = HEADWAY_GAP - PLATFORM_SCHEDULE.approachBefore - PLATFORM_SCHEDULE.preAnnounceAt;
  let fitting = 0;
  for (const direction of DIRECTIONS) {
    for (let i = 0; i < STATIONS.length; i++) {
      const alone = durationOf(preAnnounceItems(i, direction, false));
      const withGreeting = durationOf(preAnnounceItems(i, direction, true));
      assert.ok(alone > 0, `anticipée sans clip à ${STATIONS[i].jy} (${direction})`);
      assert.ok(withGreeting > alone, 'le remerciement rallonge la séquence');
      if (fitsBeforeCutoff(alone, 0, cutoff)) fitting++;
      // Rien ne DOIT tenir, mais tout doit être tranché par le même test : la
      // version avec remerciement est plus longue, donc jamais plus permissive.
      if (fitsBeforeCutoff(withGreeting, 0, cutoff)) {
        assert.ok(fitsBeforeCutoff(alone, 0, cutoff));
      }
    }
  }
  // Et le créneau du creux court laisse quand même passer l'anticipée seule :
  // sans cela, elle ne s'entendrait jamais.
  assert.ok(fitting > 0, 'aucune anticipée ne tient dans un creux de 60 s');
});

test('la séquence d’arrivée est mesurée telle qu’elle sort, consignes comprises', () => {
  // C'est elle qui occupe la file quand « laissez descendre » se présente, et
  // c'est là que Shibuya se distingue : le nom de la gare, puis la consigne
  // d'écart en japonais et en anglais.
  const shibuya = STATIONS.findIndex((st) => st.jy === 'JY20');
  for (const direction of DIRECTIONS) {
    for (let i = 0; i < STATIONS.length; i++) {
      const items = arrivalItems(i, direction);
      const where = `${STATIONS[i].jy} (${direction})`;
      for (const u of items) {
        assert.ok(
          (announcementClipDuration(u.lang, u.text, u.voice) ?? 0) > 0,
          `${where} : « ${u.text} » sans clip`,
        );
      }
      // Elle doit rester finie avant la mélodie la plus précoce, sinon la gare
      // parlerait encore quand le morceau part.
      const d = durationOf(items);
      assert.ok(d < MELODY_START_MIN, `${where} : arrivée de ${d.toFixed(1)} s`);
    }
    // Et à Shibuya, elle est nettement plus longue qu'ailleurs : c'est
    // précisément ce qui peut repousser un message facultatif hors de son sens.
    const withNotice = durationOf(arrivalItems(shibuya, direction));
    const plain = durationOf(arrivalItems(STATIONS.findIndex((st) => st.jy === 'JY06'), direction));
    assert.ok(
      withNotice > plain * 2,
      `Shibuya ${withNotice.toFixed(1)} s contre ${plain.toFixed(1)} s ailleurs`,
    );
  }
});

test('« laissez descendre » n’est diffusé que s’il tient dans son créneau', () => {
  // Le message a l'air d'être en tête de l'arrêt, mais il passe DERRIÈRE
  // l'annonce d'arrivée : à Shibuya, le nom de la gare puis la consigne d'écart
  // en japonais et en anglais. La décision est celle de systems/stationPa
  // (optionalMessagePlays), avec les durées réellement gravées.
  const shibuya = STATIONS.findIndex((st) => st.jy === 'JY20');
  const alight = durationOf(platformAlightFirstAnnouncement());
  assert.ok(alight > 0, '« laissez descendre » sans clip');

  for (const direction of DIRECTIONS) {
    const queue = durationOf(arrivalItems(shibuya, direction));
    const openAt = 0.4 + 0.85 + 0.6; // ouverture + retard des baies palières
    const untilMelody = MELODY_START_MIN - openAt;

    // Prévu par le plan, file vide : il passe.
    assert.equal(optionalMessagePlays(true, alight, 0, untilMelody), true);

    // Non retenu par le plan : rien, même avec tout le temps du monde.
    assert.equal(optionalMessagePlays(false, alight, 0, untilMelody), false);
    assert.equal(optionalMessagePlays(false, alight, 0, 60), false);

    // Derrière la séquence d'arrivée de Shibuya sur l'arrêt le plus court : il
    // ne tient pas, et il est ABANDONNÉ plutôt que repoussé sur la mélodie.
    assert.equal(
      optionalMessagePlays(true, alight, queue, untilMelody),
      false,
      `Shibuya ${direction} : ${queue.toFixed(1)} s de file pour ${untilMelody.toFixed(1)} s`,
    );

    // Sur un arrêt qui prend son temps (mélodie à 25 s après l'arrêt), la même
    // file lui laisse la place : la décision suit le créneau, pas la gare.
    const longStop = 25 - 1 - openAt;
    assert.equal(optionalMessagePlays(true, alight, queue, longStop), true);

    // Et il ne déborde jamais : la limite est exactement la marge de silence.
    const exact = queue + alight + ANNOUNCEMENT_MARGIN;
    assert.equal(optionalMessagePlays(true, alight, queue, exact), true);
    assert.equal(optionalMessagePlays(true, alight, queue, exact - 0.01), false);
  }

  // Une gare sans consigne locale, elle, laisse largement la place même sur
  // l'arrêt le plus court : le message n'a pas disparu, c'est bien la longueur
  // de la file qui décide.
  const plainQueue = durationOf(arrivalItems(STATIONS.findIndex((st) => st.jy === 'JY06'), 'inner'));
  assert.equal(optionalMessagePlays(true, alight, plainQueue, MELODY_START_MIN - 1.85), true);
});

test('les deux points d’écoute partagent l’instant du premier message d’agent', () => {
  // Le quai et la rame entendent la MÊME sonorisation : si l'un déclenche la
  // première consigne d'agent à la cinquième seconde et l'autre à la sixième, le
  // même haut-parleur dit deux choses différentes selon l'endroit où l'on se
  // tient. L'instant n'a donc qu'une seule définition, et ces deux modules la
  // lisent - ils ne la redéclarent pas.
  const cycle = readSystem('stationCycle.ts');
  const wait = readSystem('platformWait.ts');

  for (const [name, src] of [
    ['stationCycle.ts', cycle],
    ['platformWait.ts', wait],
  ]) {
    assert.ok(
      /PLATFORM_SCHEDULE\.agentExchangeAt|agentExchangeAt: AGENT_EXCHANGE_AT/.test(src),
      `${name} ne lit pas PLATFORM_SCHEDULE.agentExchangeAt`,
    );
  }

  // Les lignes qui ARMENT le premier message (une dans le cycle, une dans
  // l'attente sur le quai, plus leurs reprises de spawn) passent toutes par la
  // constante et ne contiennent plus de seuil écrit à la main.
  const triggers = [...cycle.split('\n'), ...wait.split('\n')].filter((line) =>
    /'pa-agent'|'agent-1'/.test(line),
  );
  assert.ok(triggers.length >= 4, `déclencheurs trouvés : ${triggers.length}`);
  for (const line of triggers) {
    assert.ok(line.includes('AGENT_EXCHANGE_AT'), `seuil écrit à la main : ${line.trim()}`);
    assert.ok(
      !/t\s*>=?\s*\d/.test(line),
      `valeur codée en dur pour le premier message d'agent : ${line.trim()}`,
    );
  }

  // Et la valeur elle-même est bien celle du créneau partagé - pas l'ancien 6.
  assert.equal(PLATFORM_SCHEDULE.agentExchangeAt, 5);
});

test('les deux annonces de fermeture se répondent, des deux côtés de la porte', () => {
  // Une fermeture, deux voix : le chef de train d'abord, la gare PA_CLOSE_LAG
  // plus tard - elle seule nomme la voie. L'échange ne dépend pas de l'endroit
  // où l'on se tient, il dépend de la porte ouverte.
  //
  // La régression que ce test verrouille : l'attente sur le quai ne déclenchait
  // QUE la voix de la gare. La rame se taisait dès qu'on posait le pied dehors,
  // alors que la gare, elle, s'entend très bien depuis la voiture - la
  // sonorisation n'était réciproque que dans un sens.
  const cycle = readSystem('stationCycle.ts');
  const wait = readSystem('platformWait.ts');

  // Le déclencheur et son corps : la clé tient sur une ligne, l'appel qu'elle
  // arme sur la ou les suivantes.
  const trigger = (src, key) => {
    const lines = src.split('\n');
    const at = lines.findIndex((l) => l.includes(`once('${key}'`));
    return at < 0 ? null : lines.slice(at, at + 3).join('\n');
  };

  for (const [name, src] of [
    ['stationCycle.ts', cycle],
    ['platformWait.ts', wait],
  ]) {
    const cabin = trigger(src, 'announce-close');
    assert.ok(cabin, `${name} ne déclenche pas l'annonce de fermeture de la rame`);
    assert.ok(
      cabin.includes('doorsClosingAnnouncement()'),
      `${name} n'arme pas la voix de la RAME sur 'announce-close' : ${cabin}`,
    );
    const station = trigger(src, 'pa-close');
    assert.ok(station, `${name} ne déclenche pas celle de la gare`);
    assert.ok(
      station.includes('paDoorsClosing('),
      `${name} n'arme pas la voix de la GARE sur 'pa-close' : ${station}`,
    );
    // Les deux lisent le même retard : un 1,2 écrit à la main dans l'un des
    // deux modules ferait dériver l'échange d'un point d'écoute à l'autre.
    assert.ok(
      station.includes('PA_CLOSE_LAG'),
      `retard écrit à la main dans ${name} : ${station.trim()}`,
    );
    // Et la reprise de spawn / de descente arme bien les deux clés, sans quoi
    // l'une des deux annonces se rejouerait en entrant dans l'état.
    assert.ok(
      src.includes("fired.add('announce-close')") && src.includes("fired.add('pa-close')"),
      `${name} ne rattrape pas les deux annonces déjà passées`,
    );
  }

  // La voix de la rame passe AVANT celle de la gare, jamais l'inverse.
  assert.ok(PA_CLOSE_LAG > 0);

  // Et elle a fini avant la fin du dwell : depuis le quai, la file de la rame
  // est coupée au départ (systems/platformWait, entrée en 'departing') - une
  // annonce plus longue que son avance partirait avec le train.
  const cabinClose = durationOf(doorsClosingAnnouncement());
  assert.ok(cabinClose > 0, 'annonce de fermeture de bord sans clip');
  assert.ok(
    cabinClose <= CLOSE_ANNOUNCE_LEAD,
    `annonce de bord : ${cabinClose.toFixed(1)} s pour ${CLOSE_ANNOUNCE_LEAD} s d'avance`,
  );
});

test('un message d’agent tient dans l’échange, même sur l’arrêt le plus court', () => {
  // Premier créneau : de la 5e seconde du dwell à la mélodie la plus précoce.
  const cutoff = MELODY_START_MIN - PLATFORM_SCHEDULE.agentExchangeAt;
  for (let i = 0; i < PLATFORM_AGENT_MESSAGES.length; i++) {
    const d = durationOf(platformAgentMessage(i));
    assert.ok(d > 0, `message d'agent ${i} sans clip`);
    assert.ok(
      fitsBeforeCutoff(d, 0, cutoff),
      `« ${PLATFORM_AGENT_MESSAGES[i].text} » : ${d.toFixed(1)} s pour ${cutoff} s`,
    );
  }
});

test('un second message qui déborderait sur la mélodie est abandonné', () => {
  // Deuxième créneau : 9 s avant la mélodie. Un message court passe ; le même
  // message derrière une file encore pleine, non.
  const lead = PLATFORM_SCHEDULE.agentPreMelodyLead;
  const shortest = Math.min(
    ...PLATFORM_AGENT_MESSAGES.map((_m, i) => durationOf(platformAgentMessage(i))),
  );
  assert.ok(fitsBeforeCutoff(shortest, 0, lead));
  assert.equal(fitsBeforeCutoff(shortest, lead, lead), false);
  // Et jamais rien ne sort à moins d'une marge de silence de la première note.
  const longest = Math.max(
    ...PLATFORM_AGENT_MESSAGES.map((_m, i) => durationOf(platformAgentMessage(i))),
  );
  assert.equal(fitsBeforeCutoff(longest, 0, longest + ANNOUNCEMENT_MARGIN - 0.01), false);
  assert.equal(fitsBeforeCutoff(longest, 0, longest + ANNOUNCEMENT_MARGIN), true);
});

test('aucune annonce de quai ne survit au départ de la rame', () => {
  // La dernière chose que la gare dit à cette rame est l'annonce de fermeture,
  // lancée 13 − 1,2 s avant la fin du dwell (systems/stationCycle,
  // CLOSE_ANNOUNCE_LEAD − PA_CLOSE_LAG, clé 'pa-close'). La rame s'ébranle
  // DEPART_HOLD après.
  // Rien ne doit courir au-delà : quand on est à bord, quitter le dwell coupe la
  // file du quai (cancelSpeech('platform')), et une annonce coupée est une
  // annonce perdue.
  const window = CLOSE_ANNOUNCE_LEAD - PA_CLOSE_LAG + DEPART_HOLD;
  for (const direction of DIRECTIONS) {
    for (let platform = 1; platform <= 6; platform++) {
      const d = durationOf(platformDoorsClosingAnnouncement(platform, direction));
      if (d === 0) continue; // voie inexistante dans ce sens
      assert.ok(d <= window, `voie ${platform} (${direction}) : ${d.toFixed(1)} s pour ${window} s`);
    }
  }
  // Et le second message d'agent, lui, est fini avant même la mélodie - donc
  // très loin du départ (voir le test précédent).
  assert.ok(PLATFORM_SCHEDULE.agentPreMelodyLead > 0);
});

test('les deux créneaux d’agent ne se chevauchent pas sur un arrêt ordinaire', () => {
  // Arrêt de référence (mélodie à 20 s après l'arrêt, soit 19 s de dwell) : le
  // premier message a fini bien avant que le second ne soit envisagé.
  const melodyStart = 20 - 1;
  const secondAt = melodyStart - PLATFORM_SCHEDULE.agentPreMelodyLead;
  const longest = Math.max(
    ...PLATFORM_AGENT_MESSAGES.map((_m, i) => durationOf(platformAgentMessage(i))),
  );
  assert.ok(
    PLATFORM_SCHEDULE.agentExchangeAt + longest <= secondAt,
    `premier message jusqu'à ${(PLATFORM_SCHEDULE.agentExchangeAt + longest).toFixed(1)} s, second à ${secondAt} s`,
  );
});
