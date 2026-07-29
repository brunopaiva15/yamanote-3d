// Génère un ÉCHANTILLON CityGML SYNTHÉTIQUE au profil PLATEAU (bldg, LOD1,
// EPSG:6697) le long du corridor du tronçon sélectionné (voir config.mjs).
//
// ⚠️ CE N'EST PAS DE LA DONNÉE PLATEAU. Aucun bâtiment ici ne correspond à un
// bâtiment réel : ce sont des volumes générés par un tirage déterministe, dont
// la seule fonction est de rendre le pipeline exécutable de bout en bout sans
// accès au jeu de données réel (plusieurs Go pour les 23 arrondissements de Tokyo).
// Le fichier produit est en revanche un vrai CityGML 2.0 conforme au profil
// que PLATEAU publie, ce qui permet de valider la conversion, la sélection
// spatiale, le découpage, l'optimisation et l'affichage pour de bon.
//
// Pour travailler sur les vraies données :
//   npm run world:download:prototype -- --url <URL de la ressource CKAN>
//   npm run world:build:prototype
//
// Usage :
//   node scripts/plateau/make-sample.mjs [--buildings <n>] [--seed 20260729]
//
// Sans --buildings, le nombre est proportionnel à la longueur du tronçon
// (PLATEAU_CONFIG.prototype.sampleDensityPerKm), pour que la densité de la
// ville ne dépende pas du tronçon choisi.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATEAU_CONFIG } from './config.mjs';
import { buildRoute, readLineString, locateOnRoute } from './lib/route.mjs';
import { createReporter, humanBytes, runMain } from './lib/log.mjs';

/**
 * Emprise ferroviaire tenue libre de toute construction (m de part et d'autre
 * de l'axe) : ballast, caténaire, garde-corps de viaduc et gabarit de la rame,
 * qui fait 2,95 m de large. Aucun sommet de bâtiment ne descend en dessous.
 */
const TRACK_CLEARANCE = 9;

/** PRNG déterministe (mulberry32) : même graine ⇒ même échantillon. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Niveau de la rue (hauteur ellipsoïdale, m) au droit d'un point.
 *
 * Il n'est PAS choisi indépendamment : il se déduit de la cote de la voie au
 * même endroit, moins `railAboveGround` — le paramètre qui dit si le tronçon
 * est en viaduc (positif) ou en tranchée (négatif). C'est ce qui garantit que
 * l'échantillon et le tracé ne peuvent pas diverger quand on change de
 * tronçon. On y ajoute une ondulation douce, pour que le sol ne soit pas une
 * table parfaitement plane.
 */
function streetLevel(railUp, east, north) {
  return (
    railUp -
    PLATEAU_CONFIG.prototype.railAboveGround +
    1.2 * Math.sin(east / 190) +
    0.9 * Math.cos(north / 240)
  );
}

/** Hauteur tirée : dense et bas près de la voie, quelques immeubles plus hauts. */
function drawHeight(rand, distance) {
  const r = rand();
  if (r < 0.55) return 6 + rand() * 5; // maisons et petits immeubles
  if (r < 0.85) return 11 + rand() * 8; // immeubles de rapport
  if (r < 0.97) return 19 + rand() * 14; // barres et bureaux
  // Les tours restent rares et plutôt loin de la tranchée.
  return distance > 120 ? 34 + rand() * 26 : 22 + rand() * 10;
}

/** Empreinte au sol : rectangle, parfois en L (six sommets). */
function footprint(rand, cx, cy, angle, width, depth) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const put = (u, v) => [cx + u * c - v * s, cy + u * s + v * c];
  const hw = width / 2;
  const hd = depth / 2;
  if (rand() < 0.22) {
    // Plan en L : on retire un quart de l'empreinte.
    const bu = hw * (0.35 + rand() * 0.3);
    const bv = hd * (0.35 + rand() * 0.3);
    return [put(-hw, -hd), put(hw, -hd), put(hw, bv), put(bu, bv), put(bu, hd), put(-hw, hd)];
  }
  return [put(-hw, -hd), put(hw, -hd), put(hw, hd), put(-hw, hd)];
}

function ringToPosList(ring, projector) {
  // PLATEAU écrit ses posList en EPSG:6697, c'est-à-dire (latitude longitude
  // hauteur) — l'ordre des axes du CRS, pas l'ordre « x y » habituel.
  const parts = [];
  for (const [east, north, up] of ring) {
    const g = projector.inverse(east, north);
    parts.push(g.lat.toFixed(9), g.lon.toFixed(9), up.toFixed(3));
  }
  return parts.join(' ');
}

function solidXml(id, footprintRing, base, height, projector) {
  const top = footprintRing.map(([e, n]) => [e, n, base + height]);
  const bottom = footprintRing.map(([e, n]) => [e, n, base]);
  const faces = [];
  const close = (ring) => [...ring, ring[0]];

  // Face au sol : orientée vers le bas (sens horaire vu de dessus).
  faces.push(close([...bottom].reverse()));
  // Toit : orienté vers le haut.
  faces.push(close(top));
  // Murs.
  for (let i = 0; i < footprintRing.length; i++) {
    const j = (i + 1) % footprintRing.length;
    faces.push(close([bottom[i], bottom[j], top[j], top[i]]));
  }

  const members = faces
    .map(
      (ring) => `            <gml:surfaceMember>
              <gml:Polygon>
                <gml:exterior>
                  <gml:LinearRing>
                    <gml:posList>${ringToPosList(ring, projector)}</gml:posList>
                  </gml:LinearRing>
                </gml:exterior>
              </gml:Polygon>
            </gml:surfaceMember>`,
    )
    .join('\n');

  return `    <core:cityObjectMember>
      <bldg:Building gml:id="${id}">
        <bldg:measuredHeight uom="m">${height.toFixed(1)}</bldg:measuredHeight>
        <bldg:lod1Solid>
          <gml:Solid>
            <gml:exterior>
              <gml:CompositeSurface>
${members}
              </gml:CompositeSurface>
            </gml:exterior>
          </gml:Solid>
        </bldg:lod1Solid>
      </bldg:Building>
    </core:cityObjectMember>`;
}

export function generateSample({ route, count, seed }) {
  const rand = mulberry32(seed);
  const { projector } = route;
  const half = PLATEAU_CONFIG.prototype.corridorMeters;
  // Nombre de bâtiments proportionnel à la longueur du tronçon : la densité
  // de la ville reste la même qu'on prenne un inter-gare d'un kilomètre ou de
  // deux, et changer de tronçon ne change pas la nature de l'échantillon.
  if (!(count > 0)) {
    count = Math.round(
      (route.totalLength / 1000) * PLATEAU_CONFIG.prototype.sampleDensityPerKm,
    );
  }
  const buildings = [];
  let attempts = 0;
  const placed = [];

  while (buildings.length < count && attempts < count * 40) {
    attempts++;
    const s = rand() * route.totalLength;
    const side = rand() < 0.5 ? -1 : 1;
    // Densité décroissante avec la distance : la ville se desserre en
    // s'éloignant de l'emprise (jardins, cours d'école, voirie).
    const lateral = 14 + Math.pow(rand(), 0.75) * (half - 14);

    // Point du tracé à l'abscisse s, et sa normale.
    const i = Math.min(
      route.raw.length - 2,
      Math.max(0, route.rawCum.findIndex((c, k) => k > 0 && c >= s) - 1),
    );
    const a = route.raw[i];
    const b = route.raw[i + 1];
    const len = Math.hypot(b.east - a.east, b.north - a.north) || 1;
    const t = (s - route.rawCum[i]) / len;
    const px = a.east + (b.east - a.east) * t;
    const py = a.north + (b.north - a.north) * t;
    // Cote de la VOIE à cette abscisse : c'est d'elle que découle le sol.
    const railUp = a.up + (b.up - a.up) * t;
    const nx = -(b.north - a.north) / len;
    const ny = (b.east - a.east) / len;
    const cx = px + side * nx * lateral;
    const cy = py + side * ny * lateral;

    const width = 5 + rand() * (lateral > 120 ? 26 : 14);
    const depth = 5 + rand() * (lateral > 120 ? 22 : 12);
    // Les parcelles s'alignent grossièrement sur la voie, avec du désordre.
    const angle = Math.atan2(b.north - a.north, b.east - a.east) + (rand() - 0.5) * 1.1;

    // Pas de recouvrement grossier : test de distance sur les cercles inscrits.
    const radius = Math.hypot(width, depth) / 2;
    let clash = false;
    for (const p of placed) {
      if (Math.hypot(p.cx - cx, p.cy - cy) < (p.radius + radius) * 0.85) {
        clash = true;
        break;
      }
    }
    if (clash) continue;

    const ring = footprint(rand, cx, cy, angle, width, depth);

    // Emprise ferroviaire : c'est le CENTRE que `lateral` écarte de l'axe, pas
    // l'empreinte. Une barre de trente mètres centrée à quatorze pourrait donc
    // poser un angle en travers de la voie. On teste chaque sommet, et on
    // rejette le tirage plutôt que de rogner le bâtiment : un volume tronqué
    // ne ressemblerait à rien.
    let intrudes = false;
    let nearest = Infinity;
    for (const [vx, vy] of ring) {
      const d = locateOnRoute(route, vx, vy).distance;
      if (d < nearest) nearest = d;
      if (d < TRACK_CLEARANCE) {
        intrudes = true;
        break;
      }
    }
    if (intrudes) continue;

    placed.push({ cx, cy, radius });
    const base = streetLevel(railUp, cx, cy) - 0.2 - rand() * 0.4;
    const height = drawHeight(rand, lateral);
    buildings.push({ ring, base, height, distance: nearest, s: locateOnRoute(route, cx, cy).s });
  }

  const body = buildings
    .map((b, i) =>
      solidXml(
        `SYNTH_bldg_${String(i).padStart(5, '0')}`,
        b.ring,
        b.base,
        b.height,
        projector,
      ),
    )
    .join('\n');

  const lons = [];
  const lats = [];
  const alts = [];
  for (const b of buildings) {
    for (const [e, n] of b.ring) {
      const g = projector.inverse(e, n);
      lons.push(g.lon);
      lats.push(g.lat);
    }
    alts.push(b.base, b.base + b.height);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ÉCHANTILLON SYNTHÉTIQUE — CE FICHIER NE CONTIENT AUCUNE DONNÉE PLATEAU.

  Généré par scripts/plateau/make-sample.mjs (graine ${seed}) pour permettre
  d'exécuter le pipeline PLATEAU du dépôt yamanote-3d sans télécharger les
  plusieurs gigaoctets du jeu de données « 東京都23区 3D都市モデル ».

  Le FORMAT reproduit le profil CityGML 2.0 / bldg / LOD1 publié par Project
  PLATEAU (EPSG:6697, posList en latitude longitude hauteur ellipsoïdale).
  La GÉOMÉTRIE, elle, est inventée : aucun de ces ${buildings.length} volumes
  ne correspond à un bâtiment existant.
-->
<core:CityModel
    xmlns:core="http://www.opengis.net/citygml/2.0"
    xmlns:bldg="http://www.opengis.net/citygml/building/2.0"
    xmlns:gml="http://www.opengis.net/gml"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:xlink="http://www.w3.org/1999/xlink">
  <gml:description>Synthetic LOD1 sample along the Yamanote line between ${PLATEAU_CONFIG.prototype.from} and ${PLATEAU_CONFIG.prototype.to}. NOT Project PLATEAU data.</gml:description>
  <gml:name>${PLATEAU_CONFIG.prototype.name}-synthetic-sample</gml:name>
  <gml:boundedBy>
    <gml:Envelope srsName="http://www.opengis.net/def/crs/EPSG/0/6697" srsDimension="3">
      <gml:lowerCorner>${Math.min(...lats).toFixed(9)} ${Math.min(...lons).toFixed(9)} ${Math.min(...alts).toFixed(3)}</gml:lowerCorner>
      <gml:upperCorner>${Math.max(...lats).toFixed(9)} ${Math.max(...lons).toFixed(9)} ${Math.max(...alts).toFixed(3)}</gml:upperCorner>
    </gml:Envelope>
  </gml:boundedBy>
${body}
</core:CityModel>
`;
  return { xml, buildings };
}

await runMain(async () => {
  const args = process.argv.slice(2);
  const get = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 ? Number(args[i + 1]) : dflt;
  };
  const count = get('--buildings', 0); // 0 ⇒ dérivé de la longueur du tracé
  const seed = get('--seed', 20260729);
  const reporter = createReporter('make-sample');

  const geojson = join(PLATEAU_CONFIG.paths.geo, `${PLATEAU_CONFIG.prototype.name}.geojson`);
  const line = readLineString(geojson);
  const route = buildRoute(line.coordinates, {
    sampleMeters: PLATEAU_CONFIG.prototype.routeSampleMeters,
  });
  reporter.step(`Tracé : ${route.totalLength.toFixed(1)} m, EPSG:${route.epsg}`);

  const { xml, buildings } = generateSample({ route, count, seed });

  // Arborescence calquée sur celle des livraisons PLATEAU (<code>/udx/bldg/).
  const dir = join(PLATEAU_CONFIG.paths.sample, 'udx', 'bldg');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${PLATEAU_CONFIG.prototype.name}-synthetic_bldg_6697_2_op.gml`);
  writeFileSync(out, xml);

  reporter.info(
    `${buildings.length} bâtiments synthétiques → ${out} (${humanBytes(Buffer.byteLength(xml))})`,
  );
  reporter.warn('Échantillon SYNTHÉTIQUE : aucune donnée Project PLATEAU dans ce fichier.');
});
