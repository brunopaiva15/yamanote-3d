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
//      mécanisme : on s'arrête tout seul. QUELQU'UN, et pas seulement le
//      joueur - la foule les fait claquer aussi, et se les prend devant elle
//      une demi-seconde avant de poser sa carte (systems/platformCrowd) ;
//   3. la validation ouvre pour quelques secondes, le temps de passer - pas
//      pour toujours. Repasser demande de retaper.
//
// ON BIPE AVANT DE PASSER, jamais après : le lecteur est sur le dessus de la
// borne, à l'entrée du passage, et l'on s'y présente du côté d'où l'on vient.
// Entrer en gare se valide côté zone libre, sortir se valide côté zone payante
// (systems/concourseRoute, `paidLegs`).
//
// Le tarif est réel : la carte retient d'où l'on est parti (store.pocket.entry)
// et la sortie facture le nombre d'arrêts (data/products, `fareFor`). Sortir
// sans de quoi payer renvoie au 精算機, exactement comme dans la vraie vie.

import { fareFor, FARES } from '../data/products';
import { PASSAGE_SLACK } from '../data/stationInterior';
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
/**
 * Portée d'un claquement de battants, en mètres.
 *
 * Moins que celle du ピッ (26 m) : un vantail est un bruit MAT, il ne porte pas
 * comme un bip. Et il en faut une, maintenant que la foule les fait claquer -
 * sans elle, on entendait la ligne entière s'agiter depuis le quai, à travers
 * une dalle de béton, pour des baies qu'on ne voit même pas.
 */
const FLAP_EARSHOT = 18;

/**
 * Ce que les VOYAGEURS présentent à un passage, ce sous-pas-ci.
 *
 * Remis à zéro à chaque tour de `updateFareGates` et rempli entre-temps par la
 * foule (`systems/platformCrowd`, qui marche juste avant). Le portillon ne
 * garde donc rien d'eux d'une image sur l'autre : il voit qui est devant lui
 * MAINTENANT, ce qui est exactement ce que fait une cellule.
 */
interface PaxAtGate {
  /** Distance à la ligne du plus proche qui n'a PAS validé (∞ si personne). */
  near: number;
  /** Quelqu'un a validé, ou est déjà entre les bornes : on n'ose pas fermer. */
  hold: boolean;
}

let states: GateState[] = [];
let paxAt: PaxAtGate[] = [];
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
    paxAt = Array.from({ length: n }, () => ({ near: Infinity, hold: false }));
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

/**
 * Un VOYAGEUR passe sa carte : le ピッ, le feu, et la baie qui se rouvre.
 *
 * C'EST LE SON D'UNE GARE JAPONAISE. Pas les annonces, pas les mélodies : ce
 * petit bip toutes les deux secondes, vingt fois par minute, chacun le sien.
 * Une ligne de portillons silencieuse pendant qu'une file la franchit s'entend
 * tout de suite - c'est ce qui manquait au hall.
 *
 * Les battants S'ÉCARTENT ici, parce qu'ils se sont rabattus juste avant : le
 * voyageur qui s'approche sans avoir encore validé les fait claquer comme le
 * joueur les fait claquer (`updateFareGates`), et c'est cet enchaînement-là -
 * ils se ferment sur vous, vous posez la carte, ils s'ouvrent - qui fait le
 * portillon. La baie ne s'ouvre pas pour autant à qui suivrait sans valider :
 * un talonneur retrouve devant lui des vantaux rabattus, la foule y compris.
 *
 * `dist` est la distance au joueur, en mètres : un bip à trente mètres à
 * travers une dalle de béton ne s'entend pas, et on ne le joue pas.
 */
export function paxTapGate(passage: number, dist: number): void {
  const list = ensure();
  const s = list[passage];
  if (!s) return;
  if (s.light === 'open' || s.light === 'deny') {
    s.light = 'ok';
    s.lightT = 1.1;
  }
  // Le joueur qui se présente au même passage sans avoir validé garde la main :
  // ce n'est pas dans le dos de quelqu'un qu'on entre en gare.
  if (s.target !== 1 && playerAtGate(passage) !== 'blocks') {
    s.target = 1;
    const heard = flapGain(passage);
    if (heard > 0) gateFlap(false, heard);
  }
  if (runtime.playerLevel !== 'concourse' || dist > 26) return;
  // Le bip est SEC et près : il ne porte pas, il ponctue. Au-delà de vingt
  // mètres, le hall l'a déjà avalé.
  gateBeep(Math.max(0, 1 - dist / 26) ** 1.6);
}

/**
 * Un voyageur se présente à la ligne : où en est-il, et a-t-il validé ?
 *
 * Appelé par la foule à chaque sous-pas, pour chacun des siens qui est au
 * niveau du hall. C'est le PENDANT de ce que `updateFareGates` mesure tout
 * seul pour le joueur - la même distance, le même fuseau, le même seuil - et
 * les deux se rejoignent dans la même décision : des battants qui se rabattent
 * devant qui n'a rien présenté.
 *
 * `granted` dit que ce voyageur-là a validé et n'a pas fini de traverser. Il
 * est porté par le voyageur et non par le portillon, et c'est ce qui empêche
 * une file de s'engouffrer sur la validation du premier : la baie ne reste
 * ouverte que le temps que CELUI QUI A BIPÉ la franchisse.
 */
export function paxNearGate(x: number, z: number, granted: boolean): void {
  const list = ensure();
  if (!list.length) return;
  const it = placementFor(useStore.getState().platformIndex, psdGates()).interior;
  if (!it.built) return;
  const dz = z < it.gate.z0 ? it.gate.z0 - z : z > it.gate.z1 ? z - it.gate.z1 : 0;
  if (dz >= CLOSE_AT) return;
  for (let i = 0; i < it.gate.passages.length; i++) {
    const p = it.gate.passages[i];
    if (Math.abs(x - p.x) > p.width / 2 + PASSAGE_SLACK) continue;
    const a = paxAt[i];
    // Entre les bornes, on ne pince personne : c'est la règle du joueur, et
    // elle ne dépend pas de qui est là.
    if (granted || dz === 0) a.hold = true;
    else a.near = Math.min(a.near, dz);
    return;
  }
}

/**
 * Ce passage est-il fermé POUR CE VOYAGEUR-LÀ ?
 *
 * La foule s'en sert comme le joueur s'en sert (`systems/walkable`) : des
 * battants rabattus arrêtent. Qui a validé passe - sinon la baie se refermerait
 * sur celui-là même qu'elle vient de laisser entrer.
 */
export function gateShutFor(x: number, z: number, granted: boolean): boolean {
  if (granted || !states.length) return false;
  const passage = passageAt(x, z);
  return passage >= 0 && gateBlocks(passage);
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

/**
 * Ce qu'on entend d'ici du mécanisme de ce passage-là, de 0 à 1.
 *
 * Zéro depuis le quai : la dalle est entre nous et la ligne, et le portillon
 * du hall ne s'entend pas plus que le hall lui-même.
 */
function flapGain(passage: number): number {
  if (runtime.playerLevel !== 'concourse') return 0;
  const it = placementFor(useStore.getState().platformIndex, psdGates()).interior;
  if (!it.built) return 0;
  const p = it.gate.passages[passage];
  if (!p) return 0;
  const d = Math.hypot(
    runtime.playerPlatX - p.x,
    runtime.playerPlatZ - (it.gate.z0 + it.gate.z1) / 2,
  );
  return d >= FLAP_EARSHOT ? 0 : (1 - d / FLAP_EARSHOT) ** 1.4;
}

/** Ce que le JOUEUR demande à un passage, là, tout de suite. */
type PlayerAtGate = 'away' | 'holds' | 'blocks';

/**
 * Le joueur, vu par un passage : loin, dedans, ou dessus sans avoir validé.
 *
 * Le fuseau du passage, un peu élargi, et une approche de part et d'autre de
 * la ligne. Quelqu'un DANS le passage n'y est jamais enfermé (dz nul) : les
 * battants ne se referment pas sur lui parce que sa validation a expiré
 * pendant qu'il hésitait. Un portillon réel ne pince personne - il attend
 * d'être libre.
 */
function playerAtGate(passage: number): PlayerAtGate {
  const s = states[passage];
  if (!s) return 'away';
  if (s.grantT > 0) return 'holds';
  if (runtime.playerLevel !== 'concourse') return 'away';
  const it = placementFor(useStore.getState().platformIndex, psdGates()).interior;
  if (!it.built) return 'away';
  const p = it.gate.passages[passage];
  if (!p || Math.abs(runtime.playerPlatX - p.x) >= p.width / 2 + PASSAGE_SLACK) return 'away';
  const pz = runtime.playerPlatZ;
  const dz = pz < it.gate.z0 ? it.gate.z0 - pz : pz > it.gate.z1 ? pz - it.gate.z1 : 0;
  if (dz === 0) return 'holds';
  return dz < CLOSE_AT ? 'blocks' : 'away';
}

export function updateFareGates(dt: number): void {
  const list = ensure();
  if (!list.length) return;

  runtime.cardTap = Math.max(0, runtime.cardTap - dt * 1.6);

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.grantT > 0) s.grantT -= dt;
    if (s.lightT > 0) {
      s.lightT -= dt;
      if (s.lightT <= 0) s.light = 'open';
    }
    if (s.verdictT > 0) {
      s.verdictT -= dt;
      if (s.verdictT <= 0) s.verdict = null;
    }

    // Qui se présente sans avoir validé ferme les battants, et l'on ne
    // distingue pas le joueur de la foule : une cellule ne sait pas qui elle
    // coupe. Le joueur garde seulement ceci de particulier - il ferme MÊME si
    // un voyageur vient de valider dans la même baie, pour qu'on ne passe pas
    // dans le dos de quelqu'un qui a payé.
    const pax = paxAt[i];
    const me = playerAtGate(i);
    const shut = me === 'blocks' || (me !== 'holds' && !pax.hold && pax.near < CLOSE_AT);
    const want = shut ? 0 : 1;
    if (want !== s.target) {
      s.target = want;
      const heard = flapGain(i);
      if (heard > 0) gateFlap(want === 0, heard);
      if (want === 0 && s.light === 'open') {
        s.light = 'deny';
        s.lightT = 1.2;
      }
    }
    s.flap += Math.sign(s.target - s.flap) * Math.min(Math.abs(s.target - s.flap), FLAP_RATE * dt);
    // La foule se redéclare à chaque sous-pas : le portillon voit qui est
    // devant lui maintenant, et rien de plus.
    pax.near = Infinity;
    pax.hold = false;
  }
}

/** Rouvre tout : changement de gare, retour à la rame. */
export function resetFareGates(): void {
  builtFor = -1;
  states = [];
  paxAt = [];
}
