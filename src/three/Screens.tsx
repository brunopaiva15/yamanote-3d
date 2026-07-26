// Doubles écrans LCD au-dessus des portes (E235) : écran gauche = publicités
// en boucle (comme dans les vraies rames, il n'affiche jamais la prochaine
// station), écran droit = écran de ligne fidèle au vrai afficheur JR East,
// qui alterne comme dans la réalité entre quatre états : vue rapprochée des
// 5 prochaines stations (arc vert, minutes, correspondances), plan complet
// de la boucle (30 stations, minutes jusqu'à ~30 min), bandeau manières, et
// — à l'approche et à quai — le PLAN DU QUAI, qui montre où s'arrête chaque
// voiture par rapport aux escaliers et aux sorties.
// Deux CanvasTexture partagées, redessinées uniquement aux changements.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { STATIONS, TRANSFERS } from '../data/stations';
import { useStore, type Phase } from '../store';
import { runtime } from '../systems/runtime';
import { JP_FONT, drawAdInto, rng } from '../textures/procedural';

const YAMANOTE_GREEN = '#80c241';

// Rame de onze voitures ; le voyageur est dans la 3e, comme l'annonce le bandeau.
const CAR_COUNT = 11;
const PLAYER_CAR = 3;

// Grandes gares pour le « Bound for … & … ».
const MAJOR_INDICES = [0, 4, 12, 16, 19, 24];

function makeScreen(w: number, h: number): {
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
function fmtClock(clockMin: number): string {
  const total = Math.floor(clockMin) % (24 * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Secondes restantes avant l'arrivée à la prochaine station.
function secondsToArrival(phase: Phase, phaseT: number): number {
  if (phase === 'cruise') return Math.max(0, CONFIG.cruiseTime - phaseT) + CONFIG.brakeTime;
  if (phase === 'brake') return Math.max(0, CONFIG.brakeTime - phaseT);
  if (phase === 'depart') return Math.max(0, CONFIG.departTime - phaseT) + CONFIG.cruiseTime + CONFIG.brakeTime;
  return 0;
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
// dans les vraies E235). Les seeds évitent celles des affiches et écrans
// 窓上 (0-5 et 20-25) pour ne pas répéter les mêmes visuels dans le wagon.
const AD_LOOP_FIRST_SEED = 40;
const AD_LOOP_COUNT = 8;

function drawLeftAd(s: ReturnType<typeof makeScreen>, seed: number): void {
  const { g, w, h } = s;
  drawAdInto(g, w, h, seed);
  g.textAlign = 'left';
}

// --- Bandeau noir supérieur, commun aux deux vues de ligne : « Bound for »,
// onglet Next, tuile de la prochaine gare, heure réelle et n° de voiture. ---
export type ScreenStatus = 'now' | 'next' | 'soon';
export type ScreenLang = 'jp' | 'en';

const STATUS_LABEL: Record<ScreenStatus, Record<ScreenLang, string>> = {
  now: { jp: 'ただいま', en: 'Now stopping at' },
  next: { jp: 'つぎは', en: 'Next' },
  soon: { jp: 'まもなく', en: 'Soon' },
};

// Bandeau noir supérieur, commun à toutes les vues. De gauche à droite :
// direction, barre verte, libellé d'état, pastille JY, nom de la gare, puis
// l'heure et le numéro de voiture. L'afficheur réel alterne japonais et
// anglais sur la même disposition ; c'est la langue qui change, pas la mise
// en page.
function drawHeader(
  g: CanvasRenderingContext2D,
  w: number,
  index: number,
  clock: string,
  status: ScreenStatus,
  lang: ScreenLang,
): void {
  const next = STATIONS[index];
  const HEADER = 88;
  g.fillStyle = '#111214';
  g.fillRect(0, 0, w, HEADER);

  // Direction : les deux prochaines grandes gares.
  const majors: string[] = [];
  for (let k = 1; k <= 29 && majors.length < 2; k++) {
    const idx = (index + k) % 30;
    if (MAJOR_INDICES.includes(idx)) majors.push(lang === 'jp' ? STATIONS[idx].kanji : STATIONS[idx].romaji);
  }
  g.textAlign = 'left';
  if (lang === 'jp') {
    g.fillStyle = '#ffffff';
    fitText(g, `${majors[0] ?? ''}・${majors[1] ?? ''}`, 175, 26);
    g.fillText(`${majors[0] ?? ''}・${majors[1] ?? ''}`, 12, 40);
    g.fillStyle = '#c9ccd0';
    g.font = `18px ${JP_FONT}`;
    g.fillText('方面', 12, 70);
  } else {
    g.fillStyle = '#c9ccd0';
    g.font = `17px ${JP_FONT}`;
    g.fillText('Bound for', 12, 24);
    g.fillStyle = '#ffffff';
    fitText(g, `${majors[0] ?? ''} &`, 175, 22);
    g.fillText(`${majors[0] ?? ''} &`, 12, 50);
    fitText(g, majors[1] ?? '', 175, 22);
    g.fillText(majors[1] ?? '', 12, 76);
  }

  // Barre verte puis libellé d'état, sur fond blanc comme sur l'afficheur.
  g.fillStyle = YAMANOTE_GREEN;
  g.fillRect(196, 0, 14, HEADER);
  g.fillStyle = '#ffffff';
  g.fillRect(210, 0, 132, HEADER);
  g.fillStyle = '#14181c';
  g.textAlign = 'center';
  fitText(g, STATUS_LABEL[status][lang], 120, 26);
  g.fillText(STATUS_LABEL[status][lang], 276, HEADER / 2 + 9);

  // Pastille JY.
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(352, 16, 56, 56, 8);
  g.fill();
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(354, 18, 52, 52, 7);
  g.stroke();
  g.fillStyle = '#111214';
  g.font = `bold 14px ${JP_FONT}`;
  g.fillText('JY', 380, 38);
  g.font = `bold 24px ${JP_FONT}`;
  g.fillText(next.jy.slice(2), 380, 64);

  // Nom de la gare, en grand.
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  const name = lang === 'jp' ? next.kanji : next.romaji;
  fitText(g, name, w - 424 - 130, 56);
  g.fillText(name, 424, 62);

  // Heure réelle et numéro de voiture.
  g.textAlign = 'right';
  g.fillStyle = '#ffffff';
  g.font = `bold 26px ${JP_FONT}`;
  g.fillText(clock, w - 12, 34);
  g.fillStyle = '#8d939a';
  g.font = `15px ${JP_FONT}`;
  g.fillText(lang === 'jp' ? `${PLAYER_CAR}号車` : `Car No.${PLAYER_CAR}`, w - 12, 60);
  g.textAlign = 'left';
}

// --- Écran droit, vue rapprochée : arc vert, 5 prochaines stations ---
// Disposition relevée sur les vues observées : la prochaine gare est en BAS
// À GAUCHE et la courbe remonte vers la droite ; les noms de gares forment
// une colonne à gauche, la plus proche en bas, et le pavé des correspondances
// occupe le côté libre, à droite. Le sens 外回り afficherait le miroir.
function drawRoute(
  s: ReturnType<typeof makeScreen>,
  index: number,
  phase: Phase,
  countdown: number,
  clock: string,
  status: ScreenStatus,
  lang: ScreenLang,
): void {
  const { g, w, h } = s;
  const next = STATIONS[index];

  // Corps clair.
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, status, lang);

  // ----- Courbe verte de la ligne, calée sur l'afficheur réel -----
  // Points de passage (cercles des minutes), k = 0 : prochaine station en
  // bas à droite, k = 4 : la plus lointaine en haut à gauche.
  const CIRCLES: [number, number][] = [
    [292, 279],
    [347, 224],
    [407, 183],
    [474, 150],
    [538, 127],
  ];
  const path: [number, number][] = [
    [808, 112],
    CIRCLES[4],
    CIRCLES[3],
    CIRCLES[2],
    CIRCLES[1],
    CIRCLES[0],
    [248, 356],
  ];
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = 44;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(path[0][0], path[0][1]);
  // Chaîne de quadratiques passant par les milieux : courbe lisse.
  for (let i = 1; i < path.length - 1; i++) {
    const mxp = (path[i][0] + path[i + 1][0]) / 2;
    const myp = (path[i][1] + path[i + 1][1]) / 2;
    g.quadraticCurveTo(path[i][0], path[i][1], mxp, myp);
  }
  g.lineTo(path[path.length - 1][0], path[path.length - 1][1]);
  g.stroke();
  // Chevron rouge : sens de marche, en bout de courbe.
  g.fillStyle = '#c8362c';
  g.save();
  g.translate(273, 310);
  g.rotate(Math.PI - 1.05);
  g.beginPath();
  g.moveTo(-10, -18);
  g.lineTo(22, 0);
  g.lineTo(-10, 18);
  g.lineTo(2, 0);
  g.closePath();
  g.fill();
  g.restore();

  // ----- 5 prochaines stations : cercles des minutes + cascade kanji -----
  // Positions calées sur l'afficheur réel : les rangées ont leur propre
  // ligne de base, légèrement au-dessus de leur cercle.
  const BADGE_X = [18, 18, 18, 18, 18];
  const BASE_Y = [278, 226, 180, 146, 118];
  const atStation = phase === 'dwell';
  for (let k = 4; k >= 0; k--) {
    const stIdx = (index + k) % 30;
    const st = STATIONS[stIdx];
    const [mx, my] = CIRCLES[k];
    // Cercle des minutes (jaune pour la prochaine).
    const minutes = atStation ? k * 2 : k * 2 + Math.max(1, Math.ceil(countdown / 60));
    g.beginPath();
    g.arc(mx, my, k === 0 ? 23 : 19, 0, Math.PI * 2);
    g.fillStyle = k === 0 ? '#e8c033' : '#ffffff';
    g.fill();
    g.fillStyle = '#111214';
    g.font = `bold ${k === 0 ? 25 : 21}px ${JP_FONT}`;
    g.textAlign = 'center';
    g.fillText(String(k === 0 && atStation ? 0 : minutes), mx, my + 7);
    if (k === 4) {
      g.font = `12px ${JP_FONT}`;
      g.fillText('(分)', mx - 40, my + 4);
    }
    // Pastille JY + nom kanji.
    const bx = BADGE_X[k];
    const by = BASE_Y[k];
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(bx, by - 30, 36, 36, 6);
    g.fill();
    g.strokeStyle = YAMANOTE_GREEN;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(bx + 2, by - 28, 32, 32, 5);
    g.stroke();
    g.fillStyle = '#111214';
    g.font = `bold 10px ${JP_FONT}`;
    g.fillText('JY', bx + 18, by - 17);
    g.font = `bold 15px ${JP_FONT}`;
    g.fillText(st.jy.slice(2), bx + 18, by - 1);
    g.textAlign = 'left';
    const name = st.kanji.length === 2 ? `${st.kanji[0]} ${st.kanji[1]}` : st.kanji;
    fitText(g, name, 180, 26);
    g.fillStyle = '#111214';
    g.fillText(name, bx + 44, by);
  }

  // ----- Panneau des correspondances (gare suivante), en bas à gauche -----
  const tr = TRANSFERS[next.jy];
  if (tr) {
    g.fillStyle = '#111214';
    fitText(g, `${next.kanji}駅`, 120, 20);
    g.fillText(`${next.kanji}駅`, w - 250, 208);
    g.font = `12px ${JP_FONT}`;
    g.fillStyle = '#3a3d42';
    g.fillText('乗換えのご案内', w - 250, 226);
    const lines = tr.jp.split('、').slice(0, 8);
    const colors = ['#f15a22', '#00a7e1', '#e21b30', '#009944', '#8f76d6', '#f6aa00', '#00ada9', '#b5b5ac'];
    g.font = `12px ${JP_FONT}`;
    for (let i = 0; i < lines.length; i++) {
      const col = Math.floor(i / 4);
      const row = i % 4;
      const lx = w - 250 + col * 118;
      const ly = 244 + row * 21;
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.roundRect(lx, ly - 11, 13, 13, 3);
      g.fill();
      g.fillStyle = '#26282c';
      let label = lines[i];
      if (label.length > 7) label = label.slice(0, 6) + '…';
      g.fillText(label, lx + 18, ly);
    }
  }

  // Mention basse.
  g.fillStyle = '#9a9d99';
  g.font = `10px ${JP_FONT}`;
  g.fillText('のりかえ、待ち合わせ時間は含まれません。乗車により多少時間が異なります。', 10, h - 6);
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
function drawVerticalName(g: CanvasRenderingContext2D, name: string, x: number, yStart: number, glyph: number): void {
  g.font = `bold ${glyph}px ${JP_FONT}`;
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

function drawLoopMap(
  s: ReturnType<typeof makeScreen>,
  index: number,
  phase: Phase,
  countdown: number,
  clock: string,
  status: ScreenStatus,
  lang: ScreenLang,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, status, lang);

  const X0 = 84;
  const DX = 41;
  const Y_TOP = 168;
  const Y_BOT = 238;
  const at = (slot: { col: number; top: boolean }): [number, number] => [
    X0 + slot.col * DX,
    slot.top ? Y_TOP : Y_BOT,
  ];

  // Ovale vert : rectangle arrondi dont les longs côtés passent par les
  // deux rangées de stations.
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = 26;
  g.beginPath();
  g.roundRect(X0 - 46, Y_TOP, (LOOP_COLS - 1) * DX + 92, Y_BOT - Y_TOP, (Y_BOT - Y_TOP) / 2);
  g.stroke();

  // Rang de chaque station dans le sens de marche (0 = prochaine).
  const rank = new Array<number>(30);
  for (let k = 0; k < 30; k++) rank[(index + k) % 30] = k;
  const atStation = phase === 'dwell';
  const MINUTES_SHOWN = 14; // au-delà (~30 min), simple point blanc

  for (let stIdx = 0; stIdx < 30; stIdx++) {
    const slot = loopSlot(stIdx);
    const [x, y] = at(slot);
    const k = rank[stIdx];

    // Point / cercle des minutes sur l'ovale.
    if (k < MINUTES_SHOWN) {
      const minutes = atStation ? k * 2 : k * 2 + Math.max(1, Math.ceil(countdown / 60));
      g.beginPath();
      g.arc(x, y, k === 0 ? 13 : 10.5, 0, Math.PI * 2);
      g.fillStyle = k === 0 ? '#e8c033' : '#ffffff';
      g.fill();
      g.fillStyle = '#111214';
      g.font = `bold ${k === 0 ? 14 : 12}px ${JP_FONT}`;
      g.textAlign = 'center';
      g.fillText(String(k === 0 && atStation ? 0 : minutes), x, y + 4);
      if (k === MINUTES_SHOWN - 1) {
        // « (分) » du côté des stations sans cercle (rang suivant), où il
        // ne chevauche pas un autre cercle de minutes.
        const [fx] = at(loopSlot((index + MINUTES_SHOWN) % 30));
        g.font = `9px ${JP_FONT}`;
        g.fillText('(分)', x + (fx >= x ? 20 : -20), y + 3);
      }
    } else {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
    }

    // Nom vertical : suspendu au-dessus de la rangée haute, accroché sous
    // la rangée basse.
    const name = STATIONS[stIdx].kanji;
    g.fillStyle = '#111214';
    if (slot.top) {
      const glyph = Math.min(13, Math.floor(52 / name.length));
      drawVerticalName(g, name, x, Y_TOP - 22 - (name.length - 1) * glyph, glyph);
    } else {
      // Les noms longs (高輪ゲートウェイ) démarrent plus haut avec un corps
      // plancher, comme le petit texte serré de l'afficheur réel.
      const glyph = Math.max(7, Math.min(13, Math.floor(46 / name.length)));
      drawVerticalName(g, name, x, Y_BOT + (name.length >= 6 ? 26 : 32), glyph);
    }
  }

  // Chevron rouge entre la gare précédente et la prochaine : position du
  // train et sens de marche.
  const [px, py] = at(loopSlot((index + 29) % 30));
  const [nx, ny] = at(loopSlot(index));
  const cx = px + (nx - px) * 0.5;
  const cy = py + (ny - py) * 0.5;
  g.fillStyle = '#c8362c';
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.atan2(ny - py, nx - px));
  g.beginPath();
  g.moveTo(-7, -12);
  g.lineTo(15, 0);
  g.lineTo(-7, 12);
  g.lineTo(1, 0);
  g.closePath();
  g.fill();
  g.restore();
  g.textAlign = 'left';

  // Mention basse.
  g.fillStyle = '#9a9d99';
  g.font = `10px ${JP_FONT}`;
  g.fillText('のりかえ、待ち合わせ時間は含まれません。電車により多少時間が異なります。', 10, h - 5);
}

// --- Écran droit, variante bandeau info ---
function drawBanner(s: ReturnType<typeof makeScreen>): void {
  const { g, w, h } = s;
  g.fillStyle = '#1c242b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = YAMANOTE_GREEN;
  g.fillRect(0, 0, w, 10);
  g.fillRect(0, h - 10, w, 10);
  g.fillStyle = '#f2f2ee';
  g.textAlign = 'center';
  g.font = `bold 42px ${JP_FONT}`;
  g.fillText('優先席付近では', w / 2, h * 0.36);
  g.fillText('マナーモードに設定', w / 2, h * 0.55);
  g.font = `26px ${JP_FONT}`;
  g.fillStyle = '#b9c2c8';
  g.fillText('Please set your phone to silent mode', w / 2, h * 0.76);
  g.textAlign = 'left';
}

// --- Écran droit, plan du quai (駅構内図) ---
// C'est la vue la plus caractéristique de l'afficheur réel, et celle qui
// manquait : à l'approche d'une gare, l'écran passe du plan de ligne au plan
// du QUAI. On y lit où s'arrête chaque voiture par rapport aux escaliers, aux
// ascenseurs et aux sorties — le fond passe au bleu clair, le bandeau de tête
// à l'orange, et la rame est dessinée voiture par voiture, celle du voyageur
// mise en évidence.
const PLATFORM_BLUE = '#cfe4f4';
const PLATFORM_ORANGE = '#e8722a';

function drawPlatformDiagram(s: ReturnType<typeof makeScreen>, index: number, clock: string): void {
  const { g, w, h } = s;
  const next = STATIONS[index];
  const r = rng(1700 + index * 31);

  g.fillStyle = PLATFORM_BLUE;
  g.fillRect(0, 0, w, h);

  // --- Bandeau de tête : つぎは + nom de gare + pastille JY ---
  const HEAD = 96;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, HEAD);
  g.fillStyle = PLATFORM_ORANGE;
  g.fillRect(0, HEAD - 6, w, 6);

  g.fillStyle = '#3d4650';
  g.font = `20px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText('つぎは', 16, 34);
  g.fillStyle = '#14181c';
  g.font = `bold 52px ${JP_FONT}`;
  g.fillText(next.kanji, 16, 82);
  g.fillStyle = '#525c66';
  g.font = `22px ${JP_FONT}`;
  g.fillText(next.romaji, 24 + g.measureText(next.kanji).width * 1.6, 80);

  // Pastille de ligne, à droite comme sur l'afficheur.
  const bx = w - 74;
  g.beginPath();
  g.arc(bx, HEAD / 2 - 4, 38, 0, Math.PI * 2);
  g.fillStyle = YAMANOTE_GREEN;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 18px ${JP_FONT}`;
  g.fillText('JY', bx, HEAD / 2 - 12);
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText(next.jy.slice(2), bx, HEAD / 2 + 16);

  // --- Bandeau de correspondances, sur fond crème ---
  const tr = TRANSFERS[next.jy];
  const BAND = HEAD + 40;
  g.fillStyle = '#f6e7b8';
  g.fillRect(0, HEAD, w, 40);
  g.fillStyle = '#4a4231';
  g.textAlign = 'left';
  g.font = `19px ${JP_FONT}`;
  const lines = tr ? tr.jp.split('、').slice(0, 4).join('  ') : 'のりかえ なし';
  fitText(g, lines, w - 200, 19);
  g.fillText(lines, 14, HEAD + 27);
  g.textAlign = 'right';
  g.font = `bold 20px ${JP_FONT}`;
  g.fillStyle = '#7a4a12';
  g.fillText(clock, w - 14, HEAD + 27);
  g.textAlign = 'left';

  // --- Plan du quai ---
  const top = BAND + 26;
  const platY = h - 74; // ligne de nez de quai
  const x0 = 58;
  const x1 = w - 24;
  const carW = (x1 - x0) / CAR_COUNT;

  // Sens de marche, en tête à gauche.
  g.fillStyle = '#2c343c';
  g.font = `20px ${JP_FONT}`;
  g.fillText(`${STATIONS[(index + 4) % 30].kanji}ゆき`, 14, top + 4);

  // Quai : bande grise, nez de quai orange.
  g.fillStyle = '#e9eef2';
  g.fillRect(x0 - 34, platY, x1 - x0 + 58, 46);
  g.fillStyle = PLATFORM_ORANGE;
  g.fillRect(x0 - 34, platY, x1 - x0 + 58, 5);

  // Les voitures, numérotées, celle du voyageur en vert.
  for (let i = 0; i < CAR_COUNT; i++) {
    const cx = x0 + i * carW;
    const isMine = i + 1 === PLAYER_CAR;
    g.fillStyle = isMine ? YAMANOTE_GREEN : '#ffffff';
    g.strokeStyle = '#7d8a95';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(cx + 3, platY - 40, carW - 6, 34, 5);
    g.fill();
    g.stroke();
    g.fillStyle = isMine ? '#ffffff' : '#2c343c';
    g.textAlign = 'center';
    g.font = `bold 19px ${JP_FONT}`;
    g.fillText(String(i + 1), cx + carW / 2, platY - 15);
  }
  g.textAlign = 'left';

  // Escaliers, ascenseur et sorties, répartis d'une gare à l'autre : la
  // disposition est tirée du numéro de gare, donc stable pour une gare donnée
  // et différente de la suivante.
  const marks: { car: number; label: string }[] = [
    { car: 1 + Math.floor(r() * 3), label: '階段' },
    { car: 4 + Math.floor(r() * 3), label: 'エスカレーター' },
    { car: 8 + Math.floor(r() * 3), label: 'エレベーター' },
  ];
  for (const m of marks) {
    const cx = x0 + (m.car - 0.5) * carW;
    g.strokeStyle = '#5b6a76';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, platY + 46);
    g.lineTo(cx, top + 44);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#5b6a76';
    g.lineWidth = 2;
    const tw = g.measureText(m.label).width * 0.9 + 18;
    g.beginPath();
    g.roundRect(cx - tw / 2, top + 18, tw, 28, 6);
    g.fill();
    g.stroke();
    g.fillStyle = '#2c343c';
    g.font = `16px ${JP_FONT}`;
    g.textAlign = 'center';
    g.fillText(m.label, cx, top + 38);
  }
  g.textAlign = 'left';

  // Sortie principale, à l'une des deux extrémités.
  const gateLeft = r() > 0.5;
  const gx = gateLeft ? x0 - 30 : x1 - 4;
  g.fillStyle = '#f6d24a';
  g.beginPath();
  g.roundRect(gx - 26, platY + 52, 96, 26, 5);
  g.fill();
  g.fillStyle = '#2c343c';
  g.font = `bold 16px ${JP_FONT}`;
  g.textAlign = 'center';
  g.fillText('改札口', gx + 22, platY + 71);
  g.textAlign = 'left';
}


// --- État « côté d'ouverture » (まもなく) ---
// Les deux faces du wagon n'affichent PAS la même chose : chaque écran indique
// si les portes qui s'ouvrent sont de son côté ou de l'autre. C'est la seule
// vue qui diffère physiquement d'une paroi à l'autre, d'où deux canevas.
function drawDoorSide(s: ReturnType<typeof makeScreen>, index: number, clock: string, mine: boolean): void {
  const { g, w, h } = s;
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'soon', 'jp');

  const cy = h * 0.56;
  // Vantaux stylisés, entrouverts du bon côté.
  const dw = 62;
  const gap = mine ? 26 : 4;
  for (const dir of [-1, 1]) {
    g.fillStyle = '#9aa3ab';
    g.strokeStyle = '#5d666e';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(w / 2 + dir * (gap / 2) - (dir < 0 ? dw : 0), cy - 58, dw, 116, 6);
    g.fill();
    g.stroke();
  }

  // Flèches vertes divergentes : elles ne s'affichent que si c'est ce côté.
  if (mine) {
    g.fillStyle = YAMANOTE_GREEN;
    for (const dir of [-1, 1]) {
      const bx = w / 2 + dir * 150;
      g.beginPath();
      g.moveTo(bx + dir * 66, cy);
      g.lineTo(bx, cy - 44);
      g.lineTo(bx, cy - 18);
      g.lineTo(bx - dir * 62, cy - 18);
      g.lineTo(bx - dir * 62, cy + 18);
      g.lineTo(bx, cy + 18);
      g.lineTo(bx, cy + 44);
      g.closePath();
      g.fill();
    }
  }

  g.textAlign = 'center';
  g.fillStyle = '#14181c';
  g.font = `bold 34px ${JP_FONT}`;
  g.fillText(mine ? 'こちら側のドアが開きます' : '反対側のドアが開きます', w / 2, h - 54);
  g.fillStyle = '#5c646c';
  g.font = `22px ${JP_FONT}`;
  g.fillText(mine ? 'Doors on this side will open' : 'Doors on the other side will open', w / 2, h - 22);
  g.textAlign = 'left';
}

// --- État « correspondances à la prochaine gare » ---
// Chaque ligne en correspondance a sa pastille colorée, comme sur l'afficheur.
const LINE_BADGES: { match: RegExp; code: string; color: string }[] = [
  { match: /新幹線/, code: 'S', color: '#1f6fb5' },
  { match: /中央線/, code: 'JC', color: '#f15a24' },
  { match: /京浜東北/, code: 'JK', color: '#00a7db' },
  { match: /東海道|上野東京/, code: 'JT', color: '#f68b1e' },
  { match: /横須賀|総武/, code: 'JO', color: '#0067c0' },
  { match: /埼京|川越/, code: 'JA', color: '#00ac9a' },
  { match: /湘南新宿/, code: 'JS', color: '#e21f26' },
  { match: /丸ノ内/, code: 'M', color: '#e60012' },
  { match: /銀座/, code: 'G', color: '#f39700' },
  { match: /日比谷/, code: 'H', color: '#9caeb7' },
  { match: /千代田/, code: 'C', color: '#00a95f' },
  { match: /有楽町/, code: 'Y', color: '#c1a470' },
  { match: /副都心/, code: 'F', color: '#9c5e31' },
  { match: /半蔵門/, code: 'Z', color: '#8f76d6' },
  { match: /南北/, code: 'N', color: '#00ac9b' },
  { match: /東西/, code: 'T', color: '#009bbf' },
  { match: /浅草/, code: 'A', color: '#e85298' },
  { match: /都営新宿/, code: 'S', color: '#6cbb5a' },
  { match: /大江戸/, code: 'E', color: '#b6007a' },
  { match: /京急|京浜急行/, code: 'KK', color: '#00bfff' },
  { match: /京成/, code: 'KS', color: '#005aaa' },
  { match: /東急/, code: 'TY', color: '#e5171f' },
  { match: /東武/, code: 'TS', color: '#0f6cb6' },
  { match: /西武/, code: 'SI', color: '#f5a200' },
  { match: /小田急/, code: 'OH', color: '#0079c2' },
  { match: /京王/, code: 'KO', color: '#d31e79' },
  { match: /りんかい/, code: 'R', color: '#0079c1' },
  { match: /モノレール/, code: 'MO', color: '#0a6eb4' },
];

function drawTransfers(s: ReturnType<typeof makeScreen>, index: number, clock: string): void {
  const { g, w, h } = s;
  const next = STATIONS[index];
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp');

  g.fillStyle = '#dfe6ea';
  g.fillRect(0, 96, w, 40);
  g.fillStyle = '#26303a';
  g.font = `bold 23px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText(`${next.kanji}のりかえ  /  Transfer at ${next.romaji}`, 16, 124);

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
    const cy = 176 + Math.floor(i / cols) * 44;
    const badge = LINE_BADGES.find((b) => b.match.test(label));
    g.fillStyle = badge?.color ?? '#7c868f';
    g.beginPath();
    g.arc(cx + 17, cy - 8, 17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = `bold ${badge && badge.code.length > 1 ? 15 : 19}px ${JP_FONT}`;
    g.fillText(badge?.code ?? '·', cx + 17, cy - 1);
    g.textAlign = 'left';
    g.fillStyle = '#26303a';
    fitText(g, label, cw - 60, 23, '');
    g.fillText(label, cx + 44, cy);
  });
}

// --- Écrans de courtoisie : places prioritaires et embarquement ---
function drawPriorityNotice(s: ReturnType<typeof makeScreen>, index: number, clock: string): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp');
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

function drawSafetyNotice(s: ReturnType<typeof makeScreen>, index: number, clock: string): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp');
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

export function Screens() {
  const left = useMemo(() => makeScreen(512, 288), []);
  // DEUX canevas pour l'écran de droite : à l'approche, chaque paroi indique
  // si les portes qui s'ouvrent sont de SON côté. C'est la seule vue qui
  // diffère physiquement d'un côté à l'autre de la rame.
  const rightA = useMemo(() => makeScreen(768, 384), []);
  const rightB = useMemo(() => makeScreen(768, 384), []);
  const lastKey = useRef('');
  const lastAd = useRef(-1);
  const acc = useRef(0);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const { index, phase, doorSide } = useStore.getState();

    // Écran gauche : une pub toutes les ~15 s, boucle de AD_LOOP_COUNT spots.
    const adSeed = AD_LOOP_FIRST_SEED + (Math.floor(runtime.clockMin * 4) % AD_LOOP_COUNT);
    if (adSeed !== lastAd.current) {
      lastAd.current = adSeed;
      drawLeftAd(left, adSeed);
      left.texture.needsUpdate = true;
    }

    // Écran droit : machine à états calée sur la phase du cycle.
    //
    //  à quai      → ただいま, plans de ligne en japonais puis en anglais,
    //                entrecoupés du plan du quai ;
    //  en route    → つぎは, mêmes plans, plus les correspondances de la
    //                prochaine gare et les écrans de courtoisie ;
    //  à l'approche→ まもなく, côté d'ouverture, alterné avec le plan du quai.
    //
    // Les états d'exploitation dégradée (retard, interruption, arrêt d'urgence)
    // existent sur la vraie rame mais ne sont pas rendus ici : la simulation
    // n'a ni incident ni retard, les afficher serait annoncer au voyageur
    // quelque chose qui n'arrive pas.
    const tick = Math.floor(runtime.clockMin * 4);
    const clock = fmtClock(runtime.clockMin);
    const countdown = Math.round(secondsToArrival(phase, runtime.phaseT));

    let state: string;
    let status: ScreenStatus;
    if (phase === 'brake') {
      status = 'soon';
      state = tick % 3 === 2 ? 'platform' : 'door';
    } else if (phase === 'dwell') {
      status = 'now';
      state = ['loopJP', 'loopEN', 'zoomJP', 'zoomEN', 'platform'][tick % 5];
    } else {
      status = 'next';
      state = ['loopJP', 'zoomJP', 'transfers', 'loopEN', 'zoomEN', 'priority', 'zoomJP', 'manners', 'loopJP', 'safety'][
        tick % 10
      ];
    }

    const key = `${index}|${phase}|${state}|${clock}|${doorSide}|${state.startsWith('loop') || state.startsWith('zoom') ? countdown : 0}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    for (const [side, screen] of [
      [1, rightA],
      [-1, rightB],
    ] as const) {
      const g = screen;
      switch (state) {
        case 'door':
          drawDoorSide(g, index, clock, doorSide === side);
          break;
        case 'platform':
          drawPlatformDiagram(g, index, clock);
          break;
        case 'transfers':
          drawTransfers(g, index, clock);
          break;
        case 'priority':
          drawPriorityNotice(g, index, clock);
          break;
        case 'safety':
          drawSafetyNotice(g, index, clock);
          break;
        case 'manners':
          drawBanner(g);
          break;
        case 'loopJP':
          drawLoopMap(g, index, phase, countdown, clock, status, 'jp');
          break;
        case 'loopEN':
          drawLoopMap(g, index, phase, countdown, clock, status, 'en');
          break;
        case 'zoomEN':
          drawRoute(g, index, phase, countdown, clock, status, 'en');
          break;
        default:
          drawRoute(g, index, phase, countdown, clock, status, 'jp');
      }
      g.texture.needsUpdate = true;
    }
  });

  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#22262b', roughness: 0.5 }), []);
  const leftMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: left.texture, toneMapped: false }),
    [left.texture],
  );
  const rightMatA = useMemo(
    () => new THREE.MeshBasicMaterial({ map: rightA.texture, toneMapped: false }),
    [rightA.texture],
  );
  const rightMatB = useMemo(
    () => new THREE.MeshBasicMaterial({ map: rightB.texture, toneMapped: false }),
    [rightB.texture],
  );

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <group
            key={`scr${s}-${z}`}
            position={[s * (CONFIG.carHalfWidth - 0.14), 2.16, z]}
            rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
          >
            {/* Deux écrans SÉPARÉS, chacun dans son boîtier incliné vers
                l'allée, avec un espace entre eux (disposition E235). */}
            {([-1, 1] as const).map((k) => (
              <group key={`half${k}`} position={[k * 0.345, 0, 0]} rotation={[0.22, 0, 0]}>
                {/* Boîtier franchement plus grand que la dalle : il faut un
                    encadrement visible sur les quatre côtés, sinon l'image
                    paraît coupée par la paroi. */}
                <mesh position={[0, 0, -0.014]} material={frameMat}>
                  <boxGeometry args={[0.68, 0.42, 0.035]} />
                </mesh>
                <mesh position={[0, 0, 0.005]} material={k === -1 ? leftMat : s === 1 ? rightMatA : rightMatB}>
                  <planeGeometry args={[0.6, 0.32]} />
                </mesh>
              </group>
            ))}
          </group>
        )),
      )}
    </group>
  );
}
