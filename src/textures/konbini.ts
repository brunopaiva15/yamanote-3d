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
  '#f2ead6',
  '#fdf8ec',
  '#e6d9bc',
  '#d8452e',
  '#e8801f',
  '#1f5fbf',
  '#2f8a4c',
  '#e8b81f',
  '#c8541a',
  '#8a3f9c',
  '#3aa0c8',
  '#b8322c',
  '#7ab648',
  '#e05a86',
];

/** Une teinte de rayon, tirée avec le biais de la palette (les premières sortent plus). */
export function goodsTone(r: () => number): string {
  const k = Math.floor(r() ** 1.6 * GOODS_TONES.length);
  return GOODS_TONES[Math.min(GOODS_TONES.length - 1, k)];
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
 * Une couverture de magazine, dessinée dans le rectangle qu'on lui donne.
 *
 * Un présentoir n'a pas besoin de titres lisibles : ce qui fait une couverture
 * japonaise, c'est le BANDEAU de titre en haut, la grande photo au milieu, et
 * la colonne de manchettes verticales sur un bord. Trois blocs, et l'objet est
 * reconnu.
 */
function drawCover(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  W: number,
  H: number,
  r: () => number,
): void {
  // Une couverture japonaise n'est jamais pastel : elle est SATURÉE et
  // contrastée, parce qu'elle est faite pour être vue de trois quarts, à deux
  // mètres, dans un râtelier où douze autres se battent pour le même regard.
  const skins = [
    { photo: '#8c2c26', band: '#c8332b', ink: '#1e1a17' },
    { photo: '#1b3f74', band: '#1f5fbf', ink: '#12181f' },
    { photo: '#54246a', band: '#8a3f9c', ink: '#1f1526' },
    { photo: '#1f5233', band: '#2f7a44', ink: '#141c15' },
    { photo: '#8a5410', band: '#e0851f', ink: '#241b0f' },
    { photo: '#2b2f36', band: '#e8e4d8', ink: '#15181c' },
  ];
  const s = skins[Math.floor(r() * skins.length)];

  g.save();
  g.translate(x, y);
  // La photo mange TOUTE la couverture : un magazine n'a pas de marge blanche.
  // Elle reste SOMBRE de bout en bout - un dégradé qui finissait crème donnait
  // des couvertures pastel, et un râtelier pastel ne ressemble à rien.
  const ph = g.createLinearGradient(0, 0, W * 0.7, H);
  ph.addColorStop(0, s.photo);
  ph.addColorStop(0.62, s.photo);
  ph.addColorStop(1, s.band);
  g.fillStyle = ph;
  g.fillRect(0, 0, W, H);
  // La masse claire au tiers : un visage, un plat, une façade. À cette taille,
  // personne ne cherche à savoir - mais son absence rend la couverture plate.
  g.fillStyle = 'rgba(255,244,226,0.3)';
  g.beginPath();
  g.ellipse(W * 0.48, H * 0.54, W * 0.22, H * 0.19, 0, 0, Math.PI * 2);
  g.fill();

  // Bandeau de titre : le tiers haut, en aplat de marque, avec le logotype en
  // réserve. C'est la seule zone qui se lise vraiment de loin.
  g.fillStyle = s.band;
  g.fillRect(0, 0, W, H * 0.2);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) g.fillRect(W * (0.07 + i * 0.21), H * 0.05, W * 0.15, H * 0.1);
  // Colonne de manchettes, verticale, sur un bord : la signature du kiosque.
  // Blanches sur la photo sombre, et jamais l'inverse.
  const side = r() > 0.5;
  for (let i = 0; i < 5; i++) {
    const bw = W * (0.05 + r() * 0.03);
    const bh = H * (0.14 + r() * 0.2);
    const bx = side ? W * 0.05 + i * W * 0.09 : W * 0.83 - i * W * 0.09;
    g.fillStyle = 'rgba(20,18,16,0.5)';
    g.fillRect(bx + 2, H * 0.25 + 2, bw, bh);
    g.fillStyle = i === 1 ? '#f7d64a' : '#ffffff';
    g.fillRect(bx, H * 0.25, bw, bh);
  }
  // Le prix, en pied : un magazine en porte toujours un.
  g.fillStyle = '#ffffff';
  g.fillRect(W * 0.56, H * 0.89, W * 0.38, H * 0.082);
  g.fillStyle = s.ink;
  g.textAlign = 'center';
  fitFillText(
    g,
    `¥${[490, 580, 690, 780, 890][Math.floor(r() * 5)]}`,
    W * 0.75,
    H * 0.955,
    W * 0.34,
    H * 0.07,
    'bold',
  );
  g.restore();
}

/** Une couverture seule, pour un magazine posé à plat ou tenu à la main. */
export function makeMagazineTexture(seed: number): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 340);
  drawCover(g, 0, 0, 256, 340, rng(2200 + seed * 4231));
  return toTexture(c);
}

/**
 * Un étage de présentoir à magazines : la rangée entière, en une image.
 *
 * Une couverture par plan aurait fait dix appels de rendu par étage, et trente
 * pour un présentoir - pour des objets de vingt centimètres qu'on regarde de
 * loin. La rangée se dessine donc d'un coup, avec ses couvertures qui se
 * CHEVAUCHENT légèrement : c'est ce recouvrement, et lui seul, qui fait qu'un
 * râtelier est plein plutôt qu'aligné.
 */
export function makeMagazineRowTexture(seed: number, count = 9): THREE.CanvasTexture {
  const W = 1024;
  const H = 340;
  const { c, g } = makeCanvas(W, H);
  const r = rng(1900 + seed * 6673);
  // Le fond du râtelier : la tôle qu'on aperçoit entre deux couvertures.
  g.fillStyle = '#cfcabb';
  g.fillRect(0, 0, W, H);
  const pitch = W / count;
  const cw = pitch * 1.16;
  for (let i = 0; i < count; i++) {
    // Chaque couverture porte l'ombre de sa voisine de gauche : sans elle, la
    // rangée est un damier et non une pile.
    drawCover(g, i * pitch, H * 0.04, cw, H * 0.94, r);
    g.fillStyle = 'rgba(40,38,34,0.28)';
    g.fillRect(i * pitch, H * 0.04, 5, H * 0.94);
  }
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
function drawPaper(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  W: number,
  H: number,
  r: () => number,
): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = ['#efece3', '#eae6db', '#f2f0e8'][Math.floor(r() * 3)];
  g.fillRect(0, 0, W, H);

  // Le bandeau de titre : un pavé noir plein, et le filet sous lui.
  g.fillStyle = '#1a1a18';
  g.fillRect(W * 0.05, H * 0.06, W * 0.42, H * 0.13);
  g.fillRect(W * 0.05, H * 0.22, W * 0.9, H * 0.01);
  g.fillStyle = '#5a5a54';
  g.fillRect(W * 0.5, H * 0.09, W * 0.4, H * 0.03);
  g.fillRect(W * 0.5, H * 0.14, W * 0.28, H * 0.03);

  // Colonnes verticales : un journal japonais se compose en colonnes, et c'est
  // ce sens-là qu'on reconnaît sans lire.
  const cols = 9;
  const cw = (W * 0.9) / cols;
  for (let i = 0; i < cols; i++) {
    const cx = W * 0.05 + i * cw;
    let cy = H * 0.28;
    while (cy < H * 0.95) {
      const seg = H * (0.03 + r() * 0.08);
      g.fillStyle = `rgba(30,30,28,${0.32 + r() * 0.3})`;
      g.fillRect(cx, cy, cw * 0.8, seg);
      cy += seg + H * (0.015 + r() * 0.02);
    }
  }
  // Une photo, en haut à droite ou au milieu : le seul aplat de la page.
  const px = r() > 0.5 ? W * 0.58 : W * 0.12;
  g.fillStyle = '#9b9a92';
  g.fillRect(px, H * 0.3, W * 0.3, H * 0.26);
  g.fillStyle = '#7d7c74';
  g.fillRect(px, H * 0.48, W * 0.3, H * 0.08);
  // Le pli : une ombre en travers, parce qu'un journal de kiosque est plié.
  g.fillStyle = 'rgba(90,88,80,0.16)';
  g.fillRect(0, H / 2 - H * 0.012, W, H * 0.024);
  g.restore();
}

/** Un quotidien seul, à plat. */
export function makeNewspaperTexture(seed: number): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 340);
  drawPaper(g, 0, 0, 512, 340, rng(6600 + seed * 3571));
  return toTexture(c);
}

/**
 * L'étalage de journaux d'un kiosque, vu de dessus : quatre piles côte à côte.
 *
 * C'est L'IMAGE du kiosque de quai - avant les magazines, avant les boissons,
 * c'est la rangée de quotidiens à plat sur le comptoir qu'on reconnaît, et
 * c'est elle qui manquait. Les piles se recouvrent d'un doigt, comme des
 * journaux qu'on a posés en tas et non alignés à l'équerre.
 */
export function makeNewspaperRowTexture(seed: number, count = 4): THREE.CanvasTexture {
  const W = 1024;
  const H = 340;
  const { c, g } = makeCanvas(W, H);
  const r = rng(4040 + seed * 9973);
  g.fillStyle = '#8f8b80';
  g.fillRect(0, 0, W, H);
  const pitch = W / count;
  for (let i = 0; i < count; i++) {
    // L'ombre de la pile sur le comptoir, puis le journal du dessus, posé de
    // travers de quelques degrés : une pile n'est jamais d'aplomb.
    g.fillStyle = 'rgba(30,28,24,0.35)';
    g.fillRect(i * pitch + 6, H * 0.07, pitch - 10, H * 0.9);
    g.save();
    g.translate(i * pitch + pitch / 2, H / 2);
    g.rotate((r() - 0.5) * 0.06);
    drawPaper(g, -pitch / 2 + 10, -H * 0.43, pitch - 20, H * 0.86, r);
    g.restore();
  }
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
 * Le sol d'un konbini : carrelage de grès TERRACOTTA, carreaux de 45 cm.
 *
 * C'est le premier écart au réel, et le plus gros. Un konbini japonais n'a pas
 * un sol de vinyle clair - il a un carrelage BRUN CHAUD, mat, à joints
 * apparents, et c'est lui qui donne à la boutique sa température de couleur.
 * Peint en gris pâle, tout le reste - la tôle crème du mobilier, l'orange des
 * bandeaux, le rouge des socles - virait au froid par contraste, et l'ensemble
 * ressemblait à une pharmacie.
 *
 * Chaque carreau est TIRÉ À PART : dans un vrai grès, deux carreaux voisins ne
 * sont jamais du même bain. Sans cette variation, un carrelage répété est une
 * grille, pas un sol.
 */
export function makeShopFloorTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const r = rng(8814);
  // Le joint : gris-brun, plus sombre que le carreau, et c'est tout ce qu'on
  // en voit. Il occupe le fond ; les carreaux se posent dessus en retrait.
  g.fillStyle = '#6f5b4c';
  g.fillRect(0, 0, W, H);

  const TILES = 2;
  const cell = W / TILES;
  for (let ty = 0; ty < TILES; ty++) {
    for (let tx = 0; tx < TILES; tx++) {
      const x = tx * cell + 3;
      const y = ty * cell + 3;
      const s = cell - 6;
      // Bain du carreau : un brun chaud, tiré autour de la même teinte.
      const base = 150 + r() * 22;
      g.fillStyle = `rgb(${(base + 12) | 0},${(base * 0.8) | 0},${(base * 0.64) | 0})`;
      g.fillRect(x, y, s, s);
      // Nuage de grès : des taches à peine plus claires ou plus sombres.
      for (let i = 0; i < 220; i++) {
        const v = r();
        g.fillStyle = v > 0.5 ? 'rgba(255,236,214,0.13)' : 'rgba(96,70,54,0.13)';
        const rr = 2 + r() * 9;
        g.beginPath();
        g.arc(x + r() * s, y + r() * s, rr, 0, Math.PI * 2);
        g.fill();
      }
      // Le biseau du carreau : une lumière en haut à gauche, une ombre en bas
      // à droite. C'est lui qui donne au sol son relief sous un éclairage à
      // plat, et sans lui un carrelage n'est qu'un damier peint.
      g.fillStyle = 'rgba(255,240,220,0.22)';
      g.fillRect(x, y, s, 3);
      g.fillRect(x, y, 3, s);
      g.fillStyle = 'rgba(70,50,38,0.28)';
      g.fillRect(x, y + s - 3, s, 3);
      g.fillRect(x + s - 3, y, 3, s);
    }
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Le rail d'étiquettes qui court sur le nez de chaque étagère.
 *
 * C'est le détail le plus répété d'un commerce et le plus vite manquant : une
 * planche sans son rail est une planche, avec son rail c'est un RAYON. Il est
 * blanc, il porte des prix en petits caractères tous les vingt centimètres, et
 * on ne les lit pas - on lit la ligne.
 */
export function makeShelfRailTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 64;
  const { c, g } = makeCanvas(W, H);
  const r = rng(3311);
  g.fillStyle = '#f7f4ec';
  g.fillRect(0, 0, W, H);
  // Le profil du rail : une gorge sombre en pied, un liseré clair en tête.
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(0, 0, W, 6);
  g.fillStyle = 'rgba(110,98,84,0.4)';
  g.fillRect(0, H - 7, W, 7);

  const CARDS = 12;
  const pitch = W / CARDS;
  g.textBaseline = 'alphabetic';
  for (let i = 0; i < CARDS; i++) {
    const x = i * pitch + 5;
    const w = pitch - 12;
    g.fillStyle = '#ffffff';
    g.fillRect(x, 8, w, H - 22);
    g.strokeStyle = '#c8bfae';
    g.lineWidth = 1.5;
    g.strokeRect(x, 8, w, H - 22);
    // Une étiquette sur quatre est une promotion : fond jaune, prix rouge.
    const hot = r() > 0.74;
    if (hot) {
      g.fillStyle = '#f5c518';
      g.fillRect(x + 1, 9, w - 2, H - 24);
    }
    g.fillStyle = '#3a3128';
    g.font = `600 12px ${JP_FONT}`;
    g.textAlign = 'left';
    g.fillText('本体', x + 5, 24);
    g.fillStyle = hot ? '#b8231c' : '#1f1a14';
    g.textAlign = 'right';
    fitFillText(g, `¥${[98, 115, 128, 150, 178, 198, 230, 298][Math.floor(r() * 8)]}`, x + w - 5, H - 20, w - 12, 24, 'bold');
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * Le fronton d'une gondole : le bandeau de marque qui la coiffe.
 *
 * Dans un konbini japonais, aucune gondole n'a le dessus nu : elle porte un
 * fronton incliné aux couleurs de l'enseigne, et c'est ce couronnement - autant
 * que les rayons - qui fait qu'on voit un COMMERCE et non un rayonnage
 * d'entrepôt. C'est aussi ce qui manquait le plus à la boutique de gare.
 */
export function makeGondolaHeaderTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 128;
  const { c, g } = makeCanvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#f5e2b4');
  grad.addColorStop(1, '#e8c98a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#d8452e';
  g.fillRect(0, H - 9, W, 9);
  g.fillStyle = NEWDAYS_BLUE;
  g.fillRect(0, 0, W, 5);

  // La marque UNE FOIS par motif, et le motif fait un mètre trente au montage :
  // un fronton n'est pas un ruban de logos. Répétée trois fois par image, elle
  // revenait cinq fois sur une gondole de deux mètres soixante et le meuble
  // avait l'air d'un présentoir de foire.
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = NEWDAYS_BLUE;
  fitFillText(g, 'NEWDAYS', W / 2, H * 0.6, W * 0.42, 74, 'bold');
  g.fillStyle = '#b8231c';
  g.font = `600 30px ${JP_FONT}`;
  g.fillText('おトクがいっぱい', W / 2, H * 0.88);
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Ce qu'annonce le bandeau d'un meuble froid. */
export type ChillerBand = 'drinks' | 'chilled' | 'ice';

/**
 * Le bandeau d'un meuble réfrigéré : un aplat de couleur et deux mots.
 *
 * Chaque famille a SA couleur, et c'est elle qu'on lit avant le texte : bleu
 * pour les boissons, rouge-orange pour le frais, cyan givré pour les glaces.
 * Un rayon dont on ne sait pas ce qu'il vend n'est qu'un mur de portes.
 */
export function makeChillerBandTexture(kind: ChillerBand): THREE.CanvasTexture {
  const W = 1024;
  const H = 128;
  const { c, g } = makeCanvas(W, H);
  const skin = {
    drinks: { bg: '#1b62b4', ink: '#ffffff', jp: 'ドリンク', sub: '冷えた飲みもの' },
    chilled: { bg: '#d8452e', ink: '#fff4e2', jp: 'おにぎり・お弁当', sub: '毎日つくりたて' },
    ice: { bg: '#3aa8c8', ink: '#ffffff', jp: 'アイスクリーム', sub: 'つめたいおやつ' },
  }[kind];

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, skin.bg);
  grad.addColorStop(1, `rgba(0,0,0,0.25)`);
  g.fillStyle = skin.bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, 0, W, 6);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, H - 5, W, 5);

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = skin.ink;
  fitFillText(g, skin.jp, 40, H * 0.66, W * 0.42, 70, 'bold');
  g.font = `600 30px ${JP_FONT}`;
  g.fillText(skin.sub, W * 0.5, H * 0.62);
  return toTexture(c);
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
 * La flaque de lumière qu'un commerce jette autour de lui.
 *
 * Un konbini éclaire le trottoir devant lui, et un kiosque éclaire le quai
 * sous son auvent - c'est même à cette flaque qu'on les repère de loin, la
 * nuit, bien avant de lire l'enseigne. Le décor n'a pas de sources ponctuelles
 * (tout y est émissif, voir three/station/Concourse), et en ajouter une par
 * boutique coûterait une passe d'éclairage pour un seul objet.
 *
 * On peint donc la flaque : un dégradé radial posé à plat sur le sol, en
 * mélange ADDITIF, dont l'opacité suit la tombée du jour. De jour elle
 * n'existe pas - une flaque de lumière à quinze heures se remarque, exactement
 * comme un lampadaire allumé (three/Wayside applique la même règle à ses
 * foyers).
 */
export function makeShopGlowTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,250,232,0.85)');
  grad.addColorStop(0.42, 'rgba(255,246,220,0.34)');
  grad.addColorStop(0.78, 'rgba(240,232,200,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
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

  // Le fond d'un meuble froid ouvert est SOMBRE : la tôle y est dans l'ombre de
  // ses propres gradins, et c'est ce contraste qui fait ressortir les triangles
  // blancs. Peint clair, le rayon d'onigiri disparaissait derrière sa vitre.
  g.fillStyle = '#5d6d75';
  g.fillRect(0, 0, W, H);
  const rows = 3;
  const pitch = H / rows;
  for (let row = 0; row < rows; row++) {
    const deck = Math.round((row + 1) * pitch) - 12;
    g.fillStyle = 'rgba(24,34,40,0.4)';
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
