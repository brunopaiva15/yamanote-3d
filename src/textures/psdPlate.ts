// La plaque collée à gauche de chaque baie de porte palière.
//
// Sur un quai japonais, on ne dit pas « la troisième porte » : on lit
// 「6号車 2番ドア」 sur le caisson, et c'est ce numéro-là qu'on donne au
// personnel, qu'on retrouve sur un billet de réservation, qu'un annonceur cite
// quand quelque chose se passe à une porte. Chaque baie porte donc SA plaque -
// cartouche bleu nuit à gros chiffres blancs - et, dessous, la bande
// d'avertissements en pictogrammes qui, elle, est la même partout.
//
// Onze voitures × quatre portes = quarante-quatre plaques, toutes différentes.
// Une texture par baie aurait fait quarante-quatre canvas à chaque entrée en
// gare : le cartouche est donc un ATLAS unique, dessiné une fois pour la
// session (comme le pool d'affiches), dans lequel chaque baie va chercher sa
// case par ses UV. La bande d'avertissements, identique pour toutes, est une
// seule image répétée telle quelle.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { CONSIST } from '../data/e235';
import { JP_FONT } from './procedural';

/** Colonnes (rang de la porte) et lignes (numéro de voiture) de l'atlas. */
const COLS = CONFIG.doorCenters.length;
const ROWS = CONSIST.length;
/** Une case de cartouche : deux fois plus large que haute, comme la vraie. */
const CELL_W = 256;
const CELL_H = 128;

function canvas2d(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  return { c, g };
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Un cartouche : 「N号車 M番ドア」.
 *
 * Le chiffre est écrasant et le suffixe deux fois plus petit - c'est le
 * chiffre qu'on cherche à dix mètres, pas le mot. Les cinq morceaux sont
 * mesurés puis centrés ensemble, sinon un « 11 » à deux chiffres décalait
 * toute la ligne.
 */
function drawPlate(g: CanvasRenderingContext2D, x: number, y: number, car: number, door: number): void {
  // Réserve blanche : la plaque est un adhésif posé sur le caisson, il déborde
  // du bleu de deux millimètres tout autour.
  g.fillStyle = '#f4f4f0';
  g.fillRect(x, y, CELL_W, CELL_H);
  g.fillStyle = '#33405c';
  g.fillRect(x + 5, y + 5, CELL_W - 10, CELL_H - 10);

  // La ligne doit tenir dans sa case : elle déborderait sur la plaque voisine
  // de l'atlas, et c'est le 番ドア du wagon d'à côté qu'on lirait au bout du
  // 「11号車」. Les deux corps sont donc réduits ENSEMBLE jusqu'à ce que la
  // ligne rentre - le rapport du chiffre au suffixe ne bouge pas.
  const parts: { t: string; big: boolean }[] = [
    { t: String(car), big: true },
    { t: '号車', big: false },
    { t: ' ', big: false },
    { t: String(door), big: true },
    { t: '番ドア', big: false },
  ];
  const inner = CELL_W - 34;
  let scale = 1;
  let total = 0;
  for (let pass = 0; pass < 12; pass++) {
    total = 0;
    for (const p of parts) {
      g.font = `bold ${Math.round((p.big ? 74 : 40) * scale)}px ${JP_FONT}`;
      total += g.measureText(p.t).width;
    }
    if (total <= inner) break;
    scale *= Math.min(0.97, inner / total);
  }
  let cx = x + (CELL_W - total) / 2;
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  for (const p of parts) {
    g.font = `bold ${Math.round((p.big ? 74 : 40) * scale)}px ${JP_FONT}`;
    g.fillText(p.t, cx, y + 92);
    cx += g.measureText(p.t).width;
  }
}

let atlas: THREE.CanvasTexture | null = null;

/** L'atlas des quarante-quatre cartouches, dessiné une fois pour la session. */
export function gatePlateAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const { c, g } = canvas2d(COLS * CELL_W, ROWS * CELL_H);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      drawPlate(g, col * CELL_W, row * CELL_H, CONSIST[row].no, col + 1);
    }
  }
  atlas = toTexture(c);
  return atlas;
}

/**
 * La case d'une plaque dans l'atlas, en UV.
 *
 * La ligne 0 est en HAUT du canvas et v = 0 en bas : la voiture 1 est donc la
 * case de v le plus élevé.
 */
export function gatePlateUv(car: number, door: number): { u0: number; v0: number; u1: number; v1: number } {
  const row = Math.min(ROWS - 1, Math.max(0, CONSIST.findIndex((c) => c.no === car)));
  const col = Math.min(COLS - 1, Math.max(0, door - 1));
  return {
    u0: col / COLS,
    u1: (col + 1) / COLS,
    v0: 1 - (row + 1) / ROWS,
    v1: 1 - row / ROWS,
  };
}

// --- La bande d'avertissements, sous le cartouche ------------------------

/** Un pictogramme d'interdiction : anneau rouge, silhouette grise, barre oblique. */
function forbidden(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, draw: () => void): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = '#6b7078';
  draw();
  g.restore();
  g.strokeStyle = '#cc3128';
  g.lineWidth = r * 0.2;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(cx - r * 0.7, cy + r * 0.7);
  g.lineTo(cx + r * 0.7, cy - r * 0.7);
  g.stroke();
}

/** Bonhomme sommaire : tête ronde, tronc, deux jambes. Il tient dans 40 px. */
function figure(g: CanvasRenderingContext2D, lean: number, stride: number): void {
  g.save();
  g.rotate(lean);
  g.beginPath();
  g.arc(0, -20, 7, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.roundRect(-6, -11, 12, 20, 4);
  g.fill();
  g.beginPath();
  g.roundRect(-7 - stride, 8, 6, 16, 3);
  g.roundRect(1 + stride, 8, 6, 16, 3);
  g.fill();
  g.restore();
}

let warning: THREE.CanvasTexture | null = null;

/**
 * La bande d'avertissements : quatre vignettes, une jaune et trois rouges.
 *
 * Les mêmes quatre sur tout le réseau - se garder de la porte, ne pas
 * s'appuyer, ne rien poser, ne pas se précipiter. À trois millimètres de haut
 * dans le jeu, aucune légende ne se lit : ce qui compte est la SILHOUETTE de
 * la bande, un triangle jaune suivi de trois anneaux rouges, qu'on reconnaît
 * sans la lire comme on reconnaît un panneau de danger.
 */
export function gateWarningTexture(): THREE.CanvasTexture {
  if (warning) return warning;
  const W = 512;
  const H = 256;
  const { c, g } = canvas2d(W, H);
  g.fillStyle = '#f6f6f2';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#c9c9c2';
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);

  const cw = W / 4;
  const icy = 92;
  const r = 40;

  // 1. Triangle jaune : attention à la porte.
  const tx = cw / 2;
  g.fillStyle = '#f0c518';
  g.strokeStyle = '#23262b';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(tx, icy - r);
  g.lineTo(tx + r * 0.95, icy + r * 0.7);
  g.lineTo(tx - r * 0.95, icy + r * 0.7);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#23262b';
  g.beginPath();
  g.roundRect(tx - 5, icy - 22, 10, 26, 4);
  g.fill();
  g.beginPath();
  g.arc(tx, icy + 14, 6, 0, Math.PI * 2);
  g.fill();

  // 2. Ne pas s'appuyer : le bonhomme penché contre le montant.
  forbidden(g, cw * 1.5, icy, r, () => {
    g.fillRect(20, -34, 7, 68);
    figure(g, 0.32, 0);
  });

  // 3. Ne rien poser sur l'allège : le paquet posé sur un plan.
  forbidden(g, cw * 2.5, icy, r, () => {
    g.beginPath();
    g.roundRect(-20, -18, 40, 30, 4);
    g.fill();
    g.fillRect(-30, 14, 60, 7);
  });

  // 4. Ne pas se précipiter : le bonhomme qui court.
  forbidden(g, cw * 3.5, icy, r, () => {
    figure(g, -0.14, 7);
  });

  const captions = [
    ['ドアに注意', 'Watch the door'],
    ['寄りかからない', 'Do not lean'],
    ['物を置かない', 'Keep clear'],
    ['駆け込み乗車', 'No rushing'],
  ];
  g.textAlign = 'center';
  captions.forEach((cap, i) => {
    const x = cw * (i + 0.5);
    g.fillStyle = '#23262b';
    g.font = `bold 22px ${JP_FONT}`;
    g.fillText(cap[0], x, 178, cw - 12);
    g.fillStyle = '#6b7078';
    g.font = `16px ${JP_FONT}`;
    g.fillText(cap[1], x, 206, cw - 12);
  });
  g.textAlign = 'left';

  warning = toTexture(c);
  return warning;
}
