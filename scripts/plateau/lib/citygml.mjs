// Lecteur CityGML intégré — profil « bâtiment » de PLATEAU.
//
// CE QUE CE MODULE FAIT RÉELLEMENT
// --------------------------------
// Il lit un CityGML 2.0 (ou 1.0) conforme au profil bldg de PLATEAU et en
// extrait, par bâtiment :
//   · gml:id, bldg:measuredHeight, bldg:class / bldg:usage ;
//   · la géométrie de surface du meilleur LOD disponible, dans cet ordre :
//       bldg:lod1Solid → bldg:lod1MultiSurface
//       → surfaces de bldg:boundedBy (LOD2 : Wall/Roof/Ground/Closure)
//       → bldg:lod2MultiSurface ;
//   · les bldg:BuildingPart imbriqués, traités comme des géométries du parent.
// Les anneaux extérieurs ET intérieurs (gml:interior) sont conservés, ainsi
// que la dimension déclarée par srsDimension.
//
// CE QU'IL NE FAIT PAS — et il faut le savoir avant de s'en servir
// ----------------------------------------------------------------
//   · Aucune APPARENCE : app:Appearance, ParameterizedTexture, coordonnées UV
//     et images associées sont ignorées. Un LOD2 texturé sera donc rendu SANS
//     texture. Pour les textures il faut le vrai convertisseur (voir
//     convert.mjs, moteur `nusamai`).
//   · Aucune résolution de xlink:href entre fichiers. À l'intérieur d'un
//     fichier ce n'est pas nécessaire pour le profil PLATEAU (les polygones
//     LOD2 sont écrits dans bldg:boundedBy ; lod2Solid ne fait que les
//     référencer), mais un CityGML qui factoriserait ses surfaces ailleurs
//     perdrait de la géométrie — le lecteur le signale alors comme
//     « bâtiment sans géométrie exploitable ».
//   · Aucun attribut i-UR (uro:*) hors ceux listés ci-dessus.
//   · Aucun autre thème que bldg (tran, veg, frn, dem…).
//
// C'est un lecteur partiel ASSUMÉ, pas un convertisseur CityGML complet.

import { PipelineError } from './log.mjs';

const CITYGML_BUILDING_NS = /citygml\/building\/[12]\.0/;
const GML_NS = /^http:\/\/www\.opengis\.net\/gml/;

/** Espaces de noms → préfixes déclarés sur l'élément racine. */
export function readNamespacePrefixes(xml) {
  const rootStart = xml.indexOf('<', xml.indexOf('?>') + 1);
  const head = xml.slice(rootStart, rootStart + 8192);
  const prefixes = { bldg: null, gml: null, core: null };
  const re = /xmlns:([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(head)) !== null) {
    const [, prefix, ns] = m;
    if (CITYGML_BUILDING_NS.test(ns)) prefixes.bldg = prefix;
    else if (GML_NS.test(ns)) prefixes.gml = prefix;
    else if (/citygml\/[12]\.0$/.test(ns)) prefixes.core = prefix;
  }
  // Repli sur les préfixes conventionnels : un CityGML qui déclarerait ces
  // espaces de noms par défaut (sans préfixe) n'est pas géré, et on le dira.
  prefixes.bldg ??= 'bldg';
  prefixes.gml ??= 'gml';
  prefixes.core ??= 'core';
  return prefixes;
}

/**
 * Système de coordonnées déclaré. PLATEAU publie en EPSG:6697 (JGD2011 +
 * hauteur ellipsoïdale, ordre latitude/longitude).
 */
export function readSrs(xml) {
  const m = xml.match(/srsName\s*=\s*"([^"]+)"/);
  if (!m) {
    throw new PipelineError(
      "Aucun srsName dans le CityGML : la projection géographique n'a pas pu être déterminée.",
      'Un CityGML PLATEAU déclare srsName sur gml:Envelope (généralement EPSG:6697).',
    );
  }
  const raw = m[1];
  const code = raw.match(/(\d{4,5})\s*$/);
  if (!code) {
    throw new PipelineError(
      `srsName non reconnu : « ${raw} ».`,
      'Formes acceptées : "EPSG:6697", "http://www.opengis.net/def/crs/EPSG/0/6697", "urn:ogc:def:crs:EPSG::6697".',
    );
  }
  const epsg = Number(code[1]);
  // Ordre des axes : les CRS géographiques japonais et le WGS 84 3D déclarent
  // (latitude, longitude[, hauteur]) — pas (lon, lat).
  const LAT_LON = new Set([6697, 6668, 4326, 4979, 4612]);
  if (!LAT_LON.has(epsg)) {
    throw new PipelineError(
      `EPSG:${epsg} n'est pas un CRS géographique connu de ce lecteur.`,
      "Le profil PLATEAU utilise EPSG:6697. Pour un CityGML déjà projeté, utilisez le convertisseur externe (PLATEAU GIS Converter) plutôt que le lecteur intégré.",
    );
  }
  return { srsName: raw, epsg, axisOrder: 'lat,lon,height' };
}

/**
 * Itère les blocs `<prefix:Local …> … </prefix:Local>` à partir de `from`.
 * Gère l'imbrication du même élément et les balises auto-fermantes.
 * Renvoie des intervalles `[contentStart, contentEnd)` plus la balise ouvrante.
 */
export function* eachElement(xml, qname, from = 0, to = xml.length) {
  const open = `<${qname}`;
  const close = `</${qname}>`;
  let i = from;
  while (i < to) {
    const start = xml.indexOf(open, i);
    if (start < 0 || start >= to) return;
    const after = xml[start + open.length];
    // « <bldg:Building » ne doit pas capturer « <bldg:BuildingPart ».
    if (after !== undefined && !/[\s/>]/.test(after)) {
      i = start + open.length;
      continue;
    }
    const tagEnd = xml.indexOf('>', start);
    if (tagEnd < 0) return;
    const selfClosing = xml[tagEnd - 1] === '/';
    const tag = xml.slice(start, tagEnd + 1);
    if (selfClosing) {
      yield { tag, contentStart: tagEnd + 1, contentEnd: tagEnd + 1, end: tagEnd + 1 };
      i = tagEnd + 1;
      continue;
    }
    // Recherche de la fermeture correspondante, en comptant les imbrications.
    let depth = 1;
    let cursor = tagEnd + 1;
    let contentEnd = -1;
    while (depth > 0) {
      const nextOpen = xml.indexOf(open, cursor);
      const nextClose = xml.indexOf(close, cursor);
      if (nextClose < 0) return;
      const validOpen =
        nextOpen >= 0 && nextOpen < nextClose && /[\s/>]/.test(xml[nextOpen + open.length] ?? '>');
      if (validOpen) {
        depth++;
        cursor = nextOpen + open.length;
      } else {
        depth--;
        contentEnd = nextClose;
        cursor = nextClose + close.length;
      }
    }
    yield { tag, contentStart: tagEnd + 1, contentEnd, end: cursor };
    i = cursor;
  }
}

function firstElement(xml, qname, from, to) {
  for (const el of eachElement(xml, qname, from, to)) return el;
  return null;
}

function textOf(xml, qname, from, to) {
  const el = firstElement(xml, qname, from, to);
  if (!el) return null;
  return xml
    .slice(el.contentStart, el.contentEnd)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .trim();
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

/** Coordonnées d'un gml:LinearRing (posList ou suite de gml:pos). */
function readRing(xml, gml, from, to, defaultDim) {
  const posList = firstElement(xml, `${gml}:posList`, from, to);
  const values = [];
  let dim = defaultDim;
  if (posList) {
    const declared = attr(posList.tag, 'srsDimension');
    if (declared) dim = Number(declared);
    const text = xml.slice(posList.contentStart, posList.contentEnd);
    for (const token of text.split(/\s+/)) {
      if (token.length === 0) continue;
      const v = Number(token);
      if (!Number.isFinite(v)) return null;
      values.push(v);
    }
  } else {
    for (const pos of eachElement(xml, `${gml}:pos`, from, to)) {
      const declared = attr(pos.tag, 'srsDimension');
      if (declared) dim = Number(declared);
      for (const token of xml.slice(pos.contentStart, pos.contentEnd).trim().split(/\s+/)) {
        if (token.length === 0) continue;
        const v = Number(token);
        if (!Number.isFinite(v)) return null;
        values.push(v);
      }
    }
  }
  if (values.length === 0 || values.length % dim !== 0) return null;
  const ring = [];
  for (let i = 0; i < values.length; i += dim) {
    // Ordre (latitude, longitude, hauteur) → (lon, lat, alt).
    ring.push([values[i + 1], values[i], dim >= 3 ? values[i + 2] : 0]);
  }
  return ring.length >= 4 ? ring : null;
}

/** Tous les gml:Polygon d'un intervalle, anneaux extérieur + intérieurs. */
function readPolygons(xml, gml, from, to, defaultDim) {
  const polygons = [];
  for (const poly of eachElement(xml, `${gml}:Polygon`, from, to)) {
    const ext = firstElement(xml, `${gml}:exterior`, poly.contentStart, poly.contentEnd);
    if (!ext) continue;
    const exterior = readRing(xml, gml, ext.contentStart, ext.contentEnd, defaultDim);
    if (!exterior) continue;
    const interiors = [];
    for (const int of eachElement(xml, `${gml}:interior`, poly.contentStart, poly.contentEnd)) {
      const ring = readRing(xml, gml, int.contentStart, int.contentEnd, defaultDim);
      if (ring) interiors.push(ring);
    }
    polygons.push({ exterior, interiors });
  }
  return polygons;
}

/** Ordre de préférence des sources de géométrie dans un bâtiment. */
const LOD_SOURCES = [
  { element: 'lod1Solid', lod: 1 },
  { element: 'lod1MultiSurface', lod: 1 },
  { element: 'boundedBy', lod: 2 },
  { element: 'lod2MultiSurface', lod: 2 },
  { element: 'lod2Solid', lod: 2 },
];

/**
 * Analyse un bâtiment déjà ISOLÉ dans sa propre chaîne.
 *
 * Travailler sur une tranche est indispensable : `String.indexOf` ne sait pas
 * s'arrêter à une borne, donc chercher un élément absent dans un fichier de
 * 50 Mo le reparcourt en entier — une fois par bâtiment et par LOD candidat.
 * Découper une fois ramène le coût de quadratique à linéaire.
 */
function readOneBuilding(chunk, ns, tag, defaultDim) {
  const { bldg, gml } = ns;
  const id = attr(tag, `${gml}:id`) ?? attr(tag, 'gml:id') ?? null;
  const heightText = textOf(chunk, `${bldg}:measuredHeight`, 0, chunk.length);
  const measuredHeight = heightText === null ? null : Number(heightText);

  let polygons = [];
  let lod = 0;
  for (const src of LOD_SOURCES) {
    const qname = `${bldg}:${src.element}`;
    const found = [];
    for (const el of eachElement(chunk, qname, 0, chunk.length)) {
      found.push(...readPolygons(chunk, gml, el.contentStart, el.contentEnd, defaultDim));
    }
    if (found.length > 0) {
      polygons = found;
      lod = src.lod;
      break;
    }
  }

  return {
    id,
    measuredHeight: Number.isFinite(measuredHeight) ? measuredHeight : null,
    class: textOf(chunk, `${bldg}:class`, 0, chunk.length),
    usage: textOf(chunk, `${bldg}:usage`, 0, chunk.length),
    lod,
    polygons,
  };
}

/**
 * Analyse un CityGML et renvoie `{ srs, buildings, stats }`.
 * `buildings[].polygons[].exterior` est une liste de `[lon, lat, alt]`.
 */
export function parseCityGmlBuildings(xml, { sourcePath = '<mémoire>' } = {}) {
  const ns = readNamespacePrefixes(xml);
  const srs = readSrs(xml);
  const defaultDim = 3;

  const buildings = [];
  let withoutGeometry = 0;
  let parts = 0;

  for (const el of eachElement(xml, `${ns.bldg}:Building`)) {
    const full = xml.slice(el.contentStart, el.contentEnd);

    // bldg:BuildingPart : géométrie propre, rattachée au bâtiment porteur.
    // Les tranches des parties sont RETIRÉES du corps du bâtiment avant de
    // chercher son LOD, sinon la géométrie d'une partie serait comptée deux
    // fois (une fois comme LOD du parent, une fois comme partie).
    const partChunks = [];
    let trimmed = '';
    let cursor = 0;
    for (const partEl of eachElement(full, `${ns.bldg}:BuildingPart`)) {
      partChunks.push({
        tag: partEl.tag,
        body: full.slice(partEl.contentStart, partEl.contentEnd),
      });
      trimmed += full.slice(cursor, full.indexOf(partEl.tag, cursor));
      cursor = partEl.end;
    }
    trimmed += full.slice(cursor);

    const main = readOneBuilding(trimmed, ns, el.tag, defaultDim);

    for (const part of partChunks) {
      const parsed = readOneBuilding(part.body, ns, part.tag, defaultDim);
      if (parsed.polygons.length > 0) {
        parts++;
        main.polygons.push(...parsed.polygons);
        if (main.lod === 0) main.lod = parsed.lod;
        if (main.measuredHeight === null) main.measuredHeight = parsed.measuredHeight;
      }
    }

    if (main.polygons.length === 0) {
      withoutGeometry++;
      continue;
    }
    buildings.push(main);
  }

  if (buildings.length === 0 && withoutGeometry === 0) {
    throw new PipelineError(
      `Aucun bldg:Building trouvé dans ${sourcePath}.`,
      `Préfixes détectés : bldg="${ns.bldg}", gml="${ns.gml}". ` +
        "Si le fichier utilise des espaces de noms par défaut (sans préfixe), le lecteur intégré ne sait pas le lire : passez par le convertisseur externe.",
    );
  }

  return {
    srs,
    buildings,
    stats: {
      detected: buildings.length + withoutGeometry,
      kept: buildings.length,
      withoutGeometry,
      buildingParts: parts,
    },
  };
}
