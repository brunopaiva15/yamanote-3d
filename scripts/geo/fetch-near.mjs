// Les repères RÉELS du bord de voie, depuis OpenStreetMap.
//
//   node scripts/geo/fetch-near.mjs [--force]
//
// Émet :
//   · data/geo/near-landmarks.geojson   le relevé complet, avec provenance
//   · src/data/nearLandmarks.ts         ce que le jeu en lit
//
// POURQUOI. src/data/districts.ts porte une liste de « repères » par gare, et
// tous n'en sont pas. Certains sont des faits vérifiables - le Musée national à
// Ueno, le bois de Meiji-jingū à Harajuku, le Kan'ei-ji au-dessus
// d'Uguisudani. D'autres étaient du décor : une tour treillis à Nippori, là où
// il n'y en a aucune ; une autre à Yoyogi, alors que l'objet réel est la tour
// NTT Docomo, déjà relevée à deux cent soixante-douze mètres dans
// GEO_LANDMARKS. La règle 12 de la bible dit qu'un repère est ce qu'on peut
// retrouver sur une carte ; la règle 11 interdit d'en inventer.
//
// Ce script résout donc les repères réels et EUX SEULS, en allant les chercher
// par CATÉGORIE plutôt que par nom : musées, lieux de culte, parcs et sites
// historiques à moins de deux kilomètres de la voie. Rien n'est saisi à la
// main, pas même une liste de noms - la sélection est mécanique, et c'est ce
// qui la rend vérifiable.
//
// LA NOTORIÉTÉ SE LIT DANS LA DONNÉE. Un lieu de culte de quartier et le
// Meiji-jingū portent la même étiquette OSM. Ce qui les sépare, c'est
// l'identifiant Wikidata : on le prend comme critère, faute de mieux et parce
// qu'il vaut mieux que notre jugement - il dit que quelqu'un, ailleurs, a jugé
// l'objet digne d'une fiche.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from '../plateau/lib/args.mjs';
import { makeProjector, pickJapanZone } from '../plateau/lib/geo.mjs';
import { overpass } from './lib/net.mjs';
import { provenance } from './lib/source.mjs';
import { PLATFORMS } from './lib/platforms.mjs';

/** Au-delà, ce n'est plus un repère de bord de voie mais un repère d'horizon. */
const REACH = 2000;

/** Marge de la boîte de requête au-delà de la boucle (m). */
const MARGIN = 2600;

/**
 * Les quatre familles qu'on sait dessiner, et la silhouette de chacune.
 *
 * Elles ne sont pas choisies pour faire joli : ce sont les seules pour
 * lesquelles three/Landmarks porte déjà une géométrie honnête - une façade
 * basse, un toit de temple, une masse d'arbres. Un objet réel dont on n'aurait
 * pas la forme resterait dans le GeoJSON sans arriver jusqu'au jeu.
 */
const FAMILIES = {
  museum: { kind: 'museumFacade', label: 'musée' },
  worship: { kind: 'templeRoof', label: 'lieu de culte' },
  park: { kind: 'forestMass', label: 'parc' },
  historic: { kind: 'museumFacade', label: 'site historique' },
};

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

  const poly = ring.map(([lon, lat]) => local(lon, lat));
  const stations = loopDoc.stations.map((st) => ({ ...st, ...local(st.stopLon, st.stopLat) }));

  const box = boxOf(ring, MARGIN);
  process.stdout.write('Les repères réels du bord de voie\n');
  const res = await overpass(
    `[out:json][timeout:600];(` +
      `nwr["tourism"~"^(museum|attraction)$"]["name"](${bbox(box)});` +
      `nwr["amenity"="place_of_worship"]["name"]["wikidata"](${bbox(box)});` +
      `nwr["leisure"="park"]["name"]["wikidata"](${bbox(box)});` +
      `nwr["historic"]["name"]["wikidata"](${bbox(box)});` +
      `);out center tags meta;`,
    { label: 'repères', force: args.force },
  );

  let datasetDate = '';
  const found = [];
  for (const e of res.elements) {
    if (e.timestamp && e.timestamp > datasetDate) datasetDate = e.timestamp;
    const tags = e.tags ?? {};
    const family = familyOf(tags);
    if (!family || !tags.name) continue;
    const c = e.center ?? (e.lat !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!c) continue;
    const p = local(c.lon, c.lat);
    const distance = distanceToLoop(p.x, p.z, poly);
    if (distance > REACH) continue;
    let station = null;
    for (const st of stations) {
      const d = Math.hypot(st.x - p.x, st.z - p.z);
      if (!station || d < station.d) station = { index: st.index, name: st.name, d };
    }
    found.push({
      id: `osm-${e.type}-${e.id}`,
      osmType: e.type,
      osmId: e.id,
      name: tags.name,
      nameEn: tags['name:en'] ?? null,
      family,
      kind: FAMILIES[family].kind,
      wikidata: tags.wikidata ?? null,
      lon: round(c.lon, 6),
      lat: round(c.lat, 6),
      x: round(p.x, 1),
      z: round(p.z, 1),
      distance: Math.round(distance),
      station: station.index,
      stationName: station.name,
      fromStation: Math.round(station.d),
    });
  }
  datasetDate = datasetDate.slice(0, 10) || new Date().toISOString().slice(0, 10);
  process.stdout.write(
    `  ${found.length} objets réels à moins de ${REACH} m de la voie · jeu daté du ${datasetDate}\n`,
  );

  // --- La sélection n'est plus ici -------------------------------------------
  //
  // Elle vit dans `scripts/geo/pick-near.mjs`, qui se rejoue hors ligne sur ce
  // GeoJSON. Ce script-ci RELÈVE ; l'autre CHOISIT. La séparation n'est pas de
  // la coquetterie : le relevé demande un service public, la sélection non, et
  // on doit pouvoir revenir sur un choix sans redemander la donnée.

  // --- Écriture --------------------------------------------------------------
  const prov = provenance({ source: 'osm', datasetDate, layer: 'DATA_STATIC' });
  const dir = new URL('../../data/geo/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    new URL('near-landmarks.geojson', dir),
    `${JSON.stringify(
      {
        type: 'FeatureCollection',
        name: 'yamanote-near-landmarks',
        properties: {
          ...prov,
          note:
            'Objets réels à moins de ' +
            REACH +
            ' m de l’axe relevé des voies, choisis par CATÉGORIE (musée, lieu de ' +
            'culte, parc, site historique) et non par nom. La notoriété est lue dans ' +
            'l’étiquette wikidata. Celui-ci les porte TOUS ; la sélection - qui pose ' +
            'les drapeaux picked et rank - est faite par scripts/geo/pick-near.mjs, ' +
            'qui se rejoue hors ligne.',
          generatedBy: 'scripts/geo/fetch-near.mjs',
          reach: REACH,
        },
        features: found.map((f) => ({
          type: 'Feature',
          properties: { ...f, picked: false },
          geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
        })),
      },
      null,
      1,
    )}\n`,
    'utf8',
  );

  process.stdout.write(
    `\n${found.length} objets relevés → data/geo/near-landmarks.geojson\n` +
      'Enchaînez « node scripts/geo/pick-near.mjs » pour la sélection, ' +
      'puis « node scripts/geo-loop.mjs ».\n',
  );
}

// --- Utilitaires -------------------------------------------------------------

function familyOf(tags) {
  if (tags.tourism === 'museum') return 'museum';
  if (tags.amenity === 'place_of_worship') return 'worship';
  if (tags.leisure === 'park') return 'park';
  if (tags.historic) return 'historic';
  // `tourism=attraction` est un fourre-tout : il ne rentre que s'il porte aussi
  // l'une des trois autres étiquettes, sinon on ne sait pas quoi en dessiner.
  return null;
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

const round = (v, d) => Number(v.toFixed(d));

main().catch((err) => {
  process.stderr.write(`\n${err.stack ?? err}\n`);
  process.exit(1);
});
