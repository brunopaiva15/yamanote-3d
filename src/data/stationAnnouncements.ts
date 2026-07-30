// Annonces de la sonorisation du QUAI (système ATOS), distinctes de celles de
// la rame (data/announcements.ts). Ce n'est pas la même voix, pas le même
// haut-parleur, pas le même propos : la gare parle du train qui arrive, du
// numéro de voie et de la ligne jaune ; la rame parle de la gare suivante et
// des correspondances.
//
// Quatre voix, et le sens de circulation en commande deux :
//
//   • atos-inner - l'automate du quai 内回り, une FEMME.
//   • atos-outer - l'automate du quai 外回り, un HOMME.
//
//     Les deux disent le même script, et c'est justement pour cela qu'ils ne
//     disent pas de la même bouche : sur un îlot central, les deux quais
//     annoncent à quelques secondes d'écart, et la voix est ce qui dit lequel
//     des deux vient de parler - donc de quel côté il faut se tourner. Le choix
//     passe par `atosVoiceForDirection` : aucune annonce automatique ne fixe sa
//     voix elle-même.
//
//   • agent    - l'agent de quai au micro, une femme. Plus humaine, moins
//                parfaite : c'est elle qui presse les voyageurs pendant
//                l'échange, et on l'entend juste après l'automate - ce n'est
//                plus la machine qui parle, ça s'entend au premier mot. Sa voix
//                ne dépend PAS du sens : c'est une personne, elle est sur le
//                quai, elle n'a qu'une voix.
//   • atos-en  - la voix anglaise du quai (un homme), un peu plus lente que
//                l'ATOS japonais, et la même dans les deux sens : la version
//                anglaise ne double pas les repères sonores du japonais.
//
// Le canal (quelle voix synthétise quoi) est porté par `voice`, lu par
// scripts/announcements-export.ts pour la gravure ET par data/clipKey pour la
// clé du clip - deux automates qui disent les mêmes mots ont donc deux MP3.
//
// La direction annoncée reprend mot pour mot celle de la rame
// (directionAnnouncement) : le même `loopJp(sens)` et les mêmes grands repères,
// pour que le quai et le wagon ne se contredisent pas.

import { loopJp, nextHubs, type Utterance } from './announcements.ts';
import { nextStation } from './loop.ts';
import type { LoopDirection } from './platforms.ts';
import { STATIONS } from './stations.ts';

/** Voix de synthèse visée pour un texte donné (voir le générateur Kokoro). */
export type StationVoice = 'atos-inner' | 'atos-outer' | 'agent' | 'atos-en';

export interface StationUtterance extends Utterance {
  voice: StationVoice;
}

/**
 * L'automate du quai qui dessert ce sens. Point de passage UNIQUE : toute
 * annonce automatique japonaise liée à une rame passe par ici, et il n'y a donc
 * aucun endroit où une annonce d'un sens puisse hériter de la voix de l'autre.
 */
export function atosVoiceForDirection(direction: LoopDirection): StationVoice {
  return direction === 'inner' ? 'atos-inner' : 'atos-outer';
}

function ja(text: string, voice: StationVoice): StationUtterance {
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
// saute. Elle n'est donc diffusée qu'une fois le quai vidé du train précédent,
// et pas à chaque creux - c'est le plan d'annonces qui en décide
// (systems/platformAnnouncementPlan).

export function platformPreAnnouncement(
  index: number,
  platform: number,
  dir: LoopDirection,
): StationUtterance[] {
  const b = bound(index, dir);
  return [
    ja(
      `今度の、${platform}番線の電車は、${loopJp(dir)}、${b.jp}方面行きです。`,
      atosVoiceForDirection(dir),
    ),
  ];
}

/**
 * Remerciement d'ouverture, parfois posé avant la pré-annonce. Il remercie
 * pour la LIGNE, jamais pour une compagnie : aucun exploitant réel n'est nommé
 * dans le jeu.
 *
 * Même automate que la pré-annonce qu'il précède : les deux phrases s'enchaînent
 * sans respirer, changer de bouche entre elles s'entendrait comme une coupure.
 */
export function platformGreeting(dir: LoopDirection): StationUtterance[] {
  return [
    ja(
      '本日も、山手線を、ご利用くださいまして、ありがとうございます。',
      atosVoiceForDirection(dir),
    ),
  ];
}

// --- 3. Annonce principale d'approche ------------------------------------
//
// Vient après le carillon ATOS (synthétisé, voir audioEngine.platformChime).
// La forme moderne dit 黄色い点字ブロック - les bandes podotactiles - là où
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
      atosVoiceForDirection(dir),
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

export function platformTrainEnteringAnnouncement(dir: LoopDirection): StationUtterance[] {
  return [ja('電車がまいります。ご注意ください。', atosVoiceForDirection(dir))];
}

// --- 4 bis. Train qui traverse sans s'arrêter (通過) ----------------------
//
// Celle-là ne promet rien : personne ne monte. La gare ne nomme ni la ligne,
// ni la direction, ni la destination - elle nomme la VOIE et demande de
// reculer, parce que la seule chose qui compte est qu'une rame va passer à
// pleine vitesse à trois mètres du bord. C'est aussi la seule annonce de quai
// qui parle d'une voie qui n'est pas la nôtre (voir data/passingTrains).
//
// La voix, elle, reste celle de NOTRE quai : ce sont ses diffuseurs qui
// parlent, et l'automate d'un quai ne change pas de bouche selon la voie dont
// il parle.

export function platformPassAnnouncement(
  track: number,
  dir: LoopDirection,
): StationUtterance[] {
  return [
    ja(
      `まもなく、${track}番線を、電車が通過します。` +
        '危ないですから、黄色い点字ブロックまで、お下がりください。',
      atosVoiceForDirection(dir),
    ),
    en(
      'Your attention, please. ' +
        `A train will pass through track number ${track}. ` +
        'For your safety, please stand behind the yellow line.',
    ),
  ];
}

/** Court et pressant, lancé quand la rame est en vue au bout du quai. */
export function platformPassWarning(dir: LoopDirection): StationUtterance[] {
  return [ja('電車が通過します。ご注意ください。', atosVoiceForDirection(dir))];
}

// --- 5. Annonce d'arrivée ------------------------------------------------

export function platformArrivalAnnouncement(
  index: number,
  dir: LoopDirection,
): StationUtterance[] {
  const st = STATIONS[index];
  return [
    ja(`${st.kanji}、${st.kanji}。ご乗車、ありがとうございます。`, atosVoiceForDirection(dir)),
  ];
}

// --- 6. Messages pendant l'échange des voyageurs -------------------------
//
// Ceux-là ne viennent pas du script ATOS mais de l'agent de quai : le ton est
// plus variable, il parle de ce qu'il voit. Combien il en dit - zéro, un ou
// deux - et lesquels ne se décident pas ici mais dans le plan d'annonces
// (systems/platformAnnouncementPlan), à partir de l'affluence, de l'heure, de
// la gare et du retard éventuel.

/** À quoi sert un message : c'est par là que le contexte le choisit. */
export type AgentMessageCategory =
  | 'alighting'
  | 'move-inside'
  | 'move-along-platform'
  | 'no-rushing'
  | 'wait-next-train'
  | 'clear-doors';

export interface PlatformAgentMessage {
  text: string;
  category: AgentMessageCategory;
  /** Poids de base du tirage pondéré. */
  weight: number;
  /** Affluence (0–1) en dessous de laquelle le message n'a pas lieu d'être. */
  minCrowd?: number;
  /** Réservé aux heures de pointe. */
  peakOnly?: boolean;
  /** Multiplicateur de poids quand la ligne accuse du retard. */
  delayedWeightMultiplier?: number;
}

/**
 * Ce que l'agent peut dire, et dans quelles conditions.
 *
 * Les poids ne sont pas des fréquences observées : ce sont des priorités de
 * quai. Faire descendre avant de faire monter passe partout ; demander de
 * prendre le train suivant ne se dit que quand il n'y a vraiment plus de place,
 * et le retard le rend nettement plus probable - c'est le moment où l'on
 * arrête de charger la rame pour tenir l'intervalle.
 */
export const PLATFORM_AGENT_MESSAGES: readonly PlatformAgentMessage[] = [
  {
    text: '降りるお客さまを先にお通しください。',
    category: 'alighting',
    weight: 3,
    delayedWeightMultiplier: 1.2,
  },
  {
    text: 'ドア付近のお客さまは、車内中ほどまでお進みください。',
    category: 'move-inside',
    weight: 3,
    minCrowd: 0.35,
    delayedWeightMultiplier: 2,
  },
  {
    text: 'ホーム中ほどまでお進みください。',
    category: 'move-along-platform',
    weight: 2,
    minCrowd: 0.3,
    delayedWeightMultiplier: 1.6,
  },
  {
    text: '駆け込み乗車は、おやめください。',
    category: 'no-rushing',
    weight: 2,
    delayedWeightMultiplier: 1.4,
  },
  {
    text: '無理なご乗車はおやめください。次の電車をご利用ください。',
    category: 'wait-next-train',
    weight: 1,
    minCrowd: 0.65,
    delayedWeightMultiplier: 2.5,
  },
  {
    text: 'お荷物、お身体を、ドアからお引きください。',
    category: 'clear-doors',
    weight: 2,
    minCrowd: 0.5,
    delayedWeightMultiplier: 1.8,
  },
] as const;

/** Le message d'agent numéro `n` (modulo), en voix d'agent. */
export function platformAgentMessage(n: number): StationUtterance[] {
  const i = ((n % PLATFORM_AGENT_MESSAGES.length) + PLATFORM_AGENT_MESSAGES.length) %
    PLATFORM_AGENT_MESSAGES.length;
  return [ja(PLATFORM_AGENT_MESSAGES[i].text, 'agent')];
}

/** Index du message d'une catégorie, -1 si elle n'existe pas. */
export function agentMessageIndex(category: AgentMessageCategory): number {
  return PLATFORM_AGENT_MESSAGES.findIndex((m) => m.category === category);
}

/**
 * « Laissez descendre », à l'ouverture des portes. Plus systématique : c'est le
 * plan d'annonces qui décide s'il passe, et il ne passe presque jamais dans une
 * petite gare déserte - il n'y a personne à faire patienter.
 */
export function platformAlightFirstAnnouncement(): StationUtterance[] {
  return platformAgentMessage(agentMessageIndex('alighting'));
}

// --- 8. Annonce de fermeture des portes ----------------------------------
//
// Celle du quai nomme la voie ; celle de la rame, non. C'est à ça qu'on les
// distingue quand les deux se répondent, une seconde d'écart.

export function platformDoorsClosingAnnouncement(
  platform: number,
  dir: LoopDirection,
): StationUtterance[] {
  return [
    ja(`${platform}番線、ドアが閉まります。ご注意ください。`, atosVoiceForDirection(dir)),
  ];
}

// --- 9. Porte bloquée ----------------------------------------------------
//
// Quand une porte ne se ferme pas, l'agent de quai parle par-dessus la
// procédure : il ne lit pas un script ATOS, il s'adresse à la personne qu'il
// voit dans l'encadrement, et sa voix se durcit à mesure que le départ traîne.

// Sa formulation ne recouvre JAMAIS celle du conducteur (doorReleaseAnnouncement) :
// une phrase de bord est identifiée par le seul couple (langue, texte), donc la
// voix de la rame et celle de l'agent ne peuvent pas se partager un texte sans
// que l'une prenne la bouche de l'autre. C'est vrai à l'oreille aussi : le
// conducteur lit un script depuis sa cabine, l'agent parle à quelqu'un qu'il a
// devant lui.
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
// quai quand la ligne accuse du retard - ce qui arrive après un arrêt d'urgence.
//
// Il ne parle d'aucune rame en particulier, mais il sort des diffuseurs de
// NOTRE quai : c'est donc l'automate de ce quai qui le lit, comme le reste. Un
// quai qui changerait de voix pour la seule annonce de retard s'entendrait
// comme une autre gare.

export const PLATFORM_DELAY_CAUSES = [
  'お客さま救護',
  'ドア点検',
  '車両点検',
  '線路内人立入り',
  'ホーム上の安全確認',
  '架線の停電',
] as const;

/**
 * Motif annoncé sur le quai après une coupure de caténaire (voir
 * systems/stationCycle). Nommé plutôt que compté : une insertion en tête de la
 * liste ferait annoncer un autre incident sans que rien n'échoue.
 */
export const DELAY_CAUSE_OUTAGE = PLATFORM_DELAY_CAUSES.indexOf('架線の停電');

export function platformDelayAnnouncement(
  cause: number,
  dir: LoopDirection,
): StationUtterance[] {
  const i = ((cause % PLATFORM_DELAY_CAUSES.length) + PLATFORM_DELAY_CAUSES.length) %
    PLATFORM_DELAY_CAUSES.length;
  return [
    ja(
      `山手線は、${PLATFORM_DELAY_CAUSES[i]}の影響で、一部の電車に遅れが出ています。` +
        'お急ぎのところ、ご迷惑をおかけいたします。',
      atosVoiceForDirection(dir),
    ),
  ];
}
