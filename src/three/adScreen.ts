// L'écran GAUCHE, et les dalles d'about : de la publicité en boucle, jamais
// d'information voyageurs - comme dans les vraies E235.
//
// Séparé de `lineScreen` pour une raison de dépendances et non de propreté :
// c'est la seule vue de l'afficheur qui appelle les fabriques de textures
// procédurales, lesquelles construisent des `CanvasTexture` et importent donc
// three.js. Tant qu'elle était dans le même fichier, l'écran de LIGNE - celui
// qui dit où va le train - ne pouvait pas être dessiné hors de la scène 3D.
//
// La version sonore du jeu affiche le second et n'a que faire du premier : on
// ne met pas de bandeau publicitaire dans une interface qui n'a que du texte à
// donner.

import { JP_FONT, drawAdInto } from '../textures/procedural';
import type { ScreenSurface } from './lineScreen';

export function drawLeftAd(s: ScreenSurface, seed: number): void {
  const { g, w, h } = s;
  drawAdInto(g, w, h, seed);
  g.textAlign = 'left';
}

/**
 * Un passage sur huit, le spot cède la place au bulletin météo. Assez rare
 * pour rester une surprise, assez fréquent pour qu'un trajet d'une gare à
 * l'autre ait une chance de le croiser.
 */
export const WEATHER_EVERY = 8;

/** Quantième du lendemain d'une date civile, pour le second bandeau du bulletin. */
export function tomorrowDayOf(d: { year: number; month: number; day: number }): number {
  const leap = (d.year % 4 === 0 && d.year % 100 !== 0) || d.year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d.day < days[d.month - 1] ? d.day + 1 : 1;
}

// --- Le bulletin météo de la chaîne de bord ---------------------------------
//
// Entre deux réclames, l'écran gauche passe le 「トレインチャンネル 3時間ごとの
// 天気」 du 日本気象協会 : six créneaux de trois heures, un pictogramme et une
// température par créneau, et un commentaire en bas dans une bulle.
//
// Il tire sa prévision du MÊME modèle que le ciel qu'on a au-dessus de la
// tête. Un bulletin tiré au hasard annoncerait de la pluie pour 18 h dans une
// journée qui sera belle à 18 h - et le voyageur qui reste jusque-là s'en
// apercevrait. C'est la seule information vraie de cet écran, et elle est
// vérifiable en attendant.

const WX_FONT = JP_FONT;
const WX_SKY_TOP = '#8fd4f5';
const WX_SKY_BOT = '#dff2fd';
const WX_INK = '#12417a';

/** Nuage moelleux : trois bosses et une base plate. */
function cloudPuff(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x - r * 0.8, y, r * 0.62, 0, Math.PI * 2);
  g.arc(x, y - r * 0.36, r * 0.8, 0, Math.PI * 2);
  g.arc(x + r * 0.85, y, r * 0.58, 0, Math.PI * 2);
  g.rect(x - r * 0.8, y - r * 0.1, r * 1.65, r * 0.72);
  g.fill();
}

/**
 * Pictogramme d'un temps, dans la boîte donnée. Les mêmes neuf états que le
 * modèle : on ne rend pas une météo « générique », on rend CE ciel-là.
 */
function wxGlyph(g: CanvasRenderingContext2D, kind: string, cx: number, cy: number, s: number): void {
  const sunny = kind === 'clear' || kind === 'fair';
  const wet = kind === 'drizzle' || kind === 'rain' || kind === 'downpour' || kind === 'thunder';
  const snowy = kind === 'snow' || kind === 'sleet';

  if (sunny) {
    g.fillStyle = '#f5a623';
    g.beginPath();
    g.arc(cx + (kind === 'fair' ? -s * 0.18 : 0), cy - s * 0.05, s * 0.3, 0, Math.PI * 2);
    g.fill();
    if (kind === 'clear') {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.save();
        g.translate(cx, cy - s * 0.05);
        g.rotate(a);
        g.fillRect(s * 0.36, -s * 0.045, s * 0.16, s * 0.09);
        g.restore();
      }
    }
  }
  if (!sunny || kind === 'fair') {
    g.fillStyle = kind === 'fair' ? '#ffffff' : '#c8d6e2';
    cloudPuff(g, cx + (kind === 'fair' ? s * 0.16 : 0), cy + (wet || snowy ? -s * 0.2 : 0), s * 0.42);
  }
  if (wet) {
    g.strokeStyle = '#2f7fd0';
    g.lineWidth = Math.max(1.5, s * 0.07);
    g.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(cx + i * s * 0.24, cy + s * 0.1);
      g.lineTo(cx + i * s * 0.24 - s * 0.06, cy + s * 0.42);
      g.stroke();
    }
    if (kind === 'thunder') {
      g.fillStyle = '#f5c518';
      g.beginPath();
      g.moveTo(cx + s * 0.04, cy + s * 0.06);
      g.lineTo(cx - s * 0.14, cy + s * 0.34);
      g.lineTo(cx, cy + s * 0.32);
      g.lineTo(cx - s * 0.06, cy + s * 0.52);
      g.lineTo(cx + s * 0.18, cy + s * 0.2);
      g.lineTo(cx + s * 0.04, cy + s * 0.22);
      g.closePath();
      g.fill();
    }
  }
  if (snowy) {
    g.strokeStyle = '#5aa9e6';
    g.lineWidth = Math.max(1.2, s * 0.05);
    for (let i = -1; i <= 1; i++) {
      const fx = cx + i * s * 0.24;
      const fy = cy + s * 0.3;
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        g.beginPath();
        g.moveTo(fx - Math.cos(a) * s * 0.1, fy - Math.sin(a) * s * 0.1);
        g.lineTo(fx + Math.cos(a) * s * 0.1, fy + Math.sin(a) * s * 0.1);
        g.stroke();
      }
    }
  }
}

/** Commentaire du bas : il découle de la prévision, il ne la commente pas à côté. */
function wxComment(slots: { kind: string }[]): string[] {
  const kinds = slots.map((k) => k.kind);
  const thunder = kinds.includes('thunder');
  const heavy = kinds.includes('downpour') || thunder;
  const wet = kinds.some((k) => k === 'rain' || k === 'drizzle' || k === 'downpour' || k === 'thunder');
  const snow = kinds.some((k) => k === 'snow' || k === 'sleet');
  const clear = kinds.every((k) => k === 'clear' || k === 'fair');
  if (snow) return ['雪の降る時間帯がありそうだよ', '足もとに気をつけて出かけてね'];
  if (heavy) return ['天気は下り坂で、雨や雷雨のおそれ', '雨脚の強まる所もありそうだよ'];
  if (wet) return ['傘の出番がありそうだよ', '折りたたみを持って出かけると安心だね'];
  if (clear) return ['おだやかに晴れる見込みだよ', '洗濯物もよく乾きそうだね'];
  return ['雲の多い空模様が続きそうだよ', '大きな崩れはなさそうだね'];
}

export interface WeatherSlotView {
  minute: number;
  dayOffset: number;
  kind: string;
  tempC: number;
}

export function drawWeatherPanel(
  s: ScreenSurface,
  slots: WeatherSlotView[],
  today: { month: number; day: number },
  tomorrowDay: number,
): void {
  const { g, w, h } = s;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, WX_SKY_TOP);
  sky.addColorStop(1, WX_SKY_BOT);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  cloudPuff(g, w * 0.17, h * 0.12, h * 0.09);
  cloudPuff(g, w * 0.86, h * 0.2, h * 0.07);

  // --- Titre : le gros « 3 » cerclé, la chaîne, puis 時間ごとの天気.
  g.strokeStyle = WX_INK;
  g.lineWidth = h * 0.016;
  g.beginPath();
  g.arc(w * 0.1, h * 0.135, h * 0.062, 0.5, Math.PI * 1.75);
  g.stroke();
  g.fillStyle = WX_INK;
  g.textAlign = 'center';
  g.font = `bold ${Math.round(h * 0.115)}px ${WX_FONT}`;
  g.fillText('3', w * 0.1, h * 0.175);
  g.textAlign = 'left';
  g.fillStyle = '#e8622a';
  g.font = `bold ${Math.round(h * 0.052)}px ${WX_FONT}`;
  g.fillText('トレインチャンネル', w * 0.16, h * 0.1);
  g.fillStyle = WX_INK;
  g.font = `bold ${Math.round(h * 0.082)}px ${WX_FONT}`;
  g.fillText('時間ごとの天気', w * 0.16, h * 0.19);
  g.textAlign = 'right';
  g.fillStyle = '#2b6ca8';
  g.font = `${Math.round(h * 0.042)}px ${WX_FONT}`;
  g.fillText('日本気象協会', w - h * 0.03, h * 0.09);

  // --- Grille : bandeau des jours, ligne des heures, pictogrammes, températures.
  const x0 = w * 0.175;
  const colW = (w - x0 - h * 0.03) / slots.length;
  const dayY = h * 0.24;
  const dayH = h * 0.075;
  const hourY = dayY + dayH;
  const hourH = h * 0.075;
  const iconY = hourY + hourH;
  const iconH = h * 0.24;
  const tempY = iconY + iconH;
  const tempH = h * 0.11;

  const split = slots.findIndex((k) => k.dayOffset > 0);
  const cut = split < 0 ? slots.length : split;
  g.fillStyle = '#4aa35a';
  g.fillRect(x0, dayY, colW * cut, dayH);
  if (cut < slots.length) {
    g.fillStyle = '#2f7fd0';
    g.fillRect(x0 + colW * cut, dayY, colW * (slots.length - cut), dayH);
  }
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold ${Math.round(h * 0.055)}px ${WX_FONT}`;
  g.fillText(`${today.day}日`, x0 + (colW * cut) / 2, dayY + dayH * 0.78);
  if (cut < slots.length) {
    g.fillText(`${tomorrowDay}日`, x0 + colW * cut + (colW * (slots.length - cut)) / 2, dayY + dayH * 0.78);
  }

  slots.forEach((slot, i) => {
    const cx = x0 + colW * (i + 0.5);
    const hour = Math.floor(slot.minute / 60);
    // La bande des heures suit le JOUR : claire à midi, sombre au cœur de la
    // nuit. C'est ce dégradé qui fait lire le bulletin d'un coup d'œil, avant
    // même les chiffres.
    // 1 en milieu d'après-midi, 0 au cœur de la nuit.
    const day = (Math.cos((2 * Math.PI * (hour - 14)) / 24) + 1) / 2;
    g.fillStyle = `rgb(${Math.round(30 + 200 * day)}, ${Math.round(90 + 150 * day)}, ${Math.round(150 + 90 * day)})`;
    g.fillRect(x0 + colW * i, hourY, colW, hourH);
    g.fillStyle = day > 0.55 ? '#123a5c' : '#ffffff';
    g.font = `bold ${Math.round(h * 0.05)}px ${WX_FONT}`;
    g.fillText(`${hour}時`, cx, hourY + hourH * 0.75);

    g.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.32)';
    g.fillRect(x0 + colW * i, iconY, colW, iconH + tempH);
    wxGlyph(g, slot.kind, cx, iconY + iconH * 0.5, iconH * 0.78);

    g.fillStyle = WX_INK;
    g.font = `bold ${Math.round(h * 0.078)}px ${WX_FONT}`;
    g.fillText(String(slot.tempC), cx, tempY + tempH * 0.8);
  });

  g.textAlign = 'right';
  g.fillStyle = WX_INK;
  g.font = `bold ${Math.round(h * 0.062)}px ${WX_FONT}`;
  g.fillText('東京', x0 - h * 0.03, iconY + iconH * 0.6);
  g.font = `${Math.round(h * 0.042)}px ${WX_FONT}`;
  g.fillText('気温(℃)', x0 - h * 0.03, tempY + tempH * 0.75);

  // --- Bulle de commentaire.
  const bx = w * 0.06;
  const by = tempY + tempH + h * 0.035;
  const bw = w * 0.78;
  const bh = h - by - h * 0.03;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#7fb8dd';
  g.lineWidth = Math.max(1, h * 0.006);
  g.beginPath();
  g.roundRect(bx, by, bw, bh, bh * 0.42);
  g.fill();
  g.stroke();
  g.fillStyle = WX_INK;
  g.textAlign = 'center';
  g.font = `${Math.round(h * 0.05)}px ${WX_FONT}`;
  const lines = wxComment(slots);
  lines.forEach((line, i) => g.fillText(line, bx + bw / 2, by + bh * (lines.length === 1 ? 0.62 : 0.42 + i * 0.38)));

  // Le petit personnage qui donne le commentaire, à droite de la bulle.
  const fx = w - h * 0.11;
  const fy = by + bh * 0.5;
  g.fillStyle = '#ffe0bd';
  g.beginPath();
  g.arc(fx, fy, h * 0.06, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2f4a6b';
  g.beginPath();
  g.arc(fx, fy - h * 0.014, h * 0.06, Math.PI, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a3a3a';
  g.beginPath();
  g.arc(fx - h * 0.022, fy + h * 0.012, h * 0.008, 0, Math.PI * 2);
  g.arc(fx + h * 0.022, fy + h * 0.012, h * 0.008, 0, Math.PI * 2);
  g.fill();
  g.textAlign = 'left';
}
