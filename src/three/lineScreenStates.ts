// QUEL ÉCRAN EST À L'ANTENNE : la machine à états de l'afficheur de bord,
// séparée de tout ce qui la branche au monde.
//
// Ce module ne lit ni Zustand, ni `runtime`, ni horloge : on lui donne l'état
// du train, il rend l'écran. C'est `lineScreenCycle` qui va chercher ces
// valeurs et appelle `computeLineScreenFrame` - la rotation, elle, tient
// entièrement ici.
//
// Cette séparation n'est pas de la mise en ordre. Les états de cet afficheur ne
// se vérifiaient jusqu'ici qu'en LISANT le source : le module de rotation tenait
// à `store`, donc à zustand et au document, que le harnais de `node --test` n'a
// pas. Des tests qui cherchent des noms de variables dans un fichier ne disent
// rien de ce que la rame affiche à la trentième seconde de freinage. Ici, ils le
// disent : on appelle la fonction, on regarde ce qui sort.
//
// Les imports portent leur extension `.ts` - comme toute la couche `data/` -
// pour que Node les résolve tels quels.

import { STATIONS } from '../data/stations.ts';
import { prevStation } from '../data/loop.ts';
import type { LoopDirection } from '../data/platforms.ts';
import type { DataConfidence } from '../data/evidence.ts';
import type { Phase } from '../store';
import type { ScreenLang, ScreenStatus, TrafficNotice } from './lineScreen';

/**
 * L'écran à l'antenne, nommé.
 *
 * Le suffixe `JP`/`EN` est la langue du cycle bilingue, et RIEN D'AUTRE : ces
 * écrans-là ont deux versions attestées, l'une traduisant l'autre.
 *
 * `stationLayout` n'en porte pas, et c'est le cœur de la correction : ce qui
 * distingue ses deux formes n'est pas la langue mais le CONTENU de son bandeau
 * bas, porté à part par `mode`. Le code peignait autrefois les portes sur le
 * passage japonais et les correspondances sur le passage anglais, mêlant dans un
 * seul nom deux dimensions indépendantes. Elles le restent ici : `mode` dit ce
 * qu'on montre, `lang` dans quelle langue.
 */
export type LineScreenState =
  | 'zoomJP' | 'zoomEN'
  | 'loopJP' | 'loopEN'
  | 'stationLayout'
  | 'transfers' | 'priority' | 'manner'
  | 'trafficJP' | 'trafficEN'
  | 'securityJP' | 'securityEN'
  | 'brake' | 'emergency' | 'outage';

/**
 * Les deux bandeaux bas du plan des sorties. Une seule mise en page au-dessus -
 * quai, accès, cartouches, rame -, deux façons de la conclure.
 */
export type StationLayoutMode = 'transfers' | 'doors';

/**
 * Les avis qui ne passent PAS partout.
 *
 * Vigilance renforcée, places prioritaires, mode silencieux : ce sont des
 * messages de campagne, pas des informations de trajet. L'afficheur ne les
 * diffuse que sur certains intervalles - les voir revenir entre chaque paire de
 * gares, trente fois par tour, est exactement ce qui les rend faux.
 */
export type SegmentNotice = 'securityJP' | 'securityEN' | 'priority' | 'manner';

/** L'état d'un arrêt d'urgence, réduit à ce que l'affichage en regarde. */
export interface EmergencyView {
  stage: 'none' | 'coasting' | 'braking' | 'stopped' | 'resuming';
  kind: 'brake' | 'outage';
  reason: number;
}

interface LineScreenFrameBase {
  index: number;
  clock: string;
  /** Secondes avant l'arrivée, arrondies : les minutes affichées en viennent. */
  countdown: number;
  /** Perturbation d'une AUTRE ligne, s'il y en a une à afficher. */
  notice: TrafficNotice | null;
  /** Motif de l'arrêt d'urgence en cours (index dans EMERGENCY_REASONS). */
  emergencyReason: number;
  /**
   * Cet écran-ci bouge-t-il d'un battement à l'autre ? Les plans de ligne et le
   * plan des sorties ont des repères qui clignotent et des vantaux qui
   * coulissent ; les écrans fixes gardent leur image tant que rien ne change.
   */
  animated: boolean;
}

/**
 * L'image décrite, sous une forme qui rend les combinaisons fausses
 * INEXPRIMABLES.
 *
 * Une union discriminée plutôt qu'un enregistrement à champs optionnels, pour
 * deux interdits qui ne se voient pas à la relecture :
 *
 *   • `{ mode: 'doors', status: 'now' }` - annoncer le côté d'ouverture à un
 *     voyageur dont les portes sont déjà ouvertes ;
 *   • `{ mode: 'doors', lang: 'en' }` - une version anglaise du plan des portes,
 *     qu'aucune capture n'atteste. Le japonais de cet écran porte déjà sa ligne
 *     anglaise dans la capture ; ce n'est pas un passage anglais du cycle, c'est
 *     une seconde ligne du même écran.
 *
 * Le plan des correspondances, lui, EST bilingue par passages : la revue Hitachi
 * (E235系山手線 駅設備案内画面, figure 6, août 2017) en donne les deux versions,
 * 「ただいま 秋葉原」 et « Now stopping at Akihabara », mêmes pictogrammes,
 * mêmes cartouches, même bandeau bas.
 */
export type LineScreenFrame =
  | (LineScreenFrameBase & {
      state: Exclude<LineScreenState, 'stationLayout'>;
      status: ScreenStatus;
    })
  | (LineScreenFrameBase & {
      state: 'stationLayout';
      /** Bandeau bas : les correspondances de la gare. */
      mode: 'transfers';
      /**
       * 次は pendant la marche, ただいま à quai. Les deux captures de la figure 6
       * sont prises à quai ; la version en marche suit la même mise en page, le
       * bandeau seul changeant d'état.
       */
      status: 'next' | 'now';
      lang: ScreenLang;
    })
  | (LineScreenFrameBase & {
      state: 'stationLayout';
      /** Bandeau bas : le côté réel d'ouverture des portes. */
      mode: 'doors';
      /** Et rien d'autre : ce bandeau-là n'existe qu'à l'approche immédiate. */
      status: 'soon';
      /** Seule la composition japonaise est attestée. */
      lang: 'jp';
    });

/**
 * Un intervalle qui diffuse un avis de campagne, avec ce qu'on sait de lui.
 *
 * Le champ `confidence` n'est pas décoratif : aucune de ces entrées n'est un
 * relevé. Il reprend le vocabulaire de `data/evidence`, déjà employé partout
 * ailleurs dans le dépôt pour les valeurs dont la provenance compte.
 */
export interface NoticeSegment {
  /** Codes JY des deux gares qui bornent l'intervalle, dans n'importe quel ordre. */
  from: string;
  to: string;
  /**
   * Sens concernés. `'both'` là où l'on n'a aucune raison de croire que l'avis
   * dépend du sens de marche - ce n'est pas une information de trajet.
   */
  directions: LoopDirection[] | 'both';
  notices: SegmentNotice[];
  confidence: DataConfidence;
  source: string;
}

/**
 * Les intervalles à avis, et ce qui les justifie.
 *
 * CE QUE DIT LA SOURCE : les avis de vigilance renforcée passent « notamment »
 * dans les secteurs d'Ōtsuka, de Tabata, de Shinagawa et d'Ōsaki ; les places
 * prioritaires et le mode silencieux « notamment » autour de Shinagawa et
 * d'Ōsaki. Le mot compte : ce sont des EXEMPLES, et la source ne donne ni les
 * paires de gares, ni le sens, ni la longueur des secteurs.
 *
 * CE QUE CETTE TABLE EST DONC : une approximation de jeu. Chaque secteur cité y
 * est rendu par les deux intervalles qui touchent la gare nommée, dans les deux
 * sens. C'est une lecture plausible du mot « secteur », ce n'est pas un relevé,
 * et aucune entrée n'est marquée `confirmed` tant qu'une capture ne l'aura pas
 * établie. Les autres intervalles de la boucle en diffusent très probablement
 * aussi - on ne sait pas lesquels, et les inventer serait pire que de les
 * omettre : la liste se donnerait alors pour un relevé.
 */
export const NOTICE_SEGMENTS: NoticeSegment[] = [
  {
    from: 'JY08', to: 'JY09', directions: 'both',
    notices: ['securityJP', 'securityEN'],
    confidence: 'estimated',
    source: 'secteur de 田端 cité en exemple ; bornes de l’intervalle non fournies',
  },
  {
    from: 'JY09', to: 'JY10', directions: 'both',
    notices: ['securityJP', 'securityEN'],
    confidence: 'estimated',
    source: 'secteur de 田端 cité en exemple ; bornes de l’intervalle non fournies',
  },
  {
    from: 'JY11', to: 'JY12', directions: 'both',
    notices: ['securityJP', 'securityEN'],
    confidence: 'estimated',
    source: 'secteur de 大塚 cité en exemple ; bornes de l’intervalle non fournies',
  },
  {
    from: 'JY12', to: 'JY13', directions: 'both',
    notices: ['securityJP', 'securityEN'],
    confidence: 'estimated',
    source: 'secteur de 大塚 cité en exemple ; bornes de l’intervalle non fournies',
  },
  {
    from: 'JY23', to: 'JY24', directions: 'both',
    notices: ['securityJP', 'securityEN', 'priority', 'manner'],
    confidence: 'estimated',
    source: 'secteur de 大崎 cité en exemple ; bornes de l’intervalle non fournies',
  },
  {
    from: 'JY24', to: 'JY25', directions: 'both',
    notices: ['securityJP', 'securityEN', 'priority', 'manner'],
    confidence: 'estimated',
    source: 'secteurs de 大崎 et de 品川 cités en exemple ; bornes non fournies',
  },
  {
    from: 'JY25', to: 'JY26', directions: 'both',
    notices: ['securityJP', 'securityEN', 'priority', 'manner'],
    confidence: 'estimated',
    source: 'secteur de 品川 cité en exemple ; bornes de l’intervalle non fournies',
  },
];

/**
 * Clé d'un intervalle : les deux codes JY, triés.
 *
 * Trier n'est pas une commodité d'écriture. Tant qu'on ne sait pas si un avis
 * dépend du sens de marche, il ne doit pas être POSSIBLE d'en inscrire un dans
 * un seul sens par distraction : il n'existe pas de clé « JY25-JY24 » à côté de
 * « JY24-JY25 ». Le sens, quand on le connaîtra, se dira par `directions`.
 */
export function segmentKey(fromJy: string, toJy: string): string {
  return fromJy < toJy ? `${fromJy}-${toJy}` : `${toJy}-${fromJy}`;
}

/** Les entrées d'un intervalle, regroupées une fois pour toutes. */
const SEGMENT_TABLE: Map<string, NoticeSegment[]> = (() => {
  const table = new Map<string, NoticeSegment[]>();
  for (const seg of NOTICE_SEGMENTS) {
    const key = segmentKey(seg.from, seg.to);
    const list = table.get(key);
    if (list) list.push(seg);
    else table.set(key, [seg]);
  }
  return table;
})();

/** Vrai si cette entrée s'applique au sens demandé. */
function appliesTo(seg: NoticeSegment, dir: LoopDirection): boolean {
  return seg.directions === 'both' || seg.directions.includes(dir);
}

/**
 * Les entrées qui régissent l'intervalle en cours - celui qu'on parcourt, de la
 * gare qu'on vient de quitter à celle qu'on vise. Rendues telles quelles, avec
 * leur niveau de confiance : c'est ce qui permet à un test, ou à un futur
 * relevé, de distinguer ce qui est établi de ce qui est approché.
 */
export function segmentEntries(index: number, dir: LoopDirection): NoticeSegment[] {
  const from = STATIONS[prevStation(index, dir)].jy;
  const key = segmentKey(from, STATIONS[index].jy);
  return (SEGMENT_TABLE.get(key) ?? []).filter((seg) => appliesTo(seg, dir));
}

/**
 * Les avis autorisés sur l'intervalle en cours.
 *
 * Déterministe : même intervalle, même liste, à chaque battement et à chaque
 * tour. Aucun tirage au sort - un avis qui apparaîtrait une image sur deux se
 * lirait comme un défaut d'affichage.
 */
export function segmentNotices(index: number, dir: LoopDirection): SegmentNotice[] {
  const out: SegmentNotice[] = [];
  for (const seg of segmentEntries(index, dir)) {
    // Deux secteurs voisins (大崎 et 品川) peuvent se partager un intervalle :
    // leurs avis s'y ajoutent sans se répéter, et les deux pages de la
    // vigilance renforcée restent dans l'ordre où elles se lisent.
    for (const n of seg.notices) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** Les écrans qui se redessinent d'un battement à l'autre. */
const ANIMATED_STATES: ReadonlySet<LineScreenState> = new Set<LineScreenState>([
  'zoomJP', 'zoomEN', 'loopJP', 'loopEN', 'stationLayout',
]);

/** Les deux plans de ligne, dont les minutes affichées suivent le décompte. */
export const COUNTDOWN_STATES: ReadonlySet<LineScreenState> = new Set<LineScreenState>([
  'zoomJP', 'zoomEN', 'loopJP', 'loopEN',
]);

/** Tout ce que la rotation a besoin de savoir du train. */
export interface LineScreenInput {
  /** Gare visée en marche, gare où l'on EST à quai - c'est `store.index`. */
  index: number;
  phase: Phase;
  direction: LoopDirection;
  /** Horloge de bord en minutes : elle cadence la rotation (quatre pas/minute). */
  clockMin: number;
  /** Heure déjà mise en forme : la mise en forme vit avec la peinture. */
  clock: string;
  countdown: number;
  emergency: EmergencyView;
  notice: TrafficNotice | null;
}

/**
 * Une case de la rotation : un écran simple, ou le plan des sorties avec la
 * langue de son passage.
 *
 * Un objet plutôt qu'un jeton `stationLayoutJP` : c'est ce nom-là, précisément,
 * qui recollait la langue au contenu.
 */
type Slot = Exclude<LineScreenState, 'stationLayout'> | { layout: ScreenLang };

/**
 * Ce qui est à l'antenne à cet instant.
 *
 * La rotation suit les TROIS MOMENTS du trajet, et c'est la seule chose qui la
 * gouverne :
 *
 *   cruise (次は)     plans de ligne, plan des sorties avec correspondances,
 *                    correspondances détaillées, avis du secteur, info trafic ;
 *   brake  (まもなく)  le plan des sorties avec le côté d'ouverture, et lui seul :
 *                    à dix secondes du quai, rien d'autre n'a d'importance ;
 *   dwell  (ただいま)  les plans de ligne et le plan des sorties de la gare où
 *                    l'on EST - jamais le côté d'ouverture, les portes sont
 *                    déjà ouvertes et l'annoncer n'apprendrait plus rien.
 */
export function computeLineScreenFrame(input: LineScreenInput): LineScreenFrame {
  const { index, phase, direction: dir, clockMin, clock, countdown, emergency, notice } = input;
  const tick = Math.floor(clockMin * 4);
  const base = {
    index,
    clock,
    countdown,
    notice,
    emergencyReason: emergency.reason,
  };
  const plain = (
    state: Exclude<LineScreenState, 'stationLayout'>,
    status: ScreenStatus,
  ): LineScreenFrame => ({ ...base, state, status, animated: ANIMATED_STATES.has(state) });

  // L'arrêt d'urgence (急停車) est un événement RÉEL de la simulation
  // (stationCycle) : quand il est actif, l'écran rouge remplace toute la
  // rotation. La coupure de caténaire a son propre écran rouge, qu'on ne voit
  // qu'au retour de la tension - pendant la coupure, la dalle est simplement
  // éteinte et rien n'est dessiné.
  if (emergency.stage !== 'none') {
    // Deux écrans, deux moments. PENDANT le freinage, l'ordre : « accrochez-
    // vous ». UNE FOIS ARRÊTÉ, l'avis : « nous ne savons pas quand ça repart ».
    // Les confondre, c'est soit crier après coup, soit expliquer pendant que le
    // voyageur cherche une barre.
    return plain(
      emergency.kind === 'outage' ? 'outage'
      : emergency.stage === 'braking' ? 'brake'
      : 'emergency',
      'next',
    );
  }

  if (phase === 'brake') {
    // À l'approche immédiate, l'écran ne montre QUE le plan des sorties avec le
    // côté d'ouverture. Il n'alterne plus avec la version « correspondances » :
    // cette alternance-là ne venait pas de l'afficheur, elle venait du code, qui
    // faisait tourner deux LANGUES en croyant faire tourner deux écrans.
    return {
      ...base, state: 'stationLayout', mode: 'doors', status: 'soon', lang: 'jp', animated: true,
    };
  }

  // Le plan des sorties tient la même place dans les deux rotations, et suit le
  // bloc de sa langue : version japonaise après les plans japonais, version
  // anglaise après les plans anglais. L'EXISTENCE des deux versions est
  // attestée (figure 6) ; leur RANG dans le cycle ne l'est pas, et suit ici la
  // structure par blocs déjà lisible sur le reste de la rotation.
  const status: 'next' | 'now' = phase === 'dwell' ? 'now' : 'next';
  const rotation: Slot[] =
    phase === 'dwell'
      ? // À quai, la rotation garde les deux plans de ligne ET le plan des
        // sorties de la gare où l'on est : c'est l'écran de la figure 6,
        // portillons nommés et correspondances en bas. Le pictogramme « portes
        // qui ferment », lui, a disparu des rames et rien ne le remplace - on ne
        // force pas un écran pour combler un trou.
        ['loopJP', 'zoomJP', { layout: 'jp' }, 'loopEN', 'zoomEN', { layout: 'en' }]
      : // `cruise` et `depart` : on roule vers la gare visée.
        //
        // Les autres états dégradés de la propre ligne (retard persistant,
        // interruption planifiée) restent non rendus : la simulation n'a pas ces
        // incidents, les afficher serait annoncer au voyageur quelque chose qui
        // n'arrive pas.
        [
          'loopJP', 'zoomJP', { layout: 'jp' },
          'loopEN', 'zoomEN', { layout: 'en' },
          'transfers',
          // Les avis de campagne du secteur - le plus souvent aucun.
          ...segmentNotices(index, dir),
        ];

  // L'information trafic tient sur DEUX pages qui se suivent : la japonaise
  // puis sa traduction en tableau. Les séparer dans la rotation ferait attendre
  // un tour complet pour la moitié de l'avis. Elle ne s'insère pas à quai : la
  // figure 6 ne montre à l'arrêt que les plans et les équipements.
  if (notice && phase !== 'dwell') rotation.push('trafficJP', 'trafficEN');

  const slot = rotation[tick % rotation.length];
  if (typeof slot === 'object') {
    return {
      ...base, state: 'stationLayout', mode: 'transfers', status, lang: slot.layout, animated: true,
    };
  }
  return plain(slot, status);
}
