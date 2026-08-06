// Les trente tronçons de la Yamanote, descriptibles par le pipeline PLATEAU.
//
// Avant, deux seulement (Shibuya→Ebisu, Sugamo→Ōtsuka). La quatrième passe
// ouvre la table à toute la boucle : changer de tronçon reste un changement
// de CONFIGURATION (`PLATEAU_PROTOTYPE=<slug>`), pas de code.
//
// Les ancrages viennent de src/data/tokyoGeo.ts (points d'arrêt OSM). La cote
// de rue est l'altitude orthométrique du MNT (data/terrainField) plus ~37 m
// de géoïde. `railAboveGround` suit le kind de src/data/segments.ts. Les deux
// tronçons historiques gardent leurs flèches et cotes réglées à la main.

/** Altitude orthométrique à chaque gare (m), lue dans data/terrainField. */
const ORTHO = [
  3.4, 4.4, 3.8, 4.6, 9.5, 9.3, 16.7, 10.5, 9.7, 21.6, 25.1, 20.4, 31.1, 29.1,
  18.9, 30.4, 38.1, 35.7, 29.8, 18.9, 21.3, 30.5, 8.4, 6.4, 4.7, 4.3, 3.7, 3.5,
  3.2, 3.0,
];

/** Ondulation du géoïde à Tokyo (m) : orthométrique + géoïde ≈ ellipsoïdale. */
const GEOID = 37;

/** Points d'arrêt (lon, lat, name romaji), alignés sur GEO_STATIONS. */
const STOPS = [
  [139.766562, 35.681256, 'Tokyo'],
  [139.770965, 35.691781, 'Kanda'],
  [139.773008, 35.698358, 'Akihabara'],
  [139.77461, 35.706955, 'Okachimachi'],
  [139.776084, 35.7136, 'Ueno'],
  [139.777904, 35.721695, 'Uguisudani'],
  [139.770404, 35.72797, 'Nippori'],
  [139.766641, 35.732189, 'Nishi-Nippori'],
  [139.76169, 35.73736, 'Tabata'],
  [139.747256, 35.736557, 'Komagome'],
  [139.739457, 35.733358, 'Sugamo'],
  [139.728585, 35.731635, 'Otsuka'],
  [139.710986, 35.730244, 'Ikebukuro'],
  [139.706516, 35.721178, 'Mejiro'],
  [139.703685, 35.712677, 'Takadanobaba'],
  [139.700296, 35.701298, 'Shin-Okubo'],
  [139.700331, 35.688969, 'Shinjuku'],
  [139.702035, 35.683944, 'Yoyogi'],
  [139.70247, 35.670217, 'Harajuku'],
  [139.701751, 35.658075, 'Shibuya'],
  [139.71019, 35.646435, 'Ebisu'],
  [139.715797, 35.634071, 'Meguro'],
  [139.723693, 35.62629, 'Gotanda'],
  [139.72879, 35.619535, 'Osaki'],
  [139.738352, 35.62865, 'Shinagawa'],
  [139.740528, 35.635442, 'Takanawa Gateway'],
  [139.747672, 35.645754, 'Tamachi'],
  [139.757036, 35.655114, 'Hamamatsucho'],
  [139.758087, 35.666164, 'Shimbashi'],
  [139.763032, 35.674973, 'Yurakucho'],
];

/**
 * Kind de chaque tronçon (src/data/segments.ts) → hauteur du rail / rue (m).
 * viaduct ≈ VIADUCT_RISE ; trench ≈ −WALL ; corridor/ground ≈ 0.
 */
const KIND_RAIL = [
  7.4, 7.4, 7.4, 7.4, 0, 0, 0, 0, 0, -6, -6, 0, -4, 0, 0, 0, 0, 0, 0, 7.4, -6, -6,
  7.4, 0, 0, 0, 0, 7.4, 7.4, 7.4,
];

/** Flèches historiques (m) : le reste reste à 0 — fetch-route --overpass remplace l'arc. */
const SAGITTA = {
  19: -55, // Shibuya→Ebisu
  10: 60, // Sugamo→Ōtsuka
};

function slug(from, to) {
  const clean = (s) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `${clean(from)}-${clean(to)}`;
}

/** Table complète : une entrée par inter-gare, clé = slug from-to. */
export function buildAllSegments() {
  const out = {};
  for (let seg = 0; seg < 30; seg++) {
    const from = STOPS[seg];
    const to = STOPS[(seg + 1) % 30];
    const name = slug(from[2], to[2]);
    out[name] = {
      name,
      segment: seg,
      from: from[2],
      to: to[2],
      arrivalStation: (seg + 1) % 30,
      anchors: {
        from: { lon: from[0], lat: from[1], name: `${from[2]} (JY${String(seg + 1).padStart(2, '0')})` },
        to: {
          lon: to[0],
          lat: to[1],
          name: `${to[2]} (JY${String(((seg + 1) % 30) + 1).padStart(2, '0')})`,
        },
      },
      sagittaMeters: SAGITTA[seg] ?? 0,
      railAboveGround: KIND_RAIL[seg],
      groundElevation: {
        start: Math.round((ORTHO[seg] + GEOID) * 10) / 10,
        end: Math.round((ORTHO[(seg + 1) % 30] + GEOID) * 10) / 10,
      },
    };
  }
  // Les deux réglages historiques priment sur le généré (cotes de rue affinées).
  out['shibuya-ebisu'] = {
    ...out['shibuya-ebisu'],
    anchors: {
      from: { lon: 139.70165, lat: 35.65845, name: '渋谷 Shibuya (JY20)' },
      to: { lon: 139.71005, lat: 35.6467, name: '恵比寿 Ebisu (JY21)' },
    },
    railAboveGround: 7.4,
    groundElevation: { start: 59, end: 68 },
    sagittaMeters: -55,
  };
  out['sugamo-otsuka'] = {
    ...out['sugamo-otsuka'],
    anchors: {
      from: { lon: 139.7393, lat: 35.73352, name: '巣鴨 Sugamo (JY11)' },
      to: { lon: 139.72855, lat: 35.73147, name: '大塚 Ōtsuka (JY12)' },
    },
    railAboveGround: -6,
    groundElevation: { start: 67, end: 67 },
    sagittaMeters: 60,
  };
  return out;
}
