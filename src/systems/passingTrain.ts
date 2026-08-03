// Un train qui ne s'arrête pas.
//
// Sur les gares où la Yamanote partage son îlot avec une autre ligne, la voie
// d'en face n'est pas la nôtre : elle est vide la plupart du temps, et de
// temps en temps une rame la traverse à pleine vitesse sans même lever le
// pied. C'est l'événement le plus physique d'un quai japonais - la gare
// avertit, tout le monde recule d'un pas, et deux cents mètres de caisse
// passent à trois mètres du bord en une quinzaine de secondes.
//
// Ce module ne connaît que le DÉROULÉ : quand annoncer, quand lancer la rame,
// où elle en est. La géométrie du quai lui donne l'abscisse de la voie
// (data/stationGeometry), la table des passages dit ce qui peut traverser et à
// quelle heure (data/passingTrains), le rendu la montre
// (three/exterior/PassingTrain) et le moteur audio la fait sonner
// (audioEngine.setPassBy).
//
// Deux règles tiennent tout le reste :
//
//   • LA GARE NE PARLE JAMAIS PAR-DESSUS ELLE-MÊME. L'annonce de passage est
//     mise en file sur le canal du quai comme les autres, donc elle ne peut
//     pas se superposer ; mais une annonce mise en file DERRIÈRE une autre
//     sortirait trop tard pour la rame qu'elle annonce. Le passage n'est donc
//     tiré que dans un vrai creux : sono du quai silencieuse, et assez de
//     temps devant soi pour dire ce qu'il y a à dire (voir rollPassThrough).
//   • ON N'ANNONCE PAS CE QU'ON NE PEUT PAS TENIR. Un créneau trop court pour
//     le japonais ET l'anglais ne prend que le japonais ; trop court pour le
//     japonais seul, et il ne se passe rien du tout.

import { CONFIG, V_MAX } from '../data/config';
import { E235 } from '../data/e235';
import { facingTrackNumber, passChance, passKindAt, type PassKind } from '../data/passingTrains';
import { PSD_X, TRACK_HALF } from '../data/stationGeometry';
import { layoutFor } from '../data/stationLayouts';
import { DOOR_SIDE } from '../data/stations';
import { useStore } from '../store';
import * as audio from './audioEngine';
import { perfLevel } from './perf';
import { runtime } from './runtime';
import { speechBusy } from './speech';
import { paPass, paPassWarning } from './stationPa';
import { drawPassThrough } from './net/worldDecisions';

/** Nombre de caisses d'une rame de la Keihin-Tōhoku (E233-1000). */
export const PASS_CARS = 10;

/**
 * Longueur hors tout de la rame (m) : dix caisses de 20 m d'entraxe, plus les
 * deux nez de cabine (le 0,6 est la saillie du masque, cf. CAB_FRONT_Z).
 */
export const PASS_LENGTH = (PASS_CARS - 1) * E235.pitch + 2 * (E235.bodyHalfLen + 0.6);

/**
 * Vitesse de traversée. Le rapide ne ralentit pas en gare : c'est la vitesse
 * de ligne, la même que la nôtre entre deux arrêts.
 */
const PASS_SPEED = V_MAX;

/** Distance au-delà du bout du quai où la rame apparaît, puis disparaît (m). */
const RUN_IN = 130;
const RUN_OUT = 80;

/** Le nez est à cette distance du bout du quai quand tombe l'avertissement. */
const WARN_AHEAD = 95;

/**
 * Silence nécessaire devant soi, en secondes, pour l'annonce complète
 * (signal + japonais + anglais, puis l'avertissement court pendant l'entrée)
 * et pour la version japonaise seule - celle-ci dure une dizaine de secondes,
 * les cinq de rabiot laissent la gare reprendre la parole sans se bousculer.
 */
const FULL_NEED = 36;
const SHORT_NEED = 15;

/** Délai entre le début de l'annonce et l'apparition de la rame (s). */
const FULL_LEAD = 29;
const SHORT_LEAD = 15;

/** Hauteur de la source sonore : le milieu de la caisse d'en face. */
const SOURCE_Y = 0.9;

type Stage = 'idle' | 'lead' | 'run';

export const passingTrain = {
  /**
   * Une rame est engagée : annoncée, en approche ou en train de traverser.
   * Le rendu s'en sert pour construire la rame PENDANT l'annonce, bien avant
   * d'avoir à la montrer.
   */
  armed: false,
  /** La rame est sur la voie et doit être rendue. */
  running: false,
  /** Abscisse du NEZ le long de la voie, repère du quai (m). Décroît. */
  z: 0,
  /** Abscisse de la voie d'en face dans le repère du quai (m). */
  trackX: 0,
  /** Vitesse instantanée (m/s) - constante, mais lue par le rendu et l'audio. */
  speed: 0,
  /** Ce qui traverse : la girouette de la rame n'affiche pas la même chose. */
  kind: 'rapid' as PassKind,
  /**
   * Facteur de temps, pour la mise au point (__passRate) : 0 fige la rame en
   * place le temps d'une capture, 0,2 fait passer au ralenti ce qui dure
   * quinze secondes en jeu.
   */
  rate: 1,
};

let stage: Stage = 'idle';
let t = 0;
let lead = 0;
let full = false;
let warned = false;
/** Avertisseur en attente : il sonne à la première image de la traversée. */
let horn = false;
let halfZ = 0;
/** Distance parcourue depuis le dernier joint de rail (m). */
let sinceJoint = 0;

function reset(): void {
  stage = 'idle';
  t = 0;
  warned = false;
  horn = false;
  passingTrain.armed = false;
  passingTrain.running = false;
  passingTrain.speed = 0;
}

/**
 * Y a-t-il une rame à faire passer dans le créneau qui s'ouvre ? Tirage SEUL,
 * sans effet : l'appelant peut avoir à réorganiser son propre déroulé avant de
 * lancer la séquence (voir platformWait, qui allonge l'attente).
 *
 * @param opportunityS durée du créneau (s). La table donne des chances par
 *                     tranche de deux minutes - la cadence à laquelle un
 *                     rapide se présente dans le sens qui borde notre quai.
 */
export function rollPassThrough(index: number, opportunityS: number): boolean {
  if (stage !== 'idle') return false;
  // Une rame de plus, ses matériaux et ses géométries : les petites machines
  // ont déjà fort à faire avec le quai et la nôtre.
  //
  // Cette sortie précède le tirage, et c'est elle qui a condamné l'idée d'une
  // graine partagée entre joueurs : un client en qualité basse ne consomme pas
  // le même nombre d'aléas que les autres, et toute suite commune se serait
  // décalée pour lui seul, silencieusement. L'oracle nomme ses tirages au lieu
  // de les compter, ce qui rend cette sortie parfaitement inoffensive - le
  // suiveur qui ne tire pas laisse simplement dormir la valeur reçue.
  if (perfLevel() >= 4) return false;
  const kind = passKindAt(index, runtime.clockMin, runtime.tokyoDate.weekday);
  if (!kind) return false;
  return drawPassThrough(passChance(kind, runtime.clockMin) * Math.min(1, opportunityS / 120));
}

/**
 * Lance la séquence : la gare annonce, puis la rame arrive.
 *
 * @param quietFor secondes de silence que l'appelant garantit sur la sono du
 *                 quai. C'est LUI qui connaît sa propre chronologie ; ce module
 *                 ne fait qu'y loger ce qui tient - et renonce si rien ne tient.
 */
export function startPassThrough(index: number, quietFor: number): boolean {
  if (stage !== 'idle') return false;
  if (quietFor < SHORT_NEED) return false;
  // La gare a encore quelque chose à dire : on ne se met pas dans la file.
  if (speechBusy('platform')) return false;
  const kind = passKindAt(index, runtime.clockMin, runtime.tokyoDate.weekday);
  if (!kind) return false;
  const layout = layoutFor(index);
  // Harajuku : un mur derrière soi, pas de voie. Ne devrait pas arriver
  // (aucun quai latéral ne partage son îlot), mais la géométrie ci-dessous
  // n'aurait aucun sens.
  if (layout.config === 'side') return false;
  const track = facingTrackNumber(index, useStore.getState().loopDirection);
  if (track == null) return false;

  full = quietFor >= FULL_NEED;
  halfZ = layout.length / 2;
  passingTrain.kind = kind;
  passingTrain.trackX = PSD_X + layout.depth + TRACK_HALF;
  passingTrain.armed = true;
  passingTrain.running = false;
  passingTrain.z = halfZ + RUN_IN;
  stage = 'lead';
  t = 0;
  lead = full ? FULL_LEAD : SHORT_LEAD;
  warned = false;
  paPass(track, full);
  return true;
}

/** La gare s'en va (départ, changement de gare) : la rame d'en face avec. */
export function cancelPassThrough(): void {
  if (stage === 'idle') return;
  if (stage === 'run') audio.passByEnd();
  reset();
}

export function updatePassingTrain(rawDt: number): void {
  if (stage === 'idle') return;
  const dt = rawDt * passingTrain.rate;
  // Le quai n'est plus là : on a quitté la gare pendant le passage. Tout ce
  // qui suit est calé sur son repère - sans lui, la rame d'en face resterait
  // suspendue à la dernière position connue, et son grondement avec.
  if (runtime.playerFrame !== 'platform' && runtime.platformFade <= 0.02) {
    cancelPassThrough();
    return;
  }
  t += dt;

  if (stage === 'lead') {
    if (t < lead) return;
    stage = 'run';
    passingTrain.running = true;
    passingTrain.speed = PASS_SPEED;
    passingTrain.z = halfZ + RUN_IN;
    sinceJoint = 0;
    // L'avertisseur part à la première image de la traversée, une fois la
    // source posée : klaxonner avant reviendrait à le faire sonner depuis
    // l'endroit d'où la rame précédente est partie.
    horn = true;
    audio.passByStart();
    return;
  }

  passingTrain.z -= PASS_SPEED * dt;
  sinceJoint += PASS_SPEED * dt;

  // Repère du quai → repère monde : la gare est bâtie côté +x puis retournée
  // d'un demi-tour selon le côté d'ouverture (x et z changent alors de signe),
  // et elle glisse de platformSlide le long de la voie.
  const side = DOOR_SIDE[useStore.getState().platformIndex];
  const listenerZ = (runtime.playerZ - runtime.platformSlide) * side;
  // Une rame de 200 m n'est pas une source ponctuelle : elle sonne depuis son
  // point le plus proche de l'oreille - le nez tant qu'elle arrive, notre
  // hauteur tant qu'elle défile, la queue une fois passée.
  const nose = passingTrain.z;
  const tail = nose + PASS_LENGTH;
  const nearZ = Math.max(nose, Math.min(tail, listenerZ));
  const worldX = side * passingTrain.trackX;
  const worldZ = side * nearZ + runtime.platformSlide;
  audio.setPassBy(worldX, SOURCE_Y, worldZ, Math.max(-1, Math.min(1, (nearZ - listenerZ) / 50)));
  if (horn) {
    horn = false;
    // Le coup de klaxon qui fait tourner les têtes, avant même qu'on ne la voie.
    audio.passByHorn();
  }

  if (sinceJoint >= CONFIG.railJointGap) {
    sinceJoint -= CONFIG.railJointGap;
    const d = Math.hypot(worldX - runtime.playerX, worldZ - runtime.playerZ);
    audio.passByClack(0.5 / (1 + Math.pow(d / 22, 1.6)));
  }

  if (full && !warned && nose <= halfZ + WARN_AHEAD) {
    warned = true;
    paPassWarning();
  }

  if (tail < -(halfZ + RUN_OUT)) {
    audio.passByEnd();
    reset();
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.__passingTrain = passingTrain;
  // Force un passage à la gare courante, sans tirage ni fenêtre de silence.
  w.__passThrough = (short = false) => {
    reset();
    const index = useStore.getState().platformIndex;
    const layout = layoutFor(index);
    const track = facingTrackNumber(index, useStore.getState().loopDirection) ?? 1;
    full = !short;
    halfZ = layout.length / 2;
    passingTrain.kind = 'rapid';
    passingTrain.trackX = PSD_X + layout.depth + TRACK_HALF;
    passingTrain.armed = true;
    passingTrain.z = halfZ + RUN_IN;
    stage = 'lead';
    lead = full ? FULL_LEAD : SHORT_LEAD;
    paPass(track, full);
  };
  // Saut direct à un point de la traversée, sans attendre l'annonce : c'est
  // ainsi que se prennent les captures (scripts/pass-shots.mjs).
  w.__passRate = (k: number) => {
    passingTrain.rate = Math.max(0, k);
  };
  w.__passAt = (nose = 0) => {
    if (stage === 'idle') (w.__passThrough as () => void)();
    stage = 'run';
    t = lead;
    passingTrain.running = true;
    passingTrain.speed = PASS_SPEED;
    passingTrain.z = nose;
    audio.passByStart();
  };
}
