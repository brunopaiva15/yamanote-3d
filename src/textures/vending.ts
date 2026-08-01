// Distributeurs automatiques de quai : les surfaces qui les font.
//
// Un 自販機 japonais ne se résume pas à sa couleur. C'est une vitrine
// rétroéclairée où les échantillons sont posés sur des tablettes, chacun avec
// son étiquette de prix et son bouton - rouge pour le chaud, bleu pour le
// froid ; un bandeau d'enseigne allumé en tête ; une platine de monnayeurs
// (fente à pièces, avaleur de billets, lecteur sans contact, afficheur du
// crédit, levier de rendu) ; et tout en bas le volet du 取出口 avec sa sébile.
// Ce sont ces quatre surfaces qu'on lit depuis le quai, pas la tôle.
//
// Les marques sont inventées, comme les affiches de data/ads : ce sont les
// codes visuels qu'on reconnaît, pas des logos déposés.
//
// Même idiome que textures/procedural : chaque fonction fabrique un canvas
// neuf, la mise en cache est la responsabilité de l'appelant (useMemo).

import * as THREE from 'three';
import { fitFillText, JP_FONT, rng } from './procedural';

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

/** Éclaircit (f > 1) ou assombrit (f < 1) une couleur hexadécimale. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/**
 * Ce que vend la machine : la vitrine ne se garnit pas de la même façon.
 *
 * Trois familles se garnissent en SPIRALES - sachets, bacs, pots - et deux en
 * bouteilles. C'est la seule distinction qui compte pour la vitrine : une
 * spirale impose des couloirs plus larges, une réglette de code de couloir au
 * lieu du chaud / froid, et pas de tube de rétroéclairage par tablette.
 */
export type VendingKind = 'drink' | 'coffee' | 'snack' | 'ice' | 'noodle';

/** Les familles servies par spirale : tout ce qui ne se boit pas au goulot. */
export function isSolidVending(kind: VendingKind): boolean {
  return kind === 'snack' || kind === 'ice' || kind === 'noodle';
}

/**
 * Ce qu'une case de vitrine montre.
 *
 * Volontairement structural et non importé de `data/products` : ce module
 * dessine des surfaces, il n'a pas à connaître le catalogue. C'est le contrat
 * minimal qu'un article doit remplir pour être dessinable - et `Product` le
 * remplit tel quel.
 */
export interface VendingItem {
  price: number;
  tone: string;
  liquid?: string;
  shape: 'bottle' | 'can' | 'canSlim' | 'cup' | 'noodle' | 'ice';
  hot: boolean;
}

export interface VendingBrand {
  /** Teinte de la caisse : tôle peinte, c'est elle qu'on voit de loin. */
  body: string;
  /** Fond du bandeau d'enseigne. */
  band: string;
  /** Encre du bandeau. */
  ink: string;
  /** Marque, en latin puis en japonais. Inventées. */
  name: string;
  nameJp: string;
  kind: VendingKind;
}

export const VENDING_BRANDS: readonly VendingBrand[] = [
  { body: '#b8322c', band: '#a82820', ink: '#ffffff', name: 'YAMATE', nameJp: '山手ソーダ', kind: 'drink' },
  { body: '#17458c', band: '#123a78', ink: '#ffffff', name: 'AOZORA', nameJp: '青空飲料', kind: 'drink' },
  { body: '#e6e4dc', band: '#1d6f4a', ink: '#ffffff', name: 'CHAEN', nameJp: '茶園の茶', kind: 'drink' },
  { body: '#6d3a1c', band: '#4e2711', ink: '#f0d9a8', name: 'KOHI', nameJp: '東京珈琲', kind: 'coffee' },
  { body: '#e2a021', band: '#c07d12', ink: '#2e1d06', name: 'EKIMAE', nameJp: '駅前スナック', kind: 'snack' },
  // Les deux machines à manger des couloirs de correspondance. Le bac à glaces
  // est bleu pâle et givré, la machine à nouilles rouge sombre : ce sont deux
  // silhouettes qu'on distingue à dix mètres sans lire une lettre.
  { body: '#8fc7dd', band: '#2f7fa8', ink: '#ffffff', name: 'KOORI', nameJp: '氷屋アイス', kind: 'ice' },
  { body: '#9c2b22', band: '#7a1e16', ink: '#f7e6c8', name: 'MEN-YA', nameJp: '駅麺屋', kind: 'noodle' },
];

/** Les deux enseignes de nourriture, dans l'ordre où on les pose. */
export const FOOD_BRANDS: readonly VendingBrand[] = VENDING_BRANDS.filter((b) =>
  b.kind === 'ice' || b.kind === 'noodle');

/**
 * Marque d'une machine donnée.
 *
 * La machine à manger n'arrive qu'en renfort, sur les quais qui en portent au
 * moins trois - et c'est toujours la dernière de la file. Les autres tournent
 * sur les quatre enseignes de boissons par pas premier avec leur nombre : deux
 * machines voisines ne portent jamais la même, ce qu'un tirage libre donnait
 * une fois sur quatre, et une file de trois blanches ne trompe personne.
 */
export function vendingBrand(station: number, slot: number, count: number): VendingBrand {
  const snack = VENDING_BRANDS.find((b) => b.kind === 'snack');
  if (snack && count >= 3 && slot === count - 1) return snack;
  const drinks = VENDING_BRANDS.filter((b) => b.kind === 'drink' || b.kind === 'coffee');
  const r = rng(station * 977 + 41);
  const base = Math.floor(r() * drinks.length);
  const step = 1 + 2 * Math.floor(r() * 2);
  return drinks[(base + slot * step) % drinks.length];
}

// --- Échantillons ----------------------------------------------------



/** Bouteille PET : corps teinté par son contenu, épaule, goulot, manchon. */
function drawBottle(
  g: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  h: number,
  w: number,
  liquid: string,
  label: string,
  cap: string,
): void {
  g.fillStyle = liquid;
  g.beginPath();
  g.roundRect(cx - w / 2, baseY - h * 0.8, w, h * 0.8, w * 0.2);
  g.fill();
  // Épaule tronconique, puis le goulot.
  g.beginPath();
  g.moveTo(cx - w / 2 + 1, baseY - h * 0.74);
  g.lineTo(cx - w * 0.17, baseY - h * 0.93);
  g.lineTo(cx + w * 0.17, baseY - h * 0.93);
  g.lineTo(cx + w / 2 - 1, baseY - h * 0.74);
  g.closePath();
  g.fill();
  g.fillRect(cx - w * 0.17, baseY - h * 0.95, w * 0.34, h * 0.09);
  // Bouchon.
  g.fillStyle = cap;
  g.beginPath();
  g.roundRect(cx - w * 0.23, baseY - h, w * 0.46, h * 0.09, 2);
  g.fill();
  // Manchon d'étiquette : les deux tiers du corps.
  g.fillStyle = label;
  g.fillRect(cx - w / 2, baseY - h * 0.62, w, h * 0.36);
  g.fillStyle = 'rgba(255,255,255,0.88)';
  g.fillRect(cx - w / 2, baseY - h * 0.5, w, h * 0.05);
  // Reflet vertical : c'est lui qui donne le cylindre.
  g.fillStyle = 'rgba(255,255,255,0.32)';
  g.fillRect(cx - w * 0.33, baseY - h * 0.76, w * 0.11, h * 0.7);
  g.fillStyle = 'rgba(0,0,0,0.14)';
  g.fillRect(cx + w * 0.32, baseY - h * 0.76, w * 0.1, h * 0.7);
}

/** Canette : aluminium, couvercle serti, bande d'étiquette. */
function drawCan(
  g: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  h: number,
  w: number,
  label: string,
): void {
  g.fillStyle = shade(label, 0.9);
  g.beginPath();
  g.roundRect(cx - w / 2, baseY - h, w, h, w * 0.16);
  g.fill();
  g.fillStyle = label;
  g.fillRect(cx - w / 2, baseY - h * 0.72, w, h * 0.5);
  // Sertissage du couvercle.
  g.fillStyle = '#b6bbc0';
  g.beginPath();
  g.ellipse(cx, baseY - h + w * 0.1, w / 2, w * 0.13, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8e949a';
  g.fillRect(cx - w / 2, baseY - h + w * 0.09, w, 2);
  g.fillStyle = 'rgba(255,255,255,0.34)';
  g.fillRect(cx - w * 0.32, baseY - h * 0.9, w * 0.12, h * 0.82);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(cx + w * 0.3, baseY - h * 0.9, w * 0.11, h * 0.82);
}

/** Sachet soudé : la silhouette pincée en haut et en bas d'un paquet de chips. */
function drawBag(
  g: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  h: number,
  w: number,
  tone: string,
): void {
  g.fillStyle = tone;
  g.beginPath();
  g.moveTo(cx - w * 0.32, baseY - h);
  g.lineTo(cx + w * 0.32, baseY - h);
  g.quadraticCurveTo(cx + w * 0.62, baseY - h * 0.5, cx + w * 0.32, baseY);
  g.lineTo(cx - w * 0.32, baseY);
  g.quadraticCurveTo(cx - w * 0.62, baseY - h * 0.5, cx - w * 0.32, baseY - h);
  g.closePath();
  g.fill();
  // Soudures : plus claires, aplaties - c'est ce pincement haut et bas qui
  // distingue un sachet d'une boîte de loin.
  g.fillStyle = shade(tone, 1.35);
  g.fillRect(cx - w * 0.32, baseY - h, w * 0.64, h * 0.11);
  g.fillRect(cx - w * 0.32, baseY - h * 0.11, w * 0.64, h * 0.11);
  // Bandeau de marque et pastille.
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(cx - w * 0.42, baseY - h * 0.62, w * 0.84, h * 0.16);
  g.fillStyle = shade(tone, 0.7);
  g.beginPath();
  g.ellipse(cx, baseY - h * 0.34, w * 0.22, h * 0.12, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.26)';
  g.fillRect(cx - w * 0.3, baseY - h * 0.88, w * 0.12, h * 0.76);
}

/**
 * Bac de glace : bas, large, couvercle clair et manchon coloré.
 *
 * Ce qui le distingue d'une boîte, à trente pixels de haut, n'est pas le détail
 * mais la PROPORTION - deux fois plus large que haut - et le liseré givré du
 * couvercle. C'est tout ce qu'on lit à travers une vitre, et c'est assez.
 */
function drawTub(
  g: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  h: number,
  w: number,
  tone: string,
): void {
  // Corps, légèrement tronconique : plus large en haut, comme tout pot moulé.
  g.fillStyle = tone;
  g.beginPath();
  g.moveTo(cx - w * 0.44, baseY);
  g.lineTo(cx + w * 0.44, baseY);
  g.lineTo(cx + w * 0.5, baseY - h * 0.78);
  g.lineTo(cx - w * 0.5, baseY - h * 0.78);
  g.closePath();
  g.fill();
  // Manchon de marque.
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillRect(cx - w * 0.46, baseY - h * 0.56, w * 0.92, h * 0.24);
  // Couvercle : plus clair, débordant, avec son ourlet.
  g.fillStyle = shade(tone, 1.5);
  g.fillRect(cx - w * 0.54, baseY - h, w * 1.08, h * 0.24);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(cx - w * 0.54, baseY - h, w * 1.08, h * 0.07);
}

/**
 * Pot de nouilles instantanées : tronconique franc, couvercle d'aluminium.
 *
 * La silhouette est l'inverse de celle du bac - haute et évasée -, et le
 * couvercle brillant la termine. Deux formes qu'on ne confond pas, ce qui est
 * exactement le service que rend une vitrine.
 */
function drawCup(
  g: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  h: number,
  w: number,
  tone: string,
): void {
  g.fillStyle = tone;
  g.beginPath();
  g.moveTo(cx - w * 0.3, baseY);
  g.lineTo(cx + w * 0.3, baseY);
  g.lineTo(cx + w * 0.5, baseY - h * 0.86);
  g.lineTo(cx - w * 0.5, baseY - h * 0.86);
  g.closePath();
  g.fill();
  // Bandeau de marque, et le filet sombre du bas de l'étiquette.
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.moveTo(cx - w * 0.42, baseY - h * 0.62);
  g.lineTo(cx + w * 0.42, baseY - h * 0.62);
  g.lineTo(cx + w * 0.46, baseY - h * 0.34);
  g.lineTo(cx - w * 0.46, baseY - h * 0.34);
  g.closePath();
  g.fill();
  g.fillStyle = shade(tone, 0.6);
  g.fillRect(cx - w * 0.44, baseY - h * 0.32, w * 0.88, h * 0.06);
  // Couvercle d'aluminium : le seul reflet franc de la vitrine.
  g.fillStyle = '#d9dde0';
  g.fillRect(cx - w * 0.52, baseY - h, w * 1.04, h * 0.16);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillRect(cx - w * 0.52, baseY - h, w * 0.4, h * 0.08);
}

/** Boîte cartonnée : biscuits, chocolat, nouilles en pot. */
function drawBox(
  g: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  h: number,
  w: number,
  tone: string,
): void {
  g.fillStyle = tone;
  g.fillRect(cx - w / 2, baseY - h, w, h);
  g.fillStyle = shade(tone, 1.25);
  g.fillRect(cx - w / 2, baseY - h, w, h * 0.14);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(cx - w * 0.42, baseY - h * 0.66, w * 0.84, h * 0.2);
  g.fillStyle = shade(tone, 0.62);
  g.fillRect(cx - w * 0.42, baseY - h * 0.36, w * 0.84, h * 0.14);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(cx + w * 0.34, baseY - h, w * 0.16, h);
}

/** Spirale d'entraînement : le ressort sur lequel repose chaque sachet. */
function drawCoil(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, turns: number): void {
  g.strokeStyle = 'rgba(92,98,106,0.85)';
  g.lineWidth = 4;
  g.beginPath();
  const n = Math.max(24, Math.round(turns * 10));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = x0 + t * (x1 - x0);
    const yy = y - Math.abs(Math.sin(t * Math.PI * turns)) * 9;
    if (k === 0) g.moveTo(x, yy);
    else g.lineTo(x, yy);
  }
  g.stroke();
}

/**
 * La vitrine : trois tablettes d'échantillons pour une machine à boissons,
 * quatre rangées de spirales pour une machine à manger. Sous chaque case, sa
 * plaquette de prix et son bouton - c'est ce contraste rouge/bleu qui fait
 * reconnaître un distributeur japonais avant même d'en lire l'enseigne.
 */
/** Trame de la vitrine : cinq couloirs pour des bouteilles, quatre pour des
 *  sachets - un sachet est deux fois plus large. C'est aussi la trame que le
 *  réticule découpe en visant (systems/pick), d'où l'export. */
export const VENDING_ROWS = 3;
export function vendingCols(brand: VendingBrand): number {
  return isSolidVending(brand.kind) ? 4 : 5;
}

/**
 * La vitrine : trois tablettes d'échantillons pour une machine à boissons,
 * quatre rangées de spirales pour une machine à manger. Sous chaque case, sa
 * plaquette de prix et son bouton - c'est ce contraste rouge/bleu qui fait
 * reconnaître un distributeur japonais avant même d'en lire l'enseigne.
 *
 * ELLE MONTRE LE RAYON RÉEL. Les échantillons, les prix et les 売切 étaient
 * tirés au sort pour faire joli ; ils viennent maintenant de `slots`, la liste
 * de ce que la machine vend réellement couloir par couloir (data/products,
 * `machineSlots`). C'est ce qui permet de VISER une case : ce qu'on lit sur la
 * plaquette est ce qu'on paie, et ce qui tombe est ce qu'on regardait.
 *
 * `lit` dit quelles cases ont leur bouton allumé - celles qu'on peut acheter
 * avec le crédit inséré. C'est le seul retour qu'une machine donne avant
 * qu'on appuie, et c'est à lui qu'on sait qu'on a mis assez.
 */
export function makeVendingDisplayTexture(
  brand: VendingBrand,
  slots: readonly (VendingItem | null)[],
  lit: readonly boolean[] = [],
): THREE.CanvasTexture {
  const { c, g } = makeCanvas(DISPLAY_W, DISPLAY_H);
  drawDisplay(g, brand, slots, lit);
  return toTexture(c);
}

/**
 * La même vitrine, mais REDESSINABLE.
 *
 * Les lampes des boutons s'allument à mesure qu'on glisse des pièces : la
 * surface change, donc elle ne peut pas être un canevas jeté une fois pour
 * toutes. C'est le même idiome que les afficheurs (textures/ticket) - on garde
 * le canevas, on le repeint, et la texture se déclare périmée.
 */
export function makeVendingDisplay(): {
  texture: THREE.CanvasTexture;
  redraw: (brand: VendingBrand, slots: readonly (VendingItem | null)[], lit: readonly boolean[]) => void;
} {
  const { c, g } = makeCanvas(DISPLAY_W, DISPLAY_H);
  const texture = toTexture(c);
  return {
    texture,
    redraw: (brand, slots, lit) => {
      drawDisplay(g, brand, slots, lit);
      texture.needsUpdate = true;
    },
  };
}

const DISPLAY_W = 640;
const DISPLAY_H = 372;

function drawDisplay(
  g: CanvasRenderingContext2D,
  brand: VendingBrand,
  slots: readonly (VendingItem | null)[],
  lit: readonly boolean[],
): void {
  const W = DISPLAY_W;
  const H = DISPLAY_H;
  const snack = isSolidVending(brand.kind);
  const rows = VENDING_ROWS;
  const cols = vendingCols(brand);
  const rowH = H / rows;
  const colW = W / cols;
  g.textAlign = 'center';

  for (let row = 0; row < rows; row++) {
    const y0 = row * rowH;
    // Le haut de la case est la vitrine, le bas la réglette de nez de tablette.
    const shelfY = y0 + rowH * (snack ? 0.66 : 0.62);
    const railH = y0 + rowH - shelfY;

    // Rétroéclairage : un tube sous chaque tablette, le fond descend vers
    // l'ombre - sans ce dégradé la vitrine est un aplat de papier.
    const bg = g.createLinearGradient(0, y0, 0, shelfY);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.16, '#f7f6f1');
    bg.addColorStop(1, '#d5d4ce');
    g.fillStyle = bg;
    g.fillRect(0, y0, W, shelfY - y0);
    g.fillStyle = '#ffffff';
    g.fillRect(5, y0 + 3, W - 10, 5);

    // Séparateurs de colonne.
    g.strokeStyle = 'rgba(0,0,0,0.09)';
    g.lineWidth = 2;
    for (let k = 1; k < cols; k++) {
      g.beginPath();
      g.moveTo(k * colW, y0 + 12);
      g.lineTo(k * colW, shelfY - 2);
      g.stroke();
    }

    if (snack) drawCoil(g, 6, W - 6, shelfY - 4, cols * 3);

    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const item = slots[index] ?? null;
      const cx = (col + 0.5) * colW;
      const baseY = shelfY - 4;
      const hot = !!item?.hot;
      const soldOut = !item;
      const price = item?.price ?? 0;

      // Ombre portée : sans elle l'échantillon flotte devant la tablette.
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.ellipse(cx, baseY + 2, colW * 0.24, 5, 0, 0, Math.PI * 2);
      g.fill();

      if (item) {
        g.save();
        switch (item.shape) {
          case 'ice':
            drawTub(g, cx, baseY, rowH * 0.4, colW * 0.4, item.tone);
            break;
          case 'cup':
            drawCup(g, cx, baseY, rowH * 0.52, colW * 0.42, item.tone);
            break;
          case 'noodle':
            // Sachets et boîtes : la forme suit l'enseigne, pas l'article -
            // un paquet de biscuits et un sachet de bonbons ont la même
            // silhouette, et c'est le couloir qui les distingue.
            if (snack) drawBag(g, cx, baseY, rowH * 0.55, colW * 0.5, item.tone);
            else drawBox(g, cx, baseY, rowH * 0.56, colW * 0.34, item.tone);
            break;
          case 'can':
          case 'canSlim':
            drawCan(g, cx, baseY, rowH * (item.shape === 'canSlim' ? 0.4 : 0.47), colW * 0.34, item.tone);
            break;
          default:
            drawBottle(g, cx, baseY, rowH * 0.57, colW * 0.33, item.liquid ?? item.tone, item.tone, shade(item.tone, 0.75));
        }
        g.restore();
      }

      // --- Réglette : plaquette de prix, puis bouton --------------------
      const tw = colW * 0.78;
      const th = railH * 0.44;
      const tx = cx - tw / 2;
      const ty = shelfY + railH * 0.1;
      g.fillStyle = '#f6f5f1';
      g.beginPath();
      g.roundRect(tx, ty, tw, th, 3);
      g.fill();
      // Pastille : chaud ou froid sur une machine à boissons, code de couloir
      // sur une machine à manger - là, rien n'est ni chaud ni froid.
      g.fillStyle = snack ? '#3f4650' : hot ? '#c8322b' : '#1f5fbf';
      g.beginPath();
      g.roundRect(tx, ty, tw * 0.3, th, 3);
      g.fill();
      g.fillStyle = '#ffffff';
      const tag = snack ? `${'ABC'[row]}${col + 1}` : hot ? '温' : '冷';
      fitFillText(g, tag, tx + tw * 0.15, ty + th * 0.78, tw * 0.26, th * 0.8);
      g.fillStyle = '#15181b';
      if (price) fitFillText(g, `¥${price}`, tx + tw * 0.64, ty + th * 0.78, tw * 0.62, th * 0.82);

      const bw = colW * 0.74;
      const bh = railH * 0.36;
      const bx = cx - bw / 2;
      const by = shelfY + railH * 0.58;
      if (soldOut) {
        g.fillStyle = '#8e9298';
        g.beginPath();
        g.roundRect(bx, by, bw, bh, bh * 0.4);
        g.fill();
        g.fillStyle = '#ffdcd8';
        fitFillText(g, '売切', cx, by + bh * 0.78, bw * 0.8, bh * 0.9);
      } else {
        const on = lit[index] ?? false;
        const btn = hot ? '#cf3a2c' : '#2266cc';
        g.fillStyle = shade(btn, 0.72);
        g.beginPath();
        g.roundRect(bx, by, bw, bh, bh * 0.4);
        g.fill();
        g.fillStyle = on ? shade(btn, 1.35) : btn;
        g.beginPath();
        g.roundRect(bx + 2, by + 1, bw - 4, bh - 4, bh * 0.36);
        g.fill();
        // Reflet du bouton, et la petite lampe qui dit qu'il est vendable.
        g.fillStyle = 'rgba(255,255,255,0.34)';
        g.beginPath();
        g.roundRect(bx + 5, by + 3, bw - 10, bh * 0.3, bh * 0.15);
        g.fill();
        // La lampe : éteinte tant qu'il n'y a pas de quoi payer, franche dès
        // que le crédit suffit. C'est elle qu'on regarde en glissant sa pièce.
        g.fillStyle = on ? '#ffe9a8' : 'rgba(255,233,168,0.25)';
        g.beginPath();
        g.arc(bx + bw - 9, by + bh * 0.52, bh * (on ? 0.2 : 0.16), 0, Math.PI * 2);
        g.fill();
      }
    }

    // Nez de tablette : c'est la seule pièce sombre de la vitrine, elle
    // sépare nettement les étages.
    const rail = g.createLinearGradient(0, shelfY, 0, y0 + rowH);
    rail.addColorStop(0, 'rgba(255,255,255,0.55)');
    rail.addColorStop(0.1, 'rgba(255,255,255,0)');
    rail.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = rail;
    g.fillRect(0, shelfY, W, railH);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, shelfY, W, 2);
  }

  g.textAlign = 'left';
}

/** Le caisson d'enseigne, en tête de machine : allumé jour et nuit. */
export function makeVendingHeaderTexture(brand: VendingBrand): THREE.CanvasTexture {
  const W = 768;
  const H = 108;
  const { c, g } = makeCanvas(W, H);

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, shade(brand.band, 1.22));
  bg.addColorStop(0.46, brand.band);
  bg.addColorStop(0.52, shade(brand.band, 0.84));
  bg.addColorStop(1, shade(brand.band, 1.06));
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // Filet clair en tête : le bord du caisson accroche la lumière.
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.fillRect(0, 0, W, 3);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, H - 4, W, 4);

  // Emblème : une pastille claire, un jeton graphique, pas un logo.
  g.fillStyle = brand.ink;
  g.beginPath();
  g.arc(62, H / 2, 34, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = brand.band;
  g.beginPath();
  g.arc(62, H / 2, 24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = brand.ink;
  g.textAlign = 'center';
  fitFillText(g, brand.name.slice(0, 1), 62, H / 2 + 12, 34, 34);

  g.textAlign = 'left';
  g.fillStyle = brand.ink;
  fitFillText(g, brand.nameJp, 112, 52, 300, 42);
  g.font = `600 26px ${JP_FONT}`;
  g.globalAlpha = 0.82;
  g.fillText(brand.name, 112, 88, 300);
  g.globalAlpha = 1;

  // Les deux pastilles de service, à droite : chaud et froid, comme sur toutes
  // les machines mixtes.
  g.textAlign = 'center';
  const tags: [string, string][] =
    brand.kind === 'ice'
      ? [['#2f7fa8', 'アイス']]
      : brand.kind === 'noodle'
        ? [['#9c2b22', 'カップめん'], ['#c8322b', 'お湯あり']]
        : brand.kind === 'snack'
          ? [['#3a3f45', '24時間']]
          : [
            ['#c8322b', 'あたたかい'],
            ['#1f5fbf', 'つめたい'],
          ];
  let tx = W - 20;
  for (const [color, text] of tags.reverse()) {
    const tw = 190;
    tx -= tw;
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(tx, 24, tw - 12, 60, 8);
    g.fill();
    g.fillStyle = '#ffffff';
    fitFillText(g, text, tx + (tw - 12) / 2, 66, tw - 34, 34);
    tx -= 6;
  }
  g.textAlign = 'left';
  return toTexture(c);
}

/**
 * La platine des monnayeurs, sous la vitrine : plaque de service, afficheur du
 * crédit, levier de rendu, fente à pièces, avaleur de billets, lecteur sans
 * contact. Standard JR : la même sur toutes les machines du quai.
 */
export function makeVendingPanelTexture(): THREE.CanvasTexture {
  const W = 640;
  const H = 197;
  const { c, g } = makeCanvas(W, H);
  const r = rng(5507);

  // Tôle brossée horizontalement.
  g.fillStyle = '#c3c7cb';
  g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.07})`;
    g.fillRect(0, y, W, 1);
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, H - 5, W, 5);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillRect(0, 0, W, 3);

  // --- Plaque de service, à gauche ------------------------------------
  g.fillStyle = '#f2f1ec';
  g.beginPath();
  g.roundRect(14, 16, 196, 165, 5);
  g.fill();
  g.strokeStyle = '#9ea3a8';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#1d3f78';
  g.fillRect(14, 16, 196, 34);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  fitFillText(g, 'ご利用案内', 112, 42, 176, 26);
  g.textAlign = 'left';
  g.fillStyle = '#5a5f64';
  const notes = ['つり銭をお確かめください', '千円札のみ使えます', '故障時はお申し出ください'];
  for (let k = 0; k < notes.length; k++) {
    fitFillText(g, notes[k], 26, 76 + k * 26, 172, 17, '600');
  }
  // Lampes d'état : rupture de monnaie, machine en préparation.
  const lamps: [string, string][] = [
    ['#d84a2a', 'つり銭切れ'],
    ['#e0b21c', '準備中'],
  ];
  for (let k = 0; k < lamps.length; k++) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.arc(32 + k * 96, 160, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a4e52';
    g.beginPath();
    g.arc(32 + k * 96, 158, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6a6f74';
    fitFillText(g, lamps[k][1], 44 + k * 96, 164, 74, 15, '600');
  }

  // --- Afficheur du crédit --------------------------------------------
  g.fillStyle = '#14171a';
  g.beginPath();
  g.roundRect(226, 22, 150, 66, 5);
  g.fill();
  g.fillStyle = '#2e6f3a';
  fitFillText(g, '投入金額', 236, 44, 60, 16, '600');
  g.textAlign = 'right';
  g.fillStyle = '#7dfba0';
  fitFillText(g, '¥0', 366, 78, 120, 34);
  g.textAlign = 'left';

  // --- Levier de rendu -------------------------------------------------
  g.fillStyle = '#9b9fa4';
  g.beginPath();
  g.roundRect(226, 104, 150, 70, 6);
  g.fill();
  g.fillStyle = '#7c8085';
  g.beginPath();
  g.roundRect(232, 110, 138, 40, 5);
  g.fill();
  g.fillStyle = '#3c4045';
  g.beginPath();
  g.moveTo(301, 144);
  g.lineTo(287, 120);
  g.lineTo(315, 120);
  g.closePath();
  g.fill();
  g.fillStyle = '#22262a';
  g.textAlign = 'center';
  fitFillText(g, '返却レバー', 301, 168, 132, 20);

  // --- Fente à pièces ---------------------------------------------------
  g.fillStyle = '#9b9fa4';
  g.beginPath();
  g.roundRect(392, 22, 78, 66, 5);
  g.fill();
  g.fillStyle = '#101315';
  g.beginPath();
  g.roundRect(423, 30, 16, 44, 8);
  g.fill();
  g.fillStyle = '#22262a';
  fitFillText(g, '硬貨', 431, 84, 70, 16, '600');

  // --- Lecteur sans contact ---------------------------------------------
  g.fillStyle = '#0d5f6b';
  g.beginPath();
  g.roundRect(486, 22, 140, 66, 8);
  g.fill();
  g.fillStyle = '#12808f';
  g.beginPath();
  g.roundRect(492, 28, 128, 54, 6);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 3;
  for (let k = 1; k <= 3; k++) {
    g.beginPath();
    g.arc(524, 55, k * 9, -Math.PI / 2.6, Math.PI / 2.6);
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  fitFillText(g, 'IC', 578, 66, 60, 34);

  // --- Avaleur de billets ------------------------------------------------
  g.fillStyle = '#9b9fa4';
  g.beginPath();
  g.roundRect(392, 104, 234, 70, 6);
  g.fill();
  g.fillStyle = '#101315';
  g.beginPath();
  g.roundRect(410, 118, 198, 18, 4);
  g.fill();
  g.fillStyle = '#7dfba0';
  g.beginPath();
  g.moveTo(509, 116);
  g.lineTo(497, 104);
  g.lineTo(521, 104);
  g.closePath();
  g.fill();
  g.fillStyle = '#22262a';
  fitFillText(g, '千円札', 509, 164, 200, 22);

  g.textAlign = 'left';
  return toTexture(c);
}

/** Le fond de la niche du bas : volet de retrait et sébile de rendu. */
export function makeVendingPortTexture(): THREE.CanvasTexture {
  const W = 600;
  const H = 240;
  const { c, g } = makeCanvas(W, H);

  g.fillStyle = '#3a3e43';
  g.fillRect(0, 0, W, H);
  // Bandeau d'étiquettes, en tête de niche.
  g.fillStyle = '#1a1e22';
  g.fillRect(0, 0, W, 50);
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  fitFillText(g, '取出口', 196, 36, 300, 30);
  g.fillStyle = '#f0d24a';
  fitFillText(g, 'つり銭', 498, 36, 170, 26);

  // --- Volet basculant --------------------------------------------------
  const fx = 14;
  const fy = 62;
  const fw = 372;
  const fh = 162;
  g.fillStyle = '#0e1113';
  g.beginPath();
  g.roundRect(fx, fy, fw, fh, 10);
  g.fill();
  // Lèvre caoutchouc en tête d'ouverture.
  g.fillStyle = '#08090b';
  g.fillRect(fx + 6, fy + 4, fw - 12, 24);
  // Le battant, vu en légère plongée : plus étroit en bas qu'en haut.
  g.fillStyle = '#2b3036';
  g.beginPath();
  g.moveTo(fx + 8, fy + 34);
  g.lineTo(fx + fw - 8, fy + 34);
  g.lineTo(fx + fw - 18, fy + fh - 10);
  g.lineTo(fx + 18, fy + fh - 10);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(fx + 10, fy + 34, fw - 20, 6);
  // Barre de préhension.
  g.fillStyle = '#9aa0a6';
  g.beginPath();
  g.roundRect(fx + fw / 2 - 74, fy + 62, 148, 13, 6);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(fx + fw / 2 - 74, fy + 73, 148, 4);
  // Étiquette d'avertissement : les canettes chaudes le sont vraiment.
  g.fillStyle = '#e8c22a';
  g.beginPath();
  g.roundRect(fx + 26, fy + 110, fw - 52, 34, 5);
  g.fill();
  g.fillStyle = '#1c1e21';
  fitFillText(g, 'あたたかい商品はご注意ください', fx + fw / 2, fy + 134, fw - 74, 22, '600');

  // --- Sébile de rendu ---------------------------------------------------
  const px = 406;
  const pw = 180;
  g.fillStyle = '#0e1113';
  g.beginPath();
  g.roundRect(px, fy, pw, fh, 10);
  g.fill();
  g.fillStyle = '#23272c';
  g.beginPath();
  g.roundRect(px + 10, fy + 10, pw - 20, fh - 20, 8);
  g.fill();
  // Lèvre métal du bac, et l'ombre du creux au-dessus.
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.ellipse(px + pw / 2, fy + 62, pw * 0.36, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8f959b';
  g.beginPath();
  g.roundRect(px + 20, fy + 104, pw - 40, 15, 7);
  g.fill();
  g.fillStyle = '#c8cdd2';
  fitFillText(g, '返却口', px + pw / 2, fy + 146, pw - 40, 22, '600');

  g.textAlign = 'left';
  return toTexture(c);
}

/**
 * Le verre de la vitrine : rien qu'un reflet. Les tubes de l'auvent y tracent
 * une bande claire en haut, plus une diagonale - sans elle, la vitre est un
 * trou et l'objet redevient une affiche.
 */
export function makeVendingGlassTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);

  const top = g.createLinearGradient(0, 0, 0, H);
  top.addColorStop(0, 'rgba(255,255,255,0.34)');
  top.addColorStop(0.16, 'rgba(255,255,255,0.08)');
  top.addColorStop(0.7, 'rgba(255,255,255,0.02)');
  top.addColorStop(1, 'rgba(180,200,215,0.12)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, H);

  // Diagonale : le reflet du néon le plus proche.
  g.save();
  g.translate(W * 0.28, 0);
  g.rotate(0.32);
  const streak = g.createLinearGradient(-40, 0, 40, 0);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = streak;
  g.fillRect(-40, -H, 80, H * 3);
  g.restore();
  g.save();
  g.translate(W * 0.66, 0);
  g.rotate(0.32);
  const thin = g.createLinearGradient(-14, 0, 14, 0);
  thin.addColorStop(0, 'rgba(255,255,255,0)');
  thin.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  thin.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = thin;
  g.fillRect(-14, -H, 28, H * 3);
  g.restore();

  return toTexture(c);
}

/**
 * Les flancs : rien qu'une tôle peinte, mais jamais nue. Une couture de porte,
 * l'étiquette d'entretien, la marque de recyclage, et la crasse du bas de
 * caisse. Le fond reste transparent, la couleur vient de la caisse.
 */
export function makeVendingSideTexture(): THREE.CanvasTexture {
  const W = 192;
  const H = 384;
  const { c, g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);

  // Couture de la porte, côté charnières : u = 0 est l'ARÊTE AVANT, la porte
  // s'ouvre donc du bon côté.
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(W * 0.14, 8, 3, H - 20);
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.fillRect(W * 0.14 + 3, 8, 2, H - 20);
  // Pli de tôle à mi-flanc : une tôle de 1,80 m sans raidisseur n'existe pas.
  g.fillStyle = 'rgba(0,0,0,0.14)';
  g.fillRect(W * 0.2, H * 0.52, W * 0.8, 3);
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fillRect(W * 0.2, H * 0.52 + 3, W * 0.8, 2);

  // Étiquette d'entretien : petite, en haut du flanc, comme sur le matériel.
  g.fillStyle = 'rgba(246,245,240,0.92)';
  g.beginPath();
  g.roundRect(W * 0.56, H * 0.22, W * 0.3, H * 0.09, 2);
  g.fill();
  g.fillStyle = 'rgba(60,64,68,0.75)';
  for (let k = 0; k < 3; k++) {
    g.fillRect(W * 0.59, H * 0.24 + k * 7, W * 0.24 * (k === 2 ? 0.55 : 1), 2);
  }
  const r = rng(313);
  for (let x = 0; x < W * 0.24; x += 3) {
    if (r() < 0.5) continue;
    g.fillStyle = 'rgba(30,32,35,0.8)';
    g.fillRect(W * 0.59 + x, H * 0.28, 2, 7);
  }

  // Triangle du recyclage, au-dessus du pli.
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(W * 0.68, H * 0.4);
  g.lineTo(W * 0.79, H * 0.45);
  g.lineTo(W * 0.57, H * 0.45);
  g.closePath();
  g.stroke();

  // Modelé du flanc : la lumière du quai vient de l'avant, l'arrière tombe dans
  // l'ombre - sans ce dégradé la tôle est un carton découpé.
  const back = g.createLinearGradient(W * 0.45, 0, W, 0);
  back.addColorStop(0, 'rgba(24,26,28,0)');
  back.addColorStop(1, 'rgba(24,26,28,0.3)');
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);

  // Bas de caisse : l'ombre et la poussière du quai.
  const dirt = g.createLinearGradient(0, H * 0.84, 0, H);
  dirt.addColorStop(0, 'rgba(30,32,34,0)');
  dirt.addColorStop(1, 'rgba(30,32,34,0.42)');
  g.fillStyle = dirt;
  g.fillRect(0, H * 0.84, W, H * 0.16);

  return toTexture(c);
}

/** Flaque de lumière au pied de la machine : la vitrine éclaire la dalle. */
export function makeVendingGlowTexture(): THREE.CanvasTexture {
  const S = 128;
  const { c, g } = makeCanvas(S, S);
  g.clearRect(0, 0, S, S);
  const glow = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // Discrète : la flaque est ADDITIVE et n'est pas tone-mappée. Plus soutenue,
  // elle passait pour un projecteur braqué sur la dalle en plein jour.
  glow.addColorStop(0, 'rgba(255,246,222,0.2)');
  glow.addColorStop(0.45, 'rgba(255,242,208,0.07)');
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  return toTexture(c);
}
