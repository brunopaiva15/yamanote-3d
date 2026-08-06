// Prototype PLATEAU : interrupteur, réglages et état partagé par frame.
//
// LE PROTOTYPE EST ÉTEINT PAR DÉFAUT, ET IL FAUT LE DEMANDER : `?plateau=1`
// dans l'URL. Sans ce paramètre, rien n'est chargé, rien n'est monté, aucun
// composant ne change de branche - le jeu est exactement celui d'avant, y
// compris sur le tronçon couvert.
//
// Ce n'est pas de la prudence de principe. Tant que le pipeline tourne sur son
// échantillon SYNTHÉTIQUE, les bâtiments affichés sont inventés : les montrer
// par défaut ferait passer une ville fictive pour Tokyo, là où le décor
// procédural, lui, s'assume comme une évocation. Le jour où le monde est
// construit à partir des vraies données PLATEAU, il suffira de repasser
// `ENABLE_PLATEAU_PROTOTYPE` à `true`.

import type { LoopDirection } from '../data/platforms';

/**
 * Interrupteur principal du prototype, quand l'URL ne dit rien.
 *
 * `false` (défaut) : le prototype n'existe que sur demande explicite,
 * `?plateau=1`. `true` : il s'applique à tout le monde sur son tronçon.
 * Un test verrouille cette valeur - voir tests/plateauFlags.test.ts.
 */
export const ENABLE_PLATEAU_PROTOTYPE = false;

/**
 * Tronçon couvert par le prototype (index dans data/segments.ts).
 *
 * ⚠️ Doit correspondre au tronçon choisi côté pipeline
 * (`PROTOTYPE_SEGMENTS` dans `scripts/plateau/config.mjs`). La validation du
 * build compare les deux et échoue si elles divergent : impossible de publier
 * un monde que le jeu chercherait ailleurs sur la boucle.
 */
export const PLATEAU_SEGMENT = 19; // Shibuya → Ebisu (viaduc)

export const PLATEAU_SETTINGS = {
  /** Emplacement du manifeste, relatif à la base du site. */
  manifestUrl: 'world/plateau/manifest.json',
  routeUrl: 'world/plateau/route.json',
  /** Chunks montés devant / derrière le train, et plafond dur. */
  chunksAhead: 1,
  chunksBehind: 1,
  maxMountedChunks: 3,
  /**
   * Niveau du sol au droit de la voie (m), repris de systems/segmentEnv :
   * le tracé exporté porte la cote du RAIL, le décor du jeu place ce niveau à
   * -1,1. Sans ce décalage la ville flotterait d'un mètre.
   */
  groundY: -1.1,
} as const;

/**
 * État lu par les composants du décor procédural. `coverage` vaut 1 quand le
 * monde PLATEAU est monté et affiché : CityRibbon et Landmarks s'effacent
 * alors, pour ne pas superposer deux villes.
 */
export const plateauRuntime = {
  coverage: 0,
  /** Abscisse courante sur le tracé (m) - utile en console pour déboguer. */
  distance: 0,
  /** Chunks actuellement montés. */
  mounted: 0,
};

/**
 * Le prototype est-il actif pour ce tronçon, dans ce sens ?
 *
 * Les deux sens. Le tracé exporté (`route.json`) est une polyligne orientée
 * (内回り) : en 外回り, PlateauWorld parcourt la même polyligne à l'envers
 * (progression `1 − t`), ce qui évite de dupliquer les chunks. Tant que le
 * monde géoréférencé ne couvre qu'un tronçon, le décor procédural reprend la
 * main partout ailleurs.
 */
export function plateauCoversSegment(segment: number, _dir: LoopDirection): boolean {
  return plateauEnabled() && segment === PLATEAU_SEGMENT;
}

/**
 * Le prototype doit-il s'afficher ?
 *
 * L'URL a le dernier mot, dans les deux sens : `?plateau=1` l'allume même si
 * la constante est à `false`, `?plateau=0` l'éteint même si elle est à `true`.
 * Sans paramètre, la constante décide.
 *
 * Le paramètre vaut aussi en production, et c'est délibéré : c'est ce qui
 * permet de montrer le prototype sur le site déployé - à qui le demande - sans
 * l'imposer à personne.
 */
export function plateauEnabled(): boolean {
  const override = queryFlag();
  if (override !== null) return override;
  return ENABLE_PLATEAU_PROTOTYPE;
}

/**
 * Gare d'ARRIVÉE du tronçon couvert : c'est elle que `randomizeEntry` attend,
 * puisque le tronçon parcouru pour atteindre la gare `i` en 内回り est
 * `segmentAt(i, 'inner')`, soit `(i + 29) % 30`.
 */
export const PLATEAU_ENTRY_STATION = (PLATEAU_SEGMENT + 1) % 30; // Ebisu (20)

/**
 * Gare sur laquelle embarquer quand le prototype est demandé par l'URL.
 *
 * Sans cela, `?plateau=1` serait une promesse creuse : le tirage d'entrée
 * pose le joueur n'importe où sur la boucle, et il faudrait attendre jusqu'à
 * une heure de trajet pour atteindre le tronçon couvert. Le paramètre fait
 * donc les deux choses à la fois - allumer le prototype ET s'y rendre.
 *
 * En 内回り on arrive à Ebisu (PLATEAU_ENTRY_STATION) ; en 外回り on arrive à
 * Shibuya (PLATEAU_SEGMENT), pour que `segmentAt` tombe sur le même tronçon.
 *
 * Renvoie `undefined` dès que le paramètre est absent : le boarding normal
 * (gare tirée au sort, ou choisie dans le menu) n'est jamais touché.
 */
export function plateauEntryStation(dir: LoopDirection = 'inner'): number | undefined {
  if (queryFlag() !== true) return undefined;
  return dir === 'outer' ? PLATEAU_SEGMENT : PLATEAU_ENTRY_STATION;
}

function queryFlag(): boolean | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('plateau');
  if (raw === null) return null;
  return raw !== '0' && raw !== 'false';
}
