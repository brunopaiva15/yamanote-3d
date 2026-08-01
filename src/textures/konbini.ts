// Ce qu'on voit dans un commerce de gare, imprimé.
//
// Le hall avait déjà deux images de commerce - un bandeau NEWDAYS et un
// « intérieur » peint - et elles suffisaient tant que le konbini était une
// vitrine plaquée devant une boîte. Elles ne suffisent plus : la boutique est
// devenue un VOLUME qu'on regarde du dehors comme du dedans, et un volume
// demande des surfaces qui tiennent de près.
//
// CE QUI FAIT UN KONBINI, ce n'est ni le logo ni le mobilier : c'est la
// DENSITÉ. Un rayon de gare est plein bord à bord, aligné au millimètre,
// étiqueté sous chaque produit, et éclairé d'une lumière franche qui ne laisse
// aucune ombre. Toutes les images d'ici travaillent cette densité - jamais un
// aplat, toujours des rangs.
//
// TROIS RÈGLES tenues d'un bout à l'autre du fichier :
//
//   · rien n'est tiré au hasard sans graine. Une gare doit se retrouver
//     identique d'une visite à l'autre - c'est ce qui la rend familière - et
//     deux rayons voisins doivent différer : la graine porte les deux ;
//   · rien n'est écrit qui ne se lise. Un prix à 12 px sur une texture vue à
//     trois mètres n'est qu'un gris sale ; on écrit gros et peu ;
//   · rien n'imite une marque. NEWDAYS, les journaux, les magazines existent :
//     on en garde la STRUCTURE - un bandeau bleu, une manchette noire sur
//     papier gris, un bandeau de titre en haut d'une couverture - et jamais le
//     dessin.

import * as THREE from 'three';
import { fitFillText, rng } from './procedural';
import { STATIONS } from '../data/stations';

const JP_FONT = '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif';

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

/** Le vert JR East, celui de toute la signalétique du groupe. */
const JR_GREEN = '#0d8a3e';
/** Le bleu NEWDAYS : c'est lui qu'on repère au bout d'un quai. */
const NEWDAYS_BLUE = '#0b4f9e';
/** Le jaune des étiquettes de prix, et de rien d'autre. */
const POP_YELLOW = '#f5c518';

/**
 * La palette d'un rayon de konbini.
 *
 * Ce n'est pas un arc-en-ciel : un rayon japonais est majoritairement BLANC et
 * CRÈME - emballages de riz, de pain, de papier - piqué de rouges et de bleus
 * de marque, avec du vert de thé et de l'orange de snack. L'ordre de la liste
 * est celui de la fréquence, et le tirage la respecte : un rayon tout bariolé
 * ne ressemble à rien, un rayon tout blanc non plus.
 */
export const GOODS_TONES: readonly string[] = [
  '#f4f1e8',
  '#ffffff',
  '#e9e3d2',
  '#d8452e',
  '#1f5fbf',
  '#2f7a44',
  '#e0a51f',
  '#c86a18',
  '#f0e0c0',
  '#8a3f9c',
  '#3aa0c8',
  '#b8322c',
];

/** Une teinte de rayon, tirée avec le biais de la palette (les premières sortent plus). */
export function goodsTone(r: () => number): string {
  const k = Math.floor(r() ** 1.6 * GOODS_TONES.length);
  return GOODS_TONES[Math.min(GOODS_TONES.length - 1, k)];
}

/**
 * Un produit posé sur une étagère, dessiné de face.
 *
 * Trois silhouettes suffisent à peupler un konbini entier, parce que ce sont
 * les trois qui existent : la BOÎTE (biscuits, riz, boîtes de conserve), le
 * SACHET (chips, bonbons - épaules molles, soudure en haut), et le POT
 * (nouilles instantanées, gobelets - tronconique, couvercle clair). Ce qui les
 * distingue à trois mètres est leur profil, pas leur étiquette.
 */
function drawItem(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tone: string,
  kind: 0 | 1 | 2,
  r: () => number,
): void {
  g.fillStyle = tone;
  if (kind === 0) {
    g.fillRect(x, y - h, w, h);
  } else if (kind === 1) {
    // Sachet : les épaules s'arrondissent et la soudure du haut dépasse.
    const s = Math.min(w * 0.3, h * 0.22);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - h + s);
    g.quadraticCurveTo(x, y - h, x + s, y - h);
    g.lineTo(x + w - s, y - h);
    g.quadraticCurveTo(x + w, y - h, x + w, y - h + s);
    g.lineTo(x + w, y);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(x + w * 0.12, y - h - 2, w * 0.76, 4);
  } else {
    // Pot : plus large en haut qu'en bas, et coiffé d'un opercule clair.
    const taper = w * 0.14;
    g.beginPath();
    g.moveTo(x + taper, y);
    g.lineTo(x, y - h + 6);
    g.lineTo(x + w, y - h + 6);
    g.lineTo(x + w - taper, y);
    g.closePath();
    g.fill();
    g.fillStyle = '#dcd7cc';
    g.fillRect(x - 1, y - h, w + 2, 7);
  }
  // Le bandeau de marque : une bande franche en travers, comme sur tout
  // emballage japonais. C'est elle qui empêche le produit d'être un aplat.
  if (r() > 0.3) {
    g.fillStyle = r() > 0.5 ? 'rgba(20,24,32,0.72)' : 'rgba(255,255,255,0.7)';
    const by = y - h * (0.42 + r() * 0.22);
    g.fillRect(x + 1, by, w - 2, Math.max(3, h * 0.11));
  }
}

/**
 * Le nez d'étagère : le rail d'étiquettes qui court sous chaque rangée.
 *
 * Sans lui, une étagère est une planche ; avec lui, c'est un rayon. Toute la
 * lisibilité d'un konbini tient à cette ligne blanche répétée tous les vingt
 * centimètres, et elle coûte trois traits.
 */
function drawShelfLip(g: CanvasRenderingContext2D, y: number, W: number, r: () => number): void {
  g.fillStyle = '#c9c3b4';
  g.fillRect(0, y, W, 12);
  g.fillStyle = '#fbfaf6';
  g.fillRect(0, y + 2, W, 8);
  let x = 4;
  while (x < W - 6) {
    const w = 26 + r() * 30;
    g.fillStyle = r() > 0.78 ? '#d8452e' : '#3c4148';
    g.fillRect(x + 3, y + 4, Math.min(w - 8, 16), 4);
    x += w;
  }
}

/**
 * Un pan de rayonnage garni, vu de face : quatre à six étages pleins.
 *
 * C'est la texture la plus employée du commerce - elle habille le fond du
 * konbini, les joues de la gondole et le corps du kiosque - et c'est pourquoi
 * elle prend une graine : deux pans identiques côte à côte se voient tout de
 * suite, deux pans tirés de la même palette ne se voient pas du tout.
 */
export function makeShelfGoodsTexture(seed: number, rows = 5): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(9100 + seed * 7919);

  // Le fond d'une gondole est une tôle claire, pas un trou noir : elle renvoie
  // la lumière des réglettes du plafond, et c'est ce qui fait qu'un konbini
  // n'a d'ombre nulle part.
  const back = g.createLinearGradient(0, 0, 0, H);
  back.addColorStop(0, '#fbf9f2');
  back.addColorStop(1, '#e4e0d4');
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);

  const pitch = H / rows;
  for (let row = 0; row < rows; row++) {
    const deck = Math.round((row + 1) * pitch) - 14;
    // Le fond de l'étage, un ton plus sourd : c'est l'ombre du produit sur la
    // tôle, et sans elle les rangs flottent.
    g.fillStyle = 'rgba(120,116,104,0.16)';
    g.fillRect(0, deck - pitch + 16, W, pitch - 16);
    let x = 5;
    // Un rang est une SÉRIE : le même produit se répète deux à cinq fois avant
    // que le suivant commence. C'est le facing d'un vrai rayon, et c'est ce
    // qui distingue un konbini d'un vide-grenier.
    while (x < W - 12) {
      const tone = goodsTone(r);
      const kind = (Math.floor(r() * 3) % 3) as 0 | 1 | 2;
      const w = 26 + r() * 40;
      const h = Math.min(pitch - 26, 34 + r() * 44);
      const facings = 2 + Math.floor(r() * 4);
      for (let f = 0; f < facings && x < W - 12; f++) {
        drawItem(g, x, deck, w, h, tone, kind, r);
        x += w + 2;
      }
      x += 4 + r() * 6;
    }
    drawShelfLip(g, deck, W, r);
  }
  return toTexture(c);
}

/**
 * La porte d'une vitrine réfrigérée, vue du dehors.
 *
 * Un konbini se reconnaît de la rue à ce mur de portes vitrées froides, et ce
 * qui le signale n'est pas le contenu mais la LUMIÈRE : l'intérieur est plus
 * clair que la boutique, bleuté, et le verre porte deux reflets obliques. Les
 * bouteilles, elles, sont debout en rangs serrés et toutes de la même taille
 * par étage - c'est un frigo, pas une brocante.
 */
export function makeCoolerDoorTexture(seed: number): THREE.CanvasTexture {
  const W = 512;
  const H = 1024;
  const { c, g } = makeCanvas(W, H);
  const r = rng(4400 + seed * 6151);

  const back = g.createLinearGradient(0, 0, 0, H);
  back.addColorStop(0, '#f2f8fb');
  back.addColorStop(1, '#d5e4ec');
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);

  // Cinq étages de bouteilles. Le rang du bas est le plus haut (grands
  // formats), celui du haut le plus court (canettes) : c'est le rangement de
  // toutes les vitrines du monde, et il se lit sans qu'on sache pourquoi.
  const rows = 5;
  const pitch = H / rows;
  for (let row = 0; row < rows; row++) {
    const deck = Math.round((row + 1) * pitch) - 10;
    const tall = row >= rows - 2;
    const bw = tall ? 46 : 36;
    const bh = tall ? pitch * 0.74 : pitch * 0.56;
    g.fillStyle = 'rgba(90,120,140,0.14)';
    g.fillRect(0, deck - pitch + 12, W, pitch - 12);
    let x = 6;
    while (x < W - bw) {
      const tone = goodsTone(r);
      const facings = 2 + Math.floor(r() * 3);
      for (let f = 0; f < facings && x < W - bw; f++) {
        // Corps de la bouteille, épaule, bouchon : trois traits, une bouteille.
        g.fillStyle = tone;
        g.fillRect(x, deck - bh, bw, bh);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(x + 3, deck - bh, 5, bh);
        g.fillStyle = '#cdd6da';
        g.fillRect(x + bw * 0.3, deck - bh - 14, bw * 0.4, 14);
        g.fillStyle = r() > 0.5 ? '#d8452e' : '#1f5fbf';
        g.fillRect(x + bw * 0.28, deck - bh - 20, bw * 0.44, 7);
        x += bw + 3;
      }
      x += 3;
    }
    // Rail d'étiquettes, blanc, sous chaque étage.
    g.fillStyle = '#eef3f5';
    g.fillRect(0, deck, W, 11);
    g.fillStyle = '#7d8f99';
    for (let x2 = 8; x2 < W - 10; x2 += 54) g.fillRect(x2, deck + 3, 22, 4);
  }

  // Le verre : deux reflets obliques, et la buée froide en pied. C'est ce qui
  // met le contenu DERRIÈRE quelque chose.
  g.globalAlpha = 0.2;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(-40, H * 0.1);
  g.lineTo(W * 0.42, -20);
  g.lineTo(W * 0.62, -20);
  g.lineTo(W * 0.1, H * 0.5);
  g.closePath();
  g.fill();
  g.globalAlpha = 0.12;
  g.beginPath();
  g.moveTo(W * 0.6, H);
  g.lineTo(W, H * 0.55);
  g.lineTo(W, H * 0.75);
  g.lineTo(W * 0.82, H);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;

  // Montant et poignée : une porte de frigo a un côté par où on l'ouvre.
  g.fillStyle = 'rgba(210,220,226,0.9)';
  g.fillRect(0, 0, 14, H);
  g.fillRect(W - 14, 0, 14, H);
  g.fillStyle = '#9aa8b0';
  g.fillRect(W - 34, H * 0.36, 12, H * 0.28);
  return toTexture(c);
}

/**
 * Une couverture de magazine, format portrait.
 *
 * Un présentoir n'a pas besoin de titres lisibles : ce qui fait une couverture
 * japonaise, c'est le BANDEAU de titre en haut, la grande photo au milieu, et
 * la colonne de manchettes verticales sur un bord. Trois blocs, et l'objet est
 * reconnu.
 */
export function makeMagazineTexture(seed: number): THREE.CanvasTexture {
  const W = 256;
  const H = 340;
  const { c, g } = makeCanvas(W, H);
  const r = rng(2200 + seed * 4231);
  const skins = [
    { bg: '#f3ede0', band: '#c8332b', ink: '#2a2622' },
    { bg: '#dfe8ef', band: '#1f5fbf', ink: '#1c2430' },
    { bg: '#efe4ee', band: '#8a3f9c', ink: '#2c2130' },
    { bg: '#e6efe2', band: '#2f7a44', ink: '#212a22' },
    { bg: '#fdf3d8', band: '#e0851f', ink: '#33291a' },
  ];
  const s = skins[Math.floor(r() * skins.length)];

  g.fillStyle = s.bg;
  g.fillRect(0, 0, W, H);
  // La photo : un dégradé sourd, plus une masse claire au tiers - un visage,
  // un plat, une façade. À cette taille, personne ne cherche à savoir.
  const ph = g.createLinearGradient(0, H * 0.16, W, H);
  ph.addColorStop(0, `rgba(${40 + r() * 90 | 0},${50 + r() * 90 | 0},${60 + r() * 80 | 0},1)`);
  ph.addColorStop(1, `rgba(${120 + r() * 90 | 0},${110 + r() * 80 | 0},${100 + r() * 70 | 0},1)`);
  g.fillStyle = ph;
  g.fillRect(0, H * 0.16, W, H * 0.84);
  g.fillStyle = 'rgba(255,255,255,0.24)';
  g.beginPath();
  g.ellipse(W * 0.46, H * 0.52, W * 0.24, H * 0.2, 0, 0, Math.PI * 2);
  g.fill();

  // Bandeau de titre.
  g.fillStyle = s.band;
  g.fillRect(0, 0, W, H * 0.16);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    g.fillRect(14 + i * 42, H * 0.05, 30, H * 0.07);
  }
  // Colonne de manchettes, verticale, sur un bord : la signature du kiosque.
  const side = r() > 0.5;
  g.fillStyle = s.ink;
  for (let i = 0; i < 7; i++) {
    const bw = 8 + r() * 6;
    const bh = H * (0.1 + r() * 0.16);
    g.fillRect(side ? 10 + i * 15 : W - 22 - i * 15, H * 0.22, bw, bh);
  }
  // Le prix, en pied : un magazine en porte toujours un.
  g.fillStyle = '#ffffff';
  g.fillRect(W * 0.58, H - 34, W * 0.36, 24);
  g.fillStyle = s.ink;
  g.textAlign = 'center';
  fitFillText(g, `¥${[490, 580, 690, 780, 890][Math.floor(r() * 5)]}`, W * 0.76, H - 15, W * 0.32, 20, 'bold');
  return toTexture(c);
}

/**
 * Un quotidien plié en deux, vu de dessus : ce qu'on voit sur un comptoir.
 *
 * Un journal japonais, à un mètre, c'est du papier gris cassé, une manchette
 * noire épaisse en haut, des colonnes verticales serrées, et parfois une photo
 * carrée. Il n'a AUCUNE couleur - c'est ce qui le distingue des magazines
 * posés à côté, et c'est tout ce qu'on demande à cette image.
 */
export function makeNewspaperTexture(seed: number): THREE.CanvasTexture {
  const W = 512;
  const H = 340;
  const { c, g } = makeCanvas(W, H);
  const r = rng(6600 + seed * 3571);

  g.fillStyle = ['#efece3', '#eae6db', '#f2f0e8'][Math.floor(r() * 3)];
  g.fillRect(0, 0, W, H);

  // Le bandeau de titre : un pavé noir plein, et le filet sous lui.
  g.fillStyle = '#1a1a18';
  g.fillRect(24, 20, W * 0.42, 44);
  g.fillRect(24, 76, W - 48, 3);
  g.fillStyle = '#5a5a54';
  g.fillRect(W * 0.5, 30, W * 0.4, 10);
  g.fillRect(W * 0.5, 46, W * 0.28, 10);

  // Colonnes verticales : un journal japonais se compose en colonnes, et c'est
  // ce sens-là qu'on reconnaît sans lire.
  const cols = 9;
  const cw = (W - 56) / cols;
  for (let i = 0; i < cols; i++) {
    const x = 28 + i * cw;
    let y = 96;
    while (y < H - 18) {
      const seg = 10 + r() * 26;
      g.fillStyle = `rgba(30,30,28,${0.32 + r() * 0.3})`;
      g.fillRect(x, y, cw - 5, seg);
      y += seg + 5 + r() * 6;
    }
  }
  // Une photo, en haut à droite ou au milieu : le seul aplat de la page.
  const px = r() > 0.5 ? W * 0.58 : W * 0.12;
  g.fillStyle = '#9b9a92';
  g.fillRect(px, 104, W * 0.3, H * 0.26);
  g.fillStyle = '#7d7c74';
  g.fillRect(px, 104 + H * 0.18, W * 0.3, H * 0.08);
  // Le pli : une ombre en travers, parce qu'un journal de kiosque est plié.
  g.fillStyle = 'rgba(90,88,80,0.16)';
  g.fillRect(0, H / 2 - 4, W, 8);
  return toTexture(c);
}

/**
 * La carte de prix suspendue - le POP.
 *
 * C'est le détail le plus japonais d'un commerce et le moins cher à poser :
 * des cartons criards pendus au ras du plafond, qui annoncent trois prix. Sans
 * eux, une boutique paraît fermée même toutes lumières allumées.
 */
export function makePopCardTexture(seed: number): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  const r = rng(1500 + seed * 5477);
  const skins = [
    { bg: POP_YELLOW, ink: '#231c08', tag: '#d8452e' },
    { bg: '#d8452e', ink: '#ffffff', tag: '#ffe08a' },
    { bg: '#ffffff', ink: '#c8332b', tag: '#1f5fbf' },
    { bg: JR_GREEN, ink: '#ffffff', tag: POP_YELLOW },
  ];
  const s = skins[Math.floor(r() * skins.length)];
  const words = ['新発売', 'お買得', 'おすすめ', '季節限定', '大人気', '今だけ'];
  const goods = ['おにぎり', 'サンドイッチ', 'コーヒー', 'からあげ', '弁当', 'お茶'];
  const price = [120, 150, 180, 210, 250, 320, 480][Math.floor(r() * 7)];

  g.fillStyle = s.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = s.ink;
  g.lineWidth = 6;
  g.strokeRect(9, 9, W - 18, H - 18);

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = s.tag;
  g.fillRect(24, 24, 168, 52);
  g.fillStyle = s.bg;
  g.textAlign = 'center';
  fitFillText(g, words[Math.floor(r() * words.length)], 108, 65, 152, 40, 'bold');

  g.fillStyle = s.ink;
  g.textAlign = 'left';
  fitFillText(g, goods[Math.floor(r() * goods.length)], 26, 132, W * 0.6, 46, 'bold');
  // Le prix, énorme : c'est le seul chiffre qui doit se lire de loin.
  fitFillText(g, `¥${price}`, 26, H - 28, W * 0.56, 76, 'bold');
  g.font = `600 26px ${JP_FONT}`;
  g.fillText('税込', W - 110, H - 34);
  return toTexture(c);
}

/**
 * L'affiche saisonnière collée sur la vitrine.
 *
 * Une devanture de konbini n'est jamais du verre nu : elle porte deux ou trois
 * affiches format portrait, collées de l'intérieur, qui masquent le tiers haut.
 * Elles ne se lisent pas depuis le hall - elles font juste comprendre que la
 * boutique est vivante et qu'il s'y passe quelque chose cette semaine.
 */
export function makePromoPosterTexture(seed: number): THREE.CanvasTexture {
  const W = 384;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(3300 + seed * 8867);
  const skins = [
    { top: '#e8f3ff', ink: NEWDAYS_BLUE, hot: '#d8452e', word: '新商品' },
    { top: '#fff4e0', ink: '#c05a12', hot: '#8a3f9c', word: 'あたたかい' },
    { top: '#eaf7ec', ink: JR_GREEN, hot: '#d8452e', word: '朝の定番' },
    { top: '#fdeef0', ink: '#b0343f', hot: '#1f5fbf', word: 'キャンペーン' },
  ];
  const s = skins[Math.floor(r() * skins.length)];

  g.fillStyle = s.top;
  g.fillRect(0, 0, W, H);
  // La photo produit : une masse ronde au milieu, sur une ombre portée. C'est
  // la composition de toute affiche de konbini, sans exception.
  g.fillStyle = 'rgba(40,44,50,0.1)';
  g.beginPath();
  g.ellipse(W / 2, H * 0.62, W * 0.3, H * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  const prod = g.createRadialGradient(W * 0.44, H * 0.42, 10, W / 2, H * 0.48, W * 0.34);
  prod.addColorStop(0, '#ffffff');
  prod.addColorStop(0.5, ['#e5c98a', '#d8452e', '#8a5a2a', '#e8e2d4'][Math.floor(r() * 4)]);
  prod.addColorStop(1, 'rgba(60,50,40,0.9)');
  g.fillStyle = prod;
  g.beginPath();
  g.ellipse(W / 2, H * 0.48, W * 0.28, H * 0.16, 0, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = s.ink;
  g.fillRect(0, 0, W, H * 0.2);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  fitFillText(g, s.word, W / 2, H * 0.14, W * 0.82, 62, 'bold');

  g.fillStyle = s.hot;
  g.beginPath();
  g.arc(W * 0.76, H * 0.72, W * 0.17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  fitFillText(g, `¥${[128, 168, 198, 258, 298][Math.floor(r() * 5)]}`, W * 0.76, H * 0.75, W * 0.28, 42, 'bold');

  g.fillStyle = s.ink;
  g.textAlign = 'left';
  g.font = `600 24px ${JP_FONT}`;
  g.fillText('NEWDAYS', 22, H - 26);
  return toTexture(c);
}

/**
 * L'armoire à cigarettes derrière la caisse.
 *
 * Elle est toujours au même endroit - dos au client, au-dessus de la tête du
 * vendeur - et c'est une grille numérotée de paquets debout. On ne la remarque
 * pas, et c'est justement pour cela qu'elle manque quand elle n'y est pas.
 */
export function makeTobaccoWallTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(7712);
  g.fillStyle = '#dcd8cc';
  g.fillRect(0, 0, W, H);
  const rows = 5;
  const cols = 22;
  const cw = W / cols;
  const ch = H / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cw + 3;
      const py = y * ch + 5;
      g.fillStyle = goodsTone(r);
      g.fillRect(px, py, cw - 6, ch - 16);
      g.fillStyle = 'rgba(20,22,26,0.6)';
      g.fillRect(px, py + ch * 0.5, cw - 6, ch * 0.14);
      // L'avertissement sanitaire : la bande blanche du bas de tout paquet.
      g.fillStyle = '#f4f2ec';
      g.fillRect(px, py + ch - 30, cw - 6, 12);
    }
    // Le numéro de casier, sur le nez de l'étage : c'est par lui qu'on commande.
    g.fillStyle = '#f7f5ef';
    g.fillRect(0, (y + 1) * ch - 11, W, 11);
    g.fillStyle = '#3a3f45';
    g.font = `bold 9px ${JP_FONT}`;
    g.textAlign = 'left';
    for (let x = 0; x < cols; x++) g.fillText(String(y * cols + x + 1), x * cw + 4, (y + 1) * ch - 2);
  }
  return toTexture(c);
}

/**
 * L'écran de la caisse, côté client.
 *
 * Deux lignes de montants sur fond sombre, et le logo de paiement sans contact
 * en bas : c'est tout ce que le client voit d'un système de caisse, et c'est ce
 * qui fait qu'un comptoir n'est pas une planche.
 */
export function makeRegisterScreenTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 384;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#101820';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b2733';
  g.fillRect(12, 12, W - 24, H - 24);

  g.textAlign = 'left';
  g.fillStyle = '#9fd4a8';
  g.font = `600 34px ${JP_FONT}`;
  const lines: [string, string][] = [
    ['おにぎり', '150'],
    ['お茶 500ml', '150'],
    ['サンドイッチ', '298'],
  ];
  lines.forEach(([label, price], i) => {
    g.fillStyle = '#8fb8cf';
    g.fillText(label, 34, 78 + i * 46);
    g.textAlign = 'right';
    g.fillText(`¥${price}`, W - 34, 78 + i * 46);
    g.textAlign = 'left';
  });
  g.fillStyle = '#2c3d4c';
  g.fillRect(28, 226, W - 56, 3);
  g.fillStyle = '#f2f6f8';
  g.font = `bold 52px ${JP_FONT}`;
  g.fillText('合計', 34, 292);
  g.textAlign = 'right';
  g.fillText('¥598', W - 34, 292);
  // Le pavé de paiement sans contact, en pied : orange Suica, et le rond blanc.
  g.fillStyle = '#e8801f';
  g.fillRect(28, 314, W - 56, 46);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  fitFillText(g, 'IC カードでお支払いいただけます', W / 2, 348, W - 80, 28, '600');
  return toTexture(c);
}

/**
 * Le sol d'un commerce de gare : vinyle clair, grands carreaux, joints fins.
 *
 * Il ne se voit qu'à travers la vitrine et par la porte, mais il se voit : un
 * sol qui prolongerait le béton du hall ferait de la boutique un renfoncement
 * plutôt qu'un lieu. Le changement de sol EST le seuil.
 */
export function makeShopFloorTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(8814);
  g.fillStyle = '#e9e6dd';
  g.fillRect(0, 0, W, H);
  // Le moucheté du vinyle : trois mille points, et la surface cesse d'être un
  // aplat mort sous l'éclairage rasant du hall.
  for (let i = 0; i < 3000; i++) {
    const v = r();
    g.fillStyle = v > 0.6 ? 'rgba(150,146,136,0.35)' : 'rgba(255,255,255,0.5)';
    g.fillRect(r() * W, r() * H, 2 + r() * 3, 2 + r() * 3);
  }
  g.strokeStyle = 'rgba(160,156,146,0.55)';
  g.lineWidth = 2;
  for (let k = 0; k <= 2; k++) {
    const p = (k * W) / 2;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, H);
    g.moveTo(0, p);
    g.lineTo(W, p);
    g.stroke();
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Où se pose un bandeau NEWDAYS : au-dessus d'une devanture, ou sur un auvent. */
export type BandFormat =
  /** Haut et court : le fronton d'une boutique de hall. */
  | 'shop'
  /** Bas et long : la ceinture d'auvent d'un kiosque de quai. */
  | 'kiosk';

/**
 * Le bandeau d'enseigne NEWDAYS.
 *
 * NEWDAYS est une marque JR East ; on n'imite pas son logo, on en garde la
 * STRUCTURE, et cette structure est têtue : un aplat bleu, le nom en capitales
 * blanches à gauche, un filet vert JR en pied, et - c'est ce qui change tout -
 * le NOM DE LA GARE à droite. Une boutique de gare porte le nom de sa gare :
 * `NEWDAYS 上野`. C'est ce couple qui la rend crédible, exactement comme pour
 * les galeries (`textures/concourse`, makeGallerySignTexture).
 *
 * Les deux formats ne diffèrent pas que par leurs proportions. Le fronton d'une
 * boutique a la place d'une ligne de katakana et du pictogramme 24 h ; la
 * ceinture d'un kiosque, elle, n'a que sa hauteur de bande - on y écrit gros,
 * on y écrit peu, et on ajoute la ligne de prix qui dit qu'on achète en
 * passant sans entrer.
 */
export function makeNewDaysBandTexture(format: BandFormat, station: number): THREE.CanvasTexture {
  const shop = format === 'shop';
  const W = 1024;
  const H = shop ? 224 : 128;
  const { c, g } = makeCanvas(W, H);
  const st = STATIONS[((station % 30) + 30) % 30];

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1660b4');
  grad.addColorStop(0.55, NEWDAYS_BLUE);
  grad.addColorStop(1, '#083f80');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Le filet vert JR en pied, et le liseré clair en tête : un caisson lumineux
  // n'a jamais un bord franc, il a un débord de diffuseur.
  g.fillStyle = JR_GREEN;
  g.fillRect(0, H - Math.round(H * 0.075), W, Math.round(H * 0.075));
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(0, 0, W, Math.round(H * 0.05));

  // La vague blanche : le geste de la marque, deux courbes qui traversent le
  // bandeau derrière le texte. Elle vaut mieux qu'un aplat nu et ne copie rien.
  g.globalAlpha = 0.12;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(W * 0.42, H);
  g.quadraticCurveTo(W * 0.62, H * 0.1, W, H * 0.34);
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff';
  const nameW = shop ? W * 0.46 : W * 0.3;
  fitFillText(g, 'NEWDAYS', shop ? 46 : 28, H * (shop ? 0.62 : 0.66), nameW, shop ? 120 : 70, 'bold');

  if (shop) {
    // Katakana sous le nom, et le nom de la gare à droite, en gros : de l'autre
    // bout du hall, c'est le kanji qu'on lit avant l'alphabet latin.
    g.fillStyle = '#bcd6f2';
    g.font = `600 34px ${JP_FONT}`;
    g.fillText('コンビニエンスストア', 52, H * 0.86);
    g.textAlign = 'right';
    g.fillStyle = '#ffffff';
    fitFillText(g, st.kanji, W - 190, H * 0.68, W * 0.24, 84, 'bold');
    // Le pictogramme 24 h : c'est lui qu'on cherche à quatre heures du matin.
    g.fillStyle = POP_YELLOW;
    g.fillRect(W - 168, H * 0.24, 140, 96);
    g.fillStyle = '#241f10';
    g.textAlign = 'center';
    fitFillText(g, '24h', W - 98, H * 0.48, 122, 52, 'bold');
    g.font = `bold 26px ${JP_FONT}`;
    g.fillText('営業', W - 98, H * 0.68);
  } else {
    g.fillStyle = POP_YELLOW;
    fitFillText(g, 'KIOSK', W * 0.32, H * 0.64, W * 0.11, 52, 'bold');
    g.fillStyle = '#ffffff';
    g.font = `600 30px ${JP_FONT}`;
    g.fillText(st.kanji, W * 0.32, H * 0.94);
    // La ligne de prix : elle dit qu'on achète EN PASSANT, sans entrer, et
    // c'est ce qui distingue un kiosque d'une boutique fermée par une vitre.
    const items: [string, string][] = [
      ['新聞', '¥160'],
      ['雑誌', '¥520'],
      ['お茶', '¥150'],
      ['おにぎり', '¥180'],
    ];
    let x = W * 0.46;
    for (const [label, price] of items) {
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(x, 20, 126, H - 46);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      fitFillText(g, label, x + 63, 58, 114, 28, '600');
      g.fillStyle = POP_YELLOW;
      fitFillText(g, price, x + 63, 92, 114, 30, 'bold');
      g.textAlign = 'left';
      x += 134;
    }
  }
  return toTexture(c);
}

/**
 * Le bandeau de la porte automatique : 自動ドア et les deux flèches.
 *
 * Toute porte coulissante de commerce japonais porte cette bande à hauteur
 * d'œil - autant pour prévenir qu'elle bouge que pour qu'on ne s'y cogne pas.
 * Sans elle, une devanture n'a pas d'entrée, elle a un trou.
 */
export function makeAutoDoorDecalTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const { c, g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.fillRect(0, 26, W, 76);
  g.fillStyle = NEWDAYS_BLUE;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  fitFillText(g, '自動ドア', W / 2, 86, W * 0.42, 54, 'bold');
  // Les deux chevrons, qui disent dans quel sens les vantaux s'écartent.
  g.fillStyle = '#d8452e';
  for (const s of [-1, 1]) {
    const x = W / 2 + s * W * 0.34;
    g.beginPath();
    g.moveTo(x - s * 26, 40);
    g.lineTo(x + s * 22, 64);
    g.lineTo(x - s * 26, 88);
    g.closePath();
    g.fill();
  }
  return toTexture(c);
}

/**
 * Le rideau métallique, baissé.
 *
 * Il ne sert qu'aux bouts fermés d'un kiosque - les deux petits côtés, qu'on
 * ne dégage jamais - mais il est ce qui dit que l'ouvrage est un COMMERCE et
 * non un local technique : de la tôle ondulée verticale, des rivets, et le
 * caisson d'enroulement au-dessus.
 */
export function makeShutterTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#b6bcc0';
  g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 16) {
    const band = g.createLinearGradient(0, y, 0, y + 16);
    band.addColorStop(0, '#cdd2d6');
    band.addColorStop(0.55, '#a7aeb3');
    band.addColorStop(1, '#c4cace');
    g.fillStyle = band;
    g.fillRect(0, y, W, 15);
    g.fillStyle = 'rgba(60,66,72,0.35)';
    g.fillRect(0, y + 14, W, 2);
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * La façade d'un présentoir à onigiri / sandwichs : le meuble froid ouvert.
 *
 * Ce n'est pas un frigo à portes : c'est un meuble OUVERT, en gradins, où l'on
 * prend à main nue. Ses trois étages inclinés sont pleins de triangles blancs
 * (les onigiri) et de coins de sandwichs - deux formes, et le rayon le plus
 * reconnaissable du Japon est là.
 */
export function makeChilledCaseTexture(seed: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(5150 + seed * 2909);

  g.fillStyle = '#eef2f2';
  g.fillRect(0, 0, W, H);
  const rows = 3;
  const pitch = H / rows;
  for (let row = 0; row < rows; row++) {
    const deck = Math.round((row + 1) * pitch) - 12;
    g.fillStyle = 'rgba(120,140,150,0.14)';
    g.fillRect(0, deck - pitch + 12, W, pitch - 12);
    let x = 8;
    while (x < W - 40) {
      const triangle = r() > 0.42;
      const w = triangle ? 54 : 62;
      const h = pitch * 0.6;
      if (triangle) {
        // Onigiri : le triangle blanc à bande noire de nori en pied.
        g.fillStyle = '#fbfaf6';
        g.beginPath();
        g.moveTo(x + w / 2, deck - h);
        g.lineTo(x + w, deck);
        g.lineTo(x, deck);
        g.closePath();
        g.fill();
        g.fillStyle = '#2a2f2c';
        g.fillRect(x + 4, deck - h * 0.3, w - 8, h * 0.3);
        g.fillStyle = ['#d8452e', '#2f7a44', '#e0a51f', '#1f5fbf'][Math.floor(r() * 4)];
        g.fillRect(x + w * 0.3, deck - h * 0.24, w * 0.4, 10);
      } else {
        // Sandwich : deux coins, en pochette transparente.
        g.fillStyle = '#fdfcf8';
        g.beginPath();
        g.moveTo(x, deck);
        g.lineTo(x, deck - h * 0.72);
        g.lineTo(x + w, deck - h);
        g.lineTo(x + w, deck);
        g.closePath();
        g.fill();
        g.fillStyle = ['#e8c98a', '#d8a05a', '#c8d8a0'][Math.floor(r() * 3)];
        g.fillRect(x + 6, deck - h * 0.5, w - 12, h * 0.22);
      }
      x += w + 5;
    }
    // Rail d'étiquettes du meuble froid : bleu pâle, pas blanc.
    g.fillStyle = '#dce8ee';
    g.fillRect(0, deck, W, 12);
    g.fillStyle = '#4a6472';
    for (let x2 = 8; x2 < W - 12; x2 += 62) g.fillRect(x2, deck + 3, 28, 5);
  }
  return toTexture(c);
}
