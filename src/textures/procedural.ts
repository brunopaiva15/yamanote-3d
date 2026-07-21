// Textures procédurales (CanvasTexture) : sol, moquette des assises, ville en
// parallaxe, ballast, publicités japonaises, visages des PNJ, panneau de gare.

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
  t.anisotropy = 4;
  return t;
}

// --- Sol du wagon : gris-bleu moucheté ---
export function makeFloorTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 512);
  const r = rng(11);
  g.fillStyle = '#8a93a0';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i++) {
    const shade = 120 + Math.floor(r() * 70);
    g.fillStyle = `rgba(${shade - 12},${shade - 6},${shade + 6},${0.25 + r() * 0.5})`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 2.4, 1 + r() * 2.4);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 12);
  return t;
}

// --- Moquette des assises (trame tissée sur couleur de base) ---
export function makeSeatTexture(base: string): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  const r = rng(23);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const light = r() > 0.5;
    g.strokeStyle = light ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.13)';
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 7, y + (r() - 0.5) * 7);
    g.stroke();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- Ville en parallaxe : couche 0 (proche) à 2 (lointaine), fond transparent ---
const SIGN_WORDS = ['寿司', '居酒屋', 'カラオケ', '薬局', '書店', 'ラーメン', '喫茶', 'ホテル', '不動産', '歯科'];
const ROOF_WORDS = ['未来生活', '東京時間', '光る夜', '毎日新鮮', 'ネオン堂'];

export function makeCityTexture(layer: 0 | 1 | 2): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(101 + layer * 57);
  const baseShades = layer === 0 ? [86, 116] : layer === 1 ? [110, 140] : [135, 160];
  const maxH = layer === 0 ? 0.72 : layer === 1 ? 0.88 : 0.97;
  let x = 0;
  while (x < W) {
    const bw = 60 + r() * (layer === 0 ? 130 : 90);
    const bh = H * (0.25 + r() * maxH * 0.72);
    const shade = baseShades[0] + Math.floor(r() * (baseShades[1] - baseShades[0]));
    g.fillStyle = `rgb(${shade - 4},${shade},${shade + 7})`;
    g.fillRect(x, H - bh, bw, bh);
    // Toit : parfois un panneau publicitaire ou une enseigne néon.
    if (layer < 2 && r() > 0.62) {
      const pw = bw * (0.4 + r() * 0.4);
      g.fillStyle = r() > 0.5 ? '#3c4148' : '#4a4034';
      g.fillRect(x + bw * 0.2, H - bh - 26, pw, 22);
      g.fillStyle = r() > 0.5 ? '#ffb35a' : '#7fd4c9';
      g.font = `bold 15px ${JP_FONT}`;
      g.fillText(ROOF_WORDS[Math.floor(r() * ROOF_WORDS.length)], x + bw * 0.2 + 5, H - bh - 9);
    }
    // Fenêtres, certaines allumées (warm).
    if (layer < 2) {
      const cols = Math.floor(bw / 14);
      const rows = Math.floor(bh / 18);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (r() > 0.86) {
            g.fillStyle = `rgba(255,${200 + Math.floor(r() * 40)},140,${0.55 + r() * 0.4})`;
          } else {
            g.fillStyle = 'rgba(40,46,54,0.55)';
          }
          g.fillRect(x + 4 + i * 14, H - bh + 6 + j * 18, 8, 10);
        }
      }
    }
    // Enseigne verticale japonaise en façade.
    if (layer === 0 && r() > 0.55) {
      const sx = x + bw - 16;
      const sh = 90 + r() * 90;
      const sy = H - bh + 10 + r() * 40;
      g.fillStyle = ['#c9503e', '#3e6ec9', '#c9a53e', '#3ec96e'][Math.floor(r() * 4)];
      g.fillRect(sx, sy, 14, sh);
      g.fillStyle = '#f4f1e8';
      g.font = `bold 11px ${JP_FONT}`;
      const word = SIGN_WORDS[Math.floor(r() * SIGN_WORDS.length)];
      for (let k = 0; k < word.length && k * 13 < sh - 12; k++) {
        g.fillText(word[k], sx + 2, sy + 13 + k * 13);
      }
    }
    x += bw + (layer === 0 ? r() * 26 : r() * 10);
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// --- Sol extérieur : ballast et traverses ---
export function makeGroundTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 512);
  const r = rng(77);
  g.fillStyle = '#41454b';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2600; i++) {
    const shade = 50 + Math.floor(r() * 42);
    g.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
    g.fillRect(r() * 256, r() * 512, 2 + r() * 3, 2 + r() * 3);
  }
  // Traverses.
  for (let y = 8; y < 512; y += 42) {
    g.fillStyle = '#34363b';
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
];

export function makeAdTexture(seed: number, portrait: boolean): THREE.CanvasTexture {
  const W = portrait ? 512 : 768;
  const H = portrait ? 720 : 240;
  const { c, g } = makeCanvas(W, H);
  const r = rng(500 + seed * 13);
  const [bg, accent, ink] = AD_PALETTES[Math.floor(r() * AD_PALETTES.length)];
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const layout = Math.floor(r() * 3);
  const word = AD_WORDS[Math.floor(r() * AD_WORDS.length)];
  const sub = AD_SUBS[Math.floor(r() * AD_SUBS.length)];
  if (layout === 0) {
    // Bandeau d'accent + gros titre + prix.
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
    // Bloc « photo » dégradé + silhouette + titre.
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
    // Gros titre centré vertical (nakazuri classique).
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
    // Frange.
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(64, 26, 58, 30, 0, Math.PI, 0);
    g.fill();
    if (r() > 0.5) g.fillRect(6, 20, 18, 40 + r() * 30); // mèches longues
    if (r() > 0.5) g.fillRect(104, 20, 18, 40 + r() * 30);
    // Sourcils.
    g.strokeStyle = hair;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(30, 52);
    g.lineTo(52, 50);
    g.moveTo(76, 50);
    g.lineTo(98, 52);
    g.stroke();
    // Yeux.
    g.fillStyle = '#26232a';
    g.beginPath();
    g.ellipse(41, 66, 6.5, r() > 0.6 ? 4 : 7.5, 0, 0, Math.PI * 2);
    g.ellipse(87, 66, 6.5, r() > 0.6 ? 4 : 7.5, 0, 0, Math.PI * 2);
    g.fill();
    // Bouche.
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
    // Nom principal.
    g.fillStyle = '#1d1d20';
    g.font = `bold 96px ${JP_FONT}`;
    g.textAlign = 'center';
    g.fillText(st.kanji, 512, 130);
    g.font = `44px ${JP_FONT}`;
    g.fillStyle = '#3a3a40';
    g.fillText(st.romaji, 512, 190);
    // Pastille JY.
    g.fillStyle = '#80c241';
    g.beginPath();
    g.roundRect(40, 40, 120, 120, 18);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `bold 34px ${JP_FONT}`;
    g.fillText('JY', 100, 88);
    g.font = `bold 44px ${JP_FONT}`;
    g.fillText(st.jy.slice(2), 100, 138);
    // Bandeau vert bas : stations voisines avec flèches.
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
