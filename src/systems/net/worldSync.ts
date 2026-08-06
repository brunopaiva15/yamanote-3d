// Le monde partagé : ce que l'hôte publie, et ce qu'un suiveur en fait.
//
// --- Ce que ce module NE fait PAS -------------------------------------------
//
// Il ne fait pas tourner le monde chez les suiveurs. C'est le point de
// conception qui commande tout le reste, et il vaut d'être répété ici : chaque
// client déroule sa PROPRE simulation, avec le même code et la même
// chronologie. Le réseau ne transporte que ce qui, en solo, sortirait de
// `Math.random()` - les tirages de l'arrêt (systems/net/worldDecisions) - plus
// un battement de rattrapage.
//
// Diffuser des positions à vingt fois par seconde et les recopier serait le
// réflexe, et ce serait le mauvais choix ici : la machine à états du train
// pilote le SON, et recopier `phaseT` de force à chaque paquet rejouerait ou
// couperait des annonces en permanence. Le battement ne sert donc qu'à corriger
// la dérive - en modulant l'horloge locale, jamais en l'affectant - et à faire
// entrer les retardataires.
//
// --- Pourquoi la marge suffit ----------------------------------------------
//
// Tous les tirages d'un arrêt partent à l'entrée en freinage, une vingtaine de
// secondes avant que le premier ne serve. C'est cette marge qui permet de se
// passer d'accusé de réception : un paquet perdu a le temps d'être redemandé
// (`hello`) avant que son absence ne s'entende.

import { useStore, type Phase } from '../../store';
import { runtime } from '../runtime';
import { cancelSpeech } from '../speech';
import { useSubtitles } from '../subtitles';
import { setDepartureBlockers } from '../departureSequence';
import {
  applyWorldSnapshot,
  beginEmergencyStop,
  beginPowerOutage,
  lastFiredAt,
} from '../stationCycle';
import { onIncident, onPopulation, type IncidentKind, type PopulationKind } from './incidents';
import { reconcile, warpDt, type Correction } from './reconcile';
import { deliverRoomMessage, isHost, onRoomMessage, roomSend, useRoom } from './room';
import {
  BLOCKER_BITS,
  PROTOCOL_VERSION,
  validEvent,
  validPop,
  validStop,
  validTick,
  type EventPayload,
  type PopPayload,
  type StopPayload,
  type TickPayload,
} from './protocol';
import {
  applyPaxPopulation,
  samplePaxPopulation,
} from '../passengers';
import {
  applyCrowdPopulation,
  sampleCrowdPopulation,
} from '../platformCrowd';
// L'échantillonnage vit à part : lui reste chargeable sans navigateur, donc
// testable, alors que ce fichier-ci tire tout `stationCycle` derrière lui.
import { blockerBits, sampleStop, sampleTick, stopToDraws, tickToSnapshot } from './worldSample';
import {
  applyStopDraws,
  clearDecisionDesync,
  decisionsDesynced,
  netRole,
  setNetRole,
} from './worldDecisions';

/** Cadence du battement de l'hôte (s). */
const TICK_PERIOD_S = 0.5;

/**
 * Un `hello` d'arrivant ne déclenche qu'une réponse, même si trois personnes
 * arrivent ensemble (ms).
 */
const HELLO_DEBOUNCE_MS = 500;

// --- État du module ---------------------------------------------------------

let seqSortant = 0;
let seqEntrant = -1;
let depuisDernierTick = 0;
/** `stopSequence` pour lequel on a déjà publié le paquet de tirages. */
let stopPublie = -1;
/** Le dernier battement reçu, en attente d'application. */
let tickEnAttente: TickPayload | null = null;
/** Phase du dernier battement publié : un changement force une émission. */
let phasePubliee: Phase | null = null;
let dernierHello = 0;
let detacher: (() => void) | null = null;

/**
 * Correction en cours, relue à chaque image.
 *
 * Ce n'est pas la même chose que « la dernière correction calculée » : le
 * battement arrive deux fois par seconde et la boucle tourne soixante, donc la
 * correction s'applique sur une trentaine d'images. La recalculer à chaque
 * image donnerait le même résultat pour un coût inutile.
 */
let correction: Correction = { kind: 'none' };

export function netCorrection(): Correction {
  return correction;
}

// --- Réception --------------------------------------------------------------

function appliquerTick(m: TickPayload): void {
  // Un battement plus vieux que le dernier vu ne dit rien de neuf, et
  // l'appliquer ferait reculer le monde. Les messages d'un canal temps réel
  // n'arrivent pas dans un ordre garanti.
  if (m.seq <= seqEntrant) return;
  seqEntrant = m.seq;
  tickEnAttente = m;
}

function appliquerStop(m: StopPayload): void {
  // Un paquet qui ne concerne pas l'arrêt courant est ignoré : appliquer les
  // tirages de la gare précédente donnerait une rame qui s'arrête au bon
  // endroit pour la mauvaise gare, ce qui ne se remarque qu'aux portes
  // palières et ne se diagnostique jamais.
  //
  // Le cas NORMAL est `stopSequence + 1` : le paquet part au départ de la gare
  // précédente, une vingtaine de secondes avant que son premier nombre ne
  // serve. L'arrêt courant reste accepté, parce qu'un `hello` d'arrivant se
  // répond avec le paquet en cours, dwell compris.
  if (m.ss !== runtime.stopSequence && m.ss !== runtime.stopSequence + 1) return;
  applyStopDraws(stopToDraws(m), m.ss);
}

/**
 * La population de l'hôte, posée sur notre rame et sur notre quai.
 *
 * On refuse la foule d'une AUTRE gare : le message part au peuplement du quai,
 * et un suiveur qui aurait pris une gare d'avance la poserait sur le mauvais
 * béton. La rame, elle, n'a pas de gare - elle s'applique toujours.
 */
function appliquerPop(m: PopPayload): void {
  if (m.px.length > 0) applyPaxPopulation(m.px);
  // Une liste vide veut dire « je ne parle pas d'eux », et non « le quai est
  // désert » : c'est ainsi que la fin d'arrêt ne corrige que la rame.
  if (m.cr.length > 0 && m.st === useStore.getState().platformIndex) {
    applyCrowdPopulation(m.st, m.cr);
  }
}

function appliquerEvent(m: EventPayload): void {
  switch (m.k) {
    case 'emergency': {
      beginEmergencyStop();
      // Les valeurs de l'hôte écrasent celles que `beginEmergencyStop` vient de
      // tirer : chez un suiveur, l'oracle ne tire rien, mais ces deux-là ne
      // passent pas par lui (voir worldDecisions, sur les incidents).
      runtime.emergencyStop.holdFor = m.hold / 1000;
      runtime.emergencyStop.reason = m.reason;
      break;
    }
    case 'outage': {
      beginPowerOutage();
      runtime.emergencyStop.holdFor = m.hold / 1000;
      break;
    }
    case 'blockers': {
      setDepartureBlockers({
        doorBlocked: (m.bits & BLOCKER_BITS.doorBlocked) !== 0,
        heldAtStation: (m.bits & BLOCKER_BITS.heldAtStation) !== 0,
        signalStop: (m.bits & BLOCKER_BITS.signalStop) !== 0,
        emergency: (m.bits & BLOCKER_BITS.emergency) !== 0,
        passengerAssistance: (m.bits & BLOCKER_BITS.passengerAssistance) !== 0,
      });
      break;
    }
    case 'hello': {
      // Un arrivant demande l'état. Seul l'hôte répond, et pas plus d'une fois
      // par demi-seconde : une salve d'arrivées ne doit pas produire une salve
      // de réponses.
      if (!isHost()) return;
      const now = Date.now();
      if (now - dernierHello < HELLO_DEBOUNCE_MS) return;
      dernierHello = now;
      publierTick(true);
      publierStop(true);
      // Et les gens : un arrivant n'a aucun moyen de les deviner, eux ne
      // découlent d'aucune chronologie.
      publierPopulation('both');
      break;
    }
    default:
      // `detach` / `attach` / `disruption` : traités ailleurs (le premier par
      // le roster de présence, le dernier n'est pas encore branché).
      break;
  }
}

// --- Émission ---------------------------------------------------------------

function publierTick(force = false): void {
  const s = useStore.getState();
  // Un changement de phase part TOUT DE SUITE et n'attend pas le prochain
  // battement : c'est l'instant où un suiveur risque le plus de diverger, et
  // une demi-seconde de retard sur un passage en `dwell` vaut une demi-seconde
  // de portes désaccordées.
  if (!force && depuisDernierTick < TICK_PERIOD_S && s.phase === phasePubliee) return;
  depuisDernierTick = 0;
  phasePubliee = s.phase;
  seqSortant += 1;
  roomSend('tick', sampleTick(seqSortant, useRoom.getState().selfId) as unknown as Record<string, unknown>);
}

function publierStop(force = false): void {
  const paquet = sampleStop(useRoom.getState().selfId);
  if (!paquet) return;
  // On se garde sur le numéro DU PAQUET, et non sur `runtime.stopSequence` : le
  // paquet décrit l'arrêt à venir, pas celui qu'on vit. Comparé à l'arrêt
  // courant, ce garde-fou laissait passer un envoi par arrêt - mais jamais le
  // bon, et jamais au bon moment.
  if (!force && stopPublie === paquet.ss) return;
  stopPublie = paquet.ss;
  roomSend('stop', paquet as unknown as Record<string, unknown>);
}

/**
 * L'hôte signale un incident au moment où il le déclenche.
 *
 * Appelée par `stationCycle` à travers `net/incidents`, et non par un import
 * direct : le sens naturel des dépendances va du réseau vers le cycle (on lui
 * pose des instantanés), et l'import inverse refermait le graphe.
 */
function publishIncident(kind: IncidentKind): void {
  if (!isHost()) return;
  const em = runtime.emergencyStop;
  roomSend('event', {
    v: PROTOCOL_VERSION,
    from: useRoom.getState().selfId,
    k: kind,
    hold: Math.round(em.holdFor * 1000),
    reason: em.reason,
    coast: 0,
  });
}

/**
 * L'hôte publie qui est à bord et qui attend sur le quai.
 *
 * Appelée aux deux instants où la population vient de se fixer - le quai à
 * l'entrée en freinage, la rame une fois l'échange aux portes terminé - et à
 * l'arrivée d'un nouveau venu. Jamais plus : c'est un état, il ne se diffuse
 * pas en continu.
 */
function publierPopulation(kind: PopulationKind): void {
  if (!isHost()) return;
  roomSend('pop', {
    v: PROTOCOL_VERSION,
    from: useRoom.getState().selfId,
    st: useStore.getState().platformIndex,
    px: kind === 'crowd' ? [] : samplePaxPopulation(),
    cr: kind === 'pax' ? [] : sampleCrowdPopulation(),
  });
}

/** L'hôte signale un changement de blocage de départ. */
export function publishBlockers(): void {
  if (!isHost()) return;
  roomSend('event', {
    v: PROTOCOL_VERSION,
    from: useRoom.getState().selfId,
    k: 'blockers',
    bits: blockerBits(),
  });
}

// --- Les deux crochets de la boucle ----------------------------------------

/**
 * Applique ce qui est arrivé, AVANT que le cycle n'avance d'un pas.
 *
 * L'ordre compte : appliquer après ferait porter la correction sur une image
 * déjà écoulée, et le suiveur courrait perpétuellement une image derrière.
 */
export function netPumpIn(): void {
  if (netRole() !== 'follower') return;
  const m = tickEnAttente;
  if (!m) return;
  tickEnAttente = null;

  const local = {
    phase: useStore.getState().phase,
    phaseT: runtime.phaseT,
    index: useStore.getState().index,
    stopSequence: runtime.stopSequence,
  };
  const distant = {
    phase: m.ph as Phase,
    phaseT: m.pt / 1000,
    index: m.ix,
    stopSequence: m.ss,
  };

  // Un tirage manquant vaut une divergence : on ne laisse pas un suiveur
  // dérouler sa propre chronologie en silence.
  const force = decisionsDesynced();
  const suite = force ? ({ kind: 'hard' } as const) : reconcile(local, distant, lastFiredAt());

  if (suite.kind === 'hard') {
    // La coupure est franche par nature. On coupe la parole en cours et l'on
    // laisse `applyWorldSnapshot` réamorcer le jeu d'événements : mieux vaut
    // une phrase tranchée net qu'une phrase dédoublée.
    cancelSpeech();
    applyWorldSnapshot(tickToSnapshot(m));
    clearDecisionDesync();
    correction = { kind: 'none' };
    return;
  }
  correction = suite;
}

/**
 * Publie ce qu'il faut, une fois l'image écoulée.
 *
 * @param dt temps réellement consommé par le cycle sur cette image (s).
 */
export function netPumpOut(dt: number): void {
  const role = netRole();
  if (role === 'solo') return;
  depuisDernierTick += dt;
  if (role !== 'host') return;
  publierTick();
  publierStop();
}

/**
 * Le pas de temps du cycle, corrigé de la dérive.
 *
 * Une seule fonction pour les deux boucles (three/Engine et systems/audioLoop) :
 * une règle appliquée à deux endroits finit toujours par l'être de deux façons.
 */
export function netCycleDt(dt: number): number {
  return netRole() === 'follower' ? warpDt(dt, correction) : dt;
}

// --- Cycle de vie -----------------------------------------------------------

/** Branche l'écoute du monde. Idempotent. */
export function startWorldSync(): void {
  if (detacher) return;
  onIncident(publishIncident);
  onPopulation(publierPopulation);
  detacher = onRoomMessage((event, payload) => {
    // Retour après une coupure : notre horloge de phase a pris un retard
    // quelconque pendant le silence, et le premier battement qui arrivera
    // vaudra mieux que tout rattrapage en douceur. On redemande l'état et l'on
    // force la resynchronisation dure.
    if (event === 'resubscribed') {
      seqEntrant = -1;
      roomSend('event', { v: PROTOCOL_VERSION, from: useRoom.getState().selfId, k: 'hello' });
      return;
    }
    if (event === 'pop' && validPop(payload)) {
      // Les gens ne s'appliquent QUE chez un suiveur : l'hôte est la source.
      if (netRole() === 'follower') appliquerPop(payload as PopPayload);
      return;
    }
    if (event === 'tick' && validTick(payload)) appliquerTick(payload as TickPayload);
    else if (event === 'stop' && validStop(payload)) appliquerStop(payload as StopPayload);
    else if (event === 'event' && validEvent(payload)) appliquerEvent(payload as EventPayload);
  });
  // « Je viens d'arriver, redites-moi tout. » L'hôte répond hors cadence.
  roomSend('event', { v: PROTOCOL_VERSION, from: useRoom.getState().selfId, k: 'hello' });
}

export function stopWorldSync(): void {
  onIncident(null);
  onPopulation(null);
  detacher?.();
  detacher = null;
  resetWorldSync();
}

export function resetWorldSync(): void {
  seqSortant = 0;
  seqEntrant = -1;
  depuisDernierTick = 0;
  stopPublie = -1;
  tickEnAttente = null;
  phasePubliee = null;
  dernierHello = 0;
  correction = { kind: 'none' };
}

// Outil de mise au point : injecter un battement à la main, pour éprouver la
// resynchronisation sans avoir de second onglet sous la main.
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  /**
   * Injecte un battement à la main, pour éprouver la resynchronisation sans
   * second onglet.
   *
   * `offsetMs` est calculé AU MOMENT de l'appel, dans la page : c'est le seul
   * moyen d'obtenir un écart de la taille voulue. Un harnais extérieur qui
   * lirait `phaseT`, ferait un aller-retour, puis enverrait une valeur absolue
   * enverrait un écart déjà périmé - sous rendu logiciel, cet aller-retour dure
   * plus longtemps que l'écart qu'on cherche à provoquer.
   */
  w.__netTick = (over: Partial<TickPayload> = {}, offsetMs = 0) => {
    const base = sampleTick(seqEntrant + 1, 'dev-host');
    const charge = { ...base, ...over, seq: seqEntrant + 1 };
    if (offsetMs !== 0) charge.pt = Math.round(runtime.phaseT * 1000) + offsetMs;
    deliverRoomMessage('tick', charge);
  };
  w.__netCorrection = () => correction;
  /**
   * Injecte une population « de l'hôte » à la main.
   *
   * Sans argument, elle reprend la nôtre en INVERSANT l'ordre des places : tout
   * le monde doit alors bouger d'un coup, ce qui est le cas le plus dur pour la
   * redistribution des sièges et le seul qui révèle deux voyageurs posés sur le
   * même coussin. C'est le pendant de `__netTick` pour les gens, et c'est ce
   * qui permet d'éprouver la réception dans un vrai navigateur, sans second
   * onglet ni serveur.
   */
  w.__netPop = (px?: number[], cr?: number[]) => {
    const mien = samplePaxPopulation();
    const inverse: number[] = [];
    for (let i = mien.length / 2 - 1; i >= 0; i--) inverse.push(mien[i * 2], mien[i * 2 + 1]);
    deliverRoomMessage('pop', {
      v: PROTOCOL_VERSION,
      from: 'dev-host',
      st: useStore.getState().platformIndex,
      px: px ?? inverse,
      cr: cr ?? [],
    });
  };
  // Forcer le rôle sans passer par une élection : de quoi éprouver le
  // comportement d'un suiveur avec un seul onglet ouvert.
  w.__setRole = (role: 'solo' | 'host' | 'follower') => setNetRole(role);
  // Le journal des sous-titres : chaque annonce et chaque carillon y laisse une
  // trace, ce qui en fait la seule façon de COMPTER ce qui a sonné. C'est cette
  // mesure-là qui dit si une resynchronisation a bégayé.
  w.__subtitleLog = () => useSubtitles.getState().log;
}
