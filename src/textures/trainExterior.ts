// Textures de l'extérieur de la rame : inox brossé, damier de face avant,
// girouette LED, toit, bogies, plaques.
//
// Même idiome que textures/procedural : chaque fonction fabrique un canvas
// neuf, la mise en cache est la responsabilité de l'appelant (useMemo).

import * as THREE from 'three';
import { JP_FONT, rng } from './procedural';
import { STATIONS } from '../data/stations';
import { LIVERY } from '../data/e235';

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
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
 * Inox brossé de la caisse : stries verticales fines (le sens du brossage sur
 * une caisse en acier inoxydable est vertical), plus les lignes horizontales
 * de raboutage des tôles et une rangée de points de soudure discrets.
 */
export function makeStainlessTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  g.fillStyle = LIVERY.stainless;
  g.fillRect(0, 0, 256, 256);
  const r = rng(9101);
  // Brossage vertical.
  for (let x = 0; x < 256; x++) {
    const k = 0.5 + r() * 0.5;
    g.strokeStyle = `rgba(255,255,255,${0.05 * k})`;
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, 256);
    g.stroke();
    if (r() < 0.18) {
      g.strokeStyle = `rgba(90,98,106,${0.07 + r() * 0.06})`;
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, 256);
      g.stroke();
    }
  }
  // Joints horizontaux de tôle.
  for (const y of [64, 128, 192]) {
    g.strokeStyle = 'rgba(70,78,86,0.28)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(256, y + 0.5);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.moveTo(0, y + 1.5);
    g.lineTo(256, y + 1.5);
    g.stroke();
  }
  // Points de soudure par bouchons, discrets.
  g.fillStyle = 'rgba(120,128,136,0.22)';
  for (const y of [64, 128, 192]) {
    for (let x = 6; x < 256; x += 16) g.fillRect(x, y - 1, 3, 3);
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Carte de rugosité assortie : le brossage accroche la lumière par bandes. */
export function makeStainlessRoughness(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  g.fillStyle = '#8a8a8a';
  g.fillRect(0, 0, 256, 256);
  const r = rng(9102);
  for (let x = 0; x < 256; x++) {
    const v = 110 + Math.floor(r() * 70);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Face avant : le vert uguisu s'estompe vers le bas en un damier de carrés
 * noirs de plus en plus serrés — la signature graphique du E235. Renvoyée en
 * texture à alpha, posée par-dessus le masque vert.
 */
export function makeFrontCheckerTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);
  const cell = 16;
  const cols = W / cell;
  const rows = H / cell;
  for (let j = 0; j < rows; j++) {
    // Densité croissante vers le bas : en haut rien, en bas presque plein.
    const t = j / (rows - 1);
    const fill = Math.pow(t, 1.35);
    for (let i = 0; i < cols; i++) {
      // Damier : une case sur deux, agrandie au fur et à mesure.
      const stagger = (i + j) % 2 === 0;
      const size = cell * Math.min(1, fill * (stagger ? 1.25 : 0.75) * 1.6);
      if (size < 0.6) continue;
      const off = (cell - size) / 2;
      g.fillStyle = 'rgba(14,16,18,0.94)';
      g.fillRect(i * cell + off, j * cell + off, size, size);
    }
  }
  return toTexture(c);
}

/** Ligne affichée par une girouette : les trois valeurs qui en changent. */
export interface SignLine {
  kanji: string;
  romaji: string;
  /** Couleur LED du nom en romaji : celle de la ligne. */
  tint: string;
}

const YAMANOTE_SIGN: SignLine = {
  kanji: '山手線',
  romaji: 'Yamanote Line',
  tint: '#9fe870',
};

/**
 * Girouette LED de face avant : nom de ligne sur fond noir, plus le numéro de
 * service en dessous. `redraw` change la seconde ligne — numéro de course pour
 * la Yamanote, régime et destination pour une rame qui ne fait que passer.
 */
export function makeDestinationSign(line: SignLine = YAMANOTE_SIGN): {
  texture: THREE.CanvasTexture;
  redraw: (serviceNumber: string) => void;
} {
  const W = 1024;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  const texture = toTexture(c);

  const redraw = (serviceNumber: string) => {
    g.fillStyle = '#0a0b0d';
    g.fillRect(0, 0, W, H);
    // Bandeau supérieur : le nom en kanji en blanc, le romaji en LED de ligne.
    g.textAlign = 'left';
    g.fillStyle = '#f4f6f8';
    g.font = `700 92px ${JP_FONT}`;
    g.fillText(line.kanji, 40, 108);
    g.fillStyle = line.tint;
    g.font = `600 74px ${JP_FONT}`;
    g.fillText(line.romaji, 340, 106);
    // Numéro de course, en bleuté comme les afficheurs JR.
    g.fillStyle = '#8fb8f0';
    g.font = `600 84px ${JP_FONT}`;
    g.fillText(serviceNumber, 40, 216);
    // Trame de LED : fine grille sombre par-dessus.
    g.fillStyle = 'rgba(0,0,0,0.30)';
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    texture.needsUpdate = true;
  };

  redraw('0913G');
  return { texture, redraw };
}

/** Numéro de course plausible, dérivé de la gare et de l'heure. */
export function serviceNumberFor(stationIndex: number, clockMin: number): string {
  const hour = Math.floor(clockMin / 60) % 24;
  const n = 100 * hour + ((stationIndex * 7) % 100);
  return `${String(n).padStart(4, '0')}G`;
}

/**
 * Plaque de numéro de voiture peinte sur la caisse (号車), plus la désignation
 * du type de voiture en petit, comme sur le bas de caisse réel.
 */
export function makeCarPlateTexture(no: number, label: string): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 128);
  g.clearRect(0, 0, 256, 128);
  g.textAlign = 'center';
  g.fillStyle = '#22262b';
  g.font = `700 64px ${JP_FONT}`;
  g.fillText(`${no}`, 128, 62);
  g.font = `600 26px ${JP_FONT}`;
  g.fillText('号車', 128, 92);
  g.textAlign = 'left';
  g.font = `500 20px ${JP_FONT}`;
  g.fillText(label, 8, 120);
  return toTexture(c);
}

/**
 * Pictogrammes bleus des portes (place pour fauteuil roulant / poussette),
 * collés sur la caisse à côté de certaines baies.
 */
export function makeDoorBadgeTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 64);
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = '#1462b4';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#ffffff';
  // Deux pictogrammes stylisés : fauteuil et poussette.
  for (const cx of [32, 96]) {
    g.beginPath();
    g.arc(cx, 18, 6, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 12, 28, 24, 6);
    g.beginPath();
    g.arc(cx - 6, 46, 9, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.arc(cx - 4, 44, 10, 0, Math.PI * 2);
    g.stroke();
  }
  return toTexture(c);
}

/** Tôle de toit : peinture grise granuleuse, avec les lignes de caillebotis. */
export function makeRoofTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  g.fillStyle = LIVERY.roof;
  g.fillRect(0, 0, 256, 256);
  const r = rng(9103);
  for (let i = 0; i < 6000; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},0.05)`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(50,54,58,0.35)';
  for (let x = 0; x < 256; x += 32) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, 256);
    g.stroke();
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Face latérale d'un bogie : longeron, boîtes d'essieu, amortisseurs. */
export function makeBogieTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 128);
  g.fillStyle = LIVERY.bogie;
  g.fillRect(0, 0, 256, 128);
  const r = rng(9104);
  for (let i = 0; i < 2200; i++) {
    const v = r() < 0.5 ? 0 : 200;
    g.fillStyle = `rgba(${v},${v},${v},0.06)`;
    g.fillRect(r() * 256, r() * 128, 2, 2);
  }
  // Ressorts hélicoïdaux suggérés au-dessus des boîtes d'essieu.
  g.strokeStyle = 'rgba(150,156,162,0.5)';
  g.lineWidth = 3;
  for (const cx of [56, 200]) {
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.moveTo(cx - 16, 40 + k * 8);
      g.lineTo(cx + 16, 44 + k * 8);
      g.stroke();
    }
  }
  return toTexture(c);
}

/** Soufflet d'intercirculation : plis verticaux en caoutchouc noir. */
export function makeBellowsTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 64);
  g.fillStyle = '#1b1d20';
  g.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 8) {
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x, 0, 2, 64);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x + 4, 0, 3, 64);
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Indicateur latéral de destination, petit afficheur LED au-dessus des baies. */
export function makeSideSign(): {
  texture: THREE.CanvasTexture;
  redraw: (stationIndex: number) => void;
} {
  const W = 512;
  const H = 128;
  const { c, g } = makeCanvas(W, H);
  const texture = toTexture(c);
  const redraw = (stationIndex: number) => {
    const st = STATIONS[stationIndex % STATIONS.length];
    g.fillStyle = '#0a0b0d';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'left';
    g.fillStyle = '#9fe870';
    g.font = `700 52px ${JP_FONT}`;
    g.fillText('山手線', 16, 60);
    g.fillStyle = '#f0a03c';
    g.font = `600 34px ${JP_FONT}`;
    g.fillText(`${st.kanji}方面`, 16, 108);
    g.fillStyle = 'rgba(0,0,0,0.32)';
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    texture.needsUpdate = true;
  };
  redraw(0);
  return { texture, redraw };
}
