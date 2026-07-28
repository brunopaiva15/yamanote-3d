// Génération du ruban urbain qui borde la voie : un tissu de bâtiments POSÉS
// DANS LE MONDE, à une abscisse fixe, que le train dépasse. Rien ne glisse,
// rien ne défile : c'est le train qui avance.
//
// C'était le défaut de fond du décor précédent. La ville y était peinte sur
// trois plans fixes et c'est la TEXTURE qui coulait (`offset.x = distance /
// metersPerRepeat`), à une vitesse sans rapport avec celle du train — 1,67×
// sur la couche proche. L'œil lit ça immédiatement comme un décor tiré au fil.
//
// --- Découpage ---
// Le ruban est découpé en cellules de CELL_LEN mètres le long de la voie. Une
// cellule est engendrée à partir de son seul index monde : deux passages sur la
// même cellule donnent le même quartier. Le rendu n'en garde qu'un anneau
// glissant (voir three/city/CityRibbon), rebâti une cellule à la fois.
//
// --- Trois rangs ---
// Un bord de voie bas et serré, un rang d'îlot, un fond haut. C'est cette
// stratification qui produit l'occultation mutuelle et donc la profondeur ; un
// plan unique, aussi bien dessiné soit-il, reste du carton.
//
// --- Les rues ---
// Une cellule sur deux environ est traversée par une rue perpendiculaire, qui
// perce les TROIS rangs au même endroit. C'est le seul moment où le regard
// s'enfonce dans la ville, et c'est le meilleur révélateur de vitesse qui soit
// en train.

import { DISTRICTS, GENERIC, type District } from '../data/districts';
import { runtime } from './runtime';

/** Longueur d'une cellule du ruban, le long de la voie (m). */
export const CELL_LEN = 40;

export interface CityBuilding {
  /** Abscisse monde du centre, le long de la voie (m). */
  s: number;
  /** Distance latérale du centre à l'axe de la voie (m), toujours positive. */
  x: number;
  /** Longueur le long de la voie (m). */
  w: number;
  /** Profondeur latérale (m). */
  d: number;
  /** Hauteur (m). */
  h: number;
  /** Teinte de façade (hex), palette du quartier. */
  facade: string;
  /** Multiplicateur de clarté appliqué à la façade (respiration de la palette). */
  shade: number;
  /** Teinte des bandeaux d'enseigne et des néons du rez-de-chaussée. */
  accent: string;
  /** 0..1 : vigueur des enseignes la nuit. */
  glow: number;
  /** 1 = rez-de-chaussée commerçant, 0 = façade nue jusqu'au sol. */
  socle: number;
  /** Décalage de la trame de façade (m), pour que deux voisins ne s'alignent pas. */
  jx: number;
  jy: number;
}

interface Rank {
  /** Bord intérieur / extérieur de la bande où le rang se pose (m). */
  x0: number;
  x1: number;
  /** Nombre maximal de bâtiments par cellule. */
  n: number;
  wMin: number;
  wMax: number;
  dMin: number;
  dMax: number;
  /** h = hMin + maxHeight × hSpan × tirage. */
  hMin: number;
  hSpan: number;
}

// Le premier rang commence à 12 m de l'axe : au-delà des poteaux caténaires
// (±5,2), des murs de tranchée (±6,6) et du faisceau de tronçon (qui court de
// 4 à 14 m). C'est aussi la distance qui rend la ville REGARDABLE depuis une
// baie : posée à 8 m, la façade la plus proche remplissait toute la vitre de
// son seul rez-de-chaussée, et on ne voyait plus ni le ciel ni le fond.
//
// Le premier rang reste BAS — deux à quatre niveaux, comme un bord de voie
// réel. C'est ce qui laisse passer le regard vers les rangs suivants ; un
// premier rang haut, c'est un mur, et un mur ne fait pas une ville.
const RANKS: Rank[] = [
  { x0: 12, x1: 21, n: 5, wMin: 7, wMax: 17, dMin: 5, dMax: 9, hMin: 3.2, hSpan: 9.5 },
  { x0: 22, x1: 38, n: 4, wMin: 11, wMax: 25, dMin: 9, dMax: 16, hMin: 6, hSpan: 28 },
  { x0: 40, x1: 66, n: 3, wMin: 16, wMax: 34, dMin: 15, dMax: 26, hMin: 9, hSpan: 52 },
];

/** Trouées supplémentaires du premier rang : le ciel et le fond doivent passer. */
const NEAR_EXTRA_GAP = 0.14;

/** Plafond de hauteur : au-delà, les tours percent la voûte de ciel. */
const H_MAX = 52;

/** Nombre maximal de bâtiments qu'une cellule peut rendre, tous rangs confondus. */
export const CELL_CAPACITY = RANKS.reduce((a, r) => a + r.n, 0);

// --- Aléa déterministe -------------------------------------------------------

function hashInt(a: number): number {
  let h = a | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Suite pseudo-aléatoire stable, semée par (cellule, côté, rang). */
function stream(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return hashInt(s);
  };
}

// --- Ancrage des quartiers ---------------------------------------------------

/**
 * Le quartier n'appartient plus à un instant du trajet mais à un ENDROIT.
 *
 * Le décor précédent fondait deux plans peints selon la progression p du
 * trajet : le quartier changeait avec le temps, où qu'on regarde, y compris
 * derrière soi. On mesure ici la distance réelle entre deux arrêts, et le
 * territoire d'une gare s'étend d'un demi-inter-gare de part et d'autre. On
 * ENTRE donc dans un quartier, on le traverse, on en sort.
 */
export const cityAnchor = {
  /** Abscisse monde de la gare `index` (m). */
  s: 0,
  /** Indice de station (0..29) posée en `s`. */
  index: 0,
  /** Inter-gare mesuré (m). Valeur de départ : moyenne de la boucle. */
  span: 1150,
};

let anchorLastIndex = -1;

/**
 * À appeler une fois par frame. `index` est la gare d'ARRIVÉE (il avance au
 * début de `depart`), `p` la progression 0..1 du trajet en cours.
 */
export function updateCityAnchor(index: number, p: number): void {
  // Ré-amorçage : premier tick, ou saut de position (rentrée aléatoire sur la
  // boucle) qui laisserait l'ancre à des kilomètres du train.
  if (anchorLastIndex >= 0 && Math.abs(runtime.distance - cityAnchor.s) > 6 * cityAnchor.span) {
    anchorLastIndex = -1;
  }
  if (anchorLastIndex < 0) {
    // Premier tick : on ne connaît pas encore l'inter-gare réel, on place la
    // gare d'arrivée à la distance restante estimée.
    anchorLastIndex = index;
    cityAnchor.index = index;
    cityAnchor.s = runtime.distance + cityAnchor.span * (1 - p);
    return;
  }
  if (index === anchorLastIndex) return;
  anchorLastIndex = index;
  // L'index vient d'avancer : le train est physiquement à la gare qu'il quitte.
  const travelled = runtime.distance - cityAnchor.s;
  if (travelled > 400 && travelled < 3000) cityAnchor.span = travelled;
  cityAnchor.index = (index + 29) % 30;
  cityAnchor.s = runtime.distance;
}

/**
 * Quartier d'une abscisse monde. `mix` (0..1) est un tirage propre au bâtiment :
 * au voisinage de la frontière entre deux quartiers, les deux tissus
 * s'entremêlent au lieu de se succéder d'un bloc — une ville ne change pas de
 * caractère sur une ligne.
 */
export function districtAt(s: number, mix: number): District {
  const t = (s - cityAnchor.s) / cityAnchor.span;
  const k = Math.max(-2, Math.min(2, Math.round(t)));
  const frac = t - k;
  const edge = 0.5 - Math.abs(frac); // 0 à la frontière, 0,5 au cœur du quartier
  const BLEND = 0.09;
  let kk = k;
  if (edge < BLEND && mix > edge / BLEND) kk = k + (frac > 0 ? 1 : -1);
  const i = (((cityAnchor.index + kk) % 30) + 30) % 30;
  return DISTRICTS[i] ?? GENERIC;
}

// --- Engendrement d'une cellule ---------------------------------------------

const FALLBACK_FACADE = ['#e6dcc9', '#e4cfc5', '#dde4d2', '#e0d7e4', '#e8e1cf', '#d6dfe3', '#e7d6c2'];

/** Rue perpendiculaire d'une cellule : [début, fin] en abscisse monde, ou null. */
function streetOf(cell: number): [number, number] | null {
  const a = hashInt(cell * 2654435761);
  if (a > 0.52) return null;
  const b = hashInt(cell * 40503 + 7919);
  const width = 9 + b * 7;
  const at = cell * CELL_LEN + 5 + hashInt(cell * 97 + 13) * (CELL_LEN - width - 10);
  return [at, at + width];
}

/**
 * Remplit `out` avec les bâtiments de la cellule `cell` du côté `side`.
 * Renvoie le nombre écrit (≤ out.length). Les objets de `out` sont réutilisés :
 * aucune allocation par recyclage de cellule.
 *
 * `rankScale` allège les rangs aux paliers de qualité bas (voir systems/perf).
 */
export function buildCell(
  cell: number,
  side: 1 | -1,
  out: CityBuilding[],
  rankScale = 1,
): number {
  const start = cell * CELL_LEN;
  const end = start + CELL_LEN;
  const street = streetOf(cell);
  let count = 0;

  for (let rank = 0; rank < RANKS.length; rank++) {
    const R = RANKS[rank];
    const n = Math.max(1, Math.round(R.n * rankScale));
    const r = stream(cell * 8191 + (side === 1 ? 0 : 4099) + rank * 131);
    let placed = 0;
    let cursor = start + r() * 4;

    while (cursor < end && placed < n && count < out.length) {
      // Le quartier se décide bâtiment par bâtiment : c'est ce qui entremêle
      // les deux tissus de part et d'autre d'une frontière de quartier.
      const district = districtAt(cursor, r());
      const gapChance = 0.42 - district.density * 0.36 + (rank === 0 ? NEAR_EXTRA_GAP : 0);

      let w = R.wMin + r() * (R.wMax - R.wMin);
      if (w > end + 3 - cursor) w = Math.max(R.wMin * 0.6, end + 3 - cursor);

      // Rue perpendiculaire : elle perce les trois rangs au même endroit.
      if (street && cursor + w > street[0] && cursor < street[1]) {
        cursor = street[1] + r() * 2;
        continue;
      }
      if (r() < gapChance) {
        cursor += w * (0.35 + r() * 0.5);
        continue;
      }

      const d = R.dMin + r() * (R.dMax - R.dMin);
      const h = Math.min(
        H_MAX,
        R.hMin + district.maxHeight * R.hSpan * (0.32 + r() * 0.68),
      );
      const facades = district.facades ?? FALLBACK_FACADE;
      const neon = district.neon;

      const b = out[count];
      b.s = cursor + w / 2;
      b.x = R.x0 + d / 2 + r() * Math.max(0, R.x1 - R.x0 - d);
      b.w = w;
      b.d = d;
      b.h = h;
      b.facade = facades[Math.floor(r() * facades.length) % facades.length];
      // Les palettes de quartier sont resserrées à dessein (elles font la
      // teinte d'ensemble) : sans cette respiration, deux voisins sont
      // indiscernables et la rangée se relit comme une seule surface.
      b.shade = 0.86 + r() * 0.3;
      b.accent = neon ? neon[Math.floor(r() * neon.length) % neon.length] : district.accent;
      // Les enseignes ne valent que pour ce qui borde la rue : au troisième
      // rang, on ne lit plus un rez-de-chaussée.
      b.glow = rank === 0 ? 0.65 + r() * 0.35 : rank === 1 ? 0.35 + r() * 0.3 : 0.1;
      // Tout n'est pas commerçant : entrepôts, pignons aveugles, immeubles
      // d'habitation. Un bandeau d'enseigne sur CHAQUE bâtiment redevenait la
      // frise continue qu'on cherchait à quitter.
      const trade = 0.18 + district.density * 0.42;
      b.socle = rank < 2 && r() < trade ? 1 : 0;
      b.jx = r() * 12;
      b.jy = r() * 3;

      count++;
      placed++;
      cursor += w + 0.4 + r() * 2.6;
    }
  }
  return count;
}

// --- Superstructures et chaussées -------------------------------------------

/**
 * Volume secondaire, sans façade ni devanture : acrotère, édicule de toiture,
 * dalle de chaussée. Rendu par le même matériau, avec le drapeau « nu » —
 * teinte de couverture sur toutes les faces, ni fenêtres ni vitrine.
 */
export interface CityProp {
  s: number;
  x: number;
  w: number;
  d: number;
  h: number;
  /** Altitude de la BASE, relative au sol de la ville (m). */
  y: number;
  tone: string;
}

/** Acrotère + édicule par bâtiment, plus la chaussée de la rue de la cellule. */
export const PROP_CAPACITY = CELL_CAPACITY * 2 + 1;

const PARAPET_TONE = '#c6c3ba';
const ROOFTOP_TONE = '#b4b1a8';
const ROAD_TONE = '#5f5e5a';

/**
 * Dérive les volumes secondaires d'une cellule déjà bâtie.
 *
 * L'acrotère est le détail qui manque le plus dès qu'on regarde du haut d'un
 * viaduc : une boîte nue ne se lit pas comme un immeuble, un immeuble a un
 * BORD de toiture. Il déborde légèrement, comme une corniche.
 */
export function buildCellProps(
  cell: number,
  side: 1 | -1,
  buildings: CityBuilding[],
  n: number,
  out: CityProp[],
): number {
  const r = stream(cell * 7717 + (side === 1 ? 101 : 6089));
  let count = 0;

  for (let i = 0; i < n && count < out.length; i++) {
    const b = buildings[i];
    const p = out[count++];
    p.s = b.s;
    p.x = b.x;
    p.w = b.w + 0.45;
    p.d = b.d + 0.45;
    p.h = 0.55;
    p.y = b.h;
    p.tone = PARAPET_TONE;

    // Édicule : cage d'escalier, machinerie, château d'eau. Seulement sur ce
    // qui a des étages à desservir. Les tirages sont consommés d'abord et la
    // décision prise ensuite : la suite avance du même nombre de pas quelle que
    // soit la branche, et la cellule reste lisible.
    const want = r();
    const ew = b.w * (0.2 + r() * 0.18);
    const ed = b.d * (0.25 + r() * 0.24);
    const eh = 2.1 + r() * 1.3;
    const es = (r() - 0.5) * 0.7;
    const ex = (r() - 0.5) * 0.7;
    if (b.h > 7 && want < 0.55 && count < out.length) {
      const q = out[count++];
      q.w = ew;
      q.d = ed;
      q.h = eh;
      q.s = b.s + es * (b.w - ew);
      q.x = b.x + ex * (b.d - ed);
      q.y = b.h;
      q.tone = ROOFTOP_TONE;
    }
  }

  // Chaussée : la trouée devient une perspective au lieu d'un trou.
  const street = streetOf(cell);
  if (street && count < out.length) {
    const inner = RANKS[0].x0 - 1.5;
    const outer = RANKS[RANKS.length - 1].x1;
    const p = out[count++];
    p.s = (street[0] + street[1]) / 2;
    p.w = street[1] - street[0] - 1.2;
    p.x = (inner + outer) / 2;
    p.d = outer - inner;
    p.h = 0.14;
    p.y = 0;
    p.tone = ROAD_TONE;
  }
  return count;
}

/** Tableau de travail réutilisable, à la capacité d'une cellule. */
export function makePropBuffer(): CityProp[] {
  return Array.from({ length: PROP_CAPACITY }, () => ({
    s: 0,
    x: 0,
    w: 0,
    d: 0,
    h: 0,
    y: 0,
    tone: '#ffffff',
  }));
}

/** Tableau de travail réutilisable, à la capacité d'une cellule. */
export function makeCellBuffer(): CityBuilding[] {
  return Array.from({ length: CELL_CAPACITY }, () => ({
    s: 0,
    x: 0,
    w: 0,
    d: 0,
    h: 0,
    facade: '#ffffff',
    shade: 1,
    accent: '#ffffff',
    glow: 0,
    socle: 0,
    jx: 0,
    jy: 0,
  }));
}
