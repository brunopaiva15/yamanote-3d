// Étape 2 — CityGML → géométrie exploitable, restreinte au corridor.
//
// TROIS MOTEURS DE CONVERSION
// ---------------------------
//
// `nusamai` — PLATEAU GIS Converter, l'outil officiel (MLIT / MIERUNE, MIT).
//   C'est un binaire Rust qui possède une VRAIE interface en ligne de commande,
//   vérifiée sur le dépôt officiel :
//       nusamai <fichiers.gml…> --sink <format> --output <chemin> [--epsg N]
//   (source : Project-PLATEAU/PLATEAU-GIS-Converter, nusamai/src/main.rs, et
//    README §7 « CLI のインストール手順 » qui publie une archive
//    nusamai-<version>-x86_64-unknown-linux-gnu.tar.gz).
//   On lui demande le sink `geojson` : il sort des MultiPolygon 3D, ce qui
//   suffit à ce prototype et évite de dépendre de son sink glTF.
//
// `custom` — n'importe quel autre convertisseur, décrit par un gabarit de
//   commande dans PLATEAU_CONVERTER_CMD, avec les jetons {input} {output}
//   {epsg}. Prévu pour ogr2ogr, citygml-tools ou un script maison, sans que ce
//   dépôt ait à deviner leurs options.
//
// `builtin` — lecteur CityGML intégré (lib/citygml.mjs). Il lit réellement le
//   profil bldg LOD1/LOD2 de PLATEAU, mais IGNORE LES TEXTURES et les
//   apparences. Voir l'en-tête de lib/citygml.mjs pour la liste exacte de ses
//   limites. C'est le moteur par défaut lorsque aucun outil externe n'est
//   installé ; ce n'est pas un substitut complet.
//
// Sortie : work/plateau/converted/<nom>.buildings.json — bâtiments déjà
// restreints au corridor, en coordonnées projetées (est, nord, hauteur).

import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { PLATEAU_CONFIG, stageInputs } from './config.mjs';
import { ensureDirs, fingerprintFile, hashValue, reusable, writeMarker } from './lib/cache.mjs';
import { PipelineError, createReporter, humanBytes, runMain } from './lib/log.mjs';
import { isEntryPoint, parseArgs } from './lib/args.mjs';
import { expandCommandTemplate, quote, runTool, whichTool } from './lib/run.mjs';
import { parseCityGmlBuildings } from './lib/citygml.mjs';
import { buildRoute, locateOnRoute, readLineString } from './lib/route.mjs';
import { ensureSources } from './download.mjs';

const FLAGS = ['dryRun', 'force', 'yes'];
const OPTIONS = ['source', 'url', 'zip', 'dir', 'dataset', 'maxMb', 'converter'];

const NUSAMAI_INSTALL_HINT =
  "PLATEAU GIS Converter introuvable.\n" +
  "  Installez-le ou définissez PLATEAU_CONVERTER_PATH.\n" +
  '  Linux x86_64 : téléchargez nusamai-<version>-x86_64-unknown-linux-gnu.tar.gz depuis\n' +
  '    https://github.com/MIERUNE/plateau-gis-converter/releases\n' +
  '    tar -xzf nusamai-<version>-x86_64-unknown-linux-gnu.tar.gz\n' +
  '    sudo install -m 755 nusamai /usr/local/bin/nusamai\n' +
  '  macOS (Apple Silicon) : nusamai-<version>-aarch64-apple-darwin.tar.gz\n' +
  '  Ou passez --converter builtin pour utiliser le lecteur CityGML intégré\n' +
  '  (LOD1/LOD2 sans textures — voir docs/PLATEAU_PIPELINE.md).';

/** Localise le convertisseur externe demandé, ou explique comment l'installer. */
export function detectConverter(kind) {
  if (kind === 'custom' || (kind === 'auto' && process.env.PLATEAU_CONVERTER_CMD)) {
    const template = process.env.PLATEAU_CONVERTER_CMD;
    if (!template) {
      throw new PipelineError(
        'PLATEAU_CONVERTER_CMD non défini alors que --converter custom est demandé.',
        'Exemple : PLATEAU_CONVERTER_CMD="ogr2ogr -f GeoJSON {output} {input}"',
      );
    }
    return { kind: 'custom', template };
  }

  const explicit = process.env.PLATEAU_CONVERTER_PATH;
  const found = explicit ? whichTool(explicit) : whichTool('nusamai');
  if (found) return { kind: 'nusamai', path: found };
  if (explicit) {
    throw new PipelineError(
      `PLATEAU_CONVERTER_PATH pointe vers « ${explicit} », qui n'est pas un exécutable.`,
      NUSAMAI_INSTALL_HINT,
    );
  }
  if (kind === 'nusamai') throw new PipelineError(NUSAMAI_INSTALL_HINT);
  return null;
}

/** Version de l'outil externe (pour le rapport de build). */
export async function converterVersion(converter) {
  if (!converter || converter.kind !== 'nusamai') return null;
  const res = await runTool(converter.path, ['--version'], { allowFail: true });
  return (res.stdout + res.stderr).trim().split('\n')[0] || null;
}

/**
 * Détecte l'ordre des axes d'une coordonnée GeoJSON. Les convertisseurs ne
 * s'accordent pas : RFC 7946 impose (lon, lat) mais un outil configuré sur un
 * CRS japonais peut sortir (lat, lon). Plutôt que de parier, on regarde dans
 * quelle plage tombent les valeurs — sans ambiguïté au Japon
 * (lat 24…46, lon 122…154).
 */
export function detectAxisOrder(sampleCoord) {
  const [a, b] = sampleCoord;
  const looksLat = (v) => v >= 20 && v <= 50;
  const looksLon = (v) => v >= 120 && v <= 155;
  if (looksLon(a) && looksLat(b)) return 'lon,lat';
  if (looksLat(a) && looksLon(b)) return 'lat,lon';
  throw new PipelineError(
    `Coordonnées hors du Japon dans la sortie du convertisseur : [${a}, ${b}].`,
    "La projection géographique n'a pas pu être déterminée : vérifiez l'option --epsg du convertisseur.",
  );
}

/** Lit une sortie GeoJSON de convertisseur → bâtiments { id, height, polygons }. */
export function readConvertedGeoJson(text, sourceLabel) {
  const data = JSON.parse(text);
  const features = data.type === 'FeatureCollection' ? data.features : [data];
  if (!features?.length) {
    throw new PipelineError(`Le convertisseur n'a produit aucune entité pour ${sourceLabel}.`);
  }
  let axis = null;
  const buildings = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const polys =
      g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : null;
    if (!polys) continue;
    if (!axis) {
      const first = polys[0]?.[0]?.[0];
      if (!first) continue;
      axis = detectAxisOrder(first);
    }
    const polygons = [];
    for (const rings of polys) {
      if (!rings.length) continue;
      const conv = (ring) =>
        ring.map((c) =>
          axis === 'lon,lat' ? [c[0], c[1], c[2] ?? 0] : [c[1], c[0], c[2] ?? 0],
        );
      polygons.push({ exterior: conv(rings[0]), interiors: rings.slice(1).map(conv) });
    }
    if (polygons.length === 0) continue;
    const props = f.properties ?? {};
    buildings.push({
      id: f.id ?? props.gml_id ?? props['gml:id'] ?? props.id ?? null,
      measuredHeight: Number(props.measuredHeight ?? props.bldg_measuredHeight ?? NaN) || null,
      class: props.class ?? null,
      usage: props.usage ?? null,
      lod: 0,
      polygons,
    });
  }
  if (buildings.length === 0) {
    throw new PipelineError(
      `Aucune surface exploitable dans la sortie du convertisseur pour ${sourceLabel}.`,
      'Le sink choisi produit-il bien des Polygon / MultiPolygon 3D ?',
    );
  }
  return { buildings, axis };
}

async function convertWithExternal(converter, gmlPath, reporter) {
  const dir = mkdtempSync(join(tmpdir(), 'plateau-convert-'));
  const out = join(dir, `${basename(gmlPath, '.gml')}.geojson`);
  try {
    let command;
    let args;
    if (converter.kind === 'nusamai') {
      command = converter.path;
      // Options vérifiées dans nusamai/src/main.rs : file_patterns positionnels,
      // --sink (identifiant du sink, ici « geojson »), --output.
      args = [gmlPath, '--sink', 'geojson', '--output', out];
    } else {
      ({ command, args } = expandCommandTemplate(converter.template, {
        input: gmlPath,
        output: out,
        epsg: PLATEAU_CONFIG.crs.sourceEpsg,
      }));
    }
    reporter.step(`${basename(gmlPath)} → ${command} ${quote(args)}`);
    await runTool(command, args, { label: 'Convertisseur CityGML', timeoutMs: 30 * 60_000 });
    if (!existsSync(out)) {
      throw new PipelineError(
        `Le convertisseur s'est terminé sans erreur mais n'a produit aucun fichier.`,
        `Attendu : ${out}`,
      );
    }
    return readConvertedGeoJson(readFileSync(out, 'utf8'), basename(gmlPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function convertWithBuiltin(gmlPath) {
  const xml = readFileSync(gmlPath, 'utf8');
  const parsed = parseCityGmlBuildings(xml, { sourcePath: gmlPath });
  return { buildings: parsed.buildings, srs: parsed.srs, stats: parsed.stats };
}

/**
 * Restreint au corridor et projette. Un bâtiment est conservé si SON POINT LE
 * PLUS PROCHE de l'axe est dans le corridor — pas son centre : une barre de
 * 60 m à cheval sur la limite reste visible depuis le train.
 */
function selectAndProject(buildings, route, halfWidth) {
  const kept = [];
  let dropped = 0;
  let degenerate = 0;
  for (const b of buildings) {
    const polygons = [];
    let minDistance = Infinity;
    let atS = 0;
    let minUp = Infinity;
    let maxUp = -Infinity;
    for (const poly of b.polygons) {
      const project = (ring) =>
        ring.map(([lon, lat, alt]) => {
          const p = route.projector.forward(lon, lat);
          const loc = locateOnRoute(route, p.east, p.north);
          if (loc.distance < minDistance) {
            minDistance = loc.distance;
            atS = loc.s;
          }
          if (alt < minUp) minUp = alt;
          if (alt > maxUp) maxUp = alt;
          return [p.east, p.north, alt];
        });
      const exterior = project(poly.exterior);
      if (exterior.length < 4) {
        degenerate++;
        continue;
      }
      polygons.push({ exterior, interiors: (poly.interiors ?? []).map(project) });
    }
    if (polygons.length === 0) {
      degenerate++;
      continue;
    }
    if (minDistance > halfWidth) {
      dropped++;
      continue;
    }
    kept.push({
      id: b.id,
      measuredHeight: b.measuredHeight,
      class: b.class ?? null,
      usage: b.usage ?? null,
      lod: b.lod ?? 0,
      distance: Math.round(minDistance * 100) / 100,
      s: Math.round(atS * 100) / 100,
      minUp: Math.round(minUp * 1000) / 1000,
      maxUp: Math.round(maxUp * 1000) / 1000,
      polygons,
    });
  }
  return { kept, dropped, degenerate };
}

export async function convertAll(args, reporter) {
  const sources = await ensureSources(args, reporter);
  const converterKind = args.converter ?? process.env.PLATEAU_CONVERTER ?? 'auto';
  if (!['auto', 'builtin', 'nusamai', 'custom'].includes(converterKind)) {
    throw new PipelineError(
      `Convertisseur inconnu : « ${converterKind} ».`,
      'Valeurs acceptées : auto, builtin, nusamai, custom.',
    );
  }
  const converter = converterKind === 'builtin' ? null : detectConverter(converterKind);
  const engine = converter ? converter.kind : 'builtin';
  const version = await converterVersion(converter);

  if (converterKind === 'auto' && !converter) {
    reporter.warn(
      'Aucun convertisseur externe détecté : repli sur le lecteur CityGML intégré ' +
        '(LOD1/LOD2 géométrique, SANS textures ni apparences).',
    );
    reporter.warn(NUSAMAI_INSTALL_HINT.split('\n').slice(1).join('\n'));
  } else {
    reporter.info(`Convertisseur : ${engine}${version ? ` (${version})` : ''}`);
  }

  const inputHash = hashValue({
    ...stageInputs('convert'),
    engine,
    version,
    sources: sources.files.map((f) => ({ f: basename(f), h: fingerprintFile(f) })),
  });

  if (args.dryRun) {
    reporter.info(`[dry-run] moteur de conversion : ${engine}`);
    reporter.info(`[dry-run] ${sources.files.length} fichier(s) à convertir`);
    for (const f of sources.files) {
      reporter.info(`[dry-run]   ${f} → ${join(PLATEAU_CONFIG.paths.converted, `${basename(f, '.gml')}.buildings.json`)}`);
    }
    return { dryRun: true, engine, version, inputHash, outputs: [] };
  }

  const cached = reusable('convert', inputHash, { force: args.force });
  if (cached) {
    reporter.info(`Étape convert réutilisée (${cached.outputs.length} fichier(s)).`);
    return { ...cached, engine, version, inputHash, reused: true };
  }

  if (sources.files.length === 0) {
    throw new PipelineError(
      'Aucune donnée PLATEAU trouvée : la liste de fichiers CityGML est vide.',
      'Lancez `npm run world:download:prototype` (ou vérifiez --zip / --url).',
    );
  }

  const geojsonPath = join(PLATEAU_CONFIG.paths.geo, `${PLATEAU_CONFIG.prototype.name}.geojson`);
  const line = readLineString(geojsonPath);
  const route = buildRoute(line.coordinates, {
    sampleMeters: PLATEAU_CONFIG.prototype.routeSampleMeters,
  });

  ensureDirs(PLATEAU_CONFIG.paths.converted);
  const outputs = [];
  const totals = { analyzed: 0, detected: 0, kept: 0, droppedFar: 0, degenerate: 0, bytesIn: 0 };

  for (const gml of sources.files) {
    totals.analyzed++;
    totals.bytesIn += existsSync(gml) ? readFileSync(gml).length : 0;
    const result = converter
      ? await convertWithExternal(converter, gml, reporter)
      : convertWithBuiltin(gml);
    totals.detected += result.stats?.detected ?? result.buildings.length;

    const { kept, dropped, degenerate } = selectAndProject(
      result.buildings,
      route,
      PLATEAU_CONFIG.prototype.corridorMeters,
    );
    totals.kept += kept.length;
    totals.droppedFar += dropped;
    totals.degenerate += degenerate;

    const out = join(PLATEAU_CONFIG.paths.converted, `${basename(gml, '.gml')}.buildings.json`);
    writeFileSync(
      out,
      JSON.stringify({
        source: gml,
        engine,
        epsg: route.epsg,
        srs: result.srs ?? null,
        corridorMeters: PLATEAU_CONFIG.prototype.corridorMeters,
        buildings: kept,
      }),
    );
    outputs.push(out);
    reporter.step(
      `${basename(gml)} : ${kept.length} conservé(s) / ${dropped} hors corridor` +
        `${degenerate ? ` / ${degenerate} dégénéré(s)` : ''} → ${basename(out)} ` +
        `(${humanBytes(readFileSync(out).length)})`,
    );
  }

  if (totals.kept === 0) {
    throw new PipelineError(
      `Aucun bâtiment n'intersecte le corridor de ±${PLATEAU_CONFIG.prototype.corridorMeters} m.`,
      `${totals.detected} bâtiment(s) analysé(s) : le jeu de données couvre-t-il bien Toshima-ku ? ` +
        'Ou élargissez le corridor avec PLATEAU_CORRIDOR_M.',
    );
  }

  writeMarker('convert', { inputHash, outputs, extra: { engine, version, totals } });
  reporter.info(
    `${totals.kept} bâtiment(s) dans le corridor sur ${totals.detected} détecté(s) ` +
      `(${totals.droppedFar} écartés, ${totals.degenerate} sans géométrie utilisable).`,
  );
  return { outputs, engine, version, inputHash, totals };
}

if (isEntryPoint(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs(process.argv.slice(2), { flags: FLAGS, options: OPTIONS });
    await convertAll(args, createReporter('convert'));
  });
}
