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

export const PLATEAU_CONFIG = {
  prototype: {
    name: 'sugamo-otsuka',
    /** Index de tronçon dans src/data/segments.ts (Sugamo → Ōtsuka). */
    segment: 10,
    from: 'Sugamo',
    to: 'Otsuka',
    /** Demi-largeur du corridor de sélection, de part et d'autre de l'axe (m). */
    corridorMeters: num('PLATEAU_CORRIDOR_M', 300),
    /** Longueur d'un chunk le long de la voie (m). */
    chunkLengthMeters: num('PLATEAU_CHUNK_M', 400),
    /** Pas d'échantillonnage du tracé exporté dans route.json (m). */
    routeSampleMeters: num('PLATEAU_ROUTE_SAMPLE_M', 8),
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

  /** Plafond de taille par chunk GLB produit (Ko) — dépassement = échec. */
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
 * Jeux de données PLATEAU connus. Les URL pointent vers le G空間情報センター
 * (geospatial.jp), portail de diffusion officiel de Project PLATEAU.
 *
 * ⚠️ Les tailles sont indicatives et vérifiées à l'exécution par un HEAD :
 * le pipeline n'engage jamais un téléchargement sur la foi de cette table.
 */
export const DATASETS = {
  /**
   * Toshima-ku (豊島区) — l'arrondissement qui contient Sugamo et Ōtsuka — n'est
   * pas publié seul : PLATEAU diffuse les 23 arrondissements de Tokyo en un
   * seul jeu de données (13100_tokyo23-ku). C'est le paquet à récupérer.
   */
  'tokyo23ku-2023-citygml': {
    label: 'Tokyo 23区 3D都市モデル (CityGML, FY2023)',
    page: 'https://www.geospatial.jp/ckan/dataset/plateau-tokyo23ku-2023',
    // À renseigner par l'utilisateur (l'URL de ressource CKAN change à chaque
    // millésime) ; --url ou PLATEAU_DATASET_URL priment de toute façon.
    url: str('PLATEAU_DATASET_URL', ''),
    approxSizeMB: 24_000,
    license: 'CC BY 4.0 — 国土交通省 Project PLATEAU',
    attribution: '出典：国土交通省 Project PLATEAU（東京都23区 3D都市モデル）',
  },
};

/** Sous-ensemble du config qui, s'il change, doit invalider une étape donnée. */
export function stageInputs(stage) {
  const p = PLATEAU_CONFIG.prototype;
  const d = PLATEAU_CONFIG.distances;
  switch (stage) {
    case 'download':
      return { dataset: str('PLATEAU_DATASET', 'tokyo23ku-2023-citygml'), url: DATASETS['tokyo23ku-2023-citygml'].url };
    case 'convert':
      return { corridor: p.corridorMeters, crs: PLATEAU_CONFIG.crs };
    case 'process':
      return {
        name: p.name,
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
