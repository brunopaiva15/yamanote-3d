// Les secteurs nommés autour de la boucle, et la masse qu'ils portent.
//
//   node scripts/geo/fetch-sectors.mjs [--force]
//
// Émet trois choses :
//   · data/geo/sectors.json    les secteurs résolus, avec provenance
//   · data/geo/km-bible.json   la grille de couverture de la bible, remplie
//   · src/data/sectors.ts      ce que le jeu en lit
//
// POURQUOI. Entre le dernier rang du ruban urbain (440 m) et le premier repère
// ponctuel de l'horizon (2 km), le décor ne contenait rien. Les bandes 1-5,
// 5-10 et 10-20 km de la bible étaient vides : la ville s'arrêtait à quatre
// cent quarante mètres et reprenait en brume. Or c'est là que se trouve
// l'essentiel de ce qu'on voit d'un train à Tokyo - la barre de Shinjuku depuis
// Yoyogi, Sunshine 60 depuis Ōtsuka, les tours d'Ōsaki depuis Meguro.
//
// CE QUE CE SCRIPT NE FAIT PAS. Il ne transcrit pas le texte de la bible. La
// bible fournit une STRUCTURE - trente-six points kilométriques, cinq bandes de
// rayon mesurées à vol d'oiseau - et une consigne de couverture ; elle ne
// fournit aucune géométrie, et la règle 11 interdit d'en tirer une.
//
// CE QU'IL MESURE, ET C'EST TOUT. Un secteur est un nœud `place` d'OSM. Sa
// masse visible n'est PAS son tissu courant - à cinq kilomètres, une rue de
// maisons de quinze mètres est sous l'horizon du premier immeuble venu - mais
// l'AMAS DE SES TOURS : les bâtiments de plus de cinquante-cinq mètres qui
// portent une étiquette `height` dans OSM. Leur barycentre donne la position de
// la masse, leur dispersion sa largeur, leur percentile haut sa ligne de faîte.
// Un secteur sans amas n'est pas dessiné, et c'est un FAIT : le Setagaya
// résidentiel ne dépasse de rien, on ne le voit pas d'un train, et lui inventer
// une silhouette serait exactement ce que la règle 11 refuse.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from './lib/args.mjs';
import { makeProjector, pickJapanZone } from './lib/geo.mjs';
import { Dem } from './lib/dem.mjs';
import { overpass } from './lib/net.mjs';
import { provenance } from './lib/source.mjs';
import { PLATFORMS } from './lib/platforms.mjs';

/** Les cinq rayons de la bible (m). Ils viennent du document, tels quels. */
const BANDS = [1000, 5000, 10000, 20000, 50000];

/** Le document compte trente-six points : un par kilomètre, plus le KM 34,5. */
const KM_POSTS = [...Array.from({ length: 35 }, (_, i) => i), 34.5];

/** KM 0 de la bible = Shinagawa, et le sens est celui des index décroissants. */
const KM0_STATION = 24;
const BIBLE_LOOP_KM = 34.5;

/**
 * Rangs de `place` retenus, du plus large au plus fin.
 *
 * `neighbourhood` est exclu : il y en a dix-sept mille dans la boîte, c'est le
 * découpage en 丁目, et il ne décrit aucune masse qu'on puisse voir de loin.
 */
const RANKS = ['city', 'borough', 'town', 'suburb', 'quarter'];

/** Rayon d'un secteur (m), déduit du voisinage et borné. */
const RADIUS_MIN = 350;
const RADIUS_MAX = 2600;

/** Portée de la boîte de requête au-delà de la boucle (m). */
const REACH = 52000;

/** Au-delà, DistrictMassif ne dessine plus : la bande 20-50 km est au relief. */
const DRAW_MAX = 20000;

/**
 * En deçà, c'est le ruban urbain qui dessine (m).
 *
 * Pas mille mètres - la bible met sa première frontière là, mais le ruban
 * s'arrête à quatre cent quarante. Entre les deux il y avait un trou, et c'est
 * précisément celui que cette couche vient combler : la barre de tours de
 * Nishi-Shinjuku est à sept cents mètres de la voie à Shinjuku, en plein dans
 * ce trou, et c'est la chose la plus visible de tout l'arc ouest.
 */
const DRAW_MIN = 500;

/**
 * Hauteur angulaire minimale d'une masse (rad).
 *
 * Trois dixièmes de degré, soit le tiers d'un doigt tendu à bout de bras. En
 * dessous, une masse n'est plus une masse mais un liséré, et la silhouette
 * peinte de la voûte céleste la porte déjà : trois tours de soixante mètres à
 * douze kilomètres n'ajouteraient qu'un pixel de gris sur du gris.
 */
const MIN_RISE = 0.0052;

/**
 * À partir de quelle hauteur un bâtiment compte-t-il dans la masse (m) ?
 *
 * Cinquante-cinq mètres, soit une quinzaine de niveaux. En dessous, à cinq
 * kilomètres, l'objet fait un demi-degré et disparaît derrière le premier rang
 * du ruban urbain, qui monte lui-même à cinquante mètres à quinze mètres de la
 * vitre. Ce n'est pas un seuil esthétique : c'est celui à partir duquel une
 * chose se voit par-dessus la ville proche.
 */
const TALL_MIN = 55;

/** Combien de tours faut-il pour parler d'un amas ? */
const TALL_MIN_COUNT = 3;

/** Combien de bâtiments étiquetés pour que le secteur soit dit RÉSOLU ? */
const SAMPLES_MIN = 6;

/** Percentile retenu pour la ligne de faîte d'un amas. */
const SKYLINE_Q = 0.85;

/** Maille de groupement des tours (m) : au-delà, deux tours sont deux amas. */
const CLUSTER_CELL = 420;

/** Jusqu'où chercher le nom d'un amas (m). */
const NAME_REACH = 1200;

/** Dispersion au-delà de laquelle un amas est débité en tuiles (m). */
const SPLIT_SPREAD = 900;
const TILE = 900;

/** Date de livraison du MNT utilisé, comme dans fetch-dem. */
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

  const poly = ring.map(([lon, lat]) => local(lon, lat));
  const cum = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const perimeter = cum[poly.length];
  const stations = loopDoc.stations.map((st) => ({ ...st, s: cum[st.vertex] }));

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
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  };

  // Les points kilométriques de la bible, posés sur la LONGUEUR de la voie.
  const km0 = stations.find((st) => st.index === KM0_STATION).s;
  const kmToS = perimeter / (BIBLE_LOOP_KM * 1000);
  const posts = KM_POSTS.map((km) => {
    const s = (((km0 - km * 1000 * kmToS) % perimeter) + perimeter) % perimeter;
    return { km, s, ...at(s) };
  });

  // --- Les requêtes ----------------------------------------------------------
  const box = boxOf(ring, REACH);
  const boxDraw = boxOf(ring, DRAW_MAX + 2000);

  process.stdout.write('Les secteurs nommés autour de la Yamanote\n');
  const placeRes = await overpass(
    `[out:json][timeout:600];` +
      `node["place"~"^(${RANKS.join('|')})$"]["name"](${bbox(box)});` +
      `out body meta;`,
    { label: 'secteurs', force: args.force },
  );

  // Les hauteurs. On ne prend que la bande dessinée : hors d'elle, DistrictMassif
  // ne pose rien, et une requête sur cinquante kilomètres coûterait dix minutes
  // à un service gratuit pour une donnée qu'on n'utiliserait pas.
  const heightRes = await overpass(
    `[out:json][timeout:900];` +
      `way["building"]["height"](${bbox(boxDraw)});` +
      `out center meta;`,
    { label: 'hauteurs déclarées', force: args.force },
  );

  let datasetDate = '';
  const marks = (e) => {
    if (e.timestamp && e.timestamp > datasetDate) datasetDate = e.timestamp;
  };

  // --- Les bâtiments étiquetés, rangés dans une grille -----------------------
  const CELL = 500;
  const all = new Grid(CELL);
  const tallOnes = new Grid(CELL);
  let tagged = 0;
  let tall = 0;
  for (const e of heightRes.elements) {
    marks(e);
    const h = parseHeight(e.tags?.height);
    if (h === null) continue;
    const c = e.center ?? (e.lat !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!c) continue;
    const p = local(c.lon, c.lat);
    all.add(p.x, p.z, { x: p.x, z: p.z, h });
    tagged++;
    if (h >= TALL_MIN) {
      tallOnes.add(p.x, p.z, { x: p.x, z: p.z, h });
      tall++;
    }
  }
  process.stdout.write(
    `  ${tagged} bâtiments portent une hauteur déclarée, dont ${tall} au-dessus de ${TALL_MIN} m\n`,
  );

  // --- Les secteurs ----------------------------------------------------------
  const raw = [];
  for (const e of placeRes.elements) {
    marks(e);
    const tags = e.tags ?? {};
    const rankOrder = RANKS.indexOf(tags.place);
    if (rankOrder < 0 || !tags.name) continue;
    const p = local(e.lon, e.lat);
    const distance = distanceToLoop(p.x, p.z, poly);
    raw.push({
      id: `osm-node-${e.id}`,
      osmNode: e.id,
      name: tags.name,
      nameEn: tags['name:en'] ?? null,
      rank: tags.place,
      rankOrder,
      lon: e.lon,
      lat: e.lat,
      x: p.x,
      z: p.z,
      distance,
      band: BANDS.findIndex((b) => distance <= b),
    });
  }

  // Ce qui nous occupe : tout ce qui est à moins de vingt kilomètres. La bande
  // 20-50 km est celle du relief régional (data/geo/relief.json, chantier 2) et
  // des repères de l'horizon, et rien de ce qui est là n'est de notre ressort.
  //
  // La bande 0-1 km reste, elle, et c'est délibéré : le nœud `place` de
  // 新宿区 est SUR la voie, mais l'amas de tours qu'il nomme est à sept cents
  // mètres de là. C'est la position de la MASSE qui décidera, pas celle du nom.
  const sectors = raw.filter((s) => s.band >= 0 && s.band <= 3);
  process.stdout.write(
    `  ${raw.length} secteurs relevés, ${sectors.length} à moins de vingt kilomètres\n`,
  );

  // Rayon : moitié de la distance au voisin de rang égal ou supérieur. Un
  // quartier serré dans Tokyo tombe à quelques centaines de mètres, une ville
  // isolée de la banlieue s'étale. C'est une DÉDUCTION, jamais un relevé.
  for (const s of sectors) {
    let near = Infinity;
    for (const o of raw) {
      if (o === s || o.rankOrder > s.rankOrder) continue;
      near = Math.min(near, Math.hypot(o.x - s.x, o.z - s.z));
    }
    s.radius = Math.round(Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, near / 2)));
  }

  // --- La classe de hauteur de chaque secteur --------------------------------
  for (const s of sectors) {
    const near = all.within(s.x, s.z, s.radius);
    s.samples = near.length;
    s.tall = tallOnes.within(s.x, s.z, s.radius).length;
    s.unresolved =
      s.samples < SAMPLES_MIN
        ? `hauteurs non relevées dans l’emprise (${s.samples} bâtiment(s) étiqueté(s) sur ` +
          `les ${SAMPLES_MIN} qu’il faudrait)`
        : null;
    // La classe de hauteur n'est publiée QUE si le secteur est résolu. Deux
    // maisons étiquetées ne disent rien du tissu d'un quartier, et publier
    // quand même leur médiane serait présenter un chiffre pour une mesure.
    s.roof =
      s.unresolved === null ? round(quantile(near.map((b) => b.h).sort(num), 0.75), 1) : null;
  }
  const resolved = sectors.filter((s) => s.unresolved === null);
  process.stdout.write(
    `  ${resolved.length} résolus, ${sectors.length - resolved.length} marqués unresolved\n`,
  );

  // --- Les amas de tours -----------------------------------------------------
  //
  // Une masse n'est PAS le contenu d'une emprise administrative. Cherchée
  // ainsi, elle donnait n'importe quoi : les tours de 新宿区 s'étalent sur un
  // kilomètre et demi de part et d'autre de la voie, leur barycentre tombait
  // donc SUR la voie - au milieu de la gare - et la barre de Nishi-Shinjuku
  // se retrouvait à quatre cents mètres du mauvais côté.
  //
  // Un amas est un fait de terrain : des tours qui se touchent. On les groupe
  // donc par contiguïté, sur une maille de quatre cent vingt mètres - la
  // distance en deçà de laquelle deux tours de Tokyo appartiennent au même
  // quartier d'affaires -, et le nom vient APRÈS, du secteur le plus fin qui
  // tombe dessus.
  const clusters = [];
  {
    const cells = new Map();
    for (const list of tallOnes.map.values()) {
      for (const b of list) {
        const key = `${Math.floor(b.x / CLUSTER_CELL)},${Math.floor(b.z / CLUSTER_CELL)}`;
        const at = cells.get(key);
        if (at) at.push(b);
        else cells.set(key, [b]);
      }
    }
    const seen = new Set();
    for (const start of cells.keys()) {
      if (seen.has(start)) continue;
      seen.add(start);
      const stack = [start];
      const members = [];
      while (stack.length) {
        const k = stack.pop();
        members.push(...cells.get(k));
        const [i, j] = k.split(',').map(Number);
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const nk = `${i + di},${j + dj}`;
            if (cells.has(nk) && !seen.has(nk)) {
              seen.add(nk);
              stack.push(nk);
            }
          }
        }
      }
      if (members.length < TALL_MIN_COUNT) continue;
      // Le centre de Tokyo est un SEUL amas : de Shinjuku à Shiodome, il n'y a
      // jamais quatre cents mètres sans une tour, et la contiguïté recoud donc
      // trois cent soixante-dix-huit tours en un bloc de quatre kilomètres. Ce
      // n'est pas faux - c'est même exactement ce que c'est - mais une masse de
      // quatre kilomètres posée à son barycentre serait un mur sans relèvement.
      // On la débite en tuiles de neuf cents mètres, qui gardent chacune leur
      // direction vraie et forment ensemble la banque de masses qu'on voit.
      for (const part of split(members)) clusters.push(shape(part, poly));
    }
  }
  process.stdout.write(
    `  ${clusters.length} amas d’au moins ${TALL_MIN_COUNT} tours, groupés par contiguïté\n`,
  );

  // Le nom : le secteur le plus FIN dont l'emprise couvre le barycentre. Un
  // amas nommé « 港区 » ne dit rien ; « 虎ノ門 » dit tout. À défaut, le secteur
  // nommé le plus proche, et à défaut de cela l'amas reste anonyme - il est
  // relevé, il se voit, il n'a simplement pas de nom dans OpenStreetMap.
  for (const c of clusters) {
    let best = null;
    for (const s of raw) {
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      if (d > Math.max(NAME_REACH, s.radius ?? 0)) continue;
      if (!best || s.rankOrder > best.s.rankOrder || (s.rankOrder === best.s.rankOrder && d < best.d)) {
        best = { s, d };
      }
    }
    c.sector = best ? best.s : null;
    c.name = best ? best.s.name : null;
    c.nameEn = best?.s.nameEn ?? null;
    c.rank = best ? best.s.rank : null;
    c.nameDistance = best ? Math.round(best.d) : null;
  }

  // --- L'altitude du sol, depuis le MNT --------------------------------------
  process.stdout.write('Altitude des secteurs (出典：国土地理院)\n');
  const dem = new Dem({ zoom: 12, force: args.force });
  const demBox = boxOf(
    sectors.map((s) => [s.lon, s.lat]),
    RADIUS_MAX + 1000,
  );
  await dem.load(demBox.minLon, demBox.minLat, demBox.maxLon, demBox.maxLat, { label: 'secteurs' });
  const cote = (x, z, lon, lat) => {
    const g = x === null ? { lon, lat } : global(x, z);
    const v = dem.sample(g.lon, g.lat);
    return v === null ? null : round(v, 1);
  };
  for (const s of sectors) s.elevation = cote(null, null, s.lon, s.lat);
  for (const c of clusters) c.elevation = cote(c.x, c.z, 0, 0);

  // --- Les masses dessinées --------------------------------------------------
  const drawn = clusters
    .filter(
      (c) =>
        c.distance > DRAW_MIN && c.distance <= DRAW_MAX && c.height / c.distance > MIN_RISE,
    )
    .sort((a, b) => a.distance - b.distance);
  // L'identifiant est celui du LIEU, pas du rang dans la liste : deux imports
  // successifs doivent donner le même, sans quoi rien n'est comparable d'une
  // version à l'autre.
  for (const c of drawn) c.id = `mass-${Math.round(c.x)}-${Math.round(c.z)}`;

  process.stdout.write(`  ${drawn.length} masses dessinées, du plus près au plus loin\n`);
  for (const b of [0, 1, 2, 3]) {
    const inBand = sectors.filter((s) => s.band === b);
    process.stdout.write(
      `    bande ${b === 0 ? 0 : BANDS[b - 1] / 1000}-${BANDS[b] / 1000} km : ` +
        `${inBand.length} secteurs, ` +
        `${inBand.filter((s) => s.unresolved === null).length} résolus, ` +
        `${drawn.filter((c) => c.band === b).length} masses dessinées\n`,
    );
  }
  for (const c of drawn) {
    process.stdout.write(
      `      ${(c.name ?? '(sans nom)').padEnd(10)} ${String(c.distance).padStart(6)} m  ` +
        `faîte ${String(c.height).padStart(6)} m  plus haut ${String(c.tallest).padStart(6)} m  ` +
        `${c.tall} tours\n`,
    );
  }

  // --- La grille de couverture de la bible -----------------------------------
  const grid = posts.map((post) => {
    const bands = BANDS.map((outer, b) => {
      const inner = b === 0 ? 0 : BANDS[b - 1];
      const here = sectors.filter((s) => {
        const d = Math.hypot(s.x - post.x, s.z - post.z);
        return d > inner && d <= outer;
      });
      const seen = drawn.filter((c) => {
        const d = Math.hypot(c.x - post.x, c.z - post.z);
        return d > inner && d <= outer;
      });
      return {
        band: b,
        inner,
        outer,
        // La couverture d'une bande n'est pas toujours de notre ressort : la
        // bande 0-1 km est celle du ruban urbain, la bande 20-50 km celle du
        // relief régional. On le DIT plutôt que de laisser croire à un trou.
        coveredBy:
          b === 0 ? 'ruban urbain (systems/cityField)' : b === 4 ? 'relief régional (data/relief)' : 'DistrictMassif',
        sectors: here.length,
        resolved: here.filter((s) => s.unresolved === null).length,
        unresolved: here.filter((s) => s.unresolved !== null).length,
        masses: seen.map((c) => c.id),
        names: seen.slice(0, 10).map((c) => c.name ?? '(sans nom)'),
      };
    });
    return { km: post.km, s: round(post.s, 1), x: round(post.x, 1), z: round(post.z, 1), bands };
  });

  const blind = [];
  for (const g of grid) {
    for (const b of g.bands) {
      if (b.coveredBy !== 'DistrictMassif') continue;
      if (b.sectors > 0 && b.resolved === 0) {
        blind.push(`KM ${g.km} bande ${b.inner / 1000}-${b.outer / 1000} km`);
      }
    }
  }
  process.stdout.write(
    `  grille : ${grid.length} points × ${BANDS.length} bandes, ` +
      `${blind.length} cases peuplées mais sans un seul secteur résolu\n`,
  );
  for (const b of blind.slice(0, 8)) process.stdout.write(`    ${b}\n`);

  // --- Écriture --------------------------------------------------------------
  datasetDate = datasetDate.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const prov = provenance({ source: 'osm', datasetDate, layer: 'DATA_STATIC' });
  const dir = new URL('../../data/geo/', import.meta.url);
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    new URL('sectors.json', dir),
    `${JSON.stringify(
      {
        ...prov,
        note:
          `Secteurs nommés d’OpenStreetMap (place=${RANKS.join('|')}) dans les bandes 1-20 km de ` +
          `la bible. Le rayon est DÉDUIT de la distance au voisin de même rang, jamais relevé ` +
          `(measuredRadius:false). La masse visible est l’amas des bâtiments de plus de ` +
          `${TALL_MIN} m qui portent une étiquette height : barycentre, dispersion, percentile ` +
          `${SKYLINE_Q}. Altitude du sol au MNT du 国土地理院 (${DEM_DATE}). Un secteur sans ` +
          `hauteur relevée porte unresolved ; un secteur sans amas n’est pas dessiné, et c’est ` +
          `un fait et non un manque (règle 11).`,
        generatedBy: 'scripts/geo/fetch-sectors.mjs',
        demDate: DEM_DATE,
        bands: BANDS,
        drawMax: DRAW_MAX,
        tallMin: TALL_MIN,
        counts: {
          sectors: sectors.length,
          resolved: resolved.length,
          clusters: clusters.length,
          drawn: drawn.length,
        },
        sectors: sectors.map((s) => ({
          id: s.id,
          osmNode: s.osmNode,
          name: s.name,
          nameEn: s.nameEn,
          rank: s.rank,
          lon: round(s.lon, 6),
          lat: round(s.lat, 6),
          x: round(s.x, 1),
          z: round(s.z, 1),
          distance: Math.round(s.distance),
          band: s.band,
          radius: s.radius,
          measuredRadius: false,
          samples: s.samples,
          roof: s.roof,
          tall: s.tall,
          elevation: s.elevation,
          /** L'amas de tours que ce secteur nomme, quand il y en a un. */
          mass: drawn.find((c) => c.sector === s)?.id ?? null,
          unresolved: s.unresolved,
        })),
        masses: drawn.map((c) => ({
          id: c.id,
          name: c.name,
          nameEn: c.nameEn,
          rank: c.rank,
          namedFrom: c.sector?.id ?? null,
          nameDistance: c.nameDistance,
          x: c.x,
          z: c.z,
          radius: c.radius,
          distance: c.distance,
          band: c.band,
          height: c.height,
          tallest: c.tallest,
          tall: c.tall,
          elevation: c.elevation,
        })),
      },
      null,
      1,
    )}\n`,
    'utf8',
  );

  writeFileSync(
    new URL('km-bible.json', dir),
    `${JSON.stringify(
      {
        source: 'bible géographique (cadrage macroscopique)',
        note:
          'La bible fournit la STRUCTURE - trente-six points kilométriques, KM 0 = Shinagawa, ' +
          'cinq rayons de 1, 5, 10, 20 et 50 km mesurés à vol d’oiseau - et une consigne de ' +
          'couverture. Elle ne fournit aucune géométrie et n’en tient pas lieu (règle 11) : ' +
          'les secteurs listés ici sont ceux de data/geo/sectors.json, résolus depuis ' +
          'OpenStreetMap, et cette grille dit seulement lesquels tombent dans quelle bande ' +
          'depuis quel point kilométrique. C’est une liste de couverture, pas une carte.',
        generatedBy: 'scripts/geo/fetch-sectors.mjs',
        km0Station: KM0_STATION,
        loopKm: BIBLE_LOOP_KM,
        bands: BANDS,
        posts: grid,
      },
      null,
      1,
    )}\n`,
    'utf8',
  );

  writeSectors({ drawn, sectors, prov, datasetDate });
  process.stdout.write(
    '\ndata/geo/sectors.json, data/geo/km-bible.json et src/data/sectors.ts écrits.\n',
  );
}

// --- Utilitaires -------------------------------------------------------------

/** Grille uniforme : la boîte fait cinquante kilomètres de côté. */
class Grid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }

  add(x, z, item) {
    const key = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
    const list = this.map.get(key);
    if (list) list.push(item);
    else this.map.set(key, [item]);
  }

  within(x, z, radius) {
    const out = [];
    const r = Math.ceil(radius / this.cell);
    const i0 = Math.floor(x / this.cell);
    const j0 = Math.floor(z / this.cell);
    for (let i = i0 - r; i <= i0 + r; i++) {
      for (let j = j0 - r; j <= j0 + r; j++) {
        for (const b of this.map.get(`${i},${j}`) ?? []) {
          if (Math.hypot(b.x - x, b.z - z) <= radius) out.push(b);
        }
      }
    }
    return out;
  }
}

/**
 * Débite un amas trop étalé en tuiles, et rend la liste de ses morceaux.
 *
 * Un amas dont la dispersion tient sous `SPLIT_SPREAD` sort tel quel. Au-delà,
 * il est rangé sur une grille de `TILE` mètres et chaque tuile assez peuplée
 * devient une masse - les tuiles trop maigres retournent à leur voisine la plus
 * proche, pour ne perdre aucune tour.
 */
function split(members) {
  const cx = members.reduce((a, b) => a + b.x, 0) / members.length;
  const cz = members.reduce((a, b) => a + b.z, 0) / members.length;
  const spread = Math.sqrt(
    members.reduce((a, b) => a + (b.x - cx) ** 2 + (b.z - cz) ** 2, 0) / members.length,
  );
  if (spread <= SPLIT_SPREAD) return [members];

  const tiles = new Map();
  for (const b of members) {
    const key = `${Math.floor(b.x / TILE)},${Math.floor(b.z / TILE)}`;
    const at = tiles.get(key);
    if (at) at.push(b);
    else tiles.set(key, [b]);
  }
  const kept = [...tiles.values()].filter((t) => t.length >= TALL_MIN_COUNT);
  if (!kept.length) return [members];
  for (const thin of [...tiles.values()].filter((t) => t.length < TALL_MIN_COUNT)) {
    for (const b of thin) {
      let best = kept[0];
      let bd = Infinity;
      for (const t of kept) {
        const d = Math.hypot(t[0].x - b.x, t[0].z - b.z);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      best.push(b);
    }
  }
  return kept;
}

/** Position, emprise et faîte d'un groupe de tours. */
function shape(members, poly) {
  const cx = members.reduce((a, b) => a + b.x, 0) / members.length;
  const cz = members.reduce((a, b) => a + b.z, 0) / members.length;
  const spread = Math.sqrt(
    members.reduce((a, b) => a + (b.x - cx) ** 2 + (b.z - cz) ** 2, 0) / members.length,
  );
  const hs = members.map((b) => b.h).sort(num);
  const distance = Math.round(distanceToLoop(cx, cz, poly));
  return {
    x: round(cx, 1),
    z: round(cz, 1),
    // Une masse a au moins deux cents mètres de large : trois tours au même
    // carrefour ne sont pas un point, elles ont leur emprise et leurs pieds.
    radius: Math.round(Math.max(200, spread)),
    height: round(quantile(hs, SKYLINE_Q), 1),
    tallest: round(hs[hs.length - 1], 1),
    tall: members.length,
    distance,
    band: BANDS.findIndex((b) => distance <= b),
  };
}

function boxOf(coords, margin) {
  const b = coords.reduce(
    (acc, [lon, lat]) => ({
      minLon: Math.min(acc.minLon, lon),
      maxLon: Math.max(acc.maxLon, lon),
      minLat: Math.min(acc.minLat, lat),
      maxLat: Math.max(acc.maxLat, lat),
    }),
    { minLon: 180, maxLon: -180, minLat: 90, maxLat: -90 },
  );
  const dLat = margin / 111320;
  const dLon = margin / (111320 * Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180));
  return {
    minLon: b.minLon - dLon,
    maxLon: b.maxLon + dLon,
    minLat: b.minLat - dLat,
    maxLat: b.maxLat + dLat,
  };
}

const bbox = (b) =>
  `${b.minLat.toFixed(5)},${b.minLon.toFixed(5)},${b.maxLat.toFixed(5)},${b.maxLon.toFixed(5)}`;

const num = (a, b) => a - b;

/** Le percentile `q` d'une suite DÉJÀ TRIÉE. */
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/**
 * La hauteur déclarée d'un bâtiment, en mètres.
 *
 * OSM accepte « 42 », « 42 m » et « 42.5 ». On refuse ce qu'on ne sait pas lire
 * plutôt que de le convertir au jugé, et on refuse aussi l'invraisemblable : au
 * delà de six cent quarante mètres il n'y a rien à Tokyo, pas même le Skytree.
 */
function parseHeight(raw) {
  if (!raw) return null;
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(m|meters?)?\s*$/i.exec(String(raw));
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 3 && h <= 640 ? h : null;
}

function distanceToLoop(px, pz, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz;
    let t = l2 === 0 ? 0 : ((px - a.x) * vx + (pz - a.z) * vz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(px - (a.x + t * vx), pz - (a.z + t * vz)));
  }
  return best;
}

// --- Le fichier TypeScript ---------------------------------------------------

function writeSectors({ drawn, sectors, prov, datasetDate }) {
  const byBand = (b) => drawn.filter((c) => c.band === b).length;
  const tallest = [...drawn].sort((a, b) => b.tallest - a.tallest).slice(0, 8);

  const src = `// Les masses urbaines de Tokyo, entre le ruban et l'horizon.
//
// GÉNÉRÉ par \`node scripts/geo/fetch-sectors.mjs\` - ne pas éditer à la main.
//
// ${prov.attribution} · ${prov.source}
// Licence ${prov.license} · jeu daté du ${datasetDate} · ${prov.layer}
// Altitudes : 出典：国土地理院 (${DEM_DATE})
//
// Ce qu'il y a ici : ${drawn.length} amas de tours entre ${DRAW_MIN} m et ${DRAW_MAX / 1000} km de la voie
// (${byBand(0)} sous le kilomètre, ${byBand(1)} entre 1 et 5 km, ${byBand(2)} entre 5 et 10, ${byBand(3)} entre 10 et 20).
// Chacun porte le nom du secteur d'OpenStreetMap dans lequel il tombe, mais sa
// GÉOMÉTRIE ne vient pas de ce nom : elle vient des bâtiments eux-mêmes.
//
//   position   barycentre des bâtiments de plus de ${TALL_MIN} m étiquetés \`height\`
//   largeur    leur dispersion quadratique moyenne, au moins 200 m
//   faîte      leur percentile ${SKYLINE_Q}
//   sol        MNT du 国土地理院 au barycentre
//
// Les plus hautes :
${tallest
  .map(
    (c) =>
      `//   ${(c.name ?? '(sans nom)').padEnd(10)} ${String(Math.round(c.distance / 100) / 10).padStart(5)} km  ` +
      `faîte ${String(c.height).padStart(6)} m  plus haut ${String(c.tallest).padStart(6)} m`,
  )
  .join('\n')}
//
// CE QUI N'EST PAS ICI, ET POURQUOI. Deux raisons, et il faut les distinguer.
//
// La première est un FAIT : sur ${sectors.length} secteurs nommés à moins de vingt
// kilomètres, la plupart sont du tissu bas. Ils disparaissent derrière le
// premier immeuble venu et ne se voient donc pas d'un train. Leur marquage est
// dans data/geo/sectors.json, résolus mais sans amas.
//
// La seconde est un MANQUE dans la source, et il ne se comble pas en inventant.
// Sunshine 60 à Ikebukuro et le Scramble Square à Shibuya ne portent pas
// d'étiquette \`height\` dans OpenStreetMap : leurs amas n'existent pas ici, et
// les secteurs correspondants sont marqués \`unresolved\` plutôt que dotés d'une
// hauteur plausible. C'est la règle 11 de la bible, et elle coûte ce qu'elle
// coûte - le jour où la source les portera, l'import les posera tout seul.

/** Un amas de tours, vu de la boucle. */
export interface Sector {
  /**
   * Identifiant stable, tiré du LIEU et non du rang dans la liste : deux
   * imports successifs rendent le même, et deux versions sont comparables.
   */
  id: string;
  /**
   * Nom japonais du secteur qui porte l'amas, et sa transcription quand elle
   * existe. \`null\` quand aucun secteur nommé ne tombe dessus : l'amas est
   * relevé et se voit, il n'a simplement pas de nom dans OpenStreetMap.
   */
  name: string | null;
  nameEn: string | null;
  /** \`city\`, \`borough\`, \`town\`, \`suburb\`, \`quarter\` ou null. */
  rank: string | null;
  /** Est, en mètres depuis le point d'arrêt de Tokyo. Barycentre des tours. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le point d'arrêt de Tokyo. */
  z: number;
  /** Distance de l'amas à la voie la plus proche (m). */
  distance: number;
  /** Bande de la bible : 0 = moins d'un km, 1 = 1-5, 2 = 5-10, 3 = 10-20. */
  band: 0 | 1 | 2 | 3;
  /** Demi-largeur de l'amas (m) : la dispersion de ses tours. */
  radius: number;
  /** Ligne de faîte (m au-dessus du sol). */
  height: number;
  /** La plus haute tour relevée de l'amas (m). */
  tallest: number;
  /** Combien de tours de plus de ${TALL_MIN} m ont servi à la mesurer. */
  tall: number;
  /** Altitude du sol au MNT (m), ou null hors couverture. */
  elevation: number | null;
}

/** Les amas, du plus proche au plus lointain. */
export const SECTORS: readonly Sector[] = [
${drawn
  .map(
    (c) =>
      `  { id: '${c.id}', name: ${js(c.name)}, nameEn: ${js(c.nameEn)}, rank: ${js(c.rank)}, ` +
      `x: ${c.x}, z: ${c.z}, distance: ${c.distance}, band: ${c.band}, ` +
      `radius: ${c.radius}, height: ${c.height}, tallest: ${c.tallest}, ` +
      `tall: ${c.tall}, elevation: ${c.elevation} },`,
  )
  .join('\n')}
];

/** Les cinq rayons de la bible (m), tels que le document les pose. */
export const SECTOR_BANDS = [1000, 5000, 10000, 20000, 50000] as const;

/** Au-delà, aucun amas n'est dessiné : c'est le domaine du relief régional. */
export const SECTOR_DRAW_MAX = ${DRAW_MAX};

/** Hauteur au-dessous de laquelle un bâtiment ne compte pas dans un amas (m). */
export const SECTOR_TALL_MIN = ${TALL_MIN};
`;
  writeFileSync(new URL('../../src/data/sectors.ts', import.meta.url), src, 'utf8');
}

const js = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "\\'")}'`);
const round = (v, d) => Number(v.toFixed(d));

main().catch((err) => {
  process.stderr.write(`\n${err.stack ?? err}\n`);
  process.exit(1);
});
