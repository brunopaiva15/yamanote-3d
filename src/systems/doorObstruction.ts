// La porte qui ne se ferme pas.
//
// C'est la seule panne de l'arrêt qui ne soit pas une panne : personne n'est
// tombé en avarie, il y a juste quelqu'un dans l'encadrement. Et pourtant rien
// ne peut partir, parce que le circuit de départ n'est établi que si TOUTES
// les portes de la rame et TOUTES les portes palières sont confirmées fermées.
// Tant que ce n'est pas le cas, l'indication de départ n'apparaît pas en
// cabine de tête, et la rame reste à quai — c'est ce verrouillage-là, et non
// un minuteur, qui tient le train (voir runtime.departureBlockers.doorBlocked).
//
// Déroulé, tel qu'il se joue :
//
//   fermeture rame → ~1 s → fermeture des portes palières
//   → contact, la porte s'arrête sans se verrouiller
//   → 0,5 à 2 s de réaction humaine (bien plus pour un objet fin)
//   → 再開閉スイッチ : réouverture de LA SEULE porte concernée, bouton maintenu
//   → 「ドアから離れてください」
//   → 1 à 3 s d'ouverture, puis le bouton est relâché : elle se referme aussitôt
//   → contrôle → départ, ou nouvelle tentative.
//
// Ce qu'il ne faut surtout pas faire, c'est une porte d'ascenseur : sur le
// E235, rien ne se rouvre tout seul et rien ne se rouvre en grand. La
// détection est sensible et la force de maintien réduite avant le démarrage —
// la porte s'arrête et relâche sa pression pour qu'on puisse se dégager — mais
// la réouverture est un GESTE, celui du conducteur arrière, et sa durée dit ce
// qu'il a vu : une impulsion pour une sangle, une ouverture franche pour
// quelqu'un qui est réellement en travers.
//
// Après trois tentatives, il renonce à la porte seule et rouvre tout : un
// agent de quai vient dégager le passage lui-même.
//
// Les timings et les chances vivent dans data/doorObstruction (sans
// dépendance, donc testables) ; la mécanique du vantail dans systems/doorMotion.

import { CONFIG } from '../data/config';
import { CONSIST, PLAYER_CAR } from '../data/e235';
import { doorReleaseAnnouncement } from '../data/announcements';
import {
  MAX_ATTEMPTS,
  clearsOnAttempt,
  drawObstacle,
  drawObstruction,
  escalationHold,
  reactionDelay,
  reopenHold,
  type ObstacleKind,
  type ObstructionPlan,
} from '../data/doorObstruction';
import { useStore } from '../store';
import { runtime } from './runtime';
import * as audio from './audioEngine';
import { setDepartureBlockers } from './departureSequence';
import {
  blockedDoor,
  clearBlockedDoor,
  isBlockedDoor,
  moveBlockedDoor,
  releaseBlockedGap,
  setPsdDoors,
  setTrainDoors,
  startBlockedDoor,
} from './doorMotion';
import { currentSegmentOccupancy } from './occupancy';
import { holdPaxInDoorway, paxHeldInDoorway, releasePaxFromDoorway } from './passengers';
import { say } from './speech';
import { paDoorCheck, paDoorRelease } from './stationPa';

type Stage =
  | 'none'
  /** Les portes se ferment ; celle-là va rencontrer l'obstacle. */
  | 'closing'
  /** Contact établi, porte non verrouillée : on attend la réaction humaine. */
  | 'contact'
  /** 再開閉 : bouton maintenu, la porte concernée s'ouvre. */
  | 'reopen'
  /** Bouton relâché : elle se referme aussitôt, d'où qu'elle en soit. */
  | 'reclose'
  /** Toutes les portes rouvertes, un agent intervient. */
  | 'escalated'
  /** Toutes les portes se referment, on attend la confirmation. */
  | 'settling';

interface Obstruction extends ObstructionPlan {
  stage: Stage;
  /** Chrono de l'étape courante et durée visée (s). */
  t: number;
  wait: number;
  /** Numéro de la tentative de réouverture en cours (1…MAX_ATTEMPTS). */
  attempt: number;
  /** Voiture et porte concernées. */
  car: number;
  dz: number;
  /** L'obstacle a été dégagé : la prochaine fermeture ira jusqu'au bout. */
  cleared: boolean;
  /** Un voyageur du pool est réellement planté dans l'embrasure. */
  embodied: boolean;
}

let state: Obstruction | null = null;
/** Obstruction tirée pour l'arrêt en cours, en attente de la fermeture. */
let armed: (ObstructionPlan & { car: number; dz: number }) | null = null;

/** Une porte est-elle en train de retenir le train ? */
export function doorObstructionActive(): boolean {
  return state !== null;
}

/**
 * Cette porte-là est-elle celle qui coince, et pas encore refermée ? Sert au
 * témoin lumineux au-dessus de la porte, qui continue de clignoter tant que
 * son vantail n'est pas rentré (three/DoorCloseLed).
 */
export function doorObstructionAt(car: number, dz: number): boolean {
  if (!state) return false;
  return isBlockedDoor(car, dz);
}

/** Remet tout à zéro : entrée en jeu, saut de phase, changement de rame. */
export function resetDoorObstruction(): void {
  if (state?.embodied) releasePaxFromDoorway();
  state = null;
  armed = null;
  clearBlockedDoor();
  setDepartureBlockers({ doorBlocked: false });
}

/**
 * Tirage de l'arrêt qui commence : y aura-t-il une porte bloquée, sur quelle
 * voiture, et par quoi ? À appeler une fois par arrêt, avant la fermeture.
 *
 * La voiture est tirée autour de celle du joueur : l'incident vaut surtout
 * d'être vu, et il l'est de l'intérieur (la porte du wagon) comme du quai (les
 * vantaux d'une caisse voisine qui restent entrebâillés).
 */
export function armDoorObstruction(): void {
  armed = null;
  const plan = drawObstruction(currentSegmentOccupancy().percent);
  if (!plan) return;
  armed = { ...plan, ...pickDoor() };
}

/** Force une obstruction à la prochaine fermeture (outil dev). */
export function forceDoorObstruction(kind?: ObstacleKind): void {
  const plan = drawObstacle();
  armed = { ...plan, ...pickDoor() };
  if (kind && kind !== plan.kind) {
    const forced = kind === 'object' ? 0.02 : 0.2;
    armed = { ...armed, kind, gap: forced };
  }
}

function pickDoor(): { car: number; dz: number } {
  // La moitié du temps la voiture du joueur, sinon une caisse voisine.
  const offset = Math.random() < 0.5 ? 0 : 1 + Math.floor(Math.random() * 3);
  const sign = Math.random() < 0.5 ? -1 : 1;
  const car = Math.max(0, Math.min(CONSIST.length - 1, PLAYER_CAR + sign * offset));
  const dz = CONFIG.doorCenters[Math.floor(Math.random() * CONFIG.doorCenters.length)];
  return { car, dz };
}

/**
 * Les portes viennent de recevoir l'ordre de fermeture : si une obstruction est
 * tirée pour cet arrêt, la porte concernée quitte l'ensemble dès maintenant.
 * Elle se ferme comme les autres — c'est en fin de course qu'elle s'arrêtera.
 */
export function onDoorsClosing(): void {
  if (!armed || state) return;
  const plan = armed;
  armed = null;
  let kind = plan.kind;
  let gap = plan.gap;
  let embodied = false;
  if (kind === 'person') {
    // Un corps doit se voir. Le pool n'a personne de libre → ce sera une
    // sangle, qui n'a besoin de personne et qui est de toute façon le cas le
    // plus difficile à détecter.
    embodied =
      plan.car === PLAYER_CAR && holdPaxInDoorway(plan.dz, useStore.getState().doorSide);
    if (!embodied && plan.car === PLAYER_CAR) {
      kind = 'object';
      gap = 0.025;
    }
  }
  startBlockedDoor(plan.car, plan.dz, gap);
  state = {
    kind,
    gap,
    stage: 'closing',
    t: 0,
    wait: 0,
    attempt: 1,
    car: plan.car,
    dz: plan.dz,
    cleared: false,
    embodied,
  };
}

/** Le conducteur maintient la commande de réouverture, et le dit au micro. */
function beginReopen(st: Obstruction): void {
  moveBlockedDoor(1);
  st.stage = 'reopen';
  st.t = 0;
  st.wait = reopenHold(st.kind, st.attempt);
  // La rame parle la première fois — c'est le conducteur qui a la main —, le
  // quai prend le relais ensuite : deux voix pour la même personne, comme
  // quand un agent finit par descendre sur le quai.
  if (st.attempt === 1) say(doorReleaseAnnouncement(), 'cabin');
  else {
    say(doorReleaseAnnouncement(true), 'cabin');
    paDoorRelease(st.attempt);
  }
}

/** Le bouton est relâché : la porte se referme, dégagée ou non. */
function beginReclose(st: Obstruction): void {
  st.cleared = clearsOnAttempt(st.kind, st.attempt);
  if (st.cleared) {
    releaseBlockedGap();
    if (st.embodied) {
      releasePaxFromDoorway();
      st.embodied = false;
    }
  }
  moveBlockedDoor(0);
  st.stage = 'reclose';
  st.t = 0;
}

/**
 * Le conducteur renonce à la porte seule : toutes les portes rouvrent, un
 * agent de quai vient dégager le passage. Personne ne repart avant lui.
 */
function escalate(st: Obstruction): void {
  st.stage = 'escalated';
  st.t = 0;
  st.wait = escalationHold();
  st.attempt = MAX_ATTEMPTS;
  setTrainDoors(1);
  setPsdDoors(1);
  // La porte bloquée rouvre avec les autres plutôt que d'être rendue d'un coup
  // à l'ensemble : elle est entrebâillée, elle ne doit pas sauter.
  moveBlockedDoor(1);
  paDoorCheck();
}

/** Tout est confirmé fermé : le circuit de départ s'établit, la rame peut partir. */
function finish(): void {
  clearBlockedDoor();
  setDepartureBlockers({ doorBlocked: false });
  state = null;
}

export function updateDoorObstruction(dt: number): void {
  const st = state;
  if (!st) return;
  const door = blockedDoor();
  st.t += dt;

  switch (st.stage) {
    case 'closing':
      // La porte finit sa course et rencontre l'obstacle : à partir de là, le
      // départ n'est plus possible.
      if (door?.touched) {
        setDepartureBlockers({ doorBlocked: true });
        st.stage = 'contact';
        st.t = 0;
        st.wait = reactionDelay(st.kind, st.attempt);
      } else if (!door) {
        finish();
      }
      break;

    case 'contact':
      if (st.t >= st.wait) beginReopen(st);
      break;

    case 'reopen':
      // Bouton maintenu. Le compte part de l'APPUI, pas de la pleine ouverture :
      // une impulsion courte relâche le bouton avant que le vantail soit
      // complètement écarté, et la porte repart en arrière d'où elle en est.
      // C'est ce qui distingue le geste pour une sangle de celui pour un corps.
      if (st.t >= st.wait) beginReclose(st);
      break;

    case 'reclose':
      if (!door) {
        finish();
      } else if (st.cleared) {
        if (door.pos <= 0.001) finish();
      } else if (door.touched) {
        // Toujours quelqu'un dedans : on recommence, ou on rouvre tout.
        st.attempt += 1;
        if (st.attempt > MAX_ATTEMPTS) {
          escalate(st);
        } else {
          st.stage = 'contact';
          st.t = 0;
          st.wait = reactionDelay(st.kind, st.attempt);
        }
      }
      break;

    case 'escalated':
      if (st.t >= st.wait) {
        // L'agent a dégagé le passage : tout se referme, cette fois pour de bon.
        releaseBlockedGap();
        if (st.embodied) {
          releasePaxFromDoorway();
          st.embodied = false;
        }
        setTrainDoors(0);
        setPsdDoors(0);
        moveBlockedDoor(0);
        audio.doorCloseChime();
        st.stage = 'settling';
        st.t = 0;
      }
      break;

    case 'settling': {
      const trainClosed = runtime.doorOpen <= 0.001 && (!door || door.pos <= 0.001);
      const psdClosed = !runtime.psdPresent || runtime.psdOpen <= 0.001;
      if (trainClosed && psdClosed) finish();
      break;
    }
  }

  // Garde-fou : le voyageur de l'embrasure ne survit jamais à la procédure.
  if (!state && paxHeldInDoorway()) releasePaxFromDoorway();
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  // __blockDoor() arme une obstruction pour la prochaine fermeture ;
  // __blockDoor('object') force le cas difficile (sangle, câble d'écouteur).
  w.__blockDoor = (kind?: ObstacleKind) => forceDoorObstruction(kind);
  // __doorObstruction() : où en est la procédure, et où en est le vantail.
  w.__doorObstruction = () => ({
    armed,
    ...state,
    phase: useStore.getState().phase,
    door: blockedDoor(),
  });
}
