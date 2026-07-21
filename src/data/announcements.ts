// Gabarits d'annonces JP / EN, phrasé standard JR East.

import { STATIONS, TRANSFERS } from './stations';

export interface Utterance {
  text: string;
  lang: 'ja-JP' | 'en-US';
}

// Au départ : « 次は… », station à venir + côté de sortie + correspondances.
export function nextStationAnnouncement(index: number, side: 1 | -1): Utterance[] {
  const st = STATIONS[index];
  const tr = TRANSFERS[st.jy];
  const jp =
    `次は、${st.kanji}、${st.kanji}。お出口は${side === 1 ? '右' : '左'}側です。` +
    (tr ? `${tr.jp}は、お乗り換えです。` : '');
  const en =
    `The next station is ${st.romaji}. The doors on the ${side === 1 ? 'right' : 'left'} side will open.` +
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
    { text: `We will soon make a brief stop at ${st.romaji}.`, lang: 'en-US' },
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

// Rappel des places prioritaires (occasionnel).
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
