// La boucle Yamanote et les repères de Tokyo, projetés en mètres.
//
//   node scripts/geo-loop.mjs
//
// Émet src/data/tokyoGeo.ts. À relancer après toute correction de coordonnées.
//
// POURQUOI. Jusqu'ici, rien dans le jeu ne savait où était le nord. Les repères
// de src/three/Landmarks.tsx sont des banques par gare : la tour de Tokyo
// apparaît « pendant qu'on approche de Hamamatsuchō », du côté de la porte, et
// c'est tout. Rien ne dit que le Skytree est au nord-est quand on est à Ueno et
// au nord-ouest quand on est à Kinshichō - ni, surtout, qu'il est TOUJOURS AU
// MÊME ENDROIT, ce qui est la seule chose qu'un repère ait à faire.
//
// La géodésie est déjà écrite et testée pour le prototype PLATEAU
// (scripts/plateau/lib/geo.mjs, projection EPSG:6677 = zone IX, méridien
// central 139°30'). On la réemploie telle quelle, et on étend à la boucle
// entière la convention d'ancrage de scripts/plateau/config.mjs : le milieu du
// quai Yamanote, en JGD2011, arrondi à la dizaine de mètres.
//
// CE QUE CES CHIFFRES SONT, ET NE SONT PAS. Ce sont des coordonnées publiées de
// milieux de quai et de sommets, à ~10 m près pour les gares et ~50 m pour les
// repères. Ce n'est pas un relevé : la CORDE entre deux gares est plus courte
// que le kilométrage JR, qui suit les courbes. La longueur de la boucle reste
// donc celle de src/data/segments.ts (34,5 km) ; ces données-ci ne servent qu'à
// la GÉOMÉTRIE - où est le nord, dans quelle direction on roule, sous quel
// relèvement se tient un repère. Le test tests/tokyoGeo.test.ts vérifie que les
// deux sources se tiennent l'une l'autre.

import { writeFileSync } from 'node:fs';
import { makeProjector, geodesicDistance, pickJapanZone } from './plateau/lib/geo.mjs';

/**
 * Les trente milieux de quai, dans l'ordre JY croissant (sens 内回り).
 * Shibuya, Ebisu, Sugamo et Ōtsuka reprennent au mètre près les ancrages du
 * prototype PLATEAU : les deux tables ne doivent pas dériver l'une de l'autre.
 */
const STATIONS = [
  ['JY01', 'Tokyo', 35.68123, 139.76679],
  ['JY02', 'Kanda', 35.69169, 139.77088],
  ['JY03', 'Akihabara', 35.6984, 139.77313],
  ['JY04', 'Okachimachi', 35.70745, 139.77475],
  ['JY05', 'Ueno', 35.7138, 139.7772],
  ['JY06', 'Uguisudani', 35.72125, 139.7784],
  ['JY07', 'Nippori', 35.728, 139.7707],
  ['JY08', 'Nishi-Nippori', 35.73215, 139.7667],
  ['JY09', 'Tabata', 35.738, 139.7608],
  ['JY10', 'Komagome', 35.7366, 139.7481],
  ['JY11', 'Sugamo', 35.73352, 139.7393],
  ['JY12', 'Otsuka', 35.73147, 139.72855],
  ['JY13', 'Ikebukuro', 35.7295, 139.7104],
  ['JY14', 'Mejiro', 35.7211, 139.7062],
  ['JY15', 'Takadanobaba', 35.7127, 139.7038],
  ['JY16', 'Shin-Okubo', 35.70135, 139.7],
  ['JY17', 'Shinjuku', 35.6899, 139.70055],
  ['JY18', 'Yoyogi', 35.6832, 139.702],
  ['JY19', 'Harajuku', 35.6702, 139.70275],
  ['JY20', 'Shibuya', 35.65845, 139.70165],
  ['JY21', 'Ebisu', 35.6467, 139.71005],
  ['JY22', 'Meguro', 35.63395, 139.7157],
  ['JY23', 'Gotanda', 35.6259, 139.7235],
  ['JY24', 'Osaki', 35.6197, 139.7286],
  ['JY25', 'Shinagawa', 35.62855, 139.7387],
  ['JY26', 'Takanawa Gateway', 35.6357, 139.7407],
  ['JY27', 'Tamachi', 35.64565, 139.7476],
  ['JY28', 'Hamamatsucho', 35.6553, 139.757],
  ['JY29', 'Shimbashi', 35.6661, 139.75855],
  ['JY30', 'Yurakucho', 35.6749, 139.7631],
];

/**
 * Points de forme intermédiaires, là où la voie ne va PAS droit d'une gare à la
 * suivante. Sans eux, la boucle interpolée coupe les virages, et le cap - donc
 * le relèvement de tous les repères - se trompe de vingt degrés au milieu des
 * courbes. Clé : l'index du tronçon (celui de src/data/segments.ts, tronçon i =
 * gare i → gare i+1).
 */
const SHAPE = {
  // Tabata → Komagome : la voie s'enfonce vers le nord-ouest en décrivant le
  // sommet de la boucle, légèrement bombé vers le nord.
  8: [
    [35.739, 139.756],
    [35.7378, 139.7513],
  ],
  // Ōsaki → Shinagawa : le seul tronçon en ÉQUERRE de toute la ligne. La voie
  // monte plein nord depuis Ōsaki, longe le faisceau de Shinagawa, puis bascule
  // plein est pour s'y accoler - deux kilomètres pour un kilomètre et demi à vol
  // d'oiseau, et un cap qui tourne de quatre-vingt-dix degrés en route.
  23: [
    [35.6255, 139.7291],
    [35.6278, 139.7303],
    [35.6285, 139.733],
  ],
  // Yoyogi → Harajuku : le long arc qui contourne le bois du sanctuaire Meiji,
  // bombé vers l'ouest.
  17: [[35.6768, 139.7009]],
};

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

const epsg = pickJapanZone(STATIONS[0][3], STATIONS[0][2]);
const projector = makeProjector(epsg);

// Origine du repère local : le milieu du quai de Tokyo, gare JY01. Tout est
// donc exprimé en mètres autour d'elle, ce qui garde des nombres lisibles et
// une origine qui a un sens dans le jeu.
const origin = projector.forward(STATIONS[0][3], STATIONS[0][2]);

/** (lon, lat) → repère de scène : +x est, −z nord, en mètres. */
function local(lon, lat) {
  const p = projector.forward(lon, lat);
  return { x: p.east - origin.east, z: -(p.north - origin.north) };
}

const stations = STATIONS.map(([jy, name, lat, lon], index) => ({
  index,
  jy,
  name,
  lon,
  lat,
  ...local(lon, lat),
}));

const landmarks = LANDMARKS.map(([id, name, lat, lon, height, shape]) => ({
  id,
  name,
  lon,
  lat,
  height,
  shape,
  ...local(lon, lat),
}));

/** Polyligne complète : gares et points de forme, dans l'ordre de la boucle. */
const shapes = [];
for (let i = 0; i < stations.length; i++) {
  shapes.push({ station: i, ...local(stations[i].lon, stations[i].lat) });
  for (const [lat, lon] of SHAPE[i] ?? []) shapes.push({ station: -1, ...local(lon, lat) });
}

// --- Ce que ça donne, comparé au kilométrage JR --------------------------
//
// La corde entre deux gares est plus courte que le kilométrage : la voie
// tourne. On mesure l'écart pour que le test puisse le verrouiller, et pour
// qu'une coordonnée fautive (deux chiffres échangés, une latitude prise pour
// une longitude) se voie ici plutôt qu'à l'écran.
const legs = [];
for (let i = 0; i < stations.length; i++) {
  const a = stations[i];
  const b = stations[(i + 1) % stations.length];
  let length = 0;
  const pts = [a, ...(SHAPE[i] ?? []).map(([lat, lon]) => ({ lon, lat })), b];
  for (let k = 0; k + 1 < pts.length; k++) {
    length += geodesicDistance(pts[k].lon, pts[k].lat, pts[k + 1].lon, pts[k + 1].lat);
  }
  legs.push({ from: a.jy, to: b.jy, meters: Math.round(length) });
}
const total = legs.reduce((s, l) => s + l.meters, 0);

const num = (v, d = 1) => Number(v.toFixed(d));

const out = `// La boucle Yamanote et les repères de Tokyo, en mètres.
//
// GÉNÉRÉ par \`node scripts/geo-loop.mjs\` - ne pas éditer à la main. Les
// coordonnées sources, leur provenance et ce qu'elles valent sont dans le
// script ; l'essentiel est rappelé ici.
//
// Repère : +x vers l'EST, −z vers le NORD, en mètres, origine au milieu du quai
// de Tokyo (JY01). C'est la convention de scène du jeu (le train regarde −z),
// si bien qu'une position et un cap se lisent directement.
//
// Projection EPSG:${epsg} (zone ${projector.zone}, méridien central 139°30'), depuis
// JGD2011. Les coordonnées de gare sont des milieux de quai publiés, à ~10 m ;
// celles des repères, des sommets, à ~50 m.
//
// ⚠️ Ces données ne portent PAS la longueur de la boucle. La corde entre deux
// gares est plus courte que le kilométrage JR - la voie tourne - et c'est
// src/data/segments.ts qui reste la source de \`SEGMENT_KM\`. Ce fichier-ci ne
// sert qu'à la géométrie : où est le nord, dans quelle direction on roule, sous
// quel relèvement se tient un repère. Somme des cordes de cette table :
// ${(total / 1000).toFixed(2)} km, contre 34,5 km de kilométrage - l'écart est le prix des
// virages, et tests/tokyoGeo.test.ts le borne.

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
  /** Famille de silhouette (voir three/city/FarSkyline). */
  shape: 'tower' | 'twin' | 'needle' | 'mountain' | 'bridge';
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
      `  { index: ${s.index}, jy: '${s.jy}', name: '${s.name}', lon: ${s.lon}, lat: ${s.lat}, x: ${num(s.x)}, z: ${num(s.z)} },`,
  )
  .join('\n')}
];

export const GEO_LANDMARKS: readonly GeoLandmark[] = [
${landmarks
  .map(
    (l) =>
      `  { id: '${l.id}', name: '${l.name}', lon: ${l.lon}, lat: ${l.lat}, x: ${num(l.x)}, z: ${num(l.z)}, height: ${l.height}, shape: '${l.shape}' },`,
  )
  .join('\n')}
];

/**
 * La boucle comme polyligne fermée : les trente gares, plus les points de forme
 * des tronçons qui ne vont pas droit. Sans ces derniers, une interpolation entre
 * gares coupe les virages et le cap se trompe de vingt degrés au milieu des
 * courbes - donc le relèvement de tous les repères avec lui.
 */
export const GEO_LOOP: readonly GeoShapePoint[] = [
${shapes.map((p) => `  { station: ${p.station}, x: ${num(p.x)}, z: ${num(p.z)} },`).join('\n')}
];

/** Longueur de la polyligne ci-dessus (m). Voir l'avertissement en tête. */
export const GEO_LOOP_M = ${total};

/** Longueur de chaque inter-gare telle que la polyligne la donne (m). */
export const GEO_LEG_M: readonly number[] = [
${legs.map((l) => `  /* ${l.from}→${l.to} */ ${l.meters},`).join('\n')}
];
`;

writeFileSync(new URL('../src/data/tokyoGeo.ts', import.meta.url), out, 'utf8');

console.log(`src/data/tokyoGeo.ts écrit : ${stations.length} gares, ${landmarks.length} repères.`);
console.log(`Polyligne : ${(total / 1000).toFixed(2)} km (kilométrage JR : 34,50 km).`);
