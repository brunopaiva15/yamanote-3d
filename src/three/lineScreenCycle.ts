// L'AFFICHEUR DE BORD, branché au monde.
//
// La rotation elle-même - quel écran, à quel moment - vit dans
// `lineScreenStates`, qui ne connaît ni Zustand ni horloge et se teste donc
// pour ce qu'elle est : une fonction de l'état du train vers un écran. Ce
// module-ci fait les deux choses qu'elle ne peut pas faire seule : aller
// chercher cet état, et peindre le résultat.
//
// Il a DEUX lecteurs : les dalles au-dessus des portes (`three/Screens`) et
// l'afficheur que montre la version sonore du jeu (`ui/audio/LineScreen`). Ce
// sont les mêmes écrans, dans le même ordre, au même rythme - c'est le même
// équipement de bord, regardé de deux endroits, et il n'a qu'une source de
// vérité.

import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import {
  COUNTDOWN_STATES,
  computeLineScreenFrame,
  type LineScreenFrame,
} from './lineScreenStates';
import {
  drawEmergencyBrake,
  drawEmergencyInfo,
  drawExitDoors,
  drawExitTransfers,
  drawSecurityNotice,
  drawLoopMap,
  drawOutageInfo,
  drawPhoneManner,
  drawPriorityNotice,
  drawRoute,
  drawTrafficInfo,
  drawTransfers,
  fmtClock,
  secondsToArrival,
  trafficNotice,
  type ScreenSurface,
} from './lineScreen';

export type {
  LineScreenFrame,
  LineScreenState,
  NoticeSegment,
  SegmentNotice,
  StationLayoutMode,
} from './lineScreenStates';
export {
  NOTICE_SEGMENTS,
  computeLineScreenFrame,
  segmentEntries,
  segmentKey,
  segmentNotices,
} from './lineScreenStates';
export type { ScreenAnim, ScreenAnimStep } from './lineScreenAnim';
export {
  MOTION_STEP,
  bandFill,
  bandFills,
  newScreenAnim,
  resetScreenAnim,
  stepScreenAnim,
} from './lineScreenAnim';

/**
 * Ce qui est à l'antenne à cet instant, pour le train tel qu'il roule.
 *
 * Toute la décision est dans `computeLineScreenFrame` ; ici on ne fait que lui
 * tendre l'état du monde.
 */
export function lineScreenFrame(): LineScreenFrame {
  const { index, phase, loopDirection: direction } = useStore.getState();
  const emergency = runtime.emergencyStop;
  return computeLineScreenFrame({
    index,
    phase,
    direction,
    clockMin: runtime.clockMin,
    clock: fmtClock(runtime.clockMin),
    countdown: Math.round(secondsToArrival(phase, runtime.phaseT, index, direction)),
    emergency: { stage: emergency.stage, kind: emergency.kind, reason: emergency.reason },
    notice: trafficNotice(runtime.clockMin),
  });
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
  return [
    lineScreenPageKey(f, side),
    f.clock,
    f.animated ? anim : 0,
    COUNTDOWN_STATES.has(f.state) ? f.countdown : 0,
  ].join('|');
}

/**
 * Identité de la PAGE à l'antenne - ce qui change quand l'afficheur TOURNE.
 *
 * Volontairement plus grossière que `lineScreenKey` : ni le clignotement des
 * repères, ni l'horloge, ni les minutes n'en font partie. C'est cette clé-ci
 * qui déclenche le fondu enchaîné et relance le remplissage du ruban, et le
 * partage compte dans les deux sens - y mettre le battement du clignotant
 * ferait refondre l'écran deux fois par seconde (un afficheur en train de
 * fondre en permanence, c'est-à-dire flou), et y mettre l'horloge le ferait
 * refondre à chaque minute affichée, alors que rien n'a changé de page.
 */
export function lineScreenPageKey(f: LineScreenFrame, side: 1 | -1): string {
  const { phase, doorSide } = useStore.getState();
  const layout = f.state === 'stationLayout' ? `${f.mode}/${f.lang}` : '-';
  // Un seul écran de tout le cycle change d'une paroi à l'autre : le plan des
  // sorties qui porte le côté d'ouverture. Faire entrer la paroi dans la clé
  // des autres états ferait repeindre les deux dalles pour une image identique.
  const wall = f.state === 'stationLayout' && f.mode === 'doors' ? `${doorSide}/${side}` : '-';
  return [f.index, phase, f.state, layout, f.status, wall].join('|');
}

/**
 * Peint l'image décrite par `frame` sur une surface.
 *
 * `side` est la paroi devant laquelle on se tient : elle ne change qu'UNE vue,
 * le plan des sorties en mode `doors`, qui indique si les portes qui vont
 * s'ouvrir sont de ce côté-ci. C'est la seule chose qui distingue physiquement
 * les deux dalles d'une même rame - et, dans la version sonore, elle vaut le
 * côté d'ouverture, puisqu'on regarde par-dessus l'épaule du voyageur qui va
 * descendre.
 *
 * `fill` est l'avancement du vert sur la bande de la vue rapprochée, tel que le
 * donne `lineScreenAnim` : 1 pour l'image finie, ce qui est le cas de tous les
 * autres écrans et de celui-ci une fois sa bande remplie.
 */
export function paintLineScreen(
  s: ScreenSurface,
  f: LineScreenFrame,
  anim: number,
  side: 1 | -1,
  fill = 1,
): void {
  const { index, clock, status, countdown, notice } = f;
  const { phase, doorSide, loopDirection: dir } = useStore.getState();

  if (f.state === 'stationLayout') {
    if (f.mode === 'doors') {
      drawExitDoors(s, index, clock, doorSide === side, dir, anim, f.status);
    } else {
      drawExitTransfers(s, index, clock, f.lang, dir, anim, f.status);
    }
    return;
  }

  switch (f.state) {
    case 'transfers':
      drawTransfers(s, index, clock, dir, status);
      break;
    case 'priority':
      drawPriorityNotice(s, index, clock, dir, status);
      break;
    case 'manner':
      drawPhoneManner(s, index, clock, dir, status);
      break;
    // Les deux vues « ligne perturbée » ne s'affichent que s'il y a vraiment
    // une perturbation ; sinon la rotation retombe sur le plan de la boucle
    // plutôt que de laisser un trou.
    case 'trafficJP':
      if (notice) drawTrafficInfo(s, index, clock, status, 'jp', notice, dir);
      else drawLoopMap(s, index, phase, countdown, clock, status, 'jp', dir, anim);
      break;
    case 'trafficEN':
      if (notice) drawTrafficInfo(s, index, clock, status, 'en', notice, dir);
      else drawLoopMap(s, index, phase, countdown, clock, status, 'en', dir, anim);
      break;
    case 'securityJP':
      drawSecurityNotice(s, index, clock, 'jp', dir, status);
      break;
    case 'securityEN':
      drawSecurityNotice(s, index, clock, 'en', dir, status);
      break;
    case 'brake':
      drawEmergencyBrake(s);
      break;
    case 'emergency':
      drawEmergencyInfo(s);
      break;
    case 'outage':
      drawOutageInfo(s);
      break;
    case 'loopJP':
      drawLoopMap(s, index, phase, countdown, clock, status, 'jp', dir, anim);
      break;
    case 'loopEN':
      drawLoopMap(s, index, phase, countdown, clock, status, 'en', dir, anim);
      break;
    case 'zoomEN':
      drawRoute(s, index, phase, countdown, clock, status, 'en', dir, anim, fill);
      break;
    default:
      drawRoute(s, index, phase, countdown, clock, status, 'jp', dir, anim, fill);
  }
}
