// Provenance géographique : ce qu'un enregistrement DOIT porter (règles 9 et 10).
//
// La bible sépare trois familles, et cette séparation dit ce qu'on a le droit
// de mettre en cache, ce qu'il faut redater, et ce qui se recalcule à chaque
// image :
//
//   · DATA_STATIC     - terrain, voies, rues, bâtiments, ponts, cours d'eau ;
//   · DATA_SEMISTATIC - arbres, enseignes, commerces, publicités, chantiers,
//                       et les objets qui apparaissent ou disparaissent à une
//                       date connue (Takanawa Gateway, Scramble Square…) ;
//   · DATA_DYNAMIC    - trains, voitures, piétons, météo, lumières, grues.
//
// Un test refuse tout enregistrement incomplet. La date de référence du jeu
// (runtime.tokyoDate, choisie dans le menu) décide quels objets semi-statiques
// sont visibles : choisir 2018 et voir Takanawa Gateway disparaître, c'est du
// 1:1 que le jeu peut s'offrir tout de suite.

/** Les trois familles de la règle 9. */
export type DataLayer = 'DATA_STATIC' | 'DATA_SEMISTATIC' | 'DATA_DYNAMIC';

/**
 * Un enregistrement géographique complet, tel que la règle 10 le demande.
 *
 * `measured: false` veut dire que la hauteur (ou une autre grandeur) est
 * estimée : on ne la présente jamais comme un relevé.
 */
export interface GeoRecord {
  id: string;
  layer: DataLayer;
  source: string;
  license: string;
  /** Date du JEU DE DONNÉES, jamais celle du build. */
  datasetDate: string;
  lon: number;
  lat: number;
  lod: 0 | 1 | 2 | 3;
  minDistance: number;
  maxDistance: number;
  verifiedAt: string;
  /** false = grandeur estimée, jamais présentée comme relevée. */
  measured: boolean;
  /**
   * Fenêtre de validité pour DATA_SEMISTATIC.
   * Dates civiles inclusives, format AAAA-MM-JJ. `null` = pas de borne.
   */
  validFrom?: string | null;
  validUntil?: string | null;
}

const LAYERS = new Set<DataLayer>(['DATA_STATIC', 'DATA_SEMISTATIC', 'DATA_DYNAMIC']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Refuse un enregistrement incomplet ou incohérent.
 *
 * Renvoie `null` s'il est bon, sinon la raison - pour que le test puisse
 * citer la phrase exacte, et pour qu'un import puisse s'arrêter avant d'écrire.
 */
export function geoRecordIssue(r: Partial<GeoRecord> | null | undefined): string | null {
  if (!r || typeof r !== 'object') return 'enregistrement absent';
  if (!r.id || typeof r.id !== 'string') return 'id manquant';
  if (!r.layer || !LAYERS.has(r.layer)) return `${r.id} : layer invalide`;
  if (!r.source || typeof r.source !== 'string') return `${r.id} : source manquante`;
  if (!r.license || typeof r.license !== 'string') return `${r.id} : licence manquante`;
  if (!r.datasetDate || !ISO.test(r.datasetDate)) return `${r.id} : datasetDate invalide`;
  if (!r.verifiedAt || !ISO.test(r.verifiedAt)) return `${r.id} : verifiedAt invalide`;
  if (typeof r.lon !== 'number' || !Number.isFinite(r.lon)) return `${r.id} : lon manquant`;
  if (typeof r.lat !== 'number' || !Number.isFinite(r.lat)) return `${r.id} : lat manquant`;
  if (r.lod !== 0 && r.lod !== 1 && r.lod !== 2 && r.lod !== 3) return `${r.id} : lod invalide`;
  if (typeof r.minDistance !== 'number' || r.minDistance < 0) return `${r.id} : minDistance`;
  if (typeof r.maxDistance !== 'number' || r.maxDistance < r.minDistance) {
    return `${r.id} : maxDistance`;
  }
  if (typeof r.measured !== 'boolean') return `${r.id} : measured manquant`;
  if (r.layer === 'DATA_SEMISTATIC') {
    if (r.validFrom != null && !ISO.test(r.validFrom)) return `${r.id} : validFrom invalide`;
    if (r.validUntil != null && !ISO.test(r.validUntil)) return `${r.id} : validUntil invalide`;
  }
  return null;
}

/** Une date civile {year, month, day} → AAAA-MM-JJ. */
export function civilIso(d: { year: number; month: number; day: number }): string {
  const m = String(d.month).padStart(2, '0');
  const day = String(d.day).padStart(2, '0');
  return `${d.year}-${m}-${day}`;
}

/**
 * L'objet est-il visible à la date de référence ?
 *
 * DATA_STATIC et DATA_DYNAMIC : toujours. DATA_SEMISTATIC : dans sa fenêtre.
 * Une borne absente est ouverte de ce côté-là.
 */
export function visibleAt(
  r: Pick<GeoRecord, 'layer' | 'validFrom' | 'validUntil'>,
  date: { year: number; month: number; day: number },
): boolean {
  if (r.layer !== 'DATA_SEMISTATIC') return true;
  const iso = civilIso(date);
  if (r.validFrom && iso < r.validFrom) return false;
  if (r.validUntil && iso > r.validUntil) return false;
  return true;
}

/**
 * Les faits datés que le jeu sait faire apparaître ou disparaître.
 *
 * Ce ne sont PAS des inventions : ce sont des ouvertures, démolitions et
 * reconstructions publiées, branchées sur le sélecteur de date du menu. Choisir
 * 2018 et voir Takanawa Gateway disparaître, c'est exactement ce que la bible
 * appelle du 1:1.
 */
export const DATED_FACTS: readonly GeoRecord[] = [
  {
    id: 'takanawa-gateway-station',
    layer: 'DATA_SEMISTATIC',
    source: 'JR East / OpenStreetMap',
    license: 'ODbL 1.0',
    datasetDate: '2020-03-14',
    lon: 139.740528,
    lat: 35.635442,
    lod: 1,
    minDistance: 0,
    maxDistance: 2000,
    verifiedAt: '2026-08-06',
    measured: true,
    validFrom: '2020-03-14',
    validUntil: null,
  },
  {
    id: 'takanawa-gateway-city',
    layer: 'DATA_SEMISTATIC',
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    datasetDate: '2025-01-01',
    lon: 139.7405,
    lat: 35.6355,
    lod: 1,
    minDistance: 0,
    maxDistance: 2000,
    verifiedAt: '2026-08-06',
    measured: false,
    validFrom: '2025-01-01',
    validUntil: null,
  },
  {
    id: 'scramble-square',
    layer: 'DATA_SEMISTATIC',
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    datasetDate: '2019-11-01',
    lon: 139.7024,
    lat: 35.6577,
    lod: 2,
    minDistance: 0,
    maxDistance: 50000,
    verifiedAt: '2026-08-06',
    measured: true,
    validFrom: '2019-11-01',
    validUntil: null,
  },
  {
    id: 'sakura-stage',
    layer: 'DATA_SEMISTATIC',
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    datasetDate: '2023-11-01',
    lon: 139.7018,
    lat: 35.6582,
    lod: 1,
    minDistance: 0,
    maxDistance: 2000,
    verifiedAt: '2026-08-06',
    measured: false,
    validFrom: '2023-11-01',
    validUntil: null,
  },
  {
    id: 'miyashita-park',
    layer: 'DATA_SEMISTATIC',
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    datasetDate: '2020-07-01',
    lon: 139.7019,
    lat: 35.6612,
    lod: 1,
    minDistance: 0,
    maxDistance: 2000,
    verifiedAt: '2026-08-06',
    measured: true,
    validFrom: '2020-07-01',
    validUntil: null,
  },
  {
    id: 'harajuku-wooden-station',
    layer: 'DATA_SEMISTATIC',
    source: 'JR East (démolie)',
    license: 'CC0 1.0',
    datasetDate: '2020-04-01',
    lon: 139.70247,
    lat: 35.670217,
    lod: 1,
    minDistance: 0,
    maxDistance: 500,
    verifiedAt: '2026-08-06',
    measured: true,
    // Visible tant que la gare de bois existait ; après, plus rien à montrer.
    validFrom: null,
    validUntil: '2020-04-01',
  },
];

/** Identifiant d'horizon → fait daté qui le gouverne (quand il y en a un). */
export const HORIZON_DATED: Readonly<Record<string, string>> = {
  scramble: 'scramble-square',
};

/** Identifiant near (OSM) → fait daté. */
export const NEAR_DATED: Readonly<Record<string, string>> = {
  // Miyashita Park, Shibuya.
  'osm-way-116806278': 'miyashita-park',
};

/**
 * Gare × kind de silhouette station → fait daté.
 *
 * La marquise blanche de Takanawa Gateway n'existait pas avant mars 2020.
 */
export const STATION_DATED: Readonly<Record<string, string>> = {
  '25:whiteLatticeRoof': 'takanawa-gateway-station',
  '25:glassTowerCluster': 'takanawa-gateway-city',
  // Gare de bois de Harajuku : visible jusqu'à sa démolition (avril 2020).
  '18:officeBlock': 'harajuku-wooden-station',
  // Shibuya Sakura Stage : ouvert fin 2023.
  '19:glassTowerCluster': 'sakura-stage',
};

const BY_ID = new Map(DATED_FACTS.map((f) => [f.id, f]));

export function datedFact(id: string): GeoRecord | undefined {
  return BY_ID.get(id);
}

/** Le fait est-il visible à la date civile donnée ? Inconnu = visible. */
export function factVisible(
  factId: string | undefined,
  date: { year: number; month: number; day: number },
): boolean {
  if (!factId) return true;
  const f = BY_ID.get(factId);
  if (!f) return true;
  return visibleAt(f, date);
}

/**
 * Couches DATA_STATIC importées dans cette passe - pour le registre et pour
 * public/world/LICENSE.md. Ce ne sont pas des points : lon/lat est le centre
 * approximatif de la boucle (Tokyo).
 */
export const STATIC_LAYERS: readonly GeoRecord[] = [
  {
    id: 'yamanote-loop',
    layer: 'DATA_STATIC',
    source: 'OpenStreetMap (relation 5376382)',
    license: 'ODbL 1.0',
    datasetDate: '2026-06-09',
    lon: 139.766562,
    lat: 35.681256,
    lod: 0,
    minDistance: 0,
    maxDistance: 50000,
    verifiedAt: '2026-08-06',
    measured: true,
  },
  {
    id: 'gsi-dem',
    layer: 'DATA_STATIC',
    source: '国土地理院 数値標高モデル',
    license: '国土地理院コンテンツ利用規約',
    datasetDate: '2024-01-01',
    lon: 139.766562,
    lat: 35.681256,
    lod: 1,
    minDistance: 0,
    maxDistance: 50000,
    verifiedAt: '2026-08-06',
    measured: true,
  },
  {
    id: 'osm-water',
    layer: 'DATA_STATIC',
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    datasetDate: '2026-08-05',
    lon: 139.766562,
    lat: 35.681256,
    lod: 1,
    minDistance: 0,
    maxDistance: 50000,
    verifiedAt: '2026-08-06',
    measured: true,
  },
  {
    id: 'osm-sectors',
    layer: 'DATA_STATIC',
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    datasetDate: '2026-08-06',
    lon: 139.766562,
    lat: 35.681256,
    lod: 2,
    minDistance: 1000,
    maxDistance: 20000,
    verifiedAt: '2026-08-06',
    measured: false,
  },
  {
    id: 'osm-near-landmarks',
    layer: 'DATA_STATIC',
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    datasetDate: '2026-08-05',
    lon: 139.766562,
    lat: 35.681256,
    lod: 1,
    minDistance: 0,
    maxDistance: 2000,
    verifiedAt: '2026-08-06',
    measured: true,
  },
  {
    id: 'plateau-buildings',
    layer: 'DATA_STATIC',
    source: 'Project PLATEAU (国土交通省)',
    license: 'CC BY 4.0',
    datasetDate: '2024-01-01',
    lon: 139.70165,
    lat: 35.65845,
    lod: 1,
    minDistance: 0,
    maxDistance: 1000,
    verifiedAt: '2026-08-06',
    measured: true,
  },
];

/** Tout ce que le registre de provenance doit pouvoir citer. */
export const GEO_REGISTRY: readonly GeoRecord[] = [...STATIC_LAYERS, ...DATED_FACTS];
