// La chronologie sonore du quai : ce qui ne doit jamais se marcher dessus.
//
// La sono du quai n'a qu'une file (systems/speech, canal 'platform') : deux
// annonces ne peuvent pas sonner en même temps, mais la seconde peut très bien
// sortir trop tard — par-dessus la mélodie, après la fermeture des portes
// qu'elle demandait de dégager, ou sur le carillon du train qui arrive. C'est le
// vrai risque une fois les messages devenus facultatifs : ce qui n'est pas
// obligatoire doit être ABANDONNÉ plutôt que repoussé.
//
// Ce fichier croise donc trois choses qui peuvent diverger en silence : la
// chronologie (PLATFORM_SCHEDULE), la longueur RÉELLE des clips gravés
// (pa-manifest) et les bornes du dwell (systems/stationCycle, dont les valeurs
// sont rappelées ici — le module tire tout le moteur audio et n'est pas
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
} = await import('../src/systems/platformAnnouncementPlan.ts');
const { announcementClipDuration } = await import('../src/data/announcementClips.ts');
const {
  PLATFORM_AGENT_MESSAGES,
  PLATFORM_DELAY_CAUSES,
  platformAgentMessage,
  platformApproachAnnouncement,
  platformDelayAnnouncement,
  platformGreeting,
  platformPreAnnouncement,
} = await import('../src/data/stationAnnouncements.ts');
const { STATIONS } = await import('../src/data/stations.ts');
const { platformFor } = await import('../src/data/platforms.ts');
const { DEPART_HOLD } = await import('../src/systems/trainPhysics.ts');
const { platformDoorsClosingAnnouncement } = await import(
  '../src/data/stationAnnouncements.ts'
);

const DIRECTIONS = ['inner', 'outer'] as const;

/** Durée gravée d'une séquence (s) ; 0 pour un texte sans clip. */
const durationOf = (items) =>
  items.reduce((s, u) => s + (announcementClipDuration(u.lang, u.text, u.voice) ?? 0), 0);

/**
 * Bornes du dwell rappelées de systems/stationCycle : le plus tôt où la mélodie
 * peut partir, une fois retirée la seconde écoulée avant l'entrée en dwell.
 * (MELODY_AFTER_STOP_MIN = 15 s, STOP_TO_DWELL_T0 = 1 s.)
 */
const MELODY_START_MIN = 15 - 1;

/** Creux le plus court entre deux rames (systems/platformWait, HEADWAY_GAP). */
const HEADWAY_GAP = 60;

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
  // L'anglais, lui, peut courir sur l'entrée en gare — c'est ce qui se passe
  // sur un vrai quai, où la version anglaise finit souvent devant la rame déjà
  // à l'arrêt. Ce qui ne doit pas arriver, c'est qu'elle déborde jusqu'à
  // l'annonce du nom de la gare, une trentaine de secondes plus loin.
  const untilArrival = PLATFORM_SCHEDULE.approachBefore;
  for (const direction of DIRECTIONS) {
    for (let i = 0; i < STATIONS.length; i++) {
      const platform = platformFor(STATIONS[i].jy, direction)?.platform ?? 1;
      const items = platformApproachAnnouncement(i, platform, direction);
      const jp = durationOf(items.filter((u) => u.lang === 'ja-JP'));
      const all = durationOf(items);
      const where = `${STATIONS[i].jy} (${direction})`;
      assert.ok(jp > 0, `annonce d'approche sans clip à ${where}`);
      assert.ok(jp <= untilArrival, `${where} : japonais ${jp.toFixed(1)} s pour ${untilArrival} s`);
      assert.ok(all <= untilArrival + 12, `${where} : ${all.toFixed(1)} s au total`);
    }
  }
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
  // fitsBeforeCutoff) — jamais joué en retard.
  const cutoff = HEADWAY_GAP - PLATFORM_SCHEDULE.approachBefore - PLATFORM_SCHEDULE.preAnnounceAt;
  let fitting = 0;
  for (const direction of DIRECTIONS) {
    for (let i = 0; i < STATIONS.length; i++) {
      const platform = platformFor(STATIONS[i].jy, direction)?.platform ?? 1;
      const alone = durationOf(platformPreAnnouncement(i, platform, direction));
      const withGreeting =
        durationOf(platformGreeting(direction)) + alone;
      assert.ok(alone > 0, `anticipée sans clip à ${STATIONS[i].jy} (${direction})`);
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
  // CLOSE_ANNOUNCE_LEAD, clé 'pa-close'). La rame s'ébranle DEPART_HOLD après.
  // Rien ne doit courir au-delà : quand on est à bord, quitter le dwell coupe la
  // file du quai (cancelSpeech('platform')), et une annonce coupée est une
  // annonce perdue.
  const CLOSE_ANNOUNCE_LEAD = 13;
  const window = CLOSE_ANNOUNCE_LEAD - 1.2 + DEPART_HOLD;
  for (const direction of DIRECTIONS) {
    for (let platform = 1; platform <= 6; platform++) {
      const d = durationOf(platformDoorsClosingAnnouncement(platform, direction));
      if (d === 0) continue; // voie inexistante dans ce sens
      assert.ok(d <= window, `voie ${platform} (${direction}) : ${d.toFixed(1)} s pour ${window} s`);
    }
  }
  // Et le second message d'agent, lui, est fini avant même la mélodie — donc
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
