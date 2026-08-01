// Les portillons : 改札.
//
// C'était une ligne de bornes et un trou entre elles. On traversait un 改札口
// en marchant, sans rien présenter, sans que rien ne s'ouvre ni ne se ferme -
// et c'est peut-être ce qui manquait le plus à une gare japonaise, parce que
// le portillon n'est pas un obstacle : c'est un RYTHME. Une file qui avance
// sans ralentir, une main qui se pose une demi-seconde, un ピッ toutes les
// deux secondes, et des battants qui ne se ferment que sur celui qui s'est
// trompé.
//
// TROIS RÈGLES, ET ELLES SONT DANS CET ORDRE :
//
//   1. les battants sont OUVERTS au repos. Un portillon japonais n'est pas un
//      tourniquet - il laisse passer, et ne se ferme que devant qui n'a pas
//      validé. C'est l'inverse d'un portillon parisien, et c'est ce qui rend la
//      file fluide ;
//   2. ils se ferment à l'APPROCHE de quelqu'un qui n'a rien présenté, pas au
//      moment où il les touche. Un demi-mètre avant, avec le claquement sec du
//      mécanisme : on s'arrête tout seul ;
//   3. la validation ouvre pour quelques secondes, le temps de passer - pas
//      pour toujours. Repasser demande de retaper.
//
// Le tarif est réel : la carte retient d'où l'on est parti (store.pocket.entry)
// et la sortie facture le nombre d'arrêts (data/products, `fareFor`). Sortir
// sans de quoi payer renvoie au 精算機, exactement comme dans la vraie vie.

import { fareFor, FARES } from '../data/products';
import { useStore } from '../store';
import { psdGates } from '../three/station/psdLayout';
import { gateBeep, gateDeny, gateFlap } from './audioEngine';
import { runtime } from './runtime';
import { placementFor } from './stationPlacement';

/** Ce que le feu du portillon montre. */
export type GateLight = 'open' | 'ok' | 'deny';

export interface GateState {
  /** 0 = battants fermés en travers, 1 = escamotés dans les bornes. */
  flap: number;
  target: number;
  light: GateLight;
  /** Temps restant d'affichage du feu (s). */
  lightT: number;
  /** Temps restant de validité d'une validation (s). */
  grantT: number;
  /** Sens dans lequel la validation a été faite. */
  grantDir: 1 | -1;
  /** Ce que la dalle de la borne affiche, et pour combien de temps encore. */
  verdict: GateVerdict | null;
  verdictT: number;
}

/**
 * Vitesse des battants : ils claquent en un cinquième de seconde.
 *
 * C'est rapide, et il le faut - un portillon lent ne fait pas peur, et c'est
 * la sécheresse du mouvement qui arrête celui qui n'a pas validé.
 */
const FLAP_RATE = 1 / 0.18;
/** Durée d'une validation : le temps de faire trois pas. */
const GRANT = 3.6;
/** Affichage du feu après un refus. */
const DENY_SHOW = 2.4;
/** Distance à laquelle les battants se ferment devant qui n'a rien présenté. */
const CLOSE_AT = 1.9;

let states: GateState[] = [];
let builtFor = -1;

function ensure(): GateState[] {
  const index = useStore.getState().platformIndex;
  const place = placementFor(index, psdGates());
  const n = place.interior.built ? place.interior.gate.passages.length : 0;
  if (builtFor !== index || states.length !== n) {
    builtFor = index;
    states = Array.from({ length: n }, () => ({
      flap: 1,
      target: 1,
      light: 'open' as GateLight,
      lightT: 0,
      grantT: 0,
      grantDir: 1 as 1 | -1,
      verdict: null,
      verdictT: 0,
    }));
  }
  return states;
}

/** L'état des passages de la gare courante, pour le rendu. */
export function gateStates(): readonly GateState[] {
  return ensure();
}

// --- Validation -----------------------------------------------------------

/** Pourquoi le portillon a refusé - c'est ce qu'affiche son écran. */
export type GateVerdict =
  | { ok: true; entering: boolean; fare: number; balance: number | null }
  | { ok: false; reason: 'noMedia' | 'lowBalance' | 'shortFare'; due: number };

/**
 * Le tarif dû à la sortie, ici et maintenant.
 *
 * Le trajet se compte en ARRÊTS depuis la gare d'entrée retenue par la carte.
 * Sans gare d'entrée - une carte prise en cours de partie, un billet acheté
 * sur place - on facture le tarif minimum, ce que fait aussi un portillon réel
 * devant un titre qu'il ne sait pas rattacher à une entrée.
 */
export function exitFare(): number {
  const store = useStore.getState();
  const from = store.pocket.entry;
  return from === null ? FARES[0] : fareFor(store.platformIndex - from);
}

function validate(entering: boolean): GateVerdict {
  const store = useStore.getState();
  const p = store.pocket;
  if (entering) {
    // À l'entrée, on ne paie rien : on vérifie seulement qu'il y a de quoi
    // faire le trajet le plus court. C'est la règle des portillons IC.
    if (p.ticket) return { ok: true, entering, fare: 0, balance: null };
    if (!p.ic) return { ok: false, reason: 'noMedia', due: FARES[0] };
    if (p.icBalance < FARES[0]) {
      return { ok: false, reason: 'lowBalance', due: FARES[0] - p.icBalance };
    }
    store.setPocket({ ...p, insideGate: true, entry: store.platformIndex });
    return { ok: true, entering, fare: 0, balance: p.icBalance };
  }

  const owed = exitFare();
  if (p.ticket) {
    if (p.ticket.fare < owed) return { ok: false, reason: 'shortFare', due: owed - p.ticket.fare };
    // Le billet est AVALÉ par le portillon de sortie : on ne ressort pas avec.
    store.setPocket({ ...p, ticket: null, insideGate: false, entry: null });
    return { ok: true, entering, fare: owed, balance: null };
  }
  if (!p.ic) return { ok: false, reason: 'noMedia', due: owed };
  if (p.icBalance < owed) return { ok: false, reason: 'lowBalance', due: owed - p.icBalance };
  const left = p.icBalance - owed;
  store.setPocket({ ...p, icBalance: left, insideGate: false, entry: null });
  return { ok: true, entering, fare: owed, balance: left };
}

/**
 * Présenter sa carte (ou son billet) au lecteur d'un passage.
 *
 * Rend `true` quand le passage s'ouvre. La main qui s'avance est un geste
 * visible (`runtime.cardTap`) : c'est ce qu'on voit du coin de l'œil, et sans
 * lui la validation n'aurait été qu'un son. Le VERDICT, lui, ne va nulle part
 * ailleurs que sur la petite dalle de la borne (`s.verdict`) : c'est là qu'un
 * portillon réel l'écrit, et c'est là qu'on le lit.
 */
export function tapGate(id: string, dir: 1 | -1): boolean {
  const list = ensure();
  const s = list[Number(id.slice(2))];
  if (!s) return false;
  const entering = dir === -1;
  const verdict = validate(entering);
  s.verdict = verdict;
  s.verdictT = verdict.ok ? 3.2 : DENY_SHOW;
  runtime.cardTap = 1;
  if (!verdict.ok) {
    gateDeny();
    s.light = 'deny';
    s.lightT = DENY_SHOW;
    s.grantT = 0;
    if (s.target !== 0) {
      s.target = 0;
      gateFlap(true);
    }
    return false;
  }
  gateBeep();
  s.light = 'ok';
  s.lightT = 1.6;
  s.grantT = GRANT;
  s.grantDir = dir;
  if (s.target !== 1) {
    s.target = 1;
    gateFlap(false);
  }
  return true;
}

// --- Blocage de la marche -------------------------------------------------

/**
 * Ce passage barre-t-il le chemin ?
 *
 * Les battants ne sont pas une image : `systems/walkable` interroge cette
 * fonction, et un portillon fermé arrête vraiment. Le seuil est bas (0,55) pour
 * la même raison qu'un seuil de porte de rame : à demi ouverts, des battants
 * laissent déjà passer un corps, et être arrêté par un vantail qui a fini de se
 * rabattre serait un mensonge dans l'autre sens.
 */
export function gateBlocks(passage: number): boolean {
  const s = states[passage];
  return !!s && s.flap < 0.55;
}

/**
 * Le passage sous un point du hall, ou -1.
 *
 * Exporté pour `systems/walkable`, qui doit savoir DANS QUEL passage il est
 * avant de demander s'il est fermé - la ligne de portillons est un seul
 * rectangle percé de plusieurs baies.
 */
export function passageAt(localX: number, localZ: number): number {
  const place = placementFor(useStore.getState().platformIndex, psdGates());
  const it = place.interior;
  if (!it.built) return -1;
  if (localZ < it.gate.z0 || localZ > it.gate.z1) return -1;
  for (let i = 0; i < it.gate.passages.length; i++) {
    const p = it.gate.passages[i];
    if (Math.abs(localX - p.x) <= p.width / 2) return i;
  }
  return -1;
}

// --- Boucle ---------------------------------------------------------------

export function updateFareGates(dt: number): void {
  const list = ensure();
  if (!list.length) return;
  const store = useStore.getState();
  const place = placementFor(store.platformIndex, psdGates());
  const it = place.interior;
  const px = runtime.playerPlatX;
  const pz = runtime.playerPlatZ;
  const near = runtime.playerLevel === 'concourse';

  runtime.cardTap = Math.max(0, runtime.cardTap - dt * 1.6);

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const p = it.gate.passages[i];
    if (s.grantT > 0) s.grantT -= dt;
    if (s.lightT > 0) {
      s.lightT -= dt;
      if (s.lightT <= 0) s.light = 'open';
    }
    if (s.verdictT > 0) {
      s.verdictT -= dt;
      if (s.verdictT <= 0) s.verdict = null;
    }

    // Quelqu'un se présente-t-il ? Le fuseau du passage, un peu élargi, et une
    // approche de part et d'autre de la ligne.
    const inLane = near && Math.abs(px - p.x) < p.width / 2 + 0.35;
    const dz = pz < it.gate.z0 ? it.gate.z0 - pz : pz > it.gate.z1 ? pz - it.gate.z1 : 0;
    const coming = inLane && dz < CLOSE_AT;
    // Quelqu'un DANS le passage n'y est jamais enfermé : les battants ne se
    // referment pas sur lui parce que sa validation a expiré pendant qu'il
    // hésitait. Un portillon réel ne pince personne - il attend d'être libre.
    const inside = inLane && dz === 0;
    const want = !coming || inside || s.grantT > 0 ? 1 : 0;
    if (want !== s.target) {
      s.target = want;
      gateFlap(want === 0);
      if (want === 0 && s.light === 'open') {
        s.light = 'deny';
        s.lightT = 1.2;
      }
    }
    s.flap += Math.sign(s.target - s.flap) * Math.min(Math.abs(s.target - s.flap), FLAP_RATE * dt);
  }
}

/** Rouvre tout : changement de gare, retour à la rame. */
export function resetFareGates(): void {
  builtFor = -1;
  states = [];
}
