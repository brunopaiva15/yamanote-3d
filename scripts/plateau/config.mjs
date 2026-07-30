// Configuration centrale du pipeline PLATEAU → GLB. Tout paramètre numérique
// du pipeline vit ici : les scripts n'ont pas le droit d'inventer un seuil.
//
// Les valeurs peuvent être surchargées par variable d'environnement
// (voir `env()` plus bas) ; toute surcharge entre dans le hash de cache, donc
// changer un corridor ou une taille de chunk invalide automatiquement les
// étapes concernées.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`${name} doit être un nombre (reçu « ${raw} »)`);
  return v;
}

function str(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

/**
 * Tronçons descriptibles par le pipeline.
 *
 * Changer de tronçon est un changement de CONFIGURATION, pas de code : tout ce
 * qui distingue un inter-gare d'un autre - où il commence, où il finit, à
 * quelle hauteur court la voie - tient dans cette table. Le reste du pipeline
 * n'en sait rien.
 *
 * ⚠️ Les ancrages sont les coordonnées publiées du milieu des quais Yamanote,
 * arrondies à ~10 m, et la géométrie entre les deux est une APPROXIMATION
 * (arc de cercle). `node scripts/plateau/fetch-route.mjs --overpass` remplace
 * le tout par la géométrie OpenStreetMap réelle.
 */
export const PROTOTYPE_SEGMENTS = {
  'shibuya-ebisu': {
    name: 'shibuya-ebisu',
    /** Index de tronçon dans src/data/segments.ts. */
    segment: 19,
    from: 'Shibuya',
    to: 'Ebisu',
    /** Index de la gare d'ARRIVÉE dans STATIONS : segmentAt(arrivalStation) = segment. */
    arrivalStation: 20,
    anchors: {
      from: { lon: 139.70165, lat: 35.65845, name: '渋谷 Shibuya (JY20)' },
      to: { lon: 139.71005, lat: 35.6467, name: '恵比寿 Ebisu (JY21)' },
    },
    /**
     * Flèche de l'arc par rapport à la corde (m), signée : positive = vers la
     * gauche du sens de marche. Simple bombement plausible, pas un relevé.
     */
    sagittaMeters: -55,
    /**
     * Hauteur du RAIL par rapport au niveau de la rue (m).
     * Positif = viaduc (on roule au-dessus des toits bas) ;
     * négatif = tranchée (la ville est au-dessus de nous).
     * Calé sur VIADUCT_RISE = 7,5 de src/systems/segmentEnv.ts, pour que la
     * ville PLATEAU et le sol procédural tombent au même niveau.
     */
    railAboveGround: 7.4,
    /**
     * Niveau de la RUE aux deux extrémités, en hauteur ellipsoïdale (m).
     * Shibuya est un fond de vallée, Ebisu est sur le plateau : la ligne
     * remonte d'une dizaine de mètres entre les deux. Ondulation du géoïde à
     * Tokyo ≈ 37 m, incluse.
     */
    groundElevation: { start: 59, end: 68 },
  },

  'sugamo-otsuka': {
    name: 'sugamo-otsuka',
    segment: 10,
    from: 'Sugamo',
    to: 'Otsuka',
    arrivalStation: 11,
    anchors: {
      from: { lon: 139.7393, lat: 35.73352, name: '巣鴨 Sugamo (JY11)' },
      to: { lon: 139.72855, lat: 35.73147, name: '大塚 Ōtsuka (JY12)' },
    },
    sagittaMeters: 60,
    // Tranchée à Sugamo, qui s'ouvre en arrivant à Ōtsuka - d'où le
    // `opensAtEnd` de SEGMENTS[10]. Le rail est donc SOUS la rue.
    railAboveGround: -6,
    groundElevation: { start: 67, end: 67 },
  },
};

const PROTOTYPE_ID = str('PLATEAU_PROTOTYPE', 'shibuya-ebisu');
const SELECTED = PROTOTYPE_SEGMENTS[PROTOTYPE_ID];
if (!SELECTED) {
  throw new Error(
    `Tronçon inconnu : « ${PROTOTYPE_ID} ». ` +
      `Connus : ${Object.keys(PROTOTYPE_SEGMENTS).join(', ')} (voir PROTOTYPE_SEGMENTS).`,
  );
}

export const PLATEAU_CONFIG = {
  prototype: {
    ...SELECTED,
    /** Demi-largeur du corridor de sélection, de part et d'autre de l'axe (m). */
    corridorMeters: num('PLATEAU_CORRIDOR_M', 300),
    /** Longueur d'un chunk le long de la voie (m). */
    chunkLengthMeters: num('PLATEAU_CHUNK_M', 400),
    /** Pas d'échantillonnage du tracé exporté dans route.json (m). */
    routeSampleMeters: num('PLATEAU_ROUTE_SAMPLE_M', 8),
    /** Densité de l'échantillon synthétique (bâtiments par km de corridor). */
    sampleDensityPerKm: num('PLATEAU_SAMPLE_DENSITY', 900),
  },

  /**
   * Bandes de distance à l'axe de la voie. `far` est aussi le seuil de
   * suppression : au-delà, le bâtiment n'est pas exporté du tout.
   */
  distances: {
    near: num('PLATEAU_NEAR_M', 80),
    medium: num('PLATEAU_MEDIUM_M', 160),
    far: num('PLATEAU_FAR_M', 300),
  },

  /**
   * Simplification géométrique par bande (ratio de triangles visé, 1 = aucune).
   * Voir docs/PLATEAU_PIPELINE.md § LOD : sur du LOD1 (boîtes prismatiques)
   * la simplification n'a quasiment rien à retirer ; les ratios ne mordent que
   * sur du LOD2 réellement détaillé.
   */
  lod: {
    nearRatio: num('PLATEAU_LOD_NEAR', 1),
    mediumRatio: num('PLATEAU_LOD_MEDIUM', 0.6),
    farRatio: num('PLATEAU_LOD_FAR', 0.35),
    /** Erreur maximale tolérée par meshoptimizer (fraction de la diagonale). */
    error: num('PLATEAU_LOD_ERROR', 0.02),
  },

  textures: {
    maxSize: num('PLATEAU_TEX_MAX', 2048),
    format: str('PLATEAU_TEX_FORMAT', 'webp'),
    quality: num('PLATEAU_TEX_QUALITY', 82),
  },

  /**
   * Système de coordonnées.
   *
   * PLATEAU publie ses CityGML en EPSG:6697 (JGD2011 + hauteur ellipsoïdale,
   * ordre lat/lon). On projette en JGD2011 / Japan Plane Rectangular CS IX
   * (EPSG:6677), la zone officielle de Tokyo, puis on recentre sur une origine
   * locale stable pour rester loin des grandes coordonnées.
   *
   * Convention three.js du projet : +X = est, +Y = hauteur, -Z = nord.
   */
  crs: {
    sourceEpsg: 6697,
    projectedEpsg: 6677,
    units: 'meters',
    east: '+X',
    up: '+Y',
    north: '-Z',
  },

  /**
   * Garde-fous de téléchargement. PLATEAU publie les 23 arrondissements de
   * Tokyo en archives de plusieurs gigaoctets : rien ne part sans confirmation
   * explicite au-delà de `maxAutoDownloadMB`.
   */
  download: {
    maxAutoDownloadMB: num('PLATEAU_MAX_AUTO_MB', 256),
    /** Plafond absolu, même avec --yes : au-delà il faut --max-mb. */
    hardLimitMB: num('PLATEAU_HARD_LIMIT_MB', 8192),
    timeoutMs: num('PLATEAU_HTTP_TIMEOUT_MS', 120_000),
  },

  /** Plafond de taille par chunk GLB produit (Ko) - dépassement = échec. */
  limits: {
    maxChunkKB: num('PLATEAU_MAX_CHUNK_KB', 4096),
  },

  paths: {
    root: ROOT,
    cache: resolve(ROOT, '.cache/plateau'),
    downloads: resolve(ROOT, '.cache/plateau/downloads'),
    extracted: resolve(ROOT, 'work/plateau/extracted'),
    converted: resolve(ROOT, 'work/plateau/converted'),
    processed: resolve(ROOT, 'work/plateau/processed'),
    optimized: resolve(ROOT, 'work/plateau/optimized'),
    geo: resolve(ROOT, 'data/geo'),
    sample: resolve(ROOT, 'data/plateau-sample'),
    out: resolve(ROOT, 'public/world/plateau'),
  },
};

/**
 * Portail officiel de diffusion de Project PLATEAU : le G空間情報センター.
 *
 * ⚠️ NE DÉDUISEZ PAS UNE URL DE JEU DE DONNÉES. Les noms courts (slugs) CKAN de
 * PLATEAU ne suivent pas une règle unique, et celle de Tokyo a changé :
 *
 *   · jusqu'à FY2020, un jeu par format et par millésime
 *     (plateau-tokyo23ku-citygml-2020, -obj-2020, -fbx-2020, -3dtiles-2020…) ;
 *   · **depuis le 1er avril 2022**, un jeu UNIQUE et sans année,
 *     `plateau-tokyo23ku`, mis à jour en place. Les anciens jeux portent tous
 *     l'avis « 最新のデータは次のURLから取得することができます » qui y renvoie.
 *   · ailleurs au Japon, une troisième forme existe encore
 *     (plateau-22203-numazu-shi-2021, code commune + romaji + année).
 *
 * Extrapoler « plateau-tokyo23ku-2022 » en « …-2023 » donne donc un 404 : la
 * convention à année avait déjà été abandonnée. C'est l'erreur que ce
 * commentaire existe pour empêcher.
 */
export const PLATEAU_PORTAL = {
  /** Portail du programme (rubrique オープンデータ / open data). */
  program: 'https://www.mlit.go.jp/plateau/',
  /** Catalogue G空間情報センター. */
  catalog: 'https://www.geospatial.jp/ckan/dataset',
  /**
   * Jeu Tokyo 23区 courant, sans millésime : c'est celui que les anciens jeux
   * désignent eux-mêmes comme « les données les plus récentes ».
   */
  tokyo23ku: 'https://www.geospatial.jp/ckan/dataset/plateau-tokyo23ku',
};

/**
 * Jeux de données PLATEAU.
 *
 * Aucun arrondissement n'est publié seul : PLATEAU diffuse les 23
 * arrondissements de Tokyo en un unique paquet. C'est celui-là qu'il faut,
 * quel que soit le tronçon visé - Shibuya-ku et Meguro-ku pour
 * Shibuya → Ebisu, Toshima-ku pour Sugamo → Ōtsuka.
 *
 * `url` reste VIDE par défaut, et c'est délibéré : la fiche porte plusieurs
 * ressources (CityGML, OBJ, FBX, 3D Tiles, MVT…) et plusieurs formats
 * d'archive ; c'est à l'utilisateur de copier le lien de LA ressource CityGML.
 * La taille réelle est établie par une requête HEAD avant tout téléchargement.
 */
export const DATASETS = {
  'tokyo23ku-citygml': {
    label: '3D都市モデル（Project PLATEAU）東京都23区 - ressource CityGML',
    page: PLATEAU_PORTAL.tokyo23ku,
    url: str('PLATEAU_DATASET_URL', ''),
    /** Inconnue tant que le serveur n'a pas répondu - surtout pas devinée. */
    approxSizeMB: null,
    license: 'À VÉRIFIER sur la fiche (PLATEAU diffuse généralement en CC BY 4.0)',
    attribution: '出典：国土交通省 Project PLATEAU（東京都23区 3D都市モデル）',
  },
};

/** Sous-ensemble du config qui, s'il change, doit invalider une étape donnée. */
export function stageInputs(stage) {
  const p = PLATEAU_CONFIG.prototype;
  const d = PLATEAU_CONFIG.distances;
  switch (stage) {
    case 'download':
      return { dataset: str('PLATEAU_DATASET', 'tokyo23ku-citygml'), url: DATASETS['tokyo23ku-citygml'].url };
    case 'convert':
      // Le tronçon fait partie des entrées : la sélection au corridor a lieu
      // pendant la conversion, changer de tronçon doit donc la rejouer.
      return { name: p.name, segment: p.segment, corridor: p.corridorMeters, crs: PLATEAU_CONFIG.crs };
    case 'process':
      return {
        name: p.name,
        segment: p.segment,
        corridor: p.corridorMeters,
        chunk: p.chunkLengthMeters,
        sample: p.routeSampleMeters,
        distances: d,
        crs: PLATEAU_CONFIG.crs,
      };
    case 'optimize':
      return { textures: PLATEAU_CONFIG.textures, lod: PLATEAU_CONFIG.lod };
    default:
      throw new Error(`Étape inconnue : ${stage}`);
  }
}
