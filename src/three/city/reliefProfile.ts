// Ce qui dépasse de l'horizon, et ce qui reste derrière.
//
// La bible décrit une bande de vingt à cinquante kilomètres, et le relevé du
// 国土地理院 (data/relief) dit la première chose qu'il faut en savoir : IL N'Y
// A PAS DE MONTAGNE. Les collines de Tama, de Sayama, de Miura et de Bōsō
// culminent entre cent et deux cents mètres, et la Terre est ronde. Depuis une
// vitre à quarante mètres d'altitude, l'horizon géométrique est à vingt-trois
// kilomètres ; à quarante, la Terre s'est déjà bombée de cent mètres, et une
// colline de cent cinquante est DESSOUS. On ne la voit pas, et c'est pour cela
// que Tokyo semble plat de partout sauf par temps d'hiver, où l'on aperçoit
// enfin ce qui est assez haut pour dépasser : le Tanzawa, l'Okutama, le
// Chichibu, le Fuji.
//
// Ce module ne dessine rien. Il rend un PROFIL : pour chaque secteur d'azimut
// vrai, la hauteur angulaire de la crête et la distance du sommet qui la tient.
// C'est du calcul pur, donc testable sans moteur de rendu - et c'est bien le
// genre de chose qu'on ne tranche pas à l'œil sur une capture, puisqu'il s'agit
// de fractions de degré.
//
// --- CE QU'ON MODÉLISE D'UN SOMMET ---
//
// Trois nombres, et pas un de plus : son altitude, sa dénivelée locale, et le
// rayon où il a perdu la moitié de cette dénivelée. La forme qui les relie est
// une lorentzienne,
//
//     h(y) = altitude − dénivelée · (1 − 1 / (1 + (y / demi-largeur)²))
//
// c'est-à-dire un dôme qui vaut l'altitude au sommet, retombe à mi-dénivelée à
// la demi-largeur et rejoint la vallée en s'aplatissant. Ce n'est pas la forme
// d'une montagne vue de près - une arête est anguleuse - mais c'est la bonne à
// quarante kilomètres, où il ne reste d'une chaîne que la courbe de son dos.
// Et surtout, le maximum de plusieurs de ces dômes redonne une ligne de crête
// crédible : c'est la CHAÎNE qu'on dessine, pas des pics isolés.

import type { ReliefSummit } from '../../data/relief';

/** Rayon terrestre moyen (m). */
export const EARTH_R = 6371000;

/**
 * Coefficient de réfraction atmosphérique.
 *
 * L'air est plus dense en bas : un rayon rasant s'incurve vers le sol et
 * contourne un peu la Terre. Le géodésien compte k = 0,13 en moyenne, ce qui
 * revient à travailler sur une Terre 15 % plus grande et repousse l'horizon
 * d'autant. C'est loin d'être un détail sur ces distances-là : sans lui, le
 * mont Ōyama perd cent trente mètres apparents à cinquante kilomètres.
 */
export const REFRACTION = 0.13;

/**
 * Abaissement apparent (m) d'un point à `d` mètres : la flèche de l'arc
 * terrestre, réfraction déduite. C'est ce qui enterre le pied des montagnes.
 */
export function apparentDrop(d: number): number {
  return (d * d * (1 - REFRACTION)) / (2 * EARTH_R);
}

/**
 * Creux de l'horizon (rad) pour un œil à `eyeAlt` mètres au-dessus de la mer.
 *
 * L'horizon n'est PAS à hauteur des yeux : il est d'autant plus bas qu'on est
 * haut. C'est ce qu'on éprouve en avion, où la ligne de mer descend jusqu'à
 * paraître un bol ; d'une vitre de train, à quarante mètres, cela ne fait
 * qu'un cinquième de degré. Un cinquième de degré est pourtant du même ordre
 * que ce que dépassent les crêtes dont il est question ici, et compter la
 * hauteur d'une crête depuis l'horizontale plutôt que depuis l'horizon
 * conduirait au résultat absurde qu'en montant, on voit moins loin.
 */
export function horizonDip(eyeAlt: number): number {
  return Math.sqrt((2 * Math.max(0, eyeAlt) * (1 - REFRACTION)) / EARTH_R);
}

/**
 * Élévation angulaire (rad) du dôme d'un sommet AU-DESSUS DE L'HORIZON VRAI,
 * vu à `d` mètres et à `lateral` mètres de son axe, depuis un œil à l'altitude
 * `eyeAlt`. Négatif = le sommet est derrière la courbure.
 */
export function elevationAt(
  summit: ReliefSummit,
  d: number,
  lateral: number,
  eyeAlt: number,
): number {
  const t = lateral / summit.halfWidth;
  const h = summit.altitude - summit.relief * (1 - 1 / (1 + t * t));
  return (h - eyeAlt - apparentDrop(d)) / d + horizonDip(eyeAlt);
}

/** Un tour d'horizon échantillonné en secteurs d'azimut vrai égaux. */
export interface ReliefProfile {
  /**
   * Hauteur angulaire de la crête au-dessus de l'horizon (rad), zéro là où
   * rien ne dépasse.
   */
  elev: Float32Array;
  /** Distance du sommet qui tient le secteur (m), `Infinity` si aucun. */
  dist: Float32Array;
}

export function makeProfile(bins: number): ReliefProfile {
  return { elev: new Float32Array(bins), dist: new Float32Array(bins).fill(Infinity) };
}

/**
 * Jusqu'où on suit le dôme d'un sommet, en demi-largeurs.
 *
 * La lorentzienne n'a pas de bord : à huit demi-largeurs elle a rendu 98,5 %
 * de sa dénivelée, ce qui la met sous l'horizon dans tous les cas qui nous
 * occupent. Aller plus loin coûterait des secteurs pour ne rien changer.
 */
const TAIL = 8;

/** Un secteur au moins de chaque côté du sommet, sinon un pic isolé s'efface. */
const MIN_SPAN = 1;

/**
 * En dessous, une crête n'est pas dessinée (rad ≈ 0,05°).
 *
 * Ce seuil dit ce que ce module NE MODÉLISE PAS : le terrain intermédiaire.
 * On sait où sont les sommets, pas ce qu'il y a entre eux et l'œil, et le
 * plateau de Musashino - une cinquantaine de mètres, à vingt kilomètres - se
 * dresse lui-même à un vingtième de degré au-dessus de l'horizon. Toute crête
 * qui ne dépasse pas d'autant est aussi bien cachée par le plateau, quand ce
 * n'est pas par le premier immeuble venu. La retenir reviendrait à peindre un
 * liséré de collines tout autour de Tokyo au motif que la sphère terrestre, à
 * elle seule, les laisse passer.
 */
const MIN_RISE = 0.00087;

/**
 * Le tour d'horizon depuis un point, remis à jour dans `out`.
 *
 * `eyeX`, `eyeZ` sont dans le repère de la scène (est, nord négatif) et
 * `eyeAlt` est l'altitude orthométrique de l'œil - la cote du sol sous la voie,
 * plus la hauteur du tablier et celle du regard. Elle compte : dix mètres de
 * viaduc repoussent l'horizon de quatre kilomètres.
 *
 * `maxDistance` coupe ce que l'air a déjà mangé. Ce n'est pas une optimisation
 * mais une nécessité de rendu : la couche est opaque, et un sommet noyé dans la
 * brume doit disparaître du profil, pas être peint couleur de brume - sans quoi
 * il laisse un fantôme là où la teinte du ciel n'est pas exactement la sienne.
 */
export function buildProfile(
  out: ReliefProfile,
  summits: readonly ReliefSummit[],
  eyeX: number,
  eyeZ: number,
  eyeAlt: number,
  maxDistance: number,
): void {
  const bins = out.elev.length;
  const perBin = (2 * Math.PI) / bins;
  out.elev.fill(0);
  out.dist.fill(Infinity);

  for (const su of summits) {
    const dx = su.x - eyeX;
    const dz = su.z - eyeZ;
    const d = Math.hypot(dx, dz);
    if (d < 1 || d > maxDistance) continue;
    // Rien à faire si même l'apex est sous l'horizon : c'est le cas de la
    // grande majorité des collines du relevé, et c'est le fait à retenir.
    if (elevationAt(su, d, 0, eyeAlt) < MIN_RISE) continue;

    // Azimut vrai : zéro plein nord, sens horaire. Le nord est −z.
    const az = Math.atan2(dx, -dz);
    const centre = az / perBin;
    const span = Math.max(MIN_SPAN, Math.ceil((TAIL * su.halfWidth) / d / perBin));
    const c0 = Math.round(centre);

    for (let k = -span; k <= span; k++) {
      const e = elevationAt(su, d, (c0 + k - centre) * perBin * d, eyeAlt);
      if (e <= 0) continue;
      const i = (((c0 + k) % bins) + bins) % bins;
      if (e <= out.elev[i]) continue;
      out.elev[i] = e;
      out.dist[i] = d;
    }
  }
}
