// Prototype PLATEAU : interrupteur, réglages et état partagé par frame.
//
// Le monde géoréférencé ne remplace le décor procédural QUE sur le tronçon
// pour lequel il a été produit. Partout ailleurs — et prototype désactivé —
// le jeu se comporte exactement comme avant : `plateauRuntime.coverage` reste
// à 0 et personne ne change de branche.

/**
 * Interrupteur principal du prototype.
 *
 * `false` : plus rien de PLATEAU n'est chargé ni monté, le décor procédural
 * reprend l'intégralité de la boucle. C'est le seul réglage à toucher pour
 * revenir au comportement historique.
 */
export const ENABLE_PLATEAU_PROTOTYPE = true;

/** Tronçon couvert par le prototype (index dans data/segments.ts). */
export const PLATEAU_SEGMENT = 10; // Sugamo → Ōtsuka

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
  /** Abscisse courante sur le tracé (m) — utile en console pour déboguer. */
  distance: 0,
  /** Chunks actuellement montés. */
  mounted: 0,
};

/** Le prototype est-il actif pour ce tronçon ? */
export function plateauCoversSegment(segment: number): boolean {
  return plateauEnabled() && segment === PLATEAU_SEGMENT;
}

/**
 * Prise en compte d'une désactivation à la volée : `?plateau=0` coupe le
 * prototype sans recompiler, `?plateau=1` le force. Réservé au développement
 * et à la vérification visuelle ; en production la constante fait foi.
 */
export function plateauEnabled(): boolean {
  const override = queryFlag();
  if (override !== null) return override;
  return ENABLE_PLATEAU_PROTOTYPE;
}

/**
 * Mode de développement : `?plateau=1` fait démarrer le trajet sur le tronçon
 * du prototype au lieu du tirage aléatoire. N'a AUCUN effet hors `npm run dev`
 * — le comportement normal du jeu n'est pas touché.
 *
 * La valeur renvoyée est la gare d'ARRIVÉE du tronçon (Ōtsuka, index 11) :
 * c'est elle que randomizeEntry attend, puisque le tronçon parcouru pour
 * atteindre la gare `i` est `segmentAt(i)`.
 */
export const PLATEAU_DEV_STATION = 11; // Ōtsuka — arrivée du tronçon 10

export function plateauDevStation(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  return queryFlag() === true ? PLATEAU_DEV_STATION : undefined;
}

function queryFlag(): boolean | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('plateau');
  if (raw === null) return null;
  return raw !== '0' && raw !== 'false';
}
