// Textures procédurales (CanvasTexture) : sol, moquettes, ciel de fin de
// journée, ville en parallaxe, ballast, publicités japonaises, visages des
// PNJ, panneaux et autocollants.

import * as THREE from 'three';
import { STATIONS } from '../data/stations';
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
  g.fillStyle = '#9fa3a9';
  g.fillRect(0, 0, 512, 512);
  // Bande centrale légèrement plus foncée et patinée (allée).
  g.fillStyle = 'rgba(116,120,128,0.28)';
  g.fillRect(150, 0, 212, 512);
  // Moucheture fine.
  for (let i = 0; i < 5200; i++) {
    const shade = 130 + Math.floor(r() * 62);
    g.fillStyle = `rgba(${shade - 8},${shade - 4},${shade + 4},${0.16 + r() * 0.3})`;
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
export function makeCheckerTexture(shades: string[]): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  const r = rng(41 + shades.length);
  const cell = 16;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      g.fillStyle = shades[Math.floor(r() * shades.length)];
      g.fillRect(x, y, cell, cell);
    }
  }
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

// --- Sticker de sol rouge « Priority Seat » (extrémités du wagon) ---
export function makePriorityFloorTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  g.fillStyle = '#c8362c';
  g.beginPath();
  g.roundRect(6, 6, 244, 244, 26);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(16, 16, 224, 224, 20);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 64px ${JP_FONT}`;
  g.fillText('優先席', 128, 118);
  g.font = `26px ${JP_FONT}`;
  g.fillText('Priority Seat', 128, 168);
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
// banques de Scenery re-dessinent dans leur canvas existant, sans allocation).
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
export function makeGroundTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 512);
  const r = rng(77);
  g.fillStyle = '#8a888a';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2600; i++) {
    const shade = 110 + Math.floor(r() * 60);
    g.fillStyle = `rgb(${shade + 6},${shade + 2},${shade})`;
    g.fillRect(r() * 256, r() * 512, 2 + r() * 3, 2 + r() * 3);
  }
  for (let y = 8; y < 512; y += 42) {
    g.fillStyle = '#6e6a68';
    g.fillRect(30, y, 196, 12);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- Mur de soutènement (tranchées) : panneaux béton, joints, coulures ---
// Texture jour uniquement : la nuit se fait par multiplication de couleur au
// runtime (idiome de la couche lointaine de Scenery), l'invariant jour/nuit
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

// --- Publicités japonaises procédurales (texte plausible, non déposé) ---
const AD_WORDS = ['新発売', '期間限定', '半額セール', '求人募集', '英会話', '春の旅行', '毎日健康', '東京生活', '新しい朝', '家族の時間'];
const AD_SUBS = ['今だけのチャンス', '詳しくはウェブで', 'お近くの店舗へ', '数量限定です', '皆様に感謝'];
const AD_PALETTES: [string, string, string][] = [
  ['#f2ede2', '#c9503e', '#2e2b28'],
  ['#e8f0f2', '#3e6ec9', '#22303c'],
  ['#f4efdd', '#3e9c60', '#2c332a'],
  ['#efe6ee', '#8d4e9c', '#302636'],
  ['#f5ead8', '#d98a2b', '#33291c'],
  ['#fdf3e3', '#e2705c', '#4a3f38'],
  ['#eaf4ec', '#63c28a', '#37463c'],
  ['#f3ecf6', '#c97fb8', '#453a4a'],
];

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
  if (kind === 0) {
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
  } else if (kind === 1) {
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
  } else {
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
  }
}

export function makeAdTexture(seed: number, portrait: boolean): THREE.CanvasTexture {
  const W = portrait ? 512 : 768;
  const H = portrait ? 720 : 240;
  const { c, g } = makeCanvas(W, H);
  const r = rng(500 + seed * 13);
  const [bg, accent, ink] = AD_PALETTES[Math.floor(r() * AD_PALETTES.length)];
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const layout = Math.floor(r() * 5);
  const word = AD_WORDS[Math.floor(r() * AD_WORDS.length)];
  const sub = AD_SUBS[Math.floor(r() * AD_SUBS.length)];
  if (layout >= 3) {
    // Affiche mascotte façon irasutoya : personnage plat + gros titre rond.
    const kind = Math.floor(r() * 3);
    if (portrait) {
      // Pastille de fond douce derrière la mascotte.
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
  } else {
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
  }
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

  // Sourcils (plus clairs et fins chez les seniors).
  g.strokeStyle = app.senior ? 'rgba(120,110,110,0.8)' : hair;
  g.lineWidth = app.senior ? 2.5 : 3.5;
  g.beginPath();
  const browY = 54 + r() * 3;
  g.moveTo(30, browY + 2);
  g.lineTo(52, browY);
  g.moveTo(76, browY);
  g.lineTo(98, browY + 2);
  g.stroke();

  // Yeux : ronds ou plissés.
  const squint = r() > 0.6;
  g.fillStyle = '#26232a';
  g.beginPath();
  g.ellipse(41, 66, 6.5, squint ? 4 : 7.5, 0, 0, Math.PI * 2);
  g.ellipse(87, 66, 6.5, squint ? 4 : 7.5, 0, 0, Math.PI * 2);
  g.fill();

  // Nez discret (légère ombre).
  g.strokeStyle = 'rgba(150,110,86,0.4)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(64, 70);
  g.lineTo(61, 82);
  g.lineTo(66, 83);
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

  // Bouche (masquée si masque chirurgical).
  if (!app.mask) {
    g.strokeStyle = '#a2604f';
    g.lineWidth = 3.5;
    g.beginPath();
    if (r() > 0.5) {
      g.arc(64, 94, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      g.moveTo(56, 96);
      g.lineTo(72, 96);
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

// --- Panneau de nom de station (style JR) ---
export function makeStationSign(): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; redraw: (index: number) => void } {
  const { c, g } = makeCanvas(1024, 320);
  const texture = toTexture(c);
  const redraw = (index: number) => {
    const st = STATIONS[index];
    const prev = STATIONS[(index + 29) % 30];
    const next = STATIONS[(index + 1) % 30];
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, 0, 1024, 320);
    g.strokeStyle = '#c8c8c2';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 1020, 316);
    g.fillStyle = '#1d1d20';
    g.font = `bold 96px ${JP_FONT}`;
    g.textAlign = 'center';
    g.fillText(st.kanji, 512, 130);
    g.font = `44px ${JP_FONT}`;
    g.fillStyle = '#3a3a40';
    g.fillText(st.romaji, 512, 190);
    g.fillStyle = '#80c241';
    g.beginPath();
    g.roundRect(40, 40, 120, 120, 18);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `bold 34px ${JP_FONT}`;
    g.fillText('JY', 100, 88);
    g.font = `bold 44px ${JP_FONT}`;
    g.fillText(st.jy.slice(2), 100, 138);
    g.fillStyle = '#80c241';
    g.fillRect(0, 232, 1024, 88);
    g.fillStyle = '#ffffff';
    g.font = `bold 40px ${JP_FONT}`;
    g.textAlign = 'left';
    g.fillText(`← ${prev.kanji}`, 36, 290);
    g.textAlign = 'right';
    g.fillText(`${next.kanji} →`, 988, 290);
    g.textAlign = 'center';
    g.font = `28px ${JP_FONT}`;
    g.fillText(`${prev.romaji}   |   ${next.romaji}`, 512, 258);
    g.textAlign = 'left';
    texture.needsUpdate = true;
  };
  return { canvas: c, texture, redraw };
}
