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

/**
 * Au-delà, un carré ne représente plus rien (m).
 *
 * `data/geo/footprints.json` ne garde du contour que le PLUS GRAND côté de sa
 * boîte englobante : on peut donc en tirer un carré, et c'est honnête tant que
 * le bâtiment est compact. Il ne l'est plus du tout pour une marquise de quai
 * de quatre cent neuf mètres, un hall de gare ou une halle : le carré y
 * revendique un volume que la source ne porte pas, et il le revendique en
 * grand - cent soixante-sept mille mètres carrés pour la marquise de Tokyo.
 *
 * Le relevé a une médiane de douze mètres et demi et un percentile 99 à
 * quatre-vingt-dix. On s'arrête donc à cent vingt : trente empreintes sur neuf
 * mille deux cent soixante-quinze, et ce sont exactement celles dont la forme
 * ne se déduit pas. Elles restent dans data/geo/footprints.json, où leur
 * contour attend qu'on sache le lire.
 */
const PLATE_MAX = 120;

/** En deçà, ce qui reste après découpe n'est plus un bâtiment (m). */
const MIN_SIDE = 3;

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
  let skippedShape = 0;
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
    if (p.d > FAR_MAX) {
      skippedBeyond++;
      continue;
    }
    const plate = r[col.plate10] / 10;
    if (plate > PLATE_MAX) {
      skippedShape++;
      continue;
    }
    // La boîte est celle du contour, alignée sur les axes de la projection : son
    // emprise EN TRAVERS de la voie tient compte de l'angle qu'elle y fait.
    const yaw = wrapQuarter(Math.atan2(-p.tx, -p.tz));
    const half = (plate * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)))) / 2;
    const outer = p.d + half;
    if (outer <= NEAR_MIN) {
      skippedInside++;
      continue;
    }
    // LE DÉCOUPAGE AU GABARIT. Le filtre portait sur le centroïde, et la boîte
    // débordait autour de lui : un bâtiment dont le centre est à treize mètres
    // de l'axe avec une emprise de quarante en occupait sept DANS la voie, et
    // le train lui rentrait dedans - entre Okachimachi et Ueno, trois fois.
    //
    // On ne le déplace pas et on ne le jette pas : on lui retire ce qui
    // empiète. Le bâtiment réel n'est pas sur les rails ; la boîte englobante,
    // elle, y va, et l'intersection de la boîte avec « pas sur la voie » est
    // une borne STRICTEMENT meilleure que la boîte. Le bord extérieur ne bouge
    // pas : il reste là où la source le met.
    const inner = Math.max(NEAR_MIN, p.d - half);
    const clipped = inner > p.d - half + 1e-6;
    // Profondeur en travers après découpe. La longueur le long de la voie ne
    // cède pas la première : c'est la profondeur qui rend le terrain. Quand la
    // rotation à elle seule fait déjà déborder - une boîte de travers occupe en
    // travers plus que son côté -, les deux cotes rétrécissent ensemble.
    const spanX = outer - inner;
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    let width = plate;
    let depth = plate;
    if (clipped) {
      const wanted = (spanX - plate * sin) / cos;
      if (wanted >= 1) {
        depth = wanted;
      } else {
        const side = spanX / (cos + sin);
        width = Math.min(plate, side);
        depth = side;
      }
    }
    // Ce qu'il en reste ne fait plus un bâtiment : la boîte était presque
    // entièrement dans l'emprise ferroviaire. On l'écarte plutôt que de poser
    // une lamelle de deux mètres au bord des rails.
    if (width < MIN_SIDE || depth < MIN_SIDE) {
      skippedInside++;
      continue;
    }
    // Le bord interne se pose SUR le gabarit, par construction : on recompose
    // le centre à partir de la demi-emprise réellement obtenue, plutôt que de
    // faire confiance à la formule.
    const halfX = (depth * cos + width * sin) / 2;
    const offset = inner + halfX;
    rows.push({
      s: p.s,
      // Décalage compté à GAUCHE du sens des index croissants : le repère du
      // relief et de l'eau, celui que systems/terrain sait convertir.
      offset: p.left ? offset : -offset,
      h: r[col.h10] / 10,
      plate: width,
      depth,
      measured: r[col.measured],
      // La boîte est celle du contour, alignée sur les axes de la projection :
      // son orientation dans le repère du ruban est donc celle de la voie,
      // et non une trame inventée. Repliée au quart de tour, puisqu'un carré
      // ne distingue pas ses deux côtés - c'est ce repli qui rend la valeur
      // valable dans les deux sens de marche, où la base du ruban se retourne.
      yaw,
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
    skippedShape,
    plateMax: PLATE_MAX,
    // Compté sur les cotes ARRONDIES, celles que le jeu lira : deux découpes
    // sous le décimètre disparaissent au versionnement, et un compteur qui les
    // annoncerait quand même mentirait sur la table.
    clipped: rows.filter((r) => Math.round(r.depth * 10) < Math.round(r.plate * 10)).length,
    note:
      'Empreintes OSM projetées sur la polyligne relevée. s = abscisse de boucle (m), ' +
      'offset = décalage latéral signé, positif à gauche du sens des index JY croissants. ' +
      'plate = côté de la boîte englobante du contour OSM : une emprise relevée, ' +
      'simplifiée en LOD1, jamais un carré inventé. measured=0 : hauteur estimée.',
    columns: ['s10', 'offset10', 'h10', 'plate10', 'depth10', 'measured', 'yaw1e4', 'osmWay'],
    rows: rows.map((r) => [
      Math.round(r.s * 10),
      Math.round(r.offset * 10),
      Math.round(r.h * 10),
      Math.round(r.plate * 10),
      Math.round(r.depth * 10),
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
      `écartées : ${skippedInside} entièrement dans l'emprise ferroviaire, ` +
      `${skippedShape} trop grandes pour un carré (> ${PLATE_MAX} m), ` +
      `${skippedBeyond} au-delà de ${FAR_MAX} m · ` +
      `${out.clipped} découpées au gabarit · ` +
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
//   DÉCOUPÉ   ce qui empiétait sur la voie. Le carré est centré sur le
//             centroïde du contour, et il déborde autour : un bâtiment dont le
//             centre est à treize mètres de l'axe avec une emprise de quarante
//             en occupait sept DANS la voie, et le train lui rentrait dedans.
//             On ne le déplace pas, on ne le jette pas : on lui retire ce qui
//             empiète. Le bâtiment réel n'est pas sur les rails, et
//             l'intersection de la boîte avec « pas sur la voie » est une borne
//             strictement meilleure que la boîte. \`depth\` porte la profondeur
//             restante ; quand elle vaut \`plate\`, rien n'a été retiré.
//   INVENTÉ   rien de géométrique. La teinte de façade, les enseignes, les
//             fenêtres allumées viennent du tissu de quartier
//             (src/data/districts.ts) : aucune source ne les porte, et le
//             drapeau \`real\` du ruban permet de ne jamais les confondre.
//
// ${out.skippedInside} bâtiments d'OpenStreetMap tiennent ENTIÈREMENT dans l'emprise
// ferroviaire et ne sont pas posés ; ${out.clipped} la mordaient et ont été découpés.
// ${out.skippedShape} autres ont une boîte englobante de plus de ${out.plateMax} m : un carré de ce
// côté-là revendique un volume que la source ne porte pas - une marquise de
// quai de quatre cent neuf mètres n'est pas un cube - et ils restent donc dans
// data/geo/footprints.json, où leur contour attend qu'on sache le lire.
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
  /** Côté de la boîte englobante du contour OSM (m) : la longueur le long de la voie. */
  plate: number;
  /**
   * Profondeur en travers de la voie (m), après découpe au gabarit ferroviaire.
   *
   * Vaut \`plate\` quand la boîte ne mordait pas la voie, c'est-à-dire pour
   * presque tout le monde.
   */
  depth: number;
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

/** Écartés parce qu'un carré de ce côté-là n'aurait rien représenté. */
export const CORRIDOR_SKIPPED_SHAPE = ${out.skippedShape};
export const CORRIDOR_PLATE_MAX = ${out.plateMax};

/** Découpés au gabarit ferroviaire : leur boîte mordait la voie. */
export const CORRIDOR_CLIPPED = ${out.clipped};

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
  depth: r[4] / 10,
  measured: r[5] === 1,
  yaw: r[6] / 1e4,
  osmWay: r[7],
}));
`;
  writeFileSync(new URL('../../src/data/corridor.ts', import.meta.url), src, 'utf8');
}

main();
