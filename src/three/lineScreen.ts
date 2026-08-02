// Rendu des ÉCRANS DE LIGNE de l'E235 : tout ce qui se peint sur les dalles
// LCD au-dessus des portes, hors de tout composant React - la boucle de rendu
// vit dans `Screens.tsx`, la peinture vit ici.
//
// Comme sur la rame réelle, l'écran droit enchaîne un cycle QUADRILINGUE
// (japonais, anglais, chinois simplifié, coréen) et de nombreux états : vue
// rapprochée des 5 prochaines stations (arc vert, minutes, correspondances),
// plan complet de la boucle (30 stations, minutes jusqu'à ~30 min), écran
// « prochain arrêt » zh/ko, correspondances détaillées, écrans manières
// (téléphone, sac à dos, fuite sonore des écouteurs), places prioritaires,
// sécurité, avertissement de FERMETURE DES PORTES en fin d'arrêt, côté
// d'ouverture à l'approche, plan du quai, et - quand une autre ligne est
// perturbée - information trafic, état des autres lignes et certificat de
// retard. L'écran gauche, lui, ne montre que des publicités.

import * as THREE from 'three';
import { EMERGENCY_REASONS } from '../data/announcements';
import { CONFIG } from '../data/config';
import { CONSIST, E235, PLAYER_CAR, carZ } from '../data/e235';
import { stationAtHop } from '../data/loop';
import type { LoopDirection } from '../data/platforms';
import { cruiseDuration, headwayMinutesTo } from '../data/segments';
import { gateNameFor } from '../data/stationInterior';
import { layoutFor } from '../data/stationLayouts';
import { STATIONS, TRANSFERS } from '../data/stations';
import type { Phase } from '../store';
import { JP_FONT, drawAdInto, rng } from '../textures/procedural';
// Toutes les cotes et toutes les couleurs de ce fichier sont relevées AU PIXEL
// sur des captures de l'afficheur réel, ramenées à une dalle de 768 × 432. Le
// format compte autant que le reste : les doubles écrans de l'E235 sont deux
// 16:9 côte à côte, pas deux panoramiques - la vue rapprochée dessinée sur un
// 2:1 était étirée en largeur avant même qu'on en regarde le contenu.
export const SCREEN_W = 768;
export const SCREEN_H = 432;

const YAMANOTE_GREEN = '#54af00';
/** Liseré sombre du côté CONCAVE de l'arc de la vue rapprochée. */
const YAMANOTE_GREEN_DARK = '#0b5800';
/** Fond des vues de ligne (gris très clair, pas blanc). */
const SCREEN_BG = '#e9e9e9';
const HEADER_BG = '#191a17';
const HEADER_TEXT = '#e8e8e7';
/** Petites capitales du bandeau (« Bound for », « Car No. ») : gris lavande. */
const HEADER_DIM = '#bab8ce';
/** Horloge et n° de voiture : lavande pâle, pas blanc et surtout pas jaune. */
const CLOCK_COLOR = '#d1cef5';
const CAR_NUM_COLOR = '#c4c1e3';
const CAR_LABEL_COLOR = '#9593a6';
/** Rouge du repère de position (pentagone de la vue rapprochée, chevron du plan). */
const MARKER_RED = '#8f1a17';

/**
 * Alimentation de bord en dessous de laquelle les dalles LCD sont éteintes.
 *
 * Les écrans embarqués ne sont PAS des équipements de sécurité : ils ne sont
 * pas tenus par les batteries et ils tombent avant les lampes de secours. Le
 * seuil est haut pour cette raison - un panneau perd son rétroéclairage bien
 * avant qu'un tube fluorescent ne s'éteigne.
 */
export const LCD_CUTOFF = 0.45;

/**
 * Alimentation au-dessus de laquelle le contrôleur de la dalle a fini de
 * redémarrer et redessine son contenu. Entre les deux seuils, la lampe est
 * allumée et l'écran est noir : c'est l'état d'un panneau qui repart, et le
 * quart de seconde qu'il tient est ce qui fait qu'on le VOIT redémarrer au
 * lieu de le voir sauter d'une image à l'autre.
 */
export const LCD_READY = 0.97;

// Numéro de voiture affiché : celui de la voiture où l'on est RÉELLEMENT, pas
// une constante à part. L'écran annonçait « 3号車 » pendant que la rame plaçait
// le joueur dans la 6e (`e235.PLAYER_CAR`), que l'invite d'embarquement lui
// disait 6 et que le plan du quai surlignait la 3e - trois chiffres pour une
// seule voiture. Il n'y en a plus qu'un, et il vient de la rame.
const CAR_NO = CONSIST[PLAYER_CAR].no;

// Grandes gares pour le « Bound for … & … ».
const MAJOR_INDICES = [0, 4, 12, 16, 19, 24];

export function makeScreen(w: number, h: number): {
  g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  w: number;
  h: number;
} {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { g, texture, w, h };
}

// Heure au format de l'afficheur réel : pas de zéro devant l'heure (« 0:11 »).
export function fmtClock(clockMin: number): string {
  const total = Math.floor(clockMin) % (24 * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Secondes restantes avant l'arrivée à la prochaine station.
export function secondsToArrival(
  phase: Phase,
  phaseT: number,
  stationIndex: number,
  dir: LoopDirection,
): number {
  const cruiseSec = cruiseDuration(stationIndex, dir);
  if (phase === 'cruise') return Math.max(0, cruiseSec - phaseT) + CONFIG.brakeTime;
  if (phase === 'brake') return Math.max(0, CONFIG.brakeTime - phaseT);
  if (phase === 'depart') {
    return Math.max(0, CONFIG.departTime - phaseT) + cruiseSec + CONFIG.brakeTime;
  }
  return 0;
}

function etaMinutes(
  index: number,
  hops: number,
  atStation: boolean,
  countdown: number,
  dir: LoopDirection,
): number {
  if (atStation && hops === 0) return 0;
  const hopMin = headwayMinutesTo(index, hops, dir);
  if (atStation) return hopMin;
  const remain = Math.max(1, Math.ceil(countdown / 60));
  return hops === 0 ? remain : hopMin + remain;
}

function fitText(g: CanvasRenderingContext2D, text: string, maxWidth: number, basePx: number, weight = 'bold'): void {
  let px = basePx;
  do {
    g.font = `${weight} ${px}px ${JP_FONT}`;
    if (g.measureText(text).width <= maxWidth) return;
    px -= 2;
  } while (px > 10);
}

// --- Écran gauche : publicités en boucle (jamais d'info voyageurs, comme
// dans les vraies E235). Seeds 300+ : hors nakazuri (0–N), 窓上 (100–111)
// et affiches d'about (200–203), pour une rotation longue et distincte.
export const AD_LOOP_FIRST_SEED = 300;
export const AD_LOOP_COUNT = 120;

// Dalle unique au-dessus de la porte d'intercirculation, aux deux abouts du
// wagon. Sur la rame réelle c'est un écran de plus de la boucle publicitaire -
// jamais d'info voyageurs. Bande de graines distincte (500+) pour qu'on ne
// retrouve pas, en se retournant, le spot déjà affiché au-dessus des portes.
export const END_AD_FIRST_SEED = 500;
export const END_AD_COUNT = 60;

export function drawLeftAd(s: ReturnType<typeof makeScreen>, seed: number): void {
  const { g, w, h } = s;
  drawAdInto(g, w, h, seed);
  g.textAlign = 'left';
}

// --- Bandeau noir supérieur, commun aux deux vues de ligne : « Bound for »,
// onglet Next, tuile de la prochaine gare, heure réelle et n° de voiture. ---
export type ScreenStatus = 'now' | 'next' | 'soon';
// Cycle quadrilingue du vrai afficheur : japonais → anglais → chinois
// simplifié → coréen. Les plans de ligne n'existent qu'en jp/en (comme en
// vrai) ; zh et ko ont leur écran « prochain arrêt » dédié.
export type ScreenLang = 'jp' | 'en' | 'zh' | 'ko';

const STATUS_LABEL: Record<ScreenStatus, Record<ScreenLang, string>> = {
  now: { jp: 'ただいま', en: 'Now stopping at', zh: '当前车站', ko: '이번 역' },
  next: { jp: 'つぎは', en: 'Next', zh: '下一站', ko: '다음은' },
  soon: { jp: 'まもなく', en: 'Arriving at', zh: '即将到达', ko: '잠시 후' },
};

// Nom de gare dans la langue du cycle d'affichage.
//
// En japonais, l'afficheur ne montre PAS toujours la même graphie : la gare
// où l'on est (ただいま) est en kanji, celle où l'on va (つぎは / まもなく) est
// en hiragana - c'est la lecture, celle que l'annonce vient de prononcer, et
// c'est ce qui permet de la retrouver quand on ne sait pas lire 神田. Le corps
// du plan, lui, reste en kanji dans les deux cas.
/**
 * L'afficheur écrit le romaji à la MACRONNE, là où la signalétique de quai
 * s'en passe : le panneau de Tokyo dit « Tokyo », l'écran de bord « Tōkyō ».
 * Les autres gares de la boucle sont déjà accentuées dans `stations.ts` (Ōtsuka,
 * Yūrakuchō…) : seule celle-ci diverge, d'où une table d'une ligne plutôt qu'un
 * champ de plus sur les trente gares.
 */
const LCD_ROMAJI: Record<string, string> = { JY01: 'Tōkyō' };

function stationName(st: (typeof STATIONS)[number], lang: ScreenLang, status: ScreenStatus = 'now'): string {
  if (lang === 'jp') return status === 'next' ? st.kana : st.kanji;
  if (lang === 'en') return LCD_ROMAJI[st.jy] ?? st.romaji;
  return lang === 'zh' ? st.zh : st.ko;
}

// Bandeau noir supérieur, commun à toutes les vues. De gauche à droite :
// direction, barre verte, libellé d'état, pastille de gare (trigramme + tuile
// JY), nom de la gare en très grand, puis l'heure et le numéro de voiture.
// L'afficheur réel alterne japonais et anglais sur la même disposition ; c'est
// la langue qui change, pas la mise en page.
// Hauteur relevée : 133 px pour 432, soit ~30,8 % de la dalle.
const HEADER_H = 133;

/**
 * Pastille de gare du bandeau : boîte noire arrondie, trigramme de quai en
 * blanc au-dessus, tuile JY verte à cœur blanc en dessous.
 *
 * C'est la pièce qui manquait entièrement au bandeau, et ce n'est pas un
 * détail décoratif : c'est elle qui raccorde l'écran à la signalétique du
 * quai. Un voyageur qui ne lit pas les kanji cherche « JY 01 », pas 東京.
 */
function drawStationTile(g: CanvasRenderingContext2D, code: string, jy: string): void {
  // Boîte noire (le fond du bandeau est gris très sombre, pas noir : la boîte
  // se détache).
  g.fillStyle = '#000000';
  g.beginPath();
  g.roundRect(220, 35, 78, 96, 6);
  g.fill();

  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  fitText(g, code, 66, 24);
  g.fillText(code, 259, 54);

  // Tuile verte à cœur blanc.
  g.fillStyle = YAMANOTE_GREEN;
  g.beginPath();
  g.roundRect(225.5, 57.5, 67, 67, 9);
  g.fill();
  g.fillStyle = '#ecebe9';
  g.beginPath();
  g.roundRect(233.5, 65, 52, 52, 3);
  g.fill();

  g.fillStyle = '#141414';
  g.font = `bold 20px ${JP_FONT}`;
  g.fillText('JY', 259, 83);
  g.font = `bold 32px ${JP_FONT}`;
  g.fillText(jy.slice(2), 259, 111);
  g.textAlign = 'left';
}

function drawHeader(
  g: CanvasRenderingContext2D,
  w: number,
  index: number,
  clock: string,
  status: ScreenStatus,
  lang: ScreenLang,
  dir: LoopDirection,
): void {
  const next = STATIONS[index];
  g.fillStyle = HEADER_BG;
  g.fillRect(0, 0, w, HEADER_H);

  // Direction : texte clair POSÉ SUR LE NOIR, sans cartouche. En japonais les
  // deux gares repères tiennent sur une ligne calée à droite, le suffixe de
  // direction dessous ; en anglais « Bound for » chapeaute deux lignes calées
  // à gauche.
  const majors: string[] = [];
  for (let k = 1; k <= 29 && majors.length < 2; k++) {
    const idx = stationAtHop(index, k, dir);
    if (MAJOR_INDICES.includes(idx)) majors.push(stationName(STATIONS[idx], lang));
  }
  g.fillStyle = HEADER_TEXT;
  if (lang === 'en') {
    g.textAlign = 'left';
    g.fillStyle = HEADER_DIM;
    g.font = `18px ${JP_FONT}`;
    g.fillText('Bound for', 7, 66);
    g.fillStyle = HEADER_TEXT;
    // Les deux lignes partagent le corps de la PLUS LONGUE : « Ueno& » et
    // « Ikebukuro » sont écrits à la même taille sur l'afficheur, et calées à
    // gauche - c'est ce qui les lit comme une seule adresse.
    const l1 = `${majors[0] ?? ''}&`;
    const l2 = majors[1] ?? '';
    fitText(g, l1.length >= l2.length ? l1 : l2, 142, 30);
    g.fillText(l1, 6, 92);
    g.fillText(l2, 6, 121);
  } else {
    // jp/zh/ko partagent la mise en page « noms + suffixe de direction ».
    const suffix = lang === 'jp' ? '方面' : lang === 'zh' ? '方向' : '방면';
    g.textAlign = 'right';
    fitText(g, `${majors[0] ?? ''}・${majors[1] ?? ''}`, 163, 36);
    g.fillText(`${majors[0] ?? ''}・${majors[1] ?? ''}`, 171, 87);
    g.font = `21px ${JP_FONT}`;
    g.fillText(suffix, 171, 119);
  }

  // Barre verte pleine hauteur.
  g.fillStyle = YAMANOTE_GREEN;
  g.fillRect(182, 0, 32, HEADER_H);

  // Libellé d'état, clair sur noir, au-dessus de la pastille.
  g.textAlign = 'left';
  g.fillStyle = '#dcdcda';
  fitText(g, STATUS_LABEL[status][lang], 260, 27, '');
  g.fillText(STATUS_LABEL[status][lang], 226, 27);

  drawStationTile(g, next.code, next.jy);

  // Nom de la gare, énorme : il occupe toute la moitié droite et passe SOUS
  // l'horloge, exactement comme sur l'afficheur. Les noms de DEUX caractères
  // sont aérés d'un cadratin - et les deux glyphes sont posés séparément
  // plutôt que séparés par un U+3000 : selon la fonte qui répond, l'espace
  // idéographique se retrouve parfois à chasse nulle, et 東京 se recollait.
  const name = stationName(next, lang, status);
  g.textAlign = 'center';
  g.fillStyle = HEADER_TEXT;
  const jpName = lang !== 'en';
  if (jpName && name.length === 2) {
    g.font = `95px ${JP_FONT}`;
    g.fillText(name[0], 517 - 95.5, 118);
    g.fillText(name[1], 517 + 95.5, 118);
  } else {
    fitText(g, name, 340, jpName ? 110 : 92, '');
    g.fillText(name, 517, jpName ? 118 : 116);
  }

  // Heure et numéro de voiture, en haut à droite. Le NUMÉRO est grand et
  // italique, le libellé (« 号車 », « Car No. ») petit et gris : c'est le
  // chiffre qu'on cherche du regard, pas le mot.
  g.textAlign = 'right';
  g.fillStyle = CLOCK_COLOR;
  g.font = `bold 32px ${JP_FONT}`;
  g.fillText(clock, 657, 29);
  const carLabel =
    lang === 'jp' ? '号車'
    : lang === 'zh' ? '号车'
    : lang === 'ko' ? '호차'
    : 'Car No.';
  g.fillStyle = CAR_NUM_COLOR;
  g.font = `italic bold 38px ${JP_FONT}`;
  const carNumW = g.measureText(String(CAR_NO)).width;
  g.fillText(String(CAR_NO), 763, 34);
  g.fillStyle = CAR_LABEL_COLOR;
  if (lang === 'en') {
    // « Car No. » se range À GAUCHE du chiffre, sur la même ligne.
    g.font = `17px ${JP_FONT}`;
    g.fillText(carLabel, 763 - carNumW - 8, 29);
  } else {
    g.font = `16px ${JP_FONT}`;
    g.fillText(carLabel, 763, 51);
  }
  g.textAlign = 'left';
}

// --- Pastilles de ligne ---------------------------------------------------
// Sur l'afficheur réel, une ligne en correspondance n'est jamais un simple
// carré de couleur : c'est son SIGLE officiel. Les lignes JR portent un
// cartouche blanc cerné de leur couleur avec le code en toutes lettres (JC,
// JT, JO…), les métros une pastille pleine frappée d'une lettre, et les
// shinkansen un pictogramme de nez de rame. C'est ce qui rend le pavé lisible
// sans lire le japonais - et c'est ce que la version précédente perdait en
// posant des carrés pleins muets.
const LINE_BADGES: { match: RegExp; code: string; color: string; round?: boolean; shink?: boolean }[] = [
  // Les shinkansen de JR East (vert) et de JR Central (bleu) : le pictogramme
  // ne s'applique QU'AUX libellés qui portent 新幹線 - « 京浜東北線 » contient
  // 東北 et se retrouverait sinon frappé d'un nez de rame.
  { match: /(東北|山形|秋田|北海道|上越|北陸).*新幹線/, code: '', color: '#00a650', shink: true },
  { match: /新幹線/, code: '', color: '#1f6fb5', shink: true },
  { match: /京浜東北/, code: 'JK', color: '#00a7db' },
  { match: /総武線快速/, code: 'JO', color: '#0067c0' },
  { match: /中央・総武/, code: 'JB', color: '#ffd400' },
  { match: /中央線/, code: 'JC', color: '#f15a24' },
  { match: /上野東京/, code: 'JT|JU', color: '#f68b1e' },
  { match: /常磐/, code: 'JJ', color: '#00b48d' },
  { match: /宇都宮|高崎/, code: 'JU', color: '#f68b1e' },
  { match: /東海道線/, code: 'JT', color: '#f68b1e' },
  { match: /横須賀/, code: 'JO', color: '#0067c0' },
  { match: /京葉/, code: 'JE', color: '#c9252b' },
  { match: /埼京|川越/, code: 'JA', color: '#00ac9a' },
  { match: /湘南新宿/, code: 'JS', color: '#e21f26' },
  { match: /丸ノ内/, code: 'M', color: '#e60012', round: true },
  { match: /銀座/, code: 'G', color: '#f39700', round: true },
  { match: /日比谷/, code: 'H', color: '#9caeb7', round: true },
  { match: /千代田/, code: 'C', color: '#00a95f', round: true },
  { match: /有楽町/, code: 'Y', color: '#c1a470', round: true },
  { match: /副都心/, code: 'F', color: '#9c5e31', round: true },
  { match: /半蔵門/, code: 'Z', color: '#8f76d6', round: true },
  { match: /南北/, code: 'N', color: '#00ac9b', round: true },
  { match: /東西/, code: 'T', color: '#009bbf', round: true },
  { match: /浅草/, code: 'A', color: '#e85298', round: true },
  { match: /都営新宿/, code: 'S', color: '#6cbb5a', round: true },
  { match: /大江戸/, code: 'E', color: '#b6007a', round: true },
  { match: /三田/, code: 'I', color: '#0079c2', round: true },
  { match: /京急|京浜急行/, code: 'KK', color: '#00bfff' },
  { match: /京成/, code: 'KS', color: '#005aaa' },
  { match: /東急/, code: 'TY', color: '#e5171f' },
  { match: /東武/, code: 'TS', color: '#0f6cb6' },
  { match: /西武/, code: 'SI', color: '#f5a200' },
  { match: /小田急/, code: 'OH', color: '#0079c2' },
  { match: /京王/, code: 'KO', color: '#d31e79' },
  { match: /りんかい/, code: 'R', color: '#0079c1' },
  { match: /モノレール/, code: 'MO', color: '#0a6eb4' },
  { match: /つくば/, code: 'TX', color: '#00a7db' },
  { match: /舎人ライナー/, code: 'NT', color: '#c7176b' },
  { match: /ライナー|荒川線/, code: '', color: '#6d7a83' },
];

/** Pictogramme de nez de shinkansen, blanc sur la pastille. */
function drawShinkansenGlyph(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x + s * 0.5, y + s * 0.17);
  g.quadraticCurveTo(x + s * 0.78, y + s * 0.3, x + s * 0.78, y + s * 0.66);
  g.lineTo(x + s * 0.22, y + s * 0.66);
  g.quadraticCurveTo(x + s * 0.22, y + s * 0.3, x + s * 0.5, y + s * 0.17);
  g.closePath();
  g.fill();
  g.fillRect(x + s * 0.24, y + s * 0.72, s * 0.52, s * 0.1);
}

/**
 * Pastille(s) d'une ligne. Renvoie la largeur occupée : certains libellés en
 * portent DEUX (上野東京ライン est à la fois JT et JU sur l'afficheur).
 */
function drawLineBadge(g: CanvasRenderingContext2D, label: string, x: number, cy: number, s: number): number {
  const b = LINE_BADGES.find((e) => e.match.test(label));
  const color = b?.color ?? '#6d7a83';
  const codes = b?.code ? b.code.split('|') : [''];
  let bx = x;
  for (const code of codes) {
    const top = cy - s / 2;
    if (b?.shink) {
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(bx, top, s, s, 2);
      g.fill();
      drawShinkansenGlyph(g, bx, top, s);
    } else if (b?.round) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(bx + s / 2, cy, s / 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = `bold ${Math.round(s * 0.66)}px ${JP_FONT}`;
      g.fillText(code, bx + s / 2, cy + s * 0.24);
      g.textAlign = 'left';
    } else {
      // Cartouche JR : fond blanc, filet et sigle à la couleur de la ligne.
      g.fillStyle = '#ffffff';
      g.strokeStyle = color;
      g.lineWidth = Math.max(1.5, s * 0.09);
      g.beginPath();
      g.roundRect(bx + 0.5, top + 0.5, s - 1, s - 1, 2);
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.textAlign = 'center';
      g.font = `bold ${Math.round(s * (code.length > 1 ? 0.5 : 0.62))}px ${JP_FONT}`;
      g.fillText(code, bx + s / 2, cy + s * 0.2);
      g.textAlign = 'left';
    }
    bx += s + s * 0.13;
  }
  return bx - x - s * 0.13;
}

// --- Écran droit, vue rapprochée --------------------------------------------
// Refaite au relevé sur l'afficheur réel. Ce qui compte, et que la version
// précédente inversait : la bande verte descend du HAUT-GAUCHE vers le
// BAS-DROITE (elle glisse sous le bandeau, dessiné après elle), elle
// S'ÉLARGIT en descendant - c'est une fuite en perspective, pas un ruban
// d'épaisseur constante - et elle porte un liseré vert sombre sur son seul
// côté concave. Les gares s'accrochent à DROITE de la bande, chacune précédée
// de sa pastille JY, en cascade et en corps dégressif vers le haut. Le pavé
// des correspondances occupe le vide à GAUCHE, sous la bande.
//
// Repères (x, y, demi-largeur de bande) de l'axe de l'arc.
const ZOOM_SPINE: [number, number, number][] = [
  [-70, 106, 13],
  [40, 124, 15],
  [140, 146, 18],
  [226.5, 172.6, 22],
  [293.1, 203.1, 26],
  [360.8, 247.8, 32],
  [422.1, 301.9, 40],
  [476.5, 374.2, 46],
  [514, 442, 50],
  [545, 510, 52],
];

// Emplacements des cinq gares, du plus proche (k = 0, en bas) au plus
// lointain. `cx/cy/r` = cercle des minutes sur la bande, `bx/by/bs` = pastille
// JY, `nx/ny/fs` = nom.
const ZOOM_SLOTS = [
  { cx: 476.5, cy: 374.2, r: 24.5, bx: 546.3, by: 363.4, bs: 43, nx: 594.6, ny: 387.2, fs: 48 },
  { cx: 422.1, cy: 301.9, r: 22.4, bx: 497.9, by: 296.1, bs: 43, nx: 546.3, ny: 319.2, fs: 48 },
  { cx: 360.8, cy: 247.8, r: 19.5, bx: 431.6, by: 236.0, bs: 36, nx: 465.7, ny: 254.7, fs: 41 },
  { cx: 293.1, cy: 203.1, r: 17.0, bx: 352.9, by: 184.3, bs: 31, nx: 383.3, ny: 199.2, fs: 31 },
  { cx: 226.5, cy: 172.6, r: 14.5, bx: 270.5, by: 148.6, bs: 29, nx: 302.7, ny: 160.8, fs: 26 },
];

/** Échantillonne l'axe de l'arc (Catmull-Rom) avec la demi-largeur locale. */
function spineSamples(pts: [number, number, number][], steps = 12): [number, number, number][] {
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out: [number, number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Pastille JY d'une gare de la vue rapprochée : cartouche blanc cerné de vert. */
function drawJyBadge(g: CanvasRenderingContext2D, jy: string, x: number, cy: number, s: number): void {
  const top = cy - s / 2;
  g.fillStyle = '#f4f4f2';
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = s * 0.1;
  g.beginPath();
  g.roundRect(x, top, s, s, 3);
  g.fill();
  g.stroke();
  g.fillStyle = '#141414';
  g.textAlign = 'center';
  g.font = `${Math.round(s * 0.4)}px ${JP_FONT}`;
  g.fillText('JY', x + s / 2, top + s * 0.44);
  g.font = `bold ${Math.round(s * 0.56)}px ${JP_FONT}`;
  g.fillText(jy.slice(2), x + s / 2, top + s * 0.92);
  g.textAlign = 'left';
}

/**
 * Les repères de position, et ils ne veulent pas tous dire la même chose.
 *
 * L'afficheur distingue « la rame est ICI » de « la rame va LÀ ». À l'arrêt,
 * la gare où l'on est perd son cercle de minutes et reçoit le jeton grenat à
 * œil clair - pas une flèche : on ne va nulle part, on y est. Dès que la rame
 * repart, ce jeton disparaît, la prochaine gare s'allume en ambre et c'est le
 * CHEVRON qui apparaît derrière elle, pointé dans le sens de marche.
 * Confondre les deux, c'était annoncer un mouvement à quai.
 *
 * Et le jeton n'a pas la même forme sur les deux plans. Sur la vue rapprochée
 * c'est un PENTAGRAMME de guingois, taillé pour se poser sur une bande qui
 * descend en biais : cinq sommets, bord supérieur horizontal, 71,6 × 59,8,
 * filet clair de 13, œil de 19,8 × 15,4 décalé. Sur le plan de boucle, où la
 * bande est droite, c'est un BLOC symétrique - dos vertical, bords haut et bas
 * horizontaux, pointe dans le sens de marche - qui ne se penche jamais.
 * Réduire le pentagramme pour le poser sur l'anneau donnait un jeton de
 * travers sur une bande droite : la bonne forme, au mauvais endroit.
 */
function drawHerePentagon(g: CanvasRenderingContext2D, x: number, y: number, angle: number, s = 1): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(s, s);
  const path = () => {
    g.beginPath();
    g.moveTo(-19.2, -29.8);
    g.lineTo(10.2, -29.8);
    g.lineTo(35.3, 7.7);
    g.lineTo(-16.5, 30.0);
    g.lineTo(-35.6, -10.9);
    g.closePath();
  };
  // Ombre portée bleu-gris en bas à droite : c'est elle qui décolle le jeton
  // de la bande et lui donne son épaisseur.
  g.save();
  g.translate(3, 4);
  g.strokeStyle = 'rgba(70,92,124,0.22)';
  g.lineWidth = 13;
  g.lineJoin = 'round';
  path();
  g.stroke();
  g.fillStyle = 'rgba(70,92,124,0.22)';
  g.fill();
  g.restore();

  g.strokeStyle = '#f2f2f2';
  g.lineWidth = 13;
  g.lineJoin = 'round';
  path();
  g.stroke();
  g.fillStyle = MARKER_RED;
  path();
  g.fill();
  g.fillStyle = '#f2f2f2';
  g.beginPath();
  g.ellipse(-2.2, -2.4, 9.9, 7.7, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * Jeton « vous êtes ici » du PLAN DE BOUCLE : bloc symétrique de 29,5 × 23,9,
 * dos vertical, bords haut et bas horizontaux, pointe de 5 dans le sens de
 * marche, œil rond de rayon 4,6. Pointe vers +x avant rotation, et ne prend
 * jamais d'autre angle que celui de sa rangée - un jeton de guingois sur une
 * bande droite se lit comme un défaut d'affichage.
 */
function drawHereBlock(g: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(-14.75, -11.95);
  g.lineTo(9.75, -11.95);
  g.lineTo(14.75, 0);
  g.lineTo(9.75, 11.95);
  g.lineTo(-14.75, 11.95);
  g.closePath();
  g.strokeStyle = '#f0f0ee';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.stroke();
  g.fillStyle = MARKER_RED;
  g.fill();
  g.fillStyle = '#f2f2f2';
  g.beginPath();
  g.arc(-1, 0, 4.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * Cadence d'animation des écrans : quatre phases d'une demi-seconde.
 *
 * Une seule horloge pour tout ce qui bouge - les vantaux du plan de quai, le
 * triangle qui désigne la voiture, et le clignotement des repères de position
 * des deux plans de ligne. Sur la rame ces trois choses battent ensemble ;
 * leur donner chacune sa cadence les ferait dériver, et l'écran se mettrait à
 * scintiller au lieu de respirer.
 */
export const ANIM_PHASES = 4;
export const ANIM_PERIOD = 0.5;

/** Les repères de position sont allumés une phase sur deux (1 s / 1 s). */
const markerLit = (anim: number): boolean => anim % ANIM_PHASES < 2;

/**
 * Chevron du sens de marche, pointe vers +x avant rotation.
 *
 * Ce n'est pas une flèche : c'est un CROCHET d'épaisseur constante. Les deux
 * bords - l'extérieur et l'échancrure du dos - sont deux V PARALLÈLES, décalés
 * de 10,7 px, chacun avançant de 5,4 px sur 15 de demi-hauteur. Le dessiner
 * comme un dard (dos plat, pointe filante) donnait une forme qui n'a jamais
 * existé sur l'afficheur - c'est exactement ce qu'on lui reprochait.
 * Relevé ligne par ligne sur le plan de boucle : 16,1 × 30.
 */
function drawWayChevron(g: CanvasRenderingContext2D, x: number, y: number, angle: number, s = 1): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(-8.05, -15.5);
  g.lineTo(2.65, -15.5);
  g.lineTo(8.05, 0);
  g.lineTo(2.65, 15.5);
  g.lineTo(-8.05, 15.5);
  g.lineTo(-2.65, 0);
  g.closePath();
  g.strokeStyle = '#f0f0ee';
  g.lineWidth = 1.6;
  g.lineJoin = 'miter';
  g.stroke();
  g.fillStyle = MARKER_RED;
  g.fill();
  g.restore();
}

export function drawRoute(
  s: ReturnType<typeof makeScreen>,
  index: number,
  phase: Phase,
  countdown: number,
  clock: string,
  status: ScreenStatus,
  lang: ScreenLang,
  dir: LoopDirection,
  anim = 0,
): void {
  const { g, w, h } = s;
  const next = STATIONS[index];
  g.fillStyle = SCREEN_BG;
  g.fillRect(0, 0, w, h);

  // ----- La bande, en deux passes : liseré sombre du côté concave, puis le
  // ruban vert par-dessus. Le liseré ne dépasse donc que vers l'extérieur.
  const spine = spineSamples(ZOOM_SPINE);
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < spine.length; i++) {
    const [x, y, hw] = spine[i];
    const p = spine[Math.max(0, i - 1)];
    const n = spine[Math.min(spine.length - 1, i + 1)];
    const tx = n[0] - p[0];
    const ty = n[1] - p[1];
    const len = Math.hypot(tx, ty) || 1;
    // Normale « gauche » = côté concave (bas-gauche) de l'arc.
    inner.push([x - (ty / len) * hw, y + (tx / len) * hw]);
    outer.push([x + (ty / len) * hw, y - (tx / len) * hw]);
  }
  g.strokeStyle = YAMANOTE_GREEN_DARK;
  g.lineWidth = 13;
  g.lineJoin = 'round';
  g.beginPath();
  inner.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.fillStyle = YAMANOTE_GREEN;
  g.beginPath();
  outer.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  for (let i = inner.length - 1; i >= 0; i--) g.lineTo(inner[i][0], inner[i][1]);
  g.closePath();
  g.fill();

  // ----- Les cinq gares : cercle des minutes sur la bande, pastille JY et nom
  // à sa droite. À quai, la gare k = 0 est celle où l'on est : son cercle cède
  // la place au repère de position.
  const atStation = phase === 'dwell';
  for (let k = 4; k >= 0; k--) {
    const st = STATIONS[stationAtHop(index, k, dir)];
    const slot = ZOOM_SLOTS[k];
    if (k > 0 || !atStation) {
      const minutes = etaMinutes(index, k, atStation, countdown, dir);
      g.beginPath();
      g.arc(slot.cx, slot.cy, slot.r, 0, Math.PI * 2);
      // Ambre pour la gare où l'on VA - jamais à quai, où l'on n'y va plus.
      g.fillStyle = !atStation && k === 0 ? '#efa61c' : '#f4f4f2';
      g.fill();
      g.fillStyle = '#141414';
      g.font = `bold ${Math.round(slot.r * 1.55)}px ${JP_FONT}`;
      g.textAlign = 'center';
      g.fillText(String(minutes), slot.cx, slot.cy + slot.r * 0.55);
      g.textAlign = 'left';
    }
    // « (分) » contre le cercle le plus lointain, du côté des plus proches.
    if (k === 4) {
      g.fillStyle = '#141414';
      g.font = `12px ${JP_FONT}`;
      g.fillText('(分)', slot.cx + slot.r + 3, slot.cy + 6);
    }

    drawJyBadge(g, st.jy, slot.bx, slot.by, slot.bs);

    // Le CORPS du plan reste japonais dans toutes les langues du cycle : sur
    // l'afficheur réel, seul le bandeau change de langue - la liste des gares,
    // le pavé des correspondances et la mention basse sont en kanji même sur
    // le passage anglais. Le voyageur compare ce qu'il lit sur l'écran à ce
    // qui est écrit sur le quai, et le quai est en japonais.
    g.fillStyle = '#141414';
    g.textAlign = 'left';
    const kanji = st.kanji;
    if (kanji.length === 2) {
      // Les noms de deux caractères sont aérés d'un cadratin (東 京).
      g.font = `${slot.fs}px ${JP_FONT}`;
      g.fillText(kanji[0], slot.nx, slot.ny);
      g.fillText(kanji[1], slot.nx + slot.fs * 2, slot.ny);
    } else {
      fitText(g, kanji, w - slot.nx - 4, slot.fs, '');
      g.fillText(kanji, slot.nx, slot.ny);
    }
  }

  // Repère de position : sur la gare quand on y est, un peu en arrière sur la
  // bande quand on roule.
  if (markerLit(anim)) {
    if (atStation) {
      drawHerePentagon(g, ZOOM_SLOTS[0].cx + 3.5, ZOOM_SLOTS[0].cy + 2.5, 0);
    } else {
      // Sur la bande, juste EN ARRIÈRE de la gare visée, pointé vers elle.
      const a = Math.atan2(ZOOM_SLOTS[0].cy - ZOOM_SLOTS[1].cy, ZOOM_SLOTS[0].cx - ZOOM_SLOTS[1].cx);
      drawWayChevron(g, ZOOM_SLOTS[0].cx + 20, ZOOM_SLOTS[0].cy + 27, a + Math.PI, 1.25);
    }
  }

  // ----- Pavé des correspondances de la prochaine gare, à gauche -----
  const tr = TRANSFERS[next.jy];
  if (tr) {
    g.textAlign = 'left';
    g.fillStyle = '#141414';
    g.font = `bold 17px ${JP_FONT}`;
    g.fillText(`${next.kanji}駅`, 8, 217);
    g.font = `17px ${JP_FONT}`;
    g.fillStyle = '#4c4f52';
    g.fillText('乗換えのご案内', 8, 238);

    const labels = tr.jp.split('、').filter(Boolean);
    const COL = [10, 177];
    const COL_W = 160;
    let y = 262;
    let col = 0;
    g.font = `17px ${JP_FONT}`;
    for (const label of labels) {
      if (y > 400) break;
      const badgeW = label.includes('上野東京') ? 42 : 19;
      const wide = g.measureText(label).width + badgeW + 4 > COL_W;
      if (wide && col === 1) {
        col = 0;
        y += 22.3;
        if (y > 400) break;
      }
      const x = COL[col];
      const bw = drawLineBadge(g, label, x, y - 6, 18.7);
      g.fillStyle = '#141414';
      g.font = `17px ${JP_FONT}`;
      // Les libellés larges (shinkansen) prennent les deux colonnes et
      // reviennent à la ligne, comme sur l'afficheur.
      const avail = (wide ? COL_W * 2 + 17 : COL_W) - bw - 4;
      let rest = label;
      let ly = y;
      while (rest && ly <= 400) {
        let cut = rest.length;
        while (cut > 1 && g.measureText(rest.slice(0, cut)).width > avail) cut--;
        g.fillText(rest.slice(0, cut), x + bw + 4, ly);
        rest = rest.slice(cut);
        if (rest) ly += 21;
      }
      if (wide) {
        y = ly + 22.3;
        col = 0;
      } else if (col === 0) {
        col = 1;
      } else {
        col = 0;
        y += 22.3;
      }
    }
  }

  // Mention basse, cadrée à GAUCHE comme sur l'afficheur.
  g.textAlign = 'left';
  g.fillStyle = '#6f7270';
  g.font = `11px ${JP_FONT}`;
  g.fillText('のりかえ、待ち合わせ時間は含まれません。電車により多少時間が異なります。', 8, h - 12);

  // Le bandeau se dessine PAR-DESSUS : la courbe glisse dessous.
  drawHeader(g, w, index, clock, status, lang, dir);
}

// --- Écran droit, plan complet de la boucle (comme l'afficheur réel) :
// ovale vert fixe des 30 stations, noms en kanji verticaux, cercles des
// minutes pour les ~14 prochaines stations, chevron rouge = position/sens.
// Contrairement à la vue rapprochée, ce plan est géographique et identique
// dans les deux sens de marche (seuls minutes et chevron en dépendent). ---

// Position géographique fixe sur l'ovale : 15 colonnes, JY01 (東京) en bas à
// droite, JY02→JY16 le long du haut de droite à gauche, JY17→JY30 le long du
// bas de gauche à droite.
const LOOP_COLS = 15;
function loopSlot(stIdx: number): { col: number; top: boolean } {
  if (stIdx === 0) return { col: LOOP_COLS - 1, top: false };
  if (stIdx <= 15) return { col: LOOP_COLS - stIdx, top: true };
  return { col: stIdx - 16, top: false };
}

// Nom de gare en écriture verticale ; le chōonpu (ー) est pivoté comme en
// tategaki réel.
function drawVerticalName(
  g: CanvasRenderingContext2D,
  name: string,
  x: number,
  yStart: number,
  glyph: number,
  bold: boolean,
): void {
  g.font = `${bold ? 'bold ' : ''}${glyph}px ${JP_FONT}`;
  g.textAlign = 'center';
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    const base = yStart + i * glyph;
    if (ch === 'ー') {
      g.save();
      g.translate(x, base - glyph * 0.35);
      g.rotate(Math.PI / 2);
      g.fillText(ch, 0, glyph * 0.35);
      g.restore();
    } else {
      g.fillText(ch, x, base);
    }
  }
  g.textAlign = 'left';
}

/**
 * Découpe d'un nom trop long pour tenir en une colonne (高輪ゲートウェイ).
 * L'afficheur le pose sur DEUX colonnes, la suite à gauche de la première -
 * sens de lecture du tategaki. La coupe suit le changement d'écriture
 * (kanji → katakana) quand il y en a un, sinon le milieu du mot.
 */
function splitVertical(name: string): [string, string] | null {
  if (name.length <= 4) return null;
  const kata = name.search(/[゠-ヿ]/);
  const cut = kata > 0 ? kata : Math.ceil(name.length / 2);
  return [name.slice(0, cut), name.slice(cut)];
}

// Géométrie relevée du plan de boucle : quinze colonnes, la rangée haute à
// y = 247,6 et la basse à 320,3, l'anneau tracé au trait de 26.
const LOOP_X0 = 83;
const LOOP_DX = 43.15;
const LOOP_Y_TOP = 247.6;
const LOOP_Y_BOT = 320.3;
const LOOP_RING_W = 26;

const LOOP_RING_L = LOOP_X0 - 58;
const LOOP_RING_R = LOOP_X0 + (LOOP_COLS - 1) * LOOP_DX + 57;
const LOOP_RING_R_CAP = (LOOP_Y_BOT - LOOP_Y_TOP) / 2;
/** Longueur d'un côté droit de l'anneau (les colonnes y tiennent toutes). */
const LOOP_RUN = LOOP_RING_R - LOOP_RING_L - 2 * LOOP_RING_R_CAP;
const LOOP_CAP = Math.PI * LOOP_RING_R_CAP;
const LOOP_PERIM = 2 * (LOOP_RUN + LOOP_CAP);

/**
 * Abscisse curviligne d'une station sur l'anneau, comptée dans le sens
 * horaire depuis le début du côté haut.
 */
function loopArc(slot: { col: number; top: boolean }): number {
  const x = LOOP_X0 + slot.col * LOOP_DX;
  const x0 = LOOP_RING_L + LOOP_RING_R_CAP;
  return slot.top ? x - x0 : LOOP_RUN + LOOP_CAP + (LOOP_RUN - (x - x0));
}

/** Point et tangente de l'anneau à l'abscisse curviligne `t`. */
function loopPointAt(t: number): { x: number; y: number; angle: number } {
  const s = ((t % LOOP_PERIM) + LOOP_PERIM) % LOOP_PERIM;
  const x0 = LOOP_RING_L + LOOP_RING_R_CAP;
  const x1 = LOOP_RING_R - LOOP_RING_R_CAP;
  if (s < LOOP_RUN) return { x: x0 + s, y: LOOP_Y_TOP, angle: 0 };
  if (s < LOOP_RUN + LOOP_CAP) {
    const a = -Math.PI / 2 + (s - LOOP_RUN) / LOOP_RING_R_CAP;
    return {
      x: x1 + Math.cos(a) * LOOP_RING_R_CAP,
      y: LOOP_Y_TOP + LOOP_RING_R_CAP + Math.sin(a) * LOOP_RING_R_CAP,
      angle: a + Math.PI / 2,
    };
  }
  if (s < 2 * LOOP_RUN + LOOP_CAP) {
    return { x: x1 - (s - LOOP_RUN - LOOP_CAP), y: LOOP_Y_BOT, angle: Math.PI };
  }
  const a = Math.PI / 2 + (s - 2 * LOOP_RUN - LOOP_CAP) / LOOP_RING_R_CAP;
  return {
    x: x0 + Math.cos(a) * LOOP_RING_R_CAP,
    y: LOOP_Y_TOP + LOOP_RING_R_CAP + Math.sin(a) * LOOP_RING_R_CAP,
    angle: a + Math.PI / 2,
  };
}

/**
 * Marque de rupture sur un about de la boucle - le trait qui dit « l'anneau
 * continue au-delà de l'écran ».
 *
 * C'est un CHEVRON à deux segments, qui traverse le bras de l'anneau de part
 * en part : 30 de large, 6,6 de flèche, 3,2 d'épaisseur, à mi-hauteur. En
 * zigzag à trois segments il se lisait comme un éclair - un symbole qui, sur
 * un plan de ligne, veut dire tout autre chose.
 *
 * Sa pointe SUIT LE SENS DE MARCHE. C'est ce qui explique que les captures se
 * contredisent en apparence : en 内回り la rame descend l'about gauche et
 * remonte le droit (gauche ∨, droite ∧), en 外回り c'est l'inverse - et les
 * deux abouts restent symétriques par rotation d'un demi-tour, parce qu'aux
 * deux bouts de l'anneau la rame va dans des sens opposés. Ce n'était donc ni
 * une paire figée ni deux générations d'afficheur : une seule règle.
 */
function drawLoopBreak(g: CanvasRenderingContext2D, x: number, y: number, up: boolean): void {
  const f = up ? 1 : -1;
  g.strokeStyle = SCREEN_BG;
  g.lineWidth = 3.2;
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.beginPath();
  g.moveTo(x - 15, y + f * 3.3);
  g.lineTo(x, y - f * 3.3);
  g.lineTo(x + 15, y + f * 3.3);
  g.stroke();
}

export function drawLoopMap(
  s: ReturnType<typeof makeScreen>,
  index: number,
  phase: Phase,
  countdown: number,
  clock: string,
  status: ScreenStatus,
  lang: ScreenLang,
  dir: LoopDirection,
  anim = 0,
): void {
  const { g, w, h } = s;
  g.fillStyle = SCREEN_BG;
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, status, lang, dir);

  const at = (slot: { col: number; top: boolean }): [number, number] => [
    LOOP_X0 + slot.col * LOOP_DX,
    slot.top ? LOOP_Y_TOP : LOOP_Y_BOT,
  ];

  // Sens de marche le long de l'anneau, calculé une fois : il oriente le jeton
  // « ici », le chevron, ET les deux marques de rupture des abouts.
  const tNext = loopArc(loopSlot(index));
  const tAfter = loopArc(loopSlot(stationAtHop(index, 1, dir)));
  let delta = tAfter - tNext;
  if (delta > LOOP_PERIM / 2) delta -= LOOP_PERIM;
  if (delta < -LOOP_PERIM / 2) delta += LOOP_PERIM;
  const way = delta >= 0 ? 1 : -1;
  const rowAngle = (top: boolean) => (top ? 0 : Math.PI) + (way > 0 ? 0 : Math.PI);

  // Anneau vert : rectangle arrondi dont les longs côtés passent par les deux
  // rangées de stations. Les abouts débordent de 58 au-delà des colonnes
  // extrêmes, et portent chacun leur marque de rupture.
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = LOOP_RING_W;
  g.lineJoin = 'round';
  g.beginPath();
  g.roundRect(
    LOOP_RING_L,
    LOOP_Y_TOP,
    LOOP_RING_R - LOOP_RING_L,
    LOOP_Y_BOT - LOOP_Y_TOP,
    LOOP_RING_R_CAP,
  );
  g.stroke();
  const midY = LOOP_Y_TOP + LOOP_RING_R_CAP;
  // Dans le sens des abscisses curvilignes croissantes, l'about DROIT descend
  // et le GAUCHE remonte : chaque marque pointe donc du côté où la rame passe.
  drawLoopBreak(g, LOOP_RING_L, midY, way > 0);
  drawLoopBreak(g, LOOP_RING_R, midY, way < 0);

  // Rang de chaque station dans le sens de marche (0 = prochaine).
  const rank = new Array<number>(30);
  for (let k = 0; k < 30; k++) rank[stationAtHop(index, k, dir)] = k;
  const atStation = phase === 'dwell';
  const MINUTES_SHOWN = 14; // au-delà (~30 min), simple pastille grise

  for (let stIdx = 0; stIdx < 30; stIdx++) {
    const slot = loopSlot(stIdx);
    const [x, y] = at(slot);
    const k = rank[stIdx];

    // À quai, la gare où l'on est ne porte pas « 0 » : elle porte le jeton de
    // position, à la place de son cercle, pointé dans le sens de marche.
    if (atStation && k === 0) {
      if (markerLit(anim)) drawHereBlock(g, x, y, rowAngle(slot.top));
    } else if (k < MINUTES_SHOWN) {
      // Cercle des minutes. La prochaine gare est en ambre cerclé d'or ; les
      // autres en blanc ; au-delà de la portée d'affichage, un point gris.
      const minutes = etaMinutes(index, k, atStation, countdown, dir);
      g.beginPath();
      g.arc(x, y, 11.1, 0, Math.PI * 2);
      g.fillStyle = !atStation && k === 0 ? '#efc22a' : '#f6f6f4';
      g.fill();
      if (!atStation && k === 0) {
        g.strokeStyle = '#b8901c';
        g.lineWidth = 2.4;
        g.stroke();
      }
      g.fillStyle = '#141414';
      g.font = `bold 18px ${JP_FONT}`;
      g.textAlign = 'center';
      g.fillText(String(minutes), x, y + 6.5);
      // « (分) » ferme CHAQUE série numérotée : quand la suite des minutes
      // passe d'une rangée à l'autre, l'afficheur le répète en bout de
      // chacune - sinon la rangée qui n'en a pas se lit comme des numéros de
      // gare. Il se pose toujours à droite du cercle, légèrement plus bas.
      const endsRun =
        k === MINUTES_SHOWN - 1 || loopSlot(stationAtHop(index, k + 1, dir)).top !== slot.top;
      if (endsRun) {
        g.font = `10px ${JP_FONT}`;
        g.textAlign = 'left';
        g.fillText('(分)', x + 12, y + 12);
      }
    } else {
      g.beginPath();
      g.arc(x, y, 5.8, 0, Math.PI * 2);
      g.fillStyle = '#d8d8d8';
      g.fill();
    }
    g.textAlign = 'left';

    // Nom de gare : vertical, en kanji dans TOUTES les langues du cycle - sur
    // l'afficheur réel, le passage anglais ne change que le bandeau, le plan
    // reste identique au passage japonais. Il est calé sur l'anneau (rangée
    // haute : le nom finit contre la bande ; rangée basse : il commence
    // contre elle) et les gares repères sont en gras.
    g.fillStyle = '#141414';
    const bold = MAJOR_INDICES.includes(stIdx);
    const name = STATIONS[stIdx].kanji;
    const split = splitVertical(name);
    if (slot.top) {
      const glyph = Math.min(20, 73 / name.length);
      drawVerticalName(g, name, x, 222.5 - (name.length - 1) * glyph, glyph, bold);
    } else if (split) {
      // Nom long : deux colonnes, la suite À GAUCHE de la première. Chaque
      // colonne prend le corps qui lui permet de tenir dans la hauteur, donc
      // 高輪 reste lisible pendant que ゲートウェイ se serre.
      const g0 = Math.min(19, 76 / split[0].length);
      const g1 = Math.min(19, 76 / split[1].length);
      drawVerticalName(g, split[0], x + g0 * 0.55, 342.5 + g0 * 0.8, g0, bold);
      drawVerticalName(g, split[1], x - g0 * 0.55, 342.5 + g1 * 0.8, g1, bold);
    } else {
      const glyph = Math.min(19, 76 / name.length);
      drawVerticalName(g, name, x, 342.5 + glyph * 0.8, glyph, bold);
    }
  }

  // Chevron grenat DERRIÈRE la prochaine gare, sur sa rangée : position du
  // train et sens de marche. Il ne se pose pas au milieu du segment - sur
  // l'afficheur il colle au cercle de la prochaine gare, du côté d'où l'on
  // vient, et c'est ce qui se lit comme « la rame arrive ».
  // …et seulement quand on roule : à quai, c'est le jeton posé sur la gare qui
  // tient ce rôle, plus haut.
  if (!atStation && markerLit(anim)) {
    const mk = loopPointAt(tNext - way * 22);
    // Le chevron reste D'APLOMB sur sa rangée, même quand il déborde de
    // quelques pixels sur l'about arrondi : sur l'afficheur ses bords haut et
    // bas sont horizontaux, et la moindre rotation cisaille le V - à trente
    // pixels de haut, sept degrés suffisent à le rendre bancal.
    drawWayChevron(g, mk.x, mk.y, rowAngle(loopSlot(index).top));
  }
  g.textAlign = 'left';

  // Mention basse.
  g.fillStyle = '#6f7270';
  g.font = `11px ${JP_FONT}`;
  g.fillText('のりかえ、待ち合わせ時間は含まれません。電車により多少時間が異なります。', 8, h - 12);
}

// --- Écrans manières (fond clair avec bandeau, comme les vrais) ---
// La rame réelle fait tourner plusieurs visuels de courtoisie ; on en rend
// trois : téléphone en mode silencieux, sac à dos porté devant, fuite sonore
// des écouteurs. Ils partagent le gabarit pictogramme à gauche / texte à
// droite des autres écrans de courtoisie.

export function drawPhoneManner(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp', dir);
  // Téléphone barré d'un cercle d'interdiction rouge.
  const cx = w * 0.2;
  const cy = HEADER_H + (h - HEADER_H) * 0.52;
  g.fillStyle = '#3a424a';
  g.beginPath();
  g.roundRect(cx - 34, cy - 62, 68, 124, 12);
  g.fill();
  g.fillStyle = '#cfe0ec';
  g.beginPath();
  g.roundRect(cx - 26, cy - 50, 52, 92, 4);
  g.fill();
  g.strokeStyle = '#d0342c';
  g.lineWidth = 11;
  g.beginPath();
  g.arc(cx, cy, 84, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(cx - 58, cy - 58);
  g.lineTo(cx + 58, cy + 58);
  g.stroke();

  g.textAlign = 'left';
  g.fillStyle = '#26303a';
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText('マナーモードに設定のうえ、', w * 0.42, h * 0.42);
  g.fillText('通話はご遠慮ください。', w * 0.42, h * 0.58);
  g.fillStyle = '#5c646c';
  g.font = `18px ${JP_FONT}`;
  g.fillText('Please set your mobile phone to silent mode', w * 0.42, h * 0.74);
  g.fillText('and refrain from making calls.', w * 0.42, h * 0.85);
}

export function drawBackpackManner(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp', dir);
  // Silhouette portant son sac à dos sur le ventre.
  const cx = w * 0.2;
  const base = HEADER_H + (h - HEADER_H) * 0.82;
  const green = '#2f8f4e';
  g.fillStyle = green;
  g.beginPath();
  g.arc(cx, base - 156, 20, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.roundRect(cx - 22, base - 128, 44, 100, 14);
  g.fill();
  // Le sac, tenu devant, sanglé aux épaules.
  g.fillStyle = '#e8a020';
  g.beginPath();
  g.roundRect(cx + 14, base - 112, 44, 62, 10);
  g.fill();
  g.strokeStyle = '#b57708';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(cx + 4, base - 124);
  g.lineTo(cx + 30, base - 108);
  g.stroke();

  g.textAlign = 'left';
  g.fillStyle = '#26303a';
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText('リュックサックは前に抱えるか、', w * 0.4, h * 0.42);
  g.fillText('網棚をご利用ください。', w * 0.4, h * 0.58);
  g.fillStyle = '#5c646c';
  g.font = `18px ${JP_FONT}`;
  g.fillText('Please hold your backpack in front of you', w * 0.4, h * 0.74);
  g.fillText('or use the overhead racks.', w * 0.4, h * 0.85);
}

export function drawHeadphoneManner(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp', dir);
  // Tête de profil casquée, ondes rouges qui s'échappent.
  const cx = w * 0.2;
  const cy = HEADER_H + (h - HEADER_H) * 0.5;
  g.fillStyle = '#3a424a';
  g.beginPath();
  g.arc(cx, cy, 52, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#26303a';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(cx, cy - 6, 62, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  for (const dir of [-1, 1] as const) {
    g.fillStyle = '#26303a';
    g.beginPath();
    g.roundRect(cx + dir * 58 - 12, cy - 26, 24, 52, 8);
    g.fill();
  }
  g.strokeStyle = '#d0342c';
  g.lineWidth = 5;
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    g.arc(cx + 76, cy, 18 + i * 16, -Math.PI * 0.32, Math.PI * 0.32);
    g.stroke();
  }

  g.textAlign = 'left';
  g.fillStyle = '#26303a';
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText('ヘッドホンからの音もれに', w * 0.44, h * 0.42);
  g.fillText('ご注意ください。', w * 0.44, h * 0.58);
  g.fillStyle = '#5c646c';
  g.font = `18px ${JP_FONT}`;
  g.fillText('Please make sure that sound does not', w * 0.44, h * 0.74);
  g.fillText('leak from your headphones.', w * 0.44, h * 0.85);
}

// --- Écran « prochain arrêt » chinois / coréen ---
// Sur la vraie rame, les passages en chinois simplifié et en coréen du cycle
// quadrilingue n'affichent pas le plan de ligne : un écran dédié montre le nom
// de la gare en très grand avec la pastille JY. Le kanji et le romaji restent
// en petit pour se raccorder à la signalétique du quai.
export function drawNextStationLang(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  status: ScreenStatus,
  lang: 'zh' | 'ko',
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  const next = STATIONS[index];
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, status, lang, dir);

  // Pastille JY, à gauche du nom.
  const bx = 128;
  const by = HEADER_H + (h - HEADER_H) * 0.46;
  g.beginPath();
  g.arc(bx, by, 56, 0, Math.PI * 2);
  g.fillStyle = YAMANOTE_GREEN;
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 24px ${JP_FONT}`;
  g.fillText('JY', bx, by - 12);
  g.font = `bold 40px ${JP_FONT}`;
  g.fillText(next.jy.slice(2), bx, by + 28);

  // Nom géant dans la langue du cycle.
  const name = lang === 'zh' ? next.zh : next.ko;
  g.fillStyle = '#111214';
  const nx = (w + 190) / 2;
  fitText(g, name, w - 260, 88);
  g.fillText(name, nx, by + 28);

  // Rappel kanji / romaji, en petit sous le nom.
  g.fillStyle = '#5c646c';
  g.font = `22px ${JP_FONT}`;
  g.fillText(`${next.kanji}　${next.romaji}`, nx, h - 34);
  g.textAlign = 'left';
}

// --- Avertissement de fermeture des portes (fin d'arrêt) ---
// Diffusé sur les deux parois dans les dernières secondes à quai, juste avant
// le départ : vantaux qui se referment, flèches convergentes ambre.
export function drawDoorClosing(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'now', 'jp', dir);

  const cy = h * 0.56;
  const dw = 62;
  const gap = 34; // entrouverts : en train de se refermer
  for (const dir of [-1, 1]) {
    g.fillStyle = '#9aa3ab';
    g.strokeStyle = '#5d666e';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(w / 2 + dir * (gap / 2) - (dir < 0 ? dw : 0), cy - 58, dw, 116, 6);
    g.fill();
    g.stroke();
  }

  // Flèches ambre convergentes, pointées vers la fermeture.
  g.fillStyle = '#e8a020';
  for (const dir of [-1, 1]) {
    const bx = w / 2 + dir * 150;
    g.beginPath();
    g.moveTo(bx - dir * 66, cy);
    g.lineTo(bx, cy - 44);
    g.lineTo(bx, cy - 18);
    g.lineTo(bx + dir * 62, cy - 18);
    g.lineTo(bx + dir * 62, cy + 18);
    g.lineTo(bx, cy + 18);
    g.lineTo(bx, cy + 44);
    g.closePath();
    g.fill();
  }

  g.textAlign = 'center';
  g.fillStyle = '#14181c';
  g.font = `bold 34px ${JP_FONT}`;
  g.fillText('ドアが閉まります。ご注意ください。', w / 2, h - 54);
  g.fillStyle = '#5c646c';
  g.font = `22px ${JP_FONT}`;
  g.fillText('The doors are closing. Please stand clear.', w / 2, h - 22);
  g.textAlign = 'left';
}

// --- Écran d'approche (まもなく / Arriving at) : plan du quai --------------
//
// C'est l'écran le plus utile de tout le cycle, et c'était le plus faux. Il
// n'y avait ici qu'un « côté d'ouverture » abstrait - deux vantaux gris et des
// flèches - et, à part, un plan de quai à bandeau orange que l'afficheur réel
// n'a jamais eu. Le vrai écran est UN SEUL : un plan de quai en plongée, sur
// fond bleu nuit, où l'on lit d'un coup où sont les accès, où s'arrête SA
// voiture par rapport à eux, et de quel côté les portes vont s'ouvrir.
//
// De haut en bas : le bandeau habituel ; une bande claire portant les
// cartouches jaunes qui NOMMENT les accès ; le quai lui-même, avec ses
// pictogrammes reliés à leur cartouche par une suspente ; la rame en onze
// cases numérotées, celle du voyageur en rouge, avec le triangle du sens de
// marche en bout ; puis, en bandeau bas, l'avis d'ouverture des portes (passage
// japonais) ou la liste des correspondances (passage anglais).
//
// Les accès ne sont plus tirés au sort : ce sont ceux de `stationLayouts`,
// donc EXACTEMENT ceux que le joueur voit en descendant, et le nom du portillon
// vient du relevé de `stationInterior`. Un plan de quai qui ment sur le quai
// qu'on a sous les yeux ne vaut pas mieux que pas de plan.
const APPROACH_BAND_Y = HEADER_H;
const APPROACH_BAND_H = 39;
const APPROACH_PLAT_Y = APPROACH_BAND_Y + APPROACH_BAND_H;
const APPROACH_PLAT_H = 115;
const APPROACH_CARS_Y = 291;
const APPROACH_CARS_H = 35;
const APPROACH_FOOT_Y = 328;
/**
 * Échelle du plan : la rame (onze voitures de 20 m) tient dans 660 px, centrés.
 * C'est ELLE qui donne l'échelle du quai, pas l'inverse - les pictogrammes
 * d'accès s'y accrochent, sinon un escalier annoncé « devant la 4 » ne tombe
 * pas devant la case 4.
 */
const APPROACH_PX_PER_M = 660 / (CONSIST.length * E235.pitch);

/**
 * Escalier fixe, vu en plongée : le PROFIL en marches, pas une série de
 * barres. Dessiné en colonnes de hauteur croissante, le pictogramme se lisait
 * comme un histogramme ; ce qui fait l'escalier, c'est la ligne brisée
 * giron-contremarche qui court le long du dessus.
 */
function drawStairGlyph(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const n = 4;
  const step = s / n;
  g.beginPath();
  g.moveTo(x - s / 2, y + s * 0.5);
  for (let i = 0; i < n; i++) {
    g.lineTo(x - s / 2 + i * step, y + s * 0.5 - (i + 1) * step);
    g.lineTo(x - s / 2 + (i + 1) * step, y + s * 0.5 - (i + 1) * step);
  }
  g.lineTo(x + s / 2, y + s * 0.5);
  g.closePath();
  g.fillStyle = '#eef2fb';
  g.fill();
  g.strokeStyle = '#33427a';
  g.lineWidth = 1.2;
  g.stroke();
}

/** Escalier mécanique : la même volée, mais lissée en rampe, avec sa pastille. */
function drawEscalatorGlyph(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = '#eef2fb';
  g.strokeStyle = '#33427a';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x - s * 0.46, y + s * 0.45);
  g.lineTo(x + s * 0.18, y - s * 0.45);
  g.lineTo(x + s * 0.46, y - s * 0.45);
  g.lineTo(x + s * 0.46, y + s * 0.45);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#33427a';
  g.beginPath();
  g.arc(x - s * 0.26, y + s * 0.26, s * 0.12, 0, Math.PI * 2);
  g.fill();
}

/** Ascenseur : cabine et double flèche. */
function drawElevatorGlyph(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = '#eef2fb';
  g.strokeStyle = '#3a4a78';
  g.lineWidth = 1;
  g.beginPath();
  g.rect(x - s * 0.32, y - s * 0.5, s * 0.64, s);
  g.fill();
  g.stroke();
  g.fillStyle = '#3a4a78';
  g.beginPath();
  g.moveTo(x - s * 0.14, y - s * 0.06);
  g.lineTo(x - s * 0.02, y - s * 0.3);
  g.lineTo(x + s * 0.1, y - s * 0.06);
  g.closePath();
  g.moveTo(x - s * 0.14, y + s * 0.1);
  g.lineTo(x - s * 0.02, y + s * 0.34);
  g.lineTo(x + s * 0.1, y + s * 0.1);
  g.closePath();
  g.fill();
}

interface Access {
  x: number;
  kind: 'stair' | 'escalator' | 'elevator';
}

/**
 * L'écran d'approche N'EST PAS FIXE, et c'est la moitié de ce qu'il dit.
 *
 * Les deux vantaux du pictogramme s'écartent, tiennent ouverts le temps qu'un
 * triangle rouge sorte du seuil, puis se referment ; le même triangle
 * apparaît, au même instant, au-dessus de la case rouge de la rame. Un
 * pictogramme figé n'annonce pas une ouverture, il décrit une porte.
 *
 * Quatre phases relevées sur trois images de la séquence : le débattement des
 * vantaux (2 → 12 → 31 px depuis l'axe) n'est pas linéaire - l'ouverture
 * s'accélère, comme une vraie porte pneumatique.
 */
const DOOR_PHASES = [2, 12, 31, 12];
const doorPhase = (anim: number): number => anim % DOOR_PHASES.length;

/** Le pictogramme de portes du bandeau bas, à la phase `anim`. */
function drawDoorGlyph(g: CanvasRenderingContext2D, mine: boolean, anim: number): void {
  const phase = doorPhase(anim);
  const off = DOOR_PHASES[phase];
  const cx = 150;
  const top = 333;
  const bot = 418;
  const leafW = 46;
  const open = off > 4;

  // Seuil jaune, fixe : c'est le quai, il ne bouge pas avec les portes.
  g.fillStyle = '#e8c81e';
  g.fillRect(cx - 58, bot, 116, 10);

  // Baie visible entre les vantaux dès qu'ils s'écartent, et le triangle rouge
  // qui en sort une fois grande ouverte.
  if (open) {
    g.fillStyle = '#1c4a86';
    g.fillRect(cx - off, bot - 23, off * 2, 23);
    if (phase === 2) {
      g.fillStyle = '#c4232b';
      g.beginPath();
      g.moveTo(cx - 22, bot - 1);
      g.lineTo(cx, bot - 18);
      g.lineTo(cx + 22, bot - 1);
      g.closePath();
      g.fill();
    }
  }

  for (const sgn of [-1, 1] as const) {
    const inner = cx + sgn * off;
    const lx = sgn < 0 ? inner - leafW : inner;
    // Corps du vantail, puis sa vitre, puis le joint jaune du bord d'attaque.
    g.fillStyle = '#e2e9f4';
    g.strokeStyle = '#9fb0cb';
    g.lineWidth = 1;
    g.fillRect(lx, top, leafW, bot - top);
    g.strokeRect(lx + 0.5, top + 0.5, leafW - 1, bot - top - 1);
    const win = g.createLinearGradient(0, top + 5, 0, top + 52);
    win.addColorStop(0, '#0d3a72');
    win.addColorStop(1, '#bcd8ef');
    g.fillStyle = win;
    g.fillRect(lx + 6, top + 5, leafW - 12, 47);
    g.fillStyle = '#e8d022';
    g.fillRect(sgn < 0 ? inner - 4 : inner, top, 4, bot - top);
  }

  // Flèches : elles suivent les vantaux, et ne sortent que du côté qui ouvre.
  if (mine) {
    g.fillStyle = '#eef2fa';
    for (const sgn of [-1, 1] as const) {
      const tail = cx + sgn * (off + leafW + 8);
      const tip = tail + sgn * 22;
      const my = (top + bot) / 2;
      g.beginPath();
      g.moveTo(tip, my);
      g.lineTo(tail + sgn * 9, my - 13);
      g.lineTo(tail + sgn * 9, my - 6);
      g.lineTo(tail, my - 6);
      g.lineTo(tail, my + 6);
      g.lineTo(tail + sgn * 9, my + 6);
      g.lineTo(tail + sgn * 9, my + 13);
      g.closePath();
      g.fill();
    }
  }
}

export function drawApproach(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: 'jp' | 'en',
  mine: boolean,
  dir: LoopDirection,
  anim: number,
): void {
  const { g, w, h } = s;
  const next = STATIONS[index];
  const layout = layoutFor(index);
  const gate = gateNameFor(index);
  const hasTransfer = Boolean(TRANSFERS[next.jy]);

  g.fillStyle = '#0a1738';
  g.fillRect(0, 0, w, h);

  // --- Le quai, en plongée : dégradé bleu et bandes podotactiles jaunes.
  const grad = g.createLinearGradient(0, APPROACH_PLAT_Y, 0, APPROACH_PLAT_Y + APPROACH_PLAT_H);
  grad.addColorStop(0, '#4a63a8');
  grad.addColorStop(0.55, '#8b9ccb');
  grad.addColorStop(1, '#5d72b0');
  g.fillStyle = grad;
  g.fillRect(0, APPROACH_PLAT_Y, w, APPROACH_PLAT_H);
  g.strokeStyle = '#d8c65a';
  g.lineWidth = 1.6;
  g.setLineDash([7, 6]);
  for (const y of [APPROACH_PLAT_Y + 8, APPROACH_PLAT_Y + APPROACH_PLAT_H - 8]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.setLineDash([]);

  // --- Repère longitudinal : le quai fait `layout.length` mètres et la rame
  // roule vers les z DÉCROISSANTS, donc la tête de rame (voiture 1) se pose à
  // DROITE de l'écran, comme le triangle du sens de marche.
  const scale = APPROACH_PX_PER_M;
  const cx = w / 2;
  const px = (z: number) => cx - z * scale;

  // --- Les accès relevés de la gare, du plus à gauche au plus à droite.
  const am = layout.amenities;
  const access: Access[] = [
    ...am.stairs.map((z) => ({ x: px(z), kind: 'stair' as const })),
    ...am.escalators.map((z) => ({ x: px(z), kind: 'escalator' as const })),
    ...(am.elevator !== null ? [{ x: px(am.elevator), kind: 'elevator' as const }] : []),
  ].sort((a, b) => a.x - b.x);

  const glyphY = APPROACH_PLAT_Y + APPROACH_PLAT_H * 0.6;
  for (const a of access) {
    const draw =
      a.kind === 'stair' ? drawStairGlyph : a.kind === 'escalator' ? drawEscalatorGlyph : drawElevatorGlyph;
    draw(g, a.x, glyphY, 46);
  }

  // --- Cartouches jaunes : un par GROUPE d'accès voisins, relié à chacun par
  // une suspente. Le groupe le plus proche d'un about porte en plus le nom du
  // portillon, avec sa ligne anglaise - c'est la seule légende bilingue de
  // l'écran, et c'est celle qu'on cherche quand on veut sortir.
  const groups: Access[][] = [];
  for (const a of access) {
    const last = groups[groups.length - 1];
    if (last && a.x - last[last.length - 1].x < 62) last.push(a);
    else groups.push([a]);
  }
  const gateGroup = groups.reduce((best, gr) =>
    Math.abs(gr[0].x - cx) > Math.abs(best[0].x - cx) ? gr : best,
  );

  g.fillStyle = '#c3d4f4';
  g.fillRect(0, APPROACH_BAND_Y, w, APPROACH_BAND_H);
  const ly = APPROACH_BAND_Y + 4;
  const lh = APPROACH_BAND_H - 8;

  // Les cartouches sont d'abord CALCULÉS, puis désempilés : deux accès voisins
  // donnaient deux étiquettes qui se chevauchaient, et un plan de quai illisible
  // à l'endroit précis où il compte le plus.
  const boxes = groups.map((gr) => {
    const isGate = gr === gateGroup;
    // Le groupe se nomme par son accès le plus « fort » : un escalier de
    // correspondance prime sur l'escalier mécanique, qui prime sur l'ascenseur.
    const kinds = new Set(gr.map((a) => a.kind));
    const base =
      kinds.has('stair') ? (hasTransfer ? 'のりかえ階段' : '階段')
      : kinds.has('escalator') ? 'エスカレーター'
      : 'エレベーター';
    const label = base + (isGate ? `・${gate.jp}` : '');
    g.font = `13px ${JP_FONT}`;
    const tw = Math.min(232, g.measureText(label).width + 14);
    const gx = gr.reduce((sum, a) => sum + a.x, 0) / gr.length;
    return { gr, isGate, label, tw, x: gx - tw / 2 };
  });
  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1];
    boxes[i].x = Math.max(boxes[i].x, prev.x + prev.tw + 6);
  }
  // Si la file déborde à droite, on la repousse en bloc vers la gauche.
  const overflow = boxes.length ? boxes[boxes.length - 1].x + boxes[boxes.length - 1].tw - (w - 4) : 0;
  if (overflow > 0) for (let i = boxes.length - 1; i >= 0; i--) boxes[i].x -= overflow;
  for (let i = 1; i < boxes.length; i++) {
    boxes[i - 1].x = Math.min(boxes[i - 1].x, boxes[i].x - boxes[i - 1].tw - 6);
  }

  for (const b of boxes) {
    const lx = Math.max(4, b.x);

    // Suspentes : du bas du cartouche à chaque pictogramme.
    g.strokeStyle = '#dde5f7';
    g.lineWidth = 1.6;
    for (const a of b.gr) {
      g.beginPath();
      g.moveTo(Math.max(lx + 4, Math.min(lx + b.tw - 4, a.x)), ly + lh);
      g.lineTo(a.x, glyphY - 20);
      g.stroke();
    }

    g.fillStyle = '#f4e34a';
    g.fillRect(lx, ly, b.tw, lh);
    g.fillStyle = '#1a1a10';
    g.textAlign = 'center';
    fitText(g, b.label, b.tw - 10, 13, '');
    g.fillText(b.label, lx + b.tw / 2, b.isGate ? ly + 15 : ly + 20);
    if (b.isGate) {
      g.font = `9px ${JP_FONT}`;
      fitText(g, `${gate.romaji} Gate`, b.tw - 10, 9, '');
      g.fillText(`${gate.romaji} Gate`, lx + b.tw / 2, ly + 26);
    }
    g.textAlign = 'left';
  }

  // --- La rame : une seule barre en gélule, divisée en onze cases. Ce ne sont
  // PAS onze pastilles séparées - les cases se touchent, et seules les deux du
  // bout sont arrondies. La case du voyageur est rouge, et le triangle qui la
  // désigne CLIGNOTE avec l'ouverture des portes du bandeau bas : c'est la
  // même information, dite deux fois au même moment.
  g.fillStyle = '#c3d4f4';
  g.fillRect(0, APPROACH_CARS_Y, w, APPROACH_CARS_H);
  const boxW = E235.pitch * scale;
  const boxY = APPROACH_CARS_Y + 4;
  const boxH = APPROACH_CARS_H - 8;
  const cap = boxH / 2;
  for (let i = 0; i < CONSIST.length; i++) {
    const bx = px(carZ(i)) - boxW / 2;
    const isMine = i === PLAYER_CAR;
    const first = i === CONSIST.length - 1; // voiture 11 : bout gauche
    const last = i === 0; // voiture 1 : bout droit
    g.fillStyle = isMine ? '#c4232b' : '#f2f5fc';
    g.strokeStyle = isMine ? '#e8909a' : '#5a6a92';
    g.lineWidth = 1.4;
    g.beginPath();
    g.roundRect(bx, boxY, boxW, boxH, [first ? cap : 3, last ? cap : 3, last ? cap : 3, first ? cap : 3]);
    g.fill();
    g.stroke();
    g.fillStyle = isMine ? '#ffffff' : '#14203f';
    g.textAlign = 'center';
    g.font = `italic bold 17px ${JP_FONT}`;
    g.fillText(String(CONSIST[i].no), bx + boxW / 2, APPROACH_CARS_Y + 25);
    if (isMine && doorPhase(anim) === 2) {
      g.fillStyle = '#c4232b';
      g.beginPath();
      g.moveTo(bx + boxW / 2 - 12, boxY);
      g.lineTo(bx + boxW / 2, boxY - 14);
      g.lineTo(bx + boxW / 2 + 12, boxY);
      g.closePath();
      g.fill();
    }
  }
  g.textAlign = 'left';
  g.fillStyle = '#14203f';
  const tipX = px(carZ(0)) + boxW / 2 + 7;
  g.beginPath();
  g.moveTo(tipX, APPROACH_CARS_Y + 7);
  g.lineTo(tipX + 13, APPROACH_CARS_Y + APPROACH_CARS_H / 2);
  g.lineTo(tipX, APPROACH_CARS_Y + APPROACH_CARS_H - 7);
  g.closePath();
  g.fill();

  // --- Bandeau bas : avis d'ouverture (jp) ou correspondances (en).
  if (lang === 'jp') {
    const foot = g.createLinearGradient(0, APPROACH_FOOT_Y, 0, h);
    foot.addColorStop(0, '#0d1f55');
    foot.addColorStop(1, '#050d2a');
    g.fillStyle = foot;
    g.fillRect(0, APPROACH_FOOT_Y, w, h - APPROACH_FOOT_Y);

    drawDoorGlyph(g, mine, anim);

    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    const jp = mine ? 'こちら側のドアが開きます' : '反対側のドアが開きます';
    fitText(g, jp, w - 316, 34, '');
    g.fillText(jp, 300, APPROACH_FOOT_Y + 42);
    g.fillStyle = '#b9c6e8';
    const en = mine ? 'Doors on this side will open.' : 'Doors on the other side will open.';
    fitText(g, en, w - 316, 21, '');
    g.fillText(en, 302, APPROACH_FOOT_Y + 72);
  } else {
    g.fillStyle = '#c3d4f4';
    g.fillRect(0, APPROACH_FOOT_Y, w, h - APPROACH_FOOT_Y);
    const labels = (TRANSFERS[next.jy]?.jp ?? '').split('、').filter(Boolean).slice(0, 6);
    if (labels.length === 0) {
      g.fillStyle = '#2b3a63';
      g.font = `20px ${JP_FONT}`;
      g.textAlign = 'center';
      g.fillText('のりかえの路線はありません', w / 2, APPROACH_FOOT_Y + 58);
      g.textAlign = 'left';
      return;
    }
    // Les lignes s'alignent en rangées, chacune sous son sigle.
    let x = 24;
    let y = APPROACH_FOOT_Y + 34;
    g.font = `17px ${JP_FONT}`;
    for (const label of labels) {
      const tw = g.measureText(label).width;
      if (x + 26 + tw > w - 16) {
        x = 24;
        y += 34;
      }
      if (y > h - 10) break;
      const bw = drawLineBadge(g, label, x, y - 6, 19);
      g.fillStyle = '#14203f';
      g.font = `17px ${JP_FONT}`;
      g.textAlign = 'left';
      g.fillText(label, x + bw + 5, y);
      x += bw + 5 + tw + 26;
    }
  }
  g.textAlign = 'left';

  // Le bandeau se dessine EN DERNIER : le quai file dessous.
  drawHeader(g, w, index, clock, 'soon', lang, dir);
}

// --- État « correspondances à la prochaine gare » ---
// Chaque ligne en correspondance porte son sigle officiel (cf. LINE_BADGES).
export function drawTransfers(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  const next = STATIONS[index];
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp', dir);

  g.fillStyle = '#dfe6ea';
  g.fillRect(0, HEADER_H, w, 40);
  g.fillStyle = '#26303a';
  g.font = `bold 23px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText(`${next.kanji}のりかえ  /  Transfer at ${next.romaji}`, 16, HEADER_H + 28);

  const lines = (TRANSFERS[next.jy]?.jp ?? '').split('、').filter(Boolean).slice(0, 8);
  if (lines.length === 0) {
    g.fillStyle = '#5c646c';
    g.font = `26px ${JP_FONT}`;
    g.fillText('のりかえの路線はありません', 24, h * 0.66);
    return;
  }
  const cols = 2;
  const cw = (w - 48) / cols;
  lines.forEach((label, i) => {
    const cx = 24 + (i % cols) * cw;
    const cy = HEADER_H + 68 + Math.floor(i / cols) * 44;
    const bw = drawLineBadge(g, label, cx, cy - 8, 32);
    g.textAlign = 'left';
    g.fillStyle = '#26303a';
    fitText(g, label, cw - bw - 36, 23, '');
    g.fillText(label, cx + bw + 12, cy);
  });
}

// --- Écrans de courtoisie : places prioritaires et embarquement ---
export function drawPriorityNotice(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp', dir);
  // Rangée de silhouettes : canne, femme enceinte, bébé, blessé.
  const base = h * 0.56;
  const blue = '#1f5fa8';
  for (let i = 0; i < 4; i++) {
    const cx = w * (0.16 + i * 0.14);
    g.fillStyle = blue;
    g.beginPath();
    g.arc(cx, base - 76, 15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.roundRect(cx - 16, base - 56, 32, 56, 10);
    g.fill();
    if (i === 1) {
      g.beginPath();
      g.arc(cx + 14, base - 26, 13, 0, Math.PI * 2);
      g.fill();
    }
    if (i === 0) {
      g.lineWidth = 5;
      g.strokeStyle = blue;
      g.beginPath();
      g.moveTo(cx + 24, base - 60);
      g.lineTo(cx + 24, base + 6);
      g.stroke();
    }
  }
  g.fillStyle = '#1f5fa8';
  g.font = `bold 44px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText('優先席', w * 0.66, base - 30);
  g.fillStyle = '#26303a';
  g.font = `22px ${JP_FONT}`;
  g.fillText('おゆずりください。', w * 0.66, base + 4);
  g.font = `18px ${JP_FONT}`;
  g.fillStyle = '#5c646c';
  g.fillText('Priority Seat', w * 0.66, base + 34);
}

export function drawSafetyNotice(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp', dir);
  // Bande podotactile jaune et file de voyageurs qui attendent derrière.
  const base = h - 46;
  g.fillStyle = '#f2c521';
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.roundRect(w * 0.06 + i * 34, base - 8 + i * 2, 26, 12, 3);
    g.fill();
  }
  const green = '#2f8f4e';
  for (let i = 0; i < 4; i++) {
    const cx = w * 0.1 + i * 46;
    g.fillStyle = green;
    g.beginPath();
    g.arc(cx, base - 96, 14, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.roundRect(cx - 15, base - 78, 30, 54, 9);
    g.fill();
  }
  g.fillStyle = '#26303a';
  g.textAlign = 'left';
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText('かけこみ乗車は', w * 0.44, h * 0.46);
  g.fillText('おやめください。', w * 0.44, h * 0.62);
  g.fillStyle = '#5c646c';
  g.font = `18px ${JP_FONT}`;
  g.fillText('Please do not rush onto the train.', w * 0.44, h * 0.78);
}


// --- Information trafic (運行情報) ---
// L'afficheur réel relaie les perturbations de TOUTE la région de Tokyo, pas
// seulement de la Yamanote - c'est presque toujours une autre ligne qui est
// touchée. C'est aussi ce qui permet de rendre cet état honnêtement : notre
// rame roule à l'heure, l'avis concerne un réseau voisin et se conclut par la
// mention « la Yamanote circule normalement », comme en vrai.
interface TrafficNotice {
  lineJp: string;
  lineEn: string;
  reasonJp: string;
  reasonEn: string;
}

const OTHER_LINES: { jp: string; en: string; color: string }[] = [
  { jp: '東急池上線', en: 'Tokyu Ikegami Line', color: '#ee86a7' },
  { jp: '中央線快速', en: 'Chuo Line (Rapid)', color: '#f15a24' },
  { jp: '京王線', en: 'Keio Line', color: '#d31e79' },
  { jp: '埼京線', en: 'Saikyo Line', color: '#00ac9a' },
  { jp: '東京メトロ東西線', en: 'Tokyo Metro Tozai Line', color: '#009bbf' },
  { jp: '京成本線', en: 'Keisei Main Line', color: '#005aaa' },
];
const DELAY_REASONS: [string, string][] = [
  ['信号確認', 'a signal check'],
  ['車内点検', 'an on-board inspection'],
  ['踏切安全確認', 'a crossing safety check'],
  ['混雑', 'congestion'],
];

// Une perturbation existe (ou non) par tranche de 30 minutes d'horloge : le
// tirage est déterministe, les faces japonaise et anglaise décrivent donc le
// même incident, et la plupart des tranches n'en ont aucun.
export function trafficNotice(clockMin: number): TrafficNotice | null {
  const slot = Math.floor(clockMin / 30);
  const r = rng(4200 + slot);
  if (r() > 0.34) return null;
  const line = OTHER_LINES[Math.floor(r() * OTHER_LINES.length)];
  const [reasonJp, reasonEn] = DELAY_REASONS[Math.floor(r() * DELAY_REASONS.length)];
  return { lineJp: line.jp, lineEn: line.en, reasonJp, reasonEn };
}

export function drawTrafficInfo(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: ScreenLang,
  notice: TrafficNotice,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang, dir);

  // Triangle d'avertissement jaune.
  const tx = 96;
  const ty = h * 0.52;
  g.fillStyle = '#f2c521';
  g.strokeStyle = '#3a3418';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(tx, ty - 52);
  g.lineTo(tx + 56, ty + 44);
  g.lineTo(tx - 56, ty + 44);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#221f10';
  g.textAlign = 'center';
  g.font = `bold 56px ${JP_FONT}`;
  g.fillText('!', tx, ty + 30);

  g.textAlign = 'left';
  g.fillStyle = '#14181c';
  g.font = `bold 40px ${JP_FONT}`;
  g.fillText(lang === 'jp' ? '運行情報' : 'Traffic Information', 190, ty - 26);
  g.font = `22px ${JP_FONT}`;
  g.fillStyle = '#26303a';
  if (lang === 'jp') {
    g.fillText(`${notice.lineJp}は、${notice.reasonJp}のため、`, 190, ty + 14);
    g.fillText('遅れが出ています。', 190, ty + 46);
    g.fillStyle = '#2f8f4e';
    g.font = `20px ${JP_FONT}`;
    g.fillText('山手線は平常どおり運転しています。', 190, ty + 84);
  } else {
    fitText(g, `The ${notice.lineEn} is delayed`, w - 210, 22, '');
    g.fillText(`The ${notice.lineEn} is delayed`, 190, ty + 14);
    g.fillText(`due to ${notice.reasonEn}.`, 190, ty + 46);
    g.fillStyle = '#2f8f4e';
    g.font = `20px ${JP_FONT}`;
    g.fillText('The Yamanote Line is operating on schedule.', 190, ty + 84);
  }
}

// --- Arrêt d'urgence (急停車) ---
// Affiché en boucle JP/EN tant que l'arrêt d'urgence est actif : cadre rouge,
// pastille d'alerte, motif de l'arrêt - c'est l'écran rouge du vrai afficheur
// quand la rame elle-même est immobilisée.
export function drawEmergencyInfo(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: ScreenLang,
  reason: number,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  const r = EMERGENCY_REASONS[((reason % EMERGENCY_REASONS.length) + EMERGENCY_REASONS.length) % EMERGENCY_REASONS.length];
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang, dir);

  // Cadre rouge plein écran sous le bandeau.
  g.strokeStyle = '#c8362c';
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(18, HEADER_H + 16, w - 36, h - HEADER_H - 32, 10);
  g.stroke();

  // Pastille d'alerte + titre rouge.
  const ty = HEADER_H + 62;
  g.fillStyle = '#c8362c';
  g.beginPath();
  g.arc(66, ty - 10, 21, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText('!', 66, ty);
  g.textAlign = 'left';
  g.fillStyle = '#c8362c';
  g.font = `bold 34px ${JP_FONT}`;
  g.fillText(lang === 'jp' ? '運転を見合わせています' : 'Service Suspended', 104, ty);

  // Motif et consignes.
  g.fillStyle = '#26303a';
  g.font = `23px ${JP_FONT}`;
  if (lang === 'jp') {
    g.fillText(`ただいま、${r.jp}のため、急停車いたしました。`, 48, ty + 56);
    g.fillText('安全の確認を行っています。運転再開まで、', 48, ty + 92);
    g.fillText('いましばらくお待ちください。', 48, ty + 128);
  } else {
    g.fillText(`This train has made an emergency stop`, 48, ty + 56);
    g.fillText(`due to ${r.en}. Safety checks are under way.`, 48, ty + 92);
    g.fillText('We apologize for the inconvenience.', 48, ty + 128);
  }
}

// --- Coupure de caténaire (停電) ---
// Le pendant du précédent, et il ne s'affiche JAMAIS pendant la coupure : une
// dalle sans courant ne montre rien. Il n'apparaît qu'au retour de la tension,
// pendant que la rame se relance - c'est-à-dire au moment exact où l'écran
// rallumé a quelque chose à rattraper.
export function drawOutageInfo(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: ScreenLang,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang, dir);

  g.strokeStyle = '#c8362c';
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(18, HEADER_H + 16, w - 36, h - HEADER_H - 32, 10);
  g.stroke();

  const ty = HEADER_H + 62;
  g.fillStyle = '#c8362c';
  g.beginPath();
  g.arc(66, ty - 10, 21, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText('!', 66, ty);
  g.textAlign = 'left';
  g.fillStyle = '#c8362c';
  g.font = `bold 34px ${JP_FONT}`;
  g.fillText(lang === 'jp' ? '停電による停車' : 'Stopped: Power Failure', 104, ty);

  g.fillStyle = '#26303a';
  g.font = `23px ${JP_FONT}`;
  if (lang === 'jp') {
    g.fillText('架線の停電のため、停車しておりました。', 48, ty + 56);
    g.fillText('電力が復旧いたしましたので、', 48, ty + 92);
    g.fillText('まもなく運転を再開いたします。', 48, ty + 128);
  } else {
    g.fillText('This train was stopped by a power failure', 48, ty + 56);
    g.fillText('on the overhead line. Power has been restored', 48, ty + 92);
    g.fillText('and service will resume shortly.', 48, ty + 128);
  }
}

// --- État des autres lignes (他線区の運行情報) ---
// La liste ligne par ligne du vrai afficheur : pastille de couleur, nom, et
// statut - la ligne perturbée en ambre, les autres « 平常運転 ».
export function drawLineStatus(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: ScreenLang,
  notice: TrafficNotice,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang, dir);

  g.fillStyle = '#26303a';
  g.fillRect(0, HEADER_H, w, 40);
  g.fillStyle = '#ffffff';
  g.font = `bold 22px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText(lang === 'jp' ? '他線区の運行情報' : 'Service Status - Other Lines', 16, HEADER_H + 29);

  // La Yamanote d'abord, puis la ligne perturbée, puis les autres.
  const rows: { jp: string; en: string; color: string; delayed: boolean }[] = [
    { jp: '山手線', en: 'Yamanote Line', color: YAMANOTE_GREEN, delayed: false },
    ...OTHER_LINES
      .slice()
      .sort((a, b) => Number(b.jp === notice.lineJp) - Number(a.jp === notice.lineJp))
      .slice(0, 5)
      .map((l) => ({ ...l, delayed: l.jp === notice.lineJp })),
  ];

  let y = HEADER_H + 70;
  for (const row of rows) {
    g.fillStyle = row.color;
    g.beginPath();
    g.roundRect(20, y - 20, 26, 26, 5);
    g.fill();
    g.fillStyle = '#26303a';
    g.font = `22px ${JP_FONT}`;
    fitText(g, lang === 'jp' ? row.jp : row.en, w - 300, 22, '');
    g.fillText(lang === 'jp' ? row.jp : row.en, 60, y);
    g.textAlign = 'right';
    if (row.delayed) {
      g.fillStyle = '#e8a020';
      g.beginPath();
      g.roundRect(w - 170, y - 24, 150, 32, 6);
      g.fill();
      g.fillStyle = '#241c08';
      g.font = `bold 20px ${JP_FONT}`;
      g.fillText(lang === 'jp' ? '遅延' : 'Delayed', w - 36, y);
    } else {
      g.fillStyle = '#2f8f4e';
      g.font = `20px ${JP_FONT}`;
      g.fillText(lang === 'jp' ? '平常運転' : 'On schedule', w - 24, y);
    }
    g.textAlign = 'left';
    y += 37;
  }
}

// --- Certificat de retard (遅延証明書) ---
// L'écran renvoie le voyageur vers le site de l'exploitant de la ligne
// perturbée, sans nommer aucune compagnie : le certificat existe chez tous les
// opérateurs de Tokyo, l'écran suit donc n'importe quelle perturbation.
export function drawDelayCert(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: ScreenLang,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang, dir);

  // Pictogramme : feuille à coin plié, marquée 証.
  const px = 110;
  const py = HEADER_H + (h - HEADER_H) * 0.5;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#5b6a76';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(px - 44, py - 62);
  g.lineTo(px + 20, py - 62);
  g.lineTo(px + 44, py - 38);
  g.lineTo(px + 44, py + 62);
  g.lineTo(px - 44, py + 62);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(px + 20, py - 62);
  g.lineTo(px + 20, py - 38);
  g.lineTo(px + 44, py - 38);
  g.stroke();
  g.fillStyle = '#1f5fa8';
  g.textAlign = 'center';
  g.font = `bold 44px ${JP_FONT}`;
  g.fillText('証', px, py + 26);

  g.textAlign = 'left';
  g.fillStyle = '#14181c';
  g.font = `bold 36px ${JP_FONT}`;
  g.fillText(lang === 'jp' ? '遅延証明書のご案内' : 'Delay Certificates', 200, py - 30);
  g.fillStyle = '#26303a';
  g.font = `22px ${JP_FONT}`;
  if (lang === 'jp') {
    g.fillText('遅延証明書は、各鉄道会社のホームページで', 200, py + 12);
    g.fillText('発行しています。', 200, py + 44);
  } else {
    g.fillText('Delay certificates are issued on the', 200, py + 12);
    g.fillText("operating company's website.", 200, py + 44);
  }
  g.fillStyle = '#5c646c';
  g.font = `18px ${JP_FONT}`;
  g.fillText(lang === 'jp' ? '詳しくは駅係員まで' : 'Ask station staff for details', 200, py + 82);
}

