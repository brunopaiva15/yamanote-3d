// Géodésie du pipeline : projection Transverse Mercator (série de Krüger) vers
// le système des coordonnées planes japonaises, plus quelques utilitaires
// métriques.
//
// POURQUOI PAS proj4 : la seule projection nécessaire ici est une Transverse
// Mercator sur GRS80, dont la série de Krüger tient en cinquante lignes et se
// teste exactement (aller-retour + comparaison à la distance géodésique). Le
// projet évite d'ajouter une dépendance quand les siennes suffisent.
//
// PLATEAU publie ses CityGML en EPSG:6697 = JGD2011 (géographique, ordre
// latitude/longitude) + hauteur. JGD2011 partage l'ellipsoïde GRS80 et, aux
// tolérances de ce prototype, l'origine de WGS 84 : on projette donc
// directement les coordonnées géographiques sans changement de datum.
//
// ⚠️ Les hauteurs PLATEAU sont ELLIPSOÏDALES (au-dessus de GRS80), pas
// orthométriques. L'écart de géoïde à Tokyo vaut ~36-37 m ; il est CONSTANT à
// l'échelle d'un kilomètre, donc invisible ici puisque tout est recentré sur
// l'altitude de la voie. Il faudrait le traiter (japan-geoid) pour mêler ces
// données à un MNT en altitude orthométrique.

/** Ellipsoïde GRS80 (JGD2011, et WGS 84 à 0,1 mm près sur le demi-petit axe). */
export const GRS80 = { a: 6378137.0, f: 1 / 298.257222101 };

/**
 * Systèmes de coordonnées planes japonaises (平面直角座標系).
 * Origines officielles : loi n°9 de 2002 du 国土地理院.
 * Zone IX (EPSG:6677) = Tokyo et sa région — celle qui nous concerne.
 */
export const JAPAN_PLANE_ZONES = {
  6677: { zone: 'IX', lat0: 36.0, lon0: 139 + 30 / 60, k0: 0.9999, falseE: 0, falseN: 0 },
  6676: { zone: 'VIII', lat0: 36.0, lon0: 138 + 30 / 60, k0: 0.9999, falseE: 0, falseN: 0 },
  6678: { zone: 'X', lat0: 40.0, lon0: 140 + 50 / 60, k0: 0.9999, falseE: 0, falseN: 0 },
};

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function krugerConstants(ellipsoid) {
  const n = ellipsoid.f / (2 - ellipsoid.f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const n5 = n4 * n;
  const A = (ellipsoid.a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
  // Série directe (géodésique → conforme).
  const alpha = [
    n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288,
    (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630,
    (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880,
    (49561 * n4) / 161280 - (179 * n5) / 168,
    (34729 * n5) / 80640,
  ];
  // Série inverse (conforme → géodésique).
  const beta = [
    n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360 - (81 * n5) / 512,
    n2 / 48 + n3 / 15 - (437 * n4) / 1440 + (46 * n5) / 105,
    (17 * n3) / 480 - (37 * n4) / 840 - (209 * n5) / 4480,
    (4397 * n4) / 161280 - (11 * n5) / 504,
    (4583 * n5) / 161280,
  ];
  // Latitude conforme → latitude géodésique.
  const delta = [
    2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45 + (26 * n5) / 45,
    (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45 + (2704 * n5) / 315,
    (56 * n3) / 15 - (136 * n4) / 35 - (1262 * n5) / 105,
    (4279 * n4) / 630 - (332 * n5) / 35,
    (4174 * n5) / 315,
  ];
  return { n, A, alpha, beta, delta };
}

/** ξ' (latitude conforme rectifiée) sur le méridien central, pour une latitude. */
function conformalXi(latRad, n) {
  const s = Math.sin(latRad);
  const twoSqrtN = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(s) - twoSqrtN * Math.atanh(twoSqrtN * s));
  // Cas particulier de la formule générale avec Δλ = 0 : ξ' = atan(t / cos 0).
  return Math.atan(t);
}

/**
 * Projecteur Transverse Mercator pour une zone donnée.
 * Renvoie `{ forward, inverse }` en (est, nord) exprimés en mètres.
 *
 * ⚠️ La convention *officielle* japonaise nomme X le NORD et Y l'EST. Ce
 * module expose délibérément `{ east, north }` : le pipeline ne manipule
 * jamais un couple ambigu.
 */
export function makeProjector(epsg, ellipsoid = GRS80) {
  const zone = JAPAN_PLANE_ZONES[epsg];
  if (!zone) {
    throw new Error(
      `Zone de projection inconnue pour EPSG:${epsg}. ` +
        `Zones connues : ${Object.keys(JAPAN_PLANE_ZONES).join(', ')}.`,
    );
  }
  const K = krugerConstants(ellipsoid);
  const lat0 = zone.lat0 * D2R;
  const lon0 = zone.lon0 * D2R;
  const kA = zone.k0 * K.A;

  // Ordonnée du parallèle d'origine, retranchée pour que (lat0, lon0) → (0, 0).
  const xi0 = conformalXi(lat0, K.n);
  let m0 = xi0;
  for (let j = 1; j <= 5; j++) m0 += K.alpha[j - 1] * Math.sin(2 * j * xi0);
  const northing0 = kA * m0;

  function forward(lon, lat) {
    const phi = lat * D2R;
    const dLambda = lon * D2R - lon0;
    const s = Math.sin(phi);
    const twoSqrtN = (2 * Math.sqrt(K.n)) / (1 + K.n);
    const t = Math.sinh(Math.atanh(s) - twoSqrtN * Math.atanh(twoSqrtN * s));
    const xiP = Math.atan2(t, Math.cos(dLambda));
    const etaP = Math.atanh(Math.sin(dLambda) / Math.sqrt(1 + t * t));
    let xi = xiP;
    let eta = etaP;
    for (let j = 1; j <= 5; j++) {
      xi += K.alpha[j - 1] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
      eta += K.alpha[j - 1] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
    }
    return { east: kA * eta + zone.falseE, north: kA * xi - northing0 + zone.falseN };
  }

  function inverse(east, north) {
    const xi = (north - zone.falseN + northing0) / kA;
    const eta = (east - zone.falseE) / kA;
    let xiP = xi;
    let etaP = eta;
    for (let j = 1; j <= 5; j++) {
      xiP -= K.beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      etaP -= K.beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
    let phi = chi;
    for (let j = 1; j <= 5; j++) phi += K.delta[j - 1] * Math.sin(2 * j * chi);
    const lambda = lon0 + Math.atan2(Math.sinh(etaP), Math.cos(xiP));
    return { lon: lambda * R2D, lat: phi * R2D };
  }

  return { epsg, zone: zone.zone, forward, inverse };
}

/**
 * Choisit la zone plane japonaise adaptée à un point. Le prototype ne couvre
 * que Tokyo, mais la fonction échoue explicitement plutôt que de deviner.
 */
export function pickJapanZone(lon, lat) {
  if (lat >= 34.5 && lat <= 37.5 && lon >= 137.5 && lon <= 141.5) return 6677;
  if (lat >= 34.0 && lat <= 38.0 && lon >= 136.5 && lon <= 138.5) return 6676;
  throw new Error(
    `Aucune zone de projection métrique connue pour (lon=${lon}, lat=${lat}). ` +
      'Étendez JAPAN_PLANE_ZONES dans scripts/plateau/lib/geo.mjs.',
  );
}

/**
 * Distance géodésique sur l'ellipsoïde (Vincenty inverse). Sert de référence
 * indépendante pour valider la projection dans les tests.
 */
export function geodesicDistance(lon1, lat1, lon2, lat2, ellipsoid = GRS80) {
  const a = ellipsoid.a;
  const f = ellipsoid.f;
  const b = a * (1 - f);
  const L = (lon2 - lon1) * D2R;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * D2R));
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * D2R));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cos2SigmaM = 0;
  let cosSqAlpha = 0;
  for (let i = 0; i < 200; i++) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const prev = lambda;
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - prev) < 1e-12) break;
  }
  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return b * A * (sigma - deltaSigma);
}

/** Distance d'un point à un segment, dans le plan projeté (mètres). */
export function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/**
 * Projection d'un point sur une polyligne : distance latérale et abscisse
 * curviligne du point le plus proche. Renvoie `{ distance, s, index, t }`.
 */
export function projectOnPolyline(px, py, points, cumulative) {
  let best = { distance: Infinity, s: 0, index: 0, t: 0 };
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i].east;
    const ay = points[i].north;
    const bx = points[i + 1].east;
    const by = points[i + 1].north;
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
    if (d < best.distance) {
      best = { distance: d, s: cumulative[i] + t * Math.sqrt(len2), index: i, t };
    }
  }
  return best;
}
