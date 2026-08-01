// Une seule touche, et ce qu'elle fait dépend de ce qu'on a devant soi.
//
// Le jeu avait déjà « E » pour adresser la parole à un voyageur. Ajouter une
// touche par famille d'appareil - une pour acheter, une pour valider, une pour
// boire - aurait été le contraire de ce qu'on cherche : dans une gare, on ne
// choisit pas un verbe, on tend la main vers ce qu'on regarde. La touche reste
// donc unique, et c'est la VISÉE qui décide - la vraie visée, celle d'un rayon
// tiré du réticule sur une pièce de mobilier (systems/pick).
//
// AUCUN ÉCRAN NE S'OUVRE. Ce qu'on vise est un bouton, une fente, un lecteur,
// un volet ; ce que la machine répond s'affiche sur SA dalle. La seule chose
// que le HUD ajoute est l'invite sous le réticule, qui nomme le geste - c'est
// le même idiome que « Appuyez sur E pour parler », et c'est ce qui remplace le
// fait qu'on ne peut pas tendre la main dans un écran.
//
// L'ORDRE DES PRIORITÉS EST LE SUJET DE CE FICHIER, et il n'est pas arbitraire :
//
//   1. une pièce de mobilier sous le réticule passe d'abord - on la vise de
//      près, donc c'est qu'on la veut ;
//   2. puis quelqu'un à qui parler (systems/conversation, qui consomme la
//      demande si elle lui parvient) ;
//   3. et en dernier ce qu'on tient : on ne boit que quand la touche n'a rien
//      trouvé d'autre à faire. Sinon, tendre son thé vers un voisin l'aurait
//      empêché de nous répondre.
//
// Le point 1 est traité AVANT la boucle de dialogue, le point 3 après : c'est
// ce qui met la conversation au milieu sans qu'aucun des deux modules n'ait à
// connaître l'autre.

import { productById } from '../data/products';
import { adjustCells, ticketCells, type TicketCell } from '../data/ticketScreen';
import { useStore } from '../store';
import { binToss, canOpen, paxDrink } from './audioEngine';
import { gateStates, tapGate } from './fareGate';
import { input } from './input';
import {
  amountDue,
  buyIcCard,
  buyTicket,
  chargeIc,
  collect,
  insertBill,
  insertCoin,
  machineState,
  payAdjustment,
  pressVendingButton,
  pullLever,
  setTicketPage,
  tapMachineIc,
  ticketPage,
  updateMachines,
} from './machines';
import { pick, updatePick, type PickHit } from './pick';

/** Ce que l'invite du HUD doit dire, ou null s'il n'y a rien à faire. */
export type PromptKey =
  | 'buy'
  | 'soldOut'
  | 'insertCoin'
  | 'insertBill'
  | 'tapIc'
  | 'tapIcOff'
  | 'lever'
  | 'take'
  | 'ticketFare'
  | 'ticketCharge'
  | 'ticketCard'
  | 'ticketPage'
  | 'settle'
  | 'tapIn'
  | 'tapOut'
  | 'throwAway'
  | 'openDrink'
  | 'drink'
  | 'emptyHands';

/**
 * L'invite courante.
 *
 * Sondée par l'interface comme tout le reste : elle change au pas de la visée
 * (dix fois par seconde), pas au pas de l'image. `name` porte ce qui est écrit
 * sur la plaquette qu'on vise - le nom d'un article - et `amount` son prix : le
 * HUD ne nomme jamais rien que la machine n'affiche déjà.
 */
export const prompt: { key: PromptKey | null; name: string; amount: number } = {
  key: null,
  name: '',
  amount: 0,
};

/** Ce qui se boit se reconnaît à sa forme : un sachet de sembei, non. */
function drinkable(productId: string): boolean {
  const p = productById(productId);
  return !!p && p.shape !== 'noodle' && p.shape !== 'ice';
}

/** La case de l'écran d'un 券売機 (ou d'un 精算機) sous le réticule. */
function screenCell(hit: PickHit): TicketCell | null {
  const cells = hit.act.id.startsWith('cadj')
    ? adjustCells(amountDue())
    : ticketCells(ticketPage(hit.act.id));
  return cells[hit.cell] ?? null;
}

function setPrompt(key: PromptKey | null, name = '', amount = 0): void {
  prompt.key = key;
  prompt.name = name;
  prompt.amount = amount;
}

function promptFor(hit: PickHit | null): void {
  const held = useStore.getState().held;
  if (hit) {
    const s = machineState(hit.act.id);
    switch (hit.act.kind) {
      case 'vendSlot': {
        // Une machine qui a déjà servi attend qu'on se baisse : tant que le
        // volet est plein, ses boutons ne répondent plus. C'est ce que fait une
        // vraie machine, et c'est ce qui apprend à ramasser.
        if (s.stage !== 'idle') return setPrompt('take');
        const p = s.slots[hit.cell] ?? null;
        if (!p) return setPrompt('soldOut');
        return setPrompt('buy', p.jp, p.price);
      }
      case 'coinSlot':
        return setPrompt('insertCoin');
      case 'billSlot':
        return setPrompt('insertBill');
      case 'icPad':
        return setPrompt(s.ic ? 'tapIcOff' : 'tapIc');
      case 'lever':
        return s.credit > 0 ? setPrompt('lever', '', s.credit) : setPrompt(null);
      case 'tray':
        return s.stage === 'ready' ? setPrompt('take') : setPrompt(null);
      case 'screen': {
        const cell = screenCell(hit);
        if (!cell) return setPrompt(null);
        switch (cell.kind) {
          case 'page':
            return setPrompt('ticketPage');
          case 'fare':
            return setPrompt('ticketFare', '', cell.amount);
          case 'charge':
            return setPrompt('ticketCharge', '', cell.amount);
          case 'card':
            return setPrompt('ticketCard', '', cell.amount);
          case 'settle':
            return setPrompt('settle', '', cell.amount);
        }
        return setPrompt(null);
      }
      case 'gate':
        return setPrompt(hit.act.dir === -1 ? 'tapIn' : 'tapOut');
      case 'bin':
        return held ? setPrompt('throwAway') : setPrompt(null);
    }
  }
  if (held) {
    if (!drinkable(held.productId)) return setPrompt(held.sips > 0 ? 'drink' : 'throwAway');
    if (!held.opened) return setPrompt('openDrink');
    return setPrompt(held.sips > 0 ? 'drink' : 'emptyHands');
  }
  setPrompt(null);
}

// --- Ce qu'on tient ------------------------------------------------------

/**
 * Ouvrir, puis boire.
 *
 * Le premier appui décapsule - c'est un geste à part, et il a son bruit ; les
 * suivants vident l'objet gorgée par gorgée. Une fois vide, il ne se passe plus
 * rien : la canette ne disparaît pas toute seule, il faut aller la jeter, ce
 * qui est très exactement ce qu'un quai japonais attend de vous.
 */
export function consumeHeld(): boolean {
  const store = useStore.getState();
  const held = store.held;
  if (!held) return false;
  if (!held.opened) {
    store.setHeld({ ...held, opened: true });
    canOpen();
    return true;
  }
  if (held.sips <= 0) return false;
  store.setHeld({ ...held, sips: held.sips - 1 });
  paxDrink(0);
  return true;
}

/** Jeter ce qu'on tient dans le bac de tri qu'on a devant soi. */
export function tossHeld(): boolean {
  const store = useStore.getState();
  if (!store.held) return false;
  binToss();
  store.setHeld(null);
  return true;
}

// --- Aiguillage ----------------------------------------------------------

function act(hit: PickHit): void {
  const id = hit.act.id;
  switch (hit.act.kind) {
    case 'vendSlot':
      if (machineState(id).stage !== 'idle') collect(id);
      else pressVendingButton(id, hit.cell);
      break;
    case 'coinSlot':
      insertCoin(id);
      break;
    case 'billSlot':
      insertBill(id);
      break;
    case 'icPad':
      tapMachineIc(id);
      break;
    case 'lever':
      pullLever(id);
      break;
    case 'tray':
      collect(id);
      break;
    case 'screen': {
      const cell = screenCell(hit);
      if (!cell) break;
      if (cell.kind === 'page') setTicketPage(id, cell.page);
      else if (cell.kind === 'fare') buyTicket(id, cell.amount);
      else if (cell.kind === 'charge') chargeIc(id, cell.amount);
      else if (cell.kind === 'card') buyIcCard(id);
      else payAdjustment(id);
      break;
    }
    case 'gate':
      tapGate(hit.act.id, hit.act.dir ?? 1);
      break;
    case 'bin':
      tossHeld();
      break;
  }
}

/**
 * Première moitié : la pièce de mobilier visée.
 *
 * Appelée AVANT `updateConversation`. Si elle consomme la demande, le dialogue
 * ne la verra pas - c'est le seul mécanisme de priorité, et il n'en faut pas
 * d'autre.
 */
export function updateInteraction(dt: number): void {
  updatePick(dt);
  updateMachines(dt);
  promptFor(pick.hit);

  if (!input.talkRequest) return;
  const hit = pick.hit;
  if (!hit) return;
  input.talkRequest = false;
  act(hit);
  // L'invite se recalcule tout de suite : après un appui, ce qu'on a devant soi
  // ne dit plus la même chose - le bouton qu'on vient de presser annonce
  // maintenant « prendre ».
  promptFor(pick.hit);
}

/**
 * Seconde moitié : boire. Et le DERNIER MAILLON de la chaîne.
 *
 * Appelée APRÈS `updateConversation`. Si la demande est encore là, c'est que ni
 * une machine ni un voisin ne l'a prise - alors on porte à ses lèvres ce qu'on
 * a dans la main.
 *
 * Elle éteint la demande QUOI QU'IL ARRIVE, même les mains vides. Une touche
 * d'action qui passe de main en main doit mourir quelque part : laissée
 * allumée, elle attendrait la première machine devant laquelle on passe et
 * l'actionnerait toute seule, une image plus tard, sans que personne n'ait rien
 * appuyé.
 */
export function updateHeldItem(): void {
  if (!input.talkRequest) return;
  input.talkRequest = false;
  if (!useStore.getState().held) return;
  consumeHeld();
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Pendants de __talk / __conversation, pour la sonde de gare : __aim() dit ce
  // que le réticule touche, __act() appuie, __machine(id) donne l'état d'une
  // machine. Rien de tout cela n'a d'équivalent à l'écran - c'est bien le but.
  const w = window as unknown as Record<string, unknown>;
  w.__aim = () => pick.hit;
  w.__act = () => {
    input.talkRequest = true;
  };
  w.__prompt = () => ({ ...prompt });
  w.__held = () => useStore.getState().held;
  // Mettre un objet dans la main sans passer par l'achat : juger le GESTE ne
  // demande pas de rejouer la monnaie, et la visée d'une sonde dérive.
  w.__give = (id: string) => {
    const p = productById(id);
    if (!p) return null;
    useStore.getState().setHeld({ productId: p.id, sips: p.sips, maxSips: p.sips, opened: true });
    return p.id;
  };
  w.__machine = (id: string) => {
    const s = machineState(id);
    return {
      credit: s.credit,
      ic: s.ic,
      stage: s.stage,
      notice: s.notice,
      slots: s.slots.map((p) => (p ? `${p.id}/${p.price}` : '—')),
    };
  };
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // L'état des portillons de la gare courante : sans lui, une capture ne dit
  // pas si un battant est fermé parce qu'on a refusé ou parce qu'on approche.
  (window as unknown as Record<string, unknown>).__gates = () =>
    gateStates().map((s) => ({
      flap: +s.flap.toFixed(2),
      light: s.light,
      grant: +s.grantT.toFixed(2),
      verdict: s.verdict,
    }));
}
