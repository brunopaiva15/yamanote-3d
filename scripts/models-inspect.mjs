// Inspection de GLB/glTF : squelette, clips, matériaux, hauteur, triangles -
// pour vérifier ce qu'un pack de personnages contient et comment la détection
// floue (os/clips) le comprend, avant import.
//
// Deux modes supplémentaires servent aux modèles de RÉFÉRENCE (maquettes de
// wagon utilisées comme mètre-étalon, jamais embarquées dans le jeu) :
//
//   --extract <nœud> --out <fichier.glb>   isole un sous-arbre dans son propre
//                                          GLB, transformation monde conservée
//   --measure [--body-width <m>|--scale <f>]
//                                          cotes en mètres : histogramme des
//                                          hauteurs au-dessus du plancher et
//                                          largeurs par tranche
//
// Usage :
//   node scripts/models-inspect.mjs <fichier.glb | dossier | pack.zip> [...]
//   node scripts/models-inspect.mjs ref.gltf --extract e235y_m_middle_1155 \
//        --out public/models/raw/e235-ref-module.glb
//   node scripts/models-inspect.mjs public/models/raw/e235-ref-module.glb --measure

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dedup, prune } from '@gltf-transform/functions';
import { makeIO, collectModelFiles, describeDocument } from './gltf-utils.mjs';

// --- Arguments ---
const argv = process.argv.slice(2);
const inputs = [];
let extractName = '';
let outFile = '';
let measure = false;
let bodyWidth = 2.95; // largeur de caisse d'un E235, en mètres
let scaleOverride = 0;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--extract') extractName = argv[++i];
  else if (a === '--out') outFile = argv[++i];
  else if (a === '--measure') measure = true;
  else if (a === '--body-width') bodyWidth = parseFloat(argv[++i]);
  else if (a === '--scale') scaleOverride = parseFloat(argv[++i]);
  else inputs.push(a);
}
if (inputs.length === 0) {
  console.error('Usage : node scripts/models-inspect.mjs <fichier.glb | dossier | pack.zip> [...]');
  console.error('        [--extract <nœud> --out <fichier.glb>] [--measure] [--body-width <m> | --scale <f>]');
  process.exit(1);
}
if (extractName && !outFile) {
  console.error('--extract exige --out <fichier.glb>');
  process.exit(1);
}

const io = await makeIO();
const files = collectModelFiles(inputs);
if (files.length === 0) {
  console.error('Aucun .glb/.gltf trouvé dans les entrées données.');
  process.exit(1);
}

// --- Géométrie : sommets d'un document, en coordonnées monde ---
function worldPositions(doc) {
  const out = [];
  const el = [0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        out.push([
          m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12],
          m[1] * el[0] + m[5] * el[1] + m[9] * el[2] + m[13],
          m[2] * el[0] + m[6] * el[1] + m[10] * el[2] + m[14],
        ]);
      }
    }
  }
  return out;
}

// min/max sur de gros tableaux : Math.min(...xs) explose la pile au-delà de
// ~100 000 sommets, une maquette de wagon en compte davantage.
function range(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// Le plancher est la tranche horizontale la plus dense de la moitié basse :
// sur une maquette de wagon c'est la tôle de plancher, pas le châssis.
function findFloor(ys) {
  const { min, max } = range(ys);
  const bins = 200;
  const hist = new Array(bins).fill(0);
  for (const y of ys) hist[Math.min(bins - 1, Math.floor(((y - min) / (max - min)) * bins))]++;
  let best = 0;
  let bestBin = 0;
  for (let i = 0; i < bins * 0.6; i++) {
    if (hist[i] > best) {
      best = hist[i];
      bestBin = i;
    }
  }
  return min + ((bestBin + 0.5) * (max - min)) / bins;
}

function reportMeasures(doc, label) {
  const pts = worldPositions(doc);
  if (pts.length === 0) {
    console.log('mesures : aucune géométrie.');
    return;
  }
  const ys = pts.map((p) => p[1]);
  const rx = range(pts.map((p) => p[0]));
  const ry = range(ys);
  const rz = range(pts.map((p) => p[2]));
  const width = rx.max - rx.min;
  const scale = scaleOverride || bodyWidth / width;
  const floor = findFloor(ys);
  const m = (y) => (y - floor) * scale;

  console.log(
    `\n--- mesures ${label} --- échelle ×${scale.toFixed(3)} ` +
      (scaleOverride ? '(imposée)' : `(largeur de caisse ${bodyWidth} m ÷ ${width.toFixed(3)})`),
  );
  console.log(
    `emprise : ${(width * scale).toFixed(2)} × ${((ry.max - ry.min) * scale).toFixed(2)} × ` +
      `${((rz.max - rz.min) * scale).toFixed(2)} m (l × h × L)`,
  );
  console.log(`plancher pris comme origine ; sommet à ${m(ry.max).toFixed(2)} m, base à ${m(ry.min).toFixed(2)} m`);

  // Histogramme des hauteurs au-dessus du plancher (pas 10 cm) : chaque pic est
  // un plan d'aménagement (assise, dossier, tsurikawa, porte-bagages, plafond).
  const bins = new Map();
  for (const p of pts) {
    const b = Math.round(m(p[1]) * 10) / 10;
    if (b < -0.6 || b > 4) continue;
    let e = bins.get(b);
    if (!e) bins.set(b, (e = { n: 0, xMax: 0 }));
    e.n++;
    e.xMax = Math.max(e.xMax, Math.abs(p[0] - (rx.min + width / 2)) * scale);
  }
  const rows = [...bins.entries()].sort((a, b) => a[0] - b[0]);
  const peak = Math.max(...rows.map(([, e]) => e.n));
  console.log('\n hauteur   demi-largeur   sommets');
  for (const [y, e] of rows) {
    if (e.n < peak * 0.04) continue;
    console.log(
      `  ${y.toFixed(1).padStart(5)} m   ${e.xMax.toFixed(2).padStart(6)} m   ` +
        `${'█'.repeat(Math.max(1, Math.round((e.n / peak) * 46)))} ${e.n}`,
    );
  }
}

// --- Extraction d'un sous-arbre dans son propre GLB ---
async function extract(doc, name, dest) {
  const root = doc.getRoot();
  const target = root.listNodes().find((n) => n.getName() === name);
  if (!target) {
    const named = root
      .listNodes()
      .filter((n) => n.getName() && n.listChildren().length > 8)
      .map((n) => `${n.getName()} (${n.listChildren().length} enfants)`);
    console.error(`Nœud « ${name} » introuvable. Candidats :`);
    for (const c of named.slice(0, 30)) console.error(`  - ${c}`);
    process.exit(1);
  }
  // La transformation monde est réappliquée après détachement, sinon le
  // sous-arbre repart à l'origine avec une échelle fausse.
  const scene = root.listScenes()[0];
  target.detach();
  for (const child of scene.listChildren()) scene.removeChild(child);
  scene.addChild(target);

  // La transformation monde n'est PAS réappliquée : sur cette maquette les
  // wagons sont posés en diagonale par un lacet porté par un ancêtre, ce qui
  // gonfle toutes les boîtes englobantes. Dans son repère propre le module est
  // déjà d'aplomb (Y vers le haut, longueur selon Z), on repart donc de
  // l'identité.
  target.setRotation([0, 0, 0, 1]).setScale([1, 1, 1]).setTranslation([0, 0, 0]);

  // Détacher de la scène ne suffit pas : les nœuds des autres sous-arbres
  // restent dans le document (ils se tiennent entre eux par leurs enfants) et
  // repartiraient dans le GLB. On dispose tout ce qui n'est plus atteignable.
  const keep = new Set();
  const stack = [target];
  while (stack.length > 0) {
    const n = stack.pop();
    if (keep.has(n)) continue;
    keep.add(n);
    for (const c of n.listChildren()) stack.push(c);
  }
  for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();

  // Mise à l'échelle du jeu : 1 unité = 1 mètre, plancher à y = 0, module
  // centré en X et Z. Un modèle de référence sert de calque par-dessus le
  // wagon procédural - il doit se charger sans facteur magique.
  const raw = worldPositions(doc);
  const rx0 = range(raw.map((p) => p[0]));
  const factor = bodyWidth / (rx0.max - rx0.min);
  target.setScale([factor, factor, factor]);
  const scaled = worldPositions(doc);
  const rx = range(scaled.map((p) => p[0]));
  const rz = range(scaled.map((p) => p[2]));
  const floor = findFloor(scaled.map((p) => p[1]));
  target.setTranslation([-(rx.min + rx.max) / 2, -floor, -(rz.min + rz.max) / 2]);

  // Pas de join() ici : sur les exports OpenSceneGraph, la fusion déplace les
  // maillages instanciés (mêmes Mesh réutilisés par plusieurs Node). On se
  // contente de retirer ce qui n'est plus référencé.
  await doc.transform(prune(), dedup());

  mkdirSync(dirname(dest), { recursive: true });
  await io.write(dest, doc);
  const d = describeDocument(doc);
  console.log(`extrait → ${dest}  (${d.tris} triangles, ${root.listMeshes().length} maillages)`);
}

for (const file of files) {
  console.log(`\n=== ${file} ===`);
  try {
    const doc = await io.read(file);
    if (extractName) {
      await extract(doc, extractName, outFile);
      if (measure) reportMeasures(doc, extractName);
      continue;
    }
    if (measure) {
      reportMeasures(doc, '');
      continue;
    }
    const d = describeDocument(doc);
    console.log(`riggé : ${d.skinned}  |  hauteur brute : ${d.rawHeight.toFixed(3)}  |  minY : ${d.minY.toFixed(3)}  |  triangles : ${d.tris}`);
    console.log(`os logiques trouvés : ${Object.keys(d.bones).length ? Object.entries(d.bones).map(([k, v]) => `${k}→${v}`).join(', ') : 'AUCUN'}`);
    console.log(`clips (${d.clips.length}) : ${d.clips.join(', ') || '(aucun)'}`);
    console.log(`clips logiques : sitIdle=${d.logicalClips.sitIdle ?? '∅'}  standIdle=${d.logicalClips.standIdle ?? '∅'}  walk=${d.logicalClips.walk ?? '∅'}`);
    console.log(`matériaux : ${d.materials.join(', ') || '(aucun)'}`);
  } catch (err) {
    console.log(`illisible : ${err.message}`);
  }
}
