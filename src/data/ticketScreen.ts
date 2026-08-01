// L'écran tactile d'un 券売機, case par case.
//
// C'est une DALLE, pas une interface : elle est peinte sur la machine, on la
// touche du doigt, et le réticule y désigne une case comme un doigt y désigne
// un bouton (systems/pick lit la coordonnée de texture du point visé). Cette
// trame est donc partagée par deux consommateurs qui doivent absolument être
// d'accord - le canevas qui la dessine (textures/ticket) et la mécanique qui
// l'écoute (systems/interaction). Une case dessinée à un endroit et active à un
// autre se verrait au premier appui.
//
// QUATRE COLONNES, CINQ RANGÉES. Les onglets en tête, les choix au milieu, et
// la dernière rangée pour la ligne d'état - celle qui dit « il manque 40 ¥ » ou
// « きっぷが出ました ». Cette rangée-là ne se touche pas.

import { CHARGE_AMOUNTS, FARES, IC_CARD_PRICE } from './products.ts';

export const TICKET_COLS = 4;
export const TICKET_ROWS = 5;

export type TicketPage = 'fares' | 'charge' | 'card';

export type TicketCell =
  | { kind: 'page'; page: TicketPage }
  | { kind: 'fare'; amount: number }
  | { kind: 'charge'; amount: number }
  | { kind: 'card'; amount: number }
  | { kind: 'settle'; amount: number };

/** Étiquette dessinée sur une case : ce qui est écrit dessus, en japonais. */
export function cellLabel(cell: TicketCell): { top: string; sub?: string } {
  switch (cell.kind) {
    case 'page':
      return cell.page === 'fares'
        ? { top: 'きっぷ', sub: 'Tickets' }
        : cell.page === 'charge'
          ? { top: 'チャージ', sub: 'Charge' }
          : { top: 'カード', sub: 'IC card' };
    case 'fare':
      return { top: `¥${cell.amount}` };
    case 'charge':
      return { top: `¥${cell.amount.toLocaleString('en-US')}` };
    case 'card':
      return { top: `¥${cell.amount.toLocaleString('en-US')}`, sub: 'デポジット ¥500' };
    case 'settle':
      return { top: `¥${cell.amount.toLocaleString('en-US')}`, sub: '精算' };
  }
}

/**
 * La trame d'un 券売機 ordinaire : trois onglets, puis la page ouverte.
 *
 * `null` est une case morte - une dalle tactile en a toujours, et c'est ce qui
 * fait qu'on ne se trompe pas de bouton en visant à peu près.
 */
export function ticketCells(page: TicketPage): (TicketCell | null)[] {
  const cells: (TicketCell | null)[] = [
    { kind: 'page', page: 'fares' },
    { kind: 'page', page: 'charge' },
    { kind: 'page', page: 'card' },
    null,
  ];
  const body: (TicketCell | null)[] =
    page === 'fares'
      ? FARES.map((amount) => ({ kind: 'fare' as const, amount }))
      : page === 'charge'
        ? CHARGE_AMOUNTS.map((amount) => ({ kind: 'charge' as const, amount }))
        : [{ kind: 'card' as const, amount: IC_CARD_PRICE }];
  for (let i = 0; i < TICKET_COLS * (TICKET_ROWS - 2); i++) cells.push(body[i] ?? null);
  // La dernière rangée est la ligne d'état : elle s'affiche, elle ne s'appuie pas.
  for (let i = 0; i < TICKET_COLS; i++) cells.push(null);
  return cells;
}

/**
 * La trame d'un 精算機 : un seul bouton, et il est gros.
 *
 * Un ajusteur de fin de course ne propose pas de choix - il annonce ce qu'on
 * doit, et l'on paie. Toute la deuxième rangée est ce bouton-là, pour qu'on ne
 * puisse pas le manquer avec un train qui part.
 */
export function adjustCells(due: number): (TicketCell | null)[] {
  const cells: (TicketCell | null)[] = new Array(TICKET_COLS * TICKET_ROWS).fill(null);
  if (due > 0) {
    for (let i = 0; i < TICKET_COLS; i++) {
      cells[TICKET_COLS * 2 + i] = { kind: 'settle', amount: due };
    }
  }
  return cells;
}
