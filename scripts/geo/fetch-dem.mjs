// Le relief, depuis le modèle numérique de terrain du 国土地理院.
//
//   node scripts/geo/fetch-dem.mjs [--force]
//
// Émet trois choses :
//   · data/geo/loop-elevation.json  le profil d'altitude au fil de la voie
//   · data/geo/relief.json          les sommets du tour d'horizon
//   · src/data/terrainField.ts      le champ d'altitude du ruban urbain
//
// POURQUOI. C'est le fait géographique le plus fort de la ligne, et il était
// totalement absent : la Yamanote court à cheval sur DEUX terrains. L'arc ouest
// - Shinjuku, Shibuya, Ikebukuro - est sur le plateau de Musashino, une
// trentaine de mètres au-dessus de la mer. L'arc est - Tokyo, Ueno, Akihabara -
// est sur la plaine alluviale du Sumida, à trois ou quatre mètres. Entre les
// deux court la falaise du plateau, que la ligne longe de Tabata à Nippori et
// qui porte le parc d'Ueno, la colline de Yanaka, le plateau de Gotenyama.
//
// La bible en fait ses règles 4, 6, 7 et 8. Le jeu, lui, posait toute sa ville
// sur un plan horizontal : Shibuya au fond de sa cuvette et Nishi-Nippori au
// bord de sa falaise avaient exactement le même sol.
//
// CE QUE LE MNT DIT, ET NE DIT PAS. Ce sont des altitudes ORTHOMÉTRIQUES du sol
// nu, à dix mètres de maille, mesurées par le service géographique national.
// Elles ne portent ni les bâtiments, ni les remblais de voie ferrée trop étroits
// pour la maille - le viaduc de Yūrakuchō n'y est pas, et c'est très bien : le
// jeu le pose lui-même par-dessus, depuis src/data/segments.ts.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { parseArgs } from './lib/args.mjs';
import { makeProjector, pickJapanZone } from './lib/geo.mjs';
import { Dem, pixelMeters } from './lib/dem.mjs';
import { overpass } from './lib/net.mjs';
import { provenance } from './lib/source.mjs';
import { PLATFORMS } from './lib/platforms.mjs';

/** Pas d'échantillonnage le long de la voie (m) : la maille du ruban urbain. */
const S_STEP = 40;

/** Demi-largeur du champ d'altitude du ruban (m) et son pas. */
const LATERAL_REACH = 400;
const LATERAL_STEP = 40;

/** Rayon du tour d'horizon (m). Le Fuji est à 100 km : il sert de contrôle. */
const RELIEF_RADIUS = 110000;

/**
 * Un sommet n'entre au tour d'horizon qu'à partir de ces deux seuils (m).
 *
 * Cent mètres, et non trois cents : dans la bande de vingt à cinquante
 * kilomètres que la bible décrit, il n'y a PAS de montagne. Les collines de
 * Tama, de Sayama et de Bōsō culminent entre cent et deux cents mètres, et ce
 * sont elles qui font l'ondulation du fond de ciel à l'ouest. La vraie montagne
 * ne commence qu'à cinquante kilomètres, au mont Ōyama et au mont Takao.
 */
const SUMMIT_MIN_ALT = 100;
const SUMMIT_MIN_RELIEF = 60;

/** Rayon de la fenêtre de maximum local, et de la mesure de relief (m). */
const SUMMIT_WINDOW = 2500;
const RELIEF_WINDOW = 4000;

/**
 * Date du jeu de données.
 *
 * Le DEM10B est une carte nationale mise à jour par régions ; le service ne
 * date pas ses tuiles individuellement. On enregistre la date de la livraison
 * dont relève la couverture de Tokyo, telle que le 国土地理院 la publie.
 */
const DEM_DATE = '2024-04-01';

async function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['force'] });

  const loopDoc = JSON.parse(
    readFileSync(new URL('../../data/geo/yamanote-loop.geojson', import.meta.url), 'utf8'),
  );
  const ring = loopDoc.features[0].geometry.coordinates.slice(0, -1);

  const epsg = pickJapanZone(PLATFORMS[0].lon, PLATFORMS[0].lat);
  const projector = makeProjector(epsg);
  const tokyoStop = loopDoc.stations.find((s) => s.index === 0);
  const origin = projector.forward(tokyoStop.stopLon, tokyoStop.stopLat);
  const local = (lon, lat) => {
    const p = projector.forward(lon, lat);
    return { x: p.east - origin.east, z: -(p.north - origin.north) };
  };
  const global = (x, z) => projector.inverse(x + origin.east, -z + origin.north);

  // --- La voie, rééchantillonnée à pas constant ---------------------------
  const poly = ring.map(([lon, lat]) => local(lon, lat));
  const cum = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const perimeter = cum[poly.length];
  const rows = Math.round(perimeter / S_STEP);
  const step = perimeter / rows;

  const at = (s) => {
    const t = ((s % perimeter) + perimeter) % perimeter;
    let lo = 0;
    let hi = poly.length;
    while (lo + 1 < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= t) lo = m;
      else hi = m;
    }
    const a = poly[lo];
    const b = poly[(lo + 1) % poly.length];
    const seg = cum[lo + 1] - cum[lo];
    const k = seg > 1e-6 ? (t - cum[lo]) / seg : 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Normale à gauche du sens de marche, dans le repère (x est, z nord négatif).
    return { x: a.x + dx * k, z: a.z + dz * k, nx: dz / len, nz: -dx / len };
  };

  // --- Le MNT du corridor ---------------------------------------------------
  const cols = 2 * Math.round(LATERAL_REACH / LATERAL_STEP) + 1;
  const half = (cols - 1) / 2;
  const samples = [];
  for (let r = 0; r < rows; r++) {
    const p = at(r * step);
    for (let c = 0; c < cols; c++) {
      const d = (c - half) * LATERAL_STEP;
      samples.push(global(p.x + p.nx * d, p.z + p.nz * d));
    }
  }
  const bbox = samples.reduce(
    (b, g) => ({
      minLon: Math.min(b.minLon, g.lon),
      maxLon: Math.max(b.maxLon, g.lon),
      minLat: Math.min(b.minLat, g.lat),
      maxLat: Math.max(b.maxLat, g.lat),
    }),
    { minLon: 180, maxLon: -180, minLat: 90, maxLat: -90 },
  );

  process.stdout.write('Relief du corridor (出典：国土地理院)\n');
  const near = new Dem({ zoom: 14, force: args.force });
  await near.load(bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat, { label: 'corridor' });

  const field = new Int16Array(rows * cols);
  let sea = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = near.sample(samples[i].lon, samples[i].lat);
    if (v === null) sea++;
    // Décimètres : la précision du MNT est décimétrique, et int16 porte
    // jusqu'à 3 276 m - le Fuji tiendrait tout juste.
    field[i] = Math.round((v ?? 0) * 10);
  }
  process.stdout.write(
    `  champ ${rows} × ${cols} (${S_STEP} m × ${LATERAL_STEP} m), ` +
      `${sea} points hors couverture (mer)\n`,
  );

  // --- Le profil de la voie -------------------------------------------------
  const profile = [];
  for (let r = 0; r < rows; r++) profile.push(field[r * cols + half] / 10);
  // Le GeoJSON donne le rang du sommet de chaque gare : son abscisse est donc
  // lue dans la table cumulée, sans avoir à la rechercher.
  const stationElev = loopDoc.stations.map((st) => {
    const r = Math.round(cum[st.vertex] / step) % rows;
    return { index: st.index, name: st.name, elevation: round(profile[r], 1), row: r };
  });
  const lo = stationElev.reduce((a, b) => (a.elevation < b.elevation ? a : b));
  const hi = stationElev.reduce((a, b) => (a.elevation > b.elevation ? a : b));
  process.stdout.write(
    `  profil : ${lo.name} ${lo.elevation} m … ${hi.name} ${hi.elevation} m ` +
      `(dénivelé ${round(hi.elevation - lo.elevation, 1)} m)\n`,
  );

  // --- Le tour d'horizon ----------------------------------------------------
  process.stdout.write('Relief régional\n');
  const centre = at(0);
  const c0 = global(centre.x, centre.z);
  const dLat = RELIEF_RADIUS / 111320;
  const dLon = RELIEF_RADIUS / (111320 * Math.cos(c0.lat * (Math.PI / 180)));
  const far = new Dem({ zoom: 9, force: args.force });
  await far.load(c0.lon - dLon, c0.lat - dLat, c0.lon + dLon, c0.lat + dLat, { label: 'région' });

  const cell = pixelMeters(c0.lat, 9);
  const gridN = Math.ceil((2 * RELIEF_RADIUS) / cell);
  const grid = new Float32Array(gridN * gridN);
  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < gridN; i++) {
      const x = centre.x + (i - gridN / 2) * cell;
      const z = centre.z + (j - gridN / 2) * cell;
      const g = global(x, z);
      const v = far.sample(g.lon, g.lat);
      grid[j * gridN + i] = v === null ? -1 : v;
    }
  }
  const summits = findSummits(grid, gridN, cell, centre, poly);
  process.stdout.write(`  ${summits.length} sommets au-dessus de ${SUMMIT_MIN_ALT} m\n`);

  const named = await nameSummits(summits, global, args.force);
  const withNames = named.filter((s) => s.name).length;
  const inBand = named.filter(
    (s) => s.distanceFromLoop >= 20000 && s.distanceFromLoop <= 50000,
  ).length;
  process.stdout.write(
    `  ${withNames} nommés depuis OpenStreetMap, ${inBand} dans la bande 20-50 km\n`,
  );
  const fuji = named.find((s) => s.name?.includes('富士山'));
  if (fuji) {
    process.stdout.write(
      `  contrôle : ${fuji.name} à ${Math.round(fuji.distanceFromLoop / 1000)} km de la voie, ` +
        `${fuji.altitude} m au MNT contre 3 776 m au sommet\n`,
    );
  } else {
    throw new Error(
      'Le Fuji n’est pas dans les sommets trouvés : le MNT régional n’a pas la ' +
        'couverture attendue, ou la recherche de maxima est cassée.',
    );
  }

  // --- Écriture -------------------------------------------------------------
  const dir = new URL('../../data/geo/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const prov = provenance({ source: 'gsi', datasetDate: DEM_DATE, layer: 'DATA_STATIC' });

  writeFileSync(
    new URL('loop-elevation.json', dir),
    `${JSON.stringify(
      {
        ...prov,
        dataset: 'DEM10B',
        note:
          'Altitudes orthométriques du sol nu, maille 10 m, échantillonnées au fil ' +
          'de l’axe relevé des voies. Le remblai et le viaduc ne sont PAS dedans : ' +
          'le jeu les pose par-dessus depuis src/data/segments.ts.',
        step: round(step, 3),
        count: rows,
        generatedBy: 'scripts/geo/fetch-dem.mjs',
        stations: stationElev,
        profile: profile.map((v) => round(v, 1)),
      },
      null,
      1,
    )}\n`,
    'utf8',
  );

  writeFileSync(
    new URL('relief.json', dir),
    `${JSON.stringify(
      {
        ...prov,
        dataset: 'DEM10B au zoom 9',
        note:
          'Maxima locaux du MNT régional. « relief » est la dénivelée entre le ' +
          'sommet et le point le plus bas dans un rayon de quatre kilomètres : ' +
          'ce n’est PAS la proéminence topographique, qui demanderait de suivre ' +
          'les cols. Les noms viennent d’OpenStreetMap quand un natural=peak se ' +
          'trouve à moins de deux kilomètres ; sinon le sommet reste anonyme et ' +
          'ne porte aucune étiquette à l’écran (règle 11).',
        cellMeters: round(cell, 1),
        radius: RELIEF_RADIUS,
        count: named.length,
        generatedBy: 'scripts/geo/fetch-dem.mjs',
        summits: named,
      },
      null,
      1,
    )}\n`,
    'utf8',
  );

  writeTerrainField({ field, rows, cols, step, profile, prov, stationElev });
  writeRelief(named, prov);

  process.stdout.write(
    '\ndata/geo/loop-elevation.json, data/geo/relief.json, src/data/terrainField.ts et ' +
      'src/data/relief.ts écrits.\n',
  );
}

/**
 * Maxima locaux du MNT régional.
 *
 * Un sommet est une cellule qui domine sa fenêtre. La « dénivelée locale » qu'on
 * lui associe - hauteur au-dessus du point le plus bas d'un rayon de quatre
 * kilomètres - n'est PAS la proéminence topographique : celle-ci demanderait de
 * suivre les lignes de crête jusqu'au col qui mène à un sommet plus haut, ce
 * qu'une maille de 250 m ne permet pas honnêtement. Elle sépare néanmoins très
 * bien une montagne d'une épaule, et c'est tout ce qu'on lui demande.
 */
function findSummits(grid, n, cell, centre, poly) {
  const w = Math.max(1, Math.round(SUMMIT_WINDOW / cell));
  const rw = Math.max(1, Math.round(RELIEF_WINDOW / cell));
  const out = [];
  for (let j = w; j < n - w; j++) {
    for (let i = w; i < n - w; i++) {
      const h = grid[j * n + i];
      if (h < SUMMIT_MIN_ALT) continue;
      let isMax = true;
      for (let dj = -w; dj <= w && isMax; dj++) {
        for (let di = -w; di <= w; di++) {
          if (di === 0 && dj === 0) continue;
          const v = grid[(j + dj) * n + (i + di)];
          if (v > h || (v === h && (dj < 0 || (dj === 0 && di < 0)))) {
            isMax = false;
            break;
          }
        }
      }
      if (!isMax) continue;
      let low = h;
      for (let dj = -rw; dj <= rw; dj++) {
        for (let di = -rw; di <= rw; di++) {
          const jj = j + dj;
          const ii = i + di;
          if (jj < 0 || jj >= n || ii < 0 || ii >= n) continue;
          const v = grid[jj * n + ii];
          if (v >= 0 && v < low) low = v;
        }
      }
      const relief = h - low;
      if (relief < SUMMIT_MIN_RELIEF) continue;
      const x = centre.x + (i - n / 2) * cell;
      const z = centre.z + (j - n / 2) * cell;
      const distance = Math.hypot(x - centre.x, z - centre.z);
      if (distance > RELIEF_RADIUS) continue;
      out.push({
        x,
        z,
        altitude: h,
        relief,
        distance,
        fromLoop: distanceToLoop(x, z, poly),
        halfWidth: halfWidthOf(grid, n, cell, i, j, h, relief),
      });
    }
  }
  out.sort((a, b) => b.relief - a.relief);
  return out;
}

/**
 * Demi-largeur d'un sommet (m) : le rayon où il a perdu la moitié de sa hauteur.
 *
 * C'est la mesure qui manque pour DESSINER une montagne. Une silhouette
 * demande deux nombres, la hauteur et l'étalement, et le second ne se déduit
 * pas du premier : le Fuji perd la moitié de ses trois mille mètres en une
 * dizaine de kilomètres - un cône très ouvert -, une colline de Bōsō perd ses
 * cent mètres en cinq cents. Deviner une pente moyenne aurait donné au Fuji
 * une aiguille et aux collines une table.
 *
 * Mesurée en seize directions, puis moyennée : un sommet d'arête est large dans
 * un sens et étroit dans l'autre, et la silhouette vue de Tokyo est quelque part
 * entre les deux.
 */
function halfWidthOf(grid, n, cell, i, j, h, relief) {
  const target = h - relief / 2;
  const maxSteps = Math.round(20000 / cell);
  let sum = 0;
  let count = 0;
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * 2 * Math.PI;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    let hit = maxSteps;
    for (let k = 1; k <= maxSteps; k++) {
      const ii = Math.round(i + dx * k);
      const jj = Math.round(j + dy * k);
      if (ii < 0 || ii >= n || jj < 0 || jj >= n) break;
      if (grid[jj * n + ii] < target) {
        hit = k;
        break;
      }
    }
    sum += hit * cell;
    count++;
  }
  return sum / count;
}

/**
 * Distance à la voie (m), et non à la gare de Tokyo.
 *
 * C'est celle qui compte : les bandes de la bible se mesurent depuis le point
 * kilométrique où l'on se trouve, et la boucle fait treize kilomètres du nord au
 * sud. Une colline « à cinquante kilomètres de Tokyo » peut être à quarante de
 * Shibuya, ce qui la fait changer de bande.
 */
function distanceToLoop(px, pz, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    let t = len2 === 0 ? 0 : ((px - a.x) * vx + (pz - a.z) * vz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (a.x + t * vx), pz - (a.z + t * vz));
    if (d < best) best = d;
  }
  return best;
}

/** Nom OSM d'un sommet, s'il y a un `natural=peak` à moins de deux kilomètres. */
async function nameSummits(summits, global, force) {
  // `volcano` autant que `peak` : le Fuji est un volcan pour OpenStreetMap, et
  // sans lui le contrôle de couverture du MNT n'a plus de témoin.
  const peaks = await overpass(
    '[out:json][timeout:180];(' +
      'node["natural"="peak"]["name"](34.4,138.0,36.7,140.9);' +
      'node["natural"="volcano"]["name"](34.4,138.0,36.7,140.9);' +
      ');out;',
    { label: 'sommets nommés', force },
  );
  const list = peaks.elements.filter((e) => e.type === 'node' && e.tags?.name);
  return summits.map((s) => {
    const g = global(s.x, s.z);
    // Parmi les sommets nommés du voisinage, on retient LE PLUS HAUT et non le
    // plus proche : le maximum trouvé dans le MNT est par construction le point
    // culminant de sa fenêtre, et c'est donc le point culminant nommé qui lui
    // correspond. Sans ça, le Fuji s'appelait 白山岳 - l'un des huit pics de son
    // cratère, à quelques centaines de mètres du vrai sommet.
    let best = null;
    for (const p of list) {
      const d = Math.hypot((p.lon - g.lon) * 90500, (p.lat - g.lat) * 111320);
      if (d > 2000) continue;
      const ele = Number(p.tags.ele) || 0;
      if (!best || ele > best.ele || (ele === best.ele && d < best.d)) best = { d, ele, p };
    }
    return {
      name: best ? (best.p.tags['name:ja'] ?? best.p.tags.name) : null,
      nameEn: best ? (best.p.tags['name:en'] ?? null) : null,
      /** Altitude étiquetée par OSM, quand elle existe : un second avis. */
      taggedElevation: best?.ele || null,
      lon: round(g.lon, 5),
      lat: round(g.lat, 5),
      x: round(s.x, 0),
      z: round(s.z, 0),
      altitude: round(s.altitude, 0),
      relief: round(s.relief, 0),
      halfWidth: round(s.halfWidth, 0),
      distanceFromTokyo: round(s.distance, 0),
      distanceFromLoop: round(s.fromLoop, 0),
    };
  });
}

/** Le champ d'altitude du ruban, en TypeScript : base64 d'int16 en décimètres. */
function writeTerrainField({ field, rows, cols, step, profile, prov, stationElev }) {
  const bytes = Buffer.from(field.buffer, field.byteOffset, field.byteLength);
  const b64 = bytes.toString('base64');
  const wrapped = b64.match(/.{1,96}/g).join("' +\n  '");
  const half = (cols - 1) / 2;
  const src = `// Le relief au droit de la voie, en décimètres.
//
// GÉNÉRÉ par \`node scripts/geo/fetch-dem.mjs\` - ne pas éditer à la main.
//
// ${prov.attribution} · ${prov.source}
// Licence ${prov.license} · jeu daté du ${prov.datasetDate} · ${prov.layer}
//
// LE FAIT GÉOGRAPHIQUE LE PLUS FORT DE LA LIGNE, et il manquait. La Yamanote
// court à cheval sur deux terrains : l'arc ouest sur le plateau de Musashino,
// une trentaine de mètres au-dessus de la mer, l'arc est sur la plaine
// alluviale du Sumida, à trois ou quatre. Entre les deux, la falaise du plateau,
// que la ligne longe de Tabata à Nippori.
//
${stationElev
  .map((s) => `//   ${s.name.padEnd(17)} ${String(s.elevation).padStart(5)} m`)
  .join('\n')}
//
// LE FORMAT. Un rectangle de ${rows} × ${cols} altitudes : une rangée tous les
// ${Math.round(step)} m le long de la voie, une colonne tous les ${LATERAL_STEP} m en travers, de
// −${LATERAL_REACH} m à +${LATERAL_REACH} m. Décimètres en int16, base64 : ${Math.round(field.byteLength / 1024)} ko de données pour
// tout le corridor urbain, sans un seul aller-retour réseau au chargement.
//
// Zéro là où le MNT n'a pas de donnée, c'est-à-dire en mer. C'est le niveau
// marin, donc la bonne valeur ; la géométrie de l'eau, elle, vient d'OSM.

/** Nombre de rangées : une tous les \`TERRAIN_S_STEP\` mètres le long de la voie. */
export const TERRAIN_ROWS = ${rows};

/** Nombre de colonnes, impair : la colonne ${half} est l'axe de la voie. */
export const TERRAIN_COLS = ${cols};

/** Pas longitudinal (m). C'est aussi la maille du ruban urbain, \`CELL_LEN\`. */
export const TERRAIN_S_STEP = ${round(step, 4)};

/** Pas latéral (m). */
export const TERRAIN_X_STEP = ${LATERAL_STEP};

/** Demi-largeur couverte de part et d'autre de l'axe (m). */
export const TERRAIN_REACH = ${LATERAL_REACH};

/** Altitude de la voie à chaque rangée (m) : la colonne centrale, en clair. */
export const TERRAIN_PROFILE: readonly number[] = [
${chunk(profile.map((v) => v.toFixed(1)), 12)
  .map((line) => `  ${line.join(', ')},`)
  .join('\n')}
];

const PACKED =
  '${wrapped}';

/**
 * Le champ, décodé une fois au premier accès.
 *
 * Décimètres, rangée majeure. \`decode\` n'est appelé qu'une fois : les tests et
 * le jeu partagent la même instance.
 */
let field: Int16Array | null = null;

export function terrainField(): Int16Array {
  if (field) return field;
  const bin = atob(PACKED);
  const out = new Int16Array(TERRAIN_ROWS * TERRAIN_COLS);
  const view = new Uint8Array(out.buffer);
  for (let i = 0; i < view.length; i++) view[i] = bin.charCodeAt(i);
  field = out;
  return out;
}
`;
  writeFileSync(new URL('../../src/data/terrainField.ts', import.meta.url), src, 'utf8');
}

/** Les sommets, en TypeScript : ce que le rendu du tour d'horizon lit. */
function writeRelief(summits, prov) {
  // Le rendu n'a besoin ni de la longitude ni du nom anglais : ce sont des
  // silhouettes, elles ne portent aucune étiquette. On garde le nom japonais
  // pour pouvoir NOMMER une régression - « la crête d'Ōyama a disparu ».
  const kept = [...summits].sort((a, b) => b.relief - a.relief);
  const src = `// Le tour d'horizon : les sommets réels, du MNT du 国土地理院.
//
// GÉNÉRÉ par \`node scripts/geo/fetch-dem.mjs\` - ne pas éditer à la main.
//
// ${prov.attribution} · licence ${prov.license}
// Jeu daté du ${prov.datasetDate} · ${prov.layer}
//
// La bible décrit une bande de vingt à cinquante kilomètres, et la première
// chose que le relevé y dit est qu'IL N'Y A PAS DE MONTAGNE. Les collines de
// Tama, de Sayama, de Miura et de Bōsō culminent entre cent et deux cents
// mètres ; la vraie montagne commence à cinquante kilomètres, au mont Ōyama
// (1 171 m) et au-delà. La courbure de la Terre fait le reste du tri : depuis
// une vitre à quarante mètres d'altitude, l'horizon est à vingt-trois
// kilomètres, et une colline de cent cinquante mètres à quarante kilomètres
// est DERRIÈRE lui. C'est trois/city/FarRelief qui applique cette règle, une
// fois par image, à la cote réelle du train.
//
// Chaque sommet porte trois nombres qui suffisent à le dessiner : sa position,
// son altitude et sa DEMI-LARGEUR - le rayon où il a perdu la moitié de sa
// hauteur. Ce dernier ne se déduit pas des deux autres : le Fuji perd la
// moitié de ses trois mille mètres en dix kilomètres, une colline de Bōsō perd
// ses cent mètres en cinq cents.

export interface ReliefSummit {
  /** Nom japonais, ou null si aucun sommet nommé d'OSM n'est à moins de 2 km. */
  name: string | null;
  /** Est, en mètres depuis le point d'arrêt de Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le point d'arrêt de Tokyo. */
  z: number;
  /** Altitude orthométrique du sommet (m). */
  altitude: number;
  /** Dénivelée locale sur un rayon de quatre kilomètres (m). */
  relief: number;
  /** Rayon où le sommet a perdu la moitié de sa dénivelée (m). */
  halfWidth: number;
}

export const RELIEF_SUMMITS: readonly ReliefSummit[] = [
${kept
  .map(
    (s) =>
      `  { name: ${s.name ? `'${s.name}'` : 'null'}, x: ${s.x}, z: ${s.z}, ` +
      `altitude: ${s.altitude}, relief: ${s.relief}, halfWidth: ${s.halfWidth} },`,
  )
  .join('\n')}
];
`;
  writeFileSync(new URL('../../src/data/relief.ts', import.meta.url), src, 'utf8');
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const round = (v, d) => Number(v.toFixed(d));

main().catch((err) => {
  process.stderr.write(`\n${err.stack ?? err}\n`);
  process.exit(1);
});
