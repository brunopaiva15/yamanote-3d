// Doubles écrans LCD au-dessus des portes (E235) : écran gauche = publicités
// en boucle (comme dans les vraies rames, il n'affiche jamais la prochaine
// station), écran droit = écran de ligne fidèle au vrai afficheur JR East.
// Comme sur la rame réelle, il enchaîne un cycle QUADRILINGUE (japonais,
// anglais, chinois simplifié, coréen) et de nombreux états : vue rapprochée
// des 5 prochaines stations (arc vert, minutes, correspondances), plan complet
// de la boucle (30 stations, minutes jusqu'à ~30 min), écran « prochain
// arrêt » zh/ko, correspondances détaillées, écrans manières (téléphone,
// sac à dos, fuite sonore des écouteurs), places prioritaires, sécurité,
// avertissement de FERMETURE DES PORTES en fin d'arrêt, côté d'ouverture à
// l'approche, plan du quai, et — quand une autre ligne est perturbée —
// information trafic, état des autres lignes et certificat de retard.
// Deux CanvasTexture partagées, redessinées uniquement aux changements.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EMERGENCY_REASONS } from '../data/announcements';
import { CONFIG } from '../data/config';
import type { LoopDirection } from '../data/platforms';
import {
  cruiseDuration,
  headwayMinutesTo,
  stationAtHop,
} from '../data/segments';
import { STATIONS, TRANSFERS } from '../data/stations';
import { useStore, type Phase } from '../store';
import { runtime } from '../systems/runtime';
import { CLOSE_ANNOUNCE_LEAD, dwellDuration } from '../systems/stationCycle';
import { JP_FONT, drawAdInto, rng } from '../textures/procedural';

const YAMANOTE_GREEN = '#80c241';

// Afficheur fidèle à la rame réelle (11 voitures) ; le voyageur est en 3ᵉ.
// Seule la voiture 3 est modélisée en 3D.
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
function secondsToArrival(phase: Phase, phaseT: number, stationIndex: number): number {
  const cruiseSec = cruiseDuration(stationIndex);
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
const AD_LOOP_FIRST_SEED = 300;
const AD_LOOP_COUNT = 120;

function drawLeftAd(s: ReturnType<typeof makeScreen>, seed: number): void {
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
  soon: { jp: 'まもなく', en: 'Soon', zh: '即将到达', ko: '잠시 후' },
};

// Nom de gare dans la langue du cycle d'affichage.
function stationName(st: (typeof STATIONS)[number], lang: ScreenLang): string {
  if (lang === 'jp') return st.kanji;
  if (lang === 'en') return st.romaji;
  return lang === 'zh' ? st.zh : st.ko;
}

// Bandeau noir supérieur, commun à toutes les vues. De gauche à droite :
// direction, barre verte, libellé d'état, pastille JY, nom de la gare, puis
// l'heure et le numéro de voiture. L'afficheur réel alterne japonais et
// anglais sur la même disposition ; c'est la langue qui change, pas la mise
// en page.
// Hauteur du bandeau : ~30 % de l'écran sur la photo de référence.
const HEADER_H = 112;

// Bandeau noir supérieur, refait sur photo. De gauche à droite : la direction
// dans une BOÎTE BLANCHE calée en bas, la barre verte pleine hauteur, le
// libellé d'état en blanc directement sur le noir (pas d'onglet), le nom de la
// gare en très grand, l'heure en jaune pâle et le numéro de voiture. Pas de
// pastille JY dans le bandeau : la photo n'en montre pas.
function drawHeader(
  g: CanvasRenderingContext2D,
  w: number,
  index: number,
  clock: string,
  status: ScreenStatus,
  lang: ScreenLang,
): void {
  const next = STATIONS[index];
  g.fillStyle = '#0e0f11';
  g.fillRect(0, 0, w, HEADER_H);

  // Boîte blanche de direction, ancrée au bas du bandeau.
  const majors: string[] = [];
  for (let k = 1; k <= 29 && majors.length < 2; k++) {
    const idx = (index + k) % 30;
    if (MAJOR_INDICES.includes(idx)) majors.push(stationName(STATIONS[idx], lang));
  }
  g.fillStyle = '#f2f2ee';
  g.fillRect(0, 40, 176, HEADER_H - 40);
  g.fillStyle = '#17191c';
  g.textAlign = 'left';
  if (lang === 'en') {
    g.font = `16px ${JP_FONT}`;
    g.fillText('Bound for', 9, 60);
    fitText(g, `${majors[0] ?? ''}&`, 158, 21);
    g.fillText(`${majors[0] ?? ''}&`, 9, 82);
    fitText(g, majors[1] ?? '', 158, 21);
    g.fillText(majors[1] ?? '', 9, 104);
  } else {
    // jp/zh/ko partagent la mise en page « noms + suffixe de direction ».
    const suffix = lang === 'jp' ? '方面' : lang === 'zh' ? '方向' : '방면';
    fitText(g, `${majors[0] ?? ''}・${majors[1] ?? ''}`, 158, 24);
    g.fillText(`${majors[0] ?? ''}・${majors[1] ?? ''}`, 9, 76);
    g.font = `17px ${JP_FONT}`;
    g.fillText(suffix, 9, 102);
  }

  // Barre verte pleine hauteur.
  g.fillStyle = YAMANOTE_GREEN;
  g.fillRect(180, 0, 42, HEADER_H);

  // Libellé d'état, blanc sur noir, en haut.
  g.fillStyle = '#ffffff';
  g.font = `26px ${JP_FONT}`;
  g.fillText(STATUS_LABEL[status][lang], 236, 32);

  // Nom de la gare, très grand, centré sur l'espace restant.
  const name = stationName(next, lang);
  g.textAlign = 'center';
  fitText(g, name, 380, 66);
  g.fillText(name, 452, 98);

  // Heure (jaune pâle) et numéro de voiture, en haut à droite.
  g.textAlign = 'right';
  g.fillStyle = '#ece98f';
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText(clock, w - 118, 34);
  g.fillStyle = '#9aa0a6';
  g.font = `italic 17px ${JP_FONT}`;
  const carLabel =
    lang === 'jp' ? `${PLAYER_CAR}号車`
    : lang === 'zh' ? `${PLAYER_CAR}号车`
    : lang === 'ko' ? `${PLAYER_CAR}호차`
    : `Car No. ${PLAYER_CAR}`;
  g.fillText(carLabel, w - 12, 34);
  g.textAlign = 'left';
}

// --- Écran droit, vue rapprochée : la grande courbe verte, refaite sur la
// photo réelle. La bande traverse tout l'écran — elle entre par le bord bas à
// gauche et file GLISSER SOUS LE BANDEAU en haut à droite (elle est dessinée
// avant lui). Les cinq prochaines gares s'y accrochent : cercle des minutes
// sur la bande, nom en très grand à gauche, les noms de deux kanji espacés
// d'un blanc (東 京) comme sur l'afficheur. Le pavé des correspondances de la
// prochaine gare occupe le côté libre, à droite.
function drawRoute(
  s: ReturnType<typeof makeScreen>,
  index: number,
  phase: Phase,
  countdown: number,
  clock: string,
  status: ScreenStatus,
  lang: ScreenLang,
  dir: LoopDirection,
): void {
  const { g, w, h } = s;
  const next = STATIONS[index];
  g.fillStyle = '#e9e8e4';
  g.fillRect(0, 0, w, h);

  // Cercles des minutes, du plus proche (bas gauche) au plus lointain.
  const CIRCLES: [number, number][] = [
    [294, 330],
    [347, 270],
    [404, 224],
    [475, 184],
    [542, 156],
  ];
  const path: [number, number][] = [
    [760, 74],
    CIRCLES[4],
    CIRCLES[3],
    CIRCLES[2],
    CIRCLES[1],
    CIRCLES[0],
    [240, 410],
  ];
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = 62;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length - 1; i++) {
    const mxp = (path[i][0] + path[i + 1][0]) / 2;
    const myp = (path[i][1] + path[i + 1][1]) / 2;
    g.quadraticCurveTo(path[i][0], path[i][1], mxp, myp);
  }
  g.lineTo(path[path.length - 1][0], path[path.length - 1][1]);
  g.stroke();

  // Chevron grenat sur la bande, sous le cercle jaune : position du train.
  g.fillStyle = '#9c1f22';
  g.save();
  g.translate(262, 374);
  g.rotate(2.17);
  g.beginPath();
  g.moveTo(-16, -26);
  g.lineTo(30, 0);
  g.lineTo(-16, 26);
  g.lineTo(-2, 0);
  g.closePath();
  g.fill();
  g.restore();

  const atStation = phase === 'dwell';
  for (let k = 4; k >= 0; k--) {
    const stIdx = stationAtHop(index, k, dir);
    const st = STATIONS[stIdx];
    const [mx, my] = CIRCLES[k];
    // Cercle des minutes : blanc, jaune et plus gros pour la prochaine.
    const minutes = etaMinutes(index, k, atStation, countdown, dir);
    g.beginPath();
    g.arc(mx, my, k === 0 ? 26 : 21, 0, Math.PI * 2);
    g.fillStyle = k === 0 ? '#e8c033' : '#ffffff';
    g.fill();
    g.fillStyle = '#111214';
    g.font = `bold ${k === 0 ? 28 : 23}px ${JP_FONT}`;
    g.textAlign = 'center';
    g.fillText(String(k === 0 && atStation ? 0 : minutes), mx, my + 8);
    if (k === 4) {
      g.font = `14px ${JP_FONT}`;
      g.textAlign = 'left';
      g.fillText(lang === 'jp' ? '(分)' : '(min)', mx + 30, my - 4);
    }
    // Nom en très grand à gauche du cercle, cascade diagonale. Les noms de
    // deux caractères sont espacés d'un blanc idéographique, comme en vrai.
    g.textAlign = 'right';
    g.fillStyle = '#111214';
    let name = lang === 'jp' ? st.kanji : st.romaji;
    if (lang === 'jp' && name.length === 2) name = `${name[0]}　${name[1]}`;
    // Corps dégressif vers le haut : sur la photo 東京 est le plus grand et
    // les gares lointaines rapetissent — c'est aussi ce qui évite que les
    // noms serrés du sommet ne se chevauchent.
    const SIZES_JP = [48, 38, 38, 34, 32];
    const SIZES_EN = [33, 27, 27, 24, 23];
    fitText(g, name, mx - 58, (lang === 'jp' ? SIZES_JP : SIZES_EN)[k], '');
    g.fillText(name, mx - 44, my + (k === 0 ? 16 : 13));
    g.textAlign = 'left';
  }

  // ----- Pavé des correspondances de la prochaine gare, à droite -----
  const tr = TRANSFERS[next.jy];
  if (tr) {
    g.textAlign = 'right';
    g.fillStyle = '#111214';
    g.font = `bold 21px ${JP_FONT}`;
    g.fillText(`${next.kanji}駅`, w - 12, 192);
    g.font = `15px ${JP_FONT}`;
    g.fillStyle = '#3a3d42';
    g.fillText('乗換えのご案内', w - 12, 214);
    g.textAlign = 'left';
    const lines = tr.jp.split('、').slice(0, 7);
    const colors = ['#00a650', '#0072bc', '#f15a22', '#0067c0', '#1d3f94', '#a51e36', '#e60012'];
    g.font = `15px ${JP_FONT}`;
    let y = 240;
    for (let i = 0; i < lines.length; i++) {
      let label = lines[i];
      const long = label.length > 9;
      if (label.length > 16) label = label.slice(0, 15) + '…';
      // Les libellés longs (shinkansen) prennent la ligne entière ; les
      // courts se rangent par deux, comme sur la photo.
      const pair = !long && i + 1 < lines.length && lines[i + 1].length <= 9;
      const draw = (lx: number, text: string, ci: number) => {
        g.fillStyle = colors[ci % colors.length];
        g.beginPath();
        g.roundRect(lx, y - 13, 15, 15, 3);
        g.fill();
        g.fillStyle = '#26282c';
        g.fillText(text, lx + 21, y);
      };
      draw(470, label, i);
      if (pair) {
        i++;
        draw(622, lines[i], i);
      }
      y += 27;
      if (y > h - 26) break;
    }
  }

  // Mention basse, cadrée à droite comme sur la photo.
  g.textAlign = 'right';
  g.fillStyle = '#8f918d';
  g.font = `11px ${JP_FONT}`;
  g.fillText('のりかえ、待ち合わせ時間は含まれません。電車により多少時間が異なります。', w - 8, h - 7);
  g.textAlign = 'left';

  // Le bandeau se dessine PAR-DESSUS : la courbe glisse dessous.
  drawHeader(g, w, index, clock, status, lang);
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
  dir: LoopDirection,
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
  g.lineWidth = 30;
  g.beginPath();
  g.roundRect(X0 - 46, Y_TOP, (LOOP_COLS - 1) * DX + 92, Y_BOT - Y_TOP, (Y_BOT - Y_TOP) / 2);
  g.stroke();

  // Rang de chaque station dans le sens de marche (0 = prochaine).
  const rank = new Array<number>(30);
  for (let k = 0; k < 30; k++) rank[stationAtHop(index, k, dir)] = k;
  const atStation = phase === 'dwell';
  const MINUTES_SHOWN = 14; // au-delà (~30 min), simple point blanc

  for (let stIdx = 0; stIdx < 30; stIdx++) {
    const slot = loopSlot(stIdx);
    const [x, y] = at(slot);
    const k = rank[stIdx];

    // Point / cercle des minutes sur l'ovale.
    if (k < MINUTES_SHOWN) {
      const minutes = etaMinutes(index, k, atStation, countdown, dir);
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
        const [fx] = at(loopSlot(stationAtHop(index, MINUTES_SHOWN, dir)));
        g.font = `9px ${JP_FONT}`;
        g.fillText(lang === 'jp' ? '(分)' : '(min)', x + (fx >= x ? 20 : -20), y + 3);
      }
    } else {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
    }

    // Nom de gare : vertical en japonais ; en anglais, romaji INCLINÉ à 45°
    // comme sur l'afficheur — au-dessus de la rangée haute en montant vers la
    // droite, sous la rangée basse en descendant, ancré à la station.
    g.fillStyle = '#111214';
    if (lang === 'jp') {
      const name = STATIONS[stIdx].kanji;
      if (slot.top) {
        const glyph = Math.min(13, Math.floor(52 / name.length));
        drawVerticalName(g, name, x, Y_TOP - 22 - (name.length - 1) * glyph, glyph);
      } else {
        // Les noms longs (高輪ゲートウェイ) démarrent plus haut avec un corps
        // plancher, comme le petit texte serré de l'afficheur réel.
        const glyph = Math.max(7, Math.min(13, Math.floor(46 / name.length)));
        drawVerticalName(g, name, x, Y_BOT + (name.length >= 6 ? 26 : 32), glyph);
      }
    } else {
      const name = STATIONS[stIdx].romaji;
      g.save();
      if (slot.top) {
        g.translate(x - 2, Y_TOP - 18);
        g.rotate(-0.8);
        g.textAlign = 'left';
      } else {
        g.translate(x + 2, Y_BOT + 22);
        g.rotate(-0.8);
        g.textAlign = 'right';
      }
      g.font = `11px ${JP_FONT}`;
      g.fillText(name, 0, 4);
      g.restore();
      g.textAlign = 'left';
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
  g.moveTo(-9, -16);
  g.lineTo(20, 0);
  g.lineTo(-9, 16);
  g.lineTo(2, 0);
  g.closePath();
  g.fill();
  g.restore();
  g.textAlign = 'left';

  // Mention basse.
  g.fillStyle = '#9a9d99';
  g.font = `10px ${JP_FONT}`;
  g.fillText('のりかえ、待ち合わせ時間は含まれません。電車により多少時間が異なります。', 10, h - 5);
}

// --- Écrans manières (fond clair avec bandeau, comme les vrais) ---
// La rame réelle fait tourner plusieurs visuels de courtoisie ; on en rend
// trois : téléphone en mode silencieux, sac à dos porté devant, fuite sonore
// des écouteurs. Ils partagent le gabarit pictogramme à gauche / texte à
// droite des autres écrans de courtoisie.

function drawPhoneManner(s: ReturnType<typeof makeScreen>, index: number, clock: string): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp');
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

function drawBackpackManner(s: ReturnType<typeof makeScreen>, index: number, clock: string): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp');
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

function drawHeadphoneManner(s: ReturnType<typeof makeScreen>, index: number, clock: string): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', 'jp');
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
function drawNextStationLang(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  status: ScreenStatus,
  lang: 'zh' | 'ko',
): void {
  const { g, w, h } = s;
  const next = STATIONS[index];
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, status, lang);

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
function drawDoorClosing(s: ReturnType<typeof makeScreen>, index: number, clock: string): void {
  const { g, w, h } = s;
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'now', 'jp');

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


// --- Information trafic (運行情報) ---
// L'afficheur réel relaie les perturbations de TOUTE la région de Tokyo, pas
// seulement de la Yamanote — c'est presque toujours une autre ligne qui est
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
function trafficNotice(clockMin: number): TrafficNotice | null {
  const slot = Math.floor(clockMin / 30);
  const r = rng(4200 + slot);
  if (r() > 0.34) return null;
  const line = OTHER_LINES[Math.floor(r() * OTHER_LINES.length)];
  const [reasonJp, reasonEn] = DELAY_REASONS[Math.floor(r() * DELAY_REASONS.length)];
  return { lineJp: line.jp, lineEn: line.en, reasonJp, reasonEn };
}

function drawTrafficInfo(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: ScreenLang,
  notice: TrafficNotice,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang);

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
// pastille d'alerte, motif de l'arrêt — c'est l'écran rouge du vrai afficheur
// quand la rame elle-même est immobilisée.
function drawEmergencyInfo(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: ScreenLang,
  reason: number,
): void {
  const { g, w, h } = s;
  const r = EMERGENCY_REASONS[((reason % EMERGENCY_REASONS.length) + EMERGENCY_REASONS.length) % EMERGENCY_REASONS.length];
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang);

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

// --- État des autres lignes (他線区の運行情報) ---
// La liste ligne par ligne du vrai afficheur : pastille de couleur, nom, et
// statut — la ligne perturbée en ambre, les autres « 平常運転 ».
function drawLineStatus(
  s: ReturnType<typeof makeScreen>,
  index: number,
  clock: string,
  lang: ScreenLang,
  notice: TrafficNotice,
): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang);

  g.fillStyle = '#26303a';
  g.fillRect(0, HEADER_H, w, 40);
  g.fillStyle = '#ffffff';
  g.font = `bold 22px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText(lang === 'jp' ? '他線区の運行情報' : 'Service Status — Other Lines', 16, HEADER_H + 29);

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
function drawDelayCert(s: ReturnType<typeof makeScreen>, index: number, clock: string, lang: ScreenLang): void {
  const { g, w, h } = s;
  g.fillStyle = '#f4f6f7';
  g.fillRect(0, 0, w, h);
  drawHeader(g, w, index, clock, 'next', lang);

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
    const { index, phase, doorSide, loopDirection } = useStore.getState();

    // Écran gauche : une pub toutes les ~15 s, boucle de AD_LOOP_COUNT spots.
    const adSeed = AD_LOOP_FIRST_SEED + (Math.floor(runtime.clockMin * 4) % AD_LOOP_COUNT);
    if (adSeed !== lastAd.current) {
      lastAd.current = adSeed;
      drawLeftAd(left, adSeed);
      left.texture.needsUpdate = true;
    }

    // Écran droit : machine à états calée sur la phase du cycle.
    //
    //  à quai      → ただいま, plans jp/en, écrans zh/ko et plan du quai,
    //                puis avertissement de FERMETURE DES PORTES en toute fin
    //                d'arrêt ;
    //  en route    → つぎは, cycle quadrilingue complet, correspondances,
    //                écrans de courtoisie et manières ; si une AUTRE ligne
    //                est perturbée : info trafic, état des lignes et
    //                certificat de retard ;
    //  à l'approche→ まもなく, côté d'ouverture, alterné avec le plan du quai.
    //
    // L'arrêt d'urgence (急停車) est un événement RÉEL de la simulation
    // (stationCycle) : quand il est actif, l'écran rouge remplace toute la
    // rotation, en alternance JP/EN. Les autres états dégradés de la propre
    // ligne (retard persistant, interruption planifiée) restent non rendus :
    // la simulation n'a pas ces incidents, les afficher serait annoncer au
    // voyageur quelque chose qui n'arrive pas.
    const tick = Math.floor(runtime.clockMin * 4);
    const clock = fmtClock(runtime.clockMin);
    const countdown = Math.round(secondsToArrival(phase, runtime.phaseT, index));

    const notice = trafficNotice(runtime.clockMin);
    // Visuel manières du moment : change d'un passage du cycle à l'autre.
    const mannerVariant = Math.floor(tick / 10) % 3;
    const emergency = runtime.emergencyStop;
    let state: string;
    let status: ScreenStatus;
    if (emergency.stage !== 'none') {
      status = 'next';
      state = tick % 2 === 0 ? 'emergencyJP' : 'emergencyEN';
    } else if (phase === 'brake') {
      status = 'soon';
      state = tick % 3 === 2 ? 'platform' : 'door';
    } else if (phase === 'dwell') {
      status = 'now';
      // L'écran passe au pictogramme « portes qui ferment » avec l'annonce.
      state =
        runtime.phaseT >= dwellDuration(index) - CLOSE_ANNOUNCE_LEAD
          ? 'doorClosing'
          : ['loopJP', 'loopEN', 'nextZH', 'nextKO', 'zoomJP', 'zoomEN', 'platform'][tick % 7];
    } else {
      status = 'next';
      const rotation = notice
        ? [
            'loopJP', 'zoomJP', 'nextZH', 'nextKO', 'transfers',
            'trafficJP', 'statusJP', 'certJP',
            'loopEN', 'zoomEN',
            'trafficEN', 'statusEN', 'certEN',
            'priority', 'zoomJP', 'manner', 'loopJP', 'safety',
          ]
        : [
            'loopJP', 'zoomJP', 'nextZH', 'nextKO', 'transfers',
            'loopEN', 'zoomEN', 'priority', 'zoomJP', 'manner', 'loopJP', 'safety',
          ];
      state = rotation[tick % rotation.length];
    }

    const key = `${index}|${phase}|${state}|${mannerVariant}|${clock}|${doorSide}|${state.startsWith('loop') || state.startsWith('zoom') ? countdown : 0}`;
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
        case 'doorClosing':
          drawDoorClosing(g, index, clock);
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
        case 'manner':
          [drawPhoneManner, drawBackpackManner, drawHeadphoneManner][mannerVariant](g, index, clock);
          break;
        case 'nextZH':
          drawNextStationLang(g, index, clock, status, 'zh');
          break;
        case 'nextKO':
          drawNextStationLang(g, index, clock, status, 'ko');
          break;
        case 'trafficJP':
          if (notice) drawTrafficInfo(g, index, clock, 'jp', notice);
          else drawLoopMap(g, index, phase, countdown, clock, status, 'jp', loopDirection);
          break;
        case 'trafficEN':
          if (notice) drawTrafficInfo(g, index, clock, 'en', notice);
          else drawLoopMap(g, index, phase, countdown, clock, status, 'en', loopDirection);
          break;
        case 'statusJP':
          if (notice) drawLineStatus(g, index, clock, 'jp', notice);
          else drawLoopMap(g, index, phase, countdown, clock, status, 'jp', loopDirection);
          break;
        case 'statusEN':
          if (notice) drawLineStatus(g, index, clock, 'en', notice);
          else drawLoopMap(g, index, phase, countdown, clock, status, 'en', loopDirection);
          break;
        case 'certJP':
          drawDelayCert(g, index, clock, 'jp');
          break;
        case 'certEN':
          drawDelayCert(g, index, clock, 'en');
          break;
        case 'emergencyJP':
          drawEmergencyInfo(g, index, clock, 'jp', emergency.reason);
          break;
        case 'emergencyEN':
          drawEmergencyInfo(g, index, clock, 'en', emergency.reason);
          break;
        case 'loopJP':
          drawLoopMap(g, index, phase, countdown, clock, status, 'jp', loopDirection);
          break;
        case 'loopEN':
          drawLoopMap(g, index, phase, countdown, clock, status, 'en', loopDirection);
          break;
        case 'zoomEN':
          drawRoute(g, index, phase, countdown, clock, status, 'en', loopDirection);
          break;
        default:
          drawRoute(g, index, phase, countdown, clock, status, 'jp', loopDirection);
      }
      g.texture.needsUpdate = true;
    }
  });

  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1b1f24', roughness: 0.45 }), []);
  const surroundMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#eeece6', roughness: 0.62, metalness: 0.02 }),
    [],
  );
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
            position={[s * (CONFIG.carHalfWidth - 0.05), 2.11, z]}
            rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
          >
            {/* Grand panneau blanc de propreté au-dessus de la porte : sur la
                rame les dalles ne sont pas posées sur la paroi, elles y sont
                ENCASTRÉES, avec de la réserve blanche tout autour. */}
            <mesh position={[0, 0, -0.035]} material={surroundMat}>
              <boxGeometry args={[1.36, 0.5, 0.07]} />
            </mesh>
            {/* Deux dalles en retrait dans le panneau, chacune dans sa feuillure */}
            {([-1, 1] as const).map((k) => (
              <group key={`half${k}`} position={[k * 0.335, 0, 0]}>
                <mesh position={[0, 0, -0.012]} material={frameMat}>
                  <boxGeometry args={[0.62, 0.34, 0.03]} />
                </mesh>
                <mesh position={[0, 0, 0.004]} material={k === -1 ? leftMat : s === 1 ? rightMatA : rightMatB}>
                  <planeGeometry args={[0.58, 0.3]} />
                </mesh>
              </group>
            ))}
          </group>
        )),
      )}
    </group>
  );
}

