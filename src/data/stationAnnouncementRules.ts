// Ce que CERTAINES gares disent en plus.
//
// Une gare de la Yamanote n'annonce pas seulement son nom et ses
// correspondances : quelques-unes ajoutent une consigne qui n'appartient qu'à
// elles, parce que leur quai a une particularité — une courbe, un dévers, un
// écart entre le seuil de la rame et le bord du quai. C'est un des rares
// endroits où la sonorisation cesse d'être interchangeable, et c'est aussi ce
// qui manquait le plus : trente gares qui disent exactement la même chose ne
// s'entendent pas comme une ligne, elles s'entendent comme un gabarit.
//
// Ces consignes vivent ICI, en données, et nulle part ailleurs : pas de `if
// (index === 19)` dans le cycle station. Une gare s'ajoute en écrivant son code
// JY dans la table, sans toucher à une seule séquence.
//
// Trois axes par consigne :
//
//   • le SENS — une consigne peut ne valoir que dans un sens (un quai en
//     courbe ne se courbe pas des deux côtés), `directions` absent = les deux ;
//   • le CANAL — la rame (`cabin`) ou le quai (`platform`) ; ce ne sont ni les
//     mêmes voix, ni les mêmes oreilles, et une consigne n'a pas à passer par
//     les deux ;
//   • l'ENDROIT — où elle s'insère dans la séquence, parce qu'une consigne de
//     descente placée avant le nom de la gare ne veut plus rien dire.
//
// RÈGLE DE PEUPLEMENT : on n'invente pas. Chaque entrée porte au-dessus d'elle
// la raison pour laquelle elle existe et ce qui la vérifie. Une gare dont on ne
// sait rien n'a pas d'entrée — l'architecture est là, elle attend.
//
// (Cycle d'import assumé : data/announcements et data/stationAnnouncements sont
// importés ici pour la diction de la rame et la voix de l'automate du quai, et
// data/announcements importe en retour ces fonctions pour ses séquences. Rien
// n'est appelé au chargement des modules — seules des fonctions déclarées se
// traversent —, donc l'ordre d'évaluation n'a aucune prise.)

import { noCommas, type Utterance } from './announcements.ts';
import { atosVoiceForDirection, type StationUtterance } from './stationAnnouncements.ts';
import type { LoopDirection } from './platforms.ts';

/** Où une consigne s'insère dans la sonorisation de la RAME. */
export type CabinNoticePosition =
  | 'after-next-station'
  | 'after-transfers'
  | 'during-approach';

export interface StationCabinNotice {
  jp: string;
  en?: string;
  /** Sens concernés ; absent = les deux. */
  directions?: LoopDirection[];
  position: CabinNoticePosition;
}

export interface StationPlatformNotice {
  jp: string;
  en?: string;
  /** Sens concernés ; absent = les deux. */
  directions?: LoopDirection[];
  /**
   * Moment de la séquence de quai :
   *   pre-approach — derrière l'annonce anticipée du prochain train ;
   *   approach     — derrière le carillon et l'annonce d'approche ;
   *   arrival      — derrière le nom de la gare, portes en train de s'ouvrir.
   */
  phase: 'pre-approach' | 'approach' | 'arrival';
}

export interface StationAnnouncementRule {
  cabin?: StationCabinNotice[];
  platform?: StationPlatformNotice[];
}

/**
 * Consigne de prudence des deux entrées de Shibuya : l'écart entre le seuil de
 * la rame et le bord du quai.
 *
 * Le JAPONAIS est commun aux deux canaux — 「足元にご注意ください」 ne dit pas dans
 * quel sens on franchit l'écart, et vaut donc pour qui descend comme pour qui
 * monte (à la ponctuation de bord près, voir plus bas).
 *
 * L'ANGLAIS, lui, ne peut pas l'être. « When you leave the train » s'adresse à
 * ceux qui descendent : c'est juste dans la rame, où l'on ne parle qu'à des gens
 * déjà à bord, et faux sur le quai, où la même phrase est entendue par ceux qui
 * attendent pour monter — et qui sont, à cet instant précis, les plus concernés
 * par l'écart. Le quai nomme donc l'écart lui-même plutôt que le geste.
 */
const GAP_JP = '電車とホームの間が空いているところがありますので、足元にご注意ください。';
const GAP_EN_CABIN = 'Please watch your step when you leave the train.';
const GAP_EN_PLATFORM = 'Please mind the gap between the train and the platform.';

export const STATION_ANNOUNCEMENT_RULES: Partial<Record<string, StationAnnouncementRule>> = {
  // JY20 渋谷 — quai en courbe, donc écart variable entre la rame et le bord.
  //
  // Vérification : le quai Yamanote de Shibuya décrit une courbe, et la
  // réunion des deux voies sur un seul îlot (travaux de janvier 2023) n'a pas
  // redressé le tracé. L'écart existe donc des DEUX côtés de l'îlot — d'où
  // l'absence de `directions` — et JR East le signale, comme partout où le
  // dévers ou la courbe éloignent le seuil du bord.
  //
  // Deux canaux, et ce n'est pas la même chose : la rame le dit à l'approche,
  // aux gens qui vont descendre ; le quai le redit à l'arrivée, aux gens qui
  // sont sur le point de mettre le pied dans le train. Aucun des deux ne
  // reprend la phrase de l'autre au même instant — et en anglais, aucun des deux
  // ne dit tout à fait la même chose (voir GAP_EN_CABIN / GAP_EN_PLATFORM).
  JY20: {
    cabin: [{ jp: GAP_JP, en: GAP_EN_CABIN, position: 'during-approach' }],
    platform: [{ jp: GAP_JP, en: GAP_EN_PLATFORM, phase: 'arrival' }],
  },
};

/** La règle s'applique-t-elle à ce sens de circulation ? */
function matchesDirection(
  notice: { directions?: LoopDirection[] },
  direction: LoopDirection,
): boolean {
  return !notice.directions || notice.directions.includes(direction);
}

/**
 * Règles d'une gare. `rules` n'existe que pour les tests : le jeu ne passe
 * jamais autre chose que la table ci-dessus.
 */
function ruleFor(
  stationJy: string,
  rules: Partial<Record<string, StationAnnouncementRule>>,
): StationAnnouncementRule | undefined {
  return rules[stationJy];
}

/**
 * Consignes de la RAME pour cette gare, ce sens et cet endroit de la séquence.
 *
 * Japonais d'abord, anglais ensuite quand il existe : c'est l'ordre de toute la
 * sonorisation de bord, et une consigne n'y fait pas exception. La ponctuation
 * passe par `noCommas` — la sono de la rame ne respire qu'aux points (voir
 * l'en-tête de data/announcements) — là où le quai, lui, garde ses 、.
 */
export function cabinNoticesForStation(
  stationJy: string,
  direction: LoopDirection,
  position: CabinNoticePosition,
  rules: Partial<Record<string, StationAnnouncementRule>> = STATION_ANNOUNCEMENT_RULES,
): Utterance[] {
  const out: Utterance[] = [];
  for (const notice of ruleFor(stationJy, rules)?.cabin ?? []) {
    if (notice.position !== position) continue;
    if (!matchesDirection(notice, direction)) continue;
    out.push({ text: noCommas(notice.jp), lang: 'ja-JP' });
    if (notice.en) out.push({ text: noCommas(notice.en), lang: 'en-US' });
  }
  return out;
}

/**
 * Consignes du QUAI pour cette gare, ce sens et ce moment de la séquence.
 *
 * La voix est celle de l'automate qui dessert ce sens (voir
 * atosVoiceForDirection) : une consigne locale n'est pas dite par une bouche à
 * part, c'est le même haut-parleur qui continue de parler.
 */
export function platformNoticesForStation(
  stationJy: string,
  direction: LoopDirection,
  phase: StationPlatformNotice['phase'],
  rules: Partial<Record<string, StationAnnouncementRule>> = STATION_ANNOUNCEMENT_RULES,
): StationUtterance[] {
  const out: StationUtterance[] = [];
  const voice = atosVoiceForDirection(direction);
  for (const notice of ruleFor(stationJy, rules)?.platform ?? []) {
    if (notice.phase !== phase) continue;
    if (!matchesDirection(notice, direction)) continue;
    out.push({ text: notice.jp, lang: 'ja-JP', voice });
    if (notice.en) out.push({ text: notice.en, lang: 'en-US', voice: 'atos-en' });
  }
  return out;
}

/** Tous les endroits de séquence de la rame, pour la gravure et les tests. */
export const CABIN_NOTICE_POSITIONS: CabinNoticePosition[] = [
  'after-next-station',
  'after-transfers',
  'during-approach',
];

/** Tous les moments de séquence du quai, pour la gravure et les tests. */
export const PLATFORM_NOTICE_PHASES: StationPlatformNotice['phase'][] = [
  'pre-approach',
  'approach',
  'arrival',
];
