// Textures procédurales (CanvasTexture) : sol, moquettes, ciel de fin de
// journée, ville en parallaxe, ballast, publicités japonaises, visages des
// PNJ, panneaux et autocollants.

import * as THREE from 'three';
import { STATIONS } from '../data/stations';

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

// La variante nuit consomme EXACTEMENT la même séquence aléatoire que le
// jour : mêmes bâtiments, mêmes enseignes, pour un fondu parfait entre les
// deux plans superposés.
export function makeCityTexture(layer: 0 | 1 | 2, night = false): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(101 + layer * 57);
  // Voie surélevée : premier plan bas, le ciel doit respirer.
  const maxH = layer === 0 ? 0.5 : layer === 1 ? 0.5 : 0.45;
  const gapChance = layer === 0 ? 0.35 : layer === 1 ? 0.26 : 0;
  const fade = layer === 0 ? 1 : layer === 1 ? 0.75 : 0.5; // contraste des détails
  let x = 0;
  while (x < W) {
    const bw = 60 + r() * (layer === 0 ? 130 : 90);
    if (r() < gapChance) {
      x += bw * (0.5 + r());
      continue;
    }
    const bh = H * (0.2 + r() * maxH * 0.72);
    const facadeIdx = Math.floor(r() * FACADES.length);
    g.fillStyle = night ? NIGHT_FACADES[facadeIdx] : FACADES[facadeIdx];
    g.globalAlpha = 1;
    g.fillRect(x, H - bh, bw, bh);
    if (layer > 0) {
      g.fillStyle = night
        ? `rgba(28,34,52,${layer === 1 ? 0.35 : 0.6})`
        : `rgba(226,206,196,${layer === 1 ? 0.35 : 0.6})`;
      g.fillRect(x, H - bh, bw, bh);
    }
    // Toit : enseigne posée (lumineuse la nuit).
    if (layer < 2 && r() > 0.62) {
      const pw = bw * (0.4 + r() * 0.4);
      g.fillStyle = night ? '#20242e' : '#faf6ec';
      g.beginPath();
      g.roundRect(x + bw * 0.2, H - bh - 26, pw, 22, 6);
      g.fill();
      const roofColorIdx = Math.floor(r() * SHOP_COLORS.length);
      g.fillStyle = night ? NEON_COLORS[roofColorIdx] : SHOP_COLORS[roofColorIdx];
      g.font = `bold 15px ${JP_FONT}`;
      g.fillText(ROOF_WORDS[Math.floor(r() * ROOF_WORDS.length)], x + bw * 0.2 + 8, H - bh - 9);
    }
    if (layer < 2) {
      // Fenêtres : reflets de ciel le jour, largement allumées la nuit.
      const cols = Math.floor(bw / 16);
      const rows = Math.max(0, Math.floor((bh - 66) / 20));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const w1 = r();
          const w2 = r();
          if (night) {
            g.fillStyle =
              w1 > 0.42
                ? `rgba(255,${205 + Math.floor(w2 * 40)},140,${(0.65 + w2 * 0.3) * fade})`
                : `rgba(24,30,44,${0.7 * fade})`;
          } else {
            g.fillStyle =
              w1 > 0.8
                ? `rgba(238,240,236,${0.7 * fade})`
                : `rgba(136,170,196,${(0.5 + w2 * 0.3) * fade})`;
          }
          g.beginPath();
          g.roundRect(x + 6 + i * 16, H - bh + 8 + j * 20, 9, 12, 2);
          g.fill();
        }
      }
      // Devanture au rez-de-chaussée : bandeau, enseigne, vitrine.
      const shopIdx = Math.floor(r() * SHOP_COLORS.length);
      const shop = night ? NEON_COLORS[shopIdx] : SHOP_COLORS[shopIdx];
      g.fillStyle = shop;
      g.globalAlpha = (night ? 1 : 0.9) * fade;
      g.fillRect(x + 2, H - 58, bw - 4, 20);
      g.globalAlpha = 1;
      g.fillStyle = night ? '#2a2620' : '#fdf9f0';
      g.font = `bold 13px ${JP_FONT}`;
      g.fillText(SIGN_WORDS[Math.floor(r() * SIGN_WORDS.length)], x + 10, H - 43);
      // Auvent rayé une fois sur deux.
      if (r() > 0.5) {
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
    }
    // Enseigne verticale japonaise (néon la nuit).
    if (layer === 0 && r() > 0.55) {
      const sx = x + bw - 18;
      const sh = 80 + r() * 80;
      const sy = H - bh + 14 + r() * 30;
      const signIdx = Math.floor(r() * SHOP_COLORS.length);
      g.fillStyle = night ? NEON_COLORS[signIdx] : SHOP_COLORS[signIdx];
      g.beginPath();
      g.roundRect(sx, sy, 16, sh, 5);
      g.fill();
      g.fillStyle = night ? '#2a2620' : '#fdf9f0';
      g.font = `bold 11px ${JP_FONT}`;
      const word = SIGN_WORDS[Math.floor(r() * SIGN_WORDS.length)];
      for (let k = 0; k < word.length && k * 13 < sh - 12; k++) {
        g.fillText(word[k], sx + 3, sy + 14 + k * 13);
      }
    }
    x += bw + (layer === 0 ? r() * 26 : r() * 10);
  }
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
      g.font = `bold ${Math.floor(W * 0.14)}px ${JP_FONT}`;
      g.fillText(word, W / 2, H * 0.78);
      g.fillStyle = accent;
      g.font = `bold ${Math.floor(W * 0.06)}px ${JP_FONT}`;
      g.fillText(sub, W / 2, H * 0.88);
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
      g.font = `bold ${Math.floor(H * 0.3)}px ${JP_FONT}`;
      g.fillText(word, W * 0.4, H * 0.52);
      g.fillStyle = accent;
      g.font = `bold ${Math.floor(H * 0.14)}px ${JP_FONT}`;
      g.fillText(sub, W * 0.4, H * 0.78);
    }
  } else if (layout === 0) {
    g.fillStyle = accent;
    g.fillRect(0, 0, W, H * 0.16);
    g.fillStyle = bg;
    g.font = `bold ${Math.floor(H * 0.09)}px ${JP_FONT}`;
    g.fillText(sub, W * 0.05, H * 0.115);
    g.fillStyle = ink;
    g.font = `bold ${Math.floor(H * (portrait ? 0.11 : 0.34))}px ${JP_FONT}`;
    g.fillText(word, W * 0.07, H * (portrait ? 0.42 : 0.68));
    g.fillStyle = accent;
    g.font = `bold ${Math.floor(H * (portrait ? 0.08 : 0.22))}px ${JP_FONT}`;
    g.fillText(`¥${(198 + Math.floor(r() * 24) * 50).toLocaleString()}`, W * 0.07, H * (portrait ? 0.6 : 0.92));
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
    g.font = `bold ${Math.floor(H * 0.1)}px ${JP_FONT}`;
    g.fillText(word, W * 0.08, H * 0.82);
    g.font = `${Math.floor(H * 0.055)}px ${JP_FONT}`;
    g.fillText(sub, W * 0.08, H * 0.93);
  } else {
    g.fillStyle = ink;
    g.font = `bold ${Math.floor(W * 0.16)}px ${JP_FONT}`;
    for (let k = 0; k < word.length; k++) {
      g.fillText(word[k], W * 0.36, H * 0.18 + k * W * 0.18);
    }
    g.fillStyle = accent;
    g.fillRect(W * 0.08, H * 0.08, W * 0.06, H * 0.84);
    g.font = `bold ${Math.floor(W * 0.05)}px ${JP_FONT}`;
    g.fillStyle = ink;
    g.fillText(sub, W * 0.6, H * 0.9);
  }
  return toTexture(c);
}

// --- Visages des PNJ : traits dessinés, fond transparent ---
export interface FaceVariant {
  texture: THREE.CanvasTexture;
  hair: string;
  skin: string;
}

const SKINS = ['#f0c8a0', '#e8bd96', '#dcae85', '#f3d3b3'];
const HAIRS = ['#2a2a2e', '#3d3128', '#4a3a2a', '#565258', '#6b4a33'];

export function makeFaceVariants(): FaceVariant[] {
  const variants: FaceVariant[] = [];
  for (let i = 0; i < 8; i++) {
    const r = rng(900 + i * 31);
    const skin = SKINS[Math.floor(r() * SKINS.length)];
    const hair = HAIRS[Math.floor(r() * HAIRS.length)];
    const { c, g } = makeCanvas(128, 128);
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(64, 26, 58, 30, 0, Math.PI, 0);
    g.fill();
    if (r() > 0.5) g.fillRect(6, 20, 18, 40 + r() * 30);
    if (r() > 0.5) g.fillRect(104, 20, 18, 40 + r() * 30);
    g.strokeStyle = hair;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(30, 52);
    g.lineTo(52, 50);
    g.moveTo(76, 50);
    g.lineTo(98, 52);
    g.stroke();
    g.fillStyle = '#26232a';
    g.beginPath();
    g.ellipse(41, 66, 6.5, r() > 0.6 ? 4 : 7.5, 0, 0, Math.PI * 2);
    g.ellipse(87, 66, 6.5, r() > 0.6 ? 4 : 7.5, 0, 0, Math.PI * 2);
    g.fill();
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
    const texture = toTexture(c);
    variants.push({ texture, hair, skin });
  }
  return variants;
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
