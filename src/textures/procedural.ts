// Textures procédurales (CanvasTexture) : sol, moquettes, ciel de fin de
// journée, ville en parallaxe, ballast, publicités japonaises, visages des
// PNJ, panneaux et autocollants.

import * as THREE from 'three';
import { AD_PALETTES, AD_SUBS, AD_WORDS } from '../data/ads';
import { STATIONS, TRANSFERS, directionBoardStations } from '../data/stations';
import { PLATFORM_NUMBERS } from '../data/platforms';
import { lineInfo, stationExits } from '../data/lines';
import { GENERIC, type District, type Feat } from '../data/districts';
import type { Appearance } from '../systems/appearance';

export const JP_FONT = "'Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',sans-serif";

// Petit générateur pseudo-aléatoire déterministe (mulberry32).
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  return { c, g };
}

// Texte garanti dans son cadre : réduit la taille de police si nécessaire,
// et passe maxWidth à fillText en dernier recours.
function fitFillText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  basePx: number,
  weight = 'bold',
): void {
  let px = basePx;
  do {
    g.font = `${weight} ${px}px ${JP_FONT}`;
    if (g.measureText(text).width <= maxWidth) break;
    px -= Math.max(1, Math.floor(px * 0.08));
  } while (px > 8);
  g.fillText(text, x, y, maxWidth);
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// --- Sol du wagon : gris clair usé, traces de passage, ombrage aux bords ---
export function makeFloorTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 512);
  const r = rng(11);
  // Revêtement clair, allée PLUS claire que les bas-côtés : c'est le sens réel
  // du contraste (la bande de marche est le ton dominant, les rives sous les
  // banquettes sont plus soutenues), et il éclaire nettement l'intérieur.
  g.fillStyle = '#9ea2a7';
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#b5b8bc';
  g.fillRect(150, 0, 212, 512);
  // Semis régulier de pastilles, la trame du sol de rame : c'est ce qui
  // distingue un plancher de train d'un aplat gris.
  for (let y = 4; y < 512; y += 12) {
    for (let x = ((y / 12) % 2) * 6 + 4; x < 512; x += 12) {
      const inAisle = x > 150 && x < 362;
      g.fillStyle = inAisle ? 'rgba(138,142,147,0.62)' : 'rgba(120,124,130,0.62)';
      g.beginPath();
      g.arc(x, y, 2.1, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Moucheture fine par-dessus la trame.
  for (let i = 0; i < 5200; i++) {
    const shade = 148 + Math.floor(r() * 62);
    g.fillStyle = `rgba(${shade - 8},${shade - 4},${shade + 4},${0.14 + r() * 0.26})`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 1.8, 1 + r() * 1.8);
  }
  // Traces d'usure : traînées sombres irrégulières dans le sens de la marche.
  for (let i = 0; i < 90; i++) {
    const x = 130 + r() * 250;
    const y = r() * 512;
    const len = 14 + r() * 70;
    g.strokeStyle = `rgba(66,70,78,${0.04 + r() * 0.08})`;
    g.lineWidth = 1.5 + r() * 4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 12, y + len);
    g.stroke();
  }
  // Éraflures claires.
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(225,228,232,${0.06 + r() * 0.1})`;
    g.lineWidth = 1;
    const x = r() * 512;
    const y = r() * 512;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40);
    g.stroke();
  }
  // Joints longitudinaux.
  for (const x of [24, 150, 362, 488]) {
    g.fillStyle = 'rgba(88,92,99,0.45)';
    g.fillRect(x, 0, 2, 512);
    g.fillStyle = 'rgba(235,238,240,0.28)';
    g.fillRect(x + 2, 0, 1, 512);
  }
  // Ombrage doux vers les parois (fausse occlusion sous les banquettes).
  const edge = g.createLinearGradient(0, 0, 512, 0);
  edge.addColorStop(0, 'rgba(40,44,52,0.34)');
  edge.addColorStop(0.16, 'rgba(40,44,52,0)');
  edge.addColorStop(0.84, 'rgba(40,44,52,0)');
  edge.addColorStop(1, 'rgba(40,44,52,0.34)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 512, 512);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 10);
  return t;
}

// --- Surface peinte / mélaminé : micro-grain discret sur couleur de base ---
export function makeSurfaceTexture(base: string, strength = 1): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  const r = rng(base.length * 131 + Math.floor(strength * 97));
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // Grain fin.
  for (let i = 0; i < 5200; i++) {
    const light = r() > 0.5;
    g.fillStyle = light
      ? `rgba(255,255,255,${0.015 * strength + r() * 0.03 * strength})`
      : `rgba(20,22,28,${0.015 * strength + r() * 0.03 * strength})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  // Légères nuances en larges taches (peinture non uniforme).
  for (let i = 0; i < 22; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${0.02 * strength})` : `rgba(30,32,40,${0.02 * strength})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 24 + r() * 60, 18 + r() * 44, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- Carte de rugosité : bruit doux, casse les reflets uniformes ---
export function makeRoughnessMap(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  const r = rng(311);
  g.fillStyle = '#c9c9c9';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3600; i++) {
    const v = 170 + Math.floor(r() * 85);
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.4})`;
    g.fillRect(r() * 256, r() * 256, 2 + r() * 4, 2 + r() * 4);
  }
  for (let i = 0; i < 16; i++) {
    const v = 150 + Math.floor(r() * 100);
    g.fillStyle = `rgba(${v},${v},${v},0.18)`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 30 + r() * 70, 20 + r() * 50, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- Moquette en damier pixellisé (assises E235) ---
// Nombre de carreaux par tuile : partagé avec three/Seats.tsx, qui en déduit le
// nombre de répétitions par mètre.
export const CHECKER_CELLS = 32;

export function makeCheckerTexture(shades: string[]): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  const r = rng(41 + shades.length);
  const cell = 256 / CHECKER_CELLS;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      g.fillStyle = shades[Math.floor(r() * shades.length)];
      g.fillRect(x, y, cell, cell);
    }
  }
  // Le damier brut lit comme de gros pixels : un voile de la teinte moyenne
  // rapproche les carreaux les uns des autres, il en reste une moucheture de
  // tissu au lieu d'une mosaïque.
  g.globalAlpha = 0.45;
  g.fillStyle = shades[0];
  g.fillRect(0, 0, 256, 256);
  g.globalAlpha = 1;
  // Trame tissée par-dessus.
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 5, y + (r() - 0.5) * 5);
    g.stroke();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const GREEN_CHECKER = ['#6fbe3a', '#84cf4c', '#5ca92f', '#93d95e', '#79c243'];
export const RED_CHECKER = ['#c04a42', '#cf5a50', '#b23c36', '#d96b60', '#c8534a'];

// --- Coussin matelassé gris : texture d'UN coussin (bombé + couture) ---
export function makeQuiltTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  const r = rng(53);
  g.fillStyle = '#72757b';
  g.fillRect(0, 0, 256, 256);
  // Trame tissée.
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.08)';
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6);
    g.stroke();
  }
  // Bombé : centre légèrement plus clair, bords assombris tout autour.
  const dome = g.createRadialGradient(128, 128, 30, 128, 128, 165);
  dome.addColorStop(0, 'rgba(255,255,255,0.07)');
  dome.addColorStop(0.55, 'rgba(0,0,0,0)');
  dome.addColorStop(1, 'rgba(20,22,26,0.32)');
  g.fillStyle = dome;
  g.fillRect(0, 0, 256, 256);
  // Couture périphérique.
  g.strokeStyle = 'rgba(34,36,40,0.5)';
  g.lineWidth = 3;
  g.strokeRect(10, 10, 236, 236);
  const t = toTexture(c);
  return t;
}

// --- Grille de clim : lamelles sombres sur fond aluminium ---
export function makeVentTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 64);
  g.fillStyle = '#b4b7ba';
  g.fillRect(0, 0, 128, 64);
  for (let y = 6; y < 64; y += 10) {
    g.fillStyle = '#3f4247';
    g.fillRect(6, y, 116, 4);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(6, y + 4, 116, 1);
  }
  const t = toTexture(c);
  return t;
}

// --- Grille de diffuseur de plafond : disque perforé sur platine claire ---
export function makeSpeakerTexture(): THREE.CanvasTexture {
  const S = 128;
  const { c, g } = makeCanvas(S, S);
  g.fillStyle = '#dcdbd5';
  g.fillRect(0, 0, S, S);
  // Platine et gorge du diffuseur.
  const cx = S / 2;
  g.fillStyle = '#c6c5bf';
  g.beginPath();
  g.arc(cx, cx, S * 0.44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a4d51';
  g.beginPath();
  g.arc(cx, cx, S * 0.4, 0, Math.PI * 2);
  g.fill();
  // Perforations en anneaux concentriques.
  g.fillStyle = '#22252a';
  for (let ring = 1; ring <= 5; ring++) {
    const r = ring * S * 0.072;
    const n = Math.max(6, Math.round(ring * 7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      g.beginPath();
      g.arc(cx + Math.cos(a) * r, cx + Math.sin(a) * r, S * 0.016, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.beginPath();
  g.arc(cx, cx, S * 0.02, 0, Math.PI * 2);
  g.fill();
  // Reflet doux du néon voisin sur le chanfrein.
  const sheen = g.createLinearGradient(0, 0, 0, S);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.beginPath();
  g.arc(cx, cx, S * 0.44, 0, Math.PI * 2);
  g.fill();
  return toTexture(c);
}

// --- Bande tactile jaune à picots ---
export function makeTactileTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 256);
  g.fillStyle = '#e3ba2e';
  g.fillRect(0, 0, 128, 256);
  for (let y = 14; y < 256; y += 28) {
    for (let x = 14; x < 128; x += 28) {
      g.fillStyle = '#c79d1d';
      g.beginPath();
      g.arc(x + 1.5, y + 2, 8.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f0cc52';
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f7dd7d';
      g.beginPath();
      g.arc(x - 2, y - 2.5, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- Liseré à pois jaunes sur le chant des portes ---
export function makeDoorEdgeTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(64, 512);
  g.clearRect(0, 0, 64, 512);
  for (let y = 16; y < 512; y += 30) {
    g.fillStyle = 'rgba(228,184,52,0.92)';
    g.beginPath();
    g.arc(32, y, 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- Petits autocollants de porte (pictogrammes génériques) ---
export function makeDoorStickerTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = '#f4f4ef';
  g.beginPath();
  g.roundRect(4, 4, 120, 120, 12);
  g.fill();
  g.strokeStyle = '#c9c9c2';
  g.lineWidth = 3;
  g.stroke();
  // Pictogramme : main et flèche (attention aux doigts).
  g.fillStyle = '#d2372c';
  g.beginPath();
  g.roundRect(20, 22, 88, 30, 6);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = `bold 22px ${JP_FONT}`;
  g.textAlign = 'center';
  g.fillText('ゆびに注意', 64, 44);
  g.fillStyle = '#2c3038';
  g.font = `13px ${JP_FONT}`;
  g.fillText('Watch your fingers', 64, 74);
  g.strokeStyle = '#2c3038';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(40, 96);
  g.lineTo(64, 96);
  g.moveTo(88, 96);
  g.lineTo(64, 96);
  g.stroke();
  g.textAlign = 'left';
  return toTexture(c);
}

// --- Badge 優先席 (dossier des places prioritaires) ---
export function makePriorityBadgeTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(160, 110);
  g.clearRect(0, 0, 160, 110);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(6, 6, 148, 98, 14);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = `bold 40px ${JP_FONT}`;
  g.textAlign = 'center';
  g.fillText('優先席', 80, 52);
  g.font = `17px ${JP_FONT}`;
  g.fillText('Priority Seat', 80, 84);
  g.textAlign = 'left';
  return toTexture(c);
}

// Teintes des sols d'about, partagées avec three/Car.tsx : la portion qui
// passe sous les banquettes est unie, seule la partie dégagée porte le
// marquage — sinon le texte se retrouve caché sous les sièges.
export const PRIORITY_FLOOR_COLOR = '#d81f1a';
export const FREE_FLOOR_COLOR = '#e2197f';

// --- Sol rouge de la zone prioritaire ---
// Ce n'est pas un sticker posé sur le gris : sur l'E235 tout le plancher de la
// travée d'about est teinté, rouge côté places prioritaires et magenta côté
// zone libre. Les caractères 優先席 sont dans trois cartouches empilés dans le
// sens de la marche, « Priority Seat » à la verticale à côté.
export function makePriorityFloorTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 548);
  g.fillStyle = '#d81f1a';
  g.fillRect(0, 0, 256, 548);
  const r = rng(77);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.05})`;
    g.fillRect(r() * 256, r() * 548, 1 + r() * 3, 1 + r() * 3);
  }
  const boxes = ['優', '先', '席'];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  boxes.forEach((ch, i) => {
    const y = 180 + i * 100;
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(58, y - 40, 80, 80, 8);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `bold 56px ${JP_FONT}`;
    g.fillText(ch, 98, y + 2);
  });
  // « Priority Seat » à la verticale, le long des cartouches.
  g.save();
  g.translate(180, 280);
  g.rotate(Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.font = `28px ${JP_FONT}`;
  g.fillText('Priority Seat', 0, 0);
  g.restore();
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  return toTexture(c);
}

// --- Panneau mural 優先席 vert (zone prioritaire) ---
export function makePrioritySignTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 160);
  g.fillStyle = '#2e9e4f';
  g.beginPath();
  g.roundRect(2, 2, 252, 156, 10);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 44px ${JP_FONT}`;
  g.fillText('優先席', 128, 52);
  g.font = `16px ${JP_FONT}`;
  g.fillText('Priority Seat', 128, 78);
  // Silhouettes assises.
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 4; i++) {
    const x = 44 + i * 46;
    g.beginPath();
    g.arc(x, 106, 8, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - 7, 114, 14, 22);
  }
  g.textAlign = 'left';
  return toTexture(c);
}

// --- Pictogrammes de la zone libre (フリースペース) ---
// Tracés à la main plutôt qu'en police d'icônes : aucune dépendance, et le
// dessin reste lisible aux tailles où il est vu. Les traits sont épais : un
// marquage au sol se lit de loin.

function drawWheelchair(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(-6, -30, 9, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(-6, -20);
  g.lineTo(-6, 0);
  g.lineTo(14, 0);
  g.stroke();
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(14, 0);
  g.lineTo(18, 16);
  g.lineTo(26, 16);
  g.stroke();
  g.lineWidth = 6;
  g.beginPath();
  g.arc(2, 14, 18, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(2, 14, 12, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawStroller(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = 'round';
  // Capote inclinée : le trait qui fait lire « poussette » et pas « chariot ».
  g.beginPath();
  g.moveTo(-16, 2);
  g.lineTo(-16, -14);
  g.arc(-2, -14, 14, Math.PI, Math.PI * 1.5);
  g.lineTo(16, 2);
  g.closePath();
  g.fill();
  // Poignée, et la silhouette qui pousse.
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(-16, -10);
  g.lineTo(-34, -26);
  g.stroke();
  g.beginPath();
  g.arc(-52, -44, 10, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(-52, -34);
  g.lineTo(-50, -8);
  g.stroke();
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(-50, -8);
  g.lineTo(-58, 18);
  g.moveTo(-50, -8);
  g.lineTo(-40, 16);
  g.moveTo(-50, -26);
  g.lineTo(-34, -26);
  g.stroke();
  // Châssis.
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(-14, 4);
  g.lineTo(-8, 20);
  g.moveTo(14, 4);
  g.lineTo(18, 20);
  g.stroke();
  g.beginPath();
  g.arc(-8, 24, 8, 0, Math.PI * 2);
  g.moveTo(26, 24);
  g.arc(18, 24, 8, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// --- Sol magenta de la zone libre ---
// Même principe que le rouge prioritaire : toute la travée est teintée, avec
// la poussette au-dessus et le fauteuil roulant en dessous, en grand.
export function makeFreeSpaceFloorTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 548);
  g.fillStyle = '#e2197f';
  g.fillRect(0, 0, 256, 548);
  const r = rng(78);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.05})`;
    g.fillRect(r() * 256, r() * 548, 1 + r() * 3, 1 + r() * 3);
  }
  drawStroller(g, 138, 180, 1.5, '#ffffff');
  drawWheelchair(g, 120, 380, 1.6, '#ffffff');
  return toTexture(c);
}

// --- Panneau mural bleu de la zone libre ---
export function makeFreeSpaceSignTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 160);
  g.fillStyle = '#1f6ea8';
  g.beginPath();
  g.roundRect(2, 2, 252, 156, 10);
  g.fill();
  drawWheelchair(g, 74, 66, 0.82, '#ffffff');
  drawStroller(g, 182, 66, 0.82, '#ffffff');
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText('フリースペース', 128, 126);
  g.font = `15px ${JP_FONT}`;
  g.fillText('Free Space', 128, 148);
  g.textAlign = 'left';
  return toTexture(c);
}

// --- Petits équipements de paroi d'about ---
// Ce sont eux qui peuplent la travée d'about d'une vraie rame : interphone de
// détresse, plaque de numéro de voiture, coffret d'extincteur. Sans eux la
// paroi rose reste une surface vide.

// Interphone SOS : cartouche rouge, pictogramme de combiné, flèche vers le bas.
export function makeSosTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 160);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#c8241f';
  g.fillRect(6, 6, 116, 52);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 34px ${JP_FONT}`;
  g.fillText('SOS', 64, 45);
  // Main sur bouton, stylisée.
  g.fillStyle = '#1d1f22';
  g.beginPath();
  g.arc(84, 106, 15, 0, Math.PI * 2);
  g.fill();
  g.fillRect(74, 106, 20, 30);
  // Flèche descendante à gauche.
  g.strokeStyle = '#1d1f22';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(34, 78);
  g.lineTo(34, 128);
  g.stroke();
  g.beginPath();
  g.moveTo(22, 116);
  g.lineTo(34, 134);
  g.lineTo(46, 116);
  g.closePath();
  g.fill();
  g.textAlign = 'left';
  return toTexture(c);
}

// Plaque de numéro de voiture, vissée en haut de la paroi d'about.
export function makeCarNumberTexture(label: string): THREE.CanvasTexture {
  const { c, g } = makeCanvas(320, 72);
  g.fillStyle = '#20242a';
  g.fillRect(0, 0, 320, 72);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 2;
  g.strokeRect(4, 4, 312, 64);
  g.fillStyle = '#f2f4f6';
  g.textAlign = 'center';
  g.font = `600 38px ${JP_FONT}`;
  g.fillText(label, 160, 50);
  g.textAlign = 'left';
  return toTexture(c);
}

// Coffret d'extincteur : porte blanche à liseré rouge vertical et étiquette.
export function makeExtinguisherTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 320);
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, 128, 320);
  g.fillStyle = '#c8241f';
  g.fillRect(96, 12, 16, 296);
  g.strokeStyle = 'rgba(90,92,96,0.5)';
  g.lineWidth = 2;
  g.strokeRect(3, 3, 122, 314);
  // Étiquette 消火器 en haut.
  g.fillStyle = '#ffffff';
  g.fillRect(16, 22, 66, 58);
  g.strokeStyle = '#c8241f';
  g.lineWidth = 3;
  g.strokeRect(16, 22, 66, 58);
  g.fillStyle = '#c8241f';
  g.textAlign = 'center';
  g.font = `bold 20px ${JP_FONT}`;
  g.fillText('消', 49, 48);
  g.fillText('火', 49, 72);
  // Serrure.
  g.fillStyle = '#8d9096';
  g.fillRect(48, 214, 22, 12);
  g.textAlign = 'left';
  return toTexture(c);
}

// --- Ciel de plein jour : bleu vif, gros cumulus cartoon (esprit Shashingo) ---
export function makeSkyTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(7);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#3f8edb');
  grad.addColorStop(0.5, '#74b4e8');
  grad.addColorStop(0.85, '#c2e2f5');
  grad.addColorStop(1, '#e2f2fa');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Cumulus rebondis : grappes de disques blancs à base plate.
  for (let i = 0; i < 9; i++) {
    const cx = r() * W;
    const baseY = H * (0.28 + r() * 0.38);
    const scale = 0.7 + r() * 1.1;
    const blobs = 4 + Math.floor(r() * 4);
    // Ombre légère sous le nuage.
    g.fillStyle = 'rgba(150,190,220,0.35)';
    g.beginPath();
    g.ellipse(cx, baseY + 8 * scale, 95 * scale, 14 * scale, 0, 0, Math.PI * 2);
    g.fill();
    // Volume blanc.
    g.fillStyle = 'rgba(252,254,255,0.97)';
    for (let b = 0; b < blobs; b++) {
      const bx = cx + (b - blobs / 2) * 34 * scale + (r() - 0.5) * 16;
      const radius = (26 + r() * 26) * scale;
      g.beginPath();
      g.arc(bx, baseY - radius * 0.45, radius, 0, Math.PI * 2);
      g.fill();
    }
    // Base plate.
    g.beginPath();
    g.ellipse(cx, baseY, 88 * scale, 18 * scale, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --- Ciel d'heure dorée : dégradé chaud, soleil bas, nuages étirés ---
export function makeSunsetSkyTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(17);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#a487b6');
  grad.addColorStop(0.38, '#cf9a96');
  grad.addColorStop(0.66, '#eba76f');
  grad.addColorStop(0.86, '#ffce8f');
  grad.addColorStop(1, '#ffdfa8');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const sunX = 1500;
  const sunY = H * 0.8;
  const halo = g.createRadialGradient(sunX, sunY, 6, sunX, sunY, 260);
  halo.addColorStop(0, 'rgba(255,246,220,0.98)');
  halo.addColorStop(0.12, 'rgba(255,230,175,0.8)');
  halo.addColorStop(0.5, 'rgba(255,200,130,0.28)');
  halo.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = halo;
  g.fillRect(sunX - 280, sunY - 280, 560, 560);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(245,215,195,${0.1 + r() * 0.2})`;
    g.beginPath();
    g.ellipse(r() * W, H * (0.1 + r() * 0.62), 90 + r() * 320, 5 + r() * 16, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --- Ciel de nuit : bleu profond, étoiles, lune ---
export function makeNightSkyTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(13);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0b1120');
  grad.addColorStop(0.6, '#18223a');
  grad.addColorStop(1, '#2a3550');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 170; i++) {
    g.fillStyle = `rgba(235,240,250,${0.25 + r() * 0.6})`;
    g.beginPath();
    g.arc(r() * W, r() * H * 0.72, 0.6 + r() * 1.1, 0, Math.PI * 2);
    g.fill();
  }
  // Lune avec halo doux et cratères discrets.
  const mx = 620;
  const my = H * 0.3;
  const halo = g.createRadialGradient(mx, my, 8, mx, my, 130);
  halo.addColorStop(0, 'rgba(240,238,225,0.9)');
  halo.addColorStop(0.2, 'rgba(220,224,235,0.28)');
  halo.addColorStop(1, 'rgba(210,220,240,0)');
  g.fillStyle = halo;
  g.fillRect(mx - 140, my - 140, 280, 280);
  g.fillStyle = '#f2efe2';
  g.beginPath();
  g.arc(mx, my, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(205,205,195,0.5)';
  g.beginPath();
  g.arc(mx - 8, my - 5, 6, 0, Math.PI * 2);
  g.arc(mx + 9, my + 8, 4, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(16,22,38,${0.25 + r() * 0.3})`;
    g.beginPath();
    g.ellipse(r() * W, H * (0.3 + r() * 0.5), 120 + r() * 260, 10 + r() * 22, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --- Ville en parallaxe : façades pastel le jour, fenêtres et néons la nuit ---
const SIGN_WORDS = ['寿司', '居酒屋', 'カラオケ', '薬局', '書店', 'ラーメン', '喫茶', 'ホテル', '不動産', '歯科'];
const ROOF_WORDS = ['未来生活', '東京時間', '光る夜', '毎日新鮮', 'ネオン堂'];

const FACADES = ['#e6dcc9', '#e4cfc5', '#dde4d2', '#e0d7e4', '#e8e1cf', '#d6dfe3', '#e7d6c2'];
const NIGHT_FACADES = ['#3a4152', '#38404e', '#3e4550', '#3c4156', '#40474f', '#374052', '#3d4450'];
const SHOP_COLORS = ['#e2705c', '#5c9fe2', '#e2b45c', '#63c28a', '#c97fb8', '#e28a5c'];
const NEON_COLORS = ['#ff9a84', '#8fd0ff', '#ffd88a', '#8ff0b4', '#f2b0e4', '#ffbe8f'];

// Graine stable par quartier (FNV-1a du nom) : deux quartiers → deux villes.
function districtSeed(name: string): number {
  let s = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) {
    s ^= name.charCodeAt(i);
    s = Math.imul(s, 16777619) >>> 0;
  }
  return s >>> 0;
}

// Résolution de la texture de ville par couche (la couche lointaine, très
// brumeuse, est allégée pour tenir le budget mémoire GPU avec deux banques).
export function cityTexSize(layer: 0 | 1 | 2): [number, number] {
  return layer === 2 ? [1024, 256] : [2048, 512];
}

// Masse d'arbres (parcs, sanctuaires) dessinée à la place d'un immeuble.
// Consomme un nombre déterministe de tirages (invariant jour/nuit).
function drawTreeMass(
  g: CanvasRenderingContext2D,
  x: number,
  bw: number,
  H: number,
  night: boolean,
  r: () => number,
): void {
  const cx = x + bw / 2;
  const th = H * (0.22 + r() * 0.16);
  const baseY = H - 4;
  g.fillStyle = night ? '#2a241c' : '#6a4f38';
  g.fillRect(cx - 4, baseY - th * 0.5, 8, th * 0.5);
  const blobs = 3 + Math.floor(r() * 3);
  const dayLeaf = ['#6ab04a', '#7cc25a', '#5aa23f'];
  const nightLeaf = ['#243024', '#1f2a1f', '#28321f'];
  for (let b = 0; b < blobs; b++) {
    const bx = x + 8 + r() * (bw - 16);
    const by = baseY - th * (0.5 + r() * 0.5);
    const rad = bw * (0.16 + r() * 0.16);
    g.fillStyle = night ? nightLeaf[b % 3] : dayLeaf[b % 3];
    g.beginPath();
    g.arc(bx, by, rad, 0, Math.PI * 2);
    g.fill();
  }
}

// Arches de brique au pied de l'immeuble (viaduc, Yūrakuchō, Kanda). Déterministe.
function drawBrickArches(g: CanvasRenderingContext2D, x: number, bw: number, H: number, night: boolean): void {
  const aw = 26;
  const top = H - 40;
  for (let ax = x + 4; ax + aw < x + bw; ax += aw + 6) {
    g.fillStyle = night ? 'rgba(70,44,34,0.9)' : 'rgba(150,86,60,0.92)';
    g.fillRect(ax, top, aw, 36);
    g.fillStyle = night ? 'rgba(255,206,150,0.5)' : 'rgba(40,30,26,0.42)';
    g.beginPath();
    g.moveTo(ax + 4, H - 4);
    g.lineTo(ax + 4, top + 12);
    g.arc(ax + aw / 2, top + 12, aw / 2 - 4, Math.PI, 0, false);
    g.lineTo(ax + aw - 4, H - 4);
    g.closePath();
    g.fill();
  }
}

// Toit en tuiles à croupe (vieux quartiers, temples). Déterministe.
function drawTiledRoof(g: CanvasRenderingContext2D, x: number, bw: number, bh: number, H: number, night: boolean): void {
  const top = H - bh;
  const eave = 8;
  g.fillStyle = night ? '#2a2f38' : '#5a6470';
  g.beginPath();
  g.moveTo(x - eave, top);
  g.lineTo(x + bw + eave, top);
  g.lineTo(x + bw - 6, top - 14);
  g.lineTo(x + 6, top - 14);
  g.closePath();
  g.fill();
  g.fillStyle = night ? '#20242c' : '#464e58';
  g.fillRect(x + 4, top - 16, bw - 8, 4);
}

// Dessine la ville d'un quartier dans un contexte fourni (réutilisable : les
// banques de three/city/SkyDome re-dessinent dans leur canvas, sans allocation).
//
// INVARIANT DU FONDU JOUR/NUIT — À NE JAMAIS ROMPRE : pour un quartier+couche
// donné, les appels day (night=false) et night (night=true) doivent produire
// EXACTEMENT la même séquence de tirages r() et les mêmes branches. `night` ne
// change QUE des couleurs (fillStyle), jamais un r() ni un embranchement qui
// modifie le nombre de dessins. (Les features viennent du quartier, identiques
// entre jour et nuit d'un même quartier — elles ne cassent donc pas l'invariant.)
export function drawCityInto(
  g: CanvasRenderingContext2D,
  layer: 0 | 1 | 2,
  night: boolean,
  district: District = GENERIC,
): void {
  const W = g.canvas.width;
  const H = g.canvas.height;
  g.clearRect(0, 0, W, H);
  g.globalAlpha = 1;
  g.textAlign = 'left';
  const r = rng(1009 + districtSeed(district.name) + layer * 57);

  const has = (f: Feat) => district.feats.includes(f);
  const tall = has('glassTowers') || has('officeTowers') || has('skyscraperCluster') || has('modernWhite');
  const brick = has('redBrick') || has('brickArch');
  const dept = has('departmentStore');
  const billboard = has('animeBillboard') || has('giantScreen');
  const neonHeavy = has('electricNeon') || has('koreatownSigns') || has('studentArcade') || billboard;
  const koreatown = has('koreatownSigns') || has('studentArcade');
  const temple = has('templeLowtown');
  const green = has('parkGreen') || has('torii');
  const market = has('shotengai') || has('lowriseMarket');

  const facadesDay = district.facades ?? FACADES;
  const facadesNight = district.nightFacades ?? NIGHT_FACADES;
  const neonPal = district.neon ?? NEON_COLORS;
  const roofWords = district.roofWords ?? ROOF_WORDS;
  const words = district.words.length ? district.words : SIGN_WORDS;

  // Voie surélevée : premier plan bas, le ciel doit respirer.
  const maxH = (layer === 0 ? 0.52 : layer === 1 ? 0.52 : 0.46) * (0.55 + district.maxHeight);
  const gapChance = layer === 2 ? 0 : (0.4 - district.density * 0.36) * (layer === 1 ? 0.85 : 1);
  const fade = layer === 0 ? 1 : layer === 1 ? 0.75 : 0.5; // contraste des détails

  let x = 0;
  while (x < W) {
    const bwBase = 60 + r() * (layer === 0 ? 130 : 90);
    const bw = tall ? bwBase * 0.82 : market ? bwBase * 1.08 : bwBase;
    if (r() < gapChance) {
      x += bwBase * (0.5 + r());
      continue;
    }
    // Masse d'arbres à la place d'un immeuble (parcs, sanctuaires).
    if (green && layer < 2 && r() < 0.42) {
      drawTreeMass(g, x, bw, H, night, r);
      x += bw + (layer === 0 ? r() * 26 : r() * 10);
      continue;
    }
    const bh = H * (0.2 + r() * maxH * 0.72);
    const facadeIdx = Math.floor(r() * facadesDay.length);
    g.fillStyle = night ? facadesNight[facadeIdx % facadesNight.length] : facadesDay[facadeIdx];
    g.globalAlpha = 1;
    g.fillRect(x, H - bh, bw, bh);
    if (layer > 0) {
      g.fillStyle = night
        ? `rgba(28,34,52,${layer === 1 ? 0.35 : 0.6})`
        : `rgba(226,206,196,${layer === 1 ? 0.35 : 0.6})`;
      g.fillRect(x, H - bh, bw, bh);
    }
    // Toit en tuiles (vieux quartiers / temples) — bâtiments bas.
    if (temple && layer < 2 && bh < H * 0.5) {
      drawTiledRoof(g, x, bw, bh, H, night);
    }
    // Toit : enseigne posée (lumineuse la nuit ; fréquente pour les grands magasins).
    if (layer < 2 && r() > (dept ? 0.4 : 0.62)) {
      const pw = bw * (0.4 + r() * 0.4);
      g.fillStyle = night ? '#20242e' : '#faf6ec';
      g.beginPath();
      g.roundRect(x + bw * 0.2, H - bh - 26, pw, 22, 6);
      g.fill();
      const roofColorIdx = Math.floor(r() * SHOP_COLORS.length);
      g.fillStyle = night ? neonPal[roofColorIdx % neonPal.length] : SHOP_COLORS[roofColorIdx];
      g.font = `bold 15px ${JP_FONT}`;
      g.fillText(roofWords[Math.floor(r() * roofWords.length)], x + bw * 0.2 + 8, H - bh - 9, Math.max(10, pw - 14));
    }
    if (layer < 2) {
      // Fenêtres : grille plus serrée et froide pour les tours de bureaux.
      const colStep = tall ? 13 : 16;
      const rowStep = tall ? 17 : 20;
      const cols = Math.floor(bw / colStep);
      const rows = Math.max(0, Math.floor((bh - 66) / rowStep));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const w1 = r();
          const w2 = r();
          if (night) {
            g.fillStyle = tall
              ? w1 > 0.6
                ? `rgba(214,${228 + Math.floor(w2 * 22)},255,${(0.5 + w2 * 0.3) * fade})`
                : `rgba(20,26,40,${0.72 * fade})`
              : w1 > 0.42
                ? `rgba(255,${205 + Math.floor(w2 * 40)},140,${(0.65 + w2 * 0.3) * fade})`
                : `rgba(24,30,44,${0.7 * fade})`;
          } else {
            g.fillStyle = tall
              ? w1 > 0.7
                ? `rgba(214,226,238,${0.72 * fade})`
                : `rgba(150,180,208,${(0.55 + w2 * 0.3) * fade})`
              : w1 > 0.8
                ? `rgba(238,240,236,${0.7 * fade})`
                : `rgba(136,170,196,${(0.5 + w2 * 0.3) * fade})`;
          }
          g.beginPath();
          g.roundRect(x + 6 + i * colStep, H - bh + 8 + j * rowStep, colStep - 7, rowStep - 8, 2);
          g.fill();
        }
      }
      // Devanture au rez-de-chaussée : bandeau, enseigne, vitrine.
      const shopIdx = Math.floor(r() * SHOP_COLORS.length);
      const shop = night ? neonPal[shopIdx % neonPal.length] : SHOP_COLORS[shopIdx];
      g.fillStyle = shop;
      g.globalAlpha = (night ? 1 : 0.9) * fade;
      g.fillRect(x + 2, H - 58, bw - 4, 20);
      g.globalAlpha = 1;
      g.fillStyle = night ? '#2a2620' : '#fdf9f0';
      g.font = `bold 13px ${JP_FONT}`;
      g.fillText(words[Math.floor(r() * words.length)], x + 10, H - 43, Math.max(12, bw - 22));
      // Auvent rayé (plus fréquent pour marché / shotengai).
      if (r() < (market ? 0.8 : 0.5)) {
        for (let sx2 = x + 4; sx2 < x + bw - 10; sx2 += 12) {
          g.fillStyle = (sx2 / 12) % 2 < 1 ? (night ? '#464a52' : '#f6f1e6') : shop;
          g.globalAlpha = 0.85 * fade;
          g.fillRect(sx2, H - 36, 12, 10);
        }
        g.globalAlpha = 1;
      }
      // Vitrine chaude, éclatante la nuit.
      g.fillStyle = `rgba(255,214,150,${(night ? 0.9 : 0.5) * fade})`;
      g.fillRect(x + 8, H - 26, bw - 16, 22);
      // Écran / panneau géant (Akihabara, Shibuya, Shinjuku…).
      if (billboard && r() < 0.5) {
        const bbw = bw * (0.55 + r() * 0.3);
        const bbh = Math.min(bh - 20, H * (0.14 + r() * 0.16));
        const bx = x + (bw - bbw) / 2;
        const by = H - bh + 12 + r() * 20;
        const bands = 3 + Math.floor(r() * 3);
        for (let b = 0; b < bands; b++) {
          const ci = Math.floor(r() * neonPal.length);
          g.fillStyle = night ? neonPal[ci] : SHOP_COLORS[ci % SHOP_COLORS.length];
          g.globalAlpha = (night ? 0.95 : 0.85) * fade;
          g.fillRect(bx, by + (b * bbh) / bands, bbw, bbh / bands - 1);
        }
        g.globalAlpha = 1;
        g.strokeStyle = night ? 'rgba(10,12,18,0.9)' : 'rgba(60,60,66,0.5)';
        g.lineWidth = 2;
        g.strokeRect(bx, by, bbw, bbh);
      }
      // Enseignes empilées (Koreatown, arcades étudiantes).
      if (koreatown && layer === 0) {
        const strips = 3 + Math.floor(r() * 4);
        for (let s = 0; s < strips; s++) {
          const ci = Math.floor(r() * neonPal.length);
          const sy = H - bh + 20 + s * 22 + r() * 4;
          const wi = Math.floor(r() * words.length);
          if (sy > H - 62) continue;
          g.fillStyle = night ? neonPal[ci] : SHOP_COLORS[ci % SHOP_COLORS.length];
          g.globalAlpha = (night ? 0.95 : 0.85) * fade;
          g.fillRect(x + 4, sy, bw - 8, 14);
          g.globalAlpha = 1;
          g.fillStyle = night ? '#201a1e' : '#fbf6f4';
          g.font = `bold 11px ${JP_FONT}`;
          g.fillText(words[wi], x + 8, sy + 11, bw - 16);
        }
      }
    }
    // Arches de brique au pied (viaduc, Yūrakuchō, Kanda).
    if (brick && layer < 2) {
      drawBrickArches(g, x, bw, H, night);
    }
    // Enseigne verticale japonaise (néon la nuit ; plus fréquente en quartier électrique).
    if (layer === 0 && r() < (neonHeavy ? 0.7 : 0.45)) {
      const sx = x + bw - 18;
      const sh = 80 + r() * 80;
      const sy = H - bh + 14 + r() * 30;
      const signIdx = Math.floor(r() * SHOP_COLORS.length);
      g.fillStyle = night ? neonPal[signIdx % neonPal.length] : SHOP_COLORS[signIdx];
      g.beginPath();
      g.roundRect(sx, sy, 16, sh, 5);
      g.fill();
      g.fillStyle = night ? '#2a2620' : '#fdf9f0';
      g.font = `bold 11px ${JP_FONT}`;
      const word = words[Math.floor(r() * words.length)];
      for (let k = 0; k < word.length && k * 13 < sh - 12; k++) {
        g.fillText(word[k], sx + 3, sy + 14 + k * 13);
      }
    }
    x += bw + (layer === 0 ? r() * 26 : r() * 10);
  }
  g.globalAlpha = 1;
}

// Alloue un canvas dédié et y dessine la ville d'un quartier (site d'appel
// historique + création des banques).
export function makeCityTexture(layer: 0 | 1 | 2, night = false, district: District = GENERIC): THREE.CanvasTexture {
  const [W, H] = cityTexSize(layer);
  const { c, g } = makeCanvas(W, H);
  drawCityInto(g, layer, night, district);
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --- Sol extérieur : ballast et traverses, teinte chaude de fin de journée ---
/**
 * Longueur, en mètres, couverte par une tuile de plate-forme. Le rendu DOIT
 * caler `repeat.y` et `offset.y` dessus : c'est la surface la plus proche et la
 * plus rapide du champ, donc celle où un défilement faux se voit le plus.
 *
 * Elle défilait justement à 1,67× la vitesse du train — `repeat.set(2, 24)` sur
 * un plan de 400 m fait une tuile tous les 16,7 m, mais `offset.y` avançait
 * d'une tuile tous les 10 m. Le même mensonge que celui des plans de ville.
 */
export const TRACK_BED_TILE = 8;
/** Largeur, en mètres, couverte par une tuile de plate-forme. */
export const TRACK_BED_WIDTH = 10;

/**
 * Plate-forme de la voie : ballast, traverses, rails et caniveaux à câbles.
 *
 * Les cotes sont réelles et exprimées en mètres : traverses de 2,40 m tous les
 * 65 cm, écartement de 1 435 mm, caniveaux à câbles en rive. C'est le caniveau
 * qui court le long de toute voie japonaise, et c'est ce qui manquait le plus —
 * la seule ligne continue que l'œil peut suivre à quatre-vingt-dix.
 */
export function makeGroundTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const kx = W / TRACK_BED_WIDTH; // px par mètre en travers
  const ky = H / TRACK_BED_TILE; // px par mètre en long
  const { c, g } = makeCanvas(W, H);
  const r = rng(77);

  g.fillStyle = '#8a888a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 5200; i++) {
    const shade = 108 + Math.floor(r() * 62);
    g.fillStyle = `rgb(${shade + 6},${shade + 2},${shade})`;
    g.fillRect(r() * W, r() * H, 2 + r() * 4, 2 + r() * 4);
  }

  // Axe de la voie au milieu de la tuile.
  const cx = W / 2;
  // Traverses : 2,40 m de long, 24 cm de large, entraxe 65 cm.
  g.fillStyle = '#6b6763';
  for (let m = 0; m < TRACK_BED_TILE; m += 0.65) {
    g.fillRect(cx - 1.2 * kx, m * ky, 2.4 * kx, 0.24 * ky);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(cx - 1.2 * kx, (m + 0.24) * ky, 2.4 * kx, 0.05 * ky);
    g.fillStyle = '#6b6763';
  }
  // Rails : écartement 1 435 mm, patin sombre et champignon clair.
  for (const s of [-1, 1]) {
    const rx = cx + s * 0.7175 * kx;
    g.fillStyle = '#4e5158';
    g.fillRect(rx - 0.05 * kx, 0, 0.1 * kx, H);
    g.fillStyle = '#cfd3d8';
    g.fillRect(rx - 0.026 * kx, 0, 0.052 * kx, H);
  }
  // Caniveaux à câbles, en rive de plate-forme.
  for (const s of [-1, 1]) {
    const tx = cx + s * 4.1 * kx;
    g.fillStyle = '#7c7975';
    g.fillRect(tx - 0.22 * kx, 0, 0.44 * kx, H);
    g.fillStyle = '#5f5d59';
    g.fillRect(tx - 0.15 * kx, 0, 0.3 * kx, H);
    // Joints entre éléments préfabriqués, tous les deux mètres.
    g.fillStyle = 'rgba(40,40,38,0.5)';
    for (let m = 0; m < TRACK_BED_TILE; m += 2) {
      g.fillRect(tx - 0.22 * kx, m * ky, 0.44 * kx, 0.05 * ky);
    }
  }

  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// --- Mur de soutènement (tranchées) : panneaux béton, joints, coulures ---
// Texture jour uniquement : la nuit se fait par multiplication de couleur au
// runtime (idiome de la silhouette lointaine du ciel), l'invariant jour/nuit
// de drawCityInto n'est donc pas concerné.
export function makeRetainingWallTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 256);
  const r = rng(413);
  g.fillStyle = '#b3b0a9';
  g.fillRect(0, 0, 512, 256);
  // Grain du béton.
  for (let i = 0; i < 1600; i++) {
    const shade = 150 + Math.floor(r() * 40);
    g.fillStyle = `rgba(${shade},${shade - 2},${shade - 6},0.5)`;
    g.fillRect(r() * 512, r() * 256, 2 + r() * 4, 2 + r() * 4);
  }
  // Joints verticaux de panneaux + joint horizontal médian.
  g.fillStyle = 'rgba(70,68,64,0.55)';
  for (let x = 0; x < 512; x += 64) g.fillRect(x, 0, 3, 256);
  g.fillRect(0, 118, 512, 3);
  // Coulures sombres depuis le haut du mur.
  g.fillStyle = 'rgba(60,58,54,0.16)';
  for (let i = 0; i < 22; i++) {
    g.fillRect(r() * 512, 0, 2 + r() * 3, 40 + r() * 120);
  }
  // Mousse / salissures en pied de mur (bas du canvas = bas du mur).
  for (let i = 0; i < 60; i++) {
    const h = 8 + r() * 26;
    g.fillStyle = `rgba(${86 + Math.floor(r() * 30)},${104 + Math.floor(r() * 30)},66,0.25)`;
    g.fillRect(r() * 512, 256 - h, 6 + r() * 14, h);
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --- Faisceau de voies (corridors) : ballast + UNE paire de rails par repeat
// (repeat.x = nombre de paires visibles ; les rails vivent dans la texture,
// zéro géométrie supplémentaire) ---
export function makeTrackFieldTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 512);
  const r = rng(929);
  g.fillStyle = '#8e8c8a';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 1800; i++) {
    const shade = 108 + Math.floor(r() * 58);
    g.fillStyle = `rgb(${shade + 4},${shade + 2},${shade})`;
    g.fillRect(r() * 256, r() * 512, 2 + r() * 3, 2 + r() * 3);
  }
  // Traverses.
  g.fillStyle = '#6a6664';
  for (let y = 6; y < 512; y += 40) g.fillRect(58, y, 140, 11);
  // Deux rails : semelle sombre, champignon clair.
  for (const x of [78, 170]) {
    g.fillStyle = '#55565c';
    g.fillRect(x, 0, 9, 512);
    g.fillStyle = '#c9ccd2';
    g.fillRect(x + 2, 0, 4, 512);
  }
  // Caniveau à câbles le long du bord.
  g.fillStyle = '#777470';
  g.fillRect(8, 0, 18, 512);
  g.fillStyle = '#5e5c58';
  g.fillRect(12, 0, 10, 512);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- Clôture de voie (niveau du sol) : poteaux + fils, ou haie taillée ---
export function makeTrackFenceTexture(hedge: boolean): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 64);
  const r = rng(hedge ? 551 : 313);
  g.clearRect(0, 0, 256, 64);
  if (hedge) {
    // Haie : masse verte irrégulière, opaque, sur toute la longueur.
    g.fillStyle = '#4e8f3c';
    g.fillRect(0, 16, 256, 48);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(${60 + Math.floor(r() * 40)},${120 + Math.floor(r() * 50)},52,0.8)`;
      g.fillRect(r() * 256 - 4, 8 + r() * 18, 8 + r() * 18, 20 + r() * 28);
    }
  } else {
    // Grillage : poteaux réguliers + trois fils horizontaux (fond transparent).
    g.fillStyle = '#7d8288';
    for (let x = 6; x < 256; x += 32) g.fillRect(x, 4, 4, 60);
    g.fillStyle = 'rgba(120,126,132,0.9)';
    for (const y of [14, 30, 46]) g.fillRect(0, y, 256, 2);
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --- Publicités japonaises procédurales (pools dans data/ads.ts) ---
const AD_LAYOUT_COUNT = 8;
const AD_MASCOT_COUNT = 7;

// Mascottes plates façon irasutoya : formes rondes, visages simples.
function drawMascot(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number, s: number): void {
  const face = () => {
    g.fillStyle = '#3a3430';
    g.beginPath();
    g.arc(cx - s * 0.18, cy, s * 0.05, 0, Math.PI * 2);
    g.arc(cx + s * 0.18, cy, s * 0.05, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a3430';
    g.lineWidth = s * 0.04;
    g.beginPath();
    g.arc(cx, cy + s * 0.1, s * 0.12, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
    // Joues roses.
    g.fillStyle = 'rgba(238,150,140,0.55)';
    g.beginPath();
    g.arc(cx - s * 0.32, cy + s * 0.12, s * 0.08, 0, Math.PI * 2);
    g.arc(cx + s * 0.32, cy + s * 0.12, s * 0.08, 0, Math.PI * 2);
    g.fill();
  };
  const k = ((kind % AD_MASCOT_COUNT) + AD_MASCOT_COUNT) % AD_MASCOT_COUNT;
  if (k === 0) {
    // Onigiri : triangle arrondi blanc + nori.
    g.fillStyle = '#fcfaf4';
    g.strokeStyle = '#d9d4c8';
    g.lineWidth = s * 0.04;
    g.beginPath();
    g.moveTo(cx, cy - s * 0.62);
    g.quadraticCurveTo(cx + s * 0.68, cy - s * 0.55, cx + s * 0.55, cy + s * 0.1);
    g.quadraticCurveTo(cx + s * 0.45, cy + s * 0.52, cx, cy + s * 0.52);
    g.quadraticCurveTo(cx - s * 0.45, cy + s * 0.52, cx - s * 0.55, cy + s * 0.1);
    g.quadraticCurveTo(cx - s * 0.68, cy - s * 0.55, cx, cy - s * 0.62);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#3d4a3a';
    g.beginPath();
    g.roundRect(cx - s * 0.22, cy + s * 0.14, s * 0.44, s * 0.38, s * 0.06);
    g.fill();
    face();
  } else if (k === 1) {
    // Chat rond : tête + oreilles + moustaches.
    g.fillStyle = '#f5e3c8';
    g.beginPath();
    g.moveTo(cx - s * 0.5, cy - s * 0.28);
    g.lineTo(cx - s * 0.34, cy - s * 0.62);
    g.lineTo(cx - s * 0.14, cy - s * 0.4);
    g.moveTo(cx + s * 0.5, cy - s * 0.28);
    g.lineTo(cx + s * 0.34, cy - s * 0.62);
    g.lineTo(cx + s * 0.14, cy - s * 0.4);
    g.fill();
    g.beginPath();
    g.arc(cx, cy, s * 0.52, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c9b394';
    g.lineWidth = s * 0.03;
    g.beginPath();
    for (const dir of [-1, 1]) {
      g.moveTo(cx + dir * s * 0.4, cy + s * 0.08);
      g.lineTo(cx + dir * s * 0.72, cy + s * 0.02);
      g.moveTo(cx + dir * s * 0.4, cy + s * 0.18);
      g.lineTo(cx + dir * s * 0.72, cy + s * 0.22);
    }
    g.stroke();
    face();
  } else if (k === 2) {
    // Daruma rebondi.
    g.fillStyle = '#dd5a4a';
    g.beginPath();
    g.arc(cx, cy, s * 0.56, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fcf6ea';
    g.beginPath();
    g.ellipse(cx, cy + s * 0.06, s * 0.36, s * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    face();
  } else if (k === 3) {
    // Lapin : tête blanche + oreilles longues.
    g.fillStyle = '#f7f4ef';
    g.beginPath();
    g.ellipse(cx - s * 0.22, cy - s * 0.55, s * 0.12, s * 0.38, -0.15, 0, Math.PI * 2);
    g.ellipse(cx + s * 0.22, cy - s * 0.55, s * 0.12, s * 0.38, 0.15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2b8b0';
    g.beginPath();
    g.ellipse(cx - s * 0.22, cy - s * 0.52, s * 0.05, s * 0.22, -0.15, 0, Math.PI * 2);
    g.ellipse(cx + s * 0.22, cy - s * 0.52, s * 0.05, s * 0.22, 0.15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7f4ef';
    g.beginPath();
    g.arc(cx, cy, s * 0.48, 0, Math.PI * 2);
    g.fill();
    face();
  } else if (k === 4) {
    // Pingouin : corps noir, ventre blanc, bec orange.
    g.fillStyle = '#2c3238';
    g.beginPath();
    g.ellipse(cx, cy + s * 0.04, s * 0.42, s * 0.52, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7f4ef';
    g.beginPath();
    g.ellipse(cx, cy + s * 0.12, s * 0.26, s * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8913a';
    g.beginPath();
    g.moveTo(cx - s * 0.1, cy - s * 0.02);
    g.lineTo(cx + s * 0.18, cy + s * 0.04);
    g.lineTo(cx - s * 0.1, cy + s * 0.1);
    g.closePath();
    g.fill();
    face();
  } else if (k === 5) {
    // Bol de riz / chawanmushi : bol + vapeur.
    g.fillStyle = '#f0ebe2';
    g.beginPath();
    g.ellipse(cx, cy - s * 0.08, s * 0.42, s * 0.18, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c45a3a';
    g.beginPath();
    g.moveTo(cx - s * 0.46, cy - s * 0.02);
    g.quadraticCurveTo(cx - s * 0.5, cy + s * 0.35, cx, cy + s * 0.48);
    g.quadraticCurveTo(cx + s * 0.5, cy + s * 0.35, cx + s * 0.46, cy - s * 0.02);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = s * 0.04;
    g.beginPath();
    g.moveTo(cx - s * 0.38, cy + s * 0.08);
    g.quadraticCurveTo(cx, cy + s * 0.18, cx + s * 0.38, cy + s * 0.08);
    g.stroke();
    g.strokeStyle = 'rgba(180,190,200,0.55)';
    g.lineWidth = s * 0.03;
    for (const dx of [-0.16, 0, 0.16]) {
      g.beginPath();
      g.moveTo(cx + s * dx, cy - s * 0.22);
      g.quadraticCurveTo(cx + s * dx + s * 0.06, cy - s * 0.4, cx + s * dx, cy - s * 0.55);
      g.stroke();
    }
    face();
  } else {
    // Poisson kawaii : ovale + nageoire + œil.
    g.fillStyle = '#6eb6d9';
    g.beginPath();
    g.ellipse(cx - s * 0.05, cy, s * 0.42, s * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx + s * 0.3, cy);
    g.lineTo(cx + s * 0.62, cy - s * 0.28);
    g.lineTo(cx + s * 0.62, cy + s * 0.28);
    g.closePath();
    g.fill();
    g.fillStyle = '#f0a060';
    g.beginPath();
    g.moveTo(cx - s * 0.05, cy - s * 0.28);
    g.lineTo(cx + s * 0.08, cy - s * 0.5);
    g.lineTo(cx + s * 0.12, cy - s * 0.22);
    g.closePath();
    g.fill();
    face();
  }
}

function drawMascotAd(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  portrait: boolean,
  kind: number,
  word: string,
  sub: string,
  accent: string,
  ink: string,
): void {
  if (portrait) {
    g.fillStyle = accent;
    g.globalAlpha = 0.16;
    g.beginPath();
    g.arc(W / 2, H * 0.38, W * 0.34, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    drawMascot(g, kind, W / 2, H * 0.38, W * 0.42);
    g.fillStyle = ink;
    g.textAlign = 'center';
    fitFillText(g, word, W / 2, H * 0.78, W * 0.86, Math.floor(W * 0.14));
    g.fillStyle = accent;
    fitFillText(g, sub, W / 2, H * 0.88, W * 0.86, Math.floor(W * 0.06));
    g.textAlign = 'left';
  } else {
    g.fillStyle = accent;
    g.globalAlpha = 0.16;
    g.beginPath();
    g.arc(W * 0.2, H * 0.5, H * 0.42, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    drawMascot(g, kind, W * 0.2, H * 0.5, H * 0.62);
    g.fillStyle = ink;
    fitFillText(g, word, W * 0.4, H * 0.52, W * 0.56, Math.floor(H * 0.3));
    g.fillStyle = accent;
    fitFillText(g, sub, W * 0.4, H * 0.78, W * 0.56, Math.floor(H * 0.14));
  }
}

/** Luminance approchée d'une couleur #rrggbb, pour trier les fonds. */
function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}

/**
 * Palettes à fond franc. Sur un quai déjà clair, une affiche à fond crème se
 * fond dans le béton : les caissons de quai tirent dans ce sous-ensemble.
 */
const AD_BOLD_PALETTES = AD_PALETTES.filter(([bg]) => luma(bg) < 0.7);

// Dessine une publicité dans un contexte existant : les gabarits sont exprimés
// en fractions de W et H, donc réutilisables à n'importe quelles proportions
// (affiches nakazuri, écrans 窓上, écran gauche au-dessus des portes).
export function drawAdInto(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  seed: number,
  bold = false,
): void {
  const portrait = H > W;
  const r = rng(500 + seed * 13);
  const palettes = bold ? AD_BOLD_PALETTES : AD_PALETTES;
  const [bg, accent, ink] = palettes[Math.floor(r() * palettes.length)];
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const layout = Math.floor(r() * AD_LAYOUT_COUNT);
  const word = AD_WORDS[Math.floor(r() * AD_WORDS.length)];
  const sub = AD_SUBS[Math.floor(r() * AD_SUBS.length)];
  if (layout >= 6) {
    // Affiche mascotte façon irasutoya : personnage plat + gros titre rond.
    drawMascotAd(g, W, H, portrait, Math.floor(r() * AD_MASCOT_COUNT), word, sub, accent, ink);
  } else if (layout === 0) {
    g.fillStyle = accent;
    g.fillRect(0, 0, W, H * 0.16);
    g.fillStyle = bg;
    fitFillText(g, sub, W * 0.05, H * 0.115, W * 0.9, Math.floor(H * 0.09));
    g.fillStyle = ink;
    fitFillText(g, word, W * 0.07, H * (portrait ? 0.42 : 0.68), W * 0.86, Math.floor(H * (portrait ? 0.11 : 0.34)));
    g.fillStyle = accent;
    fitFillText(
      g,
      `¥${(198 + Math.floor(r() * 24) * 50).toLocaleString()}`,
      W * 0.07,
      H * (portrait ? 0.6 : 0.92),
      W * 0.6,
      Math.floor(H * (portrait ? 0.08 : 0.22)),
    );
  } else if (layout === 1) {
    const grad = g.createLinearGradient(0, 0, 0, H * 0.62);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, bg);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H * 0.62);
    g.fillStyle = 'rgba(30,30,35,0.5)';
    g.beginPath();
    g.arc(W * 0.5, H * 0.36, H * 0.13, 0, Math.PI * 2);
    g.fill();
    g.fillRect(W * 0.4, H * 0.44, W * 0.2, H * 0.18);
    g.fillStyle = ink;
    fitFillText(g, word, W * 0.08, H * 0.82, W * 0.84, Math.floor(H * 0.1));
    fitFillText(g, sub, W * 0.08, H * 0.93, W * 0.84, Math.floor(H * 0.055), '');
  } else if (layout === 2) {
    // Titre vertical : taille calée sur la hauteur disponible.
    g.fillStyle = ink;
    const glyph = Math.min(Math.floor(W * 0.16), Math.floor((H * 0.78) / Math.max(1, word.length)));
    g.font = `bold ${glyph}px ${JP_FONT}`;
    for (let k = 0; k < word.length; k++) {
      g.fillText(word[k], W * 0.36, H * 0.14 + (k + 0.8) * glyph * 1.08, glyph * 1.2);
    }
    g.fillStyle = accent;
    g.fillRect(W * 0.08, H * 0.08, W * 0.06, H * 0.84);
    g.fillStyle = ink;
    fitFillText(g, sub, W * 0.56, H * 0.9, W * 0.4, Math.floor(W * 0.05));
  } else if (layout === 3) {
    // Bandes diagonales + gros pourcentage promo.
    g.save();
    g.translate(W * 0.72, H * 0.15);
    g.rotate(-0.4);
    g.fillStyle = accent;
    g.globalAlpha = 0.22;
    for (let i = -2; i < 6; i++) g.fillRect(i * W * 0.12, -H, W * 0.06, H * 2.4);
    g.globalAlpha = 1;
    g.restore();
    g.fillStyle = accent;
    g.beginPath();
    g.arc(W * (portrait ? 0.5 : 0.78), H * (portrait ? 0.28 : 0.42), H * (portrait ? 0.16 : 0.28), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.textAlign = 'center';
    fitFillText(
      g,
      `${10 + Math.floor(r() * 8) * 5}%`,
      W * (portrait ? 0.5 : 0.78),
      H * (portrait ? 0.3 : 0.46),
      H * 0.5,
      Math.floor(H * (portrait ? 0.1 : 0.18)),
    );
    g.textAlign = 'left';
    g.fillStyle = ink;
    fitFillText(g, word, W * 0.06, H * (portrait ? 0.62 : 0.55), W * (portrait ? 0.88 : 0.55), Math.floor(H * (portrait ? 0.1 : 0.22)));
    g.fillStyle = accent;
    fitFillText(g, sub, W * 0.06, H * (portrait ? 0.78 : 0.82), W * (portrait ? 0.88 : 0.55), Math.floor(H * (portrait ? 0.055 : 0.12)));
  } else if (layout === 4) {
    // Grille de pavés colorés façon magazine.
    const cols = portrait ? 2 : 4;
    const rows = portrait ? 3 : 2;
    const pad = Math.min(W, H) * 0.04;
    const cw = (W - pad * (cols + 1)) / cols;
    const ch = H * (portrait ? 0.42 : 0.48) / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const t = (row * cols + col) / Math.max(1, cols * rows - 1);
        g.fillStyle = t < 0.5 ? accent : ink;
        g.globalAlpha = 0.18 + t * 0.35;
        g.beginPath();
        g.roundRect(pad + col * (cw + pad), pad + row * (ch + pad * 0.6), cw, ch, Math.min(cw, ch) * 0.12);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = ink;
    fitFillText(g, word, W * 0.06, H * (portrait ? 0.72 : 0.78), W * 0.88, Math.floor(H * (portrait ? 0.09 : 0.16)));
    g.fillStyle = accent;
    fitFillText(g, sub, W * 0.06, H * (portrait ? 0.86 : 0.94), W * 0.88, Math.floor(H * (portrait ? 0.05 : 0.09)));
  } else {
    // Badge circulaire + barre bas de page.
    g.fillStyle = accent;
    g.beginPath();
    g.arc(W * (portrait ? 0.5 : 0.22), H * (portrait ? 0.32 : 0.45), H * (portrait ? 0.18 : 0.32), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = bg;
    g.textAlign = 'center';
    fitFillText(
      g,
      word.slice(0, Math.min(2, word.length)),
      W * (portrait ? 0.5 : 0.22),
      H * (portrait ? 0.34 : 0.48),
      H * 0.45,
      Math.floor(H * (portrait ? 0.1 : 0.16)),
    );
    g.textAlign = 'left';
    g.fillStyle = ink;
    fitFillText(
      g,
      word,
      portrait ? W * 0.08 : W * 0.42,
      portrait ? H * 0.62 : H * 0.42,
      portrait ? W * 0.84 : W * 0.52,
      Math.floor(H * (portrait ? 0.09 : 0.2)),
    );
    g.fillStyle = accent;
    g.fillRect(0, H * 0.82, W, H * 0.18);
    g.fillStyle = bg;
    fitFillText(g, sub, W * 0.05, H * 0.94, W * 0.9, Math.floor(H * 0.09));
  }
}

// --- Nakazuri (中吊り) : l'affiche suspendue au milieu du wagon ---
// Proportions relevées sur photos : la bannière est BEAUCOUP plus large que
// haute, de l'ordre de trois fois. C'est une planche unique en travers du
// wagon, pas une affiche de format B3 — celles-là sont portrait et se posent
// ailleurs. On rend donc un visuel continu, avec la réserve blanche de tête où
// mordent les pinces, et un bandeau de pied qui porte la mention légale, comme
// sur les campagnes qui prennent toute la largeur.
export function makeNakazuriTexture(seed: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 358;
  const { c, g } = makeCanvas(W, H);
  const r = rng(900 + seed * 17);
  const top = 22; // réserve blanche de suspension
  const foot = 42; // bandeau de pied

  g.fillStyle = '#f3f1ec';
  g.fillRect(0, 0, W, H);

  // Visuel principal, en pleine largeur.
  g.save();
  g.beginPath();
  g.rect(3, top, W - 6, H - top - foot);
  g.clip();
  g.translate(3, top);
  drawAdInto(g, W - 6, H - top - foot, seed * 3 + 1);
  g.restore();

  // Bandeau de pied : aplat sombre, titre en réserve et pavé de mentions.
  g.fillStyle = '#15181c';
  g.fillRect(3, H - foot, W - 6, foot - 4);
  g.fillStyle = '#f4f2ee';
  g.font = `bold ${Math.round(foot * 0.5)}px ${JP_FONT}`;
  g.fillText(AD_WORDS[Math.floor(r() * AD_WORDS.length)], 22, H - foot * 0.32);
  g.fillStyle = 'rgba(244,242,238,0.55)';
  g.font = `${Math.round(foot * 0.3)}px ${JP_FONT}`;
  g.fillText(AD_SUBS[Math.floor(r() * AD_SUBS.length)], W * 0.42, H - foot * 0.36);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = 'rgba(244,242,238,0.35)';
    g.fillRect(W - 190 + i * 44, H - foot * 0.72, 34, 16);
  }

  // Réserve de tête : pli, perforations.
  g.fillStyle = '#efece6';
  g.fillRect(0, 0, W, top);
  g.strokeStyle = 'rgba(140,140,146,0.45)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, top - 0.5);
  g.lineTo(W, top - 0.5);
  g.stroke();
  g.fillStyle = 'rgba(90,92,98,0.35)';
  for (const x of [W * 0.16, W * 0.5, W * 0.84]) {
    g.beginPath();
    g.ellipse(x, top / 2, 7, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(120,120,126,0.3)';
  g.lineWidth = 2;
  g.strokeRect(3, 2, W - 6, H - 6);

  // Grain du papier.
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(60,58,54,0.045)';
    g.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1 + r() * 1.6);
  }

  // Voile de brillance : le papier glacé accroche les rampes LED.
  const sheen = g.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.72, 'rgba(255,255,255,0.06)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);

  return toTexture(c);
}

export function makeAdTexture(seed: number, portrait: boolean, bold = false): THREE.CanvasTexture {
  const W = portrait ? 512 : 768;
  const H = portrait ? 720 : 240;
  const { c, g } = makeCanvas(W, H);
  drawAdInto(g, W, H, seed, bold);
  return toTexture(c);
}

// --- Visages des PNJ : traits dessinés sur fond transparent, pilotés par
// l'apparence (peau, cheveux, lunettes, masque, barbe, âge). Une texture par
// PNJ (128×128, bon marché). La calotte de cheveux est un mesh 3D séparé ;
// ici on ne dessine que la frange, les traits et les accessoires plats. ---
export function makeFaceTexture(app: Appearance, seed: number): THREE.CanvasTexture {
  const r = rng(2600 + seed * 40503);
  const { c, g } = makeCanvas(128, 128);
  const hair = app.hair.color;

  // Pas de frange dessinée sur le front : la coiffure est un volume 3D
  // (calotte + mèches) qui encadre naturellement le visage. On garde le canvas
  // du visage pour les seuls traits (sourcils, yeux, bouche, lunettes, masque).
  const fem = app.feminine;

  // Sourcils : arc doux et fin (plus clairs chez les seniors, plus fins
  // et arqués pour les visages féminins).
  g.strokeStyle = app.senior ? 'rgba(120,110,110,0.75)' : hair;
  g.lineWidth = app.senior ? 2 : fem ? 2.2 : 3;
  g.lineCap = 'round';
  g.beginPath();
  const browY = 53 + r() * 3;
  const browLift = fem ? 3 : 1.5;
  g.moveTo(31, browY + 3);
  g.quadraticCurveTo(41, browY - browLift, 52, browY + 1);
  g.moveTo(76, browY + 1);
  g.quadraticCurveTo(87, browY - browLift, 97, browY + 3);
  g.stroke();

  // Yeux : amande brun foncé, avec un petit reflet qui les rend vivants.
  const squint = r() > 0.62;
  const eyeRy = squint ? 3.5 : fem ? 7.5 : 6.5;
  g.fillStyle = '#2a2126';
  g.beginPath();
  g.ellipse(41, 66, 6, eyeRy, 0, 0, Math.PI * 2);
  g.ellipse(87, 66, 6, eyeRy, 0, 0, Math.PI * 2);
  g.fill();
  if (!squint) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(39, 63, 1.8, 0, Math.PI * 2);
    g.arc(85, 63, 1.8, 0, Math.PI * 2);
    g.fill();
  }
  // Cils : petit trait relevé au coin externe des visages féminins.
  if (fem && !squint) {
    g.strokeStyle = '#2a2126';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(35, 62);
    g.lineTo(31, 59);
    g.moveTo(93, 62);
    g.lineTo(97, 59);
    g.stroke();
  }

  // Joues légèrement rosées (jeunes visages surtout).
  if (!app.senior && (fem || r() < 0.3)) {
    g.fillStyle = `rgba(232,140,130,${fem ? 0.16 : 0.1})`;
    g.beginPath();
    g.arc(32, 84, 8, 0, Math.PI * 2);
    g.arc(96, 84, 8, 0, Math.PI * 2);
    g.fill();
  }

  // Nez discret (courte ombre douce).
  g.strokeStyle = 'rgba(150,110,86,0.32)';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(64, 72);
  g.quadraticCurveTo(62, 80, 65, 81);
  g.stroke();

  // Rides de senior.
  if (app.senior) {
    g.strokeStyle = 'rgba(120,96,80,0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(24, 60);
    g.lineTo(30, 63);
    g.moveTo(104, 60);
    g.lineTo(98, 63);
    g.moveTo(48, 88);
    g.quadraticCurveTo(64, 92, 80, 88);
    g.stroke();
  }

  // Bouche (masquée si masque chirurgical) : plus petite et plus douce,
  // sourire discret ou bouche neutre, teinte légèrement rosée au féminin.
  if (!app.mask) {
    g.strokeStyle = fem ? '#b3574f' : '#96594a';
    g.lineWidth = fem ? 2.6 : 3;
    g.lineCap = 'round';
    g.beginPath();
    if (r() > 0.45) {
      g.arc(64, 93, 6.5, 0.2 * Math.PI, 0.8 * Math.PI);
    } else {
      g.moveTo(58, 96);
      g.quadraticCurveTo(64, 97.5, 70, 96);
    }
    g.stroke();
  }

  // Barbe / bouc : ombre autour de la mâchoire et de la bouche.
  if (app.facialHair && !app.mask) {
    g.fillStyle = hair;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.moveTo(30, 78);
    g.quadraticCurveTo(64, 118, 98, 78);
    g.quadraticCurveTo(84, 104, 64, 104);
    g.quadraticCurveTo(44, 104, 30, 78);
    g.fill();
    g.globalAlpha = 1;
  }

  // Masque chirurgical : rectangle clair plissé, nez au menton.
  if (app.mask) {
    g.fillStyle = r() > 0.85 ? '#dfe6ec' : '#f4f5f2';
    g.beginPath();
    g.moveTo(28, 74);
    g.lineTo(100, 74);
    g.lineTo(96, 116);
    g.quadraticCurveTo(64, 124, 32, 116);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(180,186,190,0.7)';
    g.lineWidth = 1.5;
    for (let y = 86; y < 116; y += 8) {
      g.beginPath();
      g.moveTo(30, y);
      g.lineTo(98, y);
      g.stroke();
    }
    // Élastiques.
    g.strokeStyle = 'rgba(210,214,216,0.9)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(28, 76);
    g.lineTo(14, 66);
    g.moveTo(100, 76);
    g.lineTo(114, 66);
    g.stroke();
  }

  // Lunettes : montures autour des yeux + pont.
  if (app.glasses) {
    g.strokeStyle = r() > 0.5 ? '#2a2a30' : '#6a5a48';
    g.lineWidth = 2.5;
    g.beginPath();
    g.roundRect(30, 58, 22, 17, 5);
    g.roundRect(76, 58, 22, 17, 5);
    g.moveTo(52, 66);
    g.lineTo(76, 66);
    g.moveTo(30, 64);
    g.lineTo(20, 62);
    g.moveTo(98, 64);
    g.lineTo(108, 62);
    g.stroke();
  }

  return toTexture(c);
}

// --- Motif de tissu (rayures ou carreaux) sur couleur de base, pour le torse ---
export function makeStripeTexture(base: string, accent: string): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = accent;
  for (let x = 0; x < 128; x += 24) g.fillRect(x, 0, 12, 128);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export function makePlaidTexture(base: string, accent: string): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = accent;
  g.globalAlpha = 0.6;
  for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 14, 128);
  for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 14);
  g.globalAlpha = 1;
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

// --- Sol de quai : béton clair, joints, usure de passage ---
export function makePlatformFloorTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 512);
  const r = rng(901);
  g.fillStyle = '#a8a9a4';
  g.fillRect(0, 0, 512, 512);
  // Dalles.
  g.strokeStyle = 'rgba(120,122,118,0.55)';
  g.lineWidth = 2;
  for (let y = 0; y <= 512; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  for (let x = 0; x <= 512; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  for (let i = 0; i < 4200; i++) {
    const shade = 140 + Math.floor(r() * 50);
    g.fillStyle = `rgba(${shade},${shade - 2},${shade - 6},${0.12 + r() * 0.28})`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 2.2, 1 + r() * 2.2);
  }
  // Bande de passage plus claire près du bord (haut de la texture).
  const wear = g.createLinearGradient(0, 0, 0, 180);
  wear.addColorStop(0, 'rgba(190,192,186,0.35)');
  wear.addColorStop(1, 'rgba(190,192,186,0)');
  g.fillStyle = wear;
  g.fillRect(0, 0, 512, 180);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Badge trigramme + numéro JY (ex. OSK / JY 24), comme sur les vrais panneaux.
function drawStationCodeBadge(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  code: string,
  jy: string,
): void {
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = Math.max(2, size * 0.045);
  g.beginPath();
  g.roundRect(x, y, size, size, size * 0.1);
  g.fill();
  g.stroke();
  g.fillStyle = '#1a1a1a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.floor(size * 0.22)}px ${JP_FONT}`;
  g.fillText(code, x + size / 2, y + size * 0.28);
  // Cadre vert JY
  const bx = x + size * 0.12;
  const by = y + size * 0.48;
  const bw = size * 0.76;
  const bh = size * 0.4;
  g.strokeStyle = '#80c241';
  g.lineWidth = Math.max(3, size * 0.055);
  g.strokeRect(bx, by, bw, bh);
  g.fillStyle = '#1a1a1a';
  g.font = `bold ${Math.floor(size * 0.2)}px ${JP_FONT}`;
  g.fillText('JY', x + size / 2, by + bh * 0.32);
  g.font = `bold ${Math.floor(size * 0.28)}px ${JP_FONT}`;
  g.fillText(jy.slice(2), x + size / 2, by + bh * 0.72);
  g.textBaseline = 'alphabetic';
}

// --- Panneau de nom de station (style JR East réel, rétroéclairé) ---
// Disposition : badge code | kanji+kana centraux | bande verte directionnelle
// avec gare précédente / actuelle / suivante + flèche.
export function makeStationSign(): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; redraw: (index: number) => void } {
  const W = 1400;
  const H = 420;
  const { c, g } = makeCanvas(W, H);
  const texture = toTexture(c);
  const GREEN = '#80c241';
  const GREEN_LIGHT = '#a8d96a';
  const redraw = (index: number) => {
    const st = STATIONS[index];
    const prev = STATIONS[(index + 29) % 30];
    const next = STATIONS[(index + 1) % 30];

    // Fond blanc rétroéclairé + cadre noir fin.
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.lineWidth = 3;
    g.strokeRect(14, 14, W - 28, H - 28);

    // --- Zone haute : identité de la gare ---
    drawStationCodeBadge(g, 48, 36, 155, st.code, st.jy);

    g.fillStyle = '#1a1a1a';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const longName = st.kanji.length >= 6;
    g.font = `bold ${longName ? 84 : 118}px ${JP_FONT}`;
    g.fillText(st.kanji, W / 2 + 20, longName ? 128 : 138);
    g.font = `${longName ? 34 : 40}px ${JP_FONT}`;
    g.fillText(st.kana, W / 2 + 20, longName ? 180 : 196);

    // Reprise discrète à droite.
    g.textAlign = 'right';
    g.fillStyle = '#333333';
    g.font = `bold 24px ${JP_FONT}`;
    g.fillText(st.kanji, W - 200, 78);
    g.font = `20px ${JP_FONT}`;
    g.fillText(st.romaji, W - 200, 108);

    // Emblème type blason d'arrondissement.
    const emblemX = W - 100;
    const emblemY = 130;
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(emblemX, emblemY, 40, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(emblemX, emblemY, 24, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#1a1a1a';
    g.font = `bold 22px ${JP_FONT}`;
    g.textAlign = 'center';
    g.fillText(st.kanji.charAt(0), emblemX, emblemY + 8);

    // --- Bande verte directionnelle (bas) avec flèche ---
    const bandY = 248;
    const bandH = H - bandY - 18;
    g.fillStyle = GREEN;
    g.beginPath();
    g.moveTo(20, bandY);
    g.lineTo(W - 78, bandY);
    g.lineTo(W - 20, bandY + bandH / 2);
    g.lineTo(W - 78, bandY + bandH);
    g.lineTo(20, bandY + bandH);
    g.closePath();
    g.fill();

    // Encoche centrale claire (repère gare actuelle).
    g.fillStyle = GREEN_LIGHT;
    g.fillRect(W / 2 - 38, bandY, 76, bandH);

    // Précédente.
    g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    g.font = `bold 34px ${JP_FONT}`;
    g.fillText(prev.kanji, 44, bandY + 50);
    g.font = `bold 24px ${JP_FONT}`;
    g.fillText(prev.romaji, 44, bandY + 88);

    // Actuelle (romaji sous l'encoche).
    g.fillStyle = '#1a1a1a';
    g.textAlign = 'center';
    g.font = `bold 26px ${JP_FONT}`;
    fitFillText(g, st.romaji, W / 2, bandY + bandH / 2 + 9, 150, 26, 'bold');

    // Suivante + mini-badge.
    g.fillStyle = '#ffffff';
    g.textAlign = 'right';
    g.font = `bold 34px ${JP_FONT}`;
    g.fillText(next.kanji, W - 165, bandY + 50);
    g.font = `bold 24px ${JP_FONT}`;
    g.fillText(next.romaji, W - 165, bandY + 88);
    drawStationCodeBadge(g, W - 155, bandY + 28, 48, next.code, next.jy);

    texture.needsUpdate = true;
  };
  return { canvas: c, texture, redraw };
}

// --- Tableau d'affichage suspendu (ホームの電光掲示板) ---
/**
 * État réel affiché par le tableau des départs.
 *
 * L'ancien tableau annonçait « まもなく発車 » en permanence, y compris en pleine
 * voie entre deux gares, où il n'y a aucun train le long du quai. Un tableau de
 * quai dit ce qui se passe MAINTENANT : c'est ce qu'on regarde en arrivant, et
 * la seule surface animée d'un quai japonais.
 */
export interface BoardView {
  /** Ce que fait le prochain train. */
  status: 'approaching' | 'boarding' | 'departing' | 'waiting';
  /** Minutes avant le prochain train, quand on l'attend. */
  minutes: number;
  /** Le bandeau alterne japonais et anglais, comme un vrai afficheur. */
  english: boolean;
  /** Clignotement, quand la fermeture des portes est imminente. */
  blink: boolean;
}

export function makePlatformBoard(): {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  redraw: (index: number, view: BoardView) => void;
} {
  const W = 1024;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  const texture = toTexture(c);

  const redraw = (index: number, view: BoardView) => {
    const st = STATIONS[index];
    const ahead = directionBoardStations(index, 3);
    const jy = st.jy;
    // Le jeu tourne en 内回り (voir LOOP_JP) : c'est ce quai-là, et c'est ce
    // numéro-là que la sono du quai annonce (「N番線」). Les deux doivent dire
    // la même chose, sans quoi on lit un chiffre et on en entend un autre.
    const track = PLATFORM_NUMBERS[jy]?.inner ?? 1;

    g.fillStyle = '#0c1016';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#80c241';
    g.fillRect(0, 0, W, 8);
    g.fillRect(0, H - 8, W, 8);

    // --- Colonne de gauche : la ligne et le quai ---
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#d8ffe0';
    g.font = `bold 44px ${JP_FONT}`;
    g.fillText('山手線', 34, 66);
    g.font = `26px ${JP_FONT}`;
    g.fillStyle = '#9aa3b0';
    g.fillText('Yamanote Line', 34, 100);

    g.fillStyle = '#80c241';
    g.beginPath();
    g.roundRect(34, 126, 96, 92, 10);
    g.fill();
    g.fillStyle = '#0c1016';
    g.textAlign = 'center';
    g.font = `bold 62px ${JP_FONT}`;
    g.fillText(String(track), 82, 196);
    g.font = `bold 20px ${JP_FONT}`;
    g.fillText('番線', 82, 148);

    // --- Colonne centrale : la destination ---
    g.textAlign = 'left';
    g.fillStyle = '#f2f6fa';
    fitFillText(g, `${ahead.map((x) => x.kanji).join('・')}方面`, 158, 116, 500, 46);
    g.fillStyle = '#7f8794';
    fitFillText(g, `for ${ahead.map((x) => x.romaji).join(', ')}`, 158, 152, 500, 26, '400');

    // Filet, puis la gare suivante — celle qu'on atteint en montant ici.
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(158, 168, 500, 2);
    g.fillStyle = '#c8cdd6';
    g.font = `24px ${JP_FONT}`;
    g.fillText('次は', 158, 204);
    g.fillStyle = '#f2f6fa';
    fitFillText(g, STATIONS[(index + 1) % 30].kanji, 210, 206, 220, 34);
    g.fillStyle = '#7f8794';
    g.font = `20px ${JP_FONT}`;
    g.fillText(STATIONS[(index + 1) % 30].romaji, 210, 232);

    // --- Colonne de droite : l'état, en gros, et il change ---
    const band: Record<BoardView['status'], { jp: string; en: string; color: string }> = {
      approaching: { jp: 'まもなく到着', en: 'Arriving', color: '#ffd66a' },
      boarding: { jp: 'ご乗車ください', en: 'Now boarding', color: '#9be36a' },
      departing: { jp: 'まもなく発車', en: 'Departing', color: '#ff8f6a' },
      waiting: { jp: `約 ${view.minutes} 分後`, en: `in about ${view.minutes} min`, color: '#7fb6ff' },
    };
    const b = band[view.status];
    g.textAlign = 'right';
    // Le clignotement ne s'applique qu'à la fermeture imminente : partout
    // ailleurs, un afficheur qui bat serait illisible.
    g.fillStyle = view.blink ? '#20262e' : b.color;
    fitFillText(g, view.english ? b.en : b.jp, W - 34, 108, 330, view.english ? 44 : 52);
    g.fillStyle = '#8b929c';
    g.font = `22px ${JP_FONT}`;
    g.fillText(view.english ? b.jp : b.en, W - 34, 146);

    // Voyant d'activité : trois points qui suivent l'alternance de langue.
    for (let k = 0; k < 3; k++) {
      g.fillStyle = k === (view.english ? 1 : 0) ? b.color : 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.arc(W - 34 - k * 22, 190, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.textAlign = 'left';

    texture.needsUpdate = true;
  };
  return { canvas: c, texture, redraw };
}

/**
 * Plaque de balisage d'un accès : la lettre, et ce qu'elle désigne.
 *
 * Les plans officiels JR balisent chaque escalier, escalier mécanique et
 * ascenseur par une lettre, et c'est par elle qu'on se repère sur un quai de
 * deux cent vingt mètres.
 */
export function makeAccessPlate(letter: string, kind: 'stairs' | 'escalator' | 'elevator'): THREE.CanvasTexture {
  const W = 256;
  const H = 320;
  const { c, g } = makeCanvas(W, H);
  const label: Record<typeof kind, { jp: string; en: string }> = {
    stairs: { jp: '階段', en: 'Stairs' },
    escalator: { jp: 'エスカレーター', en: 'Escalator' },
    elevator: { jp: 'エレベーター', en: 'Elevator' },
  };
  const l = label[kind];

  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 8;
  g.strokeRect(4, 4, W - 8, H - 8);

  // La lettre, en réserve dans un carré sombre : c'est elle qu'on cherche.
  g.fillStyle = '#1a1a1a';
  g.fillRect(28, 28, W - 56, 160);
  g.fillStyle = '#f4f4f0';
  g.textAlign = 'center';
  fitFillText(g, letter, W / 2, 158, W - 80, 132);

  g.fillStyle = '#1a1a1a';
  fitFillText(g, l.jp, W / 2, 236, W - 40, 42);
  g.fillStyle = '#5c6066';
  fitFillText(g, l.en, W / 2, 280, W - 40, 28, '600');
  g.textAlign = 'left';
  return toTexture(c);
}

/**
 * Grande bande verte directionnelle, à plaquer sur l'épine du quai.
 *
 * Sur un quai japonais c'est l'élément le plus long et le plus lisible :
 * une flèche, les gares desservies, et rien d'autre. Elle dit d'un coup d'œil
 * dans quel sens part le train qu'on attend.
 */
export function makeDirectionBand(): {
  texture: THREE.CanvasTexture;
  redraw: (index: number) => void;
} {
  const W = 2048;
  const H = 192;
  const { c, g } = makeCanvas(W, H);
  const texture = toTexture(c);

  const redraw = (index: number) => {
    const ahead = directionBoardStations(index, 4);
    g.fillStyle = '#5aa32c';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(0, 0, W, 10);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(0, H - 12, W, 12);

    // Flèche de tête, dans le sens de la marche.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(58, H / 2);
    g.lineTo(150, 40);
    g.lineTo(150, 74);
    g.lineTo(300, 74);
    g.lineTo(300, H - 74);
    g.lineTo(150, H - 74);
    g.lineTo(150, H - 40);
    g.closePath();
    g.fill();

    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#ffffff';
    fitFillText(g, `${ahead.map((s) => s.kanji).join('・')}方面`, 340, H * 0.56, W - 420, 92);
    g.fillStyle = 'rgba(255,255,255,0.86)';
    fitFillText(g, `for ${ahead.map((s) => s.romaji).join(', ')}`, 342, H * 0.85, W - 420, 40, '600');

    texture.needsUpdate = true;
  };
  return { texture, redraw };
}

// --- Signalétique d'orientation suspendue au-dessus du quai ---
//
// C'est elle qui fait lire « gare japonaise » avant même qu'on ait déchiffré un
// caractère : une potence en travers du quai, un panneau JAUNE pour les
// sorties, un panneau BLANC pour les correspondances avec les pastilles de
// lignes colorées. Le quai n'avait jusqu'ici que son panneau de nom de gare.
//
// Même schéma que makeStationSign : la texture est créée une fois, seul son
// contenu est redessiné au changement de gare.

/** Jaune des panneaux de sortie JR. */
const EXIT_YELLOW = '#f2b705';

/** Flèche pleine, orientée par un angle (0 = vers le bas). */
function drawSignArrow(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  angle: number,
): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, size * 0.5);
  g.lineTo(-size * 0.42, -size * 0.05);
  g.lineTo(-size * 0.17, -size * 0.05);
  g.lineTo(-size * 0.17, -size * 0.5);
  g.lineTo(size * 0.17, -size * 0.5);
  g.lineTo(size * 0.17, -size * 0.05);
  g.lineTo(size * 0.42, -size * 0.05);
  g.closePath();
  g.fill();
  g.restore();
}

/**
 * Panneau jaune de sortie. `slot` choisit laquelle des deux sorties de la gare
 * est affichée, et le sens de la flèche.
 */
export function makeExitSign(slot: number): {
  texture: THREE.CanvasTexture;
  redraw: (index: number) => void;
} {
  const W = 1024;
  const H = 320;
  const { c, g } = makeCanvas(W, H);
  const texture = toTexture(c);
  const redraw = (index: number) => {
    const exits = stationExits(index);
    const exit = exits[slot % exits.length];
    g.fillStyle = EXIT_YELLOW;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#141414';
    g.lineWidth = 12;
    g.strokeRect(6, 6, W - 12, H - 12);

    g.fillStyle = '#141414';
    drawSignArrow(g, 120, H / 2, 150, slot % 2 === 0 ? 0 : -Math.PI / 4);

    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    fitFillText(g, exit.jp, 230, H * 0.52, W - 290, 96, 'bold');
    g.fillStyle = '#2a2a26';
    fitFillText(g, exit.en, 232, H * 0.78, W - 290, 46);

    // Mention 出口 / Exit, en réserve dans un bandeau sombre.
    g.fillStyle = '#141414';
    g.fillRect(W - 150, 22, 128, 74);
    g.fillStyle = EXIT_YELLOW;
    g.textAlign = 'center';
    fitFillText(g, '出口', W - 86, 80, 112, 54, 'bold');
    g.textAlign = 'left';

    texture.needsUpdate = true;
  };
  return { texture, redraw };
}

/**
 * Panneau blanc de correspondance : pastille colorée + nom de ligne, tiré des
 * mêmes données que les annonces (TRANSFERS). Une gare sans correspondance
 * reçoit à la place le rappel de la ligne Yamanote.
 */
export function makeTransferSign(): {
  texture: THREE.CanvasTexture;
  redraw: (index: number) => void;
} {
  const W = 1024;
  const H = 320;
  const { c, g } = makeCanvas(W, H);
  const texture = toTexture(c);
  const redraw = (index: number) => {
    const tr = TRANSFERS[STATIONS[index].jy];
    const names = tr
      ? tr.jp.split('、').map((s) => s.trim()).filter(Boolean).slice(0, 4)
      : ['山手線'];

    g.fillStyle = '#f6f5f2';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#141414';
    g.lineWidth = 12;
    g.strokeRect(6, 6, W - 12, H - 12);

    // Bandeau de gauche : のりかえ.
    g.fillStyle = '#141414';
    g.fillRect(18, 18, 196, H - 36);
    g.fillStyle = '#f6f5f2';
    g.textAlign = 'center';
    fitFillText(g, 'のりかえ', 116, H * 0.46, 168, 46, 'bold');
    fitFillText(g, 'Transfer', 116, H * 0.68, 168, 32);
    g.textAlign = 'left';

    // Une ligne par entrée : pastille de couleur puis nom.
    const rows = names.length;
    const rowH = (H - 52) / rows;
    for (let i = 0; i < rows; i++) {
      const info = lineInfo(names[i]);
      const y = 26 + i * rowH;
      g.fillStyle = info.color;
      g.beginPath();
      g.roundRect(238, y + rowH * 0.16, 26, rowH * 0.68, 13);
      g.fill();
      g.fillStyle = '#141414';
      const jpSize = Math.min(46, rowH * 0.52);
      fitFillText(g, names[i], 282, y + rowH * (info.romaji ? 0.56 : 0.68), W - 320, jpSize, 'bold');
      if (info.romaji) {
        g.fillStyle = '#55585c';
        fitFillText(g, info.romaji, 284, y + rowH * 0.88, W - 320, Math.min(28, rowH * 0.3));
        g.fillStyle = '#141414';
      }
    }

    texture.needsUpdate = true;
  };
  return { texture, redraw };
}

// --- Panneau de quai 番線 : le vrai marqueur visuel d'un quai Yamanote ---
//
// Grand aplat uguisu, numéro de voie en réserve blanche, badge JY, 山手線 avec
// le sens de la boucle, et la chaîne des gares desservies terminée par 方面.
// C'est ce panneau — pas l'affiche de sortie — qu'on voit en premier sur les
// photos de quai, et il manquait complètement.

export function makePlatformNumberSign(): {
  texture: THREE.CanvasTexture;
  redraw: (index: number, width?: number) => void;
} {
  const W = 1400;
  const H = 300;
  const { c, g } = makeCanvas(W, H);
  const texture = toTexture(c);
  const GREEN = '#7dbe3c';

  // Le caisson se raccourcit sur les quais étroits (voir OverheadSigns) : le
  // dessin se fait dans un repère PROPORTIONNÉ à l'affichage — L px de large
  // pour 300 de haut, ramenés au canvas par une échelle horizontale — sinon
  // toute la composition s'écrasait avec lui. Sous ~2,6 m, la mise en page
  // passe en version courte : mêmes numéro et badge, chaîne des gares réduite.
  const redraw = (index: number, width = 3.24) => {
    const jy = STATIONS[index].jy;
    // Le jeu tourne en 内回り (voir LOOP_JP) : c'est ce quai-là, et le même
    // numéro que celui annoncé par la sono du quai.
    const track = PLATFORM_NUMBERS[jy]?.inner ?? 1;
    const ahead = directionBoardStations(index, 5);
    const L = Math.round(((width - 0.08) / 0.66) * H);
    g.setTransform(W / L, 0, 0, 1, 0, 0);

    g.fillStyle = GREEN;
    g.fillRect(0, 0, L, H);
    g.strokeStyle = '#e8ecea';
    g.lineWidth = 8;
    g.strokeRect(4, 4, L - 8, H - 8);

    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';

    if (L < 1150) {
      // Version courte. Numéro et badge inchangés, nom de ligne et sens sur
      // une seule colonne, deux gares de direction au lieu de cinq.
      fitFillText(g, String(track), 108, H - 70, 170, 190, 'bold');
      g.strokeStyle = '#ffffff';
      g.lineWidth = 7;
      g.beginPath();
      g.roundRect(196, 58, 84, 84, 13);
      g.stroke();
      fitFillText(g, 'JY', 238, 118, 70, 46, 'bold');

      g.textAlign = 'left';
      fitFillText(g, '山手線（外回り）', 300, 130, L - 330, 60, 'bold');
      g.font = `28px ${JP_FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillText('Yamanote Line', 302, 174);

      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(300, 196, L - 330, 3);
      g.fillStyle = '#ffffff';
      const near = ahead.slice(0, 2);
      fitFillText(g, `${near.map((s) => s.kanji).join('・')}方面`, 300, 254, L - 330, 46, 'bold');
    } else {
      // Numéro de voie, en réserve, calé à gauche.
      g.font = `bold 210px ${JP_FONT}`;
      g.fillText(String(track), 118, H - 62);

      // Badge JY, façon pictogramme de ligne.
      g.strokeStyle = '#ffffff';
      g.lineWidth = 7;
      g.beginPath();
      g.roundRect(212, 42, 92, 92, 14);
      g.stroke();
      g.font = `bold 52px ${JP_FONT}`;
      fitFillText(g, 'JY', 258, 106, 78, 52, 'bold');

      // Nom de ligne et sens.
      g.textAlign = 'left';
      g.font = `bold 76px ${JP_FONT}`;
      g.fillText('山手線', 336, 108);
      g.font = `bold 46px ${JP_FONT}`;
      g.fillText('（外回り）', 594, 104);
      g.font = `30px ${JP_FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillText('Yamanote Line', 338, 148);

      // Filet séparateur puis la chaîne des gares desservies.
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(336, 168, L - 396, 3);
      g.fillStyle = '#ffffff';
      fitFillText(g, `${ahead.map((s) => s.kanji).join('・')}方面`, 336, 226, L - 396, 54, 'bold');
      g.fillStyle = 'rgba(255,255,255,0.92)';
      const en = ahead.map((s) => s.romaji);
      const enLine = `for ${en.slice(0, -1).join(', ')} & ${en[en.length - 1]}`;
      fitFillText(g, enLine, 338, 268, L - 396, 30);
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    texture.needsUpdate = true;
  };
  return { texture, redraw };
}

// --- La trousse du quai -------------------------------------------------
//
// Les petits équipements réglementaires qu'on ne remarque qu'en leur absence :
// bouton d'arrêt d'urgence, armoire technique, téléphone ferroviaire, repères
// de voiture peints au sol. Aucun ne change d'une gare à l'autre — ce sont des
// modèles JR standard — donc chaque texture est faite une fois pour la session.

/** Repère de voiture peint au sol, sous les pieds : 「N号車」 et 乗車位置. */
export function makeCarMarkTexture(car: number): THREE.CanvasTexture {
  const W = 256;
  const H = 320;
  const { c, g } = makeCanvas(W, H);
  // Le sol se voit à travers : seule la peinture est opaque.
  g.clearRect(0, 0, W, H);

  // Cartouche blanc cerné de vert, à la manière des marquages JR East.
  g.fillStyle = 'rgba(244,244,240,0.92)';
  g.strokeStyle = '#4f9b28';
  g.lineWidth = 9;
  g.beginPath();
  g.roundRect(14, 14, W - 28, H - 28, 16);
  g.fill();
  g.stroke();

  g.textAlign = 'center';
  g.fillStyle = '#2c2f33';
  fitFillText(g, `${car}`, W / 2, 150, W - 70, 128);
  g.fillStyle = '#4f9b28';
  fitFillText(g, '号車', W / 2, 210, W - 70, 52);
  g.fillStyle = '#5c6066';
  fitFillText(g, '乗車位置', W / 2, 268, W - 80, 36, '600');
  g.textAlign = 'left';
  return toTexture(c);
}

/** Bouton d'arrêt d'urgence 非常停止ボタン : caisson jaune, bouton rouge. */
export function makeEmergencyStopTexture(): THREE.CanvasTexture {
  const W = 200;
  const H = 260;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#e8b820';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#8a6b0d';
  g.lineWidth = 5;
  g.strokeRect(3, 3, W - 6, H - 6);

  // Bandeau noir du titre.
  g.fillStyle = '#1c1e21';
  g.fillRect(10, 12, W - 20, 46);
  g.fillStyle = '#f6d94a';
  g.textAlign = 'center';
  fitFillText(g, '非常停止ボタン', W / 2, 46, W - 34, 30);

  // Bouton champignon, en relief.
  g.fillStyle = '#7c1512';
  g.beginPath();
  g.arc(W / 2, 148, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#cc2a21';
  g.beginPath();
  g.arc(W / 2, 143, 50, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath();
  g.arc(W / 2 - 14, 126, 20, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = '#1c1e21';
  fitFillText(g, '押してください', W / 2, 232, W - 30, 26, '600');
  g.textAlign = 'left';
  return toTexture(c);
}

/** Armoire électrique : tôle grise, ouïes, triangle de danger. */
export function makeCabinetTexture(): THREE.CanvasTexture {
  const W = 200;
  const H = 300;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#9aa0a4';
  g.fillRect(0, 0, W, H);
  // Deux portes et leur joint central.
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(6, 6, W / 2 - 10, H - 12);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(W / 2 - 2, 4, 4, H - 8);

  // Ouïes de ventilation, en bas de chaque porte.
  g.fillStyle = '#5f656a';
  for (let y = H - 96; y < H - 24; y += 12) {
    g.fillRect(20, y, W / 2 - 34, 5);
    g.fillRect(W / 2 + 14, y, W / 2 - 34, 5);
  }

  // Triangle de danger et mention réglementaire.
  g.fillStyle = '#e8c22a';
  g.strokeStyle = '#1c1e21';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(W / 2, 34);
  g.lineTo(W / 2 + 40, 100);
  g.lineTo(W / 2 - 40, 100);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#1c1e21';
  g.textAlign = 'center';
  fitFillText(g, '⚡', W / 2, 92, 40, 42);
  fitFillText(g, '高電圧危険', W / 2, 132, W - 30, 26);
  g.fillStyle = '#3a3e42';
  fitFillText(g, '関係者以外', W / 2, 164, W - 40, 20, '600');
  fitFillText(g, '立入禁止', W / 2, 188, W - 40, 20, '600');

  // Poignée et serrure.
  g.fillStyle = '#43484c';
  g.fillRect(W / 2 - 26, H - 128, 18, 40);
  g.textAlign = 'left';
  return toTexture(c);
}

/** Téléphone ferroviaire : coffret crème, combiné, étiquette 列車無線. */
export function makeRailPhoneTexture(): THREE.CanvasTexture {
  const W = 180;
  const H = 240;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#e4e0d4';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#9a968a';
  g.lineWidth = 4;
  g.strokeRect(3, 3, W - 6, H - 6);

  g.fillStyle = '#1f4f8c';
  g.fillRect(10, 10, W - 20, 40);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  fitFillText(g, '列車無線', W / 2, 40, W - 30, 28);

  // Combiné sur sa fourche, vu de face.
  g.fillStyle = '#2c3035';
  g.beginPath();
  g.roundRect(W / 2 - 46, 78, 92, 26, 12);
  g.fill();
  g.beginPath();
  g.roundRect(W / 2 - 52, 72, 26, 40, 10);
  g.fill();
  g.beginPath();
  g.roundRect(W / 2 + 26, 72, 26, 40, 10);
  g.fill();
  // Cordon spiralé.
  g.strokeStyle = '#2c3035';
  g.lineWidth = 4;
  g.beginPath();
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    g.lineTo(W / 2 - 30 + Math.sin(t * Math.PI * 5) * 9, 112 + t * 46);
  }
  g.stroke();

  g.fillStyle = '#7c2018';
  fitFillText(g, '緊急連絡用', W / 2, 196, W - 30, 24);
  g.fillStyle = '#4a4e52';
  fitFillText(g, 'Railway phone', W / 2, 222, W - 24, 18, '600');
  g.textAlign = 'left';
  return toTexture(c);
}
