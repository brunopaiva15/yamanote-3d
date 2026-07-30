// Import d'un pack ANIMALIER (Quaternius - Ultimate Animated Animals, …) vers
// public/models/animals/ : extraction (zip/dossier), filtrage des espèces
// qu'on promène vraiment en laisse, optimisation (dedup/prune/resample +
// compression meshopt, décodée nativement par drei), mesures, puis génération
// de public/models/animals/manifest.json consommé par le jeu.
//
// Le pendant de models-import.mjs pour les personnages, avec une différence de
// fond : un animal n'est pas normalisé à une taille unique. Chaque espèce
// reçoit sa hauteur RÉELLE (un corgi ne fait pas la taille d'un husky), devinée
// depuis le nom de fichier et corrigeable dans le manifeste.
//
// Usage :
//   node scripts/animals-import.mjs <pack.zip | dossier | fichier.glb> [...]
//        [--out <dossier>]     défaut : public/models/animals
//        [--max <n>]           nb max de races (défaut 4)
//        [--source "<label>"] [--license "<label>"]
//        [--all]               garder toutes les espèces, pas seulement les chiens
//
// Exemple :
//   npm run animals:import -- ~/Téléchargements/AnimatedAnimals.zip
// Puis vérifier « height » (mètres) dans public/models/animals/manifest.json.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { makeIO, collectModelFiles, describeDocument, variantIdFromPath } from './gltf-utils.mjs';

// --- Arguments ---
const args = process.argv.slice(2);
const inputs = [];
let outDir = 'public/models/animals';
let maxVariants = 4;
let sourceLabel = '';
let licenseLabel = 'CC0 1.0 (à vérifier selon le pack)';
let keepAll = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') outDir = args[++i];
  else if (a === '--max') maxVariants = parseInt(args[++i], 10);
  else if (a === '--source') sourceLabel = args[++i];
  else if (a === '--license') licenseLabel = args[++i];
  else if (a === '--all') keepAll = true;
  else inputs.push(a);
}
if (inputs.length === 0) {
  console.error('Usage : node scripts/animals-import.mjs <pack.zip|dossier|fichier> [...] [--out public/models/animals] [--max 4] [--all]');
  process.exit(1);
}

// --- Espèces promenables et leur taille réelle -----------------------------
//
// Hauteur TOTALE du modèle debout (oreilles comprises), en mètres - c'est ce
// que mesure la boîte englobante du GLB, et donc ce que le jeu normalise.
// Un quai de la Yamanote se traverse avec un shiba ou un corgi ; le loup et le
// mouton sont là pour --all, où l'on assume ce qu'on fait.
const BREEDS = [
  [/shiba|akita|inu/i, 0.46],
  [/corgi/i, 0.34],
  [/husky|malamute/i, 0.62],
  [/retriever|labrador|golden/i, 0.64],
  [/shepherd|collie|doberman|rottweiler/i, 0.68],
  [/poodle|spaniel|beagle|terrier|hound/i, 0.44],
  [/pug|chihuahua|dachshund|puppy/i, 0.28],
  [/bulldog/i, 0.38],
  [/wolf/i, 0.78],
  [/^dog|_dog|dog$|dog_/i, 0.55],
];
const OTHER_ANIMALS = [
  [/cat|kitten/i, 0.3],
  [/fox/i, 0.42],
  [/hare|rabbit|bunny/i, 0.26],
  [/sheep|goat/i, 0.75],
  [/pig|boar/i, 0.7],
  [/deer|alpaca|llama/i, 1.1],
  [/horse|donkey|cow|bull/i, 1.55],
  [/chicken|duck|penguin/i, 0.4],
];

function guessBreed(id) {
  for (const [re, height] of BREEDS) if (re.test(id)) return { height, walkable: true };
  for (const [re, height] of OTHER_ANIMALS) if (re.test(id)) return { height, walkable: false };
  return { height: 0.5, walkable: false };
}

// --- Résolution des clips (miroir de src/three/characters/animals.ts) ------

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

function animalClips(names) {
  return {
    idle: findClip(names, /idle/i, /(sit|sleep|lay|lie|attack|eat|swim|death|clicked)/i, /^idle$/i),
    walk: findClip(names, /walk/i, /(back|left|right|strafe|swim)/i, /^walk(ing)?$/i),
    run: findClip(names, /(run|gallop|trot)/i, /(swim|attack)/i, /^run(ning)?$/i),
    sniff: findClip(names, /(eat|graze|feed|sniff|smell|bite)/i, /(attack|death)/i, /^eating$/i),
    sit: findClip(names, /(sit|lay|lie|rest)/i, /(stand|up|down_to|attack)/i, /^sit(ting)?$/i),
  };
}

// --- Import ---
const io = await makeIO();
const files = collectModelFiles(inputs);
console.log(`${files.length} fichier(s) .glb/.gltf trouvé(s).`);
const entries = [];
const skipped = [];

for (const file of files) {
  if (entries.length >= maxVariants) break;
  const id = variantIdFromPath(file);
  const breed = guessBreed(id);
  if (!keepAll && !breed.walkable) {
    skipped.push(`${id} (on ne promène pas ça sur un quai - relancer avec --all pour l'inclure)`);
    continue;
  }
  let doc;
  try {
    doc = await io.read(file);
  } catch (err) {
    skipped.push(`${id} (illisible : ${err.message})`);
    continue;
  }
  const d = describeDocument(doc);
  if (!d.skinned) {
    skipped.push(`${id} (pas de squelette)`);
    continue;
  }
  const clips = animalClips(d.clips);
  if (!clips.idle && !clips.walk) {
    skipped.push(`${id} (aucun clip Idle/Walk exploitable)`);
    continue;
  }
  if (d.rawHeight <= 0) {
    skipped.push(`${id} (gabarit vide)`);
    continue;
  }

  await doc.transform(dedup(), prune(), resample());
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  const outName = `${id.toLowerCase()}.glb`;
  mkdirSync(outDir, { recursive: true });
  await io.write(join(outDir, outName), doc);

  entries.push({ id, file: outName, height: breed.height });
  const missing = ['run', 'sniff', 'sit'].filter((k) => !clips[k]);
  console.log(
    `✓ ${outName}  h=${breed.height} m  tris=${d.tris}  idle=${clips.idle ?? '∅'}  walk=${clips.walk ?? '∅'}` +
      (missing.length > 0 ? `  (sans ${missing.join('/')} : repli sur idle/walk)` : ''),
  );
}

if (entries.length === 0) {
  console.error('\nAucune race importée.');
  for (const s of skipped) console.error(`  écarté : ${s}`);
  process.exit(1);
}

const manifest = {
  version: 1,
  source: sourceLabel || inputs.join(', '),
  license: licenseLabel,
  variants: entries,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const licensePath = join(outDir, 'LICENSE.md');
if (!existsSync(licensePath)) {
  writeFileSync(
    licensePath,
    `# Modèles d'animaux\n\n- Source : ${manifest.source}\n- Licence : ${manifest.license}\n\nLes packs Quaternius (https://quaternius.com) sont publiés en CC0 1.0 :\nutilisation libre, y compris commerciale, sans attribution requise. Vérifier\nla licence si un autre pack est importé.\n`,
  );
}

console.log(`\n${entries.length} race(s) → ${resolve(outDir)}/manifest.json`);
if (skipped.length > 0) {
  console.log(`écartés (${skipped.length}) :`);
  for (const s of skipped) console.log(`  - ${s}`);
}
console.log('\nÉtapes suivantes :');
console.log('  1. Vérifier « height » (mètres, oreilles comprises) dans animals/manifest.json');
console.log('  2. npm run dev → un quai sur cinq environ voit passer un chien');
console.log('  3. Committer public/models/animals/ (GLB + manifest.json + LICENSE.md)');
