// La machine à états de l'afficheur de bord (three/lineScreenStates).
//
// Ces tests EXÉCUTENT la rotation. C'est le point : la version précédente
// cherchait des noms de variables dans le source, ce qui ne dit rien de ce que
// la rame affiche à la trentième seconde de freinage. La rotation a donc été
// sortie de `lineScreenCycle` - qui tient à zustand et au document, absents du
// harnais - dans un module pur que Node charge tel quel.
//
// Ce qu'on protège, ce sont trois endroits où deux choses différentes portaient
// le même nom :
//
//  1. la LANGUE du passage et le CONTENU du bandeau bas. Le code peignait le
//     côté d'ouverture des portes sur le passage japonais et les
//     correspondances sur le passage anglais : un anglophone n'apprenait jamais
//     par quelle paroi descendre, un japonophone voyait le côté d'ouverture
//     annoncé dix stations trop tôt ;
//  2. le MOMENT du trajet et le libellé du bandeau. L'information trafic disait
//     「ただいま」 en dur, en pleine croisière ;
//  3. ce qui est RELEVÉ et ce qui est SUPPOSÉ. Les intervalles à avis de
//     campagne sont une approximation, et doivent se dire comme telle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NOTICE_SEGMENTS,
  computeLineScreenFrame,
  segmentEntries,
  segmentKey,
  segmentNotices,
  type LineScreenFrame,
  type LineScreenInput,
} from '../src/three/lineScreenStates.ts';
import { STATIONS } from '../src/data/stations.ts';
import { prevStation } from '../src/data/loop.ts';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

/** Un train par défaut : en marche vers 秋葉原, sans incident ni perturbation. */
function train(over: Partial<LineScreenInput> = {}): LineScreenInput {
  return {
    index: 2,
    phase: 'cruise',
    direction: 'inner',
    clockMin: 0,
    clock: '0:00',
    countdown: 60,
    emergency: { stage: 'none', kind: 'brake', reason: 0 },
    notice: null,
    ...over,
  };
}

/** Un tour complet de rotation : ce que l'écran montre, battement par battement. */
function cycle(over: Partial<LineScreenInput> = {}, beats = 16): LineScreenFrame[] {
  const out: LineScreenFrame[] = [];
  for (let t = 0; t < beats; t++) out.push(computeLineScreenFrame(train({ ...over, clockMin: t / 4 })));
  return out;
}

/** Étiquette lisible d'une image, pour les comparaisons de rotation. */
function label(f: LineScreenFrame): string {
  return f.state === 'stationLayout'
    ? `stationLayout:${f.mode}:${f.lang}/${f.status}`
    : `${f.state}/${f.status}`;
}

test('en marche, la rotation porte le plan des sorties avec correspondances', () => {
  const frames = cycle();
  const layouts = frames.filter((f) => f.state === 'stationLayout');
  assert.ok(layouts.length > 0, 'le plan des sorties ne passe jamais en croisière');
  for (const f of layouts) {
    assert.equal(f.state === 'stationLayout' && f.mode, 'transfers');
    assert.equal(f.status, 'next', 'le plan de croisière ne dit pas 次は');
  }
  // Les deux passages du plan des sorties sont attestés (figure 6 Hitachi) : le
  // cycle les porte tous les deux.
  const langs = new Set(layouts.map((f) => (f.state === 'stationLayout' ? f.lang : '')));
  assert.deepEqual([...langs].sort(), ['en', 'jp']);
  // Et le côté d'ouverture ne s'invite pas dans la croisière.
  assert.ok(
    !frames.some((f) => f.state === 'stationLayout' && f.mode === 'doors'),
    'le côté d’ouverture passe en pleine croisière',
  );
});

test('à l’approche immédiate, le plan des portes et rien d’autre', () => {
  const frames = cycle({ phase: 'brake' }, 12);
  for (const f of frames) {
    assert.equal(f.state, 'stationLayout');
    assert.equal(f.state === 'stationLayout' && f.mode, 'doors');
    assert.equal(f.status, 'soon');
    assert.equal(f.state === 'stationLayout' && f.lang, 'jp');
  }
  // Un seul écran sur douze battements : il n'alterne avec rien.
  assert.equal(new Set(frames.map(label)).size, 1);
});

test('à quai, le plan des équipements passe sous ただいま', () => {
  const frames = cycle({ phase: 'dwell' }, 12);
  const layouts = frames.filter((f) => f.state === 'stationLayout');
  assert.ok(layouts.length > 0, 'le plan des équipements disparaît à quai');
  for (const f of layouts) {
    assert.equal(f.state === 'stationLayout' && f.mode, 'transfers');
    assert.equal(f.status, 'now');
  }
  // Jamais まもなく une fois la rame arrêtée, jamais le côté d'ouverture.
  assert.ok(!frames.some((f) => f.status === 'soon'), 'まもなく reste affiché à quai');
  assert.ok(
    !frames.some((f) => f.state === 'stationLayout' && f.mode === 'doors'),
    'le côté d’ouverture est annoncé portes déjà ouvertes',
  );
  // Le plan porte la gare où l'on EST : à quai, `index` est cette gare-là.
  for (const f of layouts) assert.equal(f.index, 2);
});

test('l’information trafic reçoit le statut réel du moment', () => {
  const notice = { lineJp: '中央線快速', lineEn: 'Chuo Line (Rapid)', reasonJp: '信号確認', reasonEn: 'a signal check' };
  const cruising = cycle({ notice }, 24).filter((f) => f.state.startsWith('traffic'));
  assert.ok(cruising.length > 0, 'l’information trafic ne passe jamais en croisière');
  for (const f of cruising) {
    assert.equal(f.status, 'next', 'l’avis dit encore ただいま en pleine marche');
  }
  // Les deux pages se suivent : la japonaise puis le tableau anglais.
  const order = cycle({ notice }, 24).map((f) => f.state);
  const jp = order.indexOf('trafficJP');
  assert.equal(order[jp + 1], 'trafficEN', 'les deux pages de l’avis sont séparées');
});

test('les deux sens gardent la bonne rotation et les mêmes intervalles', () => {
  for (const direction of ['inner', 'outer'] as const) {
    const frames = cycle({ direction });
    assert.ok(frames.some((f) => f.state === 'stationLayout'), `plan des sorties absent en ${direction}`);
    assert.ok(frames.some((f) => f.state === 'loopEN'), `plan de boucle anglais absent en ${direction}`);
  }
  // Un avis appartient à un INTERVALLE, pas à un sens : la même paire de gares
  // le diffuse qu'on la parcoure dans un sens ou dans l'autre.
  for (let index = 0; index < 30; index++) {
    for (const dir of ['inner', 'outer'] as const) {
      const from = STATIONS[prevStation(index, dir)].jy;
      const key = segmentKey(from, STATIONS[index].jy);
      const other = dir === 'inner' ? 'outer' : 'inner';
      // La gare visée qui donne le MÊME intervalle dans l'autre sens est celle
      // d'où l'on vient ici.
      const mirror = segmentNotices(prevStation(index, dir), other);
      const mine = segmentNotices(index, dir);
      assert.deepEqual(mine, mirror, `l’intervalle ${key} diffère selon le sens`);
    }
  }
});

test('un segment sans avis n’en diffuse aucun, un segment approché est reconnaissable', () => {
  // 東京 → 神田 : aucun secteur cité par la source.
  assert.deepEqual(segmentNotices(1, 'inner'), []);
  assert.deepEqual(segmentEntries(1, 'inner'), []);
  const plain = cycle({ index: 1 }, 24);
  for (const forbidden of ['securityJP', 'securityEN', 'priority', 'manner']) {
    assert.ok(!plain.some((f) => f.state === forbidden), `${forbidden} passe sur un segment non configuré`);
  }

  // 巣鴨 → 大塚 : secteur cité, donc avis - mais approché, jamais relevé.
  const entries = segmentEntries(11, 'inner');
  assert.ok(entries.length > 0, 'le secteur de 大塚 ne diffuse plus rien');
  for (const seg of entries) {
    assert.notEqual(seg.confidence, 'confirmed', 'un intervalle supposé est donné pour relevé');
    assert.ok(seg.source.length > 0, 'un intervalle sans provenance');
  }
  assert.deepEqual(segmentNotices(11, 'inner'), ['securityJP', 'securityEN']);

  // Aucune entrée de la table n'est aujourd'hui confirmée : si l'une le devient,
  // c'est qu'une capture est arrivée - et ce test doit être relu, pas contourné.
  assert.equal(
    NOTICE_SEGMENTS.filter((s) => s.confidence === 'confirmed').length,
    0,
    'un intervalle est marqué confirmé : la capture qui l’établit doit être citée',
  );
  assert.ok(
    NOTICE_SEGMENTS.every((s) => s.confidence === 'estimated'),
    'la table mélange des niveaux de confiance sans le dire',
  );
});

test('les deux pages de la vigilance renforcée restent ensemble', () => {
  const order = cycle({ index: 11 }, 24).map((f) => f.state);
  const jp = order.indexOf('securityJP');
  assert.ok(jp >= 0, 'la vigilance renforcée ne passe pas sur son secteur');
  assert.equal(order[jp + 1], 'securityEN', 'les deux pages de l’avis sont séparées');
});

test('l’incident remplace la rotation à toutes les phases', () => {
  for (const phase of ['cruise', 'brake', 'dwell', 'depart'] as const) {
    for (const [emergency, expected] of [
      [{ stage: 'braking', kind: 'brake', reason: 0 }, 'brake'],
      [{ stage: 'stopped', kind: 'brake', reason: 2 }, 'emergency'],
      [{ stage: 'stopped', kind: 'outage', reason: 0 }, 'outage'],
      [{ stage: 'resuming', kind: 'outage', reason: 0 }, 'outage'],
    ] as const) {
      const f = computeLineScreenFrame(train({ phase, emergency }));
      assert.equal(f.state, expected, `${phase} + ${emergency.stage}/${emergency.kind}`);
    }
  }
  // Et le motif remonte, pour l'annonce qui l'accompagne.
  assert.equal(
    computeLineScreenFrame(train({ emergency: { stage: 'stopped', kind: 'brake', reason: 3 } })).emergencyReason,
    3,
  );
});

test('la rotation est déterministe : même instant, même écran', () => {
  for (const t of [0, 1, 7, 13, 41]) {
    const a = computeLineScreenFrame(train({ clockMin: t / 4 }));
    const b = computeLineScreenFrame(train({ clockMin: t / 4 }));
    assert.deepEqual(a, b);
  }
});

test('les anciens noms d’états ont disparu du dépôt', () => {
  // Le seul garde-fou textuel qui reste, et il porte sur des noms qui mêlaient
  // la langue au contenu : ils ne doivent revenir nulle part.
  for (const rel of [
    'src/three/lineScreenStates.ts',
    'src/three/lineScreenCycle.ts',
    'src/three/lineScreen.ts',
    'lcd-probe.html',
  ]) {
    const source = readFileSync(resolvePath(ROOT, rel), 'utf8');
    for (const dead of ['approachJP', 'approachEN', 'drawApproach', 'exitTransfersEN', 'exitDoorsJP']) {
      assert.ok(!source.includes(dead), `${rel} référence encore ${dead}`);
    }
  }
});
