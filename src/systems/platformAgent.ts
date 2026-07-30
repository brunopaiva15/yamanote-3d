// Ce que l'agent de quai vient dire, et où on l'accroche.
//
// La sono du quai dit déjà les consignes en japonais (systems/stationPa), et
// elle continue : c'est le haut-parleur, il porte loin. Mais un haut-parleur
// n'a jamais fait reculer personne - quand quelqu'un tient une porte, un agent
// se déplace, se plante devant la baie et s'adresse à LUI. C'est ce
// déplacement-là que met en scène systems/platformCrowd ; ce module ne tient
// que sa parole : une phrase courte, dans la langue de l'interface, accrochée
// au-dessus de sa tête comme celle des voyageurs à qui l'on parle.
//
// La bulle vit sa propre vie : elle survit à la fin de la procédure le temps
// d'être lue, et l'agent peut repartir avant qu'elle ne s'efface.

import { useStore } from '../store';
import {
  dismissPlatformAgent,
  platformAgentHead,
  platformAgentPosted,
  summonPlatformAgent,
} from './platformCrowd';

/** Une réplique dans les trois langues de l'interface (même règle que data/dialogue). */
interface AgentLine {
  readonly fr: string;
  readonly en: string;
  readonly ja: string;
}

/**
 * Ce qu'il dit, dans l'ordre où il le dit. Ce n'est pas le script ATOS : il
 * ne lit rien, il parle à quelqu'un qu'il a devant lui, et il monte d'un cran
 * à chaque fois que la porte ne se ferme toujours pas.
 */
const LINES: readonly AgentLine[] = [
  {
    fr: 'Éloignez-vous des portes, s’il vous plaît !',
    en: 'Please stand clear of the doors!',
    ja: 'ドアから離れてください！',
  },
  {
    fr: 'Dégagez la porte, le train ne peut pas partir.',
    en: 'Step away from the door. The train cannot leave.',
    ja: 'ドアが閉まりません。お下がりください！',
  },
  {
    fr: 'Reculez, s’il vous plaît. Prenez le train suivant.',
    en: 'Please step back and take the next train.',
    ja: '無理なご乗車はおやめください。次の電車をご利用ください。',
  },
];

/** Durée d'affichage d'une réplique (s). */
const LINE_DUR = 4.2;

export const platformAgentSpeech = {
  active: false,
  text: '',
  /** Ancre monde de la bulle : la tête de l'agent. */
  x: 0,
  y: 0,
  z: 0,
  t: 0,
  /** Incrémenté à chaque réplique : sert de clé au rendu React. */
  revision: 0,
};

const head = { x: 0, y: 0, z: 0 };

/** Fait venir l'agent devant la baie d'axe `platformZ` (repère quai). */
export function callPlatformAgent(platformZ: number): void {
  summonPlatformAgent(platformZ);
}

/** Est-il arrivé à hauteur de la porte ? */
export function platformAgentReady(): boolean {
  return platformAgentPosted();
}

/**
 * Il dit sa `n`-ième consigne (1, 2, 3…), s'il est bien là pour la dire.
 * @returns false s'il n'est pas encore arrivé - l'appelant réessaiera.
 */
export function platformAgentSays(n: number): boolean {
  if (!platformAgentPosted()) return false;
  if (!platformAgentHead(head)) return false;
  const i = Math.min(LINES.length - 1, Math.max(0, n - 1));
  platformAgentSpeech.active = true;
  platformAgentSpeech.text = LINES[i][useStore.getState().lang];
  platformAgentSpeech.t = 0;
  platformAgentSpeech.revision++;
  return true;
}

/** Consigne unique et neutre pendant la prise en charge d'un voyageur. */
export function platformAgentAssistanceSays(): boolean {
  if (!platformAgentPosted() || !platformAgentHead(head)) return false;
  const line: AgentLine = {
    fr: 'Laissez le passage, s’il vous plaît.',
    en: 'Please make way.',
    ja: '道を空けてください。',
  };
  platformAgentSpeech.active = true;
  platformAgentSpeech.text = line[useStore.getState().lang];
  platformAgentSpeech.t = 0;
  platformAgentSpeech.revision++;
  return true;
}

/** L'affaire est réglée : il regagne la sortie (sa dernière phrase reste). */
export function releasePlatformAgent(): void {
  dismissPlatformAgent();
}

/** À appeler chaque frame : suit sa tête, et retire la bulle en fin de course. */
export function updatePlatformAgentSpeech(dt: number): void {
  if (!platformAgentSpeech.active) return;
  platformAgentSpeech.t += dt;
  if (platformAgentSpeech.t >= LINE_DUR) {
    platformAgentSpeech.active = false;
    platformAgentSpeech.text = '';
    platformAgentSpeech.revision++;
    return;
  }
  // Il parle en marchant vers son poste comme une fois planté devant : la
  // bulle suit sa tête tant qu'il est là, et disparaît avec lui.
  if (platformAgentHead(head)) {
    platformAgentSpeech.x = head.x;
    platformAgentSpeech.y = head.y;
    platformAgentSpeech.z = head.z;
  } else {
    platformAgentSpeech.active = false;
    platformAgentSpeech.text = '';
    platformAgentSpeech.revision++;
  }
}
