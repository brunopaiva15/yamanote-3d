// Déclenche les bruitages voyageurs au démarrage d'une action.
// Sons synthétiques discrets (audioEngine) - jamais via la sono PA.

import type { PaxAction } from '../data/paxActions';
import {
  paxBump,
  paxClick,
  paxCough,
  paxDrink,
  paxFabricRustle,
  paxFall,
  paxScuffle,
  paxSlip,
  paxSneeze,
  paxSniffle,
  paxStumble,
  paxYawn,
} from './audioEngine';

/** Joue le Foley associé à une occupation, atténué par la distance au joueur. */
export function playPaxActionSfx(action: PaxAction, dist: number): void {
  switch (action) {
    case 'sneeze':
      paxSneeze(dist);
      break;
    case 'cough':
      paxCough(dist);
      break;
    case 'sniffle':
      paxSniffle(dist);
      break;
    case 'yawn':
      paxYawn(dist);
      break;
    case 'stumble':
      paxStumble(dist);
      break;
    case 'fall':
      paxFall(dist);
      break;
    case 'slip':
      paxSlip(dist);
      break;
    case 'rummageBag':
    case 'fixBag':
    case 'bagAtFeet':
    case 'adjustMask':
    case 'buttonCoat':
    case 'stretch':
      paxFabricRustle(dist, action === 'rummageBag' ? 4 : 2);
      break;
    case 'drink':
      paxDrink(dist);
      break;
    case 'photoSnap':
    case 'earbudAdjust':
    case 'ticketGlance':
      paxClick(dist);
      break;
    case 'argue':
    case 'fight':
    case 'shove':
    case 'scold':
      paxScuffle(dist);
      break;
    case 'gasp':
      paxSniffle(dist);
      break;
    default:
      break;
  }
}

export { paxBump };
