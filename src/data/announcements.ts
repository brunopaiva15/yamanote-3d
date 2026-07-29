// Gabarits d'annonces JP / EN, phrasé standard JR East (Yamanote / 通勤型).
// Séquences : départ = 列車案内? → 次駅 → 乗換? → 案内(0–2) ;
//             approche = まもなく(+portes) → 乗換?
//
// Ponctuation : la sonorisation de la RAME n'utilise aucune virgule (ni 、 ni
// « , »), rien que des points. Le générateur de clips découpe le japonais sur
// la ponctuation et pose un silence par coupure — plus long au 。 qu'au 、 —,
// donc chaque respiration de ces annonces est désormais une pause pleine.
// Toute chaîne ajoutée ici doit suivre la règle ; voir `noCommas` pour les
// libellés importés d'ailleurs.
//
// Le point marque une PAUSE, pas seulement une fin de phrase — c'est la
// diction des annonces automatiques, qui posent le nom de la gare et son code
// détachés du reste : « The next station is. Shibuya. JY. 20. The doors on the
// right side will open. » L'anglais de bord suit donc le japonais
// (「次は。渋谷。渋谷。」) au lieu d'enchaîner ses groupes d'une traite.

import { loopNameJp, prevStation, stationAtHop, wrapStation } from './loop.ts';
import type { LoopDirection } from './platforms.ts';
import { LOOP_HUB_INDICES, STATIONS, TRANSFERS, type Station } from './stations.ts';

export interface Utterance {
  text: string;
  lang: 'ja-JP' | 'en-US';
}

/**
 * Sens de circulation, tel qu'il est annoncé.
 *
 * 内回り : STATIONS[i] → STATIONS[i+1], soit 東京 → 神田 → 上野 → 池袋 →
 * 新宿 → 渋谷 → 品川 → 東京 — la boucle INTÉRIEURE. 外回り fait le même tour
 * dans l'autre sens. Une seule fonction, pour la rame et pour le quai : les
 * deux sonorisations ne peuvent pas se contredire sur le sens du train
 * qu'elles annoncent.
 */
export const loopJp = loopNameJp;

// Grandes gares de la boucle, servant de repères pour l'annonce du sens :
// 東京, 上野, 池袋, 新宿, 渋谷, 品川. Dérivées de `data/stations`
// (`LOOP_HUB_JY`), qui les tient pour la signalétique — un seul relevé, trois
// lecteurs.
const MAJOR_HUBS = new Set(LOOP_HUB_INDICES);

// Vrai si la gare (index) est un grand hub servant de repère de direction.
export function isMajorHub(index: number): boolean {
  return MAJOR_HUBS.has(wrapStation(index));
}

// Les 1 à 2 prochains grands hubs à partir de `from`, dans le sens `dir`.
// Partagé avec les annonces de quai (data/stationAnnouncements) : la gare et la
// rame doivent nommer les mêmes repères de direction. En 外回り on rencontre
// évidemment les mêmes six gares, mais dans l'ordre inverse — depuis Tamachi,
// 品川・渋谷 au lieu de 東京・上野.
export function nextHubs(from: number, count: number, dir: LoopDirection): Station[] {
  const out: Station[] = [];
  for (let step = 0; step < 30 && out.length < count; step++) {
    const i = stationAtHop(from, step, dir);
    if (MAJOR_HUBS.has(i)) out.push(STATIONS[i]);
  }
  return out;
}

/**
 * Ponctuation des annonces de bord : aucune virgule, rien que des points.
 *
 * Les textes de ce fichier sont écrits directement sans virgule ; cette
 * fonction sert aux libellés venus d'ailleurs (les correspondances de
 * `TRANSFERS`, énumérées avec des 、 et des virgules), qui alimentent aussi les
 * écrans embarqués — on convertit donc à la lecture, sans toucher aux données.
 * En anglais la lettre suivante passe en capitale : après un point, c'est une
 * nouvelle phrase.
 */
function noCommas(text: string): string {
  return text
    .replace(/、/g, '。')
    .replace(/,\s+(\p{L})/gu, (_m, c: string) => `. ${c.toUpperCase()}`)
    .replace(/,/g, '.');
}

function doorSideJp(side: 1 | -1): string {
  return side === 1 ? '右' : '左';
}

function doorSideEn(side: 1 | -1): string {
  return side === 1 ? 'right' : 'left';
}

/**
 * JY01 → « JY. 01 » (forme parlée EN de la numérotation Yamanote).
 *
 * Le point entre les lettres et le nombre n'est pas une coquille : c'est une
 * pause. L'annonce de bord énonce le code de gare en deux temps — les deux
 * lettres, un souffle, le nombre —, et sans ponctuation le générateur les
 * enchaînait d'une traite. Comme partout ici, la pause s'écrit avec un point
 * (voir l'en-tête du fichier).
 */
export function spokenJy(jy: string): string {
  const m = /^([A-Z]+)(\d+)$/i.exec(jy);
  if (!m) return jy;
  return `${m[1].toUpperCase()}. ${m[2]}`;
}

// --- Blocs élémentaires ---

// Annonce du sens de la boucle, dite après le départ des grandes gares.
// La Yamanote n'a pas de terminus : on annonce le sens (内回り) et 1 à 2 gares repères.
export function directionAnnouncement(index: number, dir: LoopDirection): Utterance[] {
  const hubs = nextHubs(index, 2, dir);
  const jpHubs = hubs.map((h) => h.kanji).join('・');
  const enHubs =
    hubs.length === 2 ? `${hubs[0].romaji} and ${hubs[1].romaji}` : hubs[0].romaji;
  return [
    { text: `この電車は。${loopJp(dir)}。${jpHubs}方面ゆきです。`, lang: 'ja-JP' },
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
      text: `次は。${st.kanji}。${st.kanji}。お出口は。${sideJp}側です。`,
      lang: 'ja-JP',
    },
    {
      text:
        `The next station is. ${st.romaji}. ${spokenJy(st.jy)}. ` +
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
      text: `まもなく。${st.kanji}。${st.kanji}。お出口は。${sideJp}側です。`,
      lang: 'ja-JP',
    },
    {
      text:
        `The next station is. ${st.romaji}. ` +
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
    { text: `${noCommas(tr.jp)}は。お乗換です。`, lang: 'ja-JP' },
    { text: `Please change here for ${noCommas(tr.en)}.`, lang: 'en-US' },
  ];
}

// Fermeture des portes.
export function doorsClosingAnnouncement(): Utterance[] {
  return [
    { text: 'ドアが閉まります。ご注意ください。', lang: 'ja-JP' },
    { text: 'The doors are closing. Please stand clear of the doors.', lang: 'en-US' },
  ];
}

/**
 * Porte bloquée : le conducteur demande de dégager l'encadrement.
 *
 * Il n'existe pas d'annonce automatique pour chaque obstruction — c'est une
 * phrase dite au micro, courte, et qui se durcit d'une tentative à l'autre.
 * `insist` est le deuxième ton : la porte ne se ferme toujours pas, et ça
 * s'entend.
 */
export function doorReleaseAnnouncement(insist = false): Utterance[] {
  if (insist) {
    return [
      { text: 'ドアが閉まりません。ドアから離れてください。', lang: 'ja-JP' },
      { text: 'The doors cannot close. Please stand clear of the doors.', lang: 'en-US' },
    ];
  }
  return [
    { text: 'ドアから離れてください。', lang: 'ja-JP' },
    { text: 'Please stand clear of the doors.', lang: 'en-US' },
  ];
}

// Accueil (hors séquence standard — conservé pour usage éventuel).
export function welcomeAnnouncement(): Utterance[] {
  return [
    { text: '本日も。山手線を。ご利用くださいまして。ありがとうございます。', lang: 'ja-JP' },
    { text: 'Thank you for using the Yamanote Line.', lang: 'en-US' },
  ];
}

// --- 案内放送 (max 2 après next + transfers) ---

export function prioritySeatsAnnouncement(): Utterance[] {
  return [
    {
      text:
        'この電車には。優先席があります。優先席を必要とされるお客様がいらっしゃいましたら。席をお譲りください。お客様のご協力をお願いいたします。',
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
        'お客様にお願いいたします。優先席付近では。携帯電話の電源をお切りください。それ以外の場所では。マナーモードに設定のうえ。通話はお控えください。ご協力をお願いいたします。',
      lang: 'ja-JP',
    },
    {
      text:
        'Please switch off your mobile phone when you are near the priority seats. ' +
        'In other areas. Please set it to silent mode and refrain from talking on the phone.',
      lang: 'en-US',
    },
  ];
}

export function suddenStopAnnouncement(): Utterance[] {
  return [
    {
      text:
        'お客様にお願いいたします。電車は事故防止のため。やむを得ず急停車することがありますので。お立ちのお客様は。つり革や手すりにおつかまりください。',
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
        `お客様にご案内いたします。ただいま。${r.jp}のため。急停車いたしました。` +
        '安全の確認を行っておりますので。恐れ入りますが。いましばらくお待ちください。',
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
        'お客様にご案内いたします。ただいま。安全の確認を行っております。' +
        '運転再開まで。いましばらくお待ちください。ご迷惑をおかけいたします。',
      lang: 'ja-JP',
    },
    {
      text: 'Safety checks are still under way. We apologize for the delay. And thank you for your patience.',
      lang: 'en-US',
    },
  ];
}

export function emergencyResumeAnnouncement(): Utterance[] {
  return [
    {
      text: 'お待たせいたしました。安全の確認がとれましたので。まもなく運転を再開いたします。',
      lang: 'ja-JP',
    },
    {
      text: 'Thank you for waiting. Safety has been confirmed. And this train will shortly resume service.',
      lang: 'en-US',
    },
  ];
}

// --- Coupure de caténaire (停電) ---
// L'autre arrêt subi, et il ne se dit pas comme le premier.
//
// Ce qui parle ici n'est PAS la sonorisation automatique : elle est morte avec
// le convertisseur. C'est le conducteur, au combiné, sur les batteries de bord
// — d'où le silence des premières secondes, là où un 急停車 a son annonce
// automatique pendant le freinage. Trois messages seulement : l'explication
// une fois la rame posée, un rappel d'attente si ça dure, et le retour de la
// tension. Rien entre les deux : personne ne sait quand ça revient.

export function outageStopAnnouncement(): Utterance[] {
  return [
    {
      text:
        'お客様にご案内いたします。ただいま。架線の停電のため。この電車は停車しております。' +
        '車内の照明は非常灯に切り替わっております。復旧の見通しが立ち次第。ご案内いたしますので。' +
        '車内でお待ちください。',
      lang: 'ja-JP',
    },
    {
      text:
        'Attention please. Due to a power failure on the overhead line. This train has stopped between stations. ' +
        'The lighting has switched to emergency lamps. Please remain inside the train. And wait for further announcements.',
      lang: 'en-US',
    },
  ];
}

/**
 * Rappel d'attente, et la seule consigne de sécurité du jeu qui s'adresse à un
 * geste que le voyageur pourrait vraiment faire : ouvrir soi-même une porte au
 * robinet de secours. La voie d'à côté peut rester circulée et la caténaire
 * être remise sous tension à tout instant.
 */
export function outageWaitAnnouncement(): Utterance[] {
  return [
    {
      text:
        'お客様にお待たせしております。ただいま。電力の復旧作業を行っております。' +
        '運転再開まで。いましばらくお待ちください。危険ですので。' +
        'ドアの非常用コックには。手を触れないでください。',
      lang: 'ja-JP',
    },
    {
      text:
        'Thank you for your patience. Work to restore power is under way. Please wait a little longer. ' +
        'And for your own safety. Do not operate the emergency door release.',
      lang: 'en-US',
    },
  ];
}

export function outageRestoredAnnouncement(): Utterance[] {
  return [
    {
      text:
        'お待たせいたしました。ただいま。電気が復旧いたしました。車内の機器を確認のうえ。' +
        'まもなく運転を再開いたします。ご迷惑をおかけいたしました。',
      lang: 'ja-JP',
    },
    {
      text:
        'Thank you for waiting. Power has been restored. After equipment checks. ' +
        'This train will shortly resume service. We apologize for the delay.',
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
  // 1 gare sur 10 → chaque type ~1× par boucle de 30. Décalée sur les gares
  // calmes (鶯谷, 新大久保, 高輪GW) : à Tokyo, direction + correspondances
  // remplissent déjà presque toute la croisière.
  if (index % 10 !== 5) return [];
  const which = Math.floor(index / 10) % GUIDANCE_POOL.length;
  return GUIDANCE_POOL[which]();
}

// --- Séquences ---

/**
 * Départ (cruise) : 列車案内? → 次駅案内 → 乗換案内? → 案内放送(0–2).
 * Direction uniquement si la gare précédente est un hub majeur.
 */
export function departureSequence(index: number, side: 1 | -1, dir: LoopDirection): Utterance[] {
  const out: Utterance[] = [];
  if (isMajorHub(prevStation(index, dir))) {
    out.push(...directionAnnouncement(index, dir));
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
