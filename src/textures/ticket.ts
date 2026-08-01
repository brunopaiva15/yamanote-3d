// Les deux surfaces qui parlent, sur une machine.
//
// L'écran tactile d'un 券売機 et le petit afficheur de crédit d'un 自販機 sont
// les seuls endroits où une machine de gare écrit quelque chose qui change. Ce
// sont donc des canevas qu'on REDESSINE - jamais une interface HTML posée
// devant les yeux. Ce qui s'affiche est affiché SUR la machine, à sa place, et
// se lit en la regardant.
//
// Même idiome que textures/procedural : chaque fabrique rend une texture et la
// fonction qui la remet à jour ; la mise en cache est l'affaire de l'appelant.

import * as THREE from 'three';
import { fitFillText, JP_FONT } from './procedural';
import {
  cellLabel,
  TICKET_COLS,
  TICKET_ROWS,
  type TicketCell,
} from '../data/ticketScreen';

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  return { c, g };
}

export interface Redrawable<T extends unknown[]> {
  texture: THREE.CanvasTexture;
  redraw: (...args: T) => void;
}

/**
 * L'écran tactile.
 *
 * Bleu profond, cases claires, texte blanc : c'est la palette de toutes les
 * dalles de 券売機 JR, et elle n'est pas gratuite - un écran de gare doit se
 * lire debout, à un mètre, avec un sac dans une main.
 *
 * `hover` est la case sous le réticule : elle s'éclaire, exactement comme le
 * bouton s'enfonce sous le doigt. Sans ce retour, on ne saurait jamais lequel
 * des seize carrés on est en train de viser.
 */
export function makeTicketScreen(): Redrawable<
  [cells: readonly (TicketCell | null)[], hover: number, status: string, page: string]
> {
  const W = 512;
  const H = 384;
  const { c, g } = makeCanvas(W, H);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const redraw = (
    cells: readonly (TicketCell | null)[],
    hover: number,
    status: string,
    page: string,
  ) => {
    const cw = W / TICKET_COLS;
    const ch = H / TICKET_ROWS;
    // Fond : un dégradé de bleu de nuit, plus clair en haut. Un aplat donnerait
    // un écran éteint.
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#123a58');
    bg.addColorStop(1, '#081a28');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';

    for (let i = 0; i < TICKET_COLS * (TICKET_ROWS - 1); i++) {
      const cell = cells[i] ?? null;
      if (!cell) continue;
      const col = i % TICKET_COLS;
      const row = Math.floor(i / TICKET_COLS);
      const x = col * cw + 6;
      const y = row * ch + 5;
      const w = cw - 12;
      const h = ch - 10;
      const on = i === hover;
      const tab = cell.kind === 'page';
      const active = tab && cell.page === page;

      const face = g.createLinearGradient(0, y, 0, y + h);
      if (active) {
        face.addColorStop(0, '#3fae6a');
        face.addColorStop(1, '#1d6f4a');
      } else if (on) {
        face.addColorStop(0, '#8fd0f4');
        face.addColorStop(1, '#4f9fd0');
      } else {
        face.addColorStop(0, '#e9eff3');
        face.addColorStop(1, '#c2ced6');
      }
      g.fillStyle = face;
      g.beginPath();
      g.roundRect(x, y, w, h, 8);
      g.fill();
      // Le liseré : blanc au repos, franc quand on vise. C'est ce cerne-là qui
      // dit « celui-ci », et non la teinte, qu'on lit mal de biais.
      g.lineWidth = on ? 5 : 2;
      g.strokeStyle = on ? '#ffe9a8' : 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.roundRect(x, y, w, h, 8);
      g.stroke();

      const label = cellLabel(cell);
      g.fillStyle = active ? '#ffffff' : '#0f2130';
      fitFillText(g, label.top, x + w / 2, y + h * (label.sub ? 0.52 : 0.64), w * 0.86, h * 0.5, 'bold');
      if (label.sub) {
        g.fillStyle = active ? 'rgba(255,255,255,0.82)' : 'rgba(15,33,48,0.62)';
        g.font = `500 ${Math.round(h * 0.2)}px ${JP_FONT}`;
        g.fillText(label.sub, x + w / 2, y + h * 0.82);
      }
    }

    // La ligne d'état, en bas : fond noir, encre verte. C'est l'afficheur à
    // sept segments de la machine, et il ne ressemble à rien d'autre.
    const sy = (TICKET_ROWS - 1) * ch + 4;
    g.fillStyle = '#04120a';
    g.beginPath();
    g.roundRect(8, sy, W - 16, ch - 10, 6);
    g.fill();
    g.fillStyle = '#4be08a';
    fitFillText(g, status, W / 2, sy + (ch - 10) * 0.7, W - 40, (ch - 10) * 0.72, 'bold');

    g.textAlign = 'left';
    texture.needsUpdate = true;
  };

  return { texture, redraw };
}

/**
 * L'afficheur de crédit d'un distributeur : deux ou trois chiffres verts.
 *
 * C'est la seule chose qui change sur la platine d'un 自販機, et c'est elle
 * qu'on regarde en glissant sa pièce. Elle affiche le crédit ; quand une carte
 * est présentée, elle affiche 「IC」 - la machine ne compte alors plus des
 * pièces, elle attend un bouton.
 */
export function makeCreditDisplay(): Redrawable<[text: string, warm: boolean]> {
  const W = 256;
  const H = 96;
  const { c, g } = makeCanvas(W, H);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const redraw = (text: string, warm: boolean) => {
    g.fillStyle = '#04120a';
    g.fillRect(0, 0, W, H);
    // Les segments éteints, en filigrane : c'est ce qui fait un afficheur et
    // non un texte posé sur du noir.
    g.fillStyle = 'rgba(75,224,138,0.09)';
    g.textAlign = 'right';
    fitFillText(g, '8888', W - 14, H * 0.78, W - 28, H * 0.72, 'bold');
    g.fillStyle = warm ? '#ffc94b' : '#4be08a';
    fitFillText(g, text, W - 14, H * 0.78, W - 28, H * 0.72, 'bold');
    g.textAlign = 'left';
    texture.needsUpdate = true;
  };
  redraw('0', false);

  return { texture, redraw };
}

/**
 * Le petit afficheur d'une borne de portillon.
 *
 * Trois lignes possibles, jamais plus : le tarif prélevé, le solde restant, ou
 * le motif du refus. Vert sur noir quand ça passe, rouge quand ça ne passe pas
 * - c'est exactement ce que montre la dalle au-dessus d'une borne de 改札, et
 * c'est ce qui fait qu'on comprend sans lever les yeux du sol.
 */
export function makeGateDisplay(): Redrawable<[head: string, sub: string, deny: boolean]> {
  const W = 256;
  const H = 128;
  const { c, g } = makeCanvas(W, H);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const redraw = (head: string, sub: string, deny: boolean) => {
    g.fillStyle = deny ? '#2a0806' : '#04120a';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    if (head) {
      g.fillStyle = deny ? '#ff6a5e' : '#4be08a';
      fitFillText(g, head, W / 2, sub ? H * 0.48 : H * 0.66, W - 20, H * 0.44, 'bold');
    }
    if (sub) {
      g.fillStyle = deny ? 'rgba(255,106,94,0.8)' : 'rgba(75,224,138,0.8)';
      fitFillText(g, sub, W / 2, H * 0.86, W - 20, H * 0.3, 'bold');
    }
    g.textAlign = 'left';
    texture.needsUpdate = true;
  };
  redraw('', '', false);

  return { texture, redraw };
}

/**
 * Le bandeau d'enseigne d'une batterie : 「きっぷうりば」 ou 「のりこし精算」.
 *
 * Blanc sur le vert JR, en gros, et l'anglais dessous en petit : c'est la seule
 * chose qu'on lit d'un bout de couloir, et c'est elle qui dit à quoi sert la
 * machine avant qu'on soit assez près pour voir l'écran.
 *
 * `aspect` EST LE SUJET DE CETTE FONCTION. Le canevas était carrément carré -
 * 512 × 128, quatre pour un - et la bande qui le porte fait plus de trois
 * mètres pour vingt-six centimètres, soit treize pour un : la texture était
 * donc étirée trois fois en largeur, et 「きっぷうりば」 s'étalait sur toute la
 * batterie comme une enseigne de fête foraine. Le canevas prend maintenant la
 * forme de la bande, et le texte y est dessiné à sa taille normale, calé à
 * gauche - c'est ainsi qu'un vrai bandeau de gare est composé : le nom au
 * début, le pictogramme au bout, et du vert entre les deux.
 */
export function makeTicketHeaderTexture(adjust: boolean, aspect = 4): THREE.CanvasTexture {
  const H = 128;
  // La bande peut être très longue (quatre postes) ou courte (un seul 精算機) :
  // on suit sa forme, en gardant des bornes qui tiennent en mémoire de texture.
  const W = Math.round(H * Math.min(24, Math.max(3, aspect)));
  const { c, g } = makeCanvas(W, H);
  const green = '#0f8a44';
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#14a552');
  bg.addColorStop(1, green);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // Le filet clair du haut : la tôle prend le jour par l'arête.
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(0, 0, W, 5);

  const pad = Math.round(H * 0.24);
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  // Le japonais à sa taille propre, et non « étalé sur la largeur disponible » :
  // la largeur maximale est celle du mot, pas celle de la bande.
  const jp = adjust ? 'のりこし精算' : 'きっぷうりば';
  fitFillText(g, jp, pad, H * 0.58, H * 3.4, H * 0.5);
  const jpWidth = g.measureText(jp).width;
  g.font = `500 ${Math.round(H * 0.21)}px ${JP_FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillText(adjust ? 'Fare adjustment' : 'Ticket vending', pad, H * 0.86);

  // Le pictogramme de billet, au bout de la bande - et seulement si la bande
  // est assez longue pour qu'il ne vienne pas se coller au texte.
  const picW = Math.round(H * 0.78);
  if (W - pad - jpWidth > picW * 1.8) {
    const px = W - pad - picW;
    const py = Math.round(H * 0.24);
    const ph = Math.round(H * 0.36);
    g.fillStyle = '#ffffff';
    g.fillRect(px, py, picW, ph);
    g.fillStyle = green;
    g.fillRect(px + 8, py + 8, picW - 16, ph - 16);
    g.fillStyle = '#ffffff';
    const n = 4;
    const step = (picW - 24) / n;
    for (let i = 0; i < n; i++) {
      g.fillRect(px + 12 + i * step, py + ph * 0.32, step * 0.45, ph * 0.36);
    }
  }
  return toTex(c);
}

function toTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
