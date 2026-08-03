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
import { STATIONS } from '../data/stations';
import { prevStation, wrapStation, type LoopDirection } from '../data/loop';
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
  type ScreenStatus,
  type ScreenSurface,
  type TrafficNotice,
} from './lineScreen';

/**
 * L'écran à l'antenne, nommé.
 *
 * Ce sont les états du VRAI afficheur : plan rapproché des cinq prochaines
 * gares (`zoom`), plan complet de la boucle (`loop`), plan des sorties de la
 * gare visée en DEUX compositions (`exitTransfers`, `exitDoors`),
 * correspondances, courtoisie, sécurité, et les écrans rouges des incidents.
 *
 * Le suffixe `JP`/`EN` est la langue du cycle bilingue, et RIEN D'AUTRE. Les
 * deux plans des sorties ne le portent donc pas : ce qui les distingue n'est
 * pas la langue mais le contenu de leur bandeau bas - correspondances pendant
 * la circulation, côté d'ouverture des portes à l'approche immédiate. C'est
 * précisément ce que le code confondait, en peignant les portes sur le passage
 * japonais et les correspondances sur le passage anglais.
 */
export type LineScreenState =
  | 'zoomJP' | 'zoomEN'
  | 'loopJP' | 'loopEN'
  | 'exitTransfers' | 'exitDoors'
  | 'transfers' | 'priority' | 'manner'
  | 'trafficJP' | 'trafficEN'
  | 'securityJP' | 'securityEN'
  | 'brake' | 'emergency' | 'outage';

/**
 * Les avis qui ne passent PAS partout.
 *
 * Vigilance renforcée, places prioritaires, mode silencieux : ce sont des
 * messages de campagne, pas des informations de trajet. L'afficheur ne les
 * diffuse que sur certains intervalles - les voir revenir entre chaque paire de
 * gares, trente fois par tour, est exactement ce qui les rend faux.
 */
export type SegmentNotice = 'securityJP' | 'securityEN' | 'priority' | 'manner';

/**
 * Les secteurs où un avis spécial est attesté, et rien de plus.
 *
 * CE QUE DIT LA SOURCE : les avis de vigilance renforcée passent « notamment »
 * dans les secteurs d'Ōtsuka, de Tabata, de Shinagawa et d'Ōsaki ; les places
 * prioritaires et le mode silencieux « notamment » autour de Shinagawa et
 * d'Ōsaki. Le mot compte : c'est une liste d'EXEMPLES, pas un relevé complet.
 * Les autres intervalles de la boucle en diffusent probablement aussi - on ne
 * sait simplement pas lesquels, et une liste inventée serait pire qu'une liste
 * courte : elle se donnerait pour un relevé.
 *
 * CE QUE LA SOURCE NE DIT PAS, et qu'il faut donc décider ici :
 *
 *  1. Elle nomme des SECTEURS (« autour d'Ōsaki »), pas des intervalles
 *     orientés. On retient les deux intervalles qui touchent la gare citée -
 *     celui qui y mène et celui qui en part. C'est la lecture la plus proche du
 *     mot « secteur », et c'est une hypothèse assumée, pas un relevé.
 *  2. Elle ne distingue pas les deux sens de circulation. L'avis est donc
 *     rattaché à un intervalle GÉOGRAPHIQUE : 大崎–品川 le diffuse en 内回り
 *     comme en 外回り. Rien dans les captures ne suggère qu'un avis de campagne
 *     dépende du sens de marche - ce n'est pas une information de trajet.
 */
const NOTICE_SECTORS: { jy: string; notices: SegmentNotice[] }[] = [
  // 田端 - vigilance renforcée.
  { jy: 'JY09', notices: ['securityJP', 'securityEN'] },
  // 大塚 - vigilance renforcée.
  { jy: 'JY12', notices: ['securityJP', 'securityEN'] },
  // 大崎 - vigilance renforcée, et les deux écrans de courtoisie.
  { jy: 'JY24', notices: ['securityJP', 'securityEN', 'priority', 'manner'] },
  // 品川 - vigilance renforcée, et les deux écrans de courtoisie.
  { jy: 'JY25', notices: ['securityJP', 'securityEN', 'priority', 'manner'] },
];

/**
 * Clé d'un intervalle, indépendante du sens : les deux codes JY, triés.
 *
 * Trier n'est pas une commodité d'écriture - c'est la décision (2) ci-dessus,
 * rendue impossible à contourner : il n'existe pas de clé « JY25-JY24 » qu'on
 * pourrait remplir sans remplir aussi l'autre sens.
 */
export function segmentKey(fromJy: string, toJy: string): string {
  return fromJy < toJy ? `${fromJy}-${toJy}` : `${toJy}-${fromJy}`;
}

/** Table des intervalles, dépliée une fois depuis les secteurs. */
const SEGMENT_NOTICES: Partial<Record<string, SegmentNotice[]>> = (() => {
  const table: Record<string, SegmentNotice[]> = {};
  for (const sector of NOTICE_SECTORS) {
    const at = STATIONS.findIndex((st) => st.jy === sector.jy);
    if (at < 0) continue;
    for (const other of [wrapStation(at - 1), wrapStation(at + 1)]) {
      const key = segmentKey(sector.jy, STATIONS[other].jy);
      const list = (table[key] ??= []);
      // Deux secteurs voisins (大崎 et 品川) partagent un intervalle : leurs
      // avis s'y ajoutent sans se répéter, et les deux pages de la vigilance
      // renforcée restent dans l'ordre où elles se lisent.
      for (const n of sector.notices) if (!list.includes(n)) list.push(n);
    }
  }
  return table;
})();

/**
 * Les avis autorisés sur l'intervalle en cours - celui qu'on est en train de
 * parcourir, de la gare qu'on vient de quitter à celle qu'on vise.
 *
 * Déterministe : même intervalle, même liste, à chaque battement et à chaque
 * tour. Un tirage au sort par image ferait clignoter les écrans de courtoisie
 * d'un battement à l'autre.
 */
export function segmentNotices(index: number, dir: LoopDirection): SegmentNotice[] {
  const from = STATIONS[prevStation(index, dir)].jy;
  return SEGMENT_NOTICES[segmentKey(from, STATIONS[index].jy)] ?? [];
}

export interface LineScreenFrame {
  state: LineScreenState;
  /** ただいま / 次は / まもなく : ce que dit le bandeau du haut. */
  status: ScreenStatus;
  index: number;
  clock: string;
  /** Secondes avant l'arrivée, arrondies : les minutes affichées en viennent. */
  countdown: number;
  /** Perturbation d'une AUTRE ligne, s'il y en a une à afficher. */
  notice: TrafficNotice | null;
  /** Motif de l'arrêt d'urgence en cours (index dans EMERGENCY_REASONS). */
  emergencyReason: number;
  /**
   * Cet écran-ci bouge-t-il d'un battement à l'autre ? Les plans de ligne et
   * les plans des sorties ont des repères qui clignotent et des vantaux qui
   * coulissent ; les écrans fixes gardent leur image tant que rien ne change.
   */
  animated: boolean;
}

/** Les écrans qui se redessinent d'un battement à l'autre. */
const ANIMATED_STATES: ReadonlySet<LineScreenState> = new Set<LineScreenState>([
  'zoomJP', 'zoomEN', 'loopJP', 'loopEN', 'exitTransfers', 'exitDoors',
]);

/** Les deux plans de ligne, dont les minutes affichées suivent le décompte. */
const COUNTDOWN_STATES: ReadonlySet<LineScreenState> = new Set<LineScreenState>([
  'zoomJP', 'zoomEN', 'loopJP', 'loopEN',
]);

/**
 * Ce qui est à l'antenne à cet instant.
 *
 * La rotation suit les TROIS MOMENTS du trajet, et c'est la seule chose qui la
 * gouverne :
 *
 *   cruise (次は)   plans de ligne, plan des sorties avec correspondances,
 *                  correspondances détaillées, avis du secteur, info trafic ;
 *   brake  (まもなく) le plan des sorties avec le côté d'ouverture, et lui seul :
 *                  à dix secondes du quai, rien d'autre n'a d'importance ;
 *   dwell  (ただいま) les plans de ligne, sans côté d'ouverture - les portes sont
 *                  déjà ouvertes, l'annoncer n'apprendrait plus rien.
 */
export function lineScreenFrame(): LineScreenFrame {
  const { index, phase, loopDirection: dir } = useStore.getState();
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
    // Deux écrans, deux moments. PENDANT le freinage, l'ordre : « accrochez-
    // vous ». UNE FOIS ARRÊTÉ, l'avis : « nous ne savons pas quand ça repart ».
    // Les confondre, c'est soit crier après coup, soit expliquer pendant que le
    // voyageur cherche une barre.
    state =
      emergency.kind === 'outage' ? 'outage'
      : emergency.stage === 'braking' ? 'brake'
      : 'emergency';
  } else if (phase === 'brake') {
    status = 'soon';
    // À l'approche immédiate, l'écran ne montre QUE le plan des sorties avec le
    // côté d'ouverture. Il n'alterne plus avec la version « correspondances » :
    // cette alternance-là ne venait pas de l'afficheur, elle venait du code, qui
    // faisait tourner deux LANGUES en croyant faire tourner deux écrans.
    state = 'exitDoors';
  } else if (phase === 'dwell') {
    status = 'now';
    // Le pictogramme « portes qui ferment » a disparu des rames : l'écran ne le
    // diffuse plus, et rien ne le remplace en fin d'arrêt - on ne force pas un
    // écran pour combler un trou. Restent les plans de ligne, sous 「ただいま」.
    state = (['loopJP', 'zoomJP', 'loopEN', 'zoomEN'] as const)[tick % 4];
  } else {
    status = 'next';
    // Les autres états dégradés de la propre ligne (retard persistant,
    // interruption planifiée) restent non rendus : la simulation n'a pas ces
    // incidents, les afficher serait annoncer au voyageur quelque chose qui
    // n'arrive pas.
    const rotation: LineScreenState[] = [
      'loopJP', 'zoomJP', 'exitTransfers',
      'loopEN', 'zoomEN',
      'transfers',
      // Les avis de campagne du secteur - le plus souvent aucun.
      ...segmentNotices(index, dir),
    ];
    // L'information trafic tient sur DEUX pages qui se suivent : la japonaise
    // puis sa traduction en tableau. Les séparer dans la rotation ferait
    // attendre un tour complet pour la moitié de l'avis.
    if (notice) rotation.push('trafficJP', 'trafficEN');
    state = rotation[tick % rotation.length];
  }

  return {
    state,
    status,
    index,
    clock: fmtClock(runtime.clockMin),
    countdown: Math.round(secondsToArrival(phase, runtime.phaseT, index, dir)),
    notice,
    emergencyReason: emergency.reason,
    animated: ANIMATED_STATES.has(state),
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
    f.index, phase, f.state, f.clock,
    // Un seul écran de tout le cycle change d'une paroi à l'autre : le plan des
    // sorties qui porte le côté d'ouverture. Faire entrer la paroi dans la clé
    // des autres états ferait repeindre les deux dalles pour une image
    // identique.
    f.state === 'exitDoors' ? `${doorSide}/${side}` : '-',
    f.animated ? anim : 0,
    COUNTDOWN_STATES.has(f.state) ? f.countdown : 0,
  ].join('|');
}

/**
 * Peint l'image décrite par `frame` sur une surface.
 *
 * `side` est la paroi devant laquelle on se tient : elle ne change qu'UNE vue,
 * `exitDoors`, qui indique si les portes qui vont s'ouvrir sont de ce côté-ci.
 * C'est la seule chose qui distingue physiquement les deux dalles d'une même
 * rame - et, dans la version sonore, elle vaut le côté d'ouverture, puisqu'on
 * regarde par-dessus l'épaule du voyageur qui va descendre.
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
    case 'exitTransfers':
      drawExitTransfers(s, index, clock, dir, anim, status);
      break;
    case 'exitDoors':
      drawExitDoors(s, index, clock, openingHere, dir, anim, status);
      break;
    case 'transfers':
      drawTransfers(s, index, clock, dir);
      break;
    case 'priority':
      drawPriorityNotice(s, index, clock, dir);
      break;
    case 'manner':
      drawPhoneManner(s, index, clock, dir);
      break;
    // Les deux vues « ligne perturbée » ne s'affichent que s'il y a vraiment
    // une perturbation ; sinon la rotation retombe sur le plan de la boucle
    // plutôt que de laisser un trou.
    case 'trafficJP':
      if (notice) drawTrafficInfo(s, index, clock, 'jp', notice, dir);
      else drawLoopMap(s, index, phase, countdown, clock, status, 'jp', dir, anim);
      break;
    case 'trafficEN':
      if (notice) drawTrafficInfo(s, index, clock, 'en', notice, dir);
      else drawLoopMap(s, index, phase, countdown, clock, status, 'en', dir, anim);
      break;
    case 'securityJP':
      drawSecurityNotice(s, index, clock, 'jp', dir);
      break;
    case 'securityEN':
      drawSecurityNotice(s, index, clock, 'en', dir);
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
      drawRoute(s, index, phase, countdown, clock, status, 'en', dir, anim);
      break;
    default:
      drawRoute(s, index, phase, countdown, clock, status, 'jp', dir, anim);
  }
}
