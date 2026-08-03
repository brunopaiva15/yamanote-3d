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

/**
 * Ombre douce à la japonaise : très courte, très diffuse, jamais noire.
 * Sur ces habillages tout est posé à un ou deux pixels au-dessus du fond -
 * assez pour décoller, jamais assez pour qu'on voie l'ombre elle-même.
 */
function wxShadow(g: CanvasRenderingContext2D, h: number, strength = 1): void {
  g.shadowColor = `rgba(16,58,105,${0.26 * strength})`;
  g.shadowBlur = h * 0.02 * strength;
  g.shadowOffsetY = h * 0.008 * strength;
}

function wxNoShadow(g: CanvasRenderingContext2D): void {
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
}

/**
 * Titre cerné de blanc : c'est ce liseré, et non une ombre portée, qui détache
 * le texte foncé d'un ciel clair sans l'alourdir. Le tracé passe AVANT le
 * remplissage, sinon le liseré ronge la lettre de l'intérieur.
 */
function wxHaloText(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number): void {
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = px * 0.16;
  g.lineJoin = 'round';
  g.strokeText(text, x, y);
  g.fillText(text, x, y);
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
  sky.addColorStop(0.62, '#c8e8fa');
  sky.addColorStop(1, WX_SKY_BOT);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // Quelques nuages très pâles : ils donnent la profondeur du fond sans jamais
  // venir concurrencer les pictogrammes, qui sont, eux, de l'information.
  g.fillStyle = 'rgba(255,255,255,0.62)';
  cloudPuff(g, w * 0.2, h * 0.1, h * 0.1);
  cloudPuff(g, w * 0.9, h * 0.16, h * 0.075);
  g.fillStyle = 'rgba(255,255,255,0.4)';
  cloudPuff(g, w * 0.62, h * 0.06, h * 0.06);
  cloudPuff(g, w * 0.06, h * 0.72, h * 0.07);

  // --- Titre : le gros « 3 » cerclé, la chaîne, puis 時間ごとの天気.
  wxShadow(g, h, 0.8);
  g.strokeStyle = WX_INK;
  g.lineWidth = h * 0.019;
  g.beginPath();
  g.arc(w * 0.105, h * 0.245, h * 0.082, 0.62, Math.PI * 1.72);
  g.stroke();
  wxNoShadow(g);
  g.fillStyle = WX_INK;
  g.textAlign = 'center';
  g.font = `bold ${Math.round(h * 0.145)}px ${WX_FONT}`;
  wxHaloText(g, '3', w * 0.105, h * 0.295, h * 0.145);

  g.textAlign = 'left';
  g.fillStyle = '#e8622a';
  g.font = `bold ${Math.round(h * 0.055)}px ${WX_FONT}`;
  wxHaloText(g, 'トレインチャンネル', w * 0.175, h * 0.16, h * 0.055);
  g.fillStyle = WX_INK;
  g.font = `bold ${Math.round(h * 0.092)}px ${WX_FONT}`;
  wxHaloText(g, '時間ごとの天気', w * 0.175, h * 0.3, h * 0.092);

  g.textAlign = 'right';
  g.fillStyle = '#3d78a8';
  g.font = `${Math.round(h * 0.04)}px ${WX_FONT}`;
  g.fillText('日本気象協会', w - h * 0.035, h * 0.095);

  // --- Grille. Les cotes suivent la capture : bandeau des jours au tiers de la
  // hauteur, pictogrammes sur le double de la hauteur d'une bande, et tout le
  // bas laissé à la bulle.
  const x0 = w * 0.175;
  const x1 = w - h * 0.035;
  const colW = (x1 - x0) / slots.length;
  const dayY = h * 0.345;
  const dayH = h * 0.068;
  const hourY = dayY + dayH;
  const hourH = h * 0.062;
  const iconY = hourY + hourH;
  const iconH = h * 0.165;
  const tempY = iconY + iconH;
  const tempH = h * 0.078;

  const split = slots.findIndex((k) => k.dayOffset > 0);
  const cut = split < 0 ? slots.length : split;
  wxShadow(g, h);
  g.fillStyle = '#4aa35a';
  g.fillRect(x0, dayY, colW * cut, dayH);
  if (cut < slots.length) {
    g.fillStyle = '#2f7fd0';
    g.fillRect(x0 + colW * cut, dayY, colW * (slots.length - cut), dayH);
  }
  wxNoShadow(g);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold ${Math.round(h * 0.052)}px ${WX_FONT}`;
  g.fillText(`${today.day}日`, x0 + (colW * cut) / 2, dayY + dayH * 0.76);
  if (cut < slots.length) {
    g.fillText(`${tomorrowDay}日`, x0 + colW * cut + (colW * (slots.length - cut)) / 2, dayY + dayH * 0.76);
  }

  // Corps du tableau : colonnes alternées, posées sous une ombre unique. Une
  // ombre par cellule empilerait six voiles au même endroit.
  wxShadow(g, h, 0.8);
  g.fillStyle = '#ffffff';
  g.fillRect(x0, iconY, colW * slots.length, iconH + tempH);
  wxNoShadow(g);

  slots.forEach((slot, i) => {
    const cx = x0 + colW * (i + 0.5);
    const hour = Math.floor(slot.minute / 60);
    // 1 en milieu d'après-midi, 0 au cœur de la nuit. La bande des heures suit
    // ce compte : elle est le seul endroit de l'écran où l'on voit passer la
    // nuit, et c'est ce qui fait lire le bulletin avant même les chiffres.
    const day = (Math.cos((2 * Math.PI * (hour - 14)) / 24) + 1) / 2;
    const warm = Math.max(0, day - 0.5) * 2;
    g.fillStyle = `rgb(${Math.round(26 + 214 * day + 12 * warm)}, ${Math.round(74 + 158 * day)}, ${Math.round(126 + 96 * day - 18 * warm)})`;
    g.fillRect(x0 + colW * i, hourY, colW, hourH);
    g.fillStyle = day > 0.58 ? '#123a5c' : '#ffffff';
    g.font = `bold ${Math.round(h * 0.048)}px ${WX_FONT}`;
    g.fillText(`${hour}時`, cx, hourY + hourH * 0.74);

    if (i % 2 === 1) {
      g.fillStyle = '#e9f4fd';
      g.fillRect(x0 + colW * i, iconY, colW, iconH + tempH);
    }

    wxShadow(g, h, 0.9);
    wxGlyph(g, slot.kind, cx, iconY + iconH * 0.52, iconH * 0.82);
    wxNoShadow(g);

    g.fillStyle = WX_INK;
    g.font = `bold ${Math.round(h * 0.072)}px ${WX_FONT}`;
    g.fillText(String(slot.tempC), cx, tempY + tempH * 0.78);
  });

  // Filets blancs entre colonnes : ils sont ce qui fait un TABLEAU, et non six
  // vignettes côte à côte. Ils s'arrêtent SOUS le bandeau des jours - le
  // traverser découpait « 27日 » en tronçons, et une journée n'est pas six
  // journées.
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = Math.max(1, h * 0.005);
  for (let i = 1; i < slots.length; i++) {
    g.beginPath();
    g.moveTo(x0 + colW * i, i === cut ? dayY : hourY);
    g.lineTo(x0 + colW * i, tempY + tempH);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(x0, tempY);
  g.lineTo(x1, tempY);
  g.stroke();

  g.textAlign = 'right';
  g.fillStyle = WX_INK;
  g.font = `bold ${Math.round(h * 0.068)}px ${WX_FONT}`;
  wxHaloText(g, '東京', x0 - h * 0.035, iconY + iconH * 0.64, h * 0.068);
  g.font = `${Math.round(h * 0.04)}px ${WX_FONT}`;
  wxHaloText(g, '気温(℃)', x0 - h * 0.035, tempY + tempH * 0.72, h * 0.04);

  // --- Bulle de commentaire, et le visage qui la prononce.
  const fx = w - h * 0.12;
  const fy = h * 0.855;
  const bx = w * 0.055;
  const by = h * 0.765;
  const bw = w - bx - h * 0.26;
  const bh = h * 0.185;
  wxShadow(g, h);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#8ec4e4';
  g.lineWidth = Math.max(1, h * 0.007);
  g.beginPath();
  g.roundRect(bx, by, bw, bh, bh * 0.44);
  g.fill();
  wxNoShadow(g);
  g.stroke();
  // Le bec de la bulle, tourné vers le visage.
  g.beginPath();
  g.moveTo(bx + bw - h * 0.01, fy - h * 0.028);
  g.lineTo(bx + bw + h * 0.05, fy);
  g.lineTo(bx + bw - h * 0.01, fy + h * 0.028);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.strokeStyle = '#8ec4e4';
  g.stroke();
  g.beginPath();
  g.moveTo(bx + bw - h * 0.016, fy - h * 0.026);
  g.lineTo(bx + bw - h * 0.016, fy + h * 0.026);
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(2, h * 0.014);
  g.stroke();

  g.fillStyle = WX_INK;
  g.textAlign = 'center';
  g.font = `${Math.round(h * 0.048)}px ${WX_FONT}`;
  const lines = wxComment(slots);
  lines.forEach((line, i) =>
    g.fillText(line, bx + bw / 2, by + bh * (lines.length === 1 ? 0.62 : 0.42 + i * 0.36)),
  );

  wxShadow(g, h, 0.7);
  g.fillStyle = '#ffe0bd';
  g.beginPath();
  g.arc(fx, fy, h * 0.075, 0, Math.PI * 2);
  g.fill();
  wxNoShadow(g);
  g.fillStyle = '#2f4a6b';
  g.beginPath();
  g.arc(fx, fy - h * 0.016, h * 0.075, Math.PI * 1.02, Math.PI * 1.98);
  g.fill();
  g.fillStyle = '#3a3a3a';
  g.beginPath();
  g.arc(fx - h * 0.026, fy + h * 0.014, h * 0.009, 0, Math.PI * 2);
  g.arc(fx + h * 0.026, fy + h * 0.014, h * 0.009, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c98b6a';
  g.lineWidth = Math.max(1, h * 0.005);
  g.beginPath();
  g.arc(fx, fy + h * 0.03, h * 0.018, 0.25, Math.PI - 0.25);
  g.stroke();
  g.textAlign = 'left';
}
