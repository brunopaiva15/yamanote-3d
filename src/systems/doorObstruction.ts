// La porte qui ne se ferme pas.
//
// C'est la seule panne de l'arrêt qui ne soit pas une panne : personne n'est
// tombé en avarie, il y a juste quelqu'un dans l'encadrement. Et pourtant rien
// ne peut partir, parce que le circuit de départ n'est établi que si TOUTES
// les portes de la rame et TOUTES les portes palières sont confirmées fermées.
// Tant que ce n'est pas le cas, l'indication de départ n'apparaît pas en
// cabine de tête, et la rame reste à quai - c'est ce verrouillage-là, et non
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
// détection est sensible et la force de maintien réduite avant le démarrage -
// la porte s'arrête et relâche sa pression pour qu'on puisse se dégager - mais
// la réouverture est un GESTE, celui du conducteur arrière, et sa durée dit ce
// qu'il a vu : une impulsion pour une sangle, une ouverture franche pour
// quelqu'un qui est réellement en travers.
//
// Après trois tentatives, il renonce à la porte seule et rouvre tout : un
// agent de quai vient dégager le passage lui-même.
//
// Le JOUEUR est un obstacle comme un autre - c'est même le seul qui décide
// vraiment. Planté dans l'encadrement, il tient la rame à quai aussi longtemps
// qu'il veut : aucun tirage ne le dégage à sa place, et la porte le suit à
// l'image près (voir `syncPlayerObstacle`). Le pendant de ce pouvoir est dans
// systems/walkable : le seuil qu'il occupe reste franchissable, sans quoi la
// porte qui se referme sur lui l'emmurerait.
//
// Les timings et les chances vivent dans data/doorObstruction (sans
// dépendance, donc testables) ; la mécanique du vantail dans systems/doorMotion.

import { CONFIG } from '../data/config';
import { CONSIST, PLAYER_CAR, carZ } from '../data/e235';
import { doorReleaseAnnouncement } from '../data/announcements';
import {
  MAX_ATTEMPTS,
  clearsOnAttempt,
  drawObstacle,
  drawObstruction,
  escalationHold,
  playerObstacle,
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
  setBlockedGap,
  setPsdDoors,
  setTrainDoors,
  startBlockedDoor,
} from './doorMotion';
import { currentSegmentOccupancy } from './occupancy';
import { worldToPlatform } from './playerFrame';
import {
  callPlatformAgent,
  platformAgentSays,
  releasePlatformAgent,
} from './platformAgent';
import { holdPaxInDoorway, paxHeldInDoorway, releasePaxFromDoorway } from './passengers';
import { say } from './speech';
import { paDoorCheck, paDoorRelease } from './stationPa';
import { playerDoorwayZ } from './walkable';

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
  /**
   * L'obstacle, c'est le JOUEUR. Rien ne se dégage tant qu'il n'a pas bougé :
   * aucun tirage ne décide à sa place, et la rame attend aussi longtemps
   * qu'il faudra.
   */
  byPlayer: boolean;
  /** Un agent de quai a été appelé devant cette porte. */
  agentCalled: boolean;
  /** Numéro de la dernière consigne qu'il a réellement pu donner. */
  agentSaid: number;
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

/**
 * Ouverture de la porte bloquée, quand c'est celle du joueur.
 *
 * Toutes les portes sont fermées, sauf une : celle qui s'est arrêtée sur
 * quelqu'un, à un pas de lui. C'est par cet intervalle-là - vingt-cinq
 * centimètres - que la sono du quai lui parvient, et le moteur audio ne peut
 * pas le savoir en regardant la seule porte de référence, qui est close.
 */
export function doorObstructionOpening(): number {
  if (!state) return 0;
  const door = blockedDoor();
  if (!door || door.car !== PLAYER_CAR) return 0;
  // Une porte entrebâillée à l'autre bout de la voiture ne lui apporte rien.
  if (Math.abs(runtime.playerCarZ - door.dz) > 4) return 0;
  return door.pos;
}

/** Remet tout à zéro : entrée en jeu, saut de phase, changement de rame. */
export function resetDoorObstruction(): void {
  if (state?.embodied) releasePaxFromDoorway();
  if (state?.agentCalled) releasePlatformAgent();
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

/** L'assistance voyageurs a priorite sur un tirage pas encore materialise. */
export function cancelArmedDoorObstruction(): void {
  armed = null;
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
 * Elle se ferme comme les autres - c'est en fin de course qu'elle s'arrêtera.
 */
export function onDoorsClosing(): void {
  if (state) return;
  // Le joueur planté dans un seuil passe avant le tirage : la porte qui va se
  // fermer sur lui est CELLE-LÀ, et pas une autre.
  if (startPlayerObstruction()) {
    armed = null;
    return;
  }
  if (!armed) return;
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
    byPlayer: false,
    agentCalled: false,
    agentSaid: 0,
  };
}

/**
 * Le joueur se tient-il dans un seuil au moment où les portes se ferment ?
 * Alors c'est lui, l'obstacle - et il le restera tant qu'il n'aura pas fait
 * un pas, dedans ou dehors.
 *
 * Vérifié aussi à chaque image tant que les portes se ferment : on peut très
 * bien se glisser dans l'embrasure une demi-seconde APRÈS l'ordre de
 * fermeture, et c'est même le cas le plus fréquent.
 */
function startPlayerObstruction(): boolean {
  const dz = playerDoorwayZ();
  if (dz == null) return false;
  const plan = playerObstacle();
  startBlockedDoor(PLAYER_CAR, dz, plan.gap);
  state = {
    kind: plan.kind,
    gap: plan.gap,
    stage: 'closing',
    t: 0,
    wait: 0,
    attempt: 1,
    car: PLAYER_CAR,
    dz,
    cleared: false,
    embodied: false,
    byPlayer: true,
    agentCalled: false,
    agentSaid: 0,
  };
  return true;
}

/** L'obstacle est-il dégagé ? Pour le joueur, la question est : a-t-il bougé ? */
function obstacleCleared(st: Obstruction): boolean {
  if (st.byPlayer) return playerDoorwayZ() !== st.dz;
  return clearsOnAttempt(st.kind, st.attempt);
}

/**
 * Le joueur n'obéit à aucun tirage : il entre et sort de l'encadrement quand
 * il veut, et la porte suit à l'image près. Un pas de côté et elle finit sa
 * course ; un pas en arrière dans l'embrasure et elle le retrouve.
 */
function syncPlayerObstacle(st: Obstruction): void {
  if (!st.byPlayer) return;
  const inDoorway = playerDoorwayZ() === st.dz;
  if (inDoorway === !st.cleared) return;
  st.cleared = !inDoorway;
  setBlockedGap(inDoorway ? st.gap : 0);
}

/** Le conducteur maintient la commande de réouverture, et le dit au micro. */
function beginReopen(st: Obstruction): void {
  moveBlockedDoor(1);
  st.stage = 'reopen';
  st.t = 0;
  st.wait = reopenHold(st.kind, st.attempt);
  // La rame parle la première fois - c'est le conducteur qui a la main -, le
  // quai prend le relais ensuite : deux voix pour la même personne, comme
  // quand un agent finit par descendre sur le quai.
  say(doorReleaseAnnouncement(st.attempt > 1), 'cabin');
  // Sauf quand c'est le JOUEUR qui est dedans : l'agent parle dès le premier
  // essai, et il a de bonnes raisons. À cheval sur le seuil, on est déjà
  // « dehors » pour le moteur audio - la sono de la rame est coupée net
  // (audioEngine.setListenerOutside) et le conducteur parlerait tout seul dans
  // une voiture qu'on vient de quitter. Celui qui bloque la porte doit
  // s'entendre dire de s'écarter, d'où qu'il se tienne.
  if (st.byPlayer || st.attempt > 1) paDoorRelease(st.attempt - 1);
}

/**
 * Fait venir l'agent de quai devant la porte concernée.
 *
 * Un haut-parleur n'a jamais fait reculer personne : quand quelqu'un tient une
 * porte, quelqu'un se déplace. Il accourt depuis la trémie la plus proche et
 * se poste à côté de la baie, tourné vers celui qui bloque.
 */
function callAgent(st: Obstruction): void {
  if (st.agentCalled) return;
  st.agentCalled = true;
  const out = { x: 0, z: 0 };
  worldToPlatform(0, carZ(st.car) + st.dz + runtime.trainZ, out);
  callPlatformAgent(out.z);
}

/**
 * Sa consigne, s'il est arrivé. Tant qu'il marche encore, on réessaie à
 * l'image suivante : il ne parle pas de loin, il parle une fois devant.
 */
function agentSpeaks(st: Obstruction): void {
  if (!st.agentCalled || st.agentSaid >= st.attempt) return;
  if (platformAgentSays(st.attempt)) st.agentSaid = st.attempt;
}

/** Le bouton est relâché : la porte se referme, dégagée ou non. */
function beginReclose(st: Obstruction): void {
  st.cleared = obstacleCleared(st);
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
  callAgent(st);
  paDoorCheck();
}

/** Tout est confirmé fermé : le circuit de départ s'établit, la rame peut partir. */
function finish(): void {
  if (state?.agentCalled) releasePlatformAgent();
  clearBlockedDoor();
  setDepartureBlockers({ doorBlocked: false });
  state = null;
}

export function updateDoorObstruction(dt: number): void {
  if (!state) {
    // Un pas dans l'embrasure pendant que les vantaux se rapprochent : rien
    // n'était tiré pour cet arrêt, mais il y a bel et bien quelqu'un dedans.
    if (runtime.doorTarget === 0 && runtime.doorOpen > 0.02) startPlayerObstruction();
    if (!state) return;
  }
  const st = state;
  const door = blockedDoor();
  st.t += dt;
  // Il vient peut-être d'arriver : sa consigne part dès qu'il est devant.
  agentSpeaks(st);

  switch (st.stage) {
    case 'closing':
      // Un pas de côté avant même le contact : il n'y a plus d'obstacle, la
      // porte va au bout et la procédure n'aura pas eu lieu.
      syncPlayerObstacle(st);
      if (st.cleared) {
        st.stage = 'reclose';
        break;
      }
      // La porte finit sa course et rencontre l'obstacle : à partir de là, le
      // départ n'est plus possible.
      if (door?.touched) {
        setDepartureBlockers({ doorBlocked: true });
        // C'est le joueur qui est dedans : un agent se met en route tout de
        // suite. Pour une obstruction ordinaire, il n'intervient qu'en dernier
        // recours (voir escalate).
        if (st.byPlayer) callAgent(st);
        st.stage = 'contact';
        st.t = 0;
        st.wait = reactionDelay(st.kind, st.attempt);
      } else if (!door) {
        finish();
      }
      break;

    case 'contact':
      // Le joueur s'écarte avant même que le conducteur ait réagi : la porte
      // finit sa course toute seule, et il n'y aura pas eu de procédure.
      syncPlayerObstacle(st);
      if (st.cleared) {
        st.stage = 'reclose';
        break;
      }
      if (st.t >= st.wait) beginReopen(st);
      break;

    case 'reopen':
      // Dégagé pendant que le bouton est maintenu : le conducteur le relâche
      // dans la foulée, il n'attend pas la fin de son geste.
      if (st.byPlayer && playerDoorwayZ() !== st.dz) st.wait = Math.min(st.wait, st.t + 0.4);
      // Bouton maintenu. Le compte part de l'APPUI, pas de la pleine ouverture :
      // une impulsion courte relâche le bouton avant que le vantail soit
      // complètement écarté, et la porte repart en arrière d'où elle en est.
      // C'est ce qui distingue le geste pour une sangle de celui pour un corps.
      if (st.t >= st.wait) beginReclose(st);
      break;

    case 'reclose':
      syncPlayerObstacle(st);
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
        // Personne ne referme sur quelqu'un qui est encore dans l'encadrement.
        // Le joueur qui s'obstine tient la rame à quai aussi longtemps qu'il
        // veut : l'agent redemande, et on attend encore.
        if (st.byPlayer && !obstacleCleared(st)) {
          paDoorRelease(st.attempt + 1);
          st.t = 0;
          st.wait = escalationHold();
          break;
        }
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
  // __playerDoorway() : le seuil que le joueur occupe, ou null.
  w.__playerDoorway = () => playerDoorwayZ();
  // __doorObstruction() : où en est la procédure, et où en est le vantail.
  w.__doorObstruction = () => ({
    armed,
    ...state,
    phase: useStore.getState().phase,
    door: blockedDoor(),
  });
}
