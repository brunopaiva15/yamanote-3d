// Annonces de la sonorisation du QUAI (système ATOS), distinctes de celles de
// la rame (data/announcements.ts). Ce n'est pas la même voix, pas le même
// haut-parleur, pas le même propos : la gare parle du train qui arrive, du
// numéro de voie et de la ligne jaune ; la rame parle de la gare suivante et
// des correspondances.
//
// Trois voix :
//
//   • ATOS   — l'annonce automatique du quai, dite par un HOMME là où la rame
//              est une femme : les deux automates se répondent parfois à une
//              seconde d'écart, et on doit savoir sans regarder lequel des deux
//              vient de parler. Diction posée, très segmentée, une petite pause
//              entre la voie, la ligne, la direction.
//   • agent  — l'agent de quai au micro, une femme. Plus humaine, moins
//              parfaite : c'est elle qui presse les voyageurs pendant
//              l'échange, et on l'entend juste après l'automate — ce n'est
//              plus la machine qui parle, ça s'entend au premier mot.
//   • anglais — la voix anglaise du quai (un homme aussi), un peu plus lente
//              que l'ATOS.
//
// Le canal (quelle voix synthétise quoi) est porté par `voice` et lu par
// scripts/announcements-export.ts ; le runtime, lui, ne voit que du texte.
//
// La direction annoncée reprend mot pour mot celle de la rame
// (directionAnnouncement) : le même `loopJp(sens)` et les mêmes grands repères,
// pour que le quai et le wagon ne se contredisent pas.

import { loopJp, nextHubs, type Utterance } from './announcements.ts';
import { nextStation } from './loop.ts';
import type { LoopDirection } from './platforms.ts';
import { STATIONS } from './stations.ts';

/** Voix de synthèse visée pour un texte donné (voir le générateur Kokoro). */
export type StationVoice = 'atos' | 'agent' | 'atos-en';

export interface StationUtterance extends Utterance {
  voice: StationVoice;
}

function ja(text: string, voice: StationVoice = 'atos'): StationUtterance {
  return { text, lang: 'ja-JP', voice };
}

function en(text: string): StationUtterance {
  return { text, lang: 'en-US', voice: 'atos-en' };
}

// --- Direction annoncée --------------------------------------------------

/** Les deux grands repères APRÈS la gare `index`, en japonais et en anglais. */
function bound(index: number, dir: LoopDirection): { jp: string; en: string } {
  const hubs = nextHubs(nextStation(index, dir), 2, dir);
  return {
    jp: hubs.map((h) => h.kanji).join('・'),
    en: hubs.length === 2 ? `${hubs[0].romaji} and ${hubs[1].romaji}` : hubs[0].romaji,
  };
}

// --- 1. Annonce anticipée du prochain train ------------------------------
//
// Pas systématique sur la Yamanote : quand les rames se succèdent, ATOS la
// saute. Elle n'est donc diffusée qu'une fois le quai vidé du train précédent.

export function platformPreAnnouncement(
  index: number,
  platform: number,
  dir: LoopDirection,
): StationUtterance[] {
  const b = bound(index, dir);
  return [ja(`今度の、${platform}番線の電車は、${loopJp(dir)}、${b.jp}方面行きです。`)];
}

/**
 * Remerciement d'ouverture, parfois posé avant la pré-annonce. Il remercie
 * pour la LIGNE, jamais pour une compagnie : aucun exploitant réel n'est nommé
 * dans le jeu.
 */
export function platformGreeting(): StationUtterance[] {
  return [ja('本日も、山手線を、ご利用くださいまして、ありがとうございます。')];
}

// --- 3. Annonce principale d'approche ------------------------------------
//
// Vient après le carillon ATOS (synthétisé, voir audioEngine.platformChime).
// La forme moderne dit 黄色い点字ブロック — les bandes podotactiles — là où
// l'ancienne disait 黄色い線の内側.

export function platformApproachAnnouncement(
  index: number,
  platform: number,
  dir: LoopDirection,
): StationUtterance[] {
  const b = bound(index, dir);
  return [
    ja(
      `まもなく、${platform}番線に、${loopJp(dir)}、${b.jp}方面行きがまいります。` +
        '危ないですから、黄色い点字ブロックまで、お下がりください。',
    ),
    en(
      'Your attention, please. ' +
        `The Yamanote Line train bound for ${b.en} will soon arrive at track number ${platform}. ` +
        'For your safety, please stand behind the yellow line.',
    ),
  ];
}

// --- 4. Avertissement pendant l'entrée du train --------------------------
//
// Court, plus fort, répété : la rame est déjà visible. Un signal électronique
// (audioEngine.platformWarningSignal) sépare les répétitions.

export function platformTrainEnteringAnnouncement(): StationUtterance[] {
  return [ja('電車がまいります。ご注意ください。')];
}

// --- 4 bis. Train qui traverse sans s'arrêter (通過) ----------------------
//
// Celle-là ne promet rien : personne ne monte. La gare ne nomme ni la ligne,
// ni la direction, ni la destination — elle nomme la VOIE et demande de
// reculer, parce que la seule chose qui compte est qu'une rame va passer à
// pleine vitesse à trois mètres du bord. C'est aussi la seule annonce de quai
// qui parle d'une voie qui n'est pas la nôtre (voir data/passingTrains).

export function platformPassAnnouncement(platform: number): StationUtterance[] {
  return [
    ja(
      `まもなく、${platform}番線を、電車が通過します。` +
        '危ないですから、黄色い点字ブロックまで、お下がりください。',
    ),
    en(
      'Your attention, please. ' +
        `A train will pass through track number ${platform}. ` +
        'For your safety, please stand behind the yellow line.',
    ),
  ];
}

/** Court et pressant, lancé quand la rame est en vue au bout du quai. */
export function platformPassWarning(): StationUtterance[] {
  return [ja('電車が通過します。ご注意ください。')];
}

// --- 5. Annonce d'arrivée ------------------------------------------------

export function platformArrivalAnnouncement(index: number): StationUtterance[] {
  const st = STATIONS[index];
  return [ja(`${st.kanji}、${st.kanji}。ご乗車、ありがとうございます。`)];
}

// --- 6. Messages pendant l'échange des voyageurs -------------------------
//
// Ceux-là ne viennent pas du script ATOS mais de l'agent de quai : le ton est
// plus variable, il parle de ce qu'il voit. On en tire un ou deux par arrêt.

export const PLATFORM_AGENT_MESSAGES = [
  '降りるお客さまを先にお通しください。',
  'ドア付近のお客さまは、車内中ほどまでお進みください。',
  'ホーム中ほどまでお進みください。',
  '駆け込み乗車は、おやめください。',
  '無理なご乗車はおやめください。次の電車をご利用ください。',
  'お荷物、お身体を、ドアからお引きください。',
] as const;

/** Le message d'agent numéro `n` (modulo), en voix d'agent. */
export function platformAgentMessage(n: number): StationUtterance[] {
  const i = ((n % PLATFORM_AGENT_MESSAGES.length) + PLATFORM_AGENT_MESSAGES.length) %
    PLATFORM_AGENT_MESSAGES.length;
  return [ja(PLATFORM_AGENT_MESSAGES[i], 'agent')];
}

/** « Laissez descendre » : toujours le premier, à l'ouverture des portes. */
export function platformAlightFirstAnnouncement(): StationUtterance[] {
  return [ja(PLATFORM_AGENT_MESSAGES[0], 'agent')];
}

// --- 8. Annonce de fermeture des portes ----------------------------------
//
// Celle du quai nomme la voie ; celle de la rame, non. C'est à ça qu'on les
// distingue quand les deux se répondent, une seconde d'écart.

export function platformDoorsClosingAnnouncement(platform: number): StationUtterance[] {
  return [ja(`${platform}番線、ドアが閉まります。ご注意ください。`)];
}

// --- 9. Porte bloquée ----------------------------------------------------
//
// Quand une porte ne se ferme pas, l'agent de quai parle par-dessus la
// procédure : il ne lit pas un script ATOS, il s'adresse à la personne qu'il
// voit dans l'encadrement, et sa voix se durcit à mesure que le départ traîne.

// Sa formulation ne recouvre JAMAIS celle du conducteur (doorReleaseAnnouncement) :
// un clip est identifié par le seul couple (langue, texte), donc deux voix ne
// peuvent pas se partager une phrase — celle qui grave en dernier prendrait la
// bouche de l'autre. C'est vrai à l'oreille aussi : le conducteur lit un script
// depuis sa cabine, l'agent parle à quelqu'un qu'il a devant lui.
export const PLATFORM_DOOR_RELEASE = [
  '危ないですから、ドアから離れてください。',
  'お荷物、お身体を、ドアからお引きください。',
  'ドアが閉まりません。もう一度、ドアから離れてください。',
] as const;

/** La consigne numéro `n` (modulo), en voix d'agent. */
export function platformDoorReleaseAnnouncement(n: number): StationUtterance[] {
  const i = ((n % PLATFORM_DOOR_RELEASE.length) + PLATFORM_DOOR_RELEASE.length) %
    PLATFORM_DOOR_RELEASE.length;
  return [ja(PLATFORM_DOOR_RELEASE[i], 'agent')];
}

/** Toutes les portes rouvertes : l'agent vient dégager lui-même le passage. */
export function platformDoorCheckAnnouncement(): StationUtterance[] {
  return [
    ja('お待たせしております。ただいま、ドアの確認を行っております。', 'agent'),
    ja('しばらくお待ちください。', 'agent'),
  ];
}

// --- Retard --------------------------------------------------------------
//
// Message dynamique : le motif est inséré dans un gabarit fixe. Diffusé sur le
// quai quand la ligne accuse du retard — ce qui arrive après un arrêt d'urgence.

export const PLATFORM_DELAY_CAUSES = [
  'お客さま救護',
  'ドア点検',
  '車両点検',
  '線路内人立入り',
  'ホーム上の安全確認',
] as const;

export function platformDelayAnnouncement(cause: number): StationUtterance[] {
  const i = ((cause % PLATFORM_DELAY_CAUSES.length) + PLATFORM_DELAY_CAUSES.length) %
    PLATFORM_DELAY_CAUSES.length;
  return [
    ja(
      `山手線は、${PLATFORM_DELAY_CAUSES[i]}の影響で、一部の電車に遅れが出ています。` +
        'お急ぎのところ、ご迷惑をおかけいたします。',
    ),
  ];
}
