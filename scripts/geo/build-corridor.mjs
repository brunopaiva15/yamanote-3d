// Le corridor bâti, posé sur le ruban : les empreintes OSM en coordonnées de
// boucle.
//
//   node scripts/geo/build-corridor.mjs
//
// Émet :
//   · src/data/corridor.json   table compacte, rangée par abscisse de boucle
//   · src/data/corridor.ts     module engendré, provenance et compteurs
//
// CE QUE FAIT CE SCRIPT, ET CE QU'IL NE FAIT PAS. Il ne va rien chercher
// dehors : c'est une DÉRIVATION de deux fichiers déjà versionnés,
// data/geo/footprints.json (les empreintes, engendrées par fetch-footprints)
// et data/geo/yamanote-loop.geojson (l'axe relevé des voies). Il se rejoue
// hors ligne, à l'identique, aussi longtemps que ces deux-là ne bougent pas -
// et il doit se rejouer dès que l'un des deux bouge.
//
// POURQUOI UNE ÉTAPE SÉPARÉE. footprints.json range ses bâtiments dans le
// repère du monde (est, nord), qui est celui de la carte. Le ruban urbain, lui,
// ne connaît que l'abscisse de la BOUCLE et un décalage latéral compté à gauche
// du sens des index JY croissants - le même repère que le relief et l'eau. La
// conversion demande de projeter chaque bâtiment sur la polyligne, ce qui n'a
// rien à faire dans une boucle de rendu : on la fait une fois, ici.
//
// LA HAUTEUR ET L'EMPRISE VIENNENT DE LA SOURCE, l'ORIENTATION AUSSI. Ce qui
// n'en vient pas - la teinte de façade, les enseignes, les fenêtres allumées -
// reste au tissu de quartier, et le drapeau `real` du ruban dit lequel est
// lequel. On ne présente jamais une couleur inventée comme un relevé.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { makeProjector, pickJapanZone } from '../plateau/lib/geo.mjs';
import { PLATFORMS } from './lib/platforms.mjs';

/**
 * Bande retenue, en mètres à l'axe.
 *
 * Le bas de la fourchette est le premier rang du ruban (systems/cityField) :
 * en deçà de douze mètres, on est dans l'emprise ferroviaire - poteaux
 * caténaires à 5,2 m, murs de tranchée à 6,6 m, faisceau de tronçon jusqu'à
 * 14 m. Dix-neuf bâtiments d'OpenStreetMap y tombent, et ce sont des ouvrages
 * de gare : les poser dans le ruban les ferait traverser le train.
 *
 * Le haut est le dernier rang de l'arrière-pays. Au-delà, ce n'est plus le
 * ruban qui dessine mais les masses de three/city/DistrictMassif.
 */
const NEAR_MIN = 12;
const NEAR_MAX = 66;
const FAR_MAX = 440;

/** Ramène un angle dans (−π/4, π/4]. */
function wrapQuarter(a) {
  const q = Math.PI / 2;
  let r = a - Math.round(a / q) * q;
  if (r <= -q / 2) r += q;
  if (r > q / 2) r -= q;
  return r;
}

function main() {
  const url = (p) => new URL(p, import.meta.url);

  const loopDoc = JSON.parse(readFileSync(url('../../data/geo/yamanote-loop.geojson'), 'utf8'));
  const ring = loopDoc.features[0].geometry.coordinates.slice(0, -1);

  // La MÊME projection et la MÊME origine que fetch-footprints : sans quoi les
  // deux jeux ne parleraient pas du même Tokyo. Le test de corridor le vérifie
  // en recalculant la distance à l'axe et en la comparant à celle du relevé.
  const epsg = pickJapanZone(PLATFORMS[0].lon, PLATFORMS[0].lat);
  const projector = makeProjector(epsg);
  const tokyoStop = loopDoc.stations.find((s) => s.index === 0);
  const origin = projector.forward(tokyoStop.stopLon, tokyoStop.stopLat);
  const local = (lon, lat) => {
    const p = projector.forward(lon, lat);
    return { x: p.east - origin.east, z: -(p.north - origin.north) };
  };

  const poly = ring.map(([lon, lat]) => local(lon, lat));
  const cum = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const perimeter = cum[poly.length];

  /**
   * Projette un point sur la polyligne fermée.
   *
   * Renvoie l'abscisse curviligne, la distance à l'axe, le décalage SIGNÉ
   * (positif à gauche du sens des index croissants) et le cap de la voie au
   * point projeté.
   */
  const project = (px, pz) => {
    let best = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + dx * t;
      const qz = a.z + dz * t;
      const d = Math.hypot(px - qx, pz - qz);
      if (best && d >= best.d) continue;
      const len = Math.sqrt(L2) || 1;
      const tx = dx / len;
      const tz = dz / len;
      // Produit vectoriel du cap et du vecteur vers le point : son signe dit
      // de quel côté de la voie on est, et il ne dépend pas du sens de marche.
      const cross = tx * (pz - qz) - tz * (px - qx);
      best = { d, s: cum[i] + t * len, tx, tz, left: cross < 0 };
    }
    return best;
  };

  const pack = JSON.parse(readFileSync(url('../../data/geo/footprints.json'), 'utf8'));
  const col = Object.fromEntries(pack.columns.map((c, i) => [c, i]));

  const rows = [];
  let skippedInside = 0;
  let skippedBeyond = 0;
  let residualMax = 0;
  for (const r of pack.rows) {
    const distance = r[col.distance];
    if (distance > FAR_MAX + 5) {
      skippedBeyond++;
      continue;
    }
    const x = r[col.x10] / 10;
    const z = r[col.z10] / 10;
    const p = project(x, z);
    residualMax = Math.max(residualMax, Math.abs(p.d - distance));
    if (p.d < NEAR_MIN) {
      skippedInside++;
      continue;
    }
    if (p.d > FAR_MAX) {
      skippedBeyond++;
      continue;
    }
    rows.push({
      s: p.s,
      // Décalage compté à GAUCHE du sens des index croissants : le repère du
      // relief et de l'eau, celui que systems/terrain sait convertir.
      offset: p.left ? p.d : -p.d,
      h: r[col.h10] / 10,
      plate: r[col.plate10] / 10,
      measured: r[col.measured],
      // La boîte est celle du contour, alignée sur les axes de la projection :
      // son orientation dans le repère du ruban est donc celle de la voie,
      // et non une trame inventée. Repliée au quart de tour, puisqu'un carré
      // ne distingue pas ses deux côtés - c'est ce repli qui rend la valeur
      // valable dans les deux sens de marche, où la base du ruban se retourne.
      yaw: wrapQuarter(Math.atan2(-p.tx, -p.tz)),
      osmWay: r[col.osmWay],
    });
  }

  rows.sort((a, b) => a.s - b.s);

  const near = rows.filter((r) => Math.abs(r.offset) <= NEAR_MAX).length;
  const measured = rows.filter((r) => r.measured).length;

  const out = {
    layer: 'DATA_STATIC',
    source: 'OpenStreetMap',
    license: pack.license,
    attribution: pack.attribution,
    datasetDate: pack.datasetDate,
    generatedBy: 'scripts/geo/build-corridor.mjs',
    derivedFrom: ['data/geo/footprints.json', 'data/geo/yamanote-loop.geojson'],
    loopPerimeter: Math.round(perimeter * 10) / 10,
    nearMin: NEAR_MIN,
    nearMax: NEAR_MAX,
    farMax: FAR_MAX,
    count: rows.length,
    near,
    far: rows.length - near,
    measuredHeights: measured,
    estimatedHeights: rows.length - measured,
    skippedInside,
    skippedBeyond,
    note:
      'Empreintes OSM projetées sur la polyligne relevée. s = abscisse de boucle (m), ' +
      'offset = décalage latéral signé, positif à gauche du sens des index JY croissants. ' +
      'plate = côté de la boîte englobante du contour OSM : une emprise relevée, ' +
      'simplifiée en LOD1, jamais un carré inventé. measured=0 : hauteur estimée.',
    columns: ['s10', 'offset10', 'h10', 'plate10', 'measured', 'yaw1e4', 'osmWay'],
    rows: rows.map((r) => [
      Math.round(r.s * 10),
      Math.round(r.offset * 10),
      Math.round(r.h * 10),
      Math.round(r.plate * 10),
      r.measured,
      Math.round(r.yaw * 1e4),
      r.osmWay,
    ]),
  };

  mkdirSync(url('../../src/data/').pathname, { recursive: true });
  writeFileSync(url('../../src/data/corridor.json'), JSON.stringify(out), 'utf8');
  writeCorridorTs(out);

  process.stdout.write(
    `${out.count} empreintes posées sur le ruban ` +
      `(${near} au bord de voie ≤ ${NEAR_MAX} m, ${out.far} en arrière-pays) · ` +
      `hauteur relevée ${measured}, estimée ${out.estimatedHeights} · ` +
      `écartées : ${skippedInside} dans l'emprise ferroviaire, ${skippedBeyond} au-delà de ${FAR_MAX} m · ` +
      `résidu de projection ${residualMax.toFixed(2)} m\n`,
  );
}

function writeCorridorTs(out) {
  const src = `// Le corridor bâti : les empreintes d'OpenStreetMap posées sur le ruban.
//
// GÉNÉRÉ par \`node scripts/geo/build-corridor.mjs\` - ne pas éditer à la main.
//
// ${out.attribution} · ${out.source}
// Licence ${out.license} · jeu daté du ${out.datasetDate} · ${out.layer}
//
// ${out.count} bâtiments réels bordent la voie entre ${out.nearMin} et ${out.farMax} m :
// ${out.near} dans la bande du bord de voie (≤ ${out.nearMax} m) et ${out.far} dans
// l'arrière-pays. ${out.measuredHeights} portent une hauteur relevée dans OSM,
// ${out.estimatedHeights} une hauteur estimée - et \`measured\` le dit, sujet par sujet.
//
// CE QUI EST RELEVÉ, ET CE QUI NE L'EST PAS. Il faut le lire avant de croire
// que le ruban est devenu Tokyo :
//
//   RELEVÉ    la position (centroïde du contour, au décimètre), la hauteur
//             quand \`measured\` vaut vrai, le côté de la boîte englobante du
//             contour, et l'orientation - qui est celle des axes de la
//             projection, donc du nord, et non une trame tirée au sort.
//   SIMPLIFIÉ l'emprise. OpenStreetMap donne un polygone ; \`data/geo/footprints.json\`
//             n'en a retenu que la boîte englobante, et on pose donc un prisme
//             carré de côté \`plate\`. C'est du LOD1 : le bâtiment est là, il est
//             haut comme il est haut, mais son plan est une boîte. La règle 4 de
//             la bible demande l'empreinte exacte ; on n'y est pas, et le
//             prétendre serait pire que ne pas y être.
//   INVENTÉ   rien de géométrique. La teinte de façade, les enseignes, les
//             fenêtres allumées viennent du tissu de quartier
//             (src/data/districts.ts) : aucune source ne les porte, et le
//             drapeau \`real\` du ruban permet de ne jamais les confondre.
//
// ${out.skippedInside} bâtiments d'OpenStreetMap tombent à moins de ${out.nearMin} m de l'axe -
// l'emprise ferroviaire - et ne sont pas posés : ils traverseraient le train.
//
// Le repère est celui du relief et de l'eau, et non celui de la carte :
// abscisse de BOUCLE, et décalage latéral compté à gauche du sens des index JY
// croissants. systems/terrain fait la conversion depuis l'odomètre.

import pack from './corridor.json' with { type: 'json' };

/** Un bâtiment réel, tel que la source le porte. */
export interface CorridorBuilding {
  /** Abscisse curviligne sur la polyligne relevée (m). */
  s: number;
  /** Décalage latéral signé (m), positif à gauche des index JY croissants. */
  offset: number;
  /** Hauteur (m). */
  h: number;
  /** Côté de la boîte englobante du contour OSM (m). */
  plate: number;
  /** true = étiquette OSM \`height\` ; false = niveaux déclarés, ou modèle. */
  measured: boolean;
  /** Orientation dans le plan du ruban (rad), repliée au quart de tour. */
  yaw: number;
  /** Identifiant OSM : de quoi ouvrir la carte et regarder. */
  osmWay: number;
}

/** Bande retenue, en mètres à l'axe : le premier et le dernier rang du ruban. */
export const CORRIDOR_NEAR_MIN = ${out.nearMin};
export const CORRIDOR_NEAR_MAX = ${out.nearMax};
export const CORRIDOR_FAR_MAX = ${out.farMax};

/** Périmètre de la polyligne (m) : pour replier une abscisse. */
export const CORRIDOR_LOOP_M = ${out.loopPerimeter};

/** Combien de bâtiments réels le ruban a de quoi poser. */
export const CORRIDOR_TOTAL = ${out.count};
export const CORRIDOR_NEAR = ${out.near};
export const CORRIDOR_FAR = ${out.far};
export const CORRIDOR_MEASURED = ${out.measuredHeights};

/** Écartés faute de place : dans l'emprise ferroviaire, ou hors du ruban. */
export const CORRIDOR_SKIPPED_INSIDE = ${out.skippedInside};
export const CORRIDOR_SKIPPED_BEYOND = ${out.skippedBeyond};

const R = pack.rows as readonly (readonly number[])[];

/**
 * Les bâtiments, RANGÉS PAR ABSCISSE DE BOUCLE.
 *
 * L'ordre est ce qui rend la recherche par tranche possible sans parcourir les
 * neuf mille : \`systems/corridor\` y entre par dichotomie.
 */
export const CORRIDOR: readonly CorridorBuilding[] = R.map((r) => ({
  s: r[0] / 10,
  offset: r[1] / 10,
  h: r[2] / 10,
  plate: r[3] / 10,
  measured: r[4] === 1,
  yaw: r[5] / 1e4,
  osmWay: r[6],
}));
`;
  writeFileSync(new URL('../../src/data/corridor.ts', import.meta.url), src, 'utf8');
}

main();
