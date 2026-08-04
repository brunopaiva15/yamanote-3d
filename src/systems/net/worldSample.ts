// Traduire le monde en messages, et les messages en monde.
//
// Séparé de `worldSync` pour une raison très concrète : `worldSync` orchestre,
// donc il importe `stationCycle` - qui tire derrière lui le moteur audio, le
// rendu des annonces et, en bout de chaîne, `import.meta.env`. Il n'est donc
// pas chargeable sous `node --test`.
//
// Or ce qu'il faut absolument éprouver ici, ce sont les CONVERSIONS. Une erreur
// d'unité sur `phaseT` - secondes au lieu de millisecondes - donnerait une
// resynchronisation dure à chaque paquet, donc un carillon toutes les demi-
// secondes ; et c'est le genre d'erreur qu'on ne voit qu'à deux, tard, et qu'on
// attribue d'abord au réseau.
//
// Ce fichier ne dépend donc que du runtime, du store et du protocole. Il se
// charge seul, et il se teste (tests/netWorldSync).

import type { LoopDirection } from '../../data/platforms';
import { useStore, type Phase } from '../../store';
import { runtime } from '../runtime';
// Import de TYPE, donc effacé à la compilation : il ne crée aucune arête réelle
// vers `stationCycle`, et ce fichier reste chargeable seul (voir l'en-tête, et
// tests/netSourceGuards).
import type { WorldSnapshot } from '../stationCycle';
import {
  BLOCKER_BITS,
  PROTOCOL_VERSION,
  type StopPayload,
  type TickPayload,
} from './protocol';
import { currentStopDraws, currentStopSeq, type StopDraws } from './worldDecisions';

export function blockerBits(): number {
  const b = runtime.departureBlockers;
  return (
    (b.doorBlocked ? BLOCKER_BITS.doorBlocked : 0) |
    (b.heldAtStation ? BLOCKER_BITS.heldAtStation : 0) |
    (b.signalStop ? BLOCKER_BITS.signalStop : 0) |
    (b.emergency ? BLOCKER_BITS.emergency : 0) |
    (b.passengerAssistance ? BLOCKER_BITS.passengerAssistance : 0)
  );
}

/** L'état de la ligne, tel qu'on le met sur le fil. */
export function sampleTick(seq: number, from: string): TickPayload {
  const s = useStore.getState();
  const d = runtime.tokyoDate;
  return {
    v: PROTOCOL_VERSION,
    from,
    seq,
    ph: s.phase,
    // Millisecondes entières : voir protocol, sur la quantification.
    pt: Math.round(runtime.phaseT * 1000),
    ix: s.index,
    pix: s.platformIndex,
    ds: s.doorSide,
    dir: s.loopDirection,
    sp: Math.round(runtime.speed * 1000),
    ac: Math.round(runtime.accel * 1000),
    di: Math.round(runtime.distance * 100),
    dsd: Math.round(runtime.departStartDist * 100),
    ck: Math.round(runtime.clockMin * 100),
    dt: [d.year, d.month, d.day, d.weekday],
    ss: runtime.stopSequence,
    bl: blockerBits(),
  };
}

/** Un battement reçu, ramené aux unités du jeu. */
export function tickToSnapshot(m: TickPayload): WorldSnapshot {
  return {
    phase: m.ph as Phase,
    phaseT: m.pt / 1000,
    index: m.ix,
    platformIndex: m.pix,
    doorSide: m.ds,
    loopDirection: m.dir as LoopDirection,
    clockMin: m.ck / 100,
    tokyoDate: { year: m.dt[0], month: m.dt[1], day: m.dt[2], weekday: m.dt[3] },
    distance: m.di / 100,
    departStartDist: m.dsd / 100,
    stopSequence: m.ss,
  };
}

/** Les tirages de l'arrêt courant, prêts à publier. `null` s'ils sont incomplets. */
export function sampleStop(from: string): StopPayload | null {
  const d = currentStopDraws();
  if (
    d.berthOffset === undefined ||
    d.melodyJitter === undefined ||
    d.doorSeed === undefined ||
    d.alternativePlatform === undefined ||
    d.passThrough === undefined
  ) {
    // L'arrêt n'a pas fini de tirer : on ne publie pas un paquet à trous, qui
    // ferait croire au suiveur qu'il a tout reçu alors qu'il lui manque de quoi
    // poser sa rame au bon endroit.
    return null;
  }
  return {
    v: PROTOCOL_VERSION,
    from,
    // Le numéro de l'arrêt DÉCRIT, et non celui qu'on vit : le paquet part une
    // gare à l'avance, alors que `runtime.stopSequence` en est encore à
    // l'arrêt précédent. L'estampiller du numéro courant faisait arriver chez
    // les autres les tirages de la gare d'avant.
    ss: currentStopSeq(),
    ix: useStore.getState().index,
    seed: d.doorSeed,
    berth: Math.round(d.berthOffset * 1000),
    jitter: Math.round(d.melodyJitter * 1_000_000),
    alt: d.alternativePlatform ? 1 : 0,
    pass: d.passThrough ? 1 : 0,
  };
}

/** Un paquet de tirages reçu, ramené aux unités de l'oracle. */
export function stopToDraws(m: StopPayload): StopDraws {
  return {
    berthOffset: m.berth / 1000,
    alternativePlatform: m.alt === 1,
    melodyJitter: m.jitter / 1_000_000,
    doorSeed: m.seed,
    passThrough: m.pass === 1,
  };
}
