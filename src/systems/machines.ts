// Les machines qui rendent quelque chose.
//
// Un distributeur qui ne distribue pas est un caisson peint ; un 券売機 devant
// lequel on ne peut rien acheter est une image de 券売機. Ce module est ce qui
// manquait entre les deux : le DÉROULÉ d'un achat, avec son argent, son
// attente, sa chute et sa monnaie rendue.
//
// IL N'Y A PAS D'INTERFACE. On n'ouvre pas un écran devant ses yeux pour
// acheter un thé : on glisse une pièce dans une fente, on regarde un bouton
// s'allumer, on appuie dessus, ça tombe, on se baisse. Tout ce que cette
// mécanique produit s'affiche donc SUR LA MACHINE - l'afficheur de crédit, la
// lampe des boutons vendables, l'écran du 券売機 - et jamais dans le HUD. Les
// pièces qu'on vise sont de vraies pièces de mobilier (systems/pick).
//
// L'ÉTAT VIT PAR MACHINE, et il survit à un pas de côté : on peut mettre trois
// pièces, aller voir la machine d'à côté et revenir finir son achat, exactement
// comme un crédit reste dans une vraie machine tant qu'on n'a pas tiré le
// levier. Il se remet à zéro en changeant de gare, parce qu'alors ce n'est plus
// la même machine.

import {
  CHARGE_AMOUNTS,
  COINS,
  fareFor,
  IC_CARD_DEPOSIT,
  IC_CARD_PRICE,
  machineSlots,
  type Product,
} from '../data/products';
import { useStore } from '../store';
import {
  FOOD_BRANDS,
  vendingBrand,
  vendingCols,
  VENDING_ROWS,
  type VendingBrand,
} from '../textures/vending';
import {
  deviceBillFeed,
  deviceButton,
  deviceCoin,
  gateDeny,
  ticketPrint,
  vendingChange,
  vendingDispense,
  vendingFlap,
} from './audioEngine';
import { runtime } from './runtime';
import { placementFor } from './stationPlacement';
import { psdGates } from '../three/station/psdLayout';

/**
 * Ce que la machine AFFICHE sur son propre écran, en clé de traduction plus un
 * nombre.
 *
 * Une machine japonaise ne parle pas français ; mais le joueur, lui, doit
 * comprendre pourquoi rien ne tombe. La vitrine et les plaquettes restent donc
 * en japonais - c'est du décor - et cette ligne-là, qui est un message de
 * service, suit la langue de l'interface. C'est le même partage que les
 * annonces sonores et le HUD.
 */
export interface Notice {
  key:
    | 'insertMore'
    | 'soldOut'
    | 'noCash'
    | 'icLow'
    | 'noIc'
    | 'icReady'
    | 'takeIt'
    | 'ticketOut'
    | 'charged'
    | 'cardBought'
    | 'nothingDue'
    | 'settled'
    | 'hasTicket'
    | 'change';
  amount?: number;
}

export interface MachineState {
  /** Crédit inséré (yens). */
  credit: number;
  /** Carte présentée : le paiement suivant passera par elle. */
  ic: boolean;
  /** Temps restant de cette présentation (s) : une carte ne reste pas armée. */
  icT: number;
  stage: 'idle' | 'busy' | 'ready';
  busyT: number;
  /** Ce qui est tombé dans la sébile, à ramasser. */
  pending: Product | null;
  /** Un billet est sorti de la fente et attend d'être pris. */
  pendingTicket: number | null;
  notice: Notice | null;
  noticeT: number;
  /** Volet poussé : 1 au moment du geste, retombe tout seul. */
  flap: number;
  /** Le rayon de CETTE machine, couloir par couloir. */
  slots: (Product | null)[];
  brand: VendingBrand | null;
  cols: number;
  rows: number;
}

/** Temps que met une spirale à faire tomber un article (s). */
const VEND_TIME = 1.05;
/** Temps que met une imprimante à sortir un billet (s). */
const PRINT_TIME = 1.15;
/** Combien de temps une carte présentée reste armée (s). */
const IC_ARM = 12;
/** Combien de temps un message reste à l'écran (s). */
const NOTICE_HOLD = 4;

const states = new Map<string, MachineState>();
let builtFor = -1;

/**
 * Incrémenté à chaque changement d'état d'une machine.
 *
 * Les surfaces qui en dépendent - l'afficheur de crédit, la vitrine dont les
 * lampes s'allument, l'écran du 券売機 - sont des canevas : elles se redessinent
 * quand ce compteur bouge, et pas soixante fois par seconde.
 */
export const machineRevision = { n: 0 };

function touch(): void {
  machineRevision.n++;
}

/**
 * La marque de la machine qu'on a devant soi.
 *
 * Elle n'est pas rangée dans le registre des appareils : c'est le RENDU qui la
 * décide (three/station/VendingMachines pour le quai, station/Fixtures pour le
 * hall), et la reproduire ici garantit que la vitrine et le catalogue parlent
 * de la même enseigne. Les deux appellent `vendingBrand` avec les mêmes
 * arguments - c'est la seule façon de ne pas vendre du café dans une machine
 * peinte en bleu soda.
 */
export function brandOf(id: string): VendingBrand {
  const store = useStore.getState();
  const place = placementFor(store.platformIndex, psdGates());
  if (id.startsWith('pv')) {
    return vendingBrand(store.platformIndex, Number(id.slice(2)), place.vending.length);
  }
  const index = Number(id.slice(2));
  const fixture = place.interior.fixtures[index];
  if (fixture?.kind === 'vendingFood') return FOOD_BRANDS[fixture.slot % FOOD_BRANDS.length];
  return vendingBrand(store.platformIndex, (fixture?.slot ?? 0) % 2, 2);
}

/** Graine stable d'une machine : sa gare et son rang. */
function seedOf(id: string): number {
  const store = useStore.getState();
  let h = store.platformIndex * 7919 + 17;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** L'état d'une machine, créé à la demande. */
export function machineState(id: string): MachineState {
  const index = useStore.getState().platformIndex;
  if (builtFor !== index) {
    builtFor = index;
    states.clear();
  }
  let s = states.get(id);
  if (!s) {
    const vending = id.startsWith('pv') || id.startsWith('cf');
    const brand = vending ? brandOf(id) : null;
    const cols = brand ? vendingCols(brand) : 0;
    const rows = brand ? VENDING_ROWS : 0;
    s = {
      credit: 0,
      ic: false,
      icT: 0,
      stage: 'idle',
      busyT: 0,
      pending: null,
      pendingTicket: null,
      notice: null,
      noticeT: 0,
      flap: 0,
      slots: brand ? machineSlots(brand, runtime.tokyoDate.month, seedOf(id), cols, rows) : [],
      brand,
      cols,
      rows,
    };
    states.set(id, s);
  }
  return s;
}

/** Les machines dont l'état est déjà né : pour la boucle, pas pour le rendu. */
function live(): MachineState[] {
  return [...states.values()];
}

function say(s: MachineState, notice: Notice | null): void {
  s.notice = notice;
  s.noticeT = notice ? NOTICE_HOLD : 0;
  touch();
}

// --- L'argent ------------------------------------------------------------

/**
 * Glisser une pièce dans la fente.
 *
 * On ne CHOISIT pas la coupure : on sort ce qu'on a, et l'on met la plus grosse
 * pièce qui reste utile. C'est ce que fait n'importe qui devant un
 * distributeur, et c'est aussi ce qui évite d'avoir à afficher un clavier de
 * pièces qui n'existe pas dans la vraie vie. Un appui = une pièce.
 */
export function insertCoin(id: string): boolean {
  const s = machineState(id);
  if (s.stage === 'busy') return false;
  const store = useStore.getState();
  // La plus grosse pièce (jamais un billet) qu'on ait sur soi.
  const coin = [...COINS].filter((c) => c < 1000).reverse().find((c) => store.cash >= c);
  if (!coin) {
    say(s, { key: 'noCash' });
    return false;
  }
  store.setCash(store.cash - coin);
  s.credit += coin;
  s.ic = false;
  deviceCoin(coin);
  say(s, null);
  return true;
}

/** Glisser un billet de mille dans l'avaleur. */
export function insertBill(id: string): boolean {
  const s = machineState(id);
  if (s.stage === 'busy') return false;
  const store = useStore.getState();
  if (store.cash < 1000) {
    say(s, { key: 'noCash' });
    return false;
  }
  store.setCash(store.cash - 1000);
  s.credit += 1000;
  s.ic = false;
  deviceBillFeed();
  say(s, null);
  return true;
}

/** Le levier de rendu : tout ce qui est dedans retombe dans la sébile. */
export function pullLever(id: string): boolean {
  const s = machineState(id);
  if (s.credit <= 0) return false;
  const store = useStore.getState();
  store.setCash(store.cash + s.credit);
  vendingChange(Math.min(6, Math.ceil(s.credit / 100)));
  s.credit = 0;
  say(s, { key: 'change' });
  return true;
}

/**
 * Présenter sa carte au lecteur de la machine.
 *
 * L'ordre est celui de la vraie vie : on touche d'abord, on choisit ensuite -
 * et la machine ne reste armée qu'une douzaine de secondes. Reposer la carte
 * en cours de route la désarme, comme on la retire de la borne.
 */
export function tapMachineIc(id: string): boolean {
  const s = machineState(id);
  if (s.stage === 'busy') return false;
  const { pocket } = useStore.getState();
  if (!pocket.ic) {
    gateDeny();
    say(s, { key: 'noIc' });
    return false;
  }
  s.ic = !s.ic;
  s.icT = s.ic ? IC_ARM : 0;
  runtime.cardTap = 1;
  deviceButton();
  say(s, s.ic ? { key: 'icReady', amount: pocket.icBalance } : null);
  return true;
}

/**
 * Prélève `price`, par la carte si elle est présentée, par le crédit sinon.
 * Rend false et pose l'avertissement quand il manque de quoi payer.
 */
function charge(s: MachineState, price: number, cashOnly = false): boolean {
  const store = useStore.getState();
  if (s.ic && !cashOnly) {
    if (store.pocket.icBalance < price) {
      say(s, { key: 'icLow', amount: price - store.pocket.icBalance });
      return false;
    }
    store.setPocket({ ...store.pocket, icBalance: store.pocket.icBalance - price });
    s.ic = false;
    s.icT = 0;
    return true;
  }
  if (s.credit < price) {
    say(s, { key: 'insertMore', amount: price - s.credit });
    return false;
  }
  s.credit -= price;
  return true;
}

/** Ce couloir est-il payable en l'état ? C'est ce que dit sa petite lampe. */
export function affordable(s: MachineState, p: Product | null): boolean {
  if (!p) return false;
  if (s.ic) return useStore.getState().pocket.icBalance >= p.price;
  return s.credit >= p.price;
}

/** Les lampes de la vitrine, couloir par couloir : pour la texture. */
export function litSlots(s: MachineState): boolean[] {
  return s.slots.map((p) => affordable(s, p));
}

// --- Le distributeur -----------------------------------------------------

/** Appuyer sur le bouton du couloir `cell`. */
export function pressVendingButton(id: string, cell: number): boolean {
  const s = machineState(id);
  if (s.stage !== 'idle') return false;
  const p = s.slots[cell] ?? null;
  if (!p) {
    gateDeny();
    say(s, { key: 'soldOut' });
    return false;
  }
  if (!charge(s, p.price)) {
    gateDeny();
    return false;
  }
  deviceButton();
  vendingDispense(p.shape === 'bottle');
  s.stage = 'busy';
  s.busyT = VEND_TIME;
  s.pending = p;
  say(s, null);
  return true;
}

/**
 * Ramasser ce qui est tombé.
 *
 * C'est un geste à part, et il compte : on se baisse, on pousse le volet, on
 * sort la bouteille. Sans lui, la boisson apparaîtrait dans la main sans que
 * rien n'ait eu lieu - et c'est très exactement la différence entre un
 * distributeur qui marche et un bouton d'inventaire.
 */
export function collect(id: string): boolean {
  const s = machineState(id);
  if (s.stage !== 'ready') return false;
  const store = useStore.getState();
  if (store.held) {
    // Une main, un objet. On ne repart pas avec quatre canettes.
    say(s, { key: 'takeIt' });
    return false;
  }
  s.flap = 1;
  vendingFlap();
  if (s.pending) {
    const p = s.pending;
    store.setHeld({ productId: p.id, sips: p.sips, maxSips: p.sips, opened: false });
    s.pending = null;
  }
  if (s.pendingTicket !== null) {
    store.setPocket({
      ...store.pocket,
      ticket: { fare: s.pendingTicket, from: store.platformIndex },
    });
    s.pendingTicket = null;
  }
  s.stage = 'idle';
  say(s, null);
  return true;
}

// --- Le distributeur de titres -------------------------------------------

/** Ce que montre l'écran d'un 券売機 : trois pages, comme la vraie machine. */
export type TicketPage = 'fares' | 'charge' | 'card';

/** La page ouverte, par poste. Elle vit ici : c'est l'état de l'écran. */
const pages = new Map<string, TicketPage>();

export function ticketPage(id: string): TicketPage {
  return pages.get(id) ?? 'fares';
}

export function setTicketPage(id: string, page: TicketPage): void {
  pages.set(id, page);
  deviceButton();
  touch();
}

export function buyTicket(id: string, fare: number): boolean {
  const s = machineState(id);
  if (s.stage !== 'idle') return false;
  const store = useStore.getState();
  if (store.pocket.ticket) {
    gateDeny();
    say(s, { key: 'hasTicket' });
    return false;
  }
  // Un billet s'achète en espèces : c'est ce que fait la machine réelle, qui
  // n'accepte la carte que pour la recharger.
  if (!charge(s, fare, true)) {
    gateDeny();
    return false;
  }
  ticketPrint();
  s.stage = 'busy';
  s.busyT = PRINT_TIME;
  s.pendingTicket = fare;
  say(s, null);
  return true;
}

export function chargeIc(id: string, amount: number): boolean {
  const s = machineState(id);
  if (s.stage !== 'idle') return false;
  const store = useStore.getState();
  if (!store.pocket.ic) {
    gateDeny();
    say(s, { key: 'noIc' });
    return false;
  }
  // On ne recharge pas une carte avec elle-même : la machine avale le crédit
  // inséré, et rien d'autre.
  if (!charge(s, amount, true)) {
    gateDeny();
    return false;
  }
  store.setPocket({ ...store.pocket, icBalance: store.pocket.icBalance + amount });
  deviceButton();
  vendingChange(2);
  say(s, { key: 'charged', amount });
  return true;
}

export function buyIcCard(id: string): boolean {
  const s = machineState(id);
  if (s.stage !== 'idle') return false;
  const store = useStore.getState();
  if (store.pocket.ic) {
    gateDeny();
    say(s, { key: 'nothingDue' });
    return false;
  }
  if (!charge(s, IC_CARD_PRICE, true)) {
    gateDeny();
    return false;
  }
  store.setPocket({ ...store.pocket, ic: true, icBalance: IC_CARD_PRICE - IC_CARD_DEPOSIT });
  ticketPrint();
  say(s, { key: 'cardBought', amount: IC_CARD_PRICE - IC_CARD_DEPOSIT });
  return true;
}

// --- L'ajusteur de fin de course (精算機) --------------------------------

/**
 * Ce qu'il reste à payer ici et maintenant.
 *
 * Trois cas, et ce sont les trois vraies raisons d'aller à un 精算機 : le billet
 * acheté ne couvre pas le trajet fait, la carte n'a plus de quoi passer, ou l'on
 * n'a rien du tout. Zéro veut dire qu'on peut sortir par le portillon - et c'est
 * ce que la machine répond alors, sans prendre un yen.
 */
export function amountDue(): number {
  const store = useStore.getState();
  const { pocket } = store;
  const from = pocket.entry ?? pocket.ticket?.from ?? store.platformIndex;
  const owed = fareFor(store.platformIndex - from);
  if (pocket.ticket) return Math.max(0, owed - pocket.ticket.fare);
  if (pocket.ic) return Math.max(0, owed - pocket.icBalance);
  return owed;
}

export function payAdjustment(id: string): boolean {
  const s = machineState(id);
  if (s.stage !== 'idle') return false;
  const due = amountDue();
  const store = useStore.getState();
  if (due <= 0) {
    deviceButton();
    say(s, { key: 'nothingDue' });
    return false;
  }
  if (!charge(s, due, true)) {
    gateDeny();
    return false;
  }
  if (store.pocket.ticket) {
    store.setPocket({
      ...store.pocket,
      ticket: { ...store.pocket.ticket, fare: store.pocket.ticket.fare + due },
    });
    ticketPrint();
    s.stage = 'busy';
    s.busyT = PRINT_TIME;
  } else {
    // Sans billet, l'ajusteur recharge la carte du strict nécessaire : c'est ce
    // que fait le 「チャージ」 d'un 精算機 quand le solde ne suffit pas.
    store.setPocket({ ...store.pocket, ic: true, icBalance: store.pocket.icBalance + due });
    deviceCoin(100);
  }
  say(s, { key: 'settled', amount: due });
  return true;
}

// --- Boucle ---------------------------------------------------------------

export function updateMachines(dt: number): void {
  for (const s of live()) {
    if (s.flap > 0) s.flap = Math.max(0, s.flap - dt * 1.4);
    if (s.icT > 0) {
      s.icT -= dt;
      if (s.icT <= 0 && s.ic) {
        s.ic = false;
        touch();
      }
    }
    if (s.noticeT > 0) {
      s.noticeT -= dt;
      if (s.noticeT <= 0) {
        s.notice = null;
        touch();
      }
    }
    if (s.stage === 'busy') {
      s.busyT -= dt;
      if (s.busyT <= 0) {
        s.stage = 'ready';
        say(s, s.pendingTicket !== null ? { key: 'ticketOut' } : { key: 'takeIt' });
      }
    }
  }
}

/** Remet toutes les machines à zéro : changement de gare, fin de partie. */
export function resetMachines(): void {
  states.clear();
  pages.clear();
  builtFor = -1;
  touch();
}

export { COINS, CHARGE_AMOUNTS };
