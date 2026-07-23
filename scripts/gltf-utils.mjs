// Helpers partagés par models-import.mjs et models-inspect.mjs : lecture des
// GLB/glTF (gltf-transform), extraction de zips, détection floue des os et
// clips (mêmes conventions que src/three/characters/library.ts), mesures.

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { unzipSync } from 'fflate';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, basename } from 'node:path';

export async function makeIO() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

// Étend une liste d'entrées (zip, dossier ou fichier) en chemins de .glb/.gltf
// sur disque (les zips sont extraits dans un dossier temporaire).
export function collectModelFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const st = statSync(input);
    if (st.isDirectory()) {
      walk(input, files);
    } else if (extname(input).toLowerCase() === '.zip') {
      const dir = mkdtempSync(join(tmpdir(), 'models-import-'));
      const entries = unzipSync(new Uint8Array(readFileSync(input)));
      for (const [path, data] of Object.entries(entries)) {
        if (path.endsWith('/')) continue;
        const out = join(dir, path);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, data);
      }
      walk(dir, files);
    } else {
      files.push(input);
    }
  }
  return files.filter((f) => ['.glb', '.gltf'].includes(extname(f).toLowerCase()));
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
}

// --- Détection floue (dupliquée de src/three/characters/library.ts, côté Node) ---

export function normBoneName(name) {
  return name
    .toLowerCase()
    .replace(/^mixamorig[:_]?/, '')
    .replace(/^.*\|/, '')
    .replace(/[\s._-]/g, '');
}

const CENTER = { hips: ['hips', 'hip', 'pelvis'], spine: ['spine', 'spine0', 'spine1', 'torso', 'chest'], neck: ['neck'], head: ['head'] };
const SIDED = {
  upperArm: ['upperarm', 'armupper', 'uparm', 'arm', 'shoulder'],
  foreArm: ['forearm', 'lowerarm', 'armlower', 'elbow'],
  hand: ['hand', 'wrist'],
  upLeg: ['upleg', 'upperleg', 'legupper', 'thigh'],
  leg: ['lowerleg', 'leglower', 'shin', 'calf', 'knee', 'leg'],
  foot: ['foot', 'ankle'],
};

function splitSide(n) {
  if (n.startsWith('left')) return { side: 'L', base: n.slice(4) };
  if (n.startsWith('right')) return { side: 'R', base: n.slice(5) };
  if (n.endsWith('left')) return { side: 'L', base: n.slice(0, -4) };
  if (n.endsWith('right')) return { side: 'R', base: n.slice(0, -5) };
  if (n.endsWith('l') && n.length > 1) return { side: 'L', base: n.slice(0, -1) };
  if (n.endsWith('r') && n.length > 1) return { side: 'R', base: n.slice(0, -1) };
  return { side: '', base: n };
}

// Os logiques trouvés dans une liste de noms de joints.
export function resolveBoneNames(jointNames) {
  const map = {};
  const rank = {};
  for (const name of jointNames) {
    const { side, base } = splitSide(normBoneName(name));
    const assign = (key, score) => {
      if (rank[key] === undefined || score < rank[key]) {
        rank[key] = score;
        map[key] = name;
      }
    };
    if (side === '') {
      for (const [key, aliases] of Object.entries(CENTER)) {
        const i = aliases.indexOf(base);
        if (i >= 0) assign(key, i);
      }
    } else {
      for (const [key, aliases] of Object.entries(SIDED)) {
        const i = aliases.indexOf(base);
        if (i >= 0) assign(`${key}${side}`, i);
      }
    }
  }
  return map;
}

function findClip(names, include, exclude, prefer) {
  let candidates = names.filter((n) => include.test(n) && !(exclude && exclude.test(n)));
  if (candidates.length === 0) return null;
  if (prefer) {
    const preferred = candidates.filter((n) => prefer.test(n));
    if (preferred.length > 0) candidates = preferred;
  }
  candidates.sort((a, b) => a.length - b.length);
  return candidates[0];
}

export function resolveClipNames(names) {
  return {
    sitIdle: findClip(names, /sit/i, /(stand|down|up|exit|enter|floor|ground)/i, /(chair|idle|loop)/i),
    standIdle: findClip(names, /idle/i, /(sit|gun|sword|crouch|jump|combat|melee|ranged|hold|carry|2h|1h)/i, /^idle$/i),
    walk: findClip(names, /walk/i, /(back|left|right|strafe|crouch|jump|gun|sword|carry|melee|combat)/i, /^walk(ing)?$/i),
  };
}

// --- Mesures sur un document gltf-transform ---

export function describeDocument(doc) {
  const root = doc.getRoot();
  const skins = root.listSkins();
  const jointNames = skins.flatMap((s) => s.listJoints().map((j) => j.getName()));
  const clips = root.listAnimations().map((a) => a.getName());
  let minY = Infinity;
  let maxY = -Infinity;
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (pos) {
        const [, y0] = pos.getMinNormalized([]);
        const [, y1] = pos.getMaxNormalized([]);
        minY = Math.min(minY, y0);
        maxY = Math.max(maxY, y1);
      }
      const idx = prim.getIndices();
      tris += Math.round((idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3);
    }
  }
  const materials = root.listMaterials().map((m) => m.getName() || '(sans nom)');
  return {
    skinned: skins.length > 0,
    jointNames,
    bones: resolveBoneNames(jointNames),
    clips,
    logicalClips: resolveClipNames(clips),
    rawHeight: maxY > minY ? maxY - minY : 0,
    minY: minY === Infinity ? 0 : minY,
    tris,
    materials,
  };
}

// Nom de variante lisible depuis un chemin de fichier.
export function variantIdFromPath(path) {
  return basename(path)
    .replace(/\.(glb|gltf)$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
