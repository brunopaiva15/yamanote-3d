// Le kilométrage de la bible géographique, posé sur la voie.
//
// La bible compte ses kilomètres autrement que JR East, et autrement que le
// jeu :
//
//   · KM 0,0 = SHINAGAWA, et non Tokyo ;
//   · le sens de progression est Shinagawa → Ōsaki → Shibuya → Shinjuku →
//     Ikebukuro → Ueno → Tokyo → Takanawa Gateway → Shinagawa, c'est-à-dire le
//     sens des index JY DÉCROISSANTS dans ce dépôt ;
//   · « le kilométrage suit la voie ferrée » (règle 2) : les points
//     kilométriques se posent sur la LONGUEUR de la polyligne, jamais en ligne
//     droite entre deux gares.
//
// Les trois conventions se ramènent l'une à l'autre par une soustraction et un
// changement de signe, et c'est tout ce que fait ce module. Il ne dessine rien.
//
// LES RAYONS SONT MESURÉS À VOL D'OISEAU depuis le point kilométrique, dit la
// bible - et non le long de la voie. C'est pourquoi `bandOf` prend une distance
// euclidienne : un secteur à trois kilomètres au nord est dans la bande 1-5 km
// même si la voie met huit kilomètres à y arriver.

import { GEO_STATIONS } from '../data/tokyoGeo.ts';
import { at, LOOP_PERIMETER, STATION_S, wrapS } from './tokyoBearing.ts';

/** Index de Shinagawa (JY25) dans src/data/stations.ts. */
const SHINAGAWA = 24;

/** Abscisse curviligne du KM 0,0 de la bible. */
const KM0_S = STATION_S[SHINAGAWA];

/**
 * Longueur de la boucle telle que la bible la compte (m).
 *
 * Le document va jusqu'au « KM 34.5 — RETOUR À SHINAGAWA » : c'est le barème
 * JR, arrondi au demi-kilomètre. La polyligne relevée mesure 34,43 km. On
 * compte sur la polyligne - c'est elle qui porte la géométrie - et on garde le
 * rapport pour convertir un point kilométrique de la bible en abscisse.
 */
export const BIBLE_LOOP_KM = 34.5;

const KM_TO_S = LOOP_PERIMETER / (BIBLE_LOOP_KM * 1000);

/**
 * Abscisse curviligne (m, sens des index JY croissants) du point kilométrique
 * `km` de la bible.
 *
 * La bible progresse à contresens de la polyligne : d'où la soustraction.
 */
export function sOfBibleKm(km: number): number {
  return wrapS(KM0_S - km * 1000 * KM_TO_S);
}

/** Le point kilométrique de la bible correspondant à l'abscisse `s`. */
export function bibleKmOf(s: number): number {
  return wrapS(KM0_S - s) / (1000 * KM_TO_S);
}

/**
 * Les cinq rayons de la bible (m).
 *
 * Ils ne sont pas décoratifs : chacun porte une consigne de niveau de détail
 * différente (règles 4 à 8), et c'est cette échelle-là qui décide de ce qu'on
 * charge et de ce qu'on simplifie.
 */
export const BANDS = [1000, 5000, 10000, 20000, 50000] as const;

export type Band = 0 | 1 | 2 | 3 | 4 | -1;

/**
 * Bande de la bible pour une distance à vol d'oiseau (m).
 *
 * −1 au-delà de cinquante kilomètres : la bible le dit explicitement du Fuji et
 * de Narita, « ils se trouvent généralement au-delà », et un objet hors des
 * cinq rayons n'a pas de consigne de détail - il ne relève plus du cadrage.
 */
export function bandOf(distance: number): Band {
  for (let i = 0; i < BANDS.length; i++) if (distance <= BANDS[i]) return i as Band;
  return -1;
}

/** Position (x, z) du point kilométrique `km`, dans le repère de scène. */
export function bibleKmPoint(km: number, out: { x: number; z: number }): void {
  at(sOfBibleKm(km), out);
}

/**
 * Les trente-six points kilométriques du document : un par kilomètre entier de
 * 0 à 34, plus le KM 34,5 qui referme la boucle.
 *
 * Ce dernier retombe sur le premier - c'est le même lieu, et la bible l'écrit
 * ainsi (« Même point géographique que le KM 0 »). On le garde parce que le
 * document le garde, et parce qu'un test de couverture doit pouvoir vérifier
 * les trente-six entrées.
 */
export const BIBLE_KM_POSTS: readonly number[] = [
  ...Array.from({ length: 35 }, (_, i) => i),
  34.5,
];

/** La gare la plus proche d'un point kilométrique, et à quelle distance. */
export function nearestStation(km: number): { index: number; meters: number } {
  const p = { x: 0, z: 0 };
  bibleKmPoint(km, p);
  let best = { index: 0, meters: Infinity };
  for (const st of GEO_STATIONS) {
    const d = Math.hypot(st.x - p.x, st.z - p.z);
    if (d < best.meters) best = { index: st.index, meters: d };
  }
  return best;
}
