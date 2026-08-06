// La boucle Yamanote et les repères de Tokyo, projetés en mètres.
//
//   node scripts/geo/fetch-loop.mjs   # va chercher le tracé chez OSM
//   node scripts/geo-loop.mjs         # en fait src/data/tokyoGeo.ts
//
// Émet src/data/tokyoGeo.ts. À relancer après tout réimport du tracé ou toute
// correction de la table des repères.
//
// POURQUOI. Jusqu'ici, rien dans le jeu ne savait où était le nord. Les repères
// de src/three/Landmarks.tsx sont des banques par gare : la tour de Tokyo
// apparaît « pendant qu'on approche de Hamamatsuchō », du côté de la porte, et
// c'est tout. Rien ne dit que le Skytree est au nord-est quand on est à Ueno et
// au nord-ouest quand on est à Kinshichō - ni, surtout, qu'il est TOUJOURS AU
// MÊME ENDROIT, ce qui est la seule chose qu'un repère ait à faire.
//
// CE QUI A CHANGÉ À LA QUATRIÈME PASSE. La géométrie de la boucle n'est plus
// saisie à la main. Elle était faite des trente milieux de quai publiés et de
// six « points de forme » posés à l'œil dans les virages qu'on voyait couper :
// 33,0 km contre 34,5 km de kilométrage JR, et l'écart se concentrait dans les
// courbes - exactement là où le cap compte, puisque c'est le cap qui place tout
// l'horizon lointain. La règle 1 de la bible géographique demande « une
// polyligne géoréférencée réelle » : c'est maintenant l'axe relevé
// d'OpenStreetMap, importé par scripts/geo/fetch-loop.mjs, qui mesure 34,46 km
// - deux dixièmes de pour cent du barème JR.
//
// Les gares, elles, ne sont plus des milieux de quai projetés mais les POINTS
// D'ARRÊT d'OSM, qui sont des nœuds de la voie : la position du train à quai est
// exacte, et non plus approchée. Le milieu de quai publié n'a servi qu'à choisir
// lequel des deux points d'arrêt d'une gare - un par voie - appartient à la voie
// retenue ; l'écart entre les deux sources est conservé dans le GeoJSON.
//
// La géodésie vient du pipeline PLATEAU (scripts/plateau/lib/geo.mjs, projection
// EPSG:6677 = zone IX, méridien central 139°30').

import { readFileSync, writeFileSync } from 'node:fs';
import { makeProjector, pickJapanZone } from './plateau/lib/geo.mjs';
import { PLATFORMS } from './geo/lib/platforms.mjs';

/**
 * Les repères qu'on voit de la boucle, avec leur hauteur de STRUCTURE (m).
 *
 * `shape` choisit la silhouette (voir src/three/city/FarSkyline.tsx) :
 *   · tower    - une tour unique, fuselée
 *   · twin     - deux tours sur un socle (le 都庁, Shinjuku Park Tower)
 *   · needle   - un fût très élancé à antenne (Skytree, tour de Tokyo)
 *   · mountain - un cône tronqué (le Fuji)
 *   · bridge   - deux pylônes et un tablier (le Rainbow Bridge)
 */
const LANDMARKS = [
  ['skytree', '東京スカイツリー Skytree', 35.7101, 139.8107, 634, 'needle'],
  ['tokyo-tower', '東京タワー Tour de Tokyo', 35.65858, 139.74543, 333, 'needle'],
  ['azabudai', '麻布台ヒルズ森JPタワー Mori JP Tower', 35.6603, 139.7403, 325, 'tower'],
  ['toranomon', '虎ノ門ヒルズ Toranomon Hills', 35.6669, 139.7495, 256, 'tower'],
  ['midtown', '東京ミッドタウン Midtown Tower', 35.6659, 139.7311, 248, 'tower'],
  ['mori-tower', '六本木ヒルズ森タワー Mori Tower', 35.6605, 139.7292, 238, 'tower'],
  ['tocho', '東京都庁第一本庁舎 Bureau métropolitain', 35.6896, 139.6917, 243, 'twin'],
  ['park-tower', '新宿パークタワー Shinjuku Park Tower', 35.6858, 139.6913, 235, 'twin'],
  ['sumitomo', '新宿住友ビル Sumitomo', 35.6896, 139.6934, 210, 'tower'],
  ['cocoon', 'モード学園コクーンタワー Cocoon', 35.6903, 139.697, 204, 'tower'],
  ['docomo-yoyogi', 'ドコモ代々木ビル NTT Docomo Yoyogi', 35.6849, 139.6994, 272, 'needle'],
  ['sunshine60', 'サンシャイン60 Sunshine 60', 35.729, 139.719, 240, 'tower'],
  ['scramble', '渋谷スクランブルスクエア Scramble Square', 35.6577, 139.7024, 230, 'tower'],
  ['rainbow', 'レインボーブリッジ Rainbow Bridge', 35.6355, 139.7635, 127, 'bridge'],
  ['landmark-tower', '横浜ランドマークタワー Yokohama', 35.4549, 139.6317, 296, 'tower'],
  ['fuji', '富士山 Mont Fuji', 35.3606, 138.7274, 3776, 'mountain'],
];

const LOOP_FILE = new URL('../data/geo/yamanote-loop.geojson', import.meta.url);
let doc;
try {
  doc = JSON.parse(readFileSync(LOOP_FILE, 'utf8'));
} catch {
  process.stderr.write(
    'data/geo/yamanote-loop.geojson introuvable.\n' +
      'Lancez d’abord « node scripts/geo/fetch-loop.mjs » : le tracé vient d’OpenStreetMap.\n',
  );
  process.exit(1);
}
const feature = doc.features[0];
const props = feature.properties;

const epsg = pickJapanZone(PLATFORMS[0].lon, PLATFORMS[0].lat);
const projector = makeProjector(epsg);

// Origine du repère local : le point d'arrêt de Tokyo, gare JY01 - c'est-à-dire
// l'endroit exact où s'arrête le milieu de la rame. Tout est donc exprimé en
// mètres autour de lui, ce qui garde des nombres lisibles et une origine qui a
// un sens dans le jeu. C'était auparavant le milieu de quai publié, à une
// vingtaine de mètres de là.
const tokyoStop = doc.stations.find((s) => s.index === 0);
const origin = projector.forward(tokyoStop.stopLon, tokyoStop.stopLat);

/** (lon, lat) → repère de scène : +x est, −z nord, en mètres. */
function local(lon, lat) {
  const p = projector.forward(lon, lat);
  return { x: p.east - origin.east, z: -(p.north - origin.north) };
}

// --- La polyligne --------------------------------------------------------
//
// Le GeoJSON répète le premier point en fin de ligne pour fermer l'anneau ; la
// table du jeu, elle, est implicitement fermée et ne le répète pas.
const ring = feature.geometry.coordinates.slice(0, -1);
const stationAt = new Map();
for (const s of doc.stations) stationAt.set(`${s.index}`, s);

// Chaque sommet porte l'index de gare quand il en est une : le GeoJSON dit le
// rang du sommet, l'import l'ayant retenu au moment où il l'a posé.
const shapes = ring.map(([lon, lat]) => ({ station: -1, ...local(lon, lat) }));
for (const s of doc.stations) {
  const at = shapes[s.vertex];
  if (!at) throw new Error(`Gare ${s.name} : sommet ${s.vertex} hors de la polyligne.`);
  shapes[s.vertex].station = s.index;
}

// Faire commencer la table à Tokyo, et vérifier que les gares se suivent.
const start = shapes.findIndex((p) => p.station === 0);
const loop = shapes.slice(start).concat(shapes.slice(0, start));
let expect = 0;
for (const p of loop) {
  if (p.station < 0) continue;
  if (p.station !== expect) {
    throw new Error(`Gares dans le désordre : attendu ${expect}, trouvé ${p.station}.`);
  }
  expect++;
}
if (expect !== 30) throw new Error(`${expect} gares sur la polyligne, attendu 30.`);

const stations = PLATFORMS.map((st, index) => {
  const at = loop.find((p) => p.station === index);
  const g = projector.inverse(at.x + origin.east, -at.z + origin.north);
  const meta = stationAt.get(`${index}`);
  return {
    index,
    jy: st.jy,
    name: st.name,
    lon: Number(g.lon.toFixed(6)),
    lat: Number(g.lat.toFixed(6)),
    x: at.x,
    z: at.z,
    offset: meta?.stopFromPlatformMeters ?? 0,
  };
});

const landmarks = LANDMARKS.map(([id, name, lat, lon, height, shape]) => ({
  id,
  name,
  lon,
  lat,
  height,
  shape,
  band: 'horizon',
  family: null,
  station: null,
  ...local(lon, lat),
}));

// Les objets réels à moins de 2 km (scripts/geo/fetch-near.mjs) entrent dans le
// MÊME jeu que l'horizon : le relais proche / lointain ne lit qu'une table. Ce
// qui change, c'est la bande - 'near' contre 'horizon' - et la famille, qui dit
// quelle silhouette three/Landmarks leur doit. FarSkyline, lui, ne pose que
// l'horizon : un parc à trois cents mètres n'a rien à faire sur une sphère de
// quatre-vingt-seize mètres.
const NEAR_FILE = new URL('../data/geo/near-landmarks.geojson', import.meta.url);
const NEAR_HEIGHT = { museum: 18, worship: 14, park: 22, historic: 12 };
try {
  const nearDoc = JSON.parse(readFileSync(NEAR_FILE, 'utf8'));
  for (const f of nearDoc.features) {
    const p = f.properties;
    if (!p.picked) continue;
    landmarks.push({
      id: p.id,
      name: p.nameEn ? `${p.name} ${p.nameEn}` : p.name,
      lon: p.lon,
      lat: p.lat,
      height: NEAR_HEIGHT[p.family] ?? 12,
      shape: p.family,
      band: 'near',
      family: p.family,
      station: p.station,
      x: p.x,
      z: p.z,
    });
  }
} catch {
  process.stderr.write(
    'data/geo/near-landmarks.geojson introuvable : GEO_LANDMARKS ne portera que l’horizon.\n' +
      'Lancez « node scripts/geo/fetch-near.mjs » pour y ajouter les objets de moins de 2 km.\n',
  );
}

// --- Mesures --------------------------------------------------------------
const legIndex = [];
loop.forEach((p, i) => {
  if (p.station >= 0) legIndex[p.station] = i;
});
const legs = [];
for (let s = 0; s < 30; s++) {
  let d = 0;
  let i = legIndex[s];
  const end = legIndex[(s + 1) % 30];
  while (i !== end) {
    const j = (i + 1) % loop.length;
    d += Math.hypot(loop[j].x - loop[i].x, loop[j].z - loop[i].z);
    i = j;
  }
  legs.push({ from: stations[s].jy, to: stations[(s + 1) % 30].jy, meters: Math.round(d) });
}
const total = legs.reduce((s, l) => s + l.meters, 0);
const worstOffset = stations.reduce((a, b) => (a.offset > b.offset ? a : b));

const num = (v, d = 1) => Number(v.toFixed(d));

const out = `// La boucle Yamanote et les repères de Tokyo, en mètres.
//
// GÉNÉRÉ par \`node scripts/geo-loop.mjs\` - ne pas éditer à la main. La
// polyligne vient de data/geo/yamanote-loop.geojson, que
// scripts/geo/fetch-loop.mjs va chercher chez OpenStreetMap.
//
// Repère : +x vers l'EST, −z vers le NORD, en mètres, origine au milieu du quai
// de Tokyo (JY01). C'est la convention de scène du jeu (le train regarde −z),
// si bien qu'une position et un cap se lisent directement.
//
// Projection EPSG:${epsg} (zone ${projector.zone}, méridien central 139°30'), depuis
// JGD2011.
//
// PROVENANCE (règle 10 de la bible géographique) :
//   · source      ${props.source}
//   · relation    ${props.relation}, version ${props.relationVersion}
//   · licence     ${props.license}
//   · jeu daté du ${props.datasetDate}, vérifié le ${props.verifiedAt}
//   · famille     ${props.layer}
//
// LA POLYLIGNE EST L'AXE RELEVÉ DES VOIES, et non plus une suite de cordes
// entre gares. Elle mesure ${(total / 1000).toFixed(2)} km contre 34,5 km de
// kilométrage JR : deux dixièmes de pour cent, là où la table saisie à la main
// qu'elle remplace était quatre pour cent trop courte. src/data/segments.ts
// reste malgré tout la source de \`SEGMENT_KM\` - le barème JR est ce que le jeu
// AFFICHE et ce sur quoi il règle ses horaires - et tests/tokyoGeo.test.ts
// vérifie que les deux sources racontent la même ligne.
//
// Les gares sont les POINTS D'ARRÊT d'OSM, qui sont des nœuds de la voie : le
// train à quai est exactement dessus. Écart au milieu de quai publié :
// ${Math.round(worstOffset.offset)} m au pire (${worstOffset.name}).

export interface GeoStation {
  /** Index dans src/data/stations.ts (0 = Tokyo). */
  index: number;
  jy: string;
  name: string;
  lon: number;
  lat: number;
  /** Est, en mètres depuis Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis Tokyo (convention de scène). */
  z: number;
  /**
   * Écart entre ce point d'arrêt et le milieu de quai publié (m).
   *
   * Deux sources indépendantes pour le même lieu : leur écart est le contrôle
   * croisé le moins cher qui soit, et une centaine de mètres est normale dans
   * une gare qui compte seize voies. Au-delà, c'est une coordonnée fausse.
   */
  offset: number;
}

export interface GeoLandmark {
  id: string;
  name: string;
  lon: number;
  lat: number;
  x: number;
  z: number;
  /** Hauteur de structure (m). */
  height: number;
  /**
   * Famille de silhouette.
   *
   * L'horizon (FarSkyline) lit tower / twin / needle / mountain / bridge. Le
   * bord de voie (Landmarks) lit museum / worship / park / historic - les
   * objets réels de moins de deux kilomètres, posés dans la même table pour
   * que le relais proche / lointain n'ait qu'un jeu à lire.
   */
  shape: 'tower' | 'twin' | 'needle' | 'mountain' | 'bridge' | 'museum' | 'worship' | 'park' | 'historic';
  /** 'horizon' au-delà de 2 km ; 'near' pour le bord de voie. */
  band: 'horizon' | 'near';
  /** Renseigné pour la bande near : quelle silhouette Landmarks lui doit. */
  family: 'museum' | 'worship' | 'park' | 'historic' | null;
  /** Gare de rattachement (bande near), sinon null. */
  station: number | null;
}

/** Un sommet de la polyligne de la boucle. \`station\` vaut −1 hors des gares. */
export interface GeoShapePoint {
  station: number;
  x: number;
  z: number;
}

export const GEO_STATIONS: readonly GeoStation[] = [
${stations
  .map(
    (s) =>
      `  { index: ${s.index}, jy: '${s.jy}', name: '${s.name}', lon: ${s.lon}, lat: ${s.lat}, x: ${num(s.x)}, z: ${num(s.z)}, offset: ${num(s.offset)} },`,
  )
  .join('\n')}
];

export const GEO_LANDMARKS: readonly GeoLandmark[] = [
${landmarks
  .map((l) => {
    const name = String(l.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return (
      `  { id: '${l.id}', name: '${name}', lon: ${l.lon}, lat: ${l.lat}, ` +
      `x: ${num(l.x)}, z: ${num(l.z)}, height: ${l.height}, shape: '${l.shape}', ` +
      `band: '${l.band}', family: ${l.family ? `'${l.family}'` : 'null'}, ` +
      `station: ${l.station === null || l.station === undefined ? 'null' : l.station} },`
    );
  })
  .join('\n')}
];

/**
 * La boucle comme polyligne fermée : l'axe relevé des voies, simplifié à
 * ${props.simplifyMeters} m près, avec les trente points d'arrêt étiquetés.
 *
 * ${loop.length} sommets, soit un tous les ${Math.round(total / loop.length)} m en moyenne - et bien plus
 * serrés dans les courbes, où Douglas-Peucker garde tout ce qui tourne. C'est
 * ce qui permet au cap de tourner comme la voie tourne, au lieu de sauter d'une
 * corde à l'autre.
 */
export const GEO_LOOP: readonly GeoShapePoint[] = [
${loop.map((p) => `  { station: ${p.station}, x: ${num(p.x)}, z: ${num(p.z)} },`).join('\n')}
];

/** Longueur de la polyligne ci-dessus (m). */
export const GEO_LOOP_M = ${total};

/** Longueur de chaque inter-gare telle que la polyligne la donne (m). */
export const GEO_LEG_M: readonly number[] = [
${legs.map((l) => `  /* ${l.from}→${l.to} */ ${l.meters},`).join('\n')}
];
`;

writeFileSync(new URL('../src/data/tokyoGeo.ts', import.meta.url), out, 'utf8');

process.stdout.write(
  `src/data/tokyoGeo.ts écrit : ${stations.length} gares, ${landmarks.length} repères, ` +
    `${loop.length} sommets.\n`,
);
process.stdout.write(`Polyligne : ${(total / 1000).toFixed(2)} km (kilométrage JR : 34,50 km).\n`);
