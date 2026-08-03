// La ROTATION de l'écran de ligne : ce qu'il montre, à quel moment, et de quel
// côté de la rame.
//
// Elle vivait dans `three/Screens`, au milieu de la boucle d'images et des
// maillages. Elle en sort parce qu'elle n'a rien à voir avec le rendu 3D et
// qu'elle a désormais DEUX lecteurs : les dalles au-dessus des portes, et
// l'afficheur que montre la version sonore du jeu (ui/audio/LineScreen). Ce
// sont les mêmes écrans, dans le même ordre, au même rythme - c'est le même
// afficheur de bord, regardé de deux endroits.
//
// Ce module ne peint rien et ne connaît ni canevas ni texture : il répond à la
// question « qu'est-ce qui est à l'antenne ? ». La peinture est dans
// `lineScreen`, le dessin sur une dalle dans `Screens`, le dessin dans une page
// dans `ui/audio/LineScreen`.

import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { CLOSE_ANNOUNCE_LEAD, dwellDuration } from '../systems/stationCycle';
import {
  drawApproach,
  drawBackpackManner,
  drawDelayCert,
  drawEmergencyInfo,
  drawHeadphoneManner,
  drawLineStatus,
  drawLoopMap,
  drawNextStationLang,
  drawOutageInfo,
  drawPhoneManner,
  drawPriorityNotice,
  drawRoute,
  drawSafetyNotice,
  drawTrafficInfo,
  drawTransfers,
  fmtClock,
  secondsToArrival,
  trafficNotice,
  type ScreenStatus,
  type ScreenSurface,
  type TrafficNotice,
} from './lineScreen';

/**
 * L'écran à l'antenne, nommé.
 *
 * Ce sont les états du VRAI afficheur : plan rapproché des cinq prochaines
 * gares (`zoom`), plan complet de la boucle (`loop`), plan du quai et côté
 * d'ouverture (`approach`), correspondances, courtoisie, sécurité, et les
 * écrans rouges des incidents. Le suffixe est la langue du cycle quadrilingue.
 */
export type LineScreenState =
  | 'zoomJP' | 'zoomEN'
  | 'loopJP' | 'loopEN'
  | 'approachJP' | 'approachEN'
  | 'nextZH' | 'nextKO'
  | 'transfers' | 'priority' | 'manner' | 'safety'
  | 'trafficJP' | 'trafficEN'
  | 'statusJP' | 'statusEN'
  | 'certJP' | 'certEN'
  | 'emergencyJP' | 'emergencyEN'
  | 'outageJP' | 'outageEN';

export interface LineScreenFrame {
  state: LineScreenState;
  /** つぎは / まもなく / ただいま : ce que dit le bandeau du haut. */
  status: ScreenStatus;
  index: number;
  clock: string;
  /** Secondes avant l'arrivée, arrondies : les minutes affichées en viennent. */
  countdown: number;
  /** Visuel de courtoisie du moment (téléphone, sac à dos, écouteurs). */
  mannerVariant: number;
  /** Perturbation d'une AUTRE ligne, s'il y en a une à afficher. */
  notice: TrafficNotice | null;
  /** Motif de l'arrêt d'urgence en cours (index dans EMERGENCY_REASONS). */
  emergencyReason: number;
  /**
   * Cet écran-ci bouge-t-il d'un battement à l'autre ? Les plans de ligne et
   * le plan du quai ont des repères qui clignotent et des vantaux qui
   * coulissent ; les écrans fixes gardent leur image tant que rien ne change.
   */
  animated: boolean;
}

/**
 * Ce qui est à l'antenne à cet instant.
 *
 * `anim` est la phase de l'horloge d'animation (0…ANIM_PHASES-1), qui avance
 * d'un cran par battement : c'est elle qui fait clignoter les repères. Elle est
 * passée plutôt que tenue ici parce que chaque afficheur a la sienne - la dalle
 * de la rame et celle de la page ne battent pas forcément ensemble.
 */
export function lineScreenFrame(): LineScreenFrame {
  const { index, phase } = useStore.getState();
  const tick = Math.floor(runtime.clockMin * 4);
  const notice = trafficNotice(runtime.clockMin);
  const emergency = runtime.emergencyStop;
  let state: LineScreenState;
  let status: ScreenStatus;

  // L'arrêt d'urgence (急停車) est un événement RÉEL de la simulation
  // (stationCycle) : quand il est actif, l'écran rouge remplace toute la
  // rotation, en alternance JP/EN. La coupure de caténaire a son propre écran
  // rouge, qu'on ne voit qu'au retour de la tension - pendant la coupure, la
  // dalle est simplement éteinte et rien n'est dessiné.
  if (emergency.stage !== 'none') {
    status = 'next';
    const kind = emergency.kind === 'outage' ? 'outage' : 'emergency';
    state = (tick % 2 === 0 ? `${kind}JP` : `${kind}EN`) as LineScreenState;
  } else if (phase === 'brake') {
    status = 'soon';
    // À l'approche, l'écran ne montre QUE le plan du quai, et il alterne ses
    // deux moitiés basses : avis d'ouverture des portes en japonais,
    // correspondances en anglais - c'est le cycle du vrai afficheur.
    state = tick % 2 === 0 ? 'approachJP' : 'approachEN';
  } else if (phase === 'dwell') {
    status = 'now';
    // Le pictogramme « portes qui ferment » a disparu des rames : l'écran ne le
    // diffuse plus. Pendant l'annonce de fermeture, c'est le PLAN DU QUAI qui
    // reste à l'antenne - celui qui porte les correspondances de la gare où
    // l'on est, exactement ce qu'on cherche à la seconde où l'on décide de
    // descendre ou pas.
    state =
      runtime.phaseT >= dwellDuration(index) - CLOSE_ANNOUNCE_LEAD
        ? 'approachEN'
        : (['loopJP', 'loopEN', 'nextZH', 'nextKO', 'zoomJP', 'zoomEN', 'approachEN'][
            tick % 7
          ] as LineScreenState);
  } else {
    status = 'next';
    // Les autres états dégradés de la propre ligne (retard persistant,
    // interruption planifiée) restent non rendus : la simulation n'a pas ces
    // incidents, les afficher serait annoncer au voyageur quelque chose qui
    // n'arrive pas.
    const rotation: LineScreenState[] = notice
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

  return {
    state,
    status,
    index,
    clock: fmtClock(runtime.clockMin),
    countdown: Math.round(
      secondsToArrival(phase, runtime.phaseT, index, useStore.getState().loopDirection),
    ),
    mannerVariant: Math.floor(tick / 10) % 3,
    notice,
    emergencyReason: emergency.reason,
    animated:
      state.startsWith('approach') || state.startsWith('loop') || state.startsWith('zoom'),
  };
}

/**
 * Signature de l'image : deux battements qui donnent la même n'ont rien à
 * redessiner.
 *
 * Ce n'est pas une optimisation de confort - repeindre deux mille lignes de
 * canevas quatre fois par seconde pour un pixel inchangé se voit sur une
 * machine modeste, et c'est justement celle qui choisit la version sonore.
 */
export function lineScreenKey(f: LineScreenFrame, anim: number, side: 1 | -1): string {
  const phase = useStore.getState().phase;
  const doorSide = useStore.getState().doorSide;
  return [
    f.index, phase, f.state, f.mannerVariant, f.clock, doorSide, side,
    f.animated ? anim : 0,
    f.state.startsWith('loop') || f.state.startsWith('zoom') ? f.countdown : 0,
  ].join('|');
}

/**
 * Peint l'image décrite par `frame` sur une surface.
 *
 * `side` est la paroi devant laquelle on se tient : elle ne change qu'UNE vue,
 * le plan du quai, qui indique si les portes qui vont s'ouvrir sont de ce
 * côté-ci. C'est la seule chose qui distingue physiquement les deux dalles
 * d'une même rame - et, dans la version sonore, elle vaut le côté d'ouverture,
 * puisqu'on regarde par-dessus l'épaule du voyageur qui va descendre.
 */
export function paintLineScreen(
  s: ScreenSurface,
  f: LineScreenFrame,
  anim: number,
  side: 1 | -1,
): void {
  const { index, clock, status, countdown, notice } = f;
  const { phase, doorSide, loopDirection: dir } = useStore.getState();
  const openingHere = doorSide === side;
  switch (f.state) {
    case 'approachJP':
      drawApproach(s, index, clock, 'jp', openingHere, dir, anim, status);
      break;
    case 'approachEN':
      drawApproach(s, index, clock, 'en', openingHere, dir, anim, status);
      break;
    case 'transfers':
      drawTransfers(s, index, clock, dir);
      break;
    case 'priority':
      drawPriorityNotice(s, index, clock, dir);
      break;
    case 'safety':
      drawSafetyNotice(s, index, clock, dir);
      break;
    case 'manner':
      [drawPhoneManner, drawBackpackManner, drawHeadphoneManner][f.mannerVariant](
        s, index, clock, dir,
      );
      break;
    case 'nextZH':
      drawNextStationLang(s, index, clock, status, 'zh', dir);
      break;
    case 'nextKO':
      drawNextStationLang(s, index, clock, status, 'ko', dir);
      break;
    // Les quatre vues « ligne perturbée » ne s'affichent que s'il y a
    // vraiment une perturbation ; sinon la rotation retombe sur le plan de la
    // boucle plutôt que de laisser un trou.
    case 'trafficJP':
      if (notice) drawTrafficInfo(s, index, clock, 'jp', notice, dir);
      else drawLoopMap(s, index, phase, countdown, clock, status, 'jp', dir, anim);
      break;
    case 'trafficEN':
      if (notice) drawTrafficInfo(s, index, clock, 'en', notice, dir);
      else drawLoopMap(s, index, phase, countdown, clock, status, 'en', dir, anim);
      break;
    case 'statusJP':
      if (notice) drawLineStatus(s, index, clock, 'jp', notice, dir);
      else drawLoopMap(s, index, phase, countdown, clock, status, 'jp', dir, anim);
      break;
    case 'statusEN':
      if (notice) drawLineStatus(s, index, clock, 'en', notice, dir);
      else drawLoopMap(s, index, phase, countdown, clock, status, 'en', dir, anim);
      break;
    case 'certJP':
      drawDelayCert(s, index, clock, 'jp', dir);
      break;
    case 'certEN':
      drawDelayCert(s, index, clock, 'en', dir);
      break;
    case 'emergencyJP':
      drawEmergencyInfo(s, index, clock, 'jp', f.emergencyReason, dir);
      break;
    case 'emergencyEN':
      drawEmergencyInfo(s, index, clock, 'en', f.emergencyReason, dir);
      break;
    case 'outageJP':
      drawOutageInfo(s, index, clock, 'jp', dir);
      break;
    case 'outageEN':
      drawOutageInfo(s, index, clock, 'en', dir);
      break;
    case 'loopJP':
      drawLoopMap(s, index, phase, countdown, clock, status, 'jp', dir, anim);
      break;
    case 'loopEN':
      drawLoopMap(s, index, phase, countdown, clock, status, 'en', dir, anim);
      break;
    case 'zoomEN':
      drawRoute(s, index, phase, countdown, clock, status, 'en', dir, anim);
      break;
    default:
      drawRoute(s, index, phase, countdown, clock, status, 'jp', dir, anim);
  }
}
