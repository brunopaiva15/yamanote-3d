// Gabarits d'annonces JP / EN, phrasé standard JR East (Yamanote / 通勤型).
// Séquences : départ = 列車案内? → 次駅 → 乗換? → 案内(0–2) ;
//             approche = まもなく(+portes) → 乗換?

import { STATIONS, TRANSFERS, type Station } from './stations';

export interface Utterance {
  text: string;
  lang: 'ja-JP' | 'en-US';
}

// Grandes gares de la boucle, servant de repères pour l'annonce du sens.
// (index 0-based dans STATIONS : 東京, 上野, 池袋, 新宿, 渋谷, 品川.)
const MAJOR_HUBS = new Set([0, 4, 12, 16, 19, 24]);

// Vrai si la gare (index) est un grand hub servant de repère de direction.
export function isMajorHub(index: number): boolean {
  return MAJOR_HUBS.has(((index % 30) + 30) % 30);
}

// Les 1 à 2 prochains grands hubs à partir de `from` (sens +1, boucle extérieure).
function nextHubs(from: number, count: number): Station[] {
  const out: Station[] = [];
  for (let step = 0; step < 30 && out.length < count; step++) {
    const i = (from + step) % 30;
    if (MAJOR_HUBS.has(i)) out.push(STATIONS[i]);
  }
  return out;
}

function doorSideJp(side: 1 | -1): string {
  return side === 1 ? '右' : '左';
}

function doorSideEn(side: 1 | -1): string {
  return side === 1 ? 'right' : 'left';
}

/** JY01 → JY-01 (forme parlée EN de la numérotation Yamanote). */
export function spokenJy(jy: string): string {
  const m = /^([A-Z]+)(\d+)$/i.exec(jy);
  if (!m) return jy;
  return `${m[1].toUpperCase()}-${m[2]}`;
}

// --- Blocs élémentaires ---

// Annonce du sens de la boucle, dite après le départ des grandes gares.
// La Yamanote n'a pas de terminus : on annonce le sens (外回り) et 1 à 2 gares repères.
export function directionAnnouncement(index: number): Utterance[] {
  const hubs = nextHubs(index, 2);
  const jpHubs = hubs.map((h) => h.kanji).join('・');
  const enHubs =
    hubs.length === 2 ? `${hubs[0].romaji} and ${hubs[1].romaji}` : hubs[0].romaji;
  return [
    { text: `この電車は、山手線外回り、${jpHubs}方面ゆきです。`, lang: 'ja-JP' },
    { text: `This is a Yamanote Line train bound for ${enHubs}.`, lang: 'en-US' },
  ];
}

// « 次は… » : station à venir + côté de sortie (forme distance courte).
export function nextStationAnnouncement(index: number, side: 1 | -1): Utterance[] {
  const st = STATIONS[index];
  const sideJp = doorSideJp(side);
  const sideEn = doorSideEn(side);
  return [
    {
      text: `次は、${st.kanji}、${st.kanji}。お出口は、${sideJp}側です。`,
      lang: 'ja-JP',
    },
    {
      text:
        `The next station is ${st.romaji}. ${spokenJy(st.jy)}. ` +
        `The doors on the ${sideEn} side will open.`,
      lang: 'en-US',
    },
  ];
}

// « まもなく… » : approche + côté de sortie.
export function approachAnnouncement(index: number, side: 1 | -1): Utterance[] {
  const st = STATIONS[index];
  const sideJp = doorSideJp(side);
  const sideEn = doorSideEn(side);
  return [
    {
      text: `まもなく、${st.kanji}、${st.kanji}。お出口は、${sideJp}側です。`,
      lang: 'ja-JP',
    },
    {
      text:
        `The next station is ${st.romaji}. ` +
        `The doors on the ${sideEn} side will open.`,
      lang: 'en-US',
    },
  ];
}

// Correspondances (乗換案内), uniquement si la gare en a.
export function transferAnnouncement(index: number): Utterance[] {
  const st = STATIONS[index];
  const tr = TRANSFERS[st.jy];
  if (!tr) return [];
  return [
    { text: `${tr.jp}は、お乗換です。`, lang: 'ja-JP' },
    { text: `Please change here for ${tr.en}.`, lang: 'en-US' },
  ];
}

// Fermeture des portes.
export function doorsClosingAnnouncement(): Utterance[] {
  return [
    { text: 'ドアが閉まります。ご注意ください。', lang: 'ja-JP' },
    { text: 'The doors are closing. Please stand clear of the doors.', lang: 'en-US' },
  ];
}

// Accueil (hors séquence standard — conservé pour usage éventuel).
export function welcomeAnnouncement(): Utterance[] {
  return [
    { text: '本日も、山手線を、ご利用くださいまして、ありがとうございます。', lang: 'ja-JP' },
    { text: 'Thank you for using the Yamanote Line.', lang: 'en-US' },
  ];
}

// --- 案内放送 (max 2 après next + transfers) ---

export function prioritySeatsAnnouncement(): Utterance[] {
  return [
    {
      text:
        'この電車には、優先席があります。優先席を必要とされるお客様がいらっしゃいましたら、席をお譲りください。お客様のご協力をお願いいたします。',
      lang: 'ja-JP',
    },
    {
      text: 'There are priority seats in most cars. Please offer your seat to those who may need it.',
      lang: 'en-US',
    },
  ];
}

export function mannersAnnouncement(): Utterance[] {
  return [
    {
      text:
        'お客様にお願いいたします。優先席付近では、携帯電話の電源をお切りください。それ以外の場所では、マナーモードに設定のうえ、通話はお控えください。ご協力をお願いいたします。',
      lang: 'ja-JP',
    },
    {
      text:
        'Please switch off your mobile phone when you are near the priority seats. ' +
        'In other areas, please set it to silent mode and refrain from talking on the phone.',
      lang: 'en-US',
    },
  ];
}

export function suddenStopAnnouncement(): Utterance[] {
  return [
    {
      text:
        'お客様にお願いいたします。電車は事故防止のため、やむを得ず急停車することがありますので、お立ちのお客様は、つり革や手すりにおつかまりください。',
      lang: 'ja-JP',
    },
    {
      text: 'It may be necessary for the train to stop suddenly to prevent an accident. So please be careful.',
      lang: 'en-US',
    },
  ];
}

// --- Arrêt d'urgence (急停車) ---
// Séquence : annonce automatique pendant le freinage, annonce conducteur une
// fois immobilisé (avec le motif), rappel d'attente si l'arrêt se prolonge,
// annonce de reprise juste avant le redémarrage.

export const EMERGENCY_REASONS = [
  { jp: '信号確認', en: 'a signal check' },
  { jp: '線路内の安全確認', en: 'a track safety check' },
  { jp: '車両の点検', en: 'a train inspection' },
] as const;

export function emergencyBrakeAnnouncement(): Utterance[] {
  return [
    { text: '急停車します。ご注意ください。', lang: 'ja-JP' },
    { text: 'This train will make an emergency stop. Please hold on.', lang: 'en-US' },
  ];
}

export function emergencyStopAnnouncement(reason: number): Utterance[] {
  const r = EMERGENCY_REASONS[((reason % EMERGENCY_REASONS.length) + EMERGENCY_REASONS.length) % EMERGENCY_REASONS.length];
  return [
    {
      text:
        `お客様にご案内いたします。ただいま、${r.jp}のため、急停車いたしました。` +
        '安全の確認を行っておりますので、恐れ入りますが、いましばらくお待ちください。',
      lang: 'ja-JP',
    },
    {
      text:
        `Attention please. This train has made an emergency stop due to ${r.en}. ` +
        'Please wait while safety checks are carried out.',
      lang: 'en-US',
    },
  ];
}

export function emergencyWaitAnnouncement(): Utterance[] {
  return [
    {
      text:
        'お客様にご案内いたします。ただいま、安全の確認を行っております。' +
        '運転再開まで、いましばらくお待ちください。ご迷惑をおかけいたします。',
      lang: 'ja-JP',
    },
    {
      text: 'Safety checks are still under way. We apologize for the delay, and thank you for your patience.',
      lang: 'en-US',
    },
  ];
}

export function emergencyResumeAnnouncement(): Utterance[] {
  return [
    {
      text: 'お待たせいたしました。安全の確認がとれましたので、まもなく運転を再開いたします。',
      lang: 'ja-JP',
    },
    {
      text: 'Thank you for waiting. Safety has been confirmed, and this train will shortly resume service.',
      lang: 'en-US',
    },
  ];
}

const GUIDANCE_POOL = [
  prioritySeatsAnnouncement,
  mannersAnnouncement,
  suddenStopAnnouncement,
] as const;

/**
 * Messages de courtoisie : seulement à certaines gares (pas à chaque arrêt),
 * un seul à la fois, en rotation. En vraie vie ils ne passent qu'occasionnellement
 * (téléphone / priorité / freinage d'urgence ≈ 1 fois par boucle chacun).
 */
export function guidanceAnnouncements(index: number): Utterance[] {
  // 1 gare sur 10 → chaque type ~1× par boucle de 30.
  if (index % 10 !== 0) return [];
  const which = Math.floor(index / 10) % GUIDANCE_POOL.length;
  return GUIDANCE_POOL[which]();
}

// --- Séquences ---

/**
 * Départ (cruise) : 列車案内? → 次駅案内 → 乗換案内? → 案内放送(0–2).
 * Direction uniquement si la gare précédente est un hub majeur.
 */
export function departureSequence(index: number, side: 1 | -1): Utterance[] {
  const out: Utterance[] = [];
  const prev = (index - 1 + 30) % 30;
  if (isMajorHub(prev)) {
    out.push(...directionAnnouncement(index));
  }
  out.push(...nextStationAnnouncement(index, side));
  out.push(...transferAnnouncement(index));
  out.push(...guidanceAnnouncements(index));
  return out;
}

/**
 * Approche (brake) : まもなく案内(+portes) → 乗換案内?
 */
export function approachSequence(index: number, side: 1 | -1): Utterance[] {
  const out: Utterance[] = [];
  out.push(...approachAnnouncement(index, side));
  out.push(...transferAnnouncement(index));
  return out;
}
