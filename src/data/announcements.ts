// Gabarits d'annonces JP / EN, phrasé standard JR East.

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

// Les 1 à 2 prochains grands hubs à partir de `from` (sens +1, boucle intérieure).
function nextHubs(from: number, count: number): Station[] {
  const out: Station[] = [];
  for (let step = 0; step < 30 && out.length < count; step++) {
    const i = (from + step) % 30;
    if (MAJOR_HUBS.has(i)) out.push(STATIONS[i]);
  }
  return out;
}

// Annonce du sens de la boucle, dite après le départ des grandes gares.
// La Yamanote n'a pas de terminus : on annonce le sens (内回り, boucle
// intérieure — l'unique sens simulé) et 1 à 2 gares repères à venir.
export function directionAnnouncement(index: number): Utterance[] {
  const hubs = nextHubs(index, 2);
  const jp = `この電車は、山手線、内回り、${hubs.map((h) => h.kanji).join('・')}方面です。`;
  const en =
    `This is the Yamanote Line, inner loop, bound for ${
      hubs.length === 2 ? `${hubs[0].romaji} and ${hubs[1].romaji}` : hubs[0].romaji
    }.`;
  return [
    { text: jp, lang: 'ja-JP' },
    { text: en, lang: 'en-US' },
  ];
}

// Au départ : « 次は… », station à venir + côté de sortie + correspondances.
// Le numéro de gare JY est clairement énoncé dans la version anglaise.
export function nextStationAnnouncement(index: number, side: 1 | -1): Utterance[] {
  const st = STATIONS[index];
  const tr = TRANSFERS[st.jy];
  const jp =
    `次は、${st.kanji}、${st.kanji}。お出口は${side === 1 ? '右' : '左'}側です。` +
    (tr ? `${tr.jp}は、お乗り換えです。` : '');
  const en =
    `The next station is ${st.romaji}, ${st.jy}. The doors on the ${side === 1 ? 'right' : 'left'} side will open.` +
    (tr ? ` Please change here for ${tr.en}.` : '');
  return [
    { text: jp, lang: 'ja-JP' },
    { text: en, lang: 'en-US' },
  ];
}

// À l'approche : « まもなく… ».
export function approachAnnouncement(index: number): Utterance[] {
  const st = STATIONS[index];
  return [
    { text: `まもなく、${st.kanji}、${st.kanji}。`, lang: 'ja-JP' },
    { text: `We will soon make a brief stop at ${st.romaji}, ${st.jy}.`, lang: 'en-US' },
  ];
}

// Fermeture des portes.
export function doorsClosingAnnouncement(): Utterance[] {
  return [
    { text: 'ドアが閉まります。ご注意ください。', lang: 'ja-JP' },
    { text: 'The doors are closing. Please stand clear of the doors.', lang: 'en-US' },
  ];
}

// Accueil, au démarrage de l'expérience.
export function welcomeAnnouncement(): Utterance[] {
  return [
    { text: '本日も、山手線を、ご利用くださいまして、ありがとうございます。', lang: 'ja-JP' },
    { text: 'Thank you for using the Yamanote Line.', lang: 'en-US' },
  ];
}

// --- Messages généraux de courtoisie (occasionnels, en rotation) ---

// Rappel des places prioritaires.
export function prioritySeatsAnnouncement(): Utterance[] {
  return [
    {
      text: 'この電車には、優先席があります。お年寄りや、お体の不自由なお客様に、お席をお譲りください。',
      lang: 'ja-JP',
    },
    {
      text: 'Priority seats are located in each car. Please offer your seat to passengers who may need it.',
      lang: 'en-US',
    },
  ];
}

// Téléphones en mode manière près des places prioritaires.
export function mannersAnnouncement(): Utterance[] {
  return [
    {
      text: '携帯電話は、マナーモードに設定の上、通話はご遠慮ください。',
      lang: 'ja-JP',
    },
    {
      text: 'Please set your mobile phone to silent mode and refrain from talking on the phone.',
      lang: 'en-US',
    },
  ];
}

// Attention aux bagages et aux objets oubliés.
export function belongingsAnnouncement(): Utterance[] {
  return [
    {
      text: 'お手回り品は、お忘れ物のないよう、ご注意ください。',
      lang: 'ja-JP',
    },
    {
      text: 'Please be careful not to leave any belongings behind.',
      lang: 'en-US',
    },
  ];
}

// Rotation des messages généraux : sélection selon un compteur qui avance.
const GENERAL_MESSAGES = [prioritySeatsAnnouncement, mannersAnnouncement, belongingsAnnouncement];

export function generalMessage(counter: number): Utterance[] {
  return GENERAL_MESSAGES[((counter % GENERAL_MESSAGES.length) + GENERAL_MESSAGES.length) % GENERAL_MESSAGES.length]();
}
